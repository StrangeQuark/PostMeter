const path = require('node:path');

const APP_PROTOCOL_SCHEME = 'postmeter-app';
const APP_PROTOCOL_HOST = 'bundle';
const APP_RENDERER_PATHNAME = '/src/renderer/index.html';
const APP_RENDERER_ICON_PATHNAME = '/build/icon.png';
const APP_RENDERER_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self' about: data:; child-src 'self' about: data:; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; worker-src 'none'; media-src 'none';";
const APP_RENDERER_QUERY_KEYS = Object.freeze([
  'uiWorkflowSmoke',
  'uiRegressionSmoke',
  'uiSnapshotSmoke',
  'uiTypographySmoke',
  'uiOauthSmoke',
  'uiHawkSmoke',
  'uiAwsSmoke',
  'uiWorkflowBaseUrl',
  'uiOauthBaseUrl',
  'uiHawkBaseUrl',
  'uiAwsBaseUrl'
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
const APP_RENDERER_ALLOWED_ASSET_PATHS = Object.freeze([
  APP_RENDERER_ICON_PATHNAME,
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

module.exports = {
  appRendererAssetPathFromScriptSrc,
  APP_PROTOCOL_HOST,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_ALLOWED_ASSET_PATHS,
  APP_RENDERER_CORE_ASSET_PATHS,
  APP_RENDERER_CSP,
  APP_RENDERER_ICON_PATHNAME,
  APP_RENDERER_PATHNAME,
  APP_RENDERER_QUERY_KEYS
};
