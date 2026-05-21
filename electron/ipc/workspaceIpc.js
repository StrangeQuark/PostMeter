const fs = require('node:fs/promises');
const path = require('node:path');
const { fieldLimit } = require('../../src/core/contracts/payloadSchemas');
const {
  exportEnvironmentToJson,
  importEnvironmentFromText
} = require('../../src/core/import-export/environmentFormats');
const {
  exportRunnerToJson,
  importRunnerFromText
} = require('../../src/core/import-export/runnerFormats');
const {
  exportRequestByFormat,
  importRequestFromText
} = require('../../src/core/import-export/requestFormats');
const { writeTextFileAtomic } = require('../../src/core/workspace/workspacePersistence');
const { assertWorkspaceEncryptionKey } = require('../../src/core/workspace/workspaceEncryption');
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
} = require('../app-shell/fileDialogs');
const {
  assertCollectionExportFormat,
  assertCollectionPayload,
  assertEnvironmentPayload,
  assertRequestPayload,
  assertRunnerPayload,
  assertWorkspaceCollectionSavePayload,
  assertWorkspaceCollectionSaveResultPayload,
  assertWorkspaceEnvironmentSavePayload,
  assertWorkspaceEnvironmentSaveResultPayload,
  assertWorkspaceFolderSavePayload,
  assertWorkspaceFolderSaveResultPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspaceRequestSavePayload,
  assertWorkspaceRequestSaveResultPayload,
  assertWorkspaceSettingsSavePayload,
  assertWorkspaceSettingsSaveResultPayload,
  assertWorkspacePayload
} = require('../../src/core/contracts/ipcValidation');
const {
  applyCollectionSaveToWorkspace,
  applyEnvironmentSaveToWorkspace,
  applyFolderSaveToWorkspace,
  applyRequestSaveToWorkspace,
  applyWorkspaceSettingsSaveToWorkspace,
  findWorkspaceAuthRefreshRequestContext,
  findWorkspaceRunnerRequestContext,
  findWorkspaceRequestContext
} = require('../services/workspaceMutations');

