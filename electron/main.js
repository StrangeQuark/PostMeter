const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, safeStorage, shell } = require('electron');
const { WorkspaceRecoveryError } = require('../src/core/workspaceStore');
const { WorkspaceManager } = require('../src/core/workspaceManager');
const { AppSettingsStore } = require('../src/core/appSettingsStore');
const { normalizeWorkspaceLocalSettings } = require('../src/core/models');
const { EncryptedVaultStore } = require('../src/core/vaultStore');
const {
  LocalDiagnosticsLogger,
  redactText
} = require('../src/core/diagnostics');
const { fsyncDirectory, moveFileNoOverwrite } = require('../src/core/workspacePersistence');
const { registerAppProtocolHandler, registerAppProtocolScheme } = require('./appProtocol');
const { installApplicationMenu } = require('./appMenu');
const { registerAppIpc, releaseChannelForVersion, safeExternalUrl } = require('./appIpc');
const { createTrustedIpcMain } = require('./ipcSecurity');
const { createOAuthFlowController } = require('./oauthFlows');
const {
  applyWindowShortcutAction,
  createMainWindow,
  writeStartupSmokeFailureArtifacts
} = require('./mainWindow');
const {
  startupFailureDiagnosticEvent,
  workspaceRecoveryDiagnosticEvent
} = require('./mainDiagnostics');
const { registerSessionIpc } = require('./sessionIpc');
const { SessionStore, defaultSessionPath } = require('./sessionStore');
const { registerRuntimeIpc } = require('./runtimeIpc');
const { cleanupRuntimeResultStoreSync } = require('../src/core/runtimeResultStore');
const { registerSandboxPackageIpc } = require('./sandboxPackageIpc');
const { registerDiagnosticsIpc } = require('./diagnosticsIpc');
const { registerExportIpc } = require('./exportIpc');
const { registerWorkspaceIpc } = require('./workspaceIpc');
const { registerRequestIpc } = require('./requestIpc');
const { registerOAuthIpc } = require('./oauthIpc');
const {
  applyVaultPromptDecisionToWorkspace,
  createVaultPrompt,
  registerVaultPromptIpc,
  workspaceIdForVaultPromptDecision
} = require('./vaultPrompt');
const {
  assertFileOperationResultPayload,
  assertOAuthProgressPayload,
} = require('../src/core/ipcValidation');

let mainWindow;
let sessionStore;
let sessionState;
let workspaceStore;
let appSettingsStore;
let workspace;
const vaultStores = new Map();
const trustedIpcMain = createTrustedIpcMain(ipcMain);
const oauthFlows = createOAuthFlowController({ app, shell, emitProgress: emitOAuthProgress });
let diagnosticsLogger;
let runtimeIpcController;

registerAppProtocolScheme(protocol);

if (process.env.POSTMETER_DATA_PATH) {
  const smokeUserDataPath = path.join(path.dirname(path.resolve(process.env.POSTMETER_DATA_PATH)), 'userData');
  require('node:fs').mkdirSync(smokeUserDataPath, { recursive: true });
  app.setPath('userData', smokeUserDataPath);
}
process.env.POSTMETER_USER_DATA_PATH = app.getPath('userData');

const runtimeResultStorePath = path.join(app.getPath('userData'), 'runtime', 'postmeter-current-results.sqlite');

diagnosticsLogger = new LocalDiagnosticsLogger({
  logDirectory: path.join(app.getPath('userData'), 'diagnostics', 'logs'),
  settingsProvider: () => workspace?.settings?.diagnostics || {}
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.disableHardwareAcceleration();
if (process.env.POSTMETER_STARTUP_SMOKE === '1') {
  app.commandLine.appendSwitch('disable-gpu');
}

async function runSandboxRuntimeValidation() {
  try {
    const { validateSandboxRuntime } = require('../src/core/sandboxRuntimeValidation');
    await validateSandboxRuntime();
    console.log('PostMeter packaged sandbox runtime validation passed.');
    app.exit(0);
  } catch (error) {
    const message = error?.message || String(error);
    await recordDiagnosticEvent({
      type: 'app.sandbox-runtime-validation.failed',
      level: 'error',
      outcome: 'failed',
      failureCode: 'sandbox_runtime_validation_failed',
      fields: { error: message }
    });
    console.error(redactText(message));
    app.exit(1);
  }
}

function createWindow() {
  mainWindow = createMainWindow(app, {
    preloadPath: path.join(__dirname, 'preload.js'),
    getKeyboardShortcuts: () => workspace?.settings?.shortcuts || {},
    sendShortcutAction: sendMenuAction
  });
}

function sendMenuAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('menu:action', action);
}

function handleViewMenuAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  applyWindowShortcutAction(mainWindow, action);
}

