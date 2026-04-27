const { fork, spawn } = require('node:child_process');
const path = require('node:path');
const { BODY_TYPES } = require('./models');
const {
  OS_SANDBOX_MODES,
  createScriptWorkerLaunch,
  osSandboxStatus,
  prepareSeccompStdio
} = require('./osSandbox');
const { LIMITS } = require('./payloadSchemas');
const { buildUrl, sendRequest } = require('./httpClient');
const { cookieFromHeader, cookiesForRequest } = require('./cookieJar');
const { normalizeCookieDomain } = require('./cookieModel');
const { runtimeEnvironment } = require('./variableScope');
const {
  DEFAULT_SCRIPT_TIMEOUT_MILLIS,
  MAX_SCRIPT_LENGTH,
  MAX_SCRIPT_RESULT_BYTES,
  runPostmanScript
} = require('./scriptRuntime');
const {
  normalizeVaultKey,
  normalizeVaultSecretValue
} = require('./vaultStore');

const PROTOCOL_VERSION = 1;
const WORKER_SHUTDOWN_GRACE_MILLIS = 50;
const DEFAULT_SCRIPT_WORKER_MAX_OLD_SPACE_MB = 64;
const MIN_SCRIPT_WORKER_MAX_OLD_SPACE_MB = 16;
const MAX_SCRIPT_WORKER_MAX_OLD_SPACE_MB = 512;
const MAX_BROKER_PAYLOAD_BYTES = 512 * 1024;
const MAX_PM_SEND_RESPONSE_BYTES = 512 * 1024;
const MAX_PM_EXECUTION_RUN_REQUESTS = 10;
const MAX_PM_VAULT_OPERATIONS = 16;
const MAX_WORKER_STDERR_BYTES = 4096;
const MAX_PENDING_BROKER_TIMERS = 64;
const MAX_BROKER_TIMER_DELAY_MILLIS = 30_000;
const SCRIPT_WORKER_ALLOWED_FILES = [
  path.join(__dirname, 'scriptWorker.js'),
  path.join(__dirname, 'scriptRuntime.js'),
  path.join(__dirname, 'variableScope.js')
];
const BROKER_OPERATIONS = new Set([
  'timer',
  'clearTimer',
  'sendRequest',
  'execution:runRequest',
  'vault:get',
  'vault:set',
  'vault:unset',
  'cookies:get',
  'cookies:toObject',
  'cookies:set',
  'cookies:unset',
  'cookies.jar:get',
  'cookies.jar:getAll',
  'cookies.jar:set',
  'cookies.jar:unset',
  'cookies.jar:clear'
]);