function registerWorkspaceIpc(options = {}) {
  const {
    dialog,
    fileOperationResult,
    getMainWindow = () => undefined,
    getWorkspace,
    getWorkspaceId = () => '',
    getWorkspaceStore,
    hasPendingWorkspaceOperations = () => false,
    hydrateWorkspace = (workspace) => workspace,
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
    onSettingsSaved = () => {},
    renameLocalSettings = async () => {},
    renameVaultStore = async () => {},
    deleteLocalSettings = async () => {},
    saveLocalSettings = async (settings) => settings,
    saveWorkspace,
    saveWorkspaceSync,
    setWorkspace,
    deleteVaultStore = async () => {}
  } = options;

  function hydrateLoadResult(result) {
    if (!result?.workspace) {
      return result;
    }
    return {
      ...result,
      workspace: hydrateWorkspace(result.workspace, result.activeWorkspaceId || getWorkspaceId())
    };
  }

  ipcMain.handle('workspace:load', async () => {
    let workspace = getWorkspace();
    if (!workspace) {
      const loaded = await getWorkspaceStore().load();
      workspace = hydrateWorkspace(loaded.workspace, loaded.activeWorkspaceId || getWorkspaceId());
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
    const requestContext = payload.authRefreshOwnerType
      ? findWorkspaceAuthRefreshRequestContext(
          workspace,
          payload.authRefreshOwnerType,
          payload.authRefreshOwnerType === 'performance' ? payload.performanceTestId : payload.runnerId,
          payload.requestId
        )
      : payload.runnerId
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

  ipcMain.handle('workspace:saveCollection', async (_event, payload) => {
    assertWorkspaceCollectionSavePayload(payload);
    const workspace = await mutateWorkspace(async (currentWorkspace) => applyCollectionSaveToWorkspace(currentWorkspace, payload));
    refreshApplicationMenu();
    const collection = (workspace.collections || []).find((candidate) => candidate.id === payload.collectionId) || payload.collection;
    const result = { collection };
    assertWorkspaceCollectionSaveResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:saveFolder', async (_event, payload) => {
    assertWorkspaceFolderSavePayload(payload);
    const workspace = await mutateWorkspace(async (currentWorkspace) => applyFolderSaveToWorkspace(currentWorkspace, payload));
    refreshApplicationMenu();
    const collection = (workspace.collections || []).find((candidate) => candidate.id === payload.collectionId) || null;
    const folder = collection ? findFolderInCollection(collection, payload.folderId) : null;
    const result = { folder: folder || payload.folder };
    assertWorkspaceFolderSaveResultPayload(result);
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
    const workspace = await queueWorkspaceOperation(async () => {
      const currentWorkspace = getWorkspace();
      const workspaceWithSettings = applyWorkspaceSettingsSaveToWorkspace(currentWorkspace, settings);
      const nextWorkspace = await saveWorkspace(workspaceWithSettings);
      setWorkspace(nextWorkspace);
      return nextWorkspace;
    });
    refreshApplicationMenu();
    onSettingsSaved(workspace.settings || {});
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
      let localSettingsRenamed = false;
      try {
        renamed = await workspaceStore.renameWorkspace(workspaceId, trimmedName);
        if (renamed?.renamedWorkspaceId && renamed.renamedWorkspaceId !== workspaceId) {
          await renameLocalSettings(workspaceId, renamed.renamedWorkspaceId);
          localSettingsRenamed = true;
        }
        await renameVaultStore(workspaceId, renamed.renamedWorkspaceId || '');
        renamed = hydrateLoadResult(renamed);
      } catch (error) {
        if (localSettingsRenamed && renamed?.renamedWorkspaceId && renamed.renamedWorkspaceId !== workspaceId) {
          try {
            await renameLocalSettings(renamed.renamedWorkspaceId, workspaceId);
          } catch (rollbackError) {
            attachRollbackFailure(error, rollbackError);
          }
        }
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
      const switched = hydrateLoadResult(await getWorkspaceStore().switchWorkspace(workspaceId));
      setWorkspace(switched.workspace);
      return switched;
    });
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:unlock', async (_event, workspaceId, encryptionKey) => {
    const targetWorkspaceId = validateWorkspaceId(workspaceId);
    const key = validateWorkspaceEncryptionKey(encryptionKey);
    const result = await queueWorkspaceOperation(async () => {
      const unlocked = hydrateLoadResult(await getWorkspaceStore().unlockWorkspace(targetWorkspaceId, key));
      setWorkspace(unlocked.workspace);
      return unlocked;
    });
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:encrypt', async (_event, workspaceId, encryptionKey, nextWorkspace = null) => {
    const targetWorkspaceId = validateWorkspaceId(workspaceId);
    const key = validateWorkspaceEncryptionKey(encryptionKey);
    if (nextWorkspace) {
      assertWorkspacePayload(nextWorkspace);
    }
    const result = await queueWorkspaceOperation(async () => {
      const workspaceStore = getWorkspaceStore();
      const currentWorkspaceId = typeof workspaceStore.getWorkspaceId === 'function' ? workspaceStore.getWorkspaceId() : '';
      let workspaceForEncryption = nextWorkspace || getWorkspace();
      if (targetWorkspaceId === currentWorkspaceId && workspaceForEncryption) {
        const localSettings = await saveLocalSettings(
          workspaceForEncryption.settings,
          targetWorkspaceId,
          workspaceForEncryption.localsettings
        );
        workspaceForEncryption = {
          ...workspaceForEncryption,
          localsettings: localSettings
        };
      }
      const encrypted = hydrateLoadResult(await workspaceStore.encryptWorkspace(
        targetWorkspaceId,
        workspaceForEncryption,
        key
      ));
      if (targetWorkspaceId === currentWorkspaceId) {
        setWorkspace(encrypted.workspace);
      }
      return encrypted;
    });
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:removeEncryption', async (_event, workspaceId, encryptionKey) => {
    const targetWorkspaceId = validateWorkspaceId(workspaceId);
    const key = validateWorkspaceEncryptionKey(encryptionKey);
    const result = await queueWorkspaceOperation(async () => {
      const workspaceStore = getWorkspaceStore();
      const currentWorkspaceId = typeof workspaceStore.getWorkspaceId === 'function' ? workspaceStore.getWorkspaceId() : '';
      const decrypted = hydrateLoadResult(await workspaceStore.removeWorkspaceEncryption(
        targetWorkspaceId,
        key,
        getWorkspace()
      ));
      if (targetWorkspaceId === currentWorkspaceId) {
        setWorkspace(decrypted.workspace);
      }
      return decrypted;
    });
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(result);
    return result;
  });

  ipcMain.handle('workspace:resetEncryptionKey', async (_event, workspaceId, currentEncryptionKey, newEncryptionKey) => {
    const targetWorkspaceId = validateWorkspaceId(workspaceId);
    const currentKey = validateWorkspaceEncryptionKey(currentEncryptionKey);
    const newKey = validateWorkspaceEncryptionKey(newEncryptionKey);
    if (currentKey === newKey) {
      throw new Error('New workspace encryption key must be different from the current key.');
    }
    const result = await queueWorkspaceOperation(async () => {
      const workspaceStore = getWorkspaceStore();
      const currentWorkspaceId = typeof workspaceStore.getWorkspaceId === 'function' ? workspaceStore.getWorkspaceId() : '';
      const activeWorkspaceKey = typeof workspaceStore.encryptionKeyForWorkspace === 'function'
        ? workspaceStore.encryptionKeyForWorkspace(targetWorkspaceId)
        : '';
      if (targetWorkspaceId !== currentWorkspaceId) {
        throw new Error('Only the active workspace can have its encryption key reset. Switch to the workspace before resetting the key.');
      }
      if (
        typeof workspaceStore.isWorkspaceEncrypted === 'function'
        && !(await workspaceStore.isWorkspaceEncrypted(targetWorkspaceId))
      ) {
        throw new Error('Workspace is not encrypted.');
      }
      if (!activeWorkspaceKey) {
        throw new Error('Unlock workspace before resetting its encryption key.');
      }
      let workspaceForReset = getWorkspace();
      if (!workspaceForReset) {
        throw new Error('Unlock workspace before resetting its encryption key.');
      }
      const localSettings = await saveLocalSettings(
        workspaceForReset.settings,
        targetWorkspaceId,
        workspaceForReset.localsettings
      );
      workspaceForReset = {
        ...workspaceForReset,
        localsettings: localSettings
      };
      const reset = hydrateLoadResult(await workspaceStore.resetWorkspaceEncryptionKey(
        targetWorkspaceId,
        currentKey,
        newKey,
        workspaceForReset
      ));
      if (targetWorkspaceId === currentWorkspaceId) {
        setWorkspace(reset.workspace);
      }
      return reset;
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
        ? await workspaceStore.loadWorkspaceById(workspaceId).catch(() => null)
        : null;
      let deleted = null;
      try {
        deleted = hydrateLoadResult(await workspaceStore.deleteWorkspace(workspaceId));
        await deleteVaultStore(deleted.deletedWorkspaceId || workspaceId);
        await deleteLocalSettings(deleted.deletedWorkspaceId || workspaceId).catch(async (error) => {
          await recordDiagnosticEvent({
            type: 'workspace.local-settings-delete.failed',
            level: 'warn',
            outcome: 'failed',
            failureCode: 'local_settings_delete_failed',
            fields: { error: error?.message || String(error) }
          });
        });
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

  ipcMain.handle('workspace:export', async (_event, nextWorkspace, workspaceId, encryptionKey = '') => {
    if (nextWorkspace) {
      assertWorkspacePayload(nextWorkspace);
    }
    if (workspaceId != null && (typeof workspaceId !== 'string' || !workspaceId.trim())) {
      throw new Error('workspaceId must be a non-empty string when provided.');
    }
    const exportEncryptionKey = encryptionKey ? validateWorkspaceEncryptionKey(encryptionKey) : '';
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
      ? await getWorkspaceStore().exportWorkspaceById(workspaceId, filePath, { encryptionKey: exportEncryptionKey })
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

function validateWorkspaceId(workspaceId) {
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    throw new Error('workspaceId must be a non-empty string.');
  }
  return workspaceId;
}

function validateWorkspaceEncryptionKey(encryptionKey) {
  if (typeof encryptionKey !== 'string') {
    throw new Error('Workspace encryption key must be a string.');
  }
  if (encryptionKey.length > 1024) {
    throw new Error('Workspace encryption key must be 1024 characters or fewer.');
  }
  assertWorkspaceEncryptionKey(encryptionKey, 'Workspace encryption key');
  return encryptionKey;
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

function findFolderInCollection(collection, folderId) {
  for (const folder of collection?.folders || []) {
    const found = findFolderRecursive(folder, folderId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findFolderRecursive(folder, folderId) {
  if (folder?.id === folderId) {
    return folder;
  }
  for (const child of folder?.folders || []) {
    const found = findFolderRecursive(child, folderId);
    if (found) {
      return found;
    }
  }
  return null;
}

module.exports = {
  registerWorkspaceIpc
};
