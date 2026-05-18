const assert = require('node:assert/strict');
const test = require('node:test');
const {
  exportRequestByFormat,
  exportRequestToJson,
  importRequestFromText
} = require('../../src/core/requestFormats');

test('exports and imports a single PostMeter request envelope', () => {
  const original = {
    id: 'request-1',
    name: 'Create Widget',
    method: 'POST',
    url: 'https://api.example.test/widgets',
    queryParams: [{ enabled: true, key: 'trace', value: 'yes' }],
    headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
    bodyType: 'RAW_JSON',
    body: '{"name":"hammer"}',
    auth: { type: 'none' },
    scripts: { preRequest: '', tests: '' },
    settings: {
      sslCertificateVerification: 'enabled',
      caCertificatePath: '/tmp/request-ca.pem',
      httpVersion: 'http2',
      followRedirects: false,
      followOriginalHttpMethod: true,
      followAuthorizationHeader: true,
      removeRefererHeaderOnRedirect: true,
      strictHttpParser: true,
      encodeUrlAutomatically: false,
      maxRedirects: 7,
      useServerCipherSuiteDuringHandshake: true,
      disabledTlsProtocols: ['TLSv1', 'TLSv1.1'],
      cipherSuiteSelection: 'AES128-SHA'
    }
  };
  const expectedSettings = {
    sslCertificateVerification: 'enabled',
    httpVersion: 'http2',
    followRedirects: false,
    followOriginalHttpMethod: true,
    followAuthorizationHeader: true,
    removeRefererHeaderOnRedirect: true,
    strictHttpParser: true,
    encodeUrlAutomatically: false,
    maxRedirects: 7,
    useServerCipherSuiteDuringHandshake: true,
    disabledTlsProtocols: ['TLSv1', 'TLSv1.1'],
    cipherSuiteSelection: 'AES128-SHA'
  };

  const exported = exportRequestToJson(original);
  const parsed = JSON.parse(exported);
  assert.equal(parsed.format, 'postmeter.request');
  assert.equal(parsed.request.name, 'Create Widget');
  assert.equal(parsed.request.settings.caCertificatePath, undefined);
  assert.deepEqual(parsed.request.settings, expectedSettings);

  const imported = importRequestFromText(exported);
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.name, 'Create Widget');
  assert.equal(imported.method, 'POST');
  assert.equal(imported.queryParams[0].key, 'trace');
  assert.equal(imported.body, '{"name":"hammer"}');
  assert.deepEqual(imported.settings, expectedSettings);
});

test('native request import and export preserve expanded auth fields', () => {
  const authCases = [
    {
      type: 'digest',
      username: 'ada',
      password: 'secret',
      disableRetryingRequest: true,
      realm: 'postmeter',
      nonce: 'nonce',
      algorithm: 'SHA-512-256-sess',
      qop: 'auth',
      opaque: 'opaque',
      clientNonce: 'client',
      nonceCount: '00000002'
    },
    {
      type: 'oauth1',
      consumerKey: 'consumer',
      consumerSecret: 'consumer-secret',
      token: 'token',
      tokenSecret: 'token-secret',
      signatureMethod: 'RSA-SHA512',
      privateKey: 'private-key',
      addAuthDataTo: 'queryOrBody',
      callback: 'https://client.example.test/callback',
      verifier: 'verifier',
      timestamp: '1777291200',
      nonce: 'nonce',
      version: '1.0',
      realm: 'realm',
      includeBodyHash: true,
      addEmptyParamsToSign: true
    },
    {
      type: 'oauth2',
      tokenType: 'Bearer',
      headerPrefix: 'Bearer',
      tokenName: 'Postman token',
      addAuthDataTo: 'header',
      accessToken: '{{accessToken}}',
      autoRefreshToken: true,
      shareToken: false,
      authorizationUrl: 'https://auth.example.test/authorize',
      tokenUrl: 'https://auth.example.test/token',
      refreshTokenUrl: 'https://auth.example.test/refresh',
      redirectUri: 'postmeter://oauth/callback',
      clientId: 'client-id',
      clientSecret: '{{clientSecret}}',
      username: 'resource-owner',
      password: '{{password}}',
      scopes: 'openid profile',
      state: 'state',
      codeChallengeMethod: 'S256',
      codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      authorizeUsingBrowser: true,
      clientAuthentication: 'body',
      authRequestParams: [{ enabled: true, key: 'prompt', value: 'consent' }],
      tokenRequestParams: [{ enabled: true, key: 'resource', value: 'api', sendIn: 'body' }],
      refreshRequestParams: [{ enabled: true, key: 'resource', value: 'api', sendIn: 'body' }],
      grantType: 'authorizationCodePkce'
    },
    {
      type: 'hawk',
      authId: 'hawk-id',
      authKey: 'hawk-key',
      algorithm: 'sha1',
      user: 'user',
      nonce: 'nonce',
      extraData: 'ext',
      app: 'app',
      delegation: 'dlg',
      timestamp: '1777291200',
      includePayloadHash: true
    },
    {
      type: 'aws',
      accessKey: 'access',
      secretKey: 'secret',
      region: 'us-east-1',
      service: 'execute-api',
      sessionToken: 'session',
      addAuthDataToQuery: true
    },
    {
      type: 'ntlm',
      username: 'user',
      password: 'pass',
      disableRetryingRequest: true,
      domain: 'EXAMPLE',
      workstation: 'WORKSTATION'
    },
    {
      type: 'akamaiEdgeGrid',
      accessToken: 'access',
      clientToken: 'client',
      clientSecret: 'secret',
      nonce: 'nonce',
      timestamp: '20260427T120000+0000',
      baseUrl: 'https://api.example.test',
      headersToSign: 'host;x-test',
      maxBodySize: '2048'
    },
    {
      type: 'jwtBearer',
      algorithm: 'PS256',
      secret: '',
      secretBase64Encoded: false,
      privateKey: 'private-key',
      keyId: 'jwt-kid',
      issuer: 'issuer',
      subject: 'subject',
      audience: 'audience',
      expiresIn: '120',
      claims: '{"scope":"read"}',
      jwtHeaders: '{"typ":"JWT"}',
      headerPrefix: 'JWT',
      addTokenTo: 'query'
    },
    {
      type: 'asap',
      algorithm: 'ES256',
      privateKey: 'private-key',
      issuer: 'issuer',
      subject: 'subject',
      audience: 'audience',
      keyId: 'asap-kid',
      expiresIn: '3600',
      additionalClaims: '{"tenant":"postmeter"}'
    }
  ];

  for (const auth of authCases) {
    const exported = exportRequestToJson({
      name: `${auth.type} auth`,
      method: 'GET',
      url: `https://api.example.test/${auth.type}`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth,
      scripts: { preRequest: '', tests: '' }
    });
    const imported = importRequestFromText(exported);
    assert.deepEqual(imported.auth, auth);
  }
});

