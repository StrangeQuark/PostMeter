function variableValue(pair) {
  return pair?.value ?? '';
}

function variableObservableValue(variable) {
  const value = variable?.value
    ?? variable?.currentValue
    ?? variable?.current
    ?? variable?.initialValue
    ?? variable?.initial
    ?? '';
  return value == null ? '' : String(value);
}

function renderEnvironmentPairs(pairs) {
  const container = $('environmentTable');
  container.textContent = '';
  pairs.forEach((pair, index) => {
    const row = document.createElement('div');
    row.className = 'kv-row env-row';
    const rowNumber = index + 1;
    const variableName = String(pair.key || '').trim();
    const variableLabel = variableName || String(rowNumber);
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = pair.enabled !== false;
    enabled.setAttribute('aria-label', `Environment variable ${rowNumber} enabled`);
    enabled.addEventListener('change', () => {
      pair.enabled = enabled.checked;
      markActiveEnvironmentDirty();
      renderVariablePreview();
      refreshVariableHighlights();
    });
    const key = document.createElement('input');
    key.placeholder = 'Variable';
    key.value = pair.key || '';
    key.setAttribute('aria-label', `Environment variable ${rowNumber} name`);
    key.addEventListener('input', () => {
      pair.key = key.value;
      markActiveEnvironmentDirty();
      renderVariablePreview();
      refreshVariableHighlights();
    });
    const value = document.createElement('input');
    value.placeholder = 'Value';
    value.type = 'text';
    value.value = pair.value || '';
    value.setAttribute('aria-label', `Environment variable ${rowNumber} value`);
    value.addEventListener('input', () => {
      pair.value = value.value;
      markActiveEnvironmentDirty();
      renderVariablePreview();
    });
    const remove = document.createElement('button');
    remove.className = 'danger-button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove environment variable ${variableLabel}`);
    remove.addEventListener('click', () => {
      pairs.splice(index, 1);
      markActiveEnvironmentDirty();
      renderEnvironmentEditor();
      refreshVariableHighlights();
    });
    row.append(enabled, key, value, remove);
    container.append(row);
  });
}

function normalizeHistoryRequestMethod(item) {
  return METHODS.includes(item?.method) ? item.method : 'GET';
}

function historyRequestName(item) {
  const method = normalizeHistoryRequestMethod(item);
  const url = String(item?.url || '').trim();
  return url ? `${method} ${url}` : `${method} History Request`;
}

function openHistoryItemAsDraftRequest(item) {
  if (!canOpenAdditionalRequestTab()) {
    return null;
  }
  collectActiveEditorState();
  const method = normalizeHistoryRequestMethod(item);
  const url = String(item?.url || '');
  const draftRequest = newRequestObject(uniqueName(
    historyRequestName(item),
    Array.from(draftRequests.values()).map((request) => request.name)
  ));
  draftRequest.method = method;
  draftRequest.url = url;
  draftRequests.set(draftRequest.id, draftRequest);
  activeMainPanel = 'request';
  activeRunnerRequestRunnerId = null;
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = draftRequest.id;
  ensureOpenRequestTabForActive();
  renderAll();
  setStatus('Opened history entry as an unsaved request.');
  return draftRequest;
}

function renderHistory() {
  const container = $('historyList');
  container.textContent = '';
  for (const item of workspace.history || []) {
    const button = document.createElement('button');
    button.className = 'history-item';
    button.textContent = `${item.method} ${item.statusCode || 'ERR'} ${item.url}`;
    button.addEventListener('click', () => {
      openHistoryItemAsDraftRequest(item);
    });
    container.append(button);
  }
}

async function clearHistory() {
  if (!(await confirmActionModal({
    title: 'Clear history?',
    message: 'Clearing the history cannot be undone. Do you want to proceed?',
    confirmLabel: 'Clear History',
    danger: true
  }))) {
    return false;
  }
  workspace.history = [];
  renderHistory();
  renderWorkspacePanel();
  setStatus('History cleared.');
  return true;
}

async function sendActiveRequest() {
  return rendererWorkflows.sendActiveRequest();
}

function displayResponse(response) {
  $('responseStatus').textContent = response.skipped === true ? 'SKIP' : response.statusCode || 'ERR';
  $('responseTime').textContent = `${response.durationMillis} ms`;
  $('responseSize').textContent = formatBytes(response.responseBytes);
  $('finalUrl').textContent = response.finalUrl;
  $('responseHeaders').value = formatResponseHeaders(response);
  $('responseCookies').value = formatResponseCookies(response);
  if ($('responseNetwork')) {
    $('responseNetwork').value = formatResponseNetwork(response);
  }
  $('responseBody').value = PostMeterResponseFormatting.formatBody(response);
  CodeEditor.setLanguage?.($('responseHeaders'), 'headers');
  CodeEditor.setLanguage?.($('responseCookies'), 'headers');
  CodeEditor.setLanguage?.($('responseNetwork'), 'text');
  CodeEditor.setLanguage?.($('responseBody'), responseBodyCodeLanguage(response, $('responseBody').value));
  displayTestResults(response);
  displayVisualizer(response.testScriptResult?.visualizer);
}

function refreshResponseEditors({ body, bodyLanguage = 'text', cookies, headers, network } = {}) {
  CodeEditor.setLanguage?.(headers || $('responseHeaders'), 'headers');
  CodeEditor.setLanguage?.(cookies || $('responseCookies'), 'headers');
  CodeEditor.setLanguage?.(network || $('responseNetwork'), 'text');
  CodeEditor.setLanguage?.(body || $('responseBody'), bodyLanguage);
}

function formatResponseHeaders(response) {
  return Object.entries(response?.headers || {})
    .map(([key, values]) => `${key}: ${normalizeResponseHeaderValues(values).join(', ')}`)
    .join('\n');
}

function formatResponseCookies(response) {
  return Object.entries(response?.headers || {})
    .filter(([key]) => key.toLowerCase() === 'set-cookie')
    .flatMap(([, values]) => normalizeResponseHeaderValues(values))
    .join('\n');
}

