const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { BrowserWindow } = require('electron');
const {
  APP_PROTOCOL_HOST,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_CSP,
  APP_RENDERER_PATHNAME,
  createAppRendererUrl,
  isTrustedAppRendererUrl
} = require('./appProtocol');
const { safeFilename } = require('./fileDialogs');
const {
  redactRequestResponseAliasesInText,
  redactTransportReferences
} = require('../src/core/diagnostics');

const DEFAULT_SMOKE_ARTIFACT_TIMEOUT_MILLIS = 2_000;
const UI_REGRESSION_SMOKE_TITLE_TIMEOUT_MILLIS = 30_000;
const UI_TYPOGRAPHY_SMOKE_TITLE_TIMEOUT_MILLIS = 180_000;
const UI_SMOKE_AUTH_SCHEME_NAMES = 'bearer|basic|digest|hawk|token|oauth|ntlm|negotiate|aws4-hmac-sha256|eg1-hmac-sha256';
const UI_SMOKE_SIMPLE_AUTH_SCHEME_NAMES = 'bearer|basic|digest|hawk|token|oauth|ntlm|negotiate';
const UI_SMOKE_AUTH_PARAMETER_PAIR_PATTERN = '[A-Za-z][A-Za-z0-9_-]*\\s*=\\s*(?:"[^"\\r\\n<>]*"|[^\\s,;\\[\\]\\\'"<>}&]+)';
const UI_SMOKE_AUTH_PARAMETER_PAIR_LIST_PATTERN = `${UI_SMOKE_AUTH_PARAMETER_PAIR_PATTERN}(?:\\s*[,;]\\s*${UI_SMOKE_AUTH_PARAMETER_PAIR_PATTERN})*`;
const UI_SMOKE_AUTH_PARAMETER_VALUE_PATTERN = '(?:[A-Za-z][A-Za-z0-9_-]*\\s*=\\s*(?:"[^"\\r\\n<>]*"|[^\\s,;\\[\\]\\\'"<>}&]+)|"[^"\\r\\n<>]*"|[^\\s,;\\[\\]\\\'"<>}&]+)(?:\\s*[,;]\\s*[A-Za-z][A-Za-z0-9_-]*\\s*=\\s*(?:"[^"\\r\\n<>]*"|[^\\s,;\\[\\]\\\'"<>}&]+))*';
const UI_SMOKE_AUTH_HEADER_VALUE_PATTERN = `(?:(?:${UI_SMOKE_AUTH_SCHEME_NAMES})\\s+)?${UI_SMOKE_AUTH_PARAMETER_VALUE_PATTERN}`;
const UI_SMOKE_AWS_QUERY_FIELD_PATTERN = String.raw`\b((?:x[-_]?amz[-_]?credential|x[-_]?amz[-_]?signature|x[-_]?amz[-_]?security[-_]?token|aws[-_]?credential|aws[-_]?signature))(\s*[:=]\s*["']?)[^\s&"',;<>}&\])]+`;
const UI_SMOKE_COOKIE_SAFE_CONTEXT_PATTERN = String.raw`OAuth\s+2\.0\b|token\s+endpoint\b|provider\s+(?:returned|failed|denied|reported)\b|HTTP\s+\d{3}\b|status\s*[:=]?\s*\d{3}\b|error(?:[-_\s]*description)?\s*[:=]|Basic\s+authentication\b|Bearer\s+authentication\b|Digest\s+auth\b|authentication\s+(?:failed|required)\b`;
const UI_SMOKE_COOKIE_HEADER_SAFE_CONTEXT_BOUNDARY_PATTERN = new RegExp(String.raw`\s+(?=(?:${UI_SMOKE_COOKIE_SAFE_CONTEXT_PATTERN}))`, 'i');

