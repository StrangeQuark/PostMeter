const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { findArtifacts } = require('../../scripts/writeReleaseChecksums');
const { inferArtifactType, inferPlatform } = require('../../scripts/writeReleaseManifest');
const {
  ensureExecutableFile,
  validateLinuxAppImageProtocol,
  validateLinuxDebProtocol,
  macInfoPlistPathFromListing,
  releaseValidationCommandTimeoutMillis,
  runCommand: runValidatedReleaseCommand,
  sha512FileBase64,
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
    buildTimestamp: '2026-05-25T00:00:00.000Z',
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
  assert.equal(Number.isNaN(Date.parse(manifest.buildTimestamp)), false);
  assert.equal(manifest.artifacts.length, 1);
  assert.equal(manifest.artifacts[0].file, 'PostMeter-9.9.9.zip');
  assert.equal(manifest.artifacts[0].platform, 'macos');
  assert.equal(manifest.artifacts[0].sha256, crypto.createHash('sha256').update('artifact').digest('hex'));
});

test('infers release artifact platforms and types for supported desktop targets', () => {
  assert.equal(inferPlatform('/release/PostMeter.AppImage'), 'linux');
  assert.equal(inferPlatform('/release/postmeter_0.2.0_amd64.deb'), 'linux');
  assert.equal(inferPlatform('/release/PostMeter Setup 0.2.0.exe'), 'windows');
  assert.equal(inferPlatform('/release/PostMeter-Setup-0.2.0.exe'), 'windows');
  assert.equal(inferPlatform('/release/PostMeter-0.2.0.dmg'), 'macos');
  assert.equal(inferPlatform('/release/PostMeter-0.2.0.zip'), 'macos');
  assert.equal(inferPlatform('/release/PostMeter-0.2.0.msi'), 'unknown');
  assert.equal(inferPlatform('/release/postmeter-0.2.0.rpm'), 'unknown');
  assert.equal(inferArtifactType('/release/PostMeter.AppImage'), 'appimage');
  assert.equal(inferArtifactType('/release/PostMeter-0.2.0.dmg'), 'dmg');
});

