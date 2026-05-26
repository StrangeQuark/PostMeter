const DEFAULT_RESPONSE_LIMITS = Object.freeze({
  maxCompressedBytes: 10 * 1024 * 1024,
  maxDecompressedBytes: 20 * 1024 * 1024,
  maxTextDecodeBytes: 20 * 1024 * 1024,
  maxScriptVisibleBodyBytes: 512 * 1024
});

function normalizeResponseLimits(options = {}) {
  return {
    maxCompressedBytes: positiveInteger(options.maxCompressedBytes, DEFAULT_RESPONSE_LIMITS.maxCompressedBytes),
    maxDecompressedBytes: positiveInteger(options.maxDecompressedBytes, DEFAULT_RESPONSE_LIMITS.maxDecompressedBytes),
    maxTextDecodeBytes: positiveInteger(options.maxTextDecodeBytes, DEFAULT_RESPONSE_LIMITS.maxTextDecodeBytes),
    maxScriptVisibleBodyBytes: positiveInteger(options.maxScriptVisibleBodyBytes, DEFAULT_RESPONSE_LIMITS.maxScriptVisibleBodyBytes)
  };
}

function assertContentLengthWithinLimit(headers, limit, label = 'response') {
  const value = headerValue(headers, 'content-length');
  if (value == null || value === '') {
    return;
  }
  const contentLength = Number(value);
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw responseTooLargeError(`${label} exceeds the configured size limit.`);
  }
}

function responseTooLargeError(message = 'Response exceeds the configured size limit.') {
  const error = new Error(message);
  error.code = 'POSTMETER_RESPONSE_TOO_LARGE';
  return error;
}

function headerValue(headers, name) {
  const target = String(name || '').toLowerCase();
  if (!headers) {
    return '';
  }
  if (typeof headers.get === 'function') {
    return headers.get(target) || headers.get(name) || '';
  }
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === target);
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

module.exports = {
  DEFAULT_RESPONSE_LIMITS,
  assertContentLengthWithinLimit,
  normalizeResponseLimits,
  responseTooLargeError
};
