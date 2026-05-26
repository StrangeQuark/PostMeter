function resetRequestTabs(options = {}) {
  resetRendererTabState(state, options);
}

function applyLoadedWorkspace(loaded, options = {}) {
  cancelActiveOauthFlowForContextReset();
  cancelActiveRuntimeForContextReset();
  resetWorkspaceTransientUi();
  updateWorkspaceCatalog(loaded, options);
  workspace = loaded?.workspace || workspace;
  lastResponse = null;
  lastRunnerResult = null;
  lastPerformanceResult = null;
  lastPerformanceResultTestId = '';
  selectedRunnerExecutionIndex = 0;
  selectedPerformanceResultIndex = 0;
  runnerExecutionPage = 0;
  performanceExecutionPage = 0;
  runnerExecutionStatusFilter = 'all';
  performanceExecutionStatusFilter = 'all';
  lastVaultMetadata = null;
  lastVaultMetadataWorkspaceId = null;
  activeOauthFlowId = null;
  activeRunnerId = null;
  selectInitialWorkspaceItem();
  if (options.focus === 'workspace') {
    activeSidebarPanel = 'workspaces';
    activeMainPanel = 'workspace';
    ensureOpenWorkspaceTabForActive();
  } else if (options.focus === 'environment') {
    activeSidebarPanel = 'environments';
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive();
  } else {
    activeSidebarPanel = 'collections';
    activeMainPanel = 'request';
  }
  if (options.render !== false) {
    renderAll();
  }
}

function resetWorkspaceTransientUi() {
  lastRenderedRequestEditorContextKey = '';
  collapsedCollectionIds = new Set();
  collapsedFolderIds = new Set();
  $('validationLabel').textContent = '';
  renderRunnerExecutionMessage('No runner run yet.');
  displayTestResults(null);
  $('runCollectionButton').disabled = false;
  $('cancelRunnerButton').disabled = true;
  setRunnerResultExportButtonsDisabled(true);
  resetOauthProgressPanel();
}

function cancelActiveOauthFlowForContextReset() {
  const flowId = activeOauthFlowId;
  if (!flowId) {
    return;
  }
  activeOauthFlowId = null;
  if (window.postmeter?.oauth?.cancelFlow) {
    Promise.resolve(window.postmeter.oauth.cancelFlow(flowId)).catch(() => {});
  }
  setOauthButtonsBusy(false);
  resetOauthProgressPanel();
}

function applyWorkspaceCatalogUpdate(loaded, options = {}) {
  updateWorkspaceCatalog(loaded, options);
  if (options.focus === 'workspace') {
    activeSidebarPanel = 'workspaces';
    activeMainPanel = 'workspace';
    ensureOpenWorkspaceTabForActive();
  }
  if (options.render !== false) {
    renderAll();
  }
}

function updateWorkspaceCatalog(loaded, options = {}) {
  workspacePath = loaded?.path || workspacePath;
  const previousOrder = workspaceOrder();
  workspaces = Array.isArray(loaded?.workspaces) ? orderWorkspaceItems(loaded.workspaces, previousOrder) : workspaces;
  activeWorkspaceId = loaded?.activeWorkspaceId || activeWorkspaceId || workspaces[0]?.id || null;
  const requestedSelectedWorkspaceId = options.selectedWorkspaceId || selectedWorkspaceId || activeWorkspaceId;
  selectedWorkspaceId = workspaceListItems().some((item) => item.id === requestedSelectedWorkspaceId)
    ? requestedSelectedWorkspaceId
    : activeWorkspaceId || workspaces[0]?.id || null;
}

function workspaceOrder() {
  return (Array.isArray(workspaces) ? workspaces : []).map((item) => item.id).filter(Boolean);
}

function orderWorkspaceItems(items, order = []) {
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const leftIndex = orderIndex.has(left?.id) ? orderIndex.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.has(right?.id) ? orderIndex.get(right.id) : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return 0;
  });
}

function restoreSessionState(session) {
  return restoreRendererSession({
    state,
    session,
    workspaceListItems,
    findFolder,
    findRequest
  });
}

function buildSessionState() {
  return buildRendererSession({
    state,
    doc: document,
    collectionForTab: requestTabState.collectionForTab,
    folderForTab: requestTabState.folderForTab,
    requestForTab: requestTabState.requestForTab,
    environmentForTab: requestTabState.environmentForTab
  });
}

