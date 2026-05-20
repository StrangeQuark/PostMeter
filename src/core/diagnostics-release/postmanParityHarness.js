const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runCollection } = require('../runtime/collectionRunner');
const { importPostmanCollection } = require('../import-export/postmanImporter');
const {
  NEWMAN_TARGET,
  NEWMAN_RUNTIME_TARGET,
  POSTMAN_DESKTOP_RUNTIME_TARGET,
  POSTMAN_DESKTOP_TARGET,
  POSTMAN_SANDBOX_TARGET,
  buildPostmanParityMatrix
} = require('./postmanParityMatrix');

const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
const MATRIX_PATH = path.join(PROJECT_ROOT, 'docs', 'postman-sandbox-parity-matrix.json');
const DIFFERENTIAL_COLLECTION_PATH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'differential-http-core.collection.json');
const BROAD_DIFFERENTIAL_COLLECTION_PATH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'differential-sandbox-broad.collection.json');
const DYNAMIC_HOST_GLOBALS_COLLECTION_PATH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'differential-dynamic-host-globals.collection.json');
const RUNTIME_LIMITS_COLLECTION_PATH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'differential-runtime-limits.collection.json');
const HTTPONLY_COOKIES_COLLECTION_PATH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'differential-httponly-cookies.collection.json');
const SENDREQUEST_ADVANCED_COLLECTION_PATH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'differential-sendrequest-advanced.collection.json');
const SENDREQUEST_FILES_COLLECTION_PATH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'differential-sendrequest-files.collection.json');
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'artifacts', 'postman-parity');
const REQUIRED_DIFFERENTIAL_FIXTURE = 'differential-http-core';
const REQUIRED_BROAD_DIFFERENTIAL_FIXTURE = 'differential-sandbox-broad';
const REQUIRED_DYNAMIC_HOST_GLOBALS_FIXTURE = 'differential-dynamic-host-globals';
const REQUIRED_RUNTIME_LIMITS_FIXTURE = 'differential-runtime-limits';
const REQUIRED_HTTPONLY_COOKIES_FIXTURE = 'differential-httponly-cookies';
const REQUIRED_SENDREQUEST_ADVANCED_FIXTURE = 'differential-sendrequest-advanced';
const REQUIRED_SENDREQUEST_FILES_FIXTURE = 'differential-sendrequest-files';
const REQUIRED_DESKTOP_FIXTURE = 'desktop-observation-template';
const REQUIRED_DESKTOP_EVIDENCE_FIXTURE = 'desktop-runtime-source-audit-v1';
const REQUIRED_REAL_WORLD_FIXTURE = 'real-world-import-corpus';
const REQUIRED_ADVERSARIAL_FIXTURE = 'adversarial-sandbox-v1';
const DEFAULT_CLAIM_SCOPE = 'default-import';
const OUT_OF_SCOPE_CLAIM_SCOPE = 'out-of-scope';
const COMPLETED_DESKTOP_EVIDENCE_TYPES = new Set([
  'desktop-observation',
  'desktop-runner-artifact',
  'desktop-runtime-source-audit'
]);
const DIFFERENTIAL_FIXTURES = Object.freeze([
  Object.freeze({
    collectionPath: DIFFERENTIAL_COLLECTION_PATH,
    environmentKeys: ['envToken'],
    id: REQUIRED_DIFFERENTIAL_FIXTURE,
    label: 'HTTP Core'
  }),
  Object.freeze({
    collectionPath: BROAD_DIFFERENTIAL_COLLECTION_PATH,
    environmentKeys: ['envBroad', 'timerBroad'],
    id: REQUIRED_BROAD_DIFFERENTIAL_FIXTURE,
    label: 'Sandbox Broad'
  }),
  Object.freeze({
    collectionPath: DYNAMIC_HOST_GLOBALS_COLLECTION_PATH,
    environmentKeys: ['dynamicHostSummary'],
    id: REQUIRED_DYNAMIC_HOST_GLOBALS_FIXTURE,
    label: 'Dynamic Host Globals'
  }),
  Object.freeze({
    collectionPath: RUNTIME_LIMITS_COLLECTION_PATH,
    environmentKeys: ['runtimeLimitsSummary'],
    id: REQUIRED_RUNTIME_LIMITS_FIXTURE,
    label: 'Runtime Limits'
  }),
  Object.freeze({
    collectionPath: HTTPONLY_COOKIES_COLLECTION_PATH,
    environmentKeys: ['httpOnlyCookieSummary'],
    id: REQUIRED_HTTPONLY_COOKIES_FIXTURE,
    label: 'HttpOnly Cookies'
  }),
  Object.freeze({
    collectionPath: SENDREQUEST_ADVANCED_COLLECTION_PATH,
    environmentKeys: ['advancedAuthSummary'],
    id: REQUIRED_SENDREQUEST_ADVANCED_FIXTURE,
    label: 'SendRequest Advanced Auth'
  }),
  Object.freeze({
    collectionPath: SENDREQUEST_FILES_COLLECTION_PATH,
    environmentKeys: ['fileBinarySummary'],
    fileBindings: [
      {
        contentType: 'application/octet-stream',
        localPath: path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'attachments', 'sendrequest-binary.bin'),
        source: 'test/fixtures/postman/attachments/sendrequest-binary.bin'
      },
      {
        contentType: 'text/plain',
        localPath: path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'attachments', 'sendrequest-file.txt'),
        source: 'test/fixtures/postman/attachments/sendrequest-file.txt'
      }
    ],
    id: REQUIRED_SENDREQUEST_FILES_FIXTURE,
    label: 'SendRequest File Bindings'
  })
]);
const CLAIM_BLOCKING_STATUSES = new Set([
  'partial',
  'not-started',
  'intentional-strict-gap',
  'needs-desktop-observation',
  'needs-source-audit'
]);
const VALID_NEWMAN_VALUES = new Set(['supported', 'unsupported', 'unknown', 'not-applicable', 'desktop-required', 'legacy']);
const VALID_DESKTOP_VALUES = new Set(['not-required', 'required']);
const VALID_DESKTOP_EVIDENCE_VALUES = new Set(['not-required', 'source-audit', 'row-specific-behavior']);
const VALID_CLAIM_SCOPES = new Set([DEFAULT_CLAIM_SCOPE, OUT_OF_SCOPE_CLAIM_SCOPE]);

