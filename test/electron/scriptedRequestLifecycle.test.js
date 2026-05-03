const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createScriptedRequestState,
  emptyScriptResult,
  runScriptedRequestLifecycle
} = require('../../src/core/scriptedRequestLifecycle');
const { runRequestWithScripts } = require('../../src/core/requestScriptRunner');

test('runs the shared scripted request lifecycle and applies script mutations across both phases', async () => {
  const environment = {
    id: 'env',
    name: 'Env',
    variables: [{ enabled: true, key: 'existingEnv', value: 'env-value' }]
  };
  const request = {
    id: 'scripted',
    name: 'Scripted',
    method: 'GET',
    url: '{{baseUrl}}/status',
    variables: [{ enabled: true, key: 'requestToken', value: 'local-token' }],
    scripts: {
      preRequest: 'pre',
      tests: 'tests'
    }
  };
  const state = createScriptedRequestState(request, environment, {
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }]
  });
  const sends = [];
  const scriptRunner = async (scriptText, context) => {
    if (scriptText === 'pre') {
      return {
        result: emptyScriptResult(),
        environmentVariables: [
          ...context.environment.variables,
          { enabled: true, key: 'token', value: 'from-pre' }
        ],
        collectionVariables: [
          ...context.collectionVariables,
          { enabled: true, key: 'fromPre', value: 'yes' }
        ],
        localVariables: [
          { enabled: true, key: 'requestToken', value: 'updated-local' }
        ],
        request: {
          ...context.request,
          method: 'POST',
          headers: [{ enabled: true, key: 'X-Pre', value: 'yes' }]
        }
      };
    }
    return {
      result: {
        passed: true,
        tests: [{ name: 'shared lifecycle', passed: true, error: '' }],
        error: '',
        logs: []
      },
      environmentVariables: [
        ...context.environment.variables,
        { enabled: true, key: 'afterTests', value: 'done' }
      ],
      collectionVariables: [
        ...context.collectionVariables,
        { enabled: true, key: 'fromTests', value: 'yes' }
      ],
      localVariables: context.localVariables,
      request: {
        ...context.request,
        method: 'DELETE',
        headers: [{ enabled: true, key: 'X-Test', value: 'ignored' }]
      }
    };
  };

  const result = await runScriptedRequestLifecycle(state, {
    scriptRunner,
    sendRequest: async (sentRequest, runtimeEnv) => {
      sends.push({ request: sentRequest, runtimeEnv });
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(sends.length, 1);
  assert.equal(sends[0].request.method, 'POST');
  assert.equal(sends[0].request.headers.find((item) => item.key === 'X-Pre').value, 'yes');
  assert.equal(sends[0].runtimeEnv.variables.find((item) => item.key === 'baseUrl').value, 'https://api.example.test');
  assert.equal(sends[0].runtimeEnv.variables.find((item) => item.key === 'token').value, 'from-pre');
  assert.equal(sends[0].runtimeEnv.variables.find((item) => item.key === 'requestToken').value, 'updated-local');
  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.testScriptResult.tests[0].name, 'shared lifecycle');
  assert.equal(result.request.method, 'POST');
  assert.equal(result.request.headers.find((item) => item.key === 'X-Test'), undefined);
  assert.equal(result.environment.variables.find((item) => item.key === 'afterTests').value, 'done');
  assert.equal(result.collectionVariables.find((item) => item.key === 'fromTests').value, 'yes');
  assert.equal(result.localVariables.find((item) => item.key === 'requestToken').value, 'updated-local');
  assert.equal(environment.variables.find((item) => item.key === 'token'), undefined);
  assert.equal(request.variables[0].value, 'local-token');
});

test('returns pre-request failures from the shared lifecycle without sending the request', async () => {
  let sends = 0;

  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState({
      id: 'pre-fail',
      scripts: { preRequest: 'pre', tests: 'tests' }
    }, null),
    {
      scriptRunner: async () => ({
        result: {
          passed: false,
          tests: [],
          error: 'no send',
          logs: []
        },
        environmentVariables: [],
        collectionVariables: [],
        localVariables: []
      }),
      sendRequest: async () => {
        sends++;
        return response(200, '{}');
      }
    }
  );

  assert.equal(sends, 0);
  assert.equal(result.response, null);
  assert.equal(result.preRequestScriptResult.error, 'no send');
  assert.deepEqual(result.testScriptResult, emptyScriptResult());
});

