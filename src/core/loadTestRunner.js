const { fork } = require('node:child_process');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { buildUrl, sendRequest } = require('./httpClient');

const MAX_CONCURRENCY = 512;
const MAX_TOTAL_REQUESTS = 100_000;
const MAX_DURATION_SECONDS = 60 * 60;
const MAX_RAMP_UP_SECONDS = 60 * 60;
const MAX_RECORDED_SAMPLES = 50_000;
const HIGH_CONCURRENCY_THRESHOLD = 50;
const MAX_ALLOWED_HOSTS = 100;
const MAX_TARGET_RATE_PER_SECOND = 10_000;
const MAX_WORKER_PROCESSES = 8;
const MAX_MULTIPROCESS_AGGREGATED_SAMPLES = MAX_TOTAL_REQUESTS;
const LOAD_EXECUTION_MODES = ['singleProcess', 'multiProcess'];
const HISTOGRAM_BUCKETS_MILLIS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

function validateLoadConfig(config, request, environment) {
  const concurrency = Number(config?.concurrency);
  const totalRequests = Number(config?.totalRequests);
  const durationSeconds = Number(config?.durationSeconds || 0);
  const rampUpSeconds = Number(config?.rampUpSeconds || 0);
  const targetRatePerSecond = Number(config?.targetRatePerSecond || 0);
  const executionMode = config?.executionMode == null ? 'singleProcess' : String(config.executionMode);
  const workerProcesses = config?.workerProcesses == null ? 1 : Number(config.workerProcesses);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`Concurrency must be between 1 and ${MAX_CONCURRENCY}.`);
  }
  if (!Number.isInteger(totalRequests) || totalRequests < 1 || totalRequests > MAX_TOTAL_REQUESTS) {
    throw new Error(`Total requests must be between 1 and ${MAX_TOTAL_REQUESTS}.`);
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(`Duration must be between 0 and ${MAX_DURATION_SECONDS} seconds.`);
  }
  if (!Number.isFinite(rampUpSeconds) || rampUpSeconds < 0 || rampUpSeconds > MAX_RAMP_UP_SECONDS) {
    throw new Error(`Ramp-up must be between 0 and ${MAX_RAMP_UP_SECONDS} seconds.`);
  }
  if (!Number.isFinite(targetRatePerSecond) || targetRatePerSecond < 0 || targetRatePerSecond > MAX_TARGET_RATE_PER_SECOND) {
    throw new Error(`Target rate must be between 0 and ${MAX_TARGET_RATE_PER_SECOND} requests per second.`);
  }
  if (!LOAD_EXECUTION_MODES.includes(executionMode)) {
    throw new Error(`Execution mode must be one of: ${LOAD_EXECUTION_MODES.join(', ')}.`);
  }
  if (!Number.isInteger(workerProcesses) || workerProcesses < 1 || workerProcesses > MAX_WORKER_PROCESSES) {
    throw new Error(`Worker processes must be between 1 and ${MAX_WORKER_PROCESSES}.`);
  }
  if (concurrency >= HIGH_CONCURRENCY_THRESHOLD && config?.confirmedHighConcurrency !== true) {
    throw new Error(`Load tests with concurrency ${HIGH_CONCURRENCY_THRESHOLD} or higher require confirmation.`);
  }
  const allowedHosts = normalizeAllowedHosts(config?.allowedHosts || []);
  if (request) {
    if (!allowedHosts.length) {
      throw new Error('Load tests require at least one allowed host.');
    }
    const requestHost = buildUrl(request, environment).hostname.toLowerCase();
    if (!allowedHosts.includes(requestHost)) {
      throw new Error(`Request host ${requestHost} is not in the load-test allowlist.`);
    }
  }
  return {
    concurrency,
    totalRequests,
    durationSeconds,
    rampUpSeconds,
    targetRatePerSecond,
    executionMode,
    workerProcesses: executionMode === 'multiProcess' ? workerProcesses : 1,
    mode: durationSeconds > 0 ? 'duration' : 'requestCount',
    recordSamples: config?.recordSamples === true,
    allowedHosts,
    confirmedHighConcurrency: config?.confirmedHighConcurrency === true
  };
}

