const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'packagedSandboxRuntimeCli', () => require('../../packaging/packagedSandboxRuntimeCli'));
defineLazyModule(modules, 'packagedStartupSmokeNode', () => require('../../packaging/packagedStartupSmokeNode'));

module.exports = modules;
