const assert = require('node:assert/strict');
const test = require('node:test');
const {
  collectionImportFilters,
  selectedOpenFilePath,
  selectedSaveFilePath,
  validateDialogFilePath
} = require('../../electron/fileDialogs');
const { registerWorkspaceIpc } = require('../../electron/workspaceIpc');

test('file dialog helpers validate selected paths before IPC file operations', () => {
  assert.deepEqual(collectionImportFilters(), [
    { name: 'API Collections', extensions: ['json', 'yaml', 'yml', 'har', 'jmx', 'sh'] },
    { name: 'All Files', extensions: ['*'] }
  ]);
  assert.equal(selectedOpenFilePath({ canceled: true, filePaths: ['/tmp/workspace.json'] }), '');
  assert.equal(selectedOpenFilePath({ canceled: false, filePaths: [] }), '');
  assert.equal(selectedOpenFilePath({ canceled: false, filePaths: ['/tmp/workspace.json'] }), '/tmp/workspace.json');
  assert.equal(selectedSaveFilePath({ canceled: true, filePath: '/tmp/export.json' }), '');
  assert.equal(selectedSaveFilePath({ canceled: false, filePath: '/tmp/export.json' }), '/tmp/export.json');
  assert.throws(() => selectedOpenFilePath({ canceled: false, filePaths: [42] }), /open dialog selected path must be a non-empty string/);
  assert.throws(() => selectedSaveFilePath({ canceled: false, filePath: 'bad\0path.json' }), /save dialog selected path must not contain null bytes/);
  assert.throws(() => validateDialogFilePath('', 'custom path'), /custom path must be a non-empty string/);
});

test('workspace IPC registers stable workspace, collection, and example channels', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  let describeCurrentCalls = 0;
  let renamedVaultStore = null;
  let deletedVaultStore = null;
  const workspaceStore = {
    describeCurrent: async (workspace, extras = {}) => {
      describeCurrentCalls += 1;
      return {
        workspace,
        path: '/tmp/Local Workspace.json',
        activeWorkspaceId: 'Local Workspace.json',
        workspaces: describeCurrentCalls === 1
          ? [{ id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }]
          : [
              { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: true },
              { id: 'Workspace.json', name: 'Workspace', path: '/tmp/Workspace.json', current: false, deletable: true }
            ],
        ...extras
      };
    },
    getWorkspaceId: () => 'Local Workspace.json',
    getWorkspacePath: () => '/tmp/Local Workspace.json',
    createWorkspace: async () => 'Workspace.json',
    renameWorkspace: async () => ({
      workspace: { schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } },
      path: '/tmp/Renamed Workspace.json',
      activeWorkspaceId: 'Renamed Workspace.json',
      renamedWorkspaceId: 'Renamed Workspace.json',
      workspaces: [
        { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: false, deletable: true },
        { id: 'Renamed Workspace.json', name: 'Renamed Workspace', path: '/tmp/Renamed Workspace.json', current: true, deletable: true }
      ]
    }),
    switchWorkspace: async () => ({
      workspace: { schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } },
      path: '/tmp/Local Workspace.json',
      activeWorkspaceId: 'Local Workspace.json',
      workspaces: [{ id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }]
    }),
    deleteWorkspace: async () => ({
      workspace: { schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } },
      path: '/tmp/Local Workspace.json',
      activeWorkspaceId: 'Local Workspace.json',
      deletedWorkspaceId: 'Renamed Workspace.json',
      workspaces: [{ id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }]
    }),
    importWorkspace: async () => ({ schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } }),
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
    getWorkspace: () => ({ schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } }),
    getWorkspaceStore: () => workspaceStore,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => {},
    renameVaultStore: async (previousId, nextId) => {
      renamedVaultStore = { previousId, nextId };
    },
    saveWorkspace: async (workspace) => workspace,
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: () => {},
    deleteVaultStore: async (workspaceId) => {
      deletedVaultStore = workspaceId;
    }
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
    'workspace:saveEnvironment',
    'workspace:saveRequest',
    'workspace:saveSettings',
    'workspace:switch'
  ]);
  assert.deepEqual([...syncHandlers.keys()].sort(), ['workspace:saveSync']);
  await handlers.get('workspace:rename')({}, 'Local Workspace.json', 'Renamed Workspace');
  assert.deepEqual(renamedVaultStore, { previousId: 'Local Workspace.json', nextId: 'Renamed Workspace.json' });
  await handlers.get('workspace:delete')({}, 'Renamed Workspace.json');
  assert.equal(deletedVaultStore, 'Renamed Workspace.json');
  assert.deepEqual(await handlers.get('workspace:import')(), { cancelled: true });
  assert.deepEqual(await handlers.get('collection:import')(), { cancelled: true });
});

