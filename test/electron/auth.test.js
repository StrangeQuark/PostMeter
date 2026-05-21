const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const {
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  isLoopbackOAuthUrl,
  normalizeAuth,
  pkceChallengeForVerifier,
  pollOAuthDeviceToken,
  redactOAuthErrorMessage,
  refreshOAuthToken,
  requestOAuthClientCredentialsToken,
  requestOAuthDeviceAuthorization,
  requestOAuthPasswordCredentialsToken,
  shouldRequestClientCredentialsToken,
  shouldRequestPasswordCredentialsToken,
  validateAuth
} = require('../../src/core/http/auth');
const { sendRequest } = require('../../src/core/http/httpClient');

const DIGEST_ALGORITHM_OPTIONS = [
  'MD5',
  'MD5-sess',
  'SHA-256',
  'SHA-256-sess',
  'SHA-512-256',
  'SHA-512-256-sess'
];
const OAUTH1_SIGNATURE_METHOD_OPTIONS = [
  'HMAC-SHA1',
  'HMAC-SHA256',
  'HMAC-SHA512',
  'RSA-SHA1',
  'RSA-SHA256',
  'RSA-SHA512',
  'PLAINTEXT'
];
const JWT_BEARER_ALGORITHM_OPTIONS = [
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512'
];
const ASAP_ALGORITHM_OPTIONS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512'
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
    grantType: 'passwordCredentials',
    tokenUrl: 'https://auth.example.test/token',
    username: 'owner',
    password: 'secret'
  }, null), []);
  assert.deepEqual(validateAuth({
    type: 'oauth2',
    grantType: 'implicit',
    authorizationUrl: 'https://auth.example.test/authorize',
    clientId: 'client-id'
  }, null), ['Start and complete the OAuth 2.0 implicit flow before sending this request.']);
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
  assert.deepEqual(validateAuth({
    type: 'oauth1',
    signatureMethod: 'RSA-SHA256',
    consumerKey: 'consumer',
    consumerSecret: '',
    privateKey: 'private-key'
  }, null), []);
  assert.deepEqual(validateAuth({
    type: 'oauth1',
    signatureMethod: 'RSA-SHA256',
    consumerKey: 'consumer',
    consumerSecret: '',
    privateKey: ''
  }, null), ['OAuth 1.0 private key is required.']);
  assert.deepEqual(validateAuth({
    type: 'oauth1',
    signatureMethod: 'HMAC-SHA512',
    consumerKey: 'consumer',
    consumerSecret: ''
  }, null), ['OAuth 1.0 consumer secret is required.']);
  assert.deepEqual(validateAuth({
    type: 'hawk',
    authId: 'hawk-id',
    authKey: 'hawk-secret',
    algorithm: 'SHA-1'
  }, null), []);
  assert.deepEqual(validateAuth({
    type: 'hawk',
    authId: 'hawk-id',
    authKey: 'hawk-secret',
    algorithm: 'SHA-512'
  }, null), ['Unsupported Hawk auth algorithm: SHA-512.']);
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
      tokenQuery: new URL(request.url, 'http://127.0.0.1').searchParams.get('token') || ''
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
      addTokenTo: 'query'
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

test('executes NTLM auth against a localhost challenge server', async () => {
  let challengeCount = 0;
  const server = await createServer(async (request, response) => {
    const authorization = request.headers.authorization || '';
    if (request.url === '/ntlm-no-retry') {
      response.writeHead(401, {
        'WWW-Authenticate': `NTLM ${ntlmType2Challenge()}`,
        'Content-Type': 'application/json',
        Connection: 'keep-alive'
      });
      response.end(JSON.stringify({
        initial: parseNtlmType1Authorization(authorization)
      }));
      return;
    }
    if (request.url === '/ntlm' && !/^NTLM\s+TlRMTVNTUAAD/.test(authorization)) {
      challengeCount += 1;
      const initial = parseNtlmType1Authorization(authorization);
      assert.equal(initial.type, 1);
      assert.equal(initial.domain, 'POSTMETER');
      assert.equal(initial.workstation, 'WORKSTATION');
      response.writeHead(401, {
        'WWW-Authenticate': `NTLM ${ntlmType2Challenge()}`,
        'Content-Type': 'application/json',
        Connection: 'keep-alive'
      });
      response.end(JSON.stringify({ challenge: true }));
      return;
    }
    const type3 = parseNtlmType3Authorization(authorization);
    const verified = verifyNtlmType3(type3, {
      username: 'ada',
      password: 'secret',
      domain: 'POSTMETER',
      workstation: 'WORKSTATION',
      targetName: 'POSTMETER',
      serverChallenge: Buffer.from('0123456789abcdef', 'hex')
    });
    response.statusCode = verified ? 200 : 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ type3, verified }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/ntlm`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'ntlm',
        username: 'ada',
        password: 'secret',
        domain: 'postmeter',
        workstation: 'workstation'
      }
    }, null, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(challengeCount, 1);
    assert.equal(body.verified, true);
    assert.equal(body.type3.user, 'ada');
    assert.equal(body.type3.domain, 'POSTMETER');
    assert.equal(body.type3.workstation, 'WORKSTATION');

    const disabled = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/ntlm-no-retry`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'ntlm',
        username: 'ada',
        password: 'secret',
        domain: 'postmeter',
        workstation: 'workstation',
        disableRetryingRequest: true
      }
    });
    assert.equal(disabled.statusCode, 401);
    const disabledBody = JSON.parse(disabled.body);
    assert.equal(disabledBody.initial.type, 1);
    assert.equal(disabledBody.initial.domain, 'POSTMETER');
  } finally {
    await server.close();
  }
});

