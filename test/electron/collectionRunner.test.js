const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateAssertions, readHtmlSelector, readJsonPath, readXmlPath } = require('../../src/core/assertions');
const { collectionRunResultToCsv, runCollection, runRunner } = require('../../src/core/collectionRunner');
const { collectionModel, requestModel } = require('../../src/core/models');
const { importPostmanCollection } = require('../../src/core/postmanImporter');
const { runRequestWithScripts } = require('../../src/core/requestScriptRunner');
const { MemoryVaultStore } = require('../../src/core/vaultStore');

test('evaluates status, header, JSON path, timing, body, and extraction assertions', () => {
  const response = {
    statusCode: 201,
    headers: { 'content-type': ['application/json'], 'x-trace': ['abc'] },
    body: '{"data":{"id":"w1","items":[{"name":"hammer"}]},"token":"secret"}',
    durationMillis: 42,
    responseBytes: 68
  };

  const result = evaluateAssertions(response, [
    { type: 'statusCode', operator: 'equals', expected: 201 },
    { type: 'header', name: 'Content-Type', operator: 'contains', expected: 'json' },
    { type: 'jsonPath', path: '$.data.items[0].name', operator: 'equals', expected: 'hammer' },
    { type: 'responseTime', operator: 'lessThan', expected: 100 },
    { type: 'responseSize', operator: 'lessThan', expected: 100 },
    { type: 'bodyContains', expected: 'w1' },
    { type: 'extractVariable', path: '$.token', variableName: 'apiToken' },
    { type: 'extractRegex', expected: '"token":"([^"]+)"', variableName: 'regexToken' }
  ]);

  assert.equal(result.passed, true);
  assert.equal(result.results.length, 8);
  assert.deepEqual(result.extractedVariables, [{ key: 'apiToken', value: 'secret' }, { key: 'regexToken', value: 'secret' }]);
  assert.equal(readJsonPath(JSON.parse(response.body), '$.data.id'), 'w1');
});

test('evaluates XML XPath and HTML selector assertions', () => {
  const xmlResponse = {
    statusCode: 200,
    headers: { 'content-type': ['application/xml'] },
    body: '<response><title>Account</title><token>xml-secret</token></response>',
    durationMillis: 3,
    responseBytes: 68
  };
  const htmlResponse = {
    statusCode: 200,
    headers: { 'content-type': ['text/html'] },
    body: '<!doctype html><html><body><main><h1>Dashboard</h1><span class="token">html-secret</span></main></body></html>',
    durationMillis: 3,
    responseBytes: 108
  };

  const xmlResult = evaluateAssertions(xmlResponse, [
    { type: 'xmlPath', path: '/response/title', operator: 'equals', expected: 'Account' },
    { type: 'xmlPath', path: '/response/token', operator: 'exists', expected: '' },
    { type: 'extractXml', path: 'string(/response/token)', variableName: 'xmlToken' }
  ]);
  const htmlResult = evaluateAssertions(htmlResponse, [
    { type: 'htmlSelector', path: 'main h1', operator: 'equals', expected: 'Dashboard' },
    { type: 'htmlSelector', path: '.token', operator: 'exists', expected: '' },
    { type: 'extractHtml', path: '.token', variableName: 'htmlToken' }
  ]);

  assert.equal(xmlResult.passed, true);
  assert.equal(htmlResult.passed, true);
  assert.deepEqual(xmlResult.extractedVariables, [{ key: 'xmlToken', value: 'xml-secret' }]);
  assert.deepEqual(htmlResult.extractedVariables, [{ key: 'htmlToken', value: 'html-secret' }]);
  assert.equal(readXmlPath(xmlResponse.body, 'string(/response/title)'), 'Account');
  assert.equal(readHtmlSelector(htmlResponse.body, 'h1'), 'Dashboard');
});

test('runs collection requests sequentially and applies extracted variables', async () => {
  const collection = collectionModel({
    id: 'c1',
    name: 'Runner',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://collection.example.test' }],
    requests: [
      requestModel({
        id: 'login',
        name: 'Login',
        method: 'POST',
        url: 'https://api.example.test/login',
        assertions: [
          { type: 'statusCode', expected: 200 },
          { type: 'extractVariable', path: '$.token', variableName: 'token' }
        ]
      }),
      requestModel({
        id: 'profile',
        name: 'Profile',
        method: 'GET',
        url: 'https://api.example.test/profile',
        headers: [{ enabled: true, key: 'Authorization', value: 'Bearer {{token}}' }],
        assertions: [
          { type: 'jsonPath', path: '$.ok', operator: 'equals', expected: true }
        ]
      })
    ],
    folders: []
  });
  const sends = [];

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sends.push({
        requestId: request.id,
        token: environment.variables.find((item) => item.key === 'token')?.value || '',
        baseUrl: environment.variables.find((item) => item.key === 'baseUrl')?.value || ''
      });
      if (request.id === 'login') {
        return response(200, '{"token":"runner-token"}');
      }
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.equal(result.totalRequests, 2);
  assert.equal(result.passedRequests, 2);
  assert.equal(sends[0].token, '');
  assert.equal(sends[0].baseUrl, 'https://collection.example.test');
  assert.equal(sends[1].token, 'runner-token');
  assert.equal(result.environment.variables.find((item) => item.key === 'token').value, 'runner-token');
  assert.equal(result.collectionVariables.find((item) => item.key === 'baseUrl').value, 'https://collection.example.test');
});

