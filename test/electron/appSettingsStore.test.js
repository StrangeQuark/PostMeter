const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  APP_SETTINGS_FORMAT,
  APP_SETTINGS_VERSION,
  AppSettingsStore,
  defaultSettingsPath
} = require('../../src/core/appSettingsStore');

test('app settings store creates local settings.json without looking like a workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-app-settings-'));
  const settingsPath = path.join(temp, 'settings.json');
  const store = new AppSettingsStore(settingsPath);

  const settings = await store.load();
  const persisted = JSON.parse(await fs.readFile(settingsPath, 'utf8'));

  assert.equal(store.getSettingsPath(), settingsPath);
  assert.equal(settings.format, APP_SETTINGS_FORMAT);
  assert.equal(settings.version, APP_SETTINGS_VERSION);
  assert.equal(persisted.format, APP_SETTINGS_FORMAT);
  assert.equal(persisted.version, APP_SETTINGS_VERSION);
  assert.equal(Object.hasOwn(persisted, 'schemaVersion'), false);
  assert.equal(Object.hasOwn(persisted, 'workspaces'), false);

  const workspaceSettings = store.settingsForWorkspace('Local Workspace.json');
  assert.equal(workspaceSettings.appearance.theme, 'system');
  assert.equal(workspaceSettings.tabs.saveOnForceClose, false);
  assert.equal(workspaceSettings.modals.closeOnBackdropClick, false);
  assert.equal(workspaceSettings.updates.includePrereleases, false);
  assert.equal(workspaceSettings.diagnostics.requestResponseLogging.urls, false);
  assert.equal(workspaceSettings.sandbox.trustedCapabilities.sendRequest, true);
});

test('app settings store persists only app-wide settings and merges workspace-local fallbacks', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-app-settings-split-'));
  const settingsPath = path.join(temp, 'settings.json');
  const store = new AppSettingsStore(settingsPath);
  await store.load();

  await store.mergeWorkspaceSettings('Workspace A.json', {
    appearance: { theme: 'dark' },
    tabs: { saveOnForceClose: true },
    modals: { closeOnBackdropClick: true },
    updates: { includePrereleases: true },
    diagnostics: {
      logging: { enabled: true, level: 'debug' },
      requestResponseLogging: { urls: true, headers: true }
    },
    sandbox: {
      fileBindings: [{ id: 'binding-1', source: 'upload.bin', localPath: '/tmp/upload.bin', mode: 'file' }],
      packageCache: [{
        specifier: '@team/tools',
        source: 'module.exports = {};',
        integrity: 'sha256-test',
        files: [{ path: 'index.js', source: 'module.exports = {};' }]
      }],
      trustedCapabilities: {
        sendRequest: false,
        cookies: false,
        vault: true,
        vaultGrants: { workspace: true, collections: ['collection-1'], requests: ['request-1'] }
      }
    }
  });

  const persisted = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  assert.equal(persisted.app.appearance.theme, 'dark');
  assert.equal(persisted.app.tabs.saveOnForceClose, true);
  assert.equal(persisted.app.modals.closeOnBackdropClick, true);
  assert.equal(persisted.app.updates.includePrereleases, true);
  assert.equal(persisted.app.diagnostics.logging.level, 'debug');
  assert.equal(Object.hasOwn(persisted.app.diagnostics, 'requestResponseLogging'), false);
  assert.equal(persisted.app.sandbox.trustedCapabilities.sendRequest, false);
  assert.equal(persisted.app.sandbox.trustedCapabilities.cookies, false);
  assert.equal(persisted.app.sandbox.trustedCapabilities.vault, true);
  assert.equal(Object.hasOwn(persisted.app.sandbox, 'fileBindings'), false);
  assert.equal(Object.hasOwn(persisted.app.sandbox, 'packageCache'), false);
  assert.equal(Object.hasOwn(persisted, 'workspaces'), false);

  const workspaceASettings = store.settingsForWorkspace('Workspace A.json', {
    diagnostics: { requestResponseLogging: { urls: true, headers: true } },
    sandbox: {
      fileBindings: [{ id: 'binding-1', source: 'upload.bin', localPath: '/tmp/upload.bin', mode: 'file' }],
      packageCache: [{
        specifier: '@team/tools',
        source: 'module.exports = {};',
        integrity: 'sha256-test',
        files: [{ path: 'index.js', source: 'module.exports = {};' }]
      }],
      trustedCapabilities: { vaultGrants: { workspace: true, collections: ['collection-1'], requests: ['request-1'] } }
    }
  });
  assert.equal(workspaceASettings.appearance.theme, 'dark');
  assert.equal(workspaceASettings.diagnostics.requestResponseLogging.urls, true);
  assert.equal(workspaceASettings.sandbox.trustedCapabilities.sendRequest, false);
  assert.equal(workspaceASettings.sandbox.fileBindings[0].source, 'upload.bin');

  const workspaceBSettings = store.settingsForWorkspace('Workspace B.json');
  assert.equal(workspaceBSettings.appearance.theme, 'dark');
  assert.equal(workspaceBSettings.tabs.saveOnForceClose, true);
  assert.equal(workspaceBSettings.diagnostics.requestResponseLogging.urls, false);
  assert.equal(workspaceBSettings.sandbox.trustedCapabilities.sendRequest, false);
});

