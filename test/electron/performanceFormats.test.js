const assert = require('node:assert/strict');
const test = require('node:test');
const {
  exportPerformanceTestDocument,
  exportPerformanceTestToJson,
  importPerformanceTestDocument,
  importPerformanceTestFromText,
  performanceResultToCsv
} = require('../../src/core/performanceFormats');
const { performanceTestModel } = require('../../src/core/models');

test('exports and imports native performance test documents with schema validation', () => {
  const performanceTest = performanceTestModel({
    id: 'perf-1',
    name: 'Latency',
    type: 'latency',
    request: { id: 'request-copy', name: 'Request Copy', method: 'GET', url: 'https://example.test' },
    config: { iterations: 2 },
    safetyLimits: { maxTotalRequests: 10, maxConcurrency: 2, maxDurationSeconds: 10 }
  });

  const document = exportPerformanceTestDocument(performanceTest);
  const imported = importPerformanceTestDocument(document);
  const importedFromText = importPerformanceTestFromText(exportPerformanceTestToJson(performanceTest));

  assert.equal(document.format, 'postmeter.performance.v1');
  assert.deepEqual(imported, performanceTest);
  assert.deepEqual(importedFromText, performanceTest);
});

test('rejects malformed and unsafe performance test imports', () => {
  assert.throws(
    () => importPerformanceTestFromText('{bad json'),
    /Failed to parse performance test JSON/
  );
  assert.throws(
    () => importPerformanceTestDocument({
      format: 'postmeter.performance.v1',
      performanceTest: {
        name: 'Unsafe',
        type: 'stress',
        request: { method: 'GET', url: 'https://example.test' },
        config: { iterations: 101 },
        safetyLimits: { maxTotalRequests: 100, maxConcurrency: 10, maxDurationSeconds: 60 }
      }
    }),
    /config.iterations multiplied by config.rampSteps exceeds safetyLimits.maxTotalRequests/
  );
  assert.throws(
    () => importPerformanceTestDocument({
      name: 'Legacy Load Test',
      type: 'latency',
      request: { method: 'GET', url: 'https://example.test', loadTestPolicy: { requestsPerSecond: 1000 } }
    }),
    /loadTestPolicy is no longer supported/
  );
});

test('exports performance result summaries to CSV', () => {
  const csv = performanceResultToCsv({
    id: 'result-1',
    performanceTestId: 'perf-1',
    performanceTestName: 'Latency',
    type: 'latency',
    environmentId: 'none',
    environmentMutationAllowed: false,
    totalRequests: 1,
    completedRequests: 1,
    successfulRequests: 1,
    failedRequests: 0,
    passed: true,
    cancelled: false,
    startedAt: '2026-05-06T00:00:00.000Z',
    completedAt: '2026-05-06T00:00:01.000Z',
    durationMillis: 1000,
    summary: { requestsPerSecond: 1, averageDurationMillis: 25, p95DurationMillis: 25 },
    samples: [{
      iteration: 1,
      requestId: 'request-1',
      requestName: 'Request',
      startedAt: '2026-05-06T00:00:00.000Z',
      statusCode: 200,
      durationMillis: 25,
      passed: true,
      error: ''
    }]
  });

  assert.match(csv, /performanceTestName,Latency/);
  assert.match(csv, /requestsPerSecond,1/);
  assert.match(csv, /iteration,requestId,requestName/);
});
