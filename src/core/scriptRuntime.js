const crypto = require('node:crypto');
const nodePath = require('node:path');
const nodeQuerystring = require('node:querystring');
const nodeUrl = require('node:url');
const vm = require('node:vm');
const {
  getVariable,
  setVariable,
  unsetVariable,
  variableObservableValue
} = require('./variableScope');
const {
  resolveDynamicVariable
} = require('./dynamicVariables');
const {
  POSTMAN_SANDBOX_BUILTIN_PACKAGE_VERSIONS,
  loadPostmanBuiltinPackage
} = require('./postmanBuiltinPackages');
const {
  scriptPackageBundleIntegrity,
  scriptPackageIntegrity
} = require('./sandboxPackageCache');
const {
  VISUALIZER_HANDLEBARS_SOURCE_VERSION,
  getVisualizerHandlebarsSource
} = require('./visualizerHandlebarsBundle');

const DEFAULT_SCRIPT_TIMEOUT_MILLIS = 3 * 60 * 1000;
const MAX_SCRIPT_LENGTH = 256 * 1024;
const MAX_SCRIPT_LOGS = 100;
const MAX_SCRIPT_LOG_LENGTH = 4096;
const MAX_SCRIPT_RESULT_BYTES = 1024 * 1024;
const MAX_MOCK_RESPONSE_BODY_LENGTH = 512 * 1024;
const MAX_PENDING_TIMERS = 64;
const MAX_TIMER_DELAY_MILLIS = 30_000;
const MAX_BROKER_REQUESTS = 256;
const MAX_EXECUTION_RUN_REQUESTS_PER_SCRIPT = 10;
const MAX_VISUALIZER_TEMPLATE_LENGTH = 64 * 1024;
const MAX_VISUALIZER_DATA_BYTES = 256 * 1024;
const MAX_VISUALIZER_HTML_LENGTH = 256 * 1024;
const MAX_VISUALIZER_EACH_ITEMS = 500;
const MAX_VISUALIZER_TEMPLATE_DEPTH = 5;
const MAX_VISUALIZER_PARTIALS = 32;
const MAX_VISUALIZER_HELPERS = 32;
const MAX_VISUALIZER_DECORATORS = 16;
const MAX_VISUALIZER_PARTIAL_LENGTH = 32 * 1024;
const MAX_VISUALIZER_ASSETS = 16;
const MAX_VISUALIZER_ASSET_BYTES = 256 * 1024;
const VISUALIZER_BLOCK_NAME_PATTERN = '[A-Za-z0-9_-]{1,64}';
const VISUALIZER_UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);
const VISUALIZER_BLOCK_HELPERS = new Set(['each', 'if', 'unless', 'with']);
const MAX_SCRIPT_PACKAGE_COUNT = 32;
const MAX_SCRIPT_PACKAGE_FILES = 128;
const MAX_SCRIPT_PACKAGE_SOURCE_BYTES = 128 * 1024;
const MAX_SCRIPT_PACKAGE_EXPORT_KEYS = 64;
const MAX_SCRIPT_PACKAGE_DEPENDENCIES = 32;
const MAX_SCRIPT_PACKAGE_LOAD_DEPTH = 16;
const SCRIPT_PACKAGE_SPECIFIER_PATTERN = /^(?:npm:(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)(?:@\d[\w.+-]*)?|jsr:@[a-z0-9._-]+\/[a-z0-9._-]+(?:@\d[\w.+-]*)?|@[a-z0-9._-]+\/[a-z0-9._-]+)$/i;
const POSTMAN_BUILTIN_EXPORT_KEY_LIMITS = Object.freeze({
  ajv: 16,
  assert: 32,
  backbone: 64,
  buffer: 32,
  chai: 32,
  cheerio: 32,
  'crypto-js': 128,
  'csv-parse/lib/sync': 4,
  events: 16,
  json: 8,
  lodash: 512,
  moment: 128,
  path: 32,
  'postman-collection': 128,
  punycode: 16,
  querystring: 16,
  stream: 32,
  'string-decoder': 8,
  timers: 32,
  tv4: 64,
  url: 32,
  util: 64,
  uuid: 8,
  xml2js: 16
});
const SCRIPT_PACKAGE_DEFINITIONS = Object.freeze({
  ajv: postmanBuiltinPackageDefinition('ajv'),
  assert: postmanBuiltinPackageDefinition('assert'),
  backbone: postmanBuiltinPackageDefinition('backbone'),
  buffer: postmanBuiltinPackageDefinition('buffer'),
  chai: postmanBuiltinPackageDefinition('chai'),
  cheerio: postmanBuiltinPackageDefinition('cheerio'),
  'crypto-js': postmanBuiltinPackageDefinition('crypto-js'),
  'csv-parse/lib/sync': postmanBuiltinPackageDefinition('csv-parse/lib/sync'),
  events: postmanBuiltinPackageDefinition('events'),
  json: postmanBuiltinPackageDefinition('json'),
  lodash: postmanBuiltinPackageDefinition('lodash'),
  moment: postmanBuiltinPackageDefinition('moment'),
  path: postmanBuiltinPackageDefinition('path'),
  'postman-collection': postmanBuiltinPackageDefinition('postman-collection'),
  punycode: postmanBuiltinPackageDefinition('punycode'),
  querystring: postmanBuiltinPackageDefinition('querystring'),
  stream: Object.freeze({ factory: createStreamModuleFacade, maxExportKeys: 8 }),
  'string-decoder': postmanBuiltinPackageDefinition('string-decoder'),
  timers: Object.freeze({ factory: createTimersModuleFacade, maxExportKeys: 8 }),
  tv4: postmanBuiltinPackageDefinition('tv4'),
  url: postmanBuiltinPackageDefinition('url'),
  util: postmanBuiltinPackageDefinition('util'),
  uuid: postmanBuiltinPackageDefinition('uuid'),
  xml2js: postmanBuiltinPackageDefinition('xml2js')
});
const SCRIPT_PACKAGE_NAMES = Object.freeze(Object.keys(SCRIPT_PACKAGE_DEFINITIONS).sort());
const SCRIPT_PACKAGE_ALIASES = new Map([
  ['_', 'lodash'],
  ['cryptojs', 'crypto-js'],
  ['csv-parse/sync', 'csv-parse/lib/sync'],
  ['string_decoder', 'string-decoder']
]);
const WORD_ARRAY_BYTES = new WeakMap();
const SCRIPT_BUFFER_BYTES = new WeakMap();
const MOMENT_INSTANCES = new WeakSet();
const VISUALIZER_SAFE_STRING_VALUES = new WeakMap();
const POSTMAN_ABSENT_GLOBALS = Object.freeze([
  'globalThis',
  'WebAssembly'
]);
const SKIP_REQUEST_SIGNAL = Symbol('postmeter.skipRequest');

function postmanBuiltinPackageDefinition(name) {
  return Object.freeze({
    factory: (registry) => createPostmanBuiltinPackage(name, registry),
    hardenExport: false,
    maxExportKeys: POSTMAN_BUILTIN_EXPORT_KEY_LIMITS[name] || MAX_SCRIPT_PACKAGE_EXPORT_KEYS,
    version: POSTMAN_SANDBOX_BUILTIN_PACKAGE_VERSIONS[name] || 'postman-sandbox-bundled'
  });
}

function runPostmanScript(scriptText, context = {}, options = {}) {
  const source = String(scriptText || '');
  if (!source.trim()) {
    return emptyScriptResult();
  }
  if (source.length > MAX_SCRIPT_LENGTH) {
    return {
      passed: false,
      tests: [],
      error: `Script cannot exceed ${MAX_SCRIPT_LENGTH} characters.`,
      logs: []
    };
  }

  const tests = [];
  const logs = [];
  const visualizer = createVisualizerState();
  let packageRegistry;
  try {
    packageRegistry = createPackageRegistryState(context.sandboxPackages || options.sandboxPackages);
  } catch (error) {
    return {
      passed: false,
      tests,
      error: errorMessage(error),
      logs
    };
  }
  const scriptRequire = packageRequireApi(packageRegistry);
  const vmContextRef = { current: null };
  const runtimeGlobals = createPostmanRuntimeGlobals({ vmContextRef });
  const lexicalGlobals = createPostmanLexicalGlobals({ vmContextRef });
  const environmentVariables = context.environment?.variables || [];
  const environmentName = context.environment?.name || '';
  const collectionVariables = context.collectionVariables || [];
  const folderVariables = context.folderVariables || [];
  const globals = context.globals || [];
  const localVariables = context.localVariables || [];
  const legacyExecution = {};
  const pmApi = createPmApi({
    collectionVariables,
    environmentVariables,
    environmentName,
    folderVariables,
    globals,
    localVariables,
    logs,
    message: context.message,
    request: context.request,
    response: context.response,
    tests,
    packageRegistry,
    visualizer
  });
  const sandbox = {
    ...runtimeGlobals,
    pm: pmApi,
    postman: createLegacyPostmanApi({
      environmentVariables,
      execution: legacyExecution,
      globals
    }),
    console: createConsole(logs),
    Handlebars: createVisualizerHandlebarsApi(visualizer),
    clearInterval: unsupportedApi('clearInterval'),
    clearTimeout: unsupportedApi('clearTimeout'),
    require: scriptRequire,
    setInterval: unsupportedApi('setInterval'),
    setTimeout: unsupportedApi('setTimeout')
  };
  hardenSandboxValue(sandbox);
  const vmContext = vm.createContext(sandbox, {
    codeGeneration: {
      strings: true,
      wasm: false
    },
    name: 'postmeter-script'
  });
  vmContextRef.current = vmContext;
  removePostmanAbsentGlobals(vmContext);
  installDateInstanceofBridge(vmContext);
  attachPackageRegistryContext(packageRegistry, vmContext, {
    fileFacade: lexicalGlobals.scope.File,
    timeoutMillis: Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS)
  });
  try {
    attachPostmanLegacyPackageGlobals(vmContext, scriptRequire);
  } catch (error) {
    return {
      passed: false,
      tests,
      error: errorMessage(error),
      logs
    };
  }

  try {
    const script = new vm.Script(scriptSourceForRuntime(source, {
      lexicalGlobals,
      lexicalPrefix: 'postmeterScript'
    }), {
      filename: options.filename || 'postmeter-script.js'
    });
    script.runInContext(vmContext, {
      timeout: Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS)
    });
  } catch (error) {
    return {
      passed: false,
      tests,
      error: error.message || String(error),
      logs
    };
  }

  return {
    passed: tests.every((test) => test.passed),
    tests,
    error: '',
    logs,
    visualizer: visualizerResult(visualizer)
  };
}

async function runPostmanScriptAsync(scriptText, context = {}, options = {}) {
  const source = String(scriptText || '');
  if (!source.trim()) {
    return emptyScriptResultWithCommit();
  }
  if (source.length > MAX_SCRIPT_LENGTH) {
    return {
      passed: false,
      tests: [],
      error: `Script cannot exceed ${MAX_SCRIPT_LENGTH} characters.`,
      logs: [],
      commitSideEffects: false
    };
  }

  const tests = [];
  const logs = [];
  const visualizer = createVisualizerState();
  let packageRegistry;
  try {
    packageRegistry = createPackageRegistryState(context.sandboxPackages || options.sandboxPackages);
  } catch (error) {
    return {
      passed: false,
      tests,
      error: errorMessage(error),
      logs,
      commitSideEffects: false
    };
  }
  const scriptRequire = packageRequireApi(packageRegistry);
  const vmContextRef = { current: null };
  const fatalErrors = [];
  const execution = {};
  const mutableRequest = cloneJson(context.request || {});
  const mock = createMockRuntimeState(context.mock);
  const environmentVariables = context.environment?.variables || [];
  const environmentName = context.environment?.name || '';
  const collectionVariables = context.collectionVariables || [];
  const folderVariables = context.folderVariables || [];
  const localVariables = context.localVariables || [];
  const globals = context.globals || [];
  const iterationData = normalizeIterationData(context.iterationData);
  const tracker = createAsyncTracker({
    broker: options.broker,
    fatalErrors,
    timeoutMillis: Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS)
  });
  packageRegistry.tracker = tracker;
  const runtimeGlobals = createPostmanRuntimeGlobals({ tracker, vmContextRef });
  const lexicalGlobals = createPostmanLexicalGlobals({ vmContextRef });
  const pmApi = createAsyncPmApi({
    broker: options.broker,
    collectionVariables,
    currentRequestCookies: context.currentRequestCookies,
    cookieAccessEnabled: context.scriptCookieAccessEnabled !== false,
    environmentVariables,
    environmentName,
    execution,
    eventName: context.eventName,
    executionLocation: context.executionLocation,
    folderVariables,
    globals,
    iteration: context.iteration,
    iterationCount: context.iterationCount,
    iterationData,
    localVariables,
    logs,
    message: context.message,
    mock,
    request: mutableRequest,
    response: context.response,
    tests,
    tracker,
    packageRegistry,
    visualizer
  });
  const sandbox = {
    ...runtimeGlobals,
    pm: pmApi,
    postman: createLegacyPostmanApi({
      environmentVariables,
      execution,
      globals
    }),
    console: createConsole(logs),
    Handlebars: createVisualizerHandlebarsApi(visualizer),
    clearInterval: tracker.clearInterval,
    clearTimeout: tracker.clearTimeout,
    setInterval: tracker.setInterval,
    setTimeout: tracker.setTimeout,
    require: scriptRequire
  };
  if (mock) {
    sandbox.req = mockRequestApi(mock);
    sandbox.res = mockResponseApi(mock);
  }
  hardenSandboxValue(sandbox);
  const vmContext = vm.createContext(sandbox, {
    codeGeneration: {
      strings: true,
      wasm: false
    },
    name: 'postmeter-script'
  });
  vmContextRef.current = vmContext;
  removePostmanAbsentGlobals(vmContext);
  installDateInstanceofBridge(vmContext);
  attachPackageRegistryContext(packageRegistry, vmContext, {
    fileFacade: lexicalGlobals.scope.File,
    timeoutMillis: Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS)
  });
  try {
    attachPostmanLegacyPackageGlobals(vmContext, scriptRequire);
  } catch (error) {
    return boundedScriptResult({
      passed: false,
      tests,
      error: errorMessage(error),
      logs,
      commitSideEffects: false,
      execution,
      request: mutableRequest,
      mock: mockResult(mock),
      visualizer: visualizerResult(visualizer)
    });
  }

  try {
    const script = new vm.Script(scriptSourceForRuntime(source, {
      lexicalGlobals,
      lexicalPrefix: 'postmeterAsyncScript',
      mock
    }), {
      filename: options.filename || 'postmeter-script.js'
    });
    const returned = script.runInContext(vmContext, {
      timeout: Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS)
    });
    if (mock && returned && typeof returned.then === 'function') {
      applyMockReturnedValue(mock, await returned);
    } else if (mock) {
      applyMockReturnedValue(mock, returned);
    }
    await tracker.waitForIdle();
  } catch (error) {
    if (isSkipRequestSignal(error)) {
      return skippedScriptResult({
        tests,
        logs,
        execution,
        request: mutableRequest,
        mock,
        visualizer
      });
    }
    return boundedScriptResult({
      passed: false,
      tests,
      error: error.message || String(error),
      logs,
      commitSideEffects: false,
      execution,
      request: mutableRequest,
      mock: mockResult(mock),
      visualizer: visualizerResult(visualizer)
    });
  }

  if (fatalErrors.length) {
    return boundedScriptResult({
      passed: false,
      tests,
      error: fatalErrors[0],
      logs,
      commitSideEffects: false,
      execution,
      request: mutableRequest,
      mock: mockResult(mock),
      visualizer: visualizerResult(visualizer)
    });
  }

  return boundedScriptResult({
    passed: tests.every((test) => test.passed),
    tests,
    error: '',
    logs,
    commitSideEffects: true,
    execution,
    request: mutableRequest,
    mock: mockResult(mock),
    visualizer: visualizerResult(visualizer)
  });
}

function scriptSourceForRuntime(source, options = {}) {
  const bridgeName = installPostmanLexicalBridge(options.lexicalGlobals, options.lexicalPrefix);
  const bridgeLiteral = JSON.stringify(bridgeName);
  const body = options.mock
    ? `(async function __postmeterMockScript__() {\n${source}\n}).call(undefined)`
    : source;
  if (!bridgeName) {
    return body;
  }
  return [
    `;(function __postmeterWithLexicalGlobals__(__postmeterLexicalScope__) {`,
    `  delete this[${bridgeLiteral}];`,
    '  with (__postmeterLexicalScope__) {',
    options.mock ? `return ${body};` : body,
    '  }',
    `}).call(this, this[${bridgeLiteral}]);`
  ].join('\n');
}

