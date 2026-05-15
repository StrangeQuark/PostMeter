const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { resultHtmlReportToHtml } = require('../../src/core/resultHtmlReport');

test('result HTML report renders polished runner sections and escapes response data', async () => {
  let sourceCalls = 0;
  const html = await resultHtmlReportToHtml({
    kind: 'runner',
    exportedAt: '2026-05-14T12:00:00.000Z',
    result: {
      id: 'run-1',
      collectionName: 'Smoke Collection',
      totalRequests: 2,
      passedRequests: 1,
      failedRequests: 1,
      passed: false,
      resultPage: { statusCounts: { 200: 1, 500: 1 } }
    },
    items: async function* items() {
      sourceCalls += 1;
      yield {
        resultIndex: 0,
        requestId: 'safe',
        requestName: 'Safe request',
        requestMethod: 'GET',
        requestUrl: 'https://example.test/safe',
        statusCode: 200,
        durationMillis: 12.5,
        responseBytes: 42,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: '{"ok":true}',
        timings: { tcp: 1, tls: 2 },
        testScriptResult: { passed: true, tests: [{ name: 'status is OK', passed: true }] },
        localVariables: [{ key: 'token', value: 'redacted' }],
        passed: true
      };
      yield {
        resultIndex: 1,
        requestId: 'unsafe',
        requestName: 'Unsafe <script>alert("x")</script>',
        requestMethod: 'POST',
        requestUrl: 'https://example.test/unsafe',
        statusCode: 500,
        durationMillis: 25,
        responseBytes: 15,
        responseBody: '<script>alert("x")</script>',
        bodySha256: 'a'.repeat(64),
        error: 'HTTP 500',
        passed: false
      };
    }
  });

  assert.equal(sourceCalls, 2);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /PostMeter Runner Results/);
  assert.match(html, /Smoke Collection/);
  assert.match(html, /Overview/);
  assert.match(html, /Charts and Trends/);
  assert.match(html, /Request Results/);
  assert.match(html, /id="resultPageSizeSelect"/);
  assert.match(html, /id="resultStatusFilterSelect"/);
  assert.match(html, /<option value="all">All statuses<\/option>[\s\S]*<option value="200">200<\/option>[\s\S]*<option value="500">500<\/option>/);
  assert.match(html, /<option value="10">10<\/option><option value="25" selected>25<\/option><option value="50">50<\/option><option value="100">100<\/option>/);
  assert.match(html, /View Details/);
  assert.match(html, /Response Details/);
  assert.match(html, /id="responseDetailModal"/);
  assert.match(html, /<div id="responseDetailTemplates" hidden>/);
  assert.doesNotMatch(html, /<section id="responses"/);
  assert.doesNotMatch(html, /Appendix/);
  assert.doesNotMatch(html, /Raw Run Data/);
  assert.doesNotMatch(html, /Raw result JSON/);
  assert.doesNotMatch(html, /Capture policy/);
  assert.doesNotMatch(html, /Store backed/);
  assert.doesNotMatch(html, /Environment/);
  assert.equal((html.match(/<tr class="[^"]+" data-result-row data-result-status="[^"]+">/g) || []).length, 2);
  assert.match(html, /data-result-status="200"/);
  assert.match(html, /data-result-status="500"/);
  assert.equal((html.match(/class="detail-button"/g) || []).length, 2);
  assert.match(html, /&quot;ok&quot;: true/);
  assert.match(html, /status is OK/);
  assert.match(html, /Body SHA-256/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('result HTML report renders performance-specific visual and diagnostic data', async () => {
  const html = await resultHtmlReportToHtml({
    kind: 'performance',
    result: {
      id: 'perf-1',
      performanceTestName: 'Endpoint Diagnosis',
      type: 'diagnosis',
      completedRequests: 3,
      successfulRequests: 2,
      failedRequests: 1,
      passed: false,
      summary: {
        requestsPerSecond: 12.5,
        averageDurationMillis: 40,
        p95DurationMillis: 80,
        p99DurationMillis: 95,
        minDurationMillis: 20,
        maxDurationMillis: 110,
        diagnosis: {
          confidence: 'high',
          confidenceScore: 90,
          completedChecks: 2,
          requestedChecks: 2,
          bestObservedRequestsPerSecond: 12.5,
          stableRequestsPerSecond: 8,
          saturationPoint: 'not observed',
          successRate: 0.66,
          targetUrl: 'https://example.test/diagnostic',
          finalUrl: 'https://example.test/diagnostic',
          checks: [
            { group: 'Transport', label: 'DNS lookup time', status: 'pass', value: '1 ms' },
            { group: 'Security', label: 'Missing HTTPS', status: 'warn', value: 'not detected', details: 'local endpoint' }
          ],
          phases: [
            { phase: 'baseline', requests: 1, concurrency: 1, successfulResponses: 1, failedResponses: 0, averageDurationMillis: 40, p95DurationMillis: 40, requestsPerSecond: 8 },
            { phase: 'ramp', requests: 2, concurrency: 2, successfulResponses: 1, failedResponses: 1, averageDurationMillis: 60, p95DurationMillis: 80, requestsPerSecond: 12.5 }
          ]
        }
      },
      samples: [{
        resultIndex: 0,
        phase: 'baseline',
        stageName: 'Warmup',
        requestName: 'Diagnostic request',
        requestMethod: 'GET',
        requestUrl: 'https://example.test/diagnostic',
        statusCode: 200,
        durationMillis: 40,
        passed: true
      }]
    }
  });

  assert.match(html, /PostMeter Performance Results/);
  assert.match(html, /Endpoint Diagnosis/);
  assert.match(html, /href="#endpoint-diagnosis"/);
  assert.match(html, /href="#diagnostic-checks"/);
  assert.match(html, /Diagnostic Checks/);
  assert.match(html, /High \(90 \/ 100\)/);
  assert.match(html, /2 \/ 2/);
  assert.match(html, /Stable RPS/);
  assert.match(html, /DNS lookup time/);
  assert.match(html, /Missing HTTPS/);
  assert.match(html, /Diagnosis phases/);
  assert.match(html, /12\.5 rps/);
  assert.match(html, /Diagnostic request/);
  assert.match(html, /Warmup/);
  assert.doesNotMatch(html, /Diagnosis confidence/);
});

test('result HTML report can omit request results and details for compact reports', async () => {
  let sourceCalls = 0;
  const html = await resultHtmlReportToHtml({
    kind: 'runner',
    includeRequestResults: false,
    includeRequestDetails: true,
    result: {
      collectionName: 'Compact Runner',
      totalRequests: 1,
      passedRequests: 1,
      passed: true
    },
    items: async function* items() {
      sourceCalls += 1;
      yield { resultIndex: 0, requestName: 'Should not stream', passed: true };
    }
  });

  assert.equal(sourceCalls, 0);
  assert.match(html, /Compact Runner/);
  assert.match(html, /Overview/);
  assert.match(html, /Charts and Trends/);
  assert.doesNotMatch(html, /href="#results"/);
  assert.doesNotMatch(html, /Request Results/);
  assert.doesNotMatch(html, /id="resultPageSizeSelect"/);
  assert.doesNotMatch(html, /View Details/);
  assert.doesNotMatch(html, /id="responseDetailModal"/);
  assert.doesNotMatch(html, /<div id="responseDetailTemplates"/);
  assert.doesNotMatch(html, /Should not stream/);
});

test('result HTML report can include request results without response detail payloads', async () => {
  let sourceCalls = 0;
  const html = await resultHtmlReportToHtml({
    kind: 'performance',
    includeRequestDetails: false,
    result: {
      performanceTestName: 'Summary Table Only',
      completedRequests: 1,
      successfulRequests: 1,
      passed: true
    },
    items: async function* items() {
      sourceCalls += 1;
      yield {
        resultIndex: 0,
        requestName: 'Listed request',
        requestMethod: 'GET',
        requestUrl: 'https://example.test/listed',
        statusCode: 200,
        durationMillis: 12,
        passed: true
      };
    }
  });

  assert.equal(sourceCalls, 1);
  assert.match(html, /Request Results/);
  assert.match(html, /Listed request/);
  assert.match(html, /id="resultPageSizeSelect"/);
  assert.doesNotMatch(html, /<th>Details<\/th>/);
  assert.doesNotMatch(html, /View Details/);
  assert.doesNotMatch(html, /id="responseDetailModal"/);
  assert.doesNotMatch(html, /<div id="responseDetailTemplates"/);
  assert.doesNotMatch(html, /Endpoint Diagnosis/);
  assert.doesNotMatch(html, /Diagnostic Checks/);
});

test('result HTML report renders generic performance data bundles without endpoint diagnosis sections', async () => {
  const html = await resultHtmlReportToHtml({
    kind: 'performance',
    includeRequestResults: true,
    includeRequestDetails: false,
    result: {
      performanceTestName: 'Custom Performance Bundle',
      type: 'custom',
      completedRequests: 1,
      successfulRequests: 1,
      passed: true,
      summary: {
        requestsPerSecond: 4,
        networkProbe: {
          confidence: 'medium',
          confidenceScore: 74,
          completedChecks: 1,
          requestedChecks: 2,
          phases: [
            { phase: 'probe', requests: 1, concurrency: 1, successfulResponses: 1, failedResponses: 0, averageDurationMillis: 30, p95DurationMillis: 30, requestsPerSecond: 4 }
          ],
          checks: [
            { group: 'Network', label: 'DNS repeatability', status: 'pass', value: 'stable' }
          ]
        }
      },
      samples: [{ resultIndex: 0, requestName: 'Probe', statusCode: 200, durationMillis: 30, passed: true }]
    }
  });

  assert.match(html, /href="#network-probe"/);
  assert.match(html, /href="#network-probe-checks"/);
  assert.match(html, /Network Probe/);
  assert.match(html, /Network Probe Checks/);
  assert.match(html, /Medium \(74 \/ 100\)/);
  assert.match(html, /DNS repeatability/);
  assert.doesNotMatch(html, /Endpoint Diagnosis/);
  assert.doesNotMatch(html, /href="#diagnostic-checks"/);
  assert.ok(html.indexOf('href="#results"') < html.indexOf('href="#network-probe"'));
  assert.ok(html.indexOf('href="#network-probe"') < html.indexOf('href="#network-probe-checks"'));
});

test('result HTML report status filter script filters rows and keeps pagination labels in sync', async () => {
  const html = await resultHtmlReportToHtml({
    kind: 'runner',
    includeRequestDetails: false,
    result: {
      collectionName: 'Filter Runner',
      totalRequests: 2,
      passedRequests: 1,
      failedRequests: 1,
      passed: false,
      resultPage: { statusCounts: { 200: 1 } }
    },
    items: [
      { resultIndex: 0, requestName: 'OK', statusCode: 200, passed: true },
      { resultIndex: 1, requestName: 'Failure', statusCode: 500, passed: false }
    ]
  });
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'Expected report script to be present.');

  const listeners = new Map();
  const rows = [
    fakeReportRow('200'),
    fakeReportRow('500')
  ];
  const statusSelect = fakeReportSelect('all', [
    { value: 'all', textContent: 'All statuses' },
    { value: '200', textContent: '200' }
  ], listeners, 'status');
  const elements = new Map([
    ['resultPageSizeSelect', fakeReportSelect('25', [], listeners, 'pageSize')],
    ['resultStatusFilterSelect', statusSelect],
    ['resultPrevPageButton', fakeReportButton(listeners, 'prev')],
    ['resultNextPageButton', fakeReportButton(listeners, 'next')],
    ['resultPageLabel', { textContent: '' }],
    ['resultRangeLabel', { textContent: '' }],
    ['resultFilterEmptyRow', { hidden: true }]
  ]);

  vm.runInNewContext(script, {
    document: {
      querySelectorAll(selector) {
        return selector === '[data-result-row]' ? rows : [];
      },
      getElementById(id) {
        return elements.get(id) || null;
      },
      createElement() {
        return { value: '', textContent: '' };
      }
    }
  });

  assert.deepEqual(statusSelect.options.map((option) => option.value), ['all', '200', '500']);
  assert.equal(rows[0].hidden, false);
  assert.equal(rows[1].hidden, false);
  assert.equal(elements.get('resultRangeLabel').textContent, '1-2 of 2 results');

  statusSelect.value = '500';
  listeners.get('status:change')();
  assert.equal(rows[0].hidden, true);
  assert.equal(rows[1].hidden, false);
  assert.equal(elements.get('resultRangeLabel').textContent, '1-1 of 1 results');
});

function fakeReportRow(status) {
  return {
    hidden: true,
    getAttribute(name) {
      return name === 'data-result-status' ? status : '';
    }
  };
}

function fakeReportSelect(value, options, listeners, key) {
  return {
    value,
    options,
    disabled: false,
    addEventListener(name, handler) {
      listeners.set(`${key}:${name}`, handler);
    },
    appendChild(option) {
      this.options.push(option);
    }
  };
}

function fakeReportButton(listeners, key) {
  return {
    disabled: false,
    addEventListener(name, handler) {
      listeners.set(`${key}:${name}`, handler);
    }
  };
}
