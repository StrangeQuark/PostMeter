const crypto = require('node:crypto');

const DIAGNOSIS_TYPE = 'diagnosis';
const DEFAULT_DIAGNOSIS_TOTAL_REQUESTS = 44;
const DEFAULT_DIAGNOSIS_CONCURRENCY = 5;
const DEFAULT_DIAGNOSIS_SPIKE_MULTIPLIER = 2;
const DEFAULT_DIAGNOSIS_SCOPE = 'quick';
const DIAGNOSIS_SCOPE_VALUES = Object.freeze(['quick', 'medium', 'extended']);
const DIAGNOSIS_SCOPE_PROFILES = Object.freeze({
  quick: Object.freeze({
    label: 'Quick Test',
    totalRequests: DEFAULT_DIAGNOSIS_TOTAL_REQUESTS,
    maxDurationSeconds: 60,
    stages: Object.freeze({
      preflight: 1,
      headProbe: 1,
      optionsProbe: 1,
      warmup: 3,
      baseline: 5,
      throughputLow: 5,
      throughputMid: 5,
      throughputPeak: 5,
      spike: 10,
      miniSoak: 5,
      recovery: 3
    })
  }),
  medium: Object.freeze({
    label: 'Medium Test',
    totalRequests: 300,
    maxDurationSeconds: 300,
    stages: Object.freeze({
      preflight: 1,
      headProbe: 1,
      optionsProbe: 1,
      warmup: 10,
      baseline: 120,
      throughputLow: 40,
      throughputMid: 40,
      throughputPeak: 40,
      spike: 30,
      miniSoak: 12,
      recovery: 5
    })
  }),
  extended: Object.freeze({
    label: 'Extended Test',
    totalRequests: 1000,
    maxDurationSeconds: 900,
    stages: Object.freeze({
      preflight: 1,
      headProbe: 1,
      optionsProbe: 1,
      warmup: 20,
      baseline: 500,
      throughputLow: 100,
      throughputMid: 100,
      throughputPeak: 100,
      spike: 100,
      miniSoak: 67,
      recovery: 10
    })
  })
});
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRACE_HEADER_NAMES = [
  'request-id',
  'x-request-id',
  'x-correlation-id',
  'x-amzn-trace-id',
  'traceparent',
  'tracestate'
];
const RATE_LIMIT_HEADER_NAMES = [
  'retry-after',
  'ratelimit-limit',
  'ratelimit-remaining',
  'ratelimit-reset',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset'
];
const SECURITY_HEADER_NAMES = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy'
];
const CACHE_HEADER_NAMES = ['cache-control', 'etag', 'last-modified', 'age', 'expires'];
const CORS_HEADER_NAMES = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials'
];
const SENSITIVE_QUERY_PATTERN = /(?:token|secret|password|passwd|passphrase|api[_-]?key|access[_-]?key|auth|authorization|credential|session|code|state)/i;

