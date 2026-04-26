const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_SCRIPT_LOG_LENGTH, MAX_SCRIPT_LOGS, runPostmanScript } = require('../../src/core/scriptRuntime');

test('runs Postman-style tests and response helpers', () => {
  const result = runPostmanScript(`
    pm.test('status is 200', function () {
      pm.response.to.have.status(200);
      pm.expect(pm.response.json().ok).to.eql(true);
      pm.expect(pm.response.headers.get('content-type')).to.include('json');
    });
  `, {
    response: response()
  });

  assert.equal(result.passed, true);
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].name, 'status is 200');
});

test('captures failing tests without aborting the whole script', () => {
  const result = runPostmanScript(`
    pm.test('fails', function () {
      pm.expect(pm.response.code).to.equal(201);
    });
    pm.test('continues', function () {
      pm.expect('abc').to.contain('b');
    });
  `, {
    response: response()
  });

  assert.equal(result.passed, false);
  assert.equal(result.tests.length, 2);
  assert.equal(result.tests[0].passed, false);
  assert.equal(result.tests[1].passed, true);
});

test('mutates environment and collection variables', () => {
  const environment = { variables: [{ enabled: true, key: 'token', value: 'old' }] };
  const collectionVariables = [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }];

  const result = runPostmanScript(`
    pm.environment.set('token', 'new');
    pm.collectionVariables.set('collectionToken', 'abc');
    pm.test('variables resolve', function () {
      pm.expect(pm.variables.get('token')).to.equal('new');
      pm.expect(pm.variables.replaceIn('{{baseUrl}}/v1')).to.equal('https://api.example.test/v1');
    });
  `, {
    collectionVariables,
    environment
  });

  assert.equal(result.passed, true);
  assert.equal(environment.variables.find((item) => item.key === 'token').value, 'new');
  assert.equal(collectionVariables.find((item) => item.key === 'collectionToken').value, 'abc');
});

test('supports request-local pm.variables overrides', () => {
  const environment = { variables: [{ enabled: true, key: 'token', value: 'env' }] };
  const collectionVariables = [{ enabled: true, key: 'token', value: 'collection' }];
  const localVariables = [{ enabled: true, key: 'token', value: 'local' }];

  const result = runPostmanScript(`
    pm.variables.set('ephemeral', 'value');
    pm.test('local precedence', function () {
      pm.expect(pm.variables.get('token')).to.equal('local');
      pm.expect(pm.variables.replaceIn('{{token}}/{{ephemeral}}')).to.equal('local/value');
    });
  `, {
    collectionVariables,
    environment,
    localVariables
  });

  assert.equal(result.passed, true);
  assert.equal(localVariables.find((item) => item.key === 'ephemeral').value, 'value');
  assert.equal(environment.variables.find((item) => item.key === 'token').value, 'env');
});

test('blocks Node access and dynamic code generation', () => {
  const requireResult = runPostmanScript('require("node:fs");');
  assert.equal(requireResult.passed, false);
  assert.match(requireResult.error, /only supports bundled sandbox packages/);

  const functionResult = runPostmanScript('Function("return 1")();');
  assert.equal(functionResult.passed, false);
  assert.match(functionResult.error, /Code generation/);

  const fetchResult = runPostmanScript('fetch("https://example.test");');
  assert.equal(fetchResult.passed, false);
  assert.match(fetchResult.error, /fetch is not supported/);
});

test('supports bundled Postman-style package loading without Node module access', () => {
  const result = runPostmanScript(`
    const Crypto = pm.require('crypto-js');
    const lodash = require('lodash');
    const uuid = pm.require('uuid');
    pm.test('bundled packages', function () {
      pm.expect(Crypto.SHA256('abc').toString(Crypto.enc.Hex)).to.equal('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      pm.expect(Crypto.enc.Base64.stringify(Crypto.enc.Utf8.parse('hello'))).to.equal('aGVsbG8=');
      pm.expect(lodash.get({ nested: { value: 42 } }, 'nested.value')).to.equal(42);
      pm.expect(lodash.map([{ id: 'a' }, { id: 'b' }], 'id').join(',')).to.equal('a,b');
      const assigned = lodash.assign(null, { ok: true });
      const created = {};
      lodash.set(created, 'nested.value', true);
      pm.expect(uuid.v4()).to.match(/^[0-9a-f-]{36}$/);
      pm.expect(Crypto.SHA256.constructor).to.be.undefined;
      pm.expect(lodash.map.constructor).to.be.undefined;
      pm.expect(assigned.constructor).to.be.undefined;
      pm.expect(created.nested.constructor).to.be.undefined;
    });
  `);

  assert.equal(result.passed, true);
});

test('reports explicit errors for unsupported Postman sandbox APIs', () => {
  const sendRequestResult = runPostmanScript('pm.sendRequest("https://example.test");');
  assert.equal(sendRequestResult.passed, false);
  assert.match(sendRequestResult.error, /pm\.sendRequest is not supported by the PostMeter script runtime yet/);

  const vaultResult = runPostmanScript('pm.vault.get("secret");');
  assert.equal(vaultResult.passed, false);
  assert.match(vaultResult.error, /pm\.vault\.get is not supported by the PostMeter script runtime yet/);
});

