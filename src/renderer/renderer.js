const BODY_TYPES = [
  'NONE',
  'RAW_JSON',
  'RAW_TEXT',
  'RAW_JAVASCRIPT',
  'RAW_HTML',
  'RAW_XML',
  'FORM_DATA',
  'URLENCODED',
  'BINARY'
];
const EXAMPLE_BODY_TYPES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];
const BODY_MODES = ['NONE', 'FORM_DATA', 'URLENCODED', 'RAW', 'BINARY', 'GRAPHQL'];
const RAW_BODY_FORMATS = ['text', 'javascript', 'json', 'html', 'xml'];
const RAW_FORMAT_BODY_TYPES = {
  text: 'RAW_TEXT',
  javascript: 'RAW_JAVASCRIPT',
  json: 'RAW_JSON',
  html: 'RAW_HTML',
  xml: 'RAW_XML'
};
const BODY_TYPE_RAW_FORMATS = Object.fromEntries(Object.entries(RAW_FORMAT_BODY_TYPES).map(([format, type]) => [type, format]));
const FILE_EXTENSION_CONTENT_TYPES = new Map(Object.entries({
  '.avif': 'image/avif',
  '.bin': 'application/octet-stream',
  '.bmp': 'image/bmp',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.mjs': 'application/javascript',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tar': 'application/x-tar',
  '.text': 'text/plain',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.zip': 'application/zip'
}));
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const THEME_OPTIONS = ['system', 'light', 'dark'];
const EXECUTION_RESULT_PAGE_SIZE = 100;
const POSTMETER_USER_AGENT = 'PostMeter/0.2.0';
const BODY_METHOD_SET = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTO_HEADER_PLACEHOLDER = '<calculated when request is sent>';
const {
  enabledQueryParams: enabledEditorQueryParams,
  queryParamsFromUrl: queryParamsFromEditorUrl,
  splitUrlQuery: splitEditorUrlQuery,
  urlWithQueryParams: editorUrlWithQueryParams
} = PostMeterRequestQueryModel;
const RENDERER_STATE_DEFAULTS = PostMeterRendererState.createRendererState();
const TAB_PANEL_IDS = {
  request: ['paramsTab', 'headersTab', 'authTab', 'cookiesTab', 'bodyTab', 'testsTab', 'scriptsTab', 'examplesTab', 'collectionVariablesTab'],
  results: ['responseTab', 'responseHeadersTab', 'responseCookiesTab', 'testResultsTab', 'visualizerTab'],
  performanceRequest: ['performanceParamsTab', 'performanceHeadersTab', 'performanceAuthTab', 'performanceCookiesTab', 'performanceBodyTab', 'performanceTestsTab', 'performanceScriptsTab', 'performanceExamplesTab', 'performanceVariablesTab'],
  performance: ['latencyTab', 'throughputTab', 'concurrencyTab', 'stressTab', 'spikeTab', 'soakTab', 'rampTab'],
  performanceOutput: ['performanceOutputResultsTab', 'performanceOutputRequestsTab', 'performanceOutputGraphsTab']
};

let workspace = RENDERER_STATE_DEFAULTS.workspace;
let workspacePath = RENDERER_STATE_DEFAULTS.workspacePath;
let workspaces = RENDERER_STATE_DEFAULTS.workspaces;
let selectedWorkspaceId = RENDERER_STATE_DEFAULTS.selectedWorkspaceId;
let activeCollectionId = RENDERER_STATE_DEFAULTS.activeCollectionId;
let activeFolderId = RENDERER_STATE_DEFAULTS.activeFolderId;
let activeRequestId = RENDERER_STATE_DEFAULTS.activeRequestId;
let activeRunnerRequestRunnerId = RENDERER_STATE_DEFAULTS.activeRunnerRequestRunnerId;
let activeRunnerConfigId = RENDERER_STATE_DEFAULTS.activeRunnerConfigId;
let activePerformanceTestId = RENDERER_STATE_DEFAULTS.activePerformanceTestId;
let activeEnvironmentId = RENDERER_STATE_DEFAULTS.activeEnvironmentId;
let activeWorkspaceId = RENDERER_STATE_DEFAULTS.activeWorkspaceId;
let activeSidebarPanel = RENDERER_STATE_DEFAULTS.activeSidebarPanel;
let activeMainPanel = RENDERER_STATE_DEFAULTS.activeMainPanel;
let draftRequests = RENDERER_STATE_DEFAULTS.draftRequests;
let openRequestTabs = RENDERER_STATE_DEFAULTS.openRequestTabs;
let openEnvironmentTabs = RENDERER_STATE_DEFAULTS.openEnvironmentTabs;
let openWorkspaceTabs = RENDERER_STATE_DEFAULTS.openWorkspaceTabs;
let openRunnerTabs = RENDERER_STATE_DEFAULTS.openRunnerTabs;
let openPerformanceTabs = RENDERER_STATE_DEFAULTS.openPerformanceTabs;
let collectionDirtySnapshots = RENDERER_STATE_DEFAULTS.collectionDirtySnapshots;
let collectionDirtyOwners = RENDERER_STATE_DEFAULTS.collectionDirtyOwners;
let cookieJarDirtySnapshot = RENDERER_STATE_DEFAULTS.cookieJarDirtySnapshot;
let cookieJarDirtyOwner = RENDERER_STATE_DEFAULTS.cookieJarDirtyOwner;
let activeOauthFlowId = RENDERER_STATE_DEFAULTS.activeOauthFlowId;
let activeRunnerId = RENDERER_STATE_DEFAULTS.activeRunnerId;
let lastRunnerResult = RENDERER_STATE_DEFAULTS.lastRunnerResult;
let activePerformanceRunId = null;
let activePerformanceCalibrationId = null;
let lastPerformanceResult = null;
let selectedRunnerExecutionIndex = 0;
let selectedPerformanceResultIndex = 0;
let runnerExecutionPage = 0;
let performanceExecutionPage = 0;
let runnerExecutionStatusFilter = 'all';
let performanceExecutionStatusFilter = 'all';
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
let selectedExportItemId = RENDERER_STATE_DEFAULTS.selectedExportItemId;
let selectedFolderDestinationValue = '';
let selectedRunnerImportTarget = [];
let expandedRunnerImportCollectionIds = [];
let lastRunnerImportSelectionKey = '';
let selectedRequestExportTarget = null;
let expandedRequestExportCollectionIds = [];
let selectedRequestImportFilePath = '';
let selectedRequestImportFileName = '';
let activeRequestExportContent = '';
let activeVaultPromptPayload = null;
let activeFileSourceTarget = null;
let activeFilePickerOptions = null;
let sessionSaveTimer = null;
let sessionPersistenceEnabled = false;
let lastRenderedRequestEditorContextKey = '';
let lastModalFocusTarget = null;
let notificationModalActive = false;
let requestTitleEditOriginal = '';
let environmentTitleEditOriginal = '';
let workspaceTitleEditOriginal = '';
let runnerTitleEditOriginal = '';
let performanceTitleEditOriginal = '';
let pendingDiagnosticsSettingsSave = null;
let sidebarTreeDragPayload = null;
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
  PERFORMANCE_TEST_TYPES: RENDERER_PERFORMANCE_TEST_TYPES,
  MAX_SAFETY_LIMITS: PERFORMANCE_MAX_SAFETY_LIMITS,
  cloneRequestForPerformanceTest,
  newPerformanceTestObject,
  normalizePerformanceTest,
  normalizePerformanceTypeSettings,
  normalizeWorkspacePerformanceTests,
  performanceTestSnapshot: snapshotPerformanceTest,
  syncPerformanceActiveTypeSettings
} = PostMeterPerformanceTestModel;
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
const VariableHighlighter = window.PostMeterVariableHighlighter || {};
const {
  activeEnvironmentTabKey: buildActiveEnvironmentTabKey,
  activePerformanceTabKey: buildActivePerformanceTabKey,
  activeRequestTabKey: buildActiveRequestTabKey,
  activeRunnerTabKey: buildActiveRunnerTabKey,
  activeWorkspaceTabKey: buildActiveWorkspaceTabKey,
  clearSavedEnvironmentDirtyState: clearRendererSavedEnvironmentDirtyState,
  clearSavedPerformanceDirtyState: clearRendererSavedPerformanceDirtyState,
  clearSavedRunnerDirtyState: clearRendererSavedRunnerDirtyState,
  clearSharedRequestDirtyState: clearRendererSharedRequestDirtyState,
  clearSavedRequestDirtyState: clearRendererSavedRequestDirtyState,
  isActiveEnvironmentTab: isRendererActiveEnvironmentTab,
  isActivePerformanceTab: isRendererActivePerformanceTab,
  isActiveRequestTab: isRendererActiveRequestTab,
  isActiveRunnerTab: isRendererActiveRunnerTab,
  isActiveWorkspaceTab: isRendererActiveWorkspaceTab,
  openModalState,
  performanceTestSnapshot: snapshotPerformanceTab,
  requestSnapshot: snapshotRequest,
  runnerSnapshot: snapshotRunner,
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
  get activeRunnerRequestRunnerId() { return activeRunnerRequestRunnerId; },
  set activeRunnerRequestRunnerId(value) { activeRunnerRequestRunnerId = value; },
  get activeRunnerConfigId() { return activeRunnerConfigId; },
  set activeRunnerConfigId(value) { activeRunnerConfigId = value; },
  get activePerformanceTestId() { return activePerformanceTestId; },
  set activePerformanceTestId(value) { activePerformanceTestId = value; },
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
  get openRunnerTabs() { return openRunnerTabs; },
  set openRunnerTabs(value) { openRunnerTabs = value; },
  get openPerformanceTabs() { return openPerformanceTabs; },
  set openPerformanceTabs(value) { openPerformanceTabs = value; },
  get collectionDirtySnapshots() { return collectionDirtySnapshots; },
  set collectionDirtySnapshots(value) { collectionDirtySnapshots = value; },
  get collectionDirtyOwners() { return collectionDirtyOwners; },
  set collectionDirtyOwners(value) { collectionDirtyOwners = value; },
  get cookieJarDirtySnapshot() { return cookieJarDirtySnapshot; },
  set cookieJarDirtySnapshot(value) { cookieJarDirtySnapshot = value; },
  get cookieJarDirtyOwner() { return cookieJarDirtyOwner; },
  set cookieJarDirtyOwner(value) { cookieJarDirtyOwner = value; },
  get activeOauthFlowId() { return activeOauthFlowId; },
  set activeOauthFlowId(value) { activeOauthFlowId = value; },
  get activeRunnerId() { return activeRunnerId; },
  set activeRunnerId(value) { activeRunnerId = value; },
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
  get selectedExportItemId() { return selectedExportItemId; },
  set selectedExportItemId(value) { selectedExportItemId = value; },
  get maxOpenRequestTabs() { return RENDERER_STATE_DEFAULTS.maxOpenRequestTabs; }
};

const requestTabState = createRequestTabState({
  state,
  activeCollection,
  activeEnvironment,
  activeRequest,
  activeRunner,
  activePerformanceTest,
  activeWorkspaceItem,
  clearActiveWorkspaceItem,
  collectEnvironmentFromEditor,
  collectRequestFromEditor,
  collectRunnerFromEditor,
  collectPerformanceTestFromEditor,
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
  selectRunnerTab: (tab) => selectRunnerTabWithoutCollect(tab),
  selectPerformanceTab: (tab) => selectPerformanceTabWithoutCollect(tab),
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
    markUiWorkflowStartupStep('ready-start');
    bindUi();
    CodeEditor.enhanceCodeTextareas?.(document);
    registerCleanup(VariableHighlighter.install?.(document, {
      getVariables: variableHighlightVariablesForTarget,
      windowObject: window
    })?.destroy);
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
    registerCleanup(window.postmeter.oauth.onProgress((progress) => {
      if (progress.id === activeOauthFlowId) {
        renderOauthProgress(progress);
      }
    }));
    registerCleanup(window.postmeter.runner.onProgress(({ id, progress }) => {
      if (id === activeRunnerId) {
        renderRunnerExecutionProgress(progress);
      }
    }));
    if (window.postmeter.performance?.onProgress) {
      registerCleanup(window.postmeter.performance.onProgress(({ id, progress }) => {
        if (id === activePerformanceCalibrationId && progress?.kind === 'calibration') {
          renderPerformanceCalibrationProgress(progress);
        } else if (id === activePerformanceRunId) {
          renderPerformanceProgress(progress);
        }
      }));
    }
    if (window.postmeter.vault?.onPrompt) {
      registerCleanup(window.postmeter.vault.onPrompt((payload) => {
        void handleVaultPrompt(payload).catch(() => {});
      }));
    }

    markUiWorkflowStartupStep('before-workspace-load');
    const loaded = await window.postmeter.workspace.load();
    markUiWorkflowStartupStep('after-workspace-load');
    applyLoadedWorkspace(loaded, { focus: 'request', render: false });
    markUiWorkflowStartupStep('before-session-load');
    const session = await window.postmeter.session.load();
    markUiWorkflowStartupStep('after-session-load');
    const restoredTabs = restoreSessionState(session);
    renderAll();
    activateTab('request', restoredTabs.activeRequestTab);
    activateTab('results', restoredTabs.activeResultsTab);
    sessionPersistenceEnabled = true;
    scheduleSessionSave({ immediate: true });
    markUiWorkflowStartupStep('before-smoke-queue');
    queueUiWorkflowSmoke();
    queueUiRegressionSmoke();
    queueUiSnapshotSmoke();
    queueUiOauthSmoke();
    markUiWorkflowStartupStep('after-smoke-queue');
  }
});

function markUiWorkflowStartupStep(step) {
  if (isAutomatedUiSmoke() && document?.documentElement?.dataset) {
    document.documentElement.dataset.uiWorkflowStartupStep = String(step || '');
  }
}

function bindUi() {
  bindRendererUi({
    doc: document,
    windowObject: window,
    onNewCollection: newCollection,
    onNewFolder: () => { void newFolderFromToolbar(); },
    onNewRequest: newRequest,
    onNewRunner: () => newRunner(),
    onNewPerformanceTest: () => newPerformanceTest(),
    onNewWorkspace: () => { void newWorkspace(); },
    onNewEnvironment: () => newEnvironment(),
    onSaveRequest: () => { void saveRequestFromPane(); },
    onSaveEnvironment: () => { void saveEnvironmentFromPane(); },
    onImportWorkspace: importWorkspace,
    onExportWorkspace: () => { void exportWorkspaceFromPicker(); },
    onImportRequest: () => { void importRequest(); },
    onExportRequest: () => { void exportRequestFromPicker('postmeter'); },
    onExportRequestCurl: () => { void exportRequestFromPicker('curl'); },
    onImportCollection: importCollection,
    onImportEnvironment: () => { void importEnvironment(); },
    onImportRunner: () => { void importRunner(); },
    onImportPerformanceTest: () => { void importPerformanceTest(); },
    onExportCollection: () => exportCollection(null, 'postmeter'),
    onExportPostman: () => exportCollection(null, 'postman'),
    onExportOpenApi: () => exportCollection(null, 'openapi'),
    onExportCurl: () => exportCollection(null, 'curl'),
    onExportEnvironment: () => { void exportEnvironmentFromPicker('postmeter'); },
    onExportPostmanEnvironment: () => { void exportEnvironmentFromPicker('postman'); },
    onExportRunnerDefinition: () => { void exportRunnerDefinitionFromPicker(); },
    onSelectTheme: (themeOption) => setThemePreference(themeOption, { save: true }),
    onSendRequest: sendActiveRequest,
    onAddParam: () => addPair('queryParams'),
    onAddHeader: () => addPair('headers'),
    onPostMeterTokenHeaderChange: () => setActiveRequestAutoHeaderOption('sendPostMeterToken', $('sendPostMeterTokenInput')?.checked === true),
    onShowGeneratedHeadersChange: () => setActiveRequestAutoHeaderOption('showGeneratedHeaders', $('showGeneratedHeadersInput')?.checked === true),
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
    onRunCollection: runActiveCollection,
    onCancelCollectionRun: cancelCollectionRun,
    onExportRunnerJson: () => exportRunnerResult('json'),
    onExportRunnerCsv: () => exportRunnerResult('csv'),
    onSaveRunner: () => { void saveRunnerFromPane(); },
    onDeleteRunner: () => { void deleteRunner(); },
    onAddRunnerRequest: (event) => showAddRunnerRequestMenu(event),
    onSavePerformanceTest: () => { void savePerformanceTestFromPane(); },
    onDeletePerformanceTest: () => { void deletePerformanceTest(); },
    onRunPerformanceTest: () => { void runActivePerformanceTest(); },
    onCancelPerformanceTest: () => { void cancelPerformanceTestRun(); },
    onExportPerformanceTest: () => { void exportPerformanceTestFromPicker(); },
    onImportPerformanceRequest: () => { void promptAndImportPerformanceRequest(); },
    onAddPerformanceParam: () => addPerformancePair('queryParams'),
    onAddPerformanceHeader: () => addPerformancePair('headers'),
    onPerformancePostMeterTokenHeaderChange: () => setActivePerformanceRequestAutoHeaderOption('sendPostMeterToken', $('performanceSendPostMeterTokenInput')?.checked === true),
    onPerformanceShowGeneratedHeadersChange: () => setActivePerformanceRequestAutoHeaderOption('showGeneratedHeaders', $('performanceShowGeneratedHeadersInput')?.checked === true),
    onAddPerformanceAssertion: () => addPerformanceAssertion(),
    onAddPerformanceAssertionTemplate: addPerformanceAssertionTemplate,
    onAddPerformanceExample: addPerformanceExample,
    onExportPerformanceExamples: () => { void exportPerformanceExamples(); },
    onAddPerformanceRequestVariable: addPerformanceRequestVariable,
    onAddPerformanceCookie: addPerformanceCookie,
    onClearExpiredPerformanceCookies: clearExpiredPerformanceCookies,
    onCalibratePerformance: () => { void startPerformanceCalibration(); },
    onClosePerformanceCalibration: closePerformanceCalibrationModal,
    onStartPkceFlow: startPkceFlow,
    onStartDeviceFlow: startDeviceFlow,
    onCancelOauthFlow: cancelOauthFlow,
    onEnvironmentSelectChange: (environmentId) => {
      activeEnvironmentId = environmentId;
      renderEnvironments();
      renderEnvironmentEditor();
      refreshVariableHighlights();
      scheduleSessionSave();
    },
    onRunnerEnvironmentSelectChange: (environmentId) => {
      const runner = activeRunner();
      if (!runner) {
        return;
      }
      runner.environmentId = environmentId;
      markActiveRunnerDirty();
      renderRunnerEditor();
      refreshVariableHighlights();
      scheduleSessionSave();
    },
    onRunnerConfigChange: collectRunnerAndMarkDirty,
    onPerformanceConfigChange: collectPerformanceTestAndMarkDirty,
    onPerformanceRequestChange: collectPerformanceTestAndMarkDirty,
    onPerformanceMethodChange: () => {
      updatePerformanceMethodSelectClass();
      collectPerformanceTestAndMarkDirty();
    },
    onPerformanceUrlInput: () => {
      syncPerformanceParamsFromUrlInput();
      collectPerformanceTestAndMarkDirty();
      renderPerformanceCookieJarEditor();
    },
    onPerformanceBodyTypeChange: () => {
      updatePerformanceRequestBodyEditorLanguage();
      collectPerformanceTestAndMarkDirty();
    },
    onAddPerformanceFormDataBodyRow: () => addBodyFormDataRow('performance'),
    onAddPerformanceUrlencodedBodyRow: () => addBodyUrlencodedRow('performance'),
    onPerformanceAuthTypeChange: showPerformanceAuthSection,
    onPerformanceAuthInput: collectPerformanceTestAndMarkDirty,
    onPerformanceFilterCookiesChange: renderPerformanceCookieJarEditor,
    onMethodChange: () => {
      updateMethodSelectClass();
      collectRequestAndMarkDirty();
    },
    onUrlInput: () => {
      syncRequestParamsFromUrlInput();
      collectRequestAndMarkDirty();
      renderCookieJarEditor();
    },
    onBodyTypeChange: () => {
      updateRequestBodyEditorLanguage();
      collectRequestAndMarkDirty();
    },
    onAddFormDataBodyRow: () => addBodyFormDataRow(''),
    onAddUrlencodedBodyRow: () => addBodyUrlencodedRow(''),
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
    getSelectedExportItemId: () => selectedExportItemId,
    getSelectedFolderDestination: () => selectedFolderDestinationValue,
    getSelectedRunnerImportTarget: () => selectedRunnerImportTarget,
    onCloseContextMenu: closeContextMenu,
    onCloseFileSourceMenu: closeFileSourceMenu,
    onInitResizablePanes: initResizablePanes
  });
  bindRequestTitleEditor();
  bindWorkspaceTitleEditor();
  bindEnvironmentTitleEditor();
  bindRunnerTitleEditor();
  bindPerformanceTitleEditor();
  if (typeof setContextMenuPeerCloser === 'function') {
    setContextMenuPeerCloser(() => {
      closeToolbarMenus();
      closeFileSourceMenu();
    });
  }
  bindHistoryContextMenu();
  bindLocalFilePickerUi();
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
    ...openWorkspaceTabs.map((tab) => openTabRef('workspace', tab)),
    ...openRunnerTabs.map((tab) => openTabRef('runner', tab)),
    ...openPerformanceTabs.map((tab) => openTabRef('performance', tab))
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
  } else if (ref?.kind === 'runner') {
    await closeRunnerTab(ref.tab);
  } else if (ref?.kind === 'performance') {
    await closePerformanceTab(ref.tab);
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
  } else if (ref?.kind === 'runner') {
    await forceCloseRunnerTab(ref.tab, options);
  } else if (ref?.kind === 'performance') {
    await forceClosePerformanceTab(ref.tab, options);
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
    if (activeRunnerRequestRunnerId) {
      renderRunnerEditor();
    } else {
      renderCollections();
    }
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
    if (activeRunnerRequestRunnerId) {
      renderRunnerEditor();
    } else {
      renderCollections();
    }
    renderRequestTabs();
    return;
  }
  collectRequestNameFromTitle({ markDirty: true, render: false });
  if (request) {
    title.textContent = requestDisplayName(request);
  }
  if (activeRunnerRequestRunnerId) {
    renderRunnerEditor();
  } else {
    renderCollections();
  }
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

