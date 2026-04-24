const BODY_TYPES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const THEME_OPTIONS = ['system', 'light', 'dark'];
const RENDERER_STATE_DEFAULTS = PostMeterRendererState.createRendererState();
const TAB_PANEL_IDS = {
  request: ['paramsTab', 'headersTab', 'authTab', 'cookiesTab', 'bodyTab', 'testsTab', 'scriptsTab', 'examplesTab', 'collectionVariablesTab'],
  results: ['responseTab', 'loadTab', 'runnerTab']
};

let workspace = RENDERER_STATE_DEFAULTS.workspace;
let workspacePath = RENDERER_STATE_DEFAULTS.workspacePath;
let workspaces = RENDERER_STATE_DEFAULTS.workspaces;
let activeCollectionId = RENDERER_STATE_DEFAULTS.activeCollectionId;
let activeFolderId = RENDERER_STATE_DEFAULTS.activeFolderId;
let activeRequestId = RENDERER_STATE_DEFAULTS.activeRequestId;
let activeEnvironmentId = RENDERER_STATE_DEFAULTS.activeEnvironmentId;
let activeWorkspaceId = RENDERER_STATE_DEFAULTS.activeWorkspaceId;
let activeSidebarPanel = RENDERER_STATE_DEFAULTS.activeSidebarPanel;
let activeMainPanel = RENDERER_STATE_DEFAULTS.activeMainPanel;
let draftRequests = RENDERER_STATE_DEFAULTS.draftRequests;
let openRequestTabs = RENDERER_STATE_DEFAULTS.openRequestTabs;
let openEnvironmentTabs = RENDERER_STATE_DEFAULTS.openEnvironmentTabs;
let openWorkspaceTabs = RENDERER_STATE_DEFAULTS.openWorkspaceTabs;
let activeLoadId = RENDERER_STATE_DEFAULTS.activeLoadId;
let activeOauthFlowId = RENDERER_STATE_DEFAULTS.activeOauthFlowId;
let activeRunnerId = RENDERER_STATE_DEFAULTS.activeRunnerId;
let lastLoadResult = RENDERER_STATE_DEFAULTS.lastLoadResult;
let lastRunnerResult = RENDERER_STATE_DEFAULTS.lastRunnerResult;
let lastResponse = RENDERER_STATE_DEFAULTS.lastResponse;
let lastStatusMessage = RENDERER_STATE_DEFAULTS.lastStatusMessage;
let lastUserNotification = RENDERER_STATE_DEFAULTS.lastUserNotification;
let activeModalId = RENDERER_STATE_DEFAULTS.activeModalId;
let activeModalResolver = RENDERER_STATE_DEFAULTS.activeModalResolver;
let selectedDraftSaveCollectionId = RENDERER_STATE_DEFAULTS.selectedDraftSaveCollectionId;
let sessionSaveTimer = null;
let sessionPersistenceEnabled = false;

const $ = (id) => document.getElementById(id);
const ASSERTION_TEMPLATES = PostMeterAssertionModel.assertionTemplates;
const {
  newAssertion
} = PostMeterAssertionModel;
const {
  exampleFromResponse,
  newExampleObject
} = PostMeterExampleModel;
const {
  collectAuthFromEditor: collectRequestAuthFromEditor,
  renderAuthEditor: renderRequestAuthEditor,
  renderAssertions: renderRequestAssertions,
  renderCookieJarEditor: renderRequestCookieJarEditor,
  renderExamples: renderRequestExamples,
  renderRequestPairs: renderEditorRequestPairs,
  renderVariablePairs: renderEditorVariablePairs,
  renderVariablePreview: renderEditorVariablePreview
} = PostMeterRequestEditorPanels;
const {
  applyPostmanCookieMetadata,
  domainFromRequestUrl,
  isExpiredCookie,
  newWorkspaceCookie,
  parseCookieHeaderForJar,
  postmanCookieMetadataByName
} = PostMeterCookieModel;
const {
  bindUi: bindRendererUi,
  closeToolbarMenus: closeRendererToolbarMenus,
  initializeRenderer
} = PostMeterRendererBootstrap;
const { createVariableAutocomplete } = PostMeterVariableAutocomplete;
const {
  activeEnvironmentTabKey: buildActiveEnvironmentTabKey,
  activeRequestTabKey: buildActiveRequestTabKey,
  activeWorkspaceTabKey: buildActiveWorkspaceTabKey,
  clearSavedEnvironmentDirtyState: clearRendererSavedEnvironmentDirtyState,
  clearSavedRequestDirtyState: clearRendererSavedRequestDirtyState,
  isActiveEnvironmentTab: isRendererActiveEnvironmentTab,
  isActiveRequestTab: isRendererActiveRequestTab,
  isActiveWorkspaceTab: isRendererActiveWorkspaceTab,
  openModalState,
  requestSnapshot: snapshotRequest,
  resetTabState: resetRendererTabState,
  resolveModalState
} = PostMeterRendererState;
const {
  buildRendererSession,
  restoreRendererSession
} = PostMeterRendererSessionPersistence;
const { createRequestTabState } = PostMeterRequestTabState;
const { renderRequestTabs: renderRequestTabBar } = PostMeterRequestTabs;
const { createRendererWorkflows } = PostMeterRendererWorkflows;

const state = {
  get workspace() { return workspace; },
  set workspace(value) { workspace = value; },
  get workspacePath() { return workspacePath; },
  set workspacePath(value) { workspacePath = value; },
  get workspaces() { return workspaces; },
  set workspaces(value) { workspaces = value; },
  get activeCollectionId() { return activeCollectionId; },
  set activeCollectionId(value) { activeCollectionId = value; },
  get activeFolderId() { return activeFolderId; },
  set activeFolderId(value) { activeFolderId = value; },
  get activeRequestId() { return activeRequestId; },
  set activeRequestId(value) { activeRequestId = value; },
  get activeEnvironmentId() { return activeEnvironmentId; },
  set activeEnvironmentId(value) { activeEnvironmentId = value; },
  get activeWorkspaceId() { return activeWorkspaceId; },
  set activeWorkspaceId(value) { activeWorkspaceId = value; },
  get activeSidebarPanel() { return activeSidebarPanel; },
  set activeSidebarPanel(value) { activeSidebarPanel = value; },
  get activeMainPanel() { return activeMainPanel; },
  set activeMainPanel(value) { activeMainPanel = value; },
  get draftRequests() { return draftRequests; },
  set draftRequests(value) { draftRequests = value; },
  get openRequestTabs() { return openRequestTabs; },
  set openRequestTabs(value) { openRequestTabs = value; },
  get openEnvironmentTabs() { return openEnvironmentTabs; },
  set openEnvironmentTabs(value) { openEnvironmentTabs = value; },
  get openWorkspaceTabs() { return openWorkspaceTabs; },
  set openWorkspaceTabs(value) { openWorkspaceTabs = value; },
  get activeLoadId() { return activeLoadId; },
  set activeLoadId(value) { activeLoadId = value; },
  get activeOauthFlowId() { return activeOauthFlowId; },
  set activeOauthFlowId(value) { activeOauthFlowId = value; },
  get activeRunnerId() { return activeRunnerId; },
  set activeRunnerId(value) { activeRunnerId = value; },
  get lastLoadResult() { return lastLoadResult; },
  set lastLoadResult(value) { lastLoadResult = value; },
  get lastRunnerResult() { return lastRunnerResult; },
  set lastRunnerResult(value) { lastRunnerResult = value; },
  get lastResponse() { return lastResponse; },
  set lastResponse(value) { lastResponse = value; },
  get lastStatusMessage() { return lastStatusMessage; },
  set lastStatusMessage(value) { lastStatusMessage = value; },
  get lastUserNotification() { return lastUserNotification; },
  set lastUserNotification(value) { lastUserNotification = value; },
  get activeModalId() { return activeModalId; },
  set activeModalId(value) { activeModalId = value; },
  get activeModalResolver() { return activeModalResolver; },
  set activeModalResolver(value) { activeModalResolver = value; },
  get selectedDraftSaveCollectionId() { return selectedDraftSaveCollectionId; },
  set selectedDraftSaveCollectionId(value) { selectedDraftSaveCollectionId = value; },
  get maxOpenRequestTabs() { return RENDERER_STATE_DEFAULTS.maxOpenRequestTabs; }
};

