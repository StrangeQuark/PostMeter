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

test('request tab state opens and dirties collection tabs with snapshots', () => {
  const state = createRendererState();
  const collection = {
    id: 'collection-1',
    name: 'Collection One',
    description: '',
    variables: [],
    requests: [],
    folders: []
  };
  state.workspace = {
    collections: [collection],
    environments: []
  };
  state.activeMainPanel = 'request';
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = null;
  let renders = 0;
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => collection,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  const tab = tabState.ensureOpenCollectionTabForActive();
  assert.equal(tab.key, 'collection:collection-1');
  assert.equal(tab.collectionId, 'collection-1');
  assert.equal(tab.snapshot, JSON.stringify(collection));
  assert.equal(state.openCollectionTabs.length, 1);

  tabState.markActiveCollectionTabDirty();
  assert.equal(tab.dirty, true);

  state.activeCollectionId = null;
  tabState.selectCollectionTab(tab, { collect: false });
  assert.equal(state.activeMainPanel, 'request');
  assert.equal(state.activeSidebarPanel, 'collections');
  assert.equal(state.activeCollectionId, 'collection-1');
  assert.equal(state.activeRequestId, null);
  assert.equal(renders, 1);
  assert.equal(tabRenders, 4);
});

test('request tab state opens and dirties folder tabs with snapshots', () => {
  const state = createRendererState();
  const folder = {
    id: 'folder-1',
    name: 'Folder One',
    description: '',
    variables: [],
    requests: [],
    folders: []
  };
  const collection = {
    id: 'collection-1',
    name: 'Collection One',
    description: '',
    variables: [],
    requests: [],
    folders: [folder]
  };
  state.workspace = {
    collections: [collection],
    environments: []
  };
  state.activeMainPanel = 'request';
  state.activeCollectionId = 'collection-1';
  state.activeFolderId = 'folder-1';
  state.activeRequestId = null;
  let renders = 0;
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => collection,
    activeEnvironment: () => null,
    activeFolder: () => folder,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    findFolder: (_collection, folderId) => folderId === folder.id ? folder : null,
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  const tab = tabState.ensureOpenFolderTabForActive();
  assert.equal(tab.key, 'folder:collection-1:folder-1');
  assert.equal(tab.collectionId, 'collection-1');
  assert.equal(tab.folderId, 'folder-1');
  assert.equal(tab.snapshot, JSON.stringify(folder));
  assert.equal(state.openFolderTabs.length, 1);

  tabState.markActiveFolderTabDirty();
  assert.equal(tab.dirty, true);

  state.activeCollectionId = null;
  state.activeFolderId = null;
  tabState.selectFolderTab(tab, { collect: false });
  assert.equal(state.activeMainPanel, 'request');
  assert.equal(state.activeSidebarPanel, 'collections');
  assert.equal(state.activeCollectionId, 'collection-1');
  assert.equal(state.activeFolderId, 'folder-1');
  assert.equal(state.activeRequestId, null);
  assert.equal(renders, 1);
  assert.equal(tabRenders, 4);
});

