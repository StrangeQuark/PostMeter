(function attachResultCapturePolicy(global) {
  const RESPONSE_BODY_MODES = ['none', 'failed', 'sampled', 'all'];
  const DEFAULT_BODY_PREVIEW_BYTES = 32768;
  const MIN_BODY_PREVIEW_BYTES = 0;
  const MAX_BODY_PREVIEW_BYTES = 32768;
  const DEFAULT_MAX_BODY_PREVIEWS = 1000;
  const HIGH_VOLUME_REQUESTS = 100000;
  const VERY_HIGH_VOLUME_REQUESTS = 500000;
  const DEFAULT_RESULT_FILE_BUDGET_BYTES = 750 * 1024 * 1024;

  const DEFAULT_RUNNER_CAPTURE_POLICY = Object.freeze({
    responseBody: 'all',
    bodyPreviewBytes: DEFAULT_BODY_PREVIEW_BYTES,
    maxBodyPreviews: DEFAULT_MAX_BODY_PREVIEWS,
    preRequestOutput: true,
    postRequestOutput: true,
    scriptLogs: true,
    localVariables: true,
    responseHeaders: false,
    transportTimings: false,
    resultFileBudgetBytes: DEFAULT_RESULT_FILE_BUDGET_BYTES
  });

  const DEFAULT_PERFORMANCE_CAPTURE_POLICY = Object.freeze({
    responseBody: 'all',
    bodyPreviewBytes: DEFAULT_BODY_PREVIEW_BYTES,
    maxBodyPreviews: DEFAULT_MAX_BODY_PREVIEWS,
    preRequestOutput: true,
    postRequestOutput: true,
    scriptLogs: true,
    localVariables: true,
    responseHeaders: true,
    transportTimings: true,
    resultFileBudgetBytes: DEFAULT_RESULT_FILE_BUDGET_BYTES
  });

  function defaultCapturePolicy(kind = 'runner') {
    return { ...(kind === 'performance' ? DEFAULT_PERFORMANCE_CAPTURE_POLICY : DEFAULT_RUNNER_CAPTURE_POLICY) };
  }

  function normalizeCapturePolicy(value = {}, kind = 'runner', context = {}) {
    const defaults = defaultCapturePolicy(kind);
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = {
      responseBody: normalizeResponseBodyMode(input.responseBody ?? defaults.responseBody),
      bodyPreviewBytes: boundedInteger(input.bodyPreviewBytes, defaults.bodyPreviewBytes, MIN_BODY_PREVIEW_BYTES, MAX_BODY_PREVIEW_BYTES),
      maxBodyPreviews: boundedInteger(input.maxBodyPreviews, defaults.maxBodyPreviews, 0, 100000),
      preRequestOutput: input.preRequestOutput == null ? defaults.preRequestOutput : input.preRequestOutput === true,
      postRequestOutput: input.postRequestOutput == null ? defaults.postRequestOutput : input.postRequestOutput === true,
      scriptLogs: input.scriptLogs == null ? defaults.scriptLogs : input.scriptLogs === true,
      localVariables: input.localVariables == null ? defaults.localVariables : input.localVariables === true,
      responseHeaders: input.responseHeaders == null ? defaults.responseHeaders : input.responseHeaders === true,
      transportTimings: input.transportTimings == null ? defaults.transportTimings : input.transportTimings === true,
      resultFileBudgetBytes: boundedInteger(input.resultFileBudgetBytes, defaults.resultFileBudgetBytes, 100 * 1024 * 1024, 5 * 1024 * 1024 * 1024)
    };
    return applyCaptureGuardrails(normalized, kind, context);
  }

  function applyCaptureGuardrails(policy, kind = 'runner', context = {}) {
    const plannedRequests = Math.max(0, Number(context.plannedRequests || 0));
    const next = { ...policy, guardrailNotes: [] };
    if (plannedRequests >= VERY_HIGH_VOLUME_REQUESTS) {
      next.responseBody = next.responseBody === 'none' ? 'none' : 'failed';
      next.bodyPreviewBytes = Math.min(next.bodyPreviewBytes, 2048);
      next.maxBodyPreviews = Math.min(next.maxBodyPreviews, 500);
      next.preRequestOutput = false;
      next.postRequestOutput = false;
      next.scriptLogs = false;
      next.localVariables = false;
      next.responseHeaders = kind === 'performance' && context.diagnostic === true ? next.responseHeaders : false;
      next.transportTimings = kind === 'performance' ? next.transportTimings : false;
      next.guardrailNotes.push('Very high-volume mode limited optional detail capture.');
    } else if (plannedRequests >= HIGH_VOLUME_REQUESTS) {
      if (next.responseBody === 'all') {
        next.responseBody = 'failed';
      }
      next.bodyPreviewBytes = Math.min(next.bodyPreviewBytes, 4096);
      next.maxBodyPreviews = Math.min(next.maxBodyPreviews, 1000);
      next.scriptLogs = false;
      next.localVariables = false;
      next.guardrailNotes.push('High-volume mode disabled per-request heavy captures.');
    }
    return next;
  }

  function shouldCaptureResponseBody(policy, result, index = 0, totalRequests = 0) {
    const mode = normalizeResponseBodyMode(policy?.responseBody);
    if (mode === 'none' || Number(policy?.bodyPreviewBytes || 0) <= 0) {
      return false;
    }
    if (mode === 'all') {
      return true;
    }
    if (mode === 'failed') {
      return result?.passed !== true || Number(result?.statusCode || 0) >= 400 || Boolean(result?.error);
    }
    const maxPreviews = Math.max(0, Number(policy?.maxBodyPreviews || 0));
    if (!maxPreviews) {
      return false;
    }
    const total = Math.max(1, Number(totalRequests || 0));
    const interval = Math.max(1, Math.ceil(total / maxPreviews));
    return index < 10 || index % interval === 0;
  }

  function applyCapturePolicyToResult(result = {}, policy = {}, context = {}) {
    const index = Math.max(0, Number(context.index || 0));
    const totalRequests = Math.max(0, Number(context.totalRequests || 0));
    const next = { ...result };
    if (next.responseBody != null) {
      next.bodySha256 = hashText(next.responseBody);
    }
    if (!shouldCaptureResponseBody(policy, next, index, totalRequests)) {
      delete next.responseBody;
    } else if (next.responseBody != null) {
      next.responseBody = String(next.responseBody).slice(0, Math.max(0, Number(policy.bodyPreviewBytes || 0)));
    }
    if (policy.responseHeaders !== true) {
      delete next.responseHeaders;
    }
    if (policy.transportTimings !== true) {
      delete next.timings;
      delete next.tls;
    }
    if (policy.preRequestOutput !== true) {
      delete next.preRequestScriptResult;
    } else if (policy.scriptLogs !== true) {
      next.preRequestScriptResult = stripScriptLogs(next.preRequestScriptResult);
    }
    if (policy.postRequestOutput !== true) {
      delete next.testScriptResult;
      delete next.afterResponseScriptResult;
      delete next.messageScriptResults;
    } else if (policy.scriptLogs !== true) {
      next.testScriptResult = stripScriptLogs(next.testScriptResult);
      next.afterResponseScriptResult = stripScriptLogs(next.afterResponseScriptResult);
      if (Array.isArray(next.messageScriptResults)) {
        next.messageScriptResults = next.messageScriptResults.map(stripScriptLogs);
      }
    }
    if (policy.localVariables !== true) {
      delete next.localVariables;
    }
    return next;
  }

  function stripScriptLogs(scriptResult) {
    if (!scriptResult || typeof scriptResult !== 'object' || Array.isArray(scriptResult)) {
      return scriptResult;
    }
    const next = { ...scriptResult };
    delete next.logs;
    delete next.visualizer;
    return next;
  }

  function normalizeResponseBodyMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return RESPONSE_BODY_MODES.includes(normalized) ? normalized : 'all';
  }

  function boundedInteger(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(numeric)));
  }

  function hashText(value) {
    const text = String(value == null ? '' : value);
    if (!text) {
      return '';
    }
    if (typeof require === 'function') {
      try {
        return require('node:crypto').createHash('sha256').update(text).digest('hex');
      } catch {
        return '';
      }
    }
    return '';
  }

  const exported = {
    DEFAULT_BODY_PREVIEW_BYTES,
    DEFAULT_RESULT_FILE_BUDGET_BYTES,
    HIGH_VOLUME_REQUESTS,
    MAX_BODY_PREVIEW_BYTES,
    RESPONSE_BODY_MODES,
    VERY_HIGH_VOLUME_REQUESTS,
    applyCaptureGuardrails,
    applyCapturePolicyToResult,
    defaultCapturePolicy,
    normalizeCapturePolicy,
    shouldCaptureResponseBody
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterResultCapturePolicy = exported;
})(typeof window === 'undefined' ? globalThis : window);
