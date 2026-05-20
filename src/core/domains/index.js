const { defineLazyModule } = require('./lazyExport');

const domains = {};

defineLazyModule(domains, 'diagnosticsRelease', () => require('./diagnostics-release'));
defineLazyModule(domains, 'http', () => require('./http'));
defineLazyModule(domains, 'importExport', () => require('./import-export'));
defineLazyModule(domains, 'ipc', () => require('./ipc'));
defineLazyModule(domains, 'runtime', () => require('./runtime'));
defineLazyModule(domains, 'securitySandbox', () => require('./security-sandbox'));
defineLazyModule(domains, 'workspace', () => require('./workspace'));

module.exports = domains;