function installPostmanLexicalBridge(lexicalGlobals, prefix = 'postmeterScript') {
  if (!lexicalGlobals || !lexicalGlobals.vmContext || !lexicalGlobals.scope) {
    return '';
  }
  const bridgeName = `__${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  lexicalGlobals.vmContext[bridgeName] = lexicalGlobals.scope;
  return bridgeName;
}

function createPostmanLexicalGlobals({ vmContextRef } = {}) {
  const scope = Object.create(null);
  Object.defineProperties(scope, {
    Buffer: {
      configurable: true,
      enumerable: false,
      value: createBufferModuleFacade().Buffer,
      writable: true
    },
    File: {
      configurable: true,
      enumerable: false,
      value: createFileFacade(vmContextRef),
      writable: true
    }
  });
  hardenSandboxValue(scope.Buffer);
  hardenSandboxValue(scope.File);
  return {
    get vmContext() {
      return vmContextRef?.current;
    },
    scope
  };
}

function removePostmanAbsentGlobals(vmContext) {
  try {
    const source = POSTMAN_ABSENT_GLOBALS
      .map((name) => `delete this[${JSON.stringify(name)}];`)
      .join('\n');
    vm.runInContext(source, vmContext, { timeout: 50 });
  } catch {
    for (const name of POSTMAN_ABSENT_GLOBALS) {
      try {
        delete vmContext[name];
      } catch {
        vmContext[name] = undefined;
      }
    }
  }
}

function installDateInstanceofBridge(vmContext) {
  try {
    vm.runInContext(`
      try {
        Object.defineProperty(Date, Symbol.hasInstance, {
          configurable: true,
          value(value) {
            return Object.prototype.toString.call(value) === '[object Date]';
          }
        });
      } catch (_) {}
    `, vmContext, { timeout: 50 });
  } catch {
    // Date remains usable through Object.prototype.toString and Date methods.
  }
}

function emptyScriptResult() {
  return {
    passed: true,
    tests: [],
    error: '',
    logs: []
  };
}

function emptyScriptResultWithCommit() {
  return {
    ...emptyScriptResult(),
    commitSideEffects: true,
    execution: {}
  };
}

function skippedScriptResult({ tests = [], logs = [], execution = {}, request, mock, visualizer } = {}) {
  return boundedScriptResult({
    passed: tests.every((test) => test.passed),
    tests,
    error: '',
    logs,
    commitSideEffects: true,
    execution,
    request,
    mock: mockResult(mock),
    visualizer: visualizerResult(visualizer)
  });
}

function createAsyncTracker({ broker, fatalErrors, timeoutMillis }) {
  const pending = new Set();
  const timers = new Map();
  let timerSequence = 0;
  let brokerRequests = 0;
  const deadline = Date.now() + Math.max(1, Number(timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS));

  const track = (promise) => {
    pending.add(promise);
    promise.finally(() => pending.delete(promise)).catch(() => {});
    return promise;
  };

  const recordFatal = (error) => {
    if (isSkipRequestSignal(error)) {
      return;
    }
    fatalErrors.push(error?.message || String(error));
  };

  const runCallback = async (callback, args = []) => {
    try {
      const value = callback(...args);
      if (value && typeof value.then === 'function') {
        await value;
      }
    } catch (error) {
      if (isSkipRequestSignal(error)) {
        return;
      }
      recordFatal(error);
    }
  };

  const setTimeoutForScript = (callback, delay = 0, ...args) => {
    if (typeof callback !== 'function') {
      throw sandboxError('setTimeout requires a callback function.');
    }
    if (timers.size >= MAX_PENDING_TIMERS) {
      throw sandboxError(`Scripts cannot schedule more than ${MAX_PENDING_TIMERS} pending timers.`);
    }
    const delayMillis = Math.min(MAX_TIMER_DELAY_MILLIS, Math.max(0, Number(delay) || 0));
    const id = ++timerSequence;
    const timer = { id, cancelled: false };
    timers.set(id, timer);
    const task = brokerRequest('timer', { timerId: id, delayMillis })
      .then(() => {
        if (!timer.cancelled) {
          return runCallback(callback, args);
        }
        return undefined;
      })
      .catch(recordFatal)
      .finally(() => {
        timers.delete(id);
      });
    timer.task = track(task);
    return id;
  };

  const setIntervalForScript = (callback, delay = 0, ...args) => {
    if (typeof callback !== 'function') {
      throw sandboxError('setInterval requires a callback function.');
    }
    if (timers.size >= MAX_PENDING_TIMERS) {
      throw sandboxError(`Scripts cannot schedule more than ${MAX_PENDING_TIMERS} pending timers.`);
    }
    const delayMillis = Math.min(MAX_TIMER_DELAY_MILLIS, Math.max(0, Number(delay) || 0));
    const id = ++timerSequence;
    const timer = { id, cancelled: false, interval: true };
    timers.set(id, timer);
    const task = (async () => {
      while (!timer.cancelled) {
        await brokerRequest('timer', { timerId: id, delayMillis });
        if (!timer.cancelled) {
          await runCallback(callback, args);
        }
      }
    })()
      .catch(recordFatal)
      .finally(() => {
        timers.delete(id);
      });
    timer.task = track(task);
    return id;
  };

  const clearTimerForScript = (id) => {
    const timer = timers.get(Number(id));
    if (!timer) {
      return;
    }
    timer.cancelled = true;
    timers.delete(Number(id));
    brokerRequest('clearTimer', { timerId: timer.id }).catch(() => {});
  };

  const queueMicrotaskForScript = (callback) => {
    if (typeof callback !== 'function') {
      throw sandboxError('queueMicrotask requires a callback function.');
    }
    const task = Promise.resolve()
      .then(() => runCallback(callback))
      .catch(recordFatal);
    track(task);
  };

  async function brokerRequest(operation, payload = {}) {
    if (!broker || typeof broker.request !== 'function') {
      throw sandboxError(`${operation} is not available in this script runtime.`);
    }
    brokerRequests += 1;
    if (brokerRequests > MAX_BROKER_REQUESTS) {
      throw sandboxError(`Scripts cannot make more than ${MAX_BROKER_REQUESTS} brokered requests.`);
    }
    return broker.request(operation, payload);
  }

  async function waitForIdle() {
    await Promise.resolve();
    while (pending.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw sandboxError('Script async work timed out.');
      }
      await Promise.race([
        Promise.allSettled([...pending]),
        sleepForRuntime(Math.min(remaining, 25))
      ]);
      await Promise.resolve();
    }
    await Promise.resolve();
  }

  return {
    brokerRequest,
    clearInterval: clearTimerForScript,
    clearTimeout: clearTimerForScript,
    queueMicrotask: queueMicrotaskForScript,
    recordFatal,
    setInterval: setIntervalForScript,
    setTimeout: setTimeoutForScript,
    track,
    waitForIdle
  };
}

function sleepForRuntime(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createPostmanRuntimeGlobals({ tracker, vmContextRef } = {}) {
  return {
    AbortController: createAbortControllerFacade(),
    AbortSignal: createAbortSignalFacade(),
    atob: (value) => Buffer.from(String(value || ''), 'base64').toString('binary'),
    Blob: createBlobFacade(vmContextRef),
    btoa: (value) => Buffer.from(String(value || ''), 'binary').toString('base64'),
    ByteLengthQueuingStrategy: createQueuingStrategyFacade((chunk) => chunk?.byteLength ?? chunk?.length ?? 1),
    CompressionStream: createPassthroughTransformStreamFacade('CompressionStream'),
    CountQueuingStrategy: createQueuingStrategyFacade(() => 1),
    crypto: createCryptoFacade(vmContextRef),
    Crypto: illegalConstructorFacade('Crypto'),
    CryptoKey: illegalConstructorFacade('CryptoKey'),
    DecompressionStream: createPassthroughTransformStreamFacade('DecompressionStream'),
    DOMException: createDomExceptionFacade(),
    Event: createEventFacade(),
    EventTarget: createEventTargetFacade(),
    queueMicrotask: tracker?.queueMicrotask || ((callback) => {
      if (typeof callback !== 'function') {
        throw sandboxError('queueMicrotask requires a callback function.');
      }
      Promise.resolve().then(callback).catch(() => {});
    }),
    ReadableByteStreamController: class ReadableByteStreamController {},
    ReadableStream: createReadableStreamFacade(),
    ReadableStreamBYOBReader: class ReadableStreamBYOBReader {},
    ReadableStreamBYOBRequest: class ReadableStreamBYOBRequest {},
    ReadableStreamDefaultController: class ReadableStreamDefaultController {},
    ReadableStreamDefaultReader: class ReadableStreamDefaultReader {},
    structuredClone: (value) => hardenSandboxValue(safeStructuredClone(value)),
    SubtleCrypto: illegalConstructorFacade('SubtleCrypto'),
    TextDecoder: createTextDecoderFacade(),
    TextDecoderStream: createPassthroughTransformStreamFacade('TextDecoderStream'),
    TextEncoder: createTextEncoderFacade(vmContextRef),
    TextEncoderStream: createPassthroughTransformStreamFacade('TextEncoderStream'),
    TransformStream: createTransformStreamFacade(),
    TransformStreamDefaultController: class TransformStreamDefaultController {},
    URL: createUrlFacade(),
    URLSearchParams: createUrlSearchParamsFacade(),
    WritableStream: createWritableStreamFacade(),
    WritableStreamDefaultController: class WritableStreamDefaultController {},
    WritableStreamDefaultWriter: class WritableStreamDefaultWriter {}
  };
}

function illegalConstructorFacade(name) {
  return function IllegalPostmanConstructor() {
    throw sandboxError(`${name} is not directly constructible in the Postman sandbox.`);
  };
}

function createUrlFacade() {
  return function PostmanURL(input, base) {
    const parsed = new URL(String(input == null ? '' : input), base == null ? undefined : String(base));
    return createSafeUrlInstance(parsed);
  };
}

function createSafeUrlInstance(parsed) {
  const api = {
    get hash() { return parsed.hash; },
    set hash(value) { parsed.hash = String(value || ''); },
    get host() { return parsed.host; },
    set host(value) { parsed.host = String(value || ''); },
    get hostname() { return parsed.hostname; },
    set hostname(value) { parsed.hostname = String(value || ''); },
    get href() { return parsed.href; },
    set href(value) {
      const next = new URL(String(value || ''));
      copyUrlFields(parsed, next);
    },
    get origin() { return parsed.origin; },
    get password() { return parsed.password; },
    set password(value) { parsed.password = String(value || ''); },
    get pathname() { return parsed.pathname; },
    set pathname(value) { parsed.pathname = String(value || ''); },
    get port() { return parsed.port; },
    set port(value) { parsed.port = String(value || ''); },
    get protocol() { return parsed.protocol; },
    set protocol(value) { parsed.protocol = String(value || ''); },
    get search() { return parsed.search; },
    set search(value) { parsed.search = String(value || ''); },
    get searchParams() { return createSafeUrlSearchParamsInstance(parsed.searchParams); },
    get username() { return parsed.username; },
    set username(value) { parsed.username = String(value || ''); },
    toJSON() { return parsed.href; },
    toString() { return parsed.href; }
  };
  return hardenSandboxValue(api);
}

function copyUrlFields(target, source) {
  target.hash = source.hash;
  target.host = source.host;
  target.password = source.password;
  target.pathname = source.pathname;
  target.protocol = source.protocol;
  target.search = source.search;
  target.username = source.username;
}

function createUrlSearchParamsFacade() {
  return function PostmanURLSearchParams(init = '') {
    return createSafeUrlSearchParamsInstance(new URLSearchParams(init));
  };
}

function createSafeUrlSearchParamsInstance(params) {
  const api = {
    append(name, value) { params.append(String(name || ''), String(value == null ? '' : value)); },
    delete(name) { params.delete(String(name || '')); },
    entries() { return sandboxArrayIterator(Array.from(params.entries()).map((entry) => hardenSandboxValue(entry))); },
    forEach(callback, thisArg) {
      if (typeof callback === 'function') {
        params.forEach((value, key) => Reflect.apply(callback, thisArg, [value, key, api]));
      }
    },
    get(name) { return params.get(String(name || '')); },
    getAll(name) { return hardenSandboxValue(params.getAll(String(name || ''))); },
    has(name) { return params.has(String(name || '')); },
    keys() { return sandboxArrayIterator(Array.from(params.keys())); },
    set(name, value) { params.set(String(name || ''), String(value == null ? '' : value)); },
    sort() { params.sort(); },
    toString() { return params.toString(); },
    values() { return sandboxArrayIterator(Array.from(params.values())); }
  };
  Object.defineProperty(api, Symbol.iterator, {
    configurable: true,
    enumerable: false,
    value: api.entries,
    writable: true
  });
  return hardenSandboxValue(api);
}

function createTextEncoderFacade(vmContextRef) {
  return function PostmanTextEncoder() {
    return hardenSandboxValue({
      get encoding() { return 'utf-8'; },
      encode(value = '') { return createVmUint8Array(Buffer.from(String(value), 'utf8'), vmContextRef); },
      encodeInto(value, destination) {
        const encoded = Buffer.from(String(value), 'utf8');
        const target = destination && typeof destination.length === 'number' ? destination : [];
        const written = Math.min(target.length || 0, encoded.length);
        for (let index = 0; index < written; index += 1) {
          target[index] = encoded[index];
        }
        return hardenSandboxValue({ read: Buffer.from(encoded.slice(0, written)).toString('utf8').length, written });
      }
    });
  };
}

function createTextDecoderFacade() {
  return function PostmanTextDecoder(label = 'utf-8') {
    const normalized = normalizeEncoding(label);
    return hardenSandboxValue({
      get encoding() { return normalized; },
      get fatal() { return false; },
      get ignoreBOM() { return false; },
      decode(value = new Uint8Array()) {
        return bufferFromArrayBufferLike(value).toString(normalized === 'utf-16le' ? 'utf16le' : 'utf8');
      }
    });
  };
}

function normalizeEncoding(label) {
  const normalized = String(label || 'utf-8').toLowerCase();
  return normalized === 'utf-16le' || normalized === 'utf-16' ? 'utf-16le' : 'utf-8';
}

function createBlobFacade(vmContextRef) {
  return function PostmanBlob(parts = [], options = {}) {
    return createBlobLike(parts, options, vmContextRef);
  };
}

function createFileFacade(vmContextRef) {
  return function PostmanFile(parts = [], name = '', options = {}) {
    const blob = createBlobLike(parts, options, vmContextRef);
    return hardenSandboxValue({
      ...blob,
      lastModified: Number(options.lastModified || Date.now()),
      name: String(name || ''),
      webkitRelativePath: ''
    });
  };
}

function createBlobLike(parts = [], options = {}, vmContextRef) {
  const bytes = Buffer.concat((Array.isArray(parts) ? parts : [parts]).map(blobPartToBuffer));
  const type = String(options.type || '').toLowerCase();
  const api = {
    get size() { return bytes.length; },
    get type() { return type; },
    arrayBuffer() { return sandboxThenable(Promise.resolve(createVmArrayBuffer(bytes, vmContextRef))); },
    slice(start = 0, end = bytes.length, sliceType = '') {
      const from = Math.max(0, Number(start) || 0);
      const to = Math.max(from, end == null ? bytes.length : Number(end));
      return createBlobLike([bytes.slice(from, to)], { type: sliceType }, vmContextRef);
    },
    text() { return sandboxThenable(Promise.resolve(bytes.toString('utf8'))); }
  };
  return hardenSandboxValue(api);
}

function blobPartToBuffer(part) {
  if (part == null) {
    return Buffer.alloc(0);
  }
  if (typeof part === 'string') {
    return Buffer.from(part, 'utf8');
  }
  if (SCRIPT_BUFFER_BYTES.has(part)) {
    return Buffer.from(SCRIPT_BUFFER_BYTES.get(part));
  }
  return bufferFromArrayBufferLike(part);
}

function createCryptoFacade(vmContextRef) {
  const subtle = hardenSandboxValue({
    digest(algorithm, data) {
      const hashName = normalizeWebCryptoHash(algorithm);
      const digest = crypto.createHash(hashName).update(bufferFromArrayBufferLike(data)).digest();
      return sandboxThenable(Promise.resolve(createVmArrayBuffer(digest, vmContextRef)));
    }
  });
  return hardenSandboxValue({
    get subtle() { return subtle; },
    getRandomValues(array) {
      if (!array || typeof array.length !== 'number') {
        throw sandboxError('crypto.getRandomValues requires a typed array.');
      }
      if (array.length > 65536) {
        throw sandboxError('crypto.getRandomValues cannot fill more than 65536 bytes.');
      }
      const bytes = crypto.randomBytes(array.length);
      for (let index = 0; index < array.length; index += 1) {
        array[index] = bytes[index];
      }
      return array;
    },
    randomUUID() {
      return crypto.randomUUID();
    }
  });
}

function normalizeWebCryptoHash(algorithm) {
  const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
  const normalized = String(name || '').toUpperCase().replace(/_/g, '-');
  if (normalized === 'SHA-1') {
    return 'sha1';
  }
  if (normalized === 'SHA-256') {
    return 'sha256';
  }
  if (normalized === 'SHA-384') {
    return 'sha384';
  }
  if (normalized === 'SHA-512') {
    return 'sha512';
  }
  throw sandboxError(`Unsupported crypto.subtle digest algorithm: ${name}.`);
}

function createDomExceptionFacade() {
  return function PostmanDOMException(message = '', name = 'Error') {
    return hardenSandboxValue({
      code: 0,
      message: String(message || ''),
      name: String(name || 'Error'),
      toString() { return `${this.name}: ${this.message}`; }
    });
  };
}

function createEventFacade() {
  return function PostmanEvent(type, options = {}) {
    return createSafeEvent(type, options);
  };
}

function createSafeEvent(type, options = {}) {
  return hardenSandboxValue({
    bubbles: options.bubbles === true,
    cancelable: options.cancelable === true,
    defaultPrevented: false,
    target: null,
    timeStamp: Date.now(),
    type: String(type || ''),
    preventDefault() { this.defaultPrevented = this.cancelable; },
    stopImmediatePropagation() {},
    stopPropagation() {}
  });
}

function createEventTargetFacade() {
  return function PostmanEventTarget() {
    return createSafeEventTarget();
  };
}

function createSafeEventTarget() {
  const listeners = new Map();
  const api = {
    addEventListener(type, callback) {
      if (typeof callback !== 'function') {
        return;
      }
      const key = String(type || '');
      if (!listeners.has(key)) {
        listeners.set(key, new Set());
      }
      listeners.get(key).add(callback);
    },
    dispatchEvent(event) {
      const safeEvent = event && typeof event === 'object' ? event : createSafeEvent(event);
      const callbacks = [...(listeners.get(String(safeEvent.type || '')) || [])];
      for (const callback of callbacks) {
        callback.call(api, safeEvent);
      }
      return safeEvent.defaultPrevented !== true;
    },
    removeEventListener(type, callback) {
      listeners.get(String(type || ''))?.delete(callback);
    }
  };
  return hardenSandboxValue(api);
}

function createAbortSignalFacade() {
  return illegalConstructorFacade('AbortSignal');
}

function createAbortControllerFacade() {
  return function PostmanAbortController() {
    const target = createSafeEventTarget();
    const signal = hardenSandboxValue({
      get aborted() { return signalState.aborted; },
      get reason() { return signalState.reason; },
      addEventListener: target.addEventListener,
      dispatchEvent: target.dispatchEvent,
      removeEventListener: target.removeEventListener,
      throwIfAborted() {
        if (signalState.aborted) {
          throw signalState.reason || sandboxError('The operation was aborted.');
        }
      }
    });
    const signalState = { aborted: false, reason: undefined };
    return hardenSandboxValue({
      signal,
      abort(reason) {
        if (signalState.aborted) {
          return;
        }
        signalState.aborted = true;
        signalState.reason = reason == null ? 'AbortError' : reason;
        target.dispatchEvent(createSafeEvent('abort'));
      }
    });
  };
}

function createQueuingStrategyFacade(sizeFn) {
  return function PostmanQueuingStrategy(options = {}) {
    return hardenSandboxValue({
      highWaterMark: Number(options.highWaterMark || 0),
      size: sizeFn
    });
  };
}

function createReadableStreamFacade() {
  return function PostmanReadableStream(source = {}) {
    const chunks = [];
    let closed = false;
    const controller = hardenSandboxValue({
      close() { closed = true; },
      enqueue(chunk) { chunks.push(chunk); },
      error(error) { closed = true; throw sandboxError(errorMessage(error)); }
    });
    if (source && typeof source.start === 'function') {
      source.start(controller);
    }
    return hardenSandboxValue({
      get locked() { return false; },
      getReader() {
        return hardenSandboxValue({
          read() {
            const value = chunks.shift();
            return sandboxThenable(Promise.resolve(hardenSandboxValue({ done: value === undefined && closed, value })));
          },
          releaseLock() {}
        });
      }
    });
  };
}

function createWritableStreamFacade() {
  return function PostmanWritableStream(sink = {}) {
    let closed = false;
    return hardenSandboxValue({
      get locked() { return false; },
      getWriter() {
        return hardenSandboxValue({
          close() {
            closed = true;
            return sandboxThenable(Promise.resolve(typeof sink.close === 'function' ? sink.close() : undefined));
          },
          releaseLock() {},
          write(chunk) {
            if (closed) {
              return sandboxThenable(Promise.reject(sandboxError('WritableStream is closed.')));
            }
            return sandboxThenable(Promise.resolve(typeof sink.write === 'function' ? sink.write(chunk) : undefined));
          }
        });
      }
    });
  };
}

function createTransformStreamFacade() {
  return function PostmanTransformStream(transformer = {}) {
    const chunks = [];
    const controller = hardenSandboxValue({
      enqueue(chunk) { chunks.push(chunk); }
    });
    return hardenSandboxValue({
      readable: createReadableFromQueue(chunks),
      writable: hardenSandboxValue({
        getWriter() {
          return hardenSandboxValue({
            close() { return sandboxThenable(Promise.resolve()); },
            releaseLock() {},
            write(chunk) {
              if (typeof transformer.transform === 'function') {
                transformer.transform(chunk, controller);
              } else {
                chunks.push(chunk);
              }
              return sandboxThenable(Promise.resolve());
            }
          });
        }
      })
    });
  };
}

function createReadableFromQueue(chunks) {
  return hardenSandboxValue({
    getReader() {
      return hardenSandboxValue({
        read() {
          return sandboxThenable(Promise.resolve(hardenSandboxValue({
            done: chunks.length === 0,
            value: chunks.shift()
          })));
        },
        releaseLock() {}
      });
    }
  });
}

function createPassthroughTransformStreamFacade() {
  return function PostmanPassthroughTransformStream() {
    return createTransformStreamFacade()();
  };
}

function createAsyncPmApi({
  broker,
  collectionVariables,
  cookieAccessEnabled,
  currentRequestCookies,
  environmentName,
  environmentVariables,
  execution,
  eventName,
  executionLocation,
  folderVariables = [],
  globals,
  iteration,
  iterationCount,
  iterationData,
  localVariables,
  logs,
  message,
  mock,
  packageRegistry,
  request,
  response,
  tests,
  tracker,
  visualizer
}) {
  const testApi = createPmTestApi({ tests, tracker });
  const api = {
    collectionVariables: variableApi(collectionVariables),
    cookies: brokerCookieApi({ broker, cookieAccessEnabled, currentRequestCookies, tracker }),
    environment: variableApi(environmentVariables, { name: environmentName }),
    execution: executionApi({
      canSkipRequest: canSkipRequestFromScriptPhase(eventName, response),
      collectionVariables,
      environmentVariables,
      execution,
      location: executionLocation,
      globals,
      tests,
      tracker
    }),
    expect,
    globals: variableApi(globals),
    info: {
      eventName: eventName || (response ? 'test' : 'prerequest'),
      iteration: Number.isFinite(Number(iteration)) ? Number(iteration) : 0,
      iterationCount: Number.isFinite(Number(iterationCount)) ? Number(iterationCount) : 1,
      requestId: postmanCompatibleRequestId(request),
      requestName: request?.name || ''
    },
    iterationData: readOnlyVariableApi(iterationData),
    message: message ? createPostmanMessage(message, undefined, { packageRegistry }) : unsupportedApi('pm.message'),
    mock: mock ? mockApi(mock) : unsupportedApi('pm.mock'),
    require: packageRequireApi(packageRegistry),
    request: mutableRequestApi(request),
    response: responseApi(response, { packageRegistry }),
    sendRequest(input, callback) {
      const promise = tracker.brokerRequest('sendRequest', { request: sendRequestPayloadForBroker(input) })
        .then((result) => {
          const scriptResponse = responseApi(result, { packageRegistry });
          if (typeof callback === 'function') {
            invokeBrokerCallback(callback, null, scriptResponse);
          }
          return scriptResponse;
        })
        .catch((error) => {
          if (isSkipRequestSignal(error)) {
            return undefined;
          }
          const safeError = sandboxError(errorMessage(error));
          if (typeof callback === 'function') {
            invokeBrokerCallback(callback, safeError);
            return undefined;
          }
          throw safeError;
        });
      tracker.track(promise.catch(() => {}));
      return sandboxThenable(promise);
    },
    test: testApi,
    variables: pmVariablesApi({
      collectionVariables,
      environmentVariables,
      folderVariables,
      globals,
      iterationData,
      localVariables
    }),
    state: mock ? mockStateApi({ tracker }) : unsupportedApi('pm.state'),
    vault: brokerVaultApi({ broker, tracker }),
    visualizer: visualizerApi(visualizer)
  };
  api.console = createConsole(logs);
  return hardenSandboxValue(api);
}

function canSkipRequestFromScriptPhase(eventName, response) {
  const phase = String(eventName || (response ? 'test' : 'prerequest'));
  return !response && ['prerequest', 'beforeQuery', 'beforeInvoke'].includes(phase);
}

function invokeBrokerCallback(callback, ...args) {
  try {
    return callback(...args);
  } catch (error) {
    if (isSkipRequestSignal(error)) {
      throw error;
    }
    throw sandboxError(errorMessage(error));
  }
}

function sendRequestPayloadForBroker(input) {
  if (typeof input === 'string' || input == null) {
    return input;
  }
  if (input && typeof input === 'object') {
    if (typeof input.toJSON === 'function') {
      return clonePlainJson(input.toJSON());
    }
    return clonePlainJson(input);
  }
  return input;
}

function createPmApi({ collectionVariables, environmentName, environmentVariables, folderVariables = [], globals = [], localVariables, logs, message, packageRegistry, request, response, tests, visualizer }) {
  const testApi = createPmTestApi({ tests });
  const api = {
    collectionVariables: variableApi(collectionVariables),
    cookies: unsupportedApi('pm.cookies'),
    environment: variableApi(environmentVariables, { name: environmentName }),
    execution: unsupportedApi('pm.execution'),
    expect,
    globals: variableApi(globals),
    iterationData: unsupportedApi('pm.iterationData'),
    message: message ? createPostmanMessage(message, undefined, { packageRegistry }) : unsupportedApi('pm.message'),
    mock: unsupportedApi('pm.mock'),
    require: packageRequireApi(packageRegistry),
    request: requestApi(request),
    response: responseApi(response, { packageRegistry }),
    sendRequest: unsupportedApi('pm.sendRequest'),
    state: unsupportedApi('pm.state'),
    test: testApi,
    variables: pmVariablesApi({
      collectionVariables,
      environmentVariables,
      folderVariables,
      globals,
      iterationData: [],
      localVariables
    }),
    vault: unsupportedApi('pm.vault'),
    visualizer: visualizerApi(visualizer)
  };
  api.info = {
    eventName: response ? 'test' : 'prerequest',
    iteration: 0,
    iterationCount: 1,
    requestId: postmanCompatibleRequestId(request),
    requestName: request?.name || ''
  };
  api.console = createConsole(logs);
  return hardenSandboxValue(api);
}

function createLegacyPostmanApi({ environmentVariables = [], execution = {}, globals = [] } = {}) {
  return hardenSandboxValue({
    clearEnvironmentVariable(key) {
      unsetVariable(environmentVariables, key);
    },
    clearGlobalVariable(key) {
      unsetVariable(globals, key);
    },
    getEnvironmentVariable(key) {
      return getVariable(environmentVariables, key);
    },
    getGlobalVariable(key) {
      return getVariable(globals, key);
    },
    setEnvironmentVariable(key, value) {
      setVariable(environmentVariables, key, value);
    },
    setGlobalVariable(key, value) {
      setVariable(globals, key, value);
    },
    setNextRequest(target) {
      execution.nextRequest = target == null ? null : String(target);
    }
  });
}

function postmanCompatibleRequestId(request) {
  return String(
    request?.postman?.ids?.original
    || request?.postman?.ids?.id
    || request?.postman?.ids?.uid
    || request?.postman?.ids?._postman_id
    || request?.postman?.ids?.deterministic
    || request?.postman?.id
    || request?.id
    || ''
  );
}

function createMockRuntimeState(definition = null) {
  if (!definition || typeof definition !== 'object' || definition.enabled !== true) {
    return null;
  }
  return {
    examples: Array.isArray(definition.examples) ? cloneMockJsonValue(definition.examples) : [],
    match: definition.match && typeof definition.match === 'object' ? cloneMockJsonValue(definition.match) : {},
    request: definition.request && typeof definition.request === 'object' ? cloneMockJsonValue(definition.request) : {},
    response: null,
    selectedExampleId: ''
  };
}

function mockApi(mock) {
  return hardenSandboxValue({
    matchRequest(target) {
      return mockRequestMatchesTarget(mock, target);
    },
    sendExample(selector) {
      const example = findMockExample(mock, selector);
      if (!example) {
        throw sandboxError('pm.mock.sendExample could not find a matching saved example.');
      }
      mock.selectedExampleId = String(example.id || '');
      mock.response = mockResponseFromExample(example);
      return undefined;
    }
  });
}

function mockStateApi({ tracker }) {
  const request = (operation, payload = {}) => {
    const promise = tracker.brokerRequest(`mock.state:${operation}`, payload)
      .then((value) => hardenSandboxValue(value));
    tracker.track(promise.catch(() => {}));
    return sandboxThenable(promise);
  };
  return hardenSandboxValue({
    get(key) {
      return request('get', { key });
    },
    set(key, value) {
      return request('set', { key, value: cloneMockJsonValue(value) });
    },
    delete(key) {
      return request('delete', { key });
    },
    has(key) {
      return request('has', { key });
    },
    keys() {
      return request('keys');
    },
    size() {
      return request('size');
    },
    clear() {
      return request('clear');
    },
    toObject() {
      return request('toObject');
    },
    increment(key, delta) {
      return request('increment', { key, delta });
    },
    push(key, ...items) {
      return request('push', { key, items: cloneMockJsonValue(items) });
    },
    addToSet(key, item) {
      return request('addToSet', { key, item: cloneMockJsonValue(item) });
    }
  });
}

function mockRequestApi(mock) {
  const request = mock.request || {};
  return hardenSandboxValue({
    body: request.body == null ? '' : request.body,
    headers: mockRequestHeaderObject(request.headers || request.header || {}),
    method: String(request.method || mock.match?.method || 'GET').toUpperCase(),
    params: cloneMockJsonValue(mock.match?.pathVariables || {}),
    path: String(request.path || mock.match?.path || '/'),
    query: cloneMockJsonValue(request.query || {}),
    url: String(request.url || ''),
    json() {
      if (request.body == null || request.body === '') {
        return undefined;
      }
      if (typeof request.body === 'object') {
        return cloneMockJsonValue(request.body);
      }
      return JSON.parse(String(request.body));
    }
  });
}

function mockRequestHeaderObject(headers) {
  if (Array.isArray(headers)) {
    const output = {};
    for (const header of headers) {
      const key = String(header?.key || header?.name || '').trim();
      if (key && header.enabled !== false && header.disabled !== true) {
        output[key] = header.value == null ? '' : String(header.value);
      }
    }
    return hardenSandboxValue(output);
  }
  return hardenSandboxValue(cloneMockJsonValue(headers || {}));
}

function mockResponseApi(mock) {
  const state = {
    body: '',
    headers: {},
    statusCode: 200
  };
  const api = {
    get headers() {
      return hardenSandboxValue(cloneMockJsonValue(state.headers));
    },
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value) {
      state.statusCode = normalizeMockStatusCode(value);
      syncMockResponseFromState(mock, state);
    },
    status(value) {
      state.statusCode = normalizeMockStatusCode(value);
      syncMockResponseFromState(mock, state);
      return api;
    },
    set(name, value) {
      setMockResponseHeader(state, name, value);
      syncMockResponseFromState(mock, state);
      return api;
    },
    header(name, value) {
      return api.set(name, value);
    },
    json(value) {
      state.body = safeJsonStringify(value == null ? null : value);
      setMockResponseHeader(state, 'Content-Type', 'application/json');
      syncMockResponseFromState(mock, state);
      return api;
    },
    send(value = '') {
      state.body = value == null ? '' : typeof value === 'string' ? value : safeJsonStringify(value);
      syncMockResponseFromState(mock, state);
      return api;
    },
    end(value = '') {
      if (value !== undefined) {
        state.body = value == null ? '' : String(value);
      }
      syncMockResponseFromState(mock, state);
      return api;
    },
    toJSON() {
      return cloneMockJsonValue(mockResponseFromState(state));
    }
  };
  return hardenSandboxValue(api);
}

function syncMockResponseFromState(mock, state) {
  mock.response = mockResponseFromState(state);
}

function mockResponseFromState(state) {
  return {
    statusCode: normalizeMockStatusCode(state.statusCode),
    headers: cloneMockJsonValue(state.headers || {}),
    body: state.body == null ? '' : String(state.body)
  };
}

function setMockResponseHeader(state, name, value) {
  const key = String(name || '').trim();
  if (!key) {
    throw sandboxError('Mock response headers require a name.');
  }
  state.headers[key] = value == null ? '' : String(value);
}

function applyMockReturnedValue(mock, returned) {
  if (!mock || returned == null) {
    return;
  }
  if (returned && typeof returned.toJSON === 'function') {
    applyMockReturnedValue(mock, returned.toJSON());
    return;
  }
  if (typeof returned !== 'object') {
    mock.response = {
      statusCode: 200,
      headers: {},
      body: String(returned)
    };
    return;
  }
  const source = cloneMockJsonValue(returned);
  if (source && typeof source === 'object') {
    mock.response = normalizeMockReturnedResponse(source);
  }
}

function normalizeMockReturnedResponse(source) {
  const statusCode = normalizeMockStatusCode(source.statusCode ?? source.status ?? source.code ?? 200);
  const headers = normalizeMockResponseHeaders(source.headers || source.header || {});
  const bodyValue = Object.hasOwn(source, 'body') ? source.body : source.data;
  let body = '';
  if (bodyValue == null) {
    body = '';
  } else if (typeof bodyValue === 'string') {
    body = bodyValue;
  } else {
    body = safeJsonStringify(bodyValue);
    if (!hasMockHeader(headers, 'Content-Type')) {
      headers['Content-Type'] = 'application/json';
    }
  }
  return { statusCode, headers, body };
}

function mockResponseFromExample(example) {
  return {
    statusCode: normalizeMockStatusCode(example.statusCode || example.code || 200),
    headers: normalizeMockResponseHeaders(example.headers || example.header || {}),
    body: example.body == null ? '' : String(example.body)
  };
}

function normalizeMockResponseHeaders(headers) {
  if (Array.isArray(headers)) {
    const output = {};
    for (const header of headers) {
      const key = String(header?.key || header?.name || '').trim();
      if (key && header.enabled !== false && header.disabled !== true) {
        output[key] = header.value == null ? '' : String(header.value);
      }
    }
    return output;
  }
  if (headers && typeof headers === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key) {
        output[key] = Array.isArray(value) ? value.map((item) => String(item ?? '')).join(', ') : value == null ? '' : String(value);
      }
    }
    return output;
  }
  return {};
}

function hasMockHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === target);
}

function normalizeMockStatusCode(value) {
  const status = Number(value);
  if (!Number.isFinite(status) || status < 100 || status > 599) {
    return 200;
  }
  return Math.floor(status);
}

function mockRequestMatchesTarget(mock, target) {
  const match = mock?.match || {};
  if (target == null || target === '') {
    return match.matched !== false;
  }
  if (typeof target === 'string' || typeof target === 'number') {
    const text = String(target);
    return [match.requestId, match.id, match.requestName, match.name, match.path]
      .map((value) => String(value || ''))
      .includes(text);
  }
  if (target && typeof target === 'object') {
    const method = String(target.method || '').toUpperCase();
    const path = String(target.path || target.url || '');
    const methodMatches = !method || method === String(match.method || '').toUpperCase();
    const pathMatches = !path || path === String(match.path || '') || path === String(match.routePath || '');
    return methodMatches && pathMatches && match.matched !== false;
  }
  return false;
}

function findMockExample(mock, selector) {
  const examples = Array.isArray(mock?.examples) ? mock.examples : [];
  if (!examples.length) {
    return null;
  }
  if (selector == null || selector === '') {
    return examples[0];
  }
  if (typeof selector === 'number') {
    return examples[Math.max(0, Math.min(examples.length - 1, Math.floor(selector)))] || null;
  }
  if (typeof selector === 'string') {
    return examples.find((example) => [example.id, example.name]
      .map((value) => String(value || ''))
      .includes(selector)) || null;
  }
  if (selector && typeof selector === 'object') {
    if (Number.isFinite(Number(selector.index))) {
      return findMockExample(mock, Number(selector.index));
    }
    const id = selector.id == null ? '' : String(selector.id);
    const name = selector.name == null ? '' : String(selector.name);
    const statusCode = Number(selector.statusCode ?? selector.code);
    return examples.find((example) => {
      if (id && String(example.id || '') === id) {
        return true;
      }
      if (name && String(example.name || '') === name) {
        return true;
      }
      return Number.isFinite(statusCode) && Number(example.statusCode || example.code || 0) === statusCode;
    }) || null;
  }
  return null;
}

function mockResult(mock) {
  if (!mock) {
    return undefined;
  }
  return {
    match: cloneMockJsonValue(mock.match || {}),
    response: mock.response ? normalizeMockReturnedResponse(mock.response) : undefined,
    selectedExampleId: mock.selectedExampleId || ''
  };
}

function cloneMockJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    const text = JSON.stringify(value);
    if (text === undefined) {
      throw new Error('Value is not JSON serializable.');
    }
    return JSON.parse(text);
  } catch (error) {
    throw sandboxError(`Mock values must be JSON serializable: ${errorMessage(error)}`);
  }
}

function unsupportedApi(name) {
  const callable = function unsupportedPostmanApi() {
    throw sandboxError(`${name} is not supported by the PostMeter script runtime yet.`);
  };
  return hardenSandboxValue(new Proxy(callable, {
    apply() {
      throw sandboxError(`${name} is not supported by the PostMeter script runtime yet.`);
    },
    get(_target, property) {
      if (property === 'then') {
        return undefined;
      }
      if (property === 'toString') {
        return hardenSandboxValue(() => `[unsupported ${name}]`);
      }
      return unsupportedApi(`${name}.${String(property)}`);
    }
  }));
}

function createPackageRegistryState(packages = []) {
  const normalizedPackages = normalizeScriptPackageBundles(packages);
  return {
    cache: new Map(),
    fileFacade: null,
    loading: [],
    packageModuleCache: new Map(),
    packageNameIndex: createReviewedPackageNameIndex(normalizedPackages),
    packages: normalizedPackages,
    postmanBuiltinRequire: null,
    timeoutMillis: DEFAULT_SCRIPT_TIMEOUT_MILLIS,
    tracker: null,
    vmContext: null
  };
}

function attachPackageRegistryContext(registry, vmContext, options = {}) {
  registry.vmContext = vmContext;
  registry.fileFacade = options.fileFacade;
  registry.timeoutMillis = Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS);
}

function attachPostmanLegacyPackageGlobals(vmContext, scriptRequire) {
  vmContext._ = scriptRequire('lodash');
  vmContext.CryptoJS = scriptRequire('crypto-js');
}

function packageRequireApi(registry = createPackageRegistryState(), options = {}) {
  return hardenSandboxValue(function postmeterScriptRequire(packageName) {
    const name = normalizeScriptPackageName(packageName, registry);
    if (!registry.cache.has(name)) {
      registry.cache.set(name, createScriptPackage(name, registry));
    }
    return registry.cache.get(name);
  });
}

function normalizeScriptPackageName(packageName, registry = createPackageRegistryState()) {
  const raw = String(packageName == null ? '' : packageName).trim();
  const lowered = raw.toLowerCase();
  if (!raw) {
    throw sandboxError('pm.require requires a package name.');
  }
  if (
    lowered.startsWith('node:')
    || lowered.startsWith('http:')
    || lowered.startsWith('https:')
    || raw.startsWith('.')
    || raw.startsWith('/')
    || raw.includes('\\')
  ) {
    throw sandboxError('PostMeter package loading only supports bundled sandbox packages, not Node modules or external package specifiers.');
  }
  const alias = SCRIPT_PACKAGE_ALIASES.get(lowered) || lowered;
  if (!SCRIPT_PACKAGE_NAMES.includes(alias)) {
    if (registry.packages.has(raw)) {
      return raw;
    }
    if (lowered.startsWith('npm:') || lowered.startsWith('jsr:') || raw.startsWith('@')) {
      throw sandboxError(`Sandbox package "${raw}" is not installed in the reviewed package cache. External and team package imports must be resolved through the review workflow with integrity metadata before scripts can require them.`);
    }
    throw sandboxError(`Sandbox package "${raw}" is not available. Supported packages: ${SCRIPT_PACKAGE_NAMES.join(', ')}.`);
  }
  return alias;
}

function createScriptPackage(name, registry = createPackageRegistryState()) {
  const definition = SCRIPT_PACKAGE_DEFINITIONS[name];
  if (definition && typeof definition.factory === 'function') {
    return validateScriptPackageExport(name, definition.factory(registry), definition);
  }
  const packageBundle = registry.packages.get(name);
  if (packageBundle) {
    return createCachedScriptPackage(name, packageBundle, registry);
  }
  throw sandboxError(`Sandbox package "${name}" is not available.`);
}

function createPostmanBuiltinPackage(name, registry = createPackageRegistryState()) {
  try {
    return loadPostmanBuiltinPackage(registry, name);
  } catch (error) {
    throw sandboxError(`Postman bundled package "${name}" failed to load: ${errorMessage(error)}`);
  }
}

function validateScriptPackageExport(name, exported, definition) {
  if (exported == null || (typeof exported !== 'object' && typeof exported !== 'function')) {
    throw sandboxError(`Sandbox package "${name}" has an invalid bundled export.`);
  }
  const maxExportKeys = Number(definition.maxExportKeys || 0);
  if (maxExportKeys > 0 && Object.keys(exported).length > maxExportKeys) {
    throw sandboxError(`Sandbox package "${name}" exceeds its bundled export policy.`);
  }
  if (definition.hardenExport === false) {
    return exported;
  }
  return hardenSandboxValue(exported);
}

function normalizeScriptPackageBundles(packages) {
  const map = new Map();
  const values = Array.isArray(packages)
    ? packages
    : Object.entries(packages || {}).map(([specifier, value]) => ({ specifier, ...(value || {}) }));
  if (values.length > MAX_SCRIPT_PACKAGE_COUNT) {
    throw sandboxError(`Sandbox package cache cannot exceed ${MAX_SCRIPT_PACKAGE_COUNT} packages.`);
  }
  for (const item of values) {
    const bundle = normalizeScriptPackageBundle(item);
    if (SCRIPT_PACKAGE_NAMES.includes(bundle.specifier.toLowerCase())) {
      throw sandboxError(`Sandbox package "${bundle.specifier}" cannot override a bundled package.`);
    }
    if (map.has(bundle.specifier)) {
      throw sandboxError(`Sandbox package "${bundle.specifier}" is duplicated in the reviewed package cache.`);
    }
    map.set(bundle.specifier, bundle);
  }
  for (const bundle of map.values()) {
    for (const dependency of bundle.dependencies) {
      if (dependency === bundle.specifier) {
        throw sandboxError(`Sandbox package "${bundle.specifier}" cannot depend on itself.`);
      }
      if (!SCRIPT_PACKAGE_NAMES.includes(dependency) && !map.has(dependency)) {
        throw sandboxError(`Sandbox package "${bundle.specifier}" depends on missing reviewed package "${dependency}".`);
      }
    }
  }
  return map;
}

function normalizeScriptPackageBundle(item) {
  if (!item || typeof item !== 'object') {
    throw sandboxError('Sandbox package cache entries must be objects.');
  }
  const specifier = String(item.specifier || item.name || '').trim();
  if (!specifier || !SCRIPT_PACKAGE_SPECIFIER_PATTERN.test(specifier)) {
    throw sandboxError(`Sandbox package specifier "${specifier}" is invalid. Use @team/package, npm:package[@version], npm:@scope/package[@version], or jsr:@scope/package[@version].`);
  }
  const packageJson = normalizeScriptPackageManifest(item.packageJson || item.package || item.manifest);
  const entrypoint = normalizeScriptPackageEntrypoint(item.entrypoint, packageJson);
  const files = normalizeScriptPackageFiles(item, entrypoint);
  const source = String(item.source || item.code || files.get(entrypoint) || '');
  if (!source.trim()) {
    throw sandboxError(`Sandbox package "${specifier}" source is required.`);
  }
  const totalSourceBytes = [...files.values()]
    .reduce((total, value) => total + Buffer.byteLength(value, 'utf8'), 0);
  if (totalSourceBytes > MAX_SCRIPT_PACKAGE_SOURCE_BYTES) {
    throw sandboxError(`Sandbox package "${specifier}" source cannot exceed ${MAX_SCRIPT_PACKAGE_SOURCE_BYTES} bytes.`);
  }
  const integrity = String(item.integrity || '').trim();
  const expectedIntegrity = files.size > 1 || item.files || Object.keys(packageJson).length > 0
    ? scriptPackageBundleIntegrity({
      entrypoint,
      files: packageFilesForIntegrity(files),
      packageJson
    })
    : scriptPackageIntegrity(source);
  if (!integrity || integrity !== expectedIntegrity) {
    throw sandboxError(`Sandbox package "${specifier}" integrity does not match its reviewed source.`);
  }
  const dependencyValues = Array.isArray(item.dependencies) ? item.dependencies : [];
  if (dependencyValues.length > MAX_SCRIPT_PACKAGE_DEPENDENCIES) {
    throw sandboxError(`Sandbox package "${specifier}" cannot declare more than ${MAX_SCRIPT_PACKAGE_DEPENDENCIES} dependencies.`);
  }
  const dependencies = new Set(dependencyValues.map((dependency) => normalizeScriptPackageDependencySpecifier(dependency)));
  const dependencyAliases = normalizeScriptPackageDependencyAliases(item.dependencyAliases || item.dependencyMap);
  for (const target of dependencyAliases.values()) {
    dependencies.add(target);
  }
  if (dependencies.size > MAX_SCRIPT_PACKAGE_DEPENDENCIES) {
    throw sandboxError(`Sandbox package "${specifier}" cannot declare more than ${MAX_SCRIPT_PACKAGE_DEPENDENCIES} dependencies.`);
  }
  return {
    dependencyAliases,
    dependencies,
    entrypoint: resolvePackageModulePath({ files, packageJson }, entrypoint, '') || entrypoint,
    files,
    integrity,
    maxExportKeys: Math.max(1, Math.min(MAX_SCRIPT_PACKAGE_EXPORT_KEYS, Number(item.maxExportKeys || MAX_SCRIPT_PACKAGE_EXPORT_KEYS))),
    packageJson,
    packageName: String(item.packageName || packageJson.name || packageNameFromReviewedSpecifier(specifier) || '').trim(),
    source,
    specifier
  };
}

function normalizeScriptPackageFiles(item, entrypoint) {
  const files = new Map();
  const entries = Array.isArray(item.files)
    ? item.files.map((file) => [
      file?.path ?? file?.name ?? file?.filename,
      file?.source ?? file?.code ?? file?.text
    ])
    : Object.entries(item.files || {});
  for (const [rawPath, rawSource] of entries) {
    const filePath = normalizeScriptPackageFilePath(rawPath);
    if (!filePath) {
      throw sandboxError(`Sandbox package file path "${rawPath}" is invalid.`);
    }
    if (files.has(filePath)) {
      throw sandboxError(`Sandbox package file "${filePath}" is duplicated.`);
    }
    if (files.size >= MAX_SCRIPT_PACKAGE_FILES) {
      throw sandboxError(`Sandbox package cannot contain more than ${MAX_SCRIPT_PACKAGE_FILES} files.`);
    }
    files.set(filePath, String(rawSource ?? ''));
  }

  const source = String(item.source || item.code || '');
  if (source.trim() && !files.has(entrypoint)) {
    files.set(entrypoint, source);
  }
  if (files.size === 0 && source.trim()) {
    files.set(entrypoint, source);
  }
  if (files.size === 0) {
    throw sandboxError('Sandbox package source is required.');
  }
  if (!resolvePackageModulePath({ files, packageJson: normalizeScriptPackageManifest(item.packageJson || item.package || item.manifest) }, entrypoint, '')) {
    throw sandboxError(`Sandbox package entrypoint "${entrypoint}" was not found in the reviewed package files.`);
  }
  return files;
}

function normalizeScriptPackageManifest(packageJson) {
  if (!packageJson) {
    return {};
  }
  if (typeof packageJson === 'string') {
    try {
      const parsed = JSON.parse(packageJson);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? cloneJson(parsed) : {};
    } catch {
      throw sandboxError('Sandbox package package.json metadata must be valid JSON.');
    }
  }
  if (typeof packageJson === 'object' && !Array.isArray(packageJson)) {
    return cloneJson(packageJson);
  }
  throw sandboxError('Sandbox package package.json metadata must be an object.');
}

function normalizeScriptPackageEntrypoint(entrypoint, packageJson = {}) {
  const explicit = normalizeScriptPackageFilePath(entrypoint);
  if (explicit) {
    return explicit;
  }
  for (const candidate of scriptPackageEntrypointCandidates(packageJson)) {
    const normalized = normalizeScriptPackageFilePath(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return 'index.js';
}

function scriptPackageEntrypointCandidates(packageJson = {}) {
  return [
    entrypointFromBrowserPackageField(packageJson.browser),
    entrypointFromExportsPackageField(packageJson.exports),
    packageJson.main,
    packageJson.module,
    'index.js'
  ].filter(Boolean);
}

function entrypointFromBrowserPackageField(browserField) {
  if (typeof browserField === 'string') {
    return browserField;
  }
  if (browserField && typeof browserField === 'object' && typeof browserField['.'] === 'string') {
    return browserField['.'];
  }
  return '';
}

function entrypointFromExportsPackageField(exportsField) {
  if (typeof exportsField === 'string') {
    return exportsField;
  }
  if (!exportsField || typeof exportsField !== 'object') {
    return '';
  }
  if (exportsField['.']) {
    return entrypointFromExportValue(exportsField['.']);
  }
  return entrypointFromExportValue(exportsField);
}

function entrypointFromExportValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  for (const key of ['browser', 'require', 'default', 'import', 'node']) {
    const nested = entrypointFromExportValue(value[key]);
    if (nested) {
      return nested;
    }
  }
  return '';
}

function normalizeScriptPackageFilePath(filePath) {
  let value = String(filePath || '').replace(/\\/g, '/').trim();
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  value = value.replace(/^\/+/, '');
  const parts = value.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || parts.some((part) => part === '.' || part.includes('\0'))) {
    return '';
  }
  return parts.join('/');
}

function packageFilesForIntegrity(files) {
  return [...files.entries()]
    .map(([path, source]) => ({ path, source }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeScriptPackageDependencyAliases(value = {}) {
  const aliases = new Map();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return aliases;
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_SCRIPT_PACKAGE_DEPENDENCIES) {
    throw sandboxError(`Sandbox package dependency aliases cannot exceed ${MAX_SCRIPT_PACKAGE_DEPENDENCIES} entries.`);
  }
  for (const [rawAlias, rawTarget] of entries) {
    const alias = normalizeScriptPackageDependencyRequest(rawAlias);
    const target = normalizeScriptPackageDependencySpecifier(rawTarget);
    if (!alias) {
      throw sandboxError(`Sandbox package dependency alias "${rawAlias}" is invalid.`);
    }
    aliases.set(alias, target);
  }
  return aliases;
}

function normalizeScriptPackageDependencySpecifier(dependency) {
  const raw = String(dependency == null ? '' : dependency).trim();
  const lowered = raw.toLowerCase();
  const alias = SCRIPT_PACKAGE_ALIASES.get(lowered) || lowered;
  if (SCRIPT_PACKAGE_NAMES.includes(alias)) {
    return alias;
  }
  if (SCRIPT_PACKAGE_SPECIFIER_PATTERN.test(raw)) {
    return raw;
  }
  throw sandboxError(`Sandbox package dependency "${raw}" is invalid.`);
}

function normalizeScriptPackageDependencyRequest(dependency) {
  const raw = String(dependency == null ? '' : dependency).trim();
  if (!raw || raw.startsWith('.') || raw.startsWith('/') || raw.includes('\\') || raw.startsWith('node:') || /^https?:/i.test(raw)) {
    return '';
  }
  const lowered = raw.toLowerCase();
  return SCRIPT_PACKAGE_ALIASES.get(lowered) || raw;
}

function packageNameFromReviewedSpecifier(specifier) {
  const value = String(specifier || '');
  if (value.startsWith('npm:') || value.startsWith('jsr:')) {
    const rawNameAndVersion = value.slice(value.indexOf(':') + 1);
    const versionSeparator = rawNameAndVersion.lastIndexOf('@');
    return versionSeparator > 0 ? rawNameAndVersion.slice(0, versionSeparator) : rawNameAndVersion;
  }
  return value.startsWith('@') ? value : '';
}

function createReviewedPackageNameIndex(packages) {
  const index = new Map();
  const ambiguous = new Set();
  for (const bundle of packages.values()) {
    const packageName = String(bundle.packageName || '').trim();
    if (!packageName) {
      continue;
    }
    if (index.has(packageName) && index.get(packageName) !== bundle.specifier) {
      ambiguous.add(packageName);
      index.delete(packageName);
    } else if (!ambiguous.has(packageName)) {
      index.set(packageName, bundle.specifier);
    }
  }
  return index;
}

function createPathModuleFacade() {
  const wrapPath = (source, root) => hardenSandboxValue({
    basename: (value, suffix) => source.basename(String(value || ''), suffix == null ? undefined : String(suffix)),
    delimiter: source.delimiter,
    dirname: (value) => source.dirname(String(value || '')),
    extname: (value) => source.extname(String(value || '')),
    format: (value) => source.format(cloneJson(value || {})),
    isAbsolute: (value) => source.isAbsolute(String(value || '')),
    join: (...parts) => source.join(...parts.map((part) => String(part || ''))),
    normalize: (value) => source.normalize(String(value || '')),
    parse: (value) => hardenSandboxValue(source.parse(String(value || ''))),
    relative: (from, to) => source.relative(String(from || ''), String(to || '')),
    resolve: (...parts) => source.resolve(root, ...parts.map((part) => String(part || ''))),
    sep: source.sep,
    toNamespacedPath: (value) => String(value || '')
  });
  const pathFacade = wrapPath(nodePath.posix, '/');
  pathFacade.posix = wrapPath(nodePath.posix, '/');
  pathFacade.win32 = wrapPath(nodePath.win32, 'C:\\');
  return pathFacade;
}

function createAssertModuleFacade() {
  const api = function assertFacade(value, message) {
    assertCondition(Boolean(value), message || 'Expected value to be truthy.');
  };
  api.ok = api;
  api.equal = (actual, expected, message) => assertCondition(actual == expected, message || `Expected ${actual} to equal ${expected}.`);
  api.notEqual = (actual, expected, message) => assertCondition(actual != expected, message || `Expected ${actual} not to equal ${expected}.`);
  api.strictEqual = (actual, expected, message) => assertCondition(Object.is(actual, expected), message || `Expected ${actual} to strictly equal ${expected}.`);
  api.notStrictEqual = (actual, expected, message) => assertCondition(!Object.is(actual, expected), message || `Expected ${actual} not to strictly equal ${expected}.`);
  api.deepEqual = (actual, expected, message) => assertCondition(deepEqual(actual, expected), message || 'Expected values to be deeply equal.');
  api.deepStrictEqual = api.deepEqual;
  api.notDeepEqual = (actual, expected, message) => assertCondition(!deepEqual(actual, expected), message || 'Expected values not to be deeply equal.');
  api.fail = (message) => { throw sandboxError(message || 'Assertion failed.'); };
  api.ifError = (value) => {
    if (value) {
      throw sandboxError(errorMessage(value));
    }
  };
  api.throws = (callback, expected, message) => {
    assertThrows(callback, expected, message, true);
  };
  api.doesNotThrow = (callback, expected, message) => {
    assertThrows(callback, expected, message, false);
  };
  api.AssertionError = function AssertionError(options = {}) {
    return hardenSandboxValue({
      actual: options.actual,
      expected: options.expected,
      message: String(options.message || 'Assertion failed.'),
      name: 'AssertionError',
      operator: String(options.operator || '')
    });
  };
  return api;
}

function assertThrows(callback, expected, message, shouldThrow) {
  if (typeof callback !== 'function') {
    throw sandboxError('assert.throws requires a callback function.');
  }
  let thrown;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  if (shouldThrow && !thrown) {
    throw sandboxError(message || 'Expected function to throw.');
  }
  if (!shouldThrow && thrown) {
    throw sandboxError(message || `Expected function not to throw: ${errorMessage(thrown)}`);
  }
  if (shouldThrow && expected instanceof RegExp) {
    assertCondition(expected.test(errorMessage(thrown)), message || `Expected error to match ${expected}.`);
  }
}

function createBufferModuleFacade() {
  const BufferFacade = function PostmanBuffer(value = '', encoding = 'utf8') {
    return createScriptBuffer(Buffer.from(String(value), normalizeBufferEncoding(encoding)));
  };
  BufferFacade.from = (value = '', encoding = 'utf8') => createScriptBuffer(bufferInputToBytes(value, encoding));
  BufferFacade.alloc = (size = 0, fill = 0, encoding = 'utf8') => createScriptBuffer(Buffer.alloc(Math.max(0, Math.min(1024 * 1024, Number(size) || 0)), fill, normalizeBufferEncoding(encoding)));
  BufferFacade.byteLength = (value = '', encoding = 'utf8') => bufferInputToBytes(value, encoding).length;
  BufferFacade.compare = (left, right) => Buffer.compare(bufferInputToBytes(left), bufferInputToBytes(right));
  BufferFacade.concat = (items = [], totalLength) => {
    const buffers = (Array.isArray(items) ? items : []).map((item) => bufferInputToBytes(item));
    return createScriptBuffer(Buffer.concat(buffers, totalLength == null ? undefined : Number(totalLength)));
  };
  BufferFacade.isBuffer = (value) => SCRIPT_BUFFER_BYTES.has(value);
  return {
    Buffer: BufferFacade,
    constants: hardenSandboxValue({ MAX_LENGTH: 1024 * 1024, MAX_STRING_LENGTH: 1024 * 1024 }),
    INSPECT_MAX_BYTES: 50,
    kMaxLength: 1024 * 1024
  };
}

function createScriptBuffer(bytes) {
  const buffer = Buffer.from(bytes || []);
  const api = {
    length: buffer.length,
    byteLength: buffer.length,
    compare(other) { return Buffer.compare(buffer, bufferInputToBytes(other)); },
    equals(other) { return buffer.equals(bufferInputToBytes(other)); },
    fill(value = 0, offset = 0, end = buffer.length, encoding = 'utf8') {
      buffer.fill(value, Number(offset) || 0, end == null ? buffer.length : Number(end), normalizeBufferEncoding(encoding));
      syncScriptBufferIndexes(api, buffer);
      return api;
    },
    includes(value, byteOffset = 0, encoding = 'utf8') {
      return buffer.includes(bufferInputToBytes(value, encoding), Number(byteOffset) || 0);
    },
    slice(start, end) { return createScriptBuffer(buffer.slice(start, end)); },
    subarray(start, end) { return createScriptBuffer(buffer.subarray(start, end)); },
    toJSON() { return { type: 'Buffer', data: Array.from(buffer) }; },
    toString(encoding = 'utf8', start = 0, end = buffer.length) {
      return buffer.toString(normalizeBufferEncoding(encoding), Number(start) || 0, end == null ? buffer.length : Number(end));
    },
    valueOf() { return api; }
  };
  SCRIPT_BUFFER_BYTES.set(api, buffer);
  syncScriptBufferIndexes(api, buffer);
  return hardenSandboxValue(api);
}

function createScriptArrayBuffer(bytes) {
  const buffer = Buffer.from(bytes || []);
  const api = {
    byteLength: buffer.length,
    length: buffer.length,
    slice(start = 0, end = buffer.length) {
      return createScriptArrayBuffer(buffer.slice(Number(start) || 0, end == null ? buffer.length : Number(end)));
    }
  };
  Object.defineProperty(api, Symbol.toStringTag, {
    configurable: true,
    enumerable: false,
    value: 'ArrayBuffer',
    writable: false
  });
  SCRIPT_BUFFER_BYTES.set(api, buffer);
  syncScriptBufferIndexes(api, buffer);
  return hardenSandboxValue(api);
}

function createVmUint8Array(bytes, vmContextRef) {
  const buffer = Buffer.from(bytes || []);
  const context = vmContextRef?.current;
  if (!context) {
    return createScriptBuffer(buffer);
  }
  try {
    const Uint8ArrayCtor = vm.runInContext('Uint8Array', context);
    const output = new Uint8ArrayCtor(buffer.length);
    for (let index = 0; index < buffer.length; index += 1) {
      output[index] = buffer[index];
    }
    maskSandboxConstructor(output);
    return output;
  } catch {
    return createScriptBuffer(buffer);
  }
}

function createVmArrayBuffer(bytes, vmContextRef) {
  const buffer = Buffer.from(bytes || []);
  const context = vmContextRef?.current;
  if (!context) {
    return createScriptArrayBuffer(buffer);
  }
  try {
    const ArrayBufferCtor = vm.runInContext('ArrayBuffer', context);
    const Uint8ArrayCtor = vm.runInContext('Uint8Array', context);
    const output = new ArrayBufferCtor(buffer.length);
    const view = new Uint8ArrayCtor(output);
    for (let index = 0; index < buffer.length; index += 1) {
      view[index] = buffer[index];
    }
    maskSandboxConstructor(output);
    return output;
  } catch {
    return createScriptArrayBuffer(buffer);
  }
}

function maskSandboxConstructor(value) {
  try {
    Object.defineProperty(value, 'constructor', {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false
    });
  } catch {
    // VM-realm typed arrays keep their native prototype. Mask only the direct
    // constructor property when possible to reduce accidental constructor use.
  }
  return value;
}

function syncScriptBufferIndexes(api, buffer) {
  for (let index = 0; index < buffer.length; index += 1) {
    Object.defineProperty(api, index, {
      configurable: true,
      enumerable: true,
      get() { return buffer[index]; },
      set(value) { buffer[index] = Number(value) & 0xff; }
    });
  }
}

function bufferInputToBytes(value, encoding = 'utf8') {
  if (SCRIPT_BUFFER_BYTES.has(value)) {
    return Buffer.from(SCRIPT_BUFFER_BYTES.get(value));
  }
  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data.map((item) => Number(item) & 0xff));
  }
  if (Array.isArray(value)) {
    return Buffer.from(value.map((item) => Number(item) & 0xff));
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
    return bufferFromArrayBufferLike(value);
  }
  return Buffer.from(String(value == null ? '' : value), normalizeBufferEncoding(encoding));
}

function normalizeBufferEncoding(value = 'utf8') {
  const encoding = String(value || 'utf8').toLowerCase();
  if (encoding === 'utf-8') {
    return 'utf8';
  }
  if (['utf8', 'hex', 'base64', 'base64url', 'latin1', 'ascii', 'utf16le', 'ucs2'].includes(encoding)) {
    return encoding;
  }
  return 'utf8';
}

function createUtilModuleFacade() {
  return {
    format: formatConsoleValues,
    inherits() {},
    inspect: (value) => formatLogValue(value),
    isArray: Array.isArray,
    isBoolean: (value) => typeof value === 'boolean',
    isNull: (value) => value === null,
    isNullOrUndefined: (value) => value == null,
    isNumber: (value) => typeof value === 'number',
    isObject: (value) => value !== null && typeof value === 'object',
    isString: (value) => typeof value === 'string',
    promisify(callback) {
      if (typeof callback !== 'function') {
        throw sandboxError('util.promisify requires a callback function.');
      }
      return hardenSandboxValue((...args) => sandboxThenable(new Promise((resolve, reject) => {
        callback(...args, (error, value) => error ? reject(error) : resolve(value));
      })));
    },
    types: hardenSandboxValue({
      isArrayBuffer: (value) => value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]',
      isDate: (value) => Object.prototype.toString.call(value) === '[object Date]',
      isMap: (value) => Object.prototype.toString.call(value) === '[object Map]',
      isRegExp: (value) => Object.prototype.toString.call(value) === '[object RegExp]',
      isSet: (value) => Object.prototype.toString.call(value) === '[object Set]',
      isTypedArray: ArrayBuffer.isView
    })
  };
}

function createUrlModuleFacade() {
  const URLFacade = createUrlFacade();
  const URLSearchParamsFacade = createUrlSearchParamsFacade();
  return {
    URL: URLFacade,
    URLSearchParams: URLSearchParamsFacade,
    domainToASCII: (domain) => nodeUrl.domainToASCII(String(domain || '')),
    domainToUnicode: (domain) => nodeUrl.domainToUnicode(String(domain || '')),
    fileURLToPath() { throw sandboxError('url.fileURLToPath is not available in the Postman sandbox.'); },
    format(value) {
      if (value && typeof value.toString === 'function' && value.href) {
        return value.toString();
      }
      const protocol = value?.protocol ? `${String(value.protocol).replace(/:$/, '')}:` : '';
      const host = value?.host || value?.hostname || '';
      const pathname = value?.pathname || value?.path || '';
      const search = value?.search || '';
      return `${protocol}${host ? '//' : ''}${host}${pathname}${search}`;
    },
    parse(value, parseQueryString = false) {
      const parsed = new URL(String(value || ''), 'http://postmeter.invalid');
      return hardenSandboxValue({
        auth: parsed.username ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}` : null,
        hash: parsed.hash || null,
        host: parsed.host,
        hostname: parsed.hostname,
        href: parsed.href.replace('http://postmeter.invalid', ''),
        path: `${parsed.pathname}${parsed.search}`,
        pathname: parsed.pathname,
        port: parsed.port || null,
        protocol: parsed.protocol,
        query: parseQueryString ? createQuerystringModuleFacade().parse(parsed.search.slice(1)) : parsed.search.slice(1),
        search: parsed.search || null,
        slashes: true
      });
    },
    pathToFileURL() { throw sandboxError('url.pathToFileURL is not available in the Postman sandbox.'); },
    resolve(from, to) { return new URL(String(to || ''), String(from || '')).toString(); }
  };
}

