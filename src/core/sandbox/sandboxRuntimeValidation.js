const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  cleanupPrivateTempDir,
  createOsSandboxedProcessLaunch,
  osSandboxStatus,
  prepareSeccompStdio,
  scriptWorkerAppReadOnlyPaths,
  scriptWorkerRuntimeReadOnlyPaths
} = require('./osSandbox');
const {
  runPostmanScriptIsolated,
  scriptWorkerEnv,
  scriptWorkerExecArgv,
  supportsNodePermissionFlags
} = require('./scriptSandbox');

const VALIDATION_STARTED_AT = Date.now();
const DEFAULT_SCRIPT_BOUNDARY_WORKER_TIMEOUT_MILLIS = 3_000;
const WINDOWS_SCRIPT_BOUNDARY_WORKER_TIMEOUT_MILLIS = 60_000;

async function validateSandboxRuntime(options = {}) {
  validationProgress('start');
  if (options.requireElectron !== false && !process.versions.electron) {
    throw new Error('Sandbox runtime validation must run inside the pinned Electron runtime.');
  }
  if (!supportsNodePermissionFlags()) {
    throw new Error('Pinned runtime does not support required Node permission flags.');
  }

  validationProgress('worker launch policy');
  validateWorkerLaunchPolicy(scriptWorkerExecArgv({ requireNodePermission: true }), scriptWorkerEnv());
  validationProgress('node permission model');
  validateNodePermissionModel();
  let skipOsSandboxFunctionalProbe = false;
  if (platformRequiresOsSandbox(process.platform)) {
    validationProgress('os sandbox status');
    const status = osSandboxStatus();
    if (status.supported) {
      validationProgress('os sandbox launch policy');
      validateOsSandboxLaunchPolicy();
      validationProgress('os sandbox boundary');
      validateOsSandboxBoundary();
      skipOsSandboxFunctionalProbe = true;
    } else {
      throw new Error([
        `${platformLabel(process.platform)} OS-level script sandboxing requires a functional ${platformBackendLabel(process.platform)} backend.`,
        status.probeFailure ? `Probe failure: ${status.probeFailure}` : ''
      ].filter(Boolean).join(' '));
    }
  }
  validationProgress('script boundary');
  await validateScriptBoundary({
    skipOsSandboxFunctionalProbe
  });
  validationProgress('complete');
}

function validationProgress(label) {
  if (process.env.POSTMETER_SANDBOX_VALIDATE_PROGRESS !== '1') {
    return;
  }
  console.error(`[sandbox-runtime] +${Date.now() - VALIDATION_STARTED_AT}ms ${label}`);
}

function validateWorkerLaunchPolicy(execArgv, env) {
  if (!execArgv.includes('--permission')) {
    throw new Error('Script worker execArgv is missing --permission.');
  }
  if (execArgv.some((value) => value === '--allow-child-process' || value.startsWith('--allow-child-process='))) {
    throw new Error('Script worker must not allow child-process access.');
  }
  const readFlags = execArgv.filter((value) => value.startsWith('--allow-fs-read='));
  if (readFlags.length !== 8) {
    throw new Error(`Script worker must allow exactly eight runtime files, found ${readFlags.length}.`);
  }
  if (readFlags.some((value) => value.includes(','))) {
    throw new Error('Script worker file-read allowlist must use one flag per file.');
  }
  const basenames = readFlags
    .map((value) => path.basename(value.slice('--allow-fs-read='.length)))
    .sort();
  assertDeepEqual(basenames, [
    'dynamicVariables.js',
    'postmanBuiltinPackages.js',
    'postmanSandboxBootcodeBundle.js',
    'sandboxPackageCache.js',
    'scriptRuntime.js',
    'scriptWorker.js',
    'variableScope.js',
    'visualizerHandlebarsBundle.js'
  ]);

  if (env.POSTMETER_SCRIPT_WORKER !== '1') {
    throw new Error('Script worker environment is missing POSTMETER_SCRIPT_WORKER.');
  }
  if (process.versions.electron && env.ELECTRON_RUN_AS_NODE !== '1') {
    throw new Error('Electron script workers must run with ELECTRON_RUN_AS_NODE=1.');
  }
  for (const denied of ['NODE_OPTIONS', 'PATH', 'HOME', 'USERPROFILE']) {
    if (env[denied] != null) {
      throw new Error(`Script worker environment leaked ${denied}.`);
    }
  }
}

