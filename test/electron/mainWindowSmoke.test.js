const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  applyWindowShortcutAction,
  bindKeyboardShortcutActions,
  bindNumpadZoomShortcuts,
  bindStartupLoadFailureHooks,
  captureUiSmokeDomState,
  classifyKeyboardShortcutAction,
  classifyNumpadZoomShortcut,
  completeStartupSmoke,
  expectedDefaultUserDataRoot,
  isPathInside,
  nextNumpadZoomLevel,
  nextZoomLevel,
  requiredPreloadApiSurface,
  redactUiSmokeText,
  runStartupSmokeProbe,
  UI_REGRESSION_SMOKE_TITLE_TIMEOUT_MILLIS,
  UI_TYPOGRAPHY_SMOKE_TITLE_TIMEOUT_MILLIS,
  validateSmokeUserDataPath,
  writeStartupSmokeFailureArtifacts,
  writeUiSmokeFailureArtifacts
} = require('../../electron/app-shell/mainWindow');
const {
  APP_PROTOCOL_HOST,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_CSP,
  APP_RENDERER_PATHNAME
} = require('../../electron/app-shell/appProtocol');

function cmdOrCtrlModifier() {
  return process.platform === 'darwin' ? { meta: true } : { control: true };
}

test('numpad zoom shortcut classifier only handles modified numpad zoom keys', () => {
  const commandModifier = cmdOrCtrlModifier();
  assert.equal(classifyNumpadZoomShortcut({ type: 'keyDown', ...commandModifier, code: 'NumpadAdd', key: '+' }), 'in');
  assert.equal(classifyNumpadZoomShortcut({ type: 'keyDown', ...commandModifier, code: 'NumpadSubtract', key: '-' }), 'out');
  assert.equal(classifyNumpadZoomShortcut({ type: 'keyDown', ...commandModifier, code: 'Numpad0', key: '0' }), 'reset');
  assert.equal(classifyNumpadZoomShortcut({ type: 'keyDown', code: 'NumpadAdd', key: '+' }), '');
  assert.equal(classifyNumpadZoomShortcut({ type: 'keyUp', ...commandModifier, code: 'NumpadAdd', key: '+' }), '');
  assert.equal(classifyNumpadZoomShortcut({ type: 'keyDown', ...commandModifier, alt: true, code: 'NumpadAdd', key: '+' }), '');
  assert.equal(classifyNumpadZoomShortcut({ type: 'keyDown', ...commandModifier, code: 'Equal', key: '+' }), '');
});

test('custom keyboard shortcut classifier treats normal and numpad keys as shortcut equivalents', () => {
  const commandModifier = cmdOrCtrlModifier();
  assert.equal(classifyKeyboardShortcutAction({
    type: 'keyDown',
    ...commandModifier,
    code: 'Numpad1',
    key: '1'
  }, { 'new-request': 'CmdOrCtrl+1' }), 'new-request');
  assert.equal(classifyKeyboardShortcutAction({
    type: 'keyDown',
    ...commandModifier,
    code: 'Digit1',
    key: '1'
  }, { 'new-request': 'CmdOrCtrl+1' }), 'new-request');
  assert.equal(classifyKeyboardShortcutAction({
    type: 'keyDown',
    ...commandModifier,
    code: 'NumpadAdd',
    key: '+'
  }, { 'new-request': 'CmdOrCtrl+1', 'zoom-in': 'CmdOrCtrl+=' }), 'zoom-in');
  assert.equal(classifyKeyboardShortcutAction({
    type: 'keyDown',
    ...commandModifier,
    code: 'Minus',
    key: '-'
  }, { 'zoom-out': 'CmdOrCtrl+Minus' }), 'zoom-out');
  assert.equal(classifyKeyboardShortcutAction({
    type: 'keyDown',
    ...commandModifier,
    code: 'KeyT',
    key: 't'
  }), 'new-runner');
  assert.equal(classifyKeyboardShortcutAction({
    type: 'keyDown',
    ...commandModifier,
    code: 'KeyQ',
    key: 'q'
  }), 'quit');
  assert.equal(classifyKeyboardShortcutAction({
    type: 'keyDown',
    ...commandModifier,
    code: 'KeyR',
    key: 'r'
  }), 'reload');
});

test('custom keyboard shortcut binding dispatches menu actions for normal and numpad equivalents', () => {
  const webContents = new EventEmitter();
  const dispatched = [];
  let preventCount = 0;
  const commandModifier = cmdOrCtrlModifier();

  bindKeyboardShortcutActions({ webContents }, {
    getShortcuts: () => ({ 'new-request': 'CmdOrCtrl+1' }),
    sendAction: (action) => dispatched.push(action)
  });

  webContents.emit('before-input-event', {
    preventDefault: () => {
      preventCount += 1;
    }
  }, { type: 'keyDown', ...commandModifier, code: 'Numpad1', key: '1' });

  assert.equal(preventCount, 1);
  assert.deepEqual(dispatched, ['new-request']);

  webContents.emit('before-input-event', {
    preventDefault: () => {
      preventCount += 1;
    }
  }, {
    type: 'keyDown',
    ...commandModifier,
    code: 'Digit1',
    key: '1'
  });
  assert.equal(preventCount, 2);
  assert.deepEqual(dispatched, ['new-request', 'new-request']);
});

