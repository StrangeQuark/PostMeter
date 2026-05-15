const { once } = require('node:events');

const PERFORMANCE_REPORT_GRAPH_SAMPLE_LIMIT = 1000;

async function resultHtmlReportToHtml(options = {}) {
  const chunks = [];
  await writeResultHtmlReport({
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    }
  }, options);
  return chunks.join('');
}

async function writeResultHtmlReport(output, options = {}) {
  const kind = normalizeKind(options.kind);
  const result = options.result || {};
  const metadata = options.metadata || {};
  const itemSource = itemSourceFactory(kind, result, options.items);
  const exportedAt = options.exportedAt || new Date().toISOString();
  const title = reportTitle(kind, result, metadata);
  const statusCounts = statusCountsForReport(result);
  const passFail = passFailCounts(kind, result, statusCounts);
  const reportOptions = normalizeReportOptions(options);
  const performanceSections = performanceReportSections(kind, result);

  await writeLine(output, '<!doctype html>');
  await writeLine(output, `<html lang="en" data-theme="${escapeHtml(reportOptions.theme)}">`);
  await writeLine(output, '<head>');
  await writeLine(output, '<meta charset="utf-8">');
  await writeLine(output, '<meta name="viewport" content="width=device-width, initial-scale=1">');
  await writeLine(output, `<title>${escapeHtml(title)} - PostMeter Results Report</title>`);
  await writeLine(output, '<style>');
  await writeLine(output, reportStyles());
  await writeLine(output, '</style>');
  await writeLine(output, '</head>');
  await writeLine(output, '<body>');
  await writeLine(output, '<main class="report-shell">');
  await writeHero(output, { kind, result, metadata, title, exportedAt, passFail });
  await writeLine(output, '<nav class="report-nav" aria-label="Report sections">');
  const navItems = [
    ['#overview', 'Overview'],
    ['#charts', 'Charts and Trends']
  ];
  if (reportOptions.includeRequestResults) {
    navItems.push(['#results', 'Results']);
  }
  for (const section of performanceSections) {
    navItems.push([`#${section.id}`, section.title]);
    if (section.checks?.length) {
      navItems.push([`#${section.checksId}`, section.checksTitle]);
    }
  }
  for (const [href, label] of navItems) {
    await writeLine(output, `<a href="${href}">${label}</a>`);
  }
  await writeLine(output, '</nav>');
  await writeOverview(output, { kind, result, metadata, statusCounts, passFail });
  await writeCharts(output, { kind, result, statusCounts, passFail, itemSource });
  if (reportOptions.includeRequestResults) {
    await writeResultsTable(output, { itemSource, includeRequestDetails: reportOptions.includeRequestDetails, statusCounts });
  }
  for (const section of performanceSections) {
    await writePerformanceSummarySection(output, section);
    if (section.checks?.length) {
      await writePerformanceChecksSection(output, section);
    }
  }
  if (reportOptions.includeRequestResults && reportOptions.includeRequestDetails) {
    await writeResponseDetailTemplates(output, { itemSource });
  }
  await writeLine(output, '</main>');
  if (reportOptions.includeRequestResults && reportOptions.includeRequestDetails) {
    await writeResponseDetailModal(output);
  }
  const scripts = reportScripts({ ...reportOptions, includeChartTabs: kind === 'performance' });
  if (scripts) {
    await writeLine(output, '<script>');
    await writeLine(output, scripts);
    await writeLine(output, '</script>');
  }
  await writeLine(output, '</body>');
  await writeLine(output, '</html>');
}

async function writeHero(output, { kind, result, metadata, title, exportedAt, passFail }) {
  const label = kind === 'performance' ? 'Performance Results' : 'Runner Results';
  const runId = result.resultStoreId || result.id || metadata.runId || '';
  const passed = result.cancelled === true ? false : passFail?.failed === 0;
  await writeLine(output, '<header class="report-hero">');
  await writeLine(output, '<div>');
  await writeLine(output, `<p class="eyebrow">PostMeter ${escapeHtml(label)}</p>`);
  await writeLine(output, `<h1>${escapeHtml(title)}</h1>`);
  await writeLine(output, '<div class="hero-meta">');
  await writeLine(output, `<span>Generated ${escapeHtml(formatDate(exportedAt))}</span>`);
  if (runId) {
    await writeLine(output, `<span>Run ${escapeHtml(runId)}</span>`);
  }
  if (result.detailCaptureTruncated === true) {
    await writeLine(output, '<span class="warning-chip">Detail capture truncated</span>');
  }
  await writeLine(output, '</div>');
  await writeLine(output, '</div>');
  await writeLine(output, `<div class="hero-result ${passed ? 'is-pass' : 'is-fail'}">`);
  await writeLine(output, `<span>${result.cancelled === true ? 'Cancelled' : passed ? 'Passed' : 'Needs Review'}</span>`);
  await writeLine(output, '</div>');
  await writeLine(output, '</header>');
}

async function writeOverview(output, { kind, result, metadata, statusCounts, passFail }) {
  const summary = result.summary || {};
  const cards = [
    ['Total', formatInteger(result.totalRequests ?? result.completedRequests ?? metadata.plannedRequests ?? passFail.total)],
    [kind === 'performance' ? 'Successful' : 'Passed', formatInteger(passFail.passed)],
    ['Failed', formatInteger(passFail.failed)],
    ['Duration', formatDuration(result.durationMillis)]
  ];
  if (kind === 'performance') {
    cards.push(['Requests/sec', formatDecimal(summary.requestsPerSecond)]);
    cards.push(['p95 latency', formatDuration(summary.p95DurationMillis)]);
  } else {
    cards.push(['HTTP responses', formatInteger(result.httpResponses ?? statusTotal(statusCounts))]);
  }
  await writeLine(output, '<section id="overview" class="report-section">');
  await writeLine(output, '<div class="section-heading">');
  await writeLine(output, '<p class="eyebrow">Snapshot</p>');
  await writeLine(output, '<h2>Overview</h2>');
  await writeLine(output, '<p>The high-level result and timing for this run.</p>');
  await writeLine(output, '</div>');
  await writeLine(output, '<div class="metric-grid">');
  for (const [label, value] of cards) {
    await writeLine(output, '<article class="metric-card">');
    await writeLine(output, `<span>${escapeHtml(label)}</span>`);
    await writeLine(output, `<strong>${escapeHtml(value)}</strong>`);
    await writeLine(output, '</article>');
  }
  await writeLine(output, '</div>');
  await writeLine(output, '<div class="info-grid">');
  for (const [label, value] of overviewRows(kind, result, metadata)) {
    await writeInfoRow(output, label, value);
  }
  await writeLine(output, '</div>');
  await writeLine(output, '</section>');
}

async function writeCharts(output, { kind, result, statusCounts, passFail, itemSource }) {
  if (kind === 'performance') {
    await writePerformanceCharts(output, { result, statusCounts, passFail, itemSource });
    return;
  }
  await writeLine(output, '<section id="charts" class="report-section">');
  await writeLine(output, '<div class="section-heading">');
  await writeLine(output, '<p class="eyebrow">Visual Summary</p>');
  await writeLine(output, '<h2>Charts and Trends</h2>');
  await writeLine(output, '<p>Run-level visual summaries for outcomes, status codes, latency, and diagnostic phases.</p>');
  await writeLine(output, '</div>');
  await writeChartsOverviewContent(output, { result, statusCounts, passFail });
  await writeLine(output, '</section>');
}

async function writePerformanceCharts(output, { result, statusCounts, passFail, itemSource }) {
  const samples = await collectPerformanceReportGraphSamples(result, itemSource);
  const data = performanceReportGraphData(result, samples);
  const cards = performanceReportGraphCards(data);
  const panels = [
    { id: 'overview', title: 'Overview' },
    ...cards.map((card, index) => ({
      id: `graph-${index + 1}-${slugifyId(card.title)}`,
      title: card.title,
      card
    }))
  ];
  await writeLine(output, '<section id="charts" class="report-section" data-report-chart-group>');
  await writeLine(output, '<div class="section-heading">');
  await writeLine(output, '<p class="eyebrow">Visual Summary</p>');
  await writeLine(output, '<h2>Charts and Trends</h2>');
  await writeLine(output, '<p>Run-level visual summaries for outcomes, status codes, latency, and diagnostic phases.</p>');
  await writeLine(output, '</div>');
  await writeLine(output, '<div class="chart-selector" role="tablist" aria-label="Charts and trends views">');
  for (const [index, panel] of panels.entries()) {
    await writeLine(output, `<button type="button" class="chart-selector-button${index === 0 ? ' is-active' : ''}" data-report-chart-tab="${escapeHtml(panel.id)}" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}">${escapeHtml(panel.title)}</button>`);
  }
  await writeLine(output, '</div>');
  await writeLine(output, '<div class="report-chart-panels">');
  for (const [index, panel] of panels.entries()) {
    await writeLine(output, `<div class="report-chart-panel" data-report-chart-panel="${escapeHtml(panel.id)}"${index === 0 ? '' : ' hidden'}>`);
    if (panel.card) {
      await writePerformanceGraphCard(output, panel.card);
    } else {
      await writeChartsOverviewContent(output, {
        result,
        statusCounts,
        passFail,
        phases: data.type === 'diagnosis' ? data.phases : [],
        phaseTitle: 'Diagnosis phases'
      });
    }
    await writeLine(output, '</div>');
  }
  await writeLine(output, '</div>');
  await writeLine(output, '</section>');
}

async function writeChartsOverviewContent(output, { result, statusCounts, passFail, phases = [], phaseTitle = 'Diagnosis phases' }) {
  const passDegrees = passFail.total > 0 ? Math.round((passFail.passed / passFail.total) * 360) : 0;
  await writeLine(output, '<div class="chart-grid">');
  await writeLine(output, '<article class="chart-card chart-card-compact">');
  await writeLine(output, '<h3>Pass / fail</h3>');
  await writeLine(output, `<div class="donut" style="--pass-deg:${passDegrees}deg"><span>${escapeHtml(formatPercent(passFail.passed, passFail.total))}</span></div>`);
  await writeLine(output, '<div class="legend-row"><span><i class="legend-pass"></i>Passed</span><span><i class="legend-fail"></i>Failed</span></div>');
  await writeLine(output, '</article>');
  await writeLine(output, '<article class="chart-card">');
  await writeLine(output, '<h3>Status distribution</h3>');
  await writeStatusBars(output, statusCounts);
  await writeLine(output, '</article>');
  await writeLine(output, '<article class="chart-card">');
  await writeLine(output, '<h3>Latency profile</h3>');
  await writeLatencyProfile(output, result);
  await writeLine(output, '</article>');
  if (Array.isArray(phases) && phases.length) {
    await writeLine(output, '<article class="chart-card chart-card-wide">');
    await writeLine(output, `<h3>${escapeHtml(phaseTitle)}</h3>`);
    await writeDiagnosisPhases(output, phases);
    await writeLine(output, '</article>');
  }
  await writeLine(output, '</div>');
}

async function writePerformanceGraphCard(output, card) {
  await writeLine(output, '<article class="chart-card graph-card chart-card-wide">');
  await writeLine(output, `<h3>${escapeHtml(card.title)}</h3>`);
  if (card.meta) {
    await writeLine(output, `<p class="graph-meta">${escapeHtml(card.meta)}</p>`);
  }
  if (card.svg) {
    await writeLine(output, card.svg);
  } else {
    await writeLine(output, `<div class="empty-panel">${escapeHtml(card.empty || 'No graph data was captured for this run.')}</div>`);
  }
  if (Array.isArray(card.legend) && card.legend.length) {
    await writeLine(output, '<div class="legend-row graph-legend">');
    for (const item of card.legend) {
      await writeLine(output, `<span><i class="${escapeHtml(item.className)}"></i>${escapeHtml(item.label)}</span>`);
    }
    await writeLine(output, '</div>');
  }
  await writeLine(output, '</article>');
}

