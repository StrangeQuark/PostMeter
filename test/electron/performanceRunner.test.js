const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveEnvironmentValue } = require('../../src/core/environmentResolver');
const { performanceTestModel } = require('../../src/core/models');
const { assertPerformanceTestPayload } = require('../../src/core/ipcValidation');
const { createPerformancePlan, runPerformanceTest } = require('../../src/core/performanceRunner');
const { createRuntimeResultStore } = require('../../src/core/runtimeResultStore');

const PERFORMANCE_TYPES = ['diagnosis', 'latency', 'throughput', 'concurrency', 'stress', 'spike', 'soak', 'ramp'];

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
    const expectedRequests = type === 'diagnosis' ? 44 : 1;
    assert.equal(result.completedRequests, expectedRequests);
    assert.equal(result.successfulRequests, expectedRequests);
    assert.equal(result.failedRequests, 0);
    assert.equal(result.summary.statusCodes['200'], expectedRequests);
  }
});

test('creates type-specific bounded plans and rejects unsafe effective concurrency', () => {
  const diagnosis = performanceTestModel({
    type: 'diagnosis',
    request: { method: 'GET', url: 'https://api.example.test/diagnosis' },
    safetyLimits: { maxTotalRequests: 25, maxConcurrency: 4, maxDurationSeconds: 10 }
  });
  const diagnosisPlan = createPerformancePlan(diagnosis);
  assert.equal(diagnosisPlan.totalRequests, 44);
  assert.equal(diagnosisPlan.concurrency, 4);
  assert.equal(diagnosisPlan.durationMillis, 60000);
  assert.deepEqual(diagnosisPlan.stages.map((stage) => stage.phase).slice(0, 5), [
    'preflight',
    'head-probe',
    'options-probe',
    'warmup',
    'baseline-latency'
  ]);
  assert.deepEqual(diagnosisPlan.stages.map((stage) => stage.totalRequests), [1, 1, 1, 3, 5, 5, 5, 5, 10, 5, 3]);

  const mediumDiagnosis = performanceTestModel({
    type: 'diagnosis',
    request: { method: 'GET', url: 'https://api.example.test/diagnosis' },
    config: { diagnosisScope: 'medium' },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 4, maxDurationSeconds: 10 }
  });
  const mediumDiagnosisPlan = createPerformancePlan(mediumDiagnosis);
  assert.equal(mediumDiagnosisPlan.totalRequests, 300);
  assert.equal(mediumDiagnosisPlan.durationMillis, 300000);
  assert.equal(mediumDiagnosisPlan.stages.find((stage) => stage.phase === 'baseline-latency').totalRequests, 120);

  const extendedDiagnosis = performanceTestModel({
    type: 'diagnosis',
    request: { method: 'GET', url: 'https://api.example.test/diagnosis' },
    config: { diagnosisScope: 'extended' },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 4, maxDurationSeconds: 10 }
  });
  const extendedDiagnosisPlan = createPerformancePlan(extendedDiagnosis);
  assert.equal(extendedDiagnosisPlan.totalRequests, 1000);
  assert.equal(extendedDiagnosisPlan.durationMillis, 900000);
  assert.equal(extendedDiagnosisPlan.stages.find((stage) => stage.phase === 'baseline-latency').totalRequests, 500);

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

test('full endpoint diagnosis measures a real local endpoint and builds the diagnostic report', async () => {
  const server = await createDiagnosticServer();
  try {
    const performanceTest = performanceTestModel({
      id: 'perf-diagnosis-local',
      name: 'Local Diagnosis',
      type: 'diagnosis',
      request: {
        id: 'request-diagnosis-local',
        name: 'Local Endpoint',
        method: 'GET',
        url: `${server.baseUrl}/diagnostic?api_key=demo`
      },
      safetyLimits: { maxTotalRequests: 12, maxConcurrency: 4, maxDurationSeconds: 10 }
    });

    const result = await runPerformanceTest(performanceTest, null);
    const diagnosis = result.summary.diagnosis;

    assert.equal(result.type, 'diagnosis');
    assert.equal(result.completedRequests, 44);
    assert.equal(result.samples.some((sample) => sample.phase === 'head-probe'), true);
    assert.equal(result.samples.some((sample) => sample.phase === 'options-probe'), true);
    assert.ok(result.samples.some((sample) => sample.timings?.timeToFirstByteMillis >= 0));
    assert.ok(result.samples.some((sample) => sample.responseHeaders?.['server-timing']));
    assert.equal(diagnosis.requestedChecks, 76);
    assert.equal(diagnosis.completedChecks, 76);
    assert.ok(diagnosis.bestObservedRequestsPerSecond >= 0);
    assert.ok(['high', 'medium', 'low'].includes(diagnosis.confidence));
    assert.equal(findDiagnosisCheck(diagnosis, 'server_timing_headers').status, 'pass');
    assert.equal(findDiagnosisCheck(diagnosis, 'rate_limit_headers').status, 'warn');
    assert.equal(findDiagnosisCheck(diagnosis, 'sensitive_data_in_url').status, 'warn');
    assert.equal(findDiagnosisCheck(diagnosis, 'head_probe').status, 'pass');
    assert.equal(findDiagnosisCheck(diagnosis, 'options_probe').status, 'pass');
  } finally {
    await server.close();
  }
});

