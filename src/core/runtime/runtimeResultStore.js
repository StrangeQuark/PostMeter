const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const {
  applyCapturePolicyToResult,
  normalizeCapturePolicy
} = require('../workspace/resultCapturePolicy');
const { writeResultHtmlReport } = require('../import-export/resultHtmlReport');

const RESULT_STORE_SCHEMA_VERSION = 1;
const DEFAULT_RESULT_STORE_FILENAME = 'postmeter-current-results.sqlite';
const PAGE_LIMIT_MAX = 500;
const DETAIL_CHECK_INTERVAL = 1000;
const ESTIMATE_BASE_BYTES = 1024 * 1024;
const ESTIMATE_CORE_ROW_BYTES = 768;
const ESTIMATE_SQLITE_MULTIPLIER = 1.35;
const ESTIMATE_SCRIPT_RESULT_BYTES = 1024;
const ESTIMATE_SCRIPT_LOG_BYTES = 2048;
const ESTIMATE_LOCAL_VARIABLE_BYTES = 2048;
const ESTIMATE_RESPONSE_HEADERS_BYTES = 2048;
const ESTIMATE_TRANSPORT_TIMINGS_BYTES = 512;

function defaultRuntimeResultStorePath(userDataPath) {
  return path.join(path.resolve(userDataPath || process.cwd()), 'runtime', DEFAULT_RESULT_STORE_FILENAME);
}

class RuntimeResultStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.db = null;
    this.insertStatement = null;
    this.runId = '';
    this.kind = '';
    this.capturePolicy = null;
    this.totalRequests = 0;
    this.detailCaptureTruncated = false;
    this.detailCaptureTruncationReason = '';
    this.recordCount = 0;
  }

  async reset() {
    this.close();
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    for (const candidate of runtimeResultStoreFiles(this.filePath)) {
      await fsp.rm(candidate, { force: true }).catch(() => {});
    }
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      PRAGMA journal_mode=DELETE;
      PRAGMA synchronous=NORMAL;
      PRAGMA temp_store=MEMORY;
      DROP INDEX IF EXISTS samples_kind_status_index;
      DROP INDEX IF EXISTS samples_kind_index;
      DROP TABLE IF EXISTS samples;
      DROP TABLE IF EXISTS metadata;
      CREATE TABLE metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        result_index INTEGER NOT NULL,
        iteration INTEGER,
        request_id TEXT,
        request_name TEXT,
        request_display_name TEXT,
        request_method TEXT,
        request_url TEXT,
        final_url TEXT,
        folder_name TEXT,
        runner_iteration INTEGER,
        runner_iterations INTEGER,
        phase TEXT,
        stage_name TEXT,
        stage_index INTEGER,
        stage_concurrency INTEGER,
        scheduler_lag_millis REAL,
        started_at TEXT,
        status_code INTEGER,
        status_filter TEXT,
        duration_millis REAL,
        response_bytes INTEGER,
        body_sha256 TEXT,
        passed INTEGER,
        error TEXT,
        response_body TEXT,
        response_headers_json TEXT,
        timings_json TEXT,
        pre_request_json TEXT,
        post_request_json TEXT,
        after_response_json TEXT,
        message_scripts_json TEXT,
        local_variables_json TEXT
      );
      CREATE UNIQUE INDEX samples_kind_index ON samples(kind, result_index);
      CREATE INDEX samples_kind_status_index ON samples(kind, status_filter, result_index);
    `);
  }

  beginRun({ id, kind, capturePolicy, plannedRequests = 0, metadata = {} }) {
    this.assertOpen();
    this.runId = String(id || '');
    this.kind = String(kind || '');
    this.totalRequests = Math.max(0, Number(plannedRequests || 0));
    this.capturePolicy = normalizeCapturePolicy(capturePolicy, this.kind, {
      diagnostic: metadata.type === 'diagnosis',
      plannedRequests: this.totalRequests
    });
    this.detailCaptureTruncated = false;
    this.detailCaptureTruncationReason = '';
    this.recordCount = 0;
    this.setMetadata('schemaVersion', RESULT_STORE_SCHEMA_VERSION);
    this.setMetadata('runId', this.runId);
    this.setMetadata('kind', this.kind);
    this.setMetadata('plannedRequests', this.totalRequests);
    this.setMetadata('capturePolicy', this.capturePolicy);
    this.setMetadata('runMetadata', metadata);
    this.db.exec('BEGIN IMMEDIATE');
    this.insertStatement = this.db.prepare(`
      INSERT INTO samples (
        kind, result_index, iteration, request_id, request_name, request_display_name,
        request_method, request_url, final_url, folder_name, runner_iteration, runner_iterations,
        phase, stage_name, stage_index, stage_concurrency, scheduler_lag_millis, started_at,
        status_code, status_filter, duration_millis, response_bytes, body_sha256, passed, error,
        response_body, response_headers_json, timings_json, pre_request_json, post_request_json,
        after_response_json, message_scripts_json, local_variables_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
  }

  recordRunnerResult(result, context = {}) {
    this.recordSample('runner', result, context);
  }

  recordPerformanceSample(sample, context = {}) {
    this.recordSample('performance', sample, context);
  }

  recordSample(kind, rawSample, context = {}) {
    this.assertOpen();
    if (!this.insertStatement) {
      throw new Error('Result store run has not started.');
    }
    const contextIndex = context.index == null || context.index === ''
      ? NaN
      : Number(context.index);
    const resultIndex = Number.isFinite(contextIndex)
      ? Math.max(0, Math.floor(contextIndex))
      : this.recordCount;
    const policy = this.detailCaptureTruncated ? detailTruncatedPolicy(this.capturePolicy) : this.capturePolicy;
    const sample = applyCapturePolicyToResult(rawSample, policy, {
      index: resultIndex,
      totalRequests: context.totalRequests || this.totalRequests
    });
    this.insertStatement.run(
      kind,
      resultIndex,
      optionalNumber(sample.iteration),
      stringValue(sample.requestId),
      stringValue(sample.requestName),
      stringValue(sample.requestDisplayName),
      stringValue(sample.requestMethod),
      stringValue(sample.requestUrl),
      stringValue(sample.finalUrl),
      stringValue(sample.folderName),
      optionalNumber(sample.runnerIteration),
      optionalNumber(sample.runnerIterations),
      stringValue(sample.phase),
      stringValue(sample.stageName),
      optionalNumber(sample.stageIndex),
      optionalNumber(sample.stageConcurrency),
      optionalNumber(sample.schedulerLagMillis),
      stringValue(sample.startedAt),
      optionalNumber(sample.statusCode),
      statusFilter(sample),
      optionalNumber(sample.durationMillis),
      optionalNumber(sample.responseBytes),
      stringValue(sample.bodySha256),
      sample.passed === true ? 1 : 0,
      stringValue(sample.error),
      optionalString(sample.responseBody),
      jsonOrNull(sample.responseHeaders),
      jsonOrNull(sample.timings),
      jsonOrNull(sample.preRequestScriptResult),
      jsonOrNull(sample.testScriptResult),
      jsonOrNull(sample.afterResponseScriptResult),
      jsonOrNull(sample.messageScriptResults),
      jsonOrNull(sample.localVariables)
    );
    this.recordCount += 1;
    this.checkDetailBudget();
  }

  finishRun(summary = {}) {
    this.assertOpen();
    if (this.insertStatement) {
      this.db.exec('COMMIT');
      this.insertStatement = null;
    }
    this.setMetadata('completedAt', new Date().toISOString());
    this.setMetadata('summary', {
      ...summary,
      detailCaptureTruncated: this.detailCaptureTruncated,
      detailCaptureTruncationReason: this.detailCaptureTruncationReason
    });
  }

  failRun(summary = {}) {
    if (!this.db) {
      return;
    }
    if (this.insertStatement) {
      try {
        this.db.exec('COMMIT');
      } catch {
        try {
          this.db.exec('ROLLBACK');
        } catch {}
      }
      this.insertStatement = null;
    }
    this.setMetadata('failedAt', new Date().toISOString());
    this.setMetadata('summary', summary);
  }

  page({ kind = this.kind, status = 'all', offset = 0, limit = 50 } = {}) {
    this.assertOpen();
    const normalizedKind = normalizeKind(kind || this.kind);
    const normalizedStatus = normalizeStatusFilter(status);
    const normalizedOffset = Math.max(0, Math.floor(Number(offset || 0)));
    const normalizedLimit = Math.min(PAGE_LIMIT_MAX, Math.max(1, Math.floor(Number(limit || 50))));
    const where = normalizedStatus === 'all'
      ? 'kind = ?'
      : 'kind = ? AND status_filter = ?';
    const params = normalizedStatus === 'all' ? [normalizedKind] : [normalizedKind, normalizedStatus];
    const total = this.db.prepare(`SELECT COUNT(*) AS count FROM samples WHERE ${where}`).get(...params).count || 0;
    const rows = this.db.prepare(`
      SELECT * FROM samples
      WHERE ${where}
      ORDER BY result_index ASC
      LIMIT ? OFFSET ?
    `).all(...params, normalizedLimit, normalizedOffset);
    return {
      runId: this.runId,
      kind: normalizedKind,
      offset: normalizedOffset,
      limit: normalizedLimit,
      total,
      totalAll: this.count(normalizedKind),
      statusCounts: this.statusCounts(normalizedKind),
      items: rows.map(rowToResult)
    };
  }

  detail({ kind = this.kind, resultIndex = 0 } = {}) {
    this.assertOpen();
    const row = this.db.prepare('SELECT * FROM samples WHERE kind = ? AND result_index = ?')
      .get(normalizeKind(kind || this.kind), Math.max(0, Math.floor(Number(resultIndex || 0))));
    return row ? rowToResult(row) : null;
  }

  count(kind = this.kind) {
    this.assertOpen();
    return this.db.prepare('SELECT COUNT(*) AS count FROM samples WHERE kind = ?').get(normalizeKind(kind || this.kind)).count || 0;
  }

  statusCounts(kind = this.kind) {
    this.assertOpen();
    const rows = this.db.prepare(`
      SELECT status_filter AS status, COUNT(*) AS count
      FROM samples
      WHERE kind = ?
      GROUP BY status_filter
      ORDER BY status_filter
    `).all(normalizeKind(kind || this.kind));
    return rows.reduce((counts, row) => {
      counts[row.status || 'ERR'] = row.count || 0;
      return counts;
    }, {});
  }

  metadata() {
    this.assertOpen();
    const rows = this.db.prepare('SELECT key, value FROM metadata').all();
    return rows.reduce((metadata, row) => {
      metadata[row.key] = parseJson(row.value);
      return metadata;
    }, {});
  }

  async exportCsv(filePath, { kind = this.kind, result = {} } = {}) {
    this.assertOpen();
    const output = fs.createWriteStream(filePath, { encoding: 'utf8' });
    const normalizedKind = normalizeKind(kind || this.kind);
    await writeStreamLine(output, csvRow(['metric', 'value']));
    for (const row of resultMetricRows(result, this.metadata())) {
      await writeStreamLine(output, csvRow(row));
    }
    if (normalizedKind === 'performance') {
      await writePerformanceDiagnosisCsv(output, result);
    }
    await writeStreamLine(output, '');
    const columns = [
      'index', 'iteration', 'phase', 'stageName', 'stageConcurrency', 'requestId', 'requestName',
      'requestMethod', 'requestUrl', 'finalUrl', 'folderName', 'startedAt', 'statusCode',
      'durationMillis', 'schedulerLagMillis', 'responseBytes', 'bodySha256', 'passed', 'error',
      'responseBody', 'responseHeaders', 'timings', 'preRequest', 'postRequest', 'localVariables'
    ];
    await writeStreamLine(output, csvRow(columns));
    const stmt = this.db.prepare('SELECT * FROM samples WHERE kind = ? ORDER BY result_index ASC LIMIT ? OFFSET ?');
    let offset = 0;
    while (true) {
      const rows = stmt.all(normalizedKind, 1000, offset);
      if (!rows.length) {
        break;
      }
      for (const row of rows) {
        const item = rowToResult(row);
        await writeStreamLine(output, csvRow([
          item.resultIndex,
          item.iteration || '',
          item.phase || '',
          item.stageName || '',
          item.stageConcurrency || '',
          item.requestId || '',
          item.requestName || '',
          item.requestMethod || '',
          item.requestUrl || '',
          item.finalUrl || '',
          item.folderName || '',
          item.startedAt || '',
          item.statusCode || 0,
          item.durationMillis || 0,
          item.schedulerLagMillis || '',
          item.responseBytes || 0,
          item.bodySha256 || '',
          item.passed === true,
          item.error || '',
          item.responseBody || '',
          item.responseHeaders ? JSON.stringify(item.responseHeaders) : '',
          item.timings ? JSON.stringify(item.timings) : '',
          item.preRequestScriptResult ? JSON.stringify(item.preRequestScriptResult) : '',
          item.testScriptResult ? JSON.stringify(item.testScriptResult) : '',
          item.localVariables ? JSON.stringify(item.localVariables) : ''
        ]));
      }
      offset += rows.length;
    }
    await endStream(output);
  }

  async exportJson(filePath, { kind = this.kind, result = {} } = {}) {
    this.assertOpen();
    const output = fs.createWriteStream(filePath, { encoding: 'utf8' });
    await writeStreamLine(output, '{');
    await writeStreamLine(output, `"metadata":${JSON.stringify(this.metadata())},`);
    await writeStreamLine(output, `"result":${JSON.stringify(result)},`);
    await writeStreamLine(output, '"items":[');
    const stmt = this.db.prepare('SELECT * FROM samples WHERE kind = ? ORDER BY result_index ASC LIMIT ? OFFSET ?');
    const normalizedKind = normalizeKind(kind || this.kind);
    let offset = 0;
    let first = true;
    while (true) {
      const rows = stmt.all(normalizedKind, 1000, offset);
      if (!rows.length) {
        break;
      }
      for (const row of rows) {
        await writeStreamLine(output, `${first ? '' : ','}${JSON.stringify(rowToResult(row))}`);
        first = false;
      }
      offset += rows.length;
    }
    await writeStreamLine(output, ']');
    await writeStreamLine(output, '}');
    await endStream(output);
  }

  async exportHtml(filePath, options = {}) {
    this.assertOpen();
    const output = fs.createWriteStream(filePath, { encoding: 'utf8' });
    const { kind = this.kind, result = {} } = options || {};
    const normalizedKind = normalizeKind(kind || this.kind);
    const metadata = this.metadata();
    const store = this;
    try {
      await writeResultHtmlReport(output, {
        kind: normalizedKind,
        result,
        metadata,
        theme: options.theme,
        includeRequestResults: options.includeRequestResults,
        includeRequestDetails: options.includeRequestDetails,
        items: async function* items() {
          const stmt = store.db.prepare('SELECT * FROM samples WHERE kind = ? ORDER BY result_index ASC LIMIT ? OFFSET ?');
          let offset = 0;
          while (true) {
            const rows = stmt.all(normalizedKind, 1000, offset);
            if (!rows.length) {
              break;
            }
            for (const row of rows) {
              yield rowToResult(row);
            }
            offset += rows.length;
          }
        }
      });
    } catch (error) {
      output.destroy();
      throw error;
    }
    await endStream(output);
  }

  close() {
    if (!this.db) {
      return;
    }
    if (this.insertStatement) {
      try {
        this.db.exec('COMMIT');
      } catch {
        try {
          this.db.exec('ROLLBACK');
        } catch {}
      }
      this.insertStatement = null;
    }
    this.db.close();
    this.db = null;
  }

  setMetadata(key, value) {
    this.assertOpen();
    this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)')
      .run(String(key), JSON.stringify(value == null ? null : value));
  }

  checkDetailBudget() {
    if (this.detailCaptureTruncated || this.recordCount % DETAIL_CHECK_INTERVAL !== 0) {
      return;
    }
    const budget = Number(this.capturePolicy?.resultFileBudgetBytes || 0);
    if (!budget) {
      return;
    }
    let size = 0;
    try {
      size = fs.statSync(this.filePath).size;
    } catch {
      return;
    }
    if (size >= budget) {
      this.detailCaptureTruncated = true;
      this.detailCaptureTruncationReason = 'Result file size budget reached.';
      this.setMetadata('detailCaptureTruncated', true);
      this.setMetadata('detailCaptureTruncationReason', this.detailCaptureTruncationReason);
    }
  }

  assertOpen() {
    if (!this.db) {
      throw new Error('Result store is not open.');
    }
  }
}

