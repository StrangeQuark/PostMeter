const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('layout controls clamp splitter values, update ARIA, and persist CSS variables', () => {
  const { document, handle, localStorage, sandbox } = loadLayoutControls();
  const config = {
    cssVariable: '--sidebar-width',
    fallbackPixels: 300,
    label: 'Resize sidebar',
    max: () => 520,
    min: () => 240
  };

  sandbox.configureSplitterAccessibility(handle, config, 999);
  assert.equal(handle.getAttribute('aria-label'), 'Resize sidebar');
  assert.equal(handle.getAttribute('aria-valuemin'), '240');
  assert.equal(handle.getAttribute('aria-valuemax'), '520');
  assert.equal(handle.getAttribute('aria-valuenow'), '520');

  sandbox.applySplitterValue(handle, config, 100);
  assert.equal(handle.getAttribute('aria-valuenow'), '240');
  assert.equal(document.documentElement.style.values.get('--sidebar-width'), '240px');
  assert.equal(localStorage.getItem('postmeter.layout.--sidebar-width'), '240px');

  sandbox.applySplitterValue(handle, config, 360);
  assert.equal(handle.getAttribute('aria-valuenow'), '360');
  assert.equal(document.documentElement.style.values.get('--sidebar-width'), '360px');
});

test('layout controls handle keyboard splitter movement and reset persisted values', () => {
  const { document, handle, localStorage, sandbox } = loadLayoutControls();
  sandbox.setupDragResize('mainPaneResize', {
    cssVariable: '--sidebar-width',
    fallbackPixels: 300,
    label: 'Resize sidebar',
    max: 420,
    min: 220
  });

  assert.equal(handle.getAttribute('aria-valuenow'), '300');
  handle.dispatch('keydown', keyEvent('ArrowRight'));
  assert.equal(document.documentElement.style.values.get('--sidebar-width'), '316px');
  assert.equal(handle.getAttribute('aria-valuenow'), '316');

  handle.dispatch('keydown', keyEvent('ArrowLeft', { shiftKey: true }));
  assert.equal(document.documentElement.style.values.get('--sidebar-width'), '252px');
  assert.equal(handle.getAttribute('aria-valuenow'), '252');

  handle.dispatch('keydown', keyEvent('End'));
  assert.equal(document.documentElement.style.values.get('--sidebar-width'), '420px');
  assert.equal(handle.getAttribute('aria-valuenow'), '420');

  handle.dispatch('keydown', keyEvent('Enter'));
  assert.equal(document.documentElement.style.values.get('--sidebar-width'), '300px');
  assert.equal(localStorage.getItem('postmeter.layout.--sidebar-width'), null);
  assert.equal(handle.getAttribute('aria-valuenow'), '300');
});

test('layout controls allow collapsed panes down to their measured header height', () => {
  const header = new FakeElement('div', { height: 42 });
  const panel = new FakeElement('section', {
    computedStyle: {
      'padding-top': '10px',
      'padding-bottom': '10px',
      'border-top-width': '1px',
      'border-bottom-width': '1px'
    }
  });
  panel.children.set('.performance-main-header', header);
  const { document, handle, localStorage, sandbox } = loadLayoutControls({
    querySelector: (selector) => selector === '#performanceRequestSection' ? panel : null
  });
  const config = {
    cssVariable: '--performance-request-height',
    fallbackPixels: 420,
    label: 'Resize performance request builder and results panels',
    max: () => 500,
    min: () => sandbox.collapsiblePaneMinimumPixels('#performanceRequestSection', '.performance-main-header')
  };

  sandbox.configureSplitterAccessibility(handle, config, 0);
  assert.equal(handle.getAttribute('aria-valuemin'), '54');
  assert.equal(handle.getAttribute('aria-valuenow'), '54');

  sandbox.applySplitterValue(handle, config, 1);
  assert.equal(document.documentElement.style.values.get('--performance-request-height'), '54px');
  assert.equal(localStorage.getItem('postmeter.layout.--performance-request-height'), '54px');
});

function loadLayoutControls(options = {}) {
  const handle = new FakeElement('div');
  const document = {
    body: { classList: { add() {}, remove() {} } },
    documentElement: {
      style: {
        values: new Map(),
        setProperty(name, value) {
          this.values.set(name, value);
        }
      }
    },
    getElementById: (id) => id === 'mainPaneResize' ? handle : null,
    querySelector: options.querySelector || (() => null)
  };
  const localStorage = new FakeStorage();
  const sandbox = {
    document,
    getComputedStyle: (element) => ({
      getPropertyValue: (name) => element?.computedStyle?.[name] || document.documentElement.style.values.get(name) || ''
    }),
    localStorage
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/ui/layoutControls.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { document, handle, localStorage, sandbox };
}

function keyEvent(key, options = {}) {
  return {
    key,
    shiftKey: options.shiftKey === true,
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    }
  };
}

class FakeStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

class FakeElement {
  constructor(tagName = 'div', options = {}) {
    this.attributes = {};
    this.children = new Map();
    this.computedStyle = options.computedStyle || {};
    this.rect = {
      height: options.height || 0,
      width: options.width || 0,
      top: options.top || 0
    };
    this.classList = {
      contains: () => false
    };
    this.listeners = {};
    this.tagName = tagName.toUpperCase();
  }

  addEventListener(type, listener) {
    this.listeners[type] ||= [];
    this.listeners[type].push(listener);
  }

  dispatch(type, event) {
    for (const listener of this.listeners[type] || []) {
      listener(event);
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  getBoundingClientRect() {
    return this.rect;
  }

  querySelector(selector) {
    return this.children.get(selector) || null;
  }
}
