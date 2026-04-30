const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  LINUX_SECCOMP_FILTER_FD,
  createLinuxSeccompPolicy,
  linuxSeccompSupported,
  prepareSeccompStdio
} = require('./seccompPolicy');

const OS_SANDBOX_MODES = Object.freeze({
  AUTO: 'auto',
  OFF: 'off',
  REQUIRED: 'required'
});

const OS_SANDBOX_BACKENDS = Object.freeze({
  BUBBLEWRAP: 'bubblewrap',
  MACOS_SEATBELT: 'macos-seatbelt',
  WINDOWS_HELPER: 'windows-helper',
  NONE: 'none'
});

const BUBBLEWRAP_CANDIDATES = [
  '/usr/bin/bwrap',
  '/bin/bwrap'
];
const MACOS_SANDBOX_EXEC_CANDIDATES = [
  '/usr/bin/sandbox-exec'
];
const WINDOWS_SANDBOX_HELPER_NAME = 'PostMeterWindowsSandboxHelper.exe';
const WINDOWS_APP_CONTAINER_PROFILE = 'PostMeter.ScriptWorkerSandbox';

const SYSTEM_READ_PATHS = [
  '/lib',
  '/lib64',
  '/usr/lib',
  '/usr/lib64',
  '/usr/share',
  '/etc/ld.so.cache'
];
const BACKEND_PROBE_CACHE = new Map();

function createScriptWorkerLaunch(workerPath, execArgv = [], env = {}, options = {}) {
  const mode = normalizeOsSandboxMode(options.osSandboxMode);
  const sandbox = createOsSandboxedProcessLaunch({
    executablePath: process.execPath,
    args: [
      ...execArgv,
      workerPath,
      '--postmeter-stdio-worker'
    ],
    env,
    mode,
    readOnlyPaths: scriptWorkerReadOnlyPaths(workerPath),
    bubblewrapPath: options.bubblewrapPath,
    macosSandboxExecPath: options.macosSandboxExecPath,
    probeArgs: [
      ...execArgv,
      '-e',
      'process.exit(0)'
    ],
    windowsSandboxHelperPath: options.windowsSandboxHelperPath
  });

  if (!sandbox.sandboxed) {
    return {
      sandboxed: false,
      backend: OS_SANDBOX_BACKENDS.NONE,
      transport: 'ipc',
      workerPath,
      execArgv,
      env
    };
  }

  return {
    ...sandbox,
    transport: 'stdio'
  };
}

