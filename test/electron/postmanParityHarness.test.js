const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  runPostmanParityDifferential,
  validateCommittedParityMatrix,
  validateCommittedProductionClaim,
  validateProductionClaim
} = require('../../src/core/postmanParityHarness');
const {
  buildPostmanParityMatrix
} = require('../../src/core/postmanParityMatrix');

test('validates the committed Postman sandbox parity matrix', async () => {
  const result = await validateCommittedParityMatrix();

  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.ok(result.summary.rowCount >= 120);
  assert.ok(result.summary.byArea.variables > 0);
  assert.ok(result.summary.byArea.network > 0);
  assert.ok(result.summary.byArea.packages > 0);
});

test('blocks the full Postman compatibility claim while default import parity blockers remain', async () => {
  const result = await validateCommittedProductionClaim();
  const blockerIds = new Set(result.blockers.map((row) => row.id));

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('Postman 1:1 script compatibility claim is blocked')));
  assert.ok(blockerIds.has('cookies.httponly-parity'));
  assert.ok(blockerIds.has('sendRequest.advanced-auth-proxy'));
  assert.ok(blockerIds.has('sendRequest.file-binary-bindings'));
  assert.ok(blockerIds.has('grpc.live-desktop-transport'));
  assert.equal(blockerIds.has('run-order.load-tests.skip'), false);
  assert.equal(result.summary.claim.ready, false);
});

test('allows the full Postman compatibility claim only when default import blockers are zero', () => {
  const matrix = buildPostmanParityMatrix();
  matrix.rows = matrix.rows.map((row) => {
    if (row.claimScope === 'out-of-scope') {
      return row;
    }
    return {
      ...row,
      fixtureRefs: row.fixtureRefs.length ? row.fixtureRefs : ['adversarial-sandbox-v1'],
      status: 'implemented'
    };
  });
  const result = validateProductionClaim(matrix);

  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.summary.ready, true);
});

test('runs the HTTP-core Postman parity differential fixture through PostMeter', async (t) => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-parity-'));
  t.after(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  const result = await runPostmanParityDifferential({ outputDir });
  const request = result.postmeter.requests[0];
  const observed = result.postmeter.observedRequests.map((item) => ({
    method: item.method,
    path: item.path,
    xPre: item.headers['x-pre'] || ''
  }));

  assert.equal(result.postmeter.summary.collectionName, 'PostMeter Differential HTTP Core');
  assert.equal(result.postmeter.summary.passed, true);
  assert.equal(result.postmeter.summary.totalRequests, 1);
  assert.equal(request.requestName, 'Core JSON');
  assert.equal(request.passed, true);
  assert.deepEqual(request.tests.map((item) => item.name), [
    'core response status and body',
    'pm.info exposes core metadata',
    'pm.sendRequest callback receives response'
  ]);
  assert.ok(result.postmeter.environment.some((item) => item.key === 'envToken' && item.value === 'env-1'));
  assert.ok(result.postmeter.collectionVariables.some((item) => item.key === 'collectionTouched' && item.value === 'yes'));
  assert.deepEqual(observed, [
    { method: 'GET', path: '/json', xPre: 'local-1' },
    { method: 'GET', path: '/aux', xPre: '' }
  ]);
  assert.equal(result.comparison.skipped, true);
  assert.equal(result.newman.skipped, true);
});
