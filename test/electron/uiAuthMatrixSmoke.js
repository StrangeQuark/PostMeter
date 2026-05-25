const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('../../scripts/smokeProcess');
const { createAuthMatrixServer } = require('../../scripts/uiAuthMatrixFixture');

async function main() {
  const server = await createAuthMatrixServer();
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-auth-matrix-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_AUTH_MATRIX_BASE_URL: server.baseUrl,
    POSTMETER_UI_AUTH_MATRIX_SMOKE: '1',
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let result;
  try {
    result = await spawnWithTimeout(electronPath, withCiNoSandboxArgs(['.'], env), {
      cwd: path.join(__dirname, '..', '..'),
      env,
      timeoutMillis: 60_000,
      timeoutMessage: 'Electron UI auth matrix smoke timed out after 60000 ms.'
    });
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (result.code !== 0) {
    console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir, server.baseUrl]).trim());
    throw new Error(`Electron UI auth matrix smoke failed with exit code ${result.code}.`);
  }
}

main().catch((error) => {
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
