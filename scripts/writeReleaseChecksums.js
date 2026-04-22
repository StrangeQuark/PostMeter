const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const RELEASE_DIR = process.env.POSTMETER_RELEASE_DIR
  ? path.resolve(process.env.POSTMETER_RELEASE_DIR)
  : path.join(__dirname, '..', 'release');
const CHECKSUM_FILE = path.join(RELEASE_DIR, 'SHA256SUMS');
const ARTIFACT_EXTENSIONS = new Set(['.AppImage', '.deb', '.rpm', '.zip', '.dmg', '.exe', '.msi']);

async function main() {
  const artifacts = await findArtifacts(RELEASE_DIR);
  if (!artifacts.length) {
    throw new Error('No release artifacts found. Run a dist build before writing checksums.');
  }
  const rows = [];
  for (const artifact of artifacts.sort()) {
    const hash = await sha256File(artifact);
    rows.push(`${hash}  ${path.relative(RELEASE_DIR, artifact).replaceAll(path.sep, '/')}`);
  }
  await fs.writeFile(CHECKSUM_FILE, `${rows.join('\n')}\n`);
  console.log(`Wrote ${CHECKSUM_FILE}`);
}

async function findArtifacts(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  const artifacts = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      artifacts.push(...await findArtifacts(entryPath));
    } else if (ARTIFACT_EXTENSIONS.has(path.extname(entry.name))) {
      artifacts.push(entryPath);
    }
  }
  return artifacts;
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const file = await fs.open(filePath, 'r');
  try {
    for await (const chunk of file.createReadStream()) {
      hash.update(chunk);
    }
  } finally {
    await file.close();
  }
  return hash.digest('hex');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  findArtifacts,
  sha256File
};
