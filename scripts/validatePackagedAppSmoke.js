#!/usr/bin/env node

const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const RELEASE_DIR = process.env.POSTMETER_RELEASE_DIR
  ? path.resolve(process.env.POSTMETER_RELEASE_DIR)
  : path.join(PROJECT_ROOT, 'release');
const TIMEOUT_MILLIS = Number(process.env.POSTMETER_PACKAGED_SMOKE_TIMEOUT_MS || 30000);

async function main() {
  const executable = await findPackagedExecutable();
  await validateExecutable(executable);
  await runStartupSmoke(executable);
  console.log(`Packaged app smoke passed: ${executable}`);
}

async function findPackagedExecutable() {
  if (process.env.POSTMETER_PACKAGED_APP_PATH) {
    return path.resolve(process.env.POSTMETER_PACKAGED_APP_PATH);
  }
  const candidates = platformCandidates();
  for (const candidate of candidates) {
    if (await executableExists(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No packaged PostMeter executable found for ${process.platform} under ${RELEASE_DIR}.`);
}

function platformCandidates() {
  if (process.platform === 'win32') {
    return [
      path.join(RELEASE_DIR, 'win-unpacked', 'PostMeter.exe'),
      path.join(RELEASE_DIR, 'win-unpacked', 'postmeter.exe')
    ];
  }
  if (process.platform === 'darwin') {
    return [
      path.join(RELEASE_DIR, 'mac', 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter'),
      path.join(RELEASE_DIR, 'mac-arm64', 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter'),
      path.join(RELEASE_DIR, 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter')
    ];
  }
  return [
    path.join(RELEASE_DIR, 'linux-unpacked', 'postmeter'),
    path.join(RELEASE_DIR, 'linux-unpacked', 'PostMeter')
  ];
}

async function validateExecutable(executable) {
  const stat = await fs.stat(executable);
  if (!stat.isFile()) {
    throw new Error(`Packaged app executable is not a file: ${executable}`);
  }
  if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
    throw new Error(`Packaged app executable is not executable: ${executable}`);
  }
}

async function runStartupSmoke(executable) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-smoke-'));
  const dataPath = path.join(userData, 'workspace.json');
  const marker = `packaged-smoke-${Date.now()}`;
  try {
    await runStartupSmokeOnce(executable, {
      dataPath,
      marker,
      expectReload: false
    });
    await runStartupSmokeOnce(executable, {
      dataPath,
      marker,
      expectReload: true
    });
    await validatePersistenceArtifacts(userData, dataPath);
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
  }
}

async function runStartupSmokeOnce(executable, options = {}) {
  const result = await spawnWithTimeout(executable, [], {
    ...minimalEnv(),
    POSTMETER_STARTUP_SMOKE: '1',
    POSTMETER_DATA_PATH: options.dataPath,
    POSTMETER_PACKAGED_SMOKE: '1',
    POSTMETER_PACKAGED_SMOKE_MARKER: options.marker,
    POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD: options.expectReload ? '1' : ''
  });
  if (result.code !== 0) {
    throw new Error(`Packaged app startup smoke exited with ${result.code}: ${result.stderr || result.stdout}`);
  }
}

async function validatePersistenceArtifacts(userData, dataPath) {
  const workspace = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  if (!Array.isArray(workspace.globals) || !workspace.globals.some((item) => item.key === '__postmeter_packaged_smoke')) {
    throw new Error('Packaged app smoke did not persist the workspace marker.');
  }
  await fs.stat(path.join(userData, 'userData'));
}

function spawnWithTimeout(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Packaged app startup smoke timed out after ${TIMEOUT_MILLIS} ms.`));
    }, TIMEOUT_MILLIS);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function minimalEnv() {
  const keep = {};
  for (const key of ['HOME', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'XAUTHORITY', 'DISPLAY', 'WAYLAND_DISPLAY']) {
    if (process.env[key]) {
      keep[key] = process.env[key];
    }
  }
  if (process.platform === 'linux') {
    keep.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
  }
  return keep;
}

async function executableExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  findPackagedExecutable,
  platformCandidates,
  runStartupSmoke,
  validateExecutable
};
