#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('./electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('./smokeProcess');
const {
  findPackagedExecutable,
  isAppImageExecutable,
  validateExecutable
} = require('./validatePackagedAppSmoke');
const { createAuthMatrixServer } = require('./uiAuthMatrixFixture');

const TIMEOUT_MILLIS = Number.parseInt(process.env.POSTMETER_PACKAGED_AUTH_TIMEOUT_MS || '', 10) || 180_000;

async function main() {
  const executable = await findPackagedExecutable();
  await validateExecutable(executable);
  const server = await createAuthMatrixServer();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-auth-'));
  const artifactDir = process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts');
  try {
    const env = {
      ...process.env,
      POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
      POSTMETER_UI_AUTH_MATRIX_BASE_URL: server.baseUrl,
      POSTMETER_UI_AUTH_MATRIX_SMOKE: '1',
      POSTMETER_VALIDATION_ARTIFACT_DIR: artifactDir
    };
    if (isAppImageExecutable(executable)) {
      env.APPIMAGE_EXTRACT_AND_RUN = env.APPIMAGE_EXTRACT_AND_RUN || '1';
    }
    delete env.ELECTRON_RUN_AS_NODE;
    await fs.mkdir(artifactDir, { recursive: true });
    const result = await spawnWithTimeout(executable, withCiNoSandboxArgs(['--disable-gpu'], env), {
      env,
      killProcessTree: true,
      timeoutMillis: TIMEOUT_MILLIS,
      timeoutMessage: `Packaged UI auth matrix smoke timed out after ${TIMEOUT_MILLIS} ms.`
    });
    await writeAuthSmokeLog(artifactDir, result, executable, server.baseUrl);
    if (result.code !== 0) {
      console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir, executable, server.baseUrl]).trim());
      throw new Error(`Packaged UI auth matrix smoke failed with exit code ${result.code}.`);
    }
    console.log('Packaged UI auth matrix smoke passed.');
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function writeAuthSmokeLog(artifactDir, result, executable, baseUrl) {
  const body = [
    `platform=${process.platform}`,
    `executable=${path.basename(String(executable || '')) || '[unknown]'}`,
    `exitCode=${result.code}`,
    `signal=${result.signal || ''}`,
    `timedOut=${result.timedOut === true ? 'true' : 'false'}`,
    '',
    '[stdout]',
    redactSmokeOutputText(result.stdout || '', [executable, baseUrl]),
    '',
    '[stderr]',
    redactSmokeOutputText(result.stderr || '', [executable, baseUrl])
  ].join('\n');
  await fs.writeFile(path.join(artifactDir, `packaged-auth-smoke-${process.platform}.log`), body);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
    process.exitCode = 1;
  });
}

module.exports = {
  writeAuthSmokeLog
};
