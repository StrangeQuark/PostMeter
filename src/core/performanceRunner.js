const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { csvVariableIterationRows, runRunner } = require('./collectionRunner');
const { csvVariablesEnabled } = require('./csvVariables');
const { buildUrl, sendRequest } = require('./httpClient');
const {
  performanceTestModel
} = require('./models');
const { normalizeCapturePolicy } = require('./resultCapturePolicy');
const {
  assertPerformanceTestPayload
} = require('./ipcValidation');
const {
  DIAGNOSIS_TYPE,
  buildDiagnosisStages,
  diagnosisEffectiveConcurrency,
  diagnosisPlannedRequestCount,
  summarizeEndpointDiagnosis
} = require('./performanceDiagnosis');

const DEFAULT_PERFORMANCE_REQUEST_TIMEOUT_MILLIS = 10000;
const MAX_PERFORMANCE_REQUEST_TIMEOUT_MILLIS = 3 * 60 * 1000;

async function runPerformanceTest(performanceTest, environment, options = {}) {
  const normalized = performanceTestModel(performanceTest);
  assertPerformanceTestPayload(normalized);
  const plan = createPerformancePlan(normalized);
  const capturePolicy = normalizeCapturePolicy(normalized.capturePolicy, 'performance', {
    diagnostic: normalized.type === DIAGNOSIS_TYPE,
    plannedRequests: plan.totalRequests
  });
  const startedAt = new Date().toISOString();
  const startedMillis = Date.now();
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const samples = [];
  const summaryTracker = createPerformanceSummaryTracker();
  const diagnosisSummarySamples = normalized.type === DIAGNOSIS_TYPE ? [] : null;
  const retainSamples = options.retainSamples !== false;
  const resultWriter = typeof options.resultWriter?.recordPerformanceSample === 'function' ? options.resultWriter : null;
  const useCsvVariables = csvVariablesEnabled(normalized.csvVariables);
  const iterationRows = await csvVariableIterationRows(normalized.csvVariables, plan.totalRequests);
  let currentEnvironment = cloneJson(environment) || { id: 'runtime', name: 'Runtime', variables: [] };
  let currentCookies = Array.isArray(options.cookieJar) ? cloneJson(options.cookieJar) : [];
  let nextIteration = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const endsAtMillis = plan.durationMillis > 0 ? startedMillis + plan.durationMillis : 0;
  const performanceContext = createPerformanceRunContext(normalized, plan);
  const diagnosisContext = normalized.type === DIAGNOSIS_TYPE ? performanceContext : null;
  const eventLoopMonitor = diagnosisContext ? monitorEventLoopDelay({ resolution: 20 }) : null;
  const memoryStarted = diagnosisContext ? process.memoryUsage().heapUsed : 0;
  const requestTimeoutMillis = normalizePerformanceRequestTimeoutMillis(options.requestTimeoutMillis);
  const collectTransportTimings = normalized.type === DIAGNOSIS_TYPE || capturePolicy.transportTimings === true;
  eventLoopMonitor?.enable();

  try {
    for (const [stageIndex, stage] of plan.stages.entries()) {
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
          const scheduledAtMillis = Date.now();
          activeRequests += 1;
          maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
          const sample = await executeIteration(normalized, currentEnvironment, currentCookies, iteration, {
            ...options,
            collectTransportTimings,
            diagnosisContext,
            performanceContext,
            requestTimeoutMillis,
            iterationData: useCsvVariables ? (iterationRows[iteration] || []) : (options.iterationData || [])
          }, {
            stage,
            stageIndex: stageIndex + 1,
            scheduledAtMillis
          });
          activeRequests -= 1;
          const sampleIndex = summaryTracker.count;
          summaryTracker.record(sample.publicSample);
          if (diagnosisSummarySamples) {
            diagnosisSummarySamples.push(summarySampleForPerformance(sample.publicSample));
          }
          if (retainSamples) {
            samples.push(sample.publicSample);
          }
          if (resultWriter) {
            await resultWriter.recordPerformanceSample(sample.publicSample, {
              index: sampleIndex,
              totalRequests: plan.totalRequests
            });
          }
          if (sample.environment) {
            currentEnvironment = sample.environment;
          }
          if (Array.isArray(sample.cookies)) {
            currentCookies = sample.cookies;
          }
          progress({
            completedRequests: summaryTracker.count,
            totalRequests: plan.totalRequests,
            activeRequests,
            phase: stage.phase || stage.name,
            stageIndex: stageIndex + 1,
            stageCount: plan.stages.length,
            requestId: normalized.request.id,
            requestName: normalized.request.name,
            passed: sample.publicSample.passed === true,
            durationMillis: sample.publicSample.durationMillis || 0
          });
        }
      });
      await Promise.all(workers);
    }
  } finally {
    eventLoopMonitor?.disable();
    performanceContext?.destroy?.();
  }
  const completedAt = new Date().toISOString();
  const summary = summaryTracker.summarize(Date.now() - startedMillis);
  if (diagnosisContext) {
    const summarySamples = diagnosisSummarySamples || [];
    summary.diagnosis = summarizeEndpointDiagnosis(summarySamples, {
      cancelled: options.signal?.aborted === true,
      config: normalized.config,
      csvVariablesEnabled: useCsvVariables,
      eventLoopDelayMillis: eventLoopMonitor ? Math.round(eventLoopMonitor.percentile(95) / 1000000) : 0,
      maxActiveRequests,
      maxConcurrency: plan.concurrency,
      memoryDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - memoryStarted),
      plannedRequests: plan.totalRequests,
      request: normalized.request,
      safetyLimited: summaryTracker.count < plan.totalRequests,
      safetyLimits: normalized.safetyLimits
    });
  }
  const failedRequests = summaryTracker.failedRequests;
  const result = {
    id: cryptoRandomId(),
    performanceTestId: normalized.id,
    performanceTestName: normalized.name,
    type: normalized.type,
    environmentId: normalized.environmentId,
    environmentMutationAllowed: normalized.allowEnvironmentMutation === true,
    totalRequests: plan.totalRequests,
    completedRequests: summaryTracker.count,
    successfulRequests: summaryTracker.count - failedRequests,
    failedRequests,
    passed: failedRequests === 0 && options.signal?.aborted !== true,
    cancelled: options.signal?.aborted === true,
    startedAt,
    completedAt,
    durationMillis: Date.now() - startedMillis,
    config: normalized.config,
    safetyLimits: normalized.safetyLimits,
    summary,
    samples: retainSamples ? samples.sort((left, right) => left.iteration - right.iteration) : [],
    environment: currentEnvironment,
    cookies: currentCookies
  };
  if (normalized.allowEnvironmentMutation === true) {
    result.mutatedEnvironment = currentEnvironment;
  }
  return result;
}