async function writeParityMatrix(filePath = MATRIX_PATH) {
  const matrix = buildPostmanParityMatrix();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(matrix, null, 2)}\n`);
  return matrix;
}

async function readCommittedParityMatrix(filePath = MATRIX_PATH) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function validateCommittedParityMatrix(filePath = MATRIX_PATH) {
  const generated = buildPostmanParityMatrix();
  const committed = await readCommittedParityMatrix(filePath);
  const errors = validateParityMatrix(committed);
  errors.push(...await validateFixtureArtifacts(committed));
  if (JSON.stringify(committed) !== JSON.stringify(generated)) {
    errors.push(`Committed parity matrix is stale. Regenerate ${path.relative(PROJECT_ROOT, filePath)} with npm run postman:parity:write.`);
  }
  return {
    errors,
    matrix: committed,
    ok: errors.length === 0,
    summary: paritySummary(committed)
  };
}

async function validateFixtureArtifacts(matrix) {
  const errors = [];
  const fixtures = matrix.fixtures || {};
  for (const [fixtureId, fixture] of Object.entries(fixtures)) {
    for (const field of ['collection', 'path', 'expected', 'iterationData']) {
      if (fixture[field]) {
        const fixturePath = path.join(PROJECT_ROOT, fixture[field]);
        if (!await fileExists(fixturePath)) {
          errors.push(`Parity fixture ${fixtureId} ${field} does not exist: ${fixture[field]}.`);
        }
      }
    }
  }

  const desktopEvidenceArtifacts = new Map();
  for (const [fixtureId, fixture] of Object.entries(fixtures)) {
    if (!COMPLETED_DESKTOP_EVIDENCE_TYPES.has(fixture.type)) {
      continue;
    }
    if (!fixture.path) {
      errors.push(`Desktop evidence fixture ${fixtureId} must declare a path.`);
      continue;
    }
    const artifactPath = path.join(PROJECT_ROOT, fixture.path);
    try {
      const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
      if (artifact.type && artifact.type !== fixture.type) {
        errors.push(`Desktop evidence fixture ${fixtureId} type mismatch: expected ${fixture.type}, got ${artifact.type}.`);
      }
      if (!Array.isArray(artifact.rowIds) || !artifact.rowIds.length) {
        errors.push(`Desktop evidence fixture ${fixtureId} must list covered rowIds.`);
      } else {
        desktopEvidenceArtifacts.set(fixtureId, {
          artifact,
          rowIds: new Set(artifact.rowIds)
        });
      }
      if (!artifact.postman?.version && fixture.type !== 'desktop-runner-artifact') {
        errors.push(`Desktop evidence fixture ${fixtureId} must record the Postman Desktop version.`);
      }
    } catch (error) {
      errors.push(`Desktop evidence fixture ${fixtureId} could not be read: ${error.message || String(error)}.`);
    }
  }

  for (const row of matrix.rows || []) {
    if (row.status !== 'implemented' || row.differential?.desktopObservation !== 'required') {
      continue;
    }
    const covered = (row.fixtureRefs || []).some((fixtureRef) => desktopEvidenceArtifacts.get(fixtureRef)?.rowIds.has(row.id));
    if (!covered) {
      errors.push(`Implemented desktop-observed parity row ${row.id} is not covered by a completed desktop evidence artifact rowIds list.`);
    }
    if (row.differential?.desktopEvidence === 'row-specific-behavior'
      && !hasRowSpecificBehaviorArtifact(row, desktopEvidenceArtifacts)) {
      errors.push(`Implemented desktop-observed parity row ${row.id} requires row-specific Desktop behavior evidence, not only a broad runtime/source audit rowIds listing.`);
    }
  }
  return errors;
}

function hasRowSpecificBehaviorArtifact(row, desktopEvidenceArtifacts) {
  return (row.fixtureRefs || []).some((fixtureRef) => {
    const evidenceArtifact = desktopEvidenceArtifacts.get(fixtureRef);
    if (!evidenceArtifact?.rowIds.has(row.id)) {
      return false;
    }
    const rowEvidence = rowSpecificEvidence(evidenceArtifact.artifact, row.id);
    return rowEvidence?.level === 'behavior'
      && typeof rowEvidence.method === 'string'
      && rowEvidence.method.trim()
      && (
        nonEmptyArray(rowEvidence.postmanEvidence)
        || nonEmptyArray(rowEvidence.observed)
        || nonEmptyArray(rowEvidence.behavior)
      )
      && (
        nonEmptyArray(rowEvidence.postmeterEvidence)
        || nonEmptyArray(rowEvidence.fixtures)
        || nonEmptyArray(rowEvidence.tests)
      );
  });
}

function rowSpecificEvidence(artifact, rowId) {
  return artifact?.rowEvidence?.[rowId] || artifact?.evidence?.rowEvidence?.[rowId] || null;
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function validateCommittedProductionClaim(filePath = MATRIX_PATH) {
  const committedValidation = await validateCommittedParityMatrix(filePath);
  const claimValidation = validateProductionClaim(committedValidation.matrix, {
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

function validateParityMatrix(matrix) {
  const errors = [];
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return ['Parity matrix must be an object.'];
  }
  if (matrix.schemaVersion !== 1) {
    errors.push('Parity matrix schemaVersion must be 1.');
  }
  if (matrix.target?.newman !== NEWMAN_TARGET) {
    errors.push(`Parity matrix must target newman@${NEWMAN_TARGET}.`);
  }
  if (matrix.target?.postmanDesktop !== POSTMAN_DESKTOP_TARGET) {
    errors.push(`Parity matrix must target Postman Desktop ${POSTMAN_DESKTOP_TARGET}.`);
  }
  if (matrix.target?.postmanSandbox !== POSTMAN_SANDBOX_TARGET) {
    errors.push(`Parity matrix must target postman-sandbox@${POSTMAN_SANDBOX_TARGET}.`);
  }
  if (matrix.target?.postmanDesktopRuntime !== POSTMAN_DESKTOP_RUNTIME_TARGET) {
    errors.push(`Parity matrix must target Postman Desktop runtime ${POSTMAN_DESKTOP_RUNTIME_TARGET}.`);
  }
  if (matrix.target?.newmanRuntime !== NEWMAN_RUNTIME_TARGET) {
    errors.push(`Parity matrix must target Newman runtime ${NEWMAN_RUNTIME_TARGET}.`);
  }
  const sourceIds = new Set(Object.keys(matrix.sources || {}));
  const fixtures = matrix.fixtures || {};
  const fixtureIds = new Set(Object.keys(fixtures));
  const statuses = new Set(Object.keys(matrix.statuses || {}));
  if (!sourceIds.size) {
    errors.push('Parity matrix must declare sources.');
  }
  if (!fixtureIds.has(REQUIRED_DIFFERENTIAL_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_DIFFERENTIAL_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_BROAD_DIFFERENTIAL_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_BROAD_DIFFERENTIAL_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_DYNAMIC_HOST_GLOBALS_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_DYNAMIC_HOST_GLOBALS_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_RUNTIME_LIMITS_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_RUNTIME_LIMITS_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_HTTPONLY_COOKIES_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_HTTPONLY_COOKIES_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_SENDREQUEST_ADVANCED_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_SENDREQUEST_ADVANCED_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_SENDREQUEST_FILES_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_SENDREQUEST_FILES_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_DESKTOP_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_DESKTOP_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_DESKTOP_EVIDENCE_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_DESKTOP_EVIDENCE_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_REAL_WORLD_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_REAL_WORLD_FIXTURE}.`);
  }
  if (!fixtureIds.has(REQUIRED_ADVERSARIAL_FIXTURE)) {
    errors.push(`Parity matrix must declare fixture ${REQUIRED_ADVERSARIAL_FIXTURE}.`);
  }
  const rowIds = new Set();
  for (const row of matrix.rows || []) {
    validateRow(row, { errors, fixtureIds, fixtures, rowIds, sourceIds, statuses });
  }
  if (!Array.isArray(matrix.rows) || matrix.rows.length < 120) {
    errors.push('Parity matrix is expected to track at least 120 rows across APIs, methods, properties, globals, modules, and protocol hooks.');
  }
  return errors;
}

