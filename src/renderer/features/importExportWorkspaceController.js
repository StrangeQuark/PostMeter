async function saveWorkspace(showStatus = true, options = {}) {
  if (activeWorkspaceLocked()) {
    setStatus('Unlock workspace before saving.');
    return false;
  }
  return rendererWorkflows.saveWorkspace(showStatus, options);
}

async function persistWorkspace(showStatus = true, options = {}) {
  if (activeWorkspaceLocked()) {
    setStatus('Unlock workspace before saving.');
    return false;
  }
  return rendererWorkflows.persistWorkspace(showStatus, options);
}

async function importWorkspace() {
  if (typeof window.__postmeterImportWorkspace === 'function') {
    return rendererWorkflows.importWorkspace();
  }
  const filePath = await chooseImportFilePath('workspace');
  if (filePath === null) {
    return null;
  }
  return filePath == null
    ? rendererWorkflows.importWorkspace()
    : rendererWorkflows.importWorkspace(filePath);
}

const WORKSPACE_ENCRYPTION_KEY_MIN_LENGTH = 6;
let workspaceEncryptionModalState = null;

async function promptWorkspaceEncryptionKey(options = {}) {
  workspaceEncryptionModalState = {
    mode: options.mode || 'unlock',
    requireConfirmation: options.requireConfirmation === true,
    resolveOnConfirm: true
  };
  $('workspaceEncryptionTitle').textContent = options.title || 'Workspace encryption';
  $('workspaceEncryptionMessage').textContent = options.message || 'Enter the workspace key.';
  $('workspaceEncryptionWarning').textContent = options.warning || 'Losing this key permanently loses access to the encrypted workspace. PostMeter does not store it.';
  $('workspaceEncryptionKeyLabel').textContent = options.label || 'Key';
  $('workspaceEncryptionKeyInput').value = '';
  $('workspaceEncryptionConfirmInput').value = '';
  $('workspaceEncryptionConfirmField').hidden = options.requireConfirmation !== true;
  $('workspaceEncryptionError').hidden = true;
  $('workspaceEncryptionError').textContent = '';
  $('confirmWorkspaceEncryptionButton').textContent = options.confirmLabel || 'Continue';
  const key = await showModal('workspaceEncryptionModal', null);
  $('workspaceEncryptionKeyInput').value = '';
  $('workspaceEncryptionConfirmInput').value = '';
  workspaceEncryptionModalState = null;
  return typeof key === 'string' && key.length >= WORKSPACE_ENCRYPTION_KEY_MIN_LENGTH ? key : null;
}

function confirmWorkspaceEncryptionModal() {
  const key = $('workspaceEncryptionKeyInput')?.value || '';
  const confirmation = $('workspaceEncryptionConfirmInput')?.value || '';
  if (key.length < WORKSPACE_ENCRYPTION_KEY_MIN_LENGTH) {
    showWorkspaceEncryptionModalError(`Key must be at least ${WORKSPACE_ENCRYPTION_KEY_MIN_LENGTH} characters.`);
    return;
  }
  if (workspaceEncryptionModalState?.requireConfirmation === true && key !== confirmation) {
    showWorkspaceEncryptionModalError('The confirmation key does not match.');
    return;
  }
  resolveActiveModal(key);
}

function showWorkspaceEncryptionModalError(message) {
  const error = $('workspaceEncryptionError');
  error.textContent = message;
  error.hidden = false;
}

async function handleWorkspaceKeyPrompt(payload = {}) {
  const key = await promptWorkspaceEncryptionKey({
    mode: 'save',
    title: 'Unlock workspace to save',
    message: `"${payload.workspaceName || payload.workspaceId || 'This workspace'}" is encrypted. Enter the key to save changes.`,
    warning: 'PostMeter keeps the key in memory only while this workspace is unlocked.',
    confirmLabel: 'Unlock'
  });
  await window.postmeter.workspace.resolveKeyPrompt(payload.promptId, key || '');
}

async function applyLoadedWorkspaceOrPrompt(loaded, options = {}) {
  if (loaded?.locked === true && loaded?.encrypted === true) {
    return unlockWorkspaceFromLockedLoad(loaded, options);
  }
  applyLoadedWorkspace(loaded, options);
  return loaded?.workspace || null;
}

async function unlockWorkspaceFromLockedLoad(loaded, options = {}) {
  applyWorkspaceCatalogUpdate(loaded, {
    focus: 'workspace',
    selectedWorkspaceId: loaded?.activeWorkspaceId || selectedWorkspaceId,
    render: options.render
  });
  const workspaceId = loaded?.activeWorkspaceId || selectedWorkspaceId || activeWorkspaceId;
  const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId) || null;
  const key = await promptWorkspaceEncryptionKey({
    mode: 'unlock',
    title: 'Unlock workspace',
    message: `Enter the key for "${workspaceDisplayName(workspaceItem)}".`,
    warning: 'PostMeter decrypts the workspace in memory and keeps saving it encrypted.',
    confirmLabel: 'Unlock'
  });
  if (!key) {
    setStatus('Workspace is locked.');
    applyLoadedWorkspace(loaded, { focus: 'workspace', selectedWorkspaceId: workspaceId });
    return null;
  }
  try {
    const unlocked = await window.postmeter.workspace.unlock(workspaceId, key);
    applyLoadedWorkspace(unlocked, {
      ...options,
      selectedWorkspaceId: workspaceId
    });
    setStatus(`Unlocked workspace: ${workspaceDisplayName()}.`);
    return unlocked.workspace;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace unlock failed: ${message}`);
    notifyUser('Workspace Unlock Failed', message);
    applyLoadedWorkspace(loaded, { focus: 'workspace', selectedWorkspaceId: workspaceId });
    return null;
  }
}

async function runPickerFirstExport({
  kind,
  format = 'postmeter',
  name,
  payloadFactory,
  legacyExport,
  successStatus,
  failureStatusPrefix,
  failureTitle,
  unavailableStatus
}) {
  const exportApi = window.postmeter?.fileExport;
  if (!exportApi?.choosePath || !exportApi?.prepare || !exportApi?.writePrepared || !exportApi?.cancelPrepared) {
    if (typeof legacyExport === 'function') {
      return await legacyExport();
    }
    return setStatus(unavailableStatus || 'Export is unavailable in this runtime.');
  }
  const exportId = crypto.randomUUID();
  let cancelled = false;
  let prepareError = null;
  const pathPromise = exportApi.choosePath({ kind, format, name });
  const preparePromise = new Promise((resolve) => setTimeout(resolve, 0))
    .then(() => {
      if (cancelled) {
        return null;
      }
      return payloadFactory();
    })
    .then((payload) => {
      if (cancelled || payload == null) {
        return null;
      }
      return exportApi.prepare({ exportId, kind, format, payload });
    })
    .catch((error) => {
      prepareError = error;
      return null;
    });
  try {
    const pathResult = await pathPromise;
    if (pathResult?.cancelled || !pathResult?.path) {
      cancelled = true;
      await exportApi.cancelPrepared(exportId).catch(() => false);
      await preparePromise;
      return { cancelled: true };
    }
    await preparePromise;
    if (prepareError) {
      throw prepareError;
    }
    const result = await exportApi.writePrepared(exportId, pathResult.path);
    if (result?.path && successStatus) {
      setStatus(successStatus(result.path));
    }
    return result;
  } catch (error) {
    if (!cancelled) {
      await exportApi.cancelPrepared(exportId).catch(() => false);
      const message = error.message || String(error);
      setStatus(`${failureStatusPrefix || 'Export failed'}: ${message}`);
      notifyUser(failureTitle || 'Export Failed', message);
    }
    return null;
  }
}

async function exportWorkspace(workspaceIdOrItem = null) {
  const requestedWorkspaceId = typeof workspaceIdOrItem === 'string'
    ? workspaceIdOrItem
    : workspaceIdOrItem && typeof workspaceIdOrItem === 'object' && typeof workspaceIdOrItem.id === 'string'
      ? workspaceIdOrItem.id
      : null;
  const workspaceItem = requestedWorkspaceId
    ? workspaceListItems().find((item) => item.id === requestedWorkspaceId) || null
    : activeWorkspaceItem();
  if (!workspaceItem) {
    setStatus('Select a workspace before exporting.');
    return null;
  }
  if (workspaceItem.encrypted === true) {
    try {
      if (workspaceItem.current === true && workspaceItem.locked !== true) {
        await persistWorkspace(false, { scope: 'all' });
      }
      const exportWorkspaceBoundary = window.__postmeterExportWorkspace || window.postmeter.workspace.exportWorkspace;
      const result = await exportWorkspaceBoundary(null, workspaceItem.id);
      if (!result.cancelled) {
        setStatus(`Encrypted workspace exported to ${result.path}.`);
      }
      return result;
    } catch (error) {
      const message = error.message || String(error);
      setStatus('Workspace export failed.');
      notifyUser('Workspace Export Failed', message);
      return null;
    }
  }
  if (workspaceItem.current !== true) {
    try {
      const exportWorkspaceBoundary = window.__postmeterExportWorkspace || window.postmeter.workspace.exportWorkspace;
      const result = await exportWorkspaceBoundary(null, workspaceItem.id);
      if (!result.cancelled) {
        setStatus(`Workspace exported to ${result.path}.`);
      }
      return result;
    } catch (error) {
      const message = error.message || String(error);
      setStatus('Workspace export failed.');
      notifyUser('Workspace Export Failed', message);
      return null;
    }
  }
  if (typeof window.__postmeterExportWorkspace === 'function') {
    return rendererWorkflows.exportWorkspace();
  }
  return runPickerFirstExport({
    kind: 'workspace',
    format: 'postmeter',
    name: workspaceDisplayName(workspaceItem),
    payloadFactory: () => {
      collectActiveEditorState();
      return cloneJson(workspace);
    },
    legacyExport: () => rendererWorkflows.exportWorkspace(),
    successStatus: (filePath) => `Workspace exported to ${filePath}.`,
    failureStatusPrefix: 'Workspace export failed',
    failureTitle: 'Workspace Export Failed',
    unavailableStatus: 'Workspace export is unavailable in this runtime.'
  });
}

async function exportWorkspaceFromPicker() {
  const items = workspaceListItems();
  const preferredWorkspace = activeWorkspaceItem() || items.find((item) => item.current === true) || items[0] || null;
  const selectedWorkspace = await promptForItemExport('workspace', items, preferredWorkspace);
  if (!selectedWorkspace) {
    return null;
  }
  return exportWorkspace(selectedWorkspace.id);
}

async function exportDiagnostics(options = {}) {
  const diagnostics = window.__postmeterDiagnostics || window.postmeter?.diagnostics;
  if (!diagnostics?.export) {
    setStatus('Diagnostics export is unavailable in this runtime.');
    return null;
  }
  if (isViewingNonCurrentWorkspace() && options.allowNonCurrentWorkspaceView !== true) {
    setStatus('Switch to this workspace before exporting local diagnostics.');
    return null;
  }
  try {
    if (pendingDiagnosticsSettingsSave) {
      setStatus('Saving diagnostics privacy settings before export.');
      const saved = await pendingDiagnosticsSettingsSave;
      if (!saved) {
        return null;
      }
    }
    const result = await diagnostics.export();
    if (result?.path) {
      setStatus(`Local diagnostics exported to ${result.path}. Review before sharing.`);
      notifyUser('Local Diagnostics Exported', `Review ${result.path} before attaching it to a support request or GitHub issue.`);
    }
    return result;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Diagnostics export failed: ${message}`);
    notifyUser('Diagnostics Export Failed', message);
    return null;
  }
}

