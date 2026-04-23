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
    if (source.postData?.text) {
      request.body = source.postData.text;
      request.bodyType = isJsonMime(source.postData.mimeType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
    }
    const response = entry?.response;
    if (response && typeof response === 'object') {
      request.examples.push({
        name: response.status ? `HAR ${response.status}` : 'HAR Response',
        statusCode: Number(response.status || 0),
        headers: Array.isArray(response.headers)
          ? response.headers.filter((header) => header?.name).map((header) => keyValue(header.name, header.value ?? ''))
          : [],
        bodyType: isJsonMime(response.content?.mimeType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT,
        body: response.content?.text || ''
      });
      if (Number.isFinite(Number(entry.time)) && entry.time > 0) {
        request.variables.push(keyValue('har.responseTimeMillis', String(entry.time)));
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
      .map((header) => ({ name: header.key, value: header.value ?? '' }));
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
        cookies: [],
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

module.exports = {
  exportHarCollection,
  importHarDocument,
  looksLikeHarDocument
};
