const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  runPostmanParityDifferential,
  validateCommittedParityMatrix,
  validateCommittedProductionClaim,
  validateParityMatrix,
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

test('allows the full Postman compatibility claim after default import parity blockers are cleared', async () => {
  const result = await validateCommittedProductionClaim();
  const blockerIds = new Set(result.blockers.map((row) => row.id));

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(blockerIds.has('cookies.httponly-parity'), false);
  assert.equal(blockerIds.has('global.dynamic-code-and-host-like-globals-audit'), false);
  assert.equal(blockerIds.has('sendRequest.advanced-auth-proxy'), false);
  assert.equal(blockerIds.has('sendRequest.file-binary-bindings'), false);
  assert.equal(blockerIds.has('require.builtin.full-library-parity'), false);
  assert.equal(blockerIds.has('require.pm.commonjs-bundle-semantics'), false);
  assert.equal(blockerIds.has('require.pm.online-fetch-review'), false);
  assert.equal(blockerIds.has('grpc.live-desktop-transport'), false);
  assert.equal(blockerIds.has('runtime.resource-limit-parity'), false);
  assert.equal(blockerIds.has('visualizer.handlebars-full-parity'), false);
  assert.equal(blockerIds.has('harness.broad-differential-corpus'), false);
  assert.equal(blockerIds.has('harness.completed-desktop-observations'), false);
  assert.equal(result.blockers.length, 0);
  assert.equal(blockerIds.has('run-order.load-tests.skip'), false);
  assert.equal(result.summary.claim.ready, true);
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

test('rejects implemented desktop-required rows that only reference the observation template', () => {
  const matrix = buildPostmanParityMatrix();
  matrix.rows = matrix.rows.map((row) => row.id === 'vault.get'
    ? { ...row, fixtureRefs: ['desktop-observation-template'] }
    : row);

  const errors = validateParityMatrix(matrix);

  assert.ok(errors.some((error) => error.includes('vault.get') && error.includes('cannot rely only')));
});

test('runs the HTTP-core Postman parity differential fixture through PostMeter', async (t) => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-parity-'));
  t.after(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  const result = await runPostmanParityDifferential({ outputDir });
  const request = result.postmeter.requests[0];
  const broadSuite = result.suites.find((suite) => suite.fixture === 'differential-sandbox-broad');
  const dynamicSuite = result.suites.find((suite) => suite.fixture === 'differential-dynamic-host-globals');
  const runtimeLimitsSuite = result.suites.find((suite) => suite.fixture === 'differential-runtime-limits');
  const httpOnlyCookiesSuite = result.suites.find((suite) => suite.fixture === 'differential-httponly-cookies');
  const sendRequestAdvancedSuite = result.suites.find((suite) => suite.fixture === 'differential-sendrequest-advanced');
  const sendRequestFilesSuite = result.suites.find((suite) => suite.fixture === 'differential-sendrequest-files');
  const observed = result.postmeter.observedRequests.map((item) => ({
    body: item.body || '',
    method: item.method,
    path: item.path,
    xPre: item.headers['x-pre'] || ''
  }));

  assert.equal(result.suites.length, 7);
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
    { body: '', method: 'GET', path: '/json', xPre: 'local-1' },
    { body: '', method: 'GET', path: '/aux', xPre: '' }
  ]);
  assert.ok(broadSuite);
  assert.equal(broadSuite.postmeter.summary.collectionName, 'PostMeter Differential Sandbox Broad');
  assert.equal(broadSuite.postmeter.summary.passed, true);
  assert.equal(broadSuite.postmeter.summary.totalRequests, 4);
  assert.deepEqual(broadSuite.postmeter.requests.map((item) => item.requestName), [
    'Broad Runtime Surface',
    'Cookie Seed',
    'Cookie Echo',
    'Caught Failure Shape'
  ]);
  assert.ok(dynamicSuite);
  assert.equal(dynamicSuite.postmeter.summary.collectionName, 'PostMeter Differential Dynamic Host Globals');
  assert.equal(dynamicSuite.postmeter.summary.passed, true);
  assert.equal(dynamicSuite.postmeter.summary.totalRequests, 1);
  assert.deepEqual(dynamicSuite.postmeter.requests[0].tests.map((item) => item.name), [
    'dynamic code and host-like globals match Postman sandbox profile'
  ]);
  assert.equal(JSON.parse(dynamicSuite.postmeter.environment.find((item) => item.key === 'dynamicHostSummary').value).functionProcessType.value, 'undefined');
  assert.ok(runtimeLimitsSuite);
  assert.equal(runtimeLimitsSuite.postmeter.summary.collectionName, 'PostMeter Differential Runtime Limits');
  assert.equal(runtimeLimitsSuite.postmeter.summary.passed, true);
  assert.equal(runtimeLimitsSuite.postmeter.summary.totalRequests, 1);
  assert.deepEqual(runtimeLimitsSuite.postmeter.requests[0].tests.map((item) => item.name), [
    'runtime timers, console, and visualizer work below policy limits'
  ]);
  assert.equal(JSON.parse(runtimeLimitsSuite.postmeter.environment.find((item) => item.key === 'runtimeLimitsSummary').value).intervalCleared, true);
  assert.ok(httpOnlyCookiesSuite);
  assert.equal(httpOnlyCookiesSuite.postmeter.summary.collectionName, 'PostMeter Differential HttpOnly Cookies');
  assert.equal(httpOnlyCookiesSuite.postmeter.summary.passed, true);
  assert.equal(httpOnlyCookiesSuite.postmeter.summary.totalRequests, 4);
  assert.deepEqual(httpOnlyCookiesSuite.postmeter.requests.map((item) => item.requestName), [
    'Seed HttpOnly Cookies',
    'Read And Mutate HttpOnly Cookies',
    'After HttpOnly Mutations',
    'After HttpOnly Clear'
  ]);
  assert.equal(JSON.parse(httpOnlyCookiesSuite.postmeter.environment.find((item) => item.key === 'httpOnlyCookieSummary').value).clearRemovedAll, true);
  assert.ok(sendRequestAdvancedSuite);
  assert.equal(sendRequestAdvancedSuite.postmeter.summary.collectionName, 'PostMeter Differential SendRequest Advanced');
  assert.equal(sendRequestAdvancedSuite.postmeter.summary.passed, true);
  assert.equal(sendRequestAdvancedSuite.postmeter.summary.totalRequests, 1);
  assert.deepEqual(sendRequestAdvancedSuite.postmeter.requests[0].tests.map((item) => item.name), [
    'pm.sendRequest advanced auth helpers match Newman'
  ]);
  assert.deepEqual(JSON.parse(sendRequestAdvancedSuite.postmeter.environment.find((item) => item.key === 'advancedAuthSummary').value), {
    aws: 'AWS4-HMAC-SHA256',
    digest: 'Digest',
    hawk: 'Hawk'
  });
  assert.ok(sendRequestFilesSuite);
  assert.equal(sendRequestFilesSuite.postmeter.summary.collectionName, 'PostMeter Differential File Bindings');
  assert.equal(sendRequestFilesSuite.postmeter.summary.passed, true);
  assert.equal(sendRequestFilesSuite.postmeter.summary.totalRequests, 3);
  assert.deepEqual(sendRequestFilesSuite.postmeter.requests.map((item) => item.requestName), [
    'Binary Attachment Body',
    'File Attachment Body',
    'Form Data File Attachment'
  ]);
  assert.deepEqual(sendRequestFilesSuite.postmeter.requests.flatMap((item) => item.tests.map((testResult) => testResult.name)), [
    'binary attachment body is sent',
    'file attachment body is sent',
    'form-data file attachment is sent'
  ]);
  assert.equal(
    sendRequestFilesSuite.postmeter.environment.find((item) => item.key === 'fileBinarySummary').value,
    'binary:BINARY_ATTACHMENT_CONTENT:none|file:FILE_ATTACHMENT_CONTENT:none|form:FILE_ATTACHMENT_CONTENT:form-note'
  );
  assert.equal(result.comparison.skipped, true);
  assert.equal(result.newman.skipped, true);
});