function isViewingNonCurrentWorkspace() {
  const workspaceItem = activeWorkspaceItem();
  return activeSidebarPanel === 'workspaces'
    && activeMainPanel === 'workspace'
    && workspaceItem
    && workspaceItem.current !== true;
}

async function prepareForWorkspaceChange(actionLabel) {
  if (draftRequests.size > 0) {
    const draftLabel = draftRequests.size === 1 ? 'draft request' : 'draft requests';
    if (!(await confirmActionModal({
      title: 'Discard unsaved requests?',
      message: `${draftRequests.size} unsaved ${draftLabel} will be discarded before ${actionLabel}. Continue?`,
      confirmLabel: 'Discard and Continue',
      danger: true
    }))) {
      return false;
    }
  }
  if (workspaceListItems().find((item) => item.id === activeWorkspaceId)?.locked === true) {
    return true;
  }
  await persistWorkspace(false, { scope: 'all' });
  return true;
}

async function newWorkspace() {
  try {
    if (!canOpenAdditionalWorkspaceTab()) {
      return null;
    }
    collectActiveEditorState();
    const previousWorkspaceIds = new Set(workspaceListItems().map((item) => item.id));
    const loaded = await window.postmeter.workspace.create();
    const createdWorkspaceId = loaded.createdWorkspaceId
      || loaded.workspaces?.find((item) => !previousWorkspaceIds.has(item.id))?.id
      || null;
    const nextWorkspaceOrder = [...workspaceOrder(), createdWorkspaceId].filter(Boolean);
    workspaces = Array.isArray(loaded?.workspaces) ? orderWorkspaceItems(loaded.workspaces, nextWorkspaceOrder) : workspaces;
    activeWorkspaceId = loaded?.activeWorkspaceId || activeWorkspaceId;
    workspacePath = loaded?.path || workspacePath;
    selectedWorkspaceId = createdWorkspaceId || selectedWorkspaceId || activeWorkspaceId;
    activeSidebarPanel = 'workspaces';
    activeMainPanel = 'workspace';
    ensureOpenWorkspaceTabForActive();
    renderAll();
    setStatus(`Created workspace: ${workspaceDisplayName(activeWorkspaceItem())}.`);
    return createdWorkspaceId;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace creation failed: ${message}`);
    notifyUser('Workspace Creation Failed', message);
    return null;
  }
}

function currentPanelFocus() {
  if (activeMainPanel === 'workspace') {
    return 'workspace';
  }
  if (activeMainPanel === 'environment') {
    return 'environment';
  }
  return 'request';
}

function renameWorkspace(workspaceId = selectedWorkspaceId || activeWorkspaceId) {
  const workspaceItem = selectWorkspaceItem(workspaceId);
  if (!workspaceItem) {
    setStatus('Select a workspace before renaming.');
    return null;
  }
  beginWorkspaceTitleEdit();
  return workspaceItem;
}

async function renameWorkspaceToName(workspaceId, workspaceName) {
  try {
    const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId);
    if (!workspaceItem) {
      setStatus('Select a workspace before renaming.');
      return null;
    }
    const nextName = String(workspaceName || '').trim();
    if (!nextName || nextName === workspaceDisplayName(workspaceItem)) {
      return null;
    }
    const renamingActiveWorkspace = workspaceId === activeWorkspaceId;
    if (renamingActiveWorkspace) {
      await persistWorkspace(false, { scope: 'all' });
    }
    const previousWorkspaceIds = new Set(workspaceListItems().map((item) => item.id));
    const renameBoundary = window.__postmeterRenameWorkspace || window.postmeter.workspace.rename;
    const loaded = await renameBoundary(workspaceId, nextName);
    const renamedWorkspaceId = loaded?.renamedWorkspaceId
      || loaded?.workspaces?.find((item) => item.id !== workspaceId && !previousWorkspaceIds.has(item.id))?.id
      || (renamingActiveWorkspace ? loaded?.activeWorkspaceId : workspaceId);
    if (renamingActiveWorkspace) {
      applyLoadedWorkspace(loaded, {
        focus: activeMainPanel === 'workspace' ? 'workspace' : currentPanelFocus(),
        selectedWorkspaceId: workspaceId === selectedWorkspaceId ? renamedWorkspaceId : selectedWorkspaceId
      });
    } else {
      applyWorkspaceCatalogUpdate(loaded, {
        focus: 'workspace',
        selectedWorkspaceId: workspaceId === selectedWorkspaceId ? renamedWorkspaceId : selectedWorkspaceId
      });
    }
    restoreTreeFocus(treeFocusTarget('workspace', renamedWorkspaceId || workspaceId), activeWorkspaceTreeFocusTargets());
    setStatus(renamingActiveWorkspace ? `Renamed workspace: ${workspaceDisplayName()}.` : 'Workspace renamed.');
    return loaded?.workspace || null;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace rename failed: ${message}`);
    notifyUser('Workspace Rename Failed', message);
    return null;
  }
}

async function switchWorkspace(workspaceId, options = {}) {
  try {
    const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId);
    if (!workspaceItem) {
      setStatus('Select a workspace before switching.');
      return null;
    }
    if (workspaceId === activeWorkspaceId) {
      return selectWorkspaceItem(workspaceId);
    }
    if (!(await prepareForWorkspaceChange('switching workspaces'))) {
      return null;
    }
    const loaded = await window.postmeter.workspace.switch(workspaceId);
    if (loaded?.locked === true && loaded?.encrypted === true) {
      return applyLoadedWorkspaceOrPrompt(loaded, { focus: options.focus || 'workspace', selectedWorkspaceId: workspaceId });
    }
    applyLoadedWorkspace(loaded, { focus: options.focus || 'workspace', selectedWorkspaceId: workspaceId });
    setStatus(`Switched to workspace: ${workspaceDisplayName()}.`);
    return loaded.workspace;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace switch failed: ${message}`);
    notifyUser('Workspace Switch Failed', message);
    return null;
  }
}

async function unlockWorkspace(workspaceId = selectedWorkspaceId || activeWorkspaceId, options = {}) {
  const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId) || null;
  if (!workspaceItem) {
    setStatus('Select a workspace before unlocking.');
    return null;
  }
  const key = await promptWorkspaceEncryptionKey({
    mode: 'unlock',
    title: 'Unlock workspace',
    message: `Enter the key for "${workspaceDisplayName(workspaceItem)}".`,
    warning: 'PostMeter decrypts the workspace in memory and keeps saving it encrypted.',
    confirmLabel: 'Unlock'
  });
  if (!key) {
    return null;
  }
  try {
    if (workspaceId !== activeWorkspaceId && !(await prepareForWorkspaceChange('unlocking a workspace'))) {
      return null;
    }
    const loaded = await window.postmeter.workspace.unlock(workspaceId, key);
    applyLoadedWorkspace(loaded, { focus: options.focus || 'workspace', selectedWorkspaceId: workspaceId });
    setStatus(`Unlocked workspace: ${workspaceDisplayName()}.`);
    return loaded.workspace;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace unlock failed: ${message}`);
    notifyUser('Workspace Unlock Failed', message);
    return null;
  }
}

