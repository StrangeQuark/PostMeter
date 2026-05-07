const assert = require('node:assert/strict');
const test = require('node:test');
const {
  cloneRequestForRunner,
  CURRENT_SCHEMA_VERSION,
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
    requests: [{
      id: 'runner-request-1',
      name: 'Request',
      method: 'POST',
      url: ' https://api.example.test ',
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
  assert.equal(runner.requests[0].id, 'runner-request-1');
  assert.equal(runner.requests[0].source.requestId, 'source-request');
  assert.deepEqual(runner.requests[0].source.folderPath, ['Folder']);
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