async function runLoadTest(request, environment, config, options = {}) {
  const normalizedConfig = validateLoadConfig(config, request, environment);
  if (normalizedConfig.executionMode === 'multiProcess' && normalizedConfig.workerProcesses > 1) {
    return runMultiProcessLoadTest(request, environment, normalizedConfig, options);
  }
  return runSingleProcessLoadTest(request, environment, normalizedConfig, options);
}

async function runSingleProcessLoadTest(request, environment, normalizedConfig, options = {}) {
  const abortController = options.abortController || new AbortController();
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const stats = createLoadStats(normalizedConfig);
  let nextIndex = 0;
  let completed = 0;
  let activeWorkers = 0;
  const started = performance.now();
  const deadline = normalizedConfig.durationSeconds > 0
    ? started + normalizedConfig.durationSeconds * 1000
    : Number.POSITIVE_INFINITY;

  async function worker(workerIndex) {
    activeWorkers++;
    try {
      while (!abortController.signal.aborted) {
        if (performance.now() >= deadline) {
          return;
        }
        const index = nextIndex++;
        if (index >= normalizedConfig.totalRequests) {
          return;
        }
        if (normalizedConfig.targetRatePerSecond > 0) {
          const scheduledAt = started + (index * 1000) / normalizedConfig.targetRatePerSecond;
          const delayMillis = Math.max(0, scheduledAt - performance.now());
          if (delayMillis > 0) {
            try {
              await sleep(delayMillis, abortController.signal);
            } catch (error) {
              if (error.name === 'AbortError') {
                return;
              }
              throw error;
            }
          }
          if (performance.now() >= deadline) {
            return;
          }
        }
        const sampleStarted = performance.now();
        const sample = {
          index: index + 1,
          workerIndex: workerIndex + 1,
          startedAtMillis: Math.max(0, Math.round(sampleStarted - started))
        };
        try {
          const result = await sendRequest(request, environment, { signal: abortController.signal, cookieJar: options.cookieJar || [] });
          recordLoadSample(stats, {
            ...sample,
            success: true,
            statusCode: result.statusCode,
            durationMillis: result.durationMillis
          });
        } catch (error) {
          recordLoadSample(stats, {
            ...sample,
            success: false,
            statusCode: 0,
            durationMillis: Math.max(0, Math.round(performance.now() - sampleStarted)),
            error: rootMessage(error)
          });
        } finally {
          completed++;
          progress(progressEvent(completed, normalizedConfig, started, activeWorkers));
        }
      }
    } finally {
      activeWorkers--;
    }
  }

  async function delayedWorker(workerIndex, delayMillis) {
    if (delayMillis > 0) {
      try {
        await sleep(delayMillis, abortController.signal);
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        throw error;
      }
    }
    if (!abortController.signal.aborted) {
      await worker(workerIndex);
    }
  }

  const workerCount = Math.min(normalizedConfig.concurrency, normalizedConfig.totalRequests);
  const rampUpMillis = normalizedConfig.rampUpSeconds * 1000;
  const workers = Array.from({ length: workerCount }, (_value, index) => {
    const delayMillis = rampUpMillis > 0 ? Math.round((rampUpMillis * index) / workerCount) : 0;
    return delayedWorker(index, delayMillis);
  });
  await Promise.all(workers);
  return summarizeStats(
    stats,
    performance.now() - started,
    normalizedConfig,
    abortController.signal.aborted,
    { includeInternalMetrics: options.includeInternalMetrics === true }
  );
}

async function runMultiProcessLoadTest(request, environment, normalizedConfig, options = {}) {
  const abortController = options.abortController || new AbortController();
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const started = performance.now();
  const workerCount = Math.min(normalizedConfig.workerProcesses, normalizedConfig.concurrency, normalizedConfig.totalRequests);
  const childConfigs = splitLoadConfig(normalizedConfig, workerCount);
  const workerProgress = new Map();
  const workers = childConfigs.map((childConfig, index) => runLoadWorker({
    request,
    environment,
    config: childConfig,
    cookieJar: options.cookieJar || [],
    abortController,
    workerProcess: index + 1,
    onProgress: (event) => {
      workerProgress.set(index, event);
      progress(aggregateWorkerProgress(workerProgress, normalizedConfig, started));
    }
  }));
  const workerResults = await Promise.all(workers);
  const stats = createLoadStats(normalizedConfig);
  for (const [workerIndex, result] of workerResults.entries()) {
    mergeLoadResult(stats, result, (sample) => ({
      ...sample,
      workerProcess: workerIndex + 1
    }));
  }
  return summarizeStats(
    stats,
    performance.now() - started,
    { ...normalizedConfig, recordSamples: normalizedConfig.recordSamples },
    abortController.signal.aborted || workerResults.some((result) => result.cancelled)
  );
}

