const { sendRequest } = require('./httpClient');
const { invokeGrpcRequest } = require('./grpcClient');
const { runPostmanScriptIsolated } = require('./scriptSandbox');
const { normalizeAuth } = require('./authModel');
const {
  cloneEnvironment,
  cloneVariables,
  runtimeEnvironment
} = require('./variableScope');

const CLIENT_CERTIFICATE_DIRECT_AUTH_FIELDS = [
  'certPath',
  'keyPath',
  'pfxPath',
  'caPath',
  'passphrase'
];
const SCRIPT_FALLBACK_FIELDS = [
  'preRequest',
  'tests',
  'beforeQuery',
  'afterResponse',
  'beforeInvoke',
  'onMessage',
  'onIncomingMessage',
  'mock'
];

function createScriptedRequestState(request, environment, options = {}) {
  const effectiveRequest = requestWithScopeDefaults(request, {
    collectionAuth: options.collectionAuth,
    collectionScripts: options.collectionScripts,
    folderAuth: options.folderAuth,
    folderScripts: options.folderScripts
  });
  return {
    request: effectiveRequest,
    environment: normalizeRuntimeEnvironment(
      options.cloneEnvironment === false
        ? environment
        : cloneEnvironment(environment)
    ),
    collectionVariables: normalizeVariables(
      options.collectionVariables || [],
      options.cloneCollectionVariables !== false
    ),
    folderVariables: normalizeVariables(
      options.folderVariables || [],
      options.cloneFolderVariables !== false
    ),
    globals: normalizeVariables(
      options.globals || [],
      options.cloneGlobals !== false
    ),
    localVariables: normalizeVariables(
      options.localVariables || request?.variables || [],
      options.cloneLocalVariables !== false
    ),
    cookies: Array.isArray(options.cookieJar) ? cloneJson(options.cookieJar) : []
  };
}

function requestWithScopeDefaults(request, defaults = {}) {
  if (!request) {
    return request;
  }
  const nextRequest = { ...request };
  if (!requestHasOwnAuth(request.auth)) {
    if (requestHasOwnAuth(defaults.folderAuth)) {
      nextRequest.auth = cloneJsonObject(defaults.folderAuth);
    } else if (requestHasOwnAuth(defaults.collectionAuth)) {
      nextRequest.auth = cloneJsonObject(defaults.collectionAuth);
    }
  }
  const scripts = { ...(request.scripts || {}) };
  let hasScriptFallback = false;
  for (const field of SCRIPT_FALLBACK_FIELDS) {
    if (String(scripts[field] || '').trim()) {
      continue;
    }
    const folderScript = String(defaults.folderScripts?.[field] || '');
    if (folderScript.trim()) {
      scripts[field] = folderScript;
      hasScriptFallback = true;
      continue;
    }
    const collectionScript = String(defaults.collectionScripts?.[field] || '');
    if (collectionScript.trim()) {
      scripts[field] = collectionScript;
      hasScriptFallback = true;
    }
  }
  if (hasScriptFallback) {
    nextRequest.scripts = scripts;
  }
  return nextRequest;
}

function requestHasOwnAuth(auth) {
  return normalizeAuth(auth || {}).type !== 'none';
}

async function runScriptedRequestLifecycle(state, options = {}) {
  const protocol = requestProtocol(state.request);
  if (protocol === 'graphql') {
    return runGraphqlRequestLifecycle(state, options);
  }
  if (protocol === 'grpc') {
    return runGrpcRequestLifecycle(state, options);
  }
  if (protocol === 'websocket' || protocol === 'socketio') {
    throw new Error('Postman WebSocket and Socket.IO requests do not currently expose documented script hooks for imported collections.');
  }
  return runHttpScriptedRequestLifecycle(state, options);
}

