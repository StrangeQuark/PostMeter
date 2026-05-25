const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const http = require('node:http');
const http2 = require('node:http2');
const https = require('node:https');
const path = require('node:path');
const tls = require('node:tls');
const zlib = require('node:zlib');
const { performance } = require('node:perf_hooks');
const { BODY_METHODS, BODY_TYPES, SUPPORTED_METHODS } = require('../workspace/models');
const { resolveEnvironmentValue } = require('../workspace/environmentResolver');
const {
  applyAuth,
  applyDigestChallengeAuth,
  buildNtlmType3AuthorizationHeader,
  maybeRefreshOAuthToken,
  normalizeAuth,
  parseDigestChallenge,
  validateAuth
} = require('./auth');
const { cookiesForRequest, mergeCookieHeader, updateCookiesFromResponse } = require('./cookieJar');
const {
  MAX_ATTACHMENT_BYTES,
  resolveFileAttachmentBinding
} = require('./fileAttachmentBindings');
const { enabledQueryParams, urlQueryMatchesPairs } = require('../workspace/requestQueryModel');
const {
  loadClientCertificateOptions,
  resolveHttpTlsPolicy
} = require('./tlsSettings');
const {
  DEFAULT_REQUEST_MAX_REDIRECTS,
  normalizeRequestSettings,
  requestSettingsRequireNodeTransport
} = require('./requestSettings');

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MANAGED_HEADERS = new Set(['content-length']);
const REQUEST_TIMEOUT_MILLIS = 3 * 60 * 1000;
const MAX_REDIRECTS = DEFAULT_REQUEST_MAX_REDIRECTS;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_SCHEMELESS_REQUEST_PROTOCOL = 'http:';
const POSTMETER_USER_AGENT = 'PostMeter/0.2.0';
const POSTMETER_TOKEN_HEADER = 'PostMeter-Token';
const FILE_EXTENSION_CONTENT_TYPES = new Map(Object.entries({
  '.avif': 'image/avif',
  '.bin': 'application/octet-stream',
  '.bmp': 'image/bmp',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.mjs': 'application/javascript',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tar': 'application/x-tar',
  '.text': 'text/plain',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.zip': 'application/zip'
}));

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
  const proxyError = validateProxyConfig(request.proxy, environment);
  if (proxyError) {
    errors.push(proxyError);
  }
  return errors;
}

async function sendRequest(request, environment, options = {}) {
  const requestStarted = performance.now();
  const prepared = await prepareRequestForSend(request, environment, options);
  const requestForSend = prepared.request;
  const validationErrors = validateRequest(requestForSend, environment);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  const requestSettings = normalizeRequestSettings(requestForSend.settings || {});
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
  const method = requestForSend.method;
  const bodyType = requestForSend.bodyType || BODY_TYPES.NONE;
  const shouldSendBody = bodyType !== BODY_TYPES.NONE && BODY_METHODS.has(method);
  const followRedirects = requestForSend.followRedirects === false ? false : requestSettings.followRedirects !== false;
  let body = null;
  const fetchOptions = {
    method,
    headers,
    redirect: followRedirects ? 'follow' : 'manual',
    signal: requestSignal(options.signal, options.timeoutMillis)
  };

  if (shouldSendBody) {
    if (!hasContentType) {
      headers['Content-Type'] = defaultContentTypeForBodyType(bodyType);
    }
    body = Buffer.isBuffer(requestForSend.body)
      ? requestForSend.body
      : resolveEnvironmentValue(requestForSend.body ?? '', environment);
    fetchOptions.body = body;
  }
  applyAutoGeneratedRequestHeaders(headers, requestForSend, body);
  const authTarget = { body: body || '', bodyType, headers, method, now: options.now, url };
  applyAuth(requestForSend, environment, authTarget);
  if (shouldSendBody && authTarget.body !== body) {
    body = authTarget.body;
    fetchOptions.body = body;
    setManagedHeader(headers, 'Content-Length', bodyByteLength(body));
  }
  const cookieJarState = createCookieJarState(requestForSend, headers, url, options.cookieJar || []);
  if (cookieJarState) {
    applyCookieJarStateHeader(headers, url, cookieJarState);
  } else {
    applyCookieJar(requestForSend, headers, url, options.cookieJar || []);
  }

  const started = performance.now();
  const tlsPolicy = await resolveHttpTlsPolicy(requestForSend, environment, url, {
    clientCertificates: options.clientCertificates || [],
    tlsSettings: options.tlsSettings || {}
  });
  const proxyOptions = normalizeProxyConfig(requestForSend.proxy, environment);
  const response = await sendWithAuthRetries(requestForSend, environment, url, fetchOptions, {
    agent: options.agent,
    body: body || '',
    collectTimings: options.collectTimings,
    forceNode: options.forceNode,
    now: options.now,
    proxyOptions,
    requestSettings,
    tlsOptions: tlsPolicy.tlsOptions,
    tlsPolicy,
    cookieJarState
  });
  const responseBody = typeof response.text === 'function' ? await response.text() : response.body;
  const durationMillis = Math.max(0, Math.round(performance.now() - started));
  const responseHeaders = headersToObject(response.headers);
  const result = {
    statusCode: response.status || response.statusCode,
    headers: responseHeaders,
    body: responseBody,
    durationMillis,
    responseBytes: Buffer.byteLength(responseBody, 'utf8'),
    finalUrl: response.url || url.toString()
  };
  if (requestForSend.cookieJar?.enabled === true && requestForSend.cookieJar?.storeResponses !== false) {
    result.updatedCookies = cookieJarState?.cookies
      || updateCookiesFromResponse(options.cookieJar || [], responseHeaders['set-cookie'], new URL(result.finalUrl || url.toString()));
  }
  if (prepared.updatedAuth) {
    result.updatedAuth = prepared.updatedAuth;
  }
  if (options.collectTimings === true || response.timings) {
    result.timings = {
      ...(response.timings || {}),
      requestPreparationMillis: Math.max(0, Math.round((response.timings?.transportStartedAt || performance.now()) - requestStarted))
    };
    delete result.timings.transportStartedAt;
  }
  if (response.timings?.tls || tlsPolicy.tlsDiagnostics) {
    result.tls = {
      ...(response.timings?.tls || {}),
      ...(tlsPolicy.tlsDiagnostics || {})
    };
  }
  return result;
}

