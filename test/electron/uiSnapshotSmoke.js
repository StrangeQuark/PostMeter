const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('../../scripts/smokeProcess');
const { UI_SNAPSHOT_LABELS: EXPECTED_SNAPSHOTS } = require('../../src/renderer/smoke/uiSnapshotManifest');

async function main() {
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-snapshot-'));
  const snapshotDir = path.join(tempDir, 'snapshots');
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_SNAPSHOT_SMOKE: '1',
    POSTMETER_UI_SNAPSHOT_DIR: snapshotDir,
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = await spawnWithTimeout(electronPath, withCiNoSandboxArgs(['.'], env), {
    cwd: path.join(__dirname, '..', '..'),
    env,
    timeoutMillis: 25_000,
    timeoutMessage: 'Electron UI snapshot smoke timed out after 25000 ms.'
  });

  if (result.code !== 0) {
    console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir, snapshotDir]).trim());
    throw new Error(`Electron UI snapshot smoke failed with exit code ${result.code}.`);
  }

  const hashes = new Set();
  for (const label of EXPECTED_SNAPSHOTS) {
    const screenshot = await fs.readFile(path.join(snapshotDir, `${label}.png`));
    assertPngScreenshot(label, screenshot);
    hashes.add(crypto.createHash('sha256').update(screenshot).digest('hex'));
  }
  if (hashes.size < Math.ceil(EXPECTED_SNAPSHOTS.length * 0.75)) {
    throw new Error(`UI snapshot smoke captured too many duplicate states: ${hashes.size}/${EXPECTED_SNAPSHOTS.length} unique screenshots.`);
  }
}

function assertPngScreenshot(label, screenshot) {
  if (screenshot.readUInt32BE(0) !== 0x89504e47 || screenshot.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${label} snapshot is not a PNG.`);
  }
  const width = screenshot.readUInt32BE(16);
  const height = screenshot.readUInt32BE(20);
  if (width < 800 || height < 600) {
    throw new Error(`${label} snapshot is too small: ${width}x${height}.`);
  }
  if (screenshot.length < 10_000) {
    throw new Error(`${label} snapshot is unexpectedly small.`);
  }
}

main().catch((error) => {
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
