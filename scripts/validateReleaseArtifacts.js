const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { sha256File } = require('./writeReleaseChecksums');

const RELEASE_DIR = process.env.POSTMETER_RELEASE_DIR
  ? path.resolve(process.env.POSTMETER_RELEASE_DIR)
  : path.join(__dirname, '..', 'release');
const PACKAGE_JSON = process.env.POSTMETER_PACKAGE_JSON
  ? path.resolve(process.env.POSTMETER_PACKAGE_JSON)
  : path.join(__dirname, '..', 'package.json');
const MANIFEST_FILE = process.env.POSTMETER_RELEASE_MANIFEST
  ? path.resolve(process.env.POSTMETER_RELEASE_MANIFEST)
  : path.join(RELEASE_DIR, 'release-manifest.json');

async function main() {
  await validatePackageMetadata(PACKAGE_JSON);
  await validateReleaseManifest({
    releaseDir: RELEASE_DIR,
    manifestFile: MANIFEST_FILE,
    requiredTypes: csvSet(process.env.POSTMETER_RELEASE_REQUIRED_TYPES)
  });
  console.log(`Validated release artifacts in ${RELEASE_DIR}`);
}

async function validatePackageMetadata(packageJsonPath) {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  if (packageJson.build?.appId !== 'com.strangequark.postmeter') {
    throw new Error('package.json build.appId must be com.strangequark.postmeter.');
  }
  if (packageJson.build?.productName !== 'PostMeter') {
    throw new Error('package.json build.productName must be PostMeter.');
  }
  if (!packageJson.build?.protocols?.some((protocol) => (protocol.schemes || []).includes('postmeter'))) {
    throw new Error('package.json must declare the postmeter:// custom protocol.');
  }
}

async function validateReleaseManifest({ releaseDir, manifestFile, requiredTypes = new Set() }) {
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  if (manifest.schemaVersion !== 1) {
    throw new Error('release-manifest.json schemaVersion must be 1.');
  }
  if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
    throw new Error('release-manifest.json must contain at least one artifact.');
  }
  const seenTypes = new Set();
  for (const artifact of manifest.artifacts) {
    if (!artifact.file || !artifact.type || !artifact.sha256 || !Number.isFinite(Number(artifact.sizeBytes))) {
      throw new Error(`Release artifact metadata is incomplete: ${JSON.stringify(artifact)}`);
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
    if (artifactType === 'deb') {
      await validateLinuxDebProtocol(artifactPath);
    } else if (artifactType === 'appimage') {
      await validateLinuxAppImageProtocol(artifactPath);
    } else if (artifactType === 'zip') {
      await validateMacZipProtocolIfPresent(artifactPath);
    }
    seenTypes.add(artifact.type);
  }
  for (const type of requiredTypes) {
    if (!seenTypes.has(type)) {
      throw new Error(`Missing required release artifact type: ${type}.`);
    }
  }
}

async function validateLinuxAppImageProtocol(appImagePath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-appimage-protocol-'));
  try {
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
  const infoPlistPath = listing.split(/\r?\n/)
    .find((entry) => /\.app\/Contents\/Info\.plist$/.test(entry));
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
  const infoPlistPath = listing.split(/\r?\n/)
    .find((entry) => /\.app\/Contents\/Info\.plist$/.test(entry));
  if (!infoPlistPath) {
    throw new Error(`${path.basename(zipPath)} does not contain a macOS .app Info.plist.`);
  }
  return infoPlistPath;
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
  validatePackageMetadata,
  validateLinuxDebProtocol,
  validateMacZipProtocol,
  validateReleaseManifest
};
