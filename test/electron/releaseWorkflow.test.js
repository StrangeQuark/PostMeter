const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');

test('CI workflow runs the Electron UI and packaging validation suite', async () => {
  const root = path.join(__dirname, '..', '..');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const workflowDocument = YAML.parse(workflow);
  assertValidationLogUploadsFailClosed(workflowDocument, 'ci.yml');

  assertWorkflowRunsOnlyOnMainPullRequests(workflowDocument, 'ci.yml');
  assertNoPlatformSpecificSkippedSteps(workflowDocument, 'ci.yml');
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /apt-get install -y bubblewrap/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run postman:parity:validate/);
  assert.match(workflow, /npm run postman:docs:validate/);
  assert.match(workflow, /npm run oauth:certify:validate/);
  assert.match(workflow, /npm run oauth:certify:mock/);
  assert.match(workflow, /npm run production:readiness:validate/);
  assert.match(workflow, /npm run electron:security:validate/);
  assert.match(workflow, /npm run workspace:durability:validate/);
  assert.match(workflow, /npm run compatibility:non-postman:validate/);
  assert.match(workflow, /npm run ux:accessibility:validate/);
  assert.match(workflow, /npm run diagnostics:privacy:validate/);
  assert.match(workflow, /npm run release:gate/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.match(workflow, /npm run sandbox:validate/);
  assert.match(workflow, /npm run sandbox:platform:validate/);
  assert.match(workflow, /xvfb-run -a npm run test:smoke/);
  assert.match(workflow, /xvfb-run -a npm run test:ui\b/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:regression/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:typography/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:oauth/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:snapshot/);
  assert.match(workflow, /npm run pack:linux/);
  assert.match(workflow, /ci_no_sandbox:\s*"1"/);
  assert.match(workflow, /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*\$\{\{ matrix\.ci_no_sandbox \}\}/);
  assert.match(workflow, /xvfb-run -a npm run sandbox:validate:packaged/);
  assert.match(workflow, /POSTMETER_VALIDATION_ARTIFACT_DIR:\s*validation-artifacts\/linux/);
  assert.match(workflow, /name:\s*Native packaged smoke/);
  assert.match(workflow, /platform:\s*linux/);
  assert.match(workflow, /Prepare native helpers/);
  assert.match(workflow, /npm run native:windows-sandbox:build/);
  assert.match(workflow, /Source-tree sandbox runtime validation/);
  assert.match(workflow, /npm run sandbox:validate/);
  assert.match(workflow, /npm run sandbox:platform:validate/);
  assert.match(workflow, /npm run dist:linux/);
  assert.match(workflow, /xvfb-run -a npm run release:validate:packaged-smoke/);
  assert.match(workflow, /npm run release:validate:win-protocol/);
  assert.match(workflow, /npm run release:validate:mac-protocol/);
  assert.match(workflow, /Upload native package artifacts/);
  assert.match(workflow, /release\/\*\.AppImage/);
  assert.match(workflow, /release\/\*\.deb/);
  assert.match(workflow, /release\/latest\*\.yml/);
  assert.match(workflow, /release\/\*\.blockmap/);
  assert.doesNotMatch(workflow, /release\/\*\.msi/);
  assert.doesNotMatch(workflow, /release\/\*\.rpm/);
  assert.match(workflow, /if-no-files-found:\s*error/);
  assert.match(workflow, /Upload native validation logs/);
});

