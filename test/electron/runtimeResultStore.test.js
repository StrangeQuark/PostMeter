const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeCapturePolicy
} = require('../../src/core/workspace/resultCapturePolicy');
const {
  cleanupRuntimeResultStore,
  createRuntimeResultStore,
  estimateRuntimeResultStoreSize
} = require('../../src/core/runtime/runtimeResultStore');
const {
  runRunner
} = require('../../src/core/runtime/collectionRunner');

test('capture policy keeps current defaults for small runs and applies high-volume guardrails', () => {
  const small = normalizeCapturePolicy({}, 'runner', { plannedRequests: 100 });
  assert.equal(small.responseBody, 'all');
  assert.equal(small.preRequestOutput, true);
  assert.equal(small.postRequestOutput, true);
  assert.equal(small.scriptLogs, true);

  const large = normalizeCapturePolicy({
    responseBody: 'all',
    bodyPreviewBytes: 32768,
    preRequestOutput: true,
    postRequestOutput: true,
    scriptLogs: true,
    localVariables: true
  }, 'runner', { plannedRequests: 100000 });
  assert.equal(large.responseBody, 'failed');
  assert.equal(large.bodyPreviewBytes, 4096);
  assert.equal(large.preRequestOutput, true);
  assert.equal(large.postRequestOutput, true);
  assert.equal(large.scriptLogs, false);
  assert.equal(large.localVariables, false);
  assert.ok(large.guardrailNotes.length);

  const veryLarge = normalizeCapturePolicy({
    responseBody: 'sampled',
    bodyPreviewBytes: 32768,
    preRequestOutput: true,
    postRequestOutput: true,
    scriptLogs: true,
    localVariables: true
  }, 'runner', { plannedRequests: 500000 });
  assert.equal(veryLarge.responseBody, 'failed');
  assert.equal(veryLarge.bodyPreviewBytes, 2048);
  assert.equal(veryLarge.preRequestOutput, false);
  assert.equal(veryLarge.postRequestOutput, false);
  assert.equal(veryLarge.scriptLogs, false);
  assert.equal(veryLarge.localVariables, false);
  assert.equal(veryLarge.transportTimings, false);

  const veryLargeDiagnosis = normalizeCapturePolicy({
    responseHeaders: true,
    transportTimings: true
  }, 'performance', { plannedRequests: 500000, diagnostic: true });
  assert.equal(veryLargeDiagnosis.responseHeaders, true);
  assert.equal(veryLargeDiagnosis.transportTimings, true);

  const veryLargePerformance = normalizeCapturePolicy({
    responseHeaders: true,
    transportTimings: true
  }, 'performance', { plannedRequests: 500000, diagnostic: false });
  assert.equal(veryLargePerformance.responseHeaders, false);
  assert.equal(veryLargePerformance.transportTimings, true);
});

test('runtime result store estimates high-volume file size from capture settings', () => {
  const small = estimateRuntimeResultStoreSize({
    kind: 'runner',
    plannedRequests: 100,
    capturePolicy: { responseBody: 'none', preRequestOutput: false, postRequestOutput: false },
    averageMetadataBytes: 80
  });
  const large = estimateRuntimeResultStoreSize({
    kind: 'runner',
    plannedRequests: 1000000,
    capturePolicy: { responseBody: 'all', bodyPreviewBytes: 32768, localVariables: true, scriptLogs: true },
    averageMetadataBytes: 160
  });

  assert.equal(small.plannedRequests, 100);
  assert.ok(small.estimatedBytes > 0);
  assert.equal(large.capturePolicy.responseBody, 'failed');
  assert.equal(large.capturePolicy.preRequestOutput, false);
  assert.equal(large.capturePolicy.postRequestOutput, false);
  assert.equal(large.capturePolicy.localVariables, false);
  assert.ok(large.estimatedBytes > small.estimatedBytes);
  assert.ok(large.estimatedCoreBytes > small.estimatedCoreBytes);
});

