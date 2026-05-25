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
const TYPOGRAPHY_FONT_SIZE_OPTIONS = Object.freeze([10, 13, 16, 19]);
const KEYBOARD_SHORTCUTS = window.PostMeterKeyboardShortcuts || {};
const KEYBOARD_SHORTCUT_ACTIONS = KEYBOARD_SHORTCUTS.KEYBOARD_SHORTCUT_ACTIONS || [];
const DEFAULT_KEYBOARD_SHORTCUTS = KEYBOARD_SHORTCUTS.DEFAULT_KEYBOARD_SHORTCUTS || {};
const DEFAULT_INTERFACE_FONT = 'default';
const DEFAULT_INTERFACE_FONT_SIZE = 13;
const DEFAULT_EDITOR_FONT = 'default';
const DEFAULT_EDITOR_FONT_SIZE = 13;
const DEFAULT_INTERFACE_FONT_STACK = 'Inter, "Segoe UI", Arial, sans-serif';
const DEFAULT_EDITOR_FONT_STACK = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';
const RENDERER_UI_UTILITIES = window.PostMeterRendererUiUtilities || {};
const TYPOGRAPHY_FONT_STACKS = Object.freeze({
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'segoe-ui': '"Segoe UI", Arial, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  helvetica: 'Helvetica, Arial, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  tahoma: 'Tahoma, Geneva, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  'system-mono': 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  'jetbrains-mono': '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  'sf-mono': '"SFMono-Regular", "SF Mono", Menlo, monospace',
  consolas: 'Consolas, "Liberation Mono", monospace',
  menlo: 'Menlo, Monaco, Consolas, monospace',
  monaco: 'Monaco, Menlo, Consolas, monospace',
  'courier-new': '"Courier New", Courier, monospace'
});
const EXECUTION_RESULT_PAGE_SIZE = 100;
const MAX_RUNNER_REQUEST_ITERATIONS = 1000000;
const POSTMETER_USER_AGENT = 'PostMeter/0.2.0';
const BODY_METHOD_SET = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTO_HEADER_PLACEHOLDER = '<calculated when request is sent>';
const AUTO_REFRESH_AUTH_TYPE = 'autoRefresh';
const AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE = 'autoRefreshRefreshToken';
const REFRESHING_AUTH_ACCESS_TOKEN_LABEL = 'Use Refreshing Access Token';
const REFRESHING_AUTH_REFRESH_TOKEN_LABEL = 'Refreshing Auth Refresh Token';
const REFRESHING_AUTH_API_KEY_LABEL = 'Use Refreshing API Key';
const REFRESHING_AUTH_ACCESS_COOKIE_LABEL = 'Use Refreshing Access Cookie';
const REFRESHING_AUTH_REFRESH_COOKIE_LABEL = 'Refreshing Auth Refresh Cookie';
const AUTO_REFRESH_SUPPORTED_AUTH_TYPES = new Set(['bearer', 'apiKey', 'cookie']);
const AUTH_REFRESH_OUTPUT_SOURCE_VALUES = new Set(['body', 'rawBody', 'header', 'cookie']);
const AUTH_REFRESH_RAW_BODY_PATH = '$body';
const AUTH_REFRESH_OUTPUT_PATH_LABELS = {
  AccessToken: {
    body: 'Access Token Response Path',
    header: 'Access Token Header Name',
    cookie: 'Access Token Cookie Name'
  },
  RefreshToken: {
    body: 'Refresh Token Response Path',
    header: 'Refresh Token Header Name',
    cookie: 'Refresh Token Cookie Name'
  },
  ApiKey: {
    body: 'API Key Response Path',
    header: 'API Key Header Name',
    cookie: 'API Key Cookie Name'
  },
  AwsAccessKey: {
    body: 'Access Key ID Response Path',
    header: 'Access Key ID Header Name',
    cookie: 'Access Key ID Cookie Name'
  },
  AwsSecretKey: {
    body: 'Secret Access Key Response Path',
    header: 'Secret Access Key Header Name',
    cookie: 'Secret Access Key Cookie Name'
  },
  AwsSessionToken: {
    body: 'Session Token Response Path',
    header: 'Session Token Header Name',
    cookie: 'Session Token Cookie Name'
  },
  Custom: {
    body: 'Header Value Response Path',
    header: 'Header Name',
    cookie: 'Header Value Cookie Name'
  }
};
const {
  enabledQueryParams: enabledEditorQueryParams,
  queryParamsFromUrl: queryParamsFromEditorUrl,
  splitUrlQuery: splitEditorUrlQuery,
  urlWithQueryParams: editorUrlWithQueryParams
} = PostMeterRequestQueryModel;
const RENDERER_STATE_DEFAULTS = PostMeterRendererState.createRendererState();
const TAB_PANEL_IDS = {
  request: ['paramsTab', 'headersTab', 'authTab', 'bodyTab', 'scriptsTab', 'collectionVariablesTab', 'requestSettingsTab', 'docsTab'],
  collection: ['collectionOverviewTab', 'collectionAuthTab', 'collectionScriptsTab', 'collectionLevelVariablesTab'],
  folder: ['folderOverviewTab', 'folderAuthTab', 'folderScriptsTab', 'folderLevelVariablesTab'],
  results: ['responseTab', 'responseHeadersTab', 'responseCookiesTab', 'responseNetworkTab', 'testResultsTab', 'visualizerTab'],
  performanceRequest: ['performanceParamsTab', 'performanceHeadersTab', 'performanceAuthTab', 'performanceBodyTab', 'performanceScriptsTab', 'performanceVariablesTab', 'performanceSettingsTab', 'performanceDocsTab'],
  performance: ['diagnosisTab', 'latencyTab', 'throughputTab', 'concurrencyTab', 'stressTab', 'spikeTab', 'soakTab', 'rampTab'],
  performanceOutput: ['performanceOutputResultsTab', 'performanceOutputRequestsTab', 'performanceOutputGraphsTab']
};
const TUTORIAL_CATALOG = window.PostMeterTutorialCatalog || {};
const TUTORIALS = typeof TUTORIAL_CATALOG.createTutorials === 'function'
  ? TUTORIAL_CATALOG.createTutorials({
      tutorialEnsureAuthRefreshAutoDetectExample,
      tutorialEnsureAuthRefreshDetails,
      tutorialEnsureAuthRefreshManageMenu,
      tutorialEnsureAuthRefreshPanel,
      tutorialEnsureClientCertificateModal,
      tutorialEnsureClientCertificateModalFormat,
      tutorialEnsureCollectionRequestContext,
      tutorialEnsureCookieDomainInput,
      tutorialEnsureCookiesClearMenu,
      tutorialEnsureCookiesModal,
      tutorialEnsureCsvVariablesValuesPanel,
      tutorialEnsureEnvironmentContext,
      tutorialEnsureGeneratedHeadersContext,
      tutorialEnsureLocalhostCookieDomain,
      tutorialEnsureLocalhostCookieEditor,
      tutorialEnsurePerformanceAdvancedSettings,
      tutorialEnsurePerformanceCaptureSettings,
      tutorialEnsurePerformanceContext,
      tutorialEnsurePerformanceCsvVariablesModal,
      tutorialEnsurePerformanceTypeContext,
      tutorialEnsureRawRequestBodyContext,
      tutorialEnsureRequestAuthContext,
      tutorialEnsureRequestBodyContext,
      tutorialEnsureRequestCertificateSettingsContext,
      tutorialEnsureRequestCookieSettingsContext,
      tutorialEnsureRequestResultsContext,
      tutorialEnsureRequestSettingsOverviewContext,
      tutorialEnsureRunnerAdvancedSettings,
      tutorialEnsureRunnerCaptureSettings,
      tutorialEnsureRunnerContext,
      tutorialEnsureRunnerCsvVariablesModal,
      tutorialEnsureSettingsModal,
      tutorialEnsureSettingsSection,
      tutorialEnsureToolbarMenu,
      tutorialEnsureWorkspaceContext
    })
  : Object.freeze([]);
