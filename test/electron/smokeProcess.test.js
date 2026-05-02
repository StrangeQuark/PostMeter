const assert = require('node:assert/strict');
const test = require('node:test');
const { appendBoundedText, redactSmokeOutputText, spawnWithTimeout } = require('../../scripts/smokeProcess');
const { redactForOutput, validationTimeoutMillis } = require('../../scripts/validatePackagedSandboxRuntime');

test('smoke process helper captures successful child stdout and stderr', async () => {
  const result = await spawnWithTimeout(process.execPath, [
    '-e',
    "process.stdout.write('ready'); process.stderr.write('warn');"
  ], {
    timeoutMillis: 1000
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'ready');
  assert.equal(result.stderr, 'warn');
  assert.equal(result.timedOut, false);
  assert.equal(result.forceKilled, false);
});

test('smoke process helper returns 124 when a child ignores graceful termination', async () => {
  const result = await spawnWithTimeout(process.execPath, [
    '-e',
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"
  ], {
    timeoutMillis: 25,
    killGraceMillis: 25,
    timeoutMessage: 'test smoke child timed out'
  });

  assert.equal(result.code, 124);
  assert.equal(result.timedOut, true);
  assert.match(result.stderr, /test smoke child timed out/);
});

test('smoke process helper rejects spawn errors', async () => {
  await assert.rejects(
    () => spawnWithTimeout('__postmeter_missing_smoke_command__', [], { timeoutMillis: 1000 }),
    /ENOENT/
  );
});

test('smoke process helper bounds stdout and stderr capture', async () => {
  const result = await spawnWithTimeout(process.execPath, [
    '-e',
    "process.stdout.write('A'.repeat(5000)); process.stderr.write('B'.repeat(5000));"
  ], {
    maxOutputBytes: 2048,
    timeoutMillis: 1000
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdoutTruncated, true);
  assert.equal(result.stderrTruncated, true);
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= 2048);
  assert.ok(Buffer.byteLength(result.stderr, 'utf8') <= 2048);
  assert.match(result.stdout, /^\[output truncated\]/);
  assert.match(result.stderr, /^\[output truncated\]/);
});

test('bounded smoke output appender preserves recent output with a truncation marker', () => {
  const result = appendBoundedText('prefix-', 'x'.repeat(5000), 1024);

  assert.equal(result.truncated, true);
  assert.match(result.text, /^\[output truncated\]/);
  assert.ok(Buffer.byteLength(result.text, 'utf8') <= 1024);
  assert.match(result.text, /x+$/);
});

test('smoke output redactor removes local paths and common secret values', () => {
  const raw = [
    `Error at ${process.cwd()}/test/electron/uiWorkflowSmoke.js:10`,
    'Set-Cookie: session=secret; Path=/',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    'Authorization: Token token-secret-value',
    'Authorization: OAuth oauth-secret-value',
    'client_secret=super-secret',
    'authorization_code=auth-code-secret',
    'authorizationCode: camel-auth-code-secret',
    'device_code=device-code-secret',
    'user_code=user-code-secret',
    'code_verifier=code-verifier-secret',
    'clientAssertion=client-assertion-secret',
    'refresh_token: refresh-secret',
    'C:\\Users\\alice\\AppData\\Local\\PostMeter\\workspace.json',
    '/home/alice/PostMeter/workspace.json'
  ].join('\n');

  const redacted = redactSmokeOutputText(raw, ['/home/alice/PostMeter']);

  assert.doesNotMatch(redacted, new RegExp(escapeRegExp(process.cwd())));
  assert.doesNotMatch(redacted, /session=secret/);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz/);
  assert.doesNotMatch(redacted, /token-secret-value/);
  assert.doesNotMatch(redacted, /oauth-secret-value/);
  assert.doesNotMatch(redacted, /super-secret/);
  assert.doesNotMatch(redacted, /auth-code-secret/);
  assert.doesNotMatch(redacted, /camel-auth-code-secret/);
  assert.doesNotMatch(redacted, /device-code-secret/);
  assert.doesNotMatch(redacted, /user-code-secret/);
  assert.doesNotMatch(redacted, /code-verifier-secret/);
  assert.doesNotMatch(redacted, /client-assertion-secret/);
  assert.doesNotMatch(redacted, /refresh-secret/);
  assert.doesNotMatch(redacted, /C:\\Users\\alice/);
  assert.doesNotMatch(redacted, /\/home\/alice/);
  assert.match(redacted, /\[path\]/);
  assert.match(redacted, /Bearer \[redacted\]/);
  assert.match(redacted, /Token \[redacted\]/);
  assert.match(redacted, /OAuth \[redacted\]/);
});

test('packaged sandbox validation redactor removes executable paths and auth schemes', () => {
  const executable = '/home/alice/PostMeter/release/linux-unpacked/postmeter';
  const redacted = redactForOutput([
    `Executable failed: ${executable}`,
    'Authorization: Token packaged-token-value',
    'Authorization: OAuth packaged-oauth-value',
    'client_secret=packaged-secret'
  ].join('\n'), executable);

  assert.doesNotMatch(redacted, /\/home\/alice\/PostMeter|packaged-token-value|packaged-oauth-value|packaged-secret/);
  assert.match(redacted, /\[path\]/);
  assert.match(redacted, /Token \[redacted\]/);
  assert.match(redacted, /OAuth \[redacted\]/);
});

test('packaged sandbox validation timeout parsing keeps the fail-closed timeout exit path bounded', () => {
  assert.equal(validationTimeoutMillis('1'), 1000);
  assert.equal(validationTimeoutMillis('bad'), 60000);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
