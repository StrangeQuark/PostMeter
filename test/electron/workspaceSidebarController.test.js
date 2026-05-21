const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('workspace tree labels only show active state suffixes', () => {
  const { sandbox } = loadWorkspaceSidebarController({ id: 'plain', name: 'Plain', encrypted: false, locked: false, current: false });

  assert.equal(sandbox.workspaceTreeLabel({ id: 'active', name: 'Active Workspace', encrypted: true, locked: false, current: true }), 'Active Workspace (Active)');
  assert.equal(sandbox.workspaceTreeLabel({ id: 'encrypted', name: 'Encrypted Workspace', encrypted: true, locked: false, current: false }), 'Encrypted Workspace');
  assert.equal(sandbox.workspaceTreeLabel({ id: 'locked', name: 'Locked Workspace', encrypted: true, locked: true, current: false }), 'Locked Workspace');
  assert.equal(sandbox.workspaceTreeLabel({ id: 'locked-active', name: 'Locked Active', encrypted: true, locked: true, current: true }), 'Locked Active (Active)');
});

test('workspace panel shows disabled decrypt action for locked encrypted workspaces', () => {
  const lockedWorkspace = { id: 'locked', encrypted: true, locked: true, current: false, path: '/tmp/locked.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(lockedWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').hidden, false);
  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').disabled, true);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').hidden, false);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').disabled, true);
  assert.equal(elements.get('encryptWorkspacePanelButton').hidden, true);
});

test('workspace panel enables decrypt action for unlocked encrypted workspaces', () => {
  const unlockedWorkspace = { id: 'unlocked', encrypted: true, locked: false, current: true, path: '/tmp/unlocked.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(unlockedWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').hidden, false);
  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').disabled, false);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').hidden, false);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').disabled, false);
  assert.equal(elements.get('encryptWorkspacePanelButton').hidden, true);
});

test('workspace panel disables reset key action for the current locked encrypted workspace', () => {
  const lockedCurrentWorkspace = { id: 'locked-current', encrypted: true, locked: true, current: true, path: '/tmp/locked-current.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(lockedCurrentWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').hidden, false);
  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').disabled, true);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').hidden, false);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').disabled, true);
  assert.equal(elements.get('switchWorkspacePanelButton').textContent, 'Unlock Workspace');
});

test('workspace panel disables reset key action for inactive locked encrypted workspaces', () => {
  const lockedWorkspace = { id: 'locked', encrypted: true, locked: true, current: false, path: '/tmp/locked.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(lockedWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').hidden, false);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').disabled, true);
  assert.equal(elements.get('switchWorkspacePanelButton').textContent, 'Switch to this Workspace');
  assert.equal(elements.get('switchWorkspacePanelButton').disabled, false);
});

test('workspace panel disables reset key action for inactive encrypted workspaces', () => {
  const inactiveWorkspace = { id: 'inactive', encrypted: true, locked: false, current: false, path: '/tmp/inactive.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(inactiveWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').hidden, false);
  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').disabled, false);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').hidden, false);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').disabled, true);
});

test('workspace panel hides decrypt action for plaintext workspaces', () => {
  const plaintextWorkspace = { id: 'plain', encrypted: false, locked: false, current: true, path: '/tmp/plain.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(plaintextWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').hidden, true);
  assert.equal(elements.get('resetWorkspaceEncryptionKeyPanelButton').hidden, true);
  assert.equal(elements.get('encryptWorkspacePanelButton').hidden, false);
  assert.equal(elements.get('encryptWorkspacePanelButton').disabled, false);
});

test('workspace sidebar renders runner and performance tree nodes with actions and empty states', () => {
  const { elements, sandbox, state } = loadWorkspaceSidebarTreeController({
    runners: [{ id: 'runner-1', name: 'Smoke Runner' }],
    performanceTests: [{ id: 'perf-1', name: 'Latency Test', type: 'latency' }]
  });

  sandbox.renderRunners();
  sandbox.renderPerformanceTests();

  const runnerNode = elements.get('runnersList').children[0];
  const performanceNode = elements.get('performanceList').children[0];
  assert.equal(runnerNode.className, 'tree-node runner-node');
  assert.equal(runnerNode.children[0].textContent, 'RUN Smoke Runner');
  assert.deepEqual(fromVm(runnerNode.children[0].contextMenuItems.map((item) => item[0])), ['Rename', 'Duplicate', 'Export', 'Delete']);
  runnerNode.children[0].listeners.click[0]();
  assert.deepEqual(fromVm(state.selected), [['runner', 'runner-1']]);

  assert.equal(performanceNode.className, 'tree-node performance-node');
  assert.equal(performanceNode.children[0].textContent, 'PERF Latency Test');
  assert.deepEqual(fromVm(performanceNode.children[0].contextMenuItems.map((item) => item[0])), ['Rename', 'Duplicate', 'Export', 'Delete']);
  performanceNode.children[0].listeners.click[0]();
  assert.deepEqual(fromVm(state.selected.at(-1)), ['performance', 'perf-1']);

  sandbox.workspace.runners = [];
  sandbox.workspace.performanceTests = [];
  elements.get('runnersList').children = [];
  elements.get('performanceList').children = [];
  sandbox.renderRunners();
  sandbox.renderPerformanceTests();
  assert.equal(elements.get('runnersList').children[0].className, 'empty-state runner-empty-sidebar');
  assert.equal(elements.get('performanceList').children[0].className, 'empty-state performance-empty-sidebar');
});