test('workspace IPC load falls back to the workspace store when no cached workspace is available', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  const loadedWorkspace = {
    schemaVersion: 11,
    collections: [],
    environments: [],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  };
  let loadCalls = 0;
  let describeWorkspace = null;
  let cachedWorkspace = null;

  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => null,
    getWorkspaceStore: () => ({
      load: async () => {
        loadCalls += 1;
        return { workspace: loadedWorkspace };
      },
      describeCurrent: async (workspace) => {
        describeWorkspace = workspace;
        return {
          workspace,
          path: '/tmp/Local Workspace.json',
          activeWorkspaceId: 'Local Workspace.json',
          workspaces: [{ id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }]
        };
      }
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => {},
    saveWorkspace: async (workspace) => workspace,
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: (workspace) => {
      cachedWorkspace = workspace;
    }
  });

  const result = await handlers.get('workspace:load')();

  assert.equal(loadCalls, 1);
  assert.equal(describeWorkspace, loadedWorkspace);
  assert.equal(cachedWorkspace, loadedWorkspace);
  assert.equal(result.workspace, loadedWorkspace);
  assert.equal(syncHandlers.has('workspace:saveSync'), true);
});

test('workspace IPC rolls back a workspace rename when vault metadata rename fails', async () => {
  const handlers = new Map();
  const renameCalls = [];
  let workspaceSetCalls = 0;
  const workspace = emptyWorkspace();
  const workspaceStore = {
    getWorkspaceId: () => 'Local Workspace.json',
    renameWorkspace: async (workspaceId, nextName) => {
      renameCalls.push({ workspaceId, nextName });
      if (renameCalls.length === 1) {
        return {
          workspace,
          path: '/tmp/Renamed Workspace.json',
          activeWorkspaceId: 'Renamed Workspace.json',
          renamedWorkspaceId: 'Renamed Workspace.json',
          workspaces: [
            { id: 'Renamed Workspace.json', name: 'Renamed Workspace', path: '/tmp/Renamed Workspace.json', current: true, deletable: true },
            { id: 'Workspace.json', name: 'Workspace', path: '/tmp/Workspace.json', current: false, deletable: true }
          ]
        };
      }
      return {
        workspace,
        path: '/tmp/Local Workspace.json',
        activeWorkspaceId: 'Local Workspace.json',
        renamedWorkspaceId: 'Local Workspace.json',
        workspaces: [
          { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: true },
          { id: 'Workspace.json', name: 'Workspace', path: '/tmp/Workspace.json', current: false, deletable: true }
        ]
      };
    }
  };

  registerWorkspaceIpc({
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceStore: () => workspaceStore,
    ipcMain: {
      handle(channel, handler) { handlers.set(channel, handler); },
      on() {}
    },
    mutateWorkspace: async (mutator) => mutator(workspace),
    refreshApplicationMenu: () => {},
    renameVaultStore: async () => {
      throw new Error('vault rename denied');
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    saveWorkspaceSync: (nextWorkspace) => nextWorkspace,
    setWorkspace: () => { workspaceSetCalls += 1; }
  });

  await assert.rejects(() => handlers.get('workspace:rename')({}, 'Local Workspace.json', 'Renamed Workspace'), /vault rename denied/);
  assert.deepEqual(renameCalls, [
    { workspaceId: 'Local Workspace.json', nextName: 'Renamed Workspace' },
    { workspaceId: 'Renamed Workspace.json', nextName: 'Local Workspace' }
  ]);
  assert.equal(workspaceSetCalls, 0);
});

test('workspace IPC restores a deleted workspace when vault metadata delete fails', async () => {
  const handlers = new Map();
  const workspace = emptyWorkspace();
  const deletedWorkspace = {
    ...emptyWorkspace(),
    collections: [{ id: 'collection-1', name: 'Collection', requests: [], folders: [] }]
  };
  let loadWorkspaceId = '';
  let deleteWorkspaceId = '';
  let restored = null;
  let workspaceSetCalls = 0;
  const workspaceStore = {
    getWorkspaceId: () => 'Workspace.json',
    loadWorkspaceById: async (workspaceId) => {
      loadWorkspaceId = workspaceId;
      return deletedWorkspace;
    },
    deleteWorkspace: async (workspaceId) => {
      deleteWorkspaceId = workspaceId;
      return {
        workspace,
        path: '/tmp/Local Workspace.json',
        activeWorkspaceId: 'Local Workspace.json',
        deletedWorkspaceId: workspaceId,
        workspaces: [{ id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }]
      };
    },
    restoreWorkspaceFile: async (workspaceId, snapshot, options) => {
      restored = { workspaceId, snapshot, options };
      return {
        workspace: snapshot,
        path: `/tmp/${workspaceId}`,
        activeWorkspaceId: options.currentWorkspaceId,
        workspaces: [{ id: workspaceId, name: 'Workspace', path: `/tmp/${workspaceId}`, current: true, deletable: true }]
      };
    }
  };

  registerWorkspaceIpc({
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => workspace,
    getWorkspaceStore: () => workspaceStore,
    ipcMain: {
      handle(channel, handler) { handlers.set(channel, handler); },
      on() {}
    },
    refreshApplicationMenu: () => {},
    deleteVaultStore: async () => {
      throw new Error('vault delete denied');
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    saveWorkspaceSync: (nextWorkspace) => nextWorkspace,
    setWorkspace: () => { workspaceSetCalls += 1; }
  });

  await assert.rejects(() => handlers.get('workspace:delete')({}, 'Workspace.json'), /vault delete denied/);
  assert.equal(loadWorkspaceId, 'Workspace.json');
  assert.equal(deleteWorkspaceId, 'Workspace.json');
  assert.deepEqual(restored, {
    workspaceId: 'Workspace.json',
    snapshot: deletedWorkspace,
    options: { currentWorkspaceId: 'Workspace.json' }
  });
  assert.equal(workspaceSetCalls, 0);
});

test('workspace IPC exports a selected non-current workspace by id', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  let exportedWorkspaceId = null;
  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/export.json' })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } }),
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] }),
      exportWorkspace: async () => '/tmp/current-export.json',
      exportWorkspaceById: async (workspaceId) => {
        exportedWorkspaceId = workspaceId;
        return '/tmp/export.json';
      }
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => {},
    saveWorkspace: async (workspace) => workspace,
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: () => {}
  });

  const result = await handlers.get('workspace:export')(null, null, 'Workspace.json');

  assert.equal(exportedWorkspaceId, 'Workspace.json');
  assert.deepEqual(result, { cancelled: false, path: '/tmp/export.json' });
  assert.equal(syncHandlers.has('workspace:saveSync'), true);
});