async function sendWithAuthRetries(request, environment, url, fetchOptions, options = {}) {
  const auth = normalizeAuth(request.auth);
  const ntlmAgent = auth.type === 'ntlm' && !options.proxyOptions ? nodeAgentForUrl(url, options.tlsOptions) : null;
  const transportOptions = ntlmAgent ? { ...options, forceNode: true, agent: ntlmAgent } : options;
  const response = await sendWithTransport(url, fetchOptions, transportOptions);
  if ((response.status || response.statusCode) !== 401) {
    ntlmAgent?.destroy?.();
    return response;
  }
  const headers = headersToObject(response.headers);
  if (auth.type === 'ntlm') {
    if (auth.disableRetryingRequest === true) {
      ntlmAgent?.destroy?.();
      return response;
    }
    const challenge = headers['www-authenticate'];
    if (!challenge || !String(Array.isArray(challenge) ? challenge.join(', ') : challenge).match(/\bNTLM\s+\S+/i)) {
      ntlmAgent?.destroy?.();
      return response;
    }
    if (typeof response.text === 'function') {
      await response.text().catch(() => {});
    }
    const retryOptions = {
      ...fetchOptions,
      headers: { ...fetchOptions.headers }
    };
    retryOptions.headers.Authorization = buildNtlmType3AuthorizationHeader(request.auth, environment, challenge, { now: options.now });
    applyCookieJarStateHeader(retryOptions.headers, url, options.cookieJarState);
    const retryResponse = await sendWithTransport(url, retryOptions, transportOptions);
    ntlmAgent?.destroy?.();
    return retryResponse;
  }
  if (auth.type !== 'digest') {
    return response;
  }
  if (auth.disableRetryingRequest === true) {
    return response;
  }
  const challenge = parseDigestChallenge(headers['www-authenticate']);
  if (!challenge) {
    return response;
  }
  if (typeof response.text === 'function') {
    await response.text().catch(() => {});
  }
  const retryOptions = {
    ...fetchOptions,
    headers: { ...fetchOptions.headers }
  };
  applyDigestChallengeAuth(request, environment, {
    body: options.body || '',
    headers: retryOptions.headers,
    method: retryOptions.method,
    now: options.now,
    url
  }, challenge);
  applyCookieJarStateHeader(retryOptions.headers, url, options.cookieJarState);
  return sendWithTransport(url, retryOptions, options);
}

async function sendWithTransport(url, fetchOptions, options = {}) {
  const requestSettings = normalizeRequestSettings(options.requestSettings || {});
  if (requestSettings.httpVersion === 'http2') {
    if (options.proxyOptions) {
      throw new Error('HTTP/2 requests through proxies are not supported yet.');
    }
    return sendHttp2Request(url, fetchOptions, options.tlsOptions, 0, url.origin, {
      collectTimings: options.collectTimings,
      cookieJarState: options.cookieJarState,
      hasClientCertificate: options.tlsPolicy?.hasClientCertificate === true,
      requestSettings
    });
  }
  if (options.forceNode || options.collectTimings || options.tlsOptions || options.proxyOptions || requestSettingsRequireNodeTransport(requestSettings)) {
    return sendNodeRequest(url, fetchOptions, options.tlsOptions, 0, url.origin, {
      agent: options.agent,
      collectTimings: options.collectTimings,
      cookieJarState: options.cookieJarState,
      hasClientCertificate: options.tlsPolicy?.hasClientCertificate === true,
      proxyOptions: options.proxyOptions,
      requestSettings
    });
  }
  if (options.cookieJarState?.storeResponses === true && fetchOptions.redirect === 'follow') {
    return sendFetchRequestWithCookieRedirects(url, fetchOptions, options);
  }
  const response = await fetch(url, fetchOptions);
  recordResponseCookies(response, response.url || url.toString(), options.cookieJarState);
  return response;
}

async function sendFetchRequestWithCookieRedirects(url, fetchOptions, options = {}) {
  const requestSettings = normalizeRequestSettings(options.requestSettings || {});
  const maxRedirects = requestSettings.maxRedirects;
  let currentUrl = url;
  let currentOptions = {
    ...fetchOptions,
    headers: { ...fetchOptions.headers },
    redirect: 'manual'
  };
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    applyCookieJarStateHeader(currentOptions.headers, currentUrl, options.cookieJarState, {
      includeExplicit: currentOptions.includeExplicitCookies !== false
    });
    const { includeExplicitCookies, ...requestOptions } = currentOptions;
    const response = await fetch(currentUrl, requestOptions);
    recordResponseCookies(response, currentUrl.toString(), options.cookieJarState);
    const responseHeaders = headersToObject(response.headers);
    const location = responseHeaders.location?.[0];
    if (!REDIRECT_STATUS_CODES.has(response.status) || !location) {
      return response;
    }
    if (redirectCount >= maxRedirects) {
      await response.arrayBuffer().catch(() => {});
      throw new Error(`Request exceeded ${maxRedirects} redirects.`);
    }
    await response.arrayBuffer().catch(() => {});
    const redirectUrl = new URL(location, currentUrl);
    if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
      throw new Error('Redirect target must use http or https.');
    }
    const nextOptions = {
      ...currentOptions,
      headers: { ...currentOptions.headers }
    };
    if (redirectUrl.origin !== currentUrl.origin) {
      stripCrossOriginRedirectHeaders(nextOptions.headers, {
        keepAuthorization: requestSettings.followAuthorizationHeader === true
      });
      nextOptions.includeExplicitCookies = false;
    }
    if (requestSettings.removeRefererHeaderOnRedirect === true) {
      deleteHeader(nextOptions.headers, 'referer');
    }
    if ([301, 302, 303].includes(response.status)
      && requestSettings.followOriginalHttpMethod !== true
      && nextOptions.method !== 'GET'
      && nextOptions.method !== 'HEAD') {
      nextOptions.method = 'GET';
      delete nextOptions.body;
      deleteHeader(nextOptions.headers, 'content-type');
      deleteHeader(nextOptions.headers, 'content-length');
    }
    currentUrl = redirectUrl;
    currentOptions = nextOptions;
  }
  throw new Error(`Request exceeded ${maxRedirects} redirects.`);
}

function nodeAgentForUrl(url, tlsOptions = null) {
  const Agent = url.protocol === 'https:' ? https.Agent : http.Agent;
  return new Agent({
    keepAlive: true,
    maxSockets: 1,
    ...(url.protocol === 'https:' && tlsOptions ? tlsOptions : {})
  });
}

function agentForRedirect(agent, currentUrl, redirectUrl) {
  if (agent === false || agent == null) {
    return agent;
  }
  return currentUrl.protocol === redirectUrl.protocol ? agent : null;
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

function applyAutoGeneratedRequestHeaders(headers, request, body) {
  setHeaderIfMissing(headers, 'Accept', '*/*');
  setHeaderIfMissing(headers, 'User-Agent', POSTMETER_USER_AGENT);
  setHeaderIfMissing(headers, 'Accept-Encoding', 'gzip, deflate, br');
  if (body != null) {
    setManagedHeader(headers, 'Content-Length', bodyByteLength(body));
  }
  if (request.autoHeaders?.sendPostMeterToken === true) {
    setHeaderIfMissing(headers, POSTMETER_TOKEN_HEADER, crypto.randomUUID());
  }
}

function setHeaderIfMissing(headers, name, value) {
  if (!findHeaderName(headers, name)) {
    headers[name] = value;
  }
}

function setManagedHeader(headers, name, value) {
  deleteHeader(headers, name);
  headers[name] = String(value);
}

function findHeaderName(headers, headerName) {
  const target = headerName.toLowerCase();
  return Object.keys(headers || {}).find((key) => key.toLowerCase() === target) || '';
}

function bodyByteLength(body) {
  if (Buffer.isBuffer(body)) {
    return body.length;
  }
  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }
  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }
  return Buffer.byteLength(String(body), 'utf8');
}

