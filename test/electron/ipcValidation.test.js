const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertCollectionPayload,
  assertCollectionExportFormat,
  assertCollectionRunResultPayload,
  assertExternalUrlPayload,
  assertExportFormat,
  assertFileOperationResultPayload,
  assertLoadConfigPayload,
  assertLoadId,
  assertLoadProgressPayload,
  assertLoadResultPayload,
  assertOAuthProgressPayload,
  assertOptionalEnvironmentPayload,
  assertResponsePayload,
  assertRequestPayload,
  assertRunnerConfigPayload,
  assertRunnerProgressPayload,
  assertUpdateCheckOptionsPayload,
  assertWorkspaceEnvironmentSavePayload,
  assertWorkspaceEnvironmentSaveResultPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspaceRequestSavePayload,
  assertWorkspaceRequestSaveResultPayload,
  assertWorkspaceSettingsSavePayload,
  assertWorkspaceSettingsSaveResultPayload,
  assertWorkspacePayload
} = require('../../src/core/ipcValidation');
const { payloadSchemas } = require('../../src/core/payloadSchemas');

test('accepts structurally valid IPC payloads', () => {
  assert.doesNotThrow(() => assertRequestPayload({
    id: 'r1',
    name: 'Request',
    method: 'GET',
    url: 'https://example.test',
    queryParams: [{ enabled: true, key: 'q', value: '1' }],
    headers: [{ enabled: true, key: 'Accept', value: 'application/json' }],
    bodyType: 'NONE',
    body: '',
    protocol: 'grpc',
    methodPath: 'pkg.Service/Method',
    metadata: [{ enabled: true, key: 'x-client', value: 'postmeter' }],
    messages: [{ name: 'seed', data: { id: '1' }, timestamp: '2026-04-27T00:00:00.000Z' }],
    grpc: { service: 'pkg.Service', method: 'Method', methodType: 'unary' },
    postman: { ids: { original: 'postman-request-id' }, events: [{ listen: 'test', script: { exec: ['pm.test("ok", function () {});'] } }] },
    scripts: { preRequest: "pm.environment.set('x', '1');", tests: "pm.test('ok', function () {});", beforeInvoke: "pm.request.metadata.add({ key: 'x', value: 'y' });" },
    variables: [{ enabled: true, key: 'local', value: 'value' }],
    examples: [{ name: 'Example', statusCode: 200, headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }], bodyType: 'RAW_JSON', body: '{}' }],
    cookieJar: { enabled: true, storeResponses: true },
    loadTestPolicy: { enabled: true, concurrency: 2, totalRequests: 10, maxRatePerSecond: 5 },
    auth: { type: 'bearer', token: 'secret' }
  }));
  assert.doesNotThrow(() => assertCollectionPayload({
    id: 'c1',
    name: 'Collection',
    description: '',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }],
    postman: { info: { _postman_id: 'postman-collection-id' }, itemOrder: [{ kind: 'request', id: 'postman-request-id' }] },
    certificates: [{ name: 'Client Cert', matches: ['https://example.test/*'], certPath: '/tmp/client.crt', keyPath: '/tmp/client.key', passphrase: 'secret' }],
    requests: [],
    folders: [{ id: 'f1', name: 'Folder', requests: [], folders: [] }]
  }));
  assert.doesNotThrow(() => assertWorkspacePayload({
    schemaVersion: 11,
    name: 'Workspace',
    settings: {
      appearance: { theme: 'dark' },
      tabs: { saveOnForceClose: true },
      sandbox: {
        fileBindings: [{
          source: 'fixtures/upload.txt',
          localPath: '/tmp/upload.txt',
          mode: 'file',
          reviewedAt: '2026-05-01T00:00:00.000Z'
        }],
        packageCache: [{
          specifier: 'npm:@postmeter/tools@1.0.0',
          source: 'module.exports = {};',
          files: [{ path: 'index.js', source: 'module.exports = {};' }],
          integrity: 'sha256-reviewed',
          dependencyAliases: { helper: 'npm:@postmeter/helper@1.0.0' },
          dependencies: ['npm:@postmeter/helper@1.0.0'],
          packageJson: { main: 'index.js' }
        }],
        trustedCapabilities: {
          sendRequest: true,
          cookies: true,
          vault: false,
          vaultGrants: {
            workspace: false,
            collections: ['collection-1'],
            requests: ['request-1'],
            deniedCollections: [],
            deniedRequests: []
          }
        }
      },
      updates: { includePrereleases: true }
    },
    collections: [],
    environments: [{ id: 'e1', name: 'Env', variables: [{ enabled: true, key: 'token', value: 'secret' }] }],
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
    maxRatePerSecond: 10,
    executionMode: 'multiProcess',
    workerProcesses: 2,
    recordSamples: true,
    confirmedHighConcurrency: false
  }));
  assert.doesNotThrow(() => assertLoadResultPayload({
    totalRequests: 1,
    maxRatePerSecond: 10,
    policyDecisions: [{ scope: 'rate', message: 'Effective target rate defaults to the configured rate cap.' }],
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
      testScriptResult: { passed: true, tests: [{ name: 'ok', passed: true }], logs: ['done'], visualizer: { html: '<h1>ok</h1>', template: '<h1>{{value}}</h1>' } },
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
    updatedCookies: [{ enabled: true, name: 'sid', value: 'secret', domain: 'example.test', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', hostOnly: true }],
    preRequestScriptResult: { passed: true, tests: [], logs: [] },
    testScriptResult: { passed: true, tests: [{ name: 'saved token', passed: true }], logs: ['done'], visualizer: { html: '<h1>ok</h1>', template: '<h1>{{value}}</h1>' } },
    environment: { id: 'e1', name: 'Runtime', variables: [{ enabled: true, key: 'REFRESH_TOKEN', value: 'abc' }] },
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }],
    localVariables: [{ enabled: true, key: 'local', value: 'value' }],
    skipped: true
  }));
  assert.doesNotThrow(() => assertWorkspaceLoadResultPayload({
    workspace: { schemaVersion: 11, name: 'Workspace', settings: { updates: { includePrereleases: false } }, collections: [], environments: [], cookies: [], history: [] },
    path: '/tmp/workspace.json',
    activeWorkspaceId: 'workspace.json',
    workspaces: [{ id: 'workspace.json', name: 'Workspace', path: '/tmp/workspace.json', current: true, deletable: false }]
  }));
  assert.doesNotThrow(() => assertWorkspaceRequestSavePayload({
    collectionId: 'c1',
    requestId: 'r1',
    folderId: 'f1',
    createdUnsaved: true,
    request: {
      id: 'r1',
      name: 'Request',
      method: 'GET',
      url: 'https://example.test',
      queryParams: [],
      headers: [],
      bodyType: 'NONE'
    },
    collectionShell: {
      id: 'c1',
      name: 'Collection',
      description: '',
      certificates: []
    },
    folderPath: [{ id: 'f1', name: 'Folder' }],
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }],
    cookies: [{ enabled: true, name: 'sid', value: 'secret', domain: 'example.test', path: '/' }],
    settings: { updates: { includePrereleases: true } }
  }));
  assert.doesNotThrow(() => assertWorkspaceRequestSaveResultPayload({
    request: {
      id: 'r1',
      name: 'Request',
      method: 'GET',
      url: 'https://example.test',
      queryParams: [],
      headers: [],
      bodyType: 'NONE'
    },
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }],
    cookies: [{ enabled: true, name: 'sid', value: 'secret', domain: 'example.test', path: '/' }]
  }));
  assert.doesNotThrow(() => assertWorkspaceEnvironmentSavePayload({
    environmentId: 'e1',
    createdUnsaved: true,
    environment: { id: 'e1', name: 'Env', variables: [{ enabled: true, key: 'token', value: 'secret' }] },
    settings: { updates: { includePrereleases: true } }
  }));
  assert.doesNotThrow(() => assertWorkspaceEnvironmentSaveResultPayload({
    environment: { id: 'e1', name: 'Env', variables: [{ enabled: true, key: 'token', value: 'secret' }] }
  }));
  assert.doesNotThrow(() => assertWorkspaceSettingsSavePayload({
    appearance: { theme: 'dark' },
    diagnostics: {
      logging: { enabled: true, level: 'warn' },
      requestResponseLogging: {
        urls: true,
        headers: false,
        cookies: false,
        bodies: false,
        protocolMessages: false,
        scriptConsole: false,
        payloadIdentifiers: false
      }
    },
    sandbox: {
      fileBindings: [{ source: 'fixtures/upload.txt', localPath: '/tmp/upload.txt' }],
      packageCache: [{ specifier: '@team/tools', source: 'module.exports = {};', integrity: 'sha256-reviewed' }],
      trustedCapabilities: { sendRequest: true, cookies: true, vault: true, vaultGrants: { workspace: true } }
    },
    tabs: { saveOnForceClose: true },
    updates: { includePrereleases: true }
  }));
  assert.doesNotThrow(() => assertWorkspaceSettingsSaveResultPayload({
    settings: {
      appearance: { theme: 'dark' },
      updates: { includePrereleases: true }
    }
  }));
  assert.doesNotThrow(() => assertFileOperationResultPayload({
    cancelled: false,
    path: '/tmp/export.json'
  }));
  assert.doesNotThrow(() => assertFileOperationResultPayload({
    cancelled: false,
    backupPath: '/tmp/workspace.backup',
    workspace: { schemaVersion: 11, settings: { updates: { includePrereleases: false } }, collections: [], environments: [], cookies: [], history: [] }
  }));
  assert.doesNotThrow(() => assertFileOperationResultPayload({
    cancelled: false,
    collection: { id: 'c1', name: 'Collection', requests: [], folders: [] }
  }));
  assert.doesNotThrow(() => assertLoadId('load-1'));
  assert.doesNotThrow(() => assertLoadProgressPayload({
    completedRequests: 1,
    requestedRequests: 2,
    mode: 'requestCount',
    targetRatePerSecond: 5,
    maxRatePerSecond: 10,
    executionMode: 'singleProcess',
    workerProcesses: 1,
    elapsedMillis: 25,
    activeWorkers: 1,
    policyDecisions: [{ scope: 'rate', message: 'Rate cap applied.' }]
  }));
  assert.doesNotThrow(() => assertRunnerConfigPayload({ stopOnFailure: true }));
  assert.doesNotThrow(() => assertRunnerProgressPayload({
    completedRequests: 1,
    totalRequests: 2,
    requestId: 'r1',
    requestName: 'Request',
    passed: true
  }));
  assert.doesNotThrow(() => assertOAuthProgressPayload({
    id: 'oauth-1',
    type: 'device',
    status: 'polling',
    message: 'Waiting for OAuth device authorization.',
    userCode: 'ABCD-EFGH',
    verificationUri: 'https://example.test/device',
    verificationUriComplete: 'https://example.test/device?user_code=ABCD-EFGH',
    nextAttemptAt: new Date(0).toISOString(),
    expiresAt: new Date(60000).toISOString()
  }));
  assert.doesNotThrow(() => assertExportFormat('json'));
  assert.doesNotThrow(() => assertUpdateCheckOptionsPayload({ includePrereleases: true }));
  assert.doesNotThrow(() => assertExternalUrlPayload('https://github.com/StrangeQuark/PostMeter/releases'));
});

