const PAYLOAD_SCHEMA_VERSION = 1;

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const BODY_TYPE_VALUES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];
const REQUEST_PROTOCOLS = ['http', 'graphql', 'grpc', 'websocket', 'socketio'];
const AUTH_TYPE_VALUES = [
  'none',
  'bearer',
  'basic',
  'apiKey',
  'cookie',
  'oauth2',
  'clientCertificate',
  'digest',
  'hawk',
  'aws',
  'oauth1',
  'ntlm',
  'akamaiEdgeGrid',
  'jwtBearer',
  'asap'
];
const API_KEY_LOCATIONS = ['header', 'query'];
const OAUTH2_TOKEN_TYPES = ['Bearer', 'MAC'];
const OAUTH2_GRANT_TYPES = ['authorizationCode', 'clientCredentials', 'deviceCode'];
const OAUTH2_REDIRECT_STRATEGIES = ['loopback', 'customScheme'];
const OAUTH_PROGRESS_TYPES = ['pkce', 'device'];
const OAUTH_PROGRESS_STATUSES = [
  'starting',
  'waitingForAuthorization',
  'waitingForUser',
  'polling',
  'callbackRejected',
  'callbackReceived',
  'exchangingToken',
  'completed',
  'cancelled',
  'failed'
];
const LOAD_EXPORT_FORMATS = ['json', 'csv'];
const COLLECTION_EXPORT_FORMATS = ['postmeter', 'postman', 'openapi', 'jmeter', 'curl', 'har'];
const THEME_VALUES = ['system', 'light', 'dark'];
const DIAGNOSTIC_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const ASSERTION_TYPES = [
  'statusCode',
  'header',
  'jsonPath',
  'xmlPath',
  'htmlSelector',
  'responseTime',
  'responseSize',
  'bodyContains',
  'extractVariable',
  'extractXml',
  'extractHtml',
  'extractRegex'
];
const ASSERTION_OPERATORS = ['equals', 'notEquals', 'contains', 'exists', 'lessThan', 'greaterThan'];
const LOAD_EXECUTION_MODES = ['singleProcess', 'multiProcess'];
const LIMITS = {
  collections: 500,
  foldersPerLevel: 500,
  requestsPerLevel: 1000,
  environments: 500,
  history: 1000,
  pairs: 1000,
  cookies: 2000,
  loadSamples: 50000,
  histogramBuckets: 100,
  folderDepth: 20,
  name: 256,
  url: 8192,
  key: 512,
  value: 32768,
  body: 10 * 1024 * 1024,
  loadResultJson: 10 * 1024 * 1024,
  host: 253,
  method: 12,
  short: 64,
  tiny: 16
};
const SCHEMA_ENUMS = {
  apiKeyLocations: API_KEY_LOCATIONS,
  assertionOperators: ASSERTION_OPERATORS,
  assertionTypes: ASSERTION_TYPES,
  authTypes: AUTH_TYPE_VALUES,
  bodyMethods: BODY_METHODS,
  bodyTypes: BODY_TYPE_VALUES,
  collectionExportFormats: COLLECTION_EXPORT_FORMATS,
    cookiePriorities: ['', 'Low', 'Medium', 'High'],
    diagnosticLogLevels: DIAGNOSTIC_LOG_LEVELS,
  httpMethods: HTTP_METHODS,
  loadExecutionModes: LOAD_EXECUTION_MODES,
  loadExportFormats: LOAD_EXPORT_FORMATS,
  oauth2GrantTypes: OAUTH2_GRANT_TYPES,
  oauth2RedirectStrategies: OAUTH2_REDIRECT_STRATEGIES,
  oauth2TokenTypes: OAUTH2_TOKEN_TYPES,
  oauthProgressStatuses: OAUTH_PROGRESS_STATUSES,
  oauthProgressTypes: OAUTH_PROGRESS_TYPES,
  requestProtocols: REQUEST_PROTOCOLS,
  sameSiteValues: ['', 'Lax', 'Strict', 'None'],
  themeValues: THEME_VALUES
};