function validateRow(row, context) {
  const { errors, fixtureIds, fixtures, rowIds, sourceIds, statuses } = context;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    errors.push('Parity matrix rows must be objects.');
    return;
  }
  if (!row.id || typeof row.id !== 'string') {
    errors.push('Parity matrix row is missing a string id.');
    return;
  }
  if (rowIds.has(row.id)) {
    errors.push(`Parity matrix row id is duplicated: ${row.id}.`);
  }
  rowIds.add(row.id);
  for (const field of ['area', 'kind', 'target', 'status', 'securityDecision']) {
    if (!row[field] || typeof row[field] !== 'string') {
      errors.push(`Parity matrix row ${row.id} is missing ${field}.`);
    }
  }
  if (!statuses.has(row.status)) {
    errors.push(`Parity matrix row ${row.id} has unknown status ${row.status}.`);
  }
  if (row.securityDecision === 'pending') {
    errors.push(`Parity matrix row ${row.id} must have a concrete security decision.`);
  }
  if (!Array.isArray(row.sourceRefs) || !row.sourceRefs.length) {
    errors.push(`Parity matrix row ${row.id} must cite at least one source.`);
  } else {
    for (const sourceRef of row.sourceRefs) {
      if (!sourceIds.has(sourceRef)) {
        errors.push(`Parity matrix row ${row.id} references unknown source ${sourceRef}.`);
      }
    }
  }
  if (!Array.isArray(row.fixtureRefs)) {
    errors.push(`Parity matrix row ${row.id} fixtureRefs must be an array.`);
  } else {
    for (const fixtureRef of row.fixtureRefs) {
      if (!fixtureIds.has(fixtureRef)) {
        errors.push(`Parity matrix row ${row.id} references unknown fixture ${fixtureRef}.`);
      }
    }
  }
  if (row.status === 'implemented' && !row.fixtureRefs?.length) {
    errors.push(`Implemented parity row ${row.id} must have fixture coverage.`);
  }
  if (row.differential?.desktopObservation === 'required') {
    const hasTemplate = row.fixtureRefs?.includes(REQUIRED_DESKTOP_FIXTURE);
    const hasCompletedEvidence = hasCompletedDesktopEvidence(row, fixtures);
    if (!hasTemplate && !hasCompletedEvidence) {
      errors.push(`Desktop-observed parity row ${row.id} must reference ${REQUIRED_DESKTOP_FIXTURE} or a completed desktop evidence fixture.`);
    }
    if (row.status === 'implemented' && !hasCompletedEvidence) {
      errors.push(`Implemented desktop-observed parity row ${row.id} cannot rely only on ${REQUIRED_DESKTOP_FIXTURE}.`);
    }
  }
  if (!VALID_NEWMAN_VALUES.has(row.differential?.newman)) {
    errors.push(`Parity row ${row.id} has invalid Newman support value.`);
  }
  if (!VALID_DESKTOP_VALUES.has(row.differential?.desktopObservation)) {
    errors.push(`Parity row ${row.id} has invalid desktopObservation value.`);
  }
  if (!VALID_DESKTOP_EVIDENCE_VALUES.has(row.differential?.desktopEvidence || 'not-required')) {
    errors.push(`Parity row ${row.id} has invalid desktopEvidence value.`);
  }
  if (row.differential?.desktopObservation === 'required' && row.differential?.desktopEvidence === 'not-required') {
    errors.push(`Desktop-observed parity row ${row.id} must declare its desktopEvidence standard.`);
  }
  if (row.differential?.desktopObservation !== 'required' && row.differential?.desktopEvidence && row.differential.desktopEvidence !== 'not-required') {
    errors.push(`Parity row ${row.id} declares desktopEvidence without requiring desktop observation.`);
  }
  if (!VALID_CLAIM_SCOPES.has(row.claimScope || DEFAULT_CLAIM_SCOPE)) {
    errors.push(`Parity row ${row.id} has invalid claimScope value.`);
  }
}

