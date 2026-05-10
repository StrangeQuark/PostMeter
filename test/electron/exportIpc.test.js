const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerExportIpc } = require('../../electron/exportIpc');

test('picker-first export opens save dialogs from lightweight metadata', async () => {
  const handlers = new Map();
  let saveDialogOptions = null;
  let saveDialogCalled = false;
  let resolveSaveDialog;
  registerExportIpc({
    dialog: {
      showSaveDialog: async (_window, options) => {
        saveDialogCalled = true;
        saveDialogOptions = options;
        return await new Promise((resolve) => {
          resolveSaveDialog = resolve;
        });
      }
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });

  const choosePathPromise = handlers.get('file-export:choosePath')({}, {
    kind: 'collection',
    format: 'postman',
    name: 'Auth Service'
  });
  await Promise.resolve();

  assert.equal(saveDialogCalled, true);
  assert.equal(saveDialogOptions.title, 'Export Collection');
  assert.equal(saveDialogOptions.defaultPath, 'Auth-Service.postman_collection.json');
  assert.deepEqual(saveDialogOptions.filters, [
    { name: 'POSTMAN Collection', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] }
  ]);

  resolveSaveDialog({ canceled: true });
  assert.deepEqual(await choosePathPromise, { cancelled: true });
});

test('picker-first export prepares in a worker and writes only after a path is selected', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-picker-export-'));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  const handlers = new Map();
  registerExportIpc({
    dialog: {
      showSaveDialog: async (_window, options) => ({ canceled: false, filePath: path.join(tempDir, options.defaultPath) })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });

  const collection = {
    id: 'collection-1',
    name: 'Exported Collection',
    requests: [{
      id: 'request-1',
      name: 'Request',
      method: 'GET',
      url: 'https://example.test',
      queryParams: [],
      headers: [],
      bodyType: 'NONE'
    }],
    folders: []
  };

  const pathResult = await handlers.get('file-export:choosePath')({}, {
    kind: 'collection',
    format: 'postmeter',
    name: collection.name
  });
  assert.equal(pathResult.cancelled, false);

  await handlers.get('file-export:prepare')({}, {
    exportId: 'export-collection-1',
    kind: 'collection',
    format: 'postmeter',
    payload: collection
  });
  const writeResult = await handlers.get('file-export:writePrepared')({}, 'export-collection-1', pathResult.path);

  assert.deepEqual(writeResult, { cancelled: false, path: pathResult.path });
  const exported = JSON.parse(await fs.readFile(writeResult.path, 'utf8'));
  assert.equal(exported.collections[0].name, 'Exported Collection');
  assert.equal(exported.collections[0].requests[0].name, 'Request');
});

test('picker-first export cancellation clears prepared content before writing', async () => {
  const handlers = new Map();
  registerExportIpc({
    dialog: {
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });

  await handlers.get('file-export:prepare')({}, {
    exportId: 'export-env-1',
    kind: 'environment',
    format: 'postmeter',
    payload: {
      id: 'env-1',
      name: 'Local',
      variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }]
    }
  });

  assert.equal(await handlers.get('file-export:cancelPrepared')({}, 'export-env-1'), true);
  await assert.rejects(
    () => handlers.get('file-export:writePrepared')({}, 'export-env-1', '/tmp/environment.json'),
    /Prepared export was not found/
  );
});

test('picker-first export rejects invalid export kinds and worker payloads', async () => {
  const handlers = new Map();
  registerExportIpc({
    dialog: {
      showSaveDialog: async () => ({ canceled: true })
    },
    fileOperationResult: (result) => result,
    getMainWindow: () => null,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });

  await assert.rejects(
    () => handlers.get('file-export:choosePath')({}, { kind: 'unknown' }),
    /Export kind must be workspace, collection, environment, runner, or performance/
  );
  await assert.rejects(
    () => handlers.get('file-export:prepare')({}, {
      exportId: 'bad-env-export',
      kind: 'environment',
      format: 'curl',
      payload: { id: 'env-1', name: 'Local', variables: [] }
    }),
    /Environment export format must be postmeter or postman/
  );
});
