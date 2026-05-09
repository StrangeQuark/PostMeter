const { runnerModel } = require('./models');
const { assertRunnerPayload } = require('./ipcValidation');

const RUNNER_FORMAT = 'postmeter.runner.v1';

function exportRunnerDocument(runner) {
  assertRunnerPayload(runner);
  return {
    format: RUNNER_FORMAT,
    exportedAt: new Date().toISOString(),
    runner: runnerModel(runner)
  };
}

function exportRunnerToJson(runner) {
  return JSON.stringify(exportRunnerDocument(runner), null, 2);
}

function importRunnerFromText(content) {
  let document;
  try {
    document = JSON.parse(String(content || ''));
  } catch (error) {
    throw new Error(`Failed to parse runner JSON: ${error.message}`);
  }
  return importRunnerDocument(document);
}

function importRunnerDocument(document) {
  const candidate = document?.format === RUNNER_FORMAT
    ? document.runner
    : document?.runner || document;
  assertRunnerPayload(candidate);
  return runnerModel(candidate);
}

module.exports = {
  RUNNER_FORMAT,
  exportRunnerDocument,
  exportRunnerToJson,
  importRunnerDocument,
  importRunnerFromText
};
