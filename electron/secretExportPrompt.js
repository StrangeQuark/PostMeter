const path = require('node:path');
const { BrowserWindow, ipcMain } = require('electron');

let activePrompt = null;
let promptHandlerRegistered = false;

async function promptForSecretExportConfirmation(options = {}) {
  if (activePrompt) {
    return activePrompt.promise;
  }
  ensurePromptHandler();

  let resolvePrompt;
  const promptWindow = new BrowserWindow({
    width: 520,
    height: 330,
    minWidth: 520,
    minHeight: 330,
    maxWidth: 720,
    maxHeight: 460,
    title: options.title || 'Export Secret Values',
    parent: options.parent || undefined,
    modal: Boolean(options.parent),
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'secretExportPromptPreload.js'),
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
    phrase: String(options.phrase || ''),
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

  await promptWindow.loadFile(path.join(__dirname, 'secretExportPrompt.html'), {
    query: {
      title: options.heading || 'Export exact secret values',
      message: options.message || 'Type the confirmation phrase to export tokens, passwords, and secret variables without redaction.',
      phrase: activePrompt.phrase,
      confirmLabel: options.confirmLabel || 'Export Exact Values'
    }
  });

  return promptPromise;
}

function ensurePromptHandler() {
  if (promptHandlerRegistered) {
    return;
  }
  promptHandlerRegistered = true;
  ipcMain.handle('secret-export-prompt:submit', (event, value) => {
    if (!activePrompt || event.sender.id !== activePrompt.window.webContents.id) {
      throw new Error('Secret export confirmation prompt is not active.');
    }
    activePrompt.resolve(String(value || ''));
  });
  ipcMain.handle('secret-export-prompt:cancel', (event) => {
    if (!activePrompt || event.sender.id !== activePrompt.window.webContents.id) {
      throw new Error('Secret export confirmation prompt is not active.');
    }
    activePrompt.resolve(null);
  });
}

module.exports = {
  promptForSecretExportConfirmation
};
