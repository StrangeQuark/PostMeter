const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PERFORMANCE_TEST_TYPES,
  cloneRequestForPerformanceTest,
  defaultPerformanceTest,
  performanceTestModel
} = require('../../src/core/models');
const {
  assertPerformanceTestPayload
} = require('../../src/core/ipcValidation');
const {
  exportPerformanceTestDocument,
  exportPerformanceTestToJson,
  importPerformanceTestFromText,
  performanceResultToCsv
} = require('../../src/core/performanceFormats');
const {
  runPerformanceTest
} = require('../../src/core/performanceRunner');

const EXPECTED_TYPES = Object.freeze([
  'latency',
  'throughput',
  'concurrency',
  'stress',
  'spike',
  'soak',
  'ramp'
]);

test('Performance model accepts the seven V1 types and rejects unsafe limits for each type', () => {
  assert.deepEqual(PERFORMANCE_TEST_TYPES, EXPECTED_TYPES);

  for (const type of EXPECTED_TYPES) {
    const candidate = defaultPerformanceTest({
      type,
      request: { method: 'GET', url: 'https://example.test/performance' }
    });
    assert.equal(candidate.type, type);
    assert.doesNotThrow(() => assertPerformanceTestPayload(candidate));

    const unsafe = performanceTestModel({
      ...candidate,
      config: type === 'soak'
        ? { ...candidate.config, durationSeconds: 2 }
        : { ...candidate.config, iterations: 2 },
      safetyLimits: type === 'soak'
        ? { ...candidate.safetyLimits, maxDurationSeconds: 1 }
        : { ...candidate.safetyLimits, maxTotalRequests: 1 }
    });
    assert.throws(
      () => assertPerformanceTestPayload(unsafe),
      type === 'soak' ? /maxDurationSeconds/ : /maxTotalRequests/
    );
  }
});

test('Performance model preserves independent settings for each V1 type', () => {
  const performanceTest = performanceTestModel({
    type: 'throughput',
    request: { method: 'GET', url: 'https://example.test/performance' },
    typeSettings: {
      latency: {
        config: { iterations: 7 },
        safetyLimits: { maxTotalRequests: 20 }
      },
      throughput: {
        environmentId: 'env-throughput',
        allowEnvironmentMutation: true,
        config: { iterations: 13, concurrency: 3 },
        safetyLimits: { maxTotalRequests: 30, maxConcurrency: 5 }
      }
    }
  });

  assert.equal(performanceTest.typeSettings.latency.config.iterations, 7);
  assert.equal(performanceTest.typeSettings.throughput.config.iterations, 13);
  assert.equal(performanceTest.typeSettings.concurrency.config.concurrency, 5);
  assert.equal(performanceTest.typeSettings.ramp.config.startConcurrency, 1);
  assert.equal(performanceTest.config.iterations, 13);
  assert.equal(performanceTest.environmentId, 'env-throughput');
  assert.equal(performanceTest.allowEnvironmentMutation, true);
  assert.doesNotThrow(() => assertPerformanceTestPayload(performanceTest));
  assert.throws(
    () => assertPerformanceTestPayload({
      ...performanceTest,
      typeSettings: {
        ...performanceTest.typeSettings,
        unknown: { config: { iterations: 1 } }
      }
    }),
    /typeSettings\.unknown is not an allowed performance test type setting/
  );
  assert.throws(
    () => assertPerformanceTestPayload({
      ...performanceTest,
      typeSettings: {
        ...performanceTest.typeSettings,
        latency: {
          ...performanceTest.typeSettings.latency,
          config: { iterations: 25 },
          safetyLimits: { maxTotalRequests: 10 }
        }
      }
    }),
    /typeSettings\.latency\.config\.iterations exceeds safetyLimits\.maxTotalRequests/
  );
});