function createOsSandboxedProcessLaunch(options = {}) {
  const mode = normalizeOsSandboxMode(options.mode);
  const platform = options.platform || process.platform;
  if (mode === OS_SANDBOX_MODES.OFF) {
    return {
      sandboxed: false,
      backend: OS_SANDBOX_BACKENDS.NONE,
      command: options.executablePath || process.execPath,
      args: options.args || [],
      env: options.env || {}
    };
  }

  if (platform === 'darwin') {
    const sandboxExecPath = findMacosSandboxExec(options.macosSandboxExecPath);
    if (!sandboxExecPath) {
      if (mode === OS_SANDBOX_MODES.REQUIRED) {
        throw new Error('OS-level script sandboxing is required but no macOS seatbelt launcher was found.');
      }
      return unsandboxedLaunch(options);
    }
    const executablePath = realPathIfExists(options.executablePath || process.execPath);
    const readOnlyPaths = [
      runtimeExecutableRoot(executablePath),
      ...(options.readOnlyPaths || [])
    ];
    if (!macosSandboxExecUsable(sandboxExecPath, {
      executablePath,
      env: options.env || {},
      probeArgs: options.probeArgs,
      readOnlyPaths
    })) {
      if (mode === OS_SANDBOX_MODES.REQUIRED) {
        throw new Error('OS-level script sandboxing is required but the macOS seatbelt launcher failed its functional probe.');
      }
      return unsandboxedLaunch(options);
    }
    const privateTempDir = createPrivateTempDir('postmeter-macos-sandbox-');
    return {
      sandboxed: true,
      backend: OS_SANDBOX_BACKENDS.MACOS_SEATBELT,
      command: sandboxExecPath,
      args: [
        '-p',
        macosSeatbeltProfile({
          executablePath,
          privateTempDir,
          readOnlyPaths
        }),
        executablePath,
        ...(options.args || [])
      ],
      env: macosSandboxEnv(options.env || {}, privateTempDir),
      privateTempDir
    };
  }

  if (platform === 'win32') {
    const helperPath = findWindowsSandboxHelper(options.windowsSandboxHelperPath, platform);
    if (!helperPath) {
      if (mode === OS_SANDBOX_MODES.REQUIRED) {
        throw new Error('OS-level script sandboxing is required but no Windows AppContainer helper was configured.');
      }
      return unsandboxedLaunch(options);
    }
    const executablePath = realPathIfExists(options.executablePath || process.execPath);
    const readOnlyPaths = windowsReadOnlyPaths([
      runtimeExecutableRoot(executablePath),
      ...(options.readOnlyPaths || []),
      executablePath
    ]);
    if (platform === process.platform && !windowsSandboxHelperUsable(helperPath, {
      executablePath,
      env: options.env || {},
      probeArgs: options.probeArgs,
      readOnlyPaths
    })) {
      if (mode === OS_SANDBOX_MODES.REQUIRED) {
        throw new Error('OS-level script sandboxing is required but the Windows AppContainer helper failed its functional probe.');
      }
      return unsandboxedLaunch(options);
    }
    const privateTempDir = createPrivateTempDir('postmeter-windows-sandbox-');
    return {
      sandboxed: true,
      backend: OS_SANDBOX_BACKENDS.WINDOWS_HELPER,
      command: helperPath,
      args: windowsHelperArgs({
        ...options,
        executablePath,
        privateTempDir,
        readOnlyPaths
      }),
      env: {},
      privateTempDir
    };
  }

  if (platform !== 'linux') {
    if (mode === OS_SANDBOX_MODES.REQUIRED) {
      throw new Error(`OS-level script sandboxing is required but no backend is implemented for ${platform}.`);
    }
    return unsandboxedLaunch(options);
  }

  const bubblewrapPath = findBubblewrap(options.bubblewrapPath);
  if (!bubblewrapPath) {
    if (mode === OS_SANDBOX_MODES.REQUIRED) {
      throw new Error('OS-level script sandboxing is required but bubblewrap was not found.');
    }
    return unsandboxedLaunch(options);
  }

  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  if (!bubblewrapUsable(bubblewrapPath, {
    executablePath,
    env: options.env || {},
    probeArgs: options.probeArgs,
    readOnlyPaths: [
      runtimeExecutableRoot(executablePath),
      ...(options.readOnlyPaths || [])
    ]
  })) {
    if (mode === OS_SANDBOX_MODES.REQUIRED) {
      throw new Error('OS-level script sandboxing is required but bubblewrap failed its functional probe.');
    }
    return unsandboxedLaunch(options);
  }
  const seccompPolicy = createLinuxSeccompPolicy();
  return {
    sandboxed: true,
    backend: OS_SANDBOX_BACKENDS.BUBBLEWRAP,
    command: bubblewrapPath,
    args: bubblewrapArgs({
      executablePath,
      args: options.args || [],
      env: options.env || {},
      seccompPolicy,
      readOnlyPaths: [
        runtimeExecutableRoot(executablePath),
        ...(options.readOnlyPaths || [])
      ]
    }),
    env: {},
    seccompPolicy
  };
}

