const path = require('node:path');
const tls = require('node:tls');
const { normalizeAuth } = require('./authModel');
const { resolveEnvironmentValue } = require('../workspace/environmentResolver');
const { extractPfxToPem, readRegularFileBounded } = require('./pfxCertificate');
const {
  normalizeRequestSettings,
  requestTransportTlsOptions
} = require('./requestSettings');

const DEFAULT_HTTPS_PORT = '443';

function normalizeRequestTlsSettings(settings = {}) {
  return normalizeRequestSettings(settings);
}

function normalizeTlsSettings(settings = {}) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const requestSource = source.request && typeof source.request === 'object' && !Array.isArray(source.request)
    ? source.request
    : source.tls && typeof source.tls === 'object' && !Array.isArray(source.tls)
      ? source.tls
      : source;
  return {
    sslCertificateVerification: normalizeGlobalVerification(requestSource),
    caCertificatePath: requestSource.caCertificatePath == null ? '' : String(requestSource.caCertificatePath).slice(0, 32768),
    clientCertificates: normalizeManagedClientCertificates(requestSource.clientCertificates)
  };
}

function normalizeGlobalVerification(source = {}) {
  if (source.sslCertificateVerification === false || source.sslVerification === false || source.strictSSL === false) {
    return false;
  }
  if (source.sslCertificateVerification === true || source.sslVerification === true || source.strictSSL === true) {
    return true;
  }
  const value = source.sslCertificateVerification ?? source.sslVerification ?? source.strictSSL;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['disabled', 'disable', 'false', 'off', 'no'].includes(normalized)) {
      return false;
    }
    if (['enabled', 'enable', 'true', 'on', 'yes'].includes(normalized)) {
      return true;
    }
  }
  return false;
}

function normalizeManagedClientCertificates(certificates) {
  if (!Array.isArray(certificates)) {
    return [];
  }
  const output = [];
  for (const certificate of certificates) {
    if (!certificate || typeof certificate !== 'object') {
      continue;
    }
    output.push({
      id: String(certificate.id || '').slice(0, 256) || `client-certificate-${output.length + 1}`,
      name: String(certificate.name || 'Client Certificate').slice(0, 256),
      enabled: certificate.enabled !== false,
      host: String(certificate.host || '').trim().slice(0, 253),
      port: normalizePort(certificate.port),
      matches: Array.isArray(certificate.matches) ? certificate.matches.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 1000) : [],
      certPath: stringPath(certificate.certPath),
      keyPath: stringPath(certificate.keyPath),
      pfxPath: stringPath(certificate.pfxPath),
      caPath: stringPath(certificate.caPath),
      passphrase: certificate.passphrase == null ? '' : String(certificate.passphrase).slice(0, 32768),
      passphraseSecretKey: certificate.passphraseSecretKey == null ? '' : String(certificate.passphraseSecretKey).slice(0, 256),
      createdAt: certificate.createdAt == null ? '' : String(certificate.createdAt).slice(0, 256),
      updatedAt: certificate.updatedAt == null ? '' : String(certificate.updatedAt).slice(0, 256)
    });
    if (output.length >= 1000) {
      break;
    }
  }
  return output;
}

function normalizePort(value) {
  if (value == null || value === '') {
    return '';
  }
  const normalized = String(value).trim();
  const number = Number(normalized);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    return '';
  }
  return String(number);
}

function stringPath(value) {
  return value == null ? '' : String(value).trim().slice(0, 32768);
}

async function resolveTlsSettingsSecrets(settings = {}, vault = null) {
  const normalized = normalizeTlsSettings(settings);
  if (!vault || typeof vault.get !== 'function') {
    return normalized;
  }
  const clientCertificates = [];
  for (const certificate of normalized.clientCertificates) {
    const next = { ...certificate };
    if (!next.passphrase && next.passphraseSecretKey) {
      const secret = await vault.get(next.passphraseSecretKey);
      if (secret != null) {
        next.passphrase = String(secret);
      }
    }
    clientCertificates.push(next);
  }
  return {
    ...normalized,
    clientCertificates
  };
}

