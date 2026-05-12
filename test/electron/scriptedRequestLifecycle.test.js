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

test('uses collection auth and scripts only when the request does not define them', async () => {
  const scripts = [];
  const sends = [];
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState({
      id: 'fallback',
      name: 'Fallback',
      method: 'GET',
      url: 'https://api.example.test/fallback',
      auth: { type: 'none' },
      scripts: { preRequest: '', tests: "pm.test('request test', function () {});" }
    }, { id: 'env', name: 'Env', variables: [] }, {
      collectionAuth: { type: 'bearer', token: 'collection-token' },
      collectionScripts: {
        preRequest: "pm.environment.set('fromCollectionPre', 'yes');",
        tests: "throw new Error('collection tests should not run');"
      }
    }),
    {
      scriptRunner: async (scriptText, context) => {
        scripts.push(scriptText);
        return {
          result: {
            passed: true,
            tests: scriptText.includes('request test') ? [{ name: 'request test', passed: true, error: '' }] : [],
            error: '',
            logs: []
          },
          environmentVariables: context.environment.variables,
          collectionVariables: context.collectionVariables,
          localVariables: context.localVariables,
          request: context.request
        };
      },
      sendRequest: async (sentRequest) => {
        sends.push(sentRequest);
        return response(200, '{"ok":true}');
      }
    }
  );

  assert.equal(sends[0].auth.type, 'bearer');
  assert.equal(sends[0].auth.token, 'collection-token');
  assert.ok(scripts[0].includes('fromCollectionPre'));
  assert.ok(scripts[1].includes('request test'));
  assert.doesNotMatch(scripts.join('\n'), /collection tests should not run/);
  assert.equal(result.testScriptResult.tests[0].name, 'request test');
});

test('keeps request auth and request script fields ahead of collection defaults', async () => {
  const scripts = [];
  const sends = [];
  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState({
      id: 'request-overrides',
      name: 'Request Overrides',
      method: 'GET',
      url: 'https://api.example.test/overrides',
      auth: { type: 'bearer', token: 'request-token' },
      scripts: {
        preRequest: "pm.environment.set('scriptScope', 'request-pre');",
        tests: ''
      }
    }, { id: 'env', name: 'Env', variables: [] }, {
      collectionAuth: { type: 'basic', username: 'collection-user', password: 'collection-pass' },
      collectionScripts: {
        preRequest: "throw new Error('collection pre-request should not run');",
        tests: "pm.test('collection test fallback', function () {});"
      }
    }),
    {
      scriptRunner: async (scriptText, context) => {
        scripts.push(scriptText);
        return {
          result: {
            passed: true,
            tests: scriptText.includes('collection test fallback')
              ? [{ name: 'collection test fallback', passed: true, error: '' }]
              : [],
            error: '',
            logs: []
          },
          environmentVariables: context.environment.variables,
          collectionVariables: context.collectionVariables,
          localVariables: context.localVariables,
          request: context.request
        };
      },
      sendRequest: async (sentRequest) => {
        sends.push(sentRequest);
        return response(200, '{"ok":true}');
      }
    }
  );

  assert.equal(sends[0].auth.type, 'bearer');
  assert.equal(sends[0].auth.token, 'request-token');
  assert.ok(scripts[0].includes('request-pre'));
  assert.ok(scripts[1].includes('collection test fallback'));
  assert.doesNotMatch(scripts.join('\n'), /collection pre-request should not run/);
  assert.equal(result.testScriptResult.tests[0].name, 'collection test fallback');
});

test('continues the main request when the pre-request script has a top-level error', async () => {
  const scripts = [];
  const sent = [];

  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState({
      id: 'pre-fail',
      method: 'GET',
      url: 'https://api.example.test/main',
      scripts: { preRequest: 'pre', tests: 'tests' }
    }, null),
    {
      scriptRunner: async (scriptText) => {
        scripts.push(scriptText);
        if (scriptText === 'pre') {
          return {
            result: {
              passed: false,
              tests: [],
              error: 'pre failed',
              logs: [],
              commitSideEffects: false
            },
            environmentVariables: [{ enabled: true, key: 'blocked', value: 'yes' }],
            collectionVariables: [],
            localVariables: []
          };
        }
        return {
          result: {
            passed: true,
            tests: [{ name: 'post still ran', passed: true, error: '' }],
            error: '',
            logs: []
          },
          environmentVariables: [],
          collectionVariables: [],
          localVariables: []
        };
      },
      sendRequest: async (request) => {
        sent.push(request.url);
        return response(200, '{}');
      }
    }
  );

  assert.deepEqual(sent, ['https://api.example.test/main']);
  assert.deepEqual(scripts, ['pre', 'tests']);
  assert.equal(result.requestSent, true);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.preRequestScriptResult.error, 'pre failed');
  assert.equal(result.testScriptResult.tests[0].name, 'post still ran');
  assert.equal(result.environment.variables.find((item) => item.key === 'blocked'), undefined);
});

