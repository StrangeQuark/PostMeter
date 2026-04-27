const { sendRequest } = require('./httpClient');
const { runPostmanScriptIsolated } = require('./scriptSandbox');
const {
  cloneEnvironment,
  cloneVariables,
  runtimeEnvironment
} = require('./variableScope');

function createScriptedRequestState(request, environment, options = {}) {
  return {
    request,
    environment: normalizeRuntimeEnvironment(
      options.cloneEnvironment === false
        ? environment
        : cloneEnvironment(environment)
    ),
    collectionVariables: normalizeVariables(
      options.collectionVariables || [],
      options.cloneCollectionVariables !== false
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

async function runScriptedRequestLifecycle(state, options = {}) {
  const send = options.sendRequest || sendRequest;
  const runScript = options.scriptRunner || runPostmanScriptIsolated;
  const iterationData = options.iterationData || [];
  const scriptOptions = {
    ...(options.scriptOptions || {}),
    runRequest: options.scriptOptions?.runRequest || options.runRequest,
    sandboxPackages: options.scriptOptions?.sandboxPackages || options.sandboxPackages || [],
    sendRequest: options.scriptOptions?.sendRequest || send,
    signal: options.signal,
    trustedCapabilities: options.trustedCapabilities || options.scriptOptions?.trustedCapabilities || {},
    vault: options.scriptOptions?.vault || options.vault
  };

  const preRequestScriptExecution = await runScript(state.request?.scripts?.preRequest, scriptContext(state, {
    collectionId: options.collectionId,
    iteration: options.iteration || 0,
    iterationCount: options.iterationCount || 1,
    iterationData
  }), scriptOptions);
  applyScriptMutations(state, preRequestScriptExecution, { allowRequestMutation: true });
  const preRequestScriptResult = scriptResultOnly(preRequestScriptExecution);
  const preRequestExecution = preRequestScriptResult.execution || {};
  if (!preRequestScriptResult.passed) {
    return {
      ...state,
      response: null,
      preRequestScriptResult,
      testScriptResult: emptyScriptResult(),
      requestSent: false,
      execution: preRequestExecution
    };
  }
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

  const response = await send(
    state.request,
    runtimeEnvironment(state.collectionVariables, state.environment, state.localVariables, {
      globals: state.globals,
      iterationData
    }),
    { signal: options.signal, cookieJar: state.cookies }
  );
  if (Array.isArray(response.updatedCookies)) {
    state.cookies = response.updatedCookies;
  }
  const testScriptExecution = await runScript(state.request?.scripts?.tests, scriptContext(state, {
    collectionId: options.collectionId,
    iteration: options.iteration || 0,
    iterationCount: options.iterationCount || 1,
    iterationData,
    response
  }), scriptOptions);
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

function scriptContext(state, options = {}) {
  return {
    collectionId: options.collectionId || '',
    collectionVariables: state.collectionVariables,
    globals: state.globals,
    localVariables: state.localVariables,
    environment: state.environment,
    request: state.request,
    response: options.response,
    cookieJar: state.cookies,
    iterationData: options.iterationData || [],
    iteration: options.iteration || 0,
    iterationCount: options.iterationCount || 1
  };
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
      body: execution.request.body == null ? state.request.body : execution.request.body
    };
  }
}

function createPreRequestScriptError(result) {
  const error = new Error(result?.preRequestScriptResult?.error || 'Pre-request script failed.');
  error.preRequestScriptResult = result?.preRequestScriptResult || emptyScriptResult();
  error.environment = normalizeRuntimeEnvironment(result?.environment);
  error.collectionVariables = Array.isArray(result?.collectionVariables) ? result.collectionVariables : [];
  error.globals = Array.isArray(result?.globals) ? result.globals : [];
  error.localVariables = Array.isArray(result?.localVariables) ? result.localVariables : [];
  return error;
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
  createPreRequestScriptError,
  createScriptedRequestState,
  emptyScriptResult,
  runScriptedRequestLifecycle,
  scriptResultOnly
};