const DIAGNOSTIC_CHECK_DEFINITIONS = Object.freeze([
  def('url_validity', 'Transport', 'URL validity'),
  def('final_resolved_url', 'Transport', 'Final resolved URL'),
  def('dns_lookup_time', 'Transport', 'DNS lookup time'),
  def('tcp_connect_time', 'Transport', 'TCP connect time'),
  def('tls_handshake_time', 'TLS', 'TLS handshake time'),
  def('tls_protocol', 'TLS', 'TLS protocol'),
  def('tls_cipher', 'TLS', 'TLS cipher'),
  def('tls_cert_issuer', 'TLS', 'TLS certificate issuer'),
  def('tls_cert_expiry', 'TLS', 'TLS certificate expiry'),
  def('tls_hostname_validity', 'TLS', 'TLS hostname validity'),
  def('redirect_count', 'Transport', 'Redirect count'),
  def('redirect_time', 'Transport', 'Redirect time'),
  def('request_preparation_time', 'Request', 'Request preparation time'),
  def('upload_time', 'Request', 'Upload time'),
  def('time_to_first_byte', 'Response', 'Time to first byte'),
  def('download_body_read_time', 'Response', 'Download/body read time'),
  def('total_request_duration', 'Response', 'Total request duration'),
  def('response_bytes', 'Response', 'Response bytes'),
  def('content_length', 'Response', 'Content length'),
  def('compression', 'Response', 'Compression'),
  def('transfer_encoding', 'Response', 'Transfer encoding'),
  def('http_status_distribution', 'Response', 'HTTP status distribution'),
  def('error_distribution', 'Response', 'Error distribution'),
  def('cold_connection_latency', 'Latency', 'Cold connection latency'),
  def('warm_keep_alive_latency', 'Latency', 'Warm keep-alive latency'),
  def('connection_reuse_rate', 'Transport', 'Connection reuse rate'),
  def('latency_p50', 'Latency', 'Latency p50'),
  def('latency_p90', 'Latency', 'Latency p90'),
  def('latency_p95', 'Latency', 'Latency p95'),
  def('latency_p99', 'Latency', 'Latency p99'),
  def('jitter_variance', 'Latency', 'Jitter / variance'),
  def('outlier_count', 'Latency', 'Outlier count'),
  def('success_rate', 'Reliability', 'Success rate'),
  def('failure_rate', 'Reliability', 'Failure rate'),
  def('best_observed_rps', 'Throughput', 'Best observed RPS'),
  def('stable_rps_estimate', 'Throughput', 'Stable RPS estimate'),
  def('saturation_point', 'Throughput', 'Saturation point'),
  def('recovery_latency', 'Latency', 'Recovery latency'),
  def('status_consistency', 'Behavior', 'Status consistency'),
  def('response_size_consistency', 'Behavior', 'Response size consistency'),
  def('content_type_consistency', 'Behavior', 'Content-Type consistency'),
  def('body_parseability', 'Behavior', 'Body parseability'),
  def('response_fingerprint_consistency', 'Behavior', 'Response fingerprint consistency'),
  def('header_consistency', 'Behavior', 'Header consistency'),
  def('cache_headers', 'Behavior', 'Cache headers'),
  def('rate_limit_headers', 'Behavior', 'Rate-limit headers'),
  def('server_timing_headers', 'Behavior', 'Server-Timing headers'),
  def('trace_headers', 'Behavior', 'Trace/request ID headers'),
  def('set_cookie_churn', 'Behavior', 'Set-Cookie churn'),
  def('redirect_target_stability', 'Behavior', 'Redirect target stability'),
  def('tls_expires_soon', 'TLS', 'TLS expires soon'),
  def('tls_hostname_mismatch', 'TLS', 'TLS hostname mismatch'),
  def('weak_tls_protocol', 'TLS', 'Weak TLS protocol'),
  def('missing_https', 'Security', 'Missing HTTPS'),
  def('https_to_http_redirect', 'Security', 'HTTPS to HTTP redirect'),
  def('excessive_redirect_chain', 'Security', 'Excessive redirect chain'),
  def('sensitive_data_in_url', 'Security', 'Sensitive data in URL'),
  def('auth_challenge_patterns', 'Security', 'Auth challenge patterns'),
  def('cors_headers', 'Security', 'CORS headers'),
  def('security_headers', 'Security', 'Security headers'),
  def('local_event_loop_delay', 'Client', 'Local event-loop delay'),
  def('scheduler_lag', 'Client', 'Scheduler lag'),
  def('local_request_queue_depth', 'Client', 'Local request queue depth'),
  def('client_side_timeout_count', 'Client', 'Client-side timeout count'),
  def('memory_growth', 'Client', 'Memory growth'),
  def('safety_caps_limited_result', 'Client', 'Safety caps limited result'),
  def('client_saturation_before_endpoint', 'Client', 'Client saturation before endpoint'),
  def('confidence_score', 'Client', 'Confidence score'),
  def('head_probe', 'Optional probes', 'HEAD probe'),
  def('options_probe', 'Optional probes', 'OPTIONS probe'),
  def('http_protocol_comparison', 'Optional probes', 'HTTP protocol comparison'),
  def('dns_repeatability', 'Optional probes', 'DNS repeatability'),
  def('payload_variation', 'Optional probes', 'Payload variation'),
  def('authenticated_baseline_comparison', 'Optional probes', 'Authenticated baseline comparison'),
  def('retry_behavior', 'Optional probes', 'Retry behavior'),
  def('mini_soak_stability', 'Optional probes', 'Mini-soak stability')
]);

function def(id, group, label) {
  return Object.freeze({ id, group, label });
}

function normalizeDiagnosisScope(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return DIAGNOSIS_SCOPE_VALUES.includes(normalized) ? normalized : DEFAULT_DIAGNOSIS_SCOPE;
}

function diagnosisScopeProfile(value) {
  return DIAGNOSIS_SCOPE_PROFILES[normalizeDiagnosisScope(value)];
}

function buildDiagnosisStages(config = {}, safetyLimits = {}) {
  const profile = diagnosisScopeProfile(config.diagnosisScope);
  const counts = profile.stages;
  const maxConcurrency = integerAtLeast(safetyLimits.maxConcurrency, 1, 10);
  const baseConcurrency = Math.min(
    maxConcurrency,
    integerAtLeast(config.concurrency, 1, DEFAULT_DIAGNOSIS_CONCURRENCY)
  );
  const lowConcurrency = Math.max(1, Math.min(baseConcurrency, 2));
  const midConcurrency = Math.max(1, Math.min(baseConcurrency, Math.max(3, Math.ceil(baseConcurrency / 2))));
  const spikeConcurrency = Math.max(
    1,
    Math.min(
      maxConcurrency,
      baseConcurrency * integerAtLeast(config.spikeMultiplier, 1, DEFAULT_DIAGNOSIS_SPIKE_MULTIPLIER)
    )
  );
  return [
    stage('preflight', 'preflight', counts.preflight, 1, { coldConnection: true }),
    stage('head-probe', 'head-probe', counts.headProbe, 1, { methodOverride: 'HEAD', coldConnection: true }),
    stage('options-probe', 'options-probe', counts.optionsProbe, 1, { methodOverride: 'OPTIONS', coldConnection: true }),
    stage('warmup', 'warmup', counts.warmup, 1),
    stage('baseline', 'baseline-latency', counts.baseline, 1),
    stage('throughput-low', 'throughput-low', counts.throughputLow, lowConcurrency),
    stage('throughput-mid', 'throughput-mid', counts.throughputMid, midConcurrency),
    stage('throughput-peak', 'throughput-peak', counts.throughputPeak, baseConcurrency),
    stage('spike', 'spike-burst', counts.spike, spikeConcurrency),
    stage('mini-soak', 'mini-soak', counts.miniSoak, lowConcurrency),
    stage('recovery', 'recovery', counts.recovery, 1)
  ].map((item) => ({
    ...item,
    totalRequests: Math.max(1, item.totalRequests || 1),
    concurrency: Math.min(Math.max(1, item.totalRequests || 1), Math.max(1, item.concurrency || 1))
  }));
}