const requestTabState = createRequestTabState({
  state,
  activeCollection,
  activeEnvironment,
  activeRequest,
  activeWorkspaceItem,
  clearActiveWorkspaceItem,
  collectEnvironmentFromEditor,
  collectRequestFromEditor,
  findRequest,
  persistWorkspace: (...args) => persistWorkspace(...args),
  promptUnsavedRequestClose,
  removeRequestFromCollection,
  renderAll,
  renderCollections,
  renderRequestTabs,
  saveDraftRequestWithPrompt,
  selectEnvironmentTab: (tab) => selectEnvironmentTab(tab),
  selectRequestTab: (tab) => selectRequestTab(tab),
  selectWorkspaceTab: (tab) => selectWorkspaceTab(tab),
  workspaceListItems
});

const rendererWorkflows = createRendererWorkflows({
  state,
  doc: document,
  windowObject: window,
  activeCollection,
  activeEnvironment,
  activeRequest,
  applyPostmanCookieMetadata,
  clearSavedRequestDirtyState,
  collectEnvironmentFromEditor,
  collectRequestFromEditor,
  collectSettingsFromEditor,
  displayResponse,
  domainFromRequestUrl,
  loadConfigFromControls: () => PostMeterLoadPolicy.loadConfigFromControls(),
  notifyUser,
  parseCookieHeaderForJar,
  postmanCookieMetadataByName,
  renderAll,
  renderAuthEditor,
  renderCollectionVariablesEditor,
  renderCollections,
  renderCookieJarEditor,
  renderEnvironmentEditor,
  renderHistory,
  renderRequestVariablePairs,
  renderVariablePreview,
  saveDraftRequestWithPrompt,
  selectFirstRequest,
  selectInitialWorkspaceItem,
  setStatus,
  uniqueName,
  walkCollectionRequests
});

initializeRenderer({
  doc: document,
  windowObject: window,
  applyThemePreference,
  getStoredThemePreference: () => localStorage.getItem('postmeter.theme') || 'system',
  onReady: async ({ registerCleanup }) => {
    bindUi();
    registerCleanup(() => { flushSessionSave({ sync: true }); });
    registerCleanup(createVariableAutocomplete({
      doc: document,
      windowObject: window,
      getVariables: () => activeEnvironment()?.variables || []
    }).destroy);
    registerCleanup(window.postmeter.app.onMenuAction(handleAppMenuAction));
    registerCleanup(window.postmeter.loadTest.onProgress(({ id, progress }) => {
      if (id === activeLoadId) {
        $('loadResults').textContent = PostMeterRunFormatting.formatLoadProgress(progress);
      }
    }));
    registerCleanup(window.postmeter.oauth.onProgress((progress) => {
      if (progress.id === activeOauthFlowId) {
        renderOauthProgress(progress);
      }
    }));
    registerCleanup(window.postmeter.runner.onProgress(({ id, progress }) => {
      if (id === activeRunnerId) {
        $('runnerResults').textContent = `Running collection...\nCompleted ${progress.completedRequests} of ${progress.totalRequests} requests.\nLast: ${progress.requestName} ${progress.passed ? 'passed' : 'failed'}`;
      }
    }));

    const loaded = await window.postmeter.workspace.load();
    applyLoadedWorkspace(loaded, { focus: 'request', render: false });
    const session = await window.postmeter.session.load();
    const restoredTabs = restoreSessionState(session);
    renderAll();
    activateTab('request', restoredTabs.activeRequestTab);
    activateTab('results', restoredTabs.activeResultsTab);
    sessionPersistenceEnabled = true;
    scheduleSessionSave({ immediate: true });
    setStatus(`Workspace loaded: ${workspacePath}`);
    queueUiWorkflowSmoke();
    queueUiRegressionSmoke();
    queueUiSnapshotSmoke();
    queueUiOauthSmoke();
  }
});

function bindUi() {
  bindRendererUi({
    doc: document,
    windowObject: window,
    onNewCollection: newCollection,
    onNewFolder: () => newFolder(),
    onNewRequest: newRequest,
    onNewWorkspace: () => { void newWorkspace(); },
    onNewEnvironment: () => newEnvironment(),
    onSaveWorkspace: () => saveWorkspace(true, { promptForDraft: true }),
    onRenameWorkspace: () => { void renameWorkspace(); },
    onImportWorkspace: importWorkspace,
    onExportWorkspace: exportWorkspace,
    onImportCollection: importCollection,
    onExportCollection: exportCollection,
    onExportOpenApi: () => exportCollection(activeCollection(), 'openapi'),
    onExportJMeter: () => exportCollection(activeCollection(), 'jmeter'),
    onExportCurl: () => exportCollection(activeCollection(), 'curl'),
    onExportHar: () => exportCollection(activeCollection(), 'har'),
    onSelectTheme: (themeOption) => setThemePreference(themeOption, { save: true }),
    onSendRequest: sendActiveRequest,
    onAddParam: () => addPair('queryParams'),
    onAddHeader: () => addPair('headers'),
    onAddAssertion: () => addAssertion(),
    onAddAssertionTemplate: addAssertionTemplate,
    onAddExample: addExample,
    onCaptureResponseExample: captureResponseExample,
    onExportExamples: exportRequestExamples,
    onDeleteEnvironment: () => deleteEnvironment(),
    onDeleteWorkspace: () => { void deleteWorkspace(); },
    onAddEnvironmentVariable: addVariable,
    onAddCollectionVariable: addCollectionVariable,
    onAddRequestVariable: addRequestVariable,
    onAddCookie: addCookie,
    onClearExpiredCookies: clearExpiredCookies,
    onRunLoadTest: runLoadTest,
    onCancelLoadTest: cancelLoadTest,
    onExportLoadJson: () => exportLoadResult('json'),
    onExportLoadCsv: () => exportLoadResult('csv'),
    onRunCollection: runActiveCollection,
    onCancelCollectionRun: cancelCollectionRun,
    onExportRunnerJson: () => exportRunnerResult('json'),
    onExportRunnerCsv: () => exportRunnerResult('csv'),
    onStartPkceFlow: startPkceFlow,
    onStartDeviceFlow: startDeviceFlow,
    onCancelOauthFlow: cancelOauthFlow,
    onEnvironmentSelectChange: (environmentId) => {
      activeEnvironmentId = environmentId;
      renderEnvironments();
      renderEnvironmentEditor();
      scheduleSessionSave();
    },
    onRequestNameInput: collectRequestAndMarkDirty,
    onMethodChange: () => {
      updateMethodSelectClass();
      collectRequestAndMarkDirty();
    },
    onUrlInput: () => {
      collectRequestAndMarkDirty();
      renderCookieJarEditor();
    },
    onBodyTypeChange: collectRequestAndMarkDirty,
    onBodyInput: collectRequestAndMarkDirty,
    onPreRequestScriptInput: collectRequestAndMarkDirty,
    onTestScriptInput: collectRequestAndMarkDirty,
    onRequestCookieJarChange: collectRequestAndMarkDirty,
    onFilterCookiesChange: renderCookieJarEditor,
    onEnvironmentNameInput: collectEnvironmentAndMarkDirty,
    onAuthTypeChange: showAuthSection,
    onAuthInput: collectRequestAndMarkDirty,
    onActivateTab: activateTab,
    onSelectSidebarPanel: selectSidebarPanel,
    onCancelActiveModal: cancelActiveModal,
    onResolveActiveModal: resolveActiveModal,
    getSelectedDraftSaveCollectionId: () => selectedDraftSaveCollectionId,
    onCloseContextMenu: closeContextMenu,
    onInitResizablePanes: initResizablePanes
  });
}

