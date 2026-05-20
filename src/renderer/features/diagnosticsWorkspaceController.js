function renderDiagnosticsPrivacyPanel() {
  ensureSettings();
  const workspaceItem = activeWorkspaceItem();
  const editable = !workspaceItem || workspaceItem.current === true;
  const diagnostics = normalizeDiagnosticsSettings(workspace.settings.diagnostics);
  setChecked('diagnosticLoggingEnabledInput', diagnostics.logging.enabled);
  setValue('diagnosticLogLevelSelect', diagnostics.logging.level);
  setChecked('diagnosticLogUrlsInput', diagnostics.requestResponseLogging.urls);
  setChecked('diagnosticLogHeadersInput', diagnostics.requestResponseLogging.headers);
  setChecked('diagnosticLogCookiesInput', diagnostics.requestResponseLogging.cookies);
  setChecked('diagnosticLogBodiesInput', diagnostics.requestResponseLogging.bodies);
  setChecked('diagnosticLogProtocolMessagesInput', diagnostics.requestResponseLogging.protocolMessages);
  setChecked('diagnosticLogScriptConsoleInput', diagnostics.requestResponseLogging.scriptConsole);
  setChecked('diagnosticLogPayloadIdentifiersInput', diagnostics.requestResponseLogging.payloadIdentifiers);
  setDiagnosticsControlsDisabled(!editable || Boolean(pendingDiagnosticsSettingsSave));
  const enabledRequestResponseCategories = Object.values(diagnostics.requestResponseLogging).filter(Boolean).length;
  const summary = $('diagnosticsPrivacySummary');
  if (summary) {
    if (!editable) {
      summary.textContent = 'Switch to this workspace to edit diagnostics privacy settings or export its local diagnostics.';
    } else if (pendingDiagnosticsSettingsSave) {
      summary.textContent = 'Saving diagnostics privacy settings before diagnostics can be exported.';
    } else if (enabledRequestResponseCategories) {
      summary.textContent = `${enabledRequestResponseCategories} request/response log categor${enabledRequestResponseCategories === 1 ? 'y is' : 'ies are'} enabled. Review exported diagnostics before sharing.`;
    } else {
      summary.textContent = '';
    }
  }
}

function setDiagnosticsControlsDisabled(disabled) {
  for (const id of [
    'diagnosticLoggingEnabledInput',
    'diagnosticLogLevelSelect',
    'diagnosticLogUrlsInput',
    'diagnosticLogHeadersInput',
    'diagnosticLogCookiesInput',
    'diagnosticLogBodiesInput',
    'diagnosticLogProtocolMessagesInput',
    'diagnosticLogScriptConsoleInput',
    'diagnosticLogPayloadIdentifiersInput',
    'exportDiagnosticsButton'
  ]) {
    const control = $(id);
    if (control) {
      control.disabled = disabled === true;
    }
  }
}

function setChecked(id, checked) {
  const input = $(id);
  if (input) {
    input.checked = checked === true;
  }
}

function setValue(id, value) {
  const input = $(id);
  if (input) {
    input.value = String(value || '');
    refreshCodeEditorIfTextarea(input);
  }
}

function setText(id, value) {
  const element = $(id);
  if (element) {
    element.textContent = String(value || '');
  }
}

function refreshCodeEditorIfTextarea(input) {
  if (String(input?.tagName || '').toUpperCase() === 'TEXTAREA') {
    CodeEditor.refreshEditor?.(input);
  }
}

function renderSandboxPackageCachePanel() {
  const summary = $('sandboxPackageCacheSummary');
  const missingList = $('sandboxPackageMissingList');
  const cacheList = $('sandboxPackageCacheList');
  if (!summary || !missingList || !cacheList) {
    return;
  }
  ensureSettings();
  const cache = workspace.settings.sandbox.packageCache || [];
  const statuses = sandboxPackageStatusRows();
  const missing = statuses.filter((item) => !item.cached || !item.pinned);
  summary.textContent = `${cache.length} reviewed package${cache.length === 1 ? '' : 's'} cached. ${missing.length} package reference${missing.length === 1 ? '' : 's'} need review.`;
  missingList.textContent = '';
  cacheList.textContent = '';
  for (const item of missing) {
    missingList.append(packageStatusRow(item.specifier, item.status));
  }
  for (const item of cache) {
    cacheList.append(packageCacheRow(item));
  }
}

function renderSandboxFileBindingsPanel() {
  const summary = $('sandboxFileBindingSummary');
  const missingList = $('sandboxFileBindingMissingList');
  const bindingList = $('sandboxFileBindingList');
  if (!summary || !missingList || !bindingList) {
    return;
  }
  ensureSettings();
  const bindings = workspace.settings.sandbox.fileBindings || [];
  const statuses = sandboxFileBindingStatusRows();
  const missing = statuses.filter((item) => !item.bound);
  const bound = statuses.filter((item) => item.bound);
  summary.textContent = `${bound.length} imported file attachment${bound.length === 1 ? '' : 's'} bound. ${missing.length} attachment reference${missing.length === 1 ? '' : 's'} need local binding.`;
  missingList.textContent = '';
  bindingList.textContent = '';
  for (const item of missing) {
    missingList.append(fileBindingStatusRow(item));
  }
  for (const item of bound) {
    bindingList.append(fileBindingRow(item));
  }
  for (const binding of bindings.filter((item) => !statuses.some((status) => status.source === item.source))) {
    bindingList.append(fileBindingRow({
      binding,
      bound: true,
      key: binding.key || '',
      mode: binding.mode || 'file',
      source: binding.source,
      status: `Bound to ${displayLocalFilePath(binding.localPath)}`
    }));
  }
}

function fileBindingStatusRow(item) {
  const row = document.createElement('div');
  row.className = 'workspace-package-row';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = item.source;
  const detail = document.createElement('span');
  detail.textContent = `${item.mode}${item.key ? `:${item.key}` : ''} - ${item.status}`;
  text.append(title, document.createElement('br'), detail);
  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = 'Bind';
  action.setAttribute('aria-label', `Bind imported file ${item.source}`);
  action.addEventListener('click', () => {
    void bindSandboxFileFromPrompt(item.source);
  });
  row.append(text, action);
  return row;
}

function fileBindingRow(item) {
  const binding = item.binding || item;
  const row = document.createElement('div');
  row.className = 'workspace-package-row';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = binding.source || item.source;
  const detail = document.createElement('span');
  detail.textContent = `${item.mode || binding.mode || 'file'} - ${binding.localPath || item.status || ''}`;
  text.append(title, document.createElement('br'), detail);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger-button';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', `Remove imported file binding ${binding.source || item.source}`);
  remove.addEventListener('click', () => {
    removeSandboxFileBinding(binding.source || item.source);
  });
  row.append(text, remove);
  return row;
}

function packageStatusRow(specifier, status) {
  const row = document.createElement('div');
  row.className = 'workspace-package-row';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = specifier;
  const detail = document.createElement('span');
  detail.textContent = status;
  text.append(title, document.createElement('br'), detail);
  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = 'Review';
  action.setAttribute('aria-label', `Review sandbox package ${specifier}`);
  action.addEventListener('click', () => {
    void addSandboxPackageFromPrompt(specifier);
  });
  const fetch = document.createElement('button');
  fetch.type = 'button';
  fetch.textContent = 'Fetch';
  fetch.setAttribute('aria-label', `Fetch sandbox package ${specifier} for review`);
  fetch.disabled = !SANDBOX_REVIEWED_PACKAGE_PATTERN.test(specifier);
  fetch.addEventListener('click', () => {
    void fetchSandboxPackageFromPrompt(specifier);
  });
  const actions = document.createElement('div');
  actions.className = 'workspace-package-actions';
  actions.append(action, fetch);
  row.append(text, actions);
  return row;
}