function diagnosisPlannedRequestCount(config = {}, safetyLimits = {}) {
  return buildDiagnosisStages(config, safetyLimits).reduce((total, item) => total + item.totalRequests, 0);
}

function diagnosisEffectiveConcurrency(config = {}, safetyLimits = {}) {
  return buildDiagnosisStages(config, safetyLimits)
    .reduce((max, item) => Math.max(max, item.concurrency || 1), 1);
}

function stage(name, phase, totalRequests, concurrency, options = {}) {
  return {
    name,
    phase,
    totalRequests,
    concurrency,
    ...options
  };
}

function summarizeEndpointDiagnosis(samples = [], context = {}) {
  const nonProbeSamples = samples.filter((sample) => !['head-probe', 'options-probe'].includes(sample.phase));
  const metricSamples = nonProbeSamples.length ? nonProbeSamples : samples;
  const successfulHttpSamples = metricSamples.filter((sample) => isHttpSuccess(sample.statusCode));
  const durations = sortedNumbers(metricSamples.map((sample) => sample.durationMillis));
  const responseBytes = sortedNumbers(metricSamples.map((sample) => sample.responseBytes));
  const statusCodes = counts(metricSamples.map((sample) => String(sample.statusCode || 0)));
  const errors = errorCounts(metricSamples);
  const phases = summarizePhases(samples);
  const headers = metricSamples.map((sample) => normalizeHeaders(sample.responseHeaders));
  const timings = metricSamples.map((sample) => sample.timings || {}).filter((item) => item && typeof item === 'object');
  const firstSample = samples[0] || {};
  const finalUrls = samples.map((sample) => sample.finalUrl || sample.requestUrl || '').filter(Boolean);
  const requestUrl = firstSample.requestUrl || context.request?.url || '';
  const finalUrl = finalUrls.at(-1) || requestUrl;
  const targetProtocol = protocolForUrl(finalUrl || requestUrl);
  const bestObservedRps = Math.max(0, ...phases.map((phase) => Number(phase.requestsPerSecond || 0)));
  const stableRps = stableRequestsPerSecond(phases);
  const latencyGrowth = phaseAverage(phases, 'throughput-peak') - phaseAverage(phases, 'baseline-latency');
  const saturation = saturationPoint(phases);
  const responseHashes = metricSamples
    .filter((sample) => sample.responseBody != null)
    .map((sample) => hashText(sample.responseBody));
  const headerFingerprints = headers.map((header) => Object.keys(header).sort().join(','));
  const timeoutCount = Object.keys(errors).reduce((total, message) => /timeout|timed out/i.test(message) ? total + errors[message] : total, 0);
  const safetyLimited = samples.length < Number(context.plannedRequests || 0)
    || context.cancelled === true
    || context.safetyLimited === true;
  const confidence = confidenceScore({
    samples: metricSamples,
    eventLoopDelayMillis: context.eventLoopDelayMillis,
    safetyLimited,
    timeoutCount
  });
  const checkContext = {
    bestObservedRps,
    confidence,
    corsHeaders: matchingHeaders(headers, CORS_HEADER_NAMES),
    durations,
    errors,
    finalUrl,
    finalUrls,
    firstSample,
    headerFingerprints,
    headers,
    latencyGrowth,
    metricSamples,
    nonProbeSamples,
    phases,
    request: context.request || {},
    requestUrl,
    responseBytes,
    responseHashes,
    safetyLimited,
    samples,
    securityHeaders: matchingHeaders(headers, SECURITY_HEADER_NAMES),
    stableRps,
    statusCodes,
    successfulHttpSamples,
    saturation,
    targetProtocol,
    timeoutCount,
    timings,
    context
  };
  return {
    targetUrl: requestUrl,
    finalUrl,
    requestedChecks: DIAGNOSTIC_CHECK_DEFINITIONS.length,
    completedChecks: DIAGNOSTIC_CHECK_DEFINITIONS.length,
    confidence: confidence.label,
    confidenceScore: confidence.score,
    bestObservedRequestsPerSecond: bestObservedRps,
    stableRequestsPerSecond: stableRps,
    saturationPoint: saturation.value,
    successRate: rate(successfulHttpSamples.length, metricSamples.length),
    failureRate: rate(metricSamples.length - successfulHttpSamples.length, metricSamples.length),
    p95DurationMillis: percentile(durations, 0.95),
    eventLoopDelayMillis: context.eventLoopDelayMillis || 0,
    memoryDeltaBytes: context.memoryDeltaBytes || 0,
    phases,
    checks: buildDiagnosticChecks(checkContext)
  };
}

