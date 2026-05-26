function createRequestNetworkPolicyForWorkspace(options = {}) {
  const workspace = options.workspace || {};
  const localSecurity = workspace.localsettings?.security || {};
  const importedUntrusted = localSecurity.importedUntrusted === true;
  const allowPrivateNetworkRequests = localSecurity.allowPrivateNetworkRequests === true
    && localSecurity.privateNetworkPolicySource === 'main';
  if (!importedUntrusted && localSecurity.blockPrivateNetworkRequests !== true) {
    return { enabled: false };
  }
  return {
    enabled: true,
    allowPrivateNetworkRequests: allowPrivateNetworkRequests || localSecurity.blockPrivateNetworkRequests !== true && !importedUntrusted,
    recordDiagnosticEvent: options.recordDiagnosticEvent,
    confirmPrivateNetworkRequest: async (classification = {}) => confirmPrivateNetworkRequest({
      ...options,
      classification
    })
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
    buttons: ['Allow Once', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Private Network Request',
    message: 'Imported workspace wants to contact a private network destination.',
    detail: `Destination: ${hostname}\nCategory: ${category}\nReason: ${reason}`
  });
  return result?.response === 0;
}

function markWorkspaceImportedUntrusted(workspace) {
  const next = workspace && typeof workspace === 'object' ? workspace : {};
  next.localsettings ||= {};
  next.localsettings.security ||= {};
  next.localsettings.security.importedUntrusted = true;
  next.localsettings.security.allowPrivateNetworkRequests = false;
  return next;
}

module.exports = {
  createRequestNetworkPolicyForWorkspace,
  markWorkspaceImportedUntrusted
};
