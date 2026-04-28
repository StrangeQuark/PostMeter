const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildOsSandboxPlatformMatrix,
  osSandboxPlatformSummary,
  platformClaimBlockers,
  validateOsSandboxPlatformClaim,
  validateOsSandboxPlatformMatrix
} = require('./osSandboxPlatformMatrix');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const OS_SANDBOX_PLATFORM_MATRIX_PATH = path.join(PROJECT_ROOT, 'docs', 'os-sandbox-platform-matrix.json');

async function writeOsSandboxPlatformMatrix(filePath = OS_SANDBOX_PLATFORM_MATRIX_PATH) {
  const matrix = buildOsSandboxPlatformMatrix();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(matrix, null, 2)}\n`);
  return matrix;
}

async function readCommittedOsSandboxPlatformMatrix(filePath = OS_SANDBOX_PLATFORM_MATRIX_PATH) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function validateCommittedOsSandboxPlatformMatrix(filePath = OS_SANDBOX_PLATFORM_MATRIX_PATH) {
  const generated = buildOsSandboxPlatformMatrix();
  const committed = await readCommittedOsSandboxPlatformMatrix(filePath);
  const errors = validateOsSandboxPlatformMatrix(committed);
  if (JSON.stringify(committed) !== JSON.stringify(generated)) {
    errors.push(`Committed OS sandbox platform matrix is stale. Regenerate ${path.relative(PROJECT_ROOT, filePath)} with npm run sandbox:platform:write.`);
  }
  return {
    errors,
    matrix: committed,
    ok: errors.length === 0,
    summary: osSandboxPlatformSummary(committed)
  };
}

async function validateCommittedOsSandboxPlatformClaim(filePath = OS_SANDBOX_PLATFORM_MATRIX_PATH) {
  const committedValidation = await validateCommittedOsSandboxPlatformMatrix(filePath);
  const claimValidation = validateOsSandboxPlatformClaim(committedValidation.matrix, {
    skipStructuralValidation: true
  });
  const errors = [...committedValidation.errors, ...claimValidation.errors];
  return {
    blockers: claimValidation.blockers,
    errors,
    matrix: committedValidation.matrix,
    ok: errors.length === 0,
    summary: {
      ...committedValidation.summary,
      claim: claimValidation.summary
    }
  };
}

module.exports = {
  OS_SANDBOX_PLATFORM_MATRIX_PATH,
  osSandboxPlatformSummary,
  platformClaimBlockers,
  readCommittedOsSandboxPlatformMatrix,
  validateCommittedOsSandboxPlatformClaim,
  validateCommittedOsSandboxPlatformMatrix,
  validateOsSandboxPlatformClaim,
  validateOsSandboxPlatformMatrix,
  writeOsSandboxPlatformMatrix
};