function buildDiagnosticChecks(ctx) {
  const add = (id, status, value, details = '') => {
    const definition = DIAGNOSTIC_CHECK_DEFINITIONS.find((item) => item.id === id) || def(id, 'Diagnostics', id);
    return {
      id,
      group: definition.group,
      label: definition.label,
      status,
      value: value == null ? '' : String(value),
      details: details == null ? '' : String(details)
    };
  };
  const timingAverage = (name) => average(ctx.timings.map((item) => item[name]));
  const tls = firstTimingTls(ctx.timings);
  const allStatuses = Object.keys(ctx.statusCodes);
  const firstHeaders = ctx.headers[0] || {};
  const contentTypes = uniqueValues(ctx.headers.map((headers) => firstHeader(headers, 'content-type')));
  const bodyParse = bodyParseability(ctx.metricSamples, ctx.headers);
  const certExpiry = tls?.certificate?.validTo || '';
  const certDaysRemaining = certExpiry ? daysUntil(certExpiry) : null;
  const redirectCounts = ctx.timings.map((item) => Number(item.redirectCount || 0)).filter(Number.isFinite);
  const maxRedirects = Math.max(0, ...redirectCounts);
  const redirectMillis = average(ctx.timings.map((item) => item.redirectMillis));
  const httpsToHttp = ctx.timings.some((item) => (item.redirects || []).some((redirect) => (
    protocolForUrl(redirect.from) === 'https:' && protocolForUrl(redirect.to) === 'http:'
  )));
  const sensitiveUrl = hasSensitiveUrlData(ctx.requestUrl) || hasSensitiveUrlData(ctx.finalUrl);
  const authChallenge = firstHeader(firstHeaders, 'www-authenticate');
  const cacheHeaders = matchingHeaders(ctx.headers, CACHE_HEADER_NAMES);
  const rateLimitHeaders = matchingHeaders(ctx.headers, RATE_LIMIT_HEADER_NAMES);
  const traceHeaders = matchingHeaders(ctx.headers, TRACE_HEADER_NAMES);
  const serverTiming = matchingHeaders(ctx.headers, ['server-timing']);
  const setCookies = ctx.headers.flatMap((headers) => headers['set-cookie'] || []);
  const headSample = ctx.samples.find((sample) => sample.phase === 'head-probe');
  const optionsSample = ctx.samples.find((sample) => sample.phase === 'options-probe');
  const dnsValues = sortedNumbers(ctx.timings.map((item) => item.dnsLookupMillis));
  const protocolVersions = uniqueValues(ctx.timings.map((item) => item.httpVersion).filter(Boolean));
  const payloadVariation = ctx.context.csvVariablesEnabled === true || uniqueValues(ctx.metricSamples.map((sample) => sample.requestUrl)).length > 1;
  const authenticated = String(ctx.request?.auth?.type || 'none') !== 'none';
  const retryStatuses = ctx.metricSamples.filter((sample) => TRANSIENT_STATUS_CODES.has(Number(sample.statusCode || 0)));
  const miniSoakAverage = phaseAverage(ctx.phases, 'mini-soak');
  const baselineAverage = phaseAverage(ctx.phases, 'baseline-latency');
  const responseByteSpread = spreadPercent(ctx.responseBytes);
  const durationSpread = spreadPercent(ctx.durations);

  return [
    add('url_validity', ctx.requestUrl ? 'pass' : 'fail', ctx.requestUrl ? 'valid' : 'missing', ctx.requestUrl),
    add('final_resolved_url', ctx.finalUrl ? 'pass' : 'not_available', ctx.finalUrl || 'not captured'),
    add('dns_lookup_time', timingAverage('dnsLookupMillis') ? 'pass' : 'not_available', millis(timingAverage('dnsLookupMillis'))),
    add('tcp_connect_time', timingAverage('tcpConnectMillis') ? 'pass' : 'not_available', millis(timingAverage('tcpConnectMillis'))),
    add('tls_handshake_time', ctx.targetProtocol === 'https:' ? statusForMillis(timingAverage('tlsHandshakeMillis'), 500, 1500) : 'not_available', millis(timingAverage('tlsHandshakeMillis'))),
    add('tls_protocol', tls?.protocol ? weakTlsStatus(tls.protocol) : ctx.targetProtocol === 'https:' ? 'not_available' : 'not_available', tls?.protocol || 'not captured'),
    add('tls_cipher', tls?.cipher?.name ? 'pass' : ctx.targetProtocol === 'https:' ? 'not_available' : 'not_available', tls?.cipher?.name || 'not captured'),
    add('tls_cert_issuer', tls?.certificate?.issuer ? 'pass' : ctx.targetProtocol === 'https:' ? 'not_available' : 'not_available', tls?.certificate?.issuer || 'not captured'),
    add('tls_cert_expiry', certExpiry ? expiryStatus(certDaysRemaining) : ctx.targetProtocol === 'https:' ? 'not_available' : 'not_available', certExpiry || 'not captured', certDaysRemaining == null ? '' : `${Math.round(certDaysRemaining)} days remaining`),
    add('tls_hostname_validity', tls?.authorized === true ? 'pass' : tls ? 'fail' : ctx.targetProtocol === 'https:' ? 'not_available' : 'not_available', tls?.authorized === true ? 'valid' : tls?.authorizationError || 'not captured'),
    add('redirect_count', maxRedirects > 5 ? 'warn' : 'pass', maxRedirects),
    add('redirect_time', redirectMillis > 500 ? 'warn' : 'pass', millis(redirectMillis)),
    add('request_preparation_time', statusForMillis(timingAverage('requestPreparationMillis'), 250, 1000), millis(timingAverage('requestPreparationMillis'))),
    add('upload_time', statusForMillis(timingAverage('uploadMillis'), 250, 1000), millis(timingAverage('uploadMillis'))),
    add('time_to_first_byte', statusForMillis(timingAverage('timeToFirstByteMillis'), 750, 2000), millis(timingAverage('timeToFirstByteMillis'))),
    add('download_body_read_time', statusForMillis(timingAverage('downloadMillis'), 500, 2000), millis(timingAverage('downloadMillis'))),
    add('total_request_duration', statusForMillis(average(ctx.durations), 1000, 3000), millis(average(ctx.durations))),
    add('response_bytes', ctx.responseBytes.length ? 'pass' : 'not_available', bytes(Math.round(average(ctx.responseBytes)))),
    add('content_length', firstHeader(firstHeaders, 'content-length') ? 'pass' : 'not_available', firstHeader(firstHeaders, 'content-length') || 'not declared'),
    add('compression', firstHeader(firstHeaders, 'content-encoding') ? 'pass' : 'not_available', firstHeader(firstHeaders, 'content-encoding') || 'none declared'),
    add('transfer_encoding', firstHeader(firstHeaders, 'transfer-encoding') ? 'pass' : 'not_available', firstHeader(firstHeaders, 'transfer-encoding') || 'not declared'),
    add('http_status_distribution', allStatuses.some((status) => Number(status) >= 500) ? 'fail' : allStatuses.some((status) => Number(status) >= 400) ? 'warn' : 'pass', formatCounts(ctx.statusCodes)),
    add('error_distribution', Object.keys(ctx.errors).length ? 'fail' : 'pass', formatCounts(ctx.errors) || 'no client errors'),
    add('cold_connection_latency', phaseAverage(ctx.phases, 'preflight') ? statusForMillis(phaseAverage(ctx.phases, 'preflight'), 1000, 3000) : 'not_available', millis(phaseAverage(ctx.phases, 'preflight'))),
    add('warm_keep_alive_latency', phaseAverage(ctx.phases, 'baseline-latency') ? statusForMillis(phaseAverage(ctx.phases, 'baseline-latency'), 1000, 3000) : 'not_available', millis(phaseAverage(ctx.phases, 'baseline-latency'))),
    add('connection_reuse_rate', ctx.timings.length ? rateStatus(connectionReuseRate(ctx.timings), 0.5, 0.2) : 'not_available', percent(connectionReuseRate(ctx.timings))),
    add('latency_p50', statusForMillis(percentile(ctx.durations, 0.5), 1000, 3000), millis(percentile(ctx.durations, 0.5))),
    add('latency_p90', statusForMillis(percentile(ctx.durations, 0.9), 1500, 4000), millis(percentile(ctx.durations, 0.9))),
    add('latency_p95', statusForMillis(percentile(ctx.durations, 0.95), 2000, 5000), millis(percentile(ctx.durations, 0.95))),
    add('latency_p99', statusForMillis(percentile(ctx.durations, 0.99), 2500, 7000), millis(percentile(ctx.durations, 0.99))),
    add('jitter_variance', durationSpread > 150 ? 'warn' : 'pass', `${formatNumber(durationSpread)}% spread`),
    add('outlier_count', outlierCount(ctx.durations) > 0 ? 'warn' : 'pass', outlierCount(ctx.durations)),
    add('success_rate', rateStatus(rate(ctx.successfulHttpSamples.length, ctx.metricSamples.length), 0.99, 0.95), percent(rate(ctx.successfulHttpSamples.length, ctx.metricSamples.length))),
    add('failure_rate', rate(ctx.metricSamples.length - ctx.successfulHttpSamples.length, ctx.metricSamples.length) > 0.05 ? 'fail' : rate(ctx.metricSamples.length - ctx.successfulHttpSamples.length, ctx.metricSamples.length) > 0 ? 'warn' : 'pass', percent(rate(ctx.metricSamples.length - ctx.successfulHttpSamples.length, ctx.metricSamples.length))),
    add('best_observed_rps', ctx.bestObservedRps > 0 ? 'pass' : 'not_available', `${formatNumber(ctx.bestObservedRps)} RPS`),
    add('stable_rps_estimate', ctx.stableRps > 0 ? 'pass' : 'not_available', `${formatNumber(ctx.stableRps)} RPS`),
    add('saturation_point', ctx.saturation.status, ctx.saturation.value, ctx.saturation.details),
    add('recovery_latency', phaseAverage(ctx.phases, 'recovery') ? statusForGrowth(phaseAverage(ctx.phases, 'recovery'), baselineAverage) : 'not_available', millis(phaseAverage(ctx.phases, 'recovery'))),
    add('status_consistency', allStatuses.length > 1 ? 'warn' : 'pass', allStatuses.join(', ') || 'none'),
    add('response_size_consistency', responseByteSpread > 25 ? 'warn' : 'pass', `${formatNumber(responseByteSpread)}% spread`),
    add('content_type_consistency', contentTypes.length > 1 ? 'warn' : contentTypes.length ? 'pass' : 'not_available', contentTypes.join(', ') || 'not declared'),
    add('body_parseability', bodyParse.status, bodyParse.value, bodyParse.details),
    add('response_fingerprint_consistency', uniqueValues(ctx.responseHashes).length > 1 ? 'warn' : ctx.responseHashes.length ? 'pass' : 'not_available', `${uniqueValues(ctx.responseHashes).length || 0} fingerprint(s)`),
    add('header_consistency', uniqueValues(ctx.headerFingerprints).length > 1 ? 'warn' : ctx.headerFingerprints.length ? 'pass' : 'not_available', `${uniqueValues(ctx.headerFingerprints).length || 0} header shape(s)`),
    add('cache_headers', cacheHeaders.length ? 'pass' : 'not_available', cacheHeaders.join(', ') || 'not declared'),
    add('rate_limit_headers', rateLimitHeaders.length || retryStatuses.length ? 'warn' : 'pass', rateLimitHeaders.join(', ') || 'no rate-limit signal'),
    add('server_timing_headers', serverTiming.length ? 'pass' : 'not_available', serverTiming.join(', ') || 'not declared'),
    add('trace_headers', traceHeaders.length ? 'pass' : 'not_available', traceHeaders.join(', ') || 'not declared'),
    add('set_cookie_churn', setCookies.length > 1 ? 'warn' : setCookies.length ? 'pass' : 'not_available', `${setCookies.length} Set-Cookie header(s)`),
    add('redirect_target_stability', uniqueValues(ctx.finalUrls).length > 1 ? 'warn' : ctx.finalUrls.length ? 'pass' : 'not_available', `${uniqueValues(ctx.finalUrls).length || 0} target(s)`),
    add('tls_expires_soon', certExpiry ? expiryStatus(certDaysRemaining) : ctx.targetProtocol === 'https:' ? 'not_available' : 'not_available', certDaysRemaining == null ? 'not captured' : `${Math.round(certDaysRemaining)} days`),
    add('tls_hostname_mismatch', tls?.authorized === false ? 'fail' : tls?.authorized === true ? 'pass' : ctx.targetProtocol === 'https:' ? 'not_available' : 'not_available', tls?.authorizationError || (tls?.authorized === true ? 'none' : 'not captured')),
    add('weak_tls_protocol', tls?.protocol ? weakTlsStatus(tls.protocol) : ctx.targetProtocol === 'https:' ? 'not_available' : 'not_available', tls?.protocol || 'not captured'),
    add('missing_https', ctx.targetProtocol === 'https:' || isLocalEndpoint(ctx.finalUrl || ctx.requestUrl) ? 'pass' : 'warn', ctx.targetProtocol || 'unknown'),
    add('https_to_http_redirect', httpsToHttp ? 'fail' : 'pass', httpsToHttp ? 'detected' : 'not detected'),
    add('excessive_redirect_chain', maxRedirects > 5 ? 'warn' : 'pass', maxRedirects),
    add('sensitive_data_in_url', sensitiveUrl ? 'warn' : 'pass', sensitiveUrl ? 'sensitive-looking query key found' : 'not detected'),
    add('auth_challenge_patterns', authChallenge ? 'warn' : 'pass', authChallenge || 'no auth challenge'),
    add('cors_headers', ctx.corsHeaders.length ? 'pass' : 'not_available', ctx.corsHeaders.join(', ') || 'not declared'),
    add('security_headers', ctx.securityHeaders.length >= 3 ? 'pass' : ctx.securityHeaders.length ? 'warn' : 'not_available', ctx.securityHeaders.join(', ') || 'not declared'),
    add('local_event_loop_delay', statusForMillis(ctx.context.eventLoopDelayMillis || 0, 100, 250), millis(ctx.context.eventLoopDelayMillis || 0)),
    add('scheduler_lag', statusForMillis(average(ctx.metricSamples.map((sample) => sample.schedulerLagMillis)), 100, 250), millis(average(ctx.metricSamples.map((sample) => sample.schedulerLagMillis)))),
    add('local_request_queue_depth', ctx.context.maxActiveRequests > ctx.context.maxConcurrency ? 'warn' : 'pass', `${ctx.context.maxActiveRequests || 0}/${ctx.context.maxConcurrency || 0}`),
    add('client_side_timeout_count', ctx.timeoutCount ? 'fail' : 'pass', ctx.timeoutCount),
    add('memory_growth', memoryGrowthStatus(ctx.context.memoryDeltaBytes), bytes(ctx.context.memoryDeltaBytes || 0)),
    add('safety_caps_limited_result', ctx.safetyLimited ? 'warn' : 'pass', ctx.safetyLimited ? 'limited' : 'not limited'),
    add('client_saturation_before_endpoint', ctx.context.eventLoopDelayMillis > 250 ? 'warn' : 'pass', ctx.context.eventLoopDelayMillis > 250 ? 'local event-loop pressure detected' : 'not detected'),
    add('confidence_score', ctx.confidence.score >= 80 ? 'pass' : ctx.confidence.score >= 60 ? 'warn' : 'fail', `${ctx.confidence.score}/100`, ctx.confidence.reasons.join('; ')),
    add('head_probe', headSample ? statusForProbe(headSample) : 'not_available', headSample ? statusLabel(headSample.statusCode) : 'not run'),
    add('options_probe', optionsSample ? statusForProbe(optionsSample) : 'not_available', optionsSample ? statusLabel(optionsSample.statusCode) : 'not run'),
    add('http_protocol_comparison', protocolVersions.length > 1 ? 'pass' : protocolVersions.length ? 'not_available' : 'not_available', protocolVersions.join(', ') || 'not captured'),
    add('dns_repeatability', dnsValues.length > 1 ? (spreadPercent(dnsValues) > 100 ? 'warn' : 'pass') : 'not_available', dnsValues.length > 1 ? `${formatNumber(spreadPercent(dnsValues))}% spread` : 'insufficient DNS samples'),
    add('payload_variation', payloadVariation ? 'pass' : 'not_available', payloadVariation ? 'detected/configured' : 'not configured'),
    add('authenticated_baseline_comparison', authenticated ? (authChallenge ? 'warn' : 'pass') : 'not_available', authenticated ? 'authenticated request tested' : 'request has no auth'),
    add('retry_behavior', retryStatuses.length ? 'warn' : 'pass', retryStatuses.length ? `${retryStatuses.length} transient response(s)` : 'no retry signal'),
    add('mini_soak_stability', miniSoakAverage ? statusForGrowth(miniSoakAverage, baselineAverage) : 'not_available', miniSoakAverage ? millis(miniSoakAverage) : 'not run')
  ];
}

