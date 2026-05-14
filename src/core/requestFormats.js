const {
  exportCurlRequest,
  importCurlCommand,
  curlExportExclusions,
  looksLikeCurlContent
} = require('./curlFormats');
const { regenerateRequestIds } = require('./importedCollectionIds');
const { requestModel } = require('./models');
const { findMatchingClientCertificate } = require('./tlsSettings');
const { buildUrlWithQuery } = require('./collectionFormatUtils');

const POSTMETER_REQUEST_FORMAT = 'postmeter.request';
const POSTMETER_REQUEST_VERSION = 1;

function exportRequestToJson(request) {
  return JSON.stringify({
    format: POSTMETER_REQUEST_FORMAT,
    version: POSTMETER_REQUEST_VERSION,
    request: requestModel(request || {})
  }, null, 2);
}

function exportRequestByFormat(request, format = 'postmeter') {
  const normalizedFormat = String(format || 'postmeter').toLowerCase();
  if (normalizedFormat === 'postmeter') {
    return exportRequestToJson(request);
  }
  if (normalizedFormat === 'curl') {
    return exportCurlRequest(request);
  }
  throw new Error('Request export format must be postmeter or curl.');
}

function importRequestFromText(content) {
  const text = String(content || '').trim();
  if (!text) {
    throw new Error('Request import content is empty.');
  }
  if (looksLikeCurlContent(text)) {
    const collection = importCurlCommand(text);
    const request = collection.requests?.[0];
    if (!request) {
      throw new Error('curl import did not produce a request.');
    }
    applySingleRequestCurlCertificate(request, collection.certificates);
    return regenerateImportedRequest(request);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const unsupported = new Error('Request import must be a curl command or PostMeter request JSON.');
    unsupported.cause = error;
    throw unsupported;
  }
  const candidate = requestCandidateFromParsedValue(parsed);
  if (!candidate) {
    throw new Error('PostMeter request JSON must contain a request object.');
  }
  return regenerateImportedRequest(candidate);
}

function requestCandidateFromParsedValue(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  if (parsed.format === POSTMETER_REQUEST_FORMAT && parsed.request && typeof parsed.request === 'object') {
    return parsed.request;
  }
  if (parsed.request && typeof parsed.request === 'object' && looksLikePostMeterRequest(parsed.request)) {
    return parsed.request;
  }
  if (looksLikePostMeterRequest(parsed)) {
    return parsed;
  }
  return null;
}

function looksLikePostMeterRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return typeof value.url === 'string'
    || typeof value.method === 'string'
    || Array.isArray(value.queryParams)
    || Array.isArray(value.headers)
    || typeof value.body === 'string'
    || value.auth != null
    || value.scripts != null;
}

function looksLikeCurlCommand(text) {
  return looksLikeCurlContent(text);
}

function regenerateImportedRequest(request) {
  const normalized = requestModel(request);
  regenerateRequestIds(normalized);
  return normalized;
}

function applySingleRequestCurlCertificate(request, certificates = []) {
  if (!Array.isArray(certificates) || certificates.length === 0 || request?.auth?.type === 'clientCertificate') {
    return;
  }
  let certificate = null;
  try {
    certificate = findMatchingClientCertificate(certificates, new URL(buildUrlWithQuery(requestModel(request || {}))));
  } catch {
    certificate = certificates.find((candidate) => candidate?.enabled !== false) || null;
  }
  if (!certificate) {
    return;
  }
  preserveBasicAuthAsHeader(request);
  request.auth = {
    type: 'clientCertificate',
    certPath: certificate.certPath || '',
    keyPath: certificate.keyPath || '',
    pfxPath: certificate.pfxPath || '',
    caPath: certificate.caPath || '',
    passphrase: certificate.passphrase || ''
  };
}

function preserveBasicAuthAsHeader(request) {
  if (request?.auth?.type !== 'basic' || !request.auth.username) {
    return;
  }
  if ((request.headers || []).some((header) => header.enabled !== false && String(header.key || '').toLowerCase() === 'authorization')) {
    return;
  }
  request.headers ||= [];
  const credential = `${request.auth.username}:${request.auth.password ?? ''}`;
  request.headers.push({
    enabled: true,
    key: 'Authorization',
    value: `Basic ${Buffer.from(credential, 'utf8').toString('base64')}`
  });
}

module.exports = {
  POSTMETER_REQUEST_FORMAT,
  POSTMETER_REQUEST_VERSION,
  curlExportExclusions,
  exportRequestByFormat,
  exportRequestToJson,
  importRequestFromText,
  looksLikeCurlCommand,
  looksLikePostMeterRequest
};
