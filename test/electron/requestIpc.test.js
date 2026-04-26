const assert = require('node:assert/strict');
const test = require('node:test');
const {
  collectionModel,
  environmentModel,
  requestModel,
  workspaceModel
} = require('../../src/core/models');
const { registerRequestIpc } = require('../../electron/requestIpc');

test('request IPC registers stable request channels', () => {
  const handlers = new Map();
  registerRequestIpc({
    getWorkspace: () => ({ cookies: [], collections: [], environments: [], history: [] }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    saveWorkspace: async (workspace) => workspace,
    setWorkspace: () => {}
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    'request:send',
    'request:validate'
  ]);
});

test('request IPC discards pre-request script mutations when a top-level script error is rethrown', async () => {
  const handlers = new Map();
  const workspace = workspaceModel({
    collections: [
      collectionModel({
        id: 'collection-1',
        name: 'Scripted Requests',
        variables: [{ enabled: true, key: 'fromPre', value: 'old-value' }],
        requests: [
          requestModel({
            id: 'request-1',
            name: 'Blocked Request',
            method: 'GET',
            url: 'https://api.example.test',
            variables: [{ enabled: true, key: 'local', value: 'old-local' }],
            scripts: {
              preRequest: `
                pm.environment.set('token', 'blocked');
                pm.collectionVariables.set('fromPre', 'yes');
                pm.variables.set('local', 'nope');
                throw new Error('bad pre-request');
              `
            }
          })
        ]
      })
    ],
    environments: [
      environmentModel({
        id: 'environment-1',
        name: 'Runtime Env',
        variables: [{ enabled: true, key: 'token', value: 'old-token' }]
      })
    ],
    cookies: [],
    history: []
  });
  let savedWorkspace = null;
  let appliedWorkspace = null;
  let saveCalls = 0;

  registerRequestIpc({
    getWorkspace: () => workspace,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    saveWorkspace: async (nextWorkspace) => {
      saveCalls += 1;
      savedWorkspace = structuredClone(nextWorkspace);
      return nextWorkspace;
    },
    setWorkspace: (nextWorkspace) => {
      appliedWorkspace = structuredClone(nextWorkspace);
    }
  });

  await assert.rejects(
    () => handlers.get('request:send')(
      null,
      structuredClone(workspace.collections[0].requests[0]),
      structuredClone(workspace.environments[0])
    ),
    (error) => {
      assert.equal(error.preRequestScriptResult.error, 'bad pre-request');
      return true;
    }
  );

  assert.equal(saveCalls, 0);
  assert.equal(savedWorkspace, null);
  assert.equal(appliedWorkspace, null);
  assert.equal(workspace.history.length, 0);
  assert.equal(workspace.environments[0].variables.find((item) => item.key === 'token').value, 'old-token');
  assert.equal(workspace.collections[0].variables.find((item) => item.key === 'fromPre').value, 'old-value');
  assert.equal(workspace.collections[0].requests[0].variables.find((item) => item.key === 'local').value, 'old-local');
});
