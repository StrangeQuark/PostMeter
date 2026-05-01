const { BODY_TYPES, collectionModel, keyValue, requestModel } = require('./models');
const {
  assertImportableCollection,
  buildUrlWithQuery,
  contentTypeForRequest,
  flattenCollectionRequests,
  isJsonMime,
  safeUrlPath,
  stripQueryFromUrl
} = require('./collectionFormatUtils');

function importHarDocument(document) {
  if (!looksLikeHarDocument(document)) {
    throw new Error('File is not a supported HAR document.');
  }
  const collection = collectionModel({ name: 'Imported HAR Collection', requests: [], folders: [] });
  for (const [index, entry] of (document.log.entries || []).entries()) {
    const source = entry?.request;
    if (!source?.url) {
      continue;
    }
    const request = requestModel({
      name: source.comment || `${source.method || 'GET'} ${safeUrlPath(source.url) || index + 1}`,
      method: source.method || 'GET',
      url: stripQueryFromUrl(source.url)
    });
    for (const query of source.queryString || []) {
      request.queryParams.push(keyValue(query.name, query.value ?? ''));
    }
    for (const header of source.headers || []) {
      request.headers.push(keyValue(header.name, header.value ?? ''));
    }
    appendHarCookiesToRequest(request, source.cookies);
    if (source.postData?.text) {
      request.body = source.postData.text;
      request.bodyType = isJsonMime(source.postData.mimeType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
      if (source.postData.encoding) {
        request.variables.push(keyValue('har.requestBodyEncoding', source.postData.encoding));
      }
    }
    const response = entry?.response;
    if (response && typeof response === 'object') {
      const responseHeaders = Array.isArray(response.headers)
        ? response.headers.filter((header) => header?.name).map((header) => keyValue(header.name, header.value ?? ''))
        : [];
      for (const cookie of Array.isArray(response.cookies) ? response.cookies : []) {
        const header = harCookieToSetCookieHeader(cookie);
        if (header) {
          responseHeaders.push(keyValue('Set-Cookie', header));
        }
      }
      request.examples.push({
        name: response.status ? `HAR ${response.status}` : 'HAR Response',
        statusCode: Number(response.status || 0),
        headers: responseHeaders,
        bodyType: isJsonMime(response.content?.mimeType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT,
        body: response.content?.text || ''
      });
      if (Number.isFinite(Number(entry.time)) && entry.time > 0) {
        request.variables.push(keyValue('har.responseTimeMillis', String(entry.time)));
      }
      if (response.redirectURL) {
        request.variables.push(keyValue('har.redirectUrl', response.redirectURL));
      }
      if (response.content?.encoding) {
        request.variables.push(keyValue('har.responseBodyEncoding', response.content.encoding));
      }
      if (Number.isFinite(Number(response.content?.compression))) {
        request.variables.push(keyValue('har.responseCompressionBytes', String(response.content.compression)));
      }
    }
    collection.requests.push(request);
  }
  assertImportableCollection(collection, 'HAR document');
  return collection;
}

function exportHarCollection(collection) {
  const entries = [];
  for (const { request } of flattenCollectionRequests(collection)) {
    const url = buildUrlWithQuery(request);
    const headers = (request.headers || [])
      .filter((header) => header.enabled !== false && header.key)
      .map((header) => ({ name: header.key, value: harHeaderExportValue(header.key, header.value) }));
    const cookies = harCookiesFromRequestHeaders(request.headers || []);
    const queryString = (request.queryParams || [])
      .filter((query) => query.enabled !== false && query.key)
      .map((query) => ({ name: query.key, value: query.value ?? '' }));
    entries.push({
      startedDateTime: new Date(0).toISOString(),
      time: 0,
      request: {
        method: request.method || 'GET',
        url,
        httpVersion: 'HTTP/1.1',
        headers,
        queryString,
        cookies,
        headersSize: -1,
        bodySize: request.body ? Buffer.byteLength(request.body, 'utf8') : 0,
        postData: request.body ? {
          mimeType: contentTypeForRequest(request),
          text: request.body
        } : undefined,
        comment: request.name || ''
      },
      response: {
        status: 0,
        statusText: '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        cookies: [],
        content: { size: 0, mimeType: 'text/plain', text: '' },
        redirectURL: '',
        headersSize: -1,
        bodySize: 0
      },
      cache: {},
      timings: { send: 0, wait: 0, receive: 0 }
    });
  }
  return {
    log: {
      version: '1.2',
      creator: { name: 'PostMeter', version: '0.2.0' },
      entries
    }
  };
}

function looksLikeHarDocument(document) {
  return Boolean(document?.log && document.log.version && Array.isArray(document.log.entries));
}

function appendHarCookiesToRequest(request, cookies) {
  const header = (Array.isArray(cookies) ? cookies : []).map(harCookieToHeaderPair).filter(Boolean).join('; ');
  if (!header) {
    return;
  }
  const existing = request.headers.find((item) => item.key?.toLowerCase() === 'cookie');
  if (existing) {
    existing.value = existing.value ? `${existing.value}; ${header}` : header;
  } else {
    request.headers.push(keyValue('Cookie', header));
  }
}

function harCookieToHeaderPair(cookie) {
  const name = cookie?.name;
  if (!name) {
    return '';
  }
  return `${name}=${cookie.value ?? ''}`;
}

function harCookieToSetCookieHeader(cookie) {
  const name = cookie?.name;
  if (!name) {
    return '';
  }
  const parts = [`${name}=${cookie.value ?? ''}`];
  if (cookie.path) {
    parts.push(`Path=${cookie.path}`);
  }
  if (cookie.domain) {
    parts.push(`Domain=${cookie.domain}`);
  }
  if (cookie.expires) {
    parts.push(`Expires=${cookie.expires}`);
  }
  if (cookie.httpOnly) {
    parts.push('HttpOnly');
  }
  if (cookie.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function harCookiesFromRequestHeaders(headers) {
  const cookieHeader = headers.find((header) => header.enabled !== false && header.key?.toLowerCase() === 'cookie');
  return parseCookieHeader(cookieHeader?.value).map((cookie) => ({
    name: cookie.name,
    value: '<redacted>'
  }));
}

function parseCookieHeader(value) {
  return String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      return separator > 0
        ? { name: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() }
        : { name: part, value: '' };
    })
    .filter((cookie) => cookie.name);
}

function harHeaderExportValue(name, value) {
  const lower = String(name || '').trim().toLowerCase();
  if (lower === 'authorization' || lower === 'proxy-authorization' || lower === 'cookie' || lower === 'set-cookie') {
    return '<redacted>';
  }
  return value ?? '';
}

module.exports = {
  exportHarCollection,
  importHarDocument,
  looksLikeHarDocument
};
