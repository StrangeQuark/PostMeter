const net = require('node:net');
const psl = require('psl');
const { newId } = require('../workspace/models');
const {
  isExpiredCookie,
  normalizeCookieDomain,
  normalizeCookiePath,
  normalizeCookiePriority,
  normalizeCookieSameSite,
  normalizeCookies
} = require('./cookieModel');

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const INVALID_HEADER_OCTETS = /[\x00-\x08\x0A-\x1F\x7F]/;
const MAX_COOKIE_DATE_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
function cookiesForRequest(cookies, url) {
  const now = Date.now();
  return normalizeCookies(cookies, { createId: newId })
    .map((cookie, index) => ({ cookie, creationOrder: index }))
    .filter((entry) => entry.cookie.enabled !== false)
    .filter((entry) => !isExpiredCookie(entry.cookie, now))
    .filter((entry) => domainMatches(entry.cookie, url.hostname))
    .filter((entry) => pathMatches(entry.cookie, url.pathname || '/'))
    .filter((entry) => !entry.cookie.secure || url.protocol === 'https:')
    .sort((left, right) => (right.cookie.path.length - left.cookie.path.length) || (left.creationOrder - right.creationOrder))
    .map((entry) => entry.cookie);
}

function mergeCookieHeader(existingHeader, cookies) {
  const explicit = parseCookieHeader(existingHeader || '');
  const explicitNames = new Set(explicit.map((cookie) => cookie.name));
  const merged = [...explicit];
  for (const cookie of cookies) {
    if (!explicitNames.has(cookie.name)) {
      merged.push({ name: cookie.name, value: cookie.value });
    }
  }
  return merged.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function updateCookiesFromResponse(cookies, setCookieHeaders, url) {
  const jar = normalizeCookies(cookies, { createId: newId }).filter((cookie) => !isExpiredCookie(cookie));
  for (const header of normalizeSetCookieHeaders(setCookieHeaders)) {
    const parsed = parseSetCookie(header, url);
    if (!parsed) {
      continue;
    }
    const existingIndex = jar.findIndex((cookie) => sameCookieIdentity(cookie, parsed));
    if (isExpiredCookie(parsed)) {
      if (existingIndex >= 0) {
        jar.splice(existingIndex, 1);
      }
    } else if (existingIndex >= 0) {
      jar[existingIndex] = {
        ...parsed,
        id: jar[existingIndex].id || parsed.id
      };
    } else {
      jar.push(parsed);
    }
  }
  return normalizeCookies(jar, { createId: newId });
}

function parseCookieHeader(value) {
  return String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) {
        return null;
      }
      return {
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim()
      };
    })
    .filter((cookie) => cookie?.name);
}

function cookieFromHeader(cookie, url, options = {}) {
  return {
    id: options.id || newId(),
    enabled: options.enabled !== false,
    name: cookie.name || '',
    value: cookie.value || '',
    domain: normalizeCookieDomain(options.domain || url.hostname),
    path: normalizeCookiePath(options.path || '/'),
    expiresAt: options.expiresAt || '',
    secure: options.secure === true,
    httpOnly: options.httpOnly === true,
    sameSite: normalizeCookieSameSite(options.sameSite),
    hostOnly: options.hostOnly !== false,
    priority: normalizeCookiePriority(options.priority),
    partitioned: options.partitioned === true,
    source: options.source == null ? '' : String(options.source),
    extensions: Array.isArray(options.extensions) ? options.extensions.map(String).filter(Boolean).slice(0, 25) : []
  };
}

function parseSetCookie(header, url) {
  const rawHeader = String(header || '');
  if (!rawHeader || INVALID_HEADER_OCTETS.test(rawHeader)) {
    return null;
  }
  const parts = rawHeader.split(';').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return null;
  }
  const separator = parts[0].indexOf('=');
  if (separator < 1) {
    return null;
  }
  const name = parts[0].slice(0, separator).trim();
  const value = parts[0].slice(separator + 1).trim();
  if (!isValidCookieName(name) || !isValidCookieValue(value)) {
    return null;
  }
  const cookie = {
    id: newId(),
    enabled: true,
    name,
    value,
    domain: normalizeDomain(url.hostname),
    path: defaultCookiePath(url.pathname),
    expiresAt: '',
    secure: false,
    httpOnly: false,
    sameSite: '',
    hostOnly: true,
    priority: '',
    partitioned: false,
    source: 'response',
    extensions: []
  };
  let maxAgeSeen = false;
  for (const attribute of parts.slice(1)) {
    const attrSeparator = attribute.indexOf('=');
    const rawName = attrSeparator >= 0 ? attribute.slice(0, attrSeparator) : attribute;
    const rawValue = attrSeparator >= 0 ? attribute.slice(attrSeparator + 1) : '';
    const name = rawName.trim().toLowerCase();
    const value = rawValue.trim();
    if (!name || INVALID_HEADER_OCTETS.test(value)) {
      continue;
    }
    if (name === 'domain' && value) {
      const domain = normalizeDomain(value);
      if (!isAllowedCookieDomain(url.hostname, domain)) {
        return null;
      }
      cookie.domain = domain;
      cookie.hostOnly = false;
    } else if (name === 'path' && value) {
      if (value.startsWith('/')) {
        cookie.path = normalizeCookiePath(value);
      }
    } else if (name === 'expires' && value && !maxAgeSeen) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        cookie.expiresAt = date.toISOString();
      }
    } else if (name === 'max-age') {
      const expiresAt = expiresAtFromMaxAge(value);
      if (expiresAt) {
        maxAgeSeen = true;
        cookie.expiresAt = expiresAt;
      }
    } else if (name === 'secure') {
      cookie.secure = true;
    } else if (name === 'httponly') {
      cookie.httpOnly = true;
    } else if (name === 'samesite') {
      cookie.sameSite = normalizeCookieSameSite(value);
    } else if (name === 'priority') {
      cookie.priority = normalizeCookiePriority(value);
    } else if (name === 'partitioned') {
      cookie.partitioned = true;
    }
  }
  if (cookie.sameSite === 'None' && !cookie.secure) {
    return null;
  }
  if (cookie.partitioned && !cookie.secure) {
    return null;
  }
  if (!hasValidCookiePrefixSemantics(cookie)) {
    return null;
  }
  return cookie.name ? cookie : null;
}

