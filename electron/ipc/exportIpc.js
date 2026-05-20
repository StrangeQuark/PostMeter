const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { writeTextFileAtomic } = require('../../src/core/workspace/workspacePersistence');
const { assertRuntimeId } = require('../../src/core/contracts/ipcValidation');
const {
  collectionExportExtension,
  collectionExportFilters,
  jsonFilters,
  performanceExportExtension,
  performanceExportFilters,
  requestExportExtension,
  requestExportFilters,
  safeFilename,
  selectedSaveFilePath,
  validateDialogFilePath
} = require('../app-shell/fileDialogs');

const EXPORT_KINDS = new Set(['workspace', 'collection', 'request', 'environment', 'runner', 'performance']);

function registerExportIpc(options = {}) {
  const {
    dialog,
    fileOperationResult = (result) => result,
    getMainWindow = () => undefined,
    ipcMain
  } = options;
  const activePreparations = new Map();
  const preparedExports = new Map();

  ipcMain.handle('file-export:choosePath', async (_event, exportOptions = {}) => {
    const options = exportDialogOptions(exportOptions);
    const result = await dialog.showSaveDialog(getMainWindow(), options);
    const filePath = selectedSaveFilePath(result);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    return fileOperationResult({ cancelled: false, path: filePath });
  });

  ipcMain.handle('file-export:prepare', async (_event, exportRequest = {}) => {
    const exportId = assertExportId(exportRequest.exportId);
    const kind = assertExportKind(exportRequest.kind);
    const format = String(exportRequest.format || 'postmeter');
    if (activePreparations.has(exportId) || preparedExports.has(exportId)) {
      throw new Error('Export preparation id is already in use.');
    }
    const worker = new Worker(path.join(__dirname, '..', 'workers', 'exportPreparationWorker.js'), {
      workerData: {
        kind,
        format,
        payload: exportRequest.payload
      }
    });
    return await new Promise((resolve, reject) => {
      const entry = {
        worker,
        settled: false,
        finish(error, result) {
          if (entry.settled) {
            return;
          }
          entry.settled = true;
          activePreparations.delete(exportId);
          if (error) {
            reject(error);
            return;
          }
          preparedExports.set(exportId, {
            content: String(result?.content ?? ''),
            prefix: String(result?.prefix || 'postmeter-export')
          });
          resolve({ exportId });
        }
      };
      activePreparations.set(exportId, entry);
      worker.once('message', (message) => {
        if (message?.error) {
          entry.finish(errorFromWorkerMessage(message.error));
          return;
        }
        entry.finish(null, message);
      });
      worker.once('error', (error) => {
        entry.finish(error);
      });
      worker.once('exit', (code) => {
        if (!entry.settled && code !== 0) {
          entry.finish(new Error(`Export preparation worker exited with code ${code}.`));
        }
      });
    });
  });

  ipcMain.handle('file-export:writePrepared', async (_event, exportIdValue, filePathValue) => {
    const exportId = assertExportId(exportIdValue);
    const filePath = validateDialogFilePath(filePathValue, 'export path');
    const prepared = preparedExports.get(exportId);
    if (!prepared) {
      throw new Error('Prepared export was not found.');
    }
    preparedExports.delete(exportId);
    await writeTextFileAtomic(filePath, prepared.content, { prefix: prepared.prefix });
    return fileOperationResult({ cancelled: false, path: filePath });
  });

  ipcMain.handle('file-export:cancelPrepared', async (_event, exportIdValue) => {
    const exportId = assertExportId(exportIdValue);
    let cancelled = false;
    const active = activePreparations.get(exportId);
    if (active) {
      cancelled = true;
      active.finish(new Error('Export preparation cancelled.'));
      try {
        await active.worker.terminate();
      } catch {
        // Best-effort cleanup. The active preparation was already rejected.
      }
    }
    if (preparedExports.delete(exportId)) {
      cancelled = true;
    }
    return cancelled;
  });
}