test('release workflow builds unsigned artifacts for all tier-one desktop platforms', async () => {
  const root = path.join(__dirname, '..', '..');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const workflowDocument = YAML.parse(workflow);
  assertValidationLogUploadsFailClosed(workflowDocument, 'release.yml');
  assertNoPlatformSpecificSkippedSteps(workflowDocument, 'release.yml');

  assert.match(workflow, /tags:\s*\n\s*-\s+"v\*"/);
  assert.match(workflow, /platform:\s*linux/);
  assert.match(workflow, /platform:\s*windows/);
  assert.match(workflow, /platform:\s*macos/);
  assert.match(workflow, /npm run dist:linux/);
  assert.match(workflow, /npm run dist:win/);
  assert.match(workflow, /npm run dist:mac/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run electron:version/);
  assert.match(workflow, /apt-get install -y bubblewrap/);
  assert.match(workflow, /npm run sandbox:validate/);
  assert.match(workflow, /npm run sandbox:platform:validate/);
  assert.match(workflow, /npm run postman:parity:validate/);
  assert.match(workflow, /npm run postman:docs:validate/);
  assert.match(workflow, /npm run oauth:certify:validate/);
  assert.match(workflow, /npm run oauth:certify:mock/);
  assert.match(workflow, /npm run test:smoke/);
  assert.match(workflow, /xvfb-run -a npm run test:smoke/);
  assert.match(workflow, /npm run test:ui\b/);
  assert.match(workflow, /xvfb-run -a npm run test:ui\b/);
  assert.match(workflow, /npm run test:ui:regression/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:regression/);
  assert.match(workflow, /npm run test:ui:typography/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:typography/);
  assert.match(workflow, /npm run test:ui:oauth/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:oauth/);
  assert.match(workflow, /npm run test:ui:snapshot/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:snapshot/);
  assert.match(workflow, /npm run production:readiness:validate/);
  assert.match(workflow, /npm run electron:security:validate/);
  assert.match(workflow, /npm run workspace:durability:validate/);
  assert.match(workflow, /npm run compatibility:non-postman:validate/);
  assert.match(workflow, /npm run ux:accessibility:validate/);
  assert.match(workflow, /npm run diagnostics:privacy:validate/);
  assert.match(workflow, /npm run production:readiness:claim:stable/);
  assert.ok(
    workflow.indexOf('npm run production:readiness:claim:stable') < workflow.indexOf('Build unsigned artifacts'),
    'stable readiness claim must run before release artifacts are built'
  );
  assert.match(workflow, /npm run release:gate/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/);
  assert.match(workflow, /npm run sandbox:validate:packaged/);
  assert.match(workflow, /xvfb-run -a npm run sandbox:validate:packaged/);
  assert.match(workflow, /ci_no_sandbox:\s*"1"/);
  assert.match(workflow, /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*\$\{\{ matrix\.ci_no_sandbox \}\}/);
  assert.match(workflow, /Protocol registration validation/);
  assert.match(workflow, /npm run release:validate:win-protocol/);
  assert.match(workflow, /npm run release:validate:mac-protocol/);
  assert.match(workflow, /POSTMETER_VALIDATION_ARTIFACT_DIR:\s*validation-artifacts\/\$\{\{ matrix\.platform \}\}/);
  assert.match(workflow, /Upload validation logs/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /npm run release:prepare/);
  assert.match(workflow, /npm run release:validate/);
  assert.match(workflow, /POSTMETER_RELEASE_REQUIRED_TYPES:\s*appimage,deb,dmg,zip,exe/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /release\/\*\.AppImage/);
  assert.match(workflow, /release\/\*\.deb/);
  assert.match(workflow, /release\/\*\.dmg/);
  assert.match(workflow, /release\/\*\.zip/);
  assert.match(workflow, /release\/\*\.exe/);
  assert.match(workflow, /release\/latest\*\.yml/);
  assert.match(workflow, /release\/\*\.blockmap/);
  assert.doesNotMatch(workflow, /release\/\*\.msi/);
  assert.doesNotMatch(workflow, /release\/\*\.rpm/);
  assert.match(workflow, /if-no-files-found:\s*error/);
});