function packageCacheRow(item) {
  const row = document.createElement('div');
  row.className = 'workspace-package-row';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = item.specifier;
  const detail = document.createElement('span');
  detail.textContent = [
    item.integrity,
    item.registry ? `${item.registry}${item.entrypoint ? `:${item.entrypoint}` : ''}` : '',
    item.reviewedAt ? `reviewed ${item.reviewedAt}` : ''
  ].filter(Boolean).join(' - ');
  text.append(title, document.createElement('br'), detail);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger-button';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', `Remove reviewed sandbox package ${item.specifier}`);
  remove.addEventListener('click', () => {
    removeSandboxPackage(item.specifier);
  });
  row.append(text, remove);
  return row;
}

function renderVaultMetadataPanel() {
  const summary = $('sandboxVaultSummary');
  const secretList = $('sandboxVaultList');
  const auditList = $('sandboxVaultAuditList');
  if (!summary || !secretList || !auditList) {
    return;
  }
  secretList.textContent = '';
  auditList.textContent = '';
  if (!lastVaultMetadata || lastVaultMetadataWorkspaceId !== (activeWorkspaceId || '')) {
    summary.textContent = 'Vault metadata has not been loaded.';
    return;
  }
  if (lastVaultMetadata.available === false) {
    summary.textContent = 'Vault encryption is unavailable on this machine.';
    return;
  }
  const secrets = Array.isArray(lastVaultMetadata.secrets) ? lastVaultMetadata.secrets : [];
  const audit = Array.isArray(lastVaultMetadata.audit) ? lastVaultMetadata.audit : [];
  summary.textContent = `${secrets.length} vault secret${secrets.length === 1 ? '' : 's'} stored. ${audit.length} audit entr${audit.length === 1 ? 'y' : 'ies'} retained.`;
  for (const secret of secrets) {
    secretList.append(vaultMetadataRow(secret.key, secret.updatedAt || 'Stored secret', {
      actionLabel: 'Remove',
      actionAccessibleLabel: `Remove vault secret ${secret.key}`,
      onAction: () => { void unsetVaultSecret(secret.key); }
    }));
  }
  for (const entry of audit.slice(-5).reverse()) {
    auditList.append(vaultMetadataRow(`${entry.operation || 'operation'} ${entry.key || ''}`.trim(), entry.at || entry.requestName || 'Vault audit entry'));
  }
}

function vaultMetadataRow(titleText, detailText, options = {}) {
  const row = document.createElement('div');
  row.className = 'workspace-package-row';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = titleText || 'Vault entry';
  const detail = document.createElement('span');
  detail.textContent = detailText || '';
  text.append(title, document.createElement('br'), detail);
  row.append(text);
  if (options.actionLabel && typeof options.onAction === 'function') {
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = options.actionLabel;
    if (/^(Delete|Remove)\b/.test(String(options.actionLabel))) {
      action.classList.add('danger-button');
    }
    if (options.actionAccessibleLabel) {
      action.setAttribute('aria-label', options.actionAccessibleLabel);
    }
    action.addEventListener('click', options.onAction);
    row.append(action);
  }
  return row;
}

function titleCaseTheme(theme) {
  const normalizedTheme = normalizeThemeOption(theme);
  return normalizedTheme.charAt(0).toUpperCase() + normalizedTheme.slice(1);
}

function workspaceListItems() {
  const items = Array.isArray(workspaces) ? workspaces.map((item) => ({ ...item })) : [];
  if (!items.length && workspacePath) {
    return [{
      id: activeWorkspaceId || 'current',
      name: workspaceDisplayName({ id: activeWorkspaceId || 'current', path: workspacePath, name: '' }),
      path: workspacePath,
      current: true,
      deletable: false,
      ...liveWorkspaceSummary()
    }];
  }
  return items.map((item) => (
    item.id === activeWorkspaceId
      ? {
          ...item,
          name: workspaceDisplayName(item),
          path: workspacePath || item.path || '',
          current: true,
          ...liveWorkspaceSummary()
        }
      : item
  ));
}

function activeWorkspaceItem() {
  if (!selectedWorkspaceId) {
    return null;
  }
  return workspaceListItems().find((item) => item.id === selectedWorkspaceId) || null;
}

function workspaceDisplayName(workspaceItem = activeWorkspaceItem()) {
  if (typeof rendererEntityDisplay?.workspaceDisplayName === 'function') {
    return rendererEntityDisplay.workspaceDisplayName(workspaceItem);
  }
  if (workspaceItem?.name && String(workspaceItem.name).trim()) {
    return String(workspaceItem.name).trim();
  }
  const filename = String(workspaceItem?.path || workspacePath || '').split(/[\\/]/).filter(Boolean).pop();
  if (!filename) {
    return 'Workspace';
  }
  return filename.replace(/\.json$/i, '') || 'Workspace';
}

function requestDisplayName(request = activeRequest()) {
  return typeof rendererEntityDisplay?.requestDisplayName === 'function'
    ? rendererEntityDisplay.requestDisplayName(request)
    : String(request?.name || '').trim() || 'Untitled Request';
}

function selectWorkspaceItem(workspaceId) {
  if (!workspaceId) {
    return null;
  }
  const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId);
  if (!workspaceItem) {
    return null;
  }
  if (!canOpenWorkspaceTabFor(workspaceItem.id)) {
    return null;
  }
  collectActiveEditorState();
  activeRunnerRequestRunnerId = null;
  selectedWorkspaceId = workspaceItem.id;
  activeSidebarPanel = 'workspaces';
  activeMainPanel = 'workspace';
  ensureOpenWorkspaceTabForActive();
  renderAll();
  return workspaceItem;
}

function selectRunnerItem(runnerId) {
  ensureWorkspaceRunners();
  if (!runnerId) {
    return null;
  }
  const runner = workspace.runners.find((item) => item.id === runnerId);
  if (!runner) {
    return null;
  }
  if (!canOpenRunnerTabFor(runner.id)) {
    return null;
  }
  collectActiveEditorState();
  activeRunnerRequestRunnerId = null;
  activeRunnerConfigId = runner.id;
  activeSidebarPanel = 'runners';
  activeMainPanel = 'runner';
  ensureOpenRunnerTabForActive();
  renderAll();
  return runner;
}

function selectPerformanceTestItem(testId) {
  ensureWorkspacePerformanceTests();
  if (!testId) {
    return null;
  }
  const test = workspace.performanceTests.find((item) => item.id === testId);
  if (!test || !canOpenPerformanceTabFor(test.id)) {
    return null;
  }
  collectActiveEditorState();
  activeRunnerRequestRunnerId = null;
  activePerformanceTestId = test.id;
  activeSidebarPanel = 'performance';
  activeMainPanel = 'performance';
  ensureOpenPerformanceTabForActive();
  renderAll();
  return test;
}

function ensureOpenRunnerTabForActive(options = {}) {
  return requestTabState.ensureOpenRunnerTabForActive(options);
}

function newRunner() {
  if (!canOpenAdditionalRunnerTab()) {
    return null;
  }
  ensureWorkspaceRunners();
  collectActiveEditorState();
  activeRunnerRequestRunnerId = null;
  const runner = newRunnerObject(uniqueName('New Runner', workspace.runners.map((existing) => existing.name)));
  workspace.runners.push(runner);
  activeRunnerConfigId = runner.id;
  activeSidebarPanel = 'runners';
  activeMainPanel = 'runner';
  ensureOpenRunnerTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  setStatus('Created a runner.');
  return runner;
}

function newRunnerObject(name) {
  return {
    id: crypto.randomUUID(),
    name,
    environmentId: 'none',
    stopOnFailure: true,
    allowEnvironmentMutation: false,
    authRefresh: normalizeAuthRefreshConfig(),
    csvVariables: normalizeCsvVariableDataDefaultOff(),
    requests: []
  };
}

function newPerformanceTest() {
  if (!canOpenAdditionalPerformanceTab()) {
    return null;
  }
  ensureWorkspacePerformanceTests();
  collectActiveEditorState();
  activeRunnerRequestRunnerId = null;
  const test = newPerformanceTestObject(uniqueName('New Performance Test', workspace.performanceTests.map((existing) => existing.name)));
  workspace.performanceTests.push(test);
  activePerformanceTestId = test.id;
  lastPerformanceResult = null;
  lastPerformanceResultTestId = '';
  selectedPerformanceResultIndex = 0;
  performanceExecutionPage = 0;
  performanceExecutionStatusFilter = 'all';
  activeSidebarPanel = 'performance';
  activeMainPanel = 'performance';
  ensureOpenPerformanceTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  setStatus('Created a performance test.');
  return test;
}

