const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

test('CI workflow runs the Electron UI and packaging validation suite', async () => {
  const root = path.join(__dirname, '..', '..');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /apt-get install -y bubblewrap/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run postman:parity:validate/);
  assert.match(workflow, /npm run postman:docs:validate/);
  assert.match(workflow, /npm run release:gate/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.match(workflow, /npm run sandbox:validate/);
  assert.match(workflow, /npm run sandbox:platform:validate/);
  assert.match(workflow, /xvfb-run -a npm run test:smoke/);
  assert.match(workflow, /xvfb-run -a npm run test:ui\b/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:regression/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:oauth/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:snapshot/);
  assert.match(workflow, /npm run pack:linux/);
  assert.match(workflow, /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*"1"/);
  assert.match(workflow, /xvfb-run -a npm run sandbox:validate:packaged/);
});

test('release workflow builds unsigned artifacts for all tier-one desktop platforms', async () => {
  const root = path.join(__dirname, '..', '..');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');

  assert.match(workflow, /tags:\s*\n\s*-\s+"v\*"/);
  assert.match(workflow, /platform:\s*linux/);
  assert.match(workflow, /platform:\s*windows/);
  assert.match(workflow, /platform:\s*macos/);
  assert.match(workflow, /npm run dist:linux/);
  assert.match(workflow, /npm run dist:win/);
  assert.match(workflow, /npm run dist:mac/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run electron:version/);
  assert.match(workflow, /apt-get install -y bubblewrap/);
  assert.match(workflow, /npm run sandbox:validate/);
  assert.match(workflow, /npm run sandbox:platform:validate/);
  assert.match(workflow, /npm run postman:parity:validate/);
  assert.match(workflow, /npm run postman:docs:validate/);
  assert.match(workflow, /npm run release:gate/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/);
  assert.match(workflow, /npm run sandbox:validate:packaged/);
  assert.match(workflow, /xvfb-run -a npm run sandbox:validate:packaged/);
  assert.match(workflow, /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*"1"/);
  assert.match(workflow, /Validate Windows protocol registration/);
  assert.match(workflow, /npm run release:validate:win-protocol/);
  assert.match(workflow, /Validate macOS protocol registration/);
  assert.match(workflow, /npm run release:validate:mac-protocol/);
  assert.match(workflow, /npm run release:prepare/);
  assert.match(workflow, /npm run release:validate/);
  assert.match(workflow, /POSTMETER_RELEASE_REQUIRED_TYPES:\s*appimage,deb,dmg,zip,exe/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /release\/\*\.AppImage/);
  assert.match(workflow, /release\/\*\.deb/);
  assert.match(workflow, /release\/\*\.dmg/);
  assert.match(workflow, /release\/\*\.zip/);
  assert.match(workflow, /release\/\*\.exe/);
});

test('manual native release validation workflow exercises release evidence without publishing', async () => {
  const root = path.join(__dirname, '..', '..');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'release-validation.yml'), 'utf8');
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /platform:\s*linux/);
  assert.match(workflow, /platform:\s*windows/);
  assert.match(workflow, /platform:\s*macos/);
  assert.match(workflow, /npm run dist:linux/);
  assert.match(workflow, /npm run dist:win/);
  assert.match(workflow, /npm run dist:mac/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run sandbox:validate/);
  assert.match(workflow, /npm run sandbox:platform:validate/);
  assert.match(workflow, /npm run postman:parity:validate/);
  assert.match(workflow, /npm run postman:docs:validate/);
  assert.match(workflow, /npm run release:gate/);
  assert.match(workflow, /npm run release:validate:packaged-smoke/);
  assert.match(workflow, /npm run sandbox:validate:packaged/);
  assert.match(workflow, /xvfb-run -a npm run sandbox:validate:packaged/);
  assert.match(workflow, /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*"1"/);
  assert.match(workflow, /npm run release:validate:win-protocol/);
  assert.match(workflow, /npm run release:validate:mac-protocol/);
  assert.match(workflow, /npm run release:prepare/);
  assert.match(workflow, /npm run release:validate/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.doesNotMatch(workflow, /gh release create/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  for (const scriptName of ['dist:linux', 'dist:win', 'dist:mac']) {
    assert.match(packageJson.scripts[scriptName], /--publish never/);
  }
});
