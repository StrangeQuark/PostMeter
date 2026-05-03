const { fork, spawn } = require('node:child_process');
const path = require('node:path');
const { BODY_TYPES } = require('./models');
const {
  OS_SANDBOX_MODES,
  cleanupPrivateTempDir,
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
  resolveFileAttachmentBinding
} = require('./fileAttachmentBindings');
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
const MAX_PM_SEND_TIMEOUT_MILLIS = 3 * 60 * 1000;
const MAX_PM_EXECUTION_RUN_REQUESTS = 10;
const MAX_PM_VAULT_OPERATIONS = 16;
const MAX_PM_MOCK_STATE_OPERATIONS = 128;
const MAX_PM_MOCK_STATE_KEYS = 1000;
const MAX_PM_MOCK_STATE_KEY_LENGTH = 256;
const MAX_PM_MOCK_STATE_VALUE_BYTES = 64 * 1024;
const MAX_PM_MOCK_STATE_TOTAL_BYTES = 256 * 1024;
const MAX_WORKER_STDERR_BYTES = 4096;
const MAX_WORKER_STDOUT_LINE_BYTES = MAX_BROKER_PAYLOAD_BYTES * 2;
const MAX_PENDING_BROKER_TIMERS = 64;
const MAX_BROKER_TIMER_DELAY_MILLIS = 30_000;
const SCRIPT_WORKER_ALLOWED_FILES = [
  path.join(__dirname, 'scriptWorker.js'),
  path.join(__dirname, 'scriptRuntime.js'),
  path.join(__dirname, 'visualizerHandlebarsBundle.js'),
  path.join(__dirname, 'postmanBuiltinPackages.js'),
  path.join(__dirname, 'postmanSandboxBootcodeBundle.js'),
  path.join(__dirname, 'sandboxPackageCache.js'),
  path.join(__dirname, 'dynamicVariables.js'),
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
  'cookies.jar:clear',
  'mock.state:get',
  'mock.state:set',
  'mock.state:delete',
  'mock.state:has',
  'mock.state:keys',
  'mock.state:size',
  'mock.state:clear',
  'mock.state:toObject',
  'mock.state:increment',
  'mock.state:push',
  'mock.state:addToSet'
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
      cookieJar: brokerState.cookies,
      currentRequestCookies: currentRequestCookiesForWorker(brokerState),
      scriptCookieAccessEnabled: scriptCapabilityEnabled(brokerState, 'cookies')
    }),
    options: {
      filename: options.filename,
      sandboxPackages: options.sandboxPackages || context.sandboxPackages || [],
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
      const finalized = finalizeBrokerState(brokerState, value, context);
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
      resolve(finalized);
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
  const attachCleanup = (child) => {
    if (!launch.privateTempDir) {
      return child;
    }
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      cleanupPrivateTempDir(launch.privateTempDir);
    };
    child.once('exit', cleanup);
    child.once('error', cleanup);
    return child;
  };
  if (launch.transport === 'stdio') {
    const seccomp = prepareSeccompStdio(launch, ['pipe', 'pipe', 'pipe']);
    try {
      return attachCleanup(spawn(launch.command, launch.args, {
        env: launch.env,
        serialization: 'json',
        stdio: seccomp.stdio
      }));
    } finally {
      seccomp.cleanup();
    }
  }
  return attachCleanup(fork(launch.workerPath, [], {
    env: launch.env,
    execArgv: launch.execArgv,
    serialization: 'json',
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  }));
}

