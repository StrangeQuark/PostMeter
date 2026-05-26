const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('settings controller normalizes request TLS, certificates, package cache, and file bindings', () => {
  const { sandbox } = loadSettingsController();

  assert.deepEqual(fromVm(sandbox.normalizeRendererRequestTlsSettings({
    sslCertificateVerification: 'disabled',
    httpVersion: 'HTTP2',
    followRedirects: false,
    maxRedirects: 500,
    disabledTlsProtocols: ['TLSv1', 'TLSv1.1'],
    cipherSuiteSelection: ' TLS_AES_128_GCM_SHA256 '
  })), {
    sslCertificateVerification: 'disabled',
    httpVersion: 'http2',
    followRedirects: false,
    followOriginalHttpMethod: false,
    followAuthorizationHeader: false,
    removeRefererHeaderOnRedirect: false,
    strictHttpParser: true,
    encodeUrlAutomatically: true,
    maxRedirects: 100,
    useServerCipherSuiteDuringHandshake: false,
    disabledTlsProtocols: 'TLSv1, TLSv1.1',
    cipherSuiteSelection: 'TLS_AES_128_GCM_SHA256'
  });

  assert.deepEqual(fromVm(sandbox.normalizeRendererTlsSettings({
    strictSSL: false,
    caCertificatePath: ' /tmp/ca.pem ',
    clientCertificates: [{
      name: '',
      host: ' api.example.test ',
      port: '443',
      matches: ['*.example.test', ''],
      certPath: ' /tmp/client.crt ',
      keyPath: ' /tmp/client.key ',
      passphraseSecretKey: ' client-cert-pass '
    }]
  })), {
    sslCertificateVerification: false,
    caCertificatePath: '/tmp/ca.pem',
    clientCertificates: [{
      id: 'client-certificate-1',
      name: 'Client Certificate',
      enabled: true,
      host: 'api.example.test',
      port: '443',
      matches: ['*.example.test'],
      certPath: '/tmp/client.crt',
      keyPath: '/tmp/client.key',
      pfxPath: '',
      caPath: '',
      passphrase: '',
      passphraseSecretKey: 'client-cert-pass',
      createdAt: '',
      updatedAt: ''
    }]
  });

  assert.deepEqual(fromVm(sandbox.normalizeSandboxPackageCache([
    {
      specifier: 'npm:@scope/tools@1.0.0',
      source: 'module.exports = {};',
      integrity: 'sha256-ok',
      dependencyMap: { lodash: 'npm:lodash@4.17.21' },
      files: [
        { path: './index.js', source: 'exports.ok = true;' },
        { path: '../escape.js', source: 'bad' },
        { path: 'index.js', source: 'duplicate' }
      ],
      package: { main: 'index.js' }
    },
    { specifier: 'missing-integrity', source: 'x' }
  ])), [{
    dependencyAliases: { lodash: 'npm:lodash@4.17.21' },
    specifier: 'npm:@scope/tools@1.0.0',
    source: 'module.exports = {};',
    files: [{ path: 'index.js', source: 'exports.ok = true;' }],
    integrity: 'sha256-ok',
    dependencies: [],
    entrypoint: '',
    fetchedAt: '',
    packageDependencies: [],
    packageIntegrity: '',
    packageJson: { main: 'index.js' },
    packageName: '',
    packageVersion: '',
    registry: '',
    reviewedAt: '',
    sourceUrl: ''
  }]);

  assert.deepEqual(fromVm(sandbox.normalizeSandboxFileBindings([
    { source: 'fixtures/upload.txt', localPath: '/tmp/upload.txt', mode: 'binary', key: 'payload' },
    { source: 'fixtures/upload.txt', localPath: '/tmp/other.txt', mode: 'formdata' },
    { source: '', localPath: '/tmp/missing-source' }
  ])), [{
    id: 'file-binding-1',
    source: 'fixtures/upload.txt',
    bound: true,
    mode: 'binary',
    key: 'payload',
    contentType: '',
    displayName: 'upload.txt',
    fileName: '',
    enabled: true,
    reviewedAt: ''
  }]);

  assert.deepEqual(fromVm(sandbox.normalizeSandboxFileBindings([
    { source: 'fixtures/metadata.txt', bound: true, mode: 'file', fileName: 'metadata.txt' },
    { source: 'fixtures/unbound.txt', mode: 'file', fileName: 'unbound.txt' }
  ])), [{
    id: 'file-binding-1',
    source: 'fixtures/metadata.txt',
    bound: true,
    mode: 'file',
    key: '',
    contentType: '',
    fileName: 'metadata.txt',
    enabled: true,
    reviewedAt: ''
  }]);
});

test('settings section selection updates tab state and shortcut capture mode', () => {
  const { buttons, panels, sandbox, state } = loadSettingsController();

  sandbox.selectSettingsSection('shortcuts');
  assert.equal(buttons.shortcuts.classList.contains('active'), true);
  assert.equal(buttons.shortcuts.attributes['aria-selected'], 'true');
  assert.equal(buttons.shortcuts.tabIndex, 0);
  assert.equal(panels.settingsShortcutsSection.hidden, false);
  assert.deepEqual(state.menuShortcutIgnored, [true]);

  sandbox.selectSettingsSection('unknown');
  assert.equal(buttons.appearance.classList.contains('active'), true);
  assert.equal(panels.settingsAppearanceSection.hidden, false);
  assert.equal(panels.settingsShortcutsSection.hidden, true);
  assert.deepEqual(state.menuShortcutIgnored, [true, false]);
});

function loadSettingsController() {
  const state = { menuShortcutIgnored: [], statuses: [] };
  const buttons = {
    appearance: new FakeElement({ settingsSection: 'appearance' }),
    shortcuts: new FakeElement({ settingsSection: 'shortcuts' }),
    updates: new FakeElement({ settingsSection: 'updates' })
  };
  const panels = {
    settingsAppearanceSection: new FakeElement({}, 'settingsAppearanceSection'),
    settingsShortcutsSection: new FakeElement({}, 'settingsShortcutsSection'),
    settingsUpdatesSection: new FakeElement({}, 'settingsUpdatesSection')
  };
  const sandbox = {
    DEFAULT_KEYBOARD_SHORTCUTS: {},
    KEYBOARD_SHORTCUTS: {},
    KEYBOARD_SHORTCUT_ACTIONS: [],
    console,
    document: {
      querySelectorAll(selector) {
        if (selector === '[data-settings-section]') {
          return Object.values(buttons);
        }
        if (selector === '.settings-section') {
          return Object.values(panels);
        }
        return [];
      }
    },
    notifyUser() {},
    setStatus: (message) => state.statuses.push(message),
    state: { activeModalId: 'settingsModal' },
    window: {
      postmeter: {
        app: {
          setMenuShortcutsIgnored: async (active) => {
            state.menuShortcutIgnored.push(active);
          }
        }
      }
    },
    workspace: {}
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/features/settingsController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { buttons, panels, sandbox, state };
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeElement {
  constructor(dataset = {}, id = '') {
    this.attributes = {};
    this.dataset = dataset;
    this.hidden = false;
    this.id = id;
    this.tabIndex = 0;
    this.classList = {
      classes: new Set(),
      contains(name) {
        return this.classes.has(name);
      },
      toggle(name, force) {
        const enabled = force == null ? !this.classes.has(name) : force === true;
        if (enabled) {
          this.classes.add(name);
        } else {
          this.classes.delete(name);
        }
      }
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}
