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

test('renderer workflows allow sending an active draft request without forcing a save', async () => {
  const state = createRendererState();
  const draftRequest = {
    id: 'draft-1',
    name: 'Draft Request',
    method: 'GET',
    url: 'https://example.test',
    scripts: { preRequest: '', tests: '' }
  };
  state.workspace = { collections: [], environments: [], history: [], settings: {} };
  state.activeMainPanel = 'request';
  state.activeRequestId = draftRequest.id;
  state.openRequestTabs = [{ key: 'draft:draft-1', requestId: draftRequest.id, draft: true, dirty: true }];
  state.draftRequests.set(draftRequest.id, draftRequest);
  let workspaceSaveCalls = 0;
  let requestSendCalls = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => draftRequest,
    collectRequestFromEditor: () => {},
    displayResponse: () => {},
    doc: createDocument(),
    renderAuthEditor: () => {},
    renderCookieJarEditor: () => {},
    renderHistory: () => {},
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        request: {
          validate: async () => [],
          send: async () => {
            requestSendCalls += 1;
            return {
              statusCode: 200,
              finalUrl: 'https://example.test',
              durationMillis: 10
            };
          }
        },
        workspace: {
          save: async (workspace) => {
            workspaceSaveCalls += 1;
            return workspace;
          }
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(requestSendCalls, 1);
  assert.equal(workspaceSaveCalls, 0);
});

test('renderer workflows render pre-request script failures inline without history or blocking notification', async () => {
  const state = createRendererState();
  const draftRequest = {
    id: 'draft-1',
    name: 'Draft Request',
    method: 'GET',
    url: 'https://example.test',
    scripts: { preRequest: 'pm.sendRequest("https://example.test")', tests: '' }
  };
  state.workspace = { collections: [], environments: [], history: [], settings: {} };
  state.activeMainPanel = 'request';
  state.activeRequestId = draftRequest.id;
  state.openRequestTabs = [{ key: 'draft:draft-1', requestId: draftRequest.id, draft: true, dirty: true }];
  state.draftRequests.set(draftRequest.id, draftRequest);
  let displayedResponse = null;
  let historyRenders = 0;
  let notifications = 0;
  let status = '';

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => draftRequest,
    collectRequestFromEditor: () => {},
    displayResponse: (response) => { displayedResponse = response; },
    doc: createDocument(),
    notifyUser: () => { notifications += 1; },
    renderHistory: () => { historyRenders += 1; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        request: {
          validate: async () => [],
          send: async () => ({
            statusCode: 0,
            headers: {},
            body: 'Pre-request script failed: script network request should be available: Expected pm.sendRequest is disabled for this workspace. to equal null.',
            durationMillis: 12,
            responseBytes: 130,
            finalUrl: 'https://example.test',
            requestSent: false,
            preRequestScriptResult: {
              passed: false,
              error: '',
              tests: [{
                name: 'script network request should be available',
                passed: false,
                error: 'Expected pm.sendRequest is disabled for this workspace. to equal null.'
              }]
            },
            testScriptResult: { passed: true, tests: [], error: '', logs: [] },
            environment: null,
            collectionVariables: [],
            globals: [],
            localVariables: []
          })
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(displayedResponse.requestSent, false);
  assert.match(displayedResponse.body, /pm\.sendRequest is disabled/);
  assert.equal(state.lastResponse, null);
  assert.equal(state.workspace.history.length, 0);
  assert.equal(historyRenders, 0);
  assert.equal(notifications, 0);
  assert.equal(status, 'Request failed.');
});

test('renderer workflows render skipped pre-request results without history', async () => {
  const state = createRendererState();
  const draftRequest = {
    id: 'draft-skip',
    name: 'Draft Skip',
    method: 'GET',
    url: 'https://example.test',
    scripts: { preRequest: 'pm.execution.skipRequest();', tests: '' }
  };
  state.workspace = { collections: [], environments: [], history: [], settings: {} };
  state.activeMainPanel = 'request';
  state.activeRequestId = draftRequest.id;
  state.openRequestTabs = [{ key: 'draft:draft-skip', requestId: draftRequest.id, draft: true, dirty: true }];
  state.draftRequests.set(draftRequest.id, draftRequest);
  let displayedResponse = null;
  let historyRenders = 0;
  let status = '';

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => draftRequest,
    collectRequestFromEditor: () => {},
    displayResponse: (response) => { displayedResponse = response; },
    doc: createDocument(),
    renderHistory: () => { historyRenders += 1; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        request: {
          validate: async () => [],
          send: async () => ({
            statusCode: 0,
            headers: {},
            body: 'Request skipped by pre-request script.',
            durationMillis: 0,
            responseBytes: 38,
            finalUrl: 'https://example.test',
            requestSent: false,
            skipped: true,
            preRequestScriptResult: {
              passed: true,
              tests: [{ name: 'pre-request can skip', passed: true, error: '' }],
              error: '',
              logs: []
            },
            testScriptResult: { passed: true, tests: [], error: '', logs: [] },
            environment: null,
            collectionVariables: [],
            globals: [],
            localVariables: []
          })
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(displayedResponse.skipped, true);
  assert.equal(displayedResponse.preRequestScriptResult.tests[0].passed, true);
  assert.equal(state.lastResponse, null);
  assert.equal(state.workspace.history.length, 0);
  assert.equal(historyRenders, 0);
  assert.equal(status, 'Request skipped.');
});

test('renderer workflows render request send exceptions inline without blocking notification', async () => {
  const state = createRendererState();
  const draftRequest = {
    id: 'draft-1',
    name: 'Draft Request',
    method: 'GET',
    url: 'https://example.test',
    scripts: { preRequest: '', tests: '' }
  };
  const doc = createDocument();
  state.workspace = { collections: [], environments: [], history: [], settings: {} };
  state.activeMainPanel = 'request';
  state.activeRequestId = draftRequest.id;
  state.openRequestTabs = [{ key: 'draft:draft-1', requestId: draftRequest.id, draft: true, dirty: true }];
  state.draftRequests.set(draftRequest.id, draftRequest);
  let notifications = 0;
  let status = '';

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => draftRequest,
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: () => { notifications += 1; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        request: {
          validate: async () => [],
          send: async () => {
            throw new Error('network boom');
          }
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(doc.getElementById('responseStatus').textContent, 'ERR');
  assert.equal(doc.getElementById('responseBody').value, 'network boom');
  assert.equal(notifications, 0);
  assert.equal(status, 'Request failed: network boom');
});

test('renderer workflows persist the workspace and clear dirty state for explicit full saves', async () => {
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

  const result = await workflows.persistWorkspace(false, { scope: 'all' });

  assert.equal(result, true);
  assert.equal(collectedRequest, 1);
  assert.equal(collectedEnvironment, 1);
  assert.equal(collectedSettings, 1);
  assert.equal(clearedDirty, 1);
  assert.equal(state.workspace.persisted, true);
});

test('renderer workflows only persist the active request tab on a normal save', async () => {
  const state = createRendererState();
  const requestOneSaved = { id: 'request-1', name: 'Saved Request One', method: 'GET', url: 'https://one.example.test' };
  const requestTwoSaved = { id: 'request-2', name: 'Saved Request Two', method: 'GET', url: 'https://two.example.test' };
  const requestOneLive = { ...requestOneSaved, name: 'Edited Request One' };
  const requestTwoLive = { ...requestTwoSaved, name: 'Edited Request Two' };
  state.workspace = {
    collections: [
      {
        id: 'collection-1',
        name: 'Requests',
        variables: [{ enabled: true, key: 'baseUrl', value: 'https://edited.example.test' }],
        requests: [requestOneLive, requestTwoLive],
        folders: []
      }
    ],
    environments: [],
    cookies: [{ enabled: true, name: 'session', value: 'edited', domain: 'example.test', path: '/' }],
    settings: { updates: { includePrereleases: true } }
  };
  state.activeMainPanel = 'request';
  state.activeCollectionId = 'collection-1';
  state.activeRequestId = 'request-1';
  state.openRequestTabs = [
    {
      key: 'request:collection-1:request-1',
      collectionId: 'collection-1',
      requestId: 'request-1',
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(requestOneSaved)
    },
    {
      key: 'request:collection-1:request-2',
      collectionId: 'collection-1',
      requestId: 'request-2',
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(requestTwoSaved)
    }
  ];
  state.collectionDirtySnapshots.set('collection-1', JSON.stringify([{ enabled: true, key: 'baseUrl', value: 'https://saved.example.test' }]));
  state.collectionDirtyOwners.set('collection-1', 'request:collection-1:request-2');
  state.cookieJarDirtySnapshot = JSON.stringify([{ enabled: true, name: 'session', value: 'saved', domain: 'example.test', path: '/' }]);
  state.cookieJarDirtyOwner = 'request:collection-1:request-2';
  let saveRequestPayload = null;
  let fullSaveCalls = 0;
  let renders = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => state.workspace.collections[0],
    activeEnvironment: () => null,
    activeRequest: () => state.workspace.collections[0].requests[0],
    collectEnvironmentFromEditor: () => {},
    collectRequestFromEditor: () => {},
    collectSettingsFromEditor: () => {},
    doc: createDocument(),
    renderAll: () => { renders += 1; },
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        workspace: {
          save: async () => {
            fullSaveCalls += 1;
            return state.workspace;
          },
          saveRequest: async (payload) => {
            saveRequestPayload = structuredClone(payload);
            return {
              request: { ...payload.request, name: 'Edited Request One Saved' }
            };
          }
        }
      }
    }
  });

  const result = await workflows.persistWorkspace(false);

  assert.equal(result, true);
  assert.equal(fullSaveCalls, 0);
  assert.equal(saveRequestPayload.collectionId, 'collection-1');
  assert.equal(saveRequestPayload.requestId, 'request-1');
  assert.equal(saveRequestPayload.request.name, 'Edited Request One');
  assert.equal(saveRequestPayload.settings.updates.includePrereleases, true);
  assert.deepEqual(saveRequestPayload.folderPath, []);
  assert.equal(saveRequestPayload.collectionVariables, undefined);
  assert.equal(saveRequestPayload.cookies, undefined);
  assert.equal(state.workspace.collections[0].requests[0].name, 'Edited Request One Saved');
  assert.equal(state.workspace.collections[0].requests[1].name, 'Edited Request Two');
  assert.equal(state.openRequestTabs[0].dirty, false);
  assert.equal(state.openRequestTabs[0].snapshot, JSON.stringify({ ...requestOneLive, name: 'Edited Request One Saved' }));
  assert.equal(state.openRequestTabs[1].dirty, true);
  assert.equal(state.collectionDirtySnapshots.size, 1);
  assert.equal(state.collectionDirtyOwners.get('collection-1'), 'request:collection-1:request-2');
  assert.notEqual(state.cookieJarDirtySnapshot, null);
  assert.equal(state.cookieJarDirtyOwner, 'request:collection-1:request-2');
  assert.equal(renders, 1);
});

test('renderer workflows persist runner-owned request edits with a targeted request save', async () => {
  const state = createRendererState();
  const runnerRequest = { id: 'runner-request-1', name: 'Runner Request', method: 'GET', url: 'https://runner.example.test' };
  state.workspace = {
    collections: [],
    environments: [],
    runners: [
      {
        id: 'runner-1',
        name: 'Runner',
        environmentId: 'none',
        requests: [runnerRequest]
      }
    ],
    settings: {}
  };
  state.activeMainPanel = 'request';
  state.activeRunnerConfigId = 'runner-1';
  state.activeRunnerRequestRunnerId = 'runner-1';
  state.activeRequestId = runnerRequest.id;
  state.openRequestTabs = [
    {
      key: 'runner-request:runner-1:runner-request-1',
      runnerId: 'runner-1',
      requestId: runnerRequest.id,
      runnerRequest: true,
      dirty: true,
      snapshot: JSON.stringify({ ...runnerRequest, url: 'https://saved-runner.example.test' })
    }
  ];
  let fullSaveCalls = 0;
  const saveRequestPayloads = [];
  let draftPrompts = 0;
  let clearedDirty = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => runnerRequest,
    clearSavedRequestDirtyState: () => {
      clearedDirty += 1;
      state.openRequestTabs[0].dirty = false;
      state.openRequestTabs[0].snapshot = JSON.stringify(runnerRequest);
    },
    collectEnvironmentFromEditor: () => {},
    collectRequestFromEditor: () => {
      runnerRequest.url = 'https://edited-runner.example.test';
    },
    collectSettingsFromEditor: () => {},
    doc: createDocument(),
    runFormatting: createRunFormatting(),
    saveDraftRequestWithPrompt: async () => {
      draftPrompts += 1;
      return null;
    },
    windowObject: {
      postmeter: {
        workspace: {
          save: async (workspace) => {
            fullSaveCalls += 1;
            return workspace;
          },
          saveRequest: async (payload) => {
            saveRequestPayloads.push(JSON.parse(JSON.stringify(payload)));
            return { request: { ...payload.request, url: 'https://saved-runner.example.test' } };
          }
        }
      }
    }
  });

  const result = await workflows.saveWorkspace(true, { promptForDraft: true });

  assert.equal(result, true);
  assert.equal(fullSaveCalls, 0);
  assert.equal(saveRequestPayloads.length, 1);
  assert.equal(saveRequestPayloads[0].runnerId, 'runner-1');
  assert.equal(saveRequestPayloads[0].requestId, 'runner-request-1');
  assert.equal(saveRequestPayloads[0].request.url, 'https://edited-runner.example.test');
  assert.equal(draftPrompts, 0);
  assert.equal(clearedDirty, 0);
  assert.equal(runnerRequest.url, 'https://saved-runner.example.test');
  assert.equal(state.openRequestTabs[0].dirty, false);
  assert.equal(state.openRequestTabs[0].snapshot, JSON.stringify(runnerRequest));
});

test('renderer workflows send runner-owned requests without saving runner edits', async () => {
  const state = createRendererState();
  const savedSnapshot = {
    id: 'runner-request-1',
    name: 'Runner Request',
    method: 'GET',
    url: 'https://saved-runner.example.test',
    scripts: { preRequest: '', tests: '' }
  };
  const runnerRequest = { ...savedSnapshot, url: 'https://runner.example.test' };
  state.workspace = {
    collections: [],
    environments: [],
    history: [],
    runners: [
      {
        id: 'runner-1',
        name: 'Runner',
        environmentId: 'none',
        requests: [runnerRequest]
      }
    ],
    settings: {}
  };
  state.activeMainPanel = 'request';
  state.activeRunnerConfigId = 'runner-1';
  state.activeRunnerRequestRunnerId = 'runner-1';
  state.activeRequestId = runnerRequest.id;
  state.openRequestTabs = [
    {
      key: 'runner-request:runner-1:runner-request-1',
      runnerId: 'runner-1',
      requestId: runnerRequest.id,
      runnerRequest: true,
      dirty: true,
      snapshot: JSON.stringify(savedSnapshot)
    }
  ];
  let fullSaveCalls = 0;
  let targetedSaveCalls = 0;
  let sendCalls = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => runnerRequest,
    collectRequestFromEditor: () => {
      runnerRequest.url = 'https://edited-runner.example.test';
    },
    displayResponse: () => {},
    doc: createDocument(),
    renderHistory: () => {},
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        request: {
          validate: async () => [],
          send: async (request) => {
            sendCalls += 1;
            assert.equal(request.url, 'https://edited-runner.example.test');
            return {
              statusCode: 200,
              finalUrl: request.url,
              durationMillis: 12
            };
          }
        },
        workspace: {
          save: async (workspace) => {
            fullSaveCalls += 1;
            return workspace;
          },
          saveRequest: async (payload) => {
            targetedSaveCalls += 1;
            return { request: payload.request };
          }
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(sendCalls, 1);
  assert.equal(fullSaveCalls, 0);
  assert.equal(targetedSaveCalls, 0);
  assert.equal(runnerRequest.url, 'https://edited-runner.example.test');
  assert.equal(state.openRequestTabs[0].dirty, true);
  assert.equal(state.openRequestTabs[0].snapshot, JSON.stringify(savedSnapshot));
});

test('renderer workflows only persist the active environment tab on a normal save', async () => {
  const state = createRendererState();
  const environmentOneSaved = { id: 'environment-1', name: 'Saved Env One', variables: [{ enabled: true, key: 'baseUrl', value: 'https://saved-one.example.test' }] };
  const environmentTwoSaved = { id: 'environment-2', name: 'Saved Env Two', variables: [{ enabled: true, key: 'baseUrl', value: 'https://saved-two.example.test' }] };
  const environmentOneLive = { ...environmentOneSaved, name: 'Edited Env One' };
  const environmentTwoLive = { ...environmentTwoSaved, name: 'Edited Env Two' };
  state.workspace = {
    collections: [],
    environments: [environmentOneLive, environmentTwoLive],
    settings: { updates: { includePrereleases: true } }
  };
  state.activeMainPanel = 'environment';
  state.activeEnvironmentId = 'environment-1';
  state.openEnvironmentTabs = [
    {
      key: 'environment:environment-1',
      environmentId: 'environment-1',
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(environmentOneSaved)
    },
    {
      key: 'environment:environment-2',
      environmentId: 'environment-2',
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(environmentTwoSaved)
    }
  ];
  let saveEnvironmentPayload = null;
  let fullSaveCalls = 0;
  let renders = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => state.workspace.environments[0],
    activeRequest: () => null,
    collectEnvironmentFromEditor: () => {},
    collectRequestFromEditor: () => {},
    collectSettingsFromEditor: () => {},
    doc: createDocument(),
    renderAll: () => { renders += 1; },
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        workspace: {
          save: async () => {
            fullSaveCalls += 1;
            return state.workspace;
          },
          saveEnvironment: async (payload) => {
            saveEnvironmentPayload = structuredClone(payload);
            return {
              environment: { ...payload.environment, name: 'Edited Env One Saved' }
            };
          }
        }
      }
    }
  });

  const result = await workflows.persistWorkspace(false);

  assert.equal(result, true);
  assert.equal(fullSaveCalls, 0);
  assert.equal(saveEnvironmentPayload.environmentId, 'environment-1');
  assert.equal(saveEnvironmentPayload.environment.name, 'Edited Env One');
  assert.equal(saveEnvironmentPayload.settings.updates.includePrereleases, true);
  assert.equal(state.workspace.environments[0].name, 'Edited Env One Saved');
  assert.equal(state.workspace.environments[1].name, 'Edited Env Two');
  assert.equal(state.openEnvironmentTabs[0].dirty, false);
  assert.equal(state.openEnvironmentTabs[0].snapshot, JSON.stringify({ ...environmentOneLive, name: 'Edited Env One Saved' }));
  assert.equal(state.openEnvironmentTabs[1].dirty, true);
  assert.equal(renders, 1);
});

