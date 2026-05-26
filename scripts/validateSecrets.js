#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const ALLOW_COMMENT = 'postmeter-secret-allow:';
const MAX_ALLOW_COMMENT_DISTANCE = 3;
const DEFAULT_SCAN_DIRS = ['src', 'electron', 'scripts', 'test', 'docs', '.github/workflows'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'release', 'dist', 'coverage']);

const SECRET_PATTERNS = [
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/ },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { id: 'slack-token', pattern: /\bxox(?:b|p|a|r)-[A-Za-z0-9-]{24,}\b/ },
  { id: 'stripe-secret', pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/ },
  { id: 'oauth-client-secret', pattern: /\bclient[_-]?secret\s*[:=]\s*['"][A-Za-z0-9_./+=-]{24,}['"]/i },
  { id: 'api-key-assignment', pattern: /\bapi[_-]?key\s*[:=]\s*['"][A-Za-z0-9_./+=-]{32,}['"]/i }
];

function main(argv = process.argv.slice(2)) {
  const roots = argv.length ? argv : DEFAULT_SCAN_DIRS;
  const findings = validateSecrets({ roots: roots.map((value) => path.resolve(PROJECT_ROOT, value)) });
  if (findings.length) {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: ${finding.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Secret scanning validation passed.');
}

function validateSecrets(options = {}) {
  const roots = options.roots || DEFAULT_SCAN_DIRS.map((value) => path.join(PROJECT_ROOT, value));
  const files = roots.flatMap((root) => collectFiles(root));
  return files.flatMap((filePath) => scanFile(filePath, fs.readFileSync(filePath, 'utf8')));
}

function scanFile(filePath, source) {
  const relativePath = relative(filePath);
  const findings = [];
  const lines = String(source || '').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (hasAllowComment(lines, index)) {
      continue;
    }
    for (const secret of SECRET_PATTERNS) {
      if (!secret.pattern.test(line)) {
        continue;
      }
      findings.push({
        file: relativePath,
        line: index + 1,
        secret: secret.id,
        message: `${secret.id} matched high-confidence secret material. Remove it or add a narrow ${ALLOW_COMMENT} test-fixture justification.`
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

function collectFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return isScannableFile(root) ? [root] : [];
  }
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
    } else if (entry.isFile() && isScannableFile(entryPath)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function isScannableFile(filePath) {
  return /\.(?:js|cjs|mjs|json|md|yml|yaml|sh|ps1|txt|html|css)$/.test(filePath);
}

function relative(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replaceAll(path.sep, '/');
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOW_COMMENT,
  scanFile,
  validateSecrets
};