function createChildTransport(child, type) {
  if (type === 'stdio') {
    return createStdioChildTransport(child);
  }
  return {
    ...createStderrCapture(child),
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

function createStderrCapture(child) {
  let stderrBuffer = '';
  child.stderr?.setEncoding?.('utf8');
  child.stderr?.on?.('data', (chunk) => {
    stderrBuffer = `${stderrBuffer}${chunk}`;
    if (Buffer.byteLength(stderrBuffer, 'utf8') > MAX_WORKER_STDERR_BYTES) {
      stderrBuffer = stderrBuffer.slice(-MAX_WORKER_STDERR_BYTES);
    }
  });
  return {
    stderrText() {
      return stderrBuffer.trim();
    }
  };
}

function createStdioChildTransport(child) {
  let buffer = '';
  let stderrBuffer = '';
  let stdoutOverflowed = false;
  let messageHandler = () => {};
  let errorHandler = () => {};
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (stdoutOverflowed) {
      return;
    }
    buffer += chunk;
    if (Buffer.byteLength(buffer, 'utf8') > MAX_WORKER_STDOUT_LINE_BYTES) {
      stdoutOverflowed = true;
      buffer = '';
      errorHandler(new Error('Script worker protocol stdout line exceeded the maximum allowed size.'));
      child.kill?.('SIGKILL');
      return;
    }
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
      if (Buffer.byteLength(buffer, 'utf8') > MAX_WORKER_STDOUT_LINE_BYTES) {
        stdoutOverflowed = true;
        buffer = '';
        errorHandler(new Error('Script worker protocol stdout line exceeded the maximum allowed size.'));
        child.kill?.('SIGKILL');
        return;
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
    mockState: createMockStateTransaction(context, options),
    mockStateOperations: 0,
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

function finalizeBrokerState(brokerState, value, context) {
  if (!brokerState?.mockState) {
    return value;
  }
  const shouldCommit = value?.result?.commitSideEffects !== false;
  try {
    if (shouldCommit) {
      brokerState.mockState.commit();
    } else {
      brokerState.mockState.rollback();
    }
    return value;
  } catch (error) {
    brokerState.mockState.rollback();
    return failedExecution(error, context);
  }
}

function createMockStateTransaction(context, options = {}) {
  if (context?.mock?.enabled !== true) {
    return null;
  }
  const store = options.mockStateStore;
  if (store && typeof store.beginTransaction === 'function') {
    return store.beginTransaction();
  }
  const snapshot = context.mock?.state && typeof context.mock.state === 'object'
    ? context.mock.state
    : {};
  return createInMemoryMockStateTransaction(snapshot, store);
}

function createInMemoryMockStateTransaction(snapshot = {}, store = null) {
  let committed = false;
  let rolledBack = false;
  const values = new Map(Object.entries(cloneBrokerJsonValue(snapshot) || {}));
  const api = {
    get(key) {
      return values.has(key) ? cloneBrokerJsonValue(values.get(key)) : undefined;
    },
    set(key, value) {
      values.set(key, cloneBrokerJsonValue(value));
    },
    delete(key) {
      return values.delete(key);
    },
    has(key) {
      return values.has(key);
    },
    keys() {
      return [...values.keys()].sort();
    },
    size() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    toObject() {
      return Object.fromEntries([...values.entries()].map(([key, value]) => [key, cloneBrokerJsonValue(value)]));
    },
    commit() {
      if (committed || rolledBack) {
        return;
      }
      committed = true;
      if (store && typeof store.replaceAll === 'function') {
        store.replaceAll(api.toObject());
      }
    },
    rollback() {
      rolledBack = true;
    }
  };
  return api;
}

function cloneBrokerJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
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
    const cookie = cookiesForCurrentRequest(state).find((item) => item.name === String(payload.name || ''));
    return cookie ? cookie.value ?? '' : undefined;
  }
  if (operation === 'cookies:toObject') {
    assertCookieCapability(state);
    const object = {};
    for (const cookie of cookiesForCurrentRequest(state)) {
      object[cookie.name] = cookie.value ?? '';
    }
    return object;
  }
  if (operation === 'cookies:set') {
    assertCookieCapability(state);
    const url = currentRequestUrl(state);
    const cookie = cookieFromHeader({ name: String(payload.name || ''), value: payload.value == null ? '' : String(payload.value) }, url, {
      path: defaultCookiePath(url.pathname),
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
      return !cookiesForRequest([cookie], currentRequestUrl(state)).length;
    });
    return {};
  }
  if (operation === 'cookies.jar:get') {
    assertCookieCapability(state);
    const cookie = cookiesForUrl(state, payload.url).find((item) => item.name === String(payload.name || ''));
    return cookie ? cookie.value ?? '' : undefined;
  }
  if (operation === 'cookies.jar:getAll') {
    assertCookieCapability(state);
    return cookiesForUrl(state, payload.url).map(scriptCookieForWorker);
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
      return !cookiesForRequest([cookie], url).length;
    });
    return {};
  }
  if (operation === 'cookies.jar:clear') {
    assertCookieCapability(state);
    const url = cookieJarOperationUrl(payload.url);
    state.cookies = state.cookies.filter((cookie) => {
      return !cookiesForRequest([cookie], url).length;
    });
    return {};
  }
  if (operation.startsWith('mock.state:')) {
    return runBrokeredMockStateOperation(state, operation.slice('mock.state:'.length), payload);
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
    recordSandboxDenial(state, 'script_send_request_disabled', 'pm.sendRequest');
    throw new Error('pm.sendRequest is disabled for this workspace.');
  }
  const request = normalizePmSendRequest(payload.request, {
    clientCertificates: state.options.clientCertificates || [],
    fileBindings: state.options.fileBindings || []
  });
  request.cookieJar = {
    enabled: scriptCapabilityEnabled(state, 'cookies') && request.cookieJar?.enabled !== false,
    storeResponses: request.cookieJar?.storeResponses !== false
  };
  const response = await (state.options.sendRequest || sendRequest)(request, runtimeEnvironmentForBroker(state), {
    cookieJar: request.cookieJar.enabled ? state.cookies : [],
    fileBindings: state.options.fileBindings || [],
    signal: state.options.signal,
    timeoutMillis: request.timeoutMillis
  });
  if (request.cookieJar.enabled && Array.isArray(response.updatedCookies)) {
    state.cookies = response.updatedCookies;
  }
  if (Buffer.byteLength(String(response.body || ''), 'utf8') > MAX_PM_SEND_RESPONSE_BYTES) {
    recordSandboxDenial(state, 'script_send_request_response_too_large', 'pm.sendRequest');
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
    recordSandboxDenial(state, 'script_run_request_disabled', 'pm.execution.runRequest');
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
  countVaultOperation(state);
  const key = normalizeVaultKey(payload.key);
  const vault = await assertVaultCapability(state, 'get', key);
  const value = await vault.get(key);
  await auditVaultPromptDecision(state, 'get', key);
  return value;
}

async function runBrokeredVaultSet(state, payload) {
  countVaultOperation(state);
  const key = normalizeVaultKey(payload.key);
  const vault = await assertVaultCapability(state, 'set', key);
  await vault.set(
    key,
    normalizeVaultSecretValue(payload.value),
    vaultAuditMetadata(state)
  );
  return {};
}

async function runBrokeredVaultUnset(state, payload) {
  countVaultOperation(state);
  const key = normalizeVaultKey(payload.key);
  const vault = await assertVaultCapability(state, 'unset', key);
  await vault.unset(key, vaultAuditMetadata(state));
  return {};
}

async function runBrokeredMockStateOperation(state, method, payload) {
  const transaction = assertMockStateCapability(state);
  countMockStateOperation(state);
  if (method === 'clear') {
    transaction.clear();
    assertMockStateBounds(transaction);
    return undefined;
  }
  if (method === 'keys') {
    return transaction.keys();
  }
  if (method === 'size') {
    return transaction.size();
  }
  if (method === 'toObject') {
    return transaction.toObject();
  }

  const key = normalizeMockStateKey(payload.key);
  if (method === 'get') {
    return transaction.get(key);
  }
  if (method === 'set') {
    transaction.set(key, normalizeMockStateValue(payload.value));
    assertMockStateBounds(transaction);
    return undefined;
  }
  if (method === 'delete') {
    return transaction.delete(key);
  }
  if (method === 'has') {
    return transaction.has(key);
  }
  if (method === 'increment') {
    const delta = normalizeMockStateDelta(payload.delta);
    const current = transaction.has(key) ? Number(transaction.get(key)) : 0;
    if (!Number.isFinite(current)) {
      throw new Error('pm.state.increment requires the existing value to be numeric.');
    }
    const next = current + delta;
    transaction.set(key, next);
    assertMockStateBounds(transaction);
    return next;
  }
  if (method === 'push') {
    const values = normalizeMockStateItems(payload.items);
    const current = transaction.has(key) ? transaction.get(key) : [];
    if (!Array.isArray(current)) {
      throw new Error('pm.state.push requires the existing value to be an array.');
    }
    const next = current.concat(values);
    transaction.set(key, next);
    assertMockStateBounds(transaction);
    return next;
  }
  if (method === 'addToSet') {
    const item = normalizeMockStateValue(payload.item);
    const current = transaction.has(key) ? transaction.get(key) : [];
    if (!Array.isArray(current)) {
      throw new Error('pm.state.addToSet requires the existing value to be an array.');
    }
    const exists = current.some((value) => mockStateValuesEqual(value, item));
    if (!exists) {
      transaction.set(key, current.concat([item]));
      assertMockStateBounds(transaction);
    }
    return !exists;
  }
  throw new Error(`Unsupported pm.state operation: ${method}.`);
}

function assertMockStateCapability(state) {
  if (state.context?.mock?.enabled !== true) {
    throw new Error('pm.state is only available in local mock scripts.');
  }
  if (!state.mockState) {
    throw new Error('pm.state is not configured for this local mock session.');
  }
  return state.mockState;
}

function countMockStateOperation(state) {
  state.mockStateOperations += 1;
  if (state.mockStateOperations > MAX_PM_MOCK_STATE_OPERATIONS) {
    throw new Error(`pm.state cannot be called more than ${MAX_PM_MOCK_STATE_OPERATIONS} times per script.`);
  }
}

function normalizeMockStateKey(key) {
  const text = String(key || '').trim();
  if (!text) {
    throw new Error('pm.state keys must be non-empty strings.');
  }
  if (text.length > MAX_PM_MOCK_STATE_KEY_LENGTH) {
    throw new Error(`pm.state keys cannot exceed ${MAX_PM_MOCK_STATE_KEY_LENGTH} characters.`);
  }
  return text;
}

function normalizeMockStateValue(value) {
  if (value === undefined) {
    throw new Error('pm.state values must be JSON serializable.');
  }
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new Error('pm.state values must be JSON serializable.');
  }
  if (text === undefined) {
    throw new Error('pm.state values must be JSON serializable.');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_PM_MOCK_STATE_VALUE_BYTES) {
    throw new Error(`pm.state values cannot exceed ${MAX_PM_MOCK_STATE_VALUE_BYTES} bytes.`);
  }
  return JSON.parse(text);
}