function createCookieJarState(request, headers, url, cookieJar) {
  if (request.cookieJar?.enabled !== true || request.cookieJar?.storeResponses === false) {
    return null;
  }
  const existingName = cookieHeaderName(headers);
  return {
    cookies: updateCookiesFromResponse(cookieJar || [], [], url),
    explicitCookieHeader: existingName ? headers[existingName] : '',
    storeResponses: true
  };
}

function applyCookieJarStateHeader(headers, url, cookieJarState, options = {}) {
  if (!cookieJarState) {
    return;
  }
  const cookies = cookiesForRequest(cookieJarState.cookies || [], url);
  const explicitCookieHeader = options.includeExplicit === false ? '' : cookieJarState.explicitCookieHeader || '';
  const merged = mergeCookieHeader(explicitCookieHeader, cookies);
  setCookieHeader(headers, merged);
}

function recordResponseCookies(response, responseUrl, cookieJarState) {
  if (!cookieJarState?.storeResponses) {
    return;
  }
  const headers = headersToObject(response?.headers);
  if (!headers['set-cookie']?.length) {
    return;
  }
  cookieJarState.cookies = updateCookiesFromResponse(
    cookieJarState.cookies || [],
    headers['set-cookie'],
    new URL(responseUrl)
  );
}

function cookieHeaderName(headers) {
  return Object.keys(headers || {}).find((name) => name.toLowerCase() === 'cookie') || '';
}

function setCookieHeader(headers, value) {
  const existingName = cookieHeaderName(headers);
  if (!value) {
    deleteHeader(headers, 'cookie');
    return;
  }
  if (existingName) {
    headers[existingName] = value;
  } else {
    headers.Cookie = value;
  }
}

function stripCrossOriginRedirectHeaders(headers, options = {}) {
  if (options.keepAuthorization !== true) {
    deleteHeader(headers, 'authorization');
  }
  deleteHeader(headers, 'proxy-authorization');
  deleteHeader(headers, 'cookie');
}

async function sendNodeRequest(url, requestOptions, tlsOptions, redirectCount = 0, originalOrigin = url.origin, options = {}) {
  const requestSettings = normalizeRequestSettings(options.requestSettings || {});
  const response = await sendSingleNodeRequest(url, requestOptions, tlsOptions, options.proxyOptions, options.agent, {
    collectTimings: options.collectTimings,
    requestSettings
  });
  recordResponseCookies(response, url.toString(), options.cookieJarState);
  const location = response.headers.location?.[0];
  if (requestOptions.redirect === 'manual' || !REDIRECT_STATUS_CODES.has(response.statusCode) || !location) {
    return response;
  }
  if (redirectCount >= requestSettings.maxRedirects) {
    throw new Error(`Request exceeded ${requestSettings.maxRedirects} redirects.`);
  }

  const redirectUrl = new URL(location, url);
  if (options.hasClientCertificate === true && redirectUrl.protocol !== 'https:') {
    throw new Error('Client certificate redirects must stay on https URLs.');
  }
  if (options.hasClientCertificate === true && redirectUrl.origin !== originalOrigin) {
    throw new Error('Client certificate redirects must stay on the original origin.');
  }
  if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
    throw new Error('Redirect target must use http or https.');
  }

  const nextOptions = {
    ...requestOptions,
    headers: { ...requestOptions.headers }
  };
  if ([301, 302, 303].includes(response.statusCode)
    && requestSettings.followOriginalHttpMethod !== true
    && nextOptions.method !== 'GET'
    && nextOptions.method !== 'HEAD') {
    nextOptions.method = 'GET';
    delete nextOptions.body;
    deleteHeader(nextOptions.headers, 'content-type');
    deleteHeader(nextOptions.headers, 'content-length');
  }
  if (requestSettings.removeRefererHeaderOnRedirect === true) {
    deleteHeader(nextOptions.headers, 'referer');
  }
  const includeExplicitCookies = options.includeExplicitCookies !== false && redirectUrl.origin === url.origin;
  if (redirectUrl.origin !== url.origin) {
    stripCrossOriginRedirectHeaders(nextOptions.headers, {
      keepAuthorization: requestSettings.followAuthorizationHeader === true
    });
  }
  applyCookieJarStateHeader(nextOptions.headers, redirectUrl, options.cookieJarState, {
    includeExplicit: includeExplicitCookies
  });
  const redirected = await sendNodeRequest(redirectUrl, nextOptions, tlsOptions, redirectCount + 1, originalOrigin, {
    ...options,
    agent: agentForRedirect(options.agent, url, redirectUrl),
    includeExplicitCookies,
    requestSettings
  });
  redirected.timings = combineRedirectTimings(response, redirected, {
    from: url.toString(),
    statusCode: response.statusCode || 0,
    to: redirectUrl.toString()
  });
  return redirected;
}

async function sendHttp2Request(url, requestOptions, tlsOptions, redirectCount = 0, originalOrigin = url.origin, options = {}) {
  const requestSettings = normalizeRequestSettings(options.requestSettings || {});
  const response = await sendSingleHttp2Request(url, requestOptions, tlsOptions, {
    collectTimings: options.collectTimings
  });
  recordResponseCookies(response, url.toString(), options.cookieJarState);
  const location = response.headers.location?.[0];
  if (requestOptions.redirect === 'manual' || !REDIRECT_STATUS_CODES.has(response.statusCode) || !location) {
    return response;
  }
  if (redirectCount >= requestSettings.maxRedirects) {
    throw new Error(`Request exceeded ${requestSettings.maxRedirects} redirects.`);
  }

  const redirectUrl = new URL(location, url);
  if (options.hasClientCertificate === true && redirectUrl.protocol !== 'https:') {
    throw new Error('Client certificate redirects must stay on https URLs.');
  }
  if (options.hasClientCertificate === true && redirectUrl.origin !== originalOrigin) {
    throw new Error('Client certificate redirects must stay on the original origin.');
  }
  if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
    throw new Error('Redirect target must use http or https.');
  }

  const nextOptions = {
    ...requestOptions,
    headers: { ...requestOptions.headers }
  };
  if ([301, 302, 303].includes(response.statusCode)
    && requestSettings.followOriginalHttpMethod !== true
    && nextOptions.method !== 'GET'
    && nextOptions.method !== 'HEAD') {
    nextOptions.method = 'GET';
    delete nextOptions.body;
    deleteHeader(nextOptions.headers, 'content-type');
    deleteHeader(nextOptions.headers, 'content-length');
  }
  if (requestSettings.removeRefererHeaderOnRedirect === true) {
    deleteHeader(nextOptions.headers, 'referer');
  }
  const includeExplicitCookies = options.includeExplicitCookies !== false && redirectUrl.origin === url.origin;
  if (redirectUrl.origin !== url.origin) {
    stripCrossOriginRedirectHeaders(nextOptions.headers, {
      keepAuthorization: requestSettings.followAuthorizationHeader === true
    });
  }
  applyCookieJarStateHeader(nextOptions.headers, redirectUrl, options.cookieJarState, {
    includeExplicit: includeExplicitCookies
  });
  const redirected = await sendHttp2Request(redirectUrl, nextOptions, tlsOptions, redirectCount + 1, originalOrigin, {
    ...options,
    includeExplicitCookies,
    requestSettings
  });
  redirected.timings = combineRedirectTimings(response, redirected, {
    from: url.toString(),
    statusCode: response.statusCode || 0,
    to: redirectUrl.toString()
  });
  return redirected;
}

