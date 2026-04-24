const fs = require('node:fs/promises');
const { fieldLimit } = require('../src/core/payloadSchemas');
const {
  collectionExportExtension,
  collectionExportFilters,
  collectionImportFilters,
  jsonFilters,
  safeFilename
} = require('./fileDialogs');
const {
  assertCollectionExportFormat,
  assertCollectionPayload,
  assertRequestPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspacePayload
} = require('../src/core/ipcValidation');

function registerWorkspaceIpc(options = {}) {
  const {
    dialog,
    fileOperationResult,
    getMainWindow = () => undefined,
    getWorkspace,
    getWorkspaceStore,
    ipcMain,
    refreshApplicationMenu,
    saveWorkspace,
    setWorkspace
  } = options;

  ipcMain.handle('workspace:load', async () => {
    const result = await getWorkspaceStore().describeCurrent(getWorkspace());
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:save', async (_event, nextWorkspace) => {
    assertWorkspacePayload(nextWorkspace);
    const workspace = await saveWorkspace(nextWorkspace);
    setWorkspace(workspace);
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(await getWorkspaceStore().describeCurrent(workspace));
    return workspace;
  });

  ipcMain.handle('workspace:create', async () => {
    const result = await getWorkspaceStore().createWorkspace();
    setWorkspace(result.workspace);
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:rename', async (_event, workspaceId, nextName) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('workspaceId must be a non-empty string.');
    }
    const trimmedName = String(nextName || '').trim();
    if (!trimmedName) {
      throw new Error('Workspace name must be a non-empty string.');
    }
    if (trimmedName.length > fieldLimit('name')) {
      throw new Error(`Workspace name must be ${fieldLimit('name')} characters or fewer.`);
    }
    const workspaceStore = getWorkspaceStore();
    const currentWorkspaceId = typeof workspaceStore.getWorkspaceId === 'function' ? workspaceStore.getWorkspaceId() : '';
    if (workspaceId === currentWorkspaceId) {
      const workspace = await saveWorkspace(getWorkspace());
      setWorkspace(workspace);
    }
    const result = await workspaceStore.renameWorkspace(workspaceId, trimmedName);
    setWorkspace(result.workspace);
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:switch', async (_event, workspaceId) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('workspaceId must be a non-empty string.');
    }
    const result = await getWorkspaceStore().switchWorkspace(workspaceId);
    setWorkspace(result.workspace);
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:delete', async (_event, workspaceId) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('workspaceId must be a non-empty string.');
    }
    const result = await getWorkspaceStore().deleteWorkspace(workspaceId);
    setWorkspace(result.workspace);
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:import', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import PostMeter Workspace',
      properties: ['openFile'],
      filters: jsonFilters()
    });
    if (result.canceled || !result.filePaths.length) {
      return fileOperationResult({ cancelled: true });
    }
    const workspaceStore = getWorkspaceStore();
    const backupPath = await workspaceStore.backupCurrentWorkspace('pre-workspace-import.backup');
    let workspace = await workspaceStore.importWorkspace(result.filePaths[0]);
    workspace = await saveWorkspace(workspace);
    setWorkspace(workspace);
    refreshApplicationMenu();
    return fileOperationResult({ cancelled: false, workspace, backupPath });
  });

  ipcMain.handle('workspace:export', async (_event, nextWorkspace) => {
    if (nextWorkspace) {
      assertWorkspacePayload(nextWorkspace);
    }
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export PostMeter Workspace',
      defaultPath: 'postmeter-workspace.postmeter.json',
      filters: jsonFilters()
    });
    if (result.canceled || !result.filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const exportedPath = await getWorkspaceStore().exportWorkspace(nextWorkspace || getWorkspace(), result.filePath);
    return fileOperationResult({ cancelled: false, path: exportedPath });
  });

  ipcMain.handle('collection:import', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import Collection',
      properties: ['openFile'],
      filters: collectionImportFilters()
    });
    if (result.canceled || !result.filePaths.length) {
      return fileOperationResult({ cancelled: true });
    }
    const collection = await getWorkspaceStore().importCollection(result.filePaths[0]);
    return fileOperationResult({ cancelled: false, collection });
  });

  ipcMain.handle('collection:export', async (_event, collection, format = 'postmeter') => {
    assertCollectionPayload(collection);
    assertCollectionExportFormat(format);
    const extension = collectionExportExtension(format);
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Collection',
      defaultPath: `${safeFilename(collection?.name || 'collection')}.${extension}`,
      filters: collectionExportFilters(format)
    });
    if (result.canceled || !result.filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const exportedPath = await getWorkspaceStore().exportCollection(collection, result.filePath, { format });
    return fileOperationResult({ cancelled: false, path: exportedPath });
  });

  ipcMain.handle('request:examples:export', async (_event, request) => {
    assertRequestPayload(request);
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Request Examples',
      defaultPath: `${safeFilename(request?.name || 'request')}-examples.json`,
      filters: jsonFilters()
    });
    if (result.canceled || !result.filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const payload = {
      requestId: request.id || '',
      requestName: request.name || 'Untitled Request',
      exportedAt: new Date().toISOString(),
      examples: request.examples || []
    };
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2));
    return fileOperationResult({ cancelled: false, path: result.filePath });
  });
}

module.exports = {
  registerWorkspaceIpc
};
