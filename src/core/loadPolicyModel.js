(function attachLoadPolicyModel(global) {
  const { normalizeSchemaEnumValue } = resolvePayloadSchemas(global);
  const DEFAULT_LOAD_POLICY = Object.freeze({
    concurrency: 5,
    totalRequests: 25,
    durationSeconds: 0,
    rampUpSeconds: 0,
    targetRatePerSecond: 0,
    maxRatePerSecond: 0,
    executionMode: 'singleProcess',
    workerProcesses: 2,
    recordSamples: false
  });

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

  function defaultLoadPolicy() {
    return { ...DEFAULT_LOAD_POLICY };
  }

  function defaultRequestLoadPolicy() {
    return {
      enabled: false,
      ...defaultLoadPolicy()
    };
  }

  function normalizeLoadPolicy(policy) {
    return {
      concurrency: boundedInteger(policy?.concurrency, DEFAULT_LOAD_POLICY.concurrency, 1, 512),
      totalRequests: boundedInteger(policy?.totalRequests, DEFAULT_LOAD_POLICY.totalRequests, 1, 100000),
      durationSeconds: boundedNumber(policy?.durationSeconds, DEFAULT_LOAD_POLICY.durationSeconds, 0, 3600),
      rampUpSeconds: boundedNumber(policy?.rampUpSeconds, DEFAULT_LOAD_POLICY.rampUpSeconds, 0, 3600),
      targetRatePerSecond: boundedNumber(policy?.targetRatePerSecond, DEFAULT_LOAD_POLICY.targetRatePerSecond, 0, 10000),
      maxRatePerSecond: boundedNumber(policy?.maxRatePerSecond, DEFAULT_LOAD_POLICY.maxRatePerSecond, 0, 10000),
      executionMode: normalizeSchemaEnumValue('loadExecutionModes', policy?.executionMode, 'singleProcess'),
      workerProcesses: boundedInteger(policy?.workerProcesses, DEFAULT_LOAD_POLICY.workerProcesses, 1, 8),
      recordSamples: policy?.recordSamples === true
    };
  }

  function normalizeRequestLoadPolicy(policy) {
    return {
      enabled: policy?.enabled === true,
      ...normalizeLoadPolicy(policy)
    };
  }

  function resolvePayloadSchemas(runtimeGlobal) {
    if (runtimeGlobal?.PostMeterPayloadSchemas) {
      return runtimeGlobal.PostMeterPayloadSchemas;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./payloadSchemas');
    }
    throw new Error('PostMeter payload schema metadata must load before loadPolicyModel.js.');
  }

  const exported = {
    boundedInteger,
    boundedNumber,
    defaultLoadPolicy,
    defaultRequestLoadPolicy,
    normalizeLoadPolicy,
    normalizeRequestLoadPolicy
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterLoadPolicyModel = exported;
})(typeof window === 'undefined' ? globalThis : window);
