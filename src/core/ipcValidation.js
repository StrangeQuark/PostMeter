const { BODY_TYPES, SUPPORTED_METHODS } = require('./models');
const { AUTH_TYPES, validateAuth } = require('./auth');

const LIMITS = {
  collections: 500,
  foldersPerLevel: 500,
  requestsPerLevel: 1000,
  environments: 500,
  history: 1000,
  pairs: 1000,
  folderDepth: 20,
  name: 256,
  url: 8192,
  key: 512,
  value: 32768,
  body: 10 * 1024 * 1024,
  loadResultJson: 10 * 1024 * 1024
};

function assertWorkspacePayload(value, field = 'workspace') {
  object(value, field);
  optionalNumber(value.schemaVersion, `${field}.schemaVersion`);
  array(value.collections, `${field}.collections`, LIMITS.collections).forEach((collection, index) => {
    assertCollectionPayload(collection, `${field}.collections[${index}]`);
  });
  array(value.environments, `${field}.environments`, LIMITS.environments).forEach((environment, index) => {
    assertEnvironmentPayload(environment, `${field}.environments[${index}]`);
  });
  array(value.history, `${field}.history`, LIMITS.history).forEach((entry, index) => {
    object(entry, `${field}.history[${index}]`);
    optionalString(entry.timestamp, `${field}.history[${index}].timestamp`, LIMITS.name);
    optionalString(entry.method, `${field}.history[${index}].method`, 12);
    optionalString(entry.url, `${field}.history[${index}].url`, LIMITS.url);
    optionalNumber(entry.statusCode, `${field}.history[${index}].statusCode`);
    optionalNumber(entry.durationMillis, `${field}.history[${index}].durationMillis`);
  });
}

function assertCollectionPayload(value, field = 'collection') {
  object(value, field);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  optionalString(value.description, `${field}.description`, LIMITS.value);
  assertRequestArray(value.requests || [], `${field}.requests`);
  assertFolderArray(value.folders || [], `${field}.folders`, 0);
}

function assertRequestPayload(value, field = 'request') {
  object(value, field);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  optionalString(value.method, `${field}.method`, 12);
  if (value.method && !SUPPORTED_METHODS.has(value.method)) {
    fail(`${field}.method is not supported.`);
  }
  optionalString(value.url, `${field}.url`, LIMITS.url);
  assertPairs(value.queryParams || [], `${field}.queryParams`);
  assertPairs(value.headers || [], `${field}.headers`);
  optionalString(value.bodyType, `${field}.bodyType`, 32);
  if (value.bodyType && !Object.values(BODY_TYPES).includes(value.bodyType)) {
    fail(`${field}.bodyType is not supported.`);
  }
  optionalString(value.body, `${field}.body`, LIMITS.body);
  assertAuthPayload(value.auth || { type: 'none' }, `${field}.auth`);
}

function assertEnvironmentPayload(value, field = 'environment') {
  object(value, field);
  optionalString(value.id, `${field}.id`, LIMITS.name);
  optionalString(value.name, `${field}.name`, LIMITS.name);
  assertPairs(value.variables || [], `${field}.variables`);
}

function assertOptionalEnvironmentPayload(value, field = 'environment') {
  if (value == null) {
    return;
  }
  assertEnvironmentPayload(value, field);
}

function assertLoadConfigPayload(value, field = 'config') {
  object(value, field);
  number(value.concurrency, `${field}.concurrency`);
  number(value.totalRequests, `${field}.totalRequests`);
}

function assertLoadResultPayload(value, field = 'result') {
  object(value, field);
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > LIMITS.loadResultJson) {
    fail(`${field} is too large to export.`);
  }
}

function assertExportFormat(value, field = 'format') {
  if (value !== 'json' && value !== 'csv') {
    fail(`${field} must be json or csv.`);
  }
}

function assertLoadId(value, field = 'id') {
  string(value, field, 128);
}

function assertAuthPayload(value, field = 'auth') {
  object(value, field);
  string(value.type ?? 'none', `${field}.type`, 64);
  if (!AUTH_TYPES.has(value.type ?? 'none')) {
    fail(`${field}.type is not supported.`);
  }
  const authErrors = validateAuth(value, null);
  if ((value.type ?? 'none') === 'clientCertificate' && authErrors.length) {
    return;
  }
  for (const key of ['token', 'username', 'password', 'key', 'value', 'accessToken', 'refreshToken', 'tokenUrl', 'authorizationUrl', 'clientId', 'clientSecret', 'scopes', 'grantType', 'certPath', 'keyPath', 'passphrase']) {
    optionalString(value[key], `${field}.${key}`, LIMITS.value);
  }
  optionalString(value.location, `${field}.location`, 16);
  optionalString(value.tokenType, `${field}.tokenType`, 16);
}

function assertRequestArray(values, field) {
  array(values, field, LIMITS.requestsPerLevel).forEach((request, index) => {
    assertRequestPayload(request, `${field}[${index}]`);
  });
}

function assertFolderArray(values, field, depth) {
  if (depth > LIMITS.folderDepth) {
    fail(`${field} exceeds maximum folder depth.`);
  }
  array(values, field, LIMITS.foldersPerLevel).forEach((folder, index) => {
    const itemField = `${field}[${index}]`;
    object(folder, itemField);
    optionalString(folder.id, `${itemField}.id`, LIMITS.name);
    optionalString(folder.name, `${itemField}.name`, LIMITS.name);
    assertRequestArray(folder.requests || [], `${itemField}.requests`);
    assertFolderArray(folder.folders || [], `${itemField}.folders`, depth + 1);
  });
}

function assertPairs(values, field) {
  array(values, field, LIMITS.pairs).forEach((pair, index) => {
    const itemField = `${field}[${index}]`;
    object(pair, itemField);
    optionalBoolean(pair.enabled, `${itemField}.enabled`);
    optionalString(pair.key, `${itemField}.key`, LIMITS.key);
    optionalString(pair.value, `${itemField}.value`, LIMITS.value);
  });
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object.`);
  }
}

function array(value, field, max) {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array.`);
  }
  if (value.length > max) {
    fail(`${field} cannot contain more than ${max} items.`);
  }
  return value;
}

function string(value, field, max) {
  if (typeof value !== 'string') {
    fail(`${field} must be a string.`);
  }
  if (value.length > max) {
    fail(`${field} cannot exceed ${max} characters.`);
  }
}

function optionalString(value, field, max) {
  if (value == null) {
    return;
  }
  string(value, field, max);
}

function number(value, field) {
  if (!Number.isFinite(Number(value))) {
    fail(`${field} must be a finite number.`);
  }
}

function optionalNumber(value, field) {
  if (value == null) {
    return;
  }
  number(value, field);
}

function optionalBoolean(value, field) {
  if (value == null) {
    return;
  }
  if (typeof value !== 'boolean') {
    fail(`${field} must be a boolean.`);
  }
}

function fail(message) {
  throw new Error(`Invalid IPC payload: ${message}`);
}

module.exports = {
  LIMITS,
  assertCollectionPayload,
  assertEnvironmentPayload,
  assertExportFormat,
  assertLoadConfigPayload,
  assertLoadId,
  assertLoadResultPayload,
  assertOptionalEnvironmentPayload,
  assertRequestPayload,
  assertWorkspacePayload
};
