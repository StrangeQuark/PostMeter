const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  HIGH_CONCURRENCY_THRESHOLD,
  MAX_MULTIPROCESS_AGGREGATED_SAMPLES,
  MAX_RECORDED_SAMPLES,
  loadTestResultToCsv,
  runLoadTest,
  validateLoadConfig
} = require('../../src/core/loadTestRunner');

test('validates load-test limits', () => {
  assert.deepEqual(validateLoadConfig({ concurrency: 2, totalRequests: 5 }), {
    concurrency: 2,
    totalRequests: 5,
    durationSeconds: 0,
    rampUpSeconds: 0,
    targetRatePerSecond: 0,
    executionMode: 'singleProcess',
    workerProcesses: 1,
    mode: 'requestCount',
    recordSamples: false,
    allowedHosts: [],
    confirmedHighConcurrency: false
  });
  assert.throws(() => validateLoadConfig({ concurrency: 0, totalRequests: 5 }), /Concurrency must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 0 }), /Total requests must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, durationSeconds: -1 }), /Duration must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, rampUpSeconds: -1 }), /Ramp-up must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, targetRatePerSecond: -1 }), /Target rate must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, executionMode: 'cluster' }), /Execution mode must be one of/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, workerProcesses: 0 }), /Worker processes must be between/);
  assert.equal(MAX_MULTIPROCESS_AGGREGATED_SAMPLES, 100000);
  assert.equal(
    validateLoadConfig({ concurrency: 2, totalRequests: MAX_RECORDED_SAMPLES + 1, executionMode: 'multiProcess', workerProcesses: 2 }).totalRequests,
    MAX_RECORDED_SAMPLES + 1
  );
  assert.throws(() => validateLoadConfig({ concurrency: HIGH_CONCURRENCY_THRESHOLD, totalRequests: 1 }), /require confirmation/);
});

test('requires request host to match load-test allowlist', () => {
  const request = {
    method: 'GET',
    url: 'https://api.example.test/load',
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: ''
  };
  assert.throws(
    () => validateLoadConfig({ concurrency: 2, totalRequests: 5 }, request, null),
    /at least one allowed host/
  );
  assert.throws(
    () => validateLoadConfig({ concurrency: 2, totalRequests: 5, allowedHosts: ['other.example.test'] }, request, null),
    /not in the load-test allowlist/
  );
  assert.deepEqual(
    validateLoadConfig({ concurrency: 2, totalRequests: 5, allowedHosts: ['https://api.example.test'] }, request, null).allowedHosts,
    ['api.example.test']
  );
});

test('runs a request-count concurrent load test and summarizes metrics', async () => {
  const server = await createServer((_request, response) => {
    response.statusCode = 201;
    response.end('ok');
  });
  const progress = [];

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/load`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, { concurrency: 3, totalRequests: 7, allowedHosts: ['127.0.0.1'] }, {
      onProgress: (event) => progress.push(event)
    });

    assert.equal(result.requestedRequests, 7);
    assert.equal(result.totalRequests, 7);
    assert.equal(result.successfulRequests, 7);
    assert.equal(result.failedRequests, 0);
    assert.equal(result.cancelled, false);
    assert.equal(result.mode, 'requestCount');
    assert.equal(result.statusCounts['201'], 7);
    assert.ok(result.requestsPerSecond > 0);
    assert.ok(result.p50Millis >= 0);
    assert.equal(result.latencyHistogram.reduce((sum, bucket) => sum + bucket.count, 0), 7);
    assert.equal(progress.at(-1).completedRequests, 7);
    assert.equal(progress.at(-1).requestedRequests, 7);
    assert.equal(progress.at(-1).mode, 'requestCount');
  } finally {
    await server.close();
  }
});

test('supports duration mode, ramp-up, samples, histograms, and sample CSV export', async () => {
  const server = await createServer((_request, response) => {
    setTimeout(() => {
      response.statusCode = 202;
      response.end('duration');
    }, 15);
  });

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/duration`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, {
      concurrency: 3,
      totalRequests: 1000,
      durationSeconds: 0.06,
      rampUpSeconds: 0.02,
      recordSamples: true,
      allowedHosts: ['127.0.0.1']
    });

    assert.equal(result.mode, 'duration');
    assert.equal(result.durationSeconds, 0.06);
    assert.equal(result.rampUpSeconds, 0.02);
    assert.ok(result.totalRequests > 0);
    assert.ok(result.totalRequests < 1000);
    assert.equal(result.samples.length, result.totalRequests);
    assert.equal(result.latencyHistogram.reduce((sum, bucket) => sum + bucket.count, 0), result.totalRequests);
    const csv = loadTestResultToCsv(result);
    assert.match(csv, /latencyUpperBoundMillis,count/);
    assert.match(csv, /sampleIndex,workerIndex,startedAtMillis,durationMillis,success,statusCode,error/);
  } finally {
    await server.close();
  }
});

