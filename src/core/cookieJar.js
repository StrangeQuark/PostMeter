const net = require('node:net');
const { newId } = require('./models');
const {
  isExpiredCookie,
  normalizeCookieDomain,
  normalizeCookiePath,
  normalizeCookiePriority,
  normalizeCookieSameSite,
  normalizeCookies
} = require('./cookieModel');

function cookiesForRequest(cookies, url) {
  const now = Date.now();
  return normalizeCookies(cookies, { createId: newId })
    .filter((cookie) => cookie.enabled !== false)
    .filter((cookie) => !isExpiredCookie(cookie, now))
    .filter((cookie) => domainMatches(cookie, url.hostname))
    .filter((cookie) => pathMatches(cookie, url.pathname || '/'))
    .filter((cookie) => !cookie.secure || url.protocol === 'https:')
    .sort((left, right) => right.path.length - left.path.length);
}

function mergeCookieHeader(existingHeader, cookies) {
  const explicit = parseCookieHeader(existingHeader || '');
  const explicitNames = new Set(explicit.map((cookie) => cookie.name.toLowerCase()));
  const merged = [...explicit];
  for (const cookie of cookies) {
    if (!explicitNames.has(cookie.name.toLowerCase())) {
      merged.push({ name: cookie.name, value: cookie.value });
    }
  }
  return merged.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function updateCookiesFromResponse(cookies, setCookieHeaders, url) {
  let jar = normalizeCookies(cookies, { createId: newId }).filter((cookie) => !isExpiredCookie(cookie));
  for (const header of normalizeSetCookieHeaders(setCookieHeaders)) {
    const parsed = parseSetCookie(header, url);
    if (!parsed) {
      continue;
    }
    jar = jar.filter((cookie) => !sameCookieIdentity(cookie, parsed));
    if (!isExpiredCookie(parsed)) {
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
  const parts = String(header || '').split(';').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return null;
  }
  const separator = parts[0].indexOf('=');
  if (separator < 1) {
    return null;
  }
  const cookie = {
    id: newId(),
    enabled: true,
    name: parts[0].slice(0, separator).trim(),
    value: parts[0].slice(separator + 1).trim(),
    domain: url.hostname.toLowerCase(),
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
    if (name === 'domain' && value) {
      const domain = normalizeDomain(value);
      if (!isAllowedCookieDomain(url.hostname, domain)) {
        return null;
      }
      cookie.domain = domain;
      cookie.hostOnly = false;
    } else if (name === 'path' && value) {
      cookie.path = normalizeCookiePath(value);
    } else if (name === 'expires' && value && !maxAgeSeen) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        cookie.expiresAt = date.toISOString();
      }
    } else if (name === 'max-age') {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) {
        maxAgeSeen = true;
        cookie.expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
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
    cookie.sameSite = '';
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
    return headers.map(String).filter(Boolean);
  }
  return [String(headers)].filter(Boolean);
}

function sameCookieIdentity(left, right) {
  return left.name.toLowerCase() === right.name.toLowerCase()
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
  if (candidate === 'localhost') {
    return host === 'localhost';
  }
  return host === candidate || host.endsWith(`.${candidate}`);
}

function isAllowedCookieDomain(hostname, domain) {
  const host = normalizeDomain(hostname);
  const candidate = normalizeDomain(domain);
  if (isIpAddressLike(host)) {
    return false;
  }
  if (!domainMatchesHost(host, candidate)) {
    return false;
  }
  if (candidate === 'localhost') {
    return host === 'localhost';
  }
  if (candidate !== host && isPublicSuffixLikeDomain(candidate)) {
    return false;
  }
  return true;
}

function isIpAddressLike(hostname) {
  return net.isIP(String(hostname || '').replace(/^\[/, '').replace(/\]$/, '')) !== 0;
}

function isPublicSuffixLikeDomain(domain) {
  const candidate = normalizeDomain(domain);
  return Boolean(candidate && candidate !== 'localhost' && !candidate.includes('.'));
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
