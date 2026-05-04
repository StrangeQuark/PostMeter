const {
  applyScriptMutations,
  createPreRequestScriptError,
  createScriptedRequestState,
  emptyScriptResult,
  preRequestScriptShouldAbortRequest,
  runScriptedRequestLifecycle,
  scriptResultOnly
} = require('./scriptedRequestLifecycle');

async function runRequestWithScripts(request, environment, options = {}) {
  const lifecycleResult = await runScriptedRequestLifecycle(
    createScriptedRequestState(request, environment, {
      collectionVariables: options.collectionVariables || [],
      globals: options.globals || [],
      cookieJar: options.cookieJar || []
    }),
    options
  );
  if (preRequestScriptShouldAbortRequest(lifecycleResult.preRequestScriptResult)) {
    throw createPreRequestScriptError(lifecycleResult);
  }
  if (lifecycleResult.skipped) {
    const response = skippedRequestResponse(request, lifecycleResult);
    return {
      response,
      environment: lifecycleResult.environment,
      collectionVariables: lifecycleResult.collectionVariables,
      globals: lifecycleResult.globals,
      localVariables: lifecycleResult.localVariables,
      cookies: lifecycleResult.cookies,
      preRequestScriptResult: lifecycleResult.preRequestScriptResult,
      testScriptResult: lifecycleResult.testScriptResult
    };
  }

  return {
    response: {
      ...lifecycleResult.response,
      preRequestScriptResult: lifecycleResult.preRequestScriptResult,
      testScriptResult: lifecycleResult.testScriptResult,
      environment: lifecycleResult.environment,
      collectionVariables: lifecycleResult.collectionVariables,
      globals: lifecycleResult.globals,
      localVariables: lifecycleResult.localVariables,
      updatedCookies: lifecycleResult.cookies,
      requestSent: lifecycleResult.requestSent === true
    },
    environment: lifecycleResult.environment,
    collectionVariables: lifecycleResult.collectionVariables,
    globals: lifecycleResult.globals,
    localVariables: lifecycleResult.localVariables,
    cookies: lifecycleResult.cookies,
    preRequestScriptResult: lifecycleResult.preRequestScriptResult,
    testScriptResult: lifecycleResult.testScriptResult
  };
}

function skippedRequestResponse(request, lifecycleResult) {
  const body = 'Request skipped by pre-request script.';
  return {
    statusCode: 0,
    headers: {},
    body,
    durationMillis: 0,
    responseBytes: Buffer.byteLength(body, 'utf8'),
    finalUrl: String(request?.url || ''),
    preRequestScriptResult: lifecycleResult.preRequestScriptResult,
    testScriptResult: lifecycleResult.testScriptResult || emptyScriptResult(),
    environment: lifecycleResult.environment,
    collectionVariables: lifecycleResult.collectionVariables,
    globals: lifecycleResult.globals,
    localVariables: lifecycleResult.localVariables,
    updatedCookies: lifecycleResult.cookies,
    requestSent: false,
    skipped: true
  };
}

module.exports = {
  applyScriptMutations,
  emptyScriptResult,
  runRequestWithScripts,
  scriptResultOnly
};
