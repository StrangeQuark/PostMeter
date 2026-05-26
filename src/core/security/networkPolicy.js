const dns = require('node:dns/promises');
const net = require('node:net');
const { domainToASCII } = require('node:url');

const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata',
  '169.254.169.254'
]);

const DEFAULT_TEAM_PACKAGE_ALLOWED_HOSTS = Object.freeze(
  String(process.env.POSTMETER_TEAM_PACKAGE_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => normalizeHostname(item))
    .filter(Boolean)
);

function normalizeHostname(value) {
  const raw = String(value || '').trim().replace(/\.$/u, '').toLowerCase();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).toLowerCase();
  }
  return domainToASCII(raw).toLowerCase();
}

function classifyHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return { category: 'invalid', hostname: normalized, reason: 'empty-hostname' };
  }
  if (METADATA_HOSTS.has(normalized)) {
    return { category: 'metadata', hostname: normalized, reason: 'metadata-hostname' };
  }
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return { category: 'loopback', hostname: normalized, reason: 'localhost' };
  }
  if (normalized.endsWith('.local')) {
    return { category: 'link-local', hostname: normalized, reason: 'local-domain' };
  }
  const ipCategory = classifyIpAddress(normalized);
  if (ipCategory.category !== 'public' && ipCategory.category !== 'invalid') {
    return { ...ipCategory, hostname: normalized };
  }
  return { category: 'public', hostname: normalized, reason: 'public-hostname' };
}

function classifyIpAddress(address) {
  const normalized = normalizeIpAddress(address);
  const family = net.isIP(normalized);
  if (!family) {
    return { category: 'invalid', address: normalized, reason: 'invalid-ip' };
  }
  if (family === 4) {
    return classifyIpv4(normalized);
  }
  const mapped = ipv4FromMappedIpv6(normalized);
  if (mapped) {
    return classifyIpv4(mapped);
  }
  return classifyIpv6(normalized);
}

function classifyResolvedAddresses(addresses) {
  const values = Array.isArray(addresses) ? addresses : [];
  if (!values.length) {
    return { category: 'invalid', reason: 'no-addresses', addresses: [] };
  }
  const classified = values.map((item) => {
    const address = typeof item === 'string' ? item : item?.address;
    return classifyIpAddress(address);
  });
  const unsafe = classified.find((item) => item.category !== 'public');
  return {
    category: unsafe ? unsafe.category : 'public',
    reason: unsafe ? unsafe.reason : 'public-addresses',
    addresses: classified
  };
}

async function resolveHostnameAddresses(hostname, options = {}) {
  const normalized = normalizeHostname(hostname);
  const resolveHost = typeof options.resolveHost === 'function'
    ? options.resolveHost
    : async (host) => dns.lookup(host, { all: true, verbatim: false });
  const addresses = await resolveHost(normalized);
  return (Array.isArray(addresses) ? addresses : [addresses])
    .map((item) => (typeof item === 'string' ? { address: item } : item))
    .filter((item) => item?.address);
}

async function assertPublicHttpsUrl(rawUrl, options = {}) {
  const url = rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl || ''));
  if (url.protocol !== 'https:') {
    throw networkPolicyError('URL must use HTTPS.', 'POSTMETER_NETWORK_URL_DENIED');
  }
  if (url.username || url.password) {
    throw networkPolicyError('URL must not include credentials.', 'POSTMETER_NETWORK_URL_DENIED');
  }
  const hostname = normalizeHostname(url.hostname);
  const allowedHosts = normalizeAllowedHosts(options.allowedHosts || DEFAULT_TEAM_PACKAGE_ALLOWED_HOSTS);
  if (allowedHosts.length && !allowedHosts.includes(hostname)) {
    throw networkPolicyError('URL host is not allowlisted.', 'POSTMETER_NETWORK_URL_DENIED');
  }
  const hostClassification = classifyHostname(hostname);
  if (hostClassification.category !== 'public') {
    throw networkPolicyError(`URL host resolves to a blocked ${hostClassification.category} destination.`, 'POSTMETER_NETWORK_PRIVATE_DENIED');
  }
  const addresses = await resolveHostnameAddresses(hostname, options);
  const addressClassification = classifyResolvedAddresses(addresses);
  if (addressClassification.category !== 'public') {
    throw networkPolicyError(`URL host resolves to a blocked ${addressClassification.category} destination.`, 'POSTMETER_NETWORK_PRIVATE_DENIED');
  }
  return {
    category: 'public',
    hostname,
    addresses: addressClassification.addresses
  };
}

