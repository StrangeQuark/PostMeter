const { validateRequest } = require('../src/core/httpClient');
const { runRequestWithScripts } = require('../src/core/requestScriptRunner');
const {
  emptyScriptResult,
  scriptResultFailureMessage
} = require('../src/core/scriptedRequestLifecycle');
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
    getVaultPrompt = () => null,
    ipcMain,
    recordDiagnosticEvent = async () => {},
    runRequestWithScripts: runRequest = runRequestWithScripts,
    mutateWorkspace = async (mutator) => {
      const nextWorkspace = await mutator(cloneJson(getWorkspace()));
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
    const startedAt = Date.now();
      try {
        const { response: result, environment: nextEnvironment, collectionVariables, localVariables, globals } = await runRequest(request, environment, {
        collectionId: requestContext?.collection?.id || '',
        collectionAuth: requestContext?.collection?.auth || { type: 'none' },
        collectionScripts: requestContext?.collection?.scripts || {},
        collectionVariables: requestContext?.collection?.variables || [],
        globals: workspaceSnapshot.globals || [],
        cookieJar: workspaceSnapshot.cookies || [],
        clientCertificates: requestContext?.collection?.certificates || [],
        fileBindings: workspaceSnapshot.settings?.sandbox?.fileBindings || [],
        sandboxPackages: workspaceSnapshot.settings?.sandbox?.packageCache || [],
        trustedCapabilities: workspaceSnapshot.settings?.sandbox?.trustedCapabilities || {},
        vault: getVaultStore(workspaceId),
        vaultPrompt: getVaultPrompt(workspaceId),
        workspaceId,
        workspaceName: workspaceId,
        collectionName: requestContext?.collection?.name || '',
        recordDiagnosticEvent
      });
      const validationResult = publicRequestResult(result);
      assertResponsePayload(validationResult);
      let workspaceMutationApplied = false;
      await mutateWorkspace(async (latestWorkspace) => {
        workspaceMutationApplied = true;
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
        if (result.requestSent !== false) {
          latestWorkspace.history = [
            historyEntry({
              method: request.method,
              url: result.finalUrl,
              statusCode: result.statusCode,
              durationMillis: result.durationMillis
            }),
            ...(latestWorkspace.history || [])
          ].slice(0, 100);
        }
        return latestWorkspace;
      }, { workspaceId });
      const publicResult = publicRequestResult(result, {
        updatedAuthPersisted: workspaceMutationApplied && Boolean(result.updatedAuth)
      });
      assertResponsePayload(publicResult);
      await recordDiagnosticEvent({
        type: 'request.send.completed',
        level: 'info',
        outcome: 'completed',
        durationMillis: publicResult.durationMillis,
        fields: {
          method: request.method,
          protocol: request.protocol || 'http',
          requestBodyBytes: Buffer.byteLength(String(request.body || ''), 'utf8'),
          responseBytes: publicResult.responseBytes || 0,
          statusCategory: statusCategory(publicResult.statusCode),
          statusCode: publicResult.statusCode
        }
      });
      return publicResult;
    } catch (error) {
      const isPreRequestScriptFailure = Boolean(error?.preRequestScriptResult);
      const shouldCommitPreRequestSideEffects = isPreRequestScriptFailure
        && error.preRequestScriptResult.commitSideEffects !== false;
      if (shouldCommitPreRequestSideEffects) {
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
      if (isPreRequestScriptFailure) {
        const result = preRequestFailureResponse(request, error, {
          collectionVariables: shouldCommitPreRequestSideEffects ? error.collectionVariables : baseCollectionVariables,
          durationMillis: Date.now() - startedAt,
          environment: shouldCommitPreRequestSideEffects ? error.environment : baseEnvironment,
          globals: shouldCommitPreRequestSideEffects ? error.globals : baseGlobals,
          localVariables: shouldCommitPreRequestSideEffects ? error.localVariables : baseLocalVariables
        });
        assertResponsePayload(result);
        await recordDiagnosticEvent({
          type: 'request.send.failed',
          level: 'warn',
          outcome: 'failed',
          failureCode: failureCodeFromError(error, 'pre_request_script_failed'),
          durationMillis: result.durationMillis,
          fields: {
            method: request.method,
            protocol: request.protocol || 'http',
            requestBodyBytes: Buffer.byteLength(String(request.body || ''), 'utf8'),
            requestSent: false,
            responseBytes: result.responseBytes || 0
          }
        });
        return result;
      }
      await recordDiagnosticEvent({
        type: 'request.send.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: failureCodeFromError(error, 'request_send_failed'),
        durationMillis: Date.now() - startedAt,
        fields: {
          method: request.method,
          protocol: request.protocol || 'http',
          requestBodyBytes: Buffer.byteLength(String(request.body || ''), 'utf8'),
          error: error?.message || String(error)
        }
      });
      throw error;
    }
  });
}

function preRequestFailureResponse(request, error, options = {}) {
  const preRequestScriptResult = error?.preRequestScriptResult || emptyScriptResult();
  const message = scriptResultFailureMessage(preRequestScriptResult, 'Pre-request script failed.');
  return {
    statusCode: 0,
    headers: {},
    body: message,
    durationMillis: Math.max(0, Number(options.durationMillis) || 0),
    responseBytes: Buffer.byteLength(message, 'utf8'),
    finalUrl: String(request?.url || ''),
    preRequestScriptResult,
    testScriptResult: emptyScriptResult(),
    environment: options.environment,
    collectionVariables: Array.isArray(options.collectionVariables) ? options.collectionVariables : [],
    globals: Array.isArray(options.globals) ? options.globals : [],
    localVariables: Array.isArray(options.localVariables) ? options.localVariables : [],
    requestSent: false,
    error: message
  };
}

function cloneJson(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function publicRequestResult(result, options = {}) {
  const publicResult = cloneJson(result) || {};
  if (result?.updatedAuth) {
    delete publicResult.updatedAuth;
    if (options.updatedAuthPersisted === true) {
      publicResult.updatedAuthPersisted = true;
    }
  }
  return publicResult;
}

function statusCategory(statusCode) {
  const code = Number(statusCode);
  if (!Number.isFinite(code) || code <= 0) {
    return 'none';
  }
  return `${Math.floor(code / 100)}xx`;
}

function failureCodeFromError(error, fallback) {
  const text = String(error?.message || error?.preRequestScriptResult?.error || fallback || 'error').toLowerCase();
  if (/sendrequest|send request|pm\.sendrequest/.test(text)) {
    return 'script_send_request_denied_or_failed';
  }
  if (/pm\.vault|vault/.test(text)) {
    return 'script_vault_denied_or_failed';
  }
  if (/pm\.cookies|cookie/.test(text)) {
    return 'script_cookie_denied_or_failed';
  }
  return String(fallback || 'request_failed');
}

module.exports = {
  publicRequestResult,
  registerRequestIpc
};
