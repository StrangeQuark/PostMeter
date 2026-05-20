const assert = require('node:assert/strict');
const test = require('node:test');
const {
  cloneRequestForRunner,
  CURRENT_SCHEMA_VERSION,
  MAX_RUNNER_REQUEST_ITERATIONS,
  requestModel,
  runnerModel,
  workspaceModel
} = require('../../src/core/models');
const { normalizeWorkspace } = require('../../src/core/workspacePersistence');
const { migrate } = require('../../src/core/workspaceMigrations');

test('normalizes workspace-owned runners with request clones and none environment support', () => {
  const runner = runnerModel({
    id: 'runner-1',
    name: '  API Smoke  ',
    environmentId: '',
    allowEnvironmentMutation: true,
    stopOnFailure: true,
    authRefresh: {
      enabled: true,
      mode: 'lifetime',
      accessTokenVariable: 'ACCESS_TOKEN',
      request: {
        name: 'Refresh Auth',
        method: 'POST',
        url: 'https://auth.example.test/token'
      },
      refreshTokenRequest: {
        name: 'Rotate Refresh',
        method: 'PUT',
        url: 'https://auth.example.test/refresh-token'
      }
    },
    requests: [{
      id: 'runner-request-1',
      name: 'Request',
      method: 'POST',
      url: ' https://api.example.test ',
      iterations: 5,
      source: {
        collectionId: 'collection-1',
        collectionName: 'Collection',
        requestId: 'source-request',
        requestName: 'Source Request',
        folderPath: ['Folder']
      }
    }]
  });

  assert.equal(runner.name, 'API Smoke');
  assert.equal(runner.environmentId, 'none');
  assert.equal(runner.allowEnvironmentMutation, true);
  assert.equal(runner.stopOnFailure, true);
  assert.equal(runner.authRefresh.enabled, true);
  assert.equal(runner.authRefresh.mode, 'lifetime');
  assert.equal(runner.authRefresh.request.url, 'https://auth.example.test/token');
  assert.equal(runner.authRefresh.refreshTokenRequest.name, 'Rotate Refresh');
  assert.equal(runner.authRefresh.refreshTokenRequest.method, 'PUT');
  assert.equal(runner.authRefresh.refreshTokenRequest.url, 'https://auth.example.test/refresh-token');
  assert.equal(runner.csvVariables.enabled, false);
  assert.equal(runner.requests[0].id, 'runner-request-1');
  assert.equal(runner.requests[0].iterations, 5);
  assert.equal(runner.requests[0].source.requestId, 'source-request');
  assert.deepEqual(runner.requests[0].source.folderPath, ['Folder']);
});

test('runner model defaults CSV variables off but preserves legacy configured CSV data', () => {
  assert.equal(runnerModel().csvVariables.enabled, false);
  assert.equal(runnerModel({ csvVariables: {} }).csvVariables.enabled, false);
  assert.equal(runnerModel({ csvVariables: { schema: 'name', values: 'alice' } }).csvVariables.enabled, true);
});

test('runner model defaults stop-on-failure on while preserving explicit opt out', () => {
  assert.equal(runnerModel().stopOnFailure, true);
  assert.equal(runnerModel({ stopOnFailure: undefined }).stopOnFailure, true);
  assert.equal(runnerModel({ stopOnFailure: true }).stopOnFailure, true);
  assert.equal(runnerModel({ stopOnFailure: false }).stopOnFailure, false);
});

test('runner model preserves original auth for runner requests using refreshing auth', () => {
  const runner = runnerModel({
    requests: [{
      name: 'Uses Refreshing Auth',
      url: 'https://api.example.test/protected',
      auth: { type: 'autoRefresh' },
      refreshingAuthOriginalAuth: { type: 'bearer', token: '{{ACCESS_TOKEN}}' }
    }]
  });

  assert.deepEqual(runner.requests[0].auth, { type: 'autoRefresh' });
  assert.deepEqual(runner.requests[0].refreshingAuthOriginalAuth, {
    type: 'bearer',
    token: '{{ACCESS_TOKEN}}'
  });
});

test('normalizes runner request iterations to a bounded positive integer', () => {
  const runner = runnerModel({
    requests: [
      { name: 'Default', url: 'https://example.test/default' },
      { name: 'Negative', url: 'https://example.test/negative', iterations: -3 },
      { name: 'Fraction', url: 'https://example.test/fraction', iterations: 4.8 },
      { name: 'High', url: 'https://example.test/high', iterations: MAX_RUNNER_REQUEST_ITERATIONS + 1 }
    ]
  });

  assert.deepEqual(runner.requests.map((request) => request.iterations), [
    1,
    1,
    4,
    MAX_RUNNER_REQUEST_ITERATIONS
  ]);
});

test('imports collection requests into runners without mutating source request state', () => {
  const sourceRequest = requestModel({
    id: 'collection-request',
    name: 'Collection Request',
    method: 'GET',
    url: 'https://api.example.test/source',
    headers: [{ enabled: true, key: 'X-Source', value: 'yes' }]
  });

  const runnerRequest = cloneRequestForRunner(sourceRequest, {
    collectionId: 'collection-1',
    collectionName: 'Collection',
    folderPath: ['Folder']
  });
  runnerRequest.headers[0].value = 'runner-only';

  assert.notEqual(runnerRequest.id, sourceRequest.id);
  assert.equal(runnerRequest.source.requestId, 'collection-request');
  assert.equal(runnerRequest.iterations, 1);
  assert.equal(sourceRequest.headers[0].value, 'yes');
});

test('migrates and normalizes workspaces to include first-class runners and performance tests', () => {
  const legacyWorkspace = {
    schemaVersion: 11,
    collections: [],
    environments: [],
    globals: [],
    cookies: [],
    history: []
  };

  assert.equal(migrate(legacyWorkspace), true);
  assert.equal(legacyWorkspace.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(legacyWorkspace.runners, []);
  assert.deepEqual(legacyWorkspace.performanceTests, []);

  const workspace = workspaceModel({
    collections: [],
    environments: [],
    runners: [{ name: 'Runner', requests: [{ name: 'Request', url: 'https://example.test' }] }]
  });
  const normalized = normalizeWorkspace(workspace);

  assert.equal(normalized.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(normalized.runners.length, 1);
  assert.equal(normalized.runners[0].environmentId, 'none');
  assert.deepEqual(normalized.performanceTests, []);
});
