const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_SCRIPT_LOG_LENGTH,
  MAX_SCRIPT_LOGS,
  runPostmanScript,
  runPostmanScriptAsync,
  scriptPackageBundleIntegrity,
  scriptPackageIntegrity
} = require('../../src/core/scriptRuntime');
const { resolveEnvironmentValue } = require('../../src/core/environmentResolver');

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

test('exposes pm.message for streaming protocol hooks', async () => {
  const result = await runPostmanScriptAsync(`
    pm.test('message data is available', function () {
      pm.expect(pm.info.eventName).to.equal('onIncomingMessage');
      pm.expect(pm.message.data.id).to.equal('user-42');
      pm.expect(pm.message.name).to.equal('user');
      pm.expect(pm.message.timestamp).to.be.instanceOf(Date);
      pm.expect(Object.prototype.toString.call(pm.message.timestamp)).to.equal('[object Date]');
      pm.expect(pm.message.timestamp.toJSON()).to.equal('2026-04-27T00:00:00.000Z');
      pm.expect(pm.message.timestamp.constructor).to.be.undefined;
      let escaped = false;
      try { pm.message.timestamp.constructor.constructor('return process')(); escaped = true; } catch (_) {}
      pm.expect(escaped).to.equal(false);
      pm.expect(pm.message.toJSON().data.name).to.equal('Ada');
    });
  `, {
    eventName: 'onIncomingMessage',
    message: {
      name: 'user',
      data: { id: 'user-42', name: 'Ada' },
      timestamp: '2026-04-27T00:00:00.000Z'
    },
    request: {
      id: 'grpc',
      name: 'gRPC',
      protocol: 'grpc'
    }
  }, {
    broker: timerBroker()
  });

  assert.equal(result.passed, true);
});

