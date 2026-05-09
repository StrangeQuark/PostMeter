const assert = require('node:assert/strict');
const test = require('node:test');
const {
  highlightVariableTokens
} = require('../../src/renderer/variableHighlighter');

test('variable highlighter marks Postman-style variable tokens', () => {
  const html = highlightVariableTokens('https://{{baseUrl}}/users?token={{ token }}', {
    variables: [
      { enabled: true, key: 'baseUrl', value: 'https://api.example.test' },
      { enabled: true, key: 'token', value: 'secret' }
    ]
  });
  assert.match(html, /class="variable-highlight-token variable-highlight-valid"/);
  assert.match(html, /data-variable-name="baseUrl"/);
  assert.match(html, /data-variable-name="token"/);
  assert.match(html, /data-variable-status="valid"/);
  assert.match(html, /variable-highlight-valid/);
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
});
