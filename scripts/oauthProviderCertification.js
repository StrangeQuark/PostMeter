#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildOAuthProviderCertificationMatrix,
  liveOAuthCertificationStatus,
  runMockOAuthCertification,
  validateOAuthProviderCertificationMatrix
} = require('../src/core/oauthProviderCertification');

const PROJECT_ROOT = path.join(__dirname, '..');
const MATRIX_PATH = path.join(PROJECT_ROOT, 'docs', 'oauth-provider-certification-matrix.json');
const LIVE_EVIDENCE_DIRECTORY = path.join('validation-artifacts', 'oauth-provider-certification');

async function main() {
  const command = process.argv[2] || 'validate';
  if (command === 'write-matrix') {
    const matrix = await writeMatrix();
    console.log(`Wrote OAuth provider certification matrix with ${matrix.providers.length} providers and ${matrix.mockedScenarios.length} mocked scenarios.`);
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
    console.log(`OAuth provider certification matrix valid: ${result.matrix.providers.length} providers, ${result.matrix.mockedScenarios.length} mocked scenarios.`);
    return;
  }
  if (command === 'mock') {
    const result = await runMockOAuthCertification();
    if (!result.ok) {
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`Mock OAuth certification passed: ${result.scenarios.length} scenarios.`);
    return;
  }
  if (command === 'live') {
    const status = await liveCertificationStatusFromInputs();
    console.log(JSON.stringify(status, null, 2));
    if (!status.ok) {
      process.exitCode = 1;
    }
    return;
  }
  console.error('Usage: node scripts/oauthProviderCertification.js <validate|write-matrix|mock|live> [--provider all|google|microsoft-entra|github]');
  process.exitCode = 1;
}

async function writeMatrix(filePath = MATRIX_PATH) {
  const matrix = buildOAuthProviderCertificationMatrix();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(matrix, null, 2)}\n`);
  return matrix;
}

async function validateCommittedMatrix(filePath = MATRIX_PATH) {
  const generated = buildOAuthProviderCertificationMatrix();
  const committed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const errors = validateOAuthProviderCertificationMatrix(committed);
  if (JSON.stringify(committed) !== JSON.stringify(generated)) {
    errors.push(`Committed OAuth provider certification matrix is stale. Regenerate ${path.relative(PROJECT_ROOT, filePath)} with npm run oauth:certify:write.`);
  }
  return {
    errors,
    matrix: committed,
    ok: errors.length === 0
  };
}

async function liveCertificationStatusFromInputs(options = {}) {
  const argv = options.argv || process.argv;
  const env = options.env || process.env;
  const evidencePath = flagValueFromArgv(argv, '--evidence') || env.POSTMETER_LIVE_OAUTH_EVIDENCE_FILE || '';
  const liveEnabled = env.POSTMETER_LIVE_OAUTH_CERTIFICATION === '1';
  return liveOAuthCertificationStatus({
    provider: flagValueFromArgv(argv, '--provider') || env.POSTMETER_OAUTH_CERTIFICATION_PROVIDER || 'all',
    evidence: liveEnabled && evidencePath ? JSON.parse(await fs.readFile(resolveEvidencePath(evidencePath), 'utf8')) : null,
    artifactRoot: PROJECT_ROOT,
    env
  });
}

function flagValueFromArgv(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) {
    return '';
  }
  return argv[index + 1] || '';
}

function resolveEvidencePath(evidencePath) {
  const requestedPath = String(evidencePath || '');
  if (!requestedPath.trim()) {
    throw new Error('Live OAuth evidence path must not be empty.');
  }
  if (requestedPath.includes('\\')) {
    throw new Error('Live OAuth evidence path must use forward-slash repository-relative paths.');
  }
  if (path.isAbsolute(requestedPath)) {
    throw new Error('Live OAuth evidence path must be repository-relative.');
  }
  const resolved = path.resolve(PROJECT_ROOT, requestedPath);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Live OAuth evidence path must stay inside the repository.');
  }
  const normalizedRelativePath = relative.replace(/\\/g, '/');
  if (normalizedRelativePath !== LIVE_EVIDENCE_DIRECTORY
    && !normalizedRelativePath.startsWith(`${LIVE_EVIDENCE_DIRECTORY}/`)) {
    throw new Error(`Live OAuth evidence path must live under ${LIVE_EVIDENCE_DIRECTORY}/.`);
  }
  return resolved;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  MATRIX_PATH,
  liveCertificationStatusFromInputs,
  resolveEvidencePath,
  validateCommittedMatrix,
  writeMatrix
};
