const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('../../scripts/smokeProcess');

async function main() {
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-regression-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_REGRESSION_SMOKE: '1',
    POSTMETER_UI_CONSTRAINED_WINDOW: '1',
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = await spawnWithTimeout(electronPath, withCiNoSandboxArgs(['--force-high-contrast', '.'], env), {
    cwd: path.join(__dirname, '..', '..'),
    env,
    timeoutMillis: 20_000,
    timeoutMessage: 'Electron UI regression smoke timed out after 20000 ms.'
  });

  if (result.code !== 0) {
    console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir]).trim());
    throw new Error(`Electron UI regression smoke failed with exit code ${result.code}.`);
  }
}

main().catch((error) => {
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