function hasCompletedDesktopEvidence(row, fixtures = {}) {
  return (row.fixtureRefs || []).some((fixtureRef) => COMPLETED_DESKTOP_EVIDENCE_TYPES.has(fixtures[fixtureRef]?.type));
}

function paritySummary(matrix) {
  const byStatus = {};
  const byArea = {};
  for (const row of matrix.rows || []) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byArea[row.area] = (byArea[row.area] || 0) + 1;
  }
  return {
    rowCount: Array.isArray(matrix.rows) ? matrix.rows.length : 0,
    byStatus,
    byArea
  };
}

function validateProductionClaim(matrix, options = {}) {
  const errors = [];
  if (options.skipStructuralValidation !== true) {
    errors.push(...validateParityMatrix(matrix));
  }
  const blockers = claimBlockingRows(matrix);
  if (blockers.length) {
    errors.push(`Postman 1:1 script compatibility claim is blocked by ${blockers.length} default-import parity row(s).`);
  }
  return {
    blockers,
    errors,
    ok: errors.length === 0,
    summary: claimSummary(matrix, blockers)
  };
}

function claimBlockingRows(matrix) {
  return (matrix?.rows || [])
    .filter((row) => (row.claimScope || DEFAULT_CLAIM_SCOPE) === DEFAULT_CLAIM_SCOPE)
    .filter((row) => CLAIM_BLOCKING_STATUSES.has(row.status))
    .map((row) => ({
      area: row.area,
      id: row.id,
      status: row.status,
      target: row.target
    }));
}

