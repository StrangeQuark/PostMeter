const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const http2 = require('node:http2');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');
const zlib = require('node:zlib');
const { buildUrl, loadClientCertificateOptions, sendRequest, validateRequest } = require('../../src/core/http/httpClient');

const execFileAsync = promisify(execFile);

test('validates URL, scheme, method, and header names before sending', () => {
  assert.deepEqual(validateRequest({ method: 'GET', url: '' }, null), ['Request URL is required.']);
  assert.deepEqual(validateRequest({ method: 'GET', url: 'not-a-url' }, null), ['URL is not a valid URI.']);
  assert.deepEqual(validateRequest({ method: 'GET', url: 'google.com' }, null), []);
  assert.deepEqual(validateRequest({ method: 'GET', url: 'localhost:3000/health' }, null), []);
  assert.deepEqual(validateRequest({ method: 'GET', url: 'file:///tmp/example' }, null), ['Only http and https URLs are supported.']);
  assert.deepEqual(validateRequest({ method: 'GET', url: 'ftp://example.test' }, null), ['Only http and https URLs are supported.']);
  assert.deepEqual(validateRequest({ method: 'TRACE', url: 'https://example.test' }, null), ['Unsupported HTTP method: TRACE.']);
  assert.deepEqual(
    validateRequest({ method: 'GET', url: 'https://example.test', headers: [{ enabled: true, key: 'Bad Header', value: 'x' }] }, null),
    ['Invalid header name: Bad Header.']
  );
  assert.deepEqual(
    validateRequest({
      method: 'GET',
      url: 'http://example.test',
      headers: [],
      queryParams: [],
      auth: { type: 'clientCertificate', certPath: '/tmp/client.pem', keyPath: '/tmp/client.key' }
    }, null),
    ['Client certificate auth requires an https URL.']
  );
});

test('normalizes scheme-less request URLs before sending', async () => {
  assert.equal(buildUrl({ method: 'GET', url: 'google.com', queryParams: [] }, null).toString(), 'http://google.com/');
  assert.equal(buildUrl({ method: 'GET', url: '//api.example.test/v1', queryParams: [] }, null).toString(), 'http://api.example.test/v1');
  assert.equal(buildUrl({ method: 'GET', url: 'localhost:3000/health', queryParams: [] }, null).toString(), 'http://localhost:3000/health');
  assert.equal(buildUrl({ method: 'GET', url: '127.0.0.1:3000/health', queryParams: [] }, null).toString(), 'http://127.0.0.1:3000/health');

  const server = await createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ method: request.method, url: request.url }));
  });

  try {
    const port = new URL(server.baseUrl).port;
    const result = await sendRequest({
      method: 'GET',
      url: `127.0.0.1:${port}/scheme-less`,
      queryParams: [{ enabled: true, key: 'q', value: 'alpha' }],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null);

    assert.equal(result.statusCode, 200);
    assert.equal(result.finalUrl, `http://127.0.0.1:${port}/scheme-less?q=alpha`);
    assert.deepEqual(JSON.parse(result.body), { method: 'GET', url: '/scheme-less?q=alpha' });
  } finally {
    await server.close();
  }
});

test('does not append structured query params when they already mirror the URL', async () => {
  const server = await createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ url: request.url }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/mirror?q=alpha&tag=one&tag=two`,
      queryParams: [
        { enabled: true, key: 'q', value: 'alpha' },
        { enabled: true, key: 'tag', value: 'one' },
        { enabled: true, key: 'tag', value: 'two' }
      ],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null);

    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).url, '/mirror?q=alpha&tag=one&tag=two');
  } finally {
    await server.close();
  }
});

test('sends requests with environment-resolved URL, query params, headers, and body', async () => {
  const server = await createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-PostMeter-Test', 'ok');
    response.end(JSON.stringify({
      method: request.method,
      url: request.url,
      header: request.headers['x-test-header'],
      body: Buffer.concat(chunks).toString('utf8')
    }));
  });

  try {
    const result = await sendRequest({
      method: 'POST',
      url: '{{baseUrl}}/echo',
      queryParams: [{ enabled: true, key: 'q', value: '{{term}}' }],
      headers: [{ enabled: true, key: 'X-Test-Header', value: '{{term}}' }],
      bodyType: 'RAW_JSON',
      body: '{"search":"{{term}}"}'
    }, {
      variables: [
        { enabled: true, key: 'baseUrl', value: server.baseUrl },
        { enabled: true, key: 'term', value: 'alpha' }
      ]
    });

    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.method, 'POST');
    assert.equal(body.url, '/echo?q=alpha');
    assert.equal(body.header, 'alpha');
    assert.equal(body.body, '{"search":"alpha"}');
    assert.equal(result.headers['content-type'][0], 'application/json');
    assert.equal(result.headers['x-postmeter-test'][0], 'ok');
    assert.match(result.finalUrl, /\/echo\?q=alpha$/);
    assert.ok(result.durationMillis >= 0);
    assert.ok(result.responseBytes > 0);
    assert.equal(result.tls, undefined);
  } finally {
    await server.close();
  }
});

test('adds generated request headers at send time without requiring saved header rows', async () => {
  const server = await createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      accept: request.headers.accept || '',
      userAgent: request.headers['user-agent'] || '',
      acceptEncoding: request.headers['accept-encoding'] || '',
      contentLength: request.headers['content-length'] || '',
      postMeterToken: request.headers['postmeter-token'] || '',
      body: Buffer.concat(chunks).toString('utf8')
    }));
  });

  try {
    const result = await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/generated`,
      queryParams: [],
      headers: [],
      bodyType: 'RAW_TEXT',
      body: 'hello',
      autoHeaders: { sendPostMeterToken: true }
    }, null);

    const body = JSON.parse(result.body);
    assert.equal(body.accept, '*/*');
    assert.equal(body.userAgent, 'PostMeter/0.2.0');
    assert.equal(body.acceptEncoding, 'gzip, deflate, br');
    assert.equal(body.contentLength, '5');
    assert.match(body.postMeterToken, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.equal(body.body, 'hello');
  } finally {
    await server.close();
  }
});