async function encryptWorkspace(workspaceId = selectedWorkspaceId || activeWorkspaceId) {
  const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId) || null;
  if (!workspaceItem) {
    setStatus('Select a workspace before encrypting.');
    return null;
  }
  if (workspaceItem.encrypted === true) {
    setStatus('Workspace is already encrypted.');
    return null;
  }
  const key = await promptWorkspaceEncryptionKey({
    mode: 'encrypt',
    title: 'Encrypt workspace',
    message: `Choose a key for "${workspaceDisplayName(workspaceItem)}".`,
    warning: 'Losing this key permanently loses access to this workspace. Existing unencrypted workspace backups will be deleted.',
    confirmLabel: 'Encrypt',
    requireConfirmation: true
  });
  if (!key) {
    return null;
  }
  try {
    let workspacePayload = null;
    if (workspaceId === activeWorkspaceId) {
      collectActiveEditorState();
      workspacePayload = cloneJson(workspace);
    }
    const loaded = await window.postmeter.workspace.encrypt(workspaceId, key, workspacePayload);
    if (workspaceId === activeWorkspaceId) {
      applyLoadedWorkspace(loaded, { focus: 'workspace', selectedWorkspaceId: workspaceId });
    } else {
      applyWorkspaceCatalogUpdate(loaded, { focus: 'workspace', selectedWorkspaceId: workspaceId });
    }
    setStatus('Workspace encrypted. Unencrypted workspace backups were removed.');
    return loaded.workspace;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace encryption failed: ${message}`);
    notifyUser('Workspace Encryption Failed', message);
    return null;
  }
}

async function removeWorkspaceEncryption(workspaceId = selectedWorkspaceId || activeWorkspaceId) {
  const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId) || null;
  if (!workspaceItem) {
    setStatus('Select a workspace before removing encryption.');
    return null;
  }
  if (workspaceItem.encrypted !== true) {
    setStatus('Workspace is not encrypted.');
    return null;
  }
  const key = await promptWorkspaceEncryptionKey({
    mode: 'remove',
    title: 'Decrypt workspace',
    message: `Enter the key for "${workspaceDisplayName(workspaceItem)}".`,
    warning: 'The workspace file will be saved as plaintext. Existing encrypted workspace backups will be deleted.',
    confirmLabel: 'Decrypt'
  });
  if (!key) {
    return null;
  }
  try {
    const loaded = await window.postmeter.workspace.removeEncryption(workspaceId, key);
    if (workspaceId === activeWorkspaceId) {
      applyLoadedWorkspace(loaded, { focus: 'workspace', selectedWorkspaceId: workspaceId });
    } else {
      applyWorkspaceCatalogUpdate(loaded, { focus: 'workspace', selectedWorkspaceId: workspaceId });
    }
    setStatus('Workspace decrypted. Encrypted workspace backups were removed.');
    return loaded.workspace;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace decrypt failed: ${message}`);
    notifyUser('Workspace Decrypt Failed', message);
    return null;
  }
}

async function deleteWorkspace(workspaceId = selectedWorkspaceId || activeWorkspaceId) {
  try {
    const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId);
    if (!workspaceItem) {
      setStatus('Select a workspace before deleting.');
      return null;
    }
    if (workspaceListItems().length <= 1) {
      setStatus('At least one workspace must remain.');
      return null;
    }
    if (workspaceId === activeWorkspaceId && !(await prepareForWorkspaceChange('deleting a workspace'))) {
      return null;
    }
    if (!(await confirmActionModal({
      title: 'Delete workspace?',
      message: `Delete "${workspaceItem.name}"? This cannot be recovered.`,
      confirmLabel: 'Delete Workspace',
      danger: true
    }))) {
      return null;
    }
    const loaded = await window.postmeter.workspace.delete(workspaceId);
    const nextSelectedWorkspaceId = workspaceId === selectedWorkspaceId
      ? (loaded.workspaces?.find((item) => item.id !== workspaceId)?.id || loaded.activeWorkspaceId)
      : selectedWorkspaceId;
    if (workspaceId === activeWorkspaceId) {
      applyLoadedWorkspace(loaded, { focus: 'workspace', selectedWorkspaceId: nextSelectedWorkspaceId });
    } else {
      applyWorkspaceCatalogUpdate(loaded, { focus: 'workspace', selectedWorkspaceId: nextSelectedWorkspaceId });
    }
    restoreTreeFocus(null, activeWorkspaceTreeFocusTargets());
    setStatus(`Deleted workspace: ${workspaceItem.name}.`);
    return loaded.workspace;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace deletion failed: ${message}`);
    notifyUser('Workspace Deletion Failed', message);
    return null;
  }
}

async function checkForUpdates() {
  return rendererWorkflows.checkForUpdates();
}

function scheduleStartupUpdateReminder() {
  if (isAutomatedUiSmoke()) {
    return;
  }
  window.setTimeout(() => {
    void shouldRunStartupUpdateReminder().then((shouldRun) => {
      if (shouldRun) {
        return checkForStartupUpdateReminder();
      }
      return null;
    });
  }, 1500);
}

async function shouldRunStartupUpdateReminder() {
  if (typeof window.__postmeterUpdateCheck === 'function') {
    return true;
  }
  try {
    const versions = await window.postmeter?.app?.versions?.();
    return versions?.packaged === true;
  } catch {
    return false;
  }
}

async function checkForStartupUpdateReminder() {
  ensureSettings();
  if (workspace.settings.updates.automaticUpdatesEnabled === true || workspace.settings.updates.startupRemindersEnabled === false) {
    return null;
  }
  try {
    const updateCheck = window.__postmeterUpdateCheck || window.postmeter?.app?.checkForUpdates;
    if (typeof updateCheck !== 'function') {
      return null;
    }
    const result = await updateCheck({
      includePrereleases: workspace.settings.updates.includePrereleases === true
    });
    if (!result?.updateAvailable) {
      return result || null;
    }
    setStatus(`PostMeter ${result.latestVersion} is available.`);
    const decision = await updateReminderModal(result);
    if (decision === 'update') {
      const openExternal = window.__postmeterOpenExternal || window.postmeter?.app?.openExternal;
      if (result.releaseUrl && typeof openExternal === 'function') {
        await openExternal(result.releaseUrl);
      }
      return result;
    }
    if (decision === 'stop') {
      await setStartupUpdateRemindersEnabled(false, {
        save: true,
        statusMessage: 'Startup update reminders disabled.'
      });
    }
    return result;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Startup update check failed: ${message}`);
    return null;
  }
}

async function updateReminderModal(update = {}) {
  const version = String(update.latestVersion || update.version || '').trim();
  const current = String(update.currentVersion || '').trim();
  $('updateReminderModalTitle').textContent = version ? `PostMeter ${version} is available` : 'Update available';
  $('updateReminderModalMessage').textContent = [
    current ? `You are running PostMeter ${current}.` : '',
    version ? `PostMeter ${version} is available.` : 'A new PostMeter release is available.',
    'Update now opens GitHub Releases so you can download the installer for your operating system.'
  ].filter(Boolean).join('\n\n');
  return await showModal('updateReminderModal', 'cancel');
}

function handleAutoUpdateStatus(status = {}) {
  const version = String(status.version || '').trim();
  if (status.status === 'checking') {
    setStatus('Checking for automatic updates...');
  } else if (status.status === 'available') {
    setStatus(version ? `PostMeter ${version} is available. Downloading update...` : 'Downloading available PostMeter update...');
  } else if (status.status === 'downloading') {
    const percent = Number.isFinite(Number(status.percent)) ? Math.round(Number(status.percent)) : 0;
    setStatus(`Downloading PostMeter update${percent > 0 ? ` (${percent}%)` : ''}...`);
  } else if (status.status === 'downloaded') {
    const message = version
      ? `PostMeter ${version} has been downloaded and will install when PostMeter closes.`
      : 'A PostMeter update has been downloaded and will install when PostMeter closes.';
    setStatus(message);
    notifyUser('Update Downloaded', message);
  } else if (status.status === 'failed') {
    const message = String(status.error || 'Automatic update failed.');
    setStatus(`Automatic update failed: ${message}`);
    notifyUser('Automatic Update Failed', message);
  }
}

