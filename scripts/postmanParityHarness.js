#!/usr/bin/env node

const path = require('node:path');
const {
  DEFAULT_OUTPUT_DIR,
  runPostmanParityDifferential,
  validateCommittedParityMatrix,
  validateCommittedProductionClaim,
  writeParityMatrix
} = require('../src/core/postmanParityHarness');

async function main() {
  const command = process.argv[2] || 'validate';
  if (command === 'write-matrix') {
    const matrix = await writeParityMatrix();
    console.log(`Wrote Postman parity matrix with ${matrix.rows.length} rows.`);
    return;
  }
  if (command === 'validate') {
    const result = await validateCommittedParityMatrix();
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Postman parity matrix valid: ${result.summary.rowCount} rows.`);
    return;
  }
  if (command === 'claim') {
    const result = await validateCommittedProductionClaim();
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(error);
      }
      if (result.blockers.length) {
        console.error('Default-import claim blockers:');
        for (const row of result.blockers.slice(0, 50)) {
          console.error(`- ${row.id} [${row.status}] ${row.target}`);
        }
        if (result.blockers.length > 50) {
          console.error(`- ... ${result.blockers.length - 50} more`);
        }
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Postman 1:1 script compatibility claim gate passed: ${result.summary.claim.defaultImportRows} default-import rows, zero blockers.`);
    return;
  }
  if (command === 'diff') {
    const runNewman = hasFlag('--newman') || process.env.POSTMETER_PARITY_RUN_NEWMAN === '1';
    const requireNewman = hasFlag('--require-newman');
    const allowNewmanDownload = hasFlag('--download-newman') || process.env.POSTMETER_PARITY_DOWNLOAD_NEWMAN === '1';
    const outputDir = valueForFlag('--output') || DEFAULT_OUTPUT_DIR;
    const result = await runPostmanParityDifferential({
      allowNewmanDownload,
      outputDir: path.resolve(outputDir),
      requireNewman,
      runNewman: runNewman || requireNewman
    });
    if (result.comparison?.passed === false) {
      console.error(JSON.stringify(result.comparison.differences, null, 2));
      process.exitCode = 1;
      return;
    }
    const skippedSuites = (result.suites || []).filter((suite) => suite.newman?.skipped);
    const newmanState = skippedSuites.length === (result.suites || []).length
      ? `Newman skipped: ${skippedSuites[0]?.newman?.reason || result.newman?.reason || 'not requested'}`
      : skippedSuites.length
        ? `Newman partially compared; skipped ${skippedSuites.length} suite(s).`
        : 'Newman compared.';
    console.log(`Postman parity differential completed. ${newmanState}`);
    return;
  }
  console.error(`Unknown command: ${command}`);
  console.error('Usage: node scripts/postmanParityHarness.js <validate|write-matrix|claim|diff> [--newman] [--require-newman] [--download-newman] [--output DIR]');
  process.exitCode = 1;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function valueForFlag(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
