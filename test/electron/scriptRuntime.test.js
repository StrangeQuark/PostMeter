const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_SCRIPT_LOG_LENGTH,
  MAX_SCRIPT_LOGS,
  runPostmanScript,
  scriptPackageIntegrity
} = require('../../src/core/scriptRuntime');

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

  const registryResult = runPostmanScript("pm.require('npm:left-pad@1.3.0');");
  assert.equal(registryResult.passed, false);
  assert.match(registryResult.error, /not installed in the reviewed package cache/);

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
      pm.expect(assigned.ok).to.equal(true);
      const safeAssigned = lodash.assign({}, JSON.parse('{"__proto__":{"polluted":true},"constructor":"bad","safe":"ok"}'));
      pm.expect(safeAssigned.safe).to.equal('ok');
      pm.expect(safeAssigned.polluted).to.be.undefined;
      pm.expect(safeAssigned.constructor).to.be.undefined;
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

test('supports exact reviewed team and external package bundles without Node access', () => {
  const teamSource = `
    const lodash = require('lodash');
    exports.label = function (value) { return lodash.get(value, 'name') + ':team'; };
  `;
  const npmSource = `
    const team = require('@postmeter/team-utils');
    module.exports = function (value) { return team.label(value).toUpperCase(); };
  `;
  const result = runPostmanScript(`
    const team = pm.require('@postmeter/team-utils');
    const npmPackage = pm.require('npm:@postmeter/example@1.2.3');
    pm.test('reviewed package cache', function () {
      pm.expect(team.label({ name: 'Ada' })).to.equal('Ada:team');
      pm.expect(npmPackage({ name: 'Ada' })).to.equal('ADA:TEAM');
      pm.expect(team.label.constructor).to.be.undefined;
      pm.expect(npmPackage.constructor).to.be.undefined;
    });
  `, {
    sandboxPackages: [
      {
        specifier: '@postmeter/team-utils',
        source: teamSource,
        integrity: scriptPackageIntegrity(teamSource),
        dependencies: ['lodash']
      },
      {
        specifier: 'npm:@postmeter/example@1.2.3',
        source: npmSource,
        integrity: scriptPackageIntegrity(npmSource),
        dependencies: ['@postmeter/team-utils']
      }
    ]
  });

  assert.equal(result.passed, true);

  const deniedDependency = runPostmanScript("pm.require('@postmeter/bad');", {
    sandboxPackages: [{
      specifier: '@postmeter/bad',
      source: "require('lodash'); module.exports = {};",
      integrity: scriptPackageIntegrity("require('lodash'); module.exports = {};"),
      dependencies: []
    }]
  });
  assert.equal(deniedDependency.passed, false);
  assert.match(deniedDependency.error, /undeclared dependency/);

  const invalidIntegrity = runPostmanScript('pm.test("noop", function () {});', {
    sandboxPackages: [{
      specifier: 'npm:@postmeter/example@1.2.3',
      source: npmSource,
      integrity: 'sha256-invalid',
      dependencies: []
    }]
  });
  assert.equal(invalidIntegrity.passed, false);
  assert.match(invalidIntegrity.error, /integrity does not match/);

  const missingDependencySource = 'module.exports = {};';
  const missingDependency = runPostmanScript('pm.test("noop", function () {});', {
    sandboxPackages: [{
      specifier: '@postmeter/missing-dependency',
      source: missingDependencySource,
      integrity: scriptPackageIntegrity(missingDependencySource),
      dependencies: ['@postmeter/not-installed']
    }]
  });
  assert.equal(missingDependency.passed, false);
  assert.match(missingDependency.error, /depends on missing reviewed package/);

  const duplicatePackage = runPostmanScript('pm.test("noop", function () {});', {
    sandboxPackages: [
      {
        specifier: '@postmeter/duplicate',
        source: missingDependencySource,
        integrity: scriptPackageIntegrity(missingDependencySource),
        dependencies: []
      },
      {
        specifier: '@postmeter/duplicate',
        source: missingDependencySource,
        integrity: scriptPackageIntegrity(missingDependencySource),
        dependencies: []
      }
    ]
  });
  assert.equal(duplicatePackage.passed, false);
  assert.match(duplicatePackage.error, /duplicated in the reviewed package cache/);
});