test('app settings store quarantines corrupt settings.json and recreates defaults', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-app-settings-corrupt-'));
  const settingsPath = path.join(temp, 'settings.json');
  await fs.writeFile(settingsPath, '{not-json');
  const store = new AppSettingsStore(settingsPath);

  const settings = await store.load();
  const entries = await fs.readdir(temp);
  const quarantined = entries.filter((entry) => entry.includes('corrupt'));
  const persisted = JSON.parse(await fs.readFile(settingsPath, 'utf8'));

  assert.equal(settings.format, APP_SETTINGS_FORMAT);
  assert.equal(quarantined.length, 1);
  assert.equal(await fs.readFile(path.join(temp, quarantined[0]), 'utf8'), '{not-json');
  assert.equal(persisted.format, APP_SETTINGS_FORMAT);
  assert.equal(Object.hasOwn(persisted, 'schemaVersion'), false);
});

test('app settings store reads legacy workspace maps as transient local fallbacks', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-app-settings-workspace-id-'));
  const settingsPath = path.join(temp, 'settings.json');
  await fs.writeFile(settingsPath, JSON.stringify({
    format: APP_SETTINGS_FORMAT,
    version: APP_SETTINGS_VERSION,
    app: {
      appearance: { theme: 'light' }
    },
    workspaces: {
      'Old Workspace.json': {
        diagnostics: {
          requestResponseLogging: { urls: true }
        },
        sandbox: {
          trustedCapabilities: {
            vaultGrants: { requests: ['request-1'] }
          }
        }
      }
    }
  }, null, 2));
  const store = new AppSettingsStore(settingsPath);
  await store.load();

  await store.renameWorkspaceSettings('Old Workspace.json', 'New Workspace.json');
  const persistedBeforeSave = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  assert.equal(Object.hasOwn(persistedBeforeSave.workspaces, 'Old Workspace.json'), true);
  assert.equal(store.settingsForWorkspace('New Workspace.json').diagnostics.requestResponseLogging.urls, true);
  assert.deepEqual(store.settingsForWorkspace('New Workspace.json').sandbox.trustedCapabilities.vaultGrants.requests, ['request-1']);
  assert.equal(store.settingsForWorkspace('Old Workspace.json').diagnostics.requestResponseLogging.urls, false);

  await store.mergeWorkspaceSettings('New Workspace.json', {
    appearance: { theme: 'dark' },
    diagnostics: {
      requestResponseLogging: { urls: true }
    }
  });
  const persisted = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  assert.equal(persisted.app.appearance.theme, 'dark');
  assert.equal(Object.hasOwn(persisted, 'workspaces'), false);

  await store.deleteWorkspaceSettings('New Workspace.json');
  assert.equal(store.settingsForWorkspace('New Workspace.json').diagnostics.requestResponseLogging.urls, false);
});

test('default settings path uses settings.json beside POSTMETER_DATA_PATH unless explicitly overridden', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-app-settings-path-'));
  const previousSettingsPath = process.env.POSTMETER_SETTINGS_PATH;
  const previousDataPath = process.env.POSTMETER_DATA_PATH;
  try {
    delete process.env.POSTMETER_SETTINGS_PATH;
    process.env.POSTMETER_DATA_PATH = path.join(temp, 'custom-workspace.json');
    assert.equal(defaultSettingsPath(), path.join(temp, 'settings.json'));

    process.env.POSTMETER_SETTINGS_PATH = path.join(temp, 'explicit-settings.json');
    assert.equal(defaultSettingsPath(), path.join(temp, 'explicit-settings.json'));
  } finally {
    if (previousSettingsPath === undefined) {
      delete process.env.POSTMETER_SETTINGS_PATH;
    } else {
      process.env.POSTMETER_SETTINGS_PATH = previousSettingsPath;
    }
    if (previousDataPath === undefined) {
      delete process.env.POSTMETER_DATA_PATH;
    } else {
      process.env.POSTMETER_DATA_PATH = previousDataPath;
    }
  }
});
