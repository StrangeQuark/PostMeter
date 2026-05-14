const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildVariableSuggestions,
  createVariableAutocomplete,
  findVariableToken,
  isVariableAutocompleteEligible,
  MENU_ID,
  menuPositionFromAnchor,
  replaceVariableToken
} = require('../../src/renderer/variableAutocomplete');

test('variable autocomplete only applies to editable non-script text inputs', () => {
  assert.equal(isVariableAutocompleteEligible({ tagName: 'INPUT', type: 'text', id: 'urlInput' }), true);
  assert.equal(isVariableAutocompleteEligible({ tagName: 'TEXTAREA', id: 'bodyInput' }), true);
  assert.equal(isVariableAutocompleteEligible({ tagName: 'TEXTAREA', id: 'preRequestScriptInput' }), false);
  assert.equal(isVariableAutocompleteEligible({ tagName: 'INPUT', type: 'number', id: 'loadRequests' }), false);
  assert.equal(isVariableAutocompleteEligible({ tagName: 'INPUT', type: 'text', id: 'authOauthUserCodeInput', readOnly: true }), false);
});

test('variable autocomplete finds the active token around the cursor', () => {
  assert.deepEqual(findVariableToken('Bearer {{tok', 12), {
    start: 7,
    end: 12,
    open: '{{',
    close: '}}',
    query: 'tok'
  });
  assert.deepEqual(findVariableToken('x={{tenant}}', 8), {
    start: 2,
    end: 12,
    open: '{{',
    close: '}}',
    query: 'tena'
  });
  assert.deepEqual(findVariableToken('url=${requestU', 14), {
    start: 4,
    end: 14,
    open: '${',
    close: '}',
    query: 'requestU'
  });
  assert.equal(findVariableToken('{{token}}', 9), null);
  assert.equal(findVariableToken('${token}', 8), null);
  assert.equal(findVariableToken('no token here', 5), null);
});

test('variable autocomplete suggestions sort keys and filter by prefix before contains matches', () => {
  assert.deepEqual(buildVariableSuggestions([
    { enabled: true, key: 'zeta', value: '3' },
    { enabled: true, key: 'token', value: '1' },
    { enabled: true, key: 'refreshToken', value: '2' },
    { enabled: false, key: 'disabled', value: '4' },
    { enabled: true, key: 'token', value: 'override' }
  ], 'to'), [
    { key: 'token', value: 'override' },
    { key: 'refreshToken', value: '2' }
  ]);
});

test('variable autocomplete filters CSV and Postman variable suggestions by token syntax', () => {
  const variables = [
    { enabled: true, key: 'baseUrl', source: 'environment', value: 'https://api.example.test' },
    { enabled: true, key: 'requestId', source: 'request', value: '123' },
    { enabled: true, key: 'url', source: 'csv', value: 'https://csv.example.test' },
    { enabled: true, key: 'userId', source: 'iteration', value: 'csv-user' }
  ];

  assert.deepEqual(buildVariableSuggestions(variables, '', { token: { open: '${' } }), [
    { key: 'url', showValue: false },
    { key: 'userId', showValue: false }
  ]);
  assert.deepEqual(buildVariableSuggestions(variables, '', { token: { open: '{{' } }), [
    { key: 'baseUrl', value: 'https://api.example.test' },
    { key: 'requestId', value: '123' }
  ]);
});

test('variable autocomplete replaces the open token with the selected environment variable', () => {
  const token = findVariableToken('Authorization: Bearer {{tok', 27);
  assert.deepEqual(replaceVariableToken('Authorization: Bearer {{tok', token, 'token'), {
    value: 'Authorization: Bearer {{token}}',
    selectionStart: 31,
    selectionEnd: 31
  });
  const dollarToken = findVariableToken('URL ${req', 9);
  assert.deepEqual(replaceVariableToken('URL ${req', dollarToken, 'requestUrl'), {
    value: 'URL ${requestUrl}',
    selectionStart: 17,
    selectionEnd: 17
  });
});

