const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { sendRequest, validateRequest } = require('../../src/core/httpClient');

test('validates URL, scheme, method, and header names before sending', () => {
  assert.deepEqual(validateRequest({ method: 'GET', url: '' }, null), ['Request URL is required.']);
  assert.deepEqual(validateRequest({ method: 'GET', url: 'file:///tmp/example' }, null), ['Only http and https URLs are supported.']);
  assert.deepEqual(validateRequest({ method: 'TRACE', url: 'https://example.test' }, null), ['Unsupported HTTP method: TRACE.']);
  assert.deepEqual(
    validateRequest({ method: 'GET', url: 'https://example.test', headers: [{ enabled: true, key: 'Bad Header', value: 'x' }] }, null),
    ['Invalid header name: Bad Header.']
  );
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
