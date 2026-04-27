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
const POSTMAN_METADATA_MAX_BYTES = 10 * 1024 * 1024;

function newId() {
  return crypto.randomUUID();
}

function keyValue(key = '', value = '', enabled = true) {
  return { enabled, key: key ?? '', value: value ?? '' };
}

function requestModel({
  id,
  name,
  method,
  url,
  queryParams,
  headers,
  bodyType,
  body,
  auth,
  assertions,
  scripts,
  variables,
  examples,
  cookieJar,
  loadTestPolicy,
  protocol,
  protocolProfile,
  postmanBody,
  graphql,
  grpc,
  websocket,
  metadata,
  postman,
  messages,
  methodPath
} = {}) {
  const normalizedMethod = normalizeMethod(method);
  const request = {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Request'),
    protocol: normalizeRequestProtocol(protocol),
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
    loadTestPolicy: normalizeRequestLoadTestPolicy(loadTestPolicy),
    methodPath: methodPath == null ? '' : String(methodPath).slice(0, 512),
    metadata: normalizePairs(metadata),
    messages: normalizeMessages(messages),
    postmanBody: normalizeJsonObject(postmanBody, POSTMAN_METADATA_MAX_BYTES),
    protocolProfile: normalizeJsonObject(protocolProfile, 128 * 1024),
    graphql: normalizeJsonObject(graphql, 128 * 1024),
    grpc: normalizeJsonObject(grpc, 128 * 1024),
    websocket: normalizeJsonObject(websocket, 128 * 1024)
  };
  addOptionalJsonObject(request, 'postman', postman, POSTMAN_METADATA_MAX_BYTES);
  return request;
}

function folderModel({ id, name, requests, folders, postman } = {}) {
  const folder = {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Folder'),
    requests: Array.isArray(requests) ? requests.map(requestModel) : [],
    folders: Array.isArray(folders) ? folders.map(folderModel) : []
  };
  addOptionalJsonObject(folder, 'postman', postman, POSTMAN_METADATA_MAX_BYTES);
  return folder;
}

function collectionModel({ id, name, description, variables, certificates, requests, folders, postman } = {}) {
  const collection = {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Collection'),
    description: description ?? '',
    variables: normalizePairs(variables),
    certificates: normalizeCertificates(certificates),
    requests: Array.isArray(requests) ? requests.map(requestModel) : [],
    folders: Array.isArray(folders) ? folders.map(folderModel) : []
  };
  addOptionalJsonObject(collection, 'postman', postman, POSTMAN_METADATA_MAX_BYTES);
  return collection;
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
      packageCache: normalizeSandboxPackageCache(settings?.sandbox?.packageCache),
      trustedCapabilities: {
        sendRequest: settings?.sandbox?.trustedCapabilities?.sendRequest !== false,
        cookies: settings?.sandbox?.trustedCapabilities?.cookies !== false,
        vault: settings?.sandbox?.trustedCapabilities?.vault === true,
        vaultGrants: normalizeVaultGrants(settings?.sandbox?.trustedCapabilities?.vaultGrants, settings?.sandbox?.trustedCapabilities?.vault === true)
      }
    },
    updates: {
      includePrereleases: settings?.updates?.includePrereleases === true
    }
  };
}

function normalizeSandboxPackageCache(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object')
    .slice(0, 32)
    .map((item) => ({
      specifier: String(item.specifier || item.name || '').trim(),
      source: String(item.source || item.code || ''),
      integrity: String(item.integrity || '').trim(),
      dependencies: Array.isArray(item.dependencies) ? item.dependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 32) : [],
      maxExportKeys: Number.isFinite(Number(item.maxExportKeys)) ? Number(item.maxExportKeys) : undefined
    }))
    .filter((item) => item.specifier && item.source && item.integrity);
}

function normalizeVaultGrants(value, workspaceGrant = false) {
  const grants = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    workspace: workspaceGrant === true || grants.workspace === true,
    collections: normalizeIdList(grants.collections),
    requests: normalizeIdList(grants.requests),
    deniedCollections: normalizeIdList(grants.deniedCollections),
    deniedRequests: normalizeIdList(grants.deniedRequests)
  };
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 1000);
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
    return emptyScripts();
  }
  return {
    preRequest: typeof scripts.preRequest === 'string' ? scripts.preRequest : '',
    tests: typeof scripts.tests === 'string' ? scripts.tests : '',
    beforeQuery: typeof scripts.beforeQuery === 'string' ? scripts.beforeQuery : '',
    afterResponse: typeof scripts.afterResponse === 'string' ? scripts.afterResponse : '',
    beforeInvoke: typeof scripts.beforeInvoke === 'string' ? scripts.beforeInvoke : '',
    onMessage: typeof scripts.onMessage === 'string' ? scripts.onMessage : '',
    onIncomingMessage: typeof scripts.onIncomingMessage === 'string' ? scripts.onIncomingMessage : '',
    mock: typeof scripts.mock === 'string' ? scripts.mock : ''
  };
}