function splitLoadConfig(config, workerCount) {
  const requestSplits = splitInteger(config.totalRequests, workerCount);
  const concurrencySplits = splitInteger(config.concurrency, workerCount);
  const rateSplits = splitRate(config.targetRatePerSecond, workerCount);
  return requestSplits.map((totalRequests, index) => ({
    ...config,
    executionMode: 'singleProcess',
    workerProcesses: 1,
    totalRequests,
    concurrency: Math.max(1, concurrencySplits[index]),
    targetRatePerSecond: rateSplits[index],
    recordSamples: config.recordSamples
  }));
}

function splitInteger(total, parts) {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_value, index) => base + (index < remainder ? 1 : 0));
}

function splitRate(rate, parts) {
  if (!rate) {
    return Array.from({ length: parts }, () => 0);
  }
  const perWorker = rate / parts;
  return Array.from({ length: parts }, () => perWorker);
}

function runLoadWorker({ request, environment, config, cookieJar, abortController, workerProcess, onProgress }) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'loadTestWorker.js'), [], {
      env: loadWorkerEnvironment(process.env),
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    let settled = false;
    let stderr = '';
    let killTimer;
    const cleanup = () => {
      clearTimeout(killTimer);
      abortController.signal.removeEventListener('abort', onAbort);
    };
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () => {
      if (child.connected) {
        child.send({ type: 'cancel' });
      }
      killTimer = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
        }
      }, 1000);
    };
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('message', (message) => {
      if (message?.type === 'progress') {
        onProgress({ ...message.progress, workerProcess });
      } else if (message?.type === 'result') {
        finish(resolve, message.result);
      } else if (message?.type === 'error') {
        finish(reject, new Error(message.error || 'Load worker failed.'));
      }
    });
    child.on('error', (error) => finish(reject, error));
    child.on('exit', (code, signal) => {
      if (!settled) {
        finish(reject, new Error(`Load worker exited before returning a result (${signal || code}). ${stderr.trim()}`.trim()));
      }
    });
    abortController.signal.addEventListener('abort', onAbort, { once: true });
    if (abortController.signal.aborted) {
      onAbort();
    }
    child.send({ type: 'start', request, environment, config, cookieJar });
  });
}

function loadWorkerEnvironment(source = process.env) {
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (source[key]) {
      env[key] = source[key];
    }
  }
  return env;
}

function aggregateWorkerProgress(workerProgress, config, started) {
  let completedRequests = 0;
  let activeWorkers = 0;
  for (const progress of workerProgress.values()) {
    completedRequests += Number(progress.completedRequests || 0);
    activeWorkers += Number(progress.activeWorkers || 0);
  }
  return {
    completedRequests,
    requestedRequests: config.totalRequests,
    mode: config.mode,
    durationSeconds: config.durationSeconds,
    targetRatePerSecond: config.targetRatePerSecond,
    executionMode: config.executionMode,
    workerProcesses: config.workerProcesses,
    elapsedMillis: Math.max(0, Math.round(performance.now() - started)),
    activeWorkers
  };
}

function progressEvent(completed, config, started, activeWorkers) {
  return {
    completedRequests: completed,
    requestedRequests: config.totalRequests,
    mode: config.mode,
    durationSeconds: config.durationSeconds,
    targetRatePerSecond: config.targetRatePerSecond,
    executionMode: config.executionMode,
    workerProcesses: config.workerProcesses,
    elapsedMillis: Math.max(0, Math.round(performance.now() - started)),
    activeWorkers
  };
}

function sleep(milliseconds, signal) {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let timeout;
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      const error = new Error('Load test cancelled.');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(finish, milliseconds);
  });
}

