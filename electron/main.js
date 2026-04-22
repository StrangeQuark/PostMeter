const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } = require('electron');
const { sendRequest, validateRequest } = require('../src/core/httpClient');
const {
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  pollOAuthDeviceToken,
  requestOAuthDeviceAuthorization
} = require('../src/core/auth');
const { loadTestResultToCsv, runLoadTest } = require('../src/core/loadTestRunner');
const { collectionRunResultToCsv, runCollection } = require('../src/core/collectionRunner');
const { checkForUpdates } = require('../src/core/updateChecker');
const { WorkspaceRecoveryError, WorkspaceStore } = require('../src/core/workspaceStore');
const { historyEntry, walkRequests } = require('../src/core/models');
const { PassphraseRequiredError, createElectronSecretCodec } = require('./secretCodec');
const {
  exportSecretConfirmationPhrase,
  matchesExportSecretConfirmation
} = require('./exportConfirmation');
const { promptForPassphrase } = require('./passphrasePrompt');
const { promptForSecretExportConfirmation } = require('./secretExportPrompt');
const {
  assertAuthPayload,
  assertCollectionExportFormat,
  assertCollectionPayload,
  assertCollectionRunResultPayload,
  assertExternalUrlPayload,
  assertExportFormat,
  assertLoadConfigPayload,
  assertLoadId,
  assertLoadResultPayload,
  assertOptionalEnvironmentPayload,
  assertResponsePayload,
  assertRequestPayload,
  assertUpdateCheckOptionsPayload,
  assertWorkspaceLoadResultPayload,
  assertWorkspacePayload
} = require('../src/core/ipcValidation');

let mainWindow;
let workspaceStore;
let workspace;
let secretCodec;
const activeLoadTests = new Map();
const activeCollectionRuns = new Map();
const activeOAuthFlows = new Map();
const OAUTH_CUSTOM_SCHEME = 'postmeter';
const OAUTH_CALLBACK_TIMEOUT_MILLIS = 5 * 60 * 1000;

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
  const isUiWorkflowSmoke = process.env.POSTMETER_UI_WORKFLOW_SMOKE === '1';
  const isUiRegressionSmoke = process.env.POSTMETER_UI_REGRESSION_SMOKE === '1';
  const isUiSnapshotSmoke = process.env.POSTMETER_UI_SNAPSHOT_SMOKE === '1';
  const isUiOauthSmoke = process.env.POSTMETER_UI_OAUTH_SMOKE === '1';
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
  if (isUiWorkflowSmoke) {
    const timeout = setTimeout(() => {
      console.error('PostMeter UI workflow smoke timed out.');
      app.exit(1);
    }, 15_000);
    mainWindow.webContents.on('page-title-updated', (event, title) => {
      if (!String(title).startsWith('PostMeter UI Workflow:')) {
        return;
      }
      event.preventDefault();
      clearTimeout(timeout);
      if (title === 'PostMeter UI Workflow:PASS') {
        app.quit();
        return;
      }
      console.error(title);
      app.exit(1);
    });
  }
  if (isUiRegressionSmoke) {
    const timeout = setTimeout(() => {
      console.error('PostMeter UI regression smoke timed out.');
      app.exit(1);
    }, 10_000);
    mainWindow.webContents.on('page-title-updated', (event, title) => {
      if (!String(title).startsWith('PostMeter UI Regression:')) {
        return;
      }
      event.preventDefault();
      clearTimeout(timeout);
      if (title === 'PostMeter UI Regression:PASS') {
        app.quit();
        return;
      }
      console.error(title);
      app.exit(1);
    });
  }
  if (isUiSnapshotSmoke) {
    bindUiSnapshotSmoke();
  }
  if (isUiOauthSmoke) {
    const timeout = setTimeout(() => {
      console.error('PostMeter UI OAuth smoke timed out.');
      app.exit(1);
    }, 20_000);
    mainWindow.webContents.on('page-title-updated', (event, title) => {
      if (!String(title).startsWith('PostMeter UI OAuth:')) {
        return;
      }
      event.preventDefault();
      clearTimeout(timeout);
      if (title === 'PostMeter UI OAuth:PASS') {
        app.quit();
        return;
      }
      console.error(title);
      app.exit(1);
    });
  }
  const loadOptions = isUiWorkflowSmoke || isUiRegressionSmoke || isUiSnapshotSmoke || isUiOauthSmoke
    ? {
        query: {
          uiWorkflowSmoke: isUiWorkflowSmoke ? '1' : '',
          uiRegressionSmoke: isUiRegressionSmoke ? '1' : '',
          uiSnapshotSmoke: isUiSnapshotSmoke ? '1' : '',
          uiOauthSmoke: isUiOauthSmoke ? '1' : '',
          uiWorkflowBaseUrl: process.env.POSTMETER_UI_WORKFLOW_BASE_URL || '',
          uiOauthBaseUrl: process.env.POSTMETER_UI_OAUTH_BASE_URL || ''
        }
      }
    : undefined;
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), loadOptions);
}

