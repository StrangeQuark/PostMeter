const assert = require('node:assert/strict');
const test = require('node:test');
const { createRendererState } = require('../../src/renderer/rendererState');
const { createRendererWorkflows } = require('../../src/renderer/rendererWorkflows');

test('renderer workflows prompt to save an active draft before saving the workspace', async () => {
  const state = createRendererState();
  const draftRequest = { id: 'draft-1', name: 'Draft Request' };
  state.workspace = { collections: [], environments: [], settings: {} };
  state.activeRequestId = draftRequest.id;
  let prompted = 0;
  let persisted = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => draftRequest,
    doc: createDocument(),
    runFormatting: createRunFormatting(),
    saveDraftRequestWithPrompt: async (request, options) => {
      prompted += 1;
      assert.equal(request, draftRequest);
      assert.equal(options.showStatus, true);
      return { key: 'request:collection-1:draft-1' };
    },
    windowObject: {
      postmeter: {
        workspace: {
          save: async () => {
            persisted += 1;
            return state.workspace;
          }
        }
      }
    }
  });

  const result = await workflows.saveWorkspace(true, { promptForDraft: true });

  assert.equal(result, true);
  assert.equal(prompted, 1);
  assert.equal(persisted, 0);
});

test('renderer workflows persist the workspace and clear dirty state', async () => {
  const state = createRendererState();
  state.workspace = {
    collections: [{ id: 'collection-1', name: 'Requests' }],
    environments: [],
    settings: {}
  };
  let collectedRequest = 0;
  let collectedEnvironment = 0;
  let collectedSettings = 0;
  let clearedDirty = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => null,
    clearSavedRequestDirtyState: () => { clearedDirty += 1; },
    collectEnvironmentFromEditor: () => { collectedEnvironment += 1; },
    collectRequestFromEditor: () => { collectedRequest += 1; },
    collectSettingsFromEditor: () => { collectedSettings += 1; },
    doc: createDocument(),
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        workspace: {
          save: async (workspace) => ({ ...workspace, persisted: true })
        }
      }
    }
  });

  const result = await workflows.persistWorkspace(false);

  assert.equal(result, true);
  assert.equal(collectedRequest, 1);
  assert.equal(collectedEnvironment, 1);
  assert.equal(collectedSettings, 1);
  assert.equal(clearedDirty, 1);
  assert.equal(state.workspace.persisted, true);
});

test('renderer workflows import workspaces as managed entries without destructive confirmation', async () => {
  const state = createRendererState();
  state.workspace = { collections: [], environments: [], settings: {} };
  let confirmCalls = 0;
  let appliedResult = null;
  let appliedOptions = null;
  let status = '';
  const importedResult = {
    cancelled: false,
    workspace: state.workspace,
    path: '/tmp/Local Workspace.json',
    activeWorkspaceId: 'Local Workspace.json',
    createdWorkspaceId: 'Imported Workspace.json',
    workspaces: [
      { id: 'Local Workspace.json', name: 'Local Workspace', current: true, deletable: true },
      { id: 'Imported Workspace.json', name: 'Imported Workspace', current: false, deletable: true }
    ]
  };

  const workflows = createRendererWorkflows({
    state,
    applyLoadedWorkspace: (result, options) => {
      appliedResult = result;
      appliedOptions = options;
    },
    confirm: () => {
      confirmCalls += 1;
      return false;
    },
    doc: createDocument(),
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        workspace: {
          importWorkspace: async () => importedResult
        }
      }
    }
  });

  await workflows.importWorkspace();

  assert.equal(confirmCalls, 0);
  assert.equal(appliedResult, importedResult);
  assert.deepEqual(appliedOptions, { focus: 'workspace', selectedWorkspaceId: 'Imported Workspace.json' });
  assert.equal(status, 'Workspace imported.');
});