function createPunycodeModuleFacade() {
  return {
    decode: decodePunycodeLabel,
    encode: encodePunycodeLabel,
    toASCII: (value) => nodeUrl.domainToASCII(String(value || '')),
    toUnicode: (value) => nodeUrl.domainToUnicode(String(value || '')),
    ucs2: hardenSandboxValue({
      decode: (value) => hardenSandboxValue(Array.from(String(value || ''), (char) => char.codePointAt(0))),
      encode: (values) => String.fromCodePoint(...(Array.isArray(values) ? values.map(Number) : []))
    }),
    version: '2.1.0-compatible-facade'
  };
}

function encodePunycodeLabel(value) {
  const ascii = nodeUrl.domainToASCII(`x.${String(value || '')}`);
  const label = ascii.split('.').slice(1).join('.');
  return label.startsWith('xn--') ? label.slice(4) : label;
}

function decodePunycodeLabel(value) {
  return nodeUrl.domainToUnicode(`xn--${String(value || '')}`).replace(/^xn--/i, '');
}

function createQuerystringModuleFacade() {
  return {
    decode: (...args) => createQuerystringModuleFacade().parse(...args),
    encode: (...args) => createQuerystringModuleFacade().stringify(...args),
    escape: (value) => nodeQuerystring.escape(String(value == null ? '' : value)),
    parse(value = '', separator = '&', equals = '=', options = {}) {
      const parsed = nodeQuerystring.parse(String(value || ''), String(separator || '&'), String(equals || '='), options || {});
      const output = createSafePlainObject();
      for (const [key, item] of Object.entries(parsed)) {
        setSafeObjectProperty(output, key, Array.isArray(item) ? item.map(String) : String(item ?? ''));
      }
      return hardenSandboxValue(output);
    },
    stringify(value = {}, separator = '&', equals = '=', options = {}) {
      return nodeQuerystring.stringify(cloneJson(value || {}), String(separator || '&'), String(equals || '='), options || {});
    },
    unescape: (value) => nodeQuerystring.unescape(String(value == null ? '' : value))
  };
}

function createStringDecoderModuleFacade() {
  function StringDecoder(encoding = 'utf8') {
    return hardenSandboxValue({
      end(value = '') { return bufferInputToBytes(value, encoding).toString(normalizeBufferEncoding(encoding)); },
      write(value = '') { return bufferInputToBytes(value, encoding).toString(normalizeBufferEncoding(encoding)); }
    });
  }
  return { StringDecoder };
}

function createEventsModuleFacade() {
  const EventEmitter = createEventEmitterFacade();
  return {
    EventEmitter,
    defaultMaxListeners: 10
  };
}

function createEventEmitterFacade() {
  function EventEmitter() {
    const listeners = new Map();
    const api = {
      addListener(type, callback) { return api.on(type, callback); },
      emit(type, ...args) {
        const callbacks = [...(listeners.get(String(type || '')) || [])];
        for (const callback of callbacks) {
          callback.apply(api, args);
        }
        return callbacks.length > 0;
      },
      eventNames() { return hardenSandboxValue([...listeners.keys()]); },
      listenerCount(type) { return listeners.get(String(type || ''))?.size || 0; },
      listeners(type) { return hardenSandboxValue([...(listeners.get(String(type || '')) || [])]); },
      off(type, callback) { return api.removeListener(type, callback); },
      on(type, callback) {
        if (typeof callback !== 'function') {
          return api;
        }
        const key = String(type || '');
        if (!listeners.has(key)) {
          listeners.set(key, new Set());
        }
        listeners.get(key).add(callback);
        return api;
      },
      once(type, callback) {
        if (typeof callback !== 'function') {
          return api;
        }
        const wrapped = (...args) => {
          api.removeListener(type, wrapped);
          callback.apply(api, args);
        };
        return api.on(type, wrapped);
      },
      removeAllListeners(type) {
        if (type == null) {
          listeners.clear();
        } else {
          listeners.delete(String(type || ''));
        }
        return api;
      },
      removeListener(type, callback) {
        listeners.get(String(type || ''))?.delete(callback);
        return api;
      }
    };
    return hardenSandboxValue(api);
  }
  EventEmitter.EventEmitter = EventEmitter;
  return EventEmitter;
}

function createStreamModuleFacade() {
  const EventEmitter = createEventEmitterFacade();
  function PassThrough() {
    const emitter = new EventEmitter();
    const chunks = [];
    emitter.write = (chunk) => {
      chunks.push(chunk);
      emitter.emit('data', chunk);
      return true;
    };
    emitter.end = (chunk) => {
      if (chunk != null) {
        emitter.write(chunk);
      }
      emitter.emit('end');
    };
    emitter.read = () => chunks.shift();
    return hardenSandboxValue(emitter);
  }
  return {
    Duplex: PassThrough,
    PassThrough,
    Readable: PassThrough,
    Stream: EventEmitter,
    Transform: PassThrough,
    Writable: PassThrough,
    finished(stream, callback) {
      if (typeof callback === 'function') {
        callback(null, stream);
      }
    },
    pipeline(...args) {
      const callback = typeof args.at(-1) === 'function' ? args.at(-1) : undefined;
      if (callback) {
        callback(null);
      }
      return args[0];
    }
  };
}

function createTimersModuleFacade(registry = createPackageRegistryState()) {
  const tracker = registry.tracker;
  return {
    clearImmediate: tracker?.clearTimeout || (() => {}),
    clearInterval: tracker?.clearInterval || (() => {}),
    clearTimeout: tracker?.clearTimeout || (() => {}),
    setImmediate(callback, ...args) {
      if (!tracker) {
        throw sandboxError('timers.setImmediate is not available in this script runtime.');
      }
      return tracker.setTimeout(callback, 0, ...args);
    },
    setInterval(callback, delay, ...args) {
      if (!tracker) {
        throw sandboxError('timers.setInterval is not available in this script runtime.');
      }
      return tracker.setInterval(callback, delay, ...args);
    },
    setTimeout(callback, delay, ...args) {
      if (!tracker) {
        throw sandboxError('timers.setTimeout is not available in this script runtime.');
      }
      return tracker.setTimeout(callback, delay, ...args);
    }
  };
}

function createCachedScriptPackage(name, bundle, registry) {
  if (!registry.vmContext) {
    throw sandboxError(`Sandbox package "${name}" cannot load before the script context is ready.`);
  }
  return validateScriptPackageExport(name, loadCachedScriptPackageModule(name, bundle.entrypoint, registry), bundle);
}

function loadCachedScriptPackageModule(packageName, modulePath, registry) {
  const bundle = registry.packages.get(packageName);
  if (!bundle) {
    throw sandboxError(`Sandbox package "${packageName}" is not installed in the reviewed package cache.`);
  }
  const resolvedPath = resolvePackageModulePath(bundle, modulePath, '') || modulePath;
  const cacheKey = `${packageName}\0${resolvedPath}`;
  const cached = registry.packageModuleCache.get(cacheKey);
  if (cached) {
    return cached.module.exports;
  }
  if (registry.loading.length >= MAX_SCRIPT_PACKAGE_LOAD_DEPTH) {
    throw sandboxError('Sandbox package dependency depth exceeded.');
  }

  const moduleObject = createVmPackageModule(registry.vmContext, packageName, resolvedPath);
  registry.packageModuleCache.set(cacheKey, { module: moduleObject, packageName, path: resolvedPath });
  registry.loading.push(cacheKey);
  const bridgeName = `__postmeterPackageBridge_${crypto.randomBytes(8).toString('hex')}`;
  const bridge = hardenSandboxValue({
    module: moduleObject,
    require: (request) => requireFromReviewedPackage(packageName, resolvedPath, request, registry),
    resolve: (request) => resolveReviewedPackageRequest(packageName, resolvedPath, request, registry).display
  });
  const previousBridge = registry.vmContext[bridgeName];
  registry.vmContext[bridgeName] = bridge;
  try {
    const source = sourceForReviewedPackageModule(bundle, resolvedPath, bridgeName);
    const script = new vm.Script(source, {
      filename: `postmeter-package:${packageName}:${resolvedPath}`
    });
    script.runInContext(registry.vmContext, {
      timeout: Math.max(1, Math.min(DEFAULT_SCRIPT_TIMEOUT_MILLIS, registry.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS))
    });
    moduleObject.loaded = true;
    return moduleObject.exports;
  } catch (error) {
    registry.packageModuleCache.delete(cacheKey);
    throw sandboxError(`Sandbox package "${packageName}" module "${resolvedPath}" failed to load: ${errorMessage(error)}`);
  } finally {
    registry.loading.pop();
    if (previousBridge === undefined) {
      try {
        delete registry.vmContext[bridgeName];
      } catch {
        registry.vmContext[bridgeName] = undefined;
      }
    } else {
      registry.vmContext[bridgeName] = previousBridge;
    }
  }
}

function createVmPackageModule(vmContext, packageName, modulePath) {
  return vm.runInContext(`({
    id: ${JSON.stringify(`${packageName}/${modulePath}`)},
    filename: ${JSON.stringify(modulePath)},
    exports: {},
    loaded: false,
    parent: null,
    children: []
  })`, vmContext, { timeout: 50 });
}

function sourceForReviewedPackageModule(bundle, modulePath, bridgeName) {
  if (/\.json$/i.test(modulePath)) {
    return [
      "'use strict';",
      `this[${JSON.stringify(bridgeName)}].module.exports = JSON.parse(${JSON.stringify(bundle.files.get(modulePath) || '{}')});`
    ].join('\n');
  }
  const moduleSource = bundle.files.get(modulePath) || '';
  const source = reviewedPackageModuleIsEsm(bundle, modulePath, moduleSource)
    ? transpileReviewedEsmModule(moduleSource)
    : moduleSource;
  return [
    "'use strict';",
    '(() => {',
    `  const bridge = this[${JSON.stringify(bridgeName)}];`,
    '  const module = bridge.module;',
    '  const exports = module.exports;',
    '  const require = function postmeterReviewedPackageRequire(specifier) { return bridge.require(specifier); };',
    '  require.resolve = function postmeterReviewedPackageResolve(specifier) { return bridge.resolve(specifier); };',
    '  module.require = require;',
    `  const __filename = ${JSON.stringify(modulePath)};`,
    `  const __dirname = ${JSON.stringify(nodePath.posix.dirname(modulePath) === '.' ? '' : nodePath.posix.dirname(modulePath))};`,
    source,
    '})()'
  ].join('\n');
}

function reviewedPackageModuleIsEsm(bundle, modulePath, source) {
  if (/\.mjs$/i.test(modulePath)) {
    return true;
  }
  if (String(bundle.specifier || '').startsWith('jsr:')) {
    return true;
  }
  if (String(bundle.packageJson?.type || '').toLowerCase() === 'module' && !/\.cjs$/i.test(modulePath)) {
    return true;
  }
  return /^\s*(?:import|export)\s/m.test(String(source || ''));
}

function transpileReviewedEsmModule(source) {
  const exportedNames = new Set();
  let output = String(source || '');
  output = output.replace(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+)\2\s*;?/gm, (_match, namespace, _quote, specifier) => {
    return `const ${namespace} = require(${JSON.stringify(specifier)});`;
  });
  output = output.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]+)\}\s+from\s+(['"])([^'"]+)\3\s*;?/gm, (_match, defaultName, named, _quote, specifier) => {
    const moduleName = esmTempName('esm_default', defaultName);
    return [
      `const ${moduleName} = require(${JSON.stringify(specifier)});`,
      `const ${defaultName} = ${moduleName} && Object.prototype.hasOwnProperty.call(${moduleName}, 'default') ? ${moduleName}.default : ${moduleName};`,
      `const { ${esmImportBindings(named)} } = ${moduleName};`
    ].join('\n');
  });
  output = output.replace(/^\s*import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2\s*;?/gm, (_match, named, _quote, specifier) => {
    return `const { ${esmImportBindings(named)} } = require(${JSON.stringify(specifier)});`;
  });
  output = output.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+)\2\s*;?/gm, (_match, defaultName, _quote, specifier) => {
    const moduleName = esmTempName('esm_default', defaultName);
    return `const ${moduleName} = require(${JSON.stringify(specifier)});\nconst ${defaultName} = ${moduleName} && Object.prototype.hasOwnProperty.call(${moduleName}, 'default') ? ${moduleName}.default : ${moduleName};`;
  });
  output = output.replace(/^\s*import\s+(['"])([^'"]+)\1\s*;?/gm, (_match, _quote, specifier) => {
    return `require(${JSON.stringify(specifier)});`;
  });
  output = output.replace(/^\s*export\s+\*\s+from\s+(['"])([^'"]+)\1\s*;?/gm, (_match, _quote, specifier) => {
    const moduleName = esmTempName('esm_star', specifier);
    return `Object.assign(exports, require(${JSON.stringify(specifier)}));`;
  });
  output = output.replace(/^\s*export\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2\s*;?/gm, (_match, names, _quote, specifier) => {
    const moduleName = esmTempName('esm_reexport', specifier);
    return `const ${moduleName} = require(${JSON.stringify(specifier)});\n${esmExportListAssignments(names, moduleName)}`;
  });
  output = output.replace(/^\s*export\s+default\s+function\s+([A-Za-z_$][\w$]*)?\s*\(/gm, (_match, name = '') => `exports.default = function ${name || ''}(`);
  output = output.replace(/^\s*export\s+default\s+class\s+([A-Za-z_$][\w$]*)?\s*/gm, (_match, name = '') => `exports.default = class ${name || ''} `);
  output = output.replace(/^\s*export\s+default\s+([^;\n]+)\s*;?/gm, (_match, expression) => {
    return `exports.default = ${expression};`;
  });
  output = output.replace(/^\s*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_match, kind, name) => {
    exportedNames.add(name);
    return `${kind} ${name}`;
  });
  output = output.replace(/^\s*export\s+function\s+([A-Za-z_$][\w$]*)/gm, (_match, name) => {
    exportedNames.add(name);
    return `function ${name}`;
  });
  output = output.replace(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm, (_match, name) => {
    exportedNames.add(name);
    return `class ${name}`;
  });
  output = output.replace(/^\s*export\s+\{([^}]+)\}\s*;?/gm, (_match, names) => esmExportListAssignments(names));
  const assignments = [...exportedNames]
    .map((name) => name === 'default' ? '' : `exports.${name} = ${name};`)
    .filter(Boolean)
    .join('\n');
  return [
    'Object.defineProperty(exports, "__esModule", { value: true });',
    output,
    assignments
  ].filter(Boolean).join('\n');
}

function esmExportListAssignments(names, moduleName = '') {
  return String(names || '')
    .split(',')
    .map((part) => {
      const [local, exported = local] = part.trim().split(/\s+as\s+/i).map((value) => value.trim()).filter(Boolean);
      if (!local || VISUALIZER_UNSAFE_PATH_PARTS.has(local) || VISUALIZER_UNSAFE_PATH_PARTS.has(exported)) {
        return '';
      }
      const source = moduleName ? `${moduleName}.${local}` : local;
      return `exports.${exported} = ${source};`;
    })
    .filter(Boolean)
    .join('\n');
}

function esmImportBindings(names) {
  return String(names || '')
    .split(',')
    .map((part) => {
      const [imported, local = imported] = part.trim().split(/\s+as\s+/i).map((value) => value.trim()).filter(Boolean);
      if (!imported || VISUALIZER_UNSAFE_PATH_PARTS.has(imported) || VISUALIZER_UNSAFE_PATH_PARTS.has(local)) {
        return '';
      }
      return imported === local ? imported : `${imported}: ${local}`;
    })
    .filter(Boolean)
    .join(', ');
}

function esmTempName(prefix, value) {
  return `__postmeter_${prefix}_${crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 8)}`;
}

function requireFromReviewedPackage(packageName, parentPath, request, registry) {
  const resolution = resolveReviewedPackageRequest(packageName, parentPath, request, registry);
  if (resolution.kind === 'local') {
    return loadCachedScriptPackageModule(packageName, resolution.path, registry);
  }
  if (resolution.kind === 'package-module') {
    return loadCachedScriptPackageModule(resolution.specifier, resolution.path, registry);
  }
  if (resolution.kind === 'package') {
    return packageRequireApi(registry, { issuer: packageName })(resolution.specifier);
  }
  throw sandboxError(`Sandbox package "${packageName}" cannot require "${String(request || '')}".`);
}

function resolveReviewedPackageRequest(packageName, parentPath, request, registry) {
  const bundle = registry.packages.get(packageName);
  const raw = String(request == null ? '' : request).trim();
  if (!raw) {
    throw sandboxError(`Sandbox package "${packageName}" require specifier is empty.`);
  }
  if (raw.startsWith('.') && !raw.includes('\\')) {
    const resolvedPath = resolvePackageModulePath(bundle, raw, parentPath);
    if (!resolvedPath) {
      throw sandboxError(`Sandbox package "${packageName}" cannot resolve module "${raw}" from "${parentPath}".`);
    }
    return {
      display: `./${resolvedPath}`,
      kind: 'local',
      path: resolvedPath
    };
  }
  if (
    raw.startsWith('/')
    || raw.includes('\\')
    || raw.startsWith('node:')
    || /^https?:/i.test(raw)
  ) {
    throw sandboxError('PostMeter package loading only supports bundled sandbox packages, not Node modules or external package specifiers.');
  }
  const dependency = resolveReviewedPackageDependencySpecifier(bundle, raw, registry);
  if (!bundle.dependencies.has(dependency.specifier)) {
    throw sandboxError(`Sandbox package "${packageName}" cannot require undeclared dependency "${raw}".`);
  }
  if (dependency.subpath) {
    const dependencyBundle = registry.packages.get(dependency.specifier);
    if (!dependencyBundle) {
      throw sandboxError(`Sandbox package "${packageName}" cannot resolve module "${raw}" because "${dependency.specifier}" is not a reviewed package bundle.`);
    }
    const dependencyPath = resolvePackageModulePath(dependencyBundle, dependency.subpath, '');
    if (!dependencyPath) {
      throw sandboxError(`Sandbox package "${packageName}" cannot resolve module "${raw}" in dependency "${dependency.specifier}".`);
    }
    return {
      display: `${dependency.specifier}/${dependencyPath}`,
      kind: 'package-module',
      path: dependencyPath,
      specifier: dependency.specifier
    };
  }
  return {
    display: dependency.specifier,
    kind: 'package',
    specifier: dependency.specifier
  };
}

function resolveReviewedPackageDependencySpecifier(bundle, request, registry) {
  const normalized = normalizeScriptPackageDependencyRequest(request);
  const aliasTarget = resolveReviewedPackageAliasTarget(bundle, request, normalized);
  if (aliasTarget) {
    return aliasTarget;
  }
  const lowered = String(normalized || '').toLowerCase();
  const builtin = SCRIPT_PACKAGE_ALIASES.get(lowered) || lowered;
  if (SCRIPT_PACKAGE_NAMES.includes(builtin)) {
    return { specifier: builtin, subpath: '' };
  }
  if (registry.packages.has(request)) {
    return { specifier: request, subpath: '' };
  }
  const indexed = registry.packageNameIndex.get(request);
  if (indexed) {
    return { specifier: indexed, subpath: '' };
  }
  const packageNameTarget = resolveReviewedPackageNameTarget(request, registry);
  if (packageNameTarget) {
    return packageNameTarget;
  }
  if (SCRIPT_PACKAGE_SPECIFIER_PATTERN.test(request)) {
    return { specifier: request, subpath: '' };
  }
  return { specifier: normalized, subpath: '' };
}

function resolveReviewedPackageAliasTarget(bundle, request, normalized) {
  const candidates = [String(request || ''), String(normalized || '')].filter(Boolean);
  for (const candidate of candidates) {
    const exact = bundle.dependencyAliases.get(candidate);
    if (exact) {
      return { specifier: exact, subpath: '' };
    }
  }
  const aliases = [...bundle.dependencyAliases.keys()]
    .sort((left, right) => right.length - left.length);
  for (const alias of aliases) {
    const candidate = candidates.find((value) => value.startsWith(`${alias}/`));
    if (!candidate) {
      continue;
    }
    const subpath = normalizeScriptPackageFilePath(candidate.slice(alias.length + 1));
    if (!subpath) {
      throw sandboxError(`Sandbox package dependency alias request "${candidate}" is invalid.`);
    }
    return {
      specifier: bundle.dependencyAliases.get(alias),
      subpath
    };
  }
  return null;
}

function resolveReviewedPackageNameTarget(request, registry) {
  const split = splitPackageSubpathRequest(request);
  if (!split) {
    return null;
  }
  if (registry.packages.has(split.packageName)) {
    return {
      specifier: split.packageName,
      subpath: split.subpath
    };
  }
  const indexed = registry.packageNameIndex.get(split.packageName);
  if (!indexed) {
    return null;
  }
  return {
    specifier: indexed,
    subpath: split.subpath
  };
}

function splitPackageSubpathRequest(request) {
  const raw = String(request || '').trim();
  if (!raw || raw.startsWith('.') || raw.startsWith('/') || raw.includes('\\') || raw.startsWith('node:') || /^https?:/i.test(raw)) {
    return null;
  }
  const parts = raw.split('/').filter(Boolean);
  if (raw.startsWith('@')) {
    if (parts.length < 3) {
      return null;
    }
    const subpath = normalizeScriptPackageFilePath(parts.slice(2).join('/'));
    if (!subpath) {
      throw sandboxError(`Sandbox package dependency subpath "${raw}" is invalid.`);
    }
    return {
      packageName: `${parts[0]}/${parts[1]}`,
      subpath
    };
  }
  if (parts.length < 2) {
    return null;
  }
  const subpath = normalizeScriptPackageFilePath(parts.slice(1).join('/'));
  if (!subpath) {
    throw sandboxError(`Sandbox package dependency subpath "${raw}" is invalid.`);
  }
  return {
    packageName: parts[0],
    subpath
  };
}

function resolvePackageModulePath(bundle, request, parentPath = '') {
  const basePath = request.startsWith('.')
    ? nodePath.posix.normalize(nodePath.posix.join(nodePath.posix.dirname(parentPath || bundle.entrypoint || 'index.js'), request))
    : normalizeScriptPackageFilePath(request);
  if (!basePath || basePath.startsWith('../') || basePath === '..') {
    return '';
  }
  for (const candidate of packageModulePathVariants(basePath, bundle)) {
    if (bundle.files.has(candidate)) {
      return candidate;
    }
  }
  return '';
}

function packageModulePathVariants(basePath, bundle) {
  const normalized = normalizeScriptPackageFilePath(basePath);
  if (!normalized) {
    return [];
  }
  const variants = [normalized];
  if (!/\.(?:json|[cm]?js)$/i.test(normalized)) {
    variants.push(`${normalized}.js`, `${normalized}.cjs`, `${normalized}.mjs`, `${normalized}.json`);
  }
  variants.push(...packageDirectoryEntryVariants(normalized, bundle));
  return [...new Set(variants.map(normalizeScriptPackageFilePath).filter(Boolean))];
}

function packageDirectoryEntryVariants(basePath, bundle) {
  const packageJsonPath = normalizeScriptPackageFilePath(`${basePath}/package.json`);
  const variants = [];
  if (bundle.files.has(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(bundle.files.get(packageJsonPath));
      const entrypoint = normalizeScriptPackageEntrypoint('', packageJson);
      variants.push(`${basePath}/${entrypoint}`);
    } catch {
      // Invalid JSON is reported when that package.json module is loaded.
    }
  }
  variants.push(`${basePath}/index.js`, `${basePath}/index.cjs`, `${basePath}/index.mjs`, `${basePath}/index.json`);
  return variants;
}

function createCryptoJsPackage() {
  const enc = {};
  enc.Hex = hardenSandboxValue({
    stringify: (wordArray) => wordArrayToBuffer(wordArray).toString('hex'),
    parse: (value) => createCryptoWordArray(Buffer.from(String(value || ''), 'hex'))
  });
  enc.Base64 = hardenSandboxValue({
    stringify: (wordArray) => wordArrayToBuffer(wordArray).toString('base64'),
    parse: (value) => createCryptoWordArray(Buffer.from(String(value || ''), 'base64'))
  });
  enc.Utf8 = hardenSandboxValue({
    stringify: (wordArray) => wordArrayToBuffer(wordArray).toString('utf8'),
    parse: (value) => createCryptoWordArray(Buffer.from(String(value == null ? '' : value), 'utf8'))
  });

  return hardenSandboxValue({
    MD5: (value) => cryptoDigest('md5', value),
    SHA1: (value) => cryptoDigest('sha1', value),
    SHA256: (value) => cryptoDigest('sha256', value),
    SHA512: (value) => cryptoDigest('sha512', value),
    HmacSHA256: (value, key) => cryptoHmac('sha256', value, key),
    HmacSHA512: (value, key) => cryptoHmac('sha512', value, key),
    enc
  });
}

function cryptoDigest(algorithm, value) {
  return createCryptoWordArray(crypto.createHash(algorithm).update(cryptoInputBuffer(value)).digest());
}

function cryptoHmac(algorithm, value, key) {
  return createCryptoWordArray(crypto.createHmac(algorithm, cryptoInputBuffer(key)).update(cryptoInputBuffer(value)).digest());
}