function loadWorkspaceSidebarController(workspaceItem) {
  const elements = createWorkspacePanelElements();
  const sourcePath = path.join(__dirname, '../../src/renderer/features/workspaceSidebarController.js');
  const items = [workspaceItem];
  const sandbox = {
    $: (id) => elements.get(id) || null,
    activeWorkspaceItem: () => workspaceItem,
    document: {
      createElement
    },
    renderDiagnosticsPrivacyPanel() {},
    renderSandboxFileBindingsPanel() {},
    renderSandboxPackageCachePanel() {},
    renderVaultMetadataPanel() {},
    workspace: {},
    workspaceDisplayName: (item) => item?.name || item?.id || 'Workspace',
    workspaceListItems: () => items,
    workspaceSummaryForItem: () => ({
      collections: 0,
      cookies: 0,
      environments: 0,
      folders: 0,
      historyEntries: 0,
      requests: 0,
      runners: 0,
      schemaVersion: 1
    })
  };
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, sandbox };
}

function loadWorkspaceSidebarTreeController(workspace) {
  const elements = new Map([
    ['runnersList', createElement()],
    ['performanceList', createElement()]
  ]);
  const state = { selected: [] };
  const sandbox = {
    $: (id) => elements.get(id) || null,
    activeMainPanel: '',
    activePerformanceTestId: '',
    activeRunnerConfigId: '',
    appendSidebarTreeRow(wrapper, button, payload) {
      wrapper.payload = payload;
      wrapper.append(button);
    },
    appendSidebarTreeRows(parent, rows) {
      parent.append(...rows);
    },
    attachTreeContextMenu(button, items) {
      button.contextMenuItems = items;
    },
    document: { createElement },
    ensureWorkspaceRunners() {
      sandbox.workspace.runners ||= [];
      return sandbox.workspace.runners;
    },
    normalizeWorkspacePerformanceTests: (tests) => tests,
    performanceTestDisplayName: (item) => item?.name || 'Untitled Performance Test',
    RENDERER_PERFORMANCE_TEST_TYPES: ['diagnosis', 'latency', 'throughput', 'concurrency', 'stress', 'spike', 'soak', 'ramp'],
    runnerDisplayName: (item) => item?.name || 'Untitled Runner',
    selectPerformanceTestItem: (id) => state.selected.push(['performance', id]),
    selectRunnerItem: (id) => state.selected.push(['runner', id]),
    treeButton(text, active, kind, options = {}) {
      const button = createElement();
      button.textContent = `${kind} ${text}`;
      button.dataset = { ...options };
      button.className = active ? 'active' : '';
      return button;
    },
    workspace
  };
  for (const name of [
    'deletePerformanceTest',
    'deleteRunner',
    'duplicatePerformanceTest',
    'duplicateRunner',
    'exportActivePerformanceTest',
    'exportRunnerDefinition',
    'renamePerformanceTest',
    'renameRunner'
  ]) {
    sandbox[name] = () => {};
  }
  const sourcePath = path.join(__dirname, '../../src/renderer/features/workspaceSidebarController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, sandbox, state };
}

function createWorkspacePanelElements() {
  return new Map([
    ['workspaceMainTitle', createElement()],
    ['switchWorkspacePanelButton', createElement()],
    ['deleteWorkspacePanelButton', createElement()],
    ['exportWorkspacePanelButton', createElement()],
    ['encryptWorkspacePanelButton', createElement()],
    ['removeWorkspaceEncryptionPanelButton', createElement()],
    ['resetWorkspaceEncryptionKeyPanelButton', createElement()],
    ['workspaceSummary', createElement()]
  ]);
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

function createElement() {
  return {
    attributes: {},
    children: [],
    classList: {
      remove() {}
    },
    dataset: {},
    disabled: false,
    hidden: false,
    tabIndex: 0,
    textContent: '',
    className: '',
    listeners: {},
    append(...children) {
      this.children.push(...children);
    },
    addEventListener(type, listener) {
      this.listeners[type] ||= [];
      this.listeners[type].push(listener);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}