function summarizePhases(samples) {
  const byPhase = new Map();
  for (const sample of samples) {
    const phase = sample.phase || sample.stageName || 'default';
    if (!byPhase.has(phase)) {
      byPhase.set(phase, []);
    }
    byPhase.get(phase).push(sample);
  }
  return Array.from(byPhase.entries()).map(([phase, items]) => {
    const durations = sortedNumbers(items.map((sample) => sample.durationMillis));
    const firstStarted = Math.min(...items.map((sample) => Date.parse(sample.startedAt || '')).filter(Number.isFinite));
    const lastStarted = Math.max(...items.map((sample) => Date.parse(sample.startedAt || '')).filter(Number.isFinite));
    const wallClockMillis = Math.max(1, (Number.isFinite(lastStarted) && Number.isFinite(firstStarted) ? lastStarted - firstStarted : 0) + average(durations));
    return {
      phase,
      requests: items.length,
      concurrency: Math.max(1, ...items.map((sample) => Number(sample.stageConcurrency || 1))),
      successfulResponses: items.filter(isDiagnosisPhaseSuccess).length,
      failedResponses: items.filter((sample) => !isDiagnosisPhaseSuccess(sample)).length,
      averageDurationMillis: average(durations),
      p95DurationMillis: percentile(durations, 0.95),
      requestsPerSecond: items.length / (wallClockMillis / 1000)
    };
  });
}

