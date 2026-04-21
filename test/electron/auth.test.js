const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { normalizeAuth, redactAuth, validateAuth } = require('../../src/core/auth');
const { sendRequest } = require('../../src/core/httpClient');

test('normalizes unsupported auth types to none and redacts secret fields', () => {
  assert.deepEqual(normalizeAuth({ type: 'unsupported', token: 'secret' }), { type: 'none' });
  assert.deepEqual(redactAuth({ type: 'bearer', token: 'secret' }), { type: 'bearer', token: '<redacted>' });
  assert.deepEqual(redactAuth({ type: 'basic', username: 'user', password: 'secret' }), {
    type: 'basic',
    username: 'user',
    password: '<redacted>'
  });
});

test('validates auth helper required fields', () => {
  assert.deepEqual(validateAuth({ type: 'bearer', token: '' }, null), ['Bearer token is required.']);
  assert.deepEqual(validateAuth({ type: 'basic', username: '', password: 'ignored' }, null), ['Basic auth username is required.']);
  assert.deepEqual(validateAuth({ type: 'apiKey', location: 'header', key: 'Bad Header', value: 'secret' }, null), ['Invalid API key header name: Bad Header.']);
  assert.deepEqual(validateAuth({ type: 'oauth2', accessToken: '{{token}}' }, { variables: [{ enabled: true, key: 'token', value: 'resolved' }] }), []);
  assert.deepEqual(validateAuth({ type: 'oauth2', refreshToken: 'refresh', tokenUrl: 'https://auth.example.test/token' }, null), []);
});

test('applies supported auth helpers during request execution', async () => {
  const server = await createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || '',
      apiKeyHeader: request.headers['x-api-key'] || '',
      cookie: request.headers.cookie || '',
      apiKeyQuery: url.searchParams.get('api_key') || ''
    }));
  });

  try {
    assert.equal((await authRequest(server.baseUrl, { type: 'bearer', token: 'abc' })).authorization, 'Bearer abc');
    assert.equal((await authRequest(server.baseUrl, { type: 'basic', username: 'alice', password: 'secret' })).authorization, `Basic ${Buffer.from('alice:secret').toString('base64')}`);
    assert.equal((await authRequest(server.baseUrl, { type: 'apiKey', location: 'header', key: 'X-API-Key', value: 'h1' })).apiKeyHeader, 'h1');
    assert.equal((await authRequest(server.baseUrl, { type: 'apiKey', location: 'query', key: 'api_key', value: 'q1' })).apiKeyQuery, 'q1');
    assert.equal((await authRequest(server.baseUrl, { type: 'cookie', value: 'session=abc' })).cookie, 'session=abc');
    assert.equal((await authRequest(server.baseUrl, { type: 'oauth2', accessToken: 'token' })).authorization, 'Bearer token');
  } finally {
    await server.close();
  }
});

test('refreshes OAuth 2.0 tokens before request execution when expired', async () => {
  let tokenRequestBody = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/token') {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      tokenRequestBody = Buffer.concat(chunks).toString('utf8');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        access_token: 'fresh-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600
      }));
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      authorization: request.headers.authorization || ''
    }));
  });

  try {
    const result = await sendRequest({
      id: 'r1',
      method: 'GET',
      url: `${server.baseUrl}/resource`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth2',
        accessToken: 'stale-access-token',
        refreshToken: 'refresh-token',
        tokenUrl: `${server.baseUrl}/token`,
        clientId: 'client-id',
        clientSecret: 'client-secret',
        expiresAt: '2000-01-01T00:00:00.000Z'
      }
    }, null, { now: Date.parse('2026-04-21T00:00:00.000Z') });

    const body = JSON.parse(result.body);
    assert.equal(body.authorization, 'Bearer fresh-access-token');
    assert.equal(result.updatedAuth.accessToken, 'fresh-access-token');
    assert.equal(result.updatedAuth.refreshToken, 'new-refresh-token');
    assert.match(result.updatedAuth.expiresAt, /^2026-04-21T01:00:00\.000Z$/);
    assert.equal(new URLSearchParams(tokenRequestBody).get('grant_type'), 'refresh_token');
    assert.equal(new URLSearchParams(tokenRequestBody).get('refresh_token'), 'refresh-token');
    assert.equal(new URLSearchParams(tokenRequestBody).get('client_id'), 'client-id');
    assert.equal(new URLSearchParams(tokenRequestBody).get('client_secret'), 'client-secret');
  } finally {
    await server.close();
  }
});

async function authRequest(baseUrl, auth) {
  const result = await sendRequest({
    method: 'GET',
    url: `${baseUrl}/auth`,
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: '',
    auth
  }, null);
  return JSON.parse(result.body);
}

async function createServer(handler) {
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.statusCode = 500;
      response.end(error.stack || String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