let workspace = RENDERER_STATE_DEFAULTS.workspace;
let workspacePath = RENDERER_STATE_DEFAULTS.workspacePath;
let workspaces = RENDERER_STATE_DEFAULTS.workspaces;
let selectedWorkspaceId = RENDERER_STATE_DEFAULTS.selectedWorkspaceId;
let activeCollectionId = RENDERER_STATE_DEFAULTS.activeCollectionId;
let activeFolderId = RENDERER_STATE_DEFAULTS.activeFolderId;
let activeRequestId = RENDERER_STATE_DEFAULTS.activeRequestId;
let activeAuthRefreshRequestOwnerType = RENDERER_STATE_DEFAULTS.activeAuthRefreshRequestOwnerType;
let activeAuthRefreshRequestOwnerId = RENDERER_STATE_DEFAULTS.activeAuthRefreshRequestOwnerId;
let activeRunnerRequestRunnerId = RENDERER_STATE_DEFAULTS.activeRunnerRequestRunnerId;
let activeRunnerConfigId = RENDERER_STATE_DEFAULTS.activeRunnerConfigId;
let activePerformanceTestId = RENDERER_STATE_DEFAULTS.activePerformanceTestId;
let activeEnvironmentId = RENDERER_STATE_DEFAULTS.activeEnvironmentId;
let activeEnvironmentEditorId = RENDERER_STATE_DEFAULTS.activeEnvironmentEditorId;
let activeWorkspaceId = RENDERER_STATE_DEFAULTS.activeWorkspaceId;
let activeSidebarPanel = RENDERER_STATE_DEFAULTS.activeSidebarPanel;
let activeMainPanel = RENDERER_STATE_DEFAULTS.activeMainPanel;
let draftRequests = RENDERER_STATE_DEFAULTS.draftRequests;
let openCollectionTabs = RENDERER_STATE_DEFAULTS.openCollectionTabs;
let openFolderTabs = RENDERER_STATE_DEFAULTS.openFolderTabs;
let openRequestTabs = RENDERER_STATE_DEFAULTS.openRequestTabs;
let openEnvironmentTabs = RENDERER_STATE_DEFAULTS.openEnvironmentTabs;
let openWorkspaceTabs = RENDERER_STATE_DEFAULTS.openWorkspaceTabs;
let openRunnerTabs = RENDERER_STATE_DEFAULTS.openRunnerTabs;
let openPerformanceTabs = RENDERER_STATE_DEFAULTS.openPerformanceTabs;
let collapsedCollectionIds = RENDERER_STATE_DEFAULTS.collapsedCollectionIds;
let collapsedFolderIds = RENDERER_STATE_DEFAULTS.collapsedFolderIds;
let collectionDirtySnapshots = RENDERER_STATE_DEFAULTS.collectionDirtySnapshots;
let collectionDirtyOwners = RENDERER_STATE_DEFAULTS.collectionDirtyOwners;
let cookieJarDirtySnapshot = RENDERER_STATE_DEFAULTS.cookieJarDirtySnapshot;
let cookieJarDirtyOwner = RENDERER_STATE_DEFAULTS.cookieJarDirtyOwner;
let cookieManagerExtraDomains = new Set();
let cookieManagerSelectedCookieIndex = -1;
let cookieManagerDraftText = '';
let cookieManagerErrorMessage = '';
let activeOauthFlowId = RENDERER_STATE_DEFAULTS.activeOauthFlowId;
let activeRunnerId = RENDERER_STATE_DEFAULTS.activeRunnerId;
let lastRunnerResult = RENDERER_STATE_DEFAULTS.lastRunnerResult;
let activePerformanceRunId = null;
let activePerformanceCalibrationId = null;
let lastPerformanceResult = null;
let lastPerformanceResultTestId = '';
let selectedRunnerExecutionIndex = 0;
let selectedPerformanceResultIndex = 0;
let runnerExecutionPage = 0;
let performanceExecutionPage = 0;
let runnerExecutionStatusFilter = 'all';
let performanceExecutionStatusFilter = 'all';
let runnerExecutionRenderToken = 0;
let performanceExecutionRenderToken = 0;
let performanceGraphRenderToken = 0;
const performanceGraphSampleCache = new WeakMap();
const PERFORMANCE_GRAPH_SAMPLE_LIMIT = 1000;
const PERFORMANCE_GRAPH_PAGE_LIMIT = 200;
let lastResponse = RENDERER_STATE_DEFAULTS.lastResponse;
let lastVaultMetadata = null;
let lastVaultMetadataWorkspaceId = null;
let lastStatusMessage = RENDERER_STATE_DEFAULTS.lastStatusMessage;
let lastUserNotification = RENDERER_STATE_DEFAULTS.lastUserNotification;
let activeModalId = RENDERER_STATE_DEFAULTS.activeModalId;
let activeModalCancelValue = RENDERER_STATE_DEFAULTS.activeModalCancelValue;
let activeModalResolver = RENDERER_STATE_DEFAULTS.activeModalResolver;
let modalStack = [];
let selectedDraftSaveCollectionId = RENDERER_STATE_DEFAULTS.selectedDraftSaveCollectionId;
let selectedExportCollectionId = RENDERER_STATE_DEFAULTS.selectedExportCollectionId;
let selectedExportItemId = RENDERER_STATE_DEFAULTS.selectedExportItemId;
let selectedFolderDestinationValue = '';
let selectedRunnerImportTarget = [];
let expandedRunnerImportNodeKeys = [];
let lastRunnerImportSelectionKey = '';
let runnerImportSelectionMode = 'runner';
let selectedRequestExportTarget = null;
let expandedRequestExportCollectionIds = [];
let selectedRequestImportFilePath = '';
let selectedRequestImportFileName = '';
let authRefreshAutoDetectCandidates = [];
let selectedAuthRefreshAutoDetectCandidateId = '';
let activeRequestExportContent = '';
let activeVaultPromptPayload = null;
let activeFileSourceTarget = null;
let activeFilePickerOptions = null;
let pendingCsvVariablesFile = null;
let pendingCsvVariablesFilePath = '';
let activeSettingsSection = 'appearance';
let sessionSaveTimer = null;
let sessionPersistenceEnabled = false;
let lastRenderedRequestEditorContextKey = '';
let lastModalFocusTarget = null;
let notificationModalActive = false;
let requestTitleEditOriginal = '';
let collectionTitleEditOriginal = '';
let folderTitleEditOriginal = '';
let environmentTitleEditOriginal = '';
let workspaceTitleEditOriginal = '';
let runnerTitleEditOriginal = '';
let performanceTitleEditOriginal = '';
let pendingDiagnosticsSettingsSave = null;
let sidebarTreeDragPayload = null;
const pendingNotificationModals = [];
let selectedTutorialId = TUTORIALS[0]?.id || '';
let activeTutorialId = '';
let activeTutorialStepIndex = 0;
let tutorialOverlayPositionHandler = null;
let tutorialFloatingUiPending = false;
let tutorialPreferredNavigationFocusId = 'nextTutorialStepButton';
let tutorialOwnedModalId = '';

