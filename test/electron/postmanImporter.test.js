const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { importCollectionFromContent } = require('../../src/core/collectionImportRegistry');
const { runCollection } = require('../../src/core/collectionRunner');
const { walkRequests } = require('../../src/core/models');
const { exportPostmanCollection, importPostmanCollection } = require('../../src/core/postmanImporter');

test('imports common Postman auth helpers with collection and folder inheritance', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Postman Auth',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{collectionToken}}' }]
    },
    item: [
      {
        name: 'Inherited bearer',
        request: {
          method: 'GET',
          url: 'https://api.example.test/inherited'
        }
      },
      {
        name: 'Folder',
        auth: {
          type: 'basic',
          basic: [
            { key: 'username', value: 'user' },
            { key: 'password', value: '{{password}}' }
          ]
        },
        item: [{
          name: 'Inherited basic',
          request: {
            method: 'GET',
            url: 'https://api.example.test/basic'
          }
        }]
      },
      {
        name: 'Request API key',
        request: {
          method: 'GET',
          url: 'https://api.example.test/key',
          cookie: [{
            name: 'session',
            value: 'abc',
            domain: '.example.test',
            path: '/key',
            expires: 'Wed, 21 Oct 2099 07:28:00 GMT',
            secure: true,
            httpOnly: true,
            sameSite: 'no_restriction',
            priority: 'high',
            partitioned: true,
            extensions: ['SameParty']
          }, {
            name: '__Host-postman',
            value: 'host-value',
            path: '/',
            secure: true,
            httpOnly: true,
            hostOnly: true,
            sameSite: 'lax',
            priority: 'medium',
            extensions: ['Postman-Source']
          }],
          variable: [{ key: 'requestScope', value: 'local' }],
          auth: {
            type: 'apikey',
            apikey: [
              { key: 'in', value: 'query' },
              { key: 'key', value: 'api_key' },
              { key: 'value', value: '{{apiKey}}' }
            ]
          }
        }
      },
      {
        name: 'Request OAuth',
        request: {
          method: 'GET',
          url: 'https://api.example.test/oauth',
          auth: {
            type: 'oauth2',
            oauth2: [
              { key: 'grant_type', value: 'client_credentials' },
              { key: 'accessTokenUrl', value: 'https://auth.example.test/token' },
              { key: 'clientId', value: 'client' },
              { key: 'clientSecret', value: '{{clientSecret}}' },
              { key: 'scope', value: 'read write' }
            ]
          }
        }
      }
    ]
  });

  assert.equal(collection.auth.type, 'bearer');
  assert.equal(collection.auth.token, '{{collectionToken}}');
  assert.equal(collection.requests[0].auth.type, 'none');
  assert.equal(collection.folders[0].auth.type, 'basic');
  assert.equal(collection.folders[0].auth.username, 'user');
  assert.equal(collection.folders[0].requests[0].auth.type, 'none');
  assert.equal(collection.requests[1].auth.type, 'apiKey');
  assert.equal(collection.requests[1].auth.location, 'query');
  assert.equal(collection.requests[1].headers.find((header) => header.key === 'Cookie').value, 'session=abc; __Host-postman=host-value');
  const cookieMetadata = JSON.parse(collection.requests[1].variables.find((variable) => variable.key === 'postman.cookies').value);
  assert.equal(cookieMetadata[0].source, 'postman');
  assert.equal(cookieMetadata[0].domain, '.example.test');
  assert.equal(cookieMetadata[0].path, '/key');
  assert.equal(cookieMetadata[0].secure, true);
  assert.equal(cookieMetadata[0].httpOnly, true);
  assert.equal(cookieMetadata[0].sameSite, 'None');
  assert.equal(cookieMetadata[0].priority, 'High');
  assert.equal(cookieMetadata[0].partitioned, true);
  assert.deepEqual(cookieMetadata[0].extensions, ['SameParty']);
  assert.equal(new Date(cookieMetadata[0].expiresAt).getUTCFullYear(), 2099);
  assert.equal(cookieMetadata[1].source, 'postman');
  assert.equal(cookieMetadata[1].name, '__Host-postman');
  assert.equal(cookieMetadata[1].secure, true);
  assert.equal(cookieMetadata[1].hostOnly, true);
  assert.equal(cookieMetadata[1].path, '/');
  assert.equal(cookieMetadata[1].sameSite, 'Lax');
  assert.equal(cookieMetadata[1].priority, 'Medium');
  assert.deepEqual(cookieMetadata[1].extensions, ['Postman-Source']);
  assert.equal(collection.requests[1].variables.find((variable) => variable.key === 'requestScope').value, 'local');
  assert.equal(collection.requests[2].auth.type, 'oauth2');
  assert.equal(collection.requests[2].auth.grantType, 'clientCredentials');
  assert.equal(collection.requests[2].auth.tokenUrl, 'https://auth.example.test/token');
});

