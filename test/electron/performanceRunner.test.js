const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveEnvironmentValue } = require('../../src/core/workspace/environmentResolver');
const { performanceTestModel } = require('../../src/core/workspace/models');
const { assertPerformanceTestPayload } = require('../../src/core/contracts/ipcValidation');
const { AUTH_TYPE_VALUES } = require('../../src/core/contracts/payloadSchemas');
const { createPerformancePlan, runPerformanceTest } = require('../../src/core/runtime/performanceRunner');
const { createRuntimeResultStore } = require('../../src/core/runtime/runtimeResultStore');

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

test('performance auth refresh is shared across concurrent workers', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-refresh',
    name: 'Refresh Performance',
    type: 'throughput',
    request: {
      id: 'request-refresh',
      name: 'Refresh Request',
      method: 'GET',
      url: 'https://api.example.test/resource',
      headers: [{ enabled: true, key: 'Authorization', value: 'Bearer {{ACCESS_TOKEN}}' }]
    },
    config: { iterations: 6, concurrency: 3, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    safetyLimits: { maxTotalRequests: 6, maxConcurrency: 3, maxDurationSeconds: 10 },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      targetScope: 'environment',
      accessTokenVariable: 'ACCESS_TOKEN',
      refreshBeforeRun: false,
      request: {
        id: 'refresh-auth',
        name: 'Refresh Auth',
        method: 'POST',
        url: 'https://auth.example.test/token'
      }
    }
  });
  let refreshCalls = 0;
  const observedTokens = [];

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      if (request.id === 'refresh-auth') {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return response(200, '{"access_token":"perf-token","expires_in":600}');
      }
      observedTokens.push(resolveEnvironmentValue('{{ACCESS_TOKEN}}', environment));
      return response();
    }
  });

  assert.equal(result.completedRequests, 6);
  assert.equal(result.failedRequests, 0);
  assert.equal(refreshCalls, 1);
  assert.deepEqual(observedTokens, Array.from({ length: 6 }, () => 'perf-token'));
  assert.equal(result.environment.variables.find((item) => item.key === 'ACCESS_TOKEN').value, 'perf-token');
  assert.equal(result.authRefresh.refreshCount, 1);
});

test('performance auth refresh injects bearer tokens into matching request auth automatically', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-auto-bearer-refresh',
    name: 'Auto Bearer Performance',
    type: 'throughput',
    request: {
      id: 'auto-bearer-resource',
      name: 'Auto Bearer Resource',
      method: 'GET',
      url: 'https://api.example.test/resource',
      auth: { type: 'bearer', token: 'stale-token' }
    },
    config: { iterations: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      authType: 'bearer',
      accessTokenVariable: '',
      refreshBeforeRun: true,
      outputs: [{ slot: 'accessToken', source: 'body', path: 'access_token', variable: '' }],
      request: {
        id: 'refresh-auth',
        name: 'Refresh Auth',
        method: 'POST',
        url: 'https://auth.example.test/token'
      }
    }
  });
  const observed = [];

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request) => {
      if (request.id === 'refresh-auth') {
        return response(200, '{"access_token":"perf-auto-bearer","expires_in":600}');
      }
      observed.push(request.auth);
      return response();
    }
  });

  assert.equal(result.completedRequests, 1);
  assert.equal(result.failedRequests, 0);
  assert.deepEqual(observed, [{ type: 'bearer', token: 'perf-auto-bearer' }]);
  assert.equal(result.authRefresh.refreshCount, 1);
});

test('performance auth refresh injects API keys into matching request auth automatically', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-auto-api-key-refresh',
    name: 'Auto API Key Performance',
    type: 'throughput',
    request: {
      id: 'auto-api-key-resource',
      name: 'Auto API Key Resource',
      method: 'GET',
      url: 'https://api.example.test/resource',
      auth: { type: 'apiKey', location: 'header', key: 'X-API-Key', value: 'stale-key' }
    },
    config: { iterations: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      authType: 'apiKey',
      apiKeyLocation: 'query',
      apiKeyName: 'api_key',
      accessTokenVariable: '',
      refreshBeforeRun: true,
      outputs: [{ slot: 'apiKey', source: 'body', path: 'api_key', variable: '' }],
      request: {
        id: 'refresh-api-key',
        name: 'Refresh API Key',
        method: 'POST',
        url: 'https://auth.example.test/api-key'
      }
    }
  });
  const observed = [];

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request) => {
      if (request.id === 'refresh-api-key') {
        return response(200, '{"api_key":"perf-auto-api-key"}');
      }
      observed.push(request.auth);
      return response();
    }
  });

  assert.equal(result.completedRequests, 1);
  assert.equal(result.failedRequests, 0);
  assert.deepEqual(observed, [{ type: 'apiKey', location: 'query', key: 'api_key', value: 'perf-auto-api-key' }]);
  assert.equal(result.authRefresh.refreshCount, 1);
});