async function executeIteration(performanceTest, environment, cookies, iteration, options, execution = {}) {
  const startedAt = new Date().toISOString();
  const startedMillis = Date.now();
  const stage = execution.stage || {};
  const request = requestForPerformanceStage(performanceTest.request, stage);
  const runner = {
    id: `${performanceTest.id}:iteration:${iteration + 1}`,
    name: performanceTest.name,
    environmentId: performanceTest.environmentId,
    allowEnvironmentMutation: performanceTest.allowEnvironmentMutation,
    stopOnFailure: false,
    requests: [request]
  };
  try {
    const result = await runRunner(runner, cloneJson(environment), {
      ...runnerOptions(options),
      allowEnvironmentMutation: performanceTest.allowEnvironmentMutation,
      cookieJar: cloneJson(cookies),
      includeTransportDiagnostics: options.collectTransportTimings === true || performanceTest.type === DIAGNOSIS_TYPE,
      sendRequest: performanceSendRequestForStage(options, stage),
      signal: options.signal
    });
    const requestResult = result.results?.[0] || {};
    const statusCode = Number(requestResult.statusCode || 0);
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
        finalUrl: requestResult.finalUrl || requestResult.requestUrl || '',
        phase: stage.phase || stage.name || performanceTest.type,
        stageName: stage.name || performanceTest.type,
        stageIndex: execution.stageIndex || 0,
        stageConcurrency: stage.concurrency || 1,
        statusCode,
        durationMillis: Number(requestResult.durationMillis || 0),
        schedulerLagMillis: Math.max(0, Date.now() - Number(execution.scheduledAtMillis || Date.now())),
        responseBody: requestResult.responseBody || '',
        responseBytes: Number(requestResult.responseBytes || 0),
        responseHeaders: requestResult.responseHeaders || {},
        timings: requestResult.timings || {},
        passed: performanceSamplePassed(requestResult, statusCode, performanceTest, stage),
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
        finalUrl: '',
        phase: stage.phase || stage.name || performanceTest.type,
        stageName: stage.name || performanceTest.type,
        stageIndex: execution.stageIndex || 0,
        stageConcurrency: stage.concurrency || 1,
        statusCode: 0,
        durationMillis: Math.max(0, Date.now() - startedMillis),
        schedulerLagMillis: Math.max(0, Date.now() - Number(execution.scheduledAtMillis || Date.now())),
        responseBody: '',
        responseBytes: 0,
        responseHeaders: {},
        timings: {},
        passed: false,
        error: error.message || String(error),
        preRequestScriptResult: undefined,
        testScriptResult: undefined,
        localVariables: []
      }
    };
  }
}

