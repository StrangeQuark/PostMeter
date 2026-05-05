const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_OPEN_TABS, createRendererState } = require('../../src/renderer/rendererState');
const { createRequestTabState } = require('../../src/renderer/requestTabState');

test('request tab state opens a saved request tab with a snapshot and folder metadata', () => {
  const state = createRendererState();
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests: [],
        folders: [
          {
            id: 'folder-1',
            requests: [{ id: 'request-1', name: 'Fetch Users' }],
            folders: []
          }
        ]
      }
    ],
    environments: []
  };
  state.activeCollectionId = 'collection-1';
  state.activeFolderId = 'folder-1';
  state.activeRequestId = 'request-1';
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => state.workspace.collections[0],
    activeEnvironment: () => null,
    activeRequest: () => state.workspace.collections[0].folders[0].requests[0],
    activeWorkspaceItem: () => null,
    findRequest(collection, requestId) {
      const request = collection.folders[0].requests.find((item) => item.id === requestId);
      return request ? { request, folder: collection.folders[0] } : null;
    },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  const tab = tabState.ensureOpenRequestTabForActive({ createdUnsaved: true });

  assert.equal(tab.key, 'request:collection-1:request-1');
  assert.equal(tab.folderId, 'folder-1');
  assert.equal(tab.createdUnsaved, true);
  assert.equal(tab.snapshot, JSON.stringify({ id: 'request-1', name: 'Fetch Users' }));
  assert.equal(tabRenders, 1);
});

test('request tab state keeps more than the old twelve-tab threshold open', () => {
  const state = createRendererState();
  const requests = Array.from({ length: 16 }, (_value, index) => ({
    id: `request-${index + 1}`,
    name: `Request ${index + 1}`
  }));
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests,
        folders: []
      }
    ],
    environments: []
  };
  state.activeCollectionId = 'collection-1';
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => state.workspace.collections[0],
    activeEnvironment: () => null,
    activeRequest: () => requests.find((request) => request.id === state.activeRequestId),
    activeWorkspaceItem: () => null,
    findRequest(collection, requestId) {
      const request = collection.requests.find((item) => item.id === requestId);
      return request ? { request, folder: null } : null;
    },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  for (const request of requests) {
    state.activeRequestId = request.id;
    tabState.ensureOpenRequestTabForActive();
  }

  assert.equal(state.openRequestTabs.length, 16);
  assert.equal(state.openRequestTabs[0].requestId, 'request-1');
  assert.equal(state.openRequestTabs.at(-1).requestId, 'request-16');
  assert.equal(tabRenders, 16);
});

test('request tab state refuses to open request tabs beyond the bounded limit', () => {
  const state = createRendererState();
  const requests = Array.from({ length: MAX_OPEN_TABS + 1 }, (_value, index) => ({
    id: `request-${index + 1}`,
    name: `Request ${index + 1}`
  }));
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests,
        folders: []
      }
    ],
    environments: []
  };
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = requests.at(-1).id;
  state.openRequestTabs = requests.slice(0, MAX_OPEN_TABS).map((request) => ({
    key: `request:collection-1:${request.id}`,
    collectionId: 'collection-1',
    requestId: request.id,
    dirty: false,
    snapshot: JSON.stringify(request)
  }));
  const statuses = [];
  const notifications = [];
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => state.workspace.collections[0],
    activeEnvironment: () => null,
    activeRequest: () => requests.at(-1),
    activeWorkspaceItem: () => null,
    findRequest(collection, requestId) {
      const request = collection.requests.find((item) => item.id === requestId);
      return request ? { request, folder: null } : null;
    },
    notifyUser: (title, message) => notifications.push({ title, message }),
    renderRequestTabs: () => { tabRenders += 1; },
    setStatus: (message) => statuses.push(message),
    workspaceListItems: () => []
  });

  const tab = tabState.ensureOpenRequestTabForActive();

  assert.equal(tab, null);
  assert.equal(state.openRequestTabs.length, MAX_OPEN_TABS);
  assert.equal(state.openRequestTabs[0].requestId, 'request-1');
  assert.equal(state.openRequestTabs.at(-1).requestId, `request-${MAX_OPEN_TABS}`);
  assert.equal(state.openRequestTabs.some((candidate) => candidate.requestId === `request-${MAX_OPEN_TABS + 1}`), false);
  assert.equal(tabRenders, 0);
  assert.match(statuses.at(-1), new RegExp(`Cannot open more than ${MAX_OPEN_TABS} tabs`));
  assert.deepEqual(notifications.at(-1), {
    title: 'Open Tab Limit Reached',
    message: statuses.at(-1)
  });
});

