const path = require('node:path');

const APP_PROTOCOL_SCHEME = 'postmeter-app';
const APP_PROTOCOL_HOST = 'bundle';
const APP_RENDERER_PATHNAME = '/src/renderer/index.html';
const APP_RENDERER_ICON_PATHNAME = '/build/icon.png';
const APP_RENDERER_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self' about: data:; child-src 'self' about: data:; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; worker-src 'none'; media-src 'none';";
const APP_RENDERER_QUERY_KEYS = Object.freeze([]);
const APP_RENDERER_SMOKE_QUERY_KEYS = Object.freeze([
  'uiWorkflowSmoke',
  'uiRegressionSmoke',
  'uiSnapshotSmoke',
  'uiTypographySmoke',
  'uiOauthSmoke',
  'uiHawkSmoke',
  'uiAwsSmoke',
  'uiA11ySmoke',
  'uiAuthMatrixSmoke',
  'uiWorkflowBaseUrl',
  'uiOauthBaseUrl',
  'uiHawkBaseUrl',
  'uiAwsBaseUrl',
  'uiAuthBaseUrl'
]);
const APP_RENDERER_CORE_ASSET_PATHS = Object.freeze([
  '/src/core/http/authModel.js',
  '/src/core/http/cookieModel.js',
  '/src/core/workspace/csvVariables.js',
  '/src/core/contracts/keyboardShortcuts.js',
  '/src/core/contracts/payloadSchemas.js',
  '/src/core/workspace/resultCapturePolicy.js',
  '/src/core/workspace/requestQueryModel.js'
]);
const APP_RENDERER_STYLE_ASSET_PATHS = Object.freeze([
  '/src/renderer/styles/theme.css',
  '/src/renderer/styles/base.css',
  '/src/renderer/styles/styles.css',
  '/src/renderer/styles/chrome.css',
  '/src/renderer/styles/editorPanels.css',
  '/src/renderer/styles/overlays.css'
]);
const APP_RENDERER_SCRIPT_ASSET_PATHS = Object.freeze([
  '/src/renderer/formatting/responseFormatting.js',
  '/src/renderer/ui/contextMenu.js',
  '/src/renderer/ui/layoutControls.js',
  '/src/renderer/models/collectionModel.js',
  '/src/renderer/models/cookieModel.js',
  '/src/renderer/models/performanceTestModel.js',
  '/src/renderer/ui/variableHighlighter.js',
  '/src/renderer/ui/codeEditor.js',
  '/src/renderer/ui/requestEditorPanels.js',
  '/src/renderer/ui/variableAutocomplete.js',
  '/src/renderer/app/rendererState.js',
  '/src/renderer/app/sessionPersistence.js',
  '/src/renderer/ui/requestTabs.js',
  '/src/renderer/app/requestTabState.js',
  '/src/renderer/models/authRefreshAutoDetectModel.js',
  '/src/renderer/app/rendererBootstrap.js',
  '/src/renderer/ui/vaultPromptQueue.js',
  '/src/renderer/app/rendererWorkflows.js',
  '/src/renderer/formatting/runResultFormatting.js',
  '/src/renderer/vendor/markdown-it.min.js',
  '/src/renderer/formatting/markdownRenderer.js',
  '/src/renderer/features/tutorialCatalog.js',
  '/src/renderer/features/entityDisplay.js',
  '/src/renderer/ui/rendererUiUtilities.js',
  '/src/renderer/app/rendererStartup.js',
  '/src/renderer/ui/titleEditors.js',
  '/src/renderer/app/appMenuAndTabs.js',
  '/src/renderer/ui/modalController.js',
  '/src/renderer/features/tutorialController.js',
  '/src/renderer/ui/localFilePickerController.js',
  '/src/renderer/features/vaultPromptController.js',
  '/src/renderer/app/workspaceLifecycle.js',
  '/src/renderer/features/settingsController.js',
  '/src/renderer/features/workspaceSidebarController.js',
  '/src/renderer/features/authRefreshController.js',
  '/src/renderer/features/performanceController.js',
  '/src/renderer/features/runnerController.js',
  '/src/renderer/features/diagnosticsWorkspaceController.js',
  '/src/renderer/ui/requestEditorController.js',
  '/src/renderer/features/runtimeResultsController.js',
  '/src/renderer/features/importExportWorkspaceController.js',
  '/src/renderer/app/editorCollectors.js',
  '/src/renderer/renderer.js'
]);
const APP_RENDERER_SMOKE_SCRIPT_ASSET_PATHS = Object.freeze([
  '/src/renderer/smoke/uiSmokeCommon.js',
  '/src/renderer/smoke/uiSnapshotManifest.js',
  '/src/renderer/smoke/uiWorkflowSmoke.js',
  '/src/renderer/smoke/uiRegressionSmoke.js',
  '/src/renderer/smoke/uiSnapshotSmoke.js',
  '/src/renderer/smoke/uiTypographySmoke.js',
  '/src/renderer/smoke/uiOauthSmoke.js',
  '/src/renderer/smoke/uiHawkSmoke.js',
  '/src/renderer/smoke/uiAwsSmoke.js',
  '/src/renderer/smoke/uiA11ySmoke.js',
  '/src/renderer/smoke/uiAuthMatrixSmoke.js',
  '/src/renderer/smoke/uiSmoke.js'
]);
const APP_RENDERER_ALLOWED_ASSET_PATHS = Object.freeze([
  APP_RENDERER_PATHNAME,
  APP_RENDERER_ICON_PATHNAME,
  ...APP_RENDERER_STYLE_ASSET_PATHS,
  ...APP_RENDERER_SCRIPT_ASSET_PATHS,
  ...APP_RENDERER_CORE_ASSET_PATHS
]);

