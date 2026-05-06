const fs = require('node:fs/promises');
const path = require('node:path');

const APP_PROTOCOL_SCHEME = 'postmeter-app';
const APP_PROTOCOL_HOST = 'bundle';
const APP_RENDERER_PATHNAME = '/src/renderer/index.html';
const APP_RENDERER_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self' about: data:; child-src 'self' about: data:; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; worker-src 'none'; media-src 'none';";
const APP_RENDERER_QUERY_KEYS = new Set([
  'uiWorkflowSmoke',
  'uiRegressionSmoke',
  'uiSnapshotSmoke',
  'uiOauthSmoke',
  'uiWorkflowBaseUrl',
  'uiOauthBaseUrl'
]);
const ALLOWED_CORE_ASSETS = new Set([
  '/src/core/authModel.js',
  '/src/core/cookieModel.js',
  '/src/core/payloadSchemas.js'
]);

function registerAppProtocolScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true
      }
    }
  ]);
}

function registerAppProtocolHandler(protocol, options = {}) {
  const rootPath = path.resolve(options.rootPath || path.join(__dirname, '..'));
  protocol.handle(APP_PROTOCOL_SCHEME, (request) => serveAppProtocolRequest(request, { rootPath }));
}

async function serveAppProtocolRequest(request, options = {}) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return textResponse('Method not allowed.', 405);
  }
  const rootPath = path.resolve(options.rootPath || path.join(__dirname, '..'));
  let filePath;
  try {
    filePath = appProtocolFilePath(request?.url, rootPath);
  } catch {
    return textResponse('Not found.', 404);
  }
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return textResponse('Not found.', 404);
    }
    const headers = appProtocolHeaders(filePath);
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }
    const body = await fs.readFile(filePath);
    return new Response(body, { status: 200, headers });
  } catch {
    return textResponse('Not found.', 404);
  }
}

function createAppRendererUrl(query = {}) {
  const url = new URL(`${APP_PROTOCOL_SCHEME}://${APP_PROTOCOL_HOST}${APP_RENDERER_PATHNAME}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === '') {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function isTrustedAppRendererUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === `${APP_PROTOCOL_SCHEME}:`
      && parsed.hostname === APP_PROTOCOL_HOST
      && parsed.pathname === APP_RENDERER_PATHNAME
      && !parsed.username
      && !parsed.password
      && !parsed.port
      && hasOnlyAllowedRendererQuery(parsed);
  } catch {
    return false;
  }
}

function hasOnlyAllowedRendererQuery(parsed) {
  for (const key of parsed.searchParams.keys()) {
    if (!APP_RENDERER_QUERY_KEYS.has(key)) {
      return false;
    }
  }
  return true;
}

function appProtocolFilePath(rawUrl, rootPath) {
  const parsed = new URL(String(rawUrl || ''));
  if (parsed.protocol !== `${APP_PROTOCOL_SCHEME}:`
    || parsed.hostname !== APP_PROTOCOL_HOST
    || parsed.username
    || parsed.password
    || parsed.port) {
    throw new Error('Invalid PostMeter app protocol URL.');
  }
  let pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname === '/') {
    pathname = APP_RENDERER_PATHNAME;
  }
  if (pathname.includes('\0')) {
    throw new Error('Invalid PostMeter app protocol path.');
  }
  const normalizedPathname = path.posix.normalize(pathname);
  if (!normalizedPathname.startsWith('/') || normalizedPathname.includes('\0')) {
    throw new Error('Invalid PostMeter app protocol path.');
  }
  if (!isAllowedAppAssetPath(normalizedPathname)) {
    throw new Error('PostMeter app protocol asset is not allowlisted.');
  }
  const resolved = path.resolve(rootPath, `.${normalizedPathname}`);
  const relative = path.relative(rootPath, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('PostMeter app protocol path escapes the application bundle.');
  }
  return resolved;
}

function isAllowedAppAssetPath(pathname) {
  return pathname === '/build/icon.png'
    || pathname.startsWith('/src/renderer/')
    || ALLOWED_CORE_ASSETS.has(pathname);
}

function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8'
  }[extension] || 'application/octet-stream';
}

function appProtocolHeaders(filePath) {
  const headers = {
    'cache-control': 'no-store',
    'content-type': contentTypeForPath(filePath),
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff'
  };
  if (path.extname(filePath).toLowerCase() === '.html') {
    headers['content-security-policy'] = APP_RENDERER_CSP;
  }
  return headers;
}

function textResponse(message, status) {
  return new Response(String(message || ''), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff'
    }
  });
}

module.exports = {
  appProtocolFilePath,
  APP_PROTOCOL_HOST,
  APP_RENDERER_CSP,
  APP_RENDERER_QUERY_KEYS,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_PATHNAME,
  appProtocolHeaders,
  contentTypeForPath,
  createAppRendererUrl,
  isTrustedAppRendererUrl,
  registerAppProtocolHandler,
  registerAppProtocolScheme,
  serveAppProtocolRequest
};
