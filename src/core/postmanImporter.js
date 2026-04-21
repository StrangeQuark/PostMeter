const { BODY_TYPES, collectionModel, folderModel, keyValue, requestModel } = require('./models');

function importPostmanCollection(document) {
  if (!looksLikePostmanCollection(document)) {
    throw new Error('File is not a supported Postman collection.');
  }

  const collection = collectionModel({
    name: document.info?.name || 'Imported Postman Collection',
    requests: [],
    folders: []
  });

  for (const item of document.item || []) {
    const imported = importItem(item);
    if (!imported) {
      continue;
    }
    if (imported.kind === 'folder') {
      collection.folders.push(imported.value);
    } else {
      collection.requests.push(imported.value);
    }
  }

  if (collection.requests.length === 0 && collection.folders.length === 0) {
    throw new Error('Postman collection does not contain importable requests.');
  }
  return collection;
}

function looksLikePostmanCollection(document) {
  return Boolean(
    document
    && document.info
    && Array.isArray(document.item)
    && typeof document.info.schema === 'string'
    && document.info.schema.includes('postman.com/json/collection')
  );
}

function importItem(item) {
  if (item?.request) {
    return { kind: 'request', value: importRequest(item) };
  }
  if (Array.isArray(item?.item)) {
    const folder = folderModel({ name: item.name || 'Imported Folder' });
    for (const child of item.item) {
      const imported = importItem(child);
      if (!imported) {
        continue;
      }
      if (imported.kind === 'folder') {
        folder.folders.push(imported.value);
      } else {
        folder.requests.push(imported.value);
      }
    }
    return { kind: 'folder', value: folder };
  }
  return null;
}

function importRequest(item) {
  const requestNode = item.request || {};
  const request = requestModel({
    name: item.name || 'Imported Request',
    method: requestNode.method || 'GET',
    url: importUrl(requestNode.url)
  });
  importHeaders(requestNode.header, request);
  importQueryParams(requestNode.url?.query, request);
  importBody(requestNode.body, request);
  return request;
}

function importUrl(urlNode) {
  if (typeof urlNode === 'string') {
    return urlNode;
  }
  if (!urlNode || typeof urlNode !== 'object') {
    return '';
  }
  if (typeof urlNode.raw === 'string' && urlNode.raw.trim()) {
    const queryStart = urlNode.raw.indexOf('?');
    return queryStart >= 0 ? urlNode.raw.slice(0, queryStart) : urlNode.raw;
  }
  const protocol = urlNode.protocol || 'https';
  const host = Array.isArray(urlNode.host) ? urlNode.host.join('.') : '';
  const path = Array.isArray(urlNode.path) ? urlNode.path.join('/') : '';
  if (!host) {
    return '';
  }
  return `${protocol}://${host}${path ? `/${path}` : ''}`;
}

function importHeaders(headers, request) {
  if (!Array.isArray(headers)) {
    return;
  }
  for (const header of headers) {
    if (!header?.key) {
      continue;
    }
    request.headers.push(keyValue(header.key, header.value ?? '', header.disabled !== true));
  }
}

function importQueryParams(queryParams, request) {
  if (!Array.isArray(queryParams)) {
    return;
  }
  for (const queryParam of queryParams) {
    if (!queryParam?.key) {
      continue;
    }
    request.queryParams.push(keyValue(queryParam.key, queryParam.value ?? '', queryParam.disabled !== true));
  }
}

function importBody(bodyNode, request) {
  if (!bodyNode || bodyNode.mode !== 'raw') {
    return;
  }
  request.body = bodyNode.raw ?? '';
  request.bodyType = bodyNode.options?.raw?.language === 'json' ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
}

module.exports = {
  importPostmanCollection,
  looksLikePostmanCollection
};
