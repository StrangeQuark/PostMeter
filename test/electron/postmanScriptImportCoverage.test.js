const assert = require('node:assert/strict');
const test = require('node:test');
const { runCollection } = require('../../src/core/collectionRunner');
const { importPostmanCollection } = require('../../src/core/postmanImporter');
const {
  MockStateStore,
  handleLocalMockRequest
} = require('../../src/core/localMockServer');
const { scriptPackageIntegrity } = require('../../src/core/scriptRuntime');
const { MemoryVaultStore } = require('../../src/core/vaultStore');

test('executes simple imported Postman collection, folder, and request scripts with expected outputs', async () => {
  const collection = importPostmanCollection({
    info: postmanInfo('Simple Imported Script Coverage'),
    variable: [
      { key: 'baseUrl', value: 'https://api.example.test' },
      { key: 'runId', value: 'simple-run' }
    ],
    event: [
      event('prerequest', [
        "pm.environment.set('collectionPre', 'yes');",
        "pm.collectionVariables.set('collectionPreSeen', pm.info.requestName);",
        "pm.globals.set('globalPre', 'collection');",
        "postman.setEnvironmentVariable('legacyEnv', 'legacy-env');",
        "postman.setGlobalVariable('legacyGlobal', 'legacy-global');",
        "postman.setGlobalVariable('legacyGlobalToClear', 'remove-me');",
        "pm.test('collection prerequest has metadata', function () {",
        "  pm.expect(pm.info.eventName).to.equal('prerequest');",
        "  pm.expect(pm.info.requestName).to.equal('Simple GET');",
        "  pm.expect(postman.getEnvironmentVariable('legacyEnv')).to.equal('legacy-env');",
        "  pm.expect(postman.getGlobalVariable('legacyGlobal')).to.equal('legacy-global');",
        "});"
      ]),
      event('test', [
        "postman.clearEnvironmentVariable('legacyEnv');",
        "postman.clearGlobalVariable('legacyGlobalToClear');",
        "pm.collectionVariables.set('collectionTestSeen', pm.response.json().ok ? 'yes' : 'no');",
        "pm.globals.set('globalTest', pm.response.code);",
        "pm.test('collection test has response', function () {",
        "  pm.response.to.have.status(200);",
        "  pm.expect(pm.response.headers.get('content-type')).to.include('json');",
        "  pm.expect(postman.getEnvironmentVariable('legacyEnv')).to.be.undefined;",
        "  pm.expect(postman.getGlobalVariable('legacyGlobal')).to.equal('legacy-global');",
        "  pm.expect(postman.getGlobalVariable('legacyGlobalToClear')).to.be.undefined;",
        "});"
      ])
    ],
    item: [{
      name: 'Simple Folder',
      event: [
        event('prerequest', [
          "pm.environment.set('folderPre', pm.environment.get('collectionPre') + ':folder');",
          "pm.request.headers.add({ key: 'X-Folder', value: 'folder' });"
        ]),
        event('test', [
          "pm.environment.set('folderTest', pm.response.json().scope);"
        ])
      ],
      item: [{
        name: 'Simple GET',
        variable: [{ key: 'requestLocal', value: 'local-seed' }],
        event: [
          event('prerequest', [
            "pm.variables.set('ephemeral', 'ephemeral-local');",
            "pm.request.headers.upsert({ key: 'X-Trace', value: pm.variables.replaceIn('{{runId}}-{{requestLocal}}') });",
            "pm.request.url.raw = pm.variables.replaceIn('{{baseUrl}}/simple?trace={{ephemeral}}');",
            "pm.request.body.update({ mode: 'raw', raw: JSON.stringify({ token: pm.environment.get('token'), local: pm.variables.get('ephemeral') }) });",
            "pm.request.auth.update({ type: 'bearer', token: pm.environment.get('token') });"
          ]),
          event('test', [
            "pm.test('simple response helpers and scopes', function () {",
            "  pm.response.to.have.status(200);",
            "  pm.response.to.have.jsonBody('ok', true);",
            "  pm.expect(pm.response.json().scope).to.equal('simple');",
            "  pm.expect(pm.response.cookies.get('serverCookie')).to.equal('from-server');",
            "  pm.expect(pm.cookies.get('session')).to.equal('jar-session');",
            "  pm.expect(pm.variables.get('requestLocal')).to.equal('local-seed');",
            "  pm.expect(pm.variables.get('ephemeral')).to.equal('ephemeral-local');",
            "  pm.expect(pm.iterationData.get('row')).to.equal('row-1');",
            "  pm.expect(pm.environment.name).to.equal('Simple Env');",
            "  pm.expect(pm.execution.location.current.join(' > ')).to.include('Simple Folder');",
            "});",
            "pm.environment.set('simpleDone', pm.response.json().scope);"
          ])
        ],
        request: {
          method: 'GET',
          url: '{{baseUrl}}/placeholder',
          header: [{ key: 'X-Initial', value: 'initial' }],
          body: { mode: 'raw', raw: '{}' }
        }
      }]
    }]
  });
  const sent = [];

  const result = await runCollection(collection, {
    id: 'simple-env',
    name: 'Simple Env',
    variables: [{ enabled: true, key: 'token', value: 'simple-token' }]
  }, {
    globals: [{ enabled: true, key: 'globalSeed', value: 'seed' }],
    iterationData: [{ enabled: true, key: 'row', value: 'row-1' }],
    cookieJar: [cookie('session', 'jar-session')],
    sendRequest: async (request, environment, options) => {
      sent.push({ request, environment, options });
      assert.equal(request.method, 'GET');
      assert.equal(request.url, 'https://api.example.test/simple?trace=ephemeral-local');
      assert.equal(headerValue(request.headers, 'X-Folder'), 'folder');
      assert.equal(headerValue(request.headers, 'X-Trace'), 'simple-run-local-seed');
      assert.equal(request.body, '{"token":"simple-token","local":"ephemeral-local"}');
      assert.deepEqual(request.auth, { type: 'bearer', token: 'simple-token' });
      assert.equal(envValue(environment, 'folderPre'), 'yes:folder');
      assert.equal(options.cookieJar.find((item) => item.name === 'session')?.value, 'jar-session');
      return jsonResponse(200, { ok: true, scope: 'simple' }, {
        headers: {
          'content-type': ['application/json'],
          'set-cookie': ['serverCookie=from-server; Path=/; HttpOnly']
        },
        updatedCookies: [cookie('session', 'jar-session'), cookie('serverCookie', 'from-server', { httpOnly: true })]
      });
    }
  });

  assert.equal(result.passed, true);
  assert.equal(sent.length, 1);
  assert.equal(result.totalRequests, 1);
  assert.deepEqual(
    result.results[0].preRequestScriptResult.tests.map((item) => [item.name, item.passed]),
    [['collection prerequest has metadata', true]]
  );
  assert.deepEqual(
    result.results[0].testScriptResult.tests.map((item) => [item.name, item.passed]),
    [
      ['collection test has response', true],
      ['simple response helpers and scopes', true]
    ]
  );
  assert.equal(envValue(result.environment, 'simpleDone'), 'simple');
  assert.equal(envValue(result.environment, 'folderTest'), 'simple');
  assert.equal(variableValue(result.collectionVariables, 'collectionPreSeen'), 'Simple GET');
  assert.equal(variableValue(result.collectionVariables, 'collectionTestSeen'), 'yes');
  assert.equal(variableValue(result.globals, 'globalPre'), 'collection');
  assert.equal(variableValue(result.globals, 'globalTest'), '200');
  assert.equal(envValue(result.environment, 'legacyEnv'), undefined);
  assert.equal(variableValue(result.globals, 'legacyGlobal'), 'legacy-global');
  assert.equal(variableValue(result.globals, 'legacyGlobalToClear'), undefined);
  assert.equal(result.cookies.find((item) => item.name === 'serverCookie')?.value, 'from-server');
});