async function runHttpScriptedRequestLifecycle(state, options = {}) {
  const send = options.sendRequest || sendRequest;
  const runScript = options.scriptRunner || runPostmanScriptIsolated;
  const iterationData = options.iterationData || [];
  const scriptOptions = scriptOptionsForLifecycle(options, { sendRequest: send });

  const preRequestScriptContext = scriptContext(state, {
    collectionId: options.collectionId,
    collectionName: options.collectionName,
    eventName: options.preRequestEventName || 'prerequest',
    executionLocation: options.executionLocation,
    iteration: options.iteration || 0,
    iterationCount: options.iterationCount || 1,
    iterationData,
    workspaceId: options.workspaceId,
    workspaceName: options.workspaceName
  });
  const preRequestScriptExecution = await runScriptSafely(
    runScript,
    state.request?.scripts?.preRequest,
    preRequestScriptContext,
    scriptOptions
  );
  applyScriptMutations(state, preRequestScriptExecution, { allowRequestMutation: true });
  const preRequestScriptResult = scriptResultOnly(preRequestScriptExecution);
  const preRequestExecution = preRequestScriptResult.execution || {};
  if (preRequestExecution.skipRequest === true) {
    return {
      ...state,
      response: null,
      preRequestScriptResult,
      testScriptResult: emptyScriptResult(),
      requestSent: false,
      skipped: true,
      execution: preRequestExecution
    };
  }
  throwIfAborted(options.signal);

  const response = await send(
    state.request,
    runtimeEnvironment(state.collectionVariables, state.environment, state.localVariables, {
      globals: state.globals,
      folderVariables: state.folderVariables,
      iterationData
    }),
    {
      signal: options.signal,
      cookieJar: state.cookies,
      clientCertificates: options.clientCertificates || options.scriptOptions?.clientCertificates || [],
      fileBindings: options.fileBindings || options.scriptOptions?.fileBindings || []
    }
  );
  if (Array.isArray(response.updatedCookies)) {
    state.cookies = response.updatedCookies;
  }
  const testScriptContext = scriptContext(state, {
    collectionId: options.collectionId,
    collectionName: options.collectionName,
    eventName: options.testEventName || 'test',
    executionLocation: options.executionLocation,
    iteration: options.iteration || 0,
    iterationCount: options.iterationCount || 1,
    iterationData,
    response,
    workspaceId: options.workspaceId,
    workspaceName: options.workspaceName
  });
  const testScriptExecution = await runScriptSafely(
    runScript,
    state.request?.scripts?.tests,
    testScriptContext,
    scriptOptions
  );
  applyScriptMutations(state, testScriptExecution, { allowRequestMutation: false });
  if (Array.isArray(state.cookies)) {
    response.updatedCookies = state.cookies;
  }

  return {
    ...state,
    response,
    preRequestScriptResult,
    testScriptResult: scriptResultOnly(testScriptExecution),
    requestSent: true,
    execution: mergeExecution(preRequestExecution, scriptResultOnly(testScriptExecution).execution)
  };
}

async function runGraphqlRequestLifecycle(state, options = {}) {
  const baseSend = options.sendRequest || sendRequest;
  const request = {
    ...(state.request || {}),
    protocol: 'graphql',
    scripts: {
      ...(state.request?.scripts || {}),
      preRequest: protocolScript(state.request, 'beforeQuery', 'preRequest'),
      tests: protocolScript(state.request, 'afterResponse', 'tests')
    }
  };
  return runHttpScriptedRequestLifecycle(
    { ...state, request },
    {
      ...options,
      preRequestEventName: 'beforeQuery',
      testEventName: 'afterResponse',
      sendRequest: async (nextRequest, environment, sendOptions) => (
        normalizeGraphqlProtocolResponse(await baseSend(prepareGraphqlHttpRequest(nextRequest), environment, sendOptions))
      )
    }
  );
}

