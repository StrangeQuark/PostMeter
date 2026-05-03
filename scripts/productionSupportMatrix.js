#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildMatrix,
  validateMatrix
} = require('../src/core/productionSupportMatrices');

const PROJECT_ROOT = path.join(__dirname, '..');
const MATRIX_FILES = Object.freeze({
  'diagnostics-privacy': path.join(PROJECT_ROOT, 'docs', 'diagnostics-privacy-matrix.json'),
  'electron-security': path.join(PROJECT_ROOT, 'docs', 'electron-security-matrix.json'),
  'workspace-durability': path.join(PROJECT_ROOT, 'docs', 'workspace-durability-matrix.json'),
  'non-postman-compatibility': path.join(PROJECT_ROOT, 'docs', 'non-postman-compatibility-matrix.json'),
  'ux-accessibility': path.join(PROJECT_ROOT, 'docs', 'ux-accessibility-matrix.json')
});

async function main() {
  const name = process.argv[2] || '';
  const command = process.argv[3] || 'validate';
  if (!MATRIX_FILES[name]) {
    console.error(`Unknown matrix "${name}". Expected one of: ${Object.keys(MATRIX_FILES).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (command === 'write') {
    const matrix = await writeMatrix(name);
    console.log(`Wrote ${name} matrix with ${matrix.rows.length} rows.`);
    return;
  }
  if (command === 'validate') {
    const result = await validateCommittedMatrix(name);
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`${name} matrix valid: ${result.matrix.rows.length} rows.`);
    return;
  }
  console.error(`Unknown command "${command}". Usage: node scripts/productionSupportMatrix.js <name> <validate|write>`);
  process.exitCode = 1;
}

async function writeMatrix(name) {
  const matrix = buildMatrix(name);
  const filePath = MATRIX_FILES[name];
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(matrix, null, 2)}\n`);
  return matrix;
}

async function validateCommittedMatrix(name) {
  const filePath = MATRIX_FILES[name];
  const generated = buildMatrix(name);
  const committed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const errors = validateMatrix(committed, name);
  errors.push(...await validateEvidenceRefs(committed));
  errors.push(...await validateTestRefs(committed));
  if (JSON.stringify(committed) !== JSON.stringify(generated)) {
    errors.push(`Committed ${name} matrix is stale. Regenerate ${path.relative(PROJECT_ROOT, filePath)}.`);
  }
  return {
    errors,
    matrix: committed,
    ok: errors.length === 0
  };
}

async function validateEvidenceRefs(matrix) {
  const errors = [];
  for (const row of Array.isArray(matrix?.rows) ? matrix.rows : []) {
    for (const ref of Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []) {
      if (typeof ref !== 'string' || !ref.trim()) {
        errors.push(`${matrix.name} matrix row ${row.id || '<unknown>'} has an empty evidence ref.`);
        continue;
      }
      const resolvedRef = resolveRepoRelativeRef(ref);
      if (!resolvedRef) {
        errors.push(`${matrix.name} matrix row ${row.id || '<unknown>'} has invalid evidence ref: ${ref}`);
        continue;
      }
      try {
        await fs.access(resolvedRef);
      } catch {
        errors.push(`${matrix.name} matrix row ${row.id || '<unknown>'} evidence ref does not exist: ${ref}`);
      }
    }
  }
  return errors;
}

async function validateTestRefs(matrix) {
  const errors = [];
  const packageJson = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts || {};
  for (const row of Array.isArray(matrix?.rows) ? matrix.rows : []) {
    for (const ref of Array.isArray(row.tests) ? row.tests : []) {
      if (typeof ref !== 'string' || !ref.trim()) {
        errors.push(`${matrix.name} matrix row ${row.id || '<unknown>'} has an empty test ref.`);
        continue;
      }
      if (ref.startsWith('npm run ')) {
        const scriptName = ref.slice('npm run '.length).trim().split(/\s+/)[0];
        if (!scriptName || typeof scripts[scriptName] !== 'string') {
          errors.push(`${matrix.name} matrix row ${row.id || '<unknown>'} references unknown npm script: ${ref}`);
        }
        continue;
      }
      const resolvedRef = resolveRepoRelativeRef(ref);
      if (!resolvedRef) {
        errors.push(`${matrix.name} matrix row ${row.id || '<unknown>'} has invalid test ref: ${ref}`);
        continue;
      }
      if (!isExecutableTestRef(ref)) {
        errors.push(`${matrix.name} matrix row ${row.id || '<unknown>'} test ref is not an executable test file or npm script: ${ref}`);
        continue;
      }
      try {
        await fs.access(resolvedRef);
      } catch {
        errors.push(`${matrix.name} matrix row ${row.id || '<unknown>'} test ref does not exist: ${ref}`);
      }
    }
  }
  return errors;
}

function resolveRepoRelativeRef(ref) {
  if (typeof ref !== 'string' || !ref.trim() || path.isAbsolute(ref) || ref.includes('\0')) {
    return null;
  }
  const resolved = path.resolve(PROJECT_ROOT, ref);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

function isExecutableTestRef(ref) {
  const normalized = String(ref || '').replace(/\\/g, '/');
  return normalized.startsWith('test/') && /\.(?:cjs|mjs|js|ts)$/.test(normalized);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  MATRIX_FILES,
  resolveRepoRelativeRef,
  isExecutableTestRef,
  validateEvidenceRefs,
  validateTestRefs,
  validateCommittedMatrix,
  writeMatrix
};
