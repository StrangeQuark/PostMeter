const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');
const { BODY_METHODS, BODY_TYPES, SUPPORTED_METHODS } = require('./models');
const { resolveEnvironmentValue } = require('./environmentResolver');
const { applyAuth, maybeRefreshOAuthToken, normalizeAuth, validateAuth } = require('./auth');
const { cookiesForRequest, mergeCookieHeader, updateCookiesFromResponse } = require('./cookieJar');

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MANAGED_HEADERS = new Set(['content-length']);
const REQUEST_TIMEOUT_MILLIS = 60_000;
const MAX_REDIRECTS = 10;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function validateRequest(request, environment) {
  const errors = [];
  if (!request) {
    return ['Request is required.'];
  }
  if (!SUPPORTED_METHODS.has(request.method)) {
    errors.push(`Unsupported HTTP method: ${request.method}.`);
  }
  let builtUrl = null;
  if (!request.url || !String(request.url).trim()) {
    errors.push('Request URL is required.');
  } else {
    try {
      builtUrl = buildUrl(request, environment);
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
  if (builtUrl && normalizeAuth(request.auth).type === 'clientCertificate' && builtUrl.protocol !== 'https:') {
    errors.push('Client certificate auth requires an https URL.');
  }
  return errors;
}

async function sendRequest(request, environment, options = {}) {
  const prepared = await prepareRequestForSend(request, environment, options);
  const requestForSend = prepared.request;
  const validationErrors = validateRequest(requestForSend, environment);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  const url = buildUrl(requestForSend, environment);
  const headers = {};
  let hasContentType = false;
  for (const header of requestForSend.headers || []) {
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
  applyAuth(requestForSend, environment, { url, headers });
  applyCookieJar(requestForSend, headers, url, options.cookieJar || []);

  const method = requestForSend.method;
  const bodyType = requestForSend.bodyType || BODY_TYPES.NONE;
  const shouldSendBody = bodyType !== BODY_TYPES.NONE && BODY_METHODS.has(method);
  const fetchOptions = {
    method,
    headers,
    redirect: 'follow',
    signal: options.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MILLIS)
  };

  if (shouldSendBody) {
    if (!hasContentType) {
      headers['Content-Type'] = bodyType === BODY_TYPES.RAW_JSON ? 'application/json' : 'text/plain; charset=utf-8';
    }
    fetchOptions.body = resolveEnvironmentValue(requestForSend.body ?? '', environment);
  }

  const started = performance.now();
  const tlsOptions = await loadClientCertificateOptions(requestForSend.auth, environment, url);
  const response = tlsOptions
    ? await sendNodeRequest(url, fetchOptions, tlsOptions)
    : await fetch(url, fetchOptions);
  const body = typeof response.text === 'function' ? await response.text() : response.body;
  const durationMillis = Math.max(0, Math.round(performance.now() - started));
  const responseHeaders = headersToObject(response.headers);
  const result = {
    statusCode: response.status || response.statusCode,
    headers: responseHeaders,
    body,
    durationMillis,
    responseBytes: Buffer.byteLength(body, 'utf8'),
    finalUrl: response.url || url.toString()
  };
  if (requestForSend.cookieJar?.enabled === true && requestForSend.cookieJar?.storeResponses !== false) {
    result.updatedCookies = updateCookiesFromResponse(options.cookieJar || [], responseHeaders['set-cookie'], new URL(result.finalUrl || url.toString()));
  }
  if (prepared.updatedAuth) {
    result.updatedAuth = prepared.updatedAuth;
  }
  return result;
}

function applyCookieJar(request, headers, url, cookieJar) {
  if (request.cookieJar?.enabled !== true) {
    return;
  }
  const cookies = cookiesForRequest(cookieJar, url);
  if (!cookies.length) {
    return;
  }
  const existingName = Object.keys(headers).find((name) => name.toLowerCase() === 'cookie');
  const merged = mergeCookieHeader(existingName ? headers[existingName] : '', cookies);
  if (!merged) {
    return;
  }
  if (existingName) {
    headers[existingName] = merged;
  } else {
    headers.Cookie = merged;
  }
}

async function loadClientCertificateOptions(auth = {}, environment, url) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'clientCertificate') {
    return null;
  }
  if (url.protocol !== 'https:') {
    throw new Error('Client certificate auth requires an https URL.');
  }

  const passphrase = resolveEnvironmentValue(normalized.passphrase, environment);
  const caPath = resolveEnvironmentValue(normalized.caPath, environment).trim();
  const ca = caPath ? await readCertificateFile(caPath, 'CA certificate') : undefined;
  const pfxPath = resolveEnvironmentValue(normalized.pfxPath, environment).trim();
  if (pfxPath) {
    return {
      pfx: await readCertificateFile(pfxPath, 'PFX/P12 bundle'),
      ca,
      passphrase: passphrase || undefined
    };
  }

  const certPath = resolveEnvironmentValue(normalized.certPath, environment).trim();
  const keyPath = resolveEnvironmentValue(normalized.keyPath, environment).trim();
  return {
    cert: await readCertificateFile(certPath, 'PEM certificate'),
    key: await readCertificateFile(keyPath, 'PEM key'),
    ca,
    passphrase: passphrase || undefined
  };
}