function exportDialogOptions(options = {}) {
  const kind = assertExportKind(options.kind);
  const format = String(options.format || 'postmeter');
  const name = safeFilename(options.name || defaultExportName(kind));
  switch (kind) {
    case 'workspace':
      return {
        title: 'Export PostMeter Workspace',
        defaultPath: `${name}.postmeter.json`,
        filters: jsonFilters()
      };
    case 'collection': {
      assertCollectionExportFormat(format);
      const extension = collectionExportExtension(format);
      return {
        title: 'Export Collection',
        defaultPath: `${name}.${extension}`,
        filters: collectionExportFilters(format)
      };
    }
    case 'request': {
      assertRequestExportFormat(format);
      const extension = requestExportExtension(format);
      return {
        title: 'Export Request',
        defaultPath: `${name}.${extension}`,
        filters: requestExportFilters(format)
      };
    }
    case 'environment':
      assertEnvironmentExportFormat(format);
      return {
        title: 'Export Environment',
        defaultPath: `${name}.${environmentExportExtension(format)}`,
        filters: [
          { name: `${format === 'postman' ? 'Postman' : 'PostMeter'} Environment`, extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      };
    case 'runner':
      if (format !== 'postmeter') {
        throw new Error('Runner definitions can only be exported as PostMeter JSON.');
      }
      return {
        title: 'Export Runner',
        defaultPath: `${name}.postmeter-runner.json`,
        filters: [
          { name: 'PostMeter Runner', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      };
    case 'performance':
      assertPerformanceExportFormat(format);
      if (format === 'csv' || format === 'html') {
        throw new Error('Performance test definitions can only be exported as JSON.');
      }
      return {
        title: 'Export Performance Test',
        defaultPath: `${name}.postmeter-performance.${performanceExportExtension(format)}`,
        filters: performanceExportFilters(format)
      };
    default:
      throw new Error('Unsupported export kind.');
  }
}

function assertExportId(value) {
  assertRuntimeId(value, 'exportId');
  return value;
}

function assertExportKind(value) {
  const kind = String(value || '');
  if (!EXPORT_KINDS.has(kind)) {
    throw new Error('Export kind must be workspace, collection, request, environment, runner, or performance.');
  }
  return kind;
}

function assertCollectionExportFormat(format) {
  if (!['postmeter', 'postman', 'openapi', 'curl'].includes(String(format || ''))) {
    throw new Error('Collection export format must be postmeter, postman, openapi, or curl.');
  }
}

function assertPerformanceExportFormat(format) {
  if (!['postmeter', 'json', 'csv', 'html'].includes(String(format || ''))) {
    throw new Error('Performance export format must be postmeter, json, csv, or html.');
  }
}

function assertRequestExportFormat(format) {
  if (!['postmeter', 'curl'].includes(String(format || ''))) {
    throw new Error('Request export format must be postmeter or curl.');
  }
}

function assertEnvironmentExportFormat(format) {
  if (!['postmeter', 'postman'].includes(String(format || ''))) {
    throw new Error('Environment export format must be postmeter or postman.');
  }
}

function environmentExportExtension(format) {
  return format === 'postman' ? 'postman_environment.json' : 'postmeter-environment.json';
}

function defaultExportName(kind) {
  return {
    workspace: 'postmeter-workspace',
    collection: 'collection',
    request: 'request',
    environment: 'environment',
    runner: 'runner',
    performance: 'performance-test'
  }[kind] || 'postmeter-export';
}

function errorFromWorkerMessage(message = {}) {
  const error = new Error(message.message || 'Export preparation failed.');
  if (typeof message.name === 'string' && message.name && message.name !== 'Error') {
    error.name = message.name;
  }
  if (typeof message.code === 'string' && message.code) {
    error.code = message.code;
  }
  return error;
}

module.exports = {
  exportDialogOptions,
  registerExportIpc
};
