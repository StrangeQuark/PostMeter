const assert = require('node:assert/strict');
const test = require('node:test');

const {
  redactText,
  sanitizeDiagnosticEvent
} = require('../../src/core/diagnostics-release/diagnostics');
const { redactOAuthErrorMessage } = require('../../src/core/http/auth');
const { redactedDiagnosticsExportError } = require('../../electron/ipc/diagnosticsIpc');
const { sanitizeIpcError } = require('../../electron/security/ipcSecurity');
const { redactSmokeOutputText } = require('../../scripts/smokeProcess');
const {
  packagedSmokeCliErrorText,
  redactPackagedSmokeLogText
} = require('../../scripts/validatePackagedAppSmoke');
const { redactForOutput } = require('../../scripts/validateSandboxRuntime');
const { redactForOutput: redactPackagedSandboxOutput } = require('../../scripts/validatePackagedSandboxRuntime');
const { redactUiSmokeText } = require('../../electron/app-shell/mainWindow');

function escapedRequestResponseSample(prefix) {
  const nested = JSON.stringify({
    output: JSON.stringify({
      body: `${prefix}-nested-prefix\n${prefix}-nested-newline-secret`,
      bodyPreview: `backslash \\ ${prefix}-nested-backslash-secret`,
      responseText: `quoted "${prefix}-nested-quote-secret"`,
      data: JSON.stringify({
        body: `${prefix}-inner-body-secret`,
        responseText: `${prefix}-inner-response-secret`
      })
    })
  });
  const rawEscaped = `{\\\"body\\\":\\\"${prefix}-raw-prefix\\n${prefix}-raw-newline-secret\\\",\\\"responseText\\\":\\\"quoted \\\\\\\"${prefix}-raw-quote-secret\\\\\\\"\\\",\\\"bodyPreview\\\":\\\"backslash \\\\ ${prefix}-raw-backslash-secret\\\"}`;
  return `${nested}\n${rawEscaped}`;
}

test('escaped and nested request response alias redaction handles JSON escape sequences across diagnostics surfaces', () => {
  const sample = escapedRequestResponseSample('escape-regression');
  const leakPattern = /escape-regression-(?:nested-newline|nested-backslash|nested-quote|inner-body|inner-response|raw-newline|raw-quote|raw-backslash)-secret/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.escape-regression', fields: { detail: sample } }))],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked escaped request/response content`);
  }
});

test('bare URL header and metadata aliases are redacted across diagnostics surfaces', () => {
  const sample = [
    'queryParams customerId=customer-query-secret headers X-Customer-Id: customer-header-secret grpcMetadata x-trace=customer-metadata-secret',
    'requestHeaders Authorization Bearer header-context-secret responseHeaders Proxy-Authorization Basic response-header-context-secret metadata Authorization Bearer metadata-context-secret'
  ].join('\n');
  const leakPattern = /customer-(?:query|header|metadata)-secret|(?:header|response-header|metadata)-context-secret/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.bare-alias-regression', fields: { detail: sample } }))],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked bare request/response alias content`);
  }
});