function normalizeAllowedHosts(values) {
  if (!Array.isArray(values)) {
    throw new Error('Load-test allowed hosts must be an array.');
  }
  if (values.length > MAX_ALLOWED_HOSTS) {
    throw new Error(`Load-test allowed hosts cannot contain more than ${MAX_ALLOWED_HOSTS} entries.`);
  }
  const hosts = [];
  for (const value of values) {
    const host = normalizeHost(value);
    if (host && !hosts.includes(host)) {
      hosts.push(host);
    }
  }
  return hosts;
}

function normalizeHost(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  let url;
  try {
    url = text.includes('://') ? new URL(text) : new URL(`http://${text}`);
  } catch {
    throw new Error(`Invalid load-test allowed host: ${text}.`);
  }
  if (!url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`Invalid load-test allowed host: ${text}.`);
  }
  return url.hostname.toLowerCase();
}

function createLoadStats(config) {
  return {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    statusCounts: {},
    errors: [],
    latencySum: 0,
    minMillis: null,
    maxMillis: 0,
    durationCounts: new Map(),
    histogramCounts: Array.from({ length: HISTOGRAM_BUCKETS_MILLIS.length + 1 }, () => 0),
    recordSamples: config?.recordSamples === true,
    sampleLimit: Math.min(MAX_RECORDED_SAMPLES, Number(config?.totalRequests || MAX_RECORDED_SAMPLES)),
    samples: []
  };
}

function recordLoadSample(stats, sample) {
  const durationMillis = normalizeDurationMillis(sample.durationMillis);
  const normalizedSample = {
    ...sample,
    durationMillis
  };
  stats.totalRequests++;
  recordHistogramDuration(stats, durationMillis);
  recordOutputSample(stats, normalizedSample);

  if (normalizedSample.success) {
    stats.successfulRequests++;
    stats.latencySum += durationMillis;
    stats.minMillis = stats.minMillis == null ? durationMillis : Math.min(stats.minMillis, durationMillis);
    stats.maxMillis = Math.max(stats.maxMillis, durationMillis);
    recordDurationCount(stats, durationMillis, 1);
    stats.statusCounts[normalizedSample.statusCode] = (stats.statusCounts[normalizedSample.statusCode] || 0) + 1;
  } else {
    stats.failedRequests++;
    if (normalizedSample.error && stats.errors.length < 10) {
      stats.errors.push(normalizedSample.error);
    }
  }
}

function mergeLoadResult(stats, result, transformSample = (sample) => sample) {
  const totalRequests = Number(result?.totalRequests || 0);
  const successfulRequests = Number(result?.successfulRequests || 0);
  const failedRequests = Number(result?.failedRequests || 0);
  stats.totalRequests += totalRequests;
  stats.successfulRequests += successfulRequests;
  stats.failedRequests += failedRequests;
  stats.latencySum += Number.isFinite(Number(result?._latencySum))
    ? Number(result._latencySum)
    : Number(result?.averageMillis || 0) * successfulRequests;

  if (successfulRequests > 0) {
    const minMillis = normalizeDurationMillis(result.minMillis);
    const maxMillis = normalizeDurationMillis(result.maxMillis);
    stats.minMillis = stats.minMillis == null ? minMillis : Math.min(stats.minMillis, minMillis);
    stats.maxMillis = Math.max(stats.maxMillis, maxMillis);
  }

  for (const [statusCode, count] of Object.entries(result?.statusCounts || {})) {
    stats.statusCounts[statusCode] = (stats.statusCounts[statusCode] || 0) + Number(count || 0);
  }
  for (const error of result?.errors || []) {
    if (error && stats.errors.length < 10) {
      stats.errors.push(String(error));
    }
  }
  mergeHistogram(stats, result?.latencyHistogram || []);
  for (const entry of result?._latencyDistribution || []) {
    const [durationMillis, count] = Array.isArray(entry) ? entry : [entry?.durationMillis, entry?.count];
    recordDurationCount(stats, normalizeDurationMillis(durationMillis), Number(count || 0));
  }
  for (const sample of result?.samples || []) {
    recordOutputSample(stats, transformSample(sample));
  }
}

function recordOutputSample(stats, sample) {
  if (stats.recordSamples && stats.samples.length < stats.sampleLimit) {
    stats.samples.push(sample);
  }
}

