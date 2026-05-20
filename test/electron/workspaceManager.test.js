const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CURRENT_SCHEMA_VERSION } = require('../../src/core/workspace/models');
const { WorkspaceManager } = require('../../src/core/workspace/workspaceManager');
const { WorkspaceRecoveryError } = require('../../src/core/workspace/workspaceStore');
const { isEncryptedWorkspaceEnvelope } = require('../../src/core/workspace/workspaceEncryption');

test('workspace manager creates and describes a default managed workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  const loaded = await manager.load();

  assert.equal(loaded.path, path.join(temp, 'Local Workspace.json'));
  assert.equal(loaded.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(loaded.workspaces.length, 1);
  assert.equal(loaded.workspaces[0].id, 'Local Workspace.json');
  assert.equal(loaded.workspaces[0].path, path.join(temp, 'Local Workspace.json'));
  assert.equal(loaded.workspaces[0].current, true);
  assert.equal(loaded.workspaces[0].deletable, false);
  assert.equal(loaded.workspaces[0].name, 'Local Workspace');
  assert.equal(loaded.workspaces[0].collectionCount, 0);
  assert.equal(loaded.workspaces[0].requestCount, 0);
  assert.equal(loaded.workspaces[0].runnerCount, 0);
  assert.equal(loaded.workspace.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('workspace manager default creation allocates around unrecognized existing workspace files', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-default-collision-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const unrecognizedPath = path.join(temp, 'Local Workspace.json');
  await fs.writeFile(unrecognizedPath, '{not-managed-json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  const loaded = await manager.load();

  assert.equal(loaded.path, path.join(temp, 'Local Workspace 2.json'));
  assert.equal(loaded.activeWorkspaceId, 'Local Workspace 2.json');
  assert.equal(loaded.workspaces.length, 1);
  assert.equal(loaded.workspaces[0].id, 'Local Workspace 2.json');
  assert.equal(await fs.readFile(unrecognizedPath, 'utf8'), '{not-managed-json');
  assert.equal(JSON.parse(await fs.readFile(path.join(temp, 'Local Workspace 2.json'), 'utf8')).schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('workspace manager creates, switches, and deletes managed workspaces', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  const loaded = await manager.load();
  const createdWorkspaceId = await manager.createWorkspace();
  assert.equal(createdWorkspaceId, 'Workspace.json');
  const afterCreate = await manager.describeCurrent(loaded.workspace);
  assert.equal(afterCreate.workspaces.length, 2);
  assert.equal(afterCreate.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(afterCreate.path, path.join(temp, 'Local Workspace.json'));

  const switchedToCreated = await manager.switchWorkspace(createdWorkspaceId);
  switchedToCreated.workspace.collections.push({
    id: 'collection-1',
    name: 'Collection',
    description: '',
    variables: [],
    certificates: [],
    requests: [],
    folders: []
  });
  await manager.save(switchedToCreated.workspace);

  const switched = await manager.switchWorkspace('Local Workspace.json');
  assert.equal(switched.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(switched.workspaces.length, 2);
  assert.equal(switched.path, path.join(temp, 'Local Workspace.json'));
  assert.deepEqual(switched.workspace.collections, []);
  const switchedWorkspaceItem = switched.workspaces.find((item) => item.id === 'Workspace.json');
  assert.equal(switchedWorkspaceItem.collectionCount, 1);
  assert.equal(switchedWorkspaceItem.requestCount, 0);
  assert.equal(switchedWorkspaceItem.runnerCount, 0);

  const deleted = await manager.deleteWorkspace('Workspace.json');
  assert.equal(deleted.deletedWorkspaceId, 'Workspace.json');
  assert.equal(deleted.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(deleted.workspaces.length, 1);
  assert.equal(deleted.workspaces[0].deletable, false);
  await assert.rejects(() => fs.access(path.join(temp, 'Workspace.json')));
});

test('workspace manager discovers, unlocks, exports, duplicates, and imports encrypted workspaces without plaintext export', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-encrypted-'));
  const importTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-encrypted-import-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  const loaded = await manager.load();
  loaded.workspace.collections.push({
    id: 'collection-1',
    name: 'PII Collection',
    description: '',
    variables: [],
    certificates: [],
    requests: [{ id: 'request-1', name: 'SSN Request', method: 'POST', url: 'https://example.test/123-45-6789' }],
    folders: []
  });
  await manager.encryptWorkspace(loaded.activeWorkspaceId, loaded.workspace, 'secret1');
  const encryptedText = await fs.readFile(loaded.path, 'utf8');
  assert.equal(isEncryptedWorkspaceEnvelope(JSON.parse(encryptedText)), true);
  assert.doesNotMatch(encryptedText, /SSN Request|123-45-6789/);

  const lockedManager = new WorkspaceManager(preferredWorkspacePath);
  const locked = await lockedManager.load({ preferredWorkspaceId: loaded.activeWorkspaceId });
  assert.equal(locked.locked, true);
  assert.equal(locked.encrypted, true);
  assert.equal(locked.workspaces[0].encrypted, true);
  assert.equal(locked.workspaces[0].locked, true);
  assert.equal(locked.workspaces[0].requestCount, 0);

  const unlocked = await lockedManager.unlockWorkspace(loaded.activeWorkspaceId, 'secret1');
  assert.equal(unlocked.locked, false);
  assert.equal(unlocked.workspaces[0].requestCount, 1);
  unlocked.workspace.collections[0].requests[0].name = 'Updated SSN Request';
  await lockedManager.save(unlocked.workspace);
  const savedEncryptedText = await fs.readFile(loaded.path, 'utf8');
  assert.equal(isEncryptedWorkspaceEnvelope(JSON.parse(savedEncryptedText)), true);
  assert.doesNotMatch(savedEncryptedText, /Updated SSN Request|123-45-6789/);

  const exportPath = path.join(temp, 'encrypted-export.json');
  await lockedManager.exportWorkspaceById(loaded.activeWorkspaceId, exportPath);
  assert.equal(isEncryptedWorkspaceEnvelope(JSON.parse(await fs.readFile(exportPath, 'utf8'))), true);
  assert.doesNotMatch(await fs.readFile(exportPath, 'utf8'), /Updated SSN Request|123-45-6789/);

  const duplicateId = await lockedManager.duplicateWorkspace(loaded.activeWorkspaceId);
  assert.equal(isEncryptedWorkspaceEnvelope(JSON.parse(await fs.readFile(path.join(temp, duplicateId), 'utf8'))), true);

  const importPath = path.join(importTemp, 'Shared.postmeter.json');
  await fs.writeFile(importPath, await fs.readFile(exportPath, 'utf8'));
  const importedId = await lockedManager.importWorkspace(importPath);
  const importedText = await fs.readFile(path.join(temp, importedId), 'utf8');
  assert.equal(isEncryptedWorkspaceEnvelope(JSON.parse(importedText)), true);
});

test('workspace manager can snapshot and restore a deleted managed workspace for rollback', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-rollback-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await manager.load();
  const createdWorkspaceId = await manager.createWorkspace();
  const created = await manager.switchWorkspace(createdWorkspaceId);
  created.workspace.collections.push({
    id: 'collection-1',
    name: 'Rollback Collection',
    description: '',
    variables: [],
    certificates: [],
    requests: [],
    folders: []
  });
  await manager.save(created.workspace);

  const snapshot = await manager.loadWorkspaceById(createdWorkspaceId);
  await manager.deleteWorkspace(createdWorkspaceId);
  await assert.rejects(() => fs.access(path.join(temp, createdWorkspaceId)));

  const restored = await manager.restoreWorkspaceFile(createdWorkspaceId, snapshot, {
    currentWorkspaceId: createdWorkspaceId
  });

  assert.equal(restored.activeWorkspaceId, createdWorkspaceId);
  assert.equal(restored.path, path.join(temp, createdWorkspaceId));
  assert.equal(restored.workspace.collections[0].name, 'Rollback Collection');
  await fs.access(path.join(temp, createdWorkspaceId));
});

test('workspace manager renames managed workspaces using the filename as the canonical name', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await manager.load();
  const createdWorkspaceId = await manager.createWorkspace();
  const created = await manager.switchWorkspace(createdWorkspaceId);
  created.workspace.collections.push({
    id: 'collection-1',
    name: 'Collection',
    description: '',
    variables: [],
    certificates: [],
    requests: [],
    folders: []
  });
  await manager.save(created.workspace);

  const renamed = await manager.renameWorkspace('Workspace.json', 'Renamed Workspace');

  assert.equal(renamed.renamedWorkspaceId, 'Renamed Workspace.json');
  assert.equal(renamed.activeWorkspaceId, 'Renamed Workspace.json');
  assert.equal(renamed.path, path.join(temp, 'Renamed Workspace.json'));
  assert.equal(renamed.workspaces.find((item) => item.current)?.name, 'Renamed Workspace');
  assert.equal(renamed.workspace.collections.length, 1);
  await assert.rejects(() => fs.access(path.join(temp, 'Workspace.json')));
  await fs.access(path.join(temp, 'Renamed Workspace.json'));
});

test('workspace manager case-only renames recover through a temporary file without orphaning workspaces', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-rename-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await manager.load();
  const createdWorkspaceId = await manager.createWorkspace();
  assert.equal(createdWorkspaceId, 'Workspace.json');

  const renamed = await manager.renameWorkspace('Workspace.json', 'workspace');

  assert.equal(renamed.renamedWorkspaceId, 'workspace.json');
  assert.equal(renamed.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(renamed.workspaces.some((item) => item.id === 'workspace.json'), true);
  await fs.access(path.join(temp, 'workspace.json'));
  const entries = await fs.readdir(temp);
  assert.equal(entries.includes('workspace.json'), true);
  assert.equal(entries.includes('Workspace.json'), false);
  const tempFiles = entries.filter((entry) => entry.includes('postmeter-workspace-rename'));
  assert.deepEqual(tempFiles, []);
});

test('workspace manager imports a workspace into the managed set without replacing the current workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const importTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-import-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const importPath = path.join(importTemp, 'Imported Workspace.postmeter.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  const loaded = await manager.load();
  await fs.writeFile(importPath, JSON.stringify({
    schemaVersion: 11,
    collections: [{
      id: 'collection-1',
      name: 'Imported Collection',
      description: '',
      variables: [],
      certificates: [],
      requests: [{ id: 'request-1', name: 'Imported Request', method: 'GET', url: 'https://example.com' }],
      folders: []
    }],
    runners: [{ id: 'runner-1', name: 'Imported Runner', environmentId: 'none', requests: [] }],
    environments: [],
    cookies: [],
    history: [],
    settings: { appearance: { theme: 'system' }, updates: { includePrereleases: false } }
  }));

  const importedWorkspaceId = await manager.importWorkspace(importPath);
  const described = await manager.describeCurrent(loaded.workspace);

  assert.equal(importedWorkspaceId, 'Imported Workspace.json');
  assert.equal(described.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(described.workspace.collections.length, 0);
  assert.equal(described.workspaces.length, 2);
  const importedWorkspaceItem = described.workspaces.find((item) => item.id === importedWorkspaceId);
  assert.equal(importedWorkspaceItem?.name, 'Imported Workspace');
  assert.equal(importedWorkspaceItem?.collectionCount, 1);
  assert.equal(importedWorkspaceItem?.requestCount, 1);
  assert.equal(importedWorkspaceItem?.runnerCount, 1);
  await fs.access(path.join(temp, importedWorkspaceId));

  const switched = await manager.switchWorkspace(importedWorkspaceId);
  assert.equal(switched.activeWorkspaceId, importedWorkspaceId);
  assert.equal(switched.workspace.collections.length, 1);
  assert.equal(switched.workspace.collections[0].name, 'Imported Collection');
});

test('workspace manager allocates filenames around unrecognized existing workspace files', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-collision-'));
  const importTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-import-collision-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const importPath = path.join(importTemp, 'Imported Workspace.postmeter.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await manager.load();
  await fs.writeFile(path.join(temp, 'Workspace.json'), '{not-managed-json');
  await fs.writeFile(path.join(temp, 'Imported Workspace.json'), '{not-managed-import-json');
  await fs.writeFile(path.join(temp, 'Renamed Workspace.json'), '{not-managed-rename-json');
  await fs.writeFile(importPath, JSON.stringify({
    schemaVersion: 11,
    collections: [],
    environments: [],
    cookies: [],
    history: [],
    settings: { appearance: { theme: 'system' }, updates: { includePrereleases: false } }
  }));

  const createdWorkspaceId = await manager.createWorkspace();
  const importedWorkspaceId = await manager.importWorkspace(importPath);
  const renamed = await manager.renameWorkspace(createdWorkspaceId, 'Renamed Workspace');

  assert.equal(createdWorkspaceId, 'Workspace 2.json');
  assert.equal(importedWorkspaceId, 'Imported Workspace 2.json');
  assert.equal(renamed.renamedWorkspaceId, 'Renamed Workspace 2.json');
  assert.equal(await fs.readFile(path.join(temp, 'Workspace.json'), 'utf8'), '{not-managed-json');
  assert.equal(await fs.readFile(path.join(temp, 'Imported Workspace.json'), 'utf8'), '{not-managed-import-json');
  assert.equal(await fs.readFile(path.join(temp, 'Renamed Workspace.json'), 'utf8'), '{not-managed-rename-json');
  await fs.access(path.join(temp, 'Renamed Workspace 2.json'));
  await fs.access(path.join(temp, 'Imported Workspace 2.json'));
});

test('workspace manager retries create, import, and rename when destination files appear before publish', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-race-'));
  const importTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-import-race-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const importPath = path.join(importTemp, 'Imported Workspace.postmeter.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);
  await fs.writeFile(importPath, JSON.stringify({
    schemaVersion: 11,
    collections: [],
    environments: [],
    cookies: [],
    history: [],
    settings: { appearance: { theme: 'system' }, updates: { includePrereleases: false } }
  }));

  await manager.load();
  const originalAvailable = manager.workspaceFilenameAvailable.bind(manager);
  const racedFilenames = new Set();
  manager.workspaceFilenameAvailable = async (filename, allowedFilename = '') => {
    const available = await originalAvailable(filename, allowedFilename);
    if (
      available
      && ['Workspace.json', 'Imported Workspace.json', 'Renamed Workspace.json'].includes(filename)
      && !racedFilenames.has(filename)
    ) {
      racedFilenames.add(filename);
      await fs.writeFile(path.join(temp, filename), `{raced-${filename}}`);
    }
    return available;
  };

  const createdWorkspaceId = await manager.createWorkspace();
  const importedWorkspaceId = await manager.importWorkspace(importPath);
  const renamed = await manager.renameWorkspace(createdWorkspaceId, 'Renamed Workspace');

  assert.equal(createdWorkspaceId, 'Workspace 2.json');
  assert.equal(importedWorkspaceId, 'Imported Workspace 2.json');
  assert.equal(renamed.renamedWorkspaceId, 'Renamed Workspace 2.json');
  assert.equal(await fs.readFile(path.join(temp, 'Workspace.json'), 'utf8'), '{raced-Workspace.json}');
  assert.equal(await fs.readFile(path.join(temp, 'Imported Workspace.json'), 'utf8'), '{raced-Imported Workspace.json}');
  assert.equal(await fs.readFile(path.join(temp, 'Renamed Workspace.json'), 'utf8'), '{raced-Renamed Workspace.json}');
  await assert.rejects(() => fs.access(path.join(temp, createdWorkspaceId)));
  await fs.access(path.join(temp, 'Renamed Workspace 2.json'));
  await fs.access(path.join(temp, 'Imported Workspace 2.json'));
});

test('workspace manager regenerates a workspace when all managed workspace files are deleted', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await manager.load();
  await manager.createWorkspace();
  await fs.rm(path.join(temp, 'Local Workspace.json'), { force: true });
  await fs.rm(path.join(temp, 'Workspace.json'), { force: true });

  const reloaded = await manager.load();

  assert.equal(reloaded.workspaces.length, 1);
  assert.equal(reloaded.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(reloaded.path, path.join(temp, 'Local Workspace.json'));
  assert.equal(reloaded.workspace.schemaVersion, CURRENT_SCHEMA_VERSION);
  await fs.access(path.join(temp, 'Local Workspace.json'));
});

test('workspace manager discovers workspaces from disk, prefers the requested startup workspace, and removes the legacy manifest', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await fs.writeFile(path.join(temp, 'Local Workspace.json'), JSON.stringify({
    schemaVersion: 11,
    collections: [],
    environments: [],
    cookies: [],
    history: [],
    settings: { appearance: { theme: 'system' }, updates: { includePrereleases: false } }
  }));
  await fs.writeFile(path.join(temp, 'Workspace.json'), JSON.stringify({
    schemaVersion: 11,
    collections: [{ id: 'collection-1', name: 'Collection', description: '', variables: [], certificates: [], requests: [], folders: [] }],
    environments: [],
    cookies: [],
    history: [],
    settings: { appearance: { theme: 'system' }, updates: { includePrereleases: false } }
  }));
  await fs.writeFile(path.join(temp, 'workspace.workspaces.manifest.json'), JSON.stringify({
    version: 1,
    currentWorkspaceId: 'Local Workspace.json',
    files: ['Local Workspace.json', 'Workspace.json']
  }));

  const loaded = await manager.load({ preferredWorkspaceId: 'Workspace.json' });

  assert.equal(loaded.activeWorkspaceId, 'Workspace.json');
  assert.equal(loaded.path, path.join(temp, 'Workspace.json'));
  assert.equal(loaded.workspace.collections.length, 1);
  await assert.rejects(() => fs.access(path.join(temp, 'workspace.workspaces.manifest.json')));
});

test('workspace manager recovers a corrupt preferred workspace instead of silently switching to another workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const otherWorkspacePath = path.join(temp, 'Other Workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await fs.writeFile(preferredWorkspacePath, '{not-json');
  await fs.writeFile(otherWorkspacePath, JSON.stringify({
    schemaVersion: 11,
    collections: [],
    environments: [],
    cookies: [],
    history: [],
    settings: { appearance: { theme: 'system' }, updates: { includePrereleases: false } }
  }));

  await assert.rejects(
    () => manager.load(),
    (error) => {
      assert.ok(error instanceof WorkspaceRecoveryError);
      assert.equal(error.activeWorkspaceId, 'workspace.json');
      assert.equal(error.path, preferredWorkspacePath);
      assert.equal(error.workspaces.some((item) => item.id === 'workspace.json'), true);
      return true;
    }
  );

  const loaded = await manager.load();
  assert.equal(loaded.activeWorkspaceId, 'workspace.json');
  assert.equal(loaded.path, preferredWorkspacePath);
  assert.equal(JSON.parse(await fs.readFile(preferredWorkspacePath, 'utf8')).schemaVersion, CURRENT_SCHEMA_VERSION);
  const quarantined = (await fs.readdir(temp)).filter((entry) => entry.includes('workspace.json.corrupt'));
  assert.equal(quarantined.length, 1);
});
