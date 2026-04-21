const { resolveEnvironmentValue } = require('./environmentResolver');

const AUTH_TYPES = new Set(['none', 'bearer', 'basic', 'apiKey', 'cookie', 'oauth2', 'clientCertificate']);
const API_KEY_LOCATIONS = new Set(['header', 'query']);
const OAUTH2_TOKEN_TYPES = new Set(['Bearer', 'MAC']);
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

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
      grantType: auth.grantType ?? 'authorizationCode'
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
    requireResolved(normalized.accessToken, environment, 'OAuth 2.0 access token', errors);
  } else if (normalized.type === 'clientCertificate') {
    errors.push('Client certificate auth is modeled but not supported by the current request transport yet.');
  }
  return errors;
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

module.exports = {
  API_KEY_LOCATIONS,
  AUTH_TYPES,
  applyAuth,
  normalizeAuth,
  redactAuth,
  validateAuth
};
