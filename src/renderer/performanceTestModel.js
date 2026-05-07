(function attachPerformanceTestModel(global) {
  const PERFORMANCE_TEST_TYPES = [
    'latency',
    'throughput',
    'concurrency',
    'stress',
    'spike',
    'soak',
    'ramp'
  ];

  const PERFORMANCE_TEST_TYPE_LABELS = {
    latency: 'Latency',
    throughput: 'RPS / throughput',
    concurrency: 'Concurrency',
    stress: 'Stress',
    spike: 'Spike',
    soak: 'Soak',
    ramp: 'Ramp'
  };

  const DEFAULT_PERFORMANCE_CONFIG = {
    latency: { iterations: 1, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    throughput: { iterations: 10, concurrency: 1, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    concurrency: { iterations: 10, concurrency: 5, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    stress: { iterations: 25, concurrency: 5, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 1 },
    spike: { iterations: 20, concurrency: 2, durationSeconds: 0, rampSteps: 1, spikeMultiplier: 3 },
    soak: { iterations: 30, concurrency: 2, durationSeconds: 30, rampSteps: 1, spikeMultiplier: 1 },
    ramp: { iterations: 20, concurrency: 5, durationSeconds: 0, rampSteps: 5, spikeMultiplier: 1 }
  };

  const DEFAULT_SAFETY_LIMITS = {
    maxTotalRequests: 100,
    maxConcurrency: 10,
    maxDurationSeconds: 60
  };

  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  function newPerformanceTestObject(name = 'New Performance Test') {
    return normalizePerformanceTest({
      id: randomId(),
      name: String(name || 'New Performance Test'),
      type: 'latency',
      environmentId: 'none',
      allowEnvironmentMutation: false,
      request: normalizePerformanceRequest({ name: 'Performance Request' }),
      source: { sourceType: 'manual' },
      config: DEFAULT_PERFORMANCE_CONFIG.latency,
      safetyLimits: DEFAULT_SAFETY_LIMITS,
      typeSettings: defaultPerformanceTypeSettings(),
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
    test.type = PERFORMANCE_TEST_TYPES.includes(test.type) ? test.type : 'latency';
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
      bodyType: ['NONE', 'RAW_JSON', 'RAW_TEXT'].includes(request.bodyType) ? request.bodyType : 'NONE',
      body: String(request.body || ''),
      auth: request.auth && typeof request.auth === 'object' ? cloneJson(request.auth) || { type: 'none' } : { type: 'none' },
      scripts: request.scripts && typeof request.scripts === 'object' ? cloneJson(request.scripts) || { preRequest: '', tests: '' } : { preRequest: '', tests: '' },
      assertions: Array.isArray(request.assertions) ? cloneJson(request.assertions) || [] : [],
      variables: Array.isArray(request.variables) ? cloneJson(request.variables) || [] : [],
      examples: Array.isArray(request.examples) ? cloneJson(request.examples) || [] : [],
      cookieJar: request.cookieJar && typeof request.cookieJar === 'object'
        ? cloneJson(request.cookieJar) || { enabled: false, storeResponses: true }
        : { enabled: false, storeResponses: true }
    };
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

  function normalizePerformanceConfig(config = {}, type = 'latency') {
    const defaults = DEFAULT_PERFORMANCE_CONFIG[type] || DEFAULT_PERFORMANCE_CONFIG.latency;
    return {
      iterations: clampInteger(config.iterations, 1, 100000, defaults.iterations),
      concurrency: clampInteger(config.concurrency ?? config.virtualUsers, 1, 100000, defaults.concurrency),
      durationSeconds: clampInteger(config.durationSeconds, 0, 86400, defaults.durationSeconds),
      rampSteps: clampInteger(config.rampSteps ?? config.rampUpSeconds, 1, 100000, defaults.rampSteps),
      spikeMultiplier: clampInteger(config.spikeMultiplier, 1, 100000, defaults.spikeMultiplier)
    };
  }

  function defaultPerformanceTypeSettings() {
    return normalizePerformanceTypeSettings();
  }

  function normalizePerformanceTypeSettings(typeSettings = {}, activeType = 'latency', activeSettings = {}, workspace = {}) {
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

  function normalizePerformanceTypeSetting(setting = {}, type = 'latency', workspace = {}) {
    const input = setting && typeof setting === 'object' && !Array.isArray(setting) ? setting : {};
    return {
      environmentId: normalizePerformanceEnvironmentId(input.environmentId, workspace),
      allowEnvironmentMutation: input.allowEnvironmentMutation === true,
      config: normalizePerformanceConfig(input.config, type),
      safetyLimits: normalizePerformanceSafetyLimits(input.safetyLimits)
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
    const type = PERFORMANCE_TEST_TYPES.includes(test?.type) ? test.type : 'latency';
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
      maxTotalRequests: clampInteger(safetyLimits.maxTotalRequests, 1, 100000, DEFAULT_SAFETY_LIMITS.maxTotalRequests),
      maxConcurrency: clampInteger(safetyLimits.maxConcurrency, 1, 100000, DEFAULT_SAFETY_LIMITS.maxConcurrency),
      maxDurationSeconds: clampInteger(safetyLimits.maxDurationSeconds, 1, 86400, DEFAULT_SAFETY_LIMITS.maxDurationSeconds)
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
    return PERFORMANCE_TEST_TYPE_LABELS[type] || PERFORMANCE_TEST_TYPE_LABELS.latency;
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
    DEFAULT_SAFETY_LIMITS,
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
