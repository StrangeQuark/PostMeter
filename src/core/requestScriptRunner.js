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
      collectionVariables: options.collectionVariables || []
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
      localVariables: lifecycleResult.localVariables
    },
    environment: lifecycleResult.environment,
    collectionVariables: lifecycleResult.collectionVariables,
    localVariables: lifecycleResult.localVariables,
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