function appRendererAssetPathFromScriptSrc(scriptSrc, basePathname = APP_RENDERER_PATHNAME) {
  const source = String(scriptSrc || '').trim();
  if (!source || source.includes('\0')) {
    throw new Error(`Invalid renderer script source: ${source}`);
  }
  const parsed = new URL(source, `${APP_PROTOCOL_SCHEME}://${APP_PROTOCOL_HOST}${basePathname}`);
  if (parsed.protocol !== `${APP_PROTOCOL_SCHEME}:`
    || parsed.hostname !== APP_PROTOCOL_HOST
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
    || parsed.port) {
    throw new Error(`Invalid renderer script source: ${source}`);
  }
  const normalized = path.posix.normalize(decodeURIComponent(parsed.pathname));
  if (!normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error(`Invalid renderer script path: ${source}`);
  }
  return normalized;
}

function appRendererAllowedAssetPaths(options = {}) {
  return Object.freeze([
    ...APP_RENDERER_ALLOWED_ASSET_PATHS,
    ...(options.includeSmoke === true ? APP_RENDERER_SMOKE_SCRIPT_ASSET_PATHS : [])
  ]);
}

function appRendererAllowedQueryKeys(options = {}) {
  return Object.freeze([
    ...APP_RENDERER_QUERY_KEYS,
    ...(options.includeSmoke === true ? APP_RENDERER_SMOKE_QUERY_KEYS : [])
  ]);
}

module.exports = {
  appRendererAssetPathFromScriptSrc,
  appRendererAllowedAssetPaths,
  appRendererAllowedQueryKeys,
  APP_PROTOCOL_HOST,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_ALLOWED_ASSET_PATHS,
  APP_RENDERER_CORE_ASSET_PATHS,
  APP_RENDERER_CSP,
  APP_RENDERER_ICON_PATHNAME,
  APP_RENDERER_PATHNAME,
  APP_RENDERER_SCRIPT_ASSET_PATHS,
  APP_RENDERER_SMOKE_QUERY_KEYS,
  APP_RENDERER_SMOKE_SCRIPT_ASSET_PATHS,
  APP_RENDERER_STYLE_ASSET_PATHS,
  APP_RENDERER_QUERY_KEYS
};