test('renderer workflows save only workspace settings when the workspace tab is selected', async () => {
  const state = createRendererState();
  const draftRequest = { id: 'draft-1', name: 'Draft Request' };
  state.workspace = {
    collections: [],
    environments: [],
    settings: { appearance: { theme: 'dark' }, updates: { includePrereleases: true } }
  };
  state.activeMainPanel = 'workspace';
  state.selectedWorkspaceId = 'Local Workspace.json';
  state.activeRequestId = draftRequest.id;
  state.draftRequests.set(draftRequest.id, draftRequest);
  state.openRequestTabs = [
    {
      key: 'request:collection-1:request-1',
      collectionId: 'collection-1',
      requestId: 'request-1',
      dirty: true,
      createdUnsaved: false,
      snapshot: '{}'
    }
  ];
  state.openEnvironmentTabs = [
    {
      key: 'environment:environment-1',
      environmentId: 'environment-1',
      dirty: true,
      createdUnsaved: false,
      snapshot: '{}'
    }
  ];
  let draftPrompts = 0;
  let fullSaveCalls = 0;
  let saveSettingsPayload = null;
  let status = '';

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => draftRequest,
    collectRequestFromEditor: () => {
      throw new Error('request editor should not be collected while saving the workspace tab');
    },
    collectEnvironmentFromEditor: () => {
      throw new Error('environment editor should not be collected while saving the workspace tab');
    },
    collectSettingsFromEditor: () => {},
    doc: createDocument(),
    runFormatting: createRunFormatting(),
    saveDraftRequestWithPrompt: async () => {
      draftPrompts += 1;
      return null;
    },
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        workspace: {
          save: async (workspace) => {
            fullSaveCalls += 1;
            return workspace;
          },
          saveSettings: async (settings) => {
            saveSettingsPayload = structuredClone(settings);
            return {
              settings: {
                ...settings,
                appearance: { theme: 'light' }
              }
            };
          }
        }
      }
    }
  });

  const result = await workflows.saveWorkspace(true, { promptForDraft: true });

  assert.equal(result, true);
  assert.equal(draftPrompts, 0);
  assert.equal(fullSaveCalls, 0);
  assert.deepEqual(saveSettingsPayload, { appearance: { theme: 'dark' }, updates: { includePrereleases: true } });
  assert.equal(state.workspace.settings.appearance.theme, 'light');
  assert.equal(state.openRequestTabs[0].dirty, true);
  assert.equal(state.openEnvironmentTabs[0].dirty, true);
  assert.equal(status, 'Workspace saved.');
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