async function runGrpcRequestLifecycle(state, options = {}) {
  const runScript = options.scriptRunner || runPostmanScriptIsolated;
  const invokeGrpc = options.grpcInvoker || options.scriptOptions?.grpcInvoker || defaultGrpcInvoker;
  const grpcTransportConfig = trustedGrpcTransportConfig(state.request);
  const iterationData = options.iterationData || [];
  const grpcTransportEnvironment = runtimeEnvironment(state.collectionVariables, state.environment, state.localVariables, {
    globals: state.globals,
    folderVariables: state.folderVariables,
    iterationData
  });
  const scriptOptions = scriptOptionsForLifecycle(options, {
    sendRequest: options.sendRequest || sendRequest
  });

  const beforeInvokeContext = scriptContext(state, {
    collectionId: options.collectionId,
    collectionName: options.collectionName,
    eventName: 'beforeInvoke',
    executionLocation: options.executionLocation,
    iteration: options.iteration || 0,
    iterationCount: options.iterationCount || 1,
    iterationData,
    workspaceId: options.workspaceId,
    workspaceName: options.workspaceName
  });
  const beforeInvokeExecution = await runScriptSafely(
    runScript,
    protocolScript(state.request, 'beforeInvoke', 'preRequest'),
    beforeInvokeContext,
    scriptOptions
  );
  applyScriptMutations(state, beforeInvokeExecution, { allowRequestMutation: true });
  const beforeInvokeResult = scriptResultOnly(beforeInvokeExecution);
  const beforeInvokeRuntime = beforeInvokeResult.execution || {};
  if (beforeInvokeRuntime.skipRequest === true) {
    return {
      ...state,
      response: null,
      preRequestScriptResult: beforeInvokeResult,
      messageScriptResults: [],
      afterResponseScriptResult: emptyScriptResult(),
      testScriptResult: emptyScriptResult(),
      requestSent: false,
      skipped: true,
      execution: beforeInvokeRuntime
    };
  }
  throwIfAborted(options.signal);

  const runtimeEnv = runtimeEnvironment(state.collectionVariables, state.environment, state.localVariables, {
    globals: state.globals,
    folderVariables: state.folderVariables,
    iterationData
  });
  let response;
  try {
    const invoked = await invokeGrpc(state.request, runtimeEnv, {
      signal: options.signal,
      cookieJar: state.cookies,
      clientCertificates: options.clientCertificates || options.scriptOptions?.clientCertificates || [],
      grpcProtoBaseDir: options.grpcProtoBaseDir || options.scriptOptions?.grpcProtoBaseDir,
      grpcProtoIncludeDirs: options.grpcProtoIncludeDirs || options.scriptOptions?.grpcProtoIncludeDirs || [],
      grpcTransportEnvironment,
      grpcTransportConfig
    });
    response = normalizeGrpcResponse(invoked);
  } catch (error) {
    response = normalizeGrpcResponse(grpcErrorResponse(error, state.request));
  }
  const onMessageScript = protocolScript(state.request, 'onIncomingMessage', 'onMessage');
  const messageScriptResults = [];
  let messageExecution = {};
  for (const message of response.messages || []) {
    const messageResponse = {
      ...response,
      messages: [message]
    };
    const messageScriptContext = scriptContext(state, {
      collectionId: options.collectionId,
      collectionName: options.collectionName,
      eventName: 'onIncomingMessage',
      executionLocation: options.executionLocation,
      iteration: options.iteration || 0,
      iterationCount: options.iterationCount || 1,
      iterationData,
      message,
      response: messageResponse,
      workspaceId: options.workspaceId,
      workspaceName: options.workspaceName
    });
    const messageScriptExecution = await runScriptSafely(
      runScript,
      onMessageScript,
      messageScriptContext,
      scriptOptions
    );
    applyScriptMutations(state, messageScriptExecution, { allowRequestMutation: false });
    const result = scriptResultOnly(messageScriptExecution);
    messageScriptResults.push(result);
    messageExecution = mergeExecution(messageExecution, result.execution);
  }

  const afterResponseContext = scriptContext(state, {
    collectionId: options.collectionId,
    collectionName: options.collectionName,
    eventName: 'afterResponse',
    executionLocation: options.executionLocation,
    iteration: options.iteration || 0,
    iterationCount: options.iterationCount || 1,
    iterationData,
    response,
    workspaceId: options.workspaceId,
    workspaceName: options.workspaceName
  });
  const afterResponseExecution = await runScriptSafely(
    runScript,
    protocolScript(state.request, 'afterResponse', 'tests'),
    afterResponseContext,
    scriptOptions
  );
  applyScriptMutations(state, afterResponseExecution, { allowRequestMutation: false });
  const afterResponseResult = scriptResultOnly(afterResponseExecution);
  const testScriptResult = aggregateGrpcScriptResult(messageScriptResults, afterResponseResult);

  return {
    ...state,
    response,
    preRequestScriptResult: beforeInvokeResult,
    messageScriptResults,
    afterResponseScriptResult: afterResponseResult,
    testScriptResult,
    requestSent: true,
    execution: mergeExecution(
      mergeExecution(beforeInvokeRuntime, messageExecution),
      afterResponseResult.execution
    )
  };
}

function scriptContext(state, options = {}) {
  return {
    collectionId: options.collectionId || '',
    collectionName: options.collectionName || options.executionLocation?.collectionName || options.executionLocation?.current?.[0] || '',
    collectionVariables: state.collectionVariables,
    folderVariables: state.folderVariables,
    globals: state.globals,
    localVariables: state.localVariables,
    environment: state.environment,
    eventName: options.eventName || (options.response ? 'test' : 'prerequest'),
    executionLocation: options.executionLocation || {},
    message: options.message,
    request: state.request,
    response: options.response,
    cookieJar: state.cookies,
    iterationData: options.iterationData || [],
    iteration: options.iteration || 0,
    iterationCount: options.iterationCount || 1,
    workspaceId: options.workspaceId || '',
    workspaceName: options.workspaceName || ''
  };
}

