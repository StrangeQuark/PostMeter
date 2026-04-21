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
const { isSecretWrapper } = require('../../src/core/secrets');

const fakeSecretCodec = {
  name: 'fake',
  encrypt(value) {
    return { codec: 'fake', value: Buffer.from(value, 'utf8').toString('base64') };
  },
  decrypt(value, codec) {
    assert.equal(codec, 'fake');
    return Buffer.from(value, 'base64').toString('utf8');
  }
};

test('creates a default schema 4 workspace when no file exists', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);

  const { workspace } = await store.load();

  assert.equal(store.getWorkspacePath(), workspacePath);
  assert.equal(workspace.schemaVersion, 4);
  assert.deepEqual(workspace.collections, []);
  assert.deepEqual(workspace.environments, []);
  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).schemaVersion, 4);
});

test('migrates schema 2 workspaces to schema 4 and creates a backup', async () => {
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

  assert.equal(workspace.schemaVersion, 4);
  assert.deepEqual(workspace.collections[0].folders, []);
  assert.equal(workspace.collections[0].requests.length, 0);
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
      assert.equal(error.recoveredWorkspace.schemaVersion, 4);
      assert.ok(error.recoveredPath.includes('corrupt'));
      return true;
    }
  );

  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).schemaVersion, 4);
  const quarantined = (await fs.readdir(temp)).filter((entry) => entry.includes('corrupt'));
  assert.equal(quarantined.length, 1);
});

test('preserves an intentionally empty collection list on save and reload', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);

  await store.save({
    schemaVersion: 4,
    collections: [],
    environments: [],
    history: []
  });

  const { workspace } = await store.load();
  assert.equal(workspace.schemaVersion, 4);
  assert.deepEqual(workspace.collections, []);
});

test('imports native collection exports and Postman collections without confusing formats', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const store = new WorkspaceStore(path.join(temp, 'workspace.json'));

  const nativePath = path.join(temp, 'native.json');
  await fs.writeFile(nativePath, JSON.stringify({
    schemaVersion: 4,
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
  assert.equal(looksLikeNativeWorkspace({ schemaVersion: 4 }), true);
  assert.equal(looksLikeNativeWorkspace({ collections: [] }), true);
  assert.equal(looksLikeNativeWorkspace({ info: {}, item: [] }), false);
});

test('encrypts local secrets and redacts exports unless exact values are allowed', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const exportPath = path.join(temp, 'export.json');
  const exactExportPath = path.join(temp, 'exact-export.json');
  const store = new WorkspaceStore(workspacePath, { secretCodec: fakeSecretCodec });
  const workspace = {
    schemaVersion: 4,
    collections: [{
      id: 'c1',
      name: 'Secrets',
      description: '',
      requests: [{
        id: 'r1',
        name: 'Auth',
        method: 'GET',
        url: 'https://example.test',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: { type: 'bearer', token: 'saved-token' }
      }],
      folders: []
    }],
    environments: [{
      id: 'e1',
      name: 'Env',
      variables: [
        { enabled: true, key: 'apiKey', value: 'secret-env-value', secret: true },
        { enabled: true, key: 'baseUrl', value: 'https://example.test', secret: false }
      ]
    }],
    history: []
  };

  await store.save(workspace);
  const raw = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
  assert.equal(isSecretWrapper(raw.collections[0].requests[0].auth.token), true);
  assert.equal(isSecretWrapper(raw.environments[0].variables[0].value), true);
  assert.equal(raw.environments[0].variables[1].value, 'https://example.test');

  const loaded = await store.load();
  assert.equal(loaded.workspace.collections[0].requests[0].auth.token, 'saved-token');
  assert.equal(loaded.workspace.environments[0].variables[0].value, 'secret-env-value');

  await store.exportWorkspace(loaded.workspace, exportPath);
  const redacted = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  assert.equal(redacted.collections[0].requests[0].auth.token, '<redacted>');
  assert.equal(redacted.environments[0].variables[0].value, '<redacted>');
  assert.equal(redacted.environments[0].variables[1].value, 'https://example.test');

  await store.exportWorkspace(loaded.workspace, exactExportPath, { includeSecrets: true });
  const exact = JSON.parse(await fs.readFile(exactExportPath, 'utf8'));
  assert.equal(exact.collections[0].requests[0].auth.token, 'saved-token');
  assert.equal(exact.environments[0].variables[0].value, 'secret-env-value');
});