async function persistSessionState() {
  if (!sessionPersistenceEnabled) {
    return null;
  }
  try {
    const saveSession = window.__postmeterSaveSession || window.postmeter.session.save;
    return await saveSession(buildSessionState());
  } catch {
    return null;
  }
}

function buildWorkspaceStateForPersistence() {
  collectCollectionFromEditor();
  collectRequestFromEditor();
  collectEnvironmentFromEditor();
  collectRunnerFromEditor();
  collectSettingsFromEditor();
  return workspace;
}

async function persistWorkspaceState() {
  if (typeof activeWorkspaceLocked === 'function' && activeWorkspaceLocked()) {
    return null;
  }
  try {
    const save = window.__postmeterSaveWorkspace || window.postmeter.workspace.save;
    workspace = await save(buildWorkspaceStateForPersistence());
    return workspace;
  } catch {
    return null;
  }
}

function flushWorkspaceSave(options = {}) {
  if (typeof activeWorkspaceLocked === 'function' && activeWorkspaceLocked()) {
    return null;
  }
  if (options.sync === true) {
    try {
      const saveWorkspaceSync = window.postmeter?.workspace?.saveSync;
      if (typeof saveWorkspaceSync === 'function') {
        const saved = saveWorkspaceSync(buildWorkspaceStateForPersistence());
        if (saved) {
          workspace = saved;
        }
        return saved;
      }
    } catch {
      return null;
    }
    return null;
  }
  return persistWorkspaceState();
}

function scheduleSessionSave(options = {}) {
  if (!sessionPersistenceEnabled) {
    return;
  }
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
  }
  sessionSaveTimer = window.setTimeout(() => {
    sessionSaveTimer = null;
    void persistSessionState();
  }, options.immediate === true ? 0 : 150);
}

function flushSessionSave(options = {}) {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  if (options.sync === true) {
    if (!sessionPersistenceEnabled) {
      return null;
    }
    try {
      const saveSessionSync = window.postmeter?.session?.saveSync;
      if (typeof saveSessionSync === 'function') {
        return saveSessionSync(buildSessionState());
      }
    } catch {
      return null;
    }
    return null;
  }
  return persistSessionState();
}

function lockedWorkspaceGateActive() {
  return typeof activeWorkspaceLocked === 'function' && activeWorkspaceLocked();
}

function normalizeLockedWorkspaceGateState() {
  if (!lockedWorkspaceGateActive()) {
    return;
  }
  const selectedWorkspaceExists = workspaceListItems().some((item) => item.id === selectedWorkspaceId);
  if (!selectedWorkspaceExists) {
    selectedWorkspaceId = activeWorkspaceId || selectedWorkspaceId;
  }
  activeSidebarPanel = 'workspaces';
  activeMainPanel = 'workspace';
  activeRunnerConfigId = null;
  activeRunnerRequestRunnerId = null;
  activeAuthRefreshRequestOwnerType = '';
  activeAuthRefreshRequestOwnerId = null;
}

function renderAll() {
  normalizeLockedWorkspaceGateState();
  renderToolbarState();
  renderSidebarPanels();
  renderMainPanels();
  renderSettings();
  renderEnvironmentSelect();
  renderCollections();
  renderEnvironments();
  renderWorkspaces();
  renderRunners();
  renderPerformanceTests();
  renderWorkspacePanel();
  renderRunnerEditor();
  renderPerformanceEditor();
  renderHistory();
  renderRequestTabs();
  renderCollectionEditor();
  renderFolderEditor();
  renderRequestEditor();
  renderCollectionVariablesEditor();
  renderFolderVariablesEditor();
  renderEnvironmentEditor();
  refreshVariableHighlights();
  scheduleSessionSave();
}

function refreshVariableHighlights(root = document) {
  VariableHighlighter.enhanceVariableTextboxes?.(root);
  VariableHighlighter.refreshVariableHighlights?.(root);
  CodeEditor.refreshCodeEditors?.(root);
}

