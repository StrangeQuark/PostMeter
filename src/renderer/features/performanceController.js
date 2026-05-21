async function startPerformanceCalibration() {
  if (activePerformanceCalibrationId) {
    return setStatus('Performance calibration is already running.');
  }
  const performanceApi = window.postmeter?.performance;
  if (!performanceApi?.calibrate) {
    return setStatus('Performance calibration is unavailable in this runtime.');
  }
  const calibrationId = crypto.randomUUID();
  activePerformanceCalibrationId = calibrationId;
  renderPerformanceCalibrationRunning();
  const modalClosed = showModal('performanceCalibrationModal', null).then(() => {
    if (activePerformanceCalibrationId === calibrationId) {
      void cancelPerformanceCalibration(calibrationId);
    }
  });
  try {
    const result = await performanceApi.calibrate(calibrationId);
    if (activePerformanceCalibrationId !== calibrationId) {
      await modalClosed;
      return result;
    }
    activePerformanceCalibrationId = null;
    renderPerformanceCalibrationResult(result);
    setStatus(result?.cancelled ? 'Performance calibration cancelled.' : 'Performance calibration completed.');
    return result;
  } catch (error) {
    const message = error.message || String(error);
    if (activePerformanceCalibrationId === calibrationId) {
      activePerformanceCalibrationId = null;
      renderPerformanceCalibrationError(message);
      setStatus(`Performance calibration failed: ${message}`);
      notifyUser('Performance Calibration Failed', message);
    }
    return null;
  }
}

function closePerformanceCalibrationModal() {
  const calibrationId = activePerformanceCalibrationId;
  if (calibrationId) {
    void cancelPerformanceCalibration(calibrationId);
  }
  resolveActiveModal(null);
}

async function cancelPerformanceCalibration(calibrationId) {
  if (activePerformanceCalibrationId === calibrationId) {
    activePerformanceCalibrationId = null;
  }
  try {
    await window.postmeter?.performance?.cancelCalibration?.(calibrationId);
    setStatus('Performance calibration cancelled.');
    return true;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Performance calibration cancellation failed: ${message}`);
    return false;
  }
}

function renderPerformanceCalibrationRunning() {
  const body = $('performanceCalibrationBody');
  if (!body) {
    return;
  }
  body.textContent = '';
  const row = document.createElement('div');
  row.className = 'performance-calibration-running';
  const spinner = document.createElement('span');
  spinner.className = 'performance-calibration-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = 'Running extended local calibration...';
  row.append(spinner, text);
  const progressWrap = document.createElement('div');
  progressWrap.className = 'performance-calibration-progress';
  const progressLabel = document.createElement('div');
  progressLabel.id = 'performanceCalibrationProgressLabel';
  progressLabel.className = 'performance-calibration-progress-label';
  progressLabel.textContent = 'Preparing calibration...';
  const progressBar = document.createElement('progress');
  progressBar.id = 'performanceCalibrationProgressBar';
  progressBar.max = 100;
  progressBar.value = 0;
  const progressDetail = document.createElement('div');
  progressDetail.id = 'performanceCalibrationProgressDetail';
  progressDetail.className = 'performance-calibration-progress-detail';
  progressDetail.textContent = 'Starting local loopback server.';
  progressWrap.append(progressLabel, progressBar, progressDetail);
  const note = document.createElement('p');
  note.className = 'performance-calibration-note';
  note.textContent = 'This usually finishes in about two minutes while PostMeter runs warmup, bounded target-rate probes, and short verification passes.';
  body.append(row, progressWrap, note);
}

function renderPerformanceCalibrationProgress(progress = {}) {
  const bar = $('performanceCalibrationProgressBar');
  const label = $('performanceCalibrationProgressLabel');
  const detail = $('performanceCalibrationProgressDetail');
  if (!bar || !label || !detail) {
    return;
  }
  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
  bar.value = percent;
  const phaseLabel = progress.phaseLabel || 'Calibration';
  label.textContent = `${phaseLabel} ${Math.round(percent)}%`;
  const pieces = [];
  if (progress.targetRequestsPerSecond) {
    pieces.push(`${formatNumber(progress.targetRequestsPerSecond)} RPS`);
  }
  if (progress.stageIndex && progress.stageCount) {
    pieces.push(`stage ${formatNumber(progress.stageIndex)} of ${formatNumber(progress.stageCount)}`);
  }
  if (progress.pass && progress.passes) {
    pieces.push(`pass ${formatNumber(progress.pass)} of ${formatNumber(progress.passes)}`);
  }
  if (progress.completedRequests || progress.totalRequests) {
    pieces.push(`${formatNumber(progress.completedRequests || 0)} of ${formatNumber(progress.totalRequests || 0)} requests`);
  }
  detail.textContent = pieces.length ? pieces.join(' | ') : (progress.message || 'Running calibration...');
}

function renderPerformanceCalibrationResult(result = {}) {
  const body = $('performanceCalibrationBody');
  if (!body) {
    return;
  }
  body.textContent = '';
  const summary = result.summary || {};
  const grid = document.createElement('div');
  grid.className = 'performance-calibration-summary';
  grid.append(
    calibrationMetric('Max sustained local RPS', `${formatNumber(summary.reliableTargetRequestsPerSecond)} RPS`),
    calibrationMetric('Planning cap', `${formatNumber(summary.recommendedMaxRequestsPerSecond)} RPS`),
    calibrationMetric('Sustained RPS', formatNumber(summary.sustainedRequestsPerSecond)),
    calibrationMetric('Peak RPS', formatNumber(summary.peakRequestsPerSecond)),
    calibrationMetric('Next failed target', summary.edgeUpperBoundRequestsPerSecond ? `${formatNumber(summary.edgeUpperBoundRequestsPerSecond)} RPS` : 'Not found'),
    calibrationMetric('Measurement variation', `${formatNumber(summary.measurementVariationPercent)}%`),
    calibrationMetric('Repeatability', `${formatNumber(summary.repeatabilityPercent)}%`),
    calibrationMetric('Confidence', summary.confidence || 'low'),
    calibrationMetric('P95 latency', `${formatNumber(summary.p95LatencyMillis)} ms`),
    calibrationMetric('P95 scheduler lag', `${formatNumber(summary.p95StartLagMillis)} ms`),
    calibrationMetric('P95 event-loop delay', `${formatNumber(summary.p95EventLoopDelayMillis)} ms`),
    calibrationMetric('Stability', `${formatNumber(summary.stabilityPercent)}%`)
  );

  const stages = document.createElement('div');
  stages.className = 'performance-calibration-stages';
  for (const stage of Array.isArray(result.stages) ? result.stages : []) {
    const row = document.createElement('div');
    row.className = 'performance-calibration-stage';
    if (stage.accepted === true) {
      row.classList.add('is-accepted');
    } else if (stage.accepted === false) {
      row.classList.add('is-rejected');
    }
    const status = stage.accepted === true ? 'PASS' : 'CHECK';
    const target = stage.targetRequestsPerSecond ? `${formatNumber(stage.targetRequestsPerSecond)} target` : `${stage.concurrency || 0} clients`;
    const failureReasons = Array.isArray(stage.failureReasons) ? stage.failureReasons.join('; ') : '';
    if (failureReasons) {
      row.title = failureReasons;
    }
    row.append(
      calibrationStageCell(stage.name || 'Stage', true),
      calibrationStageCell(target),
      calibrationStageCell(`${formatNumber(stage.requestsPerSecond)} RPS`),
      calibrationStageCell(`lag ${formatNumber(stage.p95StartLagMillis)} ms`),
      calibrationStageCell(`EL ${formatNumber(stage.p95EventLoopDelayMillis)} ms`),
      calibrationStageCell(`${stage.completedRequests || 0} requests`),
      calibrationStageCell(status)
    );
    stages.append(row);
  }

  const note = document.createElement('p');
  note.className = 'performance-calibration-note';
  const notes = Array.isArray(summary.notes) ? summary.notes : [];
  note.textContent = notes.join(' ');
  body.append(grid, stages, note);
}

function renderPerformanceCalibrationError(message) {
  const body = $('performanceCalibrationBody');
  if (!body) {
    return;
  }
  body.textContent = '';
  const text = document.createElement('p');
  text.className = 'performance-calibration-note';
  text.textContent = `Calibration failed: ${message}`;
  body.append(text);
}

function calibrationMetric(label, value) {
  const item = document.createElement('div');
  item.className = 'performance-calibration-metric';
  const labelElement = document.createElement('span');
  labelElement.textContent = label;
  const valueElement = document.createElement('strong');
  valueElement.textContent = value;
  item.append(labelElement, valueElement);
  return item;
}

function calibrationStageCell(value, strong = false) {
  const element = document.createElement(strong ? 'strong' : 'span');
  element.textContent = String(value || '');
  return element;
}

async function runActivePerformanceTest() {
  if (!requireUnlockedWorkspace('running performance tests')) {
    return null;
  }
  const test = activePerformanceTest();
  if (!test) {
    return setStatus('Select a performance test before running it.');
  }
  if (activePerformanceRunId) {
    return setStatus('A performance test is already running.');
  }
  collectPerformanceTestFromEditor();
  if (!test.request?.url) {
    return setStatus('Enter a request URL before running a performance test.');
  }
  const preflightError = performanceRunPreflightError(test);
  if (preflightError) {
    renderPerformanceMessage(preflightError);
    setStatus('Performance test failed.');
    notifyUser('Performance Test Failed', preflightError);
    return null;
  }
  const performanceApi = window.postmeter?.performance;
  if (!performanceApi?.start) {
    return setStatus('Performance execution is unavailable in this runtime.');
  }
  const runId = crypto.randomUUID();
  const runEnvironment = activeEnvironment();
  let normalizedForRun;
  try {
    normalizedForRun = normalizePerformanceTest(performanceTestWithRunEnvironment(test, runEnvironment), workspace);
  } catch (error) {
    return setStatus(error.message || String(error));
  }
  if (!(await confirmRuntimeResultStoreCapacity('performance', normalizedForRun))) {
    return setStatus('Performance test cancelled.');
  }
  const runContext = {
    performanceTestId: test.id,
    workspaceId: activeWorkspaceId
  };
  lastPerformanceResult = null;
  lastPerformanceResultTestId = '';
  selectedPerformanceResultIndex = 0;
  performanceExecutionPage = 0;
  performanceExecutionStatusFilter = 'all';
  activePerformanceRunId = runId;
  renderPerformanceProgress({ completedRequests: 0, totalRequests: test.config?.iterations || 0, activeRequests: 0 });
  renderPerformanceEditor();
  try {
    await saveWorkspace(false, { collectEditors: false });
    const result = await performanceApi.start(runId, normalizedForRun, cloneJson(runEnvironment));
    if (!isActivePerformanceContext(runContext) || activePerformanceRunId !== runId) {
      return result;
    }
    applyPerformanceRunResult(result, runEnvironment, test);
    selectedPerformanceResultIndex = 0;
    performanceExecutionPage = 0;
    performanceExecutionStatusFilter = 'all';
    await renderPerformanceResult(result);
    await saveWorkspace(false, { collectEditors: false });
    setStatus(result.cancelled ? 'Performance test cancelled.' : 'Performance test completed.');
    return result;
  } catch (error) {
    const message = error.message || String(error);
    if (isActivePerformanceContext(runContext) && activePerformanceRunId === runId) {
      lastPerformanceResult = null;
      lastPerformanceResultTestId = '';
      renderPerformanceMessage(message);
      setStatus('Performance test failed.');
      notifyUser('Performance Test Failed', message);
    }
    return null;
  } finally {
    if (activePerformanceRunId === runId) {
      activePerformanceRunId = null;
      renderPerformanceEditor();
    }
  }
}

function performanceTestWithRunEnvironment(test, environment) {
  const payload = cloneJson(test);
  const environmentId = environment?.id || 'none';
  payload.environmentId = environmentId;
  if (payload.type && payload.typeSettings?.[payload.type]) {
    payload.typeSettings[payload.type].environmentId = environmentId;
  }
  return payload;
}

function performanceRunPreflightError(test = {}) {
  const authRefresh = normalizeAuthRefreshConfig(test.authRefresh || {});
  if (authRefresh.enabled === true
    && authRefresh.failurePolicy !== 'continue'
    && !authRefreshRequestHasUrl(authRefresh.request)) {
    return 'Refreshing Auth is enabled, but its auth request does not have a URL. Open Refreshing Auth and choose or import an auth request, or turn Refreshing Auth off.';
  }
  return '';
}

async function exportActivePerformanceTest(test = activePerformanceTest()) {
  if (!requireUnlockedWorkspace('exporting performance tests')) {
    return null;
  }
  if (!test) {
    return setStatus('Select a performance test before exporting.');
  }
  const performanceApi = window.postmeter?.performance;
  if (!performanceApi?.exportTest) {
    return setStatus('Performance export is unavailable in this runtime.');
  }
  if (!window.postmeter?.fileExport) {
    if (test.id === activePerformanceTestId) {
      collectPerformanceTestFromEditor();
    }
    try {
      const result = await performanceApi.exportTest(normalizePerformanceTest(cloneJson(test), workspace), 'postmeter');
      if (result?.path) {
        setStatus(`Performance test exported to ${result.path}.`);
      }
      return result;
    } catch (error) {
      const message = error.message || String(error);
      setStatus(`Performance test export failed: ${message}`);
      notifyUser('Performance Test Export Failed', message);
      return null;
    }
  }
  return runPickerFirstExport({
    kind: 'performance',
    format: 'postmeter',
    name: performanceTestDisplayName(test),
    payloadFactory: () => {
      if (test.id === activePerformanceTestId) {
        collectPerformanceTestFromEditor();
      }
      return normalizePerformanceTest(cloneJson(test), workspace);
    },
    legacyExport: () => performanceApi.exportTest(normalizePerformanceTest(cloneJson(test), workspace), 'postmeter'),
    successStatus: (filePath) => `Performance test exported to ${filePath}.`,
    failureStatusPrefix: 'Performance test export failed',
    failureTitle: 'Performance Test Export Failed',
    unavailableStatus: 'Performance export is unavailable in this runtime.'
  });
}

async function exportPerformanceTestFromPicker() {
  const tests = ensureWorkspacePerformanceTests();
  const selectedTest = await promptForItemExport('performance', tests, activePerformanceTest() || tests[0] || null);
  if (!selectedTest) {
    return null;
  }
  return exportActivePerformanceTest(selectedTest);
}

async function exportActivePerformanceResult(format = 'json', htmlReportOptions) {
  const normalizedFormat = format === 'csv' ? 'csv' : format === 'html' ? 'html' : 'json';
  const label = normalizedFormat.toUpperCase();
  const test = activePerformanceTest();
  const resultToExport = isActivePerformanceResultForTest(test) ? lastPerformanceResult : null;
  if (!resultToExport) {
    return setStatus(`Run a performance test before exporting result ${label}.`);
  }
  const exportResult = window.__postmeterExportPerformanceResult || window.postmeter?.performance?.exportResult;
  if (!exportResult) {
    return setStatus('Performance result export is unavailable in this runtime.');
  }
  try {
    const result = await exportResult(cloneJson(resultToExport), normalizedFormat, htmlReportOptions);
    if (result?.path) {
      setStatus(`Performance result ${label} exported to ${result.path}.`);
    }
    return result;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Performance result ${label} export failed: ${message}`);
    notifyUser('Performance Result Export Failed', message);
    return null;
  }
}