test('full endpoint diagnosis survives unstable HTTP behavior and still reports diagnostics', async () => {
  const server = await createUnstableDiagnosticServer();
  try {
    const performanceTest = performanceTestModel({
      id: 'perf-diagnosis-unstable',
      name: 'Unstable Local Diagnosis',
      type: 'diagnosis',
      request: {
        id: 'request-diagnosis-unstable',
        name: 'Unstable Endpoint',
        method: 'GET',
        url: `${server.baseUrl}/unstable?token=demo`
      },
      safetyLimits: { maxTotalRequests: 12, maxConcurrency: 5, maxDurationSeconds: 10 }
    });

    const result = await runPerformanceTest(performanceTest, null);
    const diagnosis = result.summary.diagnosis;

    assert.equal(result.completedRequests, 44);
    assert.equal(diagnosis.completedChecks, diagnosis.requestedChecks);
    assert.equal(result.samples.some((sample) => sample.phase === 'head-probe' && sample.statusCode === 405), true);
    assert.equal(result.samples.some((sample) => sample.phase === 'options-probe' && sample.statusCode === 204), true);
    assert.equal(Object.hasOwn(result.summary.statusCodes, '503'), true);
    assert.equal(findDiagnosisCheck(diagnosis, 'http_status_distribution').status, 'fail');
    assert.equal(findDiagnosisCheck(diagnosis, 'sensitive_data_in_url').status, 'warn');
    assert.ok(['high', 'medium', 'low'].includes(diagnosis.confidence));
  } finally {
    await server.close();
  }
});