test('imports and exports OAuth 2.0 Postman controls', () => {
  const authRequestParams = [
    { key: 'prompt', value: 'consent', enabled: true }
  ];
  const tokenRequestParams = [
    { key: 'resource', value: 'postmeter-api', sendIn: 'body', enabled: true },
    { key: 'X-OAuth-Trace', value: 'trace-token', sendIn: 'header', enabled: true }
  ];
  const refreshRequestParams = [
    { key: 'resource', value: 'postmeter-api', sendIn: 'body', enabled: true },
    { key: 'X-Refresh-Trace', value: 'refresh-trace', sendIn: 'header', enabled: false }
  ];
  const collection = importPostmanCollection({
    info: {
      name: 'OAuth 2.0 Controls',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'OAuth 2.0',
      request: {
        method: 'GET',
        url: 'https://api.example.test/oauth2',
        auth: {
          type: 'oauth2',
          oauth2: [
            { key: 'tokenType', value: 'Bearer' },
            { key: 'headerPrefix', value: 'Token' },
            { key: 'tokenName', value: 'Production token' },
            { key: 'addTokenTo', value: 'Request URL' },
            { key: 'accessToken', value: '{{accessToken}}' },
            { key: 'refreshToken', value: '{{refreshToken}}' },
            { key: 'autoRefreshToken', value: false, type: 'boolean' },
            { key: 'shareToken', value: true, type: 'boolean' },
            { key: 'authUrl', value: 'https://auth.example.test/authorize' },
            { key: 'accessTokenUrl', value: 'https://auth.example.test/token' },
            { key: 'refreshTokenUrl', value: 'https://auth.example.test/refresh' },
            { key: 'callbackUrl', value: 'postmeter://oauth/callback' },
            { key: 'clientId', value: 'client-id' },
            { key: 'clientSecret', value: '{{clientSecret}}' },
            { key: 'username', value: 'resource-owner' },
            { key: 'password', value: '{{ownerPassword}}' },
            { key: 'scope', value: 'openid profile' },
            { key: 'state', value: 'configured-state' },
            { key: 'codeChallengeMethod', value: 'plain' },
            { key: 'codeVerifier', value: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ' },
            { key: 'authorizeUsingBrowser', value: true, type: 'boolean' },
            { key: 'clientAuthentication', value: 'Send client credentials in body' },
            { key: 'authRequestParams', value: authRequestParams, type: 'any' },
            { key: 'tokenRequestParams', value: tokenRequestParams, type: 'any' },
            { key: 'refreshRequestParams', value: refreshRequestParams, type: 'any' },
            { key: 'grant_type', value: 'authorization_code_with_pkce' }
          ]
        }
      }
    }]
  });

  const auth = collection.requests[0].auth;
  assert.equal(auth.type, 'oauth2');
  assert.equal(auth.tokenType, 'Bearer');
  assert.equal(auth.headerPrefix, 'Token');
  assert.equal(auth.tokenName, 'Production token');
  assert.equal(auth.addAuthDataTo, 'query');
  assert.equal(auth.accessToken, '{{accessToken}}');
  assert.equal(auth.refreshToken, '{{refreshToken}}');
  assert.equal(auth.autoRefreshToken, false);
  assert.equal(auth.shareToken, true);
  assert.equal(auth.authorizationUrl, 'https://auth.example.test/authorize');
  assert.equal(auth.tokenUrl, 'https://auth.example.test/token');
  assert.equal(auth.refreshTokenUrl, 'https://auth.example.test/refresh');
  assert.equal(auth.redirectUri, 'postmeter://oauth/callback');
  assert.equal(auth.clientId, 'client-id');
  assert.equal(auth.clientSecret, '{{clientSecret}}');
  assert.equal(auth.username, 'resource-owner');
  assert.equal(auth.password, '{{ownerPassword}}');
  assert.equal(auth.scopes, 'openid profile');
  assert.equal(auth.state, 'configured-state');
  assert.equal(auth.codeChallengeMethod, 'plain');
  assert.equal(auth.codeVerifier, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ');
  assert.equal(auth.authorizeUsingBrowser, true);
  assert.equal(auth.clientAuthentication, 'body');
  assert.equal(auth.grantType, 'authorizationCodePkce');
  assert.deepEqual(auth.authRequestParams, authRequestParams);
  assert.deepEqual(auth.tokenRequestParams, tokenRequestParams);
  assert.deepEqual(auth.refreshRequestParams, refreshRequestParams);

  const exported = exportPostmanCollection(collection);
  const exportedAuth = Object.fromEntries(exported.item[0].request.auth.oauth2.map((item) => [item.key, item.value]));
  assert.equal(exported.item[0].request.auth.type, 'oauth2');
  assert.equal(exportedAuth.headerPrefix, 'Token');
  assert.equal(exportedAuth.tokenName, 'Production token');
  assert.equal(exportedAuth.addTokenTo, 'Request URL');
  assert.equal(exportedAuth.autoRefreshToken, false);
  assert.equal(exportedAuth.shareToken, true);
  assert.equal(exportedAuth.refreshTokenUrl, 'https://auth.example.test/refresh');
  assert.equal(exportedAuth.callbackUrl, 'postmeter://oauth/callback');
  assert.equal(exportedAuth.state, 'configured-state');
  assert.equal(exportedAuth.username, 'resource-owner');
  assert.equal(exportedAuth.password, '{{ownerPassword}}');
  assert.equal(exportedAuth.codeChallengeMethod, 'plain');
  assert.equal(exportedAuth.codeVerifier, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ');
  assert.equal(exportedAuth.authorizeUsingBrowser, true);
  assert.equal(exportedAuth.clientAuthentication, 'Send client credentials in body');
  assert.equal(exportedAuth.grant_type, 'authorization_code_with_pkce');
  assert.deepEqual(exportedAuth.authRequestParams, authRequestParams);
  assert.deepEqual(exportedAuth.tokenRequestParams, tokenRequestParams);
  assert.deepEqual(exportedAuth.refreshRequestParams, refreshRequestParams);
});

test('imports and exports Hawk Postman controls', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Hawk Controls',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'Hawk',
      request: {
        method: 'POST',
        url: 'https://api.example.test/hawk',
        auth: {
          type: 'hawk',
          hawk: [
            { key: 'authId', value: 'hawk-id' },
            { key: 'authKey', value: '{{hawkKey}}' },
            { key: 'algorithm', value: 'SHA-256' },
            { key: 'user', value: 'ada' },
            { key: 'nonce', value: 'fixed-nonce' },
            { key: 'extraData', value: 'extra-data' },
            { key: 'app', value: 'postmeter-app' },
            { key: 'delegation', value: 'delegated-by' },
            { key: 'timestamp', value: '1777291200' },
            { key: 'includePayloadHash', value: true, type: 'boolean' }
          ]
        }
      }
    }]
  });

  const auth = collection.requests[0].auth;
  assert.deepEqual(auth, {
    type: 'hawk',
    authId: 'hawk-id',
    authKey: '{{hawkKey}}',
    algorithm: 'sha256',
    user: 'ada',
    nonce: 'fixed-nonce',
    extraData: 'extra-data',
    app: 'postmeter-app',
    delegation: 'delegated-by',
    timestamp: '1777291200',
    includePayloadHash: true
  });

  const exported = exportPostmanCollection(collection);
  const exportedAuth = Object.fromEntries(exported.item[0].request.auth.hawk.map((item) => [item.key, item.value]));
  assert.equal(exported.item[0].request.auth.type, 'hawk');
  assert.equal(exportedAuth.authId, 'hawk-id');
  assert.equal(exportedAuth.authKey, '{{hawkKey}}');
  assert.equal(exportedAuth.algorithm, 'SHA-256');
  assert.equal(exportedAuth.user, 'ada');
  assert.equal(exportedAuth.nonce, 'fixed-nonce');
  assert.equal(exportedAuth.extraData, 'extra-data');
  assert.equal(exportedAuth.app, 'postmeter-app');
  assert.equal(exportedAuth.delegation, 'delegated-by');
  assert.equal(exportedAuth.timestamp, '1777291200');
  assert.equal(exportedAuth.includePayloadHash, true);
});