function runPostmanScriptIsolated(scriptText, context = {}, options = {}) {
  const source = String(scriptText || '');
  if (!source.trim()) {
    return Promise.resolve({
      result: runPostmanScript(source, context, options),
      environmentVariables: context.environment?.variables || [],
      collectionVariables: context.collectionVariables || [],
      globals: context.globals || [],
      localVariables: context.localVariables || [],
      cookies: context.cookieJar || []
    });
  }
  if (source.length > MAX_SCRIPT_LENGTH) {
    return Promise.resolve({
      result: runPostmanScript(source, context, options),
      environmentVariables: context.environment?.variables || [],
      collectionVariables: context.collectionVariables || [],
      globals: context.globals || [],
      localVariables: context.localVariables || [],
      cookies: context.cookieJar || []
    });
  }

  const timeoutMillis = Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS);
  const workerTimeoutMillis = Math.max(
    1,
    Number.isFinite(Number(options.workerTimeoutMillis))
      ? Number(options.workerTimeoutMillis)
      : timeoutMillis + 500
  );
  const workerPath = path.join(__dirname, 'scriptWorker.js');
  const executionId = `script-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const brokerState = createBrokerState(context, options);
  const payload = {
    type: 'script:start',
    version: PROTOCOL_VERSION,
    executionId,
    scriptText: source,
    context: cloneForWorker({
      ...context,
      cookieJar: brokerState.cookies
    }),
    options: {
      filename: options.filename,
      timeoutMillis
    }
  };
  let execArgv;
  let launch;
  try {
    execArgv = scriptWorkerExecArgv(options);
    launch = createScriptWorkerLaunch(workerPath, execArgv, scriptWorkerEnv(options), options);
  } catch (error) {
    return Promise.resolve(failedExecution(error, context));
  }

  return new Promise((resolve) => {
    const child = startScriptWorkerProcess(launch);
    const transport = createChildTransport(child, launch.transport);
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      brokerState.cancelAllTimers();
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      if (!child.killed) {
        transport.disconnect();
        setTimeout(() => {
          if (!child.killed && child.exitCode == null) {
            child.kill('SIGKILL');
          }
        }, WORKER_SHUTDOWN_GRACE_MILLIS).unref?.();
      }
      resolve(value);
    };
    const fail = (error) => finish(failedExecution(error, context));
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error('Script worker timed out and was terminated.'));
    }, workerTimeoutMillis);
    timeout.unref?.();
    const onAbort = () => {
      child.kill('SIGKILL');
      fail(new Error('Script execution cancelled.'));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', fail);
    transport.onError(fail);
    transport.onMessage((message) => {
      if (settled) {
        return;
      }
      if (message?.type === 'broker:request') {
        handleBrokerRequest(transport, brokerState, executionId, message);
        return;
      }
      if (message?.type !== 'script:result') {
        fail(new Error('Script worker sent an unknown message.'));
        return;
      }
      try {
        validateWorkerResultMessage(message, executionId);
      } catch (error) {
        fail(error);
        return;
      }
      if (!message.ok) {
        finish(failedExecution(new Error(message.error || 'Script worker failed.'), context));
        return;
      }
      const resultSize = Buffer.byteLength(JSON.stringify(workerResultPayload(message)), 'utf8');
      if (resultSize > MAX_SCRIPT_RESULT_BYTES) {
        finish(failedExecution(new Error('Script worker result exceeded the maximum allowed size.'), context));
        return;
      }
      const commitSideEffects = message.result?.commitSideEffects !== false;
      finish({
        result: message.result,
        environmentVariables: commitSideEffects ? message.environmentVariables || [] : context.environment?.variables || [],
        collectionVariables: commitSideEffects ? message.collectionVariables || [] : context.collectionVariables || [],
        globals: commitSideEffects ? message.globals || [] : context.globals || [],
        localVariables: commitSideEffects ? message.localVariables || [] : context.localVariables || [],
        cookies: commitSideEffects ? brokerState.cookies : context.cookieJar || [],
        request: commitSideEffects ? message.request || context.request || {} : context.request || {}
      });
    });
    child.once('exit', (code, signal) => {
      if (!settled) {
        const stderr = transport.stderrText?.();
        const detail = stderr ? `: ${stderr}` : '';
        fail(new Error(`Script worker exited before returning a result (${signal || code})${detail}.`));
      }
    });
    transport.send(payload);
  });
}

function startScriptWorkerProcess(launch) {
  if (launch.transport === 'stdio') {
    const seccomp = prepareSeccompStdio(launch, ['pipe', 'pipe', 'pipe']);
    try {
      return spawn(launch.command, launch.args, {
        env: launch.env,
        serialization: 'json',
        stdio: seccomp.stdio
      });
    } finally {
      seccomp.cleanup();
    }
  }
  return fork(launch.workerPath, [], {
    env: launch.env,
    execArgv: launch.execArgv,
    serialization: 'json',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  });
}

function createChildTransport(child, type) {
  if (type === 'stdio') {
    return createStdioChildTransport(child);
  }
  return {
    send(message) {
      if (child.connected) {
        child.send(message);
      }
    },
    onMessage(handler) {
      child.on('message', handler);
    },
    onError() {},
    disconnect() {
      child.disconnect?.();
    },
    isConnected() {
      return child.connected;
    }
  };
}

function createStdioChildTransport(child) {
  let buffer = '';
  let stderrBuffer = '';
  let messageHandler = () => {};
  let errorHandler = () => {};
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim()) {
        try {
          messageHandler(JSON.parse(line));
        } catch (error) {
          errorHandler(new Error(`Script worker protocol JSON was invalid: ${error.message || String(error)}`));
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });
  child.stderr.on('data', (chunk) => {
    stderrBuffer = `${stderrBuffer}${chunk}`;
    if (Buffer.byteLength(stderrBuffer, 'utf8') > MAX_WORKER_STDERR_BYTES) {
      stderrBuffer = stderrBuffer.slice(-MAX_WORKER_STDERR_BYTES);
    }
  });
  return {
    send(message) {
      if (!child.stdin.destroyed) {
        child.stdin.write(`${JSON.stringify(message)}\n`, () => {});
      }
    },
    onMessage(handler) {
      messageHandler = handler;
    },
    onError(handler) {
      errorHandler = handler;
      child.stdin.on('error', handler);
    },
    disconnect() {
      child.stdin.end();
    },
    isConnected() {
      return !child.killed && !child.stdin.destroyed;
    },
    stderrText() {
      return stderrBuffer.trim();
    }
  };
}

function failedExecution(error, context) {
  return {
    result: {
      passed: false,
      tests: [],
      error: error.message || String(error),
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

function createBrokerState(context, options) {
  const timers = new Map();
  return {
    cookies: cloneForWorker(context.cookieJar || []),
    context: cloneForWorker(context),
    options,
    runRequestCalls: 0,
    vaultOperations: 0,
    seenBrokerRequestIds: new Set(),
    timers,
    cancelAllTimers() {
      for (const timer of timers.values()) {
        clearTimeout(timer.timeout);
        timer.resolve?.({ cancelled: true });
      }
      timers.clear();
    }
  };
}

function handleBrokerRequest(transport, brokerState, executionId, message) {
  const fail = (error) => sendBrokerResponse(transport, message, false, undefined, error.message || String(error));
  try {
    validateBrokerMessage(brokerState, executionId, message);
  } catch (error) {
    fail(error);
    return;
  }
  runBrokerOperation(brokerState, message.operation, message.payload || {})
    .then((payload) => sendBrokerResponse(transport, message, true, payload))
    .catch(fail);
}

async function runBrokerOperation(state, operation, payload) {
  if (operation === 'timer') {
    return waitForBrokerTimer(state, payload);
  }
  if (operation === 'clearTimer') {
    const timer = state.timers.get(Number(payload.timerId));
    if (timer) {
      clearTimeout(timer.timeout);
      state.timers.delete(Number(payload.timerId));
      timer.resolve({ cancelled: true });
    }
    return {};
  }
  if (operation === 'sendRequest') {
    return runBrokeredSendRequest(state, payload);
  }
  if (operation === 'execution:runRequest') {
    return runBrokeredExecutionRunRequest(state, payload);
  }
  if (operation === 'vault:get') {
    return runBrokeredVaultGet(state, payload);
  }
  if (operation === 'vault:set') {
    return runBrokeredVaultSet(state, payload);
  }
  if (operation === 'vault:unset') {
    return runBrokeredVaultUnset(state, payload);
  }
  if (operation === 'cookies:get') {
    assertCookieCapability(state);
    const cookie = visibleCookiesForCurrentRequest(state).find((item) => item.name === String(payload.name || ''));
    return cookie ? cookie.value ?? '' : undefined;
  }
  if (operation === 'cookies:toObject') {
    assertCookieCapability(state);
    const object = {};
    for (const cookie of visibleCookiesForCurrentRequest(state)) {
      object[cookie.name] = cookie.value ?? '';
    }
    return object;
  }
  if (operation === 'cookies:set') {
    assertCookieCapability(state);
    const url = currentRequestUrl(state);
    const cookie = cookieFromHeader({ name: String(payload.name || ''), value: payload.value == null ? '' : String(payload.value) }, url, {
      source: 'script'
    });
    state.cookies = state.cookies.filter((item) => cookieIdentity(item) !== cookieIdentity(cookie));
    state.cookies.push(cookie);
    return {};
  }
  if (operation === 'cookies:unset') {
    assertCookieCapability(state);
    const name = String(payload.name || '').toLowerCase();
    state.cookies = state.cookies.filter((cookie) => {
      if (String(cookie.name || '').toLowerCase() !== name) {
        return true;
      }
      if (cookie.httpOnly === true) {
        return true;
      }
      return !cookiesForRequest([cookie], currentRequestUrl(state)).length;
    });
    return {};
  }
  if (operation === 'cookies.jar:get') {
    assertCookieCapability(state);
    const cookie = visibleCookiesForUrl(state, payload.url).find((item) => item.name === String(payload.name || ''));
    return cookie ? cookie.value ?? '' : undefined;
  }
  if (operation === 'cookies.jar:getAll') {
    assertCookieCapability(state);
    const object = {};
    for (const cookie of visibleCookiesForUrl(state, payload.url)) {
      object[cookie.name] = cookie.value ?? '';
    }
    return object;
  }
  if (operation === 'cookies.jar:set') {
    assertCookieCapability(state);
    const url = cookieJarOperationUrl(payload.url);
    const cookie = cookieFromJarSetPayload(payload, url);
    state.cookies = state.cookies.filter((item) => cookieIdentity(item) !== cookieIdentity(cookie));
    state.cookies.push(cookie);
    return {};
  }
  if (operation === 'cookies.jar:unset') {
    assertCookieCapability(state);
    const name = String(payload.name || '').toLowerCase();
    const url = cookieJarOperationUrl(payload.url);
    state.cookies = state.cookies.filter((cookie) => {
      if (String(cookie.name || '').toLowerCase() !== name) {
        return true;
      }
      if (cookie.httpOnly === true) {
        return true;
      }
      return !cookiesForRequest([cookie], url).length;
    });
    return {};
  }
  if (operation === 'cookies.jar:clear') {
    assertCookieCapability(state);
    const url = cookieJarOperationUrl(payload.url);
    state.cookies = state.cookies.filter((cookie) => {
      if (cookie.httpOnly === true) {
        return true;
      }
      return !cookiesForRequest([cookie], url).length;
    });
    return {};
  }
  throw new Error(`Unsupported broker operation: ${operation}.`);
}

function waitForBrokerTimer(state, payload) {
  if (state.timers.size >= MAX_PENDING_BROKER_TIMERS) {
    throw new Error(`Scripts cannot schedule more than ${MAX_PENDING_BROKER_TIMERS} pending timers.`);
  }
  const delayMillis = Math.min(
    MAX_BROKER_TIMER_DELAY_MILLIS,
    Math.max(0, Number(payload.delayMillis) || 0)
  );
  const timerId = Number(payload.timerId);
  if (!Number.isSafeInteger(timerId) || timerId <= 0) {
    throw new Error('Script broker timer ID is invalid.');
  }
  if (state.timers.has(timerId)) {
    throw new Error('Script broker timer ID is already pending.');
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      state.timers.delete(timerId);
      resolve({});
    }, delayMillis);
    timeout.unref?.();
    state.timers.set(timerId, { timeout, resolve });
  });
}

async function runBrokeredSendRequest(state, payload) {
  if (!scriptCapabilityEnabled(state, 'sendRequest')) {
    throw new Error('pm.sendRequest is disabled for this workspace.');
  }
  const request = normalizePmSendRequest(payload.request);
  const response = await (state.options.sendRequest || sendRequest)(request, runtimeEnvironmentForBroker(state), {
    signal: state.options.signal
  });
  if (Buffer.byteLength(String(response.body || ''), 'utf8') > MAX_PM_SEND_RESPONSE_BYTES) {
    throw new Error(`pm.sendRequest response body cannot exceed ${MAX_PM_SEND_RESPONSE_BYTES} bytes.`);
  }
  return {
    statusCode: response.statusCode,
    headers: response.headers || {},
    body: response.body || '',
    durationMillis: response.durationMillis || 0,
    responseBytes: response.responseBytes || Buffer.byteLength(response.body || '', 'utf8'),
    finalUrl: response.finalUrl || request.url
  };
}

async function runBrokeredExecutionRunRequest(state, payload) {
  if (!scriptCapabilityEnabled(state, 'sendRequest')) {
    throw new Error('pm.execution.runRequest is disabled for this workspace.');
  }
  if (typeof state.options.runRequest !== 'function') {
    throw new Error('pm.execution.runRequest is not available in this execution context.');
  }
  state.runRequestCalls += 1;
  if (state.runRequestCalls > MAX_PM_EXECUTION_RUN_REQUESTS) {
    throw new Error(`pm.execution.runRequest cannot be called more than ${MAX_PM_EXECUTION_RUN_REQUESTS} times per script.`);
  }
  const target = String(payload.target || '').trim();
  if (!target) {
    throw new Error('pm.execution.runRequest requires a request ID or name.');
  }
  const result = await state.options.runRequest({
    cookies: state.cookies,
    options: normalizeExecutionRunRequestOptions(payload.options),
    scopes: normalizeExecutionRunRequestScopes(payload.scopes),
    target
  });
  if (Array.isArray(result?.cookies)) {
    state.cookies = result.cookies;
  }
  if (result?.response && Buffer.byteLength(String(result.response.body || ''), 'utf8') > MAX_PM_SEND_RESPONSE_BYTES) {
    throw new Error(`pm.execution.runRequest response body cannot exceed ${MAX_PM_SEND_RESPONSE_BYTES} bytes.`);
  }
  return {
    collectionVariables: normalizeBrokerPairArray(result?.collectionVariables),
    environmentVariables: normalizeBrokerPairArray(result?.environmentVariables),
    globals: normalizeBrokerPairArray(result?.globals),
    response: result?.response ? scriptSafeResponse(result.response) : null,
    skipped: result?.skipped === true,
    tests: normalizeBrokerTests(result?.tests)
  };
}

async function runBrokeredVaultGet(state, payload) {
  const vault = assertVaultCapability(state);
  countVaultOperation(state);
  return vault.get(normalizeVaultKey(payload.key));
}

async function runBrokeredVaultSet(state, payload) {
  const vault = assertVaultCapability(state);
  countVaultOperation(state);
  await vault.set(
    normalizeVaultKey(payload.key),
    normalizeVaultSecretValue(payload.value),
    vaultAuditMetadata(state)
  );
  return {};
}

async function runBrokeredVaultUnset(state, payload) {
  const vault = assertVaultCapability(state);
  countVaultOperation(state);
  await vault.unset(normalizeVaultKey(payload.key), vaultAuditMetadata(state));
  return {};
}

function assertVaultCapability(state) {
  if (!scriptCapabilityEnabled(state, 'vault')) {
    throw new Error('pm.vault is disabled for this workspace.');
  }
  const vault = state.options.vault;
  if (!vault || typeof vault.get !== 'function' || typeof vault.set !== 'function' || typeof vault.unset !== 'function') {
    throw new Error('pm.vault is not configured for this workspace.');
  }
  if (typeof vault.isAvailable === 'function' && vault.isAvailable() === false) {
    throw new Error('pm.vault encryption is unavailable on this machine.');
  }
  return vault;
}

function countVaultOperation(state) {
  state.vaultOperations += 1;
  if (state.vaultOperations > MAX_PM_VAULT_OPERATIONS) {
    throw new Error(`pm.vault cannot be called more than ${MAX_PM_VAULT_OPERATIONS} times per script.`);
  }
}

function vaultAuditMetadata(state) {
  return {
    requestId: state.context?.request?.id || '',
    requestName: state.context?.request?.name || ''
  };
}

function normalizePmSendRequest(input) {
  if (typeof input === 'string') {
    return {
      method: 'GET',
      url: input,
      queryParams: [],
      headers: [],
      bodyType: BODY_TYPES.NONE,
      body: '',
      auth: { type: 'none' },
      cookieJar: { enabled: false, storeResponses: false }
    };
  }
  if (!input || typeof input !== 'object') {
    throw new Error('pm.sendRequest requires a URL string or request object.');
  }
  const rawUrl = typeof input.url === 'string'
    ? input.url
    : input.url?.raw || input.url?.toString?.() || '';
  const method = String(input.method || 'GET').toUpperCase();
  const body = normalizePmSendRequestBody(input.body);
  return {
    method,
    url: rawUrl,
    queryParams: [],
    headers: normalizePmSendRequestHeaders(input.header || input.headers),
    bodyType: body ? BODY_TYPES.RAW_TEXT : BODY_TYPES.NONE,
    body,
    auth: { type: 'none' },
    cookieJar: { enabled: false, storeResponses: false }
  };
}

function normalizePmSendRequestHeaders(headers) {
  if (!headers) {
    return [];
  }
  if (Array.isArray(headers)) {
    return headers
      .filter((header) => header?.key || header?.name)
      .map((header) => ({
        enabled: header.disabled !== true && header.enabled !== false,
        key: String(header.key || header.name || ''),
        value: header.value == null ? '' : String(header.value)
      }));
  }
  if (typeof headers === 'object') {
    return Object.entries(headers).map(([key, value]) => ({
      enabled: true,
      key,
      value: value == null ? '' : String(value)
    }));
  }
  return [];
}

function normalizePmSendRequestBody(body) {
  if (body == null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (typeof body.raw === 'string') {
    return body.raw;
  }
  return '';
}

function normalizeExecutionRunRequestOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return {};
  }
  const normalized = {};
  if (options.variables && typeof options.variables === 'object' && !Array.isArray(options.variables)) {
    normalized.variables = {};
    for (const [key, value] of Object.entries(options.variables).slice(0, 100)) {
      normalized.variables[String(key).slice(0, LIMITS.name)] = value == null ? '' : String(value).slice(0, LIMITS.value);
    }
  }
  return normalized;
}

function normalizeExecutionRunRequestScopes(scopes) {
  if (!scopes || typeof scopes !== 'object' || Array.isArray(scopes)) {
    return {};
  }
  return {
    collectionVariables: normalizeBrokerPairArray(scopes.collectionVariables),
    environmentVariables: normalizeBrokerPairArray(scopes.environmentVariables),
    globals: normalizeBrokerPairArray(scopes.globals)
  };
}

function normalizeBrokerPairArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.slice(0, 1000)
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      enabled: item.enabled !== false,
      key: item.key == null ? '' : String(item.key).slice(0, LIMITS.name),
      value: item.value == null ? '' : String(item.value).slice(0, LIMITS.value)
    }))
    .filter((item) => item.key);
}

function normalizeBrokerTests(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.slice(0, 100)
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name: item.name == null ? 'pm.execution.runRequest test' : String(item.name).slice(0, LIMITS.name),
      passed: item.passed === true,
      error: item.error == null ? '' : String(item.error).slice(0, LIMITS.value)
    }));
}

function scriptSafeResponse(response) {
  return {
    statusCode: response.statusCode,
    headers: response.headers || {},
    body: response.body || '',
    durationMillis: response.durationMillis || 0,
    responseBytes: response.responseBytes || Buffer.byteLength(response.body || '', 'utf8'),
    finalUrl: response.finalUrl || ''
  };
}

function runtimeEnvironmentForBroker(state) {
  return runtimeEnvironment(
    state.context.collectionVariables || [],
    state.context.environment || null,
    state.context.localVariables || [],
    {
      globals: state.context.globals || [],
      iterationData: state.context.iterationData || []
    }
  );
}

function assertCookieCapability(state) {
  if (!scriptCapabilityEnabled(state, 'cookies')) {
    throw new Error('pm.cookies is disabled for this workspace.');
  }
}

function scriptCapabilityEnabled(state, capability) {
  if (capability === 'vault') {
    return state.options.trustedCapabilities?.vault === true;
  }
  return state.options.trustedCapabilities?.[capability] !== false;
}

function visibleCookiesForCurrentRequest(state) {
  return cookiesForRequest(state.cookies, currentRequestUrl(state)).filter((cookie) => cookie.httpOnly !== true);
}

function visibleCookiesForUrl(state, rawUrl) {
  return cookiesForRequest(state.cookies, cookieJarOperationUrl(rawUrl)).filter((cookie) => cookie.httpOnly !== true);
}

function cookieJarOperationUrl(rawUrl) {
  const text = String(rawUrl || '').trim();
  try {
    const url = new URL(normalizeCookieJarOperationUrlText(text));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('pm.cookies.jar only supports HTTP and HTTPS URLs or hostnames.');
    }
    return url;
  } catch (error) {
    if (error.message === 'pm.cookies.jar only supports HTTP and HTTPS URLs or hostnames.') {
      throw error;
    }
    throw new Error('pm.cookies.jar requires a valid HTTP or HTTPS URL or hostname.');
  }
}

function normalizeCookieJarOperationUrlText(text) {
  if (!text) {
    return '';
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(text)) {
    return text;
  }
  if (text.startsWith('//')) {
    return `https:${text}`;
  }
  return `https://${text}`;
}