function renderMarkdownPane(pane) {
  const config = MARKDOWN_PANE_CONFIGS[pane];
  const paneData = markdownPaneData(pane);
  if (!config || !paneData) {
    return;
  }
  const state = markdownPaneStates[pane];
  if (!paneData.item || state.contextKey !== paneData.contextKey) {
    state.contextKey = paneData.contextKey;
    state.editing = false;
  }

  const value = paneData.value();
  const saveButton = $(config.saveButtonId);
  const cancelButton = $(config.cancelButtonId);
  const actions = saveButton?.parentElement?.classList?.contains('markdown-pane-actions')
    ? saveButton.parentElement
    : cancelButton?.parentElement?.classList?.contains('markdown-pane-actions')
      ? cancelButton.parentElement
      : null;
  const preview = $(config.previewId);
  const editorShell = $(config.editorShellId);
  const input = $(config.inputId);

  if (actions) {
    actions.hidden = !state.editing;
  }
  if (saveButton) {
    saveButton.hidden = !state.editing;
    saveButton.disabled = !paneData.item;
  }
  if (cancelButton) {
    cancelButton.hidden = !state.editing;
    cancelButton.disabled = !paneData.item;
  }
  if (preview) {
    preview.hidden = state.editing;
    preview.classList.toggle('is-editable', Boolean(paneData.item) && !state.editing);
    preview.setAttribute('role', paneData.item ? 'button' : 'region');
    preview.setAttribute('aria-disabled', paneData.item ? 'false' : 'true');
    preview.setAttribute('title', paneData.item ? 'Click to edit' : '');
    preview.tabIndex = paneData.item ? 0 : -1;
    renderMarkdownPreview(preview, value, config.emptyText);
  }
  if (editorShell) {
    editorShell.hidden = !state.editing;
  }
  if (input) {
    const renderKey = `${paneData.contextKey}:${value}`;
    if (!state.editing || input.dataset.markdownRenderKey !== renderKey) {
      input.value = value;
      input.dataset.markdownRenderKey = renderKey;
    }
    refreshCodeEditorIfTextarea(input);
  }
}

function markdownPaneData(pane) {
  if (pane === 'requestDocs') {
    const request = activeRequest();
    return {
      contextKey: request ? `request:${request.id}` : 'request:none',
      item: request,
      markDirty: markActiveRequestDirty,
      setValue(value) {
        if (request) {
          request.docs = value;
        }
      },
      value() {
        return request?.docs == null ? '' : String(request.docs);
      }
    };
  }
  if (pane === 'collectionOverview') {
    const collection = activeCollection();
    return {
      contextKey: collection ? `collection:${collection.id}` : 'collection:none',
      item: collection,
      markDirty: markActiveCollectionTabDirty,
      setValue(value) {
        if (collection) {
          collection.description = value;
        }
      },
      value() {
        return collection?.description == null ? '' : String(collection.description);
      }
    };
  }
  if (pane === 'folderOverview') {
    const folder = activeFolder();
    return {
      contextKey: folder ? `folder:${folder.id}` : 'folder:none',
      item: folder,
      markDirty: markActiveFolderTabDirty,
      setValue(value) {
        if (folder) {
          folder.description = value;
        }
      },
      value() {
        return folder?.description == null ? '' : String(folder.description);
      }
    };
  }
  return null;
}

function beginMarkdownPaneEdit(pane) {
  const config = MARKDOWN_PANE_CONFIGS[pane];
  const paneData = markdownPaneData(pane);
  if (!config || !paneData?.item) {
    return;
  }
  const state = markdownPaneStates[pane];
  state.contextKey = paneData.contextKey;
  state.editing = true;
  const input = $(config.inputId);
  if (input) {
    input.dataset.markdownRenderKey = '';
  }
  renderMarkdownPane(pane);
  focusMarkdownPaneInput(config.inputId);
}

function cancelMarkdownPaneEdit(pane) {
  const config = MARKDOWN_PANE_CONFIGS[pane];
  const state = markdownPaneStates[pane];
  if (!config || !state) {
    return;
  }
  state.editing = false;
  const input = $(config.inputId);
  if (input) {
    input.dataset.markdownRenderKey = '';
  }
  renderMarkdownPane(pane);
}

function saveMarkdownPaneEdit(pane) {
  const config = MARKDOWN_PANE_CONFIGS[pane];
  const paneData = markdownPaneData(pane);
  const state = markdownPaneStates[pane];
  if (!config || !paneData?.item || !state) {
    return;
  }
  const input = $(config.inputId);
  paneData.setValue(input?.value || '');
  paneData.markDirty();
  state.editing = false;
  if (input) {
    input.dataset.markdownRenderKey = '';
  }
  renderMarkdownPane(pane);
}