function createRuntimeResultStore(filePath) {
  return new RuntimeResultStore(filePath);
}

function runtimeResultStoreFiles(filePath) {
  const resolved = path.resolve(filePath);
  return [
    resolved,
    `${resolved}-journal`,
    `${resolved}-wal`,
    `${resolved}-shm`
  ];
}

async function cleanupRuntimeResultStore(filePath) {
  for (const candidate of runtimeResultStoreFiles(filePath)) {
    await fsp.rm(candidate, { force: true }).catch(() => {});
  }
}

function cleanupRuntimeResultStoreSync(filePath) {
  for (const candidate of runtimeResultStoreFiles(filePath)) {
    try {
      fs.rmSync(candidate, { force: true });
    } catch {}
  }
}

function estimateRuntimeResultStoreSize(options = {}) {
  const kind = normalizeKind(options.kind || 'runner');
  const plannedRequests = Math.max(0, Math.floor(Number(options.plannedRequests || 0)));
  const averageMetadataBytes = Math.min(4096, Math.max(0, Math.floor(Number(options.averageMetadataBytes || 0))));
  const policy = normalizeCapturePolicy(options.capturePolicy || {}, kind, {
    diagnostic: options.diagnostic === true,
    plannedRequests
  });
  const rowBytes = ESTIMATE_CORE_ROW_BYTES + averageMetadataBytes;
  const coreBytes = ESTIMATE_BASE_BYTES + plannedRequests * rowBytes;
  const bodyRows = estimateBodyCaptureRows(policy, plannedRequests);
  const bodyBytes = bodyRows * Math.max(0, Number(policy.bodyPreviewBytes || 0));
  const scriptBytes = plannedRequests * (
    (policy.preRequestOutput === true ? ESTIMATE_SCRIPT_RESULT_BYTES : 0)
    + (policy.postRequestOutput === true ? ESTIMATE_SCRIPT_RESULT_BYTES : 0)
    + (policy.scriptLogs === true ? ESTIMATE_SCRIPT_LOG_BYTES : 0)
  );
  const localVariableBytes = policy.localVariables === true ? plannedRequests * ESTIMATE_LOCAL_VARIABLE_BYTES : 0;
  const responseHeaderBytes = policy.responseHeaders === true ? plannedRequests * ESTIMATE_RESPONSE_HEADERS_BYTES : 0;
  const timingBytes = policy.transportTimings === true ? plannedRequests * ESTIMATE_TRANSPORT_TIMINGS_BYTES : 0;
  const optionalBytes = bodyBytes + scriptBytes + localVariableBytes + responseHeaderBytes + timingBytes;
  const detailBudget = Math.max(0, Number(policy.resultFileBudgetBytes || 0));
  const cappedOptionalBytes = detailBudget ? Math.min(optionalBytes, detailBudget) : optionalBytes;
  const estimatedBytes = Math.ceil((coreBytes + cappedOptionalBytes) * ESTIMATE_SQLITE_MULTIPLIER);
  return {
    kind,
    plannedRequests,
    estimatedBytes,
    averageMetadataBytes,
    capturePolicy: policy,
    estimatedCoreBytes: Math.ceil(coreBytes * ESTIMATE_SQLITE_MULTIPLIER),
    estimatedOptionalBytes: Math.ceil(cappedOptionalBytes * ESTIMATE_SQLITE_MULTIPLIER),
    estimateNotes: [
      'Estimated before execution from planned request count, capture settings, request metadata length, and SQLite row/index overhead.',
      'Response body and script output sizes are conservative estimates because actual endpoint responses are not known until the run starts.'
    ]
  };
}

