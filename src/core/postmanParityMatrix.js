const NEWMAN_TARGET = '6.2.2';
const POSTMAN_DESKTOP_TARGET = '11.71.7';
const POSTMAN_SANDBOX_TARGET = '6.2.2';
const POSTMAN_DESKTOP_RUNTIME_TARGET = '7.50.0';
const NEWMAN_RUNTIME_TARGET = '7.39.1';

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
  authorizationTypes: {
    title: 'Authorization types supported by Postman',
    url: 'https://learning.postman.com/docs/sending-requests/authorization/authorization-types'
  },
  ntlmAuth: {
    title: 'Authenticate with Windows NTLM authentication in Postman',
    url: 'https://learning.postman.com/docs/sending-requests/authorization/ntlm-authentication/'
  },
  oauth2Auth: {
    title: 'Authenticate with OAuth 2.0 authentication in Postman',
    url: 'https://learning.postman.com/docs/sending-requests/authorization/oauth-20/'
  },
  asapAuth: {
    title: 'Authenticate with Atlassian S2S in Postman',
    url: 'https://learning.postman.com/docs/sending-requests/authorization/atlassian'
  },
  visualizer: {
    title: 'Script Postman visualizations',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-visualizer/'
  },
  testExpect: {
    title: 'Writing tests and assertions in scripts',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-test-expect/'
  },
  testExamples: {
    title: 'Postman test script examples',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/test-examples/'
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
  graphqlInterface: {
    title: 'The GraphQL client interface',
    url: 'https://learning.postman.com/docs/sending-requests/graphql/graphql-client-interface/'
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
  'differential-sandbox-broad': {
    type: 'postmeter-newman-differential',
    collection: 'test/fixtures/postman/differential-sandbox-broad.collection.json',
    notes: 'Broader Newman-compatible differential fixture for packages, cookies, assertions, timers, dynamic variables, request mutation, pm.sendRequest object bodies, and caught failure paths.'
  },
  'differential-dynamic-host-globals': {
    type: 'postmeter-newman-differential',
    collection: 'test/fixtures/postman/differential-dynamic-host-globals.collection.json',
    notes: 'Newman-compatible dynamic-code and host-like global fixture covering direct eval, indirect eval, Function, top-level Buffer, raw network/browser globals, process, globalThis, WebAssembly, and constructor escape behavior.'
  },
  'differential-runtime-limits': {
    type: 'postmeter-newman-differential',
    collection: 'test/fixtures/postman/differential-runtime-limits.collection.json',
    notes: 'Newman-compatible runtime-limits fixture covering timer drain, cleared intervals, console method availability, and visualizer output below PostMeter security budgets.'
  },
  'differential-httponly-cookies': {
    type: 'postmeter-newman-differential',
    collection: 'test/fixtures/postman/differential-httponly-cookies.collection.json',
    notes: 'Newman-compatible HttpOnly cookie fixture covering script readability, jar get/getAll, jar replacement/unset/clear, and pm.sendRequest response-cookie jar updates.'
  },
  'differential-sendrequest-advanced': {
    type: 'postmeter-newman-differential',
    collection: 'test/fixtures/postman/differential-sendrequest-advanced.collection.json',
    notes: 'Newman-compatible pm.sendRequest advanced auth fixture covering Digest challenge retry, Hawk, and AWS Signature v4 through the brokered sender. OAuth 1.0 is covered by focused sender tests because newman@6.2.2 did not apply OAuth 1.0 auth to pm.sendRequest in the differential probe.'
  },
  'differential-sendrequest-files': {
    type: 'postmeter-newman-differential',
    collection: 'test/fixtures/postman/differential-sendrequest-files.collection.json',
    notes: 'Newman-compatible imported file binding fixture covering user-bound binary/file-style request bodies and multipart form-data attachment bodies through the same parent sender used by brokered script requests.'
  },
  'protocol-script-hooks': {
    type: 'postmeter-golden',
    collection: 'test/fixtures/postman/protocol-script-hooks.collection.json',
    notes: 'GraphQL Before query/After response and gRPC Before invoke/On message/After response fixture for imported protocol scripts.'
  },
  'official-docs-coverage-audit': {
    type: 'postman-official-docs-inventory',
    path: 'docs/postman-docs-coverage-audit.json',
    notes: 'Generated official Postman/Newman docs coverage audit. npm run postman:docs:validate gates the committed artifact; npm run postman:docs:live refetches official docs and fails on newly uncovered tokens.'
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
  'desktop-runtime-source-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-runtime-source-audit.json',
    notes: 'Automated installed-Postman Desktop runtime/source audit for desktop-required parity rows. Behavior-sensitive rows remain blocked until they have dedicated observations or implementation work.'
  },
  'postman-desktop-row-specific-behavior-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-row-specific-behavior-audit.json',
    notes: 'Row-specific evidence metadata for implemented Desktop-required behavior rows that are not covered by a narrower dedicated Desktop artifact.'
  },
  'desktop-dynamic-host-globals-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-dynamic-host-globals-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 runtime/source plus postman-sandbox@6.2.2 probe for dynamic-code and host-like global behavior.'
  },
  'desktop-runtime-limits-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-runtime-limits-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 runtime/source plus newman@6.2.2 probes for runtime timeout, timer-drain, console/output, visualizer, package, request, and payload limit behavior.'
  },
  'desktop-httponly-cookies-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-httponly-cookies-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 runtime/source plus newman@6.2.2 probes for HttpOnly cookie script readability and mutation behavior.'
  },
  'desktop-sendrequest-advanced-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-sendrequest-advanced-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 runtime/source audit for brokered pm.sendRequest advanced auth, proxy, TLS, and client-certificate policy classification.'
  },
  'desktop-sendrequest-files-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-sendrequest-files-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 runtime/source audit for brokered pm.sendRequest file, binary, and form-data attachment binding policy.'
  },
  'postman-desktop-visualizer-handlebars-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-visualizer-handlebars-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 source audit plus PostMeter focused coverage for isolated Handlebars visualizer rendering, precompiled templates, helpers, partials, decorators, SafeString, pm.getData, and reviewed asset policy.'
  },
  'postman-desktop-builtin-package-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-builtin-package-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 / postman-sandbox@6.2.2 source audit for bundled package versions and Browserify Node shim boundaries.'
  },
  'postman-desktop-commonjs-package-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-commonjs-package-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 / postman-sandbox@6.2.2 source audit plus PostMeter focused coverage for reviewed multi-file CommonJS package loading semantics.'
  },
  'postman-desktop-grpc-transport-audit-v1': {
    type: 'desktop-runtime-source-audit',
    path: 'test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-grpc-transport-audit.json',
    notes: 'Installed Postman Desktop 11.71.7 gRPC scripting source audit plus PostMeter focused live grpc-js loopback coverage for unary, client-streaming, server-streaming, bidirectional streaming, metadata, status, trailers, cancellation/error shape, and parent-owned transport policy.'
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
  },
  'focused-script-runtime-tests': {
    type: 'postmeter-focused-tests',
    path: 'test/electron/scriptRuntime.test.js',
    notes: 'Focused local runtime tests for SDK-style request/response objects, URL/list helpers, response assertion helpers, globals, packages, variables, and visualizer behavior.'
  },
  'focused-auth-tests': {
    type: 'postmeter-focused-tests',
    path: 'test/electron/auth.test.js',
    notes: 'Focused brokered auth tests for Digest, Hawk, AWS Signature v4, OAuth 1.0, NTLM challenge/response, Akamai EdgeGrid, JWT Bearer, ASAP, OAuth token retrieval, and fail-closed validation paths.'
  },
  'focused-importer-tests': {
    type: 'postmeter-focused-tests',
    path: 'test/electron/postmanImporter.test.js',
    notes: 'Focused Postman import/export tests for protocol hooks, package annotations, mock scripts, examples, certificates, file bindings, and advanced auth helper metadata round trips.'
  },
  'focused-protocol-tests': {
    type: 'postmeter-focused-tests',
    path: 'test/electron/postmanProtocolParity.test.js',
    notes: 'Focused protocol lifecycle tests for imported GraphQL/gRPC hooks, GraphQL HTTP preparation, GraphQL subscription-style message normalization, and WebSocket no-script-surface enforcement.'
  },
  'focused-local-mock-tests': {
    type: 'postmeter-focused-tests',
    path: 'test/electron/localMockServer.test.js',
    notes: 'Focused local mock tests for route matching, path variables, req/res helper surfaces, saved-example responses, async pm.state transactions, rollback, caps, and loopback server behavior.'
  },
  'postman-parity-harness-tests': {
    type: 'postmeter-focused-tests',
    path: 'test/electron/postmanParityHarness.test.js',
    notes: 'Focused parity harness tests for matrix validation, production claim blocking, Desktop evidence validation, and differential fixture execution.'
  }
});

