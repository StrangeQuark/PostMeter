const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  packagedAppResourcePath,
  packagedResourcesPath,
  packagedSandboxRuntimeCliPath,
  packagedStartupSmokeNodePath,
  PACKAGED_SANDBOX_RUNTIME_CLI_PARTS,
  PACKAGED_STARTUP_SMOKE_NODE_PARTS
} = require('../../electron/packaging/packagedResourceManifest');

test('packaged resource manifest resolves helper paths inside app.asar when present', async (t) => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-resource-asar-'));
  t.after(async () => fsp.rm(tempDir, { recursive: true, force: true }));
  const executable = path.join(tempDir, 'PostMeter');
  const resourcesDir = path.join(tempDir, 'resources');
  const appAsar = path.join(resourcesDir, 'app.asar');
  await fsp.mkdir(resourcesDir, { recursive: true });
  await fsp.writeFile(executable, '');
  await fsp.writeFile(appAsar, '');

  assert.equal(
    packagedStartupSmokeNodePath(executable),
    path.join(appAsar, ...PACKAGED_STARTUP_SMOKE_NODE_PARTS)
  );
  assert.equal(
    packagedSandboxRuntimeCliPath(executable),
    path.join(appAsar, ...PACKAGED_SANDBOX_RUNTIME_CLI_PARTS)
  );
  assert.equal(
    packagedAppResourcePath(executable, ['custom', 'resource.txt']),
    path.join(appAsar, 'custom', 'resource.txt')
  );
});

test('packaged resource manifest resolves macOS resources from Contents/Resources', async (t) => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-resource-macos-'));
  t.after(async () => fsp.rm(tempDir, { recursive: true, force: true }));
  const executable = path.join(tempDir, 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter');
  const resourcesDir = path.join(tempDir, 'PostMeter.app', 'Contents', 'Resources');
  const appAsar = path.join(resourcesDir, 'app.asar');
  await fsp.mkdir(path.dirname(executable), { recursive: true });
  await fsp.mkdir(resourcesDir, { recursive: true });
  await fsp.writeFile(executable, '');
  await fsp.writeFile(appAsar, '');

  assert.equal(packagedResourcesPath(executable), resourcesDir);
  assert.equal(
    packagedStartupSmokeNodePath(executable),
    path.join(appAsar, ...PACKAGED_STARTUP_SMOKE_NODE_PARTS)
  );
  assert.equal(
    packagedSandboxRuntimeCliPath(executable),
    path.join(appAsar, ...PACKAGED_SANDBOX_RUNTIME_CLI_PARTS)
  );
});

test('packaged resource manifest falls back to unpacked app resource directory', async (t) => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-resource-app-'));
  t.after(async () => fsp.rm(tempDir, { recursive: true, force: true }));
  const executable = path.join(tempDir, 'PostMeter.exe');
  await fsp.mkdir(path.join(tempDir, 'resources'), { recursive: true });
  await fsp.writeFile(executable, '');

  assert.equal(
    packagedStartupSmokeNodePath(path.relative(process.cwd(), executable)),
    path.join(path.resolve(tempDir), 'resources', 'app', ...PACKAGED_STARTUP_SMOKE_NODE_PARTS)
  );
  assert.equal(fs.existsSync(path.join(tempDir, 'resources', 'app.asar')), false);
});
