const { loadTestResultToCsv, runLoadTest } = require('../src/core/loadTestRunner');
const { collectionRunResultToCsv, runCollection } = require('../src/core/collectionRunner');
const { applyCollectionRunMutationsToWorkspace } = require('./workspaceMutations');
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
    ipcMain,
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
        workspace.cookies = result.cookies;
        setWorkspace(await saveWorkspace(workspace));
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
    activeCollectionRuns.set(id, abortController);
    try {
      const workspace = getWorkspace();
      const result = await runCollection(collection, environment, {
        abortController,
        signal: abortController.signal,
        cookieJar: workspace.cookies || [],
        stopOnFailure: config.stopOnFailure === true,
        onProgress: (progress) => {
          assertRunnerProgressPayload(progress);
          event.sender.send('runner:progress', { id, progress });
        }
      });
      if (Array.isArray(result.cookies)) {
        workspace.cookies = result.cookies;
      }
      applyCollectionRunMutationsToWorkspace(workspace, result);
      setWorkspace(await saveWorkspace(workspace));
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

module.exports = {
  registerRuntimeIpc
};