test('request tab state refuses tab-open checks with missing target ids', () => {
  const state = createRendererState();
  const statuses = [];
  const notifications = [];
  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    notifyUser: (title, message) => notifications.push({ title, message }),
    renderRequestTabs: () => {},
    setStatus: (message) => statuses.push(message),
    workspaceListItems: () => []
  });

  assert.equal(tabState.canOpenRequestTabFor('collection-1', ''), false);
  assert.equal(tabState.canOpenEnvironmentTabFor(null), false);
  assert.equal(tabState.canOpenWorkspaceTabFor(undefined), false);
  assert.deepEqual(statuses, []);
  assert.deepEqual(notifications, []);
});

test('request tab state refuses to open environment and workspace tabs beyond the bounded limit', () => {
  const state = createRendererState();
  const environments = Array.from({ length: MAX_OPEN_TABS + 1 }, (_value, index) => ({
    id: `environment-${index + 1}`,
    name: `Environment ${index + 1}`,
    variables: []
  }));
  const workspaceItems = Array.from({ length: MAX_OPEN_TABS + 1 }, (_value, index) => ({
    id: `Workspace ${index + 1}.json`,
    name: `Workspace ${index + 1}`
  }));
  state.workspace = {
    collections: [],
    environments
  };
  state.activeEnvironmentId = environments.at(-1).id;
  state.selectedWorkspaceId = workspaceItems.at(-1).id;
  state.openEnvironmentTabs = environments.slice(0, MAX_OPEN_TABS).map((environment) => ({
    key: `environment:${environment.id}`,
    environmentId: environment.id,
    dirty: false,
    snapshot: JSON.stringify(environment)
  }));
  state.openWorkspaceTabs = workspaceItems.slice(0, MAX_OPEN_TABS).map((workspaceItem) => ({
    key: `workspace:${workspaceItem.id}`,
    workspaceId: workspaceItem.id,
    dirty: false
  }));
  const statuses = [];
  const notifications = [];

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => environments.at(-1),
    activeRequest: () => null,
    activeWorkspaceItem: () => workspaceItems.at(-1),
    notifyUser: (title, message) => notifications.push({ title, message }),
    renderRequestTabs: () => {},
    setStatus: (message) => statuses.push(message),
    workspaceListItems: () => workspaceItems
  });

  assert.equal(tabState.ensureOpenEnvironmentTabForActive(), null);
  assert.equal(state.openEnvironmentTabs.length, MAX_OPEN_TABS);
  assert.equal(state.openEnvironmentTabs.some((candidate) => candidate.environmentId === environments.at(-1).id), false);
  assert.match(statuses.at(-1), new RegExp(`Cannot open more than ${MAX_OPEN_TABS} tabs`));
  assert.deepEqual(notifications.at(-1), {
    title: 'Open Tab Limit Reached',
    message: statuses.at(-1)
  });

  assert.equal(tabState.ensureOpenWorkspaceTabForActive(), null);
  assert.equal(state.openWorkspaceTabs.length, MAX_OPEN_TABS);
  assert.equal(state.openWorkspaceTabs.some((candidate) => candidate.workspaceId === workspaceItems.at(-1).id), false);
  assert.match(statuses.at(-1), new RegExp(`Cannot open more than ${MAX_OPEN_TABS} tabs`));
  assert.deepEqual(notifications.at(-1), {
    title: 'Open Tab Limit Reached',
    message: statuses.at(-1)
  });
});

