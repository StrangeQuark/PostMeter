const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'collectionFormatUtils', () => require('../../import-export/collectionFormatUtils'));
defineLazyModule(modules, 'collectionFormats', () => require('../../import-export/collectionFormats'));
defineLazyModule(modules, 'collectionImportRegistry', () => require('../../import-export/collectionImportRegistry'));
defineLazyModule(modules, 'curlFormats', () => require('../../import-export/curlFormats'));
defineLazyModule(modules, 'environmentFormats', () => require('../../import-export/environmentFormats'));
defineLazyModule(modules, 'importedCollectionIds', () => require('../../import-export/importedCollectionIds'));
defineLazyModule(modules, 'markup', () => require('../../import-export/markup'));
defineLazyModule(modules, 'openApiFormats', () => require('../../import-export/openApiFormats'));
defineLazyModule(modules, 'performanceFormats', () => require('../../import-export/performanceFormats'));
defineLazyModule(modules, 'postmanImporter', () => require('../../import-export/postmanImporter'));
defineLazyModule(modules, 'requestFormats', () => require('../../import-export/requestFormats'));
defineLazyModule(modules, 'resultHtmlReport', () => require('../../import-export/resultHtmlReport'));
defineLazyModule(modules, 'runnerFormats', () => require('../../import-export/runnerFormats'));

module.exports = modules;