test('performance auth refresh injects refreshed cookies into matching request auth automatically', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-auto-cookie-refresh',
    name: 'Auto Cookie Performance',
    type: 'throughput',
    request: {
      id: 'auto-cookie-resource',
      name: 'Auto Cookie Resource',
      method: 'GET',
      url: 'https://api.example.test/resource',
      auth: { type: 'none' },
      cookieJar: { enabled: true, storeResponses: true },
      useRefreshingAuthCookie: true,
      refreshingAuthOriginalAuth: { type: 'none' }
    },
    config: { iterations: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      authType: 'cookie',
      accessTokenVariable: '',
      refreshBeforeRun: true,
      outputs: [{ slot: 'cookie', source: 'cookie', path: 'sid', variable: '' }],
      request: {
        id: 'refresh-cookie',
        name: 'Refresh Cookie',
        method: 'POST',
        url: 'https://auth.example.test/session'
      }
    }
  });
  const observed = [];

  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, _environment, options = {}) => {
      if (request.id === 'refresh-cookie') {
        return {
          ...response(200, '{}'),
          updatedCookies: [{ enabled: true, name: 'sid', value: 'perf-cookie', domain: 'example.test', path: '/' }]
        };
      }
      observed.push({
        auth: request.auth,
        cookieJar: (options.cookieJar || []).map((cookie) => `${cookie.name}=${cookie.value}`),
        cookieJarEnabled: request.cookieJar?.enabled === true
      });
      return response();
    }
  });

  assert.equal(result.completedRequests, 1);
  assert.equal(result.failedRequests, 0);
  assert.deepEqual(observed, [{ auth: { type: 'none' }, cookieJar: ['sid=perf-cookie', 'sid=perf-cookie'], cookieJarEnabled: true }]);
  assert.equal(result.authRefresh.refreshCount, 1);
});

test('performance auth refresh can rotate refresh tokens with a separate request before getting access tokens', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-refresh-token-request',
    name: 'Refresh Token Request Performance',
    type: 'throughput',
    request: {
      id: 'resource',
      name: 'Resource',
      method: 'GET',
      url: 'https://api.example.test/resource',
      headers: [{ enabled: true, key: 'Authorization', value: 'Bearer {{ACCESS_TOKEN}}' }]
    },
    config: { iterations: 2, concurrency: 2, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    safetyLimits: { maxTotalRequests: 2, maxConcurrency: 2, maxDurationSeconds: 10 },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      targetScope: 'environment',
      accessTokenVariable: 'ACCESS_TOKEN',
      refreshTokenVariable: 'REFRESH_TOKEN',
      refreshBeforeRun: true,
      outputs: [
        { slot: 'accessToken', source: 'body', path: 'access_token', variable: 'ACCESS_TOKEN' },
        { slot: 'refreshToken', source: 'body', path: 'refresh_token', variable: 'REFRESH_TOKEN' }
      ],
      refreshTokenRequest: {
        id: 'rotate-refresh-token',
        name: 'Rotate Refresh Token',
        method: 'POST',
        url: 'https://auth.example.test/refresh-token'
      },
      request: {
        id: 'get-access-token',
        name: 'Get Access Token',
        method: 'POST',
        url: 'https://auth.example.test/access'
      }
    }
  });
  const sends = [];

  const result = await runPerformanceTest(performanceTest, {
    id: 'env',
    name: 'Env',
    variables: [{ enabled: true, key: 'REFRESH_TOKEN', value: 'refresh-1' }]
  }, {
    sendRequest: async (request, environment) => {
      sends.push({
        id: request.id,
        accessToken: (environment.variables || []).find((item) => item.key === 'ACCESS_TOKEN')?.value || '',
        refreshToken: (environment.variables || []).find((item) => item.key === 'REFRESH_TOKEN')?.value || ''
      });
      if (request.id === 'rotate-refresh-token') {
        return response(200, JSON.stringify({ refresh_token: 'refresh-2' }));
      }
      if (request.id === 'get-access-token') {
        return response(200, JSON.stringify({ access_token: 'access-2', expires_in: 600 }));
      }
      return response();
    }
  });

  assert.equal(result.completedRequests, 2);
  assert.equal(result.failedRequests, 0);
  assert.deepEqual(sends, [
    { id: 'rotate-refresh-token', accessToken: '', refreshToken: 'refresh-1' },
    { id: 'get-access-token', accessToken: '', refreshToken: 'refresh-2' },
    { id: 'resource', accessToken: 'access-2', refreshToken: 'refresh-2' },
    { id: 'resource', accessToken: 'access-2', refreshToken: 'refresh-2' }
  ]);
  assert.equal(result.environment.variables.find((item) => item.key === 'REFRESH_TOKEN').value, 'refresh-2');
  assert.equal(result.environment.variables.find((item) => item.key === 'ACCESS_TOKEN').value, 'access-2');
  assert.equal(result.authRefresh.refreshCount, 1);
});

