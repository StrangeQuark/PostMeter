const crypto = require('node:crypto');
const { resolveEnvironmentValue } = require('./environmentResolver');
const {
  API_KEY_LOCATIONS,
  AUTH_TYPES,
  OAUTH2_GRANT_TYPES,
  OAUTH2_REDIRECT_STRATEGIES,
  OAUTH2_TOKEN_TYPES,
  normalizeAuth
} = require('./authModel');

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const OAUTH_REFRESH_WINDOW_MILLIS = 60_000;
const OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS = 900;
const OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS = 5;
const OAUTH_DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const OAUTH_PKCE_CODE_VERIFIER_BYTES = 32;
const OAUTH_PKCE_STATE_BYTES = 24;
const OAUTH_REDACTED_VALUE = '[redacted]';
const OAUTH_SECRET_FIELD_NAMES = [
  'token',
  'secret',
  'cookie',
  'set-cookie',
  'set_cookie',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'id_token',
  'idToken',
  'client_secret',
  'clientSecret',
  'client_assertion',
  'clientAssertion',
  'code',
  'authorization_code',
  'authorizationCode',
  'code_verifier',
  'codeVerifier',
  'device_code',
  'deviceCode',
  'user_code',
  'userCode',
  'authorization',
  'authorization_header',
  'authorizationHeader',
  'auth-header',
  'auth_header',
  'authHeader',
  'proxy-authorization',
  'proxy_authorization',
  'proxyAuthorization',
  'proxy-authorization-header',
  'proxy_authorization_header',
  'proxyAuthorizationHeader'
];
const OAUTH_AUTHORIZATION_HEADER_PATTERN = /\b((?:(?:Proxy[-_]?Authorization|Authorization)(?:[-_]?Header)?|Auth[-_]?Header))(\s*[:=]\s*)(["']?)(?!(?:(?:Bearer|Basic|OAuth)\s+)?(?:\[redacted\]|redacted)\3?(?=\s|[;,.)\]]|$))(?:(?:Bearer|Basic|OAuth)\s+)?[A-Za-z0-9._~+/=-]+(?:\3)?/gi;
const DIGEST_SUPPORTED_ALGORITHMS = new Map([
  ['md5', 'md5'],
  ['md5-sess', 'md5'],
  ['sha-256', 'sha256'],
  ['sha-256-sess', 'sha256'],
  ['sha-512-256', 'sha512-256'],
  ['sha-512-256-sess', 'sha512-256']
]);
const AWS_ALGORITHM = 'AWS4-HMAC-SHA256';
const OAUTH1_SIGNATURE_METHODS = new Set(['HMAC-SHA1', 'HMAC-SHA256', 'PLAINTEXT']);

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
    if (resolveEnvironmentValue(normalized.certificateId, environment).trim()) {
      return errors;
    }
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
  } else if (normalized.type === 'digest') {
    requireResolved(normalized.username, environment, 'Digest auth username', errors);
    requireResolved(normalized.password, environment, 'Digest auth password', errors);
    const algorithm = normalizeDigestAlgorithm(resolveEnvironmentValue(normalized.algorithm, environment));
    if (!algorithm) {
      errors.push(`Unsupported Digest auth algorithm: ${normalized.algorithm}.`);
    }
  } else if (normalized.type === 'hawk') {
    requireResolved(normalized.authId, environment, 'Hawk auth ID', errors);
    requireResolved(normalized.authKey, environment, 'Hawk auth key', errors);
    const algorithm = String(resolveEnvironmentValue(normalized.algorithm, environment) || 'sha256').toLowerCase();
    if (algorithm !== 'sha1' && algorithm !== 'sha256') {
      errors.push(`Unsupported Hawk auth algorithm: ${normalized.algorithm}.`);
    }
  } else if (normalized.type === 'aws') {
    requireResolved(normalized.accessKey, environment, 'AWS access key', errors);
    requireResolved(normalized.secretKey, environment, 'AWS secret key', errors);
    requireResolved(normalized.region, environment, 'AWS region', errors);
    requireResolved(normalized.service, environment, 'AWS service', errors);
  } else if (normalized.type === 'oauth1') {
    requireResolved(normalized.consumerKey, environment, 'OAuth 1.0 consumer key', errors);
    requireResolved(normalized.consumerSecret, environment, 'OAuth 1.0 consumer secret', errors);
    const signatureMethod = normalizeOAuth1SignatureMethod(resolveEnvironmentValue(normalized.signatureMethod, environment));
    if (!OAUTH1_SIGNATURE_METHODS.has(signatureMethod)) {
      errors.push(`Unsupported OAuth 1.0 signature method: ${normalized.signatureMethod}.`);
    }
  } else if (normalized.type === 'ntlm') {
    requireResolved(normalized.username, environment, 'NTLM auth username', errors);
    requireResolved(normalized.password, environment, 'NTLM auth password', errors);
  } else if (normalized.type === 'akamaiEdgeGrid') {
    requireResolved(normalized.accessToken, environment, 'Akamai EdgeGrid access token', errors);
    requireResolved(normalized.clientToken, environment, 'Akamai EdgeGrid client token', errors);
    requireResolved(normalized.clientSecret, environment, 'Akamai EdgeGrid client secret', errors);
  } else if (normalized.type === 'jwtBearer') {
    const algorithm = normalizeJwtAlgorithm(resolveEnvironmentValue(normalized.algorithm, environment));
    if (!algorithm) {
      errors.push(`Unsupported JWT Bearer algorithm: ${normalized.algorithm}.`);
    } else if (algorithm.startsWith('HS')) {
      requireResolved(normalized.secret, environment, 'JWT Bearer secret', errors);
    } else {
      requireResolved(normalized.privateKey, environment, 'JWT Bearer private key', errors);
    }
  } else if (normalized.type === 'asap') {
    const algorithm = normalizeJwtAlgorithm(resolveEnvironmentValue(normalized.algorithm, environment) || 'RS256');
    if (!algorithm) {
      errors.push(`Unsupported ASAP algorithm: ${normalized.algorithm}.`);
    } else if (algorithm.startsWith('HS')) {
      requireResolved(normalized.secret, environment, 'ASAP secret', errors);
    } else {
      requireResolved(normalized.privateKey, environment, 'ASAP private key', errors);
    }
    requireResolved(normalized.issuer, environment, 'ASAP issuer', errors);
    requireResolved(normalized.audience, environment, 'ASAP audience', errors);
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
    throw new Error(redactOAuthErrorMessage(description || error));
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
  } else if (auth.type === 'digest') {
    if (auth.realm && auth.nonce) {
      setHeader(target.headers, 'Authorization', buildDigestAuthorizationHeader(auth, environment, target));
    }
  } else if (auth.type === 'hawk') {
    setHeader(target.headers, 'Authorization', buildHawkAuthorizationHeader(auth, environment, target));
  } else if (auth.type === 'aws') {
    applyAwsSignature(auth, environment, target);
  } else if (auth.type === 'oauth1') {
    applyOAuth1Signature(auth, environment, target);
  } else if (auth.type === 'ntlm') {
    setHeader(target.headers, 'Authorization', buildNtlmType1AuthorizationHeader(auth, environment));
  } else if (auth.type === 'akamaiEdgeGrid') {
    applyAkamaiEdgeGridSignature(auth, environment, target);
  } else if (auth.type === 'jwtBearer') {
    applyJwtBearerAuth(auth, environment, target);
  } else if (auth.type === 'asap') {
    applyAsapAuth(auth, environment, target);
  }
}

