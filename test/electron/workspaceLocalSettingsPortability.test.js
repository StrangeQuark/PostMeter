const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  CURRENT_SCHEMA_VERSION,
  normalizeWorkspaceLocalSettings
} = require('../../src/core/workspace/models');
const { WorkspaceStore } = require('../../src/core/workspace/workspaceStore');

test('workspace local settings portability strips every current local-only key from native exports and imports', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-localsettings-portability-'));
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));
  const workspacePath = path.join(tempDir, 'workspace.json');
  const exportPath = path.join(tempDir, 'portable-workspace.json');
  const store = new WorkspaceStore(workspacePath);
  const localSettings = normalizeWorkspaceLocalSettings({
    request: {
      sslCertificateVerification: false,
      caCertificatePath: '/local/ca.pem',
      clientCertificates: [{
        id: 'cert-1',
        name: 'Local cert',
        host: 'api.example.test',
        certPath: '/local/client.crt',
        keyPath: '/local/client.key',
        pfxPath: '/local/client.p12',
        passphraseSecretKey: 'client-certificate:cert-1:passphrase'
      }]
    },
    diagnostics: {
      logging: { enabled: true, level: 'debug' },
      requestResponseLogging: {
        urls: true,
        headers: true,
        cookies: true,
        bodies: true,
        protocolMessages: true,
        scriptConsole: true,
        payloadIdentifiers: true
      }
    },
    sandbox: {
      fileBindings: [{ id: 'file-1', source: 'upload.bin', localPath: '/local/upload.bin', mode: 'file' }],
      packageCache: [{ specifier: '@team/local', source: 'module.exports = 1;', integrity: 'sha256-local' }],
      trustedCapabilities: {
        sendRequest: false,
        cookies: false,
        vault: false,
        vaultGrants: {
          workspace: true,
          collections: ['collection-1'],
          requests: ['request-1'],
          deniedCollections: ['blocked-collection'],
          deniedRequests: ['blocked-request']
        }
      }
    }
  });
  assert.deepEqual(Object.keys(localSettings).sort(), ['diagnostics', 'request', 'sandbox']);

  const saved = await store.save({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    localsettings: localSettings,
    collections: [],
    environments: [],
    cookies: [],
    history: []
  });
  const persisted = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
  assert.deepEqual(Object.keys(persisted.localsettings).sort(), ['diagnostics', 'request', 'sandbox']);

  await store.exportWorkspace(saved, exportPath);
  const exportedText = await fs.readFile(exportPath, 'utf8');
  for (const localOnlyValue of [
    '/local/ca.pem',
    '/local/client.crt',
    '/local/client.key',
    '/local/client.p12',
    'client-certificate:cert-1:passphrase',
    '/local/upload.bin',
    '@team/local',
    'collection-1',
    'request-1',
    'blocked-collection',
    'blocked-request'
  ]) {
    assert.equal(exportedText.includes(localOnlyValue), false, `${localOnlyValue} should not be portable`);
  }
  const exported = JSON.parse(exportedText);
  assert.equal(Object.hasOwn(exported, 'settings'), false);
  assert.equal(Object.hasOwn(exported, 'localsettings'), false);

  const imported = await store.importWorkspace(exportPath);
  assert.deepEqual(imported.localsettings, normalizeWorkspaceLocalSettings());
});
