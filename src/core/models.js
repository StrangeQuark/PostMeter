const crypto = require('node:crypto');

const CURRENT_SCHEMA_VERSION = 4;
const MIN_SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_TYPES = {
  NONE: 'NONE',
  RAW_JSON: 'RAW_JSON',
  RAW_TEXT: 'RAW_TEXT'
};
const AUTH_TYPES = new Set(['none', 'bearer', 'basic', 'apiKey', 'cookie', 'oauth2', 'clientCertificate']);

function newId() {
  return crypto.randomUUID();
}

function keyValue(key = '', value = '', enabled = true, secret = false) {
  return { enabled, key: key ?? '', value: value ?? '', secret: secret === true };
}

function requestModel({ id, name, method, url, queryParams, headers, bodyType, body, auth } = {}) {
  const normalizedMethod = normalizeMethod(method);
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Request'),
    method: normalizedMethod,
    url: typeof url === 'string' ? url.trim() : '',
    queryParams: normalizePairs(queryParams),
    headers: normalizePairs(headers),
    bodyType: Object.values(BODY_TYPES).includes(bodyType) ? bodyType : BODY_TYPES.NONE,
    body: body ?? '',
    auth: normalizeAuth(auth)
  };
}

function folderModel({ id, name, requests, folders } = {}) {
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Folder'),
    requests: Array.isArray(requests) ? requests.map(requestModel) : [],
    folders: Array.isArray(folders) ? folders.map(folderModel) : []
  };
}

function collectionModel({ id, name, description, requests, folders } = {}) {
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Collection'),
    description: description ?? '',
    requests: Array.isArray(requests) ? requests.map(requestModel) : [],
    folders: Array.isArray(folders) ? folders.map(folderModel) : []
  };
}

function environmentModel({ id, name, variables } = {}) {
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Environment'),
    variables: normalizePairs(variables)
  };
}

function historyEntry({ timestamp, method, url, statusCode, durationMillis } = {}) {
  return {
    timestamp: timestamp || new Date().toISOString(),
    method: normalizeMethod(method),
    url: url ?? '',
    statusCode: Number.isFinite(statusCode) ? statusCode : 0,
    durationMillis: Number.isFinite(durationMillis) ? durationMillis : 0
  };
}

function workspaceModel({ schemaVersion, collections, environments, history } = {}) {
  return {
    schemaVersion: schemaVersion || CURRENT_SCHEMA_VERSION,
    collections: Array.isArray(collections) ? collections.map(collectionModel) : [],
    environments: Array.isArray(environments) ? environments.map(environmentModel) : [],
    history: Array.isArray(history) ? history.map(historyEntry) : []
  };
}

function normalizePairs(pairs) {
  if (!Array.isArray(pairs)) {
    return [];
  }
  return pairs.map((pair) => keyValue(pair.key, pair.value, pair.enabled !== false, pair.secret === true));
}

function normalizeAuth(auth) {
  if (!auth || typeof auth !== 'object' || !AUTH_TYPES.has(auth.type)) {
    return { type: 'none' };
  }
  return { ...auth };
}

function normalizeMethod(method) {
  const candidate = typeof method === 'string' ? method.trim().toUpperCase() : 'GET';
  return SUPPORTED_METHODS.has(candidate) ? candidate : 'GET';
}

function normalizeName(name, fallback) {
  return typeof name === 'string' && name.trim() ? name.trim() : fallback;
}

function defaultWorkspace() {
  return workspaceModel({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: [],
    environments: [],
    history: []
  });
}

function walkRequests(collection, visitor) {
  for (const request of collection.requests || []) {
    visitor(request, collection);
  }
  for (const folder of collection.folders || []) {
    walkFolderRequests(folder, collection, visitor);
  }
}

function walkFolderRequests(folder, collection, visitor) {
  for (const request of folder.requests || []) {
    visitor(request, collection, folder);
  }
  for (const child of folder.folders || []) {
    walkFolderRequests(child, collection, visitor);
  }
}

module.exports = {
  BODY_METHODS,
  BODY_TYPES,
  CURRENT_SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SUPPORTED_METHODS,
  collectionModel,
  defaultWorkspace,
  environmentModel,
  folderModel,
  historyEntry,
  keyValue,
  newId,
  requestModel,
  walkRequests,
  workspaceModel
};
