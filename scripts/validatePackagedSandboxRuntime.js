#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appPath = path.resolve(process.argv[2] || defaultPackagedAppPath());
if (!fs.existsSync(appPath)) {
  console.error(`Packaged PostMeter executable not found: ${appPath}`);
  process.exit(1);
}

const env = {
  ...process.env,
  POSTMETER_VALIDATE_SANDBOX_RUNTIME: '1'
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const result = spawnSync(appPath, [], {
  env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message || String(result.error));
  process.exit(1);
}
process.exit(result.status ?? 1);

function defaultPackagedAppPath() {
  const releaseDir = path.join(__dirname, '..', 'release');
  if (process.platform === 'win32') {
    return firstExistingPath([
      path.join(releaseDir, 'win-unpacked', 'PostMeter.exe'),
      findPackagedExecutable(releaseDir, 'PostMeter.exe')
    ]);
  }
  if (process.platform === 'darwin') {
    return firstExistingPath([
      path.join(releaseDir, 'mac', 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter'),
      path.join(releaseDir, 'mac-arm64', 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter'),
      findPackagedExecutable(releaseDir, path.join('PostMeter.app', 'Contents', 'MacOS', 'PostMeter'))
    ]);
  }
  return firstExistingPath([
    path.join(releaseDir, 'linux-unpacked', 'postmeter'),
    findPackagedExecutable(releaseDir, 'postmeter')
  ]);
}

function firstExistingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || candidates.find(Boolean);
}

function findPackagedExecutable(directory, relativeSuffix) {
  if (!fs.existsSync(directory)) {
    return '';
  }
  const suffixParts = relativeSuffix.split(path.sep);
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (pathMatchesSuffix(fullPath, suffixParts)) {
        return fullPath;
      }
    }
  }
  return '';
}

function pathMatchesSuffix(filePath, suffixParts) {
  const parts = filePath.split(path.sep);
  if (parts.length < suffixParts.length) {
    return false;
  }
  return suffixParts.every((part, index) => parts[parts.length - suffixParts.length + index] === part);
}
