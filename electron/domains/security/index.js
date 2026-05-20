const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'appProtocol', () => require('../../app-shell/appProtocol'));
defineLazyModule(modules, 'ipcSecurity', () => require('../../security/ipcSecurity'));

module.exports = modules;