const FIELD_SCHEMAS = {
  appearance: {
    theme: { type: 'string', limit: 'tiny', enum: 'themeValues', optional: true }
  },
  diagnosticsLogging: {
    enabled: { type: 'boolean', optional: true },
    level: { type: 'string', limit: 'tiny', enum: 'diagnosticLogLevels', optional: true }
  },
  requestResponseLoggingSettings: {
    bodies: { type: 'boolean', optional: true },
    cookies: { type: 'boolean', optional: true },
    headers: { type: 'boolean', optional: true },
    payloadIdentifiers: { type: 'boolean', optional: true },
    protocolMessages: { type: 'boolean', optional: true },
    scriptConsole: { type: 'boolean', optional: true },
    urls: { type: 'boolean', optional: true }
  },
  sandboxSettings: {
    sendRequest: { type: 'boolean', optional: true },
    cookies: { type: 'boolean', optional: true },
    vault: { type: 'boolean', optional: true }
  },
  keyValue: {
    enabled: { type: 'boolean', optional: true },
    key: { type: 'string', limit: 'key', optional: true },
    value: { type: 'string', limit: 'value', optional: true }
  },
  assertion: {
    enabled: { type: 'boolean', optional: true },
    type: { type: 'string', limit: 'short', enum: 'assertionTypes', optional: true },
    name: { type: 'string', limit: 'key', optional: true },
    path: { type: 'string', limit: 'key', optional: true },
    operator: { type: 'string', limit: 'short', enum: 'assertionOperators', optional: true },
    expected: { type: 'string', limit: 'value', optional: true },
    variableName: { type: 'string', limit: 'key', optional: true }
  },
  assertionResult: {
    passed: { type: 'boolean', optional: true },
    message: { type: 'string', limit: 'value', optional: true }
  },
  cookie: {
    id: { type: 'string', limit: 'name', optional: true },
    enabled: { type: 'boolean', optional: true },
    name: { type: 'string', limit: 'key', optional: true },
    value: { type: 'string', limit: 'value', optional: true },
    domain: { type: 'string', limit: 'host', optional: true },
    path: { type: 'string', limit: 'url', optional: true },
    expiresAt: { type: 'string', limit: 'name', optional: true },
    secure: { type: 'boolean', optional: true },
    httpOnly: { type: 'boolean', optional: true },
    sameSite: { type: 'string', limit: 'tiny', enum: 'sameSiteValues', optional: true },
    hostOnly: { type: 'boolean', optional: true },
    priority: { type: 'string', limit: 'tiny', enum: 'cookiePriorities', optional: true },
    partitioned: { type: 'boolean', optional: true },
    source: { type: 'string', limit: 'short', optional: true }
  },
  example: {
    id: { type: 'string', limit: 'name', optional: true },
    name: { type: 'string', limit: 'name', optional: true },
    statusCode: { type: 'number', optional: true },
    bodyType: { type: 'string', limit: 'short', enum: 'bodyTypes', optional: true },
    body: { type: 'string', limit: 'body', optional: true }
  },
  historyEntry: {
    timestamp: { type: 'string', limit: 'name', optional: true },
    method: { type: 'string', limit: 'method', optional: true },
    url: { type: 'string', limit: 'url', optional: true },
    statusCode: { type: 'number', optional: true },
    durationMillis: { type: 'number', optional: true }
  },
  folder: {
    id: { type: 'string', limit: 'name', optional: true },
    name: { type: 'string', limit: 'name', optional: true }
  },
  scripts: {
    preRequest: { type: 'string', limit: 'body', optional: true },
    tests: { type: 'string', limit: 'body', optional: true },
    beforeQuery: { type: 'string', limit: 'body', optional: true },
    afterResponse: { type: 'string', limit: 'body', optional: true },
    beforeInvoke: { type: 'string', limit: 'body', optional: true },
    onMessage: { type: 'string', limit: 'body', optional: true },
    onIncomingMessage: { type: 'string', limit: 'body', optional: true },
    mock: { type: 'string', limit: 'body', optional: true }
  },
  protocolMessage: {
    timestamp: { type: 'string', limit: 'name', optional: true },
    type: { type: 'string', limit: 'short', optional: true },
    name: { type: 'string', limit: 'name', optional: true }
  },
  requestCookieJar: {
    enabled: { type: 'boolean', optional: true },
    storeResponses: { type: 'boolean', optional: true }
  },
  loadPolicy: {
    enabled: { type: 'boolean', optional: true },
    concurrency: { type: 'number', optional: true },
    totalRequests: { type: 'number', optional: true },
    durationSeconds: { type: 'number', optional: true },
    rampUpSeconds: { type: 'number', optional: true },
    targetRatePerSecond: { type: 'number', optional: true },
    maxRatePerSecond: { type: 'number', optional: true },
    executionMode: { type: 'string', limit: 'short', enum: 'loadExecutionModes', optional: true },
    workerProcesses: { type: 'number', optional: true },
    recordSamples: { type: 'boolean', optional: true }
  },
  loadConfig: {
    concurrency: { type: 'number' },
    totalRequests: { type: 'number' },
    durationSeconds: { type: 'number', optional: true },
    rampUpSeconds: { type: 'number', optional: true },
    targetRatePerSecond: { type: 'number', optional: true },
    maxRatePerSecond: { type: 'number', optional: true },
    executionMode: { type: 'string', limit: 'short', enum: 'loadExecutionModes', optional: true },
    workerProcesses: { type: 'number', optional: true },
    recordSamples: { type: 'boolean', optional: true },
    confirmedHighConcurrency: { type: 'boolean', optional: true }
  },
  loadResult: {
    requestedRequests: { type: 'number', optional: true },
    totalRequests: { type: 'number', optional: true },
    successfulRequests: { type: 'number', optional: true },
    failedRequests: { type: 'number', optional: true },
    cancelled: { type: 'boolean', optional: true },
    mode: { type: 'string', limit: 'short', optional: true },
    durationSeconds: { type: 'number', optional: true },
    rampUpSeconds: { type: 'number', optional: true },
    targetRatePerSecond: { type: 'number', optional: true },
    maxRatePerSecond: { type: 'number', optional: true },
    executionMode: { type: 'string', limit: 'short', enum: 'loadExecutionModes', optional: true },
    workerProcesses: { type: 'number', optional: true },
    elapsedMillis: { type: 'number', optional: true },
    minMillis: { type: 'number', optional: true },
    maxMillis: { type: 'number', optional: true },
    averageMillis: { type: 'number', optional: true },
    p50Millis: { type: 'number', optional: true },
    p90Millis: { type: 'number', optional: true },
    p95Millis: { type: 'number', optional: true },
    p99Millis: { type: 'number', optional: true },
    errorRate: { type: 'number', optional: true },
    requestsPerSecond: { type: 'number', optional: true }
  },
  loadPolicyDecision: {
    scope: { type: 'string', limit: 'short', optional: true },
    host: { type: 'string', limit: 'host', optional: true },
    message: { type: 'string', limit: 'value' }
  },
  loadProgress: {
    completedRequests: { type: 'number', optional: true },
    requestedRequests: { type: 'number', optional: true },
    mode: { type: 'string', limit: 'short', optional: true },
    durationSeconds: { type: 'number', optional: true },
    targetRatePerSecond: { type: 'number', optional: true },
    maxRatePerSecond: { type: 'number', optional: true },
    executionMode: { type: 'string', limit: 'short', enum: 'loadExecutionModes', optional: true },
    workerProcesses: { type: 'number', optional: true },
    elapsedMillis: { type: 'number', optional: true },
    activeWorkers: { type: 'number', optional: true }
  },
  loadHistogramBucket: {
    upperBoundMillis: { type: 'number', optional: true },
    count: { type: 'number' }
  },
  loadSample: {
    index: { type: 'number', optional: true },
    workerIndex: { type: 'number', optional: true },
    workerProcess: { type: 'number', optional: true },
    startedAtMillis: { type: 'number', optional: true },
    durationMillis: { type: 'number', optional: true },
    success: { type: 'boolean', optional: true },
    statusCode: { type: 'number', optional: true },
    error: { type: 'string', limit: 'value', optional: true }
  },
  scriptRunResult: {
    passed: { type: 'boolean', optional: true },
    error: { type: 'string', limit: 'value', optional: true }
  },
  scriptTestResult: {
    name: { type: 'string', limit: 'name', optional: true },
    passed: { type: 'boolean', optional: true },
    error: { type: 'string', limit: 'value', optional: true },
    skipped: { type: 'boolean', optional: true },
    index: { type: 'number', optional: true }
  },
  scriptVisualizer: {
    html: { type: 'string', limit: 'body', optional: true },
    template: { type: 'string', limit: 'body', optional: true },
    interactive: { type: 'boolean', optional: true }
  },
  updateCheckOptions: {
    includePrereleases: { type: 'boolean', optional: true }
  },
  runnerConfig: {
    stopOnFailure: { type: 'boolean', optional: true }
  },
  runnerProgress: {
    completedRequests: { type: 'number', optional: true },
    totalRequests: { type: 'number', optional: true },
    requestId: { type: 'string', limit: 'name', optional: true },
    requestName: { type: 'string', limit: 'name', optional: true },
    passed: { type: 'boolean', optional: true }
  },
  oauthProgress: {
    id: { type: 'string', limit: 'name' },
    type: { type: 'string', limit: 'short', enum: 'oauthProgressTypes' },
    status: { type: 'string', limit: 'short', enum: 'oauthProgressStatuses', optional: true },
    message: { type: 'string', limit: 'value', optional: true },
    userCode: { type: 'string', limit: 'value', optional: true },
    verificationUri: { type: 'string', limit: 'value', optional: true },
    verificationUriComplete: { type: 'string', limit: 'value', optional: true },
    redirectUri: { type: 'string', limit: 'value', optional: true },
    nextAttemptAt: { type: 'string', limit: 'name', optional: true },
    expiresAt: { type: 'string', limit: 'name', optional: true }
  },
  externalUrl: {
    url: { type: 'string', limit: 'url' }
  },
  fileOperationResult: {
    cancelled: { type: 'boolean' },
    path: { type: 'string', limit: 'value', optional: true },
    backupPath: { type: 'string', limit: 'value', optional: true }
  },
  response: {
    statusCode: { type: 'number' },
    body: { type: 'string', limit: 'body' },
    durationMillis: { type: 'number' },
    responseBytes: { type: 'number' },
    finalUrl: { type: 'string', limit: 'url' },
    skipped: { type: 'boolean', optional: true },
    updatedAuthPersisted: { type: 'boolean', optional: true }
  },
  collectionRunResult: {
    collectionId: { type: 'string', limit: 'name', optional: true },
    collectionName: { type: 'string', limit: 'name', optional: true },
    totalRequests: { type: 'number', optional: true },
    passedRequests: { type: 'number', optional: true },
    failedRequests: { type: 'number', optional: true },
    passed: { type: 'boolean', optional: true },
    cancelled: { type: 'boolean', optional: true }
  },
  collectionRunRequestResult: {
    requestId: { type: 'string', limit: 'name', optional: true },
    requestName: { type: 'string', limit: 'name', optional: true },
    folderName: { type: 'string', limit: 'name', optional: true },
    startedAt: { type: 'string', limit: 'name', optional: true },
    statusCode: { type: 'number', optional: true },
    durationMillis: { type: 'number', optional: true },
    passed: { type: 'boolean', optional: true },
    error: { type: 'string', limit: 'value', optional: true }
  },
  certificate: {
    id: { type: 'string', limit: 'name', optional: true },
    name: { type: 'string', limit: 'name', optional: true },
    certPath: { type: 'string', limit: 'value', optional: true },
    keyPath: { type: 'string', limit: 'value', optional: true },
    pfxPath: { type: 'string', limit: 'value', optional: true },
    caPath: { type: 'string', limit: 'value', optional: true },
    passphrase: { type: 'string', limit: 'value', optional: true }
  },
  auth: {
    type: { type: 'string', limit: 'short', enum: 'authTypes' },
    token: { type: 'string', limit: 'value', optional: true },
    username: { type: 'string', limit: 'value', optional: true },
    password: { type: 'string', limit: 'value', optional: true },
    key: { type: 'string', limit: 'value', optional: true },
    value: { type: 'string', limit: 'value', optional: true },
    location: { type: 'string', limit: 'tiny', enum: 'apiKeyLocations', optional: true },
    accessToken: { type: 'string', limit: 'value', optional: true },
    refreshToken: { type: 'string', limit: 'value', optional: true },
    tokenType: { type: 'string', limit: 'tiny', enum: 'oauth2TokenTypes', optional: true },
    tokenUrl: { type: 'string', limit: 'value', optional: true },
    authorizationUrl: { type: 'string', limit: 'value', optional: true },
    deviceAuthorizationUrl: { type: 'string', limit: 'value', optional: true },
    clientId: { type: 'string', limit: 'value', optional: true },
    clientSecret: { type: 'string', limit: 'value', optional: true },
    scopes: { type: 'string', limit: 'value', optional: true },
    grantType: { type: 'string', limit: 'short', enum: 'oauth2GrantTypes', optional: true },
    redirectStrategy: { type: 'string', limit: 'short', enum: 'oauth2RedirectStrategies', optional: true },
    redirectUri: { type: 'string', limit: 'value', optional: true },
    expiresAt: { type: 'string', limit: 'value', optional: true },
    deviceCode: { type: 'string', limit: 'value', optional: true },
    userCode: { type: 'string', limit: 'value', optional: true },
    verificationUri: { type: 'string', limit: 'value', optional: true },
    verificationUriComplete: { type: 'string', limit: 'value', optional: true },
    deviceCodeExpiresAt: { type: 'string', limit: 'value', optional: true },
    devicePollIntervalSeconds: { type: 'string', limit: 'value', optional: true },
    certPath: { type: 'string', limit: 'value', optional: true },
    keyPath: { type: 'string', limit: 'value', optional: true },
    pfxPath: { type: 'string', limit: 'value', optional: true },
    caPath: { type: 'string', limit: 'value', optional: true },
    passphrase: { type: 'string', limit: 'value', optional: true },
    certificateId: { type: 'string', limit: 'name', optional: true },
    realm: { type: 'string', limit: 'value', optional: true },
    nonce: { type: 'string', limit: 'value', optional: true },
    algorithm: { type: 'string', limit: 'short', optional: true },
    qop: { type: 'string', limit: 'short', optional: true },
    opaque: { type: 'string', limit: 'value', optional: true },
    clientNonce: { type: 'string', limit: 'value', optional: true },
    nonceCount: { type: 'string', limit: 'short', optional: true },
    authId: { type: 'string', limit: 'value', optional: true },
    authKey: { type: 'string', limit: 'value', optional: true },
    user: { type: 'string', limit: 'value', optional: true },
    extraData: { type: 'string', limit: 'value', optional: true },
    app: { type: 'string', limit: 'value', optional: true },
    delegation: { type: 'string', limit: 'value', optional: true },
    accessKey: { type: 'string', limit: 'value', optional: true },
    secretKey: { type: 'string', limit: 'value', optional: true },
    region: { type: 'string', limit: 'value', optional: true },
    service: { type: 'string', limit: 'value', optional: true },
    sessionToken: { type: 'string', limit: 'value', optional: true },
    addAuthDataToQuery: { type: 'boolean', optional: true },
    consumerKey: { type: 'string', limit: 'value', optional: true },
    consumerSecret: { type: 'string', limit: 'value', optional: true },
    tokenSecret: { type: 'string', limit: 'value', optional: true },
    signatureMethod: { type: 'string', limit: 'short', optional: true },
    timestamp: { type: 'string', limit: 'value', optional: true },
    version: { type: 'string', limit: 'short', optional: true },
    domain: { type: 'string', limit: 'value', optional: true },
    workstation: { type: 'string', limit: 'value', optional: true },
    clientToken: { type: 'string', limit: 'value', optional: true },
    headersToSign: { type: 'string', limit: 'value', optional: true },
    privateKey: { type: 'string', limit: 'value', optional: true },
    secret: { type: 'string', limit: 'value', optional: true },
    issuer: { type: 'string', limit: 'value', optional: true },
    subject: { type: 'string', limit: 'value', optional: true },
    audience: { type: 'string', limit: 'value', optional: true },
    keyId: { type: 'string', limit: 'value', optional: true },
    expiresIn: { type: 'string', limit: 'short', optional: true },
    claims: { type: 'string', limit: 'value', optional: true },
    headerPrefix: { type: 'string', limit: 'short', optional: true },
    addTokenTo: { type: 'string', limit: 'short', optional: true },
    queryParamName: { type: 'string', limit: 'short', optional: true }
  }
};

