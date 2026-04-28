#!/usr/bin/env node

const { readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testRoot = path.join(__dirname, '..', 'test', 'electron');
const testFiles = collectTestFiles(testRoot);

if (!testFiles.length) {
  console.error('No Electron test files found.');
  process.exit(1);
}

const testConcurrency = process.env.POSTMETER_TEST_CONCURRENCY || '1';
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${testConcurrency}`, ...testFiles], {
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

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