test('renderer workflows use the collection export modal callback when exporting from the dropdown', async () => {
  const state = createRendererState();
  const collectionOne = { id: 'collection-1', name: 'AuthServiceCollection', requests: [], folders: [] };
  const collectionTwo = { id: 'collection-2', name: 'BillingCollection', requests: [], folders: [] };
  state.workspace = { collections: [collectionOne, collectionTwo], environments: [], settings: {} };
  let promptedCollections = null;
  let preferredCollection = null;
  let exportedCollection = null;
  let exportedFormat = '';
  let status = '';

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => collectionOne,
    doc: createDocument(),
    promptForCollectionExport: async (collections, preferred) => {
      promptedCollections = collections;
      preferredCollection = preferred;
      return collectionTwo;
    },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        collection: {
          exportCollection: async (collection, format) => {
            exportedCollection = collection;
            exportedFormat = format;
            return { cancelled: false, path: '/tmp/BillingCollection.openapi.json' };
          }
        }
      }
    }
  });

  await workflows.exportCollection(undefined, 'openapi');

  assert.deepEqual(promptedCollections, [collectionOne, collectionTwo]);
  assert.equal(preferredCollection, collectionOne);
  assert.equal(exportedCollection, collectionTwo);
  assert.equal(exportedFormat, 'openapi');
  assert.equal(status, 'Collection exported to /tmp/BillingCollection.openapi.json.');
});

test('renderer workflows refuse collection export when the workspace has no collections', async () => {
  const state = createRendererState();
  state.workspace = { collections: [], environments: [], settings: {} };
  let promptCalls = 0;
  let status = '';

  const workflows = createRendererWorkflows({
    state,
    doc: createDocument(),
    prompt: () => {
      promptCalls += 1;
      return '1';
    },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        collection: {
          exportCollection: async () => {
            throw new Error('collection export should not be called without collections');
          }
        }
      }
    }
  });

  await workflows.exportCollection();

  assert.equal(promptCalls, 0);
  assert.equal(status, 'Create a collection before exporting.');
});

test('renderer workflows open the export modal callback even when there are no collections', async () => {
  const state = createRendererState();
  state.workspace = { collections: [], environments: [], settings: {} };
  let promptedCollections = null;
  let preferredCollection = 'unset';
  let exportCalls = 0;

  const workflows = createRendererWorkflows({
    state,
    doc: createDocument(),
    promptForCollectionExport: async (collections, preferred) => {
      promptedCollections = collections;
      preferredCollection = preferred;
      return null;
    },
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        collection: {
          exportCollection: async () => {
            exportCalls += 1;
            return { cancelled: false, path: '/tmp/unused.json' };
          }
        }
      }
    }
  });

  await workflows.exportCollection(undefined, 'postmeter');

  assert.deepEqual(promptedCollections, []);
  assert.equal(preferredCollection, null);
  assert.equal(exportCalls, 0);
});

test('renderer workflows refuse collection export when no workspace collections exist even if an active collection callback is stale', async () => {
  const state = createRendererState();
  const staleCollection = { id: 'collection-1', name: 'StaleCollection', requests: [], folders: [] };
  state.workspace = { collections: [], environments: [], settings: {} };
  let exportCalls = 0;
  let status = '';

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => staleCollection,
    doc: createDocument(),
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        collection: {
          exportCollection: async () => {
            exportCalls += 1;
            return { cancelled: false, path: '/tmp/StaleCollection.json' };
          }
        }
      }
    }
  });

  await workflows.exportCollection();

  assert.equal(exportCalls, 0);
  assert.equal(status, 'Create a collection before exporting.');
});

test('renderer workflows fall back to prompt text selection when no export modal callback is provided', async () => {
  const state = createRendererState();
  const collectionOne = { id: 'collection-1', name: 'AuthServiceCollection', requests: [], folders: [] };
  const collectionTwo = { id: 'collection-2', name: 'BillingCollection', requests: [], folders: [] };
  state.workspace = { collections: [collectionOne, collectionTwo], environments: [], settings: {} };
  let promptMessage = '';
  let promptDefault = '';
  let exportedCollection = null;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => collectionOne,
    doc: createDocument(),
    prompt: (message, defaultValue) => {
      promptMessage = message;
      promptDefault = defaultValue;
      return '2';
    },
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        collection: {
          exportCollection: async (collection) => {
            exportedCollection = collection;
            return { cancelled: false, path: '/tmp/BillingCollection.json' };
          }
        }
      }
    }
  });

  await workflows.exportCollection(undefined, 'postmeter');

  assert.match(promptMessage, /Choose a collection to export:/);
  assert.equal(promptDefault, 'AuthServiceCollection');
  assert.equal(exportedCollection, collectionTwo);
});

function createDocument() {
  return {
    getElementById() {
      return {
        disabled: false,
        hidden: true,
        textContent: '',
        value: '',
        checked: false
      };
    }
  };
}

function createRunFormatting() {
  return {
    formatLoadResult: () => '',
    formatRunnerResult: () => '',
    oauthProgressDetail: () => '',
    oauthStatusText: () => ''
  };
}