test('request tab state prompts for dirty collection tabs and can discard or save them', async () => {
  const state = createRendererState();
  const collection = {
    id: 'collection-1',
    name: 'Edited Collection',
    variables: [],
    requests: [],
    folders: []
  };
  state.workspace = {
    collections: [collection],
    environments: []
  };
  state.activeMainPanel = 'request';
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = null;
  state.openCollectionTabs = [{
    key: 'collection:collection-1',
    collectionId: 'collection-1',
    dirty: true,
    createdUnsaved: false,
    snapshot: JSON.stringify({ ...collection, name: 'Saved Collection' })
  }];
  const prompted = [];
  let collected = 0;
  let renders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => state.workspace.collections.find((item) => item.id === state.activeCollectionId) || null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    collectCollectionFromEditor: () => { collected += 1; },
    promptUnsavedRequestClose: async (tab, item) => {
      prompted.push({ tab, item });
      return 'discard';
    },
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => {},
    workspaceListItems: () => []
  });

  await tabState.closeCollectionTab(state.openCollectionTabs[0]);

  assert.equal(prompted.length, 1);
  assert.equal(prompted[0].item.id, collection.id);
  assert.equal(collected, 1);
  assert.equal(state.workspace.collections[0].name, 'Saved Collection');
  assert.equal(state.openCollectionTabs.length, 0);
  assert.equal(state.activeCollectionId, null);
  assert.equal(renders, 1);

  state.workspace.collections[0].name = 'Edited Again';
  state.activeCollectionId = 'collection-1';
  state.openCollectionTabs = [{
    key: 'collection:collection-1',
    collectionId: 'collection-1',
    dirty: true,
    createdUnsaved: false,
    snapshot: JSON.stringify({ ...state.workspace.collections[0], name: 'Saved Again' })
  }];
  let saveConfig = null;
  const saveTabState = createRequestTabState({
    state,
    activeCollection: () => state.workspace.collections.find((item) => item.id === state.activeCollectionId) || null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeWorkspaceItem: () => null,
    collectCollectionFromEditor: () => { collected += 1; },
    persistWorkspace: async (_showStatus, config) => {
      saveConfig = config;
      state.openCollectionTabs[0].dirty = false;
      return true;
    },
    promptUnsavedRequestClose: async () => 'save',
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => {},
    workspaceListItems: () => []
  });

  await saveTabState.closeCollectionTab(state.openCollectionTabs[0]);

  assert.deepEqual(saveConfig, { collectionTabKey: 'collection:collection-1', collectEditors: false });
  assert.equal(state.workspace.collections[0].name, 'Edited Again');
  assert.equal(state.openCollectionTabs.length, 0);
});

test('request tab state opens and selects runner-owned request tabs independently from collections', () => {
  const state = createRendererState();
  const runnerRequest = { id: 'runner-request-1', name: 'Runner Local Request', method: 'POST', url: 'https://runner.example.test' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests: [{ id: 'request-1', name: 'Collection Request' }],
        folders: []
      }
    ],
    environments: [],
    runners: [{ id: 'runner-1', name: 'Runner', requests: [runnerRequest] }]
  };
  state.activeMainPanel = 'request';
  state.activeRunnerConfigId = 'runner-1';
  state.activeRunnerRequestRunnerId = 'runner-1';
  state.activeRequestId = 'runner-request-1';
  let renders = 0;
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => runnerRequest,
    activeRunner: () => state.workspace.runners[0],
    activeWorkspaceItem: () => null,
    findRequest: () => null,
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  const tab = tabState.ensureOpenRequestTabForActive();

  assert.equal(tab.key, 'runner-request:runner-1:runner-request-1');
  assert.equal(tab.runnerRequest, true);
  assert.equal(tab.runnerId, 'runner-1');
  assert.equal(tab.collectionId, null);
  assert.equal(tab.draft, false);
  assert.equal(tab.snapshot, JSON.stringify(runnerRequest));
  assert.equal(tabState.requestForTab(tab), runnerRequest);

  state.activeRunnerRequestRunnerId = null;
  state.activeRunnerConfigId = null;
  state.activeRequestId = null;
  tabState.selectRequestTab(tab, { collect: false });

  assert.equal(state.activeSidebarPanel, 'runners');
  assert.equal(state.activeMainPanel, 'request');
  assert.equal(state.activeRunnerConfigId, 'runner-1');
  assert.equal(state.activeRunnerRequestRunnerId, 'runner-1');
  assert.equal(state.activeCollectionId, null);
  assert.equal(state.activeRequestId, 'runner-request-1');
  assert.equal(renders, 1);
  assert.equal(tabRenders, 2);
});