function formatResponseNetwork(response) {
  const lines = [];
  if (response?.finalUrl) {
    lines.push(`Final URL: ${response.finalUrl}`);
  }
  if (Number.isFinite(Number(response?.durationMillis))) {
    lines.push(`Total duration: ${Number(response.durationMillis)} ms`);
  }
  const timings = response?.timings || {};
  const timingRows = [
    ['DNS lookup', timings.dnsLookupMillis],
    ['TCP connect', timings.tcpConnectMillis],
    ['TLS handshake', timings.tlsHandshakeMillis],
    ['Upload', timings.uploadMillis],
    ['Time to first byte', timings.timeToFirstByteMillis],
    ['Download', timings.downloadMillis],
    ['Redirects', timings.redirectCount]
  ];
  for (const [label, value] of timingRows) {
    if (Number.isFinite(Number(value))) {
      lines.push(`${label}: ${Number(value)}${label === 'Redirects' ? '' : ' ms'}`);
    }
  }
  const tlsInfo = response?.tls || timings.tls || {};
  if (Object.keys(tlsInfo).length) {
    lines.push('');
    lines.push('TLS');
    lines.push(`Authorized: ${tlsInfo.authorized === true ? 'yes' : tlsInfo.authorized === false ? 'no' : 'not captured'}`);
    if (tlsInfo.authorizationError) {
      lines.push(`Authorization error: ${tlsInfo.authorizationError}`);
    }
    if (tlsInfo.verificationDisabled === true) {
      lines.push('Verification: disabled by settings');
    }
    if (tlsInfo.caCertificateConfigured === true) {
      lines.push('Custom CA: configured');
    }
    if (tlsInfo.clientCertificateConfigured === true) {
      lines.push(`Client certificate: ${tlsInfo.clientCertificateName || tlsInfo.clientCertificateId || 'configured'}`);
    }
    if (tlsInfo.protocol) {
      lines.push(`Protocol: ${tlsInfo.protocol}`);
    }
    if (tlsInfo.cipher?.name) {
      lines.push(`Cipher: ${tlsInfo.cipher.name}`);
    }
    if (tlsInfo.certificate) {
      lines.push(`Subject: ${tlsInfo.certificate.subject || ''}`);
      lines.push(`Issuer: ${tlsInfo.certificate.issuer || ''}`);
      lines.push(`Valid from: ${tlsInfo.certificate.validFrom || ''}`);
      lines.push(`Valid to: ${tlsInfo.certificate.validTo || ''}`);
      lines.push(`Fingerprint SHA-256: ${tlsInfo.certificate.fingerprint256 || ''}`);
    }
  }
  return lines.filter((line) => line != null).join('\n') || 'No network diagnostics captured.';
}

function normalizeResponseHeaderValues(values) {
  return (Array.isArray(values) ? values : [values])
    .filter((value) => value != null)
    .map((value) => String(value));
}

function responseBodyCodeLanguage(response, formattedBody = '') {
  const body = String(formattedBody || response?.body || '').trim();
  const contentType = Object.entries(response?.headers || {})
    .find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.join(',').toLowerCase() || '';
  if (contentType.includes('json') || body.startsWith('{') || body.startsWith('[')) {
    return 'json';
  }
  if (contentType.includes('html') || contentType.includes('xml') || body.startsWith('<')) {
    return 'markup';
  }
  return 'text';
}

function displayTestResults(response) {
  const summary = $('testResultsSummary');
  if (!summary) {
    return;
  }
  const hasResponse = response && typeof response === 'object';
  const preRequestResult = normalizeScriptResult(response?.preRequestScriptResult);
  const postRequestResult = normalizeScriptResult(response?.testScriptResult);
  const preRequestStats = renderScriptResultColumn('preRequest', preRequestResult, hasResponse ? 'No tests recorded.' : 'No test results yet.');
  const postRequestStats = renderScriptResultColumn('postRequest', postRequestResult, hasResponse ? 'No tests recorded.' : 'No test results yet.');
  const total = preRequestStats.total + postRequestStats.total;
  const passed = preRequestStats.passed + postRequestStats.passed;
  const failed = preRequestStats.failed + postRequestStats.failed;
  const skipped = preRequestStats.skipped + postRequestStats.skipped;
  const tabCount = $('testResultsTabCount');

  if (tabCount) {
    tabCount.textContent = total ? `(${passed}/${total})` : '';
    tabCount.hidden = total === 0;
  }
  if (!hasResponse) {
    summary.textContent = 'No test results yet.';
    return;
  }
  if (!total) {
    summary.textContent = 'No tests recorded for this response.';
    return;
  }
  summary.textContent = testResultSummaryText({ total, passed, failed, skipped });
}

function normalizeScriptResult(result) {
  return result && typeof result === 'object' ? result : null;
}

function renderScriptResultColumn(prefix, scriptResult, emptyText) {
  const list = $(`${prefix}TestResults`);
  const summary = $(`${prefix}ResultsSummary`);
  const stats = scriptResultStats(scriptResult);
  if (!list || !summary) {
    return stats;
  }
  list.textContent = '';
  summary.textContent = stats.total ? testResultSummaryText(stats) : 'No tests';

  if (!scriptResult) {
    appendEmptyTestResult(list, emptyText);
    return stats;
  }

  const topLevelError = scriptResultTopLevelError(scriptResult);
  if (topLevelError) {
    appendTestResultRow(list, {
      status: 'error',
      name: 'Script error',
      detail: topLevelError
    });
  }

  for (const test of Array.isArray(scriptResult.tests) ? scriptResult.tests : []) {
    appendTestResultRow(list, {
      status: scriptTestStatus(test),
      name: String(test?.name || 'Unnamed test'),
      detail: String(test?.error || '')
    });
  }

  const logs = Array.isArray(scriptResult.logs) ? scriptResult.logs : [];
  for (const log of logs) {
    appendTestResultRow(list, {
      status: 'log',
      name: 'Console',
      detail: String(log || '')
    });
  }

  if (!list.children.length) {
    appendEmptyTestResult(list, emptyText);
  }
  return stats;
}

function scriptResultStats(scriptResult) {
  if (!scriptResult) {
    return { total: 0, passed: 0, failed: 0, skipped: 0 };
  }
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const tests = Array.isArray(scriptResult.tests) ? scriptResult.tests : [];
  for (const test of tests) {
    if (test?.skipped === true) {
      skipped += 1;
    } else if (test?.passed === true) {
      passed += 1;
    } else {
      failed += 1;
    }
  }
  const topLevelErrorCount = scriptResultTopLevelError(scriptResult) ? 1 : 0;
  return {
    total: tests.length + topLevelErrorCount,
    passed,
    failed: failed + topLevelErrorCount,
    skipped
  };
}

function scriptResultTopLevelError(scriptResult) {
  const explicitError = String(scriptResult?.error || '').trim();
  if (explicitError) {
    return explicitError;
  }
  const tests = Array.isArray(scriptResult?.tests) ? scriptResult.tests : [];
  const hasFailedTest = tests.some((test) => test?.skipped !== true && test?.passed !== true);
  if (scriptResult?.passed === false && !hasFailedTest) {
    return 'Script failed.';
  }
  return '';
}

function scriptTestStatus(test) {
  if (test?.skipped === true) {
    return 'skipped';
  }
  return test?.passed === true ? 'passed' : 'failed';
}

function testResultSummaryText(stats) {
  const parts = [`${stats.passed}/${stats.total} passed`];
  if (stats.failed) {
    parts.push(`${stats.failed} ${plural(stats.failed, 'failed test', 'failed tests')}`);
  }
  if (stats.skipped) {
    parts.push(`${stats.skipped} ${plural(stats.skipped, 'skipped test', 'skipped tests')}`);
  }
  return parts.join(', ');
}

