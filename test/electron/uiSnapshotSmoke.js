const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');

const EXPECTED_SNAPSHOTS = [
  'request',
  'context-menu',
  'cookies',
  'auth-oauth',
  'response',
  'runner',
  'load',
  'export-menu'
];

async function main() {
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-snapshot-'));
  const snapshotDir = path.join(tempDir, 'snapshots');
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_SNAPSHOT_SMOKE: '1',
    POSTMETER_UI_SNAPSHOT_DIR: snapshotDir
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath, withCiNoSandboxArgs(['.'], env), {
    cwd: path.join(__dirname, '..', '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
  }, 25_000);

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve(signal ? 128 : code ?? 1);
    });
  });

  if (exitCode !== 0) {
    console.error(output.trim());
    throw new Error(`Electron UI snapshot smoke failed with exit code ${exitCode}.`);
  }

  for (const label of EXPECTED_SNAPSHOTS) {
    const screenshot = await fs.readFile(path.join(snapshotDir, `${label}.png`));
    assertPngScreenshot(label, screenshot);
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
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