async function importCollection() {
  if (typeof window.__postmeterImportCollection === 'function') {
    return rendererWorkflows.importCollection();
  }
  const filePath = await chooseImportFilePath('collection');
  if (filePath === null) {
    return null;
  }
  return filePath == null
    ? rendererWorkflows.importCollection()
    : rendererWorkflows.importCollection(filePath);
}

async function importRequest() {
  const requestApi = window.postmeter?.request;
  const importBoundary = window.__postmeterImportRequest || requestApi?.importRequest;
  if (!importBoundary) {
    return setStatus('Request import is unavailable in this runtime.');
  }
  resetRequestImportModal();
  const source = typeof window.__postmeterImportRequest === 'function'
    ? undefined
    : await showModal('requestImportModal', null);
  resetRequestImportModal();
  if (source === null) {
    return null;
  }
  try {
    const result = source == null ? await importBoundary() : await importBoundary(source);
    if (result?.cancelled) {
      return null;
    }
    if (!result?.request) {
      return setStatus('No request was imported.');
    }
    return openImportedRequest(result.request);
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Request import failed: ${message}`);
    notifyUser('Request Import Failed', message);
    return null;
  }
}

function openImportedRequest(importedRequest) {
  if (!canOpenAdditionalRequestTab()) {
    return null;
  }
  collectActiveEditorState();
  const request = importedRequest && typeof importedRequest === 'object'
    ? cloneJson(importedRequest)
    : newRequestObject('Imported Request');
  if (!request.id || draftRequests.has(request.id) || workspaceHasRequestId(request.id)) {
    request.id = crypto.randomUUID();
  }
  request.name = uniqueName(request.name || 'Imported Request', [
    ...Array.from(draftRequests.values()).map((item) => item.name),
    ...allWorkspaceRequestNames()
  ]);
  request.queryParams ||= [];
  request.headers ||= [];
  request.scripts ||= { preRequest: '', tests: '' };
  request.variables ||= [];
  request.docs = request.docs == null ? '' : String(request.docs);
  request.cookieJar ||= { enabled: false, storeResponses: true };
  request.autoHeaders ||= { sendPostMeterToken: false, showGeneratedHeaders: false };
  draftRequests.set(request.id, request);
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = request.id;
  activeRunnerRequestRunnerId = null;
  activeMainPanel = 'request';
  ensureOpenRequestTabForActive({ dirty: true });
  renderAll();
  setStatus(`Imported request: ${request.name}.`);
  return request;
}

function workspaceHasRequestId(requestId) {
  for (const collection of workspace.collections || []) {
    let found = false;
    walkCollectionRequests(collection, (request) => {
      if (request.id === requestId) {
        found = true;
      }
    });
    if (found) {
      return true;
    }
  }
  return false;
}

function allWorkspaceRequestNames() {
  const names = [];
  for (const collection of workspace.collections || []) {
    walkCollectionRequests(collection, (request) => {
      names.push(request.name);
    });
  }
  return names;
}

function promoteCookieHeadersToJar(collection) {
  rendererWorkflows.promoteCookieHeadersToJar(collection);
}

function upsertWorkspaceCookie(cookie) {
  rendererWorkflows.upsertWorkspaceCookie(cookie);
}

function applySingleRequestScriptMutations(result, request) {
  rendererWorkflows.applySingleRequestScriptMutations(result, request);
}

function applyRunnerScriptMutations(result, collection) {
  rendererWorkflows.applyRunnerScriptMutations(result, collection);
}

function applyEnvironmentScriptMutations(environment) {
  rendererWorkflows.applyEnvironmentScriptMutations(environment);
}

function renderScriptMutationEditors() {
  rendererWorkflows.renderScriptMutationEditors();
}

function cloneVariablePairs(pairs) {
  return rendererWorkflows.cloneVariablePairs(pairs);
}

function collectSettingsFromEditor() {
  ensureSettings();
  if (activeMainPanel === 'runner') {
    collectRunnerFromEditor();
  }
}

async function exportCollection(collection = activeCollection(), format = 'postmeter') {
  let selectedCollection = collection;
  if (!selectedCollection) {
    const collections = Array.isArray(workspace?.collections) ? workspace.collections : [];
    if (!collections.length) {
      return setStatus('Create a collection before exporting.');
    }
    selectedCollection = await promptForCollectionExport(collections, activeCollection() || collections[0] || null);
  }
  if (!selectedCollection) {
    return null;
  }
  if (typeof window.__postmeterExportCollection === 'function') {
    return rendererWorkflows.exportCollection(selectedCollection, format);
  }
  return runPickerFirstExport({
    kind: 'collection',
    format,
    name: selectedCollection.name || 'collection',
    payloadFactory: () => {
      if (selectedCollection.id === activeCollectionId) {
        collectActiveEditorState();
      }
      return cloneJson(selectedCollection);
    },
    legacyExport: () => rendererWorkflows.exportCollection(selectedCollection, format),
    successStatus: (filePath) => `Collection exported to ${filePath}.`,
    failureStatusPrefix: 'Collection export failed',
    failureTitle: 'Collection Export Failed',
    unavailableStatus: 'Collection export is unavailable in this runtime.'
  });
}

async function exportRequestFromPicker(format = 'postmeter') {
  collectActiveEditorState();
  const requestEntries = collectRequestExportEntries();
  if (!requestEntries.length) {
    setStatus('Create a collection request before exporting.');
  }
  const preferredEntry = requestEntries.find((entry) => entry.request === activeRequest())
    || requestEntries.find((entry) => entry.request?.id === activeRequestId)
    || requestEntries[0]
    || null;
  const selectedEntry = await promptForRequestExport(preferredEntry);
  if (!selectedEntry?.request) {
    return null;
  }
  return exportRequest(selectedEntry.request, format);
}

async function exportRequestFromPane(format = 'postmeter') {
  const request = activeRequest();
  if (!request) {
    setStatus('Select a request before exporting.');
    return null;
  }
  collectRequestFromEditor();
  return exportRequest(request, format);
}

async function promptForRequestExport(preferredEntry = null) {
  selectedRequestExportTarget = preferredEntry?.collectionId && preferredEntry?.request?.id
    ? {
        collectionId: preferredEntry.collectionId,
        requestId: preferredEntry.request.id
      }
    : null;
  expandedRequestExportCollectionIds = selectedRequestExportTarget?.collectionId
    ? [selectedRequestExportTarget.collectionId]
    : [];
  const collections = workspace.collections || [];
  $('requestExportPickerMessage').textContent = collections.length
    ? 'Choose a collection to expand, then select a request to export.'
    : 'There are no collection requests present to export.';
  renderRequestExportPickerList(collections);
  const target = await showModal('requestExportPickerModal', null);
  if (!target?.collectionId || !target?.requestId) {
    resetRequestExportPickerModal();
    return null;
  }
  const entry = requestExportEntryForTarget(target);
  resetRequestExportPickerModal();
  return entry;
}

function resetRequestExportPickerModal() {
  selectedRequestExportTarget = null;
  expandedRequestExportCollectionIds = [];
  const list = $('requestExportPickerList');
  if (list) {
    list.textContent = '';
  }
  const confirm = $('confirmRequestExportPickerButton');
  if (confirm) {
    confirm.disabled = true;
  }
}

function renderRequestExportPickerList(collections = workspace.collections || []) {
  const list = $('requestExportPickerList');
  list.textContent = '';
  $('confirmRequestExportPickerButton').disabled = !selectedRequestExportTarget;
  const availableCollections = Array.isArray(collections) ? collections : [];
  if (!availableCollections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'There are no collection requests present to export.';
    list.append(empty);
    return;
  }
  for (const collection of availableCollections) {
    const entries = collectionRequestEntries(collection);
    const expanded = expandedRequestExportCollectionIds.includes(collection.id);
    list.append(requestExportPickerCollectionOption({
      collectionId: collection.id,
      label: collection.name || 'Untitled Collection',
      meta: `${entries.length} request${entries.length === 1 ? '' : 's'}`,
      expanded
    }));
    if (!expanded) {
      continue;
    }
    for (const entry of entries) {
      const folderPath = entry.folderPath?.length ? `${entry.folderPath.join(' / ')} / ` : '';
      list.append(requestExportPickerRequestOption({
        collectionId: collection.id,
        requestId: entry.request.id,
        label: `${folderPath}${entry.request.name || 'Untitled Request'}`,
        meta: `${entry.request.method || 'GET'} ${entry.request.url || ''}`.trim(),
        checked: requestExportTargetSelected({
          collectionId: collection.id,
          requestId: entry.request.id
        })
      }));
    }
  }
}

function requestExportPickerCollectionOption(option) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'collection-pick-option runner-import-option collection';
  button.dataset.requestExportType = 'collection';
  button.dataset.collectionId = option.collectionId || '';
  button.setAttribute('aria-expanded', option.expanded === true ? 'true' : 'false');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    toggleRequestExportCollectionExpansion(option.collectionId);
  });
  const text = document.createElement('span');
  text.textContent = option.label;
  if (option.meta) {
    const meta = document.createElement('span');
    meta.className = 'runner-import-meta';
    meta.textContent = option.meta;
    text.append(meta);
  }
  button.append(text);
  return button;
}

function requestExportPickerRequestOption(option) {
  const label = document.createElement('label');
  label.className = 'collection-pick-option runner-import-option request';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'requestExportTarget';
  input.dataset.requestExportType = 'request';
  input.dataset.collectionId = option.collectionId || '';
  input.dataset.requestId = option.requestId || '';
  input.checked = option.checked === true;
  input.addEventListener('click', (event) => {
    event.preventDefault();
    setRequestExportTarget(requestExportTargetFromInput(input));
  });
  input.addEventListener('change', () => {
    setRequestExportTarget(requestExportTargetFromInput(input));
  });
  label.addEventListener('click', (event) => {
    if (event.target === input) {
      return;
    }
    event.preventDefault();
    setRequestExportTarget({
      collectionId: option.collectionId,
      requestId: option.requestId
    });
  });
  const text = document.createElement('span');
  text.textContent = option.label;
  if (option.meta) {
    const meta = document.createElement('span');
    meta.className = 'runner-import-meta';
    meta.textContent = option.meta;
    text.append(meta);
  }
  label.append(input, text);
  return label;
}

function requestExportTargetFromInput(input) {
  return {
    collectionId: input.dataset.collectionId || '',
    requestId: input.dataset.requestId || ''
  };
}

function requestExportTargetSelected(target = {}) {
  return selectedRequestExportTarget?.collectionId === target.collectionId
    && selectedRequestExportTarget?.requestId === target.requestId;
}

function setRequestExportTarget(target = {}) {
  if (!target.collectionId || !target.requestId) {
    return;
  }
  selectedRequestExportTarget = {
    collectionId: target.collectionId,
    requestId: target.requestId
  };
  $('confirmRequestExportPickerButton').disabled = false;
  renderRequestExportPickerList();
}

function toggleRequestExportCollectionExpansion(collectionId) {
  if (!collectionId) {
    return;
  }
  expandedRequestExportCollectionIds = expandedRequestExportCollectionIds.includes(collectionId)
    ? expandedRequestExportCollectionIds.filter((id) => id !== collectionId)
    : [...expandedRequestExportCollectionIds, collectionId];
  renderRequestExportPickerList();
}

function requestExportEntryForTarget(target = {}) {
  const collection = (workspace.collections || []).find((item) => item.id === target.collectionId);
  if (!collection) {
    return null;
  }
  return collectionRequestEntries(collection)
    .find((entry) => entry.request?.id === target.requestId) || null;
}

function collectRequestExportEntries(collections = workspace?.collections || []) {
  const entries = [];
  for (const collection of collections || []) {
    appendRequestExportEntries(entries, collection, collection, [collection.name || 'Untitled Collection']);
  }
  return entries;
}

function appendRequestExportEntries(entries, collection, scope, pathParts) {
  for (const request of scope?.requests || []) {
    entries.push({
      id: `${collection?.id || 'collection'}:${scope?.id || 'root'}:${request?.id || entries.length}:${entries.length}`,
      collectionId: collection?.id || '',
      request,
      detail: pathParts.filter(Boolean).join(' / ')
    });
  }
  for (const folder of scope?.folders || []) {
    appendRequestExportEntries(entries, collection, folder, [
      ...pathParts,
      folder.name || 'Untitled Folder'
    ]);
  }
}

async function exportRequest(request = activeRequest(), format = 'postmeter') {
  const selectedRequest = request || activeRequest();
  if (!selectedRequest) {
    return setStatus('Select a request before exporting.');
  }
  if (selectedRequest === activeRequest()) {
    collectActiveEditorState();
  }
  if (String(format || 'postmeter') === 'curl') {
    const exclusions = requestCurlExportExclusions(selectedRequest);
    if (exclusions.length) {
      const message = [
        'This curl export may not behave exactly like the PostMeter request because curl cannot represent:',
        '',
        ...exclusions.map((item) => `- ${item}`),
        '',
        'Continue exporting?'
      ].join('\n');
      if (!(await confirmActionModal({
        title: 'Export curl request?',
        message,
        confirmLabel: 'Export curl'
      }))) {
        return null;
      }
    }
  }
  const requestApi = window.postmeter?.request;
  const exportBoundary = window.__postmeterExportRequest || requestApi?.exportRequest;
  const exportTextBoundary = window.__postmeterExportRequestText || requestApi?.exportRequestText;
  if (!exportBoundary && !exportTextBoundary && !window.postmeter?.fileExport) {
    return setStatus('Request export is unavailable in this runtime.');
  }
  if (!exportTextBoundary) {
    return exportRequestFile(selectedRequest, format, exportBoundary);
  }
  try {
    const preview = await exportTextBoundary(cloneJson(selectedRequest), format);
    const content = String(preview?.content || '');
    configureRequestExportModal(selectedRequest, format, content);
    const action = await showModal('requestExportModal', null);
    resetRequestExportModal();
    if (action !== 'file') {
      return { cancelled: true };
    }
  } catch (error) {
    resetRequestExportModal();
    const message = error.message || String(error);
    setStatus(`Request export failed: ${message}`);
    notifyUser('Request Export Failed', message);
    return null;
  }
  return exportRequestFile(selectedRequest, format, exportBoundary);
}

async function exportRequestFile(selectedRequest, format, exportBoundary) {
  if (typeof window.__postmeterExportRequest === 'function' || !window.postmeter?.fileExport) {
    try {
      const result = await exportBoundary(cloneJson(selectedRequest), format);
      if (result?.path) {
        setStatus(`Request exported to ${result.path}.`);
      }
      return result;
    } catch (error) {
      const message = error.message || String(error);
      setStatus(`Request export failed: ${message}`);
      notifyUser('Request Export Failed', message);
      return null;
    }
  }
  return runPickerFirstExport({
    kind: 'request',
    format,
    name: requestDisplayName(selectedRequest),
    payloadFactory: () => {
      if (selectedRequest === activeRequest()) {
        collectActiveEditorState();
      }
      return cloneJson(selectedRequest);
    },
    legacyExport: () => exportBoundary?.(cloneJson(selectedRequest), format),
    successStatus: (filePath) => `Request exported to ${filePath}.`,
    failureStatusPrefix: 'Request export failed',
    failureTitle: 'Request Export Failed',
    unavailableStatus: 'Request export is unavailable in this runtime.'
  });
}

function requestCurlExportExclusions(request = {}) {
  const exclusions = [];
  if (String(request.scripts?.preRequest || '').trim()) {
    exclusions.push('pre-request scripts');
  }
  if (String(request.scripts?.tests || '').trim()) {
    exclusions.push('post-request scripts');
  }
  const authType = String(request.auth?.type || 'none');
  if (authType && !['none', 'basic'].includes(authType)) {
    exclusions.push(`${authType} auth helper settings`);
  }
  if (request.cookieJar?.enabled) {
    exclusions.push('cookie jar behavior');
  }
  if ((request.variables || []).some((variable) => variable?.enabled !== false && variable?.key && !String(variable.key).startsWith('curl.'))) {
    exclusions.push('request variables');
  }
  const bodyMode = String(request.postmanBody?.mode || '').toLowerCase();
  if (['formdata', 'urlencoded', 'file', 'binary', 'graphql'].includes(bodyMode) || ['FORM_DATA', 'URLENCODED', 'BINARY'].includes(request.bodyType)) {
    exclusions.push('structured body metadata and file bindings');
  }
  return exclusions;
}

async function importEnvironment() {
  const environmentApi = window.postmeter?.environment;
  const importBoundary = window.__postmeterImportEnvironment || environmentApi?.importEnvironment;
  if (!importBoundary) {
    return setStatus('Environment import is unavailable in this runtime.');
  }
  try {
    const filePath = typeof window.__postmeterImportEnvironment === 'function'
      ? undefined
      : await chooseImportFilePath('environment');
    if (filePath === null) {
      return null;
    }
    const result = filePath == null ? await importBoundary() : await importBoundary(filePath);
    if (result?.cancelled) {
      return null;
    }
    if (!result?.environment) {
      return setStatus('No environment was imported.');
    }
    if (!canOpenAdditionalEnvironmentTab()) {
      return null;
    }
    collectActiveEditorState();
    workspace.environments ||= [];
    const environment = normalizeImportedEnvironment(result.environment);
    if (workspace.environments.some((candidate) => candidate.id === environment.id)) {
      environment.id = crypto.randomUUID();
    }
    environment.name = uniqueName(environment.name || 'Imported Environment', workspace.environments.map((candidate) => candidate.name));
    workspace.environments.push(environment);
    activeRunnerRequestRunnerId = null;
    activeEnvironmentEditorId = environment.id;
    activeSidebarPanel = 'environments';
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive({ dirty: true, createdUnsaved: true });
    renderAll();
    await saveEnvironmentFromPane();
    setStatus(`Imported environment: ${environment.name}.`);
    return environment;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Environment import failed: ${message}`);
    notifyUser('Environment Import Failed', message);
    return null;
  }
}