function bindRunnerTitleEditor() {
  const title = $('runnerMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginRunnerTitleEdit);
  title.addEventListener('keydown', handleRunnerTitleKeydown);
  title.addEventListener('input', collectRunnerAndMarkDirty);
  title.addEventListener('blur', () => finishRunnerTitleEdit());
}

function beginRunnerTitleEdit() {
  const runner = activeRunner();
  const title = $('runnerMainTitle');
  if (!runner || !title || title.dataset.editing === 'true') {
    return;
  }
  runnerTitleEditOriginal = runnerDisplayName(runner);
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Runner name');
  title.focus();
  selectElementContents(title);
}

function handleRunnerTitleKeydown(event) {
  const title = $('runnerMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginRunnerTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (runnerTitleInputValue() || 'Untitled Runner')
      !== (runnerTitleEditOriginal || 'Untitled Runner');
    finishRunnerTitleEdit();
    title.blur();
    if (shouldSave) {
      void saveRunnerFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishRunnerTitleEdit({ revert: true });
    title.blur();
  }
}

function finishRunnerTitleEdit(options = {}) {
  const title = $('runnerMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const runner = activeRunner();
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Runner name');
  if (runner && options.revert === true) {
    runner.name = runnerTitleEditOriginal || 'Untitled Runner';
    title.textContent = runnerDisplayName(runner);
    renderRunners();
    renderRequestTabs();
    return;
  }
  collectRunnerFromEditor();
  if (runner) {
    title.textContent = runnerDisplayName(runner);
  }
  renderRunners();
  renderRequestTabs();
}

function bindPerformanceTitleEditor() {
  const title = $('performanceMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginPerformanceTitleEdit);
  title.addEventListener('keydown', handlePerformanceTitleKeydown);
  title.addEventListener('input', collectPerformanceTestAndMarkDirty);
  title.addEventListener('blur', () => finishPerformanceTitleEdit());
}

function beginPerformanceTitleEdit() {
  const test = activePerformanceTest();
  const title = $('performanceMainTitle');
  if (!test || !title || title.dataset.editing === 'true') {
    return;
  }
  performanceTitleEditOriginal = performanceTestDisplayName(test);
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Performance test name');
  title.focus();
  selectElementContents(title);
}

function handlePerformanceTitleKeydown(event) {
  const title = $('performanceMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginPerformanceTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (performanceTitleInputValue() || 'Untitled Performance Test')
      !== (performanceTitleEditOriginal || 'Untitled Performance Test');
    finishPerformanceTitleEdit();
    title.blur();
    if (shouldSave) {
      void savePerformanceTestFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishPerformanceTitleEdit({ revert: true });
    title.blur();
  }
}

function finishPerformanceTitleEdit(options = {}) {
  const title = $('performanceMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const test = activePerformanceTest();
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Performance test name');
  if (test && options.revert === true) {
    test.name = performanceTitleEditOriginal || 'Untitled Performance Test';
    title.textContent = performanceTestDisplayName(test);
    renderPerformanceTests();
    renderRequestTabs();
    return;
  }
  collectPerformanceTestFromEditor();
  if (test) {
    title.textContent = performanceTestDisplayName(test);
  }
  renderPerformanceTests();
  renderRequestTabs();
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
  const method = requestMethodText(request);
  return isRunnerRequestTab(tab) ? `RUN - ${method}` : method;
}

function requestTabMethodClassName(request, tab = {}) {
  return isRunnerRequestTab(tab)
    ? tagClassName('RUN')
    : methodClassName(requestMethodText(request));
}

function requestMethodText(request) {
  return String(request?.method || 'GET').trim().toUpperCase() || 'GET';
}

function isRunnerRequestTab(tab = {}) {
  return tab.runnerRequest === true || Boolean(tab.runnerId);
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

function canOpenRequestTabFor(collectionId, requestId, options = {}) {
  return requestTabState.canOpenRequestTabFor(collectionId, requestId, options);
}

function canOpenRunnerRequestTabFor(runnerId, requestId, options = {}) {
  return requestTabState.canOpenRunnerRequestTabFor(runnerId, requestId, options);
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

function markActiveRequestDirty() {
  requestTabState.markActiveRequestDirty();
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

function collectPerformanceTestAndMarkDirty() {
  collectPerformanceTestFromEditor();
  markActivePerformanceDirty();
  refreshActivePerformanceGeneratedHeaderPreview();
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

const EXPORT_ITEM_PICKER_COPY = {
  workspace: {
    title: 'Export workspace',
    message: 'Choose a workspace to export.',
    empty: 'There are no workspaces present to export.',
    ariaLabel: 'Workspaces'
  },
  environment: {
    title: 'Export environment',
    message: 'Choose an environment to export.',
    empty: 'There are no environments present to export.',
    ariaLabel: 'Environments'
  },
  runner: {
    title: 'Export runner',
    message: 'Choose a runner to export.',
    empty: 'There are no runners present to export.',
    ariaLabel: 'Runners'
  },
  request: {
    title: 'Export request',
    message: 'Choose a collection request to export.',
    empty: 'There are no collection requests present to export.',
    ariaLabel: 'Requests'
  },
  performance: {
    title: 'Export performance test',
    message: 'Choose a performance test to export.',
    empty: 'There are no performance tests present to export.',
    ariaLabel: 'Performance tests'
  }
};

async function promptForItemExport(kind, items, preferredItem) {
  const itemId = await promptItemExport(kind, items, preferredItem);
  return (items || []).find((item) => item.id === itemId) || null;
}

function promptItemExport(kind, items, preferredItem) {
  selectedExportItemId = '';
  const availableItems = Array.isArray(items) ? items : [];
  const copy = EXPORT_ITEM_PICKER_COPY[kind] || {
    title: 'Export item',
    message: 'Choose an item to export.',
    empty: 'There are no items present to export.',
    ariaLabel: 'Items'
  };
  $('exportItemTitle').textContent = copy.title;
  $('exportItemMessage').textContent = availableItems.length ? copy.message : copy.empty;
  $('exportItemList').setAttribute('aria-label', copy.ariaLabel);
  renderExportItemList(kind, availableItems, preferredItem);
  return showModal('exportItemModal', null);
}

async function newFolderFromToolbar() {
  const destination = await promptForFolderDestination();
  if (!destination) {
    return null;
  }
  return newFolder(destination.collectionId, destination.folderId || null);
}

async function promptForFolderDestination() {
  const collections = Array.isArray(workspace.collections) ? workspace.collections : [];
  if (!collections.length) {
    setStatus('Create a collection before creating a folder.');
    renderToolbarState();
    return null;
  }
  const preferred = preferredFolderDestination(collections);
  selectedFolderDestinationValue = '';
  renderFolderDestinationList(collections, preferred);
  const selection = await showModal('folderDestinationModal', null);
  return parseFolderDestinationValue(selection);
}

function preferredFolderDestination(collections) {
  const collection = collections.find((item) => item.id === activeCollectionId) || collections[0] || null;
  if (!collection) {
    return null;
  }
  if (activeFolderId && findFolder(collection, activeFolderId)) {
    return { collectionId: collection.id, folderId: activeFolderId };
  }
  return { collectionId: collection.id, folderId: null };
}

function renderFolderDestinationList(collections = workspace.collections, preferredDestination = null) {
  const list = $('folderDestinationList');
  list.textContent = '';
  $('confirmFolderDestinationButton').disabled = true;
  const availableCollections = Array.isArray(collections) ? collections : [];
  if (!availableCollections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'There are no collections present for a folder.';
    list.append(empty);
    return;
  }
  const preferredValue = folderDestinationValue(preferredDestination || { collectionId: availableCollections[0]?.id || '', folderId: null });
  for (const collection of availableCollections) {
    appendFolderDestinationOption(list, {
      collectionId: collection.id,
      folderId: null,
      label: collection.name || 'Untitled Collection',
      detail: 'Collection root',
      depth: 0,
      preferredValue
    });
    appendFolderDestinationFolderOptions(list, collection, collection.folders || [], 1, [collection.name || 'Untitled Collection'], preferredValue);
  }
}

function appendFolderDestinationFolderOptions(list, collection, folders, depth, pathParts, preferredValue) {
  for (const folder of folders || []) {
    const name = folder.name || 'Untitled Folder';
    const nextPathParts = [...pathParts, name];
    appendFolderDestinationOption(list, {
      collectionId: collection.id,
      folderId: folder.id,
      label: name,
      detail: nextPathParts.join(' / '),
      depth,
      preferredValue
    });
    appendFolderDestinationFolderOptions(list, collection, folder.folders || [], depth + 1, nextPathParts, preferredValue);
  }
}

function appendFolderDestinationOption(list, options = {}) {
  const label = document.createElement('label');
  label.className = 'collection-pick-option folder-destination-option';
  label.style.paddingLeft = `${Math.min(Number(options.depth) || 0, 8) * 16 + 12}px`;
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'folderDestination';
  input.value = folderDestinationValue(options);
  input.addEventListener('change', () => {
    selectedFolderDestinationValue = input.value;
    $('confirmFolderDestinationButton').disabled = false;
  });
  if (input.value === options.preferredValue) {
    input.checked = true;
    selectedFolderDestinationValue = input.value;
    $('confirmFolderDestinationButton').disabled = false;
  }
  const text = document.createElement('span');
  text.textContent = options.label || 'Untitled Destination';
  const detail = document.createElement('small');
  detail.textContent = options.detail || '';
  label.append(input, text, detail);
  list.append(label);
}

function folderDestinationValue(destination = {}) {
  return JSON.stringify({
    collectionId: destination.collectionId || '',
    folderId: destination.folderId || null
  });
}

function parseFolderDestinationValue(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed?.collectionId) {
      return null;
    }
    return {
      collectionId: parsed.collectionId,
      folderId: parsed.folderId || null
    };
  } catch {
    return null;
  }
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

function renderExportItemList(kind, items = [], preferredItem = null) {
  const list = $('exportItemList');
  list.textContent = '';
  $('confirmExportItemButton').disabled = true;
  const availableItems = Array.isArray(items) ? items : [];
  if (!availableItems.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = EXPORT_ITEM_PICKER_COPY[kind]?.empty || 'There are no items present to export.';
    list.append(empty);
    return;
  }
  const preferredId = preferredItem?.id || availableItems[0]?.id || '';
  for (const item of availableItems) {
    const label = document.createElement('label');
    label.className = 'collection-pick-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `export${kind}`;
    input.value = item.id;
    input.addEventListener('change', () => {
      selectedExportItemId = input.value;
      $('confirmExportItemButton').disabled = false;
    });
    if (item.id === preferredId) {
      input.checked = true;
      selectedExportItemId = input.value;
      $('confirmExportItemButton').disabled = false;
    }
    const text = document.createElement('span');
    text.textContent = exportItemDisplayName(kind, item);
    label.append(input, text);
    if (item?.detail) {
      const detail = document.createElement('small');
      detail.textContent = item.detail;
      label.append(detail);
    }
    list.append(label);
  }
}

function exportItemDisplayName(kind, item) {
  if (kind === 'workspace') {
    return workspaceDisplayName(item);
  }
  if (kind === 'runner') {
    return runnerDisplayName(item);
  }
  if (kind === 'request') {
    const request = item?.request || item || {};
    return `${String(request.method || 'GET').toUpperCase()} ${requestDisplayName(request)}`;
  }
  if (kind === 'performance') {
    return performanceTestDisplayName(item);
  }
  return String(item?.name || '').trim() || 'Untitled Environment';
}

function showModal(modalId, cancelValue) {
  if (state.activeModalResolver) {
    resolveActiveModal(state.activeModalCancelValue, { flushNotifications: false });
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  closeContextMenu();
  closeToolbarMenus();
  closeFileSourceMenu();
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

function canResolveLocalFilePaths() {
  return typeof window.postmeter?.files?.pathForFile === 'function';
}

function bindLocalFilePickerUi() {
  const fileInput = $('filePickerInput');
  const browseButton = $('filePickerBrowseButton');
  const cancelButton = $('filePickerCancelButton');
  const closeButton = $('filePickerCloseButton');
  const dropZone = $('filePickerDropZone');
  const sourceChooseButton = $('fileSourceChooseButton');

  browseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    fileInput?.click?.();
  });
  cancelButton?.addEventListener('click', () => resolveActiveModal(null));
  closeButton?.addEventListener('click', () => resolveActiveModal(null));
  fileInput?.addEventListener('change', () => {
    void selectLocalFileFromPicker(fileInput.files?.[0] || null);
  });
  dropZone?.addEventListener('click', () => fileInput?.click?.());
  dropZone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click?.();
    }
  });
  for (const eventName of ['dragenter', 'dragover']) {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add('is-dragover');
    });
  }
  for (const eventName of ['dragleave', 'dragend']) {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!dropZone.contains(event.relatedTarget)) {
        dropZone.classList.remove('is-dragover');
      }
    });
  }
  dropZone?.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove('is-dragover');
    void selectLocalFileFromPicker(event.dataTransfer?.files?.[0] || null);
  });
  sourceChooseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void chooseFileForActiveSourceInput();
  });

  configureLocalFileSourceInput($('binaryBodySourceInput'), '', 'binary');
  configureLocalFileSourceInput($('performanceBinaryBodySourceInput'), 'performance', 'binary');
  bindRequestImportModalUi();
  bindRequestExportPickerModalUi();
  bindRequestExportModalUi();
  document.addEventListener('click', closeFileSourceMenu);
  window.addEventListener('blur', closeFileSourceMenu);
  window.addEventListener('resize', closeFileSourceMenu);
}

function configureFilePickerModal(options = {}) {
  $('filePickerTitle').textContent = options.title || 'Choose file';
  $('filePickerMessage').textContent = options.message || 'Drop a file here or choose a file from this computer.';
  const fileInput = $('filePickerInput');
  fileInput.value = '';
  fileInput.accept = options.accept || '';
  const error = $('filePickerError');
  error.hidden = true;
  error.textContent = '';
  const dropZone = $('filePickerDropZone');
  dropZone.classList.remove('is-dragover');
  const title = dropZone.querySelector('strong');
  const detail = dropZone.querySelector('span');
  if (title) {
    title.textContent = options.dropTitle || 'Drop file here';
  }
  if (detail) {
    detail.textContent = options.dropDetail || 'or choose a file from this computer.';
  }
}

async function showLocalFilePicker(options = {}) {
  if (!canResolveLocalFilePaths()) {
    return null;
  }
  activeFilePickerOptions = options;
  configureFilePickerModal(options);
  const selection = await showModal('filePickerModal', null);
  resetFilePickerModal();
  activeFilePickerOptions = null;
  return selection;
}

function resetFilePickerModal() {
  const fileInput = $('filePickerInput');
  if (fileInput) {
    fileInput.value = '';
    fileInput.accept = '';
  }
  $('filePickerDropZone')?.classList.remove('is-dragover');
  const error = $('filePickerError');
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
}

async function selectLocalFileFromPicker(file) {
  if (!file) {
    return;
  }
  const filePath = localPathForFile(file);
  if (!filePath) {
    renderFilePickerError('PostMeter could not read a local path for that file. Use the native file picker fallback from the import action.');
    return;
  }
  resolveActiveModal({
    name: file.name || fileNameFromLocalPath(filePath),
    path: filePath,
    picker: activeFilePickerOptions?.kind || 'file'
  });
}

function localPathForFile(file) {
  try {
    const resolved = window.postmeter?.files?.pathForFile?.(file);
    if (typeof resolved === 'string' && resolved.trim()) {
      return resolved.trim();
    }
  } catch {
    return '';
  }
  return typeof file?.path === 'string' ? file.path.trim() : '';
}

function renderFilePickerError(message) {
  const error = $('filePickerError');
  if (!error) {
    return;
  }
  error.textContent = String(message || 'Choose a file to continue.');
  error.hidden = false;
}

function bindRequestImportModalUi() {
  const textInput = $('requestImportTextInput');
  const fileInput = $('requestImportFileInput');
  const dropZone = $('requestImportDropZone');
  const browseButton = $('requestImportBrowseButton');
  const cancelButton = $('cancelRequestImportButton');
  const closeButton = $('requestImportCloseButton');
  const confirmButton = $('confirmRequestImportButton');
  browseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    fileInput?.click?.();
  });
  cancelButton?.addEventListener('click', () => resolveActiveModal(null));
  closeButton?.addEventListener('click', () => resolveActiveModal(null));
  confirmButton?.addEventListener('click', () => {
    const text = String(textInput?.value || '').trim();
    const filePath = selectedRequestImportFilePath;
    if (!text && !filePath) {
      renderRequestImportError('Paste request text or choose a request file.');
      return;
    }
    resolveActiveModal({ text, filePath });
  });
  textInput?.addEventListener('input', updateRequestImportConfirmState);
  fileInput?.addEventListener('change', () => {
    void selectRequestImportFile(fileInput.files?.[0] || null);
  });
  dropZone?.addEventListener('click', () => fileInput?.click?.());
  dropZone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click?.();
    }
  });
  for (const eventName of ['dragenter', 'dragover']) {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add('is-dragover');
    });
  }
  for (const eventName of ['dragleave', 'dragend']) {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!dropZone.contains(event.relatedTarget)) {
        dropZone.classList.remove('is-dragover');
      }
    });
  }
  dropZone?.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove('is-dragover');
    void selectRequestImportFile(event.dataTransfer?.files?.[0] || null);
  });
}

function bindRequestExportPickerModalUi() {
  $('cancelRequestExportPickerButton')?.addEventListener('click', () => resolveActiveModal(null));
  $('confirmRequestExportPickerButton')?.addEventListener('click', () => {
    if (selectedRequestExportTarget?.collectionId && selectedRequestExportTarget?.requestId) {
      resolveActiveModal(selectedRequestExportTarget);
    }
  });
}

function bindRequestExportModalUi() {
  const cancelButton = $('cancelRequestExportButton');
  const closeButton = $('requestExportCloseButton');
  const copyButton = $('copyRequestExportButton');
  const fileButton = $('fileRequestExportButton');
  cancelButton?.addEventListener('click', () => resolveActiveModal(null));
  closeButton?.addEventListener('click', () => resolveActiveModal(null));
  copyButton?.addEventListener('click', (event) => {
    event.preventDefault();
    void copyRequestExportText();
  });
  fileButton?.addEventListener('click', () => resolveActiveModal('file'));
}

function configureRequestExportModal(request = {}, format = 'postmeter', content = '') {
  activeRequestExportContent = String(content || '');
  const normalizedFormat = String(format || 'postmeter').toLowerCase();
  const formatLabel = normalizedFormat === 'curl' ? 'curl' : 'PostMeter';
  const requestName = requestDisplayName(request);
  $('requestExportTitle').textContent = `Export ${formatLabel} request`;
  $('requestExportMessage').textContent = `${formatLabel} export for "${requestName}". Copy it directly or export it to a file.`;
  $('requestExportTextLabel').textContent = `${formatLabel} request text`;
  const textOutput = $('requestExportTextOutput');
  if (textOutput) {
    textOutput.value = activeRequestExportContent;
  }
  const copyStatus = $('requestExportCopyStatus');
  if (copyStatus) {
    copyStatus.hidden = true;
    copyStatus.textContent = '';
  }
}

function resetRequestExportModal() {
  activeRequestExportContent = '';
  const textOutput = $('requestExportTextOutput');
  if (textOutput) {
    textOutput.value = '';
  }
  const copyStatus = $('requestExportCopyStatus');
  if (copyStatus) {
    copyStatus.hidden = true;
    copyStatus.textContent = '';
  }
}

async function copyRequestExportText() {
  const textOutput = $('requestExportTextOutput');
  const content = String(textOutput?.value || activeRequestExportContent || '');
  if (!content) {
    renderRequestExportStatus('Nothing to copy.');
    return;
  }
  try {
    const electronClipboard = window.__postmeterWriteClipboard || window.postmeter?.clipboard?.writeText;
    if (typeof electronClipboard === 'function') {
      await electronClipboard(content);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      textOutput?.focus?.();
      textOutput?.select?.();
      document.execCommand('copy');
    }
    renderRequestExportStatus('Copied request export to clipboard.');
    setStatus('Copied request export to clipboard.');
  } catch (error) {
    const message = error?.message || String(error);
    renderRequestExportStatus(`Copy failed: ${message}`);
  }
}

function renderRequestExportStatus(message) {
  const copyStatus = $('requestExportCopyStatus');
  if (!copyStatus) {
    return;
  }
  copyStatus.textContent = String(message || '');
  copyStatus.hidden = !copyStatus.textContent;
}

function resetRequestImportModal() {
  selectedRequestImportFilePath = '';
  selectedRequestImportFileName = '';
  const textInput = $('requestImportTextInput');
  if (textInput) {
    textInput.value = '';
  }
  const fileInput = $('requestImportFileInput');
  if (fileInput) {
    fileInput.value = '';
  }
  $('requestImportDropZone')?.classList.remove('is-dragover');
  const selection = $('requestImportFileSelection');
  if (selection) {
    selection.hidden = true;
    selection.textContent = '';
  }
  const error = $('requestImportError');
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  updateRequestImportConfirmState();
}

async function selectRequestImportFile(file) {
  if (!file) {
    return;
  }
  const filePath = localPathForFile(file);
  if (!filePath) {
    renderRequestImportError('PostMeter could not read a local path for that file.');
    return;
  }
  selectedRequestImportFilePath = filePath;
  selectedRequestImportFileName = file.name || fileNameFromLocalPath(filePath);
  const selection = $('requestImportFileSelection');
  if (selection) {
    selection.textContent = `Selected file: ${selectedRequestImportFileName}`;
    selection.hidden = false;
  }
  const error = $('requestImportError');
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  updateRequestImportConfirmState();
}

function renderRequestImportError(message) {
  const error = $('requestImportError');
  if (!error) {
    return;
  }
  error.textContent = String(message || 'Choose a request file or paste request text.');
  error.hidden = false;
}

function updateRequestImportConfirmState() {
  const text = String($('requestImportTextInput')?.value || '').trim();
  const hasSource = Boolean(text || selectedRequestImportFilePath);
  const confirm = $('confirmRequestImportButton');
  if (confirm) {
    confirm.disabled = !hasSource;
  }
}

function configureLocalFileSourceInput(input, prefix, mode) {
  if (!input) {
    return;
  }
  updateLocalFileSourceInputState(input, { enabled: true, prefix, mode });
  if (input.dataset.filePickerBound === 'true') {
    return;
  }
  input.dataset.filePickerBound = 'true';
  input.addEventListener('click', (event) => {
    if (input.dataset.fileSourceEnabled !== 'true') {
      return;
    }
    event.stopPropagation();
    showFileSourceMenu(input);
  });
  input.addEventListener('keydown', (event) => {
    if (input.dataset.fileSourceEnabled !== 'true') {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      showFileSourceMenu(input, { focus: true });
    }
  });
}

function updateLocalFileSourceInputState(input, options = {}) {
  if (!input) {
    return;
  }
  const enabled = options.enabled === true;
  input.dataset.fileSourceEnabled = enabled ? 'true' : 'false';
  input.dataset.fileSourcePrefix = options.prefix || '';
  input.dataset.fileSourceMode = options.mode || 'file';
  if (enabled) {
    input.setAttribute('aria-haspopup', 'menu');
    input.setAttribute('aria-controls', 'fileSourceMenu');
  } else {
    input.removeAttribute('aria-haspopup');
    input.removeAttribute('aria-controls');
  }
}

function showFileSourceMenu(input, options = {}) {
  const menu = $('fileSourceMenu');
  if (!menu || !input) {
    return;
  }
  closeContextMenu();
  closeToolbarMenus();
  activeFileSourceTarget = {
    input,
    mode: input.dataset.fileSourceMode || 'file',
    prefix: input.dataset.fileSourcePrefix || ''
  };
  menu.hidden = false;
  const rect = input.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8));
  const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  if (options.focus === true) {
    menu.querySelector('button')?.focus?.();
  }
}

function closeFileSourceMenu() {
  const menu = $('fileSourceMenu');
  if (!menu) {
    return;
  }
  menu.hidden = true;
  activeFileSourceTarget = null;
}

async function chooseFileForActiveSourceInput() {
  const target = activeFileSourceTarget;
  closeFileSourceMenu();
  if (!target?.input) {
    return null;
  }
  const selected = await showLocalFilePicker({
    kind: 'body-file-source',
    title: 'Choose request file',
    message: 'Drop a file here or choose one to use as the request body file source.',
    dropTitle: 'Drop request file here',
    dropDetail: 'The selected path will be bound to this request file source.'
  });
  if (!selected?.path) {
    return null;
  }
  await applySelectedFileSourceToInput(target.input, target.prefix, target.mode, selected);
  return selected;
}

async function applySelectedFileSourceToInput(input, prefix, mode, selected) {
  const localPath = String(selected?.path || '').trim();
  if (!input || !localPath) {
    return false;
  }
  const key = mode === 'formdata' ? fileSourceKeyForInput(input) : '';
  const bound = await upsertLocalFileAttachmentBinding(localPath, {
    fileName: selected.name || fileNameFromLocalPath(localPath),
    key,
    localPath,
    mode
  });
  if (!bound) {
    return false;
  }
  input.value = localPath;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  collectBodyEditorAndMarkDirty(prefix);
  setStatus(`File source selected: ${fileNameFromLocalPath(localPath)}.`);
  return true;
}

async function upsertLocalFileAttachmentBinding(source, options = {}) {
  const normalizedSource = String(source || '').trim();
  const localPath = String(options.localPath || source || '').trim();
  if (!normalizedSource || !localPath) {
    return false;
  }
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.sandbox.fileBindings = normalizeSandboxFileBindings([
    ...workspace.settings.sandbox.fileBindings.filter((item) => item.source !== normalizedSource),
    {
      contentType: options.contentType || '',
      fileName: options.fileName || fileNameFromLocalPath(localPath),
      key: options.key || '',
      localPath,
      mode: options.mode || 'file',
      reviewedAt: new Date().toISOString(),
      source: normalizedSource
    }
  ]);
  return saveWorkspaceSettingsWithRollback(
    previousSettings,
    '',
    'File binding save failed',
    'File Binding Save Failed'
  );
}

function fileSourceKeyForInput(input) {
  return input?.closest?.('[data-body-form-data-row]')?.querySelector('[data-body-form-data-field="key"]')?.value || '';
}

function fileNameFromLocalPath(filePath) {
  const text = String(filePath || '');
  return text.split(/[\\/]/).filter(Boolean).pop() || text || 'file';
}

async function chooseImportFilePath(kind) {
  if (!canResolveLocalFilePaths()) {
    return undefined;
  }
  const configs = {
    workspace: {
      accept: '.json,application/json',
      message: 'Drop a PostMeter workspace file here or choose one from this computer.',
      title: 'Import PostMeter Workspace'
    },
    collection: {
      accept: '.json,.yaml,.yml,.sh,application/json,application/yaml,text/yaml',
      message: 'Drop a collection file here or choose one from this computer.',
      title: 'Import Collection'
    },
    environment: {
      accept: '.json,application/json',
      message: 'Drop an environment file here or choose one from this computer.',
      title: 'Import Environment'
    },
    runner: {
      accept: '.json,application/json',
      message: 'Drop a runner file here or choose one from this computer.',
      title: 'Import Runner'
    },
    performance: {
      accept: '.json,application/json',
      message: 'Drop a performance test file here or choose one from this computer.',
      title: 'Import Performance Test'
    }
  };
  const config = configs[kind] || configs.workspace;
  const selected = await showLocalFilePicker({
    ...config,
    dropTitle: 'Drop file here',
    dropDetail: 'or choose a file from this computer.',
    kind
  });
  return selected?.path ? selected.path : null;
}