test('renderer workflows update the workspace catalog without replacing the current workspace when import keeps the active workspace loaded', async () => {
  const state = createRendererState();
  const currentWorkspace = { collections: [{ id: 'collection-1', name: 'Current' }], environments: [], settings: {} };
  state.workspace = currentWorkspace;
  state.activeWorkspaceId = 'Local Workspace.json';
  let appliedCatalogResult = null;
  let appliedCatalogOptions = null;
  let appliedLoadedCalls = 0;

  const workflows = createRendererWorkflows({
    state,
    applyLoadedWorkspace: () => { appliedLoadedCalls += 1; },
    applyWorkspaceCatalogUpdate: (result, options) => {
      appliedCatalogResult = result;
      appliedCatalogOptions = options;
    },
    doc: createDocument(),
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        workspace: {
          importWorkspace: async () => ({
            cancelled: false,
            workspace: { collections: [], environments: [], settings: {} },
            path: '/tmp/Local Workspace.json',
            activeWorkspaceId: 'Local Workspace.json',
            createdWorkspaceId: 'Imported Workspace.json',
            workspaces: [
              { id: 'Local Workspace.json', name: 'Local Workspace', current: true, deletable: true },
              { id: 'Imported Workspace.json', name: 'Imported Workspace', current: false, deletable: true }
            ]
          })
        }
      }
    }
  });

  await workflows.importWorkspace();

  assert.equal(appliedLoadedCalls, 0);
  assert.equal(appliedCatalogResult?.activeWorkspaceId, 'Local Workspace.json');
  assert.deepEqual(appliedCatalogOptions, { focus: 'workspace', selectedWorkspaceId: 'Imported Workspace.json' });
  assert.equal(state.workspace, currentWorkspace);
});

