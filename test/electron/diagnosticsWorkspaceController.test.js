const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('diagnostics workspace controller renders privacy settings and disables controls for non-current or pending saves', () => {
  const { elements, sandbox } = loadDiagnosticsWorkspaceController({
    workspaceItem: { current: false }
  });

  sandbox.renderDiagnosticsPrivacyPanel();
  assert.equal(elements.get('diagnosticLoggingEnabledInput').checked, true);
  assert.equal(elements.get('diagnosticLogLevelSelect').value, 'debug');
  assert.equal(elements.get('diagnosticLogUrlsInput').checked, true);
  assert.equal(elements.get('diagnosticLogHeadersInput').checked, false);
  assert.equal(elements.get('exportDiagnosticsButton').disabled, true);
  assert.match(elements.get('diagnosticsPrivacySummary').textContent, /Switch to this workspace/);

  sandbox.activeWorkspaceItem = () => ({ current: true });
  sandbox.pendingDiagnosticsSettingsSave = true;
  sandbox.renderDiagnosticsPrivacyPanel();
  assert.equal(elements.get('diagnosticLoggingEnabledInput').disabled, true);
  assert.match(elements.get('diagnosticsPrivacySummary').textContent, /Saving diagnostics privacy settings/);

  sandbox.pendingDiagnosticsSettingsSave = false;
  sandbox.renderDiagnosticsPrivacyPanel();
  assert.equal(elements.get('diagnosticLoggingEnabledInput').disabled, false);
  assert.match(elements.get('diagnosticsPrivacySummary').textContent, /2 request\/response log categories are enabled/);
});

test('diagnostics workspace controller renders sandbox package, file binding, and vault panels', () => {
  const { elements, sandbox } = loadDiagnosticsWorkspaceController();
  sandbox.workspace.settings.sandbox.packageCache = [{
    specifier: 'npm:cached@1.0.0',
    integrity: 'sha256-cached',
    registry: 'https://registry.example.test',
    entrypoint: 'index.js',
    reviewedAt: '2026-05-20T00:00:00.000Z'
  }];
  sandbox.sandboxPackageStatusRows = () => [
    { specifier: 'npm:missing@1.0.0', pinned: true, cached: false, status: 'Missing reviewed package' },
    { specifier: 'unversioned', pinned: false, cached: false, status: 'Use @team/package, npm:package@version, or jsr:@scope/package@version' }
  ];
  sandbox.sandboxFileBindingStatusRows = () => [
    { source: 'fixture.bin', mode: 'binary', key: '', bound: false, status: 'Needs local file binding' },
    { source: 'bound.csv', mode: 'formdata', key: 'upload', bound: true, binding: { source: 'bound.csv', localPath: '/tmp/bound.csv', mode: 'formdata' }, status: 'Bound to bound.csv' }
  ];
  sandbox.workspace.settings.sandbox.fileBindings = [
    { source: 'orphan.txt', localPath: '/tmp/orphan.txt', mode: 'file' }
  ];
  sandbox.lastVaultMetadataWorkspaceId = 'workspace-1';
  sandbox.lastVaultMetadata = {
    available: true,
    secrets: [{ key: 'api_token', updatedAt: 'stored today' }],
    audit: [{ operation: 'read', key: 'api_token', at: 'audit today' }]
  };

  sandbox.renderSandboxPackageCachePanel();
  assert.equal(
    elements.get('sandboxPackageCacheSummary').textContent,
    '1 reviewed package cached. 2 package references need review.'
  );
  assert.deepEqual(rowTexts(elements.get('sandboxPackageMissingList')), [
    'npm:missing@1.0.0|Missing reviewed package|Review|Fetch',
    'unversioned|Use @team/package, npm:package@version, or jsr:@scope/package@version|Review|Fetch'
  ]);
  assert.equal(elements.get('sandboxPackageMissingList').children[1].children[1].children[1].disabled, true);
  assert.deepEqual(rowTexts(elements.get('sandboxPackageCacheList')), [
    'npm:cached@1.0.0|sha256-cached - https://registry.example.test:index.js - reviewed 2026-05-20T00:00:00.000Z|Remove'
  ]);

  sandbox.renderSandboxFileBindingsPanel();
  assert.equal(
    elements.get('sandboxFileBindingSummary').textContent,
    '1 imported file attachment bound. 1 attachment reference need local binding.'
  );
  assert.deepEqual(rowTexts(elements.get('sandboxFileBindingMissingList')), [
    'fixture.bin|binary - Needs local file binding|Bind'
  ]);
  assert.deepEqual(rowTexts(elements.get('sandboxFileBindingList')), [
    'bound.csv|formdata - bound.csv|Remove',
    'orphan.txt|file - orphan.txt|Remove'
  ]);

  sandbox.renderVaultMetadataPanel();
  assert.equal(
    elements.get('sandboxVaultSummary').textContent,
    '1 vault secret stored. 1 audit entry retained.'
  );
  assert.deepEqual(rowTexts(elements.get('sandboxVaultList')), ['api_token|stored today|Remove']);
  assert.deepEqual(rowTexts(elements.get('sandboxVaultAuditList')), ['read api_token|audit today']);
});

