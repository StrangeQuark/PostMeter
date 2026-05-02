const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  HIGH_CONCURRENCY_THRESHOLD,
  MAX_MULTIPROCESS_AGGREGATED_SAMPLES,
  MAX_RECORDED_SAMPLES,
  loadTestResultToCsv,
  runLoadTest,
  summarize,
  validateLoadConfig
} = require('../../src/core/loadTestRunner');

test('validates load-test limits', () => {
  assert.deepEqual(validateLoadConfig({ concurrency: 2, totalRequests: 5 }), {
    concurrency: 2,
    totalRequests: 5,
    durationSeconds: 0,
    rampUpSeconds: 0,
    targetRatePerSecond: 0,
    maxRatePerSecond: 0,
    executionMode: 'singleProcess',
    workerProcesses: 1,
    mode: 'requestCount',
    recordSamples: false,
    policyDecisions: [],
    confirmedHighConcurrency: false
  });
  assert.throws(() => validateLoadConfig({ concurrency: 0, totalRequests: 5 }), /Concurrency must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 0 }), /Total requests must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, durationSeconds: -1 }), /Duration must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, rampUpSeconds: -1 }), /Ramp-up must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, targetRatePerSecond: -1 }), /Target rate must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, maxRatePerSecond: -1 }), /Rate cap must be between/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, targetRatePerSecond: 20, maxRatePerSecond: 10 }), /Target rate cannot exceed/);
  assert.throws(
    () => validateLoadConfig({ concurrency: 2, totalRequests: 100000, targetRatePerSecond: 0.001 }),
    /must complete within 3600 seconds/
  );
  assert.equal(validateLoadConfig({ concurrency: 2, totalRequests: 1, maxRatePerSecond: 10 }).targetRatePerSecond, 10);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, executionMode: 'cluster' }), /Execution mode must be one of/);
  assert.throws(() => validateLoadConfig({ concurrency: 2, totalRequests: 1, workerProcesses: 0 }), /Worker processes must be between/);
  assert.equal(MAX_MULTIPROCESS_AGGREGATED_SAMPLES, 100000);
  assert.equal(
    validateLoadConfig({ concurrency: 2, totalRequests: MAX_RECORDED_SAMPLES + 1, executionMode: 'multiProcess', workerProcesses: 2 }).totalRequests,
    MAX_RECORDED_SAMPLES + 1
  );
  assert.throws(() => validateLoadConfig({ concurrency: HIGH_CONCURRENCY_THRESHOLD, totalRequests: 1 }), /require confirmation/);
});

test('validates request URLs without requiring an allowlist', () => {
  const request = {
    method: 'GET',
    url: 'https://api.example.test/load',
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: ''
  };
  const config = validateLoadConfig({ concurrency: 2, totalRequests: 5 }, request, null);
  assert.equal(config.totalRequests, 5);
  assert.equal(config.policyDecisions.length, 0);
  const scriptedConfig = validateLoadConfig({ concurrency: 2, totalRequests: 5 }, {
    ...request,
    scripts: { preRequest: "pm.environment.set('x', 'y');", tests: "pm.test('ok', function () {});" }
  }, null);
  assert.ok(scriptedConfig.policyDecisions.some((decision) => /skip request pre-request and test scripts/i.test(decision.message)));
  assert.throws(
    () => validateLoadConfig({ concurrency: 2, totalRequests: 5 }, { ...request, url: 'not-a-url' }, null),
    /valid URI/
  );
});