function applyDigestChallengeAuth(request, environment, target, challenge) {
  const auth = normalizeAuth(request?.auth);
  if (auth.type !== 'digest') {
    return false;
  }
  setHeader(target.headers, 'Authorization', buildDigestAuthorizationHeader({
    ...auth,
    ...challenge
  }, environment, target));
  return true;
}

function buildDigestAuthorizationHeader(auth, environment, target) {
  const username = resolveEnvironmentValue(auth.username, environment);
  const password = resolveEnvironmentValue(auth.password, environment);
  const realm = resolveEnvironmentValue(auth.realm, environment);
  const nonce = resolveEnvironmentValue(auth.nonce, environment);
  const algorithmName = String(resolveEnvironmentValue(auth.algorithm, environment) || 'MD5');
  const algorithm = normalizeDigestAlgorithm(algorithmName);
  if (!algorithm) {
    throw new Error(`Unsupported Digest auth algorithm: ${algorithmName}.`);
  }
  if (!realm || !nonce) {
    throw new Error('Digest auth requires a server challenge with realm and nonce.');
  }
  const qop = String(resolveEnvironmentValue(auth.qop, environment) || 'auth')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item === 'auth') || '';
  const opaque = resolveEnvironmentValue(auth.opaque, environment);
  const cnonce = resolveEnvironmentValue(auth.clientNonce, environment).trim() || crypto.randomBytes(8).toString('hex');
  const nc = resolveEnvironmentValue(auth.nonceCount, environment).trim() || '00000001';
  const uri = `${target.url.pathname}${target.url.search}`;
  let ha1 = digestHash(algorithm.hash, `${username}:${realm}:${password}`);
  if (algorithm.sess) {
    ha1 = digestHash(algorithm.hash, `${ha1}:${nonce}:${cnonce}`);
  }
  const ha2 = digestHash(algorithm.hash, `${target.method || 'GET'}:${uri}`);
  const response = qop
    ? digestHash(algorithm.hash, `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : digestHash(algorithm.hash, `${ha1}:${nonce}:${ha2}`);
  const fields = [
    ['username', username],
    ['realm', realm],
    ['nonce', nonce],
    ['uri', uri],
    ['response', response],
    ['algorithm', algorithm.label]
  ];
  if (opaque) {
    fields.push(['opaque', opaque]);
  }
  if (qop) {
    fields.push(['qop', qop, false], ['nc', nc, false], ['cnonce', cnonce]);
  }
  return `Digest ${fields.map(([key, value, quoted = true]) => `${key}=${quoted ? quoteAuthValue(value) : value}`).join(', ')}`;
}

function parseDigestChallenge(headerValues) {
  const header = Array.isArray(headerValues) ? headerValues.find((value) => /^digest\b/i.test(String(value))) : String(headerValues || '');
  if (!/^digest\b/i.test(header)) {
    return null;
  }
  const text = header.replace(/^digest\s+/i, '');
  const fields = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))(?:,|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    const raw = match[2] != null ? match[2].replace(/\\"/g, '"') : String(match[3] || '').trim();
    fields[key] = raw;
  }
  if (!fields.realm || !fields.nonce) {
    return null;
  }
  return {
    realm: fields.realm,
    nonce: fields.nonce,
    algorithm: fields.algorithm || 'MD5',
    qop: fields.qop || '',
    opaque: fields.opaque || ''
  };
}

function normalizeDigestAlgorithm(value) {
  const label = String(value || 'MD5').trim() || 'MD5';
  const hash = DIGEST_SUPPORTED_ALGORITHMS.get(label.toLowerCase());
  if (!hash) {
    return null;
  }
  return {
    hash,
    label,
    sess: label.toLowerCase().endsWith('-sess')
  };
}

function digestHash(algorithm, value) {
  return crypto.createHash(algorithm).update(value, 'utf8').digest('hex');
}

function buildHawkAuthorizationHeader(auth, environment, target) {
  const id = resolveEnvironmentValue(auth.authId, environment);
  const key = resolveEnvironmentValue(auth.authKey, environment);
  const algorithm = String(resolveEnvironmentValue(auth.algorithm, environment) || 'sha256').toLowerCase();
  if (algorithm !== 'sha1' && algorithm !== 'sha256') {
    throw new Error(`Unsupported Hawk auth algorithm: ${auth.algorithm}.`);
  }
  const ts = String(Math.floor(Number(target.now || Date.now()) / 1000));
  const nonce = resolveEnvironmentValue(auth.nonce, environment).trim() || crypto.randomBytes(6).toString('hex');
  const ext = resolveEnvironmentValue(auth.extraData, environment);
  const app = resolveEnvironmentValue(auth.app, environment);
  const dlg = resolveEnvironmentValue(auth.delegation, environment);
  const port = target.url.port || (target.url.protocol === 'https:' ? '443' : '80');
  const normalized = [
    'hawk.1.header',
    ts,
    nonce,
    String(target.method || 'GET').toUpperCase(),
    `${target.url.pathname}${target.url.search}`,
    target.url.hostname.toLowerCase(),
    port,
    '',
    ext,
    app,
    dlg,
    ''
  ].join('\n');
  const mac = crypto.createHmac(algorithm, key).update(normalized, 'utf8').digest('base64');
  const fields = [
    ['id', id],
    ['ts', ts],
    ['nonce', nonce],
    ['mac', mac]
  ];
  if (ext) {
    fields.push(['ext', ext]);
  }
  if (app) {
    fields.push(['app', app]);
  }
  if (dlg) {
    fields.push(['dlg', dlg]);
  }
  return `Hawk ${fields.map(([name, value]) => `${name}=${quoteAuthValue(value)}`).join(', ')}`;
}

function applyAwsSignature(auth, environment, target) {
  const accessKey = resolveEnvironmentValue(auth.accessKey, environment);
  const secretKey = resolveEnvironmentValue(auth.secretKey, environment);
  const region = resolveEnvironmentValue(auth.region, environment);
  const service = resolveEnvironmentValue(auth.service, environment);
  const sessionToken = resolveEnvironmentValue(auth.sessionToken, environment);
  const amzDate = awsAmzDate(target.now || Date.now());
  const shortDate = amzDate.slice(0, 8);
  setHeader(target.headers, 'Host', hostHeader(target.url));
  if (auth.addAuthDataToQuery === true) {
    target.url.searchParams.set('X-Amz-Algorithm', AWS_ALGORITHM);
    target.url.searchParams.set('X-Amz-Credential', `${accessKey}/${shortDate}/${region}/${service}/aws4_request`);
    target.url.searchParams.set('X-Amz-Date', amzDate);
    target.url.searchParams.set('X-Amz-Expires', '900');
    if (sessionToken) {
      target.url.searchParams.set('X-Amz-Security-Token', sessionToken);
    }
  } else {
    setHeader(target.headers, 'X-Amz-Date', amzDate);
    if (sessionToken) {
      setHeader(target.headers, 'X-Amz-Security-Token', sessionToken);
    }
  }
  const signedHeaders = awsSignedHeaderNames(target.headers);
  if (auth.addAuthDataToQuery === true) {
    target.url.searchParams.set('X-Amz-SignedHeaders', signedHeaders);
  }
  const canonicalRequest = [
    String(target.method || 'GET').toUpperCase(),
    awsCanonicalUri(target.url),
    awsCanonicalQuery(target.url),
    awsCanonicalHeaders(target.headers),
    signedHeaders,
    sha256Hex(target.body || '')
  ].join('\n');
  const credentialScope = `${shortDate}/${region}/${service}/aws4_request`;
  const stringToSign = [
    AWS_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const signature = crypto
    .createHmac('sha256', awsSigningKey(secretKey, shortDate, region, service))
    .update(stringToSign, 'utf8')
    .digest('hex');
  if (auth.addAuthDataToQuery === true) {
    target.url.searchParams.set('X-Amz-Signature', signature);
    return;
  }
  setHeader(
    target.headers,
    'Authorization',
    `${AWS_ALGORITHM} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}