test('round-trips Postman request cookie source metadata without promoting disabled cookies', () => {
  const sourceCookies = [{
    name: 'expiresCookie',
    value: 'alpha',
    domain: '.example.test',
    path: '/expires',
    expires: 'Wed, 21 Oct 2099 07:28:00 GMT',
    secure: true,
    httpOnly: true,
    sameSite: 'no_restriction',
    priority: 'high',
    partitioned: true,
    extensions: ['SameParty', 'Source=Postman'],
    _postman_cookie_id: 'expires-cookie-id',
    rawAttributes: { size: 42, customFlag: true }
  }, {
    name: 'expiresAtCookie',
    value: 'beta',
    domain: 'api.example.test',
    path: '/',
    expiresAt: '2100-01-02T03:04:05.000Z',
    maxAge: 3600,
    sameSite: 'strict',
    priority: 'low',
    hostOnly: true
  }, {
    name: 'maxAgeCookie',
    value: 'gamma',
    domain: 'api.example.test',
    path: '/max-age',
    maxAge: '7200',
    sameSite: 'lax',
    priority: 'medium',
    partitioned: 'true',
    hostOnly: 'true'
  }, {
    name: 'session',
    value: 'root',
    domain: 'api.example.test',
    path: '/',
    expires: 'Wed, 21 Oct 2099 07:28:00 GMT',
    sameSite: 'none',
    hostOnly: false
  }, {
    name: 'session',
    value: 'admin',
    domain: 'api.example.test',
    path: '/admin',
    expirationDate: '2101-03-04T05:06:07.000Z',
    sameSite: 'None',
    hostOnly: 'false'
  }, {
    name: 'emptyValue',
    domain: '.example.test',
    path: '/empty',
    value: '',
    expiresAt: '',
    sameSite: 'Lax'
  }, {
    name: '__Host-session',
    value: 'host-prefix',
    path: '/',
    secure: true,
    httpOnly: true,
    hostOnly: true,
    sameSite: 'lax',
    priority: 'medium',
    extensions: ['HostPrefix']
  }, {
    name: '__Secure-device',
    value: 'secure-prefix',
    domain: '.example.test',
    path: '/',
    secure: true,
    sameSite: 'strict',
    priority: 'high'
  }, {
    name: 'rawUnknown',
    value: 'delta',
    domain: 'api.example.test',
    path: '/raw',
    expires: 'not-a-date',
    sameSite: 'future-mode',
    priority: 'urgent',
    unknownScalar: 'preserved',
    unknownObject: { nested: ['yes'] }
  }, {
    name: 'disabledCookie',
    value: 'disabled',
    domain: 'api.example.test',
    path: '/disabled',
    expires: 'Tue, 19 Jan 2038 03:14:07 GMT',
    disabled: true,
    sameSite: 'lax',
    priority: 'medium',
    partitioned: true,
    unknownDisabledField: 'still exported'
  }];
  const collection = importPostmanCollection({
    info: {
      name: 'Postman Cookie Matrix',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'Cookie Matrix',
      request: {
        method: 'GET',
        url: 'https://api.example.test/cookies',
        cookie: sourceCookies
      }
    }]
  });
  const request = collection.requests[0];

  assert.deepEqual(request.postman.request.cookie, sourceCookies);
  assert.equal(
    request.headers.find((header) => header.key === 'Cookie').value,
    'expiresCookie=alpha; expiresAtCookie=beta; maxAgeCookie=gamma; session=root; session=admin; emptyValue=; __Host-session=host-prefix; __Secure-device=secure-prefix; rawUnknown=delta'
  );
  const metadata = JSON.parse(request.variables.find((variable) => variable.key === 'postman.cookies').value);
  const cookiesByName = new Map(metadata.map((cookie) => [cookie.name, cookie]));
  const sessionCookies = metadata.filter((cookie) => cookie.name === 'session');

  assert.equal(cookiesByName.has('disabledCookie'), false);
  assert.equal(sessionCookies.length, 2);
  assert.deepEqual(sessionCookies.map((cookie) => cookie.path), ['/', '/admin']);
  assert.equal(sessionCookies[0].expiresAt, '2099-10-21T07:28:00.000Z');
  assert.equal(sessionCookies[0].hostOnly, false);
  assert.equal(sessionCookies[0].sameSite, 'None');
  assert.equal(sessionCookies[1].expiresAt, '2101-03-04T05:06:07.000Z');
  assert.equal(sessionCookies[1].hostOnly, false);
  assert.equal(sessionCookies[1].sameSite, 'None');
  assert.equal(cookiesByName.get('emptyValue').value, '');
  assert.equal(cookiesByName.get('emptyValue').expiresAt, '');
  assert.equal(cookiesByName.get('expiresCookie').expiresAt, '2099-10-21T07:28:00.000Z');
  assert.equal(cookiesByName.get('expiresCookie').sameSite, 'None');
  assert.equal(cookiesByName.get('expiresCookie').priority, 'High');
  assert.equal(cookiesByName.get('expiresCookie').partitioned, true);
  assert.deepEqual(cookiesByName.get('expiresCookie').extensions, ['SameParty', 'Source=Postman']);
  assert.equal(cookiesByName.get('expiresAtCookie').expiresAt, '2100-01-02T03:04:05.000Z');
  assert.equal(cookiesByName.get('expiresAtCookie').maxAge, '3600');
  assert.equal(cookiesByName.get('expiresAtCookie').sameSite, 'Strict');
  assert.equal(cookiesByName.get('expiresAtCookie').priority, 'Low');
  assert.equal(cookiesByName.get('expiresAtCookie').hostOnly, true);
  assert.equal(cookiesByName.get('maxAgeCookie').expiresAt, '');
  assert.equal(cookiesByName.get('maxAgeCookie').maxAge, '7200');
  assert.equal(cookiesByName.get('maxAgeCookie').sameSite, 'Lax');
  assert.equal(cookiesByName.get('maxAgeCookie').priority, 'Medium');
  assert.equal(cookiesByName.get('maxAgeCookie').hostOnly, true);
  assert.equal(cookiesByName.get('maxAgeCookie').partitioned, true);
  assert.equal(cookiesByName.get('__Host-session').secure, true);
  assert.equal(cookiesByName.get('__Host-session').httpOnly, true);
  assert.equal(cookiesByName.get('__Host-session').hostOnly, true);
  assert.equal(cookiesByName.get('__Host-session').path, '/');
  assert.deepEqual(cookiesByName.get('__Host-session').extensions, ['HostPrefix']);
  assert.equal(cookiesByName.get('__Secure-device').secure, true);
  assert.equal(cookiesByName.get('__Secure-device').sameSite, 'Strict');
  assert.equal(cookiesByName.get('rawUnknown').expiresAt, 'not-a-date');
  assert.equal(cookiesByName.get('rawUnknown').sameSite, '');
  assert.equal(cookiesByName.get('rawUnknown').priority, '');

  const exported = exportPostmanCollection(collection);
  assert.deepEqual(exported.item[0].request.cookie, sourceCookies);
  assert.equal(exported.item[0].request.cookie.find((cookie) => cookie.name === 'disabledCookie').disabled, true);
  assert.deepEqual(
    exported.item[0].request.cookie.find((cookie) => cookie.name === 'rawUnknown').unknownObject,
    { nested: ['yes'] }
  );
});

test('imports real-world Postman request cookie fixture coverage without broadening claims', () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../fixtures/postman/real-world-cookie-corpus.collection.json'),
    'utf8'
  ));
  const collection = importPostmanCollection(fixture);
  const request = collection.requests[0];
  const cookieHeader = request.headers.find((header) => header.key === 'Cookie');
  const metadata = JSON.parse(request.variables.find((variable) => variable.key === 'postman.cookies').value);
  const duplicateSessions = metadata.filter((cookie) => cookie.name === 'session');
  const byName = new Map(metadata.map((cookie) => [cookie.name, cookie]));

  assert.equal(cookieHeader.value, [
    'session=root',
    'session=admin',
    'empty=',
    'expiresOnly=legacy',
    'expiresAtOnly=iso',
    'expirationDateOnly=browser',
    'maxAgeOnly=ttl',
    '__Host-fixture=host',
    '__Secure-fixture=secure',
    'partitioned=chips',
    'unknownVendor=raw'
  ].join('; '));
  assert.equal(byName.has('disabledSession'), false);
  assert.equal(duplicateSessions.length, 2);
  assert.deepEqual(duplicateSessions.map((cookie) => cookie.path), ['/', '/admin']);
  assert.deepEqual(duplicateSessions.map((cookie) => cookie.domain), ['api.example.test', '.example.test']);
  assert.equal(byName.get('empty').value, '');
  assert.equal(byName.get('expiresOnly').expiresAt, '2099-10-21T07:28:00.000Z');
  assert.equal(byName.get('expiresAtOnly').expiresAt, '2100-01-02T03:04:05.000Z');
  assert.equal(byName.get('expirationDateOnly').expiresAt, '2101-03-04T05:06:07.000Z');
  assert.equal(byName.get('maxAgeOnly').maxAge, '86400');
  assert.equal(byName.get('expiresOnly').sameSite, 'Strict');
  assert.equal(byName.get('expiresAtOnly').sameSite, 'Lax');
  assert.equal(byName.get('expirationDateOnly').sameSite, 'None');
  assert.equal(byName.get('unknownVendor').sameSite, '');
  assert.equal(byName.get('__Host-fixture').hostOnly, true);
  assert.equal(byName.get('__Host-fixture').secure, true);
  assert.equal(byName.get('__Secure-fixture').secure, true);
  assert.equal(byName.get('partitioned').partitioned, true);
  assert.equal(byName.get('partitioned').priority, 'High');
  assert.deepEqual(byName.get('partitioned').extensions, ['SameParty', 'PartitionKey=https://example.test']);

  const exported = exportPostmanCollection(collection);
  const exportedCookies = exported.item[0].request.cookie;
  assert.deepEqual(exportedCookies, fixture.item[0].request.cookie);
  assert.equal(exportedCookies.find((cookie) => cookie.name === 'disabledSession').disabled, ' true ');
  assert.deepEqual(
    exportedCookies.find((cookie) => cookie.name === 'unknownVendor').vendorMetadata,
    { owner: 'browser-extension', flags: ['nonstandard'] }
  );
});

