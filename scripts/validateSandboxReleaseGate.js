#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const PROJECT_ROOT = path.join(__dirname, '..');
const errors = [];
const packageJson = readJson('package.json');
const ciWorkflow = readText('.github/workflows/ci.yml');
const releaseWorkflow = readText('.github/workflows/release.yml');
const releaseValidationWorkflow = readText('.github/workflows/release-validation.yml');
const oauthProviderCertificationWorkflow = readText('.github/workflows/oauth-provider-certification.yml');
const ciWorkflowDocument = parseWorkflow('CI workflow', ciWorkflow);
const releaseWorkflowDocument = parseWorkflow('Release workflow', releaseWorkflow);
const releaseValidationWorkflowDocument = parseWorkflow('Manual native release validation workflow', releaseValidationWorkflow);
const validateSandboxRuntimeScript = readText('scripts/validateSandboxRuntime.js');
const validatePackagedSandboxRuntimeScript = readText('scripts/validatePackagedSandboxRuntime.js');
const productionSupportMatricesSource = readText('src/core/productionSupportMatrices.js');
const productionReadinessMatrixSource = readText('src/core/productionReadinessMatrix.js');

requireScript('check', [
  'npm test',
  'npm run sandbox:validate',
  'npm run sandbox:platform:validate',
  'npm run postman:parity:validate',
  'npm run postman:docs:validate',
  'npm run postman:newman-reports:validate',
  'npm run oauth:certify:validate',
  'npm run oauth:certify:mock',
  'npm run production:readiness:validate',
  'npm run electron:security:validate',
  'npm run workspace:durability:validate',
  'npm run compatibility:non-postman:validate',
  'npm run ux:accessibility:validate',
  'npm run diagnostics:privacy:validate',
  'npm run release:gate',
  'npm run test:smoke',
  'npm run test:ui',
  'npm run test:ui:regression',
  'npm run test:ui:typography',
  'npm run test:ui:oauth',
  'npm run test:ui:snapshot',
  'npm audit --audit-level=high',
  'npm run electron:version'
]);
for (const scriptName of [
  'sandbox:validate',
  'sandbox:validate:packaged',
  'sandbox:platform:validate',
  'sandbox:platform:claim',
  'native:windows-sandbox:build',
  'postman:parity:validate',
  'postman:parity:claim',
  'postman:parity:diff',
  'postman:docs:validate',
  'postman:docs:write',
  'postman:docs:live',
  'postman:newman-reports:validate',
  'oauth:certify:validate',
  'oauth:certify:write',
  'oauth:certify:mock',
  'oauth:certify:live',
  'production:readiness',
  'production:readiness:write',
  'production:readiness:validate',
  'production:readiness:claim',
  'production:readiness:claim:beta',
  'production:readiness:claim:rc',
  'production:readiness:claim:stable',
  'electron:security:validate',
  'workspace:durability:validate',
  'compatibility:non-postman:validate',
  'ux:accessibility:validate',
  'diagnostics:privacy:write',
  'diagnostics:privacy:validate',
  'test:smoke',
  'test:ui',
  'test:ui:regression',
  'test:ui:typography',
  'release:gate',
  'test:ui:oauth',
  'test:ui:snapshot',
  'release:validate',
  'release:validate:packaged-smoke',
  'release:validate:win-protocol',
  'release:validate:mac-protocol'
]) {
  requireScript(scriptName);
}
for (const scriptName of ['pack:linux', 'dist:linux', 'dist:win', 'dist:mac']) {
  requireScript(scriptName, ['electron-builder', '--publish never']);
}
requireScript('dist:win', ['npm run native:windows-sandbox:build']);
requireWindowsSandboxHelperPackaging();