function loadDiagnosticsWorkspaceController(options = {}) {
  const elements = createPanelElements();
  const workspace = {
    settings: {
      diagnostics: {},
      sandbox: {
        fileBindings: [],
        packageCache: []
      }
    }
  };
  const sandbox = {
    CodeEditor: { refreshEditor() {} },
    SANDBOX_REVIEWED_PACKAGE_PATTERN: /^(?:npm:.+@\d|jsr:@.+@\d|@.+\/.+)$/i,
    activeWorkspaceId: 'workspace-1',
    activeWorkspaceItem: () => options.workspaceItem || { current: true },
    addSandboxPackageFromPrompt() {},
    bindSandboxFileFromPrompt() {},
    document: { createElement: (tagName) => new FakeElement(tagName) },
    displayLocalFilePath: (value) => String(value || '').split(/[\\/]/).pop() || '',
    ensureSettings() {
      workspace.settings ||= { diagnostics: {}, sandbox: {} };
      workspace.settings.sandbox ||= {};
    },
    fetchSandboxPackageFromPrompt() {},
    lastVaultMetadata: null,
    lastVaultMetadataWorkspaceId: '',
    normalizeDiagnosticsSettings: () => ({
      logging: { enabled: true, level: 'debug' },
      requestResponseLogging: {
        urls: true,
        headers: false,
        cookies: true,
        bodies: false,
        protocolMessages: false,
        scriptConsole: false,
        payloadIdentifiers: false
      }
    }),
    pendingDiagnosticsSettingsSave: false,
    removeSandboxFileBinding() {},
    removeSandboxPackage() {},
    sandboxFileBindingStatusRows: () => [],
    sandboxPackageStatusRows: () => [],
    unsetVaultSecret() {},
    workspace,
    $: (id) => elements.get(id) || null
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/features/diagnosticsWorkspaceController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  sandbox.activeWorkspaceItem = () => options.workspaceItem || { current: true };
  return { elements, sandbox };
}

function createPanelElements() {
  return new Map([
    'diagnosticLoggingEnabledInput',
    'diagnosticLogLevelSelect',
    'diagnosticLogUrlsInput',
    'diagnosticLogHeadersInput',
    'diagnosticLogCookiesInput',
    'diagnosticLogBodiesInput',
    'diagnosticLogProtocolMessagesInput',
    'diagnosticLogScriptConsoleInput',
    'diagnosticLogPayloadIdentifiersInput',
    'exportDiagnosticsButton',
    'diagnosticsPrivacySummary',
    'sandboxPackageCacheSummary',
    'sandboxPackageMissingList',
    'sandboxPackageCacheList',
    'sandboxFileBindingSummary',
    'sandboxFileBindingMissingList',
    'sandboxFileBindingList',
    'sandboxVaultSummary',
    'sandboxVaultList',
    'sandboxVaultAuditList'
  ].map((id) => [id, new FakeElement('div')]));
}

function rowTexts(container) {
  return container.children.map((row) => rowText(row));
}

function rowText(element) {
  if (!element.children.length) {
    return element.textContent;
  }
  return element.children.map((child) => rowText(child)).filter(Boolean).join('|');
}

class FakeElement {
  constructor(tagName = 'div') {
    this.attributes = {};
    this.children = [];
    this.className = '';
    this.classList = {
      add: (name) => {
        this.className = [this.className, name].filter(Boolean).join(' ');
      }
    };
    this.disabled = false;
    this.hidden = false;
    this.listeners = {};
    this.tagName = tagName.toUpperCase();
    this._textContent = '';
    this.value = '';
    this.checked = false;
  }

  append(...children) {
    this.children.push(...children.flat());
  }

  addEventListener(type, listener) {
    this.listeners[type] ||= [];
    this.listeners[type].push(listener);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value || '');
    if (this._textContent === '') {
      this.children = [];
    }
  }
}
