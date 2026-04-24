function jsonFilters() {
  return [
    { name: 'JSON', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function collectionImportFilters() {
  return [
    { name: 'API Collections', extensions: ['json', 'yaml', 'yml', 'har', 'jmx', 'sh', 'txt'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function collectionExportExtension(format) {
  return {
    postmeter: 'json',
    openapi: 'openapi.json',
    jmeter: 'jmx',
    curl: 'sh',
    har: 'har'
  }[format] || 'json';
}

function collectionExportFilters(format) {
  const extension = collectionExportExtension(format).split('.').at(-1);
  return [
    { name: `${format.toUpperCase()} Collection`, extensions: [extension] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

function safeFilename(value) {
  const filename = String(value || 'collection').trim().replace(/[^A-Za-z0-9._-]+/g, '-');
  return filename || 'collection';
}

module.exports = {
  collectionExportExtension,
  collectionExportFilters,
  collectionImportFilters,
  jsonFilters,
  safeFilename
};
