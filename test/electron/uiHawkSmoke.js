const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { redactSmokeOutputText } = require('../../scripts/smokeProcess');
const { runSourceElectronSmoke } = require('./electronSmokeRunner');

async function main() {
  const server = await createMockHawkServer();
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-hawk-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_HAWK_SMOKE: '1',
    POSTMETER_UI_HAWK_BASE_URL: server.baseUrl,
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let result;
  try {
    result = await runSourceElectronSmoke(electronPath, ['.'], {
      env,
      timeoutMillis: 20_000,
      timeoutMessage: 'Electron UI Hawk smoke timed out after 20000 ms.'
    });
  } finally {
    await server.close();
  }

  if (result.code !== 0) {
    console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir, server.baseUrl]).trim());
    throw new Error(`Electron UI Hawk smoke failed with exit code ${result.code}.`);
  }
}

async function createMockHawkServer() {
  let baseUrl = '';
  const server = http.createServer(async (request, response) => {
    const bodyText = await readRequestBody(request);
    const url = new URL(request.url, baseUrl || 'http://127.0.0.1');
    if (url.pathname === '/hawk' || url.pathname === '/hawk-sha1') {
      const sha1 = url.pathname === '/hawk-sha1';
      const verification = verifyHawkRequest({
        algorithm: sha1 ? 'sha1' : 'sha256',
        authKey: sha1 ? 'ui-hawk-sha1-secret' : 'ui-hawk-secret',
        body: bodyText,
        contentType: request.headers['content-type'],
        expectedApp: sha1 ? '' : 'ui-app',
        expectedDelegation: sha1 ? '' : 'ui-dlg',
        expectedExt: sha1 ? '' : 'ui-ext',
        expectedId: sha1 ? 'ui-hawk-sha1-id' : 'ui-hawk-id',
        expectedNonce: sha1 ? 'ui-sha1-nonce' : 'ui-nonce',
        expectedTs: sha1 ? '1777291300' : '1777291200',
        includePayloadHash: !sha1,
        method: request.method,
        url: `${baseUrl}${request.url}`
      }, request.headers.authorization || '');
      response.statusCode = verification.verified ? 200 : 401;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        body: bodyText,
        fields: verification.fields,
        reason: verification.reason,
        verified: verification.verified
      }));
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

function verifyHawkRequest(expected, header) {
  const fields = parseHawkAuthorization(header);
  const required = [
    ['id', expected.expectedId],
    ['ts', expected.expectedTs],
    ['nonce', expected.expectedNonce]
  ];
  for (const [key, value] of required) {
    if (fields[key] !== value) {
      return { fields, reason: `${key} mismatch`, verified: false };
    }
  }
  if ((fields.ext || '') !== expected.expectedExt) {
    return { fields, reason: 'ext mismatch', verified: false };
  }
  if ((fields.app || '') !== expected.expectedApp) {
    return { fields, reason: 'app mismatch', verified: false };
  }
  if ((fields.dlg || '') !== expected.expectedDelegation) {
    return { fields, reason: 'dlg mismatch', verified: false };
  }
  const payloadHash = expected.includePayloadHash
    ? hawkPayloadHash(expected.algorithm, expected.body, expected.contentType)
    : '';
  if (expected.includePayloadHash && fields.hash !== payloadHash) {
    return { fields, reason: 'payload hash mismatch', verified: false };
  }
  if (!expected.includePayloadHash && Object.prototype.hasOwnProperty.call(fields, 'hash')) {
    return { fields, reason: 'unexpected payload hash', verified: false };
  }
  const parsedUrl = new URL(expected.url);
  const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
  const normalized = [
    'hawk.1.header',
    fields.ts,
    fields.nonce,
    String(expected.method || 'GET').toUpperCase(),
    `${parsedUrl.pathname}${parsedUrl.search}`,
    parsedUrl.hostname.toLowerCase(),
    port,
    payloadHash,
    fields.ext || '',
    fields.app || '',
    fields.dlg || '',
    ''
  ].join('\n');
  const mac = crypto.createHmac(expected.algorithm, expected.authKey).update(normalized, 'utf8').digest('base64');
  return { fields, reason: fields.mac === mac ? '' : 'mac mismatch', verified: fields.mac === mac };
}

function parseHawkAuthorization(header) {
  const value = String(header || '').replace(/^Hawk\s+/i, '');
  const fields = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))(?:,|$)/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    fields[match[1]] = match[2] != null
      ? match[2].replace(/\\(["\\])/g, '$1')
      : String(match[3] || '').trim();
  }
  return fields;
}

function hawkPayloadHash(algorithm, body, contentType = '') {
  const hash = crypto.createHash(algorithm);
  hash.update('hawk.1.payload\n', 'utf8');
  hash.update(normalizeHawkContentType(contentType), 'utf8');
  hash.update('\n', 'utf8');
  hash.update(String(body || ''), 'utf8');
  hash.update('\n', 'utf8');
  return hash.digest('base64');
}

function normalizeHawkContentType(contentType = '') {
  return String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

main().catch((error) => {
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
