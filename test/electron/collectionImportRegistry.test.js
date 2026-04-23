const assert = require('node:assert/strict');
const test = require('node:test');
const {
  exportCollectionByFormat,
  importCollectionFromContent
} = require('../../src/core/collectionImportRegistry');

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
    schemaVersion: 10,
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