function claimSummary(matrix, blockers = claimBlockingRows(matrix)) {
  const rows = (matrix?.rows || []).filter((row) => (row.claimScope || DEFAULT_CLAIM_SCOPE) === DEFAULT_CLAIM_SCOPE);
  const byStatus = {};
  const blockersByStatus = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }
  for (const row of blockers) {
    blockersByStatus[row.status] = (blockersByStatus[row.status] || 0) + 1;
  }
  return {
    blockersByStatus,
    defaultImportBlockers: blockers.length,
    defaultImportRows: rows.length,
    defaultImportRowsByStatus: byStatus,
    ready: blockers.length === 0
  };
}

async function runPostmanParityDifferential(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  await fs.mkdir(outputDir, { recursive: true });
  const serverState = { observed: [] };
  const server = await startParityServer(serverState);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const suites = [];
    for (const fixture of DIFFERENTIAL_FIXTURES) {
      serverState.observed = [];
      const postmeter = await runPostMeterDifferential({ baseUrl, fixture, observedRequests: serverState.observed });
      const postmeterPath = path.join(outputDir, `postmeter-${fixture.id}.json`);
      await fs.writeFile(postmeterPath, `${JSON.stringify(postmeter, null, 2)}\n`);

      let newman = { skipped: true, reason: 'Newman execution was not requested.' };
      let comparison = { skipped: true, reason: 'Newman execution was not requested.' };
      let newmanPath = '';
      if (options.runNewman || options.requireNewman) {
        serverState.observed = [];
        newmanPath = path.join(outputDir, `newman-${fixture.id}.json`);
        newman = await runNewmanDifferential({
          baseUrl,
          fixture,
          newmanOutput: newmanPath,
          observedRequests: serverState.observed,
          requireNewman: options.requireNewman,
          allowDownload: options.allowNewmanDownload
        });
        if (!newman.skipped) {
          comparison = compareDifferentialOutputs(postmeter, newman, fixture);
        } else if (options.requireNewman) {
          throw new Error(newman.reason || 'Newman execution was required but skipped.');
        }
      }
      suites.push({
        comparison,
        fixture: fixture.id,
        label: fixture.label,
        newman,
        output: {
          newman: newmanPath,
          postmeter: postmeterPath
        },
        postmeter
      });
    }
    const firstSuite = suites[0] || {};
    const aggregateComparison = aggregateDifferentialComparisons(suites);
    const summary = {
      baseUrl,
      comparison: aggregateComparison,
      newman: firstSuite.newman,
      postmeter: firstSuite.postmeter,
      suites,
      target: {
        newman: NEWMAN_TARGET,
        postmanRuntime: NEWMAN_RUNTIME_TARGET
      }
    };
    await fs.writeFile(path.join(outputDir, 'postman-parity-differential-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  } finally {
    await closeServer(server);
  }
}

async function runPostMeterDifferential({ baseUrl, fixture = DIFFERENTIAL_FIXTURES[0], observedRequests }) {
  const document = JSON.parse(await fs.readFile(fixture.collectionPath, 'utf8'));
  const collection = importPostmanCollection(document);
  const result = await runCollection(collection, {
    id: 'postman-parity-env',
    name: 'Postman Parity Env',
    variables: [
      { enabled: true, key: 'baseUrl', value: baseUrl },
      { enabled: true, key: 'envSeed', value: 'env-seed' }
    ]
  }, {
    fileBindings: fixture.fileBindings || [],
    globals: [
      { enabled: true, key: 'globalSeed', value: 'global-seed' }
    ],
    iteration: 0,
    iterationCount: 1
  });
  return normalizePostMeterResult(result, observedRequests);
}

async function runNewmanDifferential(options) {
  const newmanOutput = options.newmanOutput || path.join(options.outputDir, `newman-${options.fixture.id}.json`);
  const args = newmanArgs(options, newmanOutput);
  const result = await spawnForResult('npx', args, { timeoutMillis: 120_000 });
  if (result.status !== 0) {
    if (options.requireNewman) {
      throw new Error(`Newman differential run failed: ${result.stderr || result.stdout}`);
    }
    return {
      skipped: true,
      reason: result.stderr || result.stdout || 'Newman is not available.'
    };
  }
  const parsed = JSON.parse(await fs.readFile(newmanOutput, 'utf8'));
  return normalizeNewmanResult(parsed, options.observedRequests);
}

function newmanArgs(options, newmanOutput) {
  const base = options.allowDownload
    ? ['--yes', `newman@${NEWMAN_TARGET}`]
    : ['--no-install', 'newman'];
  return [
    ...base,
    'run',
    options.fixture.collectionPath,
    '--working-dir',
    PROJECT_ROOT,
    '--env-var',
    `baseUrl=${options.baseUrl}`,
    '--reporters',
    'json',
    '--reporter-json-export',
    newmanOutput
  ];
}

function compareDifferentialOutputs(postmeter, newman, fixture = DIFFERENTIAL_FIXTURES[0]) {
  const differences = [];
  compareJson(differences, 'summary', postmeter.summary, newman.summary);
  compareJson(differences, 'requests', postmeter.requests, newman.requests);
  compareJson(differences, 'observedRequests', observedForCompare(postmeter.observedRequests), observedForCompare(newman.observedRequests));
  compareVariableSubset(differences, 'environment', postmeter.environment, newman.environment, fixture.environmentKeys || []);
  return {
    differences,
    notes: [
      'Collection variable mutations are asserted inside the fixture. They are not hard-compared from Newman JSON because newman@6.2.2 does not consistently export mutated collection variables from the reporter payload.'
    ],
    passed: differences.length === 0
  };
}

function aggregateDifferentialComparisons(suites = []) {
  const differences = [];
  let skipped = true;
  for (const suite of suites) {
    if (suite.comparison?.skipped) {
      continue;
    }
    skipped = false;
    for (const difference of suite.comparison?.differences || []) {
      differences.push({ fixture: suite.fixture, ...difference });
    }
  }
  if (skipped) {
    return { skipped: true, reason: 'Newman execution was not requested.' };
  }
  return {
    differences,
    passed: differences.length === 0
  };
}

function compareJson(differences, label, left, right) {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    differences.push({ label, postmeter: left, newman: right });
  }
}

