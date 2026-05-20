const path = require('node:path');
const { BODY_TYPES, SUPPORTED_METHODS, walkRequests } = require('../workspace/models');

const HTTP_METHODS = [...SUPPORTED_METHODS].map((method) => method.toLowerCase());
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

function flattenCollectionRequests(collection) {
  const entries = [];
  walkRequests(collection, (request, _collection, folder) => {
    entries.push({ request, folder });
  });
  return entries;
}

function buildUrlWithQuery(request) {
  const url = request.url || '';
  const enabled = (request.queryParams || []).filter((pair) => pair.enabled !== false && pair.key);
  if (!enabled.length) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${enabled.map((pair) => `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value ?? '')}`).join('&')}`;
}

function stripQueryFromUrl(url) {
  const parsed = parseRequestUrl(url);
  if (!parsed) {
    return url;
  }
  parsed.search = '';
  return parsed.toString();
}

function parseRequestUrl(url) {
  try {
    return new URL(String(url || ''));
  } catch {
    return null;
  }
}

function safeUrlPath(url) {
  return parseRequestUrl(url)?.pathname || '';
}

function contentTypeForRequest(request) {
  const explicit = (request.headers || []).find((header) => header.enabled !== false && header.key?.toLowerCase() === 'content-type');
  if (explicit?.value) {
    return explicit.value;
  }
  if (request.bodyType === BODY_TYPES.RAW_JSON) {
    return 'application/json';
  }
  if (request.bodyType === BODY_TYPES.RAW_JAVASCRIPT) {
    return 'application/javascript';
  }
  if (request.bodyType === BODY_TYPES.RAW_HTML) {
    return 'text/html; charset=utf-8';
  }
  if (request.bodyType === BODY_TYPES.RAW_XML) {
    return 'application/xml';
  }
  if (request.bodyType === BODY_TYPES.URLENCODED) {
    return 'application/x-www-form-urlencoded';
  }
  if (request.bodyType === BODY_TYPES.BINARY) {
    return request.postmanBody?.file?.contentType
      || request.postmanBody?.binary?.contentType
      || detectFileContentType(request.postmanBody?.file?.src || request.postmanBody?.binary?.src);
  }
  return 'text/plain; charset=utf-8';
}

function detectFileContentType(value) {
  const extension = path.extname(String(value || '').split(/[?#]/, 1)[0]).toLowerCase();
  return FILE_EXTENSION_CONTENT_TYPES.get(extension) || 'application/octet-stream';
}

function parseJsonMaybe(value) {
  if (!looksLikeJson(value)) {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function looksLikeJson(value) {
  const text = String(value || '').trim();
  return text.startsWith('{') || text.startsWith('[');
}

function isJsonMime(value) {
  return String(value || '').toLowerCase().includes('json');
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function assertImportableCollection(collection, label) {
  if (!collection.requests.length && !collection.folders.length) {
    throw new Error(`${label} does not contain importable requests.`);
  }
}

function shellQuote(value) {
  return `'${String(value ?? '').replaceAll("'", "'\\''")}'`;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function xmlUnescape(value) {
  return String(value ?? '')
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitCommandLine(text) {
  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const char of String(text || '').trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (escaped) {
    current += '\\';
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

module.exports = {
  BODY_TYPES,
  HTTP_METHODS,
  assertImportableCollection,
  buildUrlWithQuery,
  contentTypeForRequest,
  escapeRegExp,
  flattenCollectionRequests,
  isJsonMime,
  looksLikeJson,
  parseJsonMaybe,
  parseRequestUrl,
  safeUrlPath,
  shellQuote,
  splitCommandLine,
  stripQueryFromUrl,
  stripTrailingSlash,
  xmlEscape,
  xmlUnescape
};
