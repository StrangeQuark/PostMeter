const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  OS_SANDBOX_MODES,
  _createStdioChildTransportForTest,
  osSandboxStatus,
  runPostmanScriptIsolated,
  scriptWorkerEnv,
  scriptWorkerExecArgv,
  scriptWorkerMaxOldSpaceMb,
  scriptWorkerRequiresNodePermission,
  supportsNodePermissionFlags
} = require('../../src/core/sandbox/scriptSandbox');
const {
  createOsSandboxedProcessLaunch,
  createScriptWorkerLaunch,
  cleanupPrivateTempDir,
  scriptWorkerAppReadOnlyPaths
} = require('../../src/core/sandbox/osSandbox');
const {
  MemoryVaultStore
} = require('../../src/core/sandbox/vaultStore');
const { defaultDiagnosticsSettings, sanitizeDiagnosticEvent } = require('../../src/core/diagnostics-release/diagnostics');

test('runs scripts in an isolated worker and returns variable mutations', async () => {
  const environment = { variables: [{ enabled: true, key: 'token', value: 'old' }] };
  const collectionVariables = [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }];

  const execution = await runPostmanScriptIsolated(`
    pm.environment.set('token', 'new');
    pm.collectionVariables.set('fromWorker', 'yes');
    pm.test('isolated variables', function () {
      pm.expect(pm.variables.replaceIn('{{baseUrl}}/{{token}}')).to.equal('https://api.example.test/new');
    });
  `, {
    environment,
    collectionVariables
  });

  assert.equal(execution.result.passed, true);
  assert.equal(execution.environmentVariables.find((item) => item.key === 'token').value, 'new');
  assert.equal(execution.collectionVariables.find((item) => item.key === 'fromWorker').value, 'yes');
  assert.equal(environment.variables.find((item) => item.key === 'token').value, 'old');
});

test('uses Node permission flags for script workers when the runtime supports them', () => {
  const execArgv = scriptWorkerExecArgv();
  assert.ok(execArgv.includes('--max-old-space-size=64'));
  if (supportsNodePermissionFlags()) {
    assert.ok(execArgv.includes('--permission'));
    assert.ok(execArgv.some((value) => value.startsWith('--allow-fs-read=')));
  } else {
    assert.deepEqual(execArgv, ['--max-old-space-size=64']);
  }
});

test('does not let environment variables disable script worker permission flags', () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'allowedNodeEnvironmentFlags');
  const originalDisable = process.env.POSTMETER_DISABLE_NODE_PERMISSION;
  try {
    Object.defineProperty(process, 'allowedNodeEnvironmentFlags', {
      value: new Set(['--permission', '--allow-fs-read']),
      configurable: true
    });
    process.env.POSTMETER_DISABLE_NODE_PERMISSION = '1';

    const execArgv = scriptWorkerExecArgv();
    const fileReadFlags = execArgv.filter((value) => value.startsWith('--allow-fs-read='));

    assert.ok(execArgv.includes('--permission'));
    assert.equal(fileReadFlags.length, 8);
    assert.equal(fileReadFlags.some((value) => value.includes(',')), false);
    assert.deepEqual(
      fileReadFlags
        .map((value) => path.basename(value.slice('--allow-fs-read='.length)))
        .sort(),
      [
        'dynamicVariables.js',
        'postmanBuiltinPackages.js',
        'postmanSandboxBootcodeBundle.js',
        'sandboxPackageCache.js',
        'scriptRuntime.js',
        'scriptWorker.js',
        'variableScope.js',
        'visualizerHandlebarsBundle.js'
      ]
    );
  } finally {
    if (originalDisable == null) {
      delete process.env.POSTMETER_DISABLE_NODE_PERMISSION;
    } else {
      process.env.POSTMETER_DISABLE_NODE_PERMISSION = originalDisable;
    }
    Object.defineProperty(process, 'allowedNodeEnvironmentFlags', descriptor);
  }
});

test('fails closed when script worker permission flags are required but unavailable', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'allowedNodeEnvironmentFlags');
  try {
    Object.defineProperty(process, 'allowedNodeEnvironmentFlags', {
      value: new Set(),
      configurable: true
    });

    assert.equal(scriptWorkerRequiresNodePermission({ requireNodePermission: true }), true);
    assert.throws(
      () => scriptWorkerExecArgv({ requireNodePermission: true }),
      /requires Node permission flags/
    );

    const execution = await runPostmanScriptIsolated(`
      pm.test('should not execute', function () {
        pm.expect(true).to.equal(false);
      });
    `, {}, {
      requireNodePermission: true,
      timeoutMillis: 500,
      workerTimeoutMillis: 1000
    });

    assert.equal(execution.result.passed, false);
    assert.match(execution.result.error, /requires Node permission flags/);
    assert.equal(execution.result.commitSideEffects, false);
  } finally {
    Object.defineProperty(process, 'allowedNodeEnvironmentFlags', descriptor);
  }
});

test('bounds script worker heap-size overrides', () => {
  assert.equal(scriptWorkerMaxOldSpaceMb({ maxOldSpaceMb: 8 }), 16);
  assert.equal(scriptWorkerMaxOldSpaceMb({ maxOldSpaceMb: 128 }), 128);
  assert.equal(scriptWorkerMaxOldSpaceMb({ maxOldSpaceMb: 2048 }), 512);
  assert.ok(scriptWorkerExecArgv({ maxOldSpaceMb: 128 }).includes('--max-old-space-size=128'));
});

test('starts script workers with a minimal environment', () => {
  const original = process.env.POSTMETER_SCRIPT_ENV_SECRET;
  process.env.POSTMETER_SCRIPT_ENV_SECRET = 'do-not-inherit';
  try {
    const env = scriptWorkerEnv();
    assert.equal(env.POSTMETER_SCRIPT_WORKER, '1');
    assert.equal(env.POSTMETER_SCRIPT_ENV_SECRET, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.PATH, undefined);
  } finally {
    if (original == null) {
      delete process.env.POSTMETER_SCRIPT_ENV_SECRET;
    } else {
      process.env.POSTMETER_SCRIPT_ENV_SECRET = original;
    }
  }
});

