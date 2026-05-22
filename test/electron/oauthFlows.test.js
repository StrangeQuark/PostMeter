const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  createOAuthFlowController,
  findOAuthCallbackArg,
  OAUTH_CUSTOM_SCHEME,
  safeOAuthExternalUrl
} = require('../../electron/services/oauthFlows');

test('finds custom OAuth callback arguments conservatively', () => {
  assert.equal(findOAuthCallbackArg(['--flag', `${OAUTH_CUSTOM_SCHEME}://oauth/callback?state=abc`]), 'postmeter://oauth/callback?state=abc');
  assert.equal(findOAuthCallbackArg([`${OAUTH_CUSTOM_SCHEME}://evil/callback?state=abc`]), '');
  assert.equal(findOAuthCallbackArg([`${OAUTH_CUSTOM_SCHEME}://oauth/not-callback?state=abc`]), '');
  assert.equal(findOAuthCallbackArg(['https://example.test/callback', 42, null]), '');
  assert.equal(findOAuthCallbackArg(), '');
});

test('OAuth external browser launches reject non-web URLs at the shell boundary', () => {
  assert.equal(safeOAuthExternalUrl('https://auth.example.test/authorize').protocol, 'https:');
  assert.equal(safeOAuthExternalUrl('http://127.0.0.1:12345/oauth/callback').protocol, 'http:');
  assert.equal(safeOAuthExternalUrl('http://localhost:12345/oauth/callback').protocol, 'http:');
  assert.equal(safeOAuthExternalUrl('http://[::1]:12345/oauth/callback').protocol, 'http:');
  assert.throws(() => safeOAuthExternalUrl('http://auth.example.test/authorize'), /must use https unless it targets a loopback address/);
  assert.throws(() => safeOAuthExternalUrl('http://192.0.2.10/authorize'), /must use https unless it targets a loopback address/);
  assert.throws(() => safeOAuthExternalUrl('javascript:alert(1)'), /must use http or https/);
  assert.throws(() => safeOAuthExternalUrl('file:///tmp/postmeter.html'), /must use http or https/);
  assert.throws(() => safeOAuthExternalUrl('https://token@auth.example.test/authorize'), /must not include credentials/);
  assert.throws(() => safeOAuthExternalUrl('not a url'), /invalid/);
});

test('OAuth flow controller ignores inactive callbacks and missing cancellations', () => {
  const progress = [];
  const controller = createOAuthFlowController({
    app: { setAsDefaultProtocolClient: () => true },
    shell: { openExternal: () => true },
    emitProgress: (id, payload) => progress.push({ id, ...payload })
  });

  assert.equal(controller.cancelFlow('missing'), false);
  assert.equal(controller.handleCallbackUrl('not a url'), false);
  assert.equal(controller.handleCallbackUrl('https://example.test/callback?state=abc'), false);
  assert.equal(controller.handleCallbackUrl(`${OAUTH_CUSTOM_SCHEME}://evil/callback?state=abc`), false);
  assert.equal(controller.handleCallbackUrl(`${OAUTH_CUSTOM_SCHEME}://oauth/not-callback?state=abc`), false);
  assert.equal(controller.handleCallbackUrl(`${OAUTH_CUSTOM_SCHEME}://oauth/callback`), false);
  assert.deepEqual(progress, []);
});

test('loopback PKCE ignores wrong-state callbacks and completes the later valid callback', async () => {
  const tokenRequests = [];
  const tokenServer = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequests.push(await readRequestBody(request));
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'flow-token',
        refresh_token: 'flow-refresh',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const progress = [];
  const controller = createOAuthFlowController({
    app: { setAsDefaultProtocolClient: () => true },
    env: {},
    shell: {
      openExternal: async (url) => {
        const authorizationUrl = new URL(url);
        const redirectUri = authorizationUrl.searchParams.get('redirect_uri');
        const state = authorizationUrl.searchParams.get('state');
        const wrong = await fetch(`${redirectUri}?code=wrong-code&state=wrong-state`);
        assert.equal(wrong.status, 400);
        const correct = await fetch(`${redirectUri}?code=auth-code&state=${state}`);
        assert.equal(correct.status, 200);
        assert.match(await correct.text(), /final result/);
        return true;
      }
    },
    emitProgress: (id, payload) => progress.push({ id, ...payload })
  });

  try {
    const result = await controller.startPkce('flow-1', {
      type: 'oauth2',
      grantType: 'authorizationCode',
      authorizationUrl: 'https://auth.example.test/authorize',
      tokenUrl: `${tokenServer.baseUrl}/token`,
      clientId: 'client-id'
    }, null, 'loopback');

    assert.equal(result.cancelled, false);
    assert.equal(result.auth.accessToken, 'flow-token');
    assert.equal(tokenRequests.length, 1);
    assert.equal(progress.some((entry) => entry.status === 'completed'), true);
  } finally {
    await tokenServer.close();
  }
});

