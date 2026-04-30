#!/usr/bin/env node

const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { WAIVER_ENV, withCiNoSandboxArgs } = require('./electronCiSandboxWaiver');

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
  await runDefaultPersistencePathSmoke(executable);
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-smoke-'));
  const dataPath = path.join(userData, 'workspace.json');
  const marker = `packaged-smoke-${Date.now()}`;
  try {
    await runStartupSmokeOnce(executable, {
      dataPath,
      marker,
      expectReload: false,
      label: 'initial'
    });
    await runStartupSmokeOnce(executable, {
      dataPath,
      marker,
      expectReload: true,
      label: 'reload'
    });
    await validatePersistenceArtifacts(userData, dataPath, marker);
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
  }
}

async function runDefaultPersistencePathSmoke(executable) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-default-path-'));
  const envOverrides = await isolatedDefaultPathEnv(root);
  const marker = `packaged-default-path-${Date.now()}`;
  try {
    await runStartupSmokeOnce(executable, {
      marker,
      expectReload: false,
      label: 'default-path',
      defaultUserData: true,
      envOverrides
    });
    await runStartupSmokeOnce(executable, {
      marker,
      expectReload: true,
      label: 'default-path-reload',
      defaultUserData: true,
      envOverrides
    });
    await validateDefaultPersistenceArtifacts(envOverrides, marker);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function runStartupSmokeOnce(executable, options = {}) {
  const env = {
    ...minimalEnv(),
    ...(options.envOverrides || {}),
    POSTMETER_STARTUP_SMOKE: '1',
    POSTMETER_PACKAGED_SMOKE: '1',
    POSTMETER_PACKAGED_SMOKE_MARKER: options.marker,
    POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD: options.expectReload ? '1' : '',
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || ''
  };
  if (options.dataPath) {
    env.POSTMETER_DATA_PATH = options.dataPath;
  }
  if (options.defaultUserData) {
    env.POSTMETER_PACKAGED_SMOKE_DEFAULT_PATH = '1';
  }
  const result = await spawnWithTimeout(executable, withCiNoSandboxArgs([], env), env);
  await writeSmokeLog(options.label || 'run', executable, result);
  if (result.code !== 0) {
    throw new Error(`Packaged app startup smoke exited with ${result.code}: ${result.stderr || result.stdout}`);
  }
}

async function validatePersistenceArtifacts(userData, dataPath, marker = '') {
  const workspace = await loadPersistedSmokeWorkspace(dataPath, marker);
  if (!Array.isArray(workspace.globals) || !workspace.globals.some((item) => (
    item.key === '__postmeter_packaged_smoke' && (!marker || item.value === marker)
  ))) {
    throw new Error('Packaged app smoke did not persist the workspace marker.');
  }
  await fs.stat(path.join(userData, 'userData'));
}

async function validateDefaultPersistenceArtifacts(env, marker = '') {
  const userDataPath = expectedDefaultUserDataPath(env, process.platform);
  const stat = await fs.stat(userDataPath);
  if (!stat.isDirectory()) {
    throw new Error(`Default packaged userData path is not a directory: ${userDataPath}`);
  }
  const workspacePath = path.join(env.USERPROFILE || env.HOME, '.postmeter', 'workspace.json');
  await loadPersistedSmokeWorkspace(workspacePath, marker);
}

async function loadPersistedSmokeWorkspace(dataPath, marker = '') {
  const candidates = [dataPath];
  const directory = path.dirname(dataPath);
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const candidate = path.join(directory, entry.name);
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const workspace = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (Array.isArray(workspace?.globals) && workspace.globals.some((item) => (
        item.key === '__postmeter_packaged_smoke' && (!marker || item.value === marker)
      ))) {
        return workspace;
      }
    } catch {
      continue;
    }
  }
  throw new Error(`Packaged app smoke workspace marker was not found under ${directory}.`);
}

function spawnWithTimeout(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, TIMEOUT_MILLIS);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolve({
        code: timedOut ? 124 : code,
        stdout,
        stderr: timedOut
          ? `${stderr}\nPackaged app startup smoke timed out after ${TIMEOUT_MILLIS} ms.`.trim()
          : stderr
      });
    });
  });
}

async function writeSmokeLog(label, executable, result) {
  const directory = process.env.POSTMETER_VALIDATION_ARTIFACT_DIR;
  if (!directory) {
    return;
  }
  await fs.mkdir(directory, { recursive: true });
  const safeLabel = String(label || 'run').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 64) || 'run';
  const logPath = path.join(directory, `packaged-app-smoke-${process.platform}-${safeLabel}.log`);
  const body = [
    `executable=${executable}`,
    `platform=${process.platform}`,
    `exitCode=${result.code}`,
    '',
    '[stdout]',
    result.stdout || '',
    '',
    '[stderr]',
    result.stderr || ''
  ].join('\n');
  await fs.writeFile(logPath, body);
}

function minimalEnv() {
  const keep = {};
  for (const key of ['APPDATA', 'HOME', 'LOCALAPPDATA', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'XAUTHORITY', 'XDG_CONFIG_HOME', 'DISPLAY', 'WAYLAND_DISPLAY', WAIVER_ENV]) {
    if (process.env[key]) {
      keep[key] = process.env[key];
    }
  }
  if (process.platform === 'linux') {
    keep.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
  }
  return keep;
}

async function isolatedDefaultPathEnv(root) {
  const home = path.join(root, 'home');
  const xdgConfig = path.join(root, 'xdg-config');
  const appData = path.join(root, 'AppData', 'Roaming');
  const localAppData = path.join(root, 'AppData', 'Local');
  const temp = path.join(root, 'tmp');
  await Promise.all([
    fs.mkdir(home, { recursive: true }),
    fs.mkdir(xdgConfig, { recursive: true }),
    fs.mkdir(appData, { recursive: true }),
    fs.mkdir(localAppData, { recursive: true }),
    fs.mkdir(temp, { recursive: true })
  ]);
  return {
    APPDATA: appData,
    HOME: home,
    LOCALAPPDATA: localAppData,
    TEMP: temp,
    TMP: temp,
    USERPROFILE: home,
    XDG_CONFIG_HOME: xdgConfig
  };
}

function expectedDefaultUserDataPath(env, platform = process.platform) {
  return path.join(expectedDefaultUserDataRoot(env, platform), 'PostMeter');
}

function expectedDefaultUserDataRoot(env, platform = process.platform) {
  if (platform === 'win32') {
    return path.resolve(env.APPDATA || path.join(env.USERPROFILE || env.HOME || os.homedir(), 'AppData', 'Roaming'));
  }
  if (platform === 'darwin') {
    return path.resolve(env.HOME || os.homedir(), 'Library', 'Application Support');
  }
  return path.resolve(env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), '.config'));
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
  expectedDefaultUserDataPath,
  expectedDefaultUserDataRoot,
  findPackagedExecutable,
  isolatedDefaultPathEnv,
  loadPersistedSmokeWorkspace,
  platformCandidates,
  runDefaultPersistencePathSmoke,
  runStartupSmoke,
  writeSmokeLog,
  validateDefaultPersistenceArtifacts,
  validatePersistenceArtifacts,
  validateExecutable
};
