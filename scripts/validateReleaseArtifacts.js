const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { findArtifacts, sha256File, UNSUPPORTED_DISTRIBUTABLE_EXTENSIONS } = require('./writeReleaseChecksums');

const RELEASE_DIR = process.env.POSTMETER_RELEASE_DIR
  ? path.resolve(process.env.POSTMETER_RELEASE_DIR)
  : path.join(__dirname, '..', 'release');
const PACKAGE_JSON = process.env.POSTMETER_PACKAGE_JSON
  ? path.resolve(process.env.POSTMETER_PACKAGE_JSON)
  : path.join(__dirname, '..', 'package.json');
const MANIFEST_FILE = process.env.POSTMETER_RELEASE_MANIFEST
  ? path.resolve(process.env.POSTMETER_RELEASE_MANIFEST)
  : path.join(RELEASE_DIR, 'release-manifest.json');
const CHECKSUM_FILE = process.env.POSTMETER_RELEASE_CHECKSUMS
  ? path.resolve(process.env.POSTMETER_RELEASE_CHECKSUMS)
  : path.join(RELEASE_DIR, 'SHA256SUMS');

async function main() {
  const packageJson = await validatePackageMetadata(PACKAGE_JSON);
  await validateReleaseManifest({
    releaseDir: RELEASE_DIR,
    manifestFile: MANIFEST_FILE,
    checksumFile: CHECKSUM_FILE,
    requiredTypes: csvSet(process.env.POSTMETER_RELEASE_REQUIRED_TYPES),
    expectedAppId: packageJson.build.appId,
    expectedProductName: packageJson.build.productName,
    expectedVersion: packageJson.version
  });
  console.log(`Validated release artifacts in ${RELEASE_DIR}`);
}

async function validatePackageMetadata(packageJsonPath) {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const build = packageJson.build || {};
  if (packageJson.build?.appId !== 'com.strangequark.postmeter') {
    throw new Error('package.json build.appId must be com.strangequark.postmeter.');
  }
  if (packageJson.build?.productName !== 'PostMeter') {
    throw new Error('package.json build.productName must be PostMeter.');
  }
  if (packageJson.author !== 'StrangeQuark <support@qrksw.com>') {
    throw new Error('package.json author must be StrangeQuark <support@qrksw.com>.');
  }
  if (!packageJson.version) {
    throw new Error('package.json version is required for release artifact naming.');
  }
  if (packageJson.homepage !== 'https://github.com/StrangeQuark/PostMeter#readme') {
    throw new Error('package.json homepage must point to the canonical PostMeter GitHub release source.');
  }
  if (packageJson.repository?.url !== 'git+https://github.com/StrangeQuark/PostMeter.git') {
    throw new Error('package.json repository.url must point to StrangeQuark/PostMeter.');
  }
  if (packageJson.bugs?.url !== 'https://github.com/StrangeQuark/PostMeter/issues') {
    throw new Error('package.json bugs.url must point to StrangeQuark/PostMeter issues.');
  }
  if (build.icon !== 'build/icon.png') {
    throw new Error('package.json build.icon must point to build/icon.png.');
  }
  if (build.directories?.output !== 'release') {
    throw new Error('package.json build.directories.output must be release.');
  }
  if (!packageJson.build?.protocols?.some((protocol) => (protocol.schemes || []).includes('postmeter'))) {
    throw new Error('package.json must declare the postmeter:// custom protocol.');
  }
  requireBuildTargets(build.linux?.target, ['AppImage', 'deb'], 'Linux');
  requireBuildTargets(build.win?.target, ['nsis'], 'Windows');
  requireBuildTargets(build.mac?.target, ['dmg', 'zip'], 'macOS');
  if (build.linux?.maintainer !== 'StrangeQuark <support@qrksw.com>') {
    throw new Error('package.json build.linux.maintainer must be StrangeQuark <support@qrksw.com>.');
  }
  if (build.fileAssociations && (!Array.isArray(build.fileAssociations) || build.fileAssociations.length)) {
    throw new Error('package.json must not declare file associations until release docs and validators cover them.');
  }
  return packageJson;
}

