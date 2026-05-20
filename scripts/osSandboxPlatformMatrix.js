#!/usr/bin/env node

const {
  validateCommittedOsSandboxPlatformClaim,
  validateCommittedOsSandboxPlatformMatrix,
  writeOsSandboxPlatformMatrix
} = require('../src/core/sandbox/osSandboxPlatformHarness');

async function main() {
  const command = process.argv[2] || 'validate';
  if (command === 'write-matrix') {
    const matrix = await writeOsSandboxPlatformMatrix();
    console.log(`Wrote OS sandbox platform matrix with ${matrix.rows.length} rows.`);
    return;
  }
  if (command === 'validate') {
    const result = await validateCommittedOsSandboxPlatformMatrix();
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`OS sandbox platform matrix valid: ${result.summary.rowCount} rows.`);
    return;
  }
  if (command === 'claim') {
    const result = await validateCommittedOsSandboxPlatformClaim();
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(error);
      }
      if (result.blockers.length) {
        console.error('Platform OS sandbox claim blockers:');
        for (const row of result.blockers) {
          console.error(`- ${row.id} [${row.platform}/${row.status}] ${row.target}`);
        }
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Implemented tier-one OS sandbox backend claim gate passed: ${result.summary.claim.rowCount} rows, zero blockers.`);
    return;
  }
  console.error(`Unknown command: ${command}`);
  console.error('Usage: node scripts/osSandboxPlatformMatrix.js <validate|write-matrix|claim>');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