test('renderer workflows pass renderer-selected import file paths to preload boundaries', async () => {
  const state = createRendererState();
  state.workspace = { collections: [], environments: [], settings: {} };
  const importCalls = [];
  const workflows = createRendererWorkflows({
    state,
    doc: createDocument(),
    renderAll: () => {},
    runFormatting: createRunFormatting(),
    selectInitialWorkspaceItem: () => {},
    uniqueName: (value) => value,
    windowObject: {
      postmeter: {
        workspace: {
          importWorkspace: async (filePath) => {
            importCalls.push(['workspace', filePath]);
            return { cancelled: true };
          },
          save: async (workspace) => workspace
        },
        collection: {
          importCollection: async (filePath) => {
            importCalls.push(['collection', filePath]);
            return { cancelled: true };
          }
        }
      }
    }
  });

  await workflows.importWorkspace('/tmp/dragged-workspace.json');
  await workflows.importCollection('/tmp/dragged-collection.json');

  assert.deepEqual(importCalls, [
    ['workspace', '/tmp/dragged-workspace.json'],
    ['collection', '/tmp/dragged-collection.json']
  ]);
});

test('renderer workflows collect the active environment editor before importing a workspace catalog update', async () => {
  const state = createRendererState();
  state.workspace = { collections: [], environments: [{ id: 'environment-1', name: 'Current Environment', variables: [] }], settings: {} };
  state.activeWorkspaceId = 'Local Workspace.json';
  state.activeMainPanel = 'environment';
  let collectedEnvironment = 0;
  let appliedCatalogResult = null;

  const workflows = createRendererWorkflows({
    state,
    applyWorkspaceCatalogUpdate: (result) => {
      appliedCatalogResult = result;
    },
    collectEnvironmentFromEditor: () => { collectedEnvironment += 1; },
    doc: createDocument(),
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        workspace: {
          importWorkspace: async () => ({
            cancelled: false,
            workspace: state.workspace,
            path: '/tmp/Local Workspace.json',
            activeWorkspaceId: 'Local Workspace.json',
            createdWorkspaceId: 'Imported Workspace.json',
            workspaces: [
              { id: 'Local Workspace.json', name: 'Local Workspace', current: true, deletable: true },
              { id: 'Imported Workspace.json', name: 'Imported Workspace', current: false, deletable: true }
            ]
          })
        }
      }
    }
  });

  await workflows.importWorkspace();

  assert.equal(collectedEnvironment, 1);
  assert.equal(appliedCatalogResult?.createdWorkspaceId, 'Imported Workspace.json');
});

test('renderer workflows collect the active request editor before importing a collection', async () => {
  const state = createRendererState();
  const pendingRequest = { id: 'request-1', name: 'Pending Request' };
  state.workspace = { collections: [], environments: [], settings: {} };
  state.activeMainPanel = 'request';
  const collectionCountsAtCollect = [];

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => state.workspace.collections[0] || null,
    activeEnvironment: () => null,
    activeRequest: () => state.workspace.collections[0]?.requests?.[0] || pendingRequest,
    collectRequestFromEditor: () => {
      collectionCountsAtCollect.push(state.workspace.collections.length);
    },
    doc: createDocument(),
    renderAll: () => {},
    runFormatting: createRunFormatting(),
    selectFirstRequest: () => {
      state.activeRequestId = 'imported-request-1';
    },
    uniqueName: (value) => value,
    windowObject: {
      postmeter: {
        collection: {
          importCollection: async () => ({
            cancelled: false,
            collection: {
              id: 'collection-1',
              name: 'Imported Collection',
              requests: [{ id: 'imported-request-1', name: 'Imported Request', url: '', method: 'GET' }],
              folders: []
            }
          })
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.importCollection();

  assert.deepEqual(collectionCountsAtCollect, [0, 1]);
  assert.equal(state.workspace.collections.length, 1);
});

test('renderer workflows report workspace import failure without replacing the active workspace', async () => {
  const state = createRendererState();
  const originalWorkspace = { collections: [{ id: 'collection-1', name: 'Current' }], environments: [], settings: {} };
  state.workspace = originalWorkspace;
  let status = '';
  let notification = null;

  const workflows = createRendererWorkflows({
    state,
    collectActiveEditorState: () => {},
    doc: createDocument(),
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        workspace: {
          importWorkspace: async () => {
            throw new Error('parse failed');
          }
        }
      }
    }
  });

  await workflows.importWorkspace();

  assert.equal(state.workspace, originalWorkspace);
  assert.equal(status, 'Workspace import failed: parse failed');
  assert.deepEqual(notification, { title: 'Workspace Import Failed', message: 'parse failed' });
});

test('renderer workflows report collection import failure without mutating collections', async () => {
  const state = createRendererState();
  state.workspace = { collections: [{ id: 'collection-1', name: 'Current' }], environments: [], settings: {} };
  let status = '';
  let notification = null;

  const workflows = createRendererWorkflows({
    state,
    collectActiveEditorState: () => {},
    doc: createDocument(),
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        collection: {
          importCollection: async () => {
            throw new Error('unsupported format');
          }
        }
      }
    }
  });

  await workflows.importCollection();

  assert.equal(state.workspace.collections.length, 1);
  assert.equal(status, 'Collection import failed: unsupported format');
  assert.deepEqual(notification, { title: 'Collection Import Failed', message: 'unsupported format' });
});

