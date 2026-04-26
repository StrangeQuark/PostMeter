const { loadTestResultToCsv, runLoadTest } = require('../src/core/loadTestRunner');
const { collectionRunResultToCsv, runCollection } = require('../src/core/collectionRunner');
const {
  applyCollectionRunMutationsToWorkspace,
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
          latestWorkspace.cookies = mergeCookieJarByDelta(latestWorkspace.cookies || [], baseCookies, result.cookies);
          return latestWorkspace;
        }, { workspaceId });
      }
      assertLoadResultPayload(result);
      return result;
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
        trustedCapabilities: workspace.settings?.sandbox?.trustedCapabilities || {},
        vault: getVaultStore(workspaceId),
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
      assertCollectionRunResultPayload(result);
      return result;
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
    assertCollectionRunResultPayload(result);
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
    if (saveResult.canceled || !saveResult.filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const content = format === 'csv' ? collectionRunResultToCsv(result) : JSON.stringify(result, null, 2);
    await require('node:fs/promises').writeFile(saveResult.filePath, content);
    return fileOperationResult({ cancelled: false, path: saveResult.filePath });
  });

  ipcMain.handle('load:export', async (_event, result, format) => {
    assertLoadResultPayload(result);
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
    if (saveResult.canceled || !saveResult.filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const content = format === 'csv' ? loadTestResultToCsv(result) : JSON.stringify(result, null, 2);
    await require('node:fs/promises').writeFile(saveResult.filePath, content);
    return fileOperationResult({ cancelled: false, path: saveResult.filePath });
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

module.exports = {
  registerRuntimeIpc
};
