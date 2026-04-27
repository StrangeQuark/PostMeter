const BODY_TYPES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const THEME_OPTIONS = ['system', 'light', 'dark'];
const RENDERER_STATE_DEFAULTS = PostMeterRendererState.createRendererState();
const TAB_PANEL_IDS = {
  request: ['paramsTab', 'headersTab', 'authTab', 'cookiesTab', 'bodyTab', 'testsTab', 'scriptsTab', 'examplesTab', 'collectionVariablesTab'],
  results: ['responseTab', 'visualizerTab', 'loadTab', 'runnerTab']
};

let workspace = RENDERER_STATE_DEFAULTS.workspace;
let workspacePath = RENDERER_STATE_DEFAULTS.workspacePath;
let workspaces = RENDERER_STATE_DEFAULTS.workspaces;
let selectedWorkspaceId = RENDERER_STATE_DEFAULTS.selectedWorkspaceId;
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
let collectionDirtySnapshots = RENDERER_STATE_DEFAULTS.collectionDirtySnapshots;
let collectionDirtyOwners = RENDERER_STATE_DEFAULTS.collectionDirtyOwners;
let cookieJarDirtySnapshot = RENDERER_STATE_DEFAULTS.cookieJarDirtySnapshot;
let cookieJarDirtyOwner = RENDERER_STATE_DEFAULTS.cookieJarDirtyOwner;
let activeLoadId = RENDERER_STATE_DEFAULTS.activeLoadId;
let activeOauthFlowId = RENDERER_STATE_DEFAULTS.activeOauthFlowId;
let activeRunnerId = RENDERER_STATE_DEFAULTS.activeRunnerId;
let lastLoadResult = RENDERER_STATE_DEFAULTS.lastLoadResult;
let lastRunnerResult = RENDERER_STATE_DEFAULTS.lastRunnerResult;
let lastResponse = RENDERER_STATE_DEFAULTS.lastResponse;
let lastVaultMetadata = null;
let lastStatusMessage = RENDERER_STATE_DEFAULTS.lastStatusMessage;
let lastUserNotification = RENDERER_STATE_DEFAULTS.lastUserNotification;
let activeModalId = RENDERER_STATE_DEFAULTS.activeModalId;
let activeModalResolver = RENDERER_STATE_DEFAULTS.activeModalResolver;
let selectedDraftSaveCollectionId = RENDERER_STATE_DEFAULTS.selectedDraftSaveCollectionId;
let selectedExportCollectionId = RENDERER_STATE_DEFAULTS.selectedExportCollectionId;
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
  clearSharedRequestDirtyState: clearRendererSharedRequestDirtyState,
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
  get selectedWorkspaceId() { return selectedWorkspaceId; },
  set selectedWorkspaceId(value) { selectedWorkspaceId = value; },
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
  get collectionDirtySnapshots() { return collectionDirtySnapshots; },
  set collectionDirtySnapshots(value) { collectionDirtySnapshots = value; },
  get collectionDirtyOwners() { return collectionDirtyOwners; },
  set collectionDirtyOwners(value) { collectionDirtyOwners = value; },
  get cookieJarDirtySnapshot() { return cookieJarDirtySnapshot; },
  set cookieJarDirtySnapshot(value) { cookieJarDirtySnapshot = value; },
  get cookieJarDirtyOwner() { return cookieJarDirtyOwner; },
  set cookieJarDirtyOwner(value) { cookieJarDirtyOwner = value; },
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
  get selectedExportCollectionId() { return selectedExportCollectionId; },
  set selectedExportCollectionId(value) { selectedExportCollectionId = value; },
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
  selectEnvironmentTab: (tab) => selectEnvironmentTabWithoutCollect(tab),
  selectRequestTab: (tab) => selectRequestTabWithoutCollect(tab),
  selectWorkspaceTab: (tab) => selectWorkspaceTabWithoutCollect(tab),
  workspaceListItems
});

