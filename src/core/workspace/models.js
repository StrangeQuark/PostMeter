const crypto = require('node:crypto');
const {
  BODY_METHODS: BODY_METHOD_VALUES,
  BODY_TYPE_VALUES,
  HTTP_METHODS,
  PERFORMANCE_TEST_TYPES,
  normalizeSchemaEnumValue
} = require('../contracts/payloadSchemas');
const { normalizePersistedAuth } = require('../http/authModel');
const { normalizeCookies: normalizeCookieCollection } = require('../http/cookieModel');
const { normalizeCsvVariableDataDefaultOff } = require('./csvVariables');
const { normalizeSandboxFileBindings } = require('../http/fileAttachmentBindings');
const { normalizeDiagnosticsSettings } = require('../diagnostics-release/diagnosticsSettings');
const { normalizeCapturePolicy } = require('./resultCapturePolicy');
const { normalizeKeyboardShortcuts } = require('../contracts/keyboardShortcuts');
const {
  normalizeRequestTlsSettings,
  normalizeTlsSettings
} = require('../http/tlsSettings');
const {
  DEFAULT_DIAGNOSIS_CONCURRENCY,
  DEFAULT_DIAGNOSIS_SCOPE,
  DEFAULT_DIAGNOSIS_SPIKE_MULTIPLIER,
  DEFAULT_DIAGNOSIS_TOTAL_REQUESTS,
  DIAGNOSIS_TYPE,
  diagnosisScopeProfile,
  normalizeDiagnosisScope
} = require('../runtime/performanceDiagnosis');