test('release artifact discovery ignores unpacked packaged-app internals', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-top-level-'));
  try {
    const appImagePath = path.join(tempDir, 'PostMeter-9.9.9.AppImage');
    const msiPath = path.join(tempDir, 'PostMeter-9.9.9.msi');
    const rpmPath = path.join(tempDir, 'postmeter-9.9.9.rpm');
    const unpackedExePath = path.join(tempDir, 'win-unpacked', 'PostMeter.exe');
    await fs.mkdir(path.dirname(unpackedExePath), { recursive: true });
    await fs.writeFile(appImagePath, 'top-level artifact');
    await fs.writeFile(msiPath, 'unsupported msi');
    await fs.writeFile(rpmPath, 'unsupported rpm');
    await fs.writeFile(unpackedExePath, 'packaged internal executable');

    assert.deepEqual((await findArtifacts(tempDir)).map((file) => path.basename(file)), [
      'PostMeter-9.9.9.AppImage'
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('release manifest validation rejects unconfigured MSI and RPM distributables', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-unsupported-artifacts-'));
  try {
    const artifactPath = path.join(tempDir, 'PostMeter-9.9.9.dmg');
    await fs.writeFile(artifactPath, 'artifact');
    const artifactBytes = await fs.readFile(artifactPath);
    const hash = crypto.createHash('sha256').update(artifactBytes).digest('hex');
    const stat = await fs.stat(artifactPath);
    const manifestPath = path.join(tempDir, 'release-manifest.json');
    const checksumPath = path.join(tempDir, 'SHA256SUMS');
    await fs.writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      productName: 'PostMeter',
      appId: 'com.strangequark.postmeter',
      version: '9.9.9',
      buildTimestamp: '2026-05-25T00:00:00.000Z',
      artifacts: [{
        file: 'PostMeter-9.9.9.dmg',
        sizeBytes: stat.size,
        sha256: hash,
        platform: 'macos',
        type: 'dmg'
      }]
    }));
    await fs.writeFile(checksumPath, `${hash}  PostMeter-9.9.9.dmg\n`);
    await fs.writeFile(path.join(tempDir, 'PostMeter-9.9.9.MSI'), 'unsupported msi');
    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /not a configured PostMeter release artifact type/);

    await fs.rm(path.join(tempDir, 'PostMeter-9.9.9.MSI'));
    await fs.writeFile(path.join(tempDir, 'postmeter-9.9.9.rpm'), 'unsupported rpm');
    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /not a configured PostMeter release artifact type/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('validates release artifact manifest entries against files and package protocol metadata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-validate-'));
  const packageJsonPath = path.join(tempDir, 'package.json');
  await fs.writeFile(packageJsonPath, JSON.stringify({
    version: '9.9.9',
    buildTimestamp: '2026-05-25T00:00:00.000Z',
    author: 'StrangeQuark <support@qrksw.com>',
    homepage: 'https://github.com/StrangeQuark/PostMeter#readme',
    repository: { url: 'git+https://github.com/StrangeQuark/PostMeter.git' },
    bugs: { url: 'https://github.com/StrangeQuark/PostMeter/issues' },
    build: {
      appId: 'com.strangequark.postmeter',
      productName: 'PostMeter',
      icon: 'build/icon.png',
      protocols: [{ schemes: ['postmeter'] }],
      publish: [{ provider: 'github', owner: 'StrangeQuark', repo: 'PostMeter', releaseType: 'release' }],
      directories: { output: 'release' },
      linux: {
        icon: 'build/icons',
        maintainer: 'StrangeQuark <support@qrksw.com>',
        target: ['AppImage', 'deb']
      },
      deb: {
        afterRemove: 'build/linux-after-remove.tpl',
        fpm: ['--before-remove=build/linux-before-remove.tpl']
      },
      win: { icon: 'build/icon.ico', target: ['nsis'] },
      nsis: { installerIcon: 'build/icon.ico', uninstallerIcon: 'build/icon.ico' },
      mac: { target: ['dmg', 'zip'] }
    }
  }));
  const artifactPath = path.join(tempDir, 'PostMeter-9.9.9.dmg');
  await fs.writeFile(artifactPath, 'artifact');
  const artifactBytes = await fs.readFile(artifactPath);
  const hash = crypto.createHash('sha256').update(artifactBytes).digest('hex');
  const stat = await fs.stat(artifactPath);
  const manifestPath = path.join(tempDir, 'release-manifest.json');
  const checksumPath = path.join(tempDir, 'SHA256SUMS');
  await fs.writeFile(manifestPath, JSON.stringify({
    schemaVersion: 1,
    productName: 'PostMeter',
    appId: 'com.strangequark.postmeter',
    version: '9.9.9',
    buildTimestamp: '2026-05-25T00:00:00.000Z',
    artifacts: [{
      file: 'PostMeter-9.9.9.dmg',
      sizeBytes: stat.size,
      sha256: hash,
      platform: 'macos',
      type: 'dmg'
    }]
  }));
  await fs.writeFile(checksumPath, `${hash}  PostMeter-9.9.9.dmg\n`);
  await writeUpdaterMetadata(tempDir, 'latest-mac.yml', 'PostMeter-9.9.9.dmg', '9.9.9');

  await assert.doesNotReject(() => validatePackageMetadata(packageJsonPath));
  await assert.doesNotReject(() => validateReleaseManifest({
    releaseDir: tempDir,
    manifestFile: manifestPath,
    requiredTypes: new Set(['dmg']),
    expectedProductName: 'PostMeter',
    expectedAppId: 'com.strangequark.postmeter',
    expectedVersion: '9.9.9'
  }));
  await assert.rejects(() => validateReleaseManifest({
    releaseDir: tempDir,
    manifestFile: manifestPath,
    requiredTypes: new Set(['zip'])
  }), /Missing required release artifact type/);
});

