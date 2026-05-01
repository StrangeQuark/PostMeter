const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  bindUi,
  closeToolbarMenus,
  initializeRenderer
} = require('../../src/renderer/rendererBootstrap');

test('renderer bootstrap initializes theme and runs registered cleanup callbacks on unload', async () => {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const fakeDocument = {
    addEventListener(name, handler) {
      documentListeners.set(name, handler);
    }
  };
  const fakeWindow = {
    addEventListener(name, handler) {
      windowListeners.set(name, handler);
    }
  };
  const appliedThemes = [];
  let cleanupCount = 0;

  initializeRenderer({
    doc: fakeDocument,
    windowObject: fakeWindow,
    applyThemePreference: (theme) => appliedThemes.push(theme),
    getStoredThemePreference: () => 'dark',
    onReady: async ({ registerCleanup }) => {
      registerCleanup(() => { cleanupCount += 1; });
      registerCleanup(() => { cleanupCount += 10; });
    }
  });

  assert.deepEqual(appliedThemes, ['dark']);
  await documentListeners.get('DOMContentLoaded')();
  windowListeners.get('beforeunload')();
  assert.equal(cleanupCount, 11);
});

test('renderer bootstrap falls back to the system theme when theme loading throws', () => {
  const appliedThemes = [];
  initializeRenderer({
    doc: { addEventListener() {} },
    windowObject: { addEventListener() {} },
    applyThemePreference: (theme) => appliedThemes.push(theme),
    getStoredThemePreference() {
      throw new Error('storage unavailable');
    }
  });

  assert.deepEqual(appliedThemes, ['system']);
});

test('renderer bootstrap closes toolbar menus and resets trigger aria state', () => {
  const menus = [{ hidden: false }, { hidden: false }];
  const triggers = [
    {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      }
    },
    {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      }
    }
  ];

  closeToolbarMenus({
    querySelectorAll(selector) {
      if (selector === '.toolbar-menu') {
        return menus;
      }
      if (selector === '.menu-trigger') {
        return triggers;
      }
      return [];
    }
  });

  assert.equal(menus.every((menu) => menu.hidden === true), true);
  assert.equal(triggers.every((button) => button.attributes['aria-expanded'] === 'false'), true);
});

test('renderer bootstrap binds auth input and modal draft confirmation events', () => {
  const calls = {
    authType: [],
    authInput: 0,
    resolveModal: []
  };
  const elements = new Map([
    ['authTypeSelect', createElement({ tagName: 'SELECT', value: 'oauth2' })],
    ['confirmSaveDraftButton', createElement()],
    ['confirmExportCollectionButton', createElement()],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);
  const documentListeners = new Map();
  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(name, handler) {
      documentListeners.set(name, handler);
    }
  };
  const fakeWindow = {
    addEventListener() {}
  };

  bindUi({
    doc: fakeDocument,
    windowObject: fakeWindow,
    onAuthTypeChange: (value) => calls.authType.push(value),
    onAuthInput: () => { calls.authInput += 1; },
    onResolveActiveModal: (value) => calls.resolveModal.push(value),
    getSelectedDraftSaveCollectionId: () => 'collection-1',
    getSelectedExportCollectionId: () => 'collection-2'
  });

  elements.get('authTypeSelect').dispatch('change');
  elements.get('confirmSaveDraftButton').dispatch('click');
  elements.get('confirmExportCollectionButton').dispatch('click');

  assert.deepEqual(calls.authType, ['oauth2']);
  assert.equal(calls.authInput, 1);
  assert.deepEqual(calls.resolveModal, ['collection-1', 'collection-2']);
});

