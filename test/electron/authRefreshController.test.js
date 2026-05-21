const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { normalizeAuthRefreshConfig } = require('../../src/core/workspace/models');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('auth refresh controls collect type-specific output sources, schedule, and failure policy', () => {
  const { elements, sandbox } = loadAuthRefreshController();
  elements.get('runnerAuthRefreshTypeSelect').value = 'aws';
  elements.get('runnerAuthRefreshAwsCredentialsSourceSelect').value = 'rawBody';
  elements.get('runnerAuthRefreshAwsAccessKeyVariableInput').value = 'AWS_ACCESS_KEY_ID';
  elements.get('runnerAuthRefreshAwsSecretKeyVariableInput').value = 'AWS_SECRET_ACCESS_KEY';
  elements.get('runnerAuthRefreshAwsSessionTokenVariableInput').value = 'AWS_SESSION_TOKEN';
  elements.get('runnerAuthRefreshIntervalSecondsInput').value = '1200';
  elements.get('runnerAuthRefreshFailurePolicySelect').value = 'continue';
  elements.get('runnerAuthRefreshBeforeRunInput').checked = false;

  const config = sandbox.collectAuthRefreshFromControls('runner', {
    enabled: true,
    authType: 'bearer',
    request: { id: 'auth-request', name: 'Auth', method: 'POST', url: 'https://api.example.test/auth' }
  });

  assert.equal(config.enabled, true);
  assert.equal(config.authType, 'aws');
  assert.equal(config.refreshIntervalSeconds, 1200);
  assert.equal(config.refreshBeforeRun, false);
  assert.equal(config.failurePolicy, 'continue');
  assert.deepEqual(fromVm(config.outputs), [
    { slot: 'awsAccessKey', source: 'rawBody', path: '$body', variable: 'AWS_ACCESS_KEY_ID' },
    { slot: 'awsSecretKey', source: 'rawBody', path: '$body', variable: 'AWS_SECRET_ACCESS_KEY' },
    { slot: 'awsSessionToken', source: 'rawBody', path: '$body', variable: 'AWS_SESSION_TOKEN' }
  ]);
  assert.equal(elements.get('runnerAuthRefreshAccessTokenPathField').hidden, false);
});

test('auth refresh renderer toggles runner request bearer and cookie refresh without losing original auth', () => {
  const { sandbox, state } = loadAuthRefreshController();
  const bearerRunner = {
    id: 'runner-1',
    authRefresh: { enabled: true, authType: 'bearer' },
    requests: [{
      id: 'request-1',
      name: 'Protected',
      auth: { type: 'bearer', token: 'static-token' },
      cookieJar: { enabled: false, storeResponses: true }
    }]
  };
  const bearerRequest = bearerRunner.requests[0];
  assert.equal(sandbox.setRunnerRequestRefreshingAccessToken(bearerRunner, bearerRequest, true), true);
  assert.deepEqual(fromVm(bearerRequest.auth), { type: 'autoRefresh' });
  assert.deepEqual(fromVm(bearerRequest.refreshingAuthOriginalAuth), { type: 'bearer', token: 'static-token' });

  sandbox.setRunnerRequestRefreshingAccessToken(bearerRunner, bearerRequest, false);
  assert.deepEqual(fromVm(bearerRequest.auth), { type: 'bearer', token: 'static-token' });
  assert.equal(bearerRequest.refreshingAuthOriginalAuth, undefined);

  const cookieRunner = {
    id: 'runner-2',
    authRefresh: { enabled: true, authType: 'cookie' },
    requests: [{
      id: 'request-2',
      name: 'Cookie protected',
      auth: { type: 'basic', username: 'user', password: 'pass' },
      cookieJar: { enabled: false, storeResponses: false }
    }]
  };
  const cookieRequest = cookieRunner.requests[0];
  sandbox.setRunnerRequestRefreshingAccessToken(cookieRunner, cookieRequest, true);
  assert.deepEqual(fromVm(cookieRequest.auth), { type: 'none' });
  assert.equal(cookieRequest.useRefreshingAuthCookie, true);
  assert.deepEqual(fromVm(cookieRequest.cookieJar), { enabled: true, storeResponses: true });

  sandbox.setRunnerRequestRefreshingAccessToken(cookieRunner, cookieRequest, false);
  assert.deepEqual(fromVm(cookieRequest.auth), { type: 'basic', username: 'user', password: 'pass' });
  assert.equal(cookieRequest.useRefreshingAuthCookie, undefined);
  assert.equal(state.dirtyCount, 4);
  assert.equal(state.renderCount, 8);
});

