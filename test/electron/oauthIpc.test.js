const assert = require('node:assert/strict');
const test = require('node:test');
const { registerOAuthIpc } = require('../../electron/ipc/oauthIpc');
const { defaultDiagnosticsSettings, sanitizeDiagnosticEvent } = require('../../src/core/diagnostics-release/diagnostics');

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

test('OAuth IPC emits structured diagnostic events for start outcomes', async () => {
  const handlers = new Map();
  const events = [];
  registerOAuthIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    oauthFlows: {
      cancelFlow: () => false,
      startDevice: async () => {
        throw new Error('device_code=device-secret');
      },
      startPkce: async () => ({ cancelled: false })
    },
    recordDiagnosticEvent: async (event) => {
      events.push(event);
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
  await assert.rejects(
    () => handlers.get('oauth:device:start')(null, 'flow-2', { ...auth, grantType: 'deviceCode' }, environment),
    /device_code/
  );

  assert.deepEqual(events.map((event) => event.type), ['oauth.pkce.completed', 'oauth.device.failed']);
  assert.equal(events[0].fields.redirectStrategy, 'customScheme');
  assert.equal(events[1].failureCode, 'oauth_device_failed');
});

test('OAuth IPC emits sanitized diagnostic events for PKCE failures and device success', async () => {
  const handlers = new Map();
  const events = [];
  registerOAuthIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    oauthFlows: {
      cancelFlow: () => false,
      startDevice: async () => ({ cancelled: false }),
      startPkce: async () => {
        throw new Error('pkce failed password=plain-secret next=ok /data/oauth-cache.json access_token=pkce-token code_verifier=verifier-token https://auth.example.test/token?client_secret=url-secret');
      }
    },
    recordDiagnosticEvent: async (event) => {
      events.push(sanitizeDiagnosticEvent(event, defaultDiagnosticsSettings()));
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
  await assert.rejects(
    () => handlers.get('oauth:pkce:start')(null, 'flow-1', auth, environment, 'loopback'),
    /pkce failed/
  );
  await handlers.get('oauth:device:start')(null, 'flow-2', { ...auth, grantType: 'deviceCode' }, environment);

  assert.deepEqual(events.map((event) => event.type), ['oauth.pkce.failed', 'oauth.device.completed']);
  assert.equal(events[0].failureCode, 'oauth_pkce_failed');
  assert.equal(events[1].outcome, 'completed');
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /plain-secret|pkce-token|verifier-token|url-secret|\/data\/oauth-cache|auth\.example\.test/);
  assert.match(serialized, /\[path\]/);
  assert.match(serialized, /\[url\]/);
  assert.match(serialized, /\[redacted/);
});