test('request tab state opens and selects auth refresh request tabs independently from collections', () => {
  const state = createRendererState();
  const runnerAuthRequest = { id: 'runner-auth-request-1', name: 'Runner Refresh Auth', method: 'POST', url: 'https://runner.example.test/token' };
  const runnerRefreshTokenRequest = { id: 'runner-refresh-token-request-1', name: 'Runner Refresh Token', method: 'POST', url: 'https://runner.example.test/refresh-token' };
  const performanceAuthRequest = { id: 'performance-auth-request-1', name: 'Performance Refresh Auth', method: 'GET', url: 'https://perf.example.test/token' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests: [{ id: 'request-1', name: 'Collection Request' }],
        folders: []
      }
    ],
    environments: [],
    runners: [{ id: 'runner-1', name: 'Runner', authRefresh: { request: runnerAuthRequest, refreshTokenRequest: runnerRefreshTokenRequest }, requests: [] }],
    performanceTests: [{ id: 'performance-1', name: 'Performance', authRefresh: { request: performanceAuthRequest } }]
  };
  state.activeMainPanel = 'request';
  state.activeRunnerConfigId = 'runner-1';
  state.activeAuthRefreshRequestOwnerType = 'runner';
  state.activeAuthRefreshRequestOwnerId = 'runner-1';
  state.activeRequestId = runnerAuthRequest.id;
  let renders = 0;
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => runnerAuthRequest,
    activeRunner: () => state.workspace.runners[0],
    activeWorkspaceItem: () => null,
    findRequest: () => null,
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  const runnerTab = tabState.ensureOpenRequestTabForActive();

  assert.equal(runnerTab.key, 'auth-request:runner:runner-1:runner-auth-request-1');
  assert.equal(runnerTab.authRefreshRequest, true);
  assert.equal(runnerTab.authRefreshOwnerType, 'runner');
  assert.equal(runnerTab.authRefreshOwnerId, 'runner-1');
  assert.equal(runnerTab.runnerRequest, false);
  assert.equal(runnerTab.collectionId, null);
  assert.equal(runnerTab.draft, false);
  assert.equal(runnerTab.snapshot, JSON.stringify(runnerAuthRequest));
  assert.equal(tabState.requestForTab(runnerTab), runnerAuthRequest);
  assert.equal(tabState.canOpenAuthRefreshRequestTabFor('performance', 'performance-1', performanceAuthRequest.id), true);
  const runnerRefreshTokenTab = {
    key: 'auth-request:runner:runner-1:runner-refresh-token-request-1',
    requestId: runnerRefreshTokenRequest.id,
    authRefreshRequest: true,
    authRefreshOwnerType: 'runner',
    authRefreshOwnerId: 'runner-1'
  };
  assert.equal(tabState.requestForTab(runnerRefreshTokenTab), runnerRefreshTokenRequest);
  assert.equal(tabState.canOpenAuthRefreshRequestTabFor('runner', 'runner-1', runnerRefreshTokenRequest.id), true);

  const performanceTab = {
    key: 'auth-request:performance:performance-1:performance-auth-request-1',
    requestId: performanceAuthRequest.id,
    authRefreshRequest: true,
    authRefreshOwnerType: 'performance',
    authRefreshOwnerId: 'performance-1'
  };
  state.openRequestTabs.push(performanceTab);
  state.activeAuthRefreshRequestOwnerType = '';
  state.activeAuthRefreshRequestOwnerId = null;
  state.activeRunnerConfigId = null;
  state.activePerformanceTestId = null;
  state.activeRequestId = null;

  tabState.selectRequestTab(performanceTab, { collect: false });

  assert.equal(state.activeSidebarPanel, 'performance');
  assert.equal(state.activeMainPanel, 'request');
  assert.equal(state.activePerformanceTestId, 'performance-1');
  assert.equal(state.activeAuthRefreshRequestOwnerType, 'performance');
  assert.equal(state.activeAuthRefreshRequestOwnerId, 'performance-1');
  assert.equal(state.activeRunnerRequestRunnerId, null);
  assert.equal(state.activeCollectionId, null);
  assert.equal(state.activeRequestId, 'performance-auth-request-1');
  assert.equal(renders, 1);
  assert.equal(tabRenders, 2);
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
  assert.equal(tabState.canOpenRunnerTabFor(''), false);
  assert.equal(tabState.canOpenPerformanceTabFor(''), false);
  assert.deepEqual(statuses, []);
  assert.deepEqual(notifications, []);
});