function osSandboxStatus(options = {}) {
  const mode = normalizeOsSandboxMode(options.mode);
  const platform = options.platform || process.platform;
  const bubblewrapPath = platform === 'linux' ? findBubblewrap(options.bubblewrapPath) : '';
  const macosSandboxExecPath = platform === 'darwin' ? findMacosSandboxExec(options.macosSandboxExecPath) : '';
  const windowsHelperPath = platform === 'win32' ? findWindowsSandboxHelper(options.windowsSandboxHelperPath, platform) : '';
  const linuxSupported = platform === 'linux' && Boolean(bubblewrapPath) && bubblewrapUsable(bubblewrapPath, {
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    executablePath: realPathIfExists(process.execPath),
    readOnlyPaths: [runtimeExecutableRoot(process.execPath), appSourceRoot()]
  });
  const macosSupported = platform === 'darwin' && Boolean(macosSandboxExecPath) && macosSandboxExecUsable(macosSandboxExecPath, {
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    executablePath: realPathIfExists(process.execPath),
    readOnlyPaths: [runtimeExecutableRoot(process.execPath), appSourceRoot()]
  });
  const windowsSupported = windowsSandboxSupported(windowsHelperPath, platform);
  const supported = linuxSupported || macosSupported || windowsSupported;
  const seccompSupported = linuxSupported && linuxSeccompSupported();
  return {
    mode,
    platform,
    supported,
    backend: linuxSupported
      ? OS_SANDBOX_BACKENDS.BUBBLEWRAP
      : macosSupported
        ? OS_SANDBOX_BACKENDS.MACOS_SEATBELT
        : windowsSupported
          ? OS_SANDBOX_BACKENDS.WINDOWS_HELPER
          : OS_SANDBOX_BACKENDS.NONE,
    bubblewrapPath,
    macosSandboxExecPath,
    windowsHelperPath,
    seccompSupported,
    seccompFilterFd: seccompSupported ? LINUX_SECCOMP_FILTER_FD : null
  };
}

function windowsSandboxSupported(windowsHelperPath, platform) {
  return platform === 'win32' && Boolean(windowsHelperPath) && (
    platform !== process.platform
    || windowsSandboxHelperUsable(windowsHelperPath, {
      env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
      executablePath: realPathIfExists(process.execPath),
      readOnlyPaths: [runtimeExecutableRoot(process.execPath), appSourceRoot()]
    })
  );
}

function normalizeOsSandboxMode(value) {
  if (value === OS_SANDBOX_MODES.OFF || value === OS_SANDBOX_MODES.REQUIRED || value === OS_SANDBOX_MODES.AUTO) {
    return value;
  }
  if (process.env.POSTMETER_REQUIRE_OS_SANDBOX === '1') {
    return OS_SANDBOX_MODES.REQUIRED;
  }
  return OS_SANDBOX_MODES.AUTO;
}

function findBubblewrap(explicitPath) {
  if (explicitPath) {
    return executableFile(explicitPath) ? explicitPath : '';
  }
  return BUBBLEWRAP_CANDIDATES.find(executableFile) || '';
}

function findMacosSandboxExec(explicitPath) {
  if (explicitPath) {
    return executableFile(explicitPath) ? explicitPath : '';
  }
  return MACOS_SANDBOX_EXEC_CANDIDATES.find(executableFile) || '';
}

function bubblewrapUsable(bubblewrapPath, options = {}) {
  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  const env = {
    POSTMETER_SCRIPT_WORKER: '1',
    ...(options.env || {})
  };
  const probeArgs = Array.isArray(options.probeArgs) ? options.probeArgs : ['-e', 'process.exit(0)'];
  const key = `bubblewrap:${bubblewrapPath}:${executablePath}:${env.ELECTRON_RUN_AS_NODE || ''}:${probeArgs.join('\0')}`;
  if (BACKEND_PROBE_CACHE.has(key)) {
    return BACKEND_PROBE_CACHE.get(key);
  }
  const args = bubblewrapArgs({
    executablePath,
    args: probeArgs,
    env,
    readOnlyPaths: [
      runtimeExecutableRoot(executablePath),
      ...(options.readOnlyPaths || [])
    ],
    seccompPolicy: null
  });
  const usable = spawnSync(bubblewrapPath, args, {
    env: {},
    stdio: 'ignore',
    timeout: 3000
  }).status === 0;
  BACKEND_PROBE_CACHE.set(key, usable);
  return usable;
}