test('renderer workflows roll back imported collections when persistence fails', async () => {
  const state = createRendererState();
  const originalCollection = { id: 'collection-1', name: 'Current', requests: [{ id: 'request-1', name: 'Current Request' }], folders: [] };
  state.workspace = { collections: [originalCollection], environments: [], settings: {} };
  state.activeCollectionId = 'collection-1';
  state.activeFolderId = 'folder-1';
  state.activeRequestId = 'request-1';
  let status = '';
  let notification = null;
  let renderCount = 0;

  const workflows = createRendererWorkflows({
    state,
    doc: createDocument(),
    notifyUser: (title, message) => { notification = { title, message }; },
    renderAll: () => { renderCount += 1; },
    runFormatting: createRunFormatting(),
    selectFirstRequest: (collection) => {
      state.activeFolderId = null;
      state.activeRequestId = collection.requests[0].id;
    },
    setStatus: (value) => { status = value; },
    uniqueName: (value) => value,
    windowObject: {
      postmeter: {
        collection: {
          importCollection: async () => ({
            cancelled: false,
            collection: {
              id: 'imported-collection',
              name: 'Imported Collection',
              requests: [{ id: 'imported-request-1', name: 'Imported Request', url: '', method: 'GET' }],
              folders: []
            }
          })
        },
        workspace: {
          save: async () => {
            throw new Error('disk full');
          }
        }
      }
    }
  });

  await workflows.importCollection();

  assert.equal(state.workspace.collections.length, 1);
  assert.equal(state.workspace.collections[0].id, 'collection-1');
  assert.equal(state.activeCollectionId, 'collection-1');
  assert.equal(state.activeFolderId, 'folder-1');
  assert.equal(state.activeRequestId, 'request-1');
  assert.equal(status, 'Collection import save failed: disk full');
  assert.deepEqual(notification, { title: 'Collection Import Save Failed', message: 'disk full' });
  assert.equal(renderCount, 2);
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

test('renderer workflows report workspace export failure without throwing from toolbar handlers', async () => {
  const state = createRendererState();
  state.workspace = { collections: [], environments: [], settings: {} };
  let status = '';
  let notification = null;

  const workflows = createRendererWorkflows({
    state,
    doc: createDocument(),
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      __postmeterExportWorkspace: async () => {
        throw new Error('permission denied');
      },
      postmeter: {
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.exportWorkspace();

  assert.equal(status, 'Workspace export failed: permission denied');
  assert.deepEqual(notification, { title: 'Workspace Export Failed', message: 'permission denied' });
});

test('renderer workflows report collection export failure without throwing from toolbar handlers', async () => {
  const state = createRendererState();
  const collection = { id: 'collection-1', name: 'Current', requests: [], folders: [] };
  state.workspace = { collections: [collection], environments: [], settings: {} };
  let status = '';
  let notification = null;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => collection,
    doc: createDocument(),
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        collection: {
          exportCollection: async () => {
            throw new Error('disk full');
          }
        }
      }
    }
  });

  await workflows.exportCollection(undefined, 'postmeter');

  assert.equal(status, 'Collection export failed: disk full');
  assert.deepEqual(notification, { title: 'Collection Export Failed', message: 'disk full' });
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

test('renderer workflows scope captured responses to the active request', async () => {
  const state = createRendererState();
  const request = {
    id: 'request-1',
    name: 'Get Widgets',
    method: 'GET',
    url: 'https://example.test/widgets',
    scripts: { preRequest: '', tests: '' }
  };
  state.workspace = { collections: [], environments: [], history: [], settings: {} };
  const doc = createDocument();

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => request,
    collectRequestFromEditor: () => {},
    displayResponse: () => {},
    doc,
    renderAuthEditor: () => {},
    renderCookieJarEditor: () => {},
    renderHistory: () => {},
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        request: {
          validate: async () => [],
          send: async () => ({
            statusCode: 200,
            finalUrl: 'https://example.test/widgets',
            durationMillis: 15
          })
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(state.lastResponse.requestId, 'request-1');
});

test('renderer workflows apply single-request completions to the request that started the send', async () => {
  const state = createRendererState();
  const requestOne = {
    id: 'request-1',
    name: 'Get Widgets',
    method: 'GET',
    url: 'https://example.test/widgets',
    auth: { type: 'oauth2', grantType: 'clientCredentials', accessToken: 'stale-token' },
    variables: [{ enabled: true, key: 'localToken', value: 'old-local' }],
    scripts: { preRequest: '', tests: '' }
  };
  const requestTwo = {
    id: 'request-2',
    name: 'Get Billing',
    method: 'GET',
    url: 'https://example.test/billing',
    auth: { type: 'oauth2', grantType: 'clientCredentials', accessToken: 'current-token' },
    variables: [{ enabled: true, key: 'localToken', value: 'other-local' }],
    scripts: { preRequest: '', tests: '' }
  };
  const collectionOne = {
    id: 'collection-1',
    name: 'Widgets',
    variables: [{ enabled: true, key: 'collectionToken', value: 'old-collection' }],
    requests: [requestOne],
    folders: []
  };
  const collectionTwo = {
    id: 'collection-2',
    name: 'Billing',
    variables: [{ enabled: true, key: 'collectionToken', value: 'other-collection' }],
    requests: [requestTwo],
    folders: []
  };
  const environmentOne = {
    id: 'environment-1',
    name: 'Widgets Env',
    variables: [{ enabled: true, key: 'envToken', value: 'old-env' }]
  };
  const environmentTwo = {
    id: 'environment-2',
    name: 'Billing Env',
    variables: [{ enabled: true, key: 'envToken', value: 'other-env' }]
  };
  state.workspace = {
    collections: [collectionOne, collectionTwo],
    environments: [environmentOne, environmentTwo],
    history: [],
    cookies: [],
    settings: {}
  };
  state.activeCollectionId = collectionOne.id;
  state.activeRequestId = requestOne.id;
  state.activeEnvironmentId = environmentOne.id;
  state.openRequestTabs = [
    {
      key: `request:${collectionOne.id}:${requestOne.id}`,
      collectionId: collectionOne.id,
      requestId: requestOne.id,
      dirty: true,
      createdUnsaved: false,
      snapshot: JSON.stringify(requestOne)
    }
  ];
  const doc = createDocument();
  let authRenderCalls = 0;
  let cookieJarRenders = 0;
  let historyRenders = 0;
  let displayedResponse = null;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => activeCollectionForState(state),
    activeEnvironment: () => activeEnvironmentForState(state),
    activeRequest: () => activeRequestForState(state),
    collectRequestFromEditor: () => {},
    displayResponse: (response) => { displayedResponse = response; },
    doc,
    renderAuthEditor: () => { authRenderCalls += 1; },
    renderCollectionVariablesEditor: () => {},
    renderCookieJarEditor: () => { cookieJarRenders += 1; },
    renderEnvironmentEditor: () => {},
    renderHistory: () => { historyRenders += 1; },
    renderRequestTabs: () => {},
    renderRequestVariablePairs: () => {},
    renderVariablePreview: () => {},
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        request: {
          validate: async () => [],
          send: async () => {
            state.activeCollectionId = collectionTwo.id;
            state.activeRequestId = requestTwo.id;
            state.activeEnvironmentId = environmentTwo.id;
            return {
              updatedAuthPersisted: true,
              updatedCookies: [{ name: 'session', value: 'ready', domain: 'example.test', path: '/' }],
              environment: {
                id: environmentOne.id,
                variables: [{ enabled: true, key: 'envToken', value: 'fresh-env' }]
              },
              collectionVariables: [{ enabled: true, key: 'collectionToken', value: 'fresh-collection' }],
              localVariables: [{ enabled: true, key: 'localToken', value: 'fresh-local' }],
              statusCode: 200,
              finalUrl: 'https://example.test/widgets',
              durationMillis: 21
            };
          }
        },
        workspace: {
          load: async () => {
            const loadedWorkspace = structuredClone(state.workspace);
            loadedWorkspace.collections[0].requests[0].auth = {
              type: 'oauth2',
              grantType: 'clientCredentials',
              accessToken: 'fresh-token'
            };
            return {
              activeWorkspaceId: state.activeWorkspaceId,
              workspace: loadedWorkspace
            };
          },
          save: async (workspace) => workspace,
          saveRequest: async (payload) => ({ request: payload.request })
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(requestOne.auth.accessToken, 'fresh-token');
  assert.equal(requestTwo.auth.accessToken, 'current-token');
  assert.equal(collectionOne.variables[0].value, 'fresh-collection');
  assert.equal(collectionTwo.variables[0].value, 'other-collection');
  assert.equal(requestOne.variables[0].value, 'fresh-local');
  assert.equal(requestTwo.variables[0].value, 'other-local');
  assert.equal(environmentOne.variables[0].value, 'fresh-env');
  assert.equal(environmentTwo.variables[0].value, 'other-env');
  assert.equal(authRenderCalls, 0);
  assert.equal(cookieJarRenders, 1);
  assert.equal(historyRenders, 1);
  assert.equal(displayedResponse.statusCode, 200);
  assert.equal(displayedResponse.updatedAuth, undefined);
  assert.equal(displayedResponse.updatedAuthPersisted, undefined);
  assert.equal(state.lastResponse.requestId, requestOne.id);
  assert.equal(state.lastResponse.updatedAuth, undefined);
  assert.equal(state.lastResponse.updatedAuthPersisted, undefined);
  assert.equal(state.workspace.history[0].method, 'GET');
  assert.equal(state.workspace.history[0].url, 'https://example.test/widgets');
});

test('renderer workflows persist OAuth results to the request that started the flow without recollecting a different active request', async () => {
  const state = createRendererState();
  const requestOne = {
    id: 'request-1',
    name: 'Authorize Widgets',
    method: 'GET',
    url: 'https://example.test/widgets',
    auth: {
      type: 'oauth2',
      grantType: 'authorizationCode',
      authorizationUrl: 'https://auth.example.test/authorize',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'widget-client',
      accessToken: ''
    },
    scripts: { preRequest: '', tests: '' }
  };
  const requestTwo = {
    id: 'request-2',
    name: 'Authorize Billing',
    method: 'GET',
    url: 'https://example.test/billing',
    auth: {
      type: 'oauth2',
      grantType: 'authorizationCode',
      authorizationUrl: 'https://auth.example.test/authorize',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'billing-client',
      accessToken: 'billing-token'
    },
    scripts: { preRequest: '', tests: '' }
  };
  const collection = {
    id: 'collection-1',
    name: 'OAuth',
    variables: [],
    requests: [requestOne, requestTwo],
    folders: []
  };
  const environment = { id: 'environment-1', name: 'OAuth Env', variables: [] };
  state.workspace = {
    collections: [collection],
    environments: [environment],
    history: [],
    cookies: [],
    settings: {}
  };
  state.activeCollectionId = collection.id;
  state.activeRequestId = requestOne.id;
  state.activeEnvironmentId = environment.id;
  const doc = createDocument();
  doc.getElementById('authOauthRedirectStrategySelect').value = 'system';
  let collectedRequests = 0;
  let authRenderCalls = 0;
  const savedWorkspaces = [];

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => activeCollectionForState(state),
    activeEnvironment: () => activeEnvironmentForState(state),
    activeRequest: () => activeRequestForState(state),
    collectRequestFromEditor: () => { collectedRequests += 1; },
    doc,
    renderAuthEditor: () => { authRenderCalls += 1; },
    renderCollections: () => {},
    renderRequestTabs: () => {},
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        oauth: {
          startPkceFlow: async () => {
            state.activeRequestId = requestTwo.id;
            return {
              cancelled: false,
              auth: {
                ...requestOne.auth,
                accessToken: 'fresh-oauth-token'
              }
            };
          }
        },
        workspace: {
          save: async (workspace) => {
            savedWorkspaces.push(structuredClone(workspace));
            return workspace;
          }
        }
      }
    }
  });

  await workflows.startPkceFlow();

  assert.equal(collectedRequests, 1);
  assert.equal(authRenderCalls, 0);
  assert.equal(savedWorkspaces.length, 1);
  assert.equal(requestOne.auth.accessToken, 'fresh-oauth-token');
  assert.equal(requestTwo.auth.accessToken, 'billing-token');
  assert.equal(savedWorkspaces[0].collections[0].requests[0].auth.accessToken, 'fresh-oauth-token');
  assert.equal(savedWorkspaces[0].collections[0].requests[1].auth.accessToken, 'billing-token');
});

test('renderer workflows clear stale OAuth validation errors when a later flow starts and succeeds', async () => {
  const state = createRendererState();
  const request = {
    id: 'request-1',
    name: 'Authorize Widgets',
    method: 'GET',
    url: 'https://example.test/widgets',
    auth: {
      type: 'oauth2',
      grantType: 'authorizationCode',
      authorizationUrl: 'https://auth.example.test/authorize',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'widget-client',
      accessToken: ''
    },
    scripts: { preRequest: '', tests: '' }
  };
  const collection = {
    id: 'collection-1',
    name: 'OAuth',
    variables: [],
    requests: [request],
    folders: []
  };
  state.workspace = { collections: [collection], environments: [], history: [], cookies: [], settings: {} };
  state.activeCollectionId = collection.id;
  state.activeRequestId = request.id;
  const doc = createDocument();
  doc.getElementById('authOauthRedirectStrategySelect').value = 'loopback';
  let attempts = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => activeCollectionForState(state),
    activeEnvironment: () => null,
    activeRequest: () => activeRequestForState(state),
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: () => {},
    renderAuthEditor: () => {},
    renderCollections: () => {},
    renderRequestTabs: () => {},
    runFormatting: {
      ...createRunFormatting(),
      oauthProgressDetail: (progress) => progress.message || '',
      oauthStatusText: (progress) => `${progress.type}:${progress.status}`
    },
    windowObject: {
      postmeter: {
        oauth: {
          startPkceFlow: async () => {
            attempts += 1;
            if (attempts === 1) {
              throw new Error('provider denied access_token=[redacted]');
            }
            return {
              cancelled: false,
              auth: { ...request.auth, accessToken: 'fresh-token' }
            };
          }
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.startPkceFlow();
  assert.equal(doc.getElementById('validationLabel').textContent, 'provider denied access_token=[redacted]');
  assert.equal(doc.getElementById('oauthProgressStatus').textContent, 'pkce:failed');
  assert.equal(doc.getElementById('oauthProgressDetail').textContent, 'provider denied access_token=[redacted]');

  await workflows.startPkceFlow();
  assert.equal(doc.getElementById('validationLabel').textContent, '');
  assert.equal(request.auth.accessToken, 'fresh-token');
});

test('renderer workflows move OAuth device progress to failed on immediate start errors', async () => {
  const state = createRendererState();
  const request = {
    id: 'request-1',
    name: 'Authorize Device',
    method: 'GET',
    url: 'https://example.test/widgets',
    auth: {
      type: 'oauth2',
      grantType: 'deviceCode',
      deviceAuthorizationUrl: 'https://auth.example.test/device',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'widget-client',
      accessToken: ''
    },
    scripts: { preRequest: '', tests: '' }
  };
  const collection = {
    id: 'collection-1',
    name: 'OAuth',
    variables: [],
    requests: [request],
    folders: []
  };
  state.workspace = { collections: [collection], environments: [], history: [], cookies: [], settings: {} };
  state.activeCollectionId = collection.id;
  state.activeRequestId = request.id;
  const doc = createDocument();
  let status = '';
  let notification = null;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => activeCollectionForState(state),
    activeEnvironment: () => null,
    activeRequest: () => activeRequestForState(state),
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: (title, message) => { notification = { title, message }; },
    renderAuthEditor: () => {},
    renderCollections: () => {},
    renderRequestTabs: () => {},
    runFormatting: {
      ...createRunFormatting(),
      oauthProgressDetail: (progress) => progress.message || '',
      oauthStatusText: (progress) => `${progress.type}:${progress.status}`
    },
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        oauth: {
          startDeviceFlow: async () => {
            throw new Error('device provider denied');
          }
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.startDeviceFlow();

  assert.equal(status, 'OAuth device authorization failed.');
  assert.equal(doc.getElementById('validationLabel').textContent, 'device provider denied');
  assert.equal(doc.getElementById('oauthProgressStatus').textContent, 'device:failed');
  assert.equal(doc.getElementById('oauthProgressDetail').textContent, 'device provider denied');
  assert.deepEqual(notification, {
    title: 'OAuth Device Authorization Failed',
    message: 'device provider denied'
  });
});

test('renderer workflows ignore stale OAuth completions after a newer flow starts', async () => {
  const state = createRendererState();
  const request = {
    id: 'request-1',
    name: 'Authorize Widgets',
    method: 'GET',
    url: 'https://example.test/widgets',
    auth: {
      type: 'oauth2',
      grantType: 'authorizationCode',
      authorizationUrl: 'https://auth.example.test/authorize',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'widget-client',
      accessToken: ''
    },
    scripts: { preRequest: '', tests: '' }
  };
  const collection = {
    id: 'collection-1',
    name: 'OAuth',
    variables: [],
    requests: [request],
    folders: []
  };
  state.workspace = { collections: [collection], environments: [], history: [], cookies: [], settings: {} };
  state.activeCollectionId = collection.id;
  state.activeRequestId = request.id;
  const doc = createDocument();
  doc.getElementById('authOauthRedirectStrategySelect').value = 'loopback';
  const flowIds = [];
  const resolvers = [];

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => activeCollectionForState(state),
    activeEnvironment: () => null,
    activeRequest: () => activeRequestForState(state),
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: () => {},
    renderAuthEditor: () => {},
    renderCollections: () => {},
    renderRequestTabs: () => {},
    runFormatting: createRunFormatting(),
    windowObject: {
      postmeter: {
        oauth: {
          startPkceFlow: async (flowId) => {
            flowIds.push(flowId);
            return new Promise((resolve) => {
              resolvers.push(resolve);
            });
          }
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  const firstFlow = workflows.startPkceFlow();
  await Promise.resolve();
  const firstFlowId = flowIds[0];
  state.activeOauthFlowId = null;
  doc.getElementById('startPkceFlowButton').disabled = false;
  doc.getElementById('startDeviceFlowButton').disabled = false;
  doc.getElementById('cancelOauthFlowButton').disabled = true;

  const secondFlow = workflows.startPkceFlow();
  await Promise.resolve();
  const secondFlowId = flowIds[1];
  assert.notEqual(firstFlowId, secondFlowId);

  resolvers[0]({
    cancelled: true,
    auth: { ...request.auth, accessToken: 'stale-flow-token' }
  });
  await firstFlow;
  assert.equal(state.activeOauthFlowId, secondFlowId);
  assert.equal(doc.getElementById('startPkceFlowButton').disabled, true);
  assert.equal(doc.getElementById('cancelOauthFlowButton').disabled, false);
  assert.equal(request.auth.accessToken, '');

  resolvers[1]({
    cancelled: false,
    auth: { ...request.auth, accessToken: 'fresh-flow-token' }
  });
  await secondFlow;
  assert.equal(state.activeOauthFlowId, null);
  assert.equal(doc.getElementById('startPkceFlowButton').disabled, false);
  assert.equal(request.auth.accessToken, 'fresh-flow-token');
});

test('renderer workflows recover collection-run start failures without leaving active controls stuck', async () => {
  const state = createRendererState();
  const collection = {
    id: 'collection-1',
    name: 'Runner Collection',
    requests: [],
    folders: []
  };
  state.workspace = { collections: [collection], environments: [], history: [], cookies: [], settings: {} };
  state.activeCollectionId = collection.id;
  const doc = createDocument();
  let status = '';
  let notification = null;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => collection,
    activeEnvironment: () => null,
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        runner: {
          start: async () => {
            throw new Error('runner backend unavailable');
          }
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.runActiveCollection();

  assert.equal(doc.getElementById('runnerResults').textContent, 'runner backend unavailable');
  assert.equal(doc.getElementById('runCollectionButton').disabled, false);
  assert.equal(doc.getElementById('cancelRunnerButton').disabled, true);
  assert.equal(doc.getElementById('exportRunnerJsonButton').disabled, true);
  assert.equal(doc.getElementById('exportRunnerCsvButton').disabled, true);
  assert.equal(state.activeRunnerId, null);
  assert.equal(state.lastRunnerResult, null);
  assert.equal(status, 'Collection run failed.');
  assert.deepEqual(notification, {
    title: 'Collection Run Failed',
    message: 'runner backend unavailable'
  });
});

test('renderer workflows surface collection-run cancellation failures visibly', async () => {
  const state = createRendererState();
  state.activeRunnerId = 'runner-1';
  const doc = createDocument();
  let status = '';
  let notification = null;
  let cancelledId = '';
  const workflows = createRendererWorkflows({
    state,
    doc,
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        runner: {
          cancel: async (id) => {
            cancelledId = id;
            throw new Error('runner cancel ipc failed');
          }
        }
      }
    }
  });

  await workflows.cancelCollectionRun();

  assert.equal(cancelledId, 'runner-1');
  assert.equal(doc.getElementById('runnerResults').textContent, 'runner cancel ipc failed');
  assert.equal(status, 'Collection run cancellation failed.');
  assert.deepEqual(notification, {
    title: 'Collection Run Cancellation Failed',
    message: 'runner cancel ipc failed'
  });
});

test('renderer workflows surface OAuth cancellation failures visibly', async () => {
  const state = createRendererState();
  state.activeOauthFlowId = 'oauth-1';
  const doc = createDocument();
  let status = '';
  let notification = null;
  let cancelledId = '';
  const workflows = createRendererWorkflows({
    state,
    doc,
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        oauth: {
          cancelFlow: async (id) => {
            cancelledId = id;
            throw new Error('oauth cancel ipc failed');
          }
        }
      }
    }
  });

  await workflows.cancelOauthFlow();

  assert.equal(cancelledId, 'oauth-1');
  assert.equal(doc.getElementById('validationLabel').textContent, 'oauth cancel ipc failed');
  assert.equal(status, 'OAuth cancellation failed.');
  assert.deepEqual(notification, {
    title: 'OAuth Cancellation Failed',
    message: 'oauth cancel ipc failed'
  });
});

test('renderer workflows report runner export failure without throwing from toolbar handlers', async () => {
  const state = createRendererState();
  state.lastRunnerResult = { collectionName: 'Smoke Runner', results: [] };
  let status = '';
  let notification = null;

  const workflows = createRendererWorkflows({
    state,
    doc: createDocument(),
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        runner: {
          export: async () => {
            throw new Error('runner export denied');
          }
        }
      }
    }
  });

  await workflows.exportRunnerResult('json');

  assert.equal(status, 'Collection run export failed.');
  assert.deepEqual(notification, {
    title: 'Collection Run Export Failed',
    message: 'runner export denied'
  });
});

test('renderer workflows clear stale captured responses after a send failure', async () => {
  const state = createRendererState();
  const request = {
    id: 'request-1',
    name: 'Get Widgets',
    method: 'GET',
    url: 'https://example.test/widgets',
    scripts: { preRequest: '', tests: '' }
  };
  state.workspace = { collections: [], environments: [], history: [], settings: {} };
  state.lastResponse = { requestId: 'request-1', statusCode: 200 };
  const doc = createDocument();

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => null,
    activeEnvironment: () => null,
    activeRequest: () => request,
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: () => {},
    runFormatting: createRunFormatting(),
    setStatus: () => {},
    windowObject: {
      postmeter: {
        request: {
          validate: async () => [],
          send: async () => {
            throw new Error('network failed');
          }
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(state.lastResponse, null);
});

test('renderer workflows surface request save failures inline before sending', async () => {
  const state = createRendererState();
  const request = {
    id: 'request-1',
    name: 'Get Widgets',
    method: 'GET',
    url: 'https://example.test/widgets',
    scripts: { preRequest: '', tests: '' }
  };
  const collection = {
    id: 'collection-1',
    name: 'Requests',
    requests: [request],
    folders: []
  };
  state.workspace = { collections: [collection], environments: [], history: [], settings: {} };
  state.activeCollectionId = collection.id;
  state.activeRequestId = request.id;
  state.openRequestTabs = [{
    key: 'request:collection-1:request-1',
    collectionId: collection.id,
    requestId: request.id,
    dirty: true
  }];
  state.lastResponse = { requestId: request.id, statusCode: 200 };
  const doc = createDocument();
  doc.getElementById('responseTime').textContent = '99 ms';
  doc.getElementById('responseSize').textContent = '1 KB';
  doc.getElementById('finalUrl').textContent = 'https://old.example.test';
  doc.getElementById('responseHeaders').value = 'x-old: yes';
  let requestSends = 0;
  let validations = 0;
  let status = '';

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => collection,
    activeEnvironment: () => null,
    activeRequest: () => request,
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: () => {},
    renderAuthEditor: () => {},
    renderCookieJarEditor: () => {},
    renderHistory: () => {},
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        request: {
          validate: async () => {
            validations += 1;
            return [];
          },
          send: async () => {
            requestSends += 1;
            return { statusCode: 200, finalUrl: request.url, durationMillis: 1 };
          }
        },
        workspace: {
          saveRequest: async () => {
            throw new Error('disk full before send');
          }
        }
      }
    }
  });

  await workflows.sendActiveRequest();

  assert.equal(validations, 0);
  assert.equal(requestSends, 0);
  assert.equal(state.lastResponse, null);
  assert.equal(doc.getElementById('responseStatus').textContent, 'ERR');
  assert.equal(doc.getElementById('responseTime').textContent, '-');
  assert.equal(doc.getElementById('responseSize').textContent, '-');
  assert.equal(doc.getElementById('finalUrl').textContent, '-');
  assert.equal(doc.getElementById('responseHeaders').value, '');
  assert.equal(doc.getElementById('responseCookies').value, '');
  assert.equal(doc.getElementById('responseBody').value, 'disk full before send');
  assert.equal(status, 'Request failed: disk full before send');
});

test('renderer workflows surface collection-run save failures without starting a run', async () => {
  const state = createRendererState();
  const collection = {
    id: 'collection-1',
    name: 'Runner Collection',
    requests: [],
    folders: []
  };
  state.workspace = { collections: [collection], environments: [], history: [], settings: {} };
  state.activeCollectionId = collection.id;
  state.activeRequestId = null;
  state.lastRunnerResult = { totalRequests: 4, passedRequests: 4, failedRequests: 0 };
  const doc = createDocument();
  doc.getElementById('exportRunnerJsonButton').disabled = false;
  doc.getElementById('exportRunnerCsvButton').disabled = false;
  let runnerStarts = 0;
  let status = '';
  let notification = null;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => collection,
    activeEnvironment: () => null,
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: (title, message) => { notification = { title, message }; },
    runFormatting: createRunFormatting(),
    setStatus: (value) => { status = value; },
    windowObject: {
      postmeter: {
        runner: {
          start: async () => {
            runnerStarts += 1;
            return { cancelled: false, results: [], cookies: [] };
          }
        },
        workspace: {
          save: async () => {
            throw new Error('disk full before runner');
          }
        }
      }
    }
  });

  await workflows.runActiveCollection();

  assert.equal(runnerStarts, 0);
  assert.equal(doc.getElementById('runnerResults').textContent, 'disk full before runner');
  assert.equal(doc.getElementById('exportRunnerJsonButton').disabled, true);
  assert.equal(doc.getElementById('exportRunnerCsvButton').disabled, true);
  assert.equal(state.activeRunnerId, null);
  assert.equal(state.lastRunnerResult, null);
  assert.equal(status, 'Collection run failed.');
  assert.deepEqual(notification, {
    title: 'Collection Run Failed',
    message: 'disk full before runner'
  });
});