async function readCertificateFile(filePath, label) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    const reason = error?.code ? `${error.code}` : (error?.message || 'unknown error');
    throw new Error(`Unable to read client certificate ${label}: ${reason}.`);
  }
}

async function sendNodeRequest(url, requestOptions, tlsOptions, redirectCount = 0, originalOrigin = url.origin) {
  const response = await sendSingleNodeRequest(url, requestOptions, tlsOptions);
  const location = response.headers.location?.[0];
  if (!REDIRECT_STATUS_CODES.has(response.statusCode) || !location) {
    return response;
  }
  if (redirectCount >= MAX_REDIRECTS) {
    throw new Error(`Request exceeded ${MAX_REDIRECTS} redirects.`);
  }

  const redirectUrl = new URL(location, url);
  if (redirectUrl.protocol !== 'https:') {
    throw new Error('Client certificate redirects must stay on https URLs.');
  }
  if (redirectUrl.origin !== originalOrigin) {
    throw new Error('Client certificate redirects must stay on the original origin.');
  }

  const nextOptions = {
    ...requestOptions,
    headers: { ...requestOptions.headers }
  };
  if ([301, 302, 303].includes(response.statusCode) && nextOptions.method !== 'GET' && nextOptions.method !== 'HEAD') {
    nextOptions.method = 'GET';
    delete nextOptions.body;
    deleteHeader(nextOptions.headers, 'content-type');
  }
  return sendNodeRequest(redirectUrl, nextOptions, tlsOptions, redirectCount + 1, originalOrigin);
}

function sendSingleNodeRequest(url, requestOptions, tlsOptions) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const nodeOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: requestOptions.method,
      headers: requestOptions.headers,
      signal: requestOptions.signal,
      ...(url.protocol === 'https:' ? tlsOptions : {})
    };
    const request = transport.request(nodeOptions, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        resolve({
          statusCode: response.statusCode || 0,
          headers: headersToObject(response.headers),
          body: bodyBuffer.toString('utf8'),
          url: url.toString()
        });
      });
    });

    request.on('error', reject);
    if (requestOptions.body != null) {
      request.write(requestOptions.body);
    }
    request.end();
  });
}

async function prepareRequestForSend(request, environment, options) {
  const refreshed = await maybeRefreshOAuthToken(request?.auth, environment, {
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    now: options.now
  });
  if (!refreshed.refreshed) {
    return { request, updatedAuth: null };
  }
  return {
    request: { ...request, auth: refreshed.auth },
    updatedAuth: refreshed.auth
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
  if (!headers) {
    return result;
  }
  if (typeof headers.getSetCookie === 'function') {
    const setCookies = headers.getSetCookie();
    if (setCookies.length) {
      result['set-cookie'] = setCookies;
    }
  }
  if (typeof headers.entries === 'function') {
    for (const [key, value] of headers.entries()) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'set-cookie' && result['set-cookie']?.length) {
        continue;
      }
      result[normalizedKey] = [value];
    }
    return result;
  }
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return result;
}

function deleteHeader(headers, headerName) {
  const target = headerName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      delete headers[key];
    }
  }
}

module.exports = {
  buildUrl,
  applyCookieJar,
  loadClientCertificateOptions,
  prepareRequestForSend,
  sendRequest,
  sendNodeRequest,
  validateRequest
};