function macosSandboxExecUsable(sandboxExecPath, options = {}) {
  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  const env = options.env || {};
  const probeArgs = Array.isArray(options.probeArgs) ? options.probeArgs : ['-e', 'process.exit(0)'];
  const key = `macos-seatbelt:${sandboxExecPath}:${executablePath}:${env.ELECTRON_RUN_AS_NODE || ''}:${probeArgs.join('\0')}`;
  if (BACKEND_PROBE_CACHE.has(key)) {
    return BACKEND_PROBE_CACHE.get(key);
  }
  const privateTempDir = createPrivateTempDir('postmeter-macos-sandbox-probe-');
  try {
    const usable = spawnSync(sandboxExecPath, [
      '-p',
      macosSeatbeltProfile({
        executablePath,
        privateTempDir,
        readOnlyPaths: [
          runtimeExecutableRoot(executablePath),
          ...(options.readOnlyPaths || [])
        ]
      }),
      executablePath,
      ...probeArgs
    ], {
      env: macosSandboxEnv(env, privateTempDir),
      stdio: 'ignore',
      timeout: 3000
    }).status === 0;
    BACKEND_PROBE_CACHE.set(key, usable);
    return usable;
  } finally {
    cleanupPrivateTempDir(privateTempDir);
  }
}

function windowsSandboxHelperUsable(helperPath, options = {}) {
  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  const env = options.env || {};
  const probeArgs = Array.isArray(options.probeArgs) ? options.probeArgs : ['-e', 'process.exit(0)'];
  const readOnlyPaths = windowsReadOnlyPaths([
    runtimeExecutableRoot(executablePath),
    ...(options.readOnlyPaths || []),
    executablePath
  ]);
  const key = `windows-helper:${helperPath}:${executablePath}:${env.ELECTRON_RUN_AS_NODE || ''}:${probeArgs.join('\0')}:${readOnlyPaths.join('\0')}`;
  if (BACKEND_PROBE_CACHE.has(key)) {
    return BACKEND_PROBE_CACHE.get(key);
  }
  const privateTempDir = createPrivateTempDir('postmeter-windows-sandbox-probe-');
  try {
    const usable = spawnSync(helperPath, windowsHelperArgs({
      executablePath,
      args: probeArgs,
      env,
      privateTempDir,
      readOnlyPaths
    }), {
      env: {},
      stdio: 'ignore',
      timeout: 5000
    }).status === 0;
    BACKEND_PROBE_CACHE.set(key, usable);
    return usable;
  } finally {
    cleanupPrivateTempDir(privateTempDir);
  }
}

function unsandboxedLaunch(options = {}) {
  return {
    sandboxed: false,
    backend: OS_SANDBOX_BACKENDS.NONE,
    command: options.executablePath || process.execPath,
    args: options.args || [],
    env: options.env || {}
  };
}

function bubblewrapArgs(options) {
  const bindArgs = [];
  const seenBinds = new Set();
  const seenDirs = new Set();
  const addReadOnlyBind = (sourcePath) => {
    const normalized = normalizeExistingPath(sourcePath);
    if (!normalized || pathCoveredByBind(normalized, seenBinds)) {
      return;
    }
    seenBinds.add(normalized);
    bindArgs.push(...parentDirArgs(normalized, seenDirs), '--ro-bind', normalized, normalized);
  };

  const addReadOnlyBindTry = (sourcePath) => {
    const normalized = normalizePath(sourcePath);
    if (!normalized || pathCoveredByBind(normalized, seenBinds) || !fs.existsSync(normalized)) {
      return;
    }
    seenBinds.add(normalized);
    bindArgs.push(...parentDirArgs(normalized, seenDirs), '--ro-bind-try', normalized, normalized);
  };

  for (const readOnlyPath of options.readOnlyPaths) {
    addReadOnlyBind(readOnlyPath);
  }
  addReadOnlyBind(options.executablePath);
  for (const systemPath of SYSTEM_READ_PATHS) {
    addReadOnlyBindTry(systemPath);
  }

  return [
    '--unshare-all',
    '--unshare-user',
    '--disable-userns',
    '--assert-userns-disabled',
    '--cap-drop',
    'ALL',
    '--die-with-parent',
    '--new-session',
    '--clearenv',
    '--dev',
    '/dev',
    '--proc',
    '/proc',
    '--tmpfs',
    '/tmp',
    '--tmpfs',
    '/run',
    ...bindArgs,
    ...bubblewrapEnvArgs(options.env || {}),
    ...bubblewrapSeccompArgs(options.seccompPolicy),
    options.executablePath,
    ...(options.args || [])
  ];
}