function appendTestResultRow(list, result) {
  const row = document.createElement('div');
  row.className = 'test-result-row';
  const badge = document.createElement('span');
  badge.className = `test-result-badge ${result.status}`;
  badge.textContent = testResultStatusLabel(result.status);
  const content = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'test-result-name';
  name.textContent = result.name;
  content.append(name);
  if (result.detail) {
    const detail = document.createElement('div');
    detail.className = result.status === 'log' ? 'test-result-log' : 'test-result-error';
    detail.textContent = result.detail;
    content.append(detail);
  }
  row.append(badge, content);
  list.append(row);
}

function appendEmptyTestResult(list, message) {
  const empty = document.createElement('p');
  empty.className = 'test-result-empty';
  empty.textContent = message;
  list.append(empty);
}

function testResultStatusLabel(status) {
  if (status === 'passed') {
    return 'PASSED';
  }
  if (status === 'skipped') {
    return 'SKIPPED';
  }
  if (status === 'error') {
    return 'ERROR';
  }
  if (status === 'log') {
    return 'LOG';
  }
  return 'FAILED';
}

function ensureRunnerResultsStructure() {
  const root = $('runnerResults');
  if (!root) {
    return null;
  }
  if ($('runnerResultsSummary') && $('runnerExecutionList') && $('runnerExecutionDetails')) {
    return root;
  }
  root.textContent = '';

  let summary = $('runnerResultsSummary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'runnerResultsSummary';
    summary.className = 'test-results-summary';
    summary.textContent = 'No runner run yet.';
    root.append(summary);
  }

  const grid = document.createElement('div');
  grid.className = 'runner-execution-grid';
  grid.append(
    runnerExecutionSection('runnerExecutionTitle', 'Execution', 'runnerExecutionSummary', 'No requests', 'runnerExecutionList', 'runner-execution-list'),
    runnerExecutionSection('runnerExecutionDetailsTitle', 'Request details', 'runnerExecutionDetailsStatus', 'No selection', 'runnerExecutionDetails', 'runner-execution-details')
  );
  root.append(grid);
  return root;
}

function runnerExecutionSection(titleId, titleText, summaryId, summaryText, bodyId, bodyClassName) {
  const section = document.createElement('section');
  section.className = `script-results-section ${bodyClassName === 'runner-execution-list' ? 'runner-execution-section' : 'runner-detail-section'}`;
  section.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'script-results-header';
  const title = document.createElement('h3');
  title.id = titleId;
  title.textContent = titleText;
  const summary = document.createElement('span');
  summary.id = summaryId;
  summary.className = 'script-results-count';
  summary.textContent = summaryText;
  if (bodyId === 'runnerExecutionList') {
    header.append(executionStatusFilterTitleRow(title, 'runnerExecutionStatusFilter', 'Filter runner requests by status code'));
  } else {
    header.append(title);
  }
  header.append(summary);

  const body = document.createElement('div');
  body.id = bodyId;
  body.className = bodyClassName;
  if (bodyId === 'runnerExecutionList') {
    body.setAttribute('aria-live', 'polite');
  }
  appendEmptyTestResult(body, bodyId === 'runnerExecutionList'
    ? 'No runner execution yet.'
    : 'Select a completed request to inspect its execution details.');

  section.append(header, body);
  if (bodyId === 'runnerExecutionList') {
    const pagination = document.createElement('div');
    pagination.id = 'runnerExecutionPagination';
    pagination.className = 'runner-execution-pagination';
    pagination.hidden = true;
    section.append(pagination);
  }
  return section;
}

function renderRunnerExecutionMessage(message, options = {}) {
  if (options.plain === true) {
    $('runnerResults').textContent = message;
    return;
  }
  ensureRunnerResultsStructure();
  $('runnerResultsSummary').textContent = message || 'No runner run yet.';
  $('runnerExecutionSummary').textContent = 'No requests';
  $('runnerExecutionList').textContent = '';
  appendEmptyTestResult($('runnerExecutionList'), message || 'No runner execution yet.');
  clearExecutionPagination('runnerExecutionPagination');
  clearExecutionStatusFilter('runnerExecutionStatusFilter');
  $('runnerExecutionDetailsStatus').textContent = 'No selection';
  $('runnerExecutionDetails').textContent = '';
  appendEmptyTestResult($('runnerExecutionDetails'), 'Select a completed request to inspect its execution details.');
}

function renderRunnerExecutionProgress(progress = {}) {
  ensureRunnerResultsStructure();
  const completed = Number(progress.completedRequests || 0);
  const total = Number(progress.totalRequests || 0);
  const requestName = progress.requestName ? ` Last: ${progress.requestName}.` : '';
  $('runnerResultsSummary').textContent = `Running runner... ${completed}/${total} completed.${requestName}`;
  $('runnerExecutionSummary').textContent = total ? `${completed}/${total} completed` : 'Running';
  $('runnerExecutionList').textContent = '';
  appendEmptyTestResult($('runnerExecutionList'), completed ? 'Waiting for final request details.' : 'Waiting for the first request to complete.');
  clearExecutionPagination('runnerExecutionPagination');
  clearExecutionStatusFilter('runnerExecutionStatusFilter');
  $('runnerExecutionDetailsStatus').textContent = 'Running';
  $('runnerExecutionDetails').textContent = '';
  appendEmptyTestResult($('runnerExecutionDetails'), 'Runner execution is still in progress.');
}

function renderRunnerExecutionResult(result = lastRunnerResult) {
  ensureRunnerResultsStructure();
  if (result?.storeBacked === true && window.postmeter?.runner?.resultPage) {
    return renderStoredRunnerExecutionResult(result);
  }
  const results = Array.isArray(result?.results) ? result.results : [];
  runnerExecutionStatusFilter = renderExecutionStatusFilter({
    selectId: 'runnerExecutionStatusFilter',
    items: results,
    selected: runnerExecutionStatusFilter,
    onChange: (status) => {
      runnerExecutionStatusFilter = status;
      runnerExecutionPage = 0;
      selectedRunnerExecutionIndex = firstFilteredExecutionIndex(results, runnerExecutionStatusFilter);
      renderRunnerExecutionResult(lastRunnerResult);
    }
  });
  const filteredResults = filteredExecutionEntries(results, runnerExecutionStatusFilter);
  selectedRunnerExecutionIndex = selectedExecutionIndexForEntries(selectedRunnerExecutionIndex, filteredResults);
  const failedRequests = Number(result?.failedRequests ?? results.filter((item) => item?.passed !== true).length);
  const completedRequests = Number(result?.totalRequests ?? results.length);
  const httpResponses = runnerHttpResponseCount(result, results);
  const cancelled = result?.cancelled === true ? ', cancelled' : '';
  $('runnerResultsSummary').textContent = results.length
    ? [
        `${completedRequests} ${plural(completedRequests, 'request', 'requests')} completed`,
        httpResponses == null ? '' : `${httpResponses} HTTP ${plural(httpResponses, 'response', 'responses')}`,
        `${failedRequests} failed${cancelled}`
      ].filter(Boolean).join(', ') + '.'
    : 'No runner execution results were returned.';
  runnerExecutionPage = executionPageForFilteredEntries(selectedRunnerExecutionIndex, filteredResults, runnerExecutionPage);
  const pageRange = executionPageRange(filteredResults.length, runnerExecutionPage);
  const visibleResults = filteredResults.slice(pageRange.startIndex, pageRange.endIndex);
  $('runnerExecutionSummary').textContent = filteredResults.length
    ? executionFilterSummaryText(pageRange, filteredResults.length, results.length, 'result', runnerExecutionStatusFilter)
    : 'No requests';

  const list = $('runnerExecutionList');
  list.textContent = '';
  if (!results.length) {
    appendEmptyTestResult(list, 'No request results were recorded.');
  } else if (!filteredResults.length) {
    appendEmptyTestResult(list, 'No request results match this status filter.');
  } else {
    visibleResults.forEach((entry) => list.append(runnerExecutionRow(entry.item, entry.index)));
  }
  renderExecutionPagination({
    containerId: 'runnerExecutionPagination',
    label: 'Runner request results',
    onPageChange: (nextPage) => {
      runnerExecutionPage = nextPage;
      const nextRange = executionPageRange(filteredResults.length, nextPage);
      selectedRunnerExecutionIndex = filteredResults[nextRange.startIndex]?.index ?? 0;
      renderRunnerExecutionResult(lastRunnerResult);
    },
    page: runnerExecutionPage,
    totalItems: filteredResults.length
  });
  renderRunnerExecutionDetails(result);
}