function estimateBodyCaptureRows(policy = {}, plannedRequests = 0) {
  const total = Math.max(0, Number(plannedRequests || 0));
  if (!total || policy.responseBody === 'none' || Number(policy.bodyPreviewBytes || 0) <= 0) {
    return 0;
  }
  if (policy.responseBody === 'all' || policy.responseBody === 'failed') {
    return total;
  }
  if (policy.responseBody === 'sampled') {
    return Math.min(total, Math.max(0, Number(policy.maxBodyPreviews || 0)));
  }
  return total;
}

function detailTruncatedPolicy(policy = {}) {
  return {
    ...policy,
    responseBody: 'none',
    preRequestOutput: false,
    postRequestOutput: false,
    scriptLogs: false,
    localVariables: false,
    responseHeaders: false,
    transportTimings: false
  };
}

function rowToResult(row = {}) {
  return {
    resultIndex: Number(row.result_index || 0),
    iteration: optionalRowNumber(row.iteration),
    requestId: row.request_id || '',
    requestName: row.request_name || '',
    requestDisplayName: row.request_display_name || '',
    requestMethod: row.request_method || '',
    requestUrl: row.request_url || '',
    finalUrl: row.final_url || '',
    folderName: row.folder_name || '',
    runnerIteration: optionalRowNumber(row.runner_iteration),
    runnerIterations: optionalRowNumber(row.runner_iterations),
    phase: row.phase || '',
    stageName: row.stage_name || '',
    stageIndex: optionalRowNumber(row.stage_index),
    stageConcurrency: optionalRowNumber(row.stage_concurrency),
    schedulerLagMillis: optionalRowNumber(row.scheduler_lag_millis),
    startedAt: row.started_at || '',
    statusCode: optionalRowNumber(row.status_code) || 0,
    durationMillis: optionalRowNumber(row.duration_millis) || 0,
    responseBytes: optionalRowNumber(row.response_bytes) || 0,
    bodySha256: row.body_sha256 || '',
    passed: row.passed === 1,
    error: row.error || '',
    responseBody: row.response_body == null ? undefined : row.response_body,
    responseHeaders: parseNullableJson(row.response_headers_json),
    timings: parseNullableJson(row.timings_json),
    preRequestScriptResult: parseNullableJson(row.pre_request_json),
    testScriptResult: parseNullableJson(row.post_request_json),
    afterResponseScriptResult: parseNullableJson(row.after_response_json),
    messageScriptResults: parseNullableJson(row.message_scripts_json),
    localVariables: parseNullableJson(row.local_variables_json)
  };
}