test('runtime result store cleanup removes SQLite files and sidecars', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-result-cleanup-'));
  const storePath = path.join(temp, 'current.sqlite');
  try {
    await fs.writeFile(storePath, 'db');
    await fs.writeFile(`${storePath}-journal`, 'journal');
    await fs.writeFile(`${storePath}-wal`, 'wal');
    await fs.writeFile(`${storePath}-shm`, 'shm');

    await cleanupRuntimeResultStore(storePath);

    for (const candidate of [storePath, `${storePath}-journal`, `${storePath}-wal`, `${storePath}-shm`]) {
      await assert.rejects(() => fs.stat(candidate), /ENOENT/);
    }
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('runtime result store reset replaces stale SQLite schema if file removal is skipped', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-result-stale-schema-'));
  const storePath = path.join(temp, 'current.sqlite');
  const originalRm = fs.rm;
  try {
    const firstStore = createRuntimeResultStore(storePath);
    await firstStore.reset();
    firstStore.close();

    fs.rm = async () => {};
    const secondStore = createRuntimeResultStore(storePath);
    try {
      await secondStore.reset();
      secondStore.beginRun({ id: 'stale-reset', kind: 'runner', plannedRequests: 1, capturePolicy: {}, metadata: {} });
      secondStore.finishRun({});
      assert.equal(secondStore.metadata().runId, 'stale-reset');
    } finally {
      secondStore.close();
    }
  } finally {
    fs.rm = originalRm;
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('runtime result store honors explicit zero result indexes', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-result-zero-index-'));
  const storePath = path.join(temp, 'current.sqlite');
  const store = createRuntimeResultStore(storePath);
  try {
    await store.reset();
    store.beginRun({ id: 'zero-index', kind: 'performance', plannedRequests: 2, capturePolicy: {}, metadata: {} });
    store.recordRunnerResult({ requestId: 'inner-runner-row', statusCode: 200, durationMillis: 1, passed: true }, {
      index: 0,
      totalRequests: 1
    });
    store.recordPerformanceSample({ requestId: 'first-performance-row', statusCode: 200, durationMillis: 2, passed: true }, {
      index: 0,
      totalRequests: 2
    });
    store.recordPerformanceSample({ requestId: 'second-performance-row', statusCode: 200, durationMillis: 3, passed: true }, {
      index: 1,
      totalRequests: 2
    });
    store.finishRun({});

    assert.equal(store.detail({ kind: 'performance', resultIndex: 0 }).requestId, 'first-performance-row');
    assert.equal(store.detail({ kind: 'performance', resultIndex: 1 }).requestId, 'second-performance-row');
  } finally {
    store.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('runtime result store reuses one SQLite file and pages captured runner details', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-result-store-'));
  const storePath = path.join(temp, 'current.sqlite');
  const store = createRuntimeResultStore(storePath);
  try {
    await store.reset();
    store.beginRun({
      id: 'run-one',
      kind: 'runner',
      plannedRequests: 3,
      capturePolicy: { responseBody: 'failed', bodyPreviewBytes: 16, transportTimings: true },
      metadata: { runnerOwned: true }
    });
    store.recordRunnerResult({
      requestId: 'ok',
      requestName: 'OK',
      requestMethod: 'GET',
      requestUrl: 'https://example.test/ok',
      statusCode: 200,
      durationMillis: 10,
      responseBody: 'successful-body',
      responseBytes: 15,
      timings: {
        tlsHandshakeMillis: 12,
        tls: {
          verificationDisabled: true,
          caCertificateConfigured: true
        }
      },
      passed: true,
      preRequestScriptResult: { passed: true, tests: [], logs: ['pre'] },
      testScriptResult: { passed: true, tests: [], logs: ['post'] },
      localVariables: [{ enabled: true, key: 'a', value: 'b' }]
    }, { index: 0, totalRequests: 3 });
    store.recordRunnerResult({
      requestId: 'failed',
      requestName: 'Failed',
      requestMethod: 'GET',
      requestUrl: 'https://example.test/failed',
      statusCode: 500,
      durationMillis: 25,
      responseBody: 'failed-body-preview',
      responseBytes: 19,
      passed: false,
      error: 'HTTP 500'
    }, { index: 1, totalRequests: 3 });
    store.finishRun({ totalRequests: 2, failedRequests: 1 });

    const page = store.page({ kind: 'runner', limit: 10 });
    assert.equal(page.total, 2);
    assert.equal(page.statusCounts['200'], 1);
    assert.equal(page.statusCounts['500'], 1);
    assert.equal(page.items[0].responseBody, undefined);
    assert.equal(page.items[1].responseBody, 'failed-body-prev');
    assert.equal(page.items[0].bodySha256.length, 64);
    assert.equal(page.items[0].timings.tls.verificationDisabled, true);
    assert.equal(page.items[0].timings.tls.caCertificateConfigured, true);

    const failedPage = store.page({ kind: 'runner', status: '500', limit: 10 });
    assert.equal(failedPage.total, 1);
    assert.equal(failedPage.items[0].requestId, 'failed');

    const detail = store.detail({ kind: 'runner', resultIndex: 1 });
    assert.equal(detail.error, 'HTTP 500');

    const csvPath = path.join(temp, 'export.csv');
    await store.exportCsv(csvPath, { kind: 'runner', result: { id: 'run-one', totalRequests: 2, failedRequests: 1 } });
    const csv = await fs.readFile(csvPath, 'utf8');
    assert.match(csv, /failed-body-prev/);
    assert.match(csv, /capturePolicy/);

    const htmlPath = path.join(temp, 'export.html');
    await store.exportHtml(htmlPath, { kind: 'runner', result: { id: 'run-one', totalRequests: 2, failedRequests: 1, resultPage: page } });
    const html = await fs.readFile(htmlPath, 'utf8');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /PostMeter Runner Results/);
    assert.match(html, /Charts and Trends/);
    assert.match(html, /Response Details/);
    assert.match(html, /id="resultPageSizeSelect"/);
    assert.match(html, /id="resultStatusFilterSelect"/);
    assert.match(html, /View Details/);
    assert.match(html, /id="responseDetailModal"/);
    assert.doesNotMatch(html, /<section id="responses"/);
    assert.match(html, /failed-body-prev/);
    assert.match(html, /Body SHA-256/);

    const compactHtmlPath = path.join(temp, 'export-compact.html');
    await store.exportHtml(compactHtmlPath, {
      kind: 'runner',
      result: { id: 'run-one', totalRequests: 2, failedRequests: 1, resultPage: page },
      includeRequestResults: false,
      includeRequestDetails: false
    });
    const compactHtml = await fs.readFile(compactHtmlPath, 'utf8');
    assert.match(compactHtml, /PostMeter Runner Results/);
    assert.doesNotMatch(compactHtml, /Request Results/);
    assert.doesNotMatch(compactHtml, /View Details/);
    assert.doesNotMatch(compactHtml, /id="responseDetailModal"/);
    assert.doesNotMatch(compactHtml, /failed-body-prev/);

    const tableOnlyHtmlPath = path.join(temp, 'export-table-only.html');
    await store.exportHtml(tableOnlyHtmlPath, {
      kind: 'runner',
      result: { id: 'run-one', totalRequests: 2, failedRequests: 1, resultPage: page },
      includeRequestDetails: false
    });
    const tableOnlyHtml = await fs.readFile(tableOnlyHtmlPath, 'utf8');
    assert.match(tableOnlyHtml, /Request Results/);
    assert.match(tableOnlyHtml, /Failed/);
    assert.doesNotMatch(tableOnlyHtml, /View Details/);
    assert.doesNotMatch(tableOnlyHtml, /id="responseDetailModal"/);
    assert.doesNotMatch(tableOnlyHtml, /failed-body-prev/);

    store.close();
    await store.reset();
    store.beginRun({ id: 'run-two', kind: 'runner', plannedRequests: 1, capturePolicy: {}, metadata: {} });
    store.recordRunnerResult({ requestId: 'next', statusCode: 204, durationMillis: 1, passed: true }, { index: 0, totalRequests: 1 });
    store.finishRun({});
    assert.equal(store.page({ kind: 'runner' }).total, 1);
    assert.equal(store.detail({ kind: 'runner', resultIndex: 0 }).requestId, 'next');
  } finally {
    store.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('runRunner can stream results without retaining the full result array', async () => {
  const captured = [];
  const runner = {
    id: 'runner-stream',
    name: 'Stream Runner',
    environmentId: 'none',
    requests: [
      { id: 'one', name: 'One', method: 'GET', url: 'https://example.test/one' },
      { id: 'two', name: 'Two', method: 'GET', url: 'https://example.test/two' }
    ]
  };
  const result = await runRunner(runner, { id: 'env', name: 'Env', variables: [] }, {
    retainResults: false,
    resultWriter: {
      async recordRunnerResult(item, context) {
        captured.push({ item, context });
      }
    },
    sendRequest: async (request) => ({
      statusCode: request.id === 'one' ? 200 : 500,
      body: request.id,
      durationMillis: 5,
      responseBytes: request.id.length,
      headers: {},
      updatedCookies: []
    })
  });
  assert.equal(result.totalRequests, 2);
  assert.equal(result.failedRequests, 0);
  assert.equal(result.results.length, 0);
  assert.equal(captured.length, 2);
  assert.equal(captured[0].context.index, 0);
  assert.equal(captured[1].item.statusCode, 500);
});
