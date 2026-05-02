const assert = require('node:assert/strict');
const http = require('node:http');
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

test('request IPC validates public responses before mutating workspace state', async () => {
  const handlers = new Map();
  const workspace = workspaceModel({
    collections: [],
    environments: [],
    cookies: [],
    history: []
  });
  let mutationCalls = 0;

  registerRequestIpc({
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => {
      mutationCalls += 1;
      return mutator(workspace);
    },
    runRequestWithScripts: async () => ({
      response: {
        statusCode: 200,
        headers: { bad: [42] },
        body: 'ok',
        durationMillis: 1,
        responseBytes: 2,
        finalUrl: 'https://example.test'
      },
      environment: null,
      collectionVariables: [],
      localVariables: [],
      globals: []
    }),
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  await assert.rejects(
    () => handlers.get('request:send')(null, requestModel({
      id: 'request-1',
      method: 'GET',
      url: 'https://example.test'
    }), null),
    /response.headers.bad\[0\] must be a string/
  );
  assert.equal(mutationCalls, 0);
  assert.equal(workspace.history.length, 0);
});

test('request IPC reports refreshed auth persisted only when the workspace mutation applies', async () => {
  const handlers = new Map();
  const workspace = workspaceModel({
    collections: [
      collectionModel({
        id: 'collection-1',
        requests: [
          requestModel({
            id: 'request-1',
            method: 'GET',
            url: 'https://example.test',
            auth: {
              type: 'oauth2',
              grantType: 'authorizationCode',
              accessToken: 'stale-token'
            }
          })
        ]
      })
    ],
    environments: [],
    cookies: [],
    history: []
  });
  registerRequestIpc({
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async () => workspace,
    runRequestWithScripts: async () => ({
      response: {
        statusCode: 200,
        headers: {},
        body: 'ok',
        durationMillis: 1,
        responseBytes: 2,
        finalUrl: 'https://example.test',
        updatedAuth: {
          type: 'oauth2',
          grantType: 'authorizationCode',
          accessToken: 'fresh-token'
        }
      },
      environment: null,
      collectionVariables: [],
      localVariables: [],
      globals: []
    }),
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  const response = await handlers.get('request:send')(null, structuredClone(workspace.collections[0].requests[0]), null);
  assert.equal(response.updatedAuth, undefined);
  assert.equal(response.updatedAuthPersisted, undefined);
  assert.equal(workspace.collections[0].requests[0].auth.accessToken, 'stale-token');
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
    setWorkspace: (nextWorkspace) => {
      for (const key of Object.keys(workspace)) {
        delete workspace[key];
      }
      Object.assign(workspace, structuredClone(nextWorkspace));
    }
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

test('request IPC persists refreshed OAuth auth without returning raw auth in the response payload', async () => {
  const handlers = new Map();
  const workspace = workspaceModel({
    collections: [
      collectionModel({
        id: 'collection-1',
        name: 'OAuth Requests',
        requests: [
          requestModel({
            id: 'request-1',
            name: 'Refresh OAuth',
            method: 'GET',
            url: '',
            auth: {
              type: 'oauth2',
              grantType: 'authorizationCode',
              accessToken: 'stale-ipc-token',
              refreshToken: 'ipc-refresh-token',
              tokenUrl: '',
              expiresAt: '2000-01-01T00:00:00.000Z'
            }
          })
        ]
      })
    ],
    environments: [],
    cookies: [],
    history: []
  });
  let savedWorkspace = null;
  let capturedAuthorization = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'ipc-fresh-token',
        refresh_token: 'ipc-rotated-refresh-token',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    capturedAuthorization = request.headers.authorization || '';
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });

  try {
    workspace.collections[0].requests[0].url = `${server.baseUrl}/resource`;
    workspace.collections[0].requests[0].auth.tokenUrl = `${server.baseUrl}/token`;
    registerRequestIpc({
      getWorkspace: () => workspace,
      getWorkspaceId: () => 'workspace-1',
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      mutateWorkspace: async (mutator) => {
        const nextWorkspace = await mutator(workspace);
        savedWorkspace = structuredClone(nextWorkspace);
        return nextWorkspace;
      },
      saveWorkspace: async (nextWorkspace) => nextWorkspace,
      setWorkspace: () => {}
    });

    const response = await handlers.get('request:send')(
      null,
      structuredClone(workspace.collections[0].requests[0]),
      null
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.updatedAuth, undefined);
    assert.equal(response.updatedAuthPersisted, true);
    assert.equal(JSON.stringify(response).includes('ipc-fresh-token'), false);
    assert.equal(JSON.stringify(response).includes('ipc-rotated-refresh-token'), false);
    assert.equal(capturedAuthorization, 'Bearer ipc-fresh-token');
    assert.equal(savedWorkspace.collections[0].requests[0].auth.accessToken, 'ipc-fresh-token');
    assert.equal(savedWorkspace.collections[0].requests[0].auth.refreshToken, 'ipc-rotated-refresh-token');
  } finally {
    await server.close();
  }
});

test('request IPC default workspace mutation does not dirty live workspace when persistence fails', async () => {
  const handlers = new Map();
  const workspace = workspaceModel({
    collections: [
      collectionModel({
        id: 'collection-1',
        name: 'Requests',
        requests: [
          requestModel({
            id: 'request-1',
            name: 'Cookie Request',
            method: 'GET',
            url: '',
            cookieJar: { enabled: true, storeResponses: true }
          })
        ]
      })
    ],
    environments: [],
    cookies: [],
    history: []
  });
  const server = await createServer(async (_request, response) => {
    response.setHeader('Set-Cookie', 'ipcSession=ready; Path=/; HttpOnly');
    response.statusCode = 200;
    response.end('ok');
  });

  try {
    workspace.collections[0].requests[0].url = `${server.baseUrl}/resource`;
    registerRequestIpc({
      getWorkspace: () => workspace,
      getWorkspaceId: () => 'workspace-1',
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      saveWorkspace: async () => {
        throw new Error('disk full');
      },
      setWorkspace: () => {
        throw new Error('setWorkspace should not run after a failed save');
      }
    });

    await assert.rejects(
      () => handlers.get('request:send')(
        null,
        structuredClone(workspace.collections[0].requests[0]),
        null
      ),
      /disk full/
    );

    assert.deepEqual(workspace.cookies, []);
    assert.deepEqual(workspace.history, []);
  } finally {
    await server.close();
  }
});

async function createServer(handler) {
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.statusCode = 500;
      response.end(error.stack || String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