function normalizeMockStateItems(items) {
  const values = Array.isArray(items) ? items : [items];
  const flattened = values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  return flattened.map((item) => normalizeMockStateValue(item));
}

function normalizeMockStateDelta(delta) {
  if (delta == null || delta === '') {
    return 1;
  }
  const value = Number(delta);
  if (!Number.isFinite(value)) {
    throw new Error('pm.state.increment delta must be numeric.');
  }
  return value;
}

function assertMockStateBounds(transaction) {
  const snapshot = transaction.toObject();
  if (Object.keys(snapshot).length > MAX_PM_MOCK_STATE_KEYS) {
    throw new Error(`pm.state cannot contain more than ${MAX_PM_MOCK_STATE_KEYS} keys.`);
  }
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_PM_MOCK_STATE_TOTAL_BYTES) {
    throw new Error(`pm.state cannot exceed ${MAX_PM_MOCK_STATE_TOTAL_BYTES} bytes per mock session.`);
  }
}

function mockStateValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function assertVaultCapability(state, operation = '', key = '') {
  const decision = vaultCapabilityDecision(state);
  if (!decision.allowed) {
    if (decision.explicitDenied || typeof state.options.vaultPrompt !== 'function') {
      await auditVaultPromptDecision(state, 'prompt-deny', key);
      await auditVaultPromptDecision(state, 'denied-after-call', key);
      recordSandboxDenial(state, 'script_vault_disabled', 'pm.vault');
      throw new Error('pm.vault is disabled for this workspace.');
    }
    const promptResult = await state.options.vaultPrompt({
      key,
      operation,
      collectionId: state.context?.collectionId || '',
      collectionName: state.context?.collectionName || state.context?.executionLocation?.current?.[0] || '',
      requestId: state.context?.request?.id || '',
      requestName: state.context?.request?.name || '',
      workspaceId: state.context?.workspaceId || '',
      workspaceName: state.context?.workspaceName || ''
    });
    if (!promptResult || promptResult.granted !== true) {
      await auditVaultPromptDecision(state, promptResult?.reset === true ? 'prompt-reset' : 'prompt-deny', key);
      await auditVaultPromptDecision(state, 'denied-after-call', key);
      recordSandboxDenial(state, 'script_vault_prompt_denied', 'pm.vault');
      throw new Error('pm.vault access was denied for this request.');
    }
    await auditVaultPromptDecision(state, `prompt-grant-${promptResult.scope || 'request'}`, key);
    applyTransientVaultGrant(state, promptResult);
  }
  if (!scriptCapabilityEnabled(state, 'vault')) {
    recordSandboxDenial(state, 'script_vault_disabled', 'pm.vault');
    throw new Error('pm.vault is disabled for this workspace.');
  }
  const vault = state.options.vault;
  if (!vault || typeof vault.get !== 'function' || typeof vault.set !== 'function' || typeof vault.unset !== 'function') {
    throw new Error('pm.vault is not configured for this workspace.');
  }
  if (typeof vault.isAvailable === 'function' && vault.isAvailable() === false) {
    await auditVaultPromptDecision(state, 'unavailable-encryption', key);
    recordSandboxDenial(state, 'script_vault_unavailable', 'pm.vault');
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

async function auditVaultPromptDecision(state, operation, key) {
  const vault = state.options.vault;
  if (!vault || typeof vault.audit !== 'function') {
    return;
  }
  await vault.audit(operation, key, vaultAuditMetadata(state)).catch(() => {});
}

function vaultAuditMetadata(state) {
  return {
    collectionId: state.context?.collectionId || '',
    collectionName: state.context?.collectionName || state.context?.executionLocation?.current?.[0] || '',
    requestId: state.context?.request?.id || '',
    requestName: state.context?.request?.name || '',
    workspaceId: state.context?.workspaceId || '',
    workspaceName: state.context?.workspaceName || ''
  };
}

function normalizePmSendRequest(input, options = {}) {
  if (typeof input === 'string') {
    return {
      method: 'GET',
      url: input,
      queryParams: [],
      headers: [],
      bodyType: BODY_TYPES.NONE,
      body: '',
      auth: { type: 'none' },
      cookieJar: { enabled: true, storeResponses: true },
      followRedirects: true,
      proxy: null,
      timeoutMillis: undefined
    };
  }
  if (!input || typeof input !== 'object') {
    throw new Error('pm.sendRequest requires a URL string or request object.');
  }
  const source = input && typeof input.toJSON === 'function' ? input.toJSON() : input;
  const normalizedUrl = normalizePmSendRequestUrl(source.url || source.raw || source);
  const method = String(source.method || 'GET').toUpperCase();
  let headers = normalizePmSendRequestHeaders(source.header || source.headers);
  const normalizedBody = normalizePmSendRequestBody(source.body, options);
  headers = mergePmSendRequestBodyHeaders(headers, normalizedBody.headers);
  rejectUnsupportedPmSendRequestTransportOptions(source);
  return {
    method,
    url: normalizedUrl.url,
    queryParams: normalizedUrl.queryParams.concat(normalizePmSendRequestQueryParams(source.query || source.queryParams)),
    headers,
    bodyType: normalizedBody.bodyType,
    body: normalizedBody.body,
    bodyAttachment: normalizedBody.bodyAttachment,
    multipart: normalizedBody.multipart,
    auth: normalizePmSendRequestAuth(source.auth, options),
    cookieJar: normalizePmSendRequestCookieJar(source),
    followRedirects: source.followRedirects !== false && source.followRedirect !== false,
    proxy: normalizePmSendRequestProxy(source.proxy),
    timeoutMillis: normalizePmSendRequestTimeout(source)
  };
}

function normalizePmSendRequestHeaders(headers) {
  if (!headers) {
    return [];
  }
  if (headers && typeof headers.toJSON === 'function') {
    return normalizePmSendRequestHeaders(headers.toJSON());
  }
  if (headers && typeof headers.all === 'function') {
    return normalizePmSendRequestHeaders(headers.all(false));
  }
  if (Array.isArray(headers?.members)) {
    return normalizePmSendRequestHeaders(headers.members);
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
    return Object.entries(headers).flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((item) => ({
        enabled: true,
        key,
        value: item == null ? '' : String(item)
      }));
    });
  }
  return [];
}

