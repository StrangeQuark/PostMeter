const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'ipcValidation', () => require('../../contracts/ipcValidation'));

module.exports = modules;
