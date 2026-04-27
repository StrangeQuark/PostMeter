const NEWMAN_TARGET = '6.2.2';

const SOURCES = Object.freeze({
  sandboxOverview: {
    title: 'Postman Sandbox API reference',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/overview/'
  },
  scriptRunOrder: {
    title: 'Use scripts to add logic and tests to Postman requests',
    url: 'https://learning.postman.com/docs/postman/scripts/intro-to-scripts/'
  },
  variables: {
    title: 'Reference variables in Postman scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-variables/'
  },
  dynamicVariables: {
    title: 'Use dynamic variables to return randomly generated data',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/variables-list/'
  },
  vault: {
    title: 'Reference vault secrets in Postman scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-vault/'
  },
  cookies: {
    title: 'Access cookies in Postman scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-cookies/'
  },
  request: {
    title: 'Reference Postman requests in scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-request/'
  },
  response: {
    title: 'Reference Postman responses in scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-response/'
  },
  sendRequest: {
    title: 'Use scripts to send requests in Postman',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-send-request/'
  },
  visualizer: {
    title: 'Script Postman visualizations',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-visualizer/'
  },
  testExpect: {
    title: 'Writing tests and assertions in scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-test-expect/'
  },
  require: {
    title: 'Import packages into your scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-require/'
  },
  execution: {
    title: 'Use scripts in collection runs',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-execution/'
  },
  workflows: {
    title: 'Customize request order in a collection run',
    url: 'https://learning.postman.com/docs/collections/running-collections/building-workflows/'
  },
  message: {
    title: 'Reference message data in scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-message/'
  },
  info: {
    title: 'Reference request metadata in scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-info/'
  },
  mock: {
    title: 'Reference requests and examples in local mock servers',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-mock/'
  },
  state: {
    title: 'Persist state across requests in local mock servers',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-state/'
  },
  grpcScripts: {
    title: 'Test and debug values in gRPC requests using JavaScript in Postman',
    url: 'https://learning.postman.com/docs/sending-requests/grpc/scripting-in-grpc-request/'
  },
  grpcInterface: {
    title: 'The gRPC client interface',
    url: 'https://learning.postman.com/docs/sending-requests/grpc/grpc-request-interface/'
  },
  graphqlHttp: {
    title: 'Make a GraphQL call with an HTTP request',
    url: 'https://learning.postman.com/docs/sending-requests/graphql/graphql-http/'
  },
  websocketRequests: {
    title: 'Send WebSocket requests with Postman',
    url: 'https://learning.postman.com/docs/sending-requests/websocket/websocket-overview/'
  }
});

const FIXTURES = Object.freeze({
  'newman-sandbox-v1': {
    type: 'postmeter-golden',
    collection: 'test/fixtures/postman/newman-sandbox-v1.collection.json',
    iterationData: 'test/fixtures/postman/newman-sandbox-v1.iteration-data.json',
    expected: 'test/fixtures/postman/newman-sandbox-v1.expected.json',
    notes: 'Existing importer and collection-runner corpus for the brokered HTTP sandbox subset.'
  },
  'newman-cancellation': {
    type: 'postmeter-golden',
    collection: 'test/fixtures/postman/newman-cancellation.collection.json',
    notes: 'Cancellation fixture for pending async sandbox work.'
  },
  'differential-http-core': {
    type: 'postmeter-newman-differential',
    collection: 'test/fixtures/postman/differential-http-core.collection.json',
    notes: 'HTTP-only fixture intentionally limited to APIs supported by both PostMeter and Newman.'
  },
  'protocol-script-hooks': {
    type: 'postmeter-golden',
    collection: 'test/fixtures/postman/protocol-script-hooks.collection.json',
    notes: 'GraphQL Before query/After response and gRPC Before invoke/On message/After response fixture for imported protocol scripts.'
  },
  'local-mock-scripts': {
    type: 'postmeter-golden',
    collection: 'test/fixtures/postman/local-mock-scripts.collection.json',
    notes: 'Local mock script fixture covering pm.mock matching, saved examples, path variables, async pm.state, and imported mock script events.'
  },
  'websocket-script-audit': {
    type: 'source-audit',
    path: 'test/fixtures/postman/desktop-observations/websocket-script-support-audit.json',
    notes: 'Current official-docs audit recording that WebSocket and Socket.IO request docs do not expose saved/exported script hooks.'
  },
  'desktop-observation-template': {
    type: 'desktop-observation-template',
    path: 'test/fixtures/postman/desktop-observations/observation-template.json',
    notes: 'Template for manually recorded Postman Desktop observations for non-Newman surfaces.'
  },
  'real-world-import-corpus': {
    type: 'postmeter-real-world-style-corpus',
    collection: 'test/fixtures/postman/real-world-import-corpus.collection.json',
    notes: 'Broad Postman import corpus covering auth-heavy scripts, reviewed package references, dynamic variables, cookies, visualizers, vault metadata, GraphQL, gRPC, local mocks, runRequest workflows, and file/binary body references.'
  },
  'adversarial-sandbox-v1': {
    type: 'postmeter-adversarial-tests',
    path: 'test/electron/postmanSandboxAdversarial.test.js',
    notes: 'Security regression tests for constructor/prototype escape, dynamic code confinement, package-loader abuse, broker mutation, raw host access, visualizer isolation, mock-state abuse, protocol-stream floods, oversized output, and infinite async work.'
  }
});