function bindUiSnapshotSmoke() {
  const expectedCaptures = new Set(['request', 'context-menu', 'cookies', 'auth-oauth', 'response', 'runner', 'load', 'export-menu']);
  const captured = new Set();
  const timeout = setTimeout(() => {
    console.error('PostMeter UI snapshot smoke timed out.');
    app.exit(1);
  }, 20_000);
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    if (!String(title).startsWith('PostMeter UI Snapshot:')) {
      return;
    }
    event.preventDefault();
    if (title === 'PostMeter UI Snapshot:PASS') {
      const missing = [...expectedCaptures].filter((label) => !captured.has(label));
      clearTimeout(timeout);
      if (missing.length) {
        console.error(`PostMeter UI snapshot smoke missed captures: ${missing.join(', ')}`);
        app.exit(1);
        return;
      }
      app.quit();
      return;
    }
    if (String(title).startsWith('PostMeter UI Snapshot:FAIL:')) {
      clearTimeout(timeout);
      console.error(title);
      app.exit(1);
      return;
    }
    const prefix = 'PostMeter UI Snapshot:CAPTURE:';
    if (!String(title).startsWith(prefix)) {
      return;
    }
    const label = safeFilename(String(title).slice(prefix.length));
    captureUiSnapshot(label)
      .then(() => {
        captured.add(label);
        return mainWindow.webContents.executeJavaScript('window.__postmeterSnapshotContinue?.()', true);
      })
      .catch((error) => {
        clearTimeout(timeout);
        console.error(error.stack || error.message || String(error));
        app.exit(1);
      });
  });
}

async function captureUiSnapshot(label) {
  const image = await mainWindow.webContents.capturePage();
  const size = image.getSize();
  if (size.width < 800 || size.height < 600) {
    throw new Error(`UI snapshot ${label} is too small: ${size.width}x${size.height}.`);
  }
  if (!nativeImageHasVariance(image)) {
    throw new Error(`UI snapshot ${label} appears blank.`);
  }
  const snapshotDir = process.env.POSTMETER_UI_SNAPSHOT_DIR;
  if (snapshotDir) {
    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(path.join(snapshotDir, `${label}.png`), image.toPNG());
  }
}

function nativeImageHasVariance(image) {
  const bitmap = image.toBitmap();
  if (bitmap.length < 8) {
    return false;
  }
  const first = [bitmap[0], bitmap[1], bitmap[2], bitmap[3]];
  const step = Math.max(4, Math.floor(bitmap.length / 2048 / 4) * 4);
  for (let index = 4; index < bitmap.length; index += step) {
    if (bitmap[index] !== first[0]
      || bitmap[index + 1] !== first[1]
      || bitmap[index + 2] !== first[2]
      || bitmap[index + 3] !== first[3]) {
      return true;
    }
  }
  return false;
}

function sendMenuAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('menu:action', action);
}

function installApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createApplicationMenuTemplate()));
}

