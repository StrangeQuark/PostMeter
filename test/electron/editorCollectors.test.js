const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('editor collectors map request DOM controls to request model fields', () => {
  const { elements, sandbox } = loadEditorCollectors();
  const request = { settings: { sslCertificateVerification: 'inherit' } };
  const context = {
    scope: 'request',
    bodyPrefix: '',
    methodSelectId: 'method',
    urlInputId: 'url',
    preRequestScriptInputId: 'pre',
    testScriptInputId: 'tests',
    docsInputId: 'docs',
    cookieJarEnabledInputId: 'cookieEnabled',
    cookieJarStoreInputId: 'cookieStore',
    autoHeaderTokenInputId: 'autoToken',
    autoHeaderShowInputId: 'autoShow',
    paramsTableId: 'params',
    headersTableId: 'headers'
  };

  elements.get('method').value = 'patch';
  elements.get('url').value = '  https://api.example.test/users  ';
  elements.get('pre').value = 'pm.variables.set("ready", true);';
  elements.get('tests').value = 'pm.test("ok", function () {});';
  elements.get('docs').value = '## Request docs';
  elements.get('cookieEnabled').checked = true;
  elements.get('cookieStore').checked = false;
  elements.get('autoToken').checked = true;
  elements.get('autoShow').checked = true;
  elements.get('requestSslCertificateVerificationInput').checked = false;
  elements.get('requestSslCertificateVerificationInput').dataset.verificationValue = 'enabled';
  elements.get('requestHttpVersionSelect').value = 'http2';
  elements.get('requestMaxRedirectsInput').value = '7';
  elements.set('params', table([
    [true, 'q', 'search'],
    [false, 'disabled', 'hidden']
  ]));
  elements.set('headers', table([[true, 'Accept', 'application/json']]));

  let afterAuthCalled = false;
  let refreshingApplied = false;
  sandbox.collectRequestFieldsFromEditorContext(context, request, {
    auth: { type: 'bearer', token: 'abc' },
    collectDocs: true,
    afterAuth: () => { afterAuthCalled = true; },
    applyRefreshingCookieState: () => { refreshingApplied = true; }
  });

  assert.equal(request.method, 'PATCH');
  assert.equal(request.url, 'https://api.example.test/users');
  assert.deepEqual(fromVm(request.auth), { type: 'bearer', token: 'abc' });
  assert.equal(request.bodyType, 'RAW_JSON');
  assert.deepEqual(fromVm(request.scripts), {
    preRequest: 'pm.variables.set("ready", true);',
    tests: 'pm.test("ok", function () {});'
  });
  assert.equal(request.docs, '## Request docs');
  assert.deepEqual(fromVm(request.cookieJar), { enabled: true, storeResponses: false });
  assert.deepEqual(fromVm(request.autoHeaders), { sendPostMeterToken: true, showGeneratedHeaders: true });
  assert.deepEqual(fromVm(request.queryParams), [
    { enabled: true, key: 'q', value: 'search' },
    { enabled: false, key: 'disabled', value: 'hidden' }
  ]);
  assert.deepEqual(fromVm(request.headers), [
    { enabled: true, key: 'Accept', value: 'application/json' }
  ]);
  assert.equal(request.settings.sslCertificateVerification, 'enabled');
  assert.equal(request.settings.httpVersion, 'http2');
  assert.equal(request.settings.maxRedirects, 7);
  assert.equal(afterAuthCalled, true);
  assert.equal(refreshingApplied, true);
});

