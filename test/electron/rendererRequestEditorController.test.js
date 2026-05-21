const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('request editor controller collects form-data, binary, and GraphQL body state from DOM controls', () => {
  const { elements, fileSourceStates, sandbox } = loadRequestEditorController();
  elements.get('bodyTypeSelect').value = 'FORM_DATA';

  sandbox.renderBodyFormDataRows('', [
    { enabled: false, key: 'message', type: 'text', value: '{{localToken}}' },
    { enabled: true, key: 'upload', type: 'file', value: 'fixtures/upload.txt' }
  ]);

  const formData = sandbox.collectBodyFromEditor('');
  assert.equal(formData.bodyType, 'FORM_DATA');
  assert.deepEqual(fromVm(formData.postmanBody), {
    mode: 'formdata',
    formdata: [
      { disabled: true, key: 'message', type: 'text', value: '{{localToken}}' },
      { disabled: false, key: 'upload', type: 'file', src: 'fixtures/upload.txt' }
    ]
  });
  assert.ok(fileSourceStates.some((entry) => entry.mode === 'formdata' && entry.enabled === true));

  elements.get('bodyTypeSelect').value = 'BINARY';
  elements.get('binaryBodySourceInput').value = 'fixtures/data.csv';
  assert.deepEqual(fromVm(sandbox.collectBodyFromEditor('')), {
    body: '',
    bodyType: 'BINARY',
    postmanBody: {
      mode: 'binary',
      binary: {
        src: 'fixtures/data.csv',
        contentType: 'text/csv'
      }
    }
  });

  elements.get('bodyTypeSelect').value = 'GRAPHQL';
  elements.get('graphqlQueryInput').value = 'query User($id: ID!) { user(id: $id) { id name } }';
  elements.get('graphqlVariablesInput').value = '{"id":"{{userId}}"}';
  elements.get('graphqlOperationNameInput').value = '  User  ';
  const graphql = sandbox.collectBodyFromEditor('');
  assert.equal(graphql.bodyType, 'RAW_JSON');
  assert.equal(graphql.protocol, 'graphql');
  assert.deepEqual(fromVm(graphql.graphql), {
    query: 'query User($id: ID!) { user(id: $id) { id name } }',
    variables: '{"id":"{{userId}}"}',
    operationName: 'User'
  });
  assert.deepEqual(JSON.parse(graphql.body), fromVm(graphql.graphql));
  assert.equal(graphql.postmanBody.mode, 'graphql');
});

test('request editor controller syncs GraphQL model state and clears stale GraphQL protocol on mode changes', () => {
  const { elements, sandbox } = loadRequestEditorController();
  const request = {
    body: 'stale',
    bodyType: 'RAW_JSON',
    graphql: { query: 'query Old { old }' },
    postmanBody: { mode: 'graphql', graphql: { query: 'query Old { old }' } },
    protocol: 'graphql'
  };

  elements.get('bodyTypeSelect').value = 'NONE';
  sandbox.syncRequestBodyFieldsFromEditor('', request);
  assert.equal(request.bodyType, 'NONE');
  assert.equal(request.body, '');
  assert.equal(request.protocol, 'http');
  assert.equal(Object.hasOwn(request, 'graphql'), false);

  elements.get('bodyTypeSelect').value = 'GRAPHQL';
  elements.get('graphqlQueryInput').value = 'mutation Save { save }';
  elements.get('graphqlVariablesInput').value = '{}';
  elements.get('graphqlOperationNameInput').value = 'Save';
  sandbox.syncRequestBodyFieldsFromEditor('', request);
  assert.equal(request.bodyType, 'RAW_JSON');
  assert.equal(request.protocol, 'graphql');
  assert.deepEqual(fromVm(request.graphql), {
    query: 'mutation Save { save }',
    variables: '{}',
    operationName: 'Save'
  });
});

