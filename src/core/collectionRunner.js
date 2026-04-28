const { evaluateAssertions } = require('./assertions');
const { sendRequest } = require('./httpClient');
const { walkRequests } = require('./models');
const {
  createScriptedRequestState,
  emptyScriptResult,
  runScriptedRequestLifecycle
} = require('./scriptedRequestLifecycle');
const { runPostmanScriptIsolated } = require('./scriptSandbox');
const {
  applyExtractedVariables,
  cloneEnvironment,
  cloneVariables
} = require('./variableScope');

const MAX_PM_EXECUTION_RUN_REQUEST_DEPTH = 5;
const MAX_PM_EXECUTION_RUN_REQUESTS_PER_COLLECTION = 50;

async function runCollection(collection, environment, options = {}) {
  const send = options.sendRequest || sendRequest;
  const runScript = options.scriptRunner || runPostmanScriptIsolated;
  const requests = [];
  walkRequests(collection, (request, _collection, folder) => {
    requests.push({
      request,
      folderName: folder?.name || '',
      folderPath: folder?.name ? [folder.name] : [],
      index: requests.length
    });
  });
  const runnerEnvironment = cloneEnvironment(environment) || { id: 'runtime', name: 'Runtime', variables: [] };
  const runnerCollectionVariables = cloneVariables(collection?.variables || []);
  const runnerGlobals = cloneVariables(options.globals || []);
  let runnerCookies = Array.isArray(options.cookieJar) ? structuredClone(options.cookieJar) : [];
  const results = [];
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const runRequestBudget = {
    calls: 0,
    max: Math.min(
      200,
      Math.max(1, Number(options.maxRunRequestExecutions || MAX_PM_EXECUTION_RUN_REQUESTS_PER_COLLECTION))
    )
  };
  const createRunRequestBroker = (depth = 0) => async (payload) => {
    if (options.signal?.aborted) {
      throw new Error('Collection run was cancelled.');
    }
    if (depth >= MAX_PM_EXECUTION_RUN_REQUEST_DEPTH) {
      throw new Error(`pm.execution.runRequest cannot nest deeper than ${MAX_PM_EXECUTION_RUN_REQUEST_DEPTH} requests.`);
    }
    runRequestBudget.calls += 1;
    if (runRequestBudget.calls > runRequestBudget.max) {
      throw new Error(`Collection run cannot execute more than ${runRequestBudget.max} pm.execution.runRequest calls.`);
    }
    const targetEntry = findRunRequestTarget(requests, payload?.target);
    if (!targetEntry) {
      throw new Error(`pm.execution.runRequest target was not found: ${payload?.target || ''}.`);
    }
    const scopeState = runRequestScopeState(
      payload,
      runnerEnvironment,
      runnerCollectionVariables,
      runnerGlobals,
      runnerCookies
    );
    const targetState = createScriptedRequestState(targetEntry.request, runnerEnvironment, {
      collectionVariables: scopeState.collectionVariables,
      globals: scopeState.globals,
      cookieJar: scopeState.cookies,
      cloneEnvironment: false,
      cloneCollectionVariables: false,
      cloneGlobals: false,
      localVariables: runRequestLocalVariables(targetEntry.request, payload?.options?.variables)
    });
    targetState.environment = scopeState.environment;
    const scriptedRequest = await runScriptedRequestLifecycle(targetState, {
      sendRequest: send,
      scriptRunner: runScript,
      grpcInvoker: options.grpcInvoker || options.scriptOptions?.grpcInvoker,
      signal: options.signal,
      scriptOptions: {
        ...(options.scriptOptions || {}),
        runRequest: createRunRequestBroker(depth + 1),
        grpcInvoker: options.grpcInvoker || options.scriptOptions?.grpcInvoker,
        sandboxPackages: options.sandboxPackages || options.scriptOptions?.sandboxPackages || [],
        clientCertificates: collection?.certificates || [],
        fileBindings: options.fileBindings || options.scriptOptions?.fileBindings || [],
        vault: options.vault || options.scriptOptions?.vault
      },
      sandboxPackages: options.sandboxPackages || options.scriptOptions?.sandboxPackages || [],
      clientCertificates: collection?.certificates || [],
      fileBindings: options.fileBindings || options.scriptOptions?.fileBindings || [],
      vault: options.vault || options.scriptOptions?.vault,
      trustedCapabilities: options.trustedCapabilities || options.scriptOptions?.trustedCapabilities || {},
      iterationData: options.iterationData || [],
      collectionId: collection?.id || '',
      executionLocation: executionLocationForEntry(collection, targetEntry),
      iteration: options.iteration || 0,
      iterationCount: options.iterationCount || 1
    });
    if (Array.isArray(scriptedRequest.cookies)) {
      scopeState.cookies = scriptedRequest.cookies;
    }
    if (!scriptedRequest.preRequestScriptResult.passed) {
      return runRequestBrokerResult(targetEntry, scriptedRequest, null, []);
    }
    if (scriptedRequest.skipped) {
      return runRequestBrokerResult(targetEntry, scriptedRequest, null, [], { skipped: true });
    }
    const response = scriptedRequest.response;
    if (Array.isArray(response?.updatedCookies)) {
      scopeState.cookies = response.updatedCookies;
    }
    const assertions = evaluateAssertions(response, targetEntry.request.assertions || []);
    applyExtractedVariables(scopeState.environment, assertions.extractedVariables);
    return runRequestBrokerResult(targetEntry, scriptedRequest, response, assertions.results);
  };
  let index = 0;
  let steps = 0;

  while (index < requests.length) {
    if (options.signal?.aborted) {
      break;
    }
    if (++steps > Math.max(1000, requests.length * 100)) {
      throw new Error('Collection run exceeded the maximum scripted execution steps.');
    }
    const entry = requests[index];
    const startedAt = new Date().toISOString();
    try {
      const scriptedRequest = await runScriptedRequestLifecycle(
        createScriptedRequestState(entry.request, runnerEnvironment, {
          collectionVariables: runnerCollectionVariables,
          globals: runnerGlobals,
          cookieJar: runnerCookies,
          cloneEnvironment: false,
          cloneCollectionVariables: false,
          cloneGlobals: false
        }),
        {
          sendRequest: send,
          scriptRunner: runScript,
          grpcInvoker: options.grpcInvoker || options.scriptOptions?.grpcInvoker,
          signal: options.signal,
          scriptOptions: options.scriptOptions,
          sandboxPackages: options.sandboxPackages || options.scriptOptions?.sandboxPackages || [],
          clientCertificates: collection?.certificates || [],
          fileBindings: options.fileBindings || options.scriptOptions?.fileBindings || [],
          trustedCapabilities: options.trustedCapabilities || options.scriptOptions?.trustedCapabilities || {},
          vault: options.vault || options.scriptOptions?.vault,
          runRequest: createRunRequestBroker(0),
          iterationData: options.iterationData || [],
          collectionId: collection?.id || '',
          executionLocation: executionLocationForEntry(collection, entry),
          iteration: options.iteration || 0,
          iterationCount: options.iterationCount || 1
        }
      );
      if (Array.isArray(scriptedRequest.cookies)) {
        runnerCookies = scriptedRequest.cookies;
      }
      if (!scriptedRequest.preRequestScriptResult.passed) {
        const result = scriptFailureResult(
          entry,
          startedAt,
          scriptedRequest.preRequestScriptResult,
          scriptedRequest.localVariables
        );
        results.push(result);
        progress(progressEvent(index + 1, requests.length, result));
        if (options.stopOnFailure === true) {
          break;
        }
        index = nextRequestIndex(index, requests, scriptedRequest.execution);
        continue;
      }
      if (scriptedRequest.skipped) {
        const result = skippedResult(entry, startedAt, scriptedRequest);
        results.push(result);
        progress(progressEvent(index + 1, requests.length, result));
        index = nextRequestIndex(index, requests, scriptedRequest.execution);
        continue;
      }
      const response = scriptedRequest.response;
      if (Array.isArray(response.updatedCookies)) {
        runnerCookies = response.updatedCookies;
      }
      const assertions = evaluateAssertions(response, entry.request.assertions || []);
      applyExtractedVariables(runnerEnvironment, assertions.extractedVariables);
      const passed = assertions.passed && scriptedRequest.testScriptResult.passed;
      const result = {
        requestId: entry.request.id,
        requestName: entry.request.name,
        folderName: entry.folderName,
        startedAt,
        statusCode: response.statusCode,
        durationMillis: response.durationMillis,
        passed,
        assertionResults: assertions.results,
        preRequestScriptResult: scriptedRequest.preRequestScriptResult,
        messageScriptResults: scriptedRequest.messageScriptResults || [],
        afterResponseScriptResult: scriptedRequest.afterResponseScriptResult,
        testScriptResult: scriptedRequest.testScriptResult,
        extractedVariables: assertions.extractedVariables,
        localVariables: scriptedRequest.localVariables,
        error: scriptedRequest.testScriptResult.error || ''
      };
      results.push(result);
      progress(progressEvent(index + 1, requests.length, result));
      if (options.stopOnFailure === true && !result.passed) {
        break;
      }
      index = nextRequestIndex(index, requests, scriptedRequest.execution);
    } catch (error) {
      const result = {
        requestId: entry.request.id,
        requestName: entry.request.name,
        folderName: entry.folderName,
        startedAt,
        statusCode: 0,
        durationMillis: 0,
        passed: false,
        assertionResults: [],
        preRequestScriptResult: emptyScriptResult(),
        testScriptResult: emptyScriptResult(),
        extractedVariables: [],
        error: error.message || String(error)
      };
      results.push(result);
      progress(progressEvent(index + 1, requests.length, result));
      if (options.stopOnFailure === true) {
        break;
      }
      index += 1;
    }
  }

  const failedRequests = results.filter((result) => !result.passed).length;
  return {
    collectionId: collection?.id || '',
    collectionName: collection?.name || '',
    totalRequests: results.length,
    passedRequests: results.length - failedRequests,
    failedRequests,
    passed: failedRequests === 0,
    cancelled: options.signal?.aborted === true,
    results,
    environment: runnerEnvironment,
    collectionVariables: runnerCollectionVariables,
    globals: runnerGlobals,
    cookies: runnerCookies
  };
}