async function exportEnvironment(environment = activeEditorEnvironment(), format = 'postmeter') {
  const selectedEnvironment = environment || activeEditorEnvironment() || workspace.environments?.[0] || null;
  if (!selectedEnvironment) {
    return setStatus('Select an environment before exporting.');
  }
  const environmentApi = window.postmeter?.environment;
  const exportBoundary = window.__postmeterExportEnvironment || environmentApi?.exportEnvironment;
  if (!exportBoundary) {
    return setStatus('Environment export is unavailable in this runtime.');
  }
  if (typeof window.__postmeterExportEnvironment === 'function' || !window.postmeter?.fileExport) {
    if (selectedEnvironment.id === activeEnvironmentEditorId) {
      collectEnvironmentFromEditor();
    }
    try {
      const result = await exportBoundary(normalizeImportedEnvironment(cloneJson(selectedEnvironment)), format);
      if (result?.path) {
        setStatus(`Environment exported to ${result.path}.`);
      }
      return result;
    } catch (error) {
      const message = error.message || String(error);
      setStatus(`Environment export failed: ${message}`);
      notifyUser('Environment Export Failed', message);
      return null;
    }
  }
  return runPickerFirstExport({
    kind: 'environment',
    format,
    name: selectedEnvironment.name || 'environment',
    payloadFactory: () => {
      if (selectedEnvironment.id === activeEnvironmentEditorId) {
        collectEnvironmentFromEditor();
      }
      return normalizeImportedEnvironment(cloneJson(selectedEnvironment));
    },
    legacyExport: () => exportBoundary(normalizeImportedEnvironment(cloneJson(selectedEnvironment)), format),
    successStatus: (filePath) => `Environment exported to ${filePath}.`,
    failureStatusPrefix: 'Environment export failed',
    failureTitle: 'Environment Export Failed',
    unavailableStatus: 'Environment export is unavailable in this runtime.'
  });
}