function fileOperationResult(result) {
  assertFileOperationResultPayload(result);
  return result;
}

function refreshApplicationMenu() {
  installApplicationMenu({
    appName: app.name,
    includePrereleases: workspace?.settings?.updates?.includePrereleases === true,
    saveOnForceClose: workspace?.settings?.tabs?.saveOnForceClose === true,
    shortcuts: workspace?.settings?.shortcuts || {},
    platform: process.platform,
    sendMenuAction,
    handleViewMenuAction,
    openExternal: (url) => shell.openExternal(safeExternalUrl(url).toString())
  });
}

if (process.env.POSTMETER_VALIDATE_SANDBOX_RUNTIME === '1') {
  app.whenReady()
    .then(runSandboxRuntimeValidation)
    .catch((error) => failStartup(error, 'PostMeter sandbox runtime validation failed'));
} else {
  app.whenReady().then(startApplication).catch((error) => failStartup(error));
}

async function startApplication() {
  try {
    registerAppProtocolHandler(protocol);
    oauthFlows.registerProtocol();
    sessionStore = new SessionStore(defaultSessionPath(app.getPath('userData')));
    sessionState = await sessionStore.load();
    appSettingsStore = new AppSettingsStore();
    await appSettingsStore.load();
    workspaceStore = new WorkspaceManager();
    try {
      const loaded = await workspaceStore.load({ preferredWorkspaceId: sessionState.activeWorkspaceId });
      workspace = hydrateWorkspaceSettings(loaded.workspace, loaded.activeWorkspaceId);
      sessionState = await sessionStore.patch({ activeWorkspaceId: loaded.activeWorkspaceId });
    } catch (error) {
      if (error instanceof WorkspaceRecoveryError) {
        workspace = hydrateWorkspaceSettings(error.recoveredWorkspace, error.activeWorkspaceId || workspaceStore.getWorkspaceId());
        sessionState = await sessionStore.patch({ activeWorkspaceId: error.activeWorkspaceId || workspaceStore.getWorkspaceId() });
        await recordDiagnosticEvent(workspaceRecoveryDiagnosticEvent(error));
        dialog.showErrorBox('Workspace Recovered', error.message);
      } else {
        await failStartup(error, 'PostMeter could not open the workspace');
        return;
      }
    }
    refreshApplicationMenu();
    createWindow();
  } catch (error) {
    await failStartup(error);
  }
}

async function failStartup(error, title = 'PostMeter could not start') {
  const message = error?.message || String(error);
  await writeStartupSmokeFailureArtifacts(mainWindow, process.env, error);
  await recordDiagnosticEvent(startupFailureDiagnosticEvent(error, title));
  if (process.env.POSTMETER_STARTUP_SMOKE !== '1' && process.env.POSTMETER_VALIDATE_SANDBOX_RUNTIME !== '1') {
    dialog.showErrorBox(title, message);
  }
  app.exit(1);
}

