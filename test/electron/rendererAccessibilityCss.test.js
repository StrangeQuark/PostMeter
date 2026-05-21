const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const STYLE_FILES = [
  'src/renderer/styles/theme.css',
  'src/renderer/styles/base.css',
  'src/renderer/styles/styles.css',
  'src/renderer/styles/chrome.css',
  'src/renderer/styles/editorPanels.css',
  'src/renderer/styles/overlays.css'
];

test('renderer CSS provides a reduced-motion policy for animations and transitions', () => {
  const css = STYLE_FILES.map((filePath) => fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf8')).join('\n');
  const reducedMotionBlocks = [...css.matchAll(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/g)]
    .map((match) => match[1]);

  assert.ok(reducedMotionBlocks.length > 0, 'Expected a prefers-reduced-motion: reduce media query');
  const reducedMotionCss = reducedMotionBlocks.join('\n');
  assert.match(reducedMotionCss, /animation-duration\s*:\s*0\.001ms\s*!important/);
  assert.match(reducedMotionCss, /animation-iteration-count\s*:\s*1\s*!important/);
  assert.match(reducedMotionCss, /transition-duration\s*:\s*0\.001ms\s*!important/);
  assert.match(reducedMotionCss, /scroll-behavior\s*:\s*auto\s*!important/);
});

test('renderer CSS motion declarations are covered by the reduced-motion contract', () => {
  const motionDeclarations = [];
  for (const filePath of STYLE_FILES) {
    const css = fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf8');
    const declarations = css
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => /^(animation|transition)\s*:/.test(line));
    for (const declaration of declarations) {
      motionDeclarations.push(`${filePath}:${declaration.number}: ${declaration.line}`);
    }
  }

  assert.deepEqual(motionDeclarations, [
    'src/renderer/styles/chrome.css:393: transition: background 120ms ease;',
    'src/renderer/styles/overlays.css:714: transition: top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease;',
    'src/renderer/styles/overlays.css:891: animation: performance-calibration-spin 0.85s linear infinite;',
    'src/renderer/styles/overlays.css:1064: transition: transform 0.12s ease;',
    'src/renderer/styles/overlays.css:1351: transition: transform 120ms ease;'
  ]);
});