test('unescaped structured alias arrays and objects redact as complete containers across diagnostics surfaces', () => {
  const sample = [
    'headers [{"name":"X-Api-Key","value":"header-array-secret"}] next=safe',
    'headers [ { name: "Authorization", value: "spaced-js-header-secret" } ] next=safe',
    'headers = [ { name: "Authorization", value: "equals-spaced-header-secret" } ] next=safe',
    'headers: [ { name: "Authorization", value: "colon-spaced-header-secret" } ] next=safe',
    'queryParams [{"key":"access_token","value":"query-array-secret"}] next=safe',
    'queryParams [ { key: "access_token", value: "js-query-secret" } ] next=safe',
    'queryParams = [ { key: "access_token", value: "equals-spaced-query-secret" } ] next=safe',
    'queryParams: [ { key: "access_token", value: "colon-spaced-query-secret" } ] next=safe',
    'urlParameters [{"name":"state","schema":{"default":"url-schema-secret"}}] next=safe',
    'urlParameters [ { name: "state", schema: { default: "js-url-schema-secret" } } ] next=safe',
    'urlParameters = { name: "state", schema: { default: "equals-spaced-url-secret" } } next=safe',
    'urlParameters: { name: "state", schema: { default: "colon-spaced-url-secret" } } next=safe',
    'metadata [{"name":"authorization","value":"metadata-array-secret"}] next=safe',
    "metadata [ { name: 'authorization', value: 'single-js-metadata-secret' } ] next=safe",
    'metadata = [ { name: "authorization", value: "equals-spaced-metadata-secret" } ] next=safe',
    'metadata: [ { name: "authorization", value: "colon-spaced-metadata-secret" } ] next=safe',
    'metadata [Object: null prototype] { traceparent: "rr-metadata-customer-trace" } next=safe',
    'headers HeadersList { cookies: null, [Symbol(headers map)]: Map(1) { "traceparent" => { name: "traceparent", value: "rr-class-header-value" } } } next=safe',
    "headers Map(1) {\n  'traceparent' => 'multi-map-trace-secret'\n} next=safe",
    "metadata Map(1) {\n  'traceparent' => 'multi-map-metadata-secret'\n} next=safe",
    "queryParams URLSearchParams(1) {\n  'customer' => 'multi-query-secret'\n} next=safe",
    "body BodyWrapper(1) {\n  customer: 'multi-body-secret'\n} next=safe",
    "body BodyWrapper [Object] {\n  customer: 'body-bracket-after-secret'\n} next=safe",
    "consoleOutput LogWrapper [Array] [\n  { line: 'console-bracket-array-secret' }\n] next=safe",
    'body {"customer":"body-object-secret"} next=safe',
    'httpRequest {"method":"PATCH","size":1444,"bytes":1555,"metrics":{"method":"POST","size":1333,"bytes":1666}} next=safe',
    'httpResponse {"status":203,"statusText":"Non-Authoritative","size":1222,"timing":{"statusCode":210,"contentLength":1111}} next=safe',
    'requestInfo {"metrics":{"method":"PUT","size":77777,"bodyBytes":77778,"bodySize":77779,"contentBytes":77780}} next=safe',
    'responseDetails {"metrics":{"reason":"Created","reasonPhrase":"Created Phrase","statusCategory":"2xx","contentLength":88888,"contentBytes":88889}} next=safe',
    '{"httpRequest":{"method":"PATCH","size":99991,"bytes":99992,"body":"quoted-http-request-body-secret"}} next=safe',
    '{"httpRequests":[{"method":"POST","size":99993}],"httpResponses":[{"status":207,"statusText":"Multi-Status","size":99994}]} next=safe',
    '{"responseInfo":{"status":208,"statusText":"Already Reported","size":99995},"requestDetails":{"method":"DELETE","bytes":99996}} next=safe',
    '{\\"httpResponse\\":{"status":226,"statusText":"IM Used","size":99997,"body":"escaped-http-response-body-secret"}} next=safe'
  ].join('\n');
  const leakPattern = /(?:header-array|spaced-js-header|equals-spaced-header|colon-spaced-header|query-array|js-query|equals-spaced-query|colon-spaced-query|url-schema|js-url-schema|equals-spaced-url|colon-spaced-url|metadata-array|single-js-metadata|equals-spaced-metadata|colon-spaced-metadata|multi-map-trace|multi-map-metadata|multi-query|multi-body|body-bracket-after|console-bracket-array|body-object|quoted-http-request-body|escaped-http-response-body)-secret|rr-(?:metadata-customer-trace|class-header-value)|\b(?:1444|1555|1333|1666|1222|1111|77777|77778|77779|77780|88888|88889|99991|99992|99993|99994|99995|99996|99997|Non-Authoritative|Created Phrase|Multi-Status|Already Reported|IM Used)\b/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.unescaped-container-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked unescaped structured request/response alias content`);
  }
});

test('whitespace-only snake kebab and camel OAuth secret labels redact across diagnostics surfaces', () => {
  const sample = [
    'client-secret Bearer-secret-word next=safe',
    'client_secret Basic-secret-word next=safe',
    'clientSecret HawkSecretWord next=safe',
    'authorization-code Bearer-code-word next=safe',
    'authorization_code Basic-code-word next=safe',
    'authorizationCode HawkCodeWord next=safe',
    'code-verifier VerifierSecretWord next=safe',
    'clientAssertion AssertionSecretWord next=safe',
    'api_key ApiKeySecretWord next=safe',
    'session-token SessionTokenHyphenSecret next=safe',
    'session_token SessionTokenUnderSecret next=safe',
    'sessionToken SessionTokenCamelSecret next=safe',
    'certificate_passphrase CertificatePassphraseSecret next=safe',
    'secret-value SecretValueHyphenSecret next=safe'
  ].join('\n');
  const leakPattern = /Bearer-secret-word|Basic-secret-word|HawkSecretWord|Bearer-code-word|Basic-code-word|HawkCodeWord|VerifierSecretWord|AssertionSecretWord|ApiKeySecretWord|SessionTokenHyphenSecret|SessionTokenUnderSecret|SessionTokenCamelSecret|CertificatePassphraseSecret|SecretValueHyphenSecret/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.bare-secret-label-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked bare OAuth secret label content`);
    assert.match(output, /next=safe/, `${name} should preserve non-sensitive trailing context`);
  }
});

