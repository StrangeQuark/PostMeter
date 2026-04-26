const fs = require('node:fs');
const path = require('node:path');

const OS_SANDBOX_MODES = Object.freeze({
  AUTO: 'auto',
  OFF: 'off',
  REQUIRED: 'required'
});

const OS_SANDBOX_BACKENDS = Object.freeze({
  BUBBLEWRAP: 'bubblewrap',
  NONE: 'none'
});

const BUBBLEWRAP_CANDIDATES = [
  '/usr/bin/bwrap',
  '/bin/bwrap'
];

const SYSTEM_READ_PATHS = [
  '/lib',
  '/lib64',
  '/usr/lib',
  '/usr/lib64',
  '/usr/share',
  '/etc/ld.so.cache'
];

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
    bubblewrapPath: options.bubblewrapPath
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
  if (mode === OS_SANDBOX_MODES.OFF) {
    return {
      sandboxed: false,
      backend: OS_SANDBOX_BACKENDS.NONE,
      command: options.executablePath || process.execPath,
      args: options.args || [],
      env: options.env || {}
    };
  }

  if (process.platform !== 'linux') {
    if (mode === OS_SANDBOX_MODES.REQUIRED) {
      throw new Error(`OS-level script sandboxing is required but no backend is implemented for ${process.platform}.`);
    }
    return {
      sandboxed: false,
      backend: OS_SANDBOX_BACKENDS.NONE,
      command: options.executablePath || process.execPath,
      args: options.args || [],
      env: options.env || {}
    };
  }

  const bubblewrapPath = findBubblewrap(options.bubblewrapPath);
  if (!bubblewrapPath) {
    if (mode === OS_SANDBOX_MODES.REQUIRED) {
      throw new Error('OS-level script sandboxing is required but bubblewrap was not found.');
    }
    return {
      sandboxed: false,
      backend: OS_SANDBOX_BACKENDS.NONE,
      command: options.executablePath || process.execPath,
      args: options.args || [],
      env: options.env || {}
    };
  }

  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  return {
    sandboxed: true,
    backend: OS_SANDBOX_BACKENDS.BUBBLEWRAP,
    command: bubblewrapPath,
    args: bubblewrapArgs({
      executablePath,
      args: options.args || [],
      env: options.env || {},
      readOnlyPaths: [
        runtimeExecutableRoot(executablePath),
        ...(options.readOnlyPaths || [])
      ]
    }),
    env: {}
  };
}

function osSandboxStatus(options = {}) {
  const mode = normalizeOsSandboxMode(options.mode);
  const bubblewrapPath = process.platform === 'linux' ? findBubblewrap(options.bubblewrapPath) : '';
  return {
    mode,
    platform: process.platform,
    supported: process.platform === 'linux' && Boolean(bubblewrapPath),
    backend: process.platform === 'linux' && bubblewrapPath ? OS_SANDBOX_BACKENDS.BUBBLEWRAP : OS_SANDBOX_BACKENDS.NONE,
    bubblewrapPath
  };
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
    options.executablePath,
    ...(options.args || [])
  ];
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

function scriptWorkerReadOnlyPaths(workerPath) {
  const paths = [
    appSourceRoot(),
    runtimeExecutableRoot(process.execPath),
    workerPath
  ];
  return paths.filter(Boolean);
}

function appSourceRoot() {
  const root = path.resolve(__dirname, '..', '..');
  return normalizeExistingPath(root);
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

function executableFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

module.exports = {
  OS_SANDBOX_BACKENDS,
  OS_SANDBOX_MODES,
  createOsSandboxedProcessLaunch,
  createScriptWorkerLaunch,
  osSandboxStatus,
  normalizeOsSandboxMode
};
