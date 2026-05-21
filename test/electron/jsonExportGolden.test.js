const assert = require('node:assert/strict');
const test = require('node:test');
const { exportEnvironmentToJson } = require('../../src/core/import-export/environmentFormats');
const { exportPerformanceTestToJson } = require('../../src/core/import-export/performanceFormats');
const { exportRequestToJson } = require('../../src/core/import-export/requestFormats');
const { exportRunnerToJson } = require('../../src/core/import-export/runnerFormats');

test('native request JSON export has a stable V1 envelope and drops runtime-only fields', () => {
  const document = JSON.parse(exportRequestToJson({
    id: 'request-1',
    name: 'Create User',
    method: 'post',
    url: ' https://api.example.test/users ',
    queryParams: [{ enabled: true, key: 'trace', value: '1' }],
    headers: [{ enabled: true, key: 'Accept', value: 'application/json' }],
    bodyType: 'RAW_JSON',
    body: '{"name":"Ada"}',
    auth: { type: 'bearer', token: 'token-value' },
    docs: '# Request docs',
    localPath: '/tmp/attachment.txt',
    resultStorePath: '/tmp/results.sqlite',
    diagnostics: { requestResponseLogging: true },
    runtimeResult: { body: 'not part of a saved request' }
  }));

  assert.equal(document.format, 'postmeter.request');
  assert.equal(document.version, 1);
  assert.deepEqual(document.request.queryParams, [{ enabled: true, key: 'trace', value: '1' }]);
  assert.equal(document.request.method, 'POST');
  assert.equal(document.request.url, 'https://api.example.test/users');
  assert.equal(document.request.docs, '# Request docs');
  assert.equal(document.request.localPath, undefined);
  assert.equal(document.request.resultStorePath, undefined);
  assert.equal(document.request.diagnostics, undefined);
  assert.equal(document.request.runtimeResult, undefined);
});