function resultMetricRows(result = {}, metadata = {}) {
  return [
    ['runId', result.id || metadata.runId || ''],
    ['kind', metadata.kind || ''],
    ['totalRequests', result.totalRequests || result.completedRequests || metadata.plannedRequests || 0],
    ['completedRequests', result.completedRequests || result.totalRequests || 0],
    ['passedRequests', result.passedRequests ?? result.successfulRequests ?? ''],
    ['failedRequests', result.failedRequests || 0],
    ['passed', result.passed === true],
    ['cancelled', result.cancelled === true],
    ['detailCaptureTruncated', result.detailCaptureTruncated === true],
    ['capturePolicy', JSON.stringify(result.capturePolicy || metadata.capturePolicy || {})]
  ];
}

async function writePerformanceDiagnosisCsv(output, result = {}) {
  const diagnosis = result.summary?.diagnosis;
  if (!diagnosis) {
    return;
  }
  await writeStreamLine(output, '');
  await writeStreamLine(output, csvRow(['diagnosticGroup', 'diagnostic', 'status', 'value', 'details']));
  for (const check of diagnosis.checks || []) {
    await writeStreamLine(output, csvRow([
      check.group || '',
      check.label || check.id || '',
      check.status || '',
      check.value || '',
      check.details || ''
    ]));
  }
  await writeStreamLine(output, '');
  await writeStreamLine(output, csvRow(['phase', 'requests', 'concurrency', 'successfulResponses', 'failedResponses', 'averageDurationMillis', 'p95DurationMillis', 'requestsPerSecond']));
  for (const phase of diagnosis.phases || []) {
    await writeStreamLine(output, csvRow([
      phase.phase || '',
      phase.requests || 0,
      phase.concurrency || 0,
      phase.successfulResponses || 0,
      phase.failedResponses || 0,
      phase.averageDurationMillis || 0,
      phase.p95DurationMillis || 0,
      phase.requestsPerSecond || 0
    ]));
  }
}

