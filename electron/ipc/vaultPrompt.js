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
    promptTimeoutMillis = PROMPT_TIMEOUT_MILLIS,
    rateLimitMillis = 1000,
    recordDiagnosticEvent = async () => {}
  } = options;
  const recentPrompts = new Map();
  return async function promptForVaultAccess(payload = {}) {
    const safePayload = safePromptPayload(payload);
    if (vaultPromptRateLimited(recentPrompts, safePayload, rateLimitMillis)) {
      await recordDiagnosticEvent({
        type: 'vault.prompt.denied',
        level: 'warn',
        outcome: 'denied',
        failureCode: 'vault_prompt_rate_limited',
        fields: {
          operation: safePayload.operation,
          reset: false,
          scope: 'request'
        }
      });
      return { granted: false, reset: false, scope: 'request' };
    }
    let decision = null;
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed?.()) {
      decision = await promptViaRenderer(mainWindow, safePayload, { timeoutMillis: promptTimeoutMillis }).catch(() => null);
    }
    if (!decision) {
      decision = await promptViaDialog(dialog, mainWindow, safePayload);
    }
    const normalizedDecision = normalizeVaultPromptDecision(decision, safePayload);
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

function promptViaRenderer(mainWindow, payload, options = {}) {
  const promptId = crypto.randomBytes(32).toString('hex');
  const promptPayload = {
    ...payload,
    promptId
  };
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingPrompts.delete(promptId);
      resolve({ granted: false, scope: 'request' });
    }, normalizeTimeoutMillis(options.timeoutMillis));
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
    allowedScopes: normalizeAllowedScopes(payload.allowedScopes),
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

function normalizeVaultPromptDecision(decision = {}, promptPayload = {}) {
  const allowedScopes = normalizeAllowedScopes(promptPayload.allowedScopes);
  const scope = decision.scope === 'collection' || decision.scope === 'workspace'
    ? decision.scope
    : 'request';
  const boundedScope = allowedScopes.includes(scope)
    ? scope
    : allowedScopes.includes('request')
      ? 'request'
      : allowedScopes[0] || 'request';
  return {
    granted: decision.granted === true,
    reset: decision.reset === true,
    scope: boundedScope
  };
}

function applyVaultPromptDecisionToWorkspace(workspace = {}, payload = {}, decision = {}) {
  const next = JSON.parse(JSON.stringify(workspace || {}));
  next.localsettings ||= {};
  next.localsettings.sandbox ||= {};
  next.localsettings.sandbox.trustedCapabilities ||= {};
  const trusted = next.localsettings.sandbox.trustedCapabilities;
  if (decision.reset === true) {
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

function normalizeAllowedScopes(value) {
  const scopes = (Array.isArray(value) ? value : ['request', 'collection', 'workspace'])
    .map((item) => String(item || '').trim())
    .filter((item) => item === 'request' || item === 'collection' || item === 'workspace');
  return scopes.length ? [...new Set(scopes)] : ['request'];
}

function vaultPromptRateLimited(recentPrompts, payload = {}, intervalMillis = 1000) {
  const interval = Math.max(0, Number(intervalMillis) || 0);
  if (!interval) {
    return false;
  }
  const key = [
    payload.workspaceId,
    payload.collectionId,
    payload.requestId,
    payload.operation,
    payload.key
  ].join('|');
  const now = Date.now();
  const lastPromptedAt = recentPrompts.get(key) || 0;
  recentPrompts.set(key, now);
  return lastPromptedAt > 0 && now - lastPromptedAt < interval;
}

function normalizeTimeoutMillis(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return PROMPT_TIMEOUT_MILLIS;
  }
  return Math.max(1, Math.min(PROMPT_TIMEOUT_MILLIS, Math.floor(number)));
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