function bubblewrapSeccompArgs(seccompPolicy) {
  if (!seccompPolicy?.filter) {
    return [];
  }
  return ['--seccomp', String(seccompPolicy.fd)];
}

function bubblewrapEnvArgs(env) {
  const args = [
    '--setenv',
    'POSTMETER_SCRIPT_WORKER',
    '1',
    '--setenv',
    'TMPDIR',
    '/tmp',
    '--setenv',
    'TMP',
    '/tmp',
    '--setenv',
    'TEMP',
    '/tmp'
  ];
  if (env.ELECTRON_RUN_AS_NODE) {
    args.push('--setenv', 'ELECTRON_RUN_AS_NODE', '1');
  }
  return args;
}

function macosSandboxEnv(env, privateTempDir = os.tmpdir()) {
  const output = {
    POSTMETER_SCRIPT_WORKER: '1',
    TMPDIR: privateTempDir,
    TMP: privateTempDir,
    TEMP: privateTempDir
  };
  if (env.ELECTRON_RUN_AS_NODE) {
    output.ELECTRON_RUN_AS_NODE = '1';
  }
  return output;
}

function macosSeatbeltProfile(options) {
  const privateTempDir = normalizePath(options.privateTempDir);
  const readPaths = [
    options.executablePath,
    ...(options.readOnlyPaths || []),
    '/System/Library',
    '/usr/lib',
    '/usr/share',
    '/dev/null',
    '/dev/urandom',
    '/private/etc/ssl',
    '/etc/ssl'
  ].map(normalizePath).filter(Boolean);
  const readRules = Array.from(new Set(readPaths))
    .map((item) => `(subpath "${escapeSeatbeltString(item)}")`)
    .join(' ');
  return [
    '(version 1)',
    '(deny default)',
    '(deny process-exec)',
    '(deny process-fork)',
    '(allow process-info*)',
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    `(allow file-read* ${readRules})`,
    `(allow file-write* (subpath "${escapeSeatbeltString(privateTempDir)}") (literal "/dev/null"))`,
    '(deny network*)'
  ].join('\n');
}

function escapeSeatbeltString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function windowsHelperArgs(options = {}) {
  const env = windowsSandboxEnv(options.env || {}, options.privateTempDir);
  return [
    '--profile',
    WINDOWS_APP_CONTAINER_PROFILE,
    '--temp',
    options.privateTempDir,
    ...flatMap(options.readOnlyPaths || [], (readOnlyPath) => ['--read-only', readOnlyPath]),
    ...flatMap(Object.entries(env), ([key, value]) => ['--env', `${key}=${value}`]),
    '--',
    options.executablePath || process.execPath,
    ...(options.args || [])
  ];
}

function windowsSandboxEnv(env, privateTempDir = os.tmpdir()) {
  const output = {
    POSTMETER_SCRIPT_WORKER: '1',
    TEMP: privateTempDir,
    TMP: privateTempDir,
    TMPDIR: privateTempDir
  };
  for (const key of ['SystemRoot', 'WINDIR']) {
    const value = platformEnvValue(key);
    if (value) {
      output[key] = value;
    }
  }
  if (env.ELECTRON_RUN_AS_NODE) {
    output.ELECTRON_RUN_AS_NODE = '1';
  }
  return output;
}

