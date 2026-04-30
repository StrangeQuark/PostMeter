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

function defaultLoadTestPolicy() {
  return {
    concurrency: 5,
    totalRequests: 25,
    durationSeconds: 0,
    rampUpSeconds: 0,
    targetRatePerSecond: 0,
    maxRatePerSecond: 0,
    executionMode: 'singleProcess',
    workerProcesses: 2,
    recordSamples: false
  };
}

test('creates a default schema 11 workspace when no file exists', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);

  const { workspace } = await store.load();

  assert.equal(store.getWorkspacePath(), workspacePath);
  assert.equal(workspace.schemaVersion, 11);
  assert.deepEqual(workspace.settings, {
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
  });
  assert.deepEqual(workspace.collections, []);
  assert.deepEqual(workspace.environments, []);
  assert.deepEqual(workspace.cookies, []);
  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).schemaVersion, 11);
  assert.equal(Object.hasOwn(JSON.parse(await fs.readFile(workspacePath, 'utf8')), 'name'), false);
});

test('migrates schema 2 workspaces to schema 11 and creates a backup', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  await fs.writeFile(workspacePath, JSON.stringify({
    schemaVersion: 2,
    collections: [{ id: 'c1', name: 'Old', description: '', requests: [{ id: 'r1', name: 'Old Request', method: 'GET', url: 'https://example.test' }] }],
    environments: [],
    history: []
  }));

  const store = new WorkspaceStore(workspacePath);
  const { workspace } = await store.load();
  const backups = (await fs.readdir(temp)).filter((entry) => entry.includes('pre-migration.backup'));

  assert.equal(workspace.schemaVersion, 11);
  assert.equal(workspace.settings.updates.includePrereleases, false);
  assert.equal(workspace.settings.appearance.theme, 'system');
  assert.equal(workspace.settings.loadTestPolicy, undefined);
  assert.deepEqual(workspace.cookies, []);
  assert.deepEqual(workspace.collections[0].folders, []);
  assert.deepEqual(workspace.collections[0].variables, []);
  assert.deepEqual(workspace.collections[0].certificates, []);
  assert.equal(workspace.collections[0].requests.length, 1);
  assert.deepEqual(workspace.collections[0].requests[0].scripts, {
    preRequest: '',
    tests: '',
    beforeQuery: '',
    afterResponse: '',
    beforeInvoke: '',
    onMessage: '',
    onIncomingMessage: '',
    mock: ''
  });
  assert.deepEqual(workspace.collections[0].requests[0].variables, []);
  assert.deepEqual(workspace.collections[0].requests[0].examples, []);
  assert.deepEqual(workspace.collections[0].requests[0].cookieJar, { enabled: false, storeResponses: true });
  assert.deepEqual(workspace.collections[0].requests[0].loadTestPolicy, { enabled: false, ...defaultLoadTestPolicy() });
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
      assert.equal(error.recoveredWorkspace.schemaVersion, 11);
      assert.ok(error.recoveredPath.includes('corrupt'));
      return true;
    }
  );

  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).schemaVersion, 11);
  const quarantined = (await fs.readdir(temp)).filter((entry) => entry.includes('corrupt'));
  assert.equal(quarantined.length, 1);
});

test('preserves an intentionally empty collection list on save and reload', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);

  await store.save({
    schemaVersion: 11,
    settings: { appearance: { theme: 'dark' }, updates: { includePrereleases: true }, loadTestPolicy: { concurrency: 42 } },
    collections: [],
    environments: [],
    cookies: [],
    history: []
  });

  const { workspace } = await store.load();
  assert.equal(workspace.schemaVersion, 11);
  assert.equal(workspace.settings.updates.includePrereleases, true);
  assert.equal(workspace.settings.appearance.theme, 'dark');
  assert.equal(workspace.settings.loadTestPolicy, undefined);
  assert.deepEqual(workspace.collections, []);
  assert.deepEqual(workspace.cookies, []);
});