function emptyScripts() {
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

function normalizeRequestProtocol(value) {
  const protocol = String(value || 'http').trim().toLowerCase();
  if (protocol === 'graphql' || protocol === 'grpc' || protocol === 'websocket' || protocol === 'socketio') {
    return protocol;
  }
  return 'http';
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.slice(0, 1000)
    .filter((message) => message && typeof message === 'object')
    .map((message) => ({
      data: message.data == null ? '' : typeof message.data === 'string' ? message.data : safeJsonStringify(message.data),
      timestamp: message.timestamp == null ? '' : String(message.timestamp).slice(0, 128),
      type: message.type == null ? '' : String(message.type).slice(0, 64),
      name: message.name == null ? '' : String(message.name).slice(0, 256)
    }));
}

function normalizeJsonObject(value, maxBytes) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const text = safeJsonStringify(value);
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    return {};
  }
  return JSON.parse(text);
}

function addOptionalJsonObject(target, key, value, maxBytes) {
  const normalized = normalizeJsonObject(value, maxBytes);
  if (Object.keys(normalized).length) {
    target[key] = normalized;
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value == null ? {} : value);
  } catch {
    return '{}';
  }
}

function normalizeExamples(examples) {
  if (!Array.isArray(examples)) {
    return [];
  }
  return examples
    .filter((example) => example && typeof example === 'object')
    .map((example) => {
      const normalized = {
        id: example.id || newId(),
        name: normalizeName(example.name, 'Example Response'),
        statusCode: Number.isFinite(Number(example.statusCode)) ? Number(example.statusCode) : 0,
        headers: normalizePairs(example.headers),
        bodyType: normalizeSchemaEnumValue('bodyTypes', example.bodyType, DEFAULT_EXAMPLE_BODY_TYPE),
        body: example.body == null ? '' : String(example.body)
      };
      addOptionalJsonObject(normalized, 'postman', example.postman, POSTMAN_METADATA_MAX_BYTES);
      return normalized;
    });
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
    .map((certificate) => {
      const normalized = {
        id: certificate.id || newId(),
        name: normalizeName(certificate.name, 'Client Certificate'),
        matches: Array.isArray(certificate.matches) ? certificate.matches.map((value) => String(value || '')).filter(Boolean) : [],
        certPath: certificate.certPath == null ? '' : String(certificate.certPath),
        keyPath: certificate.keyPath == null ? '' : String(certificate.keyPath),
        pfxPath: certificate.pfxPath == null ? '' : String(certificate.pfxPath),
        caPath: certificate.caPath == null ? '' : String(certificate.caPath),
        passphrase: certificate.passphrase == null ? '' : String(certificate.passphrase)
      };
      addOptionalJsonObject(normalized, 'postman', certificate.postman, POSTMAN_METADATA_MAX_BYTES);
      return normalized;
    });
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
  for (const entry of orderedChildren(collection)) {
    if (entry.kind === 'request') {
      visitor(entry.value, collection);
    } else {
      walkFolderRequests(entry.value, collection, visitor);
    }
  }
}

function walkFolderRequests(folder, collection, visitor) {
  for (const entry of orderedChildren(folder)) {
    if (entry.kind === 'request') {
      visitor(entry.value, collection, folder);
    } else {
      walkFolderRequests(entry.value, collection, visitor);
    }
  }
}

function orderedChildren(container) {
  const requests = (container?.requests || []).map((value) => ({ kind: 'request', value }));
  const folders = (container?.folders || []).map((value) => ({ kind: 'folder', value }));
  const entries = requests.concat(folders);
  const order = Array.isArray(container?.postman?.itemOrder) ? container.postman.itemOrder : [];
  if (!order.length) {
    return entries;
  }
  const used = new Set();
  const ordered = [];
  for (const item of order) {
    const match = entries.find((entry) => !used.has(entry.value) && orderedChildMatches(entry, item));
    if (match) {
      used.add(match.value);
      ordered.push(match);
    }
  }
  for (const entry of entries) {
    if (!used.has(entry.value)) {
      ordered.push(entry);
    }
  }
  return ordered;
}

function orderedChildMatches(entry, item) {
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