test('extracts variables from response bodies with regex assertions', async () => {
  const request = requestModel({
    name: 'Extract Regex',
    url: 'https://example.test/token',
    assertions: [{
      type: 'extractRegex',
      expected: '"token":"([^"]+)"',
      variableName: 'regexToken'
    }]
  });
  const result = await runCollection(collectionModel({ name: 'Regex', requests: [request] }), null, {
    sendRequest: async () => ({
      statusCode: 200,
      headers: {},
      body: '{"token":"abc123"}',
      durationMillis: 1,
      responseBytes: 18,
      finalUrl: 'https://example.test/token'
    })
  });

  assert.equal(result.passed, true);
  assert.equal(result.results[0].extractedVariables[0].key, 'regexToken');
  assert.equal(result.results[0].extractedVariables[0].value, 'abc123');
  assert.equal(result.environment.variables.find((variable) => variable.key === 'regexToken').value, 'abc123');
});

test('passes cookie jar through collection runs and returns updated cookies', async () => {
  const collection = collectionModel({
    name: 'Cookies',
    requests: [requestModel({
      id: 'cookie-request',
      name: 'Cookie Request',
      method: 'GET',
      url: 'https://api.example.test/cookies',
      cookieJar: { enabled: true, storeResponses: true }
    })]
  });
  const result = await runCollection(collection, null, {
    cookieJar: [{ enabled: true, name: 'sid', value: 'initial', domain: 'api.example.test', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }],
    sendRequest: async (_request, _environment, options) => {
      assert.equal(options.cookieJar[0].value, 'initial');
      return {
        ...response(200, '{}'),
        updatedCookies: [{ enabled: true, name: 'sid', value: 'updated', domain: 'api.example.test', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }]
      };
    }
  });

  assert.equal(result.passed, true);
  assert.equal(result.cookies[0].value, 'updated');
});

