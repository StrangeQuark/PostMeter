const { fieldLimit } = require('../src/core/payloadSchemas');
const { writeTextFileAtomic } = require('../src/core/workspacePersistence');
const {
  collectionExportExtension,
  collectionExportFilters,
  collectionImportFilters,
  jsonFilters,
  safeFilename,
  selectedOpenFilePath,
  selectedSaveFilePath
} = require('./fileDialogs');
const {
  assertCollectionExportFormat,
  assertCollectionPayload,
  assertRequestPayload,
  assertWorkspaceEnvironmentSavePayload,
  assertWorkspaceEnvironmentSaveResultPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspaceRequestSavePayload,
  assertWorkspaceRequestSaveResultPayload,
  assertWorkspaceSettingsSavePayload,
  assertWorkspaceSettingsSaveResultPayload,
  assertWorkspacePayload
} = require('../src/core/ipcValidation');
const {
  applyEnvironmentSaveToWorkspace,
  applyRequestSaveToWorkspace,
  applyWorkspaceSettingsSaveToWorkspace,
  findWorkspaceRequestContext
} = require('./workspaceMutations');

function registerWorkspaceIpc(options = {}) {
  const {
    dialog,
    fileOperationResult,
    getMainWindow = () => undefined,
    getWorkspace,
    getWorkspaceStore,
    ipcMain,
    mutateWorkspace = async (mutator) => {
      const nextWorkspace = await mutator(getWorkspace());
      if (!nextWorkspace) {
        return getWorkspace();
      }
      const workspace = await saveWorkspace(nextWorkspace);
      setWorkspace(workspace);
      return workspace;
    },
    queueWorkspaceOperation = async (operation) => operation(),
    refreshApplicationMenu,
    renameVaultStore = async () => {},
    saveWorkspace,
    saveWorkspaceSync,
    setWorkspace,
    deleteVaultStore = async () => {}
  } = options;

  ipcMain.handle('workspace:load', async () => {
    let workspace = getWorkspace();
    if (!workspace) {
      const loaded = await getWorkspaceStore().load();
      workspace = loaded.workspace;
      setWorkspace(workspace);
    }
    const result = await getWorkspaceStore().describeCurrent(workspace);
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:save', async (_event, nextWorkspace) => {
    assertWorkspacePayload(nextWorkspace);
    const workspace = await mutateWorkspace(async () => nextWorkspace);
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(await getWorkspaceStore().describeCurrent(workspace));
    return workspace;
  });

  ipcMain.handle('workspace:saveRequest', async (_event, payload) => {
    assertWorkspaceRequestSavePayload(payload);
    const workspace = await mutateWorkspace(async (currentWorkspace) => applyRequestSaveToWorkspace(currentWorkspace, payload));
    refreshApplicationMenu();
    const requestContext = findWorkspaceRequestContext(workspace, payload.requestId);
    const result = {
      request: requestContext?.request || payload.request
    };
    if (Array.isArray(payload.collectionVariables)) {
      result.collectionVariables = requestContext?.collection?.variables || [];
    }
    if (Array.isArray(payload.cookies)) {
      result.cookies = workspace.cookies || [];
    }
    assertWorkspaceRequestSaveResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:saveEnvironment', async (_event, payload) => {
    assertWorkspaceEnvironmentSavePayload(payload);
    const workspace = await mutateWorkspace(async (currentWorkspace) => applyEnvironmentSaveToWorkspace(currentWorkspace, payload));
    refreshApplicationMenu();
    const environment = (workspace.environments || []).find((candidate) => candidate.id === payload.environmentId) || payload.environment;
    const result = { environment };
    assertWorkspaceEnvironmentSaveResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:saveSettings', async (_event, settings) => {
    assertWorkspaceSettingsSavePayload(settings);
    const workspace = await mutateWorkspace(async (currentWorkspace) => applyWorkspaceSettingsSaveToWorkspace(currentWorkspace, settings));
    refreshApplicationMenu();
    const result = { settings: workspace.settings || {} };
    assertWorkspaceSettingsSaveResultPayload(result);
    return result;
  });

  ipcMain.on('workspace:saveSync', (event, nextWorkspace) => {
    assertWorkspacePayload(nextWorkspace);
    const workspace = typeof saveWorkspaceSync === 'function'
      ? saveWorkspaceSync(nextWorkspace)
      : nextWorkspace;
    setWorkspace(workspace);
    refreshApplicationMenu();
    event.returnValue = workspace;
  });

  ipcMain.handle('workspace:create', async () => {
    const createdWorkspaceId = await getWorkspaceStore().createWorkspace();
    refreshApplicationMenu();
    const result = await getWorkspaceStore().describeCurrent(getWorkspace(), { createdWorkspaceId });
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
      await mutateWorkspace(async (currentWorkspace) => currentWorkspace);
    }
    const result = await queueWorkspaceOperation(async () => {
      const renamed = await workspaceStore.renameWorkspace(workspaceId, trimmedName);
      await renameVaultStore(workspaceId, renamed.renamedWorkspaceId || '');
      setWorkspace(renamed.workspace);
      return renamed;
    });
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:switch', async (_event, workspaceId) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('workspaceId must be a non-empty string.');
    }
    const result = await queueWorkspaceOperation(async () => {
      const switched = await getWorkspaceStore().switchWorkspace(workspaceId);
      setWorkspace(switched.workspace);
      return switched;
    });
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:delete', async (_event, workspaceId) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('workspaceId must be a non-empty string.');
    }
    const result = await queueWorkspaceOperation(async () => {
      const deleted = await getWorkspaceStore().deleteWorkspace(workspaceId);
      await deleteVaultStore(deleted.deletedWorkspaceId || workspaceId);
      setWorkspace(deleted.workspace);
      return deleted;
    });
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
    const filePath = selectedOpenFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const workspaceStore = getWorkspaceStore();
    const createdWorkspaceId = await workspaceStore.importWorkspace(filePath);
    const loaded = await workspaceStore.describeCurrent(getWorkspace(), { createdWorkspaceId });
    assertWorkspaceLoadResultPayload(loaded);
    return fileOperationResult({ cancelled: false, ...loaded });
  });

  ipcMain.handle('workspace:export', async (_event, nextWorkspace, workspaceId) => {
    if (nextWorkspace) {
      assertWorkspacePayload(nextWorkspace);
    }
    if (workspaceId != null && (typeof workspaceId !== 'string' || !workspaceId.trim())) {
      throw new Error('workspaceId must be a non-empty string when provided.');
    }
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export PostMeter Workspace',
      defaultPath: 'postmeter-workspace.postmeter.json',
      filters: jsonFilters()
    });
    const filePath = selectedSaveFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const exportedPath = workspaceId
      ? await getWorkspaceStore().exportWorkspaceById(workspaceId, filePath)
      : await getWorkspaceStore().exportWorkspace(nextWorkspace || getWorkspace(), filePath);
    return fileOperationResult({ cancelled: false, path: exportedPath });
  });

  ipcMain.handle('collection:import', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import Collection',
      properties: ['openFile'],
      filters: collectionImportFilters()
    });
    const filePath = selectedOpenFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const collection = await getWorkspaceStore().importCollection(filePath);
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
    const filePath = selectedSaveFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const exportedPath = await getWorkspaceStore().exportCollection(collection, filePath, { format });
    return fileOperationResult({ cancelled: false, path: exportedPath });
  });

  ipcMain.handle('request:examples:export', async (_event, request) => {
    assertRequestPayload(request);
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Request Examples',
      defaultPath: `${safeFilename(request?.name || 'request')}-examples.json`,
      filters: jsonFilters()
    });
    const filePath = selectedSaveFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const payload = {
      requestId: request.id || '',
      requestName: request.name || 'Untitled Request',
      exportedAt: new Date().toISOString(),
      examples: request.examples || []
    };
    await writeTextFileAtomic(filePath, JSON.stringify(payload, null, 2), { prefix: 'postmeter-examples-export' });
    return fileOperationResult({ cancelled: false, path: filePath });
  });
}

module.exports = {
  registerWorkspaceIpc
};