test('does not send PostMeter token by default and preserves explicit generated header overrides', async () => {
  const server = await createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      accept: request.headers.accept || '',
      userAgent: request.headers['user-agent'] || '',
      acceptEncoding: request.headers['accept-encoding'] || '',
      postMeterToken: request.headers['postmeter-token'] || ''
    }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/explicit`,
      queryParams: [],
      headers: [
        { enabled: true, key: 'Accept', value: 'application/json' },
        { enabled: true, key: 'User-Agent', value: 'CustomAgent/1.0' },
        { enabled: true, key: 'Accept-Encoding', value: 'identity' }
      ],
      bodyType: 'NONE',
      body: ''
    }, null);

    const body = JSON.parse(result.body);
    assert.equal(body.accept, 'application/json');
    assert.equal(body.userAgent, 'CustomAgent/1.0');
    assert.equal(body.acceptEncoding, 'identity');
    assert.equal(body.postMeterToken, '');
  } finally {
    await server.close();
  }
});

test('decompresses generated Accept-Encoding responses when using the Node transport', async () => {
  const server = await createServer(async (request, response) => {
    assert.equal(request.headers['accept-encoding'], 'gzip, deflate, br');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Content-Encoding', 'gzip');
    response.end(zlib.gzipSync(JSON.stringify({ compressed: true })));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/compressed`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: ''
    }, null, { forceNode: true });

    assert.equal(result.statusCode, 200);
    assert.deepEqual(JSON.parse(result.body), { compressed: true });
  } finally {
    await server.close();
  }
});

test('sends matching cookie jar cookies and stores response cookies', async () => {
  const server = await createServer(async (request, response) => {
    response.setHeader('Set-Cookie', [
      'serverToken=updated; Path=/; HttpOnly; SameSite=Lax',
      'expired=gone; Path=/; Max-Age=0'
    ]);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      cookie: request.headers.cookie || ''
    }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/cookies`,
      queryParams: [],
      headers: [{ enabled: true, key: 'Cookie', value: 'explicit=1' }],
      bodyType: 'NONE',
      body: '',
      cookieJar: { enabled: true, storeResponses: true }
    }, null, {
      cookieJar: [
        { enabled: true, name: 'serverToken', value: 'initial', domain: '127.0.0.1', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true },
        { enabled: true, name: 'secureOnly', value: 'nope', domain: '127.0.0.1', path: '/', secure: true, httpOnly: false, sameSite: '', hostOnly: true }
      ]
    });

    const body = JSON.parse(result.body);
    assert.equal(body.cookie, 'explicit=1; serverToken=initial');
    assert.equal(result.updatedCookies.some((cookie) => cookie.name === 'expired'), false);
    const updated = result.updatedCookies.find((cookie) => cookie.name === 'serverToken');
    assert.equal(updated.value, 'updated');
    assert.equal(updated.httpOnly, true);
  } finally {
    await server.close();
  }
});

test('sends host-only localhost cookie jar cookies when request auth is none', async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ cookie: request.headers.cookie || '' }));
  });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  const { port } = server.address();

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `http://localhost:${port}/auth/access`,
      queryParams: [],
      headers: [],
      auth: { type: 'none' },
      bodyType: 'NONE',
      body: '',
      cookieJar: { enabled: true, storeResponses: true }
    }, null, {
      cookieJar: [
        { enabled: true, name: 'refresh_token', value: 'refresh-cookie', domain: 'localhost', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true },
        { enabled: true, name: 'access_token', value: 'access-cookie', domain: 'localhost', path: '/', secure: false, httpOnly: true, sameSite: 'Lax', hostOnly: true }
      ]
    });

    assert.equal(JSON.parse(result.body).cookie, 'refresh_token=refresh-cookie; access_token=access-cookie');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('stores redirect-hop cookies and sends them to later hops', async () => {
  const seenCookies = [];
  const server = await createServer(async (request, response) => {
    seenCookies.push({ url: request.url, cookie: request.headers.cookie || '' });
    if (request.url === '/start') {
      response.statusCode = 302;
      response.setHeader('Location', '/final');
      response.setHeader('Set-Cookie', 'hop=one; Path=/; HttpOnly');
      response.end('redirect');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Set-Cookie', 'final=two; Path=/; HttpOnly');
    response.end(JSON.stringify({ cookie: request.headers.cookie || '' }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/start`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      cookieJar: { enabled: true, storeResponses: true }
    }, null);

    assert.equal(result.finalUrl, `${server.baseUrl}/final`);
    assert.deepEqual(seenCookies, [
      { url: '/start', cookie: '' },
      { url: '/final', cookie: 'hop=one' }
    ]);
    assert.equal(JSON.parse(result.body).cookie, 'hop=one');
    assert.equal(result.updatedCookies.find((cookie) => cookie.name === 'hop')?.value, 'one');
    assert.equal(result.updatedCookies.find((cookie) => cookie.name === 'final')?.value, 'two');
  } finally {
    await server.close();
  }
});

test('stores redirect-hop cookies on node transport redirects', async () => {
  const seenCookies = [];
  const server = await createServer(async (request, response) => {
    seenCookies.push({ url: request.url, cookie: request.headers.cookie || '' });
    if (request.url === '/node-start') {
      response.statusCode = 302;
      response.setHeader('Location', '/node-final');
      response.setHeader('Set-Cookie', 'nodeHop=one; Path=/; HttpOnly');
      response.end('redirect');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Set-Cookie', 'nodeFinal=two; Path=/; HttpOnly');
    response.end(JSON.stringify({ cookie: request.headers.cookie || '' }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/node-start`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: { type: 'ntlm', username: 'user', password: 'pass' },
      cookieJar: { enabled: true, storeResponses: true }
    }, null);

    assert.equal(result.finalUrl, `${server.baseUrl}/node-final`);
    assert.deepEqual(seenCookies, [
      { url: '/node-start', cookie: '' },
      { url: '/node-final', cookie: 'nodeHop=one' }
    ]);
    assert.equal(JSON.parse(result.body).cookie, 'nodeHop=one');
    assert.equal(result.updatedCookies.find((cookie) => cookie.name === 'nodeHop')?.value, 'one');
    assert.equal(result.updatedCookies.find((cookie) => cookie.name === 'nodeFinal')?.value, 'two');
  } finally {
    await server.close();
  }
});

test('does not forward explicit auth or cookie headers across redirect origins', async () => {
  let redirectedHeaders = null;
  const target = await createServer(async (request, response) => {
    redirectedHeaders = request.headers;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ cookie: request.headers.cookie || '' }));
  });
  const source = await createServer(async (_request, response) => {
    response.statusCode = 302;
    response.setHeader('Location', `${target.baseUrl}/landing`);
    response.setHeader('Set-Cookie', 'hop=one; Path=/; HttpOnly');
    response.end('redirect');
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${source.baseUrl}/start`,
      queryParams: [],
      headers: [
        { enabled: true, key: 'Authorization', value: 'Bearer explicit-token' },
        { enabled: true, key: 'Cookie', value: 'explicit=secret' }
      ],
      bodyType: 'NONE',
      body: '',
      cookieJar: { enabled: true, storeResponses: true }
    }, null);

    assert.equal(result.finalUrl, `${target.baseUrl}/landing`);
    assert.equal(redirectedHeaders.authorization, undefined);
    assert.equal(redirectedHeaders.cookie, 'hop=one');
    assert.equal(JSON.parse(result.body).cookie, 'hop=one');
  } finally {
    await source.close();
    await target.close();
  }
});

test('request setting disables automatic redirects', async () => {
  let targetHits = 0;
  const server = await createServer(async (request, response) => {
    if (request.url === '/start') {
      response.statusCode = 302;
      response.setHeader('Location', '/target');
      response.end('redirect');
      return;
    }
    targetHits += 1;
    response.end('target');
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/start`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      settings: { followRedirects: false }
    }, null);

    assert.equal(result.statusCode, 302);
    assert.equal(result.finalUrl, `${server.baseUrl}/start`);
    assert.equal(targetHits, 0);
  } finally {
    await server.close();
  }
});

