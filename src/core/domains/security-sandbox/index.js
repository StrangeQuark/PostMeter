const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'osSandbox', () => require('../../sandbox/osSandbox'));
defineLazyModule(modules, 'osSandboxPlatformHarness', () => require('../../sandbox/osSandboxPlatformHarness'));
defineLazyModule(modules, 'osSandboxPlatformMatrix', () => require('../../sandbox/osSandboxPlatformMatrix'));
defineLazyModule(modules, 'payloadSchemas', () => require('../../contracts/payloadSchemas'));
defineLazyModule(modules, 'postmanBuiltinPackages', () => require('../../sandbox/postmanBuiltinPackages'));
defineLazyModule(modules, 'postmanSandboxBootcodeBundle', () => require('../../sandbox/postmanSandboxBootcodeBundle'));
defineLazyModule(modules, 'sandboxPackageCache', () => require('../../sandbox/sandboxPackageCache'));
defineLazyModule(modules, 'sandboxPackageFetcher', () => require('../../sandbox/sandboxPackageFetcher'));
defineLazyModule(modules, 'sandboxRuntimeValidation', () => require('../../sandbox/sandboxRuntimeValidation'));
defineLazyModule(modules, 'scriptRuntime', () => require('../../sandbox/scriptRuntime'));
defineLazyModule(modules, 'scriptSandbox', () => require('../../sandbox/scriptSandbox'));
defineLazyModule(modules, 'scriptWorker', () => require('../../sandbox/scriptWorker'));
defineLazyModule(modules, 'seccompPolicy', () => require('../../sandbox/seccompPolicy'));
defineLazyModule(modules, 'vaultStore', () => require('../../sandbox/vaultStore'));
defineLazyModule(modules, 'visualizerHandlebarsBundle', () => require('../../sandbox/visualizerHandlebarsBundle'));

module.exports = modules;
