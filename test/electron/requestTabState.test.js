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