async function resolveHttpTlsPolicy(request = {}, environment, url, options = {}) {
  const tlsSettings = normalizeTlsSettings(options.tlsSettings || {});
  const clientCertificates = [
    ...(options.clientCertificates || []),
    ...(tlsSettings.clientCertificates || [])
  ];
  const requestTlsSettings = normalizeRequestTlsSettings(request.settings || request.requestSettings || {});
  const verification = requestTlsSettings.sslCertificateVerification === 'inherit'
    ? (tlsSettings.sslCertificateVerification !== false ? 'enabled' : 'disabled')
    : requestTlsSettings.sslCertificateVerification;
  const rejectUnauthorized = verification !== 'disabled';
  if (url.protocol !== 'https:') {
    return {
      hasClientCertificate: false,
      tlsOptions: null,
      tlsDiagnostics: null
    };
  }

  const caParts = [];
  const globalCaPath = resolveEnvironmentValue(tlsSettings.caCertificatePath, environment).trim();
  if (globalCaPath) {
    caParts.push(await readCertificateFile(globalCaPath, 'CA certificate'));
  }
  const requestAuth = normalizeAuth(request.auth);
  const explicitCertificateId = requestAuth.type === 'clientCertificate'
    ? resolveEnvironmentValue(requestAuth.certificateId, environment).trim()
    : '';
  const explicitCertificateBinding = explicitCertificateId
    ? clientCertificates.find((certificate) => certificate?.enabled !== false && String(certificate?.id || '') === explicitCertificateId)
    : null;
  const explicitClientCertificate = requestAuth.type === 'clientCertificate'
    ? await loadClientCertificateOptions(requestAuth, environment, url, clientCertificates)
    : null;
  const matchedClientCertificate = explicitClientCertificate
    ? null
    : await loadMatchedClientCertificateOptions(url, environment, clientCertificates);
  const clientCertificateOptions = explicitClientCertificate || matchedClientCertificate?.tlsOptions || null;
  const requestTransportOptions = requestTransportTlsOptions(requestTlsSettings);
  if (clientCertificateOptions?.ca) {
    caParts.push(clientCertificateOptions.ca);
  }

  const ca = caParts.filter(Boolean);
  const shouldApplyTlsOptions = rejectUnauthorized === false
    || ca.length > 0
    || clientCertificateOptions
    || Object.keys(requestTransportOptions).length > 0;
  const tlsOptions = shouldApplyTlsOptions ? { rejectUnauthorized } : null;
  if (ca.length) {
    tlsOptions.ca = caWithSystemRoots(ca);
  }
  if (clientCertificateOptions) {
    if (clientCertificateOptions.cert) {
      tlsOptions.cert = clientCertificateOptions.cert;
    }
    if (clientCertificateOptions.key) {
      tlsOptions.key = clientCertificateOptions.key;
    }
    if (clientCertificateOptions.passphrase) {
      tlsOptions.passphrase = clientCertificateOptions.passphrase;
    }
  }
  if (tlsOptions && Object.keys(requestTransportOptions).length) {
    Object.assign(tlsOptions, requestTransportOptions);
  }
  const hasClientCertificate = Boolean(clientCertificateOptions?.cert && clientCertificateOptions?.key);
  return {
    hasClientCertificate,
    tlsOptions,
    tlsDiagnostics: {
      caCertificateConfigured: ca.length > 0,
      clientCertificateConfigured: hasClientCertificate,
      clientCertificateId: matchedClientCertificate?.certificate?.id || explicitCertificateId,
      clientCertificateName: matchedClientCertificate?.certificate?.name || explicitCertificateBinding?.name || '',
      verificationDisabled: verification === 'disabled'
    }
  };
}

async function loadMatchedClientCertificateOptions(url, environment, clientCertificates = []) {
  const certificate = findMatchingClientCertificate(clientCertificates, url);
  if (!certificate) {
    return null;
  }
  return {
    certificate,
    tlsOptions: await loadClientCertificateOptions({
      type: 'clientCertificate',
      certPath: certificate.certPath || '',
      keyPath: certificate.keyPath || '',
      pfxPath: certificate.pfxPath || '',
      caPath: certificate.caPath || '',
      passphrase: certificate.passphrase || ''
    }, environment, url, [])
  };
}

function findMatchingClientCertificate(clientCertificates = [], url) {
  const values = Array.isArray(clientCertificates) ? clientCertificates : [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (clientCertificateMatchesUrl(values[index], url)) {
      return values[index];
    }
  }
  return null;
}

