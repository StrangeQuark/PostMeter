const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

const DOMAIN_CONTRACTS = [
  {
    modulePath: 'src/core/index.js',
    keys: ['diagnosticsRelease', 'http', 'importExport', 'ipc', 'runtime', 'securitySandbox', 'workspace']
  },
  {
    modulePath: 'src/core/domains/index.js',
    keys: ['diagnosticsRelease', 'http', 'importExport', 'ipc', 'runtime', 'securitySandbox', 'workspace']
  },
  {
    modulePath: 'src/core/domains/diagnostics-release/index.js',
    keys: [
      'diagnostics',
      'diagnosticsSettings',
      'oauthProviderCertification',
      'postmanDocsCoverageAudit',
      'postmanParityHarness',
      'postmanParityMatrix',
      'productionReadinessMatrix',
      'productionSupportMatrices',
      'updateChecker'
    ]
  },
  {
    modulePath: 'src/core/domains/http/index.js',
    keys: [
      'auth',
      'authModel',
      'authRefresh',
      'cookieJar',
      'fileAttachmentBindings',
      'grpcClient',
      'httpClient',
      'pfxCertificate',
      'requestSettings',
      'tlsSettings'
    ]
  },
  {
    modulePath: 'src/core/domains/import-export/index.js',
    keys: [
      'collectionFormatUtils',
      'collectionFormats',
      'collectionImportRegistry',
      'curlFormats',
      'environmentFormats',
      'importedCollectionIds',
      'markup',
      'openApiFormats',
      'performanceFormats',
      'postmanImporter',
      'requestFormats',
      'resultHtmlReport',
      'runnerFormats'
    ]
  },
  {
    modulePath: 'src/core/domains/ipc/index.js',
    keys: ['ipcValidation']
  },
  {
    modulePath: 'src/core/domains/runtime/index.js',
    keys: [
      'collectionRunner',
      'localMockServer',
      'performanceCalibration',
      'performanceCalibrationServerWorker',
      'performanceDiagnosis',
      'performanceRunner',
      'requestScriptRunner',
      'runtimeResultStore',
      'scriptedRequestLifecycle'
    ]
  },
  {
    modulePath: 'src/core/domains/security-sandbox/index.js',
    keys: [
      'osSandbox',
      'osSandboxPlatformHarness',
      'osSandboxPlatformMatrix',
      'payloadSchemas',
      'postmanBuiltinPackages',
      'postmanSandboxBootcodeBundle',
      'sandboxPackageCache',
      'sandboxPackageFetcher',
      'sandboxRuntimeValidation',
      'scriptRuntime',
      'scriptSandbox',
      'scriptWorker',
      'seccompPolicy',
      'vaultStore',
      'visualizerHandlebarsBundle'
    ]
  },
  {
    modulePath: 'src/core/domains/workspace/index.js',
    keys: [
      'appSettingsStore',
      'cookieModel',
      'csvVariables',
      'dynamicVariables',
      'environmentResolver',
      'keyboardShortcuts',
      'models',
      'requestQueryModel',
      'resultCapturePolicy',
      'sessionState',
      'variableScope',
      'workspaceManager',
      'workspaceMigrations',
      'workspacePersistence',
      'workspaceStore'
    ]
  },
  {
    modulePath: 'electron/domains/index.js',
    keys: ['appShell', 'ipc', 'packaging', 'security', 'services']
  },
  {
    modulePath: 'electron/domains/app-shell/index.js',
    keys: ['appMenu', 'appProtocol', 'fileDialogs', 'mainDiagnostics', 'mainWindow']
  },
  {
    modulePath: 'electron/domains/ipc/index.js',
    keys: [
      'appIpc',
      'diagnosticsIpc',
      'exportIpc',
      'oauthIpc',
      'requestIpc',
      'runtimeIpc',
      'sandboxPackageIpc',
      'sessionIpc',
      'vaultPrompt',
      'workspaceIpc'
    ]
  },
  {
    modulePath: 'electron/domains/packaging/index.js',
    keys: ['packagedSandboxRuntimeCli', 'packagedStartupSmokeNode']
  },
  {
    modulePath: 'electron/domains/security/index.js',
    keys: ['appProtocol', 'ipcSecurity']
  },
  {
    modulePath: 'electron/domains/services/index.js',
    keys: ['autoUpdateService', 'exportPreparationWorker', 'oauthFlows', 'sessionStore', 'workspaceMutations']
  }
];

for (const contract of DOMAIN_CONTRACTS) {
  test(`${contract.modulePath} exposes its documented lazy export contract`, () => {
    const domainModule = require(path.join(PROJECT_ROOT, contract.modulePath));
    assert.deepEqual(Object.keys(domainModule), contract.keys);

    for (const key of contract.keys) {
      const descriptor = Object.getOwnPropertyDescriptor(domainModule, key);
      assert.equal(descriptor.enumerable, true, `${key} should be enumerable`);
      assert.equal(typeof descriptor.get, 'function', `${key} should be exposed through a lazy getter`);
      assert.equal(descriptor.set, undefined, `${key} should not expose a setter`);
      assert.notEqual(domainModule[key], undefined, `${key} should resolve when accessed`);
    }
  });
}

test('core and electron lazy export helpers define enumerable lazy getters', () => {
  assertLazyExportHelper('src/core/domains/lazyExport.js');
  assertLazyExportHelper('electron/domains/lazyExport.js');
});

function assertLazyExportHelper(modulePath) {
  const { defineLazyModule } = require(path.join(PROJECT_ROOT, modulePath));
  const target = {};
  let loadCount = 0;
  defineLazyModule(target, 'sample', () => {
    loadCount += 1;
    return { loadCount };
  });

  assert.deepEqual(Object.keys(target), ['sample']);
  assert.equal(loadCount, 0);
  const descriptor = Object.getOwnPropertyDescriptor(target, 'sample');
  assert.equal(descriptor.enumerable, true);
  assert.equal(typeof descriptor.get, 'function');
  assert.deepEqual(target.sample, { loadCount: 1 });
  assert.deepEqual(target.sample, { loadCount: 2 });
}