async function classifyNetworkDestination(rawUrl, options = {}) {
  const url = rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl || ''));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { category: 'invalid', reason: 'unsupported-protocol', url };
  }
  const hostname = normalizeHostname(url.hostname);
  const hostClassification = classifyHostname(hostname);
  if (hostClassification.category !== 'public') {
    return {
      ...hostClassification,
      url,
      hostname
    };
  }
  const addresses = await resolveHostnameAddresses(hostname, options);
  const addressClassification = classifyResolvedAddresses(addresses);
  return {
    ...addressClassification,
    url,
    hostname
  };
}

function normalizeAllowedHosts(value) {
  return (Array.isArray(value) ? value : String(value || '').split(','))
    .map((item) => normalizeHostname(item))
    .filter(Boolean);
}

function classifyIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return { category: 'invalid', address, reason: 'invalid-ipv4' };
  }
  const [a, b] = parts;
  if (address === '169.254.169.254') {
    return { category: 'metadata', address, reason: 'metadata-ipv4' };
  }
  if (a === 0) {
    return { category: 'reserved', address, reason: 'zero-network' };
  }
  if (a === 10) {
    return { category: 'private', address, reason: 'rfc1918-10' };
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return { category: 'private', address, reason: 'carrier-grade-nat' };
  }
  if (a === 127) {
    return { category: 'loopback', address, reason: 'loopback-ipv4' };
  }
  if (a === 169 && b === 254) {
    return { category: 'link-local', address, reason: 'link-local-ipv4' };
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return { category: 'private', address, reason: 'rfc1918-172' };
  }
  if (a === 192 && b === 168) {
    return { category: 'private', address, reason: 'rfc1918-192' };
  }
  if (a === 192 && b === 0 && parts[2] === 2) {
    return { category: 'reserved', address, reason: 'documentation-ipv4' };
  }
  if (a === 192 && b === 0) {
    return { category: 'reserved', address, reason: 'ietf-protocol-assignments' };
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return { category: 'reserved', address, reason: 'benchmarking-ipv4' };
  }
  if (a === 198 && b === 51 && parts[2] === 100) {
    return { category: 'reserved', address, reason: 'documentation-ipv4' };
  }
  if (a === 203 && b === 0 && parts[2] === 113) {
    return { category: 'reserved', address, reason: 'documentation-ipv4' };
  }
  if (a >= 224) {
    return { category: 'reserved', address, reason: 'multicast-or-reserved-ipv4' };
  }
  return { category: 'public', address, reason: 'public-ipv4' };
}

function classifyIpv6(address) {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    return { category: 'loopback', address, reason: 'loopback-ipv6' };
  }
  const expanded = expandIpv6(normalized);
  if (!expanded) {
    return { category: 'invalid', address, reason: 'invalid-ipv6' };
  }
  if (expanded.every((part) => part === '0')) {
    return { category: 'reserved', address, reason: 'unspecified-ipv6' };
  }
  const first = Number.parseInt(expanded[0], 16);
  if ((first & 0xfe00) === 0xfc00) {
    return { category: 'private', address, reason: 'unique-local-ipv6' };
  }
  if ((first & 0xffc0) === 0xfe80) {
    return { category: 'link-local', address, reason: 'link-local-ipv6' };
  }
  if ((first & 0xff00) === 0xff00) {
    return { category: 'reserved', address, reason: 'multicast-ipv6' };
  }
  return { category: 'public', address, reason: 'public-ipv6' };
}

function normalizeIpAddress(address) {
  return String(address || '').trim().replace(/^\[/u, '').replace(/\]$/u, '').toLowerCase();
}

function ipv4FromMappedIpv6(address) {
  const normalized = normalizeIpAddress(address);
  const match = normalized.match(/^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/u);
  return match ? match[1] : '';
}

function expandIpv6(address) {
  const value = normalizeIpAddress(address);
  if (!value.includes(':')) {
    return null;
  }
  const [headText, tailText = ''] = value.split('::');
  const head = headText ? headText.split(':') : [];
  const tail = tailText ? tailText.split(':') : [];
  if (head.some((part) => !/^[0-9a-f]{1,4}$/u.test(part)) || tail.some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) {
    return null;
  }
  if (!value.includes('::') && head.length === 8) {
    return head;
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0) {
    return null;
  }
  return [...head, ...Array(missing).fill('0'), ...tail].map((part) => part || '0');
}

function networkPolicyError(message, code) {
  const error = new Error(message);
  error.code = code || 'POSTMETER_NETWORK_DENIED';
  return error;
}

module.exports = {
  assertPublicHttpsUrl,
  classifyHostname,
  classifyIpAddress,
  classifyNetworkDestination,
  classifyResolvedAddresses,
  normalizeHostname,
  resolveHostnameAddresses
};
