const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareExport } = require('../../electron/workers/exportPreparationWorker');
const {
  performanceTestModel,
  runnerModel,
  workspaceModel
} = require('../../src/core/workspace/models');

test('export preparation worker prepares every supported definition kind', () => {
  const request = {
    id: 'request-1',
    name: 'Get Widget',
    method: 'GET',
    url: 'https://api.example.test/widgets',
    queryParams: [{ enabled: true, key: 'trace', value: 'yes' }],
    headers: [],
    bodyType: 'NONE',
    scripts: { preRequest: '', tests: '' }
  };
  const collection = {
    id: 'collection-1',
    name: 'Widgets',
    requests: [request],
    folders: []
  };
  const environment = {
    id: 'environment-1',
    name: 'Local',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }]
  };
  const runner = runnerModel({
    id: 'runner-1',
    name: 'Smoke Runner',
    requests: [request]
  });
  const performanceTest = performanceTestModel({
    id: 'performance-1',
    name: 'Endpoint Diagnosis',
    type: 'diagnosis',
    request
  });
  const workspace = workspaceModel({
    collections: [collection],
    environments: [environment],
    runners: [runner],
    performanceTests: [performanceTest]
  });

  const workspaceExport = prepareExport({ kind: 'workspace', payload: workspace });
  assert.equal(workspaceExport.prefix, 'postmeter-workspace-export');
  assert.equal(JSON.parse(workspaceExport.content).collections[0].name, 'Widgets');

  const collectionExport = prepareExport({ kind: 'collection', format: 'postmeter', payload: collection });
  assert.equal(collectionExport.prefix, 'postmeter-collection-export');
  assert.equal(JSON.parse(collectionExport.content).collections[0].requests[0].name, 'Get Widget');

  const requestExport = prepareExport({ kind: 'request', format: 'curl', payload: request });
  assert.equal(requestExport.prefix, 'postmeter-request-export');
  assert.match(requestExport.content, /curl 'https:\/\/api\.example\.test\/widgets\?trace=yes'/);

  const environmentExport = prepareExport({ kind: 'environment', format: 'postman', payload: environment });
  assert.equal(environmentExport.prefix, 'postmeter-environment-export');
  assert.equal(JSON.parse(environmentExport.content).values[0].key, 'baseUrl');

  const runnerExport = prepareExport({ kind: 'runner', format: 'postmeter', payload: runner });
  assert.equal(runnerExport.prefix, 'postmeter-runner-definition-export');
  assert.equal(JSON.parse(runnerExport.content).runner.name, 'Smoke Runner');

  const performanceExport = prepareExport({ kind: 'performance', format: 'postmeter', payload: performanceTest });
  assert.equal(performanceExport.prefix, 'postmeter-performance-export');
  assert.equal(JSON.parse(performanceExport.content).performanceTest.name, 'Endpoint Diagnosis');
});

test('export preparation worker rejects unsupported kinds, formats, and malformed payloads', () => {
  assert.throws(
    () => prepareExport({ kind: 'unknown', payload: {} }),
    /Unsupported export kind/
  );
  assert.throws(
    () => prepareExport({ kind: 'request', format: 'postman', payload: { id: 'r', name: 'R', method: 'GET', url: 'https://example.test' } }),
    /Request export format must be postmeter or curl/
  );
  assert.throws(
    () => prepareExport({ kind: 'environment', format: 'curl', payload: { id: 'e', name: 'E', variables: [] } }),
    /Environment export format must be postmeter or postman/
  );
  assert.throws(
    () => prepareExport({ kind: 'runner', format: 'json', payload: runnerModel({ id: 'runner-1', name: 'Runner' }) }),
    /Runner definitions can only be exported as PostMeter JSON/
  );
  assert.throws(
    () => prepareExport({ kind: 'performance', format: 'html', payload: performanceTestModel({ id: 'p', name: 'Perf' }) }),
    /Performance test definitions can only be exported as JSON/
  );
  assert.throws(
    () => prepareExport({ kind: 'collection', format: 'postmeter', payload: { id: 'c', name: 'C', requests: 'not-array', folders: [] } }),
    /collection\.requests must be an array/
  );
});