function sendSingleHttp2Request(url, requestOptions, tlsOptions, options = {}) {
  return new Promise((resolve, reject) => {
    const timings = options.collectTimings ? createNodeRequestTimings(url) : null;
    if (timings) {
      timings.httpVersion = '2';
    }
    let settled = false;
    const sessionOptions = url.protocol === 'https:' ? (tlsOptions || {}) : {};
    const session = http2.connect(url.origin, sessionOptions);
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      session.destroy();
      reject(error);
    };
    session.once('error', fail);
    session.once('connect', () => {
      const started = performance.now();
      const stream = session.request(http2RequestHeaders(url, requestOptions));
      const chunks = [];
      let responseHeaders = {};
      if (requestOptions.signal) {
        if (requestOptions.signal.aborted) {
          stream.close();
          fail(new Error('Request aborted.'));
          return;
        }
        requestOptions.signal.addEventListener('abort', () => {
          stream.close();
          fail(new Error('Request aborted.'));
        }, { once: true });
      }
      stream.once('response', (headers) => {
        responseHeaders = headersToObject(headers);
        if (timings) {
          timings.timeToFirstByteMillis = elapsedSince(timings.transportStartedAt);
        }
      });
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.once('error', fail);
      stream.once('end', () => {
        if (settled) {
          return;
        }
        settled = true;
        if (timings) {
          timings.uploadMillis = Math.max(0, Math.round(timings.timeToFirstByteMillis || 0));
          timings.downloadMillis = elapsedSince(started);
          timings.totalTransportMillis = elapsedSince(timings.transportStartedAt);
          timings.tls = tlsDiagnostics(session.socket);
        }
        const statusCode = Number(responseHeaders[':status']?.[0] || responseHeaders.status?.[0] || 0);
        delete responseHeaders[':status'];
        session.close();
        resolve({
          statusCode,
          headers: responseHeaders,
          body: decodedNodeResponseBody(responseHeaders, Buffer.concat(chunks)),
          url: url.toString(),
          timings: publicNodeTimings(timings)
        });
      });
      if (requestOptions.body != null) {
        stream.write(requestOptions.body);
      }
      stream.end();
    });
  });
}

function http2RequestHeaders(url, requestOptions) {
  const output = {
    ':method': requestOptions.method || 'GET',
    ':scheme': url.protocol.replace(':', ''),
    ':authority': hostHeaderForUrl(url),
    ':path': `${url.pathname}${url.search}`
  };
  const blocked = new Set([
    'connection',
    'host',
    'http2-settings',
    'keep-alive',
    'proxy-connection',
    'transfer-encoding',
    'upgrade'
  ]);
  for (const [name, value] of Object.entries(requestOptions.headers || {})) {
    const normalized = name.toLowerCase();
    if (blocked.has(normalized)) {
      continue;
    }
    if (normalized === 'te' && String(value).toLowerCase() !== 'trailers') {
      continue;
    }
    output[normalized] = value;
  }
  return output;
}

function sendSingleNodeRequest(url, requestOptions, tlsOptions, proxyOptions = null, agent = null, options = {}) {
  if (proxyOptions) {
    return sendSingleNodeRequestViaProxy(url, requestOptions, tlsOptions, proxyOptions, options);
  }
  const requestSettings = normalizeRequestSettings(options.requestSettings || {});
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const timings = options.collectTimings ? createNodeRequestTimings(url) : null;
    const nodeOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: requestOptions.method,
      headers: requestOptions.headers,
      agent,
      insecureHTTPParser: requestSettings.strictHttpParser !== true,
      signal: requestOptions.signal,
      ...(url.protocol === 'https:' ? tlsOptions : {})
    };
    const request = transport.request(nodeOptions, (response) => collectNodeResponse(response, url.toString(), resolve, reject, timings));

    attachNodeRequestTimingListeners(request, timings);
    request.on('error', reject);
    const uploadStartedAt = performance.now();
    if (requestOptions.body != null) {
      request.write(requestOptions.body);
    }
    if (timings) {
      request.once('finish', () => {
        timings.uploadMillis = elapsedSince(uploadStartedAt);
      });
    }
    request.end();
  });
}

function sendSingleNodeRequestViaProxy(url, requestOptions, tlsOptions, proxyOptions, options = {}) {
  if (url.protocol === 'https:' || proxyOptions.tunnel === true) {
    return sendSingleNodeRequestViaProxyTunnel(url, requestOptions, tlsOptions, proxyOptions, options);
  }
  const requestSettings = normalizeRequestSettings(options.requestSettings || {});
  return new Promise((resolve, reject) => {
    const transport = proxyOptions.protocol === 'https:' ? https : http;
    const timings = options.collectTimings ? createNodeRequestTimings(url, { proxy: true }) : null;
    const headers = {
      ...requestOptions.headers,
      Host: hostHeaderForUrl(url)
    };
    addProxyAuthorization(headers, proxyOptions);
    const nodeOptions = {
      protocol: proxyOptions.protocol,
      hostname: proxyOptions.hostname,
      port: proxyOptions.port,
      path: url.toString(),
      method: requestOptions.method,
      headers,
      insecureHTTPParser: requestSettings.strictHttpParser !== true,
      signal: requestOptions.signal
    };
    const request = transport.request(nodeOptions, (response) => collectNodeResponse(response, url.toString(), resolve, reject, timings));
    attachNodeRequestTimingListeners(request, timings);
    request.on('error', reject);
    const uploadStartedAt = performance.now();
    if (requestOptions.body != null) {
      request.write(requestOptions.body);
    }
    if (timings) {
      request.once('finish', () => {
        timings.uploadMillis = elapsedSince(uploadStartedAt);
      });
    }
    request.end();
  });
}

