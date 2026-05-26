const fs = require('node:fs/promises');
const path = require('node:path');
const {
  appRendererAllowedAssetPaths,
  appRendererAllowedQueryKeys,
  APP_PROTOCOL_HOST,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_CSP,
  APP_RENDERER_PATHNAME,
  APP_RENDERER_QUERY_KEYS,
  APP_RENDERER_SMOKE_QUERY_KEYS
} = require('./rendererAssetManifest');

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
  const rootPath = path.resolve(options.rootPath || path.join(__dirname, '..', '..'));
  const allowSmokeAssets = shouldAllowRendererSmokeAssets(options);
  protocol.handle(APP_PROTOCOL_SCHEME, (request) => serveAppProtocolRequest(request, { rootPath, allowSmokeAssets }));
}

async function serveAppProtocolRequest(request, options = {}) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return textResponse('Method not allowed.', 405);
  }
  const rootPath = path.resolve(options.rootPath || path.join(__dirname, '..', '..'));
  let filePath;
  try {
    filePath = appProtocolFilePath(request?.url, rootPath, { allowSmokeAssets: options.allowSmokeAssets === true });
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

function createAppRendererUrl(query = {}, options = {}) {
  const url = new URL(`${APP_PROTOCOL_SCHEME}://${APP_PROTOCOL_HOST}${APP_RENDERER_PATHNAME}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === '') {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function isTrustedAppRendererUrl(value, options = {}) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === `${APP_PROTOCOL_SCHEME}:`
      && parsed.hostname === APP_PROTOCOL_HOST
      && parsed.pathname === APP_RENDERER_PATHNAME
      && !parsed.username
      && !parsed.password
      && !parsed.port
      && hasOnlyAllowedRendererQuery(parsed, options);
  } catch {
    return false;
  }
}

function hasOnlyAllowedRendererQuery(parsed, options = {}) {
  const allowedQueryKeys = new Set(appRendererAllowedQueryKeys({ includeSmoke: options.allowSmokeQuery === true }));
  for (const key of parsed.searchParams.keys()) {
    if (!allowedQueryKeys.has(key)) {
      return false;
    }
  }
  return true;
}

function appProtocolFilePath(rawUrl, rootPath, options = {}) {
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
  if (normalizedPathname === APP_RENDERER_PATHNAME) {
    if (!hasOnlyAllowedRendererQuery(parsed, { allowSmokeQuery: options.allowSmokeAssets === true })) {
      throw new Error('PostMeter app protocol query is not allowlisted.');
    }
  } else if (parsed.search) {
    throw new Error('PostMeter app protocol asset queries are not allowlisted.');
  }
  if (!isAllowedAppAssetPath(normalizedPathname, options)) {
    throw new Error('PostMeter app protocol asset is not allowlisted.');
  }
  const resolved = path.resolve(rootPath, `.${normalizedPathname}`);
  const relative = path.relative(rootPath, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('PostMeter app protocol path escapes the application bundle.');
  }
  return resolved;
}

function isAllowedAppAssetPath(pathname, options = {}) {
  return new Set(appRendererAllowedAssetPaths({ includeSmoke: options.allowSmokeAssets === true })).has(pathname);
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

function shouldAllowRendererSmokeAssets(options = {}) {
  const env = options.env || process.env;
  const isPackaged = options.isPackaged === true || options.app?.isPackaged === true;
  if (isPackaged) {
    return packagedRendererSmokeRequested(env);
  }
  if (options.allowSmokeAssets === true) {
    return true;
  }
  return rendererSmokeRequested(env);
}

function rendererSmokeRequested(env = process.env) {
  return APP_RENDERER_SMOKE_QUERY_KEYS.some((key) => {
    if (!key.startsWith('ui') || key.endsWith('BaseUrl')) {
      return false;
    }
    const envKey = `POSTMETER_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
    return env[envKey] === '1';
  });
}

function packagedRendererSmokeRequested(env = process.env) {
  return env.POSTMETER_PACKAGED_SMOKE === '1' && env.POSTMETER_PACKAGED_UI_SMOKE === '1' && rendererSmokeRequested(env);
}

module.exports = {
  appProtocolFilePath,
  APP_PROTOCOL_HOST,
  APP_RENDERER_CSP,
  APP_RENDERER_QUERY_KEYS,
  APP_RENDERER_SMOKE_QUERY_KEYS,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_PATHNAME,
  appProtocolHeaders,
  contentTypeForPath,
  createAppRendererUrl,
  isTrustedAppRendererUrl,
  packagedRendererSmokeRequested,
  rendererSmokeRequested,
  registerAppProtocolHandler,
  registerAppProtocolScheme,
  serveAppProtocolRequest
};