test('API key secret CSRF XSRF and JWT aliases redact across diagnostics surfaces', () => {
  const sample = [
    'x-api-key=x-api-key-assignment-secret next=safe',
    'xApiKey=x-api-key-camel-secret next=safe',
    'secretKey=secret-key-camel-secret next=safe',
    'secret-access-key=secret-access-key-secret next=safe',
    'apiSecret=api-secret-camel-secret next=safe',
    'subscriptionKey=subscription-key-camel-secret next=safe',
    'Ocp-Apim-Subscription-Key=ocp-apim-subscription-key-secret next=safe',
    'accessKeyId=access-key-id-secret next=safe',
    'sharedAccessKey=shared-access-key-secret next=safe',
    'consumerSecret=consumer-secret-camel-secret next=safe',
    'oauthConsumerKey=oauth-consumer-key-secret next=safe',
    'oauth_consumer_secret=oauth-consumer-secret-secret next=safe',
    'sessionId=session-id-secret next=safe',
    'personalAccessToken=personal-access-token-secret next=safe',
    'githubToken=github-token-secret next=safe',
    'xToken=x-token-camel-secret next=safe',
    'xSecret=x-secret-camel-secret next=safe',
    'aPassword=a-password-camel-secret next=safe',
    'x-token=x-token-hyphen-secret next=safe',
    'webhookSecret=webhook-secret-secret next=safe',
    'signingSecret=signing-secret-secret next=safe',
    'dbPassword=db-password-secret next=safe',
    'passwd=passwd-secret next=safe',
    'databaseCredential=database-credential-secret next=safe',
    'accountKey=account-key-secret next=safe',
    'storageKey=storage-key-secret next=safe',
    'signingKey=signing-key-secret next=safe',
    'webhookKey=webhook-key-secret next=safe',
    'licenseKey=license-key-secret next=safe',
    'x-access-token=x-access-token-secret next=safe',
    'xAuthToken=x-auth-token-secret next=safe',
    'xAuthorizationToken=x-authorization-token-secret next=safe',
    'csrfToken=csrf-token-secret next=safe',
    'xsrfToken=xsrf-token-secret next=safe',
    'x-csrf-token=x-csrf-token-secret next=safe',
    'xXsrfToken=x-xsrf-token-secret next=safe',
    'jwtToken=jwt-token-secret next=safe',
    'x-api-key ApiKeyBareSecret next=safe',
    'secretKey SecretKeyBareSecret next=safe',
    'passwd PasswdBareSecret next=safe',
    'subscription-key SubscriptionKeyBareSecret next=safe',
    'oauth-consumer-secret OAuthConsumerSecretBareSecret next=safe',
    'xCsrfToken XCsrfBareSecret next=safe',
    'jwt-token JwtBareSecret next=safe',
    '{"xApiKey":"json-x-api-key-secret","secretKey":"json-secret-key-secret","xToken":"json-x-token-secret","xSecret":"json-x-secret-secret","aPassword":"json-a-password-secret","passwd":"json-passwd-secret","subscriptionKey":"json-subscription-key-secret","csrfToken":"json-csrf-token-secret","jwtToken":"json-jwt-token-secret"}',
    '{\\"x-api-key\\":\\"escaped-x-api-key-secret\\",\\"secret-access-key\\":\\"escaped-secret-access-key-secret\\",\\"x-csrf-token\\":\\"escaped-x-csrf-token-secret\\",\\"jwtToken\\":\\"escaped-jwt-token-secret\\"}'
  ].join('\n');
  const leakPattern = /x-api-key-(?:assignment|camel)-secret|(?:secret-key|api-secret|subscription-key|consumer-secret|oauth-consumer-key|x-token|x-secret|a-password)-camel-secret|x-token-hyphen-secret|(?:secret-access-key|ocp-apim-subscription-key|access-key-id|shared-access-key|oauth-consumer-secret|session-id|personal-access-token|github-token|webhook-secret|signing-secret|db-password|passwd|database-credential|account-key|storage-key|signing-key|webhook-key|license-key)-secret|x-(?:access|auth|authorization)-token-secret|(?:csrf|xsrf|jwt)-token-secret|x-(?:csrf|xsrf)-token-secret|(?:ApiKeyBare|SecretKeyBare|PasswdBare|SubscriptionKeyBare|OAuthConsumerSecretBare|XCsrfBare|JwtBare)Secret|json-(?:x-api-key|secret-key|x-token|x-secret|a-password|passwd|subscription-key|csrf-token|jwt-token)-secret|escaped-(?:x-api-key|secret-access-key|x-csrf-token|jwt-token)-secret/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.api-key-token-alias-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked API key, secret, CSRF, XSRF, or JWT alias content`);
    assert.match(output, /next=safe/, `${name} should preserve non-sensitive trailing context`);
  }
});

test('compact token-shaped diagnostic labels redact across diagnostics surfaces', () => {
  const sample = 'xtokensupersecret12345 x-token-supersecret12345 accesstokenabcdef1234 stateabcdef1234 codeabcdef1234 xtokenabcdef1234 x-token-abcdef1234 tokenendpointfailed next=safe';
  const leakPattern = /xtokensupersecret12345|x-token-supersecret12345|accesstokenabcdef1234|stateabcdef1234|codeabcdef1234|xtokenabcdef1234|x-token-abcdef1234/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.compact-token-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked compact token-shaped diagnostic label content`);
    assert.match(output, /tokenendpointfailed next=safe/, `${name} should preserve safe token-adjacent prose`);
  }
});

