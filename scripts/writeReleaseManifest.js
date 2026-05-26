const fs = require('node:fs/promises');
const path = require('node:path');
const { findArtifacts, sha256File } = require('./writeReleaseChecksums');

const RELEASE_DIR = process.env.POSTMETER_RELEASE_DIR
  ? path.resolve(process.env.POSTMETER_RELEASE_DIR)
  : path.join(__dirname, '..', 'release');
const PACKAGE_JSON = process.env.POSTMETER_PACKAGE_JSON
  ? path.resolve(process.env.POSTMETER_PACKAGE_JSON)
  : path.join(__dirname, '..', 'package.json');
const MANIFEST_FILE = path.join(RELEASE_DIR, 'release-manifest.json');

async function main() {
  const packageJson = JSON.parse(await fs.readFile(PACKAGE_JSON, 'utf8'));
  const artifacts = await findArtifacts(RELEASE_DIR);
  if (!artifacts.length) {
    throw new Error('No release artifacts found. Run a dist build before writing a release manifest.');
  }

  const manifest = {
    schemaVersion: 1,
    productName: packageJson.build?.productName || packageJson.name,
    appId: packageJson.build?.appId || '',
    version: packageJson.version,
    generatedAt: new Date().toISOString(),
    buildCommit: String(process.env.GITHUB_SHA || process.env.POSTMETER_BUILD_COMMIT || '').trim(),
    buildTimestamp: String(process.env.POSTMETER_BUILD_TIMESTAMP || process.env.GITHUB_RUN_STARTED_AT || '').trim() || new Date().toISOString(),
    artifacts: []
  };

  for (const artifact of artifacts.sort()) {
    const stat = await fs.stat(artifact);
    manifest.artifacts.push({
      file: path.relative(RELEASE_DIR, artifact).replaceAll(path.sep, '/'),
      sizeBytes: stat.size,
      sha256: await sha256File(artifact),
      platform: inferPlatform(artifact),
      type: inferArtifactType(artifact)
    });
  }

  await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${MANIFEST_FILE}`);
}

function inferPlatform(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name.endsWith('.appimage') || name.endsWith('.deb')) {
    return 'linux';
  }
  if (name.endsWith('.dmg')) {
    return 'macos';
  }
  if (name.endsWith('.exe')) {
    return 'windows';
  }
  if (name.endsWith('.zip')) {
    return 'macos';
  }
  return 'unknown';
}

function inferArtifactType(filePath) {
  const extension = path.extname(filePath).replace('.', '').toLowerCase();
  return extension || 'artifact';
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  inferArtifactType,
  inferPlatform,
  main
};