function openHtmlReportOptionsModal(target) {
  const normalizedTarget = target === 'performance' ? 'performance' : 'runner';
  const includeResultsInput = $('htmlReportIncludeResultsInput');
  const includeDetailsInput = $('htmlReportIncludeDetailsInput');
  const theme = currentResolvedThemeMode();
  const lightInput = $('htmlReportThemeLightInput');
  const darkInput = $('htmlReportThemeDarkInput');
  if (lightInput) {
    lightInput.checked = theme === 'light';
  }
  if (darkInput) {
    darkInput.checked = theme === 'dark';
  }
  if (includeResultsInput) {
    includeResultsInput.checked = true;
  }
  if (includeDetailsInput) {
    includeDetailsInput.checked = true;
  }
  syncHtmlReportOptionsModal();
  void showModal('htmlReportOptionsModal', null).then((options) => {
    if (!options) {
      return;
    }
    if (normalizedTarget === 'performance') {
      void exportActivePerformanceResult('html', options);
    } else {
      void exportRunnerResult('html', options);
    }
  });
}

function syncHtmlReportOptionsModal() {
  const includeResultsInput = $('htmlReportIncludeResultsInput');
  const includeDetailsInput = $('htmlReportIncludeDetailsInput');
  const detailsLabel = includeDetailsInput?.closest?.('.html-report-option');
  const includeResults = includeResultsInput?.checked === true;
  if (includeDetailsInput) {
    if (!includeResults) {
      includeDetailsInput.checked = false;
    }
    includeDetailsInput.disabled = !includeResults;
  }
  detailsLabel?.classList.toggle('is-disabled', !includeResults);
}

function confirmHtmlReportOptionsModal() {
  const includeResults = $('htmlReportIncludeResultsInput')?.checked === true;
  const selectedTheme = document.querySelector('input[name="htmlReportTheme"]:checked')?.value === 'dark' ? 'dark' : 'light';
  resolveActiveModal({
    theme: selectedTheme,
    includeRequestResults: includeResults,
    includeRequestDetails: includeResults && $('htmlReportIncludeDetailsInput')?.checked === true
  });
}

async function importPerformanceTest() {
  if (!requireUnlockedWorkspace('importing performance tests')) {
    return null;
  }
  const performanceApi = window.postmeter?.performance;
  if (!performanceApi?.importTest) {
    return setStatus('Performance import is unavailable in this runtime.');
  }
  try {
    const filePath = typeof window.__postmeterImportPerformanceTest === 'function'
      ? undefined
      : await chooseImportFilePath('performance');
    if (filePath === null) {
      return null;
    }
    const importBoundary = window.__postmeterImportPerformanceTest || performanceApi.importTest;
    const result = filePath == null ? await importBoundary() : await importBoundary(filePath);
    if (result?.cancelled) {
      return null;
    }
    if (!result?.performanceTest) {
      return setStatus('No performance test was imported.');
    }
    if (!canOpenAdditionalPerformanceTab()) {
      return null;
    }
    collectActiveEditorState();
    const tests = ensureWorkspacePerformanceTests();
    const imported = normalizePerformanceTest(cloneJson(result.performanceTest), workspace);
    if (tests.some((candidate) => candidate.id === imported.id)) {
      imported.id = crypto.randomUUID();
    }
    imported.name = uniqueName(imported.name || 'Imported Performance Test', tests.map((candidate) => candidate.name));
    tests.push(imported);
    activeRunnerRequestRunnerId = null;
    activePerformanceTestId = imported.id;
    lastPerformanceResult = null;
    lastPerformanceResultTestId = '';
    selectedPerformanceResultIndex = 0;
    performanceExecutionPage = 0;
    performanceExecutionStatusFilter = 'all';
    activeSidebarPanel = 'performance';
    activeMainPanel = 'performance';
    ensureOpenPerformanceTabForActive({ dirty: true, createdUnsaved: true });
    activePerformanceOutputTabId = 'performanceOutputResultsTab';
    renderAll();
    await savePerformanceTestFromPane();
    setStatus(`Imported performance test: ${performanceTestDisplayName(imported)}.`);
    return imported;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Performance test import failed: ${message}`);
    notifyUser('Performance Test Import Failed', message);
    return null;
  }
}

async function cancelPerformanceTestRun() {
  if (!activePerformanceRunId) {
    return false;
  }
  try {
    await window.postmeter?.performance?.cancel?.(activePerformanceRunId);
    setStatus('Cancelling performance test...');
    return true;
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Performance cancellation failed: ${message}`);
    return false;
  }
}

function isActivePerformanceContext(context) {
  return context?.workspaceId === activeWorkspaceId
    && context?.performanceTestId === activePerformanceTestId
    && activeMainPanel === 'performance';
}

function isActivePerformanceResultForTest(test, result = lastPerformanceResult) {
  const resultTestId = lastPerformanceResultTestId || result?.performanceTestId || '';
  return Boolean(test?.id && result && resultTestId === test.id);
}

function applyPerformanceRunResult(result, runEnvironment, test) {
  lastPerformanceResult = result;
  lastPerformanceResultTestId = test?.id || result?.performanceTestId || activePerformanceTestId || '';
  if (result?.environmentMutationAllowed === true && runEnvironment && (result.mutatedEnvironment || result.environment)) {
    for (const key of Object.keys(runEnvironment)) {
      delete runEnvironment[key];
    }
    Object.assign(runEnvironment, result.mutatedEnvironment || result.environment);
    renderEnvironmentSelect();
    renderEnvironments();
    renderEnvironmentEditor();
  }
  if (Array.isArray(result?.cookies)) {
    workspace.cookies = result.cookies;
    renderCookieJarEditor();
  }
  if (test?.resultsMetadata) {
    test.resultsMetadata.lastRunAt = result?.completedAt || new Date().toISOString();
    test.resultsMetadata.lastResultId = result?.id || '';
    test.resultsMetadata.lastStatus = result?.cancelled ? 'cancelled' : result?.passed ? 'passed' : 'failed';
    test.resultsMetadata.runCount = Number(test.resultsMetadata.runCount || 0) + 1;
    test.resultsMetadata.updatedAt = new Date().toISOString();
  }
}

function renderPerformanceProgress(progress = {}) {
  ensurePerformanceResultsStructure();
  const completed = Number(progress.completedRequests || 0);
  const total = Number(progress.totalRequests || 0);
  const active = Number(progress.activeRequests || 0);
  const requestName = progress.requestName ? ` Last: ${progress.requestName}.` : '';
  $('performanceResultsSummary').textContent = `Running performance test... ${completed}/${total || '?'} completed, ${active} active.${requestName}`;
  $('performanceRunDetails').textContent = '';
  appendEmptyTestResult($('performanceRunDetails'), 'Waiting for aggregate performance results.');
  $('performanceExecutionSummary').textContent = total ? `${completed}/${total} completed` : 'Running';
  $('performanceExecutionList').textContent = '';
  appendEmptyTestResult($('performanceExecutionList'), completed ? 'Waiting for final request details.' : 'Waiting for the first request to complete.');
  clearExecutionPagination('performanceExecutionPagination');
  clearExecutionStatusFilter('performanceExecutionStatusFilter');
  $('performanceExecutionDetailsStatus').textContent = 'Running';
  $('performanceExecutionDetails').textContent = '';
  appendEmptyTestResult($('performanceExecutionDetails'), 'Performance execution is still in progress.');
  renderPerformanceGraphMessage('Graphs render after the performance run completes.');
}

function renderPerformanceMessage(message) {
  ensurePerformanceResultsStructure();
  $('performanceResultsSummary').textContent = message || 'No performance run yet.';
  $('performanceRunDetails').textContent = '';
  appendEmptyTestResult($('performanceRunDetails'), message || 'No performance run yet.');
  $('performanceExecutionSummary').textContent = 'No requests';
  $('performanceExecutionList').textContent = '';
  appendEmptyTestResult($('performanceExecutionList'), message || 'No performance execution yet.');
  clearExecutionPagination('performanceExecutionPagination');
  clearExecutionStatusFilter('performanceExecutionStatusFilter');
  $('performanceExecutionDetailsStatus').textContent = 'No selection';
  $('performanceExecutionDetails').textContent = '';
  appendEmptyTestResult($('performanceExecutionDetails'), 'Select a completed request to inspect its performance details.');
  renderPerformanceGraphMessage(message || 'No performance run yet.');
}