const $ = (id) => document.getElementById(id);
const {
  PERFORMANCE_TEST_TYPES: RENDERER_PERFORMANCE_TEST_TYPES,
  MAX_SAFETY_LIMITS: PERFORMANCE_MAX_SAFETY_LIMITS,
  DIAGNOSIS_SCOPE_PROFILES,
  cloneRequestForPerformanceTest,
  newPerformanceTestObject,
  normalizeAuthRefreshConfig,
  normalizePerformanceTest,
  normalizePerformanceTypeSettings,
  normalizeWorkspacePerformanceTests,
  performanceTestSnapshot: snapshotPerformanceTest,
  syncPerformanceActiveTypeSettings
} = PostMeterPerformanceTestModel;
const {
  csvVariableNames,
  csvVariablesConfigured,
  csvVariablesEnabled,
  csvVariablesToIterationRows,
  normalizeCsvVariableData,
  normalizeCsvVariableDataDefaultOff,
  parseCsvVariableSchema
} = PostMeterCsvVariables;
const {
  HIGH_VOLUME_REQUESTS: RESULT_CAPTURE_HIGH_VOLUME_REQUESTS,
  VERY_HIGH_VOLUME_REQUESTS: RESULT_CAPTURE_VERY_HIGH_VOLUME_REQUESTS,
  normalizeCapturePolicy: normalizeResultCapturePolicy
} = PostMeterResultCapturePolicy;
const {
  beautifyBodyText,
  collectAuthFromEditor: collectRequestAuthFromEditor,
  renderAuthEditor: renderRequestAuthEditor,
  renderCookieJarEditor: renderRequestCookieJarEditor,
  renderRequestPairs: renderEditorRequestPairs,
  syncRefreshingAuthSelectOptions,
  renderVariablePairs: renderEditorVariablePairs,
  renderVariablePreview: renderEditorVariablePreview
} = PostMeterRequestEditorPanels;
const {
  applyPostmanCookieMetadata,
  domainFromRequestUrl,
  isExpiredCookie,
  newWorkspaceCookie,
  parseCookieHeaderForJar,
  postmanCookieMetadataByName,
  rendererCookieMatchesHost
} = PostMeterCookieModel;
const {
  bindUi: bindRendererUi,
  closeToolbarMenus: closeRendererToolbarMenus,
  initializeRenderer,
  positionToolbarMenu: positionRendererToolbarMenu
} = PostMeterRendererBootstrap;
const { createVaultPromptQueue } = PostMeterVaultPromptQueue;
const { createVariableAutocomplete } = PostMeterVariableAutocomplete;
const CodeEditor = window.PostMeterCodeEditor || {};
const MarkdownRenderer = window.PostMeterMarkdownRenderer || {};
const VariableHighlighter = window.PostMeterVariableHighlighter || {};
const MARKDOWN_PANE_CONFIGS = Object.freeze({
  collectionOverview: {
    cancelButtonId: 'collectionDescriptionCancelButton',
    editorShellId: 'collectionDescriptionEditorShell',
    emptyText: 'No collection overview yet.',
    inputId: 'collectionDescriptionInput',
    previewId: 'collectionDescriptionPreview',
    saveButtonId: 'collectionDescriptionSaveButton'
  },
  folderOverview: {
    cancelButtonId: 'folderDescriptionCancelButton',
    editorShellId: 'folderDescriptionEditorShell',
    emptyText: 'No folder overview yet.',
    inputId: 'folderDescriptionInput',
    previewId: 'folderDescriptionPreview',
    saveButtonId: 'folderDescriptionSaveButton'
  },
  requestDocs: {
    cancelButtonId: 'docsCancelButton',
    editorShellId: 'docsEditorShell',
    emptyText: 'No request docs yet.',
    inputId: 'docsInput',
    previewId: 'docsPreview',
    saveButtonId: 'docsSaveButton'
  }
});
const markdownPaneStates = Object.fromEntries(Object.keys(MARKDOWN_PANE_CONFIGS).map((pane) => [pane, {
  contextKey: '',
  editing: false
}]));
const {
  activeCollectionTabKey: buildActiveCollectionTabKey,
  activeEnvironmentTabKey: buildActiveEnvironmentTabKey,
  activeFolderTabKey: buildActiveFolderTabKey,
  activePerformanceTabKey: buildActivePerformanceTabKey,
  activeRequestTabKey: buildActiveRequestTabKey,
  activeRunnerTabKey: buildActiveRunnerTabKey,
  activeWorkspaceTabKey: buildActiveWorkspaceTabKey,
  clearSavedCollectionTabDirtyState: clearRendererSavedCollectionTabDirtyState,
  clearSavedEnvironmentDirtyState: clearRendererSavedEnvironmentDirtyState,
  clearSavedFolderTabDirtyState: clearRendererSavedFolderTabDirtyState,
  clearSavedPerformanceDirtyState: clearRendererSavedPerformanceDirtyState,
  clearSavedRunnerDirtyState: clearRendererSavedRunnerDirtyState,
  clearSharedRequestDirtyState: clearRendererSharedRequestDirtyState,
  clearSavedRequestDirtyState: clearRendererSavedRequestDirtyState,
  collectionSnapshot: snapshotCollection,
  isActiveCollectionTab: isRendererActiveCollectionTab,
  isActiveEnvironmentTab: isRendererActiveEnvironmentTab,
  folderSnapshot: snapshotFolder,
  isActiveFolderTab: isRendererActiveFolderTab,
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
const rendererEntityDisplay = typeof window.PostMeterRendererEntityDisplay?.createRendererEntityDisplay === 'function'
  ? window.PostMeterRendererEntityDisplay.createRendererEntityDisplay({
      activePerformanceTest,
      activeRequest,
      activeRunner,
      activeWorkspaceItem,
      workspacePath: () => workspacePath
    })
  : null;

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
  get activeAuthRefreshRequestOwnerType() { return activeAuthRefreshRequestOwnerType; },
  set activeAuthRefreshRequestOwnerType(value) { activeAuthRefreshRequestOwnerType = value; },
  get activeAuthRefreshRequestOwnerId() { return activeAuthRefreshRequestOwnerId; },
  set activeAuthRefreshRequestOwnerId(value) { activeAuthRefreshRequestOwnerId = value; },
  get activeRunnerRequestRunnerId() { return activeRunnerRequestRunnerId; },
  set activeRunnerRequestRunnerId(value) { activeRunnerRequestRunnerId = value; },
  get activeRunnerConfigId() { return activeRunnerConfigId; },
  set activeRunnerConfigId(value) { activeRunnerConfigId = value; },
  get activePerformanceTestId() { return activePerformanceTestId; },
  set activePerformanceTestId(value) { activePerformanceTestId = value; },
  get activeEnvironmentId() { return activeEnvironmentId; },
  set activeEnvironmentId(value) { activeEnvironmentId = value; },
  get activeEnvironmentEditorId() { return activeEnvironmentEditorId; },
  set activeEnvironmentEditorId(value) { activeEnvironmentEditorId = value; },
  get activeWorkspaceId() { return activeWorkspaceId; },
  set activeWorkspaceId(value) { activeWorkspaceId = value; },
  get activeSidebarPanel() { return activeSidebarPanel; },
  set activeSidebarPanel(value) { activeSidebarPanel = value; },
  get activeMainPanel() { return activeMainPanel; },
  set activeMainPanel(value) { activeMainPanel = value; },
  get draftRequests() { return draftRequests; },
  set draftRequests(value) { draftRequests = value; },
  get openCollectionTabs() { return openCollectionTabs; },
  set openCollectionTabs(value) { openCollectionTabs = value; },
  get openFolderTabs() { return openFolderTabs; },
  set openFolderTabs(value) { openFolderTabs = value; },
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
  get collapsedCollectionIds() { return collapsedCollectionIds; },
  set collapsedCollectionIds(value) { collapsedCollectionIds = normalizeCollectionTreeCollapseSet(value); },
  get collapsedFolderIds() { return collapsedFolderIds; },
  set collapsedFolderIds(value) { collapsedFolderIds = normalizeCollectionTreeCollapseSet(value); },
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
  activeEnvironment: activeEditorEnvironment,
  activeFolder,
  activeRequest,
  activeRunner,
  activePerformanceTest,
  activeWorkspaceItem,
  clearActiveWorkspaceItem,
  collectCollectionFromEditor,
  collectEnvironmentFromEditor,
  collectFolderFromEditor,
  collectRequestFromEditor,
  collectRunnerFromEditor,
  collectPerformanceTestFromEditor,
  findFolder,
  findRequest,
  persistWorkspace: (...args) => persistWorkspace(...args),
  promptUnsavedRequestClose,
  removeFolderFromCollection: removeFolder,
  removeRequestFromCollection,
  renderAll,
  renderCollections,
  renderRequestTabs,
  saveDraftRequestWithPrompt,
  notifyUser,
  setStatus,
  selectCollectionTab: (tab) => selectCollectionTabWithoutCollect(tab),
  selectEnvironmentTab: (tab) => selectEnvironmentTabWithoutCollect(tab),
  selectFolderTab: (tab) => selectFolderTabWithoutCollect(tab),
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
  activeFolder,
  activeFolderPath: activeFolderPathForActiveRequest,
  activeRequest,
  applyPostmanCookieMetadata,
  clearSavedRequestDirtyState,
  collectCollectionFromEditor,
  collectEnvironmentFromEditor,
  collectFolderFromEditor,
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
  refreshResponseEditors,
  renderRequestTabs,
  renderRequestVariablePairs,
  renderVariablePreview,
  ensureOpenCollectionTabForActive,
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
    registerCleanup(bindCaptureSettingsDropdownDismissal());
    CodeEditor.enhanceCodeTextareas?.(document);
    registerCleanup(VariableHighlighter.install?.(document, {
      getVariables: variableHighlightVariablesForTarget,
      onOpenVariable: openVariableReferenceFromHighlight,
      showTooltipHints: variableTooltipHintsEnabled,
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
      getVariables: variableHighlightVariablesForTarget
    }).destroy);
    registerCleanup(window.postmeter.app.onMenuAction(handleAppMenuAction));
    if (window.postmeter.app.onAutoUpdateStatus) {
      registerCleanup(window.postmeter.app.onAutoUpdateStatus(handleAutoUpdateStatus));
    }
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
    if (window.postmeter.workspace?.onKeyPrompt) {
      registerCleanup(window.postmeter.workspace.onKeyPrompt((payload) => {
        void handleWorkspaceKeyPrompt(payload).catch(() => {});
      }));
    }

    markUiWorkflowStartupStep('before-workspace-load');
    const loaded = await window.postmeter.workspace.load();
    markUiWorkflowStartupStep('after-workspace-load');
    await applyLoadedWorkspaceOrPrompt(loaded, { focus: 'request', render: false });
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
    queueUiTypographySmoke();
    queueUiOauthSmoke();
    queueUiHawkSmoke();
    queueUiAwsSmoke();
    queueUiA11ySmoke();
    queueUiAuthMatrixSmoke();
    scheduleStartupUpdateReminder();
    markUiWorkflowStartupStep('after-smoke-queue');
  }
});

window.PostMeterTutorials = {
  activeState: () => ({
    activeTutorialId,
    activeTutorialStepIndex,
    selectedTutorialId
  }),
  endTutorial,
  openTutorialsModal,
  selectTutorial,
  startTutorial,
  tutorials: TUTORIALS
};
