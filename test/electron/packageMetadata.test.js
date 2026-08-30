const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  APP_RENDERER_ALLOWED_ASSET_PATHS
} = require('../../electron/app-shell/rendererAssetManifest');

const LINUX_ICON_SIZES = Object.freeze([16, 24, 32, 48, 64, 128, 256, 512, 1024]);
const WINDOWS_ICON_SIZES = Object.freeze([16, 24, 32, 48, 64, 128, 256]);

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

test('package metadata points platform builds to complete icon assets', async () => {
  const root = path.join(__dirname, '..', '..');
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

  assert.equal(packageJson.build?.linux?.icon, 'build/icons');
  for (const size of LINUX_ICON_SIZES) {
    const icon = await fs.readFile(path.join(root, 'build', 'icons', `${size}x${size}.png`));
    assert.equal(icon.readUInt32BE(0), 0x89504e47);
    assert.equal(icon.toString('ascii', 1, 4), 'PNG');
    assert.equal(icon.readUInt32BE(16), size);
    assert.equal(icon.readUInt32BE(20), size);
  }

  assert.equal(packageJson.build?.win?.icon, 'build/icon.ico');
  const ico = await fs.readFile(path.join(root, 'build', 'icon.ico'));
  assert.deepEqual(readIcoSizes(ico), WINDOWS_ICON_SIZES.map((size) => `${size}x${size}`));
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
  assert.equal(packageJson.build.nsis.installerIcon, 'build/icon.ico');
  assert.equal(packageJson.build.nsis.uninstallerIcon, 'build/icon.ico');
  assert.equal(packageJson.build.deb.afterRemove, 'build/linux-after-remove.tpl');
  assert.ok(packageJson.build.deb.fpm.includes('--before-remove=build/linux-before-remove.tpl'));
  const debBeforeRemove = await fs.readFile(path.join(root, 'build', 'linux-before-remove.tpl'), 'utf8');
  const debAfterRemove = await fs.readFile(path.join(root, 'build', 'linux-after-remove.tpl'), 'utf8');
  assert.match(debBeforeRemove, /update-alternatives --remove 'postmeter' '\/opt\/PostMeter\/postmeter'/);
  assert.doesNotMatch(debBeforeRemove, /update-alternatives --remove 'postmeter' '\/usr\/bin\/postmeter'/);
  assert.match(debAfterRemove, /APPARMOR_PROFILE_DEST='\/etc\/apparmor\.d\/postmeter'/);
  assert.doesNotMatch(debAfterRemove, /update-alternatives/);
  assert.ok(packageJson.build.protocols.some((protocol) => protocol.schemes.includes('postmeter')));
  assert.match(installerInclude, /WriteRegStr HKCU "Software\\Classes\\postmeter"/);
  assert.match(installerInclude, /URL Protocol/);
  assert.match(installerInclude, /%1/);
  assert.match(installerInclude, /DeleteRegKey HKCU "Software\\Classes\\postmeter"/);
});

function readIcoSizes(buffer) {
  assert.ok(buffer.length >= 6, 'ICO must contain a header.');
  assert.equal(buffer.readUInt16LE(0), 0, 'ICO reserved header must be zero.');
  assert.equal(buffer.readUInt16LE(2), 1, 'ICO type must be icon.');
  const count = buffer.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + (index * 16);
    assert.ok(buffer.length >= offset + 16, 'ICO entry table is truncated.');
    const width = buffer[offset] || 256;
    const height = buffer[offset + 1] || 256;
    sizes.push(`${width}x${height}`);
  }
  return sizes.sort((left, right) => Number(left.split('x')[0]) - Number(right.split('x')[0]));
}
