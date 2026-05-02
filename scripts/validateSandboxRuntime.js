#!/usr/bin/env node

const { spawnWithTimeout } = require('./smokeProcess');

const DEFAULT_TIMEOUT_MILLIS = 30_000;

if (process.env.POSTMETER_SANDBOX_RUNTIME_CHILD === '1') {
  const { validateSandboxRuntime } = require('../src/core/sandboxRuntimeValidation');
  validateSandboxRuntime()
    .then(() => {
      console.log('PostMeter sandbox runtime validation passed.');
    })
    .catch((error) => {
      console.error(error.message || String(error));
      process.exit(1);
    });
} else {
  runParent().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
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
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
  }
  process.exit(result.code ?? 1);
}

function validationTimeoutMillis(value) {
  const timeout = Number(value || DEFAULT_TIMEOUT_MILLIS);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return DEFAULT_TIMEOUT_MILLIS;
  }
  return Math.max(1_000, Math.floor(timeout));
}