test('custom keyboard shortcut binding skips dispatch while shortcut capture is active', () => {
  const webContents = new EventEmitter();
  webContents.__postmeterMenuShortcutsIgnored = true;
  const dispatched = [];
  let prevented = false;
  const commandModifier = cmdOrCtrlModifier();

  bindKeyboardShortcutActions({ webContents }, {
    getShortcuts: () => ({ 'new-request': 'CmdOrCtrl+1' }),
    sendAction: (action) => dispatched.push(action)
  });

  webContents.emit('before-input-event', {
    preventDefault: () => {
      prevented = true;
    }
  }, { type: 'keyDown', ...commandModifier, code: 'Numpad1', key: '1' });

  assert.equal(prevented, false);
  assert.deepEqual(dispatched, []);
});

test('numpad zoom shortcut binding updates window zoom level', () => {
  const webContents = new EventEmitter();
  let zoomLevel = 0;
  const commandModifier = cmdOrCtrlModifier();
  webContents.getZoomLevel = () => zoomLevel;
  webContents.setZoomLevel = (nextLevel) => {
    zoomLevel = nextLevel;
  };

  bindNumpadZoomShortcuts({ webContents });

  let prevented = false;
  webContents.emit('before-input-event', {
    preventDefault: () => {
      prevented = true;
    }
  }, { type: 'keyDown', ...commandModifier, code: 'NumpadAdd', key: '+' });

  assert.equal(prevented, true);
  assert.equal(zoomLevel, 0.5);

  webContents.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', ...commandModifier, code: 'NumpadSubtract', key: '-' });
  assert.equal(zoomLevel, 0);

  webContents.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', ...commandModifier, code: 'Numpad0', key: '0' });
  assert.equal(zoomLevel, 0);
});

test('window shortcut actions handle configurable View menu actions in the main process', () => {
  const calls = [];
  let zoomLevel = 0;
  let fullScreen = false;
  const webContents = {
    getZoomLevel: () => zoomLevel,
    setZoomLevel: (level) => {
      zoomLevel = level;
      calls.push(`zoom:${level}`);
    },
    reload: () => calls.push('reload'),
    reloadIgnoringCache: () => calls.push('force-reload'),
    toggleDevTools: () => calls.push('toggle-devtools')
  };
  const mainWindow = {
    webContents,
    isFullScreen: () => fullScreen,
    setFullScreen: (nextValue) => {
      fullScreen = nextValue;
      calls.push(`fullscreen:${nextValue}`);
    }
  };

  assert.equal(applyWindowShortcutAction(mainWindow, 'zoom-in'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'zoom-out'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'zoom-reset'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'reload'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'force-reload'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'toggle-devtools'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'toggle-fullscreen'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'new-request'), false);

  assert.deepEqual(calls, [
    'zoom:0.5',
    'zoom:0',
    'zoom:0',
    'reload',
    'force-reload',
    'toggle-devtools',
    'fullscreen:true'
  ]);
});

test('window shortcut actions handle configurable Application and Edit menu actions in the main process', () => {
  const calls = [];
  const webContents = {
    undo: () => calls.push('undo'),
    redo: () => calls.push('redo'),
    cut: () => calls.push('cut'),
    copy: () => calls.push('copy'),
    paste: () => calls.push('paste'),
    pasteAndMatchStyle: () => calls.push('paste-and-match-style'),
    delete: () => calls.push('delete'),
    selectAll: () => calls.push('select-all')
  };
  const mainWindow = {
    webContents,
    close: () => calls.push('quit')
  };

  assert.equal(applyWindowShortcutAction(mainWindow, 'undo'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'redo'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'cut'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'copy'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'paste'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'paste-and-match-style'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'delete'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'select-all'), true);
  assert.equal(applyWindowShortcutAction(mainWindow, 'quit'), true);

  assert.deepEqual(calls, [
    'undo',
    'redo',
    'cut',
    'copy',
    'paste',
    'paste-and-match-style',
    'delete',
    'select-all',
    'quit'
  ]);
});

test('numpad zoom levels clamp to supported bounds', () => {
  assert.equal(nextZoomLevel(0, 'zoom-in'), 0.5);
  assert.equal(nextZoomLevel(0, 'zoom-out'), -0.5);
  assert.equal(nextZoomLevel(3, 'zoom-reset'), 0);
  assert.equal(nextNumpadZoomLevel(6, 'in'), 6);
  assert.equal(nextNumpadZoomLevel(-6, 'out'), -6);
  assert.equal(nextNumpadZoomLevel(0, 'in'), 0.5);
  assert.equal(nextNumpadZoomLevel(0, 'out'), -0.5);
  assert.equal(nextNumpadZoomLevel(3, 'reset'), 0);
  assert.equal(nextNumpadZoomLevel('not-a-number', 'in'), 0.5);
});

