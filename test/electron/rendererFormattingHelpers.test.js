const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTOMATED_UI_SMOKE_QUERY_KEYS,
  formatBytes,
  isAutomatedUiSmokeSearch,
  notificationPayload
} = require('../../src/renderer/ui/rendererUiUtilities');
const {
  createRendererEntityDisplay,
  fileNameFromLocalPath,
  performanceTestDisplayName,
  requestDisplayName,
  runnerDisplayName,
  workspaceDisplayName
} = require('../../src/renderer/features/entityDisplay');
const {
  formatRunnerResult,
  oauthProgressDetail,
  oauthStatusText
} = require('../../src/renderer/formatting/runResultFormatting');
const {
  formatBody,
  formatUrlEncodedBody,
  looksLikeHtml,
  looksLikeUrlEncoded,
  looksLikeXml,
  prettyMarkup
} = require('../../src/renderer/formatting/responseFormatting');

test('renderer UI utilities normalize bytes, notifications, and smoke query flags', () => {
  assert.deepEqual(AUTOMATED_UI_SMOKE_QUERY_KEYS, [
    'uiWorkflowSmoke',
    'uiRegressionSmoke',
    'uiSnapshotSmoke',
    'uiTypographySmoke',
    'uiOauthSmoke',
    'uiHawkSmoke',
    'uiAwsSmoke',
    'uiA11ySmoke',
    'uiAuthMatrixSmoke'
  ]);
  assert.equal(formatBytes(-1), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1024 * 1024 * 5.25), '5.3 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024 * 2.5), '2.50 GB');
  assert.deepEqual(notificationPayload('', 42), { title: 'PostMeter', message: '42' });
  assert.equal(isAutomatedUiSmokeSearch('?uiWorkflowSmoke=1'), true);
  assert.equal(isAutomatedUiSmokeSearch('?uiWorkflowSmoke=0&uiSnapshotSmoke=1'), true);
  assert.equal(isAutomatedUiSmokeSearch('?uiWorkflowSmoke=true'), false);
});

test('renderer entity display helpers use stable names and context fallbacks', () => {
  assert.equal(fileNameFromLocalPath('/tmp/postmeter/example.json'), 'example.json');
  assert.equal(fileNameFromLocalPath('C:\\tmp\\postmeter\\example.json'), 'example.json');
  assert.equal(fileNameFromLocalPath(''), 'file');
  assert.equal(workspaceDisplayName({ name: '  Team APIs  ', path: '/ignored.json' }), 'Team APIs');
  assert.equal(workspaceDisplayName({ path: '/workspaces/local.json' }), 'local');
  assert.equal(workspaceDisplayName({}, '/workspaces/fallback.JSON'), 'fallback');
  assert.equal(workspaceDisplayName({}), 'Workspace');
  assert.equal(requestDisplayName({ name: '  Ping  ' }), 'Ping');
  assert.equal(requestDisplayName({}), 'Untitled Request');
  assert.equal(runnerDisplayName({ name: '  Smoke  ' }), 'Smoke');
  assert.equal(runnerDisplayName({}), 'Untitled Runner');
  assert.equal(performanceTestDisplayName({ name: '  Load  ' }), 'Load');
  assert.equal(performanceTestDisplayName({}), 'Untitled Performance Test');

  const display = createRendererEntityDisplay({
    activeRequest: () => ({ name: 'From context' }),
    activeRunner: () => ({}),
    activePerformanceTest: () => ({ name: 'Perf context' }),
    activeWorkspaceItem: () => ({ path: '/managed/current.json' })
  });
  assert.equal(display.requestDisplayName(), 'From context');
  assert.equal(display.runnerDisplayName(), 'Untitled Runner');
  assert.equal(display.performanceTestDisplayName(), 'Perf context');
  assert.equal(display.workspaceDisplayName(), 'current');
});

