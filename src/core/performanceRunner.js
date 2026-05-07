const crypto = require('node:crypto');
const { runRunner } = require('./collectionRunner');
const {
  performanceTestModel
} = require('./models');
const {
  assertPerformanceTestPayload
} = require('./ipcValidation');

async function runPerformanceTest(performanceTest, environment, options = {}) {
  const normalized = performanceTestModel(performanceTest);
  assertPerformanceTestPayload(normalized);
  const plan = createPerformancePlan(normalized);
  const startedAt = new Date().toISOString();
  const startedMillis = Date.now();
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const samples = [];
  let currentEnvironment = cloneJson(environment) || { id: 'runtime', name: 'Runtime', variables: [] };
  let currentCookies = Array.isArray(options.cookieJar) ? cloneJson(options.cookieJar) : [];
  let nextIteration = 0;
  let activeRequests = 0;

  const workerCount = Math.min(plan.concurrency, plan.totalRequests);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (options.signal?.aborted === true) {
        return;
      }
      const iteration = nextIteration;
      nextIteration += 1;
      if (iteration >= plan.totalRequests) {
        return;
      }
      activeRequests += 1;
      const sample = await executeIteration(normalized, currentEnvironment, currentCookies, iteration, options);
      activeRequests -= 1;
      samples.push(sample.publicSample);
      if (sample.environment) {
        currentEnvironment = sample.environment;
      }
      if (Array.isArray(sample.cookies)) {
        currentCookies = sample.cookies;
      }
      progress({
        completedRequests: samples.length,
        totalRequests: plan.totalRequests,
        activeRequests,
        requestId: normalized.request.id,
        requestName: normalized.request.name,
        passed: sample.publicSample.passed === true,
        durationMillis: sample.publicSample.durationMillis || 0
      });
    }
  });

  await Promise.all(workers);
  const completedAt = new Date().toISOString();
  const summary = summarizeSamples(samples, Date.now() - startedMillis);
  const failedRequests = samples.filter((sample) => sample.passed !== true).length;
  const result = {
    id: cryptoRandomId(),
    performanceTestId: normalized.id,
    performanceTestName: normalized.name,
    type: normalized.type,
    environmentId: normalized.environmentId,
    environmentMutationAllowed: normalized.allowEnvironmentMutation === true,
    totalRequests: plan.totalRequests,
    completedRequests: samples.length,
    successfulRequests: samples.length - failedRequests,
    failedRequests,
    passed: failedRequests === 0 && options.signal?.aborted !== true,
    cancelled: options.signal?.aborted === true,
    startedAt,
    completedAt,
    durationMillis: Date.now() - startedMillis,
    config: normalized.config,
    safetyLimits: normalized.safetyLimits,
    summary,
    samples: samples.sort((left, right) => left.iteration - right.iteration),
    environment: currentEnvironment,
    cookies: currentCookies
  };
  if (normalized.allowEnvironmentMutation === true) {
    result.mutatedEnvironment = currentEnvironment;
  }
  return result;
}

async function executeIteration(performanceTest, environment, cookies, iteration, options) {
  const startedAt = new Date().toISOString();
  const runner = {
    id: `${performanceTest.id}:iteration:${iteration + 1}`,
    name: performanceTest.name,
    environmentId: performanceTest.environmentId,
    allowEnvironmentMutation: performanceTest.allowEnvironmentMutation,
    stopOnFailure: false,
    requests: [cloneJson(performanceTest.request)]
  };
  try {
    const result = await runRunner(runner, cloneJson(environment), {
      ...runnerOptions(options),
      allowEnvironmentMutation: performanceTest.allowEnvironmentMutation,
      cookieJar: cloneJson(cookies),
      signal: options.signal
    });
    const requestResult = result.results?.[0] || {};
    return {
      environment: result.environment,
      cookies: result.cookies,
      publicSample: {
        iteration: iteration + 1,
        startedAt,
        requestId: performanceTest.request.id,
        requestName: performanceTest.request.name,
        statusCode: Number(requestResult.statusCode || 0),
        durationMillis: Number(requestResult.durationMillis || 0),
        responseBody: requestResult.responseBody || '',
        responseBytes: Number(requestResult.responseBytes || 0),
        passed: requestResult.passed === true,
        error: requestResult.error || '',
        assertionResults: Array.isArray(requestResult.assertionResults) ? requestResult.assertionResults : [],
        preRequestScriptResult: requestResult.preRequestScriptResult,
        testScriptResult: requestResult.testScriptResult,
        extractedVariables: Array.isArray(requestResult.extractedVariables) ? requestResult.extractedVariables : [],
        localVariables: Array.isArray(requestResult.localVariables) ? requestResult.localVariables : []
      }
    };
  } catch (error) {
    return {
      environment,
      cookies,
      publicSample: {
        iteration: iteration + 1,
        startedAt,
        requestId: performanceTest.request.id,
        requestName: performanceTest.request.name,
        statusCode: 0,
        durationMillis: 0,
        responseBody: '',
        responseBytes: 0,
        passed: false,
        error: error.message || String(error),
        assertionResults: [],
        preRequestScriptResult: undefined,
        testScriptResult: undefined,
        extractedVariables: [],
        localVariables: []
      }
    };
  }
}

function runnerOptions(options) {
  const {
    abortController,
    onProgress,
    ...rest
  } = options || {};
  return rest;
}

function createPerformancePlan(performanceTest) {
  const config = performanceTest.config || {};
  const safetyLimits = performanceTest.safetyLimits || {};
  const totalRequests = Math.min(config.iterations || 1, safetyLimits.maxTotalRequests || 1);
  const baseConcurrency = performanceTest.type === 'spike'
    ? (config.concurrency || 1) * (config.spikeMultiplier || 1)
    : config.concurrency || 1;
  return {
    totalRequests,
    concurrency: Math.min(totalRequests, baseConcurrency, safetyLimits.maxConcurrency || 1)
  };
}

function summarizeSamples(samples, wallClockMillis) {
  const durations = samples
    .map((sample) => Number(sample.durationMillis || 0))
    .filter((duration) => Number.isFinite(duration))
    .sort((left, right) => left - right);
  const statusCodes = {};
  const errors = {};
  for (const sample of samples) {
    const statusCode = String(sample.statusCode || 0);
    statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
    if (sample.error) {
      errors[sample.error] = (errors[sample.error] || 0) + 1;
    }
  }
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  return {
    minDurationMillis: durations[0] || 0,
    maxDurationMillis: durations.at(-1) || 0,
    averageDurationMillis: durations.length ? totalDuration / durations.length : 0,
    p50DurationMillis: percentile(durations, 0.5),
    p90DurationMillis: percentile(durations, 0.9),
    p95DurationMillis: percentile(durations, 0.95),
    p99DurationMillis: percentile(durations, 0.99),
    requestsPerSecond: wallClockMillis > 0 ? samples.length / (wallClockMillis / 1000) : 0,
    statusCodes,
    errors
  };
}

function percentile(values, rank) {
  if (!values.length) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * rank) - 1));
  return values[index];
}

function cloneJson(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function cryptoRandomId() {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `performance-result-${Date.now()}`;
}

module.exports = {
  createPerformancePlan,
  runPerformanceTest,
  summarizeSamples
};
