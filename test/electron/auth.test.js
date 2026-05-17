const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const {
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  normalizeAuth,
  pkceChallengeForVerifier,
  pollOAuthDeviceToken,
  redactOAuthErrorMessage,
  refreshOAuthToken,
  requestOAuthClientCredentialsToken,
  requestOAuthDeviceAuthorization,
  shouldRequestClientCredentialsToken,
  validateAuth
} = require('../../src/core/auth');
const { sendRequest } = require('../../src/core/httpClient');

const DIGEST_ALGORITHM_OPTIONS = [
  'MD5',
  'MD5-sess',
  'SHA-256',
  'SHA-256-sess',
  'SHA-512-256',
  'SHA-512-256-sess'
];

test('normalizes unsupported auth types to none', () => {
  assert.deepEqual(normalizeAuth({ type: 'unsupported', token: 'secret' }), { type: 'none' });
});

test('validates auth helper required fields', () => {
  assert.deepEqual(validateAuth({ type: 'bearer', token: '' }, null), ['Bearer token is required.']);
  assert.deepEqual(validateAuth({ type: 'basic', username: '', password: 'ignored' }, null), ['Basic auth username is required.']);
  assert.deepEqual(validateAuth({ type: 'apiKey', location: 'header', key: 'Bad Header', value: 'secret' }, null), ['Invalid API key header name: Bad Header.']);
  assert.deepEqual(validateAuth({ type: 'oauth2', accessToken: '{{token}}' }, { variables: [{ enabled: true, key: 'token', value: 'resolved' }] }), []);
  assert.deepEqual(validateAuth({ type: 'oauth2', refreshToken: 'refresh', tokenUrl: 'https://auth.example.test/token' }, null), []);
  assert.deepEqual(validateAuth({
    type: 'oauth2',
    grantType: 'clientCredentials',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id',
    clientSecret: 'client-secret'
  }, null), []);
  assert.deepEqual(validateAuth({
    type: 'oauth2',
    grantType: 'deviceCode',
    deviceAuthorizationUrl: 'https://auth.example.test/device',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id'
  }, null), ['Start and complete the OAuth 2.0 device-code flow before sending this request.']);
  assert.deepEqual(validateAuth({
    type: 'oauth2',
    grantType: 'deviceCode',
    deviceCode: 'device-code',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id'
  }, null), []);
  assert.deepEqual(validateAuth({
    type: 'oauth2',
    grantType: 'authorizationCode',
    authorizationUrl: 'https://auth.example.test/authorize',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id'
  }, null), ['Start and complete the OAuth 2.0 authorization-code flow before sending this request.']);
  assert.deepEqual(validateAuth({ type: 'clientCertificate' }, null), ['Client certificate auth requires a PEM certificate/key pair or a PFX/P12 bundle.']);
  assert.deepEqual(validateAuth({ type: 'clientCertificate', certPath: '/tmp/client.pem' }, null), ['Client certificate PEM key path is required.']);
  assert.deepEqual(validateAuth({ type: 'clientCertificate', keyPath: '/tmp/client.key' }, null), ['Client certificate PEM certificate path is required.']);
  assert.deepEqual(validateAuth({ type: 'clientCertificate', certPath: '/tmp/client.pem', keyPath: '/tmp/client.key' }, null), []);
  assert.deepEqual(validateAuth({ type: 'clientCertificate', pfxPath: '/tmp/client.p12' }, null), []);
  assert.deepEqual(validateAuth({ type: 'clientCertificate', certificateId: 'cert-1' }, null), []);
});

test('applies supported auth helpers during request execution', async () => {
  const server = await createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || '',
      apiKeyHeader: request.headers['x-api-key'] || '',
      cookie: request.headers.cookie || '',
      apiKeyQuery: url.searchParams.get('api_key') || ''
    }));
  });

  try {
    assert.equal((await authRequest(server.baseUrl, { type: 'bearer', token: 'abc' })).authorization, 'Bearer abc');
    assert.equal((await authRequest(server.baseUrl, { type: 'basic', username: 'alice', password: 'secret' })).authorization, `Basic ${Buffer.from('alice:secret').toString('base64')}`);
    assert.equal((await authRequest(server.baseUrl, { type: 'apiKey', location: 'header', key: 'X-API-Key', value: 'h1' })).apiKeyHeader, 'h1');
    assert.equal((await authRequest(server.baseUrl, { type: 'apiKey', location: 'query', key: 'api_key', value: 'q1' })).apiKeyQuery, 'q1');
    assert.equal((await authRequest(server.baseUrl, { type: 'cookie', value: 'session=abc' })).cookie, 'session=abc');
    assert.equal((await authRequest(server.baseUrl, { type: 'oauth2', accessToken: 'token' })).authorization, 'Bearer token');
  } finally {
    await server.close();
  }
});