function focusMarkdownPaneInput(inputId) {
  const input = $(inputId);
  if (!input) {
    return;
  }
  input.focus();
  const end = input.value.length;
  input.setSelectionRange?.(end, end);
}

function renderMarkdownPreview(preview, value, emptyText) {
  const source = String(value || '');
  if (!source.trim()) {
    // postmeter-security-allow-html: empty-state text is escaped before assigning the fixed markdown preview placeholder markup.
    preview.innerHTML = `<p class="markdown-empty">${escapeHtmlText(emptyText)}</p>`;
    return;
  }
  // postmeter-security-allow-html: MarkdownRenderer keeps markdown-it html:false and fallback rendering escapes source before preview insertion.
  preview.innerHTML = MarkdownRenderer.renderMarkdown
    ? MarkdownRenderer.renderMarkdown(source)
    : escapeHtmlText(source).replace(/\n/g, '<br>');
}

function variableHighlightVariablesForTarget(target) {
  return mergeVariableHighlightSources(
    postmanVariableHighlightVariablesForTarget(target),
    csvVariableHighlightVariablesForTarget(target)
  );
}

function postmanVariableHighlightVariablesForTarget(target) {
  const variables = [];
  mergeVariableHighlightScope(variables, workspace?.globals || [], false, 'global');
  mergeVariableHighlightScope(variables, variableHighlightEnvironmentForTarget(target)?.variables || [], true, 'environment');
  mergeVariableHighlightScope(variables, variableHighlightCollectionForTarget(target)?.variables || [], true, 'collection');
  mergeVariableHighlightScope(variables, effectiveFolderVariablesForPath(variableHighlightFolderPathForTarget(target)), true, 'folder');
  mergeVariableHighlightScope(variables, variableHighlightRequestForTarget(target)?.variables || [], true, 'request');
  return variables;
}

function mergeVariableHighlightScope(target, source, override, scope) {
  if (!Array.isArray(source)) {
    return;
  }
  for (const variable of source) {
    if (!variable || variable.enabled === false || !String(variable.key || '').trim()) {
      continue;
    }
    const key = String(variable.key).trim();
    const existing = target.find((item) => item.key === key);
    if (existing) {
      if (override) {
        existing.value = variableObservableValue(variable);
        existing.enabled = true;
        existing.source = scope;
      }
      continue;
    }
    target.push({
      enabled: true,
      key,
      source: scope,
      value: variableObservableValue(variable)
    });
  }
}

function csvVariableHighlightVariablesForTarget(target) {
  const runnerId = activeRunnerRequestRunnerId || (target?.closest?.('#runnerMainPanel') ? activeRunnerConfigId : '');
  if (runnerId) {
    const runner = (workspace?.runners || []).find((item) => item.id === runnerId);
    return csvVariablesEnabled(runner?.csvVariables || {})
      ? csvVariableNames(runner?.csvVariables || {}).map((key) => ({ enabled: true, key, source: 'csv', value: '' }))
      : [];
  }
  if (target?.closest?.('#performanceMainPanel')) {
    return csvVariablesEnabled(activePerformanceTest()?.csvVariables || {})
      ? csvVariableNames(activePerformanceTest()?.csvVariables || {}).map((key) => ({ enabled: true, key, source: 'csv', value: '' }))
      : [];
  }
  return [];
}