function performanceSamplePassed(requestResult = {}, statusCode = Number(requestResult.statusCode || 0), performanceTest = {}, stage = {}) {
  return requestResult.passed === true
    && (isPerformanceHttpSuccess(statusCode) || isUnsupportedDiagnosisMethodProbe(statusCode, performanceTest, stage));
}

function isPerformanceHttpSuccess(statusCode) {
  const code = Number(statusCode || 0);
  return Number.isInteger(code) && code >= 200 && code < 400;
}

function isUnsupportedDiagnosisMethodProbe(statusCode, performanceTest = {}, stage = {}) {
  const code = Number(statusCode || 0);
  return performanceTest.type === DIAGNOSIS_TYPE
    && (stage.phase === 'head-probe' || stage.phase === 'options-probe')
    && (code === 405 || code === 501);
}

function runnerOptions(options) {
  const {
    abortController,
    diagnosisContext,
    onProgress,
    performanceContext,
    collectTransportTimings,
    requestTimeoutMillis,
    resultWriter,
    retainSamples,
    ...rest
  } = options || {};
  return rest;
}

function summarySampleForPerformance(sample = {}) {
  return {
    iteration: sample.iteration,
    startedAt: sample.startedAt,
    requestId: sample.requestId,
    requestName: sample.requestName,
    requestDisplayName: sample.requestDisplayName,
    requestMethod: sample.requestMethod,
    requestUrl: sample.requestUrl,
    finalUrl: sample.finalUrl,
    phase: sample.phase,
    stageName: sample.stageName,
    stageIndex: sample.stageIndex,
    stageConcurrency: sample.stageConcurrency,
    statusCode: sample.statusCode,
    durationMillis: sample.durationMillis,
    schedulerLagMillis: sample.schedulerLagMillis,
    responseBody: sample.responseBody,
    responseBytes: sample.responseBytes,
    responseHeaders: sample.responseHeaders,
    timings: sample.timings,
    passed: sample.passed,
    error: sample.error
  };
}

function requestForPerformanceStage(request, stage = {}) {
  const nextRequest = cloneJson(request) || {};
  if (stage.methodOverride) {
    nextRequest.method = stage.methodOverride;
    nextRequest.bodyType = 'NONE';
    nextRequest.body = '';
    nextRequest.postmanBody = {};
    nextRequest.graphql = {};
  }
  return nextRequest;
}

function performanceSendRequestForStage(options = {}, stage = {}) {
  const context = options.performanceContext || options.diagnosisContext;
  if (!context) {
    return options.sendRequest;
  }
  const baseSendRequest = options.sendRequest || sendRequest;
  return async (request, environment, sendOptions = {}) => {
    const agent = stage.coldConnection === true ? false : context.agentFor(request, environment);
    return baseSendRequest(request, environment, {
      ...sendOptions,
      collectTimings: options.collectTransportTimings === true,
      forceNode: true,
      timeoutMillis: options.requestTimeoutMillis,
      agent
    });
  };
}

