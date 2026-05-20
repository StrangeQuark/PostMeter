const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'collectionRunner', () => require('../../runtime/collectionRunner'));
defineLazyModule(modules, 'localMockServer', () => require('../../runtime/localMockServer'));
defineLazyModule(modules, 'performanceCalibration', () => require('../../runtime/performanceCalibration'));
defineLazyModule(modules, 'performanceCalibrationServerWorker', () => require('../../runtime/performanceCalibrationServerWorker'));
defineLazyModule(modules, 'performanceDiagnosis', () => require('../../runtime/performanceDiagnosis'));
defineLazyModule(modules, 'performanceRunner', () => require('../../runtime/performanceRunner'));
defineLazyModule(modules, 'requestScriptRunner', () => require('../../runtime/requestScriptRunner'));
defineLazyModule(modules, 'runtimeResultStore', () => require('../../runtime/runtimeResultStore'));
defineLazyModule(modules, 'scriptedRequestLifecycle', () => require('../../runtime/scriptedRequestLifecycle'));

module.exports = modules;
