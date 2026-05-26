const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('local file picker configures modal copy, selected local files, and request-import state', async () => {
  const { elements, sandbox, state } = loadLocalFilePickerController();

  sandbox.configureFilePickerModal({
    accept: '.json',
    dropDetail: 'Drop JSON here.',
    dropTitle: 'Drop request JSON',
    message: 'Choose a request JSON file.',
    title: 'Import Request'
  });
  assert.equal(elements.get('filePickerTitle').textContent, 'Import Request');
  assert.equal(elements.get('filePickerMessage').textContent, 'Choose a request JSON file.');
  assert.equal(elements.get('filePickerInput').accept, '.json');
  assert.equal(elements.get('filePickerDropZone').querySelector('strong').textContent, 'Drop request JSON');
  assert.equal(elements.get('filePickerDropZone').querySelector('span').textContent, 'Drop JSON here.');
  assert.equal(sandbox.useManualPathFromFilePicker, undefined);

  sandbox.activeFilePickerOptions = { kind: 'request-import' };
  await sandbox.selectLocalFileFromPicker({ name: 'dropped.json', size: 2, text: async () => '{}' });
  assert.deepEqual(fromVm(state.resolvedModal), {
    contentBase64: 'e30=',
    fileName: 'dropped.json',
    name: 'dropped.json',
    picker: 'request-import'
  });

  await sandbox.selectLocalFileFromPicker({ name: 'too-large.json', size: 11 * 1024 * 1024 });
  assert.match(elements.get('filePickerError').textContent, /10 MB or smaller/);
  assert.equal(elements.get('filePickerError').hidden, false);

  sandbox.activeFilePickerOptions = { kind: 'collection-import', readText: true };
  await sandbox.selectLocalFileFromPicker({
    name: 'collection.json',
    size: 17,
    text: async () => '{"item":[]}'
  });
  assert.deepEqual(fromVm(state.resolvedModal), {
    fileName: 'collection.json',
    name: 'collection.json',
    picker: 'collection-import',
    text: '{"item":[]}'
  });

  await sandbox.selectRequestImportFile({
    name: 'request.postmeter.json',
    size: 18,
    text: async () => '{"url":"https://x"}'
  });
  assert.equal(elements.get('requestImportFileSelection').textContent, 'Selected file: request.postmeter.json');
  assert.equal(elements.get('requestImportFileSelection').hidden, false);
  assert.equal(elements.get('confirmRequestImportButton').disabled, false);
});

test('local file source input menu and binding keep local paths workspace-local', async () => {
  const { elements, sandbox, state } = loadLocalFilePickerController();
  const input = elements.get('formDataFileInput');

  sandbox.configureLocalFileSourceInput(input, '', 'formdata');
  assert.equal(input.dataset.filePickerBound, 'true');
  assert.equal(input.dataset.fileSourceEnabled, 'true');
  assert.equal(input.getAttribute('aria-haspopup'), 'menu');

  input.dispatch('keydown', keyEvent('ArrowDown'));
  assert.equal(elements.get('fileSourceMenu').hidden, false);
  assert.equal(elements.get('fileSourceMenu').style.left, '20px');
  assert.equal(elements.get('fileSourceMenu').style.top, '44px');

  const selected = await sandbox.applySelectedFileSourceToInput(input, '', 'formdata', {
    name: 'upload.txt',
    source: 'upload.txt'
  });
  assert.equal(selected, true);
  assert.equal(input.value, 'upload.txt');
  assert.equal(input.inputDispatches, 1);
  assert.equal(state.collectCount, 1);
  assert.equal(state.statuses.at(-1), 'File source selected: upload.txt.');
  assert.deepEqual(fromVm(sandbox.workspace.settings.sandbox.fileBindings.map((binding) => ({
    fileName: binding.fileName,
    key: binding.key,
    bound: binding.bound,
    mode: binding.mode,
    source: binding.source
  }))), [{
    bound: true,
    fileName: 'upload.txt',
    key: 'payload',
    mode: 'formdata',
    source: 'upload.txt'
  }]);

  sandbox.updateLocalFileSourceInputState(input, { enabled: false });
  assert.equal(input.dataset.fileSourceEnabled, 'false');
  assert.equal(input.getAttribute('aria-haspopup'), undefined);
});