function runnerHttpResponseCount(result, results) {
  const explicit = Number(result?.httpResponses);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  if (!Array.isArray(results) || results.length > EXECUTION_RESULT_PAGE_SIZE * 10) {
    return null;
  }
  return results.filter((item) => Number(item?.statusCode) > 0).length;
}

function renderStoredRunnerExecutionResult(result = lastRunnerResult) {
  ensureRunnerResultsStructure();
  const pageInfo = result.resultPage || {};
  const statusCounts = pageInfo.statusCounts || {};
  runnerExecutionStatusFilter = renderExecutionStatusFilterFromCounts({
    selectId: 'runnerExecutionStatusFilter',
    counts: statusCounts,
    selected: runnerExecutionStatusFilter,
    onChange: (status) => {
      runnerExecutionStatusFilter = status;
      runnerExecutionPage = 0;
      selectedRunnerExecutionIndex = 0;
      renderRunnerExecutionResult(lastRunnerResult);
    }
  });
  const totalAll = Number(pageInfo.totalAll ?? result.totalRequests ?? result.completedRequests ?? 0);
  const filteredTotal = filteredCountFromStatusCounts(statusCounts, runnerExecutionStatusFilter, totalAll);
  const failedRequests = Number(result?.failedRequests ?? statusCounts.ERR ?? 0);
  const httpResponses = runnerHttpResponseCount(result, []);
  const cancelled = result?.cancelled === true ? ', cancelled' : '';
  $('runnerResultsSummary').textContent = totalAll
    ? [
        `${totalAll} ${plural(totalAll, 'request', 'requests')} completed`,
        httpResponses == null ? '' : `${httpResponses} HTTP ${plural(httpResponses, 'response', 'responses')}`,
        `${failedRequests} failed${cancelled}`,
        result.detailCaptureTruncated ? 'detail capture truncated' : ''
      ].filter(Boolean).join(', ') + '.'
    : 'No runner execution results were returned.';
  runnerExecutionPage = executionPageForIndex(runnerExecutionPage * EXECUTION_RESULT_PAGE_SIZE, filteredTotal, runnerExecutionPage);
  const pageRange = executionPageRange(filteredTotal, runnerExecutionPage);
  $('runnerExecutionSummary').textContent = filteredTotal
    ? executionFilterSummaryText(pageRange, filteredTotal, totalAll, 'result', runnerExecutionStatusFilter)
    : 'No requests';
  const list = $('runnerExecutionList');
  list.textContent = '';
  appendEmptyTestResult(list, 'Loading request results...');
  clearStoredDetails('runner');
  const token = ++runnerExecutionRenderToken;
  return window.postmeter.runner.resultPage(result.resultStoreId || result.id, {
    offset: pageRange.startIndex,
    limit: EXECUTION_RESULT_PAGE_SIZE,
    status: runnerExecutionStatusFilter
  }).then((page) => {
    if (token !== runnerExecutionRenderToken || lastRunnerResult !== result) {
      return;
    }
    const rows = Array.isArray(page?.items) ? page.items : [];
    list.textContent = '';
    if (!rows.length) {
      appendEmptyTestResult(list, runnerExecutionStatusFilter === 'all'
        ? 'No request results were recorded.'
        : 'No request results match this status filter.');
    } else {
      if (!rows.some((item) => item.resultIndex === selectedRunnerExecutionIndex)) {
        selectedRunnerExecutionIndex = Number(rows[0]?.resultIndex || 0);
      }
      rows.forEach((item) => list.append(runnerExecutionRow(item, Number(item.resultIndex || 0))));
    }
    renderExecutionPagination({
      containerId: 'runnerExecutionPagination',
      label: 'Runner request results',
      onPageChange: (nextPage) => {
        runnerExecutionPage = nextPage;
        renderRunnerExecutionResult(lastRunnerResult);
      },
      page: runnerExecutionPage,
      totalItems: Number(page?.total ?? filteredTotal)
    });
    return renderStoredRunnerExecutionDetails(result);
  }).catch((error) => {
    if (token !== runnerExecutionRenderToken) {
      return;
    }
    list.textContent = '';
    appendEmptyTestResult(list, error.message || String(error));
  });
}

function renderStoredRunnerExecutionDetails(result = lastRunnerResult) {
  const status = $('runnerExecutionDetailsStatus');
  const details = $('runnerExecutionDetails');
  if (!details || !status) {
    return;
  }
  details.textContent = '';
  status.textContent = 'Loading';
  appendEmptyTestResult(details, 'Loading request details...');
  const token = runnerExecutionRenderToken;
  return window.postmeter.runner.resultDetail(result.resultStoreId || result.id, selectedRunnerExecutionIndex)
    .then((item) => {
      if (token !== runnerExecutionRenderToken || lastRunnerResult !== result) {
        return;
      }
      details.textContent = '';
      if (!item) {
        status.textContent = 'No selection';
        appendEmptyTestResult(details, 'Select a completed request to inspect its execution details.');
        return;
      }
      status.textContent = runnerStatusLabel(item);
      const request = runnerRequestForExecutionItem(item);
      details.append(runnerExecutionOverview(item, request));
      if (item.error) {
        details.append(runnerDetailTextBlock('Error', item.error, 'runner-detail-error'));
      }
      appendRunnerTransportDetails(details, item);
      appendRunnerScriptResultDetails(details, 'Pre-request', item.preRequestScriptResult);
      appendRunnerScriptResultDetails(details, 'Post-request', item.testScriptResult);
      appendRunnerVariableDetails(details, 'Request variables', item.localVariables || []);
      appendRunnerVariableDetails(details, 'Collection variables', result?.collectionVariables || []);
      appendRunnerVariableDetails(details, 'Environment variables', result?.environment?.variables || []);
      appendRunnerVariableDetails(details, 'Global variables', result?.globals || []);
      appendRunnerResponseBodyDetails(details, item);
    }).catch((error) => {
      if (token !== runnerExecutionRenderToken) {
        return;
      }
      status.textContent = 'Error';
      details.textContent = '';
      appendEmptyTestResult(details, error.message || String(error));
    });
}

