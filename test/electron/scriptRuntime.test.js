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
  assert.match(requireResult.error, /require is not defined/);

  const functionResult = runPostmanScript('Function("return 1")();');
  assert.equal(functionResult.passed, false);
  assert.match(functionResult.error, /Code generation/);
});

test('reports explicit errors for unsupported Postman sandbox APIs', () => {
  const sendRequestResult = runPostmanScript('pm.sendRequest("https://example.test");');
  assert.equal(sendRequestResult.passed, false);
  assert.match(sendRequestResult.error, /pm\.sendRequest is not supported by the PostMeter script runtime yet/);

  const vaultResult = runPostmanScript('pm.vault.get("secret");');
  assert.equal(vaultResult.passed, false);
  assert.match(vaultResult.error, /pm\.vault\.get is not supported by the PostMeter script runtime yet/);

  const visualizerResult = runPostmanScript('pm.visualizer.set("<p>{{x}}</p>", { x: 1 });');
  assert.equal(visualizerResult.passed, false);
  assert.match(visualizerResult.error, /pm\.visualizer\.set is not supported by the PostMeter script runtime yet/);
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
      pm.expect(null).to.be.null;
      pm.expect(undefined).to.not.exist;
    });
  `, {
    request: {
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