function loadLocalFilePickerController() {
  const elements = createElements();
  const state = { collectCount: 0, resolvedModal: null, statuses: [] };
  const workspace = { settings: { sandbox: { fileBindings: [] } } };
  const sandbox = {
    Event: FakeEvent,
    activeFilePickerOptions: null,
    activeFileSourceTarget: null,
    selectedRequestImportText: '',
    selectedRequestImportFileName: '',
    selectedRequestImportFilePath: '',
    cloneWorkspaceSettings: () => JSON.parse(JSON.stringify(workspace.settings)),
    closeContextMenu() {},
    closeToolbarMenus() {},
    collectBodyEditorAndMarkDirty: () => { state.collectCount += 1; },
    document: { createElement: (tagName) => new FakeElement(tagName) },
    ensureSettings: () => {
      workspace.settings ||= { sandbox: {} };
      workspace.settings.sandbox ||= {};
      workspace.settings.sandbox.fileBindings ||= [];
    },
    normalizeSandboxFileBindings: (bindings) => bindings.map((binding) => ({ ...binding, enabled: binding.enabled !== false })),
    rendererEntityDisplay: {
      fileNameFromLocalPath: (filePath) => String(filePath || '').split(/[\\/]/).filter(Boolean).pop() || 'file'
    },
    resolveActiveModal: (value) => { state.resolvedModal = value; },
    saveWorkspaceSettingsWithRollback: async () => true,
    setStatus: (message) => state.statuses.push(message),
    window: {
      innerHeight: 600,
      innerWidth: 800,
      postmeter: {
        fileBindings: {
          choose: async (payload) => ({
            cancelled: false,
            binding: {
              bound: true,
              contentType: payload.contentType || '',
              fileName: payload.fileName || 'upload.txt',
              key: payload.key || '',
              mode: payload.mode || 'file',
              reviewedAt: '2026-05-25T00:00:00.000Z',
              source: payload.source
            }
          }),
          storeContent: async (payload) => ({
            cancelled: false,
            binding: {
              bound: true,
              contentType: payload.contentType || '',
              fileName: payload.fileName || 'upload.txt',
              key: payload.key || '',
              mode: payload.mode || 'file',
              reviewedAt: '2026-05-25T00:00:00.000Z',
              source: payload.source
            }
          })
        },
        localFiles: {
          storeContent: async (payload) => ({
            cancelled: false,
            binding: {
              bound: true,
              fileName: payload.fileName || 'file',
              source: `postmeter-local-file/file/test/${payload.fileName || 'file'}`
            }
          })
        }
      }
    },
    workspace,
    $: (id) => elements.get(id) || null
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/ui/localFilePickerController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, sandbox, state };
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

function createElements() {
  const dropZone = new FakeElement('div');
  dropZone.children.push(new FakeElement('strong'), new FakeElement('span'));
  const fileSourceMenu = new FakeElement('div');
  fileSourceMenu.hidden = true;
  fileSourceMenu.offsetHeight = 100;
  fileSourceMenu.offsetWidth = 140;
  fileSourceMenu.children.push(new FakeElement('button'));
  const formRow = new FakeElement('div');
  const keyInput = new FakeElement('input');
  keyInput.dataset.bodyFormDataField = 'key';
  keyInput.value = 'payload';
  const fileInput = new FakeElement('input');
  fileInput.parentElement = formRow;
  formRow.children.push(keyInput, fileInput);
  fileInput.getBoundingClientRect = () => ({ bottom: 40, left: 20 });
  return new Map([
    ['filePickerTitle', new FakeElement('div')],
    ['filePickerMessage', new FakeElement('div')],
    ['filePickerInput', new FakeElement('input')],
    ['filePickerDropZone', dropZone],
    ['filePickerError', new FakeElement('div')],
    ['requestImportFileSelection', new FakeElement('div')],
    ['requestImportError', new FakeElement('div')],
    ['requestImportTextInput', new FakeElement('textarea')],
    ['confirmRequestImportButton', new FakeElement('button')],
    ['fileSourceMenu', fileSourceMenu],
    ['formDataFileInput', fileInput]
  ]);
}

function keyEvent(key) {
  return {
    key,
    preventDefault() {},
    stopPropagation() {}
  };
}

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles === true;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.accept = '';
    this.attributes = {};
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.disabled = false;
    this.focusCount = 0;
    this.hidden = false;
    this.inputDispatches = 0;
    this.listeners = {};
    this.offsetHeight = 0;
    this.offsetWidth = 0;
    this.parentElement = null;
    this.placeholder = '';
    this.style = {};
    this.tagName = tagName.toUpperCase();
    this.textContent = '';
    this.value = '';
    this.classList = {
      add: (name) => {
        this.className = [this.className, name].filter(Boolean).join(' ');
      },
      remove: (name) => {
        this.className = this.className.split(/\s+/).filter((item) => item !== name).join(' ');
      }
    };
  }

  addEventListener(type, listener) {
    this.listeners[type] ||= [];
    this.listeners[type].push(listener);
  }

  closest(selector) {
    if (selector === '[data-body-form-data-row]') {
      return this.parentElement;
    }
    return null;
  }

  dispatch(type, event) {
    for (const listener of this.listeners[type] || []) {
      listener(event);
    }
  }

  dispatchEvent(event) {
    if (event.type === 'input') {
      this.inputDispatches += 1;
    }
    this.dispatch(event.type, event);
  }

  focus() {
    this.focusCount += 1;
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelector(selector) {
    if (selector === 'strong') {
      return this.children.find((child) => child.tagName === 'STRONG') || null;
    }
    if (selector === 'span') {
      return this.children.find((child) => child.tagName === 'SPAN') || null;
    }
    if (selector === 'button') {
      return this.children.find((child) => child.tagName === 'BUTTON') || null;
    }
    if (selector === '[data-body-form-data-field="key"]') {
      return this.children.find((child) => child.dataset?.bodyFormDataField === 'key') || null;
    }
    return null;
  }
}
