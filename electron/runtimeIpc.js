const { loadTestResultToCsv, runLoadTest } = require('../src/core/loadTestRunner');
const { collectionRunResultToCsv, runCollection } = require('../src/core/collectionRunner');
const { writeTextFileAtomic } = require('../src/core/workspacePersistence');
const { selectedSaveFilePath } = require('./fileDialogs');
const {
  applyCollectionRunMutationsToWorkspace,
  findWorkspaceRequestContext,
  mergeCookieJarByDelta
} = require('./workspaceMutations');
const {
  assertCollectionPayload,
  assertCollectionRunResultPayload,
  assertExportFormat,
  assertLoadConfigPayload,
  assertLoadId,
  assertLoadProgressPayload,
  assertLoadResultPayload,
  assertOptionalEnvironmentPayload,
  assertRequestPayload,
  assertRunnerConfigPayload,
  assertRunnerProgressPayload
} = require('../src/core/ipcValidation');

function registerRuntimeIpc(options = {}) {
  const {
    dialog,
    fileOperationResult,
    getMainWindow = () => undefined,
    getWorkspace,
    getWorkspaceId = () => '',
    getVaultStore = () => null,
    getVaultPrompt = () => null,
    ipcMain,
    runCollection: runCollectionImpl = runCollection,
    runLoadTest: runLoadTestImpl = runLoadTest,
    recordDiagnosticEvent = async () => {},
    mutateWorkspace = async (mutator) => {
      const nextWorkspace = await mutator(cloneJson(getWorkspace()));
      const savedWorkspace = await saveWorkspace(nextWorkspace);
      setWorkspace(savedWorkspace);
      return savedWorkspace;
    },
    saveWorkspace,
    setWorkspace
  } = options;
  const activeLoadTests = new Map();
  const activeCollectionRuns = new Map();

  ipcMain.handle('load:start', async (event, id, request, environment, config) => {
    assertLoadId(id);
    assertRequestPayload(request);
    assertOptionalEnvironmentPayload(environment);
    assertLoadConfigPayload(config);
    if (activeLoadTests.has(id)) {
      throw new Error(`Load test is already running for id "${id}".`);
    }
    const abortController = new AbortController();
    const workspace = getWorkspace();
    const workspaceId = getWorkspaceId();
    const baseCookies = cloneJson(workspace.cookies || []);
    const progressDelivery = createProgressDelivery({
      abortController,
      assertPayload: assertLoadProgressPayload,
      channel: 'load:progress',
      event,
      id,
      label: 'Load-test progress'
    });
    activeLoadTests.set(id, abortController);
    try {
      const result = await runLoadTestImpl(request, environment, config, {
        abortController,
        cookieJar: workspace.cookies || [],
        onProgress: progressDelivery.send
      });
      progressDelivery.throwIfFailed();
      const publicResult = publicLoadResult(result);
      assertLoadResultPayload(publicResult);
      await recordDiagnosticEvent({
        type: 'load.start.completed',
        level: 'info',
        outcome: 'completed',
        durationMillis: publicResult.elapsedMillis,
        fields: {
          executionMode: publicResult.executionMode || config.executionMode || 'singleProcess',
          failedRequests: publicResult.failedRequests || 0,
          requestBodyBytes: Buffer.byteLength(String(request.body || ''), 'utf8'),
          statusCodeBucketCount: Object.keys(result.statusCounts || {}).length,
          successfulRequests: publicResult.successfulRequests || 0,
          totalRequests: publicResult.totalRequests || 0
        }
      });
      if (Array.isArray(result.cookies)) {
        await mutateWorkspace(async (latestWorkspace) => {
          if (result.updatedAuth && request.id) {
            const latestRequestContext = findWorkspaceRequestContext(latestWorkspace, request.id);
            if (latestRequestContext?.request) {
              latestRequestContext.request.auth = result.updatedAuth;
            }
          }
          latestWorkspace.cookies = mergeCookieJarByDelta(latestWorkspace.cookies || [], baseCookies, result.cookies);
          return latestWorkspace;
        }, { workspaceId });
      } else if (result.updatedAuth && request.id) {
        await mutateWorkspace(async (latestWorkspace) => {
          const latestRequestContext = findWorkspaceRequestContext(latestWorkspace, request.id);
          if (latestRequestContext?.request) {
            latestRequestContext.request.auth = result.updatedAuth;
          }
          return latestWorkspace;
        }, { workspaceId });
      }
      return publicResult;
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'load.start.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: failureCodeFromError(error, 'load_start_failed'),
        fields: {
          executionMode: config?.executionMode || 'singleProcess',
          requestBodyBytes: Buffer.byteLength(String(request.body || ''), 'utf8'),
          error: error?.message || String(error)
        }
      });
      throw error;
    } finally {
      if (activeLoadTests.get(id) === abortController) {
        activeLoadTests.delete(id);
      }
    }
  });

  ipcMain.handle('load:cancel', (_event, id) => {
    assertLoadId(id);
    const abortController = activeLoadTests.get(id);
    if (!abortController) {
      return false;
    }
    abortController.abort();
    return true;
  });

  ipcMain.handle('runner:start', async (event, id, collection, environment, config = {}) => {
    assertLoadId(id);
    assertCollectionPayload(collection);
    assertOptionalEnvironmentPayload(environment);
    assertRunnerConfigPayload(config);
    if (activeCollectionRuns.has(id)) {
      throw new Error(`Collection run is already running for id "${id}".`);
    }
    const abortController = new AbortController();
    const workspaceId = getWorkspaceId();
    const progressDelivery = createProgressDelivery({
      abortController,
      assertPayload: assertRunnerProgressPayload,
      channel: 'runner:progress',
      event,
      id,
      label: 'Collection-run progress'
    });
    activeCollectionRuns.set(id, abortController);
    try {
      const workspace = getWorkspace();
      const baseEnvironment = cloneJson(environment);
      const baseCollectionVariables = cloneJson(collection?.variables || []);
      const baseGlobals = cloneJson(workspace.globals || []);
      const baseCookies = cloneJson(workspace.cookies || []);
      const baseLocalVariablesByRequestId = requestLocalVariablesById(collection);
      const result = await runCollectionImpl(collection, environment, {
        abortController,
        signal: abortController.signal,
        cookieJar: workspace.cookies || [],
        globals: workspace.globals || [],
        fileBindings: workspace.settings?.sandbox?.fileBindings || [],
        sandboxPackages: workspace.settings?.sandbox?.packageCache || [],
        trustedCapabilities: workspace.settings?.sandbox?.trustedCapabilities || {},
        vault: getVaultStore(workspaceId),
        vaultPrompt: getVaultPrompt(workspaceId),
        workspaceId,
        workspaceName: workspaceId,
        stopOnFailure: config.stopOnFailure === true,
        onProgress: progressDelivery.send,
        recordDiagnosticEvent
      });
      progressDelivery.throwIfFailed();
      const publicResult = publicCollectionRunResult(result);
      assertCollectionRunResultPayload(publicResult);
      await recordDiagnosticEvent({
        type: 'runner.start.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          cancelled: publicResult.cancelled === true,
          failedRequests: publicResult.failedRequests || 0,
          passedRequests: publicResult.passedRequests || 0,
          requestCount: publicResult.totalRequests || 0
        }
      });
      if (Array.isArray(result.cookies)) {
        await mutateWorkspace(async (latestWorkspace) => {
          latestWorkspace.cookies = mergeCookieJarByDelta(latestWorkspace.cookies || [], baseCookies, result.cookies);
          applyCollectionRunMutationsToWorkspace(latestWorkspace, result, {
            baseEnvironment,
            baseCollectionVariables,
            baseGlobals,
            baseLocalVariablesByRequestId
          });
          return latestWorkspace;
        }, { workspaceId });
      } else {
        await mutateWorkspace(async (latestWorkspace) => {
          applyCollectionRunMutationsToWorkspace(latestWorkspace, result, {
            baseEnvironment,
            baseCollectionVariables,
            baseGlobals,
            baseLocalVariablesByRequestId
          });
          return latestWorkspace;
        }, { workspaceId });
      }
      return publicResult;
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'runner.start.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: failureCodeFromError(error, 'runner_start_failed'),
        fields: {
          requestCount: countCollectionRequests(collection),
          error: error?.message || String(error)
        }
      });
      throw error;
    } finally {
      if (activeCollectionRuns.get(id) === abortController) {
        activeCollectionRuns.delete(id);
      }
    }
  });

  ipcMain.handle('runner:cancel', (_event, id) => {
    assertLoadId(id);
    const abortController = activeCollectionRuns.get(id);
    if (!abortController) {
      return false;
    }
    abortController.abort();
    return true;
  });

  ipcMain.handle('runner:export', async (_event, result, format) => {
    const publicResult = publicCollectionRunResult(result);
    assertCollectionRunResultPayload(publicResult);
    assertExportFormat(format);
    const extension = format === 'csv' ? 'csv' : 'json';
    const saveResult = await dialog.showSaveDialog(getMainWindow(), {
      title: `Export Collection Run ${extension.toUpperCase()}`,
      defaultPath: `postmeter-collection-run.${extension}`,
      filters: [
        { name: extension.toUpperCase(), extensions: [extension] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    const filePath = selectedSaveFilePath(saveResult);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const content = format === 'csv' ? collectionRunResultToCsv(publicResult) : JSON.stringify(publicResult, null, 2);
    await writeTextFileAtomic(filePath, content, { prefix: 'postmeter-runner-export' });
    return fileOperationResult({ cancelled: false, path: filePath });
  });

  ipcMain.handle('load:export', async (_event, result, format) => {
    const publicResult = publicLoadResult(result);
    assertLoadResultPayload(publicResult);
    assertExportFormat(format);
    const extension = format === 'csv' ? 'csv' : 'json';
    const saveResult = await dialog.showSaveDialog(getMainWindow(), {
      title: `Export Load Test ${extension.toUpperCase()}`,
      defaultPath: `postmeter-load-test.${extension}`,
      filters: [
        { name: extension.toUpperCase(), extensions: [extension] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    const filePath = selectedSaveFilePath(saveResult);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const content = format === 'csv' ? loadTestResultToCsv(publicResult) : JSON.stringify(publicResult, null, 2);
    await writeTextFileAtomic(filePath, content, { prefix: 'postmeter-load-export' });
    return fileOperationResult({ cancelled: false, path: filePath });
  });
}

function requestLocalVariablesById(collection) {
  const byId = new Map();
  const visit = (requests = [], folders = []) => {
    for (const request of requests || []) {
      if (request?.id) {
        byId.set(request.id, cloneJson(request.variables || []));
      }
    }
    for (const folder of folders || []) {
      visit(folder.requests || [], folder.folders || []);
    }
  };
  visit(collection?.requests || [], collection?.folders || []);
  return byId;
}

function cloneJson(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function createProgressDelivery({ abortController, assertPayload, channel, event, id, label }) {
  let deliveryError = null;
  return {
    send(progress) {
      if (deliveryError) {
        return;
      }
      try {
        assertPayload(progress);
        if (event.sender?.isDestroyed?.() === true) {
          throw new Error('renderer sender is destroyed');
        }
        event.sender.send(channel, { id, progress });
      } catch (error) {
        const message = error.message || String(error);
        deliveryError = new Error(`${label} delivery failed: ${message}`);
        abortController.abort();
      }
    },
    throwIfFailed() {
      if (deliveryError) {
        throw deliveryError;
      }
    }
  };
}

function publicLoadResult(result) {
  const publicResult = cloneJson(result) || {};
  delete publicResult.updatedAuth;
  return publicResult;
}

function publicCollectionRunResult(result) {
  const publicResult = cloneJson(result) || {};
  if (Array.isArray(publicResult.results)) {
    for (const item of publicResult.results) {
      delete item.updatedAuth;
    }
  }
  delete publicResult.authUpdates;
  return publicResult;
}

function countCollectionRequests(collection = {}) {
  let count = Array.isArray(collection.requests) ? collection.requests.length : 0;
  for (const folder of collection.folders || []) {
    count += countCollectionRequests(folder);
  }
  return count;
}

function failureCodeFromError(error, fallback) {
  const text = String(error?.message || fallback || 'error').toLowerCase();
  if (/progress.*delivery/.test(text)) {
    return 'progress_delivery_failed';
  }
  if (/cancel/.test(text)) {
    return 'operation_cancelled';
  }
  if (/timeout|timed out/.test(text)) {
    return 'operation_timeout';
  }
  if (/sendrequest|send request|pm\.sendrequest/.test(text)) {
    return 'script_send_request_denied_or_failed';
  }
  if (/pm\.vault|vault/.test(text)) {
    return 'script_vault_denied_or_failed';
  }
  if (/pm\.cookies|cookie/.test(text)) {
    return 'script_cookie_denied_or_failed';
  }
  return String(fallback || 'runtime_failed');
}

module.exports = {
  registerRuntimeIpc
};
