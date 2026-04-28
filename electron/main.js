const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const { WorkspaceRecoveryError } = require('../src/core/workspaceStore');
const { WorkspaceManager } = require('../src/core/workspaceManager');
const { EncryptedVaultStore } = require('../src/core/vaultStore');
const { installApplicationMenu } = require('./appMenu');
const { registerAppIpc, safeExternalUrl } = require('./appIpc');
const { createOAuthFlowController } = require('./oauthFlows');
const { createMainWindow } = require('./mainWindow');
const { registerSessionIpc } = require('./sessionIpc');
const { SessionStore, defaultSessionPath } = require('./sessionStore');
const { registerRuntimeIpc } = require('./runtimeIpc');
const { registerSandboxPackageIpc } = require('./sandboxPackageIpc');
const { registerWorkspaceIpc } = require('./workspaceIpc');
const { registerRequestIpc } = require('./requestIpc');
const { registerOAuthIpc } = require('./oauthIpc');
const {
  applyVaultPromptDecisionToWorkspace,
  createVaultPrompt,
  registerVaultPromptIpc
} = require('./vaultPrompt');
const {
  assertFileOperationResultPayload,
  assertOAuthProgressPayload,
} = require('../src/core/ipcValidation');

let mainWindow;
let sessionStore;
let sessionState;
let workspaceStore;
let workspace;
const vaultStores = new Map();
const oauthFlows = createOAuthFlowController({ app, shell, emitProgress: emitOAuthProgress });

if (process.env.POSTMETER_DATA_PATH) {
  const smokeUserDataPath = path.join(path.dirname(path.resolve(process.env.POSTMETER_DATA_PATH)), 'userData');
  require('node:fs').mkdirSync(smokeUserDataPath, { recursive: true });
  app.setPath('userData', smokeUserDataPath);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.disableHardwareAcceleration();
if (process.env.POSTMETER_STARTUP_SMOKE === '1') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

async function runSandboxRuntimeValidation() {
  try {
    const { validateSandboxRuntime } = require('../src/core/sandboxRuntimeValidation');
    await validateSandboxRuntime();
    console.log('PostMeter packaged sandbox runtime validation passed.');
    app.exit(0);
  } catch (error) {
    console.error(error.message || String(error));
    app.exit(1);
  }
}

function createWindow() {
  mainWindow = createMainWindow(app, {
    preloadPath: path.join(__dirname, 'preload.js'),
    indexPath: path.join(__dirname, '..', 'src', 'renderer', 'index.html')
  });
}

function sendMenuAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('menu:action', action);
}

function fileOperationResult(result) {
  assertFileOperationResultPayload(result);
  return result;
}

function refreshApplicationMenu() {
  installApplicationMenu({
    appName: app.name,
    includePrereleases: workspace?.settings?.updates?.includePrereleases === true,
    platform: process.platform,
    sendMenuAction,
    openExternal: (url) => shell.openExternal(safeExternalUrl(url).toString())
  });
}