function renderPerformanceResult(result = lastPerformanceResult) {
  ensurePerformanceResultsStructure();
  if (!result) {
    renderPerformanceMessage('No performance run yet.');
    return;
  }
  if (result.storeBacked === true && window.postmeter?.performance?.resultPage) {
    return renderStoredPerformanceResult(result);
  }
  const samples = Array.isArray(result.samples) ? result.samples : [];
  const outcomeCounts = performanceResultOutcomeCounts(result, samples);
  performanceExecutionStatusFilter = renderExecutionStatusFilter({
    selectId: 'performanceExecutionStatusFilter',
    items: samples,
    selected: performanceExecutionStatusFilter,
    onChange: (status) => {
      performanceExecutionStatusFilter = status;
      performanceExecutionPage = 0;
      selectedPerformanceResultIndex = firstFilteredExecutionIndex(samples, performanceExecutionStatusFilter);
      renderPerformanceResult(lastPerformanceResult);
    }
  });
  const filteredSamples = filteredExecutionEntries(samples, performanceExecutionStatusFilter);
  selectedPerformanceResultIndex = selectedExecutionIndexForEntries(selectedPerformanceResultIndex, filteredSamples);
  const summary = result.summary || {};
  const statusCodes = Object.entries(summary.statusCodes || {})
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ') || 'none';
  $('performanceResultsSummary').textContent = [
    `${result.completedRequests || 0}/${result.totalRequests || 0} requests completed`,
    `${outcomeCounts.successful} successful`,
    `${outcomeCounts.failed} failed${result.cancelled ? ', cancelled' : ''}`,
    `RPS ${formatNumber(summary.requestsPerSecond)}`,
    `p95 ${formatNumber(summary.p95DurationMillis)} ms`,
    summary.diagnosis ? `confidence ${summary.diagnosis.confidence || 'low'}` : '',
    `statuses ${statusCodes}`
  ].filter(Boolean).join(' | ');
  renderPerformanceRunDetails(result);
  renderPerformanceGraphs(result);
  performanceExecutionPage = executionPageForFilteredEntries(selectedPerformanceResultIndex, filteredSamples, performanceExecutionPage);
  const pageRange = executionPageRange(filteredSamples.length, performanceExecutionPage);
  const visibleSamples = filteredSamples.slice(pageRange.startIndex, pageRange.endIndex);
  $('performanceExecutionSummary').textContent = filteredSamples.length
    ? executionFilterSummaryText(pageRange, filteredSamples.length, samples.length, 'sample', performanceExecutionStatusFilter)
    : 'No requests';

  const list = $('performanceExecutionList');
  list.textContent = '';
  if (!samples.length) {
    appendEmptyTestResult(list, 'No performance request results were recorded.');
  } else if (!filteredSamples.length) {
    appendEmptyTestResult(list, 'No performance request results match this status filter.');
  } else {
    visibleSamples.forEach((entry) => list.append(performanceExecutionRow(entry.item, entry.index)));
  }
  renderExecutionPagination({
    containerId: 'performanceExecutionPagination',
    label: 'Performance request results',
    onPageChange: (nextPage) => {
      performanceExecutionPage = nextPage;
      const nextRange = executionPageRange(filteredSamples.length, nextPage);
      selectedPerformanceResultIndex = filteredSamples[nextRange.startIndex]?.index ?? 0;
      renderPerformanceResult(lastPerformanceResult);
    },
    page: performanceExecutionPage,
    totalItems: filteredSamples.length
  });
  renderPerformanceExecutionDetails(result);
}

function renderStoredPerformanceResult(result = lastPerformanceResult) {
  ensurePerformanceResultsStructure();
  const pageInfo = result.resultPage || {};
  const statusCounts = pageInfo.statusCounts || {};
  performanceExecutionStatusFilter = renderExecutionStatusFilterFromCounts({
    selectId: 'performanceExecutionStatusFilter',
    counts: statusCounts,
    selected: performanceExecutionStatusFilter,
    onChange: (status) => {
      performanceExecutionStatusFilter = status;
      performanceExecutionPage = 0;
      selectedPerformanceResultIndex = 0;
      renderPerformanceResult(lastPerformanceResult);
    }
  });
  const summary = result.summary || {};
  const outcomeCounts = performanceResultOutcomeCounts(result);
  const statusCodes = Object.entries(summary.statusCodes || statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ') || 'none';
  $('performanceResultsSummary').textContent = [
    `${result.completedRequests || 0}/${result.totalRequests || 0} requests completed`,
    `${outcomeCounts.successful} successful`,
    `${outcomeCounts.failed} failed${result.cancelled ? ', cancelled' : ''}`,
    `RPS ${formatNumber(summary.requestsPerSecond)}`,
    `p95 ${formatNumber(summary.p95DurationMillis)} ms`,
    summary.diagnosis ? `confidence ${summary.diagnosis.confidence || 'low'}` : '',
    result.detailCaptureTruncated ? 'detail capture truncated' : '',
    `statuses ${statusCodes}`
  ].filter(Boolean).join(' | ');
  renderPerformanceRunDetails(result);
  renderPerformanceGraphs(result);
  const totalAll = Number(pageInfo.totalAll ?? result.completedRequests ?? 0);
  const filteredTotal = filteredCountFromStatusCounts(statusCounts, performanceExecutionStatusFilter, totalAll);
  performanceExecutionPage = executionPageForIndex(performanceExecutionPage * EXECUTION_RESULT_PAGE_SIZE, filteredTotal, performanceExecutionPage);
  const pageRange = executionPageRange(filteredTotal, performanceExecutionPage);
  $('performanceExecutionSummary').textContent = filteredTotal
    ? executionFilterSummaryText(pageRange, filteredTotal, totalAll, 'sample', performanceExecutionStatusFilter)
    : 'No requests';
  const list = $('performanceExecutionList');
  list.textContent = '';
  appendEmptyTestResult(list, 'Loading performance request results...');
  clearStoredDetails('performance');
  const token = ++performanceExecutionRenderToken;
  return window.postmeter.performance.resultPage(result.resultStoreId || result.id, {
    offset: pageRange.startIndex,
    limit: EXECUTION_RESULT_PAGE_SIZE,
    status: performanceExecutionStatusFilter
  }).then((page) => {
    if (token !== performanceExecutionRenderToken || lastPerformanceResult !== result) {
      return;
    }
    const rows = Array.isArray(page?.items) ? page.items : [];
    list.textContent = '';
    if (!rows.length) {
      appendEmptyTestResult(list, performanceExecutionStatusFilter === 'all'
        ? 'No performance request results were recorded.'
        : 'No performance request results match this status filter.');
    } else {
      if (!rows.some((item) => item.resultIndex === selectedPerformanceResultIndex)) {
        selectedPerformanceResultIndex = Number(rows[0]?.resultIndex || 0);
      }
      rows.forEach((item) => list.append(performanceExecutionRow(item, Number(item.resultIndex || 0))));
    }
    renderExecutionPagination({
      containerId: 'performanceExecutionPagination',
      label: 'Performance request results',
      onPageChange: (nextPage) => {
        performanceExecutionPage = nextPage;
        renderPerformanceResult(lastPerformanceResult);
      },
      page: performanceExecutionPage,
      totalItems: Number(page?.total ?? filteredTotal)
    });
    return renderStoredPerformanceExecutionDetails(result);
  }).catch((error) => {
    if (token !== performanceExecutionRenderToken) {
      return;
    }
    list.textContent = '';
    appendEmptyTestResult(list, error.message || String(error));
  });
}

function ensurePerformanceResultsStructure() {
  const root = $('performanceResults');
  if (!root) {
    return null;
  }
  if ($('performanceResultsSummary') && $('performanceRunDetails') && $('performanceExecutionList') && $('performanceExecutionDetails')) {
    return root;
  }
  root.textContent = '';

  const header = document.createElement('div');
  header.className = 'runner-results-header performance-results-header';
  const heading = document.createElement('div');
  heading.className = 'runner-results-heading performance-results-heading';
  const headerTitle = document.createElement('h3');
  headerTitle.textContent = 'Results';
  const summary = document.createElement('div');
  summary.id = 'performanceResultsSummary';
  summary.className = 'test-results-summary';
  summary.textContent = 'No performance run yet.';
  heading.append(headerTitle, summary);
  const exportGroup = document.createElement('div');
  exportGroup.className = 'toolbar-group menu-group result-export-menu-group';
  exportGroup.setAttribute('aria-label', 'Performance result export');
  const exportButton = document.createElement('button');
  exportButton.id = 'exportPerformanceResultsButton';
  exportButton.className = 'menu-trigger';
  exportButton.type = 'button';
  exportButton.disabled = true;
  exportButton.setAttribute('aria-haspopup', 'menu');
  exportButton.setAttribute('aria-expanded', 'false');
  exportButton.textContent = 'Export Results';
  exportButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = exportMenu.hidden !== false;
    closeToolbarMenus();
    closeCaptureSettingsPanels();
    exportMenu.hidden = !shouldOpen;
    if (shouldOpen) {
      positionRendererToolbarMenu?.(exportButton, exportMenu, { windowObject: window });
    }
    exportButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  });
  const exportMenu = document.createElement('div');
  exportMenu.id = 'exportPerformanceResultsMenu';
  exportMenu.className = 'toolbar-menu';
  exportMenu.role = 'menu';
  exportMenu.setAttribute('aria-labelledby', 'exportPerformanceResultsButton');
  exportMenu.hidden = true;
  for (const [id, label] of [
    ['exportPerformanceResultHtmlButton', 'HTML Report'],
    ['exportPerformanceResultJsonButton', 'JSON'],
    ['exportPerformanceResultCsvButton', 'CSV']
  ]) {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.role = 'menuitem';
    button.disabled = true;
    button.textContent = label;
    if (id === 'exportPerformanceResultHtmlButton') {
      button.addEventListener('click', () => openHtmlReportOptionsModal('performance'));
    } else if (id === 'exportPerformanceResultJsonButton') {
      button.addEventListener('click', () => { void exportActivePerformanceResult('json'); });
    } else if (id === 'exportPerformanceResultCsvButton') {
      button.addEventListener('click', () => { void exportActivePerformanceResult('csv'); });
    }
    exportMenu.append(button);
  }
  exportGroup.append(exportButton, exportMenu);
  header.append(heading, exportGroup);

  const tabs = document.createElement('div');
  tabs.className = 'tabs performance-output-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Performance output sections');
  tabs.dataset.tabGroup = 'performanceOutput';

  const resultsTabButton = document.createElement('button');
  resultsTabButton.id = 'performanceOutputResultsTabButton';
  resultsTabButton.className = 'tab active';
  resultsTabButton.type = 'button';
  resultsTabButton.setAttribute('role', 'tab');
  resultsTabButton.dataset.tabGroup = 'performanceOutput';
  resultsTabButton.dataset.tab = 'performanceOutputResults';
  resultsTabButton.setAttribute('aria-selected', 'true');
  resultsTabButton.setAttribute('aria-controls', 'performanceOutputResultsTab');
  resultsTabButton.textContent = 'Results';
  resultsTabButton.addEventListener('click', () => activateTab('performanceOutput', 'performanceOutputResults'));

  const requestsTabButton = document.createElement('button');
  requestsTabButton.id = 'performanceOutputRequestsTabButton';
  requestsTabButton.className = 'tab';
  requestsTabButton.type = 'button';
  requestsTabButton.setAttribute('role', 'tab');
  requestsTabButton.dataset.tabGroup = 'performanceOutput';
  requestsTabButton.dataset.tab = 'performanceOutputRequests';
  requestsTabButton.setAttribute('aria-selected', 'false');
  requestsTabButton.setAttribute('aria-controls', 'performanceOutputRequestsTab');
  requestsTabButton.textContent = 'Requests';
  requestsTabButton.addEventListener('click', () => activateTab('performanceOutput', 'performanceOutputRequests'));

  const graphsTabButton = document.createElement('button');
  graphsTabButton.id = 'performanceOutputGraphsTabButton';
  graphsTabButton.className = 'tab';
  graphsTabButton.type = 'button';
  graphsTabButton.setAttribute('role', 'tab');
  graphsTabButton.dataset.tabGroup = 'performanceOutput';
  graphsTabButton.dataset.tab = 'performanceOutputGraphs';
  graphsTabButton.setAttribute('aria-selected', 'false');
  graphsTabButton.setAttribute('aria-controls', 'performanceOutputGraphsTab');
  graphsTabButton.textContent = 'Graphs';
  graphsTabButton.addEventListener('click', () => activateTab('performanceOutput', 'performanceOutputGraphs'));
  tabs.append(resultsTabButton, requestsTabButton, graphsTabButton);

  const resultsPanel = document.createElement('div');
  resultsPanel.id = 'performanceOutputResultsTab';
  resultsPanel.className = 'tab-panel performance-output-panel active';
  resultsPanel.setAttribute('role', 'tabpanel');
  resultsPanel.setAttribute('aria-labelledby', 'performanceOutputResultsTabButton');

  const runDetails = document.createElement('div');
  runDetails.id = 'performanceRunDetails';
  runDetails.className = 'runner-execution-details performance-run-details';
  appendEmptyTestResult(runDetails, 'No performance run yet.');

  resultsPanel.append(runDetails);

  const requestsPanel = document.createElement('div');
  requestsPanel.id = 'performanceOutputRequestsTab';
  requestsPanel.className = 'tab-panel performance-output-panel';
  requestsPanel.setAttribute('role', 'tabpanel');
  requestsPanel.setAttribute('aria-labelledby', 'performanceOutputRequestsTabButton');

  const grid = document.createElement('div');
  grid.className = 'runner-execution-grid performance-execution-grid';
  grid.append(
    performanceResultSection('performanceExecutionTitle', 'Requests', 'performanceExecutionSummary', 'No requests', 'performanceExecutionList', 'No performance execution yet.'),
    performanceResultSection('performanceExecutionDetailsTitle', 'Request details', 'performanceExecutionDetailsStatus', 'No selection', 'performanceExecutionDetails', 'Select a completed request to inspect its performance details.')
  );
  requestsPanel.append(grid);

  const graphsPanel = document.createElement('div');
  graphsPanel.id = 'performanceOutputGraphsTab';
  graphsPanel.className = 'tab-panel performance-output-panel performance-graphs-panel';
  graphsPanel.setAttribute('role', 'tabpanel');
  graphsPanel.setAttribute('aria-labelledby', 'performanceOutputGraphsTabButton');
  appendEmptyTestResult(graphsPanel, 'No graphs yet.');

  root.append(header, tabs, resultsPanel, requestsPanel, graphsPanel);
  return root;
}

