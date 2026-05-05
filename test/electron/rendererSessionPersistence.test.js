const assert = require('node:assert/strict');
const test = require('node:test');
const { createRendererState } = require('../../src/renderer/rendererState');
const { findFolder, findRequest } = require('../../src/renderer/collectionModel');
const {
  buildRendererSession,
  restoreRendererSession
} = require('../../src/renderer/sessionPersistence');

test('renderer session persistence serializes active tabs, drafts, and dirty tab state', () => {
  const state = createRendererState();
  state.activeWorkspaceId = 'Workspace.json';
  state.selectedWorkspaceId = 'Workspace 2.json';
  state.activeEnvironmentId = 'environment-1';
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = 'request-1';
  state.activeSidebarPanel = 'environments';
  state.activeMainPanel = 'environment';
  state.draftRequests.set('draft-1', { id: 'draft-1', name: 'Draft Request', method: 'GET', url: '' });
  state.openRequestTabs = [
    {
      key: 'request:collection-1:request-1',
      collectionId: 'collection-1',
      requestId: 'request-1',
      dirty: true,
      snapshot: '{"saved":true}'
    },
    {
      key: 'draft:draft-1',
      requestId: 'draft-1',
      draft: true,
      dirty: true
    }
  ];
  state.openEnvironmentTabs = [
    {
      key: 'environment:environment-1',
      environmentId: 'environment-1',
      dirty: true,
      snapshot: '{"saved":true}'
    }
  ];
  state.openWorkspaceTabs = [
    {
      key: 'workspace:Workspace.json',
      workspaceId: 'Workspace.json',
      dirty: false
    }
  ];

  const doc = {
    querySelector(selector) {
      if (selector.includes('data-tab-group="request"')) {
        return { dataset: { tab: 'headers' } };
      }
      if (selector.includes('data-tab-group="results"')) {
        return { dataset: { tab: 'runner' } };
      }
      return null;
    }
  };

  const session = buildRendererSession({
    state,
    doc,
    requestForTab: (tab) => (tab.requestId === 'request-1'
      ? { id: 'request-1', name: 'Dirty Request', method: 'POST', url: 'https://example.test' }
      : state.draftRequests.get(tab.requestId)),
    environmentForTab: () => ({ id: 'environment-1', name: 'Dirty Environment', variables: [] })
  });

  assert.equal(session.activeRequestTab, 'headers');
  assert.equal(session.activeResultsTab, 'runner');
  assert.equal(session.selectedWorkspaceId, 'Workspace 2.json');
  assert.equal(session.openRequestTabs[0].currentState.url, 'https://example.test');
  assert.equal(session.openRequestTabs[1].currentState, null);
  assert.equal(session.openEnvironmentTabs[0].currentState.name, 'Dirty Environment');
  assert.equal(session.draftRequests.length, 1);
});

test('renderer session persistence preserves an empty workspace selection after closing the workspace tab', () => {
  const state = createRendererState();
  state.activeWorkspaceId = 'Local Workspace.json';
  state.selectedWorkspaceId = '';
  state.activeSidebarPanel = 'workspaces';
  state.activeMainPanel = 'workspace';
  state.openWorkspaceTabs = [];

  const session = buildRendererSession({
    state,
    doc: { querySelector: () => null },
    requestForTab: () => null,
    environmentForTab: () => null
  });

  assert.equal(session.activeWorkspaceId, 'Local Workspace.json');
  assert.equal(session.selectedWorkspaceId, '');
  assert.equal(session.activeMainPanel, 'workspace');
  assert.deepEqual(session.openWorkspaceTabs, []);
});

