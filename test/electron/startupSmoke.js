const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('../../scripts/smokeProcess');

async function main() {
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-smoke-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_STARTUP_SMOKE: '1',
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = await spawnWithTimeout(electronPath, withCiNoSandboxArgs(['.'], env), {
    cwd: path.join(__dirname, '..', '..'),
    env,
    timeoutMillis: 10_000,
    timeoutMessage: 'Electron startup smoke timed out after 10000 ms.'
  });

  if (result.code !== 0) {
    console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir]).trim());
    throw new Error(`Electron startup smoke failed with exit code ${result.code}.`);
  }
}

main().catch((error) => {
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
