#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildMatrix,
  validateMatrix
} = require('../src/core/productionSupportMatrices');

const PROJECT_ROOT = path.join(__dirname, '..');
const MATRIX_FILES = Object.freeze({
  'electron-security': path.join(PROJECT_ROOT, 'docs', 'electron-security-matrix.json'),
  'workspace-durability': path.join(PROJECT_ROOT, 'docs', 'workspace-durability-matrix.json'),
  'non-postman-compatibility': path.join(PROJECT_ROOT, 'docs', 'non-postman-compatibility-matrix.json')
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
  if (JSON.stringify(committed) !== JSON.stringify(generated)) {
    errors.push(`Committed ${name} matrix is stale. Regenerate ${path.relative(PROJECT_ROOT, filePath)}.`);
  }
  return {
    errors,
    matrix: committed,
    ok: errors.length === 0
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  MATRIX_FILES,
  validateCommittedMatrix,
  writeMatrix
};