test('applies advanced Postman auth helpers through the brokered HTTP sender', async () => {
  let ntlmStep = 0;
  const server = await createServer(async (request, response) => {
    if (request.url === '/digest' && !request.headers.authorization) {
      response.writeHead(401, {
        'WWW-Authenticate': 'Digest realm="postmeter", nonce="abc123", qop="auth", algorithm=MD5',
        'Content-Type': 'application/json'
      });
      response.end(JSON.stringify({ challenge: true }));
      return;
    }
    if (request.url === '/ntlm' && ntlmStep === 0) {
      ntlmStep += 1;
      assert.match(request.headers.authorization || '', /^NTLM TlRMTVNTUAAB/);
      response.writeHead(401, {
        'WWW-Authenticate': `NTLM ${ntlmType2Challenge()}`,
        'Content-Type': 'application/json',
        Connection: 'keep-alive'
      });
      response.end(JSON.stringify({ challenge: true }));
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || '',
      amzDate: request.headers['x-amz-date'] || '',
      amzToken: request.headers['x-amz-security-token'] || '',
      tokenQuery: new URL(request.url, 'http://127.0.0.1').searchParams.get('jwt') || ''
    }));
  });

  try {
    const digest = await authRequest(`${server.baseUrl}/digest`, { type: 'digest', username: 'ada', password: 'secret' });
    assert.match(digest.authorization, /^Digest /);
    assert.match(digest.authorization, /username="ada"/);
    assert.match(digest.authorization, /response="[a-f0-9]{32}"/);

    const hawk = await authRequest(`${server.baseUrl}/hawk`, { type: 'hawk', authId: 'hawk-id', authKey: 'hawk-secret', nonce: 'fixed', algorithm: 'sha256' });
    assert.match(hawk.authorization, /^Hawk /);
    assert.match(hawk.authorization, /id="hawk-id"/);
    assert.match(hawk.authorization, /mac="/);

    const aws = await authRequest(`${server.baseUrl}/aws`, {
      type: 'aws',
      accessKey: 'AKIDEXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'execute-api',
      sessionToken: 'session'
    }, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    assert.match(aws.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260427\/us-east-1\/execute-api\/aws4_request/);
    assert.equal(aws.amzDate, '20260427T120000Z');
    assert.equal(aws.amzToken, 'session');

    const oauth1 = await authRequest(`${server.baseUrl}/oauth1?existing=1`, {
      type: 'oauth1',
      consumerKey: 'consumer',
      consumerSecret: 'consumer-secret',
      token: 'token',
      tokenSecret: 'token-secret',
      nonce: 'nonce',
      timestamp: '1777291200'
    });
    assert.match(oauth1.authorization, /^OAuth /);
    assert.match(oauth1.authorization, /oauth_consumer_key="consumer"/);
    assert.match(oauth1.authorization, /oauth_signature="/);

    const akamai = await authRequest(`${server.baseUrl}/akamai`, {
      type: 'akamaiEdgeGrid',
      accessToken: 'access',
      clientToken: 'client',
      clientSecret: 'secret',
      nonce: 'nonce',
      headersToSign: ''
    }, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    assert.match(akamai.authorization, /^EG1-HMAC-SHA256 /);
    assert.match(akamai.authorization, /client_token=client/);
    assert.match(akamai.authorization, /access_token=access/);
    assert.match(akamai.authorization, /signature=/);

    const jwt = await authRequest(`${server.baseUrl}/jwt`, {
      type: 'jwtBearer',
      algorithm: 'HS256',
      secret: 'jwt-secret',
      issuer: 'issuer',
      subject: 'subject',
      audience: 'audience',
      expiresIn: '60'
    }, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    assert.match(jwt.authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const jwtPayload = JSON.parse(Buffer.from(jwt.authorization.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(jwtPayload.iss, 'issuer');
    assert.equal(jwtPayload.exp, 1777291260);

    const jwtQuery = await authRequest(`${server.baseUrl}/jwt-query`, {
      type: 'jwtBearer',
      algorithm: 'HS256',
      secret: 'jwt-secret',
      addTokenTo: 'query',
      queryParamName: 'jwt'
    }, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    assert.match(jwtQuery.tokenQuery, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const asap = await authRequest(`${server.baseUrl}/asap`, {
      type: 'asap',
      algorithm: 'HS256',
      secret: 'asap-secret',
      issuer: 'issuer',
      audience: 'audience',
      subject: 'subject',
      keyId: 'kid-1',
      expiresIn: '60'
    }, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    assert.match(asap.authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const asapHeader = JSON.parse(Buffer.from(asap.authorization.split(' ')[1].split('.')[0], 'base64url').toString('utf8'));
    assert.equal(asapHeader.kid, 'kid-1');

    const ntlm = await authRequest(`${server.baseUrl}/ntlm`, {
      type: 'ntlm',
      username: 'ada',
      password: 'secret',
      domain: 'POSTMETER',
      workstation: 'WORKSTATION'
    });
    assert.match(ntlm.authorization, /^NTLM TlRMTVNTUAAD/);
  } finally {
    await server.close();
  }
});

test('executes Digest auth challenge retry against a localhost server with advanced fields', async () => {
  let attempts = 0;
  const challenge = {
    algorithm: 'MD5',
    nonce: 'abc123',
    opaque: 'opaque-token',
    qop: 'auth',
    realm: 'postmeter'
  };
  const server = await createServer(async (request, response) => {
    attempts += 1;
    const authorization = request.headers.authorization || '';
    response.setHeader('Content-Type', 'application/json');
    if (!authorization) {
      response.writeHead(401, {
        'WWW-Authenticate': digestChallengeHeader(challenge),
        'Content-Type': 'application/json'
      });
      response.end(JSON.stringify({ challenge: true }));
      return;
    }
    const fields = parseDigestAuthorization(authorization);
    const verified = verifyDigestAuthorization(fields, {
      ...challenge,
      method: request.method,
      password: 'secret',
      uri: request.url
    });
    response.statusCode = verified ? 200 : 403;
    response.end(JSON.stringify({ attempts, fields, verified }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/digest?via=challenge`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'digest',
        username: 'ada',
        password: 'secret',
        clientNonce: '0a4f113b',
        nonceCount: '00000005'
      }
    });
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.verified, true);
    assert.equal(body.attempts, 2);
    assert.equal(body.fields.username, 'ada');
    assert.equal(body.fields.realm, 'postmeter');
    assert.equal(body.fields.nonce, 'abc123');
    assert.equal(body.fields.uri, '/digest?via=challenge');
    assert.equal(body.fields.qop, 'auth');
    assert.equal(body.fields.nc, '00000005');
    assert.equal(body.fields.cnonce, '0a4f113b');
    assert.equal(body.fields.opaque, 'opaque-token');
  } finally {
    await server.close();
  }
});

test('executes Digest auth challenge retry for every Algorithm dropdown option', async () => {
  let attempts = 0;
  const server = await createServer(async (request, response) => {
    attempts += 1;
    const algorithm = decodeURIComponent(request.url.split('/').at(-1) || 'MD5');
    const challenge = {
      algorithm,
      nonce: `nonce-${algorithm}`,
      opaque: `opaque-${algorithm}`,
      qop: 'auth',
      realm: `realm-${algorithm}`
    };
    const authorization = request.headers.authorization || '';
    response.setHeader('Content-Type', 'application/json');
    if (!authorization) {
      response.writeHead(401, {
        'WWW-Authenticate': digestChallengeHeader(challenge),
        'Content-Type': 'application/json'
      });
      response.end(JSON.stringify({ challenge: true }));
      return;
    }
    const fields = parseDigestAuthorization(authorization);
    const verified = verifyDigestAuthorization(fields, {
      ...challenge,
      method: request.method,
      password: 'secret',
      uri: request.url
    });
    response.statusCode = verified ? 200 : 403;
    response.end(JSON.stringify({ algorithm, fields, verified }));
  });

  try {
    for (const algorithm of DIGEST_ALGORITHM_OPTIONS) {
      const result = await sendRequest({
        method: 'GET',
        url: `${server.baseUrl}/digest-algorithm/${encodeURIComponent(algorithm)}`,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: {
          type: 'digest',
          username: 'ada',
          password: 'secret',
          clientNonce: `cnonce-${algorithm}`,
          nonceCount: '00000001'
        }
      });
      const body = JSON.parse(result.body);
      assert.equal(result.statusCode, 200, `${algorithm} should authenticate successfully`);
      assert.equal(body.verified, true, `${algorithm} should verify against the localhost server`);
      assert.equal(body.fields.algorithm, algorithm);
    }
    assert.equal(attempts, DIGEST_ALGORITHM_OPTIONS.length * 2);
  } finally {
    await server.close();
  }
});

test('sends preemptive Digest auth when advanced fields are supplied and retry is disabled', async () => {
  let attempts = 0;
  const challenge = {
    algorithm: 'MD5',
    nonce: 'manual-nonce',
    opaque: 'manual-opaque',
    qop: 'auth',
    realm: 'manual-realm'
  };
  const server = await createServer(async (request, response) => {
    attempts += 1;
    const fields = parseDigestAuthorization(request.headers.authorization || '');
    const verified = verifyDigestAuthorization(fields, {
      ...challenge,
      method: request.method,
      password: 'secret',
      uri: request.url
    });
    response.statusCode = verified ? 200 : 401;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('WWW-Authenticate', digestChallengeHeader(challenge));
    response.end(JSON.stringify({ attempts, fields, verified }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/manual-digest`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'digest',
        username: 'ada',
        password: 'secret',
        disableRetryingRequest: true,
        realm: 'manual-realm',
        nonce: 'manual-nonce',
        algorithm: 'MD5',
        qop: 'auth',
        opaque: 'manual-opaque',
        clientNonce: 'manual-cnonce',
        nonceCount: '00000009'
      }
    });
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.verified, true);
    assert.equal(body.attempts, 1);
    assert.equal(body.fields.nc, '00000009');
    assert.equal(body.fields.cnonce, 'manual-cnonce');
  } finally {
    await server.close();
  }
});

test('does not automatically retry Digest challenges when retrying is disabled', async () => {
  let attempts = 0;
  const server = await createServer(async (_request, response) => {
    attempts += 1;
    response.writeHead(401, {
      'WWW-Authenticate': digestChallengeHeader({
        algorithm: 'MD5',
        nonce: 'retry-disabled-nonce',
        qop: 'auth',
        realm: 'postmeter'
      }),
      'Content-Type': 'application/json'
    });
    response.end(JSON.stringify({ challenge: true }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/no-retry`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'digest',
        username: 'ada',
        password: 'secret',
        disableRetryingRequest: true
      }
    });

    assert.equal(result.statusCode, 401);
    assert.equal(attempts, 1);
  } finally {
    await server.close();
  }
});

test('refreshes OAuth 2.0 tokens before request execution when expired', async () => {
  let tokenRequestBody = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      tokenRequestBody = Buffer.concat(chunks).toString('utf8');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'fresh-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600
      }));
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || ''
    }));
  });

  try {
    const result = await sendRequest({
      id: 'r1',
      method: 'GET',
      url: `${server.baseUrl}/resource`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth2',
        accessToken: 'stale-access-token',
        refreshToken: 'refresh-token',
        tokenUrl: `${server.baseUrl}/token`,
        clientId: 'client-id',
        clientSecret: 'client-secret',
        expiresAt: '2000-01-01T00:00:00.000Z'
      }
    }, null, { now: Date.parse('2026-04-21T00:00:00.000Z') });

    const body = JSON.parse(result.body);
    assert.equal(body.authorization, 'Bearer fresh-access-token');
    assert.equal(result.updatedAuth.accessToken, 'fresh-access-token');
    assert.equal(result.updatedAuth.refreshToken, 'new-refresh-token');
    assert.match(result.updatedAuth.expiresAt, /^2026-04-21T01:00:00\.000Z$/);
    assert.equal(new URLSearchParams(tokenRequestBody).get('grant_type'), 'refresh_token');
    assert.equal(new URLSearchParams(tokenRequestBody).get('refresh_token'), 'refresh-token');
    assert.equal(new URLSearchParams(tokenRequestBody).get('client_id'), 'client-id');
    assert.equal(new URLSearchParams(tokenRequestBody).get('client_secret'), 'client-secret');
  } finally {
    await server.close();
  }
});

test('requests OAuth 2.0 client credentials token before request execution', async () => {
  let tokenRequestBody = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      tokenRequestBody = Buffer.concat(chunks).toString('utf8');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'machine-token',
        token_type: 'Bearer',
        expires_in: 900
      }));
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || ''
    }));
  });

  try {
    const result = await sendRequest({
      id: 'r2',
      method: 'GET',
      url: `${server.baseUrl}/machine`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth2',
        grantType: 'clientCredentials',
        tokenUrl: `${server.baseUrl}/token`,
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scopes: 'read write'
      }
    }, null, { now: Date.parse('2026-04-21T00:00:00.000Z') });

    const body = JSON.parse(result.body);
    const params = new URLSearchParams(tokenRequestBody);
    assert.equal(body.authorization, 'Bearer machine-token');
    assert.equal(result.updatedAuth.accessToken, 'machine-token');
    assert.match(result.updatedAuth.expiresAt, /^2026-04-21T00:15:00\.000Z$/);
    assert.equal(params.get('grant_type'), 'client_credentials');
    assert.equal(params.get('client_id'), 'client-id');
    assert.equal(params.get('client_secret'), 'client-secret');
    assert.equal(params.get('scope'), 'read write');
  } finally {
    await server.close();
  }
});

test('decides when OAuth 2.0 client credentials tokens need retrieval', () => {
  const auth = {
    type: 'oauth2',
    grantType: 'clientCredentials',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id',
    clientSecret: 'client-secret'
  };

  assert.equal(shouldRequestClientCredentialsToken(auth, null), true);
  assert.equal(shouldRequestClientCredentialsToken({ ...auth, accessToken: 'token' }, null), false);
  assert.equal(
    shouldRequestClientCredentialsToken({ ...auth, accessToken: 'token', expiresAt: '2000-01-01T00:00:00.000Z' }, null),
    true
  );
  assert.equal(shouldRequestClientCredentialsToken({ ...auth, clientSecret: '' }, null), false);
});

test('creates OAuth 2.0 authorization-code PKCE sessions', () => {
  const codeVerifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
  const session = createOAuthPkceSession({
    type: 'oauth2',
    grantType: 'authorizationCode',
    authorizationUrl: 'https://auth.example.test/authorize?existing=1',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id',
    scopes: 'openid profile'
  }, null, {
    redirectUri: 'http://127.0.0.1:49152/oauth/callback',
    state: 'test-state',
    codeVerifier
  });
  const authorizationUrl = new URL(session.authorizationUrl);

  assert.equal(authorizationUrl.origin, 'https://auth.example.test');
  assert.equal(authorizationUrl.pathname, '/authorize');
  assert.equal(authorizationUrl.searchParams.get('existing'), '1');
  assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'client-id');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'http://127.0.0.1:49152/oauth/callback');
  assert.equal(authorizationUrl.searchParams.get('code_challenge'), pkceChallengeForVerifier(codeVerifier));
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorizationUrl.searchParams.get('state'), 'test-state');
  assert.equal(authorizationUrl.searchParams.get('scope'), 'openid profile');

  const customSchemeSession = createOAuthPkceSession({
    type: 'oauth2',
    grantType: 'authorizationCode',
    authorizationUrl: 'https://auth.example.test/authorize',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id'
  }, null, {
    redirectUri: 'postmeter://oauth/callback',
    state: 'custom-state',
    codeVerifier
  });
  assert.equal(new URL(customSchemeSession.authorizationUrl).searchParams.get('redirect_uri'), 'postmeter://oauth/callback');

  assert.throws(
    () => createOAuthPkceSession({
      type: 'oauth2',
      grantType: 'authorizationCode',
      authorizationUrl: 'javascript:alert(1)',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'client-id'
    }, null, {
      redirectUri: 'http://127.0.0.1:49152/oauth/callback',
      state: 'bad-state',
      codeVerifier
    }),
    /OAuth 2\.0 authorization URL must use http or https/
  );
});

test('exchanges OAuth 2.0 authorization-code PKCE callback for tokens', async () => {
  let tokenRequestBody = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      tokenRequestBody = Buffer.concat(chunks).toString('utf8');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'pkce-access-token',
        refresh_token: 'pkce-refresh-token',
        token_type: 'Bearer',
        expires_in: 1200
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    const session = {
      tokenUrl: `${server.baseUrl}/token`,
      redirectUri: 'http://127.0.0.1:49152/oauth/callback',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      state: 'test-state',
      codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
    };
    const auth = await exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCode',
      tokenType: 'Bearer'
    }, session, 'http://127.0.0.1:49152/oauth/callback?code=auth-code&state=test-state', null, {
      now: Date.parse('2026-04-21T00:00:00.000Z')
    });
    const params = new URLSearchParams(tokenRequestBody);

    assert.equal(auth.accessToken, 'pkce-access-token');
    assert.equal(auth.refreshToken, 'pkce-refresh-token');
    assert.match(auth.expiresAt, /^2026-04-21T00:20:00\.000Z$/);
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('code'), 'auth-code');
    assert.equal(params.get('redirect_uri'), 'http://127.0.0.1:49152/oauth/callback');
    assert.equal(params.get('client_id'), 'client-id');
    assert.equal(params.get('client_secret'), 'client-secret');
    assert.equal(params.get('code_verifier'), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ');
  } finally {
    await server.close();
  }
});

test('rejects OAuth 2.0 authorization-code PKCE state mismatches', async () => {
  await assert.rejects(
    () => exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCode'
    }, {
      tokenUrl: 'https://auth.example.test/token',
      redirectUri: 'http://127.0.0.1:49152/oauth/callback',
      clientId: 'client-id',
      state: 'expected-state',
      codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
    }, 'http://127.0.0.1:49152/oauth/callback?code=auth-code&state=wrong-state', null),
    /state did not match/
  );
});

test('rejects OAuth 2.0 authorization-code malformed callbacks and redacts provider errors', async () => {
  const session = {
    tokenUrl: 'https://auth.example.test/token',
    redirectUri: 'http://127.0.0.1:49152/oauth/callback',
    clientId: 'client-id',
    state: 'expected-state',
    codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
  };
  await assert.rejects(
    () => exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCode'
    }, session, 'not a callback', null),
    /callback URL is not valid/
  );
  await assert.rejects(
    () => exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCode'
    }, session, 'http://127.0.0.1:49152/oauth/callback?state=expected-state', null),
    /did not include an authorization code/
  );
  await assert.rejects(
    () => exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCode'
    }, session, 'http://127.0.0.1:49152/oauth/callback?error=access_denied&error_description=bad%20access_token=secret-token&state=expected-state', null),
    (error) => {
      assert.match(error.message, /access_token=\[redacted\]/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    }
  );
});

test('rejects OAuth 2.0 PKCE code verifier values outside RFC bounds', () => {
  assert.throws(() => pkceChallengeForVerifier('too-short'), /PKCE code verifier must be 43 to 128/);
  assert.throws(
    () => createOAuthPkceSession({
      type: 'oauth2',
      grantType: 'authorizationCode',
      authorizationUrl: 'https://auth.example.test/authorize',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'client-id'
    }, null, {
      redirectUri: 'http://127.0.0.1:49152/oauth/callback',
      state: 'test-state',
      codeVerifier: 'bad verifier with spaces'
    }),
    /PKCE code verifier must be 43 to 128/
  );
});

test('OAuth 2.0 token requests reject redirects without forwarding secret bodies', async () => {
  let leakedBody = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      response.statusCode = 307;
      response.setHeader('Location', `${server.baseUrl}/leak`);
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><p>redirect</p>');
      return;
    }
    if (request.url === '/leak') {
      leakedBody = await readRequestBody(request);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ access_token: 'should-not-happen' }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    await assert.rejects(
      () => requestOAuthClientCredentialsToken({
        type: 'oauth2',
        grantType: 'clientCredentials',
        tokenUrl: `${server.baseUrl}/token`,
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }, null),
      /refused an HTTP redirect/
    );
    assert.equal(leakedBody, '');
  } finally {
    await server.close();
  }
});

test('OAuth 2.0 token request failures are redacted and malformed responses fail clearly', async () => {
  const server = await createServer(async (request, response) => {
    if (request.url === '/invalid-json') {
      response.setHeader('Content-Type', 'application/json');
      response.end('{not-json');
      return;
    }
    if (request.url === '/missing-access-token') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ token_type: 'Bearer' }));
      return;
    }
    if (request.url === '/revoked') {
      response.statusCode = 400;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        error: 'invalid_grant',
        error_description: 'revoked refresh_token=refresh-secret client_secret=client-secret'
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    await assert.rejects(
      () => requestOAuthClientCredentialsToken({
        type: 'oauth2',
        grantType: 'clientCredentials',
        tokenUrl: `${server.baseUrl}/invalid-json`,
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }, null),
      /invalid JSON/
    );
    await assert.rejects(
      () => requestOAuthClientCredentialsToken({
        type: 'oauth2',
        grantType: 'clientCredentials',
        tokenUrl: `${server.baseUrl}/missing-access-token`,
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }, null),
      /did not include an access token/
    );
    await assert.rejects(
      () => refreshOAuthToken({
        type: 'oauth2',
        tokenUrl: `${server.baseUrl}/revoked`,
        refreshToken: 'refresh-token',
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }, null),
      (error) => {
        assert.match(error.message, /refresh_token=\[redacted\]/);
        assert.match(error.message, /client_secret=\[redacted\]/);
        assert.doesNotMatch(error.message, /refresh-secret|client-secret/);
        return true;
      }
    );
  } finally {
    await server.close();
  }
});

test('runs OAuth 2.0 device authorization and polling helpers', async () => {
  let tokenAttempts = 0;
  const server = await createServer(async (request, response) => {
    if (request.url === '/device') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://auth.example.test/device',
        verification_uri_complete: 'https://auth.example.test/device?user_code=ABCD-EFGH',
        expires_in: 30,
        interval: 0.001
      }));
      return;
    }
    if (request.url === '/token') {
      tokenAttempts++;
      response.setHeader('Content-Type', 'application/json');
      if (tokenAttempts === 1) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'authorization_pending' }));
        return;
      }
      response.end(JSON.stringify({
        access_token: 'device-access-token',
        refresh_token: 'device-refresh-token',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    const pendingAuth = await requestOAuthDeviceAuthorization({
      type: 'oauth2',
      grantType: 'deviceCode',
      deviceAuthorizationUrl: `${server.baseUrl}/device`,
      tokenUrl: `${server.baseUrl}/token`,
      clientId: 'client-id',
      scopes: 'openid profile'
    }, null);

    assert.equal(pendingAuth.deviceCode, 'device-code');
    assert.equal(pendingAuth.userCode, 'ABCD-EFGH');
    assert.equal(pendingAuth.verificationUriComplete, 'https://auth.example.test/device?user_code=ABCD-EFGH');
    assert.equal(pendingAuth.devicePollIntervalSeconds, '0.001');

    const completedAuth = await pollOAuthDeviceToken(pendingAuth, null);
    assert.equal(completedAuth.accessToken, 'device-access-token');
    assert.equal(completedAuth.refreshToken, 'device-refresh-token');
    assert.equal(completedAuth.deviceCode, '');
    assert.equal(tokenAttempts, 2);
  } finally {
    await server.close();
  }
});

test('handles OAuth 2.0 device-code slow_down polling responses', async () => {
  let tokenAttempts = 0;
  const server = await createServer(async (request, response) => {
    if (request.url === '/device') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        device_code: 'slow-device',
        user_code: 'SLOW',
        verification_uri: 'https://auth.example.test/device',
        expires_in: 30,
        interval: 0.001
      }));
      return;
    }
    if (request.url === '/token') {
      tokenAttempts++;
      response.setHeader('Content-Type', 'application/json');
      if (tokenAttempts === 1) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'slow_down' }));
        return;
      }
      response.end(JSON.stringify({
        access_token: 'slow-device-access-token',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    const pendingAuth = await requestOAuthDeviceAuthorization({
      type: 'oauth2',
      grantType: 'deviceCode',
      deviceAuthorizationUrl: `${server.baseUrl}/device`,
      tokenUrl: `${server.baseUrl}/token`,
      clientId: 'client-id'
    }, null);
    const completedAuth = await pollOAuthDeviceToken(pendingAuth, null);
    assert.equal(completedAuth.accessToken, 'slow-device-access-token');
    assert.equal(tokenAttempts, 2);
  } finally {
    await server.close();
  }
});

test('handles OAuth 2.0 device-code provider denial and expiration errors', async () => {
  const server = await createServer(async (request, response) => {
    if (request.url === '/device-denied') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        device_code: 'denied-device',
        user_code: 'DENY',
        verification_uri: 'https://auth.example.test/device',
        expires_in: 30,
        interval: 0.001
      }));
      return;
    }
    if (request.url === '/device-expired') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        device_code: 'expired-device',
        user_code: 'EXPIRE',
        verification_uri: 'https://auth.example.test/device',
        expires_in: 30,
        interval: 0.001
      }));
      return;
    }
    if (request.url === '/token') {
      response.statusCode = 400;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        error: request.headers['x-unused'] ? 'authorization_pending' : 'access_denied'
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    const denied = await requestOAuthDeviceAuthorization({
      type: 'oauth2',
      grantType: 'deviceCode',
      deviceAuthorizationUrl: `${server.baseUrl}/device-denied`,
      tokenUrl: `${server.baseUrl}/token`,
      clientId: 'client-id'
    }, null);
    await assert.rejects(() => pollOAuthDeviceToken(denied, null), /device authorization was denied/);

    const expiredServer = await createServer(async (request, response) => {
      if (request.url === '/token') {
        response.statusCode = 400;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: 'expired_token' }));
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        device_code: 'expired-device',
        user_code: 'EXPIRE',
        verification_uri: 'https://auth.example.test/device',
        expires_in: 30,
        interval: 0.001
      }));
    });
    try {
      const expired = await requestOAuthDeviceAuthorization({
        type: 'oauth2',
        grantType: 'deviceCode',
        deviceAuthorizationUrl: `${expiredServer.baseUrl}/device`,
        tokenUrl: `${expiredServer.baseUrl}/token`,
        clientId: 'client-id'
      }, null);
      await assert.rejects(() => pollOAuthDeviceToken(expired, null), /device authorization expired/);
    } finally {
      await expiredServer.close();
    }
  } finally {
    await server.close();
  }
});

test('redacts OAuth provider error strings without removing useful context', () => {
  const message = redactOAuthErrorMessage('bad access_token=abc refresh_token=def client_secret=ghi token=opaque secret=value cookie=session code=secret authorization_code=secret2 user_code=ABCD Bearer live-token Authorization: Basic dXNlcjpwYXNz Proxy-Authorization="OAuth oauth-leak" Authorization: Digest username="alice", nonce="abc123", response="deadbeef" Digest username="standalone-user", realm="standalone-realm", nonce="standalone-nonce", uri="/standalone/path", response="standalone-response", cnonce="standalone-cnonce" authHeader=Basic auth-header-leak authorizationHeader=OAuth authorization-header-leak proxy_authorization=Basic proxy-leak proxyAuthorizationHeader=Bearer proxy-header-leak');
  assert.equal(
    message,
    'bad access_token=[redacted] refresh_token=[redacted] client_secret=[redacted] token=[redacted] secret=[redacted] cookie=[redacted] code=[redacted] authorization_code=[redacted] user_code=[redacted] Authorization: [redacted] Proxy-Authorization=[redacted] Authorization: [redacted] [redacted-auth] authHeader=[redacted] authorizationHeader=[redacted] proxy_authorization=[redacted] proxyAuthorizationHeader=[redacted]'
  );
  assert.equal(
    redactOAuthErrorMessage('Authorization: [redacted] authHeader=Bearer [redacted] proxy_authorization=[redacted] Bearer [redacted]'),
    'Authorization: [redacted] authHeader=Bearer [redacted] proxy_authorization=[redacted] Bearer [redacted]'
  );
  assert.doesNotMatch(message, /auth-header-leak|authorization-header-leak|proxy-leak|proxy-header-leak|alice|abc123|deadbeef|standalone-user|standalone-realm|standalone-nonce|standalone-response|standalone-cnonce|\/standalone\/path/);
  const jsonHeader = redactOAuthErrorMessage('{"Authorization":"Digest username=\\"json-user\\", nonce=\\"json-nonce\\", response=\\"json-response\\""}');
  assert.doesNotMatch(jsonHeader, /json-user|json-nonce|json-response/);
  const escapedDigestHeader = redactOAuthErrorMessage('oauth: {"authorizationHeader":"Digest username=\\"digest-user\\", realm=\\"digest-realm\\", nonce=\\"digest-nonce\\", uri=\\"/digest/path\\", response=\\"digest-response\\", cnonce=\\"digest-cnonce\\"","setCookieHeader":"sid=digest-cookie"}');
  assert.doesNotMatch(escapedDigestHeader, /digest-user|digest-realm|digest-nonce|digest-response|digest-cnonce|\/digest\/path|digest-cookie/);
  const tokenAliasMessage = redactOAuthErrorMessage('bearerToken=bearer-token-secret oauthToken=oauth-token-secret authToken=auth-token-secret authorizationToken=authorization-token-secret clientToken=client-token-secret next=ok');
  assert.doesNotMatch(tokenAliasMessage, /bearer-token-secret|oauth-token-secret|auth-token-secret|authorization-token-secret|client-token-secret/);
  assert.match(tokenAliasMessage, /next=ok/);
});

test('redacts OAuth provider error variants for signed auth and multi-word secret fields', () => {
  const nestedEscaped = JSON.stringify({
    output: JSON.stringify({
      body: 'oauth-nested-json-body-secret',
      bodyPreview: 'oauth-nested-json-preview-secret',
      responseText: 'oauth-nested-json-response-secret',
      'rendered-response': 'oauth-nested-json-rendered-secret'
    })
  });
  const redacted = redactOAuthErrorMessage([
    'code-verifier=hyphen verifier secret next=ok',
    'client-assertion=hyphen assertion secret next=ok',
    'code verifier code-verifier-label-secret client assertion client-assertion-label-secret',
    'body=oauth-body-assignment-secret bodyPreview=oauth-body-preview-assignment-secret responseText=oauth-response-text-assignment-secret rendered-response=oauth-rendered-response-assignment-secret {"body":"oauth-json-body-secret"}',
    nestedEscaped,
    '{\\"body\\":\\"oauth-raw-escaped-body-secret\\",\\"responseText\\":\\"oauth-raw-escaped-response-secret\\"}',
    'responseBodyText oauth-response-body-secret requestBodyText oauth-request-body-secret variables oauth-variables-secret text oauth-text-secret protocolMessages oauth-protocol-secret consoleOutput oauth-console-secret payloadIdentifier oauth-payload-secret',
    'client-secret=hyphen client secret next=ok',
    'authorization-code=secret authorization code words next=ok',
    'client-secret=secret Bearer word next=ok',
    'password=alpha beta gamma next=ok',
    'passphrase="quoted passphrase secret"',
    'credentials=credential bag with spaces next=ok',
    'Hawk id="hawk-id", nonce="hawk-nonce", mac="hawk-mac"',
    'OAuth oauth_consumer_key="oauth-consumer", oauth_token="oauth-token", oauth_signature="oauth-signature"',
    'AWS4-HMAC-SHA256 Credential=aws-credential/20260502/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=aws-signature',
    'EG1-HMAC-SHA256 client_token=akamai-client;access_token=akamai-access;timestamp=20260502T000000Z;nonce=akamai-nonce;signature=akamai-signature',
    'X-Amz-Credential=aws-query-credential x-amz-credential=aws-lower-credential xAmzCredential=aws-camel-credential X-Amz-Signature=aws-query-signature X-Amz-Security-Token=aws-security-token'
  ].join(' '));

  assert.doesNotMatch(redacted, /hyphen verifier secret|hyphen assertion secret|code-verifier-label-secret|client-assertion-label-secret|oauth-body-assignment-secret|oauth-body-preview-assignment-secret|oauth-response-text-assignment-secret|oauth-rendered-response-assignment-secret|oauth-json-body-secret|oauth-nested-json-body-secret|oauth-nested-json-preview-secret|oauth-nested-json-response-secret|oauth-nested-json-rendered-secret|oauth-raw-escaped-body-secret|oauth-raw-escaped-response-secret|oauth-response-body-secret|oauth-request-body-secret|oauth-variables-secret|oauth-text-secret|oauth-protocol-secret|oauth-console-secret|oauth-payload-secret|hyphen client secret|client secret next|authorization code words|Bearer word|alpha beta gamma|quoted passphrase secret|credential bag with spaces/);
  assert.doesNotMatch(redacted, /hawk-id|hawk-nonce|hawk-mac|oauth-consumer|oauth-token|oauth-signature|aws-credential|aws-signature|akamai-client|akamai-access|akamai-nonce|akamai-signature|aws-query-credential|aws-lower-credential|aws-camel-credential|aws-query-signature|aws-security-token/);
  assert.match(redacted, /next=ok/);
  const bareLabels = redactOAuthErrorMessage('provider failed authorization code authcodevalue client secret clientSecretValue device code deviceCodeValue user code userCodeValue code verifier verifierValue client assertion assertionValue cert passphrase passphraseSecret private key privateKeyValue');
  assert.doesNotMatch(bareLabels, /authcodevalue|clientSecretValue|deviceCodeValue|userCodeValue|verifierValue|assertionValue|passphraseSecret|privateKeyValue/);
  assert.equal(
    redactOAuthErrorMessage('OAuth 2.0 provider returned invalid_grant'),
    'OAuth 2.0 provider returned invalid_grant'
  );
  assert.equal(
    redactOAuthErrorMessage('token endpoint returned invalid_grant'),
    'token endpoint returned invalid_grant'
  );
  assert.equal(
    redactOAuthErrorMessage('Basic authentication failed. Bearer authentication is required.'),
    'Basic authentication failed. Bearer authentication is required.'
  );
});

test('redacts OAuth provider error URLs credentials file URLs and local paths', () => {
  const redacted = redactOAuthErrorMessage([
    'provider failed at https://user:password@example.test/callback?access_token=url-token&visible=1',
    'provider failed at file:///Users/Alice/oauth.json?token=file-token',
    'provider failed at C:\\Users\\Alice\\oauth.json and /home/alice/oauth.json',
    'provider said access_token%3Dsingle-token-secret code%3Dsingle-code-secret state%253Ddouble-state-secret access_token%3Dprovider-token%26code%3Dprovider-code%26state%3Dprovider-state',
    'provider failed at C:\\Users\\Alice\\oauth.json Digest realm="digest-private-realm", nonce="digest-secret-nonce", response="digest-secret-response"',
    'provider failed with -----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----',
    'provider returned Cookie sid=bare-cookie-secret; csrftoken=second-bare-cookie-secret authentication failed',
    'provider returned Set-Cookie sid=bare-set-cookie-secret; Path=/; HttpOnly token endpoint failed',
    'provider returned Cookie: sid=first-cookie-secret; csrftoken=second-cookie-secret',
    'provider returned Set-Cookie: sid=first-set-cookie-secret; Path=/; HttpOnly; csrfToken=second-set-cookie-secret',
    '{"cookieHeader":"sid=json-cookie-header-secret; csrf=json-cookie-header-second-secret"}'
  ].join(' '));

  assert.doesNotMatch(redacted, /user:password|example\.test|url-token|file-token|file:\/\/\/Users\/Alice|C:\\Users\\Alice|\/home\/alice|single-token-secret|single-code-secret|double-state-secret|provider-token|provider-code|provider-state|digest-private-realm|digest-secret-nonce|digest-secret-response|private-key-secret|bare-cookie-secret|second-bare-cookie-secret|bare-set-cookie-secret|first-cookie-secret|second-cookie-secret|first-set-cookie-secret|second-set-cookie-secret|json-cookie-header-secret|json-cookie-header-second-secret/);
  assert.match(redacted, /\[url\]/);
  assert.match(redacted, /\[path\]/);
  assert.match(redacted, /\[redacted-auth\]|\[redacted\]/);
  assert.match(redacted, /\[redacted-private-key\]/);
  assert.equal(
    redactOAuthErrorMessage('Basic authentication failed. Bearer authentication is required. token endpoint failed.'),
    'Basic authentication failed. Bearer authentication is required. token endpoint failed.'
  );
  assert.equal(
    redactOAuthErrorMessage('Cookie authentication failed. Cookie jar disabled. Set-Cookie handling unavailable.'),
    'Cookie authentication failed. Cookie jar disabled. Set-Cookie handling unavailable.'
  );

  const multilineCookieContext = redactOAuthErrorMessage(
    'provider returned Cookie: sid=first-cookie-secret; csrftoken=second-cookie-secret\nOAuth 2.0 provider returned invalid_grant token endpoint failed.'
  );
  assert.doesNotMatch(multilineCookieContext, /first-cookie-secret|second-cookie-secret/);
  assert.match(multilineCookieContext, /Cookie: \[redacted\] OAuth 2\.0 provider returned invalid_grant token endpoint failed\./);

  const sameLineCookieContext = redactOAuthErrorMessage(
    'provider returned Set-Cookie: sid=first-set-cookie-secret; Path=/; HttpOnly; csrfToken=second-set-cookie-secret; token endpoint failed.'
  );
  assert.doesNotMatch(sameLineCookieContext, /first-set-cookie-secret|second-set-cookie-secret/);
  assert.match(sameLineCookieContext, /Set-Cookie: \[redacted\] token endpoint failed\./);

  const sameLineAuthContext = redactOAuthErrorMessage(
    'Cookie: sid=auth-cookie-secret Basic authentication failed. Bearer authentication is required.'
  );
  assert.doesNotMatch(sameLineAuthContext, /auth-cookie-secret/);
  assert.equal(
    sameLineAuthContext,
    'Cookie: [redacted] Basic authentication failed. Bearer authentication is required.'
  );
});

test('rejects unsafe OAuth 2.0 device verification URLs', async () => {
  const server = await createServer(async (_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      device_code: 'device-code',
      user_code: 'ABCD-EFGH',
      verification_uri: 'javascript:alert(1)',
      expires_in: 30
    }));
  });

  try {
    await assert.rejects(
      () => requestOAuthDeviceAuthorization({
        type: 'oauth2',
        grantType: 'deviceCode',
        deviceAuthorizationUrl: `${server.baseUrl}/device`,
        tokenUrl: `${server.baseUrl}/token`,
        clientId: 'client-id'
      }, null),
      /OAuth 2.0 verification URL must use http or https/
    );
  } finally {
    await server.close();
  }
});

test('polls OAuth 2.0 device token before request execution', async () => {
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'device-send-token',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || ''
    }));
  });

  try {
    const result = await sendRequest({
      id: 'r3',
      method: 'GET',
      url: `${server.baseUrl}/resource`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth2',
        grantType: 'deviceCode',
        tokenUrl: `${server.baseUrl}/token`,
        clientId: 'client-id',
        deviceCode: 'device-code',
        deviceCodeExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        devicePollIntervalSeconds: '0.001'
      }
    });

    const body = JSON.parse(result.body);
    assert.equal(body.authorization, 'Bearer device-send-token');
    assert.equal(result.updatedAuth.accessToken, 'device-send-token');
    assert.equal(result.updatedAuth.deviceCode, '');
  } finally {
    await server.close();
  }
});

async function authRequest(baseUrl, auth, options = {}) {
  const parsed = new URL(baseUrl);
  const url = parsed.pathname === '/' ? `${baseUrl}/auth` : baseUrl;
  const result = await sendRequest({
    method: 'GET',
    url,
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: '',
    auth
  }, null, options);
  return JSON.parse(result.body);
}

async function createServer(handler) {
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.statusCode = 500;
      response.end(error.stack || String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function digestChallengeHeader(challenge) {
  const fields = [
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `qop="${challenge.qop || 'auth'}"`,
    `algorithm=${challenge.algorithm || 'MD5'}`
  ];
  if (challenge.opaque) {
    fields.push(`opaque="${challenge.opaque}"`);
  }
  return `Digest ${fields.join(', ')}`;
}

function parseDigestAuthorization(header) {
  const value = String(header || '').replace(/^Digest\s+/i, '');
  const fields = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))(?:,|$)/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    fields[match[1]] = match[2] != null ? match[2].replace(/\\"/g, '"') : String(match[3] || '').trim();
  }
  return fields;
}

function verifyDigestAuthorization(fields, expected) {
  if (!fields || fields.username !== 'ada' || fields.realm !== expected.realm || fields.nonce !== expected.nonce) {
    return false;
  }
  if (fields.uri !== expected.uri || fields.qop !== expected.qop || fields.opaque !== (expected.opaque || '')) {
    return false;
  }
  const algorithm = digestAlgorithm(fields.algorithm || expected.algorithm);
  if (!algorithm) {
    return false;
  }
  let ha1 = digestHash(algorithm.hash, `${fields.username}:${expected.realm}:${expected.password}`);
  if (algorithm.sess) {
    ha1 = digestHash(algorithm.hash, `${ha1}:${expected.nonce}:${fields.cnonce}`);
  }
  const ha2 = digestHash(algorithm.hash, `${expected.method}:${expected.uri}`);
  const digest = digestHash(algorithm.hash, `${ha1}:${expected.nonce}:${fields.nc}:${fields.cnonce}:${fields.qop}:${ha2}`);
  return fields.response === digest;
}

function digestAlgorithm(value) {
  const label = String(value || 'MD5').trim();
  const hash = new Map([
    ['md5', 'md5'],
    ['md5-sess', 'md5'],
    ['sha-256', 'sha256'],
    ['sha-256-sess', 'sha256'],
    ['sha-512-256', 'sha512-256'],
    ['sha-512-256-sess', 'sha512-256']
  ]).get(label.toLowerCase());
  return hash ? { hash, sess: label.toLowerCase().endsWith('-sess') } : null;
}

function digestHash(algorithm, value) {
  return crypto.createHash(algorithm).update(value, 'utf8').digest('hex');
}

function ntlmType2Challenge() {
  const target = Buffer.from('POSTMETER', 'utf16le');
  const targetInfo = Buffer.from('00000000', 'hex');
  const payloadOffset = 48;
  const message = Buffer.alloc(payloadOffset + target.length + targetInfo.length);
  message.write('NTLMSSP\0', 0, 'ascii');
  message.writeUInt32LE(2, 8);
  writeSecurityBuffer(message, 12, target.length, payloadOffset);
  message.writeUInt32LE(0x02888205, 20);
  Buffer.from('0123456789abcdef', 'hex').copy(message, 24);
  writeSecurityBuffer(message, 40, targetInfo.length, payloadOffset + target.length);
  target.copy(message, payloadOffset);
  targetInfo.copy(message, payloadOffset + target.length);
  return message.toString('base64');
}

function writeSecurityBuffer(message, offset, length, payloadOffset) {
  message.writeUInt16LE(length, offset);
  message.writeUInt16LE(length, offset + 2);
  message.writeUInt32LE(payloadOffset, offset + 4);
}