function normalizePmSendRequestBody(body, options = {}) {
  if (body == null) {
    return { body: '', bodyType: BODY_TYPES.NONE, headers: [] };
  }
  if (typeof body === 'string') {
    return {
      body,
      bodyType: body ? (looksLikeJsonText(body) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT) : BODY_TYPES.NONE,
      headers: []
    };
  }
  const source = body && typeof body.toJSON === 'function' ? body.toJSON() : body;
  if (source.disabled === true || source.mode === 'none') {
    return { body: '', bodyType: BODY_TYPES.NONE, headers: [] };
  }
  const mode = String(source.mode || (source.raw != null ? 'raw' : 'none')).toLowerCase();
  if (mode === 'raw') {
    const text = source.raw == null ? '' : String(source.raw);
    const language = String(source.options?.raw?.language || '').toLowerCase();
    return {
      body: text,
      bodyType: text ? (language === 'json' || looksLikeJsonText(text) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT) : BODY_TYPES.NONE,
      headers: []
    };
  }
  if (mode === 'urlencoded') {
    const text = serializePmFormPairs(source.urlencoded, { includeFiles: false });
    return {
      body: text,
      bodyType: text ? BODY_TYPES.RAW_TEXT : BODY_TYPES.NONE,
      headers: text ? [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }] : []
    };
  }
  if (mode === 'formdata' || mode === 'form-data') {
    return normalizePmSendRequestFormDataBody(source.formdata || source.formData || [], options);
  }
  if (mode === 'graphql') {
    const payload = {
      query: source.graphql?.query == null ? '' : String(source.graphql.query),
      variables: parseGraphqlVariables(source.graphql?.variables),
      operationName: source.graphql?.operationName == null ? undefined : String(source.graphql.operationName)
    };
    const text = JSON.stringify(payload);
    return {
      body: text,
      bodyType: BODY_TYPES.RAW_JSON,
      headers: [{ key: 'Content-Type', value: 'application/json' }]
    };
  }
  if (mode === 'file' || mode === 'binary') {
    const inline = source.file?.content ?? source.binary?.content ?? source.raw;
    if (inline != null) {
      return {
        body: String(inline),
        bodyType: BODY_TYPES.RAW_TEXT,
        headers: []
      };
    }
    const reference = normalizePmSendRequestBodyAttachment(source, mode, options);
    return {
      body: '',
      bodyAttachment: reference,
      bodyType: BODY_TYPES.RAW_TEXT,
      headers: reference.contentType ? [{ key: 'Content-Type', value: reference.contentType }] : []
    };
  }
  return { body: '', bodyType: BODY_TYPES.NONE, headers: [] };
}

function normalizePmSendRequestBodyAttachment(source, mode, options = {}) {
  const file = source.file && typeof source.file === 'object' ? source.file : {};
  const binary = source.binary && typeof source.binary === 'object' ? source.binary : {};
  const rawSource = file.src ?? binary.src ?? source.src;
  const attachmentSource = Array.isArray(rawSource) ? rawSource[0] : rawSource;
  if (!attachmentSource) {
    throw new Error('pm.sendRequest file and binary bodies require an imported attachment binding; scripts cannot read arbitrary local files.');
  }
  const reference = {
    bindingId: source.attachmentId || source.bindingId || file.attachmentId || binary.attachmentId || '',
    contentType: source.contentType || file.contentType || binary.contentType || '',
    fileName: source.fileName || file.fileName || binary.fileName || '',
    mode,
    source: String(attachmentSource)
  };
  const binding = resolveFileAttachmentBinding(reference, options.fileBindings || []);
  return {
    ...reference,
    bindingId: binding.id
  };
}

function normalizePmSendRequestUrl(urlInput) {
  if (typeof urlInput === 'string') {
    return { queryParams: [], url: urlInput };
  }
  const source = urlInput && typeof urlInput.toJSON === 'function' ? urlInput.toJSON() : urlInput;
  if (!source || typeof source !== 'object') {
    return { queryParams: [], url: '' };
  }
  if (typeof source.raw === 'string' && source.raw) {
    return {
      queryParams: source.raw.includes('?') ? [] : normalizePmSendRequestQueryParams(source.query),
      url: source.raw
    };
  }
  if (typeof source.toString === 'function' && source.toString !== Object.prototype.toString) {
    const text = String(source.toString());
    if (text && text !== '[object Object]') {
      return { queryParams: [], url: text };
    }
  }
  const protocol = String(source.protocol || '').replace(/:$/, '');
  const host = Array.isArray(source.host) ? source.host.join('.') : String(source.host || '');
  const path = Array.isArray(source.path) ? source.path.join('/') : String(source.path || '').replace(/^\/+/, '');
  const queryParams = normalizePmSendRequestQueryParams(source.query);
  const query = queryParams
    .filter((pair) => pair.enabled !== false && pair.key)
    .map((pair) => `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value ?? '')}`)
    .join('&');
  const base = `${protocol ? `${protocol}://` : ''}${host}${path ? `/${path}` : ''}`;
  return { queryParams: [], url: `${base}${query ? `?${query}` : ''}` };
}