async function writeResultsTable(output, { itemSource, includeRequestDetails, statusCounts }) {
  await writeLine(output, '<section id="results" class="report-section">');
  await writeLine(output, '<div class="section-heading">');
  await writeLine(output, '<p class="eyebrow">Results</p>');
  await writeLine(output, '<h2>Request Results</h2>');
  await writeLine(output, `<p>${includeRequestDetails ? 'A scan-friendly table of every captured request or performance sample. Open row details for headers, bodies, timings, scripts, variables, and raw data.' : 'A scan-friendly table of every captured request or performance sample.'}</p>`);
  await writeLine(output, '</div>');
  await writeLine(output, '<div class="results-controls">');
  await writeLine(output, '<div class="results-filter-group">');
  await writeLine(output, '<label class="page-size-control" for="resultPageSizeSelect"><span>Rows per page</span><select id="resultPageSizeSelect" aria-controls="requestResultsTable"><option value="10">10</option><option value="25" selected>25</option><option value="50">50</option><option value="100">100</option></select></label>');
  await writeLine(output, '<label class="page-size-control" for="resultStatusFilterSelect"><span>Status</span><select id="resultStatusFilterSelect" aria-controls="requestResultsTable"><option value="all">All statuses</option>');
  for (const status of statusFilterOptions(statusCounts)) {
    await writeLine(output, `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`);
  }
  await writeLine(output, '</select></label>');
  await writeLine(output, '</div>');
  await writeLine(output, '<div class="results-pagination" aria-label="Request result pagination"><span id="resultRangeLabel">All results</span><button id="resultPrevPageButton" class="pagination-button" type="button">Previous</button><span id="resultPageLabel">Page 1</span><button id="resultNextPageButton" class="pagination-button" type="button">Next</button></div>');
  await writeLine(output, '</div>');
  await writeLine(output, '<div class="table-frame">');
  await writeLine(output, '<table id="requestResultsTable" class="results-table">');
  await writeLine(output, `<thead><tr><th>#</th><th>Status</th><th>Request</th><th>Phase / Folder</th><th>Duration</th><th>Bytes</th><th>Result</th>${includeRequestDetails ? '<th>Details</th>' : ''}</tr></thead>`);
  await writeLine(output, '<tbody>');
  let count = 0;
  for await (const item of itemSource()) {
    count += 1;
    await writeResultRow(output, item, count, { includeRequestDetails });
  }
  if (count === 0) {
    await writeLine(output, `<tr><td colspan="${includeRequestDetails ? 8 : 7}" class="empty-cell">No request-level results were captured.</td></tr>`);
  } else {
    await writeLine(output, `<tr id="resultFilterEmptyRow" hidden><td colspan="${includeRequestDetails ? 8 : 7}" class="empty-cell">No results match the selected status.</td></tr>`);
  }
  await writeLine(output, '</tbody>');
  await writeLine(output, '</table>');
  await writeLine(output, '</div>');
  await writeLine(output, '</section>');
}

async function writeResponseDetailTemplates(output, { itemSource }) {
  await writeLine(output, '<div id="responseDetailTemplates" hidden>');
  let count = 0;
  for await (const item of itemSource()) {
    count += 1;
    await writeLine(output, `<template id="response-template-${count}">`);
    await writeResponseCard(output, item, count);
    await writeLine(output, '</template>');
  }
  await writeLine(output, '</div>');
}

async function writeResponseDetailModal(output) {
  await writeLine(output, '<div id="responseDetailModal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="responseDetailModalTitle" hidden>');
  await writeLine(output, '<div class="response-modal-panel" role="document">');
  await writeLine(output, '<header class="response-modal-header">');
  await writeLine(output, '<div>');
  await writeLine(output, '<p class="eyebrow">Response Data</p>');
  await writeLine(output, '<h2 id="responseDetailModalTitle">Response Details</h2>');
  await writeLine(output, '</div>');
  await writeLine(output, '<button id="responseDetailCloseButton" class="modal-close-button" type="button" data-modal-close aria-label="Close response details">Close</button>');
  await writeLine(output, '</header>');
  await writeLine(output, '<div id="responseDetailModalContent" class="response-modal-content"></div>');
  await writeLine(output, '</div>');
  await writeLine(output, '</div>');
}

async function writeResultRow(output, item, ordinal, { includeRequestDetails }) {
  const index = item.resultIndex ?? ordinal - 1;
  const status = statusLabel(item);
  const requestName = item.requestDisplayName || item.requestName || item.name || 'Untitled request';
  const target = [item.requestMethod, item.requestUrl || item.finalUrl].filter(Boolean).join(' ');
  const context = item.phase || item.stageName || item.folderName || '';
  await writeLine(output, `<tr class="${item.passed === true ? 'row-pass' : 'row-fail'}" data-result-row data-result-status="${escapeHtml(status)}">`);
  await writeLine(output, `<td>${escapeHtml(String(index))}</td>`);
  await writeLine(output, `<td><span class="status-badge ${statusClass(status)}">${escapeHtml(status)}</span></td>`);
  await writeLine(output, `<td><strong>${escapeHtml(requestName)}</strong><small>${escapeHtml(target || 'No URL captured')}</small></td>`);
  await writeLine(output, `<td>${escapeHtml(context || '-')}</td>`);
  await writeLine(output, `<td>${escapeHtml(formatDuration(item.durationMillis))}</td>`);
  await writeLine(output, `<td>${escapeHtml(formatBytes(item.responseBytes))}</td>`);
  await writeLine(output, `<td>${item.passed === true ? '<span class="pill pass">Passed</span>' : '<span class="pill fail">Failed</span>'}</td>`);
  if (includeRequestDetails) {
    await writeLine(output, `<td><button class="detail-button" type="button" data-detail-template="response-template-${ordinal}">View Details</button></td>`);
  }
  await writeLine(output, '</tr>');
}

async function writeResponseCard(output, item, ordinal) {
  const index = item.resultIndex ?? ordinal - 1;
  const requestName = item.requestDisplayName || item.requestName || item.name || 'Untitled request';
  const target = [item.requestMethod, item.requestUrl || item.finalUrl].filter(Boolean).join(' ');
  await writeLine(output, `<article id="response-${ordinal}" class="response-card ${item.passed === true ? 'is-pass' : 'is-fail'}">`);
  await writeLine(output, '<header class="response-card-header">');
  await writeLine(output, '<div>');
  await writeLine(output, `<p class="eyebrow">Result ${escapeHtml(String(index))}</p>`);
  await writeLine(output, `<h3>${escapeHtml(requestName)}</h3>`);
  await writeLine(output, `<p>${escapeHtml(target || 'No request target captured')}</p>`);
  await writeLine(output, '</div>');
  await writeLine(output, `<span class="status-badge ${statusClass(statusLabel(item))}">${escapeHtml(statusLabel(item))}</span>`);
  await writeLine(output, '</header>');
  await writeLine(output, '<div class="detail-grid">');
  for (const [label, value] of itemDetailRows(item)) {
    await writeInfoRow(output, label, value);
  }
  await writeLine(output, '</div>');
  if (item.error) {
    await writeLine(output, `<div class="error-box"><strong>Error</strong><p>${escapeHtml(item.error)}</p></div>`);
  }
  await writeObjectBlock(output, 'Response headers', item.responseHeaders, 'No response headers were captured.');
  await writeBodyBlock(output, item);
  await writeObjectBlock(output, 'Transport timings', item.timings, 'No transport timings were captured.');
  await writeScriptBlock(output, 'Pre-request script', item.preRequestScriptResult);
  await writeScriptBlock(output, 'Post-response script', item.testScriptResult);
  await writeScriptBlock(output, 'After-response script', item.afterResponseScriptResult);
  await writeObjectBlock(output, 'Message script results', item.messageScriptResults, 'No protocol message script output was captured.');
  await writeObjectBlock(output, 'Local variables', item.localVariables, 'No local variables were captured.');
  await writeLine(output, '</article>');
}

async function writeBodyBlock(output, item) {
  if (item.responseBody == null) {
    const hash = item.bodySha256 ? ` Body SHA-256: ${item.bodySha256}` : '';
    await writeLine(output, `<div class="empty-panel">No response body was captured.${escapeHtml(hash)}</div>`);
    return;
  }
  const formatted = formatBody(item.responseBody);
  await writeLine(output, '<details class="data-block" open>');
  await writeLine(output, '<summary>Response body</summary>');
  await writeLine(output, `<pre>${escapeHtml(formatted || '(empty response body)')}</pre>`);
  await writeLine(output, '</details>');
}

async function writeObjectBlock(output, title, value, emptyText) {
  const empty = value == null || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
  if (empty) {
    await writeLine(output, `<div class="empty-panel">${escapeHtml(emptyText)}</div>`);
    return;
  }
  await writeDetailsBlock(output, title, value);
}

async function writeScriptBlock(output, title, scriptResult) {
  if (!scriptResult) {
    await writeLine(output, `<div class="empty-panel">${escapeHtml(title)} was not captured.</div>`);
    return;
  }
  await writeLine(output, '<details class="data-block" open>');
  await writeLine(output, `<summary>${escapeHtml(title)}</summary>`);
  if (scriptResult.error) {
    await writeLine(output, `<div class="error-box"><strong>Script error</strong><p>${escapeHtml(scriptResult.error)}</p></div>`);
  }
  if (Array.isArray(scriptResult.tests) && scriptResult.tests.length) {
    await writeLine(output, '<ul class="test-list">');
    for (const test of scriptResult.tests) {
      await writeLine(output, `<li><span class="pill ${test.passed === true ? 'pass' : 'fail'}">${test.passed === true ? 'Passed' : 'Failed'}</span><strong>${escapeHtml(test.name || 'Unnamed test')}</strong>${test.error ? `<small>${escapeHtml(test.error)}</small>` : ''}</li>`);
    }
    await writeLine(output, '</ul>');
  }
  if (Array.isArray(scriptResult.logs) && scriptResult.logs.length) {
    await writeLine(output, '<pre>');
    await writeLine(output, escapeHtml(scriptResult.logs.join('\n')));
    await writeLine(output, '</pre>');
  }
  await writeLine(output, '</details>');
}

async function writeDetailsBlock(output, title, value) {
  await writeLine(output, '<details class="data-block">');
  await writeLine(output, `<summary>${escapeHtml(title)}</summary>`);
  await writeLine(output, `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`);
  await writeLine(output, '</details>');
}

async function writeInfoRow(output, label, value) {
  await writeLine(output, '<div class="info-row">');
  await writeLine(output, `<span>${escapeHtml(label)}</span>`);
  await writeLine(output, `<strong>${escapeHtml(value == null || value === '' ? '-' : String(value))}</strong>`);
  await writeLine(output, '</div>');
}

async function writeStatusBars(output, statusCounts) {
  const entries = Object.entries(statusCounts || {}).filter(([, count]) => Number(count) > 0);
  if (!entries.length) {
    await writeLine(output, '<div class="empty-panel">No status distribution data was captured.</div>');
    return;
  }
  const total = entries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
  await writeLine(output, '<div class="bar-list">');
  for (const [status, count] of entries.sort(statusEntrySort)) {
    const percent = total > 0 ? Math.max(2, Math.round((Number(count) / total) * 100)) : 0;
    await writeLine(output, '<div class="bar-row">');
    await writeLine(output, `<span>${escapeHtml(status)}</span>`);
    await writeLine(output, `<div class="bar-track"><div class="bar-fill ${statusClass(status)}" style="width:${percent}%"></div></div>`);
    await writeLine(output, `<strong>${escapeHtml(formatInteger(count))}</strong>`);
    await writeLine(output, '</div>');
  }
  await writeLine(output, '</div>');
}

async function writeLatencyProfile(output, result) {
  const summary = result.summary || {};
  const rows = [
    ['Average', summary.averageDurationMillis],
    ['p95', summary.p95DurationMillis],
    ['p99', summary.p99DurationMillis],
    ['Min', summary.minDurationMillis],
    ['Max', summary.maxDurationMillis]
  ].filter(([, value]) => value != null && value !== '');
  if (!rows.length) {
    await writeLine(output, '<div class="empty-panel">Latency aggregate data was not captured for this run.</div>');
    return;
  }
  await writeLine(output, '<div class="mini-metrics">');
  for (const [label, value] of rows) {
    await writeLine(output, `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatDuration(value))}</strong></div>`);
  }
  await writeLine(output, '</div>');
}