const rendererWorkflows = createRendererWorkflows({
  state,
  doc: document,
  windowObject: window,
  applyLoadedWorkspace,
  applyWorkspaceCatalogUpdate,
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
  renderRequestTabs,
  renderRequestVariablePairs,
  renderVariablePreview,
  promptForCollectionExport,
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
    registerCleanup(() => { flushWorkspaceSave({ sync: true }); });
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
    onExportCollection: () => exportCollection(null, 'postmeter'),
    onExportPostman: () => exportCollection(null, 'postman'),
    onExportOpenApi: () => exportCollection(null, 'openapi'),
    onExportJMeter: () => exportCollection(null, 'jmeter'),
    onExportCurl: () => exportCollection(null, 'curl'),
    onExportHar: () => exportCollection(null, 'har'),
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
    onSwitchWorkspace: () => { void switchWorkspace(selectedWorkspaceId || activeWorkspaceId, { focus: 'workspace' }); },
    onAddSandboxPackage: () => { void addSandboxPackageFromPrompt(); },
    onRefreshSandboxPackages: () => renderWorkspacePanel(),
    onBindVaultSecret: () => { void bindVaultSecretFromPrompt(); },
    onRefreshVaultMetadata: () => { void refreshVaultMetadata(); },
    onResetVault: () => { void resetVaultFromWorkspacePanel(); },
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
    onTrustedScriptCapabilityChange: setTrustedScriptCapabilitiesFromInputs,
    onAuthTypeChange: showAuthSection,
    onAuthInput: collectRequestAndMarkDirty,
    onActivateTab: activateTab,
    onSelectSidebarPanel: selectSidebarPanel,
    onCancelActiveModal: cancelActiveModal,
    onResolveActiveModal: resolveActiveModal,
    getSelectedDraftSaveCollectionId: () => selectedDraftSaveCollectionId,
    getSelectedExportCollectionId: () => selectedExportCollectionId,
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
        await exportCollection(null, 'postmeter');
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
        onSelect: (tab) => selectRequestTab(tab),
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
        onSelect: (tab) => selectEnvironmentTab(tab),
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
        onSelect: (tab) => selectWorkspaceTab(tab),
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
  collectActiveEditorState();
  requestTabState.selectRequestTab(tab);
}

function selectRequestTabWithoutCollect(tab) {
  requestTabState.selectRequestTab(tab);
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

function collectActiveEditorState() {
  if (activeMainPanel === 'environment') {
    collectEnvironmentFromEditor();
    return;
  }
  if (activeMainPanel === 'request') {
    collectRequestFromEditor();
  }
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

async function promptForCollectionExport(collections, preferredCollection) {
  const collectionId = await promptCollectionExport(collections, preferredCollection);
  return (collections || []).find((collection) => collection.id === collectionId) || null;
}

function promptCollectionExport(collections, preferredCollection) {
  selectedExportCollectionId = '';
  const availableCollections = Array.isArray(collections) ? collections : [];
  $('exportCollectionMessage').textContent = availableCollections.length
    ? 'Choose a collection to export.'
    : 'There are no collections present to export.';
  renderExportCollectionList(availableCollections, preferredCollection);
  return showModal('exportCollectionModal', null);
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

function renderExportCollectionList(collections = workspace.collections, preferredCollection = null) {
  const list = $('exportCollectionList');
  list.textContent = '';
  $('confirmExportCollectionButton').disabled = true;
  const availableCollections = Array.isArray(collections) ? collections : [];
  if (!availableCollections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'There are no collections present to export.';
    list.append(empty);
    return;
  }
  const preferredId = preferredCollection?.id || availableCollections[0]?.id || '';
  for (const collection of availableCollections) {
    const label = document.createElement('label');
    label.className = 'collection-pick-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'exportCollection';
    input.value = collection.id;
    input.addEventListener('change', () => {
      selectedExportCollectionId = input.value;
      $('confirmExportCollectionButton').disabled = false;
    });
    if (collection.id === preferredId) {
      input.checked = true;
      selectedExportCollectionId = input.value;
      $('confirmExportCollectionButton').disabled = false;
    }
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
    } else if (modalId === 'exportCollectionModal') {
      $('cancelExportCollectionButton').focus();
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
  updateWorkspaceCatalog(loaded, options);
  workspace = loaded?.workspace || workspace;
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
  workspaces = Array.isArray(loaded?.workspaces) ? loaded.workspaces : workspaces;
  activeWorkspaceId = loaded?.activeWorkspaceId || activeWorkspaceId || workspaces[0]?.id || null;
  const requestedSelectedWorkspaceId = options.selectedWorkspaceId || selectedWorkspaceId || activeWorkspaceId;
  selectedWorkspaceId = workspaceListItems().some((item) => item.id === requestedSelectedWorkspaceId)
    ? requestedSelectedWorkspaceId
    : activeWorkspaceId || workspaces[0]?.id || null;
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

function buildWorkspaceStateForPersistence() {
  collectRequestFromEditor();
  collectEnvironmentFromEditor();
  collectSettingsFromEditor();
  return workspace;
}

async function persistWorkspaceState() {
  try {
    const save = window.__postmeterSaveWorkspace || window.postmeter.workspace.save;
    workspace = await save(buildWorkspaceStateForPersistence());
    return workspace;
  } catch {
    return null;
  }
}

function flushWorkspaceSave(options = {}) {
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
  collectActiveEditorState();
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
    selectedWorkspaceId ||= activeWorkspaceId || workspaceListItems()[0]?.id || null;
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
  workspace.settings.sandbox ||= { trustedCapabilities: { sendRequest: true, cookies: true, vault: false } };
  workspace.settings.sandbox.packageCache = normalizeSandboxPackageCache(workspace.settings.sandbox.packageCache);
  workspace.settings.sandbox.trustedCapabilities ||= { sendRequest: true, cookies: true, vault: false };
  workspace.settings.sandbox.trustedCapabilities.sendRequest = workspace.settings.sandbox.trustedCapabilities.sendRequest !== false;
  workspace.settings.sandbox.trustedCapabilities.cookies = workspace.settings.sandbox.trustedCapabilities.cookies !== false;
  workspace.settings.sandbox.trustedCapabilities.vault = workspace.settings.sandbox.trustedCapabilities.vault === true;
  workspace.settings.sandbox.trustedCapabilities.vaultGrants = normalizeVaultGrants(
    workspace.settings.sandbox.trustedCapabilities.vaultGrants,
    workspace.settings.sandbox.trustedCapabilities.vault
  );
  workspace.settings.appearance.theme = normalizeThemeOption(workspace.settings.appearance.theme);
  delete workspace.settings.loadTestPolicy;
}

function normalizeSandboxPackageCache(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object')
    .slice(0, 32)
    .map((item) => ({
      specifier: String(item.specifier || item.name || '').trim(),
      source: String(item.source || item.code || ''),
      integrity: String(item.integrity || '').trim(),
      dependencies: Array.isArray(item.dependencies) ? item.dependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 32) : [],
      maxExportKeys: Number.isFinite(Number(item.maxExportKeys)) ? Number(item.maxExportKeys) : undefined
    }))
    .filter((item) => item.specifier && item.source && item.integrity);
}

const SANDBOX_REVIEWED_PACKAGE_PATTERN = /^(?:npm:[a-z0-9@._/-]+@\d[\w.+-]*|jsr:[a-z0-9@._/-]+@\d[\w.+-]*|@[a-z0-9._-]+\/[a-z0-9._-]+)$/i;
const SANDBOX_PACKAGE_REQUIRE_PATTERN = /\b(?:pm\.)?require\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

function sandboxPackageReferencesForWorkspace() {
  const references = new Map();
  for (const collection of workspace.collections || []) {
    collectSandboxPackageReferencesFromScripts(collection, references);
  }
  return [...references.values()].sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function collectSandboxPackageReferencesFromScripts(node, references) {
  for (const request of node.requests || []) {
    collectSandboxPackageReferencesFromText(request.scripts?.preRequest || '', references);
    collectSandboxPackageReferencesFromText(request.scripts?.tests || '', references);
  }
  for (const folder of node.folders || []) {
    collectSandboxPackageReferencesFromScripts(folder, references);
  }
}

function collectSandboxPackageReferencesFromText(source, references) {
  const text = String(source || '');
  let match;
  while ((match = SANDBOX_PACKAGE_REQUIRE_PATTERN.exec(text)) !== null) {
    const specifier = String(match[2] || '').trim();
    if (!/^(?:npm:|jsr:|@)/i.test(specifier)) {
      continue;
    }
    if (!references.has(specifier)) {
      references.set(specifier, {
        pinned: SANDBOX_REVIEWED_PACKAGE_PATTERN.test(specifier),
        specifier
      });
    }
  }
}

function sandboxPackageStatusRows() {
  ensureSettings();
  const cache = new Map((workspace.settings.sandbox.packageCache || []).map((item) => [item.specifier, item]));
  return sandboxPackageReferencesForWorkspace().map((reference) => {
    const cached = cache.get(reference.specifier);
    return {
      ...reference,
      cached: Boolean(cached),
      status: !reference.pinned
        ? 'Pin exact npm:/jsr: versions before review'
        : cached
          ? 'Reviewed'
          : 'Missing reviewed package'
    };
  });
}

function normalizeVaultGrants(value, workspaceGrant = false) {
  const grants = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    workspace: workspaceGrant === true || grants.workspace === true,
    collections: normalizeIdList(grants.collections),
    requests: normalizeIdList(grants.requests),
    deniedCollections: normalizeIdList(grants.deniedCollections),
    deniedRequests: normalizeIdList(grants.deniedRequests)
  };
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 1000);
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
    await saveWorkspace(false, { scope: 'settings' });
  }
  if (options.showStatus !== false) {
    setStatus(`Theme set to ${normalizedTheme}.`);
  }
}

async function setIncludePrereleases(includePrereleases, options = {}) {
  ensureSettings();
  workspace.settings.updates.includePrereleases = includePrereleases === true;
  if (options.save === true) {
    await saveWorkspace(false, { scope: 'settings' });
  }
  if (options.showStatus !== false) {
    setStatus(`Prerelease update checks ${workspace.settings.updates.includePrereleases ? 'enabled' : 'disabled'}.`);
  }
}

async function setTrustedScriptCapabilitiesFromInputs() {
  ensureSettings();
  workspace.settings.sandbox.trustedCapabilities.sendRequest = $('trustedScriptSendRequestInput').checked === true;
  workspace.settings.sandbox.trustedCapabilities.cookies = $('trustedScriptCookiesInput').checked === true;
  workspace.settings.sandbox.trustedCapabilities.vault = $('trustedScriptVaultInput').checked === true;
  const existingVaultGrants = workspace.settings.sandbox.trustedCapabilities.vaultGrants || {};
  workspace.settings.sandbox.trustedCapabilities.vaultGrants = normalizeVaultGrants(
    {
      ...existingVaultGrants,
      workspace: workspace.settings.sandbox.trustedCapabilities.vault === true
    },
    false
  );
  await saveWorkspace(false, { scope: 'settings' });
  renderWorkspacePanel();
}

async function addSandboxPackageFromPrompt(defaultSpecifier = '') {
  ensureSettings();
  const firstMissing = sandboxPackageStatusRows().find((item) => item.pinned && !item.cached)?.specifier || '';
  const specifier = String(prompt('Package specifier to review:', defaultSpecifier || firstMissing || 'npm:package@1.0.0') || '').trim();
  if (!specifier) {
    return;
  }
  if (!SANDBOX_REVIEWED_PACKAGE_PATTERN.test(specifier)) {
    setStatus('Package review requires @team/package, npm:package@version, or jsr:package@version.');
    return;
  }
  const source = String(prompt(`Paste reviewed source for ${specifier}:`, '') || '');
  if (!source.trim()) {
    return;
  }
  const dependenciesText = String(prompt('Reviewed dependencies, comma separated:', '') || '');
  const dependencies = dependenciesText.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 32);
  const integrity = await sha256Integrity(source);
  const next = normalizeSandboxPackageCache([
    ...workspace.settings.sandbox.packageCache.filter((item) => item.specifier !== specifier),
    { dependencies, integrity, source, specifier }
  ]);
  workspace.settings.sandbox.packageCache = next;
  await saveWorkspace(false, { scope: 'settings' });
  renderWorkspacePanel();
  setStatus(`Reviewed package ${specifier} added to the sandbox cache.`);
}

async function sha256Integrity(source) {
  const bytes = new TextEncoder().encode(String(source || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const binary = String.fromCharCode(...new Uint8Array(digest));
  return `sha256-${btoa(binary)}`;
}

function removeSandboxPackage(specifier) {
  ensureSettings();
  workspace.settings.sandbox.packageCache = workspace.settings.sandbox.packageCache.filter((item) => item.specifier !== specifier);
  void saveWorkspace(false, { scope: 'settings' }).then(() => {
    renderWorkspacePanel();
    setStatus(`Reviewed package ${specifier} removed from the sandbox cache.`);
  });
}

async function refreshVaultMetadata() {
  if (!window.postmeter?.vault?.metadata) {
    setStatus('Vault metadata is unavailable in this runtime.');
    return;
  }
  try {
    lastVaultMetadata = await window.postmeter.vault.metadata();
    renderWorkspacePanel();
    setStatus('Vault metadata refreshed.');
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault metadata refresh failed: ${message}`);
    notifyUser('Vault Metadata Failed', message);
  }
}

async function bindVaultSecretFromPrompt() {
  if (!window.postmeter?.vault?.bindSecret) {
    setStatus('Vault binding is unavailable in this runtime.');
    return;
  }
  const key = String(prompt('Vault secret key', '') || '').trim();
  if (!key) {
    return;
  }
  const value = prompt(`Local value for vault secret "${key}"`, '');
  if (value == null) {
    return;
  }
  try {
    await window.postmeter.vault.bindSecret(key, value);
    await refreshVaultMetadata();
    setStatus(`Vault secret ${key} bound locally.`);
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault secret binding failed: ${message}`);
    notifyUser('Vault Binding Failed', message);
  }
}

async function unsetVaultSecret(key) {
  if (!window.postmeter?.vault?.unsetSecret) {
    setStatus('Vault secret removal is unavailable in this runtime.');
    return;
  }
  if (!confirm(`Remove vault secret "${key}" from this workspace?`)) {
    return;
  }
  try {
    await window.postmeter.vault.unsetSecret(key);
    await refreshVaultMetadata();
    setStatus(`Vault secret ${key} removed.`);
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault secret removal failed: ${message}`);
    notifyUser('Vault Removal Failed', message);
  }
}

async function resetVaultFromWorkspacePanel() {
  if (!window.postmeter?.vault?.reset) {
    setStatus('Vault reset is unavailable in this runtime.');
    return;
  }
  if (!confirm('Reset the local encrypted vault for this workspace? This removes stored local secret bindings.')) {
    return;
  }
  try {
    await window.postmeter.vault.reset();
    lastVaultMetadata = { audit: [], available: true, secrets: [] };
    renderWorkspacePanel();
    setStatus('Vault reset.');
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault reset failed: ${message}`);
    notifyUser('Vault Reset Failed', message);
  }
}

function selectInitialWorkspaceItem() {
  selectedWorkspaceId ||= activeWorkspaceId || workspaceListItems()[0]?.id || null;
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
    collectActiveEditorState();
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
  const button = treeButton(workspaceItem.name, activeMainPanel === 'workspace' && workspaceItem.id === selectedWorkspaceId, 'WRK');
  button.addEventListener('click', () => {
    selectWorkspaceItem(workspaceItem.id);
  });
  const menuItems = [
    ['View Details', () => { selectWorkspaceItem(workspaceItem.id); }],
    ['Rename', () => { void renameWorkspace(workspaceItem.id); }]
  ];
  if (workspaceItem.current !== true) {
    menuItems.splice(1, 0, ['Switch to This Workspace', () => { void switchWorkspace(workspaceItem.id, { focus: 'workspace' }); }]);
  }
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
  $('switchWorkspacePanelButton').disabled = !workspaceItem || workspaceItem.current === true;
  $('renameWorkspacePanelButton').disabled = !workspaceItem;
  $('deleteWorkspacePanelButton').disabled = !workspaceItem || workspaceListItems().length <= 1;
  $('exportWorkspacePanelButton').disabled = !workspaceItem;
  if ($('trustedScriptSendRequestInput')) {
    $('trustedScriptSendRequestInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.sendRequest === true;
  }
  if ($('trustedScriptCookiesInput')) {
    $('trustedScriptCookiesInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.cookies === true;
  }
  if ($('trustedScriptVaultInput')) {
    $('trustedScriptVaultInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.vault === true;
  }
  renderVaultMetadataPanel();
  renderSandboxPackageCachePanel();
  const container = $('workspaceSummary');
  container.textContent = '';
  if (!workspaceItem) {
    return;
  }
  const summary = workspaceSummaryForItem(workspaceItem);
  const rows = [
    ['Name', workspaceDisplayName(workspaceItem)],
    ['Workspace File', workspaceItem.path || 'Default local workspace'],
    ['Current Workspace', workspaceItem.current === true ? 'Yes' : 'No'],
    ['Saved Workspaces', String(workspaceListItems().length || 0)],
    ['Schema Version', String(summary.schemaVersion || '-')],
    ['Theme', titleCaseTheme(summary.theme)],
    ['Collections', String(summary.collections)],
    ['Folders', String(summary.folders)],
    ['Requests', String(summary.requests)],
    ['Environments', String(summary.environments)],
    ['Cookies', String(summary.cookies)],
    ['History Entries', String(summary.historyEntries)]
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
  action.addEventListener('click', () => {
    void addSandboxPackageFromPrompt(specifier);
  });
  row.append(text, action);
  return row;
}

function packageCacheRow(item) {
  const row = document.createElement('div');
  row.className = 'workspace-package-row';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = item.specifier;
  const detail = document.createElement('span');
  detail.textContent = item.integrity;
  text.append(title, document.createElement('br'), detail);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
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
  if (!lastVaultMetadata) {
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
  if (workspaceItem?.name && String(workspaceItem.name).trim()) {
    return String(workspaceItem.name).trim();
  }
  const filename = String(workspaceItem?.path || workspacePath || '').split(/[\\/]/).filter(Boolean).pop();
  if (!filename) {
    return 'Workspace';
  }
  return filename.replace(/\.json$/i, '') || 'Workspace';
}

function selectWorkspaceItem(workspaceId) {
  if (!workspaceId) {
    return null;
  }
  const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId);
  if (!workspaceItem) {
    return null;
  }
  collectActiveEditorState();
  selectedWorkspaceId = workspaceItem.id;
  activeSidebarPanel = 'workspaces';
  activeMainPanel = 'workspace';
  ensureOpenWorkspaceTabForActive();
  renderAll();
  return workspaceItem;
}

function liveWorkspaceSummary() {
  return {
    schemaVersion: workspace?.schemaVersion || 0,
    theme: workspace?.settings?.appearance?.theme || 'system',
    collections: workspace?.collections?.length || 0,
    folders: countWorkspaceFolders(),
    requests: countWorkspaceRequests(),
    environments: workspace?.environments?.length || 0,
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
    theme: workspaceItem?.theme || 'system',
    collections: Number.isFinite(Number(workspaceItem?.collectionCount)) ? Number(workspaceItem.collectionCount) : 0,
    folders: Number.isFinite(Number(workspaceItem?.folderCount)) ? Number(workspaceItem.folderCount) : 0,
    requests: Number.isFinite(Number(workspaceItem?.requestCount)) ? Number(workspaceItem.requestCount) : 0,
    environments: Number.isFinite(Number(workspaceItem?.environmentCount)) ? Number(workspaceItem.environmentCount) : 0,
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
  const button = treeButton(collection.name, collection.id === activeCollectionId && !activeRequestId, 'COL');
  button.addEventListener('click', () => {
    collectActiveEditorState();
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
    collectActiveEditorState();
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
    collectActiveEditorState();
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
  $('captureResponseExampleButton').disabled = !canCaptureResponseExampleForRequest(request);
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
      markActiveCollectionDirty();
      renderVariablePreview();
    },
    onRemove: () => {
      markActiveCollectionDirty();
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
    onDirty: markCookieJarDirty,
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
        markActiveRequestDirty();
        renderCollections();
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
  displayVisualizer(response.testScriptResult?.visualizer);
}

function displayVisualizer(visualizer) {
  const frame = $('visualizerFrame');
  if (!frame) {
    return;
  }
  const html = typeof visualizer?.html === 'string' ? visualizer.html : '';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.srcdoc = visualizerDocument(html, visualizer?.data, visualizer?.assets);
}

function visualizerDocument(html, data = {}, assets = []) {
  const serializedData = safeScriptJson(data == null ? {} : data);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; connect-src 'none'; media-src 'none'; worker-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';"><style>html,body{margin:0;min-height:100%;font:13px system-ui,sans-serif;color:#1f2937;background:#fff;}body{padding:12px;box-sizing:border-box;}</style><script>window.pm=Object.freeze({getData:function(callback){if(typeof callback==='function'){callback(null,${serializedData});}}});</script>${visualizerAssetMarkup(assets)}</head><body>${html}</body></html>`;
}

function visualizerAssetMarkup(assets = []) {
  if (!Array.isArray(assets)) {
    return '';
  }
  return assets.slice(0, 16).map((asset) => {
    const name = escapeHtmlAttribute(asset?.name || '');
    const source = String(asset?.source || '');
    if (!name || !source || !String(asset?.integrity || '').startsWith('sha256-')) {
      return '';
    }
    if (asset?.type === 'style') {
      return `<style data-postmeter-visualizer-asset="${name}">${escapeStyleSource(source)}</style>`;
    }
    return `<script data-postmeter-visualizer-asset="${name}">${escapeScriptSource(source)}</script>`;
  }).join('');
}

function escapeScriptSource(source) {
  return String(source || '').replace(/<\/script/gi, '<\\/script');
}

function escapeStyleSource(source) {
  return String(source || '').replace(/<\/style/gi, '<\\/style');
}

function escapeHtmlAttribute(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function safeScriptJson(value) {
  try {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  } catch {
    return '{}';
  }
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
  const workspaceItem = activeWorkspaceItem();
  if (!workspaceItem) {
    setStatus('Select a workspace before exporting.');
    return null;
  }
  if (workspaceItem.current !== true) {
    const exportWorkspaceBoundary = window.__postmeterExportWorkspace || window.postmeter.workspace.exportWorkspace;
    const result = await exportWorkspaceBoundary(null, workspaceItem.id);
    if (!result.cancelled) {
      setStatus(`Workspace exported to ${result.path}.`);
    }
    return result;
  }
  return rendererWorkflows.exportWorkspace();
}

async function prepareForWorkspaceChange(actionLabel) {
  if (draftRequests.size > 0) {
    const draftLabel = draftRequests.size === 1 ? 'draft request' : 'draft requests';
    if (!confirm(`${draftRequests.size} unsaved ${draftLabel} will be discarded before ${actionLabel}. Continue?`)) {
      return false;
    }
  }
  await persistWorkspace(false, { scope: 'all' });
  return true;
}

async function newWorkspace() {
  try {
    collectActiveEditorState();
    const previousWorkspaceIds = new Set(workspaceListItems().map((item) => item.id));
    const loaded = await window.postmeter.workspace.create();
    const createdWorkspaceId = loaded.createdWorkspaceId
      || loaded.workspaces?.find((item) => !previousWorkspaceIds.has(item.id))?.id
      || null;
    workspaces = Array.isArray(loaded?.workspaces) ? loaded.workspaces : workspaces;
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

async function renameWorkspace(workspaceId = selectedWorkspaceId || activeWorkspaceId) {
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
      await persistWorkspace(false, { scope: 'all' });
    }
    const previousWorkspaceIds = new Set(workspaceListItems().map((item) => item.id));
    const renameBoundary = window.__postmeterRenameWorkspace || window.postmeter.workspace.rename;
    const loaded = await renameBoundary(workspaceId, nextName);
    const renamedWorkspaceId = loaded.workspaces?.find((item) => item.id !== workspaceId && !previousWorkspaceIds.has(item.id))?.id
      || (renamingActiveWorkspace ? loaded.activeWorkspaceId : workspaceId);
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
      return selectWorkspaceItem(workspaceId);
    }
    if (!(await prepareForWorkspaceChange('switching workspaces'))) {
      return null;
    }
    const loaded = await window.postmeter.workspace.switch(workspaceId);
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
    if (!confirm(`Delete "${workspaceItem.name}"? This cannot be recovered.`)) {
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
  collectActiveEditorState();
  activeSidebarPanel = 'collections';
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
  collectActiveEditorState();
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
  collectActiveEditorState();
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
  collectActiveEditorState();
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
    markActiveCollectionDirty();
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
  markCookieJarDirty();
  workspace.cookies.push(newWorkspaceCookie({ domain }));
  renderCookieJarEditor();
}

function clearExpiredCookies() {
  workspace.cookies ||= [];
  const before = workspace.cookies.length;
  markCookieJarDirty();
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
  if (!request || !canCaptureResponseExampleForRequest(request)) {
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

function canCaptureResponseExampleForRequest(request) {
  return Boolean(request && lastResponse && lastResponse.requestId === request.id);
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
  return (workspace?.collections || []).find((collection) => collection.id === activeCollectionId) || null;
}

function activeEnvironment() {
  return (workspace?.environments || []).find((environment) => environment.id === activeEnvironmentId) || null;
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
