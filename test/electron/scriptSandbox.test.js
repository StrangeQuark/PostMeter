const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  OS_SANDBOX_MODES,
  osSandboxStatus,
  runPostmanScriptIsolated,
  scriptWorkerEnv,
  scriptWorkerExecArgv,
  scriptWorkerMaxOldSpaceMb,
  scriptWorkerRequiresNodePermission,
  supportsNodePermissionFlags
} = require('../../src/core/scriptSandbox');
const {
  createOsSandboxedProcessLaunch,
  createScriptWorkerLaunch
} = require('../../src/core/osSandbox');
const {
  MemoryVaultStore
} = require('../../src/core/vaultStore');

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
    assert.equal(fileReadFlags.length, 3);
    assert.equal(fileReadFlags.some((value) => value.includes(',')), false);
    assert.deepEqual(
      fileReadFlags
        .map((value) => path.basename(value.slice('--allow-fs-read='.length)))
        .sort(),
      ['scriptRuntime.js', 'scriptWorker.js', 'variableScope.js']
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
});

test('fails closed when the required OS sandbox backend is unavailable', async () => {
  assert.throws(
    () => createScriptWorkerLaunch(
      path.join(__dirname, '..', '..', 'src', 'core', 'scriptWorker.js'),
      [],
      scriptWorkerEnv(),
      { osSandboxMode: OS_SANDBOX_MODES.REQUIRED, bubblewrapPath: '/definitely/not/bwrap' }
    ),
    /OS-level script sandboxing is required/
  );

  const execution = await runPostmanScriptIsolated(`
    pm.environment.set('shouldNotCommit', 'true');
  `, {
    environment: { id: 'env', name: 'Env', variables: [] }
  }, {
    osSandboxMode: OS_SANDBOX_MODES.REQUIRED,
    bubblewrapPath: '/definitely/not/bwrap',
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.error, /OS-level script sandboxing is required/);
  assert.equal(execution.result.commitSideEffects, false);
  assert.equal(execution.environmentVariables.find((item) => item.key === 'shouldNotCommit'), undefined);
});

test('does not expose host constructors, errors, or promises to sandbox scripts', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.test('host constructors are blocked', async function () {
      pm.expect(pm.constructor).to.be.undefined;
      pm.expect(pm.test.constructor).to.be.undefined;
      pm.expect(console.log.constructor).to.be.undefined;
      pm.expect(pm.expect(1).constructor).to.be.undefined;

      const headers = pm.request.headers.all();
      pm.expect(Array.isArray(headers)).to.equal(true);
      pm.expect(headers.constructor).to.be.undefined;
      pm.expect(headers[0].constructor).to.be.undefined;
      pm.expect(headers.map(function (header) { return header.key; }).join(',')).to.equal('X-Test');

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
          error.constructor.constructor('return process')();
          errorEscaped = true;
        } catch (_) {}
      }
      pm.expect(errorEscaped).to.equal(false);

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

test('runs pm.vault through the broker only when explicitly enabled', async () => {
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

test('supports true globals, iteration data, and Postman-style cookie helpers by default while hiding HttpOnly cookies', async () => {
  const execution = await runPostmanScriptIsolated(`
    pm.globals.set('globalToken', 'updated');
    pm.test('scopes resolve in target order', function () {
      pm.expect(pm.variables.get('localOnly')).to.equal('local');
      pm.expect(pm.variables.get('rowId')).to.equal('42');
      pm.expect(pm.variables.get('globalOnly')).to.equal('global');
    });
    pm.test('cookies are scoped and httpOnly hidden', async function () {
      pm.expect(await pm.cookies.get('visible')).to.equal('cookie-value');
      pm.expect(await pm.cookies.get('secret')).to.be.undefined;
      await pm.cookies.set('scripted', 'yes');
      await pm.cookies.unset('visible');
      const jar = pm.cookies.jar();
      await jar.set('https://api.example.test/path', 'jarred', 'cookie');
      pm.expect(await jar.get('https://api.example.test/path', 'jarred')).to.equal('cookie');
      await jar.set('api.example.test/path', { name: 'jarObject', value: 'from-object', path: '/path' });
      pm.expect(await jar.get('api.example.test/path', 'jarObject')).to.equal('from-object');
      const all = await jar.getAll('https://api.example.test/path');
      pm.expect(all.jarred).to.equal('cookie');
      pm.expect(all.jarObject).to.equal('from-object');
      pm.expect(all.secret).to.be.undefined;
      await jar.unset('https://api.example.test/path', 'jarred');
      await jar.unset('api.example.test/path', 'jarObject');
      await pm.cookies.unset('secret');
      const cookies = await pm.cookies.toObject();
      pm.expect(cookies.scripted).to.equal('yes');
      pm.expect(cookies.visible).to.be.undefined;
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
  assert.equal(execution.cookies.find((item) => item.name === 'secret').value, 'hidden');
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
      await jar.clear('api.example.test/path');
      pm.expect(await jar.get('api.example.test/path', 'clearMe')).to.be.undefined;
    });
  `, {
    request: { method: 'GET', url: 'https://api.example.test/path' },
    environment: { id: 'env', name: 'Env', variables: [] },
    cookieJar: []
  }, {
    timeoutMillis: 500,
    workerTimeoutMillis: 1000
  });

  assert.equal(execution.result.passed, true);
  assert.equal(execution.cookies.find((item) => item.name === 'clearMe'), undefined);
});
