const PAYLOAD_SCHEMA_VERSION = 1;

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const BODY_TYPE_VALUES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];
const AUTH_TYPE_VALUES = ['none', 'bearer', 'basic', 'apiKey', 'cookie', 'oauth2', 'clientCertificate'];
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
  'callbackReceived',
  'exchangingToken',
  'completed',
  'cancelled',
  'failed'
];
const LOAD_EXPORT_FORMATS = ['json', 'csv'];
const COLLECTION_EXPORT_FORMATS = ['postmeter', 'openapi', 'jmeter', 'curl', 'har'];
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

const FIELD_SCHEMAS = {
  keyValue: {
    enabled: { type: 'boolean', optional: true },
    secret: { type: 'boolean', optional: true },
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
    tests: { type: 'string', limit: 'body', optional: true }
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
    error: { type: 'string', limit: 'value', optional: true }
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
    finalUrl: { type: 'string', limit: 'url' }
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
    passphrase: { type: 'string', limit: 'value', optional: true }
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
  fields: FIELD_SCHEMAS,
  entities: {
    request: {
      required: ['method', 'url'],
      arrays: ['queryParams', 'headers', 'assertions', 'variables', 'examples'],
      nested: ['auth', 'scripts', 'cookieJar', 'loadTestPolicy']
    },
    workspace: {
      arrays: ['collections', 'environments', 'cookies', 'history'],
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

function oneOf(value, allowed, field) {
  const normalized = value == null ? '' : String(value);
  if (!allowed.includes(normalized)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return normalized;
}

module.exports = {
  API_KEY_LOCATIONS,
  ASSERTION_OPERATORS,
  ASSERTION_TYPES,
  AUTH_TYPE_VALUES,
  BODY_METHODS,
  BODY_TYPE_VALUES,
  COLLECTION_EXPORT_FORMATS,
  FIELD_SCHEMAS,
  HTTP_METHODS,
  LOAD_EXECUTION_MODES,
  LOAD_EXPORT_FORMATS,
  OAUTH2_GRANT_TYPES,
  OAUTH2_REDIRECT_STRATEGIES,
  OAUTH2_TOKEN_TYPES,
  OAUTH_PROGRESS_STATUSES,
  OAUTH_PROGRESS_TYPES,
  PAYLOAD_SCHEMA_VERSION,
  oneOf,
  payloadSchemas
};