function validateNodePermissionModel() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postmeter-sandbox-'));
  const forbiddenFile = path.join(tempDir, 'forbidden.txt');
  fs.writeFileSync(forbiddenFile, 'secret');
  try {
    expectPermissionProbeDenied('arbitrary file read', `
      const fs = require('node:fs');
      try {
        fs.readFileSync(process.env.POSTMETER_FORBIDDEN_READ, 'utf8');
        process.exit(2);
      } catch (error) {
        process.exit(error && error.code === 'ERR_ACCESS_DENIED' ? 0 : 1);
      }
    `, { POSTMETER_FORBIDDEN_READ: forbiddenFile });

    expectPermissionProbeDenied('child process spawn', `
      const { spawnSync } = require('node:child_process');
      try {
        spawnSync(process.execPath, ['--version']);
        process.exit(2);
      } catch (error) {
        process.exit(error && error.code === 'ERR_ACCESS_DENIED' ? 0 : 1);
      }
    `);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function validateOsSandboxLaunchPolicy() {
  const status = osSandboxStatus();
  if (!status.supported) {
    throw new Error(`${platformLabel(process.platform)} OS-level script sandboxing requires ${platformBackendLabel(process.platform)}, but no functional backend was found.`);
  }

  const launch = createOsSandboxedProcessLaunch({
    args: ['-e', 'process.exit(0)'],
    env: scriptWorkerEnv()
  });
  try {
    if (!launch.sandboxed || launch.backend !== status.backend) {
      throw new Error(`Required OS-level script sandbox launch did not select the ${status.backend} backend.`);
    }
    if (status.backend === 'windows-helper') {
      validateWindowsSandboxLaunchPolicy(launch);
      return;
    }
    if (status.backend === 'macos-seatbelt') {
      validateMacosSandboxLaunchPolicy(launch);
      return;
    }
    if (status.backend !== 'bubblewrap') {
      throw new Error(`Unsupported OS sandbox validation backend: ${status.backend}.`);
    }
    for (const requiredArg of ['--unshare-all', '--unshare-user', '--disable-userns', '--assert-userns-disabled', '--die-with-parent', '--new-session', '--clearenv']) {
      if (!launch.args.includes(requiredArg)) {
        throw new Error(`Bubblewrap script sandbox launch is missing ${requiredArg}.`);
      }
    }
    if (launch.args.includes('--share-net')) {
      throw new Error('Bubblewrap script sandbox launch must not share the host network namespace.');
    }
    if (!hasArgPair(launch.args, '--tmpfs', '/tmp') || !hasArgPair(launch.args, '--tmpfs', '/run')) {
      throw new Error('Bubblewrap script sandbox launch must provide private tmpfs mounts.');
    }
    if (!hasArgPair(launch.args, '--setenv', 'POSTMETER_SCRIPT_WORKER')) {
      throw new Error('Bubblewrap script sandbox launch must set the worker marker in the cleared environment.');
    }
    if (!hasArgPair(launch.args, '--cap-drop', 'ALL')) {
      throw new Error('Bubblewrap script sandbox launch must drop capabilities.');
    }
    if (status.seccompSupported) {
      if (!hasArgPair(launch.args, '--seccomp', String(status.seccompFilterFd))) {
        throw new Error('Bubblewrap script sandbox launch is missing the Linux seccomp syscall policy.');
      }
      if (!launch.seccompPolicy?.filter || launch.seccompPolicy.filter.length === 0) {
        throw new Error('Bubblewrap script sandbox launch has an empty seccomp syscall policy.');
      }
    }
  } finally {
    cleanupPrivateTempDir(launch.privateTempDir);
  }
}

function validateWindowsSandboxLaunchPolicy(launch) {
  if (!launch.command.toLowerCase().endsWith('postmeterwindowssandboxhelper.exe')) {
    throw new Error('Windows OS sandbox launch must use the release-owned AppContainer helper.');
  }
  if (!launch.privateTempDir || !hasArgPair(launch.args, '--temp', launch.privateTempDir)) {
    throw new Error('Windows OS sandbox launch must provide a private temp directory to the helper.');
  }
  if (!hasArgPair(launch.args, '--profile', 'PostMeter.ScriptWorkerSandbox')) {
    throw new Error('Windows OS sandbox launch must use the stable PostMeter AppContainer profile.');
  }
  if (launch.args.includes('--inherit-environment')) {
    throw new Error('Windows OS sandbox launch must not depend on inherited helper environment state.');
  }
  if (!hasArgPair(launch.args, '--env', 'POSTMETER_SCRIPT_WORKER=1')) {
    throw new Error('Windows OS sandbox launch must pass the worker marker through an explicit sanitized child environment block.');
  }
  if (!launch.args.some((value, index) => launch.args[index - 1] === '--env' && value.startsWith('TEMP='))) {
    throw new Error('Windows OS sandbox launch must pass private temp variables through an explicit child environment block.');
  }
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE']) {
    if (!hasArgPair(launch.args, '--env', `${key}=${launch.privateTempDir}`) || launch.env[key] !== launch.privateTempDir) {
      throw new Error(`Windows OS sandbox launch must map ${key} to the private temp directory.`);
    }
  }
  if (launch.env.POSTMETER_SCRIPT_WORKER !== '1') {
    throw new Error('Windows OS sandbox launch must pass the script-worker marker through the sanitized helper launcher environment.');
  }
  if (!launch.args.includes('--read-only')) {
    throw new Error('Windows OS sandbox launch must pass explicit read-only runtime/app paths to the helper.');
  }
  if (!launch.args.includes('--')) {
    throw new Error('Windows OS sandbox launch must delimit helper options from the child command.');
  }
  const childArgs = windowsSandboxChildArgs(launch);
  const isStdioWorkerLaunch = childArgs.includes('--postmeter-stdio-worker');
  const isFileWorkerLaunch = childArgs.includes('--postmeter-file-worker');
  if (launch.env.ELECTRON_RUN_AS_NODE === '1' && !isStdioWorkerLaunch && !childArgs.includes('--no-stdio-init')) {
    throw new Error('Windows Electron Node-mode sandbox probes must disable Electron stdio initialization.');
  }
  if (isStdioWorkerLaunch && childArgs.includes('--no-stdio-init')) {
    throw new Error('Windows stdio script worker launches must preserve Electron stdio initialization for the worker protocol.');
  }
  if (isFileWorkerLaunch) {
    if (!childArgs.includes('--no-stdio-init')) {
      throw new Error('Windows file-transport script worker launches must disable Electron stdio initialization.');
    }
    if (
      launch.env.POSTMETER_SCRIPT_WORKER_TRANSPORT_DIR !== launch.privateTempDir
      || !hasArgPair(launch.args, '--env', `POSTMETER_SCRIPT_WORKER_TRANSPORT_DIR=${launch.privateTempDir}`)
    ) {
      throw new Error('Windows file-transport script worker launches must pass the private transport directory through the sanitized environment.');
    }
    if (childArgs.includes('--permission')) {
      if (
        !childArgs.includes(`--allow-fs-read=${launch.privateTempDir}`)
        || !childArgs.includes(`--allow-fs-write=${launch.privateTempDir}`)
      ) {
        throw new Error('Windows file-transport script worker launches must grant Node permission access to the private transport directory.');
      }
    }
  }
  for (const denied of ['PATH', 'HOME']) {
    if (launch.env[denied] != null) {
      throw new Error(`Windows OS sandbox launch leaked ${denied}.`);
    }
  }
}

