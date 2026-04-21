const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  WorkspaceRecoveryError,
  WorkspaceStore,
  looksLikeNativeWorkspace
} = require('../../src/core/workspaceStore');

test('creates a default schema 3 workspace when no file exists', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);

  const { workspace } = await store.load();

  assert.equal(store.getWorkspacePath(), workspacePath);
  assert.equal(workspace.schemaVersion, 3);
  assert.equal(workspace.collections.length, 1);
  assert.equal(workspace.collections[0].folders.length, 0);
  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).schemaVersion, 3);
});

test('migrates schema 2 workspaces to schema 3 and creates a backup', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  await fs.writeFile(workspacePath, JSON.stringify({
    schemaVersion: 2,
    collections: [{ id: 'c1', name: 'Old', description: '', requests: [] }],
    environments: [],
    history: []
  }));

  const store = new WorkspaceStore(workspacePath);
  const { workspace } = await store.load();
  const backups = (await fs.readdir(temp)).filter((entry) => entry.includes('pre-migration.backup'));

  assert.equal(workspace.schemaVersion, 3);
  assert.deepEqual(workspace.collections[0].folders, []);
  assert.equal(backups.length, 1);
});

test('quarantines unreadable workspace JSON and recovers a default workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  await fs.writeFile(workspacePath, '{not-json');

  const store = new WorkspaceStore(workspacePath);
  await assert.rejects(
    () => store.load(),
    (error) => {
      assert.ok(error instanceof WorkspaceRecoveryError);
      assert.equal(error.recoveredWorkspace.schemaVersion, 3);
      assert.ok(error.recoveredPath.includes('corrupt'));
      return true;
    }
  );

  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).schemaVersion, 3);
  const quarantined = (await fs.readdir(temp)).filter((entry) => entry.includes('corrupt'));
  assert.equal(quarantined.length, 1);
});

test('imports native collection exports and Postman collections without confusing formats', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const store = new WorkspaceStore(path.join(temp, 'workspace.json'));

  const nativePath = path.join(temp, 'native.json');
  await fs.writeFile(nativePath, JSON.stringify({
    schemaVersion: 3,
    collections: [{
      id: 'native',
      name: 'Native',
      description: '',
      requests: [{ id: 'r1', name: 'Saved', method: 'GET', url: 'https://example.test', queryParams: [], headers: [], bodyType: 'NONE', body: '' }],
      folders: []
    }],
    environments: [],
    history: []
  }));

  const native = await store.importCollection(nativePath);
  assert.equal(native.name, 'Native');
  assert.notEqual(native.id, 'native');
  assert.equal(native.requests[0].name, 'Saved');

  const postmanPath = path.join(temp, 'postman.json');
  await fs.writeFile(postmanPath, JSON.stringify({
    info: {
      name: 'Postman Nested',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [{
      name: 'Folder A',
      item: [{
        name: 'Folder B',
        item: [{
          name: 'Nested Request',
          request: {
            method: 'POST',
            url: {
              raw: 'https://api.example.test/widgets?from=raw',
              query: [{ key: 'enabled', value: 'yes' }, { key: 'off', value: 'no', disabled: true }]
            },
            header: [{ key: 'Accept', value: 'application/json' }],
            body: { mode: 'raw', raw: '{"ok":true}', options: { raw: { language: 'json' } } }
          }
        }]
      }]
    }]
  }));

  const postman = await store.importCollection(postmanPath);
  assert.equal(postman.name, 'Postman Nested');
  assert.equal(postman.requests.length, 0);
  assert.equal(postman.folders[0].name, 'Folder A');
  assert.equal(postman.folders[0].folders[0].requests[0].name, 'Nested Request');
  assert.equal(postman.folders[0].folders[0].requests[0].bodyType, 'RAW_JSON');
  assert.equal(postman.folders[0].folders[0].requests[0].queryParams.length, 2);
});

test('detects native workspace shape explicitly', () => {
  assert.equal(looksLikeNativeWorkspace({ schemaVersion: 3 }), true);
  assert.equal(looksLikeNativeWorkspace({ collections: [] }), true);
  assert.equal(looksLikeNativeWorkspace({ info: {}, item: [] }), false);
});
