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
    errors.push('NTLM auth is explicitly classified as unsupported in the sandboxed HTTP broker because it requires a stateful connection authentication handshake that PostMeter has not implemented yet.');
  } else if (normalized.type === 'akamaiEdgeGrid') {
    errors.push('Akamai EdgeGrid auth is explicitly classified as unsupported in the sandboxed HTTP broker until exact Postman signing parity is implemented.');
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
    throw new Error('NTLM auth is not supported by the sandboxed HTTP broker yet.');
  } else if (auth.type === 'akamaiEdgeGrid') {
    throw new Error('Akamai EdgeGrid auth is not supported by the sandboxed HTTP broker yet.');
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
  applyDigestChallengeAuth,
  applyAuth,
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  maybeRefreshOAuthToken,
  normalizeAuth,
  parseDigestChallenge,
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
