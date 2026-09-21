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
        allowedPrivateNetworkHosts: ['10.0.0.1'],
        rendererAcknowledgedPrivateNetwork: true
      }
    }
  };
  const policy = createRequestNetworkPolicyForWorkspace({ workspace });
  assert.equal(policy.enabled, true);
  assert.equal(policy.allowPrivateNetworkRequests, false);
  assert.equal(await policy.confirmPrivateNetworkRequest({ hostname: '10.0.0.1', category: 'private' }), false);
});

test('imported components enable private-network safe mode inside a trusted workspace', () => {
  const policy = createRequestNetworkPolicyForWorkspace({
    workspace: {},
    artifacts: [{ security: { importedUntrusted: true } }]
  });
  assert.equal(policy.enabled, true);
  assert.equal(policy.allowPrivateNetworkRequests, false);
});

test('permanent permission survives a workspace reload and is scoped to the approved host', async (t) => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { WorkspaceStore } = require('../../src/core/workspace/workspaceStore');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-network-permission-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const workspacePath = path.join(directory, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);
  let workspace = await store.save(markWorkspaceImportedUntrusted({}));
  const policy = createRequestNetworkPolicyForWorkspace({
    workspace,
    workspaceId: 'workspace-1',
    getWorkspaceId: () => 'workspace-1',
    mutateWorkspace: async (mutator, options) => {
      assert.equal(options.workspaceId, 'workspace-1');
      workspace = await store.save(mutator(structuredClone(workspace)));
      return workspace;
    },
    dialog: { showMessageBox: async (_window, options) => {
      assert.deepEqual(options.buttons, ['Allow Once', 'Allow Permanently', 'Cancel']);
      assert.equal(options.defaultId, 2);
      assert.equal(options.cancelId, 2);
      return { response: 1 };
    } }
  });
  assert.equal(await policy.confirmPrivateNetworkRequest({ hostname: 'LOCALHOST.' }), true);
  assert.equal(await policy.confirmPrivateNetworkRequest({ hostname: 'localhost' }), true);
  const loaded = await new WorkspaceStore(workspacePath).load();
  assert.deepEqual(loaded.workspace.localsettings.security.allowedPrivateNetworkHosts, ['localhost']);
  assert.equal(loaded.workspace.localsettings.security.allowPrivateNetworkRequests, false);
  const reloadedPolicy = createRequestNetworkPolicyForWorkspace({ workspace: loaded.workspace });
  assert.equal(await reloadedPolicy.confirmPrivateNetworkRequest({ hostname: 'localhost' }), true);
  assert.equal(await reloadedPolicy.confirmPrivateNetworkRequest({ hostname: '10.0.0.1' }), false);
  const otherWorkspacePolicy = createRequestNetworkPolicyForWorkspace({ workspace: markWorkspaceImportedUntrusted({}) });
  assert.equal(await otherWorkspacePolicy.confirmPrivateNetworkRequest({ hostname: 'localhost' }), false);
  const importedPolicy = createRequestNetworkPolicyForWorkspace({ workspace: markWorkspaceImportedUntrusted(loaded.workspace) });
  assert.equal(await importedPolicy.confirmPrivateNetworkRequest({ hostname: 'localhost' }), false);
});

test('Allow Once and Cancel do not remember permission', async () => {
  for (const response of [0, 2, undefined]) {
    let prompts = 0;
    const policy = createRequestNetworkPolicyForWorkspace({
      workspace: markWorkspaceImportedUntrusted({}),
      mutateWorkspace: () => assert.fail('one-time choices must not save permissions'),
      dialog: { showMessageBox: async () => { prompts += 1; return { response }; } }
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal(await policy.confirmPrivateNetworkRequest({ hostname: 'localhost' }), response === 0);
    }
    assert.equal(prompts, 2);
  }
});

test('permanent permission is not applied after a workspace switch or failed save', async () => {
  const workspace = markWorkspaceImportedUntrusted({});
  let currentWorkspaceId = 'workspace-1';
  const policy = createRequestNetworkPolicyForWorkspace({
    workspace,
    workspaceId: 'workspace-1',
    getWorkspaceId: () => currentWorkspaceId,
    mutateWorkspace: async (mutator) => {
      const next = mutator(structuredClone(workspace));
      if (next) throw new Error('Save failed');
    },
    dialog: { showMessageBox: async () => ({ response: 1 }) }
  });
  await assert.rejects(policy.confirmPrivateNetworkRequest({ hostname: 'localhost' }), /Save failed/);
  currentWorkspaceId = 'workspace-2';
  assert.equal(await policy.confirmPrivateNetworkRequest({ hostname: 'localhost' }), false);
  assert.deepEqual(workspace.localsettings.security.allowedPrivateNetworkHosts, []);
});
