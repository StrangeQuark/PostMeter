const { parentPort, workerData } = require('node:worker_threads');
const { exportCollectionByFormat } = require('../src/core/collectionImportRegistry');
const { exportEnvironmentToJson } = require('../src/core/environmentFormats');
const { performanceTestModel, requestModel, runnerModel, workspaceModel } = require('../src/core/models');
const { exportPerformanceTestToJson } = require('../src/core/performanceFormats');
const { exportRequestByFormat } = require('../src/core/requestFormats');
const { exportRunnerToJson } = require('../src/core/runnerFormats');
const {
  assertCollectionExportFormat,
  assertCollectionPayload,
  assertEnvironmentPayload,
  assertPerformanceExportFormat,
  assertPerformanceTestPayload,
  assertRequestPayload,
  assertRunnerPayload,
  assertWorkspacePayload
} = require('../src/core/ipcValidation');

try {
  parentPort.postMessage(prepareExport(workerData || {}));
} catch (error) {
  parentPort.postMessage({
    error: {
      message: error?.message || String(error || 'Export preparation failed.'),
      name: error?.name || 'Error',
      code: error?.code || ''
    }
  });
}

function prepareExport({ kind, format = 'postmeter', payload }) {
  switch (kind) {
    case 'workspace':
      return prepareWorkspaceExport(payload);
    case 'collection':
      return prepareCollectionExport(payload, format);
    case 'request':
      return prepareRequestExport(payload, format);
    case 'environment':
      return prepareEnvironmentExport(payload, format);
    case 'runner':
      return prepareRunnerExport(payload, format);
    case 'performance':
      return preparePerformanceExport(payload, format);
    default:
      throw new Error('Unsupported export kind.');
  }
}

function prepareWorkspaceExport(workspace) {
  assertWorkspacePayload(workspace);
  return {
    content: JSON.stringify(workspaceModel(workspace), null, 2),
    prefix: 'postmeter-workspace-export'
  };
}

function prepareCollectionExport(collection, format) {
  assertCollectionPayload(collection);
  assertCollectionExportFormat(format);
  const workspace = workspaceModel({
    collections: [collection],
    environments: [],
    globals: [],
    cookies: [],
    runners: [],
    performanceTests: [],
    history: []
  });
  return {
    content: exportCollectionByFormat(workspace.collections[0], format, workspace),
    prefix: 'postmeter-collection-export'
  };
}

function prepareRequestExport(request, format) {
  assertRequestPayload(request);
  assertRequestExportFormat(format);
  return {
    content: exportRequestByFormat(requestModel(request), format),
    prefix: 'postmeter-request-export'
  };
}

function prepareEnvironmentExport(environment, format) {
  assertEnvironmentPayload(environment);
  assertEnvironmentExportFormat(format);
  return {
    content: exportEnvironmentToJson(environment, format),
    prefix: 'postmeter-environment-export'
  };
}

function prepareRunnerExport(runner, format) {
  assertRunnerPayload(runner);
  if (format !== 'postmeter') {
    throw new Error('Runner definitions can only be exported as PostMeter JSON.');
  }
  return {
    content: exportRunnerToJson(runnerModel(runner)),
    prefix: 'postmeter-runner-definition-export'
  };
}

function preparePerformanceExport(performanceTest, format) {
  assertPerformanceTestPayload(performanceTest);
  assertPerformanceExportFormat(format);
  if (format === 'csv') {
    throw new Error('Performance test definitions can only be exported as JSON.');
  }
  return {
    content: exportPerformanceTestToJson(performanceTestModel(performanceTest)),
    prefix: 'postmeter-performance-export'
  };
}

function assertEnvironmentExportFormat(format) {
  if (!['postmeter', 'postman'].includes(String(format || ''))) {
    throw new Error('Environment export format must be postmeter or postman.');
  }
}

function assertRequestExportFormat(format) {
  if (!['postmeter', 'curl'].includes(String(format || ''))) {
    throw new Error('Request export format must be postmeter or curl.');
  }
}