async function writeDiagnosisPhases(output, phases = []) {
  const maxRps = Math.max(1, ...phases.map((phase) => Number(phase.requestsPerSecond || 0)));
  await writeLine(output, '<div class="phase-list">');
  for (const phase of phases) {
    const rps = Number(phase.requestsPerSecond || 0);
    const width = Math.max(2, Math.round((rps / maxRps) * 100));
    await writeLine(output, '<div class="phase-row">');
    await writeLine(output, `<span>${escapeHtml(phase.phase || phase.name || 'phase')}</span>`);
    await writeLine(output, `<div class="bar-track"><div class="bar-fill info" style="width:${width}%"></div></div>`);
    await writeLine(output, `<strong>${escapeHtml(formatDecimal(rps))} rps</strong>`);
    await writeLine(output, '</div>');
  }
  await writeLine(output, '</div>');
}

async function collectPerformanceReportGraphSamples(result = {}, itemSource) {
  const inlineSamples = performanceReportSamples(result);
  if (typeof itemSource !== 'function') {
    return inlineSamples;
  }
  const total = Math.max(0, Math.floor(Number(
    result.resultPage?.totalAll
    ?? result.completedRequests
    ?? result.totalRequests
    ?? inlineSamples.length
  )));
  if (inlineSamples.length && result.storeBacked !== true && total <= inlineSamples.length) {
    return inlineSamples;
  }
  const targetIndexes = total > PERFORMANCE_REPORT_GRAPH_SAMPLE_LIMIT
    ? new Set(Array.from({ length: PERFORMANCE_REPORT_GRAPH_SAMPLE_LIMIT }, (_value, index) => Math.round(((total - 1) * index) / (PERFORMANCE_REPORT_GRAPH_SAMPLE_LIMIT - 1))))
    : null;
  const shouldScanForFailures = Object.entries(performanceReportGraphStatusCounts(result, inlineSamples))
    .some(([status, count]) => Number(count || 0) > 0 && (status === 'ERR' || Number(status) >= 400));
  const samplesByIndex = new Map();
  let failureSamples = 0;
  const failureSampleLimit = Math.floor(PERFORMANCE_REPORT_GRAPH_SAMPLE_LIMIT / 2);
  let ordinal = 0;
  for await (const item of itemSource()) {
    const itemIndex = Number(item.resultIndex ?? item.iteration ?? ordinal);
    const normalizedIndex = Number.isFinite(itemIndex) ? itemIndex : ordinal;
    const targetSample = !targetIndexes || targetIndexes.has(normalizedIndex) || targetIndexes.has(ordinal);
    const failedSample = reportSampleFailed(item) && failureSamples < failureSampleLimit;
    if (targetSample || failedSample) {
      samplesByIndex.set(normalizedIndex, item);
      if (failedSample) {
        failureSamples += 1;
      }
    }
    ordinal += 1;
    if (targetIndexes && !shouldScanForFailures && samplesByIndex.size >= targetIndexes.size) {
      break;
    }
    if (!targetIndexes && total <= 0 && samplesByIndex.size >= PERFORMANCE_REPORT_GRAPH_SAMPLE_LIMIT) {
      break;
    }
  }
  const samples = Array.from(samplesByIndex.values());
  return samples.length ? performanceReportSortSamples(samples) : inlineSamples;
}

function performanceReportGraphData(result = {}, sampleOverride = null) {
  const samples = Array.isArray(sampleOverride) ? performanceReportSortSamples(sampleOverride) : performanceReportSamples(result);
  const chunks = performanceReportChunks(samples, 36);
  const type = String(result.type || 'performance');
  return {
    type,
    samples,
    statusCounts: performanceReportGraphStatusCounts(result, samples),
    chunks,
    phases: performanceReportPhases(result, samples, type)
  };
}

function performanceReportSamples(result = {}) {
  const source = Array.isArray(result.samples) && result.samples.length
    ? result.samples
    : Array.isArray(result.resultPage?.items)
      ? result.resultPage.items
      : [];
  return performanceReportSortSamples(source);
}

function performanceReportSortSamples(samples = []) {
  return (Array.isArray(samples) ? samples : []).slice().sort((left, right) => Number(left.resultIndex ?? left.iteration ?? 0) - Number(right.resultIndex ?? right.iteration ?? 0));
}

function performanceReportGraphStatusCounts(result = {}, samples = []) {
  const aggregateCounts = {};
  let hasAggregateCounts = false;
  for (const source of [result.resultPage?.statusCounts, result.summary?.statusCodes]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      continue;
    }
    let sourceHasCounts = false;
    for (const [status, count] of Object.entries(source)) {
      const normalizedStatus = normalizeGraphStatusLabel(status);
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
    const status = graphStatusLabel(sample);
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

function normalizeGraphStatusLabel(status) {
  const text = String(status ?? '').trim();
  if (!text || text === '-' || text === '0' || text.toUpperCase() === 'ERR') {
    return text && text !== '-' ? 'ERR' : text || '';
  }
  return text;
}

function graphStatusLabel(item = {}) {
  return normalizeGraphStatusLabel(statusLabel(item));
}

function reportSampleFailed(item = {}) {
  if (item.error) {
    return true;
  }
  const statusCode = Number(item.statusCode);
  if (Number.isFinite(statusCode)) {
    return item.passed !== true || (!reportHttpStatusSuccessful(statusCode) && !reportUnsupportedMethodProbe(item, statusCode));
  }
  return item.passed !== true;
}

function reportHttpStatusSuccessful(statusCode) {
  const code = Number(statusCode || 0);
  return Number.isInteger(code) && code >= 200 && code < 400;
}

function reportUnsupportedMethodProbe(item = {}, statusCode = Number(item.statusCode || 0)) {
  const code = Number(statusCode || 0);
  return (item.phase === 'head-probe' || item.phase === 'options-probe')
    && (code === 405 || code === 501);
}

function graphSampleTimestampMillis(item = {}, index = 0) {
  const completed = Date.parse(item.completedAt || '');
  if (Number.isFinite(completed)) {
    return completed;
  }
  const started = Date.parse(item.startedAt || '');
  if (Number.isFinite(started)) {
    const duration = Number(item.durationMillis || 0);
    return started + (Number.isFinite(duration) ? Math.max(0, duration) : 0);
  }
  return index * 1000;
}

function performanceReportChunks(samples = [], maxChunks = 36) {
  if (!samples.length) {
    return [];
  }
  const size = Math.max(1, Math.ceil(samples.length / maxChunks));
  const chunks = [];
  for (let index = 0; index < samples.length; index += size) {
    const items = samples.slice(index, index + size);
    const durations = items.map((item) => Number(item.durationMillis)).filter((value) => Number.isFinite(value) && value >= 0);
    const failed = items.filter(reportSampleFailed).length;
    const elapsedMillis = durations.reduce((sum, value) => sum + value, 0) || items.length;
    const elapsedSeconds = Math.max(0.001, elapsedMillis / 1000);
    chunks.push({
      label: `${index + 1}-${index + items.length}`,
      count: items.length,
      failed,
      successful: items.length - failed,
      averageDurationMillis: averageReportNumber(durations),
      p95DurationMillis: percentileReportNumber(durations, 0.95),
      errorRate: items.length ? (failed / items.length) * 100 : 0,
      requestsPerSecond: items.length / (elapsedMillis / 1000),
      successfulRequestsPerSecond: (items.length - failed) / elapsedSeconds,
      failedRequestsPerSecond: failed / elapsedSeconds,
      averageResponseBytes: averageReportNumber(items.map((item) => Number(item.responseBytes)).filter((value) => Number.isFinite(value) && value >= 0)),
      concurrency: Math.max(1, ...items.map((item) => Number(item.stageConcurrency || 1)).filter(Number.isFinite))
    });
  }
  return chunks;
}

function performanceReportPhases(result = {}, samples = [], type = 'performance') {
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
        durations: []
      });
    }
    const group = groups.get(key);
    if (!group.stageIndex || Number(sample.stageIndex || 0) < group.stageIndex) {
      group.stageIndex = Number(sample.stageIndex || 0);
    }
    group.requests += 1;
    group.concurrency = Math.max(group.concurrency, Number(sample.stageConcurrency || 0));
    if (reportSampleFailed(sample)) {
      group.failed += 1;
    } else {
      group.successful += 1;
    }
    const duration = Number(sample.durationMillis);
    if (Number.isFinite(duration) && duration >= 0) {
      group.durations.push(duration);
    }
  }
  return Array.from(groups.values()).map((group) => {
    const elapsedMillis = group.durations.reduce((sum, value) => sum + value, 0) || group.requests;
    return {
      name: group.name,
      stageIndex: group.stageIndex || 0,
      requests: group.requests,
      concurrency: group.concurrency || 1,
      successful: group.successful,
      failed: group.failed,
      averageDurationMillis: averageReportNumber(group.durations),
      p95DurationMillis: percentileReportNumber(group.durations, 0.95),
      requestsPerSecond: group.requests / (Math.max(1, elapsedMillis) / 1000),
      errorRate: group.requests > 0 ? (group.failed / group.requests) * 100 : 0
    };
  });
}

function performanceReportGraphCards(data) {
  if (data.type === 'diagnosis') {
    return [
      reportSaturationGraph(data),
      reportPhaseMetricGraph(data, 'Latency by diagnostic phase', 'p95DurationMillis', ' ms', 'P95'),
      reportPhaseMetricGraph(data, 'Throughput by diagnostic phase', 'requestsPerSecond', ' rps', 'RPS'),
      reportCodesOverTimeGraph(data),
      reportTransportTimingGraph(data)
    ];
  }
  if (data.type === 'throughput') {
    return [
      reportRpsGraph(data),
      reportLatencyGraph(data),
      reportCodesOverTimeGraph(data),
      reportLatencyThroughputGraph(data),
      reportErrorRateGraph(data)
    ];
  }
  if (data.type === 'concurrency') {
    return [
      reportLatencyGraph(data, 'Latency over time'),
      reportRpsGraph(data, 'Requests per second over time'),
      reportCodesOverTimeGraph(data),
      reportErrorRateGraph(data, 'Error rate over time')
    ];
  }
  if (data.type === 'stress') {
    return [
      reportLatencyGraph(data),
      reportRpsGraph(data),
      reportCodesOverTimeGraph(data),
      reportErrorRateGraph(data),
      reportSaturationGraph(data)
    ];
  }
  if (data.type === 'spike') {
    return [
      reportLatencyGraph(data, 'Spike latency over time'),
      reportRpsGraph(data, 'Spike throughput over time'),
      reportCodesOverTimeGraph(data),
      reportErrorRateGraph(data, 'Spike error rate over time'),
      reportLatencyGraph(data, 'Recovery latency over time')
    ];
  }
  if (data.type === 'soak') {
    return [
      reportLatencyGraph(data, 'Soak latency trend'),
      reportRpsGraph(data, 'Throughput stability'),
      reportCodesOverTimeGraph(data),
      reportErrorRateGraph(data, 'Soak error rate trend'),
      reportResponseSizeGraph(data)
    ];
  }
  if (data.type === 'ramp') {
    return [
      reportPhaseMetricGraph(data, 'Latency by ramp step', 'p95DurationMillis', ' ms', 'P95'),
      reportPhaseMetricGraph(data, 'Throughput by ramp step', 'requestsPerSecond', ' rps', 'RPS'),
      reportCodesOverTimeGraph(data),
      reportSaturationGraph(data),
      reportPhaseMetricGraph(data, 'Error rate by ramp step', 'errorRate', '%', 'Error rate')
    ];
  }
  return [
    reportLatencyGraph(data),
    reportCodesOverTimeGraph(data),
    reportLatencySamplesGraph(data)
  ];
}

