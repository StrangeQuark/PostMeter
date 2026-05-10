const fs = require('node:fs/promises');
const path = require('node:path');
const { fieldLimit } = require('../src/core/payloadSchemas');
const {
  exportEnvironmentToJson,
  importEnvironmentFromText
} = require('../src/core/environmentFormats');
const {
  exportRunnerToJson,
  importRunnerFromText
} = require('../src/core/runnerFormats');
const {
  exportRequestByFormat,
  importRequestFromText
} = require('../src/core/requestFormats');
const { writeTextFileAtomic } = require('../src/core/workspacePersistence');
const {
  collectionExportExtension,
  collectionExportFilters,
  collectionImportFilters,
  jsonFilters,
  requestExportExtension,
  requestExportFilters,
  requestImportFilters,
  safeFilename,
  selectedOpenFilePath,
  selectedSaveFilePath,
  validateDialogFilePath
} = require('./fileDialogs');
const {
  assertCollectionExportFormat,
  assertCollectionPayload,
  assertEnvironmentPayload,
  assertRequestPayload,
  assertRunnerPayload,
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
  findWorkspaceRunnerRequestContext,
  findWorkspaceRequestContext
} = require('./workspaceMutations');

function registerWorkspaceIpc(options = {}) {
  const {
    dialog,
    fileOperationResult,
    getMainWindow = () => undefined,
    getWorkspace,
    getWorkspaceStore,
    hasPendingWorkspaceOperations = () => false,
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
    recordDiagnosticEvent = async () => {},
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
    const requestContext = payload.runnerId
      ? findWorkspaceRunnerRequestContext(workspace, payload.runnerId, payload.requestId)
      : findWorkspaceRequestContext(workspace, payload.requestId);
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
    if (hasPendingWorkspaceOperations()) {
      event.returnValue = getWorkspace();
      return;
    }
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
      let renamed = null;
      try {
        renamed = await workspaceStore.renameWorkspace(workspaceId, trimmedName);
        await renameVaultStore(workspaceId, renamed.renamedWorkspaceId || '');
      } catch (error) {
        if (renamed?.renamedWorkspaceId && renamed.renamedWorkspaceId !== workspaceId) {
          try {
            await rollbackWorkspaceRename(workspaceStore, renamed.renamedWorkspaceId, workspaceId);
          } catch (rollbackError) {
            attachRollbackFailure(error, rollbackError);
          }
        }
        throw error;
      }
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
    const workspaceStore = getWorkspaceStore();
    const originalCurrentWorkspaceId = typeof workspaceStore.getWorkspaceId === 'function' ? workspaceStore.getWorkspaceId() : '';
    const result = await queueWorkspaceOperation(async () => {
      const deletedWorkspaceSnapshot = typeof workspaceStore.loadWorkspaceById === 'function'
        ? await workspaceStore.loadWorkspaceById(workspaceId)
        : null;
      let deleted = null;
      try {
        deleted = await workspaceStore.deleteWorkspace(workspaceId);
        await deleteVaultStore(deleted.deletedWorkspaceId || workspaceId);
      } catch (error) {
        if (deletedWorkspaceSnapshot && deleted?.deletedWorkspaceId && typeof workspaceStore.restoreWorkspaceFile === 'function') {
          try {
            await workspaceStore.restoreWorkspaceFile(deleted.deletedWorkspaceId, deletedWorkspaceSnapshot, {
              currentWorkspaceId: originalCurrentWorkspaceId
            });
          } catch (rollbackError) {
            attachRollbackFailure(error, rollbackError);
          }
        }
        throw error;
      }
      setWorkspace(deleted.workspace);
      return deleted;
    });
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:duplicate', async (_event, workspaceId) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('workspaceId must be a non-empty string.');
    }
    const workspaceStore = getWorkspaceStore();
    const duplicatedWorkspaceId = await workspaceStore.duplicateWorkspace(workspaceId);
    const loaded = await workspaceStore.describeCurrent(getWorkspace(), { duplicatedWorkspaceId });
    assertWorkspaceLoadResultPayload(loaded);
    return loaded;
  });

  ipcMain.handle('workspace:import', async (_event, providedFilePath = null) => {
    try {
      const filePath = providedFilePath == null
        ? selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
          title: 'Import PostMeter Workspace',
          properties: ['openFile'],
          filters: jsonFilters()
        }))
        : validateDialogFilePath(providedFilePath, 'workspace import path');
      if (!filePath) {
        return fileOperationResult({ cancelled: true });
      }
      const workspaceStore = getWorkspaceStore();
      const createdWorkspaceId = await workspaceStore.importWorkspace(filePath);
      const loaded = await workspaceStore.describeCurrent(getWorkspace(), { createdWorkspaceId });
      assertWorkspaceLoadResultPayload(loaded);
      await recordDiagnosticEvent({
        type: 'workspace.import.completed',
        level: 'info',
        outcome: 'completed',
        fields: { importedWorkspace: true }
      });
      return fileOperationResult({ cancelled: false, ...loaded });
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'workspace.import.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: 'workspace_import_failed',
        fields: { error: error?.message || String(error) }
      });
      throw error;
    }
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

  ipcMain.handle('collection:import', async (_event, providedFilePath = null) => {
    try {
      const filePath = providedFilePath == null
        ? selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
          title: 'Import Collection',
          properties: ['openFile'],
          filters: collectionImportFilters()
        }))
        : validateDialogFilePath(providedFilePath, 'collection import path');
      if (!filePath) {
        return fileOperationResult({ cancelled: true });
      }
      const collection = await getWorkspaceStore().importCollection(filePath);
      await recordDiagnosticEvent({
        type: 'collection.import.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          folderCount: countFolders(collection),
          requestCount: countRequests(collection)
        }
      });
      return fileOperationResult({ cancelled: false, collection });
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'collection.import.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: 'collection_import_failed',
        fields: { error: error?.message || String(error) }
      });
      throw error;
    }
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

  ipcMain.handle('environment:import', async (_event, providedFilePath = null) => {
    const filePath = providedFilePath == null
      ? selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
        title: 'Import Environment',
        properties: ['openFile'],
        filters: jsonFilters()
      }))
      : validateDialogFilePath(providedFilePath, 'environment import path');
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const environment = importEnvironmentFromText(await fs.readFile(filePath, 'utf8'));
    assertEnvironmentPayload(environment);
    return fileOperationResult({ cancelled: false, environment });
  });

  ipcMain.handle('environment:export', async (_event, environment, format = 'postmeter') => {
    assertEnvironmentPayload(environment);
    assertEnvironmentExportFormat(format);
    const extension = environmentExportExtension(format);
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Environment',
      defaultPath: `${safeFilename(environment?.name || 'environment')}.${extension}`,
      filters: [
        { name: `${format === 'postman' ? 'Postman' : 'PostMeter'} Environment`, extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    const filePath = selectedSaveFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    await writeTextFileAtomic(filePath, exportEnvironmentToJson(environment, format), { prefix: 'postmeter-environment-export' });
    return fileOperationResult({ cancelled: false, path: filePath });
  });

  ipcMain.handle('runner:importDefinition', async (_event, providedFilePath = null) => {
    const filePath = providedFilePath == null
      ? selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
        title: 'Import Runner',
        properties: ['openFile'],
        filters: jsonFilters()
      }))
      : validateDialogFilePath(providedFilePath, 'runner import path');
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    const runner = importRunnerFromText(await fs.readFile(filePath, 'utf8'));
    assertRunnerPayload(runner);
    return fileOperationResult({ cancelled: false, runner });
  });

  ipcMain.handle('runner:exportDefinition', async (_event, runner, format = 'postmeter') => {
    assertRunnerPayload(runner);
    if (format !== 'postmeter') {
      throw new Error('Runner definitions can only be exported as PostMeter JSON.');
    }
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Runner',
      defaultPath: `${safeFilename(runner?.name || 'runner')}.postmeter-runner.json`,
      filters: [
        { name: 'PostMeter Runner', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    const filePath = selectedSaveFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    await writeTextFileAtomic(filePath, exportRunnerToJson(runner), { prefix: 'postmeter-runner-definition-export' });
    return fileOperationResult({ cancelled: false, path: filePath });
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

  ipcMain.handle('request:import', async (_event, source = {}) => {
    const normalizedSource = normalizeRequestImportSource(source);
    let content = normalizedSource.text;
    if (!content) {
      const filePath = normalizedSource.filePath || selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
        title: 'Import Request',
        properties: ['openFile'],
        filters: requestImportFilters()
      }));
      if (!filePath) {
        return fileOperationResult({ cancelled: true });
      }
      content = await fs.readFile(validateDialogFilePath(filePath, 'request import path'), 'utf8');
    }
    const request = importRequestFromText(content);
    assertRequestPayload(request);
    return fileOperationResult({ cancelled: false, request });
  });

  ipcMain.handle('request:export', async (_event, request, format = 'postmeter') => {
    assertRequestPayload(request);
    assertRequestExportFormat(format);
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Request',
      defaultPath: `${safeFilename(request?.name || 'request')}.${requestExportExtension(format)}`,
      filters: requestExportFilters(format)
    });
    const filePath = selectedSaveFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    await writeTextFileAtomic(filePath, exportRequestByFormat(request, format), { prefix: 'postmeter-request-export' });
    return fileOperationResult({ cancelled: false, path: filePath });
  });

  ipcMain.handle('request:exportText', async (_event, request, format = 'postmeter') => {
    assertRequestPayload(request);
    assertRequestExportFormat(format);
    return {
      format: String(format || 'postmeter'),
      content: exportRequestByFormat(request, format)
    };
  });
}