function createApplicationMenuTemplate() {
  const includePrereleases = workspace?.settings?.updates?.includePrereleases === true;
  const fileEditViewHelpMenus = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Request',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new-request')
        },
        {
          label: 'New Collection',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendMenuAction('new-collection')
        },
        {
          label: 'New Folder',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => sendMenuAction('new-folder')
        },
        { type: 'separator' },
        {
          label: 'Save Workspace',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('save-workspace')
        },
        { type: 'separator' },
        {
          label: 'Import Workspace...',
          click: () => sendMenuAction('import-workspace')
        },
        {
          label: 'Import Collection...',
          click: () => sendMenuAction('import-collection')
        },
        { type: 'separator' },
        {
          label: 'Export Workspace...',
          click: () => sendMenuAction('export-workspace')
        },
        {
          label: 'Export Collection...',
          click: () => sendMenuAction('export-collection')
        },
        { type: 'separator' },
        { role: 'close' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'PostMeter Documentation',
          click: () => shell.openExternal(safeExternalUrl('https://github.com/StrangeQuark/PostMeter#readme').toString())
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal(safeExternalUrl('https://github.com/StrangeQuark/PostMeter/issues').toString())
        },
        { type: 'separator' },
        {
          label: 'Prereleases',
          type: 'checkbox',
          checked: includePrereleases,
          click: (menuItem) => sendMenuAction({
            type: 'set-prereleases',
            includePrereleases: menuItem.checked === true
          })
        },
        {
          label: 'Check for Updates',
          click: () => sendMenuAction('check-updates')
        }
      ]
    }
  ];

  if (process.platform !== 'darwin') {
    return fileEditViewHelpMenus;
  }

  return [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    ...fileEditViewHelpMenus
  ];
}

app.whenReady().then(async () => {
  registerOAuthProtocol();
  secretCodec = createElectronSecretCodec(safeStorage);
  workspaceStore = new WorkspaceStore(undefined, { secretCodec });
  try {
    const loaded = await runWithSecretPassphrase(
      () => workspaceStore.load(),
      'Load workspace'
    );
    workspace = loaded.workspace;
  } catch (error) {
    if (error instanceof WorkspaceRecoveryError) {
      workspace = error.recoveredWorkspace;
      dialog.showErrorBox('Workspace Recovered', error.message);
    } else {
      dialog.showErrorBox('PostMeter could not open the workspace', error.message || String(error));
      app.quit();
      return;
    }
  }
  installApplicationMenu();
  createWindow();
});

app.on('second-instance', (_event, argv) => {
  const callbackUrl = findOAuthCallbackArg(argv);
  if (callbackUrl) {
    handleOAuthCallbackUrl(callbackUrl);
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
  handleOAuthCallbackUrl(url);
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

ipcMain.handle('app:check-updates', async (_event, options = {}) => {
  assertUpdateCheckOptionsPayload(options);
  return checkForUpdates({
    currentVersion: app.getVersion(),
    includePrereleases: options?.includePrereleases === true
  });
});

ipcMain.handle('app:open-external', async (_event, url) => {
  assertExternalUrlPayload(url);
  const parsed = safeExternalUrl(url);
  await shell.openExternal(parsed.toString());
  return true;
});

ipcMain.handle('workspace:load', () => {
  const result = {
    workspace,
    path: workspaceStore.getWorkspacePath()
  };
  assertWorkspaceLoadResultPayload(result);
  return result;
});

ipcMain.handle('workspace:save', async (_event, nextWorkspace) => {
  assertWorkspacePayload(nextWorkspace);
  workspace = await saveWorkspace(nextWorkspace);
  installApplicationMenu();
  assertWorkspaceLoadResultPayload({ workspace, path: workspaceStore.getWorkspacePath() });
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
  workspace = await runWithSecretPassphrase(
    () => workspaceStore.importWorkspace(result.filePaths[0]),
    'Import workspace'
  );
  workspace = await saveWorkspace(workspace);
  installApplicationMenu();
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
  const includeSecrets = await confirmSecretExport('workspace');
  if (includeSecrets == null) {
    return { cancelled: true };
  }
  const exportedPath = await workspaceStore.exportWorkspace(nextWorkspace || workspace, result.filePath, { includeSecrets });
  return { cancelled: false, path: exportedPath };
});

ipcMain.handle('collection:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Collection',
    properties: ['openFile'],
    filters: collectionImportFilters()
  });
  if (result.canceled || !result.filePaths.length) {
    return { cancelled: true };
  }
  const collection = await runWithSecretPassphrase(
    () => workspaceStore.importCollection(result.filePaths[0]),
    'Import collection'
  );
  return { cancelled: false, collection };
});

