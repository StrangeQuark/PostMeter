(function attachCookieModel(global) {
  const { normalizeSchemaEnumValue } = resolvePayloadSchemas(global);

  function defaultCookieId(createId) {
    if (typeof createId === 'function') {
      return createId();
    }
    if (typeof global.crypto?.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    throw new Error('crypto.randomUUID() is required to create cookie IDs.');
  }

  function normalizeCookieDomain(domain) {
    const value = String(domain || '')
      .trim()
      .replace(/[\u3002\uFF0E\uFF61]/g, '.')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .toLowerCase();
    if (!value || /[\s/:]/.test(value)) {
      return value;
    }
    try {
      return new URL(`http://${value}`).hostname.replace(/\.$/, '').toLowerCase();
    } catch {
      return value;
    }
  }

  function normalizeCookiePath(path) {
    const value = String(path || '/').trim();
    return value.startsWith('/') ? value : `/${value}`;
  }

  function normalizeCookieExpiresAt(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function normalizeCookieSameSite(value) {
    return normalizeSchemaEnumValue('sameSiteValues', titleCase(value), '');
  }

  function normalizeCookiePriority(value) {
    return normalizeSchemaEnumValue('cookiePriorities', titleCase(value), '');
  }

  function normalizeCookieExtensions(extensions) {
    if (!Array.isArray(extensions)) {
      return [];
    }
    return extensions
      .map((extension) => String(extension ?? '').trim())
      .filter(Boolean)
      .slice(0, 25);
  }

  function newWorkspaceCookie(options = {}, runtime = {}) {
    return {
      id: options.id || defaultCookieId(runtime.createId),
      enabled: options.enabled !== false,
      name: options.name == null ? '' : String(options.name),
      value: options.value == null ? '' : String(options.value),
      domain: normalizeCookieDomain(options.domain),
      path: options.path ? String(options.path) : '/',
      expiresAt: options.expiresAt ? String(options.expiresAt) : '',
      secure: options.secure === true,
      httpOnly: options.httpOnly === true,
      sameSite: options.sameSite == null ? 'Lax' : String(options.sameSite),
      hostOnly: options.hostOnly !== false,
      priority: options.priority ? String(options.priority) : '',
      partitioned: options.partitioned === true,
      source: options.source ? String(options.source) : '',
      extensions: Array.isArray(options.extensions) ? options.extensions.map(String).filter(Boolean).slice(0, 25) : []
    };
  }

  function normalizeCookie(cookie, runtime = {}) {
    return {
      id: cookie.id || defaultCookieId(runtime.createId),
      enabled: cookie.enabled !== false,
      name: cookie.name == null ? '' : String(cookie.name).trim(),
      value: cookie.value == null ? '' : String(cookie.value),
      domain: normalizeCookieDomain(cookie.domain),
      path: normalizeCookiePath(cookie.path),
      expiresAt: normalizeCookieExpiresAt(cookie.expiresAt),
      secure: cookie.secure === true,
      httpOnly: cookie.httpOnly === true,
      sameSite: normalizeCookieSameSite(cookie.sameSite),
      hostOnly: cookie.hostOnly !== false,
      priority: normalizeCookiePriority(cookie.priority),
      partitioned: cookie.partitioned === true,
      source: cookie.source == null ? '' : String(cookie.source).trim().slice(0, 64),
      extensions: normalizeCookieExtensions(cookie.extensions)
    };
  }

  function normalizeCookies(cookies, runtime = {}) {
    if (!Array.isArray(cookies)) {
      return [];
    }
    return cookies
      .filter((cookie) => cookie && typeof cookie === 'object')
      .map((cookie) => normalizeCookie(cookie, runtime))
      .filter((cookie) => cookie.name && cookie.domain);
  }

  function domainFromRequestUrl(url) {
    try {
      return normalizeCookieDomain(new URL(String(url || '')).hostname);
    } catch {
      return '';
    }
  }

  function cookieMatchesHost(cookie, hostname) {
    const host = normalizeCookieDomain(hostname);
    const domain = normalizeCookieDomain(cookie?.domain);
    if (!host || !domain) {
      return false;
    }
    if (cookie?.hostOnly !== false) {
      return host === domain;
    }
    return host === domain || host.endsWith(`.${domain}`);
  }

  function isExpiredCookie(cookie, now = Date.now()) {
    if (!cookie?.expiresAt) {
      return false;
    }
    const expires = new Date(cookie.expiresAt).getTime();
    return Number.isFinite(expires) && expires <= now;
  }

  function titleCase(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return '';
    }
    return normalized[0].toUpperCase() + normalized.slice(1);
  }

  function resolvePayloadSchemas(runtimeGlobal) {
    if (runtimeGlobal?.PostMeterPayloadSchemas) {
      return runtimeGlobal.PostMeterPayloadSchemas;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./payloadSchemas');
    }
    throw new Error('PostMeter payload schema metadata must load before cookieModel.js.');
  }

  const exported = {
    cookieMatchesHost,
    domainFromRequestUrl,
    isExpiredCookie,
    newWorkspaceCookie,
    normalizeCookie,
    normalizeCookieDomain,
    normalizeCookieExpiresAt,
    normalizeCookieExtensions,
    normalizeCookiePath,
    normalizeCookiePriority,
    normalizeCookieSameSite,
    normalizeCookies
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterCookieCoreModel = exported;
})(typeof window === 'undefined' ? globalThis : window);