test('startup smoke probe prevents renderer shutdown from overwriting marker save', async () => {
  let executedScript = '';
  const savedMarkers = [];
  const mainWindow = {
    webContents: {
      executeJavaScript: async (script) => {
        executedScript = script;
        return { markerPresent: false };
      }
    }
  };

  await runStartupSmokeProbe({ quit() {} }, mainWindow, {
    POSTMETER_PACKAGED_SMOKE_MARKER: 'marker',
    POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD: ''
  }, {
    saveStartupSmokeMarker: async (key, value, result) => savedMarkers.push({ key, value, result })
  });

  assert.match(executedScript, /window\.__postmeterSkipWorkspaceShutdownSave = true/);
  assert.doesNotMatch(executedScript, /window\.postmeter\.workspace\.save/);
  assert.deepEqual(savedMarkers, [{
    key: '__postmeter_packaged_smoke',
    value: 'marker',
    result: { markerPresent: false }
  }]);
  assert.match(executedScript, /releaseChannel/);
  assert.match(executedScript, /missingApi/);
  assert.match(executedScript, /window\.location\.protocol/);
  assert.match(executedScript, /window\.location\.hostname/);
  assert.match(executedScript, /window\.location\.pathname/);
  assert.match(executedScript, /Content-Security-Policy/);
  assert.match(executedScript, new RegExp(APP_PROTOCOL_SCHEME));
  assert.match(executedScript, new RegExp(APP_PROTOCOL_HOST));
  assert.match(executedScript, new RegExp(APP_RENDERER_PATHNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(executedScript, new RegExp(APP_RENDERER_CSP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('startup smoke exits directly after success to avoid macOS app lifecycle hangs', () => {
  const calls = [];

  completeStartupSmoke({
    exit: (code) => calls.push(['exit', code]),
    quit: () => calls.push(['quit'])
  });

  assert.deepEqual(calls, [['exit', 0]]);
});

test('packaged startup smoke writes failure logs and screenshots when configured', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-startup-failure-artifacts-'));
  try {
    const localFailurePath = path.join(directory, 'preload.js');
    await writeStartupSmokeFailureArtifacts({
      webContents: {
        capturePage: async () => ({
          toPNG: () => Buffer.from('png')
        }),
        executeJavaScript: async () => ({
          title: 'PostMeter Startup:FAIL:Authorization: Bearer startup-title-token xToken=startup-title-x-token',
          url: 'postmeter://renderer/index.html?access_token=startup-url-token&next=1',
          activeElement: {
            id: 'authBearerTokenInput',
            tagName: 'INPUT',
            type: 'text',
            name: '',
            ariaLabel: 'Bearer token xSecret=startup-aria-x-secret',
            text: 'startup-active-token'
          }
        })
      }
    }, {
      POSTMETER_UI_SMOKE_ARTIFACT_DIR: directory
    }, new Error(`startup failed at ${localFailurePath} Authorization: Bearer startup-token Cookie: sid=startup-cookie`));
    const files = await fs.readdir(directory);
    assert.ok(files.some((file) => file.endsWith('.log')));
    assert.ok(files.some((file) => file.endsWith('.json')));
    assert.ok(files.some((file) => file.endsWith('.png')));
    const logName = files.find((file) => file.endsWith('.log'));
    const jsonName = files.find((file) => file.endsWith('.json'));
    const log = await fs.readFile(path.join(directory, logName), 'utf8');
    const json = await fs.readFile(path.join(directory, jsonName), 'utf8');
    assert.match(log, /startup failed/);
    assert.match(log, /\[path\]/);
    assert.doesNotMatch(log, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(log, /startup-token|startup-cookie/);
    assert.doesNotMatch(json, /startup-title-token|startup-title-x-token|startup-url-token|startup-active-token|startup-aria-x-secret/);
    assert.equal(JSON.parse(json).activeElement.text, '[redacted]');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('UI regression smoke title watcher has enough CI headroom', () => {
  assert.equal(UI_REGRESSION_SMOKE_TITLE_TIMEOUT_MILLIS, 120_000);
});

test('UI typography smoke title watcher has enough CI headroom', () => {
  assert.equal(UI_TYPOGRAPHY_SMOKE_TITLE_TIMEOUT_MILLIS, 300_000);
});

test('startup smoke load-failure hooks fail fast with redacted artifacts before renderer load', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-startup-load-failure-'));
  const webContents = new EventEmitter();
  webContents.capturePage = async () => ({
    toPNG: () => Buffer.from('png')
  });
  webContents.executeJavaScript = async () => ({
    title: 'PostMeter Startup:FAIL:Authorization: Bearer load-title-token',
    activeElement: {
      id: 'authBearerTokenInput',
      tagName: 'INPUT',
      type: 'text',
      name: '',
      ariaLabel: 'Bearer token',
      text: 'load-active-token'
    }
  });
  const exits = [];
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  const originalConsoleError = console.error;
  try {
    console.error = () => {};
    bindStartupLoadFailureHooks({
      exit: (code) => {
        exits.push(code);
        resolveExit();
      }
    }, {
      webContents
    }, {
      POSTMETER_STARTUP_SMOKE: '1',
      POSTMETER_VALIDATION_ARTIFACT_DIR: directory
    });

    webContents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'postmeter-app://app/index.html', true);
    await exited;

    const files = await fs.readdir(directory);
    assert.deepEqual(exits, [1]);
    assert.ok(files.some((file) => file.endsWith('.log')));
    assert.ok(files.some((file) => file.endsWith('.json')));
    assert.ok(files.some((file) => file.endsWith('.png')));
    const json = await fs.readFile(path.join(directory, files.find((file) => file.endsWith('.json'))), 'utf8');
    assert.doesNotMatch(json, /load-title-token|load-active-token/);
  } finally {
    console.error = originalConsoleError;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('startup smoke writes redacted pre-window failure logs when configured', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-startup-pre-window-artifacts-'));
  try {
    await writeStartupSmokeFailureArtifacts(null, {
      POSTMETER_VALIDATION_ARTIFACT_DIR: directory
    }, new Error('workspace load failed Authorization: Bearer pre-window-token Cookie: sid=pre-window-cookie'));
    const files = await fs.readdir(directory);
    assert.ok(files.some((file) => file.endsWith('.log')));
    assert.equal(files.some((file) => file.endsWith('.png')), false);
    const logName = files.find((file) => file.endsWith('.log'));
    const log = await fs.readFile(path.join(directory, logName), 'utf8');
    assert.match(log, /workspace load failed/);
    assert.doesNotMatch(log, /pre-window-token|pre-window-cookie/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('UI smoke text redaction covers documented auth schemes and OAuth code fields', () => {
  const raw = [
    'Authorization: Basic basic-secret-value',
    'Authorization: Digest digest-secret-value',
    'Authorization: Digest username="alice", nonce="abc123", response="deadbeef"',
    'Digest username="standalone-user", realm="standalone-realm", nonce="standalone-nonce", uri="/standalone/path", response="standalone-response", cnonce="standalone-cnonce"',
    '{"Authorization":"Digest username=\\"json-user\\", nonce=\\"json-nonce\\", response=\\"json-response\\""}',
    '{"authorizationHeader":"OAuth oauth_token=\\"json-oauth-token\\", oauth_signature=\\"json-oauth-signature\\", oauth_nonce=\\"json-oauth-nonce\\""}',
    '{"authorizationHeader":"Digest username=\\"json-digest-user\\", realm=\\"json-digest-realm\\", nonce=\\"json-digest-nonce\\", uri=\\"/digest/private/path\\", response=\\"json-digest-response\\", cnonce=\\"json-digest-cnonce\\""}',
    '{"authHeader":"OAuth oauth_token=\\"json-auth-token\\", oauth_signature=\\"json-auth-signature\\", oauth_nonce=\\"json-auth-nonce\\""}',
    'Cookie sid=bare-cookie-secret; csrf=bare-cookie-second-secret',
    '{"Cookie":"sid=json-cookie-secret; csrf=json-second-cookie-secret"}',
    '{"cookieHeader":"sid=json-cookie-header-secret; csrf=json-cookie-header-second-secret"}',
    'Proxy-Authorization: Hawk hawk-secret-value',
    'Authorization: Token token-secret-value',
    'Authorization: OAuth oauth-secret-value',
    'Authorization: NTLM ntlm-secret-value',
    'Authorization: Negotiate negotiate-secret-value',
    'AWS4-HMAC-SHA256 Credential=aws-credential/20260502/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=aws-signature',
    'EG1-HMAC-SHA256 client_token=akamai-client;access_token=akamai-access;timestamp=20260502T000000Z;nonce=akamai-nonce;signature=akamai-signature',
    'X-Amz-Credential=aws-query-credential x-amz-credential=aws-lower-credential xAmzCredential=aws-camel-credential X-Amz-Signature=aws-query-signature X-Amz-Security-Token=aws-security-token',
    'https://example.test/path?visible=1&X-Amz-Credential=aws-url-credential&X-Amz-Signature=aws-url-signature&X-Amz-Security-Token=aws-url-security-token',
    'https://user:password@example.test/callback?access_token=url-token&visible=1',
    '-----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----',
    'C:\\Users\\alice\\oauth.json Digest realm="digest-private-realm", nonce="digest-secret-nonce", response="digest-secret-response"',
    'client-secret=hyphen client secret next=ok',
    'passphrase=client cert passphrase words next=ok',
    'credential=credential bag words next=ok',
    'credentials=credentials bag words next=ok',
    'Basic standalone-basic-secret',
    'Digest standalone-digest-secret',
    'Hawk standalone-hawk-secret',
    'Token standalone-token-secret',
    'OAuth standalone-oauth-secret',
    'NTLM standalone-ntlm-secret',
    'Negotiate standalone-negotiate-secret',
    'authorization_code=auth-code-secret',
    'authorization-code=secret authorization code words next=ok',
    'authorizationCode: camel-auth-code-secret',
    'authToken=ui-auth-token-secret authorizationToken=ui-authorization-token-secret clientToken=ui-client-token-secret bearerToken=ui-bearer-token-secret oauthToken=ui-oauth-token-secret',
    'xToken=ui-x-token-secret xSecret=ui-x-secret-secret aPassword=ui-a-password-secret x-token=ui-x-token-hyphen-secret {"xToken":"ui-json-x-token-secret"}',
    'token=ui-exact-token-secret code=ui-exact-code-secret state=ui-exact-state-secret',
    '{"token":"ui-json-token-secret","code":"ui-json-code-secret","state":"ui-json-state-secret"}',
    'device_code=device-code-secret',
    'user_code=user-code-secret',
    'code_verifier=code-verifier-secret',
    'clientAssertion=client-assertion-secret',
    'authorization code uiAuthCode client secret uiClientSecret device code uiDeviceCode user code uiUserCode code verifier uiVerifier client assertion uiAssertion cert passphrase uiPassphrase private key uiPrivateKey',
    'code verifier ui-code-verifier-secret body=ui-body-assignment-secret bodyPreview=ui-body-preview-assignment-secret responseText=ui-response-text-assignment-secret rendered-response=ui-rendered-response-assignment-secret {"body":"ui-json-body-secret"} responseBodyText ui-response-body-secret variables ui-variables-secret text ui-text-secret consoleOutput ui-console-secret payloadIdentifier ui-payload-secret'
  ].join('\n');

  const redacted = redactUiSmokeText(raw);

  assert.doesNotMatch(redacted, /basic-secret-value|digest-secret-value|hawk-secret-value|token-secret-value|oauth-secret-value|ntlm-secret-value|negotiate-secret-value/);
  assert.doesNotMatch(redacted, /aws-credential|aws-signature|akamai-client|akamai-access|akamai-nonce|akamai-signature|aws-query-credential|aws-lower-credential|aws-camel-credential|aws-query-signature|aws-security-token|aws-url-credential|aws-url-signature|aws-url-security-token|hyphen client secret|client secret next|client cert passphrase words|credential bag words|credentials bag words/);
  assert.doesNotMatch(redacted, /user:password|example\.test|url-token|visible=1|digest-private-realm|digest-secret-nonce|digest-secret-response|private-key-secret/);
  assert.doesNotMatch(redacted, /alice|abc123|deadbeef|standalone-user|standalone-realm|standalone-nonce|standalone-response|standalone-cnonce|\/standalone\/path|json-user|json-nonce|json-response|json-oauth-token|json-oauth-signature|json-oauth-nonce|json-digest-user|json-digest-realm|json-digest-nonce|json-digest-response|json-digest-cnonce|\/digest\/private\/path|json-auth-token|json-auth-signature|json-auth-nonce|bare-cookie-secret|bare-cookie-second-secret|json-cookie-secret|json-second-cookie-secret|json-cookie-header-secret|json-cookie-header-second-secret/);
  assert.doesNotMatch(redacted, /standalone-basic-secret|standalone-digest-secret|standalone-hawk-secret|standalone-token-secret|standalone-oauth-secret|standalone-ntlm-secret|standalone-negotiate-secret/);
  assert.doesNotMatch(redacted, /auth-code-secret|authorization code words|camel-auth-code-secret|ui-auth-token-secret|ui-authorization-token-secret|ui-client-token-secret|ui-bearer-token-secret|ui-oauth-token-secret|ui-x-token-secret|ui-x-secret-secret|ui-a-password-secret|ui-x-token-hyphen-secret|ui-json-x-token-secret|ui-exact-token-secret|ui-exact-code-secret|ui-exact-state-secret|ui-json-token-secret|ui-json-code-secret|ui-json-state-secret|device-code-secret|user-code-secret|code-verifier-secret|client-assertion-secret/);
  assert.doesNotMatch(redacted, /uiAuthCode|uiClientSecret|uiDeviceCode|uiUserCode|uiVerifier|uiAssertion|uiPassphrase|uiPrivateKey/);
  assert.doesNotMatch(redacted, /ui-code-verifier-secret|ui-body-assignment-secret|ui-body-preview-assignment-secret|ui-response-text-assignment-secret|ui-rendered-response-assignment-secret|ui-json-body-secret|ui-response-body-secret|ui-variables-secret|ui-text-secret|ui-console-secret|ui-payload-secret/);
  assert.match(redacted, /\[redacted\]/);
  assert.match(redacted, /\[url\]/);
  assert.match(redacted, /\[redacted-private-key\]/);
  assert.match(redacted, /\[redacted-auth\]/);

  const safeContext = redactUiSmokeText('OAuth 2.0 provider returned invalid_grant. Digest auth username is required. token endpoint failed.');
  assert.match(safeContext, /OAuth 2\.0 provider returned invalid_grant/);
  assert.match(safeContext, /Digest auth username is required/);
  assert.match(safeContext, /token endpoint failed/);
  assert.equal(redactUiSmokeText('Basic authentication failed. Bearer authentication is required.'), 'Basic authentication failed. Bearer authentication is required.');
  assert.equal(
    redactUiSmokeText('client secret is required. authorization code flow failed.'),
    'client secret is required. authorization code flow failed.'
  );
  assert.equal(
    redactUiSmokeText('Cookie authentication failed. Cookie jar disabled. Set-Cookie handling unavailable.'),
    'Cookie authentication failed. Cookie jar disabled. Set-Cookie handling unavailable.'
  );
  assert.equal(
    redactUiSmokeText('Cookie: sid=session-secret Basic authentication failed. Bearer authentication is required.'),
    'Cookie: [redacted] Basic authentication failed. Bearer authentication is required.'
  );
  assert.equal(
    redactUiSmokeText('Set-Cookie: sid=set-cookie-secret; Path=/; HttpOnly; Secure Basic authentication failed. Bearer authentication is required.'),
    'Set-Cookie: [redacted] Basic authentication failed. Bearer authentication is required.'
  );
  const bareCookieContext = redactUiSmokeText('provider failed Cookie sid=cookie-bare-secret OAuth 2.0 provider returned invalid_grant Set-Cookie sid=set-cookie-bare-secret Basic authentication required cookieHeader sid=cookie-header-bare-secret Bearer authentication required setCookieHeader sid=set-cookie-header-bare-secret Digest auth username was rejected');
  assert.doesNotMatch(bareCookieContext, /cookie-bare-secret|set-cookie-bare-secret|cookie-header-bare-secret|set-cookie-header-bare-secret/);
  assert.match(bareCookieContext, /OAuth 2\.0 provider returned invalid_grant/);
  assert.match(bareCookieContext, /Basic authentication required/);
  assert.match(bareCookieContext, /Bearer authentication required/);
  assert.match(bareCookieContext, /Digest auth username was rejected/);
});

test('UI smoke URL redaction consumes encoded query tails with quoted request aliases', async () => {
  const sample = "headers HeadersList [Array] [ { name: 'Authorization', value: 'class-annotation-array-secret' } ] next=safe";
  const url = `postmeter://renderer/index.html?access_token=url-token&sample=${encodeURIComponent(sample)}`;
  const redacted = redactUiSmokeText(url);

  assert.equal(redacted, '[url]');
  assert.doesNotMatch(redacted, /class-annotation-array-secret|Authorization|url-token|next=safe/);

  const state = await captureUiSmokeDomState({
    webContents: {
      executeJavaScript: async () => ({
        title: 'safe title',
        url,
        activeElement: null
      })
    }
  });

  assert.equal(state.url, '[url]');
  assert.doesNotMatch(JSON.stringify(state), /class-annotation-array-secret|Authorization|url-token|next=safe/);
});

test('UI smoke redaction preserves assignment separators for body aliases', () => {
  const nestedEscaped = JSON.stringify({
    output: JSON.stringify({
      body: 'ui-nested-json-body-secret',
      bodyPreview: 'ui-nested-json-preview-secret',
      responseText: 'ui-nested-json-response-secret',
      'rendered-response': 'ui-nested-json-rendered-secret'
    })
  });
  const redacted = redactUiSmokeText([
    'body=body-assignment-secret',
    'bodyPreview=body-preview-assignment-secret',
    'responseText=response-text-assignment-secret',
    'rendered-response=rendered-response-assignment-secret',
    '{"body":"json-body-secret"}',
    '{"responseText":"json-response-secret"}',
    nestedEscaped,
    '{\\"body\\":\\"ui-raw-escaped-body-secret\\",\\"responseText\\":\\"ui-raw-escaped-response-secret\\"}'
  ].join('\n'));

  assert.doesNotMatch(redacted, /body-assignment-secret|body-preview-assignment-secret|response-text-assignment-secret|rendered-response-assignment-secret|json-body-secret|json-response-secret|ui-nested-json-body-secret|ui-nested-json-preview-secret|ui-nested-json-response-secret|ui-nested-json-rendered-secret|ui-raw-escaped-body-secret|ui-raw-escaped-response-secret/);
  assert.match(redacted, /body=\[redacted\]/);
  assert.match(redacted, /bodyPreview=\[redacted\]/);
  assert.match(redacted, /responseText=\[redacted\]/);
  assert.match(redacted, /rendered-response=\[redacted\]/);
  assert.match(redacted, /\{"body":"\[redacted\]"\}/);
  assert.match(redacted, /\{"responseText":"\[redacted\]"\}/);
});

test('UI smoke failure artifact writer records logs DOM state and screenshots', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-failure-artifacts-'));
  try {
    await writeUiSmokeFailureArtifacts({
      webContents: {
        capturePage: async () => ({
          toPNG: () => Buffer.from('png')
        }),
        executeJavaScript: async () => ({
          title: 'PostMeter UI Regression:FAIL:mock failure Authorization: Bearer title-token xToken=title-x-token requestHeaders Authorization Bearer title-header-secret httpRequest {"method":"PATCH","size":1444,"bytes":1555} {"httpRequest":{"method":"PATCH","size":99991,"body":"quoted-artifact-request-secret"}}',
          url: 'postmeter://renderer/index.html?access_token=url-token&next=1',
          validation: 'mock validation xSecret=validation-x-secret metadata Authorization Bearer validation-metadata-secret httpResponse {"status":203,"statusText":"Non-Authoritative","size":1222,"timing":{"contentLength":1111}} {\\"httpResponse\\":{"status":226,"statusText":"IM Used","size":99997,"body":"escaped-artifact-response-secret"}}',
          activeElement: {
            id: 'textInputModalSingleLineInput',
            tagName: 'INPUT',
            type: 'password',
            name: '',
            ariaLabel: 'Secret value aPassword=aria-a-password-secret',
            text: 'local-secret-value'
          }
        })
      }
    }, {
      POSTMETER_VALIDATION_ARTIFACT_DIR: directory
    }, 'ui-regression', new Error('mock failure Authorization: Bearer log-token Cookie: sid=log-cookie access_token=log-access-token x-token=log-x-token requestHeaders Authorization Bearer log-header-secret requestInfo {"metrics":{"method":"PUT","size":77777}} responseDetails {"metrics":{"reason":"Created","contentLength":88888}} {"responseInfo":{"status":208,"statusText":"Already Reported","size":99995}}'));
    const files = await fs.readdir(directory);
    assert.ok(files.some((file) => file.endsWith('.log')));
    assert.ok(files.some((file) => file.endsWith('.json')));
    assert.ok(files.some((file) => file.endsWith('.png')));
    const logName = files.find((file) => file.endsWith('.log'));
    const jsonName = files.find((file) => file.endsWith('.json'));
    const log = await fs.readFile(path.join(directory, logName), 'utf8');
    assert.match(log, /mock failure/);
    assert.doesNotMatch(log, /log-token|log-cookie|log-access-token|log-x-token|log-header-secret|\b(?:77777|88888|99995)\b|Created|Already Reported/);
    const json = await fs.readFile(path.join(directory, jsonName), 'utf8');
    assert.match(json, /"url": "\[url\]"/);
    assert.doesNotMatch(json, /title-token|title-x-token|title-header-secret|url-token|next=1|validation-x-secret|validation-metadata-secret|aria-a-password-secret|quoted-artifact-request-secret|escaped-artifact-response-secret|\b(?:1444|1555|203|1222|1111|99991|99997)\b|Non-Authoritative|IM Used/);
    assert.equal(JSON.parse(json).activeElement.text, '[redacted]');
    assert.doesNotMatch(json, /local-secret-value/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('UI smoke failure artifact writer prefers dedicated UI artifact directory', async () => {
  const validationDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-validation-artifacts-'));
  const uiDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-artifacts-'));
  try {
    await writeUiSmokeFailureArtifacts({
      webContents: {
        capturePage: async () => ({
          toPNG: () => Buffer.from('png')
        }),
        executeJavaScript: async () => ({
          title: 'PostMeter UI Regression:FAIL:mock failure'
        })
      }
    }, {
      POSTMETER_VALIDATION_ARTIFACT_DIR: validationDirectory,
      POSTMETER_UI_SMOKE_ARTIFACT_DIR: uiDirectory
    }, 'ui-regression', new Error('mock failure'));
    const validationFiles = await fs.readdir(validationDirectory);
    const uiFiles = await fs.readdir(uiDirectory);
    assert.equal(validationFiles.length, 0);
    assert.ok(uiFiles.some((file) => file.endsWith('.log')));
    assert.ok(uiFiles.some((file) => file.endsWith('.json')));
    assert.ok(uiFiles.some((file) => file.endsWith('.png')));
  } finally {
    await fs.rm(validationDirectory, { recursive: true, force: true });
    await fs.rm(uiDirectory, { recursive: true, force: true });
  }
});

test('UI smoke failure artifact writer times out stalled DOM and screenshot capture', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-failure-timeout-'));
  try {
    const startedAt = Date.now();
    await writeUiSmokeFailureArtifacts({
      webContents: {
        capturePage: async () => new Promise(() => {}),
        executeJavaScript: async () => new Promise(() => {})
      }
    }, {
      POSTMETER_VALIDATION_ARTIFACT_DIR: directory,
      POSTMETER_UI_SMOKE_ARTIFACT_TIMEOUT_MS: '25'
    }, 'ui-regression', new Error('timeout failure Authorization: Bearer timeout-token'));
    const elapsedMillis = Date.now() - startedAt;
    const files = await fs.readdir(directory);
    const logName = files.find((file) => file.endsWith('.log'));
    const jsonName = files.find((file) => file.endsWith('.json'));
    assert.ok(elapsedMillis < 1000);
    assert.ok(logName);
    assert.ok(jsonName);
    assert.equal(files.some((file) => file.endsWith('.png')), false);
    const log = await fs.readFile(path.join(directory, logName), 'utf8');
    const json = JSON.parse(await fs.readFile(path.join(directory, jsonName), 'utf8'));
    assert.doesNotMatch(log, /timeout-token/);
    assert.match(json.captureError, /timed out/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('UI smoke DOM-state capture redacts secret-like active text inputs', async () => {
  for (const id of [
    'authBearerTokenInput',
    'authBasicPasswordInput',
    'authApiKeyValueInput',
    'authOauthAccessTokenInput',
    'authOauthRefreshTokenInput',
    'authOauthClientSecretInput',
    'authOauthUserCodeInput',
    'authCookieValueInput',
    'authClientPassphraseInput',
    'oauthClientSecretInput'
  ]) {
    const secretState = await captureUiSmokeDomState({
      webContents: {
        executeJavaScript: async () => ({
          activeElement: {
            id,
            tagName: 'INPUT',
            type: 'text',
            name: '',
            ariaLabel: '',
            text: 'local-secret-value'
          }
        })
      }
    });
    assert.equal(secretState.activeElement.text, '[redacted]', `${id} should redact active text`);
  }

  const cookieValueState = await captureUiSmokeDomState({
    webContents: {
      executeJavaScript: async () => ({
        activeElement: {
          id: '',
          tagName: 'INPUT',
          type: 'text',
          name: '',
          ariaLabel: 'Cookie 1 value',
          text: 'local-cookie-value'
        }
      })
    }
  });
  assert.equal(cookieValueState.activeElement.text, '[redacted]');

  const visibleState = await captureUiSmokeDomState({
    webContents: {
      executeJavaScript: async () => ({
        title: 'PostMeter UI Regression:FAIL:Authorization: Bearer title-secret requestHeaders Authorization Bearer title-header-secret',
        url: 'postmeter://renderer/index.html?authorization_code=url-code&next=1',
        activeElement: {
          id: 'urlInput',
          tagName: 'INPUT',
          type: 'text',
          name: '',
          ariaLabel: 'Request URL',
          text: 'https://api.example.test/users?token=visible',
          valueElement: true
        }
      })
    }
  });
  assert.equal(visibleState.activeElement.text, '');

  const tokenUrlState = await captureUiSmokeDomState({
    webContents: {
      executeJavaScript: async () => ({
        activeElement: {
          id: 'authOauthTokenUrlInput',
          tagName: 'INPUT',
          type: 'text',
          name: '',
          ariaLabel: 'OAuth token URL',
          text: 'https://auth.example.test/oauth/token',
          valueElement: true
        }
      })
    }
  });
  assert.equal(tokenUrlState.activeElement.text, '');

  const verificationUriState = await captureUiSmokeDomState({
    webContents: {
      executeJavaScript: async () => ({
        activeElement: {
          id: 'authOauthVerificationUriInput',
          tagName: 'INPUT',
          type: 'text',
          name: '',
          ariaLabel: 'OAuth verification URL',
          text: 'https://github.com/login/device?user_code=ABCD-EFGH&next=1',
          valueElement: true
        }
      })
    }
  });
  assert.equal(verificationUriState.activeElement.text, '');
});

test('UI smoke DOM-state capture redacts secret-like captured text fields', async () => {
  const state = await captureUiSmokeDomState({
    webContents: {
      executeJavaScript: async () => ({
        title: 'PostMeter UI Regression:FAIL:Authorization: Bearer title-secret',
        url: 'postmeter://renderer/index.html?authorization_code=url-code&next=1',
        activeElement: {
          id: 'requestNameTitle',
          tagName: 'DIV',
          type: '',
          name: '',
          ariaLabel: 'Request name',
          text: 'Visible request name'
        },
        visibleModal: {
          id: 'textInputModal',
          title: 'Secret value local-modal-secret',
          text: 'Secret value local-modal-secret\nuser code modal-user-code\n{"access_token":"modal-json-token"}'
        },
        validation: 'access_token=validation-token&next=1\nuser_code=validation-user-code&next=1\n{"refresh_token":"validation-json-token","authorizationCode":"validation-auth-code"}\nhttpRequest {"method":"PATCH","size":1444,"bytes":1555}',
        oauthProgress: 'Authorization: Bearer oauth-token\nProxy-Authorization: Basic proxy-secret\nmetadata Authorization Bearer oauth-metadata-secret\n{"client_secret":"oauth-json-secret","user_code":"oauth-json-user-code","clientAssertion":"oauth-client-assertion"}',
        responseStatus: 'headers Authorization Bearer response-header-secret\nhttpResponse {"status":203,"statusText":"Non-Authoritative","size":1222,"timing":{"contentLength":1111}}\n{"httpResponses":[{"status":207,"statusText":"Multi-Status","size":99994}]}',
        bodyText: 'client secret body-secret\n{"access_token":"body-json-token","client_secret":"body-json-secret"}\nCookie: session=body-cookie\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c\n-----BEGIN PRIVATE KEY-----\nabc123private\n-----END PRIVATE KEY-----\nproprietary response text',
        visiblePanels: [{
          id: 'workspacePanel',
          text: 'api_key=panel-key\n{"api_key":"panel-json-key"}\nSet-Cookie: sid=panel-cookie\nrequestInfo {"metrics":{"method":"PUT","size":77777}}\nresponseDetails {"metrics":{"reason":"Created","contentLength":88888}}\n{\\"httpResponse\\":{"status":226,"statusText":"IM Used","size":99997,"body":"escaped-panel-response-secret"}}\nproprietary panel text'
        }]
      })
    }
  });

  const json = JSON.stringify(state);
  assert.doesNotMatch(json, /title-secret|title-header-secret|url-code|local-modal-secret|modal-user-code|modal-json-token|validation-token|validation-user-code|validation-json-token|validation-auth-code|oauth-token|proxy-secret|oauth-metadata-secret|oauth-json-secret|oauth-json-user-code|oauth-client-assertion|response-header-secret|escaped-panel-response-secret|\b(?:1444|1555|203|1222|1111|77777|88888|99994|99997)\b|Non-Authoritative|Multi-Status|IM Used|Created|body-secret|body-json-token|body-json-secret|body-cookie|SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c|abc123private|panel-key|panel-json-key|panel-cookie|proprietary response text|proprietary panel text/);
  assert.equal(state.activeElement.text, 'Visible request name');
  assert.match(state.title, /\[redacted\]/);
  assert.equal(state.url, '[url]');
  assert.equal(state.visibleModal.text, undefined);
  assert.equal(state.visibleModal.textLength > 0, true);
  assert.equal(state.validation.present, true);
  assert.equal(state.validation.textLength > 0, true);
  assert.equal(state.oauthProgress.present, true);
  assert.equal(state.oauthProgress.textLength > 0, true);
  assert.equal(state.bodyText.textLength > 0, true);
  assert.equal(state.visiblePanels[0].text, undefined);
  assert.equal(state.visiblePanels[0].textLength > 0, true);
});

test('UI smoke DOM-state capture redacts active element ARIA metadata', async () => {
  const ariaLabel = JSON.stringify({
    output: JSON.stringify({
      requestHeaders: {
        Authorization: 'Bearer aria-header-secret'
      },
      responseText: 'aria-response-secret'
    })
  });
  const state = await captureUiSmokeDomState({
    webContents: {
      executeJavaScript: async () => ({
        activeElement: {
          id: 'request-tab-active',
          tagName: 'BUTTON',
          type: '',
          name: '',
          ariaLabel,
          text: 'safe active tab label'
        }
      })
    }
  });

  const json = JSON.stringify(state);
  assert.doesNotMatch(json, /aria-header-secret|aria-response-secret/);
  assert.match(state.activeElement.ariaLabel, /\[redacted\]/);
});

test('packaged startup smoke validates the full preload API contract list', () => {
  const api = requiredPreloadApiSurface().map((pathParts) => pathParts.join('.'));
  assert.ok(api.includes('app.versions'));
  assert.ok(api.includes('app.setMenuShortcutsIgnored'));
  assert.ok(api.includes('workspace.load'));
  assert.ok(api.includes('request.send'));
  assert.ok(api.includes('runner.start'));
  assert.ok(api.includes('sandboxPackages.fetch'));
  assert.ok(api.includes('diagnostics.export'));
});

test('packaged startup smoke validates overridden userData path', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-user-data-smoke-'));
  try {
    const dataPath = path.join(directory, 'workspace.json');
    const userDataPath = path.join(directory, 'userData');
    await fs.mkdir(userDataPath);
    await assert.doesNotReject(() => validateSmokeUserDataPath({
      getPath: () => userDataPath
    }, {
      POSTMETER_PACKAGED_SMOKE: '1',
      POSTMETER_DATA_PATH: dataPath
    }));
    await assert.rejects(() => validateSmokeUserDataPath({
      getPath: () => directory
    }, {
      POSTMETER_PACKAGED_SMOKE: '1',
      POSTMETER_DATA_PATH: dataPath
    }), /userData path mismatch/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('packaged startup smoke validates platform default userData roots', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-default-user-data-smoke-'));
  try {
    const env = {
      APPDATA: path.join(directory, 'AppData', 'Roaming'),
      HOME: path.join(directory, 'home'),
      USERPROFILE: path.join(directory, 'home'),
      XDG_CONFIG_HOME: path.join(directory, 'xdg-config'),
      POSTMETER_PACKAGED_SMOKE: '1',
      POSTMETER_PACKAGED_SMOKE_DEFAULT_PATH: '1'
    };
    const root = expectedDefaultUserDataRoot(env);
    const userDataPath = path.join(root, 'PostMeter');
    await fs.mkdir(userDataPath, { recursive: true });
    await assert.doesNotReject(() => validateSmokeUserDataPath({
      getPath: () => userDataPath
    }, env));
    const wrongUserDataPath = path.join(directory, 'wrong', 'PostMeter');
    await fs.mkdir(wrongUserDataPath, { recursive: true });
    await assert.rejects(() => validateSmokeUserDataPath({
      getPath: () => wrongUserDataPath
    }, env), /default userData path mismatch/);
    assert.equal(isPathInside(root, userDataPath), true);
    assert.equal(isPathInside(root, wrongUserDataPath), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