test('carries refreshed OAuth auth forward during collection runs', async () => {
  const oauthRequest = requestModel({
    id: 'oauth-request',
    name: 'OAuth Request',
    method: 'GET',
    url: 'https://api.example.test/oauth',
    auth: { type: 'oauth2', grantType: 'clientCredentials', accessToken: 'stale-token' }
  });
  const collection = collectionModel({
    name: 'OAuth Collection',
    requests: [oauthRequest, oauthRequest]
  });
  const observedAuth = [];
  const result = await runCollection(collection, null, {
    sendRequest: async (request) => {
      observedAuth.push(request.auth.accessToken);
      return {
        ...response(200, '{}'),
        updatedAuth: { ...request.auth, accessToken: 'fresh-token' }
      };
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(observedAuth, ['stale-token', 'fresh-token']);
  assert.equal(result.results[0].updatedAuth.accessToken, 'fresh-token');
  assert.equal(Object.prototype.propertyIsEnumerable.call(result.results[0], 'updatedAuth'), false);
  assert.equal(JSON.stringify(result).includes('fresh-token'), false);
  assert.equal(result.authUpdates.get('oauth-request').accessToken, 'fresh-token');
});

test('marks collection runner failures when assertions fail', async () => {
  const collection = collectionModel({
    name: 'Failures',
    requests: [requestModel({
      id: 'r1',
      name: 'Request',
      method: 'GET',
      url: 'https://api.example.test',
      assertions: [{ type: 'statusCode', expected: 204 }]
    })],
    folders: []
  });

  const result = await runCollection(collection, null, {
    sendRequest: async () => response(200, '{}')
  });

  assert.equal(result.passed, false);
  assert.equal(result.failedRequests, 1);
  assert.equal(result.results[0].assertionResults[0].passed, false);
});

test('stops collection runner on assertion failure when configured', async () => {
  const collection = collectionModel({
    name: 'Stop on failure',
    requests: [
      requestModel({
        id: 'first',
        name: 'First',
        method: 'GET',
        url: 'https://api.example.test/first',
        assertions: [{ type: 'statusCode', expected: 204 }]
      }),
      requestModel({
        id: 'second',
        name: 'Second',
        method: 'GET',
        url: 'https://api.example.test/second',
        assertions: [{ type: 'statusCode', expected: 200 }]
      })
    ]
  });
  let sends = 0;

  const result = await runCollection(collection, null, {
    stopOnFailure: true,
    sendRequest: async () => {
      sends++;
      return response(200, '{}');
    }
  });

  assert.equal(sends, 1);
  assert.equal(result.totalRequests, 1);
  assert.equal(result.failedRequests, 1);
});

test('exports collection runner results to CSV', () => {
  const csv = collectionRunResultToCsv({
    collectionId: 'c1',
    collectionName: 'Exports',
    totalRequests: 1,
    passedRequests: 1,
    failedRequests: 0,
    passed: true,
    cancelled: false,
    results: [{
      requestId: 'r1',
      requestName: 'Request',
      folderName: '',
      startedAt: '2026-04-21T00:00:00.000Z',
      statusCode: 200,
      durationMillis: 12,
      passed: true,
      error: '',
      assertionResults: [{
        assertion: { type: 'statusCode', operator: 'equals', expected: 200 },
        passed: true,
        actual: 200,
        expected: 200,
        message: 'Status code 200 assertion passed.'
      }],
      extractedVariables: [{ key: 'token', value: 'captured in report body' }]
    }],
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }],
    environment: { variables: [{ enabled: true, key: 'token', value: 'secret' }] }
  });

  assert.match(csv, /collectionName,Exports/);
  assert.match(csv, /requestId,requestName,folderName/);
  assert.match(csv, /statusCode/);
  assert.match(csv, /variableName,requestId/);
  assert.match(csv, /runtimeScope,requestId,key,value/);
  assert.match(csv, /collection,,baseUrl,https:\/\/api.example.test/);
  assert.match(csv, /environment,,token,secret/);
});

test('runs pre-request and test scripts during collection runs', async () => {
  const collection = collectionModel({
    name: 'Scripts',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://script.example.test' }],
    requests: [requestModel({
      id: 'scripted',
      name: 'Scripted',
      method: 'GET',
      url: '{{baseUrl}}/widgets',
      variables: [{ enabled: true, key: 'requestToken', value: 'local-token' }],
      scripts: {
        preRequest: "pm.environment.set('token', 'script-token');",
        tests: `
          pm.test('script sees response', function () {
            pm.response.to.have.status(200);
            pm.expect(pm.response.json().ok).to.eql(true);
            pm.expect(pm.variables.get('requestToken')).to.equal('local-token');
          });
          pm.collectionVariables.set('fromTests', 'done');
        `
      }
    })]
  });

  const sends = [];
  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sends.push({
        url: request.url,
        baseUrl: environment.variables.find((item) => item.key === 'baseUrl')?.value,
        token: environment.variables.find((item) => item.key === 'token')?.value
      });
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.equal(sends[0].baseUrl, 'https://script.example.test');
  assert.equal(sends[0].token, 'script-token');
  assert.equal(result.results[0].testScriptResult.tests[0].passed, true);
  assert.equal(result.results[0].localVariables.find((item) => item.key === 'requestToken').value, 'local-token');
  assert.equal(result.collectionVariables.find((item) => item.key === 'fromTests').value, 'done');
});

test('runs workspace-owned runner requests in runner-local order and exposes environment mutation policy', async () => {
  const runner = {
    id: 'runner-1',
    name: 'Workspace Runner',
    environmentId: 'env',
    allowEnvironmentMutation: false,
    stopOnFailure: false,
    requests: [
      requestModel({
        id: 'runner-local-2',
        name: 'Second Clone',
        method: 'GET',
        url: 'https://api.example.test/second',
        scripts: { tests: "pm.environment.set('runnerToken', 'mutated');" }
      }),
      requestModel({
        id: 'runner-local-1',
        name: 'First Clone',
        method: 'GET',
        url: 'https://api.example.test/first',
        scripts: {
          preRequest: "pm.environment.set('seenBySend', 'yes');",
          tests: "pm.test('runner script executed', function () { pm.expect(pm.environment.get('seenBySend')).to.equal('yes'); });"
        }
      })
    ]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [{ enabled: true, key: 'runnerToken', value: 'base' }] }, {
    sendRequest: async (request, environment) => {
      sent.push({
        id: request.id,
        seenBySend: environment.variables.find((item) => item.key === 'seenBySend')?.value || ''
      });
      return response(200, '{"ok":true}');
    }
  });

  assert.deepEqual(sent.map((item) => item.id), ['runner-local-2', 'runner-local-1']);
  assert.equal(sent[1].seenBySend, 'yes');
  assert.equal(result.runnerId, 'runner-1');
  assert.equal(result.environmentMutationAllowed, false);
  assert.equal(result.mutatedEnvironment, undefined);
  assert.equal(result.results[0].requestId, 'runner-local-2');
  assert.equal(result.environment.variables.find((item) => item.key === 'runnerToken').value, 'mutated');
});

