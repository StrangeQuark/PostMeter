const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'diagnostics', () => require('../../diagnostics-release/diagnostics'));
defineLazyModule(modules, 'diagnosticsSettings', () => require('../../diagnostics-release/diagnosticsSettings'));
defineLazyModule(modules, 'oauthProviderCertification', () => require('../../diagnostics-release/oauthProviderCertification'));
defineLazyModule(modules, 'postmanDocsCoverageAudit', () => require('../../diagnostics-release/postmanDocsCoverageAudit'));
defineLazyModule(modules, 'postmanParityHarness', () => require('../../diagnostics-release/postmanParityHarness'));
defineLazyModule(modules, 'postmanParityMatrix', () => require('../../diagnostics-release/postmanParityMatrix'));
defineLazyModule(modules, 'productionReadinessMatrix', () => require('../../diagnostics-release/productionReadinessMatrix'));
defineLazyModule(modules, 'productionSupportMatrices', () => require('../../diagnostics-release/productionSupportMatrices'));
defineLazyModule(modules, 'updateChecker', () => require('../../diagnostics-release/updateChecker'));

module.exports = modules;
