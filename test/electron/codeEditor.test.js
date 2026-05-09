const assert = require('node:assert/strict');
const test = require('node:test');
const VariableHighlighter = require('../../src/renderer/variableHighlighter');
const {
  editTextForKey,
  highlightCode,
  normalizeLanguage
} = require('../../src/renderer/codeEditor');

test('code editor Tab inserts indentation instead of yielding focus', () => {
  const value = '{\n  "a"';
  assert.deepEqual(editTextForKey({
    key: 'Tab',
    language: 'json',
    selectionEnd: value.length,
    selectionStart: value.length,
    value
  }), {
    handled: true,
    selectionEnd: value.length + 1,
    selectionStart: value.length + 1,
    value: '{\n  "a"\t'
  });
});

test('code editor indents and outdents selected lines', () => {
  const indented = editTextForKey({
    key: 'Tab',
    selectionEnd: 'one\ntwo'.length,
    selectionStart: 0,
    value: 'one\ntwo'
  });
  assert.equal(indented.value, '\tone\n\ttwo');
  assert.equal(indented.selectionStart, 1);
  assert.equal(indented.selectionEnd, 9);

  const outdented = editTextForKey({
    key: 'Tab',
    selectionEnd: indented.value.length,
    selectionStart: 0,
    shiftKey: true,
    value: indented.value
  });
  assert.equal(outdented.value, 'one\ntwo');
  assert.equal(outdented.selectionStart, 0);
  assert.equal(outdented.selectionEnd, 7);
});

test('code editor auto-pairs JavaScript delimiters and expands paired braces on Enter', () => {
  const value = 'pm.test("x", () => ';
  const paired = editTextForKey({
    key: '{',
    language: 'javascript',
    selectionEnd: value.length,
    selectionStart: value.length,
    value
  });
  assert.equal(paired.value, 'pm.test("x", () => {}');
  assert.equal(paired.selectionStart, value.length + 1);
  assert.equal(paired.selectionEnd, value.length + 1);

  const expanded = editTextForKey({
    key: 'Enter',
    language: 'javascript',
    selectionEnd: paired.selectionEnd,
    selectionStart: paired.selectionStart,
    value: paired.value
  });
  assert.equal(expanded.value, 'pm.test("x", () => {\n\t\n}');
  assert.equal(expanded.selectionStart, 'pm.test("x", () => {\n\t'.length);
  assert.equal(expanded.selectionEnd, expanded.selectionStart);
});

test('code editor wraps selections and skips over existing closing characters', () => {
  const wrapped = editTextForKey({
    key: '"',
    language: 'json',
    selectionEnd: 7,
    selectionStart: 2,
    value: '{ value }'
  });
  assert.equal(wrapped.value, '{ "value" }');
  assert.equal(wrapped.selectionStart, 3);
  assert.equal(wrapped.selectionEnd, 8);

  const skipped = editTextForKey({
    key: '}',
    language: 'json',
    selectionEnd: 9,
    selectionStart: 9,
    value: '{ "a": 1 }'
  });
  assert.equal(skipped.value, '{ "a": 1 }');
  assert.equal(skipped.selectionStart, 10);
});

test('code editor keeps pairing limited to code-like languages', () => {
  assert.equal(normalizeLanguage('js'), 'javascript');
  assert.equal(normalizeLanguage('http-headers'), 'headers');
  assert.equal(editTextForKey({
    key: '{',
    language: 'text',
    selectionEnd: 0,
    selectionStart: 0,
    value: ''
  }).handled, false);
});

test('code editor highlights JavaScript, JSON, and header text', () => {
  VariableHighlighter.setVariableSource(() => [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }]);
  assert.match(highlightCode('pm.test("ok", function () {})', 'javascript'), /tok-builtin/);
  assert.match(highlightCode('pm.test("ok", function () {})', 'javascript'), /tok-keyword/);
  assert.match(highlightCode('{ "probe": true }', 'json'), /tok-key/);
  assert.match(highlightCode('content-type: application\\/json', 'headers'), /tok-key/);
  assert.match(highlightCode('https://{{baseUrl}}/users/{{missing}}', 'text'), /tok-variable-valid/);
  assert.match(highlightCode('https://{{baseUrl}}/users/{{missing}}', 'text'), /tok-variable-invalid/);
  assert.match(highlightCode('pm.sendRequest("{{baseUrl}}")', 'javascript'), /data-variable-name="baseUrl" data-variable-status="valid"/);
  VariableHighlighter.setVariableSource(() => []);
});
