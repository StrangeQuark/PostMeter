const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyVaultPromptDecisionToWorkspace,
  createVaultPrompt,
  normalizeVaultPromptDecision,
  registerVaultPromptIpc,
  workspaceIdForVaultPromptDecision
} = require('../../electron/vaultPrompt');

test('normalizes and persists metadata-only vault prompt grant decisions', async () => {
  const workspace = {
    settings: {
      sandbox: {
        trustedCapabilities: {
          sendRequest: true,
          cookies: true,
          vault: false,
          vaultGrants: {
            workspace: false,
            collections: [],
            requests: [],
            deniedCollections: [],
            deniedRequests: []
          }
        }
      }
    }
  };

  const requestGrant = applyVaultPromptDecisionToWorkspace(workspace, {
    requestId: 'request-1',
    collectionId: 'collection-1'
  }, {
    granted: true,
    scope: 'request'
  });
  assert.deepEqual(requestGrant.settings.sandbox.trustedCapabilities.vaultGrants.requests, ['request-1']);
  assert.deepEqual(workspace.settings.sandbox.trustedCapabilities.vaultGrants.requests, []);

  const collectionGrant = applyVaultPromptDecisionToWorkspace(workspace, {
    requestId: 'request-1',
    collectionId: 'collection-1'
  }, {
    granted: true,
    scope: 'collection'
  });
  assert.deepEqual(collectionGrant.settings.sandbox.trustedCapabilities.vaultGrants.collections, ['collection-1']);

  const reset = applyVaultPromptDecisionToWorkspace(collectionGrant, {}, {
    granted: false,
    reset: true,
    scope: 'request'
  });
  assert.equal(reset.settings.sandbox.trustedCapabilities.vault, false);
  assert.deepEqual(reset.settings.sandbox.trustedCapabilities.vaultGrants.requests, []);
  assert.deepEqual(reset.settings.sandbox.trustedCapabilities.vaultGrants.collections, []);
});

test('renderer vault prompt IPC resolves bounded decisions without exposing secrets', async () => {
  const handlers = new Map();
  registerVaultPromptIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });
  assert.ok(handlers.has('vault:prompt-response'));

  const sentPayloads = [];
  const webContents = {
    send(_channel, payload) {
      sentPayloads.push(payload);
      queueMicrotask(() => {
        void handlers.get('vault:prompt-response')({ sender: webContents }, payload.promptId, {
          granted: true,
          scope: 'workspace'
        });
      });
    }
  };
  const prompt = createVaultPrompt({
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents
    }),
    persistDecision: async () => {}
  });

  const decision = await prompt({
    collectionName: 'Sensitive Collection',
    key: 'apiToken',
    operation: 'get',
    requestId: 'request-1',
    requestName: 'Sensitive Request',
    collectionId: 'collection-1',
    value: 'must-not-cross',
    workspaceId: 'Workspace.json',
    workspaceName: 'Workspace'
  });
  assert.deepEqual(decision, { granted: true, reset: false, scope: 'workspace' });
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].collectionName, 'Sensitive Collection');
  assert.equal(sentPayloads[0].key, 'apiToken');
  assert.equal(sentPayloads[0].workspaceId, 'Workspace.json');
  assert.equal(sentPayloads[0].workspaceName, 'Workspace');
  assert.equal(Object.hasOwn(sentPayloads[0], 'value'), false);
  assert.equal(Object.hasOwn(sentPayloads[0], 'secretValue'), false);
});

test('vault prompt IPC ignores responses from non-prompting renderers', async () => {
  const handlers = new Map();
  registerVaultPromptIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });

  const sentPayloads = [];
  let resolved = false;
  const webContents = {
    send(_channel, payload) {
      sentPayloads.push(payload);
    }
  };
  const prompt = createVaultPrompt({
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents
    }),
    persistDecision: async () => {}
  });

  const promptPromise = prompt({
    key: 'apiToken',
    operation: 'get',
    requestId: 'request-1'
  }).then((decision) => {
    resolved = true;
    return decision;
  });

  assert.equal(sentPayloads.length, 1);
  assert.deepEqual(
    await handlers.get('vault:prompt-response')({ sender: { id: 'other-renderer' } }, sentPayloads[0].promptId, {
      granted: true,
      scope: 'workspace'
    }),
    { ok: false }
  );
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.deepEqual(
    await handlers.get('vault:prompt-response')({ sender: webContents }, sentPayloads[0].promptId, {
      granted: true,
      scope: 'request'
    }),
    { ok: true }
  );
  assert.deepEqual(await promptPromise, { granted: true, reset: false, scope: 'request' });
});

test('vault prompt decisions default to request-scoped denial', () => {
  assert.deepEqual(normalizeVaultPromptDecision({ granted: true, scope: 'invalid' }), {
    granted: true,
    reset: false,
    scope: 'request'
  });
  assert.deepEqual(normalizeVaultPromptDecision({}), {
    granted: false,
    reset: false,
    scope: 'request'
  });
});

test('native vault prompt fallback offers reset decisions and persists them', async () => {
  let persistedDecision = null;
  const dialogCalls = [];
  const prompt = createVaultPrompt({
    dialog: {
      showMessageBox: async (_window, options) => {
        dialogCalls.push(options);
        return { response: 4 };
      }
    },
    getMainWindow: () => null,
    persistDecision: async (decision) => {
      persistedDecision = decision;
    }
  });

  const decision = await prompt({
    collectionName: 'Collection',
    key: 'apiToken',
    operation: 'get',
    requestName: 'Request',
    workspaceName: 'Workspace'
  });

  assert.deepEqual(decision, { granted: false, reset: true, scope: 'request' });
  assert.deepEqual(persistedDecision, decision);
  assert.deepEqual(dialogCalls[0].buttons, ['Deny once', 'Allow request', 'Allow collection', 'Allow workspace', 'Reset grants']);
});

test('vault prompt persistence uses the prompted workspace id over the active workspace fallback', () => {
  assert.equal(
    workspaceIdForVaultPromptDecision({ workspaceId: 'Prompted Workspace.json' }, 'Current Workspace.json'),
    'Prompted Workspace.json'
  );
  assert.equal(
    workspaceIdForVaultPromptDecision({}, 'Current Workspace.json'),
    'Current Workspace.json'
  );
});
