const {
  performanceTestModel
} = require('../workspace/models');
const {
  assertPerformanceResultPayload,
  assertPerformanceTestPayload
} = require('../contracts/ipcValidation');

const PERFORMANCE_FORMAT = 'postmeter.performance.v1';

function exportPerformanceTestDocument(performanceTest) {
  assertPerformanceTestPayload(performanceTest);
  return {
    format: PERFORMANCE_FORMAT,
    exportedAt: new Date().toISOString(),
    performanceTest: performanceTestModel(performanceTest)
  };
}

function exportPerformanceTestToJson(performanceTest) {
  return JSON.stringify(exportPerformanceTestDocument(performanceTest), null, 2);
}

function importPerformanceTestDocument(document) {
  const candidate = document?.format === PERFORMANCE_FORMAT
    ? document.performanceTest
    : document?.performanceTest || document;
  assertPerformanceTestPayload(candidate);
  return performanceTestModel(candidate);
}

function importPerformanceTestFromText(content) {
  let document;
  try {
    document = JSON.parse(String(content || ''));
  } catch (error) {
    throw new Error(`Failed to parse performance test JSON: ${error.message}`);
  }
  return importPerformanceTestDocument(document);
}

function performanceResultToCsv(result) {
  assertPerformanceResultPayload(result);
  const rows = [
    ['metric', 'value'],
    ['performanceTestId', result.performanceTestId || ''],
    ['performanceTestName', result.performanceTestName || ''],
    ['type', result.type || ''],
    ['diagnosisScope', result.config?.diagnosisScope || ''],
    ['totalRequests', result.totalRequests || 0],
    ['completedRequests', result.completedRequests || 0],
    ['successfulRequests', result.successfulRequests || 0],
    ['failedRequests', result.failedRequests || 0],
    ['passed', result.passed === true],
    ['cancelled', result.cancelled === true],
    ['durationMillis', result.durationMillis || 0],
    ['requestsPerSecond', result.summary?.requestsPerSecond || 0],
    ['averageDurationMillis', result.summary?.averageDurationMillis || 0],
    ['p95DurationMillis', result.summary?.p95DurationMillis || 0],
    ['diagnosisConfidence', result.summary?.diagnosis?.confidence || ''],
    ['diagnosisConfidenceScore', result.summary?.diagnosis?.confidenceScore || ''],
    ['diagnosisBestObservedRps', result.summary?.diagnosis?.bestObservedRequestsPerSecond || ''],
    ['diagnosisStableRps', result.summary?.diagnosis?.stableRequestsPerSecond || ''],
    ['diagnosisSaturationPoint', result.summary?.diagnosis?.saturationPoint || '']
  ];

  if (result.summary?.diagnosis) {
    rows.push([]);
    rows.push(['diagnosticGroup', 'diagnostic', 'status', 'value', 'details']);
    for (const check of result.summary.diagnosis.checks || []) {
      rows.push([
        check.group || '',
        check.label || check.id || '',
        check.status || '',
        check.value || '',
        check.details || ''
      ]);
    }

    rows.push([]);
    rows.push(['phase', 'requests', 'concurrency', 'successfulResponses', 'failedResponses', 'averageDurationMillis', 'p95DurationMillis', 'requestsPerSecond']);
    for (const phase of result.summary.diagnosis.phases || []) {
      rows.push([
        phase.phase || '',
        phase.requests || 0,
        phase.concurrency || 0,
        phase.successfulResponses || 0,
        phase.failedResponses || 0,
        phase.averageDurationMillis || 0,
        phase.p95DurationMillis || 0,
        phase.requestsPerSecond || 0
      ]);
    }
  }

  rows.push([]);
  rows.push(['iteration', 'phase', 'stageName', 'stageConcurrency', 'requestId', 'requestName', 'startedAt', 'statusCode', 'durationMillis', 'responseBytes', 'passed', 'error']);
  for (const sample of result.samples || []) {
    rows.push([
      sample.iteration || 0,
      sample.phase || '',
      sample.stageName || '',
      sample.stageConcurrency || 0,
      sample.requestId || '',
      sample.requestName || '',
      sample.startedAt || '',
      sample.statusCode || 0,
      sample.durationMillis || 0,
      sample.responseBytes || 0,
      sample.passed === true,
      sample.error || ''
    ]);
  }

  return rows.map((row) => row.map(csvValue).join(',')).join('\n');
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

module.exports = {
  PERFORMANCE_FORMAT,
  exportPerformanceTestDocument,
  exportPerformanceTestToJson,
  importPerformanceTestDocument,
  importPerformanceTestFromText,
  performanceResultToCsv
};