function normalizeKind(kind) {
  return kind === 'performance' ? 'performance' : 'runner';
}

function normalizeStatusFilter(status) {
  const normalized = String(status || 'all').trim();
  return normalized || 'all';
}

function statusFilter(sample = {}) {
  const statusCode = Number(sample.statusCode || 0);
  if (Number.isInteger(statusCode) && statusCode > 0) {
    return String(statusCode);
  }
  return 'ERR';
}

function stringValue(value) {
  return value == null ? '' : String(value);
}

function optionalString(value) {
  return value == null ? null : String(value);
}

function optionalNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function optionalRowNumber(value) {
  return value == null ? undefined : Number(value);
}

function jsonOrNull(value) {
  if (value == null) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseNullableJson(value) {
  if (value == null || value === '') {
    return undefined;
  }
  return parseJson(value);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values) {
  return values.map(csvValue).join(',');
}

function writeStreamLine(stream, line) {
  return new Promise((resolve, reject) => {
    stream.write(`${line}\n`, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function endStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  DEFAULT_RESULT_STORE_FILENAME,
  RESULT_STORE_SCHEMA_VERSION,
  RuntimeResultStore,
  cleanupRuntimeResultStore,
  cleanupRuntimeResultStoreSync,
  createRuntimeResultStore,
  defaultRuntimeResultStorePath,
  estimateRuntimeResultStoreSize,
  runtimeResultStoreFiles
};
