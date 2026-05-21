const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('matrix and certification CLI wrappers reject unknown commands with usage text', async () => {
  const cases = [
    ['scripts/productionReadiness.js', ['unknown'], /Usage: node scripts\/productionReadiness\.js/],
    ['scripts/productionSupportMatrix.js', ['electron-security', 'unknown'], /Unknown command "unknown"/],
    ['scripts/postmanParityHarness.js', ['unknown'], /Usage: node scripts\/postmanParityHarness\.js/],
    ['scripts/postmanDocsCoverageAudit.js', ['unknown'], /Usage: node scripts\/postmanDocsCoverageAudit\.js/],
    ['scripts/oauthProviderCertification.js', ['unknown'], /Usage: node scripts\/oauthProviderCertification\.js/],
    ['scripts/osSandboxPlatformMatrix.js', ['unknown'], /Usage: node scripts\/osSandboxPlatformMatrix\.js/]
  ];

  for (const [script, args, pattern] of cases) {
    const result = await runScript(script, args);
    assert.equal(result.code, 1, `${script} should reject unknown commands`);
    assert.match(result.stderr, pattern, `${script} should print actionable usage`);
  }
});

test('production support matrix wrapper rejects unknown matrix names before command execution', async () => {
  const result = await runScript('scripts/productionSupportMatrix.js', ['missing-matrix', 'validate']);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown matrix "missing-matrix"/);
  assert.match(result.stderr, /diagnostics-privacy/);
  assert.match(result.stderr, /ux-accessibility/);
});

function runScript(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PROJECT_ROOT, script), ...args], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}
