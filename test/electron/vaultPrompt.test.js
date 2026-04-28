const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyVaultPromptDecisionToWorkspace,
  createVaultPrompt,
  normalizeVaultPromptDecision,
  registerVaultPromptIpc
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
  const prompt = createVaultPrompt({
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: {
        send(_channel, payload) {
          sentPayloads.push(payload);
          queueMicrotask(() => {
            void handlers.get('vault:prompt-response')({}, payload.promptId, {
              granted: true,
              scope: 'workspace'
            });
          });
        }
      }
    }),
    persistDecision: async () => {}
  });

  const decision = await prompt({
    key: 'apiToken',
    operation: 'get',
    requestId: 'request-1',
    requestName: 'Sensitive Request',
    collectionId: 'collection-1',
    value: 'must-not-cross'
  });
  assert.deepEqual(decision, { granted: true, reset: false, scope: 'workspace' });
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].key, 'apiToken');
  assert.equal(Object.hasOwn(sentPayloads[0], 'value'), false);
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