function reportLatencyGraph(data, title = 'Latency over time') {
  if (!data.chunks.length) {
    return reportEmptyGraph(title, 'No request samples were captured.');
  }
  return {
    title,
    meta: `${data.chunks.length} buckets`,
    svg: reportLineSvg(data.chunks, [
      { key: 'averageDurationMillis', className: 'line-info' },
      { key: 'p95DurationMillis', className: 'line-warning' }
    ], { valueSuffix: ' ms', xLabel: 'Sample bucket', yLabel: 'Latency (ms)' }),
    legend: reportLegend(['Average', 'P95'])
  };
}

function reportRpsGraph(data, title = 'Requests per second over time') {
  if (!data.chunks.length) {
    return reportEmptyGraph(title, 'No request samples were captured.');
  }
  return {
    title,
    svg: reportLineSvg(data.chunks, [
      { key: 'successfulRequestsPerSecond', className: 'line-success' },
      { key: 'failedRequestsPerSecond', className: 'line-danger' }
    ], { valueSuffix: ' rps', xLabel: 'Sample bucket', yLabel: 'Requests/sec' }),
    legend: reportLegend([
      { label: 'Successful', className: 'line-success' },
      { label: 'Failed', className: 'line-danger' }
    ])
  };
}

function reportCodesOverTimeGraph(data) {
  const timeline = reportCodeTimelineData(data.samples, data.statusCounts);
  if (!timeline.points.length) {
    return reportEmptyGraph('Codes over time', 'No response status codes were captured.');
  }
  return {
    title: 'Codes over time',
    svg: reportLineSvg(timeline.points, timeline.series, { showPoints: true, fixedMax: 600, xLabel: 'Elapsed time', yLabel: 'Status code' }),
    legend: reportLegend(timeline.series)
  };
}

function reportErrorRateGraph(data, title = 'Error rate over time') {
  if (!data.chunks.length) {
    return reportEmptyGraph(title, 'No request samples were captured.');
  }
  return {
    title,
    svg: reportLineSvg(data.chunks, [{ key: 'errorRate', className: 'line-danger' }], { fixedMax: 100, valueSuffix: '%', xLabel: 'Sample bucket', yLabel: 'Error rate (%)' }),
    legend: reportLegend(['Error rate'])
  };
}

function reportLatencyThroughputGraph(data) {
  if (!data.chunks.length) {
    return reportEmptyGraph('Latency vs throughput', 'No request samples were captured.');
  }
  return {
    title: 'Latency vs throughput',
    svg: reportScatterSvg(data.chunks.map((chunk) => ({
      x: chunk.requestsPerSecond,
      y: chunk.p95DurationMillis || chunk.averageDurationMillis
    })), { xLabel: 'RPS', yLabel: 'Latency ms' })
  };
}

function reportPhaseMetricGraph(data, title, metric, suffix = '', label = '') {
  const phases = data.phases.length ? data.phases : data.chunks;
  if (!phases.length) {
    return reportEmptyGraph(title, 'No phase data was captured.');
  }
  return {
    title,
    meta: `${phases.length} phases`,
    svg: reportLineSvg(phases, [{ key: metric, className: metric === 'errorRate' ? 'line-danger' : metric === 'requestsPerSecond' ? 'line-success' : 'line-warning' }], {
      fixedMax: metric === 'errorRate' ? 100 : 0,
      valueSuffix: suffix,
      showPoints: true,
      xLabel: 'Phase',
      yLabel: label || title
    }),
    legend: reportLegend([label || metric])
  };
}

function reportSaturationGraph(data) {
  const phases = (data.phases.length ? data.phases : data.chunks)
    .filter((phase) => Number(phase.concurrency) > 0)
    .sort((left, right) => Number(left.concurrency || 0) - Number(right.concurrency || 0)
      || Number(left.stageIndex || 0) - Number(right.stageIndex || 0));
  if (!phases.length) {
    return reportEmptyGraph('Saturation curve', 'No concurrency phase data was captured.');
  }
  return {
    title: 'Saturation curve',
    svg: reportScatterSvg(phases.map((phase) => ({
      x: Number(phase.concurrency || 1),
      y: Number(phase.p95DurationMillis || phase.averageDurationMillis || 0)
    })), { xLabel: 'Concurrency', yLabel: 'Latency ms', connectLine: true, sortByX: true, lineClassName: 'line-info' })
  };
}

function reportTransportTimingGraph(data) {
  const chunks = performanceReportTimingChunks(data.samples, 36);
  if (!chunks.length) {
    return reportEmptyGraph('Transport timing over time', 'No transport timing data was captured.');
  }
  return {
    title: 'Transport timing over time',
    meta: `${chunks.length} buckets`,
    svg: reportLineSvg(chunks, [
      { key: 'timeToFirstByteMillis', className: 'line-info' },
      { key: 'tlsHandshakeMillis', className: 'line-warning' },
      { key: 'downloadMillis', className: 'line-success' }
    ], { valueSuffix: ' ms', xLabel: 'Sample bucket', yLabel: 'Timing (ms)' }),
    legend: reportLegend(['TTFB', 'TLS', 'Download'])
  };
}

function reportResponseSizeGraph(data) {
  const chunks = data.chunks.filter((chunk) => Number(chunk.averageResponseBytes) > 0);
  if (!chunks.length) {
    return reportEmptyGraph('Response size over time', 'No response size data was captured.');
  }
  return {
    title: 'Response size over time',
    svg: reportLineSvg(chunks, [{ key: 'averageResponseBytes', className: 'line-info' }], { valueSuffix: ' B', xLabel: 'Sample bucket', yLabel: 'Response size (bytes)' }),
    legend: reportLegend(['Average bytes'])
  };
}

function reportLatencySamplesGraph(data) {
  if (!data.samples.length) {
    return reportEmptyGraph('Latency samples', 'No request samples were captured.');
  }
  return {
    title: 'Latency samples',
    meta: `${data.samples.length} responses`,
    svg: reportScatterSvg(data.samples.map((sample, index) => ({
      x: index + 1,
      y: Number(sample.durationMillis || 0),
      danger: reportSampleFailed(sample)
    })), { xLabel: 'Time', yLabel: 'Latency ms' })
  };
}

function performanceReportTimingChunks(samples = [], maxChunks = 36) {
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
      timeToFirstByteMillis: averageReportNumber(items.map((item) => Number(item.timings?.timeToFirstByteMillis)).filter((value) => Number.isFinite(value) && value > 0)),
      tlsHandshakeMillis: averageReportNumber(items.map((item) => Number(item.timings?.tlsHandshakeMillis)).filter((value) => Number.isFinite(value) && value > 0)),
      downloadMillis: averageReportNumber(items.map((item) => Number(item.timings?.downloadMillis)).filter((value) => Number.isFinite(value) && value > 0))
    });
  }
  return chunks;
}

function reportCodeTimelineData(samples = [], statusCounts = {}) {
  const sampleCounts = {};
  const timedSamples = samples.map((sample, index) => {
    const status = graphStatusLabel(sample);
    if (status && status !== '-') {
      sampleCounts[status] = (sampleCounts[status] || 0) + 1;
    }
    return {
      index,
      status,
      timestampMillis: graphSampleTimestampMillis(sample, index)
    };
  }).filter((item) => item.status && item.status !== '-' && Number.isFinite(item.timestampMillis));
  if (!timedSamples.length) {
    return { points: [], series: [], bucketMillis: 0 };
  }
  timedSamples.sort((left, right) => left.timestampMillis - right.timestampMillis || left.index - right.index);
  const startMillis = Math.min(...timedSamples.map((item) => item.timestampMillis));
  const endMillis = Math.max(...timedSamples.map((item) => item.timestampMillis));
  const spanMillis = Math.max(0, endMillis - startMillis);
  const bucketMillis = reportBucketMillis(spanMillis, 160);
  const statuses = Array.from(new Set([
    ...Object.keys(statusCounts || {}).map(normalizeGraphStatusLabel).filter(Boolean),
    ...timedSamples.map((item) => item.status)
  ])).sort(reportStatusSort);
  const series = statuses.map((status, index) => ({
    key: `code_${slugifyId(status)}`,
    status,
    label: `${status} (${formatInteger(statusCounts?.[status] || sampleCounts[status] || 0)})`,
    className: reportStatusLineClass(status, index)
  }));
  const keyByStatus = new Map(series.map((item) => [item.status, item.key]));
  const pointByBucket = new Map();
  for (const item of timedSamples) {
    const elapsedMillis = Math.max(0, item.timestampMillis - startMillis);
    const bucketIndex = bucketMillis > 0 ? Math.floor(elapsedMillis / bucketMillis) : 0;
    if (!pointByBucket.has(bucketIndex)) {
      const bucketElapsedMillis = bucketIndex * Math.max(1, bucketMillis);
      const point = {
        label: formatReportElapsedLabel(bucketElapsedMillis)
      };
      for (const seriesItem of series) {
        point[seriesItem.key] = null;
      }
      pointByBucket.set(bucketIndex, point);
    }
    const point = pointByBucket.get(bucketIndex);
    const key = keyByStatus.get(item.status);
    if (key) {
      point[key] = reportStatusGraphValue(item.status);
    }
  }
  const points = Array.from(pointByBucket.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, point]) => point);
  return { points, series, bucketMillis };
}

function reportStatusGraphValue(status) {
  if (String(status).toUpperCase() === 'ERR') {
    return 0;
  }
  const code = Number(status);
  return Number.isFinite(code) ? code : 0;
}

function reportBucketMillis(spanMillis, maxBuckets = 160) {
  const candidates = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
  return candidates.find((candidate) => Math.max(1, Math.floor(spanMillis / candidate) + 1) <= maxBuckets) || candidates.at(-1);
}

