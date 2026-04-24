const { validateRequest } = require('../src/core/httpClient');
const { runRequestWithScripts } = require('../src/core/requestScriptRunner');
const { historyEntry } = require('../src/core/models');
const {
  applyScriptVariableMutationsToWorkspace,
  findWorkspaceRequestContext,
  updateWorkspaceRequestAuth
} = require('./workspaceMutations');
const {
  assertOptionalEnvironmentPayload,
  assertResponsePayload,
  assertRequestPayload
} = require('../src/core/ipcValidation');

function registerRequestIpc(options = {}) {
  const {
    getWorkspace,
    ipcMain,
    saveWorkspace,
    setWorkspace
  } = options;

  ipcMain.handle('request:validate', (_event, request, environment) => {
    assertRequestPayload(request);
    assertOptionalEnvironmentPayload(environment);
    return validateRequest(request, environment);
  });

  ipcMain.handle('request:send', async (_event, request, environment) => {
    assertRequestPayload(request);
    assertOptionalEnvironmentPayload(environment);
    const workspace = getWorkspace();
    const requestContext = request.id ? findWorkspaceRequestContext(workspace, request.id) : null;
    try {
      const { response: result, environment: nextEnvironment, collectionVariables, localVariables } = await runRequestWithScripts(request, environment, {
        collectionVariables: requestContext?.collection?.variables || [],
        cookieJar: workspace.cookies || []
      });
      if (result.updatedAuth && request.id) {
        if (requestContext?.request) {
          requestContext.request.auth = result.updatedAuth;
        } else {
          updateWorkspaceRequestAuth(workspace, request.id, result.updatedAuth);
        }
      }
      if (Array.isArray(result.updatedCookies)) {
        workspace.cookies = result.updatedCookies;
      }
      applyScriptVariableMutationsToWorkspace(workspace, {
        collection: requestContext?.collection,
        request: requestContext?.request,
        environment: nextEnvironment,
        collectionVariables,
        localVariables
      });
      workspace.history = [
        historyEntry({
          method: request.method,
          url: result.finalUrl,
          statusCode: result.statusCode,
          durationMillis: result.durationMillis
        }),
        ...(workspace.history || [])
      ].slice(0, 100);
      setWorkspace(await saveWorkspace(workspace));
      assertResponsePayload(result);
      return result;
    } catch (error) {
      if (error?.preRequestScriptResult) {
        applyScriptVariableMutationsToWorkspace(workspace, {
          collection: requestContext?.collection,
          request: requestContext?.request,
          environment: error.environment,
          collectionVariables: error.collectionVariables,
          localVariables: error.localVariables
        });
        setWorkspace(await saveWorkspace(workspace));
      }
      throw error;
    }
  });
}

module.exports = {
  registerRequestIpc
};
