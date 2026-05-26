const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createRequestNetworkPolicyForWorkspace,
  markWorkspaceImportedUntrusted
} = require('../../electron/security/requestNetworkPolicy');

test('imported workspaces get private-network safe mode without changing trusted local workspaces', async () => {
  assert.equal(createRequestNetworkPolicyForWorkspace({ workspace: {} }).enabled, false);
  const workspace = markWorkspaceImportedUntrusted({});
  const prompts = [];
  const policy = createRequestNetworkPolicyForWorkspace({
    workspace,
    dialog: {
      async showMessageBox(_window, options) {
        prompts.push(options);
        return { response: 0 };
      }
    }
  });
  assert.equal(policy.enabled, true);
  assert.equal(policy.allowPrivateNetworkRequests, false);
  assert.equal(await policy.confirmPrivateNetworkRequest({ hostname: '127.0.0.1', category: 'loopback', reason: 'loopback-ipv4' }), true);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].detail, /127\.0\.0\.1/);
});

test('renderer cannot forge private-network acknowledgement through policy payload', async () => {
  const workspace = {
    localsettings: {
      security: {
        importedUntrusted: true,
        allowPrivateNetworkRequests: true,
        rendererAcknowledgedPrivateNetwork: true
      }
    }
  };
  const policy = createRequestNetworkPolicyForWorkspace({ workspace });
  assert.equal(policy.enabled, true);
  assert.equal(policy.allowPrivateNetworkRequests, false);
  assert.equal(await policy.confirmPrivateNetworkRequest({ hostname: '10.0.0.1', category: 'private' }), false);
});
