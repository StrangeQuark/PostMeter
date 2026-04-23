const crypto = require('node:crypto');
const { resolveEnvironmentValue } = require('./environmentResolver');
const {
  API_KEY_LOCATIONS: API_KEY_LOCATION_VALUES,
  AUTH_TYPE_VALUES,
  OAUTH2_GRANT_TYPES: OAUTH2_GRANT_TYPE_VALUES,
  OAUTH2_REDIRECT_STRATEGIES: OAUTH2_REDIRECT_STRATEGY_VALUES,
  OAUTH2_TOKEN_TYPES: OAUTH2_TOKEN_TYPE_VALUES
} = require('./payloadSchemas');

const AUTH_TYPES = new Set(AUTH_TYPE_VALUES);
const API_KEY_LOCATIONS = new Set(API_KEY_LOCATION_VALUES);
const OAUTH2_TOKEN_TYPES = new Set(OAUTH2_TOKEN_TYPE_VALUES);
const OAUTH2_GRANT_TYPES = new Set(OAUTH2_GRANT_TYPE_VALUES);
const OAUTH2_REDIRECT_STRATEGIES = new Set(OAUTH2_REDIRECT_STRATEGY_VALUES);
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const OAUTH_REFRESH_WINDOW_MILLIS = 60_000;
const OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS = 900;
const OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS = 5;
const OAUTH_DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const OAUTH_PKCE_CODE_VERIFIER_BYTES = 32;
const OAUTH_PKCE_STATE_BYTES = 24;

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
      deviceAuthorizationUrl: auth.deviceAuthorizationUrl ?? '',
      clientId: auth.clientId ?? '',
      clientSecret: auth.clientSecret ?? '',
      scopes: auth.scopes ?? '',
      grantType: OAUTH2_GRANT_TYPES.has(auth.grantType) ? auth.grantType : 'authorizationCode',
      redirectStrategy: OAUTH2_REDIRECT_STRATEGIES.has(auth.redirectStrategy) ? auth.redirectStrategy : 'loopback',
      redirectUri: auth.redirectUri ?? '',
      expiresAt: auth.expiresAt ?? '',
      deviceCode: auth.deviceCode ?? '',
      userCode: auth.userCode ?? '',
      verificationUri: auth.verificationUri ?? '',
      verificationUriComplete: auth.verificationUriComplete ?? '',
      deviceCodeExpiresAt: auth.deviceCodeExpiresAt ?? '',
      devicePollIntervalSeconds: auth.devicePollIntervalSeconds ?? ''
    };
  }
  return {
    type,
    certPath: auth.certPath ?? '',
    keyPath: auth.keyPath ?? '',
    pfxPath: auth.pfxPath ?? '',
    caPath: auth.caPath ?? '',
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
    if (accessToken) {
      return errors;
    }
    if (normalized.grantType === 'clientCredentials') {
      requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
      requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
      requireResolved(normalized.clientSecret, environment, 'OAuth 2.0 client secret', errors);
    } else if (normalized.grantType === 'deviceCode') {
      if (resolveEnvironmentValue(normalized.deviceCode, environment).trim()) {
        requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
        requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
      } else {
        requireResolved(normalized.deviceAuthorizationUrl, environment, 'OAuth 2.0 device authorization URL', errors);
        requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
        requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
        errors.push('Start and complete the OAuth 2.0 device-code flow before sending this request.');
      }
    } else {
      const refreshToken = resolveEnvironmentValue(normalized.refreshToken, environment).trim();
      if (refreshToken) {
        requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
      } else {
        requireResolved(normalized.authorizationUrl, environment, 'OAuth 2.0 authorization URL', errors);
        requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
        requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
        errors.push('Start and complete the OAuth 2.0 authorization-code flow before sending this request.');
      }
    }
  } else if (normalized.type === 'clientCertificate') {
    const pfxPath = resolveEnvironmentValue(normalized.pfxPath, environment).trim();
    const certPath = resolveEnvironmentValue(normalized.certPath, environment).trim();
    const keyPath = resolveEnvironmentValue(normalized.keyPath, environment).trim();
    if (pfxPath) {
      return errors;
    }
    if (!certPath && !keyPath) {
      errors.push('Client certificate auth requires a PEM certificate/key pair or a PFX/P12 bundle.');
    } else {
      if (!certPath) {
        errors.push('Client certificate PEM certificate path is required.');
      }
      if (!keyPath) {
        errors.push('Client certificate PEM key path is required.');
      }
    }
  }
  return errors;
}

