const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('../../scripts/smokeProcess');

const UI_A11Y_TIMEOUT_MILLIS = 70_000;

async function main() {
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-a11y-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_A11Y_SMOKE: '1',
    POSTMETER_UI_CONSTRAINED_WINDOW: '1',
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = await spawnWithTimeout(electronPath, withCiNoSandboxArgs(['--force-high-contrast', '.'], env), {
    cwd: path.join(__dirname, '..', '..'),
    env,
    timeoutMillis: UI_A11Y_TIMEOUT_MILLIS,
    timeoutMessage: `Electron UI accessibility smoke timed out after ${UI_A11Y_TIMEOUT_MILLIS} ms.`
  });

  if (result.code !== 0) {
    console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir]).trim());
    throw new Error(`Electron UI accessibility smoke failed with exit code ${result.code}.`);
  }
}

main().catch((error) => {
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