test('supports additional bundled Postman built-in package facades', () => {
  const result = runPostmanScript(`
    const Ajv = require('ajv');
    const chai = require('chai');
    const cheerio = require('cheerio');
    const parseCsv = require('csv-parse/lib/sync');
    const moment = require('moment');
    const sdk = require('postman-collection');
    const xml2js = require('xml2js');

    pm.test('bundled Postman built-in facades', function () {
      const ajv = new Ajv();
      pm.expect(ajv.validate({ type: 'object', required: ['name'], properties: { name: { type: 'string' } }, additionalProperties: false }, { name: 'Ada' })).to.equal(true);
      pm.expect(ajv.validate({ type: 'object', required: ['name'] }, {})).to.equal(false);
      pm.expect(ajv.errors[0].keyword).to.equal('required');

      chai.expect('PostMeter').to.include('Meter');
      chai.assert.deepEqual({ ok: true }, { ok: true });

      const $ = cheerio.load('<ul><li class="item" data-id="1">One</li><li class="item" data-id="2">Two</li></ul>');
      pm.expect($('.item').length).to.equal(2);
      pm.expect($('[data-id="2"]').text()).to.equal('Two');

      const rows = parseCsv('name,score\\nAda,2', { columns: true, skip_empty_lines: true });
      pm.expect(rows[0].name).to.equal('Ada');
      pm.expect(rows[0].score).to.equal('2');
      const csvPollution = parseCsv('__proto__,constructor,safe\\nbad,bad,ok', { columns: true })[0];
      pm.expect(csvPollution.safe).to.equal('ok');
      pm.expect(csvPollution.__proto__).to.be.undefined;
      pm.expect(csvPollution.constructor).to.be.undefined;

      pm.expect(moment.utc('2024-01-02T03:04:05Z').add(1, 'day').format('YYYY-MM-DD HH:mm:ss')).to.equal('2024-01-03 03:04:05');
      const dateLike = moment.utc('2024-01-02T03:04:05Z').toDate();
      pm.expect(dateLike.constructor).to.be.undefined;
      pm.expect(dateLike.toISOString()).to.equal('2024-01-02T03:04:05.000Z');

      const request = new sdk.Request({ method: 'POST', url: 'https://api.example.test/widgets?limit=1', header: [{ key: 'X-Test', value: 'yes' }] });
      pm.expect(request.method).to.equal('POST');
      pm.expect(request.url.getHost()).to.equal('api.example.test');
      pm.expect(request.headers.get('X-Test')).to.equal('yes');
      const headerObject = new sdk.HeaderList(null, [{ key: '__proto__', value: 'bad' }, { key: 'constructor', value: 'bad' }, { key: 'Safe', value: 'ok' }]).toObject();
      pm.expect(headerObject.Safe).to.equal('ok');
      pm.expect(headerObject.__proto__).to.be.undefined;
      pm.expect(headerObject.constructor).to.be.undefined;
      const collection = new sdk.Collection({ info: { name: 'Facade' }, item: [{ name: 'One', request: 'https://api.example.test/one' }] });
      pm.expect(collection.items.count()).to.equal(1);

      let parsed;
      xml2js.parseString('<root><item id="1">ok</item></root>', { explicitArray: false }, function (error, value) {
        if (error) { throw error; }
        parsed = value;
      });
      pm.expect(parsed.root.item.$.id).to.equal('1');
      pm.expect(parsed.root.item._).to.equal('ok');
      const pollutedXml = xml2js.parseString('<root><__proto__>bad</__proto__><constructor>bad</constructor><safe>ok</safe></root>', { explicitArray: false });
      pm.expect(pollutedXml.root.safe).to.equal('ok');
      pm.expect(pollutedXml.root.__proto__).to.be.undefined;
      pm.expect(pollutedXml.root.constructor).to.be.undefined;
      const parsedPromise = xml2js.parseStringPromise('<root>ok</root>');
      pm.expect(parsedPromise.constructor).to.be.undefined;
      pm.expect(parsedPromise.then.constructor).to.be.undefined;
    });
  `);

  assert.equal(result.passed, true);
});