function createCryptoWordArray(bytes) {
  const wordArray = {
    sigBytes: Buffer.byteLength(bytes),
    toString(encoder) {
      if (encoder?.stringify && typeof encoder.stringify === 'function') {
        return encoder.stringify(wordArray);
      }
      return wordArrayToBuffer(wordArray).toString('hex');
    }
  };
  WORD_ARRAY_BYTES.set(wordArray, Buffer.from(bytes));
  return hardenSandboxValue(wordArray);
}

function cryptoInputBuffer(value) {
  if (WORD_ARRAY_BYTES.has(value)) {
    return Buffer.from(WORD_ARRAY_BYTES.get(value));
  }
  return Buffer.from(String(value == null ? '' : value), 'utf8');
}

function bufferFromArrayBufferLike(value) {
  if (value == null) {
    return Buffer.alloc(0);
  }
  if (SCRIPT_BUFFER_BYTES.has(value)) {
    return Buffer.from(SCRIPT_BUFFER_BYTES.get(value));
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
    return Buffer.from(value);
  }
  if (Array.isArray(value)) {
    return Buffer.from(value.map((item) => Number(item) & 0xff));
  }
  return Buffer.from(String(value), 'utf8');
}

function bufferToArrayBuffer(value) {
  const bytes = Buffer.from(value || []);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function wordArrayToBuffer(value) {
  if (!WORD_ARRAY_BYTES.has(value)) {
    throw sandboxError('CryptoJS encoder requires a PostMeter CryptoJS word array.');
  }
  return Buffer.from(WORD_ARRAY_BYTES.get(value));
}

function createUuidPackage() {
  return {
    NIL: '00000000-0000-0000-0000-000000000000',
    v4: () => crypto.randomUUID(),
    validate(value) {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
    },
    version(value) {
      const match = String(value || '').match(/^[0-9a-f]{8}-[0-9a-f]{4}-([1-5])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      return match ? Number(match[1]) : undefined;
    }
  };
}

function createAjvPackage() {
  function Ajv(options = {}) {
    return createAjvInstance(options);
  }
  Ajv.default = Ajv;
  return Ajv;
}

function createAjvInstance(options = {}) {
  let lastErrors = null;
  const instance = {
    validate(schema, data) {
      const result = validateJsonSchema(schema, data, '', options);
      lastErrors = result.errors.length ? result.errors : null;
      return result.valid;
    },
    compile(schema) {
      const validate = function compiledAjvValidator(data) {
        const result = validateJsonSchema(schema, data, '', options);
        validate.errors = result.errors.length ? hardenSandboxValue(cloneJson(result.errors)) : null;
        return result.valid;
      };
      validate.errors = null;
      return hardenSandboxValue(validate);
    },
    addSchema() {
      return instance;
    },
    errorsText(errors = lastErrors) {
      return (Array.isArray(errors) ? errors : [])
        .map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`.trim())
        .join(', ');
    },
    get errors() {
      return lastErrors ? hardenSandboxValue(cloneJson(lastErrors)) : null;
    }
  };
  return hardenSandboxValue(instance);
}

function validateJsonSchema(schema, data, pathValue = '', options = {}) {
  const errors = [];
  validateJsonSchemaAt(schema, data, pathValue, errors, options);
  return { valid: errors.length === 0, errors };
}

function validateJsonSchemaAt(schema, data, pathValue, errors, options) {
  if (schema === true || schema == null) {
    return;
  }
  if (schema === false) {
    addJsonSchemaError(errors, pathValue, 'false schema', 'must not validate');
    return;
  }
  if (!schema || typeof schema !== 'object') {
    return;
  }

  if (schema.const !== undefined && !deepEqual(data, schema.const)) {
    addJsonSchemaError(errors, pathValue, 'const', 'must be equal to constant');
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => deepEqual(item, data))) {
    addJsonSchemaError(errors, pathValue, 'enum', 'must be equal to one of the allowed values');
    return;
  }
  if (schema.type && !jsonSchemaTypeMatches(data, schema.type)) {
    addJsonSchemaError(errors, pathValue, 'type', `must be ${Array.isArray(schema.type) ? schema.type.join(',') : schema.type}`);
    return;
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        addJsonSchemaError(errors, jsonPointer(pathValue, key), 'required', `must have required property '${key}'`);
      }
    }
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        validateJsonSchemaAt(propertySchema, data[key], jsonPointer(pathValue, key), errors, options);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          addJsonSchemaError(errors, jsonPointer(pathValue, key), 'additionalProperties', 'must NOT have additional properties');
        }
      }
    }
  }

  if (Array.isArray(data) && schema.items) {
    data.forEach((item, index) => validateJsonSchemaAt(schema.items, item, jsonPointer(pathValue, index), errors, options));
  }
  if (typeof data === 'string') {
    if (schema.minLength != null && data.length < Number(schema.minLength)) {
      addJsonSchemaError(errors, pathValue, 'minLength', `must NOT have fewer than ${schema.minLength} characters`);
    }
    if (schema.maxLength != null && data.length > Number(schema.maxLength)) {
      addJsonSchemaError(errors, pathValue, 'maxLength', `must NOT have more than ${schema.maxLength} characters`);
    }
    if (schema.pattern != null && !(new RegExp(String(schema.pattern)).test(data))) {
      addJsonSchemaError(errors, pathValue, 'pattern', `must match pattern "${schema.pattern}"`);
    }
  }
  if (typeof data === 'number') {
    if (schema.minimum != null && data < Number(schema.minimum)) {
      addJsonSchemaError(errors, pathValue, 'minimum', `must be >= ${schema.minimum}`);
    }
    if (schema.maximum != null && data > Number(schema.maximum)) {
      addJsonSchemaError(errors, pathValue, 'maximum', `must be <= ${schema.maximum}`);
    }
  }
}

function jsonSchemaTypeMatches(value, expectedType) {
  const expected = Array.isArray(expectedType) ? expectedType : [expectedType];
  return expected.some((typeName) => {
    const type = String(typeName || '');
    if (type === 'array') {
      return Array.isArray(value);
    }
    if (type === 'integer') {
      return Number.isInteger(value);
    }
    if (type === 'number') {
      return typeof value === 'number' && !Number.isNaN(value);
    }
    if (type === 'object') {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    }
    if (type === 'null') {
      return value === null;
    }
    return typeof value === type;
  });
}

function addJsonSchemaError(errors, instancePath, keyword, message) {
  errors.push({
    instancePath: instancePath || '',
    dataPath: instancePath || '',
    keyword,
    message,
    schemaPath: ''
  });
}

function jsonPointer(basePath, part) {
  const escaped = String(part).replace(/~/g, '~0').replace(/\//g, '~1');
  return `${basePath || ''}/${escaped}`;
}

function createLodashPackage() {
  const lodash = {
    assign(target, ...sources) {
      const output = target && typeof target === 'object' ? target : createSafePlainObject();
      for (const source of sources) {
        assignSafeObjectProperties(output, source);
      }
      return hardenSandboxValue(output);
    },
    cloneDeep(value) {
      return hardenSandboxValue(cloneJson(value));
    },
    each(value, callback) {
      lodashForEach(value, callback);
      return value;
    },
    filter(value, predicate) {
      const result = [];
      lodashForEach(value, (item, key) => {
        if (lodashPredicate(predicate, item, key)) {
          result.push(item);
        }
      });
      return hardenSandboxValue(result);
    },
    find(value, predicate) {
      let found;
      lodashForEach(value, (item, key) => {
        if (found === undefined && lodashPredicate(predicate, item, key)) {
          found = item;
        }
      });
      return found;
    },
    forEach(value, callback) {
      lodashForEach(value, callback);
      return value;
    },
    get: lodashGet,
    has(value, pathValue) {
      return lodashGet(value, pathValue) !== undefined;
    },
    includes(value, search) {
      if (typeof value === 'string') {
        return value.includes(String(search));
      }
      if (Array.isArray(value)) {
        return value.includes(search);
      }
      return value && typeof value === 'object' ? Object.values(value).includes(search) : false;
    },
    isArray: Array.isArray,
    isEmpty,
    isEqual: lodashIsEqual,
    isNumber(value) {
      return typeof value === 'number' && !Number.isNaN(value);
    },
    isObject(value) {
      return value !== null && typeof value === 'object';
    },
    isString(value) {
      return typeof value === 'string';
    },
    map(value, iteratee) {
      const result = [];
      lodashForEach(value, (item, key) => {
        result.push(lodashIteratee(iteratee, item, key));
      });
      return hardenSandboxValue(result);
    },
    omit(value, keys) {
      const blocked = new Set((Array.isArray(keys) ? keys : [keys]).map(String));
      const result = createSafePlainObject();
      for (const [key, item] of Object.entries(value || {})) {
        if (!blocked.has(key)) {
          setSafeObjectProperty(result, key, item);
        }
      }
      return hardenSandboxValue(result);
    },
    pick(value, keys) {
      const result = createSafePlainObject();
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!VISUALIZER_UNSAFE_PATH_PARTS.has(String(key)) && Object.prototype.hasOwnProperty.call(Object(value || {}), key)) {
          setSafeObjectProperty(result, key, value[key]);
        }
      }
      return hardenSandboxValue(result);
    },
    reduce(value, iteratee, initial) {
      let accumulator = initial;
      let started = arguments.length >= 3;
      lodashForEach(value, (item, key) => {
        if (!started) {
          accumulator = item;
          started = true;
          return;
        }
        accumulator = iteratee(accumulator, item, key, value);
      });
      return accumulator;
    },
    set(value, pathValue, nextValue) {
      return lodashSet(value, pathValue, nextValue);
    },
    uniq(value) {
      return hardenSandboxValue([...new Set(Array.isArray(value) ? value : [])]);
    },
    unset(value, pathValue) {
      return lodashUnset(value, pathValue);
    }
  };
  return hardenSandboxValue(lodash);
}

function lodashForEach(value, callback) {
  if (typeof callback !== 'function') {
    throw sandboxError('lodash callback must be a function.');
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => callback(item, index, value));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      callback(item, key, value);
    }
  }
}

function assignSafeObjectProperties(target, source) {
  if (!source || typeof source !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    setSafeObjectProperty(target, key, value);
  }
}

function createSafePlainObject() {
  return Object.create(null);
}

function setSafeObjectProperty(target, key, value) {
  const safeKey = String(key || '');
  if (!safeKey || VISUALIZER_UNSAFE_PATH_PARTS.has(safeKey)) {
    return false;
  }
  target[safeKey] = value;
  return true;
}

function lodashPredicate(predicate, item, key) {
  if (typeof predicate === 'function') {
    return predicate(item, key);
  }
  if (typeof predicate === 'string') {
    return Boolean(lodashGet(item, predicate));
  }
  if (predicate && typeof predicate === 'object') {
    return Object.entries(predicate).every(([pathValue, expected]) => lodashGet(item, pathValue) === expected);
  }
  return Boolean(item);
}

function lodashIteratee(iteratee, item, key) {
  if (typeof iteratee === 'function') {
    return iteratee(item, key);
  }
  if (typeof iteratee === 'string') {
    return lodashGet(item, iteratee);
  }
  return item;
}

function lodashGet(value, pathValue, defaultValue) {
  let current = value;
  for (const part of lodashPath(pathValue)) {
    if (current == null || !Object.prototype.hasOwnProperty.call(Object(current), part)) {
      return defaultValue;
    }
    current = current[part];
  }
  return current === undefined ? defaultValue : current;
}

function lodashSet(value, pathValue, nextValue) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const parts = lodashPath(pathValue);
  let current = value;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (VISUALIZER_UNSAFE_PATH_PARTS.has(part)) {
      return value;
    }
    if (index === parts.length - 1) {
      current[part] = nextValue;
      return value;
    }
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = hardenSandboxValue({});
    }
    current = current[part];
  }
  return value;
}

function lodashUnset(value, pathValue) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const parts = lodashPath(pathValue);
  const key = parts.pop();
  const parent = lodashGet(value, parts);
  if (!parent || typeof parent !== 'object' || VISUALIZER_UNSAFE_PATH_PARTS.has(key)) {
    return false;
  }
  return delete parent[key];
}

function lodashPath(pathValue) {
  const parts = Array.isArray(pathValue)
    ? pathValue
    : String(pathValue == null ? '' : pathValue).replace(/\[(\w+)\]/g, '.$1').split('.');
  return parts.map((part) => String(part)).filter((part) => part && !VISUALIZER_UNSAFE_PATH_PARTS.has(part));
}

function lodashIsEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => lodashIsEqual(item, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && lodashIsEqual(left[key], right[key]));
  }
  return false;
}

function createChaiPackage() {
  const assert = {
    ok(value, message) {
      assertCondition(Boolean(value), message || `Expected ${value} to be truthy.`);
    },
    isOk(value, message) {
      assert.ok(value, message);
    },
    isNotOk(value, message) {
      assertCondition(!value, message || `Expected ${value} to be falsy.`);
    },
    equal(actual, expected, message) {
      assertCondition(actual == expected, message || `Expected ${actual} to equal ${expected}.`);
    },
    notEqual(actual, expected, message) {
      assertCondition(actual != expected, message || `Expected ${actual} not to equal ${expected}.`);
    },
    strictEqual(actual, expected, message) {
      assertCondition(Object.is(actual, expected), message || `Expected ${actual} to strictly equal ${expected}.`);
    },
    notStrictEqual(actual, expected, message) {
      assertCondition(!Object.is(actual, expected), message || `Expected ${actual} not to strictly equal ${expected}.`);
    },
    deepEqual(actual, expected, message) {
      assertCondition(deepEqual(actual, expected), message || 'Expected values to be deeply equal.');
    },
    notDeepEqual(actual, expected, message) {
      assertCondition(!deepEqual(actual, expected), message || 'Expected values not to be deeply equal.');
    },
    isTrue(value, message) {
      assertCondition(value === true, message || `Expected ${value} to be true.`);
    },
    isFalse(value, message) {
      assertCondition(value === false, message || `Expected ${value} to be false.`);
    },
    typeOf(value, typeName, message) {
      try {
        assertType(value, typeName);
      } catch (error) {
        throw sandboxError(message || errorMessage(error));
      }
    },
    isArray(value, message) {
      assertCondition(Array.isArray(value), message || 'Expected value to be an array.');
    },
    isObject(value, message) {
      assertCondition(value !== null && typeof value === 'object' && !Array.isArray(value), message || 'Expected value to be an object.');
    },
    include(actual, expected, message) {
      try {
        assertIncludes(actual, expected, false, { deep: true });
      } catch (error) {
        throw sandboxError(message || errorMessage(error));
      }
    },
    notInclude(actual, expected, message) {
      try {
        assertIncludes(actual, expected, true, { deep: true });
      } catch (error) {
        throw sandboxError(message || errorMessage(error));
      }
    },
    match(actual, pattern, message) {
      assertCondition(testPattern(pattern, actual), message || `Expected ${actual} to match ${pattern}.`);
    },
    notMatch(actual, pattern, message) {
      assertCondition(!testPattern(pattern, actual), message || `Expected ${actual} not to match ${pattern}.`);
    },
    property(object, property, message) {
      assertCondition(object != null && Object.hasOwn(object, property), message || `Expected object to have property ${property}.`);
    },
    notProperty(object, property, message) {
      assertCondition(object == null || !Object.hasOwn(object, property), message || `Expected object not to have property ${property}.`);
    },
    throws(fn, expected, message) {
      expect(fn).to.throw(expected, message);
    },
    doesNotThrow(fn, expected, message) {
      expect(fn).to.not.throw(expected, message);
    },
    fail(message) {
      throw sandboxError(message || 'Assertion failed.');
    }
  };
  return {
    expect,
    assert,
    should() {
      return hardenSandboxValue({
        equal(actual, expected, message) {
          assert.strictEqual(actual, expected, message);
        },
        exist(value, message) {
          assertCondition(value != null, message || 'Expected value to exist.');
        }
      });
    }
  };
}

function createMomentPackage() {
  function moment(value) {
    return createMomentInstance(parseMomentInput(value));
  }
  moment.utc = (value) => createMomentInstance(parseMomentInput(value));
  moment.unix = (seconds) => createMomentInstance(new Date(Number(seconds || 0) * 1000));
  moment.isMoment = (value) => MOMENT_INSTANCES.has(value);
  moment.ISO_8601 = 'ISO_8601';
  return moment;
}

function createMomentInstance(inputDate) {
  let date = Number.isNaN(inputDate.getTime()) ? new Date(Number.NaN) : new Date(inputDate.getTime());
  const instance = {
    isValid() {
      return !Number.isNaN(date.getTime());
    },
    format(pattern = 'YYYY-MM-DDTHH:mm:ssZ') {
      if (!instance.isValid()) {
        return 'Invalid date';
      }
      return formatMomentDate(date, pattern);
    },
    toISOString() {
      return instance.isValid() ? date.toISOString() : null;
    },
    valueOf() {
      return date.getTime();
    },
    unix() {
      return Math.floor(date.getTime() / 1000);
    },
    clone() {
      return createMomentInstance(date);
    },
    utc() {
      return instance;
    },
    local() {
      return instance;
    },
    add(amount, unit) {
      date = addMomentDuration(date, Number(amount || 0), unit);
      return instance;
    },
    subtract(amount, unit) {
      date = addMomentDuration(date, -Number(amount || 0), unit);
      return instance;
    },
    toDate() {
      return safeDateLike(date);
    },
    toString() {
      return instance.isValid() ? date.toISOString() : 'Invalid date';
    }
  };
  MOMENT_INSTANCES.add(instance);
  return hardenSandboxValue(instance);
}

function parseMomentInput(value) {
  if (value && MOMENT_INSTANCES.has(value) && typeof value.valueOf === 'function') {
    return new Date(value.valueOf());
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === 'number') {
    return new Date(value);
  }
  if (value == null || value === '') {
    return new Date();
  }
  return new Date(String(value));
}

function addMomentDuration(date, amount, unit) {
  const next = new Date(date.getTime());
  const normalized = String(unit || 'milliseconds').toLowerCase();
  if (normalized.startsWith('year')) {
    next.setUTCFullYear(next.getUTCFullYear() + amount);
  } else if (normalized.startsWith('month')) {
    next.setUTCMonth(next.getUTCMonth() + amount);
  } else if (normalized.startsWith('week')) {
    next.setUTCDate(next.getUTCDate() + amount * 7);
  } else if (normalized.startsWith('day')) {
    next.setUTCDate(next.getUTCDate() + amount);
  } else if (normalized.startsWith('hour')) {
    next.setUTCHours(next.getUTCHours() + amount);
  } else if (normalized.startsWith('minute')) {
    next.setUTCMinutes(next.getUTCMinutes() + amount);
  } else if (normalized.startsWith('second')) {
    next.setUTCSeconds(next.getUTCSeconds() + amount);
  } else {
    next.setUTCMilliseconds(next.getUTCMilliseconds() + amount);
  }
  return next;
}

function formatMomentDate(date, pattern) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const replacements = {
    YYYY: String(date.getUTCFullYear()),
    YY: String(date.getUTCFullYear()).slice(-2),
    MM: pad(date.getUTCMonth() + 1),
    DD: pad(date.getUTCDate()),
    HH: pad(date.getUTCHours()),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds()),
    SSS: pad(date.getUTCMilliseconds(), 3),
    Z: '+00:00'
  };
  return String(pattern || '')
    .replace(/\[([^\]]*)\]/g, (_match, literal) => `\u0000${literal}\u0000`)
    .replace(/YYYY|YY|SSS|MM|DD|HH|mm|ss|Z/g, (token) => replacements[token] || token)
    .replace(/\u0000([^\u0000]*)\u0000/g, (_match, literal) => literal);
}

function safeDateLike(date) {
  const millis = date.getTime();
  return hardenSandboxValue({
    getTime() {
      return millis;
    },
    valueOf() {
      return millis;
    },
    toISOString() {
      return Number.isNaN(millis) ? null : new Date(millis).toISOString();
    },
    toString() {
      return Number.isNaN(millis) ? 'Invalid Date' : new Date(millis).toISOString();
    }
  });
}

function createCsvParseSyncPackage() {
  const parse = (input, options = {}) => parseCsvSync(input, options);
  parse.parse = parse;
  return parse;
}

function parseCsvSync(input, options = {}) {
  const delimiter = String(options.delimiter || ',');
  const quote = String(options.quote || '"');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(input == null ? '' : input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === quote) {
      if (quoted && next === quote) {
        field += quote;
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && source.startsWith(delimiter, index)) {
      row.push(normalizeCsvField(field, options));
      field = '';
      index += delimiter.length - 1;
    } else if (!quoted && char === '\n') {
      row.push(normalizeCsvField(field, options));
      pushCsvRow(rows, row, options);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(normalizeCsvField(field, options));
  pushCsvRow(rows, row, options);
  return hardenSandboxValue(applyCsvColumns(rows, options));
}

function normalizeCsvField(field, options) {
  return options.trim === true ? String(field).trim() : String(field);
}

function pushCsvRow(rows, row, options) {
  if (options.skip_empty_lines === true && row.every((field) => field === '')) {
    return;
  }
  rows.push(row);
}

function applyCsvColumns(rows, options) {
  if (!options.columns) {
    return rows;
  }
  const headers = Array.isArray(options.columns)
    ? options.columns.map(String)
    : (rows.shift() || []).map(String);
  return rows.map((row) => {
    const object = createSafePlainObject();
    headers.forEach((header, index) => {
      if (header) {
        setSafeObjectProperty(object, header, row[index] ?? '');
      }
    });
    return object;
  });
}

function createCheerioPackage() {
  return {
    load(html) {
      return createCheerioRoot(html);
    }
  };
}

function createCheerioRoot(html) {
  const source = String(html == null ? '' : html);
  const query = function cheerioQuery(selector) {
    if (selector && typeof selector === 'object' && selector.__postmeterCheerioElement) {
      return createCheerioCollection([selector]);
    }
    return createCheerioCollection(selectCheerioElements(source, String(selector || '')));
  };
  query.html = () => source;
  query.text = () => stripHtml(source);
  query.root = () => createCheerioCollection([{ __postmeterCheerioElement: true, tag: 'root', attrs: createSafePlainObject(), inner: source, outer: source }]);
  return hardenSandboxValue(query);
}

function createCheerioCollection(elements) {
  const safeElements = elements.slice(0, 500);
  const collection = {
    length: safeElements.length,
    text() {
      return safeElements.map((element) => stripHtml(element.inner)).join('');
    },
    html() {
      return safeElements[0]?.inner ?? null;
    },
    attr(name) {
      return safeElements[0]?.attrs?.[String(name || '')];
    },
    first() {
      return createCheerioCollection(safeElements.slice(0, 1));
    },
    eq(index) {
      const offset = Number(index || 0);
      return createCheerioCollection(offset >= 0 && offset < safeElements.length ? [safeElements[offset]] : []);
    },
    get(index) {
      if (index == null) {
        return hardenSandboxValue(safeElements.map((element) => ({ tagName: element.tag, attribs: cloneJson(element.attrs || {}) })));
      }
      const element = safeElements[Number(index)];
      return element ? hardenSandboxValue({ tagName: element.tag, attribs: cloneJson(element.attrs || {}) }) : undefined;
    },
    each(callback) {
      if (typeof callback === 'function') {
        safeElements.forEach((element, index) => callback(index, hardenSandboxValue({ tagName: element.tag, attribs: cloneJson(element.attrs || {}) })));
      }
      return collection;
    },
    map(callback) {
      const mapped = typeof callback === 'function'
        ? safeElements.map((element, index) => callback(index, hardenSandboxValue({ tagName: element.tag, attribs: cloneJson(element.attrs || {}) })))
        : [];
      return hardenSandboxValue({ get: () => hardenSandboxValue(mapped) });
    }
  };
  return hardenSandboxValue(collection);
}

function selectCheerioElements(source, selector) {
  const parts = selector.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return [];
  }
  let candidates = parseHtmlElementList(source);
  for (const part of parts) {
    candidates = candidates.flatMap((candidate) => parseHtmlElementList(candidate.inner).filter((element) => cheerioSelectorMatches(element, part)));
    if (!candidates.length) {
      candidates = parseHtmlElementList(source).filter((element) => cheerioSelectorMatches(element, part));
    }
  }
  return candidates.filter((element) => cheerioSelectorMatches(element, parts[parts.length - 1]));
}

function parseHtmlElementList(source) {
  const elements = [];
  const pattern = /<([A-Za-z][A-Za-z0-9:-]*)([^>]*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = pattern.exec(String(source || ''))) !== null && elements.length < 1000) {
    elements.push({
      __postmeterCheerioElement: true,
      tag: match[1].toLowerCase(),
      attrs: parseMarkupAttributes(match[2]),
      inner: match[3],
      outer: match[0]
    });
  }
  return elements;
}

function cheerioSelectorMatches(element, selector) {
  const source = String(selector || '');
  if (!source || source === '*') {
    return true;
  }
  const idMatch = source.match(/#([A-Za-z0-9_-]+)/);
  if (idMatch && element.attrs.id !== idMatch[1]) {
    return false;
  }
  const classMatch = source.match(/\.([A-Za-z0-9_-]+)/);
  if (classMatch && !String(element.attrs.class || '').split(/\s+/).includes(classMatch[1])) {
    return false;
  }
  const attrMatch = source.match(/\[([A-Za-z0-9_.:-]+)(?:=(["']?)(.*?)\2)?\]/);
  if (attrMatch) {
    const actual = element.attrs[attrMatch[1]];
    if (actual == null || (attrMatch[3] != null && String(actual) !== attrMatch[3])) {
      return false;
    }
  }
  const tagMatch = source.match(/^[A-Za-z][A-Za-z0-9:-]*/);
  return !tagMatch || element.tag === tagMatch[0].toLowerCase();
}

function parseMarkupAttributes(source) {
  const attrs = createSafePlainObject();
  const pattern = /([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = pattern.exec(String(source || ''))) !== null) {
    setSafeObjectProperty(attrs, match[1], match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function createXml2jsPackage() {
  function Parser(options = {}) {
    return createXml2jsParser(options);
  }
  function Builder(options = {}) {
    return createXml2jsBuilder(options);
  }
  return {
    Parser,
    Builder,
    parseString: xml2jsParseString,
    parseStringPromise: (xml, options = {}) => sandboxThenable(Promise.resolve(parseXmlToObject(xml, options)))
  };
}

function createXml2jsParser(options = {}) {
  return hardenSandboxValue({
    parseString(xml, callback) {
      return xml2jsParseString(xml, options, callback);
    },
    parseStringPromise(xml) {
      return sandboxThenable(Promise.resolve(parseXmlToObject(xml, options)));
    }
  });
}

function createXml2jsBuilder(options = {}) {
  return hardenSandboxValue({
    buildObject(value) {
      return buildXmlFromObject(value, options);
    }
  });
}

function xml2jsParseString(xml, options, callback) {
  let parseOptions = options;
  let done = callback;
  if (typeof options === 'function') {
    done = options;
    parseOptions = {};
  }
  try {
    const result = parseXmlToObject(xml, parseOptions || {});
    if (typeof done === 'function') {
      done(null, result);
    }
    return result;
  } catch (error) {
    if (typeof done === 'function') {
      done(error);
      return undefined;
    }
    throw error;
  }
}

function parseXmlToObject(xml, options = {}) {
  const source = String(xml == null ? '' : xml).replace(/<\?xml[\s\S]*?\?>/g, '').trim();
  const node = parseXmlNode(source);
  if (!node) {
    throw sandboxError('xml2js could not parse XML.');
  }
  const value = xmlNodeToObject(node, options);
  if (options.explicitRoot === false) {
    return hardenSandboxValue(value);
  }
  return hardenSandboxValue({ [node.name]: value });
}

function parseXmlNode(source) {
  const match = String(source || '').match(/^<([A-Za-z_][A-Za-z0-9_.:-]*)([^>]*)>([\s\S]*)<\/\1>$/);
  if (!match) {
    return null;
  }
  const name = match[1];
  const attrs = parseMarkupAttributes(match[2]);
  const inner = match[3];
  const children = [];
  const childPattern = /<([A-Za-z_][A-Za-z0-9_.:-]*)([^>]*)>[\s\S]*?<\/\1>/g;
  let childMatch;
  while ((childMatch = childPattern.exec(inner)) !== null && children.length < 1000) {
    const child = parseXmlNode(childMatch[0]);
    if (child) {
      children.push(child);
    }
  }
  const text = children.length ? inner.replace(childPattern, '').trim() : inner.trim();
  return { name, attrs, children, text };
}

function xmlNodeToObject(node, options) {
  const explicitArray = options.explicitArray !== false;
  const trim = options.trim === true;
  const output = createSafePlainObject();
  if (Object.keys(node.attrs).length && options.ignoreAttrs !== true) {
    if (options.mergeAttrs === true) {
      assignSafeObjectProperties(output, node.attrs);
    } else {
      output.$ = cloneJson(node.attrs);
    }
  }
  for (const child of node.children) {
    if (VISUALIZER_UNSAFE_PATH_PARTS.has(child.name)) {
      continue;
    }
    const value = xmlNodeToObject(child, options);
    if (output[child.name] == null) {
      setSafeObjectProperty(output, child.name, explicitArray ? [value] : value);
    } else if (Array.isArray(output[child.name])) {
      output[child.name].push(value);
    } else {
      setSafeObjectProperty(output, child.name, [output[child.name], value]);
    }
  }
  const text = trim ? node.text.trim() : node.text;
  if (text) {
    if (!node.children.length && !Object.keys(output).length) {
      return text;
    }
    output._ = text;
  }
  return output;
}

function buildXmlFromObject(value, options = {}) {
  const rootName = Object.keys(value || {})[0] || 'root';
  return buildXmlNode(rootName, value?.[rootName], options);
}

function buildXmlNode(name, value, options) {
  const attrkey = options.attrkey || '$';
  const charkey = options.charkey || '_';
  if (value == null || typeof value !== 'object') {
    return `<${name}>${escapeXml(value == null ? '' : value)}</${name}>`;
  }
  const attrs = value[attrkey] && typeof value[attrkey] === 'object'
    ? Object.entries(value[attrkey]).map(([key, item]) => ` ${key}="${escapeXml(item)}"`).join('')
    : '';
  const children = Object.entries(value)
    .filter(([key]) => key !== attrkey && key !== charkey)
    .flatMap(([key, item]) => (Array.isArray(item) ? item : [item]).map((entry) => buildXmlNode(key, entry, options)))
    .join('');
  const text = value[charkey] == null ? '' : escapeXml(value[charkey]);
  return `<${name}${attrs}>${text}${children}</${name}>`;
}

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPostmanCollectionPackage() {
  return {
    Collection: function Collection(definition = {}) { return createPostmanCollection(definition); },
    Item: function Item(definition = {}) { return createPostmanItem(definition); },
    Request: function Request(definition = {}) { return createPostmanRequest(definition); },
    Response: function Response(definition = {}) { return createPostmanResponse(definition); },
    Url: function Url(definition = '') { return createPostmanUrl(definition); },
    Header: function Header(definition = {}) { return createPostmanHeader(definition); },
    HeaderList: function HeaderList(_parent, headers = []) { return createPostmanHeaderList(headers); },
    QueryParam: function QueryParam(definition = {}) { return createPostmanQueryParam(definition); },
    QueryParamList: function QueryParamList(_parent, params = []) { return createPostmanQueryParamList(params); },
    RequestBody: function RequestBody(definition = {}) { return createPostmanRequestBody(definition); },
    FormParam: function FormParam(definition = {}) { return createPostmanFormParam(definition); },
    Variable: function Variable(definition = {}) { return createPostmanVariable(definition); },
    VariableList: function VariableList(_parent, variables = []) { return createPostmanVariableList(variables); },
    Cookie: function Cookie(definition = {}) { return createPostmanCookie(definition); },
    CookieList: function CookieList(_parent, cookies = []) { return createPostmanCookieList(cookies); },
    PropertyList: function PropertyList(_type, _parent, items = []) { return createPostmanPropertyList(items); },
    VariableScope: function VariableScope(definition = {}) { return createPostmanVariableScope(definition); }
  };
}

function createPostmanCollection(definition = {}) {
  const info = definition.info || {};
  const items = createPostmanPropertyList(definition.item || [], { itemFactory: createPostmanItem });
  return hardenSandboxValue({
    name: info.name || definition.name || '',
    items,
    toJSON() {
      return {
        info: { name: info.name || definition.name || '' },
        item: items.all().map((item) => item.toJSON())
      };
    }
  });
}

function createPostmanItem(definition = {}) {
  const request = definition.request ? createPostmanRequest(definition.request) : undefined;
  return hardenSandboxValue({
    name: definition.name || '',
    request,
    items: createPostmanPropertyList(definition.item || [], { itemFactory: createPostmanItem }),
    toJSON() {
      const output = { name: definition.name || '' };
      if (request) {
        output.request = request.toJSON();
      }
      const childItems = this.items.all();
      if (childItems.length) {
        output.item = childItems.map((item) => item.toJSON());
      }
      return output;
    }
  });
}

function createPostmanRequest(definition = {}, options = {}) {
  const mutable = options.mutable === true;
  const request = mutable
    ? normalizeMutablePostmanRequestDefinition(definition)
    : normalizePostmanRequestDefinition(definition);
  const headers = createPostmanHeaderList(request.header || request.headers || [], {
    onChange: mutable ? (items) => { request.headers = items.map(sdkPairToPostMeterPair); } : undefined
  });
  const url = createPostmanUrl(request.url || '', {
    queryParams: request.queryParams,
    onChange: mutable ? (state) => {
      request.url = state.raw;
      request.queryParams = [];
    } : undefined
  });
  const body = createPostmanRequestBody(request.postmanBody || request.bodyDefinition || request.body || '', {
    bodyType: request.bodyType,
    onChange: mutable ? (state) => syncPostmanBodyToRequest(request, state) : undefined
  });
  const metadata = createPostmanPropertyList(request.metadata || [], {
    onChange: mutable ? (items) => { request.metadata = items.map(sdkPairToPostMeterPair); } : undefined
  });
  const messages = createPostmanPropertyList(request.messages || [], {
    itemFactory: createPostmanMessage,
    toJSONItem: messageToJSON,
    onChange: mutable ? (items) => { request.messages = items.map(messageToJSON); } : undefined
  });
  const api = {
    get method() { return String(request.method || 'GET').toUpperCase(); },
    set method(value) {
      if (mutable) {
        request.method = String(value || '').toUpperCase();
      }
    },
    get url() { return url; },
    set url(value) {
      if (mutable) {
        url.update(value);
      }
    },
    headers,
    body,
    auth: createPostmanAuth(request.auth || { type: 'none' }, mutable ? (nextAuth) => { request.auth = nextAuth; } : undefined),
    metadata,
    messages,
    to: {
      have: {
        metadata(name, expectedValue) {
          assertPropertyListContains(metadata, name, expectedValue, arguments.length, 'request metadata');
        },
        message(expectedMessage) {
          const requestMessages = messages.all();
          const passed = arguments.length === 0
            ? requestMessages.length > 0
            : requestMessages.some((message) => objectIncludesSubset(messageToComparable(message), expectedMessage));
          assertCondition(passed, 'Expected request messages to include matching message.');
        }
      },
      not: {
        have: {
          metadata(name, expectedValue) {
            assertPropertyListContains(metadata, name, expectedValue, arguments.length, 'request metadata', true);
          },
          message(expectedMessage) {
            const requestMessages = messages.all();
            const passed = arguments.length === 0
              ? requestMessages.length > 0
              : requestMessages.some((message) => objectIncludesSubset(messageToComparable(message), expectedMessage));
            assertCondition(!passed, 'Expected request messages not to include matching message.');
          }
        }
      }
    },
    get methodPath() { return request.methodPath == null ? '' : String(request.methodPath); },
    set methodPath(value) {
      if (mutable) {
        request.methodPath = String(value || '');
      }
    },
    clone() {
      return createPostmanRequest(api.toJSON());
    },
    toJSON() {
      const output = {
        method: api.method,
        url: url.toJSON(),
        header: headers.toJSON(),
        body: body.toJSON()
      };
      if (request.auth) {
        output.auth = clonePlainJson(request.auth);
      }
      if (api.methodPath) {
        output.methodPath = api.methodPath;
      }
      if (metadata.count(false)) {
        output.metadata = metadata.toJSON();
      }
      if (messages.count(false)) {
        output.messages = messages.toJSON();
      }
      return hardenSandboxValue(output);
    },
    toString() {
      return url.toString();
    }
  };
  if (mutable) {
    request.headers = headers.toJSON().map(sdkPairToPostMeterPair);
  }
  return hardenSandboxValue(api);
}

function normalizePostmanRequestDefinition(definition = {}) {
  if (typeof definition === 'string') {
    return { method: 'GET', url: definition, headers: [] };
  }
  const source = definition && typeof definition.toJSON === 'function'
    ? definition.toJSON()
    : definition || {};
  return {
    ...clonePlainJson(source),
    headers: source.headers || source.header || [],
    header: source.header || source.headers || [],
    method: source.method || 'GET',
    url: source.url || ''
  };
}

function normalizeMutablePostmanRequestDefinition(definition = {}) {
  const request = definition && typeof definition === 'object' ? definition : { url: String(definition || '') };
  request.method = request.method || 'GET';
  request.url = request.url || '';
  request.headers = Array.isArray(request.headers) ? request.headers : Array.isArray(request.header) ? request.header : [];
  request.header = request.headers;
  request.queryParams = Array.isArray(request.queryParams) ? request.queryParams : [];
  request.auth = request.auth && typeof request.auth === 'object' ? request.auth : { type: 'none' };
  return request;
}

function createPostmanUrl(definition = '', options = {}) {
  const state = normalizePostmanUrlState(definition, options.queryParams);
  const sync = () => {
    state.raw = buildRawUrlFromState(state);
    if (typeof options.onChange === 'function') {
      options.onChange(state);
    }
  };
  const query = createPostmanQueryParamList(state.query, {
    onChange: (items) => {
      state.query.splice(0, state.query.length, ...items.map((item) => normalizeSdkPair(item, 'query')));
      sync();
    }
  });
  const api = {
    get raw() { return state.raw; },
    set raw(value) {
      replaceUrlState(state, normalizePostmanUrlState(value));
      query.repopulate(state.query);
    },
    get protocol() { return state.protocol; },
    set protocol(value) {
      state.protocol = String(value || '').replace(/:$/, '');
      sync();
    },
    get host() { return state.host.join('.'); },
    set host(value) {
      state.host = normalizeUrlHost(value);
      sync();
    },
    get path() { return hardenSandboxValue(state.path.slice()); },
    set path(value) {
      state.path = normalizeUrlPath(value);
      sync();
    },
    get query() { return query; },
    update(value) {
      api.raw = urlDefinitionToRaw(value);
      return api;
    },
    addQueryParams(params) {
      for (const item of Array.isArray(params) ? params : [params]) {
        query.add(item);
      }
      return api;
    },
    getHost() {
      return state.host.join('.');
    },
    getPath() {
      return state.path.length ? `/${state.path.join('/')}` : '';
    },
    getQueryString() {
      return serializeQueryPairs(state.query);
    },
    clone() {
      return createPostmanUrl(api.toJSON());
    },
    toJSON() {
      return hardenSandboxValue({
        raw: state.raw,
        protocol: state.protocol,
        host: state.host.slice(),
        path: state.path.slice(),
        query: query.toJSON()
      });
    },
    toString() {
      return state.raw;
    }
  };
  return hardenSandboxValue(api);
}

function normalizePostmanUrlState(definition = '', queryParams = []) {
  const raw = urlDefinitionToRaw(definition);
  const split = splitRawUrl(raw);
  const parsed = parseAbsoluteOrRelativeUrl(raw);
  const host = parsed?.hostname ? parsed.hostname.split('.').filter(Boolean) : normalizeUrlHost(definition?.host);
  const path = parsed?.pathname ? parsed.pathname.split('/').filter(Boolean).map(decodeQueryComponent) : normalizeUrlPath(definition?.path);
  const protocol = parsed?.protocol ? parsed.protocol.replace(/:$/, '') : String(definition?.protocol || '').replace(/:$/, '');
  const query = [
    ...parseQueryPairs(split.query),
    ...normalizeSdkPairArray(queryParams, 'query')
  ];
  return {
    base: split.base,
    hash: split.hash,
    host,
    path,
    protocol,
    query,
    raw
  };
}

function replaceUrlState(target, next) {
  target.base = next.base;
  target.hash = next.hash;
  target.host = next.host;
  target.path = next.path;
  target.protocol = next.protocol;
  target.query.splice(0, target.query.length, ...next.query);
  target.raw = next.raw;
}

function urlDefinitionToRaw(definition = '') {
  if (typeof definition === 'string') {
    return definition;
  }
  if (definition && typeof definition.toString === 'function' && typeof definition !== 'object') {
    return String(definition);
  }
  if (definition && typeof definition.raw === 'string') {
    return definition.raw;
  }
  const protocol = String(definition?.protocol || '').replace(/:$/, '');
  const host = normalizeUrlHost(definition?.host).join('.');
  const path = normalizeUrlPath(definition?.path).join('/');
  const query = serializeQueryPairs(normalizeSdkPairArray(definition?.query || [], 'query'));
  const base = `${protocol ? `${protocol}://` : ''}${host}${path ? `/${path}` : ''}`;
  return `${base}${query ? `?${query}` : ''}`;
}

function parseAbsoluteOrRelativeUrl(raw) {
  try {
    return new URL(String(raw || ''));
  } catch {
    try {
      return new URL(String(raw || ''), 'http://postmeter.invalid');
    } catch {
      return null;
    }
  }
}

function splitRawUrl(raw) {
  const text = String(raw || '');
  const hashIndex = text.indexOf('#');
  const beforeHash = hashIndex >= 0 ? text.slice(0, hashIndex) : text;
  const hash = hashIndex >= 0 ? text.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  return {
    base: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
    hash,
    query: queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : ''
  };
}

function buildRawUrlFromState(state) {
  const base = state.protocol && state.host.length
    ? `${state.protocol}://${state.host.join('.')}${state.path.length ? `/${state.path.map(encodePathPart).join('/')}` : ''}`
    : state.base;
  const query = serializeQueryPairs(state.query);
  return `${base}${query ? `?${query}` : ''}${state.hash || ''}`;
}

function normalizeUrlHost(value) {
  if (Array.isArray(value)) {
    return value.map((part) => String(part || '')).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split('.').map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function normalizeUrlPath(value) {
  if (Array.isArray(value)) {
    return value.map((part) => String(part || '').replace(/^\/+|\/+$/g, '')).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split('/').map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function encodePathPart(value) {
  return encodeURIComponent(String(value || '')).replace(/%2F/gi, '/');
}

function parseQueryPairs(queryString = '') {
  const text = String(queryString || '').replace(/^\?/, '');
  if (!text) {
    return [];
  }
  return text.split('&').filter((part) => part !== '').map((part) => {
    const equalsIndex = part.indexOf('=');
    const key = equalsIndex >= 0 ? part.slice(0, equalsIndex) : part;
    const value = equalsIndex >= 0 ? part.slice(equalsIndex + 1) : '';
    return normalizeSdkPair({
      key: decodeQueryComponent(key),
      value: decodeQueryComponent(value)
    }, 'query');
  });
}

function serializeQueryPairs(pairs = []) {
  return (pairs || [])
    .filter((pair) => pair && pair.disabled !== true && pair.key)
    .map((pair) => `${encodeURIComponent(String(pair.key))}=${encodeURIComponent(String(pair.value ?? ''))}`)
    .join('&');
}

function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch {
    return String(value || '');
  }
}

function createPostmanHeader(definition = {}) {
  return createSdkPairItem(normalizeSdkPair(definition, 'header'), { caseInsensitive: true, stringSeparator: ': ' });
}

function createPostmanHeaderList(headers = [], options = {}) {
  return createSdkPropertyList(headersFromAny(headers), {
    caseInsensitive: true,
    itemKind: 'header',
    normalizeItem: (item) => normalizeSdkPair(item, 'header'),
    onChange: options.onChange,
    stringifier: (items) => items.filter((item) => item.disabled !== true).map((item) => `${item.key}: ${item.value ?? ''}`).join('\n')
  });
}

function createPostmanQueryParam(definition = {}) {
  return createSdkPairItem(normalizeSdkPair(definition, 'query'));
}

function createPostmanQueryParamList(params = [], options = {}) {
  return createSdkPropertyList(params, {
    itemKind: 'query',
    normalizeItem: (item) => normalizeSdkPair(item, 'query'),
    onChange: options.onChange,
    stringifier: serializeQueryPairs
  });
}

function createPostmanFormParam(definition = {}) {
  return createSdkPairItem(normalizeSdkPair(definition, 'form'), { includeFormFields: true });
}

function createPostmanFormParamList(params = [], options = {}) {
  return createSdkPropertyList(params, {
    itemKind: 'form',
    normalizeItem: (item) => normalizeSdkPair(item, 'form'),
    onChange: options.onChange,
    stringifier: (items) => items.filter((item) => item.disabled !== true).map((item) => `${item.key}=${item.value ?? item.src ?? ''}`).join('&')
  });
}

function createPostmanVariable(definition = {}) {
  return createSdkPairItem(normalizeSdkPair(definition, 'variable'), { includeType: true });
}

function createPostmanVariableList(variables = [], options = {}) {
  return createSdkPropertyList(variables, {
    itemKind: 'variable',
    normalizeItem: (item) => normalizeSdkPair(item, 'variable'),
    onChange: options.onChange
  });
}

function createPostmanCookie(definition = {}) {
  return createSdkCookieItem(normalizeSdkCookie(definition));
}

function createPostmanCookieList(cookies = [], options = {}) {
  return createSdkPropertyList(cookies, {
    itemKind: 'cookie',
    normalizeItem: normalizeSdkCookie,
    itemFactory: (item, onChange) => createSdkCookieItem(item, onChange),
    onChange: options.onChange,
    stringifier: (items) => items.filter((item) => item.disabled !== true).map(cookieToHeaderValue).join('; ')
  });
}

function createPostmanPropertyList(items = [], options = {}) {
  return createSdkPropertyList(items, {
    itemKind: 'property',
    normalizeItem: options.itemFactory ? undefined : (item) => normalizeSdkPair(item, 'property'),
    itemFactory: options.itemFactory,
    onChange: options.onChange,
    toJSONItem: options.toJSONItem
  });
}

function createSdkPropertyList(items = [], options = {}) {
  const state = {
    items: normalizeSdkListInput(items).map((item) => normalizeSdkListItem(item, options)),
    options
  };
  const notify = () => {
    if (typeof options.onChange === 'function') {
      options.onChange(state.items);
    }
  };
  const itemFor = (item) => {
    if (typeof options.itemFactory === 'function') {
      return options.itemFactory(item, notify);
    }
    return createSdkPairItem(item, itemOptionsForKind(options.itemKind), notify);
  };
  const enabledItems = (excludeDisabled = true) => state.items.filter((item) => excludeDisabled !== true || item.disabled !== true);
  const findIndex = (key) => {
    const target = String(key || '');
    const normalizedTarget = options.caseInsensitive === true ? target.toLowerCase() : target;
    return state.items.findIndex((item) => {
      const value = String(item.key || item.name || '');
      return (options.caseInsensitive === true ? value.toLowerCase() : value) === normalizedTarget;
    });
  };
  const addAt = (item, index) => {
    const normalized = normalizeSdkListItem(item, options);
    if (!normalized.key && !normalized.name && options.itemKind !== 'property') {
      return api;
    }
    if (Number.isInteger(index)) {
      state.items.splice(Math.max(0, Math.min(state.items.length, index)), 0, normalized);
    } else {
      state.items.push(normalized);
    }
    notify();
    return api;
  };
  const api = {
    add(item) { return addAt(item); },
    append(item) { return addAt(item); },
    prepend(item) { return addAt(item, 0); },
    insert(item, before) {
      const index = typeof before === 'number' ? before : findIndex(before);
      return addAt(item, index >= 0 ? index : undefined);
    },
    insertAfter(item, after) {
      const index = typeof after === 'number' ? after : findIndex(after);
      return addAt(item, index >= 0 ? index + 1 : undefined);
    },
    upsert(item) {
      const normalized = normalizeSdkListItem(item, options);
      const key = normalized.key || normalized.name;
      if (!key) {
        return api;
      }
      const index = findIndex(key);
      if (index >= 0) {
        state.items[index] = { ...state.items[index], ...normalized };
      } else {
        state.items.push(normalized);
      }
      notify();
      return api;
    },
    remove(predicate, context) {
      const before = state.items.length;
      if (typeof predicate === 'function') {
        state.items = state.items.filter((item, index) => !Reflect.apply(predicate, context || api, [itemFor(item), index, api]));
      } else {
        const index = findIndex(predicate);
        if (index >= 0) {
          state.items.splice(index, 1);
        }
      }
      if (state.items.length !== before) {
        notify();
      }
      return api;
    },
    clear() {
      if (state.items.length) {
        state.items = [];
        notify();
      }
      return api;
    },
    repopulate(nextItems = []) {
      state.items = normalizeSdkListInput(nextItems).map((item) => normalizeSdkListItem(item, options));
      notify();
      return api;
    },
    populate(nextItems = []) {
      for (const item of normalizeSdkListInput(nextItems)) {
        addAt(item);
      }
      return api;
    },
    get(key) {
      const index = findIndex(key);
      if (index < 0 || state.items[index].disabled === true) {
        return undefined;
      }
      return state.items[index].value == null ? '' : String(state.items[index].value);
    },
    one(key) {
      const index = findIndex(key);
      return index >= 0 && state.items[index].disabled !== true ? itemFor(state.items[index]) : undefined;
    },
    has(key) {
      return api.get(key) != null;
    },
    idx(index) {
      const item = enabledItems(true)[Number(index)];
      return item ? itemFor(item) : undefined;
    },
    indexOf(item) {
      if (typeof item === 'string') {
        return findIndex(item);
      }
      const normalized = options.normalizeItem ? options.normalizeItem(item) : normalizeSdkPair(item, options.itemKind);
      return findIndex(normalized.key || normalized.name);
    },
    all(excludeDisabled = true) {
      return hardenSandboxValue(enabledItems(excludeDisabled !== false).map(itemFor));
    },
    count(excludeDisabled = true) {
      return enabledItems(excludeDisabled !== false).length;
    },
    each(callback, context) {
      if (typeof callback !== 'function') {
        return api;
      }
      enabledItems(true).forEach((item, index) => Reflect.apply(callback, context || api, [itemFor(item), index, api]));
      return api;
    },
    map(callback, context) {
      if (typeof callback !== 'function') {
        return hardenSandboxValue([]);
      }
      return hardenSandboxValue(enabledItems(true).map((item, index) => Reflect.apply(callback, context || api, [itemFor(item), index, api])));
    },
    filter(callback, context) {
      if (typeof callback !== 'function' && (!callback || typeof callback !== 'object')) {
        return hardenSandboxValue([]);
      }
      return hardenSandboxValue(enabledItems(true)
        .filter((item, index) => sdkListPredicateMatches(callback, itemFor(item), index, api, context))
        .map(itemFor));
    },
    find(callback, context) {
      if (typeof callback !== 'function' && (!callback || typeof callback !== 'object')) {
        return undefined;
      }
      const item = enabledItems(true).find((entry, index) => sdkListPredicateMatches(callback, itemFor(entry), index, api, context));
      return item ? itemFor(item) : undefined;
    },
    reduce(callback, initialValue, context) {
      if (typeof callback !== 'function') {
        return initialValue;
      }
      let accumulator = initialValue;
      enabledItems(true).forEach((item, index) => {
        accumulator = Reflect.apply(callback, context || api, [accumulator, itemFor(item), index, api]);
      });
      return accumulator;
    },
    toObject(excludeDisabled = true, _caseSensitive = false, multiValue = false, sanitizeKeys = true) {
      const output = createSafePlainObject();
      for (const item of enabledItems(excludeDisabled !== false)) {
        const key = item.key || item.name;
        if (!key || (sanitizeKeys !== false && VISUALIZER_UNSAFE_PATH_PARTS.has(String(key)))) {
          continue;
        }
        const value = item.value == null ? '' : String(item.value);
        if (multiValue === true) {
          const existing = output[key];
          if (Array.isArray(existing)) {
            existing.push(value);
          } else if (existing != null) {
            output[key] = [existing, value];
          } else {
            output[key] = [value];
          }
        } else {
          setSafeObjectProperty(output, key, value);
        }
      }
      return hardenSandboxValue(output);
    },
    toJSON() {
      const mapper = typeof options.toJSONItem === 'function'
        ? options.toJSONItem
        : (item) => sdkItemToJson(item, options.itemKind);
      return hardenSandboxValue(state.items.map((item) => mapper(item)));
    },
    toString() {
      if (typeof options.stringifier === 'function') {
        return options.stringifier(state.items);
      }
      return enabledItems(true).map((item) => `${item.key || item.name || ''}=${item.value ?? ''}`).join('&');
    },
    clone() {
      return createSdkPropertyList(api.toJSON(), options);
    },
    valueOf() {
      return api.all();
    },
    to: createListAssertionChain(() => api.all(), options.itemKind || 'list')
  };
  return hardenSandboxValue(api);
}

function sdkListPredicateMatches(predicate, item, index, api, context) {
  if (typeof predicate === 'function') {
    return Boolean(Reflect.apply(predicate, context || api, [item, index, api]));
  }
  return objectIncludesSubset(itemToComparable(item), predicate);
}

function createListAssertionChain(itemsProvider, label = 'list') {
  const include = (expected, negate = false) => {
    const items = itemsProvider();
    const passed = items.some((item) => objectIncludesSubset(itemToComparable(item), expected));
    assertCondition(negate ? !passed : passed, `Expected ${label} ${negate ? 'not ' : ''}to include ${safeJsonStringify(expected)}.`);
  };
  const property = (path, expectedValue, argCount, negate = false) => {
    const items = itemsProvider();
    const passed = items.some((item) => {
      const value = readJsonPathForScript(itemToComparable(item), path);
      if (argCount <= 1) {
        return value !== undefined;
      }
      return deepEqual(value, expectedValue);
    });
    assertCondition(negate ? !passed : passed, `Expected ${label} ${negate ? 'not ' : ''}to have property ${path}.`);
  };
  const jsonSchema = (schema, options = {}, negate = false) => {
    const items = itemsProvider().map(itemToComparable);
    assertCondition(items.length > 0, `Expected ${label} to have items for jsonSchema validation.`);
    const allValid = items.every((item) => validateJsonSchema(schema, item, '', options).valid);
    assertCondition(negate ? !allValid : allValid, `Expected ${label} ${negate ? 'not ' : ''}to match JSON schema.`);
  };
  const have = {
    property(path, expectedValue) {
      property(path, expectedValue, arguments.length, false);
    },
    jsonSchema(schema, options = {}) {
      jsonSchema(schema, options, false);
    }
  };
  const notHave = {
    property(path, expectedValue) {
      property(path, expectedValue, arguments.length, true);
    },
    jsonSchema(schema, options = {}) {
      jsonSchema(schema, options, true);
    }
  };
  return {
    include(expected) {
      include(expected, false);
    },
    have,
    not: {
      include(expected) {
        include(expected, true);
      },
      have: notHave
    }
  };
}

function itemToComparable(item) {
  if (item && typeof item.toJSON === 'function') {
    return clonePlainJson(item.toJSON());
  }
  return clonePlainJson(item);
}

function messageToComparable(message) {
  const json = itemToComparable(message);
  if (json.timestamp instanceof Date || Object.prototype.toString.call(json.timestamp) === '[object Date]') {
    json.timestamp = normalizeMessageTimestamp(json.timestamp);
  }
  return json;
}

function objectIncludesSubset(actual, expected) {
  if (expected == null || typeof expected !== 'object') {
    return deepEqual(actual, expected);
  }
  const comparable = itemToComparable(actual);
  return Object.entries(expected).every(([key, value]) => {
    if (VISUALIZER_UNSAFE_PATH_PARTS.has(String(key))) {
      return false;
    }
    const actualValue = readJsonPathForScript(comparable, key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return objectIncludesSubset(actualValue, value);
    }
    return deepEqual(actualValue, value);
  });
}

function assertPropertyListContains(list, name, expectedValue, argCount, label, negate = false) {
  const key = String(name || '');
  const value = list?.get?.(key);
  const exists = value != null;
  const matches = argCount <= 1 || String(value) === String(expectedValue);
  assertCondition(
    negate ? !(exists && matches) : exists && matches,
    negate
      ? `Expected ${label} ${key} not to match.`
      : exists
        ? `Expected ${label} ${key} to equal ${expectedValue} but received ${value}.`
        : `Expected ${label} ${key}.`
  );
}

function normalizeSdkListItem(item, options = {}) {
  if (typeof options.normalizeItem === 'function') {
    return options.normalizeItem(item);
  }
  if (typeof options.itemFactory === 'function') {
    return item;
  }
  return normalizeSdkPair(item, options.itemKind);
}

function normalizeSdkListInput(items = []) {
  if (!items) {
    return [];
  }
  if (Array.isArray(items)) {
    return items;
  }
  if (typeof items.all === 'function') {
    return items.all(false);
  }
  if (typeof items.toJSON === 'function') {
    const json = items.toJSON();
    return Array.isArray(json) ? json : [];
  }
  if (typeof items === 'object') {
    return Object.entries(items).map(([key, value]) => ({ key, value }));
  }
  return [];
}

function normalizeSdkPairArray(items = [], kind = 'property') {
  return normalizeSdkListInput(items).map((item) => normalizeSdkPair(item, kind));
}

function normalizeSdkPair(input = {}, kind = 'property') {
  let source = input;
  if (source && typeof source.toJSON === 'function') {
    source = source.toJSON();
  }
  if (typeof source === 'string') {
    if (kind === 'header' && source.includes(':')) {
      const [key, ...rest] = source.split(':');
      source = { key, value: rest.join(':').trim() };
    } else {
      source = { key: source, value: '' };
    }
  }
  source = source && typeof source === 'object' ? source : {};
  const key = source.key ?? source.name ?? '';
  const output = {
    key: String(key || ''),
    value: source.value == null ? '' : String(source.value),
    disabled: source.disabled === true || source.enabled === false
  };
  if (source.description != null) {
    output.description = String(source.description);
  }
  if (kind === 'variable') {
    output.type = source.type == null ? 'any' : String(source.type);
  }
  if (kind === 'form') {
    output.type = source.type == null ? 'text' : String(source.type);
    if (source.src != null) {
      output.src = Array.isArray(source.src) ? source.src.map((item) => String(item || '')) : String(source.src);
    }
    if (source.contentType != null) {
      output.contentType = String(source.contentType);
    }
  }
  return output;
}

function createSdkPairItem(backing, options = {}, onChange = () => {}) {
  const api = {
    get key() { return backing.key || ''; },
    set key(value) { backing.key = String(value || ''); onChange(); },
    get name() { return backing.key || ''; },
    set name(value) { backing.key = String(value || ''); onChange(); },
    get value() { return backing.value == null ? '' : String(backing.value); },
    set value(value) { backing.value = value == null ? '' : String(value); onChange(); },
    get disabled() { return backing.disabled === true; },
    set disabled(value) { backing.disabled = value === true; onChange(); },
    get enabled() { return backing.disabled !== true; },
    set enabled(value) { backing.disabled = value === false; onChange(); },
    get description() { return backing.description || ''; },
    set description(value) { backing.description = value == null ? '' : String(value); onChange(); },
    clone() {
      return createSdkPairItem(clonePlainJson(sdkItemToJson(backing, options.kind || 'property')), options);
    },
    toJSON() {
      return hardenSandboxValue(sdkItemToJson(backing, options.kind || 'property'));
    },
    toString() {
      const separator = options.stringSeparator || '=';
      return `${backing.key || ''}${separator}${backing.value ?? ''}`;
    },
    valueOf() {
      return backing.value == null ? '' : String(backing.value);
    }
  };
  if (options.includeType === true || options.includeFormFields === true) {
    Object.defineProperty(api, 'type', {
      configurable: true,
      enumerable: true,
      get() { return backing.type || (options.includeFormFields ? 'text' : 'any'); },
      set(value) { backing.type = String(value || (options.includeFormFields ? 'text' : 'any')); onChange(); }
    });
  }
  if (options.includeFormFields === true) {
    Object.defineProperties(api, {
      src: {
        configurable: true,
        enumerable: true,
        get() { return Array.isArray(backing.src) ? hardenSandboxValue(backing.src.slice()) : backing.src || ''; },
        set(value) { backing.src = Array.isArray(value) ? value.map((item) => String(item || '')) : String(value || ''); onChange(); }
      },
      contentType: {
        configurable: true,
        enumerable: true,
        get() { return backing.contentType || ''; },
        set(value) { backing.contentType = String(value || ''); onChange(); }
      }
    });
  }
  return hardenSandboxValue(api);
}

function itemOptionsForKind(kind) {
  return {
    kind,
    caseInsensitive: kind === 'header',
    includeFormFields: kind === 'form',
    includeType: kind === 'variable',
    stringSeparator: kind === 'header' ? ': ' : '='
  };
}

function sdkItemToJson(item = {}, kind = 'property') {
  if (item && typeof item.toJSON === 'function') {
    return clonePlainJson(item.toJSON());
  }
  const output = createSafePlainObject();
  const keyName = kind === 'cookie' ? 'name' : 'key';
  const key = item.key ?? item.name ?? '';
  if (key) {
    output[keyName] = String(key);
  }
  if (item.value != null) {
    output.value = String(item.value);
  }
  if (item.disabled === true) {
    output.disabled = true;
  }
  if (item.description != null) {
    output.description = String(item.description);
  }
  for (const extra of ['type', 'src', 'contentType', 'domain', 'path', 'expires', 'expiresAt', 'httpOnly', 'secure', 'sameSite', 'hostOnly', 'session', 'maxAge', 'data', 'timestamp']) {
    if (item[extra] != null) {
      output[extra] = Array.isArray(item[extra]) ? item[extra].slice() : item[extra];
    }
  }
  return output;
}

function sdkPairToPostMeterPair(item) {
  return {
    enabled: item.disabled !== true,
    key: String(item.key || item.name || ''),
    value: item.value == null ? '' : String(item.value)
  };
}

function headersFromAny(headers) {
  if (!headers) {
    return [];
  }
  if (Array.isArray(headers)) {
    return headers;
  }
  if (headers && typeof headers.all === 'function') {
    return headers.all(false);
  }
  if (typeof headers === 'object') {
    return Object.entries(headers).map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(', ') : String(value ?? '')
    }));
  }
  return [];
}

function normalizeSdkCookie(input = {}) {
  let source = input;
  if (source && typeof source.toJSON === 'function') {
    source = source.toJSON();
  }
  if (typeof source === 'string') {
    const [nameValue, ...attributes] = source.split(';').map((part) => part.trim());
    const [name, ...valueParts] = nameValue.split('=');
    source = { name, value: valueParts.join('=') };
    for (const attribute of attributes) {
      const [rawKey, ...rawValue] = attribute.split('=');
      const key = rawKey.toLowerCase();
      const value = rawValue.join('=');
      if (key === 'domain') { source.domain = value; }
      if (key === 'path') { source.path = value; }
      if (key === 'expires') { source.expires = value; }
      if (key === 'max-age') { source.maxAge = value; }
      if (key === 'httponly') { source.httpOnly = true; }
      if (key === 'secure') { source.secure = true; }
      if (key === 'samesite') { source.sameSite = value; }
    }
  }
  source = source && typeof source === 'object' ? source : {};
  return {
    name: String(source.name || source.key || ''),
    key: String(source.name || source.key || ''),
    value: source.value == null ? '' : String(source.value),
    domain: source.domain == null ? '' : String(source.domain),
    path: source.path == null ? '' : String(source.path),
    expires: source.expiresAt == null ? source.expires == null ? '' : String(source.expires) : String(source.expiresAt),
    httpOnly: source.httpOnly === true,
    secure: source.secure === true,
    sameSite: source.sameSite == null ? '' : String(source.sameSite),
    hostOnly: source.hostOnly === true,
    session: source.session === true,
    disabled: source.disabled === true || source.enabled === false
  };
}

function createSdkCookieItem(backing, onChange = () => {}) {
  const api = {
    get name() { return backing.name || backing.key || ''; },
    set name(value) { backing.name = String(value || ''); backing.key = backing.name; onChange(); },
    get key() { return backing.name || backing.key || ''; },
    set key(value) { backing.name = String(value || ''); backing.key = backing.name; onChange(); },
    get value() { return backing.value == null ? '' : String(backing.value); },
    set value(value) { backing.value = value == null ? '' : String(value); onChange(); },
    get domain() { return backing.domain || ''; },
    set domain(value) { backing.domain = String(value || ''); onChange(); },
    get path() { return backing.path || ''; },
    set path(value) { backing.path = String(value || ''); onChange(); },
    get expires() { return backing.expires || ''; },
    set expires(value) { backing.expires = String(value || ''); onChange(); },
    get httpOnly() { return backing.httpOnly === true; },
    set httpOnly(value) { backing.httpOnly = value === true; onChange(); },
    get secure() { return backing.secure === true; },
    set secure(value) { backing.secure = value === true; onChange(); },
    get sameSite() { return backing.sameSite || ''; },
    set sameSite(value) { backing.sameSite = String(value || ''); onChange(); },
    get disabled() { return backing.disabled === true; },
    set disabled(value) { backing.disabled = value === true; onChange(); },
    clone() { return createSdkCookieItem(clonePlainJson(api.toJSON())); },
    toJSON() { return hardenSandboxValue(sdkItemToJson(backing, 'cookie')); },
    toString() { return cookieToHeaderValue(backing); },
    valueOf() { return backing.value == null ? '' : String(backing.value); }
  };
  return hardenSandboxValue(api);
}

function cookieToHeaderValue(cookie = {}) {
  const name = cookie.name || cookie.key || '';
  return name ? `${name}=${cookie.value ?? ''}` : '';
}

function createPostmanRequestBody(definition = {}, options = {}) {
  const state = normalizeRequestBodyState(definition, options.bodyType);
  const sync = () => {
    if (typeof options.onChange === 'function') {
      options.onChange(state);
    }
  };
  const urlencoded = createPostmanQueryParamList(state.urlencoded, {
    onChange: (items) => {
      state.urlencoded.splice(0, state.urlencoded.length, ...items.map((item) => normalizeSdkPair(item, 'query')));
      sync();
    }
  });
  const formdata = createPostmanFormParamList(state.formdata, {
    onChange: (items) => {
      state.formdata.splice(0, state.formdata.length, ...items.map((item) => normalizeSdkPair(item, 'form')));
      sync();
    }
  });
  const api = {
    get mode() { return state.mode; },
    set mode(value) { state.mode = normalizeRequestBodyMode(value); sync(); },
    get raw() { return state.raw; },
    set raw(value) { state.raw = value == null ? '' : String(value); state.mode = 'raw'; sync(); },
    urlencoded,
    formdata,
    get file() { return hardenSandboxValue(clonePlainJson(state.file || {})); },
    set file(value) { state.file = normalizeFileBody(value); state.mode = 'file'; sync(); },
    get binary() { return hardenSandboxValue(clonePlainJson(state.binary || {})); },
    set binary(value) { state.binary = normalizeFileBody(value); state.mode = 'binary'; sync(); },
    get graphql() { return hardenSandboxValue(clonePlainJson(state.graphql || {})); },
    set graphql(value) { state.graphql = normalizeGraphqlBody(value); state.mode = 'graphql'; sync(); },
    get options() { return hardenSandboxValue(clonePlainJson(state.options || {})); },
    set options(value) { state.options = clonePlainJson(value || {}); sync(); },
    get disabled() { return state.disabled === true; },
    set disabled(value) { state.disabled = value === true; sync(); },
    update(value) {
      const next = normalizeRequestBodyState(value);
      replaceRequestBodyState(state, next);
      urlencoded.repopulate(state.urlencoded);
      formdata.repopulate(state.formdata);
      sync();
      return api;
    },
    isEmpty() {
      return requestBodyToString(state) === '';
    },
    clone() {
      return createPostmanRequestBody(api.toJSON());
    },
    toJSON() {
      return hardenSandboxValue(requestBodyStateToJSON(state));
    },
    toString() {
      return requestBodyToString(state);
    }
  };
  return hardenSandboxValue(api);
}

function normalizeRequestBodyState(definition = {}, postMeterBodyType = '') {
  let source = definition;
  if (source && typeof source.toJSON === 'function') {
    source = source.toJSON();
  }
  if (typeof source === 'string') {
    const hasPostMeterBody = postMeterBodyType && String(postMeterBodyType).toUpperCase() !== 'NONE';
    source = {
      mode: source || hasPostMeterBody ? 'raw' : 'none',
      raw: source
    };
  }
  source = source && typeof source === 'object' ? source : {};
  const mode = normalizeRequestBodyMode(source.mode || (source.raw != null ? 'raw' : 'none'));
  return {
    disabled: source.disabled === true,
    binary: normalizeFileBody(source.binary),
    file: normalizeFileBody(source.file),
    formdata: normalizeSdkPairArray(source.formdata || [], 'form'),
    graphql: normalizeGraphqlBody(source.graphql),
    mode,
    options: clonePlainJson(source.options || {}),
    raw: source.raw == null ? '' : String(source.raw),
    urlencoded: typeof source.urlencoded === 'string'
      ? parseQueryPairs(source.urlencoded)
      : normalizeSdkPairArray(source.urlencoded || [], 'query')
  };
}

function replaceRequestBodyState(target, next) {
  target.disabled = next.disabled;
  target.binary = next.binary;
  target.file = next.file;
  target.formdata.splice(0, target.formdata.length, ...next.formdata);
  target.graphql = next.graphql;
  target.mode = next.mode;
  target.options = next.options;
  target.raw = next.raw;
  target.urlencoded.splice(0, target.urlencoded.length, ...next.urlencoded);
}

function normalizeRequestBodyMode(value) {
  const mode = String(value || 'none').toLowerCase();
  return ['binary', 'file', 'formdata', 'graphql', 'none', 'raw', 'urlencoded'].includes(mode) ? mode : 'raw';
}

function normalizeFileBody(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    return { src: value };
  }
  return clonePlainJson(value);
}

function normalizeGraphqlBody(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return {
    query: value.query == null ? '' : String(value.query),
    operationName: value.operationName == null ? '' : String(value.operationName),
    variables: value.variables == null ? '' : typeof value.variables === 'string' ? value.variables : safeJsonStringify(value.variables)
  };
}

function requestBodyStateToJSON(state) {
  const output = createSafePlainObject();
  output.mode = state.mode;
  if (state.disabled === true) {
    output.disabled = true;
  }
  if (state.mode === 'raw') {
    output.raw = state.raw || '';
  }
  if (state.mode === 'urlencoded') {
    output.urlencoded = state.urlencoded.map((item) => sdkItemToJson(item, 'query'));
  }
  if (state.mode === 'formdata') {
    output.formdata = state.formdata.map((item) => sdkItemToJson(item, 'form'));
  }
  if (state.mode === 'graphql') {
    output.graphql = clonePlainJson(state.graphql || {});
  }
  if (state.mode === 'file') {
    output.file = clonePlainJson(state.file || {});
  }
  if (state.mode === 'binary') {
    output.binary = clonePlainJson(state.binary || {});
  }
  if (Object.keys(state.options || {}).length) {
    output.options = clonePlainJson(state.options);
  }
  return output;
}

function requestBodyToString(state) {
  if (state.disabled === true || state.mode === 'none') {
    return '';
  }
  if (state.mode === 'raw') {
    return state.raw || '';
  }
  if (state.mode === 'urlencoded') {
    return serializeQueryPairs(state.urlencoded);
  }
  if (state.mode === 'graphql') {
    return safeJsonStringify(state.graphql || {});
  }
  return '';
}

function syncPostmanBodyToRequest(request, stateOrJson) {
  const state = stateOrJson?.mode ? normalizeRequestBodyState(stateOrJson) : stateOrJson;
  const mode = state?.mode || 'none';
  request.postmanBody = requestBodyStateToJSON(state || normalizeRequestBodyState());
  if (!state || state.disabled === true || mode === 'none') {
    request.bodyType = 'NONE';
    request.body = '';
    return;
  }
  if (mode === 'raw') {
    request.body = state.raw || '';
    request.bodyType = looksLikeJsonText(request.body) ? 'RAW_JSON' : 'RAW_TEXT';
    return;
  }
  if (mode === 'graphql') {
    request.body = requestBodyToString(state);
    request.bodyType = 'RAW_JSON';
    return;
  }
  request.body = requestBodyToString(state);
  request.bodyType = request.body ? 'RAW_TEXT' : 'NONE';
}

function looksLikeJsonText(value) {
  const text = String(value || '').trim();
  if (!text || !/^[\[{]/.test(text)) {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function createPostmanAuth(auth = {}, onChange) {
  let state = clonePlainJson(auth || { type: 'none' });
  const api = {
    get type() { return state.type || 'none'; },
    set type(value) { state.type = String(value || 'none'); notifyAuthChange(); },
    get current() { return hardenSandboxValue(clonePlainJson(state)); },
    update(value = {}) {
      state = clonePlainJson(value || { type: 'none' });
      notifyAuthChange();
      return api;
    },
    toJSON() { return hardenSandboxValue(clonePlainJson(state)); },
    clone() { return createPostmanAuth(state); }
  };
  function notifyAuthChange() {
    if (typeof onChange === 'function') {
      onChange(clonePlainJson(state));
    }
  }
  const authKeys = new Set([
    ...Object.keys(state),
    'token',
    'username',
    'password',
    'key',
    'value',
    'location',
    'grantType',
    'tokenType',
    'headerPrefix',
    'tokenName',
    'addAuthDataTo',
    'accessToken',
    'refreshToken',
    'autoRefreshToken',
    'shareToken',
    'authorizationUrl',
    'tokenUrl',
    'refreshTokenUrl',
    'redirectUri',
    'clientId',
    'clientSecret',
    'scopes',
    'state',
    'codeChallengeMethod',
    'codeVerifier',
    'authorizeUsingBrowser',
    'clientAuthentication',
    'authRequestParams',
    'tokenRequestParams',
    'refreshRequestParams',
    'realm',
    'nonce',
    'algorithm',
    'qop',
    'opaque',
    'clientNonce',
    'nonceCount',
    'authId',
    'authKey',
    'user',
    'extraData',
    'app',
    'delegation',
    'accessKey',
    'secretKey',
    'region',
    'service',
    'sessionToken',
    'consumerKey',
    'consumerSecret',
    'tokenSecret',
    'signatureMethod',
    'privateKey',
    'callback',
    'verifier',
    'timestamp',
    'version',
    'includeBodyHash',
    'addEmptyParamsToSign',
    'domain',
    'workstation',
    'certificateId',
    'privateKey',
    'secret',
    'issuer',
    'subject',
    'audience',
    'keyId',
    'expiresIn',
    'claims',
    'headerPrefix',
    'addTokenTo',
    'queryParamName'
  ]);
  for (const key of authKeys) {
    if (key === 'type' || VISUALIZER_UNSAFE_PATH_PARTS.has(key)) {
      continue;
    }
    Object.defineProperty(api, key, {
      configurable: true,
      enumerable: true,
      get() { return state[key]; },
      set(value) { state[key] = value == null ? '' : String(value); notifyAuthChange(); }
    });
  }
  return hardenSandboxValue(api);
}

function createPostmanMessage(definition = {}, onChange = () => {}, options = {}) {
  const source = definition && typeof definition.toJSON === 'function' ? definition.toJSON() : definition || {};
  const backing = {
    data: source.data == null ? '' : source.data,
    name: source.name == null ? '' : String(source.name),
    timestamp: normalizeMessageTimestamp(source.timestamp),
    type: source.type == null ? '' : String(source.type)
  };
  const sync = () => {
    if (source && typeof source === 'object') {
      source.data = backing.data;
      source.name = backing.name;
      source.timestamp = backing.timestamp;
      source.type = backing.type;
    }
    onChange();
  };
  const api = {
    get data() { return backing.data; },
    set data(value) { backing.data = value == null ? '' : value; sync(); },
    get timestamp() { return createVmDate(backing.timestamp, options.vmContext); },
    set timestamp(value) { backing.timestamp = normalizeMessageTimestamp(value); sync(); },
    get type() { return backing.type; },
    set type(value) { backing.type = value == null ? '' : String(value); sync(); },
    get name() { return backing.name; },
    set name(value) { backing.name = value == null ? '' : String(value); sync(); },
    toJSON() {
      return messageToJSON(backing);
    },
    clone() {
      return createPostmanMessage(this.toJSON());
    }
  };
  return hardenSandboxValue(api);
}

function messageToJSON(message = {}) {
  const output = {
    data: message.data == null ? '' : message.data,
    timestamp: normalizeMessageTimestamp(message.timestamp)
  };
  if (message.type) {
    output.type = String(message.type);
  }
  if (message.name) {
    output.name = String(message.name);
  }
  return output;
}

function normalizeMessageTimestamp(value) {
  if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') {
    const millis = value.getTime();
    return Number.isFinite(millis) ? new Date(millis).toISOString() : new Date(0).toISOString();
  }
  const text = value == null ? '' : String(value);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

function createVmDate(value, vmContext) {
  const iso = normalizeMessageTimestamp(value);
  if (vmContext?.packageRegistry) {
    vmContext = vmContext.packageRegistry.vmContext;
  }
  const date = vmContext?.Date && typeof vmContext.Date === 'function'
    ? new vmContext.Date(iso)
    : vmContext
      ? vm.runInContext(`new Date(${JSON.stringify(iso)})`, vmContext, { timeout: 50 })
      : new Date(iso);
  try {
    Object.defineProperty(date, 'constructor', {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false
    });
  } catch {
    // Date remains usable; constructor masking is best effort for built-ins.
  }
  return date;
}

function clonePlainJson(value) {
  if (value == null) {
    return Array.isArray(value) ? [] : {};
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function createPostmanVariableScope(definition = {}) {
  const values = new Map((definition.values || definition.variable || []).map((item) => [String(item.key || ''), item.value == null ? '' : String(item.value)]));
  const api = {
    get(key) {
      return values.get(String(key || ''));
    },
    set(key, value) {
      values.set(String(key || ''), value == null ? '' : String(value));
    },
    unset(key) {
      values.delete(String(key || ''));
    },
    has(key) {
      return values.has(String(key || ''));
    },
    toJSON() {
      return Array.from(values.entries()).map(([key, value]) => ({ key, value }));
    }
  };
  return hardenSandboxValue(api);
}

function createPmTestApi({ tests, tracker } = {}) {
  const testApi = function pmTest(name, fn) {
    const testName = String(name || 'Unnamed test');
    const record = {
      name: testName,
      passed: false,
      error: 'pm.test did not finish.',
      index: tests.length,
      skipped: false
    };
    tests.push(record);
    if (typeof fn !== 'function') {
      record.error = 'pm.test requires a callback function.';
      return testApi;
    }
    const markPassed = () => {
      record.passed = true;
      record.error = '';
    };
    const markFailed = (error) => {
      if (isSkipRequestSignal(error)) {
        markPassed();
        throw error;
      }
      record.passed = false;
      record.error = errorMessage(error);
    };
    if (tracker && typeof tracker.track === 'function') {
      try {
        const value = runTestCallback(fn);
        if (value && typeof value.then === 'function') {
          tracker.track(Promise.resolve(value).then(markPassed, markFailed));
        } else {
          markPassed();
        }
      } catch (error) {
        markFailed(error);
      }
    } else {
      try {
        const value = runTestCallback(fn);
        if (value && typeof value.then === 'function') {
          throw sandboxError('Async pm.test callbacks are not supported in this script runtime.');
        }
        markPassed();
      } catch (error) {
        markFailed(error);
      }
    }
    return testApi;
  };
  testApi.skip = function skip(name) {
    tests.push({
      name: String(name || 'Unnamed test'),
      passed: true,
      error: '',
      index: tests.length,
      skipped: true
    });
    return testApi;
  };
  testApi.index = function index() {
    return tests.length;
  };
  return hardenSandboxValue(testApi);
}

function runTestCallback(fn) {
  if (fn.length > 0) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      try {
        const value = fn(finish);
        if (value && typeof value.then === 'function') {
          value.then(() => finish(), finish);
        }
      } catch (error) {
        finish(error);
      }
    });
  }
  const value = fn();
  return value;
}

function pmVariablesApi({ collectionVariables = [], environmentVariables = [], folderVariables = [], globals = [], iterationData = [], localVariables = [] } = {}) {
  const broadToNarrow = [globals, environmentVariables, collectionVariables, folderVariables, iterationData, localVariables];
  const narrowToBroad = [localVariables, iterationData, folderVariables, collectionVariables, environmentVariables, globals];
  return hardenSandboxValue({
    get(key) {
      const variableName = String(key || '').trim();
      for (const source of narrowToBroad) {
        const value = getVariable(source, variableName);
        if (value != null) {
          return value;
        }
      }
      return resolveDynamicVariable(variableName);
    },
    set(key, value) {
      setVariable(localVariables, key, value);
    },
    unset(key) {
      unsetVariable(localVariables, key);
    },
    has(key) {
      return this.get(key) != null;
    },
    replaceIn(value) {
      return replaceVariables(value, ...broadToNarrow);
    },
    toObject() {
      return variablesToObject(...broadToNarrow);
    },
    toJSON() {
      return variablesToJson(...broadToNarrow);
    }
  });
}

function variableApi(variables, options = {}) {
  const api = {
    get(key) {
      return getVariable(variables, key);
    },
    set(key, value) {
      setVariable(variables, key, value);
    },
    unset(key) {
      unsetVariable(variables, key);
    },
    has(key) {
      return getVariable(variables, key) != null;
    },
    replaceIn(value) {
      return replaceVariables(value, variables);
    },
    toObject() {
      return variablesToObject(variables);
    },
    toJSON() {
      return variablesToJson(variables);
    },
    clear() {
      if (Array.isArray(variables)) {
        variables.splice(0, variables.length);
      }
    }
  };
  if (Object.prototype.hasOwnProperty.call(options, 'name')) {
    Object.defineProperty(api, 'name', {
      configurable: false,
      enumerable: true,
      get() {
        return options.name == null ? '' : String(options.name);
      }
    });
  }
  return hardenSandboxValue(api);
}

function readOnlyVariableApi(variables) {
  return hardenSandboxValue({
    get(key) {
      return getVariable(variables, key);
    },
    has(key) {
      return getVariable(variables, key) != null;
    },
    unset(key) {
      unsetVariable(variables, key);
    },
    toObject() {
      return variablesToObject(variables);
    },
    toJSON() {
      return variablesToJson(variables);
    }
  });
}

function variablesToObject(...scopes) {
  const object = createSafePlainObject();
  for (const source of scopes) {
    for (const variable of source || []) {
      if (variable?.enabled !== false && variable?.key) {
        setSafeObjectProperty(object, String(variable.key), variableObservableValue(variable));
      }
    }
  }
  return hardenSandboxValue(object);
}

function variablesToJson(...scopes) {
  const output = [];
  for (const source of scopes) {
    for (const variable of source || []) {
      if (!variable || !variable.key) {
        continue;
      }
      output.push(variableToScriptJson(variable));
    }
  }
  return hardenSandboxValue(output);
}

function variableToScriptJson(variable) {
  const output = createSafePlainObject();
  for (const [key, value] of Object.entries(variable || {})) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      continue;
    }
    setSafeObjectProperty(output, key, safeStructuredClone(value));
  }
  if (!Object.hasOwn(output, 'value')) {
    output.value = variableObservableValue(variable);
  }
  if (!Object.hasOwn(output, 'enabled')) {
    output.enabled = variable.enabled !== false;
  }
  return output;
}

function executionApi({ canSkipRequest = true, collectionVariables = [], environmentVariables = [], execution = {}, globals = [], location = {}, tests = [], tracker } = {}) {
  let runRequestCalls = 0;
  const api = {
    runRequest(target, options) {
      runRequestCalls += 1;
      if (runRequestCalls > MAX_EXECUTION_RUN_REQUESTS_PER_SCRIPT) {
        throw sandboxError(`pm.execution.runRequest cannot be called more than ${MAX_EXECUTION_RUN_REQUESTS_PER_SCRIPT} times in one script.`);
      }
      const promise = tracker.brokerRequest('execution:runRequest', {
        options: normalizeExecutionRunRequestOptions(options),
        scopes: {
          collectionVariables: cloneVariablePairs(collectionVariables),
          environmentVariables: cloneVariablePairs(environmentVariables),
          globals: cloneVariablePairs(globals)
        },
        target: String(target || '')
      }).then((result) => {
        appendBrokeredTests(tests, result?.tests);
        replaceVariablePairs(environmentVariables, result?.environmentVariables);
        replaceVariablePairs(collectionVariables, result?.collectionVariables);
        replaceVariablePairs(globals, result?.globals);
        if (!result || result.skipped === true || !result.response) {
          return null;
        }
        return responseApi(result.response);
      });
      tracker.track(promise.catch(() => {}));
      return sandboxThenable(promise);
    },
    setNextRequest(target) {
      execution.nextRequest = target == null ? null : String(target);
    },
    location: executionLocationApi(location)
  };
  if (canSkipRequest) {
    api.skipRequest = function skipRequest() {
      execution.skipRequest = true;
      throw createSkipRequestSignal();
    };
  }
  return hardenSandboxValue(api);
}

function executionLocationApi(location = {}) {
  const folderPath = Array.isArray(location.folderPath)
    ? location.folderPath.map((item) => String(item || '')).filter(Boolean)
    : [];
  const path = Array.isArray(location.current)
    ? location.current.map((item) => String(item || '')).filter(Boolean)
    : [location.current || location.requestName || ''].filter(Boolean).map(String);
  const output = path.length ? path.slice() : folderPath.slice();
  const current = output.length ? output[output.length - 1] : '';
  Object.defineProperties(output, {
    collectionId: { value: String(location.collectionId || '') },
    folderPath: { value: hardenSandboxValue(folderPath.slice()) },
    index: { value: Number.isFinite(Number(location.index)) ? Number(location.index) : -1 },
    requestId: { value: String(location.requestId || '') },
    requestName: { value: String(location.requestName || '') },
    current: { value: current }
  });
  return hardenSandboxValue(output);
}

function createSkipRequestSignal() {
  const error = new Error('pm.execution.skipRequest');
  Object.defineProperty(error, SKIP_REQUEST_SIGNAL, {
    configurable: false,
    enumerable: false,
    value: true
  });
  return error;
}

function isSkipRequestSignal(error) {
  return Boolean(error && typeof error === 'object' && error[SKIP_REQUEST_SIGNAL] === true);
}

function normalizeExecutionRunRequestOptions(options) {
  if (!options || typeof options !== 'object') {
    return {};
  }
  const normalized = createSafePlainObject();
  const variables = options.variables;
  if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
    normalized.variables = createSafePlainObject();
    for (const [key, value] of Object.entries(variables).slice(0, 100)) {
      setSafeObjectProperty(normalized.variables, String(key).slice(0, 256), value == null ? '' : String(value).slice(0, 4096));
    }
  }
  return normalized;
}

function appendBrokeredTests(tests, brokeredTests) {
  if (!Array.isArray(brokeredTests)) {
    return;
  }
  for (const item of brokeredTests.slice(0, MAX_SCRIPT_LOGS)) {
    tests.push({
      name: String(item?.name || 'pm.execution.runRequest test').slice(0, 256),
      passed: item?.passed === true,
      error: String(item?.error || '').slice(0, MAX_SCRIPT_LOG_LENGTH),
      skipped: item?.skipped === true
    });
  }
}

function brokerVaultApi({ broker, tracker }) {
  const request = (operation, payload = {}) => {
    if (!broker || typeof tracker?.brokerRequest !== 'function') {
      throw sandboxError('pm.vault is not available in this script runtime.');
    }
    const promise = tracker.brokerRequest(operation, payload)
      .catch((error) => {
        throw sandboxError(errorMessage(error));
      });
    tracker.track(promise.catch(() => {}));
    return sandboxThenable(promise);
  };
  return hardenSandboxValue({
    get(key) {
      return request('vault:get', { key }).then((value) => (value == null ? undefined : String(value)));
    },
    set(key, value) {
      return request('vault:set', { key, value }).then(() => undefined);
    },
    unset(key) {
      return request('vault:unset', { key }).then(() => undefined);
    }
  });
}

function cloneVariablePairs(variables) {
  if (!Array.isArray(variables)) {
    return [];
  }
  return variables.slice(0, 1000).map((variable) => ({
    enabled: variable?.enabled !== false,
    key: variable?.key == null ? '' : String(variable.key).slice(0, 256),
    value: variable?.value == null ? '' : String(variable.value).slice(0, 4096)
  })).filter((variable) => variable.key);
}

function replaceVariablePairs(target, source) {
  if (!Array.isArray(target) || !Array.isArray(source)) {
    return;
  }
  target.splice(0, target.length, ...cloneVariablePairs(source));
}

function createVisualizerState() {
  return {
    compileOptions: {},
    data: null,
    decorators: new Map(),
    decoratorFacade: createSafePlainObject(),
    handlebars: null,
    helperFacade: createSafePlainObject(),
    helpers: new Map(),
    html: '',
    interactive: false,
    partialFacade: createSafePlainObject(),
    partials: new Map(),
    reviewedAssets: new Map(),
    template: ''
  };
}

function visualizerApi(state = createVisualizerState()) {
  return hardenSandboxValue({
    clear() {
      state.data = null;
      state.html = '';
      state.template = '';
    },
    set(template, data = {}, options = {}) {
      const source = String(template == null ? '' : template);
      if (source.length > MAX_VISUALIZER_TEMPLATE_LENGTH) {
        throw sandboxError(`pm.visualizer template cannot exceed ${MAX_VISUALIZER_TEMPLATE_LENGTH} characters.`);
      }
      applyVisualizerOptions(state, options);
      const snapshot = cloneVisualizerData(data);
      const rendered = sanitizeVisualizerHtml(renderVisualizerWithHandlebars(source, snapshot, state));
      if (rendered.length > MAX_VISUALIZER_HTML_LENGTH) {
        throw sandboxError(`pm.visualizer output cannot exceed ${MAX_VISUALIZER_HTML_LENGTH} characters.`);
      }
      state.data = snapshot;
      state.html = rendered;
      state.interactive = /<script\b/i.test(rendered)
        || Array.from(state.reviewedAssets.values()).some((asset) => asset.type === 'script');
      state.template = source;
    }
  });
}

let visualizerHandlebarsRootRuntime = null;

function createVisualizerHandlebarsApi(state = createVisualizerState()) {
  function SafeString(value) {
    const safeString = {
      toHTML() {
        return String(value == null ? '' : value);
      },
      toString() {
        return String(value == null ? '' : value);
      }
    };
    VISUALIZER_SAFE_STRING_VALUES.set(safeString, String(value == null ? '' : value));
    return hardenSandboxValue(safeString);
  }
  function Exception(message) {
    return hardenSandboxValue({
      message: String(message || ''),
      name: 'Error'
    });
  }

  const api = {
    Exception,
    SafeString,
    VERSION: `${VISUALIZER_HANDLEBARS_SOURCE_VERSION}-postmeter-isolated`,
    COMPILER_REVISION: 8,
    LAST_COMPATIBLE_COMPILER_REVISION: 7,
    compile(template, options = {}) {
      const source = String(template == null ? '' : template);
      if (source.length > MAX_VISUALIZER_TEMPLATE_LENGTH) {
        throw sandboxError(`pm.visualizer template cannot exceed ${MAX_VISUALIZER_TEMPLATE_LENGTH} characters.`);
      }
      const compileOptions = normalizeVisualizerCompileOptions(options);
      const env = visualizerHandlebarsEnvironment(state);
      let compiled;
      try {
        compiled = env.compile(source, compileOptions);
      } catch (error) {
        throw sandboxError(`pm.visualizer template compile failed: ${errorMessage(error)}`);
      }
      return hardenSandboxValue(function compiledVisualizerTemplate(data = {}, runtimeOptions = {}) {
        return renderVisualizerCompiledTemplate(compiled, cloneVisualizerData(data), state, runtimeOptions);
      });
    },
    precompile(template, options = {}) {
      const source = String(template == null ? '' : template);
      if (source.length > MAX_VISUALIZER_TEMPLATE_LENGTH) {
        throw sandboxError(`pm.visualizer template cannot exceed ${MAX_VISUALIZER_TEMPLATE_LENGTH} characters.`);
      }
      try {
        return String(visualizerHandlebarsEnvironment(state).precompile(source, normalizeVisualizerCompileOptions(options)));
      } catch (error) {
        throw sandboxError(`pm.visualizer template precompile failed: ${errorMessage(error)}`);
      }
    },
    parse(template, options = {}) {
      const source = String(template == null ? '' : template);
      if (source.length > MAX_VISUALIZER_TEMPLATE_LENGTH) {
        throw sandboxError(`pm.visualizer template cannot exceed ${MAX_VISUALIZER_TEMPLATE_LENGTH} characters.`);
      }
      try {
        return hardenSandboxValue(cloneVisualizerRuntimeValue(visualizerHandlebarsEnvironment(state).parse(source, normalizeVisualizerCompileOptions(options))));
      } catch (error) {
        throw sandboxError(`pm.visualizer template parse failed: ${errorMessage(error)}`);
      }
    },
    parseWithoutProcessing(template, options = {}) {
      const source = String(template == null ? '' : template);
      if (source.length > MAX_VISUALIZER_TEMPLATE_LENGTH) {
        throw sandboxError(`pm.visualizer template cannot exceed ${MAX_VISUALIZER_TEMPLATE_LENGTH} characters.`);
      }
      try {
        const env = visualizerHandlebarsEnvironment(state);
        const parse = typeof env.parseWithoutProcessing === 'function' ? env.parseWithoutProcessing : env.parse;
        return hardenSandboxValue(cloneVisualizerRuntimeValue(parse.call(env, source, normalizeVisualizerCompileOptions(options))));
      } catch (error) {
        throw sandboxError(`pm.visualizer template parse failed: ${errorMessage(error)}`);
      }
    },
    escapeExpression(value) {
      return visualizerHandlebarsEnvironment(state).escapeExpression(value);
    },
    createFrame(value = {}) {
      return createVisualizerFrame(value);
    },
    template(specification) {
      const env = visualizerHandlebarsEnvironment(state);
      let compiled;
      try {
        compiled = env.template(specification);
      } catch (error) {
        throw sandboxError(`pm.visualizer precompiled template failed: ${errorMessage(error)}`);
      }
      return hardenSandboxValue(function precompiledVisualizerTemplate(data = {}, runtimeOptions = {}) {
        return renderVisualizerCompiledTemplate(compiled, cloneVisualizerData(data), state, runtimeOptions);
      });
    },
    create() {
      return createVisualizerHandlebarsApi(createVisualizerState());
    },
    registerHelper(name, callback) {
      if (name && typeof name === 'object' && callback === undefined) {
        for (const [helperName, helperCallback] of Object.entries(name).slice(0, MAX_VISUALIZER_HELPERS)) {
          api.registerHelper(helperName, helperCallback);
        }
        return;
      }
      const helperName = normalizeVisualizerExtensionName(name, 'helper');
      if (typeof callback !== 'function') {
        throw sandboxError('Handlebars.registerHelper requires a callback function.');
      }
      if (!state.helpers.has(helperName) && state.helpers.size >= MAX_VISUALIZER_HELPERS) {
        throw sandboxError(`pm.visualizer cannot register more than ${MAX_VISUALIZER_HELPERS} helpers.`);
      }
      state.helpers.set(helperName, callback);
      setSafeObjectProperty(state.helperFacade, helperName, callback);
      registerVisualizerHelperInEnvironment(visualizerHandlebarsEnvironment(state), helperName, callback);
    },
    unregisterHelper(name) {
      const helperName = normalizeVisualizerExtensionName(name, 'helper');
      state.helpers.delete(helperName);
      delete state.helperFacade[helperName];
      visualizerHandlebarsEnvironment(state).unregisterHelper(helperName);
    },
    registerPartial(name, template) {
      if (name && typeof name === 'object' && template === undefined) {
        for (const [partialName, partialTemplate] of Object.entries(name).slice(0, MAX_VISUALIZER_PARTIALS)) {
          api.registerPartial(partialName, partialTemplate);
        }
        return;
      }
      const partialName = normalizeVisualizerExtensionName(name, 'partial');
      const source = typeof template === 'function' ? template : String(template == null ? '' : template);
      if (typeof source === 'string' && source.length > MAX_VISUALIZER_PARTIAL_LENGTH) {
        throw sandboxError(`pm.visualizer partial cannot exceed ${MAX_VISUALIZER_PARTIAL_LENGTH} characters.`);
      }
      if (!state.partials.has(partialName) && state.partials.size >= MAX_VISUALIZER_PARTIALS) {
        throw sandboxError(`pm.visualizer cannot register more than ${MAX_VISUALIZER_PARTIALS} partials.`);
      }
      state.partials.set(partialName, source);
      setSafeObjectProperty(state.partialFacade, partialName, source);
      registerVisualizerPartialInEnvironment(visualizerHandlebarsEnvironment(state), partialName, source);
    },
    unregisterPartial(name) {
      const partialName = normalizeVisualizerExtensionName(name, 'partial');
      state.partials.delete(partialName);
      delete state.partialFacade[partialName];
      visualizerHandlebarsEnvironment(state).unregisterPartial(partialName);
    },
    registerDecorator(name, callback) {
      if (name && typeof name === 'object' && callback === undefined) {
        for (const [decoratorName, decoratorCallback] of Object.entries(name).slice(0, MAX_VISUALIZER_DECORATORS)) {
          api.registerDecorator(decoratorName, decoratorCallback);
        }
        return;
      }
      const decoratorName = normalizeVisualizerExtensionName(name, 'decorator');
      if (typeof callback !== 'function') {
        throw sandboxError('Handlebars.registerDecorator requires a callback function.');
      }
      if (!state.decorators.has(decoratorName) && state.decorators.size >= MAX_VISUALIZER_DECORATORS) {
        throw sandboxError(`pm.visualizer cannot register more than ${MAX_VISUALIZER_DECORATORS} decorators.`);
      }
      state.decorators.set(decoratorName, callback);
      setSafeObjectProperty(state.decoratorFacade, decoratorName, callback);
      registerVisualizerDecoratorInEnvironment(visualizerHandlebarsEnvironment(state), decoratorName, callback);
    },
    unregisterDecorator(name) {
      const decoratorName = normalizeVisualizerExtensionName(name, 'decorator');
      state.decorators.delete(decoratorName);
      delete state.decoratorFacade[decoratorName];
      visualizerHandlebarsEnvironment(state).unregisterDecorator(decoratorName);
    },
    Utils: hardenSandboxValue({
      escapeExpression(value) {
        return visualizerHandlebarsEnvironment(state).escapeExpression(value);
      },
      isEmpty(value) {
        if (value == null || value === false) {
          return true;
        }
        if (Array.isArray(value) || typeof value === 'string') {
          return value.length === 0;
        }
        return typeof value === 'object' && Object.keys(value).length === 0;
      },
      createFrame(value = {}) {
        return createVisualizerFrame(value);
      },
      extend(target = {}, source = {}) {
        const output = cloneVisualizerRuntimeValue(target);
        assignSafeObjectProperties(output, cloneVisualizerRuntimeValue(source));
        return hardenSandboxValue(output);
      }
    }),
    log() {},
    logger: hardenSandboxValue({
      level: 'info',
      log() {},
      lookupLevel(value) {
        return value;
      },
      methodMap: ['debug', 'info', 'warn', 'error']
    }),
    noConflict() {
      return api;
    },
    helpers: state.helperFacade,
    partials: state.partialFacade,
    decorators: state.decoratorFacade
  };
  return hardenSandboxValue(api);
}

function visualizerHandlebarsRoot() {
  if (!visualizerHandlebarsRootRuntime) {
    const context = vm.createContext(Object.create(null), {
      codeGeneration: { strings: true, wasm: false },
      name: 'postmeter-visualizer-handlebars'
    });
    context.window = context;
    context.self = context;
    context.global = context;
    context.globalThis = context;
    vm.runInContext(getVisualizerHandlebarsSource(), context, {
      filename: `postmeter-visualizer-handlebars-${VISUALIZER_HANDLEBARS_SOURCE_VERSION}.js`,
      timeout: 1000
    });
    const runtime = context.Handlebars;
    if (!runtime || typeof runtime.create !== 'function' || typeof runtime.compile !== 'function') {
      throw sandboxError('PostMeter visualizer Handlebars runtime failed to initialize.');
    }
    visualizerHandlebarsRootRuntime = runtime;
  }
  return visualizerHandlebarsRootRuntime;
}

function visualizerHandlebarsEnvironment(state = createVisualizerState()) {
  if (!state.handlebars) {
    const env = visualizerHandlebarsRoot().create();
    for (const [name, callback] of state.helpers || new Map()) {
      registerVisualizerHelperInEnvironment(env, name, callback);
    }
    for (const [name, partial] of state.partials || new Map()) {
      registerVisualizerPartialInEnvironment(env, name, partial);
    }
    for (const [name, callback] of state.decorators || new Map()) {
      registerVisualizerDecoratorInEnvironment(env, name, callback);
    }
    state.handlebars = env;
  }
  return state.handlebars;
}

function createVisualizerFrame(value = {}) {
  const frame = cloneVisualizerRuntimeValue(value);
  if (frame && typeof frame === 'object' && !Array.isArray(frame)) {
    frame._parent = cloneVisualizerRuntimeValue(value);
  }
  return hardenSandboxValue(frame);
}

function registerVisualizerHelperInEnvironment(env, name, callback) {
  env.registerHelper(name, createVisualizerHelperWrapper(callback, env));
}

function registerVisualizerPartialInEnvironment(env, name, partial) {
  if (typeof partial === 'function') {
    env.registerPartial(name, createVisualizerPartialWrapper(partial, env));
    return;
  }
  env.registerPartial(name, String(partial == null ? '' : partial));
}

function registerVisualizerDecoratorInEnvironment(env, name, callback) {
  env.registerDecorator(name, createVisualizerDecoratorWrapper(callback, env));
}

function createVisualizerHelperWrapper(callback, env) {
  return function visualizerHelperWrapper(...args) {
    const options = args.length && isVisualizerHandlebarsOptions(args[args.length - 1])
      ? args.pop()
      : null;
    const safeArgs = args.map((arg) => hardenSandboxValue(cloneVisualizerRuntimeValue(arg)));
    const safeThis = hardenSandboxValue(cloneVisualizerRuntimeValue(this));
    try {
      const result = callback.apply(safeThis, options
        ? [...safeArgs, visualizerHelperOptions(options, env, safeThis)]
        : safeArgs);
      return visualizerHelperReturnValue(result, env);
    } catch (error) {
      throw sandboxError(`pm.visualizer helper failed: ${errorMessage(error)}`);
    }
  };
}

function createVisualizerPartialWrapper(callback, env) {
  return function visualizerPartialWrapper(context, options) {
    try {
      const result = callback.call(
        hardenSandboxValue(cloneVisualizerRuntimeValue(context)),
        hardenSandboxValue(cloneVisualizerRuntimeValue(context)),
        isVisualizerHandlebarsOptions(options) ? visualizerHelperOptions(options, env, context) : undefined
      );
      return visualizerHelperReturnValue(result, env);
    } catch (error) {
      throw sandboxError(`pm.visualizer partial failed: ${errorMessage(error)}`);
    }
  };
}

function createVisualizerDecoratorWrapper(callback, env) {
  return function visualizerDecoratorWrapper(program, props, container, options) {
    const safeProgram = hardenSandboxValue(function visualizerDecoratorProgram(context = {}, runtimeOptions = {}) {
      return assertVisualizerOutputLength(program(
        cloneVisualizerRuntimeValue(context),
        normalizeVisualizerRenderOptions(runtimeOptions, env)
      ));
    });
    const safeProps = hardenSandboxValue(cloneVisualizerRuntimeValue(props));
    const safeContainer = hardenSandboxValue({
      escapeExpression(value) {
        return env.escapeExpression(value);
      }
    });
    const safeOptions = isVisualizerHandlebarsOptions(options)
      ? visualizerHelperOptions(options, env, props)
      : hardenSandboxValue(createSafePlainObject());
    let decorated;
    try {
      decorated = callback.call(hardenSandboxValue(createSafePlainObject()), safeProgram, safeProps, safeContainer, safeOptions);
      assignSafeObjectProperties(props, cloneVisualizerRuntimeValue(safeProps));
    } catch (error) {
      throw sandboxError(`pm.visualizer decorator failed: ${errorMessage(error)}`);
    }
    if (typeof decorated !== 'function') {
      return program;
    }
    return function visualizerDecoratedProgram(context = {}, runtimeOptions = {}) {
      try {
        return visualizerHelperReturnValue(decorated.call(
          hardenSandboxValue(cloneVisualizerRuntimeValue(context)),
          hardenSandboxValue(cloneVisualizerRuntimeValue(context)),
          hardenSandboxValue(cloneVisualizerRuntimeValue(runtimeOptions))
        ), env);
      } catch (error) {
        throw sandboxError(`pm.visualizer decorator failed: ${errorMessage(error)}`);
      }
    };
  };
}

function isVisualizerHandlebarsOptions(value) {
  return Boolean(value && typeof value === 'object' && (
    typeof value.fn === 'function'
    || typeof value.inverse === 'function'
    || value.hash
    || value.data
  ));
}

function visualizerHelperOptions(options, env, fallbackContext) {
  const helperOptions = createSafePlainObject();
  const blockFn = typeof options.fn === 'function' ? options.fn : () => '';
  const inverseFn = typeof options.inverse === 'function' ? options.inverse : () => '';
  helperOptions.name = String(options.name || '');
  helperOptions.hash = hardenSandboxValue(cloneVisualizerRuntimeValue(options.hash || {}));
  helperOptions.data = hardenSandboxValue(cloneVisualizerRuntimeValue(options.data || {}));
  helperOptions.loc = hardenSandboxValue(cloneVisualizerRuntimeValue(options.loc || {}));
  helperOptions.args = hardenSandboxValue(cloneVisualizerRuntimeValue(options.args || []));
  helperOptions.fn = hardenSandboxValue(function visualizerBlockFn(context = fallbackContext, runtimeOptions = {}) {
    return assertVisualizerOutputLength(blockFn(
      cloneVisualizerRuntimeValue(context),
      normalizeVisualizerRenderOptions(runtimeOptions, env)
    ));
  });
  helperOptions.inverse = hardenSandboxValue(function visualizerBlockInverse(context = fallbackContext, runtimeOptions = {}) {
    return assertVisualizerOutputLength(inverseFn(
      cloneVisualizerRuntimeValue(context),
      normalizeVisualizerRenderOptions(runtimeOptions, env)
    ));
  });
  helperOptions.lookupProperty = hardenSandboxValue((object, propertyName) => (
    readVisualizerSafeProperty(object, String(propertyName || ''))
  ));
  return hardenSandboxValue(helperOptions);
}

function visualizerHelperReturnValue(value, env) {
  const safeString = VISUALIZER_SAFE_STRING_VALUES.get(value);
  if (safeString != null) {
    return new env.SafeString(safeString);
  }
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'function') {
    return '';
  }
  return cloneVisualizerData(value);
}

function renderVisualizerWithHandlebars(template, data, state = createVisualizerState()) {
  const env = visualizerHandlebarsEnvironment(state);
  let compiled;
  try {
    compiled = env.compile(String(template == null ? '' : template), normalizeVisualizerCompileOptions(state.compileOptions));
  } catch (error) {
    throw sandboxError(`pm.visualizer template compile failed: ${errorMessage(error)}`);
  }
  return renderVisualizerCompiledTemplate(compiled, data, state);
}

function renderVisualizerCompiledTemplate(compiled, data, state = createVisualizerState(), runtimeOptions = {}) {
  const env = visualizerHandlebarsEnvironment(state);
  try {
    return assertVisualizerOutputLength(compiled(
      cloneVisualizerRuntimeValue(data),
      normalizeVisualizerRenderOptions(runtimeOptions, env)
    ));
  } catch (error) {
    throw sandboxError(`pm.visualizer template render failed: ${errorMessage(error)}`);
  }
}

function normalizeVisualizerRenderOptions(options = {}, env = visualizerHandlebarsRoot()) {
  const normalized = {
    allowProtoMethodsByDefault: false,
    allowProtoPropertiesByDefault: false
  };
  if (!options || typeof options !== 'object') {
    return normalized;
  }
  if (options.data && typeof options.data === 'object') {
    normalized.data = cloneVisualizerRuntimeValue(options.data);
  }
  if (options.helpers && typeof options.helpers === 'object') {
    normalized.helpers = createSafePlainObject();
    for (const [name, callback] of Object.entries(options.helpers).slice(0, MAX_VISUALIZER_HELPERS)) {
      if (typeof callback === 'function') {
        setSafeObjectProperty(
          normalized.helpers,
          normalizeVisualizerExtensionName(name, 'runtime helper'),
          createVisualizerHelperWrapper(callback, env)
        );
      }
    }
  }
  if (options.partials && typeof options.partials === 'object') {
    normalized.partials = createSafePlainObject();
    for (const [name, partial] of Object.entries(options.partials).slice(0, MAX_VISUALIZER_PARTIALS)) {
      const partialName = normalizeVisualizerExtensionName(name, 'runtime partial');
      if (typeof partial === 'function') {
        setSafeObjectProperty(normalized.partials, partialName, createVisualizerPartialWrapper(partial, env));
      } else {
        const source = String(partial == null ? '' : partial);
        if (source.length > MAX_VISUALIZER_PARTIAL_LENGTH) {
          throw sandboxError(`pm.visualizer partial cannot exceed ${MAX_VISUALIZER_PARTIAL_LENGTH} characters.`);
        }
        setSafeObjectProperty(normalized.partials, partialName, source);
      }
    }
  }
  if (options.decorators && typeof options.decorators === 'object') {
    normalized.decorators = createSafePlainObject();
    for (const [name, callback] of Object.entries(options.decorators).slice(0, MAX_VISUALIZER_DECORATORS)) {
      if (typeof callback === 'function') {
        setSafeObjectProperty(
          normalized.decorators,
          normalizeVisualizerExtensionName(name, 'runtime decorator'),
          createVisualizerDecoratorWrapper(callback, env)
        );
      }
    }
  }
  return normalized;
}

function assertVisualizerOutputLength(value) {
  const text = value == null ? '' : String(value);
  if (text.length > MAX_VISUALIZER_HTML_LENGTH) {
    throw sandboxError(`pm.visualizer output cannot exceed ${MAX_VISUALIZER_HTML_LENGTH} characters.`);
  }
  return text;
}

function applyVisualizerOptions(state, options = {}) {
  if (!options || typeof options !== 'object') {
    return;
  }
  state.compileOptions = {
    ...(state.compileOptions || {}),
    ...normalizeVisualizerCompileOptions(options)
  };
  if (options.partials && typeof options.partials === 'object') {
    for (const [name, template] of Object.entries(options.partials).slice(0, MAX_VISUALIZER_PARTIALS)) {
      createVisualizerHandlebarsApi(state).registerPartial(name, template);
    }
  }
  if (options.helpers && typeof options.helpers === 'object') {
    for (const [name, callback] of Object.entries(options.helpers).slice(0, MAX_VISUALIZER_HELPERS)) {
      createVisualizerHandlebarsApi(state).registerHelper(name, callback);
    }
  }
  if (options.decorators && typeof options.decorators === 'object') {
    for (const [name, callback] of Object.entries(options.decorators).slice(0, MAX_VISUALIZER_DECORATORS)) {
      createVisualizerHandlebarsApi(state).registerDecorator(name, callback);
    }
  }
  if (options.assets && typeof options.assets === 'object') {
    for (const [name, asset] of Object.entries(options.assets).slice(0, MAX_VISUALIZER_ASSETS)) {
      const assetName = normalizeVisualizerExtensionName(name, 'asset');
      state.reviewedAssets.set(assetName, normalizeVisualizerAsset(assetName, asset));
    }
  }
}

function normalizeVisualizerAsset(name, asset) {
  const source = String(asset?.source ?? asset ?? '');
  const integrity = String(asset?.integrity || '');
  if (!source || !integrity.startsWith('sha256-')) {
    throw sandboxError('pm.visualizer reviewed assets require source and sha256 integrity metadata.');
  }
  if (integrity !== scriptPackageIntegrity(source)) {
    throw sandboxError(`pm.visualizer asset "${name}" integrity does not match its reviewed source.`);
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_VISUALIZER_ASSET_BYTES) {
    throw sandboxError(`pm.visualizer asset "${name}" is too large.`);
  }
  const type = normalizeVisualizerAssetType(asset);
  return { integrity, source, type };
}

function normalizeVisualizerAssetType(asset) {
  const raw = String(asset?.type || asset?.kind || '').trim().toLowerCase();
  if (raw === 'style' || raw === 'css' || raw === 'stylesheet') {
    return 'style';
  }
  return 'script';
}

function normalizeVisualizerCompileOptions(options = {}) {
  if (!options || typeof options !== 'object') {
    return {};
  }
  const normalized = {};
  for (const key of [
    'assumeObjects',
    'compat',
    'data',
    'explicitPartialContext',
    'ignoreStandalone',
    'knownHelpersOnly',
    'noEscape',
    'preventIndent',
    'strict',
    'stringParams'
  ]) {
    if (options[key] === true) {
      normalized[key] = true;
    }
  }
  if (options.knownHelpers && typeof options.knownHelpers === 'object') {
    normalized.knownHelpers = createSafePlainObject();
    for (const [name, value] of Object.entries(options.knownHelpers).slice(0, MAX_VISUALIZER_HELPERS)) {
      setSafeObjectProperty(normalized.knownHelpers, normalizeVisualizerExtensionName(name, 'known helper'), value === true);
    }
  }
  return normalized;
}

function normalizeVisualizerExtensionName(name, type) {
  const normalized = String(name == null ? '' : name).trim();
  if (!/^[A-Za-z0-9_./-]{1,128}$/.test(normalized)
    || normalized.includes('..')
    || normalized.includes('//')
    || normalized.split(/[./-]/).some((part) => VISUALIZER_UNSAFE_PATH_PARTS.has(part))) {
    throw sandboxError(`pm.visualizer ${type} name is invalid.`);
  }
  return normalized;
}

function cloneVisualizerData(data) {
  try {
    const text = JSON.stringify(data == null ? {} : data);
    if (Buffer.byteLength(text, 'utf8') > MAX_VISUALIZER_DATA_BYTES) {
      throw sandboxError(`pm.visualizer data cannot exceed ${MAX_VISUALIZER_DATA_BYTES} bytes.`);
    }
    return sanitizeVisualizerDataValue(JSON.parse(text));
  } catch (error) {
    if (String(error?.message || '').includes('pm.visualizer data cannot exceed')) {
      throw error;
    }
    throw sandboxError(`pm.visualizer data must be JSON-serializable: ${errorMessage(error)}`);
  }
}

function sanitizeVisualizerDataValue(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const item of value) {
      output.push(sanitizeVisualizerDataValue(item, seen));
    }
    return output;
  }
  const output = createSafePlainObject();
  seen.set(value, output);
  for (const [key, item] of Object.entries(value)) {
    if (isSafeVisualizerPropertyName(key)) {
      output[key] = sanitizeVisualizerDataValue(item, seen);
    }
  }
  return output;
}