test('executes complex imported Postman scripts across network, package, vault, visualizer, execution, GraphQL, and gRPC surfaces', async () => {
  const collection = importPostmanCollection({
    info: postmanInfo('Complex Imported Script Coverage'),
    variable: [
      { key: 'baseUrl', value: 'https://api.example.test' },
      { key: 'userId', value: 'user-42' }
    ],
    item: [
      {
        name: 'Complex HTTP',
        event: [
          event('prerequest', [
            "const lodash = require('lodash');",
            "const CryptoJS = pm.require('crypto-js');",
            "const team = pm.require('@postmeter/coverage-tools');",
            "const url = require('url');",
            "const digest = CryptoJS.SHA256('complex').toString(CryptoJS.enc.Hex);",
            "pm.request.headers.upsert({ key: 'X-Digest', value: digest.slice(0, 12) });",
            "pm.request.headers.upsert({ key: 'X-Team', value: team.label({ name: 'Ada Lovelace' }) });",
            "pm.request.headers.upsert({ key: 'X-Parsed-Host', value: url.parse(pm.variables.get('baseUrl')).host });",
            "pm.request.url.raw = pm.variables.replaceIn('{{baseUrl}}/complex?user={{userId}}');",
            "pm.environment.set('complexPreOrder', lodash.compact(['collection', 'request']).join('>'));",
            "pm.variables.set('localComplex', 'local');",
            "pm.test('complex prerequest package surface', function () {",
            "  pm.expect(team.label({ name: 'Ada Lovelace' })).to.equal('ada-lovelace:team');",
            "  pm.expect(pm.request.headers.get('X-Parsed-Host')).to.equal('api.example.test');",
            "});"
          ]),
          event('test', [
            "const sdk = require('postman-collection');",
            "pm.test('complex assertions, cookies, visualizer, and vault', async function () {",
            "  pm.response.to.have.status('OK');",
            "  pm.response.to.have.responseTime.below(50);",
            "  pm.response.to.have.jsonSchema({ type: 'object', required: ['ok', 'user'], properties: { ok: { type: 'boolean' }, user: { type: 'object' } } });",
            "  pm.expect(pm.response.json().user.name).to.equal('Ada');",
            "  pm.expect(pm.cookies.get('complexSession')).to.equal('cookie-1');",
            "  const jar = pm.cookies.jar();",
            "  await jar.set('https://api.example.test/complex', 'complexJar', 'jar-value');",
            "  pm.expect(await jar.get('api.example.test/complex', 'complexJar')).to.equal('jar-value');",
            "  await pm.vault.set('complexSecret', 'vault-value');",
            "  pm.expect(await pm.vault.get('seededSecret')).to.equal('seeded-value');",
            "  pm.expect(await pm.vault.get('complexSecret')).to.equal('vault-value');",
            "  await pm.vault.unset('complexSecret');",
            "  const request = new sdk.Request({ method: 'POST', url: 'https://api.example.test/sdk', header: { 'X-SDK': 'yes' } });",
            "  const aux = await pm.sendRequest(request);",
            "  pm.expect(aux.code).to.equal(202);",
            "  await new Promise(function (resolve) { setTimeout(resolve, 1); });",
            "  pm.visualizer.set('<main>{{user.name}}/{{status}}/{{safe helperValue}}</main>', { user: pm.response.json().user, status: pm.response.code, helperValue: '<ok>' }, { helpers: { safe: function (value) { return new Handlebars.SafeString(value); } } });",
            "});",
            "pm.environment.set('complexDone', pm.response.json().user.id);"
          ])
        ],
        request: {
          method: 'GET',
          url: '{{baseUrl}}/complex-placeholder'
        }
      },
      {
        name: 'RunRequest Caller',
        event: [event('test', [
          "pm.test('runRequest returns child output and side effects', async function () {",
          "  const child = await pm.execution.runRequest('RunRequest Target', { variables: { childPath: 'from-caller' } });",
          "  pm.expect(child.code).to.equal(207);",
          "  pm.expect(child.json().child).to.equal('from-caller');",
          "  pm.expect(pm.environment.get('runRequestTarget')).to.equal('from-caller');",
          "});",
          "pm.execution.setNextRequest('Skipped By SetNextRequest');",
          "postman.setNextRequest('GraphQL Query');"
        ])],
        request: { method: 'GET', url: '{{baseUrl}}/caller' }
      },
      {
        name: 'RunRequest Target',
        variable: [{ key: 'childPath', value: 'direct' }],
        event: [event('test', [
          "pm.environment.set('runRequestTarget', pm.variables.get('childPath'));",
          "pm.test('target script sees override', function () {",
          "  pm.expect(pm.variables.get('childPath')).to.equal('from-caller');",
          "});"
        ])],
        request: { method: 'GET', url: '{{baseUrl}}/child/{{childPath}}' }
      },
      {
        name: 'Skipped By SetNextRequest',
        event: [event('test', [
          "pm.environment.set('shouldNotRun', 'bad');"
        ])],
        request: { method: 'GET', url: '{{baseUrl}}/should-not-run' }
      },
      {
        name: 'GraphQL Query',
        protocol: 'graphql',
        event: [
          event('beforeQuery', [
            "pm.request.headers.upsert({ key: 'X-GraphQL-Hook', value: pm.info.eventName });",
            "pm.environment.set('graphqlBefore', pm.info.eventName);"
          ]),
          event('afterResponse', [
            "pm.test('graphql after response script output', function () {",
            "  pm.expect(pm.info.eventName).to.equal('afterResponse');",
            "  pm.expect(pm.response.json().data.user.id).to.equal('user-42');",
            "});",
            "pm.environment.set('graphqlAfter', pm.response.json().data.user.name);"
          ])
        ],
        request: {
          method: 'POST',
          url: '{{baseUrl}}/graphql',
          body: {
            mode: 'graphql',
            graphql: {
              query: 'query GetUser($id: ID!) { user(id: $id) { id name } }',
              variables: '{"id":"{{userId}}"}',
              operationName: 'GetUser'
            }
          }
        }
      },
      {
        name: 'gRPC Stream',
        protocol: 'grpc',
        event: [
          event('beforeInvoke', [
            "pm.request.metadata.upsert({ key: 'authorization', value: 'Bearer grpc-token' });",
            "pm.request.messages.add({ name: 'lookup', data: { id: pm.variables.get('userId') } });",
            "pm.environment.set('grpcBefore', pm.info.eventName);"
          ]),
          event('onMessage', [
            "pm.test('grpc on message script output', function () {",
            "  pm.expect(pm.info.eventName).to.equal('onIncomingMessage');",
            "  pm.expect(pm.message.data.name).to.equal('Ada');",
            "  pm.expect(pm.message.timestamp).to.be.instanceOf(Date);",
            "});",
            "pm.environment.set('grpcMessage', pm.message.data.id);"
          ]),
          event('afterResponse', [
            "pm.test('grpc after response script output', function () {",
            "  pm.expect(pm.response.status).to.equal('OK');",
            "  pm.response.to.have.metadata('grpc-status', '0');",
            "  pm.response.to.have.trailer('grpc-message', 'done');",
            "  pm.response.to.have.message({ data: { id: 'user-42' } });",
            "});",
            "pm.environment.set('grpcAfter', pm.response.status);"
          ])
        ],
        request: {
          method: 'POST',
          url: 'grpc://grpc.example.test:443',
          methodPath: 'users.UserService/GetUser',
          body: {
            mode: 'grpc',
            grpc: {
              methodType: 'server-streaming',
              messages: [{ name: 'lookup', data: { id: '{{userId}}' } }]
            }
          }
        }
      }
    ]
  });
  const vault = new MemoryVaultStore({ seededSecret: 'seeded-value' });
  const sentRequests = [];
  const brokeredScriptRequests = [];
  const grpcInvocations = [];

  const result = await runCollection(collection, {
    id: 'complex-env',
    name: 'Complex Env',
    variables: []
  }, {
    trustedCapabilities: { sendRequest: true, cookies: true, vault: true },
    vault,
    cookieJar: [cookie('complexSession', 'cookie-1')],
    sandboxPackages: [{
      specifier: '@postmeter/coverage-tools',
      source: "const lodash = require('lodash'); exports.label = function (value) { return lodash.kebabCase(lodash.get(value, 'name')) + ':team'; };",
      integrity: scriptPackageIntegrity("const lodash = require('lodash'); exports.label = function (value) { return lodash.kebabCase(lodash.get(value, 'name')) + ':team'; };"),
      dependencies: ['lodash']
    }],
    sendRequest: async (request, environment) => {
      if (!request.name) {
        brokeredScriptRequests.push(request);
        assert.equal(request.url, 'https://api.example.test/sdk');
        assert.equal(headerValue(request.headers, 'X-SDK'), 'yes');
        return jsonResponse(202, { ok: true, sdk: true });
      }
      sentRequests.push(request.name);
      if (request.name === 'Complex HTTP') {
        assert.equal(request.url, 'https://api.example.test/complex?user=user-42');
        assert.equal(headerValue(request.headers, 'X-Team'), 'ada-lovelace:team');
        assert.equal(headerValue(request.headers, 'X-Parsed-Host'), 'api.example.test');
        assert.match(headerValue(request.headers, 'X-Digest'), /^[a-f0-9]{12}$/);
        return jsonResponse(200, { ok: true, user: { id: 'user-42', name: 'Ada' } }, {
          durationMillis: 7,
          updatedCookies: [cookie('complexSession', 'cookie-1')]
        });
      }
      if (request.name === 'RunRequest Caller') {
        return jsonResponse(200, { caller: true });
      }
      if (request.name === 'RunRequest Target') {
        assert.equal(envValue(environment, 'childPath'), 'from-caller');
        return jsonResponse(207, { child: 'from-caller' });
      }
      if (request.name === 'Skipped By SetNextRequest') {
        throw new Error('setNextRequest should skip this request');
      }
      if (request.name === 'GraphQL Query') {
        assert.equal(request.protocol, 'graphql');
        assert.equal(headerValue(request.headers, 'X-GraphQL-Hook'), 'beforeQuery');
        assert.deepEqual(JSON.parse(request.body), {
          operationName: 'GetUser',
          query: 'query GetUser($id: ID!) { user(id: $id) { id name } }',
          variables: { id: '{{userId}}' }
        });
        return jsonResponse(200, { data: { user: { id: 'user-42', name: 'Ada' } } });
      }
      throw new Error(`Unexpected HTTP request: ${request.name}`);
    },
    grpcInvoker: async (request, environment) => {
      grpcInvocations.push(request);
      assert.equal(request.name, 'gRPC Stream');
      assert.equal(request.methodPath, 'users.UserService/GetUser');
      assert.equal(request.metadata.find((item) => item.key === 'authorization')?.value, 'Bearer grpc-token');
      assert.equal(request.messages.some((message) => message.name === 'lookup' && message.data.id === 'user-42'), true);
      assert.equal(envValue(environment, 'userId'), 'user-42');
      return {
        response: {
          code: 0,
          status: 'OK',
          metadata: [{ key: 'grpc-status', value: '0' }],
          trailers: [{ key: 'grpc-message', value: 'done' }],
          messages: [{ name: 'user', data: { id: 'user-42', name: 'Ada' }, timestamp: '2026-04-27T00:00:00.000Z' }],
          durationMillis: 6,
          finalUrl: 'grpc://grpc.example.test:443/users.UserService/GetUser'
        }
      };
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(sentRequests, ['Complex HTTP', 'RunRequest Caller', 'RunRequest Target', 'GraphQL Query']);
  assert.equal(brokeredScriptRequests.length, 1);
  assert.equal(grpcInvocations.length, 1);
  assert.deepEqual(result.results.map((item) => item.requestName), [
    'Complex HTTP',
    'RunRequest Caller',
    'GraphQL Query',
    'gRPC Stream'
  ]);
  assert.equal(result.results[0].testScriptResult.visualizer.html, '<main>Ada/200/<ok></main>');
  assert.equal(result.results[0].testScriptResult.visualizer.interactive, false);
  assert.equal(result.results[1].testScriptResult.tests.some((item) => item.name === 'RunRequest Target: target script sees override' && item.passed), true);
  assert.equal(envValue(result.environment, 'complexPreOrder'), 'collection>request');
  assert.equal(envValue(result.environment, 'complexDone'), 'user-42');
  assert.equal(envValue(result.environment, 'runRequestTarget'), 'from-caller');
  assert.equal(envValue(result.environment, 'shouldNotRun'), undefined);
  assert.equal(envValue(result.environment, 'graphqlBefore'), 'beforeQuery');
  assert.equal(envValue(result.environment, 'graphqlAfter'), 'Ada');
  assert.equal(envValue(result.environment, 'grpcBefore'), 'beforeInvoke');
  assert.equal(envValue(result.environment, 'grpcMessage'), 'user-42');
  assert.equal(envValue(result.environment, 'grpcAfter'), 'OK');
  assert.equal(result.cookies.find((item) => item.name === 'complexJar')?.value, 'jar-value');
  assert.equal(await vault.get('seededSecret'), 'seeded-value');
  assert.equal(await vault.get('complexSecret'), undefined);
});

test('covers negative imported Postman scripts with explicit failures and sandbox denials', async () => {
  const collection = importPostmanCollection({
    info: postmanInfo('Negative Imported Script Coverage'),
    variable: [{ key: 'baseUrl', value: 'https://api.example.test' }],
    item: [
      {
        name: 'Failing Prerequest',
        event: [event('prerequest', [
          "pm.environment.set('rolledBackPre', 'bad');",
          "throw new Error('preflight failed intentionally');"
        ])],
        request: { method: 'GET', url: '{{baseUrl}}/pre-fail' }
      },
      {
        name: 'Failing Test Assertion',
        event: [event('test', [
          "pm.environment.set('testFailureCommitted', 'yes');",
          "pm.test('intentional assertion failure', function () {",
          "  pm.expect(pm.response.code).to.equal(201);",
          "});",
          "pm.test('later passing assertion still records output', function () {",
          "  pm.expect(pm.response.json().ok).to.equal(true);",
          "});"
        ])],
        request: { method: 'GET', url: '{{baseUrl}}/test-fail' }
      },
      {
        name: 'Sandbox Denials',
        event: [event('test', [
          "pm.test('host and unsafe capabilities are denied with explicit errors', async function () {",
          "  const denials = [];",
          "  try { require('node:fs'); } catch (error) { denials.push(String(error.message || error)); }",
          "  try { pm.require('npm:left-pad@1.3.0'); } catch (error) { denials.push(String(error.message || error)); }",
          "  try { fetch('https://api.example.test'); } catch (error) { denials.push(String(error.message || error)); }",
          "  try { Function('return process')().cwd(); } catch (error) { denials.push(String(error.message || error)); }",
          "  try { await pm.cookies.jar().get('ftp://example.test', 'bad'); } catch (error) { denials.push(String(error.message || error)); }",
          "  try { await pm.sendRequest({ url: 'https://api.example.test/upload', method: 'POST', body: { mode: 'file', file: { src: '/etc/passwd' } } }); } catch (error) { denials.push(String(error.message || error)); }",
          "  try { await pm.vault.get('secret'); } catch (error) { denials.push(String(error.message || error)); }",
          "  pm.expect(denials.join('\\n')).to.include('only supports bundled sandbox packages');",
          "  pm.expect(denials.join('\\n')).to.include('not installed in the reviewed package cache');",
          "  pm.expect(denials.join('\\n')).to.include('fetch is not defined');",
          "  pm.expect(denials.join('\\n')).to.include('process is not defined');",
          "  pm.expect(denials.join('\\n')).to.include('only supports HTTP and HTTPS URLs');",
          "  pm.expect(denials.join('\\n')).to.include('File attachment binding is required');",
          "  pm.expect(denials.join('\\n')).to.include('pm.vault is disabled');",
          "  pm.environment.set('denialCount', String(denials.length));",
          "});"
        ])],
        request: { method: 'GET', url: '{{baseUrl}}/denials' }
      }
    ]
  });
  const sentRequests = [];

  const result = await runCollection(collection, {
    id: 'negative-env',
    name: 'Negative Env',
    variables: []
  }, {
    trustedCapabilities: { sendRequest: true, cookies: true, vault: false },
    sendRequest: async (request) => {
      sentRequests.push(request.name || request.url);
      return jsonResponse(200, { ok: true });
    }
  });

  assert.equal(result.passed, false);
  assert.deepEqual(sentRequests, ['Failing Test Assertion', 'Sandbox Denials']);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0].requestName, 'Failing Prerequest');
  assert.equal(result.results[0].passed, false);
  assert.equal(result.results[0].statusCode, 0);
  assert.match(result.results[0].error, /preflight failed intentionally/);
  assert.equal(envValue(result.environment, 'rolledBackPre'), undefined);
  assert.equal(result.results[1].requestName, 'Failing Test Assertion');
  assert.equal(result.results[1].passed, false);
  assert.deepEqual(result.results[1].testScriptResult.tests.map((item) => [item.name, item.passed]), [
    ['intentional assertion failure', false],
    ['later passing assertion still records output', true]
  ]);
  assert.equal(envValue(result.environment, 'testFailureCommitted'), 'yes');
  assert.equal(result.results[2].requestName, 'Sandbox Denials');
  assert.equal(result.results[2].passed, true);
  assert.equal(result.results[2].testScriptResult.tests[0].passed, true);
  assert.equal(envValue(result.environment, 'denialCount'), '7');
});

test('executes imported local mock scripts and rolls back complex negative mock state', async () => {
  const collection = importPostmanCollection({
    info: postmanInfo('Mock Script Import Coverage'),
    item: [
      {
        name: 'Mock Positive',
        event: [event('mock', [
          "const previous = await pm.state.get('count') || 0;",
          "await pm.state.set('count', previous + 1);",
          "pm.test('mock request helpers', function () {",
          "  pm.expect(pm.info.eventName).to.equal('mock');",
          "  pm.expect(req.method).to.equal('POST');",
          "  pm.expect(req.params.id).to.equal('abc');",
          "  pm.expect(req.query.trace).to.equal('yes');",
          "  pm.expect(req.json().ok).to.equal(true);",
          "  pm.expect(pm.mock.matchRequest('mock-positive', req)).to.equal(true);",
          "});",
          "res.status(203).set('X-Mock', 'positive').json({ id: req.params.id, count: await pm.state.get('count') });"
        ])],
        request: { method: 'POST', url: 'https://api.example.test/mock/:id' },
        id: 'mock-positive'
      },
      {
        name: 'Mock Negative',
        event: [event('mock', [
          "await pm.state.set('shouldRollback', true);",
          "throw new Error('mock negative failure');"
        ])],
        request: { method: 'GET', url: 'https://api.example.test/mock-negative' },
        id: 'mock-negative'
      }
    ]
  });
  const stateStore = new MockStateStore();

  const positive = await handleLocalMockRequest(collection, {
    body: '{"ok":true}',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    url: 'http://localhost/mock/abc?trace=yes'
  }, {
    requireNodePermission: false,
    stateStore,
    timeoutMillis: 1000,
    workerTimeoutMillis: 2000
  });
  assert.equal(positive.matched, true);
  assert.equal(positive.response.statusCode, 203);
  assert.equal(positive.response.headers['X-Mock'], 'positive');
  assert.deepEqual(JSON.parse(positive.response.body), { count: 1, id: 'abc' });
  assert.equal(positive.scriptExecution.result.passed, true);
  assert.equal(stateStore.snapshot().count, 1);

  const negative = await handleLocalMockRequest(collection, {
    method: 'GET',
    url: 'http://localhost/mock-negative'
  }, {
    requireNodePermission: false,
    stateStore,
    timeoutMillis: 1000,
    workerTimeoutMillis: 2000
  });
  assert.equal(negative.matched, true);
  assert.equal(negative.response.statusCode, 500);
  assert.match(negative.response.body, /mock negative failure/);
  assert.deepEqual(stateStore.snapshot(), { count: 1 });
  assert.equal(negative.scriptExecution.result.commitSideEffects, false);
});

function postmanInfo(name) {
  return {
    name,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  };
}

function event(listen, exec) {
  return {
    listen,
    script: {
      type: 'text/javascript',
      exec
    }
  };
}

function jsonResponse(statusCode, body, options = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    statusCode,
    headers: options.headers || { 'content-type': ['application/json'] },
    body: text,
    durationMillis: options.durationMillis ?? 12,
    responseBytes: Buffer.byteLength(text),
    finalUrl: options.finalUrl || 'https://api.example.test',
    ...(Array.isArray(options.updatedCookies) ? { updatedCookies: options.updatedCookies } : {})
  };
}

function cookie(name, value, options = {}) {
  return {
    enabled: true,
    name,
    value,
    domain: options.domain || 'api.example.test',
    path: options.path || '/',
    secure: options.secure === true,
    httpOnly: options.httpOnly === true,
    sameSite: options.sameSite || 'Lax',
    hostOnly: options.hostOnly !== false
  };
}

function headerValue(headers, key) {
  const target = String(key || '').toLowerCase();
  return (headers || []).find((item) => String(item.key || '').toLowerCase() === target)?.value;
}

function envValue(environment, key) {
  return variableValue(environment?.variables || [], key);
}

function variableValue(variables, key) {
  return (variables || []).find((item) => item.enabled !== false && item.key === key)?.value;
}