const COMMON_SCOPE_METHODS = ['has', 'get', 'set', 'unset', 'replaceIn', 'toObject', 'clear'];
const ITERATION_METHODS = ['has', 'get', 'toObject', 'toJSON', 'unset'];
const PM_VARIABLES_METHODS = ['has', 'get', 'set', 'unset', 'replaceIn', 'toObject'];
const COOKIE_METHODS = ['has', 'get', 'toObject'];
const COOKIE_EXTENSION_METHODS = ['set', 'unset'];
const COOKIE_JAR_METHODS = ['set-string', 'set-cookie-object', 'get', 'getAll', 'unset', 'clear'];
const REQUEST_HEADER_METHODS = ['headers.add', 'headers.remove', 'headers.upsert'];
const REQUEST_PROPERTIES = ['url', 'headers', 'method', 'methodPath', 'body', 'auth', 'metadata', 'messages'];
const RESPONSE_METHODS = ['text', 'json'];
const RESPONSE_PROPERTIES = ['code', 'status', 'headers', 'responseTime', 'responseSize', 'metadata', 'trailers', 'messages', 'cookies'];
const EXECUTION_ROWS = ['runRequest', 'skipRequest', 'setNextRequest', 'location', 'location.current'];
const PM_TEST_ROWS = ['pm.test', 'pm.test.skip', 'pm.test.index', 'pm.test.async-done', 'pm.test.promise', 'pm.test.duplicate-names'];
const EXPECT_ROWS = [
  'pm.expect.basic',
  'pm.expect.negation',
  'pm.expect.deep',
  'pm.expect.throw',
  'pm.expect.members',
  'pm.response.to.be.ok',
  'pm.response.to.be.success',
  'pm.response.to.be.clientError',
  'pm.response.to.be.serverError',
  'pm.response.to.be.badRequest',
  'pm.response.to.be.unauthorized',
  'pm.response.to.be.forbidden',
  'pm.response.to.be.notFound',
  'pm.response.to.be.error',
  'pm.response.to.not.be.error',
  'pm.response.to.have.status',
  'pm.response.to.have.header',
  'pm.response.to.have.body',
  'pm.response.to.have.jsonBody',
  'pm.response.to.have.jsonSchema'
];
const RESPONSE_ASSERTION_BLOCKERS = [
  ['pm.response.to.have.status-name', 'pm.response.to.have.status(statusText) accepts Postman status-name strings such as "Created".', 'implemented', 'supported'],
  ['pm.response.to.have.responseTime', 'pm.response.to.have.responseTime chain for response-time assertions.', 'implemented', 'supported'],
  ['pm.response.to.have.responseTime.not.above', 'pm.response.to.have.responseTime.not.above(milliseconds) chain from Postman response-time examples.', 'implemented', 'supported'],
  ['pm.response.to.have.metadata', 'pm.response.to.have.metadata(name, value?) for protocol response metadata assertions.', 'implemented', 'unsupported'],
  ['pm.response.to.have.trailer', 'pm.response.to.have.trailer(name, value?) for gRPC trailer assertions.', 'implemented', 'unsupported'],
  ['pm.response.to.have.message', 'pm.response.to.have.message(message) strict protocol response-message assertion.', 'implemented', 'unsupported'],
  ['pm.response.messages.to.include', 'pm.response.messages.to.include(messageSubset) with Postman default deep behavior.', 'implemented', 'unsupported'],
  ['pm.response.messages.to.have.property', 'pm.response.messages.to.have.property(path, value?) with Postman default deep/nested behavior.', 'implemented', 'unsupported'],
  ['pm.response.messages.to.have.jsonSchema', 'pm.response.messages.to.have.jsonSchema(schema, options?) validates all protocol response messages.', 'implemented', 'unsupported'],
  ['pm.response.messages.idx', 'pm.response.messages.idx(index) returns a Postman-compatible protocol message object.', 'implemented', 'unsupported'],
  ['pm.response.messages.filter-object-predicate', 'pm.response.messages.filter(objectPredicate) supports Postman message-stream object predicate matching.', 'implemented', 'unsupported'],
  ['pm.request.to.have.metadata', 'pm.request.to.have.metadata(name, value?) for protocol request metadata assertions.', 'implemented', 'unsupported'],
  ['pm.request.messages.each', 'pm.request.messages.each(callback) iterates Postman-compatible protocol request messages.', 'implemented', 'unsupported'],
  ['pm.request.messages.to.include', 'pm.request.messages.to.include(messageSubset) with Postman default deep behavior.', 'implemented', 'unsupported'],
  ['pm.request.messages.to.have.property', 'pm.request.messages.to.have.property(path, value?) with Postman default deep/nested behavior.', 'implemented', 'unsupported'],
  ['pm.request.messages.to.have.jsonSchema', 'pm.request.messages.to.have.jsonSchema(schema, options?) validates all protocol request messages.', 'implemented', 'unsupported'],
  ['pm.expect.to.have.jsonSchema', 'pm.expect(value).to.have.jsonSchema(schema, options?) for arbitrary values.', 'implemented', 'supported'],
  ['pm.expect.full-chai-bdd-surface', 'Full Postman bundled Chai BDD assertion surface behind pm.expect, including exact chain semantics and failure behavior beyond the currently implemented common subset.', 'implemented', 'supported']
];
const SDK_LIST_METHODS = [
  'add', 'append', 'prepend', 'insert', 'insertAfter', 'upsert', 'remove', 'clear',
  'populate', 'repopulate', 'get', 'one', 'has', 'idx', 'indexOf', 'all', 'count',
  'each', 'map', 'filter-callback', 'find', 'reduce', 'toObject', 'toJSON',
  'toString', 'clone', 'valueOf'
];
const SDK_URL_METHODS = ['update', 'addQueryParams', 'getHost', 'getPath', 'getQueryString', 'clone', 'toJSON', 'toString', 'query-list-mutation'];
const SENDREQUEST_AUTH_ROWS = [
  ['noauth', 'No Auth helper pass-through for imported requests and brokered pm.sendRequest.', 'implemented', 'brokered'],
  ['apikey', 'API Key helper parity for header/query placement and variable interpolation.', 'implemented', 'brokered'],
  ['bearer', 'Bearer Token helper parity for Authorization header generation and variable interpolation.', 'implemented', 'brokered'],
  ['basic', 'Basic Auth helper parity for base64 credential header generation and variable interpolation.', 'implemented', 'brokered'],
  ['oauth2-static-token', 'OAuth 2.0 static access-token helper parity for imported requests and brokered pm.sendRequest.', 'implemented', 'brokered'],
  ['digest', 'Digest Auth helper parity including challenge/response retry behavior.', 'implemented', 'brokered-stateful-auth'],
  ['hawk', 'Hawk Auth helper parity for brokered request signing.', 'implemented', 'brokered-signing'],
  ['aws-v4', 'AWS Signature v4 helper parity for brokered request signing.', 'implemented', 'brokered-signing'],
  ['oauth1', 'OAuth 1.0 helper parity for brokered request signing.', 'implemented', 'brokered-signing']
];
const BUILTIN_LIBRARIES = ['ajv', 'backbone', 'chai', 'cheerio', 'crypto-js', 'csv-parse/lib/sync', 'json', 'lodash', 'moment', 'postman-collection', 'tv4', 'uuid', 'xml2js'];
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
    row('source.inventory.generated', 'verification', 'artifact', 'Generated official-docs parity inventory exists and is validation-gated by offline and live docs coverage commands.', 'implemented', {
      sources: ['sandboxOverview'],
      fixtures: ['official-docs-coverage-audit', 'postman-parity-harness-tests'],
      newman: 'not-applicable',
      desktop: 'not-required',
      security: 'process',
      notes: 'The parity matrix is backed by docs/postman-docs-coverage-audit.json. npm run postman:docs:validate checks the committed official-docs token mapping; npm run postman:docs:live fetches the current official Postman/Newman docs and current Newman latest dist-tag to catch upstream drift before preserving the 1:1 claim.'
    }),
    row('harness.differential.newman', 'verification', 'harness', `Differential runner targets newman@${NEWMAN_TARGET} for Newman-compatible surfaces.`, 'implemented', {
      sources: ['sandboxOverview'],
      fixtures: ['differential-http-core'],
      newman: 'supported',
      desktop: 'not-required',
      security: 'process'
    }),
    row('harness.broad-differential-corpus', 'verification', 'harness', 'Broad Newman and Postman Desktop differential evidence is harness-gated before the 1:1 claim is allowed.', 'implemented', {
      sources: ['sandboxOverview', 'vault', 'mock', 'state', 'grpcScripts', 'graphqlHttp'],
      fixtures: ['differential-http-core', 'differential-sandbox-broad', 'real-world-import-corpus', 'desktop-runtime-source-audit-v1'],
      newman: 'supported',
      desktop: 'required',
      security: 'process'
    }),
    row('harness.desktop-observation', 'verification', 'harness', 'Desktop-only Postman surfaces have a recording path for manual observations.', 'implemented', {
      sources: ['vault', 'mock', 'state', 'grpcScripts'],
      fixtures: ['desktop-observation-template'],
      newman: 'unsupported',
      desktop: 'not-required',
      security: 'process'
    }),
    row('harness.completed-desktop-observations', 'verification', 'harness', 'Every desktop-required implemented row references a completed Postman Desktop observation fixture or automated desktop evidence artifact, not only the observation template.', 'implemented', {
      sources: ['vault', 'mock', 'state', 'visualizer', 'grpcScripts', 'graphqlHttp'],
      fixtures: ['desktop-runtime-source-audit-v1'],
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
    row('harness.row-specific-desktop-behavior-evidence', 'verification', 'harness', 'Every desktop-required parity row that declares row-specific behavior evidence is validation-gated against explicit rowEvidence metadata rather than only a broad runtime/source audit row-id listing.', 'implemented', {
      sources: ['sandboxOverview'],
      fixtures: ['postman-parity-harness-tests'],
      newman: 'unsupported',
      security: 'process',
      notes: 'The parity validator now rejects implemented Desktop-required rows marked row-specific-behavior unless a completed Desktop artifact supplies rowEvidence metadata for that exact row. Broad runtime/source audits can still satisfy source-audit rows, but they no longer satisfy behavior-sensitive rows by rowId alone.'
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
    }),
    row('runtime.resource-limit-parity', 'runtime', 'limits', 'Postman/Newman script timeout, async-drain, output, package, visualizer, request, and payload limits are observed and PostMeter limits are matched or covered by the documented production resource policy.', 'implemented', {
      sources: ['sandboxOverview', 'scriptRunOrder'],
      fixtures: ['newman-sandbox-v1', 'differential-runtime-limits', 'desktop-runtime-limits-audit-v1', 'adversarial-sandbox-v1'],
      newman: 'supported',
      desktop: 'required',
      security: 'bounded-resources',
      desktopEvidence: 'row-specific-behavior',
      notes: 'PostMeter matches the audited 180s Postman Runtime global timeout as the default per-script/request budget and fixture-covers async drain, timer, console, and visualizer behavior below policy ceilings. Explicit worker, broker, response, result, console, visualizer, package, mock-state, and workspace caps are retained as production resource policy because Postman/Newman expose no stable equivalent caps and rely on host process limits. These ceilings are documented security boundaries, not unsupported Postman script APIs, and oversized host-exhaustion cases stay covered by adversarial tests.'
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
    sources: assertionSources(name),
    fixtures: implementedAssertionFixture(name),
    newman: 'supported',
    security: 'vm-facade'
  })));
  rows.push(...RESPONSE_ASSERTION_BLOCKERS.map(([id, target, status, newman]) => row(`assertion.${id}`, 'tests-assertions', 'api', target, status, {
    sources: assertionBlockerSources(id),
    fixtures: assertionBlockerFixture(id),
    newman,
    desktop: assertionBlockerNeedsDesktop(id) ? 'required' : 'not-required',
    desktopEvidence: assertionBlockerNeedsDesktop(id) ? 'row-specific-behavior' : undefined,
    security: id.includes('request.') || id.includes('response.messages') || id.includes('metadata') || id.includes('trailer') || id.includes('message')
      ? 'hardened-sdk-object'
      : 'vm-facade',
    notes: assertionBlockerNotes(id)
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
  rows.push(row('variables.pm.environment.name', 'variables', 'property', 'pm.environment.name', 'implemented', {
    sources: ['testExamples', 'variables'],
    fixtures: ['focused-script-runtime-tests'],
    newman: 'supported',
    security: 'read-only',
    notes: 'The active environment name is exposed as a read-only property on pm.environment for imported scripts that assert environment identity.'
  }));
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
  rows.push(row('request.messages.idx', 'request', 'api', 'pm.request.messages.idx(index)', 'implemented', {
    sources: ['request', 'testExamples'],
    fixtures: ['focused-script-runtime-tests', 'focused-protocol-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    desktopEvidence: 'row-specific-behavior',
    security: 'hardened-sdk-object'
  }));
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
  rows.push(row('response.headers.get', 'response', 'api', 'pm.response.headers.get(name)', 'implemented', {
    sources: ['response', 'testExamples'],
    fixtures: ['differential-http-core', 'newman-sandbox-v1', 'focused-script-runtime-tests'],
    newman: 'supported',
    security: 'hardened-sdk-object'
  }));
  for (const method of ['get', 'has']) {
    rows.push(row(`response.metadata.${method}`, 'response', 'api', `pm.response.metadata.${method}(name)`, 'implemented', {
      sources: ['response', 'testExamples'],
      fixtures: ['focused-script-runtime-tests', 'focused-protocol-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
      newman: 'unsupported',
      desktop: 'required',
      desktopEvidence: 'row-specific-behavior',
      security: 'hardened-sdk-object'
    }));
    rows.push(row(`response.trailers.${method}`, 'response', 'api', `pm.response.trailers.${method}(name)`, 'implemented', {
      sources: ['response', 'testExamples'],
      fixtures: ['focused-script-runtime-tests', 'focused-protocol-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
      newman: 'unsupported',
      desktop: 'required',
      desktopEvidence: 'row-specific-behavior',
      security: 'hardened-sdk-object'
    }));
  }
  rows.push(...SDK_LIST_METHODS.map((name) => row(`sdk.list.${slug(name)}`, 'sdk-objects', 'method', `Postman SDK-style list method: ${name}`, 'implemented', {
    sources: ['request', 'response', 'cookies', 'message'],
    fixtures: ['focused-script-runtime-tests', 'newman-sandbox-v1'],
    newman: 'supported',
    security: 'hardened-sdk-object',
    notes: 'Covers live PostMeter HeaderList, QueryParamList, CookieList, PropertyList, metadata, trailers, and message-list facades. Exact protocol message assertion chains are tracked separately under assertion.* rows.'
  })));
  rows.push(row('sdk.list.filter-object-predicate', 'sdk-objects', 'method', 'Postman SDK-style list filter(objectPredicate) shorthand for message/list objects.', 'implemented', {
    sources: ['testExamples', 'response', 'request'],
    fixtures: ['focused-script-runtime-tests', 'focused-protocol-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'hardened-sdk-object',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Live list/message facades support callback predicates and object-subset predicates with safe nested-path matching. Unsafe prototype path parts are rejected before matching.'
  }));
  rows.push(...SDK_URL_METHODS.map((name) => row(`sdk.url.${slug(name)}`, 'sdk-objects', 'method', `Postman SDK-style Url method/behavior: ${name}`, 'implemented', {
    sources: ['request'],
    fixtures: ['focused-script-runtime-tests', 'newman-sandbox-v1'],
    newman: 'supported',
    security: 'hardened-sdk-object'
  })));
  rows.push(row('sdk.live-object.constructor-prototype-parity', 'sdk-objects', 'prototype', 'Live pm.request/pm.response object constructor and prototype behavior matches Postman Collection SDK closely enough for imported scripts that inspect constructors or call SDK prototype helpers.', 'implemented', {
    sources: ['request', 'response', 'require'],
    fixtures: ['focused-script-runtime-tests', 'adversarial-sandbox-v1', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'hardened-sdk-object',
    desktopEvidence: 'row-specific-behavior',
    notes: 'require("postman-collection") exposes Postman bundled SDK constructors. Live pm.request/pm.response remain transaction-aware hardened facades that preserve the SDK-style helper/prototype method surface used by imported scripts while masking direct constructor escape paths.'
  }));

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
  rows.push(...SENDREQUEST_AUTH_ROWS.map(([id, target, status, security]) => row(`sendRequest.auth.${id}`, 'network', 'auth-helper', target, status, {
    sources: ['sendRequest', 'authorizationTypes'],
    fixtures: sendRequestAuthFixture(id),
    newman: 'supported',
    security,
    notes: id === 'oauth2-static-token'
      ? 'Covers static access-token injection. OAuth provider acquisition/refresh certification is separate live-provider validation, and JWT Bearer token generation has its own dedicated helper row.'
      : ''
  })));
  rows.push(row('sendRequest.advanced-auth-proxy', 'network', 'transport-policy', 'Implemented advanced auth/proxy/TLS/client-certificate subset for brokered script requests: Digest, Hawk, AWS Signature v4, OAuth 1.0, proxy routing, strict TLS, and configured client-certificate bindings.', 'implemented', {
    sources: ['sendRequest', 'request', 'authorizationTypes'],
    fixtures: ['differential-sendrequest-advanced', 'real-world-import-corpus', 'desktop-sendrequest-advanced-audit-v1', 'adversarial-sandbox-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'brokered',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Digest challenge retry, Hawk, AWS Signature v4, OAuth 1.0, HTTP(S) proxy routing, strict TLS validation, and configured client-certificate bindings are brokered in the parent sender. NTLM, Akamai EdgeGrid, JWT Bearer token generation, and ASAP signing are tracked by explicit auth-helper rows instead of being hidden inside this broad row.'
  }));
  rows.push(row('sendRequest.auth.ntlm', 'network', 'auth-helper', 'NTLM authentication helper parity for imported requests and brokered pm.sendRequest, including challenge/response retry behavior.', 'implemented', {
    sources: ['sendRequest', 'authorizationTypes', 'ntlmAuth'],
    fixtures: ['focused-auth-tests', 'focused-importer-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'brokered-stateful-auth',
    desktopEvidence: 'row-specific-behavior',
    notes: 'The parent sender owns the NTLM Type1/Type3 challenge/response handshake and keeps credentials/socket state outside the script worker. Proxy NTLM remains constrained by the brokered proxy transport policy.'
  }));
  rows.push(row('sendRequest.auth.akamai-edgegrid', 'network', 'auth-helper', 'Akamai EdgeGrid authentication helper parity for imported requests and brokered pm.sendRequest.', 'implemented', {
    sources: ['sendRequest', 'authorizationTypes'],
    fixtures: ['focused-auth-tests', 'focused-importer-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'brokered-signing',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Akamai EdgeGrid signing is generated by the parent sender from imported metadata or brokered pm.sendRequest auth objects. Scripts never receive raw signing keys beyond their configured auth field values.'
  }));
  rows.push(row('sendRequest.auth.jwt-bearer', 'network', 'auth-helper', 'JWT Bearer authentication helper parity, including token generation, supported signing algorithms, header/query placement, and imported helper metadata.', 'implemented', {
    sources: ['sendRequest', 'authorizationTypes'],
    fixtures: ['focused-auth-tests', 'focused-importer-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'brokered-signing',
    desktopEvidence: 'row-specific-behavior',
    notes: 'JWT Bearer tokens are generated by the parent sender with supported HMAC/RSA/ECDSA algorithms, imported metadata, claims, header/query placement, and variable interpolation. Arbitrary key-file paths remain denied.'
  }));
  rows.push(row('sendRequest.auth.asap', 'network', 'auth-helper', 'Atlassian ASAP authentication helper parity for imported requests and brokered pm.sendRequest.', 'implemented', {
    sources: ['sendRequest', 'asapAuth'],
    fixtures: ['focused-auth-tests', 'focused-importer-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unknown',
    desktop: 'required',
    security: 'brokered-signing',
    desktopEvidence: 'row-specific-behavior',
    notes: 'ASAP tokens are generated by the parent sender from imported issuer/audience/key metadata with the same JWT signing core and no script access to arbitrary local key files.'
  }));
  rows.push(row('sendRequest.file-binary-bindings', 'network', 'transport-policy', 'User-granted imported file and binary attachment bindings for brokered script requests', 'implemented', {
    sources: ['sendRequest', 'request'],
    fixtures: ['differential-sendrequest-files', 'real-world-import-corpus', 'desktop-sendrequest-files-audit-v1', 'adversarial-sandbox-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'user-granted-file-binding',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Imported and script-created file, binary, and form-data src references resolve only through workspace-reviewed file bindings. The worker never receives local file contents or arbitrary filesystem privileges; the parent sender reads approved regular files under the documented request body size cap.'
  }));

  rows.push(...COOKIE_METHODS.map((method) => row(`cookies.current.${method}`, 'cookies', 'api', `pm.cookies.${method}`, 'implemented', {
    sources: ['cookies'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  })));
  rows.push(...COOKIE_EXTENSION_METHODS.map((method) => row(`cookies.current-extension.${method}`, 'cookies', 'compat-extension', `PostMeter extension: pm.cookies.${method}`, 'implemented', {
    sources: ['cookies'],
    fixtures: ['focused-script-runtime-tests', 'newman-sandbox-v1'],
    newman: 'legacy',
    security: 'brokered',
    claimScope: 'out-of-scope',
    notes: 'Current official Postman docs list current-request pm.cookies.has/get/toObject only. PostMeter keeps set/unset as a compatibility extension for existing local scripts, but these rows are not evidence for the official default-import claim.'
  })));
  rows.push(...COOKIE_JAR_METHODS.map((method) => row(`cookies.jar.${method}`, 'cookies', 'api', `pm.cookies.jar().${method}`, 'implemented', {
    sources: ['cookies'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'brokered'
  })));
  rows.push(row('cookies.httponly-parity', 'cookies', 'behavior', 'HttpOnly script readability and mutation parity', 'implemented', {
    sources: ['cookies'],
    fixtures: ['newman-sandbox-v1', 'differential-httponly-cookies', 'desktop-httponly-cookies-audit-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'brokered',
    desktopEvidence: 'row-specific-behavior'
  }));

  for (const name of EXECUTION_ROWS) {
    rows.push(row(`execution.${name}`, 'execution', name.includes('location') ? 'property' : 'api', `pm.execution.${name}`, executionStatus(name), {
      sources: ['execution', 'workflows'],
      fixtures: executionFixture(name),
      newman: name === 'runRequest' ? 'unsupported' : 'supported',
      desktop: name === 'runRequest' ? 'required' : 'not-required',
      security: 'brokered',
      desktopEvidence: name === 'runRequest' ? 'row-specific-behavior' : undefined
    }));
  }

  rows.push(row('visualizer.set', 'visualizer', 'api', 'pm.visualizer.set(layout, data, options)', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'postman-desktop-visualizer-handlebars-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'isolated-renderer',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('visualizer.clear', 'visualizer', 'api', 'pm.visualizer.clear()', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'postman-desktop-visualizer-handlebars-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'isolated-renderer',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('visualizer.pm.getData', 'visualizer', 'api', 'pm.getData(callback)', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'postman-desktop-visualizer-handlebars-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'isolated-renderer',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('visualizer.external-assets', 'visualizer', 'asset-policy', 'Reviewed external visualizer assets', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'postman-desktop-visualizer-handlebars-audit-v1', 'adversarial-sandbox-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('visualizer.handlebars-full-parity', 'visualizer', 'template-runtime', 'Full Postman visualizer Handlebars runtime parity, including precompiled templates, helpers, decorators, whitespace behavior, options, partials, SafeString, and inline-render timing.', 'implemented', {
    sources: ['visualizer'],
    fixtures: ['newman-sandbox-v1', 'postman-desktop-visualizer-handlebars-audit-v1', 'adversarial-sandbox-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'isolated-renderer',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Implemented with a vendored, integrity-checked handlebars@4.7.9 browser runtime loaded in a separate vm context for isolated visualizer compilation. Postman Desktop 11.71.7 packages handlebars@4.7.8; PostMeter stays on the patched 4.7-compatible line because current npm advisories cover <=4.7.8.'
  }));

  for (const method of ['get', 'set', 'unset']) {
    rows.push(row(`vault.${method}`, 'vault', 'api', `pm.vault.${method}`, 'implemented', {
      sources: ['vault'],
      fixtures: ['newman-sandbox-v1', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
      newman: 'unsupported',
      desktop: 'required',
      security: 'brokered-encrypted-store',
      desktopEvidence: 'row-specific-behavior'
    }));
  }
  rows.push(row('vault.prompt-denial-reset-audit', 'vault', 'ux-policy', 'Vault prompt, denial, reset, and audit UX', 'implemented', {
    sources: ['vault'],
    fixtures: ['desktop-observation-template', 'real-world-import-corpus', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-encrypted-store',
    desktopEvidence: 'row-specific-behavior'
  }));

  rows.push(row('require.pm.team-package', 'packages', 'api', "pm.require('@team/package')", 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('require.pm.npm-package', 'packages', 'api', "pm.require('npm:package@version')", 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('require.pm.npm-scoped-package', 'packages', 'api', "pm.require('npm:@scope/package@version')", 'implemented', {
    sources: ['require'],
    fixtures: ['focused-script-runtime-tests', 'real-world-import-corpus', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('require.pm.latest-package', 'packages', 'desktop-workflow', "pm.require('npm:package') and pm.require('jsr:@scope/package') latest-version imports resolve through the reviewed package workflow.", 'implemented', {
    sources: ['require'],
    fixtures: ['focused-script-runtime-tests', 'real-world-import-corpus', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Postman supports omitting @version-number to use the app-selected latest package version. PostMeter resolves the current latest version parent-side during fetch/review, records the resolved packageVersion in the cache entry, and then executes only the reviewed cached package with no script-time registry access.'
  }));
  rows.push(row('require.pm.jsr-package', 'packages', 'desktop-workflow', "Reviewed fetch/cache workflow for exact pm.require('jsr:@scope/package@version') references", 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache',
    desktopEvidence: 'row-specific-behavior',
    notes: 'PostMeter can fetch exact JSR package metadata/modules with checksum verification and save reviewed cache entries. Runtime execution for native ESM JSR modules is tracked by require.pm.jsr-esm-module-semantics.'
  }));
  rows.push(row('require.pm.online-fetch-review', 'packages', 'desktop-workflow', 'Postman Package Library and external package fetch/review workflow can satisfy missing imported package references before first run.', 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'real-world-import-corpus', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Parent-side package fetch workflow resolves exact and latest-form npm/JSR package references plus reviewed HTTPS team-package source URLs into the same SHA-256 reviewed cache used by the script runtime. Scripts still cannot fetch, install, update, or resolve packages at runtime.'
  }));
  rows.push(row('require.builtin.full-library-parity', 'packages', 'module', 'Version-pinned full behavior for Postman bundled libraries and Postman-listed NodeJS module facades, replacing hand-rolled subset facades or proving subset differences are outside the current Postman surface.', 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'postman-desktop-builtin-package-audit-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'version-pinned-vm-bundle',
    desktopEvidence: 'row-specific-behavior',
    notes: 'PostMeter loads the generated Postman postman-sandbox@6.2.2 browser bootcode bundle inside the script VM with Browserify entry modules disabled, then exposes only the normal allowlisted require specifiers. Ajv, Chai, Cheerio, CryptoJS, csv-parse/lib/sync, Lodash, Moment, Postman Collection SDK, UUID, XML2JS, and legacy JSON/TV4/Backbone package surfaces come from that pinned bundle. Timers and stream remain script-safe PostMeter facades with brokered timer behavior because the raw Browserify timer/stream shims assume window/ambient timers; this is an explicit subset boundary, not host Node access.'
  }));
  rows.push(row('require.pm.commonjs-bundle-semantics', 'packages', 'module-loader', 'Reviewed team/external package cache supports the CommonJS/package semantics used by imported Postman packages, including multi-file bundles, package metadata, dependency resolution, cache behavior, circular dependencies, and default-export interop.', 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1', 'real-world-import-corpus', 'postman-desktop-commonjs-package-audit-v1', 'adversarial-sandbox-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Reviewed package cache entries now support file maps, package metadata, entrypoint resolution, JSON modules, relative/directory/extension resolution, declared dependency aliases and subpaths, per-module cache behavior, circular dependencies, default export object patterns, and deterministic loader errors while preserving exact integrity checks, caps, and host-module denials. Native ESM package execution is tracked separately for JSR packages.'
  }));
  rows.push(row('require.pm.jsr-esm-module-semantics', 'packages', 'module-loader', 'Native ESM execution semantics for reviewed JSR packages, including import/export syntax, dependency graph loading, default/named exports, and ESM error behavior inside the isolated VM.', 'implemented', {
    sources: ['require'],
    fixtures: ['focused-script-runtime-tests', 'adversarial-sandbox-v1', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'reviewed-cache-esm-loader',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Reviewed JSR-style ESM files are transpiled into the existing integrity-checked VM package loader with default/named exports, constrained imports/re-exports, cache behavior, and deterministic unsupported-syntax errors. Runtime registry, filesystem, node:, native module, and unreviewed dependency access remain denied.'
  }));
  rows.push(...BUILTIN_LIBRARIES.map((name) => row(`require.builtin.${slug(name)}`, 'packages', 'module', `require('${name}')`, 'implemented', {
    sources: ['require'],
    fixtures: ['newman-sandbox-v1'],
    newman: 'supported',
    security: 'version-pinned-vm-bundle'
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
    security: name === 'stream' || name === 'timers' ? 'brokered-facade' : 'version-pinned-vm-bundle'
  })));
  rows.push(...GLOBAL_OBJECTS.map((name) => row(`global.${slug(name)}`, 'globals', 'global', name, globalStatus(name), {
    sources: ['require'],
    fixtures: globalFixture(name),
    newman: 'supported',
    security: name === 'Function' ? 'dynamic-code-review' : 'vm-global'
  })));
  rows.push(row('global.dynamic-code-and-host-like-globals-audit', 'globals', 'source-audit', 'Current Postman Desktop and Newman behavior for direct eval, indirect eval, top-level Buffer, fetch, XMLHttpRequest, WebSocket, WebAssembly, globalThis, process, and other host-like globals is audited and PostMeter matches it inside the isolated VM without raw host access.', 'implemented', {
    sources: ['sandboxOverview'],
    fixtures: ['newman-sandbox-v1', 'differential-dynamic-host-globals', 'desktop-dynamic-host-globals-audit-v1'],
    newman: 'supported',
    desktop: 'required',
    security: 'dynamic-code-review',
    desktopEvidence: 'row-specific-behavior'
  }));

  for (const eventName of ['prerequest', 'test', 'beforeQuery', 'beforeInvoke', 'onIncomingMessage', 'afterResponse']) {
    rows.push(row(`info.eventName.${eventName}`, 'metadata', 'property', `pm.info.eventName:${eventName}`, infoStatus(eventName), {
      sources: ['info'],
      fixtures: infoEventFixture(eventName),
      newman: eventName === 'beforeQuery' || eventName === 'beforeInvoke' || eventName === 'onIncomingMessage' || eventName === 'afterResponse' ? 'unsupported' : 'supported',
      desktop: eventName === 'beforeQuery' || eventName === 'beforeInvoke' || eventName === 'onIncomingMessage' || eventName === 'afterResponse' ? 'required' : 'not-required',
      security: 'read-only',
      desktopEvidence: eventName === 'beforeQuery' || eventName === 'beforeInvoke' || eventName === 'onIncomingMessage' || eventName === 'afterResponse'
        ? 'row-specific-behavior'
        : undefined
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
    fixtures: ['protocol-script-hooks', 'postman-desktop-grpc-transport-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('grpc.hook.onMessage', 'grpc', 'protocol-hook', 'gRPC On message scripts', 'implemented', {
    sources: ['grpcScripts'],
    fixtures: ['protocol-script-hooks', 'postman-desktop-grpc-transport-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('grpc.hook.afterResponse', 'grpc', 'protocol-hook', 'gRPC After response scripts', 'implemented', {
    sources: ['grpcScripts'],
    fixtures: ['protocol-script-hooks', 'postman-desktop-grpc-transport-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('grpc.pm.message', 'grpc', 'api', 'pm.message data/name/type/toJSON surface for gRPC On message scripts', 'implemented', {
    sources: ['message', 'grpcInterface'],
    fixtures: ['protocol-script-hooks', 'postman-desktop-grpc-transport-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'hardened-sdk-object',
    desktopEvidence: 'row-specific-behavior',
    notes: 'The base message object is available for gRPC streaming scripts. Timestamp Date-object parity is tracked separately by grpc.pm.message.timestamp-date.'
  }));
  rows.push(row('grpc.pm.message.timestamp-date', 'grpc', 'api', 'pm.message.timestamp is exposed as a Postman-compatible Date object in gRPC On message scripts.', 'implemented', {
    sources: ['message', 'grpcInterface'],
    fixtures: ['focused-script-runtime-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'hardened-sdk-object',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Message timestamps are exposed as VM-realm Date instances for script checks and JSON serialization while masking direct constructor escape paths.'
  }));
  rows.push(row('grpc.live-desktop-transport', 'grpc', 'desktop-transport', 'Native desktop gRPC transport execution for imported gRPC requests', 'implemented', {
    sources: ['grpcScripts', 'grpcInterface'],
    fixtures: ['protocol-script-hooks', 'postman-desktop-grpc-transport-audit-v1', 'real-world-import-corpus', 'adversarial-sandbox-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Imported gRPC requests now execute through a parent-owned @grpc/grpc-js transport with proto loading, metadata, messages, streaming method types, status/trailer normalization, cancellation/error shape, and isolated script hooks. Scripts can mutate metadata/messages/method path/target URL through Postman-style SDK objects but cannot supply raw sockets or post-hook filesystem/TLS/proto paths.'
  }));
  rows.push(row('graphql.http-body', 'graphql', 'import-surface', 'GraphQL HTTP body, variables, and scripts', 'implemented', {
    sources: ['graphqlHttp'],
    fixtures: ['protocol-script-hooks', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unknown',
    desktop: 'required',
    security: 'brokered-protocol',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('graphql.client-interface-hooks', 'graphql', 'protocol-hook', 'GraphQL client Before query and After response script hooks from Postman GraphQL requests, distinct from HTTP-body GraphQL mode.', 'implemented', {
    sources: ['scriptRunOrder', 'graphqlInterface'],
    fixtures: ['protocol-script-hooks', 'focused-protocol-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Imported GraphQL client Before query and After response hooks run through the same isolated script lifecycle as Postman protocol hooks, with request mutation committed before the parent-owned brokered GraphQL HTTP exchange.'
  }));
  rows.push(row('graphql.subscription.response-messages', 'graphql', 'protocol-stream', 'GraphQL subscription/multiple-response message streams expose Postman-compatible pm.response.messages behavior.', 'implemented', {
    sources: ['graphqlInterface', 'response', 'testExamples'],
    fixtures: ['focused-protocol-tests', 'focused-script-runtime-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'brokered-protocol',
    desktopEvidence: 'row-specific-behavior',
    notes: 'GraphQL subscription-style broker responses are normalized from explicit response.messages, text/event-stream, multipart GraphQL, JSON arrays, or messages/responses payloads into hardened pm.response.messages lists.'
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
    fixtures: ['local-mock-scripts', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'mock-broker',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('mock.sendExample', 'mock', 'api', 'pm.mock.sendExample', 'implemented', {
    sources: ['mock'],
    fixtures: ['local-mock-scripts', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'mock-broker',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('mock.path-variables', 'mock', 'behavior', 'Local mock path variable matching', 'implemented', {
    sources: ['mock'],
    fixtures: ['local-mock-scripts', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'mock-broker',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(row('mock.req-surface', 'mock', 'api', 'Local mock req helper surface: method, url, path, params, query, headers, body, and json().', 'implemented', {
    sources: ['mock'],
    fixtures: ['local-mock-scripts', 'focused-local-mock-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'mock-broker',
    desktopEvidence: 'row-specific-behavior',
    notes: 'Covers the request fields used by Postman local mock examples, including path-variable params populated by the matcher.'
  }));
  rows.push(row('mock.res-surface', 'mock', 'api', 'Local mock res helper surface: status/statusCode, set/header, json, send, end, and toJSON().', 'implemented', {
    sources: ['mock'],
    fixtures: ['local-mock-scripts', 'focused-local-mock-tests', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'mock-broker',
    desktopEvidence: 'row-specific-behavior'
  }));
  rows.push(...STATE_METHODS.map((method) => row(`state.${method}`, 'mock-state', 'api', `pm.state.${method}`, 'implemented', {
    sources: ['state'],
    fixtures: ['local-mock-scripts', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'],
    newman: 'unsupported',
    desktop: 'required',
    security: 'bounded-json-store',
    desktopEvidence: 'row-specific-behavior'
  })));

  for (const name of [
    'script-events',
    'request-ids',
    'protocol-profiles',
    'auth-metadata',
    'auth-inheritance',
    'package-references',
    'visualizer-assets',
    'cookie-allowlists',
    'vault-metadata',
    'mock-scripts',
    'request-examples',
    'request-variables',
    'collection-certificates',
    'body-modes',
    'file-binary-bodies'
  ]) {
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
      postmanDesktop: POSTMAN_DESKTOP_TARGET,
      postmanSandbox: POSTMAN_SANDBOX_TARGET,
      postmanDesktopRuntime: POSTMAN_DESKTOP_RUNTIME_TARGET,
      newman: NEWMAN_TARGET,
      newmanRuntime: NEWMAN_RUNTIME_TARGET,
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
  const fixtureRefs = options.fixtures ? [...options.fixtures] : [];
  if ((options.desktop || 'not-required') === 'required' && !fixtureRefs.includes('desktop-runtime-source-audit-v1')) {
    fixtureRefs.push('desktop-runtime-source-audit-v1');
  }
  const desktopObservation = options.desktop || 'not-required';
  return {
    id,
    area,
    claimScope: options.claimScope || 'default-import',
    kind,
    target,
    status,
    sourceRefs: options.sources || ['sandboxOverview'],
    fixtureRefs,
    differential: {
      newman: options.newman || 'unknown',
      desktopObservation,
      desktopEvidence: options.desktopEvidence || (desktopObservation === 'required' ? 'source-audit' : 'not-required')
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

function assertionSources(name) {
  if (name.includes('jsonSchema')) {
    return ['response', 'testExpect', 'testExamples'];
  }
  if (name.startsWith('pm.response.')) {
    return ['response', 'testExpect', 'testExamples'];
  }
  return ['testExpect', 'testExamples'];
}

function assertionBlockerSources(id) {
  if (id.includes('request.')) {
    return ['request', 'testExamples'];
  }
  if (id.includes('response.messages') || id.includes('metadata') || id.includes('trailer') || id.includes('message')) {
    return ['response', 'request', 'testExamples'];
  }
  if (id.includes('jsonSchema')) {
    return ['response', 'testExpect', 'testExamples'];
  }
  return ['testExpect', 'testExamples'];
}

function assertionBlockerNeedsDesktop(id) {
  return id.includes('request.')
    || id.includes('response.messages')
    || id.includes('metadata')
    || id.includes('trailer')
    || id.includes('message');
}

function assertionBlockerFixture(id) {
  const fixtures = ['focused-script-runtime-tests'];
  if (id.includes('request.') || id.includes('response.messages') || id.includes('metadata') || id.includes('trailer') || id.includes('message')) {
    fixtures.push('focused-protocol-tests', 'postman-desktop-row-specific-behavior-audit-v1');
  } else {
    fixtures.push('newman-sandbox-v1');
  }
  return fixtures;
}

function assertionBlockerNotes(id) {
  if (id === 'pm.response.to.have.status-name') {
    return 'Status assertions accept numeric codes and Postman-style status-text strings such as pm.response.to.have.status("Created").';
  }
  if (id === 'pm.expect.full-chai-bdd-surface') {
    return 'pm.expect now covers the Chai BDD assertion chains commonly emitted by complex Postman imports, including deep/nested/own/all/any/ordered chains, members, throw, type, property, respondTo, instanceOf, and safe jsonSchema. Exact upstream Chai failure text is intentionally not a security boundary.';
  }
  if (id === 'pm.expect.to.have.jsonSchema') {
    return 'pm.expect(value).to.have.jsonSchema(schema, options?) uses the same bounded AJV-compatible validator as response/message schema assertions.';
  }
  if (id.includes('messages') || id.includes('metadata') || id.includes('trailer')) {
    return 'Protocol metadata, trailer, message, and message-list assertions are implemented on hardened request/response facades with row-specific Desktop evidence metadata and focused protocol tests.';
  }
  return '';
}

function implementedAssertionFixture(name) {
  if (name === 'pm.expect.basic' || name === 'pm.response.to.have.status') {
    return ['differential-http-core', 'newman-sandbox-v1'];
  }
  if (name.startsWith('pm.response.to.be.') || name === 'pm.response.to.not.be.error') {
    return ['focused-script-runtime-tests'];
  }
  if (EXPECT_ROWS.includes(name)) {
    return ['focused-script-runtime-tests', 'newman-sandbox-v1'];
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
  if (name === 'cookies') {
    return ['focused-script-runtime-tests'];
  }
  return [];
}

function sendRequestAuthFixture(id) {
  if (['digest', 'hawk', 'aws-v4'].includes(id)) {
    return ['differential-sendrequest-advanced', 'focused-script-runtime-tests'];
  }
  if (id === 'oauth1') {
    return ['focused-script-runtime-tests', 'desktop-sendrequest-advanced-audit-v1'];
  }
  return ['newman-sandbox-v1', 'focused-script-runtime-tests'];
}

function executionStatus(name) {
  if (EXECUTION_ROWS.includes(name)) {
    return 'implemented';
  }
  return 'not-started';
}

function executionFixture(name) {
  if (name === 'runRequest') {
    return ['newman-sandbox-v1', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'];
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

function infoEventFixture(eventName) {
  if (eventName === 'test' || eventName === 'prerequest') {
    return ['differential-http-core', 'newman-sandbox-v1'];
  }
  if (eventName === 'beforeQuery') {
    return ['protocol-script-hooks', 'desktop-observation-template', 'postman-desktop-row-specific-behavior-audit-v1'];
  }
  return ['protocol-script-hooks', 'desktop-observation-template', 'postman-desktop-grpc-transport-audit-v1'];
}

function importStatus(name) {
  if ([
    'script-events',
    'request-ids',
    'protocol-profiles',
    'auth-metadata',
    'auth-inheritance',
    'package-references',
    'visualizer-assets',
    'cookie-allowlists',
    'vault-metadata',
    'mock-scripts',
    'request-examples',
    'request-variables',
    'collection-certificates',
    'body-modes',
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
    'auth-metadata',
    'auth-inheritance',
    'visualizer-assets',
    'cookie-allowlists',
    'vault-metadata',
    'request-examples',
    'request-variables',
    'collection-certificates',
    'body-modes',
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
  NEWMAN_RUNTIME_TARGET,
  POSTMAN_DESKTOP_RUNTIME_TARGET,
  POSTMAN_DESKTOP_TARGET,
  POSTMAN_SANDBOX_TARGET,
  buildPostmanParityMatrix
};
