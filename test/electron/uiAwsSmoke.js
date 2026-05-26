const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { redactSmokeOutputText } = require('../../scripts/smokeProcess');
const { runSourceElectronSmoke } = require('./electronSmokeRunner');

const AWS_CREDENTIALS = {
  accessKey: 'UIAKIDEXAMPLE',
  secretKey: 'ui-aws-secret',
  region: 'us-east-1',
  service: 'execute-api',
  sessionToken: 'ui-session-token'
};

async function main() {
  const server = await createMockAwsServer();
  const electronPath = require('electron');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-ui-aws-'));
  const env = {
    ...process.env,
    POSTMETER_DATA_PATH: path.join(tempDir, 'workspace.json'),
    POSTMETER_UI_AWS_SMOKE: '1',
    POSTMETER_UI_AWS_BASE_URL: server.baseUrl,
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || path.join(tempDir, 'validation-artifacts')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let result;
  try {
    result = await runSourceElectronSmoke(electronPath, ['.'], {
      env,
      timeoutMillis: 20_000,
      timeoutMessage: 'Electron UI AWS smoke timed out after 20000 ms.'
    });
  } finally {
    await server.close();
  }

  if (result.code !== 0) {
    console.error(redactSmokeOutputText(`${result.stdout}${result.stderr}`, [tempDir, server.baseUrl]).trim());
    throw new Error(`Electron UI AWS smoke failed with exit code ${result.code}.`);
  }
}

async function createMockAwsServer() {
  let baseUrl = '';
  const server = http.createServer(async (request, response) => {
    const bodyText = await readRequestBody(request);
    const url = new URL(request.url, baseUrl || 'http://127.0.0.1');
    if (url.pathname === '/aws-header' || url.pathname === '/aws-query') {
      const verification = verifyAwsRequest({
        ...AWS_CREDENTIALS,
        body: bodyText,
        headers: request.headers,
        method: request.method,
        placement: url.pathname === '/aws-query' ? 'query' : 'header',
        url: `${baseUrl}${request.url}`
      });
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

function verifyAwsRequest(options) {
  const url = new URL(options.url);
  const fields = options.placement === 'query'
    ? awsQuerySignatureFields(url)
    : awsHeaderSignatureFields(options.headers.authorization || '');
  if (options.placement === 'header') {
    fields.amzDate = awsHeaderValue(options.headers, 'x-amz-date');
    fields.sessionToken = awsHeaderValue(options.headers, 'x-amz-security-token');
  }
  if (fields.algorithm !== 'AWS4-HMAC-SHA256') {
    return { fields, reason: 'algorithm mismatch', verified: false };
  }
  if (fields.accessKey !== options.accessKey || fields.region !== options.region || fields.service !== options.service) {
    return { fields, reason: 'credential mismatch', verified: false };
  }
  if (fields.terminal !== 'aws4_request') {
    return { fields, reason: 'credential scope mismatch', verified: false };
  }
  if (fields.sessionToken !== options.sessionToken) {
    return { fields, reason: 'session token mismatch', verified: false };
  }
  if (options.placement === 'query' && options.headers.authorization) {
    return { fields, reason: 'query signing should not send Authorization header', verified: false };
  }
  const canonicalRequest = [
    String(options.method || 'GET').toUpperCase(),
    awsCanonicalUri(url),
    awsCanonicalQuery(url, { excludeSignature: options.placement === 'query' }),
    awsCanonicalHeaders(options.headers, fields.signedHeaders),
    fields.signedHeaders,
    sha256Hex(options.body || '')
  ].join('\n');
  const stringToSign = [
    fields.algorithm,
    fields.amzDate,
    fields.credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const expectedSignature = crypto
    .createHmac('sha256', awsSigningKey(options.secretKey, fields.shortDate, options.region, options.service))
    .update(stringToSign, 'utf8')
    .digest('hex');
  return {
    fields,
    reason: fields.signature === expectedSignature ? '' : 'signature mismatch',
    verified: fields.signature === expectedSignature
  };
}

function awsHeaderSignatureFields(header) {
  const value = String(header || '');
  const fields = { authorization: value };
  const algorithmMatch = value.match(/^([A-Za-z0-9-]+)\s+/);
  fields.algorithm = algorithmMatch?.[1] || '';
  const params = {};
  for (const part of value.replace(/^[A-Za-z0-9-]+\s+/, '').split(',')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) {
      params[key] = rest.join('=');
    }
  }
  fields.signature = params.Signature || '';
  fields.signedHeaders = params.SignedHeaders || '';
  applyAwsCredentialFields(fields, params.Credential || '');
  return fields;
}

function awsQuerySignatureFields(url) {
  const fields = {
    algorithm: url.searchParams.get('X-Amz-Algorithm') || '',
    amzDate: url.searchParams.get('X-Amz-Date') || '',
    authorization: '',
    expires: url.searchParams.get('X-Amz-Expires') || '',
    sessionToken: url.searchParams.get('X-Amz-Security-Token') || '',
    signature: url.searchParams.get('X-Amz-Signature') || '',
    signedHeaders: url.searchParams.get('X-Amz-SignedHeaders') || ''
  };
  applyAwsCredentialFields(fields, url.searchParams.get('X-Amz-Credential') || '');
  return fields;
}

function applyAwsCredentialFields(fields, credential) {
  const parts = String(credential || '').split('/');
  fields.accessKey = parts[0] || '';
  fields.shortDate = parts[1] || '';
  fields.region = parts[2] || '';
  fields.service = parts[3] || '';
  fields.terminal = parts[4] || '';
  fields.credentialScope = parts.slice(1).join('/');
}

function awsCanonicalUri(url) {
  const pathValue = url.pathname || '/';
  return pathValue
    .split('/')
    .map((part) => encodeRfc3986(decodeURIComponentSafe(part)))
    .join('/') || '/';
}

function awsCanonicalQuery(url, options = {}) {
  return [...url.searchParams.entries()]
    .filter(([key]) => !(options.excludeSignature && key === 'X-Amz-Signature'))
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function awsCanonicalHeaders(headers, signedHeaders) {
  return String(signedHeaders || '')
    .split(';')
    .filter(Boolean)
    .map((name) => `${name}:${String(awsHeaderValue(headers, name) || '').trim().replace(/\s+/g, ' ')}`)
    .join('\n') + '\n';
}

function awsHeaderValue(headers, name) {
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === String(name).toLowerCase());
  return key ? headers[key] : '';
}

function awsSigningKey(secretKey, shortDate, region, service) {
  const dateKey = crypto.createHmac('sha256', `AWS4${secretKey}`).update(shortDate, 'utf8').digest();
  const dateRegionKey = crypto.createHmac('sha256', dateKey).update(region, 'utf8').digest();
  const dateRegionServiceKey = crypto.createHmac('sha256', dateRegionKey).update(service, 'utf8').digest();
  return crypto.createHmac('sha256', dateRegionServiceKey).update('aws4_request', 'utf8').digest();
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value == null ? '' : value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

main().catch((error) => {
  console.error(redactSmokeOutputText(error.stack || error.message || String(error)));
  process.exitCode = 1;
});