async function exportEnvironmentFromPicker(format = 'postmeter') {
  const environments = Array.isArray(workspace?.environments) ? workspace.environments : [];
  const selectedEnvironment = await promptForItemExport('environment', environments, activeEditorEnvironment() || environments[0] || null);
  if (!selectedEnvironment) {
    return null;
  }
  return exportEnvironment(selectedEnvironment, format);
}

async function importRunner() {
  const runnerApi = window.postmeter?.runner;
  const importBoundary = window.__postmeterImportRunner || runnerApi?.importDefinition;
  if (!importBoundary) {
    return setStatus('Runner import is unavailable in this runtime.');
  }
  try {
    const filePath = typeof window.__postmeterImportRunner === 'function'
      ? undefined
      : await chooseImportFilePath('runner');
    if (filePath === null) {
      return null;
    }
    const result = filePath == null ? await importBoundary() : await importBoundary(filePath);
    if (result?.cancelled) {
      return null;
    }
    if (!result?.runner) {
      return setStatus('No runner was imported.');
    }
    if (!canOpenAdditionalRunnerTab()) {
      return null;
    }
    collectActiveEditorState();
    ensureWorkspaceRunners();
    const runner = normalizeRunner(cloneJson(result.runner));
    if (workspace.runners.some((candidate) => candidate.id === runner.id)) {
      runner.id = crypto.randomUUID();
    }
    runner.name = uniqueName(runner.name || 'Imported Runner', workspace.runners.map((candidate) => candidate.name));
    workspace.runners.push(runner);
    activeRunnerRequestRunnerId = null;
    activeRunnerConfigId = runner.id;
    activeSidebarPanel = 'runners';
    activeMainPanel = 'runner';
    ensureOpenRunnerTabForActive({ dirty: true, createdUnsaved: true });
    renderAll();
    await saveRunnerFromPane();
    setStatus(`Imported runner: ${runnerDisplayName(runner)}.`);
    return runner;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Runner import failed: ${message}`);
    notifyUser('Runner Import Failed', message);
    return null;
  }
}

async function exportRunnerDefinition(runner = activeRunner()) {
  const selectedRunner = runner || activeRunner() || workspace.runners?.[0] || null;
  if (!selectedRunner) {
    return setStatus('Select a runner before exporting.');
  }
  const runnerApi = window.postmeter?.runner;
  const exportBoundary = window.__postmeterExportRunner || runnerApi?.exportDefinition;
  if (!exportBoundary) {
    return setStatus('Runner export is unavailable in this runtime.');
  }
  if (typeof window.__postmeterExportRunner === 'function' || !window.postmeter?.fileExport) {
    if (selectedRunner.id === activeRunnerConfigId) {
      collectRunnerFromEditor();
    }
    try {
      const result = await exportBoundary(normalizeRunner(cloneJson(selectedRunner)), 'postmeter');
      if (result?.path) {
        setStatus(`Runner exported to ${result.path}.`);
      }
      return result;
    } catch (error) {
      const message = error.message || String(error);
      setStatus(`Runner export failed: ${message}`);
      notifyUser('Runner Export Failed', message);
      return null;
    }
  }
  return runPickerFirstExport({
    kind: 'runner',
    format: 'postmeter',
    name: runnerDisplayName(selectedRunner),
    payloadFactory: () => {
      if (selectedRunner.id === activeRunnerConfigId) {
        collectRunnerFromEditor();
      }
      return normalizeRunner(cloneJson(selectedRunner));
    },
    legacyExport: () => exportBoundary(normalizeRunner(cloneJson(selectedRunner)), 'postmeter'),
    successStatus: (filePath) => `Runner exported to ${filePath}.`,
    failureStatusPrefix: 'Runner export failed',
    failureTitle: 'Runner Export Failed',
    unavailableStatus: 'Runner export is unavailable in this runtime.'
  });
}

async function exportRunnerDefinitionFromPicker() {
  const runners = ensureWorkspaceRunners();
  const selectedRunner = await promptForItemExport('runner', runners, activeRunner() || runners[0] || null);
  if (!selectedRunner) {
    return null;
  }
  return exportRunnerDefinition(selectedRunner);
}

function newCollection() {
  collectActiveEditorState();
  activeSidebarPanel = 'collections';
  activeMainPanel = 'request';
  activeRunnerRequestRunnerId = null;
  const collection = {
    id: crypto.randomUUID(),
    name: uniqueName('New Collection', workspace.collections.map((existing) => existing.name)),
    description: '',
    auth: { type: 'none' },
    scripts: { preRequest: '', tests: '' },
    variables: [],
    certificates: [],
    requests: [],
    folders: []
  };
  workspace.collections.push(collection);
  activeCollectionId = collection.id;
  activeFolderId = null;
  activeRequestId = null;
  ensureOpenCollectionTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  return collection;
}

function newRequest(collectionId = activeCollectionId, folderId = activeFolderId) {
  if (!canOpenAdditionalRequestTab()) {
    return null;
  }
  collectActiveEditorState();
  activeMainPanel = 'request';
  activeRunnerRequestRunnerId = null;
  const collection = workspace.collections.find((item) => item.id === collectionId);
  if (!collection) {
    const draftRequest = newRequestObject(uniqueName('New Request', Array.from(draftRequests.values()).map((request) => request.name)));
    draftRequests.set(draftRequest.id, draftRequest);
    activeCollectionId = null;
    activeFolderId = null;
    activeRequestId = draftRequest.id;
    ensureOpenRequestTabForActive({ dirty: true });
    renderAll();
    setStatus('Created an unsaved request.');
    return draftRequest;
  }
  const request = newRequestObject(uniqueName('New Request', allRequestNames(collection)));
  const folder = folderId ? findFolder(collection, folderId) : null;
  if (folder) {
    folder.requests.push(request);
    activeFolderId = folder.id;
  } else {
    collection.requests.push(request);
    activeFolderId = null;
  }
  expandCollectionTreePath(collection, activeFolderId);
  activeCollectionId = collection.id;
  activeRequestId = request.id;
  ensureOpenRequestTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  return request;
}

function newFolder(collectionId = activeCollectionId, parentFolderId = activeFolderId) {
  collectActiveEditorState();
  activeMainPanel = 'request';
  activeRunnerRequestRunnerId = null;
  const collection = workspace.collections.find((item) => item.id === collectionId);
  if (!collection) {
    setStatus('Select a collection before creating a folder.');
    renderToolbarState();
    return null;
  }
  const folder = {
    id: crypto.randomUUID(),
    name: uniqueName('New Folder', allFolderNames(collection)),
    description: '',
    auth: { type: 'none' },
    scripts: { preRequest: '', tests: '' },
    variables: [],
    requests: [],
    folders: []
  };
  const parent = parentFolderId ? findFolder(collection, parentFolderId) : null;
  if (parent) {
    parent.folders.push(folder);
  } else {
    collection.folders.push(folder);
  }
  expandCollectionTreePath(collection, parent?.id || null);
  activeCollectionId = collection.id;
  activeFolderId = folder.id;
  activeRequestId = null;
  ensureOpenFolderTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  return folder;
}

function newRequestObject(name) {
  return {
    id: crypto.randomUUID(),
    name,
    method: 'GET',
    url: '',
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: '',
    auth: { type: 'none' },
    scripts: { preRequest: '', tests: '' },
    variables: [],
    docs: '',
    cookieJar: { enabled: false, storeResponses: true },
    autoHeaders: { sendPostMeterToken: false, showGeneratedHeaders: false },
    settings: { sslCertificateVerification: 'inherit' }
  };
}

function expandCollectionTreePath(collection, folderId = null, options = {}) {
  if (!collection?.id) {
    return;
  }
  setCollectionTreeItemCollapsed(state, 'collection', collection.id, false);
  const folderPath = folderId ? findFolderPath(collection, folderId) : [];
  const foldersToExpand = options.includeTargetFolder === false
    ? folderPath.slice(0, -1)
    : folderPath;
  for (const folder of foldersToExpand) {
    setCollectionTreeItemCollapsed(state, 'folder', folder.id, false);
  }
}

function newEnvironment() {
  if (!canOpenAdditionalEnvironmentTab()) {
    return null;
  }
  collectActiveEditorState();
  activeRunnerRequestRunnerId = null;
  workspace.environments ||= [];
  const environment = {
    id: crypto.randomUUID(),
    name: uniqueName('New Environment', workspace.environments.map((item) => item.name)),
    variables: []
  };
  workspace.environments.push(environment);
  activeEnvironmentEditorId = environment.id;
  activeSidebarPanel = 'environments';
  activeMainPanel = 'environment';
  ensureOpenEnvironmentTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  return environment;
}

async function deleteEnvironment(environment = activeEditorEnvironment()) {
  if (!environment || !(await confirmActionModal({
    title: 'Delete environment?',
    message: `Delete ${environment.name}?`,
    confirmLabel: 'Delete Environment',
    danger: true
  }))) {
    return;
  }
  removeOpenEnvironmentTab(environment.id);
  workspace.environments = workspace.environments.filter((item) => item.id !== environment.id);
  activeRunnerRequestRunnerId = null;
  if (activeEnvironmentId === environment.id) {
    activeEnvironmentId = 'none';
  }
  if (activeEnvironmentEditorId === environment.id) {
    activeEnvironmentEditorId = 'none';
  }
  activeSidebarPanel = 'environments';
  activeMainPanel = 'environment';
  ensureOpenEnvironmentTabForActive();
  renderAll();
  scheduleSessionSave();
  restoreTreeFocus(null, activeEnvironmentTreeFocusTargets());
}

async function renameEnvironment(environment) {
  if (!canOpenEnvironmentTabFor(environment?.id)) {
    return;
  }
  const value = await promptTextInput({
    title: 'Rename environment',
    message: 'Enter an environment name.',
    label: 'Environment name',
    defaultValue: environment.name,
    singleLine: true
  });
  if (value?.trim()) {
    environment.name = value.trim();
    activeRunnerRequestRunnerId = null;
    activeEnvironmentEditorId = environment.id;
    activeSidebarPanel = 'environments';
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive({ dirty: true });
    renderAll();
    restoreTreeFocus(treeFocusTarget('environment', environment.id), activeEnvironmentTreeFocusTargets());
  }
}

function addVariable() {
  const environment = activeEditorEnvironment();
  if (environment) {
    environment.variables.push({ enabled: true, key: '', value: '' });
    markActiveEnvironmentDirty();
    renderEnvironmentEditor();
  }
}

function addCollectionVariable() {
  const collection = activeCollection();
  if (collection) {
    collection.variables ||= [];
    collection.variables.push({ enabled: true, key: '', value: '' });
    collectCollectionAndMarkDirty({ includeVariables: false });
    renderCollectionEditor();
  }
}

function addFolderVariable() {
  const folder = activeFolder();
  if (folder) {
    folder.variables ||= [];
    folder.variables.push({ enabled: true, key: '', value: '' });
    collectFolderAndMarkDirty({ includeVariables: false });
    renderFolderEditor();
  }
}

function addRequestVariable() {
  addRequestVariableForContext('request');
}

function addPerformanceRequestVariable() {
  addRequestVariableForContext('performance');
}

function addRequestVariableForContext(contextOrScope) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  const request = prepareRequestForEditorMutation(context);
  if (!request) {
    return;
  }
  request.variables ||= [];
  request.variables.push({ enabled: true, key: '', value: '' });
  markRequestEditorContextDirty(context);
  renderRequestEditorForContextScope(context);
}

function addCookieDomainFromInput() {
  const input = $('cookiesDomainInput');
  const domain = normalizeCookieManagerDomain(input?.value || '');
  if (!domain) {
    setCookieManagerError('Enter a domain name first.');
    return;
  }
  cookieManagerExtraDomains.add(domain);
  cookieManagerErrorMessage = '';
  if (input) {
    clearCookieDomainInputValue(input);
  }
  renderWorkspaceCookieManager();
  clearCookieDomainInputValue($('cookiesDomainInput'));
}

function clearCookieDomainInputValue(input) {
  if (!input) {
    return;
  }
  input.value = '';
  input.defaultValue = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function clearExpiredWorkspaceCookies() {
  closeRendererToolbarMenus(document);
  workspace.cookies ||= [];
  const before = workspace.cookies.length;
  workspace.cookies = workspace.cookies.filter((cookie) => !isExpiredCookie(cookie));
  if (workspace.cookies.length !== before) {
    markCookieJarDirty();
  }
  resetCookieManagerEditor();
  renderWorkspaceCookieManager();
  renderCookieJarEditor();
  renderPerformanceCookieJarEditor();
  setStatus(`Removed ${before - workspace.cookies.length} expired cookies.`);
}

async function clearAllWorkspaceCookies() {
  closeRendererToolbarMenus(document);
  workspace.cookies ||= [];
  if (!workspace.cookies.length && !cookieManagerExtraDomains.size) {
    setStatus('No cookies or domains to clear.');
    return;
  }
  const confirmed = await confirmActionModal({
    title: 'Clear all cookies?',
    message: 'This removes every cookie and cookie domain from the workspace cookie jar. This cannot be undone.',
    confirmLabel: 'Clear all',
    danger: true
  });
  if (!confirmed) {
    return;
  }
  const count = workspace.cookies.length;
  const domainCount = cookieManagerExtraDomains.size;
  workspace.cookies = [];
  cookieManagerExtraDomains.clear();
  resetCookieManagerEditor();
  if (count) {
    markCookieJarDirty();
  }
  renderWorkspaceCookieManager();
  renderCookieJarEditor();
  renderPerformanceCookieJarEditor();
  const cookieSummary = `${count} ${count === 1 ? 'cookie' : 'cookies'}`;
  const domainSummary = `${domainCount} ${domainCount === 1 ? 'domain' : 'domains'}`;
  setStatus(`Removed ${cookieSummary} and ${domainSummary}.`);
}

function addPair(fieldName) {
  addRequestPairForContext('request', fieldName);
}

function addPerformancePair(fieldName) {
  addRequestPairForContext('performance', fieldName);
}

function addRequestPairForContext(contextOrScope, fieldName) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  const request = prepareRequestForEditorMutation(context);
  if (!request) {
    return;
  }
  request[fieldName] ||= [];
  request[fieldName].push({ enabled: true, key: '', value: '' });
  markRequestEditorContextDirty(context);
  renderRequestEditorForContextScope(context);
}

function prepareRequestForEditorMutation(context) {
  if (context.scope === 'performance') {
    const test = activePerformanceTest();
    if (!test?.request) {
      return null;
    }
    const draftAuth = collectPerformanceAuthFromEditor();
    collectPerformanceTestFromEditor();
    const request = activePerformanceTest()?.request || test.request;
    request.auth = draftAuth;
    return request;
  }
  const request = activeRequest();
  if (!request) {
    return null;
  }
  collectRequestFromEditor();
  return request;
}

function markRequestEditorContextDirty(context) {
  if (context.scope === 'performance') {
    markActivePerformanceDirty();
    return;
  }
  markActiveRequestDirty();
}

async function renameCollection(collection) {
  const restoreTarget = treeFocusTarget('collection', collection?.id);
  const value = await promptTextInput({
    title: 'Rename collection',
    message: 'Enter a collection name.',
    label: 'Collection name',
    defaultValue: collection.name,
    singleLine: true
  });
  if (value?.trim()) {
    collection.name = uniqueName(value.trim(), workspace.collections.filter((item) => item !== collection).map((item) => item.name));
    renderCollections();
    restoreTreeFocus(restoreTarget, activeCollectionTreeFocusTargets());
  }
}

async function renameFolder(folder) {
  const restoreTarget = treeFocusTarget('folder', folder?.id);
  const value = await promptTextInput({
    title: 'Rename folder',
    message: 'Enter a folder name.',
    label: 'Folder name',
    defaultValue: folder.name,
    singleLine: true
  });
  if (value?.trim()) {
    folder.name = value.trim();
    renderCollections();
    restoreTreeFocus(restoreTarget, activeCollectionTreeFocusTargets());
  }
}

async function deleteFolder(collection, folder) {
  if (!(await confirmActionModal({
    title: 'Delete folder?',
    message: `Delete ${folder.name} and everything inside it?`,
    confirmLabel: 'Delete Folder',
    danger: true
  }))) {
    return;
  }
  removeFolder(collection, folder.id);
  activeCollectionId = collection.id;
  selectFirstRequest(collection);
  renderAll();
  restoreTreeFocus(null, activeCollectionTreeFocusTargets());
}

function renameRequest(collection, folder, request) {
  if (!request) {
    return null;
  }
  if (!canOpenRequestTabFor(collection?.id || activeCollectionId, request.id)) {
    return null;
  }
  collectActiveEditorState();
  activeRunnerRequestRunnerId = null;
  activeSidebarPanel = 'collections';
  activeMainPanel = 'request';
  activeCollectionId = collection?.id || activeCollectionId;
  activeFolderId = folder?.id || null;
  activeRequestId = request.id;
  ensureOpenRequestTabForActive();
  renderAll();
  beginRequestTitleEdit();
  return request;
}

function duplicateRequest(collection, folder, request) {
  if (!canOpenAdditionalRequestTab()) {
    return null;
  }
  const duplicate = cloneRequestWithNewId(request);
  duplicate.name = uniqueName(`${request.name} Copy`, allRequestNames(collection));
  (folder ? folder.requests : collection.requests).push(duplicate);
  activeRunnerRequestRunnerId = null;
  activeCollectionId = collection.id;
  activeFolderId = folder?.id || null;
  activeRequestId = duplicate.id;
  ensureOpenRequestTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
}

async function duplicateCollection(collection) {
  if (!collection) {
    return null;
  }
  const previousWorkspace = cloneJson(workspace);
  const duplicate = cloneCollectionWithNewIds(collection);
  duplicate.name = uniqueName(`${collection.name || 'Collection'} Copy`, workspace.collections.map((candidate) => candidate.name));
  const index = workspace.collections.findIndex((candidate) => candidate.id === collection.id);
  workspace.collections.splice(index >= 0 ? index + 1 : workspace.collections.length, 0, duplicate);
  activeRunnerRequestRunnerId = null;
  activeCollectionId = duplicate.id;
  selectFirstRequest(duplicate);
  renderAll();
  await persistWorkspaceStructureOnly('Collection duplicated.', previousWorkspace);
  return duplicate;
}

async function duplicateFolder(folder) {
  const context = findFolderTreeContext(folder?.id);
  if (!context) {
    return null;
  }
  const previousWorkspace = cloneJson(workspace);
  const duplicate = cloneFolderWithNewIds(context.folder);
  duplicate.name = uniqueName(`${context.folder.name || 'Folder'} Copy`, context.list.map((candidate) => candidate.name));
  context.list.splice(context.index + 1, 0, duplicate);
  activeRunnerRequestRunnerId = null;
  activeCollectionId = context.collection.id;
  activeFolderId = duplicate.id;
  activeRequestId = null;
  ensureOpenFolderTabForActive();
  renderAll();
  await persistWorkspaceStructureOnly('Folder duplicated.', previousWorkspace);
  return duplicate;
}

function duplicateEnvironment(environment) {
  if (!environment || !canOpenAdditionalEnvironmentTab()) {
    return null;
  }
  collectActiveEditorState();
  workspace.environments ||= [];
  const duplicate = normalizeImportedEnvironment(cloneJson(environment));
  duplicate.id = crypto.randomUUID();
  duplicate.name = uniqueName(`${environment.name || 'Environment'} Copy`, workspace.environments.map((candidate) => candidate.name));
  workspace.environments.push(duplicate);
  activeRunnerRequestRunnerId = null;
  activeEnvironmentEditorId = duplicate.id;
  activeSidebarPanel = 'environments';
  activeMainPanel = 'environment';
  ensureOpenEnvironmentTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  setStatus('Environment duplicated.');
  return duplicate;
}

function duplicateRunner(runner) {
  if (!runner || !canOpenAdditionalRunnerTab()) {
    return null;
  }
  collectActiveEditorState();
  ensureWorkspaceRunners();
  const duplicate = normalizeRunner(cloneJson(runner));
  duplicate.id = crypto.randomUUID();
  duplicate.name = uniqueName(`${runnerDisplayName(runner)} Copy`, workspace.runners.map((candidate) => candidate.name));
  duplicate.requests = normalizeRunnerRequests(duplicate.requests).map(cloneRequestWithNewId);
  workspace.runners.push(duplicate);
  activeRunnerRequestRunnerId = null;
  activeRunnerConfigId = duplicate.id;
  activeSidebarPanel = 'runners';
  activeMainPanel = 'runner';
  ensureOpenRunnerTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  setStatus('Runner duplicated.');
  return duplicate;
}

function duplicatePerformanceTest(test) {
  if (!test || !canOpenAdditionalPerformanceTab()) {
    return null;
  }
  collectActiveEditorState();
  ensureWorkspacePerformanceTests();
  const duplicate = normalizePerformanceTest(cloneJson(test), workspace);
  duplicate.id = crypto.randomUUID();
  duplicate.name = uniqueName(`${performanceTestDisplayName(test)} Copy`, workspace.performanceTests.map((candidate) => candidate.name));
  duplicate.request = cloneRequestWithNewId(duplicate.request || newRequestObject('Performance Request'));
  workspace.performanceTests.push(duplicate);
  activeRunnerRequestRunnerId = null;
  activePerformanceTestId = duplicate.id;
  activeSidebarPanel = 'performance';
  activeMainPanel = 'performance';
  ensureOpenPerformanceTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  setStatus('Performance test duplicated.');
  return duplicate;
}

async function duplicateWorkspace(workspaceId = selectedWorkspaceId || activeWorkspaceId) {
  const selectedWorkspace = typeof workspaceId === 'string' ? workspaceId : workspaceId?.id;
  if (!selectedWorkspace) {
    return null;
  }
  const duplicateBoundary = window.__postmeterDuplicateWorkspace || window.postmeter?.workspace?.duplicate;
  if (!duplicateBoundary) {
    return setStatus('Workspace duplicate is unavailable in this runtime.');
  }
  try {
    const loaded = await duplicateBoundary(selectedWorkspace);
    const duplicateId = loaded?.duplicatedWorkspaceId || selectedWorkspace;
    applyWorkspaceCatalogUpdate(loaded, {
      focus: 'workspace',
      selectedWorkspaceId: duplicateId
    });
    setStatus('Workspace duplicated.');
    return loaded;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace duplicate failed: ${message}`);
    notifyUser('Workspace Duplicate Failed', message);
    return null;
  }
}