function executionPageForIndex(index, totalItems, fallbackPage = 0) {
  const total = Number(totalItems || 0);
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const pageCount = Math.max(1, Math.ceil(total / EXECUTION_RESULT_PAGE_SIZE));
  const fallback = Math.min(Math.max(Number(fallbackPage) || 0, 0), pageCount - 1);
  const numeric = Number(index);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return fallback;
  }
  return Math.min(Math.floor(Math.min(numeric, total - 1) / EXECUTION_RESULT_PAGE_SIZE), pageCount - 1);
}

function executionPageRange(totalItems, page = 0) {
  const total = Math.max(0, Number(totalItems || 0));
  if (!Number.isFinite(total) || total <= 0) {
    return { page: 0, pageCount: 0, startIndex: 0, endIndex: 0 };
  }
  const pageCount = Math.max(1, Math.ceil(total / EXECUTION_RESULT_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(page) || 0, 0), pageCount - 1);
  const startIndex = currentPage * EXECUTION_RESULT_PAGE_SIZE;
  return {
    page: currentPage,
    pageCount,
    startIndex,
    endIndex: Math.min(total, startIndex + EXECUTION_RESULT_PAGE_SIZE)
  };
}

function clearExecutionPagination(containerId) {
  const container = $(containerId);
  if (!container) {
    return;
  }
  container.textContent = '';
  container.hidden = true;
}

function executionStatusFilterTitleRow(title, selectId, ariaLabel) {
  const row = document.createElement('div');
  row.className = 'script-results-title-row';
  row.append(title);

  const label = document.createElement('label');
  label.className = 'runner-execution-filter';
  const text = document.createElement('span');
  text.textContent = 'Status';
  const select = document.createElement('select');
  select.id = selectId;
  select.setAttribute('aria-label', ariaLabel);
  select.append(executionStatusOption('All', 'all'));
  label.append(text, select);
  row.append(label);
  return row;
}

