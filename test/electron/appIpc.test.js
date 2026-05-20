const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertClipboardTextPayload,
  assertMenuShortcutsIgnoredPayload,
  registerAppIpc,
  releaseChannelForVersion,
  safeExternalUrl
} = require('../../electron/appIpc');
const { defaultDiagnosticsSettings, sanitizeDiagnosticEvent } = require('../../src/core/diagnostics');

test('app IPC registers stable app channels', () => {
  const handlers = new Map();
  registerAppIpc({
    app: { getVersion: () => '0.0.0-test' },
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    shell: { openExternal: async () => true }
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    'app:auto-update-status',
    'app:check-updates',
    'app:install-update',
    'app:open-external',
    'app:set-menu-shortcuts-ignored',
    'app:versions',
    'clipboard:writeText'
  ]);
  const versions = handlers.get('app:versions')();
  assert.equal(versions.app, '0.0.0-test');
  assert.equal(versions.releaseChannel, 'stable');
  assert.equal(versions.platform, process.platform);
  assert.equal(versions.packaged, false);
});

test('app IPC toggles menu shortcut ignore mode for the sender webContents', async () => {
  const handlers = new Map();
  const calls = [];
  const sender = {
    setIgnoreMenuShortcuts(value) {
      calls.push(value);
    }
  };
  registerAppIpc({
    app: { getVersion: () => '0.0.0-test' },
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    shell: { openExternal: async () => true }
  });

  assert.equal(await handlers.get('app:set-menu-shortcuts-ignored')({ sender }, true), true);
  assert.equal(sender.__postmeterMenuShortcutsIgnored, true);
  assert.deepEqual(calls, [true]);

  assert.equal(await handlers.get('app:set-menu-shortcuts-ignored')({ sender }, false), true);
  assert.equal(sender.__postmeterMenuShortcutsIgnored, false);
  assert.deepEqual(calls, [true, false]);

  assert.equal(await handlers.get('app:set-menu-shortcuts-ignored')({}, true), false);
});

test('app IPC validates menu shortcut ignore payloads', () => {
  assert.doesNotThrow(() => assertMenuShortcutsIgnoredPayload(true));
  assert.doesNotThrow(() => assertMenuShortcutsIgnoredPayload(false));
  assert.throws(() => assertMenuShortcutsIgnoredPayload('true'), /menu shortcut ignored flag must be a boolean/);
});

test('app IPC writes clipboard text through the main process', async () => {
  const handlers = new Map();
  let copiedText = '';
  registerAppIpc({
    app: { getVersion: () => '0.0.0-test' },
    clipboard: {
      writeText(text) {
        copiedText = text;
      }
    },
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    shell: { openExternal: async () => true }
  });

  assert.equal(await handlers.get('clipboard:writeText')(null, 'copy me'), true);
  assert.equal(copiedText, 'copy me');
});

test('app IPC validates clipboard text payloads', () => {
  assert.doesNotThrow(() => assertClipboardTextPayload('copy me'));
  assert.throws(() => assertClipboardTextPayload(123), /clipboard text must be a string/);
  assert.throws(() => assertClipboardTextPayload('x'.repeat(10 * 1024 * 1024 + 1)), /cannot exceed 10 MB/);
});

test('app version metadata derives release channels', () => {
  assert.equal(releaseChannelForVersion('1.2.3'), 'stable');
  assert.equal(releaseChannelForVersion('1.2.3-alpha.1'), 'alpha');
  assert.equal(releaseChannelForVersion('1.2.3-beta.1'), 'beta');
  assert.equal(releaseChannelForVersion('1.2.3-rc.1'), 'rc');
});