function validateMacosSandboxLaunchPolicy(launch) {
  const profileIndex = launch.args.indexOf('-p') + 1;
  const profile = profileIndex > 0 ? launch.args[profileIndex] : '';
  if (!profile) {
    throw new Error('macOS OS sandbox launch must pass a seatbelt profile.');
  }
  if (
    !launch.privateTempDir
    || launch.env.TMPDIR !== launch.privateTempDir
    || launch.env.HOME !== launch.privateTempDir
    || launch.env.CFFIXED_USER_HOME !== launch.privateTempDir
  ) {
    throw new Error('macOS OS sandbox launch must provide a private writable temp directory and CoreFoundation HOME.');
  }
  if (!profile.includes('(deny default)') || !profile.includes('(deny network*)')) {
    throw new Error('macOS seatbelt profile must deny by default and deny network access.');
  }
  const executablePath = launch.args[profileIndex + 1] || '';
  if (!profile.includes('(allow process-exec') || !profile.includes(executablePath)) {
    throw new Error('macOS seatbelt profile must allow process execution for the script worker executable.');
  }
  if (!profile.includes('(allow process-fork)')) {
    throw new Error('macOS seatbelt profile must allow runtime process forking while keeping process execution scoped.');
  }
  if (profile.includes('(allow process*)')) {
    throw new Error('macOS seatbelt profile must not allow broad process operations.');
  }
  if (!profile.includes('(allow ipc-posix*)')) {
    throw new Error('macOS seatbelt profile must allow POSIX shared memory needed by the Electron runtime.');
  }
  for (const required of ['(allow mach-register)', '(allow system-socket)', '(allow iokit-open)']) {
    if (!profile.includes(required)) {
      throw new Error(`macOS seatbelt profile is missing Electron runtime compatibility allowance ${required}.`);
    }
  }
  if (
    !profile.includes('(allow file-read-metadata')
    || !profile.includes('(allow file-map-executable')
    || !profile.includes('/Library/Keychains')
    || !profile.includes('/Library/Preferences')
    || !profile.includes('/System/Volumes/Preboot/Cryptexes/OS/usr/lib')
  ) {
    throw new Error('macOS seatbelt profile must allow parent metadata traversal, executable image mapping, and macOS cryptex/runtime/bootstrap reads.');
  }
  if (!profile.includes(launch.privateTempDir)) {
    throw new Error('macOS seatbelt profile must limit file writes to the private temp directory.');
  }
  for (const denied of ['PATH', 'USERPROFILE']) {
    if (launch.env[denied] != null) {
      throw new Error(`macOS OS sandbox launch leaked ${denied}.`);
    }
  }
}

