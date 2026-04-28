const fs = require('node:fs');
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
  if (mode === OS_SANDBOX_MODES.OFF) {
    return {
      sandboxed: false,
      backend: OS_SANDBOX_BACKENDS.NONE,
      command: options.executablePath || process.execPath,
      args: options.args || [],
      env: options.env || {}
    };
  }

  if (process.platform === 'darwin') {
    const sandboxExecPath = findMacosSandboxExec(options.macosSandboxExecPath);
    if (!sandboxExecPath) {
      if (mode === OS_SANDBOX_MODES.REQUIRED) {
        throw new Error('OS-level script sandboxing is required but no macOS seatbelt launcher was found.');
      }
      return unsandboxedLaunch(options);
    }
    const executablePath = realPathIfExists(options.executablePath || process.execPath);
    if (!macosSandboxExecUsable(sandboxExecPath, {
      executablePath,
      env: options.env || {},
      probeArgs: options.probeArgs,
      readOnlyPaths: [
        runtimeExecutableRoot(executablePath),
        ...(options.readOnlyPaths || [])
      ]
    })) {
      if (mode === OS_SANDBOX_MODES.REQUIRED) {
        throw new Error('OS-level script sandboxing is required but the macOS seatbelt launcher failed its functional probe.');
      }
      return unsandboxedLaunch(options);
    }
    return {
      sandboxed: true,
      backend: OS_SANDBOX_BACKENDS.MACOS_SEATBELT,
      command: sandboxExecPath,
      args: [
        '-p',
        macosSeatbeltProfile({
          executablePath,
          readOnlyPaths: [
            runtimeExecutableRoot(executablePath),
            ...(options.readOnlyPaths || [])
          ]
        }),
        executablePath,
        ...(options.args || [])
      ],
      env: macosSandboxEnv(options.env || {})
    };
  }

  if (process.platform === 'win32') {
    const helperPath = options.windowsSandboxHelperPath || process.env.POSTMETER_WINDOWS_OS_SANDBOX_HELPER || '';
    if (!helperPath || !executableFile(helperPath)) {
      if (mode === OS_SANDBOX_MODES.REQUIRED) {
        throw new Error('OS-level script sandboxing is required but no Windows AppContainer helper was configured.');
      }
      return unsandboxedLaunch(options);
    }
    return {
      sandboxed: true,
      backend: OS_SANDBOX_BACKENDS.WINDOWS_HELPER,
      command: helperPath,
      args: windowsHelperArgs(options),
      env: {}
    };
  }

  if (process.platform !== 'linux') {
    if (mode === OS_SANDBOX_MODES.REQUIRED) {
      throw new Error(`OS-level script sandboxing is required but no backend is implemented for ${process.platform}.`);
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
  const bubblewrapPath = process.platform === 'linux' ? findBubblewrap(options.bubblewrapPath) : '';
  const macosSandboxExecPath = process.platform === 'darwin' ? findMacosSandboxExec(options.macosSandboxExecPath) : '';
  const windowsHelperPath = process.platform === 'win32' ? (options.windowsSandboxHelperPath || process.env.POSTMETER_WINDOWS_OS_SANDBOX_HELPER || '') : '';
  const linuxSupported = process.platform === 'linux' && Boolean(bubblewrapPath) && bubblewrapUsable(bubblewrapPath, {
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    executablePath: realPathIfExists(process.execPath),
    readOnlyPaths: [runtimeExecutableRoot(process.execPath), appSourceRoot()]
  });
  const macosSupported = process.platform === 'darwin' && Boolean(macosSandboxExecPath) && macosSandboxExecUsable(macosSandboxExecPath, {
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    executablePath: realPathIfExists(process.execPath),
    readOnlyPaths: [runtimeExecutableRoot(process.execPath), appSourceRoot()]
  });
  const supported = linuxSupported
    || macosSupported
    || (process.platform === 'win32' && executableFile(windowsHelperPath));
  const seccompSupported = linuxSupported && linuxSeccompSupported();
  return {
    mode,
    platform: process.platform,
    supported,
    backend: linuxSupported
      ? OS_SANDBOX_BACKENDS.BUBBLEWRAP
      : macosSupported
        ? OS_SANDBOX_BACKENDS.MACOS_SEATBELT
        : process.platform === 'win32' && executableFile(windowsHelperPath)
          ? OS_SANDBOX_BACKENDS.WINDOWS_HELPER
          : OS_SANDBOX_BACKENDS.NONE,
    bubblewrapPath,
    macosSandboxExecPath,
    windowsHelperPath,
    seccompSupported,
    seccompFilterFd: seccompSupported ? LINUX_SECCOMP_FILTER_FD : null
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
  const usable = spawnSync(sandboxExecPath, [
    '-p',
    macosSeatbeltProfile({
      executablePath,
      readOnlyPaths: [
        runtimeExecutableRoot(executablePath),
        ...(options.readOnlyPaths || [])
      ]
    }),
    executablePath,
    ...probeArgs
  ], {
    env: macosSandboxEnv(env),
    stdio: 'ignore',
    timeout: 3000
  }).status === 0;
  BACKEND_PROBE_CACHE.set(key, usable);
  return usable;
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

function macosSandboxEnv(env) {
  const output = {
    POSTMETER_SCRIPT_WORKER: '1',
    TMPDIR: '/tmp',
    TMP: '/tmp',
    TEMP: '/tmp'
  };
  if (env.ELECTRON_RUN_AS_NODE) {
    output.ELECTRON_RUN_AS_NODE = '1';
  }
  return output;
}

function macosSeatbeltProfile(options) {
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
    '(allow process*)',
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    `(allow file-read* ${readRules})`,
    '(allow file-write* (subpath "/tmp") (subpath "/private/tmp") (subpath "/private/var/folders"))',
    '(deny network*)'
  ].join('\n');
}

function escapeSeatbeltString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function windowsHelperArgs(options = {}) {
  const payload = Buffer.from(JSON.stringify({
    executablePath: options.executablePath || process.execPath,
    args: options.args || [],
    env: windowsSandboxEnv(options.env || {}),
    readOnlyPaths: options.readOnlyPaths || []
  }), 'utf8').toString('base64');
  return ['--postmeter-sandbox-launch', payload];
}

function windowsSandboxEnv(env) {
  const output = {
    POSTMETER_SCRIPT_WORKER: '1',
    TEMP: '%TEMP%',
    TMP: '%TEMP%'
  };
  if (env.ELECTRON_RUN_AS_NODE) {
    output.ELECTRON_RUN_AS_NODE = '1';
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
  normalizeOsSandboxMode,
  prepareSeccompStdio
};
