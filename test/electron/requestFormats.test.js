const assert = require('node:assert/strict');
const test = require('node:test');
const {
  exportRequestByFormat,
  exportRequestToJson,
  importRequestFromText
} = require('../../src/core/requestFormats');

test('exports and imports a single PostMeter request envelope', () => {
  const original = {
    id: 'request-1',
    name: 'Create Widget',
    method: 'POST',
    url: 'https://api.example.test/widgets',
    queryParams: [{ enabled: true, key: 'trace', value: 'yes' }],
    headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
    bodyType: 'RAW_JSON',
    body: '{"name":"hammer"}',
    auth: { type: 'none' },
    scripts: { preRequest: '', tests: '' }
  };

  const exported = exportRequestToJson(original);
  const parsed = JSON.parse(exported);
  assert.equal(parsed.format, 'postmeter.request');
  assert.equal(parsed.request.name, 'Create Widget');

  const imported = importRequestFromText(exported);
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.name, 'Create Widget');
  assert.equal(imported.method, 'POST');
  assert.equal(imported.queryParams[0].key, 'trace');
  assert.equal(imported.body, '{"name":"hammer"}');
});

test('imports raw PostMeter request JSON and curl command text as single requests', () => {
  const rawImported = importRequestFromText(JSON.stringify({
    name: 'Raw Request',
    method: 'PATCH',
    url: 'https://api.example.test/widgets/1',
    bodyType: 'RAW_TEXT',
    body: 'ok'
  }));
  assert.equal(rawImported.name, 'Raw Request');
  assert.equal(rawImported.method, 'PATCH');

  const curlImported = importRequestFromText("# Request: Health\ncurl -H 'X-Test: yes' 'https://api.example.test/health?ready=1'");
  assert.equal(curlImported.method, 'GET');
  assert.equal(curlImported.url, 'https://api.example.test/health');
  assert.equal(curlImported.queryParams[0].key, 'ready');
  assert.equal(curlImported.headers[0].key, 'X-Test');
});

test('single request curl exports include warning comments for unsupported request behavior', () => {
  const exported = exportRequestByFormat({
    name: 'Scripted Request',
    method: 'POST',
    url: 'https://api.example.test/widgets',
    headers: [],
    bodyType: 'RAW_JSON',
    body: '{"ok":true}',
    auth: { type: 'bearer', token: '{{token}}' },
    assertions: [{ enabled: true, type: 'statusCode', expected: '200' }],
    scripts: {
      preRequest: 'pm.environment.set("token", "abc");',
      tests: 'pm.test("ok", function () {});'
    },
    cookieJar: { enabled: true, storeResponses: true },
    variables: [{ enabled: true, key: 'localValue', value: 'yes' }]
  }, 'curl');

  assert.match(exported, /^# Request: Scripted Request\n/);
  assert.match(exported, /WARNING: Pre-request scripts are not included/);
  assert.match(exported, /WARNING: Post-request scripts are not included/);
  assert.match(exported, /WARNING: Assertions are not included/);
  assert.match(exported, /curl 'https:\/\/api\.example\.test\/widgets'/);
  assert.match(exported, /--data-raw '\{"ok":true\}'/);
});

test('request import rejects unsupported content', () => {
  assert.throws(
    () => importRequestFromText('not a request'),
    /Request import must be a curl command or PostMeter request JSON/
  );
  assert.throws(
    () => importRequestFromText(JSON.stringify({ format: 'postmeter.collection', collections: [] })),
    /must contain a request object/
  );
});