test('workspace IPC suggests collection filenames, filters, and formats for every collection export type', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  let saveDialogOptions = null;
  let exportedCollection = null;
  let exportedFormat = '';
  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async (_window, options) => {
        saveDialogOptions = options;
        return { canceled: false, filePath: `/tmp/${options.defaultPath}` };
      }
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } }),
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] }),
      exportCollection: async (collection, exportPath, options = {}) => {
        exportedCollection = collection;
        exportedFormat = options.format || '';
        return exportPath;
      }
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => {},
    saveWorkspace: async (workspace) => workspace,
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: () => {}
  });

  const collection = { id: 'c1', name: 'AuthServiceCollection', requests: [], folders: [] };
  for (const [format, defaultPath, filterName, extension] of [
    ['postmeter', 'AuthServiceCollection.json', 'POSTMETER Collection', 'json'],
    ['postman', 'AuthServiceCollection.postman_collection.json', 'POSTMAN Collection', 'json'],
    ['openapi', 'AuthServiceCollection.openapi.json', 'OPENAPI Collection', 'json'],
    ['jmeter', 'AuthServiceCollection.jmx', 'JMETER Collection', 'jmx'],
    ['curl', 'AuthServiceCollection.sh', 'CURL Collection', 'sh'],
    ['har', 'AuthServiceCollection.har', 'HAR Collection', 'har']
  ]) {
    const result = await handlers.get('collection:export')(null, collection, format);

    assert.equal(saveDialogOptions?.title, 'Export Collection');
    assert.equal(saveDialogOptions?.defaultPath, defaultPath);
    assert.deepEqual(saveDialogOptions?.filters, [
      { name: filterName, extensions: [extension] },
      { name: 'All Files', extensions: ['*'] }
    ]);
    assert.equal(exportedCollection, collection);
    assert.equal(exportedFormat, format);
    assert.deepEqual(result, { cancelled: false, path: `/tmp/${defaultPath}` });
  }
  assert.equal(syncHandlers.has('workspace:saveSync'), true);
});

