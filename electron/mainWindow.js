const fs = require('node:fs/promises');
const path = require('node:path');
const { BrowserWindow } = require('electron');
const { safeFilename } = require('./fileDialogs');

function createMainWindow(app, options = {}) {
  const env = options.env || process.env;
  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  bindSmokeHooks(app, mainWindow, env);
  mainWindow.loadFile(options.indexPath || path.join(__dirname, '..', 'src', 'renderer', 'index.html'), loadOptions(env));
  return mainWindow;
}

function bindSmokeHooks(app, mainWindow, env) {
  const isUiWorkflowSmoke = env.POSTMETER_UI_WORKFLOW_SMOKE === '1';
  const isUiRegressionSmoke = env.POSTMETER_UI_REGRESSION_SMOKE === '1';
  const isUiSnapshotSmoke = env.POSTMETER_UI_SNAPSHOT_SMOKE === '1';
  const isUiOauthSmoke = env.POSTMETER_UI_OAUTH_SMOKE === '1';
  if (env.POSTMETER_STARTUP_SMOKE === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 250);
    });
  }
  if (isUiWorkflowSmoke) {
    bindTitleSmoke(app, mainWindow, {
      prefix: 'PostMeter UI Workflow:',
      passTitle: 'PostMeter UI Workflow:PASS',
      timeoutMessage: 'PostMeter UI workflow smoke timed out.',
      timeoutMillis: 15_000
    });
  }
  if (isUiRegressionSmoke) {
    bindTitleSmoke(app, mainWindow, {
      prefix: 'PostMeter UI Regression:',
      passTitle: 'PostMeter UI Regression:PASS',
      timeoutMessage: 'PostMeter UI regression smoke timed out.',
      timeoutMillis: 10_000
    });
  }
  if (isUiSnapshotSmoke) {
    bindUiSnapshotSmoke(app, mainWindow, env);
  }
  if (isUiOauthSmoke) {
    bindTitleSmoke(app, mainWindow, {
      prefix: 'PostMeter UI OAuth:',
      passTitle: 'PostMeter UI OAuth:PASS',
      timeoutMessage: 'PostMeter UI OAuth smoke timed out.',
      timeoutMillis: 20_000
    });
  }
}

function bindTitleSmoke(app, mainWindow, options) {
  const timeout = setTimeout(() => {
    console.error(options.timeoutMessage);
    app.exit(1);
  }, options.timeoutMillis);
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    if (!String(title).startsWith(options.prefix)) {
      return;
    }
    event.preventDefault();
    clearTimeout(timeout);
    if (title === options.passTitle) {
      app.quit();
      return;
    }
    console.error(title);
    app.exit(1);
  });
}

function loadOptions(env) {
  const isUiWorkflowSmoke = env.POSTMETER_UI_WORKFLOW_SMOKE === '1';
  const isUiRegressionSmoke = env.POSTMETER_UI_REGRESSION_SMOKE === '1';
  const isUiSnapshotSmoke = env.POSTMETER_UI_SNAPSHOT_SMOKE === '1';
  const isUiOauthSmoke = env.POSTMETER_UI_OAUTH_SMOKE === '1';
  return isUiWorkflowSmoke || isUiRegressionSmoke || isUiSnapshotSmoke || isUiOauthSmoke
    ? {
        query: {
          uiWorkflowSmoke: isUiWorkflowSmoke ? '1' : '',
          uiRegressionSmoke: isUiRegressionSmoke ? '1' : '',
          uiSnapshotSmoke: isUiSnapshotSmoke ? '1' : '',
          uiOauthSmoke: isUiOauthSmoke ? '1' : '',
          uiWorkflowBaseUrl: env.POSTMETER_UI_WORKFLOW_BASE_URL || '',
          uiOauthBaseUrl: env.POSTMETER_UI_OAUTH_BASE_URL || ''
        }
      }
    : undefined;
}

function bindUiSnapshotSmoke(app, mainWindow, env) {
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
    captureUiSnapshot(mainWindow, label, env)
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
  createMainWindow,
  nativeImageHasVariance
};