test('imports and exports advanced Postman auth helper shapes', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Advanced Auth',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [
      {
        name: 'Digest',
        request: {
          method: 'GET',
          url: 'https://api.example.test/digest',
          auth: {
            type: 'digest',
            digest: [
              { key: 'username', value: 'ada' },
              { key: 'password', value: 'secret' },
              { key: 'disableRetryingRequest', value: true, type: 'boolean' },
              { key: 'realm', value: 'postmeter' },
              { key: 'nonce', value: 'abc123' },
              { key: 'algorithm', value: 'MD5' },
              { key: 'qop', value: 'auth' },
              { key: 'nonceCount', value: '00000005' },
              { key: 'clientNonce', value: '0a4f113b' },
              { key: 'opaque', value: 'opaque-token' }
            ]
          }
        }
      },
      {
        name: 'OAuth 1.0',
        request: {
          method: 'GET',
          url: 'https://api.example.test/oauth1',
          auth: {
            type: 'oauth1',
            oauth1: [
              { key: 'consumerKey', value: 'consumer' },
              { key: 'consumerSecret', value: 'consumer-secret' },
              { key: 'token', value: 'token' },
              { key: 'tokenSecret', value: 'token-secret' },
              { key: 'signatureMethod', value: 'HMAC-SHA256' },
              { key: 'privateKey', value: 'private-key' },
              { key: 'addParamsToHeader', value: false, type: 'boolean' },
              { key: 'callback', value: 'https://client.example.test/callback' },
              { key: 'verifier', value: 'verifier' },
              { key: 'timestamp', value: '1777291200' },
              { key: 'nonce', value: 'nonce' },
              { key: 'version', value: '1.0' },
              { key: 'realm', value: 'postmeter' },
              { key: 'includeBodyHash', value: true, type: 'boolean' },
              { key: 'addEmptyParamsToSign', value: true, type: 'boolean' }
            ]
          }
        }
      },
      {
        name: 'AWS',
        request: {
          method: 'GET',
          url: 'https://api.example.test/aws',
          auth: {
            type: 'awsv4',
            awsv4: [
              { key: 'accessKey', value: '{{awsAccessKey}}' },
              { key: 'secretKey', value: '{{awsSecretKey}}' },
              { key: 'region', value: 'us-east-1' },
              { key: 'service', value: 'execute-api' },
              { key: 'sessionToken', value: '{{awsSessionToken}}' },
              { key: 'addAuthDataTo', value: 'Request URL' }
            ]
          }
        }
      },
      {
        name: 'NTLM',
        request: {
          method: 'GET',
          url: 'https://api.example.test/ntlm',
          auth: {
            type: 'ntlm',
            ntlm: [
              { key: 'username', value: 'user' },
              { key: 'password', value: 'pass' },
              { key: 'disableRetryingRequest', value: true, type: 'boolean' },
              { key: 'domain', value: 'EXAMPLE' },
              { key: 'workstation', value: 'WORKSTATION' }
            ]
          }
        }
      },
      {
        name: 'Akamai',
        request: {
          method: 'GET',
          url: 'https://api.example.test/akamai',
          auth: {
            type: 'akamaiEdgeGrid',
            akamaiEdgeGrid: [
              { key: 'accessToken', value: 'access' },
              { key: 'clientToken', value: 'client' },
              { key: 'clientSecret', value: 'secret' },
              { key: 'nonce', value: 'nonce-1' },
              { key: 'timestamp', value: '20260427T120000+0000' },
              { key: 'baseUrl', value: 'https://api.example.test' },
              { key: 'headersToSign', value: 'host;x-test' },
              { key: 'maxBodySize', value: '2048' }
            ]
          }
        }
      },
      {
        name: 'JWT Bearer',
        request: {
          method: 'GET',
          url: 'https://api.example.test/jwt',
          auth: {
            type: 'jwt-bearer',
            'jwt-bearer': [
              { key: 'algorithm', value: 'HS256' },
              { key: 'secret', value: 'jwt-secret' },
              { key: 'secretBase64Encoded', value: true, type: 'boolean' },
              { key: 'privateKey', value: 'jwt-private-key' },
              { key: 'keyId', value: 'jwt-kid' },
              { key: 'issuer', value: 'issuer' },
              { key: 'subject', value: 'subject' },
              { key: 'audience', value: 'audience' },
              { key: 'expiresIn', value: '120' },
              { key: 'claims', value: '{"scope":"read"}' },
              { key: 'jwtHeaders', value: '{"typ":"JWT","kid":"custom"}' },
              { key: 'headerPrefix', value: 'JWT' },
              { key: 'addTokenTo', value: 'Query Param' },
              { key: 'queryParamName', value: 'legacy-token' }
            ]
          }
        }
      },
      {
        name: 'ASAP',
        request: {
          method: 'GET',
          url: 'https://api.example.test/asap',
          auth: {
            type: 'asap',
            asap: [
              { key: 'algorithm', value: 'HS256' },
              { key: 'secret', value: 'asap-secret' },
              { key: 'issuer', value: 'issuer' },
              { key: 'audience', value: 'audience' },
              { key: 'keyId', value: 'kid-1' },
              { key: 'expiry', value: '120' },
              { key: 'headerPrefix', value: 'Legacy' },
              { key: 'additionalClaims', value: '{"tenant":"postmeter"}' }
            ]
          }
        }
      }
    ]
  });

  assert.equal(collection.requests[0].auth.type, 'digest');
  assert.equal(collection.requests[0].auth.username, 'ada');
  assert.equal(collection.requests[0].auth.disableRetryingRequest, true);
  assert.equal(collection.requests[0].auth.realm, 'postmeter');
  assert.equal(collection.requests[0].auth.nonceCount, '00000005');
  assert.equal(collection.requests[0].auth.clientNonce, '0a4f113b');
  assert.equal(collection.requests[0].auth.opaque, 'opaque-token');
  assert.equal(collection.requests[1].auth.type, 'oauth1');
  assert.equal(collection.requests[1].auth.signatureMethod, 'HMAC-SHA256');
  assert.equal(collection.requests[1].auth.privateKey, 'private-key');
  assert.equal(collection.requests[1].auth.addAuthDataTo, 'queryOrBody');
  assert.equal(collection.requests[1].auth.callback, 'https://client.example.test/callback');
  assert.equal(collection.requests[1].auth.includeBodyHash, true);
  assert.equal(collection.requests[1].auth.addEmptyParamsToSign, true);
  assert.equal(collection.requests[2].auth.type, 'aws');
  assert.equal(collection.requests[2].auth.service, 'execute-api');
  assert.equal(collection.requests[2].auth.sessionToken, '{{awsSessionToken}}');
  assert.equal(collection.requests[2].auth.addAuthDataToQuery, true);
  assert.equal(collection.requests[3].auth.type, 'ntlm');
  assert.equal(collection.requests[3].auth.disableRetryingRequest, true);
  assert.equal(collection.requests[3].auth.domain, 'EXAMPLE');
  assert.equal(collection.requests[3].auth.workstation, 'WORKSTATION');
  assert.equal(collection.requests[4].auth.type, 'akamaiEdgeGrid');
  assert.equal(collection.requests[4].auth.nonce, 'nonce-1');
  assert.equal(collection.requests[4].auth.timestamp, '20260427T120000+0000');
  assert.equal(collection.requests[4].auth.baseUrl, 'https://api.example.test');
  assert.equal(collection.requests[4].auth.headersToSign, 'host;x-test');
  assert.equal(collection.requests[4].auth.maxBodySize, '2048');
  assert.equal(collection.requests[5].auth.type, 'jwtBearer');
  assert.equal(collection.requests[5].auth.secretBase64Encoded, true);
  assert.equal(collection.requests[5].auth.keyId, 'jwt-kid');
  assert.equal(collection.requests[5].auth.issuer, 'issuer');
  assert.equal(collection.requests[5].auth.subject, 'subject');
  assert.equal(collection.requests[5].auth.expiresIn, '120');
  assert.equal(collection.requests[5].auth.jwtHeaders, '{"typ":"JWT","kid":"custom"}');
  assert.equal(collection.requests[5].auth.addTokenTo, 'query');
  assert.equal(collection.requests[6].auth.type, 'asap');
  assert.equal(collection.requests[6].auth.keyId, 'kid-1');
  assert.equal(collection.requests[6].auth.expiresIn, '120');
  assert.equal(collection.requests[6].auth.additionalClaims, '{"tenant":"postmeter"}');

  const exported = exportPostmanCollection(collection);
  assert.equal(exported.item[0].request.auth.type, 'digest');
  assert.deepEqual(
    Object.fromEntries(exported.item[0].request.auth.digest.map((item) => [item.key, item.value])),
    {
      username: 'ada',
      password: 'secret',
      disableRetryingRequest: true,
      realm: 'postmeter',
      nonce: 'abc123',
      algorithm: 'MD5',
      qop: 'auth',
      nonceCount: '00000005',
      clientNonce: '0a4f113b',
      opaque: 'opaque-token'
    }
  );
  assert.equal(exported.item[1].request.auth.type, 'oauth1');
  assert.deepEqual(
    Object.fromEntries(exported.item[1].request.auth.oauth1.map((item) => [item.key, item.value])),
    {
      consumerKey: 'consumer',
      consumerSecret: 'consumer-secret',
      token: 'token',
      tokenSecret: 'token-secret',
      signatureMethod: 'HMAC-SHA256',
      privateKey: 'private-key',
      addParamsToHeader: false,
      callback: 'https://client.example.test/callback',
      verifier: 'verifier',
      timestamp: '1777291200',
      nonce: 'nonce',
      version: '1.0',
      realm: 'postmeter',
      includeBodyHash: true,
      addEmptyParamsToSign: true
    }
  );
  assert.equal(exported.item[2].request.auth.type, 'awsv4');
  assert.equal(
    Object.fromEntries(exported.item[2].request.auth.awsv4.map((item) => [item.key, item.value])).addAuthDataTo,
    'Request URL'
  );
  assert.equal(exported.item[3].request.auth.type, 'ntlm');
  assert.deepEqual(
    Object.fromEntries(exported.item[3].request.auth.ntlm.map((item) => [item.key, item.value])),
    {
      username: 'user',
      password: 'pass',
      disableRetryingRequest: true,
      domain: 'EXAMPLE',
      workstation: 'WORKSTATION'
    }
  );
  assert.equal(exported.item[4].request.auth.type, 'akamaiEdgeGrid');
  assert.deepEqual(
    Object.fromEntries(exported.item[4].request.auth.akamaiEdgeGrid.map((item) => [item.key, item.value])),
    {
      accessToken: 'access',
      clientToken: 'client',
      clientSecret: 'secret',
      nonce: 'nonce-1',
      timestamp: '20260427T120000+0000',
      baseUrl: 'https://api.example.test',
      headersToSign: 'host;x-test',
      maxBodySize: '2048'
    }
  );
  assert.equal(exported.item[5].request.auth.type, 'jwt-bearer');
  assert.deepEqual(
    Object.fromEntries(exported.item[5].request.auth['jwt-bearer'].map((item) => [item.key, item.value])),
    {
      algorithm: 'HS256',
      secret: 'jwt-secret',
      secretBase64Encoded: true,
      privateKey: 'jwt-private-key',
      keyId: 'jwt-kid',
      issuer: 'issuer',
      subject: 'subject',
      audience: 'audience',
      expiresIn: '120',
      claims: '{"scope":"read"}',
      jwtHeaders: '{"typ":"JWT","kid":"custom"}',
      headerPrefix: 'JWT',
      addTokenTo: 'Query Param'
    }
  );
  assert.equal(exported.item[5].request.auth['jwt-bearer'].some((item) => item.key === 'queryParamName'), false);
  assert.equal(exported.item[6].request.auth.type, 'asap');
  assert.deepEqual(
    Object.fromEntries(exported.item[6].request.auth.asap.map((item) => [item.key, item.value])),
    {
      algorithm: 'HS256',
      secret: 'asap-secret',
      issuer: 'issuer',
      audience: 'audience',
      keyId: 'kid-1',
      expiry: '120',
      additionalClaims: '{"tenant":"postmeter"}'
    }
  );
  assert.equal(exported.item[6].request.auth.asap.some((item) => item.key === 'headerPrefix'), false);
});

