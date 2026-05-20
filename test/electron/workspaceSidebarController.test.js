const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('workspace panel shows disabled decrypt action for locked encrypted workspaces', () => {
  const lockedWorkspace = { id: 'locked', encrypted: true, locked: true, current: false, path: '/tmp/locked.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(lockedWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').hidden, false);
  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').disabled, true);
  assert.equal(elements.get('encryptWorkspacePanelButton').hidden, true);
});

test('workspace panel enables decrypt action for unlocked encrypted workspaces', () => {
  const unlockedWorkspace = { id: 'unlocked', encrypted: true, locked: false, current: true, path: '/tmp/unlocked.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(unlockedWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').hidden, false);
  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').disabled, false);
  assert.equal(elements.get('encryptWorkspacePanelButton').hidden, true);
});

test('workspace panel hides decrypt action for plaintext workspaces', () => {
  const plaintextWorkspace = { id: 'plain', encrypted: false, locked: false, current: true, path: '/tmp/plain.json' };
  const { elements, sandbox } = loadWorkspaceSidebarController(plaintextWorkspace);

  sandbox.renderWorkspacePanel();

  assert.equal(elements.get('removeWorkspaceEncryptionPanelButton').hidden, true);
  assert.equal(elements.get('encryptWorkspacePanelButton').hidden, false);
  assert.equal(elements.get('encryptWorkspacePanelButton').disabled, false);
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

function createWorkspacePanelElements() {
  return new Map([
    ['workspaceMainTitle', createElement()],
    ['switchWorkspacePanelButton', createElement()],
    ['deleteWorkspacePanelButton', createElement()],
    ['exportWorkspacePanelButton', createElement()],
    ['encryptWorkspacePanelButton', createElement()],
    ['removeWorkspaceEncryptionPanelButton', createElement()],
    ['workspaceSummary', createElement()]
  ]);
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
    append(...children) {
      this.children.push(...children);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}
