async function handleAppMenuAction(action) {
  const type = typeof action === 'string' ? action : action?.type;
  try {
    switch (type) {
      case 'new-workspace':
        await newWorkspace();
        break;
      case 'new-request':
        newRequest();
        break;
      case 'new-collection':
        newCollection();
        break;
      case 'new-folder':
        await newFolderFromToolbar();
        break;
      case 'new-environment':
        newEnvironment();
        break;
      case 'new-runner':
        newRunner();
        break;
      case 'new-performance-test':
        newPerformanceTest();
        break;
      case 'save-active-tab':
        await saveActiveTabFromMenu();
        break;
      case 'settings':
        await openSettingsModal();
        break;
      case 'tutorials':
        await openTutorialsModal();
        break;
      case 'import-workspace':
        await importWorkspace();
        break;
      case 'import-request':
        await importRequest();
        break;
      case 'import-collection':
        await importCollection();
        break;
      case 'import-environment':
        await importEnvironment();
        break;
      case 'import-runner':
        await importRunner();
        break;
      case 'import-performance-test':
        await importPerformanceTest();
        break;
      case 'export-workspace':
        await exportWorkspaceFromPicker();
        break;
      case 'export-request':
        await exportRequestFromPicker('postmeter');
        break;
      case 'export-request-curl':
        await exportRequestFromPicker('curl');
        break;
      case 'export-collection':
        await exportCollection(null, 'postmeter');
        break;
      case 'export-postman':
        await exportCollection(null, 'postman');
        break;
      case 'export-openapi':
        await exportCollection(null, 'openapi');
        break;
      case 'export-curl':
        await exportCollection(null, 'curl');
        break;
      case 'export-environment':
        await exportEnvironmentFromPicker('postmeter');
        break;
      case 'export-postman-environment':
        await exportEnvironmentFromPicker('postman');
        break;
      case 'export-runner-definition':
        await exportRunnerDefinitionFromPicker();
        break;
      case 'export-performance-test':
        await exportPerformanceTestFromPicker();
        break;
      case 'export-diagnostics':
        await exportDiagnostics({ allowNonCurrentWorkspaceView: true });
        break;
      case 'set-prereleases':
        await setIncludePrereleases(action.includePrereleases === true, { save: true });
        break;
      case 'set-save-on-force-close':
        await setSaveOnForceClose(action.saveOnForceClose === true, { save: true });
        break;
      case 'check-updates':
        await checkForUpdates();
        break;
      default:
        break;
    }
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Menu action failed: ${message}`);
    notifyUser('Menu Action Failed', message);
  }
}

async function saveActiveTabFromMenu() {
  if (activeMainPanel === 'request') {
    if (activeRequest()) {
      return saveRequestFromPane();
    }
    if (activeFolder()) {
      return saveFolderFromPane();
    }
    if (activeCollection()) {
      return saveCollectionFromPane();
    }
  }
  if (activeMainPanel === 'environment') {
    return saveEnvironmentFromPane();
  }
  if (activeMainPanel === 'runner') {
    return saveRunnerFromPane();
  }
  if (activeMainPanel === 'performance') {
    return savePerformanceTestFromPane();
  }
  return saveWorkspace(true, { promptForDraft: true });
}

function closeToolbarMenus() {
  closeRendererToolbarMenus(document);
}

function renderRequestTabs() {
  requestTabState.pruneOpenTabs();
  renderRequestTabBar({
    doc: document,
    groups: [
      {
        kind: 'collection',
        tabs: openCollectionTabs,
        resolve: requestTabState.collectionForTab,
        isActive: isActiveCollectionTab,
        idPrefix: 'open-collection-tab',
        controlsId: 'collectionMainPanel',
        buttonClassName: 'request-tab-button collection-tab-button',
        methodText: () => 'COL',
        methodClassName: () => tagClassName('COL'),
        title: (collection) => collection.name || 'Untitled Collection',
        closeTitle: () => 'Close collection',
        closeAriaLabel: (collection) => `Close ${collection.name || 'Untitled Collection'}`,
        onSelect: (tab) => selectCollectionTab(tab),
        onClose: closeCollectionTab,
        onContextMenu: (event, tab, item, menuOptions) => showOpenTabContextMenu(event, 'collection', tab, item, menuOptions)
      },
      {
        kind: 'folder',
        tabs: openFolderTabs,
        resolve: requestTabState.folderForTab,
        isActive: isActiveFolderTab,
        idPrefix: 'open-folder-tab',
        controlsId: 'folderMainPanel',
        buttonClassName: 'request-tab-button folder-tab-button',
        methodText: () => 'FOLD',
        methodClassName: () => tagClassName('FOLD'),
        title: (folder) => folder.name || 'Untitled Folder',
        closeTitle: () => 'Close folder',
        closeAriaLabel: (folder) => `Close ${folder.name || 'Untitled Folder'}`,
        onSelect: (tab) => selectFolderTab(tab),
        onClose: closeFolderTab,
        onContextMenu: (event, tab, item, menuOptions) => showOpenTabContextMenu(event, 'folder', tab, item, menuOptions)
      },
      {
        kind: 'request',
        tabs: openRequestTabs,
        resolve: requestTabState.requestForTab,
        isActive: isActiveRequestTab,
        idPrefix: 'open-request-tab',
        controlsId: 'requestEditorPanel',
        buttonClassName: 'request-tab-button',
        methodText: requestTabMethodText,
        methodClassName: requestTabMethodClassName,
        title: (request) => request.name || 'Untitled Request',
        closeTitle: () => 'Close request',
        closeAriaLabel: (request) => `Close ${request.name || 'Untitled Request'}`,
        onSelect: (tab) => selectRequestTab(tab),
        onClose: closeRequestTab,
        onContextMenu: (event, tab, item, menuOptions) => showOpenTabContextMenu(event, 'request', tab, item, menuOptions)
      },
      {
        kind: 'environment',
        tabs: openEnvironmentTabs,
        resolve: requestTabState.environmentForTab,
        isActive: isActiveEnvironmentTab,
        idPrefix: 'open-environment-tab',
        controlsId: 'environmentMainPanel',
        buttonClassName: 'request-tab-button environment-tab-button',
        methodText: () => 'ENV',
        methodClassName: () => tagClassName('ENV'),
        title: (environment) => environment.name || 'Untitled Environment',
        closeTitle: () => 'Close environment',
        closeAriaLabel: (environment) => `Close ${environment.name || 'Untitled Environment'}`,
        onSelect: (tab) => selectEnvironmentTab(tab),
        onClose: closeEnvironmentTab,
        onContextMenu: (event, tab, item, menuOptions) => showOpenTabContextMenu(event, 'environment', tab, item, menuOptions)
      },
      {
        kind: 'runner',
        tabs: openRunnerTabs,
        resolve: requestTabState.runnerForTab,
        isActive: isActiveRunnerTab,
        idPrefix: 'open-runner-tab',
        controlsId: 'runnerMainPanel',
        buttonClassName: 'request-tab-button runner-tab-button',
        methodText: () => 'RUN',
        methodClassName: () => tagClassName('RUN'),
        title: (runner) => runner.name || 'Untitled Runner',
        closeTitle: () => 'Close runner',
        closeAriaLabel: (runner) => `Close ${runner.name || 'Untitled Runner'}`,
        onSelect: (tab) => selectRunnerTab(tab),
        onClose: closeRunnerTab,
        onContextMenu: (event, tab, item, menuOptions) => showOpenTabContextMenu(event, 'runner', tab, item, menuOptions)
      },
      {
        kind: 'performance',
        tabs: openPerformanceTabs,
        resolve: requestTabState.performanceTestForTab,
        isActive: isActivePerformanceTab,
        idPrefix: 'open-performance-tab',
        controlsId: 'performanceMainPanel',
        buttonClassName: 'request-tab-button performance-tab-button',
        methodText: () => 'PERF',
        methodClassName: () => tagClassName('PERF'),
        title: (test) => test.name || 'Untitled Performance Test',
        closeTitle: () => 'Close performance test',
        closeAriaLabel: (test) => `Close ${test.name || 'Untitled Performance Test'}`,
        onSelect: (tab) => selectPerformanceTab(tab),
        onClose: closePerformanceTab,
        onContextMenu: (event, tab, item, menuOptions) => showOpenTabContextMenu(event, 'performance', tab, item, menuOptions)
      },
      {
        kind: 'workspace',
        tabs: openWorkspaceTabs,
        resolve: workspaceForTab,
        isActive: isActiveWorkspaceTab,
        idPrefix: 'open-workspace-tab',
        controlsId: 'workspaceMainPanel',
        buttonClassName: 'request-tab-button workspace-tab-button',
        methodText: () => 'WRK',
        methodClassName: () => tagClassName('WRK'),
        title: (workspaceItem) => workspaceItem.name,
        closeTitle: () => 'Close workspace',
        closeAriaLabel: (workspaceItem) => `Close ${workspaceItem.name}`,
        onSelect: (tab) => selectWorkspaceTab(tab),
        onClose: closeWorkspaceTab,
        onContextMenu: (event, tab, item, menuOptions) => showOpenTabContextMenu(event, 'workspace', tab, item, menuOptions)
      }
    ]
  });
  scheduleSessionSave();
}

function requestTabMethodText(request, tab = {}) {
  const method = requestMethodBadgeText(request);
  if (isAuthRefreshRequestTab(tab)) {
    return `AUTH - ${method}`;
  }
  return isRunnerRequestTab(tab) ? `RUN - ${method}` : method;
}

function requestTabMethodClassName(request, tab = {}) {
  if (isAuthRefreshRequestTab(tab)) {
    return tagClassName(tab.authRefreshOwnerType === 'performance' ? 'PERF' : 'RUN');
  }
  return isRunnerRequestTab(tab)
    ? tagClassName('RUN')
    : methodClassName(requestMethodText(request));
}

function requestMethodText(request) {
  return String(request?.method || 'GET').trim().toUpperCase() || 'GET';
}

function requestMethodBadgeText(request) {
  return methodBadgeText(requestMethodText(request));
}

function methodBadgeText(method) {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  const compactMethodLabels = {
    DELETE: 'DEL',
    OPTIONS: 'OPT'
  };
  return compactMethodLabels[normalizedMethod] || normalizedMethod || 'GET';
}

function isRunnerRequestTab(tab = {}) {
  return tab.runnerRequest === true || Boolean(tab.runnerId);
}

function isAuthRefreshRequestTab(tab = {}) {
  return tab.authRefreshRequest === true;
}

function ensureOpenCollectionTabForActive(options = {}) {
  return requestTabState.ensureOpenCollectionTabForActive(options);
}

function ensureOpenFolderTabForActive(options = {}) {
  return requestTabState.ensureOpenFolderTabForActive(options);
}

function ensureOpenEnvironmentTabForActive(options = {}) {
  return requestTabState.ensureOpenEnvironmentTabForActive(options);
}

function ensureOpenWorkspaceTabForActive(options = {}) {
  return requestTabState.ensureOpenWorkspaceTabForActive(options);
}

function ensureOpenPerformanceTabForActive(options = {}) {
  return requestTabState.ensureOpenPerformanceTabForActive(options);
}

function ensureOpenRequestTabForActive(options = {}) {
  return requestTabState.ensureOpenRequestTabForActive(options);
}

function canOpenAdditionalRequestTab(options = {}) {
  return requestTabState.canOpenAdditionalRequestTab(options);
}

function canOpenCollectionTabFor(collectionId, options = {}) {
  return requestTabState.canOpenCollectionTabFor(collectionId, options);
}

function canOpenFolderTabFor(collectionId, folderId, options = {}) {
  return requestTabState.canOpenFolderTabFor(collectionId, folderId, options);
}

function canOpenRequestTabFor(collectionId, requestId, options = {}) {
  return requestTabState.canOpenRequestTabFor(collectionId, requestId, options);
}

function canOpenRunnerRequestTabFor(runnerId, requestId, options = {}) {
  return requestTabState.canOpenRunnerRequestTabFor(runnerId, requestId, options);
}

function canOpenAuthRefreshRequestTabFor(ownerType, ownerId, requestId, options = {}) {
  return requestTabState.canOpenAuthRefreshRequestTabFor(ownerType, ownerId, requestId, options);
}

function canOpenAdditionalEnvironmentTab(options = {}) {
  return requestTabState.canOpenAdditionalEnvironmentTab(options);
}

function canOpenEnvironmentTabFor(environmentId, options = {}) {
  return requestTabState.canOpenEnvironmentTabFor(environmentId, options);
}

function canOpenAdditionalWorkspaceTab(options = {}) {
  return requestTabState.canOpenAdditionalWorkspaceTab(options);
}

function canOpenWorkspaceTabFor(workspaceId, options = {}) {
  return requestTabState.canOpenWorkspaceTabFor(workspaceId, options);
}

function canOpenAdditionalRunnerTab(options = {}) {
  return requestTabState.canOpenAdditionalRunnerTab(options);
}

function canOpenRunnerTabFor(runnerId, options = {}) {
  return requestTabState.canOpenRunnerTabFor(runnerId, options);
}

function canOpenAdditionalPerformanceTab(options = {}) {
  return requestTabState.canOpenAdditionalPerformanceTab(options);
}

function canOpenPerformanceTabFor(performanceTestId, options = {}) {
  return requestTabState.canOpenPerformanceTabFor(performanceTestId, options);
}

function selectRequestTab(tab) {
  collectActiveEditorState();
  revealOpenRequestTabInCollectionTree(tab);
  requestTabState.selectRequestTab(tab, { collect: false });
}

function selectRequestTabWithoutCollect(tab) {
  revealOpenRequestTabInCollectionTree(tab);
  requestTabState.selectRequestTab(tab, { collect: false });
}

function selectEnvironmentTab(tab) {
  collectActiveEditorState();
  requestTabState.selectEnvironmentTab(tab);
}

function selectEnvironmentTabWithoutCollect(tab) {
  requestTabState.selectEnvironmentTab(tab);
}

function selectWorkspaceTab(tab) {
  collectActiveEditorState();
  requestTabState.selectWorkspaceTab(tab);
}

function selectWorkspaceTabWithoutCollect(tab) {
  requestTabState.selectWorkspaceTab(tab);
}

function selectRunnerTab(tab) {
  collectActiveEditorState();
  requestTabState.selectRunnerTab(tab);
}

function selectRunnerTabWithoutCollect(tab) {
  requestTabState.selectRunnerTab(tab);
}

function selectPerformanceTab(tab) {
  collectActiveEditorState();
  requestTabState.selectPerformanceTab(tab);
}

function selectPerformanceTabWithoutCollect(tab) {
  requestTabState.selectPerformanceTab(tab);
}

function selectCollectionTab(tab) {
  requestTabState.selectCollectionTab(tab);
}

function selectCollectionTabWithoutCollect(tab) {
  requestTabState.selectCollectionTab(tab, { collect: false });
}

function selectFolderTab(tab) {
  revealOpenFolderTabInCollectionTree(tab);
  requestTabState.selectFolderTab(tab);
}

function selectFolderTabWithoutCollect(tab) {
  revealOpenFolderTabInCollectionTree(tab);
  requestTabState.selectFolderTab(tab, { collect: false });
}

function revealOpenRequestTabInCollectionTree(tab) {
  if (!tab || tab.draft === true || tab.runnerRequest === true || tab.runnerId) {
    return false;
  }
  const collection = (workspace?.collections || []).find((item) => item.id === tab.collectionId);
  const found = collection ? findRequest(collection, tab.requestId) : null;
  if (!collection || !found?.request) {
    return false;
  }
  expandCollectionTreePath(collection, found.folder?.id || null);
  return true;
}

function revealOpenFolderTabInCollectionTree(tab) {
  const collection = (workspace?.collections || []).find((item) => item.id === tab?.collectionId);
  if (!collection || !tab?.folderId || !findFolder(collection, tab.folderId)) {
    return false;
  }
  expandCollectionTreePath(collection, tab.folderId, { includeTargetFolder: false });
  return true;
}

function markActiveRequestDirty() {
  requestTabState.markActiveRequestDirty();
}

function markActiveCollectionTabDirty() {
  requestTabState.markActiveCollectionTabDirty();
}

function markActiveFolderTabDirty() {
  requestTabState.markActiveFolderTabDirty();
}

function markActiveEnvironmentDirty() {
  requestTabState.markActiveEnvironmentDirty();
}

function markActiveRunnerDirty() {
  requestTabState.markActiveRunnerDirty();
}

function markActivePerformanceDirty() {
  requestTabState.markActivePerformanceDirty();
}

function collectRequestAndMarkDirty() {
  collectRequestFromEditor();
  markActiveRequestDirty();
  refreshActiveRequestGeneratedHeaderPreview();
}

function collectEnvironmentAndMarkDirty() {
  collectEnvironmentFromEditor();
  markActiveEnvironmentDirty();
}

function collectRunnerAndMarkDirty() {
  collectRunnerFromEditor();
  markActiveRunnerDirty();
  refreshVariableHighlights();
}

function collectPerformanceTestAndMarkDirty(event) {
  collectPerformanceTestFromEditor(event?.target || null);
  markActivePerformanceDirty();
  refreshActivePerformanceGeneratedHeaderPreview();
  renderPerformanceVariablePreview();
  refreshVariableHighlights();
}

function refreshActiveRequestGeneratedHeaderPreview() {
  const request = activeRequest();
  if (!request) {
    return;
  }
  renderGeneratedHeaderRows('headersTable', request);
  renderRequestHeaderControls(request);
}

function refreshActivePerformanceGeneratedHeaderPreview() {
  const test = activePerformanceTest();
  if (!test?.request) {
    return;
  }
  renderGeneratedHeaderRows('performanceHeadersTable', test.request);
  renderPerformanceRequestHeaderControls(test.request);
}

function collectActiveEditorState() {
  if (activeMainPanel === 'environment') {
    finishEnvironmentTitleEdit();
    collectEnvironmentFromEditor();
    return;
  }
  if (activeMainPanel === 'workspace') {
    void finishWorkspaceTitleEdit();
    return;
  }
  if (activeMainPanel === 'runner') {
    finishRunnerTitleEdit();
    collectRunnerFromEditor();
    return;
  }
  if (activeMainPanel === 'performance') {
    finishPerformanceTitleEdit();
    collectPerformanceTestFromEditor();
    return;
  }
  if (activeMainPanel === 'request') {
    if (activeFolder() && !activeRequest()) {
      finishFolderTitleEdit();
      collectFolderFromEditor();
      return;
    }
    if (activeCollection() && !activeRequest()) {
      finishCollectionTitleEdit();
      collectCollectionFromEditor();
      return;
    }
    finishRequestTitleEdit();
    collectRequestFromEditor();
  }
}

function clearSavedRequestDirtyState() {
  clearRendererSavedCollectionTabDirtyState(state, {
    collectionForTab: requestTabState.collectionForTab,
    onAfterClear: () => {}
  });
  clearRendererSavedFolderTabDirtyState(state, {
    folderForTab: requestTabState.folderForTab,
    onAfterClear: () => {}
  });
  clearRendererSavedRequestDirtyState(state, {
    requestForTab: requestTabState.requestForTab,
    onAfterClear: () => {
      renderRequestTabs();
      if (activeMainPanel === 'runner') {
        renderRunnerRequestList(activeRunner());
      }
    }
  });
  clearRendererSavedEnvironmentDirtyState(state, {
    environmentForTab: requestTabState.environmentForTab,
    onAfterClear: () => {}
  });
  clearRendererSavedRunnerDirtyState(state, {
    runnerForTab: requestTabState.runnerForTab,
    onAfterClear: () => {}
  });
  clearRendererSavedPerformanceDirtyState(state, {
    performanceTestForTab: requestTabState.performanceTestForTab,
    onAfterClear: renderRequestTabs
  });
  clearRendererSharedRequestDirtyState(state);
}

function ensureCollectionDirtySnapshots() {
  if (!(collectionDirtySnapshots instanceof Map)) {
    collectionDirtySnapshots = new Map();
  }
  return collectionDirtySnapshots;
}

function snapshotCollectionVariables(collection) {
  try {
    return JSON.stringify(collection?.variables || []);
  } catch {
    return '[]';
  }
}

function snapshotCookieJar() {
  try {
    return JSON.stringify(workspace?.cookies || []);
  } catch {
    return '[]';
  }
}

function markActiveCollectionDirty() {
  const collection = activeCollection();
  if (!collection) {
    return;
  }
  const snapshots = ensureCollectionDirtySnapshots();
  if (!snapshots.has(collection.id)) {
    snapshots.set(collection.id, snapshotCollectionVariables(collection));
  }
  if (!(collectionDirtyOwners instanceof Map)) {
    collectionDirtyOwners = new Map();
  }
  collectionDirtyOwners.set(collection.id, activeRequestTabKey());
  if (activeRequest()) {
    markActiveRequestDirty();
  }
}

function markCookieJarDirty() {
  if (cookieJarDirtySnapshot == null) {
    cookieJarDirtySnapshot = snapshotCookieJar();
  }
  cookieJarDirtyOwner = activeRequestTabKey();
  if (activeRequest()) {
    markActiveRequestDirty();
  }
}

function activeRequestTabKey() {
  return buildActiveRequestTabKey(state);
}

function activeCollectionTabKey() {
  return buildActiveCollectionTabKey(state);
}

function activeFolderTabKey() {
  return buildActiveFolderTabKey(state);
}

function activeEnvironmentTabKey() {
  return buildActiveEnvironmentTabKey(state);
}

function activeWorkspaceTabKey() {
  return buildActiveWorkspaceTabKey(state);
}

function activeRunnerTabKey() {
  return buildActiveRunnerTabKey(state);
}

function activePerformanceTabKey() {
  return buildActivePerformanceTabKey(state);
}

function isActiveRequestTab(tab) {
  return isRendererActiveRequestTab(state, tab);
}

function isActiveCollectionTab(tab) {
  return isRendererActiveCollectionTab(state, tab);
}

function isActiveFolderTab(tab) {
  return isRendererActiveFolderTab(state, tab);
}

function isActiveEnvironmentTab(tab) {
  return isRendererActiveEnvironmentTab(state, tab);
}

function isActiveWorkspaceTab(tab) {
  return isRendererActiveWorkspaceTab(state, tab);
}

function isActiveRunnerTab(tab) {
  return isRendererActiveRunnerTab(state, tab);
}

function isActivePerformanceTab(tab) {
  return isRendererActivePerformanceTab(state, tab);
}

function requestForTab(tab) {
  return requestTabState.requestForTab(tab);
}

function collectionForTab(tab) {
  return requestTabState.collectionForTab(tab);
}

function folderForTab(tab) {
  return requestTabState.folderForTab(tab);
}

function environmentForTab(tab) {
  return requestTabState.environmentForTab(tab);
}

function workspaceForTab(tab) {
  return requestTabState.workspaceForTab(tab);
}

function runnerForTab(tab) {
  return requestTabState.runnerForTab(tab);
}

function performanceTestForTab(tab) {
  return requestTabState.performanceTestForTab(tab);
}

function pruneOpenRequestTabs() {
  requestTabState.pruneOpenTabs();
}

function removeOpenRequestTab(keyOrCollectionId, requestId) {
  requestTabState.removeOpenRequestTab(keyOrCollectionId, requestId);
}

function removeOpenCollectionTab(keyOrCollectionId) {
  requestTabState.removeOpenCollectionTab(keyOrCollectionId);
}

function removeOpenFolderTab(keyOrCollectionId, folderId) {
  requestTabState.removeOpenFolderTab(keyOrCollectionId, folderId);
}

function removeOpenRequestTabsForCollection(collectionId) {
  requestTabState.removeOpenRequestTabsForCollection(collectionId);
}

function removeOpenEnvironmentTab(keyOrEnvironmentId) {
  requestTabState.removeOpenEnvironmentTab(keyOrEnvironmentId);
}

function removeOpenWorkspaceTab(keyOrWorkspaceId) {
  requestTabState.removeOpenWorkspaceTab(keyOrWorkspaceId);
}

function removeOpenRunnerTab(keyOrRunnerId) {
  requestTabState.removeOpenRunnerTab(keyOrRunnerId);
}

function removeOpenPerformanceTab(keyOrPerformanceTestId) {
  requestTabState.removeOpenPerformanceTab(keyOrPerformanceTestId);
}

function closeWorkspaceTab(tab) {
  return requestTabState.closeWorkspaceTab(tab);
}

function closeCollectionTab(tab) {
  return requestTabState.closeCollectionTab(tab);
}

function closeFolderTab(tab) {
  return requestTabState.closeFolderTab(tab);
}

function forceCloseCollectionTab(tab, options = {}) {
  return requestTabState.forceCloseCollectionTab(tab, options);
}

function forceCloseFolderTab(tab, options = {}) {
  return requestTabState.forceCloseFolderTab(tab, options);
}

function forceCloseWorkspaceTab(tab, options = {}) {
  return requestTabState.forceCloseWorkspaceTab(tab, options);
}

function closeRunnerTab(tab) {
  return requestTabState.closeRunnerTab(tab);
}

function forceCloseRunnerTab(tab, options = {}) {
  return requestTabState.forceCloseRunnerTab(tab, options);
}

function closePerformanceTab(tab) {
  return requestTabState.closePerformanceTab(tab);
}

function forceClosePerformanceTab(tab, options = {}) {
  return requestTabState.forceClosePerformanceTab(tab, options);
}

function closeEnvironmentTab(tab) {
  return requestTabState.closeEnvironmentTab(tab);
}

function forceCloseEnvironmentTab(tab, options = {}) {
  return requestTabState.forceCloseEnvironmentTab(tab, options);
}

async function closeRequestTab(tab) {
  return requestTabState.closeRequestTab(tab);
}

async function forceCloseRequestTab(tab, options = {}) {
  return requestTabState.forceCloseRequestTab(tab, options);
}

function promptUnsavedRequestClose(tab, request) {
  if (tab.collectionId && !tab.requestId) {
    $('unsavedRequestTitle').textContent = tab.createdUnsaved ? 'Close unsaved collection?' : 'Close collection with unsaved changes?';
    $('unsavedRequestMessage').textContent = tab.createdUnsaved
      ? `"${request.name || 'Untitled Collection'}" is not saved to the workspace. Save it before closing?`
      : `"${request.name || 'Untitled Collection'}" has unsaved changes. Save those changes before closing?`;
    return showModal('unsavedRequestModal', 'cancel');
  }
  if (tab.environmentId) {
    $('unsavedRequestTitle').textContent = tab.createdUnsaved ? 'Close unsaved environment?' : 'Close environment with unsaved changes?';
    $('unsavedRequestMessage').textContent = tab.createdUnsaved
      ? `"${request.name || 'Untitled Environment'}" is not saved to the workspace. Save it before closing?`
      : `"${request.name || 'Untitled Environment'}" has unsaved changes. Save those changes before closing?`;
    return showModal('unsavedRequestModal', 'cancel');
  }
  if (tab.runnerId && tab.runnerRequest !== true) {
    $('unsavedRequestTitle').textContent = tab.createdUnsaved ? 'Close unsaved runner?' : 'Close runner with unsaved changes?';
    $('unsavedRequestMessage').textContent = tab.createdUnsaved
      ? `"${request.name || 'Untitled Runner'}" is not saved to the workspace. Save it before closing?`
      : `"${request.name || 'Untitled Runner'}" has unsaved changes. Save those changes before closing?`;
    return showModal('unsavedRequestModal', 'cancel');
  }
  if (tab.performanceTestId) {
    $('unsavedRequestTitle').textContent = tab.createdUnsaved ? 'Close unsaved performance test?' : 'Close performance test with unsaved changes?';
    $('unsavedRequestMessage').textContent = tab.createdUnsaved
      ? `"${request.name || 'Untitled Performance Test'}" is not saved to the workspace. Save it before closing?`
      : `"${request.name || 'Untitled Performance Test'}" has unsaved changes. Save those changes before closing?`;
    return showModal('unsavedRequestModal', 'cancel');
  }
  $('unsavedRequestTitle').textContent = tab.draft ? 'Close unsaved request?' : 'Close request with unsaved changes?';
  $('unsavedRequestMessage').textContent = tab.draft
    ? `"${request.name || 'Untitled Request'}" is not saved to a collection. Save it before closing?`
    : `"${request.name || 'Untitled Request'}" has unsaved changes. Save those changes before closing?`;
  return showModal('unsavedRequestModal', 'cancel');
}

async function saveDraftRequestWithPrompt(request, options = {}) {
  const collectionId = await promptDraftSaveCollection(request);
  if (!collectionId) {
    return null;
  }
  return saveDraftRequestToCollection(request, collectionId, options);
}

async function saveDraftRequestToCollection(draftRequest, collectionId, options = {}) {
  const collection = workspace.collections.find((item) => item.id === collectionId);
  if (!collection || !draftRequest) {
    notifyUser('Save Request Failed', 'Select an existing collection before saving this request.');
    return null;
  }
  const draftId = draftRequest.id;
  if (!activeCollectionId && activeRequestId === draftId) {
    collectRequestFromEditor();
  }
  const previousRequests = Array.isArray(collection.requests) ? collection.requests.slice() : null;
  const hadRequestsProperty = Object.prototype.hasOwnProperty.call(collection, 'requests');
  const hadDraft = draftRequests.has(draftId);
  const previousDraft = hadDraft ? draftRequests.get(draftId) : null;
  const previousActiveMainPanel = activeMainPanel;
  const previousActiveCollectionId = activeCollectionId;
  const previousActiveFolderId = activeFolderId;
  const previousActiveRequestId = activeRequestId;
  const previousActiveRunnerRequestRunnerId = activeRunnerRequestRunnerId;
  const oldKey = `draft:${draftId}`;
  const existingTab = options.tab || openRequestTabs.find((candidate) => candidate.key === oldKey);
  if (!existingTab && !canOpenRequestTabFor(collection.id, draftId)) {
    return null;
  }
  const previousTab = existingTab ? structuredClone(existingTab) : null;
  const request = structuredClone(draftRequest);
  request.name = uniqueName(request.name || 'Untitled Request', allRequestNames(collection));
  collection.requests ||= [];
  collection.requests.push(request);
  draftRequests.delete(draftId);
  activeMainPanel = 'request';
  activeRunnerRequestRunnerId = null;
  activeCollectionId = collection.id;
  activeFolderId = null;
  activeRequestId = request.id;

  let createdTab = false;
  let tab = existingTab;
  if (tab) {
    tab.key = `request:${collection.id}:${request.id}`;
    tab.collectionId = collection.id;
    tab.folderId = null;
    tab.requestId = request.id;
    tab.draft = false;
    tab.dirty = true;
    tab.createdUnsaved = true;
    tab.snapshot = snapshotRequest(request);
  } else {
    tab = ensureOpenRequestTabForActive({ dirty: true, createdUnsaved: true });
    createdTab = Boolean(tab);
  }
  try {
    await persistWorkspace(options.showStatus !== false, { collectEditors: false });
  } catch (error) {
    if (hadRequestsProperty) {
      collection.requests = previousRequests || [];
    } else {
      delete collection.requests;
    }
    if (hadDraft) {
      draftRequests.set(draftId, previousDraft);
    } else {
      draftRequests.delete(draftId);
    }
    activeMainPanel = previousActiveMainPanel;
    activeCollectionId = previousActiveCollectionId;
    activeFolderId = previousActiveFolderId;
    activeRequestId = previousActiveRequestId;
    activeRunnerRequestRunnerId = previousActiveRunnerRequestRunnerId;
    if (createdTab && tab) {
      const index = openRequestTabs.indexOf(tab);
      if (index >= 0) {
        openRequestTabs.splice(index, 1);
      }
    } else if (tab && previousTab) {
      for (const key of Object.keys(tab)) {
        delete tab[key];
      }
      Object.assign(tab, previousTab);
    }
    const message = error?.message || String(error || 'Unknown error');
    setStatus(`Request Save Failed: ${message}`);
    notifyUser('Request Save Failed', message);
    renderAll();
    return null;
  }
  renderAll();
  return tab;
}

function promptDraftSaveCollection(request) {
  selectedDraftSaveCollectionId = '';
  $('saveDraftRequestMessage').textContent = `Choose a collection for "${request?.name || 'Untitled Request'}".`;
  renderSaveDraftCollectionList();
  return showModal('saveDraftRequestModal', null);
}
