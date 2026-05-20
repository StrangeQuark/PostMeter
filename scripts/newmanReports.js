#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'newman-reports');
const RAW_DIR = path.join(REPORT_DIR, 'raw-newman');
const RAW_POSTMETER_DIR = path.join(REPORT_DIR, 'raw-postmeter');
const NORMALIZED_DIR = path.join(REPORT_DIR, 'normalized-newman');
const POSTMETER_DIR = path.join(REPORT_DIR, 'normalized-postmeter');
const SUMMARY_PATH = path.join(REPORT_DIR, 'comparison-summary.json');
const TARGET = Object.freeze({
  newman: '6.2.2',
  postmanRuntime: '7.39.1',
  normalizationSchemaVersion: 1
});
const GENERATION_COMMAND = 'npm run postman:newman-reports:refresh -- --download-newman --output <dir>';
const SUITES = Object.freeze([
  'differential-http-core',
  'differential-sandbox-broad',
  'differential-dynamic-host-globals',
  'differential-runtime-limits',
  'differential-httponly-cookies',
  'differential-sendrequest-advanced',
  'differential-sendrequest-files'
]);

async function main() {
  const command = process.argv[2] || 'validate';
  if (command === 'write') {
    const sourceDir = valueForFlag('--from') || process.env.POSTMETER_NEWMAN_REPORT_SOURCE_DIR || '';
    if (!sourceDir) {
      throw new Error('Newman report write requires --from <postman:parity:diff output dir>. Generate with npm run postman:parity:diff -- --newman --download-newman --output <dir>.');
    }
    await writeReports(path.resolve(sourceDir));
    console.log(`Wrote Newman JSON evidence for ${SUITES.length} suites.`);
    return;
  }
  if (command === 'refresh') {
    const outputDir = path.resolve(valueForFlag('--output') || process.env.POSTMETER_NEWMAN_REPORT_REFRESH_DIR || path.join(PROJECT_ROOT, 'artifacts', 'postman-parity-newman-reports-refresh'));
    await refreshReports(outputDir, {
      allowNewmanDownload: hasFlag('--download-newman') || process.env.POSTMETER_PARITY_DOWNLOAD_NEWMAN === '1'
    });
    console.log(`Refreshed Newman JSON evidence for ${SUITES.length} suites from ${outputDir}.`);
    return;
  }
  if (command === 'validate') {
    const errors = await validateReports();
    if (errors.length) {
      for (const error of errors) {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Newman JSON evidence valid: ${SUITES.length} suites targeting newman@${TARGET.newman}.`);
    return;
  }
  console.error('Usage: node scripts/newmanReports.js <refresh [--download-newman] [--output DIR]|write --from DIR|validate>');
  process.exitCode = 1;
}

async function refreshReports(outputDir, options = {}) {
  const { runPostmanParityDifferential } = require('../src/core/diagnostics-release/postmanParityHarness');
  const result = await runPostmanParityDifferential({
    allowNewmanDownload: options.allowNewmanDownload === true,
    outputDir,
    requireNewman: true,
    runNewman: true
  });
  if (result.comparison?.passed !== true) {
    throw new Error('Cannot refresh Newman evidence from a differential run with comparison failures.');
  }
  await writeReports(outputDir);
}

async function writeReports(sourceDir) {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(RAW_POSTMETER_DIR, { recursive: true });
  await fs.mkdir(NORMALIZED_DIR, { recursive: true });
  await fs.mkdir(POSTMETER_DIR, { recursive: true });
  await cleanupReportDir(RAW_DIR);
  await cleanupReportDir(RAW_POSTMETER_DIR);
  await cleanupReportDir(NORMALIZED_DIR);
  await cleanupReportDir(POSTMETER_DIR);
  const suiteSummaries = [];
  const summary = JSON.parse(await fs.readFile(path.join(sourceDir, 'postman-parity-differential-summary.json'), 'utf8'));
  validateSourceSummary(summary);
  const generatedDates = [];
  for (const suite of SUITES) {
    const raw = JSON.parse(await fs.readFile(path.join(sourceDir, `newman-${suite}.json`), 'utf8'));
    const postmeter = JSON.parse(await fs.readFile(path.join(sourceDir, `postmeter-${suite}.json`), 'utf8'));
    const dateGenerated = dateGeneratedFromNewmanReport(raw);
    generatedDates.push(dateGenerated);
    await fs.writeFile(path.join(RAW_DIR, `${suite}.json`), `${JSON.stringify(raw, null, 2)}\n`);
    await fs.writeFile(path.join(RAW_POSTMETER_DIR, `${suite}.json`), `${JSON.stringify(postmeter, null, 2)}\n`);
    const normalizedNewman = normalizeNewmanReport(raw, suite);
    const normalizedPostmeter = normalizePostmeterReport(postmeter, suite, { dateGenerated });
    await fs.writeFile(path.join(NORMALIZED_DIR, `${suite}.json`), `${JSON.stringify(normalizedNewman, null, 2)}\n`);
    await fs.writeFile(path.join(POSTMETER_DIR, `${suite}.json`), `${JSON.stringify(normalizedPostmeter, null, 2)}\n`);
    suiteSummaries.push({
      fixtureId: suite,
      newmanRaw: path.relative(REPORT_DIR, path.join(RAW_DIR, `${suite}.json`)).replaceAll(path.sep, '/'),
      newmanNormalized: path.relative(REPORT_DIR, path.join(NORMALIZED_DIR, `${suite}.json`)).replaceAll(path.sep, '/'),
      postmeterRaw: path.relative(REPORT_DIR, path.join(RAW_POSTMETER_DIR, `${suite}.json`)).replaceAll(path.sep, '/'),
      postmeterNormalized: path.relative(REPORT_DIR, path.join(POSTMETER_DIR, `${suite}.json`)).replaceAll(path.sep, '/')
    });
  }
  await fs.writeFile(SUMMARY_PATH, `${JSON.stringify({
    schemaVersion: 1,
    target: {
      newman: TARGET.newman,
      postmanRuntime: TARGET.postmanRuntime
    },
    generationCommand: GENERATION_COMMAND,
    dateGenerated: earliestGeneratedDate(generatedDates),
    normalizedFields: normalizedFields(),
    comparison: {
      passed: true,
      differences: []
    },
    suites: suiteSummaries
  }, null, 2)}\n`);
}

async function validateReports() {
  const errors = [];
  let summary;
  try {
    summary = JSON.parse(await fs.readFile(SUMMARY_PATH, 'utf8'));
  } catch (error) {
    errors.push(`Newman comparison summary is missing or invalid: ${error.message || String(error)}.`);
  }
  if (summary) {
    if (summary.schemaVersion !== TARGET.normalizationSchemaVersion) {
      errors.push(`Newman comparison summary must use schema version ${TARGET.normalizationSchemaVersion}.`);
    }
    if (summary.target?.newman !== TARGET.newman) {
      errors.push(`Newman comparison summary must target newman@${TARGET.newman}.`);
    }
    if (summary.target?.postmanRuntime !== TARGET.postmanRuntime) {
      errors.push(`Newman comparison summary must target Postman Runtime ${TARGET.postmanRuntime}.`);
    }
    if (summary.generationCommand !== GENERATION_COMMAND) {
      errors.push('Newman comparison summary must record the canonical generation command.');
    }
    if (!isIsoTimestamp(summary.dateGenerated)) {
      errors.push('Newman comparison summary must record a concrete ISO dateGenerated timestamp.');
    }
    if (JSON.stringify(summary.normalizedFields) !== JSON.stringify(normalizedFields())) {
      errors.push('Newman comparison summary must record the canonical normalized fields.');
    }
    if (summary.comparison?.passed !== true || !Array.isArray(summary.comparison?.differences) || summary.comparison.differences.length) {
      errors.push('Newman comparison summary must record a clean differential comparison.');
    }
    if (!Array.isArray(summary.suites) || summary.suites.length !== SUITES.length) {
      errors.push(`Newman comparison summary must list exactly ${SUITES.length} suites.`);
    }
  }
  errors.push(...await validateReportDirectoryFiles('Raw Newman report directory', RAW_DIR));
  errors.push(...await validateReportDirectoryFiles('Raw PostMeter report directory', RAW_POSTMETER_DIR));
  errors.push(...await validateReportDirectoryFiles('Normalized Newman report directory', NORMALIZED_DIR));
  errors.push(...await validateReportDirectoryFiles('Normalized PostMeter report directory', POSTMETER_DIR));
  const generatedDates = [];
  for (const suite of SUITES) {
    const rawPath = path.join(RAW_DIR, `${suite}.json`);
    const rawPostmeterPath = path.join(RAW_POSTMETER_DIR, `${suite}.json`);
    const normalizedPath = path.join(NORMALIZED_DIR, `${suite}.json`);
    const postmeterPath = path.join(POSTMETER_DIR, `${suite}.json`);
    let raw;
    let rawPostmeter;
    let normalized;
    let postmeter;
    try {
      raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));
    } catch (error) {
      errors.push(`Raw Newman report missing or invalid for ${suite}: ${error.message || String(error)}.`);
      continue;
    }
    try {
      rawPostmeter = JSON.parse(await fs.readFile(rawPostmeterPath, 'utf8'));
    } catch (error) {
      errors.push(`Raw PostMeter report missing or invalid for ${suite}: ${error.message || String(error)}.`);
      continue;
    }
    try {
      normalized = JSON.parse(await fs.readFile(normalizedPath, 'utf8'));
    } catch (error) {
      errors.push(`Normalized Newman report missing or invalid for ${suite}: ${error.message || String(error)}.`);
      continue;
    }
    try {
      postmeter = JSON.parse(await fs.readFile(postmeterPath, 'utf8'));
    } catch (error) {
      errors.push(`Normalized PostMeter report missing or invalid for ${suite}: ${error.message || String(error)}.`);
      continue;
    }
    generatedDates.push(dateGeneratedFromNewmanReport(raw));
    const expectedNewman = normalizeNewmanReport(raw, suite);
    if (JSON.stringify(normalized) !== JSON.stringify(expectedNewman)) {
      errors.push(`Normalized Newman report for ${suite} is stale. Regenerate with npm run postman:newman-reports:write -- --from <dir>.`);
    }
    const postmeterMetadataErrors = validateNormalizedMetadata(postmeter, suite, 'postmeter-parity-harness');
    if (postmeterMetadataErrors.length) {
      errors.push(...postmeterMetadataErrors.map((error) => `Normalized PostMeter report for ${suite} ${error}.`));
    }
    const expectedGeneratedDate = dateGeneratedFromNewmanReport(raw);
    if (postmeter.dateGenerated !== expectedGeneratedDate) {
      errors.push(`Normalized PostMeter report for ${suite} dateGenerated must match raw Newman report date ${expectedGeneratedDate}.`);
    }
    const expectedPostmeter = normalizePostmeterReport(rawPostmeter, suite, { dateGenerated: expectedGeneratedDate });
    if (JSON.stringify(postmeter) !== JSON.stringify(expectedPostmeter)) {
      errors.push(`Normalized PostMeter report for ${suite} is stale. Regenerate with npm run postman:newman-reports:write -- --from <dir>.`);
    }
    const newmanMetadataErrors = validateNormalizedMetadata(normalized, suite, 'newman-json-reporter');
    if (newmanMetadataErrors.length) {
      errors.push(...newmanMetadataErrors.map((error) => `Normalized Newman report for ${suite} ${error}.`));
    }
    const nondeterministicNewman = findNondeterministicStrings(normalized);
    if (nondeterministicNewman.length) {
      errors.push(`Normalized Newman report for ${suite} contains nondeterministic values: ${nondeterministicNewman.slice(0, 3).join(', ')}.`);
    }
    const nondeterministicPostmeter = findNondeterministicStrings(postmeter);
    if (nondeterministicPostmeter.length) {
      errors.push(`Normalized PostMeter report for ${suite} contains nondeterministic values: ${nondeterministicPostmeter.slice(0, 3).join(', ')}.`);
    }
    if (postmeter.summary?.passed !== true) {
      errors.push(`Normalized PostMeter report for ${suite} must record a passing run.`);
    }
    if (postmeter.requests?.some((request) => request.passed === false || request.tests?.some((test) => test.passed === false))) {
      errors.push(`Normalized PostMeter report for ${suite} contains failing requests or tests.`);
    }
    if (normalized.assertionFailures.length) {
      errors.push(`Normalized Newman report for ${suite} contains assertion failures.`);
    }
  }
  if (summary) {
    const expectedDate = earliestGeneratedDate(generatedDates);
    if (summary.dateGenerated !== expectedDate) {
      errors.push(`Newman comparison summary dateGenerated must be ${expectedDate}.`);
    }
    const expectedSuites = SUITES.map((suite) => ({
      fixtureId: suite,
      newmanRaw: `raw-newman/${suite}.json`,
      newmanNormalized: `normalized-newman/${suite}.json`,
      postmeterRaw: `raw-postmeter/${suite}.json`,
      postmeterNormalized: `normalized-postmeter/${suite}.json`
    }));
    if (JSON.stringify(summary.suites) !== JSON.stringify(expectedSuites)) {
      errors.push('Newman comparison summary suite paths are stale or incomplete.');
    }
  }
  return errors;
}

async function cleanupReportDir(dir) {
  const expected = expectedReportFileSet();
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !expected.has(entry.name))
    .map((entry) => fs.rm(path.join(dir, entry.name), { force: true })));
}

async function validateReportDirectoryFiles(label, dir) {
  const errors = [];
  const expected = expectedReportFileSet();
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    errors.push(`${label} is missing or unreadable: ${error.message || String(error)}.`);
    return errors;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json') && !expected.has(entry.name)) {
      errors.push(`${label} contains unexpected checked-in report file ${entry.name}. Regenerate with ${GENERATION_COMMAND}.`);
    }
  }
  return errors;
}

function expectedReportFileSet() {
  return new Set(SUITES.map((suite) => `${suite}.json`));
}

function normalizeNewmanReport(raw, suite) {
  const run = raw.run || {};
  const executions = dedupeNewmanExecutions(run.executions || []);
  return {
    schemaVersion: TARGET.normalizationSchemaVersion,
    source: 'newman-json-reporter',
    fixtureId: suite,
    newmanVersion: TARGET.newman,
    postmanRuntimeVersion: TARGET.postmanRuntime,
    generationCommand: GENERATION_COMMAND,
    dateGenerated: dateGeneratedFromNewmanReport(raw),
    normalization: {
      normalizedFields: normalizedFields(),
      preservedFields: [
        'collection name',
        'request order',
        'request names',
        'request methods',
        'response codes',
        'response shape and body digest',
        'assertion names',
        'assertion pass/fail state',
        'failure messages',
        'console output'
      ]
    },
    collectionName: raw.collection?.info?.name || '',
    stats: normalizeStats(run.stats || {}),
    requests: executions.map((execution) => ({
      itemName: execution.item?.name || '',
      method: execution.request?.method || execution.item?.request?.method || '',
      responseCode: Number(execution.response?.code || 0),
      responseShape: normalizeResponseShape(execution.response),
      console: normalizeConsoleEntries(execution.console || []),
      assertions: (execution.assertions || []).map((assertion) => ({
        name: assertion.assertion || '',
        passed: !assertion.error,
        skipped: assertion.skipped === true,
        error: assertion.error?.message || ''
      }))
    })),
    assertionFailures: (run.failures || []).map((failure) => ({
      assertion: failure.error?.test || failure.source?.name || '',
      message: failure.error?.message || ''
    }))
  };
}

function normalizePostmeterReport(raw, suite, options = {}) {
  const dateGenerated = options.dateGenerated || raw.dateGenerated || '';
  return {
    schemaVersion: TARGET.normalizationSchemaVersion,
    source: 'postmeter-parity-harness',
    fixtureId: suite,
    newmanVersion: TARGET.newman,
    postmanRuntimeVersion: TARGET.postmanRuntime,
    generationCommand: GENERATION_COMMAND,
    dateGenerated,
    normalization: {
      normalizedFields: normalizedFields(),
      preservedFields: [
        'collection name',
        'request order',
        'request names',
        'response codes',
        'test names',
        'test pass/fail state',
        'failure messages',
        'environment key order',
        'observed request method/path/header evidence'
      ]
    },
    summary: normalizeEvidenceValue(raw.summary || {}),
    requests: normalizeEvidenceValue(raw.requests || []),
    environment: normalizeEvidenceValue(raw.environment || []),
    observedRequests: (raw.observedRequests || []).map((item) => ({
      method: item.method,
      path: normalizeEvidenceValue(item.path),
      xPre: normalizeEvidenceValue(item.headers?.['x-pre'] || item.xPre || '')
    }))
  };
}

function normalizeResponseShape(response = {}) {
  const body = normalizedResponseBodyBuffer(response);
  return {
    status: response.status || '',
    code: Number(response.code || 0),
    sizeBytes: body.length,
    headerCount: Array.isArray(response.header) ? response.header.length : 0,
    cookieCount: Array.isArray(response.cookie) ? response.cookie.length : 0,
    bodySha256: body.length ? crypto.createHash('sha256').update(body).digest('hex') : ''
  };
}

function normalizedResponseBodyBuffer(response = {}) {
  const body = responseBodyBuffer(response);
  if (!body.length) {
    return body;
  }
  const text = body.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(body)) {
    return body;
  }
  try {
    return Buffer.from(JSON.stringify(normalizeEvidenceValue(JSON.parse(text))));
  } catch {
    return Buffer.from(normalizeEvidenceValue(text));
  }
}

function responseBodyBuffer(response = {}) {
  if (response.stream?.type === 'Buffer' && Array.isArray(response.stream.data)) {
    return Buffer.from(response.stream.data);
  }
  if (Buffer.isBuffer(response.stream)) {
    return response.stream;
  }
  if (typeof response.body === 'string') {
    return Buffer.from(response.body);
  }
  return Buffer.alloc(0);
}

function normalizeConsoleEntries(entries = []) {
  return entries.map((entry) => ({
    level: String(entry.level || entry.type || ''),
    messages: normalizeEvidenceValue(entry.messages || entry.args || [])
  }));
}

function normalizeStats(stats) {
  const output = {};
  for (const [key, value] of Object.entries(stats || {})) {
    output[key] = {
      total: Number(value?.total || 0),
      pending: Number(value?.pending || 0),
      failed: Number(value?.failed || 0)
    };
  }
  return output;
}

function dedupeNewmanExecutions(executions) {
  const seen = new Set();
  const deduped = [];
  for (const execution of executions) {
    const key = newmanExecutionKey(execution);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(execution);
  }
  return deduped;
}

function newmanExecutionKey(execution) {
  if (execution?.cursor?.execution) {
    return String(execution.cursor.execution);
  }
  return [
    execution?.item?.id || '',
    execution?.item?.name || '',
    execution?.request?.method || '',
    execution?.response?.code || '',
    (execution?.assertions || []).map((assertion) => assertion.assertion || '').join('|')
  ].join('|');
}

function normalizedFields() {
  return [
    'timestamps',
    'run durations',
    'response timings',
    'randomized localhost ports',
    'host filesystem paths',
    'generated request IDs',
    'generated Postman request tokens',
    'generated multipart boundaries',
    'time-derived request signatures',
    'machine names and machine-specific process metadata',
    'raw reporter cursor ids where duplicated by Newman internals'
  ];
}

function dateGeneratedFromNewmanReport(raw) {
  const started = Number(raw?.run?.timings?.started || raw?.run?.timings?.completed || 0);
  if (!Number.isFinite(started) || started <= 0) {
    return 'unknown';
  }
  return new Date(started).toISOString();
}

function earliestGeneratedDate(values = []) {
  const dates = values.filter((value) => typeof value === 'string' && value && value !== 'unknown').sort();
  return dates[0] || 'unknown';
}

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;

function normalizeEvidenceValue(value, pathParts = []) {
  if (typeof value === 'string') {
    const normalized = value
      .replace(/\b(http:\/\/(?:127\.0\.0\.1|localhost)):\d+/gu, '$1:<port>')
      .replace(/\b(https:\/\/(?:127\.0\.0\.1|localhost)):\d+/gu, '$1:<port>')
      .replace(/\b((?:127\.0\.0\.1|localhost)):\d+\b/gu, '$1:<port>')
      .replace(/\bCredential=([^/]+)\/\d{8}\//gu, 'Credential=$1/<date>/')
      .replace(/\bSignature=[0-9a-f]{16,}\b/giu, 'Signature=<signature>')
      .replace(/--postmeter-[a-f0-9]+/giu, '--<boundary>')
      .replace(/\bpostmeter-[a-f0-9]+\b/giu, '<boundary>')
      .replace(/-{20,}[a-z0-9]+/giu, '<boundary>');
    if (isGeneratedIdField(pathParts) && UUID_PATTERN.test(normalized)) {
      UUID_PATTERN.lastIndex = 0;
      return normalized.replace(UUID_PATTERN, '<generated-id>');
    }
    UUID_PATTERN.lastIndex = 0;
    if (isMachineNameField(pathParts) && normalized) {
      return '<machine-name>';
    }
    return normalized;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeEvidenceValue(item, [...pathParts, String(index)]));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeEvidenceValue(item, [...pathParts, key])]));
  }
  return value;
}

function validateNormalizedMetadata(report, suite, source) {
  const errors = [];
  if (report.schemaVersion !== TARGET.normalizationSchemaVersion) {
    errors.push(`must use schema version ${TARGET.normalizationSchemaVersion}`);
  }
  if (report.source !== source) {
    errors.push(`must record source ${source}`);
  }
  if (report.fixtureId !== suite) {
    errors.push(`must record fixtureId ${suite}`);
  }
  if (report.newmanVersion !== TARGET.newman) {
    errors.push(`must record newman@${TARGET.newman}`);
  }
  if (report.postmanRuntimeVersion !== TARGET.postmanRuntime) {
    errors.push(`must record Postman Runtime ${TARGET.postmanRuntime}`);
  }
  if (report.generationCommand !== GENERATION_COMMAND) {
    errors.push('must record the canonical generation command');
  }
  if (typeof report.dateGenerated !== 'string' || !report.dateGenerated) {
    errors.push('must record dateGenerated');
  } else if (!isIsoTimestamp(report.dateGenerated)) {
    errors.push('must record dateGenerated as a concrete ISO timestamp');
  }
  if (!Array.isArray(report.normalization?.normalizedFields) || !report.normalization.normalizedFields.length) {
    errors.push('must record normalized fields');
  } else if (JSON.stringify(report.normalization.normalizedFields) !== JSON.stringify(normalizedFields())) {
    errors.push('must record the canonical normalized fields');
  }
  return errors;
}

function findNondeterministicStrings(value, pathParts = []) {
  const findings = [];
  if (typeof value === 'string') {
    UUID_PATTERN.lastIndex = 0;
    if (/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/u.test(value)
      || /\b(?:127\.0\.0\.1|localhost):\d+\b/u.test(value)
      || /(?:^|[\\/])(?:home|Users)[\\/][^/\\]+/u.test(value)
      || /[A-Za-z]:\\Users\\/u.test(value)
      || /Desktop[\\/]PostMeter/u.test(value)
      || /\bCredential=[^/]+\/\d{8}\//u.test(value)
      || /\bSignature=[0-9a-f]{16,}\b/iu.test(value)
      || /--postmeter-[a-f0-9]+/iu.test(value)
      || /\bpostmeter-[a-f0-9]+\b/iu.test(value)
      || /-{20,}[a-z0-9]+/iu.test(value)) {
      findings.push(`${pathParts.join('.') || '<root>'}=${value}`);
    }
    if (isGeneratedIdField(pathParts) && UUID_PATTERN.test(value)) {
      findings.push(`${pathParts.join('.') || '<root>'}=${value}`);
    }
    UUID_PATTERN.lastIndex = 0;
    if (isMachineNameField(pathParts) && value && value !== '<machine-name>') {
      findings.push(`${pathParts.join('.') || '<root>'}=${value}`);
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...findNondeterministicStrings(item, [...pathParts, String(index)])));
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      findings.push(...findNondeterministicStrings(item, [...pathParts, key]));
    }
  }
  return findings;
}

function isGeneratedIdField(pathParts = []) {
  const key = pathParts[pathParts.length - 1] || '';
  return [
    'id',
    'itemId',
    'requestId',
    'httpRequestId',
    'scriptId',
    'cursor',
    'execution',
    'postman-token',
    'postmanToken',
    'x-postman-token',
    'request_id'
  ].includes(key);
}

function isMachineNameField(pathParts = []) {
  const key = pathParts[pathParts.length - 1] || '';
  return [
    'machine',
    'machineName',
    'hostName',
    'hostname',
    'computerName'
  ].includes(key);
}

function validateSourceSummary(summary) {
  if (summary.comparison?.passed !== true) {
    throw new Error('Cannot check in Newman evidence from a differential run with comparison failures.');
  }
  if (summary.target?.newman !== TARGET.newman) {
    throw new Error(`Cannot check in Newman evidence unless the differential summary targets newman@${TARGET.newman}.`);
  }
  if (summary.target?.postmanRuntime !== TARGET.postmanRuntime) {
    throw new Error(`Cannot check in Newman evidence unless the differential summary targets Postman Runtime ${TARGET.postmanRuntime}.`);
  }
  if (!Array.isArray(summary.suites) || summary.suites.length !== SUITES.length) {
    throw new Error(`Cannot check in Newman evidence unless the differential summary lists exactly ${SUITES.length} suites.`);
  }
  const suiteIds = summary.suites.map((suite) => suite.fixture);
  if (JSON.stringify(suiteIds) !== JSON.stringify(SUITES)) {
    throw new Error('Cannot check in Newman evidence unless the differential summary suite order matches the approved suite list.');
  }
  for (const suite of summary.suites) {
    if (suite.comparison?.passed !== true) {
      throw new Error(`Cannot check in Newman evidence from a suite with comparison failures: ${suite.fixture}.`);
    }
    if (suite.newman?.skipped === true) {
      throw new Error(`Cannot check in Newman evidence from a suite that skipped Newman: ${suite.fixture}.`);
    }
  }
}

function isIsoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && !Number.isNaN(Date.parse(value));
}

function valueForFlag(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  NORMALIZED_DIR,
  POSTMETER_DIR,
  RAW_DIR,
  RAW_POSTMETER_DIR,
  REPORT_DIR,
  SUITES,
  TARGET,
  dateGeneratedFromNewmanReport,
  findNondeterministicStrings,
  normalizedFields,
  normalizeEvidenceValue,
  normalizeNewmanReport,
  normalizePostmeterReport,
  refreshReports,
  validateReports,
  validateSourceSummary,
  writeReports
};
