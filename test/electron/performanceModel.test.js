const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PERFORMANCE_TEST_TYPES,
  cloneRequestForPerformanceTest,
  defaultPerformanceTest,
  performanceTestModel
} = require('../../src/core/workspace/models');
const {
  assertPerformanceTestPayload
} = require('../../src/core/contracts/ipcValidation');
const {
  exportPerformanceTestDocument,
  exportPerformanceTestToJson,
  importPerformanceTestFromText,
  performanceResultToCsv
} = require('../../src/core/import-export/performanceFormats');
const {
  runPerformanceTest
} = require('../../src/core/runtime/performanceRunner');

const EXPECTED_TYPES = Object.freeze([
  'diagnosis',
  'latency',
  'throughput',
  'concurrency',
  'stress',
  'spike',
  'soak',
  'ramp'
]);

test('Performance model accepts the eight V1 types and rejects unsafe limits for each type', () => {
  assert.deepEqual(PERFORMANCE_TEST_TYPES, EXPECTED_TYPES);

  for (const type of EXPECTED_TYPES) {
    const candidate = defaultPerformanceTest({
      type,
      request: { method: 'GET', url: 'https://example.test/performance' }
    });
    assert.equal(candidate.type, type);
    assert.equal(candidate.csvVariables.enabled, false);
    assert.doesNotThrow(() => assertPerformanceTestPayload(candidate));

    const unsafe = type === 'diagnosis'
      ? {
          ...candidate,
          safetyLimits: { ...candidate.safetyLimits, maxTotalRequests: 1000001 }
        }
      : performanceTestModel({
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

test('Performance model defaults CSV variables off but preserves legacy configured CSV data', () => {
  assert.equal(performanceTestModel({
    request: { method: 'GET', url: 'https://example.test/performance' }
  }).csvVariables.enabled, false);
  assert.equal(performanceTestModel({
    request: { method: 'GET', url: 'https://example.test/performance' },
    csvVariables: {}
  }).csvVariables.enabled, false);
  assert.equal(performanceTestModel({
    request: { method: 'GET', url: 'https://example.test/performance' },
    csvVariables: { schema: 'name', values: 'alice' }
  }).csvVariables.enabled, true);
});

test('Performance model preserves original auth for auto-refreshing request auth', () => {
  const performanceTest = performanceTestModel({
    request: {
      method: 'GET',
      url: 'https://example.test/performance',
      auth: { type: 'autoRefresh' },
      refreshingAuthOriginalAuth: { type: 'bearer', token: '{{ACCESS_TOKEN}}' }
    }
  });

  assert.deepEqual(performanceTest.request.auth, { type: 'autoRefresh' });
  assert.deepEqual(performanceTest.request.refreshingAuthOriginalAuth, {
    type: 'bearer',
    token: '{{ACCESS_TOKEN}}'
  });
  assert.doesNotThrow(() => assertPerformanceTestPayload(performanceTest));
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
  assert.equal(performanceTest.typeSettings.diagnosis.config.iterations, 44);
  assert.equal(performanceTest.typeSettings.diagnosis.config.diagnosisScope, 'quick');
  assert.equal(performanceTest.typeSettings.diagnosis.safetyLimits.maxTotalRequests, 44);
  assert.equal(performanceTest.typeSettings.throughput.config.iterations, 13);
  assert.equal(performanceTest.typeSettings.concurrency.config.concurrency, 5);
  assert.equal(performanceTest.typeSettings.ramp.config.startConcurrency, 1);
  assert.equal(performanceTest.config.iterations, 13);
  assert.equal(performanceTest.environmentId, 'env-throughput');
  assert.equal(performanceTest.allowEnvironmentMutation, true);
  assert.equal(performanceTest.authRefresh.enabled, false);
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

test('Performance model persists auth refresh definitions through export/import', () => {
  const performanceTest = performanceTestModel({
    type: 'throughput',
    request: { method: 'GET', url: 'https://example.test/performance' },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      authType: 'apiKey',
      targetScope: 'environment',
      accessTokenVariable: 'ACCESS_TOKEN',
      refreshIntervalSeconds: 300,
      outputs: [{ slot: 'apiKey', source: 'body', path: 'api_key', variable: 'API_KEY' }],
      request: {
        name: 'Refresh Auth',
        method: 'POST',
        url: 'https://auth.example.test/token',
        headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
        bodyType: 'RAW_JSON',
        body: '{"refresh":"{{REFRESH_TOKEN}}"}'
      },
      refreshTokenRequest: {
        name: 'Rotate Refresh Token',
        method: 'PUT',
        url: 'https://auth.example.test/refresh-token',
        headers: [{ enabled: true, key: 'X-Refresh', value: '{{REFRESH_TOKEN}}' }]
      }
    }
  });

  assert.doesNotThrow(() => assertPerformanceTestPayload(performanceTest));
  const imported = importPerformanceTestFromText(exportPerformanceTestToJson(performanceTest));
  assert.equal(imported.authRefresh.enabled, true);
  assert.equal(imported.authRefresh.mode, 'interval');
  assert.equal(imported.authRefresh.authType, 'apiKey');
  assert.deepEqual(imported.authRefresh.outputs.map((item) => [item.slot, item.path, item.variable]), [
    ['apiKey', 'api_key', 'API_KEY']
  ]);
  assert.equal(imported.authRefresh.request.url, 'https://auth.example.test/token');
  assert.equal(imported.authRefresh.request.headers[0].key, 'Content-Type');
  assert.equal(imported.authRefresh.refreshTokenRequest.name, 'Rotate Refresh Token');
  assert.equal(imported.authRefresh.refreshTokenRequest.method, 'PUT');
  assert.equal(imported.authRefresh.refreshTokenRequest.headers[0].key, 'X-Refresh');
});

test('Performance diagnosis scope controls planned samples and duration safety', () => {
  const medium = performanceTestModel({
    type: 'diagnosis',
    request: { method: 'GET', url: 'https://example.test/diagnosis' },
    config: { diagnosisScope: 'medium' },
    safetyLimits: { maxTotalRequests: 10, maxConcurrency: 5, maxDurationSeconds: 60 }
  });

  assert.equal(medium.config.diagnosisScope, 'medium');
  assert.equal(medium.config.iterations, 300);
  assert.equal(medium.safetyLimits.maxTotalRequests, 300);
  assert.equal(medium.safetyLimits.maxDurationSeconds, 300);
  assert.doesNotThrow(() => assertPerformanceTestPayload(medium));

  const extended = performanceTestModel({
    type: 'diagnosis',
    request: { method: 'GET', url: 'https://example.test/diagnosis' },
    config: { diagnosisScope: 'extended' },
    safetyLimits: { maxTotalRequests: 10, maxConcurrency: 5, maxDurationSeconds: 60 }
  });

  assert.equal(extended.config.iterations, 1000);
  assert.equal(extended.safetyLimits.maxTotalRequests, 1000);
  assert.equal(extended.safetyLimits.maxDurationSeconds, 900);
  assert.doesNotThrow(() => assertPerformanceTestPayload(extended));
  assert.throws(
    () => assertPerformanceTestPayload({
      ...extended,
      config: { ...extended.config, diagnosisScope: 'overnight' }
    }),
    /diagnosisScope must be one of/
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
      safetyLimits: { maxTotalRequests: 1000001, maxConcurrency: 10, maxDurationSeconds: 60 }
    }),
    /safetyLimits\.maxTotalRequests cannot exceed 1000000/
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
    docs: 'Performance docs',
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
  performanceTest.request.docs = 'Changed docs';
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

test('Performance request copies preserve GraphQL body metadata for native round-tripping', () => {
  const performanceTest = defaultPerformanceTest({
    type: 'latency',
    request: {
      name: 'GraphQL Performance Request',
      protocol: 'graphql',
      method: 'POST',
      url: 'https://api.example.test/graphql',
      bodyType: 'RAW_JSON',
      body: JSON.stringify({
        query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
        variables: '{"id":"{{userId}}"}',
        operationName: 'GetUser'
      }),
      graphql: {
        query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
        variables: '{"id":"{{userId}}"}',
        operationName: 'GetUser'
      },
      postmanBody: {
        mode: 'graphql',
        graphql: {
          query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
          variables: '{"id":"{{userId}}"}',
          operationName: 'GetUser'
        }
      }
    }
  });
  const exported = exportPerformanceTestDocument(performanceTest);
  const imported = importPerformanceTestFromText(JSON.stringify(exported));

  assert.equal(imported.request.protocol, 'graphql');
  assert.equal(imported.request.bodyType, 'RAW_JSON');
  assert.equal(imported.request.postmanBody.mode, 'graphql');
  assert.equal(imported.request.graphql.operationName, 'GetUser');
  assert.equal(imported.request.graphql.variables, '{"id":"{{userId}}"}');
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