test('workspace-owned runner exposes mutated environment when persistence is allowed', async () => {
  const runner = {
    id: 'runner-mutate',
    name: 'Mutating Runner',
    environmentId: 'env',
    allowEnvironmentMutation: true,
    stopOnFailure: false,
    requests: [requestModel({
      id: 'runner-request',
      name: 'Mutates Env',
      url: 'https://api.example.test/mutate',
      scripts: { tests: "pm.environment.set('persistMe', 'yes');" }
    })]
  };
  const sourceEnvironment = { id: 'env', name: 'Env', variables: [] };

  const result = await runRunner(runner, sourceEnvironment, {
    sendRequest: async () => response(200, '{}')
  });

  assert.equal(sourceEnvironment.variables.length, 0);
  assert.equal(result.environmentMutationAllowed, true);
  assert.equal(result.mutatedEnvironment.id, 'env');
  assert.equal(result.mutatedEnvironment.variables.find((item) => item.key === 'persistMe').value, 'yes');
});

test('workspace-owned runner repeats a row by its configured iterations', async () => {
  const runner = {
    id: 'runner-iterations',
    name: 'Iterating Runner',
    environmentId: 'none',
    stopOnFailure: false,
    requests: [
      { ...requestModel({ id: 'repeat', name: 'Repeat', url: 'https://api.example.test/repeat' }), iterations: 3 },
      requestModel({ id: 'next', name: 'Next', url: 'https://api.example.test/next' })
    ]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request) => {
      sent.push({
        id: request.id,
        runnerIteration: request.runnerIteration,
        runnerIterations: request.runnerIterations
      });
      return response(200, '{}');
    }
  });

  assert.equal(result.totalRequests, 4);
  assert.deepEqual(sent.map((item) => item.id), ['repeat', 'repeat', 'repeat', 'next']);
  assert.deepEqual(sent.map((item) => item.runnerIteration), [1, 2, 3, 1]);
  assert.deepEqual(result.results.map((item) => item.runnerIteration), [1, 2, 3, 1]);
  assert.deepEqual(result.results.map((item) => item.runnerIterations), [3, 3, 3, 1]);
});

test('workspace-owned runner stop-on-failure stops inside repeated rows', async () => {
  const runner = {
    id: 'runner-repeat-failure',
    name: 'Repeat Failure Runner',
    environmentId: 'none',
    stopOnFailure: true,
    requests: [
      { ...requestModel({ id: 'repeat', name: 'Repeat', url: 'https://api.example.test/repeat' }), iterations: 3 },
      requestModel({ id: 'next', name: 'Next', url: 'https://api.example.test/next' })
    ]
  };
  const sent = [];

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request) => {
      sent.push(request.id);
      if (sent.length === 2) {
        throw new Error('repeat failed');
      }
      return response(200, '{}');
    }
  });

  assert.equal(result.totalRequests, 2);
  assert.equal(result.failedRequests, 1);
  assert.deepEqual(sent, ['repeat', 'repeat']);
  assert.equal(result.results[1].runnerIteration, 2);
  assert.equal(result.results[1].runnerIterations, 3);
  assert.match(result.results[1].error, /repeat failed/);
});

test('workspace-owned runner rejects expanded executions over the result limit', async () => {
  const runner = {
    id: 'runner-too-many',
    name: 'Too Many Runner',
    requests: [
      { ...requestModel({ id: 'repeat', name: 'Repeat', url: 'https://api.example.test/repeat' }), iterations: 3 }
    ]
  };

  await assert.rejects(
    () => runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
      maxRunnerExecutions: 2,
      sendRequest: async () => response(200, '{}')
    }),
    /Runner cannot execute more than 2 request iterations/
  );
});

test('workspace-owned runner honors runtime environment mutation override', async () => {
  const runner = {
    id: 'runner-override',
    name: 'Override Runner',
    environmentId: 'env',
    allowEnvironmentMutation: false,
    requests: [requestModel({
      id: 'runner-request',
      name: 'Mutates Env',
      url: 'https://api.example.test/mutate',
      scripts: { tests: "pm.environment.set('persistViaConfig', 'yes');" }
    })]
  };

  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    allowEnvironmentMutation: true,
    sendRequest: async () => response(200, '{}')
  });

  assert.equal(result.environmentMutationAllowed, true);
  assert.equal(result.mutatedEnvironment.variables.find((item) => item.key === 'persistViaConfig').value, 'yes');
});

