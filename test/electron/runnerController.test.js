const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('runner controller imports nested collection requests with stable source metadata', () => {
  const { runner, sandbox, state } = loadRunnerController();
  const collection = {
    id: 'collection-1',
    name: 'Team API',
    requests: [{ id: 'root', name: 'Root request', method: 'post', url: 'https://api.example.test/root' }],
    folders: [{
      id: 'folder-1',
      name: 'Users',
      requests: [{ id: 'nested', name: 'Nested request', method: 'PATCH', url: 'https://api.example.test/users/1' }],
      folders: [{
        id: 'folder-2',
        name: 'Deep',
        requests: [{ id: 'deep', name: 'Deep request', method: 'TRACE', url: '/deep' }]
      }]
    }]
  };

  assert.equal(sandbox.importCollectionIntoRunner(collection), 3);
  assert.equal(runner.requests.length, 3);
  assert.deepEqual(fromVm(runner.requests.map((request) => request.name)), [
    'Root request',
    'Nested request',
    'Deep request'
  ]);
  assert.equal(runner.requests[0].method, 'POST');
  assert.equal(runner.requests[1].method, 'PATCH');
  assert.equal(runner.requests[2].method, 'GET');
  assert.notEqual(runner.requests[0].id, 'root');
  assert.deepEqual(fromVm(runner.requests[2].source), {
    collectionId: 'collection-1',
    collectionName: 'Team API',
    folderId: 'folder-2',
    folderName: 'Deep',
    folderPath: ['Users', 'Deep'],
    requestId: 'deep',
    requestName: 'Deep request'
  });
  assert.equal(state.dirtyCount, 1);
  assert.equal(state.renderCount, 1);
  assert.equal(state.statuses.at(-1), '3 requests imported into runner.');
});

test('runner controller reorders and deletes runner request rows without accepting invalid indexes', () => {
  const { runner, sandbox, state } = loadRunnerController({
    requests: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' }
    ]
  });

  sandbox.moveRunnerRequest(runner, 0, 2);
  assert.deepEqual(fromVm(runner.requests.map((request) => request.id)), ['b', 'c', 'a']);
  sandbox.moveRunnerRequest(runner, -1, 1);
  sandbox.moveRunnerRequest(runner, 1, 99);
  assert.deepEqual(fromVm(runner.requests.map((request) => request.id)), ['b', 'c', 'a']);

  sandbox.deleteRunnerRequest(runner, 1);
  assert.deepEqual(fromVm(runner.requests.map((request) => request.id)), ['b', 'a']);
  sandbox.deleteRunnerRequest(runner, 99);
  assert.deepEqual(fromVm(runner.requests.map((request) => request.id)), ['b', 'a']);
  assert.equal(state.dirtyCount, 2);
  assert.equal(state.renderCount, 2);
});

test('runner controller normalizes request rows, iterations, and refreshing-auth state', () => {
  const { sandbox } = loadRunnerController();

  assert.equal(sandbox.normalizeRunnerRequestIterations(Number.NaN), 1);
  assert.equal(sandbox.normalizeRunnerRequestIterations(-10), 1);
  assert.equal(sandbox.normalizeRunnerRequestIterations(99.9), 50);

  const request = sandbox.normalizeRunnerRequest({
    id: '',
    name: '',
    method: 'delete',
    docs: null,
    iterations: 1000,
    scripts: null,
    auth: { type: 'autoRefresh' },
    refreshingAuthOriginalAuth: { type: 'bearer', token: 'abc' },
    useRefreshingAuthCookie: true
  });
  assert.equal(request.method, 'DELETE');
  assert.equal(request.name, 'Untitled Request');
  assert.equal(request.docs, '');
  assert.equal(request.iterations, 50);
  assert.deepEqual(fromVm(request.scripts), { preRequest: '', tests: '' });
  assert.deepEqual(fromVm(request.refreshingAuthOriginalAuth), { type: 'bearer', token: 'abc' });
  assert.equal(request.useRefreshingAuthCookie, true);
});

function loadRunnerController(options = {}) {
  const state = { dirtyCount: 0, renderCount: 0, statuses: [] };
  const runner = {
    id: 'runner-1',
    name: 'Runner',
    requests: options.requests || []
  };
  const sandbox = {
    AUTO_REFRESH_AUTH_TYPE: 'autoRefresh',
    MAX_RUNNER_REQUEST_ITERATIONS: 50,
    METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    activeRunner: () => runner,
    canOpenAdditionalRunnerTab: () => true,
    collectActiveEditorState() {},
    crypto: { randomUUID: deterministicId },
    ensureOpenRunnerTabForActive() {},
    markActiveRunnerDirty: () => { state.dirtyCount += 1; },
    newRequestObject: (name = 'Untitled Request') => ({
      id: deterministicId(),
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
    newRunnerObject: (name = 'Untitled Runner') => ({ id: deterministicId(), name, requests: [] }),
    normalizeAuthRefreshConfig: (value) => value && typeof value === 'object' ? value : {},
    normalizeCsvVariableDataDefaultOff: (value) => value && typeof value === 'object' ? value : { enabled: false, rows: [] },
    normalizeRefreshingAuthOriginalAuth: (value) => value,
    normalizeResultCapturePolicy: (value) => value && typeof value === 'object' ? value : {},
    renderAll() {},
    renderRunnerEditor: () => { state.renderCount += 1; },
    runnerDisplayName: (item) => item?.name || 'Untitled Runner',
    setStatus: (message) => state.statuses.push(message),
    uniqueName: (base) => base,
    workspace: { environments: [], runners: [runner] }
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/features/runnerController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { runner, sandbox, state };
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

let nextId = 0;
function deterministicId() {
  nextId += 1;
  return `runner-test-id-${nextId}`;
}
