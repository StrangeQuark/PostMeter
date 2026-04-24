const assert = require('node:assert/strict');
const test = require('node:test');
const { createRendererState } = require('../../src/renderer/rendererState');
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