function reportStatusSort(left, right) {
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

function reportStatusLineClass(status, index = 0) {
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
  return ['line-info', 'line-warning', 'line-success', 'line-danger', 'line-purple', 'line-teal'][index % 6];
}

function formatReportElapsedLabel(milliseconds) {
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

function formatReportGranularity(milliseconds) {
  const seconds = Math.max(1, Math.round(Number(milliseconds || 1000) / 1000));
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  return `${formatDecimal(seconds / 60)} min`;
}

function reportEmptyGraph(title, empty) {
  return { title, empty };
}

function reportLegend(labels) {
  const classes = ['legend-info', 'legend-warning', 'legend-pass', 'legend-fail'];
  return labels.map((item, index) => {
    if (item && typeof item === 'object') {
      return { label: item.label || item.key || `Series ${index + 1}`, className: reportLegendClass(item.className, index) };
    }
    return { label: item, className: classes[index] || 'legend-info' };
  });
}

function reportLegendClass(className, index = 0) {
  const mapped = {
    'line-info': 'legend-info',
    'line-warning': 'legend-warning',
    'line-danger': 'legend-fail',
    'line-success': 'legend-pass',
    'line-code-200': 'legend-code-200',
    'line-purple': 'legend-purple',
    'line-teal': 'legend-teal',
    'line-muted': 'legend-muted'
  };
  return mapped[className] || ['legend-info', 'legend-warning', 'legend-pass', 'legend-fail'][index % 4];
}

function reportLineSvg(points = [], series = [], options = {}) {
  const width = 900;
  const height = 380;
  const padding = { top: 28, right: 34, bottom: 62, left: 76 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = [];
  for (const point of points) {
    for (const line of series) {
      const value = reportLineValue(point, line);
      if (value != null) {
        values.push(value);
      }
    }
  }
  const finiteValues = values.filter(Number.isFinite);
  const min = options.minValue == null ? 0 : Math.min(Number(options.minValue) || 0, ...finiteValues);
  const rawMax = Math.max(min + 1, Number(options.fixedMax || 0), ...finiteValues);
  const max = Number(options.fixedMax || 0) > 0 ? rawMax : reportNiceMax(rawMax);
  const span = Math.max(1, max - min);
  const xFor = (index) => padding.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const yFor = (value) => padding.top + innerHeight - (((Number(value || 0) - min) / span) * innerHeight);
  const lines = reportLineGridElements(points, { width, height, padding, min, max, xFor, yFor, valueSuffix: options.valueSuffix || '' });
  for (const line of series) {
    const plotted = points.map((point, index) => ({
      x: xFor(index),
      y: reportLineValue(point, line) == null ? null : yFor(reportLineValue(point, line)),
      value: reportLineValue(point, line),
      label: point.label || String(index + 1)
    }));
    for (const segment of reportLineSegments(plotted)) {
      if (segment.length <= 1) {
        continue;
      }
      lines.push(`<polyline points="${segment.map((point) => `${formatSvgNumber(point.x)},${formatSvgNumber(point.y)}`).join(' ')}" class="report-svg-line ${escapeHtml(line.className || 'line-info')}"></polyline>`);
    }
    if (options.showPoints === true || plotted.length <= 120) {
      for (const point of plotted.filter((item) => item.value != null)) {
        lines.push(`<circle cx="${formatSvgNumber(point.x)}" cy="${formatSvgNumber(point.y)}" r="3.5" class="report-svg-line-point ${escapeHtml(line.className || 'line-info')}"><title>${escapeHtml(`${line.label || line.key} at ${point.label}: ${reportGraphValueLabel(point.value, options.valueSuffix || '')}`)}</title></circle>`);
      }
    }
  }
  lines.push(reportAxisTitleElements(width, height, padding, options.xLabel || '', options.yLabel || ''));
  return `<svg class="report-line-chart" viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="none">${lines.join('')}</svg>`;
}

function reportLineGridElements(points, options) {
  const { width, height, padding, min, max, xFor, yFor, valueSuffix } = options;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const elements = [
    `<rect x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" class="report-svg-plot"></rect>`
  ];
  const horizontalTicks = 5;
  for (let index = 0; index <= horizontalTicks; index += 1) {
    const value = min + ((max - min) * (index / horizontalTicks));
    const y = yFor(value);
    elements.push(`<line x1="${padding.left}" y1="${formatSvgNumber(y)}" x2="${width - padding.right}" y2="${formatSvgNumber(y)}" class="report-svg-grid-line"></line>`);
    elements.push(`<text x="${padding.left - 10}" y="${formatSvgNumber(y + 4)}" text-anchor="end" class="report-svg-label">${escapeHtml(reportGraphValueLabel(value, valueSuffix))}</text>`);
  }
  for (const index of reportTickIndexes(points.length, 8)) {
    const x = xFor(index);
    elements.push(`<line x1="${formatSvgNumber(x)}" y1="${padding.top}" x2="${formatSvgNumber(x)}" y2="${padding.top + innerHeight}" class="report-svg-grid-line"></line>`);
    elements.push(`<text x="${formatSvgNumber(x)}" y="${height - padding.bottom + 22}" text-anchor="middle" class="report-svg-label">${escapeHtml(points[index]?.label || String(index + 1))}</text>`);
  }
  elements.push(`<line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" class="report-svg-axis"></line>`);
  elements.push(`<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}" class="report-svg-axis"></line>`);
  return elements;
}

function reportLineValue(point = {}, line = {}) {
  const raw = point[line.key];
  if (raw == null || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function reportLineSegments(points = []) {
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

function reportScatterSvg(points = [], options = {}) {
  const width = 900;
  const height = 380;
  const padding = { top: 28, right: 34, bottom: 62, left: 76 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxX = reportNiceMax(Math.max(1, ...points.map((point) => Number(point.x || 0))));
  const maxY = reportNiceMax(Math.max(1, ...points.map((point) => Number(point.y || 0))));
  const xFor = (value) => padding.left + (Number(value || 0) / maxX) * innerWidth;
  const yFor = (value) => padding.top + innerHeight - ((Number(value || 0) / maxY) * innerHeight);
  const elements = reportScatterGridElements({ width, height, padding, maxX, maxY, xFor, yFor });
  const linePoints = options.sortByX === true
    ? points.slice().sort((left, right) => Number(left.x || 0) - Number(right.x || 0))
    : points;
  if (options.connectLine === true && linePoints.length > 1) {
    elements.push(`<polyline points="${linePoints.map((point) => `${formatSvgNumber(xFor(point.x))},${formatSvgNumber(yFor(point.y))}`).join(' ')}" class="report-svg-line ${escapeHtml(options.lineClassName || 'line-info')}"></polyline>`);
  }
  for (const point of points) {
    elements.push(`<circle cx="${formatSvgNumber(xFor(point.x))}" cy="${formatSvgNumber(yFor(point.y))}" r="5" class="report-svg-point ${point.danger ? 'is-danger' : 'is-info'}"><title>${escapeHtml(point.label || 'Sample')}: ${escapeHtml(reportGraphValueLabel(point.y, ''))}</title></circle>`);
  }
  elements.push(reportAxisTitleElements(width, height, padding, options.xLabel || '', options.yLabel || ''));
  return `<svg class="report-scatter-chart" viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="none">${elements.join('')}</svg>`;
}

function reportScatterGridElements(options) {
  const { width, height, padding, maxX, maxY, xFor, yFor } = options;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const elements = [
    `<rect x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" class="report-svg-plot"></rect>`
  ];
  const ticks = 5;
  for (let index = 0; index <= ticks; index += 1) {
    const yValue = maxY * (index / ticks);
    const y = yFor(yValue);
    elements.push(`<line x1="${padding.left}" y1="${formatSvgNumber(y)}" x2="${width - padding.right}" y2="${formatSvgNumber(y)}" class="report-svg-grid-line"></line>`);
    elements.push(`<text x="${padding.left - 10}" y="${formatSvgNumber(y + 4)}" text-anchor="end" class="report-svg-label">${escapeHtml(reportGraphValueLabel(yValue, ''))}</text>`);
    const xValue = maxX * (index / ticks);
    const x = xFor(xValue);
    elements.push(`<line x1="${formatSvgNumber(x)}" y1="${padding.top}" x2="${formatSvgNumber(x)}" y2="${padding.top + innerHeight}" class="report-svg-grid-line"></line>`);
    elements.push(`<text x="${formatSvgNumber(x)}" y="${height - padding.bottom + 22}" text-anchor="middle" class="report-svg-label">${escapeHtml(reportGraphValueLabel(xValue, ''))}</text>`);
  }
  elements.push(`<line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" class="report-svg-axis"></line>`);
  elements.push(`<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}" class="report-svg-axis"></line>`);
  return elements;
}

function reportAxisTitleElements(width, height, padding, xLabel = '', yLabel = '') {
  const elements = [];
  if (xLabel) {
    elements.push(`<text x="${formatSvgNumber(padding.left + ((width - padding.left - padding.right) / 2))}" y="${height - 12}" text-anchor="middle" class="report-svg-axis-title">${escapeHtml(xLabel)}</text>`);
  }
  if (yLabel) {
    const y = padding.top + ((height - padding.top - padding.bottom) / 2);
    elements.push(`<text x="18" y="${formatSvgNumber(y)}" transform="rotate(-90 18 ${formatSvgNumber(y)})" text-anchor="middle" class="report-svg-axis-title">${escapeHtml(yLabel)}</text>`);
  }
  return elements.join('');
}

function reportTickIndexes(length, maxTicks) {
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

function reportNiceMax(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 1;
  }
  const exponent = 10 ** Math.floor(Math.log10(number));
  const fraction = number / exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * exponent;
}

function reportGraphValueLabel(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return `0${suffix}`;
  }
  const formatted = Math.abs(number) >= 100 ? String(Math.round(number)) : formatDecimal(number);
  return `${formatted}${suffix}`;
}

function averageReportNumber(values = []) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) {
    return 0;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function percentileReportNumber(values = [], rank = 0.5) {
  const numbers = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!numbers.length) {
    return 0;
  }
  const index = Math.min(numbers.length - 1, Math.max(0, Math.ceil(numbers.length * rank) - 1));
  return numbers[index];
}

function formatSvgNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0';
}

async function writePerformanceSummarySection(output, section) {
  await writeLine(output, `<section id="${escapeHtml(section.id)}" class="report-section">`);
  await writeLine(output, '<div class="section-heading">');
  await writeLine(output, `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>`);
  await writeLine(output, `<h2>${escapeHtml(section.title)}</h2>`);
  await writeLine(output, `<p>${escapeHtml(section.description)}</p>`);
  await writeLine(output, '</div>');
  if (section.metrics.length) {
    await writeLine(output, '<div class="metric-grid diagnosis-metric-grid">');
    for (const [label, value] of section.metrics) {
      await writeLine(output, '<article class="metric-card">');
      await writeLine(output, `<span>${escapeHtml(label)}</span>`);
      await writeLine(output, `<strong>${escapeHtml(value)}</strong>`);
      await writeLine(output, '</article>');
    }
    await writeLine(output, '</div>');
  }
  if (section.infoRows.length) {
    await writeLine(output, '<div class="info-grid diagnosis-info-grid">');
    for (const [label, value] of section.infoRows) {
      await writeInfoRow(output, label, value);
    }
    await writeLine(output, '</div>');
  }
  if (section.phases.length) {
    await writeLine(output, '<div class="diagnosis-table-frame">');
    await writeLine(output, '<table class="diagnosis-table">');
    await writeLine(output, '<thead><tr><th>Phase</th><th>Requests</th><th>Concurrency</th><th>Successful</th><th>Failed</th><th>Average</th><th>p95</th><th>Requests/sec</th></tr></thead>');
    await writeLine(output, '<tbody>');
    for (const phase of section.phases) {
      await writeLine(output, '<tr>');
      await writeLine(output, `<td><strong>${escapeHtml(phase.phase || phase.name || 'phase')}</strong></td>`);
      await writeLine(output, `<td>${escapeHtml(formatInteger(phase.requests))}</td>`);
      await writeLine(output, `<td>${escapeHtml(formatInteger(phase.concurrency))}</td>`);
      await writeLine(output, `<td>${escapeHtml(formatInteger(phase.successfulResponses))}</td>`);
      await writeLine(output, `<td>${escapeHtml(formatInteger(phase.failedResponses))}</td>`);
      await writeLine(output, `<td>${escapeHtml(formatDuration(phase.averageDurationMillis))}</td>`);
      await writeLine(output, `<td>${escapeHtml(formatDuration(phase.p95DurationMillis))}</td>`);
      await writeLine(output, `<td>${escapeHtml(formatDecimal(phase.requestsPerSecond))}</td>`);
      await writeLine(output, '</tr>');
    }
    await writeLine(output, '</tbody>');
    await writeLine(output, '</table>');
    await writeLine(output, '</div>');
  }
  await writeLine(output, '</section>');
}

async function writePerformanceChecksSection(output, section) {
  await writeLine(output, `<section id="${escapeHtml(section.checksId)}" class="report-section">`);
  await writeLine(output, '<div class="section-heading">');
  await writeLine(output, `<p class="eyebrow">${escapeHtml(section.checksEyebrow)}</p>`);
  await writeLine(output, `<h2>${escapeHtml(section.checksTitle)}</h2>`);
  await writeLine(output, `<p>${escapeHtml(section.checksDescription)}</p>`);
  await writeLine(output, '</div>');
  await writeLine(output, '<div class="diagnostic-check-list">');
  for (const check of section.checks) {
    const status = String(check.status || 'not_available');
    await writeLine(output, `<article class="diagnostic-check ${diagnosticStatusClass(status)}">`);
    await writeLine(output, '<div>');
    await writeLine(output, `<span>${escapeHtml(check.group || section.checkGroupFallback)}</span>`);
    await writeLine(output, `<strong>${escapeHtml(check.label || check.id || 'Diagnostic check')}</strong>`);
    if (check.details) {
      await writeLine(output, `<p>${escapeHtml(check.details)}</p>`);
    }
    await writeLine(output, '</div>');
    await writeLine(output, `<div class="diagnostic-check-result"><span class="status-badge ${diagnosticStatusClass(status)}">${escapeHtml(status)}</span><strong>${escapeHtml(check.value == null || check.value === '' ? '-' : String(check.value))}</strong></div>`);
    await writeLine(output, '</article>');
  }
  await writeLine(output, '</div>');
  await writeLine(output, '</section>');
}

function overviewRows(kind, result, metadata) {
  const rows = [
    ['Type', kind === 'performance' ? result.type || 'performance' : 'runner'],
    ['Started', formatDate(result.startedAt || metadata.startedAt)],
    ['Completed', formatDate(result.completedAt || metadata.completedAt)]
  ];
  if (kind === 'performance') {
    rows.splice(1, 0, ['Performance test', result.performanceTestName || result.performanceTestId || '']);
  } else {
    rows.splice(1, 0, ['Runner / collection', result.collectionName || result.name || result.collectionId || '']);
  }
  if (result.detailCaptureTruncated === true) {
    rows.push(['Detail capture warning', result.detailCaptureTruncationReason || 'Result detail capture was truncated.']);
  }
  return rows;
}

function performanceReportSections(kind, result = {}) {
  if (kind !== 'performance') {
    return [];
  }
  const summary = result.summary || {};
  const sections = [];
  if (summary.diagnosis && typeof summary.diagnosis === 'object') {
    sections.push(endpointDiagnosisSection(summary.diagnosis));
  }
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'diagnosis' || !value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    if (Array.isArray(value.checks) || Array.isArray(value.phases)) {
      sections.push(genericPerformanceBundleSection(key, value));
    }
  }
  return sections.filter((section) => section.metrics.length || section.infoRows.length || section.phases.length || section.checks.length);
}

function endpointDiagnosisSection(diagnosis = {}) {
  return {
    id: 'endpoint-diagnosis',
    title: 'Endpoint Diagnosis',
    eyebrow: 'Performance Intelligence',
    description: 'Endpoint-level findings from the diagnostic run, including confidence, throughput estimates, saturation, and observed target URLs.',
    checksId: 'diagnostic-checks',
    checksTitle: 'Diagnostic Checks',
    checksEyebrow: 'Diagnostic Matrix',
    checksDescription: 'Every endpoint diagnostic check captured for this run, grouped by area with pass, warning, failure, or unavailable status.',
    checkGroupFallback: 'Diagnostics',
    metrics: compactRows([
      ['Confidence', diagnosis.confidenceScore != null ? `${titleCaseWords(diagnosis.confidence || 'unknown')} (${formatInteger(diagnosis.confidenceScore)} / 100)` : titleCaseWords(diagnosis.confidence || '')],
      ['Checks', diagnosis.completedChecks != null || diagnosis.requestedChecks != null ? `${formatInteger(diagnosis.completedChecks || 0)} / ${formatInteger(diagnosis.requestedChecks || 0)}` : ''],
      ['Best observed RPS', formatDecimal(diagnosis.bestObservedRequestsPerSecond)],
      ['Stable RPS', formatDecimal(diagnosis.stableRequestsPerSecond)],
      ['Saturation point', diagnosis.saturationPoint],
      ['Success rate', formatRatioPercent(diagnosis.successRate)]
    ]),
    infoRows: compactRows([
      ['Target URL', diagnosis.targetUrl],
      ['Final URL', diagnosis.finalUrl],
      ['p95 latency', formatDuration(diagnosis.p95DurationMillis)],
      ['Event loop delay', formatDuration(diagnosis.eventLoopDelayMillis)],
      ['Memory delta', formatBytes(diagnosis.memoryDeltaBytes)]
    ]),
    phases: Array.isArray(diagnosis.phases) ? diagnosis.phases : [],
    checks: Array.isArray(diagnosis.checks) ? diagnosis.checks : []
  };
}

function genericPerformanceBundleSection(key, bundle = {}) {
  const title = titleCaseWords(key);
  return {
    id: slugifyId(key),
    title,
    eyebrow: 'Performance Data',
    description: `${title} data captured for this performance run.`,
    checksId: `${slugifyId(key)}-checks`,
    checksTitle: `${title} Checks`,
    checksEyebrow: 'Performance Matrix',
    checksDescription: `Checks captured for ${title}.`,
    checkGroupFallback: title,
    metrics: compactRows([
      ['Confidence', bundle.confidenceScore != null ? `${titleCaseWords(bundle.confidence || 'unknown')} (${formatInteger(bundle.confidenceScore)} / 100)` : titleCaseWords(bundle.confidence || '')],
      ['Checks', bundle.completedChecks != null || bundle.requestedChecks != null ? `${formatInteger(bundle.completedChecks || 0)} / ${formatInteger(bundle.requestedChecks || 0)}` : '']
    ]),
    infoRows: [],
    phases: Array.isArray(bundle.phases) ? bundle.phases : [],
    checks: Array.isArray(bundle.checks) ? bundle.checks : []
  };
}

function compactRows(rows) {
  return rows.filter(([, value]) => value != null && value !== '');
}

function statusFilterOptions(statusCounts) {
  return Object.keys(statusCounts || {})
    .filter((status) => status != null && status !== '')
    .sort((left, right) => statusEntrySort([left], [right]));
}

function diagnosticStatusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'pass' || normalized === 'passed') {
    return 'status-success';
  }
  if (normalized === 'warn' || normalized === 'warning') {
    return 'status-warning';
  }
  if (normalized === 'fail' || normalized === 'failed' || normalized === 'error') {
    return 'status-danger';
  }
  return 'status-muted';
}

function formatRatioPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '';
  }
  return `${formatDecimal(number * 100)}%`;
}

