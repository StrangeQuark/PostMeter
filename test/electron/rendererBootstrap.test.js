const assert = require('node:assert/strict');
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
