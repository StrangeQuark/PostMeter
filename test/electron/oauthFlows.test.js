const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createOAuthFlowController,
  findOAuthCallbackArg,
  OAUTH_CUSTOM_SCHEME
} = require('../../electron/oauthFlows');

test('finds custom OAuth callback arguments conservatively', () => {
  assert.equal(findOAuthCallbackArg(['--flag', `${OAUTH_CUSTOM_SCHEME}://oauth/callback?state=abc`]), 'postmeter://oauth/callback?state=abc');
  assert.equal(findOAuthCallbackArg(['https://example.test/callback', 42, null]), '');
  assert.equal(findOAuthCallbackArg(), '');
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
  assert.equal(controller.handleCallbackUrl(`${OAUTH_CUSTOM_SCHEME}://oauth/callback`), false);
  assert.deepEqual(progress, []);
});