test('runs pre-request and test scripts around single requests', async () => {
  const request = requestModel({
    id: 'single',
    name: 'Single Scripted',
    method: 'GET',
    url: '{{dynamicBaseUrl}}/session',
    variables: [{ enabled: true, key: 'requestToken', value: 'local-token' }],
    scripts: {
      preRequest: "pm.environment.set('beforeSend', 'ready'); pm.environment.set('dynamicBaseUrl', 'https://single.example.test');",
      tests: `
        pm.environment.set("REFRESH_TOKEN", pm.response.json().jwtToken);
        pm.collectionVariables.set('afterSend', 'done');
        pm.variables.set('requestToken', 'updated-local-token');
        pm.test('captured token', function () {
          pm.expect(pm.environment.get('REFRESH_TOKEN')).to.equal('refresh-123');
        });
      `
    }
  });
  const sends = [];

  const result = await runRequestWithScripts(request, { id: 'env', name: 'Env', variables: [] }, {
    collectionVariables: [],
    sendRequest: async (_request, environment) => {
      sends.push({
        dynamicBaseUrl: environment.variables.find((item) => item.key === 'dynamicBaseUrl')?.value,
        beforeSend: environment.variables.find((item) => item.key === 'beforeSend')?.value
      });
      return response(200, '{"jwtToken":"refresh-123"}');
    }
  });

  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.testScriptResult.passed, true);
  assert.equal(sends[0].dynamicBaseUrl, 'https://single.example.test');
  assert.equal(sends[0].beforeSend, 'ready');
  assert.equal(result.environment.variables.find((item) => item.key === 'REFRESH_TOKEN').value, 'refresh-123');
  assert.equal(result.collectionVariables.find((item) => item.key === 'afterSend').value, 'done');
  assert.equal(result.localVariables.find((item) => item.key === 'requestToken').value, 'updated-local-token');
  assert.equal(result.response.environment.variables.find((item) => item.key === 'REFRESH_TOKEN').value, 'refresh-123');
  assert.equal(result.response.testScriptResult.tests[0].passed, true);
});

test('routes single-request pm.vault prompts through the shared lifecycle', async () => {
  const vault = new MemoryVaultStore({ token: 'secret-token' });
  const prompts = [];
  const request = requestModel({
    id: 'vault-request',
    name: 'Vault Request',
    method: 'GET',
    url: 'https://api.example.test/vault',
    scripts: {
      preRequest: `
        pm.test('prompted vault access', async function () {
          const token = await pm.vault.get('token');
          pm.environment.set('vaultToken', token);
        });
      `
    }
  });

  const result = await runRequestWithScripts(request, { id: 'env', name: 'Env', variables: [] }, {
    collectionId: 'collection-1',
    collectionName: 'Prompt Collection',
    sendRequest: async () => response(200, '{}'),
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async (payload) => {
      prompts.push(payload);
      return { granted: true, scope: 'request' };
    },
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });

  assert.equal(result.preRequestScriptResult.passed, true);
  assert.equal(result.environment.variables.find((item) => item.key === 'vaultToken').value, 'secret-token');
  assert.equal(prompts.length, 1);
  assert.deepEqual(prompts[0], {
    collectionId: 'collection-1',
    collectionName: 'Prompt Collection',
    key: 'token',
    operation: 'get',
    requestId: 'vault-request',
    requestName: 'Vault Request',
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });
});

test('denied single-request pm.vault prompts fail pre-request tests without blocking the main request', async () => {
  const vault = new MemoryVaultStore({ token: 'secret-token' });
  const request = requestModel({
    id: 'vault-denied',
    name: 'Vault Denied',
    method: 'GET',
    url: 'https://api.example.test/vault-denied',
    scripts: {
      preRequest: `
        pm.test('denied vault access', async function () {
          await pm.vault.get('token');
          pm.environment.set('afterDeniedVault', 'should-not-run');
        });
      `
    }
  });
  const sent = [];

  const result = await runRequestWithScripts(request, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (sentRequest) => {
      sent.push(sentRequest.id);
      return response(200, '{}');
    },
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async () => ({ granted: false, scope: 'request' })
  });

  assert.deepEqual(sent, ['vault-denied']);
  assert.equal(result.response.statusCode, 200);
  assert.match(result.preRequestScriptResult.tests[0].error, /pm\.vault access was denied/);
  assert.equal(result.environment.variables.find((item) => item.key === 'afterDeniedVault'), undefined);
  const audit = await vault.listAudit();
  assert.deepEqual(audit.map((entry) => entry.operation), ['prompt-deny', 'denied-after-call']);
});

