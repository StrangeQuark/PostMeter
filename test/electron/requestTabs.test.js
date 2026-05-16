const assert = require('node:assert/strict');
const test = require('node:test');
const { renderRequestTabs } = require('../../src/renderer/requestTabs');

test('opened request tabs expose panel relationships without nesting close buttons in tab roles', () => {
  const doc = createFakeDocument(['requestTabBar', 'requestEditorPanel']);
  const selectCalls = [];
  const closeCalls = [];

  renderRequestTabs({
    doc,
    groups: [{
      tabs: [
        { key: 'request:collection-1:first', dirty: true },
        { key: 'request:collection-1:second', dirty: false }
      ],
      resolve: (tab) => ({ id: tab.key, name: tab.key.endsWith('first') ? 'First Request' : 'Second Request', method: 'GET' }),
      isActive: (tab) => tab.key.endsWith('first'),
      idPrefix: 'open-request-tab',
      controlsId: 'requestEditorPanel',
      buttonClassName: 'request-tab-button',
      methodText: (request) => request.method,
      title: (request) => request.name,
      closeTitle: () => 'Close request',
      closeAriaLabel: (request) => `Close ${request.name}`,
      onSelect: (tab) => selectCalls.push(tab.key),
      onClose: (tab) => closeCalls.push(tab.key)
    }]
  });

  const bar = doc.getElementById('requestTabBar');
  const panel = doc.getElementById('requestEditorPanel');
  bar.setAttribute('role', 'tablist');
  const tabs = bar.querySelectorAll('[role="tab"]');
  const closeButtons = bar.querySelectorAll('.request-tab-close');

  assert.equal(bar.hidden, false);
  assert.equal(tabs.length, 2);
  assert.equal(closeButtons.length, 2);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[0].getAttribute('aria-controls'), 'requestEditorPanel');
  assert.equal(panel.getAttribute('aria-labelledby'), tabs[0].id);
  assert.equal(tabs[0].querySelectorAll('.request-tab-close').length, 0);
  assert.equal(tabs[0].contains(closeButtons[0]), false);
  assert.equal(closeButtons[0].getAttribute('aria-label'), 'Close First Request');

  tabs[1].click();
  assert.deepEqual(selectCalls, ['request:collection-1:second']);
  closeButtons[0].click();
  assert.deepEqual(closeCalls, ['request:collection-1:first']);
});

