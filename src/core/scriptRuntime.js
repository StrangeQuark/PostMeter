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
  const environmentVariables = context.environment?.variables || [];
  const collectionVariables = context.collectionVariables || [];
  const localVariables = context.localVariables || [];
  const sandbox = {
    pm: createPmApi({
      collectionVariables,
      environmentVariables,
      localVariables,
      logs,
      request: context.request,
      response: context.response,
      tests
    }),
    console: createConsole(logs),
    Buffer: unsupportedApi('Buffer'),
    WebSocket: unsupportedApi('WebSocket'),
    XMLHttpRequest: unsupportedApi('XMLHttpRequest'),
    clearInterval: unsupportedApi('clearInterval'),
    clearTimeout: unsupportedApi('clearTimeout'),
    fetch: unsupportedApi('fetch'),
    process: unsupportedApi('process'),
    require: unsupportedApi('require'),
    setInterval: unsupportedApi('setInterval'),
    setTimeout: unsupportedApi('setTimeout')
  };
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
    logs
  };
}

function emptyScriptResult() {
  return {
    passed: true,
    tests: [],
    error: '',
    logs: []
  };
}

function createPmApi({ collectionVariables, environmentVariables, localVariables, logs, request, response, tests }) {
  const api = {
    collectionVariables: variableApi(collectionVariables),
    cookies: unsupportedApi('pm.cookies'),
    environment: variableApi(environmentVariables),
    execution: unsupportedApi('pm.execution'),
    expect,
    globals: null,
    iterationData: unsupportedApi('pm.iterationData'),
    request: requestApi(request),
    response: responseApi(response),
    sendRequest: unsupportedApi('pm.sendRequest'),
    test(name, fn) {
      const testName = String(name || 'Unnamed test');
      try {
        if (typeof fn !== 'function') {
          throw new Error('pm.test requires a callback function.');
        }
        const value = fn();
        if (value && typeof value.then === 'function') {
          throw new Error('Async pm.test callbacks are not supported yet.');
        }
        tests.push({ name: testName, passed: true, error: '' });
      } catch (error) {
        tests.push({ name: testName, passed: false, error: error.message || String(error) });
      }
    },
    variables: {
      get(key) {
        const localValue = getVariable(localVariables, key);
        if (localValue != null) {
          return localValue;
        }
        const envValue = getVariable(environmentVariables, key);
        return envValue == null ? getVariable(collectionVariables, key) : envValue;
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
        return replaceVariables(value, collectionVariables, environmentVariables, localVariables);
      },
      toObject() {
        const object = {};
        for (const source of [collectionVariables, environmentVariables, localVariables]) {
          for (const variable of source || []) {
            if (variable.enabled !== false && variable.key) {
              object[variable.key] = variable.value ?? '';
            }
          }
        }
        return object;
      }
    },
    vault: unsupportedApi('pm.vault'),
    visualizer: {
      clear: unsupportedApi('pm.visualizer.clear'),
      set: unsupportedApi('pm.visualizer.set')
    }
  };
  api.globals = api.collectionVariables;
  api.info = {
    eventName: response ? 'test' : 'prerequest',
    iteration: 0,
    iterationCount: 1,
    requestId: request?.id || '',
    requestName: request?.name || ''
  };
  api.console = createConsole(logs);
  return api;
}

function unsupportedApi(name) {
  const callable = function unsupportedPostmanApi() {
    throw new Error(`${name} is not supported by the PostMeter script runtime yet.`);
  };
  return new Proxy(callable, {
    apply() {
      throw new Error(`${name} is not supported by the PostMeter script runtime yet.`);
    },
    get(_target, property) {
      if (property === 'then') {
        return undefined;
      }
      if (property === 'toString') {
        return () => `[unsupported ${name}]`;
      }
      return unsupportedApi(`${name}.${String(property)}`);
    }
  });
}

function variableApi(variables) {
  return {
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
      const object = {};
      for (const variable of variables || []) {
        if (variable.enabled !== false && variable.key) {
          object[variable.key] = variable.value ?? '';
        }
      }
      return object;
    }
  };
}

function requestApi(request = {}) {
  return {
    method: request.method || '',
    url: requestUrlApi(request.url || ''),
    headers: pairListApi(request.headers || []),
    body: requestBodyApi(request.body || '')
  };
}

function requestUrlApi(rawUrl) {
  const raw = String(rawUrl || '');
  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch {
    // Postman allows unresolved variable URLs; keep raw access working.
  }
  return {
    raw,
    protocol: parsed ? parsed.protocol.replace(/:$/, '') : '',
    host: parsed ? parsed.hostname : '',
    path: parsed ? parsed.pathname.split('/').filter(Boolean) : [],
    query: parsed ? Array.from(parsed.searchParams.entries()).map(([key, value]) => ({ key, value })) : [],
    toString() {
      return raw;
    }
  };
}

function requestBodyApi(rawBody) {
  const raw = String(rawBody || '');
  return {
    raw,
    toString() {
      return raw;
    }
  };
}

