(function attachCookieModel(global) {
const {
  cookieMatchesHost,
  domainFromRequestUrl,
  isExpiredCookie: isExpiredCoreCookie,
  newWorkspaceCookie,
  normalizeCookieDomain,
  normalizeCookieExpiresAt,
  normalizeCookiePriority,
  normalizeCookieSameSite
} = global.PostMeterCookieCoreModel || require('../../core/http/cookieModel');

function postmanCookieMetadataByName(variables = []) {
  const map = new Map();
  const source = (variables || []).find((variable) => variable.enabled !== false && variable.key === 'postman.cookies');
  if (!source?.value) {
    return map;
  }
  try {
    const cookies = JSON.parse(source.value);
    if (!Array.isArray(cookies)) {
      return map;
    }
    for (const cookie of cookies) {
      if (cookie?.name) {
        map.set(String(cookie.name).toLowerCase(), cookie);
      }
    }
  } catch {
    return map;
  }
  return map;
}

function applyPostmanCookieMetadata(cookie, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return cookie;
  }
  const domain = normalizeCookieDomain(metadata.domain);
  const sameSite = normalizeCookieSameSite(metadata.sameSite);
  return {
    ...cookie,
    value: metadata.value == null ? cookie.value : String(metadata.value),
    domain: domain || cookie.domain,
    path: metadata.path ? String(metadata.path) : cookie.path,
    expiresAt: normalizeCookieExpiresAt(metadata.expiresAt) || cookie.expiresAt,
    secure: metadata.secure === true,
    httpOnly: metadata.httpOnly === true,
    sameSite,
    hostOnly: domain ? metadata.hostOnly === true : cookie.hostOnly,
    priority: normalizeCookiePriority(metadata.priority),
    partitioned: metadata.partitioned === true,
    source: metadata.source ? String(metadata.source).slice(0, 64) : cookie.source || '',
    extensions: Array.isArray(metadata.extensions) ? metadata.extensions.map(String).filter(Boolean).slice(0, 25) : cookie.extensions || []
  };
}

function parseCookieHeaderForJar(value, domain) {
  return String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) {
        return null;
      }
      return newWorkspaceCookie({
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
        domain
      });
    })
    .filter((cookie) => cookie?.name);
}

function rendererCookieMatchesHost(cookie, hostname) {
  return cookieMatchesHost(cookie, hostname);
}

function isExpiredCookie(cookie) {
  return isExpiredCoreCookie(cookie, Date.now());
}

function cookieFieldIssues(cookie, activeHost) {
  const domain = normalizeCookieDomain(cookie.domain);
  const path = String(cookie.path || '').trim();
  const expiresAt = String(cookie.expiresAt || '').trim();
  const issues = {};
  if (!domain) {
    issues.domain = 'Cookie domain is required.';
  } else if (/[\s/:]/.test(domain)) {
    issues.domain = 'Cookie domain must be a hostname without spaces, protocol, or path.';
  } else if (cookie.hostOnly === false && rendererIsIpAddressLike(domain)) {
    issues.domain = 'IP-address cookies must be host-only.';
  } else if (activeHost && !rendererCookieMatchesHost({ ...cookie, domain }, activeHost)) {
    issues.domain = 'Cookie domain does not match the active request host.';
  }
  if (!path.startsWith('/')) {
    issues.path = 'Cookie path must start with /.';
  }
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    issues.expires = 'Cookie expiry must be a valid date or ISO timestamp.';
  }
  return issues;
}

function rendererIsIpAddressLike(hostname) {
  const host = String(hostname || '').replace(/^\[/, '').replace(/\]$/, '');
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyPostmanCookieMetadata,
    cookieFieldIssues,
    domainFromRequestUrl,
    isExpiredCookie,
    newWorkspaceCookie,
    normalizeCookieDomain,
    normalizeCookieExpiresAt,
    normalizeCookiePriority,
    normalizeCookieSameSite,
    parseCookieHeaderForJar,
    postmanCookieMetadataByName,
    rendererCookieMatchesHost
  };
}

global.PostMeterCookieModel = {
  applyPostmanCookieMetadata,
  cookieFieldIssues,
  domainFromRequestUrl,
  isExpiredCookie,
  newWorkspaceCookie,
  parseCookieHeaderForJar,
  postmanCookieMetadataByName,
  rendererCookieMatchesHost
};
})(typeof window === 'undefined' ? globalThis : window);