test('performance auth refresh executes refresh requests with every supported auth type', async () => {
  for (const type of AUTH_TYPE_VALUES.filter((value) => !value.startsWith('autoRefresh'))) {
    const performanceTest = performanceTestModel({
      id: `perf-refresh-auth-${type}`,
      name: `Refresh Performance ${type}`,
      type: 'throughput',
      request: {
        id: `request-${type}`,
        name: `${type} Request`,
        method: 'GET',
        url: 'https://api.example.test/resource',
        headers: [{ enabled: true, key: 'Authorization', value: 'Bearer {{ACCESS_TOKEN}}' }]
      },
      config: { iterations: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
      safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 },
      authRefresh: {
        enabled: true,
        mode: 'lifetime',
        targetScope: 'environment',
        accessTokenVariable: 'ACCESS_TOKEN',
        refreshBeforeRun: true,
        request: {
          id: `refresh-auth-${type}`,
          name: `${type} Refresh Auth`,
          method: 'POST',
          url: 'https://auth.example.test/token',
          auth: authForType(type)
        }
      }
    });
    const observedRefreshAuthTypes = [];
    const observedResourceTokens = [];

    const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
      sendRequest: async (request, environment) => {
        if (request.id === `refresh-auth-${type}`) {
          observedRefreshAuthTypes.push(request.auth?.type || 'none');
          assert.equal((environment.variables || []).some((variable) => variable.key === 'ACCESS_TOKEN'), false, type);
          return response(200, JSON.stringify({ access_token: `perf-${type}`, expires_in: 600 }));
        }
        observedResourceTokens.push(resolveEnvironmentValue('{{ACCESS_TOKEN}}', environment));
        return response();
      }
    });

    assert.equal(result.completedRequests, 1, `${type} should run one performance request`);
    assert.equal(result.failedRequests, 0, `${type} should not fail`);
    assert.deepEqual(observedRefreshAuthTypes, [type], `${type} refresh request auth should be preserved`);
    assert.deepEqual(observedResourceTokens, [`perf-${type}`], `${type} should refresh before performance request`);
    assert.equal(result.authRefresh.refreshCount, 1, `${type} should refresh once`);
  }
});

test('performance auth refresh can use cookie-backed auth requests with custom token paths', async () => {
  const server = await createCookieBackedAuthServer();
  try {
    const performanceTest = performanceTestModel({
      id: 'perf-cookie-refresh',
      name: 'Cookie Refresh Performance',
      type: 'throughput',
      request: {
        id: 'protected-resource',
        name: 'Protected Resource',
        method: 'GET',
        url: `${server.baseUrl}/api/auth/user/search-users?query=test@t.com`,
        auth: { type: 'bearer', token: '{{ACCESS_TOKEN}}' }
      },
      config: { iterations: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
      safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 },
      authRefresh: {
        enabled: true,
        mode: 'interval',
        targetScope: 'environment',
        accessTokenVariable: 'ACCESS_TOKEN',
        refreshTokenVariable: '',
        accessTokenPath: 'jwtToken',
        refreshTokenPath: '',
        refreshBeforeRun: true,
        request: {
          id: 'refresh-auth',
          name: 'Access',
          method: 'GET',
          url: `${server.baseUrl}/api/auth/access`,
          cookieJar: { enabled: true, storeResponses: true }
        }
      }
    });

    const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
      cookieJar: [{
        enabled: true,
        name: 'refresh_token',
        value: 'refresh-ok',
        domain: 'localhost',
        path: '/',
        hostOnly: true
      }],
      requestTimeoutMillis: 500
    });

    assert.equal(result.passed, true);
    assert.equal(result.completedRequests, 1);
    assert.equal(result.samples[0].statusCode, 200);
    assert.equal(result.authRefresh.refreshCount, 1);
    assert.equal(result.environment.variables.find((item) => item.key === 'ACCESS_TOKEN').value, 'fresh-cookie-access');
    assert.equal(server.accessRequests(), 1);
    assert.equal(server.resourceRequests(), 1);
  } finally {
    await server.close();
  }
});

