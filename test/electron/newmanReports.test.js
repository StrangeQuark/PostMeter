const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  POSTMETER_DIR,
  RAW_DIR,
  RAW_POSTMETER_DIR,
  SUITES,
  TARGET,
  dateGeneratedFromNewmanReport,
  findNondeterministicStrings,
  normalizeEvidenceValue,
  normalizeNewmanReport,
  normalizePostmeterReport,
  validateReports,
  validateSourceSummary
} = require('../../scripts/newmanReports');

test('Newman report normalization records required target and generation metadata', () => {
  const raw = {
    collection: { info: { name: 'Example Collection' } },
    run: {
      timings: { started: Date.UTC(2026, 3, 28, 15, 24, 34, 771) },
      stats: { assertions: { total: 1, pending: 0, failed: 0 } },
      executions: [
        {
          cursor: { execution: 'random-execution-id' },
          item: { name: 'Example Request' },
          request: { method: 'GET' },
          response: { code: 200 },
          assertions: [{ assertion: 'status is ok' }]
        }
      ],
      failures: []
    }
  };

  const normalized = normalizeNewmanReport(raw, 'example-suite');

  assert.equal(normalized.schemaVersion, TARGET.normalizationSchemaVersion);
  assert.equal(normalized.fixtureId, 'example-suite');
  assert.equal(normalized.newmanVersion, TARGET.newman);
  assert.equal(normalized.postmanRuntimeVersion, TARGET.postmanRuntime);
  assert.equal(normalized.dateGenerated, dateGeneratedFromNewmanReport(raw));
  assert.match(normalized.generationCommand, /postman:newman-reports:refresh/);
  assert.deepEqual(normalized.requests[0].assertions, [
    { name: 'status is ok', passed: true, skipped: false, error: '' }
  ]);
});

test('Newman response body digests normalize volatile ports, tokens, and multipart boundaries', () => {
  const baseRaw = (body) => ({
    collection: { info: { name: 'Example Collection' } },
    run: {
      timings: { started: Date.UTC(2026, 3, 28, 15, 24, 34, 771) },
      stats: { assertions: { total: 1, pending: 0, failed: 0 } },
      executions: [
        {
          item: { name: 'Example Request' },
          request: { method: 'POST' },
          response: {
            code: 200,
            status: 'OK',
            stream: { type: 'Buffer', data: Array.from(Buffer.from(body)) }
          },
          assertions: [{ assertion: 'status is ok' }]
        }
      ],
      failures: []
    }
  });
  const left = normalizeNewmanReport(baseRaw(JSON.stringify({
    authorization: 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260428/us-east-1/execute-api/aws4_request, SignedHeaders=host;x-amz-date, Signature=c398226cc5e7efaefad73f93745c3c8a5c265059d49a16721187882dc7cdecb0',
    body: '--postmeter-abc123\r\nvalue\r\n----------------------------abcdef123456\r\n',
    contentType: 'multipart/form-data; boundary=--------------------------297656137815325409331337',
    headers: {
      host: '127.0.0.1:41234',
      'postman-token': '1f4b7a56-72f1-4c83-a2dd-2e87953a64fb'
    }
  })), 'example-suite');
  const right = normalizeNewmanReport(baseRaw(JSON.stringify({
    authorization: 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260430/us-east-1/execute-api/aws4_request, SignedHeaders=host;x-amz-date, Signature=6c1776cb9c6f553926c949142c36596e89a023032dd78f29a6a9ee5fcff34f5d',
    body: '--postmeter-def456\r\nvalue\r\n----------------------------123456abcdef\r\n',
    contentType: 'multipart/form-data; boundary=--------------------------579658349945560963129241',
    headers: {
      host: '127.0.0.1:54321',
      'postman-token': '2a36c608-3701-47bb-9983-69873016ddf6'
    }
  })), 'example-suite');

  assert.equal(left.requests[0].responseShape.bodySha256, right.requests[0].responseShape.bodySha256);
  assert.equal(left.requests[0].responseShape.sizeBytes, right.requests[0].responseShape.sizeBytes);
});

test('PostMeter report normalization strips volatile localhost ports and records metadata', () => {
  const normalized = normalizePostmeterReport({
    summary: { collectionName: 'Example Collection', passed: true, machineName: 'runner-host-17' },
    requests: [
      {
        requestId: '1f4b7a56-72f1-4c83-a2dd-2e87953a64fb',
        requestName: 'Example Request',
        statusCode: 200,
        passed: true,
        tests: [{ name: 'uses base url', passed: true, error: 'http://127.0.0.1:54321/failure' }]
      }
    ],
    environment: [{ key: 'baseUrl', value: 'http://127.0.0.1:54321' }],
    observedRequests: [{ method: 'GET', path: '/json', headers: { 'x-pre': 'http://localhost:12345/pre' } }]
  }, 'example-suite', { dateGenerated: '2026-04-28T15:24:34.771Z' });

  assert.equal(normalized.schemaVersion, TARGET.normalizationSchemaVersion);
  assert.equal(normalized.fixtureId, 'example-suite');
  assert.equal(normalized.newmanVersion, TARGET.newman);
  assert.equal(normalized.postmanRuntimeVersion, TARGET.postmanRuntime);
  assert.equal(normalized.dateGenerated, '2026-04-28T15:24:34.771Z');
  assert.equal(normalized.summary.machineName, '<machine-name>');
  assert.equal(normalized.requests[0].requestId, '<generated-id>');
  assert.equal(normalized.environment[0].value, 'http://127.0.0.1:<port>');
  assert.equal(normalized.requests[0].tests[0].error, 'http://127.0.0.1:<port>/failure');
  assert.equal(normalized.observedRequests[0].xPre, 'http://localhost:<port>/pre');
  assert.deepEqual(findNondeterministicStrings(normalized), []);
});

