const assert = require('node:assert/strict');
const test = require('node:test');
const { appendBoundedText, redactSmokeOutputText, spawnWithTimeout } = require('../../scripts/smokeProcess');
const { redactForOutput: redactPackagedSandboxOutput, validationTimeoutMillis } = require('../../scripts/validatePackagedSandboxRuntime');
const { redactForOutput: redactSourceSandboxOutput } = require('../../scripts/validateSandboxRuntime');

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
  const nestedEscaped = JSON.stringify({
    output: JSON.stringify({
      body: 'smoke-nested-json-body-secret',
      bodyPreview: 'smoke-nested-json-preview-secret',
      responseText: 'smoke-nested-json-response-secret',
      'rendered-response': 'smoke-nested-json-rendered-secret'
    })
  });
  const raw = [
    `Error at ${process.cwd()}/test/electron/uiWorkflowSmoke.js:10`,
    'Set-Cookie: session=secret; Path=/',
    '{"Cookie":"sid=json-cookie-secret; csrf=json-second-cookie-secret"}',
    '{"cookieHeader":"sid=json-cookie-header-secret; csrf=json-cookie-header-second-secret"}',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    'Authorization: Digest username="alice", nonce="abc123", response="deadbeef"',
    'Digest username="standalone-user", realm="standalone-realm", nonce="standalone-nonce", uri="/standalone/path", response="standalone-response", cnonce="standalone-cnonce"',
    '{"Authorization":"Digest username=\\"json-user\\", nonce=\\"json-nonce\\", response=\\"json-response\\""}',
    '{"authorizationHeader":"OAuth oauth_token=\\"json-oauth-token\\", oauth_signature=\\"json-oauth-signature\\", oauth_nonce=\\"json-oauth-nonce\\""}',
    '{"authorizationHeader":"Digest username=\\"json-digest-user\\", realm=\\"json-digest-realm\\", nonce=\\"json-digest-nonce\\", uri=\\"/digest/private/path\\", response=\\"json-digest-response\\", cnonce=\\"json-digest-cnonce\\""}',
    '{"authHeader":"OAuth oauth_token=\\"json-auth-token\\", oauth_signature=\\"json-auth-signature\\", oauth_nonce=\\"json-auth-nonce\\""}',
    'Cookie sid=bare-cookie-secret; csrf=bare-cookie-second-secret',
    'Authorization: Token token-secret-value',
    'Authorization: OAuth oauth-secret-value',
    'AWS4-HMAC-SHA256 Credential=aws-credential/20260502/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=aws-signature',
    'EG1-HMAC-SHA256 client_token=akamai-client;access_token=akamai-access;timestamp=20260502T000000Z;nonce=akamai-nonce;signature=akamai-signature',
    'X-Amz-Credential=aws-query-credential x-amz-credential=aws-lower-credential xAmzCredential=aws-camel-credential X-Amz-Signature=aws-query-signature X-Amz-Security-Token=aws-security-token',
    'https://example.test/path?visible=1&X-Amz-Credential=aws-url-credential&X-Amz-Signature=aws-url-signature&X-Amz-Security-Token=aws-url-security-token',
    'https://user:password@example.test/callback?access_token=url-token&visible=1',
    '-----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----',
    'C:\\Users\\alice\\oauth.json Digest realm="digest-private-realm", nonce="digest-secret-nonce", response="digest-secret-response"',
    'client-secret=hyphen client secret next=ok',
    'client_secret=super-secret',
    'passphrase=client cert passphrase words next=ok',
    'credential=credential bag words next=ok',
    'credentials=credentials bag words next=ok',
    'authorization code authcodevalue client secret clientSecretValue device code deviceCodeValue user code userCodeValue code verifier verifierValue client assertion assertionValue cert passphrase passphraseSecret private key privateKeyValue',
    'authorization_code=auth-code-secret',
    'authorization-code=secret authorization code words next=ok',
    'authorizationCode: camel-auth-code-secret',
    'device_code=device-code-secret',
    'user_code=user-code-secret',
    'code_verifier=code-verifier-secret',
    'code verifier code-verifier-label-secret client assertion client-assertion-label-secret',
    'clientAssertion=client-assertion-secret',
    'token=exact-token-secret code=oauth-code-secret state=oauth-state-secret',
    'authToken=camel-auth-token-secret authorizationToken=authorization-token-secret clientToken=client-token-secret bearerToken=bearer-token-secret oauthToken=oauth-token-secret',
    'body=smoke-body-assignment-secret bodyPreview=smoke-body-preview-assignment-secret responseText=smoke-response-text-assignment-secret rendered-response=smoke-rendered-response-assignment-secret {"body":"smoke-json-body-secret"}',
    nestedEscaped,
    '{\\"body\\":\\"smoke-raw-escaped-body-secret\\",\\"responseText\\":\\"smoke-raw-escaped-response-secret\\"}',
    'responseBodyText smoke-response-body-secret requestBodyText smoke-request-body-secret variables smoke-variables-secret text smoke-text-secret protocolMessages smoke-protocol-secret consoleOutput smoke-console-secret payloadIdentifier smoke-payload-secret',
    'httpRequest {"method":"PATCH","size":1444,"bytes":1555,"metrics":{"method":"POST","size":1333,"bytes":1666}}',
    'httpResponse {"status":203,"statusText":"Non-Authoritative","size":1222,"timing":{"statusCode":210,"contentLength":1111}}',
    'requestInfo {"metrics":{"method":"PUT","size":77777}} responseDetails {"metrics":{"reason":"Created","contentLength":88888}}',
    '{"httpRequest":{"method":"PATCH","size":99991,"body":"quoted-smoke-request-secret"}}',
    '{"httpResponses":[{"status":207,"statusText":"Multi-Status","size":99994}]}',
    '{\\"httpResponse\\":{"status":226,"statusText":"IM Used","size":99997,"body":"escaped-smoke-response-secret"}}',
    'refresh_token: refresh-secret',
    'C:\\Users\\alice\\AppData\\Local\\PostMeter\\workspace.json',
    '/home/alice/PostMeter/workspace.json'
  ].join('\n');

  const redacted = redactSmokeOutputText(raw, ['/home/alice/PostMeter']);
  const structuredAssignmentContext = redactSmokeOutputText('body={"customer":"smoke-body-assignment-context-secret"} next=body-safe');

  assert.doesNotMatch(redacted, new RegExp(escapeRegExp(process.cwd())));
  assert.doesNotMatch(redacted, /session=secret/);
  assert.doesNotMatch(redacted, /json-cookie-secret|json-second-cookie-secret|json-cookie-header-secret|json-cookie-header-second-secret/);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz/);
  assert.doesNotMatch(redacted, /alice|abc123|deadbeef|standalone-user|standalone-realm|standalone-nonce|standalone-response|standalone-cnonce|\/standalone\/path|json-user|json-nonce|json-response|json-oauth-token|json-oauth-signature|json-oauth-nonce|json-digest-user|json-digest-realm|json-digest-nonce|json-digest-response|json-digest-cnonce|\/digest\/private\/path|json-auth-token|json-auth-signature|json-auth-nonce|bare-cookie-secret|bare-cookie-second-secret/);
  assert.doesNotMatch(redacted, /token-secret-value/);
  assert.doesNotMatch(redacted, /oauth-secret-value/);
  assert.doesNotMatch(redacted, /aws-credential|aws-signature|akamai-client|akamai-access|akamai-nonce|akamai-signature|aws-query-credential|aws-lower-credential|aws-camel-credential|aws-query-signature|aws-security-token|aws-url-credential|aws-url-signature|aws-url-security-token|hyphen client secret|client secret next/);
  assert.doesNotMatch(redacted, /user:password|example\.test|url-token|visible=1|digest-private-realm|digest-secret-nonce|digest-secret-response|private-key-secret/);
  assert.match(redacted, /\[url\]/);
  assert.match(redacted, /\[redacted-private-key\]/);
  assert.match(redacted, /\[redacted-auth\]/);
  assert.doesNotMatch(redacted, /super-secret/);
  assert.doesNotMatch(redacted, /client cert passphrase words|credential bag words|credentials bag words/);
  assert.doesNotMatch(redacted, /authcodevalue|clientSecretValue|deviceCodeValue|userCodeValue|verifierValue|assertionValue|passphraseSecret|privateKeyValue/);
  assert.doesNotMatch(redacted, /auth-code-secret/);
  assert.doesNotMatch(redacted, /exact-token-secret|oauth-code-secret|oauth-state-secret|camel-auth-token-secret|authorization-token-secret|client-token-secret|bearer-token-secret|oauth-token-secret/);
  assert.doesNotMatch(redacted, /authorization code words/);
  assert.doesNotMatch(redacted, /camel-auth-code-secret/);
  assert.doesNotMatch(redacted, /device-code-secret/);
  assert.doesNotMatch(redacted, /user-code-secret/);
  assert.doesNotMatch(redacted, /code-verifier-secret/);
  assert.doesNotMatch(redacted, /code-verifier-label-secret|client-assertion-label-secret/);
  assert.doesNotMatch(redacted, /client-assertion-secret/);
  assert.doesNotMatch(redacted, /smoke-body-assignment-secret|smoke-body-preview-assignment-secret|smoke-response-text-assignment-secret|smoke-rendered-response-assignment-secret|smoke-json-body-secret|smoke-nested-json-body-secret|smoke-nested-json-preview-secret|smoke-nested-json-response-secret|smoke-nested-json-rendered-secret|smoke-raw-escaped-body-secret|smoke-raw-escaped-response-secret|smoke-response-body-secret|smoke-request-body-secret|smoke-variables-secret|smoke-text-secret|smoke-protocol-secret|smoke-console-secret|smoke-payload-secret|quoted-smoke-request-secret|escaped-smoke-response-secret|\b(?:1444|1555|1333|1666|203|1222|1111|77777|88888|99991|99994|99997)\b|Non-Authoritative|Multi-Status|IM Used|Created/);
  assert.doesNotMatch(structuredAssignmentContext, /smoke-body-assignment-context-secret/);
  assert.match(structuredAssignmentContext, /next=body-safe/);
  assert.doesNotMatch(redacted, /refresh-secret/);
  assert.doesNotMatch(redacted, /C:\\Users\\alice/);
  assert.doesNotMatch(redacted, /\/home\/alice/);
  assert.match(redacted, /\[path\]/);
  assert.match(redacted, /Authorization: \[redacted\]/);
  assert.match(redacted, /\[redacted-auth\]/);

  const safeContext = redactSmokeOutputText('OAuth 2.0 provider returned invalid_grant. Digest auth username is required. token endpoint failed.');
  assert.match(safeContext, /OAuth 2\.0 provider returned invalid_grant/);
  assert.match(safeContext, /Digest auth username is required/);
  assert.match(safeContext, /token endpoint failed/);
  assert.equal(redactSmokeOutputText('Basic authentication failed. Bearer authentication is required.'), 'Basic authentication failed. Bearer authentication is required.');
  assert.equal(
    redactSmokeOutputText('Cookie authentication failed. Cookie jar disabled. Set-Cookie handling unavailable.'),
    'Cookie authentication failed. Cookie jar disabled. Set-Cookie handling unavailable.'
  );
  assert.equal(
    redactSmokeOutputText('Cookie: sid=session-secret Basic authentication failed. Bearer authentication is required.'),
    'Cookie: [redacted] Basic authentication failed. Bearer authentication is required.'
  );
  assert.equal(
    redactSmokeOutputText('Set-Cookie: sid=set-cookie-secret; Path=/; HttpOnly; Secure Basic authentication failed. Bearer authentication is required.'),
    'Set-Cookie: [redacted] Basic authentication failed. Bearer authentication is required.'
  );
  const bareCookieContext = redactSmokeOutputText('provider failed Cookie sid=cookie-bare-secret OAuth 2.0 provider returned invalid_grant Set-Cookie sid=set-cookie-bare-secret Basic authentication required cookieHeader sid=cookie-header-bare-secret Bearer authentication required setCookieHeader sid=set-cookie-header-bare-secret Digest auth username was rejected');
  assert.doesNotMatch(bareCookieContext, /cookie-bare-secret|set-cookie-bare-secret|cookie-header-bare-secret|set-cookie-header-bare-secret/);
  assert.match(bareCookieContext, /OAuth 2\.0 provider returned invalid_grant/);
  assert.match(bareCookieContext, /Basic authentication required/);
  assert.match(bareCookieContext, /Bearer authentication required/);
  assert.match(bareCookieContext, /Digest auth username was rejected/);
});

