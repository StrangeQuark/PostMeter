const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  expectedDefaultUserDataPath,
  expectedDefaultUserDataRoot,
  isolatedDefaultPathEnv,
  loadPersistedSmokeWorkspace,
  packagedSmokeCliErrorText,
  packagedSmokeFailureMessage,
  redactPackagedSmokeLogText,
  validateDefaultPersistenceArtifacts,
  validatePersistenceArtifacts,
  writeSmokeLog
} = require('../../scripts/validatePackagedAppSmoke');

test('packaged smoke validation accepts managed workspace filenames', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-smoke-test-'));
  try {
    const dataPath = path.join(directory, 'workspace.json');
    const managedWorkspacePath = path.join(directory, 'Local Workspace.json');
    await fs.mkdir(path.join(directory, 'userData'), { recursive: true });
    await fs.writeFile(managedWorkspacePath, JSON.stringify({
      schemaVersion: 11,
      collections: [],
      environments: [],
      globals: [{ enabled: true, key: '__postmeter_packaged_smoke', value: 'marker' }],
      cookies: [],
      history: []
    }));

    const workspace = await loadPersistedSmokeWorkspace(dataPath, 'marker');
    assert.equal(workspace.globals[0].value, 'marker');
    await validatePersistenceArtifacts(directory, dataPath, 'marker');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('packaged smoke validates default platform persistence paths in an isolated home', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-default-path-test-'));
  try {
    const env = await isolatedDefaultPathEnv(directory);
    const userDataPath = expectedDefaultUserDataPath(env);
    const workspacePath = path.join(env.USERPROFILE || env.HOME, '.postmeter', 'workspace.json');
    await fs.mkdir(userDataPath, { recursive: true });
    await fs.mkdir(path.dirname(workspacePath), { recursive: true });
    await fs.writeFile(workspacePath, JSON.stringify({
      schemaVersion: 11,
      collections: [],
      environments: [],
      globals: [{ enabled: true, key: '__postmeter_packaged_smoke', value: 'default-marker' }],
      cookies: [],
      history: []
    }));

    await validateDefaultPersistenceArtifacts(env, 'default-marker');
    assert.equal(expectedDefaultUserDataRoot(env, 'linux'), env.XDG_CONFIG_HOME);
    assert.equal(expectedDefaultUserDataRoot(env, 'win32'), env.APPDATA);
    assert.equal(expectedDefaultUserDataRoot(env, 'darwin'), path.join(env.HOME, 'Library', 'Application Support'));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('packaged smoke writes validation logs when an artifact directory is configured', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-smoke-log-'));
  const previous = process.env.POSTMETER_VALIDATION_ARTIFACT_DIR;
  process.env.POSTMETER_VALIDATION_ARTIFACT_DIR = directory;
  try {
    await writeSmokeLog('reload pass', '/tmp/PostMeter', {
      code: 0,
      stdout: 'ready /tmp/PostMeter Authorization: Bearer stdout-token',
      stderr: 'Cookie: sid=stderr-cookie'
    });
    const files = await fs.readdir(directory);
    assert.ok(files.some((file) => file.startsWith(`packaged-app-smoke-${process.platform}-reload-pass`)));
    const log = await fs.readFile(path.join(directory, files[0]), 'utf8');
    assert.match(log, /executable=PostMeter/);
    assert.match(log, /exitCode=0/);
    assert.match(log, /ready/);
    assert.doesNotMatch(log, /\/tmp\/PostMeter|stdout-token|stderr-cookie/);
  } finally {
    if (previous === undefined) {
      delete process.env.POSTMETER_VALIDATION_ARTIFACT_DIR;
    } else {
      process.env.POSTMETER_VALIDATION_ARTIFACT_DIR = previous;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('packaged smoke log redaction removes local paths and secret-bearing values', () => {
  const redacted = redactPackagedSmokeLogText(
    'Authorization: Bearer abcdef12345\nAuthorization: Digest digest-scheme-value\nAuthorization: Hawk hawk-scheme-value\nAuthorization: Token token-scheme-value\nAuthorization: OAuth oauth-scheme-value\nAuthorization: NTLM ntlm-scheme-value\nAuthorization: Negotiate negotiate-scheme-value\naccess_token=token-value\nauthorization_code=auth-code-value\ndevice_code=device-code-value\nuser_code=user-code-value\ncode_verifier=code-verifier-value\nclientAssertion=client-assertion-value\n/home/user/PostMeter/release/linux-unpacked/postmeter',
    '/home/user/PostMeter/release/linux-unpacked/postmeter'
  );

  assert.doesNotMatch(redacted, /abcdef12345|digest-scheme-value|hawk-scheme-value|token-scheme-value|oauth-scheme-value|ntlm-scheme-value|negotiate-scheme-value|token-value|auth-code-value|device-code-value|user-code-value|code-verifier-value|client-assertion-value|\/home\/user\/PostMeter/);
  assert.match(redacted, /\[path\]/);
  assert.match(redacted, /Digest \[redacted\]/);
  assert.match(redacted, /Hawk \[redacted\]/);
  assert.match(redacted, /Token \[redacted\]/);
  assert.match(redacted, /OAuth \[redacted\]/);
  assert.match(redacted, /NTLM \[redacted\]/);
  assert.match(redacted, /Negotiate \[redacted\]/);
});

test('packaged smoke success output redacts the executable path before logging', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', '..', 'scripts', 'validatePackagedAppSmoke.js'), 'utf8');

  assert.match(source, /Packaged app smoke passed: \$\{redactPackagedSmokeLogText\(executable, executable\)\}/);
});

test('packaged smoke failure messages redact child output before reaching CI logs', () => {
  const message = packagedSmokeFailureMessage({
    code: 1,
    stdout: 'ready',
    stderr: 'Authorization: Bearer raw-token-123456\n/tmp/PostMeter/workspace.json\nclient_secret=secret-value'
  }, '/tmp/PostMeter/postmeter');

  assert.match(message, /Packaged app startup smoke exited with 1/);
  assert.doesNotMatch(message, /raw-token|secret-value|\/tmp\/PostMeter/);
  assert.match(message, /\[redacted\]|\[path\]/);
});

test('packaged smoke CLI error output redacts local stack paths', () => {
  const error = new Error('Packaged app startup smoke exited with 1: /tmp/PostMeter Authorization: Bearer raw-token-123456');
  error.stack = [
    error.message,
    '    at runStartupSmokeOnce (/home/user/PostMeter/scripts/validatePackagedAppSmoke.js:137:11)',
    '    at main (C:\\Users\\user\\PostMeter\\scripts\\validatePackagedAppSmoke.js:20:1)'
  ].join('\n');

  const output = packagedSmokeCliErrorText(error, '/home/user/PostMeter/release/linux-unpacked/postmeter');

  assert.doesNotMatch(output, /\/home\/user\/PostMeter|C:\\Users\\user\\PostMeter|raw-token/);
  assert.match(output, /\[path\]/);
  assert.match(output, /Bearer \[redacted\]/);
});
