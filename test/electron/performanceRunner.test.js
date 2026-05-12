const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveEnvironmentValue } = require('../../src/core/environmentResolver');
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
  const spikePlan = createPerformancePlan(spike);
  assert.equal(spikePlan.totalRequests, 10);
  assert.equal(spikePlan.concurrency, 6);
  assert.equal(spikePlan.durationMillis, 10000);
  assert.deepEqual(spikePlan.stages.map((stage) => stage.concurrency), [6]);

  const ramp = performanceTestModel({
    type: 'ramp',
    request: { method: 'GET', url: 'https://api.example.test/ramp' },
    config: { iterations: 4, startConcurrency: 1, concurrency: 5, rampSteps: 4 },
    safetyLimits: { maxTotalRequests: 12, maxConcurrency: 3, maxDurationSeconds: 10 }
  });
  const rampPlan = createPerformancePlan(ramp);
  assert.equal(rampPlan.totalRequests, 12);
  assert.equal(rampPlan.concurrency, 3);
  assert.equal(rampPlan.durationMillis, 10000);
  assert.deepEqual(rampPlan.stages.map((stage) => stage.totalRequests), [4, 4, 4]);
  assert.deepEqual(rampPlan.stages.map((stage) => stage.concurrency), [1, 2, 3]);

  const concurrency = performanceTestModel({
    type: 'concurrency',
    request: { method: 'GET', url: 'https://api.example.test/concurrency' },
    config: { iterations: 4, concurrency: 3 },
    safetyLimits: { maxTotalRequests: 12, maxConcurrency: 3, maxDurationSeconds: 10 }
  });
  const concurrencyPlan = createPerformancePlan(concurrency);
  assert.equal(concurrencyPlan.totalRequests, 12);
  assert.equal(concurrencyPlan.concurrency, 3);
  assert.equal(concurrencyPlan.durationMillis, 10000);
  assert.deepEqual(concurrencyPlan.stages.map((stage) => stage.concurrency), [3]);

  const soak = performanceTestModel({
    type: 'soak',
    request: { method: 'GET', url: 'https://api.example.test/soak' },
    config: { durationSeconds: 2, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 25, maxConcurrency: 2, maxDurationSeconds: 10 }
  });
  const soakPlan = createPerformancePlan(soak);
  assert.equal(soakPlan.totalRequests, 25);
  assert.equal(soakPlan.concurrency, 2);
  assert.equal(soakPlan.durationMillis, 2000);

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

test('performance tests consume CSV variable rows for each planned request', async () => {
  const sent = [];
  const performanceTest = performanceTestModel({
    id: 'perf-csv',
    name: 'CSV Performance',
    type: 'throughput',
    request: {
      id: 'request-csv',
      name: 'CSV Request',
      method: 'POST',
      url: '${requestUrl}',
      bodyType: 'RAW_TEXT',
      body: '${requestBody}',
      scripts: {
        tests: `
          pm.test('iteration data is available', function () {
            pm.expect(pm.iterationData.get('requestUrl')).to.contain('api.example.test');
          });
        `
      }
    },
    csvVariables: {
      schema: 'requestUrl,requestBody',
      values: [
        'https://api.example.test/one,"{""id"":1}"',
        'https://api.example.test/two,"{""id"":2}"'
      ].join('\n')
    },
    config: { iterations: 2, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 2, maxConcurrency: 2, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push({
        url: resolveEnvironmentValue(request.url, environment),
        body: resolveEnvironmentValue(request.body, environment)
      });
      return response();
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent.map((item) => item.url).sort(), [
    'https://api.example.test/one',
    'https://api.example.test/two'
  ]);
  assert.deepEqual(sent.map((item) => item.body).sort(), ['{"id":1}', '{"id":2}']);
  assert.deepEqual(result.samples.map((sample) => sample.requestUrl).sort(), [
    'https://api.example.test/one',
    'https://api.example.test/two'
  ]);
  assert.deepEqual(result.samples.map((sample) => sample.requestMethod), ['POST', 'POST']);
  assert.equal(result.samples[0].testScriptResult.tests[0].passed, true);
});

test('performance tests can loop CSV variable rows across planned requests', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-csv-loop',
    name: 'CSV Loop Performance',
    type: 'throughput',
    request: {
      id: 'request-csv-loop',
      name: 'CSV Loop Request',
      method: 'GET',
      url: '${requestUrl}'
    },
    csvVariables: {
      schema: 'requestUrl',
      values: [
        'https://api.example.test/one',
        'https://api.example.test/two'
      ].join('\n'),
      loopRows: true
    },
    config: { iterations: 5, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 5, maxConcurrency: 1, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response()
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.samples.map((sample) => sample.requestUrl), [
    'https://api.example.test/one',
    'https://api.example.test/two',
    'https://api.example.test/one',
    'https://api.example.test/two',
    'https://api.example.test/one'
  ]);
});

test('performance tests can continue without CSV variable rows after data runs out', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-csv-continue',
    name: 'CSV Continue Performance',
    type: 'throughput',
    request: {
      id: 'request-csv-continue',
      name: 'CSV Continue Request',
      method: 'GET',
      url: '${requestUrl}'
    },
    csvVariables: {
      schema: 'requestUrl',
      values: [
        'https://api.example.test/one',
        'https://api.example.test/two'
      ].join('\n'),
      continueWithoutRows: true
    },
    config: { iterations: 4, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 4, maxConcurrency: 1, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response()
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.samples.map((sample) => sample.requestUrl), [
    'https://api.example.test/one',
    'https://api.example.test/two',
    '${requestUrl}',
    '${requestUrl}'
  ]);
});