function executionStatusOption(label, value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function clearExecutionStatusFilter(selectId) {
  const select = $(selectId);
  if (!select) {
    return;
  }
  select.textContent = '';
  select.append(executionStatusOption('All', 'all'));
  select.value = 'all';
  select.disabled = true;
  select.onchange = null;
}

function clearStoredDetails(kind) {
  const prefix = kind === 'performance' ? 'performanceExecution' : 'runnerExecution';
  const status = $(`${prefix}DetailsStatus`);
  const details = $(`${prefix}Details`);
  if (status) {
    status.textContent = 'Loading';
  }
  if (details) {
    details.textContent = '';
    appendEmptyTestResult(details, 'Loading request details...');
  }
}

function renderExecutionStatusFilterFromCounts({ selectId, counts, selected, onChange }) {
  const select = $(selectId);
  if (!select) {
    return selected || 'all';
  }
  const entries = Object.entries(counts || {})
    .filter(([, count]) => Number(count || 0) > 0)
    .sort(([left], [right]) => compareExecutionStatusFilters(left, right));
  const statuses = new Set(entries.map(([status]) => status));
  const normalized = statuses.has(String(selected)) ? String(selected) : 'all';
  select.textContent = '';
  select.append(executionStatusOption('All', 'all'));
  for (const [status, count] of entries) {
    select.append(executionStatusOption(`${status} (${count})`, status));
  }
  select.disabled = entries.length === 0;
  select.value = normalized;
  select.onchange = () => {
    if (typeof onChange === 'function') {
      onChange(select.value || 'all');
    }
  };
  return normalized;
}

function filteredCountFromStatusCounts(counts, statusFilter, totalAll) {
  if (!statusFilter || statusFilter === 'all') {
    return Number(totalAll || 0);
  }
  return Number(counts?.[statusFilter] || 0);
}

function renderExecutionStatusFilter({ selectId, items, selected, onChange }) {
  const select = $(selectId);
  if (!select) {
    return selected || 'all';
  }
  const counts = executionStatusCounts(items);
  const statusCodes = new Set(counts.map(([status]) => status));
  const normalized = statusCodes.has(String(selected)) ? String(selected) : 'all';
  select.textContent = '';
  select.append(executionStatusOption('All', 'all'));
  counts.forEach(([status, count]) => {
    select.append(executionStatusOption(`${status} (${count})`, status));
  });
  select.disabled = counts.length === 0;
  select.value = normalized;
  select.onchange = () => {
    if (typeof onChange === 'function') {
      onChange(select.value || 'all');
    }
  };
  return normalized;
}

function executionStatusCounts(items) {
  const counts = new Map();
  if (!Array.isArray(items)) {
    return [];
  }
  items.forEach((item) => {
    const status = executionStatusCode(item);
    if (!status) {
      return;
    }
    counts.set(status, (counts.get(status) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort(([left], [right]) => compareExecutionStatusFilters(left, right));
}

function executionStatusCode(item) {
  const status = Number(item?.statusCode);
  if (!Number.isInteger(status) || status <= 0) {
    if (runnerStatusLabel(item) === 'ERR') {
      return 'ERR';
    }
    return '';
  }
  return String(status);
}

function compareExecutionStatusFilters(left, right) {
  if (left === right) {
    return 0;
  }
  if (left === 'ERR') {
    return -1;
  }
  if (right === 'ERR') {
    return 1;
  }
  return Number(left) - Number(right) || left.localeCompare(right);
}

function filteredExecutionEntries(items, statusFilter) {
  const list = Array.isArray(items) ? items : [];
  const filter = String(statusFilter || 'all');
  return list.reduce((entries, item, index) => {
    if (filter === 'all' || executionStatusCode(item) === filter) {
      entries.push({ item, index });
    }
    return entries;
  }, []);
}

function firstFilteredExecutionIndex(items, statusFilter) {
  const first = filteredExecutionEntries(items, statusFilter)[0];
  return first ? first.index : 0;
}

function selectedExecutionIndexForEntries(index, entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return 0;
  }
  const numeric = Number(index);
  if (Number.isInteger(numeric) && entries.some((entry) => entry.index === numeric)) {
    return numeric;
  }
  return entries[0].index;
}

function executionPageForFilteredEntries(selectedIndex, entries, fallbackPage = 0) {
  const position = Array.isArray(entries)
    ? entries.findIndex((entry) => entry.index === selectedIndex)
    : -1;
  return executionPageForIndex(position >= 0 ? position : 0, Array.isArray(entries) ? entries.length : 0, fallbackPage);
}

function executionFilterSummaryText(pageRange, filteredCount, totalCount, noun, statusFilter) {
  const label = `${pageRange.startIndex + 1}-${pageRange.endIndex} of ${filteredCount} ${plural(filteredCount, noun, `${noun}s`)}`;
  if (statusFilter && statusFilter !== 'all' && filteredCount !== totalCount) {
    return `${label} matching ${statusFilter}`;
  }
  return label;
}

function renderExecutionPagination({ containerId, totalItems, page, label, onPageChange }) {
  const container = $(containerId);
  if (!container) {
    return;
  }
  const range = executionPageRange(totalItems, page);
  container.textContent = '';
  if (range.pageCount <= 1) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.append(
    executionPageButton('first', 'First', range.page > 0, label, () => onPageChange(0)),
    executionPageButton('previous', 'Previous', range.page > 0, label, () => onPageChange(range.page - 1))
  );
  const status = document.createElement('span');
  status.className = 'runner-execution-page-status';
  status.textContent = `Page ${range.page + 1} of ${range.pageCount}`;
  const rangeText = document.createElement('span');
  rangeText.className = 'runner-execution-page-range';
  rangeText.textContent = `${range.startIndex + 1}-${range.endIndex} of ${Number(totalItems || 0)}`;
  container.append(
    status,
    executionPageButton('next', 'Next', range.page < range.pageCount - 1, label, () => onPageChange(range.page + 1)),
    executionPageButton('last', 'Last', range.page < range.pageCount - 1, label, () => onPageChange(range.pageCount - 1)),
    rangeText
  );
}

function executionPageButton(action, text, enabled, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.executionPageAction = action;
  button.disabled = !enabled;
  button.textContent = text;
  button.setAttribute('aria-label', `${text} page of ${label}`);
  button.addEventListener('click', onClick);
  return button;
}

function clampRunnerExecutionIndex(index, results) {
  if (!Array.isArray(results) || !results.length) {
    return 0;
  }
  const numeric = Number(index);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return 0;
  }
  return Math.min(numeric, results.length - 1);
}

function runnerExecutionRow(item, index) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `runner-execution-row${index === selectedRunnerExecutionIndex ? ' active' : ''}`;
  row.dataset.runnerExecutionIndex = String(index);
  row.setAttribute('aria-pressed', index === selectedRunnerExecutionIndex ? 'true' : 'false');
  row.setAttribute('aria-label', `Show details for ${item?.requestDisplayName || item?.requestName || 'request'} with status ${runnerStatusLabel(item)}`);
  row.addEventListener('click', () => {
    selectRunnerExecutionRow(index);
  });

  const badge = document.createElement('span');
  badge.className = `runner-status-badge ${runnerStatusClass(item)}`;
  badge.textContent = runnerStatusLabel(item);

  const content = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'runner-execution-name';
  name.textContent = item?.requestDisplayName || item?.requestName || 'Untitled Request';
  const meta = document.createElement('span');
  meta.className = 'runner-execution-meta';
  meta.textContent = runnerExecutionMeta(item);
  content.append(name, meta);
  row.append(badge, content);
  return row;
}

function selectPerformanceExecutionRow(index) {
  const list = $('performanceExecutionList');
  const scrollTop = list?.scrollTop || 0;
  selectedPerformanceResultIndex = index;
  updateExecutionSelectionState(list, 'performanceExecutionIndex', selectedPerformanceResultIndex);
  const renderDetails = lastPerformanceResult?.storeBacked === true && window.postmeter?.performance?.resultDetail
    ? renderStoredPerformanceExecutionDetails(lastPerformanceResult)
    : renderPerformanceExecutionDetails(lastPerformanceResult);
  if (list) {
    list.scrollTop = scrollTop;
  }
  return renderDetails;
}

function selectRunnerExecutionRow(index) {
  const list = $('runnerExecutionList');
  const scrollTop = list?.scrollTop || 0;
  selectedRunnerExecutionIndex = index;
  updateExecutionSelectionState(list, 'runnerExecutionIndex', selectedRunnerExecutionIndex);
  const renderDetails = lastRunnerResult?.storeBacked === true && window.postmeter?.runner?.resultDetail
    ? renderStoredRunnerExecutionDetails(lastRunnerResult)
    : renderRunnerExecutionDetails(lastRunnerResult);
  if (list) {
    list.scrollTop = scrollTop;
  }
  return renderDetails;
}

function updateExecutionSelectionState(list, indexDataKey, selectedIndex) {
  if (!list) {
    return;
  }
  for (const row of list.querySelectorAll('.runner-execution-row')) {
    const rowIndex = Number(row.dataset[indexDataKey]);
    const selected = rowIndex === selectedIndex;
    row.classList.toggle('active', selected);
    row.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function runnerExecutionMeta(item = {}) {
  const request = runnerRequestForExecutionItem(item);
  const method = item.requestMethod || request?.method || '';
  const url = item.requestUrl || request?.url || '';
  const iteration = runnerIterationText(item);
  const duration = Number.isFinite(Number(item.durationMillis)) ? `${Number(item.durationMillis)} ms` : '';
  return [method, url, iteration, duration].filter(Boolean).join(' ');
}

function runnerIterationText(item = {}) {
  const current = Number(item.runnerIteration);
  const total = Number(item.runnerIterations);
  if (!Number.isInteger(current) || !Number.isInteger(total) || total <= 1) {
    return '';
  }
  return `Iteration ${current}/${total}`;
}

function renderRunnerExecutionDetails(result = lastRunnerResult) {
  const results = Array.isArray(result?.results) ? result.results : [];
  const item = results[selectedRunnerExecutionIndex] || null;
  const status = $('runnerExecutionDetailsStatus');
  const details = $('runnerExecutionDetails');
  if (!details || !status) {
    return;
  }
  details.textContent = '';
  if (!item) {
    status.textContent = 'No selection';
    appendEmptyTestResult(details, 'Select a completed request to inspect its execution details.');
    return;
  }
  status.textContent = runnerStatusLabel(item);
  const request = runnerRequestForExecutionItem(item);
  details.append(runnerExecutionOverview(item, request));
  if (item.error) {
    details.append(runnerDetailTextBlock('Error', item.error, 'runner-detail-error'));
  }
  appendRunnerTransportDetails(details, item);
  appendRunnerScriptResultDetails(details, 'Pre-request', item.preRequestScriptResult);
  appendRunnerScriptResultDetails(details, 'Post-request', item.testScriptResult);
  appendRunnerVariableDetails(details, 'Request variables', item.localVariables || []);
  appendRunnerVariableDetails(details, 'Collection variables', result?.collectionVariables || []);
  appendRunnerVariableDetails(details, 'Environment variables', result?.environment?.variables || []);
  appendRunnerVariableDetails(details, 'Global variables', result?.globals || []);
  appendRunnerResponseBodyDetails(details, item);
}

function runnerExecutionOverview(item = {}, request = null) {
  const block = document.createElement('div');
  block.className = 'runner-detail-block';
  const heading = document.createElement('h4');
  heading.className = 'runner-detail-heading';
  heading.textContent = item.requestDisplayName || item.requestName || request?.name || 'Untitled Request';
  const target = document.createElement('div');
  target.className = 'runner-detail-meta';
  target.textContent = [item.requestMethod || request?.method || '', item.requestUrl || request?.url || ''].filter(Boolean).join(' ');
  const metrics = document.createElement('div');
  metrics.className = 'runner-detail-meta';
  metrics.textContent = [
    `Status ${runnerStatusLabel(item)}`,
    runnerIterationText(item),
    Number.isFinite(Number(item.durationMillis)) ? `${Number(item.durationMillis)} ms` : '',
    item.folderName ? `Folder ${item.folderName}` : '',
    item.startedAt ? `Started ${item.startedAt}` : ''
  ].filter(Boolean).join(' | ');
  block.append(heading, target, metrics);
  return block;
}

function appendRunnerScriptResultDetails(details, title, scriptResult) {
  const block = runnerDetailBlock(title);
  const list = document.createElement('div');
  list.className = 'test-result-list';
  const normalized = normalizeScriptResult(scriptResult);
  if (!normalized) {
    appendEmptyTestResult(list, 'No script result recorded.');
  } else {
    const topLevelError = scriptResultTopLevelError(normalized);
    if (topLevelError) {
      appendTestResultRow(list, { status: 'error', name: 'Script error', detail: topLevelError });
    }
    for (const test of Array.isArray(normalized.tests) ? normalized.tests : []) {
      appendTestResultRow(list, {
        status: scriptTestStatus(test),
        name: String(test?.name || 'Unnamed test'),
        detail: String(test?.error || '')
      });
    }
    for (const log of Array.isArray(normalized.logs) ? normalized.logs : []) {
      appendTestResultRow(list, { status: 'log', name: 'Console', detail: String(log || '') });
    }
    if (!list.children.length) {
      appendEmptyTestResult(list, 'No tests recorded.');
    }
  }
  block.append(list);
  details.append(block);
}

function appendRunnerVariableDetails(details, title, variables) {
  const visible = (variables || []).filter((variable) => variable?.enabled !== false && variable?.key);
  if (!visible.length) {
    return;
  }
  const block = runnerDetailBlock(title);
  for (const variable of visible) {
    const row = document.createElement('div');
    row.className = 'runner-detail-variable';
    const key = document.createElement('span');
    key.textContent = variable.key;
    const value = document.createElement('span');
    value.textContent = variable.value ?? '';
    row.append(key, value);
    block.append(row);
  }
  details.append(block);
}

function appendRunnerResponseBodyDetails(details, item = {}) {
  const block = runnerDetailBlock('Response body');
  const body = item.responseBody == null ? '' : String(item.responseBody);
  if (!body) {
    appendEmptyTestResult(block, 'No response body recorded.');
  } else {
    const content = document.createElement('pre');
    content.className = 'runner-detail-code';
    content.textContent = formatRunnerDetailResponseBody(body);
    block.append(content);
  }
  details.append(block);
}

function appendRunnerTransportDetails(details, item = {}) {
  const text = formatResponseNetwork({
    durationMillis: item.durationMillis,
    finalUrl: item.finalUrl || item.requestUrl || '',
    timings: item.timings || {},
    tls: item.tls || item.timings?.tls || {}
  });
  if (!text || text === 'No network diagnostics captured.') {
    return;
  }
  details.append(runnerDetailTextBlock('Network', text));
}

function formatRunnerDetailResponseBody(body) {
  const text = String(body || '');
  const formatter = globalThis.PostMeterResponseFormatting?.formatBody;
  if (typeof formatter === 'function') {
    return formatter({ body: text, headers: {} });
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function runnerDetailBlock(title) {
  const block = document.createElement('div');
  block.className = 'runner-detail-block';
  const heading = document.createElement('h4');
  heading.className = 'runner-detail-title';
  heading.textContent = title;
  block.append(heading);
  return block;
}

function runnerDetailTextBlock(title, value, className = 'runner-detail-code') {
  const block = runnerDetailBlock(title);
  const content = document.createElement('pre');
  content.className = className;
  content.textContent = String(value || '');
  block.append(content);
  return block;
}

function runnerRequestForExecutionItem(item = {}) {
  const runner = activeRunner();
  return (runner?.requests || []).find((request) => request.id === item.requestId) || null;
}

function runnerStatusLabel(item = {}) {
  const statusCode = Number(item.statusCode);
  if (Number.isFinite(statusCode) && statusCode > 0) {
    return String(statusCode);
  }
  if (item.skipped === true) {
    return 'SKIP';
  }
  return item.passed === false || item.error ? 'ERR' : '-';
}

function runnerStatusClass(item = {}) {
  const statusCode = Number(item.statusCode);
  if (!Number.isFinite(statusCode) || statusCode <= 0) {
    return item.passed === false || item.error ? 'status-error' : 'status-none';
  }
  if (statusCode >= 200 && statusCode < 300) {
    return 'status-2xx';
  }
  if (statusCode >= 300 && statusCode < 400) {
    return 'status-3xx';
  }
  if (statusCode >= 400 && statusCode < 500) {
    return 'status-4xx';
  }
  if (statusCode >= 500) {
    return 'status-5xx';
  }
  return 'status-none';
}

function plural(count, singular, pluralValue) {
  return count === 1 ? singular : pluralValue;
}

function displayVisualizer(visualizer) {
  const frame = $('visualizerFrame');
  if (!frame) {
    return;
  }
  const html = typeof visualizer?.html === 'string' ? visualizer.html : '';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.srcdoc = visualizerDocument(html, visualizer?.data, visualizer?.assets);
}

function visualizerDocument(html, data = {}, assets = []) {
  const serializedData = safeScriptJson(data == null ? {} : data);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; connect-src 'none'; media-src 'none'; worker-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';"><style>html,body{margin:0;min-height:100%;font:13px system-ui,sans-serif;color:#1f2937;background:#fff;}body{padding:12px;box-sizing:border-box;}</style><script>window.pm=Object.freeze({getData:function(callback){if(typeof callback==='function'){callback(null,${serializedData});}}});</script>${visualizerAssetMarkup(assets)}</head><body>${html}</body></html>`;
}

function visualizerAssetMarkup(assets = []) {
  if (!Array.isArray(assets)) {
    return '';
  }
  return assets.slice(0, 16).map((asset) => {
    const name = escapeHtmlAttribute(asset?.name || '');
    const source = String(asset?.source || '');
    if (!name || !source || !String(asset?.integrity || '').startsWith('sha256-')) {
      return '';
    }
    if (asset?.type === 'style') {
      return `<style data-postmeter-visualizer-asset="${name}">${escapeStyleSource(source)}</style>`;
    }
    return `<script data-postmeter-visualizer-asset="${name}">${escapeScriptSource(source)}</script>`;
  }).join('');
}

function escapeScriptSource(source) {
  return String(source || '').replace(/<\/script/gi, '<\\/script');
}

function escapeStyleSource(source) {
  return String(source || '').replace(/<\/style/gi, '<\\/style');
}

function escapeHtmlAttribute(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlText(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function safeScriptJson(value) {
  try {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  } catch {
    return '{}';
  }
}

async function runActiveCollection() {
  if (activeMainPanel === 'runner') {
    return runActiveRunner();
  }
  return rendererWorkflows.runActiveCollection();
}

async function runActiveRunner() {
  const runner = activeRunner();
  if (!runner) {
    return setStatus('Select a runner before running it.');
  }
  collectRunnerFromEditor();
  runner.requests = normalizeRunnerRequests(runner.requests);
  if (!runner.requests.length) {
    return setStatus('Add at least one request before running a runner.');
  }
  const runnerRunConfig = {
    stopOnFailure: runner.stopOnFailure === true,
    allowEnvironmentMutation: runner.allowEnvironmentMutation === true,
    capturePolicy: cloneJson(runner.capturePolicy || {})
  };
  const runnerEnvironment = activeEnvironment();
  const runnerForRun = runnerWithRunEnvironment(runner, runnerEnvironment);
  if (!(await confirmRuntimeResultStoreCapacity('runner', runnerForRun, runnerRunConfig))) {
    return setStatus('Runner cancelled.');
  }
  const runnerId = crypto.randomUUID();
  const runnerContext = {
    runnerConfigId: runner.id,
    workspaceId: activeWorkspaceId
  };
  lastRunnerResult = null;
  selectedRunnerExecutionIndex = 0;
  runnerExecutionPage = 0;
  runnerExecutionStatusFilter = 'all';
  setRunnerResultExportButtonsDisabled(true);
  try {
    activeRunnerId = runnerId;
    $('runCollectionButton').disabled = true;
    $('cancelRunnerButton').disabled = false;
    renderRunnerExecutionMessage('Starting runner...');
    const startRunner = window.__postmeterStartRunner || window.postmeter.runner.start;
    const result = await startRunner(runnerId, runnerForRun, cloneJson(runnerEnvironment), runnerRunConfig);
    if (activeRunnerId !== runnerId || !isActiveRunnerContext(runnerContext)) {
      return;
    }
    const mutatedEnvironment = result?.mutatedEnvironment || result?.environment;
    if (result?.environmentMutationAllowed === true && runnerEnvironment && mutatedEnvironment) {
      for (const key of Object.keys(runnerEnvironment)) {
        delete runnerEnvironment[key];
      }
      Object.assign(runnerEnvironment, mutatedEnvironment);
      renderEnvironmentSelect();
      renderEnvironments();
      renderEnvironmentEditor();
    }
    if (Array.isArray(result?.cookies)) {
      workspace.cookies = result.cookies;
      renderCookieJarEditor();
    }
    lastRunnerResult = result;
    selectedRunnerExecutionIndex = 0;
    runnerExecutionPage = 0;
    runnerExecutionStatusFilter = 'all';
    await renderRunnerExecutionResult(result);
    setRunnerResultExportButtonsDisabled(false);
    setStatus(result.cancelled ? 'Runner cancelled.' : 'Runner completed.');
  } catch (error) {
    const message = error.message || String(error);
    if (isActiveRunnerContext(runnerContext) && activeRunnerId === runnerId) {
      lastRunnerResult = null;
      renderRunnerExecutionMessage(message);
      setRunnerResultExportButtonsDisabled(true);
      setStatus('Runner failed.');
      notifyUser('Runner Failed', message);
    }
  } finally {
    if (activeRunnerId === runnerId) {
      activeRunnerId = null;
      $('runCollectionButton').disabled = false;
      $('cancelRunnerButton').disabled = true;
    }
  }
}

function runnerWithRunEnvironment(runner, environment) {
  return {
    ...cloneJson(runner),
    environmentId: environment?.id || 'none'
  };
}

function isActiveRunnerContext(context) {
  return context?.workspaceId === activeWorkspaceId
    && context?.runnerConfigId === activeRunnerConfigId
    && activeMainPanel === 'runner';
}

async function cancelCollectionRun() {
  return rendererWorkflows.cancelCollectionRun();
}

async function exportRunnerResult(format, htmlReportOptions) {
  return rendererWorkflows.exportRunnerResult(format, htmlReportOptions);
}

async function startDeviceFlow() {
  return rendererWorkflows.startDeviceFlow();
}

async function startPkceFlow() {
  return rendererWorkflows.startPkceFlow();
}

async function cancelOauthFlow() {
  return rendererWorkflows.cancelOauthFlow();
}

function setOauthButtonsBusy(isBusy) {
  rendererWorkflows.setOauthButtonsBusy(isBusy);
}

function renderOauthProgress(progress) {
  rendererWorkflows.renderOauthProgress(progress);
}

async function saveRequestFromPane() {
  if (!activeRequest()) {
    setStatus('Select a request before saving.');
    return false;
  }
  try {
    if (activeAuthRefreshRequestOwnerType) {
      const saved = await saveWorkspace(false);
      if (saved) {
        setStatus('Refreshing auth request saved.');
      }
      return saved;
    }
    if (activeRunnerRequestRunnerId) {
      const saved = await saveWorkspace(false);
      if (saved) {
        setStatus('Runner request saved.');
      }
      return saved;
    }
    const saved = await saveWorkspace(true, { promptForDraft: true });
    if (saved) {
      setStatus('Request saved.');
    }
    return saved;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Request save failed: ${message}`);
    notifyUser('Request Save Failed', message);
    return false;
  }
}

async function saveCollectionFromPane() {
  if (!activeCollection()) {
    setStatus('Select a collection before saving.');
    return false;
  }
  try {
    ensureOpenCollectionTabForActive();
    const saved = await saveWorkspace(false, { collectionTabKey: activeCollectionTabKey() });
    if (saved) {
      setStatus('Collection saved.');
    }
    return saved;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Collection save failed: ${message}`);
    notifyUser('Collection Save Failed', message);
    return false;
  }
}

async function saveFolderFromPane() {
  if (!activeFolder()) {
    setStatus('Select a folder before saving.');
    return false;
  }
  try {
    ensureOpenFolderTabForActive();
    const saved = await saveWorkspace(false, { folderTabKey: activeFolderTabKey() });
    if (saved) {
      setStatus('Folder saved.');
    }
    return saved;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Folder save failed: ${message}`);
    notifyUser('Folder Save Failed', message);
    return false;
  }
}

async function saveEnvironmentFromPane() {
  if (!activeEditorEnvironment()) {
    setStatus('Select an environment before saving.');
    return false;
  }
  try {
    const saved = await saveWorkspace(true);
    if (saved) {
      setStatus('Environment saved.');
    }
    return saved;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Environment save failed: ${message}`);
    notifyUser('Environment Save Failed', message);
    return false;
  }
}

function setActiveEnvironmentFromPane() {
  const environment = activeEditorEnvironment();
  if (!environment) {
    setStatus('Select an environment before setting it.');
    return false;
  }
  collectEnvironmentFromEditor();
  activeEnvironmentId = environment.id;
  renderEnvironmentSelect();
  refreshVariableHighlights();
  scheduleSessionSave();
  setStatus(`Environment set: ${environment.name || 'Untitled Environment'}.`);
  return true;
}