function findRunRequestTarget(requests, target) {
  const value = String(target || '').trim();
  if (!value) {
    return null;
  }
  return requests.find((entry) => requestMatchesTarget(entry.request, value)) || null;
}

function runRequestLocalVariables(request, overrides) {
  const variables = cloneVariables(request?.variables || []);
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    for (const [key, value] of Object.entries(overrides)) {
      upsertVariable(variables, key, value);
    }
  }
  return variables;
}

function executionLocationForEntry(collection, entry) {
  const folderPath = Array.isArray(entry?.folderPath) ? entry.folderPath.filter(Boolean) : [];
  const current = [
    collection?.name || '',
    ...folderPath,
    entry?.request?.name || ''
  ].filter(Boolean);
  return {
    collectionId: collection?.id || '',
    current,
    folderPath,
    index: Number.isFinite(Number(entry?.index)) ? Number(entry.index) : -1,
    requestId: postmanCompatibleRequestId(entry?.request),
    requestName: entry?.request?.name || ''
  };
}

function runRequestBrokerResult(entry, scriptedRequest, response, assertionResults, options = {}) {
  return {
    collectionVariables: scriptedRequest.collectionVariables || [],
    cookies: scriptedRequest.cookies || [],
    environmentVariables: scriptedRequest.environment?.variables || [],
    globals: scriptedRequest.globals || [],
    response: response ? {
      statusCode: response.statusCode,
      headers: response.headers || {},
      body: response.body || '',
      durationMillis: response.durationMillis || 0,
      responseBytes: response.responseBytes || Buffer.byteLength(response.body || '', 'utf8'),
      finalUrl: response.finalUrl || entry.request.url || ''
    } : null,
    skipped: options.skipped === true,
    tests: runRequestBrokerTests(entry, scriptedRequest, assertionResults)
  };
}

