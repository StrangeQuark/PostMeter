const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerRuntimeIpc } = require('../../electron/runtimeIpc');

test('runtime IPC registers stable load and runner channels', async () => {
  const handlers = new Map();
  registerRuntimeIpc({
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    getWorkspace: () => ({ cookies: [] }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    saveWorkspace: async (workspace) => workspace,
    setWorkspace: () => {}
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    'load:cancel',
    'load:export',
    'load:start',
    'runner:cancel',
    'runner:export',
    'runner:start'
  ]);
  assert.equal(await handlers.get('load:cancel')(null, 'load-id'), false);
  assert.equal(await handlers.get('runner:cancel')(null, 'runner-id'), false);
});

test('runtime IPC persists load-test cookie updates back to the workspace', async () => {
  const handlers = new Map();
  const workspace = { cookies: [] };
  let savedWorkspace = null;
  let appliedWorkspace = null;
  const seenCookies = [];
  const server = await createServer((request, response) => {
    seenCookies.push(request.headers.cookie || '');
    response.setHeader('Set-Cookie', 'runtimeSession=ready; Path=/; HttpOnly');
    response.statusCode = 200;
    response.end('ok');
  });

  try {
    registerRuntimeIpc({
      dialog: { showSaveDialog: async () => ({ canceled: true }) },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => workspace,
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      saveWorkspace: async (nextWorkspace) => {
        savedWorkspace = structuredClone(nextWorkspace);
        return nextWorkspace;
      },
      setWorkspace: (nextWorkspace) => {
        appliedWorkspace = nextWorkspace;
      }
    });

    const result = await handlers.get('load:start')({
      sender: {
        send() {}
      }
    }, 'load-id', {
      method: 'GET',
      url: `${server.baseUrl}/load`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      cookieJar: { enabled: true, storeResponses: true }
    }, null, {
      concurrency: 1,
      totalRequests: 2
    });

    assert.deepEqual(seenCookies, ['', 'runtimeSession=ready']);
    assert.equal(result.cookies.length, 1);
    assert.equal(savedWorkspace.cookies[0].name, 'runtimeSession');
    assert.equal(appliedWorkspace.cookies[0].value, 'ready');
  } finally {
    await server.close();
  }
});

test('runtime IPC persists refreshed OAuth auth without returning or exporting raw auth payloads', async () => {
  const handlers = new Map();
  const workspace = {
    cookies: [],
    collections: [{
      id: 'collection-1',
      name: 'Runtime OAuth',
      variables: [],
      folders: [],
      requests: [{
        id: 'oauth-request',
        name: 'OAuth Request',
        method: 'GET',
        url: '',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: {
          type: 'oauth2',
          grantType: 'authorizationCode',
          accessToken: 'stale-runtime-token',
          refreshToken: 'runtime-refresh',
          tokenUrl: '',
          expiresAt: '2000-01-01T00:00:00.000Z'
        }
      }]
    }]
  };
  let savedWorkspace = null;
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'fresh-runtime-token',
        refresh_token: 'rotated-runtime-refresh',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    response.statusCode = 200;
    response.end('ok');
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-runtime-ipc-'));
  try {
    workspace.collections[0].requests[0].url = `${server.baseUrl}/resource`;
    workspace.collections[0].requests[0].auth.tokenUrl = `${server.baseUrl}/token`;
    const loadExportPath = path.join(tempDir, 'load-result.json');
    const runnerExportPath = path.join(tempDir, 'runner-result.json');
    const exportPaths = [loadExportPath, runnerExportPath];
    registerRuntimeIpc({
      dialog: { showSaveDialog: async () => ({ filePath: exportPaths.shift(), canceled: false }) },
      fileOperationResult: (result) => result,
      getMainWindow: () => null,
      getWorkspace: () => workspace,
      getWorkspaceId: () => 'workspace-1',
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        }
      },
      mutateWorkspace: async (mutator) => {
        const next = await mutator(workspace);
        savedWorkspace = structuredClone(next);
        return next;
      },
      saveWorkspace: async (nextWorkspace) => nextWorkspace,
      setWorkspace: () => {}
    });

    const result = await handlers.get('load:start')({
      sender: { send() {} }
    }, 'load-id', workspace.collections[0].requests[0], null, {
      concurrency: 1,
      totalRequests: 1
    });

    assert.equal(result.updatedAuth, undefined);
    assert.equal(JSON.stringify(result).includes('fresh-runtime-token'), false);
    assert.equal(JSON.stringify(result).includes('rotated-runtime-refresh'), false);
    assert.equal(savedWorkspace.collections[0].requests[0].auth.accessToken, 'fresh-runtime-token');
    assert.equal(savedWorkspace.collections[0].requests[0].auth.refreshToken, 'rotated-runtime-refresh');

    await handlers.get('load:export')(null, {
      totalRequests: 1,
      successfulRequests: 1,
      failedRequests: 0,
      updatedAuth: {
        type: 'oauth2',
        grantType: 'authorizationCode',
        accessToken: 'exported-load-token',
        refreshToken: 'exported-load-refresh'
      }
    }, 'json');
    await handlers.get('runner:export')(null, {
      collectionId: 'collection-1',
      collectionName: 'Runtime OAuth',
      totalRequests: 1,
      passedRequests: 1,
      failedRequests: 0,
      passed: true,
      results: [{
        requestId: 'oauth-request',
        requestName: 'OAuth Request',
        statusCode: 200,
        durationMillis: 1,
        passed: true,
        updatedAuth: {
          type: 'oauth2',
          grantType: 'authorizationCode',
          accessToken: 'exported-runner-token',
          refreshToken: 'exported-runner-refresh'
        }
      }]
    }, 'json');
    const loadExport = await fs.readFile(loadExportPath, 'utf8');
    const runnerExport = await fs.readFile(runnerExportPath, 'utf8');
    assert.doesNotMatch(loadExport, /exported-load-token|exported-load-refresh/);
    assert.doesNotMatch(runnerExport, /exported-runner-token|exported-runner-refresh/);
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

async function createServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