test('supports rate-cap governance when target rate is omitted', async () => {
  const server = await createServer((_request, response) => {
    response.statusCode = 204;
    response.end();
  });

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/rate-cap`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, {
      concurrency: 3,
      totalRequests: 3,
      maxRatePerSecond: 6
    });

    assert.equal(result.totalRequests, 3);
    assert.equal(result.targetRatePerSecond, 6);
    assert.equal(result.maxRatePerSecond, 6);
    assert.ok(result.policyDecisions.some((decision) => /defaults to the configured rate cap/.test(decision.message)));
    assert.ok(result.elapsedMillis >= 250, `Expected rate cap to delay starts, got ${result.elapsedMillis}ms.`);
    assert.match(loadTestResultToCsv(result), /maxRatePerSecond,6/);
    assert.match(loadTestResultToCsv(result), /policyDecisions,/);
  } finally {
    await server.close();
  }
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
    }, null, { concurrency: 3, totalRequests: 7 }, {
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

test('carries response cookies forward during load tests and returns the final cookie jar', async () => {
  const seenCookies = [];
  const server = await createServer((request, response) => {
    seenCookies.push(request.headers.cookie || '');
    response.setHeader('Set-Cookie', 'loadSession=ready; Path=/; HttpOnly');
    response.statusCode = 200;
    response.end('cookies');
  });

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/cookies`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      cookieJar: { enabled: true, storeResponses: true }
    }, null, { concurrency: 1, totalRequests: 2 });

    assert.deepEqual(seenCookies, ['', 'loadSession=ready']);
    assert.equal(result.totalRequests, 2);
    assert.equal(result.cookies.length, 1);
    assert.equal(result.cookies[0].name, 'loadSession');
    assert.equal(result.cookies[0].value, 'ready');
  } finally {
    await server.close();
  }
});

test('pre-refreshes OAuth auth once for concurrent load tests and returns the refreshed auth', async () => {
  let tokenRequests = 0;
  const authorizations = [];
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequests += 1;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'fresh-load-token',
        refresh_token: 'rotated-load-refresh',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    authorizations.push(request.headers.authorization || '');
    response.statusCode = 200;
    response.end('ok');
  });

  try {
    const result = await runLoadTest({
      method: 'GET',
      url: `${server.baseUrl}/resource`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth2',
        grantType: 'authorizationCode',
        accessToken: 'stale-load-token',
        refreshToken: 'load-refresh',
        tokenUrl: `${server.baseUrl}/token`,
        expiresAt: '2000-01-01T00:00:00.000Z'
      }
    }, null, { concurrency: 3, totalRequests: 3 });

    assert.equal(tokenRequests, 1);
    assert.deepEqual(authorizations, ['Bearer fresh-load-token', 'Bearer fresh-load-token', 'Bearer fresh-load-token']);
    assert.equal(result.updatedAuth.accessToken, 'fresh-load-token');
    assert.equal(result.updatedAuth.refreshToken, 'rotated-load-refresh');
    assert.equal(Object.prototype.propertyIsEnumerable.call(result, 'updatedAuth'), false);
    assert.equal(JSON.stringify(result).includes('fresh-load-token'), false);
    assert.equal(JSON.stringify(result).includes('rotated-load-refresh'), false);
  } finally {
    await server.close();
  }
});

test('keeps zero-sample refreshed OAuth auth internal when summarizing load results', () => {
  const result = summarize([], 0, {
    totalRequests: 1000,
    mode: 'duration',
    durationSeconds: 0.001,
    rampUpSeconds: 0,
    targetRatePerSecond: 0,
    maxRatePerSecond: 0,
    executionMode: 'singleProcess',
    workerProcesses: 1,
    recordSamples: true,
    policyDecisions: []
  }, false, {
    updatedAuth: {
      type: 'oauth2',
      grantType: 'authorizationCode',
      accessToken: 'fresh-zero-sample-token',
      refreshToken: 'rotated-zero-sample-refresh'
    }
  });

  assert.equal(result.totalRequests, 0);
  assert.equal(result.updatedAuth.accessToken, 'fresh-zero-sample-token');
  assert.equal(Object.prototype.propertyIsEnumerable.call(result, 'updatedAuth'), false);
  assert.equal(JSON.stringify(result).includes('fresh-zero-sample-token'), false);
  assert.equal(JSON.stringify(result).includes('rotated-zero-sample-refresh'), false);
});

test('fails load tests before dispatch when OAuth pre-refresh fails', async () => {
  let tokenRequests = 0;
  let resourceRequests = 0;
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequests += 1;
      response.statusCode = 400;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        error: 'invalid_grant',
        error_description: 'revoked refresh_token=leaked-refresh-token'
      }));
      return;
    }
    resourceRequests += 1;
    response.statusCode = 200;
    response.end('ok');
  });

  try {
    await assert.rejects(
      () => runLoadTest({
        method: 'GET',
        url: `${server.baseUrl}/resource`,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: {
          type: 'oauth2',
          grantType: 'authorizationCode',
          accessToken: 'stale-load-token',
          refreshToken: 'load-refresh',
          tokenUrl: `${server.baseUrl}/token`,
          expiresAt: '2000-01-01T00:00:00.000Z'
        }
      }, null, { concurrency: 3, totalRequests: 3 }),
      (error) => {
        assert.match(error.message, /refresh_token=\[redacted\]/);
        assert.doesNotMatch(error.message, /leaked-refresh-token/);
        return true;
      }
    );
    assert.equal(tokenRequests, 1);
    assert.equal(resourceRequests, 0);
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
      recordSamples: true
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
      targetRatePerSecond: 8
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
      recordSamples: true
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
      workerProcesses: 3
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
      targetRatePerSecond: 12
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
      workerProcesses: 2
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
      targetRatePerSecond: 30
    }, { abortController });

    assert.equal(result.executionMode, 'multiProcess');
    assert.equal(result.cancelled, true);
    assert.ok(result.totalRequests < 100);
    assert.ok(result.elapsedMillis < 1200);
  } finally {
    await server.close();
  }
});