test('run result formatting is deterministic and filters disabled variables', () => {
  const formatted = formatRunnerResult({
    collectionName: 'Smoke collection',
    passed: false,
    totalRequests: 2,
    passedRequests: 1,
    failedRequests: 1,
    cancelled: false,
    collectionVariables: [
      { key: 'zeta', value: 'last' },
      { key: 'alpha', value: 'first' },
      { key: 'disabled', value: 'hidden', enabled: false }
    ],
    environment: {
      variables: [{ key: 'env', value: 'value' }]
    },
    results: [
      {
        requestName: 'Create user',
        passed: false,
        statusCode: 500,
        durationMillis: 25,
        error: 'server failed',
        preRequestScriptResult: {
          tests: [{ name: 'prepared', passed: true }]
        },
        testScriptResult: {
          error: 'assertion failed',
          tests: [{ name: 'status ok', passed: false, error: 'expected 200' }]
        },
        localVariables: [
          { key: 'localZ', value: 'z' },
          { key: 'localA', value: 'a' },
          { key: 'off', value: 'hidden', enabled: false }
        ]
      }
    ]
  });

  assert.match(formatted, /Collection: Smoke collection/);
  assert.match(formatted, /FAIL Create user \(500, 25 ms\)/);
  assert.match(formatted, /Error: server failed/);
  assert.match(formatted, /- PASS Pre-request: prepared/);
  assert.match(formatted, /- Tests script error: assertion failed/);
  assert.match(formatted, /- FAIL Tests: status ok \(expected 200\)/);
  assert.ok(formatted.indexOf('localA') < formatted.indexOf('localZ'));
  assert.ok(formatted.indexOf('alpha = first') < formatted.indexOf('zeta = last'));
  assert.equal(formatted.includes('hidden'), false);
});

test('OAuth progress formatting prefers complete verification URLs and defaults status text', () => {
  assert.equal(oauthStatusText({ type: 'device' }), 'Device code: working');
  assert.equal(oauthStatusText({ type: 'pkce', status: 'complete' }), 'Authorization code: complete');
  const detail = oauthProgressDetail({
    message: 'Open browser',
    userCode: 'ABCD-EFGH',
    verificationUri: 'https://example.test/device',
    verificationUriComplete: 'https://example.test/device?user_code=ABCD-EFGH',
    redirectUri: 'postmeter://oauth/callback'
  });
  assert.match(detail, /Open browser/);
  assert.match(detail, /User code: ABCD-EFGH/);
  assert.match(detail, /Verification URL: https:\/\/example\.test\/device\?user_code=ABCD-EFGH/);
  assert.match(detail, /Redirect URI: postmeter:\/\/oauth\/callback/);
  assert.equal(detail.includes('Verification URL: https://example.test/device\n'), false);
});

test('response formatting covers JSON, malformed JSON fallback, markup, and URL-encoded bodies', () => {
  assert.equal(formatBody({ body: '{"z":1,"a":[true]}', headers: { 'content-type': ['application/json'] } }), '{\n  "z": 1,\n  "a": [\n    true\n  ]\n}');
  assert.equal(formatBody({ body: '{"broken"', headers: { 'content-type': ['application/json'] } }), '{"broken"');
  assert.equal(formatBody({ body: 'alpha=one+two&encoded=a%2Fb', headers: { 'content-type': ['application/x-www-form-urlencoded'] } }), 'alpha: one two\nencoded: a/b');
  assert.equal(formatUrlEncodedBody('bad=%E0%A4%A'), 'bad: %E0%A4%A');
  assert.equal(looksLikeUrlEncoded('a=1&b=two'), true);
  assert.equal(looksLikeUrlEncoded('a=1 b=two'), false);
  assert.equal(looksLikeXml('<note><to>Ada</to></note>'), true);
  assert.equal(looksLikeHtml('<section><p>Hello</p></section>'), true);
  assert.equal(prettyMarkup('<root><child>value</child><empty /></root>'), '<root>\n  <child>value</child>\n  <empty />\n</root>');
  assert.equal(formatBody({ body: '<root><child>value</child></root>', headers: { 'content-type': ['application/xml'] } }), '<root>\n  <child>value</child>\n</root>');
});