function normalizeSetCookieHeaders(headers) {
  if (!headers) {
    return [];
  }
  if (Array.isArray(headers)) {
    return headers.flatMap((header) => splitSetCookieHeader(header)).filter(Boolean);
  }
  return splitSetCookieHeader(headers).filter(Boolean);
}

function splitSetCookieHeader(header) {
  const value = String(header || '');
  if (!value) {
    return [];
  }
  const headers = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ',') {
      continue;
    }
    const next = value.slice(index + 1);
    if (/^\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s*=/.test(next)) {
      headers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  headers.push(value.slice(start).trim());
  return headers;
}

function sameCookieIdentity(left, right) {
  return left.name === right.name
    && normalizeDomain(left.domain) === normalizeDomain(right.domain)
    && normalizeCookiePath(left.path) === normalizeCookiePath(right.path);
}

function domainMatches(cookie, hostname) {
  const host = normalizeDomain(hostname);
  const domain = normalizeDomain(cookie.domain);
  if (cookie.hostOnly) {
    return host === domain;
  }
  return domainMatchesHost(host, domain);
}

function domainMatchesHost(hostname, domain) {
  const host = normalizeDomain(hostname);
  const candidate = normalizeDomain(domain);
  if (!host || !candidate) {
    return false;
  }
  if (!isValidHostOrCookieDomain(host) || !isValidHostOrCookieDomain(candidate)) {
    return false;
  }
  if (isIpAddressLike(host) || isIpAddressLike(candidate)) {
    return host === candidate;
  }
  if (candidate === 'localhost') {
    return host === 'localhost';
  }
  return host === candidate || host.endsWith(`.${candidate}`);
}

function isAllowedCookieDomain(hostname, domain) {
  const host = normalizeDomain(hostname);
  const candidate = normalizeDomain(domain);
  if (!isValidHostOrCookieDomain(host) || !isValidHostOrCookieDomain(candidate)) {
    return false;
  }
  if (isIpAddressLike(host) || isIpAddressLike(candidate)) {
    return false;
  }
  if (!domainMatchesHost(host, candidate)) {
    return false;
  }
  if (candidate === 'localhost') {
    return host === 'localhost';
  }
  if (isPublicSuffixLikeDomain(candidate)) {
    return false;
  }
  return true;
}

function isIpAddressLike(hostname) {
  return net.isIP(String(hostname || '').replace(/^\[/, '').replace(/\]$/, '')) !== 0;
}

function isPublicSuffixLikeDomain(domain) {
  const candidate = normalizeDomain(domain);
  if (!candidate || candidate === 'localhost') {
    return false;
  }
  if (!candidate.includes('.')) {
    return true;
  }
  const parsed = psl.parse(candidate);
  return parsed?.listed === true && parsed.domain == null;
}

function isValidCookieName(name) {
  return COOKIE_NAME.test(String(name || ''));
}

function isValidCookieValue(value) {
  return !/[\x00-\x1F\x7F;]/.test(String(value ?? ''));
}

function isValidHostOrCookieDomain(domain) {
  const candidate = normalizeDomain(domain);
  if (!candidate || candidate.length > 253) {
    return false;
  }
  if (candidate === 'localhost' || isIpAddressLike(candidate)) {
    return true;
  }
  if (/[\s/:_*]/.test(candidate)) {
    return false;
  }
  const labels = candidate.split('.');
  return labels.every((label) => DOMAIN_LABEL.test(label));
}

function expiresAtFromMaxAge(value) {
  if (!/^-?\d+$/.test(String(value || '').trim())) {
    return '';
  }
  const seconds = BigInt(String(value).trim());
  if (seconds <= 0n) {
    return new Date(0).toISOString();
  }
  const now = Date.now();
  const maxSeconds = BigInt(Math.max(0, Math.floor((MAX_COOKIE_DATE_MS - now) / 1000)));
  const clampedSeconds = seconds > maxSeconds ? maxSeconds : seconds;
  return new Date(now + Number(clampedSeconds) * 1000).toISOString();
}

function pathMatches(cookie, requestPath) {
  const cookiePath = normalizeCookiePath(cookie.path);
  const path = normalizeCookiePath(requestPath);
  return path === cookiePath || path.startsWith(cookiePath.endsWith('/') ? cookiePath : `${cookiePath}/`);
}

function defaultCookiePath(pathname) {
  const path = normalizeCookiePath(pathname);
  if (path === '/') {
    return '/';
  }
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

function normalizeDomain(domain) {
  return normalizeCookieDomain(domain);
}

function hasValidCookiePrefixSemantics(cookie) {
  if (cookie.name.startsWith('__Secure-') && !cookie.secure) {
    return false;
  }
  if (cookie.name.startsWith('__Host-')) {
    return cookie.secure === true && cookie.hostOnly !== false && normalizeCookiePath(cookie.path) === '/';
  }
  return true;
}

module.exports = {
  cookieFromHeader,
  cookiesForRequest,
  domainMatchesHost,
  isExpired: isExpiredCookie,
  mergeCookieHeader,
  parseCookieHeader,
  parseSetCookie,
  updateCookiesFromResponse
};