function findWindowsSandboxHelper(explicitPath, platform = process.platform) {
  const candidates = [
    explicitPath,
    process.env.POSTMETER_WINDOWS_OS_SANDBOX_HELPER,
    process.resourcesPath ? path.join(process.resourcesPath, 'native', 'windows', WINDOWS_SANDBOX_HELPER_NAME) : '',
    path.join(projectRoot(), 'native', 'windows-sandbox-helper', 'bin', WINDOWS_SANDBOX_HELPER_NAME)
  ].filter(Boolean);
  return candidates.find((candidate) => executableFile(candidate, platform)) || '';
}

function windowsReadOnlyPaths(paths) {
  const seen = new Set();
  const output = [];
  for (const item of paths) {
    const normalized = normalizeExistingPath(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function scriptWorkerReadOnlyPaths(workerPath) {
  const paths = [
    appSourceRoot(),
    runtimeExecutableRoot(process.execPath),
    workerPath
  ];
  return paths.filter(Boolean);
}

function appSourceRoot() {
  return normalizeExistingPath(projectRoot());
}

function projectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function runtimeExecutableRoot(executablePath) {
  const realExecutablePath = realPathIfExists(executablePath);
  if (!realExecutablePath) {
    return '';
  }
  if (realExecutablePath.startsWith('/usr/bin/') || realExecutablePath.startsWith('/bin/')) {
    return realExecutablePath;
  }
  return path.dirname(realExecutablePath);
}

function parentDirArgs(targetPath, seenDirs = new Set()) {
  const directory = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
    ? targetPath
    : path.dirname(targetPath);
  const parts = normalizePath(directory).split(path.sep).filter(Boolean);
  const args = [];
  let current = '';
  for (const part of parts) {
    current = `${current}/${part}`;
    if (seenDirs.has(current)) {
      continue;
    }
    seenDirs.add(current);
    args.push('--dir', current);
  }
  return args;
}

function normalizeExistingPath(value) {
  const normalized = asarKernelPath(normalizePath(value));
  return normalized && fs.existsSync(normalized) ? realPathIfExists(normalized) : '';
}

function normalizePath(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return path.resolve(value);
}

function realPathIfExists(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return normalizePath(value);
  }
}

function asarKernelPath(filePath) {
  const marker = '.asar';
  const markerIndex = String(filePath || '').indexOf(marker);
  if (markerIndex === -1) {
    return filePath;
  }
  return filePath.slice(0, markerIndex + marker.length);
}

function pathCoveredByBind(candidate, seenBinds) {
  for (const bindPath of seenBinds) {
    if (candidate === bindPath || candidate.startsWith(`${bindPath}${path.sep}`)) {
      return true;
    }
  }
  return false;
}

function executableFile(filePath, platform = process.platform) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }
    if (platform === 'win32') {
      return /\.exe$/i.test(filePath);
    }
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function createPrivateTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupPrivateTempDir(tempDir) {
  if (!tempDir) {
    return;
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}

function flatMap(items, mapper) {
  return items.reduce((accumulator, item) => accumulator.concat(mapper(item)), []);
}

function platformEnvValue(key) {
  if (process.env[key]) {
    return process.env[key];
  }
  const found = Object.keys(process.env).find((item) => item.toLowerCase() === key.toLowerCase());
  return found ? process.env[found] : '';
}

module.exports = {
  OS_SANDBOX_BACKENDS,
  OS_SANDBOX_MODES,
  WINDOWS_APP_CONTAINER_PROFILE,
  createOsSandboxedProcessLaunch,
  createScriptWorkerLaunch,
  cleanupPrivateTempDir,
  osSandboxStatus,
  normalizeOsSandboxMode,
  prepareSeccompStdio
};