test('packaged sandbox validation redactor removes executable paths and auth schemes', () => {
  const executable = '/home/alice/PostMeter/release/linux-unpacked/postmeter';
  const nestedEscaped = JSON.stringify({
    output: JSON.stringify({
      body: 'packaged-nested-json-body-secret',
      bodyPreview: 'packaged-nested-json-preview-secret',
      responseText: 'packaged-nested-json-response-secret',
      'rendered-response': 'packaged-nested-json-rendered-secret'
    })
  });
  const redacted = redactPackagedSandboxOutput([
    `Executable failed: ${executable}`,
    'Authorization: Token packaged-token-value',
    'Authorization: OAuth packaged-oauth-value',
    'AWS4-HMAC-SHA256 Credential=packaged-aws-credential/20260502/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=packaged-aws-signature',
    'X-Amz-Credential=packaged-query-credential X-Amz-Signature=packaged-query-signature X-Amz-Security-Token=packaged-security-token',
    'client-secret=packaged hyphen client secret next=ok',
    'client_secret=packaged-secret',
    'authorization code packagedAuthCode client secret packagedClientSecret device code packagedDeviceCode cert passphrase packagedPassphrase private key packagedPrivateKey',
    'code verifier packaged-code-verifier-secret body=packaged-body-assignment-secret bodyPreview=packaged-body-preview-assignment-secret responseText=packaged-response-text-assignment-secret rendered-response=packaged-rendered-response-assignment-secret {"body":"packaged-json-body-secret"} responseBodyText packaged-response-body-secret variables packaged-variables-secret text packaged-text-secret consoleOutput packaged-console-secret payloadIdentifier packaged-payload-secret',
    nestedEscaped,
    '{\\"body\\":\\"packaged-raw-escaped-body-secret\\",\\"responseText\\":\\"packaged-raw-escaped-response-secret\\"}',
    'Cookie sid=packaged-bare-cookie; csrf=packaged-bare-cookie-two',
    '{"Cookie":"sid=packaged-json-cookie; csrf=packaged-json-cookie-two"}',
    '{"authorizationHeader":"Digest username=\\"packaged-digest-user\\", realm=\\"packaged-digest-realm\\", nonce=\\"packaged-digest-nonce\\", uri=\\"/packaged/digest/private\\", response=\\"packaged-digest-response\\", cnonce=\\"packaged-digest-cnonce\\""}',
    'passphrase=packaged passphrase words next=ok',
    'credential=packaged credential words next=ok'
  ].join('\n'), executable);

  assert.doesNotMatch(redacted, /\/home\/alice\/PostMeter|packaged-token-value|packaged-oauth-value|packaged-aws-credential|packaged-aws-signature|packaged-query-credential|packaged-query-signature|packaged-security-token|packaged hyphen client secret|packaged-secret|packagedAuthCode|packagedClientSecret|packagedDeviceCode|packagedPassphrase|packagedPrivateKey|packaged-code-verifier-secret|packaged-body-assignment-secret|packaged-body-preview-assignment-secret|packaged-response-text-assignment-secret|packaged-rendered-response-assignment-secret|packaged-json-body-secret|packaged-nested-json-body-secret|packaged-nested-json-preview-secret|packaged-nested-json-response-secret|packaged-nested-json-rendered-secret|packaged-raw-escaped-body-secret|packaged-raw-escaped-response-secret|packaged-response-body-secret|packaged-variables-secret|packaged-text-secret|packaged-console-secret|packaged-payload-secret|packaged-bare-cookie|packaged-json-cookie|packaged-json-cookie-two|packaged-digest-user|packaged-digest-realm|packaged-digest-nonce|packaged-digest-response|packaged-digest-cnonce|\/packaged\/digest\/private|packaged passphrase words|packaged credential words/);
  assert.match(redacted, /\[path\]/);
  assert.match(redacted, /Authorization: \[redacted\]/);
});

