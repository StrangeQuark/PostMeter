const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PERFORMANCE_TEST_TYPES,
  cloneRequestForPerformanceTest,
  newPerformanceTestObject,
  normalizePerformanceTest
} = require('../../src/renderer/performanceTestModel');

test('renderer performance model uses the same eight V1 types and defaults as the workspace model', () => {
  assert.deepEqual(PERFORMANCE_TEST_TYPES, [
    'diagnosis',
    'latency',
    'throughput',
    'concurrency',
    'stress',
    'spike',
    'soak',
    'ramp'
  ]);

  const created = newPerformanceTestObject('UI Test');
  assert.equal(created.name, 'UI Test');
  assert.equal(created.type, 'diagnosis');
  assert.equal(created.source.sourceType, 'manual');
  assert.equal(created.authRefresh.enabled, false);
  assert.equal(created.authRefresh.mode, 'interval');
  assert.equal(created.authRefresh.authType, 'bearer');
  assert.equal(created.authRefresh.accessTokenVariable, 'ACCESS_TOKEN');
  assert.equal(created.authRefresh.refreshTokenVariable, 'REFRESH_TOKEN');
  assert.ok(created.authRefresh.outputs.some((item) => item.slot === 'accessToken' && item.variable === 'ACCESS_TOKEN'));
  assert.equal(created.authRefresh.request.id, 'auth-refresh-request');
  assert.equal(created.authRefresh.request.name, 'Refresh Auth');
  assert.equal(created.authRefresh.refreshTokenRequest.id, 'auth-refresh-token-request');
  assert.equal(created.authRefresh.refreshTokenRequest.name, 'Refresh Token');
  assert.equal(created.csvVariables.enabled, false);
  assert.equal(created.config.iterations, 44);
  assert.equal(created.config.startConcurrency, 1);
  assert.equal(created.config.concurrency, 5);
  assert.equal(created.config.diagnosisScope, 'quick');
  assert.equal(created.typeSettings.diagnosis.config.iterations, 44);
  assert.equal(created.typeSettings.diagnosis.safetyLimits.maxTotalRequests, 44);
  assert.equal(created.typeSettings.latency.config.iterations, 1);
  assert.equal(created.typeSettings.throughput.config.iterations, 10);
  assert.equal(created.typeSettings.stress.config.rampSteps, 5);
  assert.equal(created.safetyLimits.maxTotalRequests, 44);
});

test('renderer performance normalization defaults CSV variables off but preserves legacy configured CSV data', () => {
  assert.equal(normalizePerformanceTest({}).csvVariables.enabled, false);
  assert.equal(normalizePerformanceTest({ csvVariables: {} }).csvVariables.enabled, false);
  assert.equal(normalizePerformanceTest({ csvVariables: { schema: 'name', values: 'alice' } }).csvVariables.enabled, true);
});

test('renderer performance auth refresh normalization preserves raw body output sources', () => {
  const normalized = normalizePerformanceTest({
    authRefresh: {
      outputs: [{ slot: 'accessToken', source: 'rawBody', path: '', variable: 'ACCESS_TOKEN' }]
    }
  });

  assert.deepEqual(normalized.authRefresh.outputs.find((item) => item.slot === 'accessToken'), {
    slot: 'accessToken',
    source: 'rawBody',
    path: '$body',
    variable: 'ACCESS_TOKEN'
  });
});

test('renderer performance auth refresh no longer accepts OAuth 2.0 as a refresh target', () => {
  const normalized = normalizePerformanceTest({
    authRefresh: {
      enabled: true,
      authType: 'oauth2'
    }
  });

  assert.equal(normalized.authRefresh.authType, 'bearer');
});

test('renderer performance normalization preserves original auth for auto-refreshing request auth', () => {
  const normalized = normalizePerformanceTest({
    request: {
      method: 'GET',
      url: 'https://example.test',
      auth: { type: 'autoRefresh' },
      refreshingAuthOriginalAuth: { type: 'bearer', token: '{{ACCESS_TOKEN}}' }
    }
  });

  assert.deepEqual(normalized.request.auth, { type: 'autoRefresh' });
  assert.deepEqual(normalized.request.refreshingAuthOriginalAuth, {
    type: 'bearer',
    token: '{{ACCESS_TOKEN}}'
  });
});

test('renderer performance normalization migrates old placeholder options without keeping legacy fields', () => {
  const normalized = normalizePerformanceTest({
    id: 'perf-old',
    name: 'Old UI Test',
    type: 'load',
    importedSource: { collectionId: 'collection-1', requestId: 'request-1' },
    options: { virtualUsers: 7, durationSeconds: 11, rampUpSeconds: 3 },
    request: {
      method: 'POST',
      url: 'example.test',
      body: 'hello',
      autoHeaders: { sendPostMeterToken: true, showGeneratedHeaders: true }
    }
  });

  assert.equal(normalized.type, 'latency');
  assert.equal(normalized.config.concurrency, 7);
  assert.equal(normalized.config.durationSeconds, 11);
  assert.equal(normalized.config.rampSteps, 3);
  assert.equal(normalized.config.startConcurrency, 1);
  assert.equal(normalized.request.method, 'POST');
  assert.equal(normalized.request.bodyType, 'NONE');
  assert.deepEqual(normalized.request.autoHeaders, { sendPostMeterToken: true, showGeneratedHeaders: true });
  assert.equal('options' in normalized, false);
  assert.equal('importedSource' in normalized, false);
});