async function loadClientCertificateOptions(auth = {}, environment, url, clientCertificates = []) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'clientCertificate') {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'grpcs:') {
    throw new Error('Client certificate auth requires an https URL.');
  }
  const certificateId = resolveEnvironmentValue(normalized.certificateId, environment).trim();
  if (certificateId) {
    const certificate = (clientCertificates || []).find((item) => item?.enabled !== false && String(item?.id || '') === certificateId);
    if (!certificate) {
      throw new Error('Configured client certificate binding was not found for this request.');
    }
    return loadClientCertificateOptions({
      type: 'clientCertificate',
      certPath: certificate.certPath || '',
      keyPath: certificate.keyPath || '',
      pfxPath: certificate.pfxPath || '',
      caPath: certificate.caPath || '',
      passphrase: certificate.passphrase || ''
    }, environment, url, []);
  }

  const passphrase = resolveEnvironmentValue(normalized.passphrase, environment);
  const caPath = resolveEnvironmentValue(normalized.caPath, environment).trim();
  const ca = caPath ? await readCertificateFile(caPath, 'CA certificate') : undefined;
  const pfxPath = resolveEnvironmentValue(normalized.pfxPath, environment).trim();
  if (pfxPath) {
    const extracted = await extractPfxToPem(pfxPath, passphrase, {
      bundleLabel: 'client certificate PFX/P12 bundle'
    });
    return {
      cert: extracted.certChain,
      key: extracted.privateKey,
      ca
    };
  }

  const certPath = resolveEnvironmentValue(normalized.certPath, environment).trim();
  const keyPath = resolveEnvironmentValue(normalized.keyPath, environment).trim();
  return {
    cert: await readCertificateFile(certPath, 'PEM certificate'),
    key: await readCertificateFile(keyPath, 'PEM key'),
    ca,
    passphrase: passphrase || undefined
  };
}

function clientCertificateMatchesUrl(certificate, url) {
  if (!certificate || certificate.enabled === false || url.protocol !== 'https:' && url.protocol !== 'grpcs:') {
    return false;
  }
  const requestPort = url.port || (url.protocol === 'grpcs:' || url.protocol === 'https:' ? DEFAULT_HTTPS_PORT : '');
  const certificatePort = normalizePort(certificate.port);
  if (certificatePort && certificatePort !== requestPort) {
    return false;
  }
  const host = String(certificate.host || '').trim().toLowerCase();
  if (host && hostMatchesPattern(url.hostname, host)) {
    return true;
  }
  return (certificate.matches || []).some((match) => matchPatternMatchesUrl(match, url));
}

function matchPatternMatchesUrl(match, url) {
  const pattern = String(match || '').trim();
  if (!pattern) {
    return false;
  }
  try {
    const parsed = new URL(pattern);
    if (parsed.protocol && parsed.protocol !== url.protocol) {
      return false;
    }
    const parsedPort = parsed.port || (parsed.protocol === 'https:' || parsed.protocol === 'grpcs:' ? DEFAULT_HTTPS_PORT : '');
    if (parsedPort && parsedPort !== (url.port || DEFAULT_HTTPS_PORT)) {
      return false;
    }
    if (!hostMatchesPattern(url.hostname, parsed.hostname)) {
      return false;
    }
    const parsedPathPattern = `${parsed.pathname || ''}${parsed.search || ''}`;
    if (parsedPathPattern && parsedPathPattern !== '/') {
      return globPatternMatches(`${url.pathname || '/'}${url.search || ''}`, parsedPathPattern);
    }
    return true;
  } catch {
    return hostMatchesPattern(url.hostname, pattern);
  }
}

function hostMatchesPattern(hostname, pattern) {
  const host = String(hostname || '').toLowerCase();
  const normalizedPattern = String(pattern || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^grpcs?:\/\//, '').split('/')[0].split(':')[0];
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  if (normalizedPattern.includes('*')) {
    const escaped = normalizedPattern.split('*').map(escapeRegExp).join('.*');
    return new RegExp(`^${escaped}$`, 'i').test(host);
  }
  return host === normalizedPattern;
}

function globPatternMatches(value, pattern) {
  const escaped = String(pattern || '').split('*').map(escapeRegExp).join('.*');
  return new RegExp(`^${escaped}$`, 'i').test(String(value || ''));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function caWithSystemRoots(caParts) {
  return [
    ...tls.rootCertificates,
    ...caParts.map((part) => Buffer.isBuffer(part) ? part.toString('utf8') : String(part || ''))
  ].filter(Boolean);
}

function grpcRootCertificatesWithSystemRoots(caParts = []) {
  const parts = [
    ...tls.rootCertificates,
    ...caParts.map((part) => Buffer.isBuffer(part) ? part.toString('utf8') : String(part || ''))
  ].filter(Boolean);
  return parts.length ? Buffer.from(parts.join('\n'), 'utf8') : null;
}

async function readCertificateFile(filePath, label) {
  return readRegularFileBounded(path.resolve(filePath), `client certificate ${label}`);
}

module.exports = {
  caWithSystemRoots,
  clientCertificateMatchesUrl,
  findMatchingClientCertificate,
  grpcRootCertificatesWithSystemRoots,
  loadClientCertificateOptions,
  normalizeManagedClientCertificates,
  normalizeRequestTlsSettings,
  normalizeTlsSettings,
  resolveHttpTlsPolicy,
  resolveTlsSettingsSecrets
};
