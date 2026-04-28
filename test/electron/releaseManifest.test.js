const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { inferArtifactType, inferPlatform } = require('../../scripts/writeReleaseManifest');
const {
  validateLinuxAppImageProtocol,
  validateLinuxDebProtocol,
  macInfoPlistPathFromListing,
  validateMacZipProtocol,
  validatePackageMetadata,
  validateReleaseManifest
} = require('../../scripts/validateReleaseArtifacts');

test('writes release manifest with artifact metadata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-'));
  const packageJsonPath = path.join(tempDir, 'package.json');
  await fs.writeFile(packageJsonPath, JSON.stringify({
    name: 'postmeter',
    version: '9.9.9',
    build: {
      productName: 'PostMeter',
      appId: 'com.example.postmeter'
    }
  }));
  const artifactPath = path.join(tempDir, 'PostMeter-9.9.9.zip');
  await fs.writeFile(artifactPath, 'artifact');

  const result = await runNodeScript('writeReleaseManifest.js', {
    POSTMETER_RELEASE_DIR: tempDir,
    POSTMETER_PACKAGE_JSON: packageJsonPath
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = JSON.parse(await fs.readFile(path.join(tempDir, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.productName, 'PostMeter');
  assert.equal(manifest.version, '9.9.9');
  assert.equal(manifest.artifacts.length, 1);
  assert.equal(manifest.artifacts[0].file, 'PostMeter-9.9.9.zip');
  assert.equal(manifest.artifacts[0].platform, 'archive');
  assert.equal(manifest.artifacts[0].sha256, crypto.createHash('sha256').update('artifact').digest('hex'));
});

test('infers release artifact platforms and types for supported desktop targets', () => {
  assert.equal(inferPlatform('/release/PostMeter.AppImage'), 'linux');
  assert.equal(inferPlatform('/release/postmeter_0.2.0_amd64.deb'), 'linux');
  assert.equal(inferPlatform('/release/PostMeter Setup 0.2.0.exe'), 'windows');
  assert.equal(inferPlatform('/release/PostMeter-0.2.0.dmg'), 'macos');
  assert.equal(inferPlatform('/release/PostMeter-0.2.0.zip'), 'archive');
  assert.equal(inferArtifactType('/release/PostMeter.AppImage'), 'appimage');
  assert.equal(inferArtifactType('/release/PostMeter-0.2.0.dmg'), 'dmg');
});

test('validates release artifact manifest entries against files and package protocol metadata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-validate-'));
  const packageJsonPath = path.join(tempDir, 'package.json');
  await fs.writeFile(packageJsonPath, JSON.stringify({
    build: {
      appId: 'com.strangequark.postmeter',
      productName: 'PostMeter',
      protocols: [{ schemes: ['postmeter'] }]
    }
  }));
  const artifactPath = path.join(tempDir, 'PostMeter-9.9.9.dmg');
  await fs.writeFile(artifactPath, 'artifact');
  const artifactBytes = await fs.readFile(artifactPath);
  const hash = crypto.createHash('sha256').update(artifactBytes).digest('hex');
  const stat = await fs.stat(artifactPath);
  const manifestPath = path.join(tempDir, 'release-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({
    schemaVersion: 1,
    artifacts: [{
      file: 'PostMeter-9.9.9.dmg',
      sizeBytes: stat.size,
      sha256: hash,
      platform: 'macos',
      type: 'dmg'
    }]
  }));

  await assert.doesNotReject(() => validatePackageMetadata(packageJsonPath));
  await assert.doesNotReject(() => validateReleaseManifest({
    releaseDir: tempDir,
    manifestFile: manifestPath,
    requiredTypes: new Set(['dmg'])
  }));
  await assert.rejects(() => validateReleaseManifest({
    releaseDir: tempDir,
    manifestFile: manifestPath,
    requiredTypes: new Set(['deb'])
  }), /Missing required release artifact type/);
});

test('validates packaged Linux deb protocol registration when an artifact exists', async (t) => {
  const root = path.join(__dirname, '..', '..');
  const debPath = path.join(root, 'release', 'postmeter_0.2.0_amd64.deb');
  try {
    await fs.access(debPath);
  } catch {
    t.skip('Linux deb artifact has not been built in this workspace.');
    return;
  }

  await assert.doesNotReject(() => validateLinuxDebProtocol(debPath));
});

test('validates packaged Linux AppImage protocol registration when an artifact exists', async (t) => {
  const root = path.join(__dirname, '..', '..');
  const appImagePath = path.join(root, 'release', 'PostMeter-0.2.0.AppImage');
  try {
    await fs.access(appImagePath);
  } catch {
    t.skip('Linux AppImage artifact has not been built in this workspace.');
    return;
  }

  await assert.doesNotReject(() => validateLinuxAppImageProtocol(appImagePath));
});

test('validates packaged macOS zip protocol registration when an app bundle exists', async (t) => {
  if (!await commandExists('zip') || !await commandExists('unzip')) {
    t.skip('zip and unzip are required to create and inspect macOS zip fixtures.');
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-mac-zip-'));
  const appContents = path.join(tempDir, 'PostMeter.app', 'Contents');
  await fs.mkdir(appContents, { recursive: true });
  await fs.writeFile(path.join(appContents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>PostMeter OAuth Callback</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>postmeter</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`);
  const zipPath = path.join(tempDir, 'PostMeter-9.9.9-mac.zip');
  const result = await runCommand('zip', ['-qr', zipPath, 'PostMeter.app'], { cwd: tempDir });
  assert.equal(result.code, 0, result.stderr);

  await assert.doesNotReject(() => validateMacZipProtocol(zipPath));
});

test('selects the root PostMeter app plist before nested Electron helper app plists', () => {
  const listing = [
    'PostMeter.app/Contents/Frameworks/PostMeter Helper (GPU).app/Contents/Info.plist',
    'PostMeter.app/Contents/Frameworks/PostMeter Helper.app/Contents/Info.plist',
    'PostMeter.app/Contents/Info.plist'
  ].join('\n');

  assert.equal(macInfoPlistPathFromListing(listing), 'PostMeter.app/Contents/Info.plist');
});

test('validates macOS zip protocol registration against the root app plist, not helper app plists', async (t) => {
  if (!await commandExists('zip') || !await commandExists('unzip')) {
    t.skip('zip and unzip are required to create and inspect macOS zip fixtures.');
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-mac-helper-zip-'));
  const appContents = path.join(tempDir, 'PostMeter.app', 'Contents');
  const helperContents = path.join(appContents, 'Frameworks', 'PostMeter Helper (GPU).app', 'Contents');
  await fs.mkdir(helperContents, { recursive: true });
  await fs.writeFile(path.join(helperContents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>PostMeter Helper (GPU)</string>
</dict>
</plist>`);
  await fs.writeFile(path.join(appContents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>PostMeter OAuth Callback</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>postmeter</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`);
  const zipPath = path.join(tempDir, 'PostMeter-9.9.9-mac.zip');
  const result = await runCommand('zip', ['-qr', zipPath, 'PostMeter.app'], { cwd: tempDir });
  assert.equal(result.code, 0, result.stderr);

  const listing = await runCommand('unzip', ['-Z1', zipPath]);
  assert.equal(listing.code, 0, listing.stderr);
  assert.equal(macInfoPlistPathFromListing(listing.stdout), 'PostMeter.app/Contents/Info.plist');
  await assert.doesNotReject(() => validateMacZipProtocol(zipPath));
});

function runNodeScript(scriptName, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'scripts', scriptName)], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message || String(error) }));
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

async function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['-v'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', () => resolve(true));
  });
}
