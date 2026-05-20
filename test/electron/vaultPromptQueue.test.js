const assert = require('node:assert/strict');
const test = require('node:test');
const { createVaultPromptQueue } = require('../../src/renderer/ui/vaultPromptQueue');

test('renderer vault prompt queue serializes concurrent prompt requests', async () => {
  const started = [];
  const resolvers = [];
  const queue = createVaultPromptQueue({
    onPrompt: (payload) => new Promise((resolve) => {
      started.push(payload.promptId);
      resolvers.push(resolve);
    })
  });

  const first = queue.enqueue({ promptId: 'prompt-1' });
  const second = queue.enqueue({ promptId: 'prompt-2' });

  await waitForQueueTurn();
  assert.deepEqual(started, ['prompt-1']);

  resolvers.shift()({ granted: true, scope: 'request' });
  assert.deepEqual(await first, { granted: true, scope: 'request' });
  await waitForQueueTurn();
  assert.deepEqual(started, ['prompt-1', 'prompt-2']);

  resolvers.shift()({ granted: false, scope: 'request' });
  assert.deepEqual(await second, { granted: false, scope: 'request' });
});

test('renderer vault prompt queue continues after a prompt failure', async () => {
  const started = [];
  const queue = createVaultPromptQueue({
    async onPrompt(payload) {
      started.push(payload.promptId);
      if (payload.promptId === 'prompt-1') {
        throw new Error('closed');
      }
      return { granted: true, scope: 'workspace' };
    }
  });

  await assert.rejects(() => queue.enqueue({ promptId: 'prompt-1' }), /closed/);
  assert.deepEqual(await queue.enqueue({ promptId: 'prompt-2' }), { granted: true, scope: 'workspace' });
  assert.deepEqual(started, ['prompt-1', 'prompt-2']);
});

function waitForQueueTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}