const payloadSchemas = {
  version: PAYLOAD_SCHEMA_VERSION,
  formats: {
    collectionExport: COLLECTION_EXPORT_FORMATS
  },
  http: {
    methods: HTTP_METHODS,
    bodyMethods: BODY_METHODS,
    bodyTypes: BODY_TYPE_VALUES
  },
  auth: {
    types: AUTH_TYPE_VALUES,
    apiKeyLocations: API_KEY_LOCATIONS,
    oauth2TokenTypes: OAUTH2_TOKEN_TYPES,
    oauth2GrantTypes: OAUTH2_GRANT_TYPES,
    oauth2RedirectStrategies: OAUTH2_REDIRECT_STRATEGIES,
    oauthProgressTypes: OAUTH_PROGRESS_TYPES,
    oauthProgressStatuses: OAUTH_PROGRESS_STATUSES
  },
  assertions: {
    types: ASSERTION_TYPES,
    operators: ASSERTION_OPERATORS
  },
  load: {
    executionModes: LOAD_EXECUTION_MODES
  },
  enums: SCHEMA_ENUMS,
  limits: LIMITS,
  fields: FIELD_SCHEMAS,
  entities: {
    request: {
      required: ['method', 'url'],
      arrays: ['queryParams', 'headers', 'assertions', 'variables', 'examples', 'metadata', 'messages'],
      nested: ['auth', 'scripts', 'cookieJar', 'loadTestPolicy']
    },
  workspace: {
      arrays: ['collections', 'environments', 'globals', 'cookies', 'history'],
      nested: ['settings']
    },
    response: {
      required: ['statusCode', 'headers', 'body', 'durationMillis', 'responseBytes', 'finalUrl']
    },
    loadConfig: {
      required: ['concurrency', 'totalRequests'],
      optional: ['durationSeconds', 'rampUpSeconds', 'targetRatePerSecond', 'maxRatePerSecond', 'executionMode', 'workerProcesses', 'recordSamples', 'confirmedHighConcurrency']
    },
    runnerConfig: {
      optional: ['stopOnFailure']
    },
    runnerResult: {
      required: ['collectionId', 'collectionName', 'totalRequests', 'passedRequests', 'failedRequests', 'passed', 'cancelled', 'results']
    }
  }
};