test('source sandbox validation redactor removes runtime paths and auth-shaped child output', () => {
  const executable = '/home/alice/PostMeter/node_modules/electron/dist/electron';
  const nestedEscaped = JSON.stringify({
    output: JSON.stringify({
      body: 'source-nested-json-body-secret',
      bodyPreview: 'source-nested-json-preview-secret',
      responseText: 'source-nested-json-response-secret',
      'rendered-response': 'source-nested-json-rendered-secret'
    })
  });
  const redacted = redactSourceSandboxOutput([
    `Electron child failed: ${executable}`,
    `${process.cwd()}/scripts/validateSandboxRuntime.js`,
    'https://user:password@example.test/callback?access_token=url-token&visible=1',
    'Authorization: Bearer source-token-value',
    'client_secret=source-secret-value',
    'authorization code sourceAuthCode client secret sourceClientSecret device code sourceDeviceCode cert passphrase sourcePassphrase private key sourcePrivateKey',
    'code verifier source-code-verifier-secret body=source-body-assignment-secret bodyPreview=source-body-preview-assignment-secret responseText=source-response-text-assignment-secret rendered-response=source-rendered-response-assignment-secret {"body":"source-json-body-secret"} responseBodyText source-response-body-secret variables source-variables-secret text source-text-secret consoleOutput source-console-secret payloadIdentifier source-payload-secret',
    nestedEscaped,
    '{\\"body\\":\\"source-raw-escaped-body-secret\\",\\"responseText\\":\\"source-raw-escaped-response-secret\\"}',
    'Cookie sid=source-bare-cookie; csrf=source-bare-cookie-two',
    '{"Cookie":"sid=source-json-cookie; csrf=source-json-cookie-two"}',
    '{"authorizationHeader":"Digest username=\\"source-digest-user\\", realm=\\"source-digest-realm\\", nonce=\\"source-digest-nonce\\", uri=\\"/source/digest/private\\", response=\\"source-digest-response\\", cnonce=\\"source-digest-cnonce\\""}',
    'passphrase=source passphrase words next=ok',
    'credential=source credential words next=ok',
    'C:\\Users\\alice\\PostMeter\\workspace.json Digest realm="source-realm", nonce="source-nonce", response="source-response"'
  ].join('\n'), executable);

  assert.doesNotMatch(redacted, /\/home\/alice\/PostMeter|validateSandboxRuntime\.js|user:password|example\.test|url-token|source-token-value|source-secret-value|sourceAuthCode|sourceClientSecret|sourceDeviceCode|sourcePassphrase|sourcePrivateKey|source-code-verifier-secret|source-body-assignment-secret|source-body-preview-assignment-secret|source-response-text-assignment-secret|source-rendered-response-assignment-secret|source-json-body-secret|source-nested-json-body-secret|source-nested-json-preview-secret|source-nested-json-response-secret|source-nested-json-rendered-secret|source-raw-escaped-body-secret|source-raw-escaped-response-secret|source-response-body-secret|source-variables-secret|source-text-secret|source-console-secret|source-payload-secret|source-bare-cookie|source-json-cookie|source-json-cookie-two|source-digest-user|source-digest-realm|source-digest-nonce|source-digest-response|source-digest-cnonce|\/source\/digest\/private|source passphrase words|source credential words|source-realm|source-nonce|source-response|C:\\Users\\alice/);
  assert.match(redacted, /\[path\]/);
  assert.match(redacted, /\[url\]/);
  assert.match(redacted, /Authorization: \[redacted\]/);
});

test('packaged sandbox validation timeout parsing keeps the fail-closed timeout exit path bounded', () => {
  assert.equal(validationTimeoutMillis('1'), 1000);
  assert.equal(validationTimeoutMillis('bad'), 60000);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
