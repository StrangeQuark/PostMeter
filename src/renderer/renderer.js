const BODY_TYPES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const THEME_OPTIONS = ['system', 'light', 'dark'];
const RENDERER_STATE_DEFAULTS = PostMeterRendererState.createRendererState();
const TAB_PANEL_IDS = {
  request: ['paramsTab', 'headersTab', 'authTab', 'cookiesTab', 'bodyTab', 'testsTab', 'scriptsTab', 'examplesTab', 'collectionVariablesTab'],
  results: ['responseTab', 'testResultsTab', 'visualizerTab', 'loadTab', 'runnerTab']
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
let lastVaultMetadataWorkspaceId = null;
let lastStatusMessage = RENDERER_STATE_DEFAULTS.lastStatusMessage;
let lastUserNotification = RENDERER_STATE_DEFAULTS.lastUserNotification;
let activeModalId = RENDERER_STATE_DEFAULTS.activeModalId;
let activeModalCancelValue = RENDERER_STATE_DEFAULTS.activeModalCancelValue;
let activeModalResolver = RENDERER_STATE_DEFAULTS.activeModalResolver;
let selectedDraftSaveCollectionId = RENDERER_STATE_DEFAULTS.selectedDraftSaveCollectionId;
let selectedExportCollectionId = RENDERER_STATE_DEFAULTS.selectedExportCollectionId;
let activeVaultPromptPayload = null;
let sessionSaveTimer = null;
let sessionPersistenceEnabled = false;
let lastRenderedRequestEditorContextKey = '';
let lastModalFocusTarget = null;
let notificationModalActive = false;
let requestTitleEditOriginal = '';
let environmentTitleEditOriginal = '';
let workspaceTitleEditOriginal = '';
let pendingDiagnosticsSettingsSave = null;
const pendingNotificationModals = [];

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
const { createVaultPromptQueue } = PostMeterVaultPromptQueue;
const { createVariableAutocomplete } = PostMeterVariableAutocomplete;
const CodeEditor = window.PostMeterCodeEditor || {};
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
const vaultPromptQueue = createVaultPromptQueue({ onPrompt: promptVaultAccess });

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
  get activeModalCancelValue() { return activeModalCancelValue; },
  set activeModalCancelValue(value) { activeModalCancelValue = value; },
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
  notifyUser,
  setStatus,
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
  displayTestResults,
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
  confirm: (message) => confirmActionModal({ message }),
  prompt: (message, defaultValue) => promptTextInput({
    title: 'Choose value',
    message,
    label: 'Value',
    defaultValue,
    multiline: String(message || '').includes('\n')
  }),
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
    CodeEditor.enhanceCodeTextareas?.(document);
    updateRequestEditorLanguages();
    registerCleanup(bindForcedColorsPreference());
    registerCleanup(() => {
      if (window.__postmeterSkipWorkspaceShutdownSave === true) {
        return;
      }
      flushWorkspaceSave({ sync: true });
    });
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
    if (window.postmeter.vault?.onPrompt) {
      registerCleanup(window.postmeter.vault.onPrompt((payload) => {
        void handleVaultPrompt(payload).catch(() => {});
      }));
    }

    const loaded = await window.postmeter.workspace.load();
    applyLoadedWorkspace(loaded, { focus: 'request', render: false });
    const session = await window.postmeter.session.load();
    const restoredTabs = restoreSessionState(session);
    renderAll();
    activateTab('request', restoredTabs.activeRequestTab);
    activateTab('results', restoredTabs.activeResultsTab);
    sessionPersistenceEnabled = true;
    scheduleSessionSave({ immediate: true });
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
    onSaveRequest: () => { void saveRequestFromPane(); },
    onSaveEnvironment: () => { void saveEnvironmentFromPane(); },
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
    onFetchSandboxPackage: () => { void fetchSandboxPackageFromPrompt(); },
    onRefreshSandboxPackages: refreshSandboxPackageStatus,
    onBindSandboxFile: () => { void bindSandboxFileFromPrompt(); },
    onRefreshSandboxFiles: refreshSandboxFileBindings,
    onExportDiagnostics: exportDiagnostics,
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
    onMethodChange: () => {
      updateMethodSelectClass();
      collectRequestAndMarkDirty();
    },
    onUrlInput: () => {
      collectRequestAndMarkDirty();
      renderCookieJarEditor();
    },
    onBodyTypeChange: () => {
      updateRequestBodyEditorLanguage();
      collectRequestAndMarkDirty();
    },
    onBodyInput: collectRequestAndMarkDirty,
    onPreRequestScriptInput: collectRequestAndMarkDirty,
    onTestScriptInput: collectRequestAndMarkDirty,
    onRequestCookieJarChange: collectRequestAndMarkDirty,
    onFilterCookiesChange: renderCookieJarEditor,
    onTrustedScriptCapabilityChange: setTrustedScriptCapabilitiesFromInputs,
    onDiagnosticsSettingsChange: setDiagnosticsSettingsFromInputs,
    onAuthTypeChange: showAuthSection,
    onAuthInput: collectRequestAndMarkDirty,
    onActivateTab: activateTab,
    onSelectSidebarPanel: selectSidebarPanel,
    onCancelActiveModal: cancelActiveModal,
    onResolveActiveModal: resolveActiveModal,
    onResolveVaultPrompt: resolveVaultPrompt,
    onTrapActiveModalFocus: trapActiveModalFocus,
    getSelectedDraftSaveCollectionId: () => selectedDraftSaveCollectionId,
    getSelectedExportCollectionId: () => selectedExportCollectionId,
    onCloseContextMenu: closeContextMenu,
    onInitResizablePanes: initResizablePanes
  });
  bindRequestTitleEditor();
  bindWorkspaceTitleEditor();
  bindEnvironmentTitleEditor();
  bindHistoryContextMenu();
}

function bindHistoryContextMenu() {
  const tab = $('historyPanelTab');
  if (!tab) {
    return;
  }
  attachTreeContextMenu(tab, [
    ['Clear History', () => { void clearHistory(); }, 'danger']
  ]);
}

function showOpenTabContextMenu(event, kind, tab, _item, options = {}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const targetRef = openTabRef(kind, tab);
  const x = Number.isFinite(options.x) ? options.x : event?.clientX || 0;
  const y = Number.isFinite(options.y) ? options.y : event?.clientY || 0;
  showContextMenu(x, y, [
    ['New Request', () => newRequest()],
    ['Close Tab', () => { void queueOpenTabCloseSequence([targetRef]); }],
    ['Close Other Tabs', () => { void queueOpenTabCloseSequence(openTabRefs().filter((ref) => ref.key !== targetRef.key)); }],
    ['Close All Tabs', () => { void queueOpenTabCloseSequence(openTabRefs()); }],
    ['Force Close Tab', () => { void queueOpenTabCloseSequence([targetRef], { force: true }); }, 'danger'],
    ['Force Close All Tabs', () => { void queueOpenTabCloseSequence(openTabRefs(), { force: true }); }, 'danger']
  ], {
    focusFirst: options.keyboard === true,
    trigger: options.trigger || event?.currentTarget || null
  });
}

function openTabRef(kind, tab) {
  return {
    kind,
    key: tab?.key || '',
    tab
  };
}

function openTabRefs() {
  return [
    ...openRequestTabs.map((tab) => openTabRef('request', tab)),
    ...openEnvironmentTabs.map((tab) => openTabRef('environment', tab)),
    ...openWorkspaceTabs.map((tab) => openTabRef('workspace', tab))
  ];
}

function openTabRefStillExists(ref) {
  if (!ref?.key) {
    return false;
  }
  return openTabRefs().some((candidate) => candidate.key === ref.key);
}

let openTabCloseSequence = Promise.resolve(true);

function queueOpenTabCloseSequence(refs, options = {}) {
  const refsSnapshot = Array.isArray(refs) ? refs.slice() : [];
  openTabCloseSequence = openTabCloseSequence
    .catch(() => false)
    .then(async () => {
      try {
        return await closeOpenTabsSequential(refsSnapshot, options);
      } catch (error) {
        const message = error?.message || String(error || 'Unknown error');
        setStatus(`Tab close failed: ${message}`);
        return false;
      }
    });
  return openTabCloseSequence;
}

async function closeOpenTabsSequential(refs, options = {}) {
  for (const ref of refs) {
    if (!openTabRefStillExists(ref)) {
      continue;
    }
    const closed = options.force === true
      ? await forceCloseOpenTab(ref)
      : await closeOpenTab(ref);
    if (!closed && openTabRefStillExists(ref)) {
      return false;
    }
  }
  return true;
}

async function closeOpenTab(ref) {
  if (ref?.kind === 'request') {
    await closeRequestTab(ref.tab);
  } else if (ref?.kind === 'environment') {
    await closeEnvironmentTab(ref.tab);
  } else if (ref?.kind === 'workspace') {
    await closeWorkspaceTab(ref.tab);
  }
  return !openTabRefStillExists(ref);
}

async function forceCloseOpenTab(ref) {
  const options = { save: forceCloseSavesChanges() };
  if (ref?.kind === 'request') {
    await forceCloseRequestTab(ref.tab, options);
  } else if (ref?.kind === 'environment') {
    await forceCloseEnvironmentTab(ref.tab, options);
  } else if (ref?.kind === 'workspace') {
    await forceCloseWorkspaceTab(ref.tab, options);
  }
  return !openTabRefStillExists(ref);
}

