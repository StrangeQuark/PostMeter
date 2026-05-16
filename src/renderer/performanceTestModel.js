(function attachPerformanceTestModel(global) {
  const CSV_VARIABLES = global.PostMeterCsvVariables || {
    normalizeCsvVariableData: () => ({
      enabled: true,
      schema: '',
      values: '',
      filePath: '',
      sourceName: '',
      activeSource: '',
      reuseFirstRow: false,
      loopRows: false,
      continueWithoutRows: false
    })
  };
  const CAPTURE_POLICY = global.PostMeterResultCapturePolicy || {
    normalizeCapturePolicy: (value = {}) => ({
      responseBody: value.responseBody || 'all',
      bodyPreviewBytes: Number(value.bodyPreviewBytes || 32768),
      maxBodyPreviews: Number(value.maxBodyPreviews || 1000),
      preRequestOutput: value.preRequestOutput !== false,
      postRequestOutput: value.postRequestOutput !== false,
      scriptLogs: value.scriptLogs !== false,
      localVariables: value.localVariables !== false,
      responseHeaders: value.responseHeaders !== false,
      transportTimings: value.transportTimings !== false
    })
  };
  const PERFORMANCE_TEST_TYPES = [
    'diagnosis',
    'latency',
    'throughput',
    'concurrency',
    'stress',
    'spike',
    'soak',
    'ramp'
  ];

  const PERFORMANCE_TEST_TYPE_LABELS = {
    diagnosis: 'Full Endpoint Diagnosis',
    latency: 'Latency',
    throughput: 'RPS / throughput',
    concurrency: 'Concurrency',
    stress: 'Stress',
    spike: 'Spike',
    soak: 'Soak',
    ramp: 'Ramp'
  };
  const DEFAULT_DIAGNOSIS_SCOPE = 'quick';
  const DIAGNOSIS_SCOPE_PROFILES = {
    quick: { totalRequests: 44, maxDurationSeconds: 60 },
    medium: { totalRequests: 300, maxDurationSeconds: 300 },
    extended: { totalRequests: 1000, maxDurationSeconds: 900 }
  };

  const DEFAULT_PERFORMANCE_CONFIG = {
    diagnosis: { iterations: 44, startConcurrency: 1, concurrency: 5, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 2, diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE },
    latency: { iterations: 1, startConcurrency: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1, diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE },
    throughput: { iterations: 10, startConcurrency: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1, diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE },
    concurrency: { iterations: 10, startConcurrency: 1, concurrency: 5, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1, diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE },
    stress: { iterations: 10, startConcurrency: 1, concurrency: 10, durationSeconds: 0, rampSteps: 5, spikeMultiplier: 1, diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE },
    spike: { iterations: 20, startConcurrency: 1, concurrency: 2, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 3, diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE },
    soak: { iterations: 1, startConcurrency: 1, concurrency: 2, durationSeconds: 30, rampSteps: 1, spikeMultiplier: 1, diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE },
    ramp: { iterations: 10, startConcurrency: 1, concurrency: 10, durationSeconds: 0, rampSteps: 5, spikeMultiplier: 1, diagnosisScope: DEFAULT_DIAGNOSIS_SCOPE }
  };

  const DEFAULT_SAFETY_LIMITS = {
    maxTotalRequests: 100,
    maxConcurrency: 10,
    maxDurationSeconds: 60
  };
  const MAX_SAFETY_LIMITS = {
    maxTotalRequests: 1000000,
    maxConcurrency: 25,
    maxDurationSeconds: 60 * 60
  };
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
  const DEFAULT_AUTH_REFRESH_REQUEST_ID = 'auth-refresh-request';
  const DEFAULT_AUTH_REFRESH_TOKEN_REQUEST_ID = 'auth-refresh-token-request';
  const DEFAULT_AUTH_REFRESH = {
    enabled: false,
    mode: 'interval',
    authType: 'bearer',
    targetScope: 'environment',
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
  };

  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const BODY_TYPES = [
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

  function newPerformanceTestObject(name = 'New Performance Test') {
    return normalizePerformanceTest({
      id: randomId(),
      name: String(name || 'New Performance Test'),
      type: 'diagnosis',
      environmentId: 'none',
      allowEnvironmentMutation: false,
      request: normalizePerformanceRequest({ name: 'Performance Request' }),
      source: { sourceType: 'manual' },
      config: DEFAULT_PERFORMANCE_CONFIG.diagnosis,
      safetyLimits: DEFAULT_SAFETY_LIMITS,
      capturePolicy: CAPTURE_POLICY.normalizeCapturePolicy({}, 'performance'),
      authRefresh: normalizeAuthRefreshConfig(),
      typeSettings: defaultPerformanceTypeSettings(),
      csvVariables: CSV_VARIABLES.normalizeCsvVariableData(),
      resultsMetadata: {}
    });
  }

  function normalizeWorkspacePerformanceTests(value, workspace = {}) {
    return Array.isArray(value)
      ? value.filter((test) => test && typeof test === 'object').map((test) => normalizePerformanceTest(test, workspace))
      : [];
  }

  function normalizePerformanceTest(test, workspace = {}) {
    test.id = String(test.id || randomId());
    test.name = String(test.name || 'Untitled Performance Test');
    test.type = normalizePerformanceType(test.type);
    const legacyEnvironmentId = test.environmentId == null
      ? undefined
      : normalizePerformanceEnvironmentId(test.environmentId, workspace);
    const legacyMutation = test.allowEnvironmentMutation == null
      ? undefined
      : test.allowEnvironmentMutation === true;
    test.request = normalizePerformanceRequest(test.request || {});
    test.source = normalizePerformanceSource(test.source || test.importedSource);
    delete test.importedSource;
    const legacyConfig = test.config || test.options;
    delete test.options;
    const legacySafetyLimits = test.safetyLimits;
    test.typeSettings = normalizePerformanceTypeSettings(test.typeSettings, test.type, {
      environmentId: legacyEnvironmentId,
      allowEnvironmentMutation: legacyMutation,
      config: legacyConfig,
      safetyLimits: legacySafetyLimits
    }, workspace);
    syncPerformanceActiveTypeSettings(test);
    test.csvVariables = CSV_VARIABLES.normalizeCsvVariableData(test.csvVariables);
    test.capturePolicy = CAPTURE_POLICY.normalizeCapturePolicy(test.capturePolicy, 'performance', { diagnostic: test.type === 'diagnosis' });
    test.authRefresh = normalizeAuthRefreshConfig(test.authRefresh);
    test.resultsMetadata = normalizePerformanceResultsMetadata(test.resultsMetadata);
    return test;
  }

  function normalizePerformanceRequest(request = {}) {
    const method = String(request.method || 'GET').toUpperCase();
    return {
      id: String(request.id || randomId()),
      name: String(request.name || 'Performance Request'),
      protocol: String(request.protocol || 'http'),
      method: METHODS.includes(method) ? method : 'GET',
      url: String(request.url || ''),
      headers: Array.isArray(request.headers) ? cloneJson(request.headers) || [] : [],
      queryParams: Array.isArray(request.queryParams) ? cloneJson(request.queryParams) || [] : [],
      bodyType: BODY_TYPES.includes(request.bodyType) ? request.bodyType : 'NONE',
      body: String(request.body || ''),
      postmanBody: request.postmanBody && typeof request.postmanBody === 'object' ? cloneJson(request.postmanBody) || {} : {},
      graphql: request.graphql && typeof request.graphql === 'object' ? cloneJson(request.graphql) || {} : {},
      postman: request.postman && typeof request.postman === 'object' ? cloneJson(request.postman) || {} : {},
      auth: request.auth && typeof request.auth === 'object' ? cloneJson(request.auth) || { type: 'none' } : { type: 'none' },
      scripts: request.scripts && typeof request.scripts === 'object' ? cloneJson(request.scripts) || { preRequest: '', tests: '' } : { preRequest: '', tests: '' },
      variables: Array.isArray(request.variables) ? cloneJson(request.variables) || [] : [],
      docs: request.docs == null ? '' : String(request.docs),
      settings: request.settings && typeof request.settings === 'object'
        ? cloneJson(request.settings) || { sslCertificateVerification: 'inherit' }
        : { sslCertificateVerification: 'inherit' },
      cookieJar: request.cookieJar && typeof request.cookieJar === 'object'
        ? cloneJson(request.cookieJar) || { enabled: false, storeResponses: true }
        : { enabled: false, storeResponses: true },
      autoHeaders: normalizeRequestAutoHeaders(request.autoHeaders)
    };
  }

  function normalizeRequestAutoHeaders(autoHeaders = {}) {
    return {
      sendPostMeterToken: autoHeaders?.sendPostMeterToken === true,
      showGeneratedHeaders: autoHeaders?.showGeneratedHeaders === true
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
    const request = normalizeAuthRefreshRequest(requestInput, {
      id: DEFAULT_AUTH_REFRESH_REQUEST_ID,
      name: 'Refresh Auth'
    });
    const refreshTokenRequest = normalizeAuthRefreshRequest(refreshTokenRequestInput, {
      id: DEFAULT_AUTH_REFRESH_TOKEN_REQUEST_ID,
      name: 'Refresh Token'
    });
    return {
      enabled: input.enabled === true,
      mode: AUTH_REFRESH_MODES.includes(String(input.mode || '')) ? String(input.mode) : DEFAULT_AUTH_REFRESH.mode,
      authType: AUTH_REFRESH_TYPES.includes(String(input.authType || '')) ? String(input.authType) : DEFAULT_AUTH_REFRESH.authType,
      targetScope: AUTH_REFRESH_SCOPES.includes(String(input.targetScope || '')) ? String(input.targetScope) : DEFAULT_AUTH_REFRESH.targetScope,
      accessTokenVariable: normalizeAuthRefreshText(input.accessTokenVariable, DEFAULT_AUTH_REFRESH.accessTokenVariable, 512),
      refreshTokenVariable: normalizeAuthRefreshText(input.refreshTokenVariable, DEFAULT_AUTH_REFRESH.refreshTokenVariable, 512),
      expiresAtVariable: normalizeAuthRefreshText(input.expiresAtVariable, DEFAULT_AUTH_REFRESH.expiresAtVariable, 512),
      accessTokenPath: normalizeAuthRefreshText(input.accessTokenPath, DEFAULT_AUTH_REFRESH.accessTokenPath, 32768),
      refreshTokenPath: normalizeAuthRefreshText(input.refreshTokenPath, DEFAULT_AUTH_REFRESH.refreshTokenPath, 32768),
      expiresInPath: normalizeAuthRefreshText(input.expiresInPath, DEFAULT_AUTH_REFRESH.expiresInPath, 32768),
      expiresAtPath: normalizeAuthRefreshText(input.expiresAtPath, DEFAULT_AUTH_REFRESH.expiresAtPath, 32768),
      refreshWindowSeconds: clampInteger(input.refreshWindowSeconds, 0, 3600, DEFAULT_AUTH_REFRESH.refreshWindowSeconds),
      tokenLifetimeSeconds: clampInteger(input.tokenLifetimeSeconds, 1, 86400, DEFAULT_AUTH_REFRESH.tokenLifetimeSeconds),
      refreshIntervalSeconds: clampInteger(input.refreshIntervalSeconds, 1, 86400, DEFAULT_AUTH_REFRESH.refreshIntervalSeconds),
      refreshBeforeRun: input.refreshBeforeRun !== false,
      failurePolicy: AUTH_REFRESH_FAILURE_POLICIES.includes(String(input.failurePolicy || '')) ? String(input.failurePolicy) : DEFAULT_AUTH_REFRESH.failurePolicy,
      request,
      refreshTokenRequest,
      outputs: normalizeAuthRefreshOutputs(input.outputs, {
        accessTokenVariable: normalizeAuthRefreshText(input.accessTokenVariable, DEFAULT_AUTH_REFRESH.accessTokenVariable, 512),
        refreshTokenVariable: normalizeAuthRefreshText(input.refreshTokenVariable, DEFAULT_AUTH_REFRESH.refreshTokenVariable, 512),
        accessTokenPath: normalizeAuthRefreshText(input.accessTokenPath, DEFAULT_AUTH_REFRESH.accessTokenPath, 32768),
        refreshTokenPath: normalizeAuthRefreshText(input.refreshTokenPath, DEFAULT_AUTH_REFRESH.refreshTokenPath, 32768)
      })
    };
  }

  function normalizeAuthRefreshRequest(input = {}, defaults = {}) {
    const request = normalizePerformanceRequest({
      ...input,
      id: input.id || defaults.id,
      name: input.name || defaults.name || 'Refresh Auth',
      method: input.method || 'POST',
      url: input.url || ''
    });
    request.id = String(input.id || defaults.id);
    request.name = String(input.name || request.name || defaults.name || 'Refresh Auth');
    return request;
  }

  function normalizeAuthRefreshText(value, fallback, maxLength) {
    if (value == null) {
      return String(fallback || '').slice(0, maxLength);
    }
    return String(value).trim().slice(0, maxLength);
  }

  function normalizeAuthRefreshOutputs(outputs, fallbackConfig = DEFAULT_AUTH_REFRESH) {
    const source = Array.isArray(outputs)
      ? outputs
      : legacyAuthRefreshOutputs(fallbackConfig);
    const normalized = [];
    const seen = new Set();
    for (const output of source.slice(0, 20)) {
      const item = normalizeAuthRefreshOutput(output);
      if (!item.variable || !item.path) {
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
    const slot = String(input.slot || '');
    const source = String(input.source || '');
    return {
      slot: AUTH_REFRESH_OUTPUT_SLOTS.includes(slot) ? slot : 'custom',
      source: AUTH_REFRESH_OUTPUT_SOURCES.includes(source) ? source : 'body',
      path: normalizeAuthRefreshText(input.path, '', 32768),
      variable: normalizeAuthRefreshText(input.variable, '', 512)
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

  function cloneRequestForPerformanceTest(request, source = {}) {
    const clone = normalizePerformanceRequest(cloneJson(request) || {});
    clone.id = randomId();
    clone.name = String(clone.name || request?.name || 'Performance Request');
    return {
      request: clone,
      source: normalizePerformanceSource({
        ...source,
        sourceType: 'collection',
        requestId: source.requestId || request?.id,
        requestName: source.requestName || request?.name,
        importedAt: source.importedAt || new Date().toISOString()
      })
    };
  }

  function normalizePerformanceSource(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return { sourceType: 'manual' };
    }
    const normalized = {
      sourceType: String(source.sourceType || source.type || '').toLowerCase() === 'collection'
        ? 'collection'
        : 'manual'
    };
    for (const key of ['collectionId', 'collectionName', 'folderId', 'folderName', 'requestId', 'requestName', 'importedAt']) {
      const value = String(source[key] || '').trim();
      if (value) {
        normalized[key] = value.slice(0, key === 'importedAt' ? 256 : 512);
      }
    }
    if (Array.isArray(source.folderPath)) {
      const folderPath = source.folderPath
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 20);
      if (folderPath.length) {
        normalized.folderPath = folderPath;
      }
    }
    return normalized;
  }

  function normalizePerformanceConfig(config = {}, type = 'diagnosis') {
    const defaults = DEFAULT_PERFORMANCE_CONFIG[type] || DEFAULT_PERFORMANCE_CONFIG.diagnosis;
    const minimumDurationSeconds = type === 'soak' ? 1 : 0;
    const diagnosisScope = normalizeDiagnosisScope(config.diagnosisScope ?? defaults.diagnosisScope);
    const diagnosisProfile = diagnosisProfileForScope(diagnosisScope);
    return {
      iterations: type === 'diagnosis'
        ? diagnosisProfile.totalRequests
        : clampInteger(config.iterations, 1, MAX_SAFETY_LIMITS.maxTotalRequests, defaults.iterations),
      startConcurrency: clampInteger(config.startConcurrency, 1, MAX_SAFETY_LIMITS.maxConcurrency, defaults.startConcurrency),
      concurrency: clampInteger(config.concurrency ?? config.virtualUsers, 1, MAX_SAFETY_LIMITS.maxConcurrency, defaults.concurrency),
      durationSeconds: clampInteger(config.durationSeconds, minimumDurationSeconds, MAX_SAFETY_LIMITS.maxDurationSeconds, defaults.durationSeconds),
      rampSteps: clampInteger(config.rampSteps ?? config.rampUpSeconds, 1, MAX_SAFETY_LIMITS.maxTotalRequests, defaults.rampSteps),
      spikeMultiplier: clampInteger(config.spikeMultiplier, 1, MAX_SAFETY_LIMITS.maxConcurrency, defaults.spikeMultiplier),
      diagnosisScope
    };
  }

  function normalizeDiagnosisScope(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return DIAGNOSIS_SCOPE_PROFILES[normalized] ? normalized : DEFAULT_DIAGNOSIS_SCOPE;
  }

  function diagnosisProfileForScope(value) {
    return DIAGNOSIS_SCOPE_PROFILES[normalizeDiagnosisScope(value)];
  }

  function normalizePerformanceType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    if (!normalized) {
      return 'diagnosis';
    }
    if (normalized === 'load') {
      return 'latency';
    }
    return PERFORMANCE_TEST_TYPES.includes(normalized) ? normalized : 'latency';
  }

  function defaultPerformanceTypeSettings() {
    return normalizePerformanceTypeSettings();
  }

  function normalizePerformanceTypeSettings(typeSettings = {}, activeType = 'diagnosis', activeSettings = {}, workspace = {}) {
    const input = typeSettings && typeof typeSettings === 'object' && !Array.isArray(typeSettings) ? typeSettings : {};
    const hasTypeSettings = PERFORMANCE_TEST_TYPES.some((type) => input[type] && typeof input[type] === 'object' && !Array.isArray(input[type]));
    const settings = {};
    for (const type of PERFORMANCE_TEST_TYPES) {
      const candidate = input[type] && typeof input[type] === 'object' && !Array.isArray(input[type]) ? input[type] : {};
      settings[type] = normalizePerformanceTypeSetting(candidate, type, workspace);
    }
    if (PERFORMANCE_TEST_TYPES.includes(activeType) && (!hasTypeSettings || hasExplicitPerformanceActiveSettings(activeSettings))) {
      settings[activeType] = normalizePerformanceTypeSetting(mergePerformanceTypeSetting(settings[activeType], activeSettings), activeType, workspace);
    }
    return settings;
  }

  function normalizePerformanceTypeSetting(setting = {}, type = 'diagnosis', workspace = {}) {
    const input = setting && typeof setting === 'object' && !Array.isArray(setting) ? setting : {};
    const config = normalizePerformanceConfig(input.config, type);
    const safetyLimits = normalizePerformanceSafetyLimits(input.safetyLimits);
    if (type === 'diagnosis') {
      const profile = diagnosisProfileForScope(config.diagnosisScope);
      safetyLimits.maxTotalRequests = profile.totalRequests;
      safetyLimits.maxDurationSeconds = Math.max(safetyLimits.maxDurationSeconds, profile.maxDurationSeconds);
    }
    return {
      environmentId: normalizePerformanceEnvironmentId(input.environmentId, workspace),
      allowEnvironmentMutation: input.allowEnvironmentMutation === true,
      config,
      safetyLimits
    };
  }

  function normalizePerformanceEnvironmentId(environmentId, workspace = {}) {
    const normalized = String(environmentId || 'none') || 'none';
    if (normalized === 'none') {
      return 'none';
    }
    if (workspace?.environments && !(workspace.environments || []).some((environment) => environment.id === normalized)) {
      return 'none';
    }
    return normalized;
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

  function syncPerformanceActiveTypeSettings(test) {
    const type = PERFORMANCE_TEST_TYPES.includes(test?.type) ? test.type : 'diagnosis';
    test.typeSettings = normalizePerformanceTypeSettings(test?.typeSettings, type, {}, {});
    const activeSettings = test.typeSettings[type] || normalizePerformanceTypeSetting({}, type);
    test.environmentId = activeSettings.environmentId;
    test.allowEnvironmentMutation = activeSettings.allowEnvironmentMutation === true;
    test.config = normalizePerformanceConfig(activeSettings.config, type);
    test.safetyLimits = normalizePerformanceSafetyLimits(activeSettings.safetyLimits);
    return test;
  }

  function normalizePerformanceSafetyLimits(safetyLimits = {}) {
    return {
      maxTotalRequests: clampInteger(safetyLimits.maxTotalRequests, 1, MAX_SAFETY_LIMITS.maxTotalRequests, DEFAULT_SAFETY_LIMITS.maxTotalRequests),
      maxConcurrency: clampInteger(safetyLimits.maxConcurrency, 1, MAX_SAFETY_LIMITS.maxConcurrency, DEFAULT_SAFETY_LIMITS.maxConcurrency),
      maxDurationSeconds: clampInteger(safetyLimits.maxDurationSeconds, 1, MAX_SAFETY_LIMITS.maxDurationSeconds, DEFAULT_SAFETY_LIMITS.maxDurationSeconds)
    };
  }

  function normalizePerformanceResultsMetadata(metadata = {}) {
    return {
      lastRunAt: String(metadata.lastRunAt || '').slice(0, 256),
      lastResultId: String(metadata.lastResultId || '').slice(0, 256),
      lastStatus: String(metadata.lastStatus || '').slice(0, 64),
      runCount: clampInteger(metadata.runCount, 0, 100000, 0),
      updatedAt: String(metadata.updatedAt || '').slice(0, 256)
    };
  }

  function performanceTestSnapshot(test) {
    try {
      return JSON.stringify(test);
    } catch {
      return '{}';
    }
  }

  function typeLabel(type) {
    return PERFORMANCE_TEST_TYPE_LABELS[type] || PERFORMANCE_TEST_TYPE_LABELS.diagnosis;
  }

  function cloneJson(value) {
    if (value == null) {
      return null;
    }
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch {
        return null;
      }
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function clampInteger(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, number));
  }

  function randomId() {
    return global.crypto?.randomUUID?.() || `performance-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const exported = {
    DEFAULT_PERFORMANCE_CONFIG,
    DEFAULT_AUTH_REFRESH,
    DEFAULT_SAFETY_LIMITS,
    DIAGNOSIS_SCOPE_PROFILES,
    MAX_SAFETY_LIMITS,
    PERFORMANCE_TEST_TYPES,
    PERFORMANCE_TEST_TYPE_LABELS,
    cloneRequestForPerformanceTest,
    defaultPerformanceTypeSettings,
    newPerformanceTestObject,
    normalizePerformanceConfig,
    normalizePerformanceRequest,
    normalizePerformanceSafetyLimits,
    normalizePerformanceSource,
    normalizePerformanceTest,
    normalizePerformanceTypeSettings,
    normalizeAuthRefreshConfig,
    syncPerformanceActiveTypeSettings,
    normalizeWorkspacePerformanceTests,
    performanceTestSnapshot,
    typeLabel
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterPerformanceTestModel = exported;
})(typeof window === 'undefined' ? globalThis : window);
