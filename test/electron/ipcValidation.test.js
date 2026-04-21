const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertCollectionPayload,
  assertExportFormat,
  assertLoadConfigPayload,
  assertLoadId,
  assertLoadResultPayload,
  assertOptionalEnvironmentPayload,
  assertRequestPayload,
  assertWorkspacePayload
} = require('../../src/core/ipcValidation');

test('accepts structurally valid IPC payloads', () => {
  assert.doesNotThrow(() => assertRequestPayload({
    id: 'r1',
    name: 'Request',
    method: 'GET',
    url: 'https://example.test',
    queryParams: [{ enabled: true, key: 'q', value: '1', secret: false }],
    headers: [{ enabled: true, key: 'Accept', value: 'application/json' }],
    bodyType: 'NONE',
    body: '',
    auth: { type: 'bearer', token: 'secret' }
  }));
  assert.doesNotThrow(() => assertCollectionPayload({
    id: 'c1',
    name: 'Collection',
    description: '',
    requests: [],
    folders: [{ id: 'f1', name: 'Folder', requests: [], folders: [] }]
  }));
  assert.doesNotThrow(() => assertWorkspacePayload({
    schemaVersion: 4,
    collections: [],
    environments: [{ id: 'e1', name: 'Env', variables: [{ enabled: true, key: 'token', value: 'secret', secret: true }] }],
    history: []
  }));
  assert.doesNotThrow(() => assertOptionalEnvironmentPayload(null));
  assert.doesNotThrow(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, allowedHosts: ['example.test'], confirmedHighConcurrency: false }));
  assert.doesNotThrow(() => assertLoadResultPayload({ totalRequests: 1 }));
  assert.doesNotThrow(() => assertLoadId('load-1'));
  assert.doesNotThrow(() => assertExportFormat('json'));
});

test('rejects malformed IPC payloads before they reach core services', () => {
  assert.throws(() => assertRequestPayload(null), /Invalid IPC payload: request must be an object/);
  assert.throws(() => assertRequestPayload({ method: 'TRACE', queryParams: [], headers: [], bodyType: 'NONE' }), /request.method is not supported/);
  assert.throws(() => assertRequestPayload({ method: 'GET', queryParams: 'bad', headers: [], bodyType: 'NONE' }), /request.queryParams must be an array/);
  assert.throws(() => assertWorkspacePayload({ collections: {}, environments: [], history: [] }), /workspace.collections must be an array/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: Number.NaN, totalRequests: 1 }), /config.concurrency must be a finite number/);
  assert.throws(() => assertLoadConfigPayload({ concurrency: 1, totalRequests: 1, allowedHosts: [42] }), /config.allowedHosts\[0\] must be a string/);
  assert.throws(() => assertLoadId({ bad: true }), /id must be a string/);
  assert.throws(() => assertExportFormat('xml'), /format must be json or csv/);
});
