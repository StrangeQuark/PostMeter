#!/usr/bin/env node

const { readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ensureElectronRuntime } = require('./ensureElectronRuntime');

function main() {
  process.exit(runElectronTests());
}

function defaultTestRoot() {
  return path.join(__dirname, '..', 'test', 'electron');
}

function buildNodeTestArgs(testFiles, env = process.env) {
  const testConcurrency = env.POSTMETER_TEST_CONCURRENCY || '1';
  return ['--test', `--test-concurrency=${testConcurrency}`, ...testFiles];
}

function runElectronTests(options = {}) {
  const {
    env = process.env,
    execPath = process.execPath,
    platform = process.platform,
    preflight = validateElectronTestEnvironment,
    projectRoot = path.join(__dirname, '..'),
    spawn = spawnSync,
    stderr = console.error,
    stdio = 'inherit',
    testRoot = defaultTestRoot()
  } = options;
  const testFiles = collectTestFiles(testRoot);

  if (!testFiles.length) {
    stderr('No Electron test files found.');
    return 1;
  }

  if (preflight !== false) {
    const preflightStatus = preflight({
      env,
      platform,
      projectRoot,
      stderr
    });
    if (preflightStatus !== 0) {
      return preflightStatus;
    }
  }

  const result = spawn(execPath, buildNodeTestArgs(testFiles, env), { stdio });
  if (result.error) {
    stderr(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

function collectTestFiles(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        return collectTestFiles(fullPath);
      }
      return entry.endsWith('.test.js') ? [fullPath] : [];
    })
    .sort();
}

function validateElectronTestEnvironment(options = {}) {
  const {
    platform = process.platform,
    projectRoot = path.join(__dirname, '..'),
    stderr = console.error
  } = options;

  const electronStatus = ensureElectronRuntime({
    projectRoot,
    repair: false
  });
  if (!electronStatus.ok) {
    stderr(electronStatus.message);
    return 1;
  }

  const { osSandboxStatus } = require('../src/core/sandbox/osSandbox');
  const status = osSandboxStatus({ platform });
  if (!status.supported) {
    stderr(formatOsSandboxPreflightFailure(status));
    return 1;
  }
  return 0;
}

function formatOsSandboxPreflightFailure(status = {}) {
  const platform = status.platform || process.platform;
  const backend = platform === 'win32'
    ? 'Windows AppContainer helper'
    : platform === 'darwin'
      ? 'macOS sandbox-exec backend'
      : platform === 'linux'
        ? 'Linux bubblewrap backend'
        : `${platform} OS sandbox backend`;
  const details = [];
  if (status.windowsHelperPath) {
    details.push(`Windows helper: ${status.windowsHelperPath}`);
  }
  if (status.bubblewrapPath) {
    details.push(`bubblewrap: ${status.bubblewrapPath}`);
  }
  if (status.macosSandboxExecPath) {
    details.push(`sandbox-exec: ${status.macosSandboxExecPath}`);
  }
  if (status.probeFailure) {
    details.push(`Probe failure: ${status.probeFailure}`);
  }
  const fix = platform === 'win32'
    ? [
        'Fix:',
        '  1. Install Visual Studio Build Tools with the MSVC x64 toolchain.',
        '  2. Run npm run native:windows-sandbox:build from the repository root.',
        '  3. Re-run npm run sandbox:validate before npm run check.'
      ].join('\n')
    : platform === 'linux'
      ? [
          'Fix:',
          '  1. Install bubblewrap.',
          '  2. Run npm run sandbox:validate before npm run check.'
        ].join('\n')
      : [
          'Fix:',
          '  1. Run npm run sandbox:validate to capture the platform sandbox failure.',
          '  2. Re-run npm run check after the platform sandbox backend validates.'
        ].join('\n');
  return [
    `Full Electron tests require a functional ${backend}.`,
    ...details,
    fix
  ].filter(Boolean).join('\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  buildNodeTestArgs,
  collectTestFiles,
  defaultTestRoot,
  formatOsSandboxPreflightFailure,
  validateElectronTestEnvironment,
  runElectronTests
};