function cloneVisualizerRuntimeValue(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  const safeString = VISUALIZER_SAFE_STRING_VALUES.get(value);
  if (safeString != null) {
    return safeString;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const item of value.slice(0, MAX_VISUALIZER_EACH_ITEMS)) {
      output.push(cloneVisualizerRuntimeValue(item, seen));
    }
    return output;
  }
  const output = createSafePlainObject();
  seen.set(value, output);
  for (const [key, item] of Object.entries(value).slice(0, MAX_VISUALIZER_EACH_ITEMS)) {
    if (isSafeVisualizerPropertyName(key)) {
      output[key] = cloneVisualizerRuntimeValue(item, seen);
    }
  }
  return output;
}

function isSafeVisualizerPropertyName(key) {
  const safeKey = String(key || '');
  return Boolean(safeKey) && !VISUALIZER_UNSAFE_PATH_PARTS.has(safeKey);
}

function readVisualizerSafeProperty(object, propertyName) {
  if (!isSafeVisualizerPropertyName(propertyName) || object == null) {
    return undefined;
  }
  const target = Object(object);
  if (!Object.prototype.hasOwnProperty.call(target, propertyName)) {
    return undefined;
  }
  return hardenSandboxValue(cloneVisualizerRuntimeValue(target[propertyName]));
}