test('imports raw PostMeter request JSON and curl command text as single requests', () => {
  const rawImported = importRequestFromText(JSON.stringify({
    name: 'Raw Request',
    method: 'PATCH',
    url: 'https://api.example.test/widgets/1',
    bodyType: 'RAW_TEXT',
    body: 'ok'
  }));
  assert.equal(rawImported.name, 'Raw Request');
  assert.equal(rawImported.method, 'PATCH');

  const curlImported = importRequestFromText("# Request: Health\ncurl -H 'X-Test: yes' 'https://api.example.test/health?ready=1'");
  assert.equal(curlImported.method, 'GET');
  assert.equal(curlImported.url, 'https://api.example.test/health');
  assert.equal(curlImported.queryParams[0].key, 'ready');
  assert.equal(curlImported.headers[0].key, 'X-Test');

  const mtlsBasicImported = importRequestFromText("curl -u alice:secret --cert /tmp/client.pem --key /tmp/client.key https://api.example.test/secure");
  assert.equal(mtlsBasicImported.auth.type, 'clientCertificate');
  assert.equal(mtlsBasicImported.auth.certPath, '/tmp/client.pem');
  assert.equal(mtlsBasicImported.auth.keyPath, '/tmp/client.key');
  assert.equal(
    mtlsBasicImported.headers.find((header) => header.key === 'Authorization')?.value,
    `Basic ${Buffer.from('alice:secret', 'utf8').toString('base64')}`
  );
});

test('single request curl exports include warning comments for unsupported request behavior', () => {
  const exported = exportRequestByFormat({
    name: 'Scripted Request',
    method: 'POST',
    url: 'https://api.example.test/widgets',
    headers: [],
    bodyType: 'RAW_JSON',
    body: '{"ok":true}',
    auth: { type: 'bearer', token: '{{token}}' },
    scripts: {
      preRequest: 'pm.environment.set("token", "abc");',
      tests: 'pm.test("ok", function () {});'
    },
    cookieJar: { enabled: true, storeResponses: true },
    variables: [{ enabled: true, key: 'localValue', value: 'yes' }],
    settings: {
      sslCertificateVerification: 'disabled'
    }
  }, 'curl');

  assert.match(exported, /^# Request: Scripted Request\n/);
  assert.match(exported, /WARNING: Pre-request scripts are not included/);
  assert.match(exported, /WARNING: Post-request scripts are not included/);
  assert.match(exported, /WARNING: Request-local disabled SSL certificate verification is exported as curl -k/);
  assert.doesNotMatch(exported, /Request-local CA certificate path/);
  assert.match(exported, /curl 'https:\/\/api\.example\.test\/widgets'/);
  assert.match(exported, / -k/);
  assert.doesNotMatch(exported, /--cacert '\/tmp\/custom-ca\.pem'/);
  assert.match(exported, /--data-raw '\{"ok":true\}'/);
});

test('single request curl exports direct client certificate auth', () => {
  const exported = exportRequestByFormat({
    name: 'mTLS Request',
    method: 'GET',
    url: 'https://api.example.test/secure',
    headers: [],
    bodyType: 'NONE',
    body: '',
    auth: {
      type: 'clientCertificate',
      certPath: '/tmp/client.crt',
      keyPath: '/tmp/client.key',
      caPath: '/tmp/ca.pem'
    },
    scripts: { preRequest: '', tests: '' }
  }, 'curl');

  assert.doesNotMatch(exported, /clientCertificate auth settings are not fully translated/);
  assert.match(exported, /--cert '\/tmp\/client\.crt' --key '\/tmp\/client\.key'/);
  assert.match(exported, /--cacert '\/tmp\/ca\.pem'/);
});

test('request import rejects unsupported content', () => {
  assert.throws(
    () => importRequestFromText('not a request'),
    /Request import must be a curl command or PostMeter request JSON/
  );
  assert.throws(
    () => importRequestFromText(JSON.stringify({ format: 'postmeter.collection', collections: [] })),
    /must contain a request object/
  );
});