test('loopback PKCE preserves configured localhost callback host', async () => {
  const tokenRequests = [];
  const tokenServer = await createServer(async (request, response) => {
    if (request.url === '/token') {
      tokenRequests.push(await readRequestBody(request));
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'localhost-flow-token',
        token_type: 'Bearer',
        expires_in: 600
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const controller = createOAuthFlowController({
    app: { setAsDefaultProtocolClient: () => true },
    env: {},
    shell: {
      openExternal: async (url) => {
        const authorizationUrl = new URL(url);
        const redirectUri = authorizationUrl.searchParams.get('redirect_uri');
        const redirectUrl = new URL(redirectUri);
        assert.equal(redirectUrl.protocol, 'http:');
        assert.equal(redirectUrl.hostname, 'localhost');
        assert.equal(redirectUrl.pathname, '/oauth/callback');
        const state = authorizationUrl.searchParams.get('state');
        const callback = await fetch(`${redirectUri}?code=auth-code&state=${state}`);
        assert.equal(callback.status, 200);
        return true;
      }
    }
  });

  try {
    const result = await controller.startPkce('localhost-flow', {
      type: 'oauth2',
      grantType: 'authorizationCodePkce',
      authorizationUrl: 'https://auth.example.test/authorize',
      tokenUrl: `${tokenServer.baseUrl}/token`,
      redirectUri: 'http://localhost/oauth/callback',
      clientId: 'client-id'
    }, null, 'loopback');

    assert.equal(result.cancelled, false);
    assert.equal(result.auth.accessToken, 'localhost-flow-token');
    assert.equal(tokenRequests.length, 1);
    const tokenBody = new URLSearchParams(tokenRequests[0]);
    assert.equal(new URL(tokenBody.get('redirect_uri')).hostname, 'localhost');
  } finally {
    await tokenServer.close();
  }
});

test('OAuth flow controller rejects duplicate active flow ids and preserves cancellation ownership', async () => {
  const progress = [];
  const controller = createOAuthFlowController({
    app: { setAsDefaultProtocolClient: () => true },
    env: { POSTMETER_TEST_OAUTH_SKIP_EXTERNAL: '1' },
    shell: { openExternal: async () => true },
    emitProgress: (id, payload) => progress.push({ id, ...payload })
  });
  const auth = {
    type: 'oauth2',
    grantType: 'authorizationCode',
    authorizationUrl: 'https://auth.example.test/authorize',
    tokenUrl: 'https://auth.example.test/token',
    clientId: 'client-id'
  };
  const first = controller.startPkce('same-flow', auth, null, 'loopback');
  await waitFor(() => progress.some((entry) => entry.id === 'same-flow' && entry.status === 'waitingForAuthorization'));

  await assert.rejects(() => controller.startPkce('same-flow', auth, null, 'loopback'), /already active/);
  assert.equal(controller.cancelFlow('same-flow'), true);
  const result = await first;
  assert.equal(result.cancelled, true);
});

test('OAuth flow controller redacts failed provider progress messages', async () => {
  const providerError = [
    'provider failed at https://user:password@example.test/callback?access_token=url-token&visible=1',
    'provider failed at file:///Users/Alice/oauth.json?token=file-token',
    'provider failed at C:\\Users\\Alice\\oauth.json Digest realm="private-realm", nonce="secret-nonce", response="secret-response"',
    'provider failed with -----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----',
    'provider returned Cookie: sid=first-cookie-secret; csrftoken=second-cookie-secret',
    'provider returned Set-Cookie: sid=first-set-cookie-secret; Path=/; HttpOnly; csrfToken=second-set-cookie-secret',
    'Basic authentication failed. Bearer authentication is required.'
  ].join(' ');
  const server = await createServer(async (request, response) => {
    if (request.url === '/device') {
      response.statusCode = 400;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        error: 'invalid_request',
        error_description: providerError
      }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const progress = [];
  const controller = createOAuthFlowController({
    app: { setAsDefaultProtocolClient: () => true },
    env: {},
    shell: { openExternal: async () => true },
    emitProgress: (id, payload) => progress.push({ id, ...payload })
  });

  try {
    await assert.rejects(() => controller.startDevice('redacted-device-flow', {
      type: 'oauth2',
      grantType: 'deviceCode',
      deviceAuthorizationUrl: `${server.baseUrl}/device`,
      tokenUrl: `${server.baseUrl}/token`,
      clientId: 'client-id'
    }, null), /provider failed/);

    const failed = progress.find((entry) => entry.id === 'redacted-device-flow' && entry.status === 'failed');
    assert.ok(failed, 'failed OAuth progress should be emitted');
    assert.doesNotMatch(failed.message, /user:password|example\.test|url-token|file-token|file:\/\/\/Users\/Alice|C:\\Users\\Alice|private-realm|secret-nonce|secret-response|private-key-secret|first-cookie-secret|second-cookie-secret|first-set-cookie-secret|second-set-cookie-secret/);
    assert.match(failed.message, /\[url\]/);
    assert.match(failed.message, /\[redacted\]/);
    assert.match(failed.message, /Basic authentication failed\. Bearer authentication is required\./);
  } finally {
    await server.close();
  }
});

async function createServer(handler) {
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.statusCode = 500;
      response.end(error.stack || String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for OAuth flow progress.');
}
