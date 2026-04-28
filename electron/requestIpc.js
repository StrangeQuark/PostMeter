const { validateRequest } = require('../src/core/httpClient');
const { runRequestWithScripts } = require('../src/core/requestScriptRunner');
const { historyEntry } = require('../src/core/models');
const {
  applyScriptVariableMutationsToWorkspace,
  findWorkspaceRequestContext,
  mergeCookieJarByDelta,
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
    getWorkspaceId = () => '',
    getVaultStore = () => null,
    ipcMain,
    mutateWorkspace = async (mutator) => {
      const nextWorkspace = await mutator(getWorkspace());
      const savedWorkspace = await saveWorkspace(nextWorkspace);
      setWorkspace(savedWorkspace);
      return savedWorkspace;
    },
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
    const workspaceSnapshot = getWorkspace();
    const workspaceId = getWorkspaceId();
    const requestContext = request.id ? findWorkspaceRequestContext(workspaceSnapshot, request.id) : null;
    const baseEnvironment = cloneJson(environment);
    const baseCollectionVariables = cloneJson(requestContext?.collection?.variables || []);
    const baseLocalVariables = cloneJson(request.variables || requestContext?.request?.variables || []);
    const baseGlobals = cloneJson(workspaceSnapshot.globals || []);
    const baseCookies = cloneJson(workspaceSnapshot.cookies || []);
    try {
      const { response: result, environment: nextEnvironment, collectionVariables, localVariables, globals } = await runRequestWithScripts(request, environment, {
        collectionId: requestContext?.collection?.id || '',
        collectionVariables: requestContext?.collection?.variables || [],
        globals: workspaceSnapshot.globals || [],
        cookieJar: workspaceSnapshot.cookies || [],
        clientCertificates: requestContext?.collection?.certificates || [],
        fileBindings: workspaceSnapshot.settings?.sandbox?.fileBindings || [],
        sandboxPackages: workspaceSnapshot.settings?.sandbox?.packageCache || [],
        trustedCapabilities: workspaceSnapshot.settings?.sandbox?.trustedCapabilities || {},
        vault: getVaultStore(workspaceId)
      });
      await mutateWorkspace(async (latestWorkspace) => {
        const latestRequestContext = request.id ? findWorkspaceRequestContext(latestWorkspace, request.id) : null;
        if (result.updatedAuth && request.id) {
          if (latestRequestContext?.request) {
            latestRequestContext.request.auth = result.updatedAuth;
          } else {
            updateWorkspaceRequestAuth(latestWorkspace, request.id, result.updatedAuth);
          }
        }
        if (Array.isArray(result.updatedCookies)) {
          latestWorkspace.cookies = mergeCookieJarByDelta(latestWorkspace.cookies || [], baseCookies, result.updatedCookies);
        }
        applyScriptVariableMutationsToWorkspace(latestWorkspace, {
          collection: latestRequestContext?.collection,
          request: latestRequestContext?.request,
          environment: nextEnvironment,
          collectionVariables,
          localVariables,
          globals,
          baseEnvironment,
          baseCollectionVariables,
          baseLocalVariables,
          baseGlobals
        });
        latestWorkspace.history = [
          historyEntry({
            method: request.method,
            url: result.finalUrl,
            statusCode: result.statusCode,
            durationMillis: result.durationMillis
          }),
          ...(latestWorkspace.history || [])
        ].slice(0, 100);
        return latestWorkspace;
      }, { workspaceId });
      assertResponsePayload(result);
      return result;
    } catch (error) {
      if (error?.preRequestScriptResult && error.preRequestScriptResult.commitSideEffects !== false) {
        await mutateWorkspace(async (latestWorkspace) => {
          const latestRequestContext = request.id ? findWorkspaceRequestContext(latestWorkspace, request.id) : null;
          applyScriptVariableMutationsToWorkspace(latestWorkspace, {
            collection: latestRequestContext?.collection,
            request: latestRequestContext?.request,
            environment: error.environment,
            collectionVariables: error.collectionVariables,
            localVariables: error.localVariables,
            globals: error.globals,
            baseEnvironment,
            baseCollectionVariables,
            baseLocalVariables,
            baseGlobals
          });
          return latestWorkspace;
        }, { workspaceId });
      }
      throw error;
    }
  });
}

function cloneJson(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  registerRequestIpc
};