requireFile('Source-tree sandbox validation timeout guard', validateSandboxRuntimeScript, [
  /spawnWithTimeout/,
  /POSTMETER_SANDBOX_VALIDATE_TIMEOUT_MS/,
  /timed out/
]);
requireFile('Packaged sandbox validation timeout guard', validatePackagedSandboxRuntimeScript, [
  /spawnWithTimeout/,
  /POSTMETER_PACKAGED_SANDBOX_VALIDATE_TIMEOUT_MS/,
  /timed out/
]);
requireFile('UX/accessibility source matrix', productionSupportMatricesSource, [
  /npm run test:smoke/,
  /test\/electron\/smokeProcess\.test\.js/,
  /scripts\/smokeProcess\.js/
]);
requireFile('Production readiness source matrix', productionReadinessMatrixSource, [
  /npm run test:smoke/,
  /scripts\/smokeProcess\.js/
]);

requireWorkflow('CI workflow', ciWorkflow, [
  /node-version:\s*22/,
  /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*"1"/,
  /apt-get install -y bubblewrap/,
  /npm test/,
  /npm run postman:parity:validate/,
  /npm run postman:docs:validate/,
  /npm run postman:newman-reports:validate/,
  /npm run oauth:certify:validate/,
  /npm run oauth:certify:mock/,
  /npm run production:readiness:validate/,
  /npm run electron:security:validate/,
  /npm run workspace:durability:validate/,
  /npm run compatibility:non-postman:validate/,
  /npm run ux:accessibility:validate/,
  /npm run diagnostics:privacy:validate/,
  /npm run release:gate/,
  /xvfb-run -a npm run test:smoke/,
  /xvfb-run -a npm run test:ui/,
  /xvfb-run -a npm run test:ui:regression/,
  /xvfb-run -a npm run test:ui:typography/,
  /xvfb-run -a npm run test:ui:oauth/,
  /xvfb-run -a npm run test:ui:snapshot/,
  /npm audit --audit-level=high/,
  /npm run sandbox:validate/,
  /npm run sandbox:platform:validate/,
  /npm run pack:linux/,
  /platform:\s*linux/,
  /Prepare native helpers/,
  /Source-tree sandbox runtime validation/,
  /POSTMETER_ALLOW_OS_SANDBOX_VALIDATION_SKIP:\s*\$\{\{ matrix\.allow_os_skip \}\}/,
  /npm run dist:linux/,
  /npm run release:validate:packaged-smoke/,
  /POSTMETER_VALIDATION_ARTIFACT_DIR/,
  /npm run release:validate:win-protocol/,
  /npm run release:validate:mac-protocol/,
  /Upload native package artifacts/,
  /release\/latest\*\.yml/,
  /release\/\*\.blockmap/,
  /if-no-files-found:\s*error/,
  /Upload native validation logs/,
  /windows-latest/,
  /macos-latest/,
  /xvfb-run -a npm run sandbox:validate:packaged/
]);

requireWorkflow('Release workflow', releaseWorkflow, [
  /platform:\s*linux/,
  /ci_no_sandbox:\s*"1"/,
  /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*\$\{\{ matrix\.ci_no_sandbox \}\}/,
  /platform:\s*windows/,
  /platform:\s*macos/,
  /npm run sandbox:validate/,
  /npm run sandbox:platform:validate/,
  /npm run postman:parity:validate/,
  /npm run postman:docs:validate/,
  /npm run postman:newman-reports:validate/,
  /npm run oauth:certify:validate/,
  /npm run oauth:certify:mock/,
  /npm run production:readiness:validate/,
  /npm run production:readiness:claim:stable/,
  /npm run electron:security:validate/,
  /npm run workspace:durability:validate/,
  /npm run compatibility:non-postman:validate/,
  /npm run ux:accessibility:validate/,
  /npm run diagnostics:privacy:validate/,
  /npm run release:gate/,
  /npm run test:smoke/,
  /xvfb-run -a npm run test:smoke/,
  /npm run test:ui/,
  /npm run test:ui:regression/,
  /xvfb-run -a npm run test:ui/,
  /xvfb-run -a npm run test:ui:regression/,
  /npm run test:ui:typography/,
  /xvfb-run -a npm run test:ui:typography/,
  /xvfb-run -a npm run test:ui:oauth/,
  /npm run test:ui:snapshot/,
  /xvfb-run -a npm run test:ui:snapshot/,
  /npm run release:validate:packaged-smoke/,
  /POSTMETER_VALIDATION_ARTIFACT_DIR/,
  /npm run sandbox:validate:packaged/,
  /xvfb-run -a npm run sandbox:validate:packaged/,
  /npm run release:validate:win-protocol/,
  /npm run release:validate:mac-protocol/,
  /Upload validation logs/,
  /release\/latest\*\.yml/,
  /release\/\*\.blockmap/,
  /if:\s*always\(\)/,
  /if-no-files-found:\s*error/,
  /npm run release:validate/
]);

