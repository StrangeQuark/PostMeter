const WINDOWS_SCRIPT_WORKER_TIMEOUT_MILLIS = 5_000;
const WINDOWS_SCRIPT_WORKER_TIMEOUT_ENV = 'POSTMETER_WINDOWS_SCRIPT_WORKER_TEST_TIMEOUT_MS';

function scriptWorkerTestTimeoutMillis(timeoutMillis, platform = process.platform) {
  const normalized = Math.max(1, Number(timeoutMillis) || 1);
  return platform === 'win32'
    ? Math.max(normalized, windowsScriptWorkerTimeoutMillis())
    : normalized;
}

function windowsScriptWorkerTimeoutMillis(env = process.env) {
  const configured = Number(env[WINDOWS_SCRIPT_WORKER_TIMEOUT_ENV]);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.floor(configured));
  }
  return WINDOWS_SCRIPT_WORKER_TIMEOUT_MILLIS;
}

module.exports = {
  WINDOWS_SCRIPT_WORKER_TIMEOUT_MILLIS,
  WINDOWS_SCRIPT_WORKER_TIMEOUT_ENV,
  scriptWorkerTestTimeoutMillis,
  windowsScriptWorkerTimeoutMillis
};