function performanceResultSection(titleId, titleText, summaryId, summaryText, bodyId, emptyText) {
  const section = document.createElement('section');
  section.className = `script-results-section ${bodyId === 'performanceExecutionList' ? 'runner-execution-section' : 'runner-detail-section'}`;
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
  if (bodyId === 'performanceExecutionList') {
    header.append(executionStatusFilterTitleRow(title, 'performanceExecutionStatusFilter', 'Filter performance requests by status code'));
  } else {
    header.append(title);
  }
  header.append(summary);

  const body = document.createElement('div');
  body.id = bodyId;
  body.className = bodyId === 'performanceExecutionList' ? 'runner-execution-list' : 'runner-execution-details';
  if (bodyId === 'performanceExecutionList') {
    body.setAttribute('aria-live', 'polite');
  }
  appendEmptyTestResult(body, emptyText);

  section.append(header, body);
  if (bodyId === 'performanceExecutionList') {
    const pagination = document.createElement('div');
    pagination.id = 'performanceExecutionPagination';
    pagination.className = 'runner-execution-pagination';
    pagination.hidden = true;
    section.append(pagination);
  }
  return section;
}

function performanceExecutionRow(sample, index) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `runner-execution-row${index === selectedPerformanceResultIndex ? ' active' : ''}`;
  row.dataset.performanceExecutionIndex = String(index);
  row.setAttribute('aria-pressed', index === selectedPerformanceResultIndex ? 'true' : 'false');
  row.setAttribute('aria-label', `Show details for ${sample?.requestDisplayName || sample?.requestName || 'request'} iteration ${sample?.iteration || index + 1} with status ${runnerStatusLabel(sample)}`);
  row.addEventListener('click', () => {
    selectPerformanceExecutionRow(index);
  });

  const badge = document.createElement('span');
  badge.className = `runner-status-badge ${runnerStatusClass(sample)}`;
  badge.textContent = runnerStatusLabel(sample);

  const content = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'runner-execution-name';
  name.textContent = sample?.requestDisplayName || sample?.requestName || 'Performance Request';
  const meta = document.createElement('span');
  meta.className = 'runner-execution-meta';
  meta.textContent = performanceExecutionMeta(sample);
  content.append(name, meta);
  row.append(badge, content);
  return row;
}

function performanceExecutionMeta(sample = {}) {
  const request = performanceRequestForExecutionItem(sample);
  const iteration = Number.isFinite(Number(sample.iteration)) ? `#${Number(sample.iteration)}` : '';
  const method = sample.requestMethod || request?.method || '';
  const url = sample.requestUrl || request?.url || '';
  const duration = Number.isFinite(Number(sample.durationMillis)) ? `${formatNumber(sample.durationMillis)} ms` : '';
  return [iteration, method, url, duration].filter(Boolean).join(' ');
}

function renderPerformanceExecutionDetails(result = lastPerformanceResult) {
  const samples = Array.isArray(result?.samples) ? result.samples : [];
  const sample = samples[selectedPerformanceResultIndex] || null;
  const status = $('performanceExecutionDetailsStatus');
  const details = $('performanceExecutionDetails');
  if (!details || !status) {
    return;
  }
  details.textContent = '';
  if (!sample) {
    status.textContent = 'No selection';
    appendEmptyTestResult(details, 'Select a completed request to inspect its performance details.');
    return;
  }
  status.textContent = runnerStatusLabel(sample);
  const request = performanceRequestForExecutionItem(sample);
  details.append(performanceExecutionOverview(sample, request));
  if (sample.error) {
    details.append(runnerDetailTextBlock('Error', sample.error, 'runner-detail-error'));
  }
  appendRunnerTransportDetails(details, sample);
  appendRunnerScriptResultDetails(details, 'Pre-request', sample.preRequestScriptResult);
  appendRunnerScriptResultDetails(details, 'Post-request', sample.testScriptResult);
  appendRunnerVariableDetails(details, 'Request variables', sample.localVariables || []);
  appendRunnerVariableDetails(details, 'Environment variables', result?.environment?.variables || []);
  appendRunnerResponseBodyDetails(details, sample);
}

function renderStoredPerformanceExecutionDetails(result = lastPerformanceResult) {
  const status = $('performanceExecutionDetailsStatus');
  const details = $('performanceExecutionDetails');
  if (!details || !status) {
    return;
  }
  details.textContent = '';
  status.textContent = 'Loading';
  appendEmptyTestResult(details, 'Loading performance request details...');
  const token = performanceExecutionRenderToken;
  return window.postmeter.performance.resultDetail(result.resultStoreId || result.id, selectedPerformanceResultIndex)
    .then((sample) => {
      if (token !== performanceExecutionRenderToken || lastPerformanceResult !== result) {
        return;
      }
      details.textContent = '';
      if (!sample) {
        status.textContent = 'No selection';
        appendEmptyTestResult(details, 'Select a completed request to inspect its performance details.');
        return;
      }
      status.textContent = runnerStatusLabel(sample);
      const request = performanceRequestForExecutionItem(sample);
      details.append(performanceExecutionOverview(sample, request));
      if (sample.error) {
        details.append(runnerDetailTextBlock('Error', sample.error, 'runner-detail-error'));
      }
      appendRunnerTransportDetails(details, sample);
      appendRunnerScriptResultDetails(details, 'Pre-request', sample.preRequestScriptResult);
      appendRunnerScriptResultDetails(details, 'Post-request', sample.testScriptResult);
      appendRunnerVariableDetails(details, 'Request variables', sample.localVariables || []);
      appendRunnerVariableDetails(details, 'Environment variables', result?.environment?.variables || []);
      appendRunnerResponseBodyDetails(details, sample);
    }).catch((error) => {
      if (token !== performanceExecutionRenderToken) {
        return;
      }
      status.textContent = 'Error';
      details.textContent = '';
      appendEmptyTestResult(details, error.message || String(error));
    });
}

function renderPerformanceRunDetails(result = lastPerformanceResult) {
  const details = $('performanceRunDetails');
  if (!details) {
    return;
  }
  details.textContent = '';
  if (!result) {
    appendEmptyTestResult(details, 'No performance run yet.');
    return;
  }
  appendPerformanceRunSummary(details, result);
  appendPerformanceDiagnosisSummary(details, result);
  appendPerformanceErrorSummary(details, result);
}

function renderPerformanceGraphMessage(message) {
  performanceGraphRenderToken += 1;
  const panel = $('performanceOutputGraphsTab');
  if (!panel) {
    return;
  }
  panel.textContent = '';
  appendEmptyTestResult(panel, message || 'No graphs yet.');
}

async function renderPerformanceGraphs(result = lastPerformanceResult) {
  const panel = $('performanceOutputGraphsTab');
  if (!panel) {
    return;
  }
  const token = ++performanceGraphRenderToken;
  panel.textContent = '';
  if (!result) {
    appendEmptyTestResult(panel, 'No graphs yet.');
    return;
  }
  if (result.storeBacked === true) {
    appendEmptyTestResult(panel, 'Loading graph data...');
  }
  let samples = [];
  try {
    samples = await performanceGraphSamplesForResult(result);
  } catch (error) {
    if (token !== performanceGraphRenderToken) {
      return;
    }
    panel.textContent = '';
    appendEmptyTestResult(panel, `Graph data could not be loaded: ${error.message || String(error)}`);
    return;
  }
  if (token !== performanceGraphRenderToken) {
    return;
  }
  panel.textContent = '';
  const data = performanceGraphData(result, samples);
  const dashboard = document.createElement('div');
  dashboard.className = 'performance-graphs-dashboard';
  const typeCards = performanceTypeGraphCards(data);
  if (typeCards.length) {
    dashboard.append(performanceGraphSection(performanceGraphTypeTitle(data.type), typeCards));
  }
  panel.append(dashboard);
}

function performanceGraphData(result = {}, sampleOverride = null) {
  const samples = Array.isArray(sampleOverride) ? performanceGraphSortSamples(sampleOverride) : performanceGraphSamples(result);
  const activeTest = activePerformanceTest();
  const type = String(result.type || activeTest?.type || 'performance');
  const phases = performanceGraphPhaseSummaries(result, samples, type);
  return {
    type,
    samples,
    statusCounts: performanceGraphStatusCounts(result, samples),
    phases,
    chunks: performanceGraphChunks(samples, 36)
  };
}

function performanceGraphSamples(result = {}) {
  const source = Array.isArray(result.samples) && result.samples.length
    ? result.samples
    : Array.isArray(result.resultPage?.items)
      ? result.resultPage.items
      : [];
  return performanceGraphSortSamples(source);
}

async function performanceGraphSamplesForResult(result = {}) {
  if (result.storeBacked !== true || !window.postmeter?.performance?.resultPage || !(result.resultStoreId || result.id)) {
    return performanceGraphSamples(result);
  }
  if (performanceGraphSampleCache.has(result)) {
    return performanceGraphSampleCache.get(result);
  }
  const promise = fetchPerformanceGraphSamples(result).catch(() => performanceGraphSamples(result));
  performanceGraphSampleCache.set(result, promise);
  return promise;
}

