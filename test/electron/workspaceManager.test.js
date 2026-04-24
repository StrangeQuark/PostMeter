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
  assert.equal(loaded.workspace.schemaVersion, 10);
});

test('workspace manager creates, switches, and deletes managed workspaces', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-workspace-manager-'));
  const preferredWorkspacePath = path.join(temp, 'workspace.json');
  const manager = new WorkspaceManager(preferredWorkspacePath);

  await manager.load();
  const created = await manager.createWorkspace();
  assert.equal(created.workspaces.length, 2);
  assert.equal(created.activeWorkspaceId, 'Workspace.json');
  assert.equal(created.path, path.join(temp, 'Workspace.json'));

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

  const switched = await manager.switchWorkspace('Local Workspace.json');
  assert.equal(switched.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(switched.workspaces.length, 2);
  assert.equal(switched.path, path.join(temp, 'Local Workspace.json'));
  assert.deepEqual(switched.workspace.collections, []);

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
  const created = await manager.createWorkspace();
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