async function sendSingleNodeRequestViaProxyTunnel(url, requestOptions, tlsOptions, proxyOptions, options = {}) {
  const tunnelSocket = await openProxyTunnel(url, requestOptions.signal, proxyOptions);
  const requestSettings = normalizeRequestSettings(options.requestSettings || {});
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const timings = options.collectTimings ? createNodeRequestTimings(url, { proxy: true }) : null;
    const nodeOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: requestOptions.method,
      headers: requestOptions.headers,
      insecureHTTPParser: requestSettings.strictHttpParser !== true,
      signal: requestOptions.signal,
      createConnection: () => {
        if (url.protocol === 'https:') {
          return tls.connect({
            socket: tunnelSocket,
            servername: url.hostname,
            ...(tlsOptions || {})
          });
        }
        return tunnelSocket;
      }
    };
    const request = transport.request(nodeOptions, (response) => collectNodeResponse(response, url.toString(), resolve, reject, timings));
    attachNodeRequestTimingListeners(request, timings);
    request.on('error', reject);
    request.on('close', () => {
      if (!tunnelSocket.destroyed) {
        tunnelSocket.destroy();
      }
    });
    const uploadStartedAt = performance.now();
    if (requestOptions.body != null) {
      request.write(requestOptions.body);
    }
    if (timings) {
      request.once('finish', () => {
        timings.uploadMillis = elapsedSince(uploadStartedAt);
      });
    }
    request.end();
  });
}

