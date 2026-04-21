const { performance } = require('node:perf_hooks');
const { buildUrl, sendRequest } = require('./httpClient');

const MAX_CONCURRENCY = 512;
const MAX_TOTAL_REQUESTS = 100_000;
const HIGH_CONCURRENCY_THRESHOLD = 50;
const MAX_ALLOWED_HOSTS = 100;

function validateLoadConfig(config, request, environment) {
  const concurrency = Number(config?.concurrency);
  const totalRequests = Number(config?.totalRequests);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`Concurrency must be between 1 and ${MAX_CONCURRENCY}.`);
  }
  if (!Number.isInteger(totalRequests) || totalRequests < 1 || totalRequests > MAX_TOTAL_REQUESTS) {
    throw new Error(`Total requests must be between 1 and ${MAX_TOTAL_REQUESTS}.`);
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
  return { concurrency, totalRequests, allowedHosts, confirmedHighConcurrency: config?.confirmedHighConcurrency === true };
}

async function runLoadTest(request, environment, config, options = {}) {
  const normalizedConfig = validateLoadConfig(config, request, environment);
  const abortController = options.abortController || new AbortController();
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const samples = [];
  let nextIndex = 0;
  let completed = 0;
  const started = performance.now();

  async function worker() {
    while (!abortController.signal.aborted) {
      const index = nextIndex++;
      if (index >= normalizedConfig.totalRequests) {
        return;
      }
      const sampleStarted = performance.now();
      try {
        const result = await sendRequest(request, environment, { signal: abortController.signal });
        samples.push({
          success: true,
          statusCode: result.statusCode,
          durationMillis: result.durationMillis
        });
      } catch (error) {
        samples.push({
          success: false,
          statusCode: 0,
          durationMillis: Math.max(0, Math.round(performance.now() - sampleStarted)),
          error: rootMessage(error)
        });
      } finally {
        completed++;
        progress({ completedRequests: completed, requestedRequests: normalizedConfig.totalRequests });
      }
    }
  }

  const workerCount = Math.min(normalizedConfig.concurrency, normalizedConfig.totalRequests);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return summarize(samples, performance.now() - started, normalizedConfig.totalRequests, abortController.signal.aborted);
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

function summarize(samples, elapsedMillis, requestedRequests, cancelled) {
  const result = {
    requestedRequests,
    totalRequests: samples.length,
    successfulRequests: 0,
    failedRequests: 0,
    cancelled,
    minMillis: 0,
    maxMillis: 0,
    averageMillis: 0,
    p50Millis: 0,
    p90Millis: 0,
    p95Millis: 0,
    p99Millis: 0,
    errorRate: 0,
    requestsPerSecond: 0,
    statusCounts: {},
    errors: []
  };

  if (samples.length === 0) {
    return result;
  }

  const latencies = [];
  let latencySum = 0;
  for (const sample of samples) {
    if (sample.success) {
      result.successfulRequests++;
      latencies.push(sample.durationMillis);
      latencySum += sample.durationMillis;
      result.statusCounts[sample.statusCode] = (result.statusCounts[sample.statusCode] || 0) + 1;
    } else {
      result.failedRequests++;
      if (sample.error && result.errors.length < 10) {
        result.errors.push(sample.error);
      }
    }
  }

  result.errorRate = result.failedRequests / samples.length;
  result.requestsPerSecond = samples.length / Math.max(elapsedMillis / 1000, 0.001);
  latencies.sort((a, b) => a - b);
  if (latencies.length > 0) {
    result.minMillis = latencies[0];
    result.maxMillis = latencies[latencies.length - 1];
    result.averageMillis = latencySum / latencies.length;
    result.p50Millis = percentile(latencies, 0.50);
    result.p90Millis = percentile(latencies, 0.90);
    result.p95Millis = percentile(latencies, 0.95);
    result.p99Millis = percentile(latencies, 0.99);
  }
  return result;
}

function percentile(sortedValues, percentileValue) {
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[Math.max(index, 0)];
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
    ['requestedRequests', result.requestedRequests],
    ['completedRequests', result.totalRequests],
    ['successfulRequests', result.successfulRequests],
    ['failedRequests', result.failedRequests],
    ['cancelled', result.cancelled],
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
  return rows.map((row) => row.map(csvValue).join(',')).join('\n');
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

module.exports = {
  HIGH_CONCURRENCY_THRESHOLD,
  MAX_CONCURRENCY,
  MAX_ALLOWED_HOSTS,
  MAX_TOTAL_REQUESTS,
  loadTestResultToCsv,
  normalizeAllowedHosts,
  runLoadTest,
  summarize,
  validateLoadConfig
};
