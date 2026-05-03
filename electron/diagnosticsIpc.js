const {
  exportDiagnosticBundle,
  redactText,
  sanitizeDiagnosticErrorCode
} = require('../src/core/diagnostics');
const { jsonFilters, selectedSaveFilePath } = require('./fileDialogs');

function registerDiagnosticsIpc(options = {}) {
  const {
    dialog,
    exportBundle = exportDiagnosticBundle,
    fileOperationResult,
    getAppInfo = () => ({}),
    getMainWindow = () => undefined,
    getWorkspace = () => ({}),
    ipcMain,
    logger,
    waitForPendingWorkspaceOperations = async () => {}
  } = options;

  ipcMain.handle('diagnostics:export', async () => {
    await waitForPendingWorkspaceOperations();
    const saveResult = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Local Diagnostics',
      defaultPath: 'postmeter-diagnostics.json',
      filters: jsonFilters()
    });
    const filePath = selectedSaveFilePath(saveResult);
    if (!filePath) {
      return fileOperationResult({ cancelled: true });
    }
    let exportedPath;
    try {
      exportedPath = await exportBundle({
        appInfo: getAppInfo(),
        logger,
        targetPath: filePath,
        workspace: getWorkspace()
      });
    } catch (error) {
      throw redactedDiagnosticsExportError(error);
    }
    return fileOperationResult({ cancelled: false, path: exportedPath });
  });
}

function redactedDiagnosticsExportError(error) {
  const message = redactText(error?.message || String(error || 'Diagnostics export failed.')) || 'Diagnostics export failed.';
  const sanitized = new Error(message);
  const code = sanitizeDiagnosticErrorCode(error?.code);
  if (code) {
    sanitized.code = code;
  }
  return sanitized;
}

module.exports = {
  redactedDiagnosticsExportError,
  registerDiagnosticsIpc
};