test('runs workers inside the required OS sandbox when a backend is available', async (t) => {
  const status = osSandboxStatus({ mode: OS_SANDBOX_MODES.REQUIRED });
  if (!status.supported) {
    t.skip('No OS sandbox backend is available on this platform.');
    return;
  }

  const execution = await runPostmanScriptIsolated(`
    pm.environment.set('osSandboxed', 'yes');
    pm.test('required OS sandbox executes script', function () {
      pm.expect(pm.environment.get('osSandboxed')).to.equal('yes');
    });
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    osSandboxMode: OS_SANDBOX_MODES.REQUIRED,
    timeoutMillis: 500,
    workerTimeoutMillis: 2000
  });

  assert.equal(execution.result.passed, true);
  assert.equal(execution.environmentVariables.find((item) => item.key === 'osSandboxed').value, 'yes');
});

test('adds a Linux seccomp syscall policy to bubblewrap launches', (t) => {
  const status = osSandboxStatus({ mode: OS_SANDBOX_MODES.REQUIRED });
  if (!status.supported || !status.seccompSupported) {
    t.skip('No seccomp-capable Linux OS sandbox backend is available on this platform.');
    return;
  }

  const launch = createOsSandboxedProcessLaunch({
    mode: OS_SANDBOX_MODES.REQUIRED,
    args: ['-e', 'process.exit(0)'],
    env: scriptWorkerEnv()
  });

  assert.equal(launch.sandboxed, true);
  assert.equal(launch.backend, 'bubblewrap');
  assert.deepEqual(launch.args.slice(launch.args.indexOf('--seccomp'), launch.args.indexOf('--seccomp') + 2), ['--seccomp', String(status.seccompFilterFd)]);
  assert.ok(Buffer.isBuffer(launch.seccompPolicy.filter));
  assert.ok(launch.seccompPolicy.filter.length > 0);
  assert.ok(launch.seccompPolicy.deniedSyscalls.includes('bpf'));
  assert.ok(launch.seccompPolicy.deniedSyscalls.includes('ptrace'));
  assert.ok(launch.seccompPolicy.deniedSyscalls.includes('unshare'));
  assert.ok(launch.seccompPolicy.deniedSyscalls.includes('clone3'));
});

test('falls back in auto mode when a Linux OS sandbox backend exists but cannot launch', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Linux-only bubblewrap launch probe.');
    return;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-bwrap-probe-'));
  const failingBwrap = path.join(dir, 'bwrap');
  await fs.writeFile(failingBwrap, '#!/bin/sh\necho "probe failed" >&2\nexit 1\n', { mode: 0o755 });

  const autoLaunch = createScriptWorkerLaunch(
    path.join(__dirname, '..', '..', 'src', 'core', 'sandbox', 'scriptWorker.js'),
    [],
    scriptWorkerEnv(),
    { osSandboxMode: OS_SANDBOX_MODES.AUTO, bubblewrapPath: failingBwrap }
  );
  assert.equal(autoLaunch.sandboxed, false);

  assert.throws(
    () => createScriptWorkerLaunch(
      path.join(__dirname, '..', '..', 'src', 'core', 'sandbox', 'scriptWorker.js'),
      [],
      scriptWorkerEnv(),
      { osSandboxMode: OS_SANDBOX_MODES.REQUIRED, bubblewrapPath: failingBwrap }
    ),
    /bubblewrap failed its functional probe/
  );
});

test('records OS sandbox backend selection diagnostics for script workers', async () => {
  const events = [];
  const launch = createScriptWorkerLaunch(
    path.join(__dirname, '..', '..', 'src', 'core', 'sandbox', 'scriptWorker.js'),
    [],
    scriptWorkerEnv(),
    {
      osSandboxMode: OS_SANDBOX_MODES.OFF,
      recordDiagnosticEvent: async (event) => {
        events.push(event);
      }
    }
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(launch.sandboxed, false);
  assert.ok(events.some((event) => (
    event.type === 'sandbox.os-backend.selected'
      && event.outcome === 'degraded'
      && event.failureCode === 'os_sandbox_backend_unavailable'
      && event.fields.backend === 'none'
      && event.fields.sandboxed === false
  )));
});

test('fails closed when the required OS sandbox backend is unavailable', async () => {
  const events = [];
  const unavailableBackendOptions = process.platform === 'win32'
    ? { windowsSandboxHelperPath: path.join(os.tmpdir(), 'definitely-not-postmeter-helper.exe') }
    : process.platform === 'darwin'
      ? { macosSandboxExecPath: '/definitely/not/sandbox-exec' }
      : { bubblewrapPath: '/definitely/not/bwrap' };

  assert.throws(
    () => createScriptWorkerLaunch(
      path.join(__dirname, '..', '..', 'src', 'core', 'sandbox', 'scriptWorker.js'),
      [],
      scriptWorkerEnv(),
      {
        osSandboxMode: OS_SANDBOX_MODES.REQUIRED,
        ...unavailableBackendOptions,
        recordDiagnosticEvent: async (event) => {
          events.push(sanitizeDiagnosticEvent(event, defaultDiagnosticsSettings()));
        }
      }
    ),
    /OS-level script sandboxing is required/
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(events.some((event) => (
    event.type === 'sandbox.os-backend.launch.failed'
      && event.outcome === 'failed'
      && event.failureCode === 'os_sandbox_backend_required_unavailable'
      && event.fields.sandboxed === false
      && event.fields.error
  )));
  assert.doesNotMatch(JSON.stringify(events), /definitely\/not|definitely-not/);

  const execution = await runPostmanScriptIsolated(`
    pm.environment.set('shouldNotCommit', 'true');
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    osSandboxMode: OS_SANDBOX_MODES.REQUIRED,
    ...unavailableBackendOptions,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.error, /OS-level script sandboxing is required/);
  assert.equal(execution.result.commitSideEffects, false);
  assert.equal(execution.environmentVariables.find((item) => item.key === 'shouldNotCommit'), undefined);
});

