#!/usr/bin/env node

const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { withCiNoSandboxArgs } = require('./electronCiSandboxWaiver');
const { redactSmokeOutputText, spawnWithTimeout } = require('./smokeProcess');
const {
  findPackagedExecutable,
  isAppImageExecutable,
  validateExecutable
} = require('./validatePackagedAppSmoke');

const TIMEOUT_MILLIS = Number.parseInt(process.env.POSTMETER_PACKAGED_WORKFLOW_TIMEOUT_MS || '', 10) || 180_000;

async function main() {
  const executable = await findPackagedExecutable();
  await validateExecutable(executable);
  const server = await createFixtureServer();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-workflow-'));
  const artifactDir = process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts');
  try {
    const env = {
      ...process.env,
      POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
      POSTMETER_PACKAGED_SMOKE: '1',
      POSTMETER_PACKAGED_UI_SMOKE: '1',
      POSTMETER_UI_WORKFLOW_SMOKE: '1',
      POSTMETER_UI_WORKFLOW_BASE_URL: server.baseUrl,
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
      timeoutMessage: `Packaged UI workflow smoke timed out after ${TIMEOUT_MILLIS} ms.`
    });
    await writeWorkflowLog(artifactDir, result, executable, server.baseUrl);
    if (result.code !== 0) {
      console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir, executable, server.baseUrl]).trim());
      throw new Error(`Packaged UI workflow smoke failed with exit code ${result.code}.`);
    }
    console.log('Packaged UI workflow smoke passed.');
  } finally {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
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
      response.setHeader('ETag', '"packaged-workflow-diagnosis"');
      response.setHeader('Server-Timing', 'app;dur=3');
      response.setHeader('X-Request-ID', 'packaged-workflow-diagnosis-request');
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

async function writeWorkflowLog(artifactDir, result, executable, baseUrl) {
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
  await fs.writeFile(path.join(artifactDir, `packaged-workflow-smoke-${process.platform}.log`), body);
}

main().catch((error) => {
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
