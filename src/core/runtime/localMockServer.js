const http = require('node:http');
const { BODY_TYPES, walkRequests } = require('../workspace/models');
const { runPostmanScriptIsolated } = require('../sandbox/scriptSandbox');

const MAX_MOCK_REQUEST_BODY_BYTES = 1024 * 1024;
const MAX_MOCK_RESPONSE_BODY_BYTES = 512 * 1024;
const MAX_MOCK_STATE_KEYS = 1000;
const MAX_MOCK_STATE_TOTAL_BYTES = 256 * 1024;

class MockStateStore {
  constructor(initialState = {}) {
    this.replaceAll(initialState);
  }

  beginTransaction() {
    const store = this;
    let state = cloneJsonValue(this.state);
    let closed = false;
    return {
      get(key) {
        return Object.hasOwn(state, key) ? cloneJsonValue(state[key]) : undefined;
      },
      set(key, value) {
        state[key] = cloneJsonValue(value);
      },
      delete(key) {
        const existed = Object.hasOwn(state, key);
        delete state[key];
        return existed;
      },
      has(key) {
        return Object.hasOwn(state, key);
      },
      keys() {
        return Object.keys(state).sort();
      },
      size() {
        return Object.keys(state).length;
      },
      clear() {
        state = {};
      },
      toObject() {
        return cloneJsonValue(state);
      },
      commit() {
        if (closed) {
          return;
        }
        closed = true;
        store.replaceAll(state);
      },
      rollback() {
        closed = true;
      }
    };
  }

  snapshot() {
    return cloneJsonValue(this.state);
  }

  clear() {
    this.replaceAll({});
  }

  reset(nextState = {}) {
    this.replaceAll(nextState);
  }

  replaceAll(nextState = {}) {
    const normalized = normalizeStateObject(nextState);
    this.state = normalized;
  }
}

async function handleLocalMockRequest(collection, incomingRequest, options = {}) {
  const stateStore = options.stateStore || new MockStateStore(options.initialState || {});
  const request = normalizeIncomingRequest(incomingRequest);
  const match = matchMockRequest(collection, request);
  if (!match) {
    return {
      matched: false,
      pathVariables: {},
      request: null,
      response: routeFallbackResponse(request),
      state: stateStore.snapshot()
    };
  }

  const fallbackResponse = responseFromSavedResponse(match.savedResponses[0]);
  let response = fallbackResponse;
  let scriptExecution = null;
  const requestMockScript = String(match.request?.scripts?.mock || '');
  const collectionMockScript = String(collection?.scripts?.mock || '');
  const scriptText = requestMockScript.trim() ? requestMockScript : collectionMockScript;
  if (scriptText.trim()) {
    const context = mockScriptContext(match, request, fallbackResponse, options);
    scriptExecution = await runPostmanScriptIsolated(scriptText, context, {
      filename: options.filename || 'postmeter-local-mock.js',
      mockStateStore: stateStore,
      osSandboxMode: options.osSandboxMode,
      requireNodePermission: options.requireNodePermission,
      sandboxPackages: options.sandboxPackages || [],
      timeoutMillis: options.timeoutMillis,
      trustedCapabilities: {
        ...(options.trustedCapabilities || {}),
        cookies: options.trustedCapabilities?.cookies === true,
        sendRequest: options.trustedCapabilities?.sendRequest === true,
        vault: false
      },
      workerTimeoutMillis: options.workerTimeoutMillis
    });
    if (scriptExecution.result?.mock?.response) {
      response = normalizeMockResponse(scriptExecution.result.mock.response);
    } else if (scriptExecution.result?.commitSideEffects === false) {
      response = scriptErrorResponse(scriptExecution.result.error || 'Local mock script failed.');
    }
  }

  return {
    matched: true,
    match: mockMatchPayload(match, request),
    pathVariables: match.pathVariables,
    request: match.request,
    response,
    scriptExecution,
    state: stateStore.snapshot()
  };
}

function startLocalMockServer(collection, options = {}) {
  const stateStore = options.stateStore || new MockStateStore(options.initialState || {});
  const host = options.host || '127.0.0.1';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 0;
  const server = http.createServer(async (request, response) => {
    try {
      const body = await readRequestBody(request);
      const result = await handleLocalMockRequest(collection, {
        body,
        headers: request.headers || {},
        method: request.method || 'GET',
        url: `http://${request.headers.host || `${host}:${port}`}${request.url || '/'}`
      }, {
        ...options,
        stateStore
      });
      writeHttpResponse(response, result.response);
    } catch (error) {
      writeHttpResponse(response, scriptErrorResponse(error.message || String(error)));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve({
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((error) => error ? closeReject(error) : closeResolve());
          });
        },
        server,
        stateStore,
        url: `http://${address.address}:${address.port}`
      });
    });
  });
}

function matchMockRequest(collection, incomingRequest) {
  const request = normalizeIncomingRequest(incomingRequest);
  const candidates = [];
  walkRequests(collection || {}, (candidate) => {
    const match = matchRequestRoute(candidate, request);
    if (match) {
      candidates.push(match);
    }
  });
  return candidates[0] || null;
}