test('performance tests can reuse the first CSV variable row for all planned requests', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-csv-reuse-first',
    name: 'CSV Reuse First Performance',
    type: 'throughput',
    request: {
      id: 'request-csv-reuse-first',
      name: 'CSV Reuse First Request',
      method: 'POST',
      url: 'https://api.example.test/login',
      bodyType: 'RAW_TEXT',
      body: '${username}:${password}'
    },
    csvVariables: {
      schema: 'username,password',
      values: 'alice,correct-horse',
      reuseFirstRow: true
    },
    config: { iterations: 3, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 3, maxConcurrency: 2, maxDurationSeconds: 10 }
  });

  const sent = [];
  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      sent.push(resolveEnvironmentValue(request.body, environment));
      return response();
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sent, [
    'alice:correct-horse',
    'alice:correct-horse',
    'alice:correct-horse'
  ]);
});

test('performance tests can disable configured CSV variable data from the main pane option', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-csv-disabled',
    name: 'CSV Disabled Performance',
    type: 'latency',
    request: {
      id: 'request-csv-disabled',
      name: 'CSV Disabled Request',
      method: 'GET',
      url: '${requestUrl}'
    },
    csvVariables: {
      enabled: false,
      schema: 'requestUrl',
      values: 'https://api.example.test/one'
    },
    config: { iterations: 1, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async () => response()
  });

  assert.equal(result.passed, true);
  assert.equal(result.samples[0].requestUrl, '${requestUrl}');
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
  assert.equal(sample.requestDisplayName, 'Detailed Request');
  assert.equal(sample.requestMethod, 'GET');
  assert.equal(sample.requestUrl, 'https://api.example.test/details');
  assert.equal(sample.responseBody, '{"ok":true}');
  assert.equal(sample.responseBytes, 11);
  assert.equal(sample.preRequestScriptResult.tests[0].name, 'pre-request ran');
  assert.equal(sample.testScriptResult.tests[0].name, 'post-request saw status');
});

test('keeps script failures out of performance sample top-level errors', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-script-fail',
    name: 'Script Failure Performance',
    type: 'latency',
    request: {
      id: 'script-fail-request',
      name: 'Script Failure Request',
      method: 'GET',
      url: 'https://api.example.test/script-fail',
      scripts: {
        preRequest: "throw new Error('pre failed');",
        tests: "throw new Error('post failed');"
      }
    },
    config: { iterations: 1, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, null, {
    sendRequest: async () => response()
  });

  const sample = result.samples[0];
  assert.equal(result.passed, false);
  assert.equal(sample.statusCode, 200);
  assert.equal(sample.error, '');
  assert.deepEqual(result.summary.errors, {});
  assert.equal(sample.preRequestScriptResult.error, 'pre failed');
  assert.equal(sample.testScriptResult.error, 'post failed');
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
