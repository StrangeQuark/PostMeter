#!/usr/bin/env node

const path = require('node:path');
const { redactSmokeOutputText, spawnWithTimeout } = require('./smokeProcess');

const DEFAULT_TIMEOUT_MILLIS = 60_000;
const WINDOWS_TIMEOUT_MILLIS = 120_000;

if (require.main === module) {
  if (process.env.POSTMETER_SANDBOX_RUNTIME_CHILD === '1') {
    const { validateSandboxRuntime } = require('../src/core/sandbox/sandboxRuntimeValidation');
    validateSandboxRuntime()
      .then(() => {
        console.log('PostMeter sandbox runtime validation passed.');
      })
      .catch((error) => {
        console.error(redactForOutput(error.message || String(error)));
        process.exit(1);
      });
  } else {
    runParent().catch((error) => {
      console.error(redactForOutput(error.stack || error.message || String(error)));
      process.exit(1);
    });
  }
}

async function runParent() {
  const electronPath = require('electron');
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    POSTMETER_SANDBOX_RUNTIME_CHILD: '1'
  };
  delete env.NODE_OPTIONS;

  const result = await spawnWithTimeout(electronPath, [__filename], {
    env,
    timeoutMillis: validationTimeoutMillis(process.env.POSTMETER_SANDBOX_VALIDATE_TIMEOUT_MS),
    timeoutMessage: `Sandbox runtime validation timed out after ${validationTimeoutMillis(process.env.POSTMETER_SANDBOX_VALIDATE_TIMEOUT_MS)} ms.`
  });
  if (result.stdout) {
    process.stdout.write(redactForOutput(result.stdout, electronPath));
  }
  if (result.stderr) {
    const redactedStderr = redactForOutput(result.stderr, electronPath);
    process.stderr.write(redactedStderr.endsWith('\n') ? redactedStderr : `${redactedStderr}\n`);
  }
  process.exit(result.code ?? 1);
}

function redactForOutput(value, executablePath = '') {
  const extraPaths = [process.cwd(), __dirname];
  if (executablePath) {
    const resolvedPath = path.resolve(executablePath);
    extraPaths.push(resolvedPath, path.dirname(resolvedPath));
  }
  return redactSmokeOutputText(String(value || ''), extraPaths);
}

function validationTimeoutMillis(value) {
  const defaultTimeout = defaultValidationTimeoutMillis();
  const timeout = Number(value || defaultTimeout);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return defaultTimeout;
  }
  return Math.max(1_000, Math.floor(timeout));
}

function defaultValidationTimeoutMillis(platform = process.platform) {
  return platform === 'win32' ? WINDOWS_TIMEOUT_MILLIS : DEFAULT_TIMEOUT_MILLIS;
}

module.exports = {
  defaultValidationTimeoutMillis,
  redactForOutput,
  validationTimeoutMillis
};