test('renderer workflows ignore stale collection-run completions after workspace context reset', async () => {
  const state = createRendererState();
  const collection = {
    id: 'collection-1',
    name: 'Runner Collection',
    requests: [],
    folders: []
  };
  state.activeWorkspaceId = 'workspace-1';
  state.activeCollectionId = collection.id;
  state.workspace = { collections: [collection], environments: [], history: [], cookies: [], settings: {} };
  const doc = createDocument();
  let resolveRun = null;
  let cookieRenders = 0;

  const workflows = createRendererWorkflows({
    state,
    activeCollection: () => collection,
    activeEnvironment: () => null,
    collectRequestFromEditor: () => {},
    doc,
    notifyUser: () => {},
    renderCookieJarEditor: () => { cookieRenders += 1; },
    runFormatting: createRunFormatting(),
    setStatus: () => {},
    windowObject: {
      postmeter: {
        runner: {
          start: async () => new Promise((resolve) => {
            resolveRun = resolve;
          })
        },
        workspace: {
          save: async (workspace) => workspace
        }
      }
    }
  });

  const run = workflows.runActiveCollection();
  await flushMicrotasks();
  assert.equal(typeof resolveRun, 'function');
  state.activeWorkspaceId = 'workspace-2';
  state.activeRunnerId = null;
  doc.getElementById('runnerResults').textContent = 'Workspace reset.';
  resolveRun({
    cancelled: false,
    results: [],
    cookies: [{ name: 'staleRunner', value: 'stale', domain: 'example.test', path: '/' }]
  });
  await run;

  assert.equal(state.lastRunnerResult, null);
  assert.equal(state.workspace.cookies.length, 0);
  assert.equal(cookieRenders, 0);
  assert.equal(doc.getElementById('runnerResults').textContent, 'Workspace reset.');
});

