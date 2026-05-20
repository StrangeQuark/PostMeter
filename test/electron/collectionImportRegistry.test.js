const assert = require('node:assert/strict');
const test = require('node:test');
const {
  exportCollectionByFormat,
  importCollectionFromContent
} = require('../../src/core/import-export/collectionImportRegistry');

test('collection import registry prefers native workspace imports before generic structured handlers', () => {
  const collection = importCollectionFromContent(JSON.stringify({
    schemaVersion: 6,
    info: {
      name: 'Looks Postman-ish',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'Ignored by native import precedence'
    }],
    collections: [{
      id: 'collection-1',
      name: 'Native Collection',
      description: '',
      requests: [{
        id: 'request-1',
        name: 'Native Request',
        method: 'GET',
        url: 'https://example.test'
      }],
      folders: []
    }],
    environments: [],
    history: []
  }));

  assert.equal(collection.name, 'Native Collection');
  assert.notEqual(collection.id, 'collection-1');
  assert.equal(collection.requests[0].name, 'Native Request');
});

test('collection import registry exports postmeter collections through the workspace wrapper', () => {
  const workspace = {
    schemaVersion: 11,
    settings: { appearance: { theme: 'system' }, updates: { includePrereleases: false } },
    collections: [{
      id: 'collection-1',
      name: 'Exported',
      description: '',
      requests: [],
      folders: [],
      variables: [],
      certificates: []
    }],
    environments: [],
    cookies: [],
    history: []
  };

  const serialized = exportCollectionByFormat(workspace.collections[0], 'postmeter', workspace);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.collections[0].name, 'Exported');
  assert.deepEqual(parsed.environments, []);
});

test('collection import registry exports Postman-compatible collections', () => {
  const collection = {
    id: 'collection-1',
    name: 'Postman Export',
    description: '',
    variables: [],
    certificates: [],
    requests: [{
      id: 'request-1',
      name: 'Request',
      method: 'GET',
      url: 'https://api.example.test',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      scripts: {
        preRequest: "pm.environment.set('x', '1');",
        tests: "pm.test('ok', function () {});"
      },
      variables: [],
      docs: ''
    }],
    folders: []
  };
  const serialized = exportCollectionByFormat(collection, 'postman', { collections: [collection], environments: [], history: [] });
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.equal(parsed.item[0].id, 'request-1');
  assert.equal(parsed.item[0].event[0].listen, 'prerequest');
  assert.equal(parsed.item[0].event[1].listen, 'test');
});

test('collection import and export preserve Postman request settings through registry models', () => {
  const postmanDocument = {
    info: {
      name: 'Request Settings Round Trip',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'All request settings',
      request: {
        method: 'GET',
        url: 'https://api.example.test/settings',
        protocolProfileBehavior: {
          disableBodyPruning: true,
          disableCookieJar: true,
          strictSSL: false,
          httpVersion: 'http2',
          followRedirects: false,
          followOriginalHttpMethod: true,
          followAuthorizationHeader: true,
          removeRefererHeaderOnRedirect: true,
          strictHttpParser: true,
          disableUrlEncoding: true,
          maxRedirects: 7,
          useServerCipherSuiteDuringHandshake: true,
          disabledTlsProtocols: ['TLSv1', 'TLSv1.1'],
          cipherSuiteSelection: 'AES128-SHA'
        }
      }
    }, {
      name: 'Default auto settings',
      request: {
        method: 'GET',
        url: 'https://api.example.test/defaults'
      }
    }, {
      name: 'Explicit HTTP1 settings',
      request: {
        method: 'GET',
        url: 'https://api.example.test/http1',
        protocolProfileBehavior: {
          httpVersion: 'http1'
        }
      }
    }]
  };

  const collection = importCollectionFromContent(JSON.stringify(postmanDocument));
  const importedAll = collection.requests.find((request) => request.name === 'All request settings');
  const importedDefaults = collection.requests.find((request) => request.name === 'Default auto settings');
  const importedHttp1 = collection.requests.find((request) => request.name === 'Explicit HTTP1 settings');

  assert.equal(importedAll.cookieJar.enabled, false);
  assert.deepEqual(importedAll.settings, {
    sslCertificateVerification: 'disabled',
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
  });
  assert.equal(importedDefaults.cookieJar.enabled, true);
  assert.equal(importedDefaults.settings.httpVersion, 'auto');
  assert.equal(importedDefaults.settings.followRedirects, true);
  assert.equal(importedDefaults.settings.encodeUrlAutomatically, true);
  assert.equal(importedHttp1.settings.httpVersion, 'http1');

  const exported = JSON.parse(exportCollectionByFormat(collection, 'postman', {
    collections: [collection],
    environments: [],
    history: []
  }));
  const exportedAll = exported.item.find((item) => item.name === 'All request settings').request.protocolProfileBehavior;
  const exportedDefaults = exported.item.find((item) => item.name === 'Default auto settings').request.protocolProfileBehavior;
  const exportedHttp1 = exported.item.find((item) => item.name === 'Explicit HTTP1 settings').request.protocolProfileBehavior;

  assert.equal(exportedAll.disableBodyPruning, true);
  assert.equal(exportedAll.disableCookieJar, true);
  assert.equal(exportedAll.strictSSL, false);
  assert.equal(exportedAll.httpVersion, 'http2');
  assert.equal(exportedAll.followRedirects, false);
  assert.equal(exportedAll.followOriginalHttpMethod, true);
  assert.equal(exportedAll.followAuthorizationHeader, true);
  assert.equal(exportedAll.removeRefererHeaderOnRedirect, true);
  assert.equal(exportedAll.strictHttpParser, true);
  assert.equal(exportedAll.disableUrlEncoding, true);
  assert.equal(exportedAll.maxRedirects, 7);
  assert.equal(exportedAll.useServerCipherSuiteDuringHandshake, true);
  assert.deepEqual(exportedAll.disabledTlsProtocols, ['TLSv1', 'TLSv1.1']);
  assert.equal(exportedAll.cipherSuiteSelection, 'AES128-SHA');
  assert.deepEqual(exportedDefaults, { strictHttpParser: true });
  assert.equal(exportedHttp1.httpVersion, 'http1');
});