test('renderer session persistence serializes and restores shared request-owned collection-variable and cookie state', () => {
  const state = createRendererState();
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        name: 'Collection',
        requests: [
          { id: 'request-1', name: 'Saved Request', method: 'GET', url: 'https://saved.test' }
        ],
        folders: [],
        variables: [{ enabled: true, key: 'baseUrl', value: 'https://edited.test' }],
        certificates: [],
        description: ''
      }
    ],
    environments: [],
    cookies: [{ enabled: true, name: 'session', value: 'edited', domain: 'saved.test', path: '/' }]
  };
  state.openRequestTabs = [
    {
      key: 'request:collection-1:request-1',
      collectionId: 'collection-1',
      requestId: 'request-1',
      dirty: false,
      createdUnsaved: false,
      snapshot: JSON.stringify(state.workspace.collections[0].requests[0])
    }
  ];
  state.collectionDirtySnapshots.set('collection-1', JSON.stringify([{ enabled: true, key: 'baseUrl', value: 'https://saved.test' }]));
  state.collectionDirtyOwners.set('collection-1', 'request:collection-1:request-1');
  state.cookieJarDirtySnapshot = JSON.stringify([{ enabled: true, name: 'session', value: 'saved', domain: 'saved.test', path: '/' }]);
  state.cookieJarDirtyOwner = 'request:collection-1:request-1';

  const session = buildRendererSession({
    state,
    doc: { querySelector: () => null },
    requestForTab: () => state.workspace.collections[0].requests[0],
    environmentForTab: () => null
  });

  assert.deepEqual(session.dirtyCollectionStates, [
    {
      collectionId: 'collection-1',
      ownerKey: 'request:collection-1:request-1',
      snapshot: JSON.stringify([{ enabled: true, key: 'baseUrl', value: 'https://saved.test' }]),
      currentState: [{ enabled: true, key: 'baseUrl', value: 'https://edited.test' }]
    }
  ]);
  assert.deepEqual(session.dirtyCookieJarState, {
    ownerKey: 'request:collection-1:request-1',
    snapshot: JSON.stringify([{ enabled: true, name: 'session', value: 'saved', domain: 'saved.test', path: '/' }]),
    currentState: [{ enabled: true, name: 'session', value: 'edited', domain: 'saved.test', path: '/' }]
  });

  const restoredState = createRendererState();
  restoredState.workspace = {
    collections: [
      {
        id: 'collection-1',
        name: 'Collection',
        requests: [
          { id: 'request-1', name: 'Saved Request', method: 'GET', url: 'https://saved.test' }
        ],
        folders: [],
        variables: [{ enabled: true, key: 'baseUrl', value: 'https://saved.test' }],
        certificates: [],
        description: ''
      }
    ],
    environments: [],
    cookies: [{ enabled: true, name: 'session', value: 'saved', domain: 'saved.test', path: '/' }]
  };

  restoreRendererSession({
    state: restoredState,
    session,
    workspaceListItems: () => [
      { id: 'Workspace.json', name: 'Workspace', path: '/tmp/Workspace.json', current: true, deletable: false }
    ],
    findFolder,
    findRequest
  });

  assert.deepEqual(restoredState.workspace.collections[0].variables, [{ enabled: true, key: 'baseUrl', value: 'https://edited.test' }]);
  assert.deepEqual(restoredState.workspace.cookies, [{ enabled: true, name: 'session', value: 'edited', domain: 'saved.test', path: '/' }]);
  assert.equal(restoredState.collectionDirtyOwners.get('collection-1'), 'request:collection-1:request-1');
  assert.equal(restoredState.collectionDirtySnapshots.get('collection-1'), JSON.stringify([{ enabled: true, key: 'baseUrl', value: 'https://saved.test' }]));
  assert.equal(restoredState.cookieJarDirtyOwner, 'request:collection-1:request-1');
  assert.equal(restoredState.cookieJarDirtySnapshot, JSON.stringify([{ enabled: true, name: 'session', value: 'saved', domain: 'saved.test', path: '/' }]));
});

test('renderer session persistence restores dirty saved tabs, created-unsaved entities, and active selection', () => {
  const state = createRendererState();
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        name: 'Collection',
        requests: [
          { id: 'request-1', name: 'Saved Request', method: 'GET', url: 'https://saved.test' }
        ],
        folders: [],
        variables: [],
        certificates: [],
        description: ''
      }
    ],
    environments: [
      { id: 'environment-1', name: 'Saved Environment', variables: [] }
    ]
  };
  state.activeWorkspaceId = 'Workspace.json';
  state.selectedWorkspaceId = 'Workspace 2.json';

  const session = {
    activeWorkspaceId: 'Workspace.json',
    selectedWorkspaceId: 'Workspace 2.json',
    activeEnvironmentId: 'environment-2',
    activeCollectionId: 'collection-1',
    activeRequestId: 'request-2',
    activeSidebarPanel: 'environments',
    activeMainPanel: 'environment',
    activeRequestTab: 'auth',
    activeResultsTab: 'load',
    draftRequests: [
      { id: 'draft-1', name: 'Draft Request', method: 'POST', url: 'https://draft.test' }
    ],
    openRequestTabs: [
      {
        key: 'request:collection-1:request-1',
        collectionId: 'collection-1',
        requestId: 'request-1',
        dirty: true,
        snapshot: '{"saved":true}',
        currentState: { id: 'request-1', name: 'Saved Request', method: 'PATCH', url: 'https://dirty.test' }
      },
      {
        key: 'request:collection-1:request-2',
        collectionId: 'collection-1',
        requestId: 'request-2',
        createdUnsaved: true,
        dirty: true,
        snapshot: '',
        currentState: { id: 'request-2', name: 'Unsaved Request', method: 'POST', url: 'https://unsaved.test' }
      },
      {
        key: 'draft:draft-1',
        requestId: 'draft-1',
        draft: true,
        dirty: true
      }
    ],
    openEnvironmentTabs: [
      {
        key: 'environment:environment-1',
        environmentId: 'environment-1',
        dirty: true,
        snapshot: '{"saved":true}',
        currentState: { id: 'environment-1', name: 'Dirty Environment', variables: [] }
      },
      {
        key: 'environment:environment-2',
        environmentId: 'environment-2',
        createdUnsaved: true,
        dirty: true,
        snapshot: '',
        currentState: { id: 'environment-2', name: 'Unsaved Environment', variables: [] }
      }
    ],
    openWorkspaceTabs: [
      { key: 'workspace:Workspace.json', workspaceId: 'Workspace.json' }
    ]
  };

  const restored = restoreRendererSession({
    state,
    session,
    workspaceListItems: () => [
      { id: 'Workspace.json', name: 'Workspace', path: '/tmp/Workspace.json', current: true, deletable: false },
      { id: 'Workspace 2.json', name: 'Workspace 2', path: '/tmp/Workspace 2.json', current: false, deletable: true }
    ],
    findFolder,
    findRequest
  });

  assert.equal(state.workspace.collections[0].requests[0].method, 'PATCH');
  assert.equal(state.workspace.collections[0].requests[1].id, 'request-2');
  assert.equal(state.workspace.environments[0].name, 'Dirty Environment');
  assert.equal(state.workspace.environments[1].id, 'environment-2');
  assert.equal(state.draftRequests.has('draft-1'), true);
  assert.equal(state.activeCollectionId, 'collection-1');
  assert.equal(state.activeRequestId, 'request-2');
  assert.equal(state.selectedWorkspaceId, 'Workspace 2.json');
  assert.equal(state.activeEnvironmentId, 'environment-2');
  assert.equal(state.activeSidebarPanel, 'environments');
  assert.equal(state.activeMainPanel, 'environment');
  assert.equal(state.openWorkspaceTabs.length, 1);
  assert.equal(state.openWorkspaceTabs[0].workspaceId, 'Workspace.json');
  assert.equal(restored.activeRequestTab, 'auth');
  assert.equal(restored.activeResultsTab, 'load');
});