test('full endpoint diagnosis completes with diagnostics when the endpoint refuses connections', async () => {
  const url = await closedLocalUrl('/offline');
  const performanceTest = performanceTestModel({
    id: 'perf-diagnosis-refused',
    name: 'Refused Local Diagnosis',
    type: 'diagnosis',
    request: {
      id: 'request-diagnosis-refused',
      name: 'Refused Endpoint',
      method: 'GET',
      url
    },
    safetyLimits: { maxTotalRequests: 12, maxConcurrency: 4, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, null);
  const diagnosis = result.summary.diagnosis;

  assert.equal(result.completedRequests, 44);
  assert.equal(result.successfulRequests, 0);
  assert.equal(result.failedRequests, 44);
  assert.equal(diagnosis.completedChecks, diagnosis.requestedChecks);
  assert.equal(findDiagnosisCheck(diagnosis, 'error_distribution').status, 'fail');
  assert.equal(findDiagnosisCheck(diagnosis, 'success_rate').status, 'fail');
  assert.equal(findDiagnosisCheck(diagnosis, 'failure_rate').status, 'fail');
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

test('performance result streaming writes only outer performance samples with stable indexes', async () => {
  const runnerRows = [];
  const performanceRows = [];
  const performanceTest = performanceTestModel({
    id: 'perf-streamed-results',
    name: 'Streamed Performance',
    type: 'throughput',
    request: {
      id: 'request-streamed-results',
      name: 'Streamed Request',
      method: 'GET',
      url: 'https://api.example.test/streamed'
    },
    config: { iterations: 3, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 3, maxConcurrency: 2, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    retainSamples: false,
    resultWriter: {
      async recordRunnerResult(item, context) {
        runnerRows.push({ item, context });
      },
      async recordPerformanceSample(item, context) {
        performanceRows.push({ item, context });
      }
    },
    sendRequest: async () => response()
  });

  assert.equal(result.completedRequests, 3);
  assert.equal(result.samples.length, 0);
  assert.equal(runnerRows.length, 0);
  assert.deepEqual(performanceRows.map((row) => row.context.index), [0, 1, 2]);
  assert.deepEqual(performanceRows.map((row) => row.item.iteration).sort((left, right) => left - right), [1, 2, 3]);
});

test('performance runs do not need retained samples to produce exact aggregate summaries', async () => {
  const durations = [25, 5, 15, 35];
  const performanceTest = performanceTestModel({
    id: 'perf-streamed-summary',
    name: 'Streamed Summary',
    type: 'throughput',
    request: {
      id: 'request-streamed-summary',
      name: 'Streamed Summary Request',
      method: 'GET',
      url: 'https://api.example.test/streamed-summary'
    },
    config: { iterations: 4, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 4, maxConcurrency: 2, maxDurationSeconds: 10 }
  });

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    retainSamples: false,
    sendRequest: async () => ({
      ...response(),
      durationMillis: durations.shift()
    })
  });

  assert.equal(result.completedRequests, 4);
  assert.equal(result.successfulRequests, 4);
  assert.equal(result.samples.length, 0);
  assert.equal(result.summary.minDurationMillis, 5);
  assert.equal(result.summary.maxDurationMillis, 35);
  assert.equal(result.summary.p50DurationMillis, 15);
  assert.equal(result.summary.p95DurationMillis, 35);
  assert.equal(result.summary.statusCodes['200'], 4);
});

test('performance requests use bounded node transport options', async () => {
  const sendOptions = [];
  const performanceTest = performanceTestModel({
    id: 'perf-node-transport',
    name: 'Node Transport',
    type: 'throughput',
    request: {
      id: 'request-node-transport',
      name: 'Node Transport Request',
      method: 'GET',
      url: 'https://api.example.test/node-transport'
    },
    config: { iterations: 2, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 2, maxConcurrency: 2, maxDurationSeconds: 10 },
    capturePolicy: { transportTimings: false }
  });

  const result = await runPerformanceTest(performanceTest, null, {
    requestTimeoutMillis: 1234,
    sendRequest: async (_request, _environment, options = {}) => {
      sendOptions.push(options);
      return response();
    }
  });

  assert.equal(result.completedRequests, 2);
  assert.equal(sendOptions.length, 2);
  for (const options of sendOptions) {
    assert.equal(options.forceNode, true);
    assert.equal(options.collectTimings, false);
    assert.equal(options.timeoutMillis, 1234);
    assert.ok(options.agent);
    assert.equal(options.agent.options.keepAlive, true);
    assert.equal(options.agent.maxSockets, 2);
  }
});

test('performance transport diagnostics are captured only when the effective policy keeps timings', async () => {
  const sendOptions = [];
  const performanceTest = performanceTestModel({
    id: 'perf-transport-diagnostics',
    name: 'Transport Diagnostics',
    type: 'throughput',
    request: {
      id: 'request-transport-diagnostics',
      name: 'Transport Diagnostics Request',
      method: 'GET',
      url: 'https://api.example.test/transport-diagnostics'
    },
    config: { iterations: 1, concurrency: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 },
    capturePolicy: { transportTimings: true }
  });

  const result = await runPerformanceTest(performanceTest, null, {
    sendRequest: async (_request, _environment, options = {}) => {
      sendOptions.push(options);
      return {
        ...response(),
        headers: { 'server-timing': ['app;dur=1'] },
        timings: options.collectTimings === true ? { timeToFirstByteMillis: 3 } : undefined
      };
    }
  });

  assert.equal(sendOptions[0].collectTimings, true);
  assert.equal(result.samples[0].timings.timeToFirstByteMillis, 3);
  assert.deepEqual(result.samples[0].responseHeaders, { 'server-timing': ['app;dur=1'] });
});

test('performance request timeout fails stalled transports instead of hanging workers', async () => {
  const server = await createHangingServer();
  try {
    const performanceTest = performanceTestModel({
      id: 'perf-timeout',
      name: 'Timeout Performance',
      type: 'throughput',
      request: {
        id: 'request-timeout',
        name: 'Timeout Request',
        method: 'GET',
        url: `${server.baseUrl}/hang`
      },
      config: { iterations: 2, concurrency: 2 },
      safetyLimits: { maxTotalRequests: 2, maxConcurrency: 2, maxDurationSeconds: 10 }
    });

    const started = Date.now();
    const result = await runPerformanceTest(performanceTest, null, {
      requestTimeoutMillis: 50
    });

    assert.equal(result.completedRequests, 2);
    assert.equal(result.successfulRequests, 0);
    assert.equal(result.failedRequests, 2);
    assert.equal(result.summary.statusCodes['0'], 2);
    assert.equal(Object.values(result.summary.errors).reduce((sum, count) => sum + count, 0), 2);
    assert.ok(Date.now() - started < 2500);
  } finally {
    await server.close();
  }
});

test('performance result streaming stores SQLite samples without nested runner collisions', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-performance-store-'));
  const store = createRuntimeResultStore(path.join(temp, 'current.sqlite'));
  const performanceTest = performanceTestModel({
    id: 'perf-sqlite-streamed-results',
    name: 'SQLite Streamed Performance',
    type: 'throughput',
    request: {
      id: 'request-sqlite-streamed-results',
      name: 'SQLite Streamed Request',
      method: 'GET',
      url: 'https://api.example.test/sqlite-streamed'
    },
    config: { iterations: 3, concurrency: 2 },
    safetyLimits: { maxTotalRequests: 3, maxConcurrency: 2, maxDurationSeconds: 10 }
  });
  try {
    await store.reset();
    store.beginRun({
      id: 'perf-sqlite-streamed-results-run',
      kind: 'performance',
      plannedRequests: 3,
      capturePolicy: { responseBody: 'none' },
      metadata: { type: 'throughput' }
    });

    const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
      retainSamples: false,
      resultWriter: store,
      sendRequest: async () => response()
    });
    store.finishRun(result);

    assert.equal(store.count('performance'), 3);
    assert.equal(store.count('runner'), 0);
    assert.equal(store.detail({ kind: 'performance', resultIndex: 0 }).requestId, 'request-sqlite-streamed-results');
    assert.equal(store.detail({ kind: 'performance', resultIndex: 1 }).requestId, 'request-sqlite-streamed-results');
    assert.equal(store.detail({ kind: 'performance', resultIndex: 2 }).requestId, 'request-sqlite-streamed-results');
  } finally {
    store.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
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

async function createDiagnosticServer() {
  const server = http.createServer((request, response) => {
    setTimeout(() => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'max-age=60');
      response.setHeader('ETag', '"diagnostic-test"');
      response.setHeader('Server-Timing', 'app;dur=5');
      response.setHeader('X-Request-ID', 'diagnostic-request');
      response.setHeader('RateLimit-Limit', '100');
      response.setHeader('RateLimit-Remaining', '99');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Strict-Transport-Security', 'max-age=31536000');
      response.setHeader('Content-Security-Policy', "default-src 'none'");
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (request.method === 'OPTIONS') {
        response.setHeader('Allow', 'GET, HEAD, OPTIONS');
        response.statusCode = 204;
        response.end();
        return;
      }
      if (request.method === 'HEAD') {
        response.statusCode = 200;
        response.end();
        return;
      }
      response.statusCode = 200;
      response.end(JSON.stringify({
        ok: true,
        method: request.method,
        url: request.url
      }));
    }, 5);
  });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  const address = server.address();
  return {
    baseUrl: `http://localhost:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function createUnstableDiagnosticServer() {
  let count = 0;
  const server = http.createServer((request, response) => {
    count += 1;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'max-age=15');
    response.setHeader('ETag', `"unstable-${count % 3}"`);
    response.setHeader('Server-Timing', `app;dur=${count % 5}`);
    response.setHeader('X-Request-ID', `unstable-${count}`);
    response.setHeader('RateLimit-Limit', '50');
    response.setHeader('RateLimit-Remaining', String(Math.max(0, 50 - count)));
    if (request.method === 'HEAD') {
      response.statusCode = 405;
      response.end();
      return;
    }
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.end();
      return;
    }
    if (count % 7 === 0) {
      response.statusCode = 503;
      response.end(JSON.stringify({ ok: false, count, retry: true }));
      return;
    }
    response.statusCode = 200;
    response.end(JSON.stringify({
      ok: true,
      count,
      payload: count % 5 === 0 ? 'x'.repeat(8192) : 'small'
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function createHangingServer() {
  const sockets = new Set();
  const server = http.createServer(() => {});
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  const address = server.address();
  return {
    baseUrl: `http://localhost:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

async function closedLocalUrl(pathname = '/') {
  const server = http.createServer((_request, response) => response.end('closed'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return `http://127.0.0.1:${port}${pathname}`;
}

function findDiagnosisCheck(diagnosis, id) {
  return diagnosis.checks.find((check) => check.id === id) || {};
}
