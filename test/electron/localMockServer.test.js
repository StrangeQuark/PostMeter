const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { collectionModel, requestModel } = require('../../src/core/workspace/models');
const { importPostmanCollection } = require('../../src/core/import-export/postmanImporter');
const {
  MockStateStore,
  handleLocalMockRequest,
  matchMockRequest,
  startLocalMockServer
} = require('../../src/core/runtime/localMockServer');

function localMockOptions(stateStore) {
  return {
    requireNodePermission: false,
    stateStore,
    timeoutMillis: 1000,
    workerTimeoutMillis: 2000
  };
}

test('matches local mock routes by method and path only with path variables', async () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'get-user',
      method: 'GET',
      name: 'Get user',
      url: 'https://api.example.test/users/:id',
      postman: {
        mockResponses: [{
          id: 'ok-example',
          name: 'User 200',
          statusCode: 200,
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: '{"source":"example"}'
        }]
      },
      scripts: {
        mock: `
          pm.test('mock surface is available', function () {
            pm.expect(pm.mock.matchRequest('get-user', req)).to.equal(true);
            pm.expect(req.params.id).to.equal('42');
            pm.expect(pm.variables.get('id')).to.equal('42');
          });
          pm.mock.sendExample('ok-example', res);
        `
      }
    })]
  });

  const directMatch = matchMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/users/42?ignored=true'
  });
  assert.equal(directMatch.request.id, 'get-user');
  assert.deepEqual(directMatch.pathVariables, { id: '42' });

  const result = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/users/42?ignored=true',
    headers: { 'x-ignored': '1' }
  }, localMockOptions(new MockStateStore()));

  assert.equal(result.matched, true);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body, '{"source":"example"}');
  assert.equal(result.scriptExecution.result.passed, true);
  assert.equal(result.scriptExecution.result.mock.selectedExampleId, 'ok-example');
});

test('matches local mock routes when the saved request uses an unresolved Postman host variable', () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'variable-host',
      method: 'GET',
      name: 'Variable host',
      url: '{{baseUrl}}/widgets/:widgetId'
    })]
  });

  const match = matchMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/widgets/w-1?ignored=true'
  });

  assert.equal(match.request.id, 'variable-host');
  assert.deepEqual(match.pathVariables, { widgetId: 'w-1' });
});

test('matches local mock routes when the saved request uses an unresolved variable inside a URL host', () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'variable-url-host',
      method: 'GET',
      name: 'Variable URL host',
      url: 'https://{{baseUrl}}/widgets/:widgetId'
    })]
  });

  const match = matchMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/widgets/w-2'
  });

  assert.equal(match.request.id, 'variable-url-host');
  assert.deepEqual(match.pathVariables, { widgetId: 'w-2' });
});

test('persists bounded pm.state values across local mock requests and supports reset controls', async () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'state-route',
      method: 'POST',
      name: 'State route',
      url: '/users/:id/events',
      scripts: {
        mock: `
          const count = await pm.state.increment('count');
          await pm.state.set('profile', { id: req.params.id });
          await pm.state.push('events', { id: req.params.id, count });
          const firstAdd = await pm.state.addToSet('roles', 'admin');
          const secondAdd = await pm.state.addToSet('roles', 'admin');
          const keys = await pm.state.keys();
          return {
            status: 201,
            body: {
              count,
              firstAdd,
              secondAdd,
              hasProfile: await pm.state.has('profile'),
              keys,
              roles: await pm.state.get('roles'),
              size: await pm.state.size(),
              snapshot: await pm.state.toObject()
            }
          };
        `
      }
    })]
  });
  const store = new MockStateStore();

  const first = await handleLocalMockRequest(collection, {
    method: 'POST',
    url: 'http://localhost/users/abc/events'
  }, localMockOptions(store));
  const firstBody = JSON.parse(first.response.body);
  assert.equal(first.response.statusCode, 201);
  assert.equal(firstBody.count, 1);
  assert.equal(firstBody.firstAdd, true);
  assert.equal(firstBody.secondAdd, false);
  assert.deepEqual(firstBody.roles, ['admin']);
  assert.equal(firstBody.hasProfile, true);
  assert.deepEqual(firstBody.keys, ['count', 'events', 'profile', 'roles']);

  const second = await handleLocalMockRequest(collection, {
    method: 'POST',
    url: 'http://localhost/users/def/events'
  }, localMockOptions(store));
  assert.equal(JSON.parse(second.response.body).count, 2);
  assert.equal(store.snapshot().events.length, 2);

  store.reset({ seeded: true });
  assert.deepEqual(store.snapshot(), { seeded: true });
  store.clear();
  assert.deepEqual(store.snapshot(), {});
});

test('exposes Postman-style local mock req and res helper surfaces', async () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'mock-helper-route',
      method: 'POST',
      name: 'Mock helper route',
      url: '/users/:id/helpers',
      scripts: {
        mock: `
          pm.test('req helper fields', function () {
            pm.expect(req.method).to.equal('POST');
            pm.expect(req.path).to.equal('/users/abc/helpers');
            pm.expect(req.params.id).to.equal('abc');
            pm.expect(req.query.trace).to.equal('yes');
            pm.expect(req.headers['content-type']).to.include('application/json');
            pm.expect(req.json().ok).to.equal(true);
          });
          res.status(202)
            .set('X-Mock-Helper', 'yes')
            .json({ id: req.params.id, statusCode: res.statusCode, snapshot: res.toJSON() });
        `
      }
    })]
  });

  const result = await handleLocalMockRequest(collection, {
    body: '{"ok":true}',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    url: 'http://localhost/users/abc/helpers?trace=yes'
  }, localMockOptions(new MockStateStore()));
  const payload = JSON.parse(result.response.body);

  assert.equal(result.scriptExecution.result.passed, true);
  assert.equal(result.response.statusCode, 202);
  assert.equal(result.response.headers['X-Mock-Helper'], 'yes');
  assert.deepEqual(payload, {
    id: 'abc',
    snapshot: {
      body: '',
      headers: { 'X-Mock-Helper': 'yes' },
      statusCode: 202
    },
    statusCode: 202
  });
});