test('routes collection-run pm.vault prompts through the shared lifecycle', async () => {
  const vault = new MemoryVaultStore({ token: 'collection-secret' });
  const prompts = [];
  const collection = collectionModel({
    id: 'collection-vault',
    name: 'Collection Vault',
    requests: [
      requestModel({
        id: 'vault-runner-request',
        name: 'Vault Runner Request',
        method: 'GET',
        url: 'https://api.example.test/vault-runner',
        scripts: {
          preRequest: `
            pm.test('prompted collection vault access', async function () {
              pm.collectionVariables.set('vaultToken', await pm.vault.get('token'));
            });
          `
        }
      })
    ]
  });

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response(200, '{}'),
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async (payload) => {
      prompts.push(payload);
      return { granted: true, scope: 'collection' };
    },
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });

  assert.equal(result.passed, true);
  assert.equal(result.collectionVariables.find((item) => item.key === 'vaultToken').value, 'collection-secret');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].collectionId, 'collection-vault');
  assert.equal(prompts[0].collectionName, 'Collection Vault');
  assert.equal(prompts[0].requestId, 'vault-runner-request');
  assert.equal(prompts[0].requestName, 'Vault Runner Request');
  assert.equal(prompts[0].workspaceId, 'Workspace.json');
  assert.equal(prompts[0].workspaceName, 'Workspace');
});

test('routes nested pm.execution.runRequest vault prompts through the shared lifecycle', async () => {
  const vault = new MemoryVaultStore({ token: 'nested-secret' });
  const prompts = [];
  const collection = collectionModel({
    id: 'collection-nested-vault',
    name: 'Nested Vault',
    requests: [
      requestModel({
        id: 'caller',
        name: 'Caller',
        method: 'GET',
        url: 'https://api.example.test/caller',
        scripts: {
          tests: `
            pm.test('nested vault prompt', async function () {
              const response = await pm.execution.runRequest('target');
              pm.expect(response.code).to.equal(200);
              pm.expect(pm.environment.get('nestedVaultToken')).to.equal('nested-secret');
            });
          `
        }
      }),
      requestModel({
        id: 'target',
        name: 'Target',
        method: 'GET',
        url: 'https://api.example.test/target',
        scripts: {
          preRequest: `
            pm.test('target vault access', async function () {
              pm.environment.set('nestedVaultToken', await pm.vault.get('token'));
            });
          `
        }
      })
    ]
  });

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response(200, '{}'),
    trustedCapabilities: { vault: false, vaultGrants: {} },
    vault,
    vaultPrompt: async (payload) => {
      prompts.push(payload);
      return { granted: true, scope: 'request' };
    },
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });

  assert.equal(result.passed, true);
  assert.equal(result.environment.variables.find((item) => item.key === 'nestedVaultToken').value, 'nested-secret');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].requestId, 'target');
  assert.equal(prompts[0].requestName, 'Target');
  assert.equal(prompts[0].collectionId, 'collection-nested-vault');
  assert.equal(prompts[0].collectionName, 'Nested Vault');
});

test('fails collection runs when scripts fail', async () => {
  const collection = collectionModel({
    name: 'Script Failures',
    requests: [
      requestModel({
        id: 'pre',
        name: 'Bad pre',
        method: 'GET',
        url: 'https://api.example.test',
        scripts: { preRequest: "throw new Error('no send');" }
      }),
      requestModel({
        id: 'tests',
        name: 'Bad tests',
        method: 'GET',
        url: 'https://api.example.test',
        scripts: { tests: "pm.test('bad', function () { pm.expect(1).to.equal(2); });" }
      })
    ]
  });
  let sends = 0;

  const result = await runCollection(collection, null, {
    sendRequest: async () => {
      sends++;
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, false);
  assert.equal(sends, 1);
  assert.match(result.results[0].error, /no send/);
  assert.equal(result.results[1].testScriptResult.tests[0].passed, false);
});

test('runs imported Postman collection, folder, and request scripts through the runner', async () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Imported Scripted Postman',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [{ key: 'baseUrl', value: 'https://api.example.test' }],
    event: [{
      listen: 'prerequest',
      script: { exec: ["pm.collectionVariables.set('collectionStage', 'collection');"] }
    }],
    item: [{
      name: 'Folder',
      event: [{
        listen: 'prerequest',
        script: { exec: ["pm.environment.set('folderStage', 'folder');"] }
      }],
      item: [{
        name: 'Imported Request',
        request: {
          method: 'GET',
          url: {
            raw: '{{baseUrl}}/status?trace=postman',
            query: [{ key: 'trace', value: 'postman' }]
          }
        },
        event: [{
          listen: 'test',
          script: {
            exec: [
              "pm.test('postman event scripts ran', function () {",
              "  pm.response.to.have.status(200);",
              "  pm.expect(pm.collectionVariables.get('collectionStage')).to.equal('collection');",
              "  pm.expect(pm.environment.get('folderStage')).to.equal('folder');",
              "  pm.expect(pm.request.url.toString()).to.include('/status');",
              "});"
            ]
          }
        }]
      }]
    }]
  });

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (_request, environment) => {
      assert.equal(environment.variables.find((item) => item.key === 'folderStage').value, 'folder');
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.equal(result.results[0].testScriptResult.tests[0].name, 'postman event scripts ran');
  assert.equal(result.collectionVariables.find((item) => item.key === 'collectionStage').value, 'collection');
});

