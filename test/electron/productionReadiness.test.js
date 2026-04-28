const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildProductionReadinessMatrix,
  productionReadinessSummary,
  validateProductionReadinessMatrix
} = require('../../src/core/productionReadinessMatrix');
const {
  buildMatrix,
  validateMatrix
} = require('../../src/core/productionSupportMatrices');
const {
  validateCommittedMatrix
} = require('../../scripts/productionReadiness');

test('production readiness matrix tracks release areas and stable-release blockers', async () => {
  const matrix = buildProductionReadinessMatrix();
  const ids = new Set(matrix.rows.map((row) => row.id));
  for (const requiredId of [
    'release.dashboard',
    'packaging.linux',
    'packaging.windows',
    'packaging.macos',
    'sandbox.script-runtime',
    'sandbox.platform-os',
    'postman.script-parity',
    'compatibility.non-postman',
    'electron.security',
    'workspace.durability',
    'oauth.live-certification',
    'ux.accessibility',
    'diagnostics.privacy',
    'docs.public-release',
    'updates.metadata',
    'release.signing'
  ]) {
    assert.ok(ids.has(requiredId), `Missing readiness row ${requiredId}`);
  }
  assert.deepEqual(validateProductionReadinessMatrix(matrix), []);
  const summary = productionReadinessSummary(matrix);
  assert.ok(summary.releaseBlockerCount >= 1);
  assert.ok(summary.releaseBlockers.includes('diagnostics.privacy'));
});

test('committed production readiness matrix is fresh', async () => {
  const result = await validateCommittedMatrix();
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('production support matrices cover Electron security, workspace durability, and non-Postman compatibility', () => {
  for (const name of ['electron-security', 'workspace-durability', 'non-postman-compatibility']) {
    const matrix = buildMatrix(name);
    assert.deepEqual(validateMatrix(matrix, name), []);
    assert.ok(matrix.rows.length >= 6, `${name} should cover multiple release concerns`);
  }
});