function createDocument() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          disabled: false,
          hidden: true,
          textContent: '',
          value: '',
          checked: false
        });
      }
      return elements.get(id);
    }
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createRunFormatting() {
  return {
    formatLoadResult: () => '',
    formatRunnerResult: () => '',
    oauthProgressDetail: () => '',
    oauthStatusText: () => ''
  };
}

function activeCollectionForState(state) {
  return (state.workspace?.collections || []).find((collection) => collection.id === state.activeCollectionId) || null;
}

function activeEnvironmentForState(state) {
  return (state.workspace?.environments || []).find((environment) => environment.id === state.activeEnvironmentId) || null;
}

function activeRequestForState(state) {
  const collection = activeCollectionForState(state);
  if (!collection || !state.activeRequestId) {
    return null;
  }
  return findRequestInCollection(collection, state.activeRequestId);
}

function findRequestInCollection(collection, requestId) {
  for (const request of collection.requests || []) {
    if (request.id === requestId) {
      return request;
    }
  }
  for (const folder of collection.folders || []) {
    const found = findRequestInFolder(folder, requestId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findRequestInFolder(folder, requestId) {
  for (const request of folder.requests || []) {
    if (request.id === requestId) {
      return request;
    }
  }
  for (const child of folder.folders || []) {
    const found = findRequestInFolder(child, requestId);
    if (found) {
      return found;
    }
  }
  return null;
}
