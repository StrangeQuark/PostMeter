const assert = require('node:assert/strict');
const test = require('node:test');
const {
  highlightVariableTokens
} = require('../../src/renderer/variableHighlighter');

test('variable highlighter marks Postman-style variable tokens', () => {
  const html = highlightVariableTokens('https://{{baseUrl}}/users?token={{ token }}&url=${ requestUrl }', {
    variables: [
      { enabled: true, key: 'baseUrl', source: 'environment', value: 'https://api.example.test' },
      { enabled: true, key: 'token', source: 'environment', value: 'secret' },
      { enabled: true, key: 'requestUrl', source: 'csv', value: 'https://csv.example.test' }
    ]
  });
  assert.match(html, /class="variable-highlight-token variable-highlight-valid variable-highlight-environment"/);
  assert.match(html, /class="variable-highlight-token variable-highlight-valid variable-highlight-csv"/);
  assert.match(html, /data-variable-name="baseUrl"/);
  assert.match(html, /data-variable-name="token"/);
  assert.match(html, /data-variable-name="requestUrl"/);
  assert.match(html, /data-variable-status="valid"/);
  assert.match(html, /data-variable-source="csv"/);
  assert.match(html, /variable-highlight-valid/);
});

test('variable highlighter validates dollar tokens only against CSV variables', () => {
  const html = highlightVariableTokens('{{requestUrl}} ${baseUrl} ${requestUrl}', {
    variables: [
      { enabled: true, key: 'baseUrl', source: 'environment', value: 'https://api.example.test' },
      { enabled: true, key: 'requestUrl', source: 'csv', value: 'https://csv.example.test' }
    ]
  });

  assert.match(html, /data-variable-name="requestUrl" data-variable-status="invalid" data-variable-source="environment"/);
  assert.match(html, /data-variable-name="baseUrl" data-variable-status="invalid" data-variable-source="csv"/);
  assert.match(html, /data-variable-name="requestUrl" data-variable-status="valid" data-variable-source="csv"/);
});

test('variable highlighter marks request and collection variables with their winning sources', () => {
  const html = highlightVariableTokens('{{baseUrl}} {{envOnly}} {{collectionOnly}}', {
    variables: [
      { enabled: true, key: 'baseUrl', source: 'request', value: 'https://request.example.test' },
      { enabled: true, key: 'envOnly', source: 'environment', value: 'https://env.example.test' },
      { enabled: true, key: 'collectionOnly', source: 'collection', value: 'collection-value' }
    ]
  });

  assert.match(html, /data-variable-name="baseUrl" data-variable-status="valid" data-variable-source="request"/);
  assert.match(html, /class="variable-highlight-token variable-highlight-valid variable-highlight-request"/);
  assert.match(html, /data-variable-name="envOnly" data-variable-status="valid" data-variable-source="environment"/);
  assert.match(html, /class="variable-highlight-token variable-highlight-valid variable-highlight-environment"/);
  assert.match(html, /data-variable-name="collectionOnly" data-variable-status="valid" data-variable-source="collection"/);
  assert.match(html, /class="variable-highlight-token variable-highlight-valid variable-highlight-collection"/);
});

test('variable highlighter marks unknown or disabled variable tokens as invalid', () => {
  const html = highlightVariableTokens('{{known}} {{missing}} {{ disabled }} {{bad name}}', {
    variables: [
      { enabled: true, key: 'known', value: 'value' },
      { enabled: false, key: 'disabled', value: 'hidden' }
    ]
  });
  assert.match(html, /data-variable-name="known" data-variable-status="valid"/);
  assert.match(html, /data-variable-name="missing" data-variable-status="invalid"/);
  assert.match(html, /data-variable-name="disabled" data-variable-status="invalid"/);
  assert.match(html, /data-variable-name="bad name" data-variable-status="invalid"/);
  assert.match(html, /variable-highlight-invalid/);
});

test('variable highlighter escapes regular text and variable names', () => {
  const html = highlightVariableTokens('<x>{{base&Url}}</x>');
  assert.match(html, /&lt;x&gt;/);
  assert.match(html, /data-variable-name="base&amp;Url"/);
  assert.match(html, />\{\{base&amp;Url\}\}<\/span>/);
  assert.doesNotMatch(html, /<x>/);
});

test('variable highlighter ignores empty and multiline tokens', () => {
  assert.doesNotMatch(highlightVariableTokens('{{ }}'), /variable-highlight-token/);
  assert.doesNotMatch(highlightVariableTokens('{{one\ntwo}}'), /variable-highlight-token/);
  assert.doesNotMatch(highlightVariableTokens('${one\ntwo}'), /variable-highlight-token/);
});
