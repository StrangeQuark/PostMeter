#!/usr/bin/env node

const {
  runLiveDocsCoverageAudit,
  validateCommittedDocsCoverageAudit,
  writeDocsCoverageAudit
} = require('../src/core/diagnostics-release/postmanDocsCoverageAudit');

async function main() {
  const command = process.argv[2] || 'validate';
  if (command === 'write') {
    const audit = await writeDocsCoverageAudit({ live: hasFlag('--live') || !hasFlag('--offline') });
    printSummary('Wrote Postman docs coverage audit', audit);
    return;
  }
  if (command === 'validate') {
    const result = await validateCommittedDocsCoverageAudit();
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    printSummary('Postman docs coverage audit valid', result.audit);
    return;
  }
  if (command === 'live') {
    const audit = await runLiveDocsCoverageAudit();
    const result = require('../src/core/diagnostics-release/postmanDocsCoverageAudit').validateDocsCoverageAudit(audit);
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    printSummary('Live Postman docs coverage audit valid', audit);
    return;
  }
  console.error(`Unknown command: ${command}`);
  console.error('Usage: node scripts/postmanDocsCoverageAudit.js <validate|write|live> [--live|--offline]');
  process.exitCode = 1;
}

function printSummary(prefix, audit) {
  const summary = audit.summary || {};
  const unmatched = Array.isArray(summary.unmatched) ? summary.unmatched.length : 0;
  console.log(`${prefix}: ${summary.tokenCount || 0} tokens from ${summary.sourceCount || 0} official sources; unmatched=${unmatched}.`);
}

function printErrors(errors) {
  for (const error of errors) {
    console.error(error);
  }
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