function normalizePmSendRequestQueryParams(params) {
  if (!params) {
    return [];
  }
  if (params && typeof params.toJSON === 'function') {
    return normalizePmSendRequestQueryParams(params.toJSON());
  }
  if (params && typeof params.all === 'function') {
    return normalizePmSendRequestQueryParams(params.all(false));
  }
  if (Array.isArray(params?.members)) {
    return normalizePmSendRequestQueryParams(params.members);
  }
  const items = Array.isArray(params)
    ? params
    : typeof params === 'object'
      ? Object.entries(params).map(([key, value]) => ({ key, value }))
      : [];
  return items
    .filter((item) => item?.key || item?.name)
    .slice(0, 500)
    .map((item) => ({
      enabled: item.disabled !== true && item.enabled !== false,
      key: String(item.key || item.name || ''),
      value: item.value == null ? '' : String(item.value)
    }));
}

function normalizePmSendRequestFormDataBody(formdata, options = {}) {
  const items = normalizePmSendRequestQueryParams(formdata);
  const fileParts = normalizePmSendRequestFormDataFileParts(formdata, options);
  if (fileParts.length) {
    return {
      body: '',
      bodyType: BODY_TYPES.RAW_TEXT,
      headers: [],
      multipart: {
        parts: [
          ...normalizePmSendRequestFormDataTextParts(formdata),
          ...fileParts
        ]
      }
    };
  }
  const boundary = `postmeter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const chunks = [];
  for (const item of items) {
    if (item.enabled === false) {
      continue;
    }
    const original = Array.isArray(formdata) ? formdata.find((candidate) => (candidate?.key || candidate?.name) === item.key) : null;
    if (original?.src || String(original?.type || '').toLowerCase() === 'file') {
      throw new Error('pm.sendRequest form-data file parts require an imported attachment binding; scripts cannot read arbitrary local files.');
    }
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartName(item.key)}"\r\n\r\n${item.value}\r\n`);
  }
  if (!chunks.length) {
    return { body: '', bodyType: BODY_TYPES.NONE, headers: [] };
  }
  chunks.push(`--${boundary}--\r\n`);
  return {
    body: chunks.join(''),
    bodyType: BODY_TYPES.RAW_TEXT,
    headers: [{ key: 'Content-Type', value: `multipart/form-data; boundary=${boundary}` }]
  };
}

function normalizePmSendRequestFormDataTextParts(formdata) {
  const parts = [];
  for (const part of Array.isArray(formdata) ? formdata : []) {
    if (!part || typeof part !== 'object' || part.disabled === true || part.enabled === false) {
      continue;
    }
    if (part.src || String(part.type || '').toLowerCase() === 'file') {
      continue;
    }
    const key = String(part.key || part.name || '');
    if (!key) {
      continue;
    }
    parts.push({
      key,
      type: 'text',
      value: part.value == null ? '' : String(part.value)
    });
  }
  return parts;
}

function normalizePmSendRequestFormDataFileParts(formdata, options = {}) {
  const parts = [];
  for (const part of Array.isArray(formdata) ? formdata : []) {
    if (!part || typeof part !== 'object' || part.disabled === true || part.enabled === false) {
      continue;
    }
    if (!part.src && String(part.type || '').toLowerCase() !== 'file') {
      continue;
    }
    const key = String(part.key || part.name || '');
    if (!key) {
      continue;
    }
    const sources = Array.isArray(part.src) ? part.src : part.src ? [part.src] : [];
    if (!sources.length) {
      throw new Error('pm.sendRequest form-data file parts require an imported attachment binding; scripts cannot read arbitrary local files.');
    }
    for (const source of sources) {
      const reference = {
        bindingId: part.attachmentId || part.bindingId || '',
        contentType: part.contentType == null ? '' : String(part.contentType),
        fileName: part.fileName == null ? '' : String(part.fileName),
        key,
        mode: 'formdata',
        source: String(source),
        type: 'file'
      };
      const binding = resolveFileAttachmentBinding(reference, options.fileBindings || []);
      parts.push({
        ...reference,
        bindingId: binding.id
      });
    }
  }
  return parts;
}

function serializePmFormPairs(pairs, options = {}) {
  return normalizePmSendRequestQueryParams(pairs)
    .filter((pair) => pair.enabled !== false && pair.key)
    .map((pair) => `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value ?? '')}`)
    .join('&');
}

