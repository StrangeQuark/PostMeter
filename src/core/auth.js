const { resolveEnvironmentValue } = require('./environmentResolver');

const AUTH_TYPES = new Set(['none', 'bearer', 'basic', 'apiKey', 'cookie', 'oauth2', 'clientCertificate']);
const API_KEY_LOCATIONS = new Set(['header', 'query']);
const OAUTH2_TOKEN_TYPES = new Set(['Bearer', 'MAC']);
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const OAUTH_REFRESH_WINDOW_MILLIS = 60_000;

function normalizeAuth(auth = {}) {
  const type = AUTH_TYPES.has(auth.type) ? auth.type : 'none';
  if (type === 'none') {
    return { type: 'none' };
  }
  if (type === 'bearer') {
    return { type, token: auth.token ?? '' };
  }
  if (type === 'basic') {
    return { type, username: auth.username ?? '', password: auth.password ?? '' };
  }
  if (type === 'apiKey') {
    return {
      type,
      location: API_KEY_LOCATIONS.has(auth.location) ? auth.location : 'header',
      key: auth.key ?? '',
      value: auth.value ?? ''
    };
  }
  if (type === 'cookie') {
    return { type, value: auth.value ?? '' };
  }
  if (type === 'oauth2') {
    return {
      type,
      tokenType: OAUTH2_TOKEN_TYPES.has(auth.tokenType) ? auth.tokenType : 'Bearer',
      accessToken: auth.accessToken ?? '',
      refreshToken: auth.refreshToken ?? '',
      tokenUrl: auth.tokenUrl ?? '',
      authorizationUrl: auth.authorizationUrl ?? '',
      clientId: auth.clientId ?? '',
      clientSecret: auth.clientSecret ?? '',
      scopes: auth.scopes ?? '',
      grantType: auth.grantType ?? 'authorizationCode',
      expiresAt: auth.expiresAt ?? ''
    };
  }
  return {
    type,
    certPath: auth.certPath ?? '',
    keyPath: auth.keyPath ?? '',
    passphrase: auth.passphrase ?? ''
  };
}

function validateAuth(auth = {}, environment) {
  const normalized = normalizeAuth(auth);
  const errors = [];
  if (normalized.type === 'none') {
    return errors;
  }
  if (normalized.type === 'bearer') {
    requireResolved(normalized.token, environment, 'Bearer token', errors);
  } else if (normalized.type === 'basic') {
    requireResolved(normalized.username, environment, 'Basic auth username', errors);
  } else if (normalized.type === 'apiKey') {
    const key = requireResolved(normalized.key, environment, 'API key name', errors);
    requireResolved(normalized.value, environment, 'API key value', errors);
    if (normalized.location === 'header' && key && !HEADER_NAME.test(key)) {
      errors.push(`Invalid API key header name: ${key}.`);
    }
  } else if (normalized.type === 'cookie') {
    requireResolved(normalized.value, environment, 'Cookie value', errors);
  } else if (normalized.type === 'oauth2') {
    const accessToken = resolveEnvironmentValue(normalized.accessToken, environment).trim();
    if (!accessToken) {
      requireResolved(normalized.refreshToken, environment, 'OAuth 2.0 refresh token', errors);
      requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
    }
  } else if (normalized.type === 'clientCertificate') {
    errors.push('Client certificate auth is modeled but not supported by the current request transport yet.');
  }
  return errors;
}

async function maybeRefreshOAuthToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2' || !shouldRefreshOAuthToken(normalized, environment, options.now)) {
    return { auth: normalized, refreshed: false };
  }
  return {
    auth: await refreshOAuthToken(normalized, environment, options),
    refreshed: true
  };
}

async function refreshOAuthToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for token refresh.');
  }

  const tokenUrl = requireResolvedValue(normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const refreshToken = requireResolvedValue(normalized.refreshToken, environment, 'OAuth 2.0 refresh token');
  const url = parseTokenUrl(tokenUrl);
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);

  const clientId = resolveEnvironmentValue(normalized.clientId, environment).trim();
  const clientSecret = resolveEnvironmentValue(normalized.clientSecret, environment);
  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  if (clientId) {
    body.set('client_id', clientId);
  }
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }
  if (scopes) {
    body.set('scope', scopes);
  }

  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body,
    signal: options.signal
  });

  const responseText = await response.text();
  let payload = {};
  if (responseText.trim()) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error('OAuth 2.0 token refresh returned invalid JSON.');
    }
  }
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `OAuth 2.0 token refresh failed with HTTP ${response.status}.`);
  }
  if (!payload.access_token) {
    throw new Error('OAuth 2.0 token refresh response did not include an access token.');
  }

  const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
  return normalizeAuth({
    ...normalized,
    tokenType,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
    expiresAt: expiresAtFromPayload(payload, options.now)
  });
}

