const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');
const { buildUrl, loadClientCertificateOptions, sendRequest, validateRequest } = require('../../src/core/httpClient');

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

test('sends user-bound file and multipart Postman bodies without arbitrary path reads', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-attachments-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const rawPath = path.join(dir, 'raw-upload.txt');
  const partPath = path.join(dir, 'part-upload.json');
  const unknownPartPath = path.join(dir, 'part-upload.customext');
  await fs.writeFile(rawPath, 'BOUND_RAW');
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
    assert.match(observed[1].contentType, /^multipart\/form-data; boundary=/);
    assert.match(observed[1].body, /name="note"\r\n\r\nhello/);
    assert.match(observed[1].body, /filename="part-upload.json"/);
    assert.match(observed[1].body, /Content-Type: application\/json/);
    assert.match(observed[1].body, /BOUND_PART/);
    assert.match(observed[2].body, /filename="part-upload.customext"/);
    assert.match(observed[2].body, /Content-Type: application\/octet-stream/);
    assert.match(observed[2].body, /BOUND_UNKNOWN_PART/);
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
      }, null)
    );
  } finally {
    await server.close();
  }
});

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
