#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

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
  const electronPath = require('electron');
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    POSTMETER_SANDBOX_RUNTIME_CHILD: '1'
  };
  delete env.NODE_OPTIONS;

  const result = spawnSync(electronPath, [__filename], {
    env,
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(result.error.message || String(result.error));
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