async function handleAppMenuAction(action) {
  const type = typeof action === 'string' ? action : action?.type;
  try {
    switch (type) {
      case 'new-request':
        newRequest();
        break;
      case 'new-collection':
        newCollection();
        break;
      case 'new-folder':
        newFolder();
        break;
      case 'save-workspace':
        await saveWorkspace(true, { promptForDraft: true });
        break;
      case 'import-workspace':
        await importWorkspace();
        break;
      case 'import-collection':
        await importCollection();
        break;
      case 'export-workspace':
        await exportWorkspace();
        break;
      case 'export-collection':
        await exportCollection();
        break;
      case 'set-prereleases':
        await setIncludePrereleases(action.includePrereleases === true, { save: true });
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

function closeToolbarMenus() {
  closeRendererToolbarMenus(document);
}

function renderRequestTabs() {
  requestTabState.pruneOpenTabs();
  renderRequestTabBar({
    doc: document,
    groups: [
      {
        tabs: openRequestTabs,
        resolve: requestTabState.requestForTab,
        isActive: isActiveRequestTab,
        buttonClassName: 'request-tab-button',
        methodText: (request) => request.method || 'GET',
        methodClassName: (request) => methodClassName(request.method || 'GET'),
        title: (request) => request.name || 'Untitled Request',
        closeTitle: () => 'Close request',
        closeAriaLabel: (request) => `Close ${request.name || 'Untitled Request'}`,
        onSelect: selectRequestTab,
        onClose: closeRequestTab
      },
      {
        tabs: openEnvironmentTabs,
        resolve: requestTabState.environmentForTab,
        isActive: isActiveEnvironmentTab,
        buttonClassName: 'request-tab-button environment-tab-button',
        methodText: () => 'ENV',
        title: (environment) => environment.name || 'Untitled Environment',
        closeTitle: () => 'Close environment',
        closeAriaLabel: (environment) => `Close ${environment.name || 'Untitled Environment'}`,
        onSelect: selectEnvironmentTab,
        onClose: closeEnvironmentTab
      },
      {
        tabs: openWorkspaceTabs,
        resolve: workspaceForTab,
        isActive: isActiveWorkspaceTab,
        buttonClassName: 'request-tab-button workspace-tab-button',
        methodText: () => 'WRK',
        title: (workspaceItem) => workspaceItem.name,
        closeTitle: () => 'Close workspace',
        closeAriaLabel: (workspaceItem) => `Close ${workspaceItem.name}`,
        onSelect: selectWorkspaceTab,
        onClose: closeWorkspaceTab
      }
    ]
  });
  scheduleSessionSave();
}

function ensureOpenEnvironmentTabForActive(options = {}) {
  return requestTabState.ensureOpenEnvironmentTabForActive(options);
}

function ensureOpenWorkspaceTabForActive(options = {}) {
  return requestTabState.ensureOpenWorkspaceTabForActive(options);
}

function ensureOpenRequestTabForActive(options = {}) {
  return requestTabState.ensureOpenRequestTabForActive(options);
}

function selectRequestTab(tab) {
  requestTabState.selectRequestTab(tab);
}

function selectEnvironmentTab(tab) {
  requestTabState.selectEnvironmentTab(tab);
}

function selectWorkspaceTab(tab) {
  requestTabState.selectWorkspaceTab(tab);
}

function markActiveRequestDirty() {
  requestTabState.markActiveRequestDirty();
}

function markActiveEnvironmentDirty() {
  requestTabState.markActiveEnvironmentDirty();
}

function collectRequestAndMarkDirty() {
  collectRequestFromEditor();
  markActiveRequestDirty();
}

function collectEnvironmentAndMarkDirty() {
  collectEnvironmentFromEditor();
  markActiveEnvironmentDirty();
}

function clearSavedRequestDirtyState() {
  clearRendererSavedRequestDirtyState(state, {
    requestForTab: requestTabState.requestForTab,
    onAfterClear: () => {}
  });
  clearRendererSavedEnvironmentDirtyState(state, {
    environmentForTab: requestTabState.environmentForTab,
    onAfterClear: renderRequestTabs
  });
}

function activeRequestTabKey() {
  return buildActiveRequestTabKey(state);
}

function activeEnvironmentTabKey() {
  return buildActiveEnvironmentTabKey(state);
}

function activeWorkspaceTabKey() {
  return buildActiveWorkspaceTabKey(state);
}

function isActiveRequestTab(tab) {
  return isRendererActiveRequestTab(state, tab);
}

function isActiveEnvironmentTab(tab) {
  return isRendererActiveEnvironmentTab(state, tab);
}

function isActiveWorkspaceTab(tab) {
  return isRendererActiveWorkspaceTab(state, tab);
}

function requestForTab(tab) {
  return requestTabState.requestForTab(tab);
}

function environmentForTab(tab) {
  return requestTabState.environmentForTab(tab);
}

function workspaceForTab(tab) {
  return requestTabState.workspaceForTab(tab);
}

function pruneOpenRequestTabs() {
  requestTabState.pruneOpenTabs();
}

function removeOpenRequestTab(keyOrCollectionId, requestId) {
  requestTabState.removeOpenRequestTab(keyOrCollectionId, requestId);
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

function closeWorkspaceTab(tab) {
  return requestTabState.closeWorkspaceTab(tab);
}

function closeEnvironmentTab(tab) {
  return requestTabState.closeEnvironmentTab(tab);
}

async function closeRequestTab(tab) {
  return requestTabState.closeRequestTab(tab);
}

function promptUnsavedRequestClose(tab, request) {
  if (tab.environmentId) {
    $('unsavedRequestTitle').textContent = tab.createdUnsaved ? 'Close unsaved environment?' : 'Close environment with unsaved changes?';
    $('unsavedRequestMessage').textContent = tab.createdUnsaved
      ? `"${request.name || 'Untitled Environment'}" is not saved to the workspace. Save it before closing?`
      : `"${request.name || 'Untitled Environment'}" has unsaved changes. Save those changes before closing?`;
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
  const request = structuredClone(draftRequest);
  request.name = uniqueName(request.name || 'Untitled Request', allRequestNames(collection));
  collection.requests ||= [];
  collection.requests.push(request);
  draftRequests.delete(draftId);
  activeMainPanel = 'request';
  activeCollectionId = collection.id;
  activeFolderId = null;
  activeRequestId = request.id;

  const oldKey = `draft:${draftId}`;
  let tab = options.tab || openRequestTabs.find((candidate) => candidate.key === oldKey);
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
  }
  await persistWorkspace(options.showStatus !== false, { collectEditors: false });
  renderAll();
  return tab;
}

function promptDraftSaveCollection(request) {
  selectedDraftSaveCollectionId = '';
  $('saveDraftRequestMessage').textContent = `Choose a collection for "${request?.name || 'Untitled Request'}".`;
  renderSaveDraftCollectionList();
  return showModal('saveDraftRequestModal', null);
}

function renderSaveDraftCollectionList() {
  const list = $('saveDraftCollectionList');
  list.textContent = '';
  $('confirmSaveDraftButton').disabled = true;
  if (!workspace.collections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Create a collection before saving this request.';
    list.append(empty);
    return;
  }
  for (const collection of workspace.collections) {
    const label = document.createElement('label');
    label.className = 'collection-pick-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'saveDraftCollection';
    input.value = collection.id;
    input.addEventListener('change', () => {
      selectedDraftSaveCollectionId = input.value;
      $('confirmSaveDraftButton').disabled = false;
    });
    const text = document.createElement('span');
    text.textContent = collection.name || 'Untitled Collection';
    label.append(input, text);
    list.append(label);
  }
}

function showModal(modalId, cancelValue) {
  if (state.activeModalResolver) {
    resolveActiveModal(cancelValue);
  }
  closeContextMenu();
  closeToolbarMenus();
  $('modalBackdrop').hidden = false;
  for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
    modal.hidden = modal.id !== modalId;
  }
  return new Promise((resolve) => {
    openModalState(state, modalId, resolve);
    if (modalId === 'unsavedRequestModal') {
      $('cancelCloseRequestButton').focus();
    } else {
      $('cancelSaveDraftButton').focus();
    }
  });
}

function resolveActiveModal(value) {
  const resolver = resolveModalState(state);
  $('modalBackdrop').hidden = true;
  for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
    modal.hidden = true;
  }
  if (resolver) {
    resolver(value);
  }
}

function cancelActiveModal() {
  if (!state.activeModalResolver) {
    return;
  }
  resolveActiveModal(state.activeModalId === 'unsavedRequestModal' ? 'cancel' : null);
}

function resetRequestTabs(options = {}) {
  resetRendererTabState(state, options);
}

function applyLoadedWorkspace(loaded, options = {}) {
  workspace = loaded?.workspace || workspace;
  workspacePath = loaded?.path || '';
  workspaces = Array.isArray(loaded?.workspaces) ? loaded.workspaces : [];
  activeWorkspaceId = loaded?.activeWorkspaceId || workspaces[0]?.id || null;
  lastResponse = null;
  lastLoadResult = null;
  lastRunnerResult = null;
  activeLoadId = null;
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

function renderAll() {
  renderToolbarState();
  renderSidebarPanels();
  renderMainPanels();
  renderSettings();
  renderEnvironmentSelect();
  renderCollections();
  renderEnvironments();
  renderWorkspaces();
  renderWorkspacePanel();
  renderHistory();
  renderRequestTabs();
  renderRequestEditor();
  renderCollectionVariablesEditor();
  renderEnvironmentEditor();
  scheduleSessionSave();
}

function selectSidebarPanel(panel) {
  if (!['collections', 'environments', 'workspaces', 'history'].includes(panel)) {
    return;
  }
  activeSidebarPanel = panel;
  if (panel === 'collections') {
    activeMainPanel = 'request';
  } else if (panel === 'environments') {
    if (activeEnvironmentId === 'none' && workspace.environments?.length) {
      activeEnvironmentId = workspace.environments[0].id;
    }
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive();
  } else if (panel === 'workspaces') {
    activeWorkspaceId ||= workspaceListItems()[0]?.id || null;
    activeMainPanel = 'workspace';
    ensureOpenWorkspaceTabForActive();
  }
  renderAll();
}

function renderSidebarPanels() {
  for (const button of document.querySelectorAll('.sidebar-tab')) {
    const isActive = button.dataset.sidebarPanel === activeSidebarPanel;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }
  for (const panel of document.querySelectorAll('[data-sidebar-panel-content]')) {
    const isActive = panel.dataset.sidebarPanelContent === activeSidebarPanel;
    panel.hidden = !isActive;
    panel.classList.toggle('active', isActive);
  }
}

function renderMainPanels() {
  const showEnvironment = activeMainPanel === 'environment';
  const showWorkspace = activeMainPanel === 'workspace';
  const showDocument = showEnvironment || showWorkspace;
  const showRequestEmpty = activeMainPanel === 'request' && !activeRequest();
  const showEnvironmentEmpty = showEnvironment && !activeEnvironment();
  const showWorkspaceEmpty = showWorkspace && !activeWorkspaceItem();
  document.querySelector('.workspace').classList.toggle('document-mode', showDocument);
  document.querySelector('.workspace').classList.toggle('environment-mode', showEnvironment);
  document.querySelector('.workspace').classList.toggle('workspace-mode', showWorkspace);
  document.querySelector('.workspace').classList.toggle('request-empty-mode', showRequestEmpty);
  document.querySelector('.workspace').classList.toggle('environment-empty-mode', showEnvironmentEmpty);
  document.querySelector('.workspace').classList.toggle('workspace-empty-mode', showWorkspaceEmpty);
  $('requestEmptyPanel').hidden = !showRequestEmpty;
  $('environmentEmptyPanel').hidden = !showEnvironmentEmpty;
  $('workspaceEmptyPanel').hidden = !showWorkspaceEmpty;
  $('requestEditorPanel').hidden = showDocument || showRequestEmpty;
  $('environmentMainPanel').hidden = !showEnvironment || showEnvironmentEmpty;
  $('workspaceMainPanel').hidden = !showWorkspace || showWorkspaceEmpty;
  $('workspacePaneResize').hidden = showDocument || showRequestEmpty;
  document.querySelector('.results').hidden = showDocument || showRequestEmpty;
}

function renderToolbarState() {
  const hasActiveCollection = Boolean(activeCollection());
  $('newFolderButton').disabled = !hasActiveCollection;
  $('newFolderButton').setAttribute('aria-disabled', hasActiveCollection ? 'false' : 'true');
}

function renderSettings() {
  ensureSettings();
  applyThemePreference(workspace.settings.appearance.theme);
  renderThemeControl();
}

function ensureSettings() {
  workspace.settings ||= {};
  workspace.settings.updates ||= { includePrereleases: false };
  workspace.settings.appearance ||= { theme: 'system' };
  workspace.settings.appearance.theme = normalizeThemeOption(workspace.settings.appearance.theme);
  delete workspace.settings.loadTestPolicy;
}

function normalizeThemeOption(value) {
  const theme = String(value || '').trim();
  return THEME_OPTIONS.includes(theme) ? theme : 'system';
}

function applyThemePreference(theme) {
  const normalizedTheme = normalizeThemeOption(theme);
  document.documentElement.dataset.theme = normalizedTheme;
  try {
    localStorage.setItem('postmeter.theme', normalizedTheme);
  } catch {
    // Theme still applies for this session when storage is unavailable.
  }
}

function renderThemeControl() {
  const activeTheme = normalizeThemeOption(workspace.settings?.appearance?.theme);
  for (const button of document.querySelectorAll('[data-theme-option]')) {
    const isActive = button.dataset.themeOption === activeTheme;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

async function setThemePreference(theme, options = {}) {
  ensureSettings();
  const normalizedTheme = normalizeThemeOption(theme);
  workspace.settings.appearance.theme = normalizedTheme;
  applyThemePreference(normalizedTheme);
  renderThemeControl();
  if (options.save === true) {
    await saveWorkspace(false);
  }
  if (options.showStatus !== false) {
    setStatus(`Theme set to ${normalizedTheme}.`);
  }
}

async function setIncludePrereleases(includePrereleases, options = {}) {
  ensureSettings();
  workspace.settings.updates.includePrereleases = includePrereleases === true;
  if (options.save === true) {
    await saveWorkspace(false);
  }
  if (options.showStatus !== false) {
    setStatus(`Prerelease update checks ${workspace.settings.updates.includePrereleases ? 'enabled' : 'disabled'}.`);
  }
}

function selectInitialWorkspaceItem() {
  activeWorkspaceId ||= workspaceListItems()[0]?.id || null;
  activeMainPanel = 'request';
  resetRequestTabs();
  const collection = workspace.collections[0];
  activeCollectionId = collection?.id;
  if (collection) {
    selectFirstRequest(collection);
    ensureOpenRequestTabForActive();
  } else {
    clearActiveWorkspaceItem();
  }
}

function selectFirstRequest(collection) {
  const request = firstRequestInCollection(collection);
  activeFolderId = request?.folderId || null;
  activeRequestId = request?.request?.id || null;
}

function renderCollections() {
  const root = $('collectionsTree');
  root.textContent = '';
  if (!workspace.collections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No collections';
    root.append(empty);
    return;
  }
  for (const collection of workspace.collections) {
    root.append(collectionNode(collection));
  }
}

function renderEnvironments() {
  const root = $('environmentsList');
  root.textContent = '';
  if (!workspace.environments?.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No environments';
    root.append(empty);
    return;
  }
  for (const environment of workspace.environments) {
    root.append(environmentNode(environment));
  }
}

function environmentNode(environment) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node environment-node';
  const button = treeButton(environment.name || 'Untitled Environment', environment.id === activeEnvironmentId, 'ENV');
  button.addEventListener('click', () => {
    activeEnvironmentId = environment.id;
    activeSidebarPanel = 'environments';
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renameEnvironment(environment)],
    ['Delete', () => deleteEnvironment(environment), 'danger']
  ]);
  wrapper.append(button);
  return wrapper;
}

function renderWorkspaces() {
  const root = $('workspacesList');
  root.textContent = '';
  for (const workspaceItem of workspaceListItems()) {
    root.append(workspaceNode(workspaceItem));
  }
}

function workspaceNode(workspaceItem) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node workspace-node';
  const button = treeButton(workspaceItem.name, activeMainPanel === 'workspace' && workspaceItem.id === activeWorkspaceId, 'WRK');
  button.addEventListener('click', () => {
    void switchWorkspace(workspaceItem.id, { focus: 'workspace' });
  });
  const menuItems = [
    ['Open', () => { void switchWorkspace(workspaceItem.id, { focus: 'workspace' }); }],
    ['Rename', () => { void renameWorkspace(workspaceItem.id); }]
  ];
  if (workspaceItem.deletable !== false) {
    menuItems.push(['Delete', () => { void deleteWorkspace(workspaceItem.id); }, 'danger']);
  }
  attachTreeContextMenu(button, menuItems);
  wrapper.append(button);
  return wrapper;
}

function renderWorkspacePanel() {
  const workspaceItem = activeWorkspaceItem();
  $('workspaceMainTitle').textContent = workspaceItem ? workspaceDisplayName(workspaceItem) : 'Select a workspace';
  $('renameWorkspacePanelButton').disabled = !workspaceItem;
  $('deleteWorkspacePanelButton').disabled = !workspaceItem || workspaceListItems().length <= 1;
  const container = $('workspaceSummary');
  container.textContent = '';
  if (!workspaceItem) {
    return;
  }
  const requestCount = countWorkspaceRequests();
  const folderCount = countWorkspaceFolders();
  const rows = [
    ['Name', workspaceDisplayName()],
    ['Workspace File', workspacePath || 'Default local workspace'],
    ['Saved Workspaces', String(workspaceListItems().length || 0)],
    ['Schema Version', String(workspace.schemaVersion || '-')],
    ['Theme', titleCaseTheme(workspace.settings?.appearance?.theme)],
    ['Collections', String(workspace.collections?.length || 0)],
    ['Folders', String(folderCount)],
    ['Requests', String(requestCount)],
    ['Environments', String(workspace.environments?.length || 0)],
    ['Cookies', String(workspace.cookies?.length || 0)],
    ['History Entries', String(workspace.history?.length || 0)]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'workspace-summary-row';
    const labelElement = document.createElement('div');
    labelElement.className = 'workspace-summary-label';
    labelElement.textContent = label;
    const valueElement = document.createElement('div');
    valueElement.className = 'workspace-summary-value';
    valueElement.textContent = value;
    row.append(labelElement, valueElement);
    container.append(row);
  }
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
      deletable: false
    }];
  }
  return items.map((item) => (
    item.id === activeWorkspaceId
      ? {
          ...item,
          name: workspaceDisplayName(item),
          path: workspacePath || item.path || ''
        }
      : item
  ));
}

