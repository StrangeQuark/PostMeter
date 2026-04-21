const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { sendRequest, validateRequest } = require('../src/core/httpClient');
const { loadTestResultToCsv, runLoadTest } = require('../src/core/loadTestRunner');
const { WorkspaceRecoveryError, WorkspaceStore } = require('../src/core/workspaceStore');
const { historyEntry } = require('../src/core/models');
const {
  assertCollectionPayload,
  assertExportFormat,
  assertLoadConfigPayload,
  assertLoadId,
  assertLoadResultPayload,
  assertOptionalEnvironmentPayload,
  assertRequestPayload,
  assertWorkspacePayload
} = require('../src/core/ipcValidation');

let mainWindow;
let workspaceStore;
let workspace;
const activeLoadTests = new Map();

app.disableHardwareAcceleration();
if (process.env.POSTMETER_STARTUP_SMOKE === '1') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    title: 'PostMeter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  if (process.env.POSTMETER_STARTUP_SMOKE === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 250);
    });
  }
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  workspaceStore = new WorkspaceStore();
  try {
    const loaded = await workspaceStore.load();
    workspace = loaded.workspace;
  } catch (error) {
    if (error instanceof WorkspaceRecoveryError) {
      workspace = error.recoveredWorkspace;
      dialog.showErrorBox('Workspace Recovered', error.message);
    } else {
      throw error;
    }
  }
  createWindow();
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

ipcMain.handle('app:versions', () => ({
  app: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node
}));

ipcMain.handle('workspace:load', () => ({
  workspace,
  path: workspaceStore.getWorkspacePath()
}));

ipcMain.handle('workspace:save', async (_event, nextWorkspace) => {
  assertWorkspacePayload(nextWorkspace);
  workspace = await workspaceStore.save(nextWorkspace);
  return workspace;
});

ipcMain.handle('workspace:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import PostMeter Workspace',
    properties: ['openFile'],
    filters: jsonFilters()
  });
  if (result.canceled || !result.filePaths.length) {
    return { cancelled: true };
  }
  const backupPath = await workspaceStore.backupCurrentWorkspace('pre-workspace-import.backup');
  workspace = await workspaceStore.importWorkspace(result.filePaths[0]);
  workspace = await workspaceStore.save(workspace);
  return { cancelled: false, workspace, backupPath };
});

ipcMain.handle('workspace:export', async (_event, nextWorkspace) => {
  if (nextWorkspace) {
    assertWorkspacePayload(nextWorkspace);
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PostMeter Workspace',
    defaultPath: 'postmeter-workspace.postmeter.json',
    filters: jsonFilters()
  });
  if (result.canceled || !result.filePath) {
    return { cancelled: true };
  }
  const exportedPath = await workspaceStore.exportWorkspace(nextWorkspace || workspace, result.filePath);
  return { cancelled: false, path: exportedPath };
});

ipcMain.handle('collection:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Collection',
    properties: ['openFile'],
    filters: jsonFilters()
  });
  if (result.canceled || !result.filePaths.length) {
    return { cancelled: true };
  }
  const collection = await workspaceStore.importCollection(result.filePaths[0]);
  return { cancelled: false, collection };
});

ipcMain.handle('collection:export', async (_event, collection) => {
  assertCollectionPayload(collection);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Collection',
    defaultPath: `${safeFilename(collection?.name || 'collection')}.postmeter.json`,
    filters: jsonFilters()
  });
  if (result.canceled || !result.filePath) {
    return { cancelled: true };
  }
  const exportedPath = await workspaceStore.exportCollection(collection, result.filePath);
  return { cancelled: false, path: exportedPath };
});

ipcMain.handle('request:validate', (_event, request, environment) => {
  assertRequestPayload(request);
  assertOptionalEnvironmentPayload(environment);
  return validateRequest(request, environment);
});

ipcMain.handle('request:send', async (_event, request, environment) => {
  assertRequestPayload(request);
  assertOptionalEnvironmentPayload(environment);
  const result = await sendRequest(request, environment);
  workspace.history = [
    historyEntry({
      method: request.method,
      url: result.finalUrl,
      statusCode: result.statusCode,
      durationMillis: result.durationMillis
    }),
    ...(workspace.history || [])
  ].slice(0, 100);
  await workspaceStore.save(workspace);
  return result;
});

ipcMain.handle('load:start', async (event, id, request, environment, config) => {
  assertLoadId(id);
  assertRequestPayload(request);
  assertOptionalEnvironmentPayload(environment);
  assertLoadConfigPayload(config);
  const abortController = new AbortController();
  activeLoadTests.set(id, abortController);
  try {
    return await runLoadTest(request, environment, config, {
      abortController,
      onProgress: (progress) => {
        event.sender.send('load:progress', { id, progress });
      }
    });
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

ipcMain.handle('load:export', async (_event, result, format) => {
  assertLoadResultPayload(result);
  assertExportFormat(format);
  const extension = format === 'csv' ? 'csv' : 'json';
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: `Export Load Test ${extension.toUpperCase()}`,
    defaultPath: `postmeter-load-test.${extension}`,
    filters: [
      { name: extension.toUpperCase(), extensions: [extension] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { cancelled: true };
  }
  const fs = require('node:fs/promises');
  const content = format === 'csv' ? loadTestResultToCsv(result) : JSON.stringify(result, null, 2);
  await fs.writeFile(saveResult.filePath, content);
  return { cancelled: false, path: saveResult.filePath };
});

function jsonFilters() {
  return [
    { name: 'JSON', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function safeFilename(value) {
  const filename = String(value || 'collection').trim().replace(/[^A-Za-z0-9._-]+/g, '-');
  return filename || 'collection';
}