test('Newman evidence nondeterminism scanner catches raw ports, local paths, generated IDs, signatures, boundaries, and machine names', () => {
  const findings = findNondeterministicStrings({
    url: 'http://localhost:4242/path',
    path: '/home/user/Desktop/PostMeter/test.json',
    requestId: '2a36c608-3701-47bb-9983-69873016ddf6',
    authorization: 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260430/us-east-1/aws4_request, Signature=6c1776cb9c6f553926c949142c36596e89a023032dd78f29a6a9ee5fcff34f5d',
    contentType: 'multipart/form-data; boundary=--------------------------579658349945560963129241',
    machineName: 'build-runner-01',
    fixtureId: 'differential-http-core'
  });

  assert.equal(findings.length, 6);
  assert.match(findings[0], /localhost:4242/);
  assert.match(findings[1], /Desktop\/PostMeter/);
  assert.match(findings[2], /2a36c608-3701-47bb-9983-69873016ddf6/);
  assert.match(findings[3], /Credential=AKIDEXAMPLE\/20260430/);
  assert.match(findings[4], /579658349945560963129241/);
  assert.match(findings[5], /build-runner-01/);
});

test('Newman evidence normalization only scrubs generated IDs in volatile ID fields', () => {
  assert.deepEqual(normalizeEvidenceValue({
    requestId: '2a36c608-3701-47bb-9983-69873016ddf6',
    fixtureId: 'differential-http-core',
    machineName: 'build-runner-01'
  }), {
    requestId: '<generated-id>',
    fixtureId: 'differential-http-core',
    machineName: '<machine-name>'
  });
});

test('checked-in raw PostMeter evidence regenerates normalized PostMeter reports', () => {
  for (const suite of SUITES) {
    const rawNewman = JSON.parse(fs.readFileSync(path.join(RAW_DIR, `${suite}.json`), 'utf8'));
    const rawPostmeter = JSON.parse(fs.readFileSync(path.join(RAW_POSTMETER_DIR, `${suite}.json`), 'utf8'));
    const normalizedPostmeter = JSON.parse(fs.readFileSync(path.join(POSTMETER_DIR, `${suite}.json`), 'utf8'));
    const expected = normalizePostmeterReport(rawPostmeter, suite, {
      dateGenerated: dateGeneratedFromNewmanReport(rawNewman)
    });

    assert.deepEqual(normalizedPostmeter, expected, `${suite} normalized PostMeter report is stale`);
  }
});

test('Newman source summary validation rejects wrong targets, skipped suites, and missing suites', () => {
  const validSummary = {
    comparison: { passed: true },
    suites: SUITES.map((suite) => ({
      comparison: { passed: true },
      fixture: suite,
      newman: { skipped: false }
    })),
    target: {
      newman: TARGET.newman,
      postmanRuntime: TARGET.postmanRuntime
    }
  };

  assert.doesNotThrow(() => validateSourceSummary(validSummary));
  assert.throws(() => validateSourceSummary({
    ...validSummary,
    target: { newman: '0.0.0' }
  }), /targets newman/);
  assert.throws(() => validateSourceSummary({
    ...validSummary,
    target: {
      newman: TARGET.newman,
      postmanRuntime: '0.0.0'
    }
  }), /targets Postman Runtime/);
  assert.throws(() => validateSourceSummary({
    ...validSummary,
    suites: validSummary.suites.slice(1)
  }), /exactly/);
  assert.throws(() => validateSourceSummary({
    ...validSummary,
    suites: validSummary.suites.map((suite, index) => index === 0 ? { ...suite, newman: { skipped: true } } : suite)
  }), /skipped Newman/);
});

test('Newman report validation rejects unexpected checked-in report files', async () => {
  const extraPath = path.join(POSTMETER_DIR, 'unexpected-suite.json');
  try {
    fs.writeFileSync(extraPath, '{}\n');
    const errors = await validateReports();
    assert(errors.some((error) => /unexpected checked-in report file unexpected-suite\.json/.test(error)), errors.join('\n'));
  } finally {
    if (fs.existsSync(extraPath)) {
      fs.unlinkSync(extraPath);
    }
  }
});
