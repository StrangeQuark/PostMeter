const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  APP_RENDERER_ALLOWED_ASSET_PATHS
} = require('../../electron/app-shell/rendererAssetManifest');

test('package metadata points to a valid production PNG icon', async () => {
  const root = path.join(__dirname, '..', '..');
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const iconPath = packageJson.build?.icon;
  assert.equal(iconPath, 'build/icon.png');

  const icon = await fs.readFile(path.join(root, iconPath));
  assert.equal(icon.readUInt32BE(0), 0x89504e47);
  assert.equal(icon.toString('ascii', 1, 4), 'PNG');
  const width = icon.readUInt32BE(16);
  const height = icon.readUInt32BE(20);
  assert.ok(width >= 512, `Icon width should be at least 512px, got ${width}.`);
  assert.ok(height >= 512, `Icon height should be at least 512px, got ${height}.`);
});

test('package metadata declares canonical release repository and desktop protocol', async () => {
  const root = path.join(__dirname, '..', '..');
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const installerInclude = await fs.readFile(path.join(root, 'build', 'installer.nsh'), 'utf8');

  assert.equal(packageJson.repository.url, 'git+https://github.com/StrangeQuark/PostMeter.git');
  assert.equal(packageJson.homepage, 'https://github.com/StrangeQuark/PostMeter#readme');
  assert.equal(packageJson.bugs.url, 'https://github.com/StrangeQuark/PostMeter/issues');
  assert.equal(packageJson.author, 'StrangeQuark <support@qrksw.com>');
  assert.equal(packageJson.build.linux.maintainer, 'StrangeQuark <support@qrksw.com>');
  assert.ok(packageJson.build.files.includes('src/**/*'));
  assert.ok(packageJson.build.files.includes('electron/**/*'));
  for (const assetPath of APP_RENDERER_ALLOWED_ASSET_PATHS) {
    const packagePath = assetPath.replace(/^\//, '');
    assert.ok(
      packageJson.build.files.includes(packagePath)
        || packageJson.build.files.some((pattern) => pattern.endsWith('/**/*') && packagePath.startsWith(pattern.slice(0, -'/**/*'.length))),
      `Packaged files must include app protocol asset ${assetPath}.`
    );
  }
  assert.ok(packageJson.build.win.extraResources.some((entry) => (
    entry.from === 'native/windows-sandbox-helper/bin/PostMeterWindowsSandboxHelper.exe'
    && entry.to === 'native/windows/PostMeterWindowsSandboxHelper.exe'
  )));
  assert.equal(packageJson.build.nsis.artifactName, '${productName}-Setup-${version}.${ext}');
  assert.equal(packageJson.build.nsis.include, 'build/installer.nsh');
  assert.ok(packageJson.build.protocols.some((protocol) => protocol.schemes.includes('postmeter')));
  assert.match(installerInclude, /WriteRegStr HKCU "Software\\Classes\\postmeter"/);
  assert.match(installerInclude, /URL Protocol/);
  assert.match(installerInclude, /%1/);
  assert.match(installerInclude, /DeleteRegKey HKCU "Software\\Classes\\postmeter"/);
});