function shouldRefreshOAuthToken(auth, environment, now = Date.now()) {
  if (!resolveEnvironmentValue(auth.refreshToken, environment).trim() || !resolveEnvironmentValue(auth.tokenUrl, environment).trim()) {
    return false;
  }
  if (!resolveEnvironmentValue(auth.accessToken, environment).trim()) {
    return true;
  }
  if (!auth.expiresAt) {
    return false;
  }
  const expiresAtMillis = Date.parse(auth.expiresAt);
  return Number.isFinite(expiresAtMillis) && expiresAtMillis <= Number(now) + OAUTH_REFRESH_WINDOW_MILLIS;
}

function applyAuth(request, environment, target) {
  const auth = normalizeAuth(request?.auth);
  if (auth.type === 'none') {
    return;
  }
  if (auth.type === 'bearer') {
    target.headers.Authorization = `Bearer ${resolveEnvironmentValue(auth.token, environment)}`;
  } else if (auth.type === 'basic') {
    const username = resolveEnvironmentValue(auth.username, environment);
    const password = resolveEnvironmentValue(auth.password, environment);
    target.headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  } else if (auth.type === 'apiKey') {
    const key = resolveEnvironmentValue(auth.key, environment).trim();
    const value = resolveEnvironmentValue(auth.value, environment);
    if (auth.location === 'query') {
      target.url.searchParams.append(key, value);
    } else {
      target.headers[key] = value;
    }
  } else if (auth.type === 'cookie') {
    target.headers.Cookie = resolveEnvironmentValue(auth.value, environment);
  } else if (auth.type === 'oauth2') {
    const accessToken = resolveEnvironmentValue(auth.accessToken, environment);
    target.headers.Authorization = `${auth.tokenType} ${accessToken}`;
  }
}

function redactAuth(auth = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type === 'none') {
    return normalized;
  }
  const redacted = { ...normalized };
  for (const key of ['token', 'password', 'value', 'accessToken', 'refreshToken', 'clientSecret', 'passphrase']) {
    if (Object.hasOwn(redacted, key) && redacted[key]) {
      redacted[key] = '<redacted>';
    }
  }
  return redacted;
}

function requireResolved(value, environment, label, errors) {
  const resolved = resolveEnvironmentValue(value, environment).trim();
  if (!resolved) {
    errors.push(`${label} is required.`);
  }
  return resolved;
}

function requireResolvedValue(value, environment, label) {
  const resolved = resolveEnvironmentValue(value, environment).trim();
  if (!resolved) {
    throw new Error(`${label} is required.`);
  }
  return resolved;
}

function parseTokenUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('OAuth 2.0 token URL is not a valid URI.');
  }
  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new Error('OAuth 2.0 token URL must use http or https.');
  }
  return url;
}

function normalizeTokenType(value) {
  if (typeof value === 'string' && value.toLowerCase() === 'bearer') {
    return 'Bearer';
  }
  if (typeof value === 'string' && value.toUpperCase() === 'MAC') {
    return 'MAC';
  }
  return OAUTH2_TOKEN_TYPES.has(value) ? value : 'Bearer';
}

function expiresAtFromPayload(payload, now = Date.now()) {
  const expiresIn = Number(payload.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    return '';
  }
  return new Date(Number(now) + Math.round(expiresIn * 1000)).toISOString();
}

module.exports = {
  API_KEY_LOCATIONS,
  AUTH_TYPES,
  OAUTH_REFRESH_WINDOW_MILLIS,
  applyAuth,
  maybeRefreshOAuthToken,
  normalizeAuth,
  redactAuth,
  refreshOAuthToken,
  shouldRefreshOAuthToken,
  validateAuth
};
