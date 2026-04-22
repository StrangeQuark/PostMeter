const assert = require('node:assert/strict');
const test = require('node:test');
const { runPostmanScriptIsolated, scriptWorkerEnv, scriptWorkerExecArgv, scriptWorkerMaxOldSpaceMb } = require('../../src/core/scriptSandbox');

test('runs scripts in an isolated worker and returns variable mutations', async () => {
  const environment = { variables: [{ enabled: true, key: 'token', value: 'old', secret: false }] };
  const collectionVariables = [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test', secret: false }];

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
  if (process.allowedNodeEnvironmentFlags?.has?.('--permission')) {
    assert.ok(execArgv.includes('--permission'));
    assert.ok(execArgv.some((value) => value.startsWith('--allow-fs-read=')));
  } else {
    assert.deepEqual(execArgv, ['--max-old-space-size=64']);
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

test('terminates isolated script workers that exceed the parent timeout', async () => {
  const execution = await runPostmanScriptIsolated('while (true) {}', {}, {
    timeoutMillis: 5000,
    workerTimeoutMillis: 20
  });

  assert.equal(execution.result.passed, false);
  assert.match(execution.result.error, /worker timed out|exited before returning/i);
});
