const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createWorkspaceKeyPrompt,
  registerWorkspaceKeyPromptIpc
} = require('../../electron/ipc/workspaceKeyPrompt');

test('workspace key prompt bounds renderer payloads and accepts only the prompting sender', async () => {
  const handlers = new Map();
  registerWorkspaceKeyPromptIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });
  const sent = [];
  const promptingSender = {
    send(channel, payload) {
      sent.push({ channel, payload });
    }
  };
  const promptForWorkspaceKey = createWorkspaceKeyPrompt({
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: promptingSender
    })
  });

  const promptPromise = promptForWorkspaceKey({
    reason: 'x'.repeat(100),
    workspaceId: 'workspace-id',
    workspaceName: 'n'.repeat(300)
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channel, 'workspace:key-prompt');
  assert.equal(sent[0].payload.reason.length, 64);
  assert.equal(sent[0].payload.workspaceName.length, 256);
  assert.match(sent[0].payload.promptId, /^[0-9a-f]{24}$/);

  assert.deepEqual(
    await handlers.get('workspace:key-prompt-response')({ sender: { id: 'spoof' } }, sent[0].payload.promptId, 'correct horse battery staple'),
    { ok: false }
  );
  assert.deepEqual(
    await handlers.get('workspace:key-prompt-response')({ sender: promptingSender }, sent[0].payload.promptId, 'correct horse battery staple'),
    { ok: true }
  );
  assert.equal(await promptPromise, 'correct horse battery staple');
});

test('workspace key prompt rejects short keys, unknown responses, send failures, and missing windows', async () => {
  const handlers = new Map();
  registerWorkspaceKeyPromptIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });
  assert.deepEqual(
    await handlers.get('workspace:key-prompt-response')({ sender: {} }, 'unknown-prompt', 'secret-key'),
    { ok: false }
  );

  const sent = [];
  const sender = {
    send(_channel, payload) {
      sent.push(payload);
    }
  };
  const shortKeyPrompt = createWorkspaceKeyPrompt({
    getMainWindow: () => ({ isDestroyed: () => false, webContents: sender })
  });
  const shortKeyPromise = shortKeyPrompt({ workspaceId: 'workspace-id' });
  await handlers.get('workspace:key-prompt-response')({ sender }, sent[0].promptId, 'short');
  await assert.rejects(shortKeyPromise, /must be at least 6 characters/);

  const sendFailurePrompt = createWorkspaceKeyPrompt({
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: {
        send() {
          throw new Error('send failed');
        }
      }
    })
  });
  await assert.rejects(sendFailurePrompt({ workspaceId: 'workspace-id' }), /must be at least 6 characters/);

  await assert.rejects(
    createWorkspaceKeyPrompt({ getMainWindow: () => null })({ workspaceId: 'workspace-id' }),
    /no application window is available/
  );
});
