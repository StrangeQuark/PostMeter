const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertCollectionPayload,
  assertCollectionExportFormat,
  assertCollectionRunResultPayload,
  assertExternalUrlPayload,
  assertExportFormat,
  assertHtmlReportOptionsPayload,
  assertFileOperationResultPayload,
  assertOAuthProgressPayload,
  assertOptionalEnvironmentPayload,
  assertPerformanceCalibrationResultPayload,
  assertPerformanceExportFormat,
  assertPerformanceProgressPayload,
  assertPerformanceResultPayload,
  assertPerformanceTestPayload,
  assertResponsePayload,
  assertRequestPayload,
  assertRuntimeId,
  assertRunnerConfigPayload,
  assertRunnerPayload,
  assertRunnerProgressPayload,
  assertSessionPayload,
  assertUpdateCheckOptionsPayload,
  assertWorkspaceCollectionSavePayload,
  assertWorkspaceCollectionSaveResultPayload,
  assertWorkspaceEnvironmentSavePayload,
  assertWorkspaceEnvironmentSaveResultPayload,
  assertWorkspaceFolderSavePayload,
  assertWorkspaceFolderSaveResultPayload,
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
    docs: 'Request docs',
    cookieJar: { enabled: true, storeResponses: true },
    autoHeaders: { sendPostMeterToken: true, showGeneratedHeaders: true },
    settings: { sslCertificateVerification: false },
    auth: { type: 'bearer', token: 'secret' }
  }));
  assert.doesNotThrow(() => assertCollectionPayload({
    id: 'c1',
    name: 'Collection',
    description: '',
    auth: { type: 'bearer', token: '{{token}}' },
    scripts: { preRequest: "pm.variables.set('x', '1');", tests: "pm.test('ok', function () {});" },
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
      appearance: { theme: 'dark', interfaceFont: 'system', interfaceFontSize: 16, editorFont: 'system-mono', editorFontSize: 19 },
      editor: { lineNumbers: false, variableTooltipHints: false },
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
      updates: { includePrereleases: true },
      modals: { closeOnBackdropClick: true }
    },
    collections: [],
    runners: [{
      id: 'runner-1',
      name: 'API Smoke',
      environmentId: 'none',
      allowEnvironmentMutation: false,
      stopOnFailure: true,
      csvVariables: {
        enabled: true,
        schema: 'requestUrl',
        values: 'https://example.test/runner',
        reuseFirstRow: true,
        loopRows: true,
        continueWithoutRows: true
      },
      requests: [{
        id: 'runner-request-1',
        name: 'Runner Request',
        method: 'GET',
        url: 'https://example.test/runner',
        iterations: 3,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        source: {
          collectionId: 'collection-1',
          collectionName: 'Collection',
          requestId: 'request-1',
          requestName: 'Request',
          folderPath: ['Folder']
        }
      }]
    }],
    environments: [{ id: 'e1', name: 'Env', variables: [{ enabled: true, key: 'token', value: 'secret' }] }],
    cookies: [{ enabled: true, name: 'sid', value: 'secret', domain: 'example.test', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', hostOnly: true, source: 'postman', extensions: ['SameParty'] }],
    history: []
  }));
  assert.doesNotThrow(() => assertWorkspacePayload({
    settings: {
      appearance: { interfaceFont: 'system-mono', editorFont: 'georgia' }
    },
    collections: [],
    environments: [],
    history: []
  }));
  assert.doesNotThrow(() => assertOptionalEnvironmentPayload(null));
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
      requestDisplayName: 'Resolved Request',
      requestMethod: 'GET',
      requestUrl: 'https://example.test/resolved',
      finalUrl: 'https://example.test/resolved',
      passed: true,
      responseBody: '{"ok":true}',
      responseBytes: 11,
      timings: { tlsHandshakeMillis: 12, tls: { verificationDisabled: true } },
      tls: { verificationDisabled: true, caCertificateConfigured: true },
      preRequestScriptResult: { passed: true, tests: [], logs: [] },
      testScriptResult: { passed: true, tests: [{ name: 'ok', passed: true }], logs: ['done'], visualizer: { html: '<h1>ok</h1>', template: '<h1>{{value}}</h1>' } },
      localVariables: [{ enabled: true, key: 'local', value: 'value' }]
    }],
    environment: { id: 'e1', name: 'Runtime', variables: [] },
    mutatedEnvironment: { id: 'e1', name: 'Runtime', variables: [{ enabled: true, key: 'token', value: 'abc' }] },
    runnerId: 'runner-1',
    runnerName: 'API Smoke',
    runnerEnvironmentId: 'e1',
    environmentMutationAllowed: true,
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }]
  }));
  assert.doesNotThrow(() => assertPerformanceResultPayload({
    id: 'performance-result',
    performanceTestId: 'perf-1',
    performanceTestName: 'Latency',
    type: 'latency',
    totalRequests: 1,
    completedRequests: 1,
    successfulRequests: 1,
    failedRequests: 0,
    passed: true,
    cancelled: false,
    durationMillis: 10,
    summary: { requestsPerSecond: 1, statusCodes: { 200: 1 } },
    samples: [{
      iteration: 1,
      requestId: 'request-1',
      requestName: 'Request',
      requestDisplayName: 'Resolved Request',
      requestMethod: 'GET',
      requestUrl: 'https://example.test/resolved',
      startedAt: '2026-05-06T00:00:00.000Z',
      statusCode: 200,
      durationMillis: 10,
      responseBody: '{"ok":true}',
      responseBytes: 11,
      passed: true,
      preRequestScriptResult: { passed: true, tests: [{ name: 'pre', passed: true }] },
      testScriptResult: { passed: true, tests: [{ name: 'post', passed: true }] },
      localVariables: [{ enabled: true, key: 'local', value: 'value' }],
      error: ''
    }]
  }));
  assert.doesNotThrow(() => assertPerformanceCalibrationResultPayload({
    id: 'calibration-result',
    startedAt: '2026-05-06T00:00:00.000Z',
    completedAt: '2026-05-06T00:00:01.000Z',
    durationMillis: 1000,
    cancelled: false,
    endpoint: '127.0.0.1',
    summary: {
      peakRequestsPerSecond: 100,
      peakConcurrency: 4,
      sustainedRequestsPerSecond: 90,
      reliableTargetRequestsPerSecond: 90,
      edgeUpperBoundRequestsPerSecond: 100,
      measurementVariationPercent: 2,
      confirmationTargetsTested: 2,
      recommendedMaxRequestsPerSecond: 72,
      saturationConcurrency: 4,
      stabilityPercent: 91,
      repeatabilityPercent: 97,
      confidence: 'high',
      averageLatencyMillis: 2,
      p95LatencyMillis: 5,
      p95StartLagMillis: 3,
      p95EventLoopDelayMillis: 11,
      completedRequests: 10,
      failedRequests: 0,
      confirmationPasses: 2,
      notes: ['Loopback calibration only.']
    },
    stages: [{
      name: 'Unit',
      mode: 'confirmation',
      concurrency: 4,
      requestedRequests: 10,
      targetRequests: 10,
      targetRequestsPerSecond: 100,
      startedRequests: 10,
      completedRequests: 10,
      onTimeCompletedRequests: 10,
      failedRequests: 0,
      durationMillis: 100,
      targetDurationMillis: 100,
      requestsPerSecond: 100,
      completionRatio: 1,
      achievedTargetRatio: 1,
      errorRate: 0,
      averageLatencyMillis: 2,
      p95LatencyMillis: 5,
      p99LatencyMillis: 7,
      averageStartLagMillis: 1,
      p95StartLagMillis: 3,
      intervalCount: 2,
      medianIntervalRequestsPerSecond: 100,
      minIntervalRequestsPerSecond: 90,
      maxIntervalRequestsPerSecond: 110,
      stabilityPercent: 91,
      eventLoopUtilizationPercent: 55,
      p95EventLoopDelayMillis: 11,
      maxInFlightRequests: 4,
      maxInFlightLimit: 4,
      maxStartBacklog: 1,
      confirmationTargetRequestsPerSecond: 100,
      confirmationPass: 1,
      confirmationPasses: 2,
      confirmationCandidateRank: 1,
      confirmationVariationPercent: 2,
      accepted: true,
      confirmed: true,
      failureReasons: []
    }]
  }));
  assert.doesNotThrow(() => assertPerformanceProgressPayload({
    kind: 'calibration',
    phase: 'confirm',
    phaseLabel: 'Edge confirmation',
    message: 'Confirming target',
    percent: 75,
    phasePercent: 50,
    targetRequestsPerSecond: 1000,
    completedRequests: 500,
    totalRequests: 1000,
    activeRequests: 4,
    durationMillis: 1000,
    stageIndex: 3,
    stageCount: 5,
    pass: 2,
    passes: 5
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
  assert.doesNotThrow(() => assertWorkspaceRequestSavePayload({
    runnerId: 'runner-1',
    requestId: 'runner-request-1',
    request: {
      id: 'runner-request-1',
      name: 'Runner Request',
      method: 'GET',
      url: 'https://example.test',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      source: {
        collectionId: 'c1',
        requestId: 'r1'
      }
    },
    runnerShell: {
      id: 'runner-1',
      name: 'Runner',
      environmentId: 'none',
      stopOnFailure: false,
      allowEnvironmentMutation: true
    },
    settings: { updates: { includePrereleases: true } }
  }));
  assert.doesNotThrow(() => assertWorkspaceRequestSavePayload({
    authRefreshOwnerType: 'performance',
    performanceTestId: 'performance-1',
    requestId: 'auth-request-1',
    request: {
      id: 'auth-request-1',
      name: 'Refresh Auth',
      method: 'POST',
      url: 'https://auth.example.test/token',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      auth: { type: 'oauth2', grantType: 'clientCredentials', accessTokenUrl: 'https://auth.example.test/token' }
    },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      authType: 'apiKey',
      targetScope: 'environment',
      accessTokenVariable: 'token',
      refreshIntervalSeconds: 600,
      outputs: [{ slot: 'apiKey', source: 'body', path: 'api_key', variable: 'API_KEY' }],
      request: {
        id: 'auth-request-1',
        method: 'POST',
        url: 'https://auth.example.test/token',
        queryParams: [],
        headers: [],
        bodyType: 'NONE'
      },
      refreshTokenRequest: {
        id: 'refresh-token-request-1',
        method: 'POST',
        url: 'https://auth.example.test/refresh-token',
        queryParams: [],
        headers: [],
        bodyType: 'NONE'
      }
    },
    performanceShell: {
      id: 'performance-1',
      name: 'Performance',
      request: {
        id: 'request-1',
        method: 'GET',
        url: 'https://api.example.test',
        queryParams: [],
        headers: [],
        bodyType: 'NONE'
      },
      authRefresh: {
        request: {
          id: 'auth-request-1',
          method: 'POST',
          url: 'https://auth.example.test/token',
          queryParams: [],
          headers: [],
          bodyType: 'NONE'
        },
        refreshTokenRequest: {
          id: 'refresh-token-request-1',
          method: 'POST',
          url: 'https://auth.example.test/refresh-token',
          queryParams: [],
          headers: [],
          bodyType: 'NONE'
        }
      }
    },
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
  assert.doesNotThrow(() => assertWorkspaceCollectionSavePayload({
    collectionId: 'c1',
    createdUnsaved: true,
    collection: {
      id: 'c1',
      name: 'Collection',
      description: 'Shared collection defaults',
      auth: { type: 'bearer', token: '{{collectionToken}}' },
      scripts: {
        preRequest: "pm.collectionVariables.set('fromCollection', 'yes');",
        tests: "pm.test('collection post-request', function () {});"
      },
      variables: [{ enabled: true, key: 'collectionToken', value: 'secret' }],
      certificates: [],
      requests: [],
      folders: []
    },
    settings: { updates: { includePrereleases: true } }
  }));
  assert.doesNotThrow(() => assertWorkspaceCollectionSaveResultPayload({
    collection: {
      id: 'c1',
      name: 'Collection',
      auth: { type: 'none' },
      scripts: {},
      variables: [],
      requests: [],
      folders: []
    }
  }));
  assert.doesNotThrow(() => assertWorkspaceFolderSavePayload({
    collectionId: 'c1',
    folderId: 'f1',
    createdUnsaved: true,
    folder: {
      id: 'f1',
      name: 'Folder',
      description: 'Folder defaults',
      auth: { type: 'apiKey', key: 'X-Folder-Key', value: 'secret', location: 'header' },
      scripts: { preRequest: "pm.environment.set('fromFolder', 'yes');", tests: '' },
      variables: [{ enabled: true, key: 'folderToken', value: 'secret' }],
      requests: [],
      folders: []
    },
    collectionShell: {
      id: 'c1',
      name: 'Collection',
      auth: { type: 'none' },
      scripts: {},
      variables: [],
      certificates: []
    },
    folderPath: [{ id: 'f1', name: 'Folder' }],
    settings: { updates: { includePrereleases: true } }
  }));
  assert.doesNotThrow(() => assertWorkspaceFolderSaveResultPayload({
    folder: {
      id: 'f1',
      name: 'Folder',
      auth: { type: 'none' },
      scripts: {},
      variables: [],
      requests: [],
      folders: []
    }
  }));
  assert.doesNotThrow(() => assertSessionPayload({
    activeMainPanel: 'request',
    openCollectionTabs: [{
      key: 'collection:c1',
      collectionId: 'c1',
      dirty: true,
      createdUnsaved: false,
      snapshot: '{"id":"c1"}',
      currentState: {
        id: 'c1',
        name: 'Collection',
        variables: [],
        requests: [],
        folders: []
      }
    }],
    openFolderTabs: [{
      key: 'folder:c1:f1',
      collectionId: 'c1',
      folderId: 'f1',
      dirty: true,
      createdUnsaved: false,
      snapshot: '{"id":"f1"}',
      currentState: {
        id: 'f1',
        name: 'Folder',
        variables: [],
        requests: [],
        folders: []
      }
    }],
    openRequestTabs: [],
    openEnvironmentTabs: [],
    openWorkspaceTabs: [],
    openRunnerTabs: [],
    openPerformanceTabs: []
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
    editor: { lineNumbers: true, variableTooltipHints: true },
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
    modals: { closeOnBackdropClick: true },
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
  assert.doesNotThrow(() => assertRuntimeId('runner-1'));
  assert.doesNotThrow(() => assertRunnerConfigPayload({ stopOnFailure: true }));
  assert.doesNotThrow(() => assertRunnerPayload({
    id: 'runner-1',
    name: 'API Smoke',
    environmentId: 'none',
    allowEnvironmentMutation: true,
    stopOnFailure: false,
    csvVariables: {
      enabled: true,
      schema: 'requestName,requestUrl',
      values: 'Request,https://example.test',
      reuseFirstRow: true,
      loopRows: true,
      continueWithoutRows: true
    },
    requests: [{
      id: 'runner-request-1',
      name: 'Request',
      method: 'GET',
      url: 'https://example.test',
      queryParams: [],
      headers: [],
      bodyType: 'NONE'
    }]
  }));
  assert.doesNotThrow(() => assertPerformanceTestPayload({
    id: 'perf-1',
    name: 'CSV Performance',
    type: 'latency',
    csvVariables: {
      enabled: true,
      schema: 'requestUrl',
      values: 'https://example.test/perf',
      reuseFirstRow: true,
      loopRows: true,
      continueWithoutRows: true
    },
    request: {
      id: 'request-1',
      name: 'Request',
      method: 'GET',
      url: '${requestUrl}',
      queryParams: [],
      headers: [],
      bodyType: 'NONE'
    },
    config: { iterations: 1, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 }
  }));
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
  assert.doesNotThrow(() => assertExportFormat('html'));
  assert.doesNotThrow(() => assertPerformanceExportFormat('html'));
  assert.doesNotThrow(() => assertHtmlReportOptionsPayload({
    theme: 'dark',
    includeRequestResults: false,
    includeRequestDetails: false
  }));
  assert.doesNotThrow(() => assertUpdateCheckOptionsPayload({ includePrereleases: true }));
  assert.doesNotThrow(() => assertExternalUrlPayload('https://github.com/StrangeQuark/PostMeter/releases'));
});

test('rejects malformed IPC payloads before they reach core services', () => {
  assert.throws(() => assertRequestPayload(null), /Invalid IPC payload: request must be an object/);
  assert.throws(() => assertRequestPayload({ method: 'TRACE', queryParams: [], headers: [], bodyType: 'NONE' }), /request.method is not supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', protocol: 'ftp', queryParams: [], headers: [], bodyType: 'NONE' }), /request.protocol is not supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', protocol: 'grpc', queryParams: [], headers: [], bodyType: 'NONE', messages: [{ data: 'x'.repeat(40000) }] }), /request.messages\[0\].data cannot exceed/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: 'bad', headers: [], bodyType: 'NONE' }), /request.queryParams must be an array/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', scripts: { tests: 42 } }), /request.scripts.tests must be a string/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', docs: 'x'.repeat((10 * 1024 * 1024) + 1) }), /request.docs cannot exceed/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', examples: [] }), /request.examples is no longer supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', cookieJar: { enabled: 'yes' } }), /request.cookieJar.enabled must be a boolean/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', autoHeaders: { sendPostMeterToken: 'yes' } }), /request.autoHeaders.sendPostMeterToken must be a boolean/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', settings: { caCertificatePath: '/tmp/request-ca.pem' } }), /request.settings.caCertificatePath is not allowed/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', loadTestPolicy: { hostPolicies: [{ host: 42 }] } }), /request.loadTestPolicy is no longer supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'oauth2', grantType: 'password' } }), /request.auth.grantType must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'apiKey', location: 'body' } }), /request.auth.location must be one of/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: [], headers: [], bodyType: 'NONE', auth: { type: 'oauth2', redirectStrategy: 'embeddedWebView' } }), /request.auth.redirectStrategy must be one of/);
  assert.throws(() => assertCollectionPayload({ certificates: [{ matches: [42] }], requests: [], folders: [] }), /collection.certificates\[0\].matches\[0\] must be a string/);
  assert.throws(() => assertWorkspacePayload({ collections: {}, environments: [], history: [] }), /workspace.collections must be an array/);
  assert.throws(() => assertWorkspacePayload({ collections: [], runners: {}, environments: [], history: [] }), /workspace.runners must be an array/);
  assert.throws(() => assertWorkspacePayload({ settings: { updates: { includePrereleases: 'yes' } }, collections: [], environments: [], history: [] }), /workspace.settings.updates.includePrereleases must be a boolean/);
  assert.throws(() => assertWorkspacePayload({ settings: { editor: { lineNumbers: 'yes' } }, collections: [], environments: [], history: [] }), /workspace.settings.editor.lineNumbers must be a boolean/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ editor: { variableTooltipHints: 'yes' } }), /settings.editor.variableTooltipHints must be a boolean/);
  assert.throws(() => assertWorkspacePayload({ settings: { appearance: { theme: 'sepia' } }, collections: [], environments: [], history: [] }), /workspace.settings.appearance.theme must be one of/);
  assert.throws(() => assertWorkspacePayload({ settings: { appearance: { interfaceFont: 'papyrus' } }, collections: [], environments: [], history: [] }), /workspace.settings.appearance.interfaceFont must be one of/);
  assert.throws(() => assertWorkspacePayload({ settings: { appearance: { interfaceFontSize: 99 } }, collections: [], environments: [], history: [] }), /workspace.settings.appearance.interfaceFontSize must be one of 10, 13, 16, 19/);
  assert.throws(() => assertWorkspacePayload({ settings: { appearance: { editorFont: 'comic-sans' } }, collections: [], environments: [], history: [] }), /workspace.settings.appearance.editorFont must be one of/);
  assert.throws(() => assertWorkspacePayload({ settings: { appearance: { editorFontSize: 9 } }, collections: [], environments: [], history: [] }), /workspace.settings.appearance.editorFontSize must be one of 10, 13, 16, 19/);
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
  assert.throws(() => assertUpdateCheckOptionsPayload({ includePrereleases: 'yes' }), /options.includePrereleases must be a boolean/);
  assert.throws(() => assertExternalUrlPayload(42), /external.url must be a string/);
  assert.throws(() => assertRunnerConfigPayload({ stopOnFailure: 'yes' }), /config.stopOnFailure must be a boolean/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', environmentId: 'none', allowEnvironmentMutation: 'yes', requests: [] }), /runner.allowEnvironmentMutation must be a boolean/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', csvVariables: { schema: 42 }, requests: [] }), /runner.csvVariables.schema must be a string/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', csvVariables: { enabled: 'yes' }, requests: [] }), /runner.csvVariables.enabled must be a boolean/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', csvVariables: { activeSource: 'database' }, requests: [] }), /runner.csvVariables.activeSource must be one of/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', csvVariables: { reuseFirstRow: 'yes' }, requests: [] }), /runner.csvVariables.reuseFirstRow must be a boolean/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', csvVariables: { loopRows: 'yes' }, requests: [] }), /runner.csvVariables.loopRows must be a boolean/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', csvVariables: { continueWithoutRows: 'yes' }, requests: [] }), /runner.csvVariables.continueWithoutRows must be a boolean/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', requests: [{ method: 'TRACE', url: 'https:\/\/example.test' }] }), /runner.requests\[0\].method is not supported/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', requests: [{ method: 'GET', url: 'https:\/\/example.test', iterations: 0 }] }), /runner.requests\[0\].iterations must be an integer greater than or equal to 1/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', requests: [{ method: 'GET', url: 'https:\/\/example.test', iterations: 1000001 }] }), /runner.requests\[0\].iterations cannot exceed 1000000/);
  assert.throws(() => assertRunnerPayload({ id: 'runner', requests: [{ method: 'GET', url: 'https:\/\/example.test', source: { folderPath: [42] } }] }), /runner.requests\[0\].source.folderPath\[0\] must be a string/);
  assert.throws(() => assertRunnerProgressPayload({ passed: 'yes' }), /progress.passed must be a boolean/);
  assert.throws(() => assertRunnerProgressPayload({ completedRequests: 1, clientSecret: 'raw-secret' }), /progress.clientSecret is not allowed in public IPC payloads/);
  assert.throws(() => assertOAuthProgressPayload({ id: 'flow', type: 'password', status: 'starting' }), /progress.type must be one of/);
  assert.throws(() => assertOAuthProgressPayload({ id: 'flow', type: 'pkce', status: 'unknown' }), /progress.status must be one of/);
  assert.throws(() => assertOAuthProgressPayload({ id: 'flow', type: 'pkce', status: 'starting', accessToken: 'raw-token' }), /progress.accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertCollectionRunResultPayload({ collectionName: 42 }), /result.collectionName must be a string/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ testScriptResult: { tests: [{ passed: 'yes' }] } }] }), /result.results\[0\].testScriptResult.tests\[0\].passed must be a boolean/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ responseBody: 42 }] }), /result.results\[0\].responseBody must be a string/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ updatedAuth: { type: 'oauth2', accessToken: 'raw-token' } }] }), /result.results\[0\].updatedAuth must not be included in public IPC payloads/);
  assert.throws(() => assertCollectionRunResultPayload({ results: [{ accessToken: 'raw-token' }] }), /result.results\[0\].accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertCollectionRunResultPayload({ accessToken: 'raw-token' }), /result.accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertPerformanceResultPayload({ samples: [{ responseBody: 42 }] }), /result.samples\[0\].responseBody must be a string/);
  assert.throws(() => assertPerformanceTestPayload({ type: 'latency', csvVariables: { values: 42 }, request: { method: 'GET', url: 'https:\/\/example.test' } }), /performanceTest.csvVariables.values must be a string/);
  assert.throws(() => assertPerformanceCalibrationResultPayload({ endpoint: 42 }), /result.endpoint must be a string/);
  assert.throws(() => assertPerformanceCalibrationResultPayload({ stages: [{ requestsPerSecond: 'fast' }] }), /result.stages\[0\].requestsPerSecond must be a finite number/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '', durationMillis: 'slow', responseBytes: 0, finalUrl: '', headers: {} }), /response.durationMillis must be a finite number/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: 42, durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {} }), /response.body must be a string/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '{}', durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {}, updatedAuth: { type: 'oauth2', accessToken: 'raw-token' } }), /response.updatedAuth must not be included in public IPC payloads/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '{}', durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {}, accessToken: 'raw-token' }), /response.accessToken is not allowed in public IPC payloads/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '{}', durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {}, testScriptResult: { tests: [{ passed: 'yes' }] } }), /response.testScriptResult.tests\[0\].passed must be a boolean/);
  assert.throws(() => assertResponsePayload({ statusCode: 200, body: '{}', durationMillis: 1, responseBytes: 2, finalUrl: 'https://example.test', headers: {}, testScriptResult: { visualizer: { html: 42 } } }), /response.testScriptResult.visualizer.html must be a string/);
  assert.throws(() => assertWorkspaceRequestSavePayload({ requestId: 'r1', request: { method: 'GET', queryParams: [], headers: [], bodyType: 'NONE' } }), /payload must include collectionId, runnerId, or authRefreshOwnerType/);
  assert.throws(() => assertWorkspaceRequestSavePayload({ collectionId: 'c1', authRefreshOwnerType: 'runner', runnerId: 'runner-1', requestId: 'r1', request: { method: 'GET', queryParams: [], headers: [], bodyType: 'NONE' } }), /payload must target only one request owner/);
  assert.throws(() => assertWorkspaceRequestSavePayload({ collectionId: 'c1', requestId: 'r1', request: { method: 'GET', queryParams: [], headers: [], bodyType: 'NONE' }, folderPath: 'bad' }), /payload.folderPath must be an array/);
  assert.throws(() => assertWorkspaceCollectionSavePayload({ collection: { id: 'c1', requests: [], folders: [] } }), /payload.collectionId must be a string/);
  assert.throws(() => assertWorkspaceCollectionSavePayload({ collectionId: 'c1', collection: { id: 'c1', scripts: { tests: 42 }, requests: [], folders: [] } }), /payload.collection.scripts.tests must be a string/);
  assert.throws(() => assertWorkspaceCollectionSaveResultPayload({ collection: { id: 'c1', variables: 'bad', requests: [], folders: [] } }), /result.collection.variables must be an array/);
  assert.throws(() => assertWorkspaceEnvironmentSavePayload({ environment: { id: 'e1', name: 'Env', variables: [] } }), /payload.environmentId must be a string/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ appearance: { theme: 'sepia' } }), /settings.appearance.theme must be one of/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ appearance: { editorFontSize: 30 } }), /settings.appearance.editorFontSize must be one of 10, 13, 16, 19/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ appearance: { unknown: true } }), /settings.appearance.unknown is not allowed/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ tabs: { saveOnForceClose: 'yes' } }), /settings.tabs.saveOnForceClose must be a boolean/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ modals: { closeOnBackdropClick: 'yes' } }), /settings.modals.closeOnBackdropClick must be a boolean/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ diagnostics: { requestResponseLogging: { headers: 'yes' } } }), /settings.diagnostics.requestResponseLogging.headers must be a boolean/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ diagnostics: { logging: { enabled: 'yes' } } }), /settings.diagnostics.logging.enabled must be a boolean/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ diagnostics: { uploadUrl: 'https:\/\/example.test' } }), /settings.diagnostics.uploadUrl is not allowed/);
  assert.throws(() => assertWorkspaceSettingsSavePayload({ sandbox: { trustedCapabilities: { vaultGrants: { requests: 'all' } } } }), /settings.sandbox.trustedCapabilities.vaultGrants.requests must be an array/);
  assert.throws(() => assertWorkspaceSettingsSaveResultPayload({ settings: { updates: { includePrereleases: 'yes' } } }), /result.settings.updates.includePrereleases must be a boolean/);
  assert.throws(() => assertWorkspaceLoadResultPayload({ workspace: null }), /result.workspace must be an object/);
  assert.throws(() => assertFileOperationResultPayload({ cancelled: 'yes' }), /result.cancelled must be a boolean/);
  assert.throws(() => assertFileOperationResultPayload({ cancelled: false, collection: [] }), /result.collection must be an object/);
  assert.throws(() => assertSessionPayload({ openCollectionTabs: Array.from({ length: 129 }, (_value, index) => ({ key: `collection:${index}`, collectionId: `collection-${index}` })) }), /session.openCollectionTabs cannot contain more than 128 items/);
  assert.throws(() => assertSessionPayload({ openFolderTabs: Array.from({ length: 129 }, (_value, index) => ({ key: `folder:collection:${index}`, collectionId: 'collection', folderId: `folder-${index}` })) }), /session.openFolderTabs cannot contain more than 128 items/);
  assert.throws(() => assertWorkspaceFolderSavePayload({ collectionId: 'c1', folderId: 'f1', folder: { id: 'f1', name: 'Folder', variables: [{ enabled: true, key: 'x', value: [] }] } }), /payload\.folder\.variables\[0\]\.value must be a string/);
  assert.throws(() => assertRuntimeId({ bad: true }), /id must be a string/);
  assert.throws(() => assertExportFormat('xml'), /format must be one of/);
  assert.throws(() => assertHtmlReportOptionsPayload({ includeRequestResults: 'no' }), /includeRequestResults must be a boolean/);
  assert.throws(() => assertHtmlReportOptionsPayload({ theme: 'system' }), /htmlReportOptions\.theme must be one of: light, dark/);
  assert.throws(() => assertHtmlReportOptionsPayload({ includeRequestResults: true, rawJson: true }), /rawJson is not allowed/);
  assert.throws(() => assertCollectionExportFormat('bad'), /format must be one of/);
  assert.throws(() => assertPerformanceExportFormat('xml'), /format must be one of/);
});

test('request and workspace IPC validators follow shared entity schema arrays', () => {
  const requestBase = {
    method: 'GET',
    url: 'https://example.test',
    bodyType: 'NONE',
    queryParams: [],
    headers: [],
    variables: []
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
