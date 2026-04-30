const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createOAuthFlowController,
  findOAuthCallbackArg,
  OAUTH_CUSTOM_SCHEME,
  safeOAuthExternalUrl
} = require('../../electron/oauthFlows');

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
