const assert = require('node:assert/strict');
const test = require('node:test');
const { registerOAuthIpc } = require('../../electron/oauthIpc');

test('OAuth IPC registers stable OAuth channels', () => {
  const handlers = new Map();
  registerOAuthIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    oauthFlows: {
      cancelFlow: () => false,
      startDevice: async () => ({ cancelled: true }),
      startPkce: async () => ({ cancelled: true })
    }
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    'oauth:cancel',
    'oauth:device:cancel',
    'oauth:device:start',
    'oauth:pkce:start'
  ]);
  assert.equal(handlers.get('oauth:cancel')(null, 'oauth-id'), false);
});
