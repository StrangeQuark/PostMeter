const assert = require('node:assert/strict');
const test = require('node:test');
const {
  authEditorState,
  authFromEditorState,
  normalizeAuth,
  normalizePersistedAuth
} = require('../../src/core/authModel');

test('shared auth model normalizes runtime auth values by type', () => {
  assert.deepEqual(normalizeAuth({ type: 'unsupported', token: 'secret' }), { type: 'none' });
  assert.deepEqual(normalizeAuth({ type: 'apiKey', location: 'bad', key: 'X-API-Key' }), {
    type: 'apiKey',
    location: 'header',
    key: 'X-API-Key',
    value: ''
  });
  assert.deepEqual(normalizeAuth({ type: 'auto refresh token', token: 'ignored' }), { type: 'autoRefresh' });
  assert.deepEqual(normalizeAuth({ type: 'Refreshing Auth Access Token', token: 'ignored' }), { type: 'autoRefresh' });
  assert.deepEqual(normalizeAuth({ type: 'Use Refreshing Access Token', token: 'ignored' }), { type: 'autoRefresh' });
  assert.deepEqual(normalizeAuth({ type: 'Use Refreshing API Key', token: 'ignored' }), { type: 'autoRefresh' });
  assert.deepEqual(normalizeAuth({ type: 'Refreshing Auth Refresh Token', token: 'ignored' }), { type: 'autoRefreshRefreshToken' });
  assert.deepEqual(normalizeAuth({ type: 'oauth2', tokenType: 'Unknown', grantType: 'bad', redirectStrategy: 'bad' }), {
    type: 'oauth2',
    tokenType: 'Bearer',
    accessToken: '',
    refreshToken: '',
    tokenUrl: '',
    authorizationUrl: '',
    deviceAuthorizationUrl: '',
    clientId: '',
    clientSecret: '',
    scopes: '',
    grantType: 'authorizationCode',
    redirectStrategy: 'loopback',
    redirectUri: '',
    expiresAt: '',
    deviceCode: '',
    userCode: '',
    verificationUri: '',
    verificationUriComplete: '',
    deviceCodeExpiresAt: '',
    devicePollIntervalSeconds: ''
  });
  assert.deepEqual(normalizeAuth({
    type: 'digest',
    username: 'ada',
    password: 'secret',
    disableRetry: 'true',
    realm: 'postmeter',
    nonce: 'abc123',
    algorithm: 'SHA-256',
    qop: '',
    opaque: 'opaque-token',
    clientNonce: '0a4f113b',
    nonceCount: '00000005'
  }), {
    type: 'digest',
    username: 'ada',
    password: 'secret',
    disableRetryingRequest: true,
    realm: 'postmeter',
    nonce: 'abc123',
    algorithm: 'SHA-256',
    qop: '',
    opaque: 'opaque-token',
    clientNonce: '0a4f113b',
    nonceCount: '00000005'
  });
  assert.deepEqual(normalizeAuth({
    type: 'oauth1',
    signatureMethod: 'rsasha512',
    addParamsToHeader: false,
    consumerKey: 'consumer',
    consumerSecret: 'consumer-secret',
    token: 'token',
    tokenSecret: 'token-secret',
    privateKey: 'private-key',
    callbackUrl: 'https://client.example.test/callback',
    verifier: 'verifier',
    timestamp: '1777291200',
    nonce: 'nonce',
    realm: 'postmeter',
    includeBodyHash: 'true',
    addEmptyParametersToSignature: 'true'
  }), {
    type: 'oauth1',
    consumerKey: 'consumer',
    consumerSecret: 'consumer-secret',
    token: 'token',
    tokenSecret: 'token-secret',
    privateKey: 'private-key',
    signatureMethod: 'RSA-SHA512',
    addAuthDataTo: 'queryOrBody',
    callback: 'https://client.example.test/callback',
    verifier: 'verifier',
    timestamp: '1777291200',
    nonce: 'nonce',
    version: '1.0',
    realm: 'postmeter',
    includeBodyHash: true,
    addEmptyParamsToSign: true
  });
});

test('shared auth model keeps persisted auth shallow for workspace compatibility', () => {
  assert.deepEqual(normalizePersistedAuth({ type: 'basic', username: 'alice' }), {
    type: 'basic',
    username: 'alice'
  });
  assert.deepEqual(normalizePersistedAuth({ type: 'autoRefresh', token: 'ignored' }), {
    type: 'autoRefresh',
    token: 'ignored'
  });
  assert.deepEqual(normalizePersistedAuth({ type: 'unsupported', token: 'secret' }), { type: 'none' });
});

