const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RUNNER_FORMAT,
  exportRunnerDocument,
  exportRunnerToJson,
  importRunnerDocument,
  importRunnerFromText
} = require('../../src/core/import-export/runnerFormats');
const { runnerModel } = require('../../src/core/workspace/models');

test('exports and imports native runner documents with schema validation', () => {
  const runner = {
    id: 'runner-1',
    name: 'Smoke Runner',
    environmentId: 'none',
    stopOnFailure: true,
    allowEnvironmentMutation: false,
    requests: [{
      id: 'runner-request-1',
      name: 'GET health',
      method: 'GET',
      url: 'https://example.test/health',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: { type: 'none' },
      scripts: { preRequest: '', tests: '' },
      variables: [],
      docs: '',
      cookieJar: { enabled: false, storeResponses: true },
      autoHeaders: { sendPostMeterToken: false, showGeneratedHeaders: false }
    }]
  };

  const document = exportRunnerDocument(runner);
  const expectedRunner = runnerModel(runner);
  const imported = importRunnerDocument(document);
  const importedFromText = importRunnerFromText(exportRunnerToJson(runner));

  assert.equal(document.format, RUNNER_FORMAT);
  assert.deepEqual(imported, expectedRunner);
  assert.deepEqual(importedFromText, expectedRunner);
});

test('rejects malformed runner imports and unsupported documents', () => {
  assert.throws(() => importRunnerFromText('{bad json'), /Failed to parse runner JSON/);
  assert.throws(() => importRunnerDocument({ format: RUNNER_FORMAT }), /runner/);
  assert.throws(() => importRunnerDocument({ name: 'Not enough shape' }), /runner/i);
});