app.on('second-instance', (_event, argv) => {
  const callbackUrl = oauthFlows.findCallbackArg(argv);
  if (callbackUrl) {
    oauthFlows.handleCallbackUrl(callbackUrl);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  oauthFlows.handleCallbackUrl(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  runtimeIpcController?.closeResultStore?.();
  cleanupRuntimeResultStoreSync(runtimeResultStorePath);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function saveWorkspace(nextWorkspace) {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  const nextSettings = await saveLocalSettings(nextWorkspace?.settings, workspaceId, nextWorkspace?.localsettings);
  const savedWorkspace = await workspaceStore.save(workspacePayloadForPersistence(nextWorkspace, nextSettings));
  return hydrateWorkspaceSettings(savedWorkspace);
}

function saveWorkspaceSync(nextWorkspace) {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  const nextSettings = saveLocalSettingsSync(nextWorkspace?.settings, workspaceId, nextWorkspace?.localsettings);
  const savedWorkspace = workspaceStore.saveSync(workspacePayloadForPersistence(nextWorkspace, nextSettings));
  return hydrateWorkspaceSettings(savedWorkspace);
}

function workspacePayloadForPersistence(nextWorkspace, nextSettings) {
  const { settings: _runtimeSettings, ...workspaceWithoutRuntimeSettings } = nextWorkspace && typeof nextWorkspace === 'object'
    ? nextWorkspace
    : {};
  return {
    ...workspaceWithoutRuntimeSettings,
    localsettings: normalizeWorkspaceLocalSettings(nextSettings)
  };
}

function hydrateWorkspaceSettings(nextWorkspace, workspaceId = workspaceStore?.getWorkspaceId?.() || '') {
  if (!nextWorkspace || typeof nextWorkspace !== 'object') {
    return nextWorkspace;
  }
  if (!appSettingsStore) {
    return nextWorkspace;
  }
  const localsettings = normalizeWorkspaceLocalSettings(nextWorkspace.localsettings || nextWorkspace.settings || {});
  const settings = appSettingsStore.settingsForWorkspace(workspaceId, localsettings);
  return {
    ...nextWorkspace,
    localsettings: normalizeWorkspaceLocalSettings(settings),
    settings
  };
}

async function saveLocalSettings(settings, workspaceId = workspaceStore?.getWorkspaceId?.() || '', fallbackLocalSettings = {}) {
  if (!appSettingsStore) {
    return workspace?.settings || {};
  }
  const settingsToSave = settings && typeof settings === 'object' ? settings : null;
  const localSettings = normalizeWorkspaceLocalSettings(settingsToSave || fallbackLocalSettings);
  if (settingsToSave) {
    await appSettingsStore.mergeWorkspaceSettings(workspaceId, settingsToSave);
  }
  return appSettingsStore.settingsForWorkspace(workspaceId, localSettings);
}

function saveLocalSettingsSync(settings, workspaceId = workspaceStore?.getWorkspaceId?.() || '', fallbackLocalSettings = {}) {
  if (!appSettingsStore) {
    return workspace?.settings || {};
  }
  const settingsToSave = settings && typeof settings === 'object' ? settings : null;
  const localSettings = normalizeWorkspaceLocalSettings(settingsToSave || fallbackLocalSettings);
  if (settingsToSave) {
    appSettingsStore.mergeWorkspaceSettingsSync(workspaceId, settingsToSave);
  }
  return appSettingsStore.settingsForWorkspace(workspaceId, localSettings);
}

async function renameLocalSettings(previousWorkspaceId, nextWorkspaceId) {
  if (!appSettingsStore) {
    return null;
  }
  return appSettingsStore.renameWorkspaceSettings(previousWorkspaceId, nextWorkspaceId);
}

async function deleteLocalSettings(workspaceId) {
  if (!appSettingsStore) {
    return null;
  }
  return appSettingsStore.deleteWorkspaceSettings(workspaceId);
}

function cloneWorkspace(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

let workspaceMutationQueue = Promise.resolve();
let pendingWorkspaceOperations = 0;

function enqueueWorkspaceOperation(operation) {
  pendingWorkspaceOperations += 1;
  const run = workspaceMutationQueue
    .catch(() => {})
    .then(async () => {
      try {
        return await operation();
      } finally {
        pendingWorkspaceOperations = Math.max(0, pendingWorkspaceOperations - 1);
      }
    });
  workspaceMutationQueue = run.catch(() => {});
  return run;
}

function hasPendingWorkspaceOperations() {
  return pendingWorkspaceOperations > 0;
}

function waitForPendingWorkspaceOperations() {
  return workspaceMutationQueue.catch(() => {});
}

function mutateWorkspace(mutator, options = {}) {
  const expectedWorkspaceId = typeof options.workspaceId === 'string' ? options.workspaceId : '';
  return enqueueWorkspaceOperation(async () => {
    if (
      expectedWorkspaceId &&
      typeof workspaceStore?.getWorkspaceId === 'function' &&
      workspaceStore.getWorkspaceId() !== expectedWorkspaceId
    ) {
      return workspace;
    }
    const workspaceDraft = cloneWorkspace(workspace);
    const nextWorkspace = await mutator(workspaceDraft);
    if (!nextWorkspace) {
      return workspace;
    }
    workspace = await saveWorkspace(nextWorkspace);
    return workspace;
  });
}

function emitOAuthProgress(id, progress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const payload = { id, ...progress };
  assertOAuthProgressPayload(payload);
  if (payload.status === 'failed' || payload.status === 'callbackRejected') {
    void recordDiagnosticEvent({
      type: 'oauth.progress.failed',
      level: 'warn',
      outcome: 'failed',
      failureCode: `oauth_${String(payload.status || 'failed').toLowerCase()}`,
      fields: {
        oauthType: payload.type,
        status: payload.status,
        message: payload.message || ''
      }
    });
  }
  mainWindow.webContents.send('oauth:progress', payload);
}

function vaultStoreForWorkspace(workspaceId) {
  const id = String(workspaceId || workspaceStore?.getWorkspaceId?.() || 'workspace');
  if (!vaultStores.has(id)) {
    vaultStores.set(id, new EncryptedVaultStore(
      vaultPathForWorkspace(id),
      electronSafeStorageProvider()
    ));
  }
  return vaultStores.get(id);
}

function vaultPathForWorkspace(workspaceId) {
  return path.join(app.getPath('userData'), 'vaults', `${workspaceVaultFilename(workspaceId)}.vault.json`);
}

async function persistVaultPromptDecision(decision, payload) {
  if (decision?.granted !== true && decision?.reset !== true) {
    return;
  }
  const promptWorkspaceId = workspaceIdForVaultPromptDecision(payload, workspaceStore?.getWorkspaceId?.() || '');
  await mutateWorkspace(async (currentWorkspace) => (
    applyVaultPromptDecisionToWorkspace(currentWorkspace, payload, decision)
  ), {
    workspaceId: promptWorkspaceId
  });
}

function workspaceVaultFilename(workspaceId) {
  return crypto.createHash('sha256').update(String(workspaceId || 'workspace')).digest('hex').slice(0, 32);
}

function electronSafeStorageProvider() {
  return {
    isAvailable: () => safeStorage?.isEncryptionAvailable?.() === true
      && safeStorage?.getSelectedStorageBackend?.() !== 'basic_text',
    encryptString: (value) => safeStorage.encryptString(String(value || '')),
    decryptString: (value) => safeStorage.decryptString(Buffer.from(value))
  };
}

async function renameVaultStore(previousWorkspaceId, nextWorkspaceId) {
  const previousId = String(previousWorkspaceId || '');
  const nextId = String(nextWorkspaceId || '');
  if (!previousId || !nextId || previousId === nextId) {
    return;
  }
  const previousPath = vaultPathForWorkspace(previousId);
  const nextPath = vaultPathForWorkspace(nextId);
  vaultStores.delete(previousId);
  vaultStores.delete(nextId);
  try {
    await fs.mkdir(path.dirname(nextPath), { recursive: true, mode: 0o700 });
    if (await fileExists(nextPath)) {
      throw new Error('Cannot rename workspace vault metadata because the destination vault already exists.');
    }
    await moveFileNoOverwrite(previousPath, nextPath);
    await fs.chmod(nextPath, 0o600).catch(() => {});
    await fsyncDirectory(path.dirname(nextPath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function deleteVaultStore(workspaceId) {
  const id = String(workspaceId || '');
  if (!id) {
    return;
  }
  vaultStores.delete(id);
  await fs.rm(vaultPathForWorkspace(id), { force: true });
  await fsyncDirectory(path.dirname(vaultPathForWorkspace(id)));
}

trustedIpcMain.handle('vault:metadata', async () => {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  const store = vaultStoreForWorkspace(workspaceId);
  const available = store.isAvailable?.() !== false;
  if (!available) {
    return { audit: [], available: false, secrets: [] };
  }
  return {
    audit: typeof store.listAudit === 'function' ? await store.listAudit() : [],
    available: true,
    secrets: typeof store.listMetadata === 'function' ? await store.listMetadata() : []
  };
});

trustedIpcMain.handle('vault:reset', async () => {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  await deleteVaultStore(workspaceId);
  await recordDiagnosticEvent({
    type: 'vault.reset.completed',
    level: 'warn',
    outcome: 'completed',
    fields: { workspaceScoped: true }
  });
  return { ok: true };
});

trustedIpcMain.handle('vault:bind-secret', async (_event, key, value) => {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  const store = vaultStoreForWorkspace(workspaceId);
  await store.set(key, value, { requestId: 'workspace-settings', requestName: 'Workspace vault binding' });
  await recordDiagnosticEvent({
    type: 'vault.secret.bound',
    level: 'info',
    outcome: 'completed',
    fields: { workspaceScoped: true }
  });
  return { ok: true };
});

trustedIpcMain.handle('vault:unset-secret', async (_event, key) => {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  const store = vaultStoreForWorkspace(workspaceId);
  await store.unset(key, { requestId: 'workspace-settings', requestName: 'Workspace vault binding' });
  await recordDiagnosticEvent({
    type: 'vault.secret.removed',
    level: 'info',
    outcome: 'completed',
    fields: { workspaceScoped: true }
  });
  return { ok: true };
});

registerVaultPromptIpc({ ipcMain: trustedIpcMain });
registerAppIpc({ app, clipboard, ipcMain: trustedIpcMain, recordDiagnosticEvent, shell });

registerOAuthIpc({ ipcMain: trustedIpcMain, oauthFlows, recordDiagnosticEvent });

registerSandboxPackageIpc({ ipcMain: trustedIpcMain, recordDiagnosticEvent });

registerDiagnosticsIpc({
  dialog,
  fileOperationResult,
  getAppInfo: () => ({
    name: app.name,
    releaseChannel: releaseChannelForVersion(app.getVersion()),
    version: app.getVersion()
  }),
  getMainWindow: () => mainWindow,
  getWorkspace: () => workspace,
  ipcMain: trustedIpcMain,
  logger: diagnosticsLogger,
  waitForPendingWorkspaceOperations
});

registerSessionIpc({
  getSession: () => sessionState,
  getSessionStore: () => sessionStore,
  ipcMain: trustedIpcMain,
  setSession: (nextSession) => {
    sessionState = nextSession;
  }
});

runtimeIpcController = registerRuntimeIpc({
  dialog,
  fileOperationResult,
  getMainWindow: () => mainWindow,
  getWorkspace: () => workspace,
  getWorkspaceId: () => workspaceStore?.getWorkspaceId?.() || '',
  getVaultStore: () => vaultStoreForWorkspace(workspaceStore?.getWorkspaceId?.() || ''),
  getVaultPrompt: () => createVaultPrompt({ dialog, getMainWindow: () => mainWindow, persistDecision: persistVaultPromptDecision, recordDiagnosticEvent }),
  ipcMain: trustedIpcMain,
  mutateWorkspace,
  recordDiagnosticEvent,
  resultStorePath: runtimeResultStorePath,
  saveWorkspace,
  setWorkspace: (nextWorkspace) => {
    workspace = nextWorkspace;
  }
});

registerExportIpc({
  dialog,
  fileOperationResult,
  getMainWindow: () => mainWindow,
  ipcMain: trustedIpcMain
});

registerWorkspaceIpc({
  dialog,
  fileOperationResult,
  getMainWindow: () => mainWindow,
  getWorkspace: () => workspace,
  getWorkspaceId: () => workspaceStore?.getWorkspaceId?.() || '',
  getWorkspaceStore: () => workspaceStore,
  hasPendingWorkspaceOperations,
  hydrateWorkspace: hydrateWorkspaceSettings,
  ipcMain: trustedIpcMain,
  queueWorkspaceOperation: enqueueWorkspaceOperation,
  recordDiagnosticEvent,
  refreshApplicationMenu,
  renameVaultStore,
  renameLocalSettings,
  deleteLocalSettings,
  saveLocalSettings,
  saveWorkspace,
  saveWorkspaceSync,
  setWorkspace: (nextWorkspace) => {
    workspace = nextWorkspace;
  },
  deleteVaultStore
});

registerRequestIpc({
  getWorkspace: () => workspace,
  getWorkspaceId: () => workspaceStore?.getWorkspaceId?.() || '',
  getVaultStore: () => vaultStoreForWorkspace(workspaceStore?.getWorkspaceId?.() || ''),
  getVaultPrompt: () => createVaultPrompt({ dialog, getMainWindow: () => mainWindow, persistDecision: persistVaultPromptDecision, recordDiagnosticEvent }),
  ipcMain: trustedIpcMain,
  mutateWorkspace,
  recordDiagnosticEvent,
  saveWorkspace,
  setWorkspace: (nextWorkspace) => {
    workspace = nextWorkspace;
  }
});

async function recordDiagnosticEvent(event = {}) {
  try {
    return await diagnosticsLogger.log(event);
  } catch (error) {
    if (process.env.POSTMETER_STARTUP_SMOKE === '1' || process.env.POSTMETER_VALIDATE_SANDBOX_RUNTIME === '1') {
      return null;
    }
    console.error(redactText(`Diagnostic log write failed: ${error?.message || String(error)}`));
    return null;
  }
}