test('continues the main request when pre-request script tests fail', async () => {
  const sent = [];
  const scripts = [];

  const result = await runScriptedRequestLifecycle(
    createScriptedRequestState({
      id: 'pre-test-fail',
      scripts: { preRequest: 'pre', tests: 'tests' }
    }, null),
    {
      scriptRunner: async (scriptText) => {
        scripts.push(scriptText);
        if (scriptText === 'pre') {
          return {
            result: {
              passed: false,
              tests: [{ name: 'pre assertion', passed: false, error: 'expected true to equal false' }],
              error: '',
              logs: []
            },
            environmentVariables: [],
            collectionVariables: [],
            localVariables: []
          };
        }
        return {
          result: {
            passed: true,
            tests: [{ name: 'post assertion', passed: true, error: '' }],
            error: '',
            logs: []
          },
          environmentVariables: [],
          collectionVariables: [],
          localVariables: []
        };
      },
      sendRequest: async (request) => {
        sent.push(request);
        return response(200, '{"ok":true}');
      }
    }
  );

  assert.equal(sent.length, 1);
  assert.deepEqual(scripts, ['pre', 'tests']);
  assert.equal(result.requestSent, true);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.preRequestScriptResult.passed, false);
  assert.equal(result.preRequestScriptResult.tests[0].passed, false);
  assert.equal(result.testScriptResult.passed, true);
});

test('returns a valid skipped response for single-request pre-request skipRequest', async () => {
  let sends = 0;

  const result = await runRequestWithScripts({
    id: 'single-skip',
    method: 'GET',
    url: 'https://api.example.test/main',
    scripts: {
      preRequest: `
        pm.environment.set('beforeSkip', 'yes');
        pm.test('pre-request can skip the main request', function () {
          pm.execution.skipRequest();
          pm.environment.set('afterSkip', 'no');
        });
        pm.environment.set('afterTest', 'no');
      `
    }
  }, null, {
    sendRequest: async () => {
      sends += 1;
      return response(200, '{}');
    }
  });

  assert.equal(sends, 0);
  assert.equal(result.response.statusCode, 0);
  assert.equal(result.response.requestSent, false);
  assert.equal(result.response.skipped, true);
  assert.match(result.response.body, /skipped/i);
  assert.equal(result.response.preRequestScriptResult.tests[0].passed, true);
  assert.equal(result.environment.variables.find((item) => item.key === 'beforeSkip')?.value, 'yes');
  assert.equal(result.environment.variables.find((item) => item.key === 'afterSkip'), undefined);
  assert.equal(result.environment.variables.find((item) => item.key === 'afterTest'), undefined);
});

test('honors skipRequest inside a pre-request pm.sendRequest callback test', async () => {
  const sent = [];

  const result = await runRequestWithScripts({
    id: 'callback-skip',
    method: 'GET',
    url: 'https://google.com',
    scripts: {
      preRequest: `
        pm.sendRequest('https://postman-echo.com/get?probe=sendRequest', function (err, res) {
          pm.test('pm.sendRequest can reach brokered HTTPS endpoint', function () {
            pm.expect(err).to.equal(null);
            pm.expect(res.code).to.equal(200);
            pm.expect(res.json().args.probe).to.equal('sendRequest');
            pm.execution.skipRequest();
            pm.environment.set('afterSkip', 'no');
          });
          pm.environment.set('afterTest', 'no');
        });
      `
    }
  }, null, {
    trustedCapabilities: { sendRequest: true },
    sendRequest: async (request) => {
      const url = String(request?.url || '');
      sent.push(url);
      if (url.includes('postman-echo.com')) {
        return response(200, '{"args":{"probe":"sendRequest"}}');
      }
      return response(200, '<html>google</html>');
    }
  });

  assert.deepEqual(sent, ['https://postman-echo.com/get?probe=sendRequest']);
  assert.equal(result.response.requestSent, false);
  assert.equal(result.response.skipped, true);
  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.preRequestScriptResult.tests[0].passed, true);
  assert.equal(result.environment.variables.find((item) => item.key === 'afterSkip'), undefined);
  assert.equal(result.environment.variables.find((item) => item.key === 'afterTest'), undefined);
});

test('does not let post-response skipRequest cancel an already-sent request', async () => {
  const sent = [];

  const result = await runRequestWithScripts({
    id: 'post-skip',
    method: 'GET',
    url: 'https://google.com',
    scripts: {
      tests: `
        pm.test('post-response skipRequest is unsupported', function () {
          pm.execution.skipRequest();
          pm.environment.set('afterPostSkip', 'no');
        });
      `
    }
  }, null, {
    sendRequest: async (request) => {
      sent.push(request.url);
      return response(200, '<html>google</html>');
    }
  });

  assert.deepEqual(sent, ['https://google.com']);
  assert.equal(result.response.requestSent, true);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body, '<html>google</html>');
  assert.equal(result.testScriptResult.passed, false);
  assert.match(result.testScriptResult.tests[0].error, /skipRequest.*function/);
  assert.equal(result.environment.variables.find((item) => item.key === 'afterPostSkip'), undefined);
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

test('single-request execution captures pre-request and post-request script errors while sending the request', async () => {
  const sent = [];

  const result = await runRequestWithScripts({
    id: 'single-script-failures',
    method: 'GET',
    url: 'https://api.example.test/script-failures',
    scripts: {
      preRequest: 'asdf',
      tests: 'fdsa'
    }
  }, null, {
    sendRequest: async (request) => {
      sent.push(request.url);
      return response(200, '{"ok":true}');
    }
  });

  assert.deepEqual(sent, ['https://api.example.test/script-failures']);
  assert.equal(result.response.requestSent, true);
  assert.equal(result.response.statusCode, 200);
  assert.match(result.preRequestScriptResult.error, /asdf is not defined/);
  assert.match(result.testScriptResult.error, /fdsa is not defined/);
});

test('propagates diagnostics callbacks into single-request sandbox broker denials', async () => {
  const events = [];

  const result = await runRequestWithScripts({
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
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.preRequestScriptResult.passed, false);
  assert.match(result.preRequestScriptResult.tests[0].error, /pm\.sendRequest is disabled/);
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
