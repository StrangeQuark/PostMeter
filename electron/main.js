const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { WorkspaceRecoveryError } = require('../src/core/workspaceStore');
const { WorkspaceManager } = require('../src/core/workspaceManager');
const { installApplicationMenu } = require('./appMenu');
const { registerAppIpc, safeExternalUrl } = require('./appIpc');
const { createOAuthFlowController } = require('./oauthFlows');
const { createMainWindow } = require('./mainWindow');
const { registerSessionIpc } = require('./sessionIpc');
const { SessionStore, defaultSessionPath } = require('./sessionStore');
const { registerRuntimeIpc } = require('./runtimeIpc');
const { registerWorkspaceIpc } = require('./workspaceIpc');
const { registerRequestIpc } = require('./requestIpc');
const { registerOAuthIpc } = require('./oauthIpc');
const {
  assertFileOperationResultPayload,
  assertOAuthProgressPayload,
} = require('../src/core/ipcValidation');

let mainWindow;
let sessionStore;
let sessionState;
let workspaceStore;
let workspace;
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

function emitOAuthProgress(id, progress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const payload = { id, ...progress };
  assertOAuthProgressPayload(payload);
  mainWindow.webContents.send('oauth:progress', payload);
}

registerAppIpc({ app, ipcMain, shell });

registerOAuthIpc({ ipcMain, oauthFlows });

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
  ipcMain,
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
  getWorkspaceStore: () => workspaceStore,
  ipcMain,
  refreshApplicationMenu,
  saveWorkspace,
  saveWorkspaceSync,
  setWorkspace: (nextWorkspace) => {
    workspace = nextWorkspace;
  }
});

registerRequestIpc({
  getWorkspace: () => workspace,
  ipcMain,
  saveWorkspace,
  setWorkspace: (nextWorkspace) => {
    workspace = nextWorkspace;
  }
});