test('request setting limits the maximum number of redirects', async () => {
  const server = await createServer(async (request, response) => {
    if (request.url === '/one') {
      response.statusCode = 302;
      response.setHeader('Location', '/two');
      response.end('one');
      return;
    }
    if (request.url === '/two') {
      response.statusCode = 302;
      response.setHeader('Location', '/three');
      response.end('two');
      return;
    }
    response.end('three');
  });

  try {
    await assert.rejects(
      () => sendRequest({
        method: 'GET',
        url: `${server.baseUrl}/one`,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        settings: { maxRedirects: 1 }
      }, null),
      /exceeded 1 redirects/
    );

    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/one`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      settings: { maxRedirects: 2 }
    }, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body, 'three');
  } finally {
    await server.close();
  }
});

test('request setting follows redirects with the original HTTP method', async () => {
  let redirectedMethod = '';
  let redirectedBody = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/submit') {
      response.statusCode = 302;
      response.setHeader('Location', '/target');
      response.end('redirect');
      return;
    }
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    redirectedMethod = request.method;
    redirectedBody = Buffer.concat(chunks).toString('utf8');
    response.end('target');
  });

  try {
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/submit`,
      queryParams: [],
      headers: [],
      bodyType: 'RAW_TEXT',
      body: 'payload',
      settings: { followOriginalHttpMethod: true }
    }, null);

    assert.equal(redirectedMethod, 'POST');
    assert.equal(redirectedBody, 'payload');

    redirectedMethod = '';
    redirectedBody = '';
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/submit`,
      queryParams: [],
      headers: [],
      bodyType: 'RAW_TEXT',
      body: 'payload'
    }, null);

    assert.equal(redirectedMethod, 'GET');
    assert.equal(redirectedBody, '');
  } finally {
    await server.close();
  }
});

test('request setting controls Authorization header forwarding across redirect origins', async () => {
  let receivedAuthorization = '';
  const target = await createServer(async (request, response) => {
    receivedAuthorization = request.headers.authorization || '';
    response.end('target');
  });
  const source = await createServer(async (_request, response) => {
    response.statusCode = 302;
    response.setHeader('Location', `${target.baseUrl}/target`);
    response.end('redirect');
  });

  try {
    await sendRequest({
      method: 'GET',
      url: `${source.baseUrl}/start`,
      queryParams: [],
      headers: [{ enabled: true, key: 'Authorization', value: 'Bearer keep-me' }],
      bodyType: 'NONE',
      body: '',
      settings: { followAuthorizationHeader: true }
    }, null);
    assert.equal(receivedAuthorization, 'Bearer keep-me');

    receivedAuthorization = '';
    await sendRequest({
      method: 'GET',
      url: `${source.baseUrl}/start`,
      queryParams: [],
      headers: [{ enabled: true, key: 'Authorization', value: 'Bearer drop-me' }],
      bodyType: 'NONE',
      body: ''
    }, null);
    assert.equal(receivedAuthorization, '');
  } finally {
    await source.close();
    await target.close();
  }
});

test('request setting removes the Referer header on redirect', async () => {
  let receivedReferer = '';
  const server = await createServer(async (request, response) => {
    if (request.url === '/start') {
      response.statusCode = 302;
      response.setHeader('Location', '/target');
      response.end('redirect');
      return;
    }
    receivedReferer = request.headers.referer || '';
    response.end('target');
  });

  try {
    await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/start`,
      queryParams: [],
      headers: [{ enabled: true, key: 'Referer', value: `${server.baseUrl}/source` }],
      bodyType: 'NONE',
      body: '',
      settings: { removeRefererHeaderOnRedirect: true }
    }, null);
    assert.equal(receivedReferer, '');

    await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/start`,
      queryParams: [],
      headers: [{ enabled: true, key: 'Referer', value: `${server.baseUrl}/source` }],
      bodyType: 'NONE',
      body: ''
    }, null);
    assert.equal(receivedReferer, `${server.baseUrl}/source`);
  } finally {
    await server.close();
  }
});

test('request setting controls automatic URL encoding for structured query params', async () => {
  const seenUrls = [];
  const server = await createServer(async (request, response) => {
    seenUrls.push(request.url);
    response.end('ok');
  });

  try {
    await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/search`,
      queryParams: [{ enabled: true, key: 'q', value: 'a=b&c' }],
      headers: [],
      bodyType: 'NONE',
      body: '',
      settings: { encodeUrlAutomatically: true }
    }, null);
    await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/search`,
      queryParams: [{ enabled: true, key: 'q', value: 'a=b&c' }],
      headers: [],
      bodyType: 'NONE',
      body: '',
      settings: { encodeUrlAutomatically: false }
    }, null);

    assert.equal(seenUrls[0], '/search?q=a%3Db%26c');
    assert.equal(seenUrls[1], '/search?q=a=b&c');
  } finally {
    await server.close();
  }
});

test('request setting toggles strict HTTP response parsing', async () => {
  const lenient = await createRawHttpServer('HTTP/1.1 200 OK\r\nX-Test: hello\x01\r\nContent-Length: 2\r\n\r\nok');
  try {
    const result = await sendRequest({
      method: 'GET',
      url: lenient.baseUrl,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      settings: { strictHttpParser: false }
    }, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body, 'ok');
  } finally {
    await lenient.close();
  }

  const defaultStrict = await createRawHttpServer('HTTP/1.1 200 OK\r\nX-Test: hello\x01\r\nContent-Length: 2\r\n\r\nok');
  try {
    await assert.rejects(
      () => sendRequest({
        method: 'GET',
        url: defaultStrict.baseUrl,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: ''
      }, null),
      /Invalid header value char|Parse Error/
    );
  } finally {
    await defaultStrict.close();
  }

  const strict = await createRawHttpServer('HTTP/1.1 200 OK\r\nX-Test: hello\x01\r\nContent-Length: 2\r\n\r\nok');
  try {
    await assert.rejects(
      () => sendRequest({
        method: 'GET',
        url: strict.baseUrl,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        settings: { strictHttpParser: true }
      }, null),
      /Invalid header value char|Parse Error/
    );
  } finally {
    await strict.close();
  }
});

test('request setting sends requests with HTTP/2', async () => {
  let streamHeaders = null;
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    streamHeaders = headers;
    stream.respond({ ':status': 200, 'content-type': 'application/json' });
    stream.end(JSON.stringify({ method: headers[':method'], path: headers[':path'], version: 'h2' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `http://127.0.0.1:${address.port}/h2`,
      queryParams: [{ enabled: true, key: 'q', value: 'ok' }],
      headers: [{ enabled: true, key: 'X-Mode', value: 'http2' }],
      bodyType: 'NONE',
      body: '',
      settings: { httpVersion: 'http2' }
    }, null, { collectTimings: true });

    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).version, 'h2');
    assert.equal(streamHeaders['x-mode'], 'http2');
    assert.equal(result.timings.httpVersion, '2');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('request setting Auto uses the compatible default HTTP transport', async () => {
  let requestHttpVersion = '';
  const server = await createServer(async (request, response) => {
    requestHttpVersion = request.httpVersion;
    response.end('ok');
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/auto`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      settings: { httpVersion: 'auto' }
    }, null, { collectTimings: true });

    assert.equal(result.statusCode, 200);
    assert.match(requestHttpVersion, /^1\./);
    assert.match(result.timings.httpVersion, /^1\./);
  } finally {
    await server.close();
  }
});

test('sends user-bound file and multipart Postman bodies without arbitrary path reads', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-attachments-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const rawPath = path.join(dir, 'raw-upload.txt');
  const inferredBinaryPath = path.join(dir, 'raw-upload.json');
  const partPath = path.join(dir, 'part-upload.json');
  const unknownPartPath = path.join(dir, 'part-upload.customext');
  await fs.writeFile(rawPath, 'BOUND_RAW');
  await fs.writeFile(inferredBinaryPath, 'BOUND_INFERRED_BINARY');
  await fs.writeFile(partPath, 'BOUND_PART');
  await fs.writeFile(unknownPartPath, 'BOUND_UNKNOWN_PART');
  const observed = [];
  const server = await createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    observed.push({
      body,
      contentType: request.headers['content-type'] || '',
      path: request.url
    });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });

  try {
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/binary`,
      queryParams: [],
      headers: [],
      postmanBody: { mode: 'binary', binary: { src: 'fixtures/raw-upload.txt', contentType: 'application/octet-stream' } }
    }, null, {
      fileBindings: [{ source: 'fixtures/raw-upload.txt', localPath: rawPath }]
    });
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/binary-inferred`,
      queryParams: [],
      headers: [],
      postmanBody: { mode: 'binary', binary: { src: 'fixtures/raw-upload.json' } }
    }, null, {
      fileBindings: [{ source: 'fixtures/raw-upload.json', localPath: inferredBinaryPath }]
    });
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/form`,
      queryParams: [],
      headers: [],
      postmanBody: {
        mode: 'formdata',
        formdata: [
          { key: 'note', value: 'hello', type: 'text' },
          { key: 'payload', src: 'fixtures/part-upload.json', type: 'file' }
        ]
      }
    }, null, {
      fileBindings: [{ source: 'fixtures/part-upload.json', localPath: partPath, fileName: 'part-upload.json' }]
    });
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/form-unknown`,
      queryParams: [],
      headers: [],
      postmanBody: {
        mode: 'formdata',
        formdata: [
          { key: 'payload', src: 'fixtures/part-upload.customext', type: 'file' }
        ]
      }
    }, null, {
      fileBindings: [{ source: 'fixtures/part-upload.customext', localPath: unknownPartPath, fileName: 'part-upload.customext' }]
    });

    assert.equal(observed[0].body, 'BOUND_RAW');
    assert.equal(observed[0].contentType, 'application/octet-stream');
    assert.equal(observed[1].body, 'BOUND_INFERRED_BINARY');
    assert.equal(observed[1].contentType, 'application/json');
    assert.match(observed[2].contentType, /^multipart\/form-data; boundary=/);
    assert.match(observed[2].body, /name="note"\r\n\r\nhello/);
    assert.match(observed[2].body, /filename="part-upload.json"/);
    assert.match(observed[2].body, /Content-Type: application\/json/);
    assert.match(observed[2].body, /BOUND_PART/);
    assert.match(observed[3].body, /filename="part-upload.customext"/);
    assert.match(observed[3].body, /Content-Type: application\/octet-stream/);
    assert.match(observed[3].body, /BOUND_UNKNOWN_PART/);
    await assert.rejects(
      () => sendRequest({
        method: 'POST',
        url: `${server.baseUrl}/denied`,
        queryParams: [],
        headers: [],
        postmanBody: { mode: 'file', file: { src: '/etc/passwd' } }
      }, null, { fileBindings: [] }),
      /File attachment binding is required/
    );
  } finally {
    await server.close();
  }
});

test('materializes Postman-style urlencoded and text-only form-data bodies with environment variables', async () => {
  const observed = [];
  const server = await createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    observed.push({
      body: Buffer.concat(chunks).toString('utf8'),
      contentType: request.headers['content-type'] || ''
    });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });

  try {
    const environment = {
      variables: [
        { enabled: true, key: 'tokenKey', value: 'token' },
        { enabled: true, key: 'tokenValue', value: 'alpha beta' },
        { enabled: true, key: 'formValue', value: 'hello form' }
      ]
    };
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/encoded`,
      queryParams: [],
      headers: [],
      postmanBody: {
        mode: 'urlencoded',
        urlencoded: [
          { key: '{{tokenKey}}', value: '{{tokenValue}}' },
          { key: 'disabled', value: 'nope', disabled: true }
        ]
      }
    }, environment);
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/form-text`,
      queryParams: [],
      headers: [],
      postmanBody: {
        mode: 'formdata',
        formdata: [
          { key: 'message', value: '{{formValue}}', type: 'text' }
        ]
      }
    }, environment);

    assert.equal(observed[0].contentType, 'application/x-www-form-urlencoded');
    assert.equal(observed[0].body, 'token=alpha+beta');
    assert.match(observed[1].contentType, /^multipart\/form-data; boundary=/);
    assert.match(observed[1].body, /name="message"\r\n\r\nhello form/);
  } finally {
    await server.close();
  }
});

test('materializes Postman-style GraphQL bodies with environment variable substitution', async () => {
  let observed = null;
  const server = await createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    observed = {
      body: Buffer.concat(chunks).toString('utf8'),
      contentType: request.headers['content-type'] || '',
      method: request.method,
      url: request.url
    };
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: { user: { id: 'user-42' } } }));
  });

  try {
    const result = await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/graphql`,
      queryParams: [],
      headers: [],
      postmanBody: {
        mode: 'graphql',
        graphql: {
          query: 'query {{operationName}}($id: ID!) { user(id: $id) { id } }',
          variables: '{"id":"{{userId}}","nested":{"token":"{{token}}"},"empty":""}',
          operationName: '{{operationName}}'
        }
      },
      protocol: 'graphql'
    }, {
      variables: [
        { enabled: true, key: 'operationName', value: 'GetUser' },
        { enabled: true, key: 'userId', value: 'user-42' },
        { enabled: true, key: 'token', value: 'secret-token' }
      ]
    });

    assert.equal(result.statusCode, 200);
    assert.equal(observed.method, 'POST');
    assert.equal(observed.url, '/graphql');
    assert.equal(observed.contentType, 'application/json');
    assert.deepEqual(JSON.parse(observed.body), {
      query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
      variables: {
        id: 'user-42',
        nested: { token: 'secret-token' },
        empty: ''
      },
      operationName: 'GetUser'
    });
  } finally {
    await server.close();
  }
});