function cookieFromJarSetPayload(payload, url) {
  const source = payload.cookie && typeof payload.cookie === 'object'
    ? payload.cookie
    : { name: payload.name, value: payload.value };
  const name = String(source.name || '');
  if (!name) {
    throw new Error('pm.cookies.jar.set requires a cookie name.');
  }
  const domain = normalizeCookieDomain(source.domain || '');
  if (domain && !cookieDomainAllowedForUrl(url, domain)) {
    throw new Error('pm.cookies.jar.set cookie domain must match the target URL.');
  }
  return cookieFromHeader({ name, value: source.value == null ? '' : String(source.value) }, url, {
    source: 'script',
    domain: domain || undefined,
    path: source.path ? String(source.path) : '/',
    expiresAt: source.expiresAt ? String(source.expiresAt) : '',
    secure: source.secure === true,
    httpOnly: false,
    sameSite: source.sameSite == null ? '' : String(source.sameSite),
    hostOnly: domain ? source.hostOnly === true : true,
    priority: source.priority == null ? '' : String(source.priority),
    partitioned: source.partitioned === true
  });
}

function cookieDomainAllowedForUrl(url, domain) {
  const host = normalizeCookieDomain(url.hostname);
  return host === domain || host.endsWith(`.${domain}`);
}

function currentRequestUrl(state) {
  return buildUrl(state.context.request || { method: 'GET', url: 'http://localhost/' }, runtimeEnvironmentForBroker(state));
}

