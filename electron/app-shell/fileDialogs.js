function jsonFilters() {
  return [
    { name: 'JSON', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function collectionImportFilters() {
  return [
    { name: 'API Collections', extensions: ['json', 'yaml', 'yml', 'sh'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function collectionExportExtension(format) {
  return {
    postmeter: 'json',
    postman: 'postman_collection.json',
    openapi: 'openapi.json',
    curl: 'sh'
  }[format] || 'json';
}

function collectionExportFilters(format) {
  const extension = collectionExportExtension(format).split('.').at(-1);
  return [
    { name: `${format.toUpperCase()} Collection`, extensions: [extension] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function requestImportFilters() {
  return [
    { name: 'Requests', extensions: ['json', 'sh', 'txt'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function requestExportExtension(format) {
  return format === 'curl' ? 'sh' : 'postmeter-request.json';
}

function requestExportFilters(format) {
  const normalized = String(format || 'postmeter');
  const extension = requestExportExtension(normalized).split('.').at(-1);
  return [
    { name: `${normalized === 'curl' ? 'curl' : 'PostMeter'} Request`, extensions: [extension] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function performanceImportFilters() {
  return [
    { name: 'PostMeter Performance Tests', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function performanceExportExtension(format) {
  if (format === 'csv') {
    return 'csv';
  }
  if (format === 'html') {
    return 'html';
  }
  return 'json';
}

function performanceExportFilters(format) {
  const extension = performanceExportExtension(format);
  return [
    { name: `${String(format || 'postmeter').toUpperCase()} Performance`, extensions: [extension] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function safeFilename(value) {
  const filename = String(value || 'collection').trim().replace(/[^A-Za-z0-9._-]+/g, '-');
  return filename || 'collection';
}

function selectedOpenFilePath(result) {
  if (result?.canceled === true || result?.cancelled === true) {
    return '';
  }
  if (!Array.isArray(result?.filePaths) || result.filePaths.length === 0) {
    return '';
  }
  return validateDialogFilePath(result.filePaths[0], 'open dialog selected path');
}

function selectedSaveFilePath(result) {
  if (result?.canceled === true || result?.cancelled === true || result?.filePath == null) {
    return '';
  }
  return validateDialogFilePath(result.filePath, 'save dialog selected path');
}

function validateDialogFilePath(value, label = 'dialog selected path') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value.includes('\0')) {
    throw new Error(`${label} must not contain null bytes.`);
  }
  return value;
}

module.exports = {
  collectionExportExtension,
  collectionExportFilters,
  collectionImportFilters,
  jsonFilters,
  performanceExportExtension,
  performanceExportFilters,
  performanceImportFilters,
  requestExportExtension,
  requestExportFilters,
  requestImportFilters,
  safeFilename,
  selectedOpenFilePath,
  selectedSaveFilePath,
  validateDialogFilePath
};