function openProxyTunnel(url, signal, proxyOptions) {
  return new Promise((resolve, reject) => {
    const transport = proxyOptions.protocol === 'https:' ? https : http;
    const target = hostHeaderForUrl(url);
    const headers = { Host: target };
    addProxyAuthorization(headers, proxyOptions);
    const request = transport.request({
      protocol: proxyOptions.protocol,
      hostname: proxyOptions.hostname,
      port: proxyOptions.port,
      method: 'CONNECT',
      path: target,
      headers,
      signal
    });
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed with HTTP ${response.statusCode || 0}.`));
        return;
      }
      if (head?.length) {
        socket.unshift(head);
      }
      resolve(socket);
    });
    request.once('error', reject);
    request.end();
  });
}

function collectNodeResponse(response, finalUrl, resolve, reject, timings = null) {
  const chunks = [];
  const responseStarted = performance.now();
  if (timings) {
    timings.timeToFirstByteMillis = elapsedSince(timings.transportStartedAt);
    timings.httpVersion = response.httpVersion || '';
  }
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => {
    try {
      const bodyBuffer = Buffer.concat(chunks);
      if (timings) {
        timings.downloadMillis = elapsedSince(responseStarted);
        timings.totalTransportMillis = elapsedSince(timings.transportStartedAt);
      }
      resolve({
        statusCode: response.statusCode || 0,
        headers: headersToObject(response.headers),
        body: decodedNodeResponseBody(response.headers, bodyBuffer),
        url: finalUrl,
        timings: publicNodeTimings(timings)
      });
    } catch (error) {
      reject(error);
    }
  });
}

function createNodeRequestTimings(url, options = {}) {
  return {
    transportStartedAt: performance.now(),
    url: url.toString(),
    protocol: url.protocol,
    proxy: options.proxy === true,
    reusedSocket: false,
    dnsLookupMillis: 0,
    tcpConnectMillis: 0,
    tlsHandshakeMillis: 0,
    uploadMillis: 0,
    timeToFirstByteMillis: 0,
    downloadMillis: 0,
    totalTransportMillis: 0,
    redirectCount: 0,
    redirectMillis: 0,
    redirects: [],
    httpVersion: '',
    tls: undefined
  };
}

function attachNodeRequestTimingListeners(request, timings) {
  if (!timings) {
    return;
  }
  request.once('socket', (socket) => {
    timings.reusedSocket = request.reusedSocket === true;
    if (request.reusedSocket === true) {
      timings.dnsLookupMillis = 0;
      timings.tcpConnectMillis = 0;
      timings.tlsHandshakeMillis = 0;
      timings.tls = tlsDiagnostics(socket);
      return;
    }
    const socketStartedAt = performance.now();
    let connectStartedAt = socketStartedAt;
    let tlsStartedAt = socketStartedAt;
    socket.once('lookup', () => {
      timings.dnsLookupMillis = elapsedSince(socketStartedAt);
      connectStartedAt = performance.now();
    });
    socket.once('connect', () => {
      timings.tcpConnectMillis = elapsedSince(connectStartedAt);
      tlsStartedAt = performance.now();
    });
    socket.once('secureConnect', () => {
      timings.tlsHandshakeMillis = elapsedSince(tlsStartedAt);
      timings.tls = tlsDiagnostics(socket);
    });
  });
}

function tlsDiagnostics(socket) {
  const certificate = safePeerCertificate(socket);
  const cipher = typeof socket.getCipher === 'function' ? socket.getCipher() : null;
  return {
    authorized: socket.authorized === true,
    authorizationError: socket.authorizationError || '',
    protocol: typeof socket.getProtocol === 'function' ? socket.getProtocol() || '' : '',
    cipher: cipher ? {
      name: cipher.name || '',
      standardName: cipher.standardName || '',
      version: cipher.version || ''
    } : {},
    certificate
  };
}

function safePeerCertificate(socket) {
  if (typeof socket.getPeerCertificate !== 'function') {
    return {};
  }
  const certificate = socket.getPeerCertificate(false) || {};
  return {
    subject: certificate.subject?.CN || '',
    issuer: certificate.issuer?.CN || '',
    subjectaltname: certificate.subjectaltname || '',
    validFrom: certificate.valid_from || '',
    validTo: certificate.valid_to || '',
    fingerprint256: certificate.fingerprint256 || ''
  };
}

function publicNodeTimings(timings) {
  if (!timings) {
    return undefined;
  }
  return {
    transportStartedAt: timings.transportStartedAt,
    protocol: timings.protocol,
    proxy: timings.proxy === true,
    reusedSocket: timings.reusedSocket === true,
    dnsLookupMillis: Math.max(0, Math.round(timings.dnsLookupMillis || 0)),
    tcpConnectMillis: Math.max(0, Math.round(timings.tcpConnectMillis || 0)),
    tlsHandshakeMillis: Math.max(0, Math.round(timings.tlsHandshakeMillis || 0)),
    uploadMillis: Math.max(0, Math.round(timings.uploadMillis || 0)),
    timeToFirstByteMillis: Math.max(0, Math.round(timings.timeToFirstByteMillis || 0)),
    downloadMillis: Math.max(0, Math.round(timings.downloadMillis || 0)),
    totalTransportMillis: Math.max(0, Math.round(timings.totalTransportMillis || 0)),
    redirectCount: Math.max(0, Math.round(timings.redirectCount || 0)),
    redirectMillis: Math.max(0, Math.round(timings.redirectMillis || 0)),
    redirects: Array.isArray(timings.redirects) ? timings.redirects.slice(0, MAX_REDIRECTS) : [],
    httpVersion: timings.httpVersion || '',
    tls: timings.tls
  };
}

function combineRedirectTimings(response, redirected, redirect) {
  const first = response.timings || {};
  const next = redirected.timings || {};
  return {
    ...next,
    transportStartedAt: first.transportStartedAt || next.transportStartedAt,
    redirectCount: Number(next.redirectCount || 0) + 1,
    redirectMillis: Number(next.redirectMillis || 0) + Number(first.totalTransportMillis || 0),
    redirects: [
      redirect,
      ...(Array.isArray(next.redirects) ? next.redirects : [])
    ].slice(0, MAX_REDIRECTS)
  };
}

function elapsedSince(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function decodedNodeResponseBody(headers, bodyBuffer) {
  const encoding = String(headerValue(headers, 'content-encoding') || '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  let decoded = bodyBuffer;
  for (const current of encoding.reverse()) {
    decoded = decodeNodeResponseBuffer(current, decoded);
  }
  return decoded.toString('utf8');
}

function decodeNodeResponseBuffer(encoding, bodyBuffer) {
  if (encoding === 'gzip' || encoding === 'x-gzip') {
    return zlib.gunzipSync(bodyBuffer);
  }
  if (encoding === 'br') {
    return zlib.brotliDecompressSync(bodyBuffer);
  }
  if (encoding === 'deflate') {
    try {
      return zlib.inflateSync(bodyBuffer);
    } catch {
      return zlib.inflateRawSync(bodyBuffer);
    }
  }
  return bodyBuffer;
}

function headerValue(headers, name) {
  const target = name.toLowerCase();
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === target);
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? value[0] : value;
}

function normalizeProxyConfig(proxy, environment) {
  if (!proxy || proxy.enabled === false || proxy.disabled === true) {
    return null;
  }
  let source = proxy;
  if (typeof source === 'string') {
    source = { url: source };
  }
  if (typeof source !== 'object') {
    return null;
  }
  const rawUrl = resolveEnvironmentValue(source.url || source.uri || '', environment).trim();
  let parsed = null;
  if (rawUrl) {
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('Proxy URL is not a valid URI.');
    }
  }
  const protocolText = resolveEnvironmentValue(source.protocol || source.scheme || parsed?.protocol || 'http', environment)
    .replace(/:$/, '')
    .toLowerCase();
  const protocol = protocolText === 'https' ? 'https:' : protocolText === 'http' ? 'http:' : '';
  if (!protocol) {
    throw new Error('Proxy protocol must be http or https.');
  }
  const hostname = resolveEnvironmentValue(source.host || source.hostname || parsed?.hostname || '', environment).trim();
  if (!hostname) {
    throw new Error('Proxy host is required.');
  }
  const rawPort = resolveEnvironmentValue(source.port || parsed?.port || '', environment).trim();
  const port = rawPort ? Number(rawPort) : (protocol === 'https:' ? 443 : 80);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Proxy port must be a valid TCP port.');
  }
  return {
    protocol,
    hostname,
    port,
    username: resolveEnvironmentValue(source.username || parsed?.username || '', environment),
    password: resolveEnvironmentValue(source.password || parsed?.password || '', environment),
    tunnel: source.tunnel === true
  };
}

function validateProxyConfig(proxy, environment) {
  try {
    normalizeProxyConfig(proxy, environment);
    return null;
  } catch (error) {
    return error.message || String(error);
  }
}

function addProxyAuthorization(headers, proxyOptions) {
  if (!proxyOptions.username && !proxyOptions.password) {
    return;
  }
  headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${proxyOptions.username}:${proxyOptions.password}`, 'utf8').toString('base64')}`;
}

function hostHeaderForUrl(url) {
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80') || !url.port) {
    return url.hostname;
  }
  return `${url.hostname}:${url.port}`;
}

function requestSignal(parentSignal, timeoutMillis) {
  const timeout = normalizeTimeoutMillis(timeoutMillis);
  const timeoutSignal = AbortSignal.timeout(timeout);
  if (!parentSignal) {
    return timeoutSignal;
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parentSignal, timeoutSignal]);
  }
  return parentSignal;
}

function normalizeTimeoutMillis(value) {
  const timeout = Number(value || REQUEST_TIMEOUT_MILLIS);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return REQUEST_TIMEOUT_MILLIS;
  }
  return Math.max(1, Math.min(REQUEST_TIMEOUT_MILLIS, Math.floor(timeout)));
}

async function prepareRequestForSend(request, environment, options = {}) {
  const refreshed = await maybeRefreshOAuthToken(request?.auth, environment, {
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    now: options.now
  });
  const requestWithAuth = refreshed.refreshed ? { ...request, auth: refreshed.auth } : request;
  const requestWithBody = await materializeBoundRequestBody(requestWithAuth, environment, options.fileBindings || []);
  if (!refreshed.refreshed) {
    return { request: requestWithBody, updatedAuth: null };
  }
  return {
    request: requestWithBody,
    updatedAuth: refreshed.auth
  };
}

async function materializeBoundRequestBody(request = {}, environment, fileBindings = []) {
  if (request.multipart?.parts?.length) {
    const { body, contentType } = await buildMultipartRequestBody(request.multipart.parts, fileBindings);
    return withRequestBody(request, body, contentType);
  }
  if (request.bodyAttachment) {
    const { body, contentType } = await readBoundAttachmentBody(request.bodyAttachment, fileBindings);
    return withRequestBody(request, body, contentType || 'application/octet-stream');
  }
  const postmanBodyMode = String(request.postmanBody?.mode || '').toLowerCase();
  if (postmanBodyMode === 'graphql' || isGraphqlRequestBody(request)) {
    const body = buildGraphqlRequestBody(request, environment);
    return withRequestBody(request, JSON.stringify(body), 'application/json', BODY_TYPES.RAW_JSON);
  }
  if (postmanBodyMode === 'raw') {
    const raw = String(request.postmanBody.raw ?? request.body ?? '');
    const bodyType = rawBodyTypeForLanguage(request.postmanBody.options?.raw?.language, request.bodyType);
    return withRequestBody(request, raw, defaultContentTypeForBodyType(bodyType), bodyType);
  }
  if (postmanBodyMode === 'urlencoded') {
    const body = buildUrlencodedRequestBody(request.postmanBody.urlencoded || [], environment);
    return withRequestBody(request, body, 'application/x-www-form-urlencoded', BODY_TYPES.URLENCODED || 'URLENCODED');
  }
  if (postmanBodyMode === 'file' || postmanBodyMode === 'binary') {
    const source = request.postmanBody.file?.src || request.postmanBody.binary?.src || '';
    if (!source) {
      return { ...request, bodyType: BODY_TYPES.NONE };
    }
    const explicitContentType = request.postmanBody.file?.contentType || request.postmanBody.binary?.contentType || '';
    const { body, contentType } = await readBoundAttachmentBody({
      contentType: explicitContentType,
      mode: postmanBodyMode,
      source
    }, fileBindings);
    return withRequestBody(request, body, contentType || detectFileContentType(source), BODY_TYPES.BINARY || BODY_TYPES.RAW_TEXT);
  }
  if (postmanBodyMode === 'formdata' || postmanBodyMode === 'form-data') {
    const parts = postmanFormDataParts(request.postmanBody.formdata || [], environment);
    const { body, contentType } = await buildMultipartRequestBody(parts, fileBindings);
    return withRequestBody(request, body, contentType, BODY_TYPES.FORM_DATA || BODY_TYPES.RAW_TEXT);
  }
  return request;
}

function defaultContentTypeForBodyType(bodyType) {
  if (bodyType === BODY_TYPES.RAW_JSON) {
    return 'application/json';
  }
  if (bodyType === BODY_TYPES.RAW_JAVASCRIPT) {
    return 'application/javascript';
  }
  if (bodyType === BODY_TYPES.RAW_HTML) {
    return 'text/html; charset=utf-8';
  }
  if (bodyType === BODY_TYPES.RAW_XML) {
    return 'application/xml';
  }
  if (bodyType === BODY_TYPES.URLENCODED) {
    return 'application/x-www-form-urlencoded';
  }
  if (bodyType === BODY_TYPES.BINARY) {
    return 'application/octet-stream';
  }
  return 'text/plain; charset=utf-8';
}

function rawBodyTypeForLanguage(language, fallback = BODY_TYPES.RAW_TEXT) {
  const value = String(language || '').toLowerCase();
  if (value === 'json') {
    return BODY_TYPES.RAW_JSON;
  }
  if (value === 'javascript' || value === 'js') {
    return BODY_TYPES.RAW_JAVASCRIPT || BODY_TYPES.RAW_TEXT;
  }
  if (value === 'html') {
    return BODY_TYPES.RAW_HTML || BODY_TYPES.RAW_TEXT;
  }
  if (value === 'xml') {
    return BODY_TYPES.RAW_XML || BODY_TYPES.RAW_TEXT;
  }
  return fallback && fallback !== BODY_TYPES.NONE ? fallback : BODY_TYPES.RAW_TEXT;
}

function buildUrlencodedRequestBody(urlencoded = [], environment) {
  const params = new URLSearchParams();
  for (const part of Array.isArray(urlencoded) ? urlencoded : []) {
    if (!part || typeof part !== 'object' || part.disabled === true || part.enabled === false) {
      continue;
    }
    const key = resolveEnvironmentValue(part.key == null ? '' : String(part.key), environment);
    if (!key) {
      continue;
    }
    params.append(key, resolveEnvironmentValue(part.value == null ? '' : String(part.value), environment));
  }
  return params.toString();
}

function postmanFormDataParts(formdata = [], environment) {
  const parts = [];
  for (const part of Array.isArray(formdata) ? formdata : []) {
    if (!part || typeof part !== 'object' || part.disabled === true || part.enabled === false) {
      continue;
    }
    const key = resolveEnvironmentValue(part.key == null ? '' : String(part.key), environment);
    if (!key) {
      continue;
    }
    const isFile = part.src != null || String(part.type || '').toLowerCase() === 'file';
    if (!isFile) {
      parts.push({
        key,
        type: 'text',
        value: resolveEnvironmentValue(part.value == null ? '' : String(part.value), environment)
      });
      continue;
    }
    const sources = Array.isArray(part.src) ? part.src : [part.src];
    for (const source of sources.filter((item) => item != null && item !== '')) {
      parts.push({
        fileName: part.fileName == null ? '' : String(part.fileName),
        key,
        mode: 'formdata',
        source: String(source),
        type: 'file'
      });
    }
  }
  return parts;
}

function buildGraphqlRequestBody(request = {}, environment) {
  const source = graphqlBodySource(request);
  const body = {
    query: resolveEnvironmentValue(source.query == null ? '' : String(source.query), environment),
    variables: resolveGraphqlVariables(source.variables, environment)
  };
  const operationName = resolveEnvironmentValue(source.operationName == null ? '' : String(source.operationName), environment).trim();
  if (operationName) {
    body.operationName = operationName;
  }
  return body;
}

function isGraphqlRequestBody(request = {}) {
  if (String(request.protocol || '').toLowerCase() !== 'graphql') {
    return false;
  }
  const postmanGraphql = request.postmanBody?.graphql;
  if (postmanGraphql && typeof postmanGraphql === 'object' && Object.keys(postmanGraphql).length) {
    return true;
  }
  if (request.graphql && typeof request.graphql === 'object' && Object.keys(request.graphql).length) {
    return true;
  }
  return Object.keys(parseJsonObject(request.body)).length > 0;
}

function graphqlBodySource(request = {}) {
  const postmanGraphql = request.postmanBody?.graphql;
  if (postmanGraphql && typeof postmanGraphql === 'object' && Object.keys(postmanGraphql).length) {
    return postmanGraphql;
  }
  if (request.graphql && typeof request.graphql === 'object' && Object.keys(request.graphql).length) {
    return request.graphql;
  }
  const parsed = parseJsonObject(request.body);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function resolveGraphqlVariables(value, environment, root = true) {
  if (value == null || value === '') {
    return root ? {} : value;
  }
  if (typeof value === 'string') {
    const resolved = resolveEnvironmentValue(value, environment).trim();
    if (!resolved) {
      return root ? {} : resolved;
    }
    try {
      return JSON.parse(resolved);
    } catch {
      return resolved;
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveGraphqlVariables(item, environment, false));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      typeof item === 'string' ? resolveEnvironmentValue(item, environment) : resolveGraphqlVariables(item, environment, false)
    ]));
  }
  return value;
}

function parseJsonObject(value) {
  if (value == null || Buffer.isBuffer(value)) {
    return {};
  }
  const text = String(value).trim();
  if (!text || !/^[{[]/.test(text)) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function readBoundAttachmentBody(reference, fileBindings) {
  const binding = resolveFileAttachmentBinding(reference, fileBindings);
  const body = await readBoundFile(binding.localPath, reference?.source || binding.source);
  return {
    body,
    contentType: reference?.contentType || binding.contentType || ''
  };
}

async function buildMultipartRequestBody(parts = [], fileBindings = []) {
  const boundary = `postmeter-${crypto.randomBytes(12).toString('hex')}`;
  const chunks = [];
  let totalBytes = 0;
  const push = (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    totalBytes += buffer.length;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(`File attachment request body cannot exceed ${MAX_ATTACHMENT_BYTES} bytes.`);
    }
    chunks.push(buffer);
  };
  for (const part of parts) {
    if (!part?.key) {
      continue;
    }
    if (part.type === 'file') {
      const binding = resolveFileAttachmentBinding(part, fileBindings);
      const fileBody = await readBoundFile(binding.localPath, part.source || binding.source);
      const fileName = multipartFileName(part.fileName || binding.fileName || binding.localPath || binding.source);
      const contentType = multipartFileContentType(part, binding, fileName);
      push(`--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartValue(part.key)}"; filename="${escapeMultipartValue(fileName)}"\r\nContent-Type: ${contentType}\r\n\r\n`);
      push(fileBody);
      push('\r\n');
    } else {
      push(`--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartValue(part.key)}"\r\n\r\n${part.value == null ? '' : String(part.value)}\r\n`);
    }
  }
  push(`--${boundary}--\r\n`);
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function multipartFileContentType(part = {}, binding = {}, fileName = '') {
  if (part.mode !== 'formdata' && part.contentType) {
    return String(part.contentType);
  }
  if (part.mode !== 'formdata' && binding.contentType) {
    return String(binding.contentType);
  }
  return detectFileContentType(part.fileName || fileName || binding.fileName || part.source || binding.source || binding.localPath);
}

