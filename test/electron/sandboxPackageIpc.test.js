const assert = require('node:assert/strict');
const test = require('node:test');
const { registerSandboxPackageIpc } = require('../../electron/sandboxPackageIpc');

test('sandbox package IPC registers parent-side package fetch channel', async () => {
  const handlers = new Map();
  let requested = null;
  registerSandboxPackageIpc({
    fetchPackageForReview: async (specifier, options) => {
      requested = { options, specifier };
      return {
        dependencyAliases: { dep: 'npm:@postmeter/dep@1.0.0' },
        dependencies: ['lodash'],
        entrypoint: 'index.js',
        fetchedAt: '2026-04-27T00:00:00.000Z',
        files: [{ path: 'index.js', source: 'module.exports = {};' }],
        integrity: 'sha256-review',
        packageDependencies: ['lodash'],
        packageIntegrity: 'sha512-registry',
        packageJson: { main: 'index.js', name: '@postmeter/tools' },
        packageName: '@postmeter/tools',
        packageVersion: '1.0.0',
        registry: 'npm',
        source: 'module.exports = {};',
        sourceUrl: 'https://registry.npmjs.org/@postmeter/tools/-/tools-1.0.0.tgz',
        specifier: 'npm:@postmeter/tools@1.0.0'
      };
    },
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }
  });

  assert.deepEqual([...handlers.keys()], ['sandbox-package:fetch']);
  const result = await handlers.get('sandbox-package:fetch')({}, ' npm:@postmeter/tools@1.0.0 ', {
    sourceUrl: 'https://packages.example.test/source.js',
    ignored: 'value'
  });

  assert.deepEqual(requested, {
    options: { sourceUrl: 'https://packages.example.test/source.js' },
    specifier: 'npm:@postmeter/tools@1.0.0'
  });
  assert.deepEqual(result, {
    dependencyAliases: { dep: 'npm:@postmeter/dep@1.0.0' },
    dependencies: ['lodash'],
    entrypoint: 'index.js',
    fetchedAt: '2026-04-27T00:00:00.000Z',
    files: [{ path: 'index.js', source: 'module.exports = {};' }],
    integrity: 'sha256-review',
    maxExportKeys: undefined,
    packageDependencies: ['lodash'],
    packageIntegrity: 'sha512-registry',
    packageJson: { main: 'index.js', name: '@postmeter/tools' },
    packageName: '@postmeter/tools',
    packageVersion: '1.0.0',
    registry: 'npm',
    source: 'module.exports = {};',
    sourceUrl: 'https://registry.npmjs.org/@postmeter/tools/-/tools-1.0.0.tgz',
    specifier: 'npm:@postmeter/tools@1.0.0'
  });
});