async function deletePerformanceTest(test = activePerformanceTest()) {
  ensureWorkspacePerformanceTests();
  if (!test) {
    return false;
  }
  const confirmed = await confirmActionModal({
    title: 'Delete performance test',
    message: `Delete "${performanceTestDisplayName(test)}"?`,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!confirmed) {
    return false;
  }
  workspace.performanceTests = workspace.performanceTests.filter((item) => item.id !== test.id);
  removeOpenPerformanceTab(test.id);
  if (activePerformanceTestId === test.id) {
    activePerformanceTestId = workspace.performanceTests[0]?.id || null;
  }
  activeSidebarPanel = 'performance';
  activeMainPanel = 'performance';
  if (activePerformanceTestId) {
    ensureOpenPerformanceTabForActive();
  }
  renderAll();
  await saveWorkspace(false, { collectEditors: false });
  setStatus('Performance test deleted.');
  return true;
}

async function savePerformanceTestFromPane() {
  const test = activePerformanceTest();
  if (!test) {
    return false;
  }
  collectPerformanceTestFromEditor();
  try {
    await saveWorkspace(false, { collectEditors: false });
    const tab = openPerformanceTabs.find((candidate) => candidate.performanceTestId === test.id);
    if (tab) {
      tab.dirty = false;
      tab.createdUnsaved = false;
      tab.snapshot = snapshotPerformanceTest(test);
    }
    renderRequestTabs();
    setStatus('Performance test saved.');
    return true;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Performance test save failed: ${message}`);
    notifyUser('Performance Test Save Failed', message);
    return false;
  }
}

async function renameRunner(runner) {
  if (!runner) {
    return null;
  }
  const name = String(await promptTextInput({
    title: 'Rename runner',
    message: 'Enter a name for this runner.',
    label: 'Runner name',
    defaultValue: runnerDisplayName(runner),
    singleLine: true
  }) || '').trim();
  if (!name) {
    return null;
  }
  runner.name = name;
  activeRunnerConfigId = runner.id;
  markActiveRunnerDirty();
  renderAll();
  return runner;
}

async function renamePerformanceTest(test) {
  if (!test) {
    return null;
  }
  const name = String(await promptTextInput({
    title: 'Rename performance test',
    message: 'Enter a name for this performance test.',
    label: 'Performance test name',
    defaultValue: performanceTestDisplayName(test),
    singleLine: true
  }) || '').trim();
  if (!name) {
    return null;
  }
  ensureWorkspacePerformanceTests();
  test.name = uniqueName(name, workspace.performanceTests.filter((candidate) => candidate !== test).map((candidate) => candidate.name));
  activePerformanceTestId = test.id;
  markActivePerformanceDirty();
  renderAll();
  return test;
}

async function deleteRunner(runner = activeRunner()) {
  ensureWorkspaceRunners();
  if (!runner) {
    return false;
  }
  const confirmed = await confirmActionModal({
    title: 'Delete runner',
    message: `Delete "${runnerDisplayName(runner)}"?`,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!confirmed) {
    return false;
  }
  workspace.runners = workspace.runners.filter((item) => item.id !== runner.id);
  removeOpenRunnerTab(runner.id);
  if (activeRunnerConfigId === runner.id) {
    activeRunnerConfigId = workspace.runners[0]?.id || null;
  }
  activeSidebarPanel = 'runners';
  activeMainPanel = 'runner';
  if (activeRunnerConfigId) {
    ensureOpenRunnerTabForActive();
  }
  renderAll();
  await saveWorkspace(false, { scope: 'runners', collectEditors: false });
  setStatus('Runner deleted.');
  return true;
}

async function saveRunnerFromPane() {
  const runner = activeRunner();
  if (!runner) {
    return false;
  }
  collectRunnerFromEditor();
  try {
    await saveWorkspace(false, { scope: 'runners', collectEditors: false });
    const tab = openRunnerTabs.find((candidate) => candidate.runnerId === runner.id);
    if (tab) {
      tab.dirty = false;
      tab.createdUnsaved = false;
      tab.snapshot = snapshotRunner(runner);
    }
    renderRequestTabs();
    renderRunnerRequestList(runner);
    setStatus('Runner saved.');
    return true;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Runner save failed: ${message}`);
    notifyUser('Runner Save Failed', message);
    return false;
  }
}

function liveWorkspaceSummary() {
  return {
    schemaVersion: workspace?.schemaVersion || 0,
    collections: workspace?.collections?.length || 0,
    folders: countWorkspaceFolders(),
    requests: countWorkspaceRequests(),
    environments: workspace?.environments?.length || 0,
    runners: workspace?.runners?.length || 0,
    cookies: workspace?.cookies?.length || 0,
    historyEntries: workspace?.history?.length || 0
  };
}

function workspaceSummaryForItem(workspaceItem) {
  if (workspaceItem?.current === true) {
    return liveWorkspaceSummary();
  }
  return {
    schemaVersion: Number.isFinite(Number(workspaceItem?.schemaVersion)) ? Number(workspaceItem.schemaVersion) : 0,
    collections: Number.isFinite(Number(workspaceItem?.collectionCount)) ? Number(workspaceItem.collectionCount) : 0,
    folders: Number.isFinite(Number(workspaceItem?.folderCount)) ? Number(workspaceItem.folderCount) : 0,
    requests: Number.isFinite(Number(workspaceItem?.requestCount)) ? Number(workspaceItem.requestCount) : 0,
    environments: Number.isFinite(Number(workspaceItem?.environmentCount)) ? Number(workspaceItem.environmentCount) : 0,
    runners: Number.isFinite(Number(workspaceItem?.runnerCount)) ? Number(workspaceItem.runnerCount) : 0,
    cookies: Number.isFinite(Number(workspaceItem?.cookieCount)) ? Number(workspaceItem.cookieCount) : 0,
    historyEntries: Number.isFinite(Number(workspaceItem?.historyCount)) ? Number(workspaceItem.historyCount) : 0
  };
}

function countWorkspaceRequests() {
  let count = 0;
  for (const collection of workspace?.collections || []) {
    walkCollectionRequests(collection, () => {
      count += 1;
    });
  }
  return count;
}

function countWorkspaceFolders() {
  let count = 0;
  const walk = (folder) => {
    count += 1;
    for (const child of folder.folders || []) {
      walk(child);
    }
  };
  for (const collection of workspace?.collections || []) {
    for (const folder of collection.folders || []) {
      walk(folder);
    }
  }
  return count;
}

function collectionNode(collection) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node collection-node';
  const hasChildren = collectionTreeItemHasChildren(collection);
  const collapsed = hasChildren && isCollectionTreeItemCollapsed(state, 'collection', collection.id);
  wrapper.classList.toggle('is-collapsed', collapsed);
  const button = treeButton(collection.name, collection.id === activeCollectionId && !activeRequestId, 'COL', {
    treeKind: 'collection',
    treeId: collection.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'collection',
    id: collection.id
  }, {
    expanded: !collapsed,
    hasChildren,
    label: collection.name || 'Untitled Collection',
    onToggle: () => toggleCollectionTreeNode('collection', collection.id),
    reserveDisclosure: true
  });
  button.addEventListener('click', () => {
    if (!canOpenCollectionTabFor(collection.id)) {
      return;
    }
    collectActiveEditorState();
    setCollectionTreeItemCollapsed(state, 'collection', collection.id, false);
    activeRunnerRequestRunnerId = null;
    activeMainPanel = 'request';
    activeCollectionId = collection.id;
    activeFolderId = null;
    activeRequestId = null;
    ensureOpenCollectionTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Add Request', () => newRequest(collection.id, null)],
    ['Add Folder', () => newFolder(collection.id, null)],
    ['Rename', () => renameCollection(collection)],
    ['Duplicate', () => { void duplicateCollection(collection); }],
    ['Export', [
      ['PostMeter', () => exportCollection(collection, 'postmeter')],
      ['Postman', () => exportCollection(collection, 'postman')],
      ['OpenAPI', () => exportCollection(collection, 'openapi')],
      ['curl', () => exportCollection(collection, 'curl')]
    ]],
    ['Generate Runner', () => generateRunnerFromCollection(collection)],
    ['Delete', () => deleteCollection(collection), 'danger']
  ]);
  if (!collapsed) {
    appendSidebarTreeRows(wrapper, sidebarTreeChildRows(collection, collection, null), { className: 'tree-folder' });
  }
  return wrapper;
}