function stableRequestsPerSecond(phases) {
  const candidates = phases.filter((phase) => (
    /^throughput/.test(phase.phase)
    && phase.failedResponses === 0
    && Number(phase.p95DurationMillis || 0) < 2000
  ));
  return Math.max(0, ...candidates.map((phase) => Number(phase.requestsPerSecond || 0)));
}

function saturationPoint(phases) {
  const throughput = phases.filter((phase) => /^throughput|spike/.test(phase.phase));
  if (!throughput.length) {
    return { status: 'not_available', value: 'not reached', details: '' };
  }
  const baseline = phaseAverage(phases, 'baseline-latency');
  const saturated = throughput.find((phase) => (
    phase.failedResponses > 0
    || (baseline > 0 && phase.p95DurationMillis > baseline * 2)
  ));
  if (!saturated) {
    const peak = throughput.at(-1);
    return {
      status: 'pass',
      value: `${peak.concurrency} users`,
      details: 'No saturation found within configured safety caps.'
    };
  }
  return {
    status: saturated.failedResponses > 0 ? 'fail' : 'warn',
    value: `${saturated.concurrency} users`,
    details: saturated.failedResponses > 0 ? 'Errors appeared at this stage.' : 'Latency grew sharply at this stage.'
  };
}

function confidenceScore({ samples, eventLoopDelayMillis, safetyLimited, timeoutCount }) {
  const reasons = [];
  let score = 100;
  if (samples.length < 10) {
    score -= 25;
    reasons.push('low sample count');
  }
  if (safetyLimited) {
    score -= 15;
    reasons.push('safety caps or cancellation limited the run');
  }
  if (eventLoopDelayMillis > 250) {
    score -= 20;
    reasons.push('local event-loop pressure');
  } else if (eventLoopDelayMillis > 100) {
    score -= 10;
    reasons.push('moderate local event-loop pressure');
  }
  if (timeoutCount > 0) {
    score -= 20;
    reasons.push('client-side timeout observed');
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    label: score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low',
    reasons: reasons.length ? reasons : ['diagnostic run completed within configured limits']
  };
}

