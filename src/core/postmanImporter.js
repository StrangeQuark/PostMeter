const crypto = require('node:crypto');
const { BODY_TYPES, collectionModel, folderModel, keyValue, requestModel } = require('./models');
const { collectSandboxPackageReferencesFromCollection } = require('./sandboxPackageCache');

const POSTMAN_COLLECTION_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const INTERNAL_POSTMAN_VARIABLE_KEYS = new Set([
  'postman.cookies',
  'postman.fileReferences',
  'postman.packageReferences'
]);

function importPostmanCollection(document) {
  if (!looksLikePostmanCollection(document)) {
    throw new Error('File is not a supported Postman collection.');
  }

  const collection = collectionModel({
    id: postmanIdForNode(document.info || document, 'collection', [document.info?.name || 'collection']).modelId,
    name: document.info?.name || 'Imported Postman Collection',
    description: postmanDescription(document.info?.description || document.description),
    variables: importVariables(document.variable),
    certificates: importCertificates(document.certificate),
    requests: [],
    folders: [],
    postman: collectionPostmanMetadata(document)
  });
  const collectionEvents = importEvents(document.event);
  const collectionAuth = importAuth(document.auth, { type: 'none' });
  const collectionVariables = importVariables(document.variable);

  for (const [index, item] of (document.item || []).entries()) {
    const imported = importItem(item, collectionEvents, collectionAuth, collectionVariables, [collection.name], { orderIndex: index });
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
  annotatePackageReferences(collection);
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

function importItem(item, inheritedEvents = emptyEvents(), inheritedAuth = { type: 'none' }, inheritedVariables = [], pathSegments = [], options = {}) {
  const itemPath = pathSegments.concat(item?.name || item?.id || item?._postman_id || item?.uid || 'item');
  const itemEvents = mergeEvents(inheritedEvents, importEvents(item?.event));
  const itemAuth = item?.auth ? importAuth(item.auth, inheritedAuth) : inheritedAuth;
  const itemVariables = mergeVariables(inheritedVariables, importVariables(item?.variable));
  if (item?.request) {
    return { kind: 'request', value: importRequest(item, itemEvents, itemAuth, itemVariables, itemPath, options) };
  }
  if (Array.isArray(item?.item)) {
    const folderId = postmanIdForNode(item, 'folder', itemPath);
    const folder = folderModel({
      id: folderId.modelId,
      name: item.name || 'Imported Folder',
      postman: folderPostmanMetadata(item, folderId, options.orderIndex)
    });
    for (const [index, child] of item.item.entries()) {
      const imported = importItem(child, itemEvents, itemAuth, itemVariables, itemPath, { orderIndex: index });
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

function importRequest(item, inheritedEvents = emptyEvents(), inheritedAuth = { type: 'none' }, inheritedVariables = [], pathSegments = [], options = {}) {
  const requestNode = item.request || {};
  const protocol = detectRequestProtocol(item, requestNode);
  const protocolFields = importProtocolFields(item, requestNode, protocol);
  const scripts = scriptsForProtocol(inheritedEvents, protocol);
  const requestId = postmanIdForNode(item, 'request', pathSegments);
  const request = requestModel({
    id: requestId.modelId,
    name: item.name || 'Imported Request',
    protocol,
    method: httpMethodForProtocol(requestNode.method, protocol),
    url: importUrl(requestNode.url),
    auth: requestNode.auth ? importAuth(requestNode.auth, inheritedAuth) : inheritedAuth,
    cookieJar: { enabled: true, storeResponses: true },
    variables: mergeVariables(inheritedVariables, importVariables(requestNode.variable || item.variable)),
    examples: importExamples(item.response),
    scripts: {
      ...scripts
    },
    postman: requestPostmanMetadata(item, requestNode, requestId, options.orderIndex),
    ...protocolFields
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
    } else if (listen === 'beforequery') {
      imported.beforeQuery = appendScript(imported.beforeQuery, source);
    } else if (listen === 'afterresponse') {
      imported.afterResponse = appendScript(imported.afterResponse, source);
    } else if (listen === 'beforeinvoke') {
      imported.beforeInvoke = appendScript(imported.beforeInvoke, source);
    } else if (listen === 'onmessage' || listen === 'onincomingmessage') {
      imported.onMessage = appendScript(imported.onMessage, source);
      imported.onIncomingMessage = appendScript(imported.onIncomingMessage, source);
    } else if (isMockScriptListenName(listen)) {
      imported.mock = appendScript(imported.mock, source);
    }
  }
  return imported;
}

function isMockScriptListenName(listen) {
  return [
    'mock',
    'mockrequest',
    'mock-request',
    'mock:request',
    'mockresponse',
    'mock-response',
    'mock:response'
  ].includes(String(listen || '').toLowerCase());
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
    tests: appendScript(parent.tests, child.tests),
    beforeQuery: appendScript(parent.beforeQuery, child.beforeQuery),
    afterResponse: appendScript(parent.afterResponse, child.afterResponse),
    beforeInvoke: appendScript(parent.beforeInvoke, child.beforeInvoke),
    onMessage: appendScript(parent.onMessage, child.onMessage),
    onIncomingMessage: appendScript(parent.onIncomingMessage, child.onIncomingMessage),
    mock: appendScript(parent.mock, child.mock)
  };
}

function emptyEvents() {
  return {
    preRequest: '',
    tests: '',
    beforeQuery: '',
    afterResponse: '',
    beforeInvoke: '',
    onMessage: '',
    onIncomingMessage: '',
    mock: ''
  };
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
  if (!bodyNode) {
    return;
  }
  request.postmanBody = clonePlainJson(bodyNode);
  if (bodyNode.mode === 'graphql') {
    const graphql = normalizeGraphqlBody(bodyNode.graphql || {});
    request.protocol = request.protocol === 'http' ? 'graphql' : request.protocol;
    request.graphql = {
      ...(request.graphql || {}),
      ...graphql
    };
    request.postmanBody = {
      mode: 'graphql',
      graphql
    };
    request.body = JSON.stringify(graphql);
    request.bodyType = BODY_TYPES.RAW_JSON;
    return;
  }
  if (bodyNode.mode === 'raw') {
    request.body = bodyNode.raw ?? '';
    request.bodyType = bodyNode.options?.raw?.language === 'json' ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
    request.postmanBody = clonePlainJson(bodyNode);
  }
  const fileReferences = postmanFileReferences(bodyNode);
  if (fileReferences.length) {
    request.variables.push(keyValue('postman.fileReferences', JSON.stringify(fileReferences)));
    request.postman = {
      ...(request.postman || {}),
      fileReferences
    };
  }
}

function detectRequestProtocol(item, requestNode) {
  const candidates = [
    item?.protocol,
    item?.requestProtocol,
    item?.type,
    requestNode?.protocol,
    requestNode?.requestProtocol,
    requestNode?.type,
    requestNode?.protocolProfile?.protocol,
    requestNode?.protocolProfileBehavior?.protocol,
    requestNode?.url?.protocol
  ].map((value) => String(value || '').trim().toLowerCase());
  if (requestNode?.body?.mode === 'graphql' || requestNode?.graphql || item?.graphql) {
    return 'graphql';
  }
  if (candidates.some((value) => value === 'graphql')) {
    return 'graphql';
  }
  if (candidates.some((value) => value === 'grpc' || value === 'grpcs') || requestNode?.grpc || item?.grpc || requestNode?.methodPath) {
    return 'grpc';
  }
  if (candidates.some((value) => value === 'websocket' || value === 'ws' || value === 'wss' || value === 'socketio' || value === 'socket.io')) {
    return 'websocket';
  }
  return 'http';
}

function httpMethodForProtocol(method, protocol) {
  if (protocol === 'graphql') {
    return method || 'POST';
  }
  if (protocol === 'grpc' || protocol === 'websocket') {
    return 'POST';
  }
  return method || 'GET';
}

function scriptsForProtocol(events, protocol) {
  if (protocol === 'graphql') {
    return {
      preRequest: appendScript(events.preRequest, events.beforeQuery),
      tests: appendScript(events.tests, events.afterResponse),
      beforeQuery: appendScript(events.preRequest, events.beforeQuery),
      afterResponse: appendScript(events.tests, events.afterResponse),
      beforeInvoke: '',
      onMessage: '',
      onIncomingMessage: '',
      mock: events.mock
    };
  }
  if (protocol === 'grpc') {
    return {
      preRequest: '',
      tests: appendScript(events.tests, events.afterResponse),
      beforeQuery: '',
      afterResponse: appendScript(events.tests, events.afterResponse),
      beforeInvoke: appendScript(events.preRequest, events.beforeInvoke),
      onMessage: events.onMessage,
      onIncomingMessage: events.onIncomingMessage || events.onMessage,
      mock: events.mock
    };
  }
  return {
    preRequest: events.preRequest,
    tests: events.tests,
    beforeQuery: '',
    afterResponse: '',
    beforeInvoke: '',
    onMessage: '',
    onIncomingMessage: '',
    mock: events.mock
  };
}

function importProtocolFields(item, requestNode, protocol) {
  if (protocol === 'graphql') {
    const graphql = normalizeGraphqlBody(requestNode.graphql || item.graphql || requestNode.body?.graphql || {});
    return {
      graphql,
      postmanBody: Object.keys(graphql).length ? { mode: 'graphql', graphql } : {},
      protocolProfile: clonePlainJson(requestNode.protocolProfile || requestNode.protocolProfileBehavior || item.protocolProfile || {})
    };
  }
  if (protocol === 'grpc') {
    const grpc = clonePlainJson(requestNode.grpc || item.grpc || requestNode.protocolProfile || {});
    const methodPath = requestNode.methodPath || grpc.methodPath || grpc.method || grpc.methodName || methodPathFromGrpc(grpc);
    return {
      grpc,
      methodPath,
      metadata: importMetadata(requestNode.metadata || grpc.metadata || requestNode.header),
      messages: importMessages(requestNode.messages || grpc.messages || grpc.message || requestNode.message),
      protocolProfile: clonePlainJson(requestNode.protocolProfile || requestNode.protocolProfileBehavior || item.protocolProfile || {})
    };
  }
  if (protocol === 'websocket') {
    return {
      websocket: clonePlainJson(requestNode.websocket || item.websocket || requestNode.protocolProfile || {}),
      protocolProfile: clonePlainJson(requestNode.protocolProfile || requestNode.protocolProfileBehavior || item.protocolProfile || {})
    };
  }
  return {};
}

function methodPathFromGrpc(grpc = {}) {
  const service = grpc.service || grpc.serviceName || '';
  const method = grpc.rpc || grpc.method || grpc.methodName || '';
  return service && method ? `${service}/${method}` : '';
}

function normalizeGraphqlBody(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return {
    query: value.query == null ? '' : String(value.query),
    variables: normalizeGraphqlVariables(value.variables),
    operationName: value.operationName == null ? '' : String(value.operationName)
  };
}

function normalizeGraphqlVariables(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function importMetadata(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.filter((item) => item?.key || item?.name)
    .map((item) => keyValue(item.key || item.name, item.value ?? '', item.disabled !== true));
}

function importMessages(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list.filter((item) => item != null)
    .map((item) => {
      const source = typeof item === 'object' ? item : { data: item };
      return {
        data: source.data == null ? source.value == null ? '' : String(source.value) : typeof source.data === 'string' ? source.data : JSON.stringify(source.data),
        timestamp: source.timestamp == null ? '' : String(source.timestamp),
        type: source.type == null ? '' : String(source.type),
        name: source.name == null ? '' : String(source.name)
      };
    });
}

function clonePlainJson(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function importExamples(responses) {
  if (!Array.isArray(responses)) {
    return [];
  }
  return responses
    .filter((response) => response && typeof response === 'object')
    .map((response, index) => {
      const headers = Array.isArray(response.header)
        ? response.header.filter((header) => header?.key).map((header) => keyValue(header.key, header.value ?? '', header.disabled !== true))
        : [];
      const body = response.body == null ? '' : String(response.body);
      const responseId = postmanIdForNode(response, 'example', [response.name || response.id || `example-${index}`]);
      return {
        id: responseId.modelId,
        name: response.name || response.originalRequest?.name || 'Example Response',
        statusCode: Number(response.code || response.statusCode || 0),
        headers,
        bodyType: looksLikeJson(body) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT,
        body,
        postman: examplePostmanMetadata(response, responseId)
      };
    });
}

function annotatePackageReferences(collection) {
  const references = collectSandboxPackageReferencesFromCollection(collection);
  if (!references.length) {
    return;
  }
  collection.variables = collection.variables.filter((variable) => variable.key !== 'postman.packageReferences');
  collection.variables.push(keyValue('postman.packageReferences', JSON.stringify(references)));
}

function importCertificates(certificates) {
  if (!Array.isArray(certificates)) {
    return [];
  }
  return certificates
    .filter((certificate) => certificate && typeof certificate === 'object')
    .map((certificate, index) => {
      const certificateId = postmanIdForNode(certificate, 'certificate', [certificate.name || `certificate-${index}`]);
      return {
        id: certificateId.modelId,
        name: certificate.name || 'Postman Client Certificate',
        matches: Array.isArray(certificate.matches) ? certificate.matches.map((value) => String(value || '')).filter(Boolean) : [],
        certPath: certificate.cert?.src || certificate.certPath || '',
        keyPath: certificate.key?.src || certificate.keyPath || '',
        pfxPath: certificate.pfx?.src || certificate.pfxPath || '',
        passphrase: certificate.passphrase || '',
        postman: certificatePostmanMetadata(certificate, certificateId)
      };
    });
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
      certificateId: certificate.id || ''
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
  if (type === 'digest') {
    return {
      type: 'digest',
      username: authParam(authNode.digest, 'username'),
      password: authParam(authNode.digest, 'password'),
      realm: authParam(authNode.digest, 'realm'),
      nonce: authParam(authNode.digest, 'nonce'),
      algorithm: authParam(authNode.digest, 'algorithm') || 'MD5',
      qop: authParam(authNode.digest, 'qop') || 'auth',
      opaque: authParam(authNode.digest, 'opaque')
    };
  }
  if (type === 'hawk') {
    return {
      type: 'hawk',
      authId: authParam(authNode.hawk, 'authId') || authParam(authNode.hawk, 'id'),
      authKey: authParam(authNode.hawk, 'authKey') || authParam(authNode.hawk, 'key'),
      algorithm: authParam(authNode.hawk, 'algorithm') || 'sha256',
      user: authParam(authNode.hawk, 'user'),
      nonce: authParam(authNode.hawk, 'nonce'),
      extraData: authParam(authNode.hawk, 'extraData') || authParam(authNode.hawk, 'ext'),
      app: authParam(authNode.hawk, 'app'),
      delegation: authParam(authNode.hawk, 'delegation') || authParam(authNode.hawk, 'dlg')
    };
  }
  if (type === 'awsv4' || type === 'aws') {
    return {
      type: 'aws',
      accessKey: authParam(authNode.awsv4 || authNode.aws, 'accessKey'),
      secretKey: authParam(authNode.awsv4 || authNode.aws, 'secretKey'),
      region: authParam(authNode.awsv4 || authNode.aws, 'region'),
      service: authParam(authNode.awsv4 || authNode.aws, 'service') || authParam(authNode.awsv4 || authNode.aws, 'serviceName'),
      sessionToken: authParam(authNode.awsv4 || authNode.aws, 'sessionToken'),
      addAuthDataToQuery: String(authParam(authNode.awsv4 || authNode.aws, 'addAuthDataToQuery')).toLowerCase() === 'true'
    };
  }
  if (type === 'oauth1') {
    return {
      type: 'oauth1',
      consumerKey: authParam(authNode.oauth1, 'consumerKey'),
      consumerSecret: authParam(authNode.oauth1, 'consumerSecret'),
      token: authParam(authNode.oauth1, 'token'),
      tokenSecret: authParam(authNode.oauth1, 'tokenSecret'),
      signatureMethod: authParam(authNode.oauth1, 'signatureMethod') || 'HMAC-SHA1',
      timestamp: authParam(authNode.oauth1, 'timestamp'),
      nonce: authParam(authNode.oauth1, 'nonce'),
      version: authParam(authNode.oauth1, 'version') || '1.0',
      realm: authParam(authNode.oauth1, 'realm')
    };
  }
  if (type === 'ntlm') {
    return {
      type: 'ntlm',
      username: authParam(authNode.ntlm, 'username'),
      password: authParam(authNode.ntlm, 'password'),
      domain: authParam(authNode.ntlm, 'domain'),
      workstation: authParam(authNode.ntlm, 'workstation')
    };
  }
  if (type === 'akamai' || type === 'edgegrid' || type === 'akamaiedgegrid') {
    return {
      type: 'akamaiEdgeGrid',
      accessToken: authParam(authNode[type] || authNode.akamai || authNode.edgegrid || authNode.akamaiEdgeGrid, 'accessToken'),
      clientToken: authParam(authNode[type] || authNode.akamai || authNode.edgegrid || authNode.akamaiEdgeGrid, 'clientToken'),
      clientSecret: authParam(authNode[type] || authNode.akamai || authNode.edgegrid || authNode.akamaiEdgeGrid, 'clientSecret'),
      headersToSign: authParam(authNode[type] || authNode.akamai || authNode.edgegrid || authNode.akamaiEdgeGrid, 'headersToSign')
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

function exportPostmanCollection(collection) {
  const metadata = collection?.postman || {};
  const info = {
    ...(clonePostmanObject(metadata.info)),
    name: collection?.name || metadata.info?.name || 'PostMeter Collection',
    schema: metadata.info?.schema || POSTMAN_COLLECTION_SCHEMA
  };
  const collectionId = postmanEntityId(collection, 'collection');
  if (collectionId) {
    info._postman_id = collectionId;
  }
  const document = {
    info,
    item: exportPostmanItems(collection)
  };
  if (collection?.description || metadata.info?.description) {
    document.info.description = metadata.info?.description || collection.description;
  }
  const events = exportPostmanEvents(collection);
  if (events.length) {
    document.event = events;
  }
  const variables = exportPostmanVariables(collection?.variables, metadata.variables);
  if (variables.length) {
    document.variable = variables;
  }
  if (metadata.auth && Object.keys(metadata.auth).length) {
    document.auth = clonePostmanObject(metadata.auth);
  }
  const certificates = exportPostmanCertificates(collection?.certificates, metadata.certificates);
  if (certificates.length) {
    document.certificate = certificates;
  }
  assignPostmanExtensions(document, metadata.bindings);
  return document;
}

function collectionPostmanMetadata(document) {
  const ids = postmanIdForNode(document.info || document, 'collection', [document.info?.name || 'collection']);
  return compactObject({
    schema: 'postman-collection-v2.1',
    ids,
    info: clonePostmanObject(document.info),
    events: importPostmanEvents(document.event),
    variables: clonePostmanArray(document.variable),
    auth: clonePostmanObject(document.auth),
    certificates: clonePostmanArray(document.certificate),
    itemOrder: postmanItemOrder(document.item),
    bindings: collectPostmanBindings(document)
  });
}

function folderPostmanMetadata(item, ids, orderIndex) {
  return compactObject({
    schema: 'postman-folder-v2.1',
    ids,
    orderIndex: Number.isFinite(Number(orderIndex)) ? Number(orderIndex) : undefined,
    description: clonePostmanJson(item?.description),
    events: importPostmanEvents(item?.event),
    variables: clonePostmanArray(item?.variable),
    auth: clonePostmanObject(item?.auth),
    itemOrder: postmanItemOrder(item?.item),
    protocolProfile: clonePostmanObject(item?.protocolProfile || item?.protocolProfileBehavior),
    bindings: collectPostmanBindings(item)
  });
}

function requestPostmanMetadata(item, requestNode, ids, orderIndex) {
  return compactObject({
    schema: 'postman-request-v2.1',
    ids,
    orderIndex: Number.isFinite(Number(orderIndex)) ? Number(orderIndex) : undefined,
    description: clonePostmanJson(item?.description || requestNode?.description),
    events: importPostmanEvents(item?.event),
    variables: clonePostmanArray(requestNode?.variable || item?.variable),
    auth: clonePostmanObject(requestNode?.auth || item?.auth),
    request: compactObject({
      method: requestNode?.method,
      url: clonePostmanJson(requestNode?.url),
      header: clonePostmanArray(requestNode?.header),
      cookie: clonePostmanArray(requestNode?.cookie),
      body: clonePostmanObject(requestNode?.body),
      variable: clonePostmanArray(requestNode?.variable),
      auth: clonePostmanObject(requestNode?.auth),
      protocolProfile: clonePostmanObject(requestNode?.protocolProfile || requestNode?.protocolProfileBehavior),
      graphql: clonePostmanObject(requestNode?.graphql || item?.graphql),
      grpc: clonePostmanObject(requestNode?.grpc || item?.grpc),
      websocket: clonePostmanObject(requestNode?.websocket || item?.websocket),
      methodPath: requestNode?.methodPath
    }),
    protocol: compactObject({
      protocol: item?.protocol || requestNode?.protocol,
      requestProtocol: item?.requestProtocol || requestNode?.requestProtocol,
      type: item?.type || requestNode?.type,
      protocolProfile: clonePostmanObject(item?.protocolProfile || requestNode?.protocolProfile),
      protocolProfileBehavior: clonePostmanObject(item?.protocolProfileBehavior || requestNode?.protocolProfileBehavior),
      graphql: clonePostmanObject(item?.graphql || requestNode?.graphql),
      grpc: clonePostmanObject(item?.grpc || requestNode?.grpc),
      websocket: clonePostmanObject(item?.websocket || requestNode?.websocket)
    }),
    bindings: collectPostmanBindings(item, requestNode)
  });
}

function examplePostmanMetadata(response, ids) {
  return compactObject({
    schema: 'postman-response-v2.1',
    ids,
    response: clonePostmanObject(response)
  });
}

function certificatePostmanMetadata(certificate, ids) {
  return compactObject({
    schema: 'postman-certificate-v2.1',
    ids,
    certificate: clonePostmanObject(certificate)
  });
}

function importPostmanEvents(events) {
  if (!Array.isArray(events)) {
    return [];
  }
  return events
    .filter((event) => event && typeof event === 'object')
    .map((event) => clonePostmanObject(event))
    .filter((event) => Object.keys(event).length);
}

function postmanItemOrder(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item, index) => {
    const ids = postmanIdForNode(item, item?.request ? 'request' : 'folder', [item?.name || String(index)]);
    return compactObject({
      kind: item?.request ? 'request' : 'folder',
      id: ids.original || ids.deterministic,
      uid: ids.uid,
      postmanId: ids._postman_id,
      deterministic: ids.deterministic,
      name: item?.name == null ? '' : String(item.name),
      index
    });
  });
}

function postmanIdForNode(node, kind, pathSegments = []) {
  const id = stringValue(node?.id);
  const postmanId = stringValue(node?._postman_id);
  const uid = stringValue(node?.uid);
  const original = id || postmanId || uid;
  const deterministic = stablePostmanId(kind, pathSegments, original);
  return compactObject({
    original,
    id,
    _postman_id: postmanId,
    uid,
    deterministic,
    modelId: safeModelId(original) || deterministic
  });
}

function stablePostmanId(kind, pathSegments = [], original = '') {
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify({ kind, path: pathSegments.map((item) => String(item || '')), original: String(original || '') }))
    .digest('hex')
    .slice(0, 32);
  return `postman-${kind}-${hash}`;
}

function safeModelId(value) {
  const text = String(value || '').trim();
  return text && text.length <= 256 ? text : '';
}

function postmanFileReferences(bodyNode) {
  const references = [];
  if (!bodyNode || typeof bodyNode !== 'object') {
    return references;
  }
  if (bodyNode.file?.src) {
    references.push({ mode: 'file', src: String(bodyNode.file.src) });
  }
  if (bodyNode.binary?.src) {
    references.push({ mode: 'binary', src: String(bodyNode.binary.src) });
  }
  for (const part of Array.isArray(bodyNode.formdata) ? bodyNode.formdata : []) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const values = Array.isArray(part.src) ? part.src : part.src ? [part.src] : [];
    for (const src of values) {
      references.push(compactObject({
        mode: 'formdata',
        key: part.key == null ? '' : String(part.key),
        src: String(src),
        contentType: part.contentType == null ? '' : String(part.contentType)
      }));
    }
  }
  return references;
}

function collectPostmanBindings(...sources) {
  const bindingKeys = [
    'assets',
    'cookieAllowlist',
    'cookieDomainWhitelist',
    'cookieWhitelist',
    'cookieWhitelistDomains',
    'cookies',
    'dependencies',
    'mock',
    'mocks',
    'mockState',
    'packageReferences',
    'packages',
    'protocolProfile',
    'protocolProfileBehavior',
    'state',
    'vault',
    'vaultAccess',
    'visualizer',
    'visualizerAssets'
  ];
  const bindings = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }
    for (const key of bindingKeys) {
      if (Object.hasOwn(source, key)) {
        bindings[key] = clonePostmanJson(source[key]);
      }
    }
  }
  return bindings;
}

function exportPostmanItems(container) {
  return orderedPostmanChildren(container).map((entry) => {
    if (entry.kind === 'folder') {
      return exportPostmanFolder(entry.value);
    }
    return exportPostmanRequestItem(entry.value);
  });
}

function orderedPostmanChildren(container) {
  const requests = (container?.requests || []).map((value, index) => ({ kind: 'request', value, index }));
  const folders = (container?.folders || []).map((value, index) => ({ kind: 'folder', value, index }));
  const all = requests.concat(folders);
  const order = Array.isArray(container?.postman?.itemOrder) ? container.postman.itemOrder : [];
  if (!order.length) {
    return all;
  }
  const used = new Set();
  const ordered = [];
  for (const item of order) {
    const match = all.find((entry) => !used.has(entry.value) && postmanOrderMatches(entry, item));
    if (match) {
      ordered.push(match);
      used.add(match.value);
    }
  }
  for (const entry of all) {
    if (!used.has(entry.value)) {
      ordered.push(entry);
    }
  }
  return ordered;
}

function postmanOrderMatches(entry, item) {
  if (item?.kind && item.kind !== entry.kind) {
    return false;
  }
  if (Number.isFinite(Number(item?.index)) && Number(entry.value?.postman?.orderIndex) === Number(item.index)) {
    return true;
  }
  const aliases = [
    entry.value?.postman?.ids?.original,
    entry.value?.postman?.ids?.id,
    entry.value?.postman?.ids?.uid,
    entry.value?.postman?.ids?._postman_id,
    entry.value?.postman?.ids?.deterministic,
    entry.value?.id,
    entry.value?.name
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const targets = [item?.id, item?.uid, item?.postmanId, item?.deterministic, item?.name]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return targets.some((target) => aliases.includes(target));
}

function exportPostmanFolder(folder) {
  const metadata = folder?.postman || {};
  const exported = compactObject({
    id: postmanEntityId(folder, 'folder'),
    name: folder?.name || 'Folder',
    description: metadata.description,
    event: exportPostmanEvents(folder),
    variable: exportPostmanVariables([], metadata.variables),
    auth: clonePostmanObject(metadata.auth),
    item: exportPostmanItems(folder)
  });
  assignPostmanExtensions(exported, metadata.bindings);
  return exported;
}

function exportPostmanRequestItem(request) {
  const metadata = request?.postman || {};
  const exported = compactObject({
    id: postmanEntityId(request, 'request'),
    name: request?.name || 'Request',
    description: metadata.description,
    event: exportPostmanEvents(request),
    request: exportPostmanRequest(request),
    response: exportPostmanExamples(request?.examples)
  });
  assignPostmanExtensions(exported, metadata.bindings);
  return exported;
}

function exportPostmanRequest(request) {
  const metadata = request?.postman || {};
  const raw = clonePostmanObject(metadata.request);
  const exported = {
    ...raw,
    method: request?.method || raw.method || 'GET',
    url: exportPostmanUrl(request, raw.url),
    header: exportPostmanPairs(request?.headers, raw.header),
    body: exportPostmanBody(request, raw.body),
    auth: exportPostmanRequestAuth(request, raw.auth)
  };
  const variables = exportPostmanVariables(request?.variables, metadata.variables);
  if (variables.length) {
    exported.variable = variables;
  }
  if (request?.protocol === 'graphql' || metadata.protocol?.graphql) {
    exported.graphql = Object.keys(request?.graphql || {}).length ? clonePostmanObject(request.graphql) : clonePostmanObject(metadata.protocol?.graphql);
  }
  if (request?.protocol === 'grpc' || metadata.protocol?.grpc) {
    exported.grpc = Object.keys(request?.grpc || {}).length ? clonePostmanObject(request.grpc) : clonePostmanObject(metadata.protocol?.grpc);
    if (request?.methodPath || raw.methodPath) {
      exported.methodPath = request?.methodPath || raw.methodPath;
    }
    if (request?.metadata?.length) {
      exported.metadata = exportPostmanPairs(request.metadata, raw.metadata);
    }
    if (request?.messages?.length) {
      exported.messages = request.messages.map((message) => clonePostmanJson(message));
    }
  }
  if (request?.protocol === 'websocket' || metadata.protocol?.websocket) {
    exported.websocket = Object.keys(request?.websocket || {}).length ? clonePostmanObject(request.websocket) : clonePostmanObject(metadata.protocol?.websocket);
  }
  const protocolProfile = Object.keys(request?.protocolProfile || {}).length
    ? clonePostmanObject(request.protocolProfile)
    : clonePostmanObject(raw.protocolProfile || raw.protocolProfileBehavior || metadata.protocol?.protocolProfile || metadata.protocol?.protocolProfileBehavior);
  if (Object.keys(protocolProfile).length) {
    exported.protocolProfileBehavior = protocolProfile;
  }
  assignPostmanExtensions(exported, metadata.bindings);
  return removeEmptyPostmanFields(exported);
}

function exportPostmanUrl(request, rawUrl) {
  if (rawUrl && typeof rawUrl === 'object') {
    const url = clonePostmanJson(rawUrl);
    if (typeof request?.url === 'string' && request.url) {
      url.raw = buildRawUrlWithQuery(request);
    }
    if ((request?.queryParams || []).length) {
      url.query = exportPostmanPairs(request.queryParams, rawUrl.query);
    }
    return url;
  }
  return buildRawUrlWithQuery(request);
}

function buildRawUrlWithQuery(request) {
  const url = request?.url || '';
  const queryParams = (request?.queryParams || []).filter((pair) => pair?.key);
  if (!queryParams.length) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${queryParams.map((pair) => `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value ?? '')}`).join('&')}`;
}

function exportPostmanBody(request, rawBody) {
  if (request?.postmanBody && Object.keys(request.postmanBody).length) {
    return clonePostmanObject(request.postmanBody);
  }
  if (rawBody && typeof rawBody === 'object' && Object.keys(rawBody).length) {
    return clonePostmanObject(rawBody);
  }
  if (!request?.body) {
    return undefined;
  }
  return {
    mode: 'raw',
    raw: String(request.body || ''),
    options: {
      raw: {
        language: request.bodyType === BODY_TYPES.RAW_JSON ? 'json' : 'text'
      }
    }
  };
}

function exportPostmanRequestAuth(request, rawAuth) {
  if (rawAuth && typeof rawAuth === 'object' && Object.keys(rawAuth).length) {
    return clonePostmanObject(rawAuth);
  }
  return exportPostmanAuthModel(request?.auth);
}

function exportPostmanAuthModel(auth) {
  if (!auth || auth.type === 'none') {
    return undefined;
  }
  if (auth.type === 'bearer') {
    return { type: 'bearer', bearer: [{ key: 'token', value: auth.token || '', type: 'string' }] };
  }
  if (auth.type === 'basic') {
    return {
      type: 'basic',
      basic: [
        { key: 'username', value: auth.username || '', type: 'string' },
        { key: 'password', value: auth.password || '', type: 'string' }
      ]
    };
  }
  if (auth.type === 'apiKey') {
    return {
      type: 'apikey',
      apikey: [
        { key: 'in', value: auth.location === 'query' ? 'query' : 'header', type: 'string' },
        { key: 'key', value: auth.key || '', type: 'string' },
        { key: 'value', value: auth.value || '', type: 'string' }
      ]
    };
  }
  if (auth.type === 'oauth2') {
    return {
      type: 'oauth2',
      oauth2: [
        { key: 'tokenType', value: auth.tokenType || 'Bearer', type: 'string' },
        { key: 'accessToken', value: auth.accessToken || '', type: 'string' },
        { key: 'refreshToken', value: auth.refreshToken || '', type: 'string' },
        { key: 'authUrl', value: auth.authorizationUrl || '', type: 'string' },
        { key: 'accessTokenUrl', value: auth.tokenUrl || '', type: 'string' },
        { key: 'clientId', value: auth.clientId || '', type: 'string' },
        { key: 'clientSecret', value: auth.clientSecret || '', type: 'string' },
        { key: 'scope', value: auth.scopes || '', type: 'string' },
        { key: 'grant_type', value: auth.grantType === 'clientCredentials' ? 'client_credentials' : auth.grantType === 'deviceCode' ? 'device_code' : 'authorization_code', type: 'string' }
      ]
    };
  }
  if (auth.type === 'digest') {
    return {
      type: 'digest',
      digest: [
        { key: 'username', value: auth.username || '', type: 'string' },
        { key: 'password', value: auth.password || '', type: 'string' },
        { key: 'realm', value: auth.realm || '', type: 'string' },
        { key: 'nonce', value: auth.nonce || '', type: 'string' },
        { key: 'algorithm', value: auth.algorithm || 'MD5', type: 'string' },
        { key: 'qop', value: auth.qop || 'auth', type: 'string' },
        { key: 'opaque', value: auth.opaque || '', type: 'string' }
      ]
    };
  }
  if (auth.type === 'hawk') {
    return {
      type: 'hawk',
      hawk: [
        { key: 'authId', value: auth.authId || '', type: 'string' },
        { key: 'authKey', value: auth.authKey || '', type: 'string' },
        { key: 'algorithm', value: auth.algorithm || 'sha256', type: 'string' },
        { key: 'user', value: auth.user || '', type: 'string' },
        { key: 'nonce', value: auth.nonce || '', type: 'string' },
        { key: 'extraData', value: auth.extraData || '', type: 'string' },
        { key: 'app', value: auth.app || '', type: 'string' },
        { key: 'delegation', value: auth.delegation || '', type: 'string' }
      ]
    };
  }
  if (auth.type === 'aws') {
    return {
      type: 'awsv4',
      awsv4: [
        { key: 'accessKey', value: auth.accessKey || '', type: 'string' },
        { key: 'secretKey', value: auth.secretKey || '', type: 'string' },
        { key: 'region', value: auth.region || '', type: 'string' },
        { key: 'service', value: auth.service || '', type: 'string' },
        { key: 'sessionToken', value: auth.sessionToken || '', type: 'string' },
        { key: 'addAuthDataToQuery', value: auth.addAuthDataToQuery === true ? 'true' : 'false', type: 'boolean' }
      ]
    };
  }
  if (auth.type === 'oauth1') {
    return {
      type: 'oauth1',
      oauth1: [
        { key: 'consumerKey', value: auth.consumerKey || '', type: 'string' },
        { key: 'consumerSecret', value: auth.consumerSecret || '', type: 'string' },
        { key: 'token', value: auth.token || '', type: 'string' },
        { key: 'tokenSecret', value: auth.tokenSecret || '', type: 'string' },
        { key: 'signatureMethod', value: auth.signatureMethod || 'HMAC-SHA1', type: 'string' },
        { key: 'timestamp', value: auth.timestamp || '', type: 'string' },
        { key: 'nonce', value: auth.nonce || '', type: 'string' },
        { key: 'version', value: auth.version || '1.0', type: 'string' },
        { key: 'realm', value: auth.realm || '', type: 'string' }
      ]
    };
  }
  if (auth.type === 'ntlm') {
    return {
      type: 'ntlm',
      ntlm: [
        { key: 'username', value: auth.username || '', type: 'string' },
        { key: 'password', value: auth.password || '', type: 'string' },
        { key: 'domain', value: auth.domain || '', type: 'string' },
        { key: 'workstation', value: auth.workstation || '', type: 'string' }
      ]
    };
  }
  if (auth.type === 'akamaiEdgeGrid') {
    return {
      type: 'akamaiEdgeGrid',
      akamaiEdgeGrid: [
        { key: 'accessToken', value: auth.accessToken || '', type: 'string' },
        { key: 'clientToken', value: auth.clientToken || '', type: 'string' },
        { key: 'clientSecret', value: auth.clientSecret || '', type: 'string' },
        { key: 'headersToSign', value: auth.headersToSign || '', type: 'string' }
      ]
    };
  }
  return undefined;
}

function exportPostmanEvents(entity) {
  if (Array.isArray(entity?.postman?.events) && entity.postman.events.length) {
    return entity.postman.events.map((event) => normalizeExportedEvent(event)).filter(Boolean);
  }
  const scripts = entity?.scripts || {};
  const events = [];
  appendExportedScript(events, 'prerequest', scripts.preRequest);
  appendExportedScript(events, 'test', scripts.tests);
  appendExportedScript(events, 'beforeQuery', scripts.beforeQuery);
  appendExportedScript(events, 'afterResponse', scripts.afterResponse);
  appendExportedScript(events, 'beforeInvoke', scripts.beforeInvoke);
  appendExportedScript(events, 'onIncomingMessage', scripts.onIncomingMessage || scripts.onMessage);
  appendExportedScript(events, 'mock', scripts.mock);
  return events;
}

function normalizeExportedEvent(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }
  const cloned = clonePostmanObject(event);
  if (!cloned.listen) {
    return null;
  }
  const source = scriptSource(cloned.script);
  if (!source.trim()) {
    return null;
  }
  cloned.script ||= {};
  cloned.script.type ||= 'text/javascript';
  if (Array.isArray(cloned.script.exec)) {
    cloned.script.exec = cloned.script.exec.map((line) => String(line));
  } else {
    cloned.script.exec = splitScriptLines(source);
  }
  return cloned;
}

function appendExportedScript(events, listen, source) {
  if (!String(source || '').trim()) {
    return;
  }
  events.push({
    listen,
    script: {
      type: 'text/javascript',
      exec: splitScriptLines(source)
    }
  });
}

function splitScriptLines(source) {
  return String(source || '').split(/\r?\n/);
}

function exportPostmanPairs(pairs = [], rawPairs = []) {
  const rawByKey = new Map((Array.isArray(rawPairs) ? rawPairs : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => [String(item.key || item.name || ''), clonePostmanObject(item)]));
  return (pairs || [])
    .filter((pair) => pair?.key && !INTERNAL_POSTMAN_VARIABLE_KEYS.has(pair.key))
    .map((pair) => {
      const raw = rawByKey.get(String(pair.key)) || {};
      return {
        ...raw,
        key: String(pair.key),
        value: pair.value == null ? '' : String(pair.value),
        disabled: pair.enabled === false
      };
    });
}

function exportPostmanVariables(pairs = [], rawVariables = []) {
  const exported = exportPostmanPairs(pairs, rawVariables);
  const existing = new Set(exported.map((item) => item.key));
  for (const raw of Array.isArray(rawVariables) ? rawVariables : []) {
    if (!raw?.key || existing.has(String(raw.key))) {
      continue;
    }
    exported.push(clonePostmanObject(raw));
  }
  return exported;
}

function exportPostmanExamples(examples = []) {
  return (examples || []).map((example) => {
    const raw = clonePostmanObject(example?.postman?.response);
    const exported = {
      ...raw,
      id: postmanEntityId(example, 'example') || undefined,
      name: example?.name || raw.name || 'Example Response',
      code: Number(example?.statusCode || raw.code || 0),
      status: raw.status || String(example?.statusCode || raw.code || ''),
      header: exportPostmanPairs(example?.headers, raw.header),
      body: example?.body == null ? raw.body || '' : String(example.body)
    };
    return removeEmptyPostmanFields(exported);
  });
}

function exportPostmanCertificates(certificates = [], rawCertificates = []) {
  const rawByName = new Map((Array.isArray(rawCertificates) ? rawCertificates : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => [String(item.name || ''), clonePostmanObject(item)]));
  return (certificates || []).map((certificate) => {
    const raw = clonePostmanObject(certificate?.postman?.certificate || rawByName.get(String(certificate?.name || '')));
    const exported = {
      ...raw,
      id: postmanEntityId(certificate, 'certificate') || raw.id,
      name: certificate?.name || raw.name || 'Postman Client Certificate',
      matches: Array.isArray(certificate?.matches) ? certificate.matches.slice() : raw.matches || []
    };
    if (certificate?.certPath) {
      exported.cert = { ...(raw.cert || {}), src: certificate.certPath };
    }
    if (certificate?.keyPath) {
      exported.key = { ...(raw.key || {}), src: certificate.keyPath };
    }
    if (certificate?.pfxPath) {
      exported.pfx = { ...(raw.pfx || {}), src: certificate.pfxPath };
    }
    if (certificate?.passphrase) {
      exported.passphrase = certificate.passphrase;
    }
    return removeEmptyPostmanFields(exported);
  });
}

function postmanEntityId(entity, kind) {
  return String(
    entity?.postman?.ids?.original
    || entity?.postman?.ids?.id
    || entity?.postman?.ids?._postman_id
    || entity?.postman?.ids?.uid
    || entity?.postman?.ids?.deterministic
    || entity?.id
    || ''
  ).trim() || stablePostmanId(kind, [entity?.name || kind], '');
}

function assignPostmanExtensions(target, bindings) {
  if (!bindings || typeof bindings !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(bindings)) {
    if (!Object.hasOwn(target, key)) {
      target[key] = clonePostmanJson(value);
    }
  }
}

function removeEmptyPostmanFields(value) {
  for (const [key, item] of Object.entries(value)) {
    if (item == null) {
      delete value[key];
    } else if (Array.isArray(item) && !item.length) {
      delete value[key];
    } else if (typeof item === 'object' && !Array.isArray(item) && !Object.keys(item).length) {
      delete value[key];
    }
  }
  return value;
}

function compactObject(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (item == null || item === '') {
      continue;
    }
    if (Array.isArray(item) && !item.length) {
      continue;
    }
    if (typeof item === 'object' && !Array.isArray(item) && !Object.keys(item).length) {
      continue;
    }
    result[key] = item;
  }
  return result;
}

function postmanDescription(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && typeof value.content === 'string') {
    return value.content;
  }
  return '';
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}

function clonePostmanObject(value) {
  const cloned = clonePostmanJson(value);
  return cloned && typeof cloned === 'object' && !Array.isArray(cloned) ? cloned : {};
}

function clonePostmanArray(value) {
  const cloned = clonePostmanJson(value);
  return Array.isArray(cloned) ? cloned : [];
}

function clonePostmanJson(value) {
  if (value == null) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

module.exports = {
  exportPostmanCollection,
  importPostmanCollection,
  importAuth,
  looksLikePostmanCollection
};