test('performance auth refresh saves multiple typed outputs for temporary AWS credentials', async () => {
  const performanceTest = performanceTestModel({
    id: 'perf-refresh-aws-outputs',
    name: 'Performance Refresh AWS Outputs',
    type: 'throughput',
    request: {
      id: 'aws-resource',
      name: 'AWS Resource',
      method: 'GET',
      url: 'https://api.example.test/resource',
      auth: {
        type: 'aws',
        accessKey: '{{AWS_ACCESS_KEY_ID}}',
        secretKey: '{{AWS_SECRET_ACCESS_KEY}}',
        sessionToken: '{{AWS_SESSION_TOKEN}}',
        region: 'us-east-1',
        service: 'execute-api'
      }
    },
    config: { iterations: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 },
    authRefresh: {
      enabled: true,
      mode: 'interval',
      authType: 'aws',
      targetScope: 'environment',
      accessTokenVariable: 'AWS_ACCESS_KEY_ID',
      refreshBeforeRun: true,
      outputs: [
        { slot: 'awsAccessKey', source: 'body', path: 'credentials.accessKeyId', variable: 'AWS_ACCESS_KEY_ID' },
        { slot: 'awsSecretKey', source: 'body', path: 'credentials.secretAccessKey', variable: 'AWS_SECRET_ACCESS_KEY' },
        { slot: 'awsSessionToken', source: 'body', path: 'credentials.sessionToken', variable: 'AWS_SESSION_TOKEN' }
      ],
      request: {
        id: 'refresh-aws',
        name: 'Refresh AWS',
        method: 'POST',
        url: 'https://auth.example.test/aws'
      }
    }
  });
  const observed = [];
  const result = await runPerformanceTest(performanceTest, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request, environment) => {
      if (request.id === 'refresh-aws') {
        return response(200, JSON.stringify({
          credentials: {
            accessKeyId: 'AKIA_PERF',
            secretAccessKey: 'secret-perf',
            sessionToken: 'session-perf'
          }
        }));
      }
      observed.push({
        accessKey: resolveEnvironmentValue(request.auth.accessKey, environment),
        secretKey: resolveEnvironmentValue(request.auth.secretKey, environment),
        sessionToken: resolveEnvironmentValue(request.auth.sessionToken, environment)
      });
      return response(200, '{}');
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(observed, [{
    accessKey: 'AKIA_PERF',
    secretKey: 'secret-perf',
    sessionToken: 'session-perf'
  }]);
  assert.equal(result.environment.variables.find((item) => item.key === 'AWS_SESSION_TOKEN').value, 'session-perf');
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
    const failedByStatus = result.samples.filter((sample) => (
      (Number(sample.statusCode || 0) >= 400 || Number(sample.statusCode || 0) <= 0 || sample.error)
      && !isUnsupportedDiagnosisProbe(sample)
    )).length;
    assert.equal(result.failedRequests, failedByStatus);
    assert.equal(result.successfulRequests, result.completedRequests - failedByStatus);
    assert.equal(findDiagnosisCheck(diagnosis, 'http_status_distribution').status, 'fail');
    assert.equal(findDiagnosisCheck(diagnosis, 'sensitive_data_in_url').status, 'warn');
    assert.ok(['high', 'medium', 'low'].includes(diagnosis.confidence));
  } finally {
    await server.close();
  }
});