function createMainWindow(app, options = {}) {
  const env = options.env || process.env;
  const constrainedUiSmoke = env.POSTMETER_UI_CONSTRAINED_WINDOW === '1';
  const mainWindow = new BrowserWindow({
    width: constrainedUiSmoke ? 1040 : 1320,
    height: constrainedUiSmoke ? 700 : 860,
    minWidth: 1040,
    minHeight: 700,
    title: 'PostMeter',
    webPreferences: {
      preload: options.preloadPath || path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  const rendererUrl = options.rendererUrl || createAppRendererUrl(loadQuery(env));

  bindNavigationGuards(mainWindow, rendererUrl);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  bindSmokeHooks(app, mainWindow, env);
  const handleLoadFailure = bindStartupLoadFailureHooks(app, mainWindow, env);
  const loadPromise = mainWindow.loadURL(rendererUrl);
  if (loadPromise && typeof loadPromise.catch === 'function') {
    loadPromise.catch(handleLoadFailure);
  }
  return mainWindow;
}

function bindNavigationGuards(mainWindow, trustedRendererUrl) {
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedRendererNavigation(targetUrl, trustedRendererUrl)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

function isAllowedRendererNavigation(targetUrl, trustedRendererUrl = createAppRendererUrl()) {
  const trusted = normalizedRendererNavigationUrl(trustedRendererUrl);
  if (!trusted) {
    return false;
  }
  return normalizedRendererNavigationUrl(targetUrl) === trusted;
}

function normalizedRendererNavigationUrl(value) {
  if (!isTrustedAppRendererUrl(value)) {
    return '';
  }
  try {
    const parsed = new URL(String(value || ''));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function bindSmokeHooks(app, mainWindow, env) {
  const isUiWorkflowSmoke = env.POSTMETER_UI_WORKFLOW_SMOKE === '1';
  const isUiRegressionSmoke = env.POSTMETER_UI_REGRESSION_SMOKE === '1';
  const isUiSnapshotSmoke = env.POSTMETER_UI_SNAPSHOT_SMOKE === '1';
  const isUiTypographySmoke = env.POSTMETER_UI_TYPOGRAPHY_SMOKE === '1';
  const isUiOauthSmoke = env.POSTMETER_UI_OAUTH_SMOKE === '1';
  if (env.POSTMETER_STARTUP_SMOKE === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      runStartupSmokeProbe(app, mainWindow, env)
        .then(() => app.quit())
        .catch(async (error) => {
          await writeStartupSmokeFailureArtifacts(mainWindow, env, error);
          console.error(redactUiSmokeText(error.stack || error.message || String(error)));
          app.exit(1);
        });
    });
  }
  if (isUiWorkflowSmoke) {
    bindTitleSmoke(app, mainWindow, {
      env,
      prefix: 'PostMeter UI Workflow:',
      passTitle: 'PostMeter UI Workflow:PASS',
      timeoutMessage: 'PostMeter UI workflow smoke timed out.',
      timeoutMillis: 15_000
    });
  }
  if (isUiRegressionSmoke) {
    bindTitleSmoke(app, mainWindow, {
      env,
      prefix: 'PostMeter UI Regression:',
      passTitle: 'PostMeter UI Regression:PASS',
      timeoutMessage: 'PostMeter UI regression smoke timed out.',
      timeoutMillis: UI_REGRESSION_SMOKE_TITLE_TIMEOUT_MILLIS
    });
  }
  if (isUiSnapshotSmoke) {
    bindUiSnapshotSmoke(app, mainWindow, env);
  }
  if (isUiTypographySmoke) {
    bindTitleSmoke(app, mainWindow, {
      env,
      prefix: 'PostMeter UI Typography:',
      passTitle: 'PostMeter UI Typography:PASS',
      timeoutMessage: 'PostMeter UI typography smoke timed out.',
      timeoutMillis: UI_TYPOGRAPHY_SMOKE_TITLE_TIMEOUT_MILLIS
    });
  }
  if (isUiOauthSmoke) {
    bindTitleSmoke(app, mainWindow, {
      env,
      prefix: 'PostMeter UI OAuth:',
      passTitle: 'PostMeter UI OAuth:PASS',
      timeoutMessage: 'PostMeter UI OAuth smoke timed out.',
      timeoutMillis: 20_000
    });
  }
}

function bindStartupLoadFailureHooks(app, mainWindow, env) {
  let handled = false;
  let rendererLoaded = false;
  const fail = async (error) => {
    if (handled) {
      return;
    }
    handled = true;
    const failure = error instanceof Error ? error : new Error(String(error || 'Renderer load failed.'));
    if (env.POSTMETER_STARTUP_SMOKE !== '1') {
      console.error(redactUiSmokeText(failure.stack || failure.message || String(failure)));
      return;
    }
    try {
      await writeStartupSmokeFailureArtifacts(mainWindow, env, failure);
    } finally {
      console.error(redactUiSmokeText(failure.stack || failure.message || String(failure)));
      app.exit(1);
    }
  };
  if (env.POSTMETER_STARTUP_SMOKE === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      rendererLoaded = true;
    });
    mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame === false || rendererLoaded) {
        return;
      }
      void fail(new Error(`Renderer failed to load (${errorCode}): ${errorDescription || validatedUrl || 'unknown load error'}`));
    });
    mainWindow.webContents.once('preload-error', (_event, preloadPath, error) => {
      if (rendererLoaded) {
        return;
      }
      const message = error?.message || String(error || 'unknown preload error');
      void fail(new Error(`Renderer preload failed for ${preloadPath || 'preload'}: ${message}`));
    });
    mainWindow.webContents.once('render-process-gone', (_event, details) => {
      if (rendererLoaded) {
        return;
      }
      void fail(new Error(`Renderer process exited before startup smoke completed: ${details?.reason || 'unknown'} ${details?.exitCode ?? ''}`.trim()));
    });
  }
  return fail;
}

