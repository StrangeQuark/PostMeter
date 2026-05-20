const assert = require('node:assert/strict');
const test = require('node:test');
const {
  captureUiSnapshotState,
  queueUiSmokeRun
} = require('../../src/renderer/smoke/uiSmokeCommon');

test('ui smoke common helper skips suites that were not requested', () => {
  const scheduled = [];
  const runtime = {
    document: { title: '' },
    location: { search: '' },
    setTimeout(handler) {
      scheduled.push(handler);
    }
  };

  const queued = queueUiSmokeRun({
    flag: 'uiWorkflowSmoke',
    runtimeGlobal: runtime,
    run: async () => {},
    titlePrefix: 'PostMeter UI Workflow'
  });

  assert.equal(queued, false);
  assert.equal(scheduled.length, 0);
  assert.equal(runtime.document.title, '');
});

test('ui smoke common helper schedules pass and fail title updates for requested suites', async () => {
  const scheduled = [];
  const runtime = {
    document: { title: '' },
    location: { search: '?uiWorkflowSmoke=1&uiWorkflowBaseUrl=http://fixture.test' },
    setTimeout(handler) {
      scheduled.push(handler);
    }
  };
  let receivedBaseUrl = '';

  queueUiSmokeRun({
    flag: 'uiWorkflowSmoke',
    runtimeGlobal: runtime,
    run: async (params) => {
      receivedBaseUrl = params.get('uiWorkflowBaseUrl');
    },
    titlePrefix: 'PostMeter UI Workflow'
  });

  scheduled[0]();
  await flushQueue();
  assert.equal(receivedBaseUrl, 'http://fixture.test');
  assert.equal(runtime.document.title, 'PostMeter UI Workflow:PASS');

  queueUiSmokeRun({
    flag: 'uiWorkflowSmoke',
    runtimeGlobal: runtime,
    run: async () => {
      throw new Error('failure reason that should stay visible');
    },
    titlePrefix: 'PostMeter UI Workflow'
  });

  scheduled[1]();
  await flushQueue();
  assert.match(runtime.document.title, /^PostMeter UI Workflow:FAIL:failure reason/);
});

test('ui smoke common helper publishes snapshot capture titles and resumes through the continuation hook', async () => {
  const runtime = {
    __postmeterSnapshotContinue: null,
    document: { title: '' },
    requestAnimationFrame(handler) {
      handler();
    }
  };
  let setupCount = 0;

  const capture = captureUiSnapshotState('runner', () => {
    setupCount += 1;
  }, runtime);

  await Promise.resolve();
  assert.equal(setupCount, 1);
  assert.equal(runtime.document.title, 'PostMeter UI Snapshot:CAPTURE:runner');
  assert.equal(typeof runtime.__postmeterSnapshotContinue, 'function');

  runtime.__postmeterSnapshotContinue();
  await capture;
  assert.equal(runtime.__postmeterSnapshotContinue, null);
});

async function flushQueue() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}