function requireBuildTargets(actualTargets, expectedTargets, label) {
  const actual = new Set((Array.isArray(actualTargets) ? actualTargets : [])
    .map((target) => String(target || '').toLowerCase()));
  for (const target of expectedTargets) {
    if (!actual.has(target.toLowerCase())) {
      throw new Error(`package.json ${label} build target must include ${target}.`);
    }
  }
}

async function validateReleaseManifest({
  releaseDir,
  manifestFile,
  checksumFile = path.join(releaseDir, 'SHA256SUMS'),
  requiredTypes = new Set(),
  expectedAppId = '',
  expectedProductName = '',
  expectedVersion = ''
}) {
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  if (manifest.schemaVersion !== 1) {
    throw new Error('release-manifest.json schemaVersion must be 1.');
  }
  if (expectedProductName && manifest.productName !== expectedProductName) {
    throw new Error(`release-manifest.json productName must be ${expectedProductName}.`);
  }
  if (expectedAppId && manifest.appId !== expectedAppId) {
    throw new Error(`release-manifest.json appId must be ${expectedAppId}.`);
  }
  if (expectedVersion && manifest.version !== expectedVersion) {
    throw new Error(`release-manifest.json version must be ${expectedVersion}.`);
  }
  if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
    throw new Error('release-manifest.json must contain at least one artifact.');
  }
  await validateNoUnsupportedDistributables(releaseDir);
  const artifactVersion = expectedVersion || manifest.version || '';
  const seenTypes = new Set();
  const manifestArtifacts = new Map();
  for (const artifact of manifest.artifacts) {
    if (!artifact.file || !artifact.type || !artifact.sha256 || !Number.isFinite(Number(artifact.sizeBytes))) {
      throw new Error(`Release artifact metadata is incomplete: ${JSON.stringify(artifact)}`);
    }
    if (artifact.file !== path.basename(artifact.file) || /[\\/]/.test(artifact.file)) {
      throw new Error(`Release artifact must be a top-level distributable file, not a packaged internal path: ${artifact.file}`);
    }
    if (manifestArtifacts.has(artifact.file)) {
      throw new Error(`release-manifest.json contains duplicate artifact metadata for ${artifact.file}.`);
    }
    const artifactPath = path.join(releaseDir, artifact.file);
    const stat = await fs.stat(artifactPath);
    if (stat.size !== artifact.sizeBytes) {
      throw new Error(`${artifact.file} size does not match release-manifest.json.`);
    }
    const actualHash = await sha256File(artifactPath);
    if (actualHash !== artifact.sha256) {
      throw new Error(`${artifact.file} SHA-256 does not match release-manifest.json.`);
    }
    const artifactType = String(artifact.type).toLowerCase();
    validateArtifactPlatformAndName(artifact, artifactType, artifactVersion);
    if (artifactType === 'deb') {
      await validateLinuxDebProtocol(artifactPath);
    } else if (artifactType === 'appimage') {
      await validateLinuxAppImageProtocol(artifactPath);
    } else if (artifactType === 'zip') {
      await validateMacZipProtocolIfPresent(artifactPath);
    }
    manifestArtifacts.set(artifact.file, {
      sha256: artifact.sha256,
      type: artifactType
    });
    seenTypes.add(artifactType);
  }
  await validateManifestCoversReleaseArtifacts(releaseDir, manifestArtifacts);
  await validateChecksumsFile(checksumFile, manifestArtifacts);
  for (const type of requiredTypes) {
    if (!seenTypes.has(String(type).toLowerCase())) {
      throw new Error(`Missing required release artifact type: ${type}.`);
    }
  }
}

async function validateManifestCoversReleaseArtifacts(releaseDir, manifestArtifacts) {
  const artifactFiles = new Set((await findArtifacts(releaseDir))
    .map((filePath) => path.relative(releaseDir, filePath).replaceAll(path.sep, '/')));
  for (const file of artifactFiles) {
    if (!manifestArtifacts.has(file)) {
      throw new Error(`Top-level release artifact is missing from release-manifest.json: ${file}`);
    }
  }
  for (const file of manifestArtifacts.keys()) {
    if (!artifactFiles.has(file)) {
      throw new Error(`release-manifest.json lists an artifact that was not discovered as a top-level release artifact: ${file}`);
    }
  }
}

