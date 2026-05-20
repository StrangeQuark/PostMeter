const crypto = require('node:crypto');
const { assertWorkspaceEncryptionKey } = require('../../src/core/workspace/workspaceEncryption');

const PROMPT_TIMEOUT_MILLIS = 120_000;
const pendingPrompts = new Map();

function registerWorkspaceKeyPromptIpc(options = {}) {
  const { ipcMain } = options;
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    return;
  }
  ipcMain.handle('workspace:key-prompt-response', async (event, promptId, key = '') => {
    const id = String(promptId || '');
    const pending = pendingPrompts.get(id);
    if (!pending) {
      return { ok: false };
    }
    if (pending.sender && event?.sender !== pending.sender) {
      return { ok: false };
    }
    pendingPrompts.delete(id);
    clearTimeout(pending.timeout);
    pending.resolve(typeof key === 'string' ? key : '');
    return { ok: true };
  });
}

function createWorkspaceKeyPrompt(options = {}) {
  const {
    getMainWindow = () => undefined
  } = options;
  return async function promptForWorkspaceKey(payload = {}) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed?.()) {
      throw new Error('Workspace encryption key is required, but no application window is available.');
    }
    const key = await promptViaRenderer(mainWindow, safePromptPayload(payload));
    assertWorkspaceEncryptionKey(key);
    return key;
  };
}

function promptViaRenderer(mainWindow, payload) {
  const promptId = crypto.randomBytes(12).toString('hex');
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingPrompts.delete(promptId);
      resolve('');
    }, PROMPT_TIMEOUT_MILLIS);
    timeout.unref?.();
    pendingPrompts.set(promptId, { resolve, sender: mainWindow.webContents, timeout });
    try {
      mainWindow.webContents.send('workspace:key-prompt', {
        ...payload,
        promptId
      });
    } catch {
      pendingPrompts.delete(promptId);
      clearTimeout(timeout);
      resolve('');
    }
  });
}

function safePromptPayload(payload = {}) {
  return {
    reason: stringField(payload.reason || 'save', 64),
    workspaceId: stringField(payload.workspaceId, 256),
    workspaceName: stringField(payload.workspaceName || payload.workspaceId || 'Current workspace', 256)
  };
}

function stringField(value, maxLength) {
  return String(value == null ? '' : value).slice(0, maxLength);
}

module.exports = {
  createWorkspaceKeyPrompt,
  registerWorkspaceKeyPromptIpc
};
