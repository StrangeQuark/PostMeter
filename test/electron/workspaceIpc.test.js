const assert = require('node:assert/strict');
const test = require('node:test');
const { registerWorkspaceIpc } = require('../../electron/workspaceIpc');

test('workspace IPC registers stable workspace, collection, and example channels', async () => {
  const handlers = new Map();
  const workspaceStore = {
    describeCurrent: async (workspace) => ({
      workspace,
      path: '/tmp/Local Workspace.json',
      activeWorkspaceId: 'Local Workspace.json',
      workspaces: [{ id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }]
    }),
    getWorkspaceId: () => 'Local Workspace.json',
    getWorkspacePath: () => '/tmp/Local Workspace.json',
    createWorkspace: async () => ({
      workspace: { schemaVersion: 10, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } },
      path: '/tmp/Workspace.json',
      activeWorkspaceId: 'Workspace.json',
      workspaces: [
        { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: false, deletable: true },
        { id: 'Workspace.json', name: 'Workspace', path: '/tmp/Workspace.json', current: true, deletable: true }
      ]
    }),
    renameWorkspace: async () => ({
      workspace: { schemaVersion: 10, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } },
      path: '/tmp/Renamed Workspace.json',
      activeWorkspaceId: 'Renamed Workspace.json',
      workspaces: [
        { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: false, deletable: true },
        { id: 'Renamed Workspace.json', name: 'Renamed Workspace', path: '/tmp/Renamed Workspace.json', current: true, deletable: true }
      ]
    }),
    switchWorkspace: async () => ({
      workspace: { schemaVersion: 10, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } },
      path: '/tmp/Local Workspace.json',
      activeWorkspaceId: 'Local Workspace.json',
      workspaces: [{ id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }]
    }),
    deleteWorkspace: async () => ({
      workspace: { schemaVersion: 10, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } },
      path: '/tmp/Local Workspace.json',
      activeWorkspaceId: 'Local Workspace.json',
      workspaces: [{ id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }]
    }),
    importWorkspace: async () => ({ schemaVersion: 10, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } }),
    exportWorkspace: async () => '/tmp/export.json',
    importCollection: async () => ({ id: 'c1', name: 'Collection', requests: [], folders: [] }),
    exportCollection: async () => '/tmp/collection.json',
    backupCurrentWorkspace: async () => '/tmp/workspace.backup'
  };
  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ schemaVersion: 10, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } }),
    getWorkspaceStore: () => workspaceStore,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => {},
    saveWorkspace: async (workspace) => workspace,
    setWorkspace: () => {}
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    'collection:export',
    'collection:import',
    'request:examples:export',
    'workspace:create',
    'workspace:delete',
    'workspace:export',
    'workspace:import',
    'workspace:load',
    'workspace:rename',
    'workspace:save',
    'workspace:switch'
  ]);
  assert.deepEqual(await handlers.get('workspace:import')(), { cancelled: true });
  assert.deepEqual(await handlers.get('collection:import')(), { cancelled: true });
});