function cookieIdentity(cookie) {
  return `${String(cookie.name || '').toLowerCase()}|${String(cookie.domain || '').toLowerCase()}|${String(cookie.path || '/')}`;
}

function validateBrokerMessage(state, executionId, message) {
  if (message.version !== PROTOCOL_VERSION) {
    throw new Error('Script broker protocol version mismatch.');
  }
  if (message.executionId !== executionId) {
    throw new Error('Script broker execution ID mismatch.');
  }
  if (!message.requestId || typeof message.requestId !== 'string') {
    throw new Error('Script broker request ID is required.');
  }
  if (state.seenBrokerRequestIds.has(message.requestId)) {
    throw new Error('Script broker request ID was already used.');
  }
  state.seenBrokerRequestIds.add(message.requestId);
  if (!message.operation || typeof message.operation !== 'string') {
    throw new Error('Script broker operation is required.');
  }
  if (!BROKER_OPERATIONS.has(message.operation)) {
    throw new Error(`Unsupported broker operation: ${message.operation}.`);
  }
  if (message.payload != null && (typeof message.payload !== 'object' || Array.isArray(message.payload))) {
    throw new Error('Script broker payload must be an object.');
  }
  const size = Buffer.byteLength(JSON.stringify(message.payload || {}), 'utf8');
  if (size > MAX_BROKER_PAYLOAD_BYTES) {
    throw new Error('Script broker payload is too large.');
  }
}

