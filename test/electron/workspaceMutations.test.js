const assert = require('node:assert/strict');
const test = require('node:test');
const { collectionModel, environmentModel, requestModel, workspaceModel } = require('../../src/core/models');
const {
  applyEnvironmentSaveToWorkspace,
  applyCollectionRunMutationsToWorkspace,
  applyRequestSaveToWorkspace,
  applyWorkspaceSettingsSaveToWorkspace,
  applyScriptVariableMutationsToWorkspace,
  findWorkspaceRequestContext,
  updateWorkspaceRequestAuth
} = require('../../electron/workspaceMutations');

test('finds and updates requests within nested workspace collections', () => {
  const request = requestModel({ id: 'r1', name: 'Nested', auth: { type: 'none' } });
  const workspace = workspaceModel({
    collections: [collectionModel({
      id: 'c1',
      folders: [{ id: 'f1', name: 'Folder', requests: [request], folders: [] }]
    })]
  });

  const context = findWorkspaceRequestContext(workspace, 'r1');
  updateWorkspaceRequestAuth(workspace, 'r1', { type: 'bearer', token: 'abc' });

  assert.equal(context.collection.id, 'c1');
  assert.equal(context.request.id, 'r1');
  assert.deepEqual(workspace.collections[0].folders[0].requests[0].auth, { type: 'bearer', token: 'abc' });
});

test('applies single request script variable mutations to active workspace scopes', () => {
  const request = requestModel({ id: 'r1', variables: [{ enabled: true, key: 'oldLocal', value: 'old' }] });
  const collection = collectionModel({ id: 'c1', requests: [request], variables: [{ enabled: true, key: 'oldCollection', value: 'old' }] });
  const environment = environmentModel({ id: 'e1', variables: [{ enabled: true, key: 'oldEnv', value: 'old' }] });
  const workspace = workspaceModel({ collections: [collection], environments: [environment] });
  const context = findWorkspaceRequestContext(workspace, 'r1');

  applyScriptVariableMutationsToWorkspace(workspace, {
    collection: context.collection,
    request: context.request,
    environment: { id: 'e1', name: 'Env', variables: [{ enabled: true, key: 'envToken', value: 'new' }] },
    collectionVariables: [{ enabled: true, key: 'collectionToken', value: 'new' }],
    localVariables: [{ enabled: true, key: 'localToken', value: 'new' }]
  });

  assert.deepEqual(workspace.environments[0].variables, [{ enabled: true, key: 'envToken', value: 'new' }]);
  assert.deepEqual(workspace.collections[0].variables, [{ enabled: true, key: 'collectionToken', value: 'new' }]);
  assert.deepEqual(workspace.collections[0].requests[0].variables, [{ enabled: true, key: 'localToken', value: 'new' }]);
});

test('applies collection run script mutations to environment, collection, and request scopes', () => {
  const workspace = workspaceModel({
    environments: [environmentModel({ id: 'e1', variables: [] })],
    collections: [collectionModel({
      id: 'c1',
      variables: [],
      requests: [
        requestModel({ id: 'r1', variables: [] }),
        requestModel({ id: 'r2', variables: [] })
      ]
    })]
  });

  applyCollectionRunMutationsToWorkspace(workspace, {
    collectionId: 'c1',
    environment: { id: 'e1', name: 'Env', variables: [{ enabled: true, key: 'envToken', value: 'runner' }] },
    collectionVariables: [{ enabled: true, key: 'collectionToken', value: 'runner' }],
    results: [
      { requestId: 'r1', localVariables: [{ enabled: true, key: 'localOne', value: 'runner' }] },
      { requestId: 'r2', localVariables: [{ enabled: true, key: 'localTwo', value: 'runner' }] }
    ]
  });

  assert.equal(workspace.environments[0].variables[0].value, 'runner');
  assert.equal(workspace.collections[0].variables[0].key, 'collectionToken');
  assert.equal(workspace.collections[0].requests[0].variables[0].key, 'localOne');
  assert.equal(workspace.collections[0].requests[1].variables[0].key, 'localTwo');
});