function compareVariableSubset(differences, label, leftVariables, rightVariables, keys) {
  const left = pickVariables(leftVariables, keys);
  const right = pickVariables(rightVariables, keys);
  compareJson(differences, label, left, right);
}

function pickVariables(variables, keys) {
  const result = {};
  for (const key of keys) {
    const value = (variables || []).find((item) => item.key === key)?.value;
    if (value != null) {
      result[key] = value;
    }
  }
  return result;
}

function normalizePostMeterResult(result, observedRequests = []) {
  return {
    summary: {
      collectionName: result.collectionName,
      failedRequests: result.failedRequests,
      passed: result.passed,
      passedRequests: result.passedRequests,
      totalRequests: result.totalRequests
    },
    requests: (result.results || []).map((item) => ({
      requestName: item.requestName,
      statusCode: item.statusCode,
      passed: item.passed === true,
      tests: [
        ...normalizeScriptTests(item.preRequestScriptResult),
        ...normalizeScriptTests(item.testScriptResult)
      ]
    })),
    environment: normalizePairs(result.environment?.variables),
    collectionVariables: normalizePairs(result.collectionVariables),
    globals: normalizePairs(result.globals),
    cookies: normalizeCookies(result.cookies),
    observedRequests: cloneJson(observedRequests)
  };
}