test('assignment-form certificate private key and secret-value fields redact across diagnostics surfaces', () => {
  const sample = [
    'certificatePassphrase=assigned-cert-secret next=safe',
    'certPassphrase=assigned-cert-short-secret next=safe',
    'private key=assigned-private-space next=safe',
    '"private key":"assigned-private-quoted-space" next=safe',
    'privateKey=assigned-private-key next=safe',
    'private-key=assigned-private-hyphen next=safe',
    'private_key=assigned-private-snake next=safe',
    'secretValue=assigned-secret-value next=safe',
    'secret-value=assigned-secret-hyphen next=safe',
    'secret_value=assigned-secret-snake next=safe',
    'private key=space-private-secret private key: colon-private-secret next=safe',
    'secret value=space-secret-value secret value: colon-secret-value next=safe',
    'access token=space-access-token access token: colon-access-token next=safe',
    'cert passphrase=space-cert-short-secret secret value=space-secret-after-cert next=safe',
    'private   key=multi-space-private-secret secret   value=multi-space-secret-value next=safe',
    'certificate   passphrase=multi-space-cert-secret client   secret=multi-space-client-secret next=safe'
  ].join('\n');
  const leakPattern = /assigned-(?:cert-secret|cert-short-secret|private-space|private-quoted-space|private-key|private-hyphen|private-snake|secret-value|secret-hyphen|secret-snake)|(?:space|colon)-(?:private-secret|secret-value|access-token)|space-(?:cert-short-secret|secret-after-cert)|multi-space-(?:private-secret|secret-value|cert-secret|client-secret)/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.assignment-secret-field-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked assignment-form certificate/private/secret field content`);
    assert.match(output, /next=safe/, `${name} should preserve non-sensitive trailing context`);
  }
});

test('standalone extended auth schemes and semicolon-delimited auth parameters redact across diagnostics surfaces', () => {
  const sample = [
    'Bearer BearerStandaloneSecret123456789 next=safe',
    'Basic BasicStandaloneSecret123456789 next=safe',
    'Hawk HawkStandaloneSecret123456789 next=safe',
    'Token TokenStandaloneSecret123456789 next=safe',
    'NTLM NtlmStandaloneSecret123456789 next=safe',
    'Negotiate NegotiateStandaloneSecret123456789 next=safe',
    'OAuth OAuthStandaloneSecret123456789 next=safe',
    'Digest DigestStandaloneSecret123456789 next=safe',
    'Bearer abc1234 Basic def5678 Digest ghi9012 Hawk jkl3456 OAuth pqr1234 NTLM stu5678 Negotiate vwx9012 next=safe',
    'Bearer z Basic cd OAuth ef NTLM gh Negotiate ij next=safe',
    'Authorization: Digest username="digest-semi-user-secret"; nonce="digest-semi-nonce-secret"; response="digest-semi-response-secret" next=safe',
    'Proxy-Authorization: Hawk id="hawk-semi-id-secret"; mac="hawk-semi-mac-secret" next=safe',
    'Authorization: Digest username = "digest-space-user-secret", nonce = "digest-space-nonce-secret", response = "digest-space-response-secret" next=safe',
    'Authorization: Hawk id = "hawk-space-id-secret", mac = "hawk-space-mac-secret" next=safe',
    'Authorization: EG1-HMAC-SHA256 client_token = akamai-space-client-secret; access_token = akamai-space-access-secret; nonce = akamai-space-nonce-secret; signature = akamai-space-signature-secret next=safe'
  ].join('\n');
  const leakPattern = /(?:Bearer|Basic|Hawk|Token|Ntlm|Negotiate|OAuth|Digest)StandaloneSecret123456789|abc1234|def5678|ghi9012|jkl3456|pqr1234|stu5678|vwx9012|\b(?:z|cd|ef|gh|ij)\b|(?:digest-(?:semi|space)-(?:user|nonce|response)|hawk-(?:semi|space)-(?:id|mac)|akamai-space-(?:client|access|nonce|signature))-secret/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.extended-auth-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked extended auth scheme content`);
    assert.match(output, /next=safe/, `${name} should preserve non-sensitive trailing context`);
  }
});