async function fetchPerformanceGraphSamples(result = {}) {
  const resultId = result.resultStoreId || result.id;
  const total = Math.max(0, Math.floor(Number(result.resultPage?.totalAll ?? result.completedRequests ?? result.totalRequests ?? 0)));
  const offsets = performanceGraphPageOffsets(total, PERFORMANCE_GRAPH_PAGE_LIMIT, PERFORMANCE_GRAPH_SAMPLE_LIMIT);
  const samplesByIndex = new Map();
  for (const offset of offsets) {
    const page = await window.postmeter.performance.resultPage(resultId, {
      offset,
      limit: PERFORMANCE_GRAPH_PAGE_LIMIT,
      status: 'all'
    });
    for (const item of page?.items || []) {
      const key = Number(item.resultIndex ?? item.iteration ?? samplesByIndex.size);
      samplesByIndex.set(Number.isFinite(key) ? key : samplesByIndex.size, item);
    }
  }
  for (const status of performanceGraphImportantStatuses(result)) {
    const page = await window.postmeter.performance.resultPage(resultId, {
      offset: 0,
      limit: PERFORMANCE_GRAPH_PAGE_LIMIT,
      status
    });
    for (const item of page?.items || []) {
      const key = Number(item.resultIndex ?? item.iteration ?? samplesByIndex.size);
      samplesByIndex.set(Number.isFinite(key) ? key : samplesByIndex.size, item);
    }
  }
  const samples = performanceGraphSortSamples(Array.from(samplesByIndex.values()));
  return samples.length ? samples : performanceGraphSamples(result);
}

function performanceGraphImportantStatuses(result = {}) {
  const counts = performanceGraphStatusCounts(result, performanceGraphSamples(result));
  return Object.entries(counts)
    .filter(([, count]) => Number(count || 0) > 0)
    .map(([status]) => status)
    .filter((status) => status === 'ERR' || Number(status) >= 400)
    .sort(performanceStatusSort);
}

function performanceGraphPageOffsets(total, pageLimit, sampleLimit) {
  const normalizedLimit = Math.max(1, Math.floor(Number(pageLimit || 1)));
  const normalizedSampleLimit = Math.max(normalizedLimit, Math.floor(Number(sampleLimit || normalizedLimit)));
  const normalizedTotal = Math.max(0, Math.floor(Number(total || 0)));
  if (normalizedTotal <= normalizedSampleLimit) {
    const pageCount = Math.max(1, Math.ceil(Math.max(1, normalizedTotal) / normalizedLimit));
    return Array.from({ length: pageCount }, (_value, index) => index * normalizedLimit);
  }
  const windows = Math.max(1, Math.floor(normalizedSampleLimit / normalizedLimit));
  if (windows === 1) {
    return [0];
  }
  const maxOffset = Math.max(0, normalizedTotal - normalizedLimit);
  const offsets = new Set();
  for (let index = 0; index < windows; index += 1) {
    offsets.add(Math.round((maxOffset * index) / (windows - 1)));
  }
  return Array.from(offsets).sort((left, right) => left - right);
}

function performanceGraphSortSamples(samples = []) {
  return (Array.isArray(samples) ? samples : []).slice().sort((left, right) => {
    const leftIndex = Number(left.resultIndex ?? left.iteration ?? 0);
    const rightIndex = Number(right.resultIndex ?? right.iteration ?? 0);
    return leftIndex - rightIndex;
  });
}

function performanceGraphStatusCounts(result = {}, samples = []) {
  const aggregateCounts = {};
  let hasAggregateCounts = false;
  for (const source of [result.resultPage?.statusCounts, result.summary?.statusCodes]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      continue;
    }
    let sourceHasCounts = false;
    for (const [status, count] of Object.entries(source)) {
      const normalizedStatus = performanceNormalizeStatusLabel(status);
      if (!normalizedStatus || normalizedStatus === '-') {
        continue;
      }
      const numericCount = Number(count || 0);
      if (!Number.isFinite(numericCount) || numericCount <= 0) {
        continue;
      }
      hasAggregateCounts = true;
      sourceHasCounts = true;
      aggregateCounts[normalizedStatus] = (aggregateCounts[normalizedStatus] || 0) + numericCount;
    }
    if (sourceHasCounts) {
      break;
    }
  }
  const sampleCounts = {};
  for (const sample of samples || []) {
    const status = performanceSampleStatusLabel(sample);
    if (!status || status === '-') {
      continue;
    }
    sampleCounts[status] = (sampleCounts[status] || 0) + 1;
  }
  if (!hasAggregateCounts) {
    return sampleCounts;
  }
  for (const [status, count] of Object.entries(sampleCounts)) {
    if (!aggregateCounts[status]) {
      aggregateCounts[status] = count;
    }
  }
  return aggregateCounts;
}

function performanceNormalizeStatusLabel(status) {
  const text = String(status ?? '').trim();
  if (!text || text === '-' || text === '0' || text.toUpperCase() === 'ERR') {
    return text && text !== '-' ? 'ERR' : text || '';
  }
  return text;
}

function performanceSampleStatusLabel(sample = {}) {
  const statusCode = Number(sample.statusCode);
  if (Number.isFinite(statusCode)) {
    return statusCode > 0 ? String(statusCode) : 'ERR';
  }
  return performanceNormalizeStatusLabel(runnerStatusLabel(sample));
}

function performanceSampleFailed(sample = {}) {
  if (sample.error) {
    return true;
  }
  const statusCode = Number(sample.statusCode);
  if (Number.isFinite(statusCode)) {
    return sample.passed !== true || (!performanceHttpStatusSuccessful(statusCode) && !performanceUnsupportedMethodProbe(sample, statusCode));
  }
  return sample.passed !== true;
}

function performanceHttpStatusSuccessful(statusCode) {
  const code = Number(statusCode || 0);
  return Number.isInteger(code) && code >= 200 && code < 400;
}

function performanceUnsupportedMethodProbe(sample = {}, statusCode = Number(sample.statusCode || 0)) {
  const code = Number(statusCode || 0);
  return (sample.phase === 'head-probe' || sample.phase === 'options-probe')
    && (code === 405 || code === 501);
}

function performanceResultOutcomeCounts(result = {}, samples = []) {
  const total = Math.max(0, Number(result.completedRequests ?? result.totalRequests ?? 0) || 0);
  if (Array.isArray(samples) && samples.length && (!total || samples.length >= total)) {
    const failed = samples.filter(performanceSampleFailed).length;
    return { successful: Math.max(0, samples.length - failed), failed, total: samples.length };
  }
  const statusCounts = result.summary?.statusCodes || result.resultPage?.statusCounts || {};
  const countedTotal = Object.values(statusCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  if (countedTotal > 0 && (!total || countedTotal >= total)) {
    const successful = Object.entries(statusCounts).reduce((sum, [status, count]) => {
      const normalizedStatus = performanceNormalizeStatusLabel(status);
      const statusCode = Number(normalizedStatus);
      return Number.isFinite(statusCode) && (
        performanceHttpStatusSuccessful(statusCode)
        || (String(result.type || '') === 'diagnosis' && (statusCode === 405 || statusCode === 501))
      )
        ? sum + Number(count || 0)
        : sum;
    }, 0);
    return { successful, failed: Math.max(0, countedTotal - successful), total: countedTotal };
  }
  if (String(result.type || '') === 'diagnosis' && (result.successfulRequests != null || result.failedRequests != null)) {
    const successful = Math.max(0, Number(result.successfulRequests || 0));
    const failed = Math.max(0, Number(result.failedRequests || 0));
    return { successful, failed, total: total || successful + failed };
  }
  return {
    successful: Number(result.successfulRequests || 0),
    failed: Number(result.failedRequests || 0),
    total
  };
}

function performanceSampleGraphTimestampMillis(sample = {}, index = 0) {
  const completed = Date.parse(sample.completedAt || '');
  if (Number.isFinite(completed)) {
    return completed;
  }
  const started = Date.parse(sample.startedAt || '');
  if (Number.isFinite(started)) {
    const duration = Number(sample.durationMillis || 0);
    return started + (Number.isFinite(duration) ? Math.max(0, duration) : 0);
  }
  return index * 1000;
}

function performanceGraphPhaseSummaries(result = {}, samples = [], type = 'performance') {
  const diagnosisPhases = result.summary?.diagnosis?.phases;
  if (Array.isArray(diagnosisPhases) && diagnosisPhases.length) {
    return diagnosisPhases.map((phase, index) => ({
      name: phase.phase || phase.name || `phase-${index + 1}`,
      stageIndex: index + 1,
      requests: Number(phase.requests || 0),
      concurrency: Number(phase.concurrency || 0),
      successful: Number(phase.successfulResponses || 0),
      failed: Number(phase.failedResponses || 0),
      averageDurationMillis: Number(phase.averageDurationMillis || 0),
      p95DurationMillis: Number(phase.p95DurationMillis || 0),
      requestsPerSecond: Number(phase.requestsPerSecond || 0),
      errorRate: Number(phase.requests || 0) > 0 ? (Number(phase.failedResponses || 0) / Number(phase.requests || 1)) * 100 : 0
    }));
  }
  const groups = new Map();
  for (const sample of samples) {
    const key = sample.phase || sample.stageName || type || 'run';
    if (!groups.has(key)) {
      groups.set(key, {
        name: key,
        stageIndex: Number(sample.stageIndex || 0),
        requests: 0,
        successful: 0,
        failed: 0,
        concurrency: Number(sample.stageConcurrency || 0),
        durations: [],
        firstStartedAt: sample.startedAt || '',
        lastStartedAt: sample.startedAt || ''
      });
    }
    const group = groups.get(key);
    if (!group.stageIndex || Number(sample.stageIndex || 0) < group.stageIndex) {
      group.stageIndex = Number(sample.stageIndex || 0);
    }
    group.requests += 1;
    group.concurrency = Math.max(group.concurrency, Number(sample.stageConcurrency || 0));
    if (performanceSampleFailed(sample)) {
      group.failed += 1;
    } else {
      group.successful += 1;
    }
    const duration = Number(sample.durationMillis);
    if (Number.isFinite(duration) && duration >= 0) {
      group.durations.push(duration);
    }
    if (sample.startedAt) {
      group.lastStartedAt = sample.startedAt;
    }
  }
  return Array.from(groups.values()).map((group) => {
    const averageDurationMillis = averageNumber(group.durations);
    const elapsedMillis = Math.max(
      group.durations.reduce((sum, value) => sum + value, 0) / Math.max(1, group.concurrency || 1),
      1
    );
    return {
      name: group.name,
      stageIndex: group.stageIndex || 0,
      requests: group.requests,
      concurrency: group.concurrency || 1,
      successful: group.successful,
      failed: group.failed,
      averageDurationMillis,
      p95DurationMillis: percentileNumber(group.durations, 0.95),
      requestsPerSecond: group.requests / (elapsedMillis / 1000),
      errorRate: group.requests > 0 ? (group.failed / group.requests) * 100 : 0
    };
  });
}

function performanceGraphChunks(samples = [], maxChunks = 36) {
  if (!samples.length) {
    return [];
  }
  const size = Math.max(1, Math.ceil(samples.length / maxChunks));
  const chunks = [];
  for (let index = 0; index < samples.length; index += size) {
    const items = samples.slice(index, index + size);
    const durations = items
      .map((sample) => Number(sample.durationMillis))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const failed = items.filter(performanceSampleFailed).length;
    const elapsedMillis = durations.reduce((sum, value) => sum + value, 0) || items.length;
    const elapsedSeconds = Math.max(0.001, elapsedMillis / 1000);
    chunks.push({
      label: `${index + 1}-${index + items.length}`,
      index: chunks.length + 1,
      count: items.length,
      failed,
      successful: items.length - failed,
      averageDurationMillis: averageNumber(durations),
      p95DurationMillis: percentileNumber(durations, 0.95),
      errorRate: items.length ? (failed / items.length) * 100 : 0,
      requestsPerSecond: items.length / (elapsedMillis / 1000),
      successfulRequestsPerSecond: (items.length - failed) / elapsedSeconds,
      failedRequestsPerSecond: failed / elapsedSeconds,
      averageResponseBytes: averageNumber(items
        .map((sample) => Number(sample.responseBytes))
        .filter((value) => Number.isFinite(value) && value >= 0)),
      concurrency: Math.max(1, ...items.map((sample) => Number(sample.stageConcurrency || 1)).filter(Number.isFinite))
    });
  }
  return chunks;
}

function performanceCodeTimelineData(samples = [], statusCounts = {}) {
  const sampleCounts = {};
  const timedSamples = samples.map((sample, index) => {
    const status = performanceSampleStatusLabel(sample);
    if (status && status !== '-') {
      sampleCounts[status] = (sampleCounts[status] || 0) + 1;
    }
    return {
      sample,
      index,
      status,
      timestampMillis: performanceSampleGraphTimestampMillis(sample, index)
    };
  }).filter((item) => item.status && item.status !== '-' && Number.isFinite(item.timestampMillis));
  if (!timedSamples.length) {
    return { points: [], series: [], bucketMillis: 0 };
  }
  timedSamples.sort((left, right) => left.timestampMillis - right.timestampMillis || left.index - right.index);
  const startMillis = Math.min(...timedSamples.map((item) => item.timestampMillis));
  const endMillis = Math.max(...timedSamples.map((item) => item.timestampMillis));
  const spanMillis = Math.max(0, endMillis - startMillis);
  const bucketMillis = performanceBucketMillis(spanMillis, 160);
  const statuses = Array.from(new Set([
    ...Object.keys(statusCounts || {}).map(performanceNormalizeStatusLabel).filter(Boolean),
    ...timedSamples.map((item) => item.status)
  ])).sort(performanceStatusSort);
  const series = statuses.map((status, index) => ({
    key: `code_${slugGraphKey(status)}`,
    status,
    label: `${status} (${formatNumber(statusCounts?.[status] || sampleCounts[status] || 0)})`,
    className: performanceStatusLineClass(status, index)
  }));
  const keyByStatus = new Map(series.map((item) => [item.status, item.key]));
  const pointByBucket = new Map();
  for (const item of timedSamples) {
    const elapsedMillis = Math.max(0, item.timestampMillis - startMillis);
    const bucketIndex = bucketMillis > 0 ? Math.floor(elapsedMillis / bucketMillis) : 0;
    if (!pointByBucket.has(bucketIndex)) {
      const bucketElapsedMillis = bucketIndex * Math.max(1, bucketMillis);
      const point = {
        label: formatElapsedGraphLabel(bucketElapsedMillis),
        index: bucketIndex + 1,
        elapsedMillis: bucketElapsedMillis
      };
      for (const seriesItem of series) {
        point[seriesItem.key] = null;
      }
      pointByBucket.set(bucketIndex, point);
    }
    const point = pointByBucket.get(bucketIndex);
    const key = keyByStatus.get(item.status);
    if (key) {
      point[key] = performanceStatusGraphValue(item.status);
    }
  }
  const points = Array.from(pointByBucket.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, point], index) => ({
      ...point,
      index: index + 1
    }));
  return { points, series, bucketMillis };
}