test('full endpoint diagnosis treats unsupported OPTIONS probes as diagnostic-only samples', async () => {
  const server = await createOptionsUnsupportedDiagnosticServer();
  try {
    const performanceTest = performanceTestModel({
      id: 'perf-diagnosis-options-unsupported',
      name: 'Unsupported Options Diagnosis',
      type: 'diagnosis',
      request: {
        id: 'request-diagnosis-options-unsupported',
        name: 'Unsupported Options Endpoint',
        method: 'GET',
        url: `${server.baseUrl}/unsupported-options`
      },
      safetyLimits: { maxTotalRequests: 12, maxConcurrency: 4, maxDurationSeconds: 10 }
    });

    const result = await runPerformanceTest(performanceTest, null);
    const diagnosis = result.summary.diagnosis;
    const optionsSample = result.samples.find((sample) => sample.phase === 'options-probe');
    const optionsPhase = diagnosis.phases.find((phase) => phase.phase === 'options-probe');

    assert.equal(result.completedRequests, 44);
    assert.equal(result.successfulRequests, 44);
    assert.equal(result.failedRequests, 0);
    assert.equal(result.passed, true);
    assert.equal(optionsSample.statusCode, 405);
    assert.equal(optionsSample.passed, true);
    assert.equal(optionsPhase.successfulResponses, 1);
    assert.equal(optionsPhase.failedResponses, 0);
    assert.equal(findDiagnosisCheck(diagnosis, 'options_probe').status, 'not_available');
    assert.equal(findDiagnosisCheck(diagnosis, 'http_status_distribution').status, 'pass');
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

test('counts HTTP 4xx and 5xx performance responses as failed samples', async () => {
  const statuses = [200, 429, 500];
  const performanceTest = performanceTestModel({
    id: 'perf-http-failures',
    name: 'HTTP Failure Accounting',
    type: 'latency',
    request: {
      id: 'request-http-failures',
      name: 'HTTP Failure Request',
      method: 'GET',
      url: 'https://api.example.test/failures'
    },
    config: { iterations: statuses.length, concurrency: 1 },
    safetyLimits: { maxTotalRequests: statuses.length, maxConcurrency: 1, maxDurationSeconds: 10 }
  });
  let index = 0;

  const result = await runPerformanceTest(performanceTest, null, {
    sendRequest: async () => ({
      ...response(),
      statusCode: statuses[index++],
      body: '{}'
    })
  });

  assert.equal(result.completedRequests, 3);
  assert.equal(result.successfulRequests, 1);
  assert.equal(result.failedRequests, 2);
  assert.equal(result.passed, false);
  assert.deepEqual(result.samples.map((sample) => sample.passed), [true, false, false]);
  assert.deepEqual(result.summary.statusCodes, { 200: 1, 429: 1, 500: 1 });
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
    assert.equal(options.agent.maxTotalSockets, Infinity);
  }
});

test('performance node transport follows redirects across origins when concurrency is capped at one', async () => {
  const targetServer = await createRedirectTargetServer();
  const redirectServer = await createRedirectServer(`${targetServer.baseUrl}/final`);
  try {
    const progress = [];
    const performanceTest = performanceTestModel({
      id: 'perf-cross-origin-redirect',
      name: 'Cross-Origin Redirect',
      type: 'latency',
      request: {
        id: 'request-cross-origin-redirect',
        name: 'Cross-Origin Redirect Request',
        method: 'GET',
        url: `${redirectServer.baseUrl}/start`
      },
      config: { iterations: 1, concurrency: 1 },
      safetyLimits: { maxTotalRequests: 1, maxConcurrency: 1, maxDurationSeconds: 10 }
    });

    const result = await Promise.race([
      runPerformanceTest(performanceTest, null, {
        onProgress: (event) => progress.push(event),
        requestTimeoutMillis: 500
      }),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('Timed out waiting for redirected performance request.')),
        2500
      ))
    ]);

    assert.equal(result.completedRequests, 1);
    assert.equal(result.successfulRequests, 1);
    assert.equal(result.failedRequests, 0);
    assert.equal(result.samples[0].statusCode, 200);
    assert.equal(result.samples[0].finalUrl, `${targetServer.baseUrl}/final`);
    assert.deepEqual(progress.map((event) => event.completedRequests), [1]);
  } finally {
    await redirectServer.close();
    await targetServer.close();
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

function response(statusCode = 200, body = '{}') {
  return {
    statusCode,
    headers: {},
    body,
    durationMillis: 1,
    responseBytes: Buffer.byteLength(body),
    finalUrl: 'https://api.example.test'
  };
}

function authForType(type) {
  switch (type) {
    case 'none':
      return { type: 'none' };
    case 'bearer':
      return { type, token: '{{ACCESS_TOKEN}}' };
    case 'basic':
      return { type, username: 'perf-user', password: '{{ACCESS_TOKEN}}' };
    case 'apiKey':
      return { type, location: 'header', key: 'X-API-Key', value: '{{ACCESS_TOKEN}}' };
    case 'cookie':
      return { type, value: 'sid={{ACCESS_TOKEN}}' };
    case 'oauth2':
      return { type, accessToken: '{{ACCESS_TOKEN}}', tokenType: 'Bearer' };
    case 'clientCertificate':
      return { type, certificateId: 'cert-1' };
    case 'digest':
      return { type, username: 'perf-user', password: '{{ACCESS_TOKEN}}' };
    case 'hawk':
      return { type, authId: 'hawk-id', authKey: '{{ACCESS_TOKEN}}', nonce: 'nonce', algorithm: 'sha256' };
    case 'aws':
      return { type, accessKey: 'AKIDEXAMPLE', secretKey: '{{ACCESS_TOKEN}}', region: 'us-east-1', service: 'execute-api' };
    case 'oauth1':
      return { type, consumerKey: 'consumer', consumerSecret: '{{ACCESS_TOKEN}}', token: 'token', tokenSecret: 'token-secret' };
    case 'ntlm':
      return { type, username: 'perf-user', password: '{{ACCESS_TOKEN}}', domain: 'POSTMETER', workstation: 'WORKSTATION' };
    case 'akamaiEdgeGrid':
      return { type, accessToken: '{{ACCESS_TOKEN}}', clientToken: 'client', clientSecret: 'secret', nonce: 'nonce' };
    case 'jwtBearer':
      return { type, algorithm: 'HS256', secret: '{{ACCESS_TOKEN}}', issuer: 'issuer', audience: 'audience' };
    case 'asap':
      return { type, algorithm: 'HS256', secret: '{{ACCESS_TOKEN}}', issuer: 'issuer', audience: 'audience' };
    default:
      throw new Error(`Unhandled auth type in performance refresh matrix: ${type}`);
  }
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

async function createOptionsUnsupportedDiagnosticServer() {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'max-age=60');
    response.setHeader('ETag', '"options-unsupported-test"');
    response.setHeader('Server-Timing', 'app;dur=3');
    response.setHeader('X-Request-ID', 'options-unsupported-request');
    response.setHeader('RateLimit-Limit', '100');
    response.setHeader('RateLimit-Remaining', '99');
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'HEAD') {
      response.statusCode = 200;
      response.end();
      return;
    }
    if (request.method === 'OPTIONS') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end();
      return;
    }
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true, method: request.method }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function createRedirectServer(location) {
  const sockets = new Set();
  const server = http.createServer((_request, response) => {
    response.statusCode = 301;
    response.setHeader('Location', location);
    response.end('redirect');
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server, sockets)
  };
}