function slugifyId(value) {
  return String(value || 'performance-data')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'performance-data';
}

function titleCaseWords(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeReportOptions(options = {}) {
  const includeRequestResults = options.includeRequestResults !== false;
  return {
    theme: normalizeReportTheme(options.theme),
    includeRequestResults,
    includeRequestDetails: includeRequestResults && options.includeRequestDetails !== false
  };
}

function normalizeReportTheme(theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

function itemDetailRows(item) {
  return [
    ['Request ID', item.requestId],
    ['Method', item.requestMethod],
    ['Request URL', item.requestUrl],
    ['Final URL', item.finalUrl],
    ['Folder', item.folderName],
    ['Iteration', item.iteration ?? item.runnerIteration],
    ['Runner iteration', item.runnerIterations ? `${item.runnerIteration || 1} / ${item.runnerIterations}` : ''],
    ['Phase', item.phase],
    ['Stage', item.stageName],
    ['Concurrency', item.stageConcurrency],
    ['Started', formatDate(item.startedAt)],
    ['Duration', formatDuration(item.durationMillis)],
    ['Scheduler lag', formatDuration(item.schedulerLagMillis)],
    ['Response bytes', formatBytes(item.responseBytes)],
    ['Body SHA-256', item.bodySha256]
  ];
}

function reportTitle(kind, result, metadata) {
  if (kind === 'performance') {
    return result.performanceTestName || metadata.runMetadata?.name || result.performanceTestId || 'Performance report';
  }
  return result.collectionName || result.name || metadata.runMetadata?.name || result.collectionId || 'Runner report';
}

function itemSourceFactory(kind, result, items) {
  if (typeof items === 'function') {
    return items;
  }
  const source = Array.isArray(items)
    ? items
    : kind === 'performance'
      ? result.samples || []
      : result.results || [];
  return async function* itemSource() {
    for (const item of source) {
      yield item;
    }
  };
}

function statusCountsForReport(result) {
  const counts = {};
  let hasAggregateCounts = false;
  for (const source of [result.resultPage?.statusCounts, result.summary?.statusCodes]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      continue;
    }
    let sourceHasCounts = false;
    for (const [status, count] of Object.entries(source)) {
      const normalizedStatus = normalizeGraphStatusLabel(status);
      if (!normalizedStatus || normalizedStatus === '-') {
        continue;
      }
      const numericCount = Number(count || 0);
      if (!Number.isFinite(numericCount) || numericCount <= 0) {
        continue;
      }
      hasAggregateCounts = true;
      sourceHasCounts = true;
      counts[normalizedStatus] = (counts[normalizedStatus] || 0) + numericCount;
    }
    if (sourceHasCounts) {
      break;
    }
  }
  const items = Array.isArray(result.samples) ? result.samples : Array.isArray(result.results) ? result.results : [];
  for (const item of items) {
    const status = statusLabel(item);
    if (!hasAggregateCounts || !counts[status]) {
      counts[status] = (counts[status] || 0) + 1;
    }
  }
  return counts;
}

function passFailCounts(kind, result, statusCounts) {
  const total = Number(result.completedRequests ?? result.totalRequests ?? statusTotal(statusCounts) ?? 0);
  if (kind === 'performance') {
    const samples = performanceReportSamples(result);
    if (samples.length && (!total || samples.length >= total)) {
      const failed = samples.filter(reportSampleFailed).length;
      const effectiveTotal = total || samples.length;
      return {
        total: effectiveTotal,
        passed: Math.max(0, effectiveTotal - failed),
        failed
      };
    }
    const countedTotal = statusTotal(statusCounts);
    if (countedTotal > 0 && (!total || countedTotal >= total)) {
      const passed = successCount(statusCounts, {
        includeUnsupportedMethodProbeStatuses: String(result.type || '') === 'diagnosis'
      });
      const effectiveTotal = total || countedTotal;
      return {
        total: effectiveTotal,
        passed,
        failed: Math.max(0, effectiveTotal - passed)
      };
    }
    if (String(result.type || '') === 'diagnosis' && (result.successfulRequests != null || result.failedRequests != null)) {
      const passed = Math.max(0, Number(result.successfulRequests || 0));
      const failed = Math.max(0, Number(result.failedRequests || 0));
      return {
        total: total || passed + failed,
        passed,
        failed
      };
    }
  }
  const passed = Number(
    kind === 'performance'
      ? result.successfulRequests ?? successCount(statusCounts)
      : result.passedRequests ?? successCount(statusCounts)
  ) || 0;
  const failed = Number(result.failedRequests ?? Math.max(0, total - passed)) || 0;
  return { total, passed, failed };
}

function successCount(statusCounts, options = {}) {
  return Object.entries(statusCounts || {}).reduce((total, [status, count]) => {
    const code = Number(status);
    return (code >= 200 && code < 400)
      || (options.includeUnsupportedMethodProbeStatuses === true && (code === 405 || code === 501))
      ? total + Number(count || 0)
      : total;
  }, 0);
}

function statusTotal(statusCounts) {
  return Object.values(statusCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
}

function statusLabel(item = {}) {
  const statusCode = Number(item.statusCode);
  if (Number.isFinite(statusCode)) {
    return statusCode > 0 ? String(statusCode) : 'ERR';
  }
  return item.error ? 'ERR' : item.passed === true ? 'PASS' : 'ERR';
}

function statusClass(status) {
  const code = Number(status);
  if (code >= 200 && code < 300) {
    return 'status-success';
  }
  if (code >= 300 && code < 400) {
    return 'status-info';
  }
  if (code >= 400 && code < 500) {
    return 'status-warning';
  }
  if (code >= 500 || String(status).toUpperCase() === 'ERR') {
    return 'status-danger';
  }
  return 'status-muted';
}

function statusEntrySort(left, right) {
  const leftNumber = Number(left[0]);
  const rightNumber = Number(right[0]);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left[0]).localeCompare(String(right[0]));
}

function formatBody(value) {
  const text = String(value ?? '');
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function formatDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return value === 0 ? '0 ms' : '';
  }
  if (number >= 1000) {
    return `${formatDecimal(number / 1000)} s`;
  }
  return `${formatDecimal(number)} ms`;
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return value === 0 ? '0 B' : '';
  }
  if (number >= 1024 * 1024) {
    return `${formatDecimal(number / (1024 * 1024))} MB`;
  }
  if (number >= 1024) {
    return `${formatDecimal(number / 1024)} KB`;
  }
  return `${formatInteger(number)} B`;
}

function formatInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('en-US') : '';
}

function formatDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '';
  }
  return number.toLocaleString('en-US', {
    maximumFractionDigits: number >= 100 ? 0 : 2
  });
}

