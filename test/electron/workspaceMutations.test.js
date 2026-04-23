const assert = require('node:assert/strict');
const test = require('node:test');
const { collectionModel, environmentModel, requestModel, workspaceModel } = require('../../src/core/models');
const {
  applyCollectionRunMutationsToWorkspace,
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