function focusInitialModalElement(modalId) {
  const preferredFocusIds = {
    unsavedRequestModal: 'cancelCloseRequestButton',
    saveDraftRequestModal: 'cancelSaveDraftButton',
    exportCollectionModal: 'cancelExportCollectionButton',
    exportItemModal: 'cancelExportItemButton',
    requestExportPickerModal: 'cancelRequestExportPickerButton',
    folderDestinationModal: 'cancelFolderDestinationButton',
    runnerImportModal: 'cancelRunnerImportButton',
    requestImportModal: 'requestImportTextInput',
    requestExportModal: 'copyRequestExportButton',
    textInputModal: $('textInputModal')?.dataset?.valueControl || 'textInputModalInput',
    confirmActionModal: 'cancelConfirmActionButton',
    notificationModal: 'closeNotificationModalButton',
    performanceCalibrationModal: 'closePerformanceCalibrationModalButton',
    filePickerModal: 'filePickerBrowseButton',
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
  lastRunnerResult = null;
  lastPerformanceResult = null;
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
  $('validationLabel').textContent = '';
  renderRunnerExecutionMessage('No runner run yet.');
  displayTestResults(null);
  $('runCollectionButton').disabled = false;
  $('cancelRunnerButton').disabled = true;
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
  collectRunnerFromEditor();
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
  renderRunners();
  renderPerformanceTests();
  renderWorkspacePanel();
  renderRunnerEditor();
  renderPerformanceEditor();
  renderHistory();
  renderRequestTabs();
  renderRequestEditor();
  renderCollectionVariablesEditor();
  renderEnvironmentEditor();
  refreshVariableHighlights();
  scheduleSessionSave();
}

function refreshVariableHighlights(root = document) {
  VariableHighlighter.enhanceVariableTextboxes?.(root);
  VariableHighlighter.refreshVariableHighlights?.(root);
  CodeEditor.refreshCodeEditors?.(root);
}

function variableHighlightVariablesForTarget(target) {
  const environment = variableHighlightEnvironmentForTarget(target);
  return environment?.variables || [];
}

function variableHighlightEnvironmentForTarget(target) {
  if (activeRunnerRequestRunnerId) {
    const runner = (workspace?.runners || []).find((item) => item.id === activeRunnerRequestRunnerId);
    const runnerEnvironment = environmentById(runner?.environmentId);
    if (runnerEnvironment) {
      return runnerEnvironment;
    }
  }
  if (target?.closest?.('#runnerMainPanel')) {
    const runnerEnvironment = environmentById(activeRunner()?.environmentId);
    if (runnerEnvironment) {
      return runnerEnvironment;
    }
  }
  if (target?.closest?.('#performanceMainPanel')) {
    const test = activePerformanceTest();
    const type = activePerformanceType() || test?.type || 'latency';
    const performanceEnvironment = environmentById(performanceTypeSettings(test, type).environmentId);
    if (performanceEnvironment) {
      return performanceEnvironment;
    }
  }
  return activeEnvironment();
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
  collectActiveEditorState();
  activeSidebarPanel = panel;
  if (panel === 'collections') {
    activeMainPanel = 'request';
    if (activeRunnerRequestRunnerId) {
      const fallbackTab = [...openRequestTabs].reverse().find((tab) => tab.runnerRequest !== true && !tab.runnerId);
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
  } else if (panel === 'runners') {
    const activeTab = openRunnerTabs.find((tab) => tab.key === activeRunnerTabKey());
    const fallbackTab = activeTab || openRunnerTabs[openRunnerTabs.length - 1] || null;
    if (fallbackTab) {
      selectRunnerTabWithoutCollect(fallbackTab);
      return;
    }
    activeRunnerConfigId = null;
    activeRunnerRequestRunnerId = null;
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
  const showRunner = activeMainPanel === 'runner';
  const showPerformance = activeMainPanel === 'performance';
  const showDocument = showEnvironment || showWorkspace || showRunner || showPerformance;
  const showRequestEmpty = activeMainPanel === 'request' && !activeRequest();
  const showEnvironmentEmpty = showEnvironment && !activeEnvironment();
  const showWorkspaceEmpty = showWorkspace && !activeWorkspaceItem();
  const showRunnerEmpty = showRunner && !activeRunner();
  const showPerformanceEmpty = showPerformance && !activePerformanceTest();
  document.querySelector('.workspace').classList.toggle('document-mode', showDocument);
  document.querySelector('.workspace').classList.toggle('environment-mode', showEnvironment);
  document.querySelector('.workspace').classList.toggle('workspace-mode', showWorkspace);
  document.querySelector('.workspace').classList.toggle('runner-mode', showRunner);
  document.querySelector('.workspace').classList.toggle('performance-mode', showPerformance);
  document.querySelector('.workspace').classList.toggle('request-empty-mode', showRequestEmpty);
  document.querySelector('.workspace').classList.toggle('environment-empty-mode', showEnvironmentEmpty);
  document.querySelector('.workspace').classList.toggle('workspace-empty-mode', showWorkspaceEmpty);
  document.querySelector('.workspace').classList.toggle('runner-empty-mode', showRunnerEmpty);
  document.querySelector('.workspace').classList.toggle('performance-empty-mode', showPerformanceEmpty);
  $('requestEmptyPanel').hidden = !showRequestEmpty;
  $('environmentEmptyPanel').hidden = !showEnvironmentEmpty;
  $('workspaceEmptyPanel').hidden = !showWorkspaceEmpty;
  $('runnerEmptyPanel').hidden = !showRunnerEmpty;
  $('performanceEmptyPanel').hidden = !showPerformanceEmpty;
  $('requestEditorPanel').hidden = showDocument || showRequestEmpty;
  $('environmentMainPanel').hidden = !showEnvironment || showEnvironmentEmpty;
  $('workspaceMainPanel').hidden = !showWorkspace || showWorkspaceEmpty;
  $('runnerMainPanel').hidden = !showRunner || showRunnerEmpty;
  $('performanceMainPanel').hidden = !showPerformance || showPerformanceEmpty;
  $('workspacePaneResize').hidden = showDocument || showRequestEmpty;
  document.querySelector('.results').hidden = showDocument || showRequestEmpty;
}

function renderToolbarState() {
  const hasCollections = Array.isArray(workspace.collections) && workspace.collections.length > 0;
  $('newFolderButton').disabled = !hasCollections;
  $('newFolderButton').setAttribute('aria-disabled', hasCollections ? 'false' : 'true');
}

function renderSettings() {
  ensureSettings();
  applyThemePreference(workspace.settings.appearance.theme);
  renderThemeControl();
}

function ensureSettings() {
  workspace.runners = normalizeWorkspaceRunners(workspace.runners);
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
  for (const runner of workspace.runners || []) {
    collectSandboxFileReferencesFromNode(runner, references);
  }
  for (const test of workspace.performanceTests || []) {
    collectSandboxFileReferencesFromNode(test?.request, references);
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
  for (const reference of fileReferencesFromPostmanBody(node.postmanBody)) {
    references.push(reference);
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
  activeRunnerConfigId = null;
  activeRunnerRequestRunnerId = null;
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
  activeRunnerRequestRunnerId = null;
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
  appendSidebarTreeRows(root, workspace.collections.map(collectionNode));
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
  appendSidebarTreeRows(root, workspace.environments.map(environmentNode));
}

function environmentNode(environment) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node environment-node';
  const button = treeButton(environment.name || 'Untitled Environment', environment.id === activeEnvironmentId, 'ENV', {
    treeKind: 'environment',
    treeId: environment.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'environment',
    id: environment.id
  });
  button.addEventListener('click', () => {
    if (!canOpenEnvironmentTabFor(environment.id)) {
      return;
    }
    collectActiveEditorState();
    activeRunnerRequestRunnerId = null;
    activeEnvironmentId = environment.id;
    activeSidebarPanel = 'environments';
    activeMainPanel = 'environment';
    ensureOpenEnvironmentTabForActive();
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renameEnvironment(environment)],
    ['Duplicate', () => duplicateEnvironment(environment)],
    ['Export', [
      ['PostMeter', () => { void exportEnvironment(environment, 'postmeter'); }],
      ['Postman', () => { void exportEnvironment(environment, 'postman'); }]
    ]],
    ['Delete', () => deleteEnvironment(environment), 'danger']
  ]);
  return wrapper;
}

function renderWorkspaces() {
  const root = $('workspacesList');
  root.textContent = '';
  appendSidebarTreeRows(root, workspaceListItems().map(workspaceNode));
}

function renderRunners() {
  ensureWorkspaceRunners();
  const root = $('runnersList');
  root.textContent = '';
  if (!workspace.runners.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state runner-empty-sidebar';
    const message = document.createElement('div');
    message.textContent = 'No runners';
    empty.append(message);
    root.append(empty);
    return;
  }
  appendSidebarTreeRows(root, workspace.runners.map(runnerNode));
}

function runnerNode(runner) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node runner-node';
  const button = treeButton(runnerDisplayName(runner), activeMainPanel === 'runner' && runner.id === activeRunnerConfigId, 'RUN', {
    treeKind: 'runner',
    treeId: runner.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'runner',
    id: runner.id
  });
  button.addEventListener('click', () => {
    selectRunnerItem(runner.id);
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renameRunner(runner)],
    ['Duplicate', () => duplicateRunner(runner)],
    ['Export', () => { void exportRunnerDefinition(runner); }],
    ['Delete', () => { void deleteRunner(runner); }, 'danger']
  ]);
  return wrapper;
}

function ensureWorkspacePerformanceTests() {
  workspace ||= {};
  workspace.performanceTests = normalizeWorkspacePerformanceTests(workspace.performanceTests, workspace);
  return workspace.performanceTests;
}

function renderPerformanceTests() {
  ensureWorkspacePerformanceTests();
  const root = $('performanceList');
  if (!root) {
    return;
  }
  root.textContent = '';
  if (!workspace.performanceTests.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state performance-empty-sidebar';
    empty.textContent = 'No performance tests';
    root.append(empty);
    return;
  }
  appendSidebarTreeRows(root, workspace.performanceTests.map(performanceTestNode));
}

function performanceTestNode(test) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node performance-node';
  const button = treeButton(performanceTestDisplayName(test), activeMainPanel === 'performance' && test.id === activePerformanceTestId, 'PERF', {
    treeKind: 'performance',
    treeId: test.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'performance',
    id: test.id
  });
  button.addEventListener('click', () => {
    selectPerformanceTestItem(test.id);
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renamePerformanceTest(test)],
    ['Duplicate', () => duplicatePerformanceTest(test)],
    ['Export', () => { void exportActivePerformanceTest(test); }],
    ['Delete', () => { void deletePerformanceTest(test); }, 'danger']
  ]);
  return wrapper;
}

function workspaceNode(workspaceItem) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node workspace-node';
  const button = treeButton(workspaceItem.name, activeMainPanel === 'workspace' && workspaceItem.id === selectedWorkspaceId, 'WRK', {
    treeKind: 'workspace',
    treeId: workspaceItem.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'workspace',
    id: workspaceItem.id
  });
  button.addEventListener('click', () => {
    selectWorkspaceItem(workspaceItem.id);
  });
  const menuItems = [
    ['View Details', () => { selectWorkspaceItem(workspaceItem.id); }],
    ['Rename', () => { renameWorkspace(workspaceItem.id); }],
    ['Duplicate', () => { void duplicateWorkspace(workspaceItem.id); }],
    ['Export', () => { void exportWorkspace(workspaceItem.id); }]
  ];
  if (workspaceItem.current !== true) {
    menuItems.splice(1, 0, ['Switch to This Workspace', () => { void switchWorkspace(workspaceItem.id, { focus: 'workspace' }); }]);
  }
  if (workspaceItem.deletable !== false) {
    menuItems.push(['Delete', () => { void deleteWorkspace(workspaceItem.id); }, 'danger']);
  }
  attachTreeContextMenu(button, menuItems);
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
    ['Runners', String(summary.runners)],
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

function renderRunnerEditor() {
  const runner = activeRunner();
  const title = $('runnerMainTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = runner ? runnerDisplayName(runner) : 'Select a runner';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  if (title) {
    title.tabIndex = runner ? 0 : -1;
    title.setAttribute('aria-disabled', runner ? 'false' : 'true');
    title.setAttribute('aria-label', 'Runner name');
  }
  $('saveRunnerButton').disabled = !runner;
  $('deleteRunnerButton').disabled = !runner;
  $('runCollectionButton').disabled = !runner || activeRunnerId != null;
  $('cancelRunnerButton').disabled = !activeRunnerId;
  renderRunnerEnvironmentSelect(runner);
  $('runnerStopOnFailure').checked = runner?.stopOnFailure === true;
  $('runnerStopOnFailure').disabled = !runner;
  $('runnerAllowEnvironmentMutation').checked = runner?.allowEnvironmentMutation === true;
  $('runnerAllowEnvironmentMutation').disabled = !runner;
  $('addRunnerRequestButton').disabled = !runner;
  renderRunnerRequestList(runner);
}

function renderPerformanceEditor() {
  const test = activePerformanceTest();
  const title = $('performanceMainTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = test ? performanceTestDisplayName(test) : 'Select a performance test';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  if (title) {
    title.tabIndex = test ? 0 : -1;
    title.setAttribute('aria-disabled', test ? 'false' : 'true');
    title.setAttribute('aria-label', 'Performance test name');
  }
  for (const id of ['savePerformanceTestButton', 'deletePerformanceTestButton', 'runPerformanceTestButton', 'exportPerformanceTestButton', 'importPerformanceRequestButton']) {
    const button = $(id);
    if (button) {
      button.disabled = !test;
    }
  }
  if ($('runPerformanceTestButton')) {
    $('runPerformanceTestButton').disabled = !test || Boolean(activePerformanceRunId);
  }
  const cancelButton = $('cancelPerformanceTestButton');
  if (cancelButton) {
    cancelButton.disabled = !activePerformanceRunId;
  }
  renderPerformanceTypeTabs(test);
  renderPerformanceEnvironmentControls(test);
  renderPerformanceConfigControls(test);
  renderPerformanceSafetyControls(test);
  renderPerformanceMutationControls(test);
  renderPerformanceRequestEditor(test);
}

function renderPerformanceRequestEditor(test = activePerformanceTest()) {
  const request = test?.request || null;
  setPerformanceRequestSectionDisabled(!test);
  if (!request) {
    setValue('performanceMethodSelect', 'GET');
    updatePerformanceMethodSelectClass();
    setValue('performanceUrlInput', '');
    renderRequestBodyEditor('performance', null);
    setValue('performancePreRequestScriptInput', '');
    setValue('performanceTestScriptInput', '');
    renderPerformanceRequestHeaderControls(null);
    setChecked('performanceRequestCookieJarEnabledInput', false);
    setChecked('performanceRequestCookieJarStoreInput', true);
    for (const id of [
      'performanceParamsTable',
      'performanceHeadersTable',
      'performanceAssertionsTable',
      'performanceRequestVariablesTable',
      'performanceExamplesList',
      'performanceCookiesTable'
    ]) {
      const container = $(id);
      if (container) {
        container.textContent = '';
      }
    }
    renderPerformanceAuthEditor({ type: 'none' });
    renderPerformanceVariablePreview();
    updatePerformanceRequestEditorLanguages();
    refreshVariableHighlights($('performanceRequestSection'));
    return;
  }

  ensureRequestQueryEditorMirror(request);
  request.queryParams ||= [];
  request.headers ||= [];
  request.assertions ||= [];
  request.variables ||= [];
  request.examples ||= [];
  request.scripts ||= { preRequest: '', tests: '' };
  request.cookieJar ||= { enabled: false, storeResponses: true };
  request.auth ||= { type: 'none' };
  ensureRequestAutoHeaders(request);

  setValue('performanceMethodSelect', METHODS.includes(request.method) ? request.method : 'GET');
  updatePerformanceMethodSelectClass();
  setValue('performanceUrlInput', request.url || '');
  renderRequestBodyEditor('performance', request);
  setValue('performancePreRequestScriptInput', request.scripts.preRequest || '');
  setValue('performanceTestScriptInput', request.scripts.tests || '');
  setChecked('performanceRequestCookieJarEnabledInput', request.cookieJar.enabled === true);
  setChecked('performanceRequestCookieJarStoreInput', request.cookieJar.storeResponses !== false);

  renderPerformancePairs('performanceParamsTable', request.queryParams);
  renderPerformanceHeaderPairs('performanceHeadersTable', request);
  renderPerformanceAssertions(request.assertions);
  renderPerformanceRequestVariablePairs(request.variables);
  renderPerformanceExamples(request.examples);
  renderPerformanceCookieJarEditor();
  renderPerformanceAuthEditor(request.auth);
  renderPerformanceVariablePreview();
  updatePerformanceRequestEditorLanguages();
  refreshVariableHighlights($('performanceRequestSection'));
}

function setPerformanceRequestSectionDisabled(disabled) {
  for (const control of document.querySelectorAll('#performanceRequestSection input, #performanceRequestSection select, #performanceRequestSection textarea, #performanceRequestSection button')) {
    control.disabled = disabled;
  }
  for (const button of document.querySelectorAll('.tab[data-tab-group="performanceRequest"]')) {
    button.disabled = disabled;
  }
  const runButton = $('runPerformanceTestButton');
  if (runButton) {
    runButton.disabled = disabled || Boolean(activePerformanceRunId);
  }
  const cancelButton = $('cancelPerformanceTestButton');
  if (cancelButton) {
    cancelButton.disabled = !activePerformanceRunId;
  }
}

function renderPerformancePairs(containerId, pairs) {
  renderEditorRequestPairs({
    doc: document,
    containerId,
    pairs,
    onDirty: () => {
      if (containerId === 'performanceParamsTable') {
        syncPerformanceUrlInputFromParams();
      }
      collectPerformanceTestFromEditor();
      markActivePerformanceDirty();
    },
    onRemove: () => {
      renderPerformanceRequestEditor();
    }
  });
}

function renderPerformanceHeaderPairs(containerId, request) {
  renderEditorRequestPairs({
    doc: document,
    containerId,
    pairs: request?.headers || [],
    onDirty: () => {
      collectPerformanceTestFromEditor();
      markActivePerformanceDirty();
      renderGeneratedHeaderRows(containerId, request);
      renderPerformanceRequestHeaderControls(request);
    },
    onRemove: () => {
      renderPerformanceRequestEditor();
    }
  });
  renderGeneratedHeaderRows(containerId, request);
  renderPerformanceRequestHeaderControls(request);
}

function renderPerformanceAssertions(assertions) {
  renderRequestAssertions({
    doc: document,
    containerId: 'performanceAssertionsTable',
    assertions,
    onDirty: markActivePerformanceDirty,
    onRerender: () => renderPerformanceAssertions(assertions)
  });
}

function renderPerformanceRequestVariablePairs(pairs) {
  renderEditorVariablePairs({
    doc: document,
    containerId: 'performanceRequestVariablesTable',
    pairs,
    onChange: () => {
      markActivePerformanceDirty();
      renderPerformanceVariablePreview();
    },
    onRemove: () => {
      renderPerformanceRequestEditor();
    }
  });
}

function renderPerformanceVariablePreview() {
  const test = activePerformanceTest();
  renderEditorVariablePreview({
    doc: document,
    containerId: 'performanceVariablePreview',
    collection: null,
    environment: performanceSelectedEnvironment(test),
    request: test?.request || null
  });
}

function renderPerformanceExamples(examples) {
  renderRequestExamples(examples, {
    doc: document,
    containerId: 'performanceExamplesList',
    exportButtonId: 'exportPerformanceExamplesButton',
    bodyTypes: EXAMPLE_BODY_TYPES,
    onDirty: markActivePerformanceDirty,
    onDuplicate: duplicatePerformanceExample,
    onDelete: deletePerformanceExample
  });
  CodeEditor.enhanceCodeTextareas?.($('performanceExamplesList'));
}

function renderPerformanceAuthEditor(auth) {
  renderRequestAuthEditor(auth, {
    doc: document,
    idPrefix: 'performance',
    showAuthSection: showPerformanceAuthSection
  });
}

function showPerformanceAuthSection(type) {
  for (const section of document.querySelectorAll('#performanceAuthTab .auth-section')) {
    section.classList.toggle('active', section.dataset.authSection === type);
  }
}

function renderPerformanceCookieJarEditor() {
  renderRequestCookieJarEditor({
    doc: document,
    workspace,
    containerId: 'performanceCookiesTable',
    filterInputId: 'performanceFilterCookiesToRequestHostInput',
    filterLabelId: 'performanceCookieHostFilterLabel',
    activeRequestUrl: activePerformanceTest()?.request?.url || '',
    onDirty: markCookieJarDirty,
    rerender: renderPerformanceCookieJarEditor,
    setStatus
  });
}

function performanceSelectedEnvironment(test = activePerformanceTest()) {
  const environmentId = test?.environmentId || performanceTypeSettings(test, test?.type || 'latency')?.environmentId || 'none';
  return environmentId && environmentId !== 'none'
    ? (workspace.environments || []).find((environment) => environment.id === environmentId) || null
    : null;
}

