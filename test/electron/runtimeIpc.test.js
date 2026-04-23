const assert = require('node:assert/strict');
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