test('request cookie manager validates Set-Cookie text, blocks managed cookies, and mutates only user-owned cookies', () => {
  const { elements, sandbox, state } = loadRequestEditorController({
    managedCookieNames: () => ['refresh_session']
  });
  sandbox.workspace.cookies = [
    sandbox.newWorkspaceCookie({
      id: 'editable-cookie',
      name: 'session',
      value: 'old',
      domain: 'example.test',
      path: '/',
      hostOnly: false
    }),
    sandbox.newWorkspaceCookie({
      id: 'managed-cookie',
      name: 'refresh_session',
      value: 'secret',
      domain: 'example.test',
      path: '/',
      source: 'auth-refresh'
    })
  ];

  assert.throws(
    () => sandbox.parseSetCookieTextForManager('broken; Path=/', 'example.test'),
    /name=value/
  );
  assert.throws(
    () => sandbox.parseSetCookieTextForManager('x=1; Domain=example.test; SameSite=None', 'example.test'),
    /SameSite=None requires Secure/
  );

  sandbox.cookieManagerDraftText = 'session=next; Path=api; Domain=.example.test; Secure; HttpOnly; SameSite=None; Priority=High; Partitioned; Enabled=false; extension=value;';
  sandbox.saveCookieManagerDraft(0, 'example.test');

  assert.equal(sandbox.workspace.cookies[0].id, 'editable-cookie');
  assert.equal(sandbox.workspace.cookies[0].name, 'session');
  assert.equal(sandbox.workspace.cookies[0].value, 'next');
  assert.equal(sandbox.workspace.cookies[0].domain, 'example.test');
  assert.equal(sandbox.workspace.cookies[0].path, '/api');
  assert.equal(sandbox.workspace.cookies[0].secure, true);
  assert.equal(sandbox.workspace.cookies[0].httpOnly, true);
  assert.equal(sandbox.workspace.cookies[0].sameSite, 'None');
  assert.equal(sandbox.workspace.cookies[0].partitioned, true);
  assert.equal(sandbox.workspace.cookies[0].enabled, false);
  assert.deepEqual(fromVm(sandbox.workspace.cookies[0].extensions), ['extension=value']);
  assert.ok(state.dirtyCount >= 1);
  assert.equal(state.statuses.at(-1), 'Saved cookie session.', elements.get('cookiesModalError').textContent);

  sandbox.removeCookieManagerCookie(1);
  assert.equal(sandbox.workspace.cookies.length, 2);
  assert.match(elements.get('cookiesModalError').textContent, /managed by Refreshing Auth/);

  sandbox.removeCookieManagerCookie(0);
  assert.deepEqual(sandbox.workspace.cookies.map((cookie) => cookie.name), ['refresh_session']);

  sandbox.removeCookieManagerDomain('example.test');
  assert.deepEqual(sandbox.workspace.cookies, []);
  assert.equal(state.statuses.at(-1), 'Removed 1 cookies from example.test.');
});