test('request tab state applies the open tab limit across request environment and workspace tabs', () => {
  const state = createRendererState();
  const requests = Array.from({ length: MAX_OPEN_TABS }, (_value, index) => ({
    id: `request-${index + 1}`,
    name: `Request ${index + 1}`
  }));
  const environment = { id: 'environment-1', name: 'Environment 1', variables: [] };
  const workspaceItem = { id: 'Workspace.json', name: 'Workspace' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests,
        folders: []
      }
    ],
    environments: [environment]
  };
  state.activeEnvironmentId = environment.id;
  state.selectedWorkspaceId = workspaceItem.id;
  state.openRequestTabs = requests.map((request) => ({
    key: `request:collection-1:${request.id}`,
    collectionId: 'collection-1',
    requestId: request.id,
    dirty: false,
    snapshot: JSON.stringify(request)
  }));
  const statuses = [];
  const notifications = [];

  const tabState = createRequestTabState({
    state,
    activeCollection: () => state.workspace.collections[0],
    activeEnvironment: () => environment,
    activeRequest: () => null,
    activeWorkspaceItem: () => workspaceItem,
    notifyUser: (title, message) => notifications.push({ title, message }),
    renderRequestTabs: () => {},
    setStatus: (message) => statuses.push(message),
    workspaceListItems: () => [workspaceItem]
  });

  assert.equal(tabState.ensureOpenEnvironmentTabForActive(), null);
  assert.equal(state.openEnvironmentTabs.length, 0);
  assert.match(statuses.at(-1), new RegExp(`Cannot open more than ${MAX_OPEN_TABS} tabs`));
  assert.deepEqual(notifications.at(-1), {
    title: 'Open Tab Limit Reached',
    message: statuses.at(-1)
  });

  assert.equal(tabState.ensureOpenWorkspaceTabForActive(), null);
  assert.equal(state.openWorkspaceTabs.length, 0);
  assert.match(statuses.at(-1), new RegExp(`Cannot open more than ${MAX_OPEN_TABS} tabs`));
});

test('request tab state discards and closes an active draft tab', async () => {
  const state = createRendererState();
  const draftRequest = { id: 'draft-1', name: 'Unsaved Draft' };
  const draftTab = { key: 'draft:draft-1', requestId: draftRequest.id, draft: true, dirty: true };
  state.draftRequests.set(draftRequest.id, draftRequest);
  state.openRequestTabs = [draftTab];
  state.activeMainPanel = 'request';
  state.activeRequestId = draftRequest.id;
  let clearedWorkspace = 0;
  let renders = 0;
  let collected = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => draftRequest,
    activeWorkspaceItem: () => null,
    clearActiveWorkspaceItem: () => {
      clearedWorkspace += 1;
      state.activeCollectionId = null;
      state.activeFolderId = null;
      state.activeRequestId = null;
    },
    collectRequestFromEditor: () => { collected += 1; },
    promptUnsavedRequestClose: async () => 'discard',
    renderAll: () => { renders += 1; },
    renderCollections: () => {},
    renderRequestTabs: () => {},
    workspaceListItems: () => []
  });

  await tabState.closeRequestTab(draftTab);

  assert.equal(collected, 1);
  assert.equal(state.draftRequests.has(draftRequest.id), false);
  assert.deepEqual(state.openRequestTabs, []);
  assert.equal(clearedWorkspace, 1);
  assert.equal(renders, 1);
});

test('request tab state snapshots environments and restores saved changes when closing a dirty environment tab', async () => {
  const state = createRendererState();
  state.workspace = {
    collections: [],
    environments: [
      { id: 'environment-1', name: 'Saved Environment', variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }] }
    ]
  };
  state.activeMainPanel = 'environment';
  state.activeEnvironmentId = 'environment-1';
  state.openEnvironmentTabs = [
    { key: 'environment:environment-1', environmentId: 'environment-1', dirty: true, snapshot: JSON.stringify(state.workspace.environments[0]) }
  ];
  let collected = 0;
  let renders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => state.workspace.environments[0],
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    collectEnvironmentFromEditor: () => {
      collected += 1;
      state.workspace.environments[0].name = 'Edited Environment';
    },
    promptUnsavedRequestClose: async () => 'discard',
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => {},
    workspaceListItems: () => []
  });

  const ensuredTab = tabState.ensureOpenEnvironmentTabForActive();
  assert.equal(ensuredTab.snapshot, JSON.stringify({ id: 'environment-1', name: 'Saved Environment', variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }] }));

  await tabState.closeEnvironmentTab(state.openEnvironmentTabs[0]);

  assert.equal(collected, 1);
  assert.equal(state.workspace.environments[0].name, 'Saved Environment');
  assert.deepEqual(state.openEnvironmentTabs, []);
  assert.equal(state.activeEnvironmentId, 'none');
  assert.equal(renders, 1);
});