function escapeMultipartName(value) {
  return String(value || '').replace(/["\r\n]/g, '_');
}

function parseGraphqlVariables(value) {
  if (value == null || value === '') {
    return {};
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function mergePmSendRequestBodyHeaders(headers, bodyHeaders) {
  const output = headers.slice();
  for (const header of bodyHeaders || []) {
    const exists = output.some((item) => String(item.key || '').toLowerCase() === String(header.key || '').toLowerCase());
    if (!exists) {
      output.push({ enabled: true, key: header.key, value: header.value });
    }
  }
  return output;
}

function normalizePmSendRequestAuth(auth, options = {}) {
  if (!auth || typeof auth !== 'object') {
    return { type: 'none' };
  }
  const source = auth && typeof auth.toJSON === 'function' ? auth.toJSON() : auth;
  const type = normalizePmAuthType(source.type);
  if (!type || type === 'none' || type === 'noauth' || type === 'inherit') {
    return { type: 'none' };
  }
  if (type === 'bearer') {
    return { type: 'bearer', token: authField(source, 'token') || source.token || source.accessToken || '' };
  }
  if (type === 'basic') {
    return {
      type: 'basic',
      username: authField(source, 'username') || source.username || '',
      password: authField(source, 'password') || source.password || ''
    };
  }
  if (type === 'apikey') {
    return {
      type: 'apiKey',
      location: String(authField(source, 'in') || source.location || source.in || 'header').toLowerCase() === 'query' ? 'query' : 'header',
      key: authField(source, 'key') || source.key || '',
      value: authField(source, 'value') || source.value || ''
    };
  }
  if (type === 'cookie') {
    return { type: 'cookie', value: authField(source, 'value') || source.value || '' };
  }
  if (type === 'oauth2') {
    return {
      type: 'oauth2',
      tokenType: authField(source, 'tokenType') || source.tokenType || 'Bearer',
      accessToken: authField(source, 'accessToken') || source.accessToken || source.token || '',
      refreshToken: authField(source, 'refreshToken') || source.refreshToken || '',
      authorizationUrl: authField(source, 'authUrl') || source.authorizationUrl || '',
      tokenUrl: authField(source, 'accessTokenUrl') || source.tokenUrl || '',
      clientId: authField(source, 'clientId') || source.clientId || '',
      clientSecret: authField(source, 'clientSecret') || source.clientSecret || '',
      scopes: authField(source, 'scope') || source.scopes || '',
      grantType: postmanOauthGrantType(authField(source, 'grant_type') || source.grantType)
    };
  }
  if (type === 'clientcertificate') {
    return normalizePmSendRequestClientCertificateAuth(source, options);
  }
  if (type === 'digest') {
    return {
      type: 'digest',
      username: authField(source, 'username') || source.username || '',
      password: authField(source, 'password') || source.password || '',
      realm: authField(source, 'realm') || source.realm || '',
      nonce: authField(source, 'nonce') || source.nonce || '',
      algorithm: authField(source, 'algorithm') || source.algorithm || 'MD5',
      qop: authField(source, 'qop') || source.qop || 'auth',
      opaque: authField(source, 'opaque') || source.opaque || '',
      clientNonce: authField(source, 'clientNonce') || authField(source, 'cnonce') || source.clientNonce || '',
      nonceCount: authField(source, 'nonceCount') || authField(source, 'nc') || source.nonceCount || ''
    };
  }
  if (type === 'hawk') {
    return {
      type: 'hawk',
      authId: authField(source, 'authId') || authField(source, 'id') || source.authId || source.id || '',
      authKey: authField(source, 'authKey') || authField(source, 'key') || source.authKey || source.key || '',
      algorithm: authField(source, 'algorithm') || source.algorithm || 'sha256',
      user: authField(source, 'user') || source.user || '',
      nonce: authField(source, 'nonce') || source.nonce || '',
      extraData: authField(source, 'extraData') || authField(source, 'ext') || source.extraData || source.ext || '',
      app: authField(source, 'app') || source.app || '',
      delegation: authField(source, 'delegation') || authField(source, 'dlg') || source.delegation || source.dlg || ''
    };
  }
  if (type === 'aws') {
    return {
      type: 'aws',
      accessKey: authField(source, 'accessKey') || source.accessKey || '',
      secretKey: authField(source, 'secretKey') || source.secretKey || '',
      region: authField(source, 'region') || source.region || '',
      service: authField(source, 'service') || authField(source, 'serviceName') || source.service || source.serviceName || '',
      sessionToken: authField(source, 'sessionToken') || source.sessionToken || '',
      addAuthDataToQuery: boolAuthField(source, 'addAuthDataToQuery') || source.addAuthDataToQuery === true
    };
  }
  if (type === 'oauth1') {
    return {
      type: 'oauth1',
      consumerKey: authField(source, 'consumerKey') || source.consumerKey || '',
      consumerSecret: authField(source, 'consumerSecret') || source.consumerSecret || '',
      token: authField(source, 'token') || source.token || '',
      tokenSecret: authField(source, 'tokenSecret') || source.tokenSecret || '',
      signatureMethod: authField(source, 'signatureMethod') || source.signatureMethod || 'HMAC-SHA1',
      timestamp: authField(source, 'timestamp') || source.timestamp || '',
      nonce: authField(source, 'nonce') || source.nonce || '',
      version: authField(source, 'version') || source.version || '1.0',
      realm: authField(source, 'realm') || source.realm || ''
    };
  }
  if (type === 'ntlm') {
    return {
      type: 'ntlm',
      username: authField(source, 'username') || source.username || '',
      password: authField(source, 'password') || source.password || '',
      domain: authField(source, 'domain') || source.domain || '',
      workstation: authField(source, 'workstation') || source.workstation || ''
    };
  }
  if (type === 'akamaiedgegrid') {
    return {
      type: 'akamaiEdgeGrid',
      accessToken: authField(source, 'accessToken') || source.accessToken || '',
      clientToken: authField(source, 'clientToken') || source.clientToken || '',
      clientSecret: authField(source, 'clientSecret') || source.clientSecret || '',
      headersToSign: authField(source, 'headersToSign') || source.headersToSign || ''
    };
  }
  if (type === 'jwtbearer') {
    return {
      type: 'jwtBearer',
      algorithm: authField(source, 'algorithm') || authField(source, 'alg') || source.algorithm || source.alg || 'HS256',
      secret: authField(source, 'secret') || authField(source, 'clientSecret') || source.secret || source.clientSecret || '',
      privateKey: authField(source, 'privateKey') || authField(source, 'key') || source.privateKey || source.key || '',
      keyId: authField(source, 'keyId') || authField(source, 'kid') || source.keyId || source.kid || '',
      issuer: authField(source, 'issuer') || authField(source, 'iss') || source.issuer || source.iss || '',
      subject: authField(source, 'subject') || authField(source, 'sub') || source.subject || source.sub || '',
      audience: authField(source, 'audience') || authField(source, 'aud') || source.audience || source.aud || '',
      expiresIn: authField(source, 'expiresIn') || source.expiresIn || '300',
      claims: authField(source, 'claims') || authField(source, 'payload') || source.claims || source.payload || '',
      headerPrefix: authField(source, 'headerPrefix') || source.headerPrefix || 'Bearer',
      addTokenTo: authField(source, 'addTokenTo') || source.addTokenTo || 'header',
      queryParamName: authField(source, 'queryParamName') || source.queryParamName || 'token'
    };
  }
  if (type === 'asap') {
    return {
      type: 'asap',
      algorithm: authField(source, 'algorithm') || source.algorithm || 'RS256',
      privateKey: authField(source, 'privateKey') || authField(source, 'key') || source.privateKey || source.key || '',
      secret: authField(source, 'secret') || authField(source, 'clientSecret') || source.secret || source.clientSecret || '',
      issuer: authField(source, 'issuer') || authField(source, 'iss') || source.issuer || source.iss || '',
      subject: authField(source, 'subject') || authField(source, 'sub') || source.subject || source.sub || '',
      audience: authField(source, 'audience') || authField(source, 'aud') || source.audience || source.aud || '',
      keyId: authField(source, 'keyId') || authField(source, 'kid') || source.keyId || source.kid || '',
      expiresIn: authField(source, 'expiresIn') || source.expiresIn || '300'
    };
  }
  throw new Error(`pm.sendRequest auth helper "${source.type}" is not supported by the sandboxed HTTP broker yet.`);
}

function normalizePmAuthType(value) {
  const normalized = String(value || '').toLowerCase().replace(/[\s_.-]+/g, '');
  if (normalized === 'noauth' || normalized === 'none' || normalized === 'inherit') {
    return normalized;
  }
  if (normalized === 'apikey') {
    return 'apikey';
  }
  if (normalized === 'clientcertificate' || normalized === 'clientcert') {
    return 'clientcertificate';
  }
  if (normalized === 'awsv4' || normalized === 'aws' || normalized === 'awssignature') {
    return 'aws';
  }
  if (normalized === 'oauth1' || normalized === 'oauth10') {
    return 'oauth1';
  }
  if (normalized === 'akamai' || normalized === 'edgegrid' || normalized === 'akamaiedgegrid') {
    return 'akamaiedgegrid';
  }
  if (normalized === 'jwt' || normalized === 'jwtbearer' || normalized === 'bearerjwt') {
    return 'jwtbearer';
  }
  if (normalized === 'asap' || normalized === 'atlassianasap') {
    return 'asap';
  }
  return normalized;
}

function normalizePmSendRequestClientCertificateAuth(source, options = {}) {
  const certificateId = authField(source, 'certificateId') || authField(source, 'id') || source.certificateId || source.id || '';
  if (!certificateId) {
    if (source.certPath || source.keyPath || source.pfxPath || source.cert?.src || source.key?.src || source.pfx?.src) {
      throw new Error('pm.sendRequest client certificate auth requires a configured certificate binding; scripts cannot provide certificate file paths.');
    }
    throw new Error('pm.sendRequest client certificate auth requires a configured certificate binding.');
  }
  const certificate = (options.clientCertificates || []).find((candidate) => String(candidate?.id || '') === String(certificateId));
  if (!certificate) {
    throw new Error('pm.sendRequest client certificate binding is not available to this script execution.');
  }
  return {
    type: 'clientCertificate',
    certificateId: String(certificate.id || ''),
    certPath: certificate.certPath || '',
    keyPath: certificate.keyPath || '',
    pfxPath: certificate.pfxPath || '',
    caPath: certificate.caPath || '',
    passphrase: certificate.passphrase || ''
  };
}

function authField(auth, key) {
  const values = auth?.[auth.type] || auth?.params || auth?.parameters;
  if (Array.isArray(values)) {
    const item = values.find((candidate) => candidate?.key === key);
    return item?.value == null ? '' : String(item.value);
  }
  if (values && typeof values === 'object') {
    const value = values[key];
    return value == null ? '' : String(value);
  }
  return '';
}

function boolAuthField(auth, key) {
  const value = authField(auth, key);
  return value === true || String(value).toLowerCase() === 'true';
}

function postmanOauthGrantType(value) {
  const grantType = String(value || '').toLowerCase();
  if (grantType === 'client_credentials' || grantType === 'clientcredentials') {
    return 'clientCredentials';
  }
  if (grantType === 'device_code' || grantType === 'devicecode') {
    return 'deviceCode';
  }
  return 'authorizationCode';
}

function normalizePmSendRequestCookieJar(source) {
  if (source.cookieJar === false || source.jar === false) {
    return { enabled: false, storeResponses: false };
  }
  const jar = source.cookieJar || source.jar || {};
  if (jar && typeof jar === 'object') {
    return {
      enabled: jar.enabled !== false,
      storeResponses: jar.storeResponses !== false
    };
  }
  return { enabled: true, storeResponses: true };
}

function normalizePmSendRequestTimeout(source) {
  const raw = source.timeout ?? source.requestTimeout ?? source.timeoutMillis;
  if (raw == null || raw === '') {
    return undefined;
  }
  const timeout = Number(raw);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return undefined;
  }
  return Math.max(1, Math.min(MAX_PM_SEND_TIMEOUT_MILLIS, Math.floor(timeout)));
}

function rejectUnsupportedPmSendRequestTransportOptions(source) {
  if (source.strictSSL === false || source.tls?.rejectUnauthorized === false || source.ssl?.strict === false) {
    throw new Error('pm.sendRequest cannot disable TLS certificate validation inside the sandbox.');
  }
}

function normalizePmSendRequestProxy(proxy) {
  if (!proxy || proxy.disabled === true || proxy.enabled === false) {
    return null;
  }
  if (typeof proxy === 'string') {
    return { enabled: true, url: proxy };
  }
  if (typeof proxy !== 'object') {
    throw new Error('pm.sendRequest proxy configuration must be an object or URL string.');
  }
  return {
    enabled: true,
    url: proxy.url || proxy.uri || '',
    protocol: proxy.protocol || proxy.scheme || '',
    host: proxy.host || proxy.hostname || '',
    port: proxy.port == null ? '' : String(proxy.port),
    username: proxy.username || proxy.auth?.username || '',
    password: proxy.password || proxy.auth?.password || '',
    tunnel: proxy.tunnel === true
  };
}

function looksLikeJsonText(value) {
  const text = String(value || '').trim();
  if (!text || !/^[\[{]/.test(text)) {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
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
      error: item.error == null ? '' : String(item.error).slice(0, LIMITS.value),
      skipped: item.skipped === true
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
    recordSandboxDenial(state, 'script_cookies_disabled', 'pm.cookies');
    throw new Error('pm.cookies is disabled for this workspace.');
  }
}

function recordSandboxDenial(state, failureCode, operation) {
  const record = state?.options?.recordDiagnosticEvent;
  if (typeof record !== 'function') {
    return;
  }
  Promise.resolve(record({
    type: 'sandbox.broker.denied',
    level: 'warn',
    outcome: 'denied',
    failureCode,
    fields: {
      operation,
      protocol: state?.context?.request?.protocol || 'http'
    }
  })).catch(() => {});
}

function scriptCapabilityEnabled(state, capability) {
  if (capability === 'vault') {
    return vaultCapabilityDecision(state).allowed;
  }
  return state.options.trustedCapabilities?.[capability] !== false;
}

function vaultCapabilityDecision(state) {
  const trustedCapabilities = state.options.trustedCapabilities || {};
  const grants = trustedCapabilities.vaultGrants;
  const requestId = String(state.context?.request?.id || '');
  const collectionId = String(state.context?.collectionId || '');
  if (grants && typeof grants === 'object') {
    if (requestId && listIncludesId(grants.deniedRequests, requestId)) {
      return { allowed: false, explicitDenied: true };
    }
    if (collectionId && listIncludesId(grants.deniedCollections, collectionId)) {
      return { allowed: false, explicitDenied: true };
    }
  }
  if (trustedCapabilities.vault === true) {
    return { allowed: true, explicitDenied: false };
  }
  if (!grants || typeof grants !== 'object') {
    return { allowed: false, explicitDenied: false };
  }
  if (grants.workspace === true) {
    return { allowed: true, explicitDenied: false };
  }
  if (requestId && listIncludesId(grants.requests, requestId)) {
    return { allowed: true, explicitDenied: false };
  }
  return {
    allowed: Boolean(collectionId && listIncludesId(grants.collections, collectionId)),
    explicitDenied: false
  };
}

function applyTransientVaultGrant(state, promptResult = {}) {
  state.options.trustedCapabilities ||= {};
  const trustedCapabilities = state.options.trustedCapabilities;
  trustedCapabilities.vaultGrants ||= {};
  const grants = trustedCapabilities.vaultGrants;
  const scope = promptResult.scope === 'collection' ? 'collection' : promptResult.scope === 'workspace' ? 'workspace' : 'request';
  if (scope === 'workspace') {
    grants.workspace = true;
    return;
  }
  if (scope === 'collection') {
    grants.collections = appendUniqueId(grants.collections, state.context?.collectionId || '');
    return;
  }
  grants.requests = appendUniqueId(grants.requests, state.context?.request?.id || '');
}

function listIncludesId(values, id) {
  return Array.isArray(values) && values.map((value) => String(value || '')).includes(id);
}

function appendUniqueId(values, id) {
  const normalized = String(id || '').trim();
  const next = Array.isArray(values) ? values.map((value) => String(value || '')) : [];
  if (normalized && !next.includes(normalized)) {
    next.push(normalized);
  }
  return next;
}

function currentRequestCookiesForWorker(state) {
  try {
    return cookiesForCurrentRequest(state).map(scriptCookieForWorker);
  } catch {
    return [];
  }
}

function cookiesForCurrentRequest(state) {
  return cookiesForRequest(state.cookies, currentRequestUrl(state));
}

function cookiesForUrl(state, rawUrl) {
  return cookiesForRequest(state.cookies, cookieJarOperationUrl(rawUrl));
}

function scriptCookieForWorker(cookie = {}) {
  return {
    domain: cookie.domain || '',
    enabled: cookie.enabled !== false,
    expiresAt: cookie.expiresAt || cookie.expires || '',
    hostOnly: cookie.hostOnly === true,
    httpOnly: cookie.httpOnly === true,
    maxAge: cookie.maxAge == null ? '' : String(cookie.maxAge),
    name: cookie.name || '',
    partitioned: cookie.partitioned === true,
    path: cookie.path || '/',
    priority: cookie.priority || '',
    sameSite: cookie.sameSite || '',
    secure: cookie.secure === true,
    value: cookie.value == null ? '' : String(cookie.value)
  };
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
  const maxAge = source.maxAge == null || source.maxAge === '' ? null : Number(source.maxAge);
  const expiresAt = Number.isFinite(maxAge)
    ? new Date(Date.now() + maxAge * 1000).toISOString()
    : source.expiresAt ? String(source.expiresAt) : '';
  const requestedHostOnly = source.hostOnly === true || !source.domain;
  const domain = requestedHostOnly ? '' : normalizeCookieDomain(source.domain || '');
  if (domain && !cookieDomainAllowedForUrl(url, domain)) {
    throw new Error('pm.cookies.jar.set cookie domain must match the target URL.');
  }
  const path = source.path ? String(source.path) : defaultCookiePath(url.pathname);
  const secure = source.secure === true;
  const sameSite = source.sameSite == null ? '' : String(source.sameSite);
  validateScriptSetCookieAttributes({ name, path, secure, sameSite, hostOnly: requestedHostOnly });
  return cookieFromHeader({ name, value: source.value == null ? '' : String(source.value) }, url, {
    source: 'script',
    domain: domain || undefined,
    path,
    expiresAt,
    secure,
    httpOnly: source.httpOnly === true,
    sameSite,
    hostOnly: requestedHostOnly,
    priority: source.priority == null ? '' : String(source.priority),
    partitioned: source.partitioned === true
  });
}

function defaultCookiePath(pathname) {
  const pathText = String(pathname || '/');
  if (!pathText || pathText === '/') {
    return '/';
  }
  const index = pathText.lastIndexOf('/');
  return index <= 0 ? '/' : pathText.slice(0, index);
}

function validateScriptSetCookieAttributes(cookie) {
  if (cookie.name.startsWith('__Secure-') && cookie.secure !== true) {
    throw new Error('pm.cookies.jar.set __Secure- cookies require Secure.');
  }
  if (cookie.name.startsWith('__Host-')) {
    if (cookie.secure !== true || cookie.hostOnly !== true || cookie.path !== '/') {
      throw new Error('pm.cookies.jar.set __Host- cookies require Secure, host-only scope, and path "/".');
    }
  }
  if (String(cookie.sameSite || '').toLowerCase() === 'none' && cookie.secure !== true) {
    throw new Error('pm.cookies.jar.set SameSite=None cookies require Secure.');
  }
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
  _createStdioChildTransportForTest: createStdioChildTransport,
  osSandboxStatus,
  runPostmanScriptIsolated,
  scriptWorkerExecArgv,
  scriptWorkerEnv,
  scriptWorkerMaxOldSpaceMb,
  scriptWorkerRequiresNodePermission,
  supportsNodePermissionFlags
};