requireWorkflow('Manual native release validation workflow', releaseValidationWorkflow, [
  /workflow_dispatch:/,
  /contents:\s*read/,
  /platform:\s*linux/,
  /ci_no_sandbox:\s*"1"/,
  /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*\$\{\{ matrix\.ci_no_sandbox \}\}/,
  /platform:\s*windows/,
  /platform:\s*macos/,
  /npm run sandbox:validate/,
  /npm run sandbox:platform:validate/,
  /npm run postman:parity:validate/,
  /npm run postman:docs:validate/,
  /npm run postman:newman-reports:validate/,
  /npm run oauth:certify:validate/,
  /npm run oauth:certify:mock/,
  /npm run production:readiness:validate/,
  /npm run electron:security:validate/,
  /npm run workspace:durability:validate/,
  /npm run compatibility:non-postman:validate/,
  /npm run ux:accessibility:validate/,
  /npm run diagnostics:privacy:validate/,
  /npm run release:gate/,
  /npm run test:smoke/,
  /xvfb-run -a npm run test:smoke/,
  /npm run test:ui/,
  /npm run test:ui:regression/,
  /xvfb-run -a npm run test:ui/,
  /xvfb-run -a npm run test:ui:regression/,
  /npm run test:ui:typography/,
  /xvfb-run -a npm run test:ui:typography/,
  /xvfb-run -a npm run test:ui:oauth/,
  /npm run test:ui:snapshot/,
  /xvfb-run -a npm run test:ui:snapshot/,
  /npm run release:validate:packaged-smoke/,
  /POSTMETER_VALIDATION_ARTIFACT_DIR/,
  /npm run sandbox:validate:packaged/,
  /xvfb-run -a npm run sandbox:validate:packaged/,
  /npm run release:validate:win-protocol/,
  /npm run release:validate:mac-protocol/,
  /Upload validation logs/,
  /release\/latest\*\.yml/,
  /release\/\*\.blockmap/,
  /if-no-files-found:\s*error/,
  /npm run release:prepare/,
  /npm run release:validate/,
  /actions\/upload-artifact@v4/,
  /actions\/download-artifact@v4/
]);