function scriptOptionsForLifecycle(options = {}, overrides = {}) {
  const send = overrides.sendRequest || options.sendRequest || sendRequest;
  return {
    ...(options.scriptOptions || {}),
    runRequest: options.scriptOptions?.runRequest || options.runRequest,
    sandboxPackages: options.scriptOptions?.sandboxPackages || options.sandboxPackages || [],
    clientCertificates: options.scriptOptions?.clientCertificates || options.clientCertificates || [],
    sendRequest: options.scriptOptions?.sendRequest || send,
    signal: options.signal,
    trustedCapabilities: options.trustedCapabilities || options.scriptOptions?.trustedCapabilities || {},
    vault: options.scriptOptions?.vault || options.vault,
    vaultPrompt: options.scriptOptions?.vaultPrompt || options.vaultPrompt,
    fileBindings: options.scriptOptions?.fileBindings || options.fileBindings || [],
    recordDiagnosticEvent: options.scriptOptions?.recordDiagnosticEvent || options.recordDiagnosticEvent
  };
}

async function runScriptSafely(runScript, scriptText, context, options = {}) {
  try {
    return await runScript(scriptText, context, options);
  } catch (error) {
    if (options.signal?.aborted === true || error?.name === 'AbortError') {
      throw error;
    }
    return failedScriptExecution(error, context);
  }
}

function failedScriptExecution(error, context = {}) {
  const message = error?.message || String(error || 'Script failed.');
  return {
    result: {
      passed: false,
      tests: [],
      error: message,
      logs: [],
      commitSideEffects: false,
      execution: {}
    },
    environmentVariables: context.environment?.variables || [],
    collectionVariables: context.collectionVariables || [],
    globals: context.globals || [],
    localVariables: context.localVariables || [],
    cookies: context.cookieJar || [],
    request: context.request || {}
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted === true) {
    const error = new Error('Request was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

function requestProtocol(request = {}) {
  const protocol = String(request?.protocol || '').trim().toLowerCase();
  if (protocol === 'graphql' || protocol === 'grpc' || protocol === 'websocket' || protocol === 'socketio') {
    return protocol;
  }
  const graphql = request?.graphql && typeof request.graphql === 'object' && Object.keys(request.graphql).length > 0;
  if (request?.postmanBody?.mode === 'graphql' || request?.bodyDefinition?.mode === 'graphql' || graphql) {
    return 'graphql';
  }
  const grpc = request?.grpc && typeof request.grpc === 'object' && Object.keys(request.grpc).length > 0;
  const methodPath = String(request?.methodPath || '').trim();
  const url = String(request?.url || '').trim().toLowerCase();
  if (grpc || methodPath || url.startsWith('grpc://') || url.startsWith('grpcs://')) {
    return 'grpc';
  }
  return 'http';
}

function protocolScript(request = {}, primary, fallback) {
  const scripts = request?.scripts || {};
  const primaryScript = String(scripts[primary] || '');
  if (primaryScript.trim()) {
    return primaryScript;
  }
  return String(scripts[fallback] || '');
}

function prepareGraphqlHttpRequest(request = {}) {
  const body = graphqlBodyForRequest(request);
  return {
    ...request,
    body: JSON.stringify(body),
    bodyType: 'RAW_JSON',
    headers: ensureHeader(request.headers, 'Content-Type', 'application/json'),
    method: String(request.method || 'POST').toUpperCase(),
    postmanBody: {
      ...(request.postmanBody || {}),
      mode: 'graphql',
      graphql: {
        query: body.query,
        variables: typeof body.variables === 'string' ? body.variables : JSON.stringify(body.variables ?? {}),
        operationName: body.operationName || ''
      }
    },
    protocol: 'graphql'
  };
}

function graphqlBodyForRequest(request = {}) {
  const fromPostmanBody = request?.postmanBody?.graphql;
  const fromGraphql = request?.graphql;
  const fromBody = parseJsonObject(request?.body);
  const source = fromPostmanBody && Object.keys(fromPostmanBody).length
    ? fromPostmanBody
    : fromGraphql && Object.keys(fromGraphql).length
      ? fromGraphql
      : fromBody;
  return {
    query: source?.query == null ? '' : String(source.query),
    variables: parseGraphqlVariables(source?.variables),
    operationName: source?.operationName == null ? '' : String(source.operationName)
  };
}

function parseGraphqlVariables(value) {
  if (value == null || value === '') {
    return {};
  }
  if (typeof value !== 'string') {
    return cloneJsonObject(value);
  }
  const text = value.trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function normalizeGraphqlProtocolResponse(response = {}) {
  const messages = graphqlMessagesFromResponse(response);
  if (!messages.length) {
    return response;
  }
  return {
    ...response,
    messages
  };
}

function graphqlMessagesFromResponse(response = {}) {
  if (Array.isArray(response.messages) && response.messages.length) {
    return normalizeGraphqlMessages(response.messages);
  }
  const body = response.body == null ? '' : Buffer.isBuffer(response.body) ? response.body.toString('utf8') : String(response.body);
  if (!body.trim()) {
    return [];
  }
  const contentType = responseHeaderValue(response.headers || response.header || {}, 'content-type');
  if (/text\/event-stream/i.test(contentType)) {
    return normalizeGraphqlMessages(parseServerSentEventMessages(body));
  }
  if (/multipart\/mixed/i.test(contentType) || /multipart\/related/i.test(contentType)) {
    return normalizeGraphqlMessages(parseMultipartGraphqlMessages(body, contentType));
  }
  const parsed = parseJsonValue(body);
  if (Array.isArray(parsed)) {
    return normalizeGraphqlMessages(parsed);
  }
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.messages)) {
      return normalizeGraphqlMessages(parsed.messages);
    }
    if (Array.isArray(parsed.responses)) {
      return normalizeGraphqlMessages(parsed.responses);
    }
  }
  return [];
}

function parseServerSentEventMessages(body) {
  const messages = [];
  for (const eventBlock of String(body || '').split(/\r?\n\r?\n/)) {
    const dataLines = [];
    for (const line of eventBlock.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) {
        continue;
      }
      const separatorIndex = line.indexOf(':');
      const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
      if (field !== 'data') {
        continue;
      }
      let value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      dataLines.push(value);
    }
    const dataText = dataLines.join('\n').trim();
    if (!dataText || dataText === '[DONE]') {
      continue;
    }
    messages.push(parseJsonValue(dataText) ?? dataText);
  }
  return messages;
}