test('editor collectors normalize runner iterations and refreshing auth request state', () => {
  const { elements, sandbox } = loadEditorCollectors();
  const runner = {
    requests: [
      { iterations: 1 },
      { iterations: 2 },
      { iterations: 3 }
    ]
  };
  const requestList = new FakeElement('div');
  requestList.rows = [
    runnerRow(0, '5'),
    runnerRow(1, '500'),
    runnerRow(99, '7')
  ];
  requestList.querySelectorAll = () => requestList.rows;
  elements.set('runnerRequestList', requestList);

  assert.equal(sandbox.collectRunnerRequestIterationsFromEditor(runner), true);
  assert.deepEqual(runner.requests.map((request) => request.iterations), [5, 50, 3]);
  assert.equal(requestList.rows[1].input.value, '50');

  const cookieRequest = {
    auth: { type: 'cookie', jar: 'original' },
    cookieJar: { enabled: false, storeResponses: false }
  };
  assert.equal(sandbox.autoSelectRefreshingAuthAccessTokenForRequest(cookieRequest, {
    enabled: true,
    authType: 'cookie'
  }), true);
  assert.deepEqual(fromVm(cookieRequest.refreshingAuthOriginalAuth), { type: 'cookie', jar: 'original' });
  assert.deepEqual(fromVm(cookieRequest.auth), { type: 'none' });
  assert.deepEqual(fromVm(cookieRequest.cookieJar), { enabled: true, storeResponses: true });
  assert.equal(cookieRequest.useRefreshingAuthCookie, true);

  const bearerRequest = { auth: { type: 'bearer', token: 'abc' } };
  assert.equal(sandbox.autoSelectRefreshingAuthAccessTokenForRequest(bearerRequest, {
    enabled: true,
    authType: 'bearer'
  }), true);
  assert.equal(bearerRequest.refreshingAuthOriginalAuth, undefined);
  assert.deepEqual(fromVm(bearerRequest.auth), { type: 'autoRefresh' });
});