test('rolls back pm.state mutations when a local mock script fails', async () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'bad-route',
      method: 'GET',
      url: '/fail',
      scripts: {
        mock: `
          await pm.state.set('shouldRollback', true);
          throw new Error('mock failure');
        `
      }
    })]
  });
  const store = new MockStateStore({ stable: 'yes' });
  const result = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/fail'
  }, localMockOptions(store));

  assert.equal(result.response.statusCode, 500);
  assert.match(result.response.body, /mock failure/);
  assert.deepEqual(store.snapshot(), { stable: 'yes' });
  assert.equal(result.scriptExecution.result.commitSideEffects, false);
});

test('rejects oversized mock state mutations without committing partial state', async () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'oversized-state',
      method: 'GET',
      url: '/oversized-state',
      scripts: {
        mock: `
          await pm.state.set('small', 'committed only if whole phase commits');
          await pm.state.set('huge', 'x'.repeat(70 * 1024));
          return { status: 200, body: { ok: true } };
        `
      }
    })]
  });
  const store = new MockStateStore({ stable: true });
  const result = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/oversized-state'
  }, localMockOptions(store));

  assert.equal(result.response.statusCode, 500);
  assert.match(result.response.body, /pm\.state values cannot exceed/);
  assert.deepEqual(store.snapshot(), { stable: true });
  assert.equal(result.scriptExecution.result.commitSideEffects, false);
});

test('supports pm.state delete and clear methods inside local mock transactions', async () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'delete-clear-state',
      method: 'GET',
      url: '/delete-clear-state',
      scripts: {
        mock: `
          await pm.state.set('deleteMe', 'yes');
          await pm.state.set('keepUntilClear', 'yes');
          const deleted = await pm.state.delete('deleteMe');
          const beforeClear = await pm.state.toObject();
          await pm.state.clear();
          return {
            status: 200,
            body: {
              beforeClear,
              deleted,
              sizeAfterClear: await pm.state.size()
            }
          };
        `
      }
    })]
  });
  const store = new MockStateStore();
  const result = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/delete-clear-state'
  }, localMockOptions(store));
  const body = JSON.parse(result.response.body);

  assert.equal(body.deleted, true);
  assert.deepEqual(body.beforeClear, { keepUntilClear: 'yes' });
  assert.equal(body.sizeAfterClear, 0);
  assert.deepEqual(store.snapshot(), {});
});

test('limits pm.state operation floods per mock script execution', async () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'state-flood',
      method: 'GET',
      url: '/state-flood',
      scripts: {
        mock: `
          for (let i = 0; i < 130; i += 1) {
            await pm.state.set('k' + i, i);
          }
          return { status: 200 };
        `
      }
    })]
  });
  const store = new MockStateStore();
  const result = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/state-flood'
  }, localMockOptions(store));

  assert.equal(result.response.statusCode, 500);
  assert.match(result.response.body, /pm\.state cannot be called more than 128 times/);
  assert.deepEqual(store.snapshot(), {});
});

test('starts a loopback local mock HTTP server with saved-example and fallback responses', async () => {
  const collection = collectionModel({
    requests: [requestModel({
      id: 'server-route',
      method: 'GET',
      url: '/ready',
      postman: {
        mockResponses: [{
          id: 'ready-example',
          name: 'Ready',
          statusCode: 202,
          headers: [{ key: 'X-Mock', value: 'example' }],
          body: 'ready'
        }]
      }
    })]
  });
  const server = await startLocalMockServer(collection, { requireNodePermission: false });
  try {
    const ready = await httpRequest(`${server.url}/ready?query=ignored`);
    assert.equal(ready.statusCode, 202);
    assert.equal(ready.headers['x-mock'], 'example');
    assert.equal(ready.body, 'ready');

    const missing = await httpRequest(`${server.url}/missing`);
    assert.equal(missing.statusCode, 404);
    assert.match(missing.body, /Route not matched/);
  } finally {
    await server.close();
  }
});

test('runs imported Postman local mock script fixture through the mock surface', async () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../fixtures/postman/local-mock-scripts.collection.json'),
    'utf8'
  ));
  const collection = importPostmanCollection(fixture);
  const store = new MockStateStore();

  const ok = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/users/123?ignored=true'
  }, localMockOptions(store));
  assert.equal(ok.response.statusCode, 200);
  assert.equal(JSON.parse(ok.response.body).name, 'Avery');
  assert.deepEqual(store.snapshot(), { hits: 1, seenUsers: ['123'] });

  const missing = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/users/missing'
  }, localMockOptions(store));
  assert.equal(missing.response.statusCode, 404);
  assert.equal(JSON.parse(missing.response.body).hits, 2);
  assert.deepEqual(store.snapshot(), { hits: 2, seenUsers: ['123', 'missing'] });
});

function httpRequest(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          body,
          headers: response.headers,
          statusCode: response.statusCode
        });
      });
    });
    request.on('error', reject);
  });
}