function loadRequestEditorController(options = {}) {
  const elements = createRequestEditorElements();
  const fileSourceStates = [];
  const state = { dirtyCount: 0, statuses: [] };
  const sandbox = {
    BODY_TYPES: ['NONE', 'FORM_DATA', 'URLENCODED', 'RAW_TEXT', 'RAW_JSON', 'RAW_HTML', 'RAW_XML', 'RAW_JAVASCRIPT', 'BINARY'],
    CodeEditor: { refreshEditor() {}, setLanguage() {} },
    FILE_EXTENSION_CONTENT_TYPES: new Map([['.csv', 'text/csv']]),
    Option: FakeOption,
    URL,
    activeCookieManagerManagedCookieNames: () => options.managedCookieNames?.() || [],
    activeCookieManagerRequestUrl: () => 'https://example.test/api',
    activeMainPanel: 'request',
    activeRequest: () => ({ url: 'https://example.test/api' }),
    activeRequestManagedRefreshingCookieNames: () => options.managedCookieNames?.() || [],
    cloneJson: (value) => JSON.parse(JSON.stringify(value)),
    closeFileSourceMenu() {},
    configureLocalFileSourceInput() {},
    cookieManagerDraftText: '',
    cookieManagerErrorMessage: '',
    cookieManagerExtraDomains: new Set(),
    cookieManagerSelectedCookieIndex: -1,
    crypto: { randomUUID: deterministicId },
    detectFileContentType: (source) => String(source).endsWith('.csv') ? 'text/csv' : 'application/octet-stream',
    document: { createElement: (tagName) => new FakeElement(tagName) },
    domainFromRequestUrl: (url) => new URL(url).hostname,
    markCookieJarDirty: () => { state.dirtyCount += 1; },
    newWorkspaceCookie: (cookie) => ({
      enabled: cookie.enabled !== false,
      id: cookie.id || deterministicId(),
      name: String(cookie.name || ''),
      value: String(cookie.value ?? ''),
      domain: String(cookie.domain || ''),
      path: String(cookie.path || '/'),
      expiresAt: cookie.expiresAt || '',
      secure: cookie.secure === true,
      httpOnly: cookie.httpOnly === true,
      sameSite: cookie.sameSite || '',
      hostOnly: cookie.hostOnly !== false,
      priority: cookie.priority || '',
      partitioned: cookie.partitioned === true,
      extensions: Array.isArray(cookie.extensions) ? cookie.extensions : [],
      source: cookie.source || ''
    }),
    refreshCodeEditorIfTextarea() {},
    refreshVariableHighlights() {},
    renderCookieJarEditor() {},
    renderPerformanceCookieJarEditor() {},
    rendererCookieMatchesHost: (cookie, host) => String(cookie?.domain || '').replace(/^\./, '') === host,
    setStatus: (message) => state.statuses.push(message),
    syncPostmanFileReferences: (request) => { request.fileReferencesSynced = true; },
    updateLocalFileSourceInputState: (_input, entry) => fileSourceStates.push(entry),
    workspace: { cookies: [] },
    $: (id) => elements.get(id) || null
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/ui/requestEditorController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  sandbox.activeRequestManagedRefreshingCookieNames = () => options.managedCookieNames?.() || [];
  sandbox.renderCookieJarEditor = () => {};
  sandbox.renderPerformanceCookieJarEditor = () => {};
  sandbox.renderWorkspaceCookieManager = () => {};
  return { elements, fileSourceStates, sandbox, state };
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRequestEditorElements() {
  return new Map([
    ['bodyTypeSelect', new FakeElement('select')],
    ['bodyRawFormatSelect', new FakeElement('select')],
    ['bodyInput', new FakeElement('textarea')],
    ['formDataBodyTable', new FakeElement('div')],
    ['urlencodedBodyTable', new FakeElement('div')],
    ['binaryBodySourceInput', new FakeElement('input')],
    ['graphqlQueryInput', new FakeElement('textarea')],
    ['graphqlVariablesInput', new FakeElement('textarea')],
    ['graphqlOperationNameInput', new FakeElement('input')],
    ['cookiesDomainList', new FakeElement('div')],
    ['cookiesModalError', new FakeElement('div')]
  ]);
}

let nextId = 0;
function deterministicId() {
  nextId += 1;
  return `id-${nextId}`;
}

class FakeOption {
  constructor(text, value) {
    this.textContent = text;
    this.value = value;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.attributes = {};
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.listeners = {};
    this.parentElement = null;
    this.placeholder = '';
    this.tagName = tagName.toUpperCase();
    this.textContent = '';
    this.type = tagName === 'button' ? 'button' : '';
    this.value = '';
    this.checked = false;
    this.classList = {
      add: (...names) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const name of names) {
          values.add(name);
        }
        this.className = [...values].join(' ');
      },
      remove: (...names) => {
        const remove = new Set(names);
        this.className = this.className.split(/\s+/).filter((name) => !remove.has(name)).join(' ');
      },
      toggle: (name, force) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force == null ? !values.has(name) : force === true;
        if (enabled) {
          values.add(name);
        } else {
          values.delete(name);
        }
        this.className = [...values].join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name)
    };
  }

  append(...children) {
    for (const child of children.flat()) {
      if (child && typeof child === 'object') {
        child.parentElement = this;
      }
      this.children.push(child);
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

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') {
        return;
      }
      if (matchesSelector(node, selector)) {
        results.push(node);
      }
      for (const child of node.children || []) {
        visit(child);
      }
    };
    for (const child of this.children) {
      visit(child);
    }
    return results;
  }
}

function matchesSelector(element, selector) {
  if (selector === '[data-body-form-data-row]') {
    return element.dataset?.bodyFormDataRow != null;
  }
  if (selector === '[data-body-urlencoded-row]') {
    return element.dataset?.bodyUrlencodedRow != null;
  }
  if (selector === '[data-body-form-data-field="type"]') {
    return element.dataset?.bodyFormDataField === 'type';
  }
  if (selector === '[data-body-form-data-field="key"]') {
    return element.dataset?.bodyFormDataField === 'key';
  }
  if (selector === '[data-body-form-data-field="value"]') {
    return element.dataset?.bodyFormDataField === 'value';
  }
  if (selector === '[data-body-urlencoded-field="key"]') {
    return element.dataset?.bodyUrlencodedField === 'key';
  }
  if (selector === '[data-body-urlencoded-field="value"]') {
    return element.dataset?.bodyUrlencodedField === 'value';
  }
  if (selector === 'input[type="checkbox"]') {
    return element.tagName === 'INPUT' && element.type === 'checkbox';
  }
  return false;
}