function validateWorkerResultMessage(message, executionId) {
  if (message.version !== PROTOCOL_VERSION) {
    throw new Error('Script worker protocol version mismatch.');
  }
  if (message.executionId !== executionId) {
    throw new Error('Script worker execution ID mismatch.');
  }
  if (typeof message.ok !== 'boolean') {
    throw new Error('Script worker result status is invalid.');
  }
  if (message.ok && (!message.result || typeof message.result !== 'object' || Array.isArray(message.result))) {
    throw new Error('Script worker result payload is invalid.');
  }
  if (!message.ok) {
    return;
  }
  validatePairArray(message.environmentVariables, 'environmentVariables');
  validatePairArray(message.collectionVariables, 'collectionVariables');
  validatePairArray(message.globals, 'globals');
  validatePairArray(message.localVariables, 'localVariables');
  validateCookieArray(message.cookies, 'cookies');
  if (message.request != null && (typeof message.request !== 'object' || Array.isArray(message.request))) {
    throw new Error('Script worker request mutation payload is invalid.');
  }
}

function workerResultPayload(message) {
  return {
    result: message.result || {},
    environmentVariables: message.environmentVariables || [],
    collectionVariables: message.collectionVariables || [],
    globals: message.globals || [],
    localVariables: message.localVariables || [],
    cookies: message.cookies || [],
    request: message.request || {}
  };
}

