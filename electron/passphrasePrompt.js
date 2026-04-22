const path = require('node:path');
const { BrowserWindow, ipcMain } = require('electron');

let activePrompt = null;
let promptHandlerRegistered = false;

async function promptForPassphrase(options = {}) {
  if (process.env.POSTMETER_SECRET_PASSPHRASE) {
    return process.env.POSTMETER_SECRET_PASSPHRASE;
  }
  if (activePrompt) {
    return activePrompt.promise;
  }
  ensurePromptHandler();

  let resolvePrompt;
  const promptWindow = new BrowserWindow({
    width: 460,
    height: 290,
    minWidth: 460,
    minHeight: 290,
    maxWidth: 640,
    maxHeight: 420,
    title: options.title || 'Workspace Secret Passphrase',
    parent: options.parent || undefined,
    modal: Boolean(options.parent),
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'passphrasePromptPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  const promptPromise = new Promise((resolve) => {
    resolvePrompt = resolve;
  });
  activePrompt = {
    window: promptWindow,
    promise: promptPromise,
    resolve(value) {
      resolvePrompt(value);
      activePrompt = null;
      if (!promptWindow.isDestroyed()) {
        promptWindow.close();
      }
    }
  };

  promptWindow.once('ready-to-show', () => {
    promptWindow.show();
  });
  promptWindow.once('closed', () => {
    if (activePrompt?.window === promptWindow) {
      activePrompt.resolve(null);
    }
  });
  await promptWindow.loadFile(path.join(__dirname, 'passphrasePrompt.html'), {
    query: {
      message: options.message || 'Enter the fallback passphrase for this workspace.',
      confirmLabel: options.confirmLabel || 'Unlock'
    }
  });

  return promptPromise;
}

function ensurePromptHandler() {
  if (promptHandlerRegistered) {
    return;
  }
  promptHandlerRegistered = true;
  ipcMain.handle('passphrase-prompt:submit', (event, value) => {
    if (!activePrompt || event.sender.id !== activePrompt.window.webContents.id) {
      throw new Error('Passphrase prompt is not active.');
    }
    activePrompt.resolve(String(value || ''));
  });
  ipcMain.handle('passphrase-prompt:cancel', (event) => {
    if (!activePrompt || event.sender.id !== activePrompt.window.webContents.id) {
      throw new Error('Passphrase prompt is not active.');
    }
    activePrompt.resolve(null);
  });
}

module.exports = {
  promptForPassphrase
};
