const crypto = require('node:crypto');

const PROMPT_TIMEOUT_MILLIS = 120_000;
const pendingPrompts = new Map();

function registerVaultPromptIpc(options = {}) {
  const { ipcMain } = options;
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    return;
  }
  ipcMain.handle('vault:prompt-response', async (event, promptId, decision = {}) => {
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
    pending.resolve(normalizeVaultPromptDecision(decision));
    return { ok: true };
  });
}

function createVaultPrompt(options = {}) {
  const {
    dialog,
    getMainWindow = () => undefined,
    persistDecision = async () => {},
    recordDiagnosticEvent = async () => {}
  } = options;
  return async function promptForVaultAccess(payload = {}) {
    const safePayload = safePromptPayload(payload);
    let decision = null;
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed?.()) {
      decision = await promptViaRenderer(mainWindow, safePayload).catch(() => null);
    }
    if (!decision) {
      decision = await promptViaDialog(dialog, mainWindow, safePayload);
    }
    const normalizedDecision = normalizeVaultPromptDecision(decision);
    if (normalizedDecision.granted || normalizedDecision.reset === true) {
      await persistDecision(normalizedDecision, safePayload);
    }
    await recordDiagnosticEvent({
      type: normalizedDecision.granted ? 'vault.prompt.granted' : 'vault.prompt.denied',
      level: normalizedDecision.granted ? 'info' : 'warn',
      outcome: normalizedDecision.granted ? 'completed' : 'denied',
      failureCode: normalizedDecision.granted ? undefined : 'vault_prompt_denied',
      fields: {
        operation: safePayload.operation,
        reset: normalizedDecision.reset === true,
        scope: normalizedDecision.scope
      }
    });
    return normalizedDecision;
  };
}

function promptViaRenderer(mainWindow, payload) {
  const promptId = crypto.randomBytes(12).toString('hex');
  const promptPayload = {
    ...payload,
    promptId
  };
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingPrompts.delete(promptId);
      resolve({ granted: false, scope: 'request' });
    }, PROMPT_TIMEOUT_MILLIS);
    timeout.unref?.();
    pendingPrompts.set(promptId, { resolve, sender: mainWindow.webContents, timeout });
    try {
      mainWindow.webContents.send('vault:prompt', promptPayload);
    } catch {
      pendingPrompts.delete(promptId);
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

async function promptViaDialog(dialog, mainWindow, payload) {
  if (!dialog || typeof dialog.showMessageBox !== 'function') {
    return { granted: false, scope: 'request' };
  }
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Deny once', 'Allow request', 'Allow collection', 'Allow workspace', 'Reset grants'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Allow script vault access?',
    message: `Allow "${payload.requestName}" to ${payload.operation} PostMeter vault secret "${payload.key}"?`,
    detail: [
      `Collection: ${payload.collectionName || payload.collectionId || 'Current collection'}`,
      `Workspace: ${payload.workspaceName || payload.workspaceId || 'Current workspace'}`,
      'The script receives only the requested secret value through the broker. Vault storage paths, encryption keys, and secret lists are never exposed to scripts.'
    ].join('\n')
  });
  if (result.response === 3) {
    return { granted: true, scope: 'workspace' };
  }
  if (result.response === 4) {
    return { granted: false, reset: true, scope: 'request' };
  }
  if (result.response === 2) {
    return { granted: true, scope: 'collection' };
  }
  if (result.response === 1) {
    return { granted: true, scope: 'request' };
  }
  return { granted: false, scope: 'request' };
}

function safePromptPayload(payload = {}) {
  return {
    collectionId: stringField(payload.collectionId, 256),
    collectionName: stringField(payload.collectionName, 256),
    key: stringField(payload.key, 256),
    operation: stringField(payload.operation || 'access', 64),
    requestId: stringField(payload.requestId, 256),
    requestName: stringField(payload.requestName || payload.requestId || 'this request', 256),
    workspaceId: stringField(payload.workspaceId, 256),
    workspaceName: stringField(payload.workspaceName || payload.workspaceId, 256)
  };
}

function normalizeVaultPromptDecision(decision = {}) {
  const scope = decision.scope === 'collection' || decision.scope === 'workspace'
    ? decision.scope
    : 'request';
  return {
    granted: decision.granted === true,
    reset: decision.reset === true,
    scope
  };
}

function applyVaultPromptDecisionToWorkspace(workspace = {}, payload = {}, decision = {}) {
  const next = JSON.parse(JSON.stringify(workspace || {}));
  next.settings ||= {};
  next.settings.sandbox ||= {};
  next.settings.sandbox.trustedCapabilities ||= {};
  const trusted = next.settings.sandbox.trustedCapabilities;
  if (decision.reset === true) {
    trusted.vault = false;
    trusted.vaultGrants = defaultVaultGrants();
    return next;
  }
  if (decision.granted !== true) {
    return next;
  }
  trusted.vaultGrants ||= defaultVaultGrants();
  const grants = trusted.vaultGrants;
  const scope = decision.scope === 'collection' || decision.scope === 'workspace'
    ? decision.scope
    : 'request';
  if (scope === 'workspace') {
    grants.workspace = true;
    return next;
  }
  if (scope === 'collection') {
    grants.collections = appendUnique(grants.collections, payload.collectionId);
    return next;
  }
  grants.requests = appendUnique(grants.requests, payload.requestId);
  return next;
}

function workspaceIdForVaultPromptDecision(payload = {}, fallbackWorkspaceId = '') {
  return stringField(payload?.workspaceId || fallbackWorkspaceId, 256);
}

function defaultVaultGrants() {
  return {
    workspace: false,
    collections: [],
    requests: [],
    deniedCollections: [],
    deniedRequests: []
  };
}

function appendUnique(values, value) {
  const normalized = stringField(value, 256);
  const next = Array.isArray(values) ? values.map((item) => String(item || '')) : [];
  if (normalized && !next.includes(normalized)) {
    next.push(normalized);
  }
  return next;
}

function stringField(value, maxLength) {
  return String(value == null ? '' : value).slice(0, maxLength);
}

module.exports = {
  applyVaultPromptDecisionToWorkspace,
  createVaultPrompt,
  normalizeVaultPromptDecision,
  registerVaultPromptIpc,
  workspaceIdForVaultPromptDecision
};