test('renderer bootstrap binds every collection export menu button', () => {
  const calls = [];
  const controls = [
    ['exportCollectionButton', 'postmeter', 'onExportCollection'],
    ['exportPostmanButton', 'postman', 'onExportPostman'],
    ['exportOpenApiButton', 'openapi', 'onExportOpenApi'],
    ['exportJMeterButton', 'jmeter', 'onExportJMeter'],
    ['exportCurlButton', 'curl', 'onExportCurl'],
    ['exportHarButton', 'har', 'onExportHar']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement()]));
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap binds workspace sandbox control buttons', () => {
  const calls = [];
  const controls = [
    ['addSandboxPackageButton', 'add-package', 'onAddSandboxPackage'],
    ['fetchSandboxPackageButton', 'fetch-package', 'onFetchSandboxPackage'],
    ['refreshSandboxPackagesButton', 'refresh-packages', 'onRefreshSandboxPackages'],
    ['bindSandboxFileButton', 'bind-file', 'onBindSandboxFile'],
    ['refreshSandboxFilesButton', 'refresh-files', 'onRefreshSandboxFiles'],
    ['bindVaultSecretButton', 'bind-vault', 'onBindVaultSecret'],
    ['refreshVaultMetadataButton', 'refresh-vault', 'onRefreshVaultMetadata'],
    ['resetVaultButton', 'reset-vault', 'onResetVault']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement()]));
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap binds vault prompt decision buttons', () => {
  const decisions = [];
  const controls = [
    'denyVaultPromptButton',
    'allowVaultPromptRequestButton',
    'allowVaultPromptCollectionButton',
    'allowVaultPromptWorkspaceButton',
    'resetVaultPromptGrantsButton'
  ];
  const elements = new Map(controls.map((id) => [id, createElement()]));

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onResolveVaultPrompt: (decision) => decisions.push(decision)
  });

  for (const id of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(decisions, [
    { granted: false, scope: 'request' },
    { granted: true, scope: 'request' },
    { granted: true, scope: 'collection' },
    { granted: true, scope: 'workspace' },
    { granted: false, reset: true, scope: 'request' }
  ]);
});

test('renderer supplies handlers for all workspace sandbox controls', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  for (const optionName of [
    'onAddSandboxPackage',
    'onFetchSandboxPackage',
    'onRefreshSandboxPackages',
    'onBindSandboxFile',
    'onRefreshSandboxFiles',
    'onBindVaultSecret',
    'onRefreshVaultMetadata',
    'onResetVault'
  ]) {
    assert.match(rendererSource, new RegExp(`${optionName}:`), `${optionName} should be passed to bindUi`);
  }
});

test('renderer cancels active OAuth flow when loaded workspace context resets', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  assert.match(rendererSource, /function cancelActiveOauthFlowForContextReset\(\)/);
  assert.match(rendererSource, /window\.postmeter\.oauth\.cancelFlow\(flowId\)/);
  assert.match(rendererSource, /function applyLoadedWorkspace\(loaded, options = \{\}\) \{\s*cancelActiveOauthFlowForContextReset\(\);/);
});

test('renderer supplies explicit collection export format handlers', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  for (const [optionName, format] of [
    ['onExportCollection', 'postmeter'],
    ['onExportPostman', 'postman'],
    ['onExportOpenApi', 'openapi'],
    ['onExportJMeter', 'jmeter'],
    ['onExportCurl', 'curl'],
    ['onExportHar', 'har']
  ]) {
    assert.match(
      rendererSource,
      new RegExp(`${optionName}: \\(\\) => exportCollection\\(null, '${format}'\\)`),
      `${optionName} should pass the ${format} export format`
    );
  }
});

test('renderer loads vault prompt queue before the app renderer', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');
  const queueIndex = indexHtml.indexOf('src="vaultPromptQueue.js"');
  const rendererIndex = indexHtml.indexOf('src="renderer.js"');
  assert.ok(queueIndex >= 0, 'vaultPromptQueue.js should be loaded');
  assert.ok(rendererIndex >= 0, 'renderer.js should be loaded');
  assert.ok(queueIndex < rendererIndex, 'vaultPromptQueue.js should load before renderer.js');
});

function createElement({ tagName = 'BUTTON', value = '' } = {}) {
  const listeners = new Map();
  return {
    tagName,
    value,
    hidden: true,
    dataset: {},
    addEventListener(name, handler) {
      if (!listeners.has(name)) {
        listeners.set(name, []);
      }
      listeners.get(name).push(handler);
    },
    dispatch(name, event = {}) {
      for (const handler of listeners.get(name) || []) {
        handler({
          stopPropagation() {},
          preventDefault() {},
          target: this,
          key: event.key
        });
      }
    }
  };
}