test('shared auth model maps runtime auth to renderer editor fields', () => {
  assert.deepEqual(authEditorState({
    type: 'oauth2',
    grantType: 'deviceCode',
    tokenType: 'MAC',
    clientId: 'client-id',
    userCode: 'ABCD-EFGH',
    verificationUriComplete: 'https://example.test/device?code=ABCD-EFGH'
  }), {
    type: 'oauth2',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    apiKeyLocation: 'header',
    apiKeyName: '',
    apiKeyValue: '',
    cookieValue: '',
    oauthGrantType: 'deviceCode',
    oauthTokenType: 'MAC',
    oauthAccessToken: '',
    oauthRefreshToken: '',
    oauthAuthorizationUrl: '',
    oauthRedirectStrategy: 'loopback',
    oauthDeviceAuthorizationUrl: '',
    oauthTokenUrl: '',
    oauthClientId: 'client-id',
    oauthClientSecret: '',
    oauthScopes: '',
    oauthUserCode: 'ABCD-EFGH',
    oauthVerificationUri: 'https://example.test/device?code=ABCD-EFGH',
    oauth1SignatureMethod: 'HMAC-SHA1',
    oauth1ConsumerKey: '',
    oauth1ConsumerSecret: '',
    oauth1Token: '',
    oauth1TokenSecret: '',
    oauth1PrivateKey: '',
    oauth1AddAuthDataTo: 'header',
    oauth1Callback: '',
    oauth1Verifier: '',
    oauth1Timestamp: '',
    oauth1Nonce: '',
    oauth1Version: '1.0',
    oauth1Realm: '',
    oauth1IncludeBodyHash: false,
    oauth1AddEmptyParamsToSign: false,
    digestUsername: '',
    digestPassword: '',
    digestDisableRetryingRequest: false,
    digestRealm: '',
    digestNonce: '',
    digestAlgorithm: 'MD5',
    digestQop: 'auth',
    digestNonceCount: '',
    digestClientNonce: '',
    digestOpaque: '',
    clientPfxPath: '',
    clientCertPath: '',
    clientKeyPath: '',
    clientCaPath: '',
    clientPassphrase: ''
  });
});

test('shared auth model maps Digest auth to and from renderer editor fields', () => {
  assert.deepEqual(authEditorState({
    type: 'digest',
    username: 'ada',
    password: 'secret',
    disableRetryingRequest: true,
    realm: 'postmeter',
    nonce: 'abc123',
    algorithm: 'MD5-sess',
    qop: 'auth',
    nonceCount: '00000005',
    clientNonce: '0a4f113b',
    opaque: 'opaque-token'
  }), {
    type: 'digest',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    apiKeyLocation: 'header',
    apiKeyName: '',
    apiKeyValue: '',
    cookieValue: '',
    oauthGrantType: 'authorizationCode',
    oauthTokenType: 'Bearer',
    oauthAccessToken: '',
    oauthRefreshToken: '',
    oauthAuthorizationUrl: '',
    oauthRedirectStrategy: 'loopback',
    oauthDeviceAuthorizationUrl: '',
    oauthTokenUrl: '',
    oauthClientId: '',
    oauthClientSecret: '',
    oauthScopes: '',
    oauthUserCode: '',
    oauthVerificationUri: '',
    oauth1SignatureMethod: 'HMAC-SHA1',
    oauth1ConsumerKey: '',
    oauth1ConsumerSecret: '',
    oauth1Token: '',
    oauth1TokenSecret: '',
    oauth1PrivateKey: '',
    oauth1AddAuthDataTo: 'header',
    oauth1Callback: '',
    oauth1Verifier: '',
    oauth1Timestamp: '',
    oauth1Nonce: '',
    oauth1Version: '1.0',
    oauth1Realm: '',
    oauth1IncludeBodyHash: false,
    oauth1AddEmptyParamsToSign: false,
    digestUsername: 'ada',
    digestPassword: 'secret',
    digestDisableRetryingRequest: true,
    digestRealm: 'postmeter',
    digestNonce: 'abc123',
    digestAlgorithm: 'MD5-sess',
    digestQop: 'auth',
    digestNonceCount: '00000005',
    digestClientNonce: '0a4f113b',
    digestOpaque: 'opaque-token',
    clientPfxPath: '',
    clientCertPath: '',
    clientKeyPath: '',
    clientCaPath: '',
    clientPassphrase: ''
  });

  assert.deepEqual(authFromEditorState({
    type: 'digest',
    digestUsername: 'ada',
    digestPassword: 'secret',
    digestDisableRetryingRequest: true,
    digestRealm: 'postmeter',
    digestNonce: 'abc123',
    digestAlgorithm: 'MD5-sess',
    digestQop: 'auth',
    digestNonceCount: '00000005',
    digestClientNonce: '0a4f113b',
    digestOpaque: 'opaque-token'
  }), {
    type: 'digest',
    username: 'ada',
    password: 'secret',
    disableRetryingRequest: true,
    realm: 'postmeter',
    nonce: 'abc123',
    algorithm: 'MD5-sess',
    qop: 'auth',
    opaque: 'opaque-token',
    clientNonce: '0a4f113b',
    nonceCount: '00000005'
  });
});

