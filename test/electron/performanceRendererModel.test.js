const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PERFORMANCE_TEST_TYPES,
  cloneRequestForPerformanceTest,
  newPerformanceTestObject,
  normalizePerformanceTest
} = require('../../src/renderer/performanceTestModel');

test('renderer performance model uses the same seven V1 types and defaults as the workspace model', () => {
  assert.deepEqual(PERFORMANCE_TEST_TYPES, [
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
  assert.equal(created.type, 'latency');
  assert.equal(created.source.sourceType, 'manual');
  assert.equal(created.config.iterations, 1);
  assert.equal(created.config.startConcurrency, 1);
  assert.equal(created.typeSettings.latency.config.iterations, 1);
  assert.equal(created.typeSettings.throughput.config.iterations, 10);
  assert.equal(created.typeSettings.stress.config.rampSteps, 5);
  assert.equal(created.safetyLimits.maxTotalRequests, 100);
});

test('renderer performance normalization migrates old placeholder options without keeping legacy fields', () => {
  const normalized = normalizePerformanceTest({
    id: 'perf-old',
    name: 'Old UI Test',
    type: 'load',
    importedSource: { collectionId: 'collection-1', requestId: 'request-1' },
    options: { virtualUsers: 7, durationSeconds: 11, rampUpSeconds: 3 },
    request: { method: 'POST', url: 'example.test', body: 'hello' }
  });

  assert.equal(normalized.type, 'latency');
  assert.equal(normalized.config.concurrency, 7);
  assert.equal(normalized.config.durationSeconds, 11);
  assert.equal(normalized.config.rampSteps, 3);
  assert.equal(normalized.config.startConcurrency, 1);
  assert.equal(normalized.request.method, 'POST');
  assert.equal(normalized.request.bodyType, 'NONE');
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
  assert.equal(normalized.typeSettings.throughput.allowEnvironmentMutation, true);
  assert.equal(normalized.config.iterations, 13);
  assert.equal(normalized.config.concurrency, 3);
  assert.equal(normalized.environmentId, 'env-1');
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
    examples: [{ id: 'example-1', name: 'Example', statusCode: 200, headers: [], body: '{}' }],
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
  imported.request.examples[0].body = 'changed';
  imported.request.cookieJar.enabled = false;

  assert.deepEqual(source, original);
});