ipcMain.handle('collection:export', async (_event, collection, format = 'postmeter') => {
  assertCollectionPayload(collection);
  assertCollectionExportFormat(format);
  const extension = collectionExportExtension(format);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Collection',
    defaultPath: `${safeFilename(collection?.name || 'collection')}.${extension}`,
    filters: collectionExportFilters(format)
  });
  if (result.canceled || !result.filePath) {
    return { cancelled: true };
  }
  const includeSecrets = await confirmSecretExport('collection');
  if (includeSecrets == null) {
    return { cancelled: true };
  }
  const exportedPath = await workspaceStore.exportCollection(collection, result.filePath, { includeSecrets, format });
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
  const result = await sendRequest(request, environment, { cookieJar: workspace.cookies || [] });
  if (result.updatedAuth && request.id) {
    updateWorkspaceRequestAuth(request.id, result.updatedAuth);
  }
  if (Array.isArray(result.updatedCookies)) {
    workspace.cookies = result.updatedCookies;
  }
  workspace.history = [
    historyEntry({
      method: request.method,
      url: result.finalUrl,
      statusCode: result.statusCode,
      durationMillis: result.durationMillis
    }),
    ...(workspace.history || [])
  ].slice(0, 100);
  await saveWorkspace(workspace);
  assertResponsePayload(result);
  return result;
});

ipcMain.handle('request:examples:export', async (_event, request) => {
  assertRequestPayload(request);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Request Examples',
    defaultPath: `${safeFilename(request?.name || 'request')}-examples.json`,
    filters: jsonFilters()
  });
  if (result.canceled || !result.filePath) {
    return { cancelled: true };
  }
  const payload = {
    requestId: request.id || '',
    requestName: request.name || 'Untitled Request',
    exportedAt: new Date().toISOString(),
    examples: request.examples || []
  };
  await require('node:fs/promises').writeFile(result.filePath, JSON.stringify(payload, null, 2));
  return { cancelled: false, path: result.filePath };
});

ipcMain.handle('oauth:pkce:start', async (_event, id, auth, environment, strategy) => {
  assertLoadId(id, 'id');
  assertAuthPayload(auth);
  assertOptionalEnvironmentPayload(environment);
  const redirectStrategy = strategy === 'customScheme' ? 'customScheme' : 'loopback';
  const abortController = new AbortController();
  activeOAuthFlows.set(id, { abortController, type: 'pkce', strategy: redirectStrategy });
  let loopbackServer = null;
  try {
    emitOAuthProgress(id, {
      type: 'pkce',
      status: 'starting',
      message: 'Preparing OAuth authorization-code PKCE flow.'
    });
    const redirectUri = redirectStrategy === 'customScheme'
      ? `${OAUTH_CUSTOM_SCHEME}://oauth/callback`
      : (loopbackServer = await createLoopbackCallbackServer(abortController.signal)).redirectUri;
    const session = createOAuthPkceSession(auth, environment, { redirectUri });
    const flow = activeOAuthFlows.get(id);
    if (flow) {
      flow.state = session.state;
    }
    const customCallbackPromise = redirectStrategy === 'customScheme'
      ? waitForCustomOAuthCallback(id, session.state, abortController.signal)
      : null;
    emitOAuthProgress(id, {
      type: 'pkce',
      status: 'waitingForAuthorization',
      message: 'Opening browser for OAuth authorization.',
      redirectUri
    });
    await openOAuthAuthorizationUrl(session.authorizationUrl);
    const callbackUrl = redirectStrategy === 'customScheme'
      ? await customCallbackPromise
      : await loopbackServer.waitForCallback();
    emitOAuthProgress(id, {
      type: 'pkce',
      status: 'exchangingToken',
      message: 'Authorization received. Exchanging code for tokens.'
    });
    const updatedAuth = await exchangeOAuthAuthorizationCode(auth, session, callbackUrl, environment, {
      signal: abortController.signal
    });
    emitOAuthProgress(id, {
      type: 'pkce',
      status: 'completed',
      message: 'OAuth authorization-code flow completed.'
    });
    return { cancelled: false, auth: updatedAuth };
  } catch (error) {
    if (abortController.signal.aborted) {
      emitOAuthProgress(id, {
        type: 'pkce',
        status: 'cancelled',
        message: 'OAuth authorization-code flow cancelled.'
      });
      return { cancelled: true };
    }
    emitOAuthProgress(id, {
      type: 'pkce',
      status: 'failed',
      message: error.message || String(error)
    });
    throw error;
  } finally {
    loopbackServer?.close();
    activeOAuthFlows.delete(id);
  }
});

