const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const test = require('node:test');
const { runCollection } = require('../../src/core/collectionRunner');
const { collectionModel, requestModel, walkRequests } = require('../../src/core/models');
const { findRequest, walkCollectionRequests } = require('../../src/renderer/collectionModel');
const { WorkspaceStore } = require('../../src/core/workspaceStore');

const LARGE_WORKSPACE_BUDGETS = Object.freeze({
  workspaceSaveMillis: 2500,
  workspaceLoadMillis: 2500,
  workspaceExportMillis: 2500,
  workspaceImportMillis: 2500,
  collectionExportMillis: 1500,
  collectionImportMillis: 1500,
  collectionSearchMillis: 100,
  collectionRunMillis: 5000
});

test('large workspace durability operations stay within explicit production budgets', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-large-workspace-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const workspaceExportPath = path.join(temp, 'workspace-export.postmeter.json');
  const collectionExportPath = path.join(temp, 'collection-export.json');
  const store = new WorkspaceStore(workspacePath);
  const workspace = largeWorkspaceFixture();

  const saved = await timed('workspace save', () => store.save(workspace), LARGE_WORKSPACE_BUDGETS.workspaceSaveMillis);
  assert.equal(saved.collections.length, 24);

  const loaded = await timed('workspace load', () => store.load(), LARGE_WORKSPACE_BUDGETS.workspaceLoadMillis);
  assert.equal(countWorkspaceRequests(loaded.workspace), 840);

  await timed('workspace export', () => store.exportWorkspace(loaded.workspace, workspaceExportPath), LARGE_WORKSPACE_BUDGETS.workspaceExportMillis);
  await timed('workspace import', () => store.importWorkspace(workspaceExportPath), LARGE_WORKSPACE_BUDGETS.workspaceImportMillis);

  const targetCollection = loaded.workspace.collections.at(-1);
  await timed('collection export', () => store.exportCollection(targetCollection, collectionExportPath), LARGE_WORKSPACE_BUDGETS.collectionExportMillis);
  const importedCollection = await timed('collection import', () => store.importCollection(collectionExportPath), LARGE_WORKSPACE_BUDGETS.collectionImportMillis);
  assert.equal(countCollectionRequests(importedCollection), 35);

  const lastFolder = targetCollection.folders.at(-1);
  const targetRequest = lastFolder.requests.at(-1);
  await timed('collection tree search', async () => {
    let walked = 0;
    walkCollectionRequests(targetCollection, () => {
      walked += 1;
    });
    assert.equal(walked, 35);
    assert.equal(findRequest(targetCollection, targetRequest.id).request.id, targetRequest.id);
  }, LARGE_WORKSPACE_BUDGETS.collectionSearchMillis);
});

test('large collection run setup and execution stay within the production budget', async () => {
  const collection = collectionModel({
    id: 'run-large',
    name: 'Large Runner',
    variables: [],
    requests: Array.from({ length: 180 }, (_unused, index) => requestModel({
      id: `runner-request-${index}`,
      name: `Runner Request ${index}`,
      method: 'GET',
      url: `https://api.example.test/items/${index}`
    })),
    folders: []
  });

  const result = await timed('collection run setup and execution', () => runCollection(collection, null, {
    sendRequest: async (request) => ({
      statusCode: 200,
      headers: {},
      body: `{"id":"${request.id}"}`,
      durationMillis: 1,
      responseBytes: 32,
      finalUrl: request.url
    })
  }), LARGE_WORKSPACE_BUDGETS.collectionRunMillis);

  assert.equal(result.totalRequests, 180);
  assert.equal(result.passed, true);
});

async function timed(label, operation, budgetMillis) {
  const started = performance.now();
  const result = await operation();
  const durationMillis = performance.now() - started;
  assert.ok(
    durationMillis <= budgetMillis,
    `${label} exceeded budget: ${durationMillis.toFixed(1)}ms > ${budgetMillis}ms`
  );
  return result;
}

function largeWorkspaceFixture() {
  return {
    schemaVersion: 11,
    collections: Array.from({ length: 24 }, (_unused, collectionIndex) => largeCollectionFixture(collectionIndex)),
    environments: Array.from({ length: 8 }, (_unused, index) => ({
      id: `environment-${index}`,
      name: `Environment ${index}`,
      variables: [{ enabled: true, key: 'baseUrl', value: `https://env-${index}.example.test` }]
    })),
    globals: [{ enabled: true, key: 'globalToken', value: 'durability-global' }],
    cookies: Array.from({ length: 40 }, (_unused, index) => ({
      id: `cookie-${index}`,
      enabled: true,
      name: `cookie_${index}`,
      value: `value-${index}`,
      domain: 'api.example.test',
      path: '/',
      secure: true,
      httpOnly: true
    })),
    history: Array.from({ length: 60 }, (_unused, index) => ({
      timestamp: new Date(0).toISOString(),
      method: 'GET',
      url: `https://history.example.test/${index}`,
      statusCode: 200,
      durationMillis: index
    })),
    settings: {
      appearance: { theme: 'system' },
      sandbox: {
        fileBindings: [],
        packageCache: [],
        trustedCapabilities: {
          sendRequest: true,
          cookies: true,
          vault: false,
          vaultGrants: {
            workspace: false,
            collections: [],
            requests: [],
            deniedCollections: [],
            deniedRequests: []
          }
        }
      },
      updates: { includePrereleases: false }
    }
  };
}

function largeCollectionFixture(collectionIndex) {
  return collectionModel({
    id: `collection-${collectionIndex}`,
    name: `Collection ${collectionIndex}`,
    variables: [{ enabled: true, key: 'collectionIndex', value: String(collectionIndex) }],
    requests: Array.from({ length: 5 }, (_unused, requestIndex) => largeRequestFixture(collectionIndex, 'root', requestIndex)),
    folders: Array.from({ length: 5 }, (_unused, folderIndex) => ({
      id: `collection-${collectionIndex}-folder-${folderIndex}`,
      name: `Folder ${collectionIndex}.${folderIndex}`,
      requests: Array.from({ length: 6 }, (_unused, requestIndex) => largeRequestFixture(collectionIndex, folderIndex, requestIndex)),
      folders: []
    }))
  });
}

function largeRequestFixture(collectionIndex, folderIndex, requestIndex) {
  return requestModel({
    id: `request-${collectionIndex}-${folderIndex}-${requestIndex}`,
    name: `Request ${collectionIndex}.${folderIndex}.${requestIndex}`,
    method: requestIndex % 2 === 0 ? 'GET' : 'POST',
    url: `https://api.example.test/${collectionIndex}/${folderIndex}/${requestIndex}`,
    headers: [{ enabled: true, key: 'Accept', value: 'application/json' }],
    queryParams: [{ enabled: true, key: 'page', value: String(requestIndex) }],
    bodyType: requestIndex % 2 === 0 ? 'NONE' : 'RAW_JSON',
    body: requestIndex % 2 === 0 ? '' : '{"ok":true}',
    scripts: { preRequest: '', tests: '' },
    docs: `Docs ${collectionIndex}.${folderIndex}.${requestIndex}`
  });
}

function countWorkspaceRequests(workspace) {
  let count = 0;
  for (const collection of workspace.collections || []) {
    walkRequests(collection, () => {
      count += 1;
    });
  }
  return count;
}

function countCollectionRequests(collection) {
  let count = 0;
  walkRequests(collection, () => {
    count += 1;
  });
  return count;
}