test('applies request saves by creating only the required collection and folder shell', () => {
  const workspace = workspaceModel({
    collections: [collectionModel({ id: 'existing', name: 'Existing', requests: [], folders: [] })],
    environments: [],
    cookies: [],
    settings: { updates: { includePrereleases: false } }
  });

  const savedWorkspace = applyRequestSaveToWorkspace(workspace, {
    collectionId: 'collection-1',
    requestId: 'request-1',
    folderId: 'folder-2',
    createdUnsaved: true,
    request: requestModel({ id: 'request-1', name: 'Saved Request', method: 'POST', url: 'https://example.test' }),
    collectionShell: {
      id: 'collection-1',
      name: 'Created Collection',
      description: 'Imported through local save',
      certificates: []
    },
    folderPath: [
      { id: 'folder-1', name: 'Folder One' },
      { id: 'folder-2', name: 'Folder Two' }
    ],
    collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }],
    cookies: [{ enabled: true, name: 'session', value: 'saved', domain: 'example.test', path: '/' }],
    settings: { updates: { includePrereleases: true } }
  });

  assert.equal(workspace.collections.length, 1);
  assert.equal(savedWorkspace.collections.length, 2);
  assert.equal(savedWorkspace.collections[1].name, 'Created Collection');
  assert.deepEqual(savedWorkspace.collections[1].variables, [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }]);
  assert.equal(savedWorkspace.collections[1].folders[0].name, 'Folder One');
  assert.equal(savedWorkspace.collections[1].folders[0].folders[0].name, 'Folder Two');
  assert.equal(savedWorkspace.collections[1].folders[0].folders[0].requests[0].name, 'Saved Request');
  assert.equal(savedWorkspace.cookies[0].value, 'saved');
  assert.equal(savedWorkspace.settings.updates.includePrereleases, true);
});

test('applies environment saves by replacing or appending the selected environment only', () => {
  const workspace = workspaceModel({
    collections: [],
    environments: [environmentModel({ id: 'environment-1', name: 'Existing Environment', variables: [] })],
    settings: { updates: { includePrereleases: false } }
  });

  const updatedWorkspace = applyEnvironmentSaveToWorkspace(workspace, {
    environmentId: 'environment-1',
    environment: environmentModel({ id: 'environment-1', name: 'Saved Environment', variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }] }),
    settings: { updates: { includePrereleases: true } }
  });
  const appendedWorkspace = applyEnvironmentSaveToWorkspace(workspace, {
    environmentId: 'environment-2',
    environment: environmentModel({ id: 'environment-2', name: 'New Environment', variables: [] })
  });

  assert.equal(workspace.environments[0].name, 'Existing Environment');
  assert.equal(updatedWorkspace.environments[0].name, 'Saved Environment');
  assert.equal(updatedWorkspace.settings.updates.includePrereleases, true);
  assert.equal(appendedWorkspace.environments.length, 2);
  assert.equal(appendedWorkspace.environments[1].id, 'environment-2');
});

test('applies workspace settings saves without touching request or environment data', () => {
  const workspace = workspaceModel({
    collections: [collectionModel({ id: 'collection-1', requests: [requestModel({ id: 'request-1', name: 'Saved Request' })] })],
    environments: [environmentModel({ id: 'environment-1', name: 'Saved Environment', variables: [] })],
    settings: { updates: { includePrereleases: false } }
  });

  const updatedWorkspace = applyWorkspaceSettingsSaveToWorkspace(workspace, {
    appearance: { theme: 'dark' },
    updates: { includePrereleases: true }
  });

  assert.equal(workspace.settings.updates.includePrereleases, false);
  assert.equal(updatedWorkspace.settings.appearance.theme, 'dark');
  assert.equal(updatedWorkspace.settings.updates.includePrereleases, true);
  assert.equal(updatedWorkspace.collections[0].requests[0].id, 'request-1');
  assert.equal(updatedWorkspace.environments[0].id, 'environment-1');
});
