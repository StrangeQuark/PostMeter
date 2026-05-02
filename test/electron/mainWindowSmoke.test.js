const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  bindStartupLoadFailureHooks,
  captureUiSmokeDomState,
  expectedDefaultUserDataRoot,
  isPathInside,
  requiredPreloadApiSurface,
  redactUiSmokeText,
  runStartupSmokeProbe,
  validateSmokeUserDataPath,
  writeStartupSmokeFailureArtifacts,
  writeUiSmokeFailureArtifacts
} = require('../../electron/mainWindow');
const {
  APP_PROTOCOL_HOST,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_CSP,
  APP_RENDERER_PATHNAME
} = require('../../electron/appProtocol');

test('startup smoke probe prevents renderer shutdown from overwriting marker save', async () => {
  let executedScript = '';
  const mainWindow = {
    webContents: {
      executeJavaScript: async (script) => {
        executedScript = script;
        return true;
      }
    }
  };

  await runStartupSmokeProbe({ quit() {} }, mainWindow, {
    POSTMETER_PACKAGED_SMOKE_MARKER: 'marker',
    POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD: ''
  });

  assert.match(executedScript, /window\.__postmeterSkipWorkspaceShutdownSave = true/);
  assert.match(executedScript, /window\.postmeter\.workspace\.save\(loaded\.workspace\)/);
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
          title: 'PostMeter Startup:FAIL:Authorization: Bearer startup-title-token',
          url: 'postmeter://renderer/index.html?access_token=startup-url-token&next=1',
          activeElement: {
            id: 'authBearerTokenInput',
            tagName: 'INPUT',
            type: 'text',
            name: '',
            ariaLabel: 'Bearer token',
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
    assert.doesNotMatch(json, /startup-title-token|startup-url-token|startup-active-token/);
    assert.equal(JSON.parse(json).activeElement.text, '[redacted]');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
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
    'Proxy-Authorization: Hawk hawk-secret-value',
    'Authorization: Token token-secret-value',
    'Authorization: OAuth oauth-secret-value',
    'Authorization: NTLM ntlm-secret-value',
    'Authorization: Negotiate negotiate-secret-value',
    'Basic standalone-basic-secret',
    'Digest standalone-digest-secret',
    'Hawk standalone-hawk-secret',
    'Token standalone-token-secret',
    'OAuth standalone-oauth-secret',
    'NTLM standalone-ntlm-secret',
    'Negotiate standalone-negotiate-secret',
    'authorization_code=auth-code-secret',
    'authorizationCode: camel-auth-code-secret',
    'device_code=device-code-secret',
    'user_code=user-code-secret',
    'code_verifier=code-verifier-secret',
    'clientAssertion=client-assertion-secret'
  ].join('\n');

  const redacted = redactUiSmokeText(raw);

  assert.doesNotMatch(redacted, /basic-secret-value|digest-secret-value|hawk-secret-value|token-secret-value|oauth-secret-value|ntlm-secret-value|negotiate-secret-value/);
  assert.doesNotMatch(redacted, /standalone-basic-secret|standalone-digest-secret|standalone-hawk-secret|standalone-token-secret|standalone-oauth-secret|standalone-ntlm-secret|standalone-negotiate-secret/);
  assert.doesNotMatch(redacted, /auth-code-secret|camel-auth-code-secret|device-code-secret|user-code-secret|code-verifier-secret|client-assertion-secret/);
  assert.match(redacted, /\[redacted\]/);
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
          title: 'PostMeter UI Regression:FAIL:mock failure Authorization: Bearer title-token',
          url: 'postmeter://renderer/index.html?access_token=url-token&next=1',
          validation: 'mock validation',
          activeElement: {
            id: 'textInputModalSingleLineInput',
            tagName: 'INPUT',
            type: 'password',
            name: '',
            ariaLabel: 'Secret value',
            text: 'local-secret-value'
          }
        })
      }
    }, {
      POSTMETER_VALIDATION_ARTIFACT_DIR: directory
    }, 'ui-regression', new Error('mock failure Authorization: Bearer log-token Cookie: sid=log-cookie access_token=log-access-token'));
    const files = await fs.readdir(directory);
    assert.ok(files.some((file) => file.endsWith('.log')));
    assert.ok(files.some((file) => file.endsWith('.json')));
    assert.ok(files.some((file) => file.endsWith('.png')));
    const logName = files.find((file) => file.endsWith('.log'));
    const jsonName = files.find((file) => file.endsWith('.json'));
    const log = await fs.readFile(path.join(directory, logName), 'utf8');
    assert.match(log, /mock failure/);
    assert.doesNotMatch(log, /log-token|log-cookie|log-access-token/);
    const json = await fs.readFile(path.join(directory, jsonName), 'utf8');
    assert.match(json, /next=1/);
    assert.doesNotMatch(json, /title-token|url-token/);
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
        title: 'PostMeter UI Regression:FAIL:Authorization: Bearer title-secret',
        url: 'postmeter://renderer/index.html?authorization_code=url-code&next=1',
        activeElement: {
          id: 'requestNameInput',
          tagName: 'INPUT',
          type: 'text',
          name: '',
          ariaLabel: 'Request name',
          text: 'Visible request name',
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
          id: 'requestNameInput',
          tagName: 'INPUT',
          type: 'text',
          name: '',
          ariaLabel: 'Request name',
          text: 'Visible request name'
        },
        visibleModal: {
          id: 'textInputModal',
          title: 'Secret value local-modal-secret',
          text: 'Secret value local-modal-secret\nuser code modal-user-code\n{"access_token":"modal-json-token"}'
        },
        validation: 'access_token=validation-token&next=1\nuser_code=validation-user-code&next=1\n{"refresh_token":"validation-json-token","authorizationCode":"validation-auth-code"}',
        oauthProgress: 'Authorization: Bearer oauth-token\nProxy-Authorization: Basic proxy-secret\n{"client_secret":"oauth-json-secret","user_code":"oauth-json-user-code","clientAssertion":"oauth-client-assertion"}',
        responseStatus: 'ERR',
        bodyText: 'client secret body-secret\n{"access_token":"body-json-token","client_secret":"body-json-secret"}\nCookie: session=body-cookie\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c\n-----BEGIN PRIVATE KEY-----\nabc123private\n-----END PRIVATE KEY-----\nproprietary response text',
        visiblePanels: [{
          id: 'workspacePanel',
          text: 'api_key=panel-key\n{"api_key":"panel-json-key"}\nSet-Cookie: sid=panel-cookie\nproprietary panel text'
        }]
      })
    }
  });

  const json = JSON.stringify(state);
  assert.doesNotMatch(json, /title-secret|url-code|local-modal-secret|modal-user-code|modal-json-token|validation-token|validation-user-code|validation-json-token|validation-auth-code|oauth-token|proxy-secret|oauth-json-secret|oauth-json-user-code|oauth-client-assertion|body-secret|body-json-token|body-json-secret|body-cookie|SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c|abc123private|panel-key|panel-json-key|panel-cookie|proprietary response text|proprietary panel text/);
  assert.equal(state.activeElement.text, 'Visible request name');
  assert.match(state.title, /\[redacted\]/);
  assert.match(state.url, /next=1/);
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

test('packaged startup smoke validates the full preload API contract list', () => {
  const api = requiredPreloadApiSurface().map((pathParts) => pathParts.join('.'));
  assert.ok(api.includes('app.versions'));
  assert.ok(api.includes('workspace.load'));
  assert.ok(api.includes('request.send'));
  assert.ok(api.includes('runner.start'));
  assert.ok(api.includes('sandboxPackages.fetch'));
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