test('does not expose prototype-polluting keys through object conversion helpers', () => {
  const result = runPostmanScript(`
    pm.test('safe object helpers', function () {
      const variables = pm.variables.toObject();
      pm.expect(variables.safe).to.equal('ok');
      pm.expect(variables.__proto__).to.be.undefined;
      pm.expect(variables.constructor).to.be.undefined;

      const headers = pm.request.headers.toObject();
      pm.expect(headers['X-Safe']).to.equal('yes');
      pm.expect(headers.__proto__).to.be.undefined;
      pm.expect(headers.constructor).to.be.undefined;
    });
  `, {
    environment: {
      variables: [
        { key: '__proto__', value: 'bad', enabled: true },
        { key: 'constructor', value: 'bad', enabled: true },
        { key: 'safe', value: 'ok', enabled: true }
      ]
    },
    request: {
      headers: [
        { key: '__proto__', value: 'bad', enabled: true },
        { key: 'constructor', value: 'bad', enabled: true },
        { key: 'X-Safe', value: 'yes', enabled: true }
      ]
    }
  });

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
  assert.equal(result.visualizer.html, '<main><h1>&lt;Widget&gt;</h1><div><strong>ready</strong></div><ol><li data-index="0">&lt;alpha&gt;:ready</li><li data-index="1">beta:ok</li></ol><script>bad()</script></main>');
  assert.equal(result.visualizer.interactive, true);
  assert.deepEqual(result.visualizer.data.rows.map((item) => item.status), ['ready', 'ok']);
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

test('supports conditional and scoped pm.visualizer blocks', () => {
  const result = runPostmanScript(`
    pm.visualizer.set('<section>{{#if ok}}<b>{{title}}/{{#if nested}}yes{{else}}inner{{/if}}</b>{{else}}bad{{/if}}{{#unless error}}<i>clean</i>{{/unless}}{{#with user}}<span>{{name}}/{{@root.title}}</span>{{/with}}<ul>{{#each empty}}<li>{{this}}</li>{{else}}<li>none</li>{{/each}}</ul><ol>{{#each rows}}<li>{{../title}}:{{name}}/{{@root.title}}</li>{{/each}}</ol></section>', {
      ok: true,
      nested: false,
      error: '',
      title: '<T>',
      user: { name: 'Ada' },
      empty: [],
      rows: [{ name: 'one' }]
    });
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<section><b>&lt;T&gt;/inner</b><i>clean</i><span>Ada/&lt;T&gt;</span><ul><li>none</li></ul><ol><li>&lt;T&gt;:one/&lt;T&gt;</li></ol></section>');
});

test('supports safe pm.visualizer helpers, partials, and inline scripts for pm.getData', () => {
  const result = runPostmanScript(`
    Handlebars.registerHelper('upper', function (value) {
      return String(value).toUpperCase();
    });
    Handlebars.registerHelper('safeTag', function (value) {
      return new Handlebars.SafeString('<em>' + String(value) + '</em>');
    });
    Handlebars.registerPartial('row', '<li>{{upper name}}/{{safeTag status}}</li>');
    pm.visualizer.set('<ul>{{#each rows}}{{> row}}{{/each}}</ul><script>pm.getData(function (error, data) { window.renderedCount = data.rows.length; });</script>', {
      rows: [{ name: 'ada', status: 'ok' }]
    });
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<ul><li>ADA/<em>ok</em></li></ul><script>pm.getData(function (error, data) { window.renderedCount = data.rows.length; });</script>');
  assert.equal(result.visualizer.interactive, true);
  assert.equal(result.visualizer.data.rows[0].name, 'ada');
});

test('rejects malformed pm.visualizer blocks', () => {
  const result = runPostmanScript("pm.visualizer.set('{{#if ok}}x{{/each}}', { ok: true });");

  assert.equal(result.passed, false);
  assert.match(result.error, /pm\.visualizer template block \{\{#if\}\} closed with \{\{\/each\}\}/);
});

test('blocks unsafe pm.visualizer path parts and context keys', () => {
  const result = runPostmanScript(`
    const data = JSON.parse('{"__proto__":{"polluted":"bad"},"constructor":{"constructor":"bad"},"prototype":"bad","safe":"ok"}');
    pm.visualizer.set('<p>{{safe}}/{{__proto__.polluted}}/{{constructor.constructor}}/{{prototype}}</p><ul>{{#each this}}<li>{{@key}}</li>{{/each}}</ul>', data);
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<p>ok///</p><ul><li>safe</li></ul>');
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
