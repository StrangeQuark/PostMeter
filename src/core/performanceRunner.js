const crypto = require('node:crypto');
const { csvVariableIterationRows, runRunner } = require('./collectionRunner');
const { csvVariablesEnabled } = require('./csvVariables');
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
  const useCsvVariables = csvVariablesEnabled(normalized.csvVariables);
  const iterationRows = await csvVariableIterationRows(normalized.csvVariables, plan.totalRequests);
  let currentEnvironment = cloneJson(environment) || { id: 'runtime', name: 'Runtime', variables: [] };
  let currentCookies = Array.isArray(options.cookieJar) ? cloneJson(options.cookieJar) : [];
  let nextIteration = 0;
  let activeRequests = 0;
  const endsAtMillis = plan.durationMillis > 0 ? startedMillis + plan.durationMillis : 0;

  for (const stage of plan.stages) {
    if (options.signal?.aborted === true || (endsAtMillis > 0 && Date.now() >= endsAtMillis)) {
      break;
    }
    let stageNextIteration = 0;
    const workerCount = Math.min(stage.concurrency, stage.totalRequests);
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        if (options.signal?.aborted === true) {
          return;
        }
        if (endsAtMillis > 0 && Date.now() >= endsAtMillis) {
          return;
        }
        const stageIteration = stageNextIteration;
        stageNextIteration += 1;
        if (stageIteration >= stage.totalRequests || nextIteration >= plan.totalRequests) {
          return;
        }
        const iteration = nextIteration;
        nextIteration += 1;
        activeRequests += 1;
        const sample = await executeIteration(normalized, currentEnvironment, currentCookies, iteration, {
          ...options,
          iterationData: useCsvVariables ? (iterationRows[iteration] || []) : (options.iterationData || [])
        });
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
  }
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
        requestDisplayName: requestResult.requestDisplayName || performanceTest.request.name,
        requestMethod: requestResult.requestMethod || performanceTest.request.method || '',
        requestUrl: requestResult.requestUrl || performanceTest.request.url || '',
        statusCode: Number(requestResult.statusCode || 0),
        durationMillis: Number(requestResult.durationMillis || 0),
        responseBody: requestResult.responseBody || '',
        responseBytes: Number(requestResult.responseBytes || 0),
        passed: requestResult.passed === true,
        error: requestResult.error || '',
        preRequestScriptResult: requestResult.preRequestScriptResult,
        testScriptResult: requestResult.testScriptResult,
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
        requestDisplayName: performanceTest.request.name,
        requestMethod: performanceTest.request.method || '',
        requestUrl: performanceTest.request.url || '',
        statusCode: 0,
        durationMillis: 0,
        responseBody: '',
        responseBytes: 0,
        passed: false,
        error: error.message || String(error),
        preRequestScriptResult: undefined,
        testScriptResult: undefined,
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
  const type = performanceTest.type || 'latency';
  const config = performanceTest.config || {};
  const safetyLimits = performanceTest.safetyLimits || {};
  const totalRequests = Math.min(
    plannedRequestCount(type, config, safetyLimits),
    integerAtLeast(safetyLimits.maxTotalRequests, 1, 1)
  );
  const baseConcurrency = plannedConcurrency(type, config);
  const maxDurationSeconds = integerAtLeast(safetyLimits.maxDurationSeconds, 0, 0);
  const requestedDurationSeconds = integerAtLeast(config.durationSeconds, 0, 0);
  const durationSeconds = requestedDurationSeconds > 0
    ? Math.min(requestedDurationSeconds, maxDurationSeconds)
    : maxDurationSeconds;
  return {
    totalRequests,
    concurrency: Math.min(totalRequests, baseConcurrency, integerAtLeast(safetyLimits.maxConcurrency, 1, 1)),
    durationMillis: durationSeconds > 0 ? durationSeconds * 1000 : 0,
    stages: buildPerformanceStages(type, config, {
      totalRequests,
      maxConcurrency: integerAtLeast(safetyLimits.maxConcurrency, 1, 1)
    })
  };
}

function buildPerformanceStages(type, config, plan) {
  if (type === 'stress' || type === 'ramp') {
    return buildSteppedStages(config, plan);
  }
  return [{
    name: type,
    totalRequests: plan.totalRequests,
    concurrency: Math.min(plan.totalRequests, plannedConcurrency(type, config), plan.maxConcurrency)
  }];
}

function buildSteppedStages(config, plan) {
  const requestedSteps = integerAtLeast(config.rampSteps, 1, 1);
  const requestsPerStep = integerAtLeast(config.iterations, 1, 1);
  const start = integerAtLeast(config.startConcurrency, 1, 1);
  const peak = integerAtLeast(config.concurrency, 1, 1);
  const stages = [];
  let remaining = plan.totalRequests;
  for (let index = 0; index < requestedSteps && remaining > 0; index += 1) {
    const totalRequests = Math.min(requestsPerStep, remaining);
    const progress = requestedSteps <= 1 ? 1 : index / (requestedSteps - 1);
    const stageConcurrency = Math.round(start + ((peak - start) * progress));
    stages.push({
      name: `step-${index + 1}`,
      totalRequests,
      concurrency: Math.min(totalRequests, Math.max(1, stageConcurrency), plan.maxConcurrency)
    });
    remaining -= totalRequests;
  }
  return stages;
}

function plannedRequestCount(type, config, safetyLimits) {
  if (type === 'soak') {
    return integerAtLeast(safetyLimits.maxTotalRequests, 1, 1);
  }
  if (type === 'concurrency') {
    return integerAtLeast(config.iterations, 1, 1) * integerAtLeast(config.concurrency, 1, 1);
  }
  if (type === 'stress' || type === 'ramp') {
    return integerAtLeast(config.iterations, 1, 1) * integerAtLeast(config.rampSteps, 1, 1);
  }
  return integerAtLeast(config.iterations, 1, 1);
}

function plannedConcurrency(type, config) {
  if (type === 'latency') {
    return 1;
  }
  if (type === 'spike') {
    return integerAtLeast(config.concurrency, 1, 1) * integerAtLeast(config.spikeMultiplier, 1, 1);
  }
  if (type === 'stress' || type === 'ramp') {
    return Math.max(
      integerAtLeast(config.startConcurrency, 1, 1),
      integerAtLeast(config.concurrency, 1, 1)
    );
  }
  return integerAtLeast(config.concurrency, 1, 1);
}

function integerAtLeast(value, min, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= min ? Math.floor(number) : fallback;
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
