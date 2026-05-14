const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('../../scripts/smokeProcess');

async function main() {
  const server = await createFixtureServer();
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-smoke-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_WORKFLOW_SMOKE: '1',
    POSTMETER_UI_WORKFLOW_BASE_URL: server.baseUrl,
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = await spawnWithTimeout(electronPath, withCiNoSandboxArgs(['.'], env), {
    cwd: path.join(__dirname, '..', '..'),
    env,
    timeoutMillis: 45_000,
    timeoutMessage: 'Electron UI workflow smoke timed out after 45000 ms.'
  });

  await server.close();
  if (result.code !== 0) {
    console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir, server.baseUrl]).trim());
    throw new Error(`Electron UI workflow smoke failed with exit code ${result.code}.`);
  }
}

async function createFixtureServer() {
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    if (String(request.url || '').startsWith('/diagnostic')) {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'max-age=30');
      response.setHeader('ETag', '"ui-diagnosis"');
      response.setHeader('Server-Timing', 'app;dur=3');
      response.setHeader('X-Request-ID', 'ui-diagnosis-request');
      response.setHeader('RateLimit-Limit', '100');
      response.setHeader('RateLimit-Remaining', '99');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Strict-Transport-Security', 'max-age=31536000');
      response.setHeader('Content-Security-Policy', "default-src 'none'");
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        response.end();
        return;
      }
      response.end(JSON.stringify({
        ok: true,
        method: request.method,
        url: request.url,
        body: Buffer.concat(chunks).toString('utf8')
      }));
      return;
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
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
