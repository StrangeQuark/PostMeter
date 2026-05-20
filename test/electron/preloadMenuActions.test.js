const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ALLOWED_MENU_ACTIONS = [
  'new-workspace',
  'new-request',
  'new-collection',
  'new-folder',
  'new-environment',
  'new-runner',
  'new-performance-test',
  'save-active-tab',
  'settings',
  'tutorials',
  'import-workspace',
  'import-request',
  'import-collection',
  'import-environment',
  'import-runner',
  'import-performance-test',
  'export-workspace',
  'export-request',
  'export-request-curl',
  'export-collection',
  'export-postman',
  'export-openapi',
  'export-curl',
  'export-environment',
  'export-postman-environment',
  'export-runner-definition',
  'export-performance-test',
  'export-diagnostics',
  'check-updates'
];

test('preload relays every allowed native menu action to the renderer callback', () => {
  const harness = loadPreloadHarness();
  const received = [];
  const cleanup = harness.api.app.onMenuAction((action) => received.push(action));

  for (const action of ALLOWED_MENU_ACTIONS) {
    harness.emit('menu:action', action);
  }
  harness.emit('menu:action', { type: 'set-prereleases', includePrereleases: true });
  harness.emit('menu:action', { type: 'set-save-on-force-close', saveOnForceClose: false });

  assert.deepEqual(JSON.parse(JSON.stringify(received)), [
    ...ALLOWED_MENU_ACTIONS,
    { type: 'set-prereleases', includePrereleases: true },
    { type: 'set-save-on-force-close', saveOnForceClose: false }
  ]);

  cleanup();
  harness.emit('menu:action', 'settings');
  assert.equal(received.length, ALLOWED_MENU_ACTIONS.length + 2);
});

test('preload filters unknown or malformed menu action payloads', () => {
  const harness = loadPreloadHarness();
  const received = [];
  harness.api.app.onMenuAction((action) => received.push(action));

  for (const action of [
    'unknown-action',
    '',
    null,
    42,
    { type: 'set-prereleases', includePrereleases: 'true' },
    { type: 'set-save-on-force-close', saveOnForceClose: 'false' },
    { type: 'export-diagnostics' },
    { type: 'settings' },
    { type: 'set-prereleases', saveOnForceClose: true }
  ]) {
    harness.emit('menu:action', action);
  }

  assert.deepEqual(received, []);
});

test('preload exposes the PostMeter API only in the main frame', () => {
  assert.equal(Boolean(loadPreloadHarness({ isMainFrame: true }).api), true);
  assert.equal(loadPreloadHarness({ isMainFrame: false }).api, undefined);
});

test('preload exposes menu shortcut ignore toggling through the app API', async () => {
  const harness = loadPreloadHarness();
  assert.deepEqual(await harness.api.app.setMenuShortcutsIgnored(true), {
    channel: 'app:set-menu-shortcuts-ignored',
    args: [true]
  });
  assert.deepEqual(await harness.api.app.setMenuShortcutsIgnored(false), {
    channel: 'app:set-menu-shortcuts-ignored',
    args: [false]
  });
  assert.deepEqual(await harness.api.app.setMenuShortcutsIgnored('true'), {
    channel: 'app:set-menu-shortcuts-ignored',
    args: [false]
  });
});

test('preload exposes automatic update APIs and sanitizes update status events', async () => {
  const harness = loadPreloadHarness();
  assert.deepEqual(await harness.api.app.autoUpdateStatus(), {
    channel: 'app:auto-update-status',
    args: []
  });
  assert.deepEqual(await harness.api.app.installUpdate(), {
    channel: 'app:install-update',
    args: []
  });

  const received = [];
  const cleanup = harness.api.app.onAutoUpdateStatus((status) => received.push(status));
  harness.emit('updates:status', {
    status: 'downloading',
    automaticUpdatesEnabled: true,
    includePrereleases: true,
    version: '9.9.9'.repeat(20),
    percent: '41.5',
    transferred: 1024,
    total: 2048,
    bytesPerSecond: '512'
  });
  harness.emit('updates:status', null);
  cleanup();
  harness.emit('updates:status', { status: 'downloaded' });

  assert.equal(received.length, 2);
  assert.equal(received[0].status, 'downloading');
  assert.equal(received[0].automaticUpdatesEnabled, true);
  assert.equal(received[0].includePrereleases, true);
  assert.equal(received[0].version.length, 64);
  assert.equal(received[0].percent, 41.5);
  assert.equal(received[0].bytesPerSecond, 512);
  assert.equal(received[1].status, 'failed');
});

function loadPreloadHarness(options = {}) {
  const listeners = new Map();
  const exposed = {};
  const fakeElectron = {
    contextBridge: {
      exposeInMainWorld(name, api) {
        exposed[name] = api;
      }
    },
    ipcRenderer: {
      invoke: async (channel, ...args) => ({ channel, args }),
      sendSync: (channel, ...args) => ({ channel, args }),
      on(channel, listener) {
        if (!listeners.has(channel)) {
          listeners.set(channel, []);
        }
        listeners.get(channel).push(listener);
      },
      removeListener(channel, listener) {
        listeners.set(channel, (listeners.get(channel) || []).filter((item) => item !== listener));
      }
    },
    webUtils: {
      getPathForFile(file) {
        return file?.path || '';
      }
    }
  };
  const sandbox = {
    console,
    require(moduleName) {
      if (moduleName === 'electron') {
        return fakeElectron;
      }
      return require(moduleName);
    },
    process: {
      ...process,
      isMainFrame: options.isMainFrame !== false
    },
    URL
  };
  const preloadPath = path.join(__dirname, '..', '..', 'electron', 'app-shell', 'preload.js');
  vm.runInNewContext(fs.readFileSync(preloadPath, 'utf8'), sandbox, { filename: preloadPath });
  return {
    api: exposed.postmeter,
    emit(channel, payload) {
      for (const listener of listeners.get(channel) || []) {
        listener({}, payload);
      }
    }
  };
}
