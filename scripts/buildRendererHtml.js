#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  appRendererAssetPathFromScriptSrc,
  APP_RENDERER_CORE_ASSET_PATHS,
  APP_RENDERER_CSP
} = require('../electron/app-shell/rendererAssetManifest');

const PROJECT_ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(PROJECT_ROOT, 'src', 'renderer', 'index.html');
const HTML_ROOT = path.join(PROJECT_ROOT, 'src', 'renderer', 'html');
const MANIFEST_PATH = path.join(HTML_ROOT, 'manifest.json');

const SEEDED_PARTS = Object.freeze([
  { path: 'shell/head-and-topbar.html', startLine: 1, endLine: 75 },
  { path: 'shell/sidebar-and-workspace-open.html', startLine: 76, endLine: 147 },
  { path: 'panels/collection.html', startLine: 148, endLine: 203 },
  { path: 'panels/folder.html', startLine: 204, endLine: 259 },
  { path: 'panels/request.html', startLine: 260, endLine: 1151 },
  { path: 'panels/environment-workspace.html', startLine: 1152, endLine: 1199 },
  { path: 'panels/runner.html', startLine: 1200, endLine: 1432 },
  { path: 'panels/performance.html', startLine: 1433, endLine: 2628 },
  { path: 'panels/results-and-main-close.html', startLine: 2629, endLine: 2694 },
  { path: 'modals/settings.html', startLine: 2695, endLine: 3007 },
  { path: 'modals/workflow.html', startLine: 3008, endLine: 3192 },
  { path: 'modals/input-security.html', startLine: 3193, endLine: 3463 },
  { path: 'overlays/context-and-tutorial.html', startLine: 3464, endLine: 3483 },
  { path: 'scripts.html', startLine: 3484, endLine: 3523 }
]);

function main() {
  const flag = process.argv[2] || '--check';
  if (flag === '--extract') {
    extractSeedParts();
    return;
  }
  if (flag === '--write') {
    writeIndex();
    return;
  }
  if (flag === '--check') {
    checkIndex();
    return;
  }
  if (flag === '--list') {
    console.log(readManifest().join('\n'));
    return;
  }
  console.error('Usage: node scripts/buildRendererHtml.js [--check|--write|--extract|--list]');
  process.exit(2);
}

function extractSeedParts() {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');
  const lines = source.match(/^.*(?:\n|$)/gm) || [];
  const manifest = SEEDED_PARTS.map((part) => part.path);
  for (const part of SEEDED_PARTS) {
    const content = lines.slice(part.startLine - 1, part.endLine).join('');
    const target = path.join(HTML_ROOT, part.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Extracted ${manifest.length} renderer HTML partials.`);
}

function writeIndex() {
  const next = assembleRendererHtml();
  fs.writeFileSync(INDEX_PATH, next);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, INDEX_PATH)} from renderer HTML partials.`);
}

function checkIndex(options = {}) {
  const expected = assembleRendererHtml(options);
  const actual = fs.readFileSync(options.indexPath || INDEX_PATH, 'utf8');
  if (actual !== expected) {
    const message = 'src/renderer/index.html is out of date. Run npm run renderer:html:write.';
    if (options.exitOnMismatch === false) {
      throw new Error(message);
    }
    console.error(message);
    process.exit(1);
  }
  validateRendererSecurityAndAssets(actual);
  console.log('Renderer HTML partials match src/renderer/index.html.');
  return true;
}

function assembleRendererHtml(options = {}) {
  const htmlRoot = options.htmlRoot || HTML_ROOT;
  return readManifest(options)
    .map((relativePath) => {
      const filePath = path.join(htmlRoot, relativePath);
      assertInsideHtmlRoot(filePath, htmlRoot);
      return fs.readFileSync(filePath, 'utf8');
    })
    .join('');
}

function readManifest(options = {}) {
  const parsed = JSON.parse(fs.readFileSync(options.manifestPath || MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('Renderer HTML manifest must be a non-empty array.');
  }
  const seen = new Set();
  return parsed.map((value) => {
    const relativePath = String(value || '');
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.split('/').includes('..')) {
      throw new Error(`Invalid renderer HTML partial path: ${relativePath}`);
    }
    if (seen.has(relativePath)) {
      throw new Error(`Duplicate renderer HTML partial path: ${relativePath}`);
    }
    seen.add(relativePath);
    return relativePath;
  });
}

function assertInsideHtmlRoot(filePath, htmlRoot = HTML_ROOT) {
  const relative = path.relative(htmlRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Renderer HTML partial escapes html root: ${filePath}`);
  }
}

function validateRendererSecurityAndAssets(rendererHtml) {
  const cspMatch = rendererHtml.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  if (!cspMatch || cspMatch[1] !== APP_RENDERER_CSP) {
    throw new Error('Renderer Content-Security-Policy meta tag must match the app protocol policy.');
  }
  const coreAssetPaths = [...rendererHtml.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map((match) => appRendererAssetPathFromScriptSrc(match[1]))
    .filter((assetPath) => assetPath.startsWith('/src/core/'));
  assertSameSet(
    coreAssetPaths,
    APP_RENDERER_CORE_ASSET_PATHS,
    'Renderer core browser scripts must match the app protocol core asset manifest.'
  );
}

function assertSameSet(actual, expected, message) {
  const actualSorted = [...new Set(actual)].sort();
  const expectedSorted = [...new Set(expected)].sort();
  if (actualSorted.length !== expectedSorted.length
    || actualSorted.some((value, index) => value !== expectedSorted[index])) {
    throw new Error(`${message}\nExpected: ${expectedSorted.join(', ')}\nActual: ${actualSorted.join(', ')}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  assembleRendererHtml,
  assertInsideHtmlRoot,
  checkIndex,
  readManifest,
  validateRendererSecurityAndAssets
};
