const assert = require('node:assert/strict');
const test = require('node:test');
const { performanceTestModel } = require('../../src/core/models');
const { assertPerformanceTestPayload } = require('../../src/core/ipcValidation');
const { createPerformancePlan, runPerformanceTest } = require('../../src/core/performanceRunner');

const PERFORMANCE_TYPES = ['latency', 'throughput', 'concurrency', 'stress', 'spike', 'soak', 'ramp'];

test('runs a positive bounded execution for each V1 performance type', async () => {
  for (const type of PERFORMANCE_TYPES) {
    const performanceTest = performanceTestModel({
      id: `perf-${type}`,
      name: `${type} test`,
      type,
      request: {
        id: `request-${type}`,
        name: `${type} request`,
        method: 'GET',
        url: `https://api.example.test/${type}`
      },
      config: { iterations: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
      safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 }
    });

    const result = await runPerformanceTest(performanceTest, null, {
      sendRequest: async () => response()
    });

    assert.equal(result.type, type);
    assert.equal(result.completedRequests, 1);
    assert.equal(result.successfulRequests, 1);
    assert.equal(result.failedRequests, 0);
    assert.equal(result.summary.statusCodes['200'], 1);
  }
});

test('creates type-specific bounded plans and rejects unsafe effective concurrency', () => {
  const spike = performanceTestModel({
    type: 'spike',
    request: { method: 'GET', url: 'https://api.example.test/spike' },
    config: { iterations: 10, concurrency: 2, spikeMultiplier: 3 },
    safetyLimits: { maxTotalRequests: 10, maxConcurrency: 6, maxDurationSeconds: 10 }
  });
  assert.deepEqual(createPerformancePlan(spike), { totalRequests: 10, concurrency: 6 });

  const ramp = performanceTestModel({
    type: 'ramp',
    request: { method: 'GET', url: 'https://api.example.test/ramp' },
    config: { iterations: 20, concurrency: 5, rampSteps: 4 },
    safetyLimits: { maxTotalRequests: 12, maxConcurrency: 3, maxDurationSeconds: 10 }
  });
  assert.deepEqual(createPerformancePlan(ramp), { totalRequests: 12, concurrency: 3 });

  assert.throws(
    () => assertPerformanceTestPayload(performanceTestModel({
      type: 'spike',
      request: { method: 'GET', url: 'https://api.example.test/unsafe' },
      config: { iterations: 1, concurrency: 4, spikeMultiplier: 3 },
      safetyLimits: { maxTotalRequests: 10, maxConcurrency: 10, maxDurationSeconds: 10 }
    })),
    /config.concurrency exceeds safetyLimits.maxConcurrency/
  );
});

test('runs bounded performance iterations through the request lifecycle and aggregates summaries', async () => {
  const progress = [];
  const performanceTest = performanceTestModel({
    id: 'perf-1',
    name: 'Latency',
    type: 'throughput',
    request: {
      id: 'request-copy',
      name: 'Request Copy',
      method: 'GET',
      url: 'https://api.example.test'
    },
    config: { iterations: 3, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 5, maxConcurrency: 2, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    onProgress: (event) => progress.push(event),
    sendRequest: async () => ({
      statusCode: 200,
      headers: {},
      body: '{"ok":true}',
      durationMillis: 12,
      responseBytes: 11,
      finalUrl: 'https://api.example.test'
    })
  });

  assert.equal(result.passed, true);
  assert.equal(result.totalRequests, 3);
  assert.equal(result.completedRequests, 3);
  assert.equal(result.successfulRequests, 3);
  assert.equal(result.summary.p95DurationMillis, 12);
  assert.equal(result.summary.statusCodes['200'], 3);
  assert.deepEqual(progress.map((event) => event.completedRequests), [1, 2, 3]);
});

test('carries runner-style request details into performance samples', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-details',
    name: 'Detailed Performance',
    type: 'latency',
    request: {
      id: 'request-details',
      name: 'Detailed Request',
      method: 'GET',
      url: 'https://api.example.test/details',
      assertions: [{ type: 'bodyContains', expected: 'ok' }],
      scripts: {
        preRequest: "pm.test('pre-request ran', function () { pm.expect(true).to.equal(true); });",
        tests: "pm.test('post-request saw status', function () { pm.response.to.have.status(200); });"
      }
    },
    config: { iterations: 1, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, null, {
    sendRequest: async () => ({
      statusCode: 200,
      headers: {},
      body: '{"ok":true}',
      durationMillis: 12,
      responseBytes: 11,
      finalUrl: 'https://api.example.test/details'
    })
  });

  const sample = result.samples[0];
  assert.equal(sample.responseBody, '{"ok":true}');
  assert.equal(sample.responseBytes, 11);
  assert.equal(sample.assertionResults[0].passed, true);
  assert.equal(sample.preRequestScriptResult.tests[0].name, 'pre-request ran');
  assert.equal(sample.testScriptResult.tests[0].name, 'post-request saw status');
});

test('keeps performance environment mutations temporary unless persistence is allowed', async () => {
  const base = {
    id: 'env',
    name: 'Env',
    variables: [{ enabled: true, key: 'token', value: 'base' }]
  };
  const performanceTest = performanceTestModel({
    id: 'perf-env',
    name: 'Env Mutation',
    type: 'latency',
    request: {
      id: 'request-copy',
      name: 'Mutating Request',
      method: 'GET',
      url: 'https://api.example.test',
      scripts: { tests: "pm.environment.set('token', 'runtime');" }
    },
    config: { iterations: 1 },
    safetyLimits: { maxTotalRequests: 2, maxConcurrency: 1, maxDurationSeconds: 10 }
  });

  const temporary = await runPerformanceTest(performanceTest, base, {
    sendRequest: async () => response()
  });
  const persisted = await runPerformanceTest({
    ...performanceTest,
    allowEnvironmentMutation: true
  }, base, {
    sendRequest: async () => response()
  });

  assert.equal(base.variables[0].value, 'base');
  assert.equal(temporary.environment.variables.find((item) => item.key === 'token').value, 'runtime');
  assert.equal(temporary.mutatedEnvironment, undefined);
  assert.equal(persisted.mutatedEnvironment.variables.find((item) => item.key === 'token').value, 'runtime');
});

test('rejects performance execution that exceeds safety caps', async () => {
  await assert.rejects(
    () => runPerformanceTest({
      id: 'perf-unsafe',
      name: 'Unsafe',
      type: 'spike',
      request: { method: 'GET', url: 'https://api.example.test' },
      config: { iterations: 2, concurrency: 5, spikeMultiplier: 3 },
      safetyLimits: { maxTotalRequests: 10, maxConcurrency: 10, maxDurationSeconds: 10 }
    }, null, {
      sendRequest: async () => response()
    }),
    /config.concurrency exceeds safetyLimits.maxConcurrency/
  );
});

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: '{}',
    durationMillis: 1,
    responseBytes: 2,
    finalUrl: 'https://api.example.test'
  };
}
