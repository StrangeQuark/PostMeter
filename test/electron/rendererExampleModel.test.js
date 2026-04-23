const assert = require('node:assert/strict');
const test = require('node:test');
const {
  exampleFromResponse,
  exampleHeadersToText,
  formatExampleBody,
  looksLikeJson,
  newExampleObject,
  parseHeadersText
} = require('../../src/renderer/exampleModel');

test('renderer example model formats JSON bodies and header text predictably', () => {
  assert.equal(formatExampleBody({ bodyType: 'RAW_JSON', body: '{"ok":true}' }), '{\n  "ok": true\n}');
  assert.equal(formatExampleBody({ bodyType: 'RAW_TEXT', body: 'plain' }), 'plain');
  assert.equal(exampleHeadersToText([
    { enabled: true, key: 'Accept', value: 'application/json' },
    { enabled: false, key: 'X-Off', value: 'no' }
  ]), 'Accept: application/json');
  assert.deepEqual(parseHeadersText('Accept: application/json\nX-Flag'), [
    { enabled: true, key: 'Accept', value: 'application/json' },
    { enabled: true, key: 'X-Flag', value: '' }
  ]);
});

test('renderer example model creates unique examples from defaults and responses', () => {
  const originalRandomUuid = globalThis.crypto?.randomUUID;
  globalThis.crypto ||= {};
  globalThis.crypto.randomUUID = () => 'example-id';
  try {
    assert.equal(newExampleObject({ existingNames: ['Example Response'] }).name, 'Example Response 2');
    const example = exampleFromResponse({
      statusCode: 201,
      headers: { 'content-type': ['application/json'] },
      body: '{"created":true}'
    }, { existingNames: [] });
    assert.equal(example.id, 'example-id');
    assert.equal(example.name, 'Response 201');
    assert.equal(example.bodyType, 'RAW_JSON');
    assert.equal(looksLikeJson(example.body), true);
  } finally {
    globalThis.crypto.randomUUID = originalRandomUuid;
  }
});
