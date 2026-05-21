#!/usr/bin/env node

const { readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

if (require.main === module) {
  main();
}

module.exports = {
  buildNodeTestArgs,
  collectTestFiles,
  defaultTestRoot,
  runElectronTests
};