test('request tab state keeps environment mode when discarding the last active unsaved environment tab', async () => {
  const state = createRendererState();
  state.workspace = {
    collections: [],
    environments: [
      { id: 'environment-1', name: 'New Environment', variables: [] }
    ]
  };
  state.activeSidebarPanel = 'environments';
  state.activeMainPanel = 'environment';
  state.activeEnvironmentId = 'environment-1';
  state.openEnvironmentTabs = [
    {
      key: 'environment:environment-1',
      environmentId: 'environment-1',
      dirty: true,
      createdUnsaved: true,
      snapshot: JSON.stringify(state.workspace.environments[0])
    }
  ];
  let renders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => state.workspace.environments[0] || null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    collectEnvironmentFromEditor: () => {},
    promptUnsavedRequestClose: async () => 'discard',
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => {},
    workspaceListItems: () => []
  });

  await tabState.closeEnvironmentTab(state.openEnvironmentTabs[0]);

  assert.deepEqual(state.workspace.environments, []);
  assert.deepEqual(state.openEnvironmentTabs, []);
  assert.equal(state.activeEnvironmentId, 'none');
  assert.equal(state.activeSidebarPanel, 'environments');
  assert.equal(state.activeMainPanel, 'environment');
  assert.equal(renders, 1);
});

test('request tab state selects workspace tabs without switching the loaded workspace id', () => {
  const state = createRendererState();
  state.activeWorkspaceId = 'Workspace.json';
  state.selectedWorkspaceId = 'Workspace.json';
  state.activeSidebarPanel = 'collections';
  state.activeMainPanel = 'request';
  state.openWorkspaceTabs = [
    { key: 'workspace:Workspace 2.json', workspaceId: 'Workspace 2.json', dirty: false }
  ];
  let tabRenders = 0;
  let renders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => [{ id: 'Workspace.json' }, { id: 'Workspace 2.json' }].find((item) => item.id === state.selectedWorkspaceId) || null,
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => [
      { id: 'Workspace.json', name: 'Workspace', current: true, deletable: true },
      { id: 'Workspace 2.json', name: 'Workspace 2', current: false, deletable: true }
    ]
  });

  tabState.selectWorkspaceTab(state.openWorkspaceTabs[0]);

  assert.equal(state.activeWorkspaceId, 'Workspace.json');
  assert.equal(state.selectedWorkspaceId, 'Workspace 2.json');
  assert.equal(state.activeSidebarPanel, 'workspaces');
  assert.equal(state.activeMainPanel, 'workspace');
  assert.equal(renders, 1);
  assert.equal(tabRenders, 1);
});

test('request tab state restores shared collection-variable and cookie changes when discarding a saved request tab', async () => {
  const state = createRendererState();
  const request = { id: 'request-1', name: 'Saved Request', method: 'GET', url: 'https://saved.example.test' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests: [request],
        variables: [{ enabled: true, key: 'baseUrl', value: 'https://edited.example.test' }],
        folders: []
      }
    ],
    environments: [],
    cookies: [{ enabled: true, name: 'session', value: 'edited', domain: 'saved.example.test', path: '/' }]
  };
  state.collectionDirtySnapshots.set('collection-1', JSON.stringify([{ enabled: true, key: 'baseUrl', value: 'https://saved.example.test' }]));
  state.collectionDirtyOwners.set('collection-1', 'request:collection-1:request-1');
  state.cookieJarDirtySnapshot = JSON.stringify([{ enabled: true, name: 'session', value: 'saved', domain: 'saved.example.test', path: '/' }]);
  state.cookieJarDirtyOwner = 'request:collection-1:request-1';
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = 'request-1';
  state.activeMainPanel = 'request';
  state.openRequestTabs = [
    {
      key: 'request:collection-1:request-1',
      collectionId: 'collection-1',
      requestId: 'request-1',
      dirty: false,
      createdUnsaved: false,
      snapshot: JSON.stringify(request)
    }
  ];
  let renders = 0;
  let prompted = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => state.workspace.collections[0],
    activeEnvironment: () => null,
    activeRequest: () => state.workspace.collections[0].requests[0],
    activeWorkspaceItem: () => null,
    collectRequestFromEditor: () => {},
    findRequest(collection, requestId) {
      const found = collection.requests.find((item) => item.id === requestId);
      return found ? { request: found, folder: null } : null;
    },
    promptUnsavedRequestClose: async () => {
      prompted += 1;
      return 'discard';
    },
    renderAll: () => { renders += 1; },
    renderCollections: () => {},
    renderRequestTabs: () => {},
    workspaceListItems: () => []
  });

  await tabState.closeRequestTab(state.openRequestTabs[0]);

  assert.equal(prompted, 1);
  assert.deepEqual(state.openRequestTabs, []);
  assert.deepEqual(state.workspace.collections[0].variables, [{ enabled: true, key: 'baseUrl', value: 'https://saved.example.test' }]);
  assert.deepEqual(state.workspace.cookies, [{ enabled: true, name: 'session', value: 'saved', domain: 'saved.example.test', path: '/' }]);
  assert.equal(state.collectionDirtySnapshots.size, 0);
  assert.equal(state.cookieJarDirtySnapshot, null);
  assert.equal(renders, 1);
});