async function createRedirectTargetServer() {
  const sockets = new Set();
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true }));
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server, sockets)
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
    close: () => closeServer(server, sockets)
  };
}

async function createCookieBackedAuthServer() {
  let accessRequests = 0;
  let resourceRequests = 0;
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/auth/access')) {
      accessRequests += 1;
      response.setHeader('Content-Type', 'application/json');
      if (!String(request.headers.cookie || '').includes('refresh_token=refresh-ok')) {
        response.statusCode = 401;
        response.end(JSON.stringify({ error: 'missing_refresh_cookie' }));
        return;
      }
      response.statusCode = 200;
      response.setHeader('Set-Cookie', 'access_token=fresh-cookie-access; Path=/; HttpOnly');
      response.end(JSON.stringify({
        timestamp: '15-05-2026 06:22:26',
        jwtToken: 'fresh-cookie-access'
      }));
      return;
    }

    if (request.url.startsWith('/api/auth/user/search-users')) {
      resourceRequests += 1;
      response.setHeader('Content-Type', 'application/json');
      if (request.headers.authorization !== 'Bearer fresh-cookie-access') {
        response.statusCode = 401;
        response.end(JSON.stringify({ error: 'missing_access_token' }));
        return;
      }
      response.statusCode = 200;
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  const address = server.address();
  return {
    accessRequests: () => accessRequests,
    baseUrl: `http://localhost:${address.port}`,
    close: () => closeServer(server, sockets),
    resourceRequests: () => resourceRequests
  };
}

function closeServer(server, sockets = new Set()) {
  return new Promise((resolve, reject) => {
    for (const socket of sockets) {
      socket.destroy();
    }
    server.close((error) => error ? reject(error) : resolve());
  });
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

function isUnsupportedDiagnosisProbe(sample = {}) {
  const statusCode = Number(sample.statusCode || 0);
  return (sample.phase === 'head-probe' || sample.phase === 'options-probe')
    && (statusCode === 405 || statusCode === 501);
}
