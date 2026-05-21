const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('performance controller computes outcome counts and bounded graph page offsets', () => {
  const { sandbox } = loadPerformanceController();

  assert.deepEqual(fromVm(sandbox.performanceResultOutcomeCounts({}, [
    { statusCode: 200, passed: true },
    { statusCode: 302, passed: true },
    { statusCode: 500, passed: false },
    { error: 'timeout', passed: false }
  ])), { successful: 2, failed: 2, total: 4 });
  assert.deepEqual(fromVm(sandbox.performanceResultOutcomeCounts({
    completedRequests: 4,
    summary: { statusCodes: { 200: 2, 405: 1, ERR: 1 } },
    type: 'diagnosis'
  })), { successful: 3, failed: 1, total: 4 });

  assert.deepEqual(fromVm(sandbox.performanceGraphPageOffsets(0, 100, 300)), [0]);
  assert.deepEqual(fromVm(sandbox.performanceGraphPageOffsets(250, 100, 300)), [0, 100, 200]);
  assert.deepEqual(fromVm(sandbox.performanceGraphPageOffsets(5000, 100, 300)), [0, 2450, 4900]);
});

test('performance controller fetches representative high-volume graph samples plus important failure statuses', async () => {
  const { sandbox, state } = loadPerformanceController();
  const pages = {
    '0:all': [{ resultIndex: 0, statusCode: 200, durationMillis: 10 }],
    '2450:all': [{ resultIndex: 2450, statusCode: 200, durationMillis: 12 }],
    '4900:all': [{ resultIndex: 4900, statusCode: 200, durationMillis: 14 }],
    '0:500': [{ resultIndex: 111, statusCode: 500, durationMillis: 99 }],
    '0:ERR': [{ resultIndex: 112, error: 'timeout', passed: false }]
  };
  sandbox.window.postmeter.performance.resultPage = async (_resultId, query) => {
    state.pageQueries.push(query);
    return { items: pages[`${query.offset}:${query.status}`] || [] };
  };

  const samples = await sandbox.fetchPerformanceGraphSamples({
    id: 'result-1',
    completedRequests: 5000,
    resultPage: {
      statusCounts: { 200: 4898, 500: 1, ERR: 1 },
      totalAll: 5000
    }
  });

  assert.deepEqual(fromVm(state.pageQueries), [
    { offset: 0, limit: 100, status: 'all' },
    { offset: 2450, limit: 100, status: 'all' },
    { offset: 4900, limit: 100, status: 'all' },
    { offset: 0, limit: 100, status: '500' },
    { offset: 0, limit: 100, status: 'ERR' }
  ]);
  assert.deepEqual(fromVm(samples.map((sample) => sample.resultIndex)), [0, 111, 112, 2450, 4900]);
});

test('performance controller exports active results and reports unavailable or failed export states', async () => {
  const { sandbox, state } = loadPerformanceController();
  sandbox.lastPerformanceResult = null;
  assert.equal(await sandbox.exportActivePerformanceResult('json'), undefined);
  assert.equal(state.statuses.at(-1), 'Run a performance test before exporting result JSON.');

  sandbox.lastPerformanceResult = { id: 'result-1', performanceTestId: 'perf-1', samples: [{ statusCode: 200 }] };
  sandbox.lastPerformanceResultTestId = 'perf-1';
  sandbox.window.__postmeterExportPerformanceResult = async (payload, format, options) => {
    state.exports.push({ payload, format, options });
    return { path: `/tmp/result.${format}` };
  };

  const exported = await sandbox.exportActivePerformanceResult('html', {
    includeRequestDetails: true,
    includeRequestResults: true,
    theme: 'dark'
  });
  assert.deepEqual(exported, { path: '/tmp/result.html' });
  assert.equal(state.exports[0].format, 'html');
  assert.deepEqual(state.exports[0].options, {
    includeRequestDetails: true,
    includeRequestResults: true,
    theme: 'dark'
  });
  assert.equal(state.statuses.at(-1), 'Performance result HTML exported to /tmp/result.html.');

  sandbox.window.__postmeterExportPerformanceResult = async () => {
    throw new Error('disk full');
  };
  assert.equal(await sandbox.exportActivePerformanceResult('csv'), null);
  assert.equal(state.statuses.at(-1), 'Performance result CSV export failed: disk full');
  assert.deepEqual(state.notifications.at(-1), ['Performance Result Export Failed', 'disk full']);
});