test('request tab state does not re-collect a discarded active request when selecting the fallback tab', async () => {
  const state = createRendererState();
  const firstRequest = { id: 'request-1', name: 'First Request', method: 'GET', url: 'https://saved.example.test/first' };
  const secondRequest = { id: 'request-2', name: 'Second Request', method: 'GET', url: 'https://saved.example.test/second' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests: [firstRequest, secondRequest],
        folders: []
      }
    ],
    environments: []
  };
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = firstRequest.id;
  state.activeMainPanel = 'request';
  state.openRequestTabs = [
    {
      key: 'request:collection-1:request-1',
      collectionId: 'collection-1',
      requestId: firstRequest.id,
      dirty: true,
      createdUnsaved: false,
      draft: false,
      snapshot: JSON.stringify(firstRequest)
    },
    {
      key: 'request:collection-1:request-2',
      collectionId: 'collection-1',
      requestId: secondRequest.id,
      dirty: false,
      createdUnsaved: false,
      draft: false,
      snapshot: JSON.stringify(secondRequest)
    }
  ];
  let collected = 0;
  let tabState;
  tabState = createRequestTabState({
    state,
    activeCollection: () => state.workspace.collections[0],
    activeEnvironment: () => null,
    activeRequest: () => state.workspace.collections[0].requests.find((request) => request.id === state.activeRequestId) || null,
    activeWorkspaceItem: () => null,
    collectRequestFromEditor: () => {
      collected += 1;
      const request = state.workspace.collections[0].requests.find((item) => item.id === state.activeRequestId);
      if (request) {
        request.url = 'https://edited.example.test/should-not-survive-discard';
      }
    },
    findRequest(collection, requestId) {
      const found = collection.requests.find((item) => item.id === requestId);
      return found ? { request: found, folder: null } : null;
    },
    promptUnsavedRequestClose: async () => 'discard',
    renderAll: () => {},
    renderCollections: () => {},
    renderRequestTabs: () => {},
    selectRequestTab: (tab, options) => tabState.selectRequestTab(tab, options),
    workspaceListItems: () => []
  });

  await tabState.closeRequestTab(state.openRequestTabs[0]);

  assert.equal(collected, 1);
  assert.deepEqual(state.openRequestTabs.map((tab) => tab.key), ['request:collection-1:request-2']);
  assert.equal(state.activeRequestId, secondRequest.id);
  assert.equal(firstRequest.url, 'https://saved.example.test/first');
});

test('request tab state saves the requested environment tab when closing an inactive dirty environment', async () => {
  const state = createRendererState();
  const savedEnvironment = { id: 'environment-1', name: 'Saved Environment', variables: [] };
  state.workspace = {
    collections: [],
    environments: [savedEnvironment]
  };
  state.activeMainPanel = 'request';
  state.activeEnvironmentId = 'none';
  state.openEnvironmentTabs = [
    {
      key: 'environment:environment-1',
      environmentId: 'environment-1',
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(savedEnvironment)
    }
  ];
  const persistCalls = [];
  let renders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    persistWorkspace: async (showStatus, config) => {
      persistCalls.push({ showStatus, config });
      state.openEnvironmentTabs[0].dirty = false;
      state.openEnvironmentTabs[0].createdUnsaved = false;
      return true;
    },
    promptUnsavedRequestClose: async () => 'save',
    renderAll: () => {},
    renderRequestTabs: () => { renders += 1; },
    workspaceListItems: () => []
  });

  await tabState.closeEnvironmentTab(state.openEnvironmentTabs[0]);

  assert.deepEqual(persistCalls, [{ showStatus: false, config: { environmentTabKey: 'environment:environment-1' } }]);
  assert.deepEqual(state.openEnvironmentTabs, []);
  assert.equal(renders, 1);
});