async function runStartupSmokeProbe(app, mainWindow, env) {
  await validateSmokeUserDataPath(app, env);
  const markerKey = '__postmeter_packaged_smoke';
  const markerValue = env.POSTMETER_PACKAGED_SMOKE_MARKER || 'startup-smoke';
  const expectReload = env.POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD === '1';
  const requiredPreloadApi = requiredPreloadApiSurface();
  const expectedRenderer = {
    csp: APP_RENDERER_CSP,
    hostname: APP_PROTOCOL_HOST,
    pathname: APP_RENDERER_PATHNAME,
    protocol: `${APP_PROTOCOL_SCHEME}:`
  };
  await mainWindow.webContents.executeJavaScript(`
    (async function () {
      const expectedRenderer = ${JSON.stringify(expectedRenderer)};
      if (window.location.protocol !== expectedRenderer.protocol
        || window.location.hostname !== expectedRenderer.hostname
        || window.location.pathname !== expectedRenderer.pathname) {
        throw new Error('Packaged smoke renderer URL is not the trusted app protocol URL: ' + window.location.href);
      }
      const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (!cspMeta || cspMeta.content !== expectedRenderer.csp) {
        throw new Error('Packaged smoke renderer CSP meta tag does not match the app protocol policy.');
      }
      if (!window.postmeter || !window.postmeter.app || !window.postmeter.workspace) {
        throw new Error('Packaged smoke preload API is unavailable.');
      }
      const requiredApi = ${JSON.stringify(requiredPreloadApi)};
      const missingApi = requiredApi.filter(function (path) {
        var cursor = window.postmeter;
        for (var index = 0; index < path.length; index += 1) {
          cursor = cursor && cursor[path[index]];
        }
        return typeof cursor !== 'function';
      });
      if (missingApi.length) {
        throw new Error('Packaged smoke preload API is missing: ' + missingApi.map(function (path) { return path.join('.'); }).join(', '));
      }
      const versions = await window.postmeter.app.versions();
      if (!versions.app || !versions.electron || !versions.node || !versions.chrome || !versions.releaseChannel || !versions.platform) {
        throw new Error('Packaged smoke version metadata is incomplete.');
      }
      if (!['stable', 'rc', 'beta', 'alpha'].includes(versions.releaseChannel)) {
        throw new Error('Packaged smoke release channel metadata is invalid.');
      }
      if (versions.platform !== ${JSON.stringify(process.platform)}) {
        throw new Error('Packaged smoke platform metadata does not match the host.');
      }
      const loaded = await window.postmeter.workspace.load();
      if (!loaded || !loaded.workspace || !Array.isArray(loaded.workspace.globals)) {
        throw new Error('Packaged smoke workspace load returned an invalid workspace.');
      }
      const key = ${JSON.stringify(markerKey)};
      const marker = ${JSON.stringify(markerValue)};
      const existing = loaded.workspace.globals.find((item) => item.key === key);
      if (${JSON.stringify(expectReload)} && (!existing || existing.value !== marker)) {
        throw new Error('Packaged smoke workspace persistence did not survive restart.');
      }
      if (!${JSON.stringify(expectReload)}) {
        const globals = loaded.workspace.globals.filter((item) => item.key !== key);
        globals.push({ enabled: true, key, value: marker });
        loaded.workspace.globals = globals;
        await window.postmeter.workspace.save(loaded.workspace);
      }
      window.__postmeterSkipWorkspaceShutdownSave = true;
      return true;
    })();
  `, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function validateSmokeUserDataPath(app, env) {
  if (!env.POSTMETER_PACKAGED_SMOKE || !app || typeof app.getPath !== 'function') {
    return;
  }
  const userDataPath = app.getPath('userData');
  if (!userDataPath) {
    throw new Error('Packaged smoke userData path is unavailable.');
  }
  const stat = await fs.stat(userDataPath);
  if (!stat.isDirectory()) {
    throw new Error(`Packaged smoke userData path is not a directory: ${userDataPath}`);
  }
  if (env.POSTMETER_DATA_PATH) {
    const expected = path.join(path.dirname(path.resolve(env.POSTMETER_DATA_PATH)), 'userData');
    if (path.resolve(userDataPath) !== path.resolve(expected)) {
      throw new Error(`Packaged smoke userData path mismatch: expected ${expected}, got ${userDataPath}`);
    }
    return;
  }
  if (env.POSTMETER_PACKAGED_SMOKE_DEFAULT_PATH === '1') {
    const expectedRoot = expectedDefaultUserDataRoot(env);
    if (!isPathInside(expectedRoot, userDataPath) || path.basename(userDataPath).toLowerCase() !== 'postmeter') {
      throw new Error(`Packaged smoke default userData path mismatch: expected a PostMeter directory under ${expectedRoot}, got ${userDataPath}`);
    }
  }
}

function expectedDefaultUserDataRoot(env, platform = process.platform) {
  if (platform === 'win32') {
    return path.resolve(env.APPDATA || path.join(env.USERPROFILE || env.HOME || '', 'AppData', 'Roaming'));
  }
  if (platform === 'darwin') {
    return path.resolve(env.HOME || '', 'Library', 'Application Support');
  }
  return path.resolve(env.XDG_CONFIG_HOME || path.join(env.HOME || '', '.config'));
}

function isPathInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function writeStartupSmokeFailureArtifacts(mainWindow, env, error) {
  const artifactDir = env.POSTMETER_UI_SMOKE_ARTIFACT_DIR || env.POSTMETER_VALIDATION_ARTIFACT_DIR;
  if (!artifactDir) {
    return;
  }
  try {
    await fs.mkdir(artifactDir, { recursive: true });
    const stamp = safeFilename(new Date().toISOString().replaceAll(':', '-'));
    const failureText = error?.stack || error?.message || String(error || 'Unknown startup smoke failure.');
    const baseName = `packaged-startup-smoke-failure-${stamp}`;
    await fs.writeFile(path.join(artifactDir, `${baseName}.log`), `${redactUiSmokeText(failureText)}\n`);
    if (!mainWindow?.webContents) {
      return;
    }
    const timeoutMillis = smokeArtifactTimeoutMillis(env);
    if (typeof mainWindow.webContents.executeJavaScript === 'function') {
      let domState;
      try {
        domState = await withSmokeArtifactTimeout(
          () => captureUiSmokeDomState(mainWindow),
          timeoutMillis,
          'packaged startup DOM-state capture'
        );
      } catch (captureError) {
        domState = {
          captureError: redactUiSmokeText(captureError.message || String(captureError))
        };
      }
      await fs.writeFile(path.join(artifactDir, `${baseName}.json`), `${JSON.stringify(domState, null, 2)}\n`);
    }
    if (typeof mainWindow.webContents.capturePage !== 'function') {
      return;
    }
    try {
      const image = await withSmokeArtifactTimeout(
        () => mainWindow.webContents.capturePage(),
        timeoutMillis,
        'packaged startup screenshot capture'
      );
      await fs.writeFile(path.join(artifactDir, `${baseName}.png`), image.toPNG());
    } catch (captureError) {
      console.error(`Unable to capture packaged startup smoke screenshot: ${redactUiSmokeText(captureError.message || String(captureError))}`);
    }
  } catch (artifactError) {
    console.error(`Unable to write packaged startup smoke failure artifacts: ${redactUiSmokeText(artifactError.message || String(artifactError))}`);
  }
}

function requiredPreloadApiSurface() {
  return [
    ['app', 'versions'],
    ['app', 'checkForUpdates'],
    ['app', 'openExternal'],
    ['app', 'onMenuAction'],
    ['session', 'load'],
    ['session', 'save'],
    ['session', 'saveSync'],
    ['workspace', 'load'],
    ['workspace', 'save'],
    ['workspace', 'saveCollection'],
    ['workspace', 'saveFolder'],
    ['workspace', 'saveRequest'],
    ['workspace', 'saveEnvironment'],
    ['workspace', 'saveSettings'],
    ['workspace', 'saveSync'],
    ['workspace', 'create'],
    ['workspace', 'rename'],
    ['workspace', 'switch'],
    ['workspace', 'delete'],
    ['workspace', 'importWorkspace'],
    ['workspace', 'exportWorkspace'],
    ['collection', 'importCollection'],
    ['collection', 'exportCollection'],
    ['diagnostics', 'export'],
    ['request', 'validate'],
    ['request', 'send'],
    ['request', 'importRequest'],
    ['request', 'exportRequest'],
    ['request', 'exportRequestText'],
    ['clipboard', 'writeText'],
    ['oauth', 'startPkceFlow'],
    ['oauth', 'startDeviceFlow'],
    ['oauth', 'cancelFlow'],
    ['oauth', 'cancelDeviceFlow'],
    ['oauth', 'onProgress'],
    ['vault', 'bindSecret'],
    ['vault', 'metadata'],
    ['vault', 'onPrompt'],
    ['vault', 'resolvePrompt'],
    ['vault', 'reset'],
    ['vault', 'unsetSecret'],
    ['sandboxPackages', 'fetch'],
    ['fileExport', 'choosePath'],
    ['fileExport', 'prepare'],
    ['fileExport', 'writePrepared'],
    ['fileExport', 'cancelPrepared'],
    ['runner', 'start'],
    ['runner', 'cancel'],
    ['runner', 'export'],
    ['runner', 'estimateResultStore'],
    ['runner', 'resultPage'],
    ['runner', 'resultDetail'],
    ['runner', 'onProgress'],
    ['performance', 'start'],
    ['performance', 'cancel'],
    ['performance', 'calibrate'],
    ['performance', 'cancelCalibration'],
    ['performance', 'importTest'],
    ['performance', 'exportTest'],
    ['performance', 'exportResult'],
    ['performance', 'estimateResultStore'],
    ['performance', 'resultPage'],
    ['performance', 'resultDetail'],
    ['performance', 'onProgress']
  ];
}

function bindTitleSmoke(app, mainWindow, options) {
  let finished = false;
  const failSmoke = async (message) => {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timeout);
    try {
      await writeUiSmokeFailureArtifacts(mainWindow, options.env || process.env, options.artifactLabel || options.prefix || 'ui-smoke', message);
    } finally {
      console.error(redactUiSmokeText(String(message || 'UI smoke failed.')));
      app.exit(1);
    }
  };
  const timeout = setTimeout(() => {
    void failSmoke(options.timeoutMessage);
  }, options.timeoutMillis);
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    if (!String(title).startsWith(options.prefix)) {
      return;
    }
    event.preventDefault();
    if (title === options.passTitle) {
      finished = true;
      clearTimeout(timeout);
      app.quit();
      return;
    }
    void failSmoke(title);
  });
}