test('auth scheme words embedded in safe hyphenated values and safe prose are preserved across diagnostics surfaces', () => {
  const sample = 'pre-Bearer-post Basic-authentication-needed OAuth-provider-note Digest-auth-note Token-based-auth OAuth 2.0 Bearer token OAuth flow Basic authentication next=safe';
  const expected = [
    'pre-Bearer-post',
    'Basic-authentication-needed',
    'OAuth-provider-note',
    'Digest-auth-note',
    'Token-based-auth',
    'OAuth 2.0',
    'Bearer token',
    'OAuth flow',
    'Basic authentication',
    'next=safe'
  ];
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.auth-scheme-preserve-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    for (const value of expected) {
      assert.match(output, new RegExp(value), `${name} should preserve ${value}`);
    }
  }
});

test('escaped nested URL aliases do not break later header and metadata redaction', () => {
  const sample = JSON.stringify({
    output: JSON.stringify({
      body: 'body-before-url-secret',
      requestUrl: 'https://api.example.test/customer?token=url-secret',
      headers: { authorization: 'Bearer header-after-url-secret' },
      grpcMetadata: { trace: 'metadata-after-url-secret' }
    })
  });
  const leakPattern = /body-before-url-secret|url-secret|header-after-url-secret|metadata-after-url-secret|api\.example\.test/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.url-fragment-regression', fields: { detail: sample } }))],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked escaped request/response URL-adjacent content`);
  }
});

test('double-escaped nested request response arrays and objects redact across diagnostics surfaces', () => {
  const payload = {
    details: JSON.stringify({
      outer: {
        requestUrl: 'https://api.example.test/customer?token=url-secret&q=nested-search-secret',
        queryParams: [
          { key: 'q', value: 'nested-query-secret' },
          { key: 'token', value: 'nested-token-secret' }
        ],
        searchParams: [{ key: 's', value: 'nested-search-param-secret' }],
        pathParams: [{ key: 'id', value: 'nested-path-secret' }],
        urlParams: [{ key: 'u', value: 'nested-url-param-secret' }],
        headers: { 'X-Customer': 'nested-header-secret' },
        requestHeaders: { 'X-Request': 'nested-request-header-secret' },
        responseHeaders: { 'X-Response': 'nested-response-header-secret' },
        metadata: { trace: 'nested-metadata-secret' },
        grpcMetadata: { trace: 'nested-grpc-metadata-secret' },
        bodyPreview: 'nested-preview-secret',
        responseText: 'nested-response-secret'
      }
    })
  };
  const sample = `OAuth failed ${JSON.stringify(payload).replace(/"/g, '\\"')} next=value`;
  const leakPattern = /api\.example\.test|url-secret|nested-(?:search|query|token|search-param|path|url-param|header|request-header|response-header|metadata|grpc-metadata|preview|response)-secret/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.double-escaped-array-regression', fields: { detail: sample } }))],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked double-escaped nested request/response content`);
    assert.match(output, /next=value/, `${name} should preserve non-sensitive trailing context`);
  }
});