for (const [label, workflowDocument, requiredRunSteps] of [
  ['CI workflow', ciWorkflowDocument, [
    /npm test/,
    /npm run sandbox:validate/,
    /npm run sandbox:platform:validate/,
    /npm run postman:parity:validate/,
    /npm run postman:docs:validate/,
    /npm run postman:newman-reports:validate/,
    /npm run oauth:certify:validate/,
    /npm run oauth:certify:mock/,
    /npm run production:readiness:validate/,
    /npm run electron:security:validate/,
    /npm run workspace:durability:validate/,
    /npm run compatibility:non-postman:validate/,
    /npm run ux:accessibility:validate/,
    /npm run diagnostics:privacy:validate/,
    /npm run release:gate/,
    /xvfb-run -a npm run test:smoke/,
    /xvfb-run -a npm run test:ui\b/,
    /xvfb-run -a npm run test:ui:regression/,
    /xvfb-run -a npm run test:ui:typography/,
    /xvfb-run -a npm run test:ui:oauth/,
    /xvfb-run -a npm run test:ui:snapshot/,
    /npm audit --audit-level=high/,
    /npm run pack:linux/,
    /\$\{\{\s*matrix\.command\s*\}\}/,
    /npm run release:validate:packaged-smoke/,
    /xvfb-run -a npm run sandbox:validate:packaged/,
    /npm run release:validate:win-protocol/,
    /npm run release:validate:mac-protocol/
  ]],
  ['Release workflow', releaseWorkflowDocument, [
    /npm test/,
    /npm run sandbox:validate/,
    /npm run sandbox:platform:validate/,
    /npm run postman:parity:validate/,
    /npm run postman:docs:validate/,
    /npm run postman:newman-reports:validate/,
    /npm run oauth:certify:validate/,
    /npm run oauth:certify:mock/,
    /npm run production:readiness:validate/,
    /npm run production:readiness:claim:stable/,
    /npm run electron:security:validate/,
    /npm run workspace:durability:validate/,
    /npm run compatibility:non-postman:validate/,
    /npm run ux:accessibility:validate/,
    /npm run diagnostics:privacy:validate/,
    /npm run release:gate/,
    /npm run test:smoke/,
    /npm run test:ui\b/,
    /npm run test:ui:regression/,
    /npm run test:ui:typography/,
    /npm run test:ui:oauth/,
    /npm run test:ui:snapshot/,
    /npm run sandbox:validate:packaged/,
    /npm run release:validate:packaged-smoke/,
    /npm run release:validate:win-protocol/,
    /npm run release:validate:mac-protocol/,
    /npm run release:prepare/,
    /npm run release:validate/
  ]],
  ['Manual native release validation workflow', releaseValidationWorkflowDocument, [
    /npm test/,
    /npm run sandbox:validate/,
    /npm run sandbox:platform:validate/,
    /npm run postman:parity:validate/,
    /npm run postman:docs:validate/,
    /npm run postman:newman-reports:validate/,
    /npm run oauth:certify:validate/,
    /npm run oauth:certify:mock/,
    /npm run production:readiness:validate/,
    /npm run electron:security:validate/,
    /npm run workspace:durability:validate/,
    /npm run compatibility:non-postman:validate/,
    /npm run ux:accessibility:validate/,
    /npm run diagnostics:privacy:validate/,
    /npm run release:gate/,
    /npm run test:smoke/,
    /npm run test:ui\b/,
    /npm run test:ui:regression/,
    /npm run test:ui:typography/,
    /npm run test:ui:oauth/,
    /npm run test:ui:snapshot/,
    /npm run sandbox:validate:packaged/,
    /npm run release:validate:packaged-smoke/,
    /npm run release:validate:win-protocol/,
    /npm run release:validate:mac-protocol/,
    /npm run release:prepare/,
    /npm run release:validate/
  ]]
]) {
  requireWorkflowRunSteps(label, workflowDocument, requiredRunSteps);
}
for (const [label, workflowDocument] of [
  ['CI workflow', ciWorkflowDocument],
  ['Release workflow', releaseWorkflowDocument],
  ['Manual native release validation workflow', releaseValidationWorkflowDocument]
]) {
  requireValidationLogUploads(label, workflowDocument);
}

requireWorkflow('OAuth provider certification workflow', oauthProviderCertificationWorkflow, [
  /workflow_dispatch:/,
  /provider:/,
  /run_live:/,
  /evidence_path:/,
  /contents:\s*read/,
  /npm run oauth:certify:validate/,
  /npm run oauth:certify:mock/,
  /POSTMETER_LIVE_OAUTH_CERTIFICATION:\s*"1"/,
  /POSTMETER_LIVE_OAUTH_EVIDENCE_FILE/,
  /npm run oauth:certify:live/,
  /Confirm live OAuth provider certification skip/,
  /POSTMETER_GOOGLE_OAUTH_CLIENT_ID/,
  /POSTMETER_ENTRA_OAUTH_CLIENT_ID/,
  /POSTMETER_GITHUB_OAUTH_CLIENT_ID/
]);