function activeWorkspaceItem() {
  if (!activeWorkspaceId) {
    return null;
  }
  return workspaceListItems().find((item) => item.id === activeWorkspaceId) || null;
}

function workspaceDisplayName(workspaceItem = activeWorkspaceItem()) {
  if (workspaceItem?.name && String(workspaceItem.name).trim()) {
    return String(workspaceItem.name).trim();
  }
  const filename = String(workspaceItem?.path || workspacePath || '').split(/[\\/]/).filter(Boolean).pop();
  if (!filename) {
    return 'Workspace';
  }
  return filename.replace(/\.json$/i, '') || 'Workspace';
}

function countWorkspaceRequests() {
  let count = 0;
  for (const collection of workspace.collections || []) {
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
  for (const collection of workspace.collections || []) {
    for (const folder of collection.folders || []) {
      walk(folder);
    }
  }
  return count;
}

function collectionNode(collection) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node collection-node';
  const button = treeButton(collection.name, collection.id === activeCollectionId && !activeRequestId, 'COL');
  button.addEventListener('click', () => {
    collectRequestFromEditor();
    activeMainPanel = 'request';
    activeCollectionId = collection.id;
    selectFirstRequest(collection);
    ensureOpenRequestTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Add Request', () => newRequest(collection.id, null)],
    ['Add Folder', () => newFolder(collection.id, null)],
    ['Rename', () => renameCollection(collection)],
    ['Export', () => exportCollection(collection)],
    ['Delete', () => deleteCollection(collection), 'danger']
  ]);
  wrapper.append(button);
  for (const request of collection.requests || []) {
    wrapper.append(requestNode(collection, null, request));
  }
  for (const folder of collection.folders || []) {
    wrapper.append(folderNode(collection, folder));
  }
  return wrapper;
}