async function maybeRefreshOAuthToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    return { auth: normalized, refreshed: false };
  }
  if (normalized.grantType === 'clientCredentials') {
    if (!shouldRequestClientCredentialsToken(normalized, environment, options.now)) {
      return { auth: normalized, refreshed: false };
    }
    return {
      auth: await requestOAuthClientCredentialsToken(normalized, environment, options),
      refreshed: true
    };
  }
  if (normalized.grantType === 'deviceCode') {
    if (shouldRefreshOAuthToken(normalized, environment, options.now)) {
      return {
        auth: await refreshOAuthToken(normalized, environment, options),
        refreshed: true
      };
    }
    if (!shouldPollOAuthDeviceToken(normalized, environment, options.now)) {
      return { auth: normalized, refreshed: false };
    }
    return {
      auth: await pollOAuthDeviceToken(normalized, environment, options),
      refreshed: true
    };
  }
  if (!shouldRefreshOAuthToken(normalized, environment, options.now)) {
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

  const payload = await postOAuthTokenRequest(url, body, options, 'OAuth 2.0 token refresh');

  const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
  return normalizeAuth({
    ...normalized,
    tokenType,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
    expiresAt: expiresAtFromPayload(payload, options.now)
  });
}

async function requestOAuthClientCredentialsToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for client credentials token requests.');
  }
  if (normalized.grantType !== 'clientCredentials') {
    throw new Error('OAuth 2.0 client credentials grant is required for client credentials token requests.');
  }

  const tokenUrl = requireResolvedValue(normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const clientId = requireResolvedValue(normalized.clientId, environment, 'OAuth 2.0 client ID');
  const clientSecret = requireResolvedValue(normalized.clientSecret, environment, 'OAuth 2.0 client secret');
  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  if (scopes) {
    body.set('scope', scopes);
  }

  const payload = await postOAuthTokenRequest(parseTokenUrl(tokenUrl), body, options, 'OAuth 2.0 client credentials token request');
  const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
  return normalizeAuth({
    ...normalized,
    tokenType,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
    expiresAt: expiresAtFromPayload(payload, options.now)
  });
}

function createOAuthPkceSession(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for authorization-code PKCE.');
  }
  if (normalized.grantType !== 'authorizationCode') {
    throw new Error('OAuth 2.0 authorization-code grant is required for PKCE.');
  }

  const authorizationUrl = requireResolvedValue(normalized.authorizationUrl, environment, 'OAuth 2.0 authorization URL');
  const tokenUrl = requireResolvedValue(normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const clientId = requireResolvedValue(normalized.clientId, environment, 'OAuth 2.0 client ID');
  const redirectUri = requireResolvedValue(options.redirectUri || normalized.redirectUri, environment, 'OAuth 2.0 redirect URI');
  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  const state = options.state || randomBase64Url(OAUTH_PKCE_STATE_BYTES);
  const codeVerifier = options.codeVerifier || randomBase64Url(OAUTH_PKCE_CODE_VERIFIER_BYTES);
  validatePkceCodeVerifier(codeVerifier);
  const codeChallenge = pkceChallengeForVerifier(codeVerifier);

  const url = parseTokenUrl(authorizationUrl, 'OAuth 2.0 authorization URL');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  if (scopes) {
    url.searchParams.set('scope', scopes);
  }

  return {
    authorizationUrl: url.toString(),
    tokenUrl,
    redirectUri,
    clientId,
    clientSecret: resolveEnvironmentValue(normalized.clientSecret, environment),
    scopes,
    state,
    codeVerifier,
    codeChallenge
  };
}

