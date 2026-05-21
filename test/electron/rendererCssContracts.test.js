const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const STYLE_FILES = [
  'src/renderer/styles/theme.css',
  'src/renderer/styles/base.css',
  'src/renderer/styles/chrome.css',
  'src/renderer/styles/editorPanels.css',
  'src/renderer/styles/overlays.css'
];

test('renderer CSS keeps high-contrast theme tokens and visible focus contracts', () => {
  const theme = readStyle('src/renderer/styles/theme.css');
  const base = readStyle('src/renderer/styles/base.css');
  const combined = readStyles();

  assert.match(theme, /:root\[data-theme="dark"\]/);
  assert.match(theme, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(theme, /--surface:\s*Canvas/);
  assert.match(theme, /--text:\s*CanvasText/);
  assert.match(theme, /--primary:\s*Highlight/);
  assert.match(theme, /--danger:\s*Highlight/);
  assert.match(base, /:focus-visible/);
  assert.match(base, /border-color:\s*var\(--primary\)/);
  assert.match(base, /box-shadow:\s*0 0 0 3px rgba\(255,\s*108,\s*55,\s*0\.18\)/);
  assert.match(base, /outline:\s*2px solid Highlight !important/);
  assert.match(base, /:root\[data-forced-colors="active"\]\s+button:focus-visible/);
  assert.match(combined, /\.context-menu button:focus-visible/);
  assert.match(combined, /\.request-tab-close:focus-visible/);
  assert.match(combined, /\.file-picker-dropzone:focus-visible/);
  assert.match(combined, /\.cookie-name-button:focus-visible/);
});

test('renderer CSS keeps stable V1 component selectors and responsive constraints', () => {
  const combined = readStyles();
  for (const selector of [
    '.splitter.vertical',
    '.splitter.horizontal',
    '.body-form-data-row',
    '.graphql-body-grid',
    '.markdown-pane',
    '.runner-execution-grid',
    '.runner-execution-pagination',
    '.runner-execution-row.active',
    '.performance-graphs-dashboard',
    '.performance-results-resize',
    '.context-menu',
    '.context-submenu',
    '.cookie-manager-error',
    '.file-picker-dropzone',
    '.modal[hidden]'
  ]) {
    assert.match(combined, new RegExp(escapeRegExp(selector)), `Missing CSS contract selector ${selector}`);
  }

  assert.match(combined, /@media\s*\(max-width:\s*1100px\)/);
  assert.match(combined, /minmax\(/);
  assert.match(combined, /overflow:\s*auto/);
  assert.doesNotMatch(combined, /letter-spacing:\s*-/);
});

function readStyles() {
  return STYLE_FILES.map(readStyle).join('\n');
}

function readStyle(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
