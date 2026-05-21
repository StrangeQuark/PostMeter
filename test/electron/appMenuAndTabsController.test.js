const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('app menu controller dispatches creation, import, export, settings, tutorial, and update actions', async () => {
  const { calls, sandbox } = loadAppMenuAndTabsController();

  await sandbox.handleAppMenuAction('new-request');
  await sandbox.handleAppMenuAction('new-folder');
  await sandbox.handleAppMenuAction('settings');
  await sandbox.handleAppMenuAction('tutorials');
  await sandbox.handleAppMenuAction('import-request');
  await sandbox.handleAppMenuAction('export-request-curl');
  await sandbox.handleAppMenuAction('export-postman');
  await sandbox.handleAppMenuAction('export-diagnostics');
  await sandbox.handleAppMenuAction({ type: 'set-prereleases', includePrereleases: true });
  await sandbox.handleAppMenuAction({ type: 'set-save-on-force-close', saveOnForceClose: true });
  await sandbox.handleAppMenuAction('check-updates');

  assert.deepEqual(fromVm(calls), [
    ['newRequest'],
    ['newFolderFromToolbar'],
    ['openSettingsModal'],
    ['openTutorialsModal'],
    ['importRequest'],
    ['exportRequestFromPicker', 'curl'],
    ['exportCollection', null, 'postman'],
    ['exportDiagnostics', { allowNonCurrentWorkspaceView: true }],
    ['setIncludePrereleases', true, { save: true }],
    ['setSaveOnForceClose', true, { save: true }],
    ['checkForUpdates']
  ]);
});

test('app menu controller saves the active tab by current editor context and reports action failures', async () => {
  const { calls, sandbox, state } = loadAppMenuAndTabsController();

  sandbox.activeMainPanel = 'request';
  sandbox.activeRequest = () => ({ id: 'request-1' });
  await sandbox.handleAppMenuAction('save-active-tab');
  sandbox.activeRequest = () => null;
  sandbox.activeFolder = () => ({ id: 'folder-1' });
  await sandbox.handleAppMenuAction('save-active-tab');
  sandbox.activeFolder = () => null;
  sandbox.activeCollection = () => ({ id: 'collection-1' });
  await sandbox.handleAppMenuAction('save-active-tab');

  sandbox.activeMainPanel = 'environment';
  await sandbox.handleAppMenuAction('save-active-tab');
  sandbox.activeMainPanel = 'runner';
  await sandbox.handleAppMenuAction('save-active-tab');
  sandbox.activeMainPanel = 'performance';
  await sandbox.handleAppMenuAction('save-active-tab');
  sandbox.activeMainPanel = 'workspace';
  await sandbox.handleAppMenuAction('save-active-tab');

  assert.deepEqual(fromVm(calls.slice(0, 7)), [
    ['saveRequestFromPane'],
    ['saveFolderFromPane'],
    ['saveCollectionFromPane'],
    ['saveEnvironmentFromPane'],
    ['saveRunnerFromPane'],
    ['savePerformanceTestFromPane'],
    ['saveWorkspace', true, { promptForDraft: true }]
  ]);

  sandbox.newRequest = () => {
    throw new Error('creation failed');
  };
  await sandbox.handleAppMenuAction('new-request');
  assert.equal(state.statuses.at(-1), 'Menu action failed: creation failed');
  assert.deepEqual(state.notifications.at(-1), ['Menu Action Failed', 'creation failed']);
});

function loadAppMenuAndTabsController() {
  const calls = [];
  const state = { notifications: [], statuses: [] };
  const record = (name, result) => (...args) => {
    calls.push([name, ...args]);
    return result ?? null;
  };
  const sandbox = {
    activeCollection: () => null,
    activeFolder: () => null,
    activeMainPanel: 'workspace',
    activeRequest: () => null,
    activeWorkspaceLocked: () => false,
    checkForUpdates: record('checkForUpdates'),
    exportCollection: record('exportCollection'),
    exportDiagnostics: record('exportDiagnostics'),
    exportEnvironmentFromPicker: record('exportEnvironmentFromPicker'),
    exportPerformanceTestFromPicker: record('exportPerformanceTestFromPicker'),
    exportRequestFromPicker: record('exportRequestFromPicker'),
    exportRunnerDefinitionFromPicker: record('exportRunnerDefinitionFromPicker'),
    exportWorkspaceFromPicker: record('exportWorkspaceFromPicker'),
    importCollection: record('importCollection'),
    importEnvironment: record('importEnvironment'),
    importPerformanceTest: record('importPerformanceTest'),
    importRequest: record('importRequest'),
    importRunner: record('importRunner'),
    importWorkspace: record('importWorkspace'),
    newCollection: record('newCollection'),
    newEnvironment: record('newEnvironment'),
    newFolderFromToolbar: record('newFolderFromToolbar'),
    newPerformanceTest: record('newPerformanceTest'),
    newRequest: record('newRequest'),
    newRunner: record('newRunner'),
    newWorkspace: record('newWorkspace'),
    newWorkspaceFromLockedGate: record('newWorkspaceFromLockedGate'),
    notifyUser: (title, message) => state.notifications.push([title, message]),
    openSettingsModal: record('openSettingsModal'),
    openTutorialsModal: record('openTutorialsModal'),
    saveCollectionFromPane: record('saveCollectionFromPane'),
    saveEnvironmentFromPane: record('saveEnvironmentFromPane'),
    saveFolderFromPane: record('saveFolderFromPane'),
    savePerformanceTestFromPane: record('savePerformanceTestFromPane'),
    saveRequestFromPane: record('saveRequestFromPane'),
    saveRunnerFromPane: record('saveRunnerFromPane'),
    saveWorkspace: record('saveWorkspace'),
    setIncludePrereleases: record('setIncludePrereleases'),
    setSaveOnForceClose: record('setSaveOnForceClose'),
    setStatus: (message) => state.statuses.push(message)
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/app/appMenuAndTabs.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { calls, sandbox, state };
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}