function bindEnvironmentTitleEditor() {
  const title = $('environmentMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginEnvironmentTitleEdit);
  title.addEventListener('keydown', handleEnvironmentTitleKeydown);
  title.addEventListener('input', collectEnvironmentAndMarkDirty);
  title.addEventListener('blur', () => finishEnvironmentTitleEdit());
}

function beginEnvironmentTitleEdit() {
  const environment = activeEnvironment();
  const title = $('environmentMainTitle');
  if (!environment || !title || title.dataset.editing === 'true') {
    return;
  }
  environmentTitleEditOriginal = environment.name || 'Untitled Environment';
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Environment name');
  title.focus();
  selectElementContents(title);
}

function handleEnvironmentTitleKeydown(event) {
  const title = $('environmentMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginEnvironmentTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (environmentTitleInputValue() || 'Untitled Environment')
      !== (environmentTitleEditOriginal || 'Untitled Environment');
    finishEnvironmentTitleEdit();
    title.blur();
    if (shouldSave) {
      void saveEnvironmentFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishEnvironmentTitleEdit({ revert: true });
    title.blur();
  }
}

function finishEnvironmentTitleEdit(options = {}) {
  const title = $('environmentMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const environment = activeEnvironment();
  if (environment && options.revert === true) {
    environment.name = environmentTitleEditOriginal || 'Untitled Environment';
    title.textContent = environment.name;
    renderEnvironmentSelect();
    renderEnvironments();
    renderWorkspacePanel();
  } else {
    collectEnvironmentFromEditor();
    if (environment) {
      title.textContent = environment.name;
    }
  }
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Environment name');
}

function bindRequestTitleEditor() {
  const title = $('requestNameTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginRequestTitleEdit);
  title.addEventListener('keydown', handleRequestTitleKeydown);
  title.addEventListener('input', handleRequestTitleInput);
  title.addEventListener('blur', () => finishRequestTitleEdit());
}

function beginRequestTitleEdit() {
  const request = activeRequest();
  const title = $('requestNameTitle');
  if (!request || !title || title.dataset.editing === 'true') {
    return;
  }
  requestTitleEditOriginal = requestDisplayName(request);
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Request name');
  title.focus();
  selectElementContents(title);
}

function handleRequestTitleKeydown(event) {
  const title = $('requestNameTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginRequestTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (requestTitleInputValue() || 'Untitled Request')
      !== (requestTitleEditOriginal || 'Untitled Request');
    finishRequestTitleEdit();
    title.blur();
    if (shouldSave) {
      void saveRequestFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishRequestTitleEdit({ revert: true });
    title.blur();
  }
}

function handleRequestTitleInput() {
  if (collectRequestNameFromTitle({ markDirty: true, render: false })) {
    renderCollections();
    renderRequestTabs();
  }
}

function finishRequestTitleEdit(options = {}) {
  const title = $('requestNameTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const request = activeRequest();
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Request name');
  if (request && options.revert === true) {
    request.name = requestTitleEditOriginal || 'Untitled Request';
    title.textContent = requestDisplayName(request);
    renderCollections();
    renderRequestTabs();
    return;
  }
  collectRequestNameFromTitle({ markDirty: true, render: false });
  if (request) {
    title.textContent = requestDisplayName(request);
  }
  renderCollections();
  renderRequestTabs();
}

function bindWorkspaceTitleEditor() {
  const title = $('workspaceMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginWorkspaceTitleEdit);
  title.addEventListener('keydown', handleWorkspaceTitleKeydown);
  title.addEventListener('blur', () => { void finishWorkspaceTitleEdit(); });
}

function beginWorkspaceTitleEdit() {
  const workspaceItem = activeWorkspaceItem();
  const title = $('workspaceMainTitle');
  if (!workspaceItem || !title || title.dataset.editing === 'true') {
    return;
  }
  workspaceTitleEditOriginal = workspaceDisplayName(workspaceItem);
  title.dataset.editing = 'true';
  title.dataset.workspaceId = workspaceItem.id;
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Workspace name');
  title.focus();
  selectElementContents(title);
}

function handleWorkspaceTitleKeydown(event) {
  const title = $('workspaceMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginWorkspaceTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    void finishWorkspaceTitleEdit().then(() => title.blur());
  } else if (event.key === 'Escape') {
    event.preventDefault();
    void finishWorkspaceTitleEdit({ revert: true }).then(() => title.blur());
  }
}

async function finishWorkspaceTitleEdit(options = {}) {
  const title = $('workspaceMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return null;
  }
  const workspaceId = title.dataset.workspaceId || selectedWorkspaceId || activeWorkspaceId;
  const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId);
  const originalName = workspaceTitleEditOriginal || workspaceDisplayName(workspaceItem);
  const nextName = workspaceTitleInputValue();
  delete title.dataset.editing;
  delete title.dataset.workspaceId;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Workspace name');
  if (options.revert === true || !nextName || nextName === originalName) {
    title.textContent = originalName;
    return null;
  }
  const renamedWorkspace = await renameWorkspaceToName(workspaceId, nextName);
  if (title.dataset.editing !== 'true') {
    const visibleWorkspaceItem = activeWorkspaceItem();
    title.textContent = visibleWorkspaceItem ? workspaceDisplayName(visibleWorkspaceItem) : 'Select a workspace';
    renderWorkspacePanel();
  }
  return renamedWorkspace;
}

function selectElementContents(element) {
  const selection = window.getSelection?.();
  if (!selection || !document.createRange) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
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

function closeToolbarMenus() {
  closeRendererToolbarMenus(document);
}

function renderRequestTabs() {
  requestTabState.pruneOpenTabs();
  renderRequestTabBar({
    doc: document,
    groups: [
      {
        kind: 'request',
        tabs: openRequestTabs,
        resolve: requestTabState.requestForTab,
        isActive: isActiveRequestTab,
        idPrefix: 'open-request-tab',
        controlsId: 'requestEditorPanel',
        buttonClassName: 'request-tab-button',
        methodText: (request) => request.method || 'GET',
        methodClassName: (request) => methodClassName(request.method || 'GET'),
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
        title: (environment) => environment.name || 'Untitled Environment',
        closeTitle: () => 'Close environment',
        closeAriaLabel: (environment) => `Close ${environment.name || 'Untitled Environment'}`,
        onSelect: (tab) => selectEnvironmentTab(tab),
        onClose: closeEnvironmentTab,
        onContextMenu: (event, tab, item, menuOptions) => showOpenTabContextMenu(event, 'environment', tab, item, menuOptions)
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

function ensureOpenEnvironmentTabForActive(options = {}) {
  return requestTabState.ensureOpenEnvironmentTabForActive(options);
}

function ensureOpenWorkspaceTabForActive(options = {}) {
  return requestTabState.ensureOpenWorkspaceTabForActive(options);
}

function ensureOpenRequestTabForActive(options = {}) {
  return requestTabState.ensureOpenRequestTabForActive(options);
}

function canOpenAdditionalRequestTab(options = {}) {
  return requestTabState.canOpenAdditionalRequestTab(options);
}

function canOpenRequestTabFor(collectionId, requestId, options = {}) {
  return requestTabState.canOpenRequestTabFor(collectionId, requestId, options);
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

function selectRequestTab(tab) {
  collectActiveEditorState();
  requestTabState.selectRequestTab(tab, { collect: false });
}

function selectRequestTabWithoutCollect(tab) {
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
    finishEnvironmentTitleEdit();
    collectEnvironmentFromEditor();
    return;
  }
  if (activeMainPanel === 'workspace') {
    void finishWorkspaceTitleEdit();
    return;
  }
  if (activeMainPanel === 'request') {
    finishRequestTitleEdit();
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

function forceCloseWorkspaceTab(tab, options = {}) {
  return requestTabState.forceCloseWorkspaceTab(tab, options);
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
  const previousRequests = Array.isArray(collection.requests) ? collection.requests.slice() : null;
  const hadRequestsProperty = Object.prototype.hasOwnProperty.call(collection, 'requests');
  const hadDraft = draftRequests.has(draftId);
  const previousDraft = hadDraft ? draftRequests.get(draftId) : null;
  const previousActiveMainPanel = activeMainPanel;
  const previousActiveCollectionId = activeCollectionId;
  const previousActiveFolderId = activeFolderId;
  const previousActiveRequestId = activeRequestId;
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
    resolveActiveModal(state.activeModalCancelValue, { flushNotifications: false });
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  closeContextMenu();
  closeToolbarMenus();
  lastModalFocusTarget = modalRestoreFocusTarget(previousFocus);
  $('modalBackdrop').hidden = false;
  for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
    modal.hidden = modal.id !== modalId;
  }
  return new Promise((resolve) => {
    openModalState(state, modalId, resolve, cancelValue);
    focusInitialModalElement(modalId);
  });
}

function resolveActiveModal(value, options = {}) {
  const resolver = resolveModalState(state);
  $('modalBackdrop').hidden = true;
  for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
    modal.hidden = true;
  }
  if (resolver) {
    resolver(value);
  }
  restoreModalFocus();
  if (options.flushNotifications !== false) {
    void flushNotificationModalQueue();
  }
}

function cancelActiveModal() {
  if (!state.activeModalResolver) {
    return;
  }
  resolveActiveModal(state.activeModalCancelValue);
}

function focusInitialModalElement(modalId) {
  const preferredFocusIds = {
    unsavedRequestModal: 'cancelCloseRequestButton',
    saveDraftRequestModal: 'cancelSaveDraftButton',
    exportCollectionModal: 'cancelExportCollectionButton',
    textInputModal: $('textInputModal')?.dataset?.valueControl || 'textInputModalInput',
    confirmActionModal: 'cancelConfirmActionButton',
    notificationModal: 'closeNotificationModalButton',
    vaultPromptModal: 'denyVaultPromptButton'
  };
  const preferred = preferredFocusIds[modalId] ? $(preferredFocusIds[modalId]) : null;
  const target = preferred || getModalFocusableElements($(modalId))[0];
  target?.focus?.();
}

function restoreModalFocus() {
  const target = lastModalFocusTarget;
  lastModalFocusTarget = null;
  if (!isRestorableFocusTarget(target)) {
    return;
  }
  target.focus?.();
}

function modalRestoreFocusTarget(target) {
  const menu = target?.closest?.('.toolbar-menu');
  if (menu) {
    const triggerId = menu.getAttribute?.('aria-labelledby');
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    if (trigger) {
      return trigger;
    }
  }
  return target || null;
}

function isRestorableFocusTarget(target) {
  if (!target || !target.isConnected || target.disabled) {
    return false;
  }
  for (let element = target; element; element = element.parentElement) {
    if (element.hidden || element.getAttribute?.('aria-hidden') === 'true') {
      return false;
    }
  }
  return true;
}

function trapActiveModalFocus(event) {
  if (event?.key !== 'Tab' || !state.activeModalId || !state.activeModalResolver) {
    return false;
  }
  const modal = $(state.activeModalId);
  if (!modal || modal.hidden) {
    return false;
  }
  const focusable = getModalFocusableElements(modal);
  if (!focusable.length) {
    event.preventDefault();
    modal.focus?.();
    return true;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!modal.contains(active)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function getModalFocusableElements(modal) {
  if (!modal) {
    return [];
  }
  return Array.from(modal.querySelectorAll([
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(','))).filter((element) => !element.hidden && element.offsetParent !== null);
}

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
  lastLoadResult = null;
  lastRunnerResult = null;
  lastVaultMetadata = null;
  lastVaultMetadataWorkspaceId = null;
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

function resetWorkspaceTransientUi() {
  lastRenderedRequestEditorContextKey = '';
  $('validationLabel').textContent = '';
  $('loadResults').textContent = '';
  $('runnerResults').textContent = '';
  displayTestResults(null);
  $('runLoadButton').disabled = false;
  $('cancelLoadButton').disabled = true;
  $('runCollectionButton').disabled = false;
  $('cancelRunnerButton').disabled = true;
  $('exportLoadJsonButton').disabled = true;
  $('exportLoadCsvButton').disabled = true;
  $('exportRunnerJsonButton').disabled = true;
  $('exportRunnerCsvButton').disabled = true;
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
    const activeTab = openEnvironmentTabs.find((tab) => tab.key === activeEnvironmentTabKey());
    const fallbackTab = activeTab || openEnvironmentTabs[openEnvironmentTabs.length - 1] || null;
    if (fallbackTab) {
      selectEnvironmentTabWithoutCollect(fallbackTab);
      return;
    }
    activeEnvironmentId = 'none';
    activeMainPanel = 'environment';
  } else if (panel === 'workspaces') {
    const activeTab = openWorkspaceTabs.find((tab) => tab.key === activeWorkspaceTabKey());
    const fallbackTab = activeTab || openWorkspaceTabs[openWorkspaceTabs.length - 1] || null;
    if (fallbackTab) {
      selectWorkspaceTabWithoutCollect(fallbackTab);
      return;
    }
    selectedWorkspaceId = '';
    activeMainPanel = 'workspace';
  }
  renderAll();
}

function cancelActiveRuntimeForContextReset() {
  const loadId = activeLoadId;
  const runnerId = activeRunnerId;
  if (loadId && typeof window.postmeter?.loadTest?.cancel === 'function') {
    void window.postmeter.loadTest.cancel(loadId).catch(() => {});
  }
  if (runnerId && typeof window.postmeter?.runner?.cancel === 'function') {
    void window.postmeter.runner.cancel(runnerId).catch(() => {});
  }
}

function renderSidebarPanels() {
  for (const button of document.querySelectorAll('.sidebar-tab')) {
    const isActive = button.dataset.sidebarPanel === activeSidebarPanel;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
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
  workspace.settings.tabs ||= { saveOnForceClose: false };
  workspace.settings.tabs.saveOnForceClose = workspace.settings.tabs.saveOnForceClose === true;
  workspace.settings.diagnostics = normalizeDiagnosticsSettings(workspace.settings.diagnostics);
  workspace.settings.sandbox ||= { trustedCapabilities: { sendRequest: true, cookies: true, vault: false } };
  workspace.settings.sandbox.fileBindings = normalizeSandboxFileBindings(workspace.settings.sandbox.fileBindings);
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

const RENDERER_DIAGNOSTIC_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const RENDERER_DIAGNOSTIC_REQUEST_RESPONSE_FIELDS = [
  'urls',
  'headers',
  'cookies',
  'bodies',
  'protocolMessages',
  'scriptConsole',
  'payloadIdentifiers'
];

function normalizeDiagnosticsSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const level = RENDERER_DIAGNOSTIC_LOG_LEVELS.includes(String(source.logging?.level || '').toLowerCase())
    ? String(source.logging.level).toLowerCase()
    : 'info';
  const requestResponseSource = source.requestResponseLogging && typeof source.requestResponseLogging === 'object' && !Array.isArray(source.requestResponseLogging)
    ? source.requestResponseLogging
    : {};
  return {
    logging: {
      enabled: source.logging?.enabled !== false,
      level
    },
    requestResponseLogging: Object.fromEntries(RENDERER_DIAGNOSTIC_REQUEST_RESPONSE_FIELDS.map((field) => [
      field,
      requestResponseSource[field] === true
    ]))
  };
}

function normalizeSandboxPackageCache(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object')
    .slice(0, 32)
    .map((item) => ({
      dependencyAliases: normalizePlainStringMap(item.dependencyAliases || item.dependencyMap, 32),
      specifier: String(item.specifier || item.name || '').trim(),
      source: String(item.source || item.code || ''),
      files: normalizeSandboxPackageFiles(item.files),
      integrity: String(item.integrity || '').trim(),
      dependencies: Array.isArray(item.dependencies) ? item.dependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 32) : [],
      maxExportKeys: Number.isFinite(Number(item.maxExportKeys)) ? Number(item.maxExportKeys) : undefined,
      entrypoint: item.entrypoint == null ? '' : String(item.entrypoint).slice(0, 256),
      fetchedAt: item.fetchedAt == null ? '' : String(item.fetchedAt).slice(0, 256),
      packageDependencies: Array.isArray(item.packageDependencies) ? item.packageDependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 64) : [],
      packageIntegrity: item.packageIntegrity == null ? '' : String(item.packageIntegrity).slice(0, 512),
      packageJson: normalizeSandboxPackageJson(item.packageJson || item.package || item.manifest),
      packageName: item.packageName == null ? '' : String(item.packageName).slice(0, 256),
      packageVersion: item.packageVersion == null ? '' : String(item.packageVersion).slice(0, 128),
      registry: item.registry == null ? '' : String(item.registry).slice(0, 32),
      reviewedAt: item.reviewedAt == null ? '' : String(item.reviewedAt).slice(0, 256),
      sourceUrl: item.sourceUrl == null ? '' : String(item.sourceUrl).slice(0, 2048)
    }))
    .filter((item) => item.specifier && item.source && item.integrity);
}

function normalizeSandboxPackageFiles(files) {
  const entries = Array.isArray(files)
    ? files.map((file) => [
      file?.path ?? file?.name ?? file?.filename,
      file?.source ?? file?.code ?? file?.text
    ])
    : Object.entries(files || {});
  const output = [];
  for (const [rawPath, rawSource] of entries.slice(0, 128)) {
    const filePath = normalizeSandboxPackageFilePath(rawPath);
    if (!filePath || output.some((file) => file.path === filePath)) {
      continue;
    }
    output.push({
      path: filePath,
      source: String(rawSource ?? '')
    });
  }
  return output;
}

function normalizeSandboxPackageFilePath(filePath) {
  let value = String(filePath || '').replace(/\\/g, '/').trim();
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  value = value.replace(/^\/+/, '');
  const parts = value.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || parts.some((part) => part === '.' || part.includes('\0'))) {
    return '';
  }
  return parts.join('/').slice(0, 512);
}

function normalizeSandboxPackageJson(packageJson) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(packageJson));
  } catch {
    return {};
  }
}

function normalizePlainStringMap(value, limit) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).slice(0, limit).reduce((output, [key, target]) => {
    const alias = String(key || '').trim();
    const specifier = String(target || '').trim();
    if (alias && specifier) {
      output[alias] = specifier;
    }
    return output;
  }, {});
}

function normalizeSandboxFileBindings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const output = [];
  for (const item of value) {
    const source = String(item?.source || item?.src || '').trim().slice(0, 32768);
    const localPath = String(item?.localPath || item?.path || item?.filePath || '').trim().slice(0, 32768);
    if (!source || !localPath || seen.has(source)) {
      continue;
    }
    seen.add(source);
    output.push({
      id: String(item?.id || `file-binding-${seen.size}`).slice(0, 256),
      source,
      localPath,
      mode: normalizeSandboxFileMode(item?.mode),
      key: item?.key == null ? '' : String(item.key).slice(0, 512),
      contentType: item?.contentType == null ? '' : String(item.contentType).slice(0, 32768),
      fileName: item?.fileName == null ? '' : String(item.fileName).slice(0, 256),
      enabled: item?.enabled !== false,
      reviewedAt: item?.reviewedAt == null ? '' : String(item.reviewedAt).slice(0, 256)
    });
    if (output.length >= 1000) {
      break;
    }
  }
  return output;
}

function normalizeSandboxFileMode(value) {
  const mode = String(value || 'file').trim().toLowerCase();
  return ['file', 'binary', 'formdata'].includes(mode) ? mode : 'file';
}

const SANDBOX_REVIEWED_PACKAGE_PATTERN = /^(?:npm:(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)(?:@\d[\w.+-]*)?|jsr:@[a-z0-9._-]+\/[a-z0-9._-]+(?:@\d[\w.+-]*)?|@[a-z0-9._-]+\/[a-z0-9._-]+)$/i;
const SANDBOX_PACKAGE_REQUIRE_PATTERN = /\b(?:pm\.)?require\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const SANDBOX_SCRIPT_SOURCE_FIELDS = [
  'preRequest',
  'tests',
  'beforeQuery',
  'afterResponse',
  'beforeInvoke',
  'onMessage',
  'onIncomingMessage',
  'mock'
];

function sandboxPackageReferencesForWorkspace() {
  const references = new Map();
  for (const collection of workspace.collections || []) {
    collectSandboxPackageReferencesFromScripts(collection, references);
  }
  return [...references.values()].sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function collectSandboxPackageReferencesFromScripts(node, references) {
  for (const request of node.requests || []) {
    for (const field of SANDBOX_SCRIPT_SOURCE_FIELDS) {
      collectSandboxPackageReferencesFromText(request.scripts?.[field] || '', references);
    }
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
        ? 'Use @team/package, npm:package[@version], or jsr:@scope/package[@version]'
        : cached
          ? 'Reviewed'
          : 'Missing reviewed package'
    };
  });
}

function sandboxFileReferencesForWorkspace() {
  const references = [];
  for (const collection of workspace.collections || []) {
    collectSandboxFileReferencesFromNode(collection, references);
  }
  const seen = new Set();
  return references.filter((reference) => {
    const source = String(reference.source || reference.src || '').trim();
    if (!source) {
      return false;
    }
    const key = `${reference.mode || 'file'}|${reference.key || ''}|${source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).sort((left, right) => String(left.source || left.src || '').localeCompare(String(right.source || right.src || '')));
}

function collectSandboxFileReferencesFromNode(node, references) {
  if (!node || typeof node !== 'object') {
    return;
  }
  for (const reference of Array.isArray(node.postman?.fileReferences) ? node.postman.fileReferences : []) {
    references.push({
      contentType: reference.contentType == null ? '' : String(reference.contentType),
      key: reference.key == null ? '' : String(reference.key),
      mode: normalizeSandboxFileMode(reference.mode),
      source: String(reference.source || reference.src || '')
    });
  }
  for (const request of node.requests || []) {
    collectSandboxFileReferencesFromNode(request, references);
  }
  for (const folder of node.folders || []) {
    collectSandboxFileReferencesFromNode(folder, references);
  }
}

function sandboxFileBindingStatusRows() {
  ensureSettings();
  const bindings = new Map((workspace.settings.sandbox.fileBindings || []).map((binding) => [binding.source, binding]));
  return sandboxFileReferencesForWorkspace().map((reference) => {
    const binding = bindings.get(String(reference.source || ''));
    return {
      ...reference,
      binding,
      bound: Boolean(binding?.localPath),
      status: binding?.localPath ? `Bound to ${displayLocalFilePath(binding.localPath)}` : 'Needs local file binding'
    };
  });
}

function displayLocalFilePath(value) {
  const text = String(value || '');
  return text.split(/[\\/]/).pop() || text;
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
  syncForcedColorsPreference();
  try {
    localStorage.setItem('postmeter.theme', normalizedTheme);
  } catch {
    // Theme still applies for this session when storage is unavailable.
  }
}

function bindForcedColorsPreference() {
  const media = window.matchMedia?.('(forced-colors: active)');
  syncForcedColorsPreference(media);
  if (!media?.addEventListener) {
    return () => {};
  }
  const onChange = () => syncForcedColorsPreference(media);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function syncForcedColorsPreference(media = window.matchMedia?.('(forced-colors: active)')) {
  document.documentElement.dataset.forcedColors = media?.matches === true ? 'active' : 'inactive';
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
  const previousSettings = cloneWorkspaceSettings();
  const previousTheme = normalizeThemeOption(workspace.settings.appearance.theme);
  const normalizedTheme = normalizeThemeOption(theme);
  workspace.settings.appearance.theme = normalizedTheme;
  applyThemePreference(normalizedTheme);
  renderThemeControl();
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false ? '' : `Theme set to ${normalizedTheme}.`,
      'Theme save failed',
      'Theme Save Failed',
      () => {
        applyThemePreference(previousTheme);
        renderThemeControl();
      }
    );
  }
  if (options.showStatus !== false) {
    setStatus(`Theme set to ${normalizedTheme}.`);
  }
  return true;
}

async function setIncludePrereleases(includePrereleases, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.updates.includePrereleases = includePrereleases === true;
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : `Prerelease update checks ${workspace.settings.updates.includePrereleases ? 'enabled' : 'disabled'}.`,
      'Prerelease setting save failed',
      'Update Settings Save Failed'
    );
  }
  if (options.showStatus !== false) {
    setStatus(`Prerelease update checks ${workspace.settings.updates.includePrereleases ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

async function setSaveOnForceClose(saveOnForceClose, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.tabs.saveOnForceClose = saveOnForceClose === true;
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : `Save on force close ${workspace.settings.tabs.saveOnForceClose ? 'enabled' : 'disabled'}.`,
      'Force close setting save failed',
      'Force Close Settings Save Failed'
    );
  }
  if (options.showStatus !== false) {
    setStatus(`Save on force close ${workspace.settings.tabs.saveOnForceClose ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

function forceCloseSavesChanges() {
  ensureSettings();
  return workspace.settings.tabs.saveOnForceClose === true;
}

function cloneWorkspaceSettings() {
  if (typeof structuredClone === 'function') {
    return structuredClone(workspace.settings || {});
  }
  return JSON.parse(JSON.stringify(workspace.settings || {}));
}

async function saveWorkspaceSettingsWithRollback(previousSettings, successStatus, failureStatusPrefix, notificationTitle = 'Workspace Settings Save Failed', onRollback = null) {
  try {
    await saveWorkspace(false, { scope: 'settings', collectEditors: false });
    renderWorkspacePanel();
    if (successStatus) {
      setStatus(successStatus);
    }
    return true;
  } catch (error) {
    const message = error.message || String(error);
    workspace.settings = previousSettings;
    renderWorkspacePanel();
    if (typeof onRollback === 'function') {
      onRollback(error);
    }
    setStatus(`${failureStatusPrefix}: ${message}`);
    notifyUser(notificationTitle, message);
    return false;
  }
}

async function setTrustedScriptCapabilitiesFromInputs() {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
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
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    'Script sandbox capabilities updated.',
    'Script sandbox capability update failed',
    'Sandbox Capability Save Failed'
  );
}

async function setDiagnosticsSettingsFromInputs() {
  if (pendingDiagnosticsSettingsSave) {
    await pendingDiagnosticsSettingsSave;
  }
  const workspaceItem = activeWorkspaceItem();
  if (workspaceItem && workspaceItem.current !== true) {
    renderDiagnosticsPrivacyPanel();
    setStatus('Switch to this workspace before changing diagnostics privacy settings.');
    return false;
  }
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  const diagnostics = normalizeDiagnosticsSettings(workspace.settings.diagnostics);
  diagnostics.logging.enabled = $('diagnosticLoggingEnabledInput').checked === true;
  diagnostics.logging.level = RENDERER_DIAGNOSTIC_LOG_LEVELS.includes($('diagnosticLogLevelSelect').value)
    ? $('diagnosticLogLevelSelect').value
    : 'info';
  diagnostics.requestResponseLogging.urls = $('diagnosticLogUrlsInput').checked === true;
  diagnostics.requestResponseLogging.headers = $('diagnosticLogHeadersInput').checked === true;
  diagnostics.requestResponseLogging.cookies = $('diagnosticLogCookiesInput').checked === true;
  diagnostics.requestResponseLogging.bodies = $('diagnosticLogBodiesInput').checked === true;
  diagnostics.requestResponseLogging.protocolMessages = $('diagnosticLogProtocolMessagesInput').checked === true;
  diagnostics.requestResponseLogging.scriptConsole = $('diagnosticLogScriptConsoleInput').checked === true;
  diagnostics.requestResponseLogging.payloadIdentifiers = $('diagnosticLogPayloadIdentifiersInput').checked === true;
  workspace.settings.diagnostics = diagnostics;
  const savePromise = saveWorkspaceSettingsWithRollback(
    previousSettings,
    'Diagnostics privacy settings updated.',
    'Diagnostics privacy setting save failed',
    'Diagnostics Settings Save Failed'
  );
  pendingDiagnosticsSettingsSave = savePromise;
  renderDiagnosticsPrivacyPanel();
  try {
    return await savePromise;
  } finally {
    if (pendingDiagnosticsSettingsSave === savePromise) {
      pendingDiagnosticsSettingsSave = null;
      renderDiagnosticsPrivacyPanel();
    }
  }
}

async function promptTextInput(options = {}) {
  $('textInputModalTitle').textContent = String(options.title || 'Provide value');
  $('textInputModalMessage').textContent = String(options.message || 'Enter a value to continue.');
  $('textInputModalLabel').textContent = String(options.label || 'Value');
  const modal = $('textInputModal');
  const textarea = $('textInputModalInput');
  const singleLine = $('textInputModalSingleLineInput');
  const useSingleLine = options.singleLine === true || options.secret === true;
  const input = useSingleLine ? singleLine : textarea;
  const inactive = useSingleLine ? textarea : singleLine;
  modal.dataset.valueControl = input.id;
  input.hidden = false;
  inactive.hidden = true;
  input.value = String(options.defaultValue || '');
  inactive.value = '';
  if (singleLine) {
    singleLine.type = options.secret === true ? 'password' : 'text';
    singleLine.autocomplete = options.secret === true ? 'new-password' : 'off';
  }
  textarea.rows = options.multiline === true ? 10 : 3;
  input.setAttribute('aria-label', String(options.label || 'Value'));
  if (useSingleLine) {
    CodeEditor.refreshEditor?.(textarea);
  } else {
    textarea.dataset.codeEditor = 'true';
    CodeEditor.enhanceTextarea?.(textarea, { language: options.codeLanguage || 'text' });
    CodeEditor.setLanguage?.(textarea, options.codeLanguage || 'text');
  }
  const result = await showModal('textInputModal', null);
  return result == null ? null : String(result);
}

async function confirmActionModal(options = {}) {
  $('confirmActionModalTitle').textContent = String(options.title || 'Confirm action');
  $('confirmActionModalMessage').textContent = String(options.message || 'Continue?');
  const confirmButton = $('confirmActionButton');
  confirmButton.textContent = String(options.confirmLabel || 'Continue');
  confirmButton.classList.toggle('danger-button', options.danger === true);
  confirmButton.classList.toggle('primary', options.danger !== true);
  $('cancelConfirmActionButton').textContent = String(options.cancelLabel || 'Cancel');
  return await showModal('confirmActionModal', false) === true;
}

function showNotificationModal(title, message) {
  pendingNotificationModals.push({
    title: String(title || 'PostMeter'),
    message: String(message || '')
  });
  void flushNotificationModalQueue();
}

async function flushNotificationModalQueue() {
  if (notificationModalActive || state.activeModalResolver || !pendingNotificationModals.length) {
    return;
  }
  const notification = pendingNotificationModals.shift();
  notificationModalActive = true;
  $('notificationModalTitle').textContent = String(notification.title || 'PostMeter');
  $('notificationModalMessage').textContent = String(notification.message || '');
  try {
    await showModal('notificationModal', true);
  } finally {
    notificationModalActive = false;
    void flushNotificationModalQueue();
  }
}

async function addSandboxPackageFromPrompt(defaultSpecifier = '') {
  ensureSettings();
  const firstMissing = sandboxPackageStatusRows().find((item) => item.pinned && !item.cached)?.specifier || '';
  const specifier = String(await promptTextInput({
    title: 'Review sandbox package',
    message: 'Enter the imported package specifier to add to the reviewed sandbox cache.',
    label: 'Package specifier',
    defaultValue: defaultSpecifier || firstMissing || 'npm:package@1.0.0'
  }) || '').trim();
  if (!specifier) {
    return;
  }
  if (!SANDBOX_REVIEWED_PACKAGE_PATTERN.test(specifier)) {
    setStatus('Package review requires @team/package, npm:package[@version], npm:@scope/package[@version], or jsr:@scope/package[@version].');
    return;
  }
  const source = String(await promptTextInput({
    title: 'Review package source',
    message: `Paste reviewed source for ${specifier}. This source becomes available to imported scripts that require the package.`,
    label: 'Reviewed source',
    defaultValue: '',
    multiline: true,
    codeLanguage: 'javascript'
  }) || '');
  if (!source.trim()) {
    return;
  }
  const dependenciesText = String(await promptTextInput({
    title: 'Review package dependencies',
    message: 'Enter reviewed dependency specifiers, separated by commas.',
    label: 'Dependencies',
    defaultValue: ''
  }) || '');
  const dependencies = dependenciesText.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 32);
  const integrity = await sha256Integrity(source);
  const previousSettings = cloneWorkspaceSettings();
  const next = normalizeSandboxPackageCache([
    ...workspace.settings.sandbox.packageCache.filter((item) => item.specifier !== specifier),
    { dependencies, integrity, source, specifier }
  ]);
  workspace.settings.sandbox.packageCache = next;
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    `Reviewed package ${specifier} added to the sandbox cache.`,
    'Reviewed package save failed',
    'Sandbox Package Save Failed'
  );
}

async function fetchSandboxPackageFromPrompt(defaultSpecifier = '') {
  ensureSettings();
  const firstMissing = sandboxPackageStatusRows().find((item) => item.pinned && !item.cached)?.specifier || '';
  const specifier = String(await promptTextInput({
    title: 'Fetch package for review',
    message: 'Enter the package specifier to fetch into the reviewed sandbox cache.',
    label: 'Package specifier',
    defaultValue: defaultSpecifier || firstMissing || 'npm:package@1.0.0'
  }) || '').trim();
  if (!specifier) {
    return;
  }
  if (!SANDBOX_REVIEWED_PACKAGE_PATTERN.test(specifier)) {
    setStatus('Package fetch requires @team/package, npm:package[@version], npm:@scope/package[@version], or jsr:@scope/package[@version].');
    return;
  }
  const fetchOptions = {};
  if (specifier.startsWith('@')) {
    const sourceUrl = String(await promptTextInput({
      title: 'Package source URL',
      message: `Enter the maintainer-reviewed HTTPS source URL for ${specifier}.`,
      label: 'HTTPS source URL',
      defaultValue: ''
    }) || '').trim();
    if (!sourceUrl) {
      return;
    }
    fetchOptions.sourceUrl = sourceUrl;
  }
  const fetchPackage = window.__postmeterFetchSandboxPackage || window.postmeter?.sandboxPackages?.fetch;
  if (typeof fetchPackage !== 'function') {
    setStatus('Package fetch is not available in this runtime.');
    return;
  }
  setStatus(`Fetching ${specifier} for review...`);
  let fetched;
  try {
    fetched = await fetchPackage(specifier, fetchOptions);
  } catch (error) {
    setStatus(`Package fetch failed: ${error.message || String(error)}`);
    return;
  }
  const source = String(await promptTextInput({
    title: 'Review fetched package source',
    message: `Review or edit the fetched source for ${specifier} before it is cached.`,
    label: 'Reviewed source',
    defaultValue: fetched.source || '',
    multiline: true,
    codeLanguage: 'javascript'
  }) || '');
  if (!source.trim()) {
    setStatus(`Fetched package ${specifier} was not added.`);
    return;
  }
  const sourceChanged = source !== String(fetched.source || '');
  const dependencyDefault = Array.isArray(fetched.dependencies) ? fetched.dependencies.join(', ') : '';
  const dependenciesText = String(await promptTextInput({
    title: 'Review package dependencies',
    message: 'Confirm reviewed dependency specifiers, separated by commas.',
    label: 'Dependencies',
    defaultValue: dependencyDefault
  }) ?? dependencyDefault);
  const dependencies = dependenciesText.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 32);
  const integrity = sourceChanged ? await sha256Integrity(source) : fetched.integrity;
  const previousSettings = cloneWorkspaceSettings();
  const next = normalizeSandboxPackageCache([
    ...workspace.settings.sandbox.packageCache.filter((item) => item.specifier !== specifier),
    {
      dependencyAliases: sourceChanged ? {} : (fetched.dependencyAliases || {}),
      dependencies,
      entrypoint: fetched.entrypoint || '',
      fetchedAt: fetched.fetchedAt || '',
      files: sourceChanged ? [] : (fetched.files || []),
      integrity,
      maxExportKeys: fetched.maxExportKeys,
      packageDependencies: fetched.packageDependencies || [],
      packageIntegrity: sourceChanged ? '' : (fetched.packageIntegrity || ''),
      packageJson: sourceChanged ? {} : (fetched.packageJson || {}),
      packageName: fetched.packageName || '',
      packageVersion: fetched.packageVersion || '',
      registry: fetched.registry || '',
      reviewedAt: new Date().toISOString(),
      source,
      sourceUrl: fetched.sourceUrl || '',
      specifier
    }
  ]);
  workspace.settings.sandbox.packageCache = next;
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    `Fetched package ${specifier} added to the reviewed sandbox cache.`,
    'Fetched package save failed',
    'Sandbox Package Save Failed'
  );
}

async function sha256Integrity(source) {
  const bytes = new TextEncoder().encode(String(source || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const binary = String.fromCharCode(...new Uint8Array(digest));
  return `sha256-${btoa(binary)}`;
}

async function removeSandboxPackage(specifier) {
  ensureSettings();
  if (!(await confirmActionModal({
    title: 'Remove reviewed package?',
    message: `Remove reviewed package ${specifier} from the sandbox cache? Imported scripts that require it may fail until it is reviewed again.`,
    confirmLabel: 'Remove Package',
    danger: true
  }))) {
    setStatus('Reviewed package removal cancelled.');
    return;
  }
  const previousSettings = structuredClone(workspace.settings);
  workspace.settings.sandbox.packageCache = workspace.settings.sandbox.packageCache.filter((item) => item.specifier !== specifier);
  try {
    await saveWorkspace(false, { scope: 'settings' });
    renderWorkspacePanel();
    setStatus(`Reviewed package ${specifier} removed from the sandbox cache.`);
  } catch (error) {
    workspace.settings = previousSettings;
    renderWorkspacePanel();
    setStatus(`Reviewed package removal failed: ${error.message || String(error)}`);
  }
}

function refreshSandboxPackageStatus() {
  ensureSettings();
  renderWorkspacePanel();
  const statuses = sandboxPackageStatusRows();
  const missing = statuses.filter((item) => !item.cached || !item.pinned);
  setStatus(`${workspace.settings.sandbox.packageCache.length} reviewed package${workspace.settings.sandbox.packageCache.length === 1 ? '' : 's'} cached. ${missing.length} package reference${missing.length === 1 ? '' : 's'} need review.`);
}

async function bindSandboxFileFromPrompt(defaultSource = '') {
  ensureSettings();
  const firstMissing = sandboxFileBindingStatusRows().find((item) => !item.bound)?.source || '';
  const source = String(await promptTextInput({
    title: 'Bind imported file',
    message: 'Enter the imported Postman file reference that should be bound to a local file.',
    label: 'Imported file reference',
    defaultValue: defaultSource || firstMissing || ''
  }) || '').trim();
  if (!source) {
    return;
  }
  const reference = sandboxFileReferencesForWorkspace().find((item) => item.source === source) || { source, mode: 'file' };
  const localPath = String(await promptTextInput({
    title: 'Bind local file path',
    message: `Enter the local file path to use for "${source}". The file is only available to scripts through this reviewed binding.`,
    label: 'Local file path',
    defaultValue: ''
  }) || '').trim();
  if (!localPath) {
    return;
  }
  const previousSettings = cloneWorkspaceSettings();
  const next = normalizeSandboxFileBindings([
    ...workspace.settings.sandbox.fileBindings.filter((item) => item.source !== source),
    {
      contentType: reference.contentType || '',
      key: reference.key || '',
      localPath,
      mode: reference.mode || 'file',
      reviewedAt: new Date().toISOString(),
      source
    }
  ]);
  workspace.settings.sandbox.fileBindings = next;
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    `Imported file binding added for ${source}.`,
    'Imported file binding save failed',
    'Sandbox File Binding Save Failed'
  );
}

async function removeSandboxFileBinding(source) {
  ensureSettings();
  if (!(await confirmActionModal({
    title: 'Remove imported file binding?',
    message: `Remove imported file binding for ${source}? Scripts and requests that use this attachment will fail until it is bound again.`,
    confirmLabel: 'Remove Binding',
    danger: true
  }))) {
    setStatus('Imported file binding removal cancelled.');
    return;
  }
  const previousSettings = structuredClone(workspace.settings);
  workspace.settings.sandbox.fileBindings = workspace.settings.sandbox.fileBindings.filter((item) => item.source !== source);
  try {
    await saveWorkspace(false, { scope: 'settings' });
    renderWorkspacePanel();
    setStatus(`Imported file binding removed for ${source}.`);
  } catch (error) {
    workspace.settings = previousSettings;
    renderWorkspacePanel();
    setStatus(`Imported file binding removal failed: ${error.message || String(error)}`);
  }
}

function refreshSandboxFileBindings() {
  ensureSettings();
  renderWorkspacePanel();
  const statuses = sandboxFileBindingStatusRows();
  const bound = statuses.filter((item) => item.bound);
  const missing = statuses.filter((item) => !item.bound);
  setStatus(`${bound.length} imported file attachment${bound.length === 1 ? '' : 's'} bound. ${missing.length} attachment reference${missing.length === 1 ? '' : 's'} need local binding.`);
}

async function refreshVaultMetadata() {
  const vault = vaultApi();
  if (!vault?.metadata) {
    setStatus('Vault metadata is unavailable in this runtime.');
    return;
  }
  const metadataWorkspaceId = activeWorkspaceId || '';
  try {
    const metadata = await vault.metadata();
    if ((activeWorkspaceId || '') !== metadataWorkspaceId) {
      return;
    }
    lastVaultMetadata = metadata;
    lastVaultMetadataWorkspaceId = metadataWorkspaceId;
    renderWorkspacePanel();
    setStatus('Vault metadata refreshed.');
  } catch (error) {
    if ((activeWorkspaceId || '') !== metadataWorkspaceId) {
      return;
    }
    const message = error.message || String(error);
    setStatus(`Vault metadata refresh failed: ${message}`);
    notifyUser('Vault Metadata Failed', message);
  }
}

async function bindVaultSecretFromPrompt() {
  const vault = vaultApi();
  if (!vault?.bindSecret) {
    setStatus('Vault binding is unavailable in this runtime.');
    return;
  }
  const key = String(await promptTextInput({
    title: 'Bind vault secret',
    message: 'Enter the vault secret key to bind locally for this workspace.',
    label: 'Secret key',
    defaultValue: '',
    singleLine: true
  }) || '').trim();
  if (!key) {
    return;
  }
  const value = await promptTextInput({
    title: 'Bind vault secret value',
    message: `Enter the local value for vault secret "${key}". The value is sent only to the parent-side encrypted vault binding operation.`,
    label: 'Secret value',
    defaultValue: '',
    secret: true
  });
  if (value == null) {
    return;
  }
  try {
    await vault.bindSecret(key, value);
    await refreshVaultMetadata();
    setStatus(`Vault secret ${key} bound locally.`);
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault secret binding failed: ${message}`);
    notifyUser('Vault Binding Failed', message);
  }
}

async function unsetVaultSecret(key) {
  const vault = vaultApi();
  if (!vault?.unsetSecret) {
    setStatus('Vault secret removal is unavailable in this runtime.');
    return;
  }
  if (!(await confirmActionModal({
    title: 'Remove vault secret?',
    message: `Remove vault secret "${key}" from this workspace?`,
    confirmLabel: 'Remove Secret',
    danger: true
  }))) {
    return;
  }
  try {
    await vault.unsetSecret(key);
    await refreshVaultMetadata();
    setStatus(`Vault secret ${key} removed.`);
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault secret removal failed: ${message}`);
    notifyUser('Vault Removal Failed', message);
  }
}

async function resetVaultFromWorkspacePanel() {
  const vault = vaultApi();
  if (!vault?.reset) {
    setStatus('Vault reset is unavailable in this runtime.');
    return;
  }
  if (!(await confirmActionModal({
    title: 'Reset vault?',
    message: 'Reset the local encrypted vault for this workspace? This removes stored local secret bindings.',
    confirmLabel: 'Reset Vault',
    danger: true
  }))) {
    return;
  }
  try {
    await vault.reset();
    lastVaultMetadata = { audit: [], available: true, secrets: [] };
    lastVaultMetadataWorkspaceId = activeWorkspaceId || '';
    renderWorkspacePanel();
    setStatus('Vault reset.');
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault reset failed: ${message}`);
    notifyUser('Vault Reset Failed', message);
  }
}

function vaultApi() {
  return window.__postmeterVault || window.postmeter?.vault || {};
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
  const button = treeButton(environment.name || 'Untitled Environment', environment.id === activeEnvironmentId, 'ENV', {
    treeKind: 'environment',
    treeId: environment.id
  });
  button.addEventListener('click', () => {
    if (!canOpenEnvironmentTabFor(environment.id)) {
      return;
    }
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
  const button = treeButton(workspaceItem.name, activeMainPanel === 'workspace' && workspaceItem.id === selectedWorkspaceId, 'WRK', {
    treeKind: 'workspace',
    treeId: workspaceItem.id
  });
  button.addEventListener('click', () => {
    selectWorkspaceItem(workspaceItem.id);
  });
  const menuItems = [
    ['View Details', () => { selectWorkspaceItem(workspaceItem.id); }],
    ['Rename', () => { renameWorkspace(workspaceItem.id); }]
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
  const title = $('workspaceMainTitle');
  if (title.dataset.editing !== 'true') {
    title.textContent = workspaceItem ? workspaceDisplayName(workspaceItem) : 'Select a workspace';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  title.tabIndex = workspaceItem ? 0 : -1;
  title.setAttribute('aria-disabled', workspaceItem ? 'false' : 'true');
  title.setAttribute('aria-label', 'Workspace name');
  $('switchWorkspacePanelButton').disabled = !workspaceItem || workspaceItem.current === true;
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
  renderDiagnosticsPrivacyPanel();
  renderVaultMetadataPanel();
  renderSandboxPackageCachePanel();
  renderSandboxFileBindingsPanel();
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
      summary.textContent = 'Local diagnostics are user-exported only. Request and response details are not logged unless enabled below.';
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
  return String(request?.name || '').trim() || 'Untitled Request';
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
  const button = treeButton(collection.name, collection.id === activeCollectionId && !activeRequestId, 'COL', {
    treeKind: 'collection',
    treeId: collection.id
  });
  button.addEventListener('click', () => {
    const firstRequest = firstRequestInCollection(collection);
    if (firstRequest?.request && !canOpenRequestTabFor(collection.id, firstRequest.request.id)) {
      return;
    }
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
  const button = treeButton(folder.name, folder.id === activeFolderId && !activeRequestId, 'DIR', {
    treeKind: 'folder',
    treeId: folder.id
  });
  button.addEventListener('click', () => {
    const firstRequest = firstRequestInFolder(folder);
    if (firstRequest?.request && !canOpenRequestTabFor(collection.id, firstRequest.request.id)) {
      return;
    }
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
  const button = treeButton(request.name, request.id === activeRequestId, request.method, {
    treeKind: 'request',
    treeId: request.id
  });
  button.addEventListener('click', () => {
    if (!canOpenRequestTabFor(collection.id, request.id)) {
      return;
    }
    collectActiveEditorState();
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
    ['Delete', () => deleteRequest(collection, folder, request), 'danger']
  ]);
  wrapper.append(button);
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
  badge.className = `tree-badge ${methodClassName(kind)}`;
  badge.textContent = kind;
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = text;
  button.append(badge, label);
  return button;
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
  return activeEnvironmentId && activeEnvironmentId !== 'none'
    ? [treeFocusTarget('environment', activeEnvironmentId)]
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

function updateMethodSelectClass() {
  const select = $('methodSelect');
  if (!select) {
    return;
  }
  for (const method of METHODS) {
    select.classList.toggle(`method-${method.toLowerCase()}`, select.value === method);
  }
}

function updateRequestEditorLanguages() {
  updateRequestBodyEditorLanguage();
  CodeEditor.setLanguage?.($('preRequestScriptInput'), 'javascript');
  CodeEditor.setLanguage?.($('testScriptInput'), 'javascript');
}

function updateRequestBodyEditorLanguage() {
  const bodyType = $('bodyTypeSelect')?.value || 'NONE';
  CodeEditor.setLanguage?.($('bodyInput'), bodyType === 'RAW_JSON' ? 'json' : 'text');
}

function renderRequestEditor() {
  resetRequestEditorTransientStateOnContextChange();
  const request = activeRequest();
  if (!request) {
    renderRequestTitle(null);
    $('saveRequestButton').disabled = true;
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
    updateRequestEditorLanguages();
    return;
  }
  $('saveRequestButton').disabled = false;
  $('addRequestVariableButton').disabled = false;
  $('addExampleButton').disabled = false;
  $('captureResponseExampleButton').disabled = !canCaptureResponseExampleForRequest(request);
  $('exportExamplesButton').disabled = !(request.examples || []).length;
  renderRequestTitle(request);
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
  updateRequestEditorLanguages();
}

function renderRequestTitle(request) {
  const title = $('requestNameTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    title.textContent = request ? requestDisplayName(request) : 'Select a request';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  title.tabIndex = request ? 0 : -1;
  title.setAttribute('aria-disabled', request ? 'false' : 'true');
  title.setAttribute('aria-label', 'Request name');
}

function renderExamples(examples) {
  renderRequestExamples(examples, {
    doc: document,
    bodyTypes: BODY_TYPES,
    onDirty: markActiveRequestDirty,
    onDuplicate: duplicateExample,
    onDelete: deleteExample
  });
  CodeEditor.enhanceCodeTextareas?.($('examplesList'));
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
  const title = $('environmentMainTitle');
  if (title.dataset.editing !== 'true') {
    title.textContent = environment?.name || 'Select an environment';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  title.tabIndex = environment ? 0 : -1;
  title.setAttribute('aria-disabled', environment ? 'false' : 'true');
  title.setAttribute('aria-label', 'Environment name');
  $('saveEnvironmentButton').disabled = !environment;
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

function resetRequestEditorTransientStateOnContextChange() {
  const contextKey = `${activeCollectionId || 'draft'}:${activeRequestId || ''}`;
  if (contextKey === lastRenderedRequestEditorContextKey) {
    return;
  }
  lastRenderedRequestEditorContextKey = contextKey;
  if (activeOauthFlowId) {
    return;
  }
  $('validationLabel').textContent = '';
  resetOauthProgressPanel();
}

function resetOauthProgressPanel() {
  const panel = $('oauthProgressPanel');
  if (!panel) {
    return;
  }
  panel.hidden = true;
  $('oauthProgressStatus').textContent = 'Idle';
  $('oauthProgressDetail').textContent = '';
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
    const rowNumber = index + 1;
    const variableName = String(pair.key || '').trim();
    const variableLabel = variableName || String(rowNumber);
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = pair.enabled !== false;
    enabled.setAttribute('aria-label', `Environment variable ${rowNumber} enabled`);
    enabled.addEventListener('change', () => {
      pair.enabled = enabled.checked;
      markActiveEnvironmentDirty();
      renderVariablePreview();
    });
    const key = document.createElement('input');
    key.placeholder = 'Variable';
    key.value = pair.key || '';
    key.setAttribute('aria-label', `Environment variable ${rowNumber} name`);
    key.addEventListener('input', () => {
      pair.key = key.value;
      markActiveEnvironmentDirty();
      renderVariablePreview();
    });
    const value = document.createElement('input');
    value.placeholder = 'Value';
    value.type = 'text';
    value.value = pair.value || '';
    value.setAttribute('aria-label', `Environment variable ${rowNumber} value`);
    value.addEventListener('input', () => {
      pair.value = value.value;
      markActiveEnvironmentDirty();
      renderVariablePreview();
    });
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove environment variable ${variableLabel}`);
    remove.addEventListener('click', () => {
      pairs.splice(index, 1);
      markActiveEnvironmentDirty();
      renderEnvironmentEditor();
    });
    row.append(enabled, key, value, remove);
    container.append(row);
  });
}

function normalizeHistoryRequestMethod(item) {
  return METHODS.includes(item?.method) ? item.method : 'GET';
}

function historyRequestName(item) {
  const method = normalizeHistoryRequestMethod(item);
  const url = String(item?.url || '').trim();
  return url ? `${method} ${url}` : `${method} History Request`;
}

function openHistoryItemAsDraftRequest(item) {
  if (!canOpenAdditionalRequestTab()) {
    return null;
  }
  collectActiveEditorState();
  const method = normalizeHistoryRequestMethod(item);
  const url = String(item?.url || '');
  const draftRequest = newRequestObject(uniqueName(
    historyRequestName(item),
    Array.from(draftRequests.values()).map((request) => request.name)
  ));
  draftRequest.method = method;
  draftRequest.url = url;
  draftRequests.set(draftRequest.id, draftRequest);
  activeMainPanel = 'request';
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = draftRequest.id;
  ensureOpenRequestTabForActive();
  renderAll();
  setStatus('Opened history entry as an unsaved request.');
  return draftRequest;
}

function renderHistory() {
  const container = $('historyList');
  container.textContent = '';
  for (const item of workspace.history || []) {
    const button = document.createElement('button');
    button.className = 'history-item';
    button.textContent = `${item.method} ${item.statusCode || 'ERR'} ${item.url}`;
    button.addEventListener('click', () => {
      openHistoryItemAsDraftRequest(item);
    });
    container.append(button);
  }
}

async function clearHistory() {
  if (!(await confirmActionModal({
    title: 'Clear history?',
    message: 'Clearing the history cannot be undone. Do you want to proceed?',
    confirmLabel: 'Clear History',
    danger: true
  }))) {
    return false;
  }
  workspace.history = [];
  renderHistory();
  renderWorkspacePanel();
  setStatus('History cleared.');
  return true;
}

async function sendActiveRequest() {
  return rendererWorkflows.sendActiveRequest();
}

function displayResponse(response) {
  $('responseStatus').textContent = response.skipped === true ? 'SKIP' : response.statusCode || 'ERR';
  $('responseTime').textContent = `${response.durationMillis} ms`;
  $('responseSize').textContent = formatBytes(response.responseBytes);
  $('finalUrl').textContent = response.finalUrl;
  $('responseHeaders').value = Object.entries(response.headers || {})
    .map(([key, values]) => `${key}: ${values.join(', ')}`)
    .join('\n');
  $('responseBody').value = PostMeterResponseFormatting.formatBody(response);
  CodeEditor.setLanguage?.($('responseHeaders'), 'headers');
  CodeEditor.setLanguage?.($('responseBody'), responseBodyCodeLanguage(response, $('responseBody').value));
  displayTestResults(response);
  displayVisualizer(response.testScriptResult?.visualizer);
}

function responseBodyCodeLanguage(response, formattedBody = '') {
  const body = String(formattedBody || response?.body || '').trim();
  const contentType = Object.entries(response?.headers || {})
    .find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.join(',').toLowerCase() || '';
  if (contentType.includes('json') || body.startsWith('{') || body.startsWith('[')) {
    return 'json';
  }
  if (contentType.includes('html') || contentType.includes('xml') || body.startsWith('<')) {
    return 'markup';
  }
  return 'text';
}

function displayTestResults(response) {
  const summary = $('testResultsSummary');
  if (!summary) {
    return;
  }
  const hasResponse = response && typeof response === 'object';
  const preRequestResult = normalizeScriptResult(response?.preRequestScriptResult);
  const postRequestResult = normalizeScriptResult(response?.testScriptResult);
  const preRequestStats = renderScriptResultColumn('preRequest', preRequestResult, hasResponse ? 'No tests recorded.' : 'No test results yet.');
  const postRequestStats = renderScriptResultColumn('postRequest', postRequestResult, hasResponse ? 'No tests recorded.' : 'No test results yet.');
  const total = preRequestStats.total + postRequestStats.total;
  const passed = preRequestStats.passed + postRequestStats.passed;
  const failed = preRequestStats.failed + postRequestStats.failed;
  const skipped = preRequestStats.skipped + postRequestStats.skipped;
  const tabCount = $('testResultsTabCount');

  if (tabCount) {
    tabCount.textContent = total ? `(${passed}/${total})` : '';
    tabCount.hidden = total === 0;
  }
  if (!hasResponse) {
    summary.textContent = 'No test results yet.';
    return;
  }
  if (!total) {
    summary.textContent = 'No tests recorded for this response.';
    return;
  }
  summary.textContent = testResultSummaryText({ total, passed, failed, skipped });
}

function normalizeScriptResult(result) {
  return result && typeof result === 'object' ? result : null;
}

function renderScriptResultColumn(prefix, scriptResult, emptyText) {
  const list = $(`${prefix}TestResults`);
  const summary = $(`${prefix}ResultsSummary`);
  const stats = scriptResultStats(scriptResult);
  if (!list || !summary) {
    return stats;
  }
  list.textContent = '';
  summary.textContent = stats.total ? testResultSummaryText(stats) : 'No tests';

  if (!scriptResult) {
    appendEmptyTestResult(list, emptyText);
    return stats;
  }

  const topLevelError = scriptResultTopLevelError(scriptResult);
  if (topLevelError) {
    appendTestResultRow(list, {
      status: 'error',
      name: 'Script error',
      detail: topLevelError
    });
  }

  for (const test of Array.isArray(scriptResult.tests) ? scriptResult.tests : []) {
    appendTestResultRow(list, {
      status: scriptTestStatus(test),
      name: String(test?.name || 'Unnamed test'),
      detail: String(test?.error || '')
    });
  }

  const logs = Array.isArray(scriptResult.logs) ? scriptResult.logs : [];
  for (const log of logs) {
    appendTestResultRow(list, {
      status: 'log',
      name: 'Console',
      detail: String(log || '')
    });
  }

  if (!list.children.length) {
    appendEmptyTestResult(list, emptyText);
  }
  return stats;
}

function scriptResultStats(scriptResult) {
  if (!scriptResult) {
    return { total: 0, passed: 0, failed: 0, skipped: 0 };
  }
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const tests = Array.isArray(scriptResult.tests) ? scriptResult.tests : [];
  for (const test of tests) {
    if (test?.skipped === true) {
      skipped += 1;
    } else if (test?.passed === true) {
      passed += 1;
    } else {
      failed += 1;
    }
  }
  const topLevelErrorCount = scriptResultTopLevelError(scriptResult) ? 1 : 0;
  return {
    total: tests.length + topLevelErrorCount,
    passed,
    failed: failed + topLevelErrorCount,
    skipped
  };
}

function scriptResultTopLevelError(scriptResult) {
  const explicitError = String(scriptResult?.error || '').trim();
  if (explicitError) {
    return explicitError;
  }
  const tests = Array.isArray(scriptResult?.tests) ? scriptResult.tests : [];
  const hasFailedTest = tests.some((test) => test?.skipped !== true && test?.passed !== true);
  if (scriptResult?.passed === false && !hasFailedTest) {
    return 'Script failed.';
  }
  return '';
}

function scriptTestStatus(test) {
  if (test?.skipped === true) {
    return 'skipped';
  }
  return test?.passed === true ? 'passed' : 'failed';
}

function testResultSummaryText(stats) {
  const parts = [`${stats.passed}/${stats.total} passed`];
  if (stats.failed) {
    parts.push(`${stats.failed} ${plural(stats.failed, 'failed test', 'failed tests')}`);
  }
  if (stats.skipped) {
    parts.push(`${stats.skipped} ${plural(stats.skipped, 'skipped test', 'skipped tests')}`);
  }
  return parts.join(', ');
}

function appendTestResultRow(list, result) {
  const row = document.createElement('div');
  row.className = 'test-result-row';
  const badge = document.createElement('span');
  badge.className = `test-result-badge ${result.status}`;
  badge.textContent = testResultStatusLabel(result.status);
  const content = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'test-result-name';
  name.textContent = result.name;
  content.append(name);
  if (result.detail) {
    const detail = document.createElement('div');
    detail.className = result.status === 'log' ? 'test-result-log' : 'test-result-error';
    detail.textContent = result.detail;
    content.append(detail);
  }
  row.append(badge, content);
  list.append(row);
}

function appendEmptyTestResult(list, message) {
  const empty = document.createElement('p');
  empty.className = 'test-result-empty';
  empty.textContent = message;
  list.append(empty);
}

function testResultStatusLabel(status) {
  if (status === 'passed') {
    return 'PASSED';
  }
  if (status === 'skipped') {
    return 'SKIPPED';
  }
  if (status === 'error') {
    return 'ERROR';
  }
  if (status === 'log') {
    return 'LOG';
  }
  return 'FAILED';
}

function plural(count, singular, pluralValue) {
  return count === 1 ? singular : pluralValue;
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

async function saveRequestFromPane() {
  if (!activeRequest()) {
    setStatus('Select a request before saving.');
    return false;
  }
  try {
    const saved = await saveWorkspace(true, { promptForDraft: true });
    if (saved) {
      setStatus('Request saved.');
    }
    return saved;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Request save failed: ${message}`);
    notifyUser('Request Save Failed', message);
    return false;
  }
}

async function saveEnvironmentFromPane() {
  if (!activeEnvironment()) {
    setStatus('Select an environment before saving.');
    return false;
  }
  try {
    const saved = await saveWorkspace(true);
    if (saved) {
      setStatus('Environment saved.');
    }
    return saved;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Environment save failed: ${message}`);
    notifyUser('Environment Save Failed', message);
    return false;
  }
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
  return rendererWorkflows.exportWorkspace();
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
  if (!canOpenAdditionalRequestTab()) {
    return null;
  }
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
  if (!canOpenAdditionalEnvironmentTab()) {
    return null;
  }
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

async function deleteEnvironment(environment = activeEnvironment()) {
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
  if (activeEnvironmentId === environment.id) {
    activeEnvironmentId = workspace.environments[0]?.id || 'none';
  }
  activeSidebarPanel = 'environments';
  activeMainPanel = 'environment';
  ensureOpenEnvironmentTabForActive();
  renderAll();
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
    activeEnvironmentId = environment.id;
    activeSidebarPanel = 'environments';
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive({ dirty: true });
    renderAll();
    restoreTreeFocus(treeFocusTarget('environment', environment.id), activeEnvironmentTreeFocusTargets());
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
  try {
    const exportExamplesBoundary = window.__postmeterExportExamples || window.postmeter.request.exportExamples;
    const result = await exportExamplesBoundary(request);
    if (!result.cancelled) {
      setStatus(`Examples exported to ${result.path}.`);
    }
  } catch (error) {
    const message = error.message || String(error);
    setStatus('Example export failed.');
    notifyUser('Example Export Failed', message);
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

async function deleteExample(index) {
  const request = activeRequest();
  if (!request?.examples?.[index] || !(await confirmActionModal({
    title: 'Delete example?',
    message: `Delete ${request.examples[index].name || 'example'}?`,
    confirmLabel: 'Delete Example',
    danger: true
  }))) {
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

function collectRequestFromEditor() {
  const request = activeRequest();
  if (!request) {
    return;
  }
  collectRequestNameFromTitle({ render: false });
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

function collectRequestNameFromTitle(options = {}) {
  const request = activeRequest();
  if (!request) {
    return false;
  }
  const nextName = requestTitleInputValue() || 'Untitled Request';
  const changed = request.name !== nextName;
  request.name = nextName;
  if (changed && options.markDirty === true) {
    markActiveRequestDirty();
  }
  if (options.render !== false && changed) {
    renderCollections();
    renderRequestTabs();
  }
  const title = $('requestNameTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = requestDisplayName(request);
  }
  return changed;
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
    const title = $('environmentMainTitle');
    environment.name = environmentTitleInputValue() || 'Untitled Environment';
    if (title.dataset.editing !== 'true') {
      title.textContent = environment.name;
    }
    renderEnvironmentSelect();
    renderEnvironments();
    renderWorkspacePanel();
  }
}

function environmentTitleInputValue() {
  return String($('environmentMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function workspaceTitleInputValue() {
  return String($('workspaceMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function requestTitleInputValue() {
  return String($('requestNameTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
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
      const isActive = button.dataset.tab === tabName;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
    }
  }
  for (const panelId of panelIds) {
    const panel = $(panelId);
    const isActive = panel.id === `${tabName}Tab`;
    panel.classList.toggle('active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
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
  void showNotificationModal(notification.title, notification.message);
}

function isAutomatedUiSmoke() {
  const params = new URLSearchParams(window.location.search);
  return params.get('uiWorkflowSmoke') === '1'
    || params.get('uiRegressionSmoke') === '1'
    || params.get('uiSnapshotSmoke') === '1'
    || params.get('uiOauthSmoke') === '1';
}