test('Performance safety validation uses type-specific effective request and concurrency counts', () => {
  assert.throws(
    () => assertPerformanceTestPayload(performanceTestModel({
      type: 'concurrency',
      request: { method: 'GET', url: 'https://example.test/concurrency' },
      config: { iterations: 5, concurrency: 3 },
      safetyLimits: { maxTotalRequests: 14, maxConcurrency: 3, maxDurationSeconds: 60 }
    })),
    /config\.iterations multiplied by config\.concurrency exceeds safetyLimits\.maxTotalRequests/
  );

  assert.throws(
    () => assertPerformanceTestPayload(performanceTestModel({
      type: 'ramp',
      request: { method: 'GET', url: 'https://example.test/ramp' },
      config: { iterations: 5, startConcurrency: 6, concurrency: 4, rampSteps: 2 },
      safetyLimits: { maxTotalRequests: 20, maxConcurrency: 6, maxDurationSeconds: 60 }
    })),
    /config\.startConcurrency cannot exceed config\.concurrency/
  );

  assert.throws(
    () => assertPerformanceTestPayload(performanceTestModel({
      type: 'stress',
      request: { method: 'GET', url: 'https://example.test/stress' },
      config: { iterations: 5, startConcurrency: 1, concurrency: 4, rampSteps: 3 },
      safetyLimits: { maxTotalRequests: 14, maxConcurrency: 4, maxDurationSeconds: 60 }
    })),
    /config\.iterations multiplied by config\.rampSteps exceeds safetyLimits\.maxTotalRequests/
  );

  assert.throws(
    () => assertPerformanceTestPayload({
      name: 'Raw Unsafe Cap',
      type: 'throughput',
      request: { method: 'GET', url: 'https://example.test/hard-cap' },
      config: { iterations: 1, concurrency: 1 },
      safetyLimits: { maxTotalRequests: 1001, maxConcurrency: 10, maxDurationSeconds: 60 }
    }),
    /safetyLimits\.maxTotalRequests cannot exceed 1000/
  );

  assert.throws(
    () => assertPerformanceTestPayload({
      name: 'Raw Unsafe Concurrency',
      type: 'spike',
      request: { method: 'GET', url: 'https://example.test/hard-cap' },
      config: { iterations: 1, concurrency: 26, spikeMultiplier: 1 },
      safetyLimits: { maxTotalRequests: 100, maxConcurrency: 25, maxDurationSeconds: 60 }
    }),
    /config\.concurrency cannot exceed 25/
  );
});

test('Performance request import deep-copies collection requests and preserves source metadata', () => {
  const collectionRequest = {
    id: 'request-1',
    name: 'Source Request',
    method: 'POST',
    url: 'https://example.test/source',
    headers: [{ enabled: true, key: 'X-Source', value: 'one' }],
    auth: { type: 'bearer', bearer: { token: 'token-1' } },
    bodyType: 'FORM_DATA',
    body: '',
    postmanBody: {
      mode: 'formdata',
      formdata: [{ key: 'payload', value: '{{value}}', type: 'text' }]
    },
    postman: {
      fileReferences: [{ mode: 'formdata', key: 'upload', source: 'fixtures/upload.txt' }]
    },
    scripts: { preRequest: 'pm.environment.set("a", "b");', tests: 'pm.test("ok", () => {});' },
    variables: [{ enabled: true, key: 'local', value: 'value' }],
    examples: [{ id: 'example-1', name: 'Example', statusCode: 200, headers: [], body: '{}', bodyType: 'RAW_JSON' }],
    cookieJar: { enabled: true, storeResponses: true }
  };
  const original = JSON.parse(JSON.stringify(collectionRequest));

  const performanceTest = cloneRequestForPerformanceTest(collectionRequest, {
    collectionId: 'collection-1',
    collectionName: 'Collection',
    requestId: collectionRequest.id,
    requestName: collectionRequest.name
  });

  assert.notEqual(performanceTest.request.id, collectionRequest.id);
  assert.equal(performanceTest.source.sourceType, 'collection');
  assert.equal(performanceTest.source.collectionId, 'collection-1');

  performanceTest.request.headers[0].value = 'changed';
  performanceTest.request.auth.bearer.token = 'changed';
  performanceTest.request.postmanBody.formdata[0].value = 'changed';
  performanceTest.request.postman.fileReferences[0].source = 'changed.txt';
  performanceTest.request.scripts.tests = 'pm.test("changed", () => {});';
  performanceTest.request.variables[0].value = 'changed';
  performanceTest.request.examples[0].body = '{"changed":true}';
  performanceTest.request.cookieJar.enabled = false;
  performanceTest.request.url = 'https://example.test/performance';
  performanceTest.request.method = 'PUT';

  assert.deepEqual(collectionRequest, original);
});