test('uses raw body format content types for Postman raw body modes', async () => {
  const observed = [];
  const server = await createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Drain the request body before responding.
    }
    observed.push(request.headers['content-type'] || '');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });

  try {
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/html`,
      queryParams: [],
      headers: [],
      postmanBody: {
        mode: 'raw',
        raw: '<p>{{name}}</p>',
        options: { raw: { language: 'html' } }
      }
    }, { variables: [{ enabled: true, key: 'name', value: 'PostMeter' }] });
    await sendRequest({
      method: 'POST',
      url: `${server.baseUrl}/xml`,
      queryParams: [],
      headers: [],
      postmanBody: {
        mode: 'raw',
        raw: '<root />',
        options: { raw: { language: 'xml' } }
      }
    });

    assert.equal(observed[0], 'text/html; charset=utf-8');
    assert.equal(observed[1], 'application/xml');
  } finally {
    await server.close();
  }
});

test('sends brokered HTTP requests through configured proxies without exposing raw sockets to scripts', async () => {
  let observed = null;
  const proxy = await createServer(async (request, response) => {
    observed = {
      host: request.headers.host,
      proxyAuthorization: request.headers['proxy-authorization'] || '',
      url: request.url
    };
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ proxied: true }));
  });

  try {
    const result = await sendRequest({
      method: 'GET',
      url: 'http://api.example.test/proxied?x=1',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      proxy: {
        protocol: 'http',
        host: '127.0.0.1',
        port: String(new URL(proxy.baseUrl).port),
        username: 'proxy-user',
        password: 'proxy-pass'
      }
    }, null);

    assert.equal(JSON.parse(result.body).proxied, true);
    assert.equal(observed.host, 'api.example.test');
    assert.equal(observed.url, 'http://api.example.test/proxied?x=1');
    assert.equal(observed.proxyAuthorization, `Basic ${Buffer.from('proxy-user:proxy-pass').toString('base64')}`);
  } finally {
    await proxy.close();
  }
});

test('loads PEM and PFX client certificate material from main-process paths', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-cert-'));
  const certPath = path.join(dir, 'client.pem');
  const keyPath = path.join(dir, 'client.key');
  const pfxPath = path.join(dir, 'client.p12');
  const caPath = path.join(dir, 'ca.pem');
  await fs.writeFile(certPath, 'CERTIFICATE');
  await fs.writeFile(keyPath, 'PRIVATE KEY');
  await fs.writeFile(pfxPath, 'PFX BYTES');
  await fs.writeFile(caPath, 'CA CERTIFICATE');

  const pem = await loadClientCertificateOptions({
    type: 'clientCertificate',
    certPath: '{{certPath}}',
    keyPath: '{{keyPath}}',
    caPath: '{{caPath}}',
    passphrase: '{{passphrase}}'
  }, {
    variables: [
      { enabled: true, key: 'certPath', value: certPath },
      { enabled: true, key: 'keyPath', value: keyPath },
      { enabled: true, key: 'caPath', value: caPath },
      { enabled: true, key: 'passphrase', value: 'secret' }
    ]
  }, new URL('https://example.test'));

  assert.equal(pem.cert.toString('utf8'), 'CERTIFICATE');
  assert.equal(pem.key.toString('utf8'), 'PRIVATE KEY');
  assert.equal(pem.ca.toString('utf8'), 'CA CERTIFICATE');
  assert.equal(pem.passphrase, 'secret');

  await assert.rejects(
    () => loadClientCertificateOptions({
      type: 'clientCertificate',
      pfxPath
    }, null, new URL('https://example.test')),
    /client certificate PFX\/P12 bundle could not be extracted/
  );

  const bound = await loadClientCertificateOptions({
    type: 'clientCertificate',
    certificateId: 'cert-1'
  }, null, new URL('https://example.test'), [{
    id: 'cert-1',
    certPath,
    keyPath,
    caPath,
    passphrase: 'bound-secret'
  }]);
  assert.equal(bound.cert.toString('utf8'), 'CERTIFICATE');
  assert.equal(bound.key.toString('utf8'), 'PRIVATE KEY');
  assert.equal(bound.passphrase, 'bound-secret');

  await assert.rejects(
    () => loadClientCertificateOptions({
      type: 'clientCertificate',
      certificateId: 'disabled-cert'
    }, null, new URL('https://example.test'), [{
      id: 'disabled-cert',
      enabled: false,
      certPath,
      keyPath
    }]),
    /binding was not found/
  );

  await assert.rejects(
    () => loadClientCertificateOptions({ type: 'clientCertificate', certificateId: 'missing' }, null, new URL('https://example.test'), []),
    /binding was not found/
  );

  await assert.rejects(
    () => loadClientCertificateOptions({ type: 'clientCertificate', pfxPath }, null, new URL('http://example.test')),
    /requires an https URL/
  );
});

test('sends HTTPS requests with PEM and PFX client certificates', async (t) => {
  const opensslPath = await findOpenSsl();
  if (!opensslPath) {
    t.skip('OpenSSL is required to generate mTLS test certificates.');
    return;
  }

  const fixtures = await createMtlsFixtures(opensslPath);
  const server = await createMtlsServer(fixtures);

  try {
    const pemResult = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/mtls`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'clientCertificate',
        certPath: fixtures.clientCertPath,
        keyPath: fixtures.clientKeyPath,
        caPath: fixtures.caCertPath
      }
    }, null);
    assert.equal(JSON.parse(pemResult.body).clientCommonName, 'PostMeter Client');

    const pfxResult = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/mtls`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'clientCertificate',
        pfxPath: fixtures.clientPfxPath,
        caPath: fixtures.caCertPath,
        passphrase: 'secretpass'
      }
    }, null);
    assert.equal(JSON.parse(pfxResult.body).authorized, true);

    const encryptedPemResult = await sendRequest({
      method: 'GET',
      url: `${server.baseUrl}/mtls`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'clientCertificate',
        certPath: fixtures.clientCertPath,
        keyPath: fixtures.clientEncryptedKeyPath,
        caPath: fixtures.caCertPath,
        passphrase: 'secretpass'
      }
    }, null);
    assert.equal(JSON.parse(encryptedPemResult.body).authorized, true);

    await assert.rejects(
      () => sendRequest({
        method: 'GET',
        url: `${server.baseUrl}/mtls`,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        auth: {
          type: 'clientCertificate',
          certPath: fixtures.clientCertPath,
          keyPath: fixtures.clientKeyPath
        }
      }, null, {
        tlsSettings: {
          request: {
            sslCertificateVerification: true
          }
        }
      })
    );
  } finally {
    await server.close();
  }
});

test('applies SSL verification settings, custom CA bundles, and TLS response diagnostics', async (t) => {
  const opensslPath = await findOpenSsl();
  if (!opensslPath) {
    t.skip('OpenSSL is required to generate TLS test certificates.');
    return;
  }

  const fixtures = await createMtlsFixtures(opensslPath);
  const server = await createTlsServer(fixtures);
  const request = {
    method: 'GET',
    url: `${server.baseUrl}/tls`,
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: ''
  };

  try {
    await assert.rejects(() => sendRequest(request, null, { collectTimings: true }));

    await assert.rejects(() => sendRequest(request, null, {
      tlsSettings: {
        request: {
          sslCertificateVerification: true
        }
      }
    }));

    const caResult = await sendRequest(request, null, {
      collectTimings: true,
      tlsSettings: {
        request: {
          caCertificatePath: fixtures.caCertPath,
          sslCertificateVerification: true
        }
      }
    });
    assert.equal(caResult.statusCode, 200);
    assert.equal(JSON.parse(caResult.body).ok, true);
    assert.equal(caResult.tls.authorized, true);
    assert.equal(caResult.tls.caCertificateConfigured, true);
    assert.equal(Boolean(caResult.tls.certificate.fingerprint256), true);

    const flatCaResult = await sendRequest(request, null, {
      collectTimings: true,
      tlsSettings: {
        caCertificatePath: fixtures.caCertPath,
        sslCertificateVerification: true
      }
    });
    assert.equal(flatCaResult.statusCode, 200);
    assert.equal(flatCaResult.tls.authorized, true);
    assert.equal(flatCaResult.tls.caCertificateConfigured, true);

    const requestEnabledOverride = await sendRequest({
      ...request,
      settings: { sslCertificateVerification: 'enabled' }
    }, null, {
      collectTimings: true,
      tlsSettings: {
        request: {
          caCertificatePath: fixtures.caCertPath,
          sslCertificateVerification: false
        }
      }
    });
    assert.equal(requestEnabledOverride.statusCode, 200);
    assert.equal(requestEnabledOverride.tls.authorized, true);
    assert.equal(requestEnabledOverride.tls.verificationDisabled, false);

    const insecureResult = await sendRequest(request, null, {
      collectTimings: true,
      tlsSettings: {
        request: {
          sslCertificateVerification: false
        }
      }
    });
    assert.equal(insecureResult.statusCode, 200);
    assert.equal(insecureResult.tls.verificationDisabled, true);

    const requestDisabledOverride = await sendRequest({
      ...request,
      settings: { sslCertificateVerification: 'disabled' }
    }, null, {
      collectTimings: true,
      tlsSettings: {
        request: {
          sslCertificateVerification: true
        }
      }
    });
    assert.equal(requestDisabledOverride.statusCode, 200);
    assert.equal(requestDisabledOverride.tls.verificationDisabled, true);

    await assert.rejects(() => sendRequest({
      ...request,
      settings: {
        caCertificatePath: fixtures.caCertPath,
        sslCertificateVerification: 'enabled'
      }
    }, null, {
      tlsSettings: {
        request: {
          sslCertificateVerification: true
        }
      }
    }));
  } finally {
    await server.close();
  }
});

test('request TLS handshake settings disable protocols and select cipher suites', async (t) => {
  const opensslPath = await findOpenSsl();
  if (!opensslPath) {
    t.skip('OpenSSL is required to generate TLS test certificates.');
    return;
  }
  const fixtures = await createMtlsFixtures(opensslPath);
  const protocolServer = await createCustomTlsServer(fixtures, {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2'
  });
  try {
    const allowed = await sendRequest({
      method: 'GET',
      url: `${protocolServer.baseUrl}/tls`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      settings: { sslCertificateVerification: 'disabled' }
    }, null, { collectTimings: true });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.tls.protocol, 'TLSv1.2');

    await assert.rejects(
      () => sendRequest({
        method: 'GET',
        url: `${protocolServer.baseUrl}/tls`,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        settings: {
          sslCertificateVerification: 'disabled',
          disabledTlsProtocols: ['TLSv1.2']
        }
      }, null),
      /unsupported protocol|protocol version|alert protocol|EPROTO/i
    );
  } finally {
    await protocolServer.close();
  }

  const cipherServer = await createCustomTlsServer(fixtures, {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    ciphers: 'AES128-SHA:@SECLEVEL=0',
    honorCipherOrder: true
  });
  try {
    const cipherResult = await sendRequest({
      method: 'GET',
      url: `${cipherServer.baseUrl}/cipher`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      settings: {
        sslCertificateVerification: 'disabled',
        cipherSuiteSelection: 'AES128-SHA:@SECLEVEL=0',
        useServerCipherSuiteDuringHandshake: true
      }
    }, null, { collectTimings: true });
    assert.equal(cipherResult.statusCode, 200);
    assert.equal(cipherResult.tls.cipher.name, 'AES128-SHA');

    await assert.rejects(
      () => sendRequest({
        method: 'GET',
        url: `${cipherServer.baseUrl}/cipher`,
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        settings: {
          sslCertificateVerification: 'disabled',
          cipherSuiteSelection: 'AES256-SHA:@SECLEVEL=0'
        }
      }, null),
      /handshake failure|no shared cipher|EPROTO/i
    );
  } finally {
    await cipherServer.close();
  }
});

test('matches managed client certificates by HTTPS host and port', async (t) => {
  const opensslPath = await findOpenSsl();
  if (!opensslPath) {
    t.skip('OpenSSL is required to generate mTLS test certificates.');
    return;
  }

  const fixtures = await createMtlsFixtures(opensslPath);
  const server = await createMtlsServer(fixtures);
  const port = new URL(server.baseUrl).port;
  const request = {
    method: 'GET',
    url: `${server.baseUrl}/managed-mtls`,
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: '',
    auth: { type: 'none' }
  };

  try {
    const result = await sendRequest(request, null, {
      collectTimings: true,
      tlsSettings: {
        request: {
          caCertificatePath: fixtures.caCertPath,
          clientCertificates: [
            {
              id: 'older-duplicate',
              name: 'Older Duplicate',
              enabled: true,
              host: '127.0.0.1',
              port,
              certPath: '/missing/older-client.crt',
              keyPath: '/missing/older-client.key'
            },
            {
              id: 'managed-cert',
              name: 'Managed Cert',
              enabled: true,
              host: '127.0.0.1',
              port,
              certPath: fixtures.clientCertPath,
              keyPath: fixtures.clientKeyPath
            }
          ]
        }
      }
    });
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).clientCommonName, 'PostMeter Client');
    assert.equal(result.tls.clientCertificateConfigured, true);
    assert.equal(result.tls.clientCertificateId, 'managed-cert');

    const basicAuthResult = await sendRequest({
      ...request,
      auth: {
        type: 'basic',
        username: 'alice',
        password: 'secret'
      }
    }, null, {
      collectTimings: true,
      tlsSettings: {
        request: {
          caCertificatePath: fixtures.caCertPath,
          clientCertificates: [{
            id: 'basic-plus-mtls',
            name: 'Basic Plus mTLS',
            enabled: true,
            host: '127.0.0.1',
            port,
            certPath: fixtures.clientCertPath,
            keyPath: fixtures.clientKeyPath
          }]
        }
      }
    });
    const basicAuthBody = JSON.parse(basicAuthResult.body);
    assert.equal(basicAuthBody.clientCommonName, 'PostMeter Client');
    assert.equal(basicAuthBody.authorization, `Basic ${Buffer.from('alice:secret', 'utf8').toString('base64')}`);
    assert.equal(basicAuthResult.tls.clientCertificateId, 'basic-plus-mtls');

    const explicitSettingsCertificate = await sendRequest({
      ...request,
      auth: {
        type: 'clientCertificate',
        certificateId: 'managed-cert'
      }
    }, null, {
      collectTimings: true,
      tlsSettings: {
        request: {
          caCertificatePath: fixtures.caCertPath,
          clientCertificates: [{
            id: 'managed-cert',
            name: 'Managed Cert',
            enabled: true,
            host: '127.0.0.1',
            port,
            certPath: fixtures.clientCertPath,
            keyPath: fixtures.clientKeyPath
          }]
        }
      }
    });
    assert.equal(explicitSettingsCertificate.statusCode, 200);
    assert.equal(JSON.parse(explicitSettingsCertificate.body).clientCommonName, 'PostMeter Client');
    assert.equal(explicitSettingsCertificate.tls.clientCertificateId, 'managed-cert');
    assert.equal(explicitSettingsCertificate.tls.clientCertificateName, 'Managed Cert');

    await assert.rejects(() => sendRequest(request, null, {
      tlsSettings: {
        request: {
          caCertificatePath: fixtures.caCertPath,
          clientCertificates: [{
            id: 'wrong-port',
            enabled: true,
            host: '127.0.0.1',
            port: String(Number(port) + 1),
            certPath: fixtures.clientCertPath,
            keyPath: fixtures.clientKeyPath
          }]
        }
      }
    }));
  } finally {
    await server.close();
  }
});

test('runs live TLS smoke coverage against public badssl endpoints', async () => {
  const trusted = await sendRequest(liveTlsRequest('https://sha256.badssl.com/'), null, {
    collectTimings: true,
    tlsSettings: {
      request: {
        sslCertificateVerification: true
      }
    }
  });
  assert.equal(trusted.statusCode, 200);
  assert.equal(trusted.tls.authorized, true);

  await assertLiveTlsFailure(
    liveTlsRequest('https://self-signed.badssl.com/'),
    { tlsSettings: { request: { sslCertificateVerification: true } } },
    /DEPTH_ZERO_SELF_SIGNED_CERT|self signed certificate/i
  );

  const selfSigned = await sendRequest(liveTlsRequest('https://self-signed.badssl.com/'), null, {
    tlsSettings: {
      request: {
        sslCertificateVerification: false
      }
    }
  });
  assert.equal(selfSigned.statusCode, 200);
  assert.equal(selfSigned.tls.verificationDisabled, true);

  await assertLiveTlsFailure(
    liveTlsRequest('https://self-signed.badssl.com/', { sslCertificateVerification: 'enabled' }),
    { tlsSettings: { request: { sslCertificateVerification: false } } },
    /DEPTH_ZERO_SELF_SIGNED_CERT|self signed certificate/i
  );

  const requestDisabledOverride = await sendRequest(
    liveTlsRequest('https://self-signed.badssl.com/', { sslCertificateVerification: 'disabled' }),
    null,
    { tlsSettings: { request: { sslCertificateVerification: true } } }
  );
  assert.equal(requestDisabledOverride.statusCode, 200);
  assert.equal(requestDisabledOverride.tls.verificationDisabled, true);

  await assertLiveTlsFailure(
    liveTlsRequest('https://expired.badssl.com/'),
    { tlsSettings: { request: { sslCertificateVerification: true } } },
    /CERT_HAS_EXPIRED|certificate has expired/i
  );

  await assertLiveTlsFailure(
    liveTlsRequest('https://wrong.host.badssl.com/'),
    { tlsSettings: { request: { sslCertificateVerification: true } } },
    /ERR_TLS_CERT_ALTNAME_INVALID|hostname|does not match|altname/i
  );
});

function liveTlsRequest(url, settings = undefined) {
  const request = {
    method: 'GET',
    url,
    queryParams: [],
    headers: [],
    bodyType: 'NONE',
    body: ''
  };
  if (settings) {
    request.settings = settings;
  }
  return request;
}

async function assertLiveTlsFailure(request, options, pattern) {
  await assert.rejects(
    () => sendRequest(request, null, { collectTimings: true, ...(options || {}) }),
    (error) => {
      assert.match(`${error?.code || ''} ${error?.message || error}`, pattern);
      return true;
    }
  );
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

async function createRawHttpServer(rawResponse) {
  const server = net.createServer((socket) => {
    socket.once('data', () => {
      socket.end(rawResponse);
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}/raw`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function findOpenSsl() {
  try {
    await execFileAsync('openssl', ['version']);
    return 'openssl';
  } catch {
    return '';
  }
}