test('shared auth model maps OAuth 1.0 auth to and from renderer editor fields', () => {
  assert.deepEqual(authEditorState({
    type: 'oauth1',
    consumerKey: 'consumer',
    consumerSecret: 'consumer-secret',
    token: 'token',
    tokenSecret: 'token-secret',
    privateKey: 'private-key',
    signatureMethod: 'PLAINTEXT',
    addAuthDataTo: 'queryOrBody',
    callback: 'https://client.example.test/callback',
    verifier: 'verifier',
    timestamp: '1777291200',
    nonce: 'nonce',
    version: '1.0',
    realm: 'postmeter',
    includeBodyHash: true,
    addEmptyParamsToSign: true
  }).oauth1ConsumerKey, 'consumer');

  assert.deepEqual(authFromEditorState({
    type: 'oauth1',
    oauth1SignatureMethod: 'PLAINTEXT',
    oauth1ConsumerKey: 'consumer',
    oauth1ConsumerSecret: 'consumer-secret',
    oauth1Token: 'token',
    oauth1TokenSecret: 'token-secret',
    oauth1PrivateKey: 'private-key',
    oauth1AddAuthDataTo: 'queryOrBody',
    oauth1Callback: 'https://client.example.test/callback',
    oauth1Verifier: 'verifier',
    oauth1Timestamp: '1777291200',
    oauth1Nonce: 'nonce',
    oauth1Version: '1.0',
    oauth1Realm: 'postmeter',
    oauth1IncludeBodyHash: true,
    oauth1AddEmptyParamsToSign: true
  }), {
    type: 'oauth1',
    consumerKey: 'consumer',
    consumerSecret: 'consumer-secret',
    token: 'token',
    tokenSecret: 'token-secret',
    privateKey: 'private-key',
    signatureMethod: 'PLAINTEXT',
    addAuthDataTo: 'queryOrBody',
    callback: 'https://client.example.test/callback',
    verifier: 'verifier',
    timestamp: '1777291200',
    nonce: 'nonce',
    version: '1.0',
    realm: 'postmeter',
    includeBodyHash: true,
    addEmptyParamsToSign: true
  });
});

test('shared auth model preserves auto refresh auth from editor state', () => {
  assert.deepEqual(authEditorState({ type: 'autoRefresh' }).type, 'autoRefresh');
  assert.deepEqual(authFromEditorState({ type: 'autoRefresh' }), { type: 'autoRefresh' });
  assert.deepEqual(authEditorState({ type: 'autoRefreshRefreshToken' }).type, 'autoRefreshRefreshToken');
  assert.deepEqual(authFromEditorState({ type: 'autoRefreshRefreshToken' }), { type: 'autoRefreshRefreshToken' });
});

test('shared auth model rebuilds OAuth editor state while preserving runtime-only device values', () => {
  assert.deepEqual(authFromEditorState({
    type: 'oauth2',
    oauthGrantType: 'deviceCode',
    oauthTokenType: 'MAC',
    oauthAccessToken: 'access-token',
    oauthRefreshToken: 'refresh-token',
    oauthAuthorizationUrl: 'https://auth.example.test/authorize',
    oauthRedirectStrategy: 'customScheme',
    oauthDeviceAuthorizationUrl: 'https://auth.example.test/device',
    oauthTokenUrl: 'https://auth.example.test/token',
    oauthClientId: 'client-id',
    oauthClientSecret: 'client-secret',
    oauthScopes: 'openid profile',
    oauthUserCode: 'NEXT-CODE'
  }, {
    type: 'oauth2',
    grantType: 'deviceCode',
    redirectUri: 'postmeter://oauth/callback',
    expiresAt: '2030-01-01T00:00:00.000Z',
    deviceCode: 'device-code',
    verificationUri: 'https://auth.example.test/device',
    verificationUriComplete: 'https://auth.example.test/device?user_code=PREV',
    deviceCodeExpiresAt: '2030-01-01T00:10:00.000Z',
    devicePollIntervalSeconds: '5'
  }), {
    type: 'oauth2',
    tokenType: 'MAC',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenUrl: 'https://auth.example.test/token',
    authorizationUrl: 'https://auth.example.test/authorize',
    deviceAuthorizationUrl: 'https://auth.example.test/device',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    scopes: 'openid profile',
    grantType: 'deviceCode',
    redirectStrategy: 'customScheme',
    redirectUri: 'postmeter://oauth/callback',
    expiresAt: '2030-01-01T00:00:00.000Z',
    deviceCode: 'device-code',
    userCode: 'NEXT-CODE',
    verificationUri: 'https://auth.example.test/device',
    verificationUriComplete: 'https://auth.example.test/device?user_code=PREV',
    deviceCodeExpiresAt: '2030-01-01T00:10:00.000Z',
    devicePollIntervalSeconds: '5'
  });
});
