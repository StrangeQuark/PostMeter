const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertCollectionPayload,
  assertCollectionExportFormat,
  assertCollectionRunResultPayload,
  assertExternalUrlPayload,
  assertExportFormat,
  assertLoadConfigPayload,
  assertLoadId,
  assertLoadResultPayload,
  assertOptionalEnvironmentPayload,
  assertResponsePayload,
  assertRequestPayload,
  assertUpdateCheckOptionsPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspacePayload
} = require('../../src/core/ipcValidation');
const { payloadSchemas } = require('../../src/core/payloadSchemas');

test('accepts structurally valid IPC payloads', () => {
  assert.doesNotThrow(() => assertRequestPayload({
    id: 'r1',
    name: 'Request',
    method: 'GET',
    url: 'https://example.test',
    queryParams: [{ enabled: true, key: 'q', value: '1', secret: false }],
    headers: [{ enabled: true, key: 'Accept', value: 'application/json' }],
    bodyType: 'NONE',
    body: '',
    scripts: { preRequest: "pm.environment.set('x', '1');", tests: "pm.test('ok', function () {});" },
    variables: [{ enabled: true, key: 'local', value: 'value', secret: false }],
    examples: [{ name: 'Example', statusCode: 200, headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }], bodyType: 'RAW_JSON', body: '{}' }],
    cookieJar: { enabled: true, storeResponses: true },
    auth: { type: 'bearer', token: 'secret' }
  }));
  assert.doesNotThrow(() => assertCollectionPayload({
    id: 'c1',
    name: 'Collection',
    description: '',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test', secret: false }],
    certificates: [{ name: 'Client Cert', matches: ['https://example.test/*'], certPath: '/tmp/client.crt', keyPath: '/tmp/client.key', passphrase: 'secret' }],
    requests: [],
    folders: [{ id: 'f1', name: 'Folder', requests: [], folders: [] }]
  }));
  assert.doesNotThrow(() => assertWorkspacePayload({
    schemaVersion: 8,
    settings: { updates: { includePrereleases: true } },
    collections: [],
    environments: [{ id: 'e1', name: 'Env', variables: [{ enabled: true, key: 'token', value: 'secret', secret: true }] }],
    cookies: [{ enabled: true, name: 'sid', value: 'secret', domain: 'example.test', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', hostOnly: true, source: 'postman', extensions: ['SameParty'] }],
    history: []
  }));
  assert.doesNotThrow(() => assertOptionalEnvironmentPayload(null));
  assert.doesNotThrow(() => assertLoadConfigPayload({
    concurrency: 1,
    totalRequests: 1,
    durationSeconds: 0,
    rampUpSeconds: 0,
    targetRatePerSecond: 10,
    executionMode: 'multiProcess',
    workerProcesses: 2,
    recordSamples: true,
    allowedHosts: ['example.test'],
    confirmedHighConcurrency: false
  }));
  assert.doesNotThrow(() => assertLoadResultPayload({
    totalRequests: 1,
    statusCounts: { 200: 1 },
    errors: [],
    latencyHistogram: [{ upperBoundMillis: 50, count: 1 }, { upperBoundMillis: null, count: 0 }],
    samples: [{ index: 1, workerIndex: 1, workerProcess: 1, startedAtMillis: 0, durationMillis: 4, success: true, statusCode: 200 }]
  }));
  assert.doesNotThrow(() => assertCollectionRunResultPayload({
    collectionId: 'c1',
    collectionName: 'Collection',
    totalRequests: 1,
    passedRequests: 1,
    failedRequests: 0,
    passed: true,
    cancelled: false,
    results: [{
      requestId: 'r1',
      requestName: 'Request',
      passed: true,
      assertionResults: [],
      preRequestScriptResult: { passed: true, tests: [], logs: [] },
      testScriptResult: { passed: true, tests: [{ name: 'ok', passed: true }], logs: ['done'] },
      extractedVariables: [{ enabled: true, key: 'token', value: 'abc' }],
      localVariables: [{ enabled: true, key: 'local', value: 'value' }]
    }],
    environment: { id: 'e1', name: 'Runtime', variables: [] },
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }]
  }));
  assert.doesNotThrow(() => assertResponsePayload({
    statusCode: 200,
    headers: { 'content-type': ['application/json'] },
    body: '{}',
    durationMillis: 10,
    responseBytes: 2,
    finalUrl: 'https://example.test',
    updatedCookies: [{ enabled: true, name: 'sid', value: 'secret', domain: 'example.test', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', hostOnly: true }]
  }));
  assert.doesNotThrow(() => assertWorkspaceLoadResultPayload({
    workspace: { schemaVersion: 8, settings: { updates: { includePrereleases: false } }, collections: [], environments: [], cookies: [], history: [] },
    path: '/tmp/workspace.json'
  }));
  assert.doesNotThrow(() => assertLoadId('load-1'));
  assert.doesNotThrow(() => assertExportFormat('json'));
  assert.doesNotThrow(() => assertUpdateCheckOptionsPayload({ includePrereleases: true }));
  assert.doesNotThrow(() => assertExternalUrlPayload('https://github.com/StrangeQuark/PostMeter/releases'));
});

