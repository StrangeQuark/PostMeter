const crypto = require('node:crypto');
const {
  AUTH_TYPE_VALUES,
  BODY_METHODS: BODY_METHOD_VALUES,
  BODY_TYPE_VALUES,
  HTTP_METHODS,
  THEME_VALUES
} = require('./payloadSchemas');

const CURRENT_SCHEMA_VERSION = 10;
const MIN_SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_METHODS = new Set(HTTP_METHODS);
const BODY_METHODS = new Set(BODY_METHOD_VALUES);
const BODY_TYPES = Object.fromEntries(BODY_TYPE_VALUES.map((type) => [type, type]));
const AUTH_TYPES = new Set(AUTH_TYPE_VALUES);

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
    bodyType: Object.values(BODY_TYPES).includes(bodyType) ? bodyType : BODY_TYPES.NONE,
    body: body ?? '',
    auth: normalizeAuth(auth),
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

function workspaceModel({ schemaVersion, collections, environments, history, settings, cookies } = {}) {
  return {
    schemaVersion: schemaVersion || CURRENT_SCHEMA_VERSION,
    settings: normalizeSettings(settings),
    collections: Array.isArray(collections) ? collections.map(collectionModel) : [],
    environments: Array.isArray(environments) ? environments.map(environmentModel) : [],
    cookies: normalizeCookies(cookies),
    history: Array.isArray(history) ? history.map(historyEntry) : []
  };
}

function normalizeSettings(settings) {
  return {
    appearance: {
      theme: normalizeTheme(settings?.appearance?.theme)
    },
    updates: {
      includePrereleases: settings?.updates?.includePrereleases === true
    }
  };
}

function normalizeTheme(value) {
  const theme = String(value || '').trim();
  return THEME_VALUES.includes(theme) ? theme : 'system';
}

function normalizeLoadTestPolicy(policy) {
  return {
    concurrency: boundedInteger(policy?.concurrency, 5, 1, 512),
    totalRequests: boundedInteger(policy?.totalRequests, 25, 1, 100000),
    durationSeconds: boundedNumber(policy?.durationSeconds, 0, 0, 3600),
    rampUpSeconds: boundedNumber(policy?.rampUpSeconds, 0, 0, 3600),
    targetRatePerSecond: boundedNumber(policy?.targetRatePerSecond, 0, 0, 10000),
    maxRatePerSecond: boundedNumber(policy?.maxRatePerSecond, 0, 0, 10000),
    executionMode: policy?.executionMode === 'multiProcess' ? 'multiProcess' : 'singleProcess',
    workerProcesses: boundedInteger(policy?.workerProcesses, 2, 1, 8),
    recordSamples: policy?.recordSamples === true
  };
}

function normalizeRequestLoadTestPolicy(policy) {
  return {
    enabled: policy?.enabled === true,
    ...normalizeLoadTestPolicy(policy)
  };
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function normalizePairs(pairs) {
  if (!Array.isArray(pairs)) {
    return [];
  }
  return pairs.map((pair) => keyValue(pair.key, pair.value, pair.enabled !== false));
}

function normalizeAuth(auth) {
  if (!auth || typeof auth !== 'object' || !AUTH_TYPES.has(auth.type)) {
    return { type: 'none' };
  }
  return { ...auth };
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
      bodyType: Object.values(BODY_TYPES).includes(example.bodyType) ? example.bodyType : BODY_TYPES.RAW_TEXT,
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
  if (!Array.isArray(cookies)) {
    return [];
  }
  return cookies
    .filter((cookie) => cookie && typeof cookie === 'object')
    .map((cookie) => ({
      id: cookie.id || newId(),
      enabled: cookie.enabled !== false,
      name: cookie.name == null ? '' : String(cookie.name).trim(),
      value: cookie.value == null ? '' : String(cookie.value),
      domain: normalizeCookieDomain(cookie.domain),
      path: normalizeCookiePath(cookie.path),
      expiresAt: normalizeCookieExpiresAt(cookie.expiresAt),
      secure: cookie.secure === true,
      httpOnly: cookie.httpOnly === true,
      sameSite: normalizeSameSite(cookie.sameSite),
      hostOnly: cookie.hostOnly !== false,
      priority: normalizeCookiePriority(cookie.priority),
      partitioned: cookie.partitioned === true,
      source: cookie.source == null ? '' : String(cookie.source).trim().slice(0, 64),
      extensions: normalizeCookieExtensions(cookie.extensions)
    }))
    .filter((cookie) => cookie.name && cookie.domain);
}

function normalizeCookieExtensions(extensions) {
  if (!Array.isArray(extensions)) {
    return [];
  }
  return extensions
    .map((extension) => String(extension ?? '').trim())
    .filter(Boolean)
    .slice(0, 25);
}

function normalizeCookieDomain(domain) {
  return String(domain || '').trim().replace(/^\./, '').toLowerCase();
}

function normalizeCookiePath(path) {
  const value = String(path || '/').trim();
  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeCookieExpiresAt(expiresAt) {
  const value = String(expiresAt || '').trim();
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeSameSite(sameSite) {
  const value = String(sameSite || '').trim().toLowerCase();
  if (value === 'strict') {
    return 'Strict';
  }
  if (value === 'lax') {
    return 'Lax';
  }
  if (value === 'none') {
    return 'None';
  }
  return '';
}

function normalizeCookiePriority(priority) {
  const value = String(priority || '').trim().toLowerCase();
  if (value === 'low') {
    return 'Low';
  }
  if (value === 'medium') {
    return 'Medium';
  }
  if (value === 'high') {
    return 'High';
  }
  return '';
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
  const candidate = typeof method === 'string' ? method.trim().toUpperCase() : 'GET';
  return SUPPORTED_METHODS.has(candidate) ? candidate : 'GET';
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
