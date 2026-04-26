const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const server = await createMockOAuthServer();
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-oauth-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_OAUTH_SMOKE: '1',
    POSTMETER_UI_OAUTH_BASE_URL: server.baseUrl,
    POSTMETER_TEST_OAUTH_AUTOCOMPLETE: '1',
    POSTMETER_TEST_OAUTH_SKIP_EXTERNAL: '1'
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath, ['.'], {
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
  await server.close();

  if (exitCode !== 0) {
    console.error(output.trim());
    throw new Error(`Electron UI OAuth smoke failed with exit code ${exitCode}.`);
  }
}

async function createMockOAuthServer() {
  let baseUrl = '';
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, baseUrl || 'http://127.0.0.1');
    if (url.pathname === '/authorize') {
      const mode = url.searchParams.get('mode');
      const redirect = new URL(url.searchParams.get('redirect_uri'));
      redirect.searchParams.set('code', mode === 'token-error' ? 'token-error-code' : 'pkce-e2e-code');
      redirect.searchParams.set('state', mode === 'bad-state' ? 'wrong-state' : url.searchParams.get('state'));
      response.statusCode = 302;
      response.setHeader('Location', redirect.toString());
      response.end();
      return;
    }
    if (url.pathname === '/device') {
      const mode = url.searchParams.get('mode');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        device_code: mode ? `device-${mode}` : 'device-e2e-code',
        user_code: 'E2E-CODE',
        verification_uri: `${baseUrl}/verify`,
        verification_uri_complete: `${baseUrl}/verify?user_code=E2E-CODE`,
        expires_in: mode === 'timeout' ? 0.001 : 120,
        interval: mode === 'timeout' ? 0.001 : 1
      }));
      return;
    }
    if (url.pathname === '/token') {
      const body = new URLSearchParams(await readRequestBody(request));
      response.setHeader('Content-Type', 'application/json');
      if (body.get('grant_type') === 'authorization_code') {
        if (body.get('code') === 'token-error-code') {
          response.statusCode = 400;
          response.end(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'invalid_grant: test authorization code was rejected'
          }));
          return;
        }
        response.end(JSON.stringify({
          access_token: 'pkce-e2e-token',
          refresh_token: 'pkce-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600
        }));
        return;
      }
      if (body.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
        if (body.get('device_code') === 'device-denied') {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'access_denied' }));
          return;
        }
        if (body.get('device_code') === 'device-timeout' || body.get('device_code') === 'device-pending') {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'authorization_pending' }));
          return;
        }
        response.end(JSON.stringify({
          access_token: 'device-e2e-token',
          token_type: 'Bearer',
          expires_in: 3600
        }));
        return;
      }
      response.statusCode = 400;
      response.end(JSON.stringify({ error: 'unsupported_grant_type' }));
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
