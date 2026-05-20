const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'appMenu', () => require('../../app-shell/appMenu'));
defineLazyModule(modules, 'appProtocol', () => require('../../app-shell/appProtocol'));
defineLazyModule(modules, 'fileDialogs', () => require('../../app-shell/fileDialogs'));
defineLazyModule(modules, 'mainDiagnostics', () => require('../../app-shell/mainDiagnostics'));
defineLazyModule(modules, 'mainWindow', () => require('../../app-shell/mainWindow'));

module.exports = modules;