function bodyParseability(samples, headers) {
  let checked = 0;
  let failed = 0;
  samples.forEach((sample, index) => {
    const contentType = firstHeader(headers[index] || {}, 'content-type');
    const body = sample.responseBody;
    if (!body || !/json|xml|text/i.test(contentType)) {
      return;
    }
    checked += 1;
    if (/json/i.test(contentType)) {
      try {
        JSON.parse(body);
      } catch {
        failed += 1;
      }
    }
  });
  if (!checked) {
    return { status: 'not_available', value: 'not checked', details: 'No parseable response media type was captured.' };
  }
  return failed
    ? { status: 'warn', value: `${failed}/${checked} failed`, details: 'At least one captured body did not parse as declared.' }
    : { status: 'pass', value: `${checked}/${checked} parsed`, details: '' };
}

function statusForProbe(sample) {
  const statusCode = Number(sample?.statusCode || 0);
  if (statusCode >= 200 && statusCode < 400) {
    return 'pass';
  }
  if (statusCode === 405 || statusCode === 501) {
    return 'not_available';
  }
  return statusCode >= 400 ? 'warn' : 'not_available';
}

function isDiagnosisPhaseSuccess(sample = {}) {
  return isHttpSuccess(sample.statusCode) || isUnsupportedMethodProbe(sample);
}

function isUnsupportedMethodProbe(sample = {}) {
  const statusCode = Number(sample?.statusCode || 0);
  return (sample.phase === 'head-probe' || sample.phase === 'options-probe')
    && (statusCode === 405 || statusCode === 501);
}

function statusLabel(statusCode) {
  return `HTTP ${Number(statusCode || 0)}`;
}

function firstTimingTls(timings) {
  return timings.map((item) => item.tls).find((item) => item && typeof item === 'object') || null;
}

function statusForMillis(value, warnAt, failAt) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    return 'not_available';
  }
  if (number >= failAt) {
    return 'fail';
  }
  if (number >= warnAt) {
    return 'warn';
  }
  return 'pass';
}