test('ignores script-injected primary request client-certificate file paths', async () => {
  const sent = [];
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState({
      id: 'client-cert-path-mutation',
      method: 'GET',
      url: 'https://api.example.test',
      auth: { type: 'bearer', token: 'trusted-token' },
      scripts: { preRequest: 'pre' }
    }, null),
    {
      scriptRunner: async (scriptText, context) => {
        if (scriptText === 'pre') {
          return {
            result: emptyScriptResult(),
            request: {
              ...context.request,
              auth: {
                type: 'clientCertificate',
                pfxPath: '/tmp/script-client.p12',
                passphrase: 'script-secret'
              }
            }
          };
        }
        return { result: emptyScriptResult() };
      },
      sendRequest: async (request) => {
        sent.push(request);
        return response(200, '{}');
      }
    }
  );

  assert.equal(result.requestSent, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].auth, { type: 'bearer', token: 'trusted-token' });
  assert.deepEqual(result.request.auth, { type: 'bearer', token: 'trusted-token' });
});

test('allows script selection of configured primary request client-certificate bindings only by id', async () => {
  const sent = [];
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState({
      id: 'client-cert-binding-mutation',
      method: 'GET',
      url: 'https://api.example.test',
      auth: { type: 'none' },
      scripts: { preRequest: 'pre' }
    }, null),
    {
      scriptRunner: async (scriptText, context) => {
        if (scriptText === 'pre') {
          return {
            result: emptyScriptResult(),
            request: {
              ...context.request,
              auth: {
                type: 'clientCertificate',
                certificateId: 'cert-1',
                pfxPath: '/tmp/script-client.p12',
                passphrase: 'script-secret'
              }
            }
          };
        }
        return { result: emptyScriptResult() };
      },
      sendRequest: async (request) => {
        sent.push(request);
        return response(200, '{}');
      }
    }
  );

  assert.equal(result.requestSent, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].auth, { type: 'clientCertificate', certificateId: 'cert-1' });
  assert.deepEqual(result.request.auth, { type: 'clientCertificate', certificateId: 'cert-1' });
});

test('throws enriched pre-request errors for single-request execution', async () => {
  await assert.rejects(
    () => runRequestWithScripts({
      id: 'single-pre-fail',
      scripts: { preRequest: 'pre' }
    }, null, {
      scriptRunner: async () => ({
        result: {
          passed: false,
          tests: [],
          error: 'bad pre-request',
          logs: []
        },
        environmentVariables: [{ enabled: true, key: 'token', value: 'blocked' }],
        collectionVariables: [{ enabled: true, key: 'fromPre', value: 'yes' }],
        localVariables: [{ enabled: true, key: 'local', value: 'nope' }]
      })
    }),
    (error) => {
      assert.match(error.message, /bad pre-request/);
      assert.equal(error.preRequestScriptResult.error, 'bad pre-request');
      assert.equal(error.environment.variables.find((item) => item.key === 'token').value, 'blocked');
      assert.equal(error.collectionVariables.find((item) => item.key === 'fromPre').value, 'yes');
      assert.equal(error.localVariables.find((item) => item.key === 'local').value, 'nope');
      return true;
    }
  );
});

test('propagates diagnostics callbacks into single-request sandbox broker denials', async () => {
  const events = [];

  await assert.rejects(
    () => runRequestWithScripts({
      id: 'diagnostic-denial',
      method: 'GET',
      url: 'https://api.example.test/root',
      scripts: {
        preRequest: `
          pm.test('sendRequest denial is diagnosed', async function () {
            await pm.sendRequest('https://api.example.test/denied');
          });
        `
      }
    }, { id: 'env', name: 'Env', variables: [] }, {
      trustedCapabilities: { sendRequest: false },
      recordDiagnosticEvent: async (event) => {
        events.push(event);
      },
      scriptOptions: {
        timeoutMillis: 500,
        workerTimeoutMillis: 1000
      },
      sendRequest: async () => response(200, '{}')
    }),
    /Pre-request script failed/
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(events.some((event) => (
    event.type === 'sandbox.broker.denied'
      && event.failureCode === 'script_send_request_disabled'
      && event.fields.operation === 'pm.sendRequest'
  )));
});

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': ['application/json'] },
    body,
    durationMillis: 12,
    responseBytes: Buffer.byteLength(body),
    finalUrl: 'https://api.example.test'
  };
}
