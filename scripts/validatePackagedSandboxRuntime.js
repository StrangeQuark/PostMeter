#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('./electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('./smokeProcess');

const DEFAULT_TIMEOUT_MILLIS = 60_000;

if (require.main === module) {
  main().catch((error) => {
    console.error(redactForOutput(error.stack || error.message || String(error), process.argv[2] || defaultPackagedAppPath()));
    process.exit(1);
  });
}

async function main() {
  const appPath = path.resolve(process.argv[2] || defaultPackagedAppPath());
  if (!fs.existsSync(appPath)) {
    console.error(redactForOutput(`Packaged PostMeter executable not found: ${appPath}`, appPath));
    process.exit(1);
  }

  const env = {
    ...process.env,
    POSTMETER_VALIDATE_SANDBOX_RUNTIME: '1'
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;

  const timeoutMillis = validationTimeoutMillis(process.env.POSTMETER_PACKAGED_SANDBOX_VALIDATE_TIMEOUT_MS);
  const result = await spawnWithTimeout(appPath, withCiNoSandboxArgs([], env), {
    env,
    timeoutMillis,
    timeoutMessage: `Packaged sandbox runtime validation timed out after ${timeoutMillis} ms.`
  });
  if (result.stdout) {
    process.stdout.write(redactForOutput(result.stdout, appPath));
  }
  if (result.stderr) {
    const redactedStderr = redactForOutput(result.stderr, appPath);
    process.stderr.write(redactedStderr.endsWith('\n') ? redactedStderr : `${redactedStderr}\n`);
  }
  process.exit(result.code ?? 1);
}

function redactForOutput(value, executablePath = process.argv[2] || defaultPackagedAppPath()) {
  const resolvedPath = path.resolve(executablePath || defaultPackagedAppPath());
  return redactSmokeOutputText(String(value || ''), [
    resolvedPath,
    path.dirname(resolvedPath)
  ]);
}

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

function validationTimeoutMillis(value) {
  const timeout = Number(value || DEFAULT_TIMEOUT_MILLIS);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return DEFAULT_TIMEOUT_MILLIS;
  }
  return Math.max(1_000, Math.floor(timeout));
}

module.exports = {
  defaultPackagedAppPath,
  findPackagedExecutable,
  firstExistingPath,
  pathMatchesSuffix,
  redactForOutput,
  validationTimeoutMillis
};
