const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('workspace encryption modal rejects short keys, reused keys, and mismatched confirmation before resolving', async () => {
  const { elements, sandbox, state } = loadImportExportWorkspaceController();
  const prompt = sandbox.promptWorkspaceEncryptionKey({
    requireNewKey: true,
    requireConfirmation: true
  });
  await Promise.resolve();

  elements.get('workspaceEncryptionKeyInput').value = 'short';
  sandbox.confirmWorkspaceEncryptionModal();
  assert.equal(elements.get('workspaceEncryptionError').hidden, false);
  assert.match(elements.get('workspaceEncryptionError').textContent, /at least 6/);

  elements.get('workspaceEncryptionKeyInput').value = 'current-key';
  elements.get('workspaceEncryptionNewKeyInput').value = 'current-key';
  sandbox.confirmWorkspaceEncryptionModal();
  assert.match(elements.get('workspaceEncryptionError').textContent, /different/);

  elements.get('workspaceEncryptionNewKeyInput').value = 'rotated-key';
  elements.get('workspaceEncryptionConfirmInput').value = 'not-rotated';
  sandbox.confirmWorkspaceEncryptionModal();
  assert.match(elements.get('workspaceEncryptionError').textContent, /does not match/);

  elements.get('workspaceEncryptionConfirmInput').value = 'rotated-key';
  sandbox.confirmWorkspaceEncryptionModal();
  assert.deepEqual(fromVm(await prompt), { currentKey: 'current-key', newKey: 'rotated-key' });
  assert.equal(elements.get('workspaceEncryptionKeyInput').value, '');
  assert.equal(state.modalResults.length, 1);
});

test('picker-first export cancels prepared payloads when the user cancels path selection', async () => {
  const { sandbox, state } = loadImportExportWorkspaceController({
    fileExport: {
      choosePath: async () => ({ cancelled: true }),
      prepare: async () => {
        throw new Error('prepare should be skipped after cancel');
      },
      writePrepared: async () => {
        throw new Error('write should be skipped after cancel');
      },
      cancelPrepared: async (exportId) => {
        state.cancelledExports.push(exportId);
        return true;
      }
    }
  });

  const result = await sandbox.runPickerFirstExport({
    kind: 'request',
    name: 'Smoke',
    payloadFactory: () => ({ id: 'request-1' })
  });

  assert.deepEqual(fromVm(result), { cancelled: true });
  assert.deepEqual(state.cancelledExports, ['export-id-1']);
  assert.deepEqual(state.statuses, []);
});

test('picker-first export reports preparation failures and never writes stale prepared data', async () => {
  const { sandbox, state } = loadImportExportWorkspaceController({
    fileExport: {
      choosePath: async () => ({ capabilityToken: 'export-token' }),
      prepare: async () => {
        throw new Error('payload too large');
      },
      writePrepared: async () => {
        throw new Error('write should not run after prepare failure');
      },
      cancelPrepared: async (exportId) => {
        state.cancelledExports.push(exportId);
        return true;
      }
    }
  });

  const result = await sandbox.runPickerFirstExport({
    failureStatusPrefix: 'Request export failed',
    failureTitle: 'Request Export Failed',
    kind: 'request',
    name: 'Smoke',
    payloadFactory: () => ({ id: 'request-1' })
  });

  assert.equal(result, null);
  assert.deepEqual(state.cancelledExports, ['export-id-1']);
  assert.equal(state.statuses.at(-1), 'Request export failed: payload too large');
  assert.deepEqual(state.notifications.at(-1), ['Request Export Failed', 'payload too large']);
});

test('startup update reminders launch release pages and surface failures without blocking startup', async () => {
  const { sandbox, state } = loadImportExportWorkspaceController({
    appApi: {
      checkForUpdates: async () => ({
        updateAvailable: true,
        currentVersion: '0.2.0',
        latestVersion: '1.0.0',
        releaseUrl: 'https://example.test/releases/1.0.0'
      }),
      openExternal: async (url) => {
        state.openedUrls.push(url);
        return true;
      }
    }
  });

  const result = await sandbox.checkForStartupUpdateReminder();
  assert.equal(result.updateAvailable, true);
  assert.equal(state.statuses.at(-1), 'PostMeter 1.0.0 is available.');
  assert.equal(elementsText(state, 'updateReminderModalTitle'), 'PostMeter 1.0.0 is available');
  assert.deepEqual(state.openedUrls, ['https://example.test/releases/1.0.0']);

  sandbox.window.postmeter.app.checkForUpdates = async () => {
    throw new Error('network unavailable');
  };
  assert.equal(await sandbox.checkForStartupUpdateReminder(), null);
  assert.equal(state.statuses.at(-1), 'Startup update check failed: network unavailable');
});

function loadImportExportWorkspaceController(options = {}) {
  const elements = createEncryptionElements();
  const state = {
    cancelledExports: [],
    elements,
    modalResults: [],
    notifications: [],
    openedUrls: [],
    statuses: []
  };
  let activeModalResolve = null;
  const sandbox = {
    $: (id) => elements.get(id) || null,
    activeWorkspaceLocked: () => false,
    crypto: { randomUUID: () => 'export-id-1' },
    console,
    ensureSettings() {},
    notifyUser: (title, message) => state.notifications.push([title, message]),
    rendererWorkflows: {},
    requireUnlockedWorkspace: () => true,
    resolveActiveModal: (value) => {
      state.modalResults.push(value);
      activeModalResolve?.(value);
    },
    setStatus: (message) => {
      state.statuses.push(message);
      return null;
    },
    setTimeout,
    showModal: async (modalId) => {
      if (modalId === 'updateReminderModal') {
        return 'update';
      }
      return new Promise((resolve) => {
        activeModalResolve = resolve;
      });
    },
    window: {
      postmeter: {
        app: options.appApi || {},
        fileExport: options.fileExport || null,
        workspace: {}
      }
    },
    workspace: {
      settings: {
        updates: {
          automaticUpdatesEnabled: false,
          includePrereleases: false,
          startupRemindersEnabled: true
        }
      }
    }
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/features/importExportWorkspaceController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, sandbox, state };
}

function createEncryptionElements() {
  return new Map([
    ['workspaceEncryptionTitle', new FakeElement()],
    ['workspaceEncryptionMessage', new FakeElement()],
    ['workspaceEncryptionWarning', new FakeElement()],
    ['workspaceEncryptionKeyLabel', new FakeElement()],
    ['workspaceEncryptionNewKeyLabel', new FakeElement()],
    ['workspaceEncryptionConfirmLabel', new FakeElement()],
    ['workspaceEncryptionKeyInput', new FakeElement()],
    ['workspaceEncryptionNewKeyInput', new FakeElement()],
    ['workspaceEncryptionConfirmInput', new FakeElement()],
    ['workspaceEncryptionNewKeyField', new FakeElement()],
    ['workspaceEncryptionConfirmField', new FakeElement()],
    ['workspaceEncryptionError', new FakeElement()],
    ['confirmWorkspaceEncryptionButton', new FakeElement()],
    ['updateReminderModalTitle', new FakeElement()],
    ['updateReminderModalMessage', new FakeElement()]
  ]);
}

function elementsText(state, id) {
  return state.elements.get(id).textContent;
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeElement {
  constructor() {
    this.hidden = false;
    this.textContent = '';
    this.value = '';
  }
}
