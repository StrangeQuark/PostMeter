const crypto = require('node:crypto');
const http = require('node:http');

const AUTH_MATRIX_ASAP_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkKqYZbrjIkXclKK+iR83
Rtt4v9ofLIEFBmP7bYHv+XQzQzKUkDOZKmUje7m8k5aofyblmtQGjZWSOE3Glw1w
HnDQi47gk8LkGv+9/booMWiV2FhsbtCL6SvkJ7DCq1Y1YTplCaCmE3mOcbbOva/c
CNZIm3HJniGt5DUoSngC1NyCuiRPPl52wfUH2JKSmTa/08sG6NEmCyL/EHwPq5mM
t/CyRcUIlvSSWFkGrh7oqZKVWi17VZWWDPb6wkNh1xInIsaLe0W1ruYL8LaqIGQu
x7vjk15wsesZxDW9CY6VKJfTrx+ouXwuUfgpxBvXwf6gKRCe3H4l4QhGphAxE5fl
gQIDAQAB
-----END PUBLIC KEY-----`;

async function createAuthMatrixServer() {
  let baseUrl = '';
  const server = http.createServer(async (request, response) => {
    const body = await readRequestBody(request);
    const result = verifyAuthMatrixRequest({
      body,
      headers: request.headers,
      method: request.method,
      url: `${baseUrl}${request.url}`
    });
    if (result.challenge) {
      response.statusCode = 401;
      response.setHeader('WWW-Authenticate', result.challenge);
      response.end('authentication required');
      return;
    }
    response.statusCode = result.verified ? 200 : 401;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(result));
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

function verifyAuthMatrixRequest(options) {
  const url = new URL(options.url);
  const path = url.pathname;
  if (path === '/auth/none') {
    return {
      verified: !options.headers.authorization && !options.headers.cookie && !url.searchParams.has('api_key'),
      type: 'none'
    };
  }
  if (path === '/auth/basic') {
    return {
      authorization: options.headers.authorization || '',
      type: 'basic',
      verified: options.headers.authorization === `Basic ${Buffer.from('ui-basic-user:ui-basic-password').toString('base64')}`
    };
  }
  if (path === '/auth/bearer') {
    return {
      authorization: options.headers.authorization || '',
      type: 'bearer',
      verified: options.headers.authorization === 'Bearer ui-bearer-token'
    };
  }
  if (path === '/auth/api-key-header') {
    return {
      type: 'apiKey',
      value: options.headers['x-ui-api-key'] || '',
      verified: options.headers['x-ui-api-key'] === 'ui-api-key-value'
    };
  }
  if (path === '/auth/api-key-query') {
    return {
      type: 'apiKey',
      value: url.searchParams.get('ui_api_key') || '',
      verified: url.searchParams.get('ui_api_key') === 'ui-query-key-value'
    };
  }
  if (path === '/auth/cookie') {
    return {
      cookie: options.headers.cookie || '',
      type: 'cookie',
      verified: String(options.headers.cookie || '').includes('uiSession=ui-cookie-value')
    };
  }
  if (path === '/auth/digest') {
    const header = options.headers.authorization || '';
    if (!/^Digest\s+/i.test(header)) {
      return {
        challenge: 'Digest realm="ui-digest", nonce="ui-digest-nonce", qop="auth", algorithm=MD5, opaque="ui-digest-opaque"'
      };
    }
    const fields = parseAuthParameterHeader(header.replace(/^Digest\s+/i, ''));
    return {
      fields,
      type: 'digest',
      verified: verifyDigestAuthorization(fields, {
        method: String(options.method || 'GET').toUpperCase(),
        nonce: 'ui-digest-nonce',
        opaque: 'ui-digest-opaque',
        password: 'ui-digest-password',
        qop: 'auth',
        realm: 'ui-digest',
        uri: `${url.pathname}${url.search}`,
        username: 'ui-digest-user'
      })
    };
  }
  if (path === '/auth/oauth1') {
    const fields = parseAuthParameterHeader(String(options.headers.authorization || '').replace(/^OAuth\s+/i, ''));
    return {
      fields,
      type: 'oauth1',
      verified: verifyOAuth1Request({
        consumerSecret: 'ui-oauth1-consumer-secret',
        method: options.method,
        oauthParams: fields,
        tokenSecret: 'ui-oauth1-token-secret',
        url: options.url
      })
    };
  }
  if (path === '/auth/ntlm') {
    const type1 = parseNtlmAuthorization(options.headers.authorization || '');
    return {
      fields: type1,
      type: 'ntlm',
      verified: type1.type === 1 && type1.domain === 'UIDOMAIN' && type1.workstation === 'UIWORKSTATION'
    };
  }
  if (path === '/auth/akamai') {
    const verification = verifyAkamaiEdgeGridRequest({
      accessToken: 'ui-akamai-access',
      baseUrl: 'https://edge.ui-auth.test',
      body: options.body,
      clientSecret: 'ui-akamai-secret',
      clientToken: 'ui-akamai-client',
      headers: options.headers,
      headersToSign: 'x-ui-signed',
      maxBodySize: '1024',
      method: options.method,
      nonce: 'ui-akamai-nonce',
      timestamp: '20260525T12:00:00+0000',
      url: options.url
    });
    return { ...verification, type: 'akamaiEdgeGrid' };
  }
  if (path === '/auth/jwt') {
    const token = String(options.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const verification = verifyJwtToken(token, {
      algorithm: 'HS256',
      secret: 'ui-jwt-secret'
    });
    return {
      ...verification,
      type: 'jwtBearer',
      verified: verification.verified
        && verification.payload.sub === 'ui-jwt-subject'
        && verification.payload.scope === 'ui-auth-matrix'
    };
  }
  if (path === '/auth/asap') {
    const token = String(options.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const verification = verifyJwtToken(token, {
      algorithm: 'RS256',
      publicKey: AUTH_MATRIX_ASAP_PUBLIC_KEY
    });
    return {
      ...verification,
      type: 'asap',
      verified: verification.verified
        && verification.header.kid === 'ui-asap-key'
        && verification.payload.iss === 'ui-asap-issuer'
        && verification.payload.sub === 'ui-asap-subject'
        && verification.payload.aud === 'ui-asap-audience'
        && verification.payload.matrix === true
    };
  }
  return {
    reason: `No verifier for ${path}`,
    type: 'unknown',
    verified: false
  };
}

function parseAuthParameterHeader(header) {
  const fields = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,;]*))(?:[,;]|$)/g;
  let match;
  while ((match = pattern.exec(String(header || ''))) !== null) {
    fields[match[1]] = match[2] != null
      ? match[2].replace(/\\(["\\])/g, '$1')
      : String(match[3] || '').trim();
  }
  return fields;
}

function verifyDigestAuthorization(fields, expected) {
  if (!fields || fields.username !== expected.username || fields.realm !== expected.realm || fields.nonce !== expected.nonce) {
    return false;
  }
  if (fields.uri !== expected.uri || fields.qop !== expected.qop || fields.opaque !== expected.opaque) {
    return false;
  }
  const ha1 = md5(`${expected.username}:${expected.realm}:${expected.password}`);
  const ha2 = md5(`${expected.method}:${expected.uri}`);
  const digest = md5(`${ha1}:${expected.nonce}:${fields.nc}:${fields.cnonce}:${fields.qop}:${ha2}`);
  return fields.response === digest;
}

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function verifyOAuth1Request(options) {
  const url = new URL(options.url);
  const oauthParams = decodeOAuth1Params(options.oauthParams);
  const params = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'oauth_signature') {
      params.push([key, value]);
    }
  }
  for (const [key, value] of Object.entries(oauthParams)) {
    if (key !== 'realm' && key !== 'oauth_signature' && String(value) !== '') {
      params.push([key, value]);
    }
  }
  const expectedSignature = oauth1Signature({
    consumerSecret: options.consumerSecret,
    method: options.method,
    params,
    tokenSecret: options.tokenSecret,
    url
  });
  return oauthParams.oauth_consumer_key === 'ui-oauth1-consumer'
    && oauthParams.oauth_token === 'ui-oauth1-token'
    && oauthParams.oauth_nonce === 'ui-oauth1-nonce'
    && oauthParams.oauth_timestamp === '1777291400'
    && oauthParams.oauth_signature_method === 'HMAC-SHA1'
    && oauthParams.oauth_signature === expectedSignature;
}

function decodeOAuth1Params(params = {}) {
  return Object.fromEntries(
    Object.entries(params || {}).map(([key, value]) => [
      oauthPercentDecode(key),
      oauthPercentDecode(value)
    ])
  );
}

function oauthPercentDecode(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function oauth1Signature(options) {
  return crypto
    .createHmac('sha1', `${oauthPercentEncode(options.consumerSecret)}&${oauthPercentEncode(options.tokenSecret)}`)
    .update(oauth1BaseString(options), 'utf8')
    .digest('base64');
}

function oauth1BaseString(options) {
  const baseUrl = `${options.url.protocol}//${options.url.host}${options.url.pathname}`;
  const normalizedParams = options.params
    .map(([key, value]) => [oauthPercentEncode(key), oauthPercentEncode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return [
    String(options.method || 'GET').toUpperCase(),
    oauthPercentEncode(baseUrl),
    oauthPercentEncode(normalizedParams)
  ].join('&');
}

function oauthPercentEncode(value) {
  return encodeURIComponent(String(value == null ? '' : value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function parseNtlmAuthorization(header) {
  try {
    const message = Buffer.from(String(header || '').replace(/^NTLM\s+/i, ''), 'base64');
    if (message.slice(0, 8).toString('ascii') !== 'NTLMSSP\0') {
      return { type: 0 };
    }
    return {
      domain: readSecurityBuffer(message, 16).toString('ascii'),
      type: message.readUInt32LE(8),
      workstation: readSecurityBuffer(message, 24).toString('ascii')
    };
  } catch {
    return { type: 0 };
  }
}

function readSecurityBuffer(message, offset) {
  const length = message.readUInt16LE(offset);
  const payloadOffset = message.readUInt32LE(offset + 4);
  return message.slice(payloadOffset, payloadOffset + length);
}

function verifyAkamaiEdgeGridRequest(options) {
  const fields = parseAuthParameterHeader(String(options.headers.authorization || '').replace(/^EG1-HMAC-SHA256\s+/i, ''));
  const url = new URL(options.url);
  const signingUrl = new URL(options.baseUrl);
  const authPrefix = `EG1-HMAC-SHA256 client_token=${fields.client_token};access_token=${fields.access_token};timestamp=${fields.timestamp};nonce=${fields.nonce};`;
  const bodyForHash = Buffer.from(String(options.body || ''), 'utf8').slice(0, Number(options.maxBodySize));
  const dataToSign = [
    String(options.method || 'GET').toUpperCase(),
    signingUrl.protocol.replace(/:$/, ''),
    signingUrl.hostname.toLowerCase(),
    `${url.pathname}${url.search}`,
    canonicalAkamaiHeaders(options.headers, options.headersToSign),
    crypto.createHash('sha256').update(bodyForHash).digest('base64'),
    authPrefix
  ].join('\t');
  const signingKey = crypto.createHmac('sha256', options.clientSecret).update(options.timestamp, 'utf8').digest('base64');
  const signature = crypto.createHmac('sha256', signingKey).update(dataToSign, 'utf8').digest('base64');
  return {
    fields,
    verified: fields.client_token === options.clientToken
      && fields.access_token === options.accessToken
      && fields.timestamp === options.timestamp
      && fields.nonce === options.nonce
      && fields.signature === signature
  };
}

function canonicalAkamaiHeaders(headers, headersToSign) {
  return String(headersToSign || '')
    .split(/[,\s]+/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .map((name) => {
      const value = headers[name];
      return value == null || value === '' ? '' : `${name}:${String(value).trim().replace(/\s+/g, ' ')}`;
    })
    .filter(Boolean)
    .join('\t');
}

function verifyJwtToken(token, options = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return { header: {}, payload: {}, reason: 'malformed JWT', verified: false };
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseBase64UrlJson(encodedHeader);
  const payload = parseBase64UrlJson(encodedPayload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  let verified = false;
  if (options.algorithm === 'HS256') {
    const expected = crypto.createHmac('sha256', options.secret).update(signingInput, 'utf8').digest('base64url');
    verified = timingSafeEqualText(expected, encodedSignature);
  } else if (options.algorithm === 'RS256') {
    try {
      verified = crypto
        .createVerify('RSA-SHA256')
        .update(signingInput, 'utf8')
        .verify(options.publicKey, encodedSignature, 'base64url');
    } catch {
      verified = false;
    }
  }
  return {
    header,
    payload,
    verified: verified && header.alg === options.algorithm
  };
}

function parseBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  AUTH_MATRIX_ASAP_PUBLIC_KEY,
  createAuthMatrixServer,
  verifyAuthMatrixRequest
};
