const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CRITICAL_PACKAGING_PACKAGES = ['electron', 'electron-builder'];

test('third-party notices stay aligned with direct runtime and packaging dependencies', () => {
  const packageJson = readJson('package.json');
  const lockFile = readJson('package-lock.json');
  const notices = readText('docs/THIRD_PARTY_NOTICES.md');
  const packages = [
    ...Object.keys(packageJson.dependencies || {}),
    ...CRITICAL_PACKAGING_PACKAGES
  ].sort();

  for (const packageName of packages) {
    const lockPackage = lockFile.packages?.[`node_modules/${packageName}`];
    assert.ok(lockPackage, `package-lock.json is missing ${packageName}`);
    const packageVersion = lockPackage.version;
    const packageLicense = resolvePackageLicense(packageName, lockPackage);
    assert.ok(packageVersion, `package-lock.json is missing a version for ${packageName}`);
    assert.ok(packageLicense, `No license could be resolved for ${packageName}`);
    assert.match(
      notices,
      new RegExp(`\\\`${escapeRegExp(packageName)}@${escapeRegExp(packageVersion)}\\\``),
      `docs/THIRD_PARTY_NOTICES.md must list ${packageName}@${packageVersion}`
    );
    assert.match(
      notices,
      new RegExp(escapeRegExp(packageLicense)),
      `docs/THIRD_PARTY_NOTICES.md must include ${packageName} license ${packageLicense}`
    );
  }
});

test('.gitignore keeps generated artifacts out while preserving release source inputs', () => {
  const ignored = readText('.gitignore')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const requiredPatterns = [
    'target/',
    'node_modules/',
    'out/',
    'release/',
    'dist-electron/',
    'artifacts/',
    'gha-logs/',
    'gha-artifacts/',
    'native/windows-sandbox-helper/bin/',
    'npm-debug.log*',
    '.idea/modules.xml',
    '.idea/jarRepositories.xml',
    '.idea/compiler.xml',
    '.idea/libraries/',
    '*.iws',
    '*.iml',
    '*.ipr',
    '.classpath',
    '.project',
    '.vscode/',
    '.DS_Store',
    '/dist/',
    'build/',
    '!build/',
    '!build/icon.png'
  ];
  const forbiddenSourcePatterns = [
    'src/',
    '/src/',
    'electron/',
    '/electron/',
    'docs/',
    '/docs/',
    'test/',
    '/test/',
    'package.json',
    'package-lock.json',
    'README.md',
    'LICENSE'
  ];

  for (const pattern of requiredPatterns) {
    assert.ok(ignored.includes(pattern), `.gitignore should include ${pattern}`);
  }
  for (const pattern of forbiddenSourcePatterns) {
    assert.equal(ignored.includes(pattern), false, `.gitignore should not ignore source input ${pattern}`);
  }
  assert.ok(
    ignored.indexOf('build/') < ignored.indexOf('!build/')
      && ignored.indexOf('!build/') < ignored.indexOf('!build/icon.png'),
    '.gitignore should re-include build/icon.png after the generated build/ directory pattern'
  );
});

function resolvePackageLicense(packageName, lockPackage) {
  if (lockPackage.license) {
    return String(lockPackage.license);
  }
  const packageJsonPath = path.join(PROJECT_ROOT, 'node_modules', packageName, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return Array.isArray(packageJson.license)
    ? packageJson.license.map((entry) => entry.type || entry).join(' OR ')
    : String(packageJson.license || '');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
