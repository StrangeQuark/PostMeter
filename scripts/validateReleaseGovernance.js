#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const REQUIRED_DOC_SNIPPETS = [
  'protected `main`',
  'protected `v*` tags',
  'required reviews',
  'required status checks',
  'no direct pushes',
  'protected `release` environment',
  'secret scanning',
  'push protection',
  'Dependabot',
  'release environment approval'
];

function main() {
  const findings = validateReleaseGovernance();
  if (findings.length) {
    console.error('Release governance controls requiring manual repository settings:');
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Release governance documentation validation passed.');
  console.log('Manual controls still require GitHub org/repo verification: protected main, protected v* tags, release environment approvals, secret scanning/push protection, Dependabot, and required status checks.');
}

function validateReleaseGovernance(options = {}) {
  const docPath = options.docPath || path.join(PROJECT_ROOT, 'docs', 'RELEASE_SECURITY.md');
  const source = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : '';
  const findings = [];
  if (!source) {
    findings.push('docs/RELEASE_SECURITY.md is missing.');
    return findings;
  }
  for (const snippet of REQUIRED_DOC_SNIPPETS) {
    if (!source.includes(snippet)) {
      findings.push(`docs/RELEASE_SECURITY.md must document ${snippet}.`);
    }
  }
  return findings;
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_DOC_SNIPPETS,
  validateReleaseGovernance
};