function renderVisualizerTemplate(template, data, state = createVisualizerState(), depth = 0) {
  if (depth > MAX_VISUALIZER_TEMPLATE_DEPTH) {
    throw sandboxError(`pm.visualizer template block nesting cannot exceed ${MAX_VISUALIZER_TEMPLATE_DEPTH}.`);
  }

  const source = stripVisualizerWhitespaceControls(String(template || ''))
    .replace(/\{\{!--[\s\S]*?--\}\}/g, '')
    .replace(/\{\{![\s\S]*?\}\}/g, '');
  const context = depth === 0 ? visualizerRootContext(data) : data;
  const blockPattern = new RegExp(`\\{\\{\\s*#(${VISUALIZER_BLOCK_NAME_PATTERN})(?:\\s+([^}]+?))?\\s*\\}\\}`, 'g');
  let output = '';
  let index = 0;
  let match;

  while ((match = blockPattern.exec(source)) !== null) {
    output = appendVisualizerOutput(output, renderVisualizerValues(source.slice(index, match.index), context, state, depth));
    const block = readVisualizerBlock(source, blockPattern.lastIndex, match[1]);
    if (!block) {
      throw sandboxError(`pm.visualizer template has an unclosed {{#${match[1]}}} block.`);
    }
    const expression = parseVisualizerBlockExpression(match[2] || '');
    output = appendVisualizerOutput(
      output,
      renderVisualizerBlock(match[1], expression, block, context, state, depth + 1)
    );
    index = block.endIndex;
    blockPattern.lastIndex = block.endIndex;
  }

  return appendVisualizerOutput(output, renderVisualizerValues(source.slice(index), context, state, depth));
}