function renderPerformanceTypeTabs(test) {
  const type = RENDERER_PERFORMANCE_TEST_TYPES.includes(test?.type) ? test.type : 'latency';
  for (const button of document.querySelectorAll('.tab[data-tab-group="performance"]')) {
    const isActive = button.dataset.tab === type;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
    button.disabled = !test;
  }
  for (const panelId of TAB_PANEL_IDS.performance) {
    const panel = $(panelId);
    if (!panel) {
      continue;
    }
    const isActive = panel.id === `${type}Tab`;
    panel.classList.toggle('active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  }
}

function renderPerformanceEnvironmentControls(test) {
  for (const select of document.querySelectorAll('[data-performance-environment]')) {
    const type = performanceTypeForElement(select);
    const settings = performanceTypeSettings(test, type);
    const selectedEnvironmentId = settings.environmentId || 'none';
    select.textContent = '';
    const none = document.createElement('option');
    none.value = 'none';
    none.textContent = 'No Environment';
    select.append(none);
    for (const environment of workspace.environments || []) {
      const option = document.createElement('option');
      option.value = environment.id;
      option.textContent = environment.name || 'Untitled Environment';
      select.append(option);
    }
    select.value = selectedEnvironmentId;
    if (select.value !== selectedEnvironmentId) {
      select.value = 'none';
    }
    select.disabled = !test;
  }
}

function renderPerformanceConfigControls(test) {
  for (const panel of document.querySelectorAll('.performance-type-panel')) {
    const type = performanceTypeForElement(panel);
    const config = performanceTypeSettings(test, type).config || {};
    setPerformancePanelControlValue(panel, 'config', 'iterations', config.iterations || 1);
    setPerformancePanelControlValue(panel, 'config', 'startConcurrency', config.startConcurrency || 1);
    setPerformancePanelControlValue(panel, 'config', 'concurrency', config.concurrency || 1);
    setPerformancePanelControlValue(panel, 'config', 'durationSeconds', config.durationSeconds || 0);
    setPerformancePanelControlValue(panel, 'config', 'rampSteps', config.rampSteps || 1);
    setPerformancePanelControlValue(panel, 'config', 'spikeMultiplier', config.spikeMultiplier || 1);
  }
  setPerformanceControlsDisabled('config', !test);
}

function renderPerformanceSafetyControls(test) {
  for (const panel of document.querySelectorAll('.performance-type-panel')) {
    const type = performanceTypeForElement(panel);
    const safetyLimits = performanceTypeSettings(test, type).safetyLimits || {};
    setPerformancePanelControlValue(panel, 'safety', 'maxTotalRequests', safetyLimits.maxTotalRequests || 100);
    setPerformancePanelControlValue(panel, 'safety', 'maxConcurrency', safetyLimits.maxConcurrency || 10);
    setPerformancePanelControlValue(panel, 'safety', 'maxDurationSeconds', safetyLimits.maxDurationSeconds || 60);
  }
  setPerformanceControlsDisabled('safety', !test);
}

function renderPerformanceMutationControls(test) {
  for (const input of document.querySelectorAll('[data-performance-mutation]')) {
    const type = performanceTypeForElement(input);
    input.checked = performanceTypeSettings(test, type).allowEnvironmentMutation === true;
    input.disabled = !test;
  }
}

function setPerformancePanelControlValue(panel, kind, name, value) {
  const attribute = kind === 'safety' ? 'data-performance-safety' : 'data-performance-config';
  for (const control of panel.querySelectorAll(`[${attribute}="${name}"]`)) {
    control.value = String(value);
  }
}

function setPerformanceControlsDisabled(kind, disabled) {
  const attribute = kind === 'safety' ? 'data-performance-safety' : 'data-performance-config';
  for (const control of document.querySelectorAll(`[${attribute}]`)) {
    control.disabled = disabled;
  }
}

function performanceTypeSettings(test, type) {
  const normalizedType = RENDERER_PERFORMANCE_TEST_TYPES.includes(type) ? type : 'latency';
  const typeSettings = ensurePerformanceTypeSettings(test);
  return typeSettings[normalizedType] || ensurePerformanceTypeSettings(null)[normalizedType];
}

function ensurePerformanceTypeSettings(test) {
  if (!test) {
    return normalizePerformanceTypeSettings();
  }
  test.typeSettings = normalizePerformanceTypeSettings(test.typeSettings, test.type, {
    environmentId: test.environmentId,
    allowEnvironmentMutation: test.allowEnvironmentMutation,
    config: test.config,
    safetyLimits: test.safetyLimits
  }, workspace);
  return test.typeSettings;
}

function performanceTypeForElement(element) {
  const panel = element?.classList?.contains('performance-type-panel')
    ? element
    : element?.closest?.('.performance-type-panel');
  const type = String(panel?.id || '').replace(/Tab$/, '');
  return RENDERER_PERFORMANCE_TEST_TYPES.includes(type) ? type : '';
}

function performanceImportSourceLabel(test) {
  const source = test?.source;
  if (!source || source.sourceType !== 'collection') {
    return 'Manual request entry';
  }
  return `Imported from ${source.collectionName || 'collection'} / ${source.requestName || 'request'}`;
}

function renderRunnerEnvironmentSelect(runner) {
  const select = $('runnerEnvironmentSelect');
  select.textContent = '';
  const none = document.createElement('option');
  none.value = 'none';
  none.textContent = 'No Environment';
  select.append(none);
  for (const environment of workspace.environments || []) {
    const option = document.createElement('option');
    option.value = environment.id;
    option.textContent = environment.name || 'Untitled Environment';
    select.append(option);
  }
  select.value = runner?.environmentId || 'none';
  if (select.value !== (runner?.environmentId || 'none')) {
    select.value = 'none';
  }
  select.disabled = !runner;
}

function renderRunnerRequestList(runner) {
  const root = $('runnerRequestList');
  root.textContent = '';
  if (!runner) {
    return;
  }
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (!runner.requests.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state runner-request-empty';
    empty.textContent = 'No requests in this runner';
    root.append(empty);
    return;
  }
  runner.requests.forEach((request, index) => {
    root.append(runnerRequestRow(runner, request, index));
  });
}

function runnerRequestRow(runner, request, index) {
  const row = document.createElement('div');
  row.className = 'runner-request-row';
  row.draggable = true;
  row.dataset.runnerRequestIndex = String(index);

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'runner-row-handle';
  handle.textContent = '::';
  handle.title = 'Drag to reorder';
  handle.setAttribute('aria-label', `Reorder ${request.name || 'runner request'}`);

  const method = document.createElement('span');
  method.className = `runner-row-method ${methodClassName(request.method || 'GET')}`;
  method.textContent = request.method || 'GET';

  const name = document.createElement('span');
  name.className = 'runner-row-name';
  name.textContent = request.name || 'Untitled Request';

  const url = document.createElement('span');
  url.className = 'runner-row-url';
  url.textContent = request.url || '';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.setAttribute('aria-label', `Edit ${request.name || 'request'} from runner`);
  editButton.addEventListener('click', () => editRunnerRequest(runner, request));

  const moveUp = document.createElement('button');
  moveUp.type = 'button';
  moveUp.textContent = 'Up';
  moveUp.disabled = index === 0;
  moveUp.setAttribute('aria-label', `Move ${request.name || 'request'} up`);
  moveUp.addEventListener('click', () => moveRunnerRequest(runner, index, index - 1));

  const moveDown = document.createElement('button');
  moveDown.type = 'button';
  moveDown.textContent = 'Down';
  moveDown.disabled = index >= runner.requests.length - 1;
  moveDown.setAttribute('aria-label', `Move ${request.name || 'request'} down`);
  moveDown.addEventListener('click', () => moveRunnerRequest(runner, index, index + 1));

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.setAttribute('aria-label', `Delete ${request.name || 'request'} from runner`);
  deleteButton.addEventListener('click', () => deleteRunnerRequest(runner, index));

  row.addEventListener('dragstart', (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    row.classList.add('is-dragging');
  });
  row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
  row.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  row.addEventListener('drop', (event) => {
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData('text/plain'));
    if (Number.isInteger(fromIndex)) {
      moveRunnerRequest(runner, fromIndex, index);
    }
  });

  row.append(handle, method, name, url, editButton, moveUp, moveDown, deleteButton);
  return row;
}

function showAddRunnerRequestMenu(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const runner = activeRunner();
  if (!runner) {
    return;
  }
  const trigger = $('addRunnerRequestButton');
  const rect = trigger.getBoundingClientRect();
  const items = [
    ['New Request', () => addNewRunnerLocalRequest()],
    ['Import', () => { void promptAndImportRunnerRequests(); }]
  ];
  showContextMenu(event?.clientX || rect.left, event?.clientY || rect.bottom + 4, items, {
    trigger,
    focusFirst: event?.detail === 0
  });
}

async function promptAndImportRunnerRequests() {
  const target = await promptRunnerRequestImport();
  if (!target) {
    return null;
  }
  return importRunnerSelection(target);
}

function promptRunnerRequestImport() {
  selectedRunnerImportTarget = [];
  expandedRunnerImportCollectionIds = [];
  lastRunnerImportSelectionKey = '';
  const collections = workspace.collections || [];
  $('runnerImportMessage').textContent = collections.length
    ? 'Choose a collection to expand, then select one or more requests to add to this runner.'
    : 'There are no collections to import from.';
  renderRunnerImportList(collections);
  return showModal('runnerImportModal', null);
}

function renderRunnerImportList(collections = workspace.collections || []) {
  const list = $('runnerImportList');
  list.textContent = '';
  $('confirmRunnerImportButton').disabled = !selectedRunnerImportTargets().length;
  const availableCollections = Array.isArray(collections) ? collections : [];
  if (!availableCollections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'There are no collections to import from.';
    list.append(empty);
    return;
  }
  for (const collection of availableCollections) {
    const entries = collectionRequestEntries(collection);
    const expanded = expandedRunnerImportCollectionIds.includes(collection.id);
    list.append(runnerImportOption({
      type: 'collection',
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
      list.append(runnerImportOption({
        type: 'request',
        collectionId: collection.id,
        requestId: entry.request.id,
        label: `${folderPath}${entry.request.name || 'Untitled Request'}`,
        meta: `${entry.request.method || 'GET'} ${entry.request.url || ''}`.trim(),
        checked: runnerImportTargetSelected({
          type: 'request',
          collectionId: collection.id,
          requestId: entry.request.id
        })
      }));
    }
  }
}

function runnerImportOption(option) {
  if (option.type === 'collection') {
    return runnerImportCollectionOption(option);
  }
  const label = document.createElement('label');
  label.className = `collection-pick-option runner-import-option ${option.type}`;
  label.dataset.runnerImportKey = runnerImportTargetKey(option);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'runnerImportTarget';
  input.dataset.runnerImportType = option.type;
  input.dataset.collectionId = option.collectionId || '';
  input.dataset.requestId = option.requestId || '';
  input.dataset.runnerImportKey = runnerImportTargetKey(option);
  input.checked = option.checked === true;
  input.addEventListener('click', (event) => {
    event.preventDefault();
    updateRunnerImportSelection(runnerImportTargetFromInput(input), {
      shiftKey: event.shiftKey === true
    });
  });
  input.addEventListener('change', () => {
    setRunnerImportTargetChecked(runnerImportTargetFromInput(input), input.checked);
  });
  label.addEventListener('click', (event) => {
    if (event.target === input) {
      return;
    }
    event.preventDefault();
    updateRunnerImportSelection(option, {
      shiftKey: event.shiftKey === true
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

function runnerImportCollectionOption(option) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'collection-pick-option runner-import-option collection';
  button.dataset.runnerImportType = 'collection';
  button.dataset.collectionId = option.collectionId || '';
  button.setAttribute('aria-expanded', option.expanded === true ? 'true' : 'false');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    toggleRunnerImportCollectionExpansion(option.collectionId);
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

function selectedRunnerImportTargets() {
  if (Array.isArray(selectedRunnerImportTarget)) {
    return selectedRunnerImportTarget.filter((target) => target?.type === 'request' && target.collectionId && target.requestId);
  }
  return selectedRunnerImportTarget?.type === 'request' && selectedRunnerImportTarget.collectionId && selectedRunnerImportTarget.requestId
    ? [selectedRunnerImportTarget]
    : [];
}

function setSelectedRunnerImportTargets(targets) {
  const uniqueTargets = [];
  const seen = new Set();
  for (const target of Array.isArray(targets) ? targets : []) {
    const normalized = normalizeRunnerImportTarget(target);
    const key = runnerImportTargetKey(normalized);
    if (normalized.type !== 'request' || !normalized.collectionId || !normalized.requestId || seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueTargets.push(normalized);
  }
  selectedRunnerImportTarget = uniqueTargets;
  $('confirmRunnerImportButton').disabled = !uniqueTargets.length;
}

function normalizeRunnerImportTarget(target = {}) {
  return {
    type: target.type === 'collection' ? 'collection' : 'request',
    collectionId: target.collectionId || '',
    requestId: target.type === 'collection' ? '' : target.requestId || ''
  };
}

function runnerImportTargetKey(target = {}) {
  const normalized = normalizeRunnerImportTarget(target);
  return `${normalized.type}:${normalized.collectionId}:${normalized.requestId}`;
}

function runnerImportTargetSelected(target) {
  const key = runnerImportTargetKey(target);
  return selectedRunnerImportTargets().some((selected) => runnerImportTargetKey(selected) === key);
}

function runnerImportTargetFromInput(input) {
  return {
    type: input.dataset.runnerImportType,
    collectionId: input.dataset.collectionId || '',
    requestId: input.dataset.requestId || ''
  };
}

function updateRunnerImportSelection(target, options = {}) {
  const normalized = normalizeRunnerImportTarget(target);
  if (!normalized.collectionId) {
    return;
  }
  if (normalized.type === 'collection') {
    toggleRunnerImportCollectionExpansion(normalized.collectionId);
    return;
  }
  let nextTargets = selectedRunnerImportTargets();
  if (options.shiftKey && lastRunnerImportSelectionKey) {
    const visibleTargets = visibleRunnerImportTargets();
    const keys = visibleTargets.map(runnerImportTargetKey);
    const anchorIndex = keys.indexOf(lastRunnerImportSelectionKey);
    const targetIndex = keys.indexOf(runnerImportTargetKey(normalized));
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const [from, to] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      nextTargets = [...nextTargets, ...visibleTargets.slice(from, to + 1)];
    } else {
      nextTargets = toggleRunnerImportTarget(nextTargets, normalized);
    }
  } else {
    nextTargets = toggleRunnerImportTarget(nextTargets, normalized);
  }
  lastRunnerImportSelectionKey = runnerImportTargetKey(normalized);
  setSelectedRunnerImportTargets(nextTargets);
  renderRunnerImportList();
}

function setRunnerImportTargetChecked(target, checked) {
  const normalized = normalizeRunnerImportTarget(target);
  if (normalized.type !== 'request' || !normalized.collectionId || !normalized.requestId) {
    return;
  }
  const existing = selectedRunnerImportTargets()
    .filter((selected) => runnerImportTargetKey(selected) !== runnerImportTargetKey(normalized));
  if (checked) {
    existing.push(normalized);
  }
  lastRunnerImportSelectionKey = runnerImportTargetKey(normalized);
  setSelectedRunnerImportTargets(existing);
  renderRunnerImportList();
}

function toggleRunnerImportTarget(targets, target) {
  const key = runnerImportTargetKey(target);
  if (targets.some((selected) => runnerImportTargetKey(selected) === key)) {
    return targets.filter((selected) => runnerImportTargetKey(selected) !== key);
  }
  return [...targets, target];
}

function visibleRunnerImportTargets() {
  return Array.from($('runnerImportList').querySelectorAll('input[data-runner-import-key]'))
    .map(runnerImportTargetFromInput);
}

function expandRunnerImportCollection(collectionId) {
  if (!collectionId || expandedRunnerImportCollectionIds.includes(collectionId)) {
    return;
  }
  expandedRunnerImportCollectionIds = [...expandedRunnerImportCollectionIds, collectionId];
}

function toggleRunnerImportCollectionExpansion(collectionId) {
  if (!collectionId) {
    return;
  }
  expandedRunnerImportCollectionIds = expandedRunnerImportCollectionIds.includes(collectionId)
    ? expandedRunnerImportCollectionIds.filter((id) => id !== collectionId)
    : [...expandedRunnerImportCollectionIds, collectionId];
  renderRunnerImportList();
}

function importRunnerSelection(target) {
  const targets = Array.isArray(target)
    ? target
    : target?.collectionId
      ? [target]
      : selectedRunnerImportTargets();
  if (targets.length) {
    return importRunnerSelections(targets);
  }
  return null;
}

function importRunnerSelections(targets) {
  const runner = activeRunner();
  if (!runner) {
    return null;
  }
  const entries = [];
  const seenRequests = new Set();
  for (const target of targets.map(normalizeRunnerImportTarget)) {
    if (target.type !== 'request' || !target.requestId) {
      continue;
    }
    const collection = (workspace.collections || []).find((item) => item.id === target.collectionId);
    if (!collection) {
      continue;
    }
    const collectionEntries = collectionRequestEntries(collection);
    const selectedEntries = collectionEntries.filter((entry) => entry.request?.id === target.requestId);
    for (const entry of selectedEntries) {
      const requestKey = `${collection.id}:${entry.request?.id || ''}`;
      if (!entry.request || seenRequests.has(requestKey)) {
        continue;
      }
      seenRequests.add(requestKey);
      entries.push(entry);
    }
  }
  if (!entries.length) {
    setStatus('No runner requests were selected to import.');
    return 0;
  }
  const imported = entries.map((entry) => cloneRequestForRunner(entry.request, runnerRequestSourceFromEntry(entry)));
  runner.requests = [...normalizeRunnerRequests(runner.requests), ...imported];
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus(`${imported.length} request${imported.length === 1 ? '' : 's'} imported into runner.`);
  return imported.length;
}

async function promptAndImportPerformanceRequest() {
  const target = await promptRunnerRequestImport();
  if (!target) {
    return null;
  }
  return importPerformanceRequestSelection(Array.isArray(target) ? target[0] : target);
}

function importPerformanceRequestSelection(target) {
  const test = activePerformanceTest();
  const normalized = normalizeRunnerImportTarget(target);
  if (!test || normalized.type !== 'request' || !normalized.collectionId || !normalized.requestId) {
    return null;
  }
  const collection = (workspace.collections || []).find((item) => item.id === normalized.collectionId);
  const entry = collectionRequestEntries(collection).find((candidate) => candidate.request?.id === normalized.requestId);
  if (!entry?.request) {
    setStatus('No request was selected to import.');
    return null;
  }
  const imported = cloneRequestForPerformanceTest(entry.request, runnerRequestSourceFromEntry(entry));
  test.request = imported.request;
  test.source = imported.source;
  markActivePerformanceDirty();
  renderPerformanceEditor();
  setStatus('Request imported into performance test.');
  return test.request;
}

async function startPerformanceCalibration() {
  if (activePerformanceCalibrationId) {
    return setStatus('Performance calibration is already running.');
  }
  const performanceApi = window.postmeter?.performance;
  if (!performanceApi?.calibrate) {
    return setStatus('Performance calibration is unavailable in this runtime.');
  }
  const calibrationId = crypto.randomUUID();
  activePerformanceCalibrationId = calibrationId;
  renderPerformanceCalibrationRunning();
  const modalClosed = showModal('performanceCalibrationModal', null).then(() => {
    if (activePerformanceCalibrationId === calibrationId) {
      void cancelPerformanceCalibration(calibrationId);
    }
  });
  try {
    const result = await performanceApi.calibrate(calibrationId);
    if (activePerformanceCalibrationId !== calibrationId) {
      await modalClosed;
      return result;
    }
    activePerformanceCalibrationId = null;
    renderPerformanceCalibrationResult(result);
    setStatus(result?.cancelled ? 'Performance calibration cancelled.' : 'Performance calibration completed.');
    return result;
  } catch (error) {
    const message = error.message || String(error);
    if (activePerformanceCalibrationId === calibrationId) {
      activePerformanceCalibrationId = null;
      renderPerformanceCalibrationError(message);
      setStatus(`Performance calibration failed: ${message}`);
      notifyUser('Performance Calibration Failed', message);
    }
    return null;
  }
}

function closePerformanceCalibrationModal() {
  const calibrationId = activePerformanceCalibrationId;
  if (calibrationId) {
    void cancelPerformanceCalibration(calibrationId);
  }
  resolveActiveModal(null);
}

async function cancelPerformanceCalibration(calibrationId) {
  if (activePerformanceCalibrationId === calibrationId) {
    activePerformanceCalibrationId = null;
  }
  try {
    await window.postmeter?.performance?.cancelCalibration?.(calibrationId);
    setStatus('Performance calibration cancelled.');
    return true;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Performance calibration cancellation failed: ${message}`);
    return false;
  }
}

function renderPerformanceCalibrationRunning() {
  const body = $('performanceCalibrationBody');
  if (!body) {
    return;
  }
  body.textContent = '';
  const row = document.createElement('div');
  row.className = 'performance-calibration-running';
  const spinner = document.createElement('span');
  spinner.className = 'performance-calibration-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = 'Running extended local calibration...';
  row.append(spinner, text);
  const progressWrap = document.createElement('div');
  progressWrap.className = 'performance-calibration-progress';
  const progressLabel = document.createElement('div');
  progressLabel.id = 'performanceCalibrationProgressLabel';
  progressLabel.className = 'performance-calibration-progress-label';
  progressLabel.textContent = 'Preparing calibration...';
  const progressBar = document.createElement('progress');
  progressBar.id = 'performanceCalibrationProgressBar';
  progressBar.max = 100;
  progressBar.value = 0;
  const progressDetail = document.createElement('div');
  progressDetail.id = 'performanceCalibrationProgressDetail';
  progressDetail.className = 'performance-calibration-progress-detail';
  progressDetail.textContent = 'Starting local loopback server.';
  progressWrap.append(progressLabel, progressBar, progressDetail);
  const note = document.createElement('p');
  note.className = 'performance-calibration-note';
  note.textContent = 'This usually finishes in about two minutes while PostMeter runs warmup, bounded target-rate probes, and short verification passes.';
  body.append(row, progressWrap, note);
}

function renderPerformanceCalibrationProgress(progress = {}) {
  const bar = $('performanceCalibrationProgressBar');
  const label = $('performanceCalibrationProgressLabel');
  const detail = $('performanceCalibrationProgressDetail');
  if (!bar || !label || !detail) {
    return;
  }
  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
  bar.value = percent;
  const phaseLabel = progress.phaseLabel || 'Calibration';
  label.textContent = `${phaseLabel} ${Math.round(percent)}%`;
  const pieces = [];
  if (progress.targetRequestsPerSecond) {
    pieces.push(`${formatNumber(progress.targetRequestsPerSecond)} RPS`);
  }
  if (progress.stageIndex && progress.stageCount) {
    pieces.push(`stage ${formatNumber(progress.stageIndex)} of ${formatNumber(progress.stageCount)}`);
  }
  if (progress.pass && progress.passes) {
    pieces.push(`pass ${formatNumber(progress.pass)} of ${formatNumber(progress.passes)}`);
  }
  if (progress.completedRequests || progress.totalRequests) {
    pieces.push(`${formatNumber(progress.completedRequests || 0)} of ${formatNumber(progress.totalRequests || 0)} requests`);
  }
  detail.textContent = pieces.length ? pieces.join(' | ') : (progress.message || 'Running calibration...');
}

function renderPerformanceCalibrationResult(result = {}) {
  const body = $('performanceCalibrationBody');
  if (!body) {
    return;
  }
  body.textContent = '';
  const summary = result.summary || {};
  const grid = document.createElement('div');
  grid.className = 'performance-calibration-summary';
  grid.append(
    calibrationMetric('Max sustained local RPS', `${formatNumber(summary.reliableTargetRequestsPerSecond)} RPS`),
    calibrationMetric('Planning cap', `${formatNumber(summary.recommendedMaxRequestsPerSecond)} RPS`),
    calibrationMetric('Sustained RPS', formatNumber(summary.sustainedRequestsPerSecond)),
    calibrationMetric('Peak RPS', formatNumber(summary.peakRequestsPerSecond)),
    calibrationMetric('Next failed target', summary.edgeUpperBoundRequestsPerSecond ? `${formatNumber(summary.edgeUpperBoundRequestsPerSecond)} RPS` : 'Not found'),
    calibrationMetric('Measurement variation', `${formatNumber(summary.measurementVariationPercent)}%`),
    calibrationMetric('Repeatability', `${formatNumber(summary.repeatabilityPercent)}%`),
    calibrationMetric('Confidence', summary.confidence || 'low'),
    calibrationMetric('P95 latency', `${formatNumber(summary.p95LatencyMillis)} ms`),
    calibrationMetric('P95 scheduler lag', `${formatNumber(summary.p95StartLagMillis)} ms`),
    calibrationMetric('P95 event-loop delay', `${formatNumber(summary.p95EventLoopDelayMillis)} ms`),
    calibrationMetric('Stability', `${formatNumber(summary.stabilityPercent)}%`)
  );

  const stages = document.createElement('div');
  stages.className = 'performance-calibration-stages';
  for (const stage of Array.isArray(result.stages) ? result.stages : []) {
    const row = document.createElement('div');
    row.className = 'performance-calibration-stage';
    if (stage.accepted === true) {
      row.classList.add('is-accepted');
    } else if (stage.accepted === false) {
      row.classList.add('is-rejected');
    }
    const status = stage.accepted === true ? 'PASS' : 'CHECK';
    const target = stage.targetRequestsPerSecond ? `${formatNumber(stage.targetRequestsPerSecond)} target` : `${stage.concurrency || 0} clients`;
    const failureReasons = Array.isArray(stage.failureReasons) ? stage.failureReasons.join('; ') : '';
    if (failureReasons) {
      row.title = failureReasons;
    }
    row.append(
      calibrationStageCell(stage.name || 'Stage', true),
      calibrationStageCell(target),
      calibrationStageCell(`${formatNumber(stage.requestsPerSecond)} RPS`),
      calibrationStageCell(`lag ${formatNumber(stage.p95StartLagMillis)} ms`),
      calibrationStageCell(`EL ${formatNumber(stage.p95EventLoopDelayMillis)} ms`),
      calibrationStageCell(`${stage.completedRequests || 0} requests`),
      calibrationStageCell(status)
    );
    stages.append(row);
  }

  const note = document.createElement('p');
  note.className = 'performance-calibration-note';
  const notes = Array.isArray(summary.notes) ? summary.notes : [];
  note.textContent = notes.join(' ');
  body.append(grid, stages, note);
}

function renderPerformanceCalibrationError(message) {
  const body = $('performanceCalibrationBody');
  if (!body) {
    return;
  }
  body.textContent = '';
  const text = document.createElement('p');
  text.className = 'performance-calibration-note';
  text.textContent = `Calibration failed: ${message}`;
  body.append(text);
}

function calibrationMetric(label, value) {
  const item = document.createElement('div');
  item.className = 'performance-calibration-metric';
  const labelElement = document.createElement('span');
  labelElement.textContent = label;
  const valueElement = document.createElement('strong');
  valueElement.textContent = value;
  item.append(labelElement, valueElement);
  return item;
}

function calibrationStageCell(value, strong = false) {
  const element = document.createElement(strong ? 'strong' : 'span');
  element.textContent = String(value || '');
  return element;
}

async function runActivePerformanceTest() {
  const test = activePerformanceTest();
  if (!test) {
    return setStatus('Select a performance test before running it.');
  }
  if (activePerformanceRunId) {
    return setStatus('A performance test is already running.');
  }
  collectPerformanceTestFromEditor();
  if (!test.request?.url) {
    return setStatus('Enter a request URL before running a performance test.');
  }
  const performanceApi = window.postmeter?.performance;
  if (!performanceApi?.start) {
    return setStatus('Performance execution is unavailable in this runtime.');
  }
  const runId = crypto.randomUUID();
  const runEnvironment = test.environmentId && test.environmentId !== 'none'
    ? (workspace.environments || []).find((environment) => environment.id === test.environmentId) || null
    : null;
  const runContext = {
    performanceTestId: test.id,
    workspaceId: activeWorkspaceId
  };
  lastPerformanceResult = null;
  selectedPerformanceResultIndex = 0;
  performanceExecutionPage = 0;
  performanceExecutionStatusFilter = 'all';
  activePerformanceRunId = runId;
  renderPerformanceProgress({ completedRequests: 0, totalRequests: test.config?.iterations || 0, activeRequests: 0 });
  renderPerformanceEditor();
  try {
    await saveWorkspace(false, { collectEditors: false });
    const normalized = normalizePerformanceTest(cloneJson(test), workspace);
    const result = await performanceApi.start(runId, normalized, cloneJson(runEnvironment));
    if (!isActivePerformanceContext(runContext) || activePerformanceRunId !== runId) {
      return result;
    }
    applyPerformanceRunResult(result, runEnvironment, test);
    selectedPerformanceResultIndex = 0;
    performanceExecutionPage = 0;
    performanceExecutionStatusFilter = 'all';
    renderPerformanceResult(result);
    await saveWorkspace(false, { collectEditors: false });
    setStatus(result.cancelled ? 'Performance test cancelled.' : 'Performance test completed.');
    return result;
  } catch (error) {
    const message = error.message || String(error);
    if (isActivePerformanceContext(runContext) && activePerformanceRunId === runId) {
      lastPerformanceResult = null;
      renderPerformanceMessage(message);
      setStatus('Performance test failed.');
      notifyUser('Performance Test Failed', message);
    }
    return null;
  } finally {
    if (activePerformanceRunId === runId) {
      activePerformanceRunId = null;
      renderPerformanceEditor();
    }
  }
}

async function exportActivePerformanceTest(test = activePerformanceTest()) {
  if (!test) {
    return setStatus('Select a performance test before exporting.');
  }
  const performanceApi = window.postmeter?.performance;
  if (!performanceApi?.exportTest) {
    return setStatus('Performance export is unavailable in this runtime.');
  }
  if (!window.postmeter?.fileExport) {
    if (test.id === activePerformanceTestId) {
      collectPerformanceTestFromEditor();
    }
    try {
      const result = await performanceApi.exportTest(normalizePerformanceTest(cloneJson(test), workspace), 'postmeter');
      if (result?.path) {
        setStatus(`Performance test exported to ${result.path}.`);
      }
      return result;
    } catch (error) {
      const message = error.message || String(error);
      setStatus(`Performance test export failed: ${message}`);
      notifyUser('Performance Test Export Failed', message);
      return null;
    }
  }
  return runPickerFirstExport({
    kind: 'performance',
    format: 'postmeter',
    name: performanceTestDisplayName(test),
    payloadFactory: () => {
      if (test.id === activePerformanceTestId) {
        collectPerformanceTestFromEditor();
      }
      return normalizePerformanceTest(cloneJson(test), workspace);
    },
    legacyExport: () => performanceApi.exportTest(normalizePerformanceTest(cloneJson(test), workspace), 'postmeter'),
    successStatus: (filePath) => `Performance test exported to ${filePath}.`,
    failureStatusPrefix: 'Performance test export failed',
    failureTitle: 'Performance Test Export Failed',
    unavailableStatus: 'Performance export is unavailable in this runtime.'
  });
}

async function exportPerformanceTestFromPicker() {
  const tests = ensureWorkspacePerformanceTests();
  const selectedTest = await promptForItemExport('performance', tests, activePerformanceTest() || tests[0] || null);
  if (!selectedTest) {
    return null;
  }
  return exportActivePerformanceTest(selectedTest);
}

async function importPerformanceTest() {
  const performanceApi = window.postmeter?.performance;
  if (!performanceApi?.importTest) {
    return setStatus('Performance import is unavailable in this runtime.');
  }
  try {
    const filePath = typeof window.__postmeterImportPerformanceTest === 'function'
      ? undefined
      : await chooseImportFilePath('performance');
    if (filePath === null) {
      return null;
    }
    const importBoundary = window.__postmeterImportPerformanceTest || performanceApi.importTest;
    const result = filePath == null ? await importBoundary() : await importBoundary(filePath);
    if (result?.cancelled) {
      return null;
    }
    if (!result?.performanceTest) {
      return setStatus('No performance test was imported.');
    }
    if (!canOpenAdditionalPerformanceTab()) {
      return null;
    }
    collectActiveEditorState();
    const tests = ensureWorkspacePerformanceTests();
    const imported = normalizePerformanceTest(cloneJson(result.performanceTest), workspace);
    if (tests.some((candidate) => candidate.id === imported.id)) {
      imported.id = crypto.randomUUID();
    }
    imported.name = uniqueName(imported.name || 'Imported Performance Test', tests.map((candidate) => candidate.name));
    tests.push(imported);
    activeRunnerRequestRunnerId = null;
    activePerformanceTestId = imported.id;
    activeSidebarPanel = 'performance';
    activeMainPanel = 'performance';
    ensureOpenPerformanceTabForActive({ dirty: true, createdUnsaved: true });
    activePerformanceOutputTabId = 'performanceOutputResultsTab';
    renderAll();
    await savePerformanceTestFromPane();
    setStatus(`Imported performance test: ${performanceTestDisplayName(imported)}.`);
    return imported;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Performance test import failed: ${message}`);
    notifyUser('Performance Test Import Failed', message);
    return null;
  }
}

async function cancelPerformanceTestRun() {
  if (!activePerformanceRunId) {
    return false;
  }
  try {
    await window.postmeter?.performance?.cancel?.(activePerformanceRunId);
    setStatus('Cancelling performance test...');
    return true;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Performance cancellation failed: ${message}`);
    return false;
  }
}

function isActivePerformanceContext(context) {
  return context?.workspaceId === activeWorkspaceId
    && context?.performanceTestId === activePerformanceTestId
    && activeMainPanel === 'performance';
}

function applyPerformanceRunResult(result, runEnvironment, test) {
  lastPerformanceResult = result;
  if (result?.environmentMutationAllowed === true && runEnvironment && (result.mutatedEnvironment || result.environment)) {
    for (const key of Object.keys(runEnvironment)) {
      delete runEnvironment[key];
    }
    Object.assign(runEnvironment, result.mutatedEnvironment || result.environment);
    renderEnvironmentSelect();
    renderEnvironments();
    renderEnvironmentEditor();
  }
  if (Array.isArray(result?.cookies)) {
    workspace.cookies = result.cookies;
    renderCookieJarEditor();
  }
  if (test?.resultsMetadata) {
    test.resultsMetadata.lastRunAt = result?.completedAt || new Date().toISOString();
    test.resultsMetadata.lastResultId = result?.id || '';
    test.resultsMetadata.lastStatus = result?.cancelled ? 'cancelled' : result?.passed ? 'passed' : 'failed';
    test.resultsMetadata.runCount = Number(test.resultsMetadata.runCount || 0) + 1;
    test.resultsMetadata.updatedAt = new Date().toISOString();
  }
}

function renderPerformanceProgress(progress = {}) {
  ensurePerformanceResultsStructure();
  const completed = Number(progress.completedRequests || 0);
  const total = Number(progress.totalRequests || 0);
  const active = Number(progress.activeRequests || 0);
  const requestName = progress.requestName ? ` Last: ${progress.requestName}.` : '';
  $('performanceResultsSummary').textContent = `Running performance test... ${completed}/${total || '?'} completed, ${active} active.${requestName}`;
  $('performanceRunDetails').textContent = '';
  appendEmptyTestResult($('performanceRunDetails'), 'Waiting for aggregate performance results.');
  $('performanceExecutionSummary').textContent = total ? `${completed}/${total} completed` : 'Running';
  $('performanceExecutionList').textContent = '';
  appendEmptyTestResult($('performanceExecutionList'), completed ? 'Waiting for final request details.' : 'Waiting for the first request to complete.');
  clearExecutionPagination('performanceExecutionPagination');
  clearExecutionStatusFilter('performanceExecutionStatusFilter');
  $('performanceExecutionDetailsStatus').textContent = 'Running';
  $('performanceExecutionDetails').textContent = '';
  appendEmptyTestResult($('performanceExecutionDetails'), 'Performance execution is still in progress.');
}

function renderPerformanceMessage(message) {
  ensurePerformanceResultsStructure();
  $('performanceResultsSummary').textContent = message || 'No performance run yet.';
  $('performanceRunDetails').textContent = '';
  appendEmptyTestResult($('performanceRunDetails'), message || 'No performance run yet.');
  $('performanceExecutionSummary').textContent = 'No requests';
  $('performanceExecutionList').textContent = '';
  appendEmptyTestResult($('performanceExecutionList'), message || 'No performance execution yet.');
  clearExecutionPagination('performanceExecutionPagination');
  clearExecutionStatusFilter('performanceExecutionStatusFilter');
  $('performanceExecutionDetailsStatus').textContent = 'No selection';
  $('performanceExecutionDetails').textContent = '';
  appendEmptyTestResult($('performanceExecutionDetails'), 'Select a completed request to inspect its performance details.');
}

function renderPerformanceResult(result = lastPerformanceResult) {
  ensurePerformanceResultsStructure();
  if (!result) {
    renderPerformanceMessage('No performance run yet.');
    return;
  }
  const samples = Array.isArray(result.samples) ? result.samples : [];
  performanceExecutionStatusFilter = renderExecutionStatusFilter({
    selectId: 'performanceExecutionStatusFilter',
    items: samples,
    selected: performanceExecutionStatusFilter,
    onChange: (status) => {
      performanceExecutionStatusFilter = status;
      performanceExecutionPage = 0;
      selectedPerformanceResultIndex = firstFilteredExecutionIndex(samples, performanceExecutionStatusFilter);
      renderPerformanceResult(lastPerformanceResult);
    }
  });
  const filteredSamples = filteredExecutionEntries(samples, performanceExecutionStatusFilter);
  selectedPerformanceResultIndex = selectedExecutionIndexForEntries(selectedPerformanceResultIndex, filteredSamples);
  const summary = result.summary || {};
  const statusCodes = Object.entries(summary.statusCodes || {})
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ') || 'none';
  $('performanceResultsSummary').textContent = [
    `${result.completedRequests || 0}/${result.totalRequests || 0} requests completed`,
    `${result.successfulRequests || 0} successful`,
    `${result.failedRequests || 0} failed${result.cancelled ? ', cancelled' : ''}`,
    `RPS ${formatNumber(summary.requestsPerSecond)}`,
    `p95 ${formatNumber(summary.p95DurationMillis)} ms`,
    `statuses ${statusCodes}`
  ].join(' | ');
  renderPerformanceRunDetails(result);
  performanceExecutionPage = executionPageForFilteredEntries(selectedPerformanceResultIndex, filteredSamples, performanceExecutionPage);
  const pageRange = executionPageRange(filteredSamples.length, performanceExecutionPage);
  const visibleSamples = filteredSamples.slice(pageRange.startIndex, pageRange.endIndex);
  $('performanceExecutionSummary').textContent = filteredSamples.length
    ? executionFilterSummaryText(pageRange, filteredSamples.length, samples.length, 'sample', performanceExecutionStatusFilter)
    : 'No requests';

  const list = $('performanceExecutionList');
  list.textContent = '';
  if (!samples.length) {
    appendEmptyTestResult(list, 'No performance request results were recorded.');
  } else if (!filteredSamples.length) {
    appendEmptyTestResult(list, 'No performance request results match this status filter.');
  } else {
    visibleSamples.forEach((entry) => list.append(performanceExecutionRow(entry.item, entry.index)));
  }
  renderExecutionPagination({
    containerId: 'performanceExecutionPagination',
    label: 'Performance request results',
    onPageChange: (nextPage) => {
      performanceExecutionPage = nextPage;
      const nextRange = executionPageRange(filteredSamples.length, nextPage);
      selectedPerformanceResultIndex = filteredSamples[nextRange.startIndex]?.index ?? 0;
      renderPerformanceResult(lastPerformanceResult);
    },
    page: performanceExecutionPage,
    totalItems: filteredSamples.length
  });
  renderPerformanceExecutionDetails(result);
}

function ensurePerformanceResultsStructure() {
  const root = $('performanceResults');
  if (!root) {
    return null;
  }
  if ($('performanceResultsSummary') && $('performanceRunDetails') && $('performanceExecutionList') && $('performanceExecutionDetails')) {
    return root;
  }
  root.textContent = '';

  const tabs = document.createElement('div');
  tabs.className = 'tabs performance-output-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Performance output sections');
  tabs.dataset.tabGroup = 'performanceOutput';

  const resultsTabButton = document.createElement('button');
  resultsTabButton.id = 'performanceOutputResultsTabButton';
  resultsTabButton.className = 'tab active';
  resultsTabButton.type = 'button';
  resultsTabButton.setAttribute('role', 'tab');
  resultsTabButton.dataset.tabGroup = 'performanceOutput';
  resultsTabButton.dataset.tab = 'performanceOutputResults';
  resultsTabButton.setAttribute('aria-selected', 'true');
  resultsTabButton.setAttribute('aria-controls', 'performanceOutputResultsTab');
  resultsTabButton.textContent = 'Results';
  resultsTabButton.addEventListener('click', () => activateTab('performanceOutput', 'performanceOutputResults'));

  const requestsTabButton = document.createElement('button');
  requestsTabButton.id = 'performanceOutputRequestsTabButton';
  requestsTabButton.className = 'tab';
  requestsTabButton.type = 'button';
  requestsTabButton.setAttribute('role', 'tab');
  requestsTabButton.dataset.tabGroup = 'performanceOutput';
  requestsTabButton.dataset.tab = 'performanceOutputRequests';
  requestsTabButton.setAttribute('aria-selected', 'false');
  requestsTabButton.setAttribute('aria-controls', 'performanceOutputRequestsTab');
  requestsTabButton.textContent = 'Requests';
  requestsTabButton.addEventListener('click', () => activateTab('performanceOutput', 'performanceOutputRequests'));

  const graphsTabButton = document.createElement('button');
  graphsTabButton.id = 'performanceOutputGraphsTabButton';
  graphsTabButton.className = 'tab';
  graphsTabButton.type = 'button';
  graphsTabButton.setAttribute('role', 'tab');
  graphsTabButton.dataset.tabGroup = 'performanceOutput';
  graphsTabButton.dataset.tab = 'performanceOutputGraphs';
  graphsTabButton.setAttribute('aria-selected', 'false');
  graphsTabButton.setAttribute('aria-controls', 'performanceOutputGraphsTab');
  graphsTabButton.textContent = 'Graphs';
  graphsTabButton.addEventListener('click', () => activateTab('performanceOutput', 'performanceOutputGraphs'));
  tabs.append(resultsTabButton, requestsTabButton, graphsTabButton);

  const resultsPanel = document.createElement('div');
  resultsPanel.id = 'performanceOutputResultsTab';
  resultsPanel.className = 'tab-panel performance-output-panel active';
  resultsPanel.setAttribute('role', 'tabpanel');
  resultsPanel.setAttribute('aria-labelledby', 'performanceOutputResultsTabButton');

  const summary = document.createElement('div');
  summary.id = 'performanceResultsSummary';
  summary.className = 'test-results-summary';
  summary.textContent = 'No performance run yet.';

  const runDetails = document.createElement('div');
  runDetails.id = 'performanceRunDetails';
  runDetails.className = 'runner-execution-details performance-run-details';
  appendEmptyTestResult(runDetails, 'No performance run yet.');

  resultsPanel.append(summary, runDetails);

  const requestsPanel = document.createElement('div');
  requestsPanel.id = 'performanceOutputRequestsTab';
  requestsPanel.className = 'tab-panel performance-output-panel';
  requestsPanel.setAttribute('role', 'tabpanel');
  requestsPanel.setAttribute('aria-labelledby', 'performanceOutputRequestsTabButton');

  const grid = document.createElement('div');
  grid.className = 'runner-execution-grid performance-execution-grid';
  grid.append(
    performanceResultSection('performanceExecutionTitle', 'Requests', 'performanceExecutionSummary', 'No requests', 'performanceExecutionList', 'No performance execution yet.'),
    performanceResultSection('performanceExecutionDetailsTitle', 'Request details', 'performanceExecutionDetailsStatus', 'No selection', 'performanceExecutionDetails', 'Select a completed request to inspect its performance details.')
  );
  requestsPanel.append(grid);

  const graphsPanel = document.createElement('div');
  graphsPanel.id = 'performanceOutputGraphsTab';
  graphsPanel.className = 'tab-panel performance-output-panel performance-graphs-panel';
  graphsPanel.setAttribute('role', 'tabpanel');
  graphsPanel.setAttribute('aria-labelledby', 'performanceOutputGraphsTabButton');
  appendEmptyTestResult(graphsPanel, 'No graphs yet.');

  root.append(tabs, resultsPanel, requestsPanel, graphsPanel);
  return root;
}

function performanceResultSection(titleId, titleText, summaryId, summaryText, bodyId, emptyText) {
  const section = document.createElement('section');
  section.className = `script-results-section ${bodyId === 'performanceExecutionList' ? 'runner-execution-section' : 'runner-detail-section'}`;
  section.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'script-results-header';
  const title = document.createElement('h3');
  title.id = titleId;
  title.textContent = titleText;
  const summary = document.createElement('span');
  summary.id = summaryId;
  summary.className = 'script-results-count';
  summary.textContent = summaryText;
  if (bodyId === 'performanceExecutionList') {
    header.append(executionStatusFilterTitleRow(title, 'performanceExecutionStatusFilter', 'Filter performance requests by status code'));
  } else {
    header.append(title);
  }
  header.append(summary);

  const body = document.createElement('div');
  body.id = bodyId;
  body.className = bodyId === 'performanceExecutionList' ? 'runner-execution-list' : 'runner-execution-details';
  if (bodyId === 'performanceExecutionList') {
    body.setAttribute('aria-live', 'polite');
  }
  appendEmptyTestResult(body, emptyText);

  section.append(header, body);
  if (bodyId === 'performanceExecutionList') {
    const pagination = document.createElement('div');
    pagination.id = 'performanceExecutionPagination';
    pagination.className = 'runner-execution-pagination';
    pagination.hidden = true;
    section.append(pagination);
  }
  return section;
}

function performanceExecutionRow(sample, index) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `runner-execution-row${index === selectedPerformanceResultIndex ? ' active' : ''}`;
  row.dataset.performanceExecutionIndex = String(index);
  row.setAttribute('aria-pressed', index === selectedPerformanceResultIndex ? 'true' : 'false');
  row.setAttribute('aria-label', `Show details for ${sample?.requestName || 'request'} iteration ${sample?.iteration || index + 1} with status ${runnerStatusLabel(sample)}`);
  row.addEventListener('click', () => {
    selectedPerformanceResultIndex = index;
    renderPerformanceResult(lastPerformanceResult);
  });

  const badge = document.createElement('span');
  badge.className = `runner-status-badge ${runnerStatusClass(sample)}`;
  badge.textContent = runnerStatusLabel(sample);

  const content = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'runner-execution-name';
  name.textContent = sample?.requestName || 'Performance Request';
  const meta = document.createElement('span');
  meta.className = 'runner-execution-meta';
  meta.textContent = performanceExecutionMeta(sample);
  content.append(name, meta);
  row.append(badge, content);
  return row;
}

function performanceExecutionMeta(sample = {}) {
  const request = performanceRequestForExecutionItem(sample);
  const iteration = Number.isFinite(Number(sample.iteration)) ? `#${Number(sample.iteration)}` : '';
  const method = request?.method || '';
  const url = request?.url || '';
  const duration = Number.isFinite(Number(sample.durationMillis)) ? `${formatNumber(sample.durationMillis)} ms` : '';
  return [iteration, method, url, duration].filter(Boolean).join(' ');
}

function renderPerformanceExecutionDetails(result = lastPerformanceResult) {
  const samples = Array.isArray(result?.samples) ? result.samples : [];
  const sample = samples[selectedPerformanceResultIndex] || null;
  const status = $('performanceExecutionDetailsStatus');
  const details = $('performanceExecutionDetails');
  if (!details || !status) {
    return;
  }
  details.textContent = '';
  if (!sample) {
    status.textContent = 'No selection';
    appendEmptyTestResult(details, 'Select a completed request to inspect its performance details.');
    return;
  }
  status.textContent = runnerStatusLabel(sample);
  const request = performanceRequestForExecutionItem(sample);
  details.append(performanceExecutionOverview(sample, request));
  if (sample.error) {
    details.append(runnerDetailTextBlock('Error', sample.error, 'runner-detail-error'));
  }
  appendRunnerAssertionDetails(details, sample.assertionResults || []);
  appendRunnerScriptResultDetails(details, 'Pre-request', sample.preRequestScriptResult);
  appendRunnerScriptResultDetails(details, 'Post-request', sample.testScriptResult);
  appendRunnerVariableDetails(details, 'Extracted variables', sample.extractedVariables || []);
  appendRunnerVariableDetails(details, 'Request variables', sample.localVariables || []);
  appendRunnerVariableDetails(details, 'Environment variables', result?.environment?.variables || []);
  appendRunnerResponseBodyDetails(details, sample);
}

function renderPerformanceRunDetails(result = lastPerformanceResult) {
  const details = $('performanceRunDetails');
  if (!details) {
    return;
  }
  details.textContent = '';
  if (!result) {
    appendEmptyTestResult(details, 'No performance run yet.');
    return;
  }
  appendPerformanceRunSummary(details, result);
  appendPerformanceErrorSummary(details, result);
}

function performanceExecutionOverview(sample = {}, request = null) {
  const block = document.createElement('div');
  block.className = 'runner-detail-block';
  const heading = document.createElement('h4');
  heading.className = 'runner-detail-heading';
  heading.textContent = sample.requestName || request?.name || 'Performance Request';
  const target = document.createElement('div');
  target.className = 'runner-detail-meta';
  target.textContent = [request?.method || '', request?.url || ''].filter(Boolean).join(' ');
  const metrics = document.createElement('div');
  metrics.className = 'runner-detail-meta';
  metrics.textContent = [
    Number.isFinite(Number(sample.iteration)) ? `Iteration ${Number(sample.iteration)}` : '',
    `Status ${runnerStatusLabel(sample)}`,
    Number.isFinite(Number(sample.durationMillis)) ? `${formatNumber(sample.durationMillis)} ms` : '',
    sample.startedAt ? `Started ${sample.startedAt}` : ''
  ].filter(Boolean).join(' | ');
  block.append(heading, target, metrics);
  return block;
}

function appendPerformanceRunSummary(details, result = {}) {
  const summary = result.summary || {};
  const block = runnerDetailBlock('Run summary');
  for (const [key, value] of [
    ['Completed', `${result.completedRequests || 0}/${result.totalRequests || 0}`],
    ['Successful', String(result.successfulRequests || 0)],
    ['Failed', String(result.failedRequests || 0)],
    ['RPS', formatNumber(summary.requestsPerSecond)],
    ['Average', `${formatNumber(summary.averageDurationMillis)} ms`],
    ['P95', `${formatNumber(summary.p95DurationMillis)} ms`],
    ['P99', `${formatNumber(summary.p99DurationMillis)} ms`],
    ['Min / Max', `${formatNumber(summary.minDurationMillis)} / ${formatNumber(summary.maxDurationMillis)} ms`],
    ['Statuses', Object.entries(summary.statusCodes || {}).map(([status, count]) => `${status}: ${count}`).join(', ') || 'none']
  ]) {
    const row = document.createElement('div');
    row.className = 'runner-detail-variable';
    const label = document.createElement('span');
    label.textContent = key;
    const text = document.createElement('span');
    text.textContent = value;
    row.append(label, text);
    block.append(row);
  }
  details.append(block);
}

function appendPerformanceErrorSummary(details, result = {}) {
  const errors = Object.entries(result.summary?.errors || {});
  if (!errors.length) {
    return;
  }
  const block = runnerDetailBlock('Errors');
  for (const [message, count] of errors) {
    const row = document.createElement('div');
    row.className = 'runner-detail-variable';
    const label = document.createElement('span');
    label.textContent = String(count);
    const text = document.createElement('span');
    text.textContent = message;
    row.append(label, text);
    block.append(row);
  }
  details.append(block);
}

function performanceRequestForExecutionItem(sample = {}) {
  const test = activePerformanceTest();
  if (!test?.request) {
    return null;
  }
  if (!sample.requestId || sample.requestId === test.request.id) {
    return test.request;
  }
  return null;
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return '0';
  }
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function addNewRunnerLocalRequest() {
  const runner = activeRunner();
  if (!runner) {
    return null;
  }
  runner.requests = normalizeRunnerRequests(runner.requests);
  runner.requests.push(newRequestObject(uniqueName('New Request', runner.requests.map((request) => request.name))));
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus('Runner request added.');
  return runner.requests.at(-1);
}

function editRunnerRequest(runner, request) {
  if (!runner || !request) {
    return null;
  }
  collectActiveEditorState();
  runner.requests = Array.isArray(runner.requests) ? runner.requests : [];
  const target = runner.requests.find((item) => item.id === request.id);
  if (!target || !canOpenRunnerRequestTabFor(runner.id, target.id)) {
    return null;
  }
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = target.id;
  activeRunnerRequestRunnerId = runner.id;
  activeRunnerConfigId = runner.id;
  activeSidebarPanel = 'runners';
  activeMainPanel = 'request';
  ensureOpenRequestTabForActive();
  renderAll();
  setStatus('Opened runner request for editing.');
  return target;
}

function addCollectionRequestToRunner(entry) {
  const runner = activeRunner();
  const request = entry?.request || entry;
  if (!runner || !request) {
    return null;
  }
  runner.requests = normalizeRunnerRequests(runner.requests);
  runner.requests.push(cloneRequestForRunner(request, runnerRequestSourceFromEntry(entry)));
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus('Request added to runner.');
  return runner.requests.at(-1);
}

function importCollectionIntoRunner(collection) {
  const runner = activeRunner();
  if (!runner || !collection) {
    return 0;
  }
  const requests = collectionRequestEntries(collection).map((entry) => cloneRequestForRunner(entry.request, runnerRequestSourceFromEntry(entry)));
  runner.requests = [...normalizeRunnerRequests(runner.requests), ...requests];
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus(`${requests.length} request${requests.length === 1 ? '' : 's'} imported into runner.`);
  return requests.length;
}

function collectionRequestEntries(collection) {
  const entries = [];
  for (const request of collection?.requests || []) {
    entries.push({ collection, request, folder: null, folderPath: [] });
  }
  const walkFolder = (folder, folderPath) => {
    const nextFolderPath = [...folderPath, folder.name || 'Untitled Folder'];
    for (const request of folder.requests || []) {
      entries.push({ collection, request, folder, folderPath: nextFolderPath });
    }
    for (const child of folder.folders || []) {
      walkFolder(child, nextFolderPath);
    }
  };
  for (const folder of collection?.folders || []) {
    walkFolder(folder, []);
  }
  return entries;
}

function runnerRequestSourceFromEntry(entry = {}) {
  const collection = entry.collection || null;
  const request = entry.request || entry;
  const folder = entry.folder || null;
  const source = {
    collectionId: collection?.id || '',
    collectionName: collection?.name || '',
    folderId: folder?.id || '',
    folderName: folder?.name || '',
    requestId: request?.id || '',
    requestName: request?.name || ''
  };
  if (Array.isArray(entry.folderPath) && entry.folderPath.length) {
    source.folderPath = entry.folderPath;
  }
  return source;
}

function normalizeRunnerRequestSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }
  const normalized = {};
  for (const key of ['collectionId', 'collectionName', 'folderId', 'folderName', 'requestId', 'requestName']) {
    const value = String(source[key] || '').trim();
    if (value) {
      normalized[key] = value.slice(0, 512);
    }
  }
  if (Array.isArray(source.folderPath)) {
    const folderPath = source.folderPath
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    if (folderPath.length) {
      normalized.folderPath = folderPath;
    }
  }
  return normalized;
}

function cloneRequestForRunner(request, source = {}) {
  const clone = cloneJson(request) || newRequestObject(request?.name || 'Untitled Request');
  clone.id = crypto.randomUUID();
  clone.name = String(clone.name || request?.name || 'Untitled Request');
  const normalizedSource = normalizeRunnerRequestSource(source);
  if (Object.keys(normalizedSource).length) {
    clone.source = normalizedSource;
  } else {
    delete clone.source;
  }
  return normalizeRunnerRequest(clone);
}

function moveRunnerRequest(runner, fromIndex, toIndex) {
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= runner.requests.length || toIndex >= runner.requests.length) {
    return;
  }
  const [request] = runner.requests.splice(fromIndex, 1);
  runner.requests.splice(toIndex, 0, request);
  markActiveRunnerDirty();
  renderRunnerEditor();
}

function deleteRunnerRequest(runner, index) {
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (index < 0 || index >= runner.requests.length) {
    return;
  }
  runner.requests.splice(index, 1);
  markActiveRunnerDirty();
  renderRunnerEditor();
}

function ensureWorkspaceRunners() {
  workspace ||= {};
  workspace.runners = normalizeWorkspaceRunners(workspace.runners);
  return workspace.runners;
}

function normalizeWorkspaceRunners(value) {
  return Array.isArray(value)
    ? value.filter((runner) => runner && typeof runner === 'object').map(normalizeRunner)
    : [];
}

function normalizeRunner(runner) {
  runner.id = String(runner.id || crypto.randomUUID());
  runner.name = String(runner.name || 'Untitled Runner');
  runner.environmentId = String(runner.environmentId || 'none') || 'none';
  runner.stopOnFailure = runner.stopOnFailure === true;
  runner.allowEnvironmentMutation = runner.allowEnvironmentMutation === true;
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (runner.environmentId !== 'none' && !(workspace.environments || []).some((environment) => environment.id === runner.environmentId)) {
    runner.environmentId = 'none';
  }
  return runner;
}

function normalizeRunnerRequests(value) {
  return Array.isArray(value)
    ? value.filter((request) => request && typeof request === 'object').map(normalizeRunnerRequest)
    : [];
}

function normalizeRunnerRequest(request) {
  const normalized = {
    ...newRequestObject(request.name || 'Untitled Request'),
    ...request
  };
  normalized.id = String(request.id || crypto.randomUUID());
  normalized.method = METHODS.includes(String(normalized.method || '').toUpperCase()) ? String(normalized.method).toUpperCase() : 'GET';
  normalized.name = String(normalized.name || 'Untitled Request');
  normalized.url = String(normalized.url || '');
  normalized.queryParams = Array.isArray(normalized.queryParams) ? normalized.queryParams : [];
  normalized.headers = Array.isArray(normalized.headers) ? normalized.headers : [];
  normalized.assertions = Array.isArray(normalized.assertions) ? normalized.assertions : [];
  normalized.variables = Array.isArray(normalized.variables) ? normalized.variables : [];
  normalized.examples = Array.isArray(normalized.examples) ? normalized.examples : [];
  normalized.scripts = normalized.scripts && typeof normalized.scripts === 'object' ? normalized.scripts : { preRequest: '', tests: '' };
  normalized.auth = normalized.auth && typeof normalized.auth === 'object' ? normalized.auth : { type: 'none' };
  return normalized;
}

function normalizeImportedEnvironment(environment = {}) {
  return {
    id: String(environment.id || crypto.randomUUID()),
    name: String(environment.name || 'Untitled Environment'),
    variables: Array.isArray(environment.variables)
      ? environment.variables
        .filter((variable) => variable && typeof variable === 'object')
        .map((variable) => ({
          enabled: variable.enabled !== false,
          key: String(variable.key || ''),
          value: String(variable.value ?? '')
        }))
      : []
  };
}

function cloneJson(value) {
  if (value == null) {
    return null;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
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
    stopOnFailure: false,
    allowEnvironmentMutation: false,
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
    theme: workspace?.settings?.appearance?.theme || 'system',
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
    theme: workspaceItem?.theme || 'system',
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
  const button = treeButton(collection.name, collection.id === activeCollectionId && !activeRequestId, 'COL', {
    treeKind: 'collection',
    treeId: collection.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'collection',
    id: collection.id
  });
  button.addEventListener('click', () => {
    const firstRequest = firstRequestInCollection(collection);
    if (firstRequest?.request && !canOpenRequestTabFor(collection.id, firstRequest.request.id)) {
      return;
    }
    collectActiveEditorState();
    activeRunnerRequestRunnerId = null;
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
    ['Duplicate', () => { void duplicateCollection(collection); }],
    ['Export', [
      ['PostMeter', () => exportCollection(collection, 'postmeter')],
      ['Postman', () => exportCollection(collection, 'postman')],
      ['OpenAPI', () => exportCollection(collection, 'openapi')],
      ['curl', () => exportCollection(collection, 'curl')]
    ]],
    ['Delete', () => deleteCollection(collection), 'danger']
  ]);
  appendSidebarTreeRows(wrapper, sidebarTreeChildRows(collection, collection, null), { className: 'tree-folder' });
  return wrapper;
}

function folderNode(collection, folder) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node tree-folder folder-node';
  const button = treeButton(folder.name, folder.id === activeFolderId && !activeRequestId, 'DIR', {
    treeKind: 'folder',
    treeId: folder.id
  });
  appendSidebarTreeRow(wrapper, button, {
    kind: 'folder',
    id: folder.id,
    collectionId: collection.id
  });
  button.addEventListener('click', () => {
    const firstRequest = firstRequestInFolder(folder);
    if (firstRequest?.request && !canOpenRequestTabFor(collection.id, firstRequest.request.id)) {
      return;
    }
    collectActiveEditorState();
    activeRunnerRequestRunnerId = null;
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
    ['Duplicate', () => { void duplicateFolder(folder); }],
    ['Delete', () => deleteFolder(collection, folder), 'danger']
  ]);
  appendSidebarTreeRows(wrapper, sidebarTreeChildRows(folder, collection, folder), { className: 'tree-folder' });
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
  badge.textContent = kind;
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = text;
  button.append(badge, label);
  return button;
}

function appendSidebarTreeRow(wrapper, button, payload) {
  button.__postmeterDropBars = {};
  attachSidebarTreeDrag(button, payload);
  wrapper.__postmeterTreePayload = payload;
  wrapper.__postmeterTreeButton = button;
  wrapper.append(button);
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

function tagClassName(kind) {
  const methodClass = methodClassName(kind);
  if (methodClass) {
    return methodClass;
  }
  const normalizedKind = String(kind || '').trim().toLowerCase();
  const entityClassByKind = {
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

function bodyControlId(prefix, id) {
  return prefix ? `${prefix}${id.charAt(0).toUpperCase()}${id.slice(1)}` : id;
}

function bodyElement(prefix, id) {
  return $(bodyControlId(prefix, id));
}

function bodyModeForRequest(request) {
  const mode = String(request?.postmanBody?.mode || '').toLowerCase();
  if (mode === 'graphql' || request?.protocol === 'graphql' || hasGraphqlBody(request)) {
    return 'GRAPHQL';
  }
  if (mode === 'formdata' || mode === 'form-data') {
    return 'FORM_DATA';
  }
  if (mode === 'urlencoded') {
    return 'URLENCODED';
  }
  if (mode === 'binary' || mode === 'file') {
    return 'BINARY';
  }
  if (mode === 'raw') {
    return 'RAW';
  }
  if (request?.bodyType === 'FORM_DATA') {
    return 'FORM_DATA';
  }
  if (request?.bodyType === 'URLENCODED') {
    return 'URLENCODED';
  }
  if (request?.bodyType === 'BINARY') {
    return 'BINARY';
  }
  if (BODY_TYPE_RAW_FORMATS[request?.bodyType] || request?.body) {
    return 'RAW';
  }
  return 'NONE';
}

function rawFormatForRequest(request) {
  const language = request?.postmanBody?.mode === 'raw'
    ? request.postmanBody?.options?.raw?.language
    : '';
  return normalizeRawBodyFormat(language || BODY_TYPE_RAW_FORMATS[request?.bodyType] || 'text');
}

function normalizeRawBodyFormat(value) {
  const format = String(value || 'text').toLowerCase();
  if (format === 'js') {
    return 'javascript';
  }
  return RAW_BODY_FORMATS.includes(format) ? format : 'text';
}

function rawBodyEditorLanguage(format) {
  const normalized = normalizeRawBodyFormat(format);
  if (normalized === 'json' || normalized === 'javascript') {
    return normalized;
  }
  if (normalized === 'html' || normalized === 'xml') {
    return 'markup';
  }
  return 'text';
}

function rawBodyTextForRequest(request) {
  if (String(request?.postmanBody?.mode || '').toLowerCase() === 'raw') {
    return String(request.postmanBody.raw ?? '');
  }
  return String(request?.body || '');
}

function hasGraphqlBody(request) {
  if (!request) {
    return false;
  }
  const graphql = request.postmanBody?.graphql || request.graphql;
  return graphql && typeof graphql === 'object' && Object.keys(graphql).length > 0;
}

function graphqlBodyForRequestEditor(request) {
  const source = request?.postmanBody?.graphql && typeof request.postmanBody.graphql === 'object' && Object.keys(request.postmanBody.graphql).length
    ? request.postmanBody.graphql
    : request?.graphql && typeof request.graphql === 'object' && Object.keys(request.graphql).length
      ? request.graphql
      : parseJsonObjectForBodyEditor(request?.body);
  return {
    operationName: source?.operationName == null ? '' : String(source.operationName),
    query: source?.query == null ? '' : String(source.query),
    variables: graphqlVariablesTextForBodyEditor(source?.variables)
  };
}

function graphqlVariablesTextForBodyEditor(value) {
  if (value == null || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonObjectForBodyEditor(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || !/^[{[]/.test(text)) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function renderRequestBodyEditor(prefix, request) {
  const mode = request ? bodyModeForRequest(request) : 'NONE';
  const modeSelect = bodyElement(prefix, 'bodyTypeSelect');
  const rawSelect = bodyElement(prefix, 'bodyRawFormatSelect');
  if (modeSelect) {
    modeSelect.value = BODY_MODES.includes(mode) ? mode : 'NONE';
  }
  if (rawSelect) {
    rawSelect.value = rawFormatForRequest(request);
  }
  const rawInput = bodyElement(prefix, 'bodyInput');
  if (rawInput) {
    rawInput.value = request ? rawBodyTextForRequest(request) : '';
  }
  renderBodyFormDataRows(prefix, request ? formDataRowsForRequest(request) : []);
  renderBodyUrlencodedRows(prefix, request ? urlencodedRowsForRequest(request) : []);
  const binary = binaryBodyForRequest(request);
  setValue(bodyControlId(prefix, 'binaryBodySourceInput'), binary.source);
  const graphql = graphqlBodyForRequestEditor(request);
  setValue(bodyControlId(prefix, 'graphqlQueryInput'), graphql.query);
  setValue(bodyControlId(prefix, 'graphqlVariablesInput'), graphql.variables);
  setValue(bodyControlId(prefix, 'graphqlOperationNameInput'), graphql.operationName);
  updateBodyModePanels(prefix);
  updateBodyEditorLanguage(prefix);
}

function updateBodyModePanels(prefix) {
  const mode = bodyElement(prefix, 'bodyTypeSelect')?.value || 'NONE';
  const panels = {
    NONE: 'bodyNonePanel',
    RAW: 'bodyRawPanel',
    FORM_DATA: 'bodyFormDataPanel',
    URLENCODED: 'bodyUrlencodedPanel',
    BINARY: 'bodyBinaryPanel',
    GRAPHQL: 'bodyGraphqlPanel'
  };
  for (const [candidate, panelId] of Object.entries(panels)) {
    bodyElement(prefix, panelId)?.classList.toggle('active', mode === candidate);
  }
  const rawField = bodyElement(prefix, 'bodyRawFormatField');
  if (rawField) {
    rawField.hidden = mode !== 'RAW';
  }
}

function updateBodyEditorLanguage(prefix) {
  updateBodyModePanels(prefix);
  const format = bodyElement(prefix, 'bodyRawFormatSelect')?.value || 'text';
  CodeEditor.setLanguage?.(bodyElement(prefix, 'bodyInput'), rawBodyEditorLanguage(format));
  CodeEditor.setLanguage?.(bodyElement(prefix, 'graphqlQueryInput'), 'text');
  CodeEditor.setLanguage?.(bodyElement(prefix, 'graphqlVariablesInput'), 'json');
}

function formDataRowsForRequest(request) {
  const body = request?.postmanBody || {};
  if (!['formdata', 'form-data'].includes(String(body.mode || '').toLowerCase())) {
    return [];
  }
  const rows = [];
  for (const part of Array.isArray(body.formdata) ? body.formdata : []) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const type = part.src != null || String(part.type || '').toLowerCase() === 'file' ? 'file' : 'text';
    const sources = type === 'file' && Array.isArray(part.src) ? part.src : [part.src];
    if (type === 'file') {
      for (const source of sources) {
        rows.push({
          enabled: part.disabled !== true && part.enabled !== false,
          key: part.key == null ? '' : String(part.key),
          type,
          value: source == null ? '' : String(source)
        });
      }
      continue;
    }
    rows.push({
      enabled: part.disabled !== true && part.enabled !== false,
      key: part.key == null ? '' : String(part.key),
      type,
      value: part.value == null ? '' : String(part.value)
    });
  }
  return rows;
}

function urlencodedRowsForRequest(request) {
  const body = request?.postmanBody || {};
  if (String(body.mode || '').toLowerCase() !== 'urlencoded') {
    return [];
  }
  return (Array.isArray(body.urlencoded) ? body.urlencoded : [])
    .filter((part) => part && typeof part === 'object')
    .map((part) => ({
      enabled: part.disabled !== true && part.enabled !== false,
      key: part.key == null ? '' : String(part.key),
      value: part.value == null ? '' : String(part.value)
    }));
}

function binaryBodyForRequest(request) {
  const body = request?.postmanBody || {};
  const mode = String(body.mode || '').toLowerCase();
  const binary = mode === 'file' ? body.file : body.binary;
  return {
    source: binary?.src == null ? '' : String(binary.src),
    contentType: binary?.contentType == null ? '' : String(binary.contentType)
  };
}

function renderBodyFormDataRows(prefix, rows) {
  const container = bodyElement(prefix, 'formDataBodyTable');
  if (!container) {
    return;
  }
  container.textContent = '';
  for (const row of rows) {
    container.append(createBodyFormDataRow(prefix, row));
  }
  refreshVariableHighlights(container);
}

function createBodyFormDataRow(prefix, row = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'body-form-data-row';
  wrapper.dataset.bodyFormDataRow = 'true';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = row.enabled !== false;
  enabled.setAttribute('aria-label', 'Form-data field enabled');
  const type = document.createElement('select');
  type.dataset.bodyFormDataField = 'type';
  type.append(new Option('Text', 'text'), new Option('File', 'file'));
  type.value = row.type === 'file' ? 'file' : 'text';
  const key = document.createElement('input');
  key.dataset.bodyFormDataField = 'key';
  key.placeholder = 'Key';
  key.value = row.key || '';
  const value = document.createElement('input');
  value.dataset.bodyFormDataField = 'value';
  value.value = row.value || '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    wrapper.remove();
    collectBodyEditorAndMarkDirty(prefix);
  });
  const syncType = () => {
    const isFile = type.value === 'file';
    value.placeholder = isFile ? 'File source' : 'Value';
    updateLocalFileSourceInputState(value, { enabled: isFile, prefix, mode: 'formdata' });
    if (!isFile) {
      closeFileSourceMenu();
    }
  };
  configureLocalFileSourceInput(value, prefix, 'formdata');
  for (const control of [enabled, type, key, value]) {
    const eventType = control.tagName === 'SELECT' || control.type === 'checkbox' ? 'change' : 'input';
    control.addEventListener(eventType, () => {
      syncType();
      collectBodyEditorAndMarkDirty(prefix);
    });
  }
  syncType();
  wrapper.append(enabled, type, key, value, remove);
  return wrapper;
}

function renderBodyUrlencodedRows(prefix, rows) {
  const container = bodyElement(prefix, 'urlencodedBodyTable');
  if (!container) {
    return;
  }
  container.textContent = '';
  for (const row of rows) {
    container.append(createBodyUrlencodedRow(prefix, row));
  }
  refreshVariableHighlights(container);
}

function createBodyUrlencodedRow(prefix, row = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'body-urlencoded-row';
  wrapper.dataset.bodyUrlencodedRow = 'true';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = row.enabled !== false;
  enabled.setAttribute('aria-label', 'URL-encoded field enabled');
  const key = document.createElement('input');
  key.dataset.bodyUrlencodedField = 'key';
  key.placeholder = 'Key';
  key.value = row.key || '';
  const value = document.createElement('input');
  value.dataset.bodyUrlencodedField = 'value';
  value.placeholder = 'Value';
  value.value = row.value || '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    wrapper.remove();
    collectBodyEditorAndMarkDirty(prefix);
  });
  for (const control of [enabled, key, value]) {
    const eventType = control.type === 'checkbox' ? 'change' : 'input';
    control.addEventListener(eventType, () => collectBodyEditorAndMarkDirty(prefix));
  }
  wrapper.append(enabled, key, value, remove);
  return wrapper;
}

function addBodyFormDataRow(prefix) {
  const container = bodyElement(prefix, 'formDataBodyTable');
  container?.append(createBodyFormDataRow(prefix, { enabled: true, key: '', type: 'text', value: '' }));
  refreshVariableHighlights(container);
  collectBodyEditorAndMarkDirty(prefix);
}

function addBodyUrlencodedRow(prefix) {
  const container = bodyElement(prefix, 'urlencodedBodyTable');
  container?.append(createBodyUrlencodedRow(prefix, { enabled: true, key: '', value: '' }));
  refreshVariableHighlights(container);
  collectBodyEditorAndMarkDirty(prefix);
}

function collectBodyEditorAndMarkDirty(prefix) {
  if (prefix === 'performance') {
    collectPerformanceTestAndMarkDirty();
  } else {
    collectRequestAndMarkDirty();
  }
}

function collectBodyFromEditor(prefix, request = {}) {
  const mode = bodyElement(prefix, 'bodyTypeSelect')?.value || 'NONE';
  if (mode === 'RAW') {
    const format = normalizeRawBodyFormat(bodyElement(prefix, 'bodyRawFormatSelect')?.value || 'text');
    const body = bodyElement(prefix, 'bodyInput')?.value || '';
    return {
      body,
      bodyType: RAW_FORMAT_BODY_TYPES[format] || 'RAW_TEXT',
      postmanBody: {
        mode: 'raw',
        raw: body,
        options: {
          raw: {
            language: format
          }
        }
      }
    };
  }
  if (mode === 'FORM_DATA') {
    const formdata = collectBodyFormDataRows(prefix);
    return {
      body: '',
      bodyType: 'FORM_DATA',
      postmanBody: {
        mode: 'formdata',
        formdata
      }
    };
  }
  if (mode === 'URLENCODED') {
    const urlencoded = collectBodyUrlencodedRows(prefix);
    return {
      body: '',
      bodyType: 'URLENCODED',
      postmanBody: {
        mode: 'urlencoded',
        urlencoded
      }
    };
  }
  if (mode === 'BINARY') {
    const source = bodyElement(prefix, 'binaryBodySourceInput')?.value.trim() || '';
    const contentType = source ? detectFileContentType(source) : '';
    return {
      body: '',
      bodyType: source ? 'BINARY' : 'NONE',
      postmanBody: {
        mode: 'binary',
        binary: {
          src: source,
          contentType
        }
      }
    };
  }
  if (mode === 'GRAPHQL') {
    const graphql = {
      query: bodyElement(prefix, 'graphqlQueryInput')?.value || '',
      variables: bodyElement(prefix, 'graphqlVariablesInput')?.value || '',
      operationName: bodyElement(prefix, 'graphqlOperationNameInput')?.value.trim() || ''
    };
    return {
      body: JSON.stringify(graphql),
      bodyType: 'RAW_JSON',
      graphql,
      postmanBody: {
        mode: 'graphql',
        graphql
      },
      protocol: 'graphql'
    };
  }
  return {
    body: '',
    bodyType: 'NONE',
    postmanBody: {}
  };
}

function collectBodyFormDataRows(prefix) {
  return Array.from(bodyElement(prefix, 'formDataBodyTable')?.querySelectorAll('[data-body-form-data-row]') || [])
    .map((row) => {
      const type = row.querySelector('[data-body-form-data-field="type"]')?.value === 'file' ? 'file' : 'text';
      const key = row.querySelector('[data-body-form-data-field="key"]')?.value || '';
      const value = row.querySelector('[data-body-form-data-field="value"]')?.value || '';
      const base = {
        disabled: row.querySelector('input[type="checkbox"]')?.checked === false,
        key,
        type
      };
      return type === 'file'
        ? { ...base, src: value }
        : { ...base, value };
    })
    .filter((row) => row.key || row.value || row.src);
}

function collectBodyUrlencodedRows(prefix) {
  return Array.from(bodyElement(prefix, 'urlencodedBodyTable')?.querySelectorAll('[data-body-urlencoded-row]') || [])
    .map((row) => ({
      disabled: row.querySelector('input[type="checkbox"]')?.checked === false,
      key: row.querySelector('[data-body-urlencoded-field="key"]')?.value || '',
      value: row.querySelector('[data-body-urlencoded-field="value"]')?.value || ''
    }))
    .filter((row) => row.key || row.value);
}

function syncRequestBodyFieldsFromEditor(prefix, request) {
  if (!request) {
    return;
  }
  const body = collectBodyFromEditor(prefix, request);
  request.bodyType = BODY_TYPES.includes(body.bodyType) ? body.bodyType : 'NONE';
  request.body = body.body;
  request.postmanBody = body.postmanBody;
  if (body.protocol === 'graphql') {
    request.protocol = 'graphql';
    request.graphql = cloneJson(body.graphql) || {
      query: '',
      variables: '',
      operationName: ''
    };
  } else if (request.protocol === 'graphql') {
    request.protocol = 'http';
    delete request.graphql;
  }
  syncPostmanFileReferences(request);
}

function syncPostmanFileReferences(request) {
  if (!request) {
    return;
  }
  const references = fileReferencesFromPostmanBody(request.postmanBody);
  if (references.length) {
    request.postman = {
      ...(request.postman || {}),
      fileReferences: references
    };
    return;
  }
  if (request.postman?.fileReferences) {
    request.postman = { ...(request.postman || {}) };
    delete request.postman.fileReferences;
    if (!Object.keys(request.postman).length) {
      delete request.postman;
    }
  }
}

function fileReferencesFromPostmanBody(postmanBody) {
  const mode = String(postmanBody?.mode || '').toLowerCase();
  if (mode === 'binary' || mode === 'file') {
    const body = mode === 'file' ? postmanBody.file : postmanBody.binary;
    const source = String(body?.src || '').trim();
    return source ? [{
      contentType: body?.contentType == null ? '' : String(body.contentType),
      key: '',
      mode: 'binary',
      source
    }] : [];
  }
  if (mode !== 'formdata' && mode !== 'form-data') {
    return [];
  }
  const references = [];
  for (const part of Array.isArray(postmanBody.formdata) ? postmanBody.formdata : []) {
    if (!part || typeof part !== 'object' || part.disabled === true || part.enabled === false) {
      continue;
    }
    const isFile = part.src != null || String(part.type || '').toLowerCase() === 'file';
    if (!isFile) {
      continue;
    }
    const sources = Array.isArray(part.src) ? part.src : [part.src];
    for (const source of sources) {
      const normalized = String(source || '').trim();
      if (!normalized) {
        continue;
      }
      references.push({
        contentType: '',
        key: part.key == null ? '' : String(part.key),
        mode: 'formdata',
        source: normalized
      });
    }
  }
  return references;
}

function updateRequestEditorLanguages() {
  updateRequestBodyEditorLanguage();
  CodeEditor.setLanguage?.($('preRequestScriptInput'), 'javascript');
  CodeEditor.setLanguage?.($('testScriptInput'), 'javascript');
}

function updatePerformanceRequestEditorLanguages() {
  updatePerformanceRequestBodyEditorLanguage();
  CodeEditor.setLanguage?.($('performancePreRequestScriptInput'), 'javascript');
  CodeEditor.setLanguage?.($('performanceTestScriptInput'), 'javascript');
}

function updateRequestBodyEditorLanguage() {
  updateBodyEditorLanguage('');
}

function updatePerformanceRequestBodyEditorLanguage() {
  updateBodyEditorLanguage('performance');
}

function ensureRequestQueryEditorMirror(request) {
  if (!request) {
    return;
  }
  request.queryParams = Array.isArray(request.queryParams) ? request.queryParams : [];
  const urlQuery = splitEditorUrlQuery(request.url || '').query;
  if (enabledEditorQueryParams(request.queryParams).length > 0 && !urlQuery) {
    request.url = editorUrlWithQueryParams(request.url || '', request.queryParams);
    return;
  }
  if (!request.queryParams.length && urlQuery) {
    request.queryParams = queryParamsFromEditorUrl(request.url || '');
  }
}

function syncRequestParamsFromUrlInput() {
  const request = activeRequest();
  const input = $('urlInput');
  if (!request || !input) {
    return;
  }
  request.queryParams = queryParamsFromEditorUrl(input.value);
  renderPairs('paramsTable', request.queryParams, 'queryParams');
}

function syncRequestUrlInputFromParams() {
  const request = activeRequest();
  const input = $('urlInput');
  if (!request || !input) {
    return;
  }
  request.queryParams = collectKeyValueRowsFromTable('paramsTable', request.queryParams || []);
  const nextUrl = editorUrlWithQueryParams(input.value, request.queryParams);
  if (input.value !== nextUrl) {
    input.value = nextUrl;
  }
  request.url = nextUrl.trim();
  refreshVariableHighlights(input);
}

function syncPerformanceParamsFromUrlInput() {
  const request = activePerformanceTest()?.request;
  const input = $('performanceUrlInput');
  if (!request || !input) {
    return;
  }
  request.queryParams = queryParamsFromEditorUrl(input.value);
  renderPerformancePairs('performanceParamsTable', request.queryParams);
}

function syncPerformanceUrlInputFromParams() {
  const request = activePerformanceTest()?.request;
  const input = $('performanceUrlInput');
  if (!request || !input) {
    return;
  }
  request.queryParams = collectKeyValueRowsFromTable('performanceParamsTable', request.queryParams || []);
  const nextUrl = editorUrlWithQueryParams(input.value, request.queryParams);
  if (input.value !== nextUrl) {
    input.value = nextUrl;
  }
  request.url = nextUrl.trim();
  refreshVariableHighlights(input);
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
    renderRequestBodyEditor('', null);
    $('preRequestScriptInput').value = '';
    $('testScriptInput').value = '';
    $('paramsTable').textContent = '';
    $('headersTable').textContent = '';
    $('assertionsTable').textContent = '';
    $('examplesList').textContent = '';
    $('requestVariablesTable').textContent = '';
    $('cookiesTable').textContent = '';
    renderRequestHeaderControls(null);
    $('requestCookieJarEnabledInput').checked = false;
    $('requestCookieJarStoreInput').checked = true;
    $('addRequestVariableButton').disabled = true;
    $('addExampleButton').disabled = true;
    $('captureResponseExampleButton').disabled = true;
    $('exportExamplesButton').disabled = true;
    renderAuthEditor({ type: 'none' });
    updateRequestEditorLanguages();
    refreshVariableHighlights($('requestEditorPanel'));
    return;
  }
  ensureRequestQueryEditorMirror(request);
  $('saveRequestButton').disabled = false;
  $('addRequestVariableButton').disabled = false;
  $('addExampleButton').disabled = false;
  $('captureResponseExampleButton').disabled = !canCaptureResponseExampleForRequest(request);
  $('exportExamplesButton').disabled = !(request.examples || []).length;
  renderRequestTitle(request);
  $('methodSelect').value = request.method;
  updateMethodSelectClass();
  $('urlInput').value = request.url;
  renderRequestBodyEditor('', request);
  request.scripts ||= { preRequest: '', tests: '' };
  $('preRequestScriptInput').value = request.scripts.preRequest || '';
  $('testScriptInput').value = request.scripts.tests || '';
  request.cookieJar ||= { enabled: false, storeResponses: true };
  ensureRequestAutoHeaders(request);
  $('requestCookieJarEnabledInput').checked = request.cookieJar.enabled === true;
  $('requestCookieJarStoreInput').checked = request.cookieJar.storeResponses !== false;
  renderPairs('paramsTable', request.queryParams || [], 'queryParams');
  renderHeaderPairs('headersTable', request);
  renderAssertions(request.assertions || []);
  renderRequestVariablePairs(request.variables || []);
  renderExamples(request.examples || []);
  renderCookieJarEditor();
  renderAuthEditor(request.auth || { type: 'none' });
  updateRequestEditorLanguages();
  refreshVariableHighlights($('requestEditorPanel'));
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
    bodyTypes: EXAMPLE_BODY_TYPES,
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
  for (const section of document.querySelectorAll('#authTab .auth-section')) {
    section.classList.toggle('active', section.dataset.authSection === type);
  }
}

function renderPairs(containerId, pairs, fieldName) {
  renderEditorRequestPairs({
    doc: document,
    containerId,
    pairs,
    onDirty: () => {
      if (fieldName === 'queryParams') {
        syncRequestUrlInputFromParams();
      }
      collectRequestFromEditor();
      markActiveRequestDirty();
    },
    onRemove: () => {
      renderRequestEditor();
    }
  });
}

function renderHeaderPairs(containerId, request) {
  renderEditorRequestPairs({
    doc: document,
    containerId,
    pairs: request?.headers || [],
    onDirty: () => {
      collectRequestFromEditor();
      markActiveRequestDirty();
      renderGeneratedHeaderRows(containerId, request);
      renderRequestHeaderControls(request);
    },
    onRemove: () => {
      renderRequestEditor();
    }
  });
  renderGeneratedHeaderRows(containerId, request);
  renderRequestHeaderControls(request);
}

function renderRequestHeaderControls(request) {
  renderAutoHeaderControls({
    request,
    tokenInputId: 'sendPostMeterTokenInput',
    showInputId: 'showGeneratedHeadersInput',
    labelId: 'showGeneratedHeadersLabel'
  });
}

function renderPerformanceRequestHeaderControls(request) {
  renderAutoHeaderControls({
    request,
    tokenInputId: 'performanceSendPostMeterTokenInput',
    showInputId: 'performanceShowGeneratedHeadersInput',
    labelId: 'performanceShowGeneratedHeadersLabel'
  });
}

function renderAutoHeaderControls({ request, tokenInputId, showInputId, labelId }) {
  const autoHeaders = request ? ensureRequestAutoHeaders(request) : { sendPostMeterToken: false, showGeneratedHeaders: false };
  const generatedCount = request ? generatedRequestHeaders(request).length : 0;
  const tokenInput = $(tokenInputId);
  if (tokenInput) {
    tokenInput.checked = autoHeaders.sendPostMeterToken === true;
    tokenInput.disabled = !request;
  }
  const showInput = $(showInputId);
  if (showInput) {
    showInput.checked = autoHeaders.showGeneratedHeaders === true;
    showInput.disabled = !request || generatedCount === 0;
  }
  const label = $(labelId);
  if (label) {
    label.textContent = autoHeaders.showGeneratedHeaders
      ? `Hide auto-generated headers (${generatedCount})`
      : `Show auto-generated headers (${generatedCount})`;
  }
}

function renderGeneratedHeaderRows(containerId, request) {
  const container = $(containerId);
  if (!container) {
    return;
  }
  for (const row of container.querySelectorAll('[data-generated-header="true"]')) {
    row.remove();
  }
  if (!request) {
    return;
  }
  const autoHeaders = ensureRequestAutoHeaders(request);
  if (!autoHeaders.showGeneratedHeaders) {
    return;
  }
  for (const header of generatedRequestHeaders(request)) {
    container.append(createGeneratedHeaderRow(header));
  }
  refreshVariableHighlights(container);
}

function createGeneratedHeaderRow(header) {
  const row = document.createElement('div');
  row.className = 'kv-row generated-header-row';
  row.dataset.generatedHeader = 'true';
  row.title = 'Auto-generated when the request is sent';

  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = true;
  enabled.disabled = true;

  const key = document.createElement('input');
  key.value = header.key;
  key.readOnly = true;
  key.setAttribute('aria-label', `Auto-generated ${header.key} header`);

  const value = document.createElement('input');
  value.value = header.value;
  value.readOnly = true;
  value.setAttribute('aria-label', `Auto-generated ${header.key} header value`);

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.textContent = 'Auto';
  badge.disabled = true;

  row.append(enabled, key, value, badge);
  return row;
}

function generatedRequestHeaders(request) {
  const headers = [];
  addGeneratedHeader(headers, request, 'Accept', '*/*');
  addGeneratedHeader(headers, request, 'User-Agent', POSTMETER_USER_AGENT);
  addGeneratedHeader(headers, request, 'Host', generatedHostHeaderValue(request));
  addGeneratedHeader(headers, request, 'Accept-Encoding', 'gzip, deflate, br');
  addGeneratedHeader(headers, request, 'Connection', 'keep-alive');
  if (ensureRequestAutoHeaders(request).sendPostMeterToken) {
    addGeneratedHeader(headers, request, 'PostMeter-Token', AUTO_HEADER_PLACEHOLDER);
  }
  if (requestSendsBody(request)) {
    addGeneratedHeader(headers, request, 'Content-Type', defaultGeneratedContentTypeForRequest(request));
    addGeneratedHeader(headers, request, 'Content-Length', AUTO_HEADER_PLACEHOLDER);
  }
  for (const header of generatedAuthHeaders(request)) {
    addGeneratedHeader(headers, request, header.key, header.value);
  }
  return headers;
}

function addGeneratedHeader(headers, request, key, value) {
  if (!key || enabledHeaderValue(request, key) != null) {
    return;
  }
  headers.push({ key, value });
}

function generatedAuthHeaders(request) {
  const auth = request?.auth || {};
  const type = auth.type || 'none';
  if (['bearer', 'basic', 'oauth2', 'digest', 'hawk', 'aws', 'oauth1', 'ntlm', 'akamaiEdgeGrid', 'jwtBearer', 'asap'].includes(type)) {
    return [{ key: 'Authorization', value: AUTO_HEADER_PLACEHOLDER }];
  }
  if (type === 'apiKey' && (auth.location || 'header') !== 'query' && String(auth.key || '').trim()) {
    return [{ key: String(auth.key).trim(), value: AUTO_HEADER_PLACEHOLDER }];
  }
  if (type === 'cookie') {
    return [{ key: 'Cookie', value: AUTO_HEADER_PLACEHOLDER }];
  }
  return [];
}

function enabledHeaderValue(request, key) {
  const target = String(key || '').toLowerCase();
  const pair = (request?.headers || []).find((header) => header?.enabled !== false && String(header.key || '').trim().toLowerCase() === target);
  return pair ? String(pair.value ?? '') : null;
}

function generatedHostHeaderValue(request) {
  const url = parsedRequestUrlForHeader(request?.url);
  return url ? url.host : AUTO_HEADER_PLACEHOLDER;
}

function parsedRequestUrlForHeader(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const urlText = raw.startsWith('//')
    ? `http:${raw}`
    : /^[A-Za-z][A-Za-z\d+.-]*:/.test(raw)
      ? raw
      : `http://${raw}`;
  try {
    return new URL(urlText);
  } catch {
    return null;
  }
}

function requestSendsBody(request) {
  return BODY_METHOD_SET.has(String(request?.method || '').toUpperCase()) && String(request?.bodyType || 'NONE') !== 'NONE';
}

function defaultGeneratedContentTypeForRequest(request) {
  if (request?.bodyType === 'BINARY') {
    return detectFileContentType(binaryBodyForRequest(request).source);
  }
  return defaultGeneratedContentType(request?.bodyType);
}

function defaultGeneratedContentType(bodyType) {
  if (bodyType === 'RAW_JSON') {
    return 'application/json';
  }
  if (bodyType === 'RAW_JAVASCRIPT') {
    return 'application/javascript';
  }
  if (bodyType === 'RAW_HTML') {
    return 'text/html; charset=utf-8';
  }
  if (bodyType === 'RAW_XML') {
    return 'application/xml';
  }
  if (bodyType === 'URLENCODED') {
    return 'application/x-www-form-urlencoded';
  }
  if (bodyType === 'BINARY') {
    return 'application/octet-stream';
  }
  if (bodyType === 'FORM_DATA') {
    return 'multipart/form-data; boundary=<calculated when request is sent>';
  }
  return 'text/plain; charset=utf-8';
}

function detectFileContentType(value) {
  const raw = String(value || '').split(/[?#]/, 1)[0];
  const dotIndex = raw.lastIndexOf('.');
  if (dotIndex < 0) {
    return 'application/octet-stream';
  }
  const slashIndex = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
  if (slashIndex > dotIndex) {
    return 'application/octet-stream';
  }
  return FILE_EXTENSION_CONTENT_TYPES.get(raw.slice(dotIndex).toLowerCase()) || 'application/octet-stream';
}

function ensureRequestAutoHeaders(request) {
  request.autoHeaders = {
    sendPostMeterToken: request?.autoHeaders?.sendPostMeterToken === true,
    showGeneratedHeaders: request?.autoHeaders?.showGeneratedHeaders === true
  };
  return request.autoHeaders;
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
  refreshVariableHighlights($('environmentMainPanel'));
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
      refreshVariableHighlights();
    });
    const key = document.createElement('input');
    key.placeholder = 'Variable';
    key.value = pair.key || '';
    key.setAttribute('aria-label', `Environment variable ${rowNumber} name`);
    key.addEventListener('input', () => {
      pair.key = key.value;
      markActiveEnvironmentDirty();
      renderVariablePreview();
      refreshVariableHighlights();
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
      refreshVariableHighlights();
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
  activeRunnerRequestRunnerId = null;
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
  $('responseHeaders').value = formatResponseHeaders(response);
  $('responseCookies').value = formatResponseCookies(response);
  $('responseBody').value = PostMeterResponseFormatting.formatBody(response);
  CodeEditor.setLanguage?.($('responseHeaders'), 'headers');
  CodeEditor.setLanguage?.($('responseCookies'), 'headers');
  CodeEditor.setLanguage?.($('responseBody'), responseBodyCodeLanguage(response, $('responseBody').value));
  displayTestResults(response);
  displayVisualizer(response.testScriptResult?.visualizer);
}

function formatResponseHeaders(response) {
  return Object.entries(response?.headers || {})
    .map(([key, values]) => `${key}: ${normalizeResponseHeaderValues(values).join(', ')}`)
    .join('\n');
}

function formatResponseCookies(response) {
  return Object.entries(response?.headers || {})
    .filter(([key]) => key.toLowerCase() === 'set-cookie')
    .flatMap(([, values]) => normalizeResponseHeaderValues(values))
    .join('\n');
}

function normalizeResponseHeaderValues(values) {
  return (Array.isArray(values) ? values : [values])
    .filter((value) => value != null)
    .map((value) => String(value));
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

function ensureRunnerResultsStructure() {
  const root = $('runnerResults');
  if (!root) {
    return null;
  }
  if ($('runnerResultsSummary') && $('runnerExecutionList') && $('runnerExecutionDetails')) {
    return root;
  }
  root.textContent = '';

  const summary = document.createElement('div');
  summary.id = 'runnerResultsSummary';
  summary.className = 'test-results-summary';
  summary.textContent = 'No runner run yet.';

  const grid = document.createElement('div');
  grid.className = 'runner-execution-grid';
  grid.append(
    runnerExecutionSection('runnerExecutionTitle', 'Execution', 'runnerExecutionSummary', 'No requests', 'runnerExecutionList', 'runner-execution-list'),
    runnerExecutionSection('runnerExecutionDetailsTitle', 'Request details', 'runnerExecutionDetailsStatus', 'No selection', 'runnerExecutionDetails', 'runner-execution-details')
  );
  root.append(summary, grid);
  return root;
}

function runnerExecutionSection(titleId, titleText, summaryId, summaryText, bodyId, bodyClassName) {
  const section = document.createElement('section');
  section.className = `script-results-section ${bodyClassName === 'runner-execution-list' ? 'runner-execution-section' : 'runner-detail-section'}`;
  section.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'script-results-header';
  const title = document.createElement('h3');
  title.id = titleId;
  title.textContent = titleText;
  const summary = document.createElement('span');
  summary.id = summaryId;
  summary.className = 'script-results-count';
  summary.textContent = summaryText;
  if (bodyId === 'runnerExecutionList') {
    header.append(executionStatusFilterTitleRow(title, 'runnerExecutionStatusFilter', 'Filter runner requests by status code'));
  } else {
    header.append(title);
  }
  header.append(summary);

  const body = document.createElement('div');
  body.id = bodyId;
  body.className = bodyClassName;
  if (bodyId === 'runnerExecutionList') {
    body.setAttribute('aria-live', 'polite');
  }
  appendEmptyTestResult(body, bodyId === 'runnerExecutionList'
    ? 'No runner execution yet.'
    : 'Select a completed request to inspect its execution details.');

  section.append(header, body);
  if (bodyId === 'runnerExecutionList') {
    const pagination = document.createElement('div');
    pagination.id = 'runnerExecutionPagination';
    pagination.className = 'runner-execution-pagination';
    pagination.hidden = true;
    section.append(pagination);
  }
  return section;
}

function renderRunnerExecutionMessage(message, options = {}) {
  if (options.plain === true) {
    $('runnerResults').textContent = message;
    return;
  }
  ensureRunnerResultsStructure();
  $('runnerResultsSummary').textContent = message || 'No runner run yet.';
  $('runnerExecutionSummary').textContent = 'No requests';
  $('runnerExecutionList').textContent = '';
  appendEmptyTestResult($('runnerExecutionList'), message || 'No runner execution yet.');
  clearExecutionPagination('runnerExecutionPagination');
  clearExecutionStatusFilter('runnerExecutionStatusFilter');
  $('runnerExecutionDetailsStatus').textContent = 'No selection';
  $('runnerExecutionDetails').textContent = '';
  appendEmptyTestResult($('runnerExecutionDetails'), 'Select a completed request to inspect its execution details.');
}

function renderRunnerExecutionProgress(progress = {}) {
  ensureRunnerResultsStructure();
  const completed = Number(progress.completedRequests || 0);
  const total = Number(progress.totalRequests || 0);
  const requestName = progress.requestName ? ` Last: ${progress.requestName}.` : '';
  $('runnerResultsSummary').textContent = `Running runner... ${completed}/${total} completed.${requestName}`;
  $('runnerExecutionSummary').textContent = total ? `${completed}/${total} completed` : 'Running';
  $('runnerExecutionList').textContent = '';
  appendEmptyTestResult($('runnerExecutionList'), completed ? 'Waiting for final request details.' : 'Waiting for the first request to complete.');
  clearExecutionPagination('runnerExecutionPagination');
  clearExecutionStatusFilter('runnerExecutionStatusFilter');
  $('runnerExecutionDetailsStatus').textContent = 'Running';
  $('runnerExecutionDetails').textContent = '';
  appendEmptyTestResult($('runnerExecutionDetails'), 'Runner execution is still in progress.');
}

function renderRunnerExecutionResult(result = lastRunnerResult) {
  ensureRunnerResultsStructure();
  const results = Array.isArray(result?.results) ? result.results : [];
  runnerExecutionStatusFilter = renderExecutionStatusFilter({
    selectId: 'runnerExecutionStatusFilter',
    items: results,
    selected: runnerExecutionStatusFilter,
    onChange: (status) => {
      runnerExecutionStatusFilter = status;
      runnerExecutionPage = 0;
      selectedRunnerExecutionIndex = firstFilteredExecutionIndex(results, runnerExecutionStatusFilter);
      renderRunnerExecutionResult(lastRunnerResult);
    }
  });
  const filteredResults = filteredExecutionEntries(results, runnerExecutionStatusFilter);
  selectedRunnerExecutionIndex = selectedExecutionIndexForEntries(selectedRunnerExecutionIndex, filteredResults);
  const failedRequests = Number(result?.failedRequests ?? results.filter((item) => item?.passed !== true).length);
  const completedRequests = Number(result?.totalRequests ?? results.length);
  const httpResponses = runnerHttpResponseCount(result, results);
  const cancelled = result?.cancelled === true ? ', cancelled' : '';
  $('runnerResultsSummary').textContent = results.length
    ? [
        `${completedRequests} ${plural(completedRequests, 'request', 'requests')} completed`,
        httpResponses == null ? '' : `${httpResponses} HTTP ${plural(httpResponses, 'response', 'responses')}`,
        `${failedRequests} failed${cancelled}`
      ].filter(Boolean).join(', ') + '.'
    : 'No runner execution results were returned.';
  runnerExecutionPage = executionPageForFilteredEntries(selectedRunnerExecutionIndex, filteredResults, runnerExecutionPage);
  const pageRange = executionPageRange(filteredResults.length, runnerExecutionPage);
  const visibleResults = filteredResults.slice(pageRange.startIndex, pageRange.endIndex);
  $('runnerExecutionSummary').textContent = filteredResults.length
    ? executionFilterSummaryText(pageRange, filteredResults.length, results.length, 'result', runnerExecutionStatusFilter)
    : 'No requests';

  const list = $('runnerExecutionList');
  list.textContent = '';
  if (!results.length) {
    appendEmptyTestResult(list, 'No request results were recorded.');
  } else if (!filteredResults.length) {
    appendEmptyTestResult(list, 'No request results match this status filter.');
  } else {
    visibleResults.forEach((entry) => list.append(runnerExecutionRow(entry.item, entry.index)));
  }
  renderExecutionPagination({
    containerId: 'runnerExecutionPagination',
    label: 'Runner request results',
    onPageChange: (nextPage) => {
      runnerExecutionPage = nextPage;
      const nextRange = executionPageRange(filteredResults.length, nextPage);
      selectedRunnerExecutionIndex = filteredResults[nextRange.startIndex]?.index ?? 0;
      renderRunnerExecutionResult(lastRunnerResult);
    },
    page: runnerExecutionPage,
    totalItems: filteredResults.length
  });
  renderRunnerExecutionDetails(result);
}

function runnerHttpResponseCount(result, results) {
  const explicit = Number(result?.httpResponses);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  if (!Array.isArray(results) || results.length > EXECUTION_RESULT_PAGE_SIZE * 10) {
    return null;
  }
  return results.filter((item) => Number(item?.statusCode) > 0).length;
}

function executionPageForIndex(index, totalItems, fallbackPage = 0) {
  const total = Number(totalItems || 0);
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const pageCount = Math.max(1, Math.ceil(total / EXECUTION_RESULT_PAGE_SIZE));
  const fallback = Math.min(Math.max(Number(fallbackPage) || 0, 0), pageCount - 1);
  const numeric = Number(index);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return fallback;
  }
  return Math.min(Math.floor(Math.min(numeric, total - 1) / EXECUTION_RESULT_PAGE_SIZE), pageCount - 1);
}

function executionPageRange(totalItems, page = 0) {
  const total = Math.max(0, Number(totalItems || 0));
  if (!Number.isFinite(total) || total <= 0) {
    return { page: 0, pageCount: 0, startIndex: 0, endIndex: 0 };
  }
  const pageCount = Math.max(1, Math.ceil(total / EXECUTION_RESULT_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(page) || 0, 0), pageCount - 1);
  const startIndex = currentPage * EXECUTION_RESULT_PAGE_SIZE;
  return {
    page: currentPage,
    pageCount,
    startIndex,
    endIndex: Math.min(total, startIndex + EXECUTION_RESULT_PAGE_SIZE)
  };
}

function clearExecutionPagination(containerId) {
  const container = $(containerId);
  if (!container) {
    return;
  }
  container.textContent = '';
  container.hidden = true;
}

function executionStatusFilterTitleRow(title, selectId, ariaLabel) {
  const row = document.createElement('div');
  row.className = 'script-results-title-row';
  row.append(title);

  const label = document.createElement('label');
  label.className = 'runner-execution-filter';
  const text = document.createElement('span');
  text.textContent = 'Status';
  const select = document.createElement('select');
  select.id = selectId;
  select.setAttribute('aria-label', ariaLabel);
  select.append(executionStatusOption('All', 'all'));
  label.append(text, select);
  row.append(label);
  return row;
}

function executionStatusOption(label, value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function clearExecutionStatusFilter(selectId) {
  const select = $(selectId);
  if (!select) {
    return;
  }
  select.textContent = '';
  select.append(executionStatusOption('All', 'all'));
  select.value = 'all';
  select.disabled = true;
  select.onchange = null;
}

function renderExecutionStatusFilter({ selectId, items, selected, onChange }) {
  const select = $(selectId);
  if (!select) {
    return selected || 'all';
  }
  const counts = executionStatusCounts(items);
  const statusCodes = new Set(counts.map(([status]) => status));
  const normalized = statusCodes.has(String(selected)) ? String(selected) : 'all';
  select.textContent = '';
  select.append(executionStatusOption('All', 'all'));
  counts.forEach(([status, count]) => {
    select.append(executionStatusOption(`${status} (${count})`, status));
  });
  select.disabled = counts.length === 0;
  select.value = normalized;
  select.onchange = () => {
    if (typeof onChange === 'function') {
      onChange(select.value || 'all');
    }
  };
  return normalized;
}

function executionStatusCounts(items) {
  const counts = new Map();
  if (!Array.isArray(items)) {
    return [];
  }
  items.forEach((item) => {
    const status = executionStatusCode(item);
    if (!status) {
      return;
    }
    counts.set(status, (counts.get(status) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort(([left], [right]) => compareExecutionStatusFilters(left, right));
}

function executionStatusCode(item) {
  const status = Number(item?.statusCode);
  if (!Number.isInteger(status) || status <= 0) {
    if (runnerStatusLabel(item) === 'ERR') {
      return 'ERR';
    }
    return '';
  }
  return String(status);
}

function compareExecutionStatusFilters(left, right) {
  if (left === right) {
    return 0;
  }
  if (left === 'ERR') {
    return -1;
  }
  if (right === 'ERR') {
    return 1;
  }
  return Number(left) - Number(right) || left.localeCompare(right);
}

function filteredExecutionEntries(items, statusFilter) {
  const list = Array.isArray(items) ? items : [];
  const filter = String(statusFilter || 'all');
  return list.reduce((entries, item, index) => {
    if (filter === 'all' || executionStatusCode(item) === filter) {
      entries.push({ item, index });
    }
    return entries;
  }, []);
}

function firstFilteredExecutionIndex(items, statusFilter) {
  const first = filteredExecutionEntries(items, statusFilter)[0];
  return first ? first.index : 0;
}

function selectedExecutionIndexForEntries(index, entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return 0;
  }
  const numeric = Number(index);
  if (Number.isInteger(numeric) && entries.some((entry) => entry.index === numeric)) {
    return numeric;
  }
  return entries[0].index;
}

function executionPageForFilteredEntries(selectedIndex, entries, fallbackPage = 0) {
  const position = Array.isArray(entries)
    ? entries.findIndex((entry) => entry.index === selectedIndex)
    : -1;
  return executionPageForIndex(position >= 0 ? position : 0, Array.isArray(entries) ? entries.length : 0, fallbackPage);
}

function executionFilterSummaryText(pageRange, filteredCount, totalCount, noun, statusFilter) {
  const label = `${pageRange.startIndex + 1}-${pageRange.endIndex} of ${filteredCount} ${plural(filteredCount, noun, `${noun}s`)}`;
  if (statusFilter && statusFilter !== 'all' && filteredCount !== totalCount) {
    return `${label} matching ${statusFilter}`;
  }
  return label;
}

function renderExecutionPagination({ containerId, totalItems, page, label, onPageChange }) {
  const container = $(containerId);
  if (!container) {
    return;
  }
  const range = executionPageRange(totalItems, page);
  container.textContent = '';
  if (range.pageCount <= 1) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.append(
    executionPageButton('first', 'First', range.page > 0, label, () => onPageChange(0)),
    executionPageButton('previous', 'Previous', range.page > 0, label, () => onPageChange(range.page - 1))
  );
  const status = document.createElement('span');
  status.className = 'runner-execution-page-status';
  status.textContent = `Page ${range.page + 1} of ${range.pageCount}`;
  const rangeText = document.createElement('span');
  rangeText.className = 'runner-execution-page-range';
  rangeText.textContent = `${range.startIndex + 1}-${range.endIndex} of ${Number(totalItems || 0)}`;
  container.append(
    status,
    executionPageButton('next', 'Next', range.page < range.pageCount - 1, label, () => onPageChange(range.page + 1)),
    executionPageButton('last', 'Last', range.page < range.pageCount - 1, label, () => onPageChange(range.pageCount - 1)),
    rangeText
  );
}

function executionPageButton(action, text, enabled, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.executionPageAction = action;
  button.disabled = !enabled;
  button.textContent = text;
  button.setAttribute('aria-label', `${text} page of ${label}`);
  button.addEventListener('click', onClick);
  return button;
}

function clampRunnerExecutionIndex(index, results) {
  if (!Array.isArray(results) || !results.length) {
    return 0;
  }
  const numeric = Number(index);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return 0;
  }
  return Math.min(numeric, results.length - 1);
}

function runnerExecutionRow(item, index) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `runner-execution-row${index === selectedRunnerExecutionIndex ? ' active' : ''}`;
  row.dataset.runnerExecutionIndex = String(index);
  row.setAttribute('aria-pressed', index === selectedRunnerExecutionIndex ? 'true' : 'false');
  row.setAttribute('aria-label', `Show details for ${item?.requestName || 'request'} with status ${runnerStatusLabel(item)}`);
  row.addEventListener('click', () => {
    selectedRunnerExecutionIndex = index;
    renderRunnerExecutionResult(lastRunnerResult);
  });

  const badge = document.createElement('span');
  badge.className = `runner-status-badge ${runnerStatusClass(item)}`;
  badge.textContent = runnerStatusLabel(item);

  const content = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'runner-execution-name';
  name.textContent = item?.requestName || 'Untitled Request';
  const meta = document.createElement('span');
  meta.className = 'runner-execution-meta';
  meta.textContent = runnerExecutionMeta(item);
  content.append(name, meta);
  row.append(badge, content);
  return row;
}

function runnerExecutionMeta(item = {}) {
  const request = runnerRequestForExecutionItem(item);
  const method = request?.method || '';
  const url = request?.url || '';
  const duration = Number.isFinite(Number(item.durationMillis)) ? `${Number(item.durationMillis)} ms` : '';
  return [method, url, duration].filter(Boolean).join(' ');
}

function renderRunnerExecutionDetails(result = lastRunnerResult) {
  const results = Array.isArray(result?.results) ? result.results : [];
  const item = results[selectedRunnerExecutionIndex] || null;
  const status = $('runnerExecutionDetailsStatus');
  const details = $('runnerExecutionDetails');
  if (!details || !status) {
    return;
  }
  details.textContent = '';
  if (!item) {
    status.textContent = 'No selection';
    appendEmptyTestResult(details, 'Select a completed request to inspect its execution details.');
    return;
  }
  status.textContent = runnerStatusLabel(item);
  const request = runnerRequestForExecutionItem(item);
  details.append(runnerExecutionOverview(item, request));
  if (item.error) {
    details.append(runnerDetailTextBlock('Error', item.error, 'runner-detail-error'));
  }
  appendRunnerAssertionDetails(details, item.assertionResults || []);
  appendRunnerScriptResultDetails(details, 'Pre-request', item.preRequestScriptResult);
  appendRunnerScriptResultDetails(details, 'Post-request', item.testScriptResult);
  appendRunnerVariableDetails(details, 'Extracted variables', item.extractedVariables || []);
  appendRunnerVariableDetails(details, 'Request variables', item.localVariables || []);
  appendRunnerVariableDetails(details, 'Collection variables', result?.collectionVariables || []);
  appendRunnerVariableDetails(details, 'Environment variables', result?.environment?.variables || []);
  appendRunnerVariableDetails(details, 'Global variables', result?.globals || []);
  appendRunnerResponseBodyDetails(details, item);
}

function runnerExecutionOverview(item = {}, request = null) {
  const block = document.createElement('div');
  block.className = 'runner-detail-block';
  const heading = document.createElement('h4');
  heading.className = 'runner-detail-heading';
  heading.textContent = item.requestName || request?.name || 'Untitled Request';
  const target = document.createElement('div');
  target.className = 'runner-detail-meta';
  target.textContent = [request?.method || '', request?.url || ''].filter(Boolean).join(' ');
  const metrics = document.createElement('div');
  metrics.className = 'runner-detail-meta';
  metrics.textContent = [
    `Status ${runnerStatusLabel(item)}`,
    Number.isFinite(Number(item.durationMillis)) ? `${Number(item.durationMillis)} ms` : '',
    item.folderName ? `Folder ${item.folderName}` : '',
    item.startedAt ? `Started ${item.startedAt}` : ''
  ].filter(Boolean).join(' | ');
  block.append(heading, target, metrics);
  return block;
}

function appendRunnerAssertionDetails(details, assertions) {
  const block = runnerDetailBlock('Assertions');
  const list = document.createElement('div');
  list.className = 'test-result-list';
  if (!Array.isArray(assertions) || !assertions.length) {
    appendEmptyTestResult(list, 'No assertions recorded.');
  } else {
    for (const assertion of assertions) {
      appendTestResultRow(list, {
        status: assertion?.passed === true ? 'passed' : 'failed',
        name: assertion?.message || assertion?.assertion?.name || 'Assertion',
        detail: assertion?.passed === true ? '' : String(assertion?.error || assertion?.message || '')
      });
    }
  }
  block.append(list);
  details.append(block);
}

function appendRunnerScriptResultDetails(details, title, scriptResult) {
  const block = runnerDetailBlock(title);
  const list = document.createElement('div');
  list.className = 'test-result-list';
  const normalized = normalizeScriptResult(scriptResult);
  if (!normalized) {
    appendEmptyTestResult(list, 'No script result recorded.');
  } else {
    const topLevelError = scriptResultTopLevelError(normalized);
    if (topLevelError) {
      appendTestResultRow(list, { status: 'error', name: 'Script error', detail: topLevelError });
    }
    for (const test of Array.isArray(normalized.tests) ? normalized.tests : []) {
      appendTestResultRow(list, {
        status: scriptTestStatus(test),
        name: String(test?.name || 'Unnamed test'),
        detail: String(test?.error || '')
      });
    }
    for (const log of Array.isArray(normalized.logs) ? normalized.logs : []) {
      appendTestResultRow(list, { status: 'log', name: 'Console', detail: String(log || '') });
    }
    if (!list.children.length) {
      appendEmptyTestResult(list, 'No tests recorded.');
    }
  }
  block.append(list);
  details.append(block);
}

function appendRunnerVariableDetails(details, title, variables) {
  const visible = (variables || []).filter((variable) => variable?.enabled !== false && variable?.key);
  if (!visible.length) {
    return;
  }
  const block = runnerDetailBlock(title);
  for (const variable of visible) {
    const row = document.createElement('div');
    row.className = 'runner-detail-variable';
    const key = document.createElement('span');
    key.textContent = variable.key;
    const value = document.createElement('span');
    value.textContent = variable.value ?? '';
    row.append(key, value);
    block.append(row);
  }
  details.append(block);
}

function appendRunnerResponseBodyDetails(details, item = {}) {
  const block = runnerDetailBlock('Response body');
  const body = item.responseBody == null ? '' : String(item.responseBody);
  if (!body) {
    appendEmptyTestResult(block, 'No response body recorded.');
  } else {
    const content = document.createElement('pre');
    content.className = 'runner-detail-code';
    content.textContent = formatRunnerDetailResponseBody(body);
    block.append(content);
  }
  details.append(block);
}

function formatRunnerDetailResponseBody(body) {
  const text = String(body || '');
  const formatter = globalThis.PostMeterResponseFormatting?.formatBody;
  if (typeof formatter === 'function') {
    return formatter({ body: text, headers: {} });
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function runnerDetailBlock(title) {
  const block = document.createElement('div');
  block.className = 'runner-detail-block';
  const heading = document.createElement('h4');
  heading.className = 'runner-detail-title';
  heading.textContent = title;
  block.append(heading);
  return block;
}

function runnerDetailTextBlock(title, value, className = 'runner-detail-code') {
  const block = runnerDetailBlock(title);
  const content = document.createElement('pre');
  content.className = className;
  content.textContent = String(value || '');
  block.append(content);
  return block;
}

function runnerRequestForExecutionItem(item = {}) {
  const runner = activeRunner();
  return (runner?.requests || []).find((request) => request.id === item.requestId) || null;
}

function runnerStatusLabel(item = {}) {
  const statusCode = Number(item.statusCode);
  if (Number.isFinite(statusCode) && statusCode > 0) {
    return String(statusCode);
  }
  if (item.skipped === true) {
    return 'SKIP';
  }
  return item.passed === false || item.error ? 'ERR' : '-';
}

function runnerStatusClass(item = {}) {
  const statusCode = Number(item.statusCode);
  if (!Number.isFinite(statusCode) || statusCode <= 0) {
    return item.passed === false || item.error ? 'status-error' : 'status-none';
  }
  if (statusCode >= 200 && statusCode < 300) {
    return 'status-2xx';
  }
  if (statusCode >= 300 && statusCode < 400) {
    return 'status-3xx';
  }
  if (statusCode >= 400 && statusCode < 500) {
    return 'status-4xx';
  }
  if (statusCode >= 500) {
    return 'status-5xx';
  }
  return 'status-none';
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

async function runActiveCollection() {
  if (activeMainPanel === 'runner') {
    return runActiveRunner();
  }
  return rendererWorkflows.runActiveCollection();
}

async function runActiveRunner() {
  const runner = activeRunner();
  if (!runner) {
    return setStatus('Select a runner before running it.');
  }
  collectRunnerFromEditor();
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (!runner.requests.length) {
    return setStatus('Add at least one request before running a runner.');
  }
  const runnerId = crypto.randomUUID();
  const runnerContext = {
    runnerConfigId: runner.id,
    workspaceId: activeWorkspaceId
  };
  const runnerEnvironment = runner.environmentId && runner.environmentId !== 'none'
    ? (workspace.environments || []).find((environment) => environment.id === runner.environmentId) || null
    : null;
  lastRunnerResult = null;
  selectedRunnerExecutionIndex = 0;
  runnerExecutionPage = 0;
  runnerExecutionStatusFilter = 'all';
  $('exportRunnerJsonButton').disabled = true;
  $('exportRunnerCsvButton').disabled = true;
  try {
    await saveWorkspace(false, { scope: 'runners', collectEditors: false });
    activeRunnerId = runnerId;
    $('runCollectionButton').disabled = true;
    $('cancelRunnerButton').disabled = false;
    renderRunnerExecutionMessage('Starting runner...');
    const result = await window.postmeter.runner.start(runnerId, cloneJson(runner), cloneJson(runnerEnvironment), {
      stopOnFailure: runner.stopOnFailure === true,
      allowEnvironmentMutation: runner.allowEnvironmentMutation === true
    });
    if (activeRunnerId !== runnerId || !isActiveRunnerContext(runnerContext)) {
      return;
    }
    const mutatedEnvironment = result?.mutatedEnvironment || result?.environment;
    if (result?.environmentMutationAllowed === true && runnerEnvironment && mutatedEnvironment) {
      for (const key of Object.keys(runnerEnvironment)) {
        delete runnerEnvironment[key];
      }
      Object.assign(runnerEnvironment, mutatedEnvironment);
      renderEnvironmentSelect();
      renderEnvironments();
      renderEnvironmentEditor();
    }
    if (Array.isArray(result?.cookies)) {
      workspace.cookies = result.cookies;
      renderCookieJarEditor();
    }
    lastRunnerResult = result;
    selectedRunnerExecutionIndex = 0;
    runnerExecutionPage = 0;
    runnerExecutionStatusFilter = 'all';
    renderRunnerExecutionResult(result);
    $('exportRunnerJsonButton').disabled = false;
    $('exportRunnerCsvButton').disabled = false;
    setStatus(result.cancelled ? 'Runner cancelled.' : 'Runner completed.');
  } catch (error) {
    const message = error.message || String(error);
    if (isActiveRunnerContext(runnerContext) && activeRunnerId === runnerId) {
      lastRunnerResult = null;
      renderRunnerExecutionMessage(message);
      $('exportRunnerJsonButton').disabled = true;
      $('exportRunnerCsvButton').disabled = true;
      setStatus('Runner failed.');
      notifyUser('Runner Failed', message);
    }
  } finally {
    if (activeRunnerId === runnerId) {
      activeRunnerId = null;
      $('runCollectionButton').disabled = false;
      $('cancelRunnerButton').disabled = true;
    }
  }
}

function isActiveRunnerContext(context) {
  return context?.workspaceId === activeWorkspaceId
    && context?.runnerConfigId === activeRunnerConfigId
    && activeMainPanel === 'runner';
}

async function cancelCollectionRun() {
  return rendererWorkflows.cancelCollectionRun();
}

async function exportRunnerResult(format) {
  return rendererWorkflows.exportRunnerResult(format);
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
    if (activeRunnerRequestRunnerId) {
      const saved = await saveWorkspace(false);
      if (saved) {
        setStatus('Runner request saved.');
      }
      return saved;
    }
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
  request.assertions ||= [];
  request.scripts ||= { preRequest: '', tests: '' };
  request.variables ||= [];
  request.examples ||= [];
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
  if ((request.assertions || []).some((assertion) => assertion?.enabled !== false)) {
    exclusions.push('assertions');
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
  if ((request.examples || []).length) {
    exclusions.push('saved examples');
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
    activeEnvironmentId = environment.id;
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

async function exportEnvironment(environment = activeEnvironment(), format = 'postmeter') {
  const selectedEnvironment = environment || activeEnvironment() || workspace.environments?.[0] || null;
  if (!selectedEnvironment) {
    return setStatus('Select an environment before exporting.');
  }
  const environmentApi = window.postmeter?.environment;
  const exportBoundary = window.__postmeterExportEnvironment || environmentApi?.exportEnvironment;
  if (!exportBoundary) {
    return setStatus('Environment export is unavailable in this runtime.');
  }
  if (typeof window.__postmeterExportEnvironment === 'function' || !window.postmeter?.fileExport) {
    if (selectedEnvironment.id === activeEnvironmentId) {
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
      if (selectedEnvironment.id === activeEnvironmentId) {
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
  const selectedEnvironment = await promptForItemExport('environment', environments, activeEnvironment() || environments[0] || null);
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
    autoHeaders: { sendPostMeterToken: false, showGeneratedHeaders: false }
  };
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
  activeRunnerRequestRunnerId = null;
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
    activeRunnerRequestRunnerId = null;
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

function addPerformanceRequestVariable() {
  const test = activePerformanceTest();
  if (test?.request) {
    const draftAuth = collectPerformanceAuthFromEditor();
    collectPerformanceTestFromEditor();
    const request = activePerformanceTest()?.request || test.request;
    request.auth = draftAuth;
    request.variables ||= [];
    request.variables.push({ enabled: true, key: '', value: '' });
    markActivePerformanceDirty();
    renderPerformanceRequestEditor();
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

function addPerformanceCookie() {
  workspace.cookies ||= [];
  const request = activePerformanceTest()?.request;
  const domain = domainFromRequestUrl(request?.url) || 'example.com';
  markCookieJarDirty();
  workspace.cookies.push(newWorkspaceCookie({ domain }));
  renderPerformanceCookieJarEditor();
}

function clearExpiredPerformanceCookies() {
  workspace.cookies ||= [];
  const before = workspace.cookies.length;
  markCookieJarDirty();
  workspace.cookies = workspace.cookies.filter((cookie) => !isExpiredCookie(cookie));
  renderPerformanceCookieJarEditor();
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

function addPerformanceExample() {
  const request = activePerformanceTest()?.request;
  if (!request) {
    return;
  }
  request.examples ||= [];
  request.examples.push(newExampleObject({
    existingNames: request.examples.map((example) => example.name)
  }));
  markActivePerformanceDirty();
  renderPerformanceExamples(request.examples);
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

async function exportPerformanceExamples() {
  const request = activePerformanceTest()?.request;
  if (!request) {
    return setStatus('Select a performance test before exporting examples.');
  }
  if (!request.examples?.length) {
    return setStatus('This performance request does not have examples to export.');
  }
  collectPerformanceTestFromEditor();
  try {
    const exportExamplesBoundary = window.__postmeterExportExamples || window.postmeter.request.exportExamples;
    const result = await exportExamplesBoundary(request);
    if (!result.cancelled) {
      setStatus(`Examples exported to ${result.path}.`);
    }
  } catch (error) {
    const message = error.message || String(error);
    setStatus('Performance example export failed.');
    notifyUser('Performance Example Export Failed', message);
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

function duplicatePerformanceExample(index) {
  const request = activePerformanceTest()?.request;
  if (!request?.examples?.[index]) {
    return;
  }
  const duplicate = structuredClone(request.examples[index]);
  duplicate.id = crypto.randomUUID();
  duplicate.name = uniqueName(`${duplicate.name || 'Example Response'} Copy`, request.examples.map((example) => example.name));
  request.examples.splice(index + 1, 0, duplicate);
  markActivePerformanceDirty();
  renderPerformanceExamples(request.examples);
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

async function deletePerformanceExample(index) {
  const request = activePerformanceTest()?.request;
  if (!request?.examples?.[index] || !(await confirmActionModal({
    title: 'Delete example?',
    message: `Delete ${request.examples[index].name || 'example'}?`,
    confirmLabel: 'Delete Example',
    danger: true
  }))) {
    return;
  }
  request.examples.splice(index, 1);
  markActivePerformanceDirty();
  renderPerformanceExamples(request.examples);
}

function addPair(fieldName) {
  const request = activeRequest();
  if (request) {
    request[fieldName].push({ enabled: true, key: '', value: '' });
    markActiveRequestDirty();
    renderRequestEditor();
  }
}

function addPerformancePair(fieldName) {
  const test = activePerformanceTest();
  if (test?.request) {
    const draftAuth = collectPerformanceAuthFromEditor();
    collectPerformanceTestFromEditor();
    const request = activePerformanceTest()?.request || test.request;
    request.auth = draftAuth;
    request[fieldName] ||= [];
    request[fieldName].push({ enabled: true, key: '', value: '' });
    markActivePerformanceDirty();
    renderPerformanceRequestEditor();
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

function addPerformanceAssertion(template = ASSERTION_TEMPLATES.status200) {
  const request = activePerformanceTest()?.request;
  if (request) {
    request.assertions ||= [];
    request.assertions.push(newAssertion(template));
    markActivePerformanceDirty();
    renderPerformanceAssertions(request.assertions);
  }
}

function addPerformanceAssertionTemplate() {
  const template = ASSERTION_TEMPLATES[$('performanceAssertionTemplateSelect')?.value] || ASSERTION_TEMPLATES.status200;
  addPerformanceAssertion(template);
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
  const firstRequest = firstRequestInFolder(duplicate);
  activeFolderId = firstRequest?.folderId || duplicate.id;
  activeRequestId = firstRequest?.request?.id || null;
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
  activeEnvironmentId = duplicate.id;
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
  syncRequestBodyFieldsFromEditor('', request);
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
  request.autoHeaders = {
    sendPostMeterToken: $('sendPostMeterTokenInput')?.checked === true,
    showGeneratedHeaders: $('showGeneratedHeadersInput')?.checked === true
  };
}

function setActiveRequestAutoHeaderOption(option, value) {
  const request = activeRequest();
  if (!request) {
    return;
  }
  collectRequestFromEditor();
  const autoHeaders = ensureRequestAutoHeaders(request);
  autoHeaders[option] = value === true;
  markActiveRequestDirty();
  renderRequestEditor();
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
    if (activeRunnerRequestRunnerId) {
      renderRunnerEditor();
    } else {
      renderCollections();
    }
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

function collectPerformanceAuthFromEditor() {
  return collectRequestAuthFromEditor({
    doc: document,
    idPrefix: 'performance',
    existingAuth: activePerformanceTest()?.request?.auth || {}
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

function collectRunnerFromEditor() {
  const runner = activeRunner();
  if (!runner) {
    return;
  }
  runner.name = runnerTitleInputValue() || 'Untitled Runner';
  runner.environmentId = $('runnerEnvironmentSelect')?.value || runner.environmentId || 'none';
  runner.stopOnFailure = $('runnerStopOnFailure')?.checked === true;
  runner.allowEnvironmentMutation = $('runnerAllowEnvironmentMutation')?.checked === true;
  runner.requests = normalizeRunnerRequests(runner.requests);
  const title = $('runnerMainTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = runnerDisplayName(runner);
  }
  renderRunners();
}

function collectPerformanceTestFromEditor() {
  const test = activePerformanceTest();
  if (!test) {
    return;
  }
  test.name = performanceTitleInputValue() || 'Untitled Performance Test';
  const type = activePerformanceType() || test.type || 'latency';
  test.type = type;
  collectPerformanceTypeSettingsFromPanel(test, type, activePerformanceTypePanel());
  syncPerformanceActiveTypeSettings(test);
  test.request ||= {};
  test.request.id ||= crypto.randomUUID();
  test.request.name ||= 'Performance Request';
  test.request.method = METHODS.includes(String($('performanceMethodSelect')?.value || '').toUpperCase())
    ? String($('performanceMethodSelect').value).toUpperCase()
    : 'GET';
  test.request.url = $('performanceUrlInput')?.value.trim() || '';
  syncRequestBodyFieldsFromEditor('performance', test.request);
  const collectedPerformanceAuth = collectPerformanceAuthFromEditor();
  test.request.auth = collectedPerformanceAuth;
  test.request.assertions ||= [];
  test.request.scripts = {
    preRequest: $('performancePreRequestScriptInput')?.value || '',
    tests: $('performanceTestScriptInput')?.value || ''
  };
  test.request.cookieJar = {
    enabled: $('performanceRequestCookieJarEnabledInput')?.checked === true,
    storeResponses: $('performanceRequestCookieJarStoreInput')?.checked !== false
  };
  test.request.autoHeaders = {
    sendPostMeterToken: $('performanceSendPostMeterTokenInput')?.checked === true,
    showGeneratedHeaders: $('performanceShowGeneratedHeadersInput')?.checked === true
  };
  test.request.queryParams = collectKeyValueRowsFromTable('performanceParamsTable', test.request.queryParams);
  test.request.headers = collectKeyValueRowsFromTable('performanceHeadersTable', test.request.headers);
  test.request.variables = collectKeyValueRowsFromTable('performanceRequestVariablesTable', test.request.variables);
  test.request.examples = Array.isArray(test.request.examples) ? test.request.examples : [];
  test.source ||= { sourceType: 'manual' };
  const title = $('performanceMainTitle');
  if (title && title.dataset.editing !== 'true') {
    title.textContent = performanceTestDisplayName(test);
  }
  renderPerformanceTests();
}

function setActivePerformanceRequestAutoHeaderOption(option, value) {
  const test = activePerformanceTest();
  if (!test?.request) {
    return;
  }
  collectPerformanceTestFromEditor();
  const autoHeaders = ensureRequestAutoHeaders(test.request);
  autoHeaders[option] = value === true;
  markActivePerformanceDirty();
  renderPerformanceRequestEditor(test);
}

function collectKeyValueRowsFromTable(containerId, fallback = []) {
  const container = $(containerId);
  if (!container) {
    return Array.isArray(fallback) ? fallback : [];
  }
  const rows = Array.from(container.querySelectorAll('.kv-row')).filter((row) => row.dataset.generatedHeader !== 'true');
  if (!rows.length) {
    return [];
  }
  return rows.map((row) => {
    const inputs = row.querySelectorAll('input');
    return {
      enabled: inputs[0]?.checked !== false,
      key: inputs[1]?.value || '',
      value: inputs[2]?.value || ''
    };
  });
}

function collectPerformanceTypeSettingsFromPanel(test, type, panel) {
  if (!test || !RENDERER_PERFORMANCE_TEST_TYPES.includes(type) || !panel) {
    return;
  }
  const previous = performanceTypeSettings(test, type);
  const minimumDurationSeconds = type === 'soak' ? 1 : 0;
  const config = {
    iterations: clampPerformanceConfigInput('iterations', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests, previous.config?.iterations || 1, panel),
    startConcurrency: clampPerformanceConfigInput('startConcurrency', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency, previous.config?.startConcurrency || 1, panel),
    concurrency: clampPerformanceConfigInput('concurrency', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency, previous.config?.concurrency || 1, panel),
    durationSeconds: clampPerformanceConfigInput('durationSeconds', minimumDurationSeconds, PERFORMANCE_MAX_SAFETY_LIMITS.maxDurationSeconds, previous.config?.durationSeconds || minimumDurationSeconds, panel),
    rampSteps: clampPerformanceConfigInput('rampSteps', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests, previous.config?.rampSteps || 1, panel),
    spikeMultiplier: clampPerformanceConfigInput('spikeMultiplier', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency, previous.config?.spikeMultiplier || 1, panel)
  };
  const safetyLimits = {
    maxTotalRequests: clampPerformanceSafetyInput('maxTotalRequests', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxTotalRequests, previous.safetyLimits?.maxTotalRequests || 100, panel),
    maxConcurrency: clampPerformanceSafetyInput('maxConcurrency', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxConcurrency, previous.safetyLimits?.maxConcurrency || 10, panel),
    maxDurationSeconds: clampPerformanceSafetyInput('maxDurationSeconds', 1, PERFORMANCE_MAX_SAFETY_LIMITS.maxDurationSeconds, previous.safetyLimits?.maxDurationSeconds || 60, panel)
  };
  if (!panel.querySelector('[data-performance-safety="maxTotalRequests"]')) {
    safetyLimits.maxTotalRequests = Math.max(
      safetyLimits.maxTotalRequests,
      performancePlannedRequestCount(type, config, safetyLimits)
    );
  }
  if (!panel.querySelector('[data-performance-safety="maxConcurrency"]')) {
    safetyLimits.maxConcurrency = Math.max(
      safetyLimits.maxConcurrency,
      performanceEffectiveConcurrency(type, config)
    );
  }
  test.typeSettings[type] = {
    environmentId: panel.querySelector('[data-performance-environment]')?.value || previous.environmentId || 'none',
    allowEnvironmentMutation: panel.querySelector('[data-performance-mutation]')?.checked === true,
    config,
    safetyLimits
  };
}

function performancePlannedRequestCount(type, config, safetyLimits) {
  if (type === 'soak') {
    return safetyLimits.maxTotalRequests || 1;
  }
  if (type === 'concurrency') {
    return (config.iterations || 1) * (config.concurrency || 1);
  }
  if (type === 'stress' || type === 'ramp') {
    return (config.iterations || 1) * (config.rampSteps || 1);
  }
  return config.iterations || 1;
}

function performanceEffectiveConcurrency(type, config) {
  if (type === 'latency') {
    return 1;
  }
  if (type === 'spike') {
    return (config.concurrency || 1) * (config.spikeMultiplier || 1);
  }
  if (type === 'stress' || type === 'ramp') {
    return Math.max(config.startConcurrency || 1, config.concurrency || 1);
  }
  return config.concurrency || 1;
}

function activePerformanceType() {
  const type = document.querySelector('.tab[data-tab-group="performance"].active')?.dataset.tab || '';
  return RENDERER_PERFORMANCE_TEST_TYPES.includes(type) ? type : '';
}

function activePerformanceTypePanel() {
  return document.querySelector('.performance-type-panel.active');
}

function clampPerformanceConfigInput(name, min, max, fallback, panel = activePerformanceTypePanel()) {
  return clampNumberElement(panel?.querySelector(`[data-performance-config="${name}"]`), min, max, fallback);
}

function clampPerformanceSafetyInput(name, min, max, fallback, panel = activePerformanceTypePanel()) {
  return clampNumberElement(panel?.querySelector(`[data-performance-safety="${name}"]`), min, max, fallback);
}

function clampNumberInput(id, min, max, fallback) {
  return clampNumberElement($(id), min, max, fallback);
}

function clampNumberElement(element, min, max, fallback) {
  const number = Number.parseInt(element?.value || '', 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
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

function runnerTitleInputValue() {
  return String($('runnerMainTitle')?.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function performanceTitleInputValue() {
  return String($('performanceMainTitle')?.textContent || '')
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

function activeRunner() {
  ensureWorkspaceRunners();
  return (workspace?.runners || []).find((runner) => runner.id === activeRunnerConfigId) || null;
}

function activePerformanceTest() {
  ensureWorkspacePerformanceTests();
  return (workspace?.performanceTests || []).find((test) => test.id === activePerformanceTestId) || null;
}

function runnerDisplayName(runner = activeRunner()) {
  return String(runner?.name || '').trim() || 'Untitled Runner';
}

function performanceTestDisplayName(test = activePerformanceTest()) {
  return String(test?.name || '').trim() || 'Untitled Performance Test';
}

function activeEnvironment() {
  return (workspace?.environments || []).find((environment) => environment.id === activeEnvironmentId) || null;
}

function activeRequest() {
  if (activeRunnerRequestRunnerId && activeRequestId) {
    const runner = (workspace?.runners || []).find((item) => item.id === activeRunnerRequestRunnerId);
    return (runner?.requests || []).find((request) => request.id === activeRequestId) || null;
  }
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
  if (groupName === 'performance') {
    const test = activePerformanceTest();
    const currentType = activePerformanceType();
    if (test && RENDERER_PERFORMANCE_TEST_TYPES.includes(currentType)) {
      collectPerformanceTypeSettingsFromPanel(test, currentType, activePerformanceTypePanel());
    }
  }
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
  if (groupName === 'performance' && RENDERER_PERFORMANCE_TEST_TYPES.includes(tabName)) {
    const test = activePerformanceTest();
    if (test) {
      const changed = test.type !== tabName;
      test.type = tabName;
      syncPerformanceActiveTypeSettings(test);
      if (changed) {
        markActivePerformanceDirty();
      }
    }
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