async function validateNoUnsupportedDistributables(releaseDir) {
  const entries = await fs.readdir(releaseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (UNSUPPORTED_DISTRIBUTABLE_EXTENSIONS.has(extension)) {
      throw new Error(`${entry.name} is not a configured PostMeter release artifact type. Update package metadata, docs, and validators before publishing ${extension} artifacts.`);
    }
  }
}

async function validateChecksumsFile(checksumFile, manifestArtifacts) {
  const content = await fs.readFile(checksumFile, 'utf8');
  const checksumEntries = new Map();
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/);
    if (!match) {
      throw new Error(`SHA256SUMS line ${index + 1} must use "<sha256>  <top-level artifact>" format.`);
    }
    const [, sha256, file] = match;
    if (file !== path.basename(file) || /[\\/]/.test(file)) {
      throw new Error(`SHA256SUMS must only list top-level release artifacts, got ${file}.`);
    }
    if (checksumEntries.has(file)) {
      throw new Error(`SHA256SUMS contains duplicate artifact checksum for ${file}.`);
    }
    checksumEntries.set(file, sha256);
  }
  for (const [file, artifact] of manifestArtifacts.entries()) {
    if (!checksumEntries.has(file)) {
      throw new Error(`SHA256SUMS is missing release artifact ${file}.`);
    }
    if (checksumEntries.get(file) !== artifact.sha256) {
      throw new Error(`SHA256SUMS hash for ${file} does not match release-manifest.json.`);
    }
  }
  for (const file of checksumEntries.keys()) {
    if (!manifestArtifacts.has(file)) {
      throw new Error(`SHA256SUMS lists an artifact that is missing from release-manifest.json: ${file}`);
    }
  }
}

