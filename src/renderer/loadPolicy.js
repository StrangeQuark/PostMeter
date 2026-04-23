(function attachLoadPolicy(global) {
  const {
    boundedInteger,
    boundedNumber,
    defaultLoadPolicy,
    defaultRequestLoadPolicy,
    normalizeLoadPolicy
  } = global.PostMeterLoadPolicyModel || require('../core/loadPolicyModel');

  function loadPolicyFromControls(doc = document) {
    return normalizeLoadPolicy({
      concurrency: doc.getElementById('loadConcurrency').value,
      totalRequests: doc.getElementById('loadRequests').value,
      durationSeconds: doc.getElementById('loadDurationSeconds').value,
      rampUpSeconds: doc.getElementById('loadRampUpSeconds').value,
      targetRatePerSecond: doc.getElementById('loadTargetRate').value,
      maxRatePerSecond: doc.getElementById('loadMaxRate').value,
      executionMode: doc.getElementById('loadExecutionMode').value,
      workerProcesses: doc.getElementById('loadWorkerProcesses').value,
      recordSamples: doc.getElementById('loadRecordSamples').checked
    });
  }

  function loadConfigFromControls(doc = document) {
    const policy = loadPolicyFromControls(doc);
    return {
      concurrency: policy.concurrency,
      totalRequests: policy.totalRequests,
      durationSeconds: policy.durationSeconds,
      rampUpSeconds: policy.rampUpSeconds,
      targetRatePerSecond: policy.targetRatePerSecond,
      maxRatePerSecond: policy.maxRatePerSecond,
      executionMode: policy.executionMode,
      workerProcesses: policy.workerProcesses,
      recordSamples: policy.recordSamples
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      boundedInteger,
      boundedNumber,
      defaultLoadPolicy,
      defaultRequestLoadPolicy,
      loadConfigFromControls,
      loadPolicyFromControls,
      normalizeLoadPolicy
    };
  }

  global.PostMeterLoadPolicy = {
    defaultRequestLoadPolicy,
    loadConfigFromControls,
    loadPolicyFromControls,
    normalizeLoadPolicy
  };
})(typeof window === 'undefined' ? globalThis : window);
