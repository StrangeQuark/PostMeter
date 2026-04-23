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

async function runCollection(collection, environment, options = {}) {
  const send = options.sendRequest || sendRequest;
  const runScript = options.scriptRunner || runPostmanScriptIsolated;
  const requests = [];
  walkRequests(collection, (request, _collection, folder) => {
    requests.push({ request, folderName: folder?.name || '' });
  });
  const runnerEnvironment = cloneEnvironment(environment) || { id: 'runtime', name: 'Runtime', variables: [] };
  const runnerCollectionVariables = cloneVariables(collection?.variables || []);
  let runnerCookies = Array.isArray(options.cookieJar) ? structuredClone(options.cookieJar) : [];
  const results = [];
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  for (const [index, entry] of requests.entries()) {
    if (options.signal?.aborted) {
      break;
    }
    const startedAt = new Date().toISOString();
    try {
      const scriptedRequest = await runScriptedRequestLifecycle(
        createScriptedRequestState(entry.request, runnerEnvironment, {
          collectionVariables: runnerCollectionVariables,
          cloneEnvironment: false,
          cloneCollectionVariables: false
        }),
        {
          sendRequest: send,
          scriptRunner: runScript,
          signal: options.signal,
          scriptOptions: options.scriptOptions,
          cookieJar: runnerCookies
        }
      );
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
    cookies: runnerCookies
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