function createPerformanceRunContext(performanceTest, plan = {}) {
  const maxSockets = Math.max(1, Math.min(
    integerAtLeast(plan.concurrency, 1, 1),
    integerAtLeast(performanceTest.safetyLimits?.maxConcurrency, 1, 10)
  ));
  const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets,
    maxFreeSockets: Math.min(16, maxSockets)
  });
  const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets,
    maxFreeSockets: Math.min(16, maxSockets)
  });
  return {
    agentFor(request, environment) {
      try {
        const url = buildUrl(request, environment);
        return url.protocol === 'https:' ? httpsAgent : httpAgent;
      } catch {
        return httpAgent;
      }
    },
    destroy() {
      httpAgent.destroy();
      httpsAgent.destroy();
    }
  };
}

function normalizePerformanceRequestTimeoutMillis(value) {
  const number = Number(value == null ? DEFAULT_PERFORMANCE_REQUEST_TIMEOUT_MILLIS : value);
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_PERFORMANCE_REQUEST_TIMEOUT_MILLIS;
  }
  return Math.max(1, Math.min(MAX_PERFORMANCE_REQUEST_TIMEOUT_MILLIS, Math.floor(number)));
}

function createPerformancePlan(performanceTest) {
  const type = performanceTest.type || 'latency';
  const config = performanceTest.config || {};
  const safetyLimits = performanceTest.safetyLimits || {};
  if (type === DIAGNOSIS_TYPE) {
    const stages = buildDiagnosisStages(config, safetyLimits);
    const totalRequests = stages.reduce((total, stage) => total + stage.totalRequests, 0);
    const maxDurationSeconds = integerAtLeast(safetyLimits.maxDurationSeconds, 0, 0);
    return {
      totalRequests,
      concurrency: Math.min(totalRequests, diagnosisEffectiveConcurrency(config, safetyLimits)),
      durationMillis: maxDurationSeconds > 0 ? maxDurationSeconds * 1000 : 0,
      stages
    };
  }
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
  if (type === DIAGNOSIS_TYPE) {
    return buildDiagnosisStages(config, { maxTotalRequests: plan.totalRequests, maxConcurrency: plan.maxConcurrency });
  }
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
  if (type === DIAGNOSIS_TYPE) {
    return diagnosisPlannedRequestCount(config, safetyLimits);
  }
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
  if (type === DIAGNOSIS_TYPE) {
    return diagnosisEffectiveConcurrency(config, { maxConcurrency: 25 });
  }
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

function createPerformanceSummaryTracker() {
  const durations = [];
  const statusCodes = {};
  const errors = {};
  let completedRequests = 0;
  let failedRequests = 0;
  return {
    get count() {
      return completedRequests;
    },
    get failedRequests() {
      return failedRequests;
    },
    record(sample = {}) {
      completedRequests += 1;
      if (sample.passed !== true) {
        failedRequests += 1;
      }
      const duration = Number(sample.durationMillis || 0);
      if (Number.isFinite(duration)) {
        durations.push(duration);
      }
      const statusCode = String(sample.statusCode || 0);
      statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
      if (sample.error) {
        errors[sample.error] = (errors[sample.error] || 0) + 1;
      }
    },
    summarize(wallClockMillis) {
      const sortedDurations = durations.slice().sort((left, right) => left - right);
      const totalDuration = sortedDurations.reduce((sum, duration) => sum + duration, 0);
      return {
        minDurationMillis: sortedDurations[0] || 0,
        maxDurationMillis: sortedDurations.at(-1) || 0,
        averageDurationMillis: sortedDurations.length ? totalDuration / sortedDurations.length : 0,
        p50DurationMillis: percentile(sortedDurations, 0.5),
        p90DurationMillis: percentile(sortedDurations, 0.9),
        p95DurationMillis: percentile(sortedDurations, 0.95),
        p99DurationMillis: percentile(sortedDurations, 0.99),
        requestsPerSecond: wallClockMillis > 0 ? completedRequests / (wallClockMillis / 1000) : 0,
        statusCodes: { ...statusCodes },
        errors: { ...errors }
      };
    }
  };
}

function summarizeSamples(samples, wallClockMillis) {
  const tracker = createPerformanceSummaryTracker();
  for (const sample of samples) {
    tracker.record(sample);
  }
  return tracker.summarize(wallClockMillis);
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