test('supports response shortcut and protocol message assertions', () => {
  const result = runPostmanScript(`
    pm.test('response assertion shortcuts', function () {
      pm.response.to.have.status('Created');
      pm.response.to.have.responseTime.above(40);
      pm.response.to.have.responseTime.below(60);
      pm.response.to.have.responseTime.not.above(60);
      pm.response.to.have.responseTime.within(45, 55);
      pm.response.to.have.metadata('content-type', 'application/grpc');
      pm.response.to.have.trailer('grpc-status', '0');
      pm.expect(pm.response.headers.get('x-response')).to.equal('yes');
      pm.expect(pm.response.metadata.has('content-type')).to.equal(true);
      pm.expect(pm.response.metadata.get('content-type')).to.equal('application/grpc');
      pm.expect(pm.response.trailers.has('grpc-status')).to.equal(true);
      pm.expect(pm.response.trailers.get('grpc-status')).to.equal('0');
      pm.response.to.have.message({ name: 'user', data: { id: 'user-42' } });
      pm.response.messages.to.include({ data: { name: 'Ada' } });
      pm.response.messages.to.have.property('data.id', 'user-42');
      pm.response.messages.to.have.jsonSchema({ type: 'object', required: ['data'], properties: { data: { type: 'object' } } });
      pm.expect(pm.response.messages.idx(0).timestamp).to.be.instanceOf(Date);
      pm.expect(pm.response.messages.filter({ data: { id: 'user-42' } }).length).to.equal(1);
      pm.request.to.have.metadata('x-request', 'yes');
      pm.expect(pm.request.messages.idx(0).data.id).to.equal('request-1');
      pm.request.messages.to.include({ data: { id: 'request-1' } });
      let requestMessageCount = 0;
      pm.request.messages.each(function () { requestMessageCount += 1; });
      pm.expect(requestMessageCount).to.equal(1);
      pm.expect({ ok: true }).to.have.jsonSchema({ type: 'object', required: ['ok'] });
    });
  `, {
    request: {
      metadata: [{ key: 'x-request', value: 'yes' }],
      messages: [{ name: 'request', data: { id: 'request-1' }, timestamp: '2026-04-27T00:00:00.000Z' }]
    },
    response: {
      statusCode: 201,
      statusText: 'Created',
      responseTime: 50,
      headers: [{ key: 'x-response', value: 'yes' }],
      metadata: [{ key: 'content-type', value: 'application/grpc' }],
      trailers: [{ key: 'grpc-status', value: '0' }],
      messages: [{ name: 'user', data: { id: 'user-42', name: 'Ada' }, timestamp: '2026-04-27T00:00:00.000Z' }],
      body: '{"ok":true}'
    }
  });

  assert.equal(result.passed, true);
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

test('supports folder pm.variables precedence between request and collection scopes', () => {
  const environment = { variables: [{ enabled: true, key: 'token', value: 'env' }] };
  const collectionVariables = [
    { enabled: true, key: 'token', value: 'collection' },
    { enabled: true, key: 'collectionOnly', value: 'collection' }
  ];
  const folderVariables = [
    { enabled: true, key: 'token', value: 'folder' },
    { enabled: true, key: 'folderOnly', value: 'folder' }
  ];
  const localVariables = [{ enabled: true, key: 'localOnly', value: 'local' }];

  const result = runPostmanScript(`
    pm.test('folder precedence', function () {
      pm.expect(pm.variables.get('token')).to.equal('folder');
      pm.expect(pm.variables.replaceIn('{{token}}/{{folderOnly}}/{{collectionOnly}}/{{localOnly}}')).to.equal('folder/folder/collection/local');
    });
  `, {
    collectionVariables,
    environment,
    folderVariables,
    localVariables
  });

  assert.equal(result.passed, true);
});

test('blocks direct host access while allowing sandboxed dynamic code', () => {
  const requireResult = runPostmanScript('require("node:fs");');
  assert.equal(requireResult.passed, false);
  assert.match(requireResult.error, /only supports bundled sandbox packages/);

  const registryResult = runPostmanScript("pm.require('npm:left-pad@1.3.0');");
  assert.equal(registryResult.passed, false);
  assert.match(registryResult.error, /not installed in the reviewed package cache/);

  const functionResult = runPostmanScript(`
    pm.test('safe function constructor stays inside sandbox globals', function () {
      pm.expect(eval('1 + 2')).to.equal(3);
      pm.expect((0, eval)('1 + 3')).to.equal(4);
      pm.expect(eval('typeof Buffer')).to.equal('function');
      pm.expect((0, eval)('typeof Buffer')).to.equal('undefined');
      pm.expect(Function('return 1')()).to.equal(1);
      pm.expect(Function('return typeof require')()).to.equal('function');
      pm.expect(Function('return typeof Buffer')()).to.equal('undefined');
      pm.expect(Function('return typeof process')()).to.equal('undefined');
      pm.expect(Function('return typeof fetch')()).to.equal('undefined');
      pm.expect(Function('return typeof WebAssembly')()).to.equal('undefined');
      pm.expect(Function('return require.constructor')()).to.be.undefined;
      pm.expect(Function('return this.constructor')()).to.be.undefined;
      let functionEscaped = false;
      try { Function('return process')().cwd(); functionEscaped = true; } catch (_) {}
      pm.expect(functionEscaped).to.equal(false);
      let objectEscaped = false;
      try { ({}).constructor.constructor('return process')().cwd(); objectEscaped = true; } catch (_) {}
      pm.expect(objectEscaped).to.equal(false);
      pm.expect(({}).constructor.constructor('return typeof process')()).to.equal('undefined');
    });
  `);
  assert.equal(functionResult.passed, true);

  const fetchResult = runPostmanScript('fetch("https://example.test");');
  assert.equal(fetchResult.passed, false);
  assert.match(fetchResult.error, /fetch is not defined/);
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
      pm.expect(lodash.camelCase('Postman package parity')).to.equal('postmanPackageParity');
      pm.expect(lodash.flattenDeep([1, [2, [3]]]).join(',')).to.equal('1,2,3');
      pm.expect(lodash.template('hello <%= name %>')({ name: 'Ada' })).to.equal('hello Ada');
      const assigned = lodash.assign(null, { ok: true });
      pm.expect(assigned.ok).to.equal(true);
      const safeAssigned = lodash.assign({}, JSON.parse('{"__proto__":{"polluted":true},"constructor":"bad","safe":"ok"}'));
      pm.expect(safeAssigned.safe).to.equal('ok');
      pm.expect(safeAssigned.polluted).to.be.undefined;
      pm.expect(safeAssigned.constructor).to.equal('bad');
      pm.expect(({}).polluted).to.be.undefined;
      const created = {};
      lodash.set(created, 'nested.value', true);
      pm.expect(uuid.v4()).to.match(/^[0-9a-f-]{36}$/);
      let fsTemplateBlocked = false;
      try { lodash.template("<%= require('fs') %>")({}); } catch (_) { fsTemplateBlocked = true; }
      pm.expect(fsTemplateBlocked).to.equal(true);
      pm.expect(Crypto.SHA256.constructor.constructor('return typeof process')()).to.equal('undefined');
      pm.expect(lodash.map.constructor.constructor('return typeof process')()).to.equal('undefined');
      pm.expect(assigned.constructor.constructor('return typeof process')()).to.equal('undefined');
      pm.expect(created.nested.constructor.constructor('return typeof process')()).to.equal('undefined');
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
  const latestSource = `
    exports.version = '3.0.0';
    exports.slug = function (value) { return require('lodash').kebabCase(value); };
  `;
  const result = runPostmanScript(`
    const team = pm.require('@postmeter/team-utils');
    const npmPackage = pm.require('npm:@postmeter/example@1.2.3');
    const latestPackage = pm.require('npm:@postmeter/latest');
    pm.test('reviewed package cache', function () {
      pm.expect(team.label({ name: 'Ada' })).to.equal('Ada:team');
      pm.expect(npmPackage({ name: 'Ada' })).to.equal('ADA:TEAM');
      pm.expect(latestPackage.version).to.equal('3.0.0');
      pm.expect(latestPackage.slug('Latest Package')).to.equal('latest-package');
      pm.expect(team.label.constructor).to.be.undefined;
      pm.expect(npmPackage.constructor).to.be.undefined;
      pm.expect(latestPackage.slug.constructor).to.be.undefined;
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
      },
      {
        specifier: 'npm:@postmeter/latest',
        source: latestSource,
        integrity: scriptPackageIntegrity(latestSource),
        dependencies: ['lodash'],
        packageName: '@postmeter/latest',
        packageVersion: '3.0.0'
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

test('supports multi-file reviewed CommonJS packages with metadata, cache, circular dependencies, and default interop', () => {
  const commonJsPackage = {
    specifier: 'npm:@postmeter/commonjs@2.0.0',
    entrypoint: 'src/index.js',
    packageName: '@postmeter/commonjs',
    packageJson: { name: '@postmeter/commonjs', main: 'src/index.js', version: '2.0.0' },
    dependencyAliases: {
      'external-default': 'npm:@postmeter/default@1.0.0'
    },
    dependencies: ['@postmeter/commonjs-dep', 'npm:@postmeter/default@1.0.0'],
    files: [
      {
        path: 'src/index.js',
        source: `
          const value = require('./lib/value');
          const counter = require('./lib/counter');
          counter.inc();
          const counterAgain = require('./lib/counter');
          const data = require('./data.json');
          const circular = require('./lib/circular-a');
          const directory = require('./lib/directory');
          const dep = require('@postmeter/commonjs-dep');
          const externalDefault = require('external-default');
          const directSubpath = require('@postmeter/default/lib/format');
          const aliasSubpath = require('external-default/lib/format');
          exports.summary = function () { return data.name + ':' + value.kind + ':' + dep.name; };
          exports.cacheCount = counterAgain.value;
          exports.circular = circular.fromB + '/' + circular.bSawA;
          exports.directory = directory.name;
          exports.defaultInterop = externalDefault.default('Ada') + ':' + externalDefault.named;
          exports.subpathDependency = directSubpath('Ada') + '/' + aliasSubpath('Grace');
          exports.resolved = require.resolve('./lib/value');
        `
      },
      { path: 'src/lib/value.js', source: "module.exports = { kind: 'multi' };" },
      { path: 'src/lib/counter.js', source: 'exports.value = 0; exports.inc = function () { exports.value += 1; };' },
      { path: 'src/data.json', source: '{"name":"bundle","count":3}' },
      { path: 'src/lib/directory/package.json', source: '{"main":"main.js"}' },
      { path: 'src/lib/directory/main.js', source: "exports.name = 'directory';" },
      {
        path: 'src/lib/circular-a.js',
        source: "exports.name = 'a'; const b = require('./circular-b'); exports.fromB = b.name; exports.bSawA = b.aName;"
      },
      {
        path: 'src/lib/circular-b.js',
        source: "exports.name = 'b'; const a = require('./circular-a'); exports.aName = a.name;"
      }
    ]
  };
  commonJsPackage.source = commonJsPackage.files.find((file) => file.path === commonJsPackage.entrypoint).source;
  commonJsPackage.integrity = scriptPackageBundleIntegrity(commonJsPackage);

  const dependencySource = "exports.name = 'dependency';";
  const defaultPackage = {
    specifier: 'npm:@postmeter/default@1.0.0',
    packageName: '@postmeter/default',
    packageJson: { name: '@postmeter/default', main: 'index.js', version: '1.0.0' },
    files: [
      { path: 'index.js', source: "const format = require('./lib/format'); exports.__esModule = true; exports.default = function (value) { return value + ':default'; }; exports.named = 'named'; exports.format = format;" },
      { path: 'lib/format.js', source: "module.exports = function (value) { return value + ':formatted'; };" }
    ],
    dependencies: []
  };
  defaultPackage.source = defaultPackage.files[0].source;
  defaultPackage.integrity = scriptPackageBundleIntegrity(defaultPackage);
  const result = runPostmanScript(`
    const pkg = pm.require('npm:@postmeter/commonjs@2.0.0');
    pm.test('multi-file CommonJS reviewed package', function () {
      pm.expect(pkg.summary()).to.equal('bundle:multi:dependency');
      pm.expect(pkg.cacheCount).to.equal(1);
      pm.expect(pkg.circular).to.equal('b/a');
      pm.expect(pkg.directory).to.equal('directory');
      pm.expect(pkg.defaultInterop).to.equal('Ada:default:named');
      pm.expect(pkg.subpathDependency).to.equal('Ada:formatted/Grace:formatted');
      pm.expect(pkg.resolved).to.equal('./src/lib/value.js');
      pm.expect(pkg.constructor).to.be.undefined;
      pm.expect(pkg.summary.constructor).to.be.undefined;
    });
  `, {
    sandboxPackages: [
      commonJsPackage,
      {
        specifier: '@postmeter/commonjs-dep',
        source: dependencySource,
        integrity: scriptPackageIntegrity(dependencySource),
        dependencies: []
      },
      {
        ...defaultPackage
      }
    ]
  });

  assert.equal(result.passed, true);

  const missingSource = "module.exports = require('./missing');";
  const missing = runPostmanScript("pm.require('@postmeter/missing-file');", {
    sandboxPackages: [{
      specifier: '@postmeter/missing-file',
      source: missingSource,
      integrity: scriptPackageIntegrity(missingSource),
      dependencies: []
    }]
  });
  assert.equal(missing.passed, false);
  assert.match(missing.error, /cannot resolve module "\.\/missing"/);

  const undeclaredSubpath = runPostmanScript("pm.require('@postmeter/undeclared-subpath');", {
    sandboxPackages: [{
      specifier: '@postmeter/undeclared-subpath',
      source: "module.exports = require('@postmeter/default/lib/format');",
      integrity: scriptPackageIntegrity("module.exports = require('@postmeter/default/lib/format');"),
      dependencies: []
    }, {
      ...defaultPackage
    }]
  });
  assert.equal(undeclaredSubpath.passed, false);
  assert.match(undeclaredSubpath.error, /undeclared dependency/);
});

test('supports reviewed JSR-style ESM package syntax without runtime registry access', () => {
  const esmPackage = {
    specifier: 'jsr:@postmeter/esm@1.0.0',
    packageName: '@postmeter/esm',
    packageJson: { name: '@postmeter/esm', type: 'module', exports: './mod.mjs', version: '1.0.0' },
    entrypoint: 'mod.mjs',
    files: [
      {
        path: 'mod.mjs',
        source: `
          import { label as formatLabel } from './format.mjs';
          export const kind = 'esm';
          export function label(value) { return formatLabel(value) + ':' + kind; }
          export { formatLabel as baseLabel };
          export default function defaultLabel(value) { return label(value).toUpperCase(); }
        `
      },
      {
        path: 'format.mjs',
        source: "export function label(value) { return value.name + ':formatted'; }"
      }
    ],
    dependencies: []
  };
  esmPackage.source = esmPackage.files[0].source;
  esmPackage.integrity = scriptPackageBundleIntegrity(esmPackage);

  const result = runPostmanScript(`
    const esm = pm.require('jsr:@postmeter/esm@1.0.0');
    pm.test('reviewed ESM package', function () {
      pm.expect(esm.__esModule).to.equal(true);
      pm.expect(esm.kind).to.equal('esm');
      pm.expect(esm.label({ name: 'Ada' })).to.equal('Ada:formatted:esm');
      pm.expect(esm.default({ name: 'Ada' })).to.equal('ADA:FORMATTED:ESM');
      pm.expect(esm.baseLabel({ name: 'Grace' })).to.equal('Grace:formatted');
      pm.expect(esm.label.constructor).to.be.undefined;
    });
  `, {
    sandboxPackages: [esmPackage]
  });

  assert.equal(result.passed, true);
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
      pm.expect(csvPollution.constructor).to.equal('bad');
      pm.expect(({}).safe).to.be.undefined;
      pm.expect(({}).polluted).to.be.undefined;

      pm.expect(moment.utc('2024-01-02T03:04:05Z').add(1, 'day').format('YYYY-MM-DD HH:mm:ss')).to.equal('2024-01-03 03:04:05');
      const dateLike = moment.utc('2024-01-02T03:04:05Z').toDate();
      pm.expect(dateLike.constructor.constructor('return typeof process')()).to.equal('undefined');
      pm.expect(dateLike.toISOString()).to.equal('2024-01-02T03:04:05.000Z');

      const request = new sdk.Request({ method: 'POST', url: 'https://api.example.test/widgets?limit=1', header: [{ key: 'X-Test', value: 'yes' }] });
      pm.expect(request.method).to.equal('POST');
      pm.expect(request.url.getHost()).to.equal('api.example.test');
      pm.expect(request.headers.get('X-Test')).to.equal('yes');
      const headerObject = new sdk.HeaderList(null, [{ key: '__proto__', value: 'bad' }, { key: 'constructor', value: 'bad' }, { key: 'Safe', value: 'ok' }]).toObject();
      pm.expect(headerObject.safe).to.equal('ok');
      pm.expect(headerObject.constructor).to.equal('bad');
      pm.expect(({}).Safe).to.be.undefined;
      const collection = new sdk.Collection({ info: { name: 'Facade' }, item: [{ name: 'One', request: 'https://api.example.test/one' }] });
      pm.expect(collection.items.count()).to.equal(1);

      let parsed;
      xml2js.parseString('<root><item id="1">ok</item></root>', { explicitArray: false }, function (error, value) {
        if (error) { throw error; }
        parsed = value;
      });
      pm.expect(parsed.root.item.$.id).to.equal('1');
      pm.expect(parsed.root.item._).to.equal('ok');
      let parsedWithConstructor;
      xml2js.parseString('<root><constructor>bad</constructor><safe>ok</safe></root>', { explicitArray: false }, function (error, value) {
        if (error) { throw error; }
        parsedWithConstructor = value;
      });
      pm.expect(parsedWithConstructor.root.safe).to.equal('ok');
      pm.expect(({}).safe).to.be.undefined;
      const parsedPromise = xml2js.parseStringPromise('<root>ok</root>');
      pm.expect(parsedPromise.constructor.constructor('return typeof process')()).to.equal('undefined');
      pm.expect(parsedPromise.then.constructor.constructor('return typeof process')()).to.equal('undefined');
    });
  `);

  assert.equal(result.passed, true);
});

test('supports Postman Collection SDK-style request and response object facades', () => {
  const result = runPostmanScript(`
    const sdk = require('postman-collection');

    pm.test('sdk request objects expose list, url, body, clone, and JSON helpers', function () {
      const request = new sdk.Request({
        method: 'POST',
        url: 'https://api.example.test/widgets?limit=1',
        header: [
          { key: 'X-Trace', value: 'one' },
          { key: 'x-trace', value: 'two' },
          { key: 'X-Disabled', value: 'no', disabled: true }
        ],
        body: {
          mode: 'urlencoded',
          urlencoded: [{ key: 'name', value: 'hammer' }]
        },
        auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc' }] }
      });

      request.headers.upsert({ key: 'X-Trace', value: 'three' });
      request.headers.prepend({ key: 'X-First', value: 'yes' });
      request.url.query.upsert({ key: 'page', value: '2' });
      request.body.urlencoded.add({ key: 'size', value: 'large' });

      pm.expect(request.headers.get('x-trace')).to.equal('three');
      pm.expect(request.headers.has('X-Disabled')).to.equal(true);
      pm.expect(request.headers.idx(0).key).to.equal('X-First');
      pm.expect(request.headers.map(function (header) { return header.key; })).to.include('X-Trace');
      pm.expect(request.headers.filter(function (header) { return header.key.toLowerCase() === 'x-trace'; })).to.have.length(2);
      pm.expect(request.headers.toObject(true, false, true)['x-trace'][1]).to.equal('three');
      pm.expect(request.url.toString()).to.include('page=2');
      pm.expect(request.url.getHost()).to.equal('api.example.test');
      pm.expect(request.body.toString()).to.include('name=hammer');
      pm.expect(request.body.toString()).to.include('size=large');
      pm.expect(request.auth.bearer.get('token')).to.equal('abc');
      pm.expect(request.toJSON().header.length).to.be.above(1);
    });

    pm.test('sdk response objects expose Postman response fields and lists', function () {
      const response = new sdk.Response({
        code: 202,
        status: 'Accepted',
        header: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Set-Cookie', value: 'sid=123; Path=/; HttpOnly' }
        ],
        body: '{"ok":true}',
        responseTime: 12,
        responseSize: 11,
        metadata: [{ key: 'grpc-status', value: '0' }],
        trailers: [{ key: 'grpc-message', value: 'ok' }],
        messages: [{ data: 'in', timestamp: '2026-04-27T00:00:00.000Z' }]
      });

      pm.expect(response.code).to.equal(202);
      pm.expect(response.status).to.equal('Accepted');
      pm.expect(response.headers.get('content-type')).to.equal('application/json');
      pm.expect(response.headers.get('set-cookie')).to.include('sid=123');
      pm.expect(response.json().ok).to.equal(true);
      pm.expect(response.text()).to.equal('{"ok":true}');
      pm.expect(response.size().body).to.equal(11);
      pm.expect(response.toJSON().responseTime).to.equal(12);
    });
  `);

  assert.equal(result.passed, true);
});

test('commits SDK-style pm.request mutations from pre-request scripts', async () => {
  const result = await runPostmanScriptAsync(`
    pm.request.method = 'patch';
    pm.request.url.raw = 'https://api.example.test/widgets?existing=1';
    pm.expect(pm.request.url.query.get('existing')).to.equal('1');
    pm.request.url.query.upsert({ key: 'limit', value: '2' });
    pm.request.headers.add({ key: 'X-New', value: 'yes' });
    pm.request.headers.remove('X-Old');
    pm.request.body.update({ mode: 'urlencoded', urlencoded: [{ key: 'name', value: 'hammer' }] });
    pm.request.auth.update({ type: 'bearer', token: 'script-token' });
    pm.request.methodPath = 'package.Service.Method';
    pm.request.metadata.upsert({ key: 'route', value: 'primary' });
    pm.request.messages.add({ key: 'data', value: 'payload' });

    pm.test('mutated request surface', function () {
      pm.expect(pm.request.method).to.equal('PATCH');
      pm.expect(pm.request.url.toString()).to.include('limit=2');
      pm.expect(pm.request.headers.get('x-new')).to.equal('yes');
      pm.expect(pm.request.headers.has('X-Old')).to.equal(false);
      pm.expect(pm.request.body.mode).to.equal('urlencoded');
      pm.expect(pm.request.body.toString()).to.equal('name=hammer');
      pm.expect(pm.request.auth.token).to.equal('script-token');
      pm.expect(pm.request.methodPath).to.equal('package.Service.Method');
    });
  `, {
    request: {
      method: 'POST',
      url: 'https://api.example.test/start',
      queryParams: [],
      headers: [{ enabled: true, key: 'X-Old', value: 'remove-me' }],
      bodyType: 'RAW_TEXT',
      body: 'old',
      auth: { type: 'none' }
    }
  }, { broker: timerBroker(), timeoutMillis: 1000 });

  assert.equal(result.passed, true);
  assert.equal(result.request.method, 'PATCH');
  assert.match(result.request.url, /limit=2/);
  assert.equal(result.request.queryParams.length, 0);
  assert.equal(result.request.headers.find((item) => item.key === 'X-New').value, 'yes');
  assert.equal(result.request.headers.find((item) => item.key === 'X-Old'), undefined);
  assert.equal(result.request.bodyType, 'RAW_TEXT');
  assert.equal(result.request.body, 'name=hammer');
  assert.deepEqual(result.request.auth, { type: 'bearer', token: 'script-token' });
  assert.equal(result.request.methodPath, 'package.Service.Method');
  assert.equal(result.request.postmanBody.mode, 'urlencoded');
});

test('preserves imported binary request body references in the pm.request facade', async () => {
  const result = await runPostmanScriptAsync(`
    pm.test('binary body is visible', function () {
      pm.expect(pm.request.body.mode).to.equal('binary');
      pm.expect(pm.request.body.binary.src).to.equal('fixtures/blob.bin');
    });
  `, {
    request: {
      method: 'POST',
      url: 'https://api.example.test/upload',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      postmanBody: {
        mode: 'binary',
        binary: { src: 'fixtures/blob.bin', contentType: 'application/octet-stream' }
      }
    }
  }, { broker: timerBroker(), timeoutMillis: 1000 });

  assert.equal(result.passed, true);
  assert.equal(result.request.postmanBody.mode, 'binary');
  assert.equal(result.request.postmanBody.binary.src, 'fixtures/blob.bin');
});

test('supports Postman documented globals and NodeJS module facades without host access', () => {
  const result = runPostmanScript(`
    const path = require('path');
    const assert = require('assert');
    const moduleBuffer = require('buffer').Buffer;
    const util = require('util');
    const url = require('url');
    const punycode = require('punycode');
    const querystring = require('querystring');
    const { StringDecoder } = require('string-decoder');
    const { EventEmitter } = require('events');
    const stream = require('stream');

    pm.test('globals and module facades', function () {
      const globalScope = Function('return this')();
      const globalNames = [
        'AggregateError', 'Array', 'ArrayBuffer', 'Atomics', 'BigInt', 'BigInt64Array',
        'BigUint64Array', 'Boolean', 'DataView', 'Date', 'Error', 'EvalError',
        'Float32Array', 'Float64Array', 'Function', 'Infinity', 'Int8Array',
        'Int16Array', 'Int32Array', 'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number',
        'Object', 'Promise', 'Proxy', 'RangeError', 'ReferenceError', 'Reflect',
        'RegExp', 'Set', 'SharedArrayBuffer', 'String', 'Symbol', 'SyntaxError',
        'TypeError', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array',
        'URIError', 'WeakMap', 'WeakSet', 'AbortController', 'AbortSignal',
        'DOMException', 'Event', 'EventTarget', 'atob', 'btoa', 'TextEncoder',
        'TextEncoderStream', 'TextDecoder', 'TextDecoderStream', 'Blob',
        'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape',
        'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'unescape', 'structuredClone',
        'queueMicrotask', 'ByteLengthQueuingStrategy', 'CountQueuingStrategy',
        'CompressionStream', 'DecompressionStream', 'ReadableByteStreamController',
        'ReadableStream', 'ReadableStreamBYOBReader', 'ReadableStreamBYOBRequest',
        'ReadableStreamDefaultController', 'ReadableStreamDefaultReader',
        'TransformStream', 'TransformStreamDefaultController', 'WritableStream',
        'WritableStreamDefaultController', 'WritableStreamDefaultWriter', 'URL',
        'URLSearchParams', 'Crypto', 'CryptoKey', 'SubtleCrypto', 'crypto'
      ];
      pm.expect(globalNames.filter(function (name) { return typeof globalScope[name] === 'undefined'; }).join(',')).to.equal('');
      pm.expect(typeof Buffer).to.equal('function');
      pm.expect(Buffer.from('abc').toString('base64')).to.equal('YWJj');
      pm.expect(typeof globalScope.Buffer).to.equal('undefined');
      pm.expect(typeof globalScope.globalThis).to.equal('undefined');
      pm.expect(typeof globalScope.WebAssembly).to.equal('undefined');
      pm.expect(typeof globalScope.fetch).to.equal('undefined');
      pm.expect(typeof globalScope.XMLHttpRequest).to.equal('undefined');
      pm.expect(typeof globalScope.WebSocket).to.equal('undefined');
      pm.expect(Function('return typeof Buffer')()).to.equal('undefined');
      pm.expect(Function('return typeof process')()).to.equal('undefined');

      const parsedUrl = new URL('/v1/widgets?limit=2', 'https://api.example.test');
      parsedUrl.searchParams.set('limit', '3');
      pm.expect(parsedUrl.href).to.equal('https://api.example.test/v1/widgets?limit=3');
      pm.expect(new URLSearchParams('a=1&a=2').getAll('a').join(',')).to.equal('1,2');

      const encoded = new TextEncoder().encode('hello');
      pm.expect(new TextDecoder().decode(encoded)).to.equal('hello');
      pm.expect(encoded instanceof Uint8Array).to.equal(true);
      pm.expect(encoded.constructor).to.be.undefined;
      pm.expect(atob(btoa('abc'))).to.equal('abc');
      pm.expect(new Blob(['abc']).size).to.equal(3);
      pm.expect(new File(['abc'], 'a.txt').name).to.equal('a.txt');
      pm.expect(typeof globalScope.File).to.equal('undefined');
      pm.expect(Function('return typeof File')()).to.equal('undefined');
      pm.expect(typeof structuredClone({ ok: true }).ok).to.equal('boolean');

      const random = new Uint8Array(4);
      crypto.getRandomValues(random);
      pm.expect(random.length).to.equal(4);
      pm.expect(typeof crypto.randomUUID()).to.equal('string');

      pm.expect(path.join('root', 'child')).to.equal('root/child');
      pm.expect(path.resolve('root', 'child')).to.equal('/root/child');
      assert.strictEqual(moduleBuffer.from('hello').toString('base64'), 'aGVsbG8=');
      pm.expect(moduleBuffer.from([65, 66]).toString()).to.equal('AB');
      pm.expect(util.format('value=%d', 42)).to.equal('value=42');
      pm.expect(url.parse('https://api.example.test/v1?limit=1').hostname).to.equal('api.example.test');
      pm.expect(url.resolve('https://api.example.test/v1/', '../v2')).to.equal('https://api.example.test/v2');
      pm.expect(punycode.toUnicode('xn--maana-pta.example')).to.equal('ma\\u00f1ana.example');
      pm.expect(querystring.stringify({ a: '1', b: '2' })).to.equal('a=1&b=2');
      pm.expect(new StringDecoder('utf8').write(moduleBuffer.from('ok'))).to.equal('ok');

      const emitter = new EventEmitter();
      let eventValue = '';
      emitter.once('ready', function (value) { eventValue = value; });
      emitter.emit('ready', 'yes');
      pm.expect(eventValue).to.equal('yes');

      const pass = new stream.PassThrough();
      let streamed = '';
      pass.on('data', function (chunk) { streamed += String(chunk); });
      pass.write('a');
      pass.end('b');
      pm.expect(streamed).to.equal('ab');
      pm.expect(require('path').join.constructor.constructor('return typeof process')()).to.equal('undefined');
      pm.expect(moduleBuffer.from('x').constructor.constructor('return typeof process')()).to.equal('undefined');
    });
  `);

  assert.equal(result.passed, true);
});

test('supports bounded interval timers, microtasks, and console methods in async scripts', async () => {
  const result = await runPostmanScriptAsync(`
    const timers = require('timers');
    const { Buffer } = require('buffer');
    const order = [];
    console.time('phase');
    console.group('group');
    console.debug('debug %d', 1);
    console.trace('trace-value');
    console.groupEnd();
    queueMicrotask(function () { order.push('microtask'); });
    const interval = timers.setInterval(function () {
      order.push('interval');
      timers.clearInterval(interval);
      setTimeout(function () {
        order.push('timeout');
        console.timeEnd('phase');
        pm.test('async ordering', function () {
          pm.expect(order).to.deep.equal(['microtask', 'interval', 'timeout']);
        });
      }, 0);
    }, 0);
    pm.test('web crypto and blob array buffers', async function () {
      const digest = await crypto.subtle.digest('SHA-256', Buffer.from('abc'));
      const blobBuffer = await new Blob(['abc']).arrayBuffer();
      pm.expect(digest.byteLength).to.equal(32);
      pm.expect(digest instanceof ArrayBuffer).to.equal(true);
      pm.expect(digest.constructor).to.be.undefined;
      pm.expect(new Uint8Array(digest).length).to.equal(32);
      pm.expect(blobBuffer.byteLength).to.equal(3);
      pm.expect(blobBuffer instanceof ArrayBuffer).to.equal(true);
    });
  `, {}, { broker: timerBroker(), timeoutMillis: 1000 });

  assert.equal(result.passed, true);
  assert.deepEqual(result.tests.map((item) => item.name).sort(), ['async ordering', 'web crypto and blob array buffers']);
  assert.match(result.logs.join('\n'), /group/);
  assert.match(result.logs.join('\n'), /debug 1/);
  assert.match(result.logs.join('\n'), /Trace: trace-value/);
  assert.match(result.logs.join('\n'), /phase: \d+ms/);
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

  const mockResult = runPostmanScript('pm.mock.matchRequest("request-id");');
  assert.equal(mockResult.passed, false);
  assert.match(mockResult.error, /pm\.mock\.matchRequest is not supported by the PostMeter script runtime yet/);

  const stateResult = runPostmanScript('pm.state.get("key");');
  assert.equal(stateResult.passed, false);
  assert.match(stateResult.error, /pm\.state\.get is not supported by the PostMeter script runtime yet/);
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

test('supports Handlebars compile options and block params in pm.visualizer templates', () => {
  const result = runPostmanScript(`
    const compiled = Handlebars.compile('<ol>{{#each rows as |row index|}}<li>{{index}}/{{row.name}}/{{@first}}/{{@last}}</li>{{/each}}</ol>', { noEscape: true });
    Handlebars.registerHelper('wrapBlock', function (value, options) {
      return new Handlebars.SafeString('<section data-value="' + value + '">' + options.fn(this) + '</section>');
    });
    pm.visualizer.set(compiled({
      rows: [{ name: '<first>' }, { name: 'second' }]
    }) + '{{#wrapBlock label}}<b>{{label}}</b>{{/wrapBlock}}', {
      label: 'ready'
    });
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<ol><li>0/<first>/true/false</li><li>1/second/false/true</li></ol><section data-value="ready"><b>ready</b></section>');
});

test('supports Postman-compatible Handlebars visualizer runtime features', () => {
  const result = runPostmanScript(`
    Handlebars.registerHelper('label', function (value, options) {
      return options.hash.prefix + String(value).toUpperCase() + '/' + options.data.root.title;
    });
    Handlebars.registerDecorator('stamp', function (program, props, container, options) {
      return function (context, runtimeOptions) {
        return program(context, runtimeOptions) + '<i>' + options.args[0] + '</i>';
      };
    });
    Handlebars.registerPartial('shared/row', '<li>{{@index}}/{{label name prefix="../"}}</li>');
    const spec = Function('return ' + Handlebars.precompile('<p>{{title}}</p>', { noEscape: true }))();
    const precompiled = Handlebars.template(spec);
    const isolated = Handlebars.create();
    isolated.registerHelper('shout', function (value) {
      return String(value).toUpperCase();
    });
    const localHtml = isolated.compile('<small>{{shout local}}</small>')({ local: 'env' });
    const runtimeTpl = Handlebars.compile('<mark>{{runtime value}}</mark>');
    pm.visualizer.set(
      '{{*stamp "done"}}' +
        precompiled({ title: '<em>T</em>' }) +
        '{{#*inline "inlineRow"}}<li>inline:{{name}}</li>{{/inline}}' +
        '<ul>{{#each rows}}{{> (lookup ../partials "row")}}{{> inlineRow}}{{/each}}</ul>' +
        runtimeTpl({ value: 'ok' }, { helpers: { runtime: function (value) { return '[' + value + ']'; } } }) +
        localHtml,
      {
        title: 'Root',
        partials: { row: 'shared/row' },
        rows: [{ name: 'ada' }]
      }
    );
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<p><em>T</em></p><ul><li>0/../ADA/Root</li><li>inline:ada</li></ul><mark>[ok]</mark><small>ENV</small><i>done</i>');
});

test('requires integrity-checked reviewed pm.visualizer assets', () => {
  const chartSource = 'window.Chart=function Chart(){this.rendered=true;}';
  const styleSource = '.chart{color:#111;}';
  const result = runPostmanScript(`
    pm.visualizer.set('<canvas class="chart"></canvas>', {}, {
      assets: {
        chartjs: { type: 'script', source: ${JSON.stringify(chartSource)}, integrity: ${JSON.stringify(scriptPackageIntegrity(chartSource))} },
        chartcss: { type: 'style', source: ${JSON.stringify(styleSource)}, integrity: ${JSON.stringify(scriptPackageIntegrity(styleSource))} }
      }
    });
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.interactive, true);
  assert.deepEqual(result.visualizer.assets.map((asset) => ({
    integrity: asset.integrity,
    name: asset.name,
    type: asset.type
  })), [
    { integrity: scriptPackageIntegrity(chartSource), name: 'chartjs', type: 'script' },
    { integrity: scriptPackageIntegrity(styleSource), name: 'chartcss', type: 'style' }
  ]);

  const rejected = runPostmanScript(`
    pm.visualizer.set('<p>bad</p>', {}, {
      assets: { chartjs: { source: 'alert(1)', integrity: 'sha256-not-the-source' } }
    });
  `);
  assert.equal(rejected.passed, false);
  assert.match(rejected.error, /pm\.visualizer asset "chartjs" integrity does not match/);
});

test('tracks Postman package references for reviewed cache workflows', () => {
  const {
    collectSandboxPackageReferencesFromText,
    sandboxPackageCacheStatus,
    scriptPackageIntegrity
  } = require('../../src/core/sandboxPackageCache');
  const references = collectSandboxPackageReferencesFromText(`
    const team = pm.require('@postmeter/tools');
    const pinned = require('npm:@postmeter/example@1.2.3');
    const unpinned = pm.require('npm:left-pad');
    const lodash = require('lodash');
  `);
  const source = 'module.exports = {};';
  const status = sandboxPackageCacheStatus({
    collections: [{
      requests: [{
        scripts: {
          beforeInvoke: "pm.require('jsr:@postmeter/protocol@1.0.0');",
          mock: "pm.require('npm:@postmeter/mock-tools@1.0.0');",
          preRequest: '',
          tests: "pm.require('@postmeter/tools'); pm.require('npm:left-pad');"
        }
      }],
      folders: []
    }],
    settings: {
      sandbox: {
        packageCache: [{ specifier: '@postmeter/tools', source, integrity: scriptPackageIntegrity(source) }]
      }
    }
  });

  assert.deepEqual(references.map((item) => item.specifier), ['@postmeter/tools', 'npm:@postmeter/example@1.2.3', 'npm:left-pad']);
  assert.equal(status.find((item) => item.specifier === '@postmeter/tools').status, 'reviewed');
  assert.equal(status.find((item) => item.specifier === 'jsr:@postmeter/protocol@1.0.0').status, 'missing-review');
  assert.equal(status.find((item) => item.specifier === 'npm:@postmeter/mock-tools@1.0.0').status, 'missing-review');
  assert.equal(status.find((item) => item.specifier === 'npm:left-pad').status, 'missing-review');
});

test('rejects malformed pm.visualizer blocks', () => {
  const result = runPostmanScript("pm.visualizer.set('{{#if ok}}x{{/each}}', { ok: true });");

  assert.equal(result.passed, false);
  assert.match(result.error, /pm\.visualizer template render failed: if doesn't match each/);
});

test('blocks unsafe pm.visualizer path parts and context keys', () => {
  const result = runPostmanScript(`
    const data = JSON.parse('{"__proto__":{"polluted":"bad"},"constructor":{"constructor":"bad"},"prototype":"bad","safe":"ok"}');
    pm.visualizer.set('<p>{{safe}}/{{__proto__.polluted}}/{{constructor.constructor}}/{{prototype}}</p><ul>{{#each this}}<li>{{@key}}</li>{{/each}}</ul>', data);
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<p>ok///</p><ul><li>safe</li></ul>');
});

test('does not expose host constructors through visualizer helper options', () => {
  const result = runPostmanScript(`
    Handlebars.registerHelper('probe', function (options) {
      return [
        options.lookupProperty({ constructor: 'bad', safe: 'ok' }, 'constructor') === undefined,
        options.lookupProperty({ constructor: 'bad', safe: 'ok' }, 'safe') === 'ok',
        options.hash.constructor === undefined,
        options.constructor === undefined
      ].join('/');
    });
    pm.visualizer.set('<p>{{probe constructor="bad"}}</p>', {});
  `);

  assert.equal(result.passed, true);
  assert.equal(result.visualizer.html, '<p>true/true/true/true</p>');
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
      pm.expect(['red', 'green', 'blue']).to.include.members(['red', 'blue']);
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

test('supports Postman pm.test skip, index, chaining, async mixing, and deterministic order', async () => {
  const result = await runPostmanScriptAsync(`
    const order = [];
    const returned = pm.test('sync chained test', function () {
      pm.expect(pm.test.index()).to.equal(1);
      order.push('sync');
    });
    pm.expect(returned).to.equal(pm.test);
    pm.test.skip('skipped by script');
    pm.test('done and promise mix', function (done) {
      setTimeout(function () {
        order.push('mixed');
        done();
      }, 1);
      return Promise.resolve();
    });
    pm.test('slow registered before fast', function (done) {
      setTimeout(function () {
        order.push('slow');
        done();
      }, 5);
    });
    pm.test('fast registered after slow', function (done) {
      setTimeout(function () {
        order.push('fast');
        pm.test('nested async test', function () {
          pm.expect(order).to.include('fast');
        });
        done();
      }, 1);
    });
    pm.test('duplicate name', function () {});
    pm.test('duplicate name', function () {});
  `, {}, { broker: timerBroker(), timeoutMillis: 1000 });

  assert.equal(result.passed, true);
  assert.deepEqual(result.tests.map((item) => item.name), [
    'sync chained test',
    'skipped by script',
    'done and promise mix',
    'slow registered before fast',
    'fast registered after slow',
    'duplicate name',
    'duplicate name',
    'nested async test'
  ]);
  assert.equal(result.tests[1].skipped, true);
  assert.equal(result.tests[1].passed, true);
  assert.deepEqual(result.tests.map((item) => item.index), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('supports Chai-compatible assertion chains and assert helpers used by Postman imports', () => {
  const result = runPostmanScript(`
    const chai = require('chai');
    pm.test('chai parity helpers', function () {
      pm.expect([1, { ok: true }, 3]).to.deep.include({ ok: true });
      pm.expect([1, 2, 3]).to.include.ordered.members([1, 2]);
      pm.expect([1, 2]).to.have.members([2, 1]);
      pm.expect({ nested: { value: 42 } }).to.have.nested.property('nested.value', 42);
      pm.expect({ own: true }).to.have.own.property('own', true);
      pm.expect(function () { throw new Error('boom'); }).to.throw(/boom/);
      pm.expect(2.05).to.be.closeTo(2, 0.1);
      pm.expect('postmeter').to.satisfy(function (value) { return value.includes('meter'); });
      pm.expect({ a: 1, b: 2 }).to.include.keys('a');
      pm.expect({ a: 1, b: 2 }).to.have.all.keys('a', 'b');
      chai.assert.notDeepEqual({ ok: true }, { ok: false });
      chai.assert.notStrictEqual('1', 1);
      chai.assert.match('abc', /^a/);
      chai.assert.notMatch('abc', /^z/);
      chai.assert.typeOf([], 'array');
      chai.assert.throws(function () { throw new Error('expected'); }, /expected/);
      chai.assert.doesNotThrow(function () { return true; });
      chai.should().exist('value');
    });
  `);

  assert.equal(result.passed, true);
});

test('supports variable metadata, clear/toJSON, iteration unset, and dynamic variables', async () => {
  const environment = {
    name: 'Production',
    variables: [
      { enabled: false, key: 'disabled', value: 'no' },
      { enabled: true, key: 'currentOnly', currentValue: 'current', initialValue: 'initial', type: 'secret', sensitive: true },
      { enabled: true, key: 'removeMe', value: 'remove' }
    ]
  };
  const collectionVariables = [{ enabled: true, key: 'collectionOnly', value: 'collection' }];
  const globals = [{ enabled: true, key: 'globalOnly', value: 'global' }];
  const localVariables = [{ enabled: true, key: 'currentOnly', value: 'local-current' }];

  const result = await runPostmanScriptAsync(`
    pm.test('variable API parity', function () {
      pm.expect(pm.environment.name).to.equal('Production');
      pm.expect(pm.environment.get('disabled')).to.be.undefined;
      pm.expect(pm.environment.get('currentOnly')).to.equal('current');
      const json = pm.environment.toJSON();
      pm.expect(json[1]).to.include({ key: 'currentOnly', currentValue: 'current', initialValue: 'initial', type: 'secret', sensitive: true });
      pm.expect(pm.variables.get('currentOnly')).to.equal('local-current');
      pm.expect(pm.variables.get('collectionOnly')).to.equal('collection');
      pm.expect(pm.variables.get('globalOnly')).to.equal('global');
      pm.expect(pm.iterationData.get('rowId')).to.equal('row-42');
      pm.iterationData.unset('rowId');
      pm.expect(pm.iterationData.has('rowId')).to.equal(false);
      pm.expect(pm.iterationData.toJSON()).to.deep.equal([]);
      pm.expect(pm.variables.get('$guid')).to.match(/^[0-9a-f-]{36}$/);
      pm.expect(pm.variables.replaceIn('{{$randomUUID}}/{{$timestamp}}/{{$isoTimestamp}}/{{$randomEmail}}')).to.match(/^[0-9a-f-]{36}\\/\\d+\\/\\d{4}-\\d{2}-\\d{2}T.*Z\\/.+@.+\\..+$/);
      pm.expect(pm.variables.replaceIn('{{$randomInt}}')).to.match(/^\\d{1,4}$/);
      pm.environment.clear();
      pm.environment.set('afterClear', 'yes');
      pm.collectionVariables.clear();
      pm.collectionVariables.set('afterClearCollection', 'yes');
      pm.globals.clear();
      pm.globals.set('afterClearGlobal', 'yes');
    });
  `, {
    collectionVariables,
    environment,
    globals,
    iterationData: [{ enabled: true, key: 'rowId', value: 'row-42' }],
    localVariables
  }, { broker: timerBroker(), timeoutMillis: 1000 });

  assert.equal(result.passed, true);
  assert.deepEqual(environment.variables, [{ enabled: true, key: 'afterClear', value: 'yes' }]);
  assert.deepEqual(collectionVariables, [{ enabled: true, key: 'afterClearCollection', value: 'yes' }]);
  assert.deepEqual(globals, [{ enabled: true, key: 'afterClearGlobal', value: 'yes' }]);
});

test('resolves dynamic variables during request interpolation and exposes execution location metadata', async () => {
  const resolved = resolveEnvironmentValue('https://api.example.test/{{$randomInt}}/{{$randomUUID}}', { variables: [] });
  assert.match(resolved, /^https:\/\/api\.example\.test\/\d{1,4}\/[0-9a-f-]{36}$/);

  const result = await runPostmanScriptAsync(`
    pm.test('execution location', function () {
      pm.expect(pm.info.eventName).to.equal('test');
      pm.expect(Array.isArray(pm.execution.location)).to.equal(true);
      pm.expect(pm.execution.location).to.deep.equal(['Collection', 'Folder', 'Request']);
      pm.expect(pm.execution.location.current).to.equal('Request');
      pm.expect(pm.execution.location.folderPath).to.deep.equal(['Folder']);
      pm.expect(pm.execution.location.requestName).to.equal('Request');
      pm.expect(pm.execution.location.index).to.equal(2);
    });
  `, {
    eventName: 'test',
    executionLocation: {
      collectionId: 'collection-id',
      current: ['Collection', 'Folder', 'Request'],
      folderPath: ['Folder'],
      index: 2,
      requestId: 'request-id',
      requestName: 'Request'
    },
    request: { id: 'request-id', name: 'Request' },
    response: response()
  }, { broker: timerBroker(), timeoutMillis: 1000 });

  assert.equal(result.passed, true);
});

test('does not expose pm.execution.skipRequest in post-response scripts', async () => {
  const result = await runPostmanScriptAsync(`
    pm.test('post-response skipRequest is unavailable', function () {
      pm.expect(pm.execution.skipRequest).to.equal(undefined);
      pm.execution.skipRequest();
    });
  `, {
    eventName: 'test',
    request: { id: 'request-id', name: 'Request' },
    response: response()
  }, { broker: timerBroker(), timeoutMillis: 1000 });

  assert.equal(result.passed, false);
  assert.match(result.tests[0].error, /skipRequest.*function/);
  assert.equal(result.execution.skipRequest, false);
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

function timerBroker() {
  const timers = new Map();
  return {
    request(operation, payload = {}) {
      if (operation === 'timer') {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            timers.delete(payload.timerId);
            resolve({});
          }, payload.delayMillis || 0);
          timeout.unref?.();
          timers.set(payload.timerId, { resolve, timeout });
        });
      }
      if (operation === 'clearTimer') {
        const timer = timers.get(payload.timerId);
        if (timer) {
          clearTimeout(timer.timeout);
          timers.delete(payload.timerId);
          timer.resolve({ cancelled: true });
        }
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`Unexpected broker operation: ${operation}`));
    }
  };
}
