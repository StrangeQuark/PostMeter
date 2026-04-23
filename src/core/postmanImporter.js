const { BODY_TYPES, collectionModel, folderModel, keyValue, requestModel } = require('./models');

function importPostmanCollection(document) {
  if (!looksLikePostmanCollection(document)) {
    throw new Error('File is not a supported Postman collection.');
  }

  const collection = collectionModel({
    name: document.info?.name || 'Imported Postman Collection',
    variables: importVariables(document.variable),
    certificates: importCertificates(document.certificate),
    requests: [],
    folders: []
  });
  const collectionEvents = importEvents(document.event);
  const collectionAuth = importAuth(document.auth, { type: 'none' });
  const collectionVariables = importVariables(document.variable);

  for (const item of document.item || []) {
    const imported = importItem(item, collectionEvents, collectionAuth, collectionVariables);
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
  applyCollectionCertificates(collection);
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

function importItem(item, inheritedEvents = emptyEvents(), inheritedAuth = { type: 'none' }, inheritedVariables = []) {
  const itemEvents = mergeEvents(inheritedEvents, importEvents(item?.event));
  const itemAuth = item?.auth ? importAuth(item.auth, inheritedAuth) : inheritedAuth;
  const itemVariables = mergeVariables(inheritedVariables, importVariables(item?.variable));
  if (item?.request) {
    return { kind: 'request', value: importRequest(item, itemEvents, itemAuth, itemVariables) };
  }
  if (Array.isArray(item?.item)) {
    const folder = folderModel({ name: item.name || 'Imported Folder' });
    for (const child of item.item) {
      const imported = importItem(child, itemEvents, itemAuth, itemVariables);
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

function importRequest(item, inheritedEvents = emptyEvents(), inheritedAuth = { type: 'none' }, inheritedVariables = []) {
  const requestNode = item.request || {};
  const request = requestModel({
    name: item.name || 'Imported Request',
    method: requestNode.method || 'GET',
    url: importUrl(requestNode.url),
    auth: requestNode.auth ? importAuth(requestNode.auth, inheritedAuth) : inheritedAuth,
    variables: mergeVariables(inheritedVariables, importVariables(requestNode.variable || item.variable)),
    examples: importExamples(item.response),
    scripts: {
      preRequest: inheritedEvents.preRequest,
      tests: inheritedEvents.tests
    }
  });
  importHeaders(requestNode.header, request);
  importCookies(requestNode.cookie, request);
  importQueryParams(requestNode.url?.query, request);
  importBody(requestNode.body, request);
  return request;
}

function importVariables(variables) {
  if (!Array.isArray(variables)) {
    return [];
  }
  return variables
    .filter((variable) => variable?.key)
    .map((variable) => keyValue(
      variable.key,
      variable.value ?? variable.initial ?? '',
      variable.disabled !== true
    ));
}

function mergeVariables(parent = [], child = []) {
  const merged = parent.map((variable) => ({ ...variable }));
  for (const variable of child || []) {
    const existingIndex = merged.findIndex((item) => item.key === variable.key);
    if (existingIndex >= 0) {
      merged[existingIndex] = { ...variable };
    } else {
      merged.push({ ...variable });
    }
  }
  return merged;
}

function importEvents(events) {
  const imported = emptyEvents();
  if (!Array.isArray(events)) {
    return imported;
  }
  for (const event of events) {
    const listen = String(event?.listen || '').toLowerCase();
    const source = scriptSource(event?.script);
    if (!source.trim()) {
      continue;
    }
    if (listen === 'prerequest') {
      imported.preRequest = appendScript(imported.preRequest, source);
    } else if (listen === 'test') {
      imported.tests = appendScript(imported.tests, source);
    }
  }
  return imported;
}

function scriptSource(script) {
  if (!script) {
    return '';
  }
  if (Array.isArray(script.exec)) {
    return script.exec.join('\n');
  }
  if (typeof script.exec === 'string') {
    return script.exec;
  }
  return '';
}

function mergeEvents(parent, child) {
  return {
    preRequest: appendScript(parent.preRequest, child.preRequest),
    tests: appendScript(parent.tests, child.tests)
  };
}

function emptyEvents() {
  return { preRequest: '', tests: '' };
}

function appendScript(left = '', right = '') {
  const scripts = [left, right].filter((value) => String(value || '').trim());
  return scripts.join('\n');
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

function importCookies(cookies, request) {
  if (!Array.isArray(cookies) || !cookies.length) {
    return;
  }
  const importedCookies = cookies.filter((cookie) => cookie && cookie.disabled !== true && cookie.name);
  const cookieHeader = importedCookies
    .map((cookie) => `${cookie.name}=${cookie.value ?? ''}`)
    .join('; ');
  if (cookieHeader) {
    request.headers.push(keyValue('Cookie', cookieHeader));
  }
  const metadata = importedCookies
    .map(postmanCookieMetadata)
    .filter((cookie) => cookie.name);
  if (metadata.length) {
    request.variables.push(keyValue('postman.cookies', JSON.stringify(metadata)));
  }
}

function postmanCookieMetadata(cookie) {
  return {
    source: 'postman',
    name: String(cookie.name || ''),
    value: cookie.value == null ? '' : String(cookie.value),
    domain: cookie.domain == null ? '' : String(cookie.domain),
    path: cookie.path == null ? '' : String(cookie.path),
    expiresAt: postmanCookieExpiresAt(cookie.expiresAt ?? cookie.expires ?? cookie.expirationDate),
    maxAge: cookie.maxAge == null ? '' : String(cookie.maxAge),
    secure: cookie.secure === true,
    httpOnly: cookie.httpOnly === true,
    sameSite: normalizePostmanSameSite(cookie.sameSite),
    hostOnly: cookie.hostOnly === true || cookie.hostOnly === 'true',
    priority: normalizePostmanCookiePriority(cookie.priority),
    partitioned: cookie.partitioned === true || cookie.partitioned === 'true',
    extensions: Array.isArray(cookie.extensions) ? cookie.extensions.map(String).slice(0, 25) : []
  };
}

function postmanCookieExpiresAt(value) {
  if (value == null || value === '') {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function normalizePostmanSameSite(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'strict') {
    return 'Strict';
  }
  if (normalized === 'lax') {
    return 'Lax';
  }
  if (normalized === 'none' || normalized === 'no_restriction') {
    return 'None';
  }
  return '';
}

function normalizePostmanCookiePriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'high') {
    return 'High';
  }
  if (normalized === 'medium') {
    return 'Medium';
  }
  if (normalized === 'low') {
    return 'Low';
  }
  return '';
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

function importExamples(responses) {
  if (!Array.isArray(responses)) {
    return [];
  }
  return responses
    .filter((response) => response && typeof response === 'object')
    .map((response) => {
      const headers = Array.isArray(response.header)
        ? response.header.filter((header) => header?.key).map((header) => keyValue(header.key, header.value ?? '', header.disabled !== true))
        : [];
      const body = response.body == null ? '' : String(response.body);
      return {
        name: response.name || response.originalRequest?.name || 'Example Response',
        statusCode: Number(response.code || response.statusCode || 0),
        headers,
        bodyType: looksLikeJson(body) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT,
        body
      };
    });
}

function importCertificates(certificates) {
  if (!Array.isArray(certificates)) {
    return [];
  }
  return certificates
    .filter((certificate) => certificate && typeof certificate === 'object')
    .map((certificate) => ({
      name: certificate.name || 'Postman Client Certificate',
      matches: Array.isArray(certificate.matches) ? certificate.matches.map((value) => String(value || '')).filter(Boolean) : [],
      certPath: certificate.cert?.src || certificate.certPath || '',
      keyPath: certificate.key?.src || certificate.keyPath || '',
      pfxPath: certificate.pfx?.src || certificate.pfxPath || '',
      passphrase: certificate.passphrase || ''
    }));
}

function applyCollectionCertificates(collection) {
  if (!collection.certificates?.length) {
    return;
  }
  const apply = (request) => {
    if (request.auth?.type && request.auth.type !== 'none') {
      return;
    }
    const certificate = collection.certificates.find((candidate) => certificateMatchesRequest(candidate, request));
    if (!certificate) {
      return;
    }
    request.auth = {
      type: 'clientCertificate',
      certPath: certificate.certPath || '',
      keyPath: certificate.keyPath || '',
      pfxPath: certificate.pfxPath || '',
      caPath: certificate.caPath || '',
      passphrase: certificate.passphrase || ''
    };
  };
  const walk = (folders) => {
    for (const folder of folders || []) {
      for (const request of folder.requests || []) {
        apply(request);
      }
      walk(folder.folders);
    }
  };
  for (const request of collection.requests || []) {
    apply(request);
  }
  walk(collection.folders);
}

function certificateMatchesRequest(certificate, request) {
  if (!certificate?.matches?.length) {
    return false;
  }
  const url = request.url || '';
  return certificate.matches.some((match) => {
    const pattern = String(match || '').replace(/\*/g, '');
    return pattern && url.includes(pattern);
  });
}

function importAuth(authNode, inheritedAuth = { type: 'none' }) {
  if (!authNode || typeof authNode !== 'object') {
    return inheritedAuth || { type: 'none' };
  }
  const type = String(authNode.type || '').toLowerCase();
  if (!type || type === 'inherit') {
    return inheritedAuth || { type: 'none' };
  }
  if (type === 'noauth') {
    return { type: 'none' };
  }
  if (type === 'bearer') {
    return { type: 'bearer', token: authParam(authNode.bearer, 'token') };
  }
  if (type === 'basic') {
    return {
      type: 'basic',
      username: authParam(authNode.basic, 'username'),
      password: authParam(authNode.basic, 'password')
    };
  }
  if (type === 'apikey') {
    const location = String(authParam(authNode.apikey, 'in') || 'header').toLowerCase() === 'query'
      ? 'query'
      : 'header';
    return {
      type: 'apiKey',
      location,
      key: authParam(authNode.apikey, 'key'),
      value: authParam(authNode.apikey, 'value')
    };
  }
  if (type === 'oauth2') {
    return {
      type: 'oauth2',
      tokenType: authParam(authNode.oauth2, 'tokenType') || 'Bearer',
      accessToken: authParam(authNode.oauth2, 'accessToken'),
      refreshToken: authParam(authNode.oauth2, 'refreshToken'),
      authorizationUrl: authParam(authNode.oauth2, 'authUrl'),
      tokenUrl: authParam(authNode.oauth2, 'accessTokenUrl'),
      clientId: authParam(authNode.oauth2, 'clientId'),
      clientSecret: authParam(authNode.oauth2, 'clientSecret'),
      scopes: authParam(authNode.oauth2, 'scope'),
      grantType: postmanOauthGrantType(authParam(authNode.oauth2, 'grant_type'))
    };
  }
  return inheritedAuth || { type: 'none' };
}

function authParam(values, key) {
  if (!values) {
    return '';
  }
  if (Array.isArray(values)) {
    const item = values.find((candidate) => candidate?.key === key);
    return item?.value == null ? '' : String(item.value);
  }
  if (typeof values === 'object') {
    const value = values[key];
    return value == null ? '' : String(value);
  }
  return '';
}

function postmanOauthGrantType(value) {
  const grantType = String(value || '').toLowerCase();
  if (grantType === 'client_credentials') {
    return 'clientCredentials';
  }
  if (grantType === 'device_code') {
    return 'deviceCode';
  }
  return 'authorizationCode';
}

function looksLikeJson(value) {
  const text = String(value || '').trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  importPostmanCollection,
  importAuth,
  looksLikePostmanCollection
};