test('honors pm.execution.setNextRequest during collection runs', async () => {
  const collection = collectionModel({
    name: 'Execution Control',
    requests: [
      requestModel({
        id: 'first',
        name: 'First',
        url: 'https://api.example.test/first',
        scripts: { tests: "pm.execution.setNextRequest('third');" }
      }),
      requestModel({
        id: 'second',
        name: 'Second',
        url: 'https://api.example.test/second'
      }),
      requestModel({
        id: 'third',
        name: 'Third',
        url: 'https://api.example.test/third',
        scripts: { tests: "pm.execution.setNextRequest(null);" }
      })
    ]
  });
  const seen = [];

  const result = await runCollection(collection, null, {
    sendRequest: async (request) => {
      seen.push(request.id);
      return response(200, '{}');
    }
  });

  assert.deepEqual(seen, ['first', 'third']);
  assert.equal(result.totalRequests, 2);
  assert.equal(result.passed, true);
});

test('runs pm.execution.runRequest through the collection broker', async () => {
  const collection = collectionModel({
    name: 'Run Request Broker',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }],
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: '{{baseUrl}}/root',
        scripts: {
          tests: `
            pm.environment.set('beforeRunRequest', 'from-root');
            pm.test('root can run another request', async function () {
              const response = await pm.execution.runRequest('target', {
                variables: { targetPath: 'from-override' }
              });
              pm.expect(response.code).to.equal(202);
              pm.expect(response.json().target).to.equal('from-override');
              pm.expect(pm.environment.get('fromTarget')).to.equal('yes');
            });
            pm.execution.setNextRequest(null);
          `
        }
      }),
      requestModel({
        id: 'target',
        name: 'Target',
        url: '{{baseUrl}}/{{targetPath}}',
        variables: [{ enabled: true, key: 'targetPath', value: 'default-target' }],
        scripts: {
          tests: `
            pm.test('target request tests are reported on caller', function () {
              pm.expect(pm.environment.get('beforeRunRequest')).to.equal('from-root');
              pm.expect(pm.response.code).to.equal(202);
            });
            pm.environment.set('fromTarget', 'yes');
            pm.execution.setNextRequest('should-not-affect-root');
          `
        }
      }),
      requestModel({
        id: 'should-not-run',
        name: 'Should Not Run',
        url: '{{baseUrl}}/should-not-run'
      })
    ]
  });
  const sent = [];

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push({
        id: request.id,
        targetPath: environment.variables.find((item) => item.key === 'targetPath')?.value || '',
        beforeRunRequest: environment.variables.find((item) => item.key === 'beforeRunRequest')?.value || ''
      });
      if (request.id === 'target') {
        return response(202, '{"target":"from-override"}');
      }
      return response(200, '{"ok":true}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent.map((item) => item.id), ['root', 'target']);
  assert.equal(sent[1].targetPath, 'from-override');
  assert.equal(sent[1].beforeRunRequest, 'from-root');
  assert.equal(result.totalRequests, 1);
  assert.equal(result.environment.variables.find((item) => item.key === 'fromTarget').value, 'yes');
  assert.ok(result.results[0].testScriptResult.tests.some((item) => item.name === 'Target: target request tests are reported on caller' && item.passed));
});