test('nested escaped JSON auth header aliases redact compound Digest values across diagnostics surfaces', () => {
  const sample = JSON.stringify({
    output: JSON.stringify({
      authorizationHeader: 'Digest username="probe-authheader-authorization-secret", nonce="probe-authheader-nonce-secret", response="probe-authheader-digest-response-secret"'
    })
  });
  const leakPattern = /probe-authheader-(?:authorization|nonce|digest-response)-secret/;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.escaped-auth-header-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked nested escaped auth header content`);
  }
});

test('JSON-escaped slash URLs and file URLs redact across diagnostics surfaces', () => {
  const sample = String.raw`provider error {\"error\":\"failed at https:\/\/api.example.test\/private\/customer-url-secret?access_token=token-secret&visible=ok and file:\/\/\/Users\/alice\/secret-workspace.postmeter.json and file:\\/\\/\\/Users\\/Alice\\/Customer Data Project\\/secret.json and file:\\/\\/SERVER\\/Share\\/Customer Files\\/secret.json and FILE:\\/\\/SERVER\\/Share\\/Customer Files\\/secret.json failed \\\/data\\\/Customer Project\\\/invoice.pdf failed \\\/home\\\/Alice\\\/Customer Project\\\/invoice.pdf failed \\\/workspace\\\/Customer Project\\\/invoice.pdf failed \\\/srv\\\/Customer Project\\\/invoice.pdf failed \\\/nix\\\/store\\\/Customer Project\\\/invoice.pdf failed \\\/Applications\\\/PostMeter.app\\\/Customer Project\\\/invoice.pdf failed \\\/Volumes\\\/Client Matter 123\\\/secret.json failed \\\/mnt\\\/c\\\/Users\\\/Alice\\\/secret.json\"} next=ok`;
  const leakPattern = /api\.example\.test|customer-url-secret|token-secret|visible=ok|Users\\\/alice|secret-workspace|Customer Data Project|Customer Files|SERVER|Share|file:\\\/\\\/SERVER|FILE:\\\/\\\/SERVER|Client Matter|Customer Project|invoice\.pdf|secret\.json|\\\/data\\\/|\\\/home\\\/Alice|\\\/workspace\\\/|\\\/srv\\\/|\\\/nix\\\/store|\\\/Applications\\\/PostMeter|\\\/Volumes|\\\/mnt|\\\/private\\\//;
  const cases = [
    ['diagnostics text', redactText(sample)],
    ['diagnostics event', JSON.stringify(sanitizeDiagnosticEvent({ type: 'redaction.escaped-slash-url-regression', fields: { detail: sample } }))],
    ['IPC error', sanitizeIpcError(new Error(sample)).message],
    ['diagnostics export error', redactedDiagnosticsExportError(new Error(sample)).message],
    ['oauth error', redactOAuthErrorMessage(sample)],
    ['smoke output', redactSmokeOutputText(sample)],
    ['packaged smoke output', redactPackagedSmokeLogText(sample)],
    ['source sandbox validation output', redactForOutput(sample, process.execPath)],
    ['packaged sandbox validation output', redactPackagedSandboxOutput(sample, process.execPath)],
    ['packaged smoke CLI error', packagedSmokeCliErrorText(new Error(sample), process.execPath)],
    ['UI smoke output', redactUiSmokeText(sample)]
  ];

  for (const [name, output] of cases) {
    assert.doesNotMatch(output, leakPattern, `${name} leaked JSON-escaped slash URL or file URL content`);
    assert.match(output, /next=ok/, `${name} should preserve non-sensitive trailing context`);
  }
});

test('UI smoke redaction covers structured request response alias assignments', () => {
  const output = redactUiSmokeText([
    'body={"customer":"ui-object-secret"} next=ok',
    'variables=[{"customer":"ui-array-secret"}] next=ok',
    '{"body":{"customer":"ui-json-object-secret"}}',
    '{"output":"{\\"body\\":{\\"customer\\":\\"ui-nested-json-object-secret\\"}}"}'
  ].join('\n'));

  assert.doesNotMatch(output, /ui-(?:object|array|json-object|nested-json-object)-secret/);
  assert.match(output, /next=ok/);
});