function formatPercent(value, total) {
  const denominator = Number(total);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return '0%';
  }
  return `${Math.round((Number(value || 0) / denominator) * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeKind(kind) {
  return kind === 'performance' ? 'performance' : 'runner';
}

async function writeLine(output, line = '') {
  await writeText(output, `${line}\n`);
}

async function writeText(output, text) {
  if (output.write(text) === false) {
    await once(output, 'drain');
  }
}

function reportScripts(options = {}) {
  const includeRequestResults = options.includeRequestResults !== false;
  const includeRequestDetails = includeRequestResults && options.includeRequestDetails !== false;
  const includeChartTabs = options.includeChartTabs === true;
  return `
(function () {
  'use strict';

  var reportWindow = typeof window !== 'undefined' ? window : null;
  var reportNav = document.querySelector ? document.querySelector('.report-nav') : null;
  var reduceMotion = reportWindow && reportWindow.matchMedia && reportWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reportNavOffset() {
    return (reportNav ? Math.ceil(reportNav.getBoundingClientRect().height) : 0) + 18;
  }

  function scrollToReportSection(target, options) {
    if (!target) {
      return;
    }
    if (!reportWindow || typeof reportWindow.scrollTo !== 'function') {
      return;
    }
    var top = target.getBoundingClientRect().top + reportWindow.pageYOffset - reportNavOffset();
    reportWindow.scrollTo({
      top: Math.max(0, top),
      behavior: options && options.smooth && !reduceMotion ? 'smooth' : 'auto'
    });
  }

  if (reportNav) {
    Array.prototype.forEach.call(reportNav.querySelectorAll('a[href^="#"]'), function (link) {
      link.addEventListener('click', function (event) {
        var id = decodeURIComponent(link.getAttribute('href').slice(1));
        var target = document.getElementById(id);
        if (!target) {
          return;
        }
        event.preventDefault();
        if (reportWindow.history && reportWindow.history.pushState) {
          reportWindow.history.pushState(null, '', '#' + encodeURIComponent(id));
        } else {
          reportWindow.location.hash = id;
        }
        scrollToReportSection(target, { smooth: true });
      });
    });

    if (reportWindow && reportWindow.location && reportWindow.location.hash) {
      var initialTarget = document.getElementById(decodeURIComponent(reportWindow.location.hash.slice(1)));
      if (initialTarget) {
        var scheduleScroll = reportWindow.requestAnimationFrame
          ? reportWindow.requestAnimationFrame.bind(reportWindow)
          : reportWindow.setTimeout.bind(reportWindow);
        scheduleScroll(function () {
          scrollToReportSection(initialTarget, { smooth: false });
        });
      }
    }
  }

${includeChartTabs ? `
  var chartGroups = Array.prototype.slice.call(document.querySelectorAll('[data-report-chart-group]'));

  chartGroups.forEach(function (group) {
    var tabs = Array.prototype.slice.call(group.querySelectorAll('[data-report-chart-tab]'));
    var panels = Array.prototype.slice.call(group.querySelectorAll('[data-report-chart-panel]'));
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var key = tab.getAttribute('data-report-chart-tab');
        tabs.forEach(function (item) {
          var selected = item === tab;
          item.classList.toggle('is-active', selected);
          item.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        panels.forEach(function (panel) {
          panel.hidden = panel.getAttribute('data-report-chart-panel') !== key;
        });
      });
    });
  });
` : ''}

${includeRequestResults ? `
  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-result-row]'));
  var pageSizeSelect = document.getElementById('resultPageSizeSelect');
  var statusFilterSelect = document.getElementById('resultStatusFilterSelect');
  var previousButton = document.getElementById('resultPrevPageButton');
  var nextButton = document.getElementById('resultNextPageButton');
  var pageLabel = document.getElementById('resultPageLabel');
  var rangeLabel = document.getElementById('resultRangeLabel');
  var filterEmptyRow = document.getElementById('resultFilterEmptyRow');
  var pageSize = pageSizeSelect ? Number(pageSizeSelect.value) || 25 : 25;
  var page = 0;

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function renderResultsPage() {
    var selectedStatus = statusFilterSelect ? statusFilterSelect.value : 'all';
    var filteredRows = rows.filter(function (row) {
      return selectedStatus === 'all' || row.getAttribute('data-result-status') === selectedStatus;
    });
    var total = filteredRows.length;
    var pageCount = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(Math.max(0, page), pageCount - 1);
    var start = page * pageSize;
    var end = Math.min(total, start + pageSize);

    rows.forEach(function (row) {
      row.hidden = true;
    });
    filteredRows.forEach(function (row, index) {
      row.hidden = index < start || index >= end;
    });
    if (filterEmptyRow) {
      filterEmptyRow.hidden = rows.length === 0 || total !== 0;
    }

    if (pageSizeSelect) {
      pageSizeSelect.disabled = total === 0;
    }
    if (statusFilterSelect) {
      statusFilterSelect.disabled = rows.length === 0;
    }
    if (previousButton) {
      previousButton.disabled = total === 0 || page === 0;
    }
    if (nextButton) {
      nextButton.disabled = total === 0 || page >= pageCount - 1;
    }

    setText(pageLabel, total === 0 ? 'Page 0 of 0' : 'Page ' + (page + 1) + ' of ' + pageCount);
    setText(rangeLabel, total === 0 ? '0 results' : (start + 1) + '-' + end + ' of ' + total + ' results');
  }

  function ensureStatusOptions() {
    if (!statusFilterSelect) {
      return;
    }
    var existing = {};
    Array.prototype.forEach.call(statusFilterSelect.options || [], function (option) {
      existing[option.value] = true;
    });
    var statuses = rows.map(function (row) {
      return row.getAttribute('data-result-status') || '';
    }).filter(Boolean).sort(function (left, right) {
      var leftNumber = Number(left);
      var rightNumber = Number(right);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
      }
      return left.localeCompare(right);
    });
    statuses.forEach(function (status) {
      if (existing[status]) {
        return;
      }
      var option = document.createElement('option');
      option.value = status;
      option.textContent = status;
      statusFilterSelect.appendChild(option);
      existing[status] = true;
    });
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', function () {
      pageSize = Number(pageSizeSelect.value) || 25;
      page = 0;
      renderResultsPage();
    });
  }
  if (statusFilterSelect) {
    statusFilterSelect.addEventListener('change', function () {
      page = 0;
      renderResultsPage();
    });
  }
  if (previousButton) {
    previousButton.addEventListener('click', function () {
      page -= 1;
      renderResultsPage();
    });
  }
  if (nextButton) {
    nextButton.addEventListener('click', function () {
      page += 1;
      renderResultsPage();
    });
  }

${includeRequestDetails ? `
  var modal = document.getElementById('responseDetailModal');
  var modalContent = document.getElementById('responseDetailModalContent');
  var closeButton = document.getElementById('responseDetailCloseButton');
  var lastFocused = null;

  function openResponseDetails(templateId) {
    var template = document.getElementById(templateId);
    if (!modal || !modalContent || !template || !template.content) {
      return;
    }
    lastFocused = document.activeElement;
    modalContent.replaceChildren(template.content.cloneNode(true));
    modal.hidden = false;
    document.body.classList.add('modal-open');
    if (closeButton) {
      closeButton.focus();
    }
  }

  function closeResponseDetails() {
    if (!modal || modal.hidden) {
      return;
    }
    modal.hidden = true;
    if (modalContent) {
      modalContent.replaceChildren();
    }
    document.body.classList.remove('modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return;
    }
    var detailButton = target.closest('[data-detail-template]');
    if (detailButton) {
      openResponseDetails(detailButton.getAttribute('data-detail-template'));
      return;
    }
    if (target.closest('[data-modal-close]')) {
      closeResponseDetails();
    }
  });

  if (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        closeResponseDetails();
      }
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeResponseDetails();
    }
  });
` : ''}
  ensureStatusOptions();
  renderResultsPage();
` : ''}
}());
`;
}

function reportStyles() {
  return `
:root {
  color-scheme: light;
  --bg: #f4f7fb;
  --surface: #ffffff;
  --surface-soft: #f8fafc;
  --ink: #162033;
  --muted: #607089;
  --line: #d9e2ef;
  --line-strong: #b8c7d9;
  --blue: #2364d2;
  --blue-soft: #e7f0ff;
  --green: #168263;
  --green-soft: #dcf8ee;
  --red: #be3b45;
  --red-soft: #fde8ea;
  --amber: #b26a00;
  --amber-soft: #fff1d6;
  --purple: #7655bd;
  --graph-plot: #ffffff;
  --graph-grid: #d9e2ef;
  --graph-axis: #9fb0c4;
  --graph-label: #607089;
  --graph-title: #162033;
  --graph-marker-stroke: #ffffff;
  --highlight-text: #000000;
  --selection-bg: #b9d7ff;
  --hero-chip-bg: rgba(255, 255, 255, 0.78);
  --nav-bg: rgba(255, 255, 255, 0.92);
  --section-shadow: 0 10px 30px rgba(27, 39, 64, 0.06);
  --bar-track: #e8eef6;
  --status-muted-bg: #eef2f7;
  --pre-bg: #f6f9fd;
  --pre-text: #10233f;
  --modal-backdrop: rgba(22, 32, 51, 0.52);
  --modal-shadow: 0 24px 80px rgba(15, 23, 42, 0.34);
  --shadow: 0 18px 45px rgba(27, 39, 64, 0.12);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #101112;
  --surface: #181a1c;
  --surface-soft: #222426;
  --ink: #f3f1ec;
  --muted: #adb4bc;
  --line: #34383c;
  --line-strong: #4a5056;
  --blue: #78b7ff;
  --blue-soft: #16304f;
  --green: #66d08a;
  --green-soft: #163823;
  --red: #ff7b72;
  --red-soft: #3d1f1d;
  --amber: #f4b740;
  --amber-soft: #3a2b12;
  --purple: #c49cff;
  --graph-plot: #050607;
  --graph-grid: #30363d;
  --graph-axis: #59616a;
  --graph-label: #aab6c6;
  --graph-title: #e3e8ef;
  --graph-marker-stroke: #050607;
  --highlight-text: #ffffff;
  --selection-bg: #0f4fa8;
  --hero-chip-bg: rgba(34, 36, 38, 0.88);
  --nav-bg: rgba(24, 26, 28, 0.94);
  --section-shadow: 0 10px 30px rgb(0 0 0 / 28%);
  --bar-track: #2b323a;
  --status-muted-bg: #252b32;
  --pre-bg: #0c1117;
  --pre-text: #dbe7f3;
  --modal-backdrop: rgba(4, 8, 14, 0.74);
  --modal-shadow: 0 24px 80px rgb(0 0 0 / 68%);
  --shadow: 0 18px 45px rgb(0 0 0 / 52%);
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--ink); }
::selection { background: var(--selection-bg); color: var(--highlight-text); }
body { margin: 0; font-size: 14px; line-height: 1.5; }
body.modal-open { overflow: hidden; }
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }
button, select { font: inherit; }
.report-shell { width: min(1180px, calc(100% - 40px)); margin: 28px auto 56px; }
.report-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(35, 100, 210, 0.12), rgba(22, 130, 99, 0.08)),
    var(--surface);
  box-shadow: var(--shadow);
}
.eyebrow { margin: 0 0 8px; color: var(--blue); font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
h1, h2, h3 { margin: 0; line-height: 1.15; }
h1 { font-size: clamp(30px, 4vw, 48px); letter-spacing: 0; }
h2 { font-size: 24px; }
h3 { font-size: 17px; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; color: var(--highlight-text); }
.hero-meta span, .warning-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--hero-chip-bg);
}
.warning-chip { color: var(--amber); border-color: #ebc47b; background: var(--amber-soft); }
.hero-result {
  display: grid;
  place-items: center;
  width: 142px;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 10px solid var(--red-soft);
  color: var(--red);
  background: var(--surface);
  font-weight: 800;
  text-align: center;
  box-shadow: inset 0 0 0 1px var(--line);
}
.hero-result.is-pass { border-color: var(--green); color: var(--green); }
.report-nav {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 8px;
  margin: 18px 0;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--nav-bg);
  backdrop-filter: blur(10px);
}
.report-nav a {
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--highlight-text);
  font-weight: 700;
}
.report-nav a:hover { background: var(--blue-soft); color: var(--highlight-text); text-decoration: none; }
.report-section {
  scroll-margin-top: 82px;
  margin-top: 18px;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--section-shadow);
}
.section-heading { max-width: 760px; margin-bottom: 20px; }
.section-heading p:not(.eyebrow) { margin: 8px 0 0; color: var(--muted); }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 12px; }
.metric-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
}
.metric-card span, .info-row span, .mini-metrics span { display: block; color: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; }
.metric-card strong { display: block; margin-top: 8px; font-size: 24px; }
	.info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; margin-top: 18px; }
	.info-row { padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); overflow-wrap: anywhere; }
	.info-row strong { display: block; margin-top: 4px; font-weight: 700; }
	.chart-selector {
	  display: flex;
	  flex-wrap: wrap;
	  gap: 8px;
	  margin: -4px 0 16px;
	  padding: 8px;
	  border: 1px solid var(--line);
	  border-radius: 8px;
	  background: var(--surface-soft);
	}
	.chart-selector-button {
	  appearance: none;
	  min-height: 34px;
	  padding: 7px 12px;
	  border: 1px solid var(--line);
	  border-radius: 6px;
	  background: var(--surface);
	  color: var(--muted);
	  font: inherit;
	  font-size: 12px;
	  font-weight: 800;
	  cursor: pointer;
	}
	.chart-selector-button:hover,
	.chart-selector-button.is-active {
	  border-color: var(--blue);
	  background: var(--blue-soft);
	  color: var(--highlight-text);
	}
	.report-chart-panel[hidden] { display: none; }
	.chart-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
	.chart-card {
  min-height: 230px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: linear-gradient(180deg, var(--surface), var(--surface-soft));
	}
	.chart-card-wide { grid-column: 1 / -1; }
	.graph-card { display: grid; align-content: start; gap: 10px; }