test('variable autocomplete positions the menu from the token anchor rectangle', () => {
  assert.deepEqual(
    menuPositionFromAnchor(
      { left: 186, top: 120, bottom: 138 },
      220,
      140,
      1280,
      720
    ),
    { left: 186, top: 142 }
  );
});

test('variable autocomplete connects the listbox to the active input and updates active descendants', () => {
  const doc = createFakeDocument();
  const input = doc.createElement('textarea');
  input.id = 'bodyInput';
  input.tagName = 'TEXTAREA';
  input.value = 'Bearer {{tok';
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
  doc.elements.set(input.id, input);

  const autocomplete = createVariableAutocomplete({
    doc,
    windowObject: {
      Event: class Event {
        constructor(type) {
          this.type = type;
        }
      },
      getComputedStyle: () => ({
        borderStyle: 'solid',
        borderWidth: '1px',
        boxSizing: 'border-box',
        direction: 'ltr',
        font: '12px sans-serif',
        fontFamily: 'sans-serif',
        fontSize: '12px',
        fontStyle: 'normal',
        fontVariant: 'normal',
        fontWeight: '400',
        letterSpacing: '0px',
        lineHeight: '16px',
        padding: '4px',
        tabSize: '4',
        textAlign: 'left',
        textIndent: '0',
        textTransform: 'none',
        wordSpacing: '0'
      }),
      innerHeight: 720,
      innerWidth: 1280
    },
    getVariables: () => [
      { enabled: true, key: 'token', value: 'secret' },
      { enabled: true, key: 'tokenBackup', value: 'backup' }
    ]
  });

  assert.equal(autocomplete.refresh(input), true);
  assert.equal(input.attributes.role, undefined);
  assert.equal(input.attributes['aria-autocomplete'], 'list');
  assert.equal(input.attributes['aria-controls'], MENU_ID);
  assert.equal(input.attributes['aria-expanded'], 'true');
  assert.equal(input.attributes['aria-haspopup'], 'listbox');
  assert.equal(input.attributes['aria-activedescendant'], `${MENU_ID}Option0`);
  assert.equal(doc.getElementById(MENU_ID).children[0].tagName, 'DIV');
  assert.equal(doc.getElementById(MENU_ID).children[0].attributes.role, 'option');

  doc.listeners.get('keydown')({
    key: 'ArrowDown',
    target: input,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(input.attributes['aria-activedescendant'], `${MENU_ID}Option1`);

  doc.listeners.get('keydown')({
    key: 'ArrowUp',
    target: input,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(input.attributes['aria-activedescendant'], `${MENU_ID}Option0`);

  autocomplete.close();
  assert.equal(input.attributes.role, undefined);
  assert.equal(input.attributes['aria-controls'], undefined);
  assert.equal(input.attributes['aria-haspopup'], undefined);
  assert.equal(input.attributes['aria-expanded'], undefined);
  autocomplete.destroy();
});

test('variable autocomplete renders CSV suggestions as key-only rows', () => {
  const doc = createFakeDocument();
  const input = doc.createElement('input');
  input.id = 'urlInput';
  input.tagName = 'INPUT';
  input.type = 'text';
  input.value = '${ur';
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
  doc.elements.set(input.id, input);

  const autocomplete = createVariableAutocomplete({
    doc,
    windowObject: {
      Event: class Event {
        constructor(type) {
          this.type = type;
        }
      },
      getComputedStyle: () => ({
        borderStyle: 'solid',
        borderWidth: '1px',
        boxSizing: 'border-box',
        direction: 'ltr',
        font: '12px sans-serif',
        fontFamily: 'sans-serif',
        fontSize: '12px',
        fontStyle: 'normal',
        fontVariant: 'normal',
        fontWeight: '400',
        letterSpacing: '0px',
        lineHeight: '16px',
        padding: '4px',
        tabSize: '4',
        textAlign: 'left',
        textIndent: '0',
        textTransform: 'none',
        wordSpacing: '0'
      }),
      innerHeight: 720,
      innerWidth: 1280
    },
    getVariables: () => [
      { enabled: true, key: 'baseUrl', source: 'environment', value: 'https://api.example.test' },
      { enabled: true, key: 'url', source: 'csv', value: 'https://csv.example.test' }
    ]
  });

  assert.equal(autocomplete.refresh(input), true);
  const option = doc.getElementById(MENU_ID).children[0];
  assert.equal(option.children.length, 1);
  assert.equal(option.children[0].textContent, 'url');
  assert.equal(option.children.some((child) => child.className === 'variable-autocomplete-value'), false);
  autocomplete.destroy();
});

test('variable autocomplete uses combobox role only for single-line inputs and restores prior roles', () => {
  const doc = createFakeDocument();
  const input = doc.createElement('input');
  input.id = 'urlInput';
  input.tagName = 'INPUT';
  input.type = 'text';
  input.value = 'https://example.test/{{bas';
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
  input.setAttribute('role', 'searchbox');
  doc.elements.set(input.id, input);

  const autocomplete = createVariableAutocomplete({
    doc,
    windowObject: {
      Event: class Event {
        constructor(type) {
          this.type = type;
        }
      },
      getComputedStyle: () => ({
        borderStyle: 'solid',
        borderWidth: '1px',
        boxSizing: 'border-box',
        direction: 'ltr',
        font: '12px sans-serif',
        fontFamily: 'sans-serif',
        fontSize: '12px',
        fontStyle: 'normal',
        fontVariant: 'normal',
        fontWeight: '400',
        letterSpacing: '0px',
        lineHeight: '16px',
        padding: '4px',
        tabSize: '4',
        textAlign: 'left',
        textIndent: '0',
        textTransform: 'none',
        wordSpacing: '0'
      }),
      innerHeight: 720,
      innerWidth: 1280
    },
    getVariables: () => [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }]
  });

  assert.equal(autocomplete.refresh(input), true);
  assert.equal(input.attributes.role, 'combobox');
  assert.equal(input.attributes['aria-haspopup'], 'listbox');
  autocomplete.close();
  assert.equal(input.attributes.role, 'searchbox');
  assert.equal(input.attributes['aria-haspopup'], undefined);
  autocomplete.destroy();
});

function createFakeDocument() {
  const elements = new Map();
  const listeners = new Map();
  const documentElement = createFakeElement('html');
  const body = createFakeElement('body');
  return {
    body,
    documentElement,
    elements,
    listeners,
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    removeEventListener(name, handler) {
      if (listeners.get(name) === handler) {
        listeners.delete(name);
      }
    },
    createElement(tagName) {
      return createFakeElement(tagName, elements);
    },
    getElementById(id) {
      return elements.get(id) || null;
    }
  };
}

function createFakeElement(tagName, elements = new Map()) {
  const children = [];
  const element = {
    attributes: {},
    children,
    classList: { add() {} },
    hidden: false,
    id: '',
    offsetHeight: 40,
    selectionEnd: 0,
    selectionStart: 0,
    style: {},
    tagName: String(tagName).toUpperCase(),
    textContent: '',
    addEventListener() {},
    append(...items) {
      for (const item of items) {
        children.push(item);
        if (item.id) {
          elements.set(item.id, item);
        }
      }
    },
    contains(target) {
      return target === element || children.includes(target);
    },
    dispatchEvent() {},
    getBoundingClientRect() {
      return { left: 10, top: 20, bottom: 40, width: 320, height: 120 };
    },
    querySelector(selector) {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return children.find((child) => child.id === id) || null;
      }
      if (selector === '[data-variable-autocomplete-part="before"]') {
        return children.find((child) => child.dataset?.variableAutocompletePart === 'before') || null;
      }
      if (selector === '[data-variable-autocomplete-part="marker"]') {
        return children.find((child) => child.dataset?.variableAutocompletePart === 'marker') || null;
      }
      return null;
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
  Object.defineProperty(element, 'dataset', {
    configurable: true,
    value: {}
  });
  Object.defineProperty(element, 'id', {
    get() {
      return this._id || '';
    },
    set(value) {
      this._id = String(value || '');
      if (this._id) {
        elements.set(this._id, element);
      }
    }
  });
  return element;
}
