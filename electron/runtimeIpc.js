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
    mutateWorkspace = async (mutator) => {
      const nextWorkspace = await mutator(getWorkspace());
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
    const abortController = new AbortController();
    const workspace = getWorkspace();
    const workspaceId = getWorkspaceId();
    const baseCookies = cloneJson(workspace.cookies || []);
    activeLoadTests.set(id, abortController);
    try {
      const result = await runLoadTest(request, environment, config, {
        abortController,
        cookieJar: workspace.cookies || [],
        onProgress: (progress) => {
          assertLoadProgressPayload(progress);
          event.sender.send('load:progress', { id, progress });
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
      const publicResult = publicLoadResult(result);
      assertLoadResultPayload(publicResult);
      return publicResult;
    } finally {
      activeLoadTests.delete(id);
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
    const abortController = new AbortController();
    const workspaceId = getWorkspaceId();
    activeCollectionRuns.set(id, abortController);
    try {
      const workspace = getWorkspace();
      const baseEnvironment = cloneJson(environment);
      const baseCollectionVariables = cloneJson(collection?.variables || []);
      const baseGlobals = cloneJson(workspace.globals || []);
      const baseCookies = cloneJson(workspace.cookies || []);
      const baseLocalVariablesByRequestId = requestLocalVariablesById(collection);
      const result = await runCollection(collection, environment, {
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
        onProgress: (progress) => {
          assertRunnerProgressPayload(progress);
          event.sender.send('runner:progress', { id, progress });
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
      const publicResult = publicCollectionRunResult(result);
      assertCollectionRunResultPayload(publicResult);
      return publicResult;
    } finally {
      activeCollectionRuns.delete(id);
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

module.exports = {
  registerRuntimeIpc
};