async function exchangeOAuthAuthorizationCode(auth = {}, session, callbackUrl, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for authorization-code exchange.');
  }
  if (!session || typeof session !== 'object') {
    throw new Error('OAuth 2.0 PKCE session is required for authorization-code exchange.');
  }

  const parsedCallback = parseCallbackUrl(callbackUrl);
  const error = parsedCallback.searchParams.get('error');
  if (error) {
    const description = parsedCallback.searchParams.get('error_description');
    throw new Error(description || error);
  }
  const state = parsedCallback.searchParams.get('state');
  if (!state || state !== session.state) {
    throw new Error('OAuth 2.0 authorization response state did not match the active request.');
  }
  const code = parsedCallback.searchParams.get('code');
  if (!code) {
    throw new Error('OAuth 2.0 authorization response did not include an authorization code.');
  }

  const tokenUrl = requireResolvedValue(session.tokenUrl || normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const clientId = requireResolvedValue(session.clientId || normalized.clientId, environment, 'OAuth 2.0 client ID');
  const redirectUri = requireResolvedValue(session.redirectUri || normalized.redirectUri, environment, 'OAuth 2.0 redirect URI');
  const codeVerifier = requireResolvedValue(session.codeVerifier, environment, 'OAuth 2.0 PKCE code verifier');
  validatePkceCodeVerifier(codeVerifier);
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  body.set('client_id', clientId);
  body.set('code_verifier', codeVerifier);
  const clientSecret = resolveEnvironmentValue(session.clientSecret || normalized.clientSecret, environment);
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const payload = await postOAuthTokenRequest(
    parseTokenUrl(tokenUrl),
    body,
    options,
    'OAuth 2.0 authorization-code token request'
  );
  const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
  return normalizeAuth({
    ...normalized,
    tokenType,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
    expiresAt: expiresAtFromPayload(payload, options.now),
    redirectUri
  });
}

async function requestOAuthDeviceAuthorization(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for device authorization.');
  }
  if (normalized.grantType !== 'deviceCode') {
    throw new Error('OAuth 2.0 device-code grant is required for device authorization.');
  }

  const deviceAuthorizationUrl = requireResolvedValue(normalized.deviceAuthorizationUrl, environment, 'OAuth 2.0 device authorization URL');
  const clientId = requireResolvedValue(normalized.clientId, environment, 'OAuth 2.0 client ID');
  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  if (scopes) {
    body.set('scope', scopes);
  }

  const payload = await postOAuthTokenRequest(
    parseTokenUrl(deviceAuthorizationUrl, 'OAuth 2.0 device authorization URL'),
    body,
    options,
    'OAuth 2.0 device authorization request',
    { requireAccessToken: false }
  );
  if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new Error('OAuth 2.0 device authorization response did not include device_code, user_code, and verification_uri.');
  }
  parseTokenUrl(String(payload.verification_uri), 'OAuth 2.0 verification URL');
  if (payload.verification_uri_complete) {
    parseTokenUrl(String(payload.verification_uri_complete), 'OAuth 2.0 complete verification URL');
  }

  const expiresIn = positiveNumberOrDefault(payload.expires_in, OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS);
  const interval = positiveNumberOrDefault(payload.interval, OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS);
  return normalizeAuth({
    ...normalized,
    deviceCode: String(payload.device_code),
    userCode: String(payload.user_code),
    verificationUri: String(payload.verification_uri),
    verificationUriComplete: payload.verification_uri_complete ? String(payload.verification_uri_complete) : '',
    deviceCodeExpiresAt: new Date(Number(options.now || Date.now()) + Math.round(expiresIn * 1000)).toISOString(),
    devicePollIntervalSeconds: String(interval)
  });
}

