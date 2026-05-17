(function attachAuthRefreshAutoDetectModel(global) {
  const RAW_BODY_PATH = '$body';
  const MAX_BODY_CANDIDATES = 100;
  const TOKEN_NAME_PATTERN = /(access|refresh|id[_-]?token|token|jwt|bearer|auth|session|sid|api[_-]?key|secret|credential|csrf|xsrf)/i;
  const IRRELEVANT_HEADER_NAMES = new Set([
    'accept-ranges',
    'access-control-allow-credentials',
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-allow-origin',
    'access-control-expose-headers',
    'cache-control',
    'connection',
    'content-encoding',
    'content-length',
    'content-security-policy',
    'content-type',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'date',
    'etag',
    'expires',
    'keep-alive',
    'last-modified',
    'permissions-policy',
    'pragma',
    'referrer-policy',
    'server',
    'set-cookie',
    'strict-transport-security',
    'transfer-encoding',
    'vary',
    'x-content-type-options',
    'x-frame-options',
    'x-powered-by',
    'x-xss-protection'
  ]);

  function buildAuthRefreshAutoDetectCandidates(response = {}) {
    const candidates = [];
    const seen = new Set();
    const addCandidate = (candidate) => {
      const source = String(candidate?.source || '').trim();
      const path = String(candidate?.path || '').trim();
      if (!source || !path) {
        return;
      }
      const key = `${source}:${path}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({
        id: `candidate-${candidates.length + 1}`,
        source,
        path,
        label: candidate.label || autoDetectCandidateLabel(source, path),
        detail: candidate.detail || autoDetectCandidateDetail(source, path, candidate.value),
        valuePreview: previewAutoDetectValue(candidate.value)
      });
    };

    const bodyText = responseBodyText(response);
    const payload = bodyText ? parseJsonBody(bodyText) : { parsed: false, value: null };
    if (bodyText && !payload.parsed && isLikelyTokenValue(bodyText)) {
      addCandidate({
        source: 'rawBody',
        path: RAW_BODY_PATH,
        label: 'Entire response body',
        value: bodyText
      });
    }
    if (bodyText) {
      if (payload.parsed) {
        for (const item of flattenJsonLeaves(payload.value).filter(isLikelyBodyCandidate).slice(0, MAX_BODY_CANDIDATES)) {
          addCandidate({
            source: 'body',
            path: item.path,
            label: `JSON body: ${item.path}`,
            value: item.value
          });
        }
      }
    }

    for (const item of headerCandidates(response.headers)) {
      addCandidate(item);
    }
    for (const item of cookieCandidates(response)) {
      addCandidate(item);
    }

    return candidates;
  }

  function responseBodyText(response = {}) {
    const body = response.body;
    if (body == null) {
      return '';
    }
    if (typeof body === 'string') {
      return body.trim() ? body : '';
    }
    if (typeof body === 'number' || typeof body === 'boolean') {
      return String(body);
    }
    return '';
  }

  function parseJsonBody(bodyText) {
    try {
      return { parsed: true, value: JSON.parse(bodyText) };
    } catch {
      return { parsed: false, value: null };
    }
  }

  function flattenJsonLeaves(value, prefix = '') {
    if (value == null) {
      return prefix ? [{ path: prefix, value }] : [];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item, index) => flattenJsonLeaves(item, `${prefix}[${index}]`));
    }
    if (typeof value === 'object') {
      return Object.entries(value).flatMap(([key, child]) => {
        const nextPath = prefix ? `${prefix}.${key}` : key;
        return flattenJsonLeaves(child, nextPath);
      });
    }
    return prefix ? [{ path: prefix, value }] : [];
  }

  function headerCandidates(headers = {}) {
    if (!headers || typeof headers !== 'object') {
      return [];
    }
    return Object.entries(headers)
      .filter(([name, value]) => isLikelyHeaderCandidate(name, value))
      .map(([name, value]) => ({
        source: 'header',
        path: String(name).trim(),
        label: `Header: ${String(name).trim()}`,
        value: Array.isArray(value) ? value.join(', ') : value
      }));
  }

  function cookieCandidates(response = {}) {
    const cookies = [
      ...arrayCookies(response.updatedCookies),
      ...arrayCookies(response.cookies),
      ...setCookieHeaderCookies(response.headers)
    ];
    return cookies
      .filter((cookie) => isLikelyCookieCandidate(cookie))
      .map((cookie) => ({
        source: 'cookie',
        path: String(cookie.name).trim(),
        label: `Cookie: ${String(cookie.name).trim()}`,
        value: cookie.value
      }));
  }

  function arrayCookies(value) {
    return Array.isArray(value) ? value : [];
  }

  function setCookieHeaderCookies(headers = {}) {
    if (!headers || typeof headers !== 'object') {
      return [];
    }
    const headerKey = Object.keys(headers).find((key) => key.toLowerCase() === 'set-cookie');
    const value = headerKey ? headers[headerKey] : null;
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values
      .map((item) => String(item || '').split(';')[0])
      .map((pair) => {
        const separatorIndex = pair.indexOf('=');
        return separatorIndex > 0
          ? { name: pair.slice(0, separatorIndex).trim(), value: pair.slice(separatorIndex + 1) }
          : null;
      })
      .filter(Boolean);
  }

  function isLikelyBodyCandidate(item = {}) {
    return TOKEN_NAME_PATTERN.test(String(item.path || '')) || isLikelyTokenValue(item.value);
  }

  function isLikelyHeaderCandidate(name, value) {
    const text = String(name || '').trim();
    if (!text) {
      return false;
    }
    const lower = text.toLowerCase();
    if (IRRELEVANT_HEADER_NAMES.has(lower)) {
      return false;
    }
    return TOKEN_NAME_PATTERN.test(text) || isAuthorizationHeaderValue(value) || isLikelyTokenValue(value);
  }

  function isLikelyCookieCandidate(cookie = {}) {
    const name = String(cookie?.name || '').trim();
    if (!name) {
      return false;
    }
    return TOKEN_NAME_PATTERN.test(name) || isLikelyTokenValue(cookie.value);
  }

  function isAuthorizationHeaderValue(value) {
    const text = Array.isArray(value) ? value.join(', ') : String(value || '');
    return /^\s*(bearer|token|jwt)\s+/i.test(text);
  }

  function isLikelyTokenValue(value) {
    const text = String(Array.isArray(value) ? value[0] : value || '').trim();
    if (!text || /\s/.test(text)) {
      return false;
    }
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/.test(text)) {
      return true;
    }
    if (/^(bearer|token|jwt)\s+/i.test(text)) {
      return true;
    }
    if (text.length >= 8 && TOKEN_NAME_PATTERN.test(text)) {
      return true;
    }
    if (text.length < 24) {
      return false;
    }
    return /^[A-Za-z0-9._~+/=-]+$/.test(text) && /[A-Za-z]/.test(text) && /\d|[_+/=-]/.test(text);
  }

  function autoDetectCandidateLabel(source, path) {
    if (source === 'rawBody') {
      return 'Entire response body';
    }
    if (source === 'header') {
      return `Header: ${path}`;
    }
    if (source === 'cookie') {
      return `Cookie: ${path}`;
    }
    return `JSON body: ${path}`;
  }

  function autoDetectCandidateDetail(source, path, value) {
    const preview = previewAutoDetectValue(value);
    const sourceText = source === 'rawBody'
      ? 'Body'
      : source === 'body'
        ? 'JSON body'
        : source[0].toUpperCase() + source.slice(1);
    return preview ? `${sourceText} -> ${path} -> ${preview}` : `${sourceText} -> ${path}`;
  }

  function previewAutoDetectValue(value) {
    if (value == null) {
      return '';
    }
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!text) {
      return '';
    }
    if (text.length <= 24) {
      return text;
    }
    return `${text.slice(0, 10)}...${text.slice(-6)}`;
  }

  const exported = {
    RAW_BODY_PATH,
    buildAuthRefreshAutoDetectCandidates
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterAuthRefreshAutoDetectModel = exported;
})(typeof window === 'undefined' ? globalThis : window);