test('request tab state refuses to open environment workspace runner and performance tabs beyond the bounded limit', () => {
  const state = createRendererState();
  const environments = Array.from({ length: MAX_OPEN_TABS + 1 }, (_value, index) => ({
    id: `environment-${index + 1}`,
    name: `Environment ${index + 1}`,
    variables: []
  }));
  const runners = Array.from({ length: MAX_OPEN_TABS + 1 }, (_value, index) => ({
    id: `runner-${index + 1}`,
    name: `Runner ${index + 1}`,
    requests: []
  }));
  const performanceTests = Array.from({ length: MAX_OPEN_TABS + 1 }, (_value, index) => ({
    id: `performance-${index + 1}`,
    name: `Performance ${index + 1}`
  }));
  const workspaceItems = Array.from({ length: MAX_OPEN_TABS + 1 }, (_value, index) => ({
    id: `Workspace ${index + 1}.json`,
    name: `Workspace ${index + 1}`
  }));
  state.workspace = {
    collections: [],
    environments,
    runners,
    performanceTests
  };
  state.activeEnvironmentId = environments.at(-1).id;
  state.activeRunnerConfigId = runners.at(-1).id;
  state.activePerformanceTestId = performanceTests.at(-1).id;
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
  state.openRunnerTabs = runners.slice(0, MAX_OPEN_TABS).map((runner) => ({
    key: `runner:${runner.id}`,
    runnerId: runner.id,
    dirty: false,
    snapshot: JSON.stringify(runner)
  }));
  state.openPerformanceTabs = performanceTests.slice(0, MAX_OPEN_TABS).map((performanceTest) => ({
    key: `performance:${performanceTest.id}`,
    performanceTestId: performanceTest.id,
    dirty: false,
    snapshot: JSON.stringify(performanceTest)
  }));
  const statuses = [];
  const notifications = [];

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => environments.at(-1),
    activePerformanceTest: () => performanceTests.at(-1),
    activeRequest: () => null,
    activeRunner: () => runners.at(-1),
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

  assert.equal(tabState.ensureOpenRunnerTabForActive(), null);
  assert.equal(state.openRunnerTabs.length, MAX_OPEN_TABS);
  assert.equal(state.openRunnerTabs.some((candidate) => candidate.runnerId === runners.at(-1).id), false);
  assert.match(statuses.at(-1), new RegExp(`Cannot open more than ${MAX_OPEN_TABS} tabs`));
  assert.deepEqual(notifications.at(-1), {
    title: 'Open Tab Limit Reached',
    message: statuses.at(-1)
  });

  assert.equal(tabState.ensureOpenPerformanceTabForActive(), null);
  assert.equal(state.openPerformanceTabs.length, MAX_OPEN_TABS);
  assert.equal(state.openPerformanceTabs.some((candidate) => candidate.performanceTestId === performanceTests.at(-1).id), false);
  assert.match(statuses.at(-1), new RegExp(`Cannot open more than ${MAX_OPEN_TABS} tabs`));
  assert.deepEqual(notifications.at(-1), {
    title: 'Open Tab Limit Reached',
    message: statuses.at(-1)
  });
});

test('request tab state applies the open tab limit across request environment workspace runner and performance tabs', () => {
  const state = createRendererState();
  const requests = Array.from({ length: MAX_OPEN_TABS }, (_value, index) => ({
    id: `request-${index + 1}`,
    name: `Request ${index + 1}`
  }));
  const environment = { id: 'environment-1', name: 'Environment 1', variables: [] };
  const runner = { id: 'runner-1', name: 'Runner 1', requests: [] };
  const performanceTest = { id: 'performance-1', name: 'Performance 1' };
  const workspaceItem = { id: 'Workspace.json', name: 'Workspace' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        requests,
        folders: []
      }
    ],
    environments: [environment],
    runners: [runner],
    performanceTests: [performanceTest]
  };
  state.activeEnvironmentId = environment.id;
  state.activeRunnerConfigId = runner.id;
  state.activePerformanceTestId = performanceTest.id;
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
    activePerformanceTest: () => performanceTest,
    activeRequest: () => null,
    activeRunner: () => runner,
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

  assert.equal(tabState.ensureOpenRunnerTabForActive(), null);
  assert.equal(state.openRunnerTabs.length, 0);
  assert.match(statuses.at(-1), new RegExp(`Cannot open more than ${MAX_OPEN_TABS} tabs`));

  assert.equal(tabState.ensureOpenPerformanceTabForActive(), null);
  assert.equal(state.openPerformanceTabs.length, 0);
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