test('auth refresh request normalization strips runner-only fields and defaults invalid request methods', () => {
  const { sandbox } = loadAuthRefreshController();
  const request = sandbox.normalizeAuthRefreshRequest({
    id: '',
    name: '',
    method: 'TRACE',
    url: 'https://api.example.test/auth',
    iterations: 99,
    source: { collectionId: 'collection-1' },
    docs: null,
    scripts: null
  });

  assert.match(request.id, /^auth-refresh-id-/);
  assert.equal(request.name, 'Refresh Auth');
  assert.equal(request.method, 'POST');
  assert.equal(request.docs, '');
  assert.equal(request.iterations, undefined);
  assert.equal(request.source, undefined);
  assert.deepEqual(fromVm(request.scripts), { preRequest: '', tests: '' });
});

function loadAuthRefreshController() {
  const elements = createAuthRefreshElements('runner');
  const state = { dirtyCount: 0, renderCount: 0 };
  let nextId = 0;
  const sandbox = {
    $: (id) => elements.get(id) || null,
    AUTH_REFRESH_OUTPUT_PATH_LABELS: {
      AccessToken: { body: 'Access Token Path', rawBody: 'Raw Body' },
      RefreshToken: { body: 'Refresh Token Path', rawBody: 'Raw Body' },
      ApiKey: { body: 'API Key Path', rawBody: 'Raw Body' },
      AwsAccessKey: { body: 'AWS Access Key Path', rawBody: 'Raw Body' },
      AwsSecretKey: { body: 'AWS Secret Key Path', rawBody: 'Raw Body' },
      AwsSessionToken: { body: 'AWS Session Token Path', rawBody: 'Raw Body' },
      Custom: { body: 'Custom Path', rawBody: 'Raw Body' }
    },
    AUTH_REFRESH_OUTPUT_SOURCE_VALUES: new Set(['body', 'header', 'cookie', 'rawBody']),
    AUTH_REFRESH_RAW_BODY_PATH: '$body',
    AUTO_REFRESH_AUTH_TYPE: 'autoRefresh',
    AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE: 'autoRefreshRefreshToken',
    AUTO_REFRESH_SUPPORTED_AUTH_TYPES: new Set(['bearer', 'apiKey', 'cookie', 'aws', 'custom']),
    METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    activeEnvironment: () => ({ variables: [{ enabled: true, key: 'TOKEN', value: 'abc' }] }),
    cloneJson: (value) => JSON.parse(JSON.stringify(value)),
    crypto: { randomUUID: () => `auth-refresh-id-${++nextId}` },
    document: {
      createElement: (tagName) => new FakeElement(tagName),
      querySelectorAll: () => []
    },
    markActiveRunnerDirty: () => { state.dirtyCount += 1; },
    newRequestObject: (name = 'Untitled Request') => ({
      id: `auth-refresh-id-${++nextId}`,
      name,
      method: 'GET',
      url: '',
      queryParams: [],
      headers: [],
      variables: [],
      scripts: { preRequest: '', tests: '' },
      auth: { type: 'none' },
      docs: ''
    }),
    normalizeAuthRefreshConfig,
    normalizeRendererRequestTlsSettings: (value = {}) => value,
    positionAuthRefreshPanel() {},
    positionVisibleAuthRefreshPanel() {},
    requestAnimationFrame: (callback) => callback(),
    renderRequestTabs: () => { state.renderCount += 1; },
    renderRunnerEditor: () => { state.renderCount += 1; },
    requestMethodText: (request) => String(request?.method || 'GET').toUpperCase(),
    setChecked: (id, value) => {
      const element = elements.get(id);
      if (element) {
        element.checked = value === true;
      }
    },
    setText: (id, value) => {
      const element = elements.get(id);
      if (element) {
        element.textContent = String(value || '');
      }
    },
    setValue: (id, value) => {
      const element = elements.get(id);
      if (element) {
        element.value = String(value ?? '');
      }
    },
    syncVisibleRefreshingAuthTypeOptionsForOwner() {},
    window: {
      PostMeterAuthModel: {
        normalizePersistedAuth: (auth) => auth && typeof auth === 'object' ? auth : { type: 'none' }
      }
    },
    workspace: {}
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/features/authRefreshController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, sandbox, state };
}

