#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(PROJECT_ROOT, 'test', 'fixtures', 'postman', 'newman-reports');
const RAW_DIR = path.join(REPORT_DIR, 'raw-newman');
const NORMALIZED_DIR = path.join(REPORT_DIR, 'normalized-newman');
const POSTMETER_DIR = path.join(REPORT_DIR, 'normalized-postmeter');
const SUMMARY_PATH = path.join(REPORT_DIR, 'comparison-summary.json');
const TARGET = Object.freeze({
  newman: '6.2.2',
  postmanRuntime: '7.39.1',
  normalizationSchemaVersion: 1
});
const SUITES = Object.freeze([
  'differential-http-core',
  'differential-sandbox-broad',
  'differential-dynamic-host-globals',
  'differential-runtime-limits',
  'differential-httponly-cookies',
  'differential-sendrequest-advanced',
  'differential-sendrequest-files'
]);

async function main() {
  const command = process.argv[2] || 'validate';
  if (command === 'write') {
    const sourceDir = valueForFlag('--from') || process.env.POSTMETER_NEWMAN_REPORT_SOURCE_DIR || '';
    if (!sourceDir) {
      throw new Error('Newman report write requires --from <postman:parity:diff output dir>. Generate with npm run postman:parity:diff -- --newman --download-newman --output <dir>.');
    }
    await writeReports(path.resolve(sourceDir));
    console.log(`Wrote Newman JSON evidence for ${SUITES.length} suites.`);
    return;
  }
  if (command === 'validate') {
    const errors = await validateReports();
    if (errors.length) {
      for (const error of errors) {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Newman JSON evidence valid: ${SUITES.length} suites targeting newman@${TARGET.newman}.`);
    return;
  }
  console.error('Usage: node scripts/newmanReports.js <write --from DIR|validate>');
  process.exitCode = 1;
}

async function writeReports(sourceDir) {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(NORMALIZED_DIR, { recursive: true });
  await fs.mkdir(POSTMETER_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, 'README.md'), readmeContent());
  const suiteSummaries = [];
  const summary = JSON.parse(await fs.readFile(path.join(sourceDir, 'postman-parity-differential-summary.json'), 'utf8'));
  if (summary.comparison?.passed !== true) {
    throw new Error('Cannot check in Newman evidence from a differential run with comparison failures.');
  }
  for (const suite of SUITES) {
    const raw = JSON.parse(await fs.readFile(path.join(sourceDir, `newman-${suite}.json`), 'utf8'));
    const postmeter = JSON.parse(await fs.readFile(path.join(sourceDir, `postmeter-${suite}.json`), 'utf8'));
    await fs.writeFile(path.join(RAW_DIR, `${suite}.json`), `${JSON.stringify(raw, null, 2)}\n`);
    const normalizedNewman = normalizeNewmanReport(raw, suite);
    const normalizedPostmeter = normalizePostmeterReport(postmeter, suite);
    await fs.writeFile(path.join(NORMALIZED_DIR, `${suite}.json`), `${JSON.stringify(normalizedNewman, null, 2)}\n`);
    await fs.writeFile(path.join(POSTMETER_DIR, `${suite}.json`), `${JSON.stringify(normalizedPostmeter, null, 2)}\n`);
    suiteSummaries.push({
      fixtureId: suite,
      newmanRaw: path.relative(REPORT_DIR, path.join(RAW_DIR, `${suite}.json`)).replaceAll(path.sep, '/'),
      newmanNormalized: path.relative(REPORT_DIR, path.join(NORMALIZED_DIR, `${suite}.json`)).replaceAll(path.sep, '/'),
      postmeterNormalized: path.relative(REPORT_DIR, path.join(POSTMETER_DIR, `${suite}.json`)).replaceAll(path.sep, '/')
    });
  }
  await fs.writeFile(SUMMARY_PATH, `${JSON.stringify({
    schemaVersion: 1,
    target: {
      newman: TARGET.newman,
      postmanRuntime: TARGET.postmanRuntime
    },
    generationCommand: 'npm run postman:parity:diff -- --newman --download-newman --output <dir> && npm run postman:newman-reports:write -- --from <dir>',
    normalizedFields: normalizedFields(),
    comparison: {
      passed: true,
      differences: []
    },
    suites: suiteSummaries
  }, null, 2)}\n`);
}

async function validateReports() {
  const errors = [];
  let summary;
  try {
    summary = JSON.parse(await fs.readFile(SUMMARY_PATH, 'utf8'));
  } catch (error) {
    errors.push(`Newman comparison summary is missing or invalid: ${error.message || String(error)}.`);
  }
  if (summary) {
    if (summary.target?.newman !== TARGET.newman) {
      errors.push(`Newman comparison summary must target newman@${TARGET.newman}.`);
    }
    if (summary.comparison?.passed !== true || !Array.isArray(summary.comparison?.differences) || summary.comparison.differences.length) {
      errors.push('Newman comparison summary must record a clean differential comparison.');
    }
  }
  for (const suite of SUITES) {
    const rawPath = path.join(RAW_DIR, `${suite}.json`);
    const normalizedPath = path.join(NORMALIZED_DIR, `${suite}.json`);
    const postmeterPath = path.join(POSTMETER_DIR, `${suite}.json`);
    let raw;
    let normalized;
    let postmeter;
    try {
      raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));
    } catch (error) {
      errors.push(`Raw Newman report missing or invalid for ${suite}: ${error.message || String(error)}.`);
      continue;
    }
    try {
      normalized = JSON.parse(await fs.readFile(normalizedPath, 'utf8'));
    } catch (error) {
      errors.push(`Normalized Newman report missing or invalid for ${suite}: ${error.message || String(error)}.`);
      continue;
    }
    try {
      postmeter = JSON.parse(await fs.readFile(postmeterPath, 'utf8'));
    } catch (error) {
      errors.push(`Normalized PostMeter report missing or invalid for ${suite}: ${error.message || String(error)}.`);
      continue;
    }
    const expectedNewman = normalizeNewmanReport(raw, suite);
    if (JSON.stringify(normalized) !== JSON.stringify(expectedNewman)) {
      errors.push(`Normalized Newman report for ${suite} is stale. Regenerate with npm run postman:newman-reports:write -- --from <dir>.`);
    }
    if (postmeter.schemaVersion !== 1 || postmeter.fixtureId !== suite || postmeter.source !== 'postmeter-parity-harness') {
      errors.push(`Normalized PostMeter report for ${suite} has invalid metadata.`);
    }
    if (normalized.assertionFailures.length) {
      errors.push(`Normalized Newman report for ${suite} contains assertion failures.`);
    }
  }
  return errors;
}

function normalizeNewmanReport(raw, suite) {
  const run = raw.run || {};
  const executions = dedupeNewmanExecutions(run.executions || []);
  return {
    schemaVersion: TARGET.normalizationSchemaVersion,
    source: 'newman-json-reporter',
    fixtureId: suite,
    newmanVersion: TARGET.newman,
    postmanRuntimeVersion: TARGET.postmanRuntime,
    normalization: {
      normalizedFields: normalizedFields(),
      preservedFields: [
        'collection name',
        'request order',
        'request names',
        'request methods',
        'response codes',
        'assertion names',
        'assertion pass/fail state',
        'failure messages'
      ]
    },
    collectionName: raw.collection?.info?.name || '',
    stats: normalizeStats(run.stats || {}),
    requests: executions.map((execution) => ({
      itemName: execution.item?.name || '',
      method: execution.request?.method || execution.item?.request?.method || '',
      responseCode: Number(execution.response?.code || 0),
      assertions: (execution.assertions || []).map((assertion) => ({
        name: assertion.assertion || '',
        passed: !assertion.error,
        skipped: assertion.skipped === true,
        error: assertion.error?.message || ''
      }))
    })),
    assertionFailures: (run.failures || []).map((failure) => ({
      assertion: failure.error?.test || failure.source?.name || '',
      message: failure.error?.message || ''
    }))
  };
}

function normalizePostmeterReport(raw, suite) {
  return {
    schemaVersion: 1,
    source: 'postmeter-parity-harness',
    fixtureId: suite,
    summary: raw.summary || {},
    requests: raw.requests || [],
    environment: raw.environment || [],
    observedRequests: (raw.observedRequests || []).map((item) => ({
      method: item.method,
      path: item.path,
      xPre: item.headers?.['x-pre'] || ''
    }))
  };
}

function normalizeStats(stats) {
  const output = {};
  for (const [key, value] of Object.entries(stats || {})) {
    output[key] = {
      total: Number(value?.total || 0),
      pending: Number(value?.pending || 0),
      failed: Number(value?.failed || 0)
    };
  }
  return output;
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
  return [
    execution?.item?.id || '',
    execution?.item?.name || '',
    execution?.request?.method || '',
    execution?.response?.code || '',
    (execution?.assertions || []).map((assertion) => assertion.assertion || '').join('|')
  ].join('|');
}

function normalizedFields() {
  return [
    'timestamps',
    'run durations',
    'response timings',
    'randomized localhost ports',
    'host filesystem paths',
    'machine-specific process metadata',
    'raw reporter cursor ids where duplicated by Newman internals'
  ];
}

function readmeContent() {
  return `# Newman Report Evidence

This folder contains checked-in Newman JSON evidence for the Newman-compatible differential suites.

Target: \`newman@${TARGET.newman}\` with Postman Runtime ${TARGET.postmanRuntime}.

The \`raw-newman/\` folder stores the captured Newman JSON reporter output. The \`normalized-newman/\` and \`normalized-postmeter/\` folders store deterministic evidence used by CI. Normalization removes timestamps, durations, localhost ports, host paths, and machine-specific metadata while preserving request order, request names, response codes, assertion names, pass/fail state, and failure messages.

Regenerate from a fresh live comparison:

\`\`\`bash
npm run postman:parity:diff -- --newman --download-newman --output /tmp/postmeter-newman-evidence
npm run postman:newman-reports:write -- --from /tmp/postmeter-newman-evidence
\`\`\`

Validate without network access:

\`\`\`bash
npm run postman:newman-reports:validate
\`\`\`

This evidence covers Newman-compatible request-script behavior. Desktop-only flows such as local vault prompts are covered by focused PostMeter tests and docs instead of Newman reports.
`;
}

function valueForFlag(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  NORMALIZED_DIR,
  POSTMETER_DIR,
  RAW_DIR,
  REPORT_DIR,
  SUITES,
  TARGET,
  normalizeNewmanReport,
  validateReports,
  writeReports
};
