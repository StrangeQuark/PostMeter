const assert = require('node:assert/strict');
const test = require('node:test');
const {
  WAIVER_ENV,
  shouldUseCiNoSandbox,
  withCiNoSandboxArgs
} = require('../../scripts/electronCiSandboxWaiver');

test('CI Chromium sandbox waiver only applies to explicit Linux validation runs', () => {
  assert.equal(shouldUseCiNoSandbox({ [WAIVER_ENV]: '1' }, 'linux'), true);
  assert.equal(shouldUseCiNoSandbox({ [WAIVER_ENV]: '1' }, 'darwin'), false);
  assert.equal(shouldUseCiNoSandbox({ [WAIVER_ENV]: '1' }, 'win32'), false);
  assert.equal(shouldUseCiNoSandbox({}, 'linux'), false);
});

test('CI Chromium sandbox waiver prepends Electron no-sandbox argument', () => {
  assert.deepEqual(withCiNoSandboxArgs(['.'], { [WAIVER_ENV]: '1' }, 'linux'), ['--no-sandbox', '.']);
  assert.deepEqual(withCiNoSandboxArgs(['.'], {}, 'linux'), ['.']);
});
