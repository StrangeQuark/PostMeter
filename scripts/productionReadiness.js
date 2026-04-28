#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildProductionReadinessMatrix,
  productionReadinessSummary,
  validateProductionReadinessMatrix
} = require('../src/core/productionReadinessMatrix');

const PROJECT_ROOT = path.join(__dirname, '..');
const MATRIX_PATH = path.join(PROJECT_ROOT, 'docs', 'production-readiness-matrix.json');

async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'write') {
    const matrix = await writeMatrix();
    console.log(`Wrote production readiness matrix with ${matrix.rows.length} rows.`);
    return;
  }
  if (command === 'validate') {
    const result = await validateCommittedMatrix();
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Production readiness matrix valid: ${result.summary.rowCount} rows.`);
    return;
  }
  if (command === 'claim') {
    const result = await validateCommittedMatrix();
    const blockers = result.matrix.rows.filter((item) => item.releaseBlocking && !['implemented', 'validated'].includes(item.status));
    if (!result.ok || blockers.length) {
      for (const error of result.errors) {
        console.error(error);
      }
      for (const blocker of blockers) {
        console.error(`Production release blocker: ${blocker.id} [${blocker.status}] ${blocker.target}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Production readiness claim gate passed: ${result.summary.rowCount} rows, zero release blockers.`);
    return;
  }
  if (command === 'status') {
    const result = await validateCommittedMatrix();
    for (const row of result.matrix.rows) {
      const marker = row.releaseBlocking && !['implemented', 'validated'].includes(row.status) ? 'BLOCKED' : row.status;
      console.log(`${marker.padEnd(28)} ${row.id} - ${row.target}`);
    }
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(error);
      }
      process.exitCode = 1;
    }
    return;
  }
  console.error('Usage: node scripts/productionReadiness.js <status|write|validate|claim>');
  process.exitCode = 1;
}

async function writeMatrix(filePath = MATRIX_PATH) {
  const matrix = buildProductionReadinessMatrix();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(matrix, null, 2)}\n`);
  return matrix;
}

async function validateCommittedMatrix(filePath = MATRIX_PATH) {
  const generated = buildProductionReadinessMatrix();
  const committed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const errors = validateProductionReadinessMatrix(committed);
  if (JSON.stringify(committed) !== JSON.stringify(generated)) {
    errors.push(`Committed production readiness matrix is stale. Regenerate ${path.relative(PROJECT_ROOT, filePath)} with npm run production:readiness:write.`);
  }
  return {
    errors,
    matrix: committed,
    ok: errors.length === 0,
    summary: productionReadinessSummary(committed)
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  MATRIX_PATH,
  validateCommittedMatrix,
  writeMatrix
};