const COMMON_SCOPE_METHODS = ['has', 'get', 'set', 'unset', 'replaceIn', 'toObject', 'clear'];
const ITERATION_METHODS = ['has', 'get', 'toObject', 'toJSON', 'unset'];
const PM_VARIABLES_METHODS = ['has', 'get', 'set', 'unset', 'replaceIn', 'toObject'];
const COOKIE_METHODS = ['has', 'get', 'toObject', 'set', 'unset'];
const COOKIE_JAR_METHODS = ['set-string', 'set-cookie-object', 'get', 'getAll', 'unset', 'clear'];
const REQUEST_HEADER_METHODS = ['headers.add', 'headers.remove', 'headers.upsert'];
const REQUEST_PROPERTIES = ['url', 'headers', 'method', 'methodPath', 'body', 'auth', 'metadata', 'messages'];
const RESPONSE_METHODS = ['text', 'json'];
const RESPONSE_PROPERTIES = ['code', 'status', 'headers', 'responseTime', 'responseSize', 'metadata', 'trailers', 'messages'];
const EXECUTION_ROWS = ['runRequest', 'skipRequest', 'setNextRequest', 'location', 'location.current'];
const PM_TEST_ROWS = ['pm.test', 'pm.test.skip', 'pm.test.index', 'pm.test.async-done', 'pm.test.promise', 'pm.test.duplicate-names'];
const EXPECT_ROWS = ['pm.expect.basic', 'pm.expect.negation', 'pm.expect.deep', 'pm.expect.throw', 'pm.expect.members', 'pm.response.to.have.status', 'pm.response.to.have.header', 'pm.response.to.have.body', 'pm.response.to.have.jsonBody', 'pm.response.to.have.jsonSchema'];
const BUILTIN_LIBRARIES = ['ajv', 'chai', 'cheerio', 'csv-parse/lib/sync', 'lodash', 'moment', 'postman-collection', 'uuid', 'xml2js'];
const DEPRECATED_GLOBAL_LIBRARIES = ['crypto-js'];
const NODE_MODULES = ['path', 'assert', 'buffer', 'util', 'url', 'punycode', 'querystring', 'string-decoder', 'stream', 'timers', 'events'];
const GLOBAL_OBJECTS = [
  'AggregateError', 'Array', 'ArrayBuffer', 'Atomics', 'BigInt', 'BigInt64Array', 'BigUint64Array',
  'Boolean', 'DataView', 'Date', 'Error', 'EvalError', 'Float32Array', 'Float64Array', 'Function',
  'Infinity', 'Int8Array', 'Int16Array', 'Int32Array', 'Intl', 'JSON', 'Map', 'Math', 'NaN',
  'Number', 'Object', 'Promise', 'Proxy', 'RangeError', 'ReferenceError', 'Reflect', 'RegExp',
  'Set', 'SharedArrayBuffer', 'String', 'Symbol', 'SyntaxError', 'TypeError', 'Uint8Array',
  'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'URIError', 'WeakMap', 'WeakSet',
  'AbortController', 'AbortSignal', 'DOMException', 'Event', 'EventTarget', 'atob', 'btoa',
  'TextEncoder', 'TextEncoderStream', 'TextDecoder', 'TextDecoderStream', 'Blob', 'File',
  'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape', 'isFinite',
  'isNaN', 'parseFloat', 'parseInt', 'undefined', 'unescape', 'structuredClone', 'queueMicrotask',
  'ByteLengthQueuingStrategy', 'CountQueuingStrategy', 'CompressionStream', 'DecompressionStream',
  'ReadableByteStreamController', 'ReadableStream', 'ReadableStreamBYOBReader', 'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultController', 'ReadableStreamDefaultReader', 'TransformStream',
  'TransformStreamDefaultController', 'WritableStream', 'WritableStreamDefaultController',
  'WritableStreamDefaultWriter', 'URL', 'URLSearchParams', 'Crypto', 'CryptoKey', 'SubtleCrypto', 'crypto'
];
const DYNAMIC_VARIABLE_GROUPS = [
  'common', 'text-numbers-colors', 'internet-ip', 'names', 'profession', 'phone-address-location',
  'images', 'finance', 'business', 'catchphrases', 'databases', 'dates', 'domains-emails-usernames',
  'files-directories', 'stores', 'grammar', 'lorem-ipsum'
];
const STATE_METHODS = ['get', 'set', 'delete', 'has', 'keys', 'size', 'clear', 'toObject', 'increment', 'push', 'addToSet'];

