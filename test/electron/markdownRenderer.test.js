const assert = require('node:assert/strict');
const test = require('node:test');
const { renderMarkdown } = require('../../src/renderer/markdownRenderer');

test('markdown renderer supports common markdown blocks and inline formatting', () => {
  const html = renderMarkdown([
    '## Request docs',
    '',
    '- one',
    '- **two**',
    '',
    '```json',
    '{"ok": true}',
    '```'
  ].join('\n'));

  assert.match(html, /<h2>Request docs<\/h2>/);
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /<strong>two<\/strong>/);
  assert.match(html, /<pre><code class="language-json">/);
});

test('markdown renderer escapes raw html and protects links', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[docs](javascript:alert(1)) [safe](https://example.test)');

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /<a href="https:\/\/example\.test" rel="noreferrer">safe<\/a>/);
});
