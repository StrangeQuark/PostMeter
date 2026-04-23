const assert = require('node:assert/strict');
const test = require('node:test');
const {
  activeEnvironmentTabKey,
  activeRequestTabKey,
  activeWorkspaceTabKey,
  clearSavedRequestDirtyState,
  createRendererState
} = require('../../src/renderer/rendererState');

test('renderer state builds active tab keys from the current ids', () => {
  const state = createRendererState();
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = 'request-1';
  state.activeEnvironmentId = 'environment-1';
  state.activeWorkspaceId = 'current';

  assert.equal(activeRequestTabKey(state), 'request:collection-1:request-1');
  assert.equal(activeEnvironmentTabKey(state), 'environment:environment-1');
  assert.equal(activeWorkspaceTabKey(state), 'workspace:current');

  state.activeCollectionId = null;
  assert.equal(activeRequestTabKey(state), 'draft:request-1');
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