function parseMultipartGraphqlMessages(body, contentType) {
  const boundaryMatch = String(contentType || '').match(/boundary="?([^";]+)"?/i);
  if (!boundaryMatch) {
    return [];
  }
  const boundary = boundaryMatch[1];
  const messages = [];
  for (const rawPart of String(body || '').split(`--${boundary}`)) {
    const part = rawPart.trim();
    if (!part || part === '--') {
      continue;
    }
    const cleanPart = part.endsWith('--') ? part.slice(0, -2).trim() : part;
    const delimiter = cleanPart.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
    const delimiterIndex = cleanPart.indexOf(delimiter);
    const payload = delimiterIndex >= 0 ? cleanPart.slice(delimiterIndex + delimiter.length).trim() : cleanPart.trim();
    if (!payload) {
      continue;
    }
    messages.push(parseJsonValue(payload) ?? payload);
  }
  return messages;
}

function normalizeGraphqlMessages(values = []) {
  return values
    .filter((message) => message != null)
    .slice(0, 1000)
    .map((message) => {
      const source = message && typeof message === 'object' && !Buffer.isBuffer(message)
        ? message
        : { data: message };
      return {
        data: normalizeGraphqlMessageData(source.data ?? source.payload ?? source.body ?? source),
        name: source.name == null ? 'graphql' : String(source.name),
        timestamp: source.timestamp == null ? new Date(0).toISOString() : String(source.timestamp),
        type: source.type == null ? 'response' : String(source.type)
      };
    });
}

function normalizeGraphqlMessageData(value) {
  if (Buffer.isBuffer(value)) {
    return parseJsonValue(value.toString('utf8')) ?? value.toString('utf8');
  }
  if (typeof value === 'string') {
    return parseJsonValue(value) ?? value;
  }
  return cloneJsonObject(value);
}

function responseHeaderValue(headers, name) {
  const target = String(name || '').toLowerCase();
  if (typeof headers?.get === 'function') {
    return headers.get(target) || '';
  }
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() !== target) {
      continue;
    }
    return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  }
  return '';
}

