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
  assert.equal(collection.folders[0].requests[0].auth.type, 'basic');
  assert.equal(collection.folders[0].requests[0].auth.username, 'user');
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
              { key: 'algorithm', value: 'MD5' }
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
              { key: 'service', value: 'execute-api' }
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
              { key: 'domain', value: 'EXAMPLE' }
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
              { key: 'headersToSign', value: 'host;x-test' }
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
              { key: 'issuer', value: 'issuer' },
              { key: 'audience', value: 'audience' },
              { key: 'claims', value: '{"scope":"read"}' }
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
              { key: 'keyId', value: 'kid-1' }
            ]
          }
        }
      }
    ]
  });

  assert.equal(collection.requests[0].auth.type, 'digest');
  assert.equal(collection.requests[0].auth.username, 'ada');
  assert.equal(collection.requests[1].auth.type, 'aws');
  assert.equal(collection.requests[1].auth.service, 'execute-api');
  assert.equal(collection.requests[2].auth.type, 'ntlm');
  assert.equal(collection.requests[2].auth.domain, 'EXAMPLE');
  assert.equal(collection.requests[3].auth.type, 'akamaiEdgeGrid');
  assert.equal(collection.requests[3].auth.headersToSign, 'host;x-test');
  assert.equal(collection.requests[4].auth.type, 'jwtBearer');
  assert.equal(collection.requests[4].auth.issuer, 'issuer');
  assert.equal(collection.requests[5].auth.type, 'asap');
  assert.equal(collection.requests[5].auth.keyId, 'kid-1');

  const exported = exportPostmanCollection(collection);
  assert.equal(exported.item[0].request.auth.type, 'digest');
  assert.equal(exported.item[1].request.auth.type, 'awsv4');
  assert.equal(exported.item[2].request.auth.type, 'ntlm');
  assert.equal(exported.item[3].request.auth.type, 'akamaiEdgeGrid');
  assert.equal(exported.item[4].request.auth.type, 'jwt-bearer');
  assert.equal(exported.item[5].request.auth.type, 'asap');
});

test('imports Postman collection certificates without request examples', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Postman Certificates',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    certificate: [{
      name: 'mTLS cert',
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
  assert.equal(collection.certificates[0].certPath, '/tmp/client.crt');
  assert.equal(collection.requests[0].auth.type, 'clientCertificate');
  assert.equal(collection.requests[0].auth.certificateId, collection.certificates[0].id);
  assert.equal(collection.requests[0].auth.certPath, undefined);
  assert.equal(Object.hasOwn(collection.requests[0], 'examples'), false);
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
  assert.match(collection.requests[0].scripts.mock, /pm\.state\.increment/);
  assert.match(collection.requests[0].scripts.mock, /pm\.mock\.sendExample/);
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
  assert.equal(exported.item[0].variable[0].type, 'string');
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
  assert.match(byName.get('Mock Account').scripts.mock, /pm\.state\.increment/);
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
