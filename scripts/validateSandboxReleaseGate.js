#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const packageJson = readJson('package.json');
const ciWorkflow = readText('.github/workflows/ci.yml');
const releaseWorkflow = readText('.github/workflows/release.yml');
const errors = [];

requireScript('check', [
  'npm test',
  'npm run sandbox:validate',
  'npm run sandbox:platform:validate',
  'npm run postman:parity:validate',
  'npm run postman:docs:validate',
  'npm run release:gate',
  'npm audit --audit-level=high',
  'npm run electron:version'
]);
for (const scriptName of [
  'sandbox:validate',
  'sandbox:validate:packaged',
  'sandbox:platform:validate',
  'sandbox:platform:claim',
  'postman:parity:validate',
  'postman:parity:claim',
  'postman:parity:diff',
  'postman:docs:validate',
  'postman:docs:write',
  'postman:docs:live',
  'release:gate',
  'release:validate',
  'release:validate:win-protocol',
  'release:validate:mac-protocol'
]) {
  requireScript(scriptName);
}

requireWorkflow('CI workflow', ciWorkflow, [
  /node-version:\s*22/,
  /apt-get install -y bubblewrap/,
  /npm test/,
  /npm run postman:parity:validate/,
  /npm run postman:docs:validate/,
  /npm run release:gate/,
  /npm audit --audit-level=high/,
  /npm run sandbox:validate/,
  /npm run sandbox:platform:validate/,
  /npm run pack:linux/,
  /xvfb-run -a npm run sandbox:validate:packaged/
]);

requireWorkflow('Release workflow', releaseWorkflow, [
  /platform:\s*linux/,
  /platform:\s*windows/,
  /platform:\s*macos/,
  /npm run sandbox:validate/,
  /npm run sandbox:platform:validate/,
  /npm run postman:parity:validate/,
  /npm run postman:docs:validate/,
  /npm run release:gate/,
  /npm run sandbox:validate:packaged/,
  /xvfb-run -a npm run sandbox:validate:packaged/,
  /npm run release:validate:win-protocol/,
  /npm run release:validate:mac-protocol/,
  /npm run release:validate/
]);

if (errors.length) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log('Sandbox production release gate manifest is valid.');

function requireScript(name, fragments = []) {
  const command = packageJson.scripts?.[name];
  if (typeof command !== 'string' || !command.trim()) {
    errors.push(`package.json script "${name}" is required by the sandbox production release gate.`);
    return;
  }
  for (const fragment of fragments) {
    if (!command.includes(fragment)) {
      errors.push(`package.json script "${name}" must include "${fragment}".`);
    }
  }
}

function requireWorkflow(label, content, patterns) {
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      errors.push(`${label} is missing release-gate pattern ${pattern}.`);
    }
  }
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}