test('renderer session persistence does not auto-open a workspace tab for the selected workspace on startup', () => {
  const state = createRendererState();
  state.workspace = {
    collections: [],
    environments: []
  };

  restoreRendererSession({
    state,
    session: {
      activeWorkspaceId: 'Local Workspace.json',
      selectedWorkspaceId: 'Local Workspace.json',
      activeSidebarPanel: 'collections',
      activeMainPanel: 'request',
      openWorkspaceTabs: []
    },
    workspaceListItems: () => [
      { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }
    ],
    findFolder,
    findRequest
  });

  assert.equal(state.selectedWorkspaceId, 'Local Workspace.json');
  assert.deepEqual(state.openWorkspaceTabs, []);
});

test('renderer session persistence restores a closed workspace tab as the empty workspace pane', () => {
  const state = createRendererState();
  state.workspace = {
    collections: [],
    environments: []
  };

  restoreRendererSession({
    state,
    session: {
      activeWorkspaceId: 'Local Workspace.json',
      selectedWorkspaceId: 'Local Workspace.json',
      activeSidebarPanel: 'workspaces',
      activeMainPanel: 'workspace',
      openWorkspaceTabs: []
    },
    workspaceListItems: () => [
      { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }
    ],
    findFolder,
    findRequest
  });

  assert.equal(state.selectedWorkspaceId, '');
  assert.equal(state.activeSidebarPanel, 'workspaces');
  assert.equal(state.activeMainPanel, 'workspace');
  assert.deepEqual(state.openWorkspaceTabs, []);
});

test('renderer session persistence does not auto-open an environment tab for the selected environment on startup', () => {
  const state = createRendererState();
  state.workspace = {
    collections: [],
    environments: [
      { id: 'environment-1', name: 'Saved Environment', variables: [] }
    ]
  };

  restoreRendererSession({
    state,
    session: {
      activeWorkspaceId: 'Local Workspace.json',
      selectedWorkspaceId: 'Local Workspace.json',
      activeEnvironmentId: 'environment-1',
      activeSidebarPanel: 'collections',
      activeMainPanel: 'request',
      openEnvironmentTabs: []
    },
    workspaceListItems: () => [
      { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }
    ],
    findFolder,
    findRequest
  });

  assert.equal(state.activeEnvironmentId, 'environment-1');
  assert.deepEqual(state.openEnvironmentTabs, []);
});

test('renderer session persistence does not restore the default first request when no request tabs were open', () => {
  const state = createRendererState();
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        name: 'Collection',
        requests: [
          { id: 'request-1', name: 'Request One', method: 'GET', url: 'https://example.test' }
        ],
        folders: [],
        variables: [],
        certificates: [],
        description: ''
      }
    ],
    environments: []
  };
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = 'request-1';

  restoreRendererSession({
    state,
    session: {
      activeWorkspaceId: 'Local Workspace.json',
      selectedWorkspaceId: 'Local Workspace.json',
      activeSidebarPanel: 'collections',
      activeMainPanel: 'request',
      activeCollectionId: '',
      activeRequestId: '',
      openRequestTabs: []
    },
    workspaceListItems: () => [
      { id: 'Local Workspace.json', name: 'Local Workspace', path: '/tmp/Local Workspace.json', current: true, deletable: false }
    ],
    findFolder,
    findRequest
  });

  assert.equal(state.activeCollectionId, null);
  assert.equal(state.activeRequestId, null);
  assert.deepEqual(state.openRequestTabs, []);
});