function emptyWorkspace() {
  return {
    schemaVersion: 11,
    collections: [],
    environments: [],
    globals: [],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  };
}

test('workspace IPC exposes only documented collection import filters', async () => {
  const handlers = new Map();
  let openDialogOptions = null;
  let importedPath = '';
  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async (_window, options) => {
        openDialogOptions = options;
        return { canceled: false, filePaths: ['/tmp/collection.openapi.json'] };
      },
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } }),
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] }),
      importCollection: async (filePath) => {
        importedPath = filePath;
        return { id: 'c1', name: 'Imported', requests: [], folders: [] };
      }
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on() {}
    },
    refreshApplicationMenu: () => {},
    saveWorkspace: async (workspace) => workspace,
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: () => {}
  });

  const result = await handlers.get('collection:import')();

  assert.equal(openDialogOptions?.title, 'Import Collection');
  assert.deepEqual(openDialogOptions?.properties, ['openFile']);
  assert.deepEqual(openDialogOptions?.filters, collectionImportFilters());
  assert.equal(importedPath, '/tmp/collection.openapi.json');
  assert.deepEqual(result, { cancelled: false, collection: { id: 'c1', name: 'Imported', requests: [], folders: [] } });
});

test('workspace IPC imports a workspace as an additional managed workspace without backing up or replacing the current workspace', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  let backupCalls = 0;
  let importedPath = '';
  let savedWorkspaceCalls = 0;
  let setWorkspaceCalls = 0;
  let refreshCalls = 0;
  const currentWorkspace = {
    schemaVersion: 11,
    collections: [],
    environments: [],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  };
  const workspaces = [
    { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: true },
    { id: 'Imported Workspace.json', name: 'Imported Workspace', path: '/tmp/Imported Workspace.json', current: false, deletable: true }
  ];
  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/Imported Workspace.postmeter.json'] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => currentWorkspace,
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace, extras = {}) => ({
        workspace,
        path: '/tmp/Local Workspace.json',
        activeWorkspaceId: 'Local Workspace.json',
        workspaces,
        ...extras
      }),
      importWorkspace: async (filePath) => {
        importedPath = filePath;
        return 'Imported Workspace.json';
      },
      backupCurrentWorkspace: async () => {
        backupCalls += 1;
        return '/tmp/workspace.backup';
      }
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => { refreshCalls += 1; },
    saveWorkspace: async (workspace) => {
      savedWorkspaceCalls += 1;
      return workspace;
    },
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: () => { setWorkspaceCalls += 1; }
  });

  const result = await handlers.get('workspace:import')();

  assert.equal(importedPath, '/tmp/Imported Workspace.postmeter.json');
  assert.equal(backupCalls, 0);
  assert.equal(savedWorkspaceCalls, 0);
  assert.equal(setWorkspaceCalls, 0);
  assert.equal(refreshCalls, 0);
  assert.equal(syncHandlers.has('workspace:saveSync'), true);
  assert.deepEqual(result, {
    cancelled: false,
    workspace: currentWorkspace,
    path: '/tmp/Local Workspace.json',
    activeWorkspaceId: 'Local Workspace.json',
    createdWorkspaceId: 'Imported Workspace.json',
    workspaces
  });
});

