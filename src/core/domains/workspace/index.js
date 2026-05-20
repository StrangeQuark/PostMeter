const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'appSettingsStore', () => require('../../workspace/appSettingsStore'));
defineLazyModule(modules, 'cookieModel', () => require('../../http/cookieModel'));
defineLazyModule(modules, 'csvVariables', () => require('../../workspace/csvVariables'));
defineLazyModule(modules, 'dynamicVariables', () => require('../../workspace/dynamicVariables'));
defineLazyModule(modules, 'environmentResolver', () => require('../../workspace/environmentResolver'));
defineLazyModule(modules, 'keyboardShortcuts', () => require('../../contracts/keyboardShortcuts'));
defineLazyModule(modules, 'models', () => require('../../workspace/models'));
defineLazyModule(modules, 'requestQueryModel', () => require('../../workspace/requestQueryModel'));
defineLazyModule(modules, 'resultCapturePolicy', () => require('../../workspace/resultCapturePolicy'));
defineLazyModule(modules, 'sessionState', () => require('../../workspace/sessionState'));
defineLazyModule(modules, 'variableScope', () => require('../../workspace/variableScope'));
defineLazyModule(modules, 'workspaceManager', () => require('../../workspace/workspaceManager'));
defineLazyModule(modules, 'workspaceMigrations', () => require('../../workspace/workspaceMigrations'));
defineLazyModule(modules, 'workspacePersistence', () => require('../../workspace/workspacePersistence'));
defineLazyModule(modules, 'workspaceStore', () => require('../../workspace/workspaceStore'));

module.exports = modules;
