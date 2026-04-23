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