ipcMain.handle('oauth:device:start', async (_event, id, auth, environment) => {
  assertLoadId(id, 'id');
  assertAuthPayload(auth);
  assertOptionalEnvironmentPayload(environment);
  const abortController = new AbortController();
  activeOAuthFlows.set(id, { abortController, type: 'device' });
  try {
    emitOAuthProgress(id, {
      type: 'device',
      status: 'starting',
      message: 'Requesting OAuth device authorization.'
    });
    const pendingAuth = await requestOAuthDeviceAuthorization(auth, environment, {
      signal: abortController.signal
    });
    const verificationUrl = pendingAuth.verificationUriComplete || pendingAuth.verificationUri;
    emitOAuthProgress(id, {
      type: 'device',
      status: 'waitingForUser',
      message: 'Complete authorization in your browser.',
      userCode: pendingAuth.userCode,
      verificationUri: pendingAuth.verificationUri,
      verificationUriComplete: pendingAuth.verificationUriComplete,
      expiresAt: pendingAuth.deviceCodeExpiresAt
    });
    if (verificationUrl) {
      await openOAuthExternalUrl(verificationUrl);
    }
    const updatedAuth = await pollOAuthDeviceToken(pendingAuth, environment, {
      signal: abortController.signal,
      onProgress: (progress) => emitOAuthProgress(id, {
        type: 'device',
        status: progress.status,
        message: 'Waiting for OAuth device authorization.',
        nextAttemptAt: progress.nextAttemptAt,
        userCode: pendingAuth.userCode,
        verificationUri: pendingAuth.verificationUri,
        verificationUriComplete: pendingAuth.verificationUriComplete,
        expiresAt: pendingAuth.deviceCodeExpiresAt
      })
    });
    emitOAuthProgress(id, {
      type: 'device',
      status: 'completed',
      message: 'OAuth device authorization completed.'
    });
    return { cancelled: false, auth: updatedAuth };
  } catch (error) {
    if (abortController.signal.aborted) {
      emitOAuthProgress(id, {
        type: 'device',
        status: 'cancelled',
        message: 'OAuth device authorization cancelled.'
      });
      return { cancelled: true };
    }
    emitOAuthProgress(id, {
      type: 'device',
      status: 'failed',
      message: error.message || String(error)
    });
    throw error;
  } finally {
    activeOAuthFlows.delete(id);
  }
});

ipcMain.handle('oauth:device:cancel', (_event, id) => {
  return cancelOAuthFlow(id);
});

ipcMain.handle('oauth:cancel', (_event, id) => {
  return cancelOAuthFlow(id);
});

function cancelOAuthFlow(id) {
  assertLoadId(id, 'id');
  const flow = activeOAuthFlows.get(id);
  if (!flow) {
    return false;
  }
  flow.abortController.abort();
  return true;
}

async function saveWorkspace(nextWorkspace) {
  return runWithSecretPassphrase(
    () => workspaceStore.save(nextWorkspace),
    'Save workspace'
  );
}

async function runWithSecretPassphrase(operation, action) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof PassphraseRequiredError)) {
        throw error;
      }
      lastError = error;
      const passphrase = await promptForPassphrase({
        parent: mainWindow,
        title: 'Workspace Secret Passphrase',
        message: `${error.message} ${action} cannot continue without the fallback passphrase. PostMeter cannot recover forgotten fallback passphrases; restore a backup if you no longer know it.`,
        confirmLabel: attempt === 0 ? 'Continue' : 'Retry'
      });
      if (!passphrase) {
        throw new Error(`${action} cancelled because a workspace secret passphrase is required.`);
      }
      secretCodec.setPassphrase(passphrase);
    }
  }
  throw new Error(`${action} failed because the fallback passphrase could not decrypt workspace secrets. PostMeter cannot recover forgotten fallback passphrases. ${lastError?.message || ''}`.trim());
}