function validatePairArray(values, field) {
  if (!Array.isArray(values)) {
    throw new Error(`Script worker ${field} must be an array.`);
  }
  if (values.length > LIMITS.pairs) {
    throw new Error(`Script worker ${field} exceeded the maximum item count.`);
  }
  values.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Script worker ${field}[${index}] must be an object.`);
    }
    if (item.enabled != null && typeof item.enabled !== 'boolean') {
      throw new Error(`Script worker ${field}[${index}].enabled must be a boolean.`);
    }
    if (item.key != null && String(item.key).length > LIMITS.key) {
      throw new Error(`Script worker ${field}[${index}].key is too long.`);
    }
    if (item.value != null && String(item.value).length > LIMITS.value) {
      throw new Error(`Script worker ${field}[${index}].value is too long.`);
    }
  });
}

function validateCookieArray(values, field) {
  if (!Array.isArray(values)) {
    throw new Error(`Script worker ${field} must be an array.`);
  }
  if (values.length > LIMITS.cookies) {
    throw new Error(`Script worker ${field} exceeded the maximum item count.`);
  }
  values.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Script worker ${field}[${index}] must be an object.`);
    }
    if (item.enabled != null && typeof item.enabled !== 'boolean') {
      throw new Error(`Script worker ${field}[${index}].enabled must be a boolean.`);
    }
    for (const key of ['secure', 'httpOnly', 'hostOnly', 'partitioned']) {
      if (item[key] != null && typeof item[key] !== 'boolean') {
        throw new Error(`Script worker ${field}[${index}].${key} must be a boolean.`);
      }
    }
    if (item.name != null && String(item.name).length > LIMITS.key) {
      throw new Error(`Script worker ${field}[${index}].name is too long.`);
    }
    if (item.value != null && String(item.value).length > LIMITS.value) {
      throw new Error(`Script worker ${field}[${index}].value is too long.`);
    }
    if (item.domain != null && String(item.domain).length > LIMITS.host) {
      throw new Error(`Script worker ${field}[${index}].domain is too long.`);
    }
    if (item.path != null && String(item.path).length > LIMITS.url) {
      throw new Error(`Script worker ${field}[${index}].path is too long.`);
    }
  });
}