function matchRequestRoute(candidate, incomingRequest) {
  if (!candidate || String(candidate.protocol || 'http') !== 'http') {
    return null;
  }
  const candidateMethod = String(candidate.method || 'GET').toUpperCase();
  if (candidateMethod !== incomingRequest.method) {
    return null;
  }
  const routePath = pathFromUrl(candidate.url || '/');
  const pathMatch = matchRoutePath(routePath, incomingRequest.path);
  if (!pathMatch.matched) {
    return null;
  }
  return {
    savedResponses: normalizeSavedResponses(candidate.postman?.mockResponses),
    pathVariables: pathMatch.pathVariables,
    request: candidate,
    routePath
  };
}

function matchRoutePath(routePath, incomingPath) {
  const routeSegments = pathSegments(routePath);
  const incomingSegments = pathSegments(incomingPath);
  if (routeSegments.length !== incomingSegments.length) {
    return { matched: false, pathVariables: {} };
  }
  const pathVariables = {};
  for (let index = 0; index < routeSegments.length; index += 1) {
    const route = routeSegments[index];
    const incoming = incomingSegments[index];
    const variableName = routeVariableName(route);
    if (variableName) {
      pathVariables[variableName] = incoming;
      continue;
    }
    if (route !== incoming) {
      return { matched: false, pathVariables: {} };
    }
  }
  return { matched: true, pathVariables };
}

function routeVariableName(segment) {
  if (segment.startsWith(':') && segment.length > 1) {
    return segment.slice(1);
  }
  const match = segment.match(/^\{\{([^{}]+)}}$/);
  return match ? match[1] : '';
}

function mockScriptContext(match, request, fallbackResponse, options = {}) {
  const savedResponses = normalizeSavedResponses(match.savedResponses);
  const pathVariables = Object.entries(match.pathVariables || {}).map(([key, value]) => ({
    enabled: true,
    key,
    value
  }));
  return {
    collectionId: options.collectionId || '',
    collectionVariables: options.collectionVariables || [],
    cookieJar: [],
    environment: options.environment || { id: 'local-mock', name: 'Local Mock', variables: [] },
    eventName: 'mock',
    executionLocation: options.executionLocation || { current: [] },
    globals: options.globals || [],
    localVariables: [...pathVariables, ...(options.localVariables || [])],
    mock: {
      enabled: true,
      examples: savedResponses,
      match: mockMatchPayload(match, request),
      request: scriptRequestPayload(request, match.pathVariables)
    },
    request: scriptRequestPayload(request, match.pathVariables),
    response: fallbackResponse
  };
}

function mockMatchPayload(match, request) {
  return {
    exampleIds: normalizeSavedResponses(match.savedResponses).map((response) => response.id),
    matched: true,
    method: request.method,
    path: request.path,
    pathVariables: cloneJsonValue(match.pathVariables || {}),
    requestId: String(match.request?.id || ''),
    requestName: String(match.request?.name || ''),
    routePath: match.routePath || ''
  };
}

function scriptRequestPayload(request, pathVariables = {}) {
  return {
    body: request.body,
    bodyType: request.body && looksLikeJson(request.body) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT,
    headers: Object.entries(request.headers || {}).map(([key, value]) => ({
      enabled: true,
      key,
      value: Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value)
    })),
    method: request.method,
    name: 'Local Mock Request',
    queryParams: Object.entries(request.query || {}).flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((item) => ({ enabled: true, key, value: item == null ? '' : String(item) }));
    }),
    query: cloneJsonValue(request.query || {}),
    url: request.url,
    variables: Object.entries(pathVariables || {}).map(([key, value]) => ({ enabled: true, key, value }))
  };
}

function normalizeIncomingRequest(incomingRequest = {}) {
  const rawUrl = incomingRequest.url || incomingRequest.path || '/';
  const parsed = parseIncomingUrl(rawUrl);
  return {
    body: incomingRequest.body == null ? '' : typeof incomingRequest.body === 'string' ? incomingRequest.body : JSON.stringify(incomingRequest.body),
    headers: normalizeHeaders(incomingRequest.headers || {}),
    method: String(incomingRequest.method || 'GET').toUpperCase(),
    path: parsed.pathname,
    query: Object.fromEntries(parsed.searchParams.entries()),
    url: parsed.href
  };
}

function parseIncomingUrl(rawUrl) {
  const text = String(rawUrl || '/');
  try {
    return new URL(text, 'http://127.0.0.1');
  } catch {
    return new URL('/', 'http://127.0.0.1');
  }
}

function normalizeHeaders(headers) {
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers
      .filter((header) => header?.key || header?.name)
      .map((header) => [String(header.key || header.name).toLowerCase(), header.value == null ? '' : String(header.value)]));
  }
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
}