async function confirmSecretExport(scope) {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: `Export ${capitalize(scope)}`,
    message: `Export ${scope} secrets?`,
    detail: 'Redacted exports are portable and safe to share. Exact exports write saved tokens, passwords, cookie values, certificate passphrases, and marked secret variables into plaintext JSON. PostMeter cannot recover exact values from a redacted export.',
    buttons: ['Redact Secrets', 'Export Exact Values', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });
  if (result.response === 2) {
    return null;
  }
  if (result.response === 0) {
    return false;
  }
  return await confirmExactSecretExport(scope) ? true : null;
}

async function confirmExactSecretExport(scope) {
  const phrase = exportSecretConfirmationPhrase(scope);
  const typed = await promptForSecretExportConfirmation({
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    heading: `Export exact ${scope} secrets`,
    message: 'Exact exports are plaintext JSON containing saved tokens, passwords, client secrets, cookie values, certificate passphrases, and marked secret variables.',
    phrase
  });
  return matchesExportSecretConfirmation(scope, typed);
}

function updateWorkspaceRequestAuth(requestId, auth) {
  for (const collection of workspace.collections || []) {
    walkRequests(collection, (request) => {
      if (request.id === requestId) {
        request.auth = auth;
      }
    });
  }
}

function emitOAuthProgress(id, progress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('oauth:progress', { id, ...progress });
}

async function openOAuthAuthorizationUrl(url) {
  if (isTestOAuthHoldOpen(url)) {
    return true;
  }
  if (process.env.POSTMETER_TEST_OAUTH_AUTOCOMPLETE === '1') {
    await followTestOAuthRedirect(url);
    return true;
  }
  return openOAuthExternalUrl(url);
}

function isTestOAuthHoldOpen(url) {
  if (process.env.POSTMETER_TEST_OAUTH_AUTOCOMPLETE !== '1') {
    return false;
  }
  try {
    return new URL(url).searchParams.get('mode') === 'wait-cancel';
  } catch {
    return false;
  }
}

async function openOAuthExternalUrl(url) {
  if (process.env.POSTMETER_TEST_OAUTH_SKIP_EXTERNAL === '1') {
    return true;
  }
  await shell.openExternal(url);
  return true;
}

async function followTestOAuthRedirect(url) {
  const response = await fetch(url, { redirect: 'manual' });
  if (response.status < 300 || response.status > 399) {
    throw new Error(`Test OAuth authorization endpoint did not redirect. HTTP ${response.status}.`);
  }
  const location = response.headers.get('location');
  if (!location) {
    throw new Error('Test OAuth authorization endpoint did not return a redirect location.');
  }
  const redirected = new URL(location, url).toString();
  if (redirected.startsWith('http://127.0.0.1:') || redirected.startsWith('http://localhost:')) {
    await fetch(redirected).catch(() => {});
    return;
  }
  handleOAuthCallbackUrl(redirected);
}

function safeExternalUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error('External URL is invalid.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('External URL must use HTTPS.');
  }
  if (!['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('External URL host is not allowed.');
  }
  return parsed;
}

function registerOAuthProtocol() {
  try {
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient(OAUTH_CUSTOM_SCHEME, process.execPath, [path.resolve(process.argv[1] || '.')]);
    } else {
      app.setAsDefaultProtocolClient(OAUTH_CUSTOM_SCHEME);
    }
  } catch {
    // Protocol registration can fail in restricted environments; loopback PKCE remains available.
  }
}

function findOAuthCallbackArg(argv) {
  return (argv || []).find((value) => typeof value === 'string' && value.startsWith(`${OAUTH_CUSTOM_SCHEME}://`)) || '';
}

function handleOAuthCallbackUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== `${OAUTH_CUSTOM_SCHEME}:`) {
    return false;
  }
  const state = parsed.searchParams.get('state');
  if (!state) {
    return false;
  }
  for (const [id, flow] of activeOAuthFlows.entries()) {
    if (flow.type === 'pkce' && flow.strategy === 'customScheme' && flow.state === state && flow.resolveCallback) {
      flow.resolveCallback(rawUrl);
      emitOAuthProgress(id, {
        type: 'pkce',
        status: 'callbackReceived',
        message: 'OAuth callback received.'
      });
      return true;
    }
  }
  return false;
}