function sendBrokerResponse(transport, requestMessage, ok, payload, error = '') {
  if (!transport.isConnected()) {
    return;
  }
  transport.send({
    type: 'broker:response',
    version: PROTOCOL_VERSION,
    requestId: requestMessage.requestId,
    ok,
    payload,
    error
  });
}

function scriptWorkerExecArgv(options = {}) {
  const args = [`--max-old-space-size=${scriptWorkerMaxOldSpaceMb(options)}`];
  if (!supportsNodePermissionFlags()) {
    if (scriptWorkerRequiresNodePermission(options)) {
      throw new Error('Script worker requires Node permission flags, but this runtime does not support them.');
    }
    return args;
  }
  const allowedFileFlags = SCRIPT_WORKER_ALLOWED_FILES.map((filePath) => `--allow-fs-read=${filePath}`);
  return [
    ...args,
    '--permission',
    ...allowedFileFlags
  ];
}

function supportsNodePermissionFlags() {
  const flags = process.allowedNodeEnvironmentFlags;
  return flags?.has?.('--permission') === true && flags?.has?.('--allow-fs-read') === true;
}

function scriptWorkerRequiresNodePermission(options = {}) {
  if (options.requireNodePermission === true) {
    return true;
  }
  if (options.requireNodePermission === false) {
    return false;
  }
  return Boolean(process.versions.electron);
}

function scriptWorkerMaxOldSpaceMb(options = {}) {
  const raw = options.maxOldSpaceMb ?? process.env.POSTMETER_SCRIPT_WORKER_MAX_OLD_SPACE_MB;
  const value = Number(raw || DEFAULT_SCRIPT_WORKER_MAX_OLD_SPACE_MB);
  if (!Number.isFinite(value)) {
    return DEFAULT_SCRIPT_WORKER_MAX_OLD_SPACE_MB;
  }
  return Math.min(
    MAX_SCRIPT_WORKER_MAX_OLD_SPACE_MB,
    Math.max(MIN_SCRIPT_WORKER_MAX_OLD_SPACE_MB, Math.floor(value))
  );
}

function scriptWorkerEnv() {
  const env = { POSTMETER_SCRIPT_WORKER: '1' };
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return env;
}

function cloneForWorker(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

module.exports = {
  OS_SANDBOX_MODES,
  osSandboxStatus,
  runPostmanScriptIsolated,
  scriptWorkerExecArgv,
  scriptWorkerEnv,
  scriptWorkerMaxOldSpaceMb,
  scriptWorkerRequiresNodePermission,
  supportsNodePermissionFlags
};
