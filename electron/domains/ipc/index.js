const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'appIpc', () => require('../../ipc/appIpc'));
defineLazyModule(modules, 'diagnosticsIpc', () => require('../../ipc/diagnosticsIpc'));
defineLazyModule(modules, 'exportIpc', () => require('../../ipc/exportIpc'));
defineLazyModule(modules, 'oauthIpc', () => require('../../ipc/oauthIpc'));
defineLazyModule(modules, 'requestIpc', () => require('../../ipc/requestIpc'));
defineLazyModule(modules, 'runtimeIpc', () => require('../../ipc/runtimeIpc'));
defineLazyModule(modules, 'sandboxPackageIpc', () => require('../../ipc/sandboxPackageIpc'));
defineLazyModule(modules, 'sessionIpc', () => require('../../ipc/sessionIpc'));
defineLazyModule(modules, 'vaultPrompt', () => require('../../ipc/vaultPrompt'));
defineLazyModule(modules, 'workspaceIpc', () => require('../../ipc/workspaceIpc'));

module.exports = modules;
