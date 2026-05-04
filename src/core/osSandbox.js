const crypto = require('node:crypto');
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
const WINDOWS_ELECTRON_NO_STDIO_INIT = '--no-stdio-init';
const SCRIPT_WORKER_STDIO_TRANSPORT_ARG = '--postmeter-stdio-worker';
const SCRIPT_WORKER_FILE_TRANSPORT_ARG = '--postmeter-file-worker';
const WINDOWS_HELPER_PROBE_TIMEOUT_MILLIS = 20_000;
const SCRIPT_WORKER_RUNTIME_FILE_BASENAMES = [
  'scriptWorker.js',
  'scriptRuntime.js',
  'visualizerHandlebarsBundle.js',
  'postmanBuiltinPackages.js',
  'postmanSandboxBootcodeBundle.js',
  'sandboxPackageCache.js',
  'dynamicVariables.js',
  'variableScope.js'
];

const SYSTEM_READ_PATHS = [
  '/lib',
  '/lib64',
  '/usr/lib',
  '/usr/lib64',
  '/usr/share',
  '/etc/ld.so.cache'
];
const MACOS_SYSTEM_READ_PATHS = [
  '/System/Library',
  '/System/Cryptexes/OS/System/Library',
  '/System/Cryptexes/OS/usr/bin',
  '/System/Cryptexes/OS/usr/lib',
  '/System/Cryptexes/OS/usr/libexec',
  '/System/Cryptexes/OS/usr/share',
  '/System/Volumes/Preboot/Cryptexes/OS/System/Library',
  '/System/Volumes/Preboot/Cryptexes/OS/usr/bin',
  '/System/Volumes/Preboot/Cryptexes/OS/usr/lib',
  '/System/Volumes/Preboot/Cryptexes/OS/usr/libexec',
  '/System/Volumes/Preboot/Cryptexes/OS/usr/share',
  '/Library/Apple/System/Library',
  '/Library',
  '/Library/Keychains',
  '/Library/Managed Preferences',
  '/Library/Preferences',
  '/System/Library/Keychains',
  '/bin',
  '/usr/bin',
  '/usr/lib',
  '/usr/libexec',
  '/usr/share',
  '/dev',
  '/dev/null',
  '/dev/random',
  '/dev/urandom',
  '/private/etc',
  '/private/etc/ssl',
  '/etc',
  '/etc/ssl',
  '/private/var/db',
  '/var/db',
  '/private/var/db/timezone',
  '/var/db/timezone'
];
const BACKEND_PROBE_CACHE = new Map();
const BACKEND_PROBE_FAILURES = new Map();
const BACKEND_PROBE_DIAGNOSTICS = [];
const MAX_PROBE_DIAGNOSTICS = 20;
const MAX_PROBE_OUTPUT_CHARS = 4000;

