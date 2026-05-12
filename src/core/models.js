const crypto = require('node:crypto');
const {
  BODY_METHODS: BODY_METHOD_VALUES,
  BODY_TYPE_VALUES,
  HTTP_METHODS,
  PERFORMANCE_TEST_TYPES,
  normalizeSchemaEnumValue
} = require('./payloadSchemas');
const { normalizePersistedAuth } = require('./authModel');
const { normalizeCookies: normalizeCookieCollection } = require('./cookieModel');
const { normalizeCsvVariableData } = require('./csvVariables');
const { normalizeSandboxFileBindings } = require('./fileAttachmentBindings');
const { normalizeDiagnosticsSettings } = require('./diagnosticsSettings');

const CURRENT_SCHEMA_VERSION = 15;
const MIN_SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_METHODS = new Set(HTTP_METHODS);
const BODY_METHODS = new Set(BODY_METHOD_VALUES);
const BODY_TYPES = Object.freeze(Object.fromEntries(BODY_TYPE_VALUES.map((type) => [type, type])));
const DEFAULT_REQUEST_BODY_TYPE = 'NONE';
const POSTMAN_METADATA_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_PERFORMANCE_TEST_TYPE = 'latency';
const DEFAULT_PERFORMANCE_CONFIG = Object.freeze({
  iterations: 1,
  startConcurrency: 1,
  concurrency: 1,
  durationSeconds: 0,
  rampSteps: 1,
  spikeMultiplier: 1
});
const DEFAULT_PERFORMANCE_SAFETY_LIMITS = Object.freeze({
  maxTotalRequests: 100,
  maxConcurrency: 10,
  maxDurationSeconds: 60
});
const MAX_PERFORMANCE_TOTAL_REQUESTS = 1000;
const MAX_PERFORMANCE_CONCURRENCY = 25;
const MAX_PERFORMANCE_DURATION_SECONDS = 60 * 60;
const MAX_RUNNER_REQUEST_ITERATIONS = 1000;

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
  scripts,
  variables,
  docs,
  cookieJar,
  autoHeaders,
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
    scripts: normalizeScripts(scripts),
    variables: normalizePairs(variables),
    docs: docs == null ? '' : String(docs),
    cookieJar: normalizeRequestCookieJar(cookieJar),
    autoHeaders: normalizeRequestAutoHeaders(autoHeaders),
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

function normalizeRequestAutoHeaders(autoHeaders = {}) {
  return {
    sendPostMeterToken: autoHeaders?.sendPostMeterToken === true,
    showGeneratedHeaders: autoHeaders?.showGeneratedHeaders === true
  };
}

function runnerModel({
  id,
  name,
  environmentId,
  allowEnvironmentMutation,
  stopOnFailure,
  csvVariables,
  requests
} = {}) {
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Runner'),
    environmentId: normalizeRunnerEnvironmentId(environmentId),
    allowEnvironmentMutation: allowEnvironmentMutation === true,
    stopOnFailure: stopOnFailure === true,
    csvVariables: normalizeCsvVariableData(csvVariables),
    requests: Array.isArray(requests) ? requests.map(runnerRequestModel) : []
  };
}

function runnerRequestModel(request = {}) {
  const normalized = requestModel(request);
  normalized.iterations = normalizeRunnerRequestIterations(request.iterations);
  const source = normalizeRunnerRequestSource(request.source);
  if (Object.keys(source).length) {
    normalized.source = source;
  }
  return normalized;
}

function performanceTestModel({
  id,
  name,
  type,
  request,
  source,
  environmentId,
  allowEnvironmentMutation,
  config,
  safetyLimits,
  typeSettings,
  csvVariables,
  resultsMetadata
} = {}) {
  const normalizedType = normalizePerformanceType(type);
  const normalizedTypeSettings = normalizePerformanceTypeSettings(typeSettings, normalizedType, {
    environmentId,
    allowEnvironmentMutation,
    config,
    safetyLimits
  });
  const activeSettings = normalizedTypeSettings[normalizedType];
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Performance Test'),
    type: normalizedType,
    request: performanceRequestModel(request, source),
    source: normalizePerformanceSource(source),
    environmentId: activeSettings.environmentId,
    allowEnvironmentMutation: activeSettings.allowEnvironmentMutation,
    config: activeSettings.config,
    safetyLimits: activeSettings.safetyLimits,
    typeSettings: normalizedTypeSettings,
    csvVariables: normalizeCsvVariableData(csvVariables),
    resultsMetadata: normalizePerformanceResultsMetadata(resultsMetadata)
  };
}