test('request tab state keeps a dirty environment tab open and reports failed close-save persistence', async () => {
  const state = createRendererState();
  const savedEnvironment = { id: 'environment-1', name: 'Saved Environment', variables: [] };
  state.workspace = {
    collections: [],
    environments: [savedEnvironment]
  };
  state.activeMainPanel = 'request';
  state.activeEnvironmentId = 'none';
  state.openEnvironmentTabs = [
    {
      key: 'environment:environment-1',
      environmentId: 'environment-1',
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(savedEnvironment)
    }
  ];
  const statuses = [];
  const notifications = [];
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    notifyUser: (title, message) => notifications.push({ title, message }),
    persistWorkspace: async () => {
      throw new Error('disk full');
    },
    promptUnsavedRequestClose: async () => 'save',
    renderAll: () => {},
    renderRequestTabs: () => { tabRenders += 1; },
    setStatus: (message) => statuses.push(message),
    workspaceListItems: () => []
  });

  await tabState.closeEnvironmentTab(state.openEnvironmentTabs[0]);

  assert.equal(state.openEnvironmentTabs.length, 1);
  assert.equal(state.openEnvironmentTabs[0].dirty, true);
  assert.match(statuses.at(-1), /Environment Save Failed: disk full/);
  assert.deepEqual(notifications.at(-1), { title: 'Environment Save Failed', message: 'disk full' });
  assert.equal(tabRenders, 1);
});

test('request tab state saves the requested request tab when closing an inactive dirty request', async () => {
  const state = createRendererState();
  const request = { id: 'request-1', name: 'Saved Request', method: 'GET', url: 'https://saved.example.test' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests: [request],
        folders: []
      }
    ],
    environments: []
  };
  state.activeMainPanel = 'environment';
  state.activeCollectionId = null;
  state.activeRequestId = null;
  state.openRequestTabs = [
    {
      key: 'request:collection-1:request-1',
      collectionId: 'collection-1',
      requestId: 'request-1',
      dirty: true,
      createdUnsaved: false,
      draft: false,
      snapshot: JSON.stringify(request)
    }
  ];
  const persistCalls = [];
  let collectionRenders = 0;
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    findRequest(collection, requestId) {
      const found = collection.requests.find((item) => item.id === requestId);
      return found ? { request: found, folder: null } : null;
    },
    persistWorkspace: async (showStatus, config) => {
      persistCalls.push({ showStatus, config });
      state.openRequestTabs[0].dirty = false;
      state.openRequestTabs[0].createdUnsaved = false;
      return true;
    },
    promptUnsavedRequestClose: async () => 'save',
    renderAll: () => {},
    renderCollections: () => { collectionRenders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  await tabState.closeRequestTab(state.openRequestTabs[0]);

  assert.deepEqual(persistCalls, [{ showStatus: false, config: { requestTabKey: 'request:collection-1:request-1' } }]);
  assert.deepEqual(state.openRequestTabs, []);
  assert.equal(collectionRenders, 1);
  assert.equal(tabRenders, 1);
});

test('request tab state keeps a dirty request tab open and reports failed close-save persistence', async () => {
  const state = createRendererState();
  const request = { id: 'request-1', name: 'Saved Request', method: 'GET', url: 'https://saved.example.test' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests: [request],
        folders: []
      }
    ],
    environments: []
  };
  state.activeMainPanel = 'environment';
  state.openRequestTabs = [
    {
      key: 'request:collection-1:request-1',
      collectionId: 'collection-1',
      requestId: 'request-1',
      dirty: true,
      createdUnsaved: false,
      draft: false,
      snapshot: JSON.stringify(request)
    }
  ];
  const statuses = [];
  const notifications = [];
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    findRequest(collection, requestId) {
      const found = collection.requests.find((item) => item.id === requestId);
      return found ? { request: found, folder: null } : null;
    },
    notifyUser: (title, message) => notifications.push({ title, message }),
    persistWorkspace: async () => {
      throw new Error('disk full');
    },
    promptUnsavedRequestClose: async () => 'save',
    renderAll: () => {},
    renderCollections: () => {},
    renderRequestTabs: () => { tabRenders += 1; },
    setStatus: (message) => statuses.push(message),
    workspaceListItems: () => []
  });

  await tabState.closeRequestTab(state.openRequestTabs[0]);

  assert.equal(state.openRequestTabs.length, 1);
  assert.equal(state.openRequestTabs[0].dirty, true);
  assert.match(statuses.at(-1), /Request Save Failed: disk full/);
  assert.deepEqual(notifications.at(-1), { title: 'Request Save Failed', message: 'disk full' });
  assert.equal(tabRenders, 1);
});
