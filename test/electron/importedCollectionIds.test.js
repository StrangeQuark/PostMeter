const assert = require('node:assert/strict');
const test = require('node:test');
const { regenerateCollectionIds } = require('../../src/core/importedCollectionIds');

test('imported collection id regeneration rewrites nested collection, folder, request, example, and certificate ids', () => {
  const collection = {
    id: 'collection-1',
    name: 'Imported',
    certificates: [{ id: 'certificate-1', name: 'Client Cert' }],
    requests: [{
      id: 'request-1',
      name: 'Top Request',
      examples: [{ id: 'example-1', name: 'Example' }]
    }],
    folders: [{
      id: 'folder-1',
      name: 'Folder',
      requests: [{
        id: 'request-2',
        name: 'Nested Request',
        examples: [{ id: 'example-2', name: 'Nested Example' }]
      }],
      folders: [{
        id: 'folder-2',
        name: 'Child Folder',
        requests: [{ id: 'request-3', name: 'Child Request' }],
        folders: []
      }]
    }]
  };

  regenerateCollectionIds(collection);

  assert.notEqual(collection.id, 'collection-1');
  assert.notEqual(collection.certificates[0].id, 'certificate-1');
  assert.notEqual(collection.requests[0].id, 'request-1');
  assert.notEqual(collection.requests[0].examples[0].id, 'example-1');
  assert.notEqual(collection.folders[0].id, 'folder-1');
  assert.notEqual(collection.folders[0].requests[0].id, 'request-2');
  assert.notEqual(collection.folders[0].requests[0].examples[0].id, 'example-2');
  assert.notEqual(collection.folders[0].folders[0].id, 'folder-2');
  assert.notEqual(collection.folders[0].folders[0].requests[0].id, 'request-3');
  assert.deepEqual(collection.folders[0].folders[0].requests[0].queryParams, []);
  assert.deepEqual(collection.folders[0].folders[0].folders, []);
});