test('fails closed when a multi-process load worker never returns a result', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-load-worker-hang-'));
  const workerScript = path.join(directory, 'hang-worker.js');
  try {
    await fs.writeFile(workerScript, "process.on('SIGTERM', () => {}); process.on('message', () => {}); setInterval(() => {}, 1000);\n");
    const started = Date.now();

    await assert.rejects(
      () => runLoadTest({
        method: 'GET',
        url: 'https://example.test/load-worker-hang',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: ''
      }, null, {
        concurrency: 2,
        totalRequests: 2,
        executionMode: 'multiProcess',
        workerProcesses: 2
      }, {
        workerKillGraceMillis: 25,
        workerScript,
        workerTimeoutMillis: 25
      }),
      /Load worker timed out/
    );
    assert.ok(Date.now() - started < 1000, 'Load worker timeout should force-kill children that ignore SIGTERM.');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('bounds multi-process load worker stderr in failure messages', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-load-worker-stderr-'));
  const workerScript = path.join(directory, 'stderr-worker.js');
  try {
    await fs.writeFile(workerScript, "process.stderr.write('S'.repeat(200000)); process.on('message', () => {}); setInterval(() => {}, 1000);\n");

    await assert.rejects(
      () => runLoadTest({
        method: 'GET',
        url: 'https://example.test/load-worker-stderr',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: ''
      }, null, {
        concurrency: 2,
        totalRequests: 2,
        executionMode: 'multiProcess',
        workerProcesses: 2
      }, {
        workerKillGraceMillis: 25,
        workerScript,
        workerTimeoutMillis: 150
      }),
      (error) => {
        assert.match(error.message, /Load worker timed out/);
        assert.match(error.message, /stderr truncated/);
        assert.ok(Buffer.byteLength(error.message, 'utf8') < 80 * 1024);
        return true;
      }
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('redacts multi-process load worker stderr before surfacing failure messages', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-load-worker-redact-'));
  const workerScript = path.join(directory, 'stderr-redact-worker.js');
  try {
    await fs.writeFile(workerScript, [
      "process.stderr.write('/home/user/PostMeter Authorization: Bearer abcdefghijklmnopqrstuvwxyz authorization_code=auth-code-secret code_verifier=code-verifier-secret');",
      'process.on("message", () => {});',
      'setInterval(() => {}, 1000);'
    ].join('\n'));

    await assert.rejects(
      () => runLoadTest({
        method: 'GET',
        url: 'https://example.test/load-worker-stderr-redaction',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: ''
      }, null, {
        concurrency: 2,
        totalRequests: 2,
        executionMode: 'multiProcess',
        workerProcesses: 2
      }, {
        workerKillGraceMillis: 25,
        workerScript,
        workerTimeoutMillis: 150
      }),
      (error) => {
        assert.match(error.message, /Load worker timed out/);
        assert.doesNotMatch(error.message, /\/home\/user\/PostMeter/);
        assert.doesNotMatch(error.message, /abcdefghijklmnopqrstuvwxyz/);
        assert.doesNotMatch(error.message, /auth-code-secret/);
        assert.doesNotMatch(error.message, /code-verifier-secret/);
        assert.match(error.message, /\[path\]/);
        assert.match(error.message, /Bearer \[redacted\]/);
        assert.match(error.message, /authorization_code=\[redacted\]/);
        assert.match(error.message, /code_verifier=\[redacted\]/);
        return true;
      }
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
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
    }, null, { concurrency: 4, totalRequests: 100 }, { abortController });

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