test('resolves pm.execution.runRequest request links against imported request IDs', async () => {
  const collection = collectionModel({
    id: 'collection-link-targets',
    name: 'Run Request Links',
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: 'https://api.example.test/root',
        scripts: {
          tests: `
            pm.test('root can run a linked request', async function () {
              const response = await pm.execution.runRequest('https://www.postman.com/team/workspace/request/collection-postman-id/request-postman-uid?action=share&source=copy-link');
              pm.expect(response.code).to.equal(204);
            });
            pm.execution.setNextRequest(null);
          `
        }
      }),
      requestModel({
        id: 'regenerated-target-id',
        name: 'Target',
        url: 'https://api.example.test/target',
        postman: {
          ids: {
            original: 'request-postman-original',
            uid: 'request-postman-uid'
          }
        }
      })
    ]
  });
  const sent = [];

  const result = await runCollection(collection, null, {
    sendRequest: async (request) => {
      sent.push(request.id);
      return response(request.id === 'regenerated-target-id' ? 204 : 200, '');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, ['root', 'regenerated-target-id']);
  assert.equal(result.totalRequests, 1);
});

test('runs pm.vault through collection scripts when the workspace grants access', async () => {
  const collection = collectionModel({
    name: 'Vault Collection',
    requests: [
      requestModel({
        id: 'vault-request',
        name: 'Vault Request',
        url: 'https://api.example.test/vault',
        scripts: {
          preRequest: `
            pm.test('stores vault secret', async function () {
              await pm.vault.set('collectionToken', 'stored');
            });
          `,
          tests: `
            pm.test('reads vault secret', async function () {
              pm.expect(await pm.vault.get('collectionToken')).to.equal('stored');
              await pm.vault.unset('collectionToken');
              pm.expect(await pm.vault.get('collectionToken')).to.be.undefined;
            });
          `
        }
      })
    ]
  });
  const vault = new MemoryVaultStore();

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response(200, '{}'),
    trustedCapabilities: { vault: true },
    vault
  });

  assert.equal(result.passed, true);
  assert.equal(await vault.get('collectionToken'), undefined);
});

test('propagates diagnostics callbacks into collection sandbox broker denials', async () => {
  const events = [];
  const collection = collectionModel({
    name: 'Diagnostic Denials',
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: 'https://api.example.test/root',
        scripts: {
          preRequest: `
            pm.test('sendRequest denial is diagnosed', async function () {
              await pm.sendRequest('https://api.example.test/denied');
            });
          `
        }
      })
    ]
  });

  const sent = [];
  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    trustedCapabilities: { sendRequest: false },
    recordDiagnosticEvent: async (event) => {
      events.push(event);
    },
    sendRequest: async (request) => {
      sent.push(request.id);
      return response(200, '{}');
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.passed, false);
  assert.deepEqual(sent, ['root']);
  assert.equal(result.results[0].statusCode, 200);
  assert.equal(result.results[0].preRequestScriptResult.tests[0].passed, false);
  assert.ok(events.some((event) => (
    event.type === 'sandbox.broker.denied'
      && event.failureCode === 'script_send_request_disabled'
      && event.fields.operation === 'pm.sendRequest'
  )));
});

test('returns null when pm.execution.runRequest targets a skipped request', async () => {
  const collection = collectionModel({
    name: 'Run Request Skip',
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: 'https://api.example.test/root',
        scripts: {
          tests: `
            pm.test('skipped runRequest returns null', async function () {
              const response = await pm.execution.runRequest('skipped');
              pm.expect(response).to.be.null;
            });
            pm.execution.setNextRequest(null);
          `
        }
      }),
      requestModel({
        id: 'skipped',
        name: 'Skipped',
        url: 'https://api.example.test/skipped',
        scripts: { preRequest: 'pm.execution.skipRequest();' }
      })
    ]
  });
  const sent = [];

  const result = await runCollection(collection, null, {
    sendRequest: async (request) => {
      sent.push(request.id);
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, ['root']);
  assert.equal(result.totalRequests, 1);
});

test('does not commit pm.execution.runRequest side effects when the caller phase aborts', async () => {
  const collection = collectionModel({
    name: 'Run Request Rollback',
    requests: [
      requestModel({
        id: 'root',
        name: 'Root',
        url: 'https://api.example.test/root',
        scripts: {
          tests: `
            pm.execution.runRequest('target');
            throw new Error('abort caller phase');
          `
        }
      }),
      requestModel({
        id: 'target',
        name: 'Target',
        url: 'https://api.example.test/target',
        scripts: {
          tests: "pm.environment.set('fromRolledBackTarget', 'should-not-commit');"
        }
      })
    ]
  });

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    stopOnFailure: true,
    sendRequest: async () => response(200, '{}')
  });

  assert.equal(result.passed, false);
  assert.match(result.results[0].error, /abort caller phase/);
  assert.equal(result.environment.variables.find((item) => item.key === 'fromRolledBackTarget'), undefined);
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
