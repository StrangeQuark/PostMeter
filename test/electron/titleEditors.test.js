const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('request title editor saves changed names on Enter and reverts on Escape', () => {
  const { elements, request, sandbox, state } = loadTitleEditors();
  const title = elements.get('requestNameTitle');

  sandbox.beginRequestTitleEdit();
  assert.equal(title.dataset.editing, 'true');
  assert.equal(title.getAttribute('contenteditable'), 'plaintext-only');
  assert.equal(title.getAttribute('role'), 'textbox');
  assert.equal(state.selectedElement, title);

  title.textContent = 'Updated request';
  sandbox.handleRequestTitleKeydown(keyEvent('Enter'));
  assert.equal(request.name, 'Updated request');
  assert.equal(title.dataset.editing, undefined);
  assert.equal(title.getAttribute('contenteditable'), 'false');
  assert.equal(title.getAttribute('role'), undefined);
  assert.equal(state.saveRequestCount, 1);
  assert.equal(state.renderCollectionsCount, 1);
  assert.equal(state.renderTabsCount, 1);

  sandbox.beginRequestTitleEdit();
  title.textContent = 'Throw away';
  sandbox.handleRequestTitleKeydown(keyEvent('Escape'));
  assert.equal(request.name, 'Updated request');
  assert.equal(title.textContent, 'Updated request');
  assert.equal(state.saveRequestCount, 1);
});

test('performance title editor saves and refreshes performance-owned UI state', () => {
  const { elements, performanceTest, sandbox, state } = loadTitleEditors();
  const title = elements.get('performanceMainTitle');

  sandbox.beginPerformanceTitleEdit();
  title.textContent = 'Soak candidate';
  sandbox.handlePerformanceTitleKeydown(keyEvent('Enter'));

  assert.equal(performanceTest.name, 'Soak candidate');
  assert.equal(state.savePerformanceCount, 1);
  assert.equal(state.renderPerformanceCount, 1);
  assert.equal(state.renderTabsCount, 1);

  sandbox.beginPerformanceTitleEdit();
  title.textContent = 'Discarded performance name';
  sandbox.finishPerformanceTitleEdit({ revert: true });
  assert.equal(performanceTest.name, 'Soak candidate');
  assert.equal(title.textContent, 'Soak candidate');
  assert.equal(state.savePerformanceCount, 1);
});

function loadTitleEditors() {
  const request = { id: 'request-1', name: 'Original request' };
  const performanceTest = { id: 'perf-1', name: 'Original performance' };
  const elements = new Map([
    ['requestNameTitle', new FakeElement('h1', 'Original request')],
    ['performanceMainTitle', new FakeElement('h1', 'Original performance')]
  ]);
  const state = {
    renderCollectionsCount: 0,
    renderPerformanceCount: 0,
    renderRunnerCount: 0,
    renderTabsCount: 0,
    savePerformanceCount: 0,
    saveRequestCount: 0,
    selectedElement: null
  };
  const sandbox = {
    activePerformanceTest: () => performanceTest,
    activeRequest: () => request,
    activeRunnerRequestRunnerId: '',
    collectPerformanceTestFromEditor: () => {
      performanceTest.name = elements.get('performanceMainTitle').textContent.trim() || 'Untitled Performance Test';
    },
    collectRequestNameFromTitle: () => {
      const nextName = elements.get('requestNameTitle').textContent.trim() || 'Untitled Request';
      const changed = request.name !== nextName;
      request.name = nextName;
      return changed;
    },
    document: { createRange: () => ({ selectNodeContents() {} }) },
    performanceTestDisplayName: (test) => test?.name || 'Untitled Performance Test',
    performanceTitleInputValue: () => elements.get('performanceMainTitle').textContent.trim(),
    renderCollections: () => { state.renderCollectionsCount += 1; },
    renderPerformanceTests: () => { state.renderPerformanceCount += 1; },
    renderRequestTabs: () => { state.renderTabsCount += 1; },
    renderRunnerEditor: () => { state.renderRunnerCount += 1; },
    requestDisplayName: (item) => item?.name || 'Untitled Request',
    requestTitleInputValue: () => elements.get('requestNameTitle').textContent.trim(),
    savePerformanceTestFromPane: () => { state.savePerformanceCount += 1; },
    saveRequestFromPane: () => { state.saveRequestCount += 1; },
    window: {
      getSelection: () => ({
        addRange() {},
        removeAllRanges() {}
      })
    },
    $: (id) => elements.get(id) || null
  };
  for (const element of elements.values()) {
    element.onFocus = () => { state.selectedElement = element; };
  }
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/ui/titleEditors.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, performanceTest, request, sandbox, state };
}

function keyEvent(key) {
  return {
    key,
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    }
  };
}

class FakeElement {
  constructor(tagName, textContent = '') {
    this.attributes = {};
    this.className = '';
    this.dataset = {};
    this.onFocus = null;
    this.tagName = tagName.toUpperCase();
    this.textContent = textContent;
    this.classList = {
      add: (name) => {
        this.className = [this.className, name].filter(Boolean).join(' ');
      },
      remove: (name) => {
        this.className = this.className.split(/\s+/).filter((item) => item !== name).join(' ');
      }
    };
  }

  blur() {}

  focus() {
    this.onFocus?.();
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
}