test('workspace IPC saves only the selected request payload through targeted request save', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  const currentWorkspace = {
    schemaVersion: 11,
    collections: [],
    environments: [],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  };
  let savedWorkspace = null;
  let appliedWorkspace = null;
  let refreshCalls = 0;

  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => currentWorkspace,
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] })
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => { refreshCalls += 1; },
    saveWorkspace: async (workspace) => {
      savedWorkspace = workspace;
      return {
        ...workspace,
        collections: [{
          id: 'collection-1',
          name: 'Saved Collection',
          description: '',
          variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }],
          certificates: [],
          requests: [{ id: 'request-1', name: 'Saved Request', method: 'GET', url: 'https://example.test', queryParams: [], headers: [], bodyType: 'NONE' }],
          folders: []
        }],
        cookies: [{ enabled: true, name: 'session', value: 'saved', domain: 'example.test', path: '/' }]
      };
    },
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: (workspace) => {
      appliedWorkspace = workspace;
    }
  });

  const result = await handlers.get('workspace:saveRequest')(null, {
    collectionId: 'collection-1',
    requestId: 'request-1',
    request: {
      id: 'request-1',
      name: 'Saved Request',
      method: 'GET',
      url: 'https://example.test',
      queryParams: [],
      headers: [],
      bodyType: 'NONE'
    },
    collectionShell: {
      id: 'collection-1',
      name: 'Saved Collection',
      description: '',
      certificates: []
    },
    folderPath: [],
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }],
    cookies: [{ enabled: true, name: 'session', value: 'saved', domain: 'example.test', path: '/' }],
    settings: { updates: { includePrereleases: true } }
  });

  assert.equal(savedWorkspace.collections[0].requests[0].id, 'request-1');
  assert.equal(savedWorkspace.settings.updates.includePrereleases, true);
  assert.equal(appliedWorkspace.collections[0].requests[0].name, 'Saved Request');
  assert.equal(refreshCalls, 1);
  assert.deepEqual(result, {
    request: appliedWorkspace.collections[0].requests[0],
    collectionVariables: appliedWorkspace.collections[0].variables,
    cookies: appliedWorkspace.cookies
  });
  assert.equal(syncHandlers.has('workspace:saveSync'), true);
});

test('workspace IPC saves only the selected environment payload through targeted environment save', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  const currentWorkspace = {
    schemaVersion: 11,
    collections: [],
    environments: [],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  };
  let appliedWorkspace = null;
  let refreshCalls = 0;

  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => currentWorkspace,
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] })
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => { refreshCalls += 1; },
    saveWorkspace: async (workspace) => workspace,
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: (workspace) => {
      appliedWorkspace = workspace;
    }
  });

  const result = await handlers.get('workspace:saveEnvironment')(null, {
    environmentId: 'environment-1',
    environment: {
      id: 'environment-1',
      name: 'Saved Environment',
      variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }]
    },
    settings: { updates: { includePrereleases: true } }
  });

  assert.equal(appliedWorkspace.environments[0].id, 'environment-1');
  assert.equal(appliedWorkspace.settings.updates.includePrereleases, true);
  assert.equal(refreshCalls, 1);
  assert.deepEqual(result, {
    environment: appliedWorkspace.environments[0]
  });
  assert.equal(syncHandlers.has('workspace:saveSync'), true);
});

test('workspace IPC saves only workspace settings through targeted settings save', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  const currentWorkspace = {
    schemaVersion: 11,
    collections: [{ id: 'collection-1', name: 'Collection', requests: [], folders: [] }],
    environments: [{ id: 'environment-1', name: 'Environment', variables: [] }],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  };
  let savedWorkspace = null;
  let appliedWorkspace = null;
  let refreshCalls = 0;

  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => currentWorkspace,
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] })
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => { refreshCalls += 1; },
    saveWorkspace: async (workspace) => {
      savedWorkspace = workspace;
      return workspace;
    },
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: (workspace) => {
      appliedWorkspace = workspace;
    }
  });

  const result = await handlers.get('workspace:saveSettings')(null, {
    appearance: { theme: 'dark' },
    updates: { includePrereleases: true }
  });

  assert.equal(savedWorkspace.settings.appearance.theme, 'dark');
  assert.equal(savedWorkspace.settings.updates.includePrereleases, true);
  assert.equal(savedWorkspace.collections[0].id, 'collection-1');
  assert.equal(appliedWorkspace.environments[0].id, 'environment-1');
  assert.equal(refreshCalls, 1);
  assert.deepEqual(result, {
    settings: appliedWorkspace.settings
  });
  assert.equal(syncHandlers.has('workspace:saveSync'), true);
});