function buildPostmanParityMatrix() {
  const rows = [
    row('source.inventory.generated', 'verification', 'artifact', 'Generated official-docs parity inventory exists and is validation-gated.', 'implemented', {
      sources: ['sandboxOverview'],
      fixtures: ['differential-http-core'],
      newman: 'not-applicable',
      desktop: 'not-required',
      security: 'process'
    }),
    row('harness.differential.newman', 'verification', 'harness', `Differential runner targets newman@${NEWMAN_TARGET} for Newman-compatible surfaces.`, 'implemented', {
      sources: ['sandboxOverview'],
      fixtures: ['differential-http-core'],
      newman: 'supported',
      desktop: 'not-required',
      security: 'process'
    }),
    row('harness.desktop-observation', 'verification', 'harness', 'Desktop-only Postman surfaces have a recording path for manual observations.', 'implemented', {
      sources: ['vault', 'mock', 'state', 'grpcScripts'],
      fixtures: ['desktop-observation-template'],
      newman: 'unsupported',
      desktop: 'required',
      security: 'process'
    }),
    row('harness.production-claim-zero-unsupported', 'verification', 'harness', 'Full 1:1 Postman script compatibility claim fails until default import mode has zero unsupported rows.', 'implemented', {
      sources: ['sandboxOverview'],
      fixtures: ['real-world-import-corpus', 'adversarial-sandbox-v1'],
      newman: 'not-applicable',
      desktop: 'not-required',
      security: 'process'
    }),
    row('harness.real-world-import-corpus', 'verification', 'fixture', 'Real-world-style public/user import corpus covers complex imported Postman scripting surfaces.', 'implemented', {
      sources: ['sandboxOverview', 'vault', 'mock', 'grpcScripts', 'graphqlHttp'],
      fixtures: ['real-world-import-corpus', 'desktop-observation-template'],
      newman: 'not-applicable',
      desktop: 'required',
      security: 'data-model'
    }),
    row('harness.adversarial-corpus', 'verification', 'fixture', 'Adversarial sandbox corpus is release-gated for production claim regressions.', 'implemented', {
      sources: ['sandboxOverview'],
      fixtures: ['adversarial-sandbox-v1'],
      newman: 'not-applicable',
      desktop: 'not-required',
      security: 'no-host-access'
    }),
    row('run-order.http.collection-folder-request', 'execution-order', 'behavior', 'HTTP collection, folder, and request scripts run in Postman hierarchy.', 'implemented', {
      sources: ['scriptRunOrder'],
      fixtures: ['newman-sandbox-v1', 'real-world-import-corpus'],
      newman: 'supported',
      security: 'brokered'
    }),
    row('run-order.load-tests.skip', 'execution-order', 'policy', 'Load tests stay outside sandbox v1 scripting unless a separate contract is written.', 'intentional-strict-gap', {
      sources: ['scriptRunOrder'],
      newman: 'not-applicable',
      security: 'no-host-access',
      claimScope: 'out-of-scope'
    })
  ];

  for (const name of [
    'prototype-constructor-escape',
    'dynamic-code-confinement',
    'package-loader-abuse',
    'broker-mutation',
    'raw-network-filesystem-process',
    'hostile-visualizer-document',
    'mock-state-abuse',
    'protocol-stream-flood',
    'oversized-output',
    'infinite-async-work'
  ]) {
    rows.push(row(`security.adversarial.${name}`, 'security-adversarial', 'regression-test', `Adversarial sandbox regression: ${name}`, 'implemented', {
      sources: ['sandboxOverview'],
      fixtures: ['adversarial-sandbox-v1'],
      newman: 'not-applicable',
      security: 'no-host-access'
    }));
  }

  rows.push(...PM_TEST_ROWS.map((name) => row(`test.${name}`, 'tests-assertions', 'api', name, testStatus(name), {
    sources: ['testExpect'],
    fixtures: testFixture(name),
    newman: 'supported',
    security: 'vm-facade'
  })));
  rows.push(...EXPECT_ROWS.map((name) => row(`assertion.${name}`, 'tests-assertions', 'api', name, assertionStatus(name), {
    sources: name.includes('jsonSchema') ? ['response'] : ['testExpect', 'response'],
    fixtures: implementedAssertionFixture(name),
    newman: 'supported',
    security: 'vm-facade'
  })));

  for (const scope of ['pm.globals', 'pm.collectionVariables', 'pm.environment']) {
    for (const method of COMMON_SCOPE_METHODS) {
      rows.push(row(`variables.${scope}.${method}`, 'variables', 'api', `${scope}.${method}`, variableStatus(method), {
        sources: ['variables'],
        fixtures: implementedVariableFixture(scope, method),
        newman: 'supported',
        security: 'transactional-state'
      }));
    }
  }
  for (const method of PM_VARIABLES_METHODS) {
    rows.push(row(`variables.pm.variables.${method}`, 'variables', 'api', `pm.variables.${method}`, variableStatus(method), {
      sources: ['variables', 'dynamicVariables'],
      fixtures: ['newman-sandbox-v1'],
      newman: 'supported',
      security: 'transactional-state'
    }));
  }
  for (const method of ITERATION_METHODS) {
    rows.push(row(`variables.pm.iterationData.${method}`, 'variables', 'api', `pm.iterationData.${method}`, 'implemented', {
      sources: ['variables'],
      fixtures: ['newman-sandbox-v1'],
      newman: 'supported',
      security: 'read-only'
    }));
  }
  rows.push(...DYNAMIC_VARIABLE_GROUPS.map((name) => row(`dynamic.${name}`, 'dynamic-variables', 'api', `Dynamic variables: ${name}`, 'implemented', {
    sources: ['dynamicVariables'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'deterministic-facade'
  })));

  rows.push(...REQUEST_HEADER_METHODS.map((name) => row(`request.${name}`, 'request', 'api', `pm.request.${name}`, 'implemented', {
    sources: ['request'],
    fixtures: name === 'headers.upsert' ? ['differential-http-core', 'newman-sandbox-v1'] : ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'transactional-state'
  })));
  rows.push(...REQUEST_PROPERTIES.map((name) => row(`request.property.${name}`, 'request', 'property', `pm.request.${name}`, requestPropertyStatus(name), {
    sources: ['request'],
    fixtures: requestPropertyFixture(name),
    newman: 'supported',
    desktop: 'not-required',
    security: 'hardened-sdk-object'
  })));
  rows.push(...RESPONSE_METHODS.map((name) => row(`response.method.${name}`, 'response', 'api', `pm.response.${name}()`, 'implemented', {
    sources: ['response'],
    fixtures: ['differential-http-core', 'newman-sandbox-v1'],
    newman: 'supported',
    security: 'hardened-sdk-object'
  })));
  rows.push(...RESPONSE_PROPERTIES.map((name) => row(`response.property.${name}`, 'response', 'property', `pm.response.${name}`, responsePropertyStatus(name), {
    sources: ['response'],
    fixtures: responsePropertyFixture(name),
    newman: 'supported',
    desktop: 'not-required',
    security: 'hardened-sdk-object'
  })));

  rows.push(row('sendRequest.string-url', 'network', 'api', 'pm.sendRequest(URL string)', 'implemented', {
    sources: ['sendRequest'],
    fixtures: ['differential-http-core', 'newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  }));
  rows.push(row('sendRequest.object-config', 'network', 'api', 'pm.sendRequest(request object)', 'implemented', {
    sources: ['sendRequest'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  }));
  rows.push(row('sendRequest.collection-sdk-request', 'network', 'api', 'pm.sendRequest(Postman Collection SDK Request)', 'implemented', {
    sources: ['sendRequest', 'request'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  }));
  rows.push(row('sendRequest.callback', 'network', 'api', 'pm.sendRequest callback form', 'implemented', {
    sources: ['sendRequest'],
    fixtures: ['differential-http-core', 'newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  }));
  rows.push(row('sendRequest.promise', 'network', 'api', 'pm.sendRequest promise form', 'implemented', {
    sources: ['sendRequest'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  }));
  rows.push(row('sendRequest.advanced-auth-proxy', 'network', 'transport-policy', 'Advanced Postman auth helpers, proxy, and client-certificate parity for brokered script requests', 'partial', {
    sources: ['sendRequest', 'request'],
    fixtures: ['real-world-import-corpus', 'desktop-observation-template'],
    newman: 'supported',
    desktop: 'required',
    security: 'brokered'
  }));
  rows.push(row('sendRequest.file-binary-bindings', 'network', 'transport-policy', 'User-granted imported file and binary attachment bindings for brokered script requests', 'partial', {
    sources: ['sendRequest', 'request'],
    fixtures: ['real-world-import-corpus', 'desktop-observation-template'],
    newman: 'supported',
    desktop: 'required',
    security: 'user-granted-file-binding'
  }));

  rows.push(...COOKIE_METHODS.map((method) => row(`cookies.current.${method}`, 'cookies', 'api', `pm.cookies.${method}`, 'implemented', {
    sources: ['cookies'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  })));
  rows.push(...COOKIE_JAR_METHODS.map((method) => row(`cookies.jar.${method}`, 'cookies', 'api', `pm.cookies.jar().${method}`, 'implemented', {
    sources: ['cookies'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  })));
  rows.push(row('cookies.httponly-parity', 'cookies', 'behavior', 'HttpOnly script readability and mutation parity', 'needs-desktop-observation', {
    sources: ['cookies'],
    fixtures: ['desktop-observation-template'],
    newman: 'unknown',
    desktop: 'required',
    security: 'intentional-strict-review'
  }));

  for (const name of EXECUTION_ROWS) {
    rows.push(row(`execution.${name}`, 'execution', name.includes('location') ? 'property' : 'api', `pm.execution.${name}`, executionStatus(name), {
      sources: ['execution', 'workflows'],
      fixtures: executionFixture(name),
      newman: name === 'runRequest' ? 'unsupported' : 'supported',
      desktop: name === 'runRequest' ? 'required' : 'not-required',
      security: 'brokered'
    }));
  }

  rows.push(row('visualizer.set', 'visualizer', 'api', 'pm.visualizer.set(layout, data, options)', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'isolated-renderer'
  }));
  rows.push(row('visualizer.clear', 'visualizer', 'api', 'pm.visualizer.clear()', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'isolated-renderer'
  }));
  rows.push(row('visualizer.pm.getData', 'visualizer', 'api', 'pm.getData(callback)', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'isolated-renderer'
  }));
  rows.push(row('visualizer.external-assets', 'visualizer', 'asset-policy', 'Reviewed external visualizer assets', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache'
  }));

  for (const method of ['get', 'set', 'unset']) {
    rows.push(row(`vault.${method}`, 'vault', 'api', `pm.vault.${method}`, 'implemented', {
      sources: ['vault'],
      fixtures: ['newman-sandbox-v1', 'desktop-observation-template'],
      newman: 'unsupported',
      desktop: 'required',
      security: 'brokered-encrypted-store'
    }));
  }
  rows.push(row('vault.prompt-denial-reset-audit', 'vault', 'ux-policy', 'Vault prompt, denial, reset, and audit UX', 'implemented', {
    sources: ['vault'],
    fixtures: ['desktop-observation-template', 'real-world-import-corpus'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-encrypted-store'
  }));

  rows.push(row('require.pm.team-package', 'packages', 'api', "pm.require('@team/package')", 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache'
  }));
  rows.push(row('require.pm.npm-package', 'packages', 'api', "pm.require('npm:package@version')", 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache'
  }));
  rows.push(row('require.pm.jsr-package', 'packages', 'api', "pm.require('jsr:package@version')", 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache'
  }));
  rows.push(row('require.pm.online-fetch-review', 'packages', 'desktop-workflow', 'Postman Package Library and external package fetch/review workflow can satisfy missing imported package references before first run.', 'partial', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'real-world-import-corpus', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache'
  }));
  rows.push(...BUILTIN_LIBRARIES.map((name) => row(`require.builtin.${slug(name)}`, 'packages', 'module', `require('${name}')`, 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'facade'
  })));
  rows.push(...DEPRECATED_GLOBAL_LIBRARIES.map((name) => row(`require.deprecated.${slug(name)}`, 'packages', 'module', `legacy ${name} global/package`, 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'legacy',
    security: 'facade'
  })));
  rows.push(...NODE_MODULES.map((name) => row(`require.node.${slug(name)}`, 'packages', 'node-module-facade', `require('${name}')`, 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'facade'
  })));
  rows.push(...GLOBAL_OBJECTS.map((name) => row(`global.${slug(name)}`, 'globals', 'global', name, globalStatus(name), {
    sources: ['require'],
    fixtures: globalFixture(name),
    newman: 'supported',
    security: name === 'Function' ? 'dynamic-code-review' : 'vm-global'
  })));

  for (const eventName of ['prerequest', 'test', 'beforeQuery', 'beforeInvoke', 'onIncomingMessage', 'afterResponse']) {
    rows.push(row(`info.eventName.${eventName}`, 'metadata', 'property', `pm.info.eventName:${eventName}`, infoStatus(eventName), {
      sources: ['info'],
      fixtures: eventName === 'test' || eventName === 'prerequest' ? ['differential-http-core', 'newman-sandbox-v1'] : ['protocol-script-hooks', 'desktop-observation-template'],
      newman: eventName === 'beforeQuery' || eventName === 'beforeInvoke' || eventName === 'onIncomingMessage' || eventName === 'afterResponse' ? 'unsupported' : 'supported',
      desktop: eventName === 'beforeQuery' || eventName === 'beforeInvoke' || eventName === 'onIncomingMessage' || eventName === 'afterResponse' ? 'required' : 'not-required',
      security: 'read-only'
    }));
  }
  for (const property of ['iteration', 'iterationCount', 'requestName', 'requestId']) {
    rows.push(row(`info.property.${property}`, 'metadata', 'property', `pm.info.${property}`, 'implemented', {
      sources: ['info'],
      fixtures: ['differential-http-core', 'newman-sandbox-v1'],
      newman: 'supported',
      security: 'read-only'
    }));
  }

  rows.push(row('grpc.hook.beforeInvoke', 'grpc', 'protocol-hook', 'gRPC Before invoke scripts', 'implemented', {
    sources: ['grpcScripts'],
    fixtures: ['protocol-script-hooks', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol'
  }));
  rows.push(row('grpc.hook.onMessage', 'grpc', 'protocol-hook', 'gRPC On message scripts', 'implemented', {
    sources: ['grpcScripts'],
    fixtures: ['protocol-script-hooks', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol'
  }));
  rows.push(row('grpc.hook.afterResponse', 'grpc', 'protocol-hook', 'gRPC After response scripts', 'implemented', {
    sources: ['grpcScripts'],
    fixtures: ['protocol-script-hooks', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol'
  }));
  rows.push(row('grpc.pm.message', 'grpc', 'api', 'pm.message', 'implemented', {
    sources: ['message', 'grpcInterface'],
    fixtures: ['protocol-script-hooks', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'hardened-sdk-object'
  }));
  rows.push(row('grpc.live-desktop-transport', 'grpc', 'desktop-transport', 'Native desktop gRPC transport execution for imported gRPC requests', 'partial', {
    sources: ['grpcScripts', 'grpcInterface'],
    fixtures: ['protocol-script-hooks', 'desktop-observation-template', 'real-world-import-corpus'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol'
  }));
  rows.push(row('graphql.http-body', 'graphql', 'import-surface', 'GraphQL HTTP body, variables, and scripts', 'implemented', {
    sources: ['graphqlHttp'],
    fixtures: ['protocol-script-hooks', 'desktop-observation-template'],
    newman: 'unknown',
    desktop: 'required',
    security: 'brokered-protocol'
  }));
  rows.push(row('websocket.script-hooks.audit', 'websocket', 'protocol-hook', 'Audit current Postman WebSocket script support', 'implemented', {
    sources: ['websocketRequests'],
    fixtures: ['websocket-script-audit', 'desktop-observation-template'],
    newman: 'unknown',
    desktop: 'required',
    security: 'no-script-surface',
    notes: 'Official WebSocket and Socket.IO request docs do not document saved/importable script hooks; PostMeter records this and does not invent an incompatible hook surface.'
  }));

  rows.push(row('mock.matchRequest', 'mock', 'api', 'pm.mock.matchRequest', 'implemented', {
    sources: ['mock'],
    fixtures: ['local-mock-scripts', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'mock-broker'
  }));
  rows.push(row('mock.sendExample', 'mock', 'api', 'pm.mock.sendExample', 'implemented', {
    sources: ['mock'],
    fixtures: ['local-mock-scripts', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'mock-broker'
  }));
  rows.push(row('mock.path-variables', 'mock', 'behavior', 'Local mock path variable matching', 'implemented', {
    sources: ['mock'],
    fixtures: ['local-mock-scripts', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'mock-broker'
  }));
  rows.push(...STATE_METHODS.map((method) => row(`state.${method}`, 'mock-state', 'api', `pm.state.${method}`, 'implemented', {
    sources: ['state'],
    fixtures: ['local-mock-scripts', 'desktop-observation-template'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'bounded-json-store'
  })));

  for (const name of ['script-events', 'request-ids', 'protocol-profiles', 'package-references', 'visualizer-assets', 'cookie-allowlists', 'vault-metadata', 'mock-scripts', 'file-binary-bodies']) {
    rows.push(row(`import.${name}`, 'import-export', 'data-preservation', `Postman import/export preservation: ${name}`, importStatus(name), {
      sources: ['sandboxOverview', 'execution'],
      fixtures: importFixture(name),
      newman: 'not-applicable',
      security: 'data-model'
    }));
  }

  return {
    schemaVersion: 1,
    generatedFrom: 'src/core/postmanParityMatrix.js',
    generatedAtPolicy: 'Deterministic. Regenerate with npm run postman:parity:write.',
    target: {
      postmanDocsVersion: 'Latest (v12)',
      newman: NEWMAN_TARGET,
      claim: 'Full Postman script import parity requires zero unsupported rows in default import mode.'
    },
    sources: SOURCES,
    fixtures: FIXTURES,
    statuses: {
      implemented: 'Implemented for the documented row and covered by at least one fixture.',
      partial: 'Partially implemented; fixture coverage may only prove the currently supported subset.',
      'not-started': 'Required by the contract but not implemented yet.',
      'intentional-strict-gap': 'Intentionally stricter than Postman for security or product-scope reasons; full parity cannot be claimed while active in default mode.',
      'needs-desktop-observation': 'Needs current Postman Desktop behavior capture before implementation can be considered compatible.',
      'needs-source-audit': 'Needs an official-source audit before implementation scope is final.'
    },
    rows: rows.sort((left, right) => left.id.localeCompare(right.id))
  };
}

function row(id, area, kind, target, status, options = {}) {
  return {
    id,
    area,
    claimScope: options.claimScope || 'default-import',
    kind,
    target,
    status,
    sourceRefs: options.sources || ['sandboxOverview'],
    fixtureRefs: options.fixtures || [],
    differential: {
      newman: options.newman || 'unknown',
      desktopObservation: options.desktop || 'not-required'
    },
    securityDecision: options.security || 'pending',
    notes: options.notes || ''
  };
}

function testStatus(name) {
  return PM_TEST_ROWS.includes(name) ? 'implemented' : 'not-started';
}

function testFixture(name) {
  if (name === 'pm.test') {
    return ['differential-http-core', 'newman-sandbox-v1'];
  }
  if (PM_TEST_ROWS.includes(name)) {
    return ['newman-sandbox-v1'];
  }
  return [];
}

function assertionStatus(name) {
  return EXPECT_ROWS.includes(name) ? 'implemented' : 'not-started';
}

function implementedAssertionFixture(name) {
  if (name === 'pm.expect.basic' || name === 'pm.response.to.have.status') {
    return ['differential-http-core', 'newman-sandbox-v1'];
  }
  if (EXPECT_ROWS.includes(name)) {
    return ['newman-sandbox-v1'];
  }
  return [];
}

function variableStatus(method) {
  return COMMON_SCOPE_METHODS.includes(method) || PM_VARIABLES_METHODS.includes(method) ? 'implemented' : 'not-started';
}

function implementedVariableFixture(scope, method) {
  if (scope === 'pm.environment' || scope === 'pm.collectionVariables') {
    return ['differential-http-core', 'newman-sandbox-v1'];
  }
  return ['newman-sandbox-v1'];
}

function requestPropertyStatus(name) {
  if (REQUEST_PROPERTIES.includes(name)) {
    return 'implemented';
  }
  return 'not-started';
}

function requestPropertyFixture(name) {
  if (name === 'headers' || name === 'method' || name === 'url') {
    return ['differential-http-core', 'newman-sandbox-v1'];
  }
  if (name === 'body' || name === 'auth' || name === 'metadata' || name === 'messages' || name === 'methodPath') {
    return ['newman-sandbox-v1'];
  }
  return [];
}

function responsePropertyStatus(name) {
  if (RESPONSE_PROPERTIES.includes(name)) {
    return 'implemented';
  }
  return 'not-started';
}

function responsePropertyFixture(name) {
  if (name === 'code' || name === 'status' || name === 'headers' || name === 'responseTime' || name === 'responseSize') {
    return ['differential-http-core', 'newman-sandbox-v1'];
  }
  if (name === 'metadata' || name === 'trailers' || name === 'messages') {
    return ['newman-sandbox-v1'];
  }
  return [];
}

function executionStatus(name) {
  if (EXECUTION_ROWS.includes(name)) {
    return 'implemented';
  }
  return 'not-started';
}

function executionFixture(name) {
  if (name === 'runRequest') {
    return ['newman-sandbox-v1', 'desktop-observation-template'];
  }
  return EXECUTION_ROWS.includes(name) ? ['newman-sandbox-v1'] : [];
}

function globalStatus(name) {
  return 'implemented';
}

function globalFixture(name) {
  if (['Array', 'Object', 'Promise', 'Date', 'JSON'].includes(name)) {
    return ['differential-http-core', 'newman-sandbox-v1'];
  }
  return ['newman-sandbox-v1'];
}

function infoStatus(eventName) {
  return ['prerequest', 'test', 'beforeQuery', 'beforeInvoke', 'onIncomingMessage', 'afterResponse'].includes(eventName) ? 'implemented' : 'not-started';
}

function importStatus(name) {
  if ([
    'script-events',
    'request-ids',
    'protocol-profiles',
    'package-references',
    'visualizer-assets',
    'cookie-allowlists',
    'vault-metadata',
    'mock-scripts',
    'file-binary-bodies'
  ].includes(name)) {
    return 'implemented';
  }
  return 'not-started';
}

function importFixture(name) {
  if (name === 'package-references') {
    return ['newman-sandbox-v1', 'real-world-import-corpus'];
  }
  if (name === 'script-events' || name === 'protocol-profiles') {
    return ['protocol-script-hooks', 'real-world-import-corpus'];
  }
  if (name === 'mock-scripts') {
    return ['local-mock-scripts', 'real-world-import-corpus'];
  }
  if ([
    'request-ids',
    'visualizer-assets',
    'cookie-allowlists',
    'vault-metadata',
    'file-binary-bodies'
  ].includes(name)) {
    return ['real-world-import-corpus'];
  }
  return [];
}

function slug(value) {
  if (value === 'Crypto') {
    return 'crypto-constructor';
  }
  if (value === 'crypto') {
    return 'crypto-property';
  }
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = {
  NEWMAN_TARGET,
  buildPostmanParityMatrix
};
