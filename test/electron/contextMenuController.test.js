const assert = require('node:assert/strict');
const test = require('node:test');

test('context menu clamps placement, closes peers, focuses first item, and restores trigger focus', () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  try {
    const { contextMenu, document, trigger } = installContextMenuGlobals();
    const controller = freshContextMenuController();
    let peerClosed = 0;
    controller.setContextMenuPeerCloser(() => { peerClosed += 1; });

    controller.showContextMenu(999, 999, [
      ['Open', () => {}],
      ['Delete', () => {}, 'danger']
    ], { focusFirst: true, trigger });

    assert.equal(peerClosed, 1);
    assert.equal(contextMenu.hidden, false);
    assert.equal(contextMenu.style.left, '272px');
    assert.equal(contextMenu.style.top, '172px');
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(document.activeElement.textContent, 'Open');
    assert.equal(contextMenu.children[1].className, 'danger');

    contextMenu.onkeydown(keyEvent('Escape', document.activeElement));
    assert.equal(contextMenu.hidden, true);
    assert.equal(contextMenu.textContent, '');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, trigger);
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }
});

test('context menu supports keyboard submenu entry and keyboard activation close behavior', () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  try {
    const { contextMenu, document, trigger } = installContextMenuGlobals();
    const controller = freshContextMenuController();
    const actions = [];

    controller.showContextMenu(12, 20, [
      ['Export', [
        ['PostMeter', () => actions.push('postmeter')],
        ['curl', () => actions.push('curl')]
      ]],
      ['Rename', () => actions.push('rename')]
    ], { focusFirst: true, trigger });

    const submenuTrigger = contextMenu.children[0].children[0];
    contextMenu.onkeydown(keyEvent('ArrowRight', submenuTrigger));
    assert.equal(submenuTrigger.getAttribute('aria-expanded'), 'true');
    assert.equal(document.activeElement.textContent, 'PostMeter');

    contextMenu.onkeydown(keyEvent(' ', document.activeElement));
    assert.deepEqual(actions, ['postmeter']);
    assert.equal(contextMenu.hidden, true);
    assert.equal(document.activeElement, trigger);
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }
});

function freshContextMenuController() {
  const modulePath = require.resolve('../../src/renderer/ui/contextMenu');
  delete require.cache[modulePath];
  return require(modulePath);
}

function installContextMenuGlobals() {
  const contextMenu = new FakeElement('div');
  contextMenu.id = 'contextMenu';
  contextMenu.offsetWidth = 120;
  contextMenu.offsetHeight = 120;
  contextMenu.hidden = true;
  const trigger = new FakeElement('button');
  trigger.isConnected = true;
  const document = {
    activeElement: null,
    createElement: (tagName) => new FakeElement(tagName, document),
    getElementById: (id) => id === 'contextMenu' ? contextMenu : null
  };
  contextMenu.ownerDocument = document;
  trigger.ownerDocument = document;
  global.document = document;
  global.window = { innerHeight: 300, innerWidth: 400 };
  return { contextMenu, document, trigger };
}

function keyEvent(key, target, extra = {}) {
  return {
    key,
    target,
    shiftKey: extra.shiftKey === true,
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    }
  };
}

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.attributes = {};
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.isConnected = true;
    this.listeners = {};
    this.offsetHeight = 0;
    this.offsetWidth = 0;
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.style = {};
    this.tagName = tagName.toUpperCase();
    this._textContent = '';
    this.type = '';
  }

  append(...children) {
    for (const child of children.flat()) {
      child.parentElement = this;
      if (!child.ownerDocument) {
        child.ownerDocument = this.ownerDocument;
      }
      this.children.push(child);
    }
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

  addEventListener(type, listener) {
    this.listeners[type] ||= [];
    this.listeners[type].push(listener);
  }

  click() {
    for (const listener of this.listeners.click || []) {
      listener({ preventDefault() {}, stopPropagation() {} });
    }
  }

  focus() {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  querySelector(selector) {
    if (selector === 'button') {
      return this.find((element) => element.tagName === 'BUTTON');
    }
    if (selector === ':scope > button:not([disabled])') {
      return this.children.find((child) => child.tagName === 'BUTTON' && child.disabled !== true) || null;
    }
    if (selector === '.context-submenu button:not([disabled])') {
      const submenu = this.find((element) => hasClass(element, 'context-submenu'));
      return submenu?.find((element) => element.tagName === 'BUTTON' && element.disabled !== true) || null;
    }
    return null;
  }

  closest(selector) {
    for (let element = this; element; element = element.parentElement) {
      if (element.matches(selector)) {
        return element;
      }
    }
    return null;
  }

  matches(selector) {
    if (selector === '.context-submenu-row') {
      return hasClass(this, 'context-submenu-row');
    }
    if (selector === '.context-submenu') {
      return hasClass(this, 'context-submenu');
    }
    if (selector === '.context-submenu-row > button[aria-haspopup="menu"]') {
      return this.tagName === 'BUTTON'
        && this.getAttribute('aria-haspopup') === 'menu'
        && hasClass(this.parentElement, 'context-submenu-row');
    }
    return false;
  }

  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) {
        return child;
      }
      const nested = child.find?.(predicate);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
}

function hasClass(element, className) {
  return String(element?.className || '').split(/\s+/).includes(className);
}