function mergeVariableHighlightSources(...sources) {
  const merged = [];
  const seen = new Set();
  for (const source of sources) {
    for (const variable of source || []) {
      if (!variable || variable.enabled === false) {
        continue;
      }
      const key = String(variable.key || '').trim();
      const sourceName = String(variable.source || '').trim().toLowerCase();
      const identity = `${sourceName}:${key}`;
      if (!key || seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      merged.push({ ...variable, key });
    }
  }
  return merged;
}

function variableHighlightEnvironmentForTarget(target) {
  if (activeRunnerRequestRunnerId) {
    return activeEnvironment();
  }
  if (target?.closest?.('#runnerMainPanel')) {
    return activeEnvironment();
  }
  if (target?.closest?.('#performanceMainPanel')) {
    return activeEnvironment();
  }
  return activeEnvironment();
}

function variableHighlightCollectionForTarget(target) {
  if (target?.closest?.('#collectionMainPanel')) {
    return activeCollection();
  }
  if (target?.closest?.('#folderMainPanel')) {
    return activeCollection();
  }
  if (target?.closest?.('#requestEditorPanel')) {
    return activeCollection();
  }
  return null;
}

function variableHighlightFolderPathForTarget(target) {
  if (target?.closest?.('#folderMainPanel')) {
    return activeFolderPathForActiveRequest();
  }
  if (target?.closest?.('#requestEditorPanel')) {
    return activeFolderPathForActiveRequest();
  }
  return [];
}

function variableHighlightRequestForTarget(target) {
  if (target?.closest?.('#performanceMainPanel')) {
    return activePerformanceTest()?.request || null;
  }
  if (target?.closest?.('#requestEditorPanel')) {
    return activeRequest();
  }
  return null;
}

function openVariableReferenceFromHighlight(details = {}) {
  const source = String(details.source || '').trim().toLowerCase();
  if (source === 'environment' || source === 'env') {
    return openEnvironmentFromVariableReference(details.target);
  }
  if (source === 'collection' || source === 'collectionvariable' || source === 'collectionvariables') {
    return openCollectionFromVariableReference(details.target);
  }
  if (source === 'folder' || source === 'foldervariable' || source === 'foldervariables') {
    return openFolderFromVariableReference(details.target);
  }
  if (source === 'request' || source === 'local' || source === 'variable' || source === 'variables') {
    return openRequestFromVariableReference(details.target);
  }
  return false;
}

function openEnvironmentFromVariableReference(target) {
  const environment = variableHighlightEnvironmentForTarget(target);
  if (!environment?.id || environment.id === 'none') {
    return false;
  }
  if (!canOpenEnvironmentTabFor(environment.id)) {
    return true;
  }
  collectActiveEditorState();
  activeEnvironmentEditorId = environment.id;
  activeRunnerRequestRunnerId = null;
  activeSidebarPanel = 'environments';
  activeMainPanel = 'environment';
  ensureOpenEnvironmentTabForActive();
  renderAll();
  setStatus(`Opened ${environment.name || 'Untitled Environment'} from variable reference.`);
  return true;
}

function openCollectionFromVariableReference(target) {
  const collection = variableHighlightCollectionForTarget(target);
  if (!collection?.id) {
    return false;
  }
  if (!canOpenCollectionTabFor(collection.id)) {
    return true;
  }
  collectActiveEditorState();
  activeCollectionId = collection.id;
  activeFolderId = null;
  activeRequestId = null;
  activeRunnerRequestRunnerId = null;
  activeSidebarPanel = 'collections';
  activeMainPanel = 'request';
  ensureOpenCollectionTabForActive();
  renderAll();
  activateTab('collection', 'collectionLevelVariables');
  setStatus(`Opened ${collection.name || 'Untitled Collection'} variables from variable reference.`);
  return true;
}

function openFolderFromVariableReference(target) {
  const folders = variableHighlightFolderPathForTarget(target);
  const folder = folders[folders.length - 1] || null;
  const collection = variableHighlightCollectionForTarget(target);
  if (!collection?.id || !folder?.id) {
    return false;
  }
  if (!canOpenFolderTabFor(collection.id, folder.id)) {
    return true;
  }
  collectActiveEditorState();
  activeCollectionId = collection.id;
  activeFolderId = folder.id;
  activeRequestId = null;
  activeRunnerRequestRunnerId = null;
  activeSidebarPanel = 'collections';
  activeMainPanel = 'request';
  ensureOpenFolderTabForActive();
  renderAll();
  activateTab('folder', 'folderLevelVariables');
  setStatus(`Opened ${folder.name || 'Untitled Folder'} variables from variable reference.`);
  return true;
}

function openRequestFromVariableReference(target) {
  const request = variableHighlightRequestForTarget(target);
  if (!request?.id) {
    return false;
  }
  if (activeRunnerRequestRunnerId && activeRequestId === request.id) {
    if (!canOpenRunnerRequestTabFor(activeRunnerRequestRunnerId, request.id)) {
      return true;
    }
    const runnerId = activeRunnerRequestRunnerId;
    collectActiveEditorState();
    activeCollectionId = null;
    activeFolderId = null;
    activeRequestId = request.id;
    activeRunnerRequestRunnerId = runnerId;
    activeRunnerConfigId = runnerId;
    activeSidebarPanel = 'runners';
    activeMainPanel = 'request';
    ensureOpenRequestTabForActive();
    renderAll();
    activateTab('request', 'collectionVariables');
    setStatus(`Opened ${requestDisplayName(request)} variables from variable reference.`);
    return true;
  }
  if (!activeCollectionId && activeRequestId === request.id && draftRequests.has(request.id)) {
    if (!canOpenRequestTabFor(null, request.id)) {
      return true;
    }
    collectActiveEditorState();
    activeCollectionId = null;
    activeFolderId = null;
    activeRequestId = request.id;
    activeRunnerRequestRunnerId = null;
    activeSidebarPanel = 'collections';
    activeMainPanel = 'request';
    ensureOpenRequestTabForActive();
    renderAll();
    activateTab('request', 'collectionVariables');
    setStatus(`Opened ${requestDisplayName(request)} variables from variable reference.`);
    return true;
  }
  const context = findRequestTreeContext(request.id);
  if (!context?.collection) {
    return false;
  }
  if (!canOpenRequestTabFor(context.collection.id, request.id)) {
    return true;
  }
  collectActiveEditorState();
  activeCollectionId = context.collection.id;
  activeFolderId = context.folder?.id || null;
  activeRequestId = request.id;
  activeRunnerRequestRunnerId = null;
  activeSidebarPanel = 'collections';
  activeMainPanel = 'request';
  ensureOpenRequestTabForActive();
  renderAll();
  activateTab('request', 'collectionVariables');
  setStatus(`Opened ${requestDisplayName(request)} variables from variable reference.`);
  return true;
}

function environmentById(environmentId) {
  if (!environmentId || environmentId === 'none') {
    return null;
  }
  return (workspace?.environments || []).find((environment) => environment.id === environmentId) || null;
}

function selectSidebarPanel(panel) {
  if (!['collections', 'environments', 'workspaces', 'runners', 'performance', 'history'].includes(panel)) {
    return;
  }
  if (lockedWorkspaceGateActive() && panel !== 'workspaces') {
    setStatus('Unlock workspace, switch workspaces, or create a new workspace.');
    panel = 'workspaces';
  }
  collectActiveEditorState();
  activeSidebarPanel = panel;
  if (panel === 'collections') {
    activeMainPanel = 'request';
    if (activeRunnerRequestRunnerId || activeAuthRefreshRequestOwnerType) {
      const fallbackTab = [...openRequestTabs].reverse().find((tab) => tab.runnerRequest !== true && !tab.runnerId && tab.authRefreshRequest !== true);
      if (fallbackTab) {
        selectRequestTabWithoutCollect(fallbackTab);
        return;
      }
      clearActiveWorkspaceItem();
    }
  } else if (panel === 'environments') {
    const activeTab = openEnvironmentTabs.find((tab) => tab.key === activeEnvironmentTabKey());
    const fallbackTab = activeTab || openEnvironmentTabs[openEnvironmentTabs.length - 1] || null;
    if (fallbackTab) {
      selectEnvironmentTabWithoutCollect(fallbackTab);
      return;
    }
    activeRunnerRequestRunnerId = null;
    activeAuthRefreshRequestOwnerType = '';
    activeAuthRefreshRequestOwnerId = null;
    activeEnvironmentEditorId = 'none';
    activeMainPanel = 'environment';
  } else if (panel === 'workspaces') {
    const activeTab = openWorkspaceTabs.find((tab) => tab.key === activeWorkspaceTabKey());
    const fallbackTab = activeTab || openWorkspaceTabs[openWorkspaceTabs.length - 1] || null;
    if (fallbackTab) {
      selectWorkspaceTabWithoutCollect(fallbackTab);
      return;
    }
    selectedWorkspaceId = '';
    activeAuthRefreshRequestOwnerType = '';
    activeAuthRefreshRequestOwnerId = null;
    activeMainPanel = 'workspace';
  } else if (panel === 'runners') {
    const activeTab = openRunnerTabs.find((tab) => tab.key === activeRunnerTabKey());
    const fallbackTab = activeTab || openRunnerTabs[openRunnerTabs.length - 1] || null;
    if (fallbackTab) {
      selectRunnerTabWithoutCollect(fallbackTab);
      return;
    }
    activeRunnerConfigId = null;
    activeRunnerRequestRunnerId = null;
    activeAuthRefreshRequestOwnerType = '';
    activeAuthRefreshRequestOwnerId = null;
    activeMainPanel = 'runner';
  } else if (panel === 'performance') {
    const activeTab = openPerformanceTabs.find((tab) => tab.key === activePerformanceTabKey());
    const fallbackTab = activeTab || openPerformanceTabs[openPerformanceTabs.length - 1] || null;
    if (fallbackTab) {
      selectPerformanceTabWithoutCollect(fallbackTab);
      return;
    }
    activePerformanceTestId = null;
    activeRunnerRequestRunnerId = null;
    activeAuthRefreshRequestOwnerType = '';
    activeAuthRefreshRequestOwnerId = null;
    activeMainPanel = 'performance';
  }
  renderAll();
}

function cancelActiveRuntimeForContextReset() {
  const runnerId = activeRunnerId;
  if (runnerId && typeof window.postmeter?.runner?.cancel === 'function') {
    void window.postmeter.runner.cancel(runnerId).catch(() => {});
  }
}

function renderSidebarPanels() {
  const locked = lockedWorkspaceGateActive();
  if (locked && activeSidebarPanel !== 'workspaces') {
    activeSidebarPanel = 'workspaces';
  }
  for (const button of document.querySelectorAll('.sidebar-tab')) {
    const isActive = button.dataset.sidebarPanel === activeSidebarPanel;
    const disabled = locked && button.dataset.sidebarPanel !== 'workspaces';
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.disabled = disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('[data-sidebar-panel-content]')) {
    const isActive = panel.dataset.sidebarPanelContent === activeSidebarPanel;
    panel.hidden = !isActive;
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    panel.classList.toggle('active', isActive);
  }
}

function renderMainPanels() {
  const showLockedWorkspace = lockedWorkspaceGateActive();
  const showEnvironment = !showLockedWorkspace && activeMainPanel === 'environment';
  const showWorkspace = !showLockedWorkspace && activeMainPanel === 'workspace';
  const showRunner = !showLockedWorkspace && activeMainPanel === 'runner';
  const showPerformance = !showLockedWorkspace && activeMainPanel === 'performance';
  const showDocument = showEnvironment || showWorkspace || showRunner || showPerformance;
  const showFolder = !showLockedWorkspace && activeMainPanel === 'request' && Boolean(activeFolder()) && !activeRequest();
  const showCollection = !showLockedWorkspace && activeMainPanel === 'request' && Boolean(activeCollection()) && !activeFolder() && !activeRequest();
  const showRequestEmpty = !showLockedWorkspace && activeMainPanel === 'request' && !activeRequest() && !showCollection && !showFolder;
  const showEnvironmentEmpty = showEnvironment && !activeEditorEnvironment();
  const showWorkspaceEmpty = showWorkspace && !activeWorkspaceItem();
  const showRunnerEmpty = showRunner && !activeRunner();
  const showPerformanceEmpty = showPerformance && !activePerformanceTest();
  document.querySelector('.workspace').classList.toggle('document-mode', showDocument);
  document.querySelector('.workspace').classList.toggle('locked-workspace-mode', showLockedWorkspace);
  document.querySelector('.workspace').classList.toggle('environment-mode', showEnvironment);
  document.querySelector('.workspace').classList.toggle('workspace-mode', showWorkspace);
  document.querySelector('.workspace').classList.toggle('runner-mode', showRunner);
  document.querySelector('.workspace').classList.toggle('performance-mode', showPerformance);
  document.querySelector('.workspace').classList.toggle('collection-mode', showCollection);
  document.querySelector('.workspace').classList.toggle('folder-mode', showFolder);
  document.querySelector('.workspace').classList.toggle('request-empty-mode', showRequestEmpty);
  document.querySelector('.workspace').classList.toggle('environment-empty-mode', showEnvironmentEmpty);
  document.querySelector('.workspace').classList.toggle('workspace-empty-mode', showWorkspaceEmpty);
  document.querySelector('.workspace').classList.toggle('runner-empty-mode', showRunnerEmpty);
  document.querySelector('.workspace').classList.toggle('performance-empty-mode', showPerformanceEmpty);
  $('requestEmptyPanel').hidden = !showRequestEmpty;
  $('lockedWorkspacePanel').hidden = !showLockedWorkspace;
  $('collectionMainPanel').hidden = !showCollection;
  $('folderMainPanel').hidden = !showFolder;
  $('environmentEmptyPanel').hidden = !showEnvironmentEmpty;
  $('workspaceEmptyPanel').hidden = !showWorkspaceEmpty;
  $('runnerEmptyPanel').hidden = !showRunnerEmpty;
  $('performanceEmptyPanel').hidden = !showPerformanceEmpty;
  $('requestEditorPanel').hidden = showDocument || showRequestEmpty || showCollection || showFolder;
  $('environmentMainPanel').hidden = !showEnvironment || showEnvironmentEmpty;
  $('workspaceMainPanel').hidden = !showWorkspace || showWorkspaceEmpty;
  $('runnerMainPanel').hidden = !showRunner || showRunnerEmpty;
  $('performanceMainPanel').hidden = !showPerformance || showPerformanceEmpty;
  $('workspacePaneResize').hidden = showLockedWorkspace || showDocument || showRequestEmpty || showCollection || showFolder;
  document.querySelector('.results').hidden = showLockedWorkspace || showDocument || showRequestEmpty || showCollection;
  renderLockedWorkspacePanel();
}

function renderLockedWorkspacePanel() {
  const panel = $('lockedWorkspacePanel');
  if (!panel || panel.hidden) {
    return;
  }
  const items = workspaceListItems();
  const activeItem = items.find((item) => item.id === activeWorkspaceId) || activeWorkspaceItem();
  const selectedItem = activeWorkspaceItem();
  const selectedSwitchTarget = selectedItem && selectedItem.id !== activeWorkspaceId ? selectedItem : null;
  $('lockedWorkspaceTitle').textContent = selectedSwitchTarget
    ? `${workspaceDisplayName(selectedSwitchTarget)} is available`
    : `${workspaceDisplayName(activeItem)} is locked`;
  $('lockedWorkspaceMessage').textContent = selectedSwitchTarget
    ? 'Switch to this workspace or create a new workspace.'
    : 'Unlock this workspace or create a new workspace.';
  const unlockButton = $('lockedWorkspaceUnlockButton');
  if (unlockButton) {
    unlockButton.hidden = Boolean(selectedSwitchTarget);
  }
  const switchButton = $('lockedWorkspaceSwitchButton');
  if (switchButton) {
    switchButton.hidden = !selectedSwitchTarget;
    switchButton.textContent = 'Switch to Workspace';
    switchButton.disabled = !selectedSwitchTarget;
    switchButton.setAttribute('aria-disabled', selectedSwitchTarget ? 'false' : 'true');
  }
}

function renderToolbarState() {
  const hasCollections = Array.isArray(workspace.collections) && workspace.collections.length > 0;
  $('newFolderButton').disabled = !hasCollections;
  $('newFolderButton').setAttribute('aria-disabled', hasCollections ? 'false' : 'true');
  const locked = lockedWorkspaceGateActive();
  const disabledWhileLocked = [
    'newRequestButton',
    'newCollectionButton',
    'newFolderButton',
    'newEnvironmentMenuButton',
    'newRunnerMenuButton',
    'newPerformanceTestMenuButton',
    'emptyCreateRequestButton',
    'emptyCreateEnvironmentButton',
    'emptyCreateRunnerButton',
    'emptyCreatePerformanceTestButton',
    'importMenuButton',
    'importRequestButton',
    'importCollectionButton',
    'importEnvironmentButton',
    'importRunnerButton',
    'importPerformanceTestButton',
    'importWorkspaceButton',
    'exportMenuButton',
    'exportRequestParentButton',
    'exportRequestButton',
    'exportRequestCurlButton',
    'exportCollectionParentButton',
    'exportCollectionButton',
    'exportPostmanButton',
    'exportOpenApiButton',
    'exportCurlButton',
    'exportEnvironmentParentButton',
    'exportEnvironmentButton',
    'exportPostmanEnvironmentButton',
    'exportRunnerDefinitionButton',
    'exportPerformanceTestMenuButton',
    'exportWorkspaceButton',
    'openCookiesButton'
  ];
  for (const id of disabledWhileLocked) {
    const element = $(id);
    if (element) {
      element.disabled = locked || (id === 'newFolderButton' && !hasCollections);
      element.setAttribute('aria-disabled', element.disabled ? 'true' : 'false');
    }
  }
  const environmentSelect = $('environmentSelect');
  if (environmentSelect) {
    environmentSelect.disabled = locked;
    environmentSelect.setAttribute('aria-disabled', locked ? 'true' : 'false');
  }
}
