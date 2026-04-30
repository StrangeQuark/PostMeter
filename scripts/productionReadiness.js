#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildProductionReadinessMatrix,
  productionReadinessBlockers,
  productionReadinessSummary,
  validateProductionReadinessMatrix
} = require('../src/core/productionReadinessMatrix');

const PROJECT_ROOT = path.join(__dirname, '..');
const MATRIX_PATH = path.join(PROJECT_ROOT, 'docs', 'production-readiness-matrix.json');

async function main() {
  const command = process.argv[2] || 'status';
  const options = parseOptions(process.argv.slice(3));
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
    const blockers = productionReadinessBlockers(result.matrix, options.level);
    if (!result.ok || blockers.length) {
      for (const error of result.errors) {
        console.error(error);
      }
      for (const blocker of blockers) {
        console.error(`Production ${options.level} blocker: ${blocker.id} [${blocker.status}] ${blocker.target}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Production ${options.level} readiness claim gate passed: ${result.summary.rowCount} rows, zero release blockers.`);
    return;
  }
  if (command === 'status') {
    const result = await validateCommittedMatrix();
    const blockers = new Set(productionReadinessBlockers(result.matrix, options.level).map((row) => row.id));
    for (const row of result.matrix.rows) {
      const marker = blockers.has(row.id) ? 'BLOCKED' : row.status;
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
  console.error('Usage: node scripts/productionReadiness.js <status|write|validate|claim> [--level=beta|rc|stable]');
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
  errors.push(...await validateMatrixReferences(committed));
  return {
    errors,
    matrix: committed,
    ok: errors.length === 0,
    summary: productionReadinessSummary(committed)
  };
}

async function validateMatrixReferences(matrix, root = PROJECT_ROOT) {
  const errors = [];
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  for (const row of rows) {
    for (const ref of Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []) {
      await validateLocalReference(ref, root, `Production readiness row ${row.id} evidenceRef`, errors);
    }
    for (const doc of Array.isArray(row.waiver?.docs) ? row.waiver.docs : []) {
      await validateLocalReference(doc, root, `Production readiness row ${row.id} waiver doc`, errors);
    }
  }
  return errors;
}

async function validateLocalReference(ref, root, label, errors) {
  if (typeof ref !== 'string' || !ref.trim() || /^(future|https?:|npm )/.test(ref)) {
    return;
  }
  const resolvedRoot = path.resolve(root);
  const resolvedRef = path.resolve(resolvedRoot, ref);
  if (!resolvedRef.startsWith(`${resolvedRoot}${path.sep}`) && resolvedRef !== resolvedRoot) {
    errors.push(`${label} must stay inside the project: ${ref}`);
    return;
  }
  try {
    await fs.access(resolvedRef);
  } catch {
    errors.push(`${label} does not exist: ${ref}`);
  }
}

function parseOptions(args) {
  const levelArg = args.find((arg) => arg.startsWith('--level='));
  const level = levelArg ? levelArg.slice('--level='.length) : 'stable';
  if (!['beta', 'rc', 'stable'].includes(level)) {
    throw new Error(`Unknown production readiness release level: ${level}`);
  }
  return { level };
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
  validateMatrixReferences,
  writeMatrix
};