function performanceStatusGraphValue(status) {
  if (String(status).toUpperCase() === 'ERR') {
    return 0;
  }
  const code = Number(status);
  return Number.isFinite(code) ? code : 0;
}

function performanceTimingChunks(samples = [], maxChunks = 36) {
  const timedSamples = samples.filter((sample) => sample.timings && Object.keys(sample.timings).length);
  if (!timedSamples.length) {
    return [];
  }
  const size = Math.max(1, Math.ceil(timedSamples.length / maxChunks));
  const chunks = [];
  for (let index = 0; index < timedSamples.length; index += size) {
    const items = timedSamples.slice(index, index + size);
    chunks.push({
      label: `${index + 1}-${index + items.length}`,
      index: chunks.length + 1,
      timeToFirstByteMillis: averageTiming(items, 'timeToFirstByteMillis'),
      tlsHandshakeMillis: averageTiming(items, 'tlsHandshakeMillis'),
      downloadMillis: averageTiming(items, 'downloadMillis')
    });
  }
  return chunks;
}

function performanceGraphSection(title, cards) {
  const section = document.createElement('section');
  section.className = 'performance-graph-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const selector = document.createElement('div');
  selector.className = 'performance-graph-selector';
  selector.setAttribute('role', 'tablist');
  selector.setAttribute('aria-label', `${title} graphs`);
  const stage = document.createElement('div');
  stage.className = 'performance-graph-stage';
  cards.filter(Boolean).forEach((card, index) => {
    const key = card.dataset.performanceChart || `graph-${index + 1}`;
    const tabId = `performance-graph-tab-${key}-${index}`;
    const panelId = `performance-graph-panel-${key}-${index}`;
    const button = document.createElement('button');
    button.id = tabId;
    button.type = 'button';
    button.className = 'performance-graph-selector-button';
    button.dataset.performanceGraphSelect = key;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelId);
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.textContent = card.dataset.performanceChartTitle
      || card.querySelector('.performance-chart-header h4')?.textContent
      || `Graph ${index + 1}`;
    card.id = panelId;
    card.setAttribute('role', 'tabpanel');
    card.setAttribute('aria-labelledby', tabId);
    card.hidden = index !== 0;
    card.classList.toggle('is-active', index === 0);
    button.addEventListener('click', () => {
      Array.from(selector.querySelectorAll('.performance-graph-selector-button')).forEach((item) => {
        item.setAttribute('aria-selected', item === button ? 'true' : 'false');
      });
      Array.from(stage.querySelectorAll('.performance-chart-card')).forEach((item) => {
        const active = item === card;
        item.hidden = !active;
        item.classList.toggle('is-active', active);
      });
    });
    selector.append(button);
    stage.append(card);
  });
  section.append(heading, selector, stage);
  return section;
}

function performanceGraphTypeTitle(type) {
  return {
    diagnosis: 'Endpoint Diagnosis',
    latency: 'Latency Test',
    throughput: 'Throughput Test',
    concurrency: 'Concurrency Test',
    stress: 'Stress Test',
    spike: 'Spike Test',
    soak: 'Soak Test',
    ramp: 'Ramp Test'
  }[type] || 'Performance Test';
}

function performanceTypeGraphCards(data) {
  if (data.type === 'diagnosis') {
    return [
      performanceSaturationCurveChart(data),
      performancePhaseMetricGraph(data, 'Latency by diagnostic phase', 'p95DurationMillis', ' ms', 'P95'),
      performancePhaseMetricGraph(data, 'Throughput by diagnostic phase', 'requestsPerSecond', ' rps', 'RPS'),
      performanceCodesOverTimeGraph(data),
      performanceTransportTimingGraph(data)
    ];
  }
  if (data.type === 'throughput') {
    return [
      performanceRpsTrendChart(data),
      performanceLatencyTrendChart(data),
      performanceCodesOverTimeGraph(data),
      performanceLatencyThroughputScatterChart(data),
      performanceErrorRateTrendChart(data)
    ];
  }
  if (data.type === 'concurrency') {
    return [
      performanceLatencyTrendChart(data, 'Latency over time'),
      performanceRpsTrendChart(data, 'Requests per second over time'),
      performanceCodesOverTimeGraph(data),
      performanceErrorRateTrendChart(data, 'Error rate over time')
    ];
  }
  if (data.type === 'stress') {
    return [
      performanceLatencyTrendChart(data),
      performanceRpsTrendChart(data),
      performanceCodesOverTimeGraph(data),
      performanceErrorRateTrendChart(data),
      performanceSaturationCurveChart(data)
    ];
  }
  if (data.type === 'spike') {
    return [
      performanceLatencyTrendChart(data, 'Spike latency over time'),
      performanceRpsTrendChart(data, 'Spike throughput over time'),
      performanceCodesOverTimeGraph(data),
      performanceErrorRateTrendChart(data, 'Spike error rate over time'),
      performanceLatencyTrendChart(data, 'Recovery latency over time')
    ];
  }
  if (data.type === 'soak') {
    return [
      performanceLatencyTrendChart(data, 'Soak latency trend'),
      performanceRpsTrendChart(data, 'Throughput stability'),
      performanceCodesOverTimeGraph(data),
      performanceErrorRateTrendChart(data, 'Soak error rate trend'),
      performanceResponseSizeTrendGraph(data)
    ];
  }
  if (data.type === 'ramp') {
    return [
      performancePhaseMetricGraph(data, 'Latency by ramp step', 'p95DurationMillis', ' ms', 'P95'),
      performancePhaseMetricGraph(data, 'Throughput by ramp step', 'requestsPerSecond', ' rps', 'RPS'),
      performanceCodesOverTimeGraph(data),
      performanceSaturationCurveChart(data),
      performancePhaseMetricGraph(data, 'Error rate by ramp step', 'errorRate', '%', 'Error rate')
    ];
  }
  return [
    performanceLatencyTrendChart(data),
    performanceCodesOverTimeGraph(data),
    performanceLatencySamplesGraph(data)
  ];
}

function performanceChartCard(title, chartKey, meta = '') {
  const card = document.createElement('article');
  card.className = 'performance-chart-card';
  card.dataset.performanceChart = chartKey;
  card.dataset.performanceChartTitle = title;
  const header = document.createElement('div');
  header.className = 'performance-chart-header';
  const heading = document.createElement('h4');
  heading.textContent = title;
  header.append(heading);
  if (meta) {
    const text = document.createElement('span');
    text.textContent = meta;
    header.append(text);
  }
  const body = document.createElement('div');
  body.className = 'performance-chart-body';
  card.append(header, body);
  return { card, body };
}

function performanceEmptyChart(title, chartKey, message) {
  const { card, body } = performanceChartCard(title, chartKey);
  const empty = document.createElement('p');
  empty.className = 'test-result-empty performance-chart-empty';
  empty.textContent = message || 'No chart data captured for this run.';
  body.append(empty);
  return card;
}

function performanceLatencyTrendChart(data, title = 'Latency over time') {
  if (!data.chunks.length) {
    return performanceEmptyChart(title, 'latency-trend', 'No request samples were captured.');
  }
  const chartKey = title === 'Latency over time' ? 'latency-trend' : slugGraphKey(title);
  const { card, body } = performanceChartCard(title, chartKey, `${data.chunks.length} buckets`);
  body.append(performanceLineSvg(data.chunks, [
    { key: 'averageDurationMillis', label: 'Average', className: 'line-info' },
    { key: 'p95DurationMillis', label: 'P95', className: 'line-warning' }
  ], { valueSuffix: ' ms', xLabel: 'Sample bucket', yLabel: 'Latency (ms)' }));
  body.append(performanceChartLegend([
    { label: 'Average', className: 'line-info' },
    { label: 'P95', className: 'line-warning' }
  ]));
  return card;
}

function performanceCodesOverTimeGraph(data) {
  const timeline = performanceCodeTimelineData(data.samples, data.statusCounts);
  if (!timeline.points.length) {
    return performanceEmptyChart('Codes over time', 'codes-over-time', 'No response status codes were captured.');
  }
  const { card, body } = performanceChartCard('Codes over time', 'codes-over-time');
  body.append(performanceLineSvg(timeline.points, timeline.series, {
    xLabel: 'Elapsed time',
    yLabel: 'Status code',
    showPoints: true,
    fixedMax: 600
  }));
  body.append(performanceChartLegend(timeline.series));
  return card;
}