function runRequestScopeState(payload, environment, collectionVariables, globals, cookies) {
  return {
    collectionVariables: Array.isArray(payload?.scopes?.collectionVariables)
      ? cloneVariables(payload.scopes.collectionVariables)
      : cloneVariables(collectionVariables),
    cookies: Array.isArray(payload?.cookies)
      ? cloneJsonArray(payload.cookies)
      : cloneJsonArray(cookies),
    environment: {
      id: environment?.id || 'runtime',
      name: environment?.name || 'Runtime',
      variables: Array.isArray(payload?.scopes?.environmentVariables)
        ? cloneVariables(payload.scopes.environmentVariables)
        : cloneVariables(environment?.variables || [])
    },
    globals: Array.isArray(payload?.scopes?.globals)
      ? cloneVariables(payload.scopes.globals)
      : cloneVariables(globals)
  };
}

function runRequestBrokerTests(entry, scriptedRequest, assertionResults = []) {
  const tests = [];
  appendScriptResultTests(tests, entry, 'pre-request', scriptedRequest.preRequestScriptResult);
  appendScriptResultTests(tests, entry, 'test', scriptedRequest.testScriptResult);
  for (const assertion of assertionResults || []) {
    tests.push({
      name: `${entry.request.name}: assertion ${assertion.assertion?.name || assertion.assertion?.type || 'result'}`,
      passed: assertion.passed === true,
      error: assertion.passed === true ? '' : assertion.message || 'Assertion failed.'
    });
  }
  return tests;
}

