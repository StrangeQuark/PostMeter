const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const server = await createFixtureServer();
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-smoke-'));
  const child = spawn(electronPath, ['.'], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
      POSTMETER_UI_WORKFLOW_SMOKE: '1',
      POSTMETER_UI_WORKFLOW_BASE_URL: server.baseUrl
    },
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
      if (signal) {
        resolve(128);
      } else {
        resolve(code ?? 1);
      }
    });
  });

  await server.close();
  if (exitCode !== 0) {
    console.error(output.trim());
    throw new Error(`Electron UI workflow smoke failed with exit code ${exitCode}.`);
  }
}

async function createFixtureServer() {
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Set-Cookie', 'uiSession=smoke; Path=/; HttpOnly; SameSite=Lax');
    response.end(JSON.stringify({
      method: request.method,
      url: request.url,
      header: request.headers['x-postmeter-ui'] || '',
      body: Buffer.concat(chunks).toString('utf8')
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