function recordDurationCount(stats, durationMillis, count) {
  if (!count) {
    return;
  }
  stats.durationCounts.set(durationMillis, (stats.durationCounts.get(durationMillis) || 0) + count);
}

function recordHistogramDuration(stats, durationMillis) {
  stats.histogramCounts[histogramBucketIndex(durationMillis)]++;
}

function mergeHistogram(stats, buckets) {
  for (const bucket of buckets) {
    const index = bucket?.upperBoundMillis == null
      ? HISTOGRAM_BUCKETS_MILLIS.length
      : HISTOGRAM_BUCKETS_MILLIS.indexOf(bucket.upperBoundMillis);
    if (index >= 0) {
      stats.histogramCounts[index] += Number(bucket.count || 0);
    }
  }
}

function summarizeStats(stats, elapsedMillis, configOrRequestedRequests, cancelled, options = {}) {
  const config = typeof configOrRequestedRequests === 'number'
    ? { totalRequests: configOrRequestedRequests, mode: 'requestCount', durationSeconds: 0, rampUpSeconds: 0, recordSamples: false }
    : configOrRequestedRequests;
  const result = {
    requestedRequests: config.totalRequests,
    totalRequests: stats.totalRequests,
    successfulRequests: stats.successfulRequests,
    failedRequests: stats.failedRequests,
    cancelled,
    mode: config.mode || 'requestCount',
    durationSeconds: config.durationSeconds || 0,
    rampUpSeconds: config.rampUpSeconds || 0,
    targetRatePerSecond: config.targetRatePerSecond || 0,
    executionMode: config.executionMode || 'singleProcess',
    workerProcesses: config.workerProcesses || 1,
    elapsedMillis: Math.max(0, Math.round(elapsedMillis)),
    minMillis: 0,
    maxMillis: 0,
    averageMillis: 0,
    p50Millis: 0,
    p90Millis: 0,
    p95Millis: 0,
    p99Millis: 0,
    errorRate: 0,
    requestsPerSecond: 0,
    statusCounts: { ...stats.statusCounts },
    errors: [...stats.errors],
    latencyHistogram: histogramFromCounts(stats.histogramCounts)
  };

  if (stats.totalRequests === 0) {
    if (config.recordSamples) {
      result.samples = [];
      result.sampleLimit = stats.sampleLimit;
      result.sampleLimitReached = false;
    }
    return result;
  }

  result.errorRate = stats.failedRequests / stats.totalRequests;
  result.requestsPerSecond = stats.totalRequests / Math.max(elapsedMillis / 1000, 0.001);
  if (stats.successfulRequests > 0) {
    result.minMillis = stats.minMillis || 0;
    result.maxMillis = stats.maxMillis;
    result.averageMillis = stats.latencySum / stats.successfulRequests;
    result.p50Millis = percentileFromDistribution(stats.durationCounts, stats.successfulRequests, 0.50);
    result.p90Millis = percentileFromDistribution(stats.durationCounts, stats.successfulRequests, 0.90);
    result.p95Millis = percentileFromDistribution(stats.durationCounts, stats.successfulRequests, 0.95);
    result.p99Millis = percentileFromDistribution(stats.durationCounts, stats.successfulRequests, 0.99);
  }
  if (config.recordSamples) {
    result.samples = stats.samples.map((sample, index) => ({
      ...sample,
      index: index + 1
    }));
    result.sampleLimit = stats.sampleLimit;
    result.sampleLimitReached = stats.totalRequests > stats.sampleLimit;
  }
  if (options.includeInternalMetrics) {
    result._latencySum = stats.latencySum;
    result._latencyDistribution = Array.from(stats.durationCounts.entries());
  }
  return result;
}

function summarize(samples, elapsedMillis, configOrRequestedRequests, cancelled) {
  const config = typeof configOrRequestedRequests === 'number'
    ? { totalRequests: configOrRequestedRequests, mode: 'requestCount', durationSeconds: 0, rampUpSeconds: 0, recordSamples: false }
    : configOrRequestedRequests;
  const stats = createLoadStats(config);
  for (const sample of samples) {
    recordLoadSample(stats, sample);
  }
  return summarizeStats(stats, elapsedMillis, config, cancelled);
}