function appendScriptResultTests(tests, entry, phase, result) {
  if (!result) {
    return;
  }
  for (const item of result.tests || []) {
    tests.push({
      name: `${entry.request.name}: ${item.name || `${phase} test`}`,
      passed: item.passed === true,
      error: item.error || '',
      skipped: item.skipped === true
    });
  }
  if (!result.passed && !(result.tests || []).length) {
    tests.push({
      name: `${entry.request.name}: ${phase} script`,
      passed: false,
      error: result.error || `${phase} script failed.`
    });
  }
}

function upsertVariable(variables, key, value) {
  const name = String(key || '');
  if (!name) {
    return;
  }
  const existing = variables.find((item) => item.key === name);
  if (existing) {
    existing.enabled = true;
    existing.value = value == null ? '' : String(value);
    return;
  }
  variables.push({ enabled: true, key: name, value: value == null ? '' : String(value) });
}

function cloneJsonArray(value) {
  return JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));
}

function nextRequestIndex(currentIndex, requests, execution = {}) {
  if (Object.hasOwn(execution || {}, 'nextRequest')) {
    if (execution.nextRequest == null) {
      return requests.length;
    }
    const target = String(execution.nextRequest);
    const targetIndex = requests.findIndex((entry) => requestMatchesTarget(entry.request, target));
    return targetIndex >= 0 ? targetIndex : currentIndex + 1;
  }
  return currentIndex + 1;
}

function requestMatchesTarget(request, target) {
  const value = String(target || '').trim();
  if (!value) {
    return false;
  }
  return postmanCompatibleRequestAliases(request).includes(value);
}

function postmanCompatibleRequestId(request) {
  return postmanCompatibleRequestAliases(request)[0] || '';
}

function postmanCompatibleRequestAliases(request) {
  const aliases = [
    request?.postman?.ids?.original,
    request?.postman?.ids?.id,
    request?.postman?.ids?.uid,
    request?.postman?.ids?._postman_id,
    request?.postman?.ids?.deterministic,
    request?.postman?.id,
    request?.id,
    request?.name
  ];
  return [...new Set(aliases.map((item) => String(item || '').trim()).filter(Boolean))];
}

function skippedResult(entry, startedAt, scriptedRequest) {
  return {
    requestId: entry.request.id,
    requestName: entry.request.name,
    folderName: entry.folderName,
    startedAt,
    statusCode: 0,
    durationMillis: 0,
    passed: true,
    assertionResults: [],
    preRequestScriptResult: scriptedRequest.preRequestScriptResult,
    testScriptResult: emptyScriptResult(),
    extractedVariables: [],
    localVariables: scriptedRequest.localVariables,
    error: ''
  };
}