function loadEditorCollectors() {
  const elements = new Map([
    ['method', new FakeElement('select')],
    ['url', new FakeElement('input')],
    ['pre', new FakeElement('textarea')],
    ['tests', new FakeElement('textarea')],
    ['docs', new FakeElement('textarea')],
    ['cookieEnabled', new FakeElement('input')],
    ['cookieStore', new FakeElement('input')],
    ['autoToken', new FakeElement('input')],
    ['autoShow', new FakeElement('input')],
    ['requestSslCertificateVerificationInput', new FakeElement('input')],
    ['requestHttpVersionSelect', new FakeElement('select')],
    ['requestFollowRedirectsInput', checkedElement(true)],
    ['requestFollowOriginalHttpMethodInput', checkedElement(false)],
    ['requestFollowAuthorizationHeaderInput', checkedElement(false)],
    ['requestRemoveRefererHeaderOnRedirectInput', checkedElement(false)],
    ['requestStrictHttpParserInput', checkedElement(true)],
    ['requestEncodeUrlAutomaticallyInput', checkedElement(true)],
    ['requestMaxRedirectsInput', new FakeElement('input')],
    ['requestUseServerCipherSuiteDuringHandshakeInput', checkedElement(false)],
    ['requestDisabledTlsProtocolsInput', new FakeElement('textarea')],
    ['requestCipherSuiteSelectionInput', new FakeElement('textarea')]
  ]);
  const sandbox = {
    AUTO_REFRESH_AUTH_TYPE: 'autoRefresh',
    AUTO_REFRESH_SUPPORTED_AUTH_TYPES: new Set(['bearer', 'cookie']),
    METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    collectAuthFromEditor: () => ({ type: 'none' }),
    collectPerformanceAuthFromEditor: () => ({ type: 'none' }),
    document: {},
    normalizeRendererHttpVersion: (value) => value === 'http2' ? 'http2' : 'auto',
    normalizeRendererMaxRedirects: (value) => Math.min(50, Math.max(0, Number.parseInt(value, 10) || 0)),
    normalizeRendererRequestSslVerification: (value) => ['enabled', 'disabled', 'inherit'].includes(value) ? value : 'inherit',
    normalizeRendererRequestTlsSettings: (settings = {}) => ({
      sslCertificateVerification: settings.sslCertificateVerification || 'inherit',
      httpVersion: settings.httpVersion || 'auto',
      followRedirects: settings.followRedirects !== false,
      followOriginalHttpMethod: settings.followOriginalHttpMethod === true,
      followAuthorizationHeader: settings.followAuthorizationHeader === true,
      removeRefererHeaderOnRedirect: settings.removeRefererHeaderOnRedirect === true,
      strictHttpParser: settings.strictHttpParser !== false,
      encodeUrlAutomatically: settings.encodeUrlAutomatically !== false,
      maxRedirects: settings.maxRedirects == null ? 10 : Number(settings.maxRedirects),
      useServerCipherSuiteDuringHandshake: settings.useServerCipherSuiteDuringHandshake === true,
      disabledTlsProtocols: settings.disabledTlsProtocols || [],
      cipherSuiteSelection: settings.cipherSuiteSelection || ''
    }),
    normalizeRendererSettingsText: (value) => Array.isArray(value) ? value : String(value || '').split(/[\s,]+/).filter(Boolean),
    normalizeRefreshingAuthOriginalAuth: (value) => JSON.parse(JSON.stringify(value || { type: 'none' })),
    normalizeRunnerRequestIterations: (value) => Math.min(50, Math.max(1, Number.parseInt(value, 10) || 1)),
    requestSettingsControlIds: () => ({
      sslCertificateVerification: 'requestSslCertificateVerificationInput',
      httpVersion: 'requestHttpVersionSelect',
      followRedirects: 'requestFollowRedirectsInput',
      followOriginalHttpMethod: 'requestFollowOriginalHttpMethodInput',
      followAuthorizationHeader: 'requestFollowAuthorizationHeaderInput',
      removeRefererHeaderOnRedirect: 'requestRemoveRefererHeaderOnRedirectInput',
      strictHttpParser: 'requestStrictHttpParserInput',
      encodeUrlAutomatically: 'requestEncodeUrlAutomaticallyInput',
      maxRedirects: 'requestMaxRedirectsInput',
      useServerCipherSuiteDuringHandshake: 'requestUseServerCipherSuiteDuringHandshakeInput',
      disabledTlsProtocols: 'requestDisabledTlsProtocolsInput',
      cipherSuiteSelection: 'requestCipherSuiteSelectionInput'
    }),
    requestSettingsScopeFromInputId: () => 'request',
    syncRequestBodyFieldsFromEditor: (_prefix, request) => {
      request.body = '{"ok":true}';
      request.bodyType = 'RAW_JSON';
      request.postmanBody = { mode: 'raw', raw: '{"ok":true}' };
    },
    $: (id) => elements.get(id) || null
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/app/editorCollectors.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, sandbox };
}

function table(rows) {
  const container = new FakeElement('div');
  container.rows = rows.map((row) => {
    const element = new FakeElement('div');
    element.className = 'kv-row';
    element.dataset = {};
    element.inputs = [
      checkedElement(row[0]),
      valueElement(row[1]),
      valueElement(row[2])
    ];
    element.querySelectorAll = () => element.inputs;
    return element;
  });
  container.querySelectorAll = () => container.rows;
  return container;
}

function runnerRow(index, value) {
  const row = new FakeElement('div');
  row.dataset.runnerRequestIndex = String(index);
  row.input = valueElement(value);
  row.querySelector = (selector) => selector === '.runner-row-iterations input' ? row.input : null;
  return row;
}

function checkedElement(checked) {
  const element = new FakeElement('input');
  element.checked = checked;
  return element;
}

function valueElement(value) {
  const element = new FakeElement('input');
  element.value = value;
  return element;
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeElement {
  constructor(tagName = 'div') {
    this.checked = false;
    this.className = '';
    this.dataset = {};
    this.hidden = false;
    this.tagName = tagName.toUpperCase();
    this.textContent = '';
    this.value = '';
  }

  querySelectorAll() {
    return [];
  }
}
