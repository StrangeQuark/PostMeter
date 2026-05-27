const assert = require('node:assert/strict');
const test = require('node:test');
const {
  validateCommittedOsSandboxPlatformClaim,
  validateCommittedOsSandboxPlatformMatrix,
  validateOsSandboxPlatformClaim
} = require('../../src/core/sandbox/osSandboxPlatformHarness');
const {
  PLATFORM_OS_SANDBOX_CLAIM,
  buildOsSandboxPlatformMatrix
} = require('../../src/core/sandbox/osSandboxPlatformMatrix');

test('validates the committed OS sandbox platform matrix', async () => {
  const result = await validateCommittedOsSandboxPlatformMatrix();

  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.summary.byPlatform.linux, 4);
  assert.equal(result.summary.byPlatform.windows, 2);
  assert.equal(result.summary.byPlatform.macos, 2);
  assert.equal(result.summary.byClaimSurface[PLATFORM_OS_SANDBOX_CLAIM], 8);
});

test('keeps platform OS sandbox claim separate from Postman API parity', async () => {
  const result = await validateCommittedOsSandboxPlatformClaim();
  const blockerIds = new Set(result.blockers.map((row) => row.id));

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(blockerIds.has('windows.appcontainer-backend'), false);
  assert.equal(blockerIds.has('windows.packaged-os-sandbox-validation'), false);
  assert.equal(blockerIds.has('macos.seatbelt-backend'), false);
  assert.equal(blockerIds.has('macos.packaged-os-sandbox-validation'), false);
  assert.equal(blockerIds.has('linux.seccomp-deny-default-allowlist-decision'), false);
  assert.equal(blockerIds.has('postman-parity.separate-claim'), false);
  assert.equal(blockerIds.has('sendRequest.advanced-auth-proxy'), false);
  assert.equal(result.summary.claim.claimReady, true);
});

test('allows platform OS sandbox claim only when platform blockers are implemented', () => {
  const matrix = buildOsSandboxPlatformMatrix();
  matrix.rows = matrix.rows.map((row) => {
    if (row.claimSurface !== PLATFORM_OS_SANDBOX_CLAIM) {
      return row;
    }
    return {
      ...row,
      status: 'implemented'
    };
  });
  const result = validateOsSandboxPlatformClaim(matrix);

  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.summary.claimReady, true);
});
