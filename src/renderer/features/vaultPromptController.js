async function handleVaultPrompt(payload = {}) {
  await vaultPromptQueue.enqueue(payload);
}

async function promptVaultAccess(payload = {}) {
  activeVaultPromptPayload = payload;
  let decision = { granted: false, scope: 'request' };
  try {
    renderVaultPrompt(payload);
    decision = normalizeVaultPromptDecision(await showModal('vaultPromptModal', { granted: false, scope: 'request' }));
  } catch {
    decision = { granted: false, reset: false, scope: 'request' };
  } finally {
    activeVaultPromptPayload = null;
  }
  if (window.postmeter.vault?.resolvePrompt) {
    await window.postmeter.vault.resolvePrompt(payload.promptId, decision);
  }
}

function renderVaultPrompt(payload = {}) {
  $('vaultPromptRequestName').textContent = payload.requestName || payload.requestId || 'Current request';
  $('vaultPromptCollectionName').textContent = payload.collectionName || payload.collectionId || 'Current collection';
  $('vaultPromptWorkspaceName').textContent = payload.workspaceName || payload.workspaceId || 'Current workspace';
  $('vaultPromptSecretKey').textContent = payload.key || '(empty key)';
  $('vaultPromptOperation').textContent = payload.operation || 'access';
  $('allowVaultPromptCollectionButton').disabled = !payload.collectionId;
  $('vaultPromptMessage').textContent = `A script is asking to ${payload.operation || 'access'} a local vault secret.`;
}

function resolveVaultPrompt(decision) {
  if (!activeVaultPromptPayload) {
    return;
  }
  resolveActiveModal(normalizeVaultPromptDecision(decision));
}

function normalizeVaultPromptDecision(decision = {}) {
  return {
    granted: decision?.granted === true,
    reset: decision?.reset === true,
    scope: decision?.scope === 'collection' || decision?.scope === 'workspace' ? decision.scope : 'request'
  };
}