test('builds Windows AppContainer helper launches with private temp and explicit allowlists', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-win-helper-test-'));
  const helperPath = path.join(tempDir, 'PostMeterWindowsSandboxHelper.exe');
  await fs.writeFile(helperPath, 'placeholder');

  const launch = createOsSandboxedProcessLaunch({
    platform: 'win32',
    mode: OS_SANDBOX_MODES.REQUIRED,
    windowsSandboxHelperPath: helperPath,
    executablePath: process.execPath,
    args: ['-e', 'process.exit(0)'],
    env: scriptWorkerEnv(),
    readOnlyPaths: [path.join(__dirname, '..', '..', 'src', 'core')],
    skipFunctionalProbe: true
  });

  try {
    assert.equal(launch.sandboxed, true);
    assert.equal(launch.backend, 'windows-helper');
    assert.equal(launch.command, helperPath);
    assert.equal(launch.env.POSTMETER_SCRIPT_WORKER, '1');
    assert.equal(launch.env.POSTMETER_SCRIPT_WORKER_TRANSPORT_DIR, launch.privateTempDir);
    assert.equal(launch.env.APPDATA, launch.privateTempDir);
    assert.equal(launch.env.LOCALAPPDATA, launch.privateTempDir);
    assert.equal(launch.env.USERPROFILE, launch.privateTempDir);
    assert.ok(launch.privateTempDir);
    assert.ok(launch.args.includes('--read-only'));
    assert.ok(launch.args.includes('--'));
    assert.equal(launch.args[0], '--profile');
    assert.equal(launch.args[1], 'PostMeter.ScriptWorkerSandbox');
    assert.equal(launch.args[2], '--temp');
    assert.equal(launch.args[3], launch.privateTempDir);
    assert.ok(launch.args.includes('POSTMETER_SCRIPT_WORKER=1'));
    assert.ok(launch.args.includes(`TEMP=${launch.privateTempDir}`));
    assert.ok(launch.args.includes(process.execPath));
  } finally {
    cleanupPrivateTempDir(launch.privateTempDir);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('Windows AppContainer script worker allowlist includes all runtime source files', () => {
  const root = path.join(__dirname, '..', '..');
  const workerPath = path.join(root, 'src', 'core', 'sandbox', 'scriptWorker.js');
  const readOnlyPaths = scriptWorkerAppReadOnlyPaths(workerPath, 'win32');

  assert.ok(readOnlyPaths.includes(path.join(root, 'src', 'core', 'sandbox')));
  assert.ok(readOnlyPaths.includes(path.join(root, 'src', 'core', 'workspace')));
  assert.ok(readOnlyPaths.includes(path.join(root, 'package.json')));
});

test('builds macOS seatbelt launches with private temp and no broad process allowance', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-seatbelt-test-'));
  const sandboxExecPath = path.join(tempDir, 'sandbox-exec');
  await fs.writeFile(sandboxExecPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const launch = createOsSandboxedProcessLaunch({
    platform: 'darwin',
    mode: OS_SANDBOX_MODES.REQUIRED,
    macosSandboxExecPath: sandboxExecPath,
    executablePath: process.execPath,
    args: ['-e', 'process.exit(0)'],
    env: scriptWorkerEnv(),
    readOnlyPaths: [path.join(__dirname, '..', '..', 'src', 'core')],
    skipFunctionalProbe: true
  });

  try {
    const profile = launch.args[launch.args.indexOf('-p') + 1];
    assert.equal(launch.sandboxed, true);
    assert.equal(launch.backend, 'macos-seatbelt');
    assert.equal(launch.command, sandboxExecPath);
    assert.equal(launch.env.POSTMETER_SCRIPT_WORKER, '1');
    assert.equal(launch.env.TMPDIR, launch.privateTempDir);
    assert.equal(launch.env.HOME, launch.privateTempDir);
    assert.equal(launch.env.CFFIXED_USER_HOME, launch.privateTempDir);
    assert.match(profile, /\(deny default\)/);
    assert.match(profile, /\(deny network\*\)/);
    assert.match(profile, /\(allow process-exec/);
    assert.match(profile, /\(allow process-fork\)/);
    assert.match(profile, /\(allow process-info\*\)/);
    assert.match(profile, /\(allow ipc-posix\*\)/);
    assert.match(profile, /\(allow file-map-executable/);
    assert.doesNotMatch(profile, /\(allow process\*\)/);
    const escapedPrivateTempDir = String(launch.privateTempDir).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    assert.match(profile, new RegExp(escapeRegExp(escapedPrivateTempDir)));
    assert.doesNotMatch(profile, /\(subpath "\\?\/tmp"\\?\)/);
  } finally {
    cleanupPrivateTempDir(launch.privateTempDir);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('does not expose host constructors, errors, or promises to sandbox scripts', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('host constructors are blocked', async function () {
      function expectNoHostProcessViaConstructor(value) {
        let escaped = false;
        try {
          const constructor = value && value.constructor;
          const functionConstructor = constructor && constructor.constructor;
          if (typeof functionConstructor === 'function') {
            const result = functionConstructor(
              'try { return typeof process === "undefined" ? "missing" : process.cwd(); } catch (_) { return "blocked"; }'
            )();
            escaped = result !== 'missing' && result !== 'blocked';
          }
        } catch (_) {}
        pm.expect(escaped).to.equal(false);
      }

      pm.expect(pm.constructor).to.be.undefined;
      pm.expect(pm.test.constructor).to.be.undefined;
      pm.expect(console.log.constructor).to.be.undefined;
      pm.expect(pm.expect(1).constructor).to.be.undefined;

      const headers = pm.request.headers.all();
      pm.expect(Array.isArray(headers)).to.equal(true);
      pm.expect(headers.constructor).to.be.undefined;
      pm.expect(headers[0].constructor).to.be.undefined;
      pm.expect(headers.map(function (header) { return header.key; }).join(',')).to.equal('X-Test');

      const sdk = require('postman-collection');
      const request = new sdk.Request({
        method: 'POST',
        url: 'https://api.example.test/current?one=1',
        header: [{ key: 'X-SDK', value: 'yes' }],
        body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: 'b' }] }
      });
      const requestJson = request.toJSON();
      expectNoHostProcessViaConstructor(request);
      expectNoHostProcessViaConstructor(request.headers);
      expectNoHostProcessViaConstructor(request.headers.idx(0));
      expectNoHostProcessViaConstructor(request.url.query.all());
      expectNoHostProcessViaConstructor(request.url.query.idx(0));
      expectNoHostProcessViaConstructor(request.body.urlencoded.idx(0));
      expectNoHostProcessViaConstructor(requestJson);
      expectNoHostProcessViaConstructor(requestJson.header);

      const sdkResponse = new sdk.Response({
        code: 200,
        header: [{ key: 'Content-Type', value: 'text/plain' }],
        body: 'ok'
      });
      expectNoHostProcessViaConstructor(sdkResponse);
      expectNoHostProcessViaConstructor(sdkResponse.headers.idx(0));

      let escaped = false;
      try {
        pm.test.constructor.constructor('return process')();
        escaped = true;
      } catch (_) {}
      pm.expect(escaped).to.equal(false);

      let errorEscaped = false;
      try {
        pm.expect(false).to.be.true;
      } catch (error) {
        try {
          error.constructor.constructor('return process')().cwd();
          errorEscaped = true;
        } catch (_) {}
      }
      pm.expect(errorEscaped).to.equal(false);

      let functionEscaped = false;
      try {
        Function('return process')().cwd();
        functionEscaped = true;
      } catch (_) {}
      pm.expect(functionEscaped).to.equal(false);

      const pending = pm.sendRequest('https://api.example.test/secure');
      pm.expect(pending.constructor).to.be.undefined;
      pm.expect(pending.then.constructor).to.be.undefined;
      const response = await pending;
      pm.expect(response.constructor).to.be.undefined;
      pm.expect(response.code).to.equal(200);
    });
  `, {
    request: {
      method: 'GET',
      url: 'https://api.example.test/current',
      headers: [{ enabled: true, key: 'X-Test', value: 'yes' }]
    },
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    trustedCapabilities: { sendRequest: true },
    sendRequest: async () => ({
      statusCode: 200,
      headers: {},
      body: 'ok',
      durationMillis: 1,
      responseBytes: 2
    }),
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
});

test('terminates isolated script workers that exceed the parent timeout', async () => {
  const execution = await runPostmanScriptIsolated('while (true) {}', {}, {
    timeoutMillis: 5000,
    workerTimeoutMillis: 20
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.error, /worker timed out|exited before returning/i);
});

test('rejects oversized stdio worker protocol lines before parent memory can grow without bound', () => {
  const child = {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { destroyed: false, end() {}, on() {}, write() {} },
    killSignal: '',
    kill(signal) {
      this.killSignal = signal;
    }
  };
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  const transport = _createStdioChildTransportForTest(child);
  let error = null;
  transport.onError((nextError) => {
    error = nextError;
  });

  child.stdout.emit('data', 'x'.repeat(2 * 1024 * 1024));

  assert.match(error?.message || '', /stdout line exceeded/);
  assert.equal(child.killSignal, 'SIGKILL');
});

test('supports async tests and brokered timers in isolated scripts', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('async timer test', function (done) {
      setTimeout(function () {
        pm.environment.set('timerDone', 'yes');
        done();
      }, 5);
    });
    pm.test('promise test', async function () {
      await new Promise(function (resolve) { setTimeout(resolve, 5); });
      pm.expect(pm.environment.get('timerDone')).to.equal('yes');
    });
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
  assert.equal(execution.result.tests.length, 2);
  assert.equal(execution.environmentVariables.find((item) => item.key === 'timerDone').value, 'yes');
});

test('captures pm.visualizer output in isolated scripts', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.visualizer.set('<section><h1>{{title}}</h1><img src="https://blocked.example.test/pixel"></section>', {
      title: 'Visualizer'
    });
    pm.test('visualizer script still runs tests', function () {
      pm.expect(true).to.equal(true);
    });
  `, {}, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
  assert.equal(execution.result.visualizer.html, '<section><h1>Visualizer</h1><img></section>');
});

test('reports explicit context errors for pm.execution.runRequest outside collection runs', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('runRequest context', async function () {
      await pm.execution.runRequest('target-request-id');
    });
  `, {}, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.tests[0].error, /pm\.execution\.runRequest is not available/);
});

test('bounds and can disable pm.execution.runRequest broker calls', async () => {
  let disabledCalls = 0;
  const disabled = await runPostmanScriptIsolated(`
    pm.test('runRequest disabled', async function () {
      await pm.execution.runRequest('target');
    });
  `, {}, {
    runRequest: async () => {
      disabledCalls++;
      return {};
    },
    trustedCapabilities: { sendRequest: false },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(disabled.result.passed, false);
  assert.match(disabled.result.tests[0].error, /pm\.execution\.runRequest is disabled/);
  assert.equal(disabledCalls, 0);

  let calls = 0;
  const bounded = await runPostmanScriptIsolated(`
    pm.test('runRequest bounded', async function () {
      for (let index = 0; index < 11; index++) {
        await pm.execution.runRequest('target');
      }
    });
  `, {}, {
    runRequest: async () => {
      calls++;
      return {
        collectionVariables: [],
        environmentVariables: [],
        globals: [],
        response: { statusCode: 200, headers: {}, body: '{}', durationMillis: 1, responseBytes: 2 },
        tests: []
      };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(bounded.result.passed, false);
  assert.match(bounded.result.tests[0].error, /cannot be called more than 10 times/);
  assert.equal(calls, 10);
});

test('runs pm.vault through the broker unless explicitly disabled', async () => {
  const vault = new MemoryVaultStore({ existing: 'secret' });
  const disabled = await runPostmanScriptIsolated(`
    pm.test('vault disabled', async function () {
      await pm.vault.get('existing');
    });
  `, {}, {
    trustedCapabilities: { vault: false },
    vault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(disabled.result.passed, false);
  assert.match(disabled.result.tests[0].error, /pm\.vault is disabled/);

  const defaultEnabled = await runPostmanScriptIsolated(`
    pm.test('vault defaults enabled', async function () {
      pm.expect(await pm.vault.get('existing')).to.equal('secret');
    });
  `, {}, {
    trustedCapabilities: {},
    vault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(defaultEnabled.result.passed, true);

  const enabled = await runPostmanScriptIsolated(`
    pm.test('vault get/set/unset', async function () {
      await pm.vault.set('token', 'from-script');
      pm.expect(await pm.vault.get('existing')).to.equal('secret');
      pm.expect(await pm.vault.get('token')).to.equal('from-script');
      await pm.vault.unset('token');
      pm.expect(await pm.vault.get('token')).to.be.undefined;
    });
  `, {}, {
    trustedCapabilities: { vault: true },
    vault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(enabled.result.passed, true);
  assert.equal(await vault.get('existing'), 'secret');
  assert.equal(await vault.get('token'), undefined);
});

test('supports scoped pm.vault grants for collections and requests', async () => {
  const vault = new MemoryVaultStore({ existing: 'secret' });
  const script = `
    pm.test('scoped vault access', async function () {
      pm.expect(await pm.vault.get('existing')).to.equal('secret');
    });
  `;

  const collectionGranted = await runPostmanScriptIsolated(script, {
    collectionId: 'collection-a',
    request: { id: 'request-a', name: 'A' }
  }, {
    trustedCapabilities: { vault: false, vaultGrants: { collections: ['collection-a'] } },
    vault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });
  assert.equal(collectionGranted.result.passed, true);

  const requestGranted = await runPostmanScriptIsolated(script, {
    collectionId: 'collection-b',
    request: { id: 'request-b', name: 'B' }
  }, {
    trustedCapabilities: { vault: false, vaultGrants: { requests: ['request-b'] } },
    vault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });
  assert.equal(requestGranted.result.passed, true);

  const deniedOverride = await runPostmanScriptIsolated(script, {
    collectionId: 'collection-c',
    request: { id: 'request-c', name: 'C' }
  }, {
    trustedCapabilities: { vault: true, vaultGrants: { workspace: true, deniedRequests: ['request-c'] } },
    vault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });
  assert.equal(deniedOverride.result.passed, false);
  assert.match(deniedOverride.result.tests[0].error, /pm\.vault is disabled/);

  const collectionDeniedOverride = await runPostmanScriptIsolated(script, {
    collectionId: 'collection-denied',
    request: { id: 'request-allowed-by-workspace', name: 'Collection Denied' }
  }, {
    trustedCapabilities: {
      vault: false,
      vaultGrants: {
        workspace: true,
        deniedCollections: ['collection-denied']
      }
    },
    vault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });
  assert.equal(collectionDeniedOverride.result.passed, false);
  assert.match(collectionDeniedOverride.result.tests[0].error, /pm\.vault is disabled/);
});

test('supports per-request pm.vault prompt grants without exposing vault handles', async () => {
  const vault = new MemoryVaultStore({ existing: 'secret' });
  const prompts = [];
  const prompted = await runPostmanScriptIsolated(`
    pm.test('prompted vault access', async function () {
      pm.expect(await pm.vault.get('existing')).to.equal('secret');
      pm.expect(await pm.vault.get('existing')).to.equal('secret');
    });
  `, {
    collectionId: 'collection-prompt',
    request: { id: 'request-prompt', name: 'Prompted Request' }
  }, {
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async (payload) => {
      prompts.push(payload);
      return { granted: true, scope: 'request' };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(prompted.result.passed, true);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].key, 'existing');
  assert.equal(prompts[0].operation, 'get');
  assert.equal(prompts[0].requestId, 'request-prompt');
  assert.equal(prompts[0].collectionId, 'collection-prompt');
  assert.equal(prompts[0].collectionName, '');
  assert.equal(prompts[0].workspaceId, '');
  const promptedAudit = await vault.listAudit();
  assert.deepEqual(promptedAudit.map((entry) => entry.operation), ['prompt-grant-request', 'get', 'get']);
  assert.equal(promptedAudit[0].requestId, 'request-prompt');
  assert.equal(Object.hasOwn(promptedAudit[0], 'value'), false);

  const denied = await runPostmanScriptIsolated(`
    pm.test('denied prompt', async function () {
      await pm.vault.get('existing');
    });
  `, {
    request: { id: 'request-denied', name: 'Denied Request' }
  }, {
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async () => ({ granted: false, scope: 'request' }),
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });
  assert.equal(denied.result.passed, false);
  assert.match(denied.result.tests[0].error, /pm\.vault access was denied/);
});

test('audits unavailable pm.vault encryption without logging values', async () => {
  const audit = [];
  const unavailableVault = {
    isAvailable: () => false,
    get: async () => 'should-not-read',
    set: async () => {},
    unset: async () => {},
    audit: async (operation, key, metadata) => {
      audit.push({ operation, key, metadata });
    }
  };
  const execution = await runPostmanScriptIsolated(`
    pm.test('unavailable vault encryption', async function () {
      await pm.vault.get('existing');
    });
  `, {
    collectionId: 'collection-unavailable',
    collectionName: 'Unavailable Collection',
    request: { id: 'request-unavailable', name: 'Unavailable Request' },
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  }, {
    trustedCapabilities: { vault: true },
    vault: unavailableVault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.tests[0].error, /pm\.vault encryption is unavailable/);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].operation, 'unavailable-encryption');
  assert.equal(audit[0].key, 'existing');
  assert.deepEqual(audit[0].metadata, {
    collectionId: 'collection-unavailable',
    collectionName: 'Unavailable Collection',
    requestId: 'request-unavailable',
    requestName: 'Unavailable Request',
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });
  assert.equal(Object.hasOwn(audit[0], 'value'), false);
});

test('bounds pm.vault broker calls and values', async () => {
  const vault = new MemoryVaultStore();
  const bounded = await runPostmanScriptIsolated(`
    pm.test('vault calls bounded', async function () {
      for (let index = 0; index < 17; index++) {
        await pm.vault.get('token');
      }
    });
  `, {}, {
    trustedCapabilities: { vault: true },
    vault,
    timeoutMillis: 1000,
    workerTimeoutMillis: 1500
  });

  assert.equal(bounded.result.passed, false);
  assert.match(bounded.result.tests[0].error, /pm\.vault cannot be called more than 16 times/);

  const oversized = await runPostmanScriptIsolated(`
    pm.test('vault value bounded', async function () {
      await pm.vault.set('token', 'x'.repeat(64 * 1024 + 1));
    });
  `, {}, {
    trustedCapabilities: { vault: true },
    vault,
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(oversized.result.passed, false);
  assert.match(oversized.result.tests[0].error, /pm\.vault secret value cannot exceed/);
});

test('runs pm.sendRequest through the broker by default and can disable it per workspace', async () => {
  const denied = await runPostmanScriptIsolated(`
    pm.test('send denied', async function () {
      await pm.sendRequest('https://api.example.test/denied');
    });
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    trustedCapabilities: { sendRequest: false },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(denied.result.passed, false);
  assert.match(denied.result.tests[0].error, /pm\.sendRequest is disabled/);

  const sent = [];
  const allowed = await runPostmanScriptIsolated(`
    pm.test('brokered send', async function () {
      const response = await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/widgets',
        header: { 'X-Test': 'yes' },
        body: { raw: 'hello' }
      });
      pm.expect(response.code).to.equal(201);
      pm.expect(response.json().ok).to.equal(true);
    });
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    sendRequest: async (request) => {
      sent.push(request);
      return {
        statusCode: 201,
        headers: { 'content-type': ['application/json'] },
        body: '{"ok":true}',
        durationMillis: 8,
        responseBytes: 11,
        finalUrl: request.url
      };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(allowed.result.passed, true);
  assert.equal(sent[0].method, 'POST');
  assert.equal(sent[0].headers[0].key, 'X-Test');
});

test('rejects oversized brokered pm.sendRequest payloads and response bodies', async () => {
  let calls = 0;
  const oversizedPayload = await runPostmanScriptIsolated(`
    pm.test('oversized request payload', async function () {
      await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/upload',
        body: { raw: 'x'.repeat(600 * 1024) }
      });
    });
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    trustedCapabilities: { sendRequest: true },
    sendRequest: async () => {
      calls++;
      return { statusCode: 200, headers: {}, body: '', durationMillis: 0, responseBytes: 0 };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(oversizedPayload.result.passed, false);
  assert.match(oversizedPayload.result.tests[0].error, /payload is too large/);
  assert.equal(calls, 0);

  const oversizedResponse = await runPostmanScriptIsolated(`
    pm.test('oversized response payload', async function () {
      await pm.sendRequest('https://api.example.test/large');
    });
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    trustedCapabilities: { sendRequest: true },
    sendRequest: async () => {
      calls++;
      return {
        statusCode: 200,
        headers: {},
        body: 'x'.repeat((512 * 1024) + 1),
        durationMillis: 0,
        responseBytes: (512 * 1024) + 1
      };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(oversizedResponse.result.passed, false);
  assert.match(oversizedResponse.result.tests[0].error, /response body cannot exceed/);
  assert.equal(calls, 1);
});

test('normalizes broader Postman pm.sendRequest inputs and commits jar side effects', async () => {
  const sent = [];
  const execution = await runPostmanScriptIsolated(`
    const sdk = require('postman-collection');
    pm.test('sendRequest object forms and cookie callbacks', async function () {
      const first = await pm.sendRequest({
        method: 'POST',
        url: { raw: 'https://api.example.test/form', query: [{ key: 'fromUrl', value: '1' }] },
        header: [{ key: 'X-Array', value: 'yes' }],
        body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: 'b' }] },
        auth: { type: 'basic', basic: [{ key: 'username', value: 'ada' }, { key: 'password', value: 'lovelace' }] },
        followRedirects: false,
        timeout: 50
      });
      pm.expect(first.code).to.equal(200);

      const request = new sdk.Request({
        method: 'POST',
        url: 'https://api.example.test/graphql',
        header: { 'X-SDK': 'yes' },
        body: { mode: 'graphql', graphql: { query: 'query Ok { ok }', variables: { id: 1 } } },
        auth: { type: 'bearer', token: 'sdk-token' }
      });
      const second = await pm.sendRequest(request);
      pm.expect(second.url).to.equal('https://api.example.test/graphql');

      const advanced = await pm.sendRequest({
        method: 'GET',
        url: 'https://api.example.test/signed',
        proxy: { protocol: 'http', host: 'proxy.example.test', port: 8080, username: 'puser', password: 'ppass' },
        auth: {
          type: 'awsv4',
          awsv4: [
            { key: 'accessKey', value: 'akid' },
            { key: 'secretKey', value: 'secret' },
            { key: 'region', value: 'us-east-1' },
            { key: 'service', value: 'execute-api' },
            { key: 'sessionToken', value: 'session-token' },
            { key: 'addAuthDataTo', value: 'Request URL' }
          ]
        }
      });
      pm.expect(advanced.code).to.equal(200);

      const jar = pm.cookies.jar();
      pm.expect(await jar.get('https://api.example.test/form', 'sendSide')).to.equal('effect');
      pm.expect(await jar.get('https://api.example.test/form', 'sendSecret')).to.equal('secret-effect');
      await new Promise(function (resolve, reject) {
        pm.cookies.get('visible', function (error, value) {
          if (error) { reject(error); return; }
          try {
            pm.expect(value).to.equal('cookie-value');
            resolve();
          } catch (assertion) {
            reject(assertion);
          }
        });
      });
    });
  `, {
    request: { method: 'GET', url: 'https://api.example.test/path' },
    environment: { id: 'env', name: 'Env', variables: [] },
    cookieJar: [
      { enabled: true, name: 'visible', value: 'cookie-value', domain: 'api.example.test', path: '/', secure: false, httpOnly: false, sameSite: 'Lax', hostOnly: true }
    ]
  }, {
    trustedCapabilities: { sendRequest: true, cookies: true },
    sendRequest: async (request, _environment, options = {}) => {
      sent.push({ options, request });
      return {
        statusCode: 200,
        headers: { 'content-type': ['application/json'] },
        body: '{"ok":true}',
        durationMillis: 2,
        responseBytes: 11,
        finalUrl: request.url,
        updatedCookies: [
          ...(options.cookieJar || []),
          { enabled: true, name: 'sendSide', value: 'effect', domain: 'api.example.test', path: '/', secure: false, httpOnly: false, sameSite: 'Lax', hostOnly: true },
          { enabled: true, name: 'sendSecret', value: 'secret-effect', domain: 'api.example.test', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }
        ]
      };
    },
    timeoutMillis: 1000,
    workerTimeoutMillis: 1500
  });

  assert.equal(execution.result.passed, true);
  assert.equal(sent.length, 3);
  assert.equal(sent[0].request.body, 'a=b');
  assert.equal(sent[0].request.auth.type, 'basic');
  assert.equal(sent[0].request.followRedirects, false);
  assert.equal(sent[0].request.timeoutMillis, 50);
  assert.equal(sent[0].options.cookieJar[0].name, 'visible');
  assert.equal(sent[1].request.bodyType, 'RAW_JSON');
  assert.match(sent[1].request.body, /query Ok/);
  assert.equal(sent[2].request.auth.type, 'aws');
  assert.equal(sent[2].request.auth.region, 'us-east-1');
  assert.equal(sent[2].request.auth.sessionToken, 'session-token');
  assert.equal(sent[2].request.auth.addAuthDataToQuery, true);
  assert.equal(sent[2].request.proxy.host, 'proxy.example.test');
  assert.equal(sent[2].request.proxy.port, '8080');
  assert.equal(execution.cookies.find((item) => item.name === 'sendSide').value, 'effect');
  assert.equal(execution.cookies.find((item) => item.name === 'sendSecret').httpOnly, true);
});

test('requires brokered client-certificate bindings for pm.sendRequest', async () => {
  let calls = 0;
  const rejected = await runPostmanScriptIsolated(`
    pm.test('script cert paths rejected', async function () {
      await pm.sendRequest({
        url: 'https://api.example.test/mtls',
        auth: { type: 'clientCertificate', certPath: '/tmp/client.crt', keyPath: '/tmp/client.key' }
      });
    });
  `, {}, {
    sendRequest: async () => {
      calls++;
      return { statusCode: 200, headers: {}, body: '', durationMillis: 0, responseBytes: 0 };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });
  assert.equal(rejected.result.passed, false);
  assert.match(rejected.result.tests[0].error, /configured certificate binding/);
  assert.equal(calls, 0);

  const rejectedPfx = await runPostmanScriptIsolated(`
    pm.test('script pfx path rejected', async function () {
      await pm.sendRequest({
        url: 'https://api.example.test/mtls',
        auth: { type: 'clientCertificate', pfxPath: '/tmp/client.p12', passphrase: 'secret' }
      });
    });
  `, {}, {
    sendRequest: async () => {
      calls++;
      return { statusCode: 200, headers: {}, body: '', durationMillis: 0, responseBytes: 0 };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });
  assert.equal(rejectedPfx.result.passed, false);
  assert.match(rejectedPfx.result.tests[0].error, /configured certificate binding/);
  assert.equal(calls, 0);

  const disabledBinding = await runPostmanScriptIsolated(`
    pm.test('disabled configured cert binding is rejected', async function () {
      await pm.sendRequest({
        url: 'https://api.example.test/mtls',
        auth: { type: 'clientCertificate', certificateId: 'disabled-cert' }
      });
    });
  `, {}, {
    clientCertificates: [{
      id: 'disabled-cert',
      enabled: false,
      certPath: '/configured/client.crt',
      keyPath: '/configured/client.key'
    }],
    sendRequest: async () => {
      calls++;
      return { statusCode: 200, headers: {}, body: '', durationMillis: 0, responseBytes: 0 };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });
  assert.equal(disabledBinding.result.passed, false);
  assert.match(disabledBinding.result.tests[0].error, /not available/);
  assert.equal(calls, 0);

  const allowed = await runPostmanScriptIsolated(`
    pm.test('configured cert binding is brokered', async function () {
      const response = await pm.sendRequest({
        url: 'https://api.example.test/mtls',
        auth: { type: 'clientCertificate', certificateId: 'cert-1' }
      });
      pm.expect(response.code).to.equal(200);
    });
  `, {}, {
    clientCertificates: [{
      id: 'cert-1',
      certPath: '/configured/client.crt',
      keyPath: '/configured/client.key',
      passphrase: 'secret'
    }],
    sendRequest: async (request) => {
      calls++;
      assert.deepEqual(request.auth, {
        type: 'clientCertificate',
        certificateId: 'cert-1',
        certPath: '/configured/client.crt',
        keyPath: '/configured/client.key',
        pfxPath: '',
        caPath: '',
        passphrase: 'secret'
      });
      return { statusCode: 200, headers: {}, body: '', durationMillis: 0, responseBytes: 0 };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(allowed.result.passed, true);
  assert.equal(calls, 1);

  const allowedPfx = await runPostmanScriptIsolated(`
    pm.test('configured pfx binding is brokered', async function () {
      const response = await pm.sendRequest({
        url: 'https://api.example.test/mtls',
        auth: { type: 'clientCertificate', certificateId: 'cert-pfx' }
      });
      pm.expect(response.code).to.equal(200);
    });
  `, {}, {
    clientCertificates: [{
      id: 'cert-pfx',
      pfxPath: '/configured/client.p12',
      caPath: '/configured/ca.pem',
      passphrase: 'pfx-secret'
    }],
    sendRequest: async (request) => {
      calls++;
      assert.deepEqual(request.auth, {
        type: 'clientCertificate',
        certificateId: 'cert-pfx',
        certPath: '',
        keyPath: '',
        pfxPath: '/configured/client.p12',
        caPath: '/configured/ca.pem',
        passphrase: 'pfx-secret'
      });
      return { statusCode: 200, headers: {}, body: '', durationMillis: 0, responseBytes: 0 };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(allowedPfx.result.passed, true);
  assert.equal(calls, 2);

  const settingsBinding = await runPostmanScriptIsolated(`
    pm.test('settings cert binding is brokered', async function () {
      const response = await pm.sendRequest({
        url: 'https://api.example.test/mtls',
        auth: { type: 'clientCertificate', certificateId: 'settings-cert' }
      });
      pm.expect(response.code).to.equal(200);
    });
  `, {}, {
    tlsSettings: {
      request: {
        clientCertificates: [{
          id: 'settings-cert',
          certPath: '/settings/client.crt',
          keyPath: '/settings/client.key',
          caPath: '/settings/ca.pem',
          passphrase: 'settings-secret'
        }]
      }
    },
    sendRequest: async (request, _environment, options) => {
      calls++;
      assert.deepEqual(request.auth, {
        type: 'clientCertificate',
        certificateId: 'settings-cert',
        certPath: '/settings/client.crt',
        keyPath: '/settings/client.key',
        pfxPath: '',
        caPath: '/settings/ca.pem',
        passphrase: 'settings-secret'
      });
      assert.equal(options.clientCertificates.some((certificate) => certificate.id === 'settings-cert'), true);
      return { statusCode: 200, headers: {}, body: '', durationMillis: 0, responseBytes: 0 };
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(settingsBinding.result.passed, true);
  assert.equal(calls, 3);
});

test('requires user-granted file bindings for brokered pm.sendRequest bodies', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-script-files-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const localPath = path.join(dir, 'upload.txt');
  await fs.writeFile(localPath, 'BOUND_UPLOAD');
  const sent = [];

  const rejected = await runPostmanScriptIsolated(`
    pm.test('unbound files fail closed', async function () {
      await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/upload',
        body: { mode: 'file', file: { src: '/etc/passwd' } }
      });
    });
  `, {}, {
    sendRequest: async () => {
      throw new Error('sendRequest should not be called for unbound file bodies');
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(rejected.result.passed, false);
  assert.match(rejected.result.tests[0].error, /File attachment binding is required/);

  const idBypass = await runPostmanScriptIsolated(`
    pm.test('binding IDs cannot bypass source review', async function () {
      await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/upload',
        body: { mode: 'file', file: { src: '/etc/passwd' }, bindingId: 'approved-binding' }
      });
    });
  `, {}, {
    fileBindings: [{ id: 'approved-binding', source: 'fixtures/upload.txt', localPath }],
    sendRequest: async () => {
      throw new Error('sendRequest should not be called for mismatched file binding IDs');
    },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(idBypass.result.passed, false);
  assert.match(idBypass.result.tests[0].error, /File attachment binding is required/);

  const allowed = await runPostmanScriptIsolated(`
    pm.test('bound file and form-data references are brokered', async function () {
      const first = await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/file',
        body: { mode: 'binary', binary: { src: 'fixtures/upload.txt', contentType: 'text/plain' } }
      });
      const second = await pm.sendRequest({
        method: 'POST',
        url: 'https://api.example.test/form',
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'note', value: 'ok', type: 'text' },
            { key: 'payload', src: 'fixtures/upload.txt', type: 'file', contentType: 'text/plain' }
          ]
        }
      });
      pm.expect(first.code).to.equal(200);
      pm.expect(second.code).to.equal(200);
    });
  `, {}, {
    fileBindings: [{ source: 'fixtures/upload.txt', localPath, contentType: 'text/plain' }],
    sendRequest: async (request, _environment, options = {}) => {
      sent.push({ options, request });
      return { statusCode: 200, headers: {}, body: '', durationMillis: 0, responseBytes: 0, finalUrl: request.url };
    },
    timeoutMillis: 1000,
    workerTimeoutMillis: 1500
  });

  assert.equal(allowed.result.passed, true);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].request.bodyAttachment.source, 'fixtures/upload.txt');
  assert.equal(sent[0].request.bodyAttachment.contentType, 'text/plain');
  assert.equal(sent[0].options.fileBindings[0].localPath, localPath);
  assert.equal(sent[1].request.multipart.parts[0].type, 'text');
  assert.equal(sent[1].request.multipart.parts[1].source, 'fixtures/upload.txt');
});

test('discards side effects when aggregate worker result payloads are oversized', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.environment.set('huge', 'x'.repeat(2 * 1024 * 1024));
  `, {
    environment: {
      id: 'env',
      name: 'Env',
      variables: [{ enabled: true, key: 'safe', value: 'original' }]
    }
  }, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, false);
  assert.equal(execution.result.commitSideEffects, false);
  assert.match(execution.result.error, /exceeded the maximum allowed size/);
  assert.equal(execution.environmentVariables.find((item) => item.key === 'huge'), undefined);
  assert.equal(execution.environmentVariables.find((item) => item.key === 'safe').value, 'original');
});