function normalizeNewmanResult(result, observedRequests = []) {
  const run = result.run || {};
  const executions = dedupeNewmanExecutions(run.executions || []);
  const failedRequests = executions.filter((execution) => (execution.assertions || []).some((assertion) => assertion.error)).length;
  return {
    skipped: false,
    summary: {
      collectionName: result.collection?.info?.name || run.collection?.info?.name || 'PostMeter Differential HTTP Core',
      failedRequests,
      passed: failedRequests === 0,
      passedRequests: executions.length - failedRequests,
      totalRequests: executions.length
    },
    requests: executions.map((execution) => ({
      requestName: execution.item?.name || '',
      statusCode: execution.response?.code || 0,
      passed: !(execution.assertions || []).some((assertion) => assertion.error),
      tests: (execution.assertions || []).map((assertion) => ({
        name: assertion.assertion || '',
        passed: !assertion.error,
        error: assertion.error?.message || ''
      }))
    })),
    environment: normalizeNewmanVariables(run.environment?.values || result.environment?.values),
    collectionVariables: normalizeNewmanVariables(run.collection?.variable || result.collection?.variable),
    globals: normalizeNewmanVariables(run.globals?.values || result.globals?.values),
    cookies: [],
    observedRequests: cloneJson(observedRequests)
  };
}

function dedupeNewmanExecutions(executions) {
  const seen = new Set();
  const deduped = [];
  for (const execution of executions) {
    const key = newmanExecutionKey(execution);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(execution);
  }
  return deduped;
}

function newmanExecutionKey(execution) {
  if (execution?.cursor?.execution) {
    return String(execution.cursor.execution);
  }
  const assertions = (execution?.assertions || []).map((assertion) => assertion.assertion || '').join('|');
  return [
    execution?.item?.id || '',
    execution?.item?.name || '',
    execution?.request?.method || '',
    execution?.response?.code || '',
    assertions
  ].join('|');
}

function normalizeScriptTests(result = {}) {
  return (result.tests || []).map((item) => ({
    name: item.name || '',
    passed: item.passed === true,
    error: item.error || ''
  }));
}

