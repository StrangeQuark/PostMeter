const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('renderer startup closes open tabs sequentially and skips refs that no longer exist', async () => {
  const { sandbox, state } = loadRendererStartupController();
  const requestTab = { key: 'request:1', requestId: 'request-1' };
  const runnerTab = { key: 'runner:1', runnerId: 'runner-1' };
  sandbox.openRequestTabs = [requestTab];
  sandbox.openRunnerTabs = [runnerTab];

  const closed = await sandbox.closeOpenTabsSequential([
    sandbox.openTabRef('request', requestTab),
    sandbox.openTabRef('environment', { key: 'missing' }),
    sandbox.openTabRef('runner', runnerTab)
  ]);

  assert.equal(closed, true);
  assert.deepEqual(state.closed, [
    ['request', 'request:1'],
    ['runner', 'runner:1']
  ]);
});

test('renderer startup force-close routing honors save-on-force-close preference', async () => {
  const { sandbox, state } = loadRendererStartupController({ saveOnForceClose: true });
  const performanceTab = { key: 'performance:1', performanceTestId: 'perf-1' };
  sandbox.openPerformanceTabs = [performanceTab];

  const closed = await sandbox.closeOpenTabsSequential([
    sandbox.openTabRef('performance', performanceTab)
  ], { force: true });

  assert.equal(closed, true);
  assert.deepEqual(fromVm(state.forceClosed), [
    ['performance', 'performance:1', { save: true }]
  ]);
});

test('renderer startup close queue reports failures instead of breaking later close requests', async () => {
  const { sandbox, state } = loadRendererStartupController({ throwOnRequestClose: true });
  const requestTab = { key: 'request:1', requestId: 'request-1' };
  sandbox.openRequestTabs = [requestTab];

  const first = await sandbox.queueOpenTabCloseSequence([
    sandbox.openTabRef('request', requestTab)
  ]);
  assert.equal(first, false);
  assert.equal(state.statuses.at(-1), 'Tab close failed: close failed');

  sandbox.throwOnRequestClose = false;
  const second = await sandbox.queueOpenTabCloseSequence([
    sandbox.openTabRef('request', requestTab)
  ]);
  assert.equal(second, true);
  assert.deepEqual(state.closed, [['request', 'request:1']]);
});

function loadRendererStartupController(options = {}) {
  const state = { closed: [], forceClosed: [], statuses: [] };
  const sandbox = {
    openCollectionTabs: [],
    openEnvironmentTabs: [],
    openFolderTabs: [],
    openPerformanceTabs: [],
    openRequestTabs: [],
    openRunnerTabs: [],
    openWorkspaceTabs: [],
    setStatus: (message) => state.statuses.push(message),
    throwOnRequestClose: options.throwOnRequestClose === true,
    forceCloseSavesChanges: () => options.saveOnForceClose === true
  };
  for (const kind of ['Collection', 'Folder', 'Request', 'Environment', 'Workspace', 'Runner', 'Performance']) {
    const lower = kind[0].toLowerCase() + kind.slice(1);
    sandbox[`close${kind}Tab`] = async (tab) => {
      if (lower === 'request' && sandbox.throwOnRequestClose) {
        throw new Error('close failed');
      }
      state.closed.push([lower, tab.key]);
      removeTab(sandbox, lower, tab);
    };
    sandbox[`forceClose${kind}Tab`] = async (tab, closeOptions) => {
      state.forceClosed.push([lower, tab.key, closeOptions]);
      removeTab(sandbox, lower, tab);
    };
  }
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/app/rendererStartup.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { sandbox, state };
}

function removeTab(sandbox, kind, tab) {
  const property = `open${kind[0].toUpperCase()}${kind.slice(1)}Tabs`;
  sandbox[property] = (sandbox[property] || []).filter((item) => item.key !== tab.key);
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}