test('executes Akamai EdgeGrid auth against a localhost verifier', async () => {
  const credentials = {
    accessToken: 'akamai-access',
    clientToken: 'akamai-client',
    clientSecret: 'akamai-secret',
    nonce: 'akamai-nonce',
    timestamp: '20260427T12:00:00+0000',
    baseUrl: 'https://edge.example.test',
    headersToSign: 'x-custom x-second',
    maxBodySize: '7'
  };
  const server = await createServer(async (request, response) => {
    const bodyText = await readRequestBody(request);
    const verification = verifyAkamaiEdgeGridRequest({
      ...credentials,
      body: bodyText,
      headers: request.headers,
      method: request.method,
      url: `http://${request.headers.host}${request.url}`
    });
    response.statusCode = verification.verified ? 200 : 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(verification));
  });

  try {
    const result = await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/akamai/resource?existing=1`,
      queryParams: [],
      headers: [
        { enabled: true, key: 'X-Custom', value: 'alpha  beta' },
        { enabled: true, key: 'X-Second', value: 'signed' },
        { enabled: true, key: 'Content-Type', value: 'text/plain' }
      ],
      bodyType: 'RAW_TEXT',
      body: '0123456789-body',
      auth: {
        type: 'akamaiEdgeGrid',
        ...credentials
      }
    });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.verified, true);
    assert.equal(body.fields.client_token, 'akamai-client');
    assert.equal(body.fields.access_token, 'akamai-access');
    assert.equal(body.fields.nonce, 'akamai-nonce');
    assert.equal(body.fields.timestamp, '20260427T12:00:00+0000');
  } finally {
    await server.close();
  }
});

test('executes JWT Bearer auth against a localhost verifier for every exposed algorithm', async () => {
  const server = await createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || '',
      tokenQuery: url.searchParams.get('token') || ''
    }));
  });

  try {
    for (const algorithm of JWT_BEARER_ALGORITHM_OPTIONS) {
      const material = jwtTestKeyMaterial(algorithm);
      const auth = {
        type: 'jwtBearer',
        algorithm,
        expiresIn: '120',
        claims: JSON.stringify({ custom: algorithm, aud: 'jwt-audience' }),
        jwtHeaders: JSON.stringify({ kid: `jwt-${algorithm}`, x_postmeter: 'ok' })
      };
      if (algorithm.startsWith('HS')) {
        auth.secret = Buffer.from(material.secret).toString('base64');
        auth.secretBase64Encoded = true;
      } else {
        auth.privateKey = material.privateKey;
      }
      const result = await authRequest(`${server.baseUrl}/jwt/${algorithm}`, auth, {
        now: Date.parse('2026-04-27T12:00:00.000Z')
      });
      assert.match(result.authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      const verified = verifyJwtToken(result.authorization.replace(/^Bearer\s+/, ''), {
        algorithm,
        publicKey: material.publicKey,
        secret: material.secret
      });
      assert.equal(verified.header.alg, algorithm);
      assert.equal(verified.header.kid, `jwt-${algorithm}`);
      assert.equal(verified.header.x_postmeter, 'ok');
      assert.equal(verified.payload.custom, algorithm);
      assert.equal(verified.payload.aud, 'jwt-audience');
      assert.equal(verified.payload.iat, 1777291200);
      assert.equal(verified.payload.exp, 1777291320);
    }

    const queryResult = await authRequest(`${server.baseUrl}/jwt-query`, {
      type: 'jwtBearer',
      algorithm: 'HS256',
      secret: 'jwt-query-secret',
      addTokenTo: 'Request URL',
      claims: '{"query":true}'
    }, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    assert.equal(queryResult.authorization, '');
    const queryVerified = verifyJwtToken(queryResult.tokenQuery, {
      algorithm: 'HS256',
      secret: 'jwt-query-secret'
    });
    assert.equal(queryVerified.payload.query, true);
  } finally {
    await server.close();
  }
});

test('executes ASAP auth against a localhost verifier for every exposed algorithm', async () => {
  const server = await createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || ''
    }));
  });

  try {
    for (const algorithm of ASAP_ALGORITHM_OPTIONS) {
      const material = jwtTestKeyMaterial(algorithm);
      const result = await authRequest(`${server.baseUrl}/asap/${algorithm}`, {
        type: 'asap',
        algorithm,
        privateKey: material.privateKey,
        issuer: 'postmeter-issuer',
        subject: 'postmeter-subject',
        audience: 'postmeter-audience',
        keyId: `asap-${algorithm}`,
        expiresIn: '90',
        additionalClaims: '{"scope":["read","write"],"tenant":"postmeter","aud":"claim-audience","iss":"claim-issuer","sub":"claim-subject"}'
      }, { now: Date.parse('2026-04-27T12:00:00.000Z') });
      assert.match(result.authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      const verified = verifyJwtToken(result.authorization.replace(/^Bearer\s+/, ''), {
        algorithm,
        publicKey: material.publicKey
      });
      assert.equal(verified.header.alg, algorithm);
      assert.equal(verified.header.kid, `asap-${algorithm}`);
      assert.equal(verified.payload.iss, 'claim-issuer');
      assert.equal(verified.payload.sub, 'claim-subject');
      assert.equal(verified.payload.aud, 'claim-audience');
      assert.deepEqual(verified.payload.scope, ['read', 'write']);
      assert.equal(verified.payload.tenant, 'postmeter');
      assert.equal(verified.payload.exp, 1777291290);
    }
  } finally {
    await server.close();
  }
});

test('executes AWS Signature auth against a localhost server with header and query placement', async () => {
  const awsCredentials = {
    accessKey: 'AKIDEXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 'execute-api',
    sessionToken: 'session-token'
  };
  const server = await createServer(async (request, response) => {
    const bodyText = await readRequestBody(request);
    const verification = verifyAwsRequest({
      ...awsCredentials,
      body: bodyText,
      headers: request.headers,
      method: request.method,
      placement: request.url.startsWith('/aws-query') ? 'query' : 'header',
      url: `http://${request.headers.host}${request.url}`
    });
    response.statusCode = verification.verified ? 200 : 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      body: bodyText,
      fields: verification.fields,
      reason: verification.reason,
      verified: verification.verified
    }));
  });

  try {
    const headerResult = await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/aws-header?existing=1`,
      queryParams: [],
      headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
      bodyType: 'RAW_JSON',
      body: '{"server":"aws"}',
      auth: {
        type: 'aws',
        ...awsCredentials
      }
    }, null, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    const headerBody = JSON.parse(headerResult.body);
    assert.equal(headerResult.statusCode, 200);
    assert.equal(headerBody.verified, true);
    assert.equal(headerBody.fields.credentialScope, '20260427/us-east-1/execute-api/aws4_request');
    assert.equal(headerBody.fields.amzDate, '20260427T120000Z');
    assert.equal(headerBody.fields.sessionToken, 'session-token');
    assert.match(headerBody.fields.signedHeaders, /host/);
    assert.match(headerBody.fields.signedHeaders, /x-amz-date/);
    assert.match(headerBody.fields.authorization, /^AWS4-HMAC-SHA256 /);

    const queryResult = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/aws-query?existing=1`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'aws',
        ...awsCredentials,
        addAuthDataToQuery: true
      }
    }, null, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    const queryBody = JSON.parse(queryResult.body);
    assert.equal(queryResult.statusCode, 200);
    assert.equal(queryBody.verified, true);
    assert.equal(queryBody.fields.authorization, '');
    assert.equal(queryBody.fields.credentialScope, '20260427/us-east-1/execute-api/aws4_request');
    assert.equal(queryBody.fields.amzDate, '20260427T120000Z');
    assert.equal(queryBody.fields.sessionToken, 'session-token');
    assert.equal(queryBody.fields.expires, '900');
    assert.match(queryBody.fields.signature, /^[a-f0-9]{64}$/);
  } finally {
    await server.close();
  }
});

test('executes Hawk auth against a localhost server with advanced fields and payload hash', async () => {
  const server = await createServer(async (request, response) => {
    const bodyText = await readRequestBody(request);
    const sha1 = request.url.startsWith('/hawk-sha1');
    const verification = verifyHawkRequest({
      algorithm: sha1 ? 'sha1' : 'sha256',
      authKey: sha1 ? 'hawk-sha1-secret' : 'hawk-secret',
      body: bodyText,
      contentType: request.headers['content-type'],
      expectedApp: sha1 ? '' : 'postmeter-app',
      expectedDelegation: sha1 ? '' : 'delegated-by',
      expectedExt: sha1 ? '' : 'extra-data',
      expectedId: sha1 ? 'hawk-sha1-id' : 'hawk-id',
      expectedNonce: sha1 ? 'sha1-nonce' : 'fixed-nonce',
      expectedTs: sha1 ? '1777291300' : '1777291200',
      includePayloadHash: !sha1,
      method: request.method,
      url: `http://${request.headers.host}${request.url}`
    }, request.headers.authorization || '');
    response.statusCode = verification.verified ? 200 : 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      body: bodyText,
      fields: verification.fields,
      reason: verification.reason,
      verified: verification.verified
    }));
  });

  try {
    const result = await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/hawk?mode=advanced`,
      queryParams: [],
      headers: [{ enabled: true, key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      bodyType: 'RAW_JSON',
      body: '{"server":"hawk"}',
      auth: {
        type: 'hawk',
        authId: 'hawk-id',
        authKey: 'hawk-secret',
        algorithm: 'SHA-256',
        user: 'ada',
        nonce: 'fixed-nonce',
        extraData: 'extra-data',
        app: 'postmeter-app',
        delegation: 'delegated-by',
        timestamp: '1777291200',
        includePayloadHash: true
      }
    });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.verified, true);
    assert.equal(body.fields.id, 'hawk-id');
    assert.equal(body.fields.ts, '1777291200');
    assert.equal(body.fields.nonce, 'fixed-nonce');
    assert.equal(body.fields.ext, 'extra-data');
    assert.equal(body.fields.app, 'postmeter-app');
    assert.equal(body.fields.dlg, 'delegated-by');
    assert.match(body.fields.hash, /\S+/);
    assert.match(body.fields.mac, /\S+/);
    assert.equal(Object.prototype.hasOwnProperty.call(body.fields, 'user'), false);

    const sha1Result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/hawk-sha1`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'hawk',
        authId: 'hawk-sha1-id',
        authKey: 'hawk-sha1-secret',
        algorithm: 'SHA-1',
        nonce: 'sha1-nonce',
        timestamp: '1777291300'
      }
    });
    const sha1Body = JSON.parse(sha1Result.body);
    assert.equal(sha1Result.statusCode, 200);
    assert.equal(sha1Body.verified, true);
    assert.equal(sha1Body.fields.id, 'hawk-sha1-id');
    assert.equal(Object.prototype.hasOwnProperty.call(sha1Body.fields, 'hash'), false);
  } finally {
    await server.close();
  }
});

