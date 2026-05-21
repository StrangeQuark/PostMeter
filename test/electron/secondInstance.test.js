const test = require('node:test');
const assert = require('node:assert/strict');
const { handleSecondInstance } = require('../../electron/app-shell/secondInstance');

test('second-instance handler routes OAuth callbacks and restores the existing window', () => {
  const calls = [];
  const mainWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    focus: () => calls.push('focus')
  };
  const oauthFlows = {
    findCallbackArg: (argv) => argv.find((arg) => String(arg).startsWith('postmeter://')) || '',
    handleCallbackUrl: (url) => calls.push(`callback:${url}`)
  };

  const result = handleSecondInstance(['--flag', 'postmeter://oauth/callback?state=abc'], { mainWindow, oauthFlows });

  assert.deepEqual(result, {
    callbackUrl: 'postmeter://oauth/callback?state=abc',
    focused: true
  });
  assert.deepEqual(calls, [
    'callback:postmeter://oauth/callback?state=abc',
    'restore',
    'focus'
  ]);
});

test('second-instance handler focuses without routing missing callbacks and ignores destroyed windows', () => {
  const focused = [];
  const oauthFlows = {
    findCallbackArg: () => '',
    handleCallbackUrl: () => focused.push('unexpected-callback')
  };

  assert.deepEqual(handleSecondInstance(['--not-oauth'], {
    mainWindow: {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => focused.push('restore'),
      focus: () => focused.push('focus')
    },
    oauthFlows
  }), {
    callbackUrl: '',
    focused: true
  });
  assert.deepEqual(focused, ['focus']);

  assert.deepEqual(handleSecondInstance(['postmeter://oauth/callback?state=abc'], {
    mainWindow: { isDestroyed: () => true },
    oauthFlows: {
      findCallbackArg: () => 'postmeter://oauth/callback?state=abc',
      handleCallbackUrl: (url) => focused.push(url)
    }
  }), {
    callbackUrl: 'postmeter://oauth/callback?state=abc',
    focused: false
  });
  assert.equal(focused.at(-1), 'postmeter://oauth/callback?state=abc');
});