function folderNode(collection, folder) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node tree-folder folder-node';
  const button = treeButton(folder.name, folder.id === activeFolderId && !activeRequestId, 'DIR');
  button.addEventListener('click', () => {
    collectRequestFromEditor();
    activeMainPanel = 'request';
    activeCollectionId = collection.id;
    activeFolderId = folder.id;
    activeRequestId = firstRequestInFolder(folder)?.request?.id;
    ensureOpenRequestTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Add Request', () => newRequest(collection.id, folder.id)],
    ['Add Folder', () => newFolder(collection.id, folder.id)],
    ['Rename', () => renameFolder(folder)],
    ['Delete', () => deleteFolder(collection, folder), 'danger']
  ]);
  wrapper.append(button);
  for (const request of folder.requests || []) {
    wrapper.append(requestNode(collection, folder, request));
  }
  for (const child of folder.folders || []) {
    wrapper.append(folderNode(collection, child));
  }
  return wrapper;
}

function requestNode(collection, folder, request) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node tree-folder request-node';
  const button = treeButton(request.name, request.id === activeRequestId, request.method);
  button.addEventListener('click', () => {
    collectRequestFromEditor();
    activeMainPanel = 'request';
    activeCollectionId = collection.id;
    activeFolderId = folder?.id || null;
    activeRequestId = request.id;
    ensureOpenRequestTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renameRequest(request)],
    ['Duplicate', () => duplicateRequest(collection, folder, request)],
    ['Delete', () => deleteRequest(collection, folder, request), 'danger']
  ]);
  wrapper.append(button);
  return wrapper;
}

function treeButton(text, active, kind) {
  const button = document.createElement('button');
  button.className = `tree-item${active ? ' active' : ''}`;
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'menu');
  const badge = document.createElement('span');
  badge.className = `tree-badge ${methodClassName(kind)}`;
  badge.textContent = kind;
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = text;
  button.append(badge, label);
  return button;
}

function methodClassName(method) {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  return METHODS.map((item) => item.toLowerCase()).includes(normalizedMethod)
    ? `method-${normalizedMethod}`
    : '';
}

function updateMethodSelectClass() {
  const select = $('methodSelect');
  if (!select) {
    return;
  }
  for (const method of METHODS) {
    select.classList.toggle(`method-${method.toLowerCase()}`, select.value === method);
  }
}

