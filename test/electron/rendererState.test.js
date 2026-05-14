const assert = require('node:assert/strict');
const test = require('node:test');
const {
  activeCollectionTabKey,
  activeEnvironmentTabKey,
  activeFolderTabKey,
  activeRequestTabKey,
  activeWorkspaceTabKey,
  clearSavedCollectionTabDirtyState,
  clearSavedEnvironmentDirtyState,
  clearSavedFolderTabDirtyState,
  clearSavedRequestDirtyState,
  createRendererState
} = require('../../src/renderer/rendererState');

test('renderer state builds active tab keys from the current ids', () => {
  const state = createRendererState();
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = 'request-1';
  state.activeEnvironmentId = 'environment-1';
  state.activeWorkspaceId = 'current';
  state.selectedWorkspaceId = 'workspace-2';

  assert.equal(activeRequestTabKey(state), 'request:collection-1:request-1');
  assert.equal(activeCollectionTabKey(state), '');
  assert.equal(activeEnvironmentTabKey(state), 'environment:environment-1');
  assert.equal(activeWorkspaceTabKey(state), 'workspace:workspace-2');
  assert.ok(state.collapsedCollectionIds instanceof Set);
  assert.ok(state.collapsedFolderIds instanceof Set);

  state.activeCollectionId = null;
  assert.equal(activeRequestTabKey(state), 'draft:request-1');

  state.activeCollectionId = 'collection-1';
  state.activeRequestId = null;
  state.activeMainPanel = 'request';
  assert.equal(activeCollectionTabKey(state), 'collection:collection-1');

  state.activeFolderId = 'folder-1';
  assert.equal(activeCollectionTabKey(state), '');
  assert.equal(activeFolderTabKey(state), 'folder:collection-1:folder-1');
});

test('renderer state clears saved collection dirty markers and refreshes snapshots', () => {
  const state = createRendererState();
  const collection = { id: 'collection-1', name: 'Changed', variables: [], requests: [], folders: [] };
  state.openCollectionTabs = [
    { key: 'collection:collection-1', collectionId: collection.id, dirty: true, createdUnsaved: true }
  ];
  let cleared = 0;

  clearSavedCollectionTabDirtyState(state, {
    collectionForTab: () => collection,
    onAfterClear: () => { cleared += 1; }
  });

  assert.equal(state.openCollectionTabs[0].dirty, false);
  assert.equal(state.openCollectionTabs[0].createdUnsaved, false);
  assert.equal(state.openCollectionTabs[0].snapshot, JSON.stringify(collection));
  assert.equal(cleared, 1);
});

test('renderer state clears saved folder dirty markers and refreshes snapshots', () => {
  const state = createRendererState();
  const folder = { id: 'folder-1', name: 'Changed', variables: [], requests: [], folders: [] };
  state.openFolderTabs = [
    { key: 'folder:collection-1:folder-1', collectionId: 'collection-1', folderId: folder.id, dirty: true, createdUnsaved: true }
  ];
  let cleared = 0;

  clearSavedFolderTabDirtyState(state, {
    folderForTab: () => folder,
    onAfterClear: () => { cleared += 1; }
  });

  assert.equal(state.openFolderTabs[0].dirty, false);
  assert.equal(state.openFolderTabs[0].createdUnsaved, false);
  assert.equal(state.openFolderTabs[0].snapshot, JSON.stringify(folder));
  assert.equal(cleared, 1);
});

test('renderer state clears saved request dirty markers and refreshes snapshots', () => {
  const state = createRendererState();
  const request = { id: 'request-1', name: 'Changed' };
  state.openRequestTabs = [
    { key: 'request:collection-1:request-1', requestId: request.id, dirty: true, createdUnsaved: true, draft: false }
  ];
  let cleared = 0;

  clearSavedRequestDirtyState(state, {
    requestForTab: () => request,
    onAfterClear: () => { cleared += 1; }
  });

  assert.equal(state.openRequestTabs[0].dirty, false);
  assert.equal(state.openRequestTabs[0].createdUnsaved, false);
  assert.equal(state.openRequestTabs[0].snapshot, JSON.stringify(request));
  assert.equal(cleared, 1);
});

test('renderer state clears saved environment dirty markers and refreshes snapshots', () => {
  const state = createRendererState();
  const environment = { id: 'environment-1', name: 'Changed', variables: [] };
  state.openEnvironmentTabs = [
    { key: 'environment:environment-1', environmentId: environment.id, dirty: true, createdUnsaved: true }
  ];
  let cleared = 0;

  clearSavedEnvironmentDirtyState(state, {
    environmentForTab: () => environment,
    onAfterClear: () => { cleared += 1; }
  });

  assert.equal(state.openEnvironmentTabs[0].dirty, false);
  assert.equal(state.openEnvironmentTabs[0].createdUnsaved, false);
  assert.equal(state.openEnvironmentTabs[0].snapshot, JSON.stringify(environment));
  assert.equal(cleared, 1);
});
