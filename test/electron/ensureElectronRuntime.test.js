const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  electronChromeSandboxPath,
  electronPathFile,
  electronRuntimeStatus,
  ensureElectronRuntime,
  linuxChromeSandboxRepairCommand
} = require('../../scripts/ensureElectronRuntime');
const { WAIVER_ENV } = require('../../scripts/electronCiSandboxWaiver');

test('Electron runtime check accepts an installed runtime path from path.txt', (t) => {
  const root = makeElectronInstall(t, { executable: true });
  const status = electronRuntimeStatus(root, { platform: 'darwin' });

  assert.equal(status.ok, true);
  assert.equal(path.basename(status.executable).toLowerCase(), process.platform === 'win32' ? 'electron.exe' : 'electron');
});

test('Electron runtime check reports missing path.txt with repair guidance', (t) => {
  const root = makeElectronInstall(t, { pathFile: false, executable: true });
  const status = ensureElectronRuntime({ projectRoot: root, repair: false });

  assert.equal(status.ok, false);
  assert.equal(status.reason, 'missing-path-metadata');
  assert.match(status.message, /Electron runtime check failed/);
  assert.match(status.message, /npm rebuild electron/);
  assert.match(status.message, new RegExp(escapeRegExp(electronPathFile(root))));
});

test('Electron runtime check can run Electron install.js repair before validating again', (t) => {
  const root = makeElectronInstall(t, { pathFile: false, executable: true, installScript: true });
  const calls = [];
  const status = ensureElectronRuntime({
    projectRoot: root,
    platform: 'darwin',
    repair: true,
    spawnSync: (command, args) => {
      calls.push({ command, args });
      fs.writeFileSync(electronPathFile(root), process.platform === 'win32' ? 'electron.exe' : 'electron');
      return { status: 0 };
    },
    stdio: 'pipe'
  });

  assert.equal(status.ok, true);
  assert.equal(status.repaired, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].args[0], /install\.js$/);
});

test('Electron runtime check reports failed repair commands', (t) => {
  const root = makeElectronInstall(t, { pathFile: false, executable: false, installScript: true });
  const status = ensureElectronRuntime({
    projectRoot: root,
    repair: true,
    spawnSync: () => ({ status: 1, stdout: 'download failed', stderr: '' }),
    stdio: 'pipe'
  });

  assert.equal(status.ok, false);
  assert.equal(status.reason, 'install-script-failed');
  assert.match(status.message, /download failed/);
});

test('Electron runtime check accepts a configured Linux chrome-sandbox helper', (t) => {
  const root = makeElectronInstall(t, { executable: true, chromeSandbox: true });
  const status = electronRuntimeStatus(root, {
    platform: 'linux',
    statSync: fakeChromeSandboxStat(root, { uid: 0, mode: 0o4755 })
  });

  assert.equal(status.ok, true);
});

test('Electron runtime check accepts CI Linux no-sandbox waiver for chrome-sandbox permissions', (t) => {
  const root = makeElectronInstall(t, { executable: true, chromeSandbox: true });
  const status = electronRuntimeStatus(root, {
    env: { [WAIVER_ENV]: '1' },
    platform: 'linux',
    statSync: fakeChromeSandboxStat(root, { uid: 1000, mode: 0o0755 })
  });

  assert.equal(status.ok, true);
});

test('Electron runtime check reports the Linux chrome-sandbox setup command', (t) => {
  const root = makeElectronInstall(t, { executable: true, chromeSandbox: true });
  const chromeSandbox = electronChromeSandboxPath(root);
  const status = ensureElectronRuntime({
    env: {},
    projectRoot: root,
    repair: true,
    platform: 'linux',
    spawnSync: () => {
      throw new Error('repair should not run for chrome-sandbox permissions');
    },
    statSync: fakeChromeSandboxStat(root, { uid: 1000, mode: 0o0755 })
  });

  assert.equal(status.ok, false);
  assert.equal(status.reason, 'misconfigured-linux-chrome-sandbox');
  assert.match(status.message, /Linux Electron sandbox helper is misconfigured/);
  assert.match(status.message, /Expected: owner uid 0, mode 4755/);
  assert.match(status.message, /Actual: owner uid 1000, mode 0755/);
  assert.match(status.message, /Copy and run this command once/);
  assert.match(status.message, new RegExp(escapeRegExp(linuxChromeSandboxRepairCommand(chromeSandbox))));
});

function makeElectronInstall(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'postmeter-electron-runtime-'));
  const electronDir = path.join(root, 'node_modules', 'electron');
  const distDir = path.join(electronDir, 'dist');
  const executableName = process.platform === 'win32' ? 'electron.exe' : 'electron';
  fs.mkdirSync(distDir, { recursive: true });
  if (options.executable !== false) {
    fs.writeFileSync(path.join(distDir, executableName), '');
  }
  if (options.pathFile !== false) {
    fs.writeFileSync(path.join(electronDir, 'path.txt'), executableName);
  }
  if (options.installScript) {
    fs.writeFileSync(path.join(electronDir, 'install.js'), '');
  }
  if (options.chromeSandbox) {
    fs.writeFileSync(path.join(distDir, 'chrome-sandbox'), '');
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function fakeChromeSandboxStat(root, stat) {
  return (filePath) => {
    if (filePath === electronChromeSandboxPath(root)) {
      return {
        uid: stat.uid,
        mode: stat.mode
      };
    }
    return fs.statSync(filePath);
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