test('imports native collection exports and Postman collections without confusing formats', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const store = new WorkspaceStore(path.join(temp, 'workspace.json'));

  const nativePath = path.join(temp, 'native.json');
  await fs.writeFile(nativePath, JSON.stringify({
    schemaVersion: 6,
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
    variable: [
      { key: 'baseUrl', value: 'https://api.example.test' },
      { key: 'token', value: 'collection-token', type: 'string' }
    ],
    event: [{
      listen: 'prerequest',
      script: { exec: ["pm.collectionVariables.set('fromCollection', 'yes');"] }
    }],
    item: [{
      name: 'Folder A',
      event: [{
        listen: 'test',
        script: { exec: ["pm.test('folder test', function () { pm.expect(pm.response.code).to.equal(200); });"] }
      }],
      item: [{
        name: 'Folder B',
        item: [{
          name: 'Nested Request',
          event: [{
            listen: 'test',
            script: { exec: "pm.test('request test', function () { pm.expect(pm.response.json().ok).to.eql(true); });" }
          }],
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
  assert.equal(postman.variables.length, 2);
  assert.equal(postman.variables[0].key, 'baseUrl');
  assert.equal(postman.folders[0].name, 'Folder A');
  const nestedRequest = postman.folders[0].folders[0].requests[0];
  assert.equal(nestedRequest.name, 'Nested Request');
  assert.equal(nestedRequest.bodyType, 'RAW_JSON');
  assert.equal(nestedRequest.queryParams.length, 2);
  assert.match(nestedRequest.scripts.preRequest, /fromCollection/);
  assert.match(nestedRequest.scripts.tests, /folder test/);
  assert.match(nestedRequest.scripts.tests, /request test/);

  const openApiYamlPath = path.join(temp, 'openapi.yaml');
  await fs.writeFile(openApiYamlPath, [
    'openapi: 3.0.0',
    'info:',
    '  title: YAML API',
    '  version: 1.0.0',
    'servers:',
    `  - url: https://yaml.example.test`,
    'paths:',
    '  /widgets:',
    '    get:',
    '      operationId: listWidgets',
    '      responses:',
    '        "200":',
    '          description: OK'
  ].join('\n'));
  const openApiYaml = await store.importCollection(openApiYamlPath);
  assert.equal(openApiYaml.name, 'YAML API');
  assert.equal(openApiYaml.requests[0].url, 'https://yaml.example.test/widgets');
});

test('rejects workspace import when the file is not a native PostMeter workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const store = new WorkspaceStore(path.join(temp, 'workspace.json'));
  const postmanPath = path.join(temp, 'postman.json');
  await fs.writeFile(postmanPath, JSON.stringify({
    info: {
      name: 'Postman Collection',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: []
  }));

  await assert.rejects(
    () => store.importWorkspace(postmanPath),
    /Selected file is not a native PostMeter workspace\./
  );
});

test('detects native workspace shape explicitly', () => {
  assert.equal(looksLikeNativeWorkspace({ schemaVersion: 6 }), true);
  assert.equal(looksLikeNativeWorkspace({ collections: [] }), true);
  assert.equal(looksLikeNativeWorkspace({ info: {}, item: [] }), false);
});

test('persists and exports workspace values as plain JSON', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const exportPath = path.join(temp, 'export.json');
  const store = new WorkspaceStore(workspacePath);
  const workspace = {
    schemaVersion: 6,
    name: 'Legacy Workspace Name',
    collections: [{
      id: 'c1',
      name: 'Secrets',
      description: '',
      certificates: [{
        id: 'cert1',
        name: 'Client Cert',
        matches: ['https://example.test/*'],
        certPath: '/tmp/client.crt',
        keyPath: '/tmp/client.key',
        passphrase: 'cert-secret'
      }],
      variables: [
        { enabled: true, key: 'collectionToken', value: 'secret-collection-value' },
        { enabled: true, key: 'collectionBase', value: 'https://collection.example.test' }
      ],
      requests: [{
        id: 'r1',
        name: 'Auth',
        method: 'GET',
        url: 'https://example.test',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        variables: [{ enabled: true, key: 'requestSecret', value: 'secret-request-value' }],
        auth: { type: 'bearer', token: 'saved-token' }
      }],
      folders: []
    }],
    environments: [{
      id: 'e1',
      name: 'Env',
      variables: [
        { enabled: true, key: 'apiKey', value: 'secret-env-value' },
        { enabled: true, key: 'baseUrl', value: 'https://example.test' }
      ]
    }],
    cookies: [{
      id: 'cookie1',
      enabled: true,
      name: 'sid',
      value: 'secret-cookie-value',
      domain: 'example.test',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      hostOnly: true,
      priority: 'High',
      partitioned: true,
      source: 'postman',
      extensions: ['SameParty']
    }],
    history: []
  };

  await store.save(workspace);
  const raw = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
  assert.equal(Object.hasOwn(raw, 'name'), false);
  assert.equal(raw.collections[0].variables[0].value, 'secret-collection-value');
  assert.equal(raw.collections[0].certificates[0].passphrase, 'cert-secret');
  assert.equal(raw.collections[0].variables[1].value, 'https://collection.example.test');
  assert.equal(raw.collections[0].requests[0].variables[0].value, 'secret-request-value');
  assert.equal(raw.collections[0].requests[0].auth.token, 'saved-token');
  assert.equal(raw.environments[0].variables[0].value, 'secret-env-value');
  assert.equal(raw.cookies[0].value, 'secret-cookie-value');
  assert.equal(raw.environments[0].variables[1].value, 'https://example.test');

  const loaded = await store.load();
  assert.equal(Object.hasOwn(loaded.workspace, 'name'), false);
  assert.equal(loaded.workspace.collections[0].variables[0].value, 'secret-collection-value');
  assert.equal(loaded.workspace.collections[0].certificates[0].passphrase, 'cert-secret');
  assert.equal(loaded.workspace.collections[0].requests[0].variables[0].value, 'secret-request-value');
  assert.equal(loaded.workspace.collections[0].requests[0].auth.token, 'saved-token');
  assert.equal(loaded.workspace.environments[0].variables[0].value, 'secret-env-value');
  assert.equal(loaded.workspace.cookies[0].value, 'secret-cookie-value');
  assert.equal(loaded.workspace.cookies[0].priority, 'High');
  assert.equal(loaded.workspace.cookies[0].partitioned, true);
  assert.equal(loaded.workspace.cookies[0].source, 'postman');
  assert.deepEqual(loaded.workspace.cookies[0].extensions, ['SameParty']);

  await store.exportWorkspace(loaded.workspace, exportPath);
  const exported = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  assert.equal(Object.hasOwn(exported, 'name'), false);
  assert.equal(exported.collections[0].variables[0].value, 'secret-collection-value');
  assert.equal(exported.collections[0].certificates[0].passphrase, 'cert-secret');
  assert.equal(exported.collections[0].variables[1].value, 'https://collection.example.test');
  assert.equal(exported.collections[0].requests[0].variables[0].value, 'secret-request-value');
  assert.equal(exported.collections[0].requests[0].auth.token, 'saved-token');
  assert.equal(exported.environments[0].variables[0].value, 'secret-env-value');
  assert.equal(exported.cookies[0].value, 'secret-cookie-value');
  assert.equal(exported.cookies[0].priority, 'High');
  assert.equal(exported.cookies[0].source, 'postman');
  assert.equal(exported.environments[0].variables[1].value, 'https://example.test');
});

test('excludes local vault plaintext and ciphertext from workspace save and export', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-vault-export-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const exportPath = path.join(temp, 'workspace-export.json');
  const store = new WorkspaceStore(workspacePath);
  const workspace = {
    schemaVersion: 11,
    settings: {
      sandbox: {
        trustedCapabilities: {
          sendRequest: true,
          cookies: true,
          vault: false,
          vaultGrants: {
            workspace: false,
            collections: ['collection-1'],
            requests: ['request-1'],
            deniedCollections: ['collection-denied'],
            deniedRequests: ['request-denied']
          }
        }
      }
    },
    collections: [],
    environments: [],
    cookies: [],
    history: [],
    vault: {
      secrets: [{ key: 'apiToken', value: 'vault-plaintext-secret' }],
      entries: [{ key: 'apiToken', ciphertext: 'vault-ciphertext-secret' }]
    }
  };

  const saved = await store.save(workspace);
  const rawText = await fs.readFile(workspacePath, 'utf8');
  assert.equal(rawText.includes('vault-plaintext-secret'), false);
  assert.equal(rawText.includes('vault-ciphertext-secret'), false);
  assert.equal(Object.hasOwn(JSON.parse(rawText), 'vault'), false);
  assert.deepEqual(saved.settings.sandbox.trustedCapabilities.vaultGrants, {
    workspace: false,
    collections: ['collection-1'],
    requests: ['request-1'],
    deniedCollections: ['collection-denied'],
    deniedRequests: ['request-denied']
  });

  await store.exportWorkspace({ ...saved, vault: workspace.vault }, exportPath);
  const exportedText = await fs.readFile(exportPath, 'utf8');
  assert.equal(exportedText.includes('vault-plaintext-secret'), false);
  assert.equal(exportedText.includes('vault-ciphertext-secret'), false);
  assert.equal(Object.hasOwn(JSON.parse(exportedText), 'vault'), false);
});