function waitForCustomOAuthCallback(id, state, signal) {
  const flow = activeOAuthFlows.get(id);
  if (!flow) {
    return Promise.reject(new Error('OAuth authorization flow is not active.'));
  }
  flow.state = state;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('OAuth authorization callback timed out.'));
    }, OAUTH_CALLBACK_TIMEOUT_MILLIS);
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      if (flow.resolveCallback === onCallback) {
        delete flow.resolveCallback;
      }
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('OAuth authorization flow cancelled.'));
    };
    const onCallback = (url) => {
      cleanup();
      resolve(url);
    };
    flow.resolveCallback = onCallback;
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function createLoopbackCallbackServer(signal) {
  let server;
  let resolveCallback;
  let rejectCallback;
  const callbackPromise = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (requestUrl.pathname !== '/oauth/callback') {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><title>PostMeter OAuth</title><p>Authorization received. You can return to PostMeter.</p>');
    resolveCallback(`http://127.0.0.1:${server.address().port}${request.url}`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const onAbort = () => {
    rejectCallback(new Error('OAuth authorization flow cancelled.'));
    server.close();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  return {
    redirectUri: `http://127.0.0.1:${server.address().port}/oauth/callback`,
    waitForCallback() {
      return Promise.race([
        callbackPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('OAuth authorization callback timed out.')), OAUTH_CALLBACK_TIMEOUT_MILLIS))
      ]);
    },
    close() {
      signal?.removeEventListener('abort', onAbort);
      server.close();
    }
  };
}

ipcMain.handle('load:start', async (event, id, request, environment, config) => {
  assertLoadId(id);
  assertRequestPayload(request);
  assertOptionalEnvironmentPayload(environment);
  assertLoadConfigPayload(config);
  const abortController = new AbortController();
  activeLoadTests.set(id, abortController);
  try {
    const result = await runLoadTest(request, environment, config, {
      abortController,
      cookieJar: workspace.cookies || [],
      onProgress: (progress) => {
        event.sender.send('load:progress', { id, progress });
      }
    });
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
  const abortController = new AbortController();
  activeCollectionRuns.set(id, abortController);
  try {
    const result = await runCollection(collection, environment, {
      abortController,
      signal: abortController.signal,
      cookieJar: workspace.cookies || [],
      stopOnFailure: config.stopOnFailure === true,
      onProgress: (progress) => {
        event.sender.send('runner:progress', { id, progress });
      }
    });
    if (Array.isArray(result.cookies)) {
      workspace.cookies = result.cookies;
      await saveWorkspace(workspace);
    }
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
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: `Export Collection Run ${extension.toUpperCase()}`,
    defaultPath: `postmeter-collection-run.${extension}`,
    filters: [
      { name: extension.toUpperCase(), extensions: [extension] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { cancelled: true };
  }
  const fs = require('node:fs/promises');
  const content = format === 'csv' ? collectionRunResultToCsv(result) : JSON.stringify(result, null, 2);
  await fs.writeFile(saveResult.filePath, content);
  return { cancelled: false, path: saveResult.filePath };
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

function collectionImportFilters() {
  return [
    { name: 'API Collections', extensions: ['json', 'yaml', 'yml', 'har', 'jmx', 'sh', 'txt'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function collectionExportExtension(format) {
  return {
    postmeter: 'postmeter.json',
    openapi: 'openapi.json',
    jmeter: 'jmx',
    curl: 'sh',
    har: 'har'
  }[format] || 'postmeter.json';
}

function collectionExportFilters(format) {
  const extension = collectionExportExtension(format).split('.').at(-1);
  return [
    { name: `${format.toUpperCase()} Collection`, extensions: [extension] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function safeFilename(value) {
  const filename = String(value || 'collection').trim().replace(/[^A-Za-z0-9._-]+/g, '-');
  return filename || 'collection';
}

function capitalize(value) {
  return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
}