function normalizeRequestImportSource(source = {}) {
  if (typeof source === 'string') {
    return { filePath: validateDialogFilePath(source, 'request import path'), text: '' };
  }
  const value = source && typeof source === 'object' ? source : {};
  return {
    filePath: typeof value.filePath === 'string' && value.filePath.trim()
      ? validateDialogFilePath(value.filePath, 'request import path')
      : '',
    text: typeof value.text === 'string' ? value.text : ''
  };
}

function assertRequestExportFormat(format) {
  if (!['postmeter', 'curl'].includes(String(format || ''))) {
    throw new Error('Request export format must be postmeter or curl.');
  }
}

function countRequests(collection = {}) {
  let count = Array.isArray(collection.requests) ? collection.requests.length : 0;
  for (const folder of collection.folders || []) {
    count += countRequests(folder);
  }
  return count;
}

function countFolders(collection = {}) {
  let count = Array.isArray(collection.folders) ? collection.folders.length : 0;
  for (const folder of collection.folders || []) {
    count += countFolders(folder);
  }
  return count;
}

function assertEnvironmentExportFormat(format) {
  if (!['postmeter', 'postman'].includes(String(format || ''))) {
    throw new Error('Environment export format must be postmeter or postman.');
  }
}

function environmentExportExtension(format) {
  return format === 'postman' ? 'postman_environment.json' : 'postmeter-environment.json';
}

async function rollbackWorkspaceRename(workspaceStore, renamedWorkspaceId, originalWorkspaceId) {
  if (typeof workspaceStore.renameWorkspace !== 'function') {
    throw new Error('Workspace rename rollback is unavailable.');
  }
  await workspaceStore.renameWorkspace(renamedWorkspaceId, workspaceDisplayNameFromId(originalWorkspaceId));
}

function workspaceDisplayNameFromId(workspaceId) {
  const basename = path.basename(String(workspaceId || 'Workspace'));
  const extension = path.extname(basename);
  return path.basename(basename, extension) || 'Workspace';
}

function attachRollbackFailure(error, rollbackError) {
  if (error && typeof error === 'object') {
    error.rollbackError = rollbackError;
    return error;
  }
  const wrapped = new Error(String(error || 'Workspace operation failed.'));
  wrapped.rollbackError = rollbackError;
  return wrapped;
}

module.exports = {
  registerWorkspaceIpc
};