function pathFromUrl(rawUrl) {
  const text = String(rawUrl || '/');
  if (!/^[a-z][a-z\d+.-]*:/i.test(text) && !text.startsWith('/')) {
    const clean = text.split('?')[0].split('#')[0];
    const segments = clean.split('/').filter(Boolean);
    if (segments.length > 1 && looksLikeRouteHostSegment(segments[0])) {
      return normalizeRoutePathText(`/${segments.slice(1).join('/')}`);
    }
    return normalizeRoutePathText(`/${clean}`);
  }
  try {
    return new URL(text, 'http://127.0.0.1').pathname || '/';
  } catch {
    const clean = text.split('?')[0].split('#')[0];
    const protocolIndex = clean.indexOf('://');
    if (protocolIndex >= 0) {
      const afterHost = clean.slice(protocolIndex + 3);
      const slashIndex = afterHost.indexOf('/');
      return slashIndex >= 0 ? normalizeRoutePathText(afterHost.slice(slashIndex)) : '/';
    }
    if (clean.startsWith('/')) {
      return normalizeRoutePathText(clean);
    }
    const segments = clean.split('/').filter(Boolean);
    if (segments.length > 1 && looksLikeRouteHostSegment(segments[0])) {
      return normalizeRoutePathText(`/${segments.slice(1).join('/')}`);
    }
    return normalizeRoutePathText(`/${clean}`);
  }
}

function normalizeRoutePathText(value) {
  const clean = String(value || '/').split('?')[0].split('#')[0];
  return clean.startsWith('/') ? clean : `/${clean}`;
}

function looksLikeRouteHostSegment(segment) {
  const text = String(segment || '');
  return /^\{\{[^{}]+}}$/.test(text)
    || text.includes('.')
    || text.includes(':')
    || text === 'localhost';
}

function pathSegments(pathname) {
  return String(pathname || '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

function normalizeSavedResponses(responses = []) {
  return (Array.isArray(responses) ? responses : [])
    .filter((response) => response && typeof response === 'object')
    .map((response) => ({
      body: response.body == null ? '' : String(response.body),
      bodyType: response.bodyType || (looksLikeJson(response.body) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT),
      headers: Array.isArray(response.headers) ? response.headers.map((header) => ({ ...header })) : [],
      id: String(response.id || ''),
      name: String(response.name || 'Mock Response'),
      statusCode: Number.isFinite(Number(response.statusCode)) ? Number(response.statusCode) : 200
    }));
}

function responseFromSavedResponse(savedResponse) {
  if (!savedResponse) {
    return {
      body: '',
      headers: {},
      statusCode: 204
    };
  }
  return normalizeMockResponse({
    body: savedResponse.body || '',
    headers: savedResponse.headers || [],
    statusCode: savedResponse.statusCode || 200
  });
}

function normalizeMockResponse(response = {}) {
  const statusCode = Number(response.statusCode || response.status || response.code || 200);
  const normalized = {
    body: response.body == null ? '' : typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
    headers: normalizeResponseHeaders(response.headers || response.header || {}),
    statusCode: Number.isFinite(statusCode) && statusCode >= 100 && statusCode <= 599 ? Math.floor(statusCode) : 200
  };
  if (Buffer.byteLength(normalized.body, 'utf8') > MAX_MOCK_RESPONSE_BODY_BYTES) {
    throw new Error(`Local mock responses cannot exceed ${MAX_MOCK_RESPONSE_BODY_BYTES} bytes.`);
  }
  return normalized;
}

function normalizeResponseHeaders(headers) {
  if (Array.isArray(headers)) {
    const output = {};
    for (const header of headers) {
      const key = String(header?.key || header?.name || '').trim();
      if (key && header.enabled !== false && header.disabled !== true) {
        output[key] = header.value == null ? '' : String(header.value);
      }
    }
    return output;
  }
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value)]));
}

function routeFallbackResponse(request) {
  return {
    body: JSON.stringify({ error: 'Route not matched', method: request.method, path: request.path }),
    headers: { 'Content-Type': 'application/json' },
    statusCode: 404
  };
}

function scriptErrorResponse(message) {
  return {
    body: JSON.stringify({ error: String(message || 'Local mock script failed.') }),
    headers: {
      'Content-Type': 'application/json',
      'X-PostMeter-Mock-Error': 'script'
    },
    statusCode: 500
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_MOCK_REQUEST_BODY_BYTES) {
        reject(new Error(`Local mock request bodies cannot exceed ${MAX_MOCK_REQUEST_BODY_BYTES} bytes.`));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function writeHttpResponse(response, mockResponse) {
  const normalized = normalizeMockResponse(mockResponse);
  response.writeHead(normalized.statusCode, normalized.headers);
  response.end(normalized.body);
}

function normalizeStateObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized = cloneJsonValue(value);
  if (Object.keys(normalized).length > MAX_MOCK_STATE_KEYS) {
    throw new Error(`Local mock state cannot contain more than ${MAX_MOCK_STATE_KEYS} keys.`);
  }
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_MOCK_STATE_TOTAL_BYTES) {
    throw new Error(`Local mock state cannot exceed ${MAX_MOCK_STATE_TOTAL_BYTES} bytes.`);
  }
  return normalized;
}

function cloneJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function looksLikeJson(value) {
  const text = String(value || '').trim();
  if (!text || !/^[{\[]/.test(text)) {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  MockStateStore,
  handleLocalMockRequest,
  matchMockRequest,
  startLocalMockServer
};
