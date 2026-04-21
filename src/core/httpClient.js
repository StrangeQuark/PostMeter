const { performance } = require('node:perf_hooks');
const { BODY_METHODS, BODY_TYPES, SUPPORTED_METHODS } = require('./models');
const { resolveEnvironmentValue } = require('./environmentResolver');
const { applyAuth, validateAuth } = require('./auth');

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MANAGED_HEADERS = new Set(['content-length']);

function validateRequest(request, environment) {
  const errors = [];
  if (!request) {
    return ['Request is required.'];
  }
  if (!SUPPORTED_METHODS.has(request.method)) {
    errors.push(`Unsupported HTTP method: ${request.method}.`);
  }
  if (!request.url || !String(request.url).trim()) {
    errors.push('Request URL is required.');
  } else {
    try {
      buildUrl(request, environment);
    } catch (error) {
      errors.push(error.message);
    }
  }

  for (const header of request.headers || []) {
    if (header.enabled === false || !hasKey(header)) {
      continue;
    }
    const name = resolveEnvironmentValue(header.key.trim(), environment);
    const headerError = validateHeaderName(name);
    if (headerError) {
      errors.push(headerError);
    }
  }
  errors.push(...validateAuth(request.auth, environment));
  return errors;
}

async function sendRequest(request, environment, options = {}) {
  const validationErrors = validateRequest(request, environment);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  const url = buildUrl(request, environment);
  const headers = {};
  let hasContentType = false;
  for (const header of request.headers || []) {
    if (header.enabled === false || !hasKey(header)) {
      continue;
    }
    const name = resolveEnvironmentValue(header.key.trim(), environment);
    const value = resolveEnvironmentValue(header.value ?? '', environment);
    if (MANAGED_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    if (name.toLowerCase() === 'content-type') {
      hasContentType = true;
    }
    headers[name] = value;
  }
  applyAuth(request, environment, { url, headers });

  const method = request.method;
  const bodyType = request.bodyType || BODY_TYPES.NONE;
  const shouldSendBody = bodyType !== BODY_TYPES.NONE && BODY_METHODS.has(method);
  const fetchOptions = {
    method,
    headers,
    redirect: 'follow',
    signal: options.signal || AbortSignal.timeout(60_000)
  };

  if (shouldSendBody) {
    if (!hasContentType) {
      headers['Content-Type'] = bodyType === BODY_TYPES.RAW_JSON ? 'application/json' : 'text/plain; charset=utf-8';
    }
    fetchOptions.body = resolveEnvironmentValue(request.body ?? '', environment);
  }

  const started = performance.now();
  const response = await fetch(url, fetchOptions);
  const body = await response.text();
  const durationMillis = Math.max(0, Math.round(performance.now() - started));
  return {
    statusCode: response.status,
    headers: headersToObject(response.headers),
    body,
    durationMillis,
    responseBytes: Buffer.byteLength(body, 'utf8'),
    finalUrl: response.url || url.toString()
  };
}

function buildUrl(request, environment) {
  const resolvedUrl = resolveEnvironmentValue(request.url, environment).trim();
  let url;
  try {
    url = new URL(resolvedUrl);
  } catch (error) {
    throw new Error('URL is not a valid URI.');
  }

  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new Error('Only http and https URLs are supported.');
  }
  if (!url.hostname) {
    throw new Error('URL must include a host.');
  }

  for (const pair of request.queryParams || []) {
    if (pair.enabled === false || !hasKey(pair)) {
      continue;
    }
    url.searchParams.append(
      resolveEnvironmentValue(pair.key.trim(), environment),
      resolveEnvironmentValue(pair.value ?? '', environment)
    );
  }
  return url;
}

function validateHeaderName(name) {
  if (!name || !String(name).trim()) {
    return 'Header name cannot be blank.';
  }
  if (!HEADER_NAME.test(name)) {
    return `Invalid header name: ${name}.`;
  }
  return null;
}

function hasKey(pair) {
  return pair && pair.key && String(pair.key).trim();
}

function headersToObject(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    result[key] = [value];
  }
  return result;
}

module.exports = {
  buildUrl,
  sendRequest,
  validateRequest
};