async function writeUiSmokeFailureArtifacts(mainWindow, env, label, failure) {
  const artifactDir = env.POSTMETER_UI_SMOKE_ARTIFACT_DIR || env.POSTMETER_VALIDATION_ARTIFACT_DIR;
  if (!artifactDir || !mainWindow?.webContents) {
    return;
  }
  try {
    await fs.mkdir(artifactDir, { recursive: true });
    const stamp = safeFilename(new Date().toISOString().replaceAll(':', '-'));
    const artifactLabel = safeFilename(String(label || 'ui-smoke').toLowerCase());
    const baseName = `${artifactLabel}-failure-${stamp}`;
    const failureText = failure?.stack || failure?.message || String(failure || 'Unknown UI smoke failure.');
    await fs.writeFile(path.join(artifactDir, `${baseName}.log`), `${redactUiSmokeText(failureText)}\n`);
    const timeoutMillis = smokeArtifactTimeoutMillis(env);
    let domState;
    try {
      domState = await withSmokeArtifactTimeout(
        () => captureUiSmokeDomState(mainWindow),
        timeoutMillis,
        'UI smoke DOM-state capture'
      );
    } catch (captureError) {
      domState = {
        captureError: redactUiSmokeText(captureError.message || String(captureError))
      };
    }
    await fs.writeFile(path.join(artifactDir, `${baseName}.json`), `${JSON.stringify(domState, null, 2)}\n`);
    if (typeof mainWindow.webContents.capturePage === 'function') {
      try {
        const image = await withSmokeArtifactTimeout(
          () => mainWindow.webContents.capturePage(),
          timeoutMillis,
          'UI smoke screenshot capture'
        );
        await fs.writeFile(path.join(artifactDir, `${baseName}.png`), image.toPNG());
      } catch (captureError) {
        console.error(`Unable to capture UI smoke screenshot: ${redactUiSmokeText(captureError.message || String(captureError))}`);
      }
    }
  } catch (artifactError) {
    console.error(`Unable to write UI smoke failure artifacts: ${redactUiSmokeText(artifactError.message || String(artifactError))}`);
  }
}

