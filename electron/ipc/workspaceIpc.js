const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const os = require('node:os');
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
  MAX_ATTACHMENT_BYTES,
  mainOwnedFileBindingsForWorkspace,
  mergeRendererFileBindingMetadataWithMainPaths,
  normalizeSandboxFileBindings,
  sanitizeSandboxFileBindingsForRenderer
} = require('../../src/core/http/fileAttachmentBindings');
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

const IMPORT_TEXT_LIMIT = fieldLimit('body');

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
    env = process.env,
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

  function publicLoadResult(result) {
    if (!result?.workspace) {
      return result;
    }
    return {
      ...result,
      workspace: sanitizeWorkspaceForRenderer(result.workspace)
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
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
  });

  ipcMain.handle('workspace:save', async (_event, nextWorkspace) => {
    assertWorkspacePayload(nextWorkspace);
    const safeWorkspace = sanitizeRendererWorkspaceForSave(nextWorkspace, getWorkspace());
    assertWorkspacePayload(safeWorkspace);
    const workspace = await mutateWorkspace(async () => safeWorkspace);
    refreshApplicationMenu();
    assertWorkspaceLoadResultPayload(publicLoadResult(await getWorkspaceStore().describeCurrent(workspace)));
    return sanitizeWorkspaceForRenderer(workspace);
  });

  ipcMain.handle('workspace:saveRequest', async (_event, payload) => {
    assertWorkspaceRequestSavePayload(payload);
    const safePayload = sanitizeWorkspaceRequestSavePayload(payload, getWorkspace());
    assertWorkspaceRequestSavePayload(safePayload);
    const workspace = await mutateWorkspace(async (currentWorkspace) => applyRequestSaveToWorkspace(currentWorkspace, safePayload));
    refreshApplicationMenu();
    const requestContext = safePayload.authRefreshOwnerType
      ? findWorkspaceAuthRefreshRequestContext(
          workspace,
          safePayload.authRefreshOwnerType,
          safePayload.authRefreshOwnerType === 'performance' ? safePayload.performanceTestId : safePayload.runnerId,
          safePayload.requestId
        )
      : safePayload.runnerId
        ? findWorkspaceRunnerRequestContext(workspace, safePayload.runnerId, safePayload.requestId)
        : findWorkspaceRequestContext(workspace, safePayload.requestId);
    const result = {
      request: requestContext?.request || safePayload.request
    };
    if (Array.isArray(safePayload.collectionVariables)) {
      result.collectionVariables = requestContext?.collection?.variables || [];
    }
    if (Array.isArray(safePayload.cookies)) {
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
    const safeSettings = sanitizeRendererSettingsForSave(settings, getWorkspace());
    assertWorkspaceSettingsSavePayload(safeSettings);
    const workspace = await queueWorkspaceOperation(async () => {
      const currentWorkspace = getWorkspace();
      const workspaceWithSettings = applyWorkspaceSettingsSaveToWorkspace(currentWorkspace, safeSettings);
      const nextWorkspace = await saveWorkspace(workspaceWithSettings);
      setWorkspace(nextWorkspace);
      return nextWorkspace;
    });
    refreshApplicationMenu();
    onSettingsSaved(workspace.settings || {});
    const result = { settings: sanitizeSettingsForRenderer(workspace.settings || {}) };
    assertWorkspaceSettingsSaveResultPayload(result);
    return result;
  });

  ipcMain.handle('file-binding:choose', async (_event, payload = {}) => {
    const metadata = normalizeFileBindingPayload(payload);
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Bind Local File',
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    const filePath = selectedOpenFilePath(result);
    if (!filePath) {
      return { cancelled: true };
    }
    const binding = await persistMainOwnedFileBinding({
      ...metadata,
      localPath: validateDialogFilePath(filePath, 'file binding path'),
      fileName: metadata.fileName || path.basename(filePath),
      reviewedAt: new Date().toISOString()
    });
    return { cancelled: false, binding };
  });

  ipcMain.handle('file-binding:storeContent', async (_event, payload = {}) => {
    const metadata = normalizeFileBindingPayload(payload);
    const contentBase64 = String(payload?.contentBase64 || '');
    const body = Buffer.from(contentBase64, 'base64');
    if (body.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`File attachment ${metadata.source} cannot exceed ${MAX_ATTACHMENT_BYTES} bytes.`);
    }
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-file-binding-'));
    const filePath = path.join(directory, safeFilename(metadata.fileName || metadata.source || 'attachment.bin'));
    await fs.writeFile(filePath, body);
    const binding = await persistMainOwnedFileBinding({
      ...metadata,
      localPath: filePath,
      reviewedAt: new Date().toISOString()
    });
    return { cancelled: false, binding };
  });

  ipcMain.handle('local-file:storeContent', async (_event, payload = {}) => {
    const fileName = safeFilename(payload?.fileName || payload?.name || 'file');
    const purpose = normalizeLocalFilePurpose(payload?.purpose || payload?.contentKind);
    const contentBase64 = String(payload?.contentBase64 || '');
    const body = Buffer.from(contentBase64, 'base64');
    if (!body.length) {
      throw new Error('Local file content is required.');
    }
    if (body.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Local file ${fileName} cannot exceed ${MAX_ATTACHMENT_BYTES} bytes.`);
    }
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `postmeter-${purpose}-`));
    const filePath = path.join(directory, fileName);
    await fs.writeFile(filePath, body);
    const source = `postmeter-local-file/${purpose}/${crypto.randomBytes(16).toString('hex')}/${fileName}`;
    const binding = await persistMainOwnedFileBinding({
      contentType: String(payload?.contentType || '').slice(0, fieldLimit('value')),
      fileName,
      key: purpose,
      localPath: filePath,
      mode: 'file',
      reviewedAt: new Date().toISOString(),
      source
    });
    return { cancelled: false, binding };
  });

  async function persistMainOwnedFileBinding(binding) {
    const normalized = normalizeSandboxFileBindings([binding])[0];
    if (!normalized?.source || !normalized.localPath) {
      throw new Error('File binding requires a source and a main-selected local file.');
    }
    const workspace = await queueWorkspaceOperation(async () => {
      const currentWorkspace = getWorkspace();
      const currentLocalSettings = currentWorkspace?.localsettings || {};
      const currentSettings = currentWorkspace?.settings || {};
      const localFileBindings = [
        ...normalizeSandboxFileBindings(currentLocalSettings.sandbox?.fileBindings || []).filter((item) => item.source !== normalized.source),
        normalized
      ];
      const nextWorkspace = {
        ...currentWorkspace,
        localsettings: {
          ...currentLocalSettings,
          sandbox: {
            ...(currentLocalSettings.sandbox || {}),
            fileBindings: localFileBindings
          }
        },
        settings: {
          ...currentSettings,
          sandbox: {
            ...(currentSettings.sandbox || {}),
            fileBindings: [
              ...sanitizeSandboxFileBindingsForRenderer(currentSettings.sandbox?.fileBindings || []).filter((item) => item.source !== normalized.source),
              sanitizeSandboxFileBindingsForRenderer([normalized])[0]
            ]
          }
        }
      };
      const saved = await saveWorkspace(nextWorkspace);
      setWorkspace(saved);
      return saved;
    });
    refreshApplicationMenu();
    onSettingsSaved(workspace.settings || {});
    return sanitizeSandboxFileBindingsForRenderer([normalized])[0];
  }

  ipcMain.on('workspace:saveSync', (event, nextWorkspace) => {
    assertWorkspacePayload(nextWorkspace);
    const safeWorkspace = sanitizeRendererWorkspaceForSave(nextWorkspace, getWorkspace());
    assertWorkspacePayload(safeWorkspace);
    if (hasPendingWorkspaceOperations()) {
      event.returnValue = sanitizeWorkspaceForRenderer(getWorkspace());
      return;
    }
    const workspace = typeof saveWorkspaceSync === 'function'
      ? saveWorkspaceSync(safeWorkspace)
      : safeWorkspace;
    setWorkspace(workspace);
    refreshApplicationMenu();
    event.returnValue = sanitizeWorkspaceForRenderer(workspace);
  });

  ipcMain.handle('workspace:create', async () => {
    const createdWorkspaceId = await getWorkspaceStore().createWorkspace();
    refreshApplicationMenu();
    const result = await getWorkspaceStore().describeCurrent(getWorkspace(), { createdWorkspaceId });
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
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
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
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
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
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
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
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
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
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
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
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
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
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
    const publicResult = publicLoadResult(result);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
  });

  ipcMain.handle('workspace:duplicate', async (_event, workspaceId) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('workspaceId must be a non-empty string.');
    }
    const workspaceStore = getWorkspaceStore();
    const duplicatedWorkspaceId = await workspaceStore.duplicateWorkspace(workspaceId);
    const loaded = await workspaceStore.describeCurrent(getWorkspace(), { duplicatedWorkspaceId });
    const publicResult = publicLoadResult(loaded);
    assertWorkspaceLoadResultPayload(publicResult);
    return publicResult;
  });

  ipcMain.handle('workspace:import', async (_event, providedSource = null) => {
    try {
      const importSource = normalizeFileImportSource(providedSource, 'workspace import path', env);
      const filePath = importSource.text == null
        ? selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
          title: 'Import PostMeter Workspace',
          properties: ['openFile'],
          filters: jsonFilters()
        }))
        : '';
      if (!filePath && importSource.text == null) {
        return fileOperationResult({ cancelled: true });
      }
      const workspaceStore = getWorkspaceStore();
      const createdWorkspaceId = importSource.text == null
        ? await workspaceStore.importWorkspace(filePath)
        : await withTemporaryImportText(importSource, 'postmeter-workspace-import', (temporaryPath) => workspaceStore.importWorkspace(temporaryPath));
      const loaded = await workspaceStore.describeCurrent(getWorkspace(), { createdWorkspaceId });
      const publicLoaded = publicLoadResult(loaded);
      assertWorkspaceLoadResultPayload(publicLoaded);
      await recordDiagnosticEvent({
        type: 'workspace.import.completed',
        level: 'info',
        outcome: 'completed',
        fields: { importedWorkspace: true }
      });
      return fileOperationResult({ cancelled: false, ...publicLoaded });
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
    return fileOperationResult(safeFileOperationExportResult(exportedPath));
  });

  ipcMain.handle('collection:import', async (_event, providedSource = null) => {
    try {
      const importSource = normalizeFileImportSource(providedSource, 'collection import path', env);
      const filePath = importSource.text == null
        ? selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
          title: 'Import Collection',
          properties: ['openFile'],
          filters: collectionImportFilters()
        }))
        : '';
      if (!filePath && importSource.text == null) {
        return fileOperationResult({ cancelled: true });
      }
      const collection = importSource.text == null
        ? await getWorkspaceStore().importCollection(filePath)
        : await withTemporaryImportText(importSource, 'postmeter-collection-import', (temporaryPath) => getWorkspaceStore().importCollection(temporaryPath));
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
    return fileOperationResult(safeFileOperationExportResult(exportedPath));
  });

  ipcMain.handle('environment:import', async (_event, providedSource = null) => {
    const importSource = await readTextImportSource(providedSource, 'environment import path', async () => selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import Environment',
      properties: ['openFile'],
      filters: jsonFilters()
    })), { dialog, env, getMainWindow });
    if (!importSource) {
      return fileOperationResult({ cancelled: true });
    }
    const environment = importEnvironmentFromText(importSource.text);
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
    return fileOperationResult(safeFileOperationExportResult(filePath));
  });

  ipcMain.handle('runner:importDefinition', async (_event, providedSource = null) => {
    const importSource = await readTextImportSource(providedSource, 'runner import path', async () => selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import Runner',
      properties: ['openFile'],
      filters: jsonFilters()
    })), { dialog, env, getMainWindow });
    if (!importSource) {
      return fileOperationResult({ cancelled: true });
    }
    const runner = importRunnerFromText(importSource.text);
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
    return fileOperationResult(safeFileOperationExportResult(filePath));
  });

  ipcMain.handle('request:import', async (_event, source = {}) => {
    const normalizedSource = normalizeRequestImportSource(source, env);
    let content = normalizedSource.text;
    if (!content) {
      const filePath = selectedOpenFilePath(await dialog.showOpenDialog(getMainWindow(), {
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
    return fileOperationResult(safeFileOperationExportResult(filePath));
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

function sanitizeWorkspaceRequestSavePayload(payload = {}, currentWorkspace = {}) {
  const next = cloneJson(payload) || {};
  if (next.request && typeof next.request === 'object') {
    next.request = sanitizeRendererRequestForSave(next.request, currentWorkspace);
  }
  return next;
}

function sanitizeRendererRequestForSave(request = {}, currentWorkspace = {}) {
  const next = cloneJson(request) || {};
  if (next.auth && typeof next.auth === 'object') {
    next.auth = sanitizeRendererAuthFileReferences(next.auth, currentWorkspace);
  }
  return next;
}

function sanitizeRendererAuthFileReferences(auth = {}, currentWorkspace = {}) {
  const next = cloneJson(auth) || {};
  const allowedBindings = mainOwnedFileBindings(currentWorkspace);
  next.caPath = sanitizeMainOwnedFileReference(next.caPath, allowedBindings);
  next.certPath = sanitizeMainOwnedFileReference(next.certPath, allowedBindings);
  next.keyPath = sanitizeMainOwnedFileReference(next.keyPath, allowedBindings);
  next.pfxPath = sanitizeMainOwnedFileReference(next.pfxPath, allowedBindings);
  return next;
}

function normalizeRequestImportSource(source = {}, env = process.env) {
  if (typeof source === 'string') {
    throw new Error('request import path cannot be supplied by the renderer. Use the native file picker or provide bounded file contents.');
  }
  const value = source && typeof source === 'object' ? source : {};
  const text = typeof value.text === 'string' ? value.text : '';
  if (text.length > IMPORT_TEXT_LIMIT) {
    throw new Error(`request import content must be ${IMPORT_TEXT_LIMIT} characters or fewer.`);
  }
  if (typeof value.filePath === 'string' && value.filePath.trim()) {
    throw new Error('request import path cannot be supplied by the renderer. Use the native file picker or provide bounded file contents.');
  }
  return {
    filePath: '',
    text
  };
}

function normalizeFileImportSource(source, label, env = process.env) {
  if (source == null) {
    return { filePath: '', text: null, fileName: '' };
  }
  if (typeof source === 'string') {
    throw new Error(`${label} cannot be supplied by the renderer. Use the native file picker or provide bounded file contents.`);
  }
  const value = source && typeof source === 'object' ? source : {};
  if (typeof value.text === 'string') {
    if (value.text.length > IMPORT_TEXT_LIMIT) {
      throw new Error(`${label} content must be ${IMPORT_TEXT_LIMIT} characters or fewer.`);
    }
    return {
      filePath: '',
      text: value.text,
      fileName: safeFilename(value.fileName || value.name || 'import.json')
    };
  }
  if (typeof value.filePath === 'string' && value.filePath.trim()) {
    throw new Error(`${label} cannot be supplied by the renderer. Use the native file picker or provide bounded file contents.`);
  }
  return { filePath: '', text: null, fileName: '' };
}

async function readTextImportSource(source, label, chooseFilePath, options = {}) {
  const normalized = normalizeFileImportSource(source, label, options.env);
  if (normalized.text != null) {
    return normalized;
  }
  const filePath = await chooseFilePath();
  if (!filePath) {
    return null;
  }
  const text = await fs.readFile(validateDialogFilePath(filePath, label), 'utf8');
  if (text.length > IMPORT_TEXT_LIMIT) {
    throw new Error(`${label} content must be ${IMPORT_TEXT_LIMIT} characters or fewer.`);
  }
  return {
    filePath,
    text,
    fileName: path.basename(filePath)
  };
}

async function withTemporaryImportText(importSource, prefix, callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  try {
    const temporaryPath = path.join(directory, importSource.fileName || 'import.json');
    await fs.writeFile(temporaryPath, importSource.text, 'utf8');
    return await callback(temporaryPath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
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

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return value;
  }
}

function sanitizeWorkspaceForRenderer(workspace) {
  if (!workspaceHasSensitiveFileBindingPaths(workspace)) {
    return workspace;
  }
  const next = cloneJson(workspace);
  if (!next || typeof next !== 'object') {
    return next;
  }
  next.settings = sanitizeSettingsForRenderer(next.settings || {});
  next.localsettings = sanitizeLocalSettingsForRenderer(next.localsettings || {});
  return next;
}

function sanitizeSettingsForRenderer(settings = {}) {
  const next = cloneJson(settings) || {};
  if (next.sandbox && typeof next.sandbox === 'object') {
    next.sandbox.fileBindings = sanitizeSandboxFileBindingsForRenderer(next.sandbox.fileBindings || []);
  }
  return next;
}

function sanitizeLocalSettingsForRenderer(localsettings = {}) {
  const next = cloneJson(localsettings) || {};
  if (next.sandbox && typeof next.sandbox === 'object') {
    next.sandbox.fileBindings = sanitizeSandboxFileBindingsForRenderer(next.sandbox.fileBindings || []);
  }
  return next;
}

function sanitizeRendererWorkspaceForSave(workspace, currentWorkspace = {}) {
  const next = cloneJson(workspace) || {};
  next.settings = sanitizeRendererSettingsForSave(next.settings || {}, currentWorkspace);
  next.localsettings = sanitizeRendererLocalSettingsForSave(next.localsettings || {}, currentWorkspace);
  return next;
}

function sanitizeRendererSettingsForSave(settings = {}, currentWorkspace = {}) {
  const next = cloneJson(settings) || {};
  if (next.request && typeof next.request === 'object') {
    next.request = sanitizeRendererRequestSettingsForSave(next.request, currentWorkspace);
  }
    if (next.sandbox && typeof next.sandbox === 'object') {
      if (Object.hasOwn(next.sandbox, 'fileBindings')) {
        const mainBindings = mainOwnedFileBindings(currentWorkspace);
        next.sandbox.fileBindings = mergeRendererFileBindingMetadataWithMainPaths(next.sandbox.fileBindings || [], mainBindings);
      }
    if (next.sandbox.trustedCapabilities && typeof next.sandbox.trustedCapabilities === 'object') {
      next.sandbox.trustedCapabilities = sanitizeRendererTrustedCapabilitiesForSave(
        next.sandbox.trustedCapabilities,
        currentWorkspace
      );
    }
  }
  return next;
}

function sanitizeRendererLocalSettingsForSave(localsettings = {}, currentWorkspace = {}) {
  const next = cloneJson(localsettings) || {};
  if (next.request && typeof next.request === 'object') {
    next.request = sanitizeRendererRequestSettingsForSave(next.request, currentWorkspace);
  }
  if (next.sandbox && typeof next.sandbox === 'object') {
    if (Object.hasOwn(next.sandbox, 'fileBindings')) {
      next.sandbox.fileBindings = mergeRendererFileBindingMetadataWithMainPaths(next.sandbox.fileBindings || [], mainOwnedFileBindings(currentWorkspace));
    }
    next.sandbox.trustedCapabilities ||= {};
    next.sandbox.trustedCapabilities.vaultGrants = cloneJson(currentWorkspace?.localsettings?.sandbox?.trustedCapabilities?.vaultGrants || {});
  }
  next.security = cloneJson(currentWorkspace?.localsettings?.security || {});
  return next;
}

function sanitizeRendererRequestSettingsForSave(requestSettings = {}, currentWorkspace = {}) {
  const next = cloneJson(requestSettings) || {};
  const allowedBindings = mainOwnedFileBindings(currentWorkspace);
  next.caCertificatePath = sanitizeMainOwnedFileReference(next.caCertificatePath, allowedBindings);
  if (Array.isArray(next.clientCertificates)) {
    next.clientCertificates = next.clientCertificates.map((certificate) => {
      const safeCertificate = cloneJson(certificate) || {};
      safeCertificate.caPath = sanitizeMainOwnedFileReference(safeCertificate.caPath, allowedBindings);
      safeCertificate.certPath = sanitizeMainOwnedFileReference(safeCertificate.certPath, allowedBindings);
      safeCertificate.keyPath = sanitizeMainOwnedFileReference(safeCertificate.keyPath, allowedBindings);
      safeCertificate.pfxPath = sanitizeMainOwnedFileReference(safeCertificate.pfxPath, allowedBindings);
      return safeCertificate;
    });
  }
  return next;
}

function sanitizeMainOwnedFileReference(value, allowedBindings = []) {
  const reference = String(value || '').trim();
  if (!reference) {
    return '';
  }
  const bindings = normalizeSandboxFileBindings(allowedBindings);
  return bindings.some((binding) => binding.source === reference || binding.id === reference)
    ? reference
    : '';
}

function sanitizeRendererTrustedCapabilitiesForSave(trustedCapabilities = {}, currentWorkspace = {}) {
  const next = cloneJson(trustedCapabilities) || {};
  next.vaultGrants = cloneJson(currentWorkspace?.localsettings?.sandbox?.trustedCapabilities?.vaultGrants || {});
  return next;
}

function mainOwnedFileBindings(workspace = {}) {
  return mainOwnedFileBindingsForWorkspace(workspace);
}

function safeFileOperationExportResult(filePath) {
  const displayPath = path.basename(String(filePath || '')) || 'export';
  return {
    cancelled: false,
    path: displayPath,
    displayPath
  };
}

function workspaceHasSensitiveFileBindingPaths(workspace = {}) {
  return hasSensitiveFileBindingPaths(workspace.settings?.sandbox?.fileBindings)
    || hasSensitiveFileBindingPaths(workspace.localsettings?.sandbox?.fileBindings);
}

function hasSensitiveFileBindingPaths(bindings = []) {
  return Array.isArray(bindings) && bindings.some((binding) => (
    typeof binding?.localPath === 'string' && binding.localPath
      || typeof binding?.path === 'string' && binding.path
      || typeof binding?.filePath === 'string' && binding.filePath
  ));
}

function normalizeFileBindingPayload(payload = {}) {
  const source = String(payload?.source || payload?.src || '').trim().slice(0, fieldLimit('value'));
  if (!source) {
    throw new Error('File binding source is required.');
  }
  const mode = String(payload?.mode || 'file').trim().toLowerCase();
  return {
    source,
    mode: ['file', 'binary', 'formdata'].includes(mode) ? mode : 'file',
    key: String(payload?.key || '').slice(0, fieldLimit('key')),
    contentType: String(payload?.contentType || '').slice(0, fieldLimit('value')),
    fileName: String(payload?.fileName || payload?.name || path.basename(source) || 'file').slice(0, fieldLimit('name')),
    enabled: payload?.enabled !== false
  };
}

function normalizeLocalFilePurpose(value) {
  const purpose = String(value || 'file').trim().toLowerCase();
  if (purpose === 'certificate' || purpose === 'csv-variables') {
    return purpose;
  }
  return 'file';
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