function normalizePairs(values) {
  return (values || [])
    .filter((item) => item?.key && item.enabled !== false)
    .map((item) => ({ key: item.key, value: item.value == null ? '' : String(item.value) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function normalizeNewmanVariables(values) {
  return (values || [])
    .filter((item) => item?.key && item.disabled !== true && item.enabled !== false)
    .map((item) => ({ key: item.key, value: item.value == null ? '' : String(item.value) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function normalizeCookies(values) {
  return (values || [])
    .filter((item) => item?.name)
    .map((item) => ({ name: item.name, value: item.value == null ? '' : String(item.value), domain: item.domain || '', path: item.path || '' }))
    .sort((left, right) => `${left.domain}|${left.path}|${left.name}`.localeCompare(`${right.domain}|${right.path}|${right.name}`));
}

function observedForCompare(values) {
  return (values || []).map((item) => ({
    body: normalizeObservedBody(item),
    method: item.method,
    path: item.path,
    xPre: item.headers?.['x-pre'] || ''
  }));
}

function normalizeObservedBody(item = {}) {
  const body = item.body || '';
  if (String(item.headers?.['content-type'] || '').startsWith('multipart/form-data')) {
    return body
      .replace(/--postmeter-[a-f0-9]+/g, '<boundary>')
      .replace(/postmeter-[a-f0-9]+/g, '<boundary>')
      .replace(/----------------------------[a-f0-9]+/g, '<boundary>');
  }
  return body;
}

async function startParityServer(state) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    try {
      const body = await readRequestBody(request);
      state.observed.push({
        body,
        headers: request.headers,
        method: request.method || '',
        path: url.pathname
      });
      if (url.pathname === '/json') {
        sendJson(response, 200, {
          headers: request.headers,
          ok: true,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams.entries()),
          xPre: request.headers['x-pre'] || ''
        });
        return;
      }
      if (url.pathname === '/aux') {
        sendJson(response, 200, { aux: true });
        return;
      }
      if (url.pathname === '/echo') {
        sendJson(response, 200, {
          body,
          headers: request.headers,
          method: request.method || ''
        });
        return;
      }
      if (url.pathname === '/set-cookie') {
        sendJson(response, 200, { cookie: true }, {
          'set-cookie': 'serverCookie=server-value; Path=/'
        });
        return;
      }
      if (url.pathname === '/set-httponly') {
        sendJson(response, 200, { httpOnly: true }, {
          'set-cookie': [
            'visible=visible-value; Path=/',
            'secret=secret-value; Path=/; HttpOnly',
            'replaceMe=server-secret; Path=/; HttpOnly',
            'clearMe=clear-secret; Path=/; HttpOnly'
          ]
        });
        return;
      }
      if (url.pathname === '/set-send-httponly') {
        sendJson(response, 200, { sendHttpOnly: true }, {
          'set-cookie': 'sendSecret=send-secret; Path=/; HttpOnly'
        });
        return;
      }
      if (url.pathname === '/cookie-check') {
        sendJson(response, 200, { cookies: parseCookieHeader(request.headers.cookie || '') });
        return;
      }
      if (url.pathname === '/auth/digest') {
        if (!request.headers.authorization) {
          sendJson(response, 401, { challenge: true }, {
            'www-authenticate': 'Digest realm="postmeter", nonce="abc123", qop="auth", algorithm=MD5'
          });
          return;
        }
        sendJson(response, 200, authHeaderSummary(request.headers.authorization));
        return;
      }
      if (url.pathname === '/auth/hawk' || url.pathname === '/auth/aws' || url.pathname === '/auth/oauth1') {
        sendJson(response, 200, authHeaderSummary(request.headers.authorization || ''));
        return;
      }
      if (url.pathname.startsWith('/attachments/')) {
        sendJson(response, 200, attachmentSummary(url.pathname, request.headers, body));
        return;
      }
      if (url.pathname === '/status/418') {
        sendJson(response, 418, { teapot: true });
        return;
      }
      sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      sendJson(response, 500, { error: error.message || String(error) });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

function authHeaderSummary(header) {
  const scheme = String(header || '').split(/\s+/, 1)[0] || '';
  return {
    authorization: header || '',
    scheme
  };
}

function attachmentSummary(pathname, headers, body) {
  const kind = pathname.split('/').pop() || '';
  const isMultipart = String(headers['content-type'] || '').startsWith('multipart/form-data');
  return {
    attachment: body.includes('BINARY_ATTACHMENT_CONTENT') ? 'BINARY_ATTACHMENT_CONTENT'
      : body.includes('FILE_ATTACHMENT_CONTENT') ? 'FILE_ATTACHMENT_CONTENT'
        : 'missing',
    contentType: String(headers['content-type'] || ''),
    field: isMultipart && body.includes('form-note') ? 'form-note' : 'none',
    kind
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => {
      chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

function parseCookieHeader(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name) {
      cookies[name] = valueParts.join('=');
    }
  }
  return cookies;
}

function sendJson(response, statusCode, body, headers = {}) {
  const text = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-length': Buffer.byteLength(text),
    'content-type': 'application/json',
    ...headers
  });
  response.end(text);
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function spawnForResult(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.timeoutMillis || 60_000);
    timeout.unref?.();
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ error, status: 1, stderr: error.message, stdout });
    });
    child.on('exit', (status, signal) => {
      clearTimeout(timeout);
      resolve({ signal, status: status == null ? 1 : status, stderr, stdout });
    });
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || []));
}

module.exports = {
  DEFAULT_OUTPUT_DIR,
  MATRIX_PATH,
  claimBlockingRows,
  compareDifferentialOutputs,
  paritySummary,
  readCommittedParityMatrix,
  runPostmanParityDifferential,
  validateCommittedParityMatrix,
  validateCommittedProductionClaim,
  validateFixtureArtifacts,
  validateParityMatrix,
  validateProductionClaim,
  writeParityMatrix
};
