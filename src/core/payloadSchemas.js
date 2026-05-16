const PAYLOAD_SCHEMA_VERSION = 1;

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const BODY_TYPE_VALUES = [
  'NONE',
  'RAW_JSON',
  'RAW_TEXT',
  'RAW_JAVASCRIPT',
  'RAW_HTML',
  'RAW_XML',
  'FORM_DATA',
  'URLENCODED',
  'BINARY'
];
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
const AUTH_REFRESH_MODES = ['auto', 'lifetime', 'interval'];
const AUTH_REFRESH_SCOPES = ['environment', 'collection', 'globals'];
const AUTH_REFRESH_FAILURE_POLICIES = ['abort', 'continue'];
const AUTH_REFRESH_TYPES = ['bearer', 'oauth2', 'apiKey', 'cookie', 'aws', 'custom'];
const AUTH_REFRESH_OUTPUT_SOURCES = ['body', 'header', 'cookie'];
const AUTH_REFRESH_OUTPUT_SLOTS = [
  'accessToken',
  'refreshToken',
  'apiKey',
  'cookie',
  'awsAccessKey',
  'awsSecretKey',
  'awsSessionToken',
  'custom'
];
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
const COLLECTION_EXPORT_FORMATS = ['postmeter', 'postman', 'openapi', 'curl'];
const PERFORMANCE_TEST_TYPES = ['diagnosis', 'latency', 'throughput', 'concurrency', 'stress', 'spike', 'soak', 'ramp'];
const PERFORMANCE_DIAGNOSIS_SCOPES = ['quick', 'medium', 'extended'];
const PERFORMANCE_EXPORT_FORMATS = ['postmeter', 'json', 'csv', 'html'];
const THEME_VALUES = ['system', 'light', 'dark'];
const TYPOGRAPHY_FONT_VALUES = [
  'default',
  'system',
  'segoe-ui',
  'arial',
  'helvetica',
  'verdana',
  'tahoma',
  'georgia',
  'system-mono',
  'jetbrains-mono',
  'sf-mono',
  'consolas',
  'menlo',
  'monaco',
  'courier-new'
];
const INTERFACE_FONT_VALUES = TYPOGRAPHY_FONT_VALUES;
const EDITOR_FONT_VALUES = TYPOGRAPHY_FONT_VALUES;
const DIAGNOSTIC_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const LIMITS = {
  collections: 500,
  foldersPerLevel: 500,
  requestsPerLevel: 1000,
  runners: 500,
  performanceTests: 500,
  environments: 500,
  history: 1000,
  runnerIterations: 1000000,
  pairs: 1000,
  cookies: 2000,
  folderDepth: 20,
  name: 256,
  url: 8192,
  key: 512,
  value: 32768,
  body: 10 * 1024 * 1024,
  resultJson: 10 * 1024 * 1024,
  host: 253,
  method: 12,
  short: 64,
  tiny: 16
};
const SCHEMA_ENUMS = {
  apiKeyLocations: API_KEY_LOCATIONS,
  authRefreshFailurePolicies: AUTH_REFRESH_FAILURE_POLICIES,
  authRefreshModes: AUTH_REFRESH_MODES,
  authRefreshOutputSlots: AUTH_REFRESH_OUTPUT_SLOTS,
  authRefreshOutputSources: AUTH_REFRESH_OUTPUT_SOURCES,
  authRefreshScopes: AUTH_REFRESH_SCOPES,
  authRefreshTypes: AUTH_REFRESH_TYPES,
  authTypes: AUTH_TYPE_VALUES,
  bodyMethods: BODY_METHODS,
  bodyTypes: BODY_TYPE_VALUES,
  collectionExportFormats: COLLECTION_EXPORT_FORMATS,
  csvVariableSources: ['', 'file', 'inline'],
  performanceDiagnosisScopes: PERFORMANCE_DIAGNOSIS_SCOPES,
  performanceExportFormats: PERFORMANCE_EXPORT_FORMATS,
  performanceTestTypes: PERFORMANCE_TEST_TYPES,
  cookiePriorities: ['', 'Low', 'Medium', 'High'],
  diagnosticLogLevels: DIAGNOSTIC_LOG_LEVELS,
  editorFontValues: EDITOR_FONT_VALUES,
  httpMethods: HTTP_METHODS,
  interfaceFontValues: INTERFACE_FONT_VALUES,
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
    theme: { type: 'string', limit: 'tiny', enum: 'themeValues', optional: true },
    interfaceFont: { type: 'string', limit: 'tiny', enum: 'interfaceFontValues', optional: true },
    interfaceFontSize: { type: 'number', optional: true },
    editorFont: { type: 'string', limit: 'tiny', enum: 'editorFontValues', optional: true },
    editorFontSize: { type: 'number', optional: true }
  },
  editorSettings: {
    lineNumbers: { type: 'boolean', optional: true },
    variableTooltipHints: { type: 'boolean', optional: true }
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
  tabSettings: {
    saveOnForceClose: { type: 'boolean', optional: true }
  },
  modalSettings: {
    closeOnBackdropClick: { type: 'boolean', optional: true }
  },
  tlsRequestSettings: {
    sslCertificateVerification: { type: 'boolean', optional: true },
    caCertificatePath: { type: 'string', limit: 'value', optional: true }
  },
  keyValue: {
    enabled: { type: 'boolean', optional: true },
    key: { type: 'string', limit: 'key', optional: true },
    value: { type: 'string', limit: 'value', optional: true }
  },
  requestAutoHeaders: {
    sendPostMeterToken: { type: 'boolean', optional: true },
    showGeneratedHeaders: { type: 'boolean', optional: true }
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
  historyEntry: {
    timestamp: { type: 'string', limit: 'name', optional: true },
    method: { type: 'string', limit: 'method', optional: true },
    url: { type: 'string', limit: 'url', optional: true },
    statusCode: { type: 'number', optional: true },
    durationMillis: { type: 'number', optional: true }
  },
  folder: {
    id: { type: 'string', limit: 'name', optional: true },
    name: { type: 'string', limit: 'name', optional: true },
    description: { type: 'string', limit: 'value', optional: true }
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
    allowEnvironmentMutation: { type: 'boolean', optional: true },
    stopOnFailure: { type: 'boolean', optional: true }
  },
  authRefresh: {
    enabled: { type: 'boolean', optional: true },
    mode: { type: 'string', limit: 'short', enum: 'authRefreshModes', optional: true },
    authType: { type: 'string', limit: 'short', enum: 'authRefreshTypes', optional: true },
    targetScope: { type: 'string', limit: 'short', enum: 'authRefreshScopes', optional: true },
    accessTokenVariable: { type: 'string', limit: 'key', optional: true },
    refreshTokenVariable: { type: 'string', limit: 'key', optional: true },
    expiresAtVariable: { type: 'string', limit: 'key', optional: true },
    accessTokenPath: { type: 'string', limit: 'value', optional: true },
    refreshTokenPath: { type: 'string', limit: 'value', optional: true },
    expiresInPath: { type: 'string', limit: 'value', optional: true },
    expiresAtPath: { type: 'string', limit: 'value', optional: true },
    refreshWindowSeconds: { type: 'number', optional: true },
    tokenLifetimeSeconds: { type: 'number', optional: true },
    refreshIntervalSeconds: { type: 'number', optional: true },
    refreshBeforeRun: { type: 'boolean', optional: true },
    failurePolicy: { type: 'string', limit: 'short', enum: 'authRefreshFailurePolicies', optional: true }
  },
  authRefreshOutput: {
    slot: { type: 'string', limit: 'short', enum: 'authRefreshOutputSlots', optional: true },
    source: { type: 'string', limit: 'short', enum: 'authRefreshOutputSources', optional: true },
    path: { type: 'string', limit: 'value', optional: true },
    variable: { type: 'string', limit: 'key', optional: true }
  },
  csvVariables: {
    enabled: { type: 'boolean', optional: true },
    schema: { type: 'string', limit: 'value', optional: true },
    values: { type: 'string', limit: 'body', optional: true },
    filePath: { type: 'string', limit: 'url', optional: true },
    sourceName: { type: 'string', limit: 'name', optional: true },
    activeSource: { type: 'string', limit: 'tiny', enum: 'csvVariableSources', optional: true },
    reuseFirstRow: { type: 'boolean', optional: true },
    loopRows: { type: 'boolean', optional: true },
    continueWithoutRows: { type: 'boolean', optional: true }
  },
  performanceConfig: {
    iterations: { type: 'number', optional: true },
    startConcurrency: { type: 'number', optional: true },
    concurrency: { type: 'number', optional: true },
    durationSeconds: { type: 'number', optional: true },
    rampSteps: { type: 'number', optional: true },
    spikeMultiplier: { type: 'number', optional: true },
    diagnosisScope: { type: 'string', limit: 'tiny', enum: 'performanceDiagnosisScopes', optional: true }
  },
  performanceSafetyLimits: {
    maxTotalRequests: { type: 'number', optional: true },
    maxConcurrency: { type: 'number', optional: true },
    maxDurationSeconds: { type: 'number', optional: true }
  },
  performanceResultsMetadata: {
    lastRunAt: { type: 'string', limit: 'name', optional: true },
    lastResultId: { type: 'string', limit: 'name', optional: true },
    lastStatus: { type: 'string', limit: 'short', optional: true },
    runCount: { type: 'number', optional: true },
    updatedAt: { type: 'string', limit: 'name', optional: true }
  },
  performanceTest: {
    id: { type: 'string', limit: 'name', optional: true },
    name: { type: 'string', limit: 'name', optional: true },
    type: { type: 'string', limit: 'short', enum: 'performanceTestTypes', optional: true },
    environmentId: { type: 'string', limit: 'name', optional: true },
    allowEnvironmentMutation: { type: 'boolean', optional: true }
  },
  performanceTestSource: {
    sourceType: { type: 'string', limit: 'short', optional: true },
    collectionId: { type: 'string', limit: 'name', optional: true },
    collectionName: { type: 'string', limit: 'name', optional: true },
    folderId: { type: 'string', limit: 'name', optional: true },
    folderName: { type: 'string', limit: 'name', optional: true },
    requestId: { type: 'string', limit: 'name', optional: true },
    requestName: { type: 'string', limit: 'name', optional: true },
    importedAt: { type: 'string', limit: 'name', optional: true }
  },
  performanceProgress: {
    kind: { type: 'string', limit: 'short', optional: true },
    phase: { type: 'string', limit: 'short', optional: true },
    phaseLabel: { type: 'string', limit: 'short', optional: true },
    message: { type: 'string', limit: 'value', optional: true },
    percent: { type: 'number', optional: true },
    phasePercent: { type: 'number', optional: true },
    targetRequestsPerSecond: { type: 'number', optional: true },
    completedRequests: { type: 'number', optional: true },
    totalRequests: { type: 'number', optional: true },
    activeRequests: { type: 'number', optional: true },
    requestId: { type: 'string', limit: 'name', optional: true },
    requestName: { type: 'string', limit: 'name', optional: true },
    passed: { type: 'boolean', optional: true },
    durationMillis: { type: 'number', optional: true },
    stageIndex: { type: 'number', optional: true },
    stageCount: { type: 'number', optional: true },
    pass: { type: 'number', optional: true },
    passes: { type: 'number', optional: true }
  },
  performanceResult: {
    id: { type: 'string', limit: 'name', optional: true },
    performanceTestId: { type: 'string', limit: 'name', optional: true },
    performanceTestName: { type: 'string', limit: 'name', optional: true },
    type: { type: 'string', limit: 'short', enum: 'performanceTestTypes', optional: true },
    environmentId: { type: 'string', limit: 'name', optional: true },
    environmentMutationAllowed: { type: 'boolean', optional: true },
    totalRequests: { type: 'number', optional: true },
    completedRequests: { type: 'number', optional: true },
    successfulRequests: { type: 'number', optional: true },
    failedRequests: { type: 'number', optional: true },
    passed: { type: 'boolean', optional: true },
    cancelled: { type: 'boolean', optional: true },
    startedAt: { type: 'string', limit: 'name', optional: true },
    completedAt: { type: 'string', limit: 'name', optional: true },
    durationMillis: { type: 'number', optional: true }
  },
  runner: {
    id: { type: 'string', limit: 'name', optional: true },
    name: { type: 'string', limit: 'name', optional: true },
    environmentId: { type: 'string', limit: 'name', optional: true },
    allowEnvironmentMutation: { type: 'boolean', optional: true },
    stopOnFailure: { type: 'boolean', optional: true }
  },
  runnerRequestSource: {
    collectionId: { type: 'string', limit: 'name', optional: true },
    collectionName: { type: 'string', limit: 'name', optional: true },
    folderId: { type: 'string', limit: 'name', optional: true },
    folderName: { type: 'string', limit: 'name', optional: true },
    requestId: { type: 'string', limit: 'name', optional: true },
    requestName: { type: 'string', limit: 'name', optional: true }
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
    runnerId: { type: 'string', limit: 'name', optional: true },
    runnerName: { type: 'string', limit: 'name', optional: true },
    runnerEnvironmentId: { type: 'string', limit: 'name', optional: true },
    environmentMutationAllowed: { type: 'boolean', optional: true },
    totalRequests: { type: 'number', optional: true },
    passedRequests: { type: 'number', optional: true },
    failedRequests: { type: 'number', optional: true },
    passed: { type: 'boolean', optional: true },
    cancelled: { type: 'boolean', optional: true }
  },
  collectionRunRequestResult: {
    requestId: { type: 'string', limit: 'name', optional: true },
    requestName: { type: 'string', limit: 'name', optional: true },
    requestDisplayName: { type: 'string', limit: 'name', optional: true },
    requestMethod: { type: 'string', limit: 'short', optional: true },
    requestUrl: { type: 'string', limit: 'url', optional: true },
    folderName: { type: 'string', limit: 'name', optional: true },
    startedAt: { type: 'string', limit: 'name', optional: true },
    runnerIteration: { type: 'number', optional: true },
    runnerIterations: { type: 'number', optional: true },
    statusCode: { type: 'number', optional: true },
    durationMillis: { type: 'number', optional: true },
    responseBody: { type: 'string', limit: 'value', optional: true },
    responseBytes: { type: 'number', optional: true },
    passed: { type: 'boolean', optional: true },
    error: { type: 'string', limit: 'value', optional: true }
  },
  certificate: {
    id: { type: 'string', limit: 'name', optional: true },
    name: { type: 'string', limit: 'name', optional: true },
    enabled: { type: 'boolean', optional: true },
    host: { type: 'string', limit: 'host', optional: true },
    port: { type: 'string', limit: 'short', optional: true },
    certPath: { type: 'string', limit: 'value', optional: true },
    keyPath: { type: 'string', limit: 'value', optional: true },
    pfxPath: { type: 'string', limit: 'value', optional: true },
    caPath: { type: 'string', limit: 'value', optional: true },
    passphrase: { type: 'string', limit: 'value', optional: true },
    passphraseSecretKey: { type: 'string', limit: 'name', optional: true },
    createdAt: { type: 'string', limit: 'name', optional: true },
    updatedAt: { type: 'string', limit: 'name', optional: true }
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
    refreshFailurePolicies: AUTH_REFRESH_FAILURE_POLICIES,
    refreshModes: AUTH_REFRESH_MODES,
    refreshOutputSlots: AUTH_REFRESH_OUTPUT_SLOTS,
    refreshOutputSources: AUTH_REFRESH_OUTPUT_SOURCES,
    refreshScopes: AUTH_REFRESH_SCOPES,
    refreshTypes: AUTH_REFRESH_TYPES,
    types: AUTH_TYPE_VALUES,
    apiKeyLocations: API_KEY_LOCATIONS,
    oauth2TokenTypes: OAUTH2_TOKEN_TYPES,
    oauth2GrantTypes: OAUTH2_GRANT_TYPES,
    oauth2RedirectStrategies: OAUTH2_REDIRECT_STRATEGIES,
    oauthProgressTypes: OAUTH_PROGRESS_TYPES,
    oauthProgressStatuses: OAUTH_PROGRESS_STATUSES
  },
  enums: SCHEMA_ENUMS,
  limits: LIMITS,
  fields: FIELD_SCHEMAS,
  entities: {
    request: {
      required: ['method', 'url'],
      arrays: ['queryParams', 'headers', 'variables', 'metadata', 'messages'],
      nested: ['auth', 'scripts', 'cookieJar', 'autoHeaders', 'settings']
    },
    workspace: {
      arrays: ['collections', 'environments', 'globals', 'cookies', 'runners', 'performanceTests', 'history'],
      nested: ['settings', 'localsettings']
    },
    response: {
      required: ['statusCode', 'headers', 'body', 'durationMillis', 'responseBytes', 'finalUrl']
    },
    runnerConfig: {
      optional: ['allowEnvironmentMutation', 'stopOnFailure']
    },
    runner: {
      arrays: ['requests'],
      nested: ['authRefresh', 'csvVariables']
    },
    performanceTest: {
      nested: ['request', 'source', 'config', 'safetyLimits', 'authRefresh', 'csvVariables', 'resultsMetadata']
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
  AUTH_REFRESH_FAILURE_POLICIES,
  AUTH_REFRESH_MODES,
  AUTH_REFRESH_OUTPUT_SLOTS,
  AUTH_REFRESH_OUTPUT_SOURCES,
  AUTH_REFRESH_SCOPES,
  AUTH_REFRESH_TYPES,
  AUTH_TYPE_VALUES,
  BODY_METHODS,
  BODY_TYPE_VALUES,
  COLLECTION_EXPORT_FORMATS,
  EDITOR_FONT_VALUES,
  FIELD_SCHEMAS,
  HTTP_METHODS,
  INTERFACE_FONT_VALUES,
  LIMITS,
  OAUTH2_GRANT_TYPES,
  OAUTH2_REDIRECT_STRATEGIES,
  OAUTH2_TOKEN_TYPES,
  OAUTH_PROGRESS_STATUSES,
  OAUTH_PROGRESS_TYPES,
  PAYLOAD_SCHEMA_VERSION,
  PERFORMANCE_EXPORT_FORMATS,
  PERFORMANCE_DIAGNOSIS_SCOPES,
  PERFORMANCE_TEST_TYPES,
  SCHEMA_ENUMS,
  THEME_VALUES,
  TYPOGRAPHY_FONT_VALUES,
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