function createScriptWorkerLaunch(workerPath, execArgv = [], env = {}, options = {}) {
  const mode = normalizeOsSandboxMode(options.osSandboxMode);
  const platform = options.platform || process.platform;
  const workerTransportArg = platform === 'win32'
    ? SCRIPT_WORKER_FILE_TRANSPORT_ARG
    : SCRIPT_WORKER_STDIO_TRANSPORT_ARG;
  let sandbox;
  try {
    sandbox = createOsSandboxedProcessLaunch({
      platform,
      executablePath: process.execPath,
      args: [
        ...execArgv,
        workerPath,
        workerTransportArg
      ],
      env,
      mode,
      readOnlyPaths: scriptWorkerReadOnlyPaths(workerPath),
      bubblewrapPath: options.bubblewrapPath,
      macosSandboxExecPath: options.macosSandboxExecPath,
      probeArgs: [
        ...scriptWorkerOsSandboxProbeArgv(execArgv),
        '-e',
        'process.exit(0)'
      ],
      skipFunctionalProbe: options.skipOsSandboxFunctionalProbe === true || options.skipFunctionalProbe === true,
      windowsSandboxHelperPath: options.windowsSandboxHelperPath
    });
  } catch (error) {
    recordOsSandboxLaunchFailure(options, error, mode);
    throw error;
  }

  if (!sandbox.sandboxed) {
    const launch = {
      sandboxed: false,
      backend: OS_SANDBOX_BACKENDS.NONE,
      transport: 'ipc',
      workerPath,
      execArgv,
      env
    };
    recordOsSandboxSelection(options, launch);
    return launch;
  }

  const launch = {
    ...sandbox,
    transport: sandbox.backend === OS_SANDBOX_BACKENDS.WINDOWS_HELPER ? 'file' : 'stdio'
  };
  recordOsSandboxSelection(options, launch);
  return launch;
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
    const sandboxExecPath = findMacosSandboxExec(options.macosSandboxExecPath, platform);
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
    if (platform === process.platform && options.skipFunctionalProbe !== true && !macosSandboxExecUsable(sandboxExecPath, {
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
    if (platform === process.platform && options.skipFunctionalProbe !== true && !windowsSandboxHelperUsable(helperPath, {
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
    const privateTempDir = createWindowsPrivateTempDir(executablePath, 'postmeter-windows-sandbox-');
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
      env: windowsSandboxEnv(options.env || {}, privateTempDir),
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
  if (options.skipFunctionalProbe !== true && !bubblewrapUsable(bubblewrapPath, {
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

function recordOsSandboxSelection(options = {}, launch = {}) {
  const record = options.recordDiagnosticEvent;
  if (typeof record !== 'function') {
    return;
  }
  Promise.resolve(record({
    type: 'sandbox.os-backend.selected',
    level: launch.sandboxed ? 'info' : 'warn',
    outcome: launch.sandboxed ? 'completed' : 'degraded',
    failureCode: launch.sandboxed ? undefined : 'os_sandbox_backend_unavailable',
    fields: {
      backend: launch.backend || OS_SANDBOX_BACKENDS.NONE,
      platform: process.platform,
      sandboxed: launch.sandboxed === true,
      transport: launch.transport || ''
    }
  })).catch(() => {});
}

function recordOsSandboxLaunchFailure(options = {}, error, mode) {
  const record = options.recordDiagnosticEvent;
  if (typeof record !== 'function') {
    return;
  }
  Promise.resolve(record({
    type: 'sandbox.os-backend.launch.failed',
    level: 'error',
    outcome: 'failed',
    failureCode: mode === OS_SANDBOX_MODES.REQUIRED
      ? 'os_sandbox_backend_required_unavailable'
      : 'os_sandbox_backend_launch_failed',
    fields: {
      backend: OS_SANDBOX_BACKENDS.NONE,
      mode,
      platform: process.platform,
      sandboxed: false,
      error: error?.message || String(error)
    }
  })).catch(() => {});
}

function osSandboxStatus(options = {}) {
  const mode = normalizeOsSandboxMode(options.mode);
  const platform = options.platform || process.platform;
  const bubblewrapPath = platform === 'linux' ? findBubblewrap(options.bubblewrapPath) : '';
  const macosSandboxExecPath = platform === 'darwin' ? findMacosSandboxExec(options.macosSandboxExecPath, platform) : '';
  const windowsHelperPath = platform === 'win32' ? findWindowsSandboxHelper(options.windowsSandboxHelperPath, platform) : '';
  const linuxProbe = {
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    executablePath: realPathIfExists(process.execPath),
    readOnlyPaths: [runtimeExecutableRoot(process.execPath), ...scriptWorkerAppReadOnlyPaths()]
  };
  const macosProbe = {
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    executablePath: realPathIfExists(process.execPath),
    readOnlyPaths: [runtimeExecutableRoot(process.execPath), ...scriptWorkerAppReadOnlyPaths()]
  };
  const windowsProbe = {
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    executablePath: realPathIfExists(process.execPath),
    readOnlyPaths: [runtimeExecutableRoot(process.execPath), ...scriptWorkerAppReadOnlyPaths()]
  };
  const linuxSupported = platform === 'linux' && Boolean(bubblewrapPath) && bubblewrapUsable(bubblewrapPath, linuxProbe);
  const macosSupported = macosSandboxSupported(macosSandboxExecPath, platform, macosProbe);
  const windowsSupported = windowsSandboxSupported(windowsHelperPath, platform, windowsProbe);
  const supported = linuxSupported || macosSupported || windowsSupported;
  const seccompSupported = linuxSupported && linuxSeccompSupported();
  const probeFailure = supported
    ? ''
    : linuxProbeFailure(platform, bubblewrapPath, linuxProbe)
      || macosProbeFailure(platform, macosSandboxExecPath, macosProbe)
      || windowsProbeFailure(platform, windowsHelperPath, windowsProbe)
      || '';
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
    probeFailure,
    seccompSupported,
    seccompFilterFd: seccompSupported ? LINUX_SECCOMP_FILTER_FD : null
  };
}

function windowsSandboxSupported(windowsHelperPath, platform, options = {}) {
  return platform === 'win32' && Boolean(windowsHelperPath) && (
    platform !== process.platform
    || windowsSandboxHelperUsable(windowsHelperPath, options)
  );
}

function macosSandboxSupported(macosSandboxExecPath, platform, options = {}) {
  return platform === 'darwin' && Boolean(macosSandboxExecPath) && (
    platform !== process.platform
    || macosSandboxExecUsable(macosSandboxExecPath, options)
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

function findMacosSandboxExec(explicitPath, platform = process.platform) {
  if (explicitPath) {
    return executableFile(explicitPath, platform) ? explicitPath : '';
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
  const key = bubblewrapProbeKey(bubblewrapPath, executablePath, env, probeArgs);
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
  const result = spawnSync(bubblewrapPath, args, {
    env: {},
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 3000
  });
  const usable = result.status === 0;
  rememberProbeFailure(key, result, usable, {
    backend: OS_SANDBOX_BACKENDS.BUBBLEWRAP,
    launcherPath: bubblewrapPath,
    executablePath,
    runtimeRoot: runtimeExecutableRoot(executablePath),
    probeArgs,
    env: {},
    childEnv: env,
    launcherArgs: args,
    readOnlyPaths: [
      runtimeExecutableRoot(executablePath),
      ...(options.readOnlyPaths || [])
    ]
  });
  BACKEND_PROBE_CACHE.set(key, usable);
  return usable;
}

function macosSandboxExecUsable(sandboxExecPath, options = {}) {
  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  const env = options.env || {};
  const probeArgs = Array.isArray(options.probeArgs) ? options.probeArgs : ['-e', 'process.exit(0)'];
  const key = macosProbeKey(sandboxExecPath, executablePath, env, probeArgs);
  if (BACKEND_PROBE_CACHE.has(key)) {
    return BACKEND_PROBE_CACHE.get(key);
  }
  const privateTempDir = createPrivateTempDir('postmeter-macos-sandbox-probe-');
  try {
    const profile = macosSeatbeltProfile({
      executablePath,
      privateTempDir,
      readOnlyPaths: [
        runtimeExecutableRoot(executablePath),
        ...(options.readOnlyPaths || [])
      ]
    });
    const launchEnv = macosSandboxEnv(env, privateTempDir);
    const launcherArgs = [
      '-p',
      profile,
      executablePath,
      ...probeArgs
    ];
    const result = spawnSync(sandboxExecPath, [
      ...launcherArgs
    ], {
      env: launchEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 3000
    });
    const usable = result.status === 0;
    const differentials = usable ? [] : macosSandboxDifferentialProbes(sandboxExecPath, {
      executablePath,
      env: launchEnv,
      probeArgs,
      strictProfile: profile
    });
    rememberProbeFailure(key, result, usable, {
      backend: OS_SANDBOX_BACKENDS.MACOS_SEATBELT,
      launcherPath: sandboxExecPath,
      executablePath,
      runtimeRoot: runtimeExecutableRoot(executablePath),
      privateTempDir,
      probeArgs,
      env: launchEnv,
      launcherArgs,
      readOnlyPaths: [
        runtimeExecutableRoot(executablePath),
        ...(options.readOnlyPaths || [])
      ],
      profile,
      differentials
    });
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
  const key = windowsProbeKey(helperPath, executablePath, env, probeArgs, readOnlyPaths);
  if (BACKEND_PROBE_CACHE.has(key)) {
    return BACKEND_PROBE_CACHE.get(key);
  }
  const privateTempDir = createWindowsPrivateTempDir(executablePath, 'postmeter-windows-sandbox-probe-');
  try {
    const launchEnv = windowsSandboxEnv(env, privateTempDir);
    const launcherArgs = windowsHelperArgs({
      executablePath,
      args: probeArgs,
      env,
      privateTempDir,
      readOnlyPaths
    });
    const result = spawnSync(helperPath, launcherArgs, {
      env: launchEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: WINDOWS_HELPER_PROBE_TIMEOUT_MILLIS
    });
    const usable = result.status === 0;
    rememberProbeFailure(key, result, usable, {
      backend: OS_SANDBOX_BACKENDS.WINDOWS_HELPER,
      launcherPath: helperPath,
      executablePath,
      runtimeRoot: runtimeExecutableRoot(executablePath),
      privateTempDir,
      probeArgs,
      env: launchEnv,
      launcherArgs,
      readOnlyPaths
    });
    BACKEND_PROBE_CACHE.set(key, usable);
    return usable;
  } finally {
    cleanupPrivateTempDir(privateTempDir);
  }
}

function macosSandboxDifferentialProbes(sandboxExecPath, options = {}) {
  const probes = [
    {
      name: 'true-allow-default',
      executablePath: '/usr/bin/true',
      args: [],
      env: {},
      profile: '(version 1)\n(allow default)'
    },
    {
      name: 'electron-allow-default',
      executablePath: options.executablePath,
      args: options.probeArgs || [],
      env: options.env || {},
      profile: '(version 1)\n(allow default)'
    },
    {
      name: 'electron-allow-default-deny-network',
      executablePath: options.executablePath,
      args: options.probeArgs || [],
      env: options.env || {},
      profile: '(version 1)\n(allow default)\n(deny network*)'
    }
  ];
  if (options.strictProfile) {
    const strictReadProbeGroups = [
      ['strict-plus-library-read', ['/Library']],
      ['strict-plus-user-library-read', os.homedir() ? [path.join(os.homedir(), 'Library')] : []],
      ['strict-plus-user-service-cache-root-read', macosUserServiceCacheRootReadPaths()],
      ['strict-plus-user-temp-read', [os.tmpdir()].filter(Boolean)],
      ['strict-plus-private-var-read', ['/private/var', '/var']],
      ['strict-plus-applications-read', ['/Applications']]
    ];
    for (const [name, paths] of strictReadProbeGroups) {
      const fileReadRule = macosSeatbeltFileReadRule(paths);
      if (fileReadRule) {
        probes.push({
          name,
          executablePath: options.executablePath,
          args: options.probeArgs || [],
          env: options.env || {},
          profile: `${options.strictProfile}\n${fileReadRule}`
        });
      }
    }
    probes.push(
      {
        name: 'strict-plus-file-read-all',
        executablePath: options.executablePath,
        args: options.probeArgs || [],
        env: options.env || {},
        profile: `${options.strictProfile}\n(allow file-read*)`
      },
      {
        name: 'strict-plus-file-all',
        executablePath: options.executablePath,
        args: options.probeArgs || [],
        env: options.env || {},
        profile: `${options.strictProfile}\n(allow file*)`
      },
      {
        name: 'strict-plus-process-star',
        executablePath: options.executablePath,
        args: options.probeArgs || [],
        env: options.env || {},
        profile: `${options.strictProfile}\n(allow process*)`
      },
      {
        name: 'strict-plus-default',
        executablePath: options.executablePath,
        args: options.probeArgs || [],
        env: options.env || {},
        profile: `${options.strictProfile}\n(allow default)`
      }
    );
  }

  return probes
    .filter((probe) => probe.executablePath && fs.existsSync(probe.executablePath))
    .map((probe) => {
      const result = spawnSync(sandboxExecPath, [
        '-p',
        probe.profile,
        probe.executablePath,
        ...probe.args
      ], {
        env: probe.env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 3000
      });
      return {
        name: probe.name,
        executable: pathDetails(probe.executablePath),
        profileHash: shortHash(probe.profile),
        result: summarizeProbeResult(result)
      };
    });
}

function bubblewrapProbeKey(bubblewrapPath, executablePath, env = {}, probeArgs = []) {
  return `bubblewrap:${bubblewrapPath}:${executablePath}:${env.ELECTRON_RUN_AS_NODE || ''}:${probeArgs.join('\0')}`;
}

function macosProbeKey(sandboxExecPath, executablePath, env = {}, probeArgs = []) {
  return `macos-seatbelt:${sandboxExecPath}:${executablePath}:${env.ELECTRON_RUN_AS_NODE || ''}:${probeArgs.join('\0')}`;
}

function windowsProbeKey(helperPath, executablePath, env = {}, probeArgs = [], readOnlyPaths = []) {
  return `windows-helper:${helperPath}:${executablePath}:${env.ELECTRON_RUN_AS_NODE || ''}:${probeArgs.join('\0')}:${readOnlyPaths.join('\0')}`;
}

function linuxProbeFailure(platform, bubblewrapPath, options = {}) {
  if (platform !== 'linux' || !bubblewrapPath) {
    return '';
  }
  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  const env = {
    POSTMETER_SCRIPT_WORKER: '1',
    ...(options.env || {})
  };
  const probeArgs = Array.isArray(options.probeArgs) ? options.probeArgs : ['-e', 'process.exit(0)'];
  return BACKEND_PROBE_FAILURES.get(bubblewrapProbeKey(bubblewrapPath, executablePath, env, probeArgs)) || '';
}

function macosProbeFailure(platform, sandboxExecPath, options = {}) {
  if (platform !== 'darwin' || !sandboxExecPath) {
    return '';
  }
  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  const env = options.env || {};
  const probeArgs = Array.isArray(options.probeArgs) ? options.probeArgs : ['-e', 'process.exit(0)'];
  return BACKEND_PROBE_FAILURES.get(macosProbeKey(sandboxExecPath, executablePath, env, probeArgs)) || '';
}

function windowsProbeFailure(platform, helperPath, options = {}) {
  if (platform !== 'win32' || !helperPath) {
    return '';
  }
  const executablePath = realPathIfExists(options.executablePath || process.execPath);
  const env = options.env || {};
  const probeArgs = Array.isArray(options.probeArgs) ? options.probeArgs : ['-e', 'process.exit(0)'];
  const readOnlyPaths = windowsReadOnlyPaths([
    runtimeExecutableRoot(executablePath),
    ...(options.readOnlyPaths || []),
    executablePath
  ]);
  return BACKEND_PROBE_FAILURES.get(windowsProbeKey(helperPath, executablePath, env, probeArgs, readOnlyPaths)) || '';
}

function rememberProbeFailure(key, result, usable, context = {}) {
  recordProbeDiagnostic(key, result, usable, context);
  if (usable) {
    BACKEND_PROBE_FAILURES.delete(key);
    return;
  }
  BACKEND_PROBE_FAILURES.set(key, probeFailureSummary(result, context));
}

function probeFailureSummary(result = {}, context = {}) {
  const parts = [];
  if (result.error?.message) {
    parts.push(result.error.message);
  }
  if (result.status != null) {
    parts.push(`exit status ${result.status}`);
  } else if (result.signal) {
    parts.push(`signal ${result.signal}`);
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (output) {
    parts.push(output.slice(0, 2000));
  }
  const diagnostic = formatProbeDiagnosticSummary(context, result);
  if (diagnostic) {
    parts.push(diagnostic);
  }
  return parts.join(': ');
}

function recordProbeDiagnostic(key, result = {}, usable = false, context = {}) {
  const diagnostic = createProbeDiagnostic(key, result, usable, context);
  BACKEND_PROBE_DIAGNOSTICS.push(diagnostic);
  while (BACKEND_PROBE_DIAGNOSTICS.length > MAX_PROBE_DIAGNOSTICS) {
    BACKEND_PROBE_DIAGNOSTICS.shift();
  }
}

function consumeOsSandboxProbeDiagnostics() {
  const diagnostics = BACKEND_PROBE_DIAGNOSTICS.slice();
  BACKEND_PROBE_DIAGNOSTICS.length = 0;
  return diagnostics;
}

function clearOsSandboxProbeDiagnostics() {
  BACKEND_PROBE_DIAGNOSTICS.length = 0;
}

function createProbeDiagnostic(key, result = {}, usable = false, context = {}) {
  const env = context.env || {};
  return {
    timestamp: new Date().toISOString(),
    keyHash: shortHash(key),
    backend: context.backend || '',
    platform: process.platform,
    arch: process.arch,
    usable: usable === true,
    result: summarizeProbeResult(result),
    launcher: pathDetails(context.launcherPath),
    executable: pathDetails(context.executablePath),
    runtimeRoot: pathDetails(context.runtimeRoot),
    privateTempDir: pathDetails(context.privateTempDir),
    probeArgs: summarizeArgs(context.probeArgs || []),
    launcherArgs: summarizeArgs(context.launcherArgs || []),
    env: summarizeEnv(env),
    childEnv: context.childEnv ? summarizeEnv(context.childEnv) : undefined,
    readOnlyPaths: summarizePaths(context.readOnlyPaths || []),
    profile: context.profile ? summarizeSeatbeltProfile(context.profile) : undefined,
    differentials: Array.isArray(context.differentials) && context.differentials.length
      ? context.differentials
      : undefined
  };
}

function formatProbeDiagnosticSummary(context = {}, result = {}) {
  const diagnostic = createProbeDiagnostic('', result, false, context);
  const pieces = [
    `diagnostic backend=${diagnostic.backend || 'unknown'}`,
    `platform=${diagnostic.platform}/${diagnostic.arch}`,
    `launcher=${diagnostic.launcher.basename || 'none'} exists=${diagnostic.launcher.exists}`,
    `executable=${diagnostic.executable.basename || 'none'} exists=${diagnostic.executable.exists}`,
    `runtimeRoot=${diagnostic.runtimeRoot.basename || 'none'} exists=${diagnostic.runtimeRoot.exists}`,
    `envKeys=${diagnostic.env.keys.join(',') || 'none'}`,
    `argShape=${diagnostic.launcherArgs.shape.join(' ') || 'none'}`
  ];
  if (diagnostic.profile) {
    pieces.push(`profileHash=${diagnostic.profile.sha256.slice(0, 12)} profileLines=${diagnostic.profile.lineCount}`);
  }
  return pieces.join('; ');
}

function summarizeProbeResult(result = {}) {
  return {
    status: result.status ?? null,
    signal: result.signal || '',
    errorName: result.error?.name || '',
    errorCode: result.error?.code || '',
    errorMessage: sanitizeProbeOutput(result.error?.message || ''),
    stdout: sanitizeProbeOutput(result.stdout || '').slice(0, MAX_PROBE_OUTPUT_CHARS),
    stderr: sanitizeProbeOutput(result.stderr || '').slice(0, MAX_PROBE_OUTPUT_CHARS),
    timedOut: result.error?.code === 'ETIMEDOUT'
  };
}

function summarizeArgs(args = []) {
  const values = Array.isArray(args) ? args : [];
  return {
    count: values.length,
    shape: values.map((arg) => summarizeArg(arg))
  };
}

function summarizeArg(arg) {
  const value = String(arg ?? '');
  if (!value) {
    return '';
  }
  const envAssignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(value);
  if (envAssignment && looksLikePath(envAssignment[2])) {
    const details = pathDetails(envAssignment[2]);
    return `${envAssignment[1]}=<path:${details.basename || 'unknown'}:${details.exists ? 'exists' : 'missing'}>`;
  }
  if (value.includes('\n')) {
    return `<multiline:${shortHash(value)}:${value.length}>`;
  }
  if (looksLikePath(value)) {
    const details = pathDetails(value);
    return `<path:${details.basename || 'unknown'}:${details.exists ? 'exists' : 'missing'}>`;
  }
  if (value.length > 160) {
    return `${value.slice(0, 80)}...<${value.length}:${shortHash(value)}>`;
  }
  return value;
}

function summarizeEnv(env = {}) {
  const entries = Object.entries(env || {}).sort(([left], [right]) => left.localeCompare(right));
  return {
    keys: entries.map(([key]) => key),
    values: entries.map(([key, value]) => ({
      key,
      value: summarizeEnvValue(key, value)
    }))
  };
}

function summarizeEnvValue(key, value) {
  const stringValue = String(value ?? '');
  if (['POSTMETER_SCRIPT_WORKER', 'ELECTRON_RUN_AS_NODE'].includes(key)) {
    return stringValue;
  }
  if (looksLikePath(stringValue)) {
    return pathDetails(stringValue);
  }
  return {
    length: stringValue.length,
    sha256: shortHash(stringValue)
  };
}

function summarizePaths(paths = []) {
  const values = Array.isArray(paths) ? paths : [];
  return {
    count: values.length,
    items: values.slice(0, 40).map(pathDetails),
    truncated: values.length > 40
  };
}

function summarizeSeatbeltProfile(profile) {
  const normalized = String(profile || '');
  return {
    length: normalized.length,
    sha256: crypto.createHash('sha256').update(normalized).digest('hex'),
    lineCount: normalized.split(/\r?\n/).length,
    lines: normalized.split(/\r?\n/).map(sanitizeProbeOutput)
  };
}

function pathDetails(value) {
  const raw = String(value || '');
  if (!raw) {
    return {
      present: false,
      exists: false,
      basename: ''
    };
  }
  const parsed = parseAnyPath(raw);
  const details = {
    present: true,
    exists: false,
    absolute: path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw),
    drive: (/^([A-Za-z]:)[\\/]/.exec(raw) || [])[1] || '',
    basename: parsed.basename,
    parentBasename: parsed.parentBasename,
    extension: parsed.extension,
    length: raw.length
  };
  try {
    const stat = fs.statSync(raw);
    details.exists = true;
    details.type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
    details.size = stat.isFile() ? stat.size : undefined;
    details.mode = stat.mode != null ? `0${(stat.mode & 0o777).toString(8)}` : undefined;
  } catch (error) {
    details.exists = false;
    details.errorCode = error?.code || '';
  }
  return details;
}

function parseAnyPath(value) {
  const parser = /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\') ? path.win32 : path.posix;
  const basename = parser.basename(value);
  const dirname = parser.dirname(value);
  return {
    basename,
    parentBasename: dirname && dirname !== value ? parser.basename(dirname) : '',
    extension: parser.extname(value)
  };
}

function looksLikePath(value) {
  const text = String(value || '');
  return /^[A-Za-z]:[\\/]/.test(text)
    || text.startsWith('/')
    || text.startsWith('\\\\')
    || text.includes('/node_modules/')
    || text.includes('\\node_modules\\')
    || text.includes('.app/')
    || text.includes('.app\\');
}

function sanitizeProbeOutput(value) {
  return String(value || '')
    .replace(/[A-Za-z]:\\(?:[^\\\r\n"'<>]+\\?)+/g, (match) => `<path:${parseAnyPath(match).basename || 'windows'}>`)
    .replace(/\/(?:Users|home|tmp|var|private|workspace|Volumes)\/[^\s"'<>]+/g, (match) => `<path:${parseAnyPath(match).basename || 'posix'}>`);
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
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
    CFFIXED_USER_HOME: privateTempDir,
    HOME: privateTempDir,
    TMPDIR: privateTempDir,
    TMP: privateTempDir,
    TEMP: privateTempDir
  };
  const user = process.env.USER || process.env.LOGNAME || 'postmeter';
  output.USER = user;
  output.LOGNAME = process.env.LOGNAME || user;
  if (env.ELECTRON_RUN_AS_NODE) {
    output.ELECTRON_RUN_AS_NODE = '1';
  }
  return output;
}

function macosSeatbeltProfile(options) {
  const privateTempDir = normalizePath(options.privateTempDir);
  const processExecRules = macosProcessExecRules(options.executablePath);
  const configuredReadPaths = [
    options.executablePath,
    privateTempDir,
    ...(options.readOnlyPaths || []),
    ...MACOS_SYSTEM_READ_PATHS,
    ...macosUserLibraryReadPaths(),
    ...macosUserServiceCacheReadPaths()
  ];
  const readPaths = configuredReadPaths.flatMap(pathVariants);
  const readRules = Array.from(new Set(readPaths))
    .map((item) => `(subpath "${escapeSeatbeltString(item)}")`)
    .join(' ');
  const readAccessRules = [`(literal "${escapeSeatbeltString(path.sep)}")`, readRules].filter(Boolean).join(' ');
  const metadataRules = macosParentMetadataPaths(configuredReadPaths)
    .map((item) => `(literal "${escapeSeatbeltString(item)}")`)
    .join(' ');
  const writeRules = pathVariants(privateTempDir)
    .map((item) => `(subpath "${escapeSeatbeltString(item)}")`)
    .join(' ');
  return [
    '(version 1)',
    '(deny default)',
    `(allow process-exec ${processExecRules})`,
    '(allow process-fork)',
    '(allow process-info*)',
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    '(allow mach-register)',
    '(allow ipc-posix*)',
    '(allow system-socket)',
    '(allow iokit-open)',
    '(allow user-preference-read)',
    `(allow file-read-metadata ${metadataRules})`,
    `(allow file-map-executable ${readRules})`,
    `(allow file-read* ${readAccessRules})`,
    `(allow file-write* ${writeRules} (literal "/dev/null"))`,
    '(deny network*)'
  ].join('\n');
}

function macosProcessExecRules(executablePath) {
  const rules = new Set();
  for (const item of pathVariants(executablePath)) {
    rules.add(`(literal "${escapeSeatbeltString(item)}")`);
  }
  const runtimeRoot = runtimeExecutableRoot(executablePath);
  for (const item of pathVariants(runtimeRoot)) {
    if (item && item !== executablePath) {
      rules.add(`(subpath "${escapeSeatbeltString(item)}")`);
    }
  }
  return Array.from(rules).join(' ');
}

function macosUserLibraryReadPaths() {
  const home = os.homedir();
  if (!home) {
    return [];
  }
  return [
    path.join(home, 'Library'),
    path.join(home, 'Library', 'Preferences'),
    path.join(home, 'Library', 'Application Support', 'com.apple.LaunchServices'),
    path.join(home, 'Library', 'Application Support', 'com.apple.sharedfilelist'),
    path.join(home, 'Library', 'Application Support', 'CrashReporter'),
    path.join(home, 'Library', 'Caches', 'com.apple.LaunchServices')
  ];
}

function macosUserServiceCacheReadPaths() {
  const roots = macosUserServiceCacheRootReadPaths();
  if (!roots.length) {
    return [];
  }
  const tempRoot = roots[0];
  return [
    path.join(tempRoot, 'C'),
    path.join(tempRoot, 'C', 'com.apple.LaunchServices'),
    path.join(tempRoot, 'C', 'com.apple.iconservices'),
    path.join(tempRoot, 'C', 'com.apple.IntlDataCache.le'),
    path.join(tempRoot, '0')
  ];
}

function macosUserServiceCacheRootReadPaths() {
  const tempRoot = path.dirname(normalizePath(os.tmpdir()).replace(/\/+$/, ''));
  if (!tempRoot || tempRoot === path.dirname(tempRoot)) {
    return [];
  }
  return [tempRoot];
}

function macosSeatbeltFileReadRule(paths = []) {
  const rules = Array.from(new Set(paths.flatMap(pathVariants)))
    .map((item) => `(subpath "${escapeSeatbeltString(item)}")`)
    .join(' ');
  return rules ? `(allow file-read* ${rules})` : '';
}

function escapeSeatbeltString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function macosParentMetadataPaths(paths) {
  const parents = new Set();
  for (const item of paths.flatMap(pathVariants)) {
    let current = path.dirname(item);
    while (current && current !== path.dirname(current)) {
      parents.add(current);
      current = path.dirname(current);
    }
  }
  return Array.from(parents).filter(Boolean);
}

function windowsHelperArgs(options = {}) {
  const childEnv = windowsSandboxEnv(options.env || {}, options.privateTempDir);
  const childArgs = windowsElectronNodeArgs(options.args || [], options.env || {}, options.privateTempDir);
  return [
    '--profile',
    WINDOWS_APP_CONTAINER_PROFILE,
    '--temp',
    options.privateTempDir,
    ...flatMap(Object.entries(childEnv).sort(([left], [right]) => left.localeCompare(right)), ([key, value]) => [
      '--env',
      `${key}=${value}`
    ]),
    ...flatMap(options.readOnlyPaths || [], (readOnlyPath) => ['--read-only', readOnlyPath]),
    '--',
    options.executablePath || process.execPath,
    ...childArgs
  ];
}

function windowsElectronNodeArgs(args = [], env = {}, privateTempDir = '') {
  let values = Array.isArray(args) ? args.slice() : [];
  if (
    env.ELECTRON_RUN_AS_NODE !== '1'
    || values.includes(SCRIPT_WORKER_STDIO_TRANSPORT_ARG)
  ) {
    return values;
  }
  if (values.includes(SCRIPT_WORKER_FILE_TRANSPORT_ARG)) {
    values = windowsScriptWorkerFileTransportArgs(values, privateTempDir);
  }
  if (values.includes(WINDOWS_ELECTRON_NO_STDIO_INIT)) {
    return values;
  }
  return [
    WINDOWS_ELECTRON_NO_STDIO_INIT,
    ...values
  ];
}

function windowsScriptWorkerFileTransportArgs(args, privateTempDir = '') {
  if (!privateTempDir || !args.includes('--permission')) {
    return args;
  }
  const additions = [
    `--allow-fs-read=${privateTempDir}`,
    `--allow-fs-write=${privateTempDir}`
  ].filter((flag) => !args.includes(flag));
  if (!additions.length) {
    return args;
  }
  const markerIndex = args.indexOf(SCRIPT_WORKER_FILE_TRANSPORT_ARG);
  const insertIndex = markerIndex > 0 ? markerIndex - 1 : args.length;
  return [
    ...args.slice(0, insertIndex),
    ...additions,
    ...args.slice(insertIndex)
  ];
}

function windowsSandboxEnv(env, privateTempDir = os.tmpdir()) {
  const output = {
    POSTMETER_SCRIPT_WORKER: '1',
    POSTMETER_SCRIPT_WORKER_TRANSPORT_DIR: privateTempDir,
    APPDATA: privateTempDir,
    LOCALAPPDATA: privateTempDir,
    TEMP: privateTempDir,
    USERPROFILE: privateTempDir,
    TMP: privateTempDir,
    TMPDIR: privateTempDir
  };
  const parsedTemp = path.win32.parse(privateTempDir);
  if (parsedTemp.root && /^[A-Za-z]:\\?$/.test(parsedTemp.root)) {
    output.HOMEDRIVE = parsedTemp.root.slice(0, 2);
    output.HOMEPATH = privateTempDir.slice(output.HOMEDRIVE.length) || '\\';
  }
  for (const key of ['ComSpec', 'SystemDrive', 'SystemRoot', 'WINDIR']) {
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
    runtimeExecutableRoot(process.execPath),
    ...scriptWorkerAppReadOnlyPaths(workerPath)
  ];
  return paths.filter(Boolean);
}

function scriptWorkerOsSandboxProbeArgv(execArgv = [], platform = process.platform) {
  if (platform === 'win32') {
    return [];
  }
  return execArgv;
}

function scriptWorkerAppReadOnlyPaths(workerPath = path.join(__dirname, 'scriptWorker.js'), platform = process.platform) {
  if (platform === 'win32') {
    return [
      scriptWorkerCoreRoot(workerPath),
      scriptWorkerPackageScopeReadPath(workerPath)
    ].filter(Boolean);
  }
  return scriptWorkerRuntimeReadOnlyPaths(workerPath);
}

function scriptWorkerRuntimeReadOnlyPaths(workerPath = path.join(__dirname, 'scriptWorker.js')) {
  const coreRoot = path.dirname(workerPath);
  return SCRIPT_WORKER_RUNTIME_FILE_BASENAMES
    .map((basename) => normalizeExistingPath(path.join(coreRoot, basename)))
    .filter(Boolean);
}

function scriptWorkerCoreRoot(workerPath = path.join(__dirname, 'scriptWorker.js')) {
  return normalizeExistingPath(path.dirname(workerPath));
}

function scriptWorkerPackageScopeReadPath(workerPath = path.join(__dirname, 'scriptWorker.js')) {
  const workerRoot = normalizePath(path.dirname(workerPath));
  const root = projectRoot();
  const relativeWorkerRoot = path.relative(root, workerRoot);
  if (
    !relativeWorkerRoot
    || relativeWorkerRoot === '..'
    || relativeWorkerRoot.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeWorkerRoot)
  ) {
    return '';
  }
  return normalizeExistingPath(path.join(root, 'package.json'));
}

function projectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function runtimeExecutableRoot(executablePath) {
  const realExecutablePath = realPathIfExists(executablePath);
  if (!realExecutablePath) {
    return '';
  }
  const appBundleRoot = macosAppBundleRoot(realExecutablePath);
  if (appBundleRoot) {
    return appBundleRoot;
  }
  if (realExecutablePath.startsWith('/usr/bin/') || realExecutablePath.startsWith('/bin/')) {
    return realExecutablePath;
  }
  return path.dirname(realExecutablePath);
}

function macosAppBundleRoot(filePath) {
  const parts = normalizePath(filePath).split(path.sep);
  const appIndex = parts.findIndex((part) => part.endsWith('.app'));
  if (appIndex === -1) {
    return '';
  }
  return parts.slice(0, appIndex + 1).join(path.sep) || path.sep;
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

function pathVariants(value) {
  const normalized = normalizePath(value);
  if (!normalized) {
    return [];
  }
  const variants = new Set([normalized]);
  try {
    variants.add(fs.realpathSync(normalized));
  } catch {}
  for (const item of Array.from(variants)) {
    if (item.startsWith('/private/')) {
      variants.add(item.slice('/private'.length) || path.sep);
    } else if (item.startsWith('/var/') || item.startsWith('/tmp/')) {
      variants.add(`/private${item}`);
    }
  }
  return Array.from(variants).filter(Boolean);
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
    if (platform !== process.platform) {
      return true;
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

function createWindowsPrivateTempDir(executablePath, prefix) {
  const executableRoot = path.parse(executablePath || '').root.toLowerCase();
  const defaultTempRoot = path.parse(os.tmpdir()).root.toLowerCase();
  if (!executableRoot || executableRoot === defaultTempRoot) {
    return createPrivateTempDir(prefix);
  }

  const candidates = [
    process.cwd(),
    path.dirname(executablePath || '')
  ];
  for (const candidate of candidates) {
    try {
      if (!candidate || path.parse(candidate).root.toLowerCase() !== executableRoot) {
        continue;
      }
      const stat = fs.statSync(candidate);
      if (!stat.isDirectory()) {
        continue;
      }
      return fs.mkdtempSync(path.join(candidate, prefix));
    } catch {}
  }
  return createPrivateTempDir(prefix);
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
  clearOsSandboxProbeDiagnostics,
  cleanupPrivateTempDir,
  consumeOsSandboxProbeDiagnostics,
  osSandboxStatus,
  normalizeOsSandboxMode,
  prepareSeccompStdio,
  scriptWorkerAppReadOnlyPaths,
  scriptWorkerRuntimeReadOnlyPaths
};
