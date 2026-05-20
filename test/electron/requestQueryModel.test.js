const assert = require('node:assert/strict');
const test = require('node:test');
const {
  queryParamsFromUrl,
  urlQueryMatchesPairs,
  urlWithQueryParams
} = require('../../src/core/workspace/requestQueryModel');

test('query params are parsed from URL text while preserving order and duplicates', () => {
  assert.deepEqual(queryParamsFromUrl('google.com?tag=one&tag=two&empty='), [
    { enabled: true, key: 'tag', value: 'one' },
    { enabled: true, key: 'tag', value: 'two' },
    { enabled: true, key: 'empty', value: '' }
  ]);
});

test('URL text is rebuilt from enabled params before hash fragments', () => {
  const url = urlWithQueryParams('https://api.example.test/search?old=1#section', [
    { enabled: true, key: 'q', value: 'alpha beta' },
    { enabled: false, key: 'disabled', value: 'nope' },
    { enabled: true, key: 'token', value: '{{apiToken}}' },
    { enabled: true, key: 'csvUrl', value: '${requestUrl}' }
  ]);

  assert.equal(url, 'https://api.example.test/search?q=alpha%20beta&token={{apiToken}}&csvUrl=${requestUrl}#section');
});

test('URL query matching compares only enabled structured params', () => {
  assert.equal(urlQueryMatchesPairs('https://api.example.test/search?q=alpha&empty=', [
    { enabled: true, key: 'q', value: 'alpha' },
    { enabled: false, key: 'ignored', value: 'value' },
    { enabled: true, key: 'empty', value: '' }
  ]), true);
  assert.equal(urlQueryMatchesPairs('https://api.example.test/search?q=alpha', [
    { enabled: true, key: 'q', value: 'beta' }
  ]), false);
});