function parseJsonValue(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || !/^[{[]/.test(text)) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function ensureHeader(headers, name, value) {
  const next = Array.isArray(headers) ? cloneJson(headers) : [];
  const target = String(name || '').toLowerCase();
  const existing = next.find((header) => String(header?.key || '').toLowerCase() === target);
  if (existing) {
    if (existing.enabled === false) {
      existing.enabled = true;
      existing.value = value;
    }
    return next;
  }
  next.push({ enabled: true, key: name, value });
  return next;
}

function normalizeGrpcResponse(value = {}) {
  const source = value?.response && typeof value.response === 'object' ? value.response : value || {};
  const messages = normalizeGrpcMessages(source.messages || source.message || source.data);
  const body = source.body == null ? grpcBodyFromMessages(messages) : responseBodyToString(source.body);
  const code = normalizeGrpcStatusCode(source.code ?? source.statusCode ?? source.status);
  return {
    body,
    cancelled: source.cancelled === true || value?.cancelled === true,
    code,
    durationMillis: Number(source.durationMillis ?? source.responseTime ?? value?.durationMillis ?? 0) || 0,
    finalUrl: source.finalUrl || source.url || value?.finalUrl || '',
    headers: source.headers || source.header || {},
    messages,
    metadata: normalizePairsForProtocol(source.metadata || source.headerMetadata || value?.metadata),
    reason: source.reason || source.statusText || '',
    responseBytes: Number(source.responseBytes ?? Buffer.byteLength(body, 'utf8')) || 0,
    responseSize: Number(source.responseSize ?? source.responseBytes ?? Buffer.byteLength(body, 'utf8')) || 0,
    responseTime: Number(source.responseTime ?? source.durationMillis ?? value?.durationMillis ?? 0) || 0,
    status: source.status == null ? (source.statusText || source.reason || '') : source.status,
    statusCode: code,
    trailers: normalizePairsForProtocol(source.trailers || source.trailer || value?.trailers),
    updatedCookies: Array.isArray(source.updatedCookies) ? cloneJson(source.updatedCookies) : undefined
  };
}

function normalizeGrpcStatusCode(value) {
  const code = Number(value);
  return Number.isFinite(code) ? code : 0;
}

function normalizeGrpcMessages(values) {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  return list
    .filter((message) => message != null)
    .slice(0, 1000)
    .map((message) => {
      const source = message && typeof message === 'object' && !Buffer.isBuffer(message)
        ? message
        : { data: message };
      return {
        data: normalizeGrpcMessageData(source.data ?? source.value ?? source.body ?? ''),
        name: source.name == null ? '' : String(source.name),
        timestamp: source.timestamp == null ? new Date(0).toISOString() : String(source.timestamp),
        type: source.type == null ? '' : String(source.type)
      };
    });
}

function normalizeGrpcMessageData(value) {
  if (typeof value !== 'string') {
    return cloneJsonObject(value);
  }
  const text = value.trim();
  if (!text || !/^[{[]/.test(text)) {
    return value;
  }
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function grpcBodyFromMessages(messages = []) {
  if (messages.length === 1) {
    return responseBodyToString(messages[0].data);
  }
  return JSON.stringify(messages.map((message) => message.data));
}

function responseBodyToString(value) {
  if (value == null) {
    return '';
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function normalizePairsForProtocol(values) {
  const list = Array.isArray(values)
    ? values
    : values && typeof values === 'object'
      ? Object.entries(values).map(([key, value]) => ({ key, value }))
      : [];
  return list
    .filter((item) => item?.key || item?.name)
    .slice(0, 1000)
    .map((item) => ({
      enabled: item.enabled !== false && item.disabled !== true,
      key: String(item.key || item.name),
      value: item.value == null ? '' : String(item.value)
    }));
}

function aggregateGrpcScriptResult(messageResults = [], afterResponseResult = emptyScriptResult()) {
  const results = [...messageResults, afterResponseResult || emptyScriptResult()];
  return {
    passed: results.every((result) => result?.passed !== false),
    tests: results.flatMap((result) => result?.tests || []),
    error: results.find((result) => result?.error)?.error || '',
    logs: results.flatMap((result) => result?.logs || []),
    commitSideEffects: results.every((result) => result?.commitSideEffects !== false),
    execution: results.reduce((execution, result) => mergeExecution(execution, result?.execution), {})
  };
}

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cloneJsonObject(value) {
  if (!value || typeof value !== 'object') {
    return value ?? {};
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

async function defaultGrpcInvoker(request, runtimeEnv, options = {}) {
  return invokeGrpcRequest(request, runtimeEnv, options);
}

function trustedGrpcTransportConfig(request = {}) {
  return {
    auth: request.auth && typeof request.auth === 'object' ? cloneJsonObject(request.auth) : {},
    grpc: request.grpc && typeof request.grpc === 'object' ? cloneJsonObject(request.grpc) : {},
    protocolProfile: request.protocolProfile && typeof request.protocolProfile === 'object' ? cloneJsonObject(request.protocolProfile) : {}
  };
}

function grpcErrorResponse(error, request = {}) {
  const code = Number.isFinite(Number(error?.code)) ? Number(error.code) : 13;
  const reason = error?.details || error?.message || String(error || 'gRPC request failed.');
  return {
    response: {
      body: '',
      cancelled: code === 1 || error?.name === 'AbortError',
      code,
      durationMillis: 0,
      finalUrl: grpcFinalUrlForError(request),
      headers: {},
      messages: [],
      metadata: [],
      reason,
      responseBytes: 0,
      responseSize: 0,
      responseTime: 0,
      status: grpcStatusName(code),
      statusCode: code,
      trailers: [
        { enabled: true, key: 'grpc-status', value: String(code) },
        { enabled: true, key: 'grpc-message', value: reason }
      ]
    }
  };
}

function grpcFinalUrlForError(request = {}) {
  const url = String(request.url || '').replace(/\/+$/, '');
  const methodPath = String(request.methodPath || request.grpc?.methodPath || '').replace(/^\/+/, '');
  return methodPath && !url.endsWith(methodPath) ? `${url}/${methodPath}` : url;
}

function grpcStatusName(code) {
  return {
    0: 'OK',
    1: 'CANCELLED',
    2: 'UNKNOWN',
    3: 'INVALID_ARGUMENT',
    4: 'DEADLINE_EXCEEDED',
    5: 'NOT_FOUND',
    6: 'ALREADY_EXISTS',
    7: 'PERMISSION_DENIED',
    8: 'RESOURCE_EXHAUSTED',
    9: 'FAILED_PRECONDITION',
    10: 'ABORTED',
    11: 'OUT_OF_RANGE',
    12: 'UNIMPLEMENTED',
    13: 'INTERNAL',
    14: 'UNAVAILABLE',
    15: 'DATA_LOSS',
    16: 'UNAUTHENTICATED'
  }[code] || 'UNKNOWN';
}

function applyScriptMutations(state, execution, options = {}) {
  const result = scriptResultOnly(execution);
  if (execution && result.commitSideEffects === false) {
    return;
  }
  const environmentVariables = execution?.environmentVariables;
  const nextCollectionVariables = execution?.collectionVariables;
  if (Array.isArray(environmentVariables)) {
    state.environment.variables = environmentVariables;
  }
  if (Array.isArray(nextCollectionVariables)) {
    state.collectionVariables.splice(0, state.collectionVariables.length, ...nextCollectionVariables);
  }
  if (Array.isArray(execution?.globals)) {
    state.globals.splice(0, state.globals.length, ...execution.globals);
  }
  if (Array.isArray(execution?.localVariables)) {
    state.localVariables.splice(0, state.localVariables.length, ...execution.localVariables);
  }
  if (Array.isArray(execution?.cookies)) {
    state.cookies = execution.cookies;
  }
  if (options.allowRequestMutation !== false && execution?.request && state.request) {
    state.request = {
      ...state.request,
      method: execution.request.method || state.request.method,
      url: execution.request.url == null ? state.request.url : execution.request.url,
      queryParams: Array.isArray(execution.request.queryParams) ? execution.request.queryParams : state.request.queryParams,
      headers: Array.isArray(execution.request.headers) ? execution.request.headers : state.request.headers,
      bodyType: execution.request.bodyType || state.request.bodyType,
      body: execution.request.body == null ? state.request.body : execution.request.body,
      auth: execution.request.auth && typeof execution.request.auth === 'object'
        ? sanitizeScriptMutatedAuth(execution.request.auth, state.request.auth)
        : state.request.auth,
      metadata: Array.isArray(execution.request.metadata) ? cloneJson(execution.request.metadata) : state.request.metadata,
      messages: Array.isArray(execution.request.messages) ? cloneJson(execution.request.messages) : state.request.messages,
      methodPath: execution.request.methodPath == null ? state.request.methodPath : String(execution.request.methodPath),
      postmanBody: execution.request.postmanBody && typeof execution.request.postmanBody === 'object' ? cloneJson(execution.request.postmanBody) : state.request.postmanBody,
      protocol: execution.request.protocol == null ? state.request.protocol : String(execution.request.protocol),
      graphql: execution.request.graphql && typeof execution.request.graphql === 'object' ? cloneJson(execution.request.graphql) : state.request.graphql,
      grpc: execution.request.grpc && typeof execution.request.grpc === 'object' ? cloneJson(execution.request.grpc) : state.request.grpc
    };
  }
}

function sanitizeScriptMutatedAuth(nextAuth, currentAuth) {
  const normalized = normalizeAuth(nextAuth || {});
  if (normalized.type !== 'clientCertificate') {
    return cloneJson(nextAuth);
  }
  const certificateId = String(normalized.certificateId || '').trim();
  if (certificateId) {
    return { type: 'clientCertificate', certificateId };
  }
  if (hasDirectClientCertificateMaterial(nextAuth) || hasDirectClientCertificateMaterial(normalized)) {
    return currentAuth && typeof currentAuth === 'object' ? cloneJson(currentAuth) : { type: 'none' };
  }
  return normalized;
}

function hasDirectClientCertificateMaterial(auth) {
  if (!auth || typeof auth !== 'object') {
    return false;
  }
  return CLIENT_CERTIFICATE_DIRECT_AUTH_FIELDS.some((field) => String(auth[field] || '').trim())
    || Boolean(auth.cert?.src || auth.key?.src || auth.pfx?.src);
}

function preRequestScriptShouldAbortRequest(scriptResult) {
  const result = scriptResult && typeof scriptResult === 'object' ? scriptResult : {};
  if (result.passed !== false) {
    return false;
  }
  if (String(result.error || '').trim()) {
    return true;
  }
  return !Array.isArray(result.tests) || result.tests.length === 0;
}

function scriptResultFailureMessage(scriptResult, fallback = 'Script failed.') {
  const result = scriptResult && typeof scriptResult === 'object' ? scriptResult : {};
  const topLevelError = String(result.error || '').trim();
  if (topLevelError) {
    return topLevelError;
  }
  const failedTest = (Array.isArray(result.tests) ? result.tests : [])
    .find((item) => item && item.passed === false);
  if (failedTest) {
    const testName = String(failedTest.name || '').trim();
    const testError = String(failedTest.error || '').trim() || 'failed';
    const prefix = String(fallback || 'Script failed.').replace(/\.$/, '');
    return `${prefix}: ${testName ? `${testName}: ` : ''}${testError}`;
  }
  return String(fallback || 'Script failed.');
}

function scriptResultOnly(execution) {
  if (!execution) {
    return emptyScriptResult();
  }
  return execution.result || execution;
}

function emptyScriptResult() {
  return {
    passed: true,
    tests: [],
    error: '',
    logs: [],
    commitSideEffects: true,
    execution: {}
  };
}

function normalizeRuntimeEnvironment(environment) {
  if (!environment) {
    return { id: 'runtime', name: 'Runtime', variables: [] };
  }
  environment.variables = Array.isArray(environment.variables) ? environment.variables : [];
  return environment;
}

function normalizeVariables(variables, shouldClone) {
  if (shouldClone === false) {
    return Array.isArray(variables) ? variables : [];
  }
  return cloneVariables(variables);
}

function mergeExecution(left = {}, right = {}) {
  const merged = {
    ...left,
    ...right,
    skipRequest: left.skipRequest === true || right.skipRequest === true
  };
  if (Object.hasOwn(right, 'nextRequest')) {
    merged.nextRequest = right.nextRequest;
  } else if (Object.hasOwn(left, 'nextRequest')) {
    merged.nextRequest = left.nextRequest;
  } else {
    delete merged.nextRequest;
  }
  return merged;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || []));
}

module.exports = {
  applyScriptMutations,
  createScriptedRequestState,
  emptyScriptResult,
  preRequestScriptShouldAbortRequest,
  prepareGraphqlHttpRequest,
  requestProtocol,
  runGraphqlRequestLifecycle,
  runGrpcRequestLifecycle,
  runScriptedRequestLifecycle,
  scriptResultFailureMessage,
  scriptResultOnly
};