test('request tab state saves dirty runner-owned request tabs with a targeted request save', async () => {
  const state = createRendererState();
  const runnerRequest = { id: 'runner-request-1', name: 'Runner Request', method: 'GET', url: 'https://runner.example.test' };
  state.workspace = {
    collections: [],
    environments: [],
    runners: [{ id: 'runner-1', name: 'Runner', requests: [runnerRequest] }]
  };
  state.activeMainPanel = 'runner';
  state.openRequestTabs = [
    {
      key: 'runner-request:runner-1:runner-request-1',
      runnerId: 'runner-1',
      requestId: 'runner-request-1',
      runnerRequest: true,
      dirty: true,
      createdUnsaved: false,
      draft: false,
      snapshot: JSON.stringify(runnerRequest)
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
    activeRunner: () => state.workspace.runners[0],
    activeWorkspaceItem: () => null,
    persistWorkspace: async (showStatus, config) => {
      persistCalls.push({ showStatus, config });
      state.openRequestTabs[0].dirty = false;
      return true;
    },
    promptUnsavedRequestClose: async () => 'save',
    renderAll: () => {},
    renderCollections: () => { collectionRenders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  await tabState.closeRequestTab(state.openRequestTabs[0]);

  assert.deepEqual(persistCalls, [{ showStatus: false, config: { requestTabKey: 'runner-request:runner-1:runner-request-1', collectEditors: false } }]);
  assert.deepEqual(state.openRequestTabs, []);
  assert.equal(collectionRenders, 1);
  assert.equal(tabRenders, 1);
});

test('request tab state saves dirty auth refresh request tabs with a targeted request save', async () => {
  const state = createRendererState();
  const authRequest = { id: 'auth-request-1', name: 'Refresh Auth', method: 'POST', url: 'https://auth.example.test/token' };
  state.workspace = {
    collections: [],
    environments: [],
    runners: [{ id: 'runner-1', name: 'Runner', authRefresh: { request: authRequest }, requests: [] }]
  };
  state.activeMainPanel = 'runner';
  state.openRequestTabs = [
    {
      key: 'auth-request:runner:runner-1:auth-request-1',
      requestId: 'auth-request-1',
      authRefreshRequest: true,
      authRefreshOwnerType: 'runner',
      authRefreshOwnerId: 'runner-1',
      dirty: true,
      createdUnsaved: false,
      draft: false,
      snapshot: JSON.stringify(authRequest)
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
    activeRunner: () => state.workspace.runners[0],
    activeWorkspaceItem: () => null,
    persistWorkspace: async (showStatus, config) => {
      persistCalls.push({ showStatus, config });
      state.openRequestTabs[0].dirty = false;
      return true;
    },
    promptUnsavedRequestClose: async () => 'save',
    renderAll: () => {},
    renderCollections: () => { collectionRenders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  await tabState.closeRequestTab(state.openRequestTabs[0]);

  assert.deepEqual(persistCalls, [{ showStatus: false, config: { requestTabKey: 'auth-request:runner:runner-1:auth-request-1', collectEditors: false } }]);
  assert.deepEqual(state.openRequestTabs, []);
  assert.equal(collectionRenders, 1);
  assert.equal(tabRenders, 1);
});

test('request tab state re-renders active runner pane after discarding runner-owned request changes', async () => {
  const state = createRendererState();
  const runnerRequest = { id: 'runner-request-1', name: 'Saved Runner Request', method: 'GET', url: 'https://saved.example.test' };
  state.workspace = {
    collections: [],
    environments: [],
    runners: [{ id: 'runner-1', name: 'Runner', requests: [runnerRequest] }]
  };
  state.activeMainPanel = 'runner';
  state.activeSidebarPanel = 'runners';
  state.activeRunnerConfigId = 'runner-1';
  state.openRequestTabs = [
    {
      key: 'runner-request:runner-1:runner-request-1',
      runnerId: 'runner-1',
      requestId: 'runner-request-1',
      runnerRequest: true,
      dirty: true,
      draft: false,
      snapshot: JSON.stringify(runnerRequest)
    }
  ];
  runnerRequest.name = 'Unsaved Runner Request';
  let allRenders = 0;
  let collectionRenders = 0;
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeRunner: () => state.workspace.runners[0],
    activeWorkspaceItem: () => null,
    promptUnsavedRequestClose: async () => 'discard',
    renderAll: () => { allRenders += 1; },
    renderCollections: () => { collectionRenders += 1; },
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  await tabState.closeRequestTab(state.openRequestTabs[0]);

  assert.equal(runnerRequest.name, 'Saved Runner Request');
  assert.deepEqual(state.openRequestTabs, []);
  assert.equal(allRenders, 1);
  assert.equal(collectionRenders, 0);
  assert.equal(tabRenders, 0);
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

test('request tab state snapshots runners and restores saved changes when closing a dirty runner tab', async () => {
  const state = createRendererState();
  const savedRunner = {
    id: 'runner-1',
    name: 'Saved Runner',
    environmentId: 'none',
    requests: [{ id: 'request-1', name: 'Saved Runner Request', method: 'GET', url: 'https://saved.example.test' }]
  };
  state.workspace = {
    collections: [],
    environments: [],
    runners: [savedRunner]
  };
  state.activeSidebarPanel = 'runners';
  state.activeMainPanel = 'runner';
  state.activeRunnerConfigId = savedRunner.id;
  state.openRunnerTabs = [
    {
      key: 'runner:runner-1',
      runnerId: savedRunner.id,
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(savedRunner)
    }
  ];
  let collected = 0;
  let renders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeRunner: () => state.workspace.runners.find((runner) => runner.id === state.activeRunnerConfigId) || null,
    activeWorkspaceItem: () => null,
    collectRunnerFromEditor: () => {
      collected += 1;
      state.workspace.runners[0].name = 'Edited Runner';
      state.workspace.runners[0].requests[0].url = 'https://edited.example.test';
    },
    promptUnsavedRequestClose: async () => 'discard',
    renderAll: () => { renders += 1; },
    renderRequestTabs: () => {},
    workspaceListItems: () => []
  });

  await tabState.closeRunnerTab(state.openRunnerTabs[0]);

  assert.equal(collected, 1);
  assert.deepEqual(state.workspace.runners, [savedRunner]);
  assert.equal(state.workspace.runners[0].name, 'Saved Runner');
  assert.equal(state.workspace.runners[0].requests[0].url, 'https://saved.example.test');
  assert.deepEqual(state.openRunnerTabs, []);
  assert.equal(state.activeRunnerConfigId, null);
  assert.equal(state.activeSidebarPanel, 'runners');
  assert.equal(state.activeMainPanel, 'runner');
  assert.equal(renders, 1);
});

test('request tab state saves the requested runner tab when closing an inactive dirty runner', async () => {
  const state = createRendererState();
  const savedRunner = { id: 'runner-1', name: 'Saved Runner', requests: [] };
  state.workspace = {
    collections: [],
    environments: [],
    runners: [savedRunner]
  };
  state.activeMainPanel = 'request';
  state.openRunnerTabs = [
    {
      key: 'runner:runner-1',
      runnerId: savedRunner.id,
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(savedRunner)
    }
  ];
  const persistCalls = [];
  let tabRenders = 0;

  const tabState = createRequestTabState({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    activeRunner: () => null,
    activeWorkspaceItem: () => null,
    persistWorkspace: async (showStatus, config) => {
      persistCalls.push({ showStatus, config });
      state.openRunnerTabs[0].dirty = false;
      state.openRunnerTabs[0].createdUnsaved = false;
      return true;
    },
    promptUnsavedRequestClose: async () => 'save',
    renderAll: () => {},
    renderRequestTabs: () => { tabRenders += 1; },
    workspaceListItems: () => []
  });

  await tabState.closeRunnerTab(state.openRunnerTabs[0]);

  assert.deepEqual(persistCalls, [{ showStatus: false, config: { runnerTabKey: 'runner:runner-1', collectEditors: false } }]);
  assert.deepEqual(state.openRunnerTabs, []);
  assert.equal(tabRenders, 1);
});

test('request tab state keeps a dirty runner tab open and reports failed close-save persistence', async () => {
  const state = createRendererState();
  const savedRunner = { id: 'runner-1', name: 'Saved Runner', requests: [] };
  state.workspace = {
    collections: [],
    environments: [],
    runners: [savedRunner]
  };
  state.activeMainPanel = 'request';
  state.openRunnerTabs = [
    {
      key: 'runner:runner-1',
      runnerId: savedRunner.id,
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(savedRunner)
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
    activeRunner: () => null,
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

  await tabState.closeRunnerTab(state.openRunnerTabs[0]);

  assert.equal(state.openRunnerTabs.length, 1);
  assert.equal(state.openRunnerTabs[0].dirty, true);
  assert.match(statuses.at(-1), /Runner Save Failed: disk full/);
  assert.deepEqual(notifications.at(-1), { title: 'Runner Save Failed', message: 'disk full' });
  assert.equal(tabRenders, 1);
});