if (process.env.POSTMETER_VALIDATE_SANDBOX_RUNTIME === '1') {
  app.whenReady().then(runSandboxRuntimeValidation);
} else {
  app.whenReady().then(async () => {
  oauthFlows.registerProtocol();
  sessionStore = new SessionStore(defaultSessionPath(app.getPath('userData')));
  sessionState = await sessionStore.load();
  workspaceStore = new WorkspaceManager();
  try {
    const loaded = await workspaceStore.load({ preferredWorkspaceId: sessionState.activeWorkspaceId });
    workspace = loaded.workspace;
    sessionState = await sessionStore.patch({ activeWorkspaceId: loaded.activeWorkspaceId });
  } catch (error) {
    if (error instanceof WorkspaceRecoveryError) {
      workspace = error.recoveredWorkspace;
      sessionState = await sessionStore.patch({ activeWorkspaceId: error.activeWorkspaceId || workspaceStore.getWorkspaceId() });
      dialog.showErrorBox('Workspace Recovered', error.message);
    } else {
      dialog.showErrorBox('PostMeter could not open the workspace', error.message || String(error));
      app.quit();
      return;
    }
  }
  refreshApplicationMenu();
  createWindow();
  });
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

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function saveWorkspace(nextWorkspace) {
  return workspaceStore.save(nextWorkspace);
}

function saveWorkspaceSync(nextWorkspace) {
  return workspaceStore.saveSync(nextWorkspace);
}

let workspaceMutationQueue = Promise.resolve();

function enqueueWorkspaceOperation(operation) {
  const run = workspaceMutationQueue
    .catch(() => {})
    .then(operation);
  workspaceMutationQueue = run.catch(() => {});
  return run;
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
    const nextWorkspace = await mutator(workspace);
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
  await mutateWorkspace(async (currentWorkspace) => (
    applyVaultPromptDecisionToWorkspace(currentWorkspace, payload, decision)
  ), {
    workspaceId: workspaceStore?.getWorkspaceId?.() || ''
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
    await fs.rename(previousPath, nextPath);
    await fs.chmod(nextPath, 0o600).catch(() => {});
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    if (error?.code === 'EEXIST') {
      return;
    }
    throw error;
  }
}

async function deleteVaultStore(workspaceId) {
  const id = String(workspaceId || '');
  if (!id) {
    return;
  }
  vaultStores.delete(id);
  await fs.rm(vaultPathForWorkspace(id), { force: true });
}

ipcMain.handle('vault:metadata', async () => {
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

ipcMain.handle('vault:reset', async () => {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  await deleteVaultStore(workspaceId);
  return { ok: true };
});

ipcMain.handle('vault:bind-secret', async (_event, key, value) => {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  const store = vaultStoreForWorkspace(workspaceId);
  await store.set(key, value, { requestId: 'workspace-settings', requestName: 'Workspace vault binding' });
  return { ok: true };
});

ipcMain.handle('vault:unset-secret', async (_event, key) => {
  const workspaceId = workspaceStore?.getWorkspaceId?.() || '';
  const store = vaultStoreForWorkspace(workspaceId);
  await store.unset(key, { requestId: 'workspace-settings', requestName: 'Workspace vault binding' });
  return { ok: true };
});

registerVaultPromptIpc({ ipcMain });
registerAppIpc({ app, ipcMain, shell });

registerOAuthIpc({ ipcMain, oauthFlows });

registerSandboxPackageIpc({ ipcMain });

registerSessionIpc({
  getSession: () => sessionState,
  getSessionStore: () => sessionStore,
  ipcMain,
  setSession: (nextSession) => {
    sessionState = nextSession;
  }
});

registerRuntimeIpc({
  dialog,
  fileOperationResult,
  getMainWindow: () => mainWindow,
  getWorkspace: () => workspace,
  getWorkspaceId: () => workspaceStore?.getWorkspaceId?.() || '',
  getVaultStore: () => vaultStoreForWorkspace(workspaceStore?.getWorkspaceId?.() || ''),
  getVaultPrompt: () => createVaultPrompt({ dialog, getMainWindow: () => mainWindow, persistDecision: persistVaultPromptDecision }),
  ipcMain,
  mutateWorkspace,
  saveWorkspace,
  setWorkspace: (nextWorkspace) => {
    workspace = nextWorkspace;
  }
});

registerWorkspaceIpc({
  dialog,
  fileOperationResult,
  getMainWindow: () => mainWindow,
  getWorkspace: () => workspace,
  getWorkspaceId: () => workspaceStore?.getWorkspaceId?.() || '',
  getWorkspaceStore: () => workspaceStore,
  ipcMain,
  queueWorkspaceOperation: enqueueWorkspaceOperation,
  refreshApplicationMenu,
  renameVaultStore,
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
  getVaultPrompt: () => createVaultPrompt({ dialog, getMainWindow: () => mainWindow, persistDecision: persistVaultPromptDecision }),
  ipcMain,
  mutateWorkspace,
  saveWorkspace,
  setWorkspace: (nextWorkspace) => {
    workspace = nextWorkspace;
  }
});