.graph-meta { margin: -2px 0 0; color: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; }
.chart-card-compact { display: grid; justify-items: center; gap: 12px; }
.report-line-chart, .report-scatter-chart {
  display: block;
  width: 100%;
  min-height: 390px;
  height: min(52vh, 470px);
}
.report-svg-plot { fill: var(--graph-plot); stroke: var(--graph-axis); stroke-width: 1; }
.report-svg-grid-line { stroke: var(--graph-grid); stroke-width: 1; opacity: 0.85; }
.report-svg-axis { stroke: var(--graph-axis); stroke-width: 1.5; }
.report-svg-label { fill: var(--graph-label); font-size: 11px; font-weight: 800; }
.report-svg-axis-title { fill: var(--graph-title); font-size: 12px; font-weight: 900; letter-spacing: 0; }
.report-svg-line { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.report-svg-line.line-info { stroke: var(--blue); }
.report-svg-line.line-warning { stroke: var(--amber); }
.report-svg-line.line-danger { stroke: var(--red); }
.report-svg-line.line-success { stroke: var(--green); }
.report-svg-line.line-code-200 { stroke: #f3b313; }
.report-svg-line.line-purple { stroke: #8b5cf6; }
.report-svg-line.line-teal { stroke: #0ea5e9; }
.report-svg-line.line-muted { stroke: var(--muted); }
.report-svg-line-point,
.report-svg-point { stroke: var(--graph-marker-stroke); stroke-width: 1.5; }
.report-svg-line-point.line-info,
.report-svg-point.line-info { fill: var(--blue); }
.report-svg-line-point.line-warning,
.report-svg-point.line-warning { fill: var(--amber); }
.report-svg-line-point.line-danger,
.report-svg-point.line-danger { fill: var(--red); }
.report-svg-line-point.line-success,
.report-svg-point.line-success { fill: var(--green); }
.report-svg-line-point.line-code-200,
.report-svg-point.line-code-200 { fill: #f3b313; }
.report-svg-line-point.line-purple,
.report-svg-point.line-purple { fill: #8b5cf6; }
.report-svg-line-point.line-teal,
.report-svg-point.line-teal { fill: #0ea5e9; }
.report-svg-line-point.line-muted,
.report-svg-point.line-muted { fill: var(--muted); }
.report-svg-point.is-info { fill: #6bb6ff; }
.report-svg-point.is-danger { fill: var(--red); }
.graph-legend { justify-content: center; }
.donut {
  display: grid;
  place-items: center;
  width: 142px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: conic-gradient(var(--green) 0 var(--pass-deg), var(--red) var(--pass-deg) 360deg);
}
.donut span {
  display: grid;
  place-items: center;
  width: 92px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--surface);
  font-size: 24px;
  font-weight: 900;
}
.legend-row { display: flex; gap: 14px; color: var(--muted); font-size: 12px; font-weight: 700; }
.legend-row i { display: inline-block; width: 10px; height: 10px; margin-right: 5px; border-radius: 50%; }
.legend-pass { background: var(--green); }
.legend-fail { background: var(--red); }
.legend-info { background: var(--blue); }
.legend-warning { background: var(--amber); }
.legend-code-200 { background: #f3b313; }
.legend-purple { background: #8b5cf6; }
.legend-teal { background: #0ea5e9; }
.legend-muted { background: var(--muted); }
.bar-list { display: grid; gap: 10px; margin-top: 16px; }
.bar-row { display: grid; grid-template-columns: 70px 1fr 72px; gap: 10px; align-items: center; color: var(--muted); }
.bar-track { height: 12px; overflow: hidden; border-radius: 999px; background: var(--bar-track); }
.bar-fill { height: 100%; border-radius: inherit; background: var(--muted); }
.bar-fill.status-success, .status-success { background: var(--green); color: white; }
.bar-fill.status-info, .status-info { background: var(--blue); color: white; }
.bar-fill.status-warning, .status-warning { background: var(--amber); color: white; }
.bar-fill.status-danger, .status-danger { background: var(--red); color: white; }
.bar-fill.info { background: var(--purple); }
.mini-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 10px; margin-top: 16px; }
.mini-metrics div { padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.mini-metrics strong { display: block; margin-top: 5px; font-size: 18px; }
.diagnosis-metric-grid { margin-bottom: 16px; }
.diagnosis-info-grid { margin-top: 0; margin-bottom: 16px; }
.diagnosis-table-frame {
  overflow: auto;
  margin-top: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.diagnosis-table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
}
.diagnosis-table th, .diagnosis-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}
.diagnosis-table th {
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
}
.diagnosis-table tr:last-child td { border-bottom: 0; }
.diagnostic-check-list { display: grid; gap: 10px; }
.diagnostic-check {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, auto);
  gap: 16px;
  align-items: start;
  padding: 14px;
  border: 1px solid var(--line);
  border-left: 5px solid var(--line-strong);
  border-radius: 8px;
  background: var(--surface-soft);
}
.diagnostic-check.status-success { border-left-color: var(--green); background: var(--surface); color: var(--ink); }
.diagnostic-check.status-warning { border-left-color: var(--amber); background: var(--surface); color: var(--ink); }
.diagnostic-check.status-danger { border-left-color: var(--red); background: var(--surface); color: var(--ink); }
.diagnostic-check.status-muted { border-left-color: var(--line-strong); background: var(--surface); color: var(--ink); }
.diagnostic-check span {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}
.diagnostic-check strong { display: block; margin-top: 4px; }
.diagnostic-check p { margin: 6px 0 0; color: var(--muted); overflow-wrap: anywhere; }
.diagnostic-check-result { display: grid; justify-items: end; gap: 8px; text-align: right; }
.diagnostic-check-result strong { max-width: 260px; overflow-wrap: anywhere; }
.results-controls {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-soft);
}
.results-filter-group { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.page-size-control { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-weight: 800; }
.page-size-control span { font-size: 12px; text-transform: uppercase; }
.page-size-control select {
  min-width: 78px;
  padding: 7px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
}
.results-pagination { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; color: var(--muted); font-weight: 700; }
.pagination-button, .detail-button, .modal-close-button {
  min-height: 32px;
  padding: 6px 11px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  font-weight: 800;
  cursor: pointer;
}
.pagination-button:hover, .detail-button:hover, .modal-close-button:hover { border-color: var(--blue); color: var(--blue); background: var(--blue-soft); }
.pagination-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.detail-button { white-space: nowrap; }
.table-frame { overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
.results-table { width: 100%; min-width: 940px; border-collapse: collapse; }
.results-table th, .results-table td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.results-table th { background: var(--surface-soft); color: var(--muted); font-size: 12px; text-transform: uppercase; }
.results-table tr:last-child td { border-bottom: 0; }
.results-table small { display: block; margin-top: 3px; color: var(--muted); overflow-wrap: anywhere; }
.status-badge, .pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}
.pill.pass { background: var(--green-soft); color: var(--green); }
.pill.fail { background: var(--red-soft); color: var(--red); }
.status-muted { background: var(--status-muted-bg); color: var(--muted); }
.response-card {
  margin-top: 14px;
  padding: 20px;
  border: 1px solid var(--line);
  border-left: 5px solid var(--red);
  border-radius: 8px;
  background: var(--surface-soft);
}
.response-card.is-pass { border-left-color: var(--green); }
.response-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
.response-card-header p:not(.eyebrow) { margin: 6px 0 0; color: var(--muted); overflow-wrap: anywhere; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: 14px; }
.data-block {
  margin-top: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.data-block summary { cursor: pointer; padding: 12px 14px; color: var(--ink); font-weight: 800; }
pre {
  margin: 0;
  padding: 14px;
  overflow: auto;
  border-top: 1px solid var(--line);
  color: var(--pre-text);
  background: var(--pre-bg);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.test-list { display: grid; gap: 8px; margin: 0; padding: 0 14px 14px; list-style: none; }
.test-list li { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start; }
.test-list small { grid-column: 2; color: var(--red); }
.error-box, .empty-panel {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
}
.error-box { border-color: #f2bac0; background: var(--red-soft); color: var(--red); }
.error-box p { margin: 4px 0 0; }
.empty-cell { padding: 22px; text-align: center; color: var(--muted); }
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 22px;
  background: var(--modal-backdrop);
}
.modal-backdrop[hidden] { display: none; }
.response-modal-panel {
  width: min(1040px, 100%);
  max-height: min(88vh, 980px);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--modal-shadow);
}
.response-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-soft);
}
.response-modal-content {
  max-height: calc(min(88vh, 980px) - 94px);
  overflow: auto;
  padding: 8px 20px 22px;
}
.response-modal-content .response-card {
  margin-top: 12px;
}
@media (max-width: 760px) {
  .report-shell { width: min(100% - 20px, 1180px); margin-top: 10px; }
  .report-hero, .response-card-header { display: block; }
  .hero-result { width: 110px; margin-top: 20px; }
  .report-nav { overflow-x: auto; }
  .results-controls { align-items: flex-start; display: grid; }
  .results-filter-group { display: grid; }
  .results-pagination { justify-content: flex-start; }
  .diagnostic-check { grid-template-columns: 1fr; }
  .diagnostic-check-result { justify-items: start; text-align: left; }
  .chart-grid { grid-template-columns: 1fr; }
  .bar-row { grid-template-columns: 1fr; }
  .modal-backdrop { padding: 10px; }
  .response-modal-panel { max-height: 94vh; }
  .response-modal-header { display: block; }
  .modal-close-button { margin-top: 12px; }
}
@media print {
  html { background: white; }
  body.modal-open { overflow: visible; }
  .report-shell { width: auto; margin: 0; }
	  .report-nav, .chart-selector, .results-controls, .detail-button, .modal-backdrop, #responseDetailTemplates { display: none; }
  .result-row[hidden] { display: table-row !important; }
  .report-section, .report-hero { break-inside: avoid; box-shadow: none; }
}
`;
}

module.exports = {
  resultHtmlReportToHtml,
  writeResultHtmlReport
};