async function captureUiSmokeDomState(mainWindow) {
  try {
    const domState = await mainWindow.webContents.executeJavaScript(`
      (function () {
        var active = document.activeElement;
        var visibleModal = Array.prototype.find.call(document.querySelectorAll('.modal'), function (modal) {
          return !modal.hidden;
        });
        var visiblePanels = Array.prototype.map.call(document.querySelectorAll('.tab-panel.active, [data-sidebar-panel-content]:not([hidden])'), function (panel) {
          var panelText = panel.innerText || '';
          return {
            id: panel.id || '',
            role: panel.getAttribute?.('role') || '',
            textLength: panelText.length
          };
        });
        var activeText = active ? String(active.innerText || active.value || '') : '';
        var activeIsValueElement = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || '');
        var modalTitle = '';
        if (visibleModal) {
          var labelledBy = visibleModal.getAttribute?.('aria-labelledby') || '';
          modalTitle = labelledBy ? (document.getElementById(labelledBy)?.innerText || '') : (visibleModal.getAttribute?.('aria-label') || '');
        }
        var modalText = visibleModal ? String(visibleModal.innerText || '') : '';
        var validationText = document.getElementById('validationLabel')?.textContent || '';
        var oauthText = document.getElementById('oauthProgressPanel')?.innerText || '';
        var bodyText = document.body?.innerText || '';
        var searchParams = new URLSearchParams(location.search || '');
        return {
          title: document.title,
          url: location.href,
          uiSmoke: {
            workflow: {
              enabled: searchParams.get('uiWorkflowSmoke') === '1',
              state: document.documentElement?.dataset?.uiWorkflowSmoke || '',
              startupStep: document.documentElement?.dataset?.uiWorkflowStartupStep || ''
            },
            regression: {
              enabled: searchParams.get('uiRegressionSmoke') === '1',
              state: document.documentElement?.dataset?.uiRegressionSmoke || ''
            },
            snapshot: {
              enabled: searchParams.get('uiSnapshotSmoke') === '1',
              state: document.documentElement?.dataset?.uiSnapshotSmoke || ''
            },
            typography: {
              enabled: searchParams.get('uiTypographySmoke') === '1',
              state: document.documentElement?.dataset?.uiTypographySmoke || ''
            },
            oauth: {
              enabled: searchParams.get('uiOauthSmoke') === '1',
              state: document.documentElement?.dataset?.uiOauthSmoke || ''
            }
          },
          activeElement: active ? {
            id: active.id || '',
            tagName: active.tagName || '',
            type: active.type || '',
            name: active.name || '',
            ariaLabel: active.getAttribute?.('aria-label') || '',
            text: activeIsValueElement ? '' : activeText.slice(0, 120),
            textLength: activeText.length,
            valueElement: Boolean(activeIsValueElement)
          } : null,
          visibleModal: visibleModal ? {
            id: visibleModal.id || '',
            role: visibleModal.getAttribute?.('role') || '',
            title: modalTitle.slice(0, 160),
            textLength: modalText.length
          } : null,
          validation: { present: validationText.length > 0, textLength: validationText.length },
          oauthProgress: { present: oauthText.length > 0, textLength: oauthText.length },
          responseStatus: document.getElementById('responseStatus')?.textContent || '',
          bodyText: { textLength: bodyText.length },
          visiblePanels: visiblePanels
        };
      })();
    `, true);
    return redactUiSmokeDomState(domState);
  } catch (error) {
    return {
      captureError: redactUiSmokeText(error.message || String(error))
    };
  }
}

function redactUiSmokeDomState(domState) {
  if (!domState || typeof domState !== 'object') {
    return domState;
  }
  for (const key of ['title', 'url']) {
    if (typeof domState[key] === 'string') {
      domState[key] = redactUiSmokeText(domState[key]);
    }
  }
  const activeElement = domState.activeElement;
  if (activeElement && typeof activeElement.ariaLabel === 'string') {
    activeElement.ariaLabel = redactUiSmokeText(activeElement.ariaLabel);
  }
  if (activeElement && shouldRedactUiSmokeElement(activeElement)) {
    activeElement.text = '[redacted]';
  } else if (activeElement?.valueElement === true) {
    activeElement.text = '';
  } else if (activeElement && typeof activeElement.text === 'string') {
    activeElement.text = redactUiSmokeText(activeElement.text);
  }
  if (domState.visibleModal) {
    if (typeof domState.visibleModal.title === 'string') {
      domState.visibleModal.title = redactUiSmokeText(domState.visibleModal.title);
    }
    if (typeof domState.visibleModal.text === 'string') {
      domState.visibleModal.textLength = domState.visibleModal.text.length;
      delete domState.visibleModal.text;
    }
  }
  for (const key of ['validation', 'oauthProgress', 'bodyText']) {
    if (typeof domState[key] === 'string') {
      domState[key] = { present: domState[key].length > 0, textLength: domState[key].length };
    }
  }
  for (const key of ['responseStatus']) {
    if (typeof domState[key] === 'string') {
      domState[key] = redactUiSmokeText(domState[key]);
    }
  }
  if (Array.isArray(domState.visiblePanels)) {
    for (const panel of domState.visiblePanels) {
      if (panel && typeof panel.text === 'string') {
        panel.textLength = panel.text.length;
        delete panel.text;
      }
    }
  }
  return domState;
}

function shouldRedactUiSmokeElement(element) {
  const type = String(element.type || '').toLowerCase();
  if (type === 'password' || type === 'hidden') {
    return true;
  }
  const exactSensitiveIds = new Set([
    'authBearerTokenInput',
    'authBasicPasswordInput',
    'authApiKeyValueInput',
    'authOauthAccessTokenInput',
    'authOauthRefreshTokenInput',
    'authOauthClientSecretInput',
    'authOauthUserCodeInput',
    'authCookieValueInput',
    'authClientPassphraseInput'
  ]);
  if (exactSensitiveIds.has(String(element.id || ''))) {
    return true;
  }
  const label = [
    element.id,
    element.name,
    element.ariaLabel
  ].map(normalizeUiSmokeElementLabel).join(' ');
  if (/\b(secret|password|passphrase|authorization|bearer|api\s*key|client\s*secret|access\s*token|refresh\s*token|id\s*token|device\s*code|user\s*code|code\s*verifier|cookie(?:\s+\d+)?\s+value|session\s+cookie)\b/.test(label)) {
    return true;
  }
  return /\btoken\b/.test(label) && !/\b(url|uri|endpoint)\b/.test(label);
}