async function createMtlsFixtures(opensslPath) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-mtls-'));
  const caKeyPath = path.join(dir, 'ca.key');
  const caCertPath = path.join(dir, 'ca.crt');
  const serverKeyPath = path.join(dir, 'server.key');
  const serverCsrPath = path.join(dir, 'server.csr');
  const serverCertPath = path.join(dir, 'server.crt');
  const serverExtPath = path.join(dir, 'server.ext');
  const clientKeyPath = path.join(dir, 'client.key');
  const clientEncryptedKeyPath = path.join(dir, 'client-encrypted.key');
  const clientCsrPath = path.join(dir, 'client.csr');
  const clientCertPath = path.join(dir, 'client.crt');
  const clientExtPath = path.join(dir, 'client.ext');
  const clientPfxPath = path.join(dir, 'client.p12');

  await runOpenSsl(opensslPath, ['genrsa', '-out', caKeyPath, '2048'], dir);
  await runOpenSsl(opensslPath, [
    'req', '-x509', '-new', '-nodes', '-key', caKeyPath, '-sha256', '-days', '1',
    '-subj', '/CN=PostMeter Test CA', '-out', caCertPath
  ], dir);

  await runOpenSsl(opensslPath, ['genrsa', '-out', serverKeyPath, '2048'], dir);
  await runOpenSsl(opensslPath, ['req', '-new', '-key', serverKeyPath, '-subj', '/CN=127.0.0.1', '-out', serverCsrPath], dir);
  await fs.writeFile(serverExtPath, 'subjectAltName=IP:127.0.0.1,DNS:localhost\nextendedKeyUsage=serverAuth\n');
  await runOpenSsl(opensslPath, [
    'x509', '-req', '-in', serverCsrPath, '-CA', caCertPath, '-CAkey', caKeyPath, '-CAcreateserial',
    '-out', serverCertPath, '-days', '1', '-sha256', '-extfile', serverExtPath
  ], dir);

  await runOpenSsl(opensslPath, ['genrsa', '-out', clientKeyPath, '2048'], dir);
  await runOpenSsl(opensslPath, ['req', '-new', '-key', clientKeyPath, '-subj', '/CN=PostMeter Client', '-out', clientCsrPath], dir);
  await fs.writeFile(clientExtPath, 'extendedKeyUsage=clientAuth\n');
  await runOpenSsl(opensslPath, [
    'x509', '-req', '-in', clientCsrPath, '-CA', caCertPath, '-CAkey', caKeyPath, '-CAcreateserial',
    '-out', clientCertPath, '-days', '1', '-sha256', '-extfile', clientExtPath
  ], dir);
  await runOpenSsl(opensslPath, [
    'pkcs12', '-export', '-out', clientPfxPath, '-inkey', clientKeyPath, '-in', clientCertPath,
    '-passout', 'pass:secretpass'
  ], dir);
  await runOpenSsl(opensslPath, [
    'rsa', '-aes256', '-in', clientKeyPath, '-out', clientEncryptedKeyPath, '-passout', 'pass:secretpass'
  ], dir);

  return {
    caCertPath,
    clientCertPath,
    clientEncryptedKeyPath,
    clientKeyPath,
    clientPfxPath,
    serverCertPath,
    serverKeyPath
  };
}

