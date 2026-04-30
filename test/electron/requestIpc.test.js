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

test('request IPC returns pre-request script failures without committing top-level error mutations', async () => {
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

  const response = await handlers.get('request:send')(
    null,
    structuredClone(workspace.collections[0].requests[0]),
    structuredClone(workspace.environments[0])
  );

  assert.equal(response.requestSent, false);
  assert.equal(response.statusCode, 0);
  assert.equal(response.body, 'bad pre-request');
  assert.equal(response.preRequestScriptResult.error, 'bad pre-request');
  assert.equal(response.environment.variables.find((item) => item.key === 'token').value, 'old-token');
  assert.equal(response.collectionVariables.find((item) => item.key === 'fromPre').value, 'old-value');
  assert.equal(response.localVariables.find((item) => item.key === 'local').value, 'old-local');
  assert.equal(saveCalls, 0);
  assert.equal(savedWorkspace, null);
  assert.equal(appliedWorkspace, null);
  assert.equal(workspace.history.length, 0);
  assert.equal(workspace.environments[0].variables.find((item) => item.key === 'token').value, 'old-token');
  assert.equal(workspace.collections[0].variables.find((item) => item.key === 'fromPre').value, 'old-value');
  assert.equal(workspace.collections[0].requests[0].variables.find((item) => item.key === 'local').value, 'old-local');
});

test('request IPC returns detailed callback-style pre-request test failures without throwing', async () => {
  const handlers = new Map();
  const workspace = workspaceModel({
    collections: [
      collectionModel({
        id: 'collection-1',
        name: 'Scripted Requests',
        requests: [
          requestModel({
            id: 'request-1',
            name: 'Network Disabled',
            method: 'GET',
            url: 'https://api.example.test',
            scripts: {
              preRequest: `
                pm.environment.set('beforeDenied', 'committed');
                pm.sendRequest('https://api.example.test/denied', function (error) {
                  pm.test('script network request should be available', function () {
                    pm.expect(error).to.equal(null);
                  });
                });
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
        variables: []
      })
    ],
    cookies: [],
    history: [],
    settings: {
      sandbox: {
        trustedCapabilities: {
          sendRequest: false,
          cookies: true,
          vault: false
        }
      }
    }
  });
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
      return nextWorkspace;
    },
    setWorkspace: () => {}
  });

  const response = await handlers.get('request:send')(
    null,
    structuredClone(workspace.collections[0].requests[0]),
    structuredClone(workspace.environments[0])
  );

  assert.equal(response.requestSent, false);
  assert.equal(response.statusCode, 0);
  assert.match(response.body, /Pre-request script failed/);
  assert.match(response.body, /script network request should be available/);
  assert.match(response.body, /pm\.sendRequest is disabled/);
  assert.equal(response.preRequestScriptResult.error, '');
  assert.equal(response.preRequestScriptResult.tests[0].passed, false);
  assert.match(response.preRequestScriptResult.tests[0].error, /pm\.sendRequest is disabled/);
  assert.equal(response.environment.variables.find((item) => item.key === 'beforeDenied').value, 'committed');
  assert.equal(workspace.environments[0].variables.find((item) => item.key === 'beforeDenied').value, 'committed');
  assert.equal(workspace.history.length, 0);
  assert.equal(saveCalls, 1);
});
