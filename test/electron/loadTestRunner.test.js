const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  HIGH_CONCURRENCY_THRESHOLD,
  loadTestResultToCsv,
  runLoadTest,
  validateLoadConfig
} = require('../../src/core/loadTestRunner');

test('validates load-test limits', () => {
  assert.deepEqual(validateLoadConfig({ concurrency: 2, totalRequests: 5 }), {
    concurrency: 2,
    totalRequests: 5,
    allowedHosts: [],
    confirmedHighConcurrency: false
  });
  assert.throws(() => validateLoadConfig({ concurrency: 0, totalRequests: 5 }), /Concurrency must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 0 }), /Total requests must be between/);
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

test('runs a fixed-size concurrent load test and summarizes metrics', async () => {
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
    assert.equal(result.statusCounts['201'], 7);
    assert.ok(result.requestsPerSecond > 0);
    assert.ok(result.p50Millis >= 0);
    assert.deepEqual(progress.at(-1), { completedRequests: 7, requestedRequests: 7 });
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
    assert.match(loadTestResultToCsv(result), /^metric,value\nrequestedRequests,100/m);
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