function normalizeUiSmokeElementLabel(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .toLowerCase();
}

function redactUiSmokeText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return text;
  }
  const cookieKeyPattern = '(?:cookie[-_\\s]*header|set[-_\\s]*cookie(?:[-_\\s]*header)?|cookie)';
  const secretKeyPattern = '(?:secret[-_\\s]*value|secret[-_\\s]*(?:key|access[-_\\s]*key)|[A-Za-z][A-Za-z0-9]{0,80}[-_\\s]*(?:token|secret|password|passwd|passphrase|credential|credentials)|client[-_\\s]*secret|client[-_\\s]*assertion|api[-_\\s]*(?:key|secret)|subscription[-_\\s]*key|ocp[-_\\s]*apim[-_\\s]*subscription[-_\\s]*key|access[-_\\s]*key(?:[-_\\s]*id)?|shared[-_\\s]*access[-_\\s]*key|(?:account|consumer|license|public|private|signing|storage|webhook)[-_\\s]*key(?:[-_\\s]*id)?|consumer[-_\\s]*(?:key|secret)|oauth[-_\\s]*consumer[-_\\s]*(?:key|secret)|x[-_\\s]*(?:api[-_\\s]*key|access[-_\\s]*token|auth[-_\\s]*token|authorization[-_\\s]*token|csrf[-_\\s]*token|xsrf[-_\\s]*token)|access[-_\\s]*token|refresh[-_\\s]*token|id[-_\\s]*token|jwt[-_\\s]*token|auth[-_\\s]*token|authentication[-_\\s]*token|authorization[-_\\s]*token|bearer[-_\\s]*token|client[-_\\s]*token|oauth[-_\\s]*token|authorization[-_\\s]*code|authorization[-_\\s]*header|auth[-_\\s]*header|proxy[-_\\s]*authorization(?:[-_\\s]*header)?|device[-_\\s]*code|user[-_\\s]*code|code[-_\\s]*verifier|x[-_\\s]*amz[-_\\s]*credential|x[-_\\s]*amz[-_\\s]*signature|x[-_\\s]*amz[-_\\s]*security[-_\\s]*token|aws[-_\\s]*credential|aws[-_\\s]*signature|oauth[-_\\s]*signature|signature|nonce|mac|password|passwd|passphrase|credential|credentials|private[-_\\s]*key|cert(?:ificate)?[-_\\s]*passphrase|session[-_\\s]*id|session[-_\\s]*token|csrf[-_\\s]*token|xsrf[-_\\s]*token|token|code|state|secret)';
  const assignmentSecretKeyPattern = `(?:${secretKeyPattern}|${cookieKeyPattern})`;
  const cookieBareSafeWords = 'authentication|authenticated|auth|jar|jars|handling|handler|helpers?|access|disabled|enabled|unavailable|available|failed|failure|required|provider|returned|setting|settings|policy|policies|headers?|values?|metadata';
  const cookieNextLabelPattern = String.raw`(?:${cookieKeyPattern})\b(?:\s*[:=]|\s+(?=[^\r\n"'<>]{1,2048}=))`;
  const cookieValueTerminatorPattern = String.raw`(?=\s+(?:(?:${UI_SMOKE_COOKIE_SAFE_CONTEXT_PATTERN})|${cookieNextLabelPattern})|[\r\n]|$)`;
  const cookieBareValuePattern = String.raw`(?=[^\r\n"'<>]{1,2048}=)[^\r\n"'<>]*?`;
  const cookieAssignmentValuePattern = String.raw`[^\r\n"'<>]*?`;
  const secretBareSafeWords = 'is|are|was|were|be|must|should|may|can|cannot|not|endpoint|auth|authentication|authenticated|required|provider|returned|failed|failure|missing|empty|unset|invalid|expired|denied|enabled|disabled|available|unavailable|username|bearer|basic|digest|hawk|oauth|ntlm|negotiate|status|code|flow|grant|scope|scopes|setting|settings|policy|policies|field|fields|value|values|metadata|header|headers|cookie|cookies|jar';
  const authSchemeSafeValuePattern = String.raw`(?:2\.0|\[redacted\]|redacted|endpoint|app|application|auth|authentication|authenticated|token|bearer|basic|digest|hawk|oauth|ntlm|negotiate|username|required|provider|returned|failed|failure|missing|empty|unset|invalid|expired|denied|enabled|disabled|available|unavailable|status|code|flow|grant|scope|scopes|setting|settings|policy|policies|field|fields|value|values|metadata|header|headers|cookie|cookies|jar)(?=\s|$|[.,;:!?)}\]])`;
  const safeWordFollowPattern = String.raw`(?:\s|$|[.,;:!?)}\]])`;
  const requestResponseKeyPattern = String.raw`request[-_\s]*body(?:[-_\s]*text)?|response[-_\s]*body(?:[-_\s]*text)?|body[-_\s]*preview|rendered[-_\s]*response(?:[-_\s]*text)?|response[-_\s]*text|graphql[-_\s]*variables|form[-_\s]*data(?:[-_\s]*parts)?|protocol[-_\s]*messages?|grpc[-_\s]*messages?|websocket[-_\s]*messages?|socketio[-_\s]*messages?|console[-_\s]*output|script[-_\s]*console|script[-_\s]*logs?|payload[-_\s]*derived[-_\s]*identifier|payload[-_\s]*identifier|request[-_\s]*id[-_\s]*from[-_\s]*payload|id[-_\s]*from[-_\s]*payload|variables|body|data|text`;
  const requestResponseAssignmentValuePattern = '[^\\r\\n"\',;<>}&\\])]+?(?=\\s+[A-Za-z][A-Za-z0-9_.-]{0,128}\\s*[:=]|[\\r\\n"\',;<>}&\\])]|$)';
  const requestResponseBareFieldTerminatorPattern = String.raw`(?=\s+(?:${requestResponseKeyPattern})\b|[\r\n;,.]|$)`;
  const requestResponseBareFieldPattern = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${requestResponseKeyPattern})(\s+)(?!\[redacted\]|redacted\b)(?!(?:${secretBareSafeWords})${safeWordFollowPattern})([^\r\n;,.]*?)${requestResponseBareFieldTerminatorPattern}`, 'gi');
  const secretAssignmentValuePattern = `[^\\r\\n"',;<>}&\\])]+?(?=\\s+(?:${assignmentSecretKeyPattern}|[A-Za-z][A-Za-z0-9_.-]{0,128})\\s*[:=]|[\\r\\n"',;<>}&\\])]|$)`;
  const tokenValuePattern = '[^\\s,;\'"<>}&]+';
  const doubleQuotedSecretFieldPattern = new RegExp(`"(${assignmentSecretKeyPattern})"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'gi');
  const singleQuotedSecretFieldPattern = new RegExp(`'(${assignmentSecretKeyPattern})'\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, 'gi');
  let redacted = text
    .replace(doubleQuotedSecretFieldPattern, (_match, key) => `"${key}":"[redacted]"`)
    .replace(singleQuotedSecretFieldPattern, (_match, key) => `'${key}':'[redacted]'`);
  const sensitivePaths = [
    __dirname,
    path.dirname(__dirname),
    process.cwd(),
    os.homedir(),
    os.tmpdir()
  ].filter(Boolean);
  for (const sensitivePath of sensitivePaths) {
    redacted = redacted.split(String(sensitivePath)).join('[path]');
  }
  redacted = redactTransportReferences(redacted);
  return redacted
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted private key]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted jwt]')
    .replace(/\b[A-Za-z]:\\[^\s)'"<>]+/g, '[path]')
    .replace(/\/(?:home|Users|tmp|var\/folders|private\/var\/folders)\/[^\s)'"<>]+/g, '[path]')
    .replace(new RegExp(`(["']?\\b(?:proxy[-_\\s]*authorization(?:[-_\\s]*header)?|authorization(?:[-_\\s]*header)?|auth[-_\\s]*header)\\b["']?\\s*[:=]\\s*")((?:\\\\.|[^"\\\\])*)(")`, 'gi'), '$1[redacted]$3')
    .replace(new RegExp(`(['"]?\\b(?:proxy[-_\\s]*authorization(?:[-_\\s]*header)?|authorization(?:[-_\\s]*header)?|auth[-_\\s]*header)\\b['"]?\\s*[:=]\\s*')((?:\\\\.|[^'\\\\])*)(')`, 'gi'), '$1[redacted]$3')
    .replace(new RegExp(`(["']?\\b(?:proxy[-_\\s]*authorization(?:[-_\\s]*header)?|authorization(?:[-_\\s]*header)?|auth[-_\\s]*header)\\b["']?\\s*[:=]\\s*["']?)(?!["']?\\[redacted\\])${UI_SMOKE_AUTH_HEADER_VALUE_PATTERN}["']?`, 'gi'), '$1[redacted]')
    .replace(new RegExp(`\\b(set-cookie|cookie)\\b(\\s*[:=]\\s*["']?)([^\\n\\r'"<>]*?)${cookieValueTerminatorPattern}`, 'gi'), redactUiSmokeCookieHeaderValue)
    .replace(new RegExp(`((?<![A-Za-z0-9_-])["']?\\b${cookieKeyPattern}\\b["']?\\s*[:=]\\s*["']?)(?!\\s*\\[redacted\\])${cookieAssignmentValuePattern}${cookieValueTerminatorPattern}`, 'gi'), '$1[redacted]')
    .replace(new RegExp(`(?<![A-Za-z0-9_-])\\b(${cookieKeyPattern})\\b(\\s+)(?!(?:${cookieBareSafeWords})\\b)(?!\\[redacted\\])${cookieBareValuePattern}${cookieValueTerminatorPattern}`, 'gi'), '$1$2[redacted]')
    .replace(new RegExp(`(?<![A-Za-z0-9_-])(${UI_SMOKE_AUTH_SCHEME_NAMES})\\s+${UI_SMOKE_AUTH_PARAMETER_PAIR_LIST_PATTERN}`, 'gi'), '$1 [redacted]')
    .replace(new RegExp(`(?<![A-Za-z0-9_-])(${UI_SMOKE_SIMPLE_AUTH_SCHEME_NAMES})\\s+(?!(?:${authSchemeSafeValuePattern}))[A-Za-z0-9._~+/=-]{1,}`, 'gi'), '$1 [redacted]')
    .replace(new RegExp(UI_SMOKE_AWS_QUERY_FIELD_PATTERN, 'gi'), '$1$2[redacted];')
    .replace(/[\s\S]*/, (value) => redactRequestResponseAliasesInText(value, '[redacted]'))
    .replace(new RegExp(`((?<![A-Za-z0-9_-])["']?\\b(?:${requestResponseKeyPattern})\\b["']?\\s*[:=]\\s*["']?)(?!\\s*\\[redacted\\])${requestResponseAssignmentValuePattern}`, 'gi'), '$1[redacted]')
    .replace(requestResponseBareFieldPattern, '$1$2[redacted]')
    .replace(new RegExp(`((?<![A-Za-z0-9_-])["']?\\b${assignmentSecretKeyPattern}\\b["']?\\s*[:=]\\s*["']?)(?!\\s*\\[redacted\\])${secretAssignmentValuePattern}`, 'gi'), '$1[redacted]')
    .replace(new RegExp(`\\b(${secretKeyPattern})\\b(\\s+)(?!\\[redacted\\]\\b|redacted\\b)(?!(?:${secretBareSafeWords})${safeWordFollowPattern})${tokenValuePattern}`, 'gi'), '$1$2[redacted]');
}

function redactUiSmokeCookieHeaderValue(_match, key, separator, value = '') {
  const text = String(value || '');
  const safeBoundary = UI_SMOKE_COOKIE_HEADER_SAFE_CONTEXT_BOUNDARY_PATTERN.exec(text);
  return safeBoundary
    ? `${key}${separator}[redacted]${text.slice(safeBoundary.index)}`
    : `${key}${separator}[redacted]`;
}

function smokeArtifactTimeoutMillis(env = process.env) {
  const raw = env.POSTMETER_UI_SMOKE_ARTIFACT_TIMEOUT_MS || env.POSTMETER_VALIDATION_ARTIFACT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SMOKE_ARTIFACT_TIMEOUT_MILLIS;
}

async function withSmokeArtifactTimeout(operation, timeoutMillis, label) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMillis}ms.`));
        }, timeoutMillis);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function loadQuery(env) {
  const isUiWorkflowSmoke = env.POSTMETER_UI_WORKFLOW_SMOKE === '1';
  const isUiRegressionSmoke = env.POSTMETER_UI_REGRESSION_SMOKE === '1';
  const isUiSnapshotSmoke = env.POSTMETER_UI_SNAPSHOT_SMOKE === '1';
  const isUiTypographySmoke = env.POSTMETER_UI_TYPOGRAPHY_SMOKE === '1';
  const isUiOauthSmoke = env.POSTMETER_UI_OAUTH_SMOKE === '1';
  return isUiWorkflowSmoke || isUiRegressionSmoke || isUiSnapshotSmoke || isUiTypographySmoke || isUiOauthSmoke
    ? {
        uiWorkflowSmoke: isUiWorkflowSmoke ? '1' : '',
        uiRegressionSmoke: isUiRegressionSmoke ? '1' : '',
        uiSnapshotSmoke: isUiSnapshotSmoke ? '1' : '',
        uiTypographySmoke: isUiTypographySmoke ? '1' : '',
        uiOauthSmoke: isUiOauthSmoke ? '1' : '',
        uiWorkflowBaseUrl: env.POSTMETER_UI_WORKFLOW_BASE_URL || '',
        uiOauthBaseUrl: env.POSTMETER_UI_OAUTH_BASE_URL || ''
      }
    : undefined;
}

function bindUiSnapshotSmoke(app, mainWindow, env) {
  const expectedCaptures = new Set(['empty-state', 'request', 'context-menu', 'cookies', 'auth-oauth', 'response', 'test-results', 'runner', 'workspace-sandbox', 'long-labels', 'export-menu']);
  const captured = new Set();
  let finished = false;
  const failSnapshot = async (message) => {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timeout);
    try {
      await writeUiSmokeFailureArtifacts(mainWindow, env, 'ui-snapshot', message);
    } finally {
      console.error(redactUiSmokeText(String(message || 'UI snapshot smoke failed.')));
      app.exit(1);
    }
  };
  const timeout = setTimeout(() => {
    void failSnapshot('PostMeter UI snapshot smoke timed out.');
  }, 20_000);
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    if (!String(title).startsWith('PostMeter UI Snapshot:')) {
      return;
    }
    event.preventDefault();
    if (title === 'PostMeter UI Snapshot:PASS') {
      const missing = [...expectedCaptures].filter((label) => !captured.has(label));
      if (missing.length) {
        void failSnapshot(`PostMeter UI snapshot smoke missed captures: ${missing.join(', ')}`);
        return;
      }
      finished = true;
      clearTimeout(timeout);
      app.quit();
      return;
    }
    if (String(title).startsWith('PostMeter UI Snapshot:FAIL:')) {
      void failSnapshot(title);
      return;
    }
    const prefix = 'PostMeter UI Snapshot:CAPTURE:';
    if (!String(title).startsWith(prefix)) {
      return;
    }
    const label = safeFilename(String(title).slice(prefix.length));
    captureUiSnapshot(mainWindow, label, env)
      .then(() => {
        captured.add(label);
        return mainWindow.webContents.executeJavaScript('window.__postmeterSnapshotContinue?.()', true);
      })
      .catch((error) => {
        void failSnapshot(error.stack || error.message || String(error));
      });
  });
}

async function captureUiSnapshot(mainWindow, label, env) {
  const image = await mainWindow.webContents.capturePage();
  const size = image.getSize();
  if (size.width < 800 || size.height < 600) {
    throw new Error(`UI snapshot ${label} is too small: ${size.width}x${size.height}.`);
  }
  if (!nativeImageHasVariance(image)) {
    throw new Error(`UI snapshot ${label} appears blank.`);
  }
  const snapshotDir = env.POSTMETER_UI_SNAPSHOT_DIR;
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

module.exports = {
  bindNavigationGuards,
  bindStartupLoadFailureHooks,
  createMainWindow,
  expectedDefaultUserDataRoot,
  captureUiSmokeDomState,
  isAllowedRendererNavigation,
  isPathInside,
  loadQuery,
  nativeImageHasVariance,
  normalizedRendererNavigationUrl,
  redactUiSmokeText,
  requiredPreloadApiSurface,
  runStartupSmokeProbe,
  UI_REGRESSION_SMOKE_TITLE_TIMEOUT_MILLIS,
  validateSmokeUserDataPath,
  writeUiSmokeFailureArtifacts,
  writeStartupSmokeFailureArtifacts
};
