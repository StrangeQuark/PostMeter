const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  markdownRawHtmlDisabled,
  scanRendererSource,
  validateRendererSecurity
} = require('../../scripts/validateRendererSecurity');
const {
  validateGithubWorkflowSource,
  validateGithubWorkflows
} = require('../../scripts/validateGithubWorkflows');
const {
  scanFile: scanSecretsFile
} = require('../../scripts/validateSecrets');
const {
  validateReleaseGovernance
} = require('../../scripts/validateReleaseGovernance');
const {
  validateReleaseSigningConfig
} = require('../../scripts/validateReleaseSigningConfig');

test('renderer security validator blocks unsafe DOM sinks and accepts justified escaped sinks', () => {
  assert.match(
    scanRendererSource('src/renderer/bad.js', 'target.innerHTML = userHtml;')[0].message,
    /innerHTML/
  );
  assert.deepEqual(scanRendererSource('src/renderer/good.js', [
    '// postmeter-security-allow-html: test fixture escapes all dynamic values before assignment.',
    'target.innerHTML = escapeHtmlText(value);'
  ].join('\n')), []);
});

test('renderer security validator requires markdown raw HTML to remain disabled', async () => {
  assert.equal(markdownRawHtmlDisabled('markdownit({ html: false })'), true);
  assert.equal(markdownRawHtmlDisabled('markdownit({ html: true })'), false);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-renderer-security-'));
  try {
    const markdownPath = path.join(dir, 'formatting', 'markdownRenderer.js');
    await fs.mkdir(path.dirname(markdownPath), { recursive: true });
    await fs.writeFile(markdownPath, 'markdownit({ html: true });\n');
    const findings = validateRendererSecurity({ roots: [markdownPath] });
    assert.ok(findings.some((finding) => /html: false/.test(finding.message)));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GitHub workflow validator rejects mutable actions and broad write permissions', () => {
  const bad = [
    'name: Bad',
    'on: pull_request_target',
    'permissions:',
    '  contents: write',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: echo ${{ github.event.pull_request.title }}'
  ].join('\n');
  const findings = validateGithubWorkflowSource(bad, 'bad.yml').map((finding) => finding.message).join('\n');
  assert.match(findings, /pull_request_target/);
  assert.match(findings, /workflow-level contents: write/);
  assert.match(findings, /full commit SHA/);
  assert.match(findings, /untrusted github\.event/);
  assert.match(
    validateGithubWorkflowSource('name: Dynamic\njobs:\n  test:\n    steps:\n      - uses: ${{ inputs.action }}@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', 'dynamic.yml')
      .map((finding) => finding.message)
      .join('\n'),
    /dynamic action references/
  );
});

test('current GitHub workflows pass pin and permission validation', () => {
  assert.deepEqual(validateGithubWorkflows(), []);
});

test('GitHub workflow validator requires dependency review and release provenance controls', () => {
  assert.match(
    validateGithubWorkflowSource('name: CI\non: pull_request\npermissions:\n  contents: read\njobs: {}\n', '.github/workflows/ci.yml')
      .map((finding) => finding.message)
      .join('\n'),
    /dependency-review/
  );
  assert.match(
    validateGithubWorkflowSource('name: Release\non:\n  push:\n    tags: ["v*"]\npermissions:\n  contents: read\njobs: {}\n', '.github/workflows/release.yml')
      .map((finding) => finding.message)
      .join('\n'),
    /provenance attestation/
  );
  const goodRelease = [
    'name: Release',
    'on:',
    '  push:',
    '    tags: ["v*"]',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  attest-provenance:',
    '    runs-on: ubuntu-latest',
    '    permissions:',
    '      contents: read',
    '      id-token: write',
    '      attestations: write',
    '    steps:',
    '      - uses: actions/attest-build-provenance@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # actions/attest-build-provenance@v2'
  ].join('\n');
  assert.deepEqual(validateGithubWorkflowSource(goodRelease, '.github/workflows/release.yml'), []);
});

test('secret validator blocks high-confidence secrets and accepts narrow fixture allowlists', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-secret-scan-'));
  try {
    const bad = path.join(dir, 'bad.js');
    const good = path.join(dir, 'good.js');
    const fixtureToken = `ghp_${'abcdefghijklmnopqrstuvwxyz1234567890ABCD'}`;
    await fs.writeFile(bad, `const token = "${fixtureToken}";\n`);
    await fs.writeFile(good, [
      '// postmeter-secret-allow: synthetic token fixture verifies the scanner allowlist path.',
      `const token = "${fixtureToken}";`
    ].join('\n'));
    assert.match(scanSecretsFile(bad, await fs.readFile(bad, 'utf8'))[0].message, /github-token/);
    assert.deepEqual(scanSecretsFile(good, await fs.readFile(good, 'utf8')), []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('release governance validator requires repository-control documentation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-governance-'));
  try {
    const docPath = path.join(dir, 'RELEASE_SECURITY.md');
    await fs.writeFile(docPath, 'protected `main`\n');
    assert.ok(validateReleaseGovernance({ docPath }).length > 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('release signing config validator fails production release mode without platform secrets', () => {
  assert.throws(
    () => validateReleaseSigningConfig({ platform: 'windows', releaseMode: 'production', env: {} }),
    /CSC_LINK, CSC_KEY_PASSWORD/
  );
  assert.throws(
    () => validateReleaseSigningConfig({ platform: 'macos', releaseMode: 'production', env: { CSC_LINK: 'cert', CSC_KEY_PASSWORD: 'pw' } }),
    /APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID/
  );
  assert.deepEqual(
    validateReleaseSigningConfig({ platform: 'linux', releaseMode: 'production', env: {} }),
    { platform: 'linux', skipped: false }
  );
  assert.deepEqual(
    validateReleaseSigningConfig({ platform: 'windows', releaseMode: 'local', env: {} }),
    { platform: 'windows', skipped: true }
  );
});
