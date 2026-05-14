const { once } = require('node:events');

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
  await writeLine(output, '<html lang="en">');
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
  await writeHero(output, { kind, result, metadata, title, exportedAt });
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
  await writeCharts(output, { kind, result, statusCounts, passFail });
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
  const scripts = reportScripts(reportOptions);
  if (scripts) {
    await writeLine(output, '<script>');
    await writeLine(output, scripts);
    await writeLine(output, '</script>');
  }
  await writeLine(output, '</body>');
  await writeLine(output, '</html>');
}

async function writeHero(output, { kind, result, metadata, title, exportedAt }) {
  const label = kind === 'performance' ? 'Performance Results' : 'Runner Results';
  const runId = result.resultStoreId || result.id || metadata.runId || '';
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
  await writeLine(output, `<div class="hero-result ${result.passed === true ? 'is-pass' : 'is-fail'}">`);
  await writeLine(output, `<span>${result.cancelled === true ? 'Cancelled' : result.passed === true ? 'Passed' : 'Needs Review'}</span>`);
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

async function writeCharts(output, { kind, result, statusCounts, passFail }) {
  const passDegrees = passFail.total > 0 ? Math.round((passFail.passed / passFail.total) * 360) : 0;
  await writeLine(output, '<section id="charts" class="report-section">');
  await writeLine(output, '<div class="section-heading">');
  await writeLine(output, '<p class="eyebrow">Visual Summary</p>');
  await writeLine(output, '<h2>Charts and Trends</h2>');
  await writeLine(output, '<p>Run-level visual summaries for outcomes, status codes, latency, and diagnostic phases.</p>');
  await writeLine(output, '</div>');
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
  if (kind === 'performance' && result.summary?.diagnosis?.phases?.length) {
    await writeLine(output, '<article class="chart-card chart-card-wide">');
    await writeLine(output, '<h3>Diagnosis phases</h3>');
    await writeDiagnosisPhases(output, result.summary.diagnosis.phases);
    await writeLine(output, '</article>');
  }
  await writeLine(output, '</div>');
  await writeLine(output, '</section>');
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

async function writeDiagnosisPhases(output, phases) {
  const maxRps = Math.max(1, ...phases.map((phase) => Number(phase.requestsPerSecond || 0)));
  await writeLine(output, '<div class="phase-list">');
  for (const phase of phases) {
    const width = Math.max(2, Math.round((Number(phase.requestsPerSecond || 0) / maxRps) * 100));
    await writeLine(output, '<div class="phase-row">');
    await writeLine(output, `<span>${escapeHtml(phase.phase || 'phase')}</span>`);
    await writeLine(output, `<div class="bar-track"><div class="bar-fill info" style="width:${width}%"></div></div>`);
    await writeLine(output, `<strong>${escapeHtml(formatDecimal(phase.requestsPerSecond))} rps</strong>`);
    await writeLine(output, '</div>');
  }
  await writeLine(output, '</div>');
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
    includeRequestResults,
    includeRequestDetails: includeRequestResults && options.includeRequestDetails !== false
  };
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
  const counts = {
    ...(result.resultPage?.statusCounts || {}),
    ...(result.summary?.statusCodes || {})
  };
  if (Object.keys(counts).length) {
    return counts;
  }
  const items = Array.isArray(result.samples) ? result.samples : Array.isArray(result.results) ? result.results : [];
  for (const item of items) {
    const status = statusLabel(item);
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function passFailCounts(kind, result, statusCounts) {
  const total = Number(result.completedRequests ?? result.totalRequests ?? statusTotal(statusCounts) ?? 0);
  const passed = Number(
    kind === 'performance'
      ? result.successfulRequests ?? successCount(statusCounts)
      : result.passedRequests ?? successCount(statusCounts)
  ) || 0;
  const failed = Number(result.failedRequests ?? Math.max(0, total - passed)) || 0;
  return { total, passed, failed };
}

function successCount(statusCounts) {
  return Object.entries(statusCounts || {}).reduce((total, [status, count]) => {
    const code = Number(status);
    return code >= 200 && code < 400 ? total + Number(count || 0) : total;
  }, 0);
}

function statusTotal(statusCounts) {
  return Object.values(statusCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
}

function statusLabel(item = {}) {
  if (item.statusCode) {
    return String(item.statusCode);
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
  if (!includeRequestResults) {
    return '';
  }
  return `
(function () {
  'use strict';

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
  --shadow: 0 18px 45px rgba(27, 39, 64, 0.12);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--ink); }
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
.hero-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; color: var(--muted); }
.hero-meta span, .warning-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
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
.hero-result.is-pass { border-color: var(--green-soft); color: var(--green); }
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
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
}
.report-nav a {
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--muted);
  font-weight: 700;
}
.report-nav a:hover { background: var(--blue-soft); color: var(--blue); text-decoration: none; }
.report-section {
  margin-top: 18px;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(27, 39, 64, 0.06);
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
.chart-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.chart-card {
  min-height: 230px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: linear-gradient(180deg, var(--surface), var(--surface-soft));
}
.chart-card-wide { grid-column: 1 / -1; }
.chart-card-compact { display: grid; justify-items: center; gap: 12px; }
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
.bar-list, .phase-list { display: grid; gap: 10px; margin-top: 16px; }
.bar-row, .phase-row { display: grid; grid-template-columns: 70px 1fr 72px; gap: 10px; align-items: center; color: var(--muted); }
.phase-row { grid-template-columns: 160px 1fr 90px; }
.bar-track { height: 12px; overflow: hidden; border-radius: 999px; background: #e8eef6; }
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
.status-muted { background: #eef2f7; color: var(--muted); }
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
  color: #10233f;
  background: #f6f9fd;
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
  background: rgba(22, 32, 51, 0.52);
}
.modal-backdrop[hidden] { display: none; }
.response-modal-panel {
  width: min(1040px, 100%);
  max-height: min(88vh, 980px);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.34);
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
  .phase-row, .bar-row { grid-template-columns: 1fr; }
  .modal-backdrop { padding: 10px; }
  .response-modal-panel { max-height: 94vh; }
  .response-modal-header { display: block; }
  .modal-close-button { margin-top: 12px; }
}
@media print {
  html { background: white; }
  body.modal-open { overflow: visible; }
  .report-shell { width: auto; margin: 0; }
  .report-nav, .results-controls, .detail-button, .modal-backdrop, #responseDetailTemplates { display: none; }
  .result-row[hidden] { display: table-row !important; }
  .report-section, .report-hero { break-inside: avoid; box-shadow: none; }
}
`;
}

module.exports = {
  resultHtmlReportToHtml,
  writeResultHtmlReport
};
