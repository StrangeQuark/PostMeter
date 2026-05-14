const assert = require('node:assert/strict');
const test = require('node:test');
const VariableHighlighter = require('../../src/renderer/variableHighlighter');
const {
  codeEditorLineNumbersEnabled,
  editTextForKey,
  highlightCode,
  lineNumbersForText,
  setLineNumbersEnabled,
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

test('code editor completes JavaScript block comments and expands them on Enter', () => {
  const paired = editTextForKey({
    key: '*',
    language: 'javascript',
    selectionEnd: 1,
    selectionStart: 1,
    value: '/'
  });
  assert.equal(paired.value, '/**/');
  assert.equal(paired.selectionStart, 2);
  assert.equal(paired.selectionEnd, 2);

  const expanded = editTextForKey({
    key: 'Enter',
    language: 'javascript',
    selectionEnd: paired.selectionEnd,
    selectionStart: paired.selectionStart,
    value: paired.value
  });
  assert.equal(expanded.value, '/*\n * \n */');
  assert.equal(expanded.selectionStart, '/*\n * '.length);
  assert.equal(expanded.selectionEnd, expanded.selectionStart);
});

test('code editor auto-pairs GraphQL delimiters like raw code editors', () => {
  assert.equal(normalizeLanguage('graphql'), 'graphql');
  const value = 'query GetUser ';
  const paired = editTextForKey({
    key: '{',
    language: 'graphql',
    selectionEnd: value.length,
    selectionStart: value.length,
    value
  });
  assert.equal(paired.value, 'query GetUser {}');
  assert.equal(paired.selectionStart, value.length + 1);

  const expanded = editTextForKey({
    key: 'Enter',
    language: 'graphql',
    selectionEnd: paired.selectionEnd,
    selectionStart: paired.selectionStart,
    value: paired.value
  });
  assert.equal(expanded.value, 'query GetUser {\n\t\n}');
});

test('code editor auto-closes HTML tags and expands matching tag pairs on Enter', () => {
  assert.equal(normalizeLanguage('html'), 'html');
  const paired = editTextForKey({
    key: '>',
    language: 'html',
    selectionEnd: '<div class="card"'.length,
    selectionStart: '<div class="card"'.length,
    value: '<div class="card"'
  });
  assert.equal(paired.value, '<div class="card"></div>');
  assert.equal(paired.selectionStart, '<div class="card">'.length);
  assert.equal(paired.selectionEnd, paired.selectionStart);

  const expanded = editTextForKey({
    key: 'Enter',
    language: 'html',
    selectionEnd: paired.selectionEnd,
    selectionStart: paired.selectionStart,
    value: paired.value
  });
  assert.equal(expanded.value, '<div class="card">\n\t\n</div>');
  assert.equal(expanded.selectionStart, '<div class="card">\n\t'.length);

  const removedClosingTag = editTextForKey({
    key: 'Backspace',
    language: 'html',
    selectionEnd: '<div class="card">'.length,
    selectionStart: '<div class="card">'.length,
    value: paired.value
  });
  assert.equal(removedClosingTag.value, '<div class="card"');
  assert.equal(removedClosingTag.selectionStart, '<div class="card"'.length);
});

test('code editor applies HTML-specific tag completion exclusions', () => {
  assert.equal(editTextForKey({
    key: '>',
    language: 'html',
    selectionEnd: '<input'.length,
    selectionStart: '<input'.length,
    value: '<input'
  }).handled, false);
  assert.equal(editTextForKey({
    key: '>',
    language: 'html',
    selectionEnd: '</section'.length,
    selectionStart: '</section'.length,
    value: '</section'
  }).handled, false);
  assert.equal(editTextForKey({
    key: '>',
    language: 'html',
    selectionEnd: '<!doctype html'.length,
    selectionStart: '<!doctype html'.length,
    value: '<!doctype html'
  }).handled, false);
  assert.equal(editTextForKey({
    key: '>',
    language: 'html',
    selectionEnd: '<section /'.length,
    selectionStart: '<section /'.length,
    value: '<section /'
  }).handled, false);
});

test('code editor auto-closes XML tags without HTML void-element shortcuts', () => {
  assert.equal(normalizeLanguage('xml'), 'xml');
  const paired = editTextForKey({
    key: '>',
    language: 'xml',
    selectionEnd: '<input'.length,
    selectionStart: '<input'.length,
    value: '<input'
  });
  assert.equal(paired.value, '<input></input>');
  assert.equal(paired.selectionStart, '<input>'.length);

  const selfClosing = editTextForKey({
    key: '>',
    language: 'xml',
    selectionEnd: '<input /'.length,
    selectionStart: '<input /'.length,
    value: '<input /'
  });
  assert.equal(selfClosing.handled, false);

  const caseSensitive = editTextForKey({
    key: 'Enter',
    language: 'xml',
    selectionEnd: '<User>'.length,
    selectionStart: '<User>'.length,
    value: '<User></user>'
  });
  assert.equal(caseSensitive.handled, false);
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
  assert.equal(normalizeLanguage('markup'), 'markup');
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
  assert.match(highlightCode('<div class="card"></div>', 'html'), /tok-key/);
  assert.match(highlightCode('<root><item \\/><\\/root>', 'xml'), /tok-key/);
  assert.match(highlightCode('content-type: application\\/json', 'headers'), /tok-key/);
  assert.match(highlightCode('https://{{baseUrl}}/users/{{missing}}', 'text'), /tok-variable-valid/);
  assert.match(highlightCode('https://{{baseUrl}}/users/{{missing}}', 'text'), /tok-variable-invalid/);
  assert.match(highlightCode('pm.sendRequest("{{baseUrl}}")', 'javascript'), /data-variable-name="baseUrl" data-variable-status="valid"/);
  VariableHighlighter.setVariableSource(() => []);
});

test('code editor generates logical line numbers and toggles the global setting', () => {
  assert.equal(lineNumbersForText(''), '1');
  assert.equal(lineNumbersForText('one\ntwo\n'), '1\n2\n3');
  assert.equal(setLineNumbersEnabled(false, null), false);
  assert.equal(codeEditorLineNumbersEnabled(), false);
  assert.equal(setLineNumbersEnabled(true, null), true);
  assert.equal(codeEditorLineNumbersEnabled(), true);
});