function histogramFromCounts(counts) {
  const buckets = HISTOGRAM_BUCKETS_MILLIS.map((upperBoundMillis, index) => ({
    upperBoundMillis,
    count: counts[index] || 0
  }));
  buckets.push({ upperBoundMillis: null, count: counts[HISTOGRAM_BUCKETS_MILLIS.length] || 0 });
  return buckets;
}

function histogramBucketIndex(durationMillis) {
  const index = HISTOGRAM_BUCKETS_MILLIS.findIndex((upperBoundMillis) => durationMillis <= upperBoundMillis);
  return index === -1 ? HISTOGRAM_BUCKETS_MILLIS.length : index;
}

function percentileFromDistribution(durationCounts, totalCount, percentileValue) {
  const target = Math.max(1, Math.ceil(totalCount * percentileValue));
  let seen = 0;
  for (const [durationMillis, count] of Array.from(durationCounts.entries()).sort((a, b) => a[0] - b[0])) {
    seen += count;
    if (seen >= target) {
      return durationMillis;
    }
  }
  return 0;
}

function normalizeDurationMillis(value) {
  const durationMillis = Number(value);
  return Number.isFinite(durationMillis) ? Math.max(0, Math.round(durationMillis)) : 0;
}

function rootMessage(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (error.name === 'AbortError') {
    return 'Load test cancelled.';
  }
  return error.message || error.name || String(error);
}

function loadTestResultToCsv(result) {
  const rows = [
    ['metric', 'value'],
    ['mode', result.mode || 'requestCount'],
    ['requestedRequests', result.requestedRequests],
    ['completedRequests', result.totalRequests],
    ['successfulRequests', result.successfulRequests],
    ['failedRequests', result.failedRequests],
    ['cancelled', result.cancelled],
    ['durationSeconds', result.durationSeconds || 0],
    ['rampUpSeconds', result.rampUpSeconds || 0],
    ['targetRatePerSecond', result.targetRatePerSecond || 0],
    ['executionMode', result.executionMode || 'singleProcess'],
    ['workerProcesses', result.workerProcesses || 1],
    ['elapsedMillis', result.elapsedMillis || 0],
    ['errorRate', result.errorRate],
    ['requestsPerSecond', result.requestsPerSecond],
    ['minMillis', result.minMillis],
    ['averageMillis', result.averageMillis],
    ['p50Millis', result.p50Millis],
    ['p90Millis', result.p90Millis],
    ['p95Millis', result.p95Millis],
    ['p99Millis', result.p99Millis],
    ['maxMillis', result.maxMillis]
  ];
  if (Array.isArray(result.latencyHistogram)) {
    rows.push([]);
    rows.push(['latencyUpperBoundMillis', 'count']);
    for (const bucket of result.latencyHistogram) {
      rows.push([bucket.upperBoundMillis == null ? 'overflow' : bucket.upperBoundMillis, bucket.count]);
    }
  }
  if (Array.isArray(result.samples) && result.samples.length) {
    rows.push([]);
    rows.push(['sampleIndex', 'workerIndex', 'startedAtMillis', 'durationMillis', 'success', 'statusCode', 'error']);
    for (const sample of result.samples) {
      rows.push([
        sample.index,
        sample.workerIndex,
        sample.startedAtMillis,
        sample.durationMillis,
        sample.success,
        sample.statusCode,
        sample.error || ''
      ]);
    }
  }
  return rows.map((row) => row.map(csvValue).join(',')).join('\n');
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

module.exports = {
  HIGH_CONCURRENCY_THRESHOLD,
  LOAD_EXECUTION_MODES,
  MAX_CONCURRENCY,
  MAX_ALLOWED_HOSTS,
  MAX_DURATION_SECONDS,
  MAX_MULTIPROCESS_AGGREGATED_SAMPLES,
  MAX_RAMP_UP_SECONDS,
  MAX_RECORDED_SAMPLES,
  MAX_TARGET_RATE_PER_SECOND,
  MAX_TOTAL_REQUESTS,
  MAX_WORKER_PROCESSES,
  loadTestResultToCsv,
  normalizeAllowedHosts,
  runLoadTest,
  summarize,
  validateLoadConfig
};
