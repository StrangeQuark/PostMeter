const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'autoUpdateService', () => require('../../services/autoUpdateService'));
defineLazyModule(modules, 'exportPreparationWorker', () => require('../../workers/exportPreparationWorker'));
defineLazyModule(modules, 'oauthFlows', () => require('../../services/oauthFlows'));
defineLazyModule(modules, 'sessionStore', () => require('../../services/sessionStore'));
defineLazyModule(modules, 'workspaceMutations', () => require('../../services/workspaceMutations'));

module.exports = modules;