function validateArtifactPlatformAndName(artifact, artifactType, expectedVersion = '') {
  const platform = String(artifact.platform || '').toLowerCase();
  const file = path.basename(artifact.file);
  const version = expectedVersion ? escapeRegExp(expectedVersion) : '\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9._-]+)?';
  const expectations = {
    appimage: {
      platform: 'linux',
      pattern: new RegExp(`^PostMeter-${version}(?:-[A-Za-z0-9._-]+)?\\.AppImage$`)
    },
    deb: {
      platform: 'linux',
      pattern: new RegExp(`^postmeter_${version}_[A-Za-z0-9.+~-]+\\.deb$`)
    },
    dmg: {
      platform: 'macos',
      pattern: new RegExp(`^PostMeter-${version}(?:-[A-Za-z0-9._-]+)?\\.dmg$`)
    },
    zip: {
      platform: 'macos',
      pattern: new RegExp(`^PostMeter-${version}(?:-[A-Za-z0-9._-]+)?\\.zip$`)
    },
    exe: {
      platform: 'windows',
      pattern: new RegExp(`^PostMeter(?: Setup)?[ -]${version}(?:-[A-Za-z0-9._-]+)?\\.exe$`)
    },
  };
  const expectation = expectations[artifactType];
  if (!expectation) {
    return;
  }
  if (platform !== expectation.platform) {
    throw new Error(`${artifact.file} platform must be ${expectation.platform}, got ${artifact.platform}.`);
  }
  if (!expectation.pattern.test(file)) {
    throw new Error(`${artifact.file} does not match the expected ${artifactType} release artifact name pattern.`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function validateLinuxAppImageProtocol(appImagePath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-appimage-protocol-'));
  try {
    await ensureExecutableFile(appImagePath);
    await runCommand(appImagePath, ['--appimage-extract', '*.desktop'], { cwd: tempDir });
    const desktopRoot = path.join(tempDir, 'squashfs-root');
    const desktopFiles = await findFiles(desktopRoot, (filePath) => filePath.endsWith('.desktop'));
    if (!desktopFiles.length) {
      throw new Error(`${path.basename(appImagePath)} does not contain a Linux desktop entry.`);
    }
    if (!await desktopFilesRegisterProtocol(desktopFiles)) {
      throw new Error(`${path.basename(appImagePath)} does not register x-scheme-handler/postmeter.`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function ensureExecutableFile(filePath) {
  const stat = await fs.stat(filePath);
  if ((stat.mode & 0o111) !== 0) {
    return;
  }
  await fs.chmod(filePath, stat.mode | 0o111);
}

async function validateLinuxDebProtocol(debPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-deb-protocol-'));
  try {
    await runCommand('dpkg-deb', ['-x', debPath, tempDir]);
    const desktopFiles = await findFiles(tempDir, (filePath) => filePath.endsWith('.desktop'));
    if (!desktopFiles.length) {
      throw new Error(`${path.basename(debPath)} does not contain a Linux desktop entry.`);
    }
    if (!await desktopFilesRegisterProtocol(desktopFiles)) {
      throw new Error(`${path.basename(debPath)} does not register x-scheme-handler/postmeter.`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function validateMacZipProtocolIfPresent(zipPath) {
  const listing = await runCommand('unzip', ['-Z1', zipPath]);
  const infoPlistPath = macInfoPlistPathFromListing(listing);
  if (!infoPlistPath) {
    return;
  }
  await validateMacZipProtocol(zipPath, infoPlistPath);
}

async function validateMacZipProtocol(zipPath, infoPlistPath) {
  const plistPath = infoPlistPath || await macInfoPlistPath(zipPath);
  const plist = await runCommand('unzip', ['-p', zipPath, plistPath]);
  if (!plistDeclaresPostMeterProtocol(plist)) {
    throw new Error(`${path.basename(zipPath)} does not register the postmeter URL scheme in ${plistPath}.`);
  }
}

async function macInfoPlistPath(zipPath) {
  const listing = await runCommand('unzip', ['-Z1', zipPath]);
  const infoPlistPath = macInfoPlistPathFromListing(listing);
  if (!infoPlistPath) {
    throw new Error(`${path.basename(zipPath)} does not contain a macOS .app Info.plist.`);
  }
  return infoPlistPath;
}

function macInfoPlistPathFromListing(listing) {
  const plistPaths = String(listing || '').split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => /\.app\/Contents\/Info\.plist$/.test(entry));
  return plistPaths.find((entry) => /(^|\/)PostMeter\.app\/Contents\/Info\.plist$/.test(entry))
    || plistPaths.sort((left, right) => pathDepth(left) - pathDepth(right))[0]
    || '';
}

function pathDepth(filePath) {
  return String(filePath || '').split('/').filter(Boolean).length;
}

function plistDeclaresPostMeterProtocol(plist) {
  const protocolSection = String(plist || '').match(/<key>CFBundleURLTypes<\/key>[\s\S]*?<\/array>/);
  return Boolean(protocolSection && /<key>CFBundleURLSchemes<\/key>[\s\S]*?<string>postmeter<\/string>/.test(protocolSection[0]));
}

async function findFiles(dir, predicate) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findFiles(entryPath, predicate));
    } else if (predicate(entryPath)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function desktopFilesRegisterProtocol(desktopFiles) {
  for (const desktopFile of desktopFiles) {
    const content = await fs.readFile(desktopFile, 'utf8');
    const mimeTypeLine = content.split(/\r?\n/)
      .find((line) => line.startsWith('MimeType='));
    const mimeTypes = String(mimeTypeLine || '')
      .slice('MimeType='.length)
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean);
    if (mimeTypes.includes('x-scheme-handler/postmeter')) {
      return true;
    }
  }
  return false;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function csvSet(value) {
  return new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  validateLinuxAppImageProtocol,
  ensureExecutableFile,
  requireBuildTargets,
  validatePackageMetadata,
  validateLinuxDebProtocol,
  validateMacZipProtocol,
  macInfoPlistPathFromListing,
  validateReleaseManifest
};
