const { artifactIsImportedUntrusted } = require('../../src/core/security/importProvenance');
const { normalizeHostname } = require('../../src/core/security/networkPolicy');

function createRequestNetworkPolicyForWorkspace(options = {}) {
  const workspace = options.workspace || {};
  const localSecurity = workspace.localsettings?.security || {};
  const allowedHosts = new Set(localSecurity.privateNetworkPolicySource === 'main'
    ? localSecurity.allowedPrivateNetworkHosts || []
    : []);
  const importedUntrusted = localSecurity.importedUntrusted === true
    || artifactIsImportedUntrusted(...(options.artifacts || []));
  const allowPrivateNetworkRequests = localSecurity.allowPrivateNetworkRequests === true
    && localSecurity.privateNetworkPolicySource === 'main';
  if (!importedUntrusted && localSecurity.blockPrivateNetworkRequests !== true) {
    return { enabled: false };
  }
  return {
    enabled: true,
    allowPrivateNetworkRequests: allowPrivateNetworkRequests || localSecurity.blockPrivateNetworkRequests !== true && !importedUntrusted,
    recordDiagnosticEvent: options.recordDiagnosticEvent,
    confirmPrivateNetworkRequest: async (classification = {}) => {
      const hostname = normalizeHostname(classification.hostname);
      if (hostname && allowedHosts.has(hostname)) {
        return true;
      }
      return confirmPrivateNetworkRequest({ ...options, classification, allowedHosts });
    }
  };
}

async function confirmPrivateNetworkRequest(options = {}) {
  const dialog = options.dialog;
  if (!dialog || typeof dialog.showMessageBox !== 'function') {
    return false;
  }
  const classification = options.classification || {};
  const hostname = classification.hostname || 'unknown host';
  const category = classification.category || 'private';
  const reason = classification.reason || 'private-network';
  const result = await dialog.showMessageBox(options.getMainWindow?.(), {
    type: 'warning',
    buttons: ['Allow Once', 'Allow Permanently', 'Cancel'],
    defaultId: 2,
    cancelId: 2,
    noLink: true,
    title: 'Private Network Request',
    message: 'Imported workspace wants to contact a private network destination.',
    detail: `Destination: ${hostname}\nCategory: ${category}\nReason: ${reason}\n\nAllow Permanently remembers this host for this workspace on this device.`
  });
  if (result?.response === 1) {
    const allowedHost = normalizeHostname(classification.hostname);
    if (!allowedHost || typeof options.mutateWorkspace !== 'function') {
      return false;
    }
    let applied = false;
    await options.mutateWorkspace((workspace) => {
      if (options.getWorkspaceId && options.getWorkspaceId() !== options.workspaceId) {
        return null;
      }
      workspace.localsettings ||= {};
      workspace.localsettings.security ||= {};
      const security = workspace.localsettings.security;
      security.allowedPrivateNetworkHosts = [...new Set([
        ...(security.allowedPrivateNetworkHosts || []), allowedHost
      ])];
      security.privateNetworkPolicySource = 'main';
      applied = true;
      return workspace;
    }, { workspaceId: options.workspaceId });
    if (applied) {
      options.allowedHosts.add(allowedHost);
    }
    return applied;
  }
  return result?.response === 0;
}

function markWorkspaceImportedUntrusted(workspace) {
  const next = workspace && typeof workspace === 'object' ? workspace : {};
  next.localsettings ||= {};
  next.localsettings.security ||= {};
  next.localsettings.security.importedUntrusted = true;
  next.localsettings.security.allowPrivateNetworkRequests = false;
  next.localsettings.security.allowedPrivateNetworkHosts = [];
  return next;
}

module.exports = {
  createRequestNetworkPolicyForWorkspace,
  markWorkspaceImportedUntrusted
};