if (/gh release create/.test(releaseValidationWorkflow) || /contents:\s*write/.test(releaseValidationWorkflow)) {
  errors.push('Manual native release validation workflow must validate artifacts without publishing a GitHub Release.');
}

for (const [label, workflow] of [
  ['CI workflow', ciWorkflow],
  ['Release workflow', releaseWorkflow],
  ['Manual native release validation workflow', releaseValidationWorkflow]
]) {
  if (/release\/\*\.(msi|rpm)/.test(workflow)) {
    errors.push(`${label} must not upload unconfigured MSI/RPM release artifact types.`);
  }
}

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

function requireWorkflowRunSteps(label, workflowDocument, patterns) {
  const runSteps = workflowRunSteps(workflowDocument);
  for (const pattern of patterns) {
    if (!runSteps.some((run) => pattern.test(run))) {
      errors.push(`${label} is missing executable run step ${pattern}.`);
    }
  }
}

function workflowRunSteps(workflowDocument) {
  const jobs = Object.values(workflowDocument?.jobs || {});
  const stepRuns = jobs
    .flatMap((job) => Array.isArray(job?.steps) ? job.steps : [])
    .map((step) => step?.run)
    .filter((run) => typeof run === 'string');
  const matrixCommands = jobs
    .flatMap((job) => Array.isArray(job?.strategy?.matrix?.include) ? job.strategy.matrix.include : [])
    .flatMap((entry) => Object.entries(entry || {})
      .filter(([key, value]) => key.endsWith('command') && typeof value === 'string')
      .map(([, value]) => value));
  return [...stepRuns, ...matrixCommands];
}

function workflowSteps(workflowDocument) {
  return Object.values(workflowDocument?.jobs || {})
    .flatMap((job) => Array.isArray(job?.steps) ? job.steps : [])
    .filter((step) => step && typeof step === 'object');
}

function requireValidationLogUploads(label, workflowDocument) {
  const uploadSteps = workflowSteps(workflowDocument).filter((step) => (
    /validation logs/i.test(String(step.name || ''))
    && /^actions\/upload-artifact@/.test(String(step.uses || ''))
  ));
  if (!uploadSteps.length) {
    errors.push(`${label} is missing a validation-log artifact upload step.`);
    return;
  }
  for (const step of uploadSteps) {
    const missingPolicy = String(step.with?.['if-no-files-found'] || '');
    if (missingPolicy !== 'error') {
      errors.push(`${label} validation-log upload "${step.name}" must use if-no-files-found: error.`);
    }
    const artifactPath = String(step.with?.path || '');
    if (!artifactPath.includes('validation-artifacts')) {
      errors.push(`${label} validation-log upload "${step.name}" must upload validation-artifacts.`);
    }
  }
}

function requireFile(label, content, patterns) {
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      errors.push(`${label} is missing release-gate pattern ${pattern}.`);
    }
  }
}

function requireWindowsSandboxHelperPackaging() {
  const resources = packageJson.build?.win?.extraResources;
  if (!Array.isArray(resources) || !resources.some((entry) => (
    entry?.from === 'native/windows-sandbox-helper/bin/PostMeterWindowsSandboxHelper.exe'
    && entry?.to === 'native/windows/PostMeterWindowsSandboxHelper.exe'
  ))) {
    errors.push('package.json build.win.extraResources must package the Windows AppContainer sandbox helper.');
  }
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function parseWorkflow(label, content) {
  try {
    return YAML.parse(content);
  } catch (error) {
    errors.push(`${label} is not valid YAML: ${error.message || String(error)}`);
    return {};
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}