function scriptFailureResult(entry, startedAt, preRequestScriptResult, localVariables = []) {
  return {
    requestId: entry.request.id,
    requestName: entry.request.name,
    folderName: entry.folderName,
    startedAt,
    statusCode: 0,
    durationMillis: 0,
    passed: false,
    assertionResults: [],
    preRequestScriptResult,
    testScriptResult: emptyScriptResult(),
    extractedVariables: [],
    localVariables,
    error: preRequestScriptResult.error || 'Pre-request script failed.'
  };
}

function progressEvent(completedRequests, totalRequests, result) {
  return {
    completedRequests,
    totalRequests,
    requestId: result.requestId,
    requestName: result.requestName,
    passed: result.passed
  };
}

function collectionRunResultToCsv(result) {
  const rows = [
    ['metric', 'value'],
    ['collectionId', result.collectionId || ''],
    ['collectionName', result.collectionName || ''],
    ['totalRequests', result.totalRequests || 0],
    ['passedRequests', result.passedRequests || 0],
    ['failedRequests', result.failedRequests || 0],
    ['passed', result.passed === true],
    ['cancelled', result.cancelled === true]
  ];

  rows.push([]);
  rows.push(['requestId', 'requestName', 'folderName', 'startedAt', 'statusCode', 'durationMillis', 'passed', 'error']);
  for (const item of result.results || []) {
    rows.push([
      item.requestId || '',
      item.requestName || '',
      item.folderName || '',
      item.startedAt || '',
      item.statusCode || 0,
      item.durationMillis || 0,
      item.passed === true,
      item.error || ''
    ]);
  }

  rows.push([]);
  rows.push(['requestId', 'assertionType', 'assertionName', 'path', 'operator', 'expected', 'actual', 'passed', 'message']);
  for (const item of result.results || []) {
    for (const assertion of item.assertionResults || []) {
      rows.push([
        item.requestId || '',
        assertion.assertion?.type || '',
        assertion.assertion?.name || '',
        assertion.assertion?.path || '',
        assertion.assertion?.operator || '',
        assertion.expected ?? '',
        assertion.actual ?? '',
        assertion.passed === true,
        assertion.message || ''
      ]);
    }
  }

  rows.push([]);
  rows.push(['requestId', 'phase', 'testName', 'passed', 'error']);
  for (const item of result.results || []) {
    appendScriptTests(rows, item, 'preRequest', item.preRequestScriptResult);
    appendScriptTests(rows, item, 'tests', item.testScriptResult);
  }

  rows.push([]);
  rows.push(['variableName', 'requestId']);
  for (const item of result.results || []) {
    for (const variable of item.extractedVariables || []) {
      rows.push([variable.key || '', item.requestId || '']);
    }
  }

  rows.push([]);
  rows.push(['runtimeScope', 'requestId', 'key', 'value']);
  for (const variable of result.collectionVariables || []) {
    appendRuntimeVariableRow(rows, 'collection', '', variable);
  }
  for (const variable of result.globals || []) {
    appendRuntimeVariableRow(rows, 'global', '', variable);
  }
  for (const variable of result.environment?.variables || []) {
    appendRuntimeVariableRow(rows, 'environment', '', variable);
  }
  for (const item of result.results || []) {
    for (const variable of item.localVariables || []) {
      appendRuntimeVariableRow(rows, 'request', item.requestId || '', variable);
    }
  }

  return rows.map((row) => row.map(csvValue).join(',')).join('\n');
}

function appendRuntimeVariableRow(rows, scope, requestId, variable) {
  if (!variable?.key || variable.enabled === false) {
    return;
  }
  rows.push([
    scope,
    requestId,
    variable.key,
    variable.value ?? ''
  ]);
}

function appendScriptTests(rows, item, phase, scriptResult) {
  if (!scriptResult) {
    return;
  }
  if (scriptResult.error) {
    rows.push([item.requestId || '', phase, '', false, scriptResult.error]);
  }
  for (const test of scriptResult.tests || []) {
    rows.push([item.requestId || '', phase, test.name || '', test.passed === true, test.error || '']);
  }
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

module.exports = {
  collectionRunResultToCsv,
  runCollection
};