test('executes OAuth 1.0 header auth against a localhost server with advanced fields', async () => {
  const server = await createServer(async (request, response) => {
    const bodyText = await readRequestBody(request);
    const fields = parseOAuthAuthorization(request.headers.authorization || '');
    const verified = verifyOAuth1Request({
      body: bodyText,
      consumerSecret: 'consumer-secret',
      contentType: request.headers['content-type'],
      includeEmptyParams: true,
      method: request.method,
      oauthParams: fields,
      placement: 'header',
      tokenSecret: 'token-secret',
      url: `http://${request.headers.host}${request.url}`
    });
    response.statusCode = verified ? 200 : 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ fields, verified }));
  });

  try {
    const result = await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/oauth1-header?existing=1`,
      queryParams: [],
      headers: [],
      bodyType: 'RAW_TEXT',
      body: 'signed body',
      auth: {
        type: 'oauth1',
        signatureMethod: 'HMAC-SHA256',
        consumerKey: 'consumer',
        consumerSecret: 'consumer-secret',
        token: 'token',
        tokenSecret: 'token-secret',
        callback: 'https://client.example.test/callback',
        verifier: '',
        timestamp: '1777291200',
        nonce: 'oauth-nonce',
        version: '1.0',
        realm: 'postmeter',
        includeBodyHash: true,
        addEmptyParamsToSign: true
      }
    }, null, { now: Date.parse('2026-04-27T12:00:00.000Z') });
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.verified, true);
    assert.equal(body.fields.realm, 'postmeter');
    assert.equal(body.fields.oauth_signature_method, 'HMAC-SHA256');
    assert.equal(body.fields.oauth_consumer_key, 'consumer');
    assert.equal(body.fields.oauth_token, 'token');
    assert.equal(body.fields.oauth_callback, 'https://client.example.test/callback');
    assert.equal(body.fields.oauth_verifier, '');
    assert.equal(body.fields.oauth_body_hash, crypto.createHash('sha1').update('signed body', 'utf8').digest('base64'));
  } finally {
    await server.close();
  }
});

test('executes OAuth 1.0 header auth for every Signature Method dropdown option', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const server = await createServer(async (request, response) => {
    const fields = parseOAuthAuthorization(request.headers.authorization || '');
    const verified = verifyOAuth1Request({
      body: '',
      consumerSecret: fields.oauth_signature_method?.startsWith('RSA-') ? privateKey : 'consumer-secret',
      contentType: request.headers['content-type'],
      includeEmptyParams: false,
      method: request.method,
      oauthParams: fields,
      placement: 'header',
      publicKey,
      tokenSecret: fields.oauth_signature_method?.startsWith('RSA-') ? '' : 'token-secret',
      url: `http://${request.headers.host}${request.url}`
    });
    response.statusCode = verified ? 200 : 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ fields, verified }));
  });

  try {
    for (const signatureMethod of OAUTH1_SIGNATURE_METHOD_OPTIONS) {
      const rsa = signatureMethod.startsWith('RSA-');
      const result = await sendRequest({
        method: 'GET',
        url: `${server.baseUrl}/oauth1-method/${encodeURIComponent(signatureMethod)}?existing=1`,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: {
          type: 'oauth1',
          signatureMethod,
          consumerKey: 'consumer',
          consumerSecret: rsa ? '' : 'consumer-secret',
          privateKey: rsa ? privateKey : '',
          token: 'token',
          tokenSecret: rsa ? '' : 'token-secret',
          nonce: `nonce-${signatureMethod}`,
          timestamp: '1777291200'
        }
      });
      const body = JSON.parse(result.body);
      assert.equal(result.statusCode, 200, `${signatureMethod} should authenticate successfully`);
      assert.equal(body.verified, true, `${signatureMethod} should verify against the localhost server`);
      assert.equal(body.fields.oauth_signature_method, signatureMethod);
      assert.match(body.fields.oauth_signature, /\S+/);
    }
  } finally {
    await server.close();
  }
});

test('executes OAuth 1.0 RSA auth using Private Key over hidden shared-secret fields', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const server = await createServer(async (request, response) => {
    const fields = parseOAuthAuthorization(request.headers.authorization || '');
    const verified = verifyOAuth1Request({
      body: '',
      consumerSecret: 'stale-consumer-secret',
      contentType: request.headers['content-type'],
      includeEmptyParams: false,
      method: request.method,
      oauthParams: fields,
      placement: 'header',
      publicKey,
      tokenSecret: 'stale-token-secret',
      url: `http://${request.headers.host}${request.url}`
    });
    response.statusCode = verified ? 200 : 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ fields, verified }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/oauth1-rsa-private-key?existing=1`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth1',
        signatureMethod: 'RSA-SHA256',
        consumerKey: 'consumer',
        consumerSecret: 'stale-consumer-secret',
        privateKey,
        token: 'token',
        tokenSecret: 'stale-token-secret',
        nonce: 'rsa-private-key-nonce',
        timestamp: '1777291200'
      }
    });
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.verified, true);
    assert.equal(body.fields.oauth_signature_method, 'RSA-SHA256');
    assert.equal(body.fields.oauth_consumer_key, 'consumer');
    assert.equal(body.fields.oauth_token, 'token');
    assert.equal(body.fields.oauth_nonce, 'rsa-private-key-nonce');
    assert.match(body.fields.oauth_signature, /\S+/);
  } finally {
    await server.close();
  }
});

test('executes OAuth 1.0 auth data placement in the request URL and URL-encoded body', async () => {
  const server = await createServer(async (request, response) => {
    const bodyText = await readRequestBody(request);
    const url = new URL(request.url, 'http://127.0.0.1');
    const bodyParams = new URLSearchParams(bodyText);
    const oauthParams = request.method === 'GET'
      ? oauthParamsFromSearchParams(url.searchParams)
      : oauthParamsFromSearchParams(bodyParams);
    const verified = verifyOAuth1Request({
      body: bodyText,
      consumerSecret: 'consumer-secret',
      contentType: request.headers['content-type'],
      includeEmptyParams: false,
      method: request.method,
      oauthParams,
      placement: request.method === 'GET' ? 'query' : 'body',
      tokenSecret: 'token-secret',
      url: `http://${request.headers.host}${request.url}`
    });
    response.statusCode = verified && !request.headers.authorization ? 200 : 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      bodyParams: Object.fromEntries(bodyParams.entries()),
      queryParams: Object.fromEntries(url.searchParams.entries()),
      authorization: request.headers.authorization || '',
      oauthParams,
      verified
    }));
  });

  try {
    const getResult = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/oauth1-query?existing=1`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth1',
        addAuthDataTo: 'queryOrBody',
        consumerKey: 'consumer',
        consumerSecret: 'consumer-secret',
        token: 'token',
        tokenSecret: 'token-secret',
        nonce: 'query-nonce',
        timestamp: '1777291200'
      }
    });
    const getBody = JSON.parse(getResult.body);
    assert.equal(getResult.statusCode, 200);
    assert.equal(getBody.verified, true);
    assert.equal(getBody.authorization, '');
    assert.equal(getBody.queryParams.oauth_consumer_key, 'consumer');
    assert.equal(getBody.queryParams.oauth_signature_method, 'HMAC-SHA1');
    assert.match(getBody.queryParams.oauth_signature, /\S+/);

    const postResult = await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/oauth1-body?existing=1`,
      queryParams: [],
      headers: [],
      bodyType: 'URLENCODED',
      body: 'payload=value',
      auth: {
        type: 'oauth1',
        addAuthDataTo: 'queryOrBody',
        consumerKey: 'consumer',
        consumerSecret: 'consumer-secret',
        token: 'token',
        tokenSecret: 'token-secret',
        nonce: 'body-nonce',
        timestamp: '1777291200'
      }
    });
    const postBody = JSON.parse(postResult.body);
    assert.equal(postResult.statusCode, 200);
    assert.equal(postBody.verified, true);
    assert.equal(postBody.authorization, '');
    assert.equal(postBody.bodyParams.payload, 'value');
    assert.equal(postBody.bodyParams.oauth_consumer_key, 'consumer');
    assert.match(postBody.bodyParams.oauth_signature, /\S+/);
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
        clientAuthentication: 'body',
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

