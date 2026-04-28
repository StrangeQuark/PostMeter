const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  normalizeAuth,
  pkceChallengeForVerifier,
  pollOAuthDeviceToken,
  requestOAuthDeviceAuthorization,
  shouldRequestClientCredentialsToken,
  validateAuth
} = require('../../src/core/auth');
const { sendRequest } = require('../../src/core/httpClient');

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
  const server = await createServer(async (request, response) => {
    if (request.url === '/digest' && !request.headers.authorization) {
      response.writeHead(401, {
        'WWW-Authenticate': 'Digest realm="postmeter", nonce="abc123", qop="auth", algorithm=MD5',
        'Content-Type': 'application/json'
      });
      response.end(JSON.stringify({ challenge: true }));
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || '',
      amzDate: request.headers['x-amz-date'] || '',
      amzToken: request.headers['x-amz-security-token'] || ''
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