test('native release validation workflow exercises release evidence without publishing', async () => {
  const root = path.join(__dirname, '..', '..');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'release-validation.yml'), 'utf8');
  const workflowDocument = YAML.parse(workflow);
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assertValidationLogUploadsFailClosed(workflowDocument, 'release-validation.yml');

  assert.match(workflow, /workflow_dispatch:/);
  assertWorkflowRunsOnlyOnMainPullRequests(workflowDocument, 'release-validation.yml', { workflowDispatch: true });
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /platform:\s*linux/);
  assert.match(workflow, /platform:\s*windows/);
  assert.match(workflow, /platform:\s*macos/);
  assert.match(workflow, /npm run dist:linux/);
  assert.match(workflow, /npm run dist:win/);
  assert.match(workflow, /npm run dist:mac/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run sandbox:validate/);
  assert.match(workflow, /npm run sandbox:platform:validate/);
  assert.match(workflow, /npm run postman:parity:validate/);
  assert.match(workflow, /npm run postman:docs:validate/);
  assert.match(workflow, /npm run oauth:certify:validate/);
  assert.match(workflow, /npm run oauth:certify:mock/);
  assert.match(workflow, /npm run test:smoke/);
  assert.match(workflow, /xvfb-run -a npm run test:smoke/);
  assert.match(workflow, /npm run test:ui\b/);
  assert.match(workflow, /xvfb-run -a npm run test:ui\b/);
  assert.match(workflow, /npm run test:ui:regression/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:regression/);
  assert.match(workflow, /npm run test:ui:typography/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:typography/);
  assert.match(workflow, /npm run test:ui:oauth/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:oauth/);
  assert.match(workflow, /npm run test:ui:snapshot/);
  assert.match(workflow, /xvfb-run -a npm run test:ui:snapshot/);
  assert.match(workflow, /npm run production:readiness:validate/);
  assert.match(workflow, /npm run electron:security:validate/);
  assert.match(workflow, /npm run workspace:durability:validate/);
  assert.match(workflow, /npm run compatibility:non-postman:validate/);
  assert.match(workflow, /npm run ux:accessibility:validate/);
  assert.match(workflow, /npm run release:gate/);
  assert.match(workflow, /npm run release:validate:packaged-smoke/);
  assert.match(workflow, /npm run sandbox:validate:packaged/);
  assert.match(workflow, /xvfb-run -a npm run sandbox:validate:packaged/);
  assert.match(workflow, /ci_no_sandbox:\s*"1"/);
  assert.match(workflow, /POSTMETER_CI_ELECTRON_NO_SANDBOX:\s*\$\{\{ matrix\.ci_no_sandbox \}\}/);
  assert.match(workflow, /npm run release:validate:win-protocol/);
  assert.match(workflow, /npm run release:validate:mac-protocol/);
  assert.match(workflow, /POSTMETER_VALIDATION_ARTIFACT_DIR:\s*validation-artifacts\/\$\{\{ matrix\.platform \}\}/);
  assert.match(workflow, /Upload validation logs/);
  assert.match(workflow, /npm run release:prepare/);
  assert.match(workflow, /npm run release:validate/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /if-no-files-found:\s*error/);
  assert.match(workflow, /Source UI smoke suite/);
  assert.match(workflow, /Protocol registration validation/);
  assertNoPlatformSpecificSkippedSteps(workflowDocument, 'release-validation.yml');
  assert.match(workflow, /release\/latest\*\.yml/);
  assert.match(workflow, /release\/\*\.blockmap/);
  assert.doesNotMatch(workflow, /release\/\*\.msi/);
  assert.doesNotMatch(workflow, /release\/\*\.rpm/);
  assert.doesNotMatch(workflow, /gh release create/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  for (const scriptName of ['dist:linux', 'dist:win', 'dist:mac']) {
    assert.match(packageJson.scripts[scriptName], /--publish never/);
  }
  assert.match(packageJson.scripts['dist:win'], /npm run native:windows-sandbox:build/);
  assert.equal(packageJson.scripts['native:windows-sandbox:build'], 'node scripts/buildWindowsSandboxHelper.js');
});

test('release workflows keep Step 11 and Step 12 validators as executable YAML run steps', async () => {
  const root = path.join(__dirname, '..', '..');
  for (const workflowName of ['ci.yml', 'release.yml', 'release-validation.yml']) {
    const workflow = YAML.parse(await fs.readFile(path.join(root, '.github', 'workflows', workflowName), 'utf8'));
    for (const requiredRun of [
      /npm run ux:accessibility:validate/,
      /npm run diagnostics:privacy:validate/,
      /npm run release:gate/,
      /npm run test:ui\b/,
      /npm run test:ui:regression/,
      /npm run test:ui:typography/,
      /npm run test:ui:oauth/,
      /npm run test:ui:snapshot/
    ]) {
      assertWorkflowHasRunStep(workflow, requiredRun, workflowName);
    }
  }
});

test('release gate validator parses workflow YAML run steps instead of only scanning raw text', async () => {
  const root = path.join(__dirname, '..', '..');
  const validator = await fs.readFile(path.join(root, 'scripts', 'validateSandboxReleaseGate.js'), 'utf8');

  assert.match(validator, /YAML\.parse/);
  assert.match(validator, /requireWorkflowRunSteps/);
  assert.match(validator, /workflowRunSteps/);
  assert.match(validator, /missing executable run step/);
});