function renderRequestEditor() {
  const request = activeRequest();
  if (!request) {
    $('requestNameInput').value = '';
    $('methodSelect').value = 'GET';
    updateMethodSelectClass();
    $('urlInput').value = '';
    $('bodyTypeSelect').value = 'NONE';
    $('bodyInput').value = '';
    $('preRequestScriptInput').value = '';
    $('testScriptInput').value = '';
    $('paramsTable').textContent = '';
    $('headersTable').textContent = '';
    $('assertionsTable').textContent = '';
    $('examplesList').textContent = '';
    $('requestVariablesTable').textContent = '';
    $('cookiesTable').textContent = '';
    $('requestCookieJarEnabledInput').checked = false;
    $('requestCookieJarStoreInput').checked = true;
    $('addRequestVariableButton').disabled = true;
    $('addExampleButton').disabled = true;
    $('captureResponseExampleButton').disabled = true;
    $('exportExamplesButton').disabled = true;
    renderAuthEditor({ type: 'none' });
    return;
  }
  $('addRequestVariableButton').disabled = false;
  $('addExampleButton').disabled = false;
  $('captureResponseExampleButton').disabled = !lastResponse;
  $('exportExamplesButton').disabled = !(request.examples || []).length;
  $('requestNameInput').value = request.name;
  $('methodSelect').value = request.method;
  updateMethodSelectClass();
  $('urlInput').value = request.url;
  $('bodyTypeSelect').value = request.bodyType || 'NONE';
  $('bodyInput').value = request.body || '';
  request.scripts ||= { preRequest: '', tests: '' };
  $('preRequestScriptInput').value = request.scripts.preRequest || '';
  $('testScriptInput').value = request.scripts.tests || '';
  request.cookieJar ||= { enabled: false, storeResponses: true };
  $('requestCookieJarEnabledInput').checked = request.cookieJar.enabled === true;
  $('requestCookieJarStoreInput').checked = request.cookieJar.storeResponses !== false;
  renderPairs('paramsTable', request.queryParams || [], 'queryParams');
  renderPairs('headersTable', request.headers || [], 'headers');
  renderAssertions(request.assertions || []);
  renderRequestVariablePairs(request.variables || []);
  renderExamples(request.examples || []);
  renderCookieJarEditor();
  renderAuthEditor(request.auth || { type: 'none' });
}

function renderExamples(examples) {
  renderRequestExamples(examples, {
    doc: document,
    bodyTypes: BODY_TYPES,
    onDirty: markActiveRequestDirty,
    onDuplicate: duplicateExample,
    onDelete: deleteExample
  });
}

function renderAuthEditor(auth) {
  renderRequestAuthEditor(auth, {
    doc: document,
    showAuthSection
  });
}

function showAuthSection(type) {
  for (const section of document.querySelectorAll('.auth-section')) {
    section.classList.toggle('active', section.dataset.authSection === type);
  }
}

function renderPairs(containerId, pairs, fieldName) {
  renderEditorRequestPairs({
    doc: document,
    containerId,
    pairs,
    onDirty: () => {
      collectRequestFromEditor();
      markActiveRequestDirty();
    },
    onRemove: () => {
      renderRequestEditor();
    }
  });
}

function renderAssertions(assertions) {
  renderRequestAssertions({
    doc: document,
    assertions,
    onDirty: markActiveRequestDirty,
    onRerender: () => renderAssertions(assertions)
  });
}

function renderEnvironmentSelect() {
  const select = $('environmentSelect');
  if (activeEnvironmentId !== 'none' && !(workspace.environments || []).some((environment) => environment.id === activeEnvironmentId)) {
    activeEnvironmentId = 'none';
  }
  select.textContent = '';
  select.append(new Option('No Environment', 'none'));
  for (const environment of workspace.environments || []) {
    select.append(new Option(environment.name, environment.id));
  }
  select.value = activeEnvironmentId;
}

function renderEnvironmentEditor() {
  const environment = activeEnvironment();
  $('environmentMainTitle').textContent = environment?.name || 'Select an environment';
  $('environmentNameInput').value = environment?.name || '';
  $('environmentNameInput').disabled = !environment;
  $('deleteEnvironmentButton').disabled = !environment;
  $('addVariableButton').disabled = !environment;
  if (!environment) {
    const container = $('environmentTable');
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Select or create an environment';
    container.append(empty);
  } else {
    renderEnvironmentPairs(environment.variables || []);
  }
  renderVariablePreview();
}

function renderCollectionVariablesEditor() {
  const collection = activeCollection();
  $('addCollectionVariableButton').disabled = !collection;
  renderCollectionVariablePairs(collection?.variables || []);
  renderVariablePreview();
}

function renderRequestVariablePairs(pairs) {
  renderEditorVariablePairs({
    doc: document,
    containerId: 'requestVariablesTable',
    pairs,
    onChange: () => {
      markActiveRequestDirty();
      renderVariablePreview();
    },
    onRemove: () => {
      renderRequestEditor();
      renderCollectionVariablesEditor();
    }
  });
}

function renderCollectionVariablePairs(pairs) {
  renderEditorVariablePairs({
    doc: document,
    containerId: 'collectionVariablesTable',
    pairs,
    onChange: () => {
      renderVariablePreview();
    },
    onRemove: () => {
      renderRequestEditor();
      renderCollectionVariablesEditor();
    }
  });
}

function renderVariablePreview() {
  renderEditorVariablePreview({
    doc: document,
    collection: activeCollection(),
    environment: activeEnvironment(),
    request: activeRequest()
  });
}

function renderCookieJarEditor() {
  renderRequestCookieJarEditor({
    doc: document,
    workspace,
    activeRequestUrl: activeRequest()?.url || '',
    rerender: renderCookieJarEditor,
    setStatus
  });
}

function variableValue(pair) {
  return pair?.value ?? '';
}

function renderEnvironmentPairs(pairs) {
  const container = $('environmentTable');
  container.textContent = '';
  pairs.forEach((pair, index) => {
    const row = document.createElement('div');
    row.className = 'kv-row env-row';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = pair.enabled !== false;
    enabled.addEventListener('change', () => {
      pair.enabled = enabled.checked;
      markActiveEnvironmentDirty();
      renderVariablePreview();
    });
    const key = document.createElement('input');
    key.placeholder = 'Variable';
    key.value = pair.key || '';
    key.addEventListener('input', () => {
      pair.key = key.value;
      markActiveEnvironmentDirty();
      renderVariablePreview();
    });
    const value = document.createElement('input');
    value.placeholder = 'Value';
    value.type = 'text';
    value.value = pair.value || '';
    value.addEventListener('input', () => {
      pair.value = value.value;
      markActiveEnvironmentDirty();
      renderVariablePreview();
    });
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      pairs.splice(index, 1);
      markActiveEnvironmentDirty();
      renderEnvironmentEditor();
    });
    row.append(enabled, key, value, remove);
    container.append(row);
  });
}

function renderHistory() {
  const container = $('historyList');
  container.textContent = '';
  for (const item of workspace.history || []) {
    const button = document.createElement('button');
    button.className = 'history-item';
    button.textContent = `${item.method} ${item.statusCode || 'ERR'} ${item.url}`;
    button.addEventListener('click', () => {
      activeMainPanel = 'request';
      const request = activeRequest();
      if (request) {
        request.method = item.method;
        request.url = item.url;
        request.name = `${item.method} ${item.url}`;
        renderRequestEditor();
      }
    });
    container.append(button);
  }
}

async function sendActiveRequest() {
  return rendererWorkflows.sendActiveRequest();
}

function displayResponse(response) {
  $('responseStatus').textContent = response.statusCode;
  $('responseTime').textContent = `${response.durationMillis} ms`;
  $('responseSize').textContent = formatBytes(response.responseBytes);
  $('finalUrl').textContent = response.finalUrl;
  $('responseHeaders').value = Object.entries(response.headers || {})
    .map(([key, values]) => `${key}: ${values.join(', ')}`)
    .join('\n');
  $('responseBody').value = PostMeterResponseFormatting.formatBody(response);
}

async function runLoadTest() {
  return rendererWorkflows.runLoadTest();
}

async function cancelLoadTest() {
  return rendererWorkflows.cancelLoadTest();
}

async function runActiveCollection() {
  return rendererWorkflows.runActiveCollection();
}

async function cancelCollectionRun() {
  return rendererWorkflows.cancelCollectionRun();
}

async function exportRunnerResult(format) {
  return rendererWorkflows.exportRunnerResult(format);
}

async function exportLoadResult(format) {
  return rendererWorkflows.exportLoadResult(format);
}

async function startDeviceFlow() {
  return rendererWorkflows.startDeviceFlow();
}

