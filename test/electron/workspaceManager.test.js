const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WorkspaceManager } = require('../../src/core/workspaceManager');

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
  assert.equal(loaded.workspaces[0].theme, 'system');
  assert.equal(loaded.workspaces[0].collectionCount, 0);
  assert.equal(loaded.workspaces[0].requestCount, 0);
  assert.equal(loaded.workspace.schemaVersion, 10);
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

  const deleted = await manager.deleteWorkspace('Workspace.json');
  assert.equal(deleted.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(deleted.workspaces.length, 1);
  assert.equal(deleted.workspaces[0].deletable, false);
  await assert.rejects(() => fs.access(path.join(temp, 'Workspace.json')));
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

  assert.equal(renamed.activeWorkspaceId, 'Renamed Workspace.json');
  assert.equal(renamed.path, path.join(temp, 'Renamed Workspace.json'));
  assert.equal(renamed.workspaces.find((item) => item.current)?.name, 'Renamed Workspace');
  assert.equal(renamed.workspace.collections.length, 1);
  await assert.rejects(() => fs.access(path.join(temp, 'Workspace.json')));
  await fs.access(path.join(temp, 'Renamed Workspace.json'));
});

test('workspace manager imports a workspace into the managed set without replacing the current workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const importTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-import-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const importPath = path.join(importTemp, 'Imported Workspace.postmeter.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  const loaded = await manager.load();
  await fs.writeFile(importPath, JSON.stringify({
    schemaVersion: 10,
    collections: [{
      id: 'collection-1',
      name: 'Imported Collection',
      description: '',
      variables: [],
      certificates: [],
      requests: [{ id: 'request-1', name: 'Imported Request', method: 'GET', url: 'https://example.com' }],
      folders: []
    }],
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
  await fs.access(path.join(temp, importedWorkspaceId));

  const switched = await manager.switchWorkspace(importedWorkspaceId);
  assert.equal(switched.activeWorkspaceId, importedWorkspaceId);
  assert.equal(switched.workspace.collections.length, 1);
  assert.equal(switched.workspace.collections[0].name, 'Imported Collection');
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
  assert.equal(reloaded.workspace.schemaVersion, 10);
  await fs.access(path.join(temp, 'Local Workspace.json'));
});

test('workspace manager discovers workspaces from disk, prefers the requested startup workspace, and removes the legacy manifest', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await fs.writeFile(path.join(temp, 'Local Workspace.json'), JSON.stringify({
    schemaVersion: 10,
    collections: [],
    environments: [],
    cookies: [],
    history: [],
    settings: { appearance: { theme: 'system' }, updates: { includePrereleases: false } }
  }));
  await fs.writeFile(path.join(temp, 'Workspace.json'), JSON.stringify({
    schemaVersion: 10,
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
