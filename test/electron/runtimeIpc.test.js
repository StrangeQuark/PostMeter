const assert = require('node:assert/strict');
const http = require('node:http');
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

async function createServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