function folderNode(collection, folder) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node tree-folder folder-node';
  const hasChildren = collectionTreeItemHasChildren(folder);
  const collapsed = hasChildren && isCollectionTreeItemCollapsed(state, 'folder', folder.id);
  wrapper.classList.toggle('is-collapsed', collapsed);
  const button = treeButton(folder.name, folder.id === activeFolderId && !activeRequestId, 'FOLD', {
    treeKind: 'folder',
    treeId: folder.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'folder',
    id: folder.id,
    collectionId: collection.id
  }, {
    expanded: !collapsed,
    hasChildren,
    label: folder.name || 'Untitled Folder',
    onToggle: () => toggleCollectionTreeNode('folder', folder.id),
    reserveDisclosure: true
  });
  button.addEventListener('click', () => {
    if (!canOpenFolderTabFor(collection.id, folder.id)) {
      return;
    }
    collectActiveEditorState();
    setCollectionTreeItemCollapsed(state, 'folder', folder.id, false);
    activeRunnerRequestRunnerId = null;
    activeMainPanel = 'request';
    activeCollectionId = collection.id;
    activeFolderId = folder.id;
    activeRequestId = null;
    ensureOpenFolderTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Add Request', () => newRequest(collection.id, folder.id)],
    ['Add Folder', () => newFolder(collection.id, folder.id)],
    ['Rename', () => renameFolder(folder)],
    ['Duplicate', () => { void duplicateFolder(folder); }],
    ['Generate Runner', () => generateRunnerFromFolder(collection, folder)],
    ['Delete', () => deleteFolder(collection, folder), 'danger']
  ]);
  if (!collapsed) {
    appendSidebarTreeRows(wrapper, sidebarTreeChildRows(folder, collection, folder), { className: 'tree-folder' });
  }
  return wrapper;
}

function requestNode(collection, folder, request) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node tree-folder request-node';
  const button = treeButton(request.name, request.id === activeRequestId, request.method, {
    treeKind: 'request',
    treeId: request.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'request',
    id: request.id,
    collectionId: collection.id,
    folderId: folder?.id || ''
  }, {
    reserveDisclosure: true
  });
  button.addEventListener('click', () => {
    if (!canOpenRequestTabFor(collection.id, request.id)) {
      return;
    }
    collectActiveEditorState();
    activeRunnerRequestRunnerId = null;
    activeMainPanel = 'request';
    activeCollectionId = collection.id;
    activeFolderId = folder?.id || null;
    activeRequestId = request.id;
    ensureOpenRequestTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renameRequest(collection, folder, request)],
    ['Duplicate', () => duplicateRequest(collection, folder, request)],
    ['Export', [
      ['PostMeter', () => { void exportRequest(request, 'postmeter'); }],
      ['curl', () => { void exportRequest(request, 'curl'); }]
    ]],
    ['Delete', () => deleteRequest(collection, folder, request), 'danger']
  ]);
  return wrapper;
}

function treeButton(text, active, kind, options = {}) {
  const button = document.createElement('button');
  button.className = `tree-item${active ? ' active' : ''}`;
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'menu');
  if (options.treeKind) {
    button.dataset.treeKind = String(options.treeKind);
  }
  if (options.treeId) {
    button.dataset.treeId = String(options.treeId);
  }
  const badge = document.createElement('span');
  badge.className = ['tree-badge', tagClassName(kind)].filter(Boolean).join(' ');
  badge.textContent = methodBadgeText(kind);
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = text;
  button.append(badge, label);
  return button;
}

function appendSidebarTreeRow(wrapper, button, payload, options = {}) {
  button.__postmeterDropBars = {};
  attachSidebarTreeDrag(button, payload);
  wrapper.__postmeterTreePayload = payload;
  wrapper.__postmeterTreeButton = button;
  wrapper.append(treeRow(button, payload, options));
}

function treeRow(button, payload, options = {}) {
  const row = document.createElement('div');
  const reserveDisclosure = options.reserveDisclosure === true || options.hasChildren === true;
  row.className = `tree-row${reserveDisclosure ? '' : ' no-disclosure'}`;
  if (options.hasChildren) {
    row.append(treeDisclosureButton(payload, options));
  } else if (reserveDisclosure) {
    const spacer = document.createElement('span');
    spacer.className = 'tree-disclosure-placeholder';
    spacer.setAttribute('aria-hidden', 'true');
    row.append(spacer);
  }
  row.append(button);
  return row;
}