test('sandbox validation scripts are timeout bounded instead of using unbounded spawnSync', async () => {
  const root = path.join(__dirname, '..', '..');
  const sourceValidation = await fs.readFile(path.join(root, 'scripts', 'validateSandboxRuntime.js'), 'utf8');
  const packagedValidation = await fs.readFile(path.join(root, 'scripts', 'validatePackagedSandboxRuntime.js'), 'utf8');

  for (const source of [sourceValidation, packagedValidation]) {
    assert.match(source, /spawnWithTimeout/);
    assert.doesNotMatch(source, /spawnSync/);
    assert.match(source, /timed out/);
  }
  assert.match(sourceValidation, /POSTMETER_SANDBOX_VALIDATE_TIMEOUT_MS/);
  assert.match(packagedValidation, /POSTMETER_PACKAGED_SANDBOX_VALIDATE_TIMEOUT_MS/);
  assert.match(packagedValidation, /redactSmokeOutputText/);
  assert.match(packagedValidation, /redactForOutput/);
});

function assertWorkflowHasRunStep(workflow, pattern, workflowName) {
  const jobs = Object.values(workflow?.jobs || {});
  const runSteps = jobs
    .flatMap((job) => Array.isArray(job?.steps) ? job.steps : [])
    .map((step) => step?.run)
    .filter((run) => typeof run === 'string');
  const matrixCommands = jobs
    .flatMap((job) => Array.isArray(job?.strategy?.matrix?.include) ? job.strategy.matrix.include : [])
    .flatMap((entry) => Object.entries(entry || {})
      .filter(([key, value]) => key.endsWith('command') && typeof value === 'string')
      .map(([, value]) => value));
  assert.ok(
    [...runSteps, ...matrixCommands].some((run) => pattern.test(run)),
    `${workflowName} is missing executable run step ${pattern}`
  );
}

function assertWorkflowRunsOnlyOnMainPullRequests(workflow, workflowName, options = {}) {
  const triggers = workflow?.on || {};
  const expectedTriggers = options.workflowDispatch ? ['pull_request', 'workflow_dispatch'] : ['pull_request'];
  assert.deepEqual(
    Object.keys(triggers).sort(),
    expectedTriggers.sort(),
    `${workflowName} must only run from pull requests${options.workflowDispatch ? ' and manual dispatch' : ''}`
  );
  assert.equal(triggers.push, undefined, `${workflowName} must not run on push or merge to main`);
  assert.deepEqual(triggers.pull_request?.branches, ['main'], `${workflowName} must only validate PRs targeting main`);
  assert.deepEqual(triggers.pull_request?.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review'
  ], `${workflowName} must not run on closed or merged pull request events`);
}

function assertNoPlatformSpecificSkippedSteps(workflow, workflowName) {
  const steps = Object.values(workflow?.jobs || {})
    .flatMap((job) => Array.isArray(job?.steps) ? job.steps : [])
    .filter(Boolean);
  const stepNames = steps.map((step) => String(step.name || ''));
  for (const hiddenPlatformStep of [
    'Install Linux sandbox backend',
    'Build Windows sandbox helper',
    'Linux startup smoke',
    'OAuth Linux UI smoke',
    'Linux UI workflow smoke',
    'Linux UI regression smoke',
    'Linux UI typography smoke',
    'Linux UI snapshot smoke',
    'Packaged Linux app startup smoke',
    'Packaged Linux sandbox validation',
    'Validate Windows protocol registration',
    'Validate macOS protocol registration'
  ]) {
    assert.equal(
      stepNames.includes(hiddenPlatformStep),
      false,
      `${workflowName} should not expose skipped platform-specific step "${hiddenPlatformStep}"`
    );
  }
  for (const step of steps) {
    assert.doesNotMatch(
      String(step.if || ''),
      /matrix\.platform\s*(?:==|!=)/,
      `${workflowName} step "${step.name}" should use matrix-provided commands instead of skipped platform-specific steps`
    );
  }
}

function assertValidationLogUploadsFailClosed(workflow, workflowName) {
  const steps = Object.values(workflow?.jobs || {})
    .flatMap((job) => Array.isArray(job?.steps) ? job.steps : [])
    .filter((step) => /validation logs/i.test(String(step?.name || '')));
  assert.ok(steps.length > 0, `${workflowName} is missing validation log uploads`);
  for (const step of steps) {
    assert.match(String(step.uses || ''), /^actions\/upload-artifact@/);
    assert.equal(step.with?.['if-no-files-found'], 'error', `${workflowName} ${step.name} must fail when validation logs are missing`);
    assert.match(String(step.with?.path || ''), /validation-artifacts/);
  }
}