test('rejects malformed IPC payloads before they reach core services', () => {
  assert.throws(() => assertRequestPayload(null), /Invalid IPC payload: request must be an object/);
  assert.throws(() => assertRequestPayload({ method: 'TRACE', queryParams: [], headers: [], bodyType: 'NONE' }), /request.method is not supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: 'bad', headers: [], bodyType: 'NONE' }), /request.queryParams must be an array/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', assertions: [{ type: 'bad' }] }), /assertions\[0\].type must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', assertions: [{ operator: 'near' }] }), /assertions\[0\].operator must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', scripts: { tests: 42 } }), /request.scripts.tests must be a string/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', examples: [{ statusCode: 200, bodyType: 'bad' }] }), /request.examples\[0\].bodyType must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', cookieJar: { enabled: 'yes' } }), /request.cookieJar.enabled must be a boolean/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'oauth2', grantType: 'password' } }), /request.auth.grantType must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'apiKey', location: 'body' } }), /request.auth.location must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'oauth2', redirectStrategy: 'embeddedWebView' } }), /request.auth.redirectStrategy must be one of/);
  assert.throws(() => assertCollectionPayload({ certificates: [{ matches: [42] }], requests: [], folders: [] }), /collection.certificates\[0\].matches\[0\] must be a string/);
  assert.throws(() => assertWorkspacePayload({ collections: {}, environments: [], history: [] }), /workspace.collections must be an array/);
  assert.throws(() => assertWorkspacePayload({ settings: { updates: { includePrereleases: 'yes' } }, collections: [], environments: [], history: [] }), /workspace.settings.updates.includePrereleases must be a boolean/);
  assert.throws(() => assertWorkspacePayload({ collections: [], environments: [], cookies: [{ secure: 'yes' }], history: [] }), /workspace.cookies\[0\].secure must be a boolean/);
  assert.throws(() => assertWorkspacePayload({ collections: [], environments: [], cookies: [{ sameSite: 'Loose' }], history: [] }), /workspace.cookies\[0\].sameSite must be one of/);
  assert.throws(() => assertWorkspacePayload({ collections: [], environments: [], cookies: [{ priority: 'Urgent' }], history: [] }), /workspace.cookies\[0\].priority must be one of/);
  assert.throws(() => assertWorkspacePayload({ collections: [], environments: [], cookies: [{ extensions: [42] }], history: [] }), /workspace.cookies\[0\].extensions\[0\] must be a string/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: Number.NaN, totalRequests: 1 }), /config.concurrency must be a finite number/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, recordSamples: 'yes' }), /config.recordSamples must be a boolean/);
  assert.throws(() => assertUpdateCheckOptionsPayload({ includePrereleases: 'yes' }), /options.includePrereleases must be a boolean/);
  assert.throws(() => assertExternalUrlPayload(42), /external.url must be a string/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, executionMode: 'cluster' }), /config.executionMode must be one of/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, allowedHosts: [42] }), /config.allowedHosts\[0\] must be a string/);
  assert.throws(() => assertLoadResultPayload({ executionMode: 'cluster' }), /result.executionMode must be one of/);
  assert.throws(() => assertLoadResultPayload({ statusCounts: { 200: 'one' } }), /result.statusCounts.200 must be a finite number/);
  assert.throws(() => assertLoadResultPayload({ latencyHistogram: [{ count: 'one' }] }), /result.latencyHistogram\[0\].count must be a finite number/);
  assert.throws(() => assertLoadResultPayload({ samples: [{ success: 'yes' }] }), /result.samples\[0\].success must be a boolean/);
  assert.throws(() => assertCollectionRunResultPayload({ collectionName: 42 }), /result.collectionName must be a string/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ assertionResults: 'bad' }] }), /result.results\[0\].assertionResults must be an array/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ assertionResults: [{ passed: 'yes' }] }] }), /result.results\[0\].assertionResults\[0\].passed must be a boolean/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ testScriptResult: { tests: [{ passed: 'yes' }] } }] }), /result.results\[0\].testScriptResult.tests\[0\].passed must be a boolean/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '', durationMillis: 'slow', responseBytes: 0, finalUrl: '', headers: {} }), /response.durationMillis must be a finite number/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: 42, durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {} }), /response.body must be a string/);
  assert.throws(() => assertWorkspaceLoadResultPayload({ workspace: null }), /result.workspace must be an object/);
  assert.throws(() => assertLoadId({ bad: true }), /id must be a string/);
  assert.throws(() => assertExportFormat('xml'), /format must be one of/);
  assert.throws(() => assertCollectionExportFormat('bad'), /format must be one of/);
});

test('request and workspace IPC validators follow shared entity schema arrays', () => {
  const requestBase = {
    method: 'GET',
    url: 'https://example.test',
    bodyType: 'NONE',
    queryParams: [],
    headers: [],
    assertions: [],
    variables: [],
    examples: []
  };
  for (const field of payloadSchemas.entities.request.arrays) {
    assert.throws(
      () => assertRequestPayload({ ...requestBase, [field]: 'bad' }),
      new RegExp(`request\\.${field} must be an array`)
    );
  }

  const workspaceBase = {
    schemaVersion: 8,
    settings: { updates: { includePrereleases: false } },
    collections: [],
    environments: [],
    cookies: [],
    history: []
  };
  for (const field of payloadSchemas.entities.workspace.arrays) {
    assert.throws(
      () => assertWorkspacePayload({ ...workspaceBase, [field]: 'bad' }),
      new RegExp(`workspace\\.${field} must be an array`)
    );
  }
});