function treeDisclosureButton(payload, options = {}) {
  const button = document.createElement('button');
  const expanded = options.expanded !== false;
  const label = String(options.label || titleCaseTreeKind(payload?.kind)).trim();
  button.className = 'tree-disclosure';
  button.type = 'button';
  button.textContent = expanded ? 'v' : '>';
  button.dataset.treeKind = payload?.kind || '';
  button.dataset.treeId = payload?.id || '';
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${label}`);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    options.onToggle?.();
  });
  return button;
}

function toggleCollectionTreeNode(kind, id) {
  const target = treeFocusTarget(kind, id);
  toggleCollectionTreeItemCollapsed(state, kind, id);
  renderCollections();
  restoreTreeFocus(target, activeCollectionTreeFocusTargets());
  scheduleSessionSave();
}

function collapseAllCollections() {
  collapseAllCollectionTreeItems(state, workspace.collections || []);
  renderCollections();
  scheduleSessionSave();
}

function appendSidebarTreeRows(parent, rows, options = {}) {
  const normalizedRows = rows.filter((row) => row?.__postmeterTreePayload && row?.__postmeterTreeButton);
  let previousRow = null;
  for (const row of normalizedRows) {
    const payload = row.__postmeterTreePayload;
    const button = row.__postmeterTreeButton;
    const beforeCandidates = previousRow
      ? [
          { target: previousRow.__postmeterTreePayload, position: 'after' },
          { target: payload, position: 'before' }
        ]
      : [{ target: payload, position: 'before' }];
    const beforeBar = sidebarTreeDropBar(beforeCandidates, options);
    button.__postmeterDropBars.before = beforeBar;
    if (previousRow) {
      previousRow.__postmeterTreeButton.__postmeterDropBars.after = beforeBar;
    }
    parent.append(beforeBar, row);
    previousRow = row;
  }
  if (previousRow) {
    const afterBar = sidebarTreeDropBar([
      { target: previousRow.__postmeterTreePayload, position: 'after' }
    ], options);
    previousRow.__postmeterTreeButton.__postmeterDropBars.after = afterBar;
    parent.append(afterBar);
  }
}

function sidebarTreeChildRows(container, collection, folder) {
  return sidebarTreeChildEntries(container).map((entry) => (
    entry.kind === 'folder'
      ? folderNode(collection, entry.value)
      : requestNode(collection, folder, entry.value)
  ));
}

function sidebarTreeChildEntries(container) {
  const requests = (container?.requests || []).map((value) => ({ kind: 'request', value }));
  const folders = (container?.folders || []).map((value) => ({ kind: 'folder', value }));
  const entries = requests.concat(folders);
  const order = Array.isArray(container?.postman?.itemOrder) ? container.postman.itemOrder : [];
  if (!order.length) {
    return entries;
  }
  const used = new Set();
  const ordered = [];
  for (const item of order) {
    const match = entries.find((entry) => !used.has(entry.value) && sidebarTreeOrderMatches(entry, item));
    if (match) {
      used.add(match.value);
      ordered.push(match);
    }
  }
  for (const entry of entries) {
    if (!used.has(entry.value)) {
      ordered.push(entry);
    }
  }
  return ordered;
}

function sidebarTreeOrderMatches(entry, item) {
  if (item?.kind && item.kind !== entry.kind) {
    return false;
  }
  const aliases = [
    entry.value?.id,
    entry.value?.name,
    entry.value?.postman?.ids?.original,
    entry.value?.postman?.ids?.id,
    entry.value?.postman?.ids?.uid,
    entry.value?.postman?.ids?._postman_id,
    entry.value?.postman?.ids?.deterministic
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const targets = [
    item?.id,
    item?.name,
    item?.postmanId,
    item?.uid,
    item?.deterministic
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return aliases.some((alias) => targets.includes(alias));
}

function setSidebarTreeItemOrder(container, entries) {
  if (!container || !Array.isArray(entries)) {
    return;
  }
  container.postman = {
    ...(container.postman || {}),
    itemOrder: entries.map((entry) => ({
      kind: entry.kind,
      id: entry.value?.id || '',
      name: entry.value?.name || ''
    }))
  };
}

function removeSidebarTreeOrderEntry(container, entryToRemove) {
  const entries = sidebarTreeChildEntries(container).filter((entry) => !sidebarTreeEntryMatches(entry, entryToRemove));
  setSidebarTreeItemOrder(container, entries);
}

function insertSidebarTreeOrderEntry(container, movedEntry, target, position = 'after') {
  const entries = sidebarTreeChildEntries(container).filter((entry) => !sidebarTreeEntryMatches(entry, movedEntry));
  let insertIndex = entries.length;
  if (target?.kind && target?.id && position !== 'inside') {
    const targetIndex = entries.findIndex((entry) => entry.kind === target.kind && entry.value?.id === target.id);
    if (targetIndex >= 0) {
      insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
    }
  }
  entries.splice(Math.max(0, insertIndex), 0, movedEntry);
  setSidebarTreeItemOrder(container, entries);
}

function sidebarTreeEntryMatches(entry, target) {
  return entry?.kind === target?.kind && entry?.value?.id === target?.value?.id;
}

function sidebarTreeDropBar(candidates, options = {}) {
  const bar = document.createElement('div');
  bar.className = `tree-drop-bar${options.className ? ` ${options.className}` : ''}`;
  bar.__postmeterDropCandidates = candidates;
  const primaryCandidate = candidates[0];
  bar.dataset.dropKind = primaryCandidate?.target?.kind || '';
  bar.dataset.dropId = primaryCandidate?.target?.id || '';
  bar.dataset.dropPosition = primaryCandidate?.position || '';
  bar.setAttribute('aria-hidden', 'true');
  attachSidebarTreeDropBar(bar);
  return bar;
}

function attachSidebarTreeDrag(button, payload) {
  button.draggable = true;
  button.dataset.dragKind = payload.kind;
  button.addEventListener('dragstart', (event) => {
    sidebarTreeDragPayload = { ...payload };
    button.classList.add('is-dragging');
    event.dataTransfer?.setData('application/x-postmeter-tree-item', JSON.stringify(sidebarTreeDragPayload));
    event.dataTransfer?.setData('text/plain', `${payload.kind}:${payload.id}`);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  });
  button.addEventListener('dragend', () => {
    sidebarTreeDragPayload = null;
    clearSidebarTreeDropTargets();
    button.classList.remove('is-dragging');
  });
  button.addEventListener('dragover', (event) => {
    const source = sidebarTreeDragPayload || sidebarTreeDragPayloadFromEvent(event);
    const directDrop = sidebarTreeDirectDropCandidateForButton(source, payload, button, event);
    if (directDrop) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      activateSidebarTreeFolderDropTarget(button, source, directDrop);
      return;
    }
    const position = sidebarDropPosition(button, event);
    const bar = button.__postmeterDropBars?.[position];
    if (!sidebarTreeDropCandidateForSource(source, bar)) {
      clearSidebarTreeDropTargets();
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    activateSidebarTreeDropBar(bar, source);
  });
  button.addEventListener('drop', (event) => {
    const source = sidebarTreeDragPayload || sidebarTreeDragPayloadFromEvent(event);
    const directDrop = sidebarTreeDirectDropCandidateForButton(source, payload, button, event);
    if (directDrop) {
      event.preventDefault();
      clearSidebarTreeDropTargets();
      void handleSidebarTreeDrop(source, directDrop.target, directDrop.position);
      return;
    }
    const position = sidebarDropPosition(button, event);
    const bar = button.__postmeterDropBars?.[position];
    const dropTarget = sidebarTreeDropCandidateForSource(source, bar);
    if (!dropTarget) {
      return;
    }
    event.preventDefault();
    clearSidebarTreeDropTargets();
    void handleSidebarTreeDrop(source, dropTarget.target, dropTarget.position);
  });
}

function attachSidebarTreeDropBar(bar) {
  bar.addEventListener('dragover', (event) => {
    const source = sidebarTreeDragPayload || sidebarTreeDragPayloadFromEvent(event);
    if (!sidebarTreeDropCandidateForSource(source, bar)) {
      clearSidebarTreeDropTargets();
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    activateSidebarTreeDropBar(bar, source);
  });
  bar.addEventListener('drop', (event) => {
    const source = sidebarTreeDragPayload || sidebarTreeDragPayloadFromEvent(event);
    const dropTarget = sidebarTreeDropCandidateForSource(source, bar);
    if (!dropTarget) {
      return;
    }
    event.preventDefault();
    clearSidebarTreeDropTargets();
    void handleSidebarTreeDrop(source, dropTarget.target, dropTarget.position);
  });
}

function sidebarTreePayloadFromEvent(event) {
  const raw = event.dataTransfer?.getData?.('application/x-postmeter-tree-item');
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed?.kind && parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function clearSidebarTreeDropTargets() {
  setSidebarTreeDropTargets(null, null);
}

function setSidebarTreeDropTargets(activeBar, activeFolder) {
  for (const item of document.querySelectorAll('.tree-drop-bar.is-drop-target')) {
    if (item !== activeBar) {
      item.classList.remove('is-drop-target');
    }
  }
  for (const item of document.querySelectorAll('.folder-node.is-folder-drop-target')) {
    if (item !== activeFolder) {
      item.classList.remove('is-folder-drop-target');
    }
  }
  if (activeBar && !activeBar.classList.contains('is-drop-target')) {
    activeBar.classList.add('is-drop-target');
  }
  if (activeFolder && !activeFolder.classList.contains('is-folder-drop-target')) {
    activeFolder.classList.add('is-folder-drop-target');
  }
}

function activateSidebarTreeDropBar(bar, source) {
  const candidate = sidebarTreeDropCandidateForSource(source, bar);
  if (!candidate) {
    clearSidebarTreeDropTargets();
    return;
  }
  const activeFolder = ['request', 'folder'].includes(source?.kind)
    ? bar.closest('.folder-node')
    : null;
  setSidebarTreeDropTargets(bar, activeFolder);
}

function sidebarTreeDropCandidateForSource(source, bar) {
  if (!source?.kind || !bar?.__postmeterDropCandidates) {
    return null;
  }
  return bar.__postmeterDropCandidates.find((candidate) => (
    candidate?.target && canDropSidebarTreeItem(source, candidate.target)
  )) || null;
}

function sidebarTreeDirectDropCandidateForButton(source, payload, button, event) {
  if (payload?.kind !== 'folder' || !['request', 'folder'].includes(source?.kind)) {
    return null;
  }
  if (!sidebarInsideDropZone(button, event, { extendToBottom: true })) {
    return null;
  }
  return canDropSidebarTreeItem(source, payload, 'inside')
    ? { target: payload, position: 'inside' }
    : null;
}

function sidebarInsideDropZone(button, event, options = {}) {
  if (!event?.clientY || typeof button.getBoundingClientRect !== 'function') {
    return true;
  }
  const rect = button.getBoundingClientRect();
  if (!Number.isFinite(rect.height) || rect.height < 12) {
    return true;
  }
  const ratio = (event.clientY - rect.top) / rect.height;
  return options.extendToBottom
    ? ratio >= 0.25
    : ratio >= 0.25 && ratio <= 0.75;
}

function activateSidebarTreeFolderDropTarget(button, source, candidate) {
  if (!candidate || !canDropSidebarTreeItem(source, candidate.target, candidate.position)) {
    clearSidebarTreeDropTargets();
    return;
  }
  setSidebarTreeDropTargets(null, button.closest('.folder-node'));
}

function sidebarDropPosition(button, event) {
  if (!event?.clientY || typeof button.getBoundingClientRect !== 'function') {
    return 'after';
  }
  const rect = button.getBoundingClientRect();
  return event.clientY < rect.top + (rect.height / 2) ? 'before' : 'after';
}

function canDropSidebarTreeItem(source, target, position = 'after') {
  if (!source?.kind || !source?.id || !target?.kind || !target?.id) {
    return false;
  }
  if (source.kind === target.kind && source.id === target.id) {
    return false;
  }
  if (['environment', 'workspace', 'runner', 'performance', 'collection'].includes(source.kind)) {
    return source.kind === target.kind;
  }
  if (source.kind === 'request') {
    return ['collection', 'folder', 'request'].includes(target.kind);
  }
  if (source.kind === 'folder') {
    if (!['collection', 'folder', 'request'].includes(target.kind)) {
      return false;
    }
    if (target.kind === 'request') {
      const requestContext = findRequestTreeContext(target.id);
      return !!requestContext && (!requestContext.folder || !isFolderDescendantOrSelf(source.id, requestContext.folder.id));
    }
    if (position === 'inside' && target.kind !== 'folder' && target.kind !== 'collection') {
      return false;
    }
    return target.kind !== 'folder' || !isFolderDescendantOrSelf(source.id, target.id);
  }
  return false;
}

async function handleSidebarTreeDrop(source, target, position = 'after') {
  if (['environment', 'workspace', 'runner', 'performance', 'collection'].includes(source.kind) && source.kind === target.kind) {
    await moveTopLevelTreeItem(source, target, position);
    return;
  }
  await moveCollectionTreeItem(source, target, position);
}

async function moveTopLevelTreeItem(source, target, position = 'after') {
  if (!source?.id || !target?.id || source.id === target.id) {
    return false;
  }
  if (source.kind === 'workspace') {
    const nextWorkspaces = reorderItemsById(workspaces, source.id, target.id, position);
    if (!nextWorkspaces) {
      return false;
    }
    workspaces = nextWorkspaces;
    renderWorkspaces();
    await persistSessionState();
    setStatus('Workspace list order saved.');
    return true;
  }
  const listByKind = {
    environment: workspace.environments,
    runner: ensureWorkspaceRunners(),
    performance: ensureWorkspacePerformanceTests(),
    collection: workspace.collections
  };
  const list = listByKind[source.kind];
  const nextList = reorderItemsById(list, source.id, target.id, position);
  if (!nextList) {
    return false;
  }
  const previousWorkspace = cloneJson(workspace);
  if (source.kind === 'environment') {
    workspace.environments = nextList;
    renderEnvironments();
  } else if (source.kind === 'runner') {
    workspace.runners = nextList;
    renderRunners();
  } else if (source.kind === 'performance') {
    workspace.performanceTests = nextList;
    renderPerformanceTests();
  } else {
    workspace.collections = nextList;
    renderCollections();
  }
  if (!(await persistWorkspaceStructureOnly(`${titleCaseTreeKind(source.kind)} order saved.`, previousWorkspace))) {
    return false;
  }
  return true;
}

async function moveCollectionTreeItem(source, target, position = 'after') {
  const previousWorkspace = cloneJson(workspace);
  const previousRequestTabs = cloneJson(openRequestTabs);
  const previousActiveCollectionId = activeCollectionId;
  const previousActiveFolderId = activeFolderId;
  let moved = false;
  if (source.kind === 'request') {
    moved = moveRequestTreeItem(source.id, target, position);
  } else if (source.kind === 'folder') {
    moved = moveFolderTreeItem(source.id, target, position);
  }
  if (!moved) {
    return false;
  }
  renderCollections();
  renderRequestTabs();
  if (!(await persistWorkspaceStructureOnly('Collection order saved.', previousWorkspace, {
    previousRequestTabs,
    previousActiveCollectionId,
    previousActiveFolderId
  }))) {
    return false;
  }
  return true;
}

function reorderItemsById(items, sourceId, targetId, position = 'after') {
  const list = Array.isArray(items) ? [...items] : [];
  const fromIndex = list.findIndex((item) => item.id === sourceId);
  const targetIndex = list.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
    return null;
  }
  const [item] = list.splice(fromIndex, 1);
  const nextTargetIndex = list.findIndex((candidate) => candidate.id === targetId);
  const insertIndex = position === 'before' ? nextTargetIndex : nextTargetIndex + 1;
  list.splice(Math.max(0, insertIndex), 0, item);
  return list;
}

function moveRequestTreeItem(requestId, target, position = 'after') {
  const source = findRequestTreeContext(requestId);
  if (!source?.request || source.request.id === target?.id) {
    return false;
  }
  const sourceContainer = source.container;
  source.list.splice(source.index, 1);
  const destination = requestDropDestination(target, position);
  if (!destination?.list) {
    source.list.splice(source.index, 0, source.request);
    return false;
  }
  destination.list.splice(destination.index, 0, source.request);
  if (sourceContainer && sourceContainer !== destination.container) {
    removeSidebarTreeOrderEntry(sourceContainer, { kind: 'request', value: source.request });
  }
  insertSidebarTreeOrderEntry(destination.container, { kind: 'request', value: source.request }, destination.orderTarget, destination.position);
  updateOpenRequestTabsForMovedRequest(source.request.id, destination.collection.id, destination.folder?.id || '');
  if (activeRequestId === source.request.id && !activeRunnerRequestRunnerId) {
    activeCollectionId = destination.collection.id;
    activeFolderId = destination.folder?.id || null;
  }
  return true;
}

function moveFolderTreeItem(folderId, target, position = 'after') {
  const source = findFolderTreeContext(folderId);
  if (!source?.folder || isFolderDescendantOrSelf(source.folder.id, target?.id)) {
    return false;
  }
  if (target?.kind === 'request') {
    const requestContext = findRequestTreeContext(target.id);
    if (!requestContext || (requestContext.folder && isFolderDescendantOrSelf(source.folder.id, requestContext.folder.id))) {
      return false;
    }
  }
  const sourceContainer = source.container;
  source.list.splice(source.index, 1);
  const destination = folderDropDestination(target, position);
  if (!destination?.list) {
    source.list.splice(source.index, 0, source.folder);
    return false;
  }
  destination.list.splice(destination.index, 0, source.folder);
  if (sourceContainer && sourceContainer !== destination.container) {
    removeSidebarTreeOrderEntry(sourceContainer, { kind: 'folder', value: source.folder });
  }
  insertSidebarTreeOrderEntry(destination.container, { kind: 'folder', value: source.folder }, destination.orderTarget, destination.position);
  updateOpenRequestTabsForMovedFolder(source.folder, destination.collection.id);
  if (!activeRunnerRequestRunnerId && activeFolderId === source.folder.id) {
    activeCollectionId = destination.collection.id;
  }
  return true;
}

function requestDropDestination(target, position = 'after') {
  if (target.kind === 'collection') {
    const collection = workspace.collections.find((item) => item.id === target.id);
    return collection ? {
      collection,
      folder: null,
      container: collection,
      list: collection.requests ||= [],
      index: (collection.requests || []).length,
      orderTarget: null,
      position: 'inside'
    } : null;
  }
  if (target.kind === 'folder') {
    const folderContext = findFolderTreeContext(target.id);
    if (!folderContext) {
      return null;
    }
    if (position === 'inside') {
      return {
        collection: folderContext.collection,
        folder: folderContext.folder,
        container: folderContext.folder,
        list: folderContext.folder.requests ||= [],
        index: (folderContext.folder.requests || []).length,
        orderTarget: null,
        position: 'inside'
      };
    }
    const container = folderContext.parentFolder || folderContext.collection;
    return {
      collection: folderContext.collection,
      folder: folderContext.parentFolder,
      container,
      list: container.requests ||= [],
      index: (container.requests || []).length,
      orderTarget: { kind: 'folder', id: target.id },
      position
    };
  }
  if (target.kind === 'request') {
    const requestContext = findRequestTreeContext(target.id);
    if (!requestContext) {
      return null;
    }
    return {
      collection: requestContext.collection,
      folder: requestContext.folder,
      container: requestContext.container,
      list: requestContext.list,
      index: position === 'before' ? requestContext.index : requestContext.index + 1,
      orderTarget: { kind: 'request', id: target.id },
      position
    };
  }
  return null;
}

function folderDropDestination(target, position = 'after') {
  if (target.kind === 'collection') {
    const collection = workspace.collections.find((item) => item.id === target.id);
    return collection ? {
      collection,
      parentFolder: null,
      container: collection,
      list: collection.folders ||= [],
      index: (collection.folders || []).length,
      orderTarget: null,
      position: 'inside'
    } : null;
  }
  if (target.kind === 'folder') {
    const folderContext = findFolderTreeContext(target.id);
    if (!folderContext) {
      return null;
    }
    if (position === 'inside') {
      return {
        collection: folderContext.collection,
        parentFolder: folderContext.folder,
        container: folderContext.folder,
        list: folderContext.folder.folders ||= [],
        index: (folderContext.folder.folders || []).length,
        orderTarget: null,
        position: 'inside'
      };
    }
    return {
      collection: folderContext.collection,
      parentFolder: folderContext.parentFolder,
      container: folderContext.container,
      list: folderContext.list,
      index: position === 'before' ? folderContext.index : folderContext.index + 1,
      orderTarget: { kind: 'folder', id: target.id },
      position
    };
  }
  if (target.kind === 'request') {
    const requestContext = findRequestTreeContext(target.id);
    if (!requestContext) {
      return null;
    }
    const container = requestContext.container;
    return {
      collection: requestContext.collection,
      parentFolder: requestContext.folder,
      container,
      list: container.folders ||= [],
      index: (container.folders || []).length,
      orderTarget: { kind: 'request', id: target.id },
      position
    };
  }
  return null;
}

function findRequestTreeContext(requestId) {
  for (const collection of workspace.collections || []) {
    const directIndex = (collection.requests || []).findIndex((request) => request.id === requestId);
    if (directIndex >= 0) {
      return {
        collection,
        folder: null,
        container: collection,
        list: collection.requests,
        index: directIndex,
        request: collection.requests[directIndex]
      };
    }
    for (const folder of collection.folders || []) {
      const found = findRequestTreeContextInFolder(collection, folder, requestId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findRequestTreeContextInFolder(collection, folder, requestId) {
  const index = (folder.requests || []).findIndex((request) => request.id === requestId);
  if (index >= 0) {
    return {
      collection,
      folder,
      container: folder,
      list: folder.requests,
      index,
      request: folder.requests[index]
    };
  }
  for (const child of folder.folders || []) {
    const found = findRequestTreeContextInFolder(collection, child, requestId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findFolderTreeContext(folderId) {
  for (const collection of workspace.collections || []) {
    const found = findFolderTreeContextInList(collection, null, collection.folders ||= [], folderId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findFolderTreeContextInList(collection, parentFolder, list, folderId) {
  const index = list.findIndex((folder) => folder.id === folderId);
  if (index >= 0) {
    return {
      collection,
      parentFolder,
      container: parentFolder || collection,
      list,
      index,
      folder: list[index]
    };
  }
  for (const folder of list) {
    const found = findFolderTreeContextInList(collection, folder, folder.folders ||= [], folderId);
    if (found) {
      return found;
    }
  }
  return null;
}

function isFolderDescendantOrSelf(sourceFolderId, targetFolderId) {
  if (!sourceFolderId || !targetFolderId) {
    return false;
  }
  if (sourceFolderId === targetFolderId) {
    return true;
  }
  const source = findFolderTreeContext(sourceFolderId)?.folder;
  if (!source) {
    return false;
  }
  return folderContainsFolder(source, targetFolderId);
}

function folderContainsFolder(folder, targetFolderId) {
  for (const child of folder.folders || []) {
    if (child.id === targetFolderId || folderContainsFolder(child, targetFolderId)) {
      return true;
    }
  }
  return false;
}

function updateOpenRequestTabsForMovedRequest(requestId, collectionId, folderId = '') {
  for (const tab of openRequestTabs || []) {
    if (tab.runnerRequest === true || tab.runnerId || tab.draft || tab.requestId !== requestId) {
      continue;
    }
    const oldKey = tab.key;
    tab.collectionId = collectionId;
    tab.folderId = folderId || null;
    tab.key = `request:${collectionId}:${requestId}`;
    updateDirtyRequestOwnerKey(oldKey, tab.key);
  }
}

function updateOpenRequestTabsForMovedFolder(folder, collectionId) {
  for (const request of folder.requests || []) {
    updateOpenRequestTabsForMovedRequest(request.id, collectionId, folder.id);
    if (activeRequestId === request.id && !activeRunnerRequestRunnerId) {
      activeCollectionId = collectionId;
      activeFolderId = folder.id;
    }
  }
  for (const child of folder.folders || []) {
    updateOpenRequestTabsForMovedFolder(child, collectionId);
  }
}

function updateDirtyRequestOwnerKey(oldKey, nextKey) {
  if (!oldKey || oldKey === nextKey) {
    return;
  }
  if (collectionDirtyOwners instanceof Map) {
    for (const [collectionId, owner] of Array.from(collectionDirtyOwners.entries())) {
      if (owner === oldKey) {
        collectionDirtyOwners.set(collectionId, nextKey);
      }
    }
  }
  if (cookieJarDirtyOwner === oldKey) {
    cookieJarDirtyOwner = nextKey;
  }
}

async function persistWorkspaceStructureOnly(successStatus, previousWorkspace, rollback = {}) {
  try {
    const save = window.__postmeterSaveWorkspace || window.postmeter.workspace.save;
    await save(buildWorkspaceForStructuralSave());
    setStatus(successStatus);
    return true;
  } catch (error) {
    const message = error.message || String(error);
    if (previousWorkspace) {
      workspace = previousWorkspace;
    }
    if (rollback.previousRequestTabs) {
      openRequestTabs = rollback.previousRequestTabs;
    }
    if (rollback.previousActiveCollectionId !== undefined) {
      activeCollectionId = rollback.previousActiveCollectionId;
    }
    if (rollback.previousActiveFolderId !== undefined) {
      activeFolderId = rollback.previousActiveFolderId;
    }
    renderAll();
    setStatus(`Order save failed: ${message}`);
    notifyUser('Order Save Failed', message);
    return false;
  }
}

function buildWorkspaceForStructuralSave() {
  const payload = cloneJson(workspace) || {};
  restoreDirtyRequestsForStructuralSave(payload);
  restoreDirtyEnvironmentsForStructuralSave(payload);
  restoreDirtyRunnersForStructuralSave(payload);
  restoreDirtySharedStateForStructuralSave(payload);
  return payload;
}

function restoreDirtyRequestsForStructuralSave(payload) {
  for (const tab of openRequestTabs || []) {
    if (tab.draft === true || tab.createdUnsaved === true) {
      removeRequestFromStructuralPayload(payload, tab);
      continue;
    }
    if (tab.dirty !== true || !tab.snapshot) {
      continue;
    }
    const snapshot = parseSnapshot(tab.snapshot);
    if (!snapshot) {
      continue;
    }
    if (tab.authRefreshRequest === true) {
      const owner = tab.authRefreshOwnerType === 'performance'
        ? (payload.performanceTests || []).find((item) => item.id === tab.authRefreshOwnerId)
        : (payload.runners || []).find((item) => item.id === tab.authRefreshOwnerId);
      const property = authRefreshRequestPropertyForId(owner?.authRefresh, tab.requestId);
      if (property) {
        owner.authRefresh[property] = snapshot;
      }
      continue;
    }
    if (tab.runnerRequest === true || tab.runnerId) {
      const runner = (payload.runners || []).find((item) => item.id === tab.runnerId);
      const index = (runner?.requests || []).findIndex((request) => request.id === tab.requestId);
      if (index >= 0) {
        runner.requests[index] = snapshot;
      }
      continue;
    }
    const context = findRequestContextInWorkspacePayload(payload, tab.collectionId, tab.requestId);
    if (context) {
      context.list[context.index] = snapshot;
    }
  }
}

function restoreDirtyEnvironmentsForStructuralSave(payload) {
  for (const tab of openEnvironmentTabs || []) {
    const index = (payload.environments || []).findIndex((environment) => environment.id === tab.environmentId);
    if (index < 0) {
      continue;
    }
    if (tab.createdUnsaved === true) {
      payload.environments.splice(index, 1);
      continue;
    }
    if (tab.dirty === true && tab.snapshot) {
      const snapshot = parseSnapshot(tab.snapshot);
      if (snapshot) {
        payload.environments[index] = snapshot;
      }
    }
  }
}

function restoreDirtyRunnersForStructuralSave(payload) {
  for (const tab of openRunnerTabs || []) {
    const index = (payload.runners || []).findIndex((runner) => runner.id === tab.runnerId);
    if (index < 0) {
      continue;
    }
    if (tab.createdUnsaved === true) {
      payload.runners.splice(index, 1);
      continue;
    }
    if (tab.dirty === true && tab.snapshot) {
      const snapshot = parseSnapshot(tab.snapshot);
      if (snapshot) {
        payload.runners[index] = snapshot;
      }
    }
  }
}

function restoreDirtySharedStateForStructuralSave(payload) {
  if (collectionDirtySnapshots instanceof Map) {
    for (const [collectionId, snapshotValue] of collectionDirtySnapshots.entries()) {
      const collection = (payload.collections || []).find((item) => item.id === collectionId);
      const snapshot = parseSnapshot(snapshotValue);
      if (collection && Array.isArray(snapshot)) {
        collection.variables = snapshot;
      }
    }
  }
  if (cookieJarDirtySnapshot != null) {
    const snapshot = parseSnapshot(cookieJarDirtySnapshot);
    if (Array.isArray(snapshot)) {
      payload.cookies = snapshot;
    }
  }
}

function removeRequestFromStructuralPayload(payload, tab) {
  if (tab.authRefreshRequest === true) {
    const owner = tab.authRefreshOwnerType === 'performance'
      ? (payload.performanceTests || []).find((item) => item.id === tab.authRefreshOwnerId)
      : (payload.runners || []).find((item) => item.id === tab.authRefreshOwnerId);
    const property = authRefreshRequestPropertyForId(owner?.authRefresh, tab.requestId);
    if (property) {
      delete owner.authRefresh[property];
    }
    return;
  }
  if (tab.runnerRequest === true || tab.runnerId) {
    const runner = (payload.runners || []).find((item) => item.id === tab.runnerId);
    if (runner) {
      runner.requests = (runner.requests || []).filter((request) => request.id !== tab.requestId);
    }
    return;
  }
  const context = findRequestContextInWorkspacePayload(payload, tab.collectionId, tab.requestId);
  if (context) {
    context.list.splice(context.index, 1);
  }
}

function findRequestContextInWorkspacePayload(workspaceValue, collectionId, requestId) {
  const collection = (workspaceValue.collections || []).find((item) => item.id === collectionId);
  if (!collection) {
    return null;
  }
  return findRequestContextInPayloadContainer(collection, collection.requests ||= [], requestId)
    || findRequestContextInPayloadFolders(collection.folders ||= [], requestId);
}

function findRequestContextInPayloadFolders(folders, requestId) {
  for (const folder of folders || []) {
    const direct = findRequestContextInPayloadContainer(folder, folder.requests ||= [], requestId);
    if (direct) {
      return direct;
    }
    const nested = findRequestContextInPayloadFolders(folder.folders ||= [], requestId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function findRequestContextInPayloadContainer(container, list, requestId) {
  const index = list.findIndex((request) => request.id === requestId);
  return index >= 0 ? { container, list, index } : null;
}

function parseSnapshot(snapshotValue) {
  try {
    return JSON.parse(snapshotValue);
  } catch {
    return null;
  }
}

function titleCaseTreeKind(kind) {
  return String(kind || 'Item').charAt(0).toUpperCase() + String(kind || 'item').slice(1);
}

function treeFocusTarget(kind, id) {
  return kind && id ? { kind: String(kind), id: String(id) } : null;
}

function restoreTreeFocus(primary, fallbacks = []) {
  for (const target of [primary, ...fallbacks]) {
    if (focusTreeTarget(target)) {
      return true;
    }
  }
  const activeTreeItem = document.querySelector('.tree-item.active[data-tree-kind]');
  if (focusElementIfRestorable(activeTreeItem)) {
    return true;
  }
  const sidebarTabId = {
    collections: 'collectionsPanelTab',
    environments: 'environmentsPanelTab',
    workspaces: 'workspacesPanelTab',
    history: 'historyPanelTab'
  }[activeSidebarPanel];
  return focusElementIfRestorable(sidebarTabId ? document.getElementById(sidebarTabId) : null);
}

function focusTreeTarget(target) {
  if (!target?.kind || !target?.id) {
    return false;
  }
  const escapedKind = cssEscapeAttributeValue(target.kind);
  const escapedId = cssEscapeAttributeValue(target.id);
  return focusElementIfRestorable(document.querySelector(`.tree-item[data-tree-kind="${escapedKind}"][data-tree-id="${escapedId}"]`));
}

function focusElementIfRestorable(element) {
  if (!element || !element.isConnected || element.disabled || element.hidden) {
    return false;
  }
  for (let cursor = element; cursor; cursor = cursor.parentElement) {
    if (cursor.hidden || cursor.getAttribute?.('aria-hidden') === 'true') {
      return false;
    }
  }
  element.focus?.();
  return document.activeElement === element;
}

function cssEscapeAttributeValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function activeCollectionTreeFocusTargets() {
  const targets = [];
  if (activeRequestId) {
    targets.push(treeFocusTarget('request', activeRequestId));
  }
  if (activeFolderId) {
    targets.push(treeFocusTarget('folder', activeFolderId));
  }
  if (activeCollectionId) {
    targets.push(treeFocusTarget('collection', activeCollectionId));
  }
  return targets.filter(Boolean);
}

function activeEnvironmentTreeFocusTargets() {
  return activeEnvironmentEditorId && activeEnvironmentEditorId !== 'none'
    ? [treeFocusTarget('environment', activeEnvironmentEditorId)]
    : [];
}

function activeWorkspaceTreeFocusTargets() {
  return selectedWorkspaceId
    ? [treeFocusTarget('workspace', selectedWorkspaceId)]
    : [];
}

function methodClassName(method) {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  return METHODS.map((item) => item.toLowerCase()).includes(normalizedMethod)
    ? `method-${normalizedMethod}`
    : '';
}

function tagClassName(kind) {
  const methodClass = methodClassName(kind);
  if (methodClass) {
    return methodClass;
  }
  const normalizedKind = String(kind || '').trim().toLowerCase();
  const entityClassByKind = {
    col: 'entity-collection',
    collection: 'entity-collection',
    dir: 'entity-folder',
    fold: 'entity-folder',
    folder: 'entity-folder',
    env: 'entity-environment',
    environment: 'entity-environment',
    wrk: 'entity-workspace',
    workspace: 'entity-workspace',
    run: 'entity-runner',
    runner: 'entity-runner',
    perf: 'entity-performance',
    performance: 'entity-performance'
  };
  return entityClassByKind[normalizedKind] || '';
}

function updateMethodSelectClass() {
  updateMethodSelectClassFor('methodSelect');
}

function updatePerformanceMethodSelectClass() {
  updateMethodSelectClassFor('performanceMethodSelect');
}

function updateMethodSelectClassFor(selectId) {
  const select = $(selectId);
  if (!select) {
    return;
  }
  for (const method of METHODS) {
    select.classList.toggle(`method-${method.toLowerCase()}`, select.value === method);
  }
}
