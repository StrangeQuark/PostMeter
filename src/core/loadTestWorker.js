const { runLoadTest } = require('./loadTestRunner');

let abortController = null;
let running = false;

process.on('message', async (message) => {
  if (message?.type === 'cancel') {
    abortController?.abort();
    return;
  }
  if (message?.type !== 'start' || running) {
    return;
  }
  running = true;
  abortController = new AbortController();
  try {
    const result = await runLoadTest(message.request, message.environment, {
      ...message.config,
      executionMode: 'singleProcess',
      workerProcesses: 1,
      recordSamples: true
    }, {
      abortController,
      cookieJar: message.cookieJar || [],
      includeInternalMetrics: true,
      onProgress: (progress) => {
        if (process.send) {
          process.send({ type: 'progress', progress });
        }
      }
    });
    if (process.send) {
      process.send({ type: 'result', result });
    }
    finish();
  } catch (error) {
    if (process.send) {
      process.send({ type: 'error', error: error.message || String(error) });
    }
    finish();
  }
});

function finish() {
  setImmediate(() => {
    if (process.connected) {
      process.disconnect();
    }
    process.exit(0);
  });
}