function oneOf(value, allowed, field, options = {}) {
  const normalized = normalizeSchemaString(value, options);
  const allowedValues = Array.isArray(allowed) ? allowed : schemaEnum(allowed);
  if (!allowedValues.includes(normalized)) {
    throw new Error(`${field} must be one of: ${allowedValues.join(', ')}.`);
  }
  return normalized;
}

function schemaEnum(name) {
  const allowed = payloadSchemas.enums?.[name];
  if (!Array.isArray(allowed)) {
    throw new Error(`Unknown payload schema enum: ${name}.`);
  }
  return allowed;
}

function fieldLimit(name) {
  const limit = payloadSchemas.limits?.[name];
  if (!Number.isFinite(limit)) {
    throw new Error(`Unknown payload schema limit: ${name}.`);
  }
  return limit;
}

function hasSchemaEnumValue(name, value, options = {}) {
  return schemaEnum(name).includes(normalizeSchemaString(value, options));
}

function normalizeSchemaEnumValue(name, value, fallback, options = {}) {
  const normalized = normalizeSchemaString(value, options);
  return schemaEnum(name).includes(normalized) ? normalized : fallback;
}

function normalizeSchemaString(value, options = {}) {
  let normalized = value == null ? '' : String(value);
  if (options.trim === true) {
    normalized = normalized.trim();
  }
  if (typeof options.transform === 'function') {
    normalized = options.transform(normalized);
  }
  return normalized;
}

const exported = {
  API_KEY_LOCATIONS,
  ASSERTION_OPERATORS,
  ASSERTION_TYPES,
  AUTH_TYPE_VALUES,
  BODY_METHODS,
  BODY_TYPE_VALUES,
  COLLECTION_EXPORT_FORMATS,
  FIELD_SCHEMAS,
  HTTP_METHODS,
  LIMITS,
  LOAD_EXECUTION_MODES,
  LOAD_EXPORT_FORMATS,
  OAUTH2_GRANT_TYPES,
  OAUTH2_REDIRECT_STRATEGIES,
  OAUTH2_TOKEN_TYPES,
  OAUTH_PROGRESS_STATUSES,
  OAUTH_PROGRESS_TYPES,
  PAYLOAD_SCHEMA_VERSION,
  SCHEMA_ENUMS,
  THEME_VALUES,
  fieldLimit,
  hasSchemaEnumValue,
  normalizeSchemaEnumValue,
  oneOf,
  payloadSchemas,
  schemaEnum
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}

if (typeof globalThis !== 'undefined') {
  globalThis.PostMeterPayloadSchemas = exported;
}