function applyOAuth1Signature(auth, environment, target) {
  const signatureMethod = normalizeOAuth1SignatureMethod(resolveEnvironmentValue(auth.signatureMethod, environment));
  if (!OAUTH1_SIGNATURE_METHODS.has(signatureMethod)) {
    throw new Error(`Unsupported OAuth 1.0 signature method: ${auth.signatureMethod}.`);
  }
  const params = {
    oauth_consumer_key: resolveEnvironmentValue(auth.consumerKey, environment),
    oauth_nonce: resolveEnvironmentValue(auth.nonce, environment).trim() || crypto.randomBytes(12).toString('hex'),
    oauth_signature_method: signatureMethod,
    oauth_timestamp: resolveEnvironmentValue(auth.timestamp, environment).trim() || String(Math.floor(Number(target.now || Date.now()) / 1000)),
    oauth_version: resolveEnvironmentValue(auth.version, environment).trim() || '1.0'
  };
  const token = resolveEnvironmentValue(auth.token, environment);
  if (token) {
    params.oauth_token = token;
  }
  const baseParams = new URLSearchParams(target.url.search);
  for (const [key, value] of Object.entries(params)) {
    baseParams.append(key, value);
  }
  const baseUrl = `${target.url.protocol}//${target.url.host}${target.url.pathname}`;
  const normalizedParams = [...baseParams.entries()]
    .map(([key, value]) => [oauthPercentEncode(key), oauthPercentEncode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const baseString = [
    String(target.method || 'GET').toUpperCase(),
    oauthPercentEncode(baseUrl),
    oauthPercentEncode(normalizedParams)
  ].join('&');
  const signingKey = `${oauthPercentEncode(resolveEnvironmentValue(auth.consumerSecret, environment))}&${oauthPercentEncode(resolveEnvironmentValue(auth.tokenSecret, environment))}`;
  const signature = signatureMethod === 'PLAINTEXT'
    ? signingKey
    : crypto
      .createHmac(signatureMethod === 'HMAC-SHA256' ? 'sha256' : 'sha1', signingKey)
      .update(baseString, 'utf8')
      .digest('base64');
  const headerParams = {
    ...params,
    oauth_signature: signature
  };
  const realm = resolveEnvironmentValue(auth.realm, environment);
  const parts = realm ? [`realm=${quoteAuthValue(realm)}`] : [];
  for (const key of Object.keys(headerParams).sort()) {
    parts.push(`${oauthPercentEncode(key)}=${quoteAuthValue(oauthPercentEncode(headerParams[key]))}`);
  }
  setHeader(target.headers, 'Authorization', `OAuth ${parts.join(', ')}`);
}

function buildNtlmType1AuthorizationHeader(auth, environment) {
  const domain = resolveEnvironmentValue(auth.domain, environment).toUpperCase();
  const workstation = resolveEnvironmentValue(auth.workstation, environment).toUpperCase();
  const flags = 0x00000001 | 0x00000002 | 0x00000200 | 0x00008000 | 0x00080000 | 0x20000000 | 0x02000000;
  const domainBuffer = Buffer.from(domain, 'ascii');
  const workstationBuffer = Buffer.from(workstation, 'ascii');
  const payloadOffset = 32;
  const message = Buffer.alloc(payloadOffset + domainBuffer.length + workstationBuffer.length);
  message.write('NTLMSSP\0', 0, 'ascii');
  message.writeUInt32LE(1, 8);
  message.writeUInt32LE(flags, 12);
  writeSecurityBuffer(message, 16, domainBuffer.length, payloadOffset);
  writeSecurityBuffer(message, 24, workstationBuffer.length, payloadOffset + domainBuffer.length);
  domainBuffer.copy(message, payloadOffset);
  workstationBuffer.copy(message, payloadOffset + domainBuffer.length);
  return `NTLM ${message.toString('base64')}`;
}

function buildNtlmType3AuthorizationHeader(auth, environment, challengeHeader, options = {}) {
  const challenge = parseNtlmChallenge(challengeHeader);
  if (!challenge) {
    throw new Error('NTLM auth requires a server NTLM challenge.');
  }
  const username = resolveEnvironmentValue(auth.username, environment);
  const password = resolveEnvironmentValue(auth.password, environment);
  const domain = resolveEnvironmentValue(auth.domain, environment).toUpperCase();
  const workstation = resolveEnvironmentValue(auth.workstation, environment).toUpperCase();
  const timestamp = ntlmTimestamp(options.now || Date.now());
  const clientNonce = crypto.randomBytes(8);
  const ntlmHash = md4(Buffer.from(password, 'utf16le'));
  const ntlmV2Hash = crypto.createHmac('md5', ntlmHash)
    .update(Buffer.from(`${username.toUpperCase()}${challenge.targetName || domain}`, 'utf16le'))
    .digest();
  const targetInfo = challenge.targetInfo.length ? challenge.targetInfo : Buffer.from([0, 0, 0, 0]);
  const blob = Buffer.concat([
    Buffer.from('0101000000000000', 'hex'),
    timestamp,
    clientNonce,
    Buffer.alloc(4),
    targetInfo,
    Buffer.alloc(4)
  ]);
  const ntProof = crypto.createHmac('md5', ntlmV2Hash).update(Buffer.concat([challenge.serverChallenge, blob])).digest();
  const ntResponse = Buffer.concat([ntProof, blob]);
  const lmResponse = Buffer.concat([
    crypto.createHmac('md5', ntlmV2Hash).update(Buffer.concat([challenge.serverChallenge, clientNonce])).digest(),
    clientNonce
  ]);
  const domainBuffer = Buffer.from(domain, 'utf16le');
  const userBuffer = Buffer.from(username, 'utf16le');
  const workstationBuffer = Buffer.from(workstation, 'utf16le');
  const sessionKey = Buffer.alloc(0);
  const flags = challenge.flags || 0x02888205;
  const payloadOffset = 64;
  let offset = payloadOffset;
  const message = Buffer.alloc(payloadOffset + lmResponse.length + ntResponse.length + domainBuffer.length + userBuffer.length + workstationBuffer.length);
  message.write('NTLMSSP\0', 0, 'ascii');
  message.writeUInt32LE(3, 8);
  offset = writeSecurityBufferWithPayload(message, 12, lmResponse, offset);
  offset = writeSecurityBufferWithPayload(message, 20, ntResponse, offset);
  offset = writeSecurityBufferWithPayload(message, 28, domainBuffer, offset);
  offset = writeSecurityBufferWithPayload(message, 36, userBuffer, offset);
  offset = writeSecurityBufferWithPayload(message, 44, workstationBuffer, offset);
  writeSecurityBuffer(message, 52, sessionKey.length, offset);
  message.writeUInt32LE(flags, 60);
  return `NTLM ${message.toString('base64')}`;
}

function parseNtlmChallenge(headerValues) {
  const header = Array.isArray(headerValues)
    ? headerValues.find((value) => /^ntlm\s+\S+/i.test(String(value)))
    : String(headerValues || '').split(',').map((value) => value.trim()).find((value) => /^ntlm\s+\S+/i.test(value));
  if (!header) {
    return null;
  }
  let message;
  try {
    message = Buffer.from(String(header).replace(/^ntlm\s+/i, ''), 'base64');
  } catch {
    return null;
  }
  if (message.length < 32 || message.slice(0, 8).toString('ascii') !== 'NTLMSSP\0' || message.readUInt32LE(8) !== 2) {
    return null;
  }
  const targetName = readSecurityBuffer(message, 12).toString('utf16le');
  const flags = message.readUInt32LE(20);
  const serverChallenge = message.slice(24, 32);
  const targetInfo = message.length >= 48 ? readSecurityBuffer(message, 40) : Buffer.alloc(0);
  return { flags, serverChallenge, targetInfo, targetName };
}

function applyAkamaiEdgeGridSignature(auth, environment, target) {
  const accessToken = resolveEnvironmentValue(auth.accessToken, environment);
  const clientToken = resolveEnvironmentValue(auth.clientToken, environment);
  const clientSecret = resolveEnvironmentValue(auth.clientSecret, environment);
  const timestamp = edgeGridTimestamp(target.now || Date.now());
  const nonce = resolveEnvironmentValue(auth.nonce, environment).trim() || crypto.randomBytes(16).toString('hex');
  const authPrefix = `EG1-HMAC-SHA256 client_token=${clientToken};access_token=${accessToken};timestamp=${timestamp};nonce=${nonce};`;
  const dataToSign = [
    String(target.method || 'GET').toUpperCase(),
    target.url.protocol.replace(/:$/, ''),
    target.url.hostname.toLowerCase(),
    `${target.url.pathname}${target.url.search}`,
    edgeGridCanonicalHeaders(target.headers, auth.headersToSign, environment),
    sha256Base64(target.body || ''),
    authPrefix
  ].join('\t');
  const signingKey = crypto.createHmac('sha256', clientSecret).update(timestamp, 'utf8').digest('base64');
  const signature = crypto.createHmac('sha256', signingKey).update(dataToSign, 'utf8').digest('base64');
  setHeader(target.headers, 'Authorization', `${authPrefix}signature=${signature}`);
}

function applyJwtBearerAuth(auth, environment, target) {
  const token = buildJwtToken(auth, environment, target.now || Date.now());
  const location = String(resolveEnvironmentValue(auth.addTokenTo, environment) || 'header').toLowerCase();
  if (location === 'query') {
    target.url.searchParams.set(resolveEnvironmentValue(auth.queryParamName, environment).trim() || 'token', token);
    return;
  }
  const prefix = resolveEnvironmentValue(auth.headerPrefix, environment).trim() || 'Bearer';
  setHeader(target.headers, 'Authorization', `${prefix} ${token}`);
}

function applyAsapAuth(auth, environment, target) {
  const token = buildJwtToken({
    ...auth,
    claims: JSON.stringify({
      iss: resolveEnvironmentValue(auth.issuer, environment),
      sub: resolveEnvironmentValue(auth.subject, environment) || resolveEnvironmentValue(auth.issuer, environment),
      aud: resolveEnvironmentValue(auth.audience, environment)
    }),
    headerPrefix: auth.headerPrefix || 'Bearer'
  }, environment, target.now || Date.now());
  const prefix = resolveEnvironmentValue(auth.headerPrefix, environment).trim() || 'Bearer';
  setHeader(target.headers, 'Authorization', `${prefix} ${token}`);
}

function buildJwtToken(auth, environment, now = Date.now()) {
  const algorithm = normalizeJwtAlgorithm(resolveEnvironmentValue(auth.algorithm, environment) || 'HS256');
  if (!algorithm) {
    throw new Error(`Unsupported JWT algorithm: ${auth.algorithm}.`);
  }
  const issuedAt = Math.floor(Number(now) / 1000);
  const expiresIn = Math.max(1, Number(resolveEnvironmentValue(auth.expiresIn, environment) || 300) || 300);
  const payload = {
    iat: issuedAt,
    exp: issuedAt + expiresIn,
    ...parseJwtClaims(resolveEnvironmentValue(auth.claims, environment))
  };
  const issuer = resolveEnvironmentValue(auth.issuer, environment);
  const subject = resolveEnvironmentValue(auth.subject, environment);
  const audience = resolveEnvironmentValue(auth.audience, environment);
  if (issuer) { payload.iss = issuer; }
  if (subject) { payload.sub = subject; }
  if (audience) { payload.aud = audience; }
  const header = { alg: algorithm, typ: 'JWT' };
  const keyId = resolveEnvironmentValue(auth.keyId, environment);
  if (keyId) { header.kid = keyId; }
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  return `${signingInput}.${jwtSignature(algorithm, signingInput, auth, environment)}`;
}

function jwtSignature(algorithm, signingInput, auth, environment) {
  if (algorithm === 'none') {
    return '';
  }
  if (algorithm.startsWith('HS')) {
    const secret = requireResolvedValue(auth.secret || auth.clientSecret, environment, 'JWT secret');
    return crypto.createHmac(jwtHashForAlgorithm(algorithm), secret).update(signingInput, 'utf8').digest('base64url');
  }
  const privateKey = requireResolvedValue(auth.privateKey, environment, 'JWT private key');
  return crypto.sign(jwtHashForAlgorithm(algorithm), Buffer.from(signingInput, 'utf8'), privateKey).toString('base64url');
}

function normalizeJwtAlgorithm(value) {
  const algorithm = String(value || 'HS256').trim().toUpperCase().replace(/[-_]/g, '');
  if (algorithm === 'NONE') {
    return 'none';
  }
  if (['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'].includes(algorithm)) {
    return algorithm;
  }
  return '';
}

function jwtHashForAlgorithm(algorithm) {
  if (algorithm.endsWith('384')) {
    return 'sha384';
  }
  if (algorithm.endsWith('512')) {
    return 'sha512';
  }
  return 'sha256';
}

function parseJwtClaims(value) {
  const text = String(value || '').trim();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function setHeader(headers, name, value) {
  const existing = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  if (existing) {
    headers[existing] = value;
  } else {
    headers[name] = value;
  }
}

function hostHeader(url) {
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80') || !url.port) {
    return url.hostname;
  }
  return `${url.hostname}:${url.port}`;
}

function awsAmzDate(now) {
  return new Date(Number(now)).toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function awsCanonicalUri(url) {
  const path = url.pathname || '/';
  return path
    .split('/')
    .map((part) => encodeRfc3986(decodeURIComponentSafe(part)))
    .join('/') || '/';
}

function awsCanonicalQuery(url) {
  return [...url.searchParams.entries()]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function awsCanonicalHeaders(headers) {
  return awsSignedHeaderNames(headers)
    .split(';')
    .map((name) => `${name}:${String(headerValue(headers, name) || '').trim().replace(/\s+/g, ' ')}`)
    .join('\n') + '\n';
}

function awsSignedHeaderNames(headers) {
  return Object.keys(headers)
    .map((key) => key.toLowerCase())
    .filter((key) => key !== 'authorization')
    .sort()
    .join(';');
}

function headerValue(headers, name) {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

function awsSigningKey(secretKey, shortDate, region, service) {
  const dateKey = crypto.createHmac('sha256', `AWS4${secretKey}`).update(shortDate, 'utf8').digest();
  const dateRegionKey = crypto.createHmac('sha256', dateKey).update(region, 'utf8').digest();
  const dateRegionServiceKey = crypto.createHmac('sha256', dateRegionKey).update(service, 'utf8').digest();
  return crypto.createHmac('sha256', dateRegionServiceKey).update('aws4_request', 'utf8').digest();
}

function sha256Hex(value) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(value)) {
    return hash.update(value).digest('hex');
  }
  return hash.update(String(value || ''), 'utf8').digest('hex');
}

function normalizeOAuth1SignatureMethod(value) {
  const method = String(value || 'HMAC-SHA1').trim().toUpperCase();
  if (method === 'HMACSHA1') {
    return 'HMAC-SHA1';
  }
  if (method === 'HMACSHA256') {
    return 'HMAC-SHA256';
  }
  return method;
}

function quoteAuthValue(value) {
  return `"${String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function oauthPercentEncode(value) {
  return encodeRfc3986(value);
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value == null ? '' : value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function writeSecurityBuffer(message, offset, length, payloadOffset) {
  message.writeUInt16LE(length, offset);
  message.writeUInt16LE(length, offset + 2);
  message.writeUInt32LE(payloadOffset, offset + 4);
}

function writeSecurityBufferWithPayload(message, descriptorOffset, payload, payloadOffset) {
  writeSecurityBuffer(message, descriptorOffset, payload.length, payloadOffset);
  payload.copy(message, payloadOffset);
  return payloadOffset + payload.length;
}

function readSecurityBuffer(message, offset) {
  if (message.length < offset + 8) {
    return Buffer.alloc(0);
  }
  const length = message.readUInt16LE(offset);
  const payloadOffset = message.readUInt32LE(offset + 4);
  if (length < 0 || payloadOffset < 0 || payloadOffset + length > message.length) {
    return Buffer.alloc(0);
  }
  return message.slice(payloadOffset, payloadOffset + length);
}

function ntlmTimestamp(now) {
  const epochOffset = 11644473600000;
  const value = BigInt(Math.max(0, Number(now) + epochOffset)) * 10000n;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function md4(input) {
  const message = Buffer.from(input);
  const bitLength = BigInt(message.length) * 8n;
  const paddedLength = (((message.length + 9 + 63) >> 6) << 6);
  const buffer = Buffer.alloc(paddedLength);
  message.copy(buffer);
  buffer[message.length] = 0x80;
  buffer.writeBigUInt64LE(bitLength, paddedLength - 8);
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  for (let offset = 0; offset < buffer.length; offset += 64) {
    const x = Array.from({ length: 16 }, (_value, index) => buffer.readUInt32LE(offset + index * 4));
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;
    [a, b, c, d] = md4Round1(a, b, c, d, x);
    [a, b, c, d] = md4Round2(a, b, c, d, x);
    [a, b, c, d] = md4Round3(a, b, c, d, x);
    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }
  const digest = Buffer.alloc(16);
  digest.writeUInt32LE(a, 0);
  digest.writeUInt32LE(b, 4);
  digest.writeUInt32LE(c, 8);
  digest.writeUInt32LE(d, 12);
  return digest;
}

function md4Round1(a, b, c, d, x) {
  const s = [3, 7, 11, 19];
  for (let i = 0; i < 16; i += 4) {
    a = rotl((a + md4F(b, c, d) + x[i]) >>> 0, s[0]);
    d = rotl((d + md4F(a, b, c) + x[i + 1]) >>> 0, s[1]);
    c = rotl((c + md4F(d, a, b) + x[i + 2]) >>> 0, s[2]);
    b = rotl((b + md4F(c, d, a) + x[i + 3]) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4Round2(a, b, c, d, x) {
  const s = [3, 5, 9, 13];
  for (const i of [0, 1, 2, 3]) {
    a = rotl((a + md4G(b, c, d) + x[i] + 0x5a827999) >>> 0, s[0]);
    d = rotl((d + md4G(a, b, c) + x[i + 4] + 0x5a827999) >>> 0, s[1]);
    c = rotl((c + md4G(d, a, b) + x[i + 8] + 0x5a827999) >>> 0, s[2]);
    b = rotl((b + md4G(c, d, a) + x[i + 12] + 0x5a827999) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4Round3(a, b, c, d, x) {
  const s = [3, 9, 11, 15];
  for (const i of [0, 2, 1, 3]) {
    a = rotl((a + md4H(b, c, d) + x[i] + 0x6ed9eba1) >>> 0, s[0]);
    d = rotl((d + md4H(a, b, c) + x[i + 8] + 0x6ed9eba1) >>> 0, s[1]);
    c = rotl((c + md4H(d, a, b) + x[i + 4] + 0x6ed9eba1) >>> 0, s[2]);
    b = rotl((b + md4H(c, d, a) + x[i + 12] + 0x6ed9eba1) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4F(x, y, z) { return ((x & y) | (~x & z)) >>> 0; }
function md4G(x, y, z) { return ((x & y) | (x & z) | (y & z)) >>> 0; }
function md4H(x, y, z) { return (x ^ y ^ z) >>> 0; }
function rotl(value, bits) { return ((value << bits) | (value >>> (32 - bits))) >>> 0; }

function edgeGridTimestamp(now) {
  return new Date(Number(now)).toISOString().replace(/\.\d{3}Z$/, '+0000');
}

function edgeGridCanonicalHeaders(headers, headersToSign, environment) {
  const names = String(resolveEnvironmentValue(headersToSign || '', environment) || '')
    .split(/[,\s]+/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return names
    .map((name) => {
      const value = headerValue(headers, name);
      return value == null || value === '' ? '' : `${name}:${String(value).trim().replace(/\s+/g, ' ')}`;
    })
    .filter(Boolean)
    .join('\t');
}

function sha256Base64(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value || ''), Buffer.isBuffer(value) ? undefined : 'utf8').digest('base64');
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
    redirect: 'manual',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body,
    signal: options.signal
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${label} refused an HTTP redirect from the token endpoint.`);
  }

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
    const error = new Error(redactOAuthErrorMessage(payload.error_description || payload.error || `${label} failed with HTTP ${response.status}.`));
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

function redactOAuthErrorMessage(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return 'OAuth 2.0 provider returned an error.';
  }
  text = text.replace(OAUTH_AUTHORIZATION_HEADER_PATTERN, `$1$2${OAUTH_REDACTED_VALUE}`);
  for (const fieldName of OAUTH_SECRET_FIELD_NAMES) {
    const field = escapeRegExp(fieldName);
    text = text
      .replace(new RegExp(`("${field}"\\s*:\\s*")([^"]*)(")`, 'gi'), `$1${OAUTH_REDACTED_VALUE}$3`)
      .replace(new RegExp(`('\\s*${field}\\s*'\\s*:\\s*')([^']*)(')`, 'gi'), `$1${OAUTH_REDACTED_VALUE}$3`)
      .replace(new RegExp(`\\b(${field})(\\s*[:=]\\s*)(["']?)(?!(?:(?:Bearer|Basic|OAuth)\\s+)?(?:\\[redacted\\]|redacted)\\3?(?=\\s|[;,.)\\]]|$))[^\\s&,;<>}"']+\\3`, 'gi'), `$1$2${OAUTH_REDACTED_VALUE}`);
  }
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${OAUTH_REDACTED_VALUE}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, OAUTH_REDACTED_VALUE);
  if (text.length > 1000) {
    return `${text.slice(0, 1000)}...`;
  }
  return text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  applyDigestChallengeAuth,
  applyAuth,
  buildNtlmType3AuthorizationHeader,
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  maybeRefreshOAuthToken,
  normalizeAuth,
  parseDigestChallenge,
  pkceChallengeForVerifier,
  pollOAuthDeviceToken,
  redactOAuthErrorMessage,
  refreshOAuthToken,
  requestOAuthClientCredentialsToken,
  requestOAuthDeviceAuthorization,
  shouldPollOAuthDeviceToken,
  shouldRequestClientCredentialsToken,
  shouldRefreshOAuthToken,
  validateAuth
};
