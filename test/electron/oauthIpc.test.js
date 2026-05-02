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

test('OAuth IPC validates and forwards start payloads', async () => {
  const calls = [];
  const handlers = new Map();
  registerOAuthIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    oauthFlows: {
      cancelFlow: () => false,
      startDevice: async (id, auth, environment) => {
        calls.push({ type: 'device', id, auth, environment });
        return { cancelled: false, auth };
      },
      startPkce: async (id, auth, environment, strategy) => {
        calls.push({ type: 'pkce', id, auth, environment, strategy });
        return { cancelled: false, auth };
      }
    }
  });

  const auth = {
    type: 'oauth2',
    grantType: 'authorizationCode',
    authorizationUrl: 'https://auth.example.test/authorize',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id'
  };
  const environment = { id: 'env', name: 'Env', variables: [] };
  await handlers.get('oauth:pkce:start')(null, 'flow-1', auth, environment, 'customScheme');
  await handlers.get('oauth:device:start')(null, 'flow-2', { ...auth, grantType: 'deviceCode' }, environment);

  assert.deepEqual(calls.map((call) => call.type), ['pkce', 'device']);
  assert.equal(calls[0].id, 'flow-1');
  assert.equal(calls[0].strategy, 'customScheme');
  assert.equal(calls[1].id, 'flow-2');
  await assert.rejects(
    () => handlers.get('oauth:pkce:start')(null, 42, auth, environment, 'loopback'),
    /id must be a string/
  );
  await assert.rejects(
    () => handlers.get('oauth:device:start')(null, 'flow-3', { type: 'oauth2', grantType: 'password' }, environment),
    /auth.grantType must be one of/
  );
});
