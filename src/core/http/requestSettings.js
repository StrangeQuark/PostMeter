const crypto = require('node:crypto');

const DEFAULT_REQUEST_MAX_REDIRECTS = 10;
const MAX_REQUEST_MAX_REDIRECTS = 100;
const REQUEST_HTTP_VERSION_VALUES = new Set(['auto', 'http1', 'http2']);
const TLS_VERIFICATION_VALUES = new Set(['inherit', 'enabled', 'disabled']);
const TLS_PROTOCOL_ALIASES = new Map([
  ['tlsv1', 'TLSv1'],
  ['tlsv1.0', 'TLSv1'],
  ['tlsv1_0', 'TLSv1'],
  ['tls1', 'TLSv1'],
  ['tls1.0', 'TLSv1'],
  ['tlsv1.1', 'TLSv1.1'],
  ['tlsv1_1', 'TLSv1.1'],
  ['tls1.1', 'TLSv1.1'],
  ['tlsv1.2', 'TLSv1.2'],
  ['tlsv1_2', 'TLSv1.2'],
  ['tls1.2', 'TLSv1.2'],
  ['tlsv1.3', 'TLSv1.3'],
  ['tlsv1_3', 'TLSv1.3'],
  ['tls1.3', 'TLSv1.3']
]);
const TLS_PROTOCOL_SECURE_OPTIONS = new Map([
  ['TLSv1', crypto.constants.SSL_OP_NO_TLSv1],
  ['TLSv1.1', crypto.constants.SSL_OP_NO_TLSv1_1],
  ['TLSv1.2', crypto.constants.SSL_OP_NO_TLSv1_2],
  ['TLSv1.3', crypto.constants.SSL_OP_NO_TLSv1_3]
]);

function normalizeRequestSettings(settings = {}) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  return {
    sslCertificateVerification: normalizeVerificationOverride(
      source.sslCertificateVerification ?? source.sslVerification ?? source.strictSSL
    ),
    httpVersion: normalizeHttpVersion(source.httpVersion ?? source.protocol ?? source.protocolVersion),
    followRedirects: normalizeBoolean(source.followRedirects, true),
    followOriginalHttpMethod: normalizeBoolean(source.followOriginalHttpMethod, false),
    followAuthorizationHeader: normalizeBoolean(source.followAuthorizationHeader, false),
    removeRefererHeaderOnRedirect: normalizeBoolean(source.removeRefererHeaderOnRedirect, false),
    strictHttpParser: normalizeBoolean(source.strictHttpParser, true),
    encodeUrlAutomatically: normalizeBoolean(
      source.encodeUrlAutomatically ?? invertBooleanLike(source.disableUrlEncoding),
      true
    ),
    maxRedirects: normalizeMaxRedirects(source.maxRedirects ?? source.maximumNumberOfRedirects),
    useServerCipherSuiteDuringHandshake: normalizeBoolean(source.useServerCipherSuiteDuringHandshake, false),
    disabledTlsProtocols: normalizeDisabledTlsProtocols(
      source.disabledTlsProtocols
      ?? source.disabledTLSProtocols
      ?? source.tlsDisabledProtocols
      ?? source.disabledProtocols
      ?? source.tlsSslProtocolsDisabledDuringHandshake
    ),
    cipherSuiteSelection: normalizeCipherSuiteSelection(source.cipherSuiteSelection ?? source.cipherSuites ?? source.ciphers)
  };
}

function normalizeVerificationOverride(value) {
  if (value === true) {
    return 'enabled';
  }
  if (value === false) {
    return 'disabled';
  }
  const normalized = String(value || 'inherit').trim().toLowerCase();
  if (['disable', 'disabled', 'false', 'off', 'no'].includes(normalized)) {
    return 'disabled';
  }
  if (['enable', 'enabled', 'true', 'on', 'yes'].includes(normalized)) {
    return 'enabled';
  }
  return TLS_VERIFICATION_VALUES.has(normalized) ? normalized : 'inherit';
}

function normalizeHttpVersion(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (['auto', 'default', 'settings', 'system'].includes(normalized)) {
    return 'auto';
  }
  if (['http2', 'http/2', '2', 'h2'].includes(normalized)) {
    return 'http2';
  }
  if (['http1', 'http/1', 'http/1.1', 'http/1.x', 'http1.1', 'http1.x', '1', '1.1'].includes(normalized)) {
    return 'http1';
  }
  return 'auto';
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function invertBooleanLike(value) {
  const normalized = normalizeOptionalBoolean(value);
  return normalized == null ? undefined : !normalized;
}

function normalizeOptionalBoolean(value) {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function normalizeMaxRedirects(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_REQUEST_MAX_REDIRECTS;
  }
  return Math.max(0, Math.min(MAX_REQUEST_MAX_REDIRECTS, Math.floor(number)));
}

function normalizeDisabledTlsProtocols(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '')
      .split(/[\s,;]+/);
  const output = [];
  for (const item of values) {
    const normalized = TLS_PROTOCOL_ALIASES.get(String(item || '').trim().toLowerCase());
    if (normalized && !output.includes(normalized)) {
      output.push(normalized);
    }
  }
  return output;
}

function normalizeCipherSuiteSelection(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join(':').slice(0, 32768);
  }
  return String(value || '')
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(':')
    .slice(0, 32768);
}