test('workspace IPC rejects malformed sandbox settings before persistence', async () => {
  const handlers = new Map();
  let saveCalls = 0;

  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({
      schemaVersion: 11,
      collections: [{ id: 'collection-1', name: 'Collection', requests: [], folders: [] }],
      environments: [],
      history: [],
      cookies: [],
      settings: { updates: { includePrereleases: false } }
    }),
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] })
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on() {}
    },
    refreshApplicationMenu: () => {},
    saveWorkspace: async (workspace) => {
      saveCalls += 1;
      return workspace;
    },
    saveWorkspaceSync: (workspace) => workspace,
    setWorkspace: () => {}
  });

  await assert.rejects(
    () => handlers.get('workspace:saveSettings')(null, {
      sandbox: { fileBindings: [{ source: 'fixtures/upload.txt' }] }
    }),
    /settings.sandbox.fileBindings\[0\].localPath must be a string/
  );
  await assert.rejects(
    () => handlers.get('workspace:saveSettings')(null, {
      sandbox: { packageCache: [{ specifier: '@team/tools', source: 'x', integrity: 'sha256', files: Array.from({ length: 129 }, (_value, index) => ({ path: `${index}.js`, source: 'x' })) }] }
    }),
    /settings.sandbox.packageCache\[0\].files cannot contain more than 128 items/
  );
  await assert.rejects(
    () => handlers.get('workspace:saveRequest')(null, {
      collectionId: 'collection-1',
      requestId: 'request-1',
      request: { id: 'request-1', name: 'Request', method: 'GET', url: 'https://example.test', queryParams: [], headers: [], bodyType: 'NONE' },
      settings: { sandbox: { trustedCapabilities: { vaultGrants: { requests: 'all' } } } }
    }),
    /payload.settings.sandbox.trustedCapabilities.vaultGrants.requests must be an array/
  );
  assert.equal(saveCalls, 0);
});

test('workspace IPC synchronously saves workspace state for shutdown persistence', () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  let savedWorkspace = null;
  let appliedWorkspace = null;
  let refreshCalls = 0;

  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ schemaVersion: 11, collections: [], environments: [], history: [], cookies: [], settings: { updates: { includePrereleases: false } } }),
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] })
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => {
      refreshCalls += 1;
    },
    saveWorkspace: async (workspace) => workspace,
    saveWorkspaceSync: (workspace) => {
      savedWorkspace = { ...workspace, savedSync: true };
      return savedWorkspace;
    },
    setWorkspace: (workspace) => {
      appliedWorkspace = workspace;
    }
  });

  const event = { returnValue: undefined };
  syncHandlers.get('workspace:saveSync')(event, {
    schemaVersion: 11,
    collections: [{ id: 'collection-1', name: 'Unsaved Collection', requests: [], folders: [] }],
    environments: [],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  });

  assert.equal(handlers.has('workspace:save'), true);
  assert.equal(savedWorkspace.savedSync, true);
  assert.equal(appliedWorkspace.savedSync, true);
  assert.equal(event.returnValue.savedSync, true);
  assert.equal(refreshCalls, 1);
});

test('workspace IPC skips shutdown sync save while queued workspace mutations are pending', () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  const currentWorkspace = {
    schemaVersion: 11,
    collections: [{ id: 'collection-current', name: 'Current', requests: [], folders: [] }],
    environments: [],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  };
  let syncSaveCalls = 0;
  let appliedWorkspace = null;
  let refreshCalls = 0;

  registerWorkspaceIpc({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => currentWorkspace,
    getWorkspaceStore: () => ({
      describeCurrent: async (workspace) => ({ workspace, path: '/tmp/Local Workspace.json', activeWorkspaceId: 'Local Workspace.json', workspaces: [] })
    }),
    hasPendingWorkspaceOperations: () => true,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    refreshApplicationMenu: () => {
      refreshCalls += 1;
    },
    saveWorkspace: async (workspace) => workspace,
    saveWorkspaceSync: (workspace) => {
      syncSaveCalls += 1;
      return workspace;
    },
    setWorkspace: (workspace) => {
      appliedWorkspace = workspace;
    }
  });

  const event = { returnValue: undefined };
  syncHandlers.get('workspace:saveSync')(event, {
    schemaVersion: 11,
    collections: [{ id: 'collection-stale', name: 'Stale Shutdown Snapshot', requests: [], folders: [] }],
    environments: [],
    history: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  });

  assert.equal(handlers.has('workspace:save'), true);
  assert.equal(syncSaveCalls, 0);
  assert.equal(appliedWorkspace, null);
  assert.equal(refreshCalls, 0);
  assert.equal(event.returnValue, currentWorkspace);
});
