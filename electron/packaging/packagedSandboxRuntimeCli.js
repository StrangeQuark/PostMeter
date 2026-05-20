#!/usr/bin/env node

const { redactText } = require('../../src/core/diagnostics-release/diagnostics');

async function main() {
  const { validateSandboxRuntime } = require('../../src/core/sandbox/sandboxRuntimeValidation');
  await validateSandboxRuntime();
  console.log('PostMeter packaged sandbox runtime validation passed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(redactText(error?.stack || error?.message || String(error)));
    process.exit(1);
  });
}

module.exports = {
  main
};
