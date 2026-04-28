const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  OS_SANDBOX_MODES,
  createOsSandboxedProcessLaunch,
  osSandboxStatus,
  prepareSeccompStdio
} = require('./osSandbox');
const {
  runPostmanScriptIsolated,
  scriptWorkerEnv,
  scriptWorkerExecArgv,
  supportsNodePermissionFlags
} = require('./scriptSandbox');

async function validateSandboxRuntime(options = {}) {
  if (options.requireElectron !== false && !process.versions.electron) {
    throw new Error('Sandbox runtime validation must run inside the pinned Electron runtime.');
  }
  if (!supportsNodePermissionFlags()) {
    throw new Error('Pinned runtime does not support required Node permission flags.');
  }

  validateWorkerLaunchPolicy(scriptWorkerExecArgv({ requireNodePermission: true }), scriptWorkerEnv());
  validateNodePermissionModel();
  if (process.platform === 'linux') {
    validateOsSandboxLaunchPolicy();
    validateOsSandboxBoundary();
  }
  await validateScriptBoundary({
    requireOsSandbox: process.platform === 'linux'
  });
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
  const status = osSandboxStatus({ mode: OS_SANDBOX_MODES.REQUIRED });
  if (!status.supported) {
    throw new Error('Linux OS-level script sandboxing requires bubblewrap, but no bubblewrap executable was found.');
  }

  const launch = createOsSandboxedProcessLaunch({
    mode: OS_SANDBOX_MODES.REQUIRED,
    args: ['-e', 'process.exit(0)'],
    env: scriptWorkerEnv()
  });
  if (!launch.sandboxed || launch.backend !== 'bubblewrap') {
    throw new Error('Required OS-level script sandbox launch did not select the bubblewrap backend.');
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
}

function validateOsSandboxBoundary() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postmeter-os-sandbox-'));
  const forbiddenFile = path.join(tempDir, 'forbidden.txt');
  fs.writeFileSync(forbiddenFile, 'secret');
  try {
    expectOsSandboxProbeDenied('host filesystem read', `
      const fs = require('node:fs');
      try {
        fs.readFileSync(${JSON.stringify(forbiddenFile)}, 'utf8');
        process.exit(2);
      } catch (error) {
        process.exit(error && (error.code === 'ENOENT' || error.code === 'EACCES') ? 0 : 1);
      }
    `);

    expectOsSandboxProbeDenied('host network access', `
      const net = require('node:net');
      const socket = net.createConnection({ host: '1.1.1.1', port: 443, timeout: 500 });
      socket.on('connect', () => process.exit(2));
      socket.on('error', () => process.exit(0));
      socket.on('timeout', () => process.exit(0));
    `);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function expectOsSandboxProbeDenied(label, code) {
  const launch = createOsSandboxedProcessLaunch({
    mode: OS_SANDBOX_MODES.REQUIRED,
    args: ['-e', code],
    env: scriptWorkerEnv()
  });
  const seccomp = prepareSeccompStdio(launch, ['ignore', 'pipe', 'pipe']);
  try {
    const result = spawnSync(launch.command, launch.args, {
      encoding: 'utf8',
      env: launch.env,
      stdio: seccomp.stdio
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`OS sandbox probe did not deny ${label}: ${result.stderr || result.stdout || `status ${result.status}`}`);
    }
  } finally {
    seccomp.cleanup();
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
    osSandboxMode: options.requireOsSandbox ? OS_SANDBOX_MODES.REQUIRED : OS_SANDBOX_MODES.AUTO,
    sendRequest: async () => ({
      statusCode: 200,
      headers: { 'content-type': ['application/json'] },
      body: '{"items":[{"id":1},{"id":2}]}',
      durationMillis: 1,
      responseBytes: 28
    }),
    timeoutMillis: 1000,
    workerTimeoutMillis: 3000
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

module.exports = {
  validateNodePermissionModel,
  validateOsSandboxBoundary,
  validateOsSandboxLaunchPolicy,
  validateSandboxRuntime,
  validateScriptBoundary,
  validateWorkerLaunchPolicy
};
