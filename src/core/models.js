const crypto = require('node:crypto');
const {
  BODY_METHODS: BODY_METHOD_VALUES,
  BODY_TYPE_VALUES,
  HTTP_METHODS,
  normalizeSchemaEnumValue
} = require('./payloadSchemas');
const { normalizePersistedAuth } = require('./authModel');
const { normalizeCookies: normalizeCookieCollection } = require('./cookieModel');
const {
  normalizeLoadPolicy: normalizeLoadTestPolicy,
  normalizeRequestLoadPolicy: normalizeRequestLoadTestPolicy
} = require('./loadPolicyModel');

const CURRENT_SCHEMA_VERSION = 11;
const MIN_SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_METHODS = new Set(HTTP_METHODS);
const BODY_METHODS = new Set(BODY_METHOD_VALUES);
const BODY_TYPES = Object.freeze(Object.fromEntries(BODY_TYPE_VALUES.map((type) => [type, type])));
const DEFAULT_REQUEST_BODY_TYPE = 'NONE';
const DEFAULT_EXAMPLE_BODY_TYPE = 'RAW_TEXT';

function newId() {
  return crypto.randomUUID();
}

function keyValue(key = '', value = '', enabled = true) {
  return { enabled, key: key ?? '', value: value ?? '' };
}

function requestModel({ id, name, method, url, queryParams, headers, bodyType, body, auth, assertions, scripts, variables, examples, cookieJar, loadTestPolicy } = {}) {
  const normalizedMethod = normalizeMethod(method);
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Request'),
    method: normalizedMethod,
    url: typeof url === 'string' ? url.trim() : '',
    queryParams: normalizePairs(queryParams),
    headers: normalizePairs(headers),
    bodyType: normalizeSchemaEnumValue('bodyTypes', bodyType, DEFAULT_REQUEST_BODY_TYPE),
    body: body ?? '',
    auth: normalizePersistedAuth(auth),
    assertions: normalizeAssertions(assertions),
    scripts: normalizeScripts(scripts),
    variables: normalizePairs(variables),
    examples: normalizeExamples(examples),
    cookieJar: normalizeRequestCookieJar(cookieJar),
    loadTestPolicy: normalizeRequestLoadTestPolicy(loadTestPolicy)
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

function collectionModel({ id, name, description, variables, certificates, requests, folders } = {}) {
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Collection'),
    description: description ?? '',
    variables: normalizePairs(variables),
    certificates: normalizeCertificates(certificates),
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

function workspaceModel({ schemaVersion, collections, environments, globals, history, settings, cookies } = {}) {
  return {
    schemaVersion: schemaVersion || CURRENT_SCHEMA_VERSION,
    settings: normalizeSettings(settings),
    collections: Array.isArray(collections) ? collections.map(collectionModel) : [],
    environments: Array.isArray(environments) ? environments.map(environmentModel) : [],
    globals: normalizePairs(globals),
    cookies: normalizeCookies(cookies),
    history: Array.isArray(history) ? history.map(historyEntry) : []
  };
}

function normalizeSettings(settings) {
  return {
    appearance: {
      theme: normalizeTheme(settings?.appearance?.theme)
    },
    sandbox: {
      trustedCapabilities: {
        sendRequest: settings?.sandbox?.trustedCapabilities?.sendRequest !== false,
        cookies: settings?.sandbox?.trustedCapabilities?.cookies !== false,
        vault: settings?.sandbox?.trustedCapabilities?.vault === true
      }
    },
    updates: {
      includePrereleases: settings?.updates?.includePrereleases === true
    }
  };
}

function normalizeTheme(value) {
  return normalizeSchemaEnumValue('themeValues', value, 'system', { trim: true });
}

function normalizePairs(pairs) {
  if (!Array.isArray(pairs)) {
    return [];
  }
  return pairs.map((pair) => keyValue(pair.key, pair.value, pair.enabled !== false));
}

function normalizeAssertions(assertions) {
  if (!Array.isArray(assertions)) {
    return [];
  }
  return assertions
    .filter((assertion) => assertion && typeof assertion === 'object')
    .map((assertion) => ({
      enabled: assertion.enabled !== false,
      type: typeof assertion.type === 'string' ? assertion.type : 'statusCode',
      name: assertion.name ?? '',
      path: assertion.path ?? '',
      operator: assertion.operator ?? 'equals',
      expected: assertion.expected ?? '',
      variableName: assertion.variableName ?? ''
    }));
}

function normalizeScripts(scripts) {
  if (!scripts || typeof scripts !== 'object') {
    return { preRequest: '', tests: '' };
  }
  return {
    preRequest: typeof scripts.preRequest === 'string' ? scripts.preRequest : '',
    tests: typeof scripts.tests === 'string' ? scripts.tests : ''
  };
}

function normalizeExamples(examples) {
  if (!Array.isArray(examples)) {
    return [];
  }
  return examples
    .filter((example) => example && typeof example === 'object')
    .map((example) => ({
      id: example.id || newId(),
      name: normalizeName(example.name, 'Example Response'),
      statusCode: Number.isFinite(Number(example.statusCode)) ? Number(example.statusCode) : 0,
      headers: normalizePairs(example.headers),
      bodyType: normalizeSchemaEnumValue('bodyTypes', example.bodyType, DEFAULT_EXAMPLE_BODY_TYPE),
      body: example.body == null ? '' : String(example.body)
    }));
}

function normalizeRequestCookieJar(cookieJar) {
  return {
    enabled: cookieJar?.enabled === true,
    storeResponses: cookieJar?.storeResponses !== false
  };
}

function normalizeCookies(cookies) {
  return normalizeCookieCollection(cookies, { createId: newId });
}

function normalizeCertificates(certificates) {
  if (!Array.isArray(certificates)) {
    return [];
  }
  return certificates
    .filter((certificate) => certificate && typeof certificate === 'object')
    .map((certificate) => ({
      id: certificate.id || newId(),
      name: normalizeName(certificate.name, 'Client Certificate'),
      matches: Array.isArray(certificate.matches) ? certificate.matches.map((value) => String(value || '')).filter(Boolean) : [],
      certPath: certificate.certPath == null ? '' : String(certificate.certPath),
      keyPath: certificate.keyPath == null ? '' : String(certificate.keyPath),
      pfxPath: certificate.pfxPath == null ? '' : String(certificate.pfxPath),
      caPath: certificate.caPath == null ? '' : String(certificate.caPath),
      passphrase: certificate.passphrase == null ? '' : String(certificate.passphrase)
    }));
}

function normalizeMethod(method) {
  return normalizeSchemaEnumValue('httpMethods', method, 'GET', {
    trim: true,
    transform: (value) => value.toUpperCase()
  });
}

function normalizeName(name, fallback) {
  return typeof name === 'string' && name.trim() ? name.trim() : fallback;
}

function defaultWorkspace() {
  return workspaceModel({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: normalizeSettings(),
    collections: [],
    environments: [],
    globals: [],
    cookies: [],
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
  normalizeCookies,
  normalizeLoadTestPolicy,
  normalizeRequestCookieJar,
  normalizeRequestLoadTestPolicy,
  normalizeSettings,
  requestModel,
  walkRequests,
  workspaceModel
};