function performanceRequestModel(request = {}, source = {}) {
  const hasRequest = request && typeof request === 'object' && !Array.isArray(request);
  const normalized = requestModel(hasRequest ? request : {});
  if (!hasRequest) {
    normalized.name = normalizeName(source?.requestName, 'Performance Request');
  }
  return normalized;
}

function cloneRequestForPerformanceTest(request, source = {}, options = {}) {
  const clonedRequest = cloneJson(request || {});
  return performanceTestModel({
    name: options.name || `${request?.name || 'Request'} Performance`,
    type: options.type,
    request: {
      ...clonedRequest,
      id: newId()
    },
    source: {
      ...source,
      sourceType: 'collection',
      requestId: source.requestId || request?.id,
      requestName: source.requestName || request?.name,
      importedAt: source.importedAt || new Date().toISOString()
    },
    environmentId: options.environmentId,
    allowEnvironmentMutation: options.allowEnvironmentMutation,
    config: options.config,
    safetyLimits: options.safetyLimits,
    typeSettings: options.typeSettings,
    resultsMetadata: options.resultsMetadata
  });
}

function defaultPerformanceTest(options = {}) {
  return performanceTestModel({
    ...options,
    source: {
      sourceType: 'manual',
      ...(options.source || {})
    },
    request: options.request || {
      name: 'Performance Request',
      method: 'GET',
      url: ''
    }
  });
}

function cloneRequestForRunner(request, source = {}) {
  const clonedRequest = cloneJson(request || {});
  return runnerRequestModel({
    ...clonedRequest,
    id: newId(),
    source: normalizeRunnerRequestSource({
      collectionId: source.collectionId,
      collectionName: source.collectionName,
      folderId: source.folderId,
      folderName: source.folderName,
      folderPath: source.folderPath,
      requestId: source.requestId || request?.id,
      requestName: source.requestName || request?.name
    })
  });
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

function workspaceModel({
  schemaVersion,
  collections,
  environments,
  globals,
  history,
  settings,
  localsettings,
  localSettings,
  cookies,
  runners,
  performanceTests
} = {}) {
  const normalizedLocalSettings = normalizeWorkspaceLocalSettings(localsettings || localSettings || settings);
  return {
    schemaVersion: schemaVersion || CURRENT_SCHEMA_VERSION,
    settings: mergeSettingsWithWorkspaceLocalSettings(settings, normalizedLocalSettings),
    localsettings: normalizedLocalSettings,
    collections: Array.isArray(collections) ? collections.map(collectionModel) : [],
    environments: Array.isArray(environments) ? environments.map(environmentModel) : [],
    globals: normalizePairs(globals),
    cookies: normalizeCookies(cookies),
    runners: Array.isArray(runners) ? runners.map(runnerModel) : [],
    performanceTests: Array.isArray(performanceTests) ? performanceTests.map(performanceTestModel) : [],
    history: Array.isArray(history) ? history.map(historyEntry) : []
  };
}

function normalizeSettings(settings) {
  return {
    appearance: {
      theme: normalizeTheme(settings?.appearance?.theme)
    },
    sandbox: {
      fileBindings: normalizeSandboxFileBindings(settings?.sandbox?.fileBindings),
      packageCache: normalizeSandboxPackageCache(settings?.sandbox?.packageCache),
      trustedCapabilities: {
        sendRequest: settings?.sandbox?.trustedCapabilities?.sendRequest !== false,
        cookies: settings?.sandbox?.trustedCapabilities?.cookies !== false,
        vault: settings?.sandbox?.trustedCapabilities?.vault === true,
        vaultGrants: normalizeVaultGrants(settings?.sandbox?.trustedCapabilities?.vaultGrants, settings?.sandbox?.trustedCapabilities?.vault === true)
      }
    },
    diagnostics: normalizeDiagnosticsSettings(settings?.diagnostics),
    editor: {
      lineNumbers: settings?.editor?.lineNumbers !== false
    },
    tabs: {
      saveOnForceClose: settings?.tabs?.saveOnForceClose === true
    },
    modals: {
      closeOnBackdropClick: settings?.modals?.closeOnBackdropClick === true
    },
    updates: {
      includePrereleases: settings?.updates?.includePrereleases === true
    }
  };
}

function normalizeWorkspaceLocalSettings(settings) {
  const normalized = normalizeSettings(settings || {});
  return {
    diagnostics: {
      requestResponseLogging: normalized.diagnostics.requestResponseLogging
    },
    sandbox: {
      fileBindings: normalized.sandbox.fileBindings,
      packageCache: normalized.sandbox.packageCache,
      trustedCapabilities: {
        vaultGrants: normalized.sandbox.trustedCapabilities.vaultGrants
      }
    }
  };
}

function mergeSettingsWithWorkspaceLocalSettings(settings, localsettings) {
  const normalizedSettings = normalizeSettings(settings || {});
  const normalizedLocalSettings = normalizeWorkspaceLocalSettings(localsettings || {});
  return normalizeSettings({
    ...normalizedSettings,
    diagnostics: {
      ...normalizedSettings.diagnostics,
      requestResponseLogging: normalizedLocalSettings.diagnostics.requestResponseLogging
    },
    sandbox: {
      ...normalizedSettings.sandbox,
      fileBindings: normalizedLocalSettings.sandbox.fileBindings,
      packageCache: normalizedLocalSettings.sandbox.packageCache,
      trustedCapabilities: {
        ...normalizedSettings.sandbox.trustedCapabilities,
        vaultGrants: normalizedLocalSettings.sandbox.trustedCapabilities.vaultGrants
      }
    }
  });
}

function normalizeSandboxPackageCache(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object')
    .slice(0, 32)
    .map((item) => ({
      dependencyAliases: normalizePlainStringMap(item.dependencyAliases || item.dependencyMap, 32),
      specifier: String(item.specifier || item.name || '').trim(),
      source: String(item.source || item.code || ''),
      files: normalizeSandboxPackageFiles(item.files),
      integrity: String(item.integrity || '').trim(),
      dependencies: Array.isArray(item.dependencies) ? item.dependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 32) : [],
      maxExportKeys: Number.isFinite(Number(item.maxExportKeys)) ? Number(item.maxExportKeys) : undefined,
      entrypoint: item.entrypoint == null ? '' : String(item.entrypoint).slice(0, 256),
      fetchedAt: item.fetchedAt == null ? '' : String(item.fetchedAt).slice(0, 256),
      packageDependencies: Array.isArray(item.packageDependencies) ? item.packageDependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 64) : [],
      packageIntegrity: item.packageIntegrity == null ? '' : String(item.packageIntegrity).slice(0, 512),
      packageJson: normalizeSandboxPackageJson(item.packageJson || item.package || item.manifest),
      packageName: item.packageName == null ? '' : String(item.packageName).slice(0, 256),
      packageVersion: item.packageVersion == null ? '' : String(item.packageVersion).slice(0, 128),
      registry: item.registry == null ? '' : String(item.registry).slice(0, 32),
      reviewedAt: item.reviewedAt == null ? '' : String(item.reviewedAt).slice(0, 256),
      sourceUrl: item.sourceUrl == null ? '' : String(item.sourceUrl).slice(0, 2048)
    }))
    .filter((item) => item.specifier && item.source && item.integrity);
}