async function runOpenSsl(opensslPath, args, cwd) {
  try {
    await execFileAsync(opensslPath, args, { cwd });
  } catch (error) {
    throw new Error(`OpenSSL failed: openssl ${args.join(' ')}\n${error.stderr || error.message}`);
  }
}

async function createMtlsServer(fixtures) {
  const server = https.createServer({
    key: await fs.readFile(fixtures.serverKeyPath),
    cert: await fs.readFile(fixtures.serverCertPath),
    ca: await fs.readFile(fixtures.caCertPath),
    requestCert: true,
    rejectUnauthorized: true
  }, (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const peer = request.socket.getPeerCertificate();
    response.end(JSON.stringify({
      authorized: request.client.authorized,
      authorization: request.headers.authorization || '',
      clientCommonName: peer?.subject?.CN || ''
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `https://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function createTlsServer(fixtures) {
  const server = https.createServer({
    key: await fs.readFile(fixtures.serverKeyPath),
    cert: await fs.readFile(fixtures.serverCertPath)
  }, (_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `https://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function createCustomTlsServer(fixtures, options = {}) {
  const server = https.createServer({
    key: await fs.readFile(fixtures.serverKeyPath),
    cert: await fs.readFile(fixtures.serverCertPath),
    ...options
  }, (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      ok: true,
      cipher: request.socket.getCipher(),
      protocol: request.socket.getProtocol()
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `https://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