test('performance controller resolves HTML report options from modal controls', () => {
  const { elements, sandbox, state } = loadPerformanceController();
  elements.get('htmlReportIncludeResultsInput').checked = false;
  elements.get('htmlReportIncludeDetailsInput').checked = true;
  sandbox.syncHtmlReportOptionsModal();
  assert.equal(elements.get('htmlReportIncludeDetailsInput').checked, false);
  assert.equal(elements.get('htmlReportIncludeDetailsInput').disabled, true);
  assert.equal(elements.get('htmlReportIncludeDetailsInput').parentElement.classList.contains('is-disabled'), true);

  elements.get('htmlReportIncludeResultsInput').checked = true;
  elements.get('htmlReportIncludeDetailsInput').checked = true;
  elements.get('htmlReportIncludeDetailsInput').disabled = false;
  sandbox.document.checkedTheme = 'dark';
  sandbox.confirmHtmlReportOptionsModal();
  assert.deepEqual(fromVm(state.resolvedModal), {
    theme: 'dark',
    includeRequestResults: true,
    includeRequestDetails: true
  });
});

function loadPerformanceController() {
  const elements = new Map([
    ['htmlReportIncludeResultsInput', new FakeElement('input')],
    ['htmlReportIncludeDetailsInput', new FakeElement('input')],
    ['htmlReportThemeLightInput', new FakeElement('input')],
    ['htmlReportThemeDarkInput', new FakeElement('input')]
  ]);
  const state = { exports: [], notifications: [], pageQueries: [], resolvedModal: null, statuses: [] };
  const document = {
    checkedTheme: 'light',
    createElement: (tagName) => new FakeElement(tagName),
    querySelector(selector) {
      if (selector === 'input[name="htmlReportTheme"]:checked') {
        return { value: this.checkedTheme };
      }
      return null;
    }
  };
  elements.get('htmlReportIncludeDetailsInput').parentElement = new FakeElement('label');
  const sandbox = {
    EXECUTION_RESULT_PAGE_SIZE: 2,
    PERFORMANCE_GRAPH_PAGE_LIMIT: 100,
    PERFORMANCE_GRAPH_SAMPLE_LIMIT: 300,
    activePerformanceTest: () => ({ id: 'perf-1', name: 'Load test' }),
    cloneJson: (value) => JSON.parse(JSON.stringify(value)),
    currentResolvedThemeMode: () => 'light',
    document,
    lastPerformanceResult: null,
    lastPerformanceResultTestId: '',
    notifyUser: (title, message) => state.notifications.push([title, message]),
    resolveActiveModal: (value) => { state.resolvedModal = value; },
    setStatus: (message) => {
      state.statuses.push(message);
      return undefined;
    },
    showModal: async () => null,
    window: {
      postmeter: {
        performance: {
          resultPage: async () => ({ items: [] })
        }
      }
    },
    workspace: {},
    $: (id) => elements.get(id) || null
  };
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/features/performanceController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { elements, sandbox, state };
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeElement {
  constructor(tagName = 'div') {
    this.attributes = {};
    this.checked = false;
    this.children = [];
    this.classList = {
      classes: new Set(),
      contains(name) {
        return this.classes.has(name);
      },
      toggle(name, force) {
        const enabled = force == null ? !this.classes.has(name) : force === true;
        if (enabled) {
          this.classes.add(name);
        } else {
          this.classes.delete(name);
        }
      }
    };
    this.disabled = false;
    this.hidden = false;
    this.listeners = {};
    this.parentElement = null;
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

  closest() {
    return this.parentElement;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}
