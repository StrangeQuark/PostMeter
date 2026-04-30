const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');

async function main() {
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-regression-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_REGRESSION_SMOKE: '1'
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
  }, 20_000);

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve(signal ? 128 : code ?? 1);
    });
  });

  if (exitCode !== 0) {
    console.error(output.trim());
    throw new Error(`Electron UI regression smoke failed with exit code ${exitCode}.`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