function statusForGrowth(value, baseline) {
  if (!Number.isFinite(Number(value)) || value <= 0 || !Number.isFinite(Number(baseline)) || baseline <= 0) {
    return 'not_available';
  }
  if (value >= baseline * 2) {
    return 'warn';
  }
  return 'pass';
}

function weakTlsStatus(protocol) {
  return /^TLSv1(?:$|\.0|\.1)/i.test(String(protocol || '')) ? 'warn' : 'pass';
}

function expiryStatus(daysRemaining) {
  if (!Number.isFinite(Number(daysRemaining))) {
    return 'not_available';
  }
  if (daysRemaining <= 7) {
    return 'fail';
  }
  if (daysRemaining <= 30) {
    return 'warn';
  }
  return 'pass';
}

function memoryGrowthStatus(bytesValue) {
  const value = Number(bytesValue || 0);
  if (value > 100 * 1024 * 1024) {
    return 'warn';
  }
  return 'pass';
}

function rateStatus(value, passAt, warnAt) {
  const number = Number(value || 0);
  if (number >= passAt) {
    return 'pass';
  }
  if (number >= warnAt) {
    return 'warn';
  }
  return 'fail';
}

function rate(part, total) {
  return total > 0 ? part / total : 0;
}

function connectionReuseRate(timings) {
  return rate(timings.filter((item) => item.reusedSocket === true).length, timings.length);
}

function phaseAverage(phases, phaseName) {
  return Number(phases.find((phase) => phase.phase === phaseName)?.averageDurationMillis || 0);
}

function sortedNumbers(values) {
  return values
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
}

function percentile(values, rank) {
  const sorted = Array.isArray(values) ? values : sortedNumbers(values);
  if (!sorted.length) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * rank) - 1));
  return sorted[index];
}

function average(values) {
  const numbers = sortedNumbers(values);
  if (!numbers.length) {
    return 0;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function spreadPercent(values) {
  const numbers = sortedNumbers(values);
  if (numbers.length < 2) {
    return 0;
  }
  const avg = average(numbers);
  if (avg <= 0) {
    return 0;
  }
  return ((numbers.at(-1) - numbers[0]) / avg) * 100;
}

function outlierCount(values) {
  const numbers = sortedNumbers(values);
  if (numbers.length < 4) {
    return 0;
  }
  const p95 = percentile(numbers, 0.95);
  const median = percentile(numbers, 0.5);
  return numbers.filter((value) => value > Math.max(p95, median * 3)).length;
}

function counts(values) {
  const output = {};
  for (const value of values) {
    output[value] = (output[value] || 0) + 1;
  }
  return output;
}

function errorCounts(samples) {
  const output = {};
  for (const sample of samples) {
    if (sample.error) {
      output[sample.error] = (output[sample.error] || 0) + 1;
    }
  }
  return output;
}

function normalizeHeaders(headers) {
  const output = {};
  for (const [name, value] of Object.entries(headers || {})) {
    output[String(name).toLowerCase()] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return output;
}

function firstHeader(headers, name) {
  const value = normalizeHeaders(headers)[String(name || '').toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : '';
}

function matchingHeaders(headersList, names) {
  const found = new Set();
  for (const headers of headersList) {
    const normalized = normalizeHeaders(headers);
    for (const name of names) {
      if (normalized[name]) {
        found.add(name);
      }
    }
  }
  return Array.from(found).sort();
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || '')).filter(Boolean))];
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function formatCounts(value) {
  return Object.entries(value || {})
    .map(([name, count]) => `${name}: ${count}`)
    .join(', ');
}

function millis(value) {
  return `${formatNumber(value)} ms`;
}

function percent(value) {
  return `${formatNumber(Number(value || 0) * 100)}%`;
}

function bytes(value) {
  const number = Math.max(0, Number(value || 0));
  if (number >= 1024 * 1024) {
    return `${formatNumber(number / (1024 * 1024))} MB`;
  }
  if (number >= 1024) {
    return `${formatNumber(number / 1024)} KB`;
  }
  return `${formatNumber(number)} B`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return '0';
  }
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function protocolForUrl(value) {
  try {
    return new URL(value).protocol;
  } catch {
    return '';
  }
}

function isLocalEndpoint(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function hasSensitiveUrlData(value) {
  try {
    const url = new URL(value);
    return Array.from(url.searchParams.keys()).some((key) => SENSITIVE_QUERY_PATTERN.test(key));
  } catch {
    return false;
  }
}

function daysUntil(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return (timestamp - Date.now()) / (24 * 60 * 60 * 1000);
}

function isHttpSuccess(statusCode) {
  const status = Number(statusCode || 0);
  return status >= 200 && status < 400;
}

function integerAtLeast(value, min, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= min ? Math.floor(number) : fallback;
}

module.exports = {
  DEFAULT_DIAGNOSIS_CONCURRENCY,
  DEFAULT_DIAGNOSIS_SCOPE,
  DEFAULT_DIAGNOSIS_SPIKE_MULTIPLIER,
  DEFAULT_DIAGNOSIS_TOTAL_REQUESTS,
  DIAGNOSIS_TYPE,
  DIAGNOSIS_SCOPE_PROFILES,
  DIAGNOSIS_SCOPE_VALUES,
  DIAGNOSTIC_CHECK_DEFINITIONS,
  buildDiagnosisStages,
  diagnosisEffectiveConcurrency,
  diagnosisPlannedRequestCount,
  diagnosisScopeProfile,
  normalizeDiagnosisScope,
  summarizeEndpointDiagnosis
};