test('exports current auth model fields after editing imported Postman auth', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Edited Auth Export',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'JWT',
      request: {
        method: 'GET',
        url: 'https://api.example.test/jwt',
        auth: {
          type: 'jwt-bearer',
          'jwt-bearer': [
            { key: 'algorithm', value: 'HS256' },
            { key: 'secret', value: 'old-secret' },
            { key: 'queryParamName', value: 'legacy-token' }
          ]
        }
      }
    }, {
      name: 'AWS',
      request: {
        method: 'GET',
        url: 'https://api.example.test/aws',
        auth: {
          type: 'awsv4',
          awsv4: [
            { key: 'accessKey', value: 'old-access' },
            { key: 'secretKey', value: 'old-secret' }
          ]
        }
      }
    }]
  });

  collection.requests[0].auth = {
    type: 'jwtBearer',
    algorithm: 'HS512',
    secret: 'new-secret',
    secretBase64Encoded: true,
    claims: '{"edited":true}',
    jwtHeaders: '{"kid":"edited"}',
    headerPrefix: 'JWT',
    addTokenTo: 'query'
  };
  collection.requests[1].auth = {
    type: 'aws',
    accessKey: 'new-access',
    secretKey: 'new-secret',
    region: 'us-west-2',
    service: 'execute-api',
    sessionToken: 'session',
    addAuthDataToQuery: true
  };

  const exported = exportPostmanCollection(collection);
  const jwt = Object.fromEntries(exported.item[0].request.auth['jwt-bearer'].map((item) => [item.key, item.value]));
  assert.equal(jwt.algorithm, 'HS512');
  assert.equal(jwt.secret, 'new-secret');
  assert.equal(jwt.secretBase64Encoded, 'true');
  assert.equal(jwt.claims, '{"edited":true}');
  assert.equal(jwt.jwtHeaders, '{"kid":"edited"}');
  assert.equal(jwt.addTokenTo, 'Query Param');
  assert.equal(Object.hasOwn(jwt, 'queryParamName'), false);

  const aws = Object.fromEntries(exported.item[1].request.auth.awsv4.map((item) => [item.key, item.value]));
  assert.equal(aws.accessKey, 'new-access');
  assert.equal(aws.secretKey, 'new-secret');
  assert.equal(aws.region, 'us-west-2');
  assert.equal(aws.service, 'execute-api');
  assert.equal(aws.sessionToken, 'session');
  assert.equal(aws.addAuthDataTo, 'Request URL');
  assert.equal(Object.hasOwn(aws, 'addAuthDataToQuery'), false);
});

