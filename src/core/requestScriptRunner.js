const {
  applyScriptMutations,
  createPreRequestScriptError,
  createScriptedRequestState,
  emptyScriptResult,
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
  if (!lifecycleResult.preRequestScriptResult.passed) {
    throw createPreRequestScriptError(lifecycleResult);
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
      updatedCookies: lifecycleResult.cookies
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

module.exports = {
  applyScriptMutations,
  emptyScriptResult,
  runRequestWithScripts,
  scriptResultOnly
};
