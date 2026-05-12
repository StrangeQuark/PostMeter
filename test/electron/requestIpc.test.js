const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  collectionModel,
  environmentModel,
  requestModel,
  workspaceModel
} = require('../../src/core/models');
const { runRequestWithScripts } = require('../../src/core/requestScriptRunner');
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

test('request IPC passes effective folder scope to scripted request execution', async () => {
  const handlers = new Map();
  const request = requestModel({
    id: 'request-1',
    method: 'GET',
    url: 'https://example.test'
  });
  const workspace = workspaceModel({
    collections: [
      collectionModel({
        id: 'collection-1',
        folders: [{
          id: 'parent-folder',
          name: 'Parent',
          variables: [{ enabled: true, key: 'scope', value: 'parent' }],
          scripts: { preRequest: "pm.environment.set('scope', 'parent');" },
          folders: [{
            id: 'child-folder',
            name: 'Child',
            auth: { type: 'bearer', token: 'folder-token' },
            variables: [
              { enabled: true, key: 'scope', value: 'child' },
              { enabled: true, key: 'childOnly', value: 'yes' }
            ],
            scripts: { tests: "pm.test('child', function () {});" },
            requests: [request]
          }]
        }]
      })
    ],
    environments: [],
    cookies: [],
    history: []
  });
  let capturedOptions = null;

  registerRequestIpc({
    getWorkspace: () => workspace,
    getWorkspaceId: () => 'workspace-1',
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    mutateWorkspace: async (mutator) => mutator(workspace),
    runRequestWithScripts: async (_request, _environment, options) => {
      capturedOptions = options;
      return {
        response: {
          statusCode: 200,
          headers: {},
          body: 'ok',
          durationMillis: 1,
          responseBytes: 2,
          finalUrl: 'https://example.test',
          requestSent: true
        },
        environment: null,
        collectionVariables: [],
        localVariables: [],
        globals: []
      };
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  await handlers.get('request:send')(null, request, null);

  assert.equal(capturedOptions.folderAuth.token, 'folder-token');
  assert.equal(capturedOptions.folderScripts.preRequest, "pm.environment.set('scope', 'parent');");
  assert.equal(capturedOptions.folderScripts.tests, "pm.test('child', function () {});");
  assert.deepEqual(capturedOptions.folderVariables.map((item) => [item.key, item.value]), [
    ['scope', 'child'],
    ['childOnly', 'yes']
  ]);
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

test('request IPC sends despite top-level pre-request failures without committing failed script mutations', async () => {
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
    runRequestWithScripts: (request, environment, options) => runRequestWithScripts(request, environment, {
      ...options,
      sendRequest: async () => ({
        statusCode: 200,
        headers: { 'content-type': ['text/plain'] },
        body: 'main response',
        durationMillis: 7,
        responseBytes: 13,
        finalUrl: 'https://api.example.test'
      })
    }),
    setWorkspace: (nextWorkspace) => {
      appliedWorkspace = structuredClone(nextWorkspace);
    }
  });

  const response = await handlers.get('request:send')(
    null,
    structuredClone(workspace.collections[0].requests[0]),
    structuredClone(workspace.environments[0])
  );

  assert.equal(response.requestSent, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'main response');
  assert.equal(response.preRequestScriptResult.error, 'bad pre-request');
  assert.equal(response.environment.variables.find((item) => item.key === 'token').value, 'old-token');
  assert.equal(response.collectionVariables.find((item) => item.key === 'fromPre').value, 'old-value');
  assert.equal(response.localVariables.find((item) => item.key === 'local').value, 'old-local');
  assert.equal(saveCalls, 1);
  assert.equal(savedWorkspace.history.length, 1);
  assert.equal(appliedWorkspace.history.length, 1);
  assert.equal(appliedWorkspace.history[0].statusCode, 200);
  assert.equal(workspace.environments[0].variables.find((item) => item.key === 'token').value, 'old-token');
  assert.equal(workspace.collections[0].variables.find((item) => item.key === 'fromPre').value, 'old-value');
  assert.equal(workspace.collections[0].requests[0].variables.find((item) => item.key === 'local').value, 'old-local');
});

test('request IPC diagnostic events do not include request URLs or bodies by default', async () => {
  const handlers = new Map();
  const events = [];
  const workspace = workspaceModel({
    collections: [
      collectionModel({
        id: 'collection-1',
        requests: [
          requestModel({
            id: 'request-1',
            method: 'POST',
            url: 'https://api.example.test/customers?token=request-token',
            body: 'customer-request-body'
          })
        ]
      })
    ],
    environments: [],
    cookies: [],
    history: []
  });
  const failure = new Error('Pre-request script failed.');
  failure.preRequestScriptResult = {
    passed: false,
    tests: [],
    error: 'Authorization: Bearer script-token customer-request-body',
    logs: [],
    commitSideEffects: false
  };

  registerRequestIpc({
    getWorkspace: () => workspace,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    recordDiagnosticEvent: async (event) => {
      events.push(event);
    },
    runRequestWithScripts: async () => {
      throw failure;
    },
    saveWorkspace: async (nextWorkspace) => nextWorkspace,
    setWorkspace: () => {}
  });

  const result = await handlers.get('request:send')(
    null,
    structuredClone(workspace.collections[0].requests[0]),
    null
  );

  assert.equal(result.requestSent, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'request.send.failed');
  assert.equal(events[0].fields.requestBodyBytes, Buffer.byteLength('customer-request-body', 'utf8'));
  assert.doesNotMatch(JSON.stringify(events[0]), /api\.example\.test|request-token|customer-request-body|script-token/);
});

test('request IPC returns callback-style pre-request test failures while still sending the request', async () => {
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
    runRequestWithScripts: (request, environment, options) => runRequestWithScripts(request, environment, {
      ...options,
      sendRequest: async () => ({
        statusCode: 200,
        headers: { 'content-type': ['text/plain'] },
        body: 'main response',
        durationMillis: 7,
        responseBytes: 13,
        finalUrl: 'https://api.example.test'
      })
    }),
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

  assert.equal(response.requestSent, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'main response');
  assert.equal(response.preRequestScriptResult.error, '');
  assert.equal(response.preRequestScriptResult.tests[0].passed, false);
  assert.match(response.preRequestScriptResult.tests[0].error, /pm\.sendRequest is disabled/);
  assert.equal(response.environment.variables.find((item) => item.key === 'beforeDenied').value, 'committed');
  assert.equal(workspace.environments[0].variables.find((item) => item.key === 'beforeDenied').value, 'committed');
  assert.equal(workspace.history.length, 1);
  assert.equal(workspace.history[0].statusCode, 200);
  assert.equal(saveCalls, 1);
});

test('request IPC returns valid skipped responses for pre-request skipRequest', async () => {
  const handlers = new Map();
  const workspace = workspaceModel({
    collections: [
      collectionModel({
        id: 'collection-1',
        name: 'Skipped Requests',
        requests: [
          requestModel({
            id: 'request-1',
            name: 'Skipped',
            method: 'GET',
            url: 'https://api.example.test/skipped',
            scripts: {
              preRequest: `
                pm.test('skip main request', function () {
                  pm.execution.skipRequest();
                });
              `
            }
          })
        ]
      })
    ],
    environments: [],
    cookies: [],
    history: []
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
    null
  );

  assert.equal(response.requestSent, false);
  assert.equal(response.skipped, true);
  assert.equal(response.statusCode, 0);
  assert.match(response.body, /skipped/i);
  assert.equal(response.preRequestScriptResult.tests[0].passed, true);
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