test('imports Postman collection certificates without request examples', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Postman Certificates',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    certificate: [{
      name: 'mTLS cert',
      host: '*.example.test',
      port: '443',
      matches: ['https://mtls.example.test/*'],
      cert: { src: '/tmp/client.crt' },
      key: { src: '/tmp/client.key' },
      passphrase: 'secret'
    }],
    item: [{
      name: 'mTLS Request',
      request: {
        method: 'GET',
        url: 'https://mtls.example.test/widgets'
      },
      response: [{
        name: 'Success',
        code: 200,
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: '{"ok":true}'
      }]
    }]
  });

  assert.equal(collection.certificates.length, 1);
  assert.equal(collection.certificates[0].host, '*.example.test');
  assert.equal(collection.certificates[0].port, '443');
  assert.equal(collection.certificates[0].certPath, '/tmp/client.crt');
  assert.equal(collection.requests[0].auth.type, 'clientCertificate');
  assert.equal(collection.requests[0].auth.certificateId, collection.certificates[0].id);
  assert.equal(collection.requests[0].auth.certPath, undefined);
  assert.equal(Object.hasOwn(collection.requests[0], 'examples'), false);
  const exported = exportPostmanCollection(collection);
  assert.equal(exported.certificate[0].host, '*.example.test');
  assert.equal(exported.certificate[0].port, '443');
});

test('imports overlapping Postman collection certificates with runtime match precedence', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Postman Certificate Precedence',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    certificate: [
      {
        name: 'Older certificate',
        host: '*.example.test',
        cert: { src: '/tmp/older-client.crt' },
        key: { src: '/tmp/older-client.key' }
      },
      {
        name: 'Newer certificate',
        matches: ['https://api.example.test/*'],
        cert: { src: '/tmp/newer-client.crt' },
        key: { src: '/tmp/newer-client.key' }
      }
    ],
    item: [{
      name: 'mTLS Request',
      request: {
        method: 'GET',
        url: 'https://api.example.test/widgets'
      }
    }]
  });

  assert.equal(collection.requests[0].auth.type, 'clientCertificate');
  assert.equal(collection.requests[0].auth.certificateId, collection.certificates[1].id);
});

test('does not attach disabled Postman collection certificates to templated request URLs', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Disabled Postman Certificate',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    certificate: [{
      name: 'Disabled certificate',
      enabled: false,
      host: 'api.example.test',
      matches: ['https://{{apiHost}}/*'],
      cert: { src: '/tmp/disabled-client.crt' },
      key: { src: '/tmp/disabled-client.key' }
    }],
    item: [{
      name: 'Templated mTLS Request',
      request: {
        method: 'GET',
        url: 'https://{{apiHost}}/widgets'
      }
    }]
  });

  assert.equal(collection.certificates.length, 1);
  assert.equal(collection.certificates[0].enabled, false);
  assert.equal(collection.requests[0].auth.type, 'none');
});

test('round-trips Postman PFX/P12 certificate references for gRPC requests', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Postman gRPC PFX',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    certificate: [{
      id: 'grpc-pfx-cert-id',
      name: 'gRPC PFX cert',
      matches: ['grpc.example.test'],
      pfx: { src: '/tmp/client.p12' },
      passphrase: '{{certPassphrase}}'
    }],
    item: [{
      id: 'grpc-pfx-request-id',
      name: 'gRPC PFX Request',
      protocol: 'grpc',
      request: {
        methodPath: 'users.UserService/GetUser',
        url: 'grpcs://grpc.example.test/users.UserService/GetUser',
        grpc: {
          method: 'GetUser',
          methodType: 'unary',
          service: 'users.UserService'
        }
      }
    }]
  });

  assert.equal(collection.certificates.length, 1);
  assert.equal(collection.certificates[0].id, 'grpc-pfx-cert-id');
  assert.equal(collection.certificates[0].pfxPath, '/tmp/client.p12');
  assert.equal(collection.certificates[0].passphrase, '{{certPassphrase}}');
  assert.equal(collection.requests[0].protocol, 'grpc');
  assert.equal(collection.requests[0].auth.type, 'clientCertificate');
  assert.equal(collection.requests[0].auth.certificateId, 'grpc-pfx-cert-id');

  const exported = exportPostmanCollection(collection);
  assert.equal(exported.certificate[0].id, 'grpc-pfx-cert-id');
  assert.equal(exported.certificate[0].pfx.src, '/tmp/client.p12');
  assert.equal(exported.certificate[0].passphrase, '{{certPassphrase}}');
  assert.equal(exported.item[0].request.url, 'grpcs://grpc.example.test/users.UserService/GetUser');
  assert.equal(exported.item[0].request.grpc.method, 'GetUser');
});

test('annotates imported Postman package references for package-cache review', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Postman Packages',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'Package script',
      event: [{
        listen: 'test',
        script: {
          exec: [
            "pm.require('@team/tools');",
            "require('npm:@scope/pkg@2.0.0');",
            "require('lodash');"
          ]
        }
      }],
      request: {
        method: 'GET',
        url: 'https://api.example.test/packages'
      }
    }]
  });
  const metadata = JSON.parse(collection.variables.find((variable) => variable.key === 'postman.packageReferences').value);

  assert.deepEqual(metadata.map((item) => item.specifier), ['@team/tools', 'npm:@scope/pkg@2.0.0']);
  assert.equal(metadata[0].status, 'missing-review');
});

test('preserves GraphQL and gRPC protocol hooks and request metadata from Postman imports', () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../fixtures/postman/protocol-script-hooks.collection.json'),
    'utf8'
  ));
  const collection = importPostmanCollection(fixture);
  const graphql = collection.requests[0];
  const grpc = collection.requests[1];

  assert.equal(graphql.protocol, 'graphql');
  assert.equal(graphql.method, 'POST');
  assert.equal(graphql.postmanBody.mode, 'graphql');
  assert.equal(graphql.graphql.operationName, 'GetUser');
  assert.match(graphql.scripts.beforeQuery, /pm\.require\('lodash'\)/);
  assert.match(graphql.scripts.afterResponse, /graphql after response event/);
  assert.equal(graphql.bodyType, 'RAW_JSON');
  assert.equal(JSON.parse(graphql.body).operationName, 'GetUser');

  assert.equal(grpc.protocol, 'grpc');
  assert.equal(grpc.methodPath, 'users.UserService/GetUser');
  assert.equal(grpc.grpc.methodType, 'server-streaming');
  assert.equal(grpc.metadata[0].key, 'x-client');
  assert.equal(grpc.messages[0].name, 'seed');
  assert.match(grpc.scripts.beforeInvoke, /beforeInvoke/);
  assert.match(grpc.scripts.onIncomingMessage, /onIncomingMessage/);
  assert.match(grpc.scripts.afterResponse, /grpc after response event/);
});