async function startPkceFlow() {
  return rendererWorkflows.startPkceFlow();
}

async function cancelOauthFlow() {
  return rendererWorkflows.cancelOauthFlow();
}

function setOauthButtonsBusy(isBusy) {
  rendererWorkflows.setOauthButtonsBusy(isBusy);
}

function renderOauthProgress(progress) {
  rendererWorkflows.renderOauthProgress(progress);
}

async function saveWorkspace(showStatus = true, options = {}) {
  return rendererWorkflows.saveWorkspace(showStatus, options);
}

async function persistWorkspace(showStatus = true, options = {}) {
  return rendererWorkflows.persistWorkspace(showStatus, options);
}

async function importWorkspace() {
  return rendererWorkflows.importWorkspace();
}

async function exportWorkspace() {
  return rendererWorkflows.exportWorkspace();
}

async function prepareForWorkspaceChange(actionLabel) {
  if (draftRequests.size > 0) {
    const draftLabel = draftRequests.size === 1 ? 'draft request' : 'draft requests';
    if (!confirm(`${draftRequests.size} unsaved ${draftLabel} will be discarded before ${actionLabel}. Continue?`)) {
      return false;
    }
  }
  await persistWorkspace(false);
  return true;
}

async function newWorkspace() {
  try {
    if (!(await prepareForWorkspaceChange('creating a workspace'))) {
      return null;
    }
    const loaded = await window.postmeter.workspace.create();
    applyLoadedWorkspace(loaded, { focus: 'request' });
    setStatus(`Created workspace: ${workspaceDisplayName()}.`);
    return loaded.workspace;
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

async function renameWorkspace(workspaceId = activeWorkspaceId) {
  try {
    const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId);
    if (!workspaceItem) {
      setStatus('Select a workspace before renaming.');
      return null;
    }
    const currentName = workspaceDisplayName(workspaceItem);
    const value = prompt('Workspace name', currentName);
    const nextName = String(value || '').trim();
    if (!nextName) {
      return null;
    }
    const renamingActiveWorkspace = workspaceId === activeWorkspaceId;
    if (renamingActiveWorkspace) {
      await persistWorkspace(false);
    }
    const renameBoundary = window.__postmeterRenameWorkspace || window.postmeter.workspace.rename;
    const loaded = await renameBoundary(workspaceId, nextName);
    applyLoadedWorkspace(loaded, { focus: renamingActiveWorkspace ? 'workspace' : currentPanelFocus() });
    setStatus(renamingActiveWorkspace ? `Renamed workspace: ${workspaceDisplayName()}.` : 'Workspace renamed.');
    return loaded.workspace;
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
      activeSidebarPanel = 'workspaces';
      activeMainPanel = 'workspace';
      ensureOpenWorkspaceTabForActive();
      renderAll();
      return workspaceItem;
    }
    if (!(await prepareForWorkspaceChange('switching workspaces'))) {
      return null;
    }
    const loaded = await window.postmeter.workspace.switch(workspaceId);
    applyLoadedWorkspace(loaded, { focus: options.focus || 'workspace' });
    setStatus(`Switched to workspace: ${workspaceDisplayName()}.`);
    return loaded.workspace;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Workspace switch failed: ${message}`);
    notifyUser('Workspace Switch Failed', message);
    return null;
  }
}

async function deleteWorkspace(workspaceId = activeWorkspaceId) {
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
    if (workspaceId !== activeWorkspaceId && !(await prepareForWorkspaceChange('deleting a workspace'))) {
      return null;
    }
    if (!confirm(`Delete "${workspaceItem.name}"? This cannot be recovered.`)) {
      return null;
    }
    const loaded = await window.postmeter.workspace.delete(workspaceId);
    applyLoadedWorkspace(loaded, { focus: 'workspace' });
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

async function importCollection() {
  return rendererWorkflows.importCollection();
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
}

async function exportCollection(collection = activeCollection(), format = 'postmeter') {
  return rendererWorkflows.exportCollection(collection, format);
}

function newCollection() {
  collectRequestFromEditor();
  activeMainPanel = 'request';
  const collection = {
    id: crypto.randomUUID(),
    name: uniqueName('New Collection', workspace.collections.map((existing) => existing.name)),
    description: '',
    variables: [],
    certificates: [],
    requests: [],
    folders: []
  };
  workspace.collections.push(collection);
  activeCollectionId = collection.id;
  activeFolderId = null;
  activeRequestId = null;
  renderAll();
  return collection;
}

function newRequest(collectionId = activeCollectionId, folderId = activeFolderId) {
  collectRequestFromEditor();
  activeMainPanel = 'request';
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
  activeCollectionId = collection.id;
  activeRequestId = request.id;
  ensureOpenRequestTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  return request;
}

function newFolder(collectionId = activeCollectionId, parentFolderId = activeFolderId) {
  collectRequestFromEditor();
  activeMainPanel = 'request';
  const collection = workspace.collections.find((item) => item.id === collectionId);
  if (!collection) {
    setStatus('Select a collection before creating a folder.');
    renderToolbarState();
    return null;
  }
  const folder = {
    id: crypto.randomUUID(),
    name: uniqueName('New Folder', allFolderNames(collection)),
    requests: [],
    folders: []
  };
  const parent = parentFolderId ? findFolder(collection, parentFolderId) : null;
  if (parent) {
    parent.folders.push(folder);
  } else {
    collection.folders.push(folder);
  }
  activeCollectionId = collection.id;
  activeFolderId = folder.id;
  activeRequestId = null;
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
    assertions: [],
    scripts: { preRequest: '', tests: '' },
    variables: [],
    examples: [],
    cookieJar: { enabled: false, storeResponses: true },
    loadTestPolicy: PostMeterLoadPolicy.defaultRequestLoadPolicy()
  };
}

function newEnvironment() {
  workspace.environments ||= [];
  const environment = {
    id: crypto.randomUUID(),
    name: uniqueName('New Environment', workspace.environments.map((item) => item.name)),
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.com' }]
  };
  workspace.environments.push(environment);
  activeEnvironmentId = environment.id;
  activeSidebarPanel = 'environments';
  activeMainPanel = 'environment';
  ensureOpenEnvironmentTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
  return environment;
}

function deleteEnvironment(environment = activeEnvironment()) {
  if (!environment || !confirm(`Delete ${environment.name}?`)) {
    return;
  }
  removeOpenEnvironmentTab(environment.id);
  workspace.environments = workspace.environments.filter((item) => item.id !== environment.id);
  if (activeEnvironmentId === environment.id) {
    activeEnvironmentId = workspace.environments[0]?.id || 'none';
  }
  activeSidebarPanel = 'environments';
  activeMainPanel = 'environment';
  ensureOpenEnvironmentTabForActive();
  renderAll();
}

function renameEnvironment(environment) {
  const value = prompt('Environment name', environment.name);
  if (value?.trim()) {
    environment.name = value.trim();
    activeEnvironmentId = environment.id;
    activeSidebarPanel = 'environments';
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive({ dirty: true });
    renderAll();
  }
}

function addVariable() {
  const environment = activeEnvironment();
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
    renderCollectionVariablesEditor();
  }
}

function addRequestVariable() {
  const request = activeRequest();
  if (request) {
    request.variables ||= [];
    request.variables.push({ enabled: true, key: '', value: '' });
    markActiveRequestDirty();
    renderRequestEditor();
  }
}

function addCookie() {
  workspace.cookies ||= [];
  const request = activeRequest();
  const domain = domainFromRequestUrl(request?.url) || 'example.com';
  workspace.cookies.push(newWorkspaceCookie({ domain }));
  renderCookieJarEditor();
}

function clearExpiredCookies() {
  workspace.cookies ||= [];
  const before = workspace.cookies.length;
  workspace.cookies = workspace.cookies.filter((cookie) => !isExpiredCookie(cookie));
  renderCookieJarEditor();
  setStatus(`Removed ${before - workspace.cookies.length} expired cookies.`);
}

function addExample() {
  const request = activeRequest();
  if (!request) {
    return;
  }
  request.examples ||= [];
  request.examples.push(newExampleObject({
    existingNames: request.examples.map((example) => example.name)
  }));
  markActiveRequestDirty();
  renderExamples(request.examples);
}

function captureResponseExample() {
  const request = activeRequest();
  if (!request || !lastResponse) {
    return setStatus('Send a request before capturing a response example.');
  }
  request.examples ||= [];
  request.examples.push(exampleFromResponse(lastResponse, {
    existingNames: request.examples.map((example) => example.name)
  }));
  markActiveRequestDirty();
  renderExamples(request.examples);
  setStatus('Captured response example.');
}

async function exportRequestExamples() {
  const request = activeRequest();
  if (!request) {
    return setStatus('Select a request before exporting examples.');
  }
  if (!request.examples?.length) {
    return setStatus('This request does not have examples to export.');
  }
  collectRequestFromEditor();
  const exportExamplesBoundary = window.__postmeterExportExamples || window.postmeter.request.exportExamples;
  const result = await exportExamplesBoundary(request);
  if (!result.cancelled) {
    setStatus(`Examples exported to ${result.path}.`);
  }
}

function duplicateExample(index) {
  const request = activeRequest();
  if (!request?.examples?.[index]) {
    return;
  }
  const duplicate = structuredClone(request.examples[index]);
  duplicate.id = crypto.randomUUID();
  duplicate.name = uniqueName(`${duplicate.name || 'Example Response'} Copy`, request.examples.map((example) => example.name));
  request.examples.splice(index + 1, 0, duplicate);
  markActiveRequestDirty();
  renderExamples(request.examples);
}

function deleteExample(index) {
  const request = activeRequest();
  if (!request?.examples?.[index] || !confirm(`Delete ${request.examples[index].name || 'example'}?`)) {
    return;
  }
  request.examples.splice(index, 1);
  markActiveRequestDirty();
  renderExamples(request.examples);
}

function addPair(fieldName) {
  const request = activeRequest();
  if (request) {
    request[fieldName].push({ enabled: true, key: '', value: '' });
    markActiveRequestDirty();
    renderRequestEditor();
  }
}

function addAssertion(template = ASSERTION_TEMPLATES.status200) {
  const request = activeRequest();
  if (request) {
    request.assertions ||= [];
    request.assertions.push(newAssertion(template));
    markActiveRequestDirty();
    renderAssertions(request.assertions);
  }
}

function addAssertionTemplate() {
  const template = ASSERTION_TEMPLATES[$('assertionTemplateSelect').value] || ASSERTION_TEMPLATES.status200;
  addAssertion(template);
}

function renameCollection(collection) {
  const value = prompt('Collection name', collection.name);
  if (value?.trim()) {
    collection.name = uniqueName(value.trim(), workspace.collections.filter((item) => item !== collection).map((item) => item.name));
    renderCollections();
  }
}

function renameFolder(folder) {
  const value = prompt('Folder name', folder.name);
  if (value?.trim()) {
    folder.name = value.trim();
    renderCollections();
  }
}

function deleteFolder(collection, folder) {
  if (!confirm(`Delete ${folder.name} and everything inside it?`)) {
    return;
  }
  removeFolder(collection, folder.id);
  activeCollectionId = collection.id;
  selectFirstRequest(collection);
  renderAll();
}

function renameRequest(request) {
  const value = prompt('Request name', request.name);
  if (value?.trim()) {
    request.name = value.trim();
    const tab = openRequestTabs.find((candidate) => requestForTab(candidate) === request);
    if (tab) {
      tab.dirty = true;
    }
    renderCollections();
    renderRequestTabs();
    renderRequestEditor();
  }
}

function duplicateRequest(collection, folder, request) {
  const duplicate = structuredClone(request);
  duplicate.id = crypto.randomUUID();
  duplicate.name = uniqueName(`${request.name} Copy`, allRequestNames(collection));
  (folder ? folder.requests : collection.requests).push(duplicate);
  activeCollectionId = collection.id;
  activeFolderId = folder?.id || null;
  activeRequestId = duplicate.id;
  ensureOpenRequestTabForActive({ dirty: true, createdUnsaved: true });
  renderAll();
}

function deleteCollection(collection) {
  if (!confirm(`Delete ${collection.name}?`)) {
    return;
  }
  removeOpenRequestTabsForCollection(collection.id);
  workspace.collections = workspace.collections.filter((item) => item.id !== collection.id);
  if (!workspace.collections.length) {
    clearActiveWorkspaceItem();
    renderAll();
  } else {
    selectInitialWorkspaceItem();
    renderAll();
  }
}

function clearActiveWorkspaceItem() {
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = null;
}

function deleteRequest(collection, folder, request) {
  if (!confirm(`Delete ${request.name}?`)) {
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
}

function collectRequestFromEditor() {
  const request = activeRequest();
  if (!request) {
    return;
  }
  request.name = $('requestNameInput').value.trim() || 'Untitled Request';
  request.method = METHODS.includes($('methodSelect').value) ? $('methodSelect').value : 'GET';
  request.url = $('urlInput').value.trim();
  request.bodyType = BODY_TYPES.includes($('bodyTypeSelect').value) ? $('bodyTypeSelect').value : 'NONE';
  request.body = $('bodyInput').value;
  request.auth = collectAuthFromEditor();
  request.assertions ||= [];
  request.scripts = {
    preRequest: $('preRequestScriptInput').value,
    tests: $('testScriptInput').value
  };
  request.cookieJar = {
    enabled: $('requestCookieJarEnabledInput').checked,
    storeResponses: $('requestCookieJarStoreInput').checked
  };
}

function collectAuthFromEditor() {
  return collectRequestAuthFromEditor({
    doc: document,
    existingAuth: activeRequest()?.auth || {}
  });
}

function collectEnvironmentFromEditor() {
  const environment = activeEnvironment();
  if (environment) {
    environment.name = $('environmentNameInput').value.trim() || 'Untitled Environment';
    $('environmentMainTitle').textContent = environment.name;
    renderEnvironmentSelect();
    renderEnvironments();
    renderWorkspacePanel();
  }
}

function activeCollection() {
  return workspace.collections.find((collection) => collection.id === activeCollectionId);
}

function activeEnvironment() {
  return workspace.environments.find((environment) => environment.id === activeEnvironmentId) || null;
}

function activeRequest() {
  if (!activeCollectionId && activeRequestId) {
    return draftRequests.get(activeRequestId) || null;
  }
  const collection = activeCollection();
  if (!collection || !activeRequestId) {
    return null;
  }
  return findRequest(collection, activeRequestId)?.request || null;
}

function activateTab(groupName, tabName) {
  const panelIds = TAB_PANEL_IDS[groupName] || [];
  for (const button of document.querySelectorAll(`.tab[data-tab-group="${groupName}"]`)) {
    if (button.dataset.tab) {
      button.classList.toggle('active', button.dataset.tab === tabName);
    }
  }
  for (const panelId of panelIds) {
    const panel = $(panelId);
    panel.classList.toggle('active', panel.id === `${tabName}Tab`);
  }
  scheduleSessionSave();
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(message) {
  lastStatusMessage = String(message || '');
}

function notifyUser(title, message) {
  const notification = {
    title: String(title || 'PostMeter'),
    message: String(message || '')
  };
  lastUserNotification = notification;
  if (typeof window.__postmeterNotifyUser === 'function') {
    window.__postmeterNotifyUser(notification);
    return;
  }
  if (isAutomatedUiSmoke()) {
    return;
  }
  window.alert(`${notification.title}\n\n${notification.message}`);
}

function isAutomatedUiSmoke() {
  const params = new URLSearchParams(window.location.search);
  return params.get('uiWorkflowSmoke') === '1'
    || params.get('uiRegressionSmoke') === '1'
    || params.get('uiSnapshotSmoke') === '1'
    || params.get('uiOauthSmoke') === '1';
}
