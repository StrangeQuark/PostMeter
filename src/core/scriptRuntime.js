const crypto = require('node:crypto');
const vm = require('node:vm');
const {
  getVariable,
  setVariable,
  unsetVariable
} = require('./variableScope');

const DEFAULT_SCRIPT_TIMEOUT_MILLIS = 1000;
const MAX_SCRIPT_LENGTH = 256 * 1024;
const MAX_SCRIPT_LOGS = 100;
const MAX_SCRIPT_LOG_LENGTH = 4096;
const MAX_SCRIPT_RESULT_BYTES = 1024 * 1024;
const MAX_PENDING_TIMERS = 64;
const MAX_TIMER_DELAY_MILLIS = 30_000;
const MAX_BROKER_REQUESTS = 32;
const MAX_VISUALIZER_TEMPLATE_LENGTH = 64 * 1024;
const MAX_VISUALIZER_DATA_BYTES = 256 * 1024;
const MAX_VISUALIZER_HTML_LENGTH = 256 * 1024;
const MAX_VISUALIZER_EACH_ITEMS = 500;
const MAX_VISUALIZER_TEMPLATE_DEPTH = 5;
const VISUALIZER_VALUE_PATTERN = '[A-Za-z0-9_@./-]+';
const VISUALIZER_UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);
const VISUALIZER_BLOCK_HELPERS = new Set(['each', 'if', 'unless', 'with']);
const SCRIPT_PACKAGE_DEFINITIONS = Object.freeze({
  ajv: Object.freeze({ factory: createAjvPackage, maxExportKeys: 4 }),
  chai: Object.freeze({ factory: createChaiPackage, maxExportKeys: 3 }),
  cheerio: Object.freeze({ factory: createCheerioPackage, maxExportKeys: 2 }),
  'crypto-js': Object.freeze({ factory: createCryptoJsPackage, maxExportKeys: 8 }),
  'csv-parse/lib/sync': Object.freeze({ factory: createCsvParseSyncPackage, maxExportKeys: 2 }),
  lodash: Object.freeze({ factory: createLodashPackage, maxExportKeys: 32 }),
  moment: Object.freeze({ factory: createMomentPackage, maxExportKeys: 8 }),
  'postman-collection': Object.freeze({ factory: createPostmanCollectionPackage, maxExportKeys: 16 }),
  uuid: Object.freeze({ factory: createUuidPackage, maxExportKeys: 4 }),
  xml2js: Object.freeze({ factory: createXml2jsPackage, maxExportKeys: 6 })
});
const SCRIPT_PACKAGE_NAMES = Object.freeze(Object.keys(SCRIPT_PACKAGE_DEFINITIONS).sort());
const SCRIPT_PACKAGE_ALIASES = new Map([
  ['_', 'lodash'],
  ['cryptojs', 'crypto-js'],
  ['csv-parse/sync', 'csv-parse/lib/sync']
]);
const WORD_ARRAY_BYTES = new WeakMap();
const MOMENT_INSTANCES = new WeakSet();

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
  const packageRegistry = createPackageRegistryState();
  const scriptRequire = packageRequireApi(packageRegistry);
  const environmentVariables = context.environment?.variables || [];
  const collectionVariables = context.collectionVariables || [];
  const globals = context.globals || [];
  const localVariables = context.localVariables || [];
  const sandbox = {
    pm: createPmApi({
      collectionVariables,
      environmentVariables,
      globals,
      localVariables,
      logs,
      request: context.request,
      response: context.response,
      tests,
      packageRegistry,
      visualizer
    }),
    _: scriptRequire('lodash'),
    CryptoJS: scriptRequire('crypto-js'),
    console: createConsole(logs),
    Buffer: unsupportedApi('Buffer'),
    WebSocket: unsupportedApi('WebSocket'),
    XMLHttpRequest: unsupportedApi('XMLHttpRequest'),
    clearInterval: unsupportedApi('clearInterval'),
    clearTimeout: unsupportedApi('clearTimeout'),
    fetch: unsupportedApi('fetch'),
    process: unsupportedApi('process'),
    require: scriptRequire,
    setInterval: unsupportedApi('setInterval'),
    setTimeout: unsupportedApi('setTimeout')
  };
  hardenSandboxValue(sandbox);
  const vmContext = vm.createContext(sandbox, {
    codeGeneration: {
      strings: false,
      wasm: false
    },
    name: 'postmeter-script'
  });

  try {
    const script = new vm.Script(`'use strict';\n${source}`, {
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
  const packageRegistry = createPackageRegistryState();
  const scriptRequire = packageRequireApi(packageRegistry);
  const fatalErrors = [];
  const execution = {};
  const mutableRequest = cloneJson(context.request || {});
  const environmentVariables = context.environment?.variables || [];
  const collectionVariables = context.collectionVariables || [];
  const localVariables = context.localVariables || [];
  const globals = context.globals || [];
  const iterationData = normalizeIterationData(context.iterationData);
  const tracker = createAsyncTracker({
    broker: options.broker,
    fatalErrors,
    timeoutMillis: Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS)
  });
  const sandbox = {
    pm: createAsyncPmApi({
      broker: options.broker,
      collectionVariables,
      environmentVariables,
      execution,
      globals,
      iteration: context.iteration,
      iterationCount: context.iterationCount,
      iterationData,
      localVariables,
      logs,
      request: mutableRequest,
      response: context.response,
      tests,
      tracker,
      packageRegistry,
      visualizer
    }),
    _: scriptRequire('lodash'),
    CryptoJS: scriptRequire('crypto-js'),
    console: createConsole(logs),
    clearInterval: unsupportedApi('clearInterval'),
    clearTimeout: tracker.clearTimeout,
    setInterval: unsupportedApi('setInterval'),
    setTimeout: tracker.setTimeout,
    Buffer: unsupportedApi('Buffer'),
    WebSocket: unsupportedApi('WebSocket'),
    XMLHttpRequest: unsupportedApi('XMLHttpRequest'),
    fetch: unsupportedApi('fetch'),
    process: unsupportedApi('process'),
    require: scriptRequire
  };
  hardenSandboxValue(sandbox);
  const vmContext = vm.createContext(sandbox, {
    codeGeneration: {
      strings: false,
      wasm: false
    },
    name: 'postmeter-script'
  });

  try {
    const script = new vm.Script(`'use strict';\n${source}`, {
      filename: options.filename || 'postmeter-script.js'
    });
    script.runInContext(vmContext, {
      timeout: Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS)
    });
    await tracker.waitForIdle();
  } catch (error) {
    return boundedScriptResult({
      passed: false,
      tests,
      error: error.message || String(error),
      logs,
      commitSideEffects: false,
      execution,
      request: mutableRequest,
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
    visualizer: visualizerResult(visualizer)
  });
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
    fatalErrors.push(error?.message || String(error));
  };

  const runCallback = async (callback, args = []) => {
    try {
      const value = callback(...args);
      if (value && typeof value.then === 'function') {
        await value;
      }
    } catch (error) {
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

  const clearTimeoutForScript = (id) => {
    const timer = timers.get(Number(id));
    if (!timer) {
      return;
    }
    timer.cancelled = true;
    timers.delete(Number(id));
    brokerRequest('clearTimer', { timerId: timer.id }).catch(() => {});
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
    clearTimeout: clearTimeoutForScript,
    recordFatal,
    setTimeout: setTimeoutForScript,
    track,
    waitForIdle
  };
}

function sleepForRuntime(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createAsyncPmApi({
  broker,
  collectionVariables,
  environmentVariables,
  execution,
  globals,
  iteration,
  iterationCount,
  iterationData,
  localVariables,
  logs,
  packageRegistry,
  request,
  response,
  tests,
  tracker,
  visualizer
}) {
  const api = {
    collectionVariables: variableApi(collectionVariables),
    cookies: brokerCookieApi({ broker, tracker }),
    environment: variableApi(environmentVariables),
    execution: executionApi({
      collectionVariables,
      environmentVariables,
      execution,
      globals,
      tests,
      tracker
    }),
    expect,
    globals: variableApi(globals),
    info: {
      eventName: response ? 'test' : 'prerequest',
      iteration: Number.isFinite(Number(iteration)) ? Number(iteration) : 0,
      iterationCount: Number.isFinite(Number(iterationCount)) ? Number(iterationCount) : 1,
      requestId: request?.id || '',
      requestName: request?.name || ''
    },
    iterationData: readOnlyVariableApi(iterationData),
    require: packageRequireApi(packageRegistry),
    request: mutableRequestApi(request),
    response: responseApi(response),
    sendRequest(input, callback) {
      const promise = tracker.brokerRequest('sendRequest', { request: input })
        .then((result) => {
          const scriptResponse = responseApi(result);
          if (typeof callback === 'function') {
            callback(null, scriptResponse);
          }
          return scriptResponse;
        })
        .catch((error) => {
          const safeError = sandboxError(errorMessage(error));
          if (typeof callback === 'function') {
            callback(safeError);
            return undefined;
          }
          throw safeError;
        });
      tracker.track(promise.catch(() => {}));
      return sandboxThenable(promise);
    },
    test(name, fn) {
      const testName = String(name || 'Unnamed test');
      if (typeof fn !== 'function') {
        tests.push({ name: testName, passed: false, error: 'pm.test requires a callback function.' });
        return;
      }
      const run = async () => {
        try {
          if (fn.length > 0) {
            await new Promise((resolve, reject) => {
              let settled = false;
              const done = (error) => {
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
                const value = fn(done);
                if (value && typeof value.then === 'function') {
                  value.then(() => done(), done);
                }
              } catch (error) {
                reject(error);
              }
            });
          } else {
            const value = fn();
            if (value && typeof value.then === 'function') {
              await value;
            }
          }
          tests.push({ name: testName, passed: true, error: '' });
        } catch (error) {
          tests.push({ name: testName, passed: false, error: errorMessage(error) });
        }
      };
      tracker.track(run());
    },
    variables: {
      get(key) {
        const localValue = getVariable(localVariables, key);
        if (localValue != null) {
          return localValue;
        }
        const iterationValue = getVariable(iterationData, key);
        if (iterationValue != null) {
          return iterationValue;
        }
        const envValue = getVariable(environmentVariables, key);
        if (envValue != null) {
          return envValue;
        }
        const collectionValue = getVariable(collectionVariables, key);
        return collectionValue == null ? getVariable(globals, key) : collectionValue;
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
        return replaceVariables(value, globals, collectionVariables, environmentVariables, iterationData, localVariables);
      },
      toObject() {
        const object = createSafePlainObject();
        for (const source of [globals, collectionVariables, environmentVariables, iterationData, localVariables]) {
          for (const variable of source || []) {
            if (variable.enabled !== false && variable.key) {
              setSafeObjectProperty(object, variable.key, variable.value ?? '');
            }
          }
        }
        return hardenSandboxValue(object);
      }
    },
    vault: brokerVaultApi({ broker, tracker }),
    visualizer: visualizerApi(visualizer)
  };
  api.console = createConsole(logs);
  return hardenSandboxValue(api);
}

function createPmApi({ collectionVariables, environmentVariables, globals = [], localVariables, logs, packageRegistry, request, response, tests, visualizer }) {
  const api = {
    collectionVariables: variableApi(collectionVariables),
    cookies: unsupportedApi('pm.cookies'),
    environment: variableApi(environmentVariables),
    execution: unsupportedApi('pm.execution'),
    expect,
    globals: variableApi(globals),
    iterationData: unsupportedApi('pm.iterationData'),
    require: packageRequireApi(packageRegistry),
    request: requestApi(request),
    response: responseApi(response),
    sendRequest: unsupportedApi('pm.sendRequest'),
    test(name, fn) {
      const testName = String(name || 'Unnamed test');
      try {
        if (typeof fn !== 'function') {
          throw sandboxError('pm.test requires a callback function.');
        }
        const value = fn();
        if (value && typeof value.then === 'function') {
          throw sandboxError('Async pm.test callbacks are not supported yet.');
        }
        tests.push({ name: testName, passed: true, error: '' });
      } catch (error) {
        tests.push({ name: testName, passed: false, error: errorMessage(error) });
      }
    },
    variables: {
      get(key) {
        const localValue = getVariable(localVariables, key);
        if (localValue != null) {
          return localValue;
        }
        const envValue = getVariable(environmentVariables, key);
        if (envValue != null) {
          return envValue;
        }
        const collectionValue = getVariable(collectionVariables, key);
        return collectionValue == null ? getVariable(globals, key) : collectionValue;
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
        return replaceVariables(value, globals, collectionVariables, environmentVariables, localVariables);
      },
      toObject() {
        const object = createSafePlainObject();
        for (const source of [globals, collectionVariables, environmentVariables, localVariables]) {
          for (const variable of source || []) {
            if (variable.enabled !== false && variable.key) {
              setSafeObjectProperty(object, variable.key, variable.value ?? '');
            }
          }
        }
        return hardenSandboxValue(object);
      }
    },
    vault: unsupportedApi('pm.vault'),
    visualizer: visualizerApi(visualizer)
  };
  api.info = {
    eventName: response ? 'test' : 'prerequest',
    iteration: 0,
    iterationCount: 1,
    requestId: request?.id || '',
    requestName: request?.name || ''
  };
  api.console = createConsole(logs);
  return hardenSandboxValue(api);
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

function createPackageRegistryState() {
  return {
    cache: new Map()
  };
}

function packageRequireApi(registry = createPackageRegistryState()) {
  return hardenSandboxValue(function postmeterScriptRequire(packageName) {
    const name = normalizeScriptPackageName(packageName);
    if (!registry.cache.has(name)) {
      registry.cache.set(name, createScriptPackage(name));
    }
    return registry.cache.get(name);
  });
}

function normalizeScriptPackageName(packageName) {
  const raw = String(packageName == null ? '' : packageName).trim();
  const lowered = raw.toLowerCase();
  const alias = SCRIPT_PACKAGE_ALIASES.get(lowered) || lowered;
  if (!alias) {
    throw sandboxError('pm.require requires a package name.');
  }
  if (alias.startsWith('npm:') || alias.startsWith('jsr:')) {
    throw sandboxError('PostMeter package loading only supports reviewed bundled sandbox packages. External registry packages are not installed or fetched from scripts.');
  }
  if (
    alias.startsWith('node:')
    || alias.startsWith('http:')
    || alias.startsWith('https:')
    || alias.startsWith('.')
    || alias.startsWith('/')
    || alias.includes('\\')
  ) {
    throw sandboxError('PostMeter package loading only supports bundled sandbox packages, not Node modules or external package specifiers.');
  }
  if (!SCRIPT_PACKAGE_NAMES.includes(alias)) {
    throw sandboxError(`Sandbox package "${raw}" is not available. Supported packages: ${SCRIPT_PACKAGE_NAMES.join(', ')}.`);
  }
  return alias;
}

function createScriptPackage(name) {
  const definition = SCRIPT_PACKAGE_DEFINITIONS[name];
  if (!definition || typeof definition.factory !== 'function') {
    throw sandboxError(`Sandbox package "${name}" is not available.`);
  }
  return validateScriptPackageExport(name, definition.factory(), definition);
}

function validateScriptPackageExport(name, exported, definition) {
  if (exported == null || (typeof exported !== 'object' && typeof exported !== 'function')) {
    throw sandboxError(`Sandbox package "${name}" has an invalid bundled export.`);
  }
  const maxExportKeys = Number(definition.maxExportKeys || 0);
  if (maxExportKeys > 0 && Object.keys(exported).length > maxExportKeys) {
    throw sandboxError(`Sandbox package "${name}" exceeds its bundled export policy.`);
  }
  return hardenSandboxValue(exported);
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
  return {
    expect,
    assert: {
      equal(actual, expected, message) {
        assertCondition(actual == expected, message || `Expected ${actual} to equal ${expected}.`);
      },
      strictEqual(actual, expected, message) {
        assertCondition(Object.is(actual, expected), message || `Expected ${actual} to strictly equal ${expected}.`);
      },
      deepEqual(actual, expected, message) {
        assertCondition(deepEqual(actual, expected), message || 'Expected values to be deeply equal.');
      },
      isTrue(value, message) {
        assertCondition(value === true, message || `Expected ${value} to be true.`);
      },
      isFalse(value, message) {
        assertCondition(value === false, message || `Expected ${value} to be false.`);
      },
      isOk(value, message) {
        assertCondition(Boolean(value), message || `Expected ${value} to be truthy.`);
      },
      include(actual, expected, message) {
        try {
          assertIncludes(actual, expected, false);
        } catch (error) {
          throw sandboxError(message || errorMessage(error));
        }
      }
    },
    should() {
      return {};
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
    Response: function Response(definition = {}) { return hardenSandboxValue(cloneJson(definition || {})); },
    Url: function Url(definition = '') { return createPostmanUrl(definition); },
    Header: function Header(definition = {}) { return createPostmanHeader(definition); },
    HeaderList: function HeaderList(_parent, headers = []) { return createPostmanHeaderList(headers); },
    Variable: function Variable(definition = {}) { return createPostmanVariable(definition); },
    VariableScope: function VariableScope(definition = {}) { return createPostmanVariableScope(definition); }
  };
}

function createPostmanCollection(definition = {}) {
  const info = definition.info || {};
  const items = createPostmanPropertyList((definition.item || []).map(createPostmanItem));
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
    items: createPostmanPropertyList((definition.item || []).map(createPostmanItem)),
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

function createPostmanRequest(definition = {}) {
  const request = typeof definition === 'string' ? { url: definition } : definition || {};
  const headers = createPostmanHeaderList(request.header || request.headers || []);
  const url = createPostmanUrl(request.url || '');
  return hardenSandboxValue({
    method: String(request.method || 'GET').toUpperCase(),
    url,
    headers,
    body: request.body,
    toJSON() {
      return {
        method: this.method,
        url: url.toString(),
        header: headers.all().map((header) => header.toJSON()),
        body: cloneJson(this.body || {})
      };
    }
  });
}

function createPostmanUrl(definition = '') {
  const raw = typeof definition === 'string'
    ? definition
    : definition.raw || String(definition.protocol ? `${definition.protocol}://${(definition.host || []).join ? definition.host.join('.') : definition.host || ''}/${(definition.path || []).join ? definition.path.join('/') : definition.path || ''}` : '');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  return hardenSandboxValue({
    raw,
    protocol: parsed ? parsed.protocol.replace(/:$/, '') : '',
    host: parsed ? parsed.hostname.split('.') : [],
    path: parsed ? parsed.pathname.split('/').filter(Boolean) : [],
    query: parsed ? Array.from(parsed.searchParams.entries()).map(([key, value]) => ({ key, value })) : [],
    toString() {
      return raw;
    },
    getHost() {
      return parsed ? parsed.hostname : '';
    },
    getPath() {
      return parsed ? parsed.pathname : '';
    }
  });
}

function createPostmanHeader(definition = {}) {
  const header = typeof definition === 'string' ? { key: definition.split(':')[0], value: definition.split(':').slice(1).join(':').trim() } : definition || {};
  return hardenSandboxValue({
    key: String(header.key || ''),
    value: header.value == null ? '' : String(header.value),
    disabled: header.disabled === true,
    toJSON() {
      return { key: this.key, value: this.value, disabled: this.disabled };
    }
  });
}

function createPostmanHeaderList(headers = []) {
  const list = (Array.isArray(headers) ? headers : []).map(createPostmanHeader);
  const api = {
    add(header) {
      list.push(createPostmanHeader(header));
      return api;
    },
    upsert(header) {
      const next = createPostmanHeader(header);
      const index = list.findIndex((item) => item.key.toLowerCase() === next.key.toLowerCase());
      if (index >= 0) {
        list[index] = next;
      } else {
        list.push(next);
      }
      return api;
    },
    get(name) {
      return list.find((header) => header.key.toLowerCase() === String(name || '').toLowerCase())?.value;
    },
    has(name) {
      return api.get(name) != null;
    },
    all() {
      return hardenSandboxValue(list.slice());
    },
    count() {
      return list.length;
    },
    toObject() {
      const output = createSafePlainObject();
      for (const header of list) {
        setSafeObjectProperty(output, header.key, header.value);
      }
      return hardenSandboxValue(output);
    }
  };
  return hardenSandboxValue(api);
}

function createPostmanVariable(definition = {}) {
  return hardenSandboxValue({
    key: String(definition.key || ''),
    value: definition.value == null ? '' : String(definition.value),
    type: String(definition.type || 'any'),
    toJSON() {
      return { key: this.key, value: this.value, type: this.type };
    }
  });
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

function createPostmanPropertyList(items = []) {
  const list = items.slice();
  const api = {
    all() {
      return hardenSandboxValue(list.slice());
    },
    count() {
      return list.length;
    },
    each(callback) {
      if (typeof callback === 'function') {
        list.forEach((item) => callback(item));
      }
      return api;
    },
    append(item) {
      list.push(item);
      return api;
    }
  };
  return hardenSandboxValue(api);
}

function variableApi(variables) {
  return hardenSandboxValue({
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
      const object = createSafePlainObject();
      for (const variable of variables || []) {
        if (variable.enabled !== false && variable.key) {
          setSafeObjectProperty(object, variable.key, variable.value ?? '');
        }
      }
      return hardenSandboxValue(object);
    }
  });
}

function readOnlyVariableApi(variables) {
  return hardenSandboxValue({
    get(key) {
      return getVariable(variables, key);
    },
    has(key) {
      return getVariable(variables, key) != null;
    },
    toObject() {
      const object = createSafePlainObject();
      for (const variable of variables || []) {
        if (variable.enabled !== false && variable.key) {
          setSafeObjectProperty(object, variable.key, variable.value ?? '');
        }
      }
      return hardenSandboxValue(object);
    }
  });
}

function executionApi({ collectionVariables = [], environmentVariables = [], execution = {}, globals = [], tests = [], tracker } = {}) {
  return hardenSandboxValue({
    runRequest(target, options) {
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
    skipRequest() {
      execution.skipRequest = true;
    }
  });
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
      error: String(item?.error || '').slice(0, MAX_SCRIPT_LOG_LENGTH)
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
    data: null,
    html: '',
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
    set(template, data = {}) {
      const source = String(template == null ? '' : template);
      if (source.length > MAX_VISUALIZER_TEMPLATE_LENGTH) {
        throw sandboxError(`pm.visualizer template cannot exceed ${MAX_VISUALIZER_TEMPLATE_LENGTH} characters.`);
      }
      const snapshot = cloneVisualizerData(data);
      const rendered = sanitizeVisualizerHtml(renderVisualizerTemplate(source, snapshot));
      if (rendered.length > MAX_VISUALIZER_HTML_LENGTH) {
        throw sandboxError(`pm.visualizer output cannot exceed ${MAX_VISUALIZER_HTML_LENGTH} characters.`);
      }
      state.data = snapshot;
      state.html = rendered;
      state.template = source;
    }
  });
}

function cloneVisualizerData(data) {
  try {
    const text = JSON.stringify(data == null ? {} : data);
    if (Buffer.byteLength(text, 'utf8') > MAX_VISUALIZER_DATA_BYTES) {
      throw sandboxError(`pm.visualizer data cannot exceed ${MAX_VISUALIZER_DATA_BYTES} bytes.`);
    }
    return JSON.parse(text);
  } catch (error) {
    if (String(error?.message || '').includes('pm.visualizer data cannot exceed')) {
      throw error;
    }
    throw sandboxError(`pm.visualizer data must be JSON-serializable: ${errorMessage(error)}`);
  }
}

function renderVisualizerTemplate(template, data, depth = 0) {
  if (depth > MAX_VISUALIZER_TEMPLATE_DEPTH) {
    throw sandboxError(`pm.visualizer template block nesting cannot exceed ${MAX_VISUALIZER_TEMPLATE_DEPTH}.`);
  }

  const source = String(template || '');
  const context = depth === 0 ? visualizerRootContext(data) : data;
  const blockPattern = new RegExp(`\\{\\{\\s*#(${[...VISUALIZER_BLOCK_HELPERS].join('|')})\\s+(${VISUALIZER_VALUE_PATTERN})\\s*\\}\\}`, 'g');
  let output = '';
  let index = 0;
  let match;

  while ((match = blockPattern.exec(source)) !== null) {
    output = appendVisualizerOutput(output, renderVisualizerValues(source.slice(index, match.index), context));
    const block = readVisualizerBlock(source, blockPattern.lastIndex, match[1]);
    if (!block) {
      throw sandboxError(`pm.visualizer template has an unclosed {{#${match[1]}}} block.`);
    }
    output = appendVisualizerOutput(
      output,
      renderVisualizerBlock(match[1], match[2], block, context, depth + 1)
    );
    index = block.endIndex;
    blockPattern.lastIndex = block.endIndex;
  }

  return appendVisualizerOutput(output, renderVisualizerValues(source.slice(index), context));
}

function renderVisualizerValues(template, data) {
  const triplePattern = new RegExp(`\\{\\{\\{\\s*(${VISUALIZER_VALUE_PATTERN})\\s*\\}\\}\\}`, 'g');
  const doublePattern = new RegExp(`\\{\\{\\s*(${VISUALIZER_VALUE_PATTERN})\\s*\\}\\}`, 'g');
  return String(template || '')
    .replace(triplePattern, (_match, key) => {
      const value = readVisualizerValue(data, key);
      return value == null ? '' : String(value);
    })
    .replace(doublePattern, (_match, key) => escapeHtml(readVisualizerValue(data, key)));
}

function readVisualizerBlock(template, startIndex, helperName) {
  const helperPattern = [...VISUALIZER_BLOCK_HELPERS].join('|');
  const blockPattern = new RegExp(`\\{\\{\\s*(#(${helperPattern})\\s+${VISUALIZER_VALUE_PATTERN}|else|/(${helperPattern}))\\s*\\}\\}`, 'g');
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

function renderVisualizerBlock(helperName, pathValue, block, data, depth) {
  const value = readVisualizerValue(data, pathValue);
  if (helperName === 'each') {
    const entries = visualizerEachEntries(value);
    if (!entries.length) {
      return block.elseTemplate ? renderVisualizerTemplate(block.elseTemplate, data, depth) : '';
    }
    let output = '';
    for (const entry of entries) {
      output = appendVisualizerOutput(
        output,
        renderVisualizerTemplate(block.template, visualizerEachContext(data, entry.value, entry.index, entry.key), depth)
      );
    }
    return output;
  }
  if (helperName === 'if') {
    return renderVisualizerTemplate(visualizerTruthy(value) ? block.template : block.elseTemplate, data, depth);
  }
  if (helperName === 'unless') {
    return renderVisualizerTemplate(visualizerTruthy(value) ? block.elseTemplate : block.template, data, depth);
  }
  if (helperName === 'with') {
    if (!visualizerTruthy(value)) {
      return block.elseTemplate ? renderVisualizerTemplate(block.elseTemplate, data, depth) : '';
    }
    return renderVisualizerTemplate(block.template, visualizerWithContext(data, value), depth);
  }
  return '';
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

function visualizerEachContext(parent, item, index, key) {
  return visualizerItemContext(parent, item, index, key);
}

function visualizerWithContext(parent, item) {
  return visualizerItemContext(parent, item);
}

function visualizerItemContext(parent, item, index, key) {
  const context = createSafePlainObject();
  const root = parent?.['@root'] || parent;
  assignVisualizerObjectFields(context, parent);
  assignVisualizerObjectFields(context, item);
  context.this = item;
  context['@root'] = root;
  context['@parent'] = parent;
  if (index != null) {
    context['@index'] = index;
  }
  if (key != null) {
    context['@key'] = key;
  }
  return context;
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
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(src|href)\s*=\s*(["'])(?!data:image\/|#|about:blank)(.*?)\2/gi, '')
    .replace(/\s+(src|href)\s*=\s*(?!["'])(?!data:image\/|#|about:blank)[^\s>]+/gi, '');
}

function visualizerResult(state) {
  if (!state?.html) {
    return undefined;
  }
  return {
    html: state.html,
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

function brokerCookieApi({ broker, tracker }) {
  const request = async (operation, payload = {}) => {
    if (!broker || typeof tracker?.brokerRequest !== 'function') {
      throw sandboxError('pm.cookies is not available in this script runtime.');
    }
    const promise = tracker.brokerRequest(operation, payload);
    tracker.track(promise.catch(() => {}));
    return promise;
  };
  return hardenSandboxValue({
    get(name) {
      return sandboxThenable(request('cookies:get', { name: String(name || '') }));
    },
    has(name) {
      return sandboxThenable(request('cookies:get', { name: String(name || '') }).then((value) => value != null));
    },
    toObject() {
      return sandboxThenable(request('cookies:toObject', {}).then((value) => hardenSandboxValue(value)));
    },
    set(name, value) {
      return sandboxThenable(request('cookies:set', { name: String(name || ''), value: value == null ? '' : String(value) }).then(() => undefined));
    },
    unset(name) {
      return sandboxThenable(request('cookies:unset', { name: String(name || '') }).then(() => undefined));
    },
    jar() {
      return brokerCookieJarApi({ request });
    }
  });
}

function brokerCookieJarApi({ request }) {
  const withCallback = (promise, callback) => {
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
  };
  return hardenSandboxValue({
    get(url, name, callback) {
      return withCallback(
        request('cookies.jar:get', { url: String(url || ''), name: String(name || '') }),
        callback
      );
    },
    getAll(url, callback) {
      return withCallback(
        request('cookies.jar:getAll', { url: String(url || '') }).then((value) => hardenSandboxValue(value)),
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
  return hardenSandboxValue({
    name: cookie?.name == null ? '' : String(cookie.name),
    value: cookie?.value == null ? '' : String(cookie.value),
    domain: cookie?.domain == null ? '' : String(cookie.domain),
    path: cookie?.path == null ? '' : String(cookie.path),
    expiresAt: cookie?.expiresAt == null
      ? cookie?.expires == null
        ? ''
        : String(cookie.expires)
      : String(cookie.expiresAt),
    secure: cookie?.secure === true,
    sameSite: cookie?.sameSite == null ? '' : String(cookie.sameSite),
    hostOnly: cookie?.hostOnly === true,
    priority: cookie?.priority == null ? '' : String(cookie.priority),
    partitioned: cookie?.partitioned === true
  });
}

function requestApi(request = {}) {
  return hardenSandboxValue({
    method: request.method || '',
    url: requestUrlApi(request.url || ''),
    headers: pairListApi(request.headers || []),
    body: requestBodyApi(request.body || '')
  });
}

function mutableRequestApi(request = {}) {
  const api = {
    get method() {
      return request.method || '';
    },
    set method(value) {
      request.method = String(value || '').toUpperCase();
    },
    get url() {
      return mutableRequestUrlApi(request);
    },
    set url(value) {
      request.url = String(value || '');
    },
    headers: mutablePairListApi(request.headers ||= []),
    body: mutableRequestBodyApi(request),
    toJSON() {
      return hardenSandboxValue(cloneJson(request));
    }
  };
  return hardenSandboxValue(api);
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

function responseApi(response = null) {
  if (!response) {
    return undefined;
  }
  return hardenSandboxValue({
    code: response.statusCode,
    status: String(response.statusCode || ''),
    responseTime: response.durationMillis,
    headers: responseHeaderApi(response.headers || {}),
    json() {
      try {
        return hardenSandboxValue(JSON.parse(response.body || ''));
      } catch (error) {
        throw sandboxError(errorMessage(error));
      }
    },
    text() {
      return response.body || '';
    },
    to: {
      be: {
        ok() {
          assertHttpStatusRange(response.statusCode, 200, 299, 'successful');
        },
        success() {
          assertHttpStatusRange(response.statusCode, 200, 299, 'successful');
        },
        clientError() {
          assertHttpStatusRange(response.statusCode, 400, 499, 'client error');
        },
        serverError() {
          assertHttpStatusRange(response.statusCode, 500, 599, 'server error');
        },
        badRequest() {
          assertHttpStatus(response.statusCode, 400, 'bad request');
        },
        unauthorized() {
          assertHttpStatus(response.statusCode, 401, 'unauthorized');
        },
        forbidden() {
          assertHttpStatus(response.statusCode, 403, 'forbidden');
        },
        notFound() {
          assertHttpStatus(response.statusCode, 404, 'not found');
        }
      },
      have: {
        status(expectedStatus) {
          if (Number(response.statusCode) !== Number(expectedStatus)) {
            throw sandboxError(`Expected response status ${expectedStatus} but received ${response.statusCode}.`);
          }
        },
        header(name, expectedValue) {
          const value = responseHeaderValue(response.headers || {}, name);
          if (value == null) {
            throw sandboxError(`Expected response header ${name}.`);
          }
          if (arguments.length > 1 && String(value) !== String(expectedValue)) {
            throw sandboxError(`Expected response header ${name} to equal ${expectedValue} but received ${value}.`);
          }
        },
        body(expectedText) {
          const body = response.body || '';
          if (arguments.length === 0) {
            if (!body) {
              throw sandboxError('Expected response body.');
            }
            return;
          }
          if (!body.includes(String(expectedText))) {
            throw sandboxError(`Expected response body to include ${expectedText}.`);
          }
        },
        jsonBody(path, expectedValue) {
          let payload;
          try {
            payload = JSON.parse(response.body || '');
          } catch (error) {
            throw sandboxError(errorMessage(error));
          }
          if (arguments.length === 0) {
            return;
          }
          const value = readJsonPathForScript(payload, path);
          if (arguments.length === 1) {
            if (value == null || value === '') {
              throw sandboxError(`Expected JSON body path ${path} to exist.`);
            }
            return;
          }
          if (!deepEqual(value, expectedValue)) {
            throw sandboxError(`Expected JSON body path ${path} to equal ${safeJsonStringify(expectedValue)}.`);
          }
        }
      }
    },
    size() {
      return Buffer.byteLength(response.body || '', 'utf8');
    }
  });
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

function expect(actual) {
  const chain = {
    get and() { return chain; },
    get to() { return chain; },
    get be() { return chain; },
    get been() { return chain; },
    get is() { return chain; },
    get that() { return chain; },
    get which() { return chain; },
    get have() { return chain; },
    get has() { return chain; },
    get with() { return chain; },
    get at() { return chain; },
    get of() { return chain; },
    get same() { return chain; },
    get deep() { return deepExpectation(actual); },
    get not() { return negatedExpectation(actual); },
    equal(expected) { assertCondition(Object.is(actual, expected), `Expected ${actual} to equal ${expected}.`); return chain; },
    equals(expected) { chain.equal(expected); return chain; },
    eql(expected) { assertCondition(deepEqual(actual, expected), 'Expected values to be deeply equal.'); return chain; },
    include(expected) { assertIncludes(actual, expected, false); return chain; },
    contain(expected) { chain.include(expected); },
    above(expected) { assertCondition(Number(actual) > Number(expected), `Expected ${actual} to be above ${expected}.`); return chain; },
    below(expected) { assertCondition(Number(actual) < Number(expected), `Expected ${actual} to be below ${expected}.`); return chain; },
    least(expected) { assertCondition(Number(actual) >= Number(expected), `Expected ${actual} to be at least ${expected}.`); return chain; },
    most(expected) { assertCondition(Number(actual) <= Number(expected), `Expected ${actual} to be at most ${expected}.`); return chain; },
    within(minimum, maximum) {
      const number = Number(actual);
      assertCondition(number >= Number(minimum) && number <= Number(maximum), `Expected ${actual} to be within ${minimum}..${maximum}.`);
      return chain;
    },
    match(pattern) { assertCondition(testPattern(pattern, actual), `Expected ${actual} to match ${pattern}.`); return chain; },
    oneOf(values) {
      assertCondition(Array.isArray(values) && values.some((value) => Object.is(value, actual)), `Expected ${actual} to be one of ${JSON.stringify(values)}.`);
      return chain;
    },
    a(typeName) { assertType(actual, typeName); return chain; },
    an(typeName) { assertType(actual, typeName); return chain; },
    lengthOf(expectedLength) {
      assertCondition(actual != null && actual.length === Number(expectedLength), `Expected length ${expectedLength} but received ${actual?.length}.`);
      return chain;
    },
    length(expectedLength) {
      return chain.lengthOf(expectedLength);
    },
    keys(...expectedKeys) {
      const keys = expectedKeys.flat();
      assertCondition(actual != null && typeof actual === 'object', 'Expected value to be an object with keys.');
      for (const key of keys) {
        assertCondition(Object.hasOwn(actual, key), `Expected object to have key ${key}.`);
      }
      return chain;
    },
    members(expectedValues) {
      assertArrayMembers(actual, expectedValues, false);
      return chain;
    },
    property(name, expectedValue) {
      assertCondition(actual != null && Object.hasOwn(actual, name), `Expected object to have property ${name}.`);
      if (arguments.length > 1) {
        assertCondition(deepEqual(actual[name], expectedValue), `Expected property ${name} to equal ${expectedValue}.`);
      }
      return expect(actual[name]);
    }
  };
  Object.defineProperties(chain, {
    exist: { get() { assertCondition(actual != null, `Expected ${actual} to exist.`); return true; } },
    ok: { get() { assertCondition(Boolean(actual), `Expected ${actual} to be truthy.`); return true; } },
    true: { get() { assertCondition(actual === true, `Expected ${actual} to be true.`); return true; } },
    false: { get() { assertCondition(actual === false, `Expected ${actual} to be false.`); return true; } },
    undefined: { get() { assertCondition(actual === undefined, `Expected ${actual} to be undefined.`); return true; } },
    null: { get() { assertCondition(actual === null, `Expected ${actual} to be null.`); return true; } },
    empty: { get() { assertCondition(isEmpty(actual), `Expected ${actual} to be empty.`); return true; } }
  });
  return hardenSandboxValue(chain);
}

function negatedExpectation(actual) {
  const chain = {
    get and() { return chain; },
    get to() { return chain; },
    get be() { return chain; },
    get have() { return chain; },
    equal(expected) { assertCondition(!Object.is(actual, expected), `Expected ${actual} not to equal ${expected}.`); return chain; },
    equals(expected) { chain.equal(expected); return chain; },
    eql(expected) { assertCondition(!deepEqual(actual, expected), 'Expected values not to be deeply equal.'); return chain; },
    include(expected) { assertIncludes(actual, expected, true); return chain; },
    contain(expected) { chain.include(expected); },
    match(pattern) { assertCondition(!testPattern(pattern, actual), `Expected ${actual} not to match ${pattern}.`); return chain; },
    property(name) { assertCondition(actual == null || !Object.hasOwn(actual, name), `Expected object not to have property ${name}.`); return chain; },
    oneOf(values) {
      assertCondition(!Array.isArray(values) || !values.some((value) => Object.is(value, actual)), `Expected ${actual} not to be one of ${JSON.stringify(values)}.`);
      return chain;
    },
    members(expectedValues) {
      assertArrayMembers(actual, expectedValues, true);
      return chain;
    }
  };
  Object.defineProperties(chain, {
    exist: { get() { assertCondition(actual == null, `Expected ${actual} not to exist.`); return true; } },
    empty: { get() { assertCondition(!isEmpty(actual), `Expected ${actual} not to be empty.`); return true; } },
    null: { get() { assertCondition(actual !== null, 'Expected value not to be null.'); return true; } },
    undefined: { get() { assertCondition(actual !== undefined, 'Expected value not to be undefined.'); return true; } }
  });
  return hardenSandboxValue(chain);
}

function deepExpectation(actual) {
  return hardenSandboxValue({
    get equal() { return (expected) => expect(actual).eql(expected); },
    get equals() { return (expected) => expect(actual).eql(expected); },
    include(expected) {
      if (Array.isArray(actual)) {
        assertCondition(actual.some((item) => deepEqual(item, expected)), 'Expected array to deeply include value.');
        return;
      }
      if (actual && typeof actual === 'object') {
        for (const [key, value] of Object.entries(expected || {})) {
          assertCondition(deepEqual(actual[key], value), `Expected object property ${key} to deeply include value.`);
        }
        return;
      }
      expect(actual).include(expected);
    }
  });
}

function deepEqual(left, right) {
  return safeJsonStringify(left) === safeJsonStringify(right);
}

function assertIncludes(actual, expected, negate) {
  let includes = false;
  if (Array.isArray(actual)) {
    includes = actual.some((value) => deepEqual(value, expected));
  } else if (actual && typeof actual === 'object') {
    includes = Object.entries(expected || {}).every(([key, value]) => deepEqual(actual[key], value));
  } else {
    includes = String(actual ?? '').includes(String(expected ?? ''));
  }
  assertCondition(
    negate ? !includes : includes,
    `Expected ${safeJsonStringify(actual)} ${negate ? 'not ' : ''}to include ${safeJsonStringify(expected)}.`
  );
}

function assertArrayMembers(actual, expectedValues, negate) {
  assertCondition(Array.isArray(actual), 'Expected value to be an array.');
  assertCondition(Array.isArray(expectedValues), 'Expected members to be provided as an array.');
  const includesAll = expectedValues.every((expected) => actual.some((value) => deepEqual(value, expected)));
  assertCondition(
    negate ? !includesAll : includesAll,
    `Expected ${safeJsonStringify(actual)} ${negate ? 'not ' : ''}to include members ${safeJsonStringify(expectedValues)}.`
  );
}

function assertType(actual, typeName) {
  const expected = String(typeName || '').toLowerCase();
  const actualType = Array.isArray(actual) ? 'array' : actual === null ? 'null' : typeof actual;
  assertCondition(actualType === expected, `Expected type ${expected} but received ${actualType}.`);
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
  const write = (...values) => {
    if (logs.length >= MAX_SCRIPT_LOGS) {
      return;
    }
    const line = values.map(formatLogValue).join(' ');
    logs.push(line.length > MAX_SCRIPT_LOG_LENGTH ? `${line.slice(0, MAX_SCRIPT_LOG_LENGTH)}...` : line);
  };
  return hardenSandboxValue({
    log: write,
    info: write,
    warn: write,
    error: write
  });
}

function normalizeIterationData(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({ enabled: item.enabled !== false, key: String(item.key || ''), value: item.value == null ? '' : String(item.value) }))
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
      error: truncate(test.error || '', MAX_SCRIPT_LOG_LENGTH)
    })) : [],
    error: truncate(result.error || '', MAX_SCRIPT_LOG_LENGTH),
    logs: Array.isArray(result.logs) ? result.logs.slice(0, MAX_SCRIPT_LOGS).map((line) => truncate(line, MAX_SCRIPT_LOG_LENGTH)) : [],
    commitSideEffects: result.commitSideEffects !== false,
    execution: result.execution && typeof result.execution === 'object' ? {
      nextRequest: Object.hasOwn(result.execution, 'nextRequest') ? result.execution.nextRequest : undefined,
      skipRequest: result.execution.skipRequest === true
    } : {},
    request: result.request && typeof result.request === 'object' ? cloneJson(result.request) : undefined,
    visualizer: result.visualizer && typeof result.visualizer === 'object' ? {
      html: truncate(result.visualizer.html || '', MAX_VISUALIZER_HTML_LENGTH),
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

function replaceVariables(value, ...scopes) {
  return String(value ?? '').replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*}}/g, (match, key) => {
    for (const scope of scopes.reverse()) {
      const replacement = getVariable(scope, key);
      if (replacement != null) {
        return replacement;
      }
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
  runPostmanScriptAsync
};