function normalizeSandboxPackageFiles(files) {
  const entries = Array.isArray(files)
    ? files.map((file) => [
      file?.path ?? file?.name ?? file?.filename,
      file?.source ?? file?.code ?? file?.text
    ])
    : Object.entries(files || {});
  const output = [];
  for (const [rawPath, rawSource] of entries.slice(0, 128)) {
    const filePath = normalizeSandboxPackageFilePath(rawPath);
    if (!filePath || output.some((file) => file.path === filePath)) {
      continue;
    }
    output.push({
      path: filePath,
      source: String(rawSource ?? '')
    });
  }
  return output;
}

function normalizeSandboxPackageFilePath(filePath) {
  let value = String(filePath || '').replace(/\\/g, '/').trim();
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  value = value.replace(/^\/+/, '');
  const parts = value.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || parts.some((part) => part === '.' || part.includes('\0'))) {
    return '';
  }
  return parts.join('/').slice(0, 512);
}

function normalizeSandboxPackageJson(packageJson) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(packageJson));
  } catch {
    return {};
  }
}

function normalizePlainStringMap(value, limit) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).slice(0, limit).reduce((output, [key, target]) => {
    const alias = String(key || '').trim();
    const specifier = String(target || '').trim();
    if (alias && specifier) {
      output[alias] = specifier;
    }
    return output;
  }, {});
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

function normalizeRequestCookieJar(cookieJar) {
  return {
    enabled: cookieJar?.enabled === true,
    storeResponses: cookieJar?.storeResponses !== false
  };
}

function normalizeCookies(cookies) {
  return normalizeCookieCollection(cookies, { createId: newId });
}

function normalizeRunnerEnvironmentId(value) {
  const environmentId = String(value || '').trim();
  return environmentId || 'none';
}

function normalizeRunnerRequestSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }
  const normalized = {};
  for (const key of [
    'collectionId',
    'collectionName',
    'folderId',
    'folderName',
    'requestId',
    'requestName'
  ]) {
    const value = String(source[key] || '').trim();
    if (value) {
      normalized[key] = value.slice(0, 512);
    }
  }
  if (Array.isArray(source.folderPath)) {
    const folderPath = source.folderPath
      .map((item) => String(typeof item === 'object' && item ? item.name || item.id || '' : item || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    if (folderPath.length) {
      normalized.folderPath = folderPath;
    }
  }
  return normalized;
}

function normalizeRunnerRequestIterations(value) {
  return boundedInteger(value, 1, 1, MAX_RUNNER_REQUEST_ITERATIONS);
}

function normalizePerformanceType(value) {
  return normalizeSchemaEnumValue('performanceTestTypes', value, DEFAULT_PERFORMANCE_TEST_TYPE, { trim: true });
}

function normalizePerformanceConfig(config, type = DEFAULT_PERFORMANCE_TEST_TYPE) {
  const input = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const defaults = defaultPerformanceConfigForType(type);
  const minimumDurationSeconds = type === 'soak' ? 1 : 0;
  return {
    iterations: boundedInteger(input.iterations, defaults.iterations, 1, MAX_PERFORMANCE_TOTAL_REQUESTS),
    startConcurrency: boundedInteger(input.startConcurrency, defaults.startConcurrency, 1, MAX_PERFORMANCE_CONCURRENCY),
    concurrency: boundedInteger(input.concurrency, defaults.concurrency, 1, MAX_PERFORMANCE_CONCURRENCY),
    durationSeconds: boundedInteger(input.durationSeconds, defaults.durationSeconds, minimumDurationSeconds, MAX_PERFORMANCE_DURATION_SECONDS),
    rampSteps: boundedInteger(input.rampSteps, defaults.rampSteps, 1, MAX_PERFORMANCE_TOTAL_REQUESTS),
    spikeMultiplier: boundedInteger(input.spikeMultiplier, defaults.spikeMultiplier, 1, MAX_PERFORMANCE_CONCURRENCY)
  };
}

function normalizePerformanceTypeSettings(typeSettings, activeType = DEFAULT_PERFORMANCE_TEST_TYPE, activeSettings = {}) {
  const input = typeSettings && typeof typeSettings === 'object' && !Array.isArray(typeSettings) ? typeSettings : {};
  const hasTypeSettings = PERFORMANCE_TEST_TYPES.some((type) => input[type] && typeof input[type] === 'object' && !Array.isArray(input[type]));
  const normalized = {};
  for (const type of PERFORMANCE_TEST_TYPES) {
    const candidate = input[type] && typeof input[type] === 'object' && !Array.isArray(input[type]) ? input[type] : {};
    normalized[type] = normalizePerformanceTypeSetting(candidate, type);
  }
  if (PERFORMANCE_TEST_TYPES.includes(activeType) && (!hasTypeSettings || hasExplicitPerformanceActiveSettings(activeSettings))) {
    normalized[activeType] = normalizePerformanceTypeSetting(mergePerformanceTypeSetting(normalized[activeType], activeSettings), activeType);
  }
  return normalized;
}

function normalizePerformanceTypeSetting(setting, type = DEFAULT_PERFORMANCE_TEST_TYPE) {
  const input = setting && typeof setting === 'object' && !Array.isArray(setting) ? setting : {};
  return {
    environmentId: normalizeRunnerEnvironmentId(input.environmentId),
    allowEnvironmentMutation: input.allowEnvironmentMutation === true,
    config: normalizePerformanceConfig(input.config, type),
    safetyLimits: normalizePerformanceSafetyLimits(input.safetyLimits)
  };
}

function hasExplicitPerformanceActiveSettings(settings = {}) {
  return settings.environmentId != null
    || settings.allowEnvironmentMutation != null
    || settings.config != null
    || settings.safetyLimits != null;
}

function mergePerformanceTypeSetting(base = {}, override = {}) {
  const baseConfig = { ...(base.config || {}) };
  const overrideConfig = override.config || {};
  if (overrideConfig.virtualUsers != null && overrideConfig.concurrency == null) {
    delete baseConfig.concurrency;
  }
  if (overrideConfig.rampUpSeconds != null && overrideConfig.rampSteps == null) {
    delete baseConfig.rampSteps;
  }
  return {
    ...base,
    ...override,
    config: {
      ...baseConfig,
      ...overrideConfig
    },
    safetyLimits: {
      ...(base.safetyLimits || {}),
      ...(override.safetyLimits || {})
    }
  };
}

function defaultPerformanceConfigForType(type) {
  return {
    latency: { ...DEFAULT_PERFORMANCE_CONFIG, iterations: 1 },
    throughput: { ...DEFAULT_PERFORMANCE_CONFIG, iterations: 10, concurrency: 1 },
    concurrency: { ...DEFAULT_PERFORMANCE_CONFIG, iterations: 10, concurrency: 5 },
    stress: { ...DEFAULT_PERFORMANCE_CONFIG, iterations: 10, startConcurrency: 1, concurrency: 10, rampSteps: 5 },
    spike: { ...DEFAULT_PERFORMANCE_CONFIG, iterations: 20, concurrency: 2, spikeMultiplier: 3 },
    soak: { ...DEFAULT_PERFORMANCE_CONFIG, concurrency: 2, durationSeconds: 30 },
    ramp: { ...DEFAULT_PERFORMANCE_CONFIG, iterations: 10, startConcurrency: 1, concurrency: 10, rampSteps: 5 }
  }[type] || DEFAULT_PERFORMANCE_CONFIG;
}

function normalizePerformanceSafetyLimits(safetyLimits) {
  const input = safetyLimits && typeof safetyLimits === 'object' && !Array.isArray(safetyLimits) ? safetyLimits : {};
  return {
    maxTotalRequests: boundedInteger(input.maxTotalRequests, DEFAULT_PERFORMANCE_SAFETY_LIMITS.maxTotalRequests, 1, MAX_PERFORMANCE_TOTAL_REQUESTS),
    maxConcurrency: boundedInteger(input.maxConcurrency, DEFAULT_PERFORMANCE_SAFETY_LIMITS.maxConcurrency, 1, MAX_PERFORMANCE_CONCURRENCY),
    maxDurationSeconds: boundedInteger(input.maxDurationSeconds, DEFAULT_PERFORMANCE_SAFETY_LIMITS.maxDurationSeconds, 1, MAX_PERFORMANCE_DURATION_SECONDS)
  };
}

function normalizePerformanceResultsMetadata(metadata) {
  const input = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  return {
    lastRunAt: input.lastRunAt == null ? '' : String(input.lastRunAt).slice(0, 256),
    lastResultId: input.lastResultId == null ? '' : String(input.lastResultId).slice(0, 256),
    lastStatus: input.lastStatus == null ? '' : String(input.lastStatus).slice(0, 64),
    runCount: Number.isFinite(Number(input.runCount)) && Number(input.runCount) > 0 ? Math.floor(Number(input.runCount)) : 0,
    updatedAt: input.updatedAt == null ? '' : String(input.updatedAt).slice(0, 256)
  };
}

function normalizePerformanceSource(source) {
  const normalized = normalizeRunnerRequestSource(source);
  const sourceType = String(source?.sourceType || source?.type || '').trim().toLowerCase();
  normalized.sourceType = sourceType === 'collection' ? 'collection' : 'manual';
  const importedAt = String(source?.importedAt || '').trim();
  if (importedAt) {
    normalized.importedAt = importedAt.slice(0, 256);
  }
  return normalized;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(number)));
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
    localsettings: normalizeWorkspaceLocalSettings(),
    collections: [],
    environments: [],
    globals: [],
    cookies: [],
    runners: [],
    performanceTests: [],
    history: []
  });
}

function cloneJson(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
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
  DEFAULT_PERFORMANCE_SAFETY_LIMITS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  MAX_RUNNER_REQUEST_ITERATIONS,
  PERFORMANCE_TEST_TYPES,
  SUPPORTED_METHODS,
  cloneRequestForPerformanceTest,
  cloneRequestForRunner,
  collectionModel,
  defaultPerformanceTest,
  defaultWorkspace,
  environmentModel,
  folderModel,
  historyEntry,
  keyValue,
  newId,
  normalizeCookies,
  normalizePerformanceConfig,
  normalizePerformanceSafetyLimits,
  normalizePerformanceSource,
  normalizePerformanceTypeSettings,
  normalizeRequestCookieJar,
  normalizeRunnerRequestIterations,
  normalizeRunnerRequestSource,
  normalizeSettings,
  normalizeWorkspaceLocalSettings,
  mergeSettingsWithWorkspaceLocalSettings,
  performanceTestModel,
  requestModel,
  runnerModel,
  runnerRequestModel,
  walkRequests,
  workspaceModel
};