function performanceErrorRateTrendChart(data, title = 'Error rate over time') {
  if (!data.chunks.length) {
    return performanceEmptyChart(title, slugGraphKey(title), 'No request samples were captured.');
  }
  const { card, body } = performanceChartCard(title, slugGraphKey(title));
  body.append(performanceLineSvg(data.chunks, [
    { key: 'errorRate', label: 'Error rate', className: 'line-danger' }
  ], { valueSuffix: '%', fixedMax: 100, xLabel: 'Sample bucket', yLabel: 'Error rate (%)' }));
  body.append(performanceChartLegend([{ label: 'Error rate', className: 'line-danger' }]));
  return card;
}

function performanceLatencySamplesGraph(data) {
  if (!data.samples.length) {
    return performanceEmptyChart('Latency samples', 'latency-samples', 'No request samples were captured.');
  }
  const { card, body } = performanceChartCard('Latency samples', 'latency-samples', `${data.samples.length} responses`);
  body.append(performanceScatterSvg(data.samples.map((sample, index) => ({
    x: index + 1,
    y: Number(sample.durationMillis || 0),
    label: runnerStatusLabel(sample),
    danger: performanceSampleFailed(sample)
  })), { xLabel: 'Time', yLabel: 'Latency ms' }));
  return card;
}

function performancePhaseMetricGraph(data, title, metric, suffix = '', label = '') {
  const phases = data.phases.length ? data.phases : data.chunks;
  if (!phases.length) {
    return performanceEmptyChart(title, slugGraphKey(title), 'No phase data was captured.');
  }
  const { card, body } = performanceChartCard(title, slugGraphKey(title), `${phases.length} phases`);
  const className = metric === 'errorRate' ? 'line-danger' : metric === 'requestsPerSecond' ? 'line-success' : 'line-warning';
  body.append(performanceLineSvg(phases, [
    { key: metric, label: label || metric, className }
  ], { valueSuffix: suffix, fixedMax: metric === 'errorRate' ? 100 : 0, showPoints: true, xLabel: 'Phase', yLabel: label || title }));
  body.append(performanceChartLegend([{ label: label || metric, className }]));
  return card;
}

function performanceTransportTimingGraph(data) {
  const chunks = performanceTimingChunks(data.samples, 36);
  if (!chunks.length) {
    return performanceEmptyChart('Transport timing over time', 'transport-timing-over-time', 'No transport timing data was captured.');
  }
  const { card, body } = performanceChartCard('Transport timing over time', 'transport-timing-over-time', `${chunks.length} buckets`);
  body.append(performanceLineSvg(chunks, [
    { key: 'timeToFirstByteMillis', label: 'TTFB', className: 'line-info' },
    { key: 'tlsHandshakeMillis', label: 'TLS', className: 'line-warning' },
    { key: 'downloadMillis', label: 'Download', className: 'line-success' }
  ], { valueSuffix: ' ms', xLabel: 'Sample bucket', yLabel: 'Timing (ms)' }));
  body.append(performanceChartLegend([
    { label: 'TTFB', className: 'line-info' },
    { label: 'TLS', className: 'line-warning' },
    { label: 'Download', className: 'line-success' }
  ]));
  return card;
}

function performanceResponseSizeTrendGraph(data) {
  const chunks = data.chunks.filter((chunk) => Number(chunk.averageResponseBytes) > 0);
  if (!chunks.length) {
    return performanceEmptyChart('Response size over time', 'response-size-over-time', 'No response size data was captured.');
  }
  const { card, body } = performanceChartCard('Response size over time', 'response-size-over-time', `${chunks.length} buckets`);
  body.append(performanceLineSvg(chunks, [
    { key: 'averageResponseBytes', label: 'Average bytes', className: 'line-info' }
  ], { valueSuffix: ' B', xLabel: 'Sample bucket', yLabel: 'Response size (bytes)' }));
  body.append(performanceChartLegend([{ label: 'Average bytes', className: 'line-info' }]));
  return card;
}

function performanceSaturationCurveChart(data, title = 'Saturation curve') {
  const phases = data.phases
    .filter((phase) => Number(phase.concurrency) > 0)
    .sort((left, right) => Number(left.concurrency || 0) - Number(right.concurrency || 0)
      || Number(left.stageIndex || 0) - Number(right.stageIndex || 0));
  if (!phases.length) {
    return performanceEmptyChart(title, slugGraphKey(title), 'No concurrency phase data was captured.');
  }
  const { card, body } = performanceChartCard(title, slugGraphKey(title));
  body.append(performanceScatterSvg(phases.map((phase) => ({
    x: phase.concurrency,
    y: phase.p95DurationMillis || phase.averageDurationMillis,
    label: phase.name
  })), { xLabel: 'Concurrency', yLabel: 'Latency ms', connectLine: true, sortByX: true, lineClassName: 'line-info' }));
  return card;
}

function performanceRpsTrendChart(data, title = 'Requests per second over time') {
  if (!data.chunks.length) {
    return performanceEmptyChart(title, slugGraphKey(title), 'No request samples were captured.');
  }
  const { card, body } = performanceChartCard(title, slugGraphKey(title));
  body.append(performanceLineSvg(data.chunks, [
    { key: 'successfulRequestsPerSecond', label: 'Successful', className: 'line-success' },
    { key: 'failedRequestsPerSecond', label: 'Failed', className: 'line-danger' }
  ], { valueSuffix: ' rps', xLabel: 'Sample bucket', yLabel: 'Requests/sec' }));
  body.append(performanceChartLegend([
    { label: 'Successful', className: 'line-success' },
    { label: 'Failed', className: 'line-danger' }
  ]));
  return card;
}

function performanceLatencyThroughputScatterChart(data) {
  if (!data.chunks.length) {
    return performanceEmptyChart('Latency vs throughput', 'latency-throughput', 'No request samples were captured.');
  }
  const { card, body } = performanceChartCard('Latency vs throughput', 'latency-throughput');
  body.append(performanceScatterSvg(data.chunks.map((chunk) => ({
    x: chunk.requestsPerSecond,
    y: chunk.p95DurationMillis || chunk.averageDurationMillis,
    label: chunk.label
  })), { xLabel: 'RPS', yLabel: 'Latency ms' }));
  return card;
}

function performanceLineSvg(points = [], series = [], options = {}) {
  const width = 900;
  const height = 380;
  const padding = { top: 28, right: 34, bottom: 62, left: 76 };
  const svg = performanceSvg(width, height, 'performance-line-chart performance-detailed-chart');
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = [];
  for (const item of points) {
    for (const line of series) {
      const value = performanceLineValue(item, line);
      if (value != null) {
        values.push(value);
      }
    }
  }
  const finiteValues = values.filter(Number.isFinite);
  const min = options.minValue == null
    ? 0
    : Math.min(Number(options.minValue) || 0, ...finiteValues);
  const rawMax = Math.max(min + 1, Number(options.fixedMax || 0), ...finiteValues);
  const max = Number(options.fixedMax || 0) > 0 ? rawMax : performanceNiceMax(rawMax);
  const span = Math.max(1, max - min);
  const xFor = (index) => padding.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const yFor = (value) => padding.top + innerHeight - (((Number(value || 0) - min) / span) * innerHeight);
  appendPerformanceLineGrid(svg, points, { width, height, padding, min, max, xFor, yFor, valueSuffix: options.valueSuffix || '' });
  for (const line of series) {
    const plotted = points.map((item, index) => ({
      x: xFor(index),
      y: performanceLineValue(item, line) == null ? null : yFor(performanceLineValue(item, line)),
      value: performanceLineValue(item, line),
      label: item.label || String(index + 1)
    }));
    for (const segment of performanceLineSegments(plotted)) {
      if (segment.length <= 1) {
        continue;
      }
      const polyline = performanceSvgElement('polyline', {
        points: segment.map((point) => `${point.x},${point.y}`).join(' '),
        class: `performance-svg-line ${line.className || 'line-info'}`
      });
      svg.append(polyline);
    }
    if (options.showPoints === true || plotted.length <= 120) {
      for (const point of plotted.filter((item) => item.value != null)) {
        const marker = performanceSvgElement('circle', {
          cx: point.x,
          cy: point.y,
          r: 3.5,
          class: `performance-svg-line-point ${line.className || 'line-info'}`
        });
        const title = performanceSvgElement('title');
        title.textContent = `${line.label || line.key} at ${point.label}: ${performanceGraphValueLabel(point.value, options.valueSuffix || '')}`;
        marker.append(title);
        svg.append(marker);
      }
    }
  }
  appendPerformanceAxisTitles(svg, width, height, padding, options.xLabel || '', options.yLabel || '');
  return svg;
}

function performanceLineValue(item = {}, line = {}) {
  const raw = item[line.key];
  if (raw == null || raw === '') {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value * Number(line.scale || 1);
}

function performanceLineSegments(points = []) {
  const segments = [];
  let current = [];
  for (const point of points) {
    if (point.value == null || point.y == null) {
      if (current.length) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    current.push(point);
  }
  if (current.length) {
    segments.push(current);
  }
  return segments;
}

function performanceScatterSvg(points = [], options = {}) {
  const width = 900;
  const height = 380;
  const padding = { top: 28, right: 34, bottom: 62, left: 76 };
  const svg = performanceSvg(width, height, 'performance-scatter-chart performance-detailed-chart');
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxX = performanceNiceMax(Math.max(1, ...points.map((point) => Number(point.x || 0))));
  const maxY = performanceNiceMax(Math.max(1, ...points.map((point) => Number(point.y || 0))));
  const xFor = (value) => padding.left + (Number(value || 0) / maxX) * innerWidth;
  const yFor = (value) => padding.top + innerHeight - ((Number(value || 0) / maxY) * innerHeight);
  appendPerformanceScatterGrid(svg, { width, height, padding, maxX, maxY, xFor, yFor });
  const linePoints = options.sortByX === true
    ? points.slice().sort((left, right) => Number(left.x || 0) - Number(right.x || 0))
    : points;
  if (options.connectLine === true && linePoints.length > 1) {
    svg.append(performanceSvgElement('polyline', {
      points: linePoints.map((point) => `${xFor(point.x)},${yFor(point.y)}`).join(' '),
      class: `performance-svg-line ${options.lineClassName || 'line-info'}`
    }));
  }
  for (const point of points) {
    const marker = performanceSvgElement('circle', {
      cx: xFor(point.x),
      cy: yFor(point.y),
      r: 5,
      class: `performance-svg-point ${point.danger ? 'is-danger' : 'is-info'}`
    });
    const title = performanceSvgElement('title');
    title.textContent = `${point.label || 'Sample'}: ${performanceGraphValueLabel(point.y, '')}`;
    marker.append(title);
    svg.append(marker);
  }
  appendPerformanceAxisTitles(svg, width, height, padding, options.xLabel || '', options.yLabel || '');
  return svg;
}

function performanceChartLegend(items) {
  const legend = document.createElement('div');
  legend.className = 'performance-chart-legend';
  items.forEach((entry, index) => {
    const normalized = typeof entry === 'string'
      ? { label: entry, className: performanceLegendLineClass(index) }
      : { label: entry.label || entry.key || `Series ${index + 1}`, className: entry.className || performanceLegendLineClass(index) };
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.className = `performance-legend-swatch ${normalized.className}`;
    item.append(swatch, document.createTextNode(normalized.label));
    legend.append(item);
  });
  return legend;
}

function performanceSvg(width, height, className) {
  const svg = performanceSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    class: className
  });
  svg.setAttribute('preserveAspectRatio', 'none');
  return svg;
}

function performanceSvgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function appendPerformanceLineGrid(svg, points, options) {
  const { width, height, padding, min, max, xFor, yFor, valueSuffix } = options;
  const innerHeight = height - padding.top - padding.bottom;
  const innerWidth = width - padding.left - padding.right;
  svg.append(performanceSvgElement('rect', {
    x: padding.left,
    y: padding.top,
    width: innerWidth,
    height: innerHeight,
    class: 'performance-svg-plot'
  }));
  const horizontalTicks = 5;
  for (let index = 0; index <= horizontalTicks; index += 1) {
    const value = min + ((max - min) * (index / horizontalTicks));
    const y = yFor(value);
    svg.append(performanceSvgElement('line', { x1: padding.left, y1: y, x2: width - padding.right, y2: y, class: 'performance-svg-grid-line' }));
    const label = performanceSvgElement('text', { x: padding.left - 10, y: y + 4, 'text-anchor': 'end', class: 'performance-svg-label' });
    label.textContent = performanceGraphValueLabel(value, valueSuffix);
    svg.append(label);
  }
  for (const index of performanceTickIndexes(points.length, 8)) {
    const x = xFor(index);
    svg.append(performanceSvgElement('line', { x1: x, y1: padding.top, x2: x, y2: padding.top + innerHeight, class: 'performance-svg-grid-line' }));
    const label = performanceSvgElement('text', { x, y: height - padding.bottom + 22, 'text-anchor': 'middle', class: 'performance-svg-label' });
    label.textContent = points[index]?.label || String(index + 1);
    svg.append(label);
  }
  svg.append(performanceSvgElement('line', { x1: padding.left, y1: padding.top + innerHeight, x2: width - padding.right, y2: padding.top + innerHeight, class: 'performance-svg-axis' }));
  svg.append(performanceSvgElement('line', { x1: padding.left, y1: padding.top, x2: padding.left, y2: padding.top + innerHeight, class: 'performance-svg-axis' }));
}

function appendPerformanceScatterGrid(svg, options) {
  const { width, height, padding, maxX, maxY, xFor, yFor } = options;
  const innerHeight = height - padding.top - padding.bottom;
  const innerWidth = width - padding.left - padding.right;
  svg.append(performanceSvgElement('rect', {
    x: padding.left,
    y: padding.top,
    width: innerWidth,
    height: innerHeight,
    class: 'performance-svg-plot'
  }));
  const ticks = 5;
  for (let index = 0; index <= ticks; index += 1) {
    const yValue = maxY * (index / ticks);
    const y = yFor(yValue);
    svg.append(performanceSvgElement('line', { x1: padding.left, y1: y, x2: width - padding.right, y2: y, class: 'performance-svg-grid-line' }));
    const yLabel = performanceSvgElement('text', { x: padding.left - 10, y: y + 4, 'text-anchor': 'end', class: 'performance-svg-label' });
    yLabel.textContent = performanceGraphValueLabel(yValue, '');
    svg.append(yLabel);
    const xValue = maxX * (index / ticks);
    const x = xFor(xValue);
    svg.append(performanceSvgElement('line', { x1: x, y1: padding.top, x2: x, y2: padding.top + innerHeight, class: 'performance-svg-grid-line' }));
    const xLabel = performanceSvgElement('text', { x, y: height - padding.bottom + 22, 'text-anchor': 'middle', class: 'performance-svg-label' });
    xLabel.textContent = performanceGraphValueLabel(xValue, '');
    svg.append(xLabel);
  }
  svg.append(performanceSvgElement('line', { x1: padding.left, y1: padding.top + innerHeight, x2: width - padding.right, y2: padding.top + innerHeight, class: 'performance-svg-axis' }));
  svg.append(performanceSvgElement('line', { x1: padding.left, y1: padding.top, x2: padding.left, y2: padding.top + innerHeight, class: 'performance-svg-axis' }));
}

function appendPerformanceAxisTitles(svg, width, height, padding, xLabel = '', yLabel = '') {
  if (xLabel) {
    const x = performanceSvgElement('text', { x: padding.left + ((width - padding.left - padding.right) / 2), y: height - 12, 'text-anchor': 'middle', class: 'performance-svg-axis-title' });
    x.textContent = xLabel;
    svg.append(x);
  }
  if (yLabel) {
    const y = performanceSvgElement('text', {
      x: 18,
      y: padding.top + ((height - padding.top - padding.bottom) / 2),
      transform: `rotate(-90 18 ${padding.top + ((height - padding.top - padding.bottom) / 2)})`,
      'text-anchor': 'middle',
      class: 'performance-svg-axis-title'
    });
    y.textContent = yLabel;
    svg.append(y);
  }
}

function performanceTickIndexes(length, maxTicks) {
  if (length <= 0) {
    return [];
  }
  if (length === 1) {
    return [0];
  }
  const count = Math.min(length, maxTicks);
  const indexes = new Set();
  for (let index = 0; index < count; index += 1) {
    indexes.add(Math.round((index / (count - 1)) * (length - 1)));
  }
  return Array.from(indexes).sort((left, right) => left - right);
}

function performanceNiceMax(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 1;
  }
  const exponent = 10 ** Math.floor(Math.log10(number));
  const fraction = number / exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * exponent;
}

function performanceBucketMillis(spanMillis, maxBuckets = 160) {
  const candidates = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
  return candidates.find((candidate) => Math.max(1, Math.floor(spanMillis / candidate) + 1) <= maxBuckets) || candidates.at(-1);
}

function performanceStatusSort(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  if (Number.isFinite(leftNumber)) {
    return -1;
  }
  if (Number.isFinite(rightNumber)) {
    return 1;
  }
  return String(left).localeCompare(String(right));
}

function performanceStatusLineClass(status, index = 0) {
  const code = Number(status);
  if (code === 200) {
    return 'line-code-200';
  }
  if (code >= 500) {
    return 'line-danger';
  }
  if (code >= 400) {
    return 'line-warning';
  }
  if (code >= 300) {
    return 'line-purple';
  }
  if (code >= 200) {
    return 'line-success';
  }
  if (String(status).toUpperCase() === 'ERR') {
    return 'line-danger';
  }
  return performanceLegendLineClass(index);
}

function performanceLegendLineClass(index = 0) {
  return ['line-info', 'line-warning', 'line-success', 'line-danger', 'line-purple', 'line-teal', 'line-muted'][index % 7];
}

function formatElapsedGraphLabel(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatGraphGranularity(milliseconds) {
  const seconds = Math.max(1, Math.round(Number(milliseconds || 1000) / 1000));
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  const minutes = seconds / 60;
  return `${formatNumber(minutes)} min`;
}

function performanceGraphValueLabel(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return `0${suffix}`;
  }
  const formatted = Math.abs(number) >= 100 ? String(Math.round(number)) : formatNumber(number);
  return `${formatted}${suffix}`;
}

function averageTiming(samples = [], key) {
  return averageNumber(samples
    .map((sample) => Number(sample.timings?.[key]))
    .filter((value) => Number.isFinite(value) && value > 0));
}

function averageNumber(values = []) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) {
    return 0;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function percentileNumber(values = [], rank = 0.5) {
  const numbers = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!numbers.length) {
    return 0;
  }
  const index = Math.min(numbers.length - 1, Math.max(0, Math.ceil(numbers.length * rank) - 1));
  return numbers[index];
}

function slugGraphKey(value) {
  return String(value || 'chart')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'chart';
}

function performanceExecutionOverview(sample = {}, request = null) {
  const block = document.createElement('div');
  block.className = 'runner-detail-block';
  const heading = document.createElement('h4');
  heading.className = 'runner-detail-heading';
  heading.textContent = sample.requestDisplayName || sample.requestName || request?.name || 'Performance Request';
  const target = document.createElement('div');
  target.className = 'runner-detail-meta';
  target.textContent = [sample.requestMethod || request?.method || '', sample.requestUrl || request?.url || ''].filter(Boolean).join(' ');
  const metrics = document.createElement('div');
  metrics.className = 'runner-detail-meta';
  metrics.textContent = [
    Number.isFinite(Number(sample.iteration)) ? `Iteration ${Number(sample.iteration)}` : '',
    `Status ${runnerStatusLabel(sample)}`,
    Number.isFinite(Number(sample.durationMillis)) ? `${formatNumber(sample.durationMillis)} ms` : '',
    sample.startedAt ? `Started ${sample.startedAt}` : ''
  ].filter(Boolean).join(' | ');
  block.append(heading, target, metrics);
  return block;
}

function appendPerformanceRunSummary(details, result = {}) {
  const summary = result.summary || {};
  const outcomeCounts = performanceResultOutcomeCounts(result);
  const block = runnerDetailBlock('Run summary');
  for (const [key, value] of [
    ['Completed', `${result.completedRequests || 0}/${result.totalRequests || 0}`],
    ['Successful', String(outcomeCounts.successful)],
    ['Failed', String(outcomeCounts.failed)],
    ['RPS', formatNumber(summary.requestsPerSecond)],
    ['Average', `${formatNumber(summary.averageDurationMillis)} ms`],
    ['P95', `${formatNumber(summary.p95DurationMillis)} ms`],
    ['P99', `${formatNumber(summary.p99DurationMillis)} ms`],
    ['Min / Max', `${formatNumber(summary.minDurationMillis)} / ${formatNumber(summary.maxDurationMillis)} ms`],
    ['Statuses', Object.entries(summary.statusCodes || {}).map(([status, count]) => `${status}: ${count}`).join(', ') || 'none']
  ]) {
    const row = document.createElement('div');
    row.className = 'runner-detail-variable';
    const label = document.createElement('span');
    label.textContent = key;
    const text = document.createElement('span');
    text.textContent = value;
    row.append(label, text);
    block.append(row);
  }
  details.append(block);
}

function appendPerformanceDiagnosisSummary(details, result = {}) {
  const diagnosis = result.summary?.diagnosis;
  if (!diagnosis) {
    return;
  }
  const overview = runnerDetailBlock('Endpoint diagnosis');
  for (const [key, value] of [
    ['Confidence', `${diagnosis.confidence || 'low'} (${formatNumber(diagnosis.confidenceScore)} / 100)`],
    ['Best observed RPS', formatNumber(diagnosis.bestObservedRequestsPerSecond)],
    ['Stable RPS', formatNumber(diagnosis.stableRequestsPerSecond)],
    ['Saturation point', diagnosis.saturationPoint || 'Not reached'],
    ['Checks', `${diagnosis.completedChecks || 0}/${diagnosis.requestedChecks || 0}`],
    ['Final URL', diagnosis.finalUrl || 'Not captured']
  ]) {
    const row = document.createElement('div');
    row.className = 'runner-detail-variable';
    const label = document.createElement('span');
    label.textContent = key;
    const text = document.createElement('span');
    text.textContent = value;
    row.append(label, text);
    overview.append(row);
  }
  details.append(overview);

  const checks = runnerDetailBlock('Diagnostic checks');
  for (const check of diagnosis.checks || []) {
    const row = document.createElement('div');
    row.className = 'runner-detail-variable';
    const label = document.createElement('span');
    label.textContent = `${check.status || 'info'} | ${check.group || 'Diagnostics'}`;
    const text = document.createElement('span');
    text.textContent = [check.label || check.id || 'Check', check.value, check.details]
      .filter(Boolean)
      .join(' - ');
    row.append(label, text);
    checks.append(row);
  }
  details.append(checks);
}

function appendPerformanceErrorSummary(details, result = {}) {
  const errors = Object.entries(result.summary?.errors || {});
  if (!errors.length) {
    return;
  }
  const block = runnerDetailBlock('Errors');
  for (const [message, count] of errors) {
    const row = document.createElement('div');
    row.className = 'runner-detail-variable';
    const label = document.createElement('span');
    label.textContent = String(count);
    const text = document.createElement('span');
    text.textContent = message;
    row.append(label, text);
    block.append(row);
  }
  details.append(block);
}

function performanceRequestForExecutionItem(sample = {}) {
  const test = activePerformanceTest();
  if (!test?.request) {
    return null;
  }
  if (!sample.requestId || sample.requestId === test.request.id) {
    return test.request;
  }
  return null;
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return '0';
  }
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}
