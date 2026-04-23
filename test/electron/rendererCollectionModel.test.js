const assert = require('node:assert/strict');
const test = require('node:test');
const {
  allFolderNames,
  allRequestNames,
  findFolder,
  findRequest,
  firstRequestInCollection,
  removeFolder,
  removeRequestFromCollection,
  uniqueName,
  walkCollectionRequests
} = require('../../src/renderer/collectionModel');

function nestedCollection() {
  return {
    requests: [{ id: 'root', name: 'Root' }],
    folders: [{
      id: 'f1',
      name: 'Folder 1',
      requests: [{ id: 'r1', name: 'Nested 1' }],
      folders: [{
        id: 'f2',
        name: 'Folder 2',
        requests: [{ id: 'r2', name: 'Nested 2' }],
        folders: []
      }]
    }]
  };
}

test('renderer collection model walks and finds nested requests and folders', () => {
  const collection = nestedCollection();
  const walked = [];

  walkCollectionRequests(collection, (request) => walked.push(request.id));

  assert.deepEqual(walked, ['root', 'r1', 'r2']);
  assert.equal(firstRequestInCollection(collection).request.id, 'root');
  assert.equal(findRequest(collection, 'r2').folder.id, 'f2');
  assert.equal(findFolder(collection, 'f2').name, 'Folder 2');
  assert.deepEqual(allRequestNames(collection), ['Root', 'Nested 1', 'Nested 2']);
  assert.deepEqual(allFolderNames(collection), ['Folder 1', 'Folder 2']);
});

test('renderer collection model removes nested items and generates unique names', () => {
  const collection = nestedCollection();

  assert.equal(removeRequestFromCollection(collection, 'r2'), true);
  assert.equal(findRequest(collection, 'r2'), null);
  assert.equal(removeFolder(collection, 'f2'), true);
  assert.equal(findFolder(collection, 'f2'), null);
  assert.equal(uniqueName('Request', ['Request', 'Request 2']), 'Request 3');
});
