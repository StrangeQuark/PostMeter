const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('runtime results visualizer renders in a sandboxed iframe with locked-down srcdoc policy', () => {
  const { elements, sandbox } = loadRuntimeResultsController();
  const frame = elements.get('visualizerFrame');

  sandbox.displayVisualizer({
    html: '<main><h1>Chart</h1><script>window.parent.postMessage("blocked","*")</script></main>',
    data: { token: '<secret>&value', separator: '\u2028' },
    assets: [
      { name: 'theme<style>', type: 'style', integrity: 'sha256-good', source: 'body{color:red}</style><p>bad</p>' },
      { name: 'chartjs', type: 'script', integrity: 'sha256-good', source: 'window.ok=true;</script><p>bad</p>' },
      { name: 'ignored', type: 'script', integrity: 'md5-bad', source: 'window.bad=true' }
    ]
  });

  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
  assert.match(frame.srcdoc, /default-src 'none'/);
  assert.match(frame.srcdoc, /connect-src 'none'/);
  assert.match(frame.srcdoc, /worker-src 'none'/);
  assert.match(frame.srcdoc, /window\.pm=Object\.freeze/);
  assert.match(frame.srcdoc, /\\u003csecret\\u003e\\u0026value/);
  assert.match(frame.srcdoc, /data-postmeter-visualizer-asset="theme&lt;style&gt;"/);
  assert.match(frame.srcdoc, /body\{color:red\}<\\\/style><p>bad<\/p>/);
  assert.match(frame.srcdoc, /window\.ok=true;<\\\/script><p>bad<\/p>/);
  assert.equal(frame.srcdoc.includes('window.bad=true'), false);
});

test('runtime results pagination and status filter helpers preserve V1 runner result behavior', () => {
  const { elements, sandbox } = loadRuntimeResultsController();
  const items = [
    { statusCode: 200, requestName: 'ok' },
    { statusCode: 500, requestName: 'server' },
    { error: 'ENOTFOUND', passed: false, requestName: 'dns' },
    { statusCode: 200, requestName: 'ok again' }
  ];

  assert.deepEqual(fromVm(sandbox.executionPageRange(5, 1)), {
    page: 1,
    pageCount: 3,
    startIndex: 2,
    endIndex: 4
  });
  assert.deepEqual(fromVm(sandbox.executionStatusCounts(items)), [
    ['ERR', 1],
    ['200', 2],
    ['500', 1]
  ]);
  assert.deepEqual(
    fromVm(sandbox.filteredExecutionEntries(items, '200')).map((entry) => entry.index),
    [0, 3]
  );
  assert.equal(
    sandbox.executionFilterSummaryText({ startIndex: 0, endIndex: 2 }, 2, 4, 'result', '200'),
    '1-2 of 2 results matching 200'
  );

  const selected = sandbox.renderExecutionStatusFilter({
    selectId: 'runnerExecutionStatusFilter',
    items,
    selected: '500',
    onChange: (status) => { elements.get('runnerExecutionStatusFilter').lastStatus = status; }
  });
  const select = elements.get('runnerExecutionStatusFilter');
  assert.equal(selected, '500');
  assert.equal(select.disabled, false);
  assert.deepEqual(select.children.map((option) => [option.textContent, option.value]), [
    ['All', 'all'],
    ['ERR (1)', 'ERR'],
    ['200 (2)', '200'],
    ['500 (1)', '500']
  ]);
  select.value = 'ERR';
  select.onchange();
  assert.equal(select.lastStatus, 'ERR');

  let nextPage = null;
  sandbox.renderExecutionPagination({
    containerId: 'runnerExecutionPagination',
    label: 'Runner request results',
    onPageChange: (page) => { nextPage = page; },
    page: 1,
    totalItems: 5
  });
  const pagination = elements.get('runnerExecutionPagination');
  assert.equal(pagination.hidden, false);
  assert.deepEqual(pagination.children.map((child) => child.textContent), [
    'First',
    'Previous',
    'Page 2 of 3',
    'Next',
    'Last',
    '3-4 of 5'
  ]);
  pagination.children.find((child) => child.dataset.executionPageAction === 'next').click();
  assert.equal(nextPage, 2);
});

function loadRuntimeResultsController() {
  const elements = new Map([
    ['visualizerFrame', new FakeElement('iframe')],
    ['runnerExecutionStatusFilter', new FakeElement('select')],
    ['runnerExecutionPagination', new FakeElement('div')]
  ]);
  const sandbox = {
    EXECUTION_RESULT_PAGE_SIZE: 2,
    document: { createElement: (tagName) => new FakeElement(tagName) },
    window: {},
    $: (id) => elements.get(id) || null
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/features/runtimeResultsController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, sandbox };
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeElement {
  constructor(tagName = 'div') {
    this.attributes = {};
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.listeners = {};
    this.style = {};
    this.tagName = tagName.toUpperCase();
    this.textContent = '';
    this.value = '';
  }

  append(...children) {
    this.children.push(...children.flat());
  }

  addEventListener(type, listener) {
    this.listeners[type] ||= [];
    this.listeners[type].push(listener);
  }

  click() {
    for (const listener of this.listeners.click || []) {
      listener({ preventDefault() {} });
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }
}