function renderVisualizerValues(template, data, state, depth) {
  const partialPattern = /\{\{\s*>\s*([A-Za-z0-9_-]{1,64})(?:\s+([^}]+?))?\s*\}\}/g;
  const triplePattern = /\{\{\{\s*([^{}]+?)\s*\}\}\}/g;
  const doublePattern = /\{\{\s*([^#/{>!][^{}]*?)\s*\}\}/g;
  return String(template || '')
    .replace(partialPattern, (_match, name, expression) => {
      const partial = state.partials.get(name);
      if (partial == null) {
        return '';
      }
      const partialContext = expression ? readVisualizerExpression(data, expression, state) : data;
      return renderVisualizerTemplate(partial, visualizerPartialContext(data, partialContext), state, depth + 1);
    })
    .replace(triplePattern, (_match, expression) => {
      const value = readVisualizerExpression(data, expression, state);
      return visualizerValueToString(value, { escape: false });
    })
    .replace(doublePattern, (_match, expression) => {
      const value = readVisualizerExpression(data, expression, state);
      return visualizerValueToString(value, { escape: state.compileOptions?.noEscape === true ? false : true });
    });
}

function readVisualizerBlock(template, startIndex, helperName) {
  const blockPattern = new RegExp(`\\{\\{\\s*(#(${VISUALIZER_BLOCK_NAME_PATTERN})(?:\\s+[^}]+?)?|else|/(${VISUALIZER_BLOCK_NAME_PATTERN}))\\s*\\}\\}`, 'g');
  blockPattern.lastIndex = startIndex;
  const stack = [helperName];
  let elseIndex = -1;
  let elseEndIndex = -1;
  let match;
  while ((match = blockPattern.exec(template)) !== null) {
    if (match[1].startsWith('#')) {
      stack.push(match[2]);
    } else if (match[1] === 'else') {
      if (stack.length === 1) {
        if (elseIndex !== -1) {
          throw sandboxError(`pm.visualizer template block {{#${helperName}}} has multiple {{else}} sections.`);
        }
        elseIndex = match.index;
        elseEndIndex = blockPattern.lastIndex;
      }
    } else {
      const closeHelper = match[3] || '';
      const activeHelper = stack.pop();
      if (closeHelper !== activeHelper) {
        throw sandboxError(`pm.visualizer template block {{#${activeHelper || helperName}}} closed with {{/${closeHelper}}}.`);
      }
      if (stack.length === 0) {
        return {
          template: template.slice(startIndex, elseIndex === -1 ? match.index : elseIndex),
          elseTemplate: elseIndex === -1 ? '' : template.slice(elseEndIndex, match.index),
          endIndex: blockPattern.lastIndex
        };
      }
    }
  }
  return null;
}

function renderVisualizerBlock(helperName, expression, block, data, state, depth) {
  const value = readVisualizerValue(data, expression.path || '.');
  if (helperName === 'each') {
    const entries = visualizerEachEntries(value);
    if (!entries.length) {
      return block.elseTemplate ? renderVisualizerTemplate(block.elseTemplate, data, state, depth) : '';
    }
    let output = '';
    for (const entry of entries) {
      output = appendVisualizerOutput(
      output,
        renderVisualizerTemplate(block.template, visualizerEachContext(data, entry.value, entry.index, entry.key, entries.length, expression.blockParams), state, depth)
      );
    }
    return output;
  }
  if (helperName === 'if') {
    return renderVisualizerTemplate(visualizerTruthy(value) ? block.template : block.elseTemplate, data, state, depth);
  }
  if (helperName === 'unless') {
    return renderVisualizerTemplate(visualizerTruthy(value) ? block.elseTemplate : block.template, data, state, depth);
  }
  if (helperName === 'with') {
    if (!visualizerTruthy(value)) {
      return block.elseTemplate ? renderVisualizerTemplate(block.elseTemplate, data, state, depth) : '';
    }
    return renderVisualizerTemplate(block.template, visualizerWithContext(data, value, expression.blockParams), state, depth);
  }
  const helper = state.helpers.get(helperName);
  if (helper) {
    const args = expression.tokens.map((token) => readVisualizerHelperArgument(data, token));
    const options = visualizerBlockHelperOptions(block, data, state, depth);
    try {
      return visualizerValueToString(helper.apply(data?.this ?? data, [...args, options]), { escape: false });
    } catch (error) {
      throw sandboxError(`pm.visualizer helper "${helperName}" failed: ${errorMessage(error)}`);
    }
  }
  if (state.compileOptions?.strict === true) {
    throw sandboxError(`pm.visualizer helper "${helperName}" is not registered.`);
  }
  return '';
}

function stripVisualizerWhitespaceControls(template) {
  return String(template || '').replace(/\{\{~/g, '{{').replace(/~\}\}/g, '}}').replace(/\{\{\{~/g, '{{{').replace(/~\}\}\}/g, '}}}');
}

function parseVisualizerBlockExpression(expression) {
  const tokens = tokenizeVisualizerExpression(expression);
  const blockParams = [];
  const cleanedTokens = [];
  let readingBlockParams = false;
  for (const token of tokens) {
    const raw = typeof token === 'string' ? token : token?.value;
    if (raw === 'as') {
      readingBlockParams = true;
      continue;
    }
    if (readingBlockParams) {
      const names = String(raw || '').replace(/^\|/, '').replace(/\|$/, '').split(/\s+/).filter(Boolean);
      for (const name of names) {
        if (/^[A-Za-z_$][\w$]*$/.test(name) && !VISUALIZER_UNSAFE_PATH_PARTS.has(name)) {
          blockParams.push(name);
        }
      }
      continue;
    }
    cleanedTokens.push(token);
  }
  return {
    blockParams: blockParams.slice(0, 4),
    path: typeof cleanedTokens[0] === 'string' ? cleanedTokens[0] : '.',
    tokens: cleanedTokens
  };
}

function visualizerBlockHelperOptions(block, data, state, depth) {
  return hardenSandboxValue({
    data: visualizerHelperData(data),
    fn(context = data) {
      return renderVisualizerTemplate(block.template, visualizerPartialContext(data, context), state, depth);
    },
    inverse(context = data) {
      return block.elseTemplate ? renderVisualizerTemplate(block.elseTemplate, visualizerPartialContext(data, context), state, depth) : '';
    },
    hash: createSafePlainObject()
  });
}

function visualizerHelperData(data) {
  const output = createSafePlainObject();
  for (const key of ['@index', '@key', '@first', '@last']) {
    if (data?.[key] != null) {
      output[key.slice(1)] = data[key];
    }
  }
  output.root = data?.['@root'] || data;
  return output;
}

function visualizerRootContext(data) {
  const context = createSafePlainObject();
  assignVisualizerObjectFields(context, data);
  context.this = data;
  context['@root'] = data;
  return context;
}

function visualizerEachEntries(value) {
  if (Array.isArray(value)) {
    return value.slice(0, MAX_VISUALIZER_EACH_ITEMS).map((item, index) => ({ value: item, index }));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !VISUALIZER_UNSAFE_PATH_PARTS.has(key))
      .slice(0, MAX_VISUALIZER_EACH_ITEMS)
      .map(([key, item], index) => ({ key, value: item, index }));
  }
  return [];
}

function visualizerEachContext(parent, item, index, key, length, blockParams = []) {
  return visualizerItemContext(parent, item, {
    blockParams,
    index,
    isFirst: index === 0,
    isLast: Number(index) === Number(length) - 1,
    key
  });
}

function visualizerWithContext(parent, item, blockParams = []) {
  return visualizerItemContext(parent, item, { blockParams });
}

function visualizerPartialContext(parent, item) {
  if (item == null) {
    return parent;
  }
  if (item && typeof item === 'object') {
    return visualizerItemContext(parent, item);
  }
  return visualizerItemContext(parent, item);
}

function visualizerItemContext(parent, item, options = {}) {
  const context = createSafePlainObject();
  const root = parent?.['@root'] || parent;
  assignVisualizerObjectFields(context, parent);
  assignVisualizerObjectFields(context, item);
  context.this = item;
  context['@root'] = root;
  context['@parent'] = parent;
  if (options.index != null) {
    context['@index'] = options.index;
  }
  if (options.key != null) {
    context['@key'] = options.key;
  }
  if (options.isFirst != null) {
    context['@first'] = options.isFirst === true;
  }
  if (options.isLast != null) {
    context['@last'] = options.isLast === true;
  }
  const blockParams = Array.isArray(options.blockParams) ? options.blockParams : [];
  if (blockParams[0]) {
    setSafeObjectProperty(context, blockParams[0], item);
  }
  if (blockParams[1] && options.index != null) {
    setSafeObjectProperty(context, blockParams[1], options.index);
  }
  return context;
}

function readVisualizerExpression(data, expression, state) {
  const tokens = tokenizeVisualizerExpression(expression);
  if (!tokens.length) {
    return undefined;
  }
  const helper = state.helpers.get(tokens[0]);
  if (helper) {
    const args = tokens.slice(1).map((token) => readVisualizerHelperArgument(data, token));
    try {
      return helper.apply(data?.this ?? data, args);
    } catch (error) {
      throw sandboxError(`pm.visualizer helper "${tokens[0]}" failed: ${errorMessage(error)}`);
    }
  }
  if (tokens.length === 1) {
    return readVisualizerValue(data, tokens[0]);
  }
  return undefined;
}

function tokenizeVisualizerExpression(expression) {
  const tokens = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(String(expression || '').trim())) !== null && tokens.length < 16) {
    if (match[1] != null) {
      tokens.push({ type: 'literal', value: match[1].replace(/\\(["\\])/g, '$1') });
    } else if (match[2] != null) {
      tokens.push({ type: 'literal', value: match[2].replace(/\\(['\\])/g, '$1') });
    } else {
      tokens.push(match[3]);
    }
  }
  return tokens;
}

function readVisualizerHelperArgument(data, token) {
  if (token && typeof token === 'object' && token.type === 'literal') {
    return token.value;
  }
  const raw = String(token || '');
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (raw === 'null') {
    return null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  return readVisualizerValue(data, raw);
}

function visualizerValueToString(value, options = {}) {
  const safeValue = VISUALIZER_SAFE_STRING_VALUES.get(value);
  if (safeValue != null) {
    return safeValue;
  }
  const text = value == null ? '' : String(value);
  return options.escape === false ? text : escapeHtml(text);
}

function assignVisualizerObjectFields(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    setSafeObjectProperty(target, key, value);
  }
}

function visualizerTruthy(value) {
  if (value == null || value === false) {
    return false;
  }
  if (typeof value === 'number') {
    return value !== 0 && !Number.isNaN(value);
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function appendVisualizerOutput(output, addition) {
  const next = output + addition;
  if (next.length > MAX_VISUALIZER_HTML_LENGTH) {
    throw sandboxError(`pm.visualizer output cannot exceed ${MAX_VISUALIZER_HTML_LENGTH} characters.`);
  }
  return next;
}

function readVisualizerValue(data, path) {
  const source = String(path || '');
  if (source === '.') {
    return data?.this;
  }
  if (source === '@root') {
    return data?.['@root'] || data;
  }
  let value = data;
  let remaining = source;
  while (remaining.startsWith('../')) {
    value = value?.['@parent'];
    remaining = remaining.slice(3);
  }
  if (remaining.startsWith('@root.')) {
    value = data?.['@root'] || data;
    remaining = remaining.slice('@root.'.length);
  }
  for (const part of remaining.split('.')) {
    if (!part || VISUALIZER_UNSAFE_PATH_PARTS.has(part)) {
      return undefined;
    }
    value = readVisualizerProperty(value, part);
  }
  return value;
}

function readVisualizerProperty(value, part) {
  if (value == null) {
    return undefined;
  }
  if (part === 'length' && (typeof value === 'string' || Array.isArray(value))) {
    return value.length;
  }
  const target = Object(value);
  if (!Object.prototype.hasOwnProperty.call(target, part)) {
    return undefined;
  }
  return target[part];
}

function sanitizeVisualizerHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*>/gi, '<script>')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(src|href)\s*=\s*(["'])(?!data:image\/|#|about:blank)(.*?)\2/gi, '')
    .replace(/\s+(src|href)\s*=\s*(?!["'])(?!data:image\/|#|about:blank)[^\s>]+/gi, '');
}

function visualizerResult(state) {
  if (!state?.html) {
    return undefined;
  }
  return {
    assets: Array.from(state.reviewedAssets || new Map(), ([name, asset]) => ({
      integrity: asset.integrity,
      name,
      source: asset.source,
      type: asset.type === 'style' ? 'style' : 'script'
    })),
    data: cloneJson(state.data || {}),
    html: state.html,
    interactive: state.interactive === true,
    template: state.template.slice(0, MAX_VISUALIZER_TEMPLATE_LENGTH)
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function brokerCookieApi({ broker, cookieAccessEnabled = true, currentRequestCookies = [], tracker }) {
  const currentCookies = createPostmanCookieList(currentRequestCookies);
  const assertEnabled = () => {
    if (cookieAccessEnabled === false) {
      throw sandboxError('pm.cookies is disabled for this workspace.');
    }
  };
  const request = async (operation, payload = {}) => {
    if (!broker || typeof tracker?.brokerRequest !== 'function') {
      throw sandboxError('pm.cookies is not available in this script runtime.');
    }
    const promise = tracker.brokerRequest(operation, payload);
    tracker.track(promise.catch(() => {}));
    return promise;
  };
  const withCallback = brokerCallbackThenable;
  return hardenSandboxValue({
    get(name, callback) {
      assertEnabled();
      return cookieCallbackValue(currentCookies.get(name), callback);
    },
    has(name, callback) {
      assertEnabled();
      return cookieCallbackValue(currentCookies.has(name), callback);
    },
    toObject(callback) {
      assertEnabled();
      return cookieCallbackValue(currentCookies.toObject(), callback);
    },
    set(name, value, callback) {
      assertEnabled();
      const cookieName = String(name || '');
      const cookieValue = value == null ? '' : String(value);
      return withCallback(
        request('cookies:set', { name: cookieName, value: cookieValue }).then(() => {
          currentCookies.upsert({ name: cookieName, value: cookieValue });
          return undefined;
        }),
        callback
      );
    },
    unset(name, callback) {
      assertEnabled();
      const cookieName = String(name || '');
      return withCallback(
        request('cookies:unset', { name: cookieName }).then(() => {
          currentCookies.remove(cookieName);
          return undefined;
        }),
        callback
      );
    },
    jar() {
      assertEnabled();
      return brokerCookieJarApi({ request });
    }
  });
}

function cookieCallbackValue(value, callback) {
  const safeValue = value && typeof value === 'object' ? hardenSandboxValue(value) : value;
  if (typeof callback === 'function') {
    callback(null, safeValue);
  }
  return safeValue;
}

function brokerCallbackThenable(promise, callback) {
  const handled = promise
    .then((value) => {
      if (typeof callback === 'function') {
        callback(null, value);
      }
      return value;
    })
    .catch((error) => {
      const safeError = sandboxError(errorMessage(error));
      if (typeof callback === 'function') {
        callback(safeError);
        return undefined;
      }
      throw safeError;
    });
  return sandboxThenable(handled);
}

function brokerCookieJarApi({ request }) {
  const withCallback = brokerCallbackThenable;
  return hardenSandboxValue({
    get(url, name, callback) {
      return withCallback(
        request('cookies.jar:get', { url: String(url || ''), name: String(name || '') }),
        callback
      );
    },
    getAll(url, callback) {
      return withCallback(
        request('cookies.jar:getAll', { url: String(url || '') }).then((value) => createPostmanCookieList(value)),
        callback
      );
    },
    set(url, name, value, callback) {
      const payload = { url: String(url || '') };
      let finalCallback = callback;
      if (name && typeof name === 'object') {
        payload.cookie = cookiePayloadForBroker(name);
        finalCallback = typeof value === 'function' ? value : callback;
      } else {
        payload.name = String(name || '');
        payload.value = value == null ? '' : String(value);
      }
      return withCallback(
        request('cookies.jar:set', payload).then(() => undefined),
        finalCallback
      );
    },
    unset(url, name, callback) {
      return withCallback(
        request('cookies.jar:unset', { url: String(url || ''), name: String(name || '') }).then(() => undefined),
        callback
      );
    },
    clear(url, callback) {
      return withCallback(
        request('cookies.jar:clear', { url: String(url || '') }).then(() => undefined),
        callback
      );
    }
  });
}

function cookiePayloadForBroker(cookie) {
  const source = cookie && typeof cookie.toJSON === 'function' ? cookie.toJSON() : cookie;
  return hardenSandboxValue({
    name: source?.name == null ? source?.key == null ? '' : String(source.key) : String(source.name),
    value: source?.value == null ? '' : String(source.value),
    domain: source?.domain == null ? '' : String(source.domain),
    path: source?.path == null ? '' : String(source.path),
    expiresAt: source?.expiresAt == null
      ? source?.expires == null
        ? ''
        : String(source.expires)
      : String(source.expiresAt),
    httpOnly: source?.httpOnly === true,
    maxAge: source?.maxAge == null ? '' : String(source.maxAge),
    secure: source?.secure === true,
    sameSite: source?.sameSite == null ? '' : String(source.sameSite),
    hostOnly: source?.hostOnly === true,
    priority: source?.priority == null ? '' : String(source.priority),
    partitioned: source?.partitioned === true
  });
}

function requestApi(request = {}) {
  return createPostmanRequest(request || {});
}

function mutableRequestApi(request = {}) {
  return createPostmanRequest(request || {}, { mutable: true });
}

function mutableRequestUrlApi(request) {
  const read = () => requestUrlApi(request.url || '');
  return hardenSandboxValue({
    get raw() { return String(request.url || ''); },
    set raw(value) { request.url = String(value || ''); },
    get protocol() { return read().protocol; },
    get host() { return read().host; },
    get path() { return read().path; },
    get query() { return read().query; },
    toString() {
      return String(request.url || '');
    }
  });
}

function mutableRequestBodyApi(request) {
  return hardenSandboxValue({
    get raw() {
      return String(request.body || '');
    },
    set raw(value) {
      request.body = value == null ? '' : String(value);
    },
    toString() {
      return String(request.body || '');
    }
  });
}

function mutablePairListApi(pairs) {
  const api = pairListApi(pairs);
  return hardenSandboxValue({
    ...api,
    add(pair) {
      if (!pair?.key) {
        return;
      }
      pairs.push({ enabled: pair.enabled !== false, key: String(pair.key), value: pair.value == null ? '' : String(pair.value) });
    },
    upsert(pair) {
      if (!pair?.key) {
        return;
      }
      const target = String(pair.key).toLowerCase();
      const existing = pairs.find((item) => String(item.key || '').toLowerCase() === target);
      if (existing) {
        existing.enabled = pair.enabled !== false;
        existing.value = pair.value == null ? '' : String(pair.value);
      } else {
        this.add(pair);
      }
    },
    remove(name) {
      const target = String(name || '').toLowerCase();
      const index = pairs.findIndex((item) => String(item.key || '').toLowerCase() === target);
      if (index >= 0) {
        pairs.splice(index, 1);
      }
    }
  });
}

function requestUrlApi(rawUrl) {
  const raw = String(rawUrl || '');
  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch {
    // Postman allows unresolved variable URLs; keep raw access working.
  }
  return hardenSandboxValue({
    raw,
    protocol: parsed ? parsed.protocol.replace(/:$/, '') : '',
    host: parsed ? parsed.hostname : '',
    path: parsed ? parsed.pathname.split('/').filter(Boolean) : [],
    query: parsed ? Array.from(parsed.searchParams.entries()).map(([key, value]) => ({ key, value })) : [],
    toString() {
      return raw;
    }
  });
}

function requestBodyApi(rawBody) {
  const raw = String(rawBody || '');
  return hardenSandboxValue({
    raw,
    toString() {
      return raw;
    }
  });
}

function responseApi(response = null, options = {}) {
  if (!response) {
    return undefined;
  }
  const postmanResponse = createPostmanResponse(response, options);
  const haveAssertions = createResponseHaveAssertions(postmanResponse, false);
  const notHaveAssertions = createResponseHaveAssertions(postmanResponse, true);
  const api = {
    ...postmanResponse,
    to: {
      be: {
        ok() {
          assertHttpStatusRange(postmanResponse.code, 200, 299, 'successful');
        },
        success() {
          assertHttpStatusRange(postmanResponse.code, 200, 299, 'successful');
        },
        clientError() {
          assertHttpStatusRange(postmanResponse.code, 400, 499, 'client error');
        },
        serverError() {
          assertHttpStatusRange(postmanResponse.code, 500, 599, 'server error');
        },
        badRequest() {
          assertHttpStatus(postmanResponse.code, 400, 'bad request');
        },
        unauthorized() {
          assertHttpStatus(postmanResponse.code, 401, 'unauthorized');
        },
        forbidden() {
          assertHttpStatus(postmanResponse.code, 403, 'forbidden');
        },
        notFound() {
          assertHttpStatus(postmanResponse.code, 404, 'not found');
        },
        error() {
          const status = Number(postmanResponse.code);
          if (status < 400) {
            throw sandboxError(`Expected response to be an error but received ${postmanResponse.code}.`);
          }
        }
      },
      not: {
        be: {
          error() {
            const status = Number(postmanResponse.code);
            if (status >= 400) {
              throw sandboxError(`Expected response not to be an error but received ${postmanResponse.code}.`);
            }
          }
        },
        have: notHaveAssertions
      },
      have: haveAssertions
    }
  };
  return hardenSandboxValue(api);
}

function createResponseHaveAssertions(postmanResponse, negate = false) {
  const assertResponse = (condition, positiveMessage, negativeMessage) => {
    assertCondition(negate ? !condition : condition, negate ? (negativeMessage || positiveMessage.replace('Expected', 'Expected not')) : positiveMessage);
  };
  return {
    status(expectedStatus) {
      const expectedNumber = Number(expectedStatus);
      const actualText = postmanResponse.status || postmanResponse.reason || httpStatusText(postmanResponse.code);
      const passed = Number.isFinite(expectedNumber) && String(expectedStatus).trim() !== ''
        ? Number(postmanResponse.code) === expectedNumber
        : String(actualText).toLowerCase() === String(expectedStatus || '').toLowerCase();
      assertResponse(
        passed,
        `Expected response status ${expectedStatus} but received ${postmanResponse.code}${actualText ? ` ${actualText}` : ''}.`,
        `Expected response status not to be ${expectedStatus}.`
      );
    },
    header(name, expectedValue) {
      const value = postmanResponse.headers.get(name);
      const exists = value != null;
      const matches = arguments.length <= 1 || String(value) === String(expectedValue);
      assertResponse(exists && matches, exists
        ? `Expected response header ${name} to equal ${expectedValue} but received ${value}.`
        : `Expected response header ${name}.`, `Expected response header ${name} not to match.`);
    },
    body(expectedText) {
      const body = postmanResponse.text();
      const passed = arguments.length === 0 ? Boolean(body) : body.includes(String(expectedText));
      assertResponse(passed, arguments.length === 0 ? 'Expected response body.' : `Expected response body to include ${expectedText}.`);
    },
    jsonBody(path, expectedValue) {
      const payload = postmanResponse.json();
      if (arguments.length === 0) {
        assertResponse(payload !== undefined, 'Expected JSON body.');
        return;
      }
      const value = readJsonPathForScript(payload, path);
      const passed = arguments.length === 1 ? value != null && value !== '' : deepEqual(value, expectedValue);
      assertResponse(passed, arguments.length === 1
        ? `Expected JSON body path ${path} to exist.`
        : `Expected JSON body path ${path} to equal ${safeJsonStringify(expectedValue)}.`);
    },
    jsonSchema(schema, options = {}) {
      assertJsonSchema(postmanResponse.json(), schema, options, 'response JSON', negate);
    },
    responseTime: createResponseTimeAssertion(postmanResponse.responseTime, negate),
    metadata(name, expectedValue) {
      assertPropertyListContains(postmanResponse.metadata, name, expectedValue, arguments.length, 'response metadata', negate);
    },
    trailer(name, expectedValue) {
      assertPropertyListContains(postmanResponse.trailers, name, expectedValue, arguments.length, 'response trailer', negate);
    },
    message(expectedMessage) {
      const messages = postmanResponse.messages.all();
      const passed = arguments.length === 0 ? messages.length > 0 : messages.some((message) => objectIncludesSubset(messageToComparable(message), expectedMessage));
      assertResponse(passed, 'Expected response messages to include matching message.', 'Expected response messages not to include matching message.');
    }
  };
}

function createResponseTimeAssertion(responseTime, negate = false, includeNot = true) {
  const actual = Number(responseTime) || 0;
  const assertTime = (condition, message, negativeMessage) => {
    assertCondition(negate ? !condition : condition, negate ? (negativeMessage || message.replace('Expected', 'Expected not')) : message);
  };
  const api = function responseTimeAssertion(expected) {
    if (arguments.length === 0) {
      assertTime(actual >= 0, `Expected response time to be present but received ${actual}.`);
      return api;
    }
    assertTime(actual === Number(expected), `Expected response time ${expected} but received ${actual}.`, `Expected response time not to equal ${expected}.`);
    return api;
  };
  api.above = api.gt = api.greaterThan = (expected) => {
    assertTime(actual > Number(expected), `Expected response time to be above ${expected} but received ${actual}.`);
    return api;
  };
  api.below = api.lt = api.lessThan = (expected) => {
    assertTime(actual < Number(expected), `Expected response time to be below ${expected} but received ${actual}.`);
    return api;
  };
  api.within = (minimum, maximum) => {
    assertTime(actual >= Number(minimum) && actual <= Number(maximum), `Expected response time to be within ${minimum}..${maximum} but received ${actual}.`);
    return api;
  };
  api.at = hardenSandboxValue({
    least(expected) {
      assertTime(actual >= Number(expected), `Expected response time to be at least ${expected} but received ${actual}.`);
      return api;
    },
    most(expected) {
      assertTime(actual <= Number(expected), `Expected response time to be at most ${expected} but received ${actual}.`);
      return api;
    }
  });
  if (includeNot) {
    api.not = createResponseTimeAssertion(responseTime, !negate, false);
  }
  return hardenSandboxValue(api);
}

function createPostmanResponse(response = {}, options = {}) {
  const normalized = normalizePostmanResponse(response);
  const headers = createPostmanHeaderList(normalized.headers);
  const cookies = createPostmanCookieList(normalized.cookies);
  const metadata = createPostmanPropertyList(normalized.metadata);
  const trailers = createPostmanPropertyList(normalized.trailers);
  const messages = createPostmanPropertyList(normalized.messages, {
    itemFactory: (message, onChange) => createPostmanMessage(message, onChange, options),
    toJSONItem: messageToJSON
  });
  const api = {
    code: normalized.code,
    status: normalized.status,
    reason: normalized.reason,
    responseTime: normalized.responseTime,
    responseSize: normalized.responseSize,
    url: normalized.url,
    headers,
    cookies,
    metadata,
    trailers,
    messages,
    json() {
      try {
        return hardenSandboxValue(JSON.parse(normalized.body || ''));
      } catch (error) {
        throw sandboxError(errorMessage(error));
      }
    },
    text() {
      return normalized.body;
    },
    size() {
      return normalized.responseSize;
    },
    clone() {
      return createPostmanResponse(api.toJSON());
    },
    toJSON() {
      return hardenSandboxValue({
        code: normalized.code,
        status: normalized.status,
        reason: normalized.reason,
        header: headers.toJSON(),
        body: normalized.body,
        responseTime: normalized.responseTime,
        responseSize: normalized.responseSize,
        url: normalized.url,
        cookie: cookies.toJSON(),
        metadata: metadata.toJSON(),
        trailers: trailers.toJSON(),
        messages: messages.toJSON()
      });
    }
  };
  return hardenSandboxValue(api);
}

function normalizePostmanResponse(response = {}) {
  const code = Number(response.code ?? response.statusCode ?? response.status ?? 0) || 0;
  const body = response.body == null ? '' : Buffer.isBuffer(response.body) ? response.body.toString('utf8') : String(response.body);
  const reason = response.reason || response.statusText || httpStatusText(code);
  const status = response.status && Number(response.status) !== code ? String(response.status) : reason;
  const headers = headersFromAny(response.header || response.headers || []);
  const responseSize = Number.isFinite(Number(response.responseSize))
    ? Number(response.responseSize)
    : Number.isFinite(Number(response.responseBytes))
      ? Number(response.responseBytes)
      : Buffer.byteLength(body, 'utf8');
  return {
    body,
    code,
    cookies: normalizeResponseCookies(response.cookies || response.cookie || [], headers),
    headers,
    messages: normalizeSdkListInput(response.messages || []),
    metadata: normalizeSdkListInput(response.metadata || []),
    reason,
    responseSize,
    responseTime: Number(response.responseTime ?? response.durationMillis ?? 0) || 0,
    status,
    trailers: normalizeSdkListInput(response.trailers || response.trailer || []),
    url: response.url || response.finalUrl || ''
  };
}

function normalizeResponseCookies(cookies, headers) {
  const existing = normalizeSdkListInput(cookies);
  const setCookieHeaders = [];
  for (const header of headers || []) {
    if (String(header?.key || '').toLowerCase() === 'set-cookie') {
      for (const value of String(header.value || '').split(/,(?=[^;,]+=)/)) {
        setCookieHeaders.push(value);
      }
    }
  }
  return [...existing, ...setCookieHeaders.map(normalizeSdkCookie)].filter((cookie) => cookie.name || cookie.key);
}

function httpStatusText(code) {
  const statuses = {
    100: 'Continue',
    101: 'Switching Protocols',
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  return statuses[Number(code)] || String(code || '');
}

function pairListApi(pairs) {
  return hardenSandboxValue({
    get(name) {
      const target = String(name || '').toLowerCase();
      const pair = pairs.find((item) => item.enabled !== false && String(item.key || '').toLowerCase() === target);
      return pair ? pair.value ?? '' : undefined;
    },
    has(name) {
      return this.get(name) != null;
    },
    all() {
      return hardenSandboxValue(pairs.filter((item) => item.enabled !== false).map((item) => ({ key: item.key, value: item.value ?? '' })));
    },
    each(callback) {
      if (typeof callback !== 'function') {
        return;
      }
      for (const pair of this.all()) {
        callback(pair);
      }
    },
    toObject() {
      const object = createSafePlainObject();
      for (const pair of this.all()) {
        setSafeObjectProperty(object, pair.key, pair.value);
      }
      return hardenSandboxValue(object);
    }
  });
}

function responseHeaderApi(headers) {
  return hardenSandboxValue({
    get(name) {
      return responseHeaderValue(headers, name);
    },
    has(name) {
      return responseHeaderValue(headers, name) != null;
    },
    all() {
      return hardenSandboxValue(Object.entries(headers).map(([key, values]) => ({
        key,
        value: Array.isArray(values) ? values.join(', ') : String(values ?? '')
      })));
    },
    each(callback) {
      if (typeof callback !== 'function') {
        return;
      }
      for (const header of this.all()) {
        callback(header);
      }
    },
    toObject() {
      const object = createSafePlainObject();
      for (const header of this.all()) {
        setSafeObjectProperty(object, header.key, header.value);
      }
      return hardenSandboxValue(object);
    }
  });
}

function responseHeaderValue(headers, name) {
  const target = String(name || '').toLowerCase();
  for (const [key, values] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) {
      return Array.isArray(values) ? values.join(', ') : String(values ?? '');
    }
  }
  return undefined;
}

function assertHttpStatus(actualStatus, expectedStatus, label) {
  if (Number(actualStatus) !== Number(expectedStatus)) {
    throw sandboxError(`Expected response to be ${label} (${expectedStatus}) but received ${actualStatus}.`);
  }
}

function assertHttpStatusRange(actualStatus, minimum, maximum, label) {
  const status = Number(actualStatus);
  if (status < minimum || status > maximum) {
    throw sandboxError(`Expected response to be ${label} (${minimum}-${maximum}) but received ${actualStatus}.`);
  }
}

function readJsonPathForScript(value, path) {
  const text = String(path || '').trim();
  if (!text || text === '$') {
    return value;
  }
  const withoutRoot = text.startsWith('$.') ? text.slice(2) : text.replace(/^\$/, '');
  return withoutRoot
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .reduce((current, part) => current == null ? undefined : current[part], value);
}

function assertJsonSchema(value, schema, options = {}, label = 'value', negate = false) {
  const Ajv = createAjvPackage();
  const ajv = new Ajv(options);
  const valid = ajv.validate(schema, value);
  assertCondition(
    negate ? !valid : valid,
    negate
      ? `Expected ${label} not to match schema.`
      : `Expected ${label} to match schema: ${ajv.errorsText(ajv.errors)}.`
  );
}

function expect(actual) {
  return createExpectation(actual);
}

function createExpectation(actual, flags = {}) {
  const chain = {};
  const withFlag = (name, value = true) => createExpectation(actual, { ...flags, [name]: value });
  const assertFlag = (condition, positiveMessage, negativeMessage) => {
    assertCondition(
      flags.negate ? !condition : condition,
      flags.negate ? (negativeMessage || positiveMessage.replace('Expected', 'Expected not')) : positiveMessage
    );
  };
  for (const word of ['and', 'to', 'be', 'been', 'is', 'that', 'which', 'have', 'has', 'with', 'at', 'of', 'same', 'but', 'does', 'still', 'also']) {
    Object.defineProperty(chain, word, { get() { return chain; } });
  }
  Object.defineProperties(chain, {
    not: { get() { return createExpectation(actual, { ...flags, negate: !flags.negate }); } },
    deep: { get() { return withFlag('deep'); } },
    nested: { get() { return withFlag('nested'); } },
    own: { get() { return withFlag('own'); } },
    ordered: { get() { return withFlag('ordered'); } },
    any: { get() { return withFlag('any'); } },
    all: { get() { return withFlag('all'); } },
    exist: { get() { assertFlag(actual != null, `Expected ${formatExpectedValue(actual)} to exist.`, `Expected ${formatExpectedValue(actual)} not to exist.`); return chain; } },
    ok: { get() { assertFlag(Boolean(actual), `Expected ${formatExpectedValue(actual)} to be truthy.`, `Expected ${formatExpectedValue(actual)} to be falsy.`); return chain; } },
    true: { get() { assertFlag(actual === true, `Expected ${formatExpectedValue(actual)} to be true.`, `Expected ${formatExpectedValue(actual)} not to be true.`); return chain; } },
    false: { get() { assertFlag(actual === false, `Expected ${formatExpectedValue(actual)} to be false.`, `Expected ${formatExpectedValue(actual)} not to be false.`); return chain; } },
    undefined: { get() { assertFlag(actual === undefined, `Expected ${formatExpectedValue(actual)} to be undefined.`, `Expected ${formatExpectedValue(actual)} not to be undefined.`); return chain; } },
    null: { get() { assertFlag(actual === null, `Expected ${formatExpectedValue(actual)} to be null.`, `Expected ${formatExpectedValue(actual)} not to be null.`); return chain; } },
    empty: { get() { assertFlag(isEmpty(actual), `Expected ${formatExpectedValue(actual)} to be empty.`, `Expected ${formatExpectedValue(actual)} not to be empty.`); return chain; } },
    finite: { get() { assertFlag(Number.isFinite(actual), `Expected ${formatExpectedValue(actual)} to be finite.`, `Expected ${formatExpectedValue(actual)} not to be finite.`); return chain; } },
    NaN: { get() { assertFlag(Number.isNaN(actual), `Expected ${formatExpectedValue(actual)} to be NaN.`, `Expected ${formatExpectedValue(actual)} not to be NaN.`); return chain; } },
    arguments: { get() { assertFlag(Object.prototype.toString.call(actual) === '[object Arguments]', 'Expected value to be arguments.', 'Expected value not to be arguments.'); return chain; } },
    extensible: { get() { assertFlag(actual != null && Object.isExtensible(Object(actual)), 'Expected value to be extensible.', 'Expected value not to be extensible.'); return chain; } },
    sealed: { get() { assertFlag(actual != null && Object.isSealed(Object(actual)), 'Expected value to be sealed.', 'Expected value not to be sealed.'); return chain; } },
    frozen: { get() { assertFlag(actual != null && Object.isFrozen(Object(actual)), 'Expected value to be frozen.', 'Expected value not to be frozen.'); return chain; } }
  });
  chain.equal = (expected) => {
    const passed = flags.deep ? deepEqual(actual, expected) : Object.is(actual, expected);
    assertFlag(passed, `Expected ${formatExpectedValue(actual)} to equal ${formatExpectedValue(expected)}.`, `Expected ${formatExpectedValue(actual)} not to equal ${formatExpectedValue(expected)}.`);
    return chain;
  };
  chain.equals = chain.equal;
  chain.eq = chain.equal;
  chain.eql = (expected) => {
    assertFlag(deepEqual(actual, expected), `Expected ${formatExpectedValue(actual)} to deeply equal ${formatExpectedValue(expected)}.`, `Expected ${formatExpectedValue(actual)} not to deeply equal ${formatExpectedValue(expected)}.`);
    return chain;
  };
  chain.eqls = chain.eql;
  chain.above = chain.gt = chain.greaterThan = (expected) => {
    assertFlag(Number(actual) > Number(expected), `Expected ${actual} to be above ${expected}.`, `Expected ${actual} not to be above ${expected}.`);
    return chain;
  };
  chain.below = chain.lt = chain.lessThan = (expected) => {
    assertFlag(Number(actual) < Number(expected), `Expected ${actual} to be below ${expected}.`, `Expected ${actual} not to be below ${expected}.`);
    return chain;
  };
  chain.least = chain.gte = (expected) => {
    assertFlag(Number(actual) >= Number(expected), `Expected ${actual} to be at least ${expected}.`, `Expected ${actual} to be below ${expected}.`);
    return chain;
  };
  chain.most = chain.lte = (expected) => {
    assertFlag(Number(actual) <= Number(expected), `Expected ${actual} to be at most ${expected}.`, `Expected ${actual} to be above ${expected}.`);
    return chain;
  };
  chain.within = (minimum, maximum) => {
    const number = Number(actual);
    assertFlag(number >= Number(minimum) && number <= Number(maximum), `Expected ${actual} to be within ${minimum}..${maximum}.`, `Expected ${actual} not to be within ${minimum}..${maximum}.`);
    return chain;
  };
  chain.match = (pattern) => {
    assertFlag(testPattern(pattern, actual), `Expected ${actual} to match ${pattern}.`, `Expected ${actual} not to match ${pattern}.`);
    return chain;
  };
  chain.oneOf = (values) => {
    const passed = Array.isArray(values) && values.some((value) => flags.deep ? deepEqual(value, actual) : Object.is(value, actual));
    assertFlag(passed, `Expected ${formatExpectedValue(actual)} to be one of ${formatExpectedValue(values)}.`, `Expected ${formatExpectedValue(actual)} not to be one of ${formatExpectedValue(values)}.`);
    return chain;
  };
  chain.a = chain.an = (typeName) => {
    const passed = matchesType(actual, typeName);
    assertFlag(passed, `Expected type ${String(typeName || '').toLowerCase()} but received ${actualTypeName(actual)}.`, `Expected ${formatExpectedValue(actual)} not to be a ${typeName}.`);
    return chain;
  };
  chain.lengthOf = (expectedLength) => {
    assertFlag(actual != null && actual.length === Number(expectedLength), `Expected length ${expectedLength} but received ${actual?.length}.`, `Expected length not to be ${expectedLength}.`);
    return chain;
  };
  chain.length = chain.lengthOf;
  Object.defineProperty(chain, 'lengthOf', { value: chain.lengthOf, configurable: true, writable: true });
  chain.property = function property(name, expectedValue) {
    const result = readExpectationProperty(actual, name, flags);
    assertFlag(result.exists, `Expected object to have property ${name}.`, `Expected object not to have property ${name}.`);
    if (arguments.length > 1 && !flags.negate) {
      const passed = flags.deep ? deepEqual(result.value, expectedValue) : Object.is(result.value, expectedValue);
      assertCondition(passed, `Expected property ${name} to equal ${formatExpectedValue(expectedValue)}.`);
    }
    return createExpectation(result.value, flags.deep ? { deep: true } : {});
  };
  chain.ownProperty = chain.haveOwnProperty = (name) => {
    const passed = actual != null && Object.hasOwn(actual, name);
    assertFlag(passed, `Expected object to have own property ${name}.`, `Expected object not to have own property ${name}.`);
    return createExpectation(passed ? actual[name] : undefined, flags.deep ? { deep: true } : {});
  };
  chain.propertyVal = (name, expectedValue) => chain.property(name, expectedValue);
  chain.ownPropertyVal = (name, expectedValue) => {
    const value = actual == null ? undefined : actual[name];
    assertFlag(actual != null && Object.hasOwn(actual, name) && Object.is(value, expectedValue), `Expected object to have own property ${name} with value ${formatExpectedValue(expectedValue)}.`);
    return createExpectation(value, flags.deep ? { deep: true } : {});
  };
  chain.keys = (...expectedKeys) => {
    const keys = expectedKeys.flat().map(String);
    const actualKeys = actual && typeof actual === 'object' ? Object.keys(actual) : [];
    const passed = flags.any
      ? keys.some((key) => actualKeys.includes(key))
      : keys.every((key) => actualKeys.includes(key)) && (flags.all ? actualKeys.every((key) => keys.includes(key)) : true);
    assertFlag(passed, `Expected object to have keys ${keys.join(', ')}.`, `Expected object not to have keys ${keys.join(', ')}.`);
    return chain;
  };
  chain.members = (expectedValues) => {
    assertArrayMembers(actual, expectedValues, flags.negate, flags);
    return chain;
  };
  chain.satisfy = (predicate) => {
    assertCondition(typeof predicate === 'function', 'Expected satisfy to receive a predicate function.');
    const passed = Boolean(predicate(actual));
    assertFlag(passed, `Expected ${formatExpectedValue(actual)} to satisfy predicate.`, `Expected ${formatExpectedValue(actual)} not to satisfy predicate.`);
    return chain;
  };
  chain.closeTo = chain.approximately = (expected, delta) => {
    const passed = Math.abs(Number(actual) - Number(expected)) <= Number(delta);
    assertFlag(passed, `Expected ${actual} to be close to ${expected} +/- ${delta}.`, `Expected ${actual} not to be close to ${expected} +/- ${delta}.`);
    return chain;
  };
  chain.instanceOf = chain.instanceof = (constructor) => {
    assertCondition(typeof constructor === 'function', 'Expected instanceOf to receive a constructor.');
    assertFlag(actual instanceof constructor, `Expected value to be instance of ${constructor.name || 'constructor'}.`, `Expected value not to be instance of ${constructor.name || 'constructor'}.`);
    return chain;
  };
  chain.respondTo = (method) => {
    const target = flags.itself ? actual : actual?.prototype || actual;
    assertFlag(target != null && typeof target[method] === 'function', `Expected value to respond to ${method}.`, `Expected value not to respond to ${method}.`);
    return chain;
  };
  Object.defineProperty(chain, 'itself', { get() { return withFlag('itself'); } });
  chain.jsonSchema = (schema, options = {}) => {
    assertJsonSchema(actual, schema, options, 'value', flags.negate === true);
    return chain;
  };
  chain.throw = chain.throws = chain.Throw = (expected, message) => {
    assertCondition(typeof actual === 'function', 'Expected target to be a function.');
    let thrown;
    try {
      actual();
    } catch (error) {
      thrown = error;
    }
    let passed = thrown !== undefined;
    if (passed && expected != null) {
      passed = thrownMatchesExpectation(thrown, expected);
    }
    assertFlag(passed, message || `Expected function ${flags.negate ? 'not ' : ''}to throw${expected ? ` ${formatExpectedValue(expected)}` : ''}.`);
    return thrown === undefined ? chain : createExpectation(thrown, {});
  };
  const includeFn = (expected) => {
    assertIncludes(actual, expected, flags.negate, flags);
    return chain;
  };
  includeFn.members = (expectedValues) => {
    assertArrayMembers(actual, expectedValues, flags.negate, { ...flags, contains: true });
    return chain;
  };
  includeFn.keys = (...keys) => {
    return createExpectation(actual, { ...flags }).keys(...keys);
  };
  includeFn.property = (...args) => {
    return createExpectation(actual, { ...flags }).property(...args);
  };
  Object.defineProperty(includeFn, 'ordered', {
    get() {
      return hardenSandboxValue({
        members(expectedValues) {
          assertArrayMembers(actual, expectedValues, flags.negate, { ...flags, contains: true, ordered: true });
          return chain;
        }
      });
    }
  });
  chain.include = chain.includes = chain.contain = chain.contains = hardenSandboxValue(includeFn);
  return hardenSandboxValue(chain);
}

function readExpectationProperty(actual, name, flags = {}) {
  if (actual == null) {
    return { exists: false, value: undefined };
  }
  if (flags.nested) {
    const value = readJsonPathForScript(actual, String(name || ''));
    return { exists: value !== undefined, value };
  }
  const exists = flags.own
    ? Object.hasOwn(actual, name)
    : name in Object(actual);
  return { exists, value: exists ? actual[name] : undefined };
}

function thrownMatchesExpectation(error, expected) {
  if (typeof expected === 'string') {
    return errorMessage(error).includes(expected);
  }
  if (expected instanceof RegExp || Object.prototype.toString.call(expected) === '[object RegExp]') {
    return expected.test(errorMessage(error));
  }
  if (typeof expected === 'function') {
    return error instanceof expected || error?.name === expected.name;
  }
  return deepEqual(error, expected);
}

function formatExpectedValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  return safeJsonStringify(value);
}

function deepEqual(left, right) {
  return lodashIsEqual(left, right);
}

function assertIncludes(actual, expected, negate, flags = {}) {
  let includes = false;
  if (Array.isArray(actual)) {
    includes = actual.some((value) => flags.deep ? deepEqual(value, expected) : Object.is(value, expected));
  } else if (actual && typeof actual === 'object') {
    includes = Object.entries(expected || {}).every(([key, value]) => {
      const actualValue = actual[key];
      return flags.deep ? deepEqual(actualValue, value) : Object.is(actualValue, value);
    });
  } else {
    includes = String(actual ?? '').includes(String(expected ?? ''));
  }
  assertCondition(
    negate ? !includes : includes,
    `Expected ${safeJsonStringify(actual)} ${negate ? 'not ' : ''}to include ${safeJsonStringify(expected)}.`
  );
}

function assertArrayMembers(actual, expectedValues, negate, flags = {}) {
  assertCondition(Array.isArray(actual), 'Expected value to be an array.');
  assertCondition(Array.isArray(expectedValues), 'Expected members to be provided as an array.');
  const compare = flags.deep ? deepEqual : Object.is;
  let includesAll;
  if (flags.ordered && flags.contains) {
    includesAll = expectedValues.every((expected, index) => index < actual.length && compare(actual[index], expected));
  } else {
    includesAll = expectedValues.every((expected) => actual.some((value) => compare(value, expected)));
  }
  const exact = flags.contains === true
    ? includesAll
    : includesAll && actual.every((value) => expectedValues.some((expected) => compare(value, expected)));
  assertCondition(
    negate ? !exact : exact,
    `Expected ${safeJsonStringify(actual)} ${negate ? 'not ' : ''}to include members ${safeJsonStringify(expectedValues)}.`
  );
}

function assertType(actual, typeName) {
  assertCondition(matchesType(actual, typeName), `Expected type ${String(typeName || '').toLowerCase()} but received ${actualTypeName(actual)}.`);
}

function matchesType(actual, typeName) {
  const expected = String(typeName || '').toLowerCase();
  if (expected === 'array') {
    return Array.isArray(actual);
  }
  if (expected === 'regexp' || expected === 'regex') {
    return actual instanceof RegExp || Object.prototype.toString.call(actual) === '[object RegExp]';
  }
  if (expected === 'date') {
    return actual instanceof Date || Object.prototype.toString.call(actual) === '[object Date]';
  }
  if (expected === 'null') {
    return actual === null;
  }
  if (expected === 'undefined') {
    return actual === undefined;
  }
  if (expected === 'error') {
    return actual instanceof Error || Object.prototype.toString.call(actual).endsWith('Error]');
  }
  if (expected === 'promise') {
    return actual && typeof actual.then === 'function';
  }
  if (expected === 'map') {
    return actual instanceof Map || Object.prototype.toString.call(actual) === '[object Map]';
  }
  if (expected === 'set') {
    return actual instanceof Set || Object.prototype.toString.call(actual) === '[object Set]';
  }
  return typeof actual === expected;
}

function actualTypeName(actual) {
  if (Array.isArray(actual)) {
    return 'array';
  }
  if (actual === null) {
    return 'null';
  }
  const tag = Object.prototype.toString.call(actual);
  if (tag !== '[object Object]') {
    return tag.slice(8, -1).toLowerCase();
  }
  return typeof actual;
}

function isEmpty(value) {
  if (value == null) {
    return true;
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw sandboxError(message);
  }
}

function sandboxError(message) {
  return String(message || 'Script runtime error.');
}

function errorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  return String(error || 'Script runtime error.');
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw sandboxError(errorMessage(error));
  }
}

function testPattern(pattern, actual) {
  try {
    return new RegExp(pattern).test(String(actual ?? ''));
  } catch (error) {
    throw sandboxError(errorMessage(error));
  }
}

function sandboxThenable(promise) {
  const hostPromise = Promise.resolve(promise);
  const thenable = {
    then(onFulfilled, onRejected) {
      return sandboxThenable(hostPromise.then(
        (value) => {
          const safeValue = hardenSandboxValue(value);
          return typeof onFulfilled === 'function' ? onFulfilled(safeValue) : safeValue;
        },
        (reason) => {
          const safeReason = sandboxError(errorMessage(reason));
          if (typeof onRejected === 'function') {
            return onRejected(safeReason);
          }
          throw safeReason;
        }
      ));
    },
    catch(onRejected) {
      return thenable.then(undefined, onRejected);
    },
    finally(onFinally) {
      return sandboxThenable(hostPromise.finally(() => {
        if (typeof onFinally === 'function') {
          return onFinally();
        }
        return undefined;
      }));
    }
  };
  return hardenSandboxValue(thenable);
}

function hardenSandboxValue(value, seen = new WeakSet()) {
  if (value == null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (isSandboxRealmByteObject(value)) {
    return maskSandboxConstructor(value);
  }

  if (Array.isArray(value)) {
    attachSandboxArrayMethods(value);
  }

  for (const key of Reflect.ownKeys(value)) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      continue;
    }
    if (!descriptor) {
      continue;
    }
    if (Object.hasOwn(descriptor, 'value')) {
      hardenSandboxValue(descriptor.value, seen);
    } else {
      hardenSandboxValue(descriptor.get, seen);
      hardenSandboxValue(descriptor.set, seen);
    }
  }

  if (typeof value === 'function') {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(value, 'prototype');
    if (prototypeDescriptor && Object.hasOwn(prototypeDescriptor, 'value')) {
      hardenSandboxValue(prototypeDescriptor.value, seen);
    }
  }

  try {
    Object.defineProperty(value, 'constructor', {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false
    });
  } catch {
    // Some built-ins expose non-configurable constructor metadata. They are not
    // introduced into the sandbox contract directly.
  }
  try {
    Object.setPrototypeOf(value, null);
  } catch {
    // Non-extensible built-ins are ignored; ordinary script API values are
    // still hardened before entering the vm context.
  }
  return value;
}

function isSandboxRealmByteObject(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const isByteObject = ArrayBuffer.isView(value) || value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]';
  if (!isByteObject) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
  return typeof constructor === 'function' && constructor.constructor !== Function;
}

function attachSandboxArrayMethods(array) {
  defineSandboxArrayMethod(array, 'forEach', (callback, thisArg) => {
    assertArrayCallback(callback, 'forEach');
    for (let index = 0; index < array.length; index++) {
      if (Object.hasOwn(array, index)) {
        Reflect.apply(callback, thisArg, [array[index], index, array]);
      }
    }
  });
  defineSandboxArrayMethod(array, 'map', (callback, thisArg) => {
    assertArrayCallback(callback, 'map');
    const result = [];
    for (let index = 0; index < array.length; index++) {
      if (Object.hasOwn(array, index)) {
        result.push(Reflect.apply(callback, thisArg, [array[index], index, array]));
      }
    }
    return hardenSandboxValue(result);
  });
  defineSandboxArrayMethod(array, 'filter', (callback, thisArg) => {
    assertArrayCallback(callback, 'filter');
    const result = [];
    for (let index = 0; index < array.length; index++) {
      if (Object.hasOwn(array, index) && Reflect.apply(callback, thisArg, [array[index], index, array])) {
        result.push(array[index]);
      }
    }
    return hardenSandboxValue(result);
  });
  defineSandboxArrayMethod(array, 'find', (callback, thisArg) => {
    assertArrayCallback(callback, 'find');
    for (let index = 0; index < array.length; index++) {
      if (Object.hasOwn(array, index) && Reflect.apply(callback, thisArg, [array[index], index, array])) {
        return array[index];
      }
    }
    return undefined;
  });
  defineSandboxArrayMethod(array, 'some', (callback, thisArg) => {
    assertArrayCallback(callback, 'some');
    for (let index = 0; index < array.length; index++) {
      if (Object.hasOwn(array, index) && Reflect.apply(callback, thisArg, [array[index], index, array])) {
        return true;
      }
    }
    return false;
  });
  defineSandboxArrayMethod(array, 'every', (callback, thisArg) => {
    assertArrayCallback(callback, 'every');
    for (let index = 0; index < array.length; index++) {
      if (Object.hasOwn(array, index) && !Reflect.apply(callback, thisArg, [array[index], index, array])) {
        return false;
      }
    }
    return true;
  });
  defineSandboxArrayMethod(array, 'reduce', function reduce(callback, initialValue) {
    assertArrayCallback(callback, 'reduce');
    let index = 0;
    let accumulator = initialValue;
    if (arguments.length < 2) {
      while (index < array.length && !Object.hasOwn(array, index)) {
        index++;
      }
      if (index >= array.length) {
        throw sandboxError('Reduce of empty array with no initial value.');
      }
      accumulator = array[index++];
    }
    for (; index < array.length; index++) {
      if (Object.hasOwn(array, index)) {
        accumulator = Reflect.apply(callback, undefined, [accumulator, array[index], index, array]);
      }
    }
    return accumulator;
  });
  defineSandboxArrayMethod(array, 'includes', (expected) => {
    for (let index = 0; index < array.length; index++) {
      if (Object.is(array[index], expected) || array[index] === expected) {
        return true;
      }
    }
    return false;
  });
  defineSandboxArrayMethod(array, 'indexOf', (expected) => {
    for (let index = 0; index < array.length; index++) {
      if (Object.is(array[index], expected) || array[index] === expected) {
        return index;
      }
    }
    return -1;
  });
  defineSandboxArrayMethod(array, 'join', (separator = ',') => {
    const parts = [];
    for (let index = 0; index < array.length; index++) {
      parts.push(array[index] == null ? '' : String(array[index]));
    }
    return parts.join(String(separator));
  });
  defineSandboxArrayMethod(array, 'slice', (start, end) => hardenSandboxValue(Array.prototype.slice.call(array, start, end)));
  defineSandboxArrayMethod(array, 'at', (index) => {
    const offset = Number(index) < 0 ? array.length + Number(index) : Number(index);
    return array[offset];
  });
  defineSandboxArrayMethod(array, 'values', () => sandboxArrayIterator(array));
  defineSandboxArrayMethod(array, Symbol.iterator, () => sandboxArrayIterator(array));
}

function defineSandboxArrayMethod(array, name, implementation) {
  if (Object.hasOwn(array, name)) {
    return;
  }
  Object.defineProperty(array, name, {
    configurable: true,
    enumerable: false,
    value: implementation,
    writable: true
  });
}

function assertArrayCallback(callback, methodName) {
  if (typeof callback !== 'function') {
    throw sandboxError(`Array.${methodName} requires a callback function.`);
  }
}

function sandboxArrayIterator(array) {
  let index = 0;
  const iterator = {
    next() {
      if (index >= array.length) {
        return hardenSandboxValue({ done: true, value: undefined });
      }
      return hardenSandboxValue({ done: false, value: array[index++] });
    }
  };
  Object.defineProperty(iterator, Symbol.iterator, {
    configurable: true,
    enumerable: false,
    value() {
      return iterator;
    },
    writable: true
  });
  return hardenSandboxValue(iterator);
}

function createConsole(logs) {
  const timers = new Map();
  let groupDepth = 0;
  const write = (...values) => {
    if (logs.length >= MAX_SCRIPT_LOGS) {
      return;
    }
    const line = `${'  '.repeat(Math.min(groupDepth, 10))}${formatConsoleValues(...values)}`;
    logs.push(line.length > MAX_SCRIPT_LOG_LENGTH ? `${line.slice(0, MAX_SCRIPT_LOG_LENGTH)}...` : line);
  };
  return hardenSandboxValue({
    debug: write,
    error: write,
    group(...values) {
      if (values.length) {
        write(...values);
      }
      groupDepth += 1;
    },
    groupEnd() {
      groupDepth = Math.max(0, groupDepth - 1);
    },
    info: write,
    log: write,
    time(label = 'default') {
      timers.set(String(label || 'default'), Date.now());
    },
    timeEnd(label = 'default') {
      const key = String(label || 'default');
      const started = timers.get(key);
      if (started == null) {
        write(`${key}: 0ms`);
        return;
      }
      timers.delete(key);
      write(`${key}: ${Date.now() - started}ms`);
    },
    trace(...values) {
      write('Trace:', ...values);
    },
    warn: write
  });
}

function normalizeIterationData(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        ...item,
        enabled: item.enabled !== false,
        key: String(item.key || ''),
        value: variableObservableValue(item)
      }))
      .filter((item) => item.key);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, itemValue]) => ({
      enabled: true,
      key,
      value: itemValue == null ? '' : String(itemValue)
    }));
  }
  return [];
}

function boundedScriptResult(result) {
  const safe = {
    passed: result.passed === true,
    tests: Array.isArray(result.tests) ? result.tests.slice(0, MAX_SCRIPT_LOGS).map((test) => ({
      name: truncate(String(test.name || 'Unnamed test'), 256),
      passed: test.passed === true,
      error: truncate(test.error || '', MAX_SCRIPT_LOG_LENGTH),
      skipped: test.skipped === true,
      index: Number.isFinite(Number(test.index)) ? Number(test.index) : undefined
    })) : [],
    error: truncate(result.error || '', MAX_SCRIPT_LOG_LENGTH),
    logs: Array.isArray(result.logs) ? result.logs.slice(0, MAX_SCRIPT_LOGS).map((line) => truncate(line, MAX_SCRIPT_LOG_LENGTH)) : [],
    commitSideEffects: result.commitSideEffects !== false,
    execution: result.execution && typeof result.execution === 'object' ? {
      nextRequest: Object.hasOwn(result.execution, 'nextRequest') ? result.execution.nextRequest : undefined,
      skipRequest: result.execution.skipRequest === true
    } : {},
    request: result.request && typeof result.request === 'object' ? cloneJson(result.request) : undefined,
    mock: result.mock && typeof result.mock === 'object' ? {
      match: result.mock.match && typeof result.mock.match === 'object' ? cloneJson(result.mock.match) : {},
      response: result.mock.response && typeof result.mock.response === 'object' ? {
        statusCode: normalizeMockStatusCode(result.mock.response.statusCode),
        headers: normalizeMockResponseHeaders(result.mock.response.headers),
        body: truncate(result.mock.response.body || '', MAX_MOCK_RESPONSE_BODY_LENGTH)
      } : undefined,
      selectedExampleId: truncate(result.mock.selectedExampleId || '', 256)
    } : undefined,
    visualizer: result.visualizer && typeof result.visualizer === 'object' ? {
      assets: boundedVisualizerAssets(result.visualizer.assets),
      data: result.visualizer.data == null ? {} : cloneJson(result.visualizer.data),
      html: truncate(result.visualizer.html || '', MAX_VISUALIZER_HTML_LENGTH),
      interactive: result.visualizer.interactive === true,
      template: truncate(result.visualizer.template || '', MAX_VISUALIZER_TEMPLATE_LENGTH)
    } : undefined
  };
  const size = Buffer.byteLength(JSON.stringify(safe), 'utf8');
  if (size > MAX_SCRIPT_RESULT_BYTES) {
    return {
      passed: false,
      tests: [],
      error: 'Script result exceeded the maximum allowed size.',
      logs: [],
      commitSideEffects: false,
      execution: {}
    };
  }
  return safe;
}

function boundedVisualizerAssets(assets) {
  if (!Array.isArray(assets)) {
    return [];
  }
  return assets.slice(0, MAX_VISUALIZER_ASSETS).map((asset) => {
    const source = String(asset?.source || '');
    const integrity = String(asset?.integrity || '');
    const name = String(asset?.name || '').slice(0, 64);
    return {
      integrity,
      name,
      source,
      type: asset?.type === 'style' ? 'style' : 'script'
    };
  }).filter((asset) => asset.name
    && asset.source
    && Buffer.byteLength(asset.source, 'utf8') <= MAX_VISUALIZER_ASSET_BYTES
    && asset.integrity === scriptPackageIntegrity(asset.source));
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function formatLogValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatConsoleValues(...values) {
  if (!values.length) {
    return '';
  }
  const first = values[0];
  if (typeof first !== 'string') {
    return values.map(formatLogValue).join(' ');
  }
  let index = 1;
  const formatted = first.replace(/%[sdifjoO%]/g, (token) => {
    if (token === '%%') {
      return '%';
    }
    if (index >= values.length) {
      return token;
    }
    const value = values[index++];
    if (token === '%d' || token === '%i') {
      return String(Number.parseInt(value, 10));
    }
    if (token === '%f') {
      return String(Number.parseFloat(value));
    }
    if (token === '%j' || token === '%o' || token === '%O') {
      return formatLogValue(value);
    }
    return String(value);
  });
  const rest = values.slice(index).map(formatLogValue);
  return [formatted, ...rest].filter((part) => part !== '').join(' ');
}

function safeStructuredClone(value) {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new value.constructor(value);
  }
  if (value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
    return value.slice(0);
  }
  try {
    return globalThis.structuredClone(value);
  } catch {
    return cloneJson(value);
  }
}

function replaceVariables(value, ...scopes) {
  return String(value ?? '').replace(/\{\{\s*([$A-Za-z0-9_.-]+)\s*}}|\$\{\s*([$A-Za-z0-9_.-]+)\s*}/g, (match, postmanKey, dollarKey) => {
    const key = postmanKey || dollarKey;
    for (const scope of scopes.slice().reverse()) {
      const replacement = getVariable(scope, key);
      if (replacement != null) {
        return replacement;
      }
    }
    const dynamicValue = resolveDynamicVariable(key);
    if (dynamicValue != null) {
      return String(dynamicValue);
    }
    return match;
  });
}

module.exports = {
  DEFAULT_SCRIPT_TIMEOUT_MILLIS,
  MAX_BROKER_REQUESTS,
  MAX_SCRIPT_LOG_LENGTH,
  MAX_SCRIPT_LOGS,
  MAX_SCRIPT_LENGTH,
  MAX_SCRIPT_RESULT_BYTES,
  MAX_TIMER_DELAY_MILLIS,
  runPostmanScript,
  runPostmanScriptAsync,
  scriptPackageBundleIntegrity,
  scriptPackageIntegrity
};