test('supports true globals, iteration data, and Postman-style cookie helpers by default with HttpOnly parity', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.globals.set('globalToken', 'updated');
    pm.test('scopes resolve in target order', function () {
      pm.expect(pm.variables.get('localOnly')).to.equal('local');
      pm.expect(pm.variables.get('rowId')).to.equal('42');
      pm.expect(pm.variables.get('globalOnly')).to.equal('global');
    });
    pm.test('cookies are scoped and expose HttpOnly like Postman', async function () {
      pm.expect(pm.cookies.get('visible')).to.equal('cookie-value');
      pm.expect(pm.cookies.get('secret')).to.equal('hidden');
      pm.expect(pm.cookies.has('secret')).to.equal(true);
      pm.expect(pm.cookies.toObject().secret).to.equal('hidden');
      await pm.cookies.set('scripted', 'yes');
      await pm.cookies.unset('visible');
      const jar = pm.cookies.jar();
      await jar.set('https://api.example.test/path', 'jarred', 'cookie');
      pm.expect(await jar.get('https://api.example.test/path', 'jarred')).to.equal('cookie');
      pm.expect(await jar.get('https://api.example.test/path', 'secret')).to.equal('hidden');
      await jar.set('api.example.test/path', { name: 'jarObject', value: 'from-object', path: '/path' });
      pm.expect(await jar.get('api.example.test/path', 'jarObject')).to.equal('from-object');
      const all = await jar.getAll('https://api.example.test/path');
      pm.expect(all.get('jarred')).to.equal('cookie');
      pm.expect(all.get('jarObject')).to.equal('from-object');
      pm.expect(all.get('secret')).to.equal('hidden');
      await jar.unset('https://api.example.test/path', 'jarred');
      await jar.unset('api.example.test/path', 'jarObject');
      await pm.cookies.unset('secret');
      const cookies = await pm.cookies.toObject();
      pm.expect(cookies.scripted).to.equal('yes');
      pm.expect(cookies.visible).to.be.undefined;
      pm.expect(cookies.secret).to.be.undefined;
    });
  `, {
    request: { method: 'GET', url: 'https://api.example.test/path' },
    environment: { id: 'env', name: 'Env', variables: [] },
    collectionVariables: [],
    globals: [{ enabled: true, key: 'globalOnly', value: 'global' }],
    localVariables: [{ enabled: true, key: 'localOnly', value: 'local' }],
    iterationData: { rowId: 42 },
    cookieJar: [
      { enabled: true, name: 'visible', value: 'cookie-value', domain: 'api.example.test', path: '/', secure: false, httpOnly: false, sameSite: 'Lax', hostOnly: true },
      { enabled: true, name: 'secret', value: 'hidden', domain: 'api.example.test', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }
    ]
  }, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
  assert.equal(execution.globals.find((item) => item.key === 'globalToken').value, 'updated');
  assert.equal(execution.cookies.find((item) => item.name === 'scripted').value, 'yes');
  assert.equal(execution.cookies.find((item) => item.name === 'jarred'), undefined);
  assert.equal(execution.cookies.find((item) => item.name === 'jarObject'), undefined);
  assert.equal(execution.cookies.find((item) => item.name === 'visible'), undefined);
  assert.equal(execution.cookies.find((item) => item.name === 'secret'), undefined);
});

test('can disable Postman cookie helpers per workspace', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('cookies disabled', async function () {
      await pm.cookies.get('visible');
    });
  `, {
    request: { method: 'GET', url: 'https://api.example.test/path' },
    environment: { id: 'env', name: 'Env', variables: [] },
    cookieJar: [
      { enabled: true, name: 'visible', value: 'cookie-value', domain: 'api.example.test', path: '/', secure: false, httpOnly: false, sameSite: 'Lax', hostOnly: true }
    ]
  }, {
    trustedCapabilities: { cookies: false },
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.tests[0].error, /pm\.cookies is disabled/);
  assert.equal(execution.result.commitSideEffects, true);
});

