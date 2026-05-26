#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW_DIR = path.join(PROJECT_ROOT, '.github', 'workflows');
const FULL_SHA = /^[a-f0-9]{40}$/;
const LOCAL_ACTION = /^\.\//;

function main(argv = process.argv.slice(2)) {
  const files = argv.length
    ? argv.map((value) => path.resolve(PROJECT_ROOT, value))
    : workflowFiles(WORKFLOW_DIR);
  const findings = validateGithubWorkflows({ files });
  if (findings.length) {
    for (const finding of findings) {
      console.error(`${finding.file}${finding.line ? `:${finding.line}` : ''}: ${finding.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('GitHub workflow security validation passed.');
}

function workflowFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => path.join(dir, name))
    .sort();
}

function validateGithubWorkflows(options = {}) {
  const files = options.files || workflowFiles(WORKFLOW_DIR);
  return files.flatMap((filePath) => validateGithubWorkflowFile(filePath));
}

function validateGithubWorkflowSource(source, file = '<workflow>') {
  const findings = [];
  const parsed = parseWorkflow(source, file, findings);
  if (parsed) {
    validatePermissions(parsed, file, findings);
    validateTriggers(parsed, file, findings);
    validateRequiredSupplyChainControls(parsed, source, file, findings);
  }
  validateUsesPins(source, file, findings);
  validateRunInterpolations(source, file, findings);
  return findings;
}

function validateRequiredSupplyChainControls(workflow, source, file, findings) {
  const normalizedFile = String(file || '').replaceAll('\\', '/');
  if (normalizedFile.endsWith('/ci.yml') || normalizedFile === 'ci.yml' || normalizedFile.endsWith('/ci.yaml') || normalizedFile === 'ci.yaml') {
    if (!/actions\/dependency-review-action@[a-f0-9]{40}/.test(source)) {
      findings.push({ file, message: 'CI workflow must include a pinned dependency-review action.' });
    }
  }
  if (normalizedFile.endsWith('/release.yml') || normalizedFile === 'release.yml' || normalizedFile.endsWith('/release.yaml') || normalizedFile === 'release.yaml') {
    if (!/actions\/attest-build-provenance@[a-f0-9]{40}/.test(source)) {
      findings.push({ file, message: 'release workflow must include a pinned provenance attestation action.' });
    }
    const jobs = workflow?.jobs && typeof workflow.jobs === 'object' ? workflow.jobs : {};
    const attestationJob = Object.entries(jobs).find(([jobName]) => /attest|provenance/i.test(jobName))?.[1];
    if (permissionValue(attestationJob?.permissions, 'id-token') !== 'write'
      || permissionValue(attestationJob?.permissions, 'attestations') !== 'write') {
      findings.push({ file, message: 'release provenance job must scope id-token: write and attestations: write to the attestation job.' });
    }
  }
}

function validateGithubWorkflowFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return validateGithubWorkflowSource(source, relative(filePath));
}

function parseWorkflow(source, file, findings) {
  try {
    return YAML.parse(source);
  } catch (error) {
    findings.push({ file, message: `workflow YAML did not parse: ${error.message}` });
    return null;
  }
}

function validateTriggers(workflow, file, findings) {
  const triggers = workflow?.on || workflow?.true || {};
  if (typeof triggers === 'string') {
    if (triggers === 'pull_request_target') {
      findings.push({ file, message: 'pull_request_target is not allowed.' });
    }
    return;
  }
  if (Array.isArray(triggers)) {
    if (triggers.includes('pull_request_target')) {
      findings.push({ file, message: 'pull_request_target is not allowed.' });
    }
    return;
  }
  if (Object.hasOwn(triggers, 'pull_request_target')) {
    findings.push({ file, message: 'pull_request_target is not allowed.' });
  }
}

function validatePermissions(workflow, file, findings) {
  const workflowPermissions = workflow?.permissions;
  if (permissionValue(workflowPermissions, 'contents') === 'write') {
    findings.push({ file, message: 'workflow-level contents: write is not allowed; scope write permissions to the publish job.' });
  }
  const jobs = workflow?.jobs && typeof workflow.jobs === 'object' ? workflow.jobs : {};
  for (const [jobName, job] of Object.entries(jobs)) {
    const contents = permissionValue(job?.permissions, 'contents');
    if (contents === 'write' && jobName !== 'publish') {
      findings.push({ file, message: `job ${jobName} must not request contents: write.` });
    }
    const idToken = permissionValue(job?.permissions, 'id-token');
    if (idToken === 'write' && !/attest|provenance|publish/i.test(jobName)) {
      findings.push({ file, message: `job ${jobName} must not request id-token: write without an attestation/provenance purpose.` });
    }
  }
}

function permissionValue(permissions, key) {
  if (!permissions || typeof permissions !== 'object') {
    return '';
  }
  return String(permissions[key] || '').toLowerCase();
}

function validateUsesPins(source, file, findings) {
  const lines = String(source || '').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*-?\s*uses:\s*([^@\s#]+)(?:@([^\s#]+))?/);
    if (!match) {
      continue;
    }
    const [, action, ref = ''] = match;
    if (/\$\{\{/.test(action) || /\$\{\{/.test(ref)) {
      findings.push({
        file,
        line: index + 1,
        message: 'dynamic action references are not allowed in uses; pin a literal action to a full commit SHA.'
      });
      continue;
    }
    if (LOCAL_ACTION.test(action)) {
      continue;
    }
    if (!FULL_SHA.test(ref)) {
      findings.push({
        file,
        line: index + 1,
        message: `action ${action} must be pinned to a full commit SHA, not ${ref || '<missing ref>'}.`
      });
    }
    if (!/#\s*[^@#]+@v?\d/.test(line)) {
      findings.push({
        file,
        line: index + 1,
        message: `pinned action ${action} must include a comment with the original action and version.`
      });
    }
  }
}

function validateRunInterpolations(source, file, findings) {
  const lines = String(source || '').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!/\$\{\{\s*(github\.event|inputs\.)/.test(line)) {
      continue;
    }
    if (/"\$\{\{\s*(github\.event|inputs\.)[^}]+}}"|'\$\{\{\s*(github\.event|inputs\.)[^}]+}}'|\$\{\{\s*inputs\.[A-Za-z0-9_]+\s*}}/.test(line)) {
      continue;
    }
    findings.push({
      file,
      line: index + 1,
      message: 'untrusted github.event or workflow input interpolation in shell should be quoted or passed through env.'
    });
  }
}

function relative(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replaceAll(path.sep, '/');
}

if (require.main === module) {
  main();
}

module.exports = {
  validateGithubWorkflowSource,
  validateGithubWorkflows
};