function requestTransportTlsOptions(settings = {}) {
  const normalized = normalizeRequestSettings(settings);
  const tlsOptions = {};
  let secureOptions = 0;
  for (const protocol of normalized.disabledTlsProtocols) {
    secureOptions |= TLS_PROTOCOL_SECURE_OPTIONS.get(protocol) || 0;
  }
  if (secureOptions) {
    tlsOptions.secureOptions = secureOptions;
  }
  if (normalized.cipherSuiteSelection) {
    tlsOptions.ciphers = normalized.cipherSuiteSelection;
  }
  if (normalized.useServerCipherSuiteDuringHandshake) {
    tlsOptions.honorCipherOrder = true;
  }
  return tlsOptions;
}

function hasRequestTransportTlsOptions(settings = {}) {
  return Object.keys(requestTransportTlsOptions(settings)).length > 0;
}

function requestSettingsRequireNodeTransport(settings = {}) {
  const normalized = normalizeRequestSettings(settings);
  // The Node transport is the only path where the strict parser toggle can be honored.
  const parserRequiresNode = true;
  return parserRequiresNode
    || normalized.httpVersion === 'http2'
    || normalized.followOriginalHttpMethod === true
    || normalized.followAuthorizationHeader === true
    || normalized.removeRefererHeaderOnRedirect === true
    || normalized.maxRedirects !== DEFAULT_REQUEST_MAX_REDIRECTS
    || hasRequestTransportTlsOptions(normalized);
}

function postmanRequestSettingsFromProtocolProfile(profile = {}) {
  const source = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  return normalizeRequestSettings({
    sslCertificateVerification: source.strictSSL,
    httpVersion: source.httpVersion,
    followRedirects: source.followRedirects,
    followOriginalHttpMethod: source.followOriginalHttpMethod,
    followAuthorizationHeader: source.followAuthorizationHeader,
    removeRefererHeaderOnRedirect: source.removeRefererHeaderOnRedirect,
    strictHttpParser: source.strictHttpParser,
    disableUrlEncoding: source.disableUrlEncoding,
    maxRedirects: source.maxRedirects,
    useServerCipherSuiteDuringHandshake: source.useServerCipherSuiteDuringHandshake,
    disabledTlsProtocols: source.disabledTlsProtocols ?? source.disabledTLSProtocols ?? source.tlsDisabledProtocols ?? source.disabledProtocols,
    cipherSuiteSelection: source.cipherSuiteSelection ?? source.cipherSuites ?? source.ciphers
  });
}

function syncPostmanRequestSettingsProtocolProfile(protocolProfile, settings = {}) {
  const target = protocolProfile && typeof protocolProfile === 'object' && !Array.isArray(protocolProfile)
    ? protocolProfile
    : {};
  const normalized = normalizeRequestSettings(settings);
  syncProfileValue(target, 'strictSSL', normalized.sslCertificateVerification === 'inherit'
    ? undefined
    : normalized.sslCertificateVerification === 'enabled');
  syncProfileValue(target, 'httpVersion', normalized.httpVersion === 'auto' ? undefined : normalized.httpVersion);
  syncProfileValue(target, 'followRedirects', normalized.followRedirects === true ? undefined : false);
  syncProfileValue(target, 'followOriginalHttpMethod', normalized.followOriginalHttpMethod ? true : undefined);
  syncProfileValue(target, 'followAuthorizationHeader', normalized.followAuthorizationHeader ? true : undefined);
  syncProfileValue(target, 'removeRefererHeaderOnRedirect', normalized.removeRefererHeaderOnRedirect ? true : undefined);
  syncProfileValue(target, 'strictHttpParser', normalized.strictHttpParser ? true : undefined);
  syncProfileValue(target, 'disableUrlEncoding', normalized.encodeUrlAutomatically === true ? undefined : true);
  syncProfileValue(target, 'maxRedirects', normalized.maxRedirects === DEFAULT_REQUEST_MAX_REDIRECTS ? undefined : normalized.maxRedirects);
  syncProfileValue(target, 'useServerCipherSuiteDuringHandshake', normalized.useServerCipherSuiteDuringHandshake ? true : undefined);
  syncProfileValue(target, 'disabledTlsProtocols', normalized.disabledTlsProtocols.length ? normalized.disabledTlsProtocols.slice() : undefined);
  syncProfileValue(target, 'cipherSuiteSelection', normalized.cipherSuiteSelection || undefined);
  return target;
}

function syncProfileValue(target, key, value) {
  if (value == null || value === '') {
    delete target[key];
  } else {
    target[key] = value;
  }
}

function mergePostmanProtocolProfiles(...profiles) {
  const merged = {};
  for (const profile of profiles) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      continue;
    }
    Object.assign(merged, profile);
  }
  return merged;
}

module.exports = {
  DEFAULT_REQUEST_MAX_REDIRECTS,
  MAX_REQUEST_MAX_REDIRECTS,
  REQUEST_HTTP_VERSION_VALUES,
  hasRequestTransportTlsOptions,
  mergePostmanProtocolProfiles,
  normalizeRequestSettings,
  postmanRequestSettingsFromProtocolProfile,
  requestSettingsRequireNodeTransport,
  requestTransportTlsOptions,
  syncPostmanRequestSettingsProtocolProfile
};