function detectFileContentType(value) {
  const extension = path.extname(String(value || '').split(/[?#]/, 1)[0]).toLowerCase();
  return FILE_EXTENSION_CONTENT_TYPES.get(extension) || 'application/octet-stream';
}

async function readBoundFile(filePath, source) {
  const stat = await fs.stat(filePath).catch((error) => {
    const reason = error?.code ? `${error.code}` : (error?.message || 'unknown error');
    throw new Error(`Unable to read bound file attachment for ${source || 'request body'}: ${reason}.`);
  });
  if (!stat.isFile()) {
    throw new Error(`Bound file attachment for ${source || 'request body'} must be a regular file.`);
  }
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File attachment ${source || filePath} cannot exceed ${MAX_ATTACHMENT_BYTES} bytes.`);
  }
  const body = await fs.readFile(filePath);
  if (body.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File attachment ${source || filePath} cannot exceed ${MAX_ATTACHMENT_BYTES} bytes.`);
  }
  return body;
}

function withRequestBody(request, body, contentType, bodyType = BODY_TYPES.RAW_TEXT) {
  return {
    ...request,
    body,
    bodyType,
    headers: headerWithDefault(request.headers || [], 'Content-Type', contentType)
  };
}

function headerWithDefault(headers = [], key, value) {
  if (!value || headers.some((header) => String(header?.key || '').toLowerCase() === key.toLowerCase() && header.enabled !== false)) {
    return headers;
  }
  return [
    ...headers,
    { enabled: true, key, value }
  ];
}

function multipartFileName(value) {
  return String(value || 'attachment').split(/[\\/]/).pop() || 'attachment';
}

function escapeMultipartValue(value) {
  return String(value || '').replace(/["\r\n]/g, '_');
}

function buildUrl(request, environment) {
  const resolvedUrl = resolveEnvironmentValue(request.url, environment).trim();
  const requestSettings = normalizeRequestSettings(request.settings || {});
  let url;
  try {
    url = new URL(normalizeRequestUrlText(resolvedUrl));
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

  const resolvedQueryParams = enabledQueryParams(request.queryParams || []).map((pair) => ({
    ...pair,
    key: resolveEnvironmentValue(pair.key, environment),
    value: resolveEnvironmentValue(pair.value ?? '', environment)
  }));
  if (resolvedQueryParams.length && urlQueryMatchesPairs(resolvedUrl, resolvedQueryParams)) {
    return url;
  }

  if (requestSettings.encodeUrlAutomatically === false) {
    appendRawQueryPairs(url, resolvedQueryParams);
  } else {
    for (const pair of resolvedQueryParams) {
      if (pair.enabled === false || !hasKey(pair)) {
        continue;
      }
      url.searchParams.append(
        pair.key.trim(),
        pair.value ?? ''
      );
    }
  }
  return url;
}

function appendRawQueryPairs(url, queryParams = []) {
  const raw = queryParams
    .filter((pair) => pair.enabled !== false && hasKey(pair))
    .map((pair) => `${String(pair.key || '').trim()}=${String(pair.value ?? '')}`)
    .join('&');
  if (!raw) {
    return;
  }
  url.search = url.search ? `${url.search}&${raw}` : `?${raw}`;
}

function normalizeRequestUrlText(value) {
  const text = String(value || '').trim();
  if (!text) {
    return text;
  }
  if (text.startsWith('//')) {
    return `${DEFAULT_SCHEMELESS_REQUEST_PROTOCOL}${text}`;
  }
  if (hasUrlScheme(text)) {
    return looksLikeSchemeLessHostPort(text) ? `${DEFAULT_SCHEMELESS_REQUEST_PROTOCOL}//${text}` : text;
  }
  return looksLikeSchemeLessHttpUrl(text) ? `${DEFAULT_SCHEMELESS_REQUEST_PROTOCOL}//${text}` : text;
}

function hasUrlScheme(text) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(text);
}

function looksLikeSchemeLessHostPort(text) {
  const match = /^([^/?#\s]+):(?=\d{1,5}(?:[/?#]|$))/.exec(text);
  return !!match && looksLikeHttpHostname(match[1], { allowSingleLabel: true });
}

function looksLikeSchemeLessHttpUrl(text) {
  if (/[\s\u0000-\u001f\u007f]/.test(text) || /^[/?#]/.test(text)) {
    return false;
  }
  const authority = text.split(/[/?#]/, 1)[0];
  const hostWithPort = authority.split('@').pop();
  const host = hostnameFromAuthority(hostWithPort);
  return looksLikeHttpHostname(host, { allowSingleLabel: !!portFromAuthority(hostWithPort) });
}

function hostnameFromAuthority(authority) {
  const value = String(authority || '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('[')) {
    const closingBracketIndex = value.indexOf(']');
    return closingBracketIndex >= 0 ? value.slice(0, closingBracketIndex + 1) : value;
  }
  const port = portFromAuthority(value);
  return port ? value.slice(0, -(port.length + 1)) : value;
}

function portFromAuthority(authority) {
  const value = String(authority || '');
  if (value.startsWith('[')) {
    const closingBracketIndex = value.indexOf(']');
    if (closingBracketIndex < 0) {
      return '';
    }
    const suffix = value.slice(closingBracketIndex + 1);
    return /^:\d{1,5}$/.test(suffix) ? suffix.slice(1) : '';
  }
  const match = value.match(/:(\d{1,5})$/);
  return match ? match[1] : '';
}

function looksLikeHttpHostname(hostname, options = {}) {
  const value = String(hostname || '').trim().replace(/\.$/, '');
  if (!value) {
    return false;
  }
  if (/^\[[0-9A-Fa-f:.]+\]$/.test(value)) {
    return true;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return true;
  }
  if (value.toLowerCase() === 'localhost') {
    return true;
  }
  if (!/^[\p{L}\p{N}.-]+$/u.test(value)) {
    return false;
  }
  return value.includes('.') || options.allowSingleLabel === true;
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
  materializeBoundRequestBody,
  prepareRequestForSend,
  sendRequest,
  sendNodeRequest,
  validateRequest
};
