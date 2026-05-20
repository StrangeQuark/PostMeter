const { defineLazyModule } = require('./lazyExport');

const domains = {};

defineLazyModule(domains, 'appShell', () => require('./app-shell'));
defineLazyModule(domains, 'ipc', () => require('./ipc'));
defineLazyModule(domains, 'packaging', () => require('./packaging'));
defineLazyModule(domains, 'security', () => require('./security'));
defineLazyModule(domains, 'services', () => require('./services'));

module.exports = domains;
