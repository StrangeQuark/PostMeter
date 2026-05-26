#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_RENDERER_ROOT = path.join(PROJECT_ROOT, 'src', 'renderer');
const ALLOW_COMMENT = 'postmeter-security-allow-html:';
const MAX_ALLOW_COMMENT_DISTANCE = 3;
const SKIPPED_PATH_PARTS = new Set(['vendor']);

const SINK_PATTERNS = [
  { id: 'innerHTML', pattern: /\binnerHTML\s*=/ },
  { id: 'outerHTML', pattern: /\bouterHTML\b/ },
  { id: 'insertAdjacentHTML', pattern: /\binsertAdjacentHTML\s*\(/ },
  { id: 'document.write', pattern: /\bdocument\s*\.\s*write\s*\(/ },
  { id: 'eval', pattern: /\beval\s*\(/ },
  { id: 'new Function', pattern: /\bnew\s+Function\s*\(/ },
  { id: 'setTimeout-string', pattern: /\bsetTimeout\s*\(\s*(['"`])/ },
  { id: 'setInterval-string', pattern: /\bsetInterval\s*\(\s*(['"`])/ },
  { id: 'javascript-url', pattern: /['"`]\s*javascript:/i },
  { id: 'unsafe-href-assignment', pattern: /\.\s*href\s*=\s*(?!['"`](?:https?:|mailto:|#|\/))/i }
];

function main(argv = process.argv.slice(2)) {
  const roots = argv.length ? argv.map((value) => path.resolve(PROJECT_ROOT, value)) : [DEFAULT_RENDERER_ROOT];
  const findings = validateRendererSecurity({ roots });
  if (findings.length) {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: ${finding.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Renderer security sink validation passed.');
}

function validateRendererSecurity(options = {}) {
  const roots = options.roots || [DEFAULT_RENDERER_ROOT];
  const files = roots.flatMap((root) => collectJavaScriptFiles(root));
  const findings = [];
  for (const filePath of files) {
    const relativePath = relative(filePath);
    if (shouldSkipPath(relativePath)) {
      continue;
    }
    const source = fs.readFileSync(filePath, 'utf8');
    if (relativePath.endsWith('formatting/markdownRenderer.js') && !markdownRawHtmlDisabled(source)) {
      findings.push({
        file: relativePath,
        line: 1,
        message: 'Markdown renderer must keep markdown-it raw HTML disabled with html: false.'
      });
    }
    findings.push(...scanRendererSource(relativePath, source));
  }
  return findings;
}

function collectJavaScriptFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return isJavaScriptFile(root) ? [root] : [];
  }
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(entryPath));
    } else if (entry.isFile() && isJavaScriptFile(entryPath)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function isJavaScriptFile(filePath) {
  return /\.(?:cjs|mjs|js)$/.test(filePath);
}

function shouldSkipPath(relativePath) {
  return relativePath.split(/[\\/]/).some((part) => SKIPPED_PATH_PARTS.has(part));
}

function scanRendererSource(relativePath, source) {
  const lines = String(source || '').split(/\r?\n/);
  const findings = [];
  for (const [index, line] of lines.entries()) {
    const stripped = stripTrailingComment(line);
    for (const sink of SINK_PATTERNS) {
      if (!sink.pattern.test(stripped)) {
        continue;
      }
      if (hasAllowComment(lines, index)) {
        continue;
      }
      findings.push({
        file: relativePath,
        line: index + 1,
        sink: sink.id,
        message: `${sink.id} requires a nearby ${ALLOW_COMMENT} justification.`
      });
    }
  }
  return findings;
}

function hasAllowComment(lines, index) {
  const start = Math.max(0, index - MAX_ALLOW_COMMENT_DISTANCE);
  for (let cursor = index; cursor >= start; cursor -= 1) {
    const line = String(lines[cursor] || '');
    if (line.includes(ALLOW_COMMENT) && line.split(ALLOW_COMMENT)[1]?.trim()) {
      return true;
    }
  }
  return false;
}

function stripTrailingComment(line) {
  const value = String(line || '');
  const commentIndex = value.indexOf('//');
  return commentIndex >= 0 ? value.slice(0, commentIndex) : value;
}

function markdownRawHtmlDisabled(source) {
  return /html:\s*false/.test(source) && !/html:\s*true/.test(source);
}

function relative(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replaceAll(path.sep, '/');
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOW_COMMENT,
  markdownRawHtmlDisabled,
  scanRendererSource,
  validateRendererSecurity
};