test('skips OAuth 2.0 token refresh when auto-refresh is disabled', async () => {
  let tokenRequests = 0;
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequests += 1;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'fresh-access-token',
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
      id: 'r1-auto-refresh-off',
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
        autoRefreshToken: false,
        expiresAt: '2000-01-01T00:00:00.000Z'
      }
    }, null, { now: Date.parse('2026-04-21T00:00:00.000Z') });

    const body = JSON.parse(result.body);
    assert.equal(body.authorization, 'Bearer stale-access-token');
    assert.equal(result.updatedAuth, undefined);
    assert.equal(tokenRequests, 0);
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
        clientAuthentication: 'body',
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

test('executes OAuth 2.0 client credentials with Postman controls against a localhost server', async () => {
  let tokenRequestBody = '';
  let tokenRequestAuthorization = '';
  let tokenRequestTrace = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequestAuthorization = request.headers.authorization || '';
      tokenRequestTrace = request.headers['x-oauth-trace'] || '';
      tokenRequestBody = await readRequestBody(request);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'machine-token',
        token_type: 'Bearer',
        expires_in: 900
      }));
      return;
    }

    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || '',
      accessToken: url.searchParams.get('access_token') || ''
    }));
  });

  try {
    const result = await sendRequest({
      id: 'r2-postman',
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
        headerPrefix: 'Token',
        addAuthDataTo: 'query',
        clientAuthentication: 'basic',
        tokenRequestParams: [
          { key: 'audience', value: 'postmeter-api', sendIn: 'body' },
          { key: 'X-OAuth-Trace', value: 'trace-token', sendIn: 'header' }
        ]
      }
    }, null, { now: Date.parse('2026-04-21T00:00:00.000Z') });

    const body = JSON.parse(result.body);
    const params = new URLSearchParams(tokenRequestBody);
    assert.equal(tokenRequestAuthorization, `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
    assert.equal(tokenRequestTrace, 'trace-token');
    assert.equal(params.get('grant_type'), 'client_credentials');
    assert.equal(params.get('client_id'), null);
    assert.equal(params.get('client_secret'), null);
    assert.equal(params.get('audience'), 'postmeter-api');
    assert.equal(body.authorization, '');
    assert.equal(body.accessToken, 'machine-token');
    assert.equal(result.updatedAuth.accessToken, 'machine-token');
  } finally {
    await server.close();
  }
});

test('executes OAuth 2.0 password credentials with Postman controls against a localhost server', async () => {
  let tokenRequestBody = '';
  let tokenRequestAuthorization = '';
  let tokenRequestTrace = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequestAuthorization = request.headers.authorization || '';
      tokenRequestTrace = request.headers['x-oauth-trace'] || '';
      tokenRequestBody = await readRequestBody(request);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'password-grant-token',
        refresh_token: 'password-refresh-token',
        token_type: 'Bearer',
        expires_in: 1800
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
      id: 'r2-password-postman',
      method: 'GET',
      url: `${server.baseUrl}/resource`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth2',
        grantType: 'passwordCredentials',
        tokenUrl: `${server.baseUrl}/token`,
        username: 'resource-owner',
        password: 'owner-password',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        clientAuthentication: 'basic',
        scopes: 'read write',
        tokenRequestParams: [
          { key: 'audience', value: 'postmeter-api', sendIn: 'body' },
          { key: 'X-OAuth-Trace', value: 'password-trace', sendIn: 'header' }
        ]
      }
    }, null, { now: Date.parse('2026-04-21T00:00:00.000Z') });

    const body = JSON.parse(result.body);
    const params = new URLSearchParams(tokenRequestBody);
    assert.equal(tokenRequestAuthorization, `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
    assert.equal(tokenRequestTrace, 'password-trace');
    assert.equal(params.get('grant_type'), 'password');
    assert.equal(params.get('username'), 'resource-owner');
    assert.equal(params.get('password'), 'owner-password');
    assert.equal(params.get('client_id'), null);
    assert.equal(params.get('client_secret'), null);
    assert.equal(params.get('scope'), 'read write');
    assert.equal(params.get('audience'), 'postmeter-api');
    assert.equal(body.authorization, 'Bearer password-grant-token');
    assert.equal(result.updatedAuth.accessToken, 'password-grant-token');
    assert.equal(result.updatedAuth.refreshToken, 'password-refresh-token');
    assert.match(result.updatedAuth.expiresAt, /^2026-04-21T00:30:00\.000Z$/);
  } finally {
    await server.close();
  }
});

test('requests OAuth 2.0 password credentials tokens with client credentials in the body', async () => {
  let tokenRequestBody = '';
  const server = await createServer(async (request, response) => {
    tokenRequestBody = await readRequestBody(request);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      access_token: 'password-helper-token',
      token_type: 'Bearer'
    }));
  });

  try {
    const updatedAuth = await requestOAuthPasswordCredentialsToken({
      type: 'oauth2',
      grantType: 'passwordCredentials',
      tokenUrl: `${server.baseUrl}/token`,
      username: 'resource-owner',
      password: 'owner-password',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      clientAuthentication: 'body'
    }, null);

    const params = new URLSearchParams(tokenRequestBody);
    assert.equal(updatedAuth.accessToken, 'password-helper-token');
    assert.equal(params.get('grant_type'), 'password');
    assert.equal(params.get('username'), 'resource-owner');
    assert.equal(params.get('password'), 'owner-password');
    assert.equal(params.get('client_id'), 'client-id');
    assert.equal(params.get('client_secret'), 'client-secret');
  } finally {
    await server.close();
  }
});

