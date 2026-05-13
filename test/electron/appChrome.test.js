const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const {
  appProtocolFilePath,
  appProtocolHeaders,
  APP_RENDERER_CSP,
  APP_RENDERER_QUERY_KEYS,
  APP_PROTOCOL_SCHEME,
  createAppRendererUrl,
  isTrustedAppRendererUrl,
  serveAppProtocolRequest
} = require('../../electron/appProtocol');
const {
  isAllowedRendererNavigation
} = require('../../electron/mainWindow');
const {
  createTrustedIpcMain,
  isMainFrameSender,
  isTrustedIpcSender,
  isTrustedRendererUrl,
  sanitizeIpcError
} = require('../../electron/ipcSecurity');
const {
  buildElectronSecurityMatrix,
  ELECTRON_IPC_CHANNELS
} = require('../../src/core/productionSupportMatrices');

test('Electron shell keeps custom File/Edit/View/Help menus without the default Window menu', async () => {
  const root = path.join(__dirname, '..', '..');
  const mainSource = await fs.readFile(path.join(root, 'electron', 'main.js'), 'utf8');
  const appMenuSource = await fs.readFile(path.join(root, 'electron', 'appMenu.js'), 'utf8');
  const preloadSource = await fs.readFile(path.join(root, 'electron', 'preload.js'), 'utf8');
  const rendererSource = await fs.readFile(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
  const indexSource = await fs.readFile(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');

  assert.match(mainSource, /refreshApplicationMenu/);
  assert.match(appMenuSource, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(createApplicationMenuTemplate\(options\)\)\)/);
  assert.match(appMenuSource, /label:\s*'File'/);
  for (const label of [
    'New',
    'Workspace',
    'Request',
    'Collection',
    'Folder',
    'Environment',
    'Runner',
    'Performance Test',
    'Save',
    'Import',
    'Export',
    'PostMeter',
    'Postman',
    'OpenAPI',
    'curl',
    'Settings'
  ]) {
    assert.match(appMenuSource, new RegExp(`(?:label:\\s*|actionItem\\()'${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  for (const action of [
    'new-workspace',
    'new-request',
    'new-collection',
    'new-folder',
    'new-environment',
    'new-runner',
    'new-performance-test',
    'save-active-tab',
    'import-workspace',
    'import-request',
    'import-collection',
    'import-environment',
    'import-runner',
    'import-performance-test',
    'export-workspace',
    'export-request',
    'export-request-curl',
    'export-collection',
    'export-postman',
    'export-openapi',
    'export-curl',
    'export-environment',
    'export-postman-environment',
    'export-runner-definition',
    'export-performance-test'
  ]) {
    assert.match(appMenuSource, new RegExp(`'${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(appMenuSource, /click:\s*\(\)\s*=>\s*sendMenuAction\(action\)/);
  assert.doesNotMatch(appMenuSource, /label:\s*'Save Workspace'/);
  assert.match(appMenuSource, /actionItem\('Save',\s*'save-active-tab',\s*\{ accelerator: 'CmdOrCtrl\+S' \}\)/);
  assert.doesNotMatch(appMenuSource, /role:\s*'close'/);
  assert.match(appMenuSource, /role:\s*'quit'/);
  assert.match(appMenuSource, /role:\s*'editMenu'/);
  assert.match(appMenuSource, /role:\s*'viewMenu'/);
  assert.match(appMenuSource, /label:\s*'Help'/);
  assert.match(appMenuSource, /actionItem\('Settings',\s*'settings',\s*\{ accelerator: 'CmdOrCtrl\+,' \}\)/);
  assert.match(appMenuSource, /label:\s*'PostMeter Documentation'/);
  assert.match(appMenuSource, /label:\s*'Report Issue'/);
  assert.match(appMenuSource, /label:\s*'Export Local Diagnostics\.\.\.'[\s\S]*sendMenuAction\('export-diagnostics'\)/);
  assert.doesNotMatch(appMenuSource, /label:\s*'Prereleases'/);
  assert.match(appMenuSource, /label:\s*'Check for Updates'/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /role:\s*['"]windowMenu['"]/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /label:\s*['"]Window['"]/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /Menu\.setApplicationMenu\(null\)/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /\.removeMenu\(\)/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /\.setMenuBarVisibility\(false\)/);

  assert.match(preloadSource, /onMenuAction/);
  assert.match(preloadSource, /'new-workspace'/);
  assert.match(preloadSource, /'save-active-tab'/);
  assert.match(preloadSource, /'import-request'/);
  assert.match(preloadSource, /'export-request-curl'/);
  assert.match(preloadSource, /'export-performance-test'/);
  assert.match(preloadSource, /'settings'/);
  assert.match(preloadSource, /process\.isMainFrame\s*===\s*true/);
  assert.match(rendererSource, /case 'settings':[\s\S]*openSettingsModal\(\)/);
  assert.match(rendererSource, /case 'save-active-tab':[\s\S]*saveActiveTabFromMenu\(\)/);
  assert.match(rendererSource, /case 'new-folder':[\s\S]*newFolderFromToolbar\(\)/);
  assert.match(rendererSource, /case 'export-workspace':[\s\S]*exportWorkspaceFromPicker\(\)/);
  assert.match(rendererSource, /case 'export-request-curl':[\s\S]*exportRequestFromPicker\('curl'\)/);
  assert.match(rendererSource, /case 'export-performance-test':[\s\S]*exportPerformanceTestFromPicker\(\)/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('postmeter',\s*postmeterApi\)/);
  assert.match(preloadSource, /webUtils\.getPathForFile/);
  assert.match(preloadSource, /files:\s*\{[\s\S]*pathForFile/);
  assert.match(preloadSource, /ipcRenderer\.on\('menu:action'/);
  assert.match(preloadSource, /'export-diagnostics'/);
  assert.match(preloadSource, /'set-prereleases'/);
  assert.match(preloadSource, /includePrereleases/);
  assert.match(preloadSource, /'set-save-on-force-close'/);
  assert.match(preloadSource, /saveOnForceClose/);
  assert.match(rendererSource, /handleAppMenuAction/);
  assert.match(rendererSource, /case 'settings':[\s\S]*openSettingsModal/);
  assert.match(rendererSource, /setIncludePrereleases/);
  assert.match(rendererSource, /setSaveOnForceClose/);
  assert.match(rendererSource, /chooseImportFilePath\('workspace'\)/);
  assert.match(rendererSource, /chooseImportFilePath\('collection'\)/);
  assert.match(rendererSource, /chooseImportFilePath\('performance'\)/);
  assert.match(rendererSource, /upsertLocalFileAttachmentBinding/);
  assert.match(indexSource, /id="filePickerDropZone"/);
  assert.match(indexSource, /id="fileSourceMenu"/);
  assert.match(indexSource, /Choose File\.\.\./);
  assert.match(mainSource, /app\.whenReady\(\)\.then\(startApplication\)\.catch\(\(error\) => failStartup\(error\)\)/);
  assert.match(mainSource, /async function failStartup/);
  assert.match(mainSource, /writeStartupSmokeFailureArtifacts\(mainWindow,\s*process\.env,\s*error\)/);
  assert.ok(
    mainSource.indexOf('writeStartupSmokeFailureArtifacts(mainWindow, process.env, error)') < mainSource.indexOf('dialog.showErrorBox(title, message)'),
    'startup failure artifacts must be written before native error dialogs'
  );
});

test('Electron BrowserWindow hardening denies renderer navigation, window-open, webview, and permissions', async () => {
  const root = path.join(__dirname, '..', '..');
  const mainWindowSource = await fs.readFile(path.join(root, 'electron', 'mainWindow.js'), 'utf8');
  const rendererUrl = createAppRendererUrl({ uiWorkflowSmoke: '1' });

  assert.match(mainWindowSource, /nodeIntegration:\s*false/);
  assert.match(mainWindowSource, /contextIsolation:\s*true/);
  assert.match(mainWindowSource, /sandbox:\s*true/);
  assert.match(mainWindowSource, /webSecurity:\s*true/);
  assert.match(mainWindowSource, /allowRunningInsecureContent:\s*false/);
  assert.match(mainWindowSource, /setWindowOpenHandler\(\(\) => \(\{\s*action:\s*'deny'\s*\}\)\)/);
  assert.match(mainWindowSource, /setPermissionCheckHandler\(\(\) => false\)/);
  assert.match(mainWindowSource, /setPermissionRequestHandler/);
  assert.match(mainWindowSource, /will-navigate/);
  assert.match(mainWindowSource, /will-attach-webview/);
  assert.match(mainWindowSource, /preventDefault\(\)/);
  assert.match(mainWindowSource, /loadURL\(rendererUrl\)/);
  assert.doesNotMatch(mainWindowSource, /loadFile\(/);

  assert.equal(isAllowedRendererNavigation(rendererUrl, rendererUrl), true);
  assert.equal(isAllowedRendererNavigation(createAppRendererUrl({ uiSnapshotSmoke: '1' }), rendererUrl), false);
  assert.equal(isAllowedRendererNavigation(createAppRendererUrl({ uiSnapshotSmoke: '1' }), createAppRendererUrl({ uiSnapshotSmoke: '1' })), true);
  assert.equal(isAllowedRendererNavigation(`${rendererUrl}#fragment`, rendererUrl), true);
  assert.equal(isAllowedRendererNavigation(createAppRendererUrl({ unexpected: '1' }), rendererUrl), false);
  assert.equal(isAllowedRendererNavigation('https://example.test/'), false);
  assert.equal(isAllowedRendererNavigation('file:///tmp/evil.html'), false);
  assert.equal(isAllowedRendererNavigation(`${APP_PROTOCOL_SCHEME}://evil/src/renderer/index.html`), false);
  assert.equal(isAllowedRendererNavigation('https://example.test/', 'not-a-trusted-renderer-url'), false);
  assert.equal(isTrustedAppRendererUrl(createAppRendererUrl({ uiWorkflowSmoke: '1', uiWorkflowBaseUrl: 'http://127.0.0.1:1' })), true);
  assert.equal(isTrustedAppRendererUrl(createAppRendererUrl({ unexpected: '1' })), false);
});

test('Electron startup smoke keeps software rasterization available for GPU-less CI runners', async () => {
  const root = path.join(__dirname, '..', '..');
  const mainSource = await fs.readFile(path.join(root, 'electron', 'main.js'), 'utf8');

  assert.match(mainSource, /POSTMETER_STARTUP_SMOKE === '1'[\s\S]*appendSwitch\('disable-gpu'\)/);
  assert.doesNotMatch(mainSource, /appendSwitch\('disable-software-rasterizer'\)/);
});

test('Electron IPC sender hardening trusts only the packaged renderer URL', async () => {
  const indexUrl = createAppRendererUrl();
  const fakeIpcMain = {
    handlers: new Map(),
    listeners: new Map(),
    handle(channel, listener) {
      this.handlers.set(channel, listener);
    },
    on(channel, listener) {
      this.listeners.set(channel, listener);
    }
  };
  const trustedIpcMain = createTrustedIpcMain(fakeIpcMain);

  trustedIpcMain.handle('app:versions', () => 'ok');
  assert.equal(await fakeIpcMain.handlers.get('app:versions')({ senderFrame: { url: indexUrl } }), 'ok');
  assert.equal(await fakeIpcMain.handlers.get('app:versions')({ senderFrame: { url: createAppRendererUrl({ uiWorkflowSmoke: '1' }) } }), 'ok');
  const mainFrame = { url: indexUrl, parent: null };
  const subFrame = { url: indexUrl, parent: mainFrame, top: mainFrame };
  assert.equal(isMainFrameSender({ senderFrame: mainFrame, sender: { mainFrame } }), true);
  assert.equal(isMainFrameSender({ senderFrame: subFrame, sender: { mainFrame } }), false);
  assert.equal(isMainFrameSender({ sender: { getURL: () => indexUrl } }), false);
  assert.equal(isTrustedIpcSender({ senderFrame: mainFrame, sender: { mainFrame } }), true);
  assert.equal(isTrustedIpcSender({ senderFrame: subFrame, sender: { mainFrame } }), false);
  assert.equal(isTrustedIpcSender({ sender: { getURL: () => indexUrl } }), false);
  await assert.rejects(
    () => fakeIpcMain.handlers.get('app:versions')({ sender: { getURL: () => indexUrl } }),
    /IPC sender is not the trusted PostMeter renderer/
  );
  await assert.rejects(
    () => fakeIpcMain.handlers.get('app:versions')({ senderFrame: { url: 'https://example.test/' } }),
    /IPC sender is not the trusted PostMeter renderer/
  );
  await assert.rejects(
    () => fakeIpcMain.handlers.get('app:versions')({ senderFrame: subFrame, sender: { mainFrame } }),
    /IPC sender is not the trusted PostMeter renderer/
  );
  await assert.rejects(
    () => fakeIpcMain.handlers.get('app:versions')({ senderFrame: { url: `${APP_PROTOCOL_SCHEME}://bundle/README.md` } }),
    /IPC sender is not the trusted PostMeter renderer/
  );
  await assert.rejects(
    () => fakeIpcMain.handlers.get('app:versions')({ senderFrame: { url: createAppRendererUrl({ unexpected: '1' }) } }),
    /IPC sender is not the trusted PostMeter renderer/
  );

  trustedIpcMain.handle('request:send', async () => {
    throw new Error('request failed for https://api.example.test/customer?token=url-token body=customer-body Authorization: Bearer raw-token /home/alice/customer.json');
  });
  await assert.rejects(
    () => fakeIpcMain.handlers.get('request:send')({ senderFrame: { url: indexUrl } }),
    (error) => {
      const message = error?.message || '';
      assert.doesNotMatch(message, /api\.example\.test|url-token|customer-body|raw-token|\/home\/alice/);
      assert.match(message, /\[url\]|\[redacted|\[omitted:bodies\]|\[path\]/);
      return true;
    }
  );

  trustedIpcMain.on('workspace:saveSync', (event) => {
    event.returnValue = 'saved';
  });
  const event = { senderFrame: { url: indexUrl }, returnValue: null };
  fakeIpcMain.listeners.get('workspace:saveSync')(event);
  assert.equal(event.returnValue, 'saved');
  assert.throws(
    () => fakeIpcMain.listeners.get('workspace:saveSync')({ senderFrame: { url: 'file:///tmp/evil.html' }, returnValue: null }),
    /IPC sender is not the trusted PostMeter renderer/
  );

  assert.equal(isTrustedRendererUrl(indexUrl), true);
  assert.equal(isTrustedRendererUrl(createAppRendererUrl({ uiSnapshotSmoke: '1' })), true);
  assert.equal(isTrustedRendererUrl(createAppRendererUrl({ snapshot: '1' })), false);
  assert.equal(isTrustedRendererUrl('about:blank'), false);
});

test('Electron IPC error sanitizer redacts traffic-shaped values while preserving safe metadata', () => {
  const error = new TypeError('POST https://api.example.test/path?access_token=secret body=customer-body Cookie: sid=secret Authorization: Digest username="alice", nonce="abc123", response="deadbeef" Digest username="standalone-user", realm="standalone-realm", nonce="standalone-nonce", uri="/standalone/path", response="standalone-response", cnonce="standalone-cnonce" {"Authorization":"Digest username=\\"json-user\\", nonce=\\"json-nonce\\", response=\\"json-response\\""} password=alpha beta gamma client-assertion=hyphen assertion secret next=ok C:\\Users\\Alice\\file.json');
  error.code = 'ERR_TEST';

  const sanitized = sanitizeIpcError(error);

  assert.equal(sanitized.name, 'TypeError');
  assert.equal(sanitized.code, 'ERR_TEST');
  assert.doesNotMatch(sanitized.message, /api\.example\.test|secret|customer-body|alice|abc123|deadbeef|standalone-user|standalone-realm|standalone-nonce|standalone-response|standalone-cnonce|json-user|json-nonce|json-response|alpha beta gamma|hyphen assertion secret|Users\\Alice/);
  assert.match(sanitized.message, /\[url\]|\[omitted:bodies\]|\[redacted|\[path\]/);

  const secretCodeError = new Error('safe IPC failure');
  secretCodeError.code = 'ACCESS_TOKEN_SUPERSECRET12345';
  assert.equal(sanitizeIpcError(secretCodeError).code, '[redacted]');

  const secretNameError = new Error('safe IPC failure');
  secretNameError.name = 'SecretAccessKeySuperSecret12345';
  secretNameError.code = 'SECRET_ACCESS_KEY_SUPERSECRET12345';
  const secretNameSanitized = sanitizeIpcError(secretNameError);
  assert.equal(secretNameSanitized.name, 'Error');
  assert.equal(secretNameSanitized.code, '[redacted]');
});

test('PostMeter app protocol only serves allowlisted renderer bundle assets', async () => {
  const root = path.join(__dirname, '..', '..');
  const appProtocolSource = await fs.readFile(path.join(root, 'electron', 'appProtocol.js'), 'utf8');
  const rendererHtml = await fs.readFile(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  const rendererUrl = createAppRendererUrl({ uiWorkflowSmoke: '1' });

  assert.equal(rendererUrl, `${APP_PROTOCOL_SCHEME}://bundle/src/renderer/index.html?uiWorkflowSmoke=1`);
  assert.deepEqual([...APP_RENDERER_QUERY_KEYS].sort(), [
    'uiOauthBaseUrl',
    'uiOauthSmoke',
    'uiRegressionSmoke',
    'uiSnapshotSmoke',
    'uiWorkflowBaseUrl',
    'uiWorkflowSmoke'
  ]);
  assert.equal(appProtocolFilePath(rendererUrl, root), path.join(root, 'src', 'renderer', 'index.html'));
  assert.equal(appProtocolFilePath(`${APP_PROTOCOL_SCHEME}://bundle/src/core/payloadSchemas.js`, root), path.join(root, 'src', 'core', 'payloadSchemas.js'));
  assert.equal(appProtocolFilePath(`${APP_PROTOCOL_SCHEME}://bundle/src/core/csvVariables.js`, root), path.join(root, 'src', 'core', 'csvVariables.js'));
  assert.equal(appProtocolFilePath(`${APP_PROTOCOL_SCHEME}://bundle/src/core/requestQueryModel.js`, root), path.join(root, 'src', 'core', 'requestQueryModel.js'));
  assert.equal(appProtocolFilePath(`${APP_PROTOCOL_SCHEME}://bundle/build/icon.png`, root), path.join(root, 'build', 'icon.png'));
  for (const scriptSrc of rendererHtml.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const scriptUrl = new URL(scriptSrc[1], rendererUrl).toString();
    assert.doesNotThrow(
      () => appProtocolFilePath(scriptUrl, root),
      `script ${scriptSrc[1]} should be served by the app protocol allowlist`
    );
  }
  assert.throws(() => appProtocolFilePath(`${APP_PROTOCOL_SCHEME}://evil/src/renderer/index.html`, root), /Invalid PostMeter app protocol URL/);
  assert.throws(() => appProtocolFilePath(`${APP_PROTOCOL_SCHEME}://bundle/package.json`, root), /not allowlisted/);
  assert.throws(() => appProtocolFilePath(`${APP_PROTOCOL_SCHEME}://bundle/src/core/scriptRuntime.js`, root), /not allowlisted/);
  assert.throws(() => appProtocolFilePath(`file://${path.join(root, 'src', 'renderer', 'index.html')}`, root), /Invalid PostMeter app protocol URL/);
  assert.doesNotMatch(appProtocolSource, /supportFetchAPI:\s*true/);
  assert.match(rendererHtml, new RegExp(APP_RENDERER_CSP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const response = await serveAppProtocolRequest({ method: 'GET', url: rendererUrl }, { rootPath: root });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('content-security-policy'), APP_RENDERER_CSP);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await response.text(), /Content-Security-Policy/);
  assert.deepEqual(appProtocolHeaders(path.join(root, 'src', 'renderer', 'index.html')), {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': APP_RENDERER_CSP
  });

  const denied = await serveAppProtocolRequest({ method: 'GET', url: `${APP_PROTOCOL_SCHEME}://bundle/package.json` }, { rootPath: root });
  assert.equal(denied.status, 404);
  assert.equal(denied.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(denied.headers.get('x-content-type-options'), 'nosniff');
  const methodDenied = await serveAppProtocolRequest({ method: 'POST', url: rendererUrl }, { rootPath: root });
  assert.equal(methodDenied.status, 405);
  assert.equal(methodDenied.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(methodDenied.headers.get('x-content-type-options'), 'nosniff');
});

test('Electron security matrix enumerates every IPC channel exposed by source', async () => {
  const root = path.join(__dirname, '..', '..');
  const mainFiles = [
    'electron/appIpc.js',
    'electron/exportIpc.js',
    'electron/main.js',
    'electron/oauthIpc.js',
    'electron/requestIpc.js',
    'electron/runtimeIpc.js',
    'electron/sandboxPackageIpc.js',
    'electron/sessionIpc.js',
    'electron/vaultPrompt.js',
    'electron/workspaceIpc.js'
  ];
  const mainSource = (await Promise.all(mainFiles.map((file) => fs.readFile(path.join(root, file), 'utf8')))).join('\n');
  const preloadSource = await fs.readFile(path.join(root, 'electron', 'preload.js'), 'utf8');
  const matrixRows = new Set(buildElectronSecurityMatrix().rows.map((row) => row.id));
  const declaredRendererToMain = new Set(ELECTRON_IPC_CHANNELS
    .filter((channel) => channel.direction.startsWith('renderer-to-main'))
    .map((channel) => channel.channel));
  const declaredMainToRenderer = new Set(ELECTRON_IPC_CHANNELS
    .filter((channel) => channel.direction === 'main-to-renderer')
    .map((channel) => channel.channel));

  for (const channel of ELECTRON_IPC_CHANNELS) {
    assert.ok(matrixRows.has(channel.id), `Missing electron-security matrix row for ${channel.channel}`);
  }

  const sourceRendererToMain = new Set([
    ...matches(mainSource, /(?:ipcMain|trustedIpcMain)\.(?:handle|on)\('([^']+)'/g),
    ...matches(preloadSource, /ipcRenderer\.(?:invoke|sendSync)\('([^']+)'/g)
  ]);
  const sourceMainToRenderer = new Set([
    ...matches(mainSource, /(?:webContents|sender)\.send\('([^']+)'/g),
    ...matches(preloadSource, /ipcRenderer\.on\('([^']+)'/g)
  ]);

  assert.deepEqual([...declaredRendererToMain].sort(), [...sourceRendererToMain].sort());
  assert.deepEqual([...declaredMainToRenderer].sort(), [...sourceMainToRenderer].sort());
});

function matches(source, regex) {
  return [...source.matchAll(regex)].map((match) => match[1]);
}