function responseApi(response = null) {
  if (!response) {
    return undefined;
  }
  return {
    code: response.statusCode,
    status: String(response.statusCode || ''),
    responseTime: response.durationMillis,
    headers: responseHeaderApi(response.headers || {}),
    json() {
      return JSON.parse(response.body || '');
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
            throw new Error(`Expected response status ${expectedStatus} but received ${response.statusCode}.`);
          }
        },
        header(name, expectedValue) {
          const value = responseHeaderValue(response.headers || {}, name);
          if (value == null) {
            throw new Error(`Expected response header ${name}.`);
          }
          if (arguments.length > 1 && String(value) !== String(expectedValue)) {
            throw new Error(`Expected response header ${name} to equal ${expectedValue} but received ${value}.`);
          }
        },
        body(expectedText) {
          const body = response.body || '';
          if (arguments.length === 0) {
            if (!body) {
              throw new Error('Expected response body.');
            }
            return;
          }
          if (!body.includes(String(expectedText))) {
            throw new Error(`Expected response body to include ${expectedText}.`);
          }
        },
        jsonBody(path, expectedValue) {
          const payload = JSON.parse(response.body || '');
          if (arguments.length === 0) {
            return;
          }
          const value = readJsonPathForScript(payload, path);
          if (arguments.length === 1) {
            if (value == null || value === '') {
              throw new Error(`Expected JSON body path ${path} to exist.`);
            }
            return;
          }
          if (!deepEqual(value, expectedValue)) {
            throw new Error(`Expected JSON body path ${path} to equal ${JSON.stringify(expectedValue)}.`);
          }
        }
      }
    },
    size() {
      return Buffer.byteLength(response.body || '', 'utf8');
    }
  };
}

function pairListApi(pairs) {
  return {
    get(name) {
      const target = String(name || '').toLowerCase();
      const pair = pairs.find((item) => item.enabled !== false && String(item.key || '').toLowerCase() === target);
      return pair ? pair.value ?? '' : undefined;
    },
    has(name) {
      return this.get(name) != null;
    },
    all() {
      return pairs.filter((item) => item.enabled !== false).map((item) => ({ key: item.key, value: item.value ?? '' }));
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
      const object = {};
      for (const pair of this.all()) {
        object[pair.key] = pair.value;
      }
      return object;
    }
  };
}

function responseHeaderApi(headers) {
  return {
    get(name) {
      return responseHeaderValue(headers, name);
    },
    has(name) {
      return responseHeaderValue(headers, name) != null;
    },
    all() {
      return Object.entries(headers).map(([key, values]) => ({
        key,
        value: Array.isArray(values) ? values.join(', ') : String(values ?? '')
      }));
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
      const object = {};
      for (const header of this.all()) {
        object[header.key] = header.value;
      }
      return object;
    }
  };
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
    throw new Error(`Expected response to be ${label} (${expectedStatus}) but received ${actualStatus}.`);
  }
}

function assertHttpStatusRange(actualStatus, minimum, maximum, label) {
  const status = Number(actualStatus);
  if (status < minimum || status > maximum) {
    throw new Error(`Expected response to be ${label} (${minimum}-${maximum}) but received ${actualStatus}.`);
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
    match(pattern) { assertCondition(new RegExp(pattern).test(String(actual ?? '')), `Expected ${actual} to match ${pattern}.`); return chain; },
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
  return chain;
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
    match(pattern) { assertCondition(!new RegExp(pattern).test(String(actual ?? '')), `Expected ${actual} not to match ${pattern}.`); return chain; },
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
  return chain;
}

function deepExpectation(actual) {
  return {
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
  };
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
    `Expected ${JSON.stringify(actual)} ${negate ? 'not ' : ''}to include ${JSON.stringify(expected)}.`
  );
}

function assertArrayMembers(actual, expectedValues, negate) {
  assertCondition(Array.isArray(actual), 'Expected value to be an array.');
  assertCondition(Array.isArray(expectedValues), 'Expected members to be provided as an array.');
  const includesAll = expectedValues.every((expected) => actual.some((value) => deepEqual(value, expected)));
  assertCondition(
    negate ? !includesAll : includesAll,
    `Expected ${JSON.stringify(actual)} ${negate ? 'not ' : ''}to include members ${JSON.stringify(expectedValues)}.`
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
    throw new Error(message);
  }
}

function createConsole(logs) {
  const write = (...values) => {
    if (logs.length >= MAX_SCRIPT_LOGS) {
      return;
    }
    const line = values.map(formatLogValue).join(' ');
    logs.push(line.length > MAX_SCRIPT_LOG_LENGTH ? `${line.slice(0, MAX_SCRIPT_LOG_LENGTH)}...` : line);
  };
  return {
    log: write,
    info: write,
    warn: write,
    error: write
  };
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
  MAX_SCRIPT_LOG_LENGTH,
  MAX_SCRIPT_LOGS,
  MAX_SCRIPT_LENGTH,
  runPostmanScript
};