test('exports UI-authored GraphQL request bodies as Postman GraphQL body mode', () => {
  const collection = {
    id: 'collection-graphql-ui',
    name: 'GraphQL UI Collection',
    requests: [{
      id: 'request-graphql-ui',
      name: 'GraphQL UI Request',
      method: 'POST',
      url: 'https://api.example.test/graphql',
      headers: [],
      queryParams: [],
      bodyType: 'RAW_JSON',
      body: JSON.stringify({
        query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
        variables: '{"id":"{{userId}}"}',
        operationName: 'GetUser'
      }),
      protocol: 'graphql',
      graphql: {
        query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
        variables: '{"id":"{{userId}}"}',
        operationName: 'GetUser'
      },
      postmanBody: {
        mode: 'graphql',
        graphql: {
          query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
          variables: '{"id":"{{userId}}"}',
          operationName: 'GetUser'
        }
      }
    }],
    folders: [],
    variables: []
  };

  const exported = exportPostmanCollection(collection);
  const request = exported.item[0].request;

  assert.equal(request.body.mode, 'graphql');
  assert.equal(request.body.graphql.operationName, 'GetUser');
  assert.equal(request.body.graphql.variables, '{"id":"{{userId}}"}');
  assert.equal(request.graphql.operationName, 'GetUser');
});

test('annotates package references found in protocol-specific Postman hook scripts', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Protocol Packages',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'GraphQL package script',
      protocol: 'graphql',
      event: [{
        listen: 'beforeQuery',
        script: {
          exec: [
            "pm.require('@team/protocol-tools');",
            "require('jsr:@scope/protocol@1.0.0');"
          ]
        }
      }],
      request: {
        method: 'POST',
        url: 'https://api.example.test/graphql',
        body: {
          mode: 'graphql',
          graphql: { query: '{ ok }', variables: '{}', operationName: '' }
        }
      }
    }]
  });
  const metadata = JSON.parse(collection.variables.find((variable) => variable.key === 'postman.packageReferences').value);

  assert.deepEqual(metadata.map((item) => item.specifier), ['@team/protocol-tools', 'jsr:@scope/protocol@1.0.0']);
});

test('preserves imported Postman local mock scripts without request Examples fields', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Postman Mock Scripts',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    event: [{
      listen: 'mock',
      script: {
        exec: [
          "const count = await pm.state.increment('count');",
          "if (pm.mock.matchRequest('mock-request', req)) {",
          "  pm.mock.sendExample('mock-example', res);",
          "}"
        ]
      }
    }],
    item: [{
      id: 'mock-request',
      name: 'Mock request',
      request: {
        method: 'GET',
        url: 'https://api.example.test/users/:id'
      },
      response: [{
        id: 'mock-example',
        name: 'Mock example',
        code: 200,
        body: '{"ok":true}'
      }]
    }]
  });

  assert.match(collection.scripts.mock, /pm\.state\.increment/);
  assert.match(collection.scripts.mock, /pm\.mock\.sendExample/);
  assert.equal(collection.requests[0].scripts.mock, '');
  assert.equal(Object.hasOwn(collection.requests[0], 'examples'), false);
  assert.deepEqual(collection.requests[0].postman.mockResponses, [{
    body: '{"ok":true}',
    id: 'mock-example',
    name: 'Mock example',
    statusCode: 200
  }]);
});

test('round-trips Postman hierarchy scripts, IDs, variables, certificates, protocol metadata, and file body references', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Round Trip',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _postman_id: 'collection-postman-id',
      description: { content: 'Collection description', type: 'text/plain' }
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{token}}', type: 'string' }]
    },
    variable: [{ key: 'token', value: 'initial', type: 'secret', description: 'token description' }],
    certificate: [{
      id: 'certificate-postman-id',
      name: 'mTLS cert',
      matches: ['https://api.example.test/*'],
      cert: { src: '/tmp/client.crt' },
      key: { src: '/tmp/client.key' },
      passphrase: '{{certPassphrase}}'
    }],
    cookieDomainWhitelist: ['api.example.test'],
    vaultAccess: { secrets: [{ key: 'token' }] },
    visualizerAssets: [{ name: 'chartjs', src: 'postman://asset/chartjs' }],
    mockState: { count: 1 },
    item: [{
      id: 'folder-postman-id',
      name: 'Folder',
      event: [{
        listen: 'prerequest',
        script: { type: 'text/javascript', exec: ['pm.collectionVariables.set("folder", "yes");'] }
      }],
      variable: [{ key: 'folderVariable', value: 'folder-value', type: 'string' }],
      auth: {
        type: 'basic',
        basic: [
          { key: 'username', value: 'user' },
          { key: 'password', value: '{{password}}' }
        ]
      },
      item: [{
        id: 'request-postman-id',
        name: 'Upload',
        event: [{
          listen: 'test',
          script: { type: 'text/javascript', exec: ['pm.test("uploaded", function () {', '  pm.expect(pm.response.code).to.equal(201);', '});'] }
        }],
        protocol: 'graphql',
        request: {
          method: 'POST',
          url: {
            raw: 'https://api.example.test/upload?trace=1',
            protocol: 'https',
            host: ['api', 'example', 'test'],
            path: ['upload'],
            query: [{ key: 'trace', value: '1', description: 'trace flag' }]
          },
          header: [{ key: 'X-Trace', value: 'yes', description: 'trace header' }],
          auth: {
            type: 'apikey',
            apikey: [
              { key: 'in', value: 'header' },
              { key: 'key', value: 'X-Api-Key' },
              { key: 'value', value: '{{apiKey}}' }
            ]
          },
          variable: [{ key: 'requestVariable', value: 'request-value', type: 'string' }],
          body: {
            mode: 'formdata',
            formdata: [{
              key: 'payload',
              type: 'file',
              src: '/tmp/payload.json',
              contentType: 'application/json'
            }]
          },
          protocolProfileBehavior: { disableBodyPruning: true },
          graphql: { query: 'query Upload { ok }', variables: '{}', operationName: 'Upload' }
        },
        response: [{
          id: 'example-postman-id',
          name: 'Created',
          code: 201,
          status: 'Created',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: '{"ok":true}'
        }]
      }]
    }, {
      id: 'caller-postman-id',
      name: 'Caller',
      event: [{
        listen: 'prerequest',
        script: { type: 'text/javascript', exec: ["pm.execution.runRequest('request-postman-id');"] }
      }],
      request: {
        method: 'GET',
        url: 'https://api.example.test/caller'
      }
    }]
  });

  assert.equal(collection.id, 'collection-postman-id');
  assert.equal(collection.postman.itemOrder[0].id, 'folder-postman-id');
  assert.equal(collection.postman.bindings.cookieDomainWhitelist[0], 'api.example.test');
  assert.equal(collection.folders[0].id, 'folder-postman-id');
  assert.equal(collection.folders[0].postman.events[0].listen, 'prerequest');
  assert.equal(collection.folders[0].postman.variables[0].type, 'string');
  assert.equal(collection.folders[0].variables[0].key, 'folderVariable');
  assert.equal(collection.folders[0].variables[0].value, 'folder-value');
  const request = collection.folders[0].requests[0];
  assert.equal(request.id, 'request-postman-id');
  assert.equal(request.postman.events[0].script.type, 'text/javascript');
  assert.equal(request.postman.fileReferences[0].src, '/tmp/payload.json');
  assert.equal(request.postmanBody.mode, 'formdata');
  assert.equal(Object.hasOwn(request, 'examples'), false);
  assert.equal(collection.certificates[0].id, 'certificate-postman-id');

  const exported = exportPostmanCollection(collection);
  assert.equal(exported.info._postman_id, 'collection-postman-id');
  assert.equal(exported.item[0].id, 'folder-postman-id');
  assert.equal(exported.item[0].event[0].script.exec[0], 'pm.collectionVariables.set("folder", "yes");');
  assert.equal(exported.item[0].variable, undefined);
  assert.equal(exported.item[0].item[0].id, 'request-postman-id');
  assert.equal(exported.item[0].item[0].event[0].script.type, 'text/javascript');
  assert.equal(exported.item[0].item[0].request.body.mode, 'formdata');
  assert.equal(exported.item[0].item[0].request.body.formdata[0].src, '/tmp/payload.json');
  assert.equal(exported.item[0].item[0].request.protocolProfileBehavior.disableBodyPruning, true);
  assert.equal(exported.item[0].item[0].response, undefined);
  assert.equal(exported.item[1].id, 'caller-postman-id');
  assert.equal(exported.variable[0].type, 'secret');
  assert.equal(exported.certificate[0].id, 'certificate-postman-id');
  assert.equal(exported.cookieDomainWhitelist[0], 'api.example.test');
  assert.equal(exported.vaultAccess.secrets[0].key, 'token');
  assert.equal(exported.visualizerAssets[0].name, 'chartjs');
});