test('renderer performance normalization keeps type pane settings independent', () => {
  const normalized = normalizePerformanceTest({
    id: 'perf-independent',
    name: 'Independent UI Test',
    type: 'throughput',
    request: { method: 'GET', url: 'https://example.test' },
    typeSettings: {
      latency: {
        config: { iterations: 7 },
        safetyLimits: { maxTotalRequests: 20 }
      },
      throughput: {
        environmentId: 'env-1',
        allowEnvironmentMutation: true,
        config: { iterations: 13, concurrency: 3 },
        safetyLimits: { maxTotalRequests: 30, maxConcurrency: 5 }
      }
    }
  });

  assert.equal(normalized.typeSettings.latency.config.iterations, 7);
  assert.equal(normalized.typeSettings.throughput.config.iterations, 13);
  assert.equal(normalized.typeSettings.diagnosis.config.diagnosisScope, 'quick');
  assert.equal(normalized.typeSettings.diagnosis.safetyLimits.maxTotalRequests, 44);
  assert.equal(normalized.typeSettings.throughput.allowEnvironmentMutation, true);
  assert.equal(normalized.config.iterations, 13);
  assert.equal(normalized.config.concurrency, 3);
  assert.equal(normalized.environmentId, 'env-1');
});

test('renderer performance diagnosis scope adjusts samples and duration safety', () => {
  const normalized = normalizePerformanceTest({
    id: 'perf-diagnosis-scope',
    name: 'Diagnosis Scope',
    type: 'diagnosis',
    request: { method: 'GET', url: 'https://example.test' },
    config: { diagnosisScope: 'extended' },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 5, maxDurationSeconds: 60 }
  });

  assert.equal(normalized.config.diagnosisScope, 'extended');
  assert.equal(normalized.config.iterations, 1000);
  assert.equal(normalized.safetyLimits.maxTotalRequests, 1000);
  assert.equal(normalized.safetyLimits.maxDurationSeconds, 900);
});

test('renderer performance import deep-copies request-owned data from collections', () => {
  const source = {
    id: 'request-1',
    name: 'Collection Request',
    method: 'PUT',
    url: 'https://example.test/source',
    headers: [{ enabled: true, key: 'X-Test', value: 'source' }],
    auth: { type: 'bearer', bearer: { token: 'source-token' } },
    scripts: { preRequest: 'pm.environment.set("a", "b");', tests: 'pm.test("ok", () => {});' },
    variables: [{ enabled: true, key: 'local', value: 'source' }],
    docs: 'Source docs',
    cookieJar: { enabled: true, storeResponses: true }
  };
  const original = JSON.parse(JSON.stringify(source));
  const imported = cloneRequestForPerformanceTest(source, {
    collectionId: 'collection-1',
    collectionName: 'Collection'
  });

  assert.equal(imported.source.sourceType, 'collection');
  assert.notEqual(imported.request.id, source.id);
  imported.request.headers[0].value = 'changed';
  imported.request.auth.bearer.token = 'changed';
  imported.request.scripts.tests = 'pm.test("changed", () => {});';
  imported.request.variables[0].value = 'changed';
  imported.request.docs = 'changed';
  imported.request.cookieJar.enabled = false;

  assert.deepEqual(source, original);
});

test('renderer performance normalization preserves auth refresh settings', () => {
  const normalized = normalizePerformanceTest({
    id: 'perf-refresh-ui',
    name: 'Refresh UI',
    type: 'throughput',
    request: { method: 'GET', url: 'https://example.test' },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      targetScope: 'globals',
      accessTokenVariable: 'ACCESS_TOKEN',
      refreshTokenVariable: '',
      refreshIntervalSeconds: 300,
      request: {
        name: 'Custom Refresh',
        method: 'POST',
        url: 'https://auth.example.test/token',
        headers: [{ enabled: true, key: 'X-Auth', value: '{{REFRESH_TOKEN}}' }],
        bodyType: 'RAW_JSON',
        body: '{"refresh":"{{REFRESH_TOKEN}}"}',
        settings: { sslCertificateVerification: 'disabled' }
      },
      refreshTokenRequest: {
        name: 'Custom Refresh Token',
        method: 'PATCH',
        url: 'https://auth.example.test/refresh-token',
        headers: [{ enabled: true, key: 'X-Refresh', value: '{{REFRESH_TOKEN}}' }]
      }
    }
  });

  assert.equal(normalized.authRefresh.enabled, true);
  assert.equal(normalized.authRefresh.mode, 'interval');
  assert.equal(normalized.authRefresh.targetScope, 'globals');
  assert.equal(normalized.authRefresh.refreshTokenVariable, '');
  assert.equal(normalized.authRefresh.refreshIntervalSeconds, 300);
  assert.ok(normalized.authRefresh.outputs.some((item) => item.slot === 'accessToken' && item.variable === 'ACCESS_TOKEN'));
  assert.equal(normalized.authRefresh.request.name, 'Custom Refresh');
  assert.equal(normalized.authRefresh.request.headers[0].key, 'X-Auth');
  assert.equal(normalized.authRefresh.request.settings.sslCertificateVerification, 'disabled');
  assert.equal(normalized.authRefresh.refreshTokenRequest.name, 'Custom Refresh Token');
  assert.equal(normalized.authRefresh.refreshTokenRequest.method, 'PATCH');
  assert.equal(normalized.authRefresh.refreshTokenRequest.headers[0].key, 'X-Refresh');
});
