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
    localVariables: normalizeVariables(
      options.localVariables || request?.variables || [],
      options.cloneLocalVariables !== false
    )
  };
}

async function runScriptedRequestLifecycle(state, options = {}) {
  const send = options.sendRequest || sendRequest;
  const runScript = options.scriptRunner || runPostmanScriptIsolated;
  const scriptOptions = { ...(options.scriptOptions || {}), signal: options.signal };
  const preRequestScriptExecution = await runScript(state.request?.scripts?.preRequest, {
    collectionVariables: state.collectionVariables,
    localVariables: state.localVariables,
    environment: state.environment,
    request: state.request
  }, scriptOptions);
  applyScriptMutations(
    state.environment,
    state.collectionVariables,
    state.localVariables,
    preRequestScriptExecution
  );
  const preRequestScriptResult = scriptResultOnly(preRequestScriptExecution);
  if (!preRequestScriptResult.passed) {
    return {
      ...state,
      response: null,
      preRequestScriptResult,
      testScriptResult: emptyScriptResult(),
      requestSent: false
    };
  }

  const response = await send(
    state.request,
    runtimeEnvironment(state.collectionVariables, state.environment, state.localVariables),
    { signal: options.signal, cookieJar: options.cookieJar || [] }
  );
  const testScriptExecution = await runScript(state.request?.scripts?.tests, {
    collectionVariables: state.collectionVariables,
    localVariables: state.localVariables,
    environment: state.environment,
    request: state.request,
    response
  }, scriptOptions);
  applyScriptMutations(
    state.environment,
    state.collectionVariables,
    state.localVariables,
    testScriptExecution
  );

  return {
    ...state,
    response,
    preRequestScriptResult,
    testScriptResult: scriptResultOnly(testScriptExecution),
    requestSent: true
  };
}

function applyScriptMutations(environment, collectionVariables, localVariables, execution) {
  if (!execution || execution.result) {
    const environmentVariables = execution?.environmentVariables;
    const nextCollectionVariables = execution?.collectionVariables;
    if (Array.isArray(environmentVariables)) {
      environment.variables = environmentVariables;
    }
    if (Array.isArray(nextCollectionVariables)) {
      collectionVariables.splice(0, collectionVariables.length, ...nextCollectionVariables);
    }
    if (Array.isArray(execution?.localVariables)) {
      localVariables.splice(0, localVariables.length, ...execution.localVariables);
    }
  }
}

function createPreRequestScriptError(result) {
  const error = new Error(result?.preRequestScriptResult?.error || 'Pre-request script failed.');
  error.preRequestScriptResult = result?.preRequestScriptResult || emptyScriptResult();
  error.environment = normalizeRuntimeEnvironment(result?.environment);
  error.collectionVariables = Array.isArray(result?.collectionVariables) ? result.collectionVariables : [];
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
    logs: []
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

module.exports = {
  applyScriptMutations,
  createPreRequestScriptError,
  createScriptedRequestState,
  emptyScriptResult,
  runScriptedRequestLifecycle,
  scriptResultOnly
};