test('imports the real-world Postman script compatibility corpus without losing obscure metadata', () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../fixtures/postman/real-world-import-corpus.collection.json'),
    'utf8'
  ));
  const collection = importPostmanCollection(fixture);
  const requests = [];
  walkRequests(collection, (request) => requests.push(request));
  const byName = new Map(requests.map((request) => [request.name, request]));
  const packageReferences = JSON.parse(collection.variables.find((variable) => variable.key === 'postman.packageReferences').value);

  assert.equal(collection.id, 'real-world-import-corpus');
  assert.equal(collection.postman.bindings.cookieDomainWhitelist[0], 'api.example.test');
  assert.equal(collection.postman.bindings.vaultAccess.secrets[0].key, 'apiToken');
  assert.equal(collection.postman.bindings.visualizerAssets[0].name, 'mini-chart');
  assert.equal(collection.certificates[0].id, 'mtls-certificate-id');
  assert.deepEqual(
    packageReferences.map((item) => item.specifier).sort(),
    ['@team/auth-tools', 'jsr:@scope/audit@1.0.0', 'npm:@scope/signing@1.0.0']
  );

  assert.match(byName.get('OAuth Token Bootstrap').scripts.preRequest, /pm\.vault\.get\('apiToken'\)/);
  assert.match(byName.get('OAuth Token Bootstrap').scripts.tests, /pm\.visualizer\.set/);
  assert.equal(byName.get('Cookie And Dynamic Variables').variables.some((variable) => variable.key === 'postman.cookies'), true);
  assert.equal(byName.get('GraphQL Account Lookup').protocol, 'graphql');
  assert.match(byName.get('GraphQL Account Lookup').scripts.beforeQuery, /X-GraphQL-Before/);
  assert.equal(byName.get('gRPC Stream Account Events').protocol, 'grpc');
  assert.equal(byName.get('gRPC Stream Account Events').methodPath, 'accounts.AccountService/StreamEvents');
  assert.equal(byName.get('Mock Account').scripts.mock, '');
  assert.match(collection.folders.find((folder) => folder.name === 'Local Mock Workflows').scripts.mock, /pm\.state\.increment/);
  assert.match(byName.get('RunRequest Caller').scripts.tests, /run-request-target-id/);
  assert.equal(byName.get('File Upload Binding').postman.fileReferences[0].src, '/Users/example/fixtures/upload.json');
  assert.equal(byName.get('Binary Body Binding').postman.fileReferences[0].src, '/Users/example/fixtures/blob.bin');

  const exported = exportPostmanCollection(collection);
  assert.equal(exported.info._postman_id, 'real-world-import-corpus');
  assert.equal(exported.cookieDomainWhitelist[1], '.example.test');
  assert.equal(exported.vaultAccess.secrets[1].key, 'clientSecret');
  assert.equal(exported.visualizerAssets[0].name, 'mini-chart');
  assert.equal(exported.certificate[0].id, 'mtls-certificate-id');
});

test('resolves imported Postman request IDs after workspace import regenerates model IDs', async () => {
  const collection = importCollectionFromContent(JSON.stringify({
    info: {
      name: 'RunRequest aliases',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _postman_id: 'collection-alias-id'
    },
    item: [{
      id: 'caller-postman-id',
      name: 'Caller',
      event: [{
        listen: 'prerequest',
        script: {
          exec: [
            "pm.test('caller keeps Postman info id', function () { pm.expect(pm.info.requestId).to.equal('caller-postman-id'); });",
            "pm.execution.runRequest('target-postman-id').then(function (response) {",
            "  pm.environment.set('runRequestStatus', String(response.code));",
            "  pm.execution.setNextRequest('target-postman-id');",
            "});"
          ]
        }
      }],
      request: { method: 'GET', url: 'https://api.example.test/caller' }
    }, {
      id: 'middle-postman-id',
      name: 'Middle',
      event: [{
        listen: 'test',
        script: { exec: ["pm.environment.set('middleVisited', 'yes');"] }
      }],
      request: { method: 'GET', url: 'https://api.example.test/middle' }
    }, {
      id: 'target-postman-id',
      name: 'Target',
      event: [{
        listen: 'test',
        script: { exec: ["pm.environment.set('targetVisited', pm.info.requestId);"] }
      }],
      request: { method: 'GET', url: 'https://api.example.test/target' }
    }]
  }));

  assert.notEqual(collection.requests[0].id, 'caller-postman-id');
  assert.equal(collection.requests[0].postman.ids.original, 'caller-postman-id');

  const result = await runCollection(collection, { id: 'env', name: 'Env', variables: [] }, {
    sendRequest: async (request) => ({
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ url: request.url }),
      durationMillis: 1,
      responseBytes: 2,
      finalUrl: request.url,
      updatedCookies: []
    })
  });

  const envValue = (name) => result.environment.variables.find((variable) => variable.key === name)?.value;
  assert.equal(envValue('runRequestStatus'), '200');
  assert.equal(envValue('targetVisited'), 'target-postman-id');
  assert.equal(envValue('middleVisited'), undefined);
  assert.equal(result.results.map((item) => item.requestName).join(','), 'Caller,Target');
  assert.equal(result.results[0].preRequestScriptResult.tests[0].passed, true);
});

test('preserves mixed Postman item order even when items have no exported IDs or names', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Nameless Order',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      item: [{
        request: {
          method: 'GET',
          url: 'https://api.example.test/folder-child'
        }
      }]
    }, {
      request: {
        method: 'GET',
        url: 'https://api.example.test/top-level'
      }
    }]
  });
  const exported = exportPostmanCollection(collection);

  assert.equal(exported.item[0].name, 'Imported Folder');
  assert.ok(Array.isArray(exported.item[0].item));
  assert.equal(exported.item[1].name, 'Imported Request');
});
