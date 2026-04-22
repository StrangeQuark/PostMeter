const assert = require('node:assert/strict');
const test = require('node:test');
const { importPostmanCollection } = require('../../src/core/postmanImporter');

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

  assert.equal(collection.requests[0].auth.type, 'bearer');
  assert.equal(collection.requests[0].auth.token, '{{collectionToken}}');
  assert.equal(collection.folders[0].requests[0].auth.type, 'basic');
  assert.equal(collection.folders[0].requests[0].auth.username, 'user');
  assert.equal(collection.requests[1].auth.type, 'apiKey');
  assert.equal(collection.requests[1].auth.location, 'query');
  assert.equal(collection.requests[1].headers.find((header) => header.key === 'Cookie').value, 'session=abc');
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
  assert.equal(collection.requests[1].variables.find((variable) => variable.key === 'requestScope').value, 'local');
  assert.equal(collection.requests[2].auth.type, 'oauth2');
  assert.equal(collection.requests[2].auth.grantType, 'clientCredentials');
  assert.equal(collection.requests[2].auth.tokenUrl, 'https://auth.example.test/token');
});

test('imports Postman examples and collection certificates', () => {
  const collection = importPostmanCollection({
    info: {
      name: 'Postman Examples',
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
  assert.equal(collection.requests[0].auth.certPath, '/tmp/client.crt');
  assert.equal(collection.requests[0].examples.length, 1);
  assert.equal(collection.requests[0].examples[0].statusCode, 200);
  assert.equal(collection.requests[0].examples[0].bodyType, 'RAW_JSON');
});