test('Performance manual request entry creates a saved test without collection source ownership', () => {
  const performanceTest = defaultPerformanceTest({
    name: 'Manual Performance',
    type: 'latency',
    request: {
      name: 'Manual Request',
      method: 'PATCH',
      url: 'https://example.test/manual',
      headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
      bodyType: 'URLENCODED',
      body: '',
      postmanBody: {
        mode: 'urlencoded',
        urlencoded: [{ key: 'manual', value: 'true' }]
      }
    }
  });

  assert.equal(performanceTest.source.sourceType, 'manual');
  assert.equal(performanceTest.request.method, 'PATCH');
  assert.equal(performanceTest.request.url, 'https://example.test/manual');
  assert.equal(performanceTest.request.bodyType, 'URLENCODED');
  assert.equal(performanceTest.request.postmanBody.mode, 'urlencoded');
  assert.doesNotThrow(() => assertPerformanceTestPayload(performanceTest));
});

test('Performance import/export round-trips valid tests and rejects malformed or unsafe payloads', () => {
  const performanceTest = defaultPerformanceTest({
    type: 'throughput',
    request: { method: 'GET', url: 'https://example.test/throughput' },
    config: { iterations: 3, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 10, maxConcurrency: 2, maxDurationSeconds: 60 }
  });
  const exported = exportPerformanceTestDocument(performanceTest);
  const imported = importPerformanceTestFromText(JSON.stringify(exported));

  assert.equal(exported.format, 'postmeter.performance.v1');
  assert.equal(imported.type, 'throughput');
  assert.equal(imported.request.url, 'https://example.test/throughput');
  assert.match(exportPerformanceTestToJson(performanceTest), /postmeter\.performance\.v1/);
  assert.throws(() => importPerformanceTestFromText('{bad json'), /Failed to parse performance test JSON/);
  assert.throws(
    () => importPerformanceTestFromText(JSON.stringify({
      performanceTest: {
        ...performanceTest,
        config: { iterations: 5 },
        safetyLimits: { maxTotalRequests: 1 }
      }
    })),
    /config\.iterations exceeds safetyLimits\.maxTotalRequests/
  );
});

test('Performance cancellation returns a bounded cancelled result without running iterations', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runPerformanceTest(defaultPerformanceTest({
    type: 'soak',
    request: { method: 'GET', url: 'https://example.test/cancelled' },
    config: { iterations: 5, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 5, maxConcurrency: 2, maxDurationSeconds: 60 }
  }), null, { signal: controller.signal });

  assert.equal(result.cancelled, true);
  assert.equal(result.passed, false);
  assert.equal(result.completedRequests, 0);
  assert.deepEqual(result.samples, []);
  assert.equal(result.samples.length <= result.safetyLimits.maxTotalRequests, true);
});

test('Performance result CSV export validates result shape and escapes samples', () => {
  const csv = performanceResultToCsv({
    id: 'result-1',
    performanceTestId: 'performance-1',
    performanceTestName: 'CSV Test',
    type: 'latency',
    totalRequests: 1,
    completedRequests: 1,
    successfulRequests: 0,
    failedRequests: 1,
    passed: false,
    cancelled: false,
    durationMillis: 12,
    summary: { requestsPerSecond: 1, averageDurationMillis: 12, p95DurationMillis: 12 },
    samples: [{
      iteration: 1,
      requestId: 'request-1',
      requestName: 'Name, With Comma',
      startedAt: '2026-05-06T00:00:00.000Z',
      statusCode: 500,
      durationMillis: 12,
      passed: false,
      error: 'failed "quoted"'
    }]
  });

  assert.match(csv, /performanceTestId,performance-1/);
  assert.match(csv, /"Name, With Comma"/);
  assert.match(csv, /"failed ""quoted"""/);
});