test('captures bounded pm.visualizer output', () => {
  const result = runPostmanScript(`
    pm.visualizer.set('<main onclick="bad()"><h1>{{title}}</h1><div>{{{body}}}</div><ol>{{#each rows}}<li data-index="{{@index}}">{{name}}:{{this.status}}</li>{{/each}}</ol><script>bad()</script></main>', {
      title: '<Widget>',
      body: '<strong>ready</strong>',
      rows: [
        { name: '<alpha>', status: 'ready' },
        { name: 'beta', status: 'ok' }
      ]
    });
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<main><h1>&lt;Widget&gt;</h1><div><strong>ready</strong></div><ol><li data-index="0">&lt;alpha&gt;:ready</li><li data-index="1">beta:ok</li></ol></main>');
});

test('supports primitive and object each blocks in pm.visualizer templates', () => {
  const result = runPostmanScript(`
    pm.visualizer.set('<ul>{{#each names}}<li>{{@index}}={{this}}</li>{{/each}}</ul><dl>{{#each totals}}<dt>{{@key}}</dt><dd>{{this}}</dd>{{/each}}</dl>', {
      names: ['red', '<blue>'],
      totals: { pass: 2, fail: 0 }
    });
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<ul><li>0=red</li><li>1=&lt;blue&gt;</li></ul><dl><dt>pass</dt><dd>2</dd><dt>fail</dt><dd>0</dd></dl>');
});

test('times out runaway scripts', () => {
  const result = runPostmanScript('while (true) {}', {}, { timeoutMillis: 20 });

  assert.equal(result.passed, false);
  assert.match(result.error, /Script execution timed out/);
});

test('supports broader Postman-style request, response, and expectation helpers', () => {
  const result = runPostmanScript(`
    pm.test('expanded helpers', function () {
      pm.expect(pm.request.url.toString()).to.include('/widgets');
      pm.expect(pm.request.url.host).to.equal('api.example.test');
      pm.expect(pm.request.url.path).to.deep.equal(['widgets']);
      pm.expect(pm.request.headers.toObject()).to.have.property('X-Trace', 'abc');
      pm.expect(pm.request.body.raw).to.be.a('string').and.not.empty;
      pm.response.to.have.header('content-type', 'application/json');
      pm.response.to.have.body('"ok":true');
      pm.expect(pm.response.size()).to.be.above(0);
      pm.expect(pm.response.json()).to.deep.include({ ok: true });
      pm.expect(pm.response.responseTime).to.be.within(1, 100);
      pm.expect(pm.response.code).to.be.oneOf([200, 201]);
      pm.expect(pm.info.requestName).to.equal('Create widget');
      pm.expect(['red', 'green', 'blue']).to.have.members(['red', 'blue']);
      pm.expect({ ok: true, count: 2 }).to.include({ ok: true });
      pm.expect({ ok: true, count: 2 }).to.have.keys('ok', 'count');
      pm.expect('abc').to.have.length(3);
      pm.expect(null).to.be.null;
      pm.expect(undefined).to.not.exist;
    });
  `, {
    request: {
      id: 'req-1',
      name: 'Create widget',
      method: 'POST',
      url: 'https://api.example.test/widgets?trace=abc',
      headers: [{ enabled: true, key: 'X-Trace', value: 'abc' }],
      body: '{"name":"hammer"}'
    },
    response: response()
  });

  assert.equal(result.passed, true);
});

test('supports additional safe Postman response expectation helpers', () => {
  const result = runPostmanScript(`
    pm.test('response fluent helpers', function () {
      pm.response.to.be.ok();
      pm.response.to.be.success();
      pm.response.to.have.jsonBody('$.ok', true);
      pm.response.to.have.jsonBody('$.items[0].id', 'w1');
    });
  `, {
    response: {
      statusCode: 200,
      durationMillis: 15,
      headers: { 'content-type': ['application/json'] },
      body: '{"ok":true,"items":[{"id":"w1"}]}'
    }
  });
  const failure = runPostmanScript(`
    pm.test('status category fails', function () {
      pm.response.to.be.notFound();
    });
  `, {
    response: response()
  });

  assert.equal(result.passed, true);
  assert.equal(failure.passed, false);
  assert.match(failure.tests[0].error, /not found/);
});

test('bounds script console output in result payloads', () => {
  const result = runPostmanScript(`
    for (let index = 0; index < ${MAX_SCRIPT_LOGS + 10}; index++) {
      console.log('x'.repeat(${MAX_SCRIPT_LOG_LENGTH + 100}));
    }
  `);

  assert.equal(result.passed, true);
  assert.equal(result.logs.length, MAX_SCRIPT_LOGS);
  assert.equal(result.logs[0].length, MAX_SCRIPT_LOG_LENGTH + 3);
  assert.match(result.logs[0], /\.\.\.$/);
});

function response() {
  return {
    statusCode: 200,
    durationMillis: 42,
    headers: { 'content-type': ['application/json'] },
    body: '{"ok":true}'
  };
}