test('rejects pm.cookies.jar object-set cookies for unrelated domains', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('cookie domain mismatch', async function () {
      const jar = pm.cookies.jar();
      await jar.set('api.example.test/path', { name: 'bad', value: 'x', domain: 'evil.example.test' });
    });
  `, {
    request: { method: 'GET', url: 'https://api.example.test/path' },
    environment: { id: 'env', name: 'Env', variables: [] },
    cookieJar: []
  }, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.tests[0].error, /cookie domain must match/);
  assert.equal(execution.cookies.find((item) => item.name === 'bad'), undefined);
});

test('supports pm.cookies.jar clear for hostname targets', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('jar clear', async function () {
      const jar = pm.cookies.jar();
      await jar.set('api.example.test/path', 'clearMe', 'x');
      pm.expect(await jar.get('api.example.test/path', 'clearMe')).to.equal('x');
      pm.expect(await jar.get('api.example.test/path', 'clearSecret')).to.equal('hidden');
      await jar.clear('api.example.test/path');
      pm.expect(await jar.get('api.example.test/path', 'clearMe')).to.be.undefined;
      pm.expect(await jar.get('api.example.test/path', 'clearSecret')).to.be.undefined;
    });
  `, {
    request: { method: 'GET', url: 'https://api.example.test/path' },
    environment: { id: 'env', name: 'Env', variables: [] },
    cookieJar: [
      { enabled: true, name: 'clearSecret', value: 'hidden', domain: 'api.example.test', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }
    ]
  }, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
  assert.equal(execution.cookies.find((item) => item.name === 'clearMe'), undefined);
  assert.equal(execution.cookies.find((item) => item.name === 'clearSecret'), undefined);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