test('app external URL helper only allows GitHub HTTPS URLs', () => {
  assert.equal(safeExternalUrl('https://github.com/StrangeQuark/PostMeter').hostname, 'github.com');
  assert.throws(() => safeExternalUrl('http://github.com/StrangeQuark/PostMeter'), /must use HTTPS/);
  assert.throws(() => safeExternalUrl('https://token@github.com/StrangeQuark/PostMeter'), /must not include credentials/);
  assert.throws(() => safeExternalUrl('javascript:alert(1)'), /must use HTTPS/);
  assert.throws(() => safeExternalUrl('file:///tmp/postmeter.html'), /must use HTTPS/);
  assert.throws(() => safeExternalUrl('https://example.test/PostMeter'), /host is not allowed/);
});

test('app update checks emit structured diagnostic events', async () => {
  const handlers = new Map();
  const events = [];
  registerAppIpc({
    app: { getVersion: () => '1.0.0-beta.1' },
    checkForUpdates: async () => ({
      updateAvailable: false,
      currentVersion: '1.0.0-beta.1',
      latestVersion: '1.0.0-beta.1'
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    recordDiagnosticEvent: async (event) => {
      events.push(event);
    },
    shell: { openExternal: async () => true }
  });

  await handlers.get('app:check-updates')(null, { includePrereleases: true });

  assert.deepEqual(events.map((event) => event.type), ['updates.check.completed']);
  assert.equal(events[0].fields.includePrereleases, true);
  assert.equal(events[0].fields.releaseChannel, 'beta');
});

test('app IPC exposes automatic update status and install actions', async () => {
  const handlers = new Map();
  const calls = [];
  const service = {
    status: () => ({
      status: 'downloaded',
      automaticUpdatesEnabled: true,
      includePrereleases: false,
      version: '9.9.9'
    }),
    installUpdate: async () => {
      calls.push('install');
      return {
        status: 'installing',
        automaticUpdatesEnabled: true,
        includePrereleases: false,
        version: '9.9.9'
      };
    }
  };
  registerAppIpc({
    app: { getVersion: () => '1.0.0', isPackaged: true },
    getAutoUpdateService: () => service,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    shell: { openExternal: async () => true }
  });

  assert.deepEqual(await handlers.get('app:auto-update-status')(), {
    status: 'downloaded',
    automaticUpdatesEnabled: true,
    includePrereleases: false,
    version: '9.9.9'
  });
  assert.deepEqual(await handlers.get('app:install-update')(), {
    status: 'installing',
    automaticUpdatesEnabled: true,
    includePrereleases: false,
    version: '9.9.9'
  });
  assert.deepEqual(calls, ['install']);
});

test('app IPC validates automatic update service payloads', async () => {
  const handlers = new Map();
  registerAppIpc({
    app: { getVersion: () => '1.0.0' },
    getAutoUpdateService: () => ({
      status: () => ({ status: 'restarting' }),
      installUpdate: async () => ({ status: 'failed', error: 42 })
    }),
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    shell: { openExternal: async () => true }
  });

  assert.throws(() => handlers.get('app:auto-update-status')(), /status.status is not supported/);
  await assert.rejects(() => handlers.get('app:install-update')(), /status.error must be a string/);
});

test('app update checks emit sanitized failed diagnostic events', async () => {
  const handlers = new Map();
  const events = [];
  registerAppIpc({
    app: { getVersion: () => '1.0.0' },
    checkForUpdates: async () => {
      throw new Error('update failed Authorization: Bearer update-token /srv/update-cache.json https://api.example.test/releases?token=url-token');
    },
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    recordDiagnosticEvent: async (event) => {
      events.push(sanitizeDiagnosticEvent(event, defaultDiagnosticsSettings()));
    },
    shell: { openExternal: async () => true }
  });

  await assert.rejects(() => handlers.get('app:check-updates')(null, { includePrereleases: false }), /update failed/);

  assert.deepEqual(events.map((event) => event.type), ['updates.check.failed']);
  assert.equal(events[0].failureCode, 'updates_check_failed');
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /update-token|url-token|\/srv\/update-cache|api\.example\.test/);
  assert.match(serialized, /\[path\]/);
  assert.match(serialized, /\[url\]/);
  assert.match(serialized, /\[redacted/);
});
