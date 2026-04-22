const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateAssertions, readHtmlSelector, readJsonPath, readXmlPath } = require('../../src/core/assertions');
const { collectionRunResultToCsv, runCollection } = require('../../src/core/collectionRunner');
const { collectionModel, requestModel } = require('../../src/core/models');
const { importPostmanCollection } = require('../../src/core/postmanImporter');

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
      extractedVariables: [{ key: 'token', value: 'redacted in report body' }]
    }],
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test', secret: false }],
    environment: { variables: [{ enabled: true, key: 'token', value: 'secret', secret: true }] }
  });

  assert.match(csv, /collectionName,Exports/);
  assert.match(csv, /requestId,requestName,folderName/);
  assert.match(csv, /statusCode/);
  assert.match(csv, /variableName,requestId/);
  assert.match(csv, /runtimeScope,requestId,key,value,secret/);
  assert.match(csv, /collection,,baseUrl,https:\/\/api.example.test,false/);
  assert.match(csv, /environment,,token,\[secret\],true/);
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