test('supports target arrival-rate scheduling', async () => {
  const server = await createServer((_request, response) => {
    response.statusCode = 204;
    response.end();
  });

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/rate`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, {
      concurrency: 3,
      totalRequests: 3,
      targetRatePerSecond: 8,
      allowedHosts: ['127.0.0.1']
    });

    assert.equal(result.totalRequests, 3);
    assert.equal(result.targetRatePerSecond, 8);
    assert.equal(result.executionMode, 'singleProcess');
    assert.ok(result.elapsedMillis >= 180, `Expected rate limiting to delay starts, got ${result.elapsedMillis}ms.`);
    assert.match(loadTestResultToCsv(result), /targetRatePerSecond,8/);
  } finally {
    await server.close();
  }
});

test('supports bounded multi-process load execution', async () => {
  const server = await createServer((_request, response) => {
    response.statusCode = 200;
    response.end('process');
  });

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/process`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, {
      concurrency: 4,
      totalRequests: 6,
      executionMode: 'multiProcess',
      workerProcesses: 2,
      recordSamples: true,
      allowedHosts: ['127.0.0.1']
    });

    assert.equal(result.executionMode, 'multiProcess');
    assert.equal(result.workerProcesses, 2);
    assert.equal(result.totalRequests, 6);
    assert.equal(result.successfulRequests, 6);
    assert.equal(result.samples.length, 6);
    assert.ok(result.samples.every((sample) => sample.workerProcess === 1 || sample.workerProcess === 2));
  } finally {
    await server.close();
  }
});

test('summarizes multi-process results without recording raw samples', async () => {
  const server = await createServer((_request, response) => {
    response.statusCode = 206;
    response.end('streamed');
  });

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/process-summary`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, {
      concurrency: 6,
      totalRequests: 12,
      executionMode: 'multiProcess',
      workerProcesses: 3,
      allowedHosts: ['127.0.0.1']
    });

    assert.equal(result.executionMode, 'multiProcess');
    assert.equal(result.workerProcesses, 3);
    assert.equal(result.totalRequests, 12);
    assert.equal(result.successfulRequests, 12);
    assert.equal(result.statusCounts['206'], 12);
    assert.equal(result.latencyHistogram.reduce((sum, bucket) => sum + bucket.count, 0), 12);
    assert.ok(result.p50Millis >= 0);
    assert.equal(result.samples, undefined);
    assert.equal(result._latencyDistribution, undefined);
  } finally {
    await server.close();
  }
});

test('supports sustained target-rate scheduling in multi-process mode', async () => {
  const server = await createServer((_request, response) => {
    response.statusCode = 204;
    response.end();
  });

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/process-rate`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, {
      concurrency: 4,
      totalRequests: 6,
      executionMode: 'multiProcess',
      workerProcesses: 2,
      targetRatePerSecond: 12,
      allowedHosts: ['127.0.0.1']
    });

    assert.equal(result.executionMode, 'multiProcess');
    assert.equal(result.targetRatePerSecond, 12);
    assert.equal(result.totalRequests, 6);
    assert.equal(result.successfulRequests, 6);
    assert.ok(result.elapsedMillis >= 250, `Expected multi-process rate limiting to delay starts, got ${result.elapsedMillis}ms.`);
  } finally {
    await server.close();
  }
});

test('supports multi-process cancellation', async () => {
  const server = await createServer((_request, response) => {
    setTimeout(() => response.end('slow-process'), 100);
  });
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 25);

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/process-cancel`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, {
      concurrency: 4,
      totalRequests: 40,
      executionMode: 'multiProcess',
      workerProcesses: 2,
      allowedHosts: ['127.0.0.1']
    }, { abortController });

    assert.equal(result.executionMode, 'multiProcess');
    assert.equal(result.cancelled, true);
    assert.ok(result.totalRequests < 40);
  } finally {
    await server.close();
  }
});

test('supports longer-running multi-process cancellation', async () => {
  const server = await createServer((_request, response) => {
    setTimeout(() => response.end('very-slow-process'), 150);
  });
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 80);

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/process-long-cancel`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, {
      concurrency: 6,
      totalRequests: 100,
      executionMode: 'multiProcess',
      workerProcesses: 3,
      targetRatePerSecond: 30,
      allowedHosts: ['127.0.0.1']
    }, { abortController });

    assert.equal(result.executionMode, 'multiProcess');
    assert.equal(result.cancelled, true);
    assert.ok(result.totalRequests < 100);
    assert.ok(result.elapsedMillis < 1200);
  } finally {
    await server.close();
  }
});

test('supports cancellation and CSV export', async () => {
  const server = await createServer((_request, response) => {
    setTimeout(() => response.end('slow'), 100);
  });
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 20);

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/slow`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, { concurrency: 4, totalRequests: 100, allowedHosts: ['127.0.0.1'] }, { abortController });

    assert.equal(result.cancelled, true);
    assert.ok(result.totalRequests < 100);
    assert.ok(result.failedRequests >= 1);
    assert.match(loadTestResultToCsv(result), /^metric,value\nmode,requestCount\nrequestedRequests,100/m);
  } finally {
    await server.close();
  }
});

async function createServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
