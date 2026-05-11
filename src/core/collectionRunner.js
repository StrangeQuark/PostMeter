const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { evaluateAssertions } = require('./assertions');
const { resolveEnvironmentValue } = require('./environmentResolver');
const { sendRequest } = require('./httpClient');
const { normalizeRunnerRequestIterations, runnerModel, walkRequests } = require('./models');
const {
  createScriptedRequestState,
  emptyScriptResult,
  preRequestScriptShouldAbortRequest,
  runScriptedRequestLifecycle,
  scriptResultFailureMessage
} = require('./scriptedRequestLifecycle');
const { runPostmanScriptIsolated } = require('./scriptSandbox');
const {
  applyExtractedVariables,
  cloneEnvironment,
  cloneVariables,
  runtimeEnvironment
} = require('./variableScope');
const {
  csvRecordsToIterationRows,
  csvVariablesEnabled,
  csvVariablesToIterationRows,
  normalizeCsvVariableData
} = require('./csvVariables');

const MAX_PM_EXECUTION_RUN_REQUEST_DEPTH = 5;
const MAX_PM_EXECUTION_RUN_REQUESTS_PER_COLLECTION = 50;
const MAX_RUNNER_TOTAL_ITERATIONS = 1000;
const MAX_RUN_RESULT_RESPONSE_BODY_CHARS = 32768;
const RUN_RESULT_RESPONSE_BODY_TRUNCATION_NOTICE = '\n\n[Response body truncated for runner results.]';

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
  const refreshedAuthByRequestId = new Map();
  const runRequestBudget = {
    calls: 0,
    max: Math.min(
      200,
      Math.max(1, Number(options.maxRunRequestExecutions || MAX_PM_EXECUTION_RUN_REQUESTS_PER_COLLECTION))
    )
  };
  const createRunRequestBroker = (depth = 0, inheritedIterationData = options.iterationData || []) => async (payload) => {
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
    const targetRequest = requestWithRefreshedAuth(targetEntry.request, refreshedAuthByRequestId);
    const scopeState = runRequestScopeState(
      payload,
      runnerEnvironment,
      runnerCollectionVariables,
      runnerGlobals,
      runnerCookies
    );
    const targetState = createScriptedRequestState(targetRequest, runnerEnvironment, {
      collectionVariables: scopeState.collectionVariables,
      globals: scopeState.globals,
      cookieJar: scopeState.cookies,
      cloneEnvironment: false,
      cloneCollectionVariables: false,
      cloneGlobals: false,
      localVariables: runRequestLocalVariables(targetRequest, payload?.options?.variables)
    });
    targetState.environment = scopeState.environment;
    const scriptedRequest = await runScriptedRequestLifecycle(targetState, {
      sendRequest: send,
      scriptRunner: runScript,
      grpcInvoker: options.grpcInvoker || options.scriptOptions?.grpcInvoker,
      signal: options.signal,
      scriptOptions: {
        ...(options.scriptOptions || {}),
        runRequest: createRunRequestBroker(depth + 1, inheritedIterationData),
        grpcInvoker: options.grpcInvoker || options.scriptOptions?.grpcInvoker,
        sandboxPackages: options.sandboxPackages || options.scriptOptions?.sandboxPackages || [],
        clientCertificates: collection?.certificates || [],
        fileBindings: options.fileBindings || options.scriptOptions?.fileBindings || [],
        vault: options.vault || options.scriptOptions?.vault,
        vaultPrompt: options.vaultPrompt || options.scriptOptions?.vaultPrompt,
        recordDiagnosticEvent: options.recordDiagnosticEvent || options.scriptOptions?.recordDiagnosticEvent
      },
      sandboxPackages: options.sandboxPackages || options.scriptOptions?.sandboxPackages || [],
      clientCertificates: collection?.certificates || [],
      fileBindings: options.fileBindings || options.scriptOptions?.fileBindings || [],
      vault: options.vault || options.scriptOptions?.vault,
      vaultPrompt: options.vaultPrompt || options.scriptOptions?.vaultPrompt,
      trustedCapabilities: options.trustedCapabilities || options.scriptOptions?.trustedCapabilities || {},
      iterationData: inheritedIterationData,
      collectionId: collection?.id || '',
      collectionName: collection?.name || '',
      executionLocation: executionLocationForEntry(collection, targetEntry),
      iteration: options.iteration || 0,
      iterationCount: options.iterationCount || 1,
      workspaceId: options.workspaceId || options.scriptOptions?.workspaceId || '',
      workspaceName: options.workspaceName || options.scriptOptions?.workspaceName || '',
      recordDiagnosticEvent: options.recordDiagnosticEvent || options.scriptOptions?.recordDiagnosticEvent
    });
    if (Array.isArray(scriptedRequest.cookies)) {
      scopeState.cookies = scriptedRequest.cookies;
    }
    if (preRequestScriptShouldAbortRequest(scriptedRequest.preRequestScriptResult)) {
      return runRequestBrokerResult(targetEntry, scriptedRequest, null, []);
    }
    if (scriptedRequest.skipped) {
      return runRequestBrokerResult(targetEntry, scriptedRequest, null, [], { skipped: true });
    }
    const response = scriptedRequest.response;
    if (Array.isArray(response?.updatedCookies)) {
      scopeState.cookies = response.updatedCookies;
    }
    if (response?.updatedAuth) {
      rememberRefreshedAuth(targetEntry.request, response.updatedAuth, refreshedAuthByRequestId);
    }
    const assertions = evaluateAssertions(response, targetRequest.assertions || []);
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
    const iterationData = Array.isArray(entry.request?.iterationData)
      ? entry.request.iterationData
      : (options.iterationData || []);
    const requestForExecution = requestWithRefreshedAuth(entry.request, refreshedAuthByRequestId);
    const startedAt = new Date().toISOString();
    try {
      const scriptedRequest = await runScriptedRequestLifecycle(
        createScriptedRequestState(requestForExecution, runnerEnvironment, {
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
          vaultPrompt: options.vaultPrompt || options.scriptOptions?.vaultPrompt,
          runRequest: createRunRequestBroker(0, iterationData),
          iterationData,
          collectionId: collection?.id || '',
          collectionName: collection?.name || '',
          executionLocation: executionLocationForEntry(collection, entry),
          iteration: options.iteration || 0,
          iterationCount: options.iterationCount || 1,
          workspaceId: options.workspaceId || options.scriptOptions?.workspaceId || '',
          workspaceName: options.workspaceName || options.scriptOptions?.workspaceName || '',
          recordDiagnosticEvent: options.recordDiagnosticEvent || options.scriptOptions?.recordDiagnosticEvent
        }
      );
      if (Array.isArray(scriptedRequest.cookies)) {
        runnerCookies = scriptedRequest.cookies;
      }
      const displayFields = runResultRequestDisplayFields(
        entry,
        scriptedRequest.request || requestForExecution,
        runtimeEnvironment(runnerCollectionVariables, runnerEnvironment, scriptedRequest.localVariables, {
          globals: runnerGlobals,
          iterationData
        })
      );
      if (preRequestScriptShouldAbortRequest(scriptedRequest.preRequestScriptResult)) {
        const result = scriptFailureResult(
          entry,
          startedAt,
          scriptedRequest.preRequestScriptResult,
          scriptedRequest.localVariables,
          displayFields
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
        const result = skippedResult(entry, startedAt, scriptedRequest, displayFields);
        results.push(result);
        progress(progressEvent(index + 1, requests.length, result));
        index = nextRequestIndex(index, requests, scriptedRequest.execution);
        continue;
      }
      const response = scriptedRequest.response;
      if (Array.isArray(response.updatedCookies)) {
        runnerCookies = response.updatedCookies;
      }
      if (response.updatedAuth) {
        rememberRefreshedAuth(entry.request, response.updatedAuth, refreshedAuthByRequestId);
      }
      const assertions = evaluateAssertions(response, requestForExecution.assertions || []);
      applyExtractedVariables(runnerEnvironment, assertions.extractedVariables);
      const passed = assertions.passed
        && scriptedRequest.preRequestScriptResult.passed
        && scriptedRequest.testScriptResult.passed;
      const result = {
        requestId: entry.request.id,
        requestName: entry.request.name,
        ...displayFields,
        folderName: entry.folderName,
        ...runnerIterationResultFields(entry),
        startedAt,
        statusCode: response.statusCode,
        durationMillis: response.durationMillis,
        responseBody: boundedRunResultResponseBody(response.body),
        responseBytes: response.responseBytes || Buffer.byteLength(response.body || '', 'utf8'),
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
      const displayFields = runResultRequestDisplayFields(
        entry,
        requestForExecution,
        runtimeEnvironment(runnerCollectionVariables, runnerEnvironment, requestForExecution.variables || [], {
          globals: runnerGlobals,
          iterationData
        })
      );
      const result = {
        requestId: entry.request.id,
        requestName: entry.request.name,
        ...displayFields,
        folderName: entry.folderName,
        ...runnerIterationResultFields(entry),
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
  const result = {
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
  attachInternalAuthUpdates(result, refreshedAuthByRequestId);
  return result;
}

async function runRunner(runner, environment, options = {}) {
  const normalizedRunner = runnerModel(runner);
  const requests = expandRunnerRequests(normalizedRunner.requests, options.maxRunnerExecutions);
  const iterationRows = await csvVariableIterationRows(normalizedRunner.csvVariables, requests.length);
  if (iterationRows.length) {
    requests.forEach((request, index) => {
      request.iterationData = iterationRows[index] || [];
    });
  }
  const runnerCollection = {
    id: normalizedRunner.id,
    name: normalizedRunner.name,
    description: '',
    variables: [],
    certificates: [],
    requests,
    folders: []
  };
  const result = await runCollection(runnerCollection, environment, {
    ...options,
    stopOnFailure: options.stopOnFailure ?? normalizedRunner.stopOnFailure
  });
  result.runnerId = normalizedRunner.id;
  result.runnerName = normalizedRunner.name;
  result.runnerEnvironmentId = normalizedRunner.environmentId;
  result.environmentMutationAllowed = options.allowEnvironmentMutation ?? normalizedRunner.allowEnvironmentMutation === true;
  result.collectionId = '';
  result.collectionName = normalizedRunner.name;
  if (result.environmentMutationAllowed) {
    result.mutatedEnvironment = result.environment;
  }
  return result;
}

async function csvVariableIterationRows(csvVariables, requiredRows) {
  const normalizedCsvVariables = normalizeCsvVariableData(csvVariables);
  if (!csvVariablesEnabled(normalizedCsvVariables)) {
    return [];
  }
  const normalizedRequiredRows = Number.isFinite(Number(requiredRows))
    ? Math.max(0, Math.floor(Number(requiredRows)))
    : 0;
  if (normalizedRequiredRows <= 0) {
    return [];
  }
  if (normalizedCsvVariables.activeSource === 'inline' && String(normalizedCsvVariables.values || '').trim()) {
    return csvVariablesToIterationRows(normalizedCsvVariables, String(normalizedCsvVariables.values || ''), { requiredRows: normalizedRequiredRows });
  }
  if (normalizedCsvVariables.activeSource !== 'file') {
    return csvVariablesToIterationRows(normalizedCsvVariables, '', { requiredRows: normalizedRequiredRows });
  }
  const filePath = String(normalizedCsvVariables.filePath || '').trim();
  const records = await csvVariableRecordsFromFile(filePath, normalizedRequiredRows);
  return csvRecordsToIterationRows(normalizedCsvVariables, records, { requiredRows: normalizedRequiredRows });
}

async function csvVariableRecordsFromFile(filePath, requiredRows) {
  const stat = await fsp.stat(filePath).catch((error) => {
    throw new Error(`Unable to read CSV variable file: ${error?.code || error?.message || 'unknown error'}.`);
  });
  if (!stat.isFile()) {
    throw new Error('CSV variable file must be a regular file.');
  }
  return readCsvRecordsFromFile(filePath, requiredRows);
}

async function readCsvRecordsFromFile(filePath, requiredRows) {
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;
  let hasOpenRecord = false;
  let pendingQuote = false;
  let skipNextLf = false;
  let firstChar = true;

  const pushField = () => {
    record.push(field);
    field = '';
    hasOpenRecord = true;
  };
  const finishRecord = () => {
    pushField();
    if (!record.every((value) => String(value || '').trim() === '')) {
      records.push(record);
      if (records.length >= requiredRows) {
        return true;
      }
    }
    record = [];
    hasOpenRecord = false;
    return false;
  };
  const processOutsideQuote = (char) => {
    if (char === '"') {
      if (field.length === 0) {
        inQuotes = true;
      } else {
        field += char;
      }
      return false;
    }
    if (char === ',') {
      pushField();
      return false;
    }
    if (char === '\n' || char === '\r') {
      const done = finishRecord();
      if (char === '\r') {
        skipNextLf = true;
      }
      return done;
    }
    field += char;
    return false;
  };
  const processChar = (char) => {
    if (firstChar) {
      firstChar = false;
      if (char === '\uFEFF') {
        return false;
      }
    }
    if (skipNextLf) {
      skipNextLf = false;
      if (char === '\n') {
        return false;
      }
    }
    if (pendingQuote) {
      if (char === '"') {
        field += '"';
        pendingQuote = false;
        return false;
      }
      pendingQuote = false;
      inQuotes = false;
    }
    if (inQuotes) {
      if (char === '"') {
        pendingQuote = true;
      } else {
        field += char;
      }
      return false;
    }
    return processOutsideQuote(char);
  };

  for await (const chunk of fs.createReadStream(filePath, { encoding: 'utf8' })) {
    for (const char of chunk) {
      if (processChar(char)) {
        return records;
      }
    }
  }
  if (pendingQuote) {
    pendingQuote = false;
    inQuotes = false;
  }
  if (inQuotes) {
    throw new Error('CSV input has an unterminated quoted field.');
  }
  if (hasOpenRecord || field.length > 0) {
    finishRecord();
  }
  return records;
}

function expandRunnerRequests(requests, maxTotal = MAX_RUNNER_TOTAL_ITERATIONS) {
  const limit = Math.max(1, Math.min(MAX_RUNNER_TOTAL_ITERATIONS, Number(maxTotal) || MAX_RUNNER_TOTAL_ITERATIONS));
  const expanded = [];
  for (const request of Array.isArray(requests) ? requests : []) {
    const iterations = normalizeRunnerRequestIterations(request?.iterations);
    if (expanded.length + iterations > limit) {
      throw new Error(`Runner cannot execute more than ${limit} request iterations in one run.`);
    }
    for (let index = 0; index < iterations; index += 1) {
      expanded.push({
        ...request,
        runnerIteration: index + 1,
        runnerIterations: iterations
      });
    }
  }
  return expanded;
}

function requestWithRefreshedAuth(request, refreshedAuthByRequestId) {
  const requestId = request?.id || '';
  if (!requestId || !refreshedAuthByRequestId.has(requestId)) {
    return request;
  }
  return {
    ...request,
    auth: refreshedAuthByRequestId.get(requestId)
  };
}

function rememberRefreshedAuth(request, auth, refreshedAuthByRequestId) {
  if (request?.id) {
    refreshedAuthByRequestId.set(request.id, auth);
  }
  request.auth = auth;
}

function attachInternalAuthUpdates(result, refreshedAuthByRequestId) {
  if (!refreshedAuthByRequestId.size) {
    return result;
  }
  const updates = new Map(refreshedAuthByRequestId);
  Object.defineProperty(result, 'authUpdates', {
    configurable: true,
    enumerable: false,
    value: updates
  });
  for (const item of result.results || []) {
    if (!item?.requestId || !updates.has(item.requestId)) {
      continue;
    }
    Object.defineProperty(item, 'updatedAuth', {
      configurable: true,
      enumerable: false,
      value: updates.get(item.requestId)
    });
  }
  return result;
}

function findRunRequestTarget(requests, target) {
  const values = requestTargetCandidates(target);
  if (!values.length) {
    return null;
  }
  return requests.find((entry) => requestMatchesAnyTarget(entry.request, values)) || null;
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
  return requestMatchesAnyTarget(request, requestTargetCandidates(target));
}

function requestMatchesAnyTarget(request, targets) {
  const values = Array.isArray(targets) ? targets : [];
  if (!values.length) {
    return false;
  }
  const aliases = postmanCompatibleRequestAliases(request);
  return values.some((value) => aliases.includes(value));
}

function requestTargetCandidates(target) {
  const value = String(target || '').trim();
  if (!value) {
    return [];
  }
  const candidates = new Set([value]);
  addDecodedCandidate(candidates, value);
  addRequestLinkCandidates(candidates, value);
  return [...candidates].filter(Boolean);
}

function addDecodedCandidate(candidates, value) {
  try {
    const decoded = decodeURIComponent(value);
    if (decoded && decoded !== value) {
      candidates.add(decoded);
    }
  } catch {
    // Invalid percent escapes leave the original target as the only candidate.
  }
}

function addRequestLinkCandidates(candidates, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  for (const [key, itemValue] of url.searchParams.entries()) {
    if (/request/i.test(key) && itemValue) {
      candidates.add(itemValue.trim());
      addDecodedCandidate(candidates, itemValue.trim());
    }
  }
  for (const itemValue of requestTargetValuesFromPath(url.pathname)) {
    candidates.add(itemValue);
    addDecodedCandidate(candidates, itemValue);
  }
  if (url.hash) {
    for (const itemValue of requestTargetValuesFromPath(url.hash.replace(/^#/, ''))) {
      candidates.add(itemValue);
      addDecodedCandidate(candidates, itemValue);
    }
  }
}

function requestTargetValuesFromPath(pathname) {
  const segments = String(pathname || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const values = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.toLowerCase() === 'request') {
      values.push(...segments.slice(index + 1));
      break;
    }
  }
  if (segments.length) {
    values.push(segments[segments.length - 1]);
  }
  return [...new Set(values)];
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

function skippedResult(entry, startedAt, scriptedRequest, displayFields = {}) {
  return {
    requestId: entry.request.id,
    requestName: entry.request.name,
    ...displayFields,
    folderName: entry.folderName,
    ...runnerIterationResultFields(entry),
    startedAt,
    statusCode: 0,
    durationMillis: 0,
    responseBody: '',
    responseBytes: 0,
    passed: true,
    assertionResults: [],
    preRequestScriptResult: scriptedRequest.preRequestScriptResult,
    testScriptResult: emptyScriptResult(),
    extractedVariables: [],
    localVariables: scriptedRequest.localVariables,
    error: ''
  };
}

function scriptFailureResult(entry, startedAt, preRequestScriptResult, localVariables = [], displayFields = {}) {
  const error = scriptResultFailureMessage(preRequestScriptResult, 'Pre-request script failed.');
  return {
    requestId: entry.request.id,
    requestName: entry.request.name,
    ...displayFields,
    folderName: entry.folderName,
    ...runnerIterationResultFields(entry),
    startedAt,
    statusCode: 0,
    durationMillis: 0,
    responseBody: '',
    responseBytes: 0,
    passed: false,
    assertionResults: [],
    preRequestScriptResult,
    testScriptResult: emptyScriptResult(),
    extractedVariables: [],
    localVariables,
    error
  };
}

function runResultRequestDisplayFields(entry, request, environment) {
  const source = request || entry?.request || {};
  const fallback = entry?.request || {};
  return {
    requestDisplayName: resolveEnvironmentValue(source.name || fallback.name || '', environment) || fallback.name || '',
    requestMethod: String(source.method || fallback.method || '').trim(),
    requestUrl: resolveEnvironmentValue(source.url || fallback.url || '', environment)
  };
}

function runnerIterationResultFields(entry) {
  const runnerIteration = Number(entry?.request?.runnerIteration);
  const runnerIterations = Number(entry?.request?.runnerIterations);
  if (!Number.isInteger(runnerIteration) || !Number.isInteger(runnerIterations) || runnerIteration < 1 || runnerIterations < 1) {
    return {};
  }
  return { runnerIteration, runnerIterations };
}

function boundedRunResultResponseBody(body) {
  const text = String(body || '');
  if (text.length <= MAX_RUN_RESULT_RESPONSE_BODY_CHARS) {
    return text;
  }
  const sliceLength = Math.max(0, MAX_RUN_RESULT_RESPONSE_BODY_CHARS - RUN_RESULT_RESPONSE_BODY_TRUNCATION_NOTICE.length);
  return `${text.slice(0, sliceLength)}${RUN_RESULT_RESPONSE_BODY_TRUNCATION_NOTICE}`;
}

function progressEvent(completedRequests, totalRequests, result) {
  return {
    completedRequests,
    totalRequests,
    requestId: result.requestId,
    requestName: result.requestDisplayName || result.requestName,
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
  MAX_RUNNER_TOTAL_ITERATIONS,
  collectionRunResultToCsv,
  csvVariableIterationRows,
  expandRunnerRequests,
  runCollection,
  runRunner
};
