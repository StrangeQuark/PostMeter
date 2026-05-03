const assert = require('node:assert/strict');
const test = require('node:test');
const {
  redactedDiagnosticsExportError,
  registerDiagnosticsIpc
} = require('../../electron/diagnosticsIpc');

test('diagnostics IPC registers export channel and returns cancel without exporting', async () => {
  const handlers = new Map();
  let exportCalls = 0;

  registerDiagnosticsIpc({
    dialog: {
      showSaveDialog: async () => ({ canceled: true, filePath: '' })
    },
    exportBundle: async () => {
      exportCalls += 1;
      return '/tmp/should-not-write.json';
    },
    fileOperationResult: (result) => ({ ...result, validated: true }),
    getAppInfo: () => ({ version: '0.2.0' }),
    getMainWindow: () => ({ id: 1 }),
    getWorkspace: () => ({ schemaVersion: 11 }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    logger: {}
  });

  assert.deepEqual([...handlers.keys()], ['diagnostics:export']);
  assert.deepEqual(await handlers.get('diagnostics:export')(), {
    cancelled: true,
    validated: true
  });
  assert.equal(exportCalls, 0);
});

test('diagnostics IPC exports sanitized bundle to selected local JSON path', async () => {
  const handlers = new Map();
  const seen = {};
  const workspace = { schemaVersion: 11, settings: { diagnostics: {} } };
  const logger = { readRecentEntries: async () => [] };

  registerDiagnosticsIpc({
    dialog: {
      showSaveDialog: async (window, options) => {
        seen.window = window;
        seen.dialogOptions = options;
        return { canceled: false, filePath: '/tmp/postmeter-diagnostics.json' };
      }
    },
    exportBundle: async (options) => {
      seen.exportOptions = options;
      return `${options.targetPath}.written`;
    },
    fileOperationResult: (result) => ({ ...result, validated: true }),
    getAppInfo: () => ({ version: '0.2.0', releaseChannel: 'beta' }),
    getMainWindow: () => ({ id: 7 }),
    getWorkspace: () => workspace,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    logger
  });

  const result = await handlers.get('diagnostics:export')();

  assert.equal(seen.window.id, 7);
  assert.equal(seen.dialogOptions.title, 'Export Local Diagnostics');
  assert.match(seen.dialogOptions.defaultPath, /postmeter-diagnostics\.json/);
  assert.deepEqual(seen.dialogOptions.filters, [
    { name: 'JSON', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] }
  ]);
  assert.equal(seen.exportOptions.targetPath, '/tmp/postmeter-diagnostics.json');
  assert.equal(seen.exportOptions.workspace, workspace);
  assert.equal(seen.exportOptions.logger, logger);
  assert.deepEqual(seen.exportOptions.appInfo, { version: '0.2.0', releaseChannel: 'beta' });
  assert.deepEqual(result, {
    cancelled: false,
    path: '/tmp/postmeter-diagnostics.json.written',
    validated: true
  });
});

test('diagnostics IPC ignores renderer-supplied export arguments and uses only the save-dialog path', async () => {
  const handlers = new Map();
  const seen = {};

  registerDiagnosticsIpc({
    dialog: {
      showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/selected-diagnostics.json' })
    },
    exportBundle: async (options) => {
      seen.exportOptions = options;
      return options.targetPath;
    },
    fileOperationResult: (result) => result,
    getWorkspace: () => ({ schemaVersion: 11, settings: { diagnostics: {} } }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });

  const result = await handlers.get('diagnostics:export')(
    {},
    '/tmp/attacker-controlled.json',
    'https://upload.example/diagnostics'
  );

  assert.equal(seen.exportOptions.targetPath, '/tmp/selected-diagnostics.json');
  assert.notEqual(seen.exportOptions.targetPath, '/tmp/attacker-controlled.json');
  assert.equal(result.path, '/tmp/selected-diagnostics.json');
});

test('diagnostics IPC propagates local export write failures without reporting success', async () => {
  const handlers = new Map();
  let resultValidated = false;

  registerDiagnosticsIpc({
    dialog: {
      showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/postmeter-diagnostics.json' })
    },
    exportBundle: async () => {
      throw new Error('local write failed with accessToken=diagnostics-token');
    },
    fileOperationResult: (result) => {
      resultValidated = true;
      return result;
    },
    getWorkspace: () => ({ schemaVersion: 11, settings: { diagnostics: {} } }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });

  await assert.rejects(
    () => handlers.get('diagnostics:export')(),
    (error) => {
      const message = error?.message || '';
      assert.match(message, /local write failed/);
      assert.doesNotMatch(message, /diagnostics-token/);
      assert.match(message, /\[redacted\]/);
      return true;
    }
  );
  assert.equal(resultValidated, false);
});

test('diagnostics export IPC error redaction covers traffic and local paths', () => {
  const error = new Error('failed writing diagnostics for https://api.example.test/customer?token=export-token body=export-body Authorization: Digest username="alice", nonce="abc123", response="deadbeef" Digest username="standalone-user", realm="standalone-realm", nonce="standalone-nonce", uri="/standalone/path", response="standalone-response", cnonce="standalone-cnonce" {"Authorization":"Digest username=\\"json-user\\", nonce=\\"json-nonce\\", response=\\"json-response\\""} client_secret=alpha beta gamma client-assertion=hyphen assertion secret next=ok /home/alice/customer.json');
  error.code = 'EACCES';

  const redacted = redactedDiagnosticsExportError(error);

  assert.equal(redacted.code, 'EACCES');
  assert.doesNotMatch(redacted.message, /api\.example\.test|export-token|export-body|alice|abc123|deadbeef|standalone-user|standalone-realm|standalone-nonce|standalone-response|standalone-cnonce|json-user|json-nonce|json-response|alpha beta gamma|hyphen assertion secret|\/home\/alice/);
  assert.match(redacted.message, /\[url\]|\[omitted:bodies\]|\[path\]/);

  const secretCodeError = new Error('safe diagnostics failure');
  secretCodeError.code = 'ACCESS_TOKEN_SUPERSECRET12345';
  assert.equal(redactedDiagnosticsExportError(secretCodeError).code, '[redacted]');
});

test('diagnostics IPC waits for pending workspace operations before save dialog and export', async () => {
  const handlers = new Map();
  const order = [];
  let releasePendingOperation;
  const pendingOperation = new Promise((resolve) => {
    releasePendingOperation = resolve;
  });

  registerDiagnosticsIpc({
    dialog: {
      showSaveDialog: async () => {
        order.push('dialog');
        return { canceled: false, filePath: '/tmp/postmeter-diagnostics.json' };
      }
    },
    exportBundle: async () => {
      order.push('export');
      return '/tmp/postmeter-diagnostics.json';
    },
    fileOperationResult: (result) => result,
    getWorkspace: () => ({ schemaVersion: 11, settings: { diagnostics: { requestResponseLogging: { urls: true } } } }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    waitForPendingWorkspaceOperations: async () => {
      order.push('wait-start');
      await pendingOperation;
      order.push('wait-end');
    }
  });

  const exportPromise = handlers.get('diagnostics:export')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['wait-start']);

  releasePendingOperation();
  const result = await exportPromise;

  assert.deepEqual(order, ['wait-start', 'wait-end', 'dialog', 'export']);
  assert.equal(result.path, '/tmp/postmeter-diagnostics.json');
});