test('release validation requires and verifies electron-updater metadata for required platforms', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-updater-metadata-'));
  try {
    const artifactPath = path.join(tempDir, 'PostMeter-Setup-9.9.9.exe');
    await fs.writeFile(artifactPath, 'installer');
    const artifactBytes = await fs.readFile(artifactPath);
    const hash = crypto.createHash('sha256').update(artifactBytes).digest('hex');
    const stat = await fs.stat(artifactPath);
    const manifestPath = path.join(tempDir, 'release-manifest.json');
    const checksumPath = path.join(tempDir, 'SHA256SUMS');
    await fs.writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      productName: 'PostMeter',
      appId: 'com.strangequark.postmeter',
      version: '9.9.9',
      buildTimestamp: '2026-05-25T00:00:00.000Z',
      artifacts: [{
        file: 'PostMeter-Setup-9.9.9.exe',
        sizeBytes: stat.size,
        sha256: hash,
        platform: 'windows',
        type: 'exe'
      }]
    }));
    await fs.writeFile(checksumPath, `${hash}  PostMeter-Setup-9.9.9.exe\n`);

    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      requiredTypes: new Set(['exe']),
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /Missing electron-updater metadata file: latest\.yml/);

    await writeUpdaterMetadata(tempDir, 'latest.yml', 'PostMeter-Setup-9.9.9.exe', '9.9.9');
    await assert.doesNotReject(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      requiredTypes: new Set(['exe']),
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }));

    await fs.writeFile(path.join(tempDir, 'latest.yml'), [
      'version: 9.9.9',
      'files:',
      '  - url: PostMeter-Setup-9.9.9.exe',
      '    sha512: stale',
      'path: PostMeter-Setup-9.9.9.exe',
      'sha512: stale',
      ''
    ].join('\n'));
    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      requiredTypes: new Set(['exe']),
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /latest\.yml SHA-512/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('release validation rejects unsafe or unmanifested updater artifact references', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-updater-reference-'));
  try {
    const artifactPath = path.join(tempDir, 'PostMeter-Setup-9.9.9.exe');
    await fs.writeFile(artifactPath, 'installer');
    const artifactBytes = await fs.readFile(artifactPath);
    const hash = crypto.createHash('sha256').update(artifactBytes).digest('hex');
    const stat = await fs.stat(artifactPath);
    const manifestPath = path.join(tempDir, 'release-manifest.json');
    const checksumPath = path.join(tempDir, 'SHA256SUMS');
    await fs.writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      productName: 'PostMeter',
      appId: 'com.strangequark.postmeter',
      version: '9.9.9',
      buildTimestamp: '2026-05-25T00:00:00.000Z',
      artifacts: [{
        file: 'PostMeter-Setup-9.9.9.exe',
        sizeBytes: stat.size,
        sha256: hash,
        platform: 'windows',
        type: 'exe'
      }]
    }));
    await fs.writeFile(checksumPath, `${hash}  PostMeter-Setup-9.9.9.exe\n`);

    await fs.writeFile(path.join(tempDir, 'latest.yml'), [
      'version: 9.9.9',
      'files:',
      '  - url: https://downloads.example.test/PostMeter-Setup-9.9.9.exe',
      'path: https://downloads.example.test/PostMeter-Setup-9.9.9.exe',
      ''
    ].join('\n'));
    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      requiredTypes: new Set(['exe']),
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /updater artifact URLs must be top-level release filenames/);

    await fs.writeFile(path.join(tempDir, 'latest.yml'), [
      'version: 9.9.9',
      'files:',
      '  - url: nested/PostMeter-Setup-9.9.9.exe',
      'path: nested/PostMeter-Setup-9.9.9.exe',
      ''
    ].join('\n'));
    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      requiredTypes: new Set(['exe']),
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /updater artifact URLs must be top-level release filenames/);

    await fs.writeFile(path.join(tempDir, 'latest.yml'), [
      'version: 9.9.9',
      'files:',
      '  - url: PostMeter-Setup-9.9.9-copy.exe',
      'path: PostMeter-Setup-9.9.9-copy.exe',
      ''
    ].join('\n'));
    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      requiredTypes: new Set(['exe']),
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /release-manifest\.json does not list/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('release manifest validation rejects stale checksums and unmanifested top-level artifacts', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-checksum-'));
  try {
    const artifactPath = path.join(tempDir, 'PostMeter-9.9.9.dmg');
    await fs.writeFile(artifactPath, 'artifact');
    const artifactBytes = await fs.readFile(artifactPath);
    const hash = crypto.createHash('sha256').update(artifactBytes).digest('hex');
    const stat = await fs.stat(artifactPath);
    const manifestPath = path.join(tempDir, 'release-manifest.json');
    const checksumPath = path.join(tempDir, 'SHA256SUMS');
    await fs.writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      productName: 'PostMeter',
      appId: 'com.strangequark.postmeter',
      version: '9.9.9',
      buildTimestamp: '2026-05-25T00:00:00.000Z',
      artifacts: [{
        file: 'PostMeter-9.9.9.dmg',
        sizeBytes: stat.size,
        sha256: hash,
        platform: 'macos',
        type: 'dmg'
      }]
    }));
    await fs.writeFile(checksumPath, `${'0'.repeat(64)}  PostMeter-9.9.9.dmg\n`);

    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /SHA256SUMS hash/);

    await fs.writeFile(checksumPath, `${hash}  PostMeter-9.9.9.dmg\n`);
    await fs.writeFile(path.join(tempDir, 'PostMeter Setup 9.9.9.exe'), 'extra installer');
    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      checksumFile: checksumPath,
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /missing from release-manifest\.json/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('release manifest validation rejects packaged internal paths', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-release-internal-path-'));
  try {
    const artifactPath = path.join(tempDir, 'win-unpacked', 'PostMeter.exe');
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, 'internal executable');
    const artifactBytes = await fs.readFile(artifactPath);
    const manifestPath = path.join(tempDir, 'release-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      productName: 'PostMeter',
      appId: 'com.strangequark.postmeter',
      version: '9.9.9',
      buildTimestamp: '2026-05-25T00:00:00.000Z',
      artifacts: [{
        file: 'win-unpacked/PostMeter.exe',
        sizeBytes: artifactBytes.length,
        sha256: crypto.createHash('sha256').update(artifactBytes).digest('hex'),
        platform: 'windows',
        type: 'exe'
      }]
    }));

    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /top-level distributable file/);

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.artifacts[0].file = 'win-unpacked\\PostMeter.exe';
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(() => validateReleaseManifest({
      releaseDir: tempDir,
      manifestFile: manifestPath,
      expectedProductName: 'PostMeter',
      expectedAppId: 'com.strangequark.postmeter',
      expectedVersion: '9.9.9'
    }), /top-level distributable file/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('validates packaged Linux deb protocol registration when an artifact exists', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Linux deb protocol inspection requires a Linux host.');
    return;
  }

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
  if (process.platform !== 'linux') {
    t.skip('Linux AppImage protocol inspection requires a Linux host.');
    return;
  }

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

test('release validation restores execute bits before AppImage inspection', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX execute bits are not observable through fs.stat on Windows.');
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-appimage-mode-'));
  const filePath = path.join(tempDir, 'PostMeter.AppImage');
  try {
    await fs.writeFile(filePath, '');
    await fs.chmod(filePath, 0o644);
    await ensureExecutableFile(filePath);
    const stat = await fs.stat(filePath);
    assert.notEqual(stat.mode & 0o111, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('release validation external commands have bounded timeouts', async () => {
  assert.equal(releaseValidationCommandTimeoutMillis('25'), 25);
  assert.equal(releaseValidationCommandTimeoutMillis('0'), 30000);

  await assert.rejects(
    () => runValidatedReleaseCommand(process.execPath, [
      '-e',
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'
    ], {
      killGraceMillis: 25,
      timeoutMillis: 25
    }),
    /timed out after 25 ms/
  );
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

async function writeUpdaterMetadata(releaseDir, fileName, artifactFile, version) {
  const sha512 = await sha512FileBase64(path.join(releaseDir, artifactFile));
  await fs.writeFile(path.join(releaseDir, fileName), [
    `version: ${version}`,
    'files:',
    `  - url: ${artifactFile}`,
    `    sha512: "${sha512}"`,
    `path: ${artifactFile}`,
    `sha512: "${sha512}"`,
    ''
  ].join('\n'));
}

async function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['-v'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', () => resolve(true));
  });
}
