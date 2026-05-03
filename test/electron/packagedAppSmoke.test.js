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
    'Authorization: Bearer abcdef12345\nAuthorization: Digest digest-scheme-value\nAuthorization: Digest username="alice", nonce="abc123", response="deadbeef"\nDigest username="standalone-user", realm="standalone-realm", nonce="standalone-nonce", uri="/standalone/path", response="standalone-response", cnonce="standalone-cnonce"\n{"Authorization":"Digest username=\\"json-user\\", nonce=\\"json-nonce\\", response=\\"json-response\\""}\n{"authorizationHeader":"OAuth oauth_token=\\"json-oauth-token\\", oauth_signature=\\"json-oauth-signature\\", oauth_nonce=\\"json-oauth-nonce\\""}\n{"authHeader":"OAuth oauth_token=\\"json-auth-token\\", oauth_signature=\\"json-auth-signature\\", oauth_nonce=\\"json-auth-nonce\\""}\nCookie sid=bare-cookie-secret; csrf=bare-cookie-second-secret\n{"Cookie":"sid=json-cookie-secret; csrf=json-second-cookie-secret"}\n{"cookieHeader":"sid=json-cookie-header-secret; csrf=json-cookie-header-second-secret"}\nAuthorization: Hawk hawk-scheme-value\nAuthorization: Token token-scheme-value\nAuthorization: OAuth oauth-scheme-value\nAuthorization: NTLM ntlm-scheme-value\nAuthorization: Negotiate negotiate-scheme-value\nAWS4-HMAC-SHA256 Credential=aws-credential/20260502/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=aws-signature\nEG1-HMAC-SHA256 client_token=akamai-client;access_token=akamai-access;timestamp=20260502T000000Z;nonce=akamai-nonce;signature=akamai-signature\nX-Amz-Credential=aws-query-credential x-amz-credential=aws-lower-credential xAmzCredential=aws-camel-credential X-Amz-Signature=aws-query-signature X-Amz-Security-Token=aws-security-token\nhttps://example.test/path?visible=1&X-Amz-Credential=aws-url-credential&X-Amz-Signature=aws-url-signature&X-Amz-Security-Token=aws-url-security-token\nhttps://user:password@example.test/callback?access_token=url-token&visible=1\n-----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----\nC:\\Users\\alice\\oauth.json Digest realm="digest-private-realm", nonce="digest-secret-nonce", response="digest-secret-response"\nclient-secret=hyphen client secret next=ok\npassphrase=client cert passphrase words next=ok\ncredential=credential bag words next=ok\ncredentials=credentials bag words next=ok\naccess_token=token-value\nauthorization_code=auth-code-value\nauthorization-code=secret authorization code words next=ok\ndevice_code=device-code-value\nuser_code=user-code-value\ncode_verifier=code-verifier-value\nclientAssertion=client-assertion-value\ntoken=exact-token-secret code=oauth-code-secret state=oauth-state-secret\nauthToken=camel-auth-token-secret authorizationToken=authorization-token-secret clientToken=client-token-secret bearerToken=bearer-token-secret oauthToken=oauth-token-secret\n/home/user/PostMeter/release/linux-unpacked/postmeter',
    '/home/user/PostMeter/release/linux-unpacked/postmeter'
  );
  const contextRedacted = redactPackagedSmokeLogText(
    'httpRequest {"method":"PATCH","size":1444,"bytes":1555,"metrics":{"method":"POST","size":1333,"bytes":1666}}\nhttpResponse {"status":203,"statusText":"Non-Authoritative","size":1222,"timing":{"statusCode":210,"contentLength":1111}}\nrequestInfo {"metrics":{"method":"PUT","size":77777}} responseDetails {"metrics":{"reason":"Created","contentLength":88888}}\n{"httpRequest":{"method":"PATCH","size":99991,"body":"quoted-packaged-request-secret"}}\n{"httpResponses":[{"status":207,"statusText":"Multi-Status","size":99994}]}\n{\\"httpResponse\\":{"status":226,"statusText":"IM Used","size":99997,"body":"escaped-packaged-response-secret"}}'
  );

  assert.doesNotMatch(redacted, /abcdef12345|digest-scheme-value|alice|abc123|deadbeef|standalone-user|standalone-realm|standalone-nonce|standalone-response|standalone-cnonce|\/standalone\/path|json-user|json-nonce|json-response|json-oauth-token|json-oauth-signature|json-oauth-nonce|json-auth-token|json-auth-signature|json-auth-nonce|bare-cookie-secret|bare-cookie-second-secret|json-cookie-secret|json-second-cookie-secret|json-cookie-header-secret|json-cookie-header-second-secret|hawk-scheme-value|token-scheme-value|oauth-scheme-value|ntlm-scheme-value|negotiate-scheme-value|aws-credential|aws-signature|akamai-client|akamai-access|akamai-nonce|akamai-signature|aws-query-credential|aws-lower-credential|aws-camel-credential|aws-query-signature|aws-security-token|aws-url-credential|aws-url-signature|aws-url-security-token|user:password|example\.test|url-token|visible=1|private-key-secret|digest-private-realm|digest-secret-nonce|digest-secret-response|hyphen client secret|client secret next|client cert passphrase words|credential bag words|credentials bag words|token-value|auth-code-value|authorization code words|device-code-value|user-code-value|code-verifier-value|client-assertion-value|exact-token-secret|oauth-code-secret|oauth-state-secret|camel-auth-token-secret|authorization-token-secret|client-token-secret|bearer-token-secret|oauth-token-secret|\/home\/user\/PostMeter/);
  assert.match(redacted, /\[path\]/);
  assert.match(redacted, /\[url\]/);
  assert.match(redacted, /\[redacted-private-key\]/);
  assert.match(redacted, /Authorization: \[redacted\]/);
  assert.match(redacted, /\[redacted-auth\]/);
  assert.doesNotMatch(contextRedacted, /quoted-packaged-request-secret|escaped-packaged-response-secret|\b(?:1444|1555|1333|1666|203|1222|1111|77777|88888|99991|99994|99997)\b|Non-Authoritative|Multi-Status|IM Used|Created/);

  const safeContext = redactPackagedSmokeLogText('OAuth 2.0 provider returned invalid_grant. Digest auth username is required. token endpoint failed.');
  assert.match(safeContext, /OAuth 2\.0 provider returned invalid_grant/);
  assert.match(safeContext, /Digest auth username is required/);
  assert.match(safeContext, /token endpoint failed/);
  assert.equal(redactPackagedSmokeLogText('Basic authentication failed. Bearer authentication is required.'), 'Basic authentication failed. Bearer authentication is required.');
  assert.equal(
    redactPackagedSmokeLogText('Cookie authentication failed. Cookie jar disabled. Set-Cookie handling unavailable.'),
    'Cookie authentication failed. Cookie jar disabled. Set-Cookie handling unavailable.'
  );
  assert.equal(
    redactPackagedSmokeLogText('Cookie: sid=session-secret Basic authentication failed. Bearer authentication is required.'),
    'Cookie: [redacted] Basic authentication failed. Bearer authentication is required.'
  );
  assert.equal(
    redactPackagedSmokeLogText('Set-Cookie: sid=set-cookie-secret; Path=/; HttpOnly; Secure Basic authentication failed. Bearer authentication is required.'),
    'Set-Cookie: [redacted] Basic authentication failed. Bearer authentication is required.'
  );
  const digestJson = redactPackagedSmokeLogText('{"authorizationHeader":"Digest username=\\"json-digest-user\\", realm=\\"json-digest-realm\\", nonce=\\"json-digest-nonce\\", uri=\\"/digest/private/path\\", response=\\"json-digest-response\\", cnonce=\\"json-digest-cnonce\\""}');
  assert.doesNotMatch(digestJson, /json-digest-user|json-digest-realm|json-digest-nonce|json-digest-response|json-digest-cnonce|\/digest\/private\/path/);
  const nestedEscaped = JSON.stringify({
    output: JSON.stringify({
      body: 'packaged-nested-json-body-secret',
      bodyPreview: 'packaged-nested-json-preview-secret',
      responseText: 'packaged-nested-json-response-secret',
      'rendered-response': 'packaged-nested-json-rendered-secret'
    })
  });
  const trafficAliasRedacted = redactPackagedSmokeLogText(`code verifier packaged-code-verifier-secret body=packaged-body-assignment-secret bodyPreview=packaged-body-preview-assignment-secret responseText=packaged-response-text-assignment-secret rendered-response=packaged-rendered-response-assignment-secret {"body":"packaged-json-body-secret"} ${nestedEscaped} {\\"body\\":\\"packaged-raw-escaped-body-secret\\",\\"responseText\\":\\"packaged-raw-escaped-response-secret\\"} responseBodyText packaged-response-body-secret variables packaged-variables-secret text packaged-text-secret consoleOutput packaged-console-secret payloadIdentifier packaged-payload-secret`);
  const structuredAssignmentContext = redactPackagedSmokeLogText('body={"customer":"packaged-body-assignment-context-secret"} next=body-safe');
  assert.doesNotMatch(trafficAliasRedacted, /packaged-code-verifier-secret|packaged-body-assignment-secret|packaged-body-preview-assignment-secret|packaged-response-text-assignment-secret|packaged-rendered-response-assignment-secret|packaged-json-body-secret|packaged-nested-json-body-secret|packaged-nested-json-preview-secret|packaged-nested-json-response-secret|packaged-nested-json-rendered-secret|packaged-raw-escaped-body-secret|packaged-raw-escaped-response-secret|packaged-response-body-secret|packaged-variables-secret|packaged-text-secret|packaged-console-secret|packaged-payload-secret/);
  assert.doesNotMatch(structuredAssignmentContext, /packaged-body-assignment-context-secret/);
  assert.match(structuredAssignmentContext, /next=body-safe/);
  const bareCookieContext = redactPackagedSmokeLogText('provider failed Cookie sid=cookie-bare-secret OAuth 2.0 provider returned invalid_grant Set-Cookie sid=set-cookie-bare-secret Basic authentication required cookieHeader sid=cookie-header-bare-secret Bearer authentication required setCookieHeader sid=set-cookie-header-bare-secret Digest auth username was rejected');
  assert.doesNotMatch(bareCookieContext, /cookie-bare-secret|set-cookie-bare-secret|cookie-header-bare-secret|set-cookie-header-bare-secret/);
  assert.match(bareCookieContext, /OAuth 2\.0 provider returned invalid_grant/);
  assert.match(bareCookieContext, /Basic authentication required/);
  assert.match(bareCookieContext, /Bearer authentication required/);
  assert.match(bareCookieContext, /Digest auth username was rejected/);
  const bareLabelRedacted = redactPackagedSmokeLogText('authorization code packagedAuthCode client secret packagedClientSecret device code packagedDeviceCode user code packagedUserCode code verifier packagedVerifier client assertion packagedAssertion cert passphrase packagedPassphrase private key packagedPrivateKey');
  assert.doesNotMatch(bareLabelRedacted, /packagedAuthCode|packagedClientSecret|packagedDeviceCode|packagedUserCode|packagedVerifier|packagedAssertion|packagedPassphrase|packagedPrivateKey/);
  assert.equal(
    redactPackagedSmokeLogText('Basic authentication required. Bearer authentication required. token endpoint failed.'),
    'Basic authentication required. Bearer authentication required. token endpoint failed.'
  );
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
  assert.match(output, /Authorization: \[redacted\]/);
});