function cloneCollectionWithNewIds(collection) {
  const duplicate = cloneJson(collection) || {};
  duplicate.id = crypto.randomUUID();
  duplicate.requests = (duplicate.requests || []).map(cloneRequestWithNewId);
  duplicate.folders = (duplicate.folders || []).map(cloneFolderWithNewIds);
  return duplicate;
}

function cloneFolderWithNewIds(folder) {
  const duplicate = cloneJson(folder) || {};
  duplicate.id = crypto.randomUUID();
  duplicate.requests = (duplicate.requests || []).map(cloneRequestWithNewId);
  duplicate.folders = (duplicate.folders || []).map(cloneFolderWithNewIds);
  return duplicate;
}

function cloneRequestWithNewId(request) {
  const duplicate = cloneJson(request) || {};
  duplicate.id = crypto.randomUUID();
  return duplicate;
}

async function deleteCollection(collection) {
  if (!(await confirmActionModal({
    title: 'Delete collection?',
    message: `Delete ${collection.name}?`,
    confirmLabel: 'Delete Collection',
    danger: true
  }))) {
    return;
  }
  collectionDirtySnapshots.delete?.(collection.id);
  removeOpenRequestTabsForCollection(collection.id);
  workspace.collections = workspace.collections.filter((item) => item.id !== collection.id);
  if (!workspace.collections.length) {
    clearActiveWorkspaceItem();
    renderAll();
  } else {
    selectInitialWorkspaceItem();
    renderAll();
  }
  restoreTreeFocus(null, activeCollectionTreeFocusTargets());
}

function clearActiveWorkspaceItem() {
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = null;
  activeRunnerRequestRunnerId = null;
  activeAuthRefreshRequestOwnerType = '';
  activeAuthRefreshRequestOwnerId = null;
}

async function deleteRequest(collection, folder, request) {
  if (!(await confirmActionModal({
    title: 'Delete request?',
    message: `Delete ${request.name}?`,
    confirmLabel: 'Delete Request',
    danger: true
  }))) {
    return;
  }
  const list = folder ? folder.requests : collection.requests;
  const index = list.findIndex((item) => item.id === request.id);
  if (index >= 0) {
    list.splice(index, 1);
  }
  removeOpenRequestTab(collection.id, request.id);
  selectFirstRequest(collection);
  ensureOpenRequestTabForActive();
  renderAll();
  restoreTreeFocus(null, activeCollectionTreeFocusTargets());
}