test('rejects malformed IPC payloads before they reach core services', () => {
  assert.throws(() => assertRequestPayload(null), /Invalid IPC payload: request must be an object/);
  assert.throws(() => assertRequestPayload({ method: 'TRACE', queryParams: [], headers: [], bodyType: 'NONE' }), /request.method is not supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', protocol: 'ftp', queryParams: [], headers: [], bodyType: 'NONE' }), /request.protocol is not supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', protocol: 'grpc', queryParams: [], headers: [], bodyType: 'NONE', messages: [{ data: 'x'.repeat(40000) }] }), /request.messages\[0\].data cannot exceed/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: 'bad', headers: [], bodyType: 'NONE' }), /request.queryParams must be an array/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', assertions: [{ type: 'bad' }] }), /assertions\[0\].type must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', assertions: [{ operator: 'near' }] }), /assertions\[0\].operator must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', scripts: { tests: 42 } }), /request.scripts.tests must be a string/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', examples: [{ statusCode: 200, bodyType: 'bad' }] }), /request.examples\[0\].bodyType must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', cookieJar: { enabled: 'yes' } }), /request.cookieJar.enabled must be a boolean/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', loadTestPolicy: { hostPolicies: [{ host: 42 }] } }), /request.loadTestPolicy.hostPolicies is no longer supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'oauth2', grantType: 'password' } }), /request.auth.grantType must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'apiKey', location: 'body' } }), /request.auth.location must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'oauth2', redirectStrategy: 'embeddedWebView' } }), /request.auth.redirectStrategy must be one of/);
  assert.throws(() => assertCollectionPayload({ certificates: [{ matches: [42] }], requests: [], folders: [] }), /collection.certificates\[0\].matches\[0\] must be a string/);
  assert.throws(() => assertWorkspacePayload({ collections: {}, environments: [], history: [] }), /workspace.collections must be an array/);
  assert.throws(() => assertWorkspacePayload({ settings: { updates: { includePrereleases: 'yes' } }, collections: [], environments: [], history: [] }), /workspace.settings.updates.includePrereleases must be a boolean/);
  assert.throws(() => assertWorkspacePayload({ settings: { appearance: { theme: 'sepia' } }, collections: [], environments: [], history: [] }), /workspace.settings.appearance.theme must be one of/);
  assert.throws(() => assertWorkspacePayload({ settings: { diagnostics: { requestResponseLogging: { bodies: 'yes' } } }, collections: [], environments: [], history: [] }), /workspace.settings.diagnostics.requestResponseLogging.bodies must be a boolean/);
  assert.throws(() => assertWorkspacePayload({ settings: { diagnostics: { logging: { level: 'trace' } } }, collections: [], environments: [], history: [] }), /workspace.settings.diagnostics.logging.level must be one of/);
  assert.throws(() => assertWorkspacePayload({ settings: { diagnostics: { uploadUrl: 'https://example.test' } }, collections: [], environments: [], history: [] }), /workspace.settings.diagnostics.uploadUrl is not allowed/);
  assert.throws(() => assertWorkspacePayload({ settings: { sandbox: { unknown: true } }, collections: [], environments: [], history: [] }), /workspace.settings.sandbox.unknown is not allowed/);
  assert.throws(() => assertWorkspacePayload({ settings: { sandbox: { fileBindings: 'bad' } }, collections: [], environments: [], history: [] }), /workspace.settings.sandbox.fileBindings must be an array/);
  assert.throws(() => assertWorkspacePayload({ settings: { sandbox: { fileBindings: [{ source: 'fixture.txt' }] } }, collections: [], environments: [], history: [] }), /workspace.settings.sandbox.fileBindings\[0\].localPath must be a string/);
  assert.throws(() => assertWorkspacePayload({ settings: { sandbox: { fileBindings: [{ source: 'fixture.txt', localPath: '/tmp/fixture.txt', mode: 'socket' }] } }, collections: [], environments: [], history: [] }), /workspace.settings.sandbox.fileBindings\[0\].mode must be one of/);
  assert.throws(() => assertWorkspacePayload({ settings: { sandbox: { packageCache: [{ specifier: '@team/tools', integrity: 'sha256' }] } }, collections: [], environments: [], history: [] }), /workspace.settings.sandbox.packageCache\[0\].source must be a string/);
  assert.throws(() => assertWorkspacePayload({ settings: { sandbox: { packageCache: [{ specifier: '@team/tools', source: 'x', integrity: 'sha256', files: Array.from({ length: 129 }, (_value, index) => ({ path: `${index}.js`, source: 'x' })) }] } }, collections: [], environments: [], history: [] }), /workspace.settings.sandbox.packageCache\[0\].files cannot contain more than 128 items/);
  assert.throws(() => assertWorkspacePayload({ settings: { sandbox: { packageCache: [{ specifier: '@team/tools', source: 'x'.repeat((128 * 1024) + 1), integrity: 'sha256' }] } }, collections: [], environments: [], history: [] }), /workspace.settings.sandbox.packageCache\[0\].source cannot exceed/);
  assert.throws(() => assertWorkspacePayload({ settings: { sandbox: { trustedCapabilities: { vaultGrants: { requests: ['r'.repeat(257)] } } } }, collections: [], environments: [], history: [] }), /workspace.settings.sandbox.trustedCapabilities.vaultGrants.requests\[0\] cannot exceed/);
  assert.throws(() => assertWorkspacePayload({ settings: { loadTestPolicy: { recordSamples: true } }, collections: [], environments: [], history: [] }), /workspace.settings.loadTestPolicy is no longer supported/);
  assert.throws(() => assertWorkspacePayload({ collections: [], environments: [], cookies: [{ secure: 'yes' }], history: [] }), /workspace.cookies\[0\].secure must be a boolean/);
  assert.throws(() => assertWorkspacePayload({ collections: [], environments: [], cookies: [{ sameSite: 'Loose' }], history: [] }), /workspace.cookies\[0\].sameSite must be one of/);
  assert.throws(() => assertWorkspacePayload({ collections: [], environments: [], cookies: [{ priority: 'Urgent' }], history: [] }), /workspace.cookies\[0\].priority must be one of/);
  assert.throws(() => assertWorkspacePayload({ collections: [], environments: [], cookies: [{ extensions: [42] }], history: [] }), /workspace.cookies\[0\].extensions\[0\] must be a string/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: Number.NaN, totalRequests: 1 }), /config.concurrency must be a finite number/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, recordSamples: 'yes' }), /config.recordSamples must be a boolean/);
  assert.throws(() => assertUpdateCheckOptionsPayload({ includePrereleases: 'yes' }), /options.includePrereleases must be a boolean/);
  assert.throws(() => assertExternalUrlPayload(42), /external.url must be a string/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, executionMode: 'cluster' }), /config.executionMode must be one of/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, allowedHosts: ['example.test'] }), /config.allowedHosts is no longer supported/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, hostPolicies: [{ host: 'example.test', enabled: true }] }), /config.hostPolicies is no longer supported/);
  assert.throws(() => assertLoadResultPayload({ executionMode: 'cluster' }), /result.executionMode must be one of/);
  assert.throws(() => assertLoadResultPayload({ statusCounts: { 200: 'one' } }), /result.statusCounts.200 must be a finite number/);
  assert.throws(() => assertLoadResultPayload({ policyDecisions: [{ message: 42 }] }), /result.policyDecisions\[0\].message must be a string/);
  assert.throws(() => assertLoadResultPayload({ latencyHistogram: [{ count: 'one' }] }), /result.latencyHistogram\[0\].count must be a finite number/);
  assert.throws(() => assertLoadResultPayload({ samples: [{ success: 'yes' }] }), /result.samples\[0\].success must be a boolean/);
  assert.throws(() => assertLoadProgressPayload({ executionMode: 'cluster' }), /progress.executionMode must be one of/);
  assert.throws(() => assertLoadProgressPayload({ completedRequests: 1, accessToken: 'raw-token' }), /progress.accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertRunnerConfigPayload({ stopOnFailure: 'yes' }), /config.stopOnFailure must be a boolean/);
  assert.throws(() => assertRunnerProgressPayload({ passed: 'yes' }), /progress.passed must be a boolean/);
  assert.throws(() => assertRunnerProgressPayload({ completedRequests: 1, clientSecret: 'raw-secret' }), /progress.clientSecret is not allowed in public IPC payloads/);
  assert.throws(() => assertOAuthProgressPayload({ id: 'flow', type: 'password', status: 'starting' }), /progress.type must be one of/);
  assert.throws(() => assertOAuthProgressPayload({ id: 'flow', type: 'pkce', status: 'unknown' }), /progress.status must be one of/);
  assert.throws(() => assertOAuthProgressPayload({ id: 'flow', type: 'pkce', status: 'starting', accessToken: 'raw-token' }), /progress.accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertCollectionRunResultPayload({ collectionName: 42 }), /result.collectionName must be a string/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ assertionResults: 'bad' }] }), /result.results\[0\].assertionResults must be an array/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ assertionResults: [{ passed: 'yes' }] }] }), /result.results\[0\].assertionResults\[0\].passed must be a boolean/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ testScriptResult: { tests: [{ passed: 'yes' }] } }] }), /result.results\[0\].testScriptResult.tests\[0\].passed must be a boolean/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ updatedAuth: { type: 'oauth2', accessToken: 'raw-token' } }] }), /result.results\[0\].updatedAuth must not be included in public IPC payloads/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ accessToken: 'raw-token' }] }), /result.results\[0\].accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertCollectionRunResultPayload({ accessToken: 'raw-token' }), /result.accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertLoadResultPayload({ updatedAuth: { type: 'oauth2', accessToken: 'raw-token' } }), /result.updatedAuth must not be included in public IPC payloads/);
  assert.throws(() => assertLoadResultPayload({ accessToken: 'raw-token' }), /result.accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '', durationMillis: 'slow', responseBytes: 0, finalUrl: '', headers: {} }), /response.durationMillis must be a finite number/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: 42, durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {} }), /response.body must be a string/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '{}', durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {}, updatedAuth: { type: 'oauth2', accessToken: 'raw-token' } }), /response.updatedAuth must not be included in public IPC payloads/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '{}', durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {}, accessToken: 'raw-token' }), /response.accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '{}', durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {}, testScriptResult: { tests: [{ passed: 'yes' }] } }), /response.testScriptResult.tests\[0\].passed must be a boolean/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '{}', durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {}, testScriptResult: { visualizer: { html: 42 } } }), /response.testScriptResult.visualizer.html must be a string/);
  assert.throws(() => assertWorkspaceRequestSavePayload({ requestId: 'r1', request: { method: 'GET', queryParams: [], headers: [], bodyType: 'NONE' } }), /payload.collectionId must be a string/);
  assert.throws(() => assertWorkspaceRequestSavePayload({ collectionId: 'c1', requestId: 'r1', request: { method: 'GET', queryParams: [], headers: [], bodyType: 'NONE' }, folderPath: 'bad' }), /payload.folderPath must be an array/);
  assert.throws(() => assertWorkspaceEnvironmentSavePayload({ environment: { id: 'e1', name: 'Env', variables: [] } }), /payload.environmentId must be a string/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ appearance: { theme: 'sepia' } }), /settings.appearance.theme must be one of/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ tabs: { saveOnForceClose: 'yes' } }), /settings.tabs.saveOnForceClose must be a boolean/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ diagnostics: { requestResponseLogging: { headers: 'yes' } } }), /settings.diagnostics.requestResponseLogging.headers must be a boolean/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ diagnostics: { logging: { enabled: 'yes' } } }), /settings.diagnostics.logging.enabled must be a boolean/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ diagnostics: { uploadUrl: 'https:\/\/example.test' } }), /settings.diagnostics.uploadUrl is not allowed/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ sandbox: { trustedCapabilities: { vaultGrants: { requests: 'all' } } } }), /settings.sandbox.trustedCapabilities.vaultGrants.requests must be an array/);
  assert.throws(() => assertWorkspaceSettingsSaveResultPayload({ settings: { updates: { includePrereleases: 'yes' } } }), /result.settings.updates.includePrereleases must be a boolean/);
  assert.throws(() => assertWorkspaceLoadResultPayload({ workspace: null }), /result.workspace must be an object/);
  assert.throws(() => assertFileOperationResultPayload({ cancelled: 'yes' }), /result.cancelled must be a boolean/);
  assert.throws(() => assertFileOperationResultPayload({ cancelled: false, collection: [] }), /result.collection must be an object/);
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
    schemaVersion: 11,
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