function validateOsSandboxBoundary() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postmeter-os-sandbox-'));
  const homeTempDir = createSandboxProbeDirectory(os.homedir(), 'postmeter-os-sandbox-home-');
  const forbiddenFile = path.join(tempDir, 'forbidden.txt');
  const forbiddenHomeFile = path.join(homeTempDir, 'forbidden-home.txt');
  const forbiddenWriteFile = path.join(tempDir, 'forbidden-write.txt');
  fs.writeFileSync(forbiddenFile, 'secret');
  fs.writeFileSync(forbiddenHomeFile, 'secret');
  try {
    if (process.platform === 'win32') {
      validateWindowsOsSandboxBoundary({
        forbiddenFile,
        forbiddenHomeFile,
        forbiddenWriteFile
      });
      return;
    }

    validationProgress('os boundary: host filesystem read');
    expectOsSandboxProbeDenied('host filesystem read', `
      const fs = require('node:fs');
      try {
        fs.readFileSync(${JSON.stringify(forbiddenFile)}, 'utf8');
        process.exit(2);
      } catch (error) {
        if (isDeniedFilesystemError(error)) {
          process.exit(0);
        }
        console.error(error && (error.code || error.message) || 'read failed without an error object');
        process.exit(1);
      }
      function isDeniedFilesystemError(error) {
        return error && ['ENOENT', 'EACCES', 'EPERM', 'ERR_ACCESS_DENIED'].includes(error.code);
      }
    `);

    validationProgress('os boundary: home filesystem read');
    expectOsSandboxProbeDenied('home directory filesystem read', `
      const fs = require('node:fs');
      try {
        fs.readFileSync(${JSON.stringify(forbiddenHomeFile)}, 'utf8');
        process.exit(2);
      } catch (error) {
        if (isDeniedFilesystemError(error)) {
          process.exit(0);
        }
        console.error(error && (error.code || error.message) || 'read failed without an error object');
        process.exit(1);
      }
      function isDeniedFilesystemError(error) {
        return error && ['ENOENT', 'EACCES', 'EPERM', 'ERR_ACCESS_DENIED'].includes(error.code);
      }
    `);

    validationProgress('os boundary: host filesystem write');
    expectOsSandboxProbeDenied('host filesystem write', `
      const fs = require('node:fs');
      try {
        fs.writeFileSync(${JSON.stringify(forbiddenWriteFile)}, 'modified');
        process.exit(2);
      } catch (error) {
        if (error && ['ENOENT', 'EACCES', 'EPERM', 'ERR_ACCESS_DENIED'].includes(error.code)) {
          process.exit(0);
        }
        console.error(error && (error.code || error.message) || 'write failed without an error object');
        process.exit(1);
      }
    `);

    validationProgress('os boundary: host network access');
    expectOsSandboxProbeDenied('host network access', `
      const net = require('node:net');
      const socket = net.createConnection({ host: '1.1.1.1', port: 443, timeout: 500 });
      socket.on('connect', () => process.exit(2));
      socket.on('error', () => process.exit(0));
      socket.on('timeout', () => process.exit(0));
    `);

    validationProgress('os boundary: child process spawn');
    expectOsSandboxProbeDenied('child process spawn', `
      const { spawnSync } = require('node:child_process');
      try {
        const result = spawnSync(process.execPath, ['--version'], { timeout: 1000 });
        process.exit(result && result.status === 0 ? 2 : 0);
      } catch (_) {
        process.exit(0);
      }
    `, {
      execArgv: scriptWorkerExecArgv({ requireNodePermission: true })
    });

    validationProgress('os boundary: environment stripping');
    expectOsSandboxProbePass('environment stripping', `
      const leaked = ['PATH', 'POSTMETER_OS_SANDBOX_SECRET']
        .filter((key) => process.env[key] != null);
      const userProfileIsAllowed = process.platform === 'win32'
        ? true
        : process.env.USERPROFILE == null;
      const homeIsAllowed = process.platform === 'darwin'
        ? Boolean(process.env.HOME) && process.env.HOME === process.env.TMPDIR
        : process.env.HOME == null;
      const passed = leaked.length === 0 && userProfileIsAllowed && homeIsAllowed && process.env.POSTMETER_SCRIPT_WORKER === '1';
      if (!passed) {
        console.error([
          'environment stripping check failed',
          'leaked=' + (leaked.join(',') || 'none'),
          'userProfileIsAllowed=' + userProfileIsAllowed,
          'homeIsAllowed=' + homeIsAllowed,
          'hasWorkerMarker=' + (process.env.POSTMETER_SCRIPT_WORKER === '1')
        ].join('; '));
      }
      process.exit(passed ? 0 : 2);
    `);

    validationProgress('os boundary: required runtime read access');
    expectOsSandboxProbePass('required runtime read access', `
      require(${JSON.stringify(path.join(__dirname, 'scriptRuntime.js'))});
      process.exit(0);
    `, {
      readOnlyPaths: scriptWorkerRuntimeReadOnlyPaths(path.join(__dirname, 'scriptWorker.js'))
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(homeTempDir, { recursive: true, force: true });
  }
}

function validateWindowsOsSandboxBoundary(paths) {
  validationProgress('os boundary: windows combined read/write/network/env/runtime');
  expectOsSandboxProbePass('Windows combined filesystem, network, environment, and runtime boundaries', `
    const fs = require('node:fs');
    const net = require('node:net');
    const nodePath = require('node:path');
    const failures = [];
    deniedFileRead('host filesystem read', ${JSON.stringify(paths.forbiddenFile)});
    deniedFileRead('home directory filesystem read', ${JSON.stringify(paths.forbiddenHomeFile)});
    deniedFileWrite('host filesystem write', ${JSON.stringify(paths.forbiddenWriteFile)});
    checkEnvironment();
    checkRuntimeRead();
    checkNetworkDenied();

    function deniedFileRead(label, filePath) {
      try {
        fs.readFileSync(filePath, 'utf8');
        failures.push(label + ':allowed');
      } catch (error) {
        if (!isDeniedFilesystemError(error)) {
          failures.push(label + ':' + ((error && (error.code || error.message)) || 'unknown'));
        }
      }
    }
    function deniedFileWrite(label, filePath) {
      try {
        fs.writeFileSync(filePath, 'modified');
        failures.push(label + ':allowed');
      } catch (error) {
        if (!isDeniedFilesystemError(error)) {
          failures.push(label + ':' + ((error && (error.code || error.message)) || 'unknown'));
        }
      }
    }
    function isDeniedFilesystemError(error) {
      return error && ['ENOENT', 'EACCES', 'EPERM', 'ERR_ACCESS_DENIED'].includes(error.code);
    }
    function checkEnvironment() {
      const leaked = ['PATH', 'POSTMETER_OS_SANDBOX_SECRET']
        .filter((key) => process.env[key] != null);
      if (leaked.length > 0 || process.env.POSTMETER_SCRIPT_WORKER !== '1') {
        failures.push('environment stripping failed');
      }
    }
    function checkRuntimeRead() {
      try {
        require(${JSON.stringify(path.join(__dirname, 'scriptRuntime.js'))});
      } catch (error) {
        failures.push('runtime read:' + runtimeReadErrorDetail(error));
      }
    }
    function runtimeReadErrorDetail(error) {
      const failedPath = error && typeof error.path === 'string' ? error.path : '';
      const failedParts = failedPath.split(/[\\\\/]+/).filter(Boolean);
      return [
        (error && (error.code || error.message)) || 'unknown',
        error && error.syscall ? 'syscall=' + error.syscall : '',
        failedParts.length ? 'failedName=' + failedParts[failedParts.length - 1] : '',
        failedParts.length > 1 ? 'failedParent=' + failedParts[failedParts.length - 2] : '',
        failedPath ? 'basename=' + nodePath.basename(failedPath) : ''
      ].filter(Boolean).join(':');
    }
    function finish() {
      if (failures.length > 0) {
        console.error(failures.join('; '));
      }
      process.exit(failures.length === 0 ? 0 : 2);
    }
    function checkNetworkDenied() {
      let settled = false;
      const done = (failure) => {
        if (settled) {
          return;
        }
        settled = true;
        if (failure) {
          failures.push(failure);
        }
        finish();
      };
      const socket = net.createConnection({ host: '1.1.1.1', port: 443, timeout: 500 });
      socket.on('connect', () => {
        socket.destroy();
        done('host network access:allowed');
      });
      socket.on('error', () => done(''));
      socket.on('timeout', () => {
        socket.destroy();
        done('');
      });
      setTimeout(() => done(''), 1000).unref();
    }
  `, {
    readOnlyPaths: scriptWorkerAppReadOnlyPaths(path.join(__dirname, 'scriptWorker.js')),
    timeoutMillis: 20_000
  });

  validationProgress('os boundary: child process spawn');
  expectOsSandboxProbeDenied('child process spawn', `
    const { spawnSync } = require('node:child_process');
    try {
      const result = spawnSync(process.execPath, ['--version'], { timeout: 1000 });
      process.exit(result && result.status === 0 ? 2 : 0);
    } catch (_) {
      process.exit(0);
    }
  `, {
    execArgv: scriptWorkerExecArgv({ requireNodePermission: true }),
    timeoutMillis: 20_000
  });
}

function createSandboxProbeDirectory(rootDirectory, prefix) {
  const root = rootDirectory && fs.existsSync(rootDirectory) ? rootDirectory : os.tmpdir();
  try {
    return fs.mkdtempSync(path.join(root, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

function expectOsSandboxProbeDenied(label, code, options = {}) {
  const result = runOsSandboxProbe(code, options);
  if (result.status !== 0) {
    throw new Error(`OS sandbox probe did not deny ${label}: ${probeResultOutput(result)}`);
  }
}

function expectOsSandboxProbePass(label, code, options = {}) {
  const result = runOsSandboxProbe(code, options);
  if (result.status !== 0) {
    throw new Error(`OS sandbox probe did not allow ${label}: ${probeResultOutput(result)}`);
  }
}

function probeResultOutput(result = {}) {
  return result.error?.message || result.stderr || result.stdout || `status ${result.status}`;
}

function runOsSandboxProbe(code, options = {}) {
  const launch = createOsSandboxedProcessLaunch({
    args: [
      ...(options.execArgv || []),
      '-e',
      code
    ],
    env: scriptWorkerEnv(),
    readOnlyPaths: options.readOnlyPaths || [],
    skipFunctionalProbe: true
  });
  const seccomp = prepareSeccompStdio(launch, ['ignore', 'pipe', 'pipe']);
  try {
    const result = spawnSync(launch.command, launch.args, {
      encoding: 'utf8',
      env: launch.env,
      stdio: seccomp.stdio,
      timeout: options.timeoutMillis || 20_000
    });
    if (result.error) {
      throw result.error;
    }
    return result;
  } finally {
    seccomp.cleanup();
    cleanupPrivateTempDir(launch.privateTempDir);
  }
}

function expectPermissionProbeDenied(label, code, extraEnv = {}) {
  const env = {
    ...minimalPlatformEnv(),
    ...extraEnv
  };
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  const result = spawnSync(process.execPath, ['--permission', '-e', code], {
    encoding: 'utf8',
    env
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Node permission probe did not deny ${label}: ${result.stderr || result.stdout || `status ${result.status}`}`);
  }
}

async function validateScriptBoundary(options = {}) {
  const workerProgress = (event = {}) => {
    const label = typeof event.label === 'string' ? event.label : '';
    if (!label) {
      return;
    }
    const backend = event.backend ? ` ${event.backend}` : '';
    const transport = event.transport ? `/${event.transport}` : '';
    validationProgress(`script boundary: ${label}${backend}${transport}`);
  };
  const execution = await runPostmanScriptIsolated(`
    pm.test('host constructors and promises are blocked', async function () {
      pm.expect(pm.constructor).to.be.undefined;
      pm.expect(pm.test.constructor).to.be.undefined;
      pm.expect(console.log.constructor).to.be.undefined;
      pm.expect(pm.expect(1).constructor).to.be.undefined;

      const headers = pm.request.headers.all();
      pm.expect(Array.isArray(headers)).to.equal(true);
      pm.expect(headers.constructor).to.be.undefined;
      pm.expect(headers[0].constructor).to.be.undefined;
      pm.expect(headers.map(function (header) { return header.key; }).join(',')).to.equal('X-Sandbox');

      let escaped = false;
      try {
        pm.test.constructor.constructor('return process')();
        escaped = true;
      } catch (_) {}
      pm.expect(escaped).to.equal(false);

      let objectEscaped = false;
      try {
        ({}).constructor.constructor('return process')().cwd();
        objectEscaped = true;
      } catch (_) {}
      pm.expect(objectEscaped).to.equal(false);

      let functionEscaped = false;
      try {
        Function('return process')().cwd();
        functionEscaped = true;
      } catch (_) {}
      pm.expect(functionEscaped).to.equal(false);

      let unsupportedWorked = false;
      try {
        require('node:fs');
        unsupportedWorked = true;
      } catch (error) {
        pm.expect(typeof error).to.equal('string');
      }
      pm.expect(unsupportedWorked).to.equal(false);

      let processWorked = false;
      try {
        process.cwd();
        processWorked = true;
      } catch (_) {}
      pm.expect(processWorked).to.equal(false);

      const pending = pm.sendRequest('https://api.example.test/sandbox');
      pm.expect(pending.constructor).to.be.undefined;
      pm.expect(pending.then.constructor).to.be.undefined;
      const response = await pending;
      pm.expect(response.constructor).to.be.undefined;
      pm.expect(response.json().items.map(function (item) { return item.id; }).join(',')).to.equal('1,2');
    });
  `, {
    request: {
      method: 'GET',
      url: 'https://api.example.test/current',
      headers: [{ enabled: true, key: 'X-Sandbox', value: 'yes' }]
    },
    environment: { id: 'sandbox-validation', name: 'Sandbox Validation', variables: [] }
  }, {
    requireNodePermission: true,
    sendRequest: async () => ({
      statusCode: 200,
      headers: { 'content-type': ['application/json'] },
      body: '{"items":[{"id":1},{"id":2}]}',
      durationMillis: 1,
      responseBytes: 28
    }),
    skipOsSandboxFunctionalProbe: options.skipOsSandboxFunctionalProbe === true,
    onWorkerProgress: workerProgress,
    timeoutMillis: 1000,
    workerTimeoutMillis: scriptBoundaryWorkerTimeoutMillis()
  });

  if (!execution.result.passed) {
    const detail = execution.result.error || execution.result.tests.map((item) => `${item.name}: ${item.error}`).join('; ');
    throw new Error(`Sandbox adversarial script probe failed: ${detail}`);
  }
}

function minimalPlatformEnv() {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return env;
}

function assertDeepEqual(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`);
  }
}

function hasArgPair(args, flag, value) {
  return args.some((arg, index) => arg === flag && args[index + 1] === value);
}

function windowsSandboxChildArgs(launch = {}) {
  const args = Array.isArray(launch.args) ? launch.args : [];
  const delimiterIndex = args.indexOf('--');
  if (delimiterIndex === -1) {
    return [];
  }
  return args.slice(delimiterIndex + 2);
}

function platformRequiresOsSandbox(platform) {
  return platform === 'linux' || platform === 'win32' || platform === 'darwin';
}

function platformLabel(platform) {
  if (platform === 'win32') {
    return 'Windows';
  }
  if (platform === 'darwin') {
    return 'macOS';
  }
  return 'Linux';
}

function platformBackendLabel(platform) {
  if (platform === 'win32') {
    return 'Windows AppContainer helper';
  }
  if (platform === 'darwin') {
    return 'macOS seatbelt';
  }
  return 'bubblewrap';
}

function scriptBoundaryWorkerTimeoutMillis(platform = process.platform) {
  return platform === 'win32'
    ? WINDOWS_SCRIPT_BOUNDARY_WORKER_TIMEOUT_MILLIS
    : DEFAULT_SCRIPT_BOUNDARY_WORKER_TIMEOUT_MILLIS;
}

module.exports = {
  scriptBoundaryWorkerTimeoutMillis,
  validateNodePermissionModel,
  validateOsSandboxBoundary,
  validateOsSandboxLaunchPolicy,
  validateSandboxRuntime,
  validateScriptBoundary,
  validateWorkerLaunchPolicy
};