const CURRENT_SCHEMA_VERSION = 15;
const MIN_SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_METHODS = new Set(HTTP_METHODS);
const BODY_METHODS = new Set(BODY_METHOD_VALUES);
const BODY_TYPES = Object.freeze(Object.fromEntries(BODY_TYPE_VALUES.map((type) => [type, type])));
const DEFAULT_REQUEST_BODY_TYPE = 'NONE';
const POSTMAN_METADATA_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_PERFORMANCE_TEST_TYPE = 'diagnosis';
const TYPOGRAPHY_FONT_SIZE_OPTIONS = Object.freeze([10, 13, 16, 19]);
const DEFAULT_INTERFACE_FONT = 'default';
const DEFAULT_INTERFACE_FONT_SIZE = 13;
const DEFAULT_EDITOR_FONT = 'default';
const DEFAULT_EDITOR_FONT_SIZE = 13;
const DEFAULT_PERFORMANCE_CONFIG = Object.freeze({
  iterations: 1,
  startConcurrency: 1,
  concurrency: 1,
  durationSeconds: 0,
  rampSteps: 1,
  spikeMultiplier: 1,
  diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE
});
const DEFAULT_PERFORMANCE_SAFETY_LIMITS = Object.freeze({
  maxTotalRequests: 100,
  maxConcurrency: 10,
  maxDurationSeconds: 60
});
const MAX_PERFORMANCE_TOTAL_REQUESTS = 1000000;
const MAX_PERFORMANCE_CONCURRENCY = 25;
const MAX_PERFORMANCE_DURATION_SECONDS = 60 * 60;
const MAX_RUNNER_REQUEST_ITERATIONS = 1000000;
const MAX_AUTH_REFRESH_INTERVAL_SECONDS = 24 * 60 * 60;
const MAX_AUTH_REFRESH_WINDOW_SECONDS = 60 * 60;
const DEFAULT_AUTH_REFRESH_REQUEST_ID = 'auth-refresh-request';
const DEFAULT_AUTH_REFRESH_TOKEN_REQUEST_ID = 'auth-refresh-token-request';
const DEFAULT_AUTH_REFRESH = Object.freeze({
  enabled: false,
  mode: 'interval',
  authType: 'bearer',
  targetScope: 'environment',
  apiKeyLocation: 'header',
  apiKeyName: 'X-API-Key',
  accessTokenVariable: 'ACCESS_TOKEN',
  refreshTokenVariable: 'REFRESH_TOKEN',
  expiresAtVariable: '',
  accessTokenPath: 'access_token',
  refreshTokenPath: 'refresh_token',
  expiresInPath: 'expires_in',
  expiresAtPath: 'expires_at',
  refreshWindowSeconds: 120,
  tokenLifetimeSeconds: 900,
  refreshIntervalSeconds: 600,
  refreshBeforeRun: true,
  failurePolicy: 'abort',
  outputs: []
});

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
  settings,
  metadata,
  postman,
  messages,
  methodPath,
  refreshingAuthOriginalAuth,
  useRefreshingAuthCookie
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
    websocket: normalizeJsonObject(websocket, 128 * 1024),
    settings: normalizeRequestTlsSettings(settings)
  };
  if ((request.auth?.type === 'autoRefresh' || useRefreshingAuthCookie === true)
    && refreshingAuthOriginalAuth && typeof refreshingAuthOriginalAuth === 'object') {
    request.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(refreshingAuthOriginalAuth);
  }
  if (useRefreshingAuthCookie === true) {
    request.useRefreshingAuthCookie = true;
  }
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
  capturePolicy,
  authRefresh,
  csvVariables,
  requests
} = {}) {
  return {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Runner'),
    environmentId: normalizeRunnerEnvironmentId(environmentId),
    allowEnvironmentMutation: allowEnvironmentMutation === true,
    stopOnFailure: stopOnFailure !== false,
    capturePolicy: normalizeCapturePolicy(capturePolicy, 'runner'),
    authRefresh: normalizeAuthRefreshConfig(authRefresh),
    csvVariables: normalizeCsvVariableDataDefaultOff(csvVariables),
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
  if (normalized.auth?.type === 'autoRefresh' && request.refreshingAuthOriginalAuth && typeof request.refreshingAuthOriginalAuth === 'object') {
    normalized.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(request.refreshingAuthOriginalAuth);
  }
  return normalized;
}

function normalizeRefreshingAuthOriginalAuth(auth = {}) {
  const normalized = normalizePersistedAuth(auth);
  if (normalized.type === 'autoRefresh' || normalized.type === 'autoRefreshRefreshToken') {
    return { type: 'none' };
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
  capturePolicy,
  authRefresh,
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
    capturePolicy: normalizeCapturePolicy(capturePolicy, 'performance', { diagnostic: normalizedType === DIAGNOSIS_TYPE }),
    authRefresh: normalizeAuthRefreshConfig(authRefresh),
    typeSettings: normalizedTypeSettings,
    csvVariables: normalizeCsvVariableDataDefaultOff(csvVariables),
    resultsMetadata: normalizePerformanceResultsMetadata(resultsMetadata)
  };
}

function normalizeAuthRefreshConfig(authRefresh = {}) {
  const input = authRefresh && typeof authRefresh === 'object' && !Array.isArray(authRefresh) ? authRefresh : {};
  const requestInput = input.request && typeof input.request === 'object' && !Array.isArray(input.request)
    ? input.request
    : {};
  const refreshTokenRequestInput = input.refreshTokenRequest && typeof input.refreshTokenRequest === 'object' && !Array.isArray(input.refreshTokenRequest)
    ? input.refreshTokenRequest
    : {};
  const normalized = {
    enabled: input.enabled === true,
    mode: normalizeSchemaEnumValue('authRefreshModes', input.mode, DEFAULT_AUTH_REFRESH.mode),
    authType: normalizeSchemaEnumValue('authRefreshTypes', input.authType, DEFAULT_AUTH_REFRESH.authType),
    targetScope: normalizeSchemaEnumValue('authRefreshScopes', input.targetScope, DEFAULT_AUTH_REFRESH.targetScope),
    apiKeyLocation: normalizeSchemaEnumValue('apiKeyLocations', input.apiKeyLocation, DEFAULT_AUTH_REFRESH.apiKeyLocation),
    apiKeyName: normalizeAuthRefreshKey(input.apiKeyName, DEFAULT_AUTH_REFRESH.apiKeyName),
    accessTokenVariable: normalizeAuthRefreshKey(input.accessTokenVariable, DEFAULT_AUTH_REFRESH.accessTokenVariable),
    refreshTokenVariable: normalizeAuthRefreshKey(input.refreshTokenVariable, DEFAULT_AUTH_REFRESH.refreshTokenVariable),
    expiresAtVariable: normalizeAuthRefreshKey(input.expiresAtVariable, DEFAULT_AUTH_REFRESH.expiresAtVariable),
    accessTokenPath: normalizeAuthRefreshPath(input.accessTokenPath, DEFAULT_AUTH_REFRESH.accessTokenPath),
    refreshTokenPath: normalizeAuthRefreshPath(input.refreshTokenPath, DEFAULT_AUTH_REFRESH.refreshTokenPath),
    expiresInPath: normalizeAuthRefreshPath(input.expiresInPath, DEFAULT_AUTH_REFRESH.expiresInPath),
    expiresAtPath: normalizeAuthRefreshPath(input.expiresAtPath, DEFAULT_AUTH_REFRESH.expiresAtPath),
    refreshWindowSeconds: boundedInteger(input.refreshWindowSeconds, DEFAULT_AUTH_REFRESH.refreshWindowSeconds, 0, MAX_AUTH_REFRESH_WINDOW_SECONDS),
    tokenLifetimeSeconds: boundedInteger(input.tokenLifetimeSeconds, DEFAULT_AUTH_REFRESH.tokenLifetimeSeconds, 1, MAX_AUTH_REFRESH_INTERVAL_SECONDS),
    refreshIntervalSeconds: boundedInteger(input.refreshIntervalSeconds, DEFAULT_AUTH_REFRESH.refreshIntervalSeconds, 1, MAX_AUTH_REFRESH_INTERVAL_SECONDS),
    refreshBeforeRun: input.refreshBeforeRun !== false,
    failurePolicy: normalizeSchemaEnumValue('authRefreshFailurePolicies', input.failurePolicy, DEFAULT_AUTH_REFRESH.failurePolicy),
    request: authRefreshRequestModel(requestInput, {
      id: DEFAULT_AUTH_REFRESH_REQUEST_ID,
      name: 'Refresh Auth'
    }),
    refreshTokenRequest: authRefreshRequestModel(refreshTokenRequestInput, {
      id: DEFAULT_AUTH_REFRESH_TOKEN_REQUEST_ID,
      name: 'Refresh Token'
    })
  };
  normalized.outputs = normalizeAuthRefreshOutputs(input.outputs, normalized);
  return normalized;
}

function authRefreshRequestModel(requestInput = {}, defaults = {}) {
  return requestModel({
    id: requestInput.id || defaults.id,
    name: requestInput.name || defaults.name || 'Refresh Auth',
    method: requestInput.method || 'POST',
    url: requestInput.url || '',
    queryParams: requestInput.queryParams,
    headers: requestInput.headers,
    bodyType: requestInput.bodyType,
    body: requestInput.body,
    auth: requestInput.auth,
    scripts: requestInput.scripts,
    variables: requestInput.variables,
    docs: requestInput.docs,
    cookieJar: requestInput.cookieJar,
    autoHeaders: requestInput.autoHeaders,
    protocol: requestInput.protocol,
    protocolProfile: requestInput.protocolProfile,
    postmanBody: requestInput.postmanBody,
    graphql: requestInput.graphql,
    grpc: requestInput.grpc,
    websocket: requestInput.websocket,
    settings: requestInput.settings,
    metadata: requestInput.metadata,
    postman: requestInput.postman,
    messages: requestInput.messages,
    methodPath: requestInput.methodPath,
    refreshingAuthOriginalAuth: requestInput.refreshingAuthOriginalAuth,
    useRefreshingAuthCookie: requestInput.useRefreshingAuthCookie
  });
}

function normalizeAuthRefreshKey(value, fallback = '') {
  if (value == null) {
    return String(fallback || '').slice(0, 512);
  }
  return String(value).trim().slice(0, 512);
}

function normalizeAuthRefreshPath(value, fallback = '') {
  if (value == null) {
    return String(fallback || '').slice(0, 32768);
  }
  return String(value).trim().slice(0, 32768);
}

function normalizeAuthRefreshOutputs(outputs, fallbackConfig = DEFAULT_AUTH_REFRESH) {
  const source = Array.isArray(outputs)
    ? outputs
    : legacyAuthRefreshOutputs(fallbackConfig);
  const normalized = [];
  const seen = new Set();
  for (const output of source.slice(0, 20)) {
    const item = normalizeAuthRefreshOutput(output);
    if (!item.path) {
      continue;
    }
    const key = `${item.slot}:${item.source}:${item.path}:${item.variable}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(item);
  }
  return normalized;
}

function normalizeAuthRefreshOutput(output = {}) {
  const input = output && typeof output === 'object' && !Array.isArray(output) ? output : {};
  const source = normalizeSchemaEnumValue('authRefreshOutputSources', input.source, 'body');
  const path = normalizeAuthRefreshPath(input.path, '');
  return {
    slot: normalizeSchemaEnumValue('authRefreshOutputSlots', input.slot, 'custom'),
    source,
    path: path || (source === 'rawBody' ? '$body' : ''),
    variable: normalizeAuthRefreshKey(input.variable, '')
  };
}

function legacyAuthRefreshOutputs(config = {}) {
  const outputs = [];
  if (config.accessTokenVariable && config.accessTokenPath) {
    outputs.push({
      slot: 'accessToken',
      source: 'body',
      path: config.accessTokenPath,
      variable: config.accessTokenVariable
    });
  }
  if (config.refreshTokenVariable && config.refreshTokenPath) {
    outputs.push({
      slot: 'refreshToken',
      source: 'body',
      path: config.refreshTokenPath,
      variable: config.refreshTokenVariable
    });
  }
  return outputs;
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
    capturePolicy: options.capturePolicy,
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

function folderModel({ id, name, description, auth, scripts, variables, requests, folders, postman } = {}) {
  const folder = {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Folder'),
    description: description ?? '',
    auth: normalizePersistedAuth(auth),
    scripts: normalizeScripts(scripts),
    variables: normalizePairs(variables),
    requests: Array.isArray(requests) ? requests.map(requestModel) : [],
    folders: Array.isArray(folders) ? folders.map(folderModel) : []
  };
  addOptionalJsonObject(folder, 'postman', postman, POSTMAN_METADATA_MAX_BYTES);
  return folder;
}

function collectionModel({ id, name, description, auth, scripts, variables, certificates, requests, folders, postman } = {}) {
  const collection = {
    id: id || newId(),
    name: normalizeName(name, 'Untitled Collection'),
    description: description ?? '',
    auth: normalizePersistedAuth(auth),
    scripts: normalizeScripts(scripts),
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
      theme: normalizeTheme(settings?.appearance?.theme),
      interfaceFont: normalizeSchemaEnumValue('interfaceFontValues', settings?.appearance?.interfaceFont, DEFAULT_INTERFACE_FONT, { trim: true }),
      interfaceFontSize: normalizeFontSize(
        settings?.appearance?.interfaceFontSize,
        DEFAULT_INTERFACE_FONT_SIZE
      ),
      editorFont: normalizeSchemaEnumValue('editorFontValues', settings?.appearance?.editorFont, DEFAULT_EDITOR_FONT, { trim: true }),
      editorFontSize: normalizeFontSize(
        settings?.appearance?.editorFontSize,
        DEFAULT_EDITOR_FONT_SIZE
      )
    },
    sandbox: {
      fileBindings: normalizeSandboxFileBindings(settings?.sandbox?.fileBindings),
      packageCache: normalizeSandboxPackageCache(settings?.sandbox?.packageCache),
      trustedCapabilities: {
        sendRequest: settings?.sandbox?.trustedCapabilities?.sendRequest !== false,
        cookies: settings?.sandbox?.trustedCapabilities?.cookies !== false,
        vault: settings?.sandbox?.trustedCapabilities?.vault !== false,
        vaultGrants: normalizeVaultGrants(settings?.sandbox?.trustedCapabilities?.vaultGrants)
      }
    },
    diagnostics: normalizeDiagnosticsSettings(settings?.diagnostics),
    editor: {
      lineNumbers: settings?.editor?.lineNumbers !== false,
      variableTooltipHints: settings?.editor?.variableTooltipHints !== false
    },
    tabs: {
      saveOnForceClose: settings?.tabs?.saveOnForceClose === true
    },
    modals: {
      closeOnBackdropClick: settings?.modals?.closeOnBackdropClick === true
    },
    updates: {
      automaticUpdatesEnabled: settings?.updates?.automaticUpdatesEnabled === true,
      includePrereleases: settings?.updates?.includePrereleases === true,
      startupRemindersEnabled: settings?.updates?.startupRemindersEnabled !== false
    },
    shortcuts: normalizeKeyboardShortcuts(settings?.shortcuts),
    request: normalizeTlsRequestSettings(settings?.request)
  };
}

function normalizeTlsRequestSettings(settings = {}) {
  const normalized = normalizeTlsSettings({ request: settings });
  return {
    sslCertificateVerification: normalized.sslCertificateVerification !== false,
    caCertificatePath: normalized.caCertificatePath,
    clientCertificates: normalized.clientCertificates
  };
}

function normalizeWorkspaceLocalSettings(settings) {
  const normalized = normalizeSettings(settings || {});
  return {
    diagnostics: {
      requestResponseLogging: normalized.diagnostics.requestResponseLogging
    },
    request: {
      caCertificatePath: normalized.request.caCertificatePath,
      clientCertificates: normalized.request.clientCertificates,
      sslCertificateVerification: normalized.request.sslCertificateVerification
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
    request: {
      ...normalizedSettings.request,
      ...normalizedLocalSettings.request
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

function normalizeFontSize(value, fallback) {
  const numeric = Number(value);
  return TYPOGRAPHY_FONT_SIZE_OPTIONS.includes(numeric) ? numeric : fallback;
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
  if (String(value || '').trim().toLowerCase() === 'load') {
    return 'latency';
  }
  return normalizeSchemaEnumValue('performanceTestTypes', value, DEFAULT_PERFORMANCE_TEST_TYPE, { trim: true });
}

function normalizePerformanceConfig(config, type = DEFAULT_PERFORMANCE_TEST_TYPE) {
  const input = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const defaults = defaultPerformanceConfigForType(type);
  const minimumDurationSeconds = type === 'soak' ? 1 : 0;
  const diagnosisScope = normalizeDiagnosisScope(input.diagnosisScope ?? defaults.diagnosisScope);
  const diagnosisProfile = diagnosisScopeProfile(diagnosisScope);
  return {
    iterations: type === DIAGNOSIS_TYPE
      ? diagnosisProfile.totalRequests
      : boundedInteger(input.iterations, defaults.iterations, 1, MAX_PERFORMANCE_TOTAL_REQUESTS),
    startConcurrency: boundedInteger(input.startConcurrency, defaults.startConcurrency, 1, MAX_PERFORMANCE_CONCURRENCY),
    concurrency: boundedInteger(input.concurrency, defaults.concurrency, 1, MAX_PERFORMANCE_CONCURRENCY),
    durationSeconds: boundedInteger(input.durationSeconds, defaults.durationSeconds, minimumDurationSeconds, MAX_PERFORMANCE_DURATION_SECONDS),
    rampSteps: boundedInteger(input.rampSteps, defaults.rampSteps, 1, MAX_PERFORMANCE_TOTAL_REQUESTS),
    spikeMultiplier: boundedInteger(input.spikeMultiplier, defaults.spikeMultiplier, 1, MAX_PERFORMANCE_CONCURRENCY),
    diagnosisScope
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
  const config = normalizePerformanceConfig(input.config, type);
  const safetyLimits = normalizePerformanceSafetyLimits(input.safetyLimits);
  if (type === DIAGNOSIS_TYPE) {
    const profile = diagnosisScopeProfile(config.diagnosisScope);
    safetyLimits.maxTotalRequests = profile.totalRequests;
    safetyLimits.maxDurationSeconds = Math.max(safetyLimits.maxDurationSeconds, profile.maxDurationSeconds);
  }
  return {
    environmentId: normalizeRunnerEnvironmentId(input.environmentId),
    allowEnvironmentMutation: input.allowEnvironmentMutation === true,
    config,
    safetyLimits
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
    diagnosis: {
      ...DEFAULT_PERFORMANCE_CONFIG,
      iterations: DEFAULT_DIAGNOSIS_TOTAL_REQUESTS,
      concurrency: DEFAULT_DIAGNOSIS_CONCURRENCY,
      spikeMultiplier: DEFAULT_DIAGNOSIS_SPIKE_MULTIPLIER
    },
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
        passphrase: certificate.passphrase == null ? '' : String(certificate.passphrase),
        passphraseSecretKey: certificate.passphraseSecretKey == null ? '' : String(certificate.passphraseSecretKey),
        enabled: certificate.enabled !== false,
        host: certificate.host == null ? '' : String(certificate.host),
        port: certificate.port == null ? '' : String(certificate.port)
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
      visitor(entry.value, collection, null, []);
    } else {
      walkFolderRequests(entry.value, collection, visitor, []);
    }
  }
}

function walkFolderRequests(folder, collection, visitor, parentPath = []) {
  const folderPath = [...parentPath, folder].filter(Boolean);
  for (const entry of orderedChildren(folder)) {
    if (entry.kind === 'request') {
      visitor(entry.value, collection, folder, folderPath);
    } else {
      walkFolderRequests(entry.value, collection, visitor, folderPath);
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
  DEFAULT_AUTH_REFRESH,
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
  normalizeAuthRefreshConfig,
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