test('runner and performance JSON exports keep deterministic schemas outside exportedAt', () => {
  const runnerDocument = JSON.parse(exportRunnerToJson({
    id: 'runner-1',
    name: 'Release Runner',
    environmentId: 'env-1',
    allowEnvironmentMutation: true,
    stopOnFailure: false,
    capturePolicy: { responseBody: 'failed', responseHeaders: true, transportTimings: false },
    requests: [{
      id: 'request-1',
      name: 'Smoke',
      method: 'GET',
      url: 'https://api.example.test/health',
      queryParams: [],
      headers: [],
      variables: [],
      bodyType: 'NONE',
      body: '',
      auth: { type: 'none' },
      scripts: { preRequest: '', tests: '' },
      iterations: 3,
      source: {
        collectionId: 'collection-1',
        collectionName: 'API',
        folderPath: ['Smoke'],
        requestId: 'source-request',
        requestName: 'Health'
      }
    }],
    csvVariables: { enabled: false, activeSource: 'inline', schema: 'id', values: '1', filePath: '' }
  }));
  assertIsoTimestamp(runnerDocument.exportedAt);
  const stableRunner = withoutExportedAt(runnerDocument);
  assert.deepEqual(stableRunner, {
    format: 'postmeter.runner.v1',
    runner: {
      id: 'runner-1',
      name: 'Release Runner',
      environmentId: 'env-1',
      allowEnvironmentMutation: true,
      stopOnFailure: false,
      capturePolicy: {
        responseBody: 'failed',
        bodyPreviewBytes: 32768,
        maxBodyPreviews: 1000,
        preRequestOutput: true,
        postRequestOutput: true,
        scriptLogs: true,
        localVariables: true,
        responseHeaders: true,
        transportTimings: false,
        resultFileBudgetBytes: 786432000,
        guardrailNotes: []
      },
      authRefresh: defaultAuthRefresh(),
      csvVariables: {
        enabled: false,
        schema: 'id',
        values: '1',
        filePath: '',
        sourceName: '',
        activeSource: 'inline',
        reuseFirstRow: false,
        loopRows: false,
        continueWithoutRows: false
      },
      requests: [{
        id: 'request-1',
        name: 'Smoke',
        protocol: 'http',
        method: 'GET',
        url: 'https://api.example.test/health',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: { type: 'none' },
        scripts: emptyScripts(),
        variables: [],
        docs: '',
        cookieJar: { enabled: false, storeResponses: true },
        autoHeaders: { sendPostMeterToken: false, showGeneratedHeaders: false },
        methodPath: '',
        metadata: [],
        messages: [],
        postmanBody: {},
        protocolProfile: {},
        graphql: {},
        grpc: {},
        websocket: {},
        settings: defaultRequestSettings(),
        iterations: 3,
        source: {
          collectionId: 'collection-1',
          collectionName: 'API',
          requestId: 'source-request',
          requestName: 'Health',
          folderPath: ['Smoke']
        }
      }]
    }
  });

  const performanceDocument = JSON.parse(exportPerformanceTestToJson({
    id: 'perf-1',
    name: 'Release Perf',
    type: 'latency',
    request: {
      id: 'perf-request',
      name: 'Health',
      method: 'GET',
      url: 'https://api.example.test/health',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: { type: 'none' },
      scripts: { preRequest: '', tests: '' }
    },
    source: { sourceType: 'manual' },
    config: { iterations: 2, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    safetyLimits: { maxTotalRequests: 10, maxConcurrency: 2, maxDurationSeconds: 30 },
    capturePolicy: { responseBody: 'failed', responseHeaders: false, transportTimings: true },
    resultsMetadata: { lastResultId: 'result-1', lastStatus: 'passed', runCount: 1 }
  }));
  assertIsoTimestamp(performanceDocument.exportedAt);
  const stablePerformance = withoutExportedAt(performanceDocument);
  assert.equal(stablePerformance.format, 'postmeter.performance.v1');
  assert.equal(stablePerformance.performanceTest.id, 'perf-1');
  assert.equal(stablePerformance.performanceTest.request.id, 'perf-request');
  assert.equal(stablePerformance.performanceTest.resultsMetadata.lastResultId, 'result-1');
  assert.equal(JSON.stringify(stablePerformance).includes('samples'), false);
  assert.equal(JSON.stringify(stablePerformance).includes('resultStorePath'), false);
});

test('environment JSON export keeps only the portable environment schema', () => {
  const document = JSON.parse(exportEnvironmentToJson({
    id: 'env-1',
    name: 'Local Dev',
    variables: [
      { enabled: true, key: 'BASE_URL', value: 'https://api.example.test' },
      { enabled: false, key: 'DISABLED', value: 'hidden' }
    ],
    localSettings: { tls: '/tmp/local.pem' }
  }));

  assertIsoTimestamp(document.exportedAt);
  delete document.exportedAt;
  assert.deepEqual(document, {
    format: 'postmeter.environment.v1',
    environment: {
      id: 'env-1',
      name: 'Local Dev',
      variables: [
        { enabled: true, key: 'BASE_URL', value: 'https://api.example.test' },
        { enabled: false, key: 'DISABLED', value: 'hidden' }
      ]
    }
  });
});

function withoutExportedAt(value) {
  const clone = JSON.parse(JSON.stringify(value));
  delete clone.exportedAt;
  return clone;
}

function assertIsoTimestamp(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
}

function emptyScripts() {
  return {
    preRequest: '',
    tests: '',
    beforeQuery: '',
    afterResponse: '',
    beforeInvoke: '',
    onMessage: '',
    onIncomingMessage: '',
    mock: ''
  };
}

function defaultRequestSettings() {
  return {
    sslCertificateVerification: 'inherit',
    httpVersion: 'auto',
    followRedirects: true,
    followOriginalHttpMethod: false,
    followAuthorizationHeader: false,
    removeRefererHeaderOnRedirect: false,
    strictHttpParser: true,
    encodeUrlAutomatically: true,
    maxRedirects: 10,
    useServerCipherSuiteDuringHandshake: false,
    disabledTlsProtocols: [],
    cipherSuiteSelection: ''
  };
}

function defaultAuthRefresh() {
  const request = {
    id: 'auth-refresh-request',
    name: 'Refresh Auth',
    protocol: 'http',
    method: 'POST',
    url: '',
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: '',
    auth: { type: 'none' },
    scripts: emptyScripts(),
    variables: [],
    docs: '',
    cookieJar: { enabled: false, storeResponses: true },
    autoHeaders: { sendPostMeterToken: false, showGeneratedHeaders: false },
    methodPath: '',
    metadata: [],
    messages: [],
    postmanBody: {},
    protocolProfile: {},
    graphql: {},
    grpc: {},
    websocket: {},
    settings: defaultRequestSettings()
  };
  return {
    enabled: false,
    mode: 'interval',
    authType: 'bearer',
    targetScope: 'environment',
    apiKeyLocation: 'header',
    apiKeyName: 'X-API-Key',
    accessTokenVariable: 'ACCESS_TOKEN',
    refreshTokenVariable: 'REFRESH_TOKEN',
    expiresAtVariable: '',
    accessTokenPath: 'access_token',
    refreshTokenPath: 'refresh_token',
    expiresInPath: 'expires_in',
    expiresAtPath: 'expires_at',
    refreshWindowSeconds: 120,
    tokenLifetimeSeconds: 900,
    refreshIntervalSeconds: 600,
    refreshBeforeRun: true,
    failurePolicy: 'abort',
    request,
    refreshTokenRequest: { ...request, id: 'auth-refresh-token-request', name: 'Refresh Token' },
    outputs: [
      { slot: 'accessToken', source: 'body', path: 'access_token', variable: 'ACCESS_TOKEN' },
      { slot: 'refreshToken', source: 'body', path: 'refresh_token', variable: 'REFRESH_TOKEN' }
    ]
  };
}