async function pollOAuthDeviceToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2' || normalized.grantType !== 'deviceCode') {
    throw new Error('OAuth 2.0 device-code auth is required for device token polling.');
  }

  const tokenUrl = requireResolvedValue(normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const deviceCode = requireResolvedValue(normalized.deviceCode, environment, 'OAuth 2.0 device code');
  const clientId = requireResolvedValue(normalized.clientId, environment, 'OAuth 2.0 client ID');
  const clientSecret = resolveEnvironmentValue(normalized.clientSecret, environment);
  let intervalMillis = positiveNumberOrDefault(normalized.devicePollIntervalSeconds, OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS) * 1000;
  const now = Number(options.now || Date.now());
  const deadline = deviceCodeDeadlineMillis(normalized, now);
  const fetchOptions = { ...options };
  delete fetchOptions.now;

  while (Date.now() <= deadline) {
    options.onProgress?.({
      status: 'polling',
      nextAttemptAt: new Date(Date.now() + intervalMillis).toISOString()
    });
    const body = new URLSearchParams();
    body.set('grant_type', OAUTH_DEVICE_GRANT_TYPE);
    body.set('device_code', deviceCode);
    body.set('client_id', clientId);
    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    try {
      const payload = await postOAuthTokenRequest(
        parseTokenUrl(tokenUrl),
        body,
        fetchOptions,
        'OAuth 2.0 device token request'
      );
      const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
      return normalizeAuth({
        ...normalized,
        tokenType,
        accessToken: String(payload.access_token),
        refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
        expiresAt: expiresAtFromPayload(payload, Date.now()),
        deviceCode: '',
        userCode: '',
        verificationUri: '',
        verificationUriComplete: '',
        deviceCodeExpiresAt: '',
        devicePollIntervalSeconds: ''
      });
    } catch (error) {
      if (error.oauthError === 'authorization_pending') {
        await sleep(intervalMillis, options.signal);
        continue;
      }
      if (error.oauthError === 'slow_down') {
        intervalMillis += 5000;
        await sleep(intervalMillis, options.signal);
        continue;
      }
      if (error.oauthError === 'access_denied') {
        throw new Error('OAuth 2.0 device authorization was denied.');
      }
      if (error.oauthError === 'expired_token') {
        throw new Error('OAuth 2.0 device authorization expired.');
      }
      throw error;
    }
  }

  throw new Error('OAuth 2.0 device authorization timed out.');
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

function shouldPollOAuthDeviceToken(auth, environment, now = Date.now()) {
  if (!resolveEnvironmentValue(auth.tokenUrl, environment).trim()
    || !resolveEnvironmentValue(auth.clientId, environment).trim()
    || !resolveEnvironmentValue(auth.deviceCode, environment).trim()) {
    return false;
  }
  if (resolveEnvironmentValue(auth.accessToken, environment).trim()) {
    return false;
  }
  const deadline = deviceCodeDeadlineMillis(auth, Number(now));
  return deadline > Number(now);
}

function shouldRequestClientCredentialsToken(auth, environment, now = Date.now()) {
  if (!resolveEnvironmentValue(auth.tokenUrl, environment).trim()
    || !resolveEnvironmentValue(auth.clientId, environment).trim()
    || !resolveEnvironmentValue(auth.clientSecret, environment).trim()) {
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

function parseTokenUrl(value, label = 'OAuth 2.0 token URL') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URI.`);
  }
  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new Error(`${label} must use http or https.`);
  }
  return url;
}

function parseCallbackUrl(value) {
  try {
    return new URL(String(value));
  } catch {
    throw new Error('OAuth 2.0 authorization callback URL is not valid.');
  }
}

async function postOAuthTokenRequest(url, body, options, label, requestOptions = {}) {
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
      throw new Error(`${label} returned invalid JSON.`);
    }
  }
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || `${label} failed with HTTP ${response.status}.`);
    error.oauthError = payload.error ? String(payload.error) : '';
    error.status = response.status;
    throw error;
  }
  if (requestOptions.requireAccessToken !== false && !payload.access_token) {
    throw new Error(`${label} response did not include an access token.`);
  }
  return payload;
}

function deviceCodeDeadlineMillis(auth, now = Date.now()) {
  const explicit = Date.parse(auth.deviceCodeExpiresAt);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  return Number(now) + OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS * 1000;
}

function positiveNumberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sleep(milliseconds, signal) {
  if (signal?.aborted) {
    return Promise.reject(signal.reason || new Error('Operation cancelled.'));
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason || new Error('Operation cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function pkceChallengeForVerifier(codeVerifier) {
  validatePkceCodeVerifier(codeVerifier);
  return crypto
    .createHash('sha256')
    .update(String(codeVerifier))
    .digest('base64url');
}

function randomBase64Url(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function validatePkceCodeVerifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(value)) {
    throw new Error('OAuth 2.0 PKCE code verifier must be 43 to 128 URL-safe characters.');
  }
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
  OAUTH2_GRANT_TYPES,
  OAUTH2_REDIRECT_STRATEGIES,
  OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS,
  OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS,
  OAUTH_DEVICE_GRANT_TYPE,
  OAUTH_REFRESH_WINDOW_MILLIS,
  applyAuth,
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  maybeRefreshOAuthToken,
  normalizeAuth,
  pkceChallengeForVerifier,
  pollOAuthDeviceToken,
  refreshOAuthToken,
  requestOAuthClientCredentialsToken,
  requestOAuthDeviceAuthorization,
  shouldPollOAuthDeviceToken,
  shouldRequestClientCredentialsToken,
  shouldRefreshOAuthToken,
  validateAuth
};