test('manual OAuth provider certification workflow is evidence-gated and fail-closed', async () => {
  const root = path.join(__dirname, '..', '..');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'oauth-provider-certification.yml'), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /provider:/);
  assert.match(workflow, /run_live:/);
  assert.match(workflow, /evidence_path:/);
  assert.match(workflow, /repository-relative sanitized evidence JSON path/);
  assert.match(workflow, /npm run oauth:certify:validate/);
  assert.match(workflow, /npm run oauth:certify:mock/);
  assert.match(workflow, /npm run oauth:certify:live -- --provider/);
  assert.match(workflow, /--evidence/);
  assert.match(workflow, /POSTMETER_LIVE_OAUTH_CERTIFICATION:\s*"1"/);
  assert.match(workflow, /POSTMETER_LIVE_OAUTH_EVIDENCE_FILE/);
  assert.match(workflow, /secrets\.POSTMETER_GOOGLE_OAUTH_CLIENT_ID/);
  assert.match(workflow, /secrets\.POSTMETER_ENTRA_OAUTH_CLIENT_ID/);
  assert.match(workflow, /secrets\.POSTMETER_GITHUB_OAUTH_CLIENT_ID/);
});

test('native protocol validators exercise actual custom-scheme launches', async () => {
  const root = path.join(__dirname, '..', '..');
  const windowsScript = await fs.readFile(path.join(root, 'scripts', 'validateWindowsProtocolRegistration.ps1'), 'utf8');
  const macScript = await fs.readFile(path.join(root, 'scripts', 'validateMacProtocolRegistration.sh'), 'utf8');

  assert.match(windowsScript, /Start-Process -FilePath \$url/);
  assert.match(windowsScript, /postmeter:\/\/oauth\/callback/);
  assert.match(windowsScript, /Stop-PostMeterProcesses/);
  assert.match(windowsScript, /ExpectedInstallDir/);
  assert.match(windowsScript, /Find-Uninstaller/);
  assert.match(windowsScript, /matchesExpectedInstall/);
  assert.match(windowsScript, /Start-Transcript/);
  assert.match(windowsScript, /windows-protocol-validation\.log/);
  assert.match(windowsScript, /MaxInstallAttempts/);
  assert.match(windowsScript, /Write-InstallerSnapshot/);
  assert.match(windowsScript, /Write-RecentApplicationErrorEvents/);
  assert.match(windowsScript, /Attempt \$Attempt of \$MaxAttempts/);
  assert.match(windowsScript, /Start-Sleep -Seconds/);
  assert.match(windowsScript, /did not create an uninstaller/);
  assert.match(macScript, /open -g -b "com\.strangequark\.postmeter" "\$url"/);
  assert.match(macScript, /postmeter:\/\/oauth\/callback/);
  assert.match(macScript, /Launch Services/);
  assert.match(macScript, /pgrep -x PostMeter/);
  assert.match(macScript, /canonical_path\(\)/);
  assert.match(macScript, /expected_executable="\$\(canonical_path "\$app_path\/Contents\/MacOS\/PostMeter"\)"/);
  assert.match(macScript, /if \[\[ "\$launches" -eq 0 \]\]; then/);
  assert.match(macScript, /ps -p "\$pid" -o command=/);
  assert.match(macScript, /mac-protocol-validation\.log/);
  assert.match(macScript, /Validated \$validated macOS app bundle\(s\) and \$launches Launch Services protocol launch\(es\)\./);
  assert.doesNotMatch(macScript, /if \[\[ "\$launched" -eq 0 \]\]/);
  assert.match(macScript, /instead of \$expected_executable/);
  assert.match(macScript, /did not launch/);
});

test('Windows sandbox helper build preserves quoted Visual Studio setup paths', async () => {
  const root = path.join(__dirname, '..', '..');
  const buildScript = await fs.readFile(path.join(root, 'scripts', 'buildWindowsSandboxHelper.js'), 'utf8');

  assert.match(buildScript, /function runCompilerBatch\(vcvarsPath\)/);
  assert.ok(buildScript.includes('call "${vcvarsPath}" > nul'));
  assert.ok(buildScript.includes("spawnSync('cmd.exe', ['/d', '/c', scriptPath]"));
  assert.doesNotMatch(buildScript, /spawnSync\('cmd\.exe', \['\/d', '\/s', '\/c', command\]/);
});