test('refreshes OAuth 2.0 tokens through the configured refresh endpoint and advanced params', async () => {
  let tokenEndpointHit = false;
  let refreshRequestBody = '';
  let refreshRequestAuthorization = '';
  let refreshRequestTrace = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenEndpointHit = true;
      response.statusCode = 500;
      response.end('unexpected token endpoint');
      return;
    }
    if (request.url === '/refresh-token') {
      refreshRequestAuthorization = request.headers.authorization || '';
      refreshRequestTrace = request.headers['x-refresh-trace'] || '';
      refreshRequestBody = await readRequestBody(request);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'fresh-access-token',
        refresh_token: 'rotated-refresh-token',
        token_type: 'Bearer',
        expires_in: 120
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
      id: 'r2-refresh-postman',
      method: 'GET',
      url: `${server.baseUrl}/resource`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth2',
        accessToken: 'stale-token',
        refreshToken: 'refresh-token',
        tokenUrl: `${server.baseUrl}/token`,
        refreshTokenUrl: `${server.baseUrl}/refresh-token`,
        clientId: 'client-id',
        clientSecret: 'client-secret',
        clientAuthentication: 'basic',
        headerPrefix: 'Token',
        expiresAt: '2000-01-01T00:00:00.000Z',
        refreshRequestParams: [
          { key: 'resource', value: 'postmeter-api', sendIn: 'body' },
          { key: 'X-Refresh-Trace', value: 'refresh-trace', sendIn: 'header' }
        ]
      }
    }, null, { now: Date.parse('2026-04-21T00:00:00.000Z') });

    const body = JSON.parse(result.body);
    const params = new URLSearchParams(refreshRequestBody);
    assert.equal(tokenEndpointHit, false);
    assert.equal(refreshRequestAuthorization, `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
    assert.equal(refreshRequestTrace, 'refresh-trace');
    assert.equal(params.get('grant_type'), 'refresh_token');
    assert.equal(params.get('refresh_token'), 'refresh-token');
    assert.equal(params.get('client_id'), null);
    assert.equal(params.get('client_secret'), null);
    assert.equal(params.get('resource'), 'postmeter-api');
    assert.equal(body.authorization, 'Token fresh-access-token');
    assert.equal(result.updatedAuth.refreshToken, 'rotated-refresh-token');
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

test('decides when OAuth 2.0 password credentials tokens need retrieval', () => {
  const auth = {
    type: 'oauth2',
    grantType: 'passwordCredentials',
    tokenUrl: 'https://auth.example.test/token',
    username: 'resource-owner',
    password: 'owner-password'
  };

  assert.equal(shouldRequestPasswordCredentialsToken(auth, null), true);
  assert.equal(shouldRequestPasswordCredentialsToken({ ...auth, accessToken: 'token' }, null), false);
  assert.equal(
    shouldRequestPasswordCredentialsToken({ ...auth, accessToken: 'token', expiresAt: '2000-01-01T00:00:00.000Z' }, null),
    true
  );
  assert.equal(shouldRequestPasswordCredentialsToken({ ...auth, password: '' }, null), false);
});

test('creates OAuth 2.0 authorization-code and PKCE sessions', () => {
  const codeVerifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
  const authorizationCodeSession = createOAuthPkceSession({
    type: 'oauth2',
    grantType: 'authorizationCode',
    authorizationUrl: 'https://auth.example.test/authorize?existing=1',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id',
    scopes: 'openid profile',
    state: 'configured-state',
    authRequestParams: [
      { key: 'prompt', value: 'consent' }
    ]
  }, null, {
    redirectUri: 'http://127.0.0.1:49152/oauth/callback'
  });
  const authorizationCodeUrl = new URL(authorizationCodeSession.authorizationUrl);

  assert.equal(authorizationCodeUrl.origin, 'https://auth.example.test');
  assert.equal(authorizationCodeUrl.pathname, '/authorize');
  assert.equal(authorizationCodeUrl.searchParams.get('existing'), '1');
  assert.equal(authorizationCodeUrl.searchParams.get('response_type'), 'code');
  assert.equal(authorizationCodeUrl.searchParams.get('client_id'), 'client-id');
  assert.equal(authorizationCodeUrl.searchParams.get('redirect_uri'), 'http://127.0.0.1:49152/oauth/callback');
  assert.equal(authorizationCodeUrl.searchParams.get('code_challenge'), null);
  assert.equal(authorizationCodeUrl.searchParams.get('code_challenge_method'), null);
  assert.equal(authorizationCodeUrl.searchParams.get('state'), 'configured-state');
  assert.equal(authorizationCodeUrl.searchParams.get('scope'), 'openid profile');
  assert.equal(authorizationCodeUrl.searchParams.get('prompt'), 'consent');
  assert.equal(authorizationCodeSession.codeVerifier, '');
  assert.equal(authorizationCodeSession.codeChallenge, '');

  const pkceSession = createOAuthPkceSession({
    type: 'oauth2',
    grantType: 'authorizationCodePkce',
    authorizationUrl: 'https://auth.example.test/authorize?existing=1',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id',
    scopes: 'openid profile',
    state: 'configured-state',
    authRequestParams: [
      { key: 'prompt', value: 'consent' }
    ],
    tokenRequestParams: [
      { key: 'resource', value: 'postmeter-api', sendIn: 'body' }
    ],
    clientAuthentication: 'body'
  }, null, {
    redirectUri: 'http://127.0.0.1:49152/oauth/callback',
    codeVerifier
  });
  const pkceAuthorizationUrl = new URL(pkceSession.authorizationUrl);

  assert.equal(pkceAuthorizationUrl.searchParams.get('code_challenge'), pkceChallengeForVerifier(codeVerifier));
  assert.equal(pkceAuthorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(pkceAuthorizationUrl.searchParams.get('state'), 'configured-state');
  assert.equal(pkceAuthorizationUrl.searchParams.get('scope'), 'openid profile');
  assert.equal(pkceAuthorizationUrl.searchParams.get('prompt'), 'consent');
  assert.equal(pkceSession.clientAuthentication, 'body');
  assert.deepEqual(pkceSession.tokenRequestParams, [
    { enabled: true, key: 'resource', value: 'postmeter-api', sendIn: 'body' }
  ]);

  const plainSession = createOAuthPkceSession({
    type: 'oauth2',
    grantType: 'authorizationCodePkce',
    authorizationUrl: 'https://auth.example.test/authorize',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id',
    codeChallengeMethod: 'plain',
    codeVerifier
  }, null, {
    redirectUri: 'http://127.0.0.1:49152/oauth/callback'
  });
  const plainAuthorizationUrl = new URL(plainSession.authorizationUrl);
  assert.equal(plainAuthorizationUrl.searchParams.get('code_challenge'), codeVerifier);
  assert.equal(plainAuthorizationUrl.searchParams.get('code_challenge_method'), 'plain');
  assert.equal(plainSession.codeVerifier, codeVerifier);
  assert.equal(plainSession.codeChallengeMethod, 'plain');

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

  const loopbackSession = createOAuthPkceSession({
    type: 'oauth2',
    grantType: 'authorizationCode',
    authorizationUrl: 'http://localhost:49153/authorize',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id'
  }, null, {
    redirectUri: 'http://127.0.0.1:49152/oauth/callback',
    state: 'loopback-state'
  });
  assert.equal(new URL(loopbackSession.authorizationUrl).origin, 'http://localhost:49153');
  assert.equal(isLoopbackOAuthUrl(new URL('http://127.42.0.1:49153/token')), true);
  assert.equal(isLoopbackOAuthUrl(new URL('http://[::1]:49153/token')), true);

  assert.throws(
    () => createOAuthPkceSession({
      type: 'oauth2',
      grantType: 'authorizationCodePkce',
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
  assert.throws(
    () => createOAuthPkceSession({
      type: 'oauth2',
      grantType: 'authorizationCodePkce',
      authorizationUrl: 'http://auth.example.test/authorize',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'client-id'
    }, null, {
      redirectUri: 'http://127.0.0.1:49152/oauth/callback',
      state: 'bad-http-state',
      codeVerifier
    }),
    /OAuth 2\.0 authorization URL must use https unless it targets a loopback address/
  );
});

test('rejects OAuth 2.0 token endpoints over HTTP outside loopback', async () => {
  await assert.rejects(
    () => requestOAuthClientCredentialsToken({
      type: 'oauth2',
      grantType: 'clientCredentials',
      tokenUrl: 'http://auth.example.test/token',
      clientId: 'client-id',
      clientSecret: 'client-secret'
    }, null),
    /OAuth 2\.0 token URL must use https unless it targets a loopback address/
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
      clientAuthentication: 'body',
      state: 'test-state',
      codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
    };
    const auth = await exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCodePkce',
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

test('accepts form-encoded OAuth 2.0 token responses', async () => {
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      response.setHeader('Content-Type', 'application/x-www-form-urlencoded');
      response.end(new URLSearchParams({
        access_token: 'form-access-token',
        refresh_token: 'form-refresh-token',
        token_type: 'bearer',
        expires_in: '900'
      }).toString());
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    const auth = await exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCodePkce',
      tokenType: 'Bearer'
    }, {
      tokenUrl: `${server.baseUrl}/token`,
      redirectUri: 'http://127.0.0.1:49152/oauth/callback',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      clientAuthentication: 'body',
      state: 'test-state',
      codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
    }, 'http://127.0.0.1:49152/oauth/callback?code=auth-code&state=test-state', null, {
      now: Date.parse('2026-04-21T00:00:00.000Z')
    });

    assert.equal(auth.accessToken, 'form-access-token');
    assert.equal(auth.refreshToken, 'form-refresh-token');
    assert.equal(auth.headerPrefix, 'Bearer');
    assert.match(auth.expiresAt, /^2026-04-21T00:15:00\.000Z$/);
  } finally {
    await server.close();
  }
});

test('exchanges OAuth 2.0 authorization-code callbacks without PKCE fields', async () => {
  let tokenRequestBody = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequestBody = await readRequestBody(request);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'authorization-code-token',
        token_type: 'Bearer'
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    const auth = await exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCode'
    }, {
      tokenUrl: `${server.baseUrl}/token`,
      redirectUri: 'http://127.0.0.1:49152/oauth/callback',
      clientId: 'client-id',
      state: 'test-state'
    }, 'http://127.0.0.1:49152/oauth/callback?code=auth-code&state=test-state', null);
    const params = new URLSearchParams(tokenRequestBody);

    assert.equal(auth.accessToken, 'authorization-code-token');
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('code'), 'auth-code');
    assert.equal(params.get('client_id'), 'client-id');
    assert.equal(params.get('code_verifier'), null);
  } finally {
    await server.close();
  }
});

test('exchanges OAuth 2.0 authorization-code PKCE with Basic client auth and token request params', async () => {
  let tokenRequestBody = '';
  let tokenRequestAuthorization = '';
  let tokenRequestTrace = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequestAuthorization = request.headers.authorization || '';
      tokenRequestTrace = request.headers['x-code-trace'] || '';
      tokenRequestBody = await readRequestBody(request);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'pkce-basic-access-token',
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
      clientAuthentication: 'basic',
      tokenRequestParams: [
        { key: 'resource', value: 'postmeter-api', sendIn: 'body' },
        { key: 'X-Code-Trace', value: 'code-trace', sendIn: 'header' }
      ],
      state: 'test-state',
      codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
    };
    const auth = await exchangeOAuthAuthorizationCode({
      type: 'oauth2',
      grantType: 'authorizationCodePkce',
      tokenType: 'Bearer',
      headerPrefix: 'Token'
    }, session, 'http://127.0.0.1:49152/oauth/callback?code=auth-code&state=test-state', null, {
      now: Date.parse('2026-04-21T00:00:00.000Z')
    });
    const params = new URLSearchParams(tokenRequestBody);

    assert.equal(tokenRequestAuthorization, `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
    assert.equal(tokenRequestTrace, 'code-trace');
    assert.equal(auth.accessToken, 'pkce-basic-access-token');
    assert.equal(auth.headerPrefix, 'Token');
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('client_id'), null);
    assert.equal(params.get('client_secret'), null);
    assert.equal(params.get('resource'), 'postmeter-api');
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
      grantType: 'authorizationCodePkce',
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
    if (request.url === '/html-error') {
      response.statusCode = 422;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><title>Provider Error</title>');
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
    if (request.url === '/ok-error') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        error: 'bad_verification_code',
        error_description: 'expired authorization_code=auth-code-secret client_secret=client-secret'
      }));
      return;
    }
    if (request.url === '/revoked-form') {
      response.statusCode = 400;
      response.setHeader('Content-Type', 'application/x-www-form-urlencoded');
      response.end(new URLSearchParams({
        error: 'invalid_grant',
        error_description: 'revoked refresh_token=refresh-secret client_secret=client-secret'
      }).toString());
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
      () => requestOAuthClientCredentialsToken({
        type: 'oauth2',
        grantType: 'clientCredentials',
        tokenUrl: `${server.baseUrl}/html-error`,
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }, null),
      (error) => {
        assert.match(error.message, /failed with HTTP 422/);
        assert.match(error.message, /text\/html/);
        assert.match(error.message, /Check the token URL and provider settings/);
        assert.doesNotMatch(error.message, /invalid JSON|Provider Error/);
        return true;
      }
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
    await assert.rejects(
      () => refreshOAuthToken({
        type: 'oauth2',
        tokenUrl: `${server.baseUrl}/revoked-form`,
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
    await assert.rejects(
      () => requestOAuthClientCredentialsToken({
        type: 'oauth2',
        grantType: 'clientCredentials',
        tokenUrl: `${server.baseUrl}/ok-error`,
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }, null),
      (error) => {
        assert.equal(error.oauthError, 'bad_verification_code');
        assert.match(error.message, /authorization_code=\[redacted\]/);
        assert.match(error.message, /client_secret=\[redacted\]/);
        assert.doesNotMatch(error.message, /auth-code-secret|client-secret/);
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

function verifyAwsRequest(options) {
  const url = new URL(options.url);
  const fields = options.placement === 'query'
    ? awsQuerySignatureFields(url)
    : awsHeaderSignatureFields(options.headers.authorization || '');
  if (options.placement === 'header') {
    fields.amzDate = awsTestHeaderValue(options.headers, 'x-amz-date');
    fields.sessionToken = awsTestHeaderValue(options.headers, 'x-amz-security-token');
  }
  if (fields.algorithm !== 'AWS4-HMAC-SHA256') {
    return { fields, reason: 'algorithm mismatch', verified: false };
  }
  if (fields.accessKey !== options.accessKey || fields.region !== options.region || fields.service !== options.service) {
    return { fields, reason: 'credential mismatch', verified: false };
  }
  if (fields.terminal !== 'aws4_request') {
    return { fields, reason: 'credential scope mismatch', verified: false };
  }
  if (options.sessionToken && fields.sessionToken !== options.sessionToken) {
    return { fields, reason: 'session token mismatch', verified: false };
  }
  if (options.placement === 'query' && options.headers.authorization) {
    return { fields, reason: 'query signing should not send Authorization header', verified: false };
  }
  const canonicalRequest = [
    String(options.method || 'GET').toUpperCase(),
    awsTestCanonicalUri(url),
    awsTestCanonicalQuery(url, { excludeSignature: options.placement === 'query' }),
    awsTestCanonicalHeaders(options.headers, fields.signedHeaders),
    fields.signedHeaders,
    awsTestSha256Hex(options.body || '')
  ].join('\n');
  const stringToSign = [
    fields.algorithm,
    fields.amzDate,
    fields.credentialScope,
    awsTestSha256Hex(canonicalRequest)
  ].join('\n');
  const expectedSignature = crypto
    .createHmac('sha256', awsTestSigningKey(options.secretKey, fields.shortDate, options.region, options.service))
    .update(stringToSign, 'utf8')
    .digest('hex');
  return {
    fields,
    reason: fields.signature === expectedSignature ? '' : 'signature mismatch',
    verified: fields.signature === expectedSignature
  };
}

function awsHeaderSignatureFields(header) {
  const value = String(header || '');
  const fields = { authorization: value };
  const algorithmMatch = value.match(/^([A-Za-z0-9-]+)\s+/);
  fields.algorithm = algorithmMatch?.[1] || '';
  const params = {};
  for (const part of value.replace(/^[A-Za-z0-9-]+\s+/, '').split(',')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) {
      params[key] = rest.join('=');
    }
  }
  fields.signature = params.Signature || '';
  fields.signedHeaders = params.SignedHeaders || '';
  applyAwsCredentialFields(fields, params.Credential || '');
  return fields;
}

function awsQuerySignatureFields(url) {
  const credential = url.searchParams.get('X-Amz-Credential') || '';
  const fields = {
    algorithm: url.searchParams.get('X-Amz-Algorithm') || '',
    amzDate: url.searchParams.get('X-Amz-Date') || '',
    authorization: '',
    expires: url.searchParams.get('X-Amz-Expires') || '',
    sessionToken: url.searchParams.get('X-Amz-Security-Token') || '',
    signature: url.searchParams.get('X-Amz-Signature') || '',
    signedHeaders: url.searchParams.get('X-Amz-SignedHeaders') || ''
  };
  applyAwsCredentialFields(fields, credential);
  return fields;
}

function applyAwsCredentialFields(fields, credential) {
  const parts = String(credential || '').split('/');
  fields.accessKey = parts[0] || '';
  fields.shortDate = parts[1] || '';
  fields.region = parts[2] || '';
  fields.service = parts[3] || '';
  fields.terminal = parts[4] || '';
  fields.credentialScope = parts.slice(1).join('/');
  fields.amzDate ||= '';
}

function awsTestCanonicalUri(url) {
  const path = url.pathname || '/';
  return path
    .split('/')
    .map((part) => awsTestEncodeRfc3986(awsTestDecodeURIComponentSafe(part)))
    .join('/') || '/';
}

function awsTestCanonicalQuery(url, options = {}) {
  return [...url.searchParams.entries()]
    .filter(([key]) => !(options.excludeSignature && key === 'X-Amz-Signature'))
    .map(([key, value]) => [awsTestEncodeRfc3986(key), awsTestEncodeRfc3986(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function awsTestCanonicalHeaders(headers, signedHeaders) {
  return String(signedHeaders || '')
    .split(';')
    .filter(Boolean)
    .map((name) => `${name}:${String(awsTestHeaderValue(headers, name) || '').trim().replace(/\s+/g, ' ')}`)
    .join('\n') + '\n';
}

function awsTestHeaderValue(headers, name) {
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === String(name).toLowerCase());
  return key ? headers[key] : '';
}

function awsTestSigningKey(secretKey, shortDate, region, service) {
  const dateKey = crypto.createHmac('sha256', `AWS4${secretKey}`).update(shortDate, 'utf8').digest();
  const dateRegionKey = crypto.createHmac('sha256', dateKey).update(region, 'utf8').digest();
  const dateRegionServiceKey = crypto.createHmac('sha256', dateRegionKey).update(service, 'utf8').digest();
  return crypto.createHmac('sha256', dateRegionServiceKey).update('aws4_request', 'utf8').digest();
}

function awsTestSha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function awsTestEncodeRfc3986(value) {
  return encodeURIComponent(String(value == null ? '' : value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function awsTestDecodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function parseHawkAuthorization(header) {
  const value = String(header || '').replace(/^Hawk\s+/i, '');
  const fields = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))(?:,|$)/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    fields[match[1]] = match[2] != null
      ? match[2].replace(/\\(["\\])/g, '$1')
      : String(match[3] || '').trim();
  }
  return fields;
}

function verifyHawkRequest(expected, header) {
  const fields = parseHawkAuthorization(header);
  const required = [
    ['id', expected.expectedId],
    ['ts', expected.expectedTs],
    ['nonce', expected.expectedNonce]
  ];
  for (const [key, value] of required) {
    if (fields[key] !== value) {
      return { fields, reason: `${key} mismatch`, verified: false };
    }
  }
  if ((fields.ext || '') !== expected.expectedExt) {
    return { fields, reason: 'ext mismatch', verified: false };
  }
  if ((fields.app || '') !== expected.expectedApp) {
    return { fields, reason: 'app mismatch', verified: false };
  }
  if ((fields.dlg || '') !== expected.expectedDelegation) {
    return { fields, reason: 'dlg mismatch', verified: false };
  }
  const payloadHash = expected.includePayloadHash
    ? hawkPayloadHash(expected.algorithm, expected.body, expected.contentType)
    : '';
  if (expected.includePayloadHash && fields.hash !== payloadHash) {
    return { fields, reason: 'payload hash mismatch', verified: false };
  }
  if (!expected.includePayloadHash && Object.prototype.hasOwnProperty.call(fields, 'hash')) {
    return { fields, reason: 'unexpected payload hash', verified: false };
  }
  const parsedUrl = new URL(expected.url);
  const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
  const normalized = [
    'hawk.1.header',
    fields.ts,
    fields.nonce,
    String(expected.method || 'GET').toUpperCase(),
    `${parsedUrl.pathname}${parsedUrl.search}`,
    parsedUrl.hostname.toLowerCase(),
    port,
    payloadHash,
    fields.ext || '',
    fields.app || '',
    fields.dlg || '',
    ''
  ].join('\n');
  const mac = crypto.createHmac(expected.algorithm, expected.authKey).update(normalized, 'utf8').digest('base64');
  return { fields, reason: fields.mac === mac ? '' : 'mac mismatch', verified: fields.mac === mac };
}

function hawkPayloadHash(algorithm, body, contentType = '') {
  const hash = crypto.createHash(algorithm);
  hash.update('hawk.1.payload\n', 'utf8');
  hash.update(normalizeHawkContentType(contentType), 'utf8');
  hash.update('\n', 'utf8');
  hash.update(String(body || ''), 'utf8');
  hash.update('\n', 'utf8');
  return hash.digest('base64');
}

function normalizeHawkContentType(contentType = '') {
  return String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function parseOAuthAuthorization(header) {
  const value = String(header || '').replace(/^OAuth\s+/i, '');
  const fields = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))(?:,|$)/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    const rawValue = match[2] != null ? match[2].replace(/\\"/g, '"') : String(match[3] || '').trim();
    fields[match[1]] = oauthDecode(rawValue);
  }
  return fields;
}

function oauthParamsFromSearchParams(searchParams) {
  return Object.fromEntries([...searchParams.entries()].filter(([key]) => key.startsWith('oauth_')));
}

function verifyOAuth1Request(options) {
  const url = new URL(options.url, 'http://127.0.0.1');
  const signatureMethod = options.oauthParams.oauth_signature_method || 'HMAC-SHA1';
  const params = [];
  appendOAuth1TestParams(params, url.searchParams, options.includeEmptyParams, { excludeSignature: true });
  if (String(options.contentType || '').toLowerCase().split(';')[0].trim() === 'application/x-www-form-urlencoded') {
    appendOAuth1TestParams(params, new URLSearchParams(options.body || ''), options.includeEmptyParams, { excludeSignature: true });
  }
  if (options.placement === 'header') {
    for (const [key, value] of Object.entries(options.oauthParams)) {
      if (key !== 'realm' && key !== 'oauth_signature' && (options.includeEmptyParams || String(value) !== '')) {
        params.push([key, value]);
      }
    }
  }
  const expected = oauth1TestSignature({
    consumerSecret: options.consumerSecret,
    method: options.method,
    params,
    oauthSignature: options.oauthParams.oauth_signature,
    publicKey: options.publicKey,
    signatureMethod,
    tokenSecret: options.tokenSecret,
    url
  });
  if (typeof expected === 'boolean') {
    return expected;
  }
  return options.oauthParams.oauth_signature === expected;
}

function appendOAuth1TestParams(target, source, includeEmpty, options = {}) {
  for (const [key, value] of source.entries()) {
    if (options.excludeSignature && key === 'oauth_signature') {
      continue;
    }
    if (includeEmpty || String(value) !== '') {
      target.push([key, value]);
    }
  }
}

function oauth1TestSignature(options) {
  const signingKey = `${oauthPercentEncodeTest(options.consumerSecret)}&${oauthPercentEncodeTest(options.tokenSecret)}`;
  if (options.signatureMethod === 'PLAINTEXT') {
    return signingKey;
  }
  const baseString = oauth1TestBaseString(options);
  if (options.signatureMethod?.startsWith('RSA-')) {
    return crypto
      .createVerify(oauth1TestRsaSignatureAlgorithm(options.signatureMethod))
      .update(baseString, 'utf8')
      .verify(options.publicKey, options.oauthSignature || options.params.find(([key]) => key === 'oauth_signature')?.[1] || '', 'base64');
  }
  return crypto
    .createHmac(oauth1TestHmacHashAlgorithm(options.signatureMethod), signingKey)
    .update(baseString, 'utf8')
    .digest('base64');
}

function oauth1TestBaseString(options) {
  const baseUrl = `${options.url.protocol}//${options.url.host}${options.url.pathname}`;
  const normalizedParams = options.params
    .map(([key, value]) => [oauthPercentEncodeTest(key), oauthPercentEncodeTest(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const baseString = [
    String(options.method || 'GET').toUpperCase(),
    oauthPercentEncodeTest(baseUrl),
    oauthPercentEncodeTest(normalizedParams)
  ].join('&');
  return baseString;
}

function oauth1TestHmacHashAlgorithm(signatureMethod) {
  if (signatureMethod === 'HMAC-SHA512') {
    return 'sha512';
  }
  if (signatureMethod === 'HMAC-SHA256') {
    return 'sha256';
  }
  return 'sha1';
}

function oauth1TestRsaSignatureAlgorithm(signatureMethod) {
  if (signatureMethod === 'RSA-SHA512') {
    return 'RSA-SHA512';
  }
  if (signatureMethod === 'RSA-SHA256') {
    return 'RSA-SHA256';
  }
  return 'RSA-SHA1';
}

function oauthDecode(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function oauthPercentEncodeTest(value) {
  return encodeURIComponent(String(value == null ? '' : value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function parseNtlmType1Authorization(header) {
  const message = decodeNtlmAuthorization(header);
  return {
    type: message.readUInt32LE(8),
    domain: readSecurityBufferTest(message, 16).toString('ascii'),
    workstation: readSecurityBufferTest(message, 24).toString('ascii')
  };
}

function parseNtlmType3Authorization(header) {
  const message = decodeNtlmAuthorization(header);
  return {
    type: message.readUInt32LE(8),
    lmResponse: readSecurityBufferTest(message, 12).toString('hex'),
    ntResponse: readSecurityBufferTest(message, 20).toString('hex'),
    domain: readSecurityBufferTest(message, 28).toString('utf16le'),
    user: readSecurityBufferTest(message, 36).toString('utf16le'),
    workstation: readSecurityBufferTest(message, 44).toString('utf16le')
  };
}

function decodeNtlmAuthorization(header) {
  assert.match(header || '', /^NTLM\s+/);
  const message = Buffer.from(String(header).replace(/^NTLM\s+/i, ''), 'base64');
  assert.equal(message.slice(0, 8).toString('ascii'), 'NTLMSSP\0');
  return message;
}

function verifyNtlmType3(type3, expected) {
  assert.equal(type3.type, 3);
  assert.equal(type3.user, expected.username);
  assert.equal(type3.domain, expected.domain);
  assert.equal(type3.workstation, expected.workstation);
  const ntResponse = Buffer.from(type3.ntResponse, 'hex');
  const lmResponse = Buffer.from(type3.lmResponse, 'hex');
  assert.ok(ntResponse.length > 16);
  assert.equal(lmResponse.length, 24);
  const blob = ntResponse.slice(16);
  const clientNonce = blob.slice(16, 24);
  const ntlmHash = md4Test(Buffer.from(expected.password, 'utf16le'));
  const ntlmV2Hash = crypto.createHmac('md5', ntlmHash)
    .update(Buffer.from(`${expected.username.toUpperCase()}${expected.targetName}`, 'utf16le'))
    .digest();
  const expectedProof = crypto.createHmac('md5', ntlmV2Hash)
    .update(Buffer.concat([expected.serverChallenge, blob]))
    .digest();
  const expectedLm = Buffer.concat([
    crypto.createHmac('md5', ntlmV2Hash).update(Buffer.concat([expected.serverChallenge, clientNonce])).digest(),
    clientNonce
  ]);
  return crypto.timingSafeEqual(expectedProof, ntResponse.slice(0, 16))
    && crypto.timingSafeEqual(expectedLm, lmResponse);
}

function verifyAkamaiEdgeGridRequest(options) {
  const fields = parseEdgeGridAuthorization(options.headers.authorization || '');
  const url = new URL(options.url);
  const signingUrl = new URL(options.baseUrl);
  const authPrefix = `EG1-HMAC-SHA256 client_token=${fields.client_token};access_token=${fields.access_token};timestamp=${fields.timestamp};nonce=${fields.nonce};`;
  const bodyForHash = Buffer.from(String(options.body || ''), 'utf8').slice(0, Number(options.maxBodySize));
  const dataToSign = [
    String(options.method || 'GET').toUpperCase(),
    signingUrl.protocol.replace(/:$/, ''),
    signingUrl.hostname.toLowerCase(),
    `${url.pathname}${url.search}`,
    akamaiCanonicalHeadersTest(options.headers, options.headersToSign),
    crypto.createHash('sha256').update(bodyForHash).digest('base64'),
    authPrefix
  ].join('\t');
  const signingKey = crypto.createHmac('sha256', options.clientSecret).update(options.timestamp, 'utf8').digest('base64');
  const signature = crypto.createHmac('sha256', signingKey).update(dataToSign, 'utf8').digest('base64');
  return {
    fields,
    verified: fields.client_token === options.clientToken
      && fields.access_token === options.accessToken
      && fields.timestamp === options.timestamp
      && fields.nonce === options.nonce
      && fields.signature === signature
  };
}

function parseEdgeGridAuthorization(header) {
  const fields = {};
  const text = String(header || '').replace(/^EG1-HMAC-SHA256\s+/i, '');
  for (const part of text.split(';')) {
    const [key, ...valueParts] = part.split('=');
    if (key) {
      fields[key.trim()] = valueParts.join('=');
    }
  }
  return fields;
}

function akamaiCanonicalHeadersTest(headers, headersToSign) {
  return String(headersToSign || '')
    .split(/[,\s]+/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .map((name) => {
      const value = headers[name];
      return value == null || value === '' ? '' : `${name}:${String(value).trim().replace(/\s+/g, ' ')}`;
    })
    .filter(Boolean)
    .join('\t');
}

function jwtTestKeyMaterial(algorithm) {
  if (algorithm.startsWith('HS')) {
    return { secret: `jwt-${algorithm.toLowerCase()}-secret` };
  }
  if (algorithm.startsWith('ES')) {
    const curve = algorithm.endsWith('384') ? 'secp384r1' : algorithm.endsWith('512') ? 'secp521r1' : 'prime256v1';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: curve });
    return {
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      publicKey
    };
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey
  };
}

function verifyJwtToken(token, options) {
  const parts = String(token || '').split('.');
  assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], 'base64url');
  assert.equal(header.alg, options.algorithm);
  const hash = jwtHashForAlgorithmTest(options.algorithm);
  if (options.algorithm.startsWith('HS')) {
    const expected = crypto.createHmac(hash, options.secret).update(signingInput, 'utf8').digest();
    assert.equal(crypto.timingSafeEqual(signature, expected), true);
  } else if (options.algorithm.startsWith('PS')) {
    assert.equal(crypto.verify(hash, Buffer.from(signingInput, 'utf8'), {
      key: options.publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }, signature), true);
  } else if (options.algorithm.startsWith('ES')) {
    assert.equal(crypto.verify(hash, Buffer.from(signingInput, 'utf8'), options.publicKey, ecdsaJoseToDerTest(signature)), true);
  } else {
    assert.equal(crypto.verify(hash, Buffer.from(signingInput, 'utf8'), options.publicKey, signature), true);
  }
  return { header, payload };
}

function jwtHashForAlgorithmTest(algorithm) {
  if (algorithm.endsWith('384')) {
    return 'sha384';
  }
  if (algorithm.endsWith('512')) {
    return 'sha512';
  }
  return 'sha256';
}

function ecdsaJoseToDerTest(signature) {
  const raw = Buffer.from(signature);
  const partLength = raw.length / 2;
  const r = derIntegerPart(raw.slice(0, partLength));
  const s = derIntegerPart(raw.slice(partLength));
  const sequence = Buffer.concat([Buffer.from([0x02]), derLengthTest(r.length), r, Buffer.from([0x02]), derLengthTest(s.length), s]);
  return Buffer.concat([Buffer.from([0x30]), derLengthTest(sequence.length), sequence]);
}

function derIntegerPart(value) {
  let part = Buffer.from(value);
  while (part.length > 1 && part[0] === 0) {
    part = part.slice(1);
  }
  if ((part[0] & 0x80) !== 0) {
    part = Buffer.concat([Buffer.from([0]), part]);
  }
  return part;
}

function derLengthTest(length) {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  const bytes = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
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

function readSecurityBufferTest(message, offset) {
  const length = message.readUInt16LE(offset);
  const payloadOffset = message.readUInt32LE(offset + 4);
  return message.slice(payloadOffset, payloadOffset + length);
}

function md4Test(input) {
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
    [a, b, c, d] = md4Round1Test(a, b, c, d, x);
    [a, b, c, d] = md4Round2Test(a, b, c, d, x);
    [a, b, c, d] = md4Round3Test(a, b, c, d, x);
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

function md4Round1Test(a, b, c, d, x) {
  const s = [3, 7, 11, 19];
  for (let i = 0; i < 16; i += 4) {
    a = rotlTest((a + md4FTest(b, c, d) + x[i]) >>> 0, s[0]);
    d = rotlTest((d + md4FTest(a, b, c) + x[i + 1]) >>> 0, s[1]);
    c = rotlTest((c + md4FTest(d, a, b) + x[i + 2]) >>> 0, s[2]);
    b = rotlTest((b + md4FTest(c, d, a) + x[i + 3]) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4Round2Test(a, b, c, d, x) {
  const s = [3, 5, 9, 13];
  for (const i of [0, 1, 2, 3]) {
    a = rotlTest((a + md4GTest(b, c, d) + x[i] + 0x5a827999) >>> 0, s[0]);
    d = rotlTest((d + md4GTest(a, b, c) + x[i + 4] + 0x5a827999) >>> 0, s[1]);
    c = rotlTest((c + md4GTest(d, a, b) + x[i + 8] + 0x5a827999) >>> 0, s[2]);
    b = rotlTest((b + md4GTest(c, d, a) + x[i + 12] + 0x5a827999) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4Round3Test(a, b, c, d, x) {
  const s = [3, 9, 11, 15];
  for (const i of [0, 2, 1, 3]) {
    a = rotlTest((a + md4HTest(b, c, d) + x[i] + 0x6ed9eba1) >>> 0, s[0]);
    d = rotlTest((d + md4HTest(a, b, c) + x[i + 8] + 0x6ed9eba1) >>> 0, s[1]);
    c = rotlTest((c + md4HTest(d, a, b) + x[i + 4] + 0x6ed9eba1) >>> 0, s[2]);
    b = rotlTest((b + md4HTest(c, d, a) + x[i + 12] + 0x6ed9eba1) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4FTest(x, y, z) { return ((x & y) | (~x & z)) >>> 0; }
function md4GTest(x, y, z) { return ((x & y) | (x & z) | (y & z)) >>> 0; }
function md4HTest(x, y, z) { return (x ^ y ^ z) >>> 0; }
function rotlTest(value, bits) { return ((value << bits) | (value >>> (32 - bits))) >>> 0; }