test('opened request tab arrow navigation focuses the tab after selection rerenders', () => {
  const doc = createFakeDocument(['requestTabBar', 'requestEditorPanel']);
  const bar = doc.getElementById('requestTabBar');
  bar.setAttribute('role', 'tablist');
  let activeKey = 'request:collection-1:first';

  const render = () => renderRequestTabs({
    doc,
    groups: [{
      tabs: [
        { key: 'request:collection-1:first', dirty: false },
        { key: 'request:collection-1:second', dirty: false }
      ],
      resolve: (tab) => ({ id: tab.key, name: tab.key.endsWith('first') ? 'First Request' : 'Second Request', method: 'GET' }),
      isActive: (tab) => tab.key === activeKey,
      idPrefix: 'open-request-tab',
      controlsId: 'requestEditorPanel',
      buttonClassName: 'request-tab-button',
      methodText: (request) => request.method,
      title: (request) => request.name,
      closeTitle: () => 'Close request',
      closeAriaLabel: (request) => `Close ${request.name}`,
      onSelect: (tab) => {
        activeKey = tab.key;
        render();
      },
      onClose: () => {}
    }]
  });

  render();
  const firstTab = bar.querySelectorAll('[role="tab"]')[0];
  firstTab.listeners.get('keydown')({
    key: 'ArrowRight',
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(activeKey, 'request:collection-1:second');
  assert.equal(doc.activeElement.id, 'open-request-tab-request-collection-1-second');
  assert.equal(doc.activeElement.getAttribute('aria-selected'), 'true');
});

test('opened request tabs apply group-provided label and color classes', () => {
  const doc = createFakeDocument(['requestTabBar']);

  renderRequestTabs({
    doc,
    groups: [{
      tabs: [
        { key: 'request:collection-1:first', dirty: false },
        { key: 'runner-request:runner-1:first', dirty: false, runnerRequest: true, runnerId: 'runner-1' },
        { key: 'auth-request:runner:runner-1:first', dirty: false, authRefreshRequest: true, authRefreshOwnerType: 'runner', authRefreshOwnerId: 'runner-1' },
        { key: 'auth-request:performance:perf-1:first', dirty: false, authRefreshRequest: true, authRefreshOwnerType: 'performance', authRefreshOwnerId: 'perf-1' }
      ],
      resolve: (tab) => ({
        id: tab.key,
        name: tab.authRefreshRequest ? 'Auth Request' : tab.runnerRequest ? 'Runner Request' : 'Collection Request',
        method: tab.authRefreshRequest && tab.authRefreshOwnerType === 'performance' ? 'DELETE' : tab.authRefreshRequest ? 'GET' : tab.runnerRequest ? 'PATCH' : 'POST'
      }),
      isActive: () => false,
      buttonClassName: 'request-tab-button',
      methodText: (request, tab) => (tab.authRefreshRequest ? `AUTH - ${request.method}` : tab.runnerRequest ? `RUN - ${request.method}` : request.method),
      methodClassName: (request, tab) => (tab.authRefreshRequest ? (tab.authRefreshOwnerType === 'performance' ? 'entity-performance' : 'entity-runner') : tab.runnerRequest ? 'entity-runner' : `method-${request.method.toLowerCase()}`),
      title: (request) => request.name,
      closeTitle: () => 'Close request',
      closeAriaLabel: (request) => `Close ${request.name}`,
      onSelect: () => {},
      onClose: () => {}
    }]
  });

  const methodLabels = doc.getElementById('requestTabBar').querySelectorAll('.request-tab-method');

  assert.equal(methodLabels[0].textContent, 'POST');
  assert.equal(methodLabels[0].className.includes('method-post'), true);
  assert.equal(methodLabels[1].textContent, 'RUN - PATCH');
  assert.equal(methodLabels[1].className.includes('entity-runner'), true);
  assert.equal(methodLabels[2].textContent, 'AUTH - GET');
  assert.equal(methodLabels[2].className.includes('entity-runner'), true);
  assert.equal(methodLabels[3].textContent, 'AUTH - DELETE');
  assert.equal(methodLabels[3].className.includes('entity-performance'), true);
});

function createFakeDocument(ids = []) {
  const elements = new Map();
  const doc = {
    createElement(tagName) {
      const element = new FakeElement(tagName, doc);
      return element;
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    register(element) {
      if (element.id) {
        elements.set(element.id, element);
      }
    }
  };
  for (const id of ids) {
    const element = new FakeElement('div', doc);
    element.id = id;
    elements.set(id, element);
  }
  return doc;
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.title = '';
    this.tabIndex = 0;
    this.className = '';
    this.classList = {
      toggle: (className, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force) {
          classes.add(className);
        } else {
          classes.delete(className);
        }
        this.className = [...classes].join(' ');
      }
    };
  }

  set id(value) {
    this._id = String(value || '');
    this.ownerDocument?.register?.(this);
  }

  get id() {
    return this._id || '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  addEventListener(name, handler) {
    this.listeners.set(name, handler);
  }

  click() {
    this.listeners.get('click')?.({
      stopPropagation() {},
      preventDefault() {}
    });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  closest(selector) {
    for (let element = this; element; element = element.parentElement) {
      if (matches(element, selector)) {
        return element;
      }
    }
    return null;
  }

  contains(target) {
    if (target === this) {
      return true;
    }
    return this.children.some((child) => child.contains?.(target));
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matches(child, selector)) {
          results.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return results;
  }
}

function matches(element, selector) {
  if (selector === '[role="tab"]') {
    return element.getAttribute('role') === 'tab';
  }
  if (selector === '[role="tablist"]') {
    return element.getAttribute('role') === 'tablist';
  }
  if (selector.startsWith('.')) {
    return element.className.split(/\s+/).includes(selector.slice(1));
  }
  return false;
}