function createAuthRefreshElements(prefix) {
  const ids = [
    'AuthRefreshPanel',
    'AuthRefreshTypeSelect',
    'AuthRefreshAccessTokenVariableInput',
    'AuthRefreshRefreshTokenVariableInput',
    'AuthRefreshAccessTokenPathInput',
    'AuthRefreshRefreshTokenPathInput',
    'AuthRefreshApiKeyLocationSelect',
    'AuthRefreshApiKeyNameInput',
    'AuthRefreshApiKeyPathInput',
    'AuthRefreshCookieNameInput',
    'AuthRefreshCookieVariableInput',
    'AuthRefreshAwsAccessKeyVariableInput',
    'AuthRefreshAwsAccessKeyPathInput',
    'AuthRefreshAwsSecretKeyVariableInput',
    'AuthRefreshAwsSecretKeyPathInput',
    'AuthRefreshAwsSessionTokenVariableInput',
    'AuthRefreshAwsSessionTokenPathInput',
    'AuthRefreshAwsCredentialsSourceSelect',
    'AuthRefreshCustomVariableInput',
    'AuthRefreshCustomPathInput',
    'AuthRefreshIntervalSecondsInput',
    'AuthRefreshFailurePolicySelect',
    'AuthRefreshBeforeRunInput',
    'AuthRefreshVariableList',
    'AuthRefreshHelpText',
    'AuthRefreshAccessTokenVariableLabel',
    'AuthRefreshAccessTokenPathLabel',
    'AuthRefreshRequestSummary',
    'AuthRefreshTokenRequestSummary',
    'AuthRefreshButton',
    'ToggleAuthRefreshButton',
    'EditAuthRefreshButton',
    'AuthRefreshOpenRequestButton',
    'AuthRefreshAutoDetectRequestButton',
    'AuthRefreshRemoveRequestButton',
    'AuthRefreshTokenOpenRequestButton',
    'AuthRefreshTokenAutoDetectRequestButton',
    'AuthRefreshTokenRemoveRequestButton'
  ];
  for (const controlName of ['AccessToken', 'RefreshToken', 'ApiKey', 'Custom']) {
    ids.push(`AuthRefresh${controlName}SourceSelect`);
    ids.push(`AuthRefresh${controlName}PathField`);
    ids.push(`AuthRefresh${controlName}PathLabel`);
  }
  for (const controlName of ['AwsAccessKey', 'AwsSecretKey', 'AwsSessionToken']) {
    ids.push(`AuthRefresh${controlName}PathField`);
    ids.push(`AuthRefresh${controlName}PathLabel`);
  }
  return new Map(ids.map((suffix) => [`${prefix}${suffix}`, new FakeElement()]));
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeElement {
  constructor(tagName = 'div') {
    this.checked = false;
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.tagName = tagName.toUpperCase();
    this.textContent = '';
    this.value = '';
    this.classList = { toggle() {} };
  }

  append(...children) {
    this.children.push(...children.flat());
  }

  querySelectorAll() {
    return [];
  }

  setAttribute(name, value) {
    this[name] = String(value);
  }
}
