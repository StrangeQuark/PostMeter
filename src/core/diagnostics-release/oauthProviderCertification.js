const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  pollOAuthDeviceToken,
  redactOAuthErrorMessage,
  refreshOAuthToken,
  requestOAuthClientCredentialsToken,
  requestOAuthDeviceAuthorization
} = require('../http/auth');

const REQUIRED_PROVIDER_IDS = Object.freeze(['google', 'microsoft-entra', 'github']);
const REQUIRED_SCENARIOS = Object.freeze([
  'authorization-code-pkce-success',
  'authorization-code-provider-denial',
  'authorization-code-timeout-or-abandonment',
  'authorization-code-bad-state',
  'authorization-code-bad-code-verifier',
  'refresh-token-success',
  'refresh-token-revoked',
  'client-credentials-success',
  'device-code-success',
  'device-code-denial',
  'device-code-expired',
  'device-code-cancellation',
  'malformed-token-response',
  'missing-access-token',
  'token-endpoint-redirect-denial',
  'token-storage-redaction-policy'
]);
const SECRET_PATTERN = /(mock-access-token|mock-refresh-token|mock-client-token|mock-device-token|mock-refreshed-token|mock-rotated-token|raw-access-token|raw-client-secret|raw-refresh-token|leaked-secret|super-secret|refresh-leak)/i;
const LIVE_SECRET_FIELD_PATTERN = /\b(token|secret|cookie|set[\s_-]?cookie|access[\s_-]?token|refresh[\s_-]?token|id[\s_-]?token|client[\s_-]?secret|client[\s_-]?assertion|authorization[\s_-]?code|authorization[\s_-]?header|proxy[\s_-]?authorization(?:[\s_-]?header)?|auth[\s_-]?header|code[\s_-]?verifier|device[\s_-]?code|user[\s_-]?code|accessToken|refreshToken|idToken|clientSecret|clientAssertion|authorizationCode|authorizationHeader|proxyAuthorization|proxyAuthorizationHeader|authHeader|codeVerifier|deviceCode|userCode|code|authorization)\b\s*[:=]\s*(?!(?:(?:Bearer|Basic|OAuth)\s+)?(?:\[redacted\]|redacted|not-applicable|none\b))[^\s"',;<>}]+/i;
const LIVE_AUTHORIZATION_HEADER_PATTERN = /\bAuthorization\s*[:=]\s*(?!(?:(?:Bearer|Basic|OAuth)\s+)?(?:\[redacted\]|redacted)(?:\s|[;,.)\]]|$))(?:Bearer|Basic|OAuth)?\s*[A-Za-z0-9._~+/=-]+/i;
const LIVE_BEARER_SECRET_PATTERN = /\bBearer\s+(?!\[redacted\]|redacted\b)[A-Za-z0-9._~+/=-][A-Za-z0-9._~+/=\-]*/i;
const LIVE_JWT_SECRET_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const LIVE_SECRET_FIELD_KEYS = new Set([
  'token',
  'secret',
  'cookie',
  'setcookie',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'clientsecret',
  'clientassertion',
  'authorizationcode',
  'authorizationheader',
  'authheader',
  'codeverifier',
  'devicecode',
  'proxyauthorization',
  'proxyauthorizationheader',
  'code',
  'usercode',
  'authorization'
]);
const LIVE_TEXT_ARTIFACT_TYPES = new Set(['sanitized-run-log', 'sanitized-transcript', 'manual-checklist']);
const LIVE_EVIDENCE_ARTIFACT_TYPES = new Set(['sanitized-run-log', 'sanitized-transcript', 'sanitized-screenshot', 'manual-checklist']);
const LIVE_EVIDENCE_GRANT_TYPES = new Set(['authorization-code-pkce', 'refresh-token', 'client-credentials', 'device-code']);
const LIVE_EVIDENCE_ARTIFACT_DIRECTORY = 'validation-artifacts/oauth-provider-certification';
const ENTRA_AUTHORITY_HOSTS = new Set([
  'login.microsoftonline.com',
  'login.microsoftonline.us',
  'login.chinacloudapi.cn',
  'login.microsoftonline.de'
]);

function buildOAuthProviderCertificationMatrix() {
  return {
    schemaVersion: 1,
    generatedFrom: 'src/core/diagnostics-release/oauthProviderCertification.js',
    deterministic: true,
    providers: [
      provider('google', 'Google OAuth 2.0', {
        authorizationCodePkce: 'required',
        refreshToken: 'required-with-offline-access',
        clientCredentials: 'not-applicable-for-general-user-oauth',
        deviceCode: 'provider-supported-optional',
        loopbackRedirect: 'required',
        customSchemeRedirect: 'required'
      }, [
        'POSTMETER_GOOGLE_OAUTH_CLIENT_ID',
        'POSTMETER_GOOGLE_OAUTH_CLIENT_SECRET',
        'POSTMETER_GOOGLE_OAUTH_AUTHORIZATION_URL',
        'POSTMETER_GOOGLE_OAUTH_TOKEN_URL',
        'POSTMETER_GOOGLE_OAUTH_SCOPES'
      ]),
      provider('microsoft-entra', 'Microsoft Entra ID / Azure AD', {
        authorizationCodePkce: 'required',
        refreshToken: 'required',
        clientCredentials: 'required-for-app-only-apis',
        deviceCode: 'required',
        loopbackRedirect: 'required',
        customSchemeRedirect: 'required'
      }, [
        'POSTMETER_ENTRA_OAUTH_CLIENT_ID',
        'POSTMETER_ENTRA_OAUTH_CLIENT_SECRET',
        'POSTMETER_ENTRA_OAUTH_TENANT_ID',
        'POSTMETER_ENTRA_OAUTH_AUTHORIZATION_URL',
        'POSTMETER_ENTRA_OAUTH_TOKEN_URL',
        'POSTMETER_ENTRA_OAUTH_DEVICE_AUTHORIZATION_URL',
        'POSTMETER_ENTRA_OAUTH_SCOPES'
      ]),
      provider('github', 'GitHub OAuth Apps', {
        authorizationCodePkce: 'required',
        refreshToken: 'provider-dependent',
        clientCredentials: 'not-applicable',
        deviceCode: 'required-for-certification',
        loopbackRedirect: 'required',
        customSchemeRedirect: 'required'
      }, [
        'POSTMETER_GITHUB_OAUTH_CLIENT_ID',
        'POSTMETER_GITHUB_OAUTH_CLIENT_SECRET',
        'POSTMETER_GITHUB_OAUTH_AUTHORIZATION_URL',
        'POSTMETER_GITHUB_OAUTH_TOKEN_URL',
        'POSTMETER_GITHUB_OAUTH_DEVICE_AUTHORIZATION_URL',
        'POSTMETER_GITHUB_OAUTH_SCOPES'
      ], { refreshTokenEvidence: 'refresh-token-where-enabled' })
    ],
    mockedScenarios: REQUIRED_SCENARIOS.map((id) => ({
      id,
      required: true
    })),
    liveRun: {
      enabledBy: 'POSTMETER_LIVE_OAUTH_CERTIFICATION=1',
      skippedByDefault: true,
      optionalEvidenceFileEnv: 'POSTMETER_LIVE_OAUTH_EVIDENCE_FILE',
      evidenceArtifactRequired: false,
      artifactDirectory: LIVE_EVIDENCE_ARTIFACT_DIRECTORY,
      requiredRedirectUris: ['postmeter://oauth/callback', 'http://127.0.0.1:{dynamic-port}/oauth/callback'],
      acceptedGrantTypes: [...LIVE_EVIDENCE_GRANT_TYPES],
      acceptedArtifactTypes: [...LIVE_EVIDENCE_ARTIFACT_TYPES],
      artifactChecksumRequiredWhenEvidenceProvided: true,
      providerEndpointValidation: {
        google: {
          authorizationHost: 'accounts.google.com',
          tokenHosts: ['*.googleapis.com', 'accounts.google.com']
        },
        'microsoft-entra': {
          authorityHosts: [...ENTRA_AUTHORITY_HOSTS],
          tenantPathRequired: true
        },
        github: {
          host: 'github.com',
          authorizationPath: '/login/oauth/authorize',
          tokenPath: '/login/oauth/access_token',
          deviceAuthorizationPath: '/login/device/code'
        }
      },
      redactionRequired: true
    }
  };
}

function provider(id, name, capabilities, envVars, options = {}) {
  const refreshTokenEvidence = options.refreshTokenEvidence || 'refresh-token';
  return {
    id,
    name,
    capabilities,
    envVars,
    evidenceRequired: [
      'provider-date-and-app-type',
      'redirect-uri-registration',
      'authorization-code-pkce',
      refreshTokenEvidence,
      'device-code-where-supported',
      'client-credentials-where-supported',
      'custom-scheme-callback',
      'loopback-callback',
      'cancellation-or-abandoned-browser',
      'token-storage-and-redaction'
    ]
  };
}

function validateOAuthProviderCertificationMatrix(matrix = buildOAuthProviderCertificationMatrix()) {
  const errors = [];
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return ['OAuth provider certification matrix must be an object.'];
  }
  if (matrix.schemaVersion !== 1) {
    errors.push('OAuth provider certification matrix schemaVersion must be 1.');
  }
  if (matrix.generatedFrom !== 'src/core/diagnostics-release/oauthProviderCertification.js') {
    errors.push('OAuth provider certification matrix generatedFrom must be src/core/diagnostics-release/oauthProviderCertification.js.');
  }
  if (matrix.deterministic !== true) {
    errors.push('OAuth provider certification matrix deterministic must be true.');
  }
  const providerIds = new Set((matrix.providers || []).map((item) => item.id));
  for (const id of REQUIRED_PROVIDER_IDS) {
    if (!providerIds.has(id)) {
      errors.push(`OAuth provider certification matrix missing provider ${id}.`);
    }
  }
  const scenarioIds = new Set((matrix.mockedScenarios || []).map((item) => item.id));
  for (const id of REQUIRED_SCENARIOS) {
    if (!scenarioIds.has(id)) {
      errors.push(`OAuth provider certification matrix missing mocked scenario ${id}.`);
    }
  }
  for (const providerEntry of matrix.providers || []) {
    if (!providerEntry.id || !providerEntry.name) {
      errors.push('OAuth provider certification providers must include id and name.');
    }
    if (!providerEntry.capabilities || typeof providerEntry.capabilities !== 'object') {
      errors.push(`OAuth provider ${providerEntry.id || '<unknown>'} must declare capabilities.`);
    }
    for (const envVar of providerEntry.envVars || []) {
      if (!/^POSTMETER_[A-Z0-9_]+$/.test(envVar)) {
        errors.push(`OAuth provider ${providerEntry.id} has invalid env var name ${envVar}.`);
      }
    }
  }
  if (SECRET_PATTERN.test(JSON.stringify(matrix))) {
    errors.push('OAuth provider certification matrix must not contain live tokens or client secrets.');
  }
  return errors;
}

async function runMockOAuthCertification() {
  const server = await createMockOAuthServer();
  const scenarios = [];
  try {
    await scenario(scenarios, 'authorization-code-pkce-success', async () => {
      const session = createOAuthPkceSession(pkceAuth(server.baseUrl), null, {
        redirectUri: 'http://127.0.0.1:49152/oauth/callback',
        state: 'cert-state',
        codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
      });
      const auth = await exchangeOAuthAuthorizationCode(
        { type: 'oauth2', grantType: 'authorizationCode' },
        session,
        'http://127.0.0.1:49152/oauth/callback?code=auth-code&state=cert-state',
        null
      );
      assertEqual(Boolean(auth.accessToken), true, 'PKCE exchange did not produce an access token.');
      assertEqual(Boolean(auth.refreshToken), true, 'PKCE exchange did not produce a refresh token.');
    });
    await scenario(scenarios, 'authorization-code-provider-denial', async () => {
      await expectReject(
        () => exchangeOAuthAuthorizationCode(
          { type: 'oauth2', grantType: 'authorizationCode' },
          pkceSession(server.baseUrl),
          'http://127.0.0.1:49152/oauth/callback?error=access_denied&error_description=denied%20access_token=leaked-secret&state=cert-state',
          null
        ),
        /access_token=\[redacted\]/
      );
    });
    await scenario(scenarios, 'authorization-code-timeout-or-abandonment', async () => {
      await expectReject(
        () => exchangeOAuthAuthorizationCode(
          { type: 'oauth2', grantType: 'authorizationCode' },
          pkceSession(server.baseUrl),
          'not a callback',
          null
        ),
        /callback URL is not valid/
      );
    });
    await scenario(scenarios, 'authorization-code-bad-state', async () => {
      await expectReject(
        () => exchangeOAuthAuthorizationCode(
          { type: 'oauth2', grantType: 'authorizationCode' },
          pkceSession(server.baseUrl),
          'http://127.0.0.1:49152/oauth/callback?code=auth-code&state=wrong-state',
          null
        ),
        /state did not match/
      );
    });
    await scenario(scenarios, 'authorization-code-bad-code-verifier', async () => {
      await expectReject(
        () => exchangeOAuthAuthorizationCode(
          { type: 'oauth2', grantType: 'authorizationCode' },
          pkceSession(server.baseUrl),
          'http://127.0.0.1:49152/oauth/callback?code=bad-verifier&state=cert-state',
          null
        ),
        /code_verifier=\[redacted\]/
      );
    });
    await scenario(scenarios, 'refresh-token-success', async () => {
      const auth = await refreshOAuthToken({
        type: 'oauth2',
        refreshToken: 'refresh-ok',
        tokenUrl: `${server.baseUrl}/token`,
        clientId: 'mock-client',
        clientSecret: 'mock-client-secret'
      }, null);
      assertEqual(Boolean(auth.accessToken), true, 'Refresh did not produce an access token.');
    });
    await scenario(scenarios, 'refresh-token-revoked', async () => {
      await expectReject(
        () => refreshOAuthToken({
          type: 'oauth2',
          refreshToken: 'revoked',
          tokenUrl: `${server.baseUrl}/token`,
          clientId: 'mock-client',
          clientSecret: 'mock-client-secret'
        }, null),
        /refresh_token=\[redacted\]/
      );
    });
    await scenario(scenarios, 'client-credentials-success', async () => {
      const auth = await requestOAuthClientCredentialsToken({
        type: 'oauth2',
        grantType: 'clientCredentials',
        tokenUrl: `${server.baseUrl}/token`,
        clientId: 'mock-client',
        clientSecret: 'mock-client-secret',
        scopes: 'read'
      }, null);
      assertEqual(Boolean(auth.accessToken), true, 'Client credentials did not produce an access token.');
    });
    await scenario(scenarios, 'device-code-success', async () => {
      const pending = await requestOAuthDeviceAuthorization(deviceAuth(server.baseUrl), null);
      const completed = await pollOAuthDeviceToken(pending, null);
      assertEqual(Boolean(completed.accessToken), true, 'Device code did not produce an access token.');
      assertEqual(completed.deviceCode, '', 'Device code was not cleared after completion.');
    });
    await scenario(scenarios, 'device-code-denial', async () => {
      const pending = await requestOAuthDeviceAuthorization(deviceAuth(server.baseUrl, 'deny-device'), null);
      await expectReject(() => pollOAuthDeviceToken(pending, null), /device authorization was denied/);
    });
    await scenario(scenarios, 'device-code-expired', async () => {
      const pending = await requestOAuthDeviceAuthorization(deviceAuth(server.baseUrl, 'expire-device'), null);
      await expectReject(() => pollOAuthDeviceToken(pending, null), /device authorization expired/);
    });
    await scenario(scenarios, 'device-code-cancellation', async () => {
      const abortController = new AbortController();
      const pending = await requestOAuthDeviceAuthorization(deviceAuth(server.baseUrl, 'pending-device'), null);
      const polling = pollOAuthDeviceToken(pending, null, { signal: abortController.signal });
      setTimeout(() => abortController.abort(), 5);
      await expectReject(() => polling, /cancelled|aborted/i);
    });
    await scenario(scenarios, 'malformed-token-response', async () => {
      await expectReject(
        () => requestOAuthClientCredentialsToken(clientAuth(server.baseUrl, '/malformed-token'), null),
        /invalid JSON/
      );
    });
    await scenario(scenarios, 'missing-access-token', async () => {
      await expectReject(
        () => requestOAuthClientCredentialsToken(clientAuth(server.baseUrl, '/missing-token'), null),
        /did not include an access token/
      );
    });
    await scenario(scenarios, 'token-endpoint-redirect-denial', async () => {
      await expectReject(
        () => requestOAuthClientCredentialsToken(clientAuth(server.baseUrl, '/redirect-token'), null),
        /refused an HTTP redirect/
      );
      assertEqual(server.leakedBodies.length, 0, 'Redirect target received a token request body.');
    });
    await scenario(scenarios, 'token-storage-redaction-policy', async () => {
      const message = redactOAuthErrorMessage('provider failed access_token=raw-access-token client_secret=raw-client-secret refresh_token=raw-refresh-token Authorization: Basic leaked-secret');
      assertEqual(SECRET_PATTERN.test(message), false, 'OAuth redaction left a secret-shaped value in the message.');
      assertEqual(/Authorization:\s*Basic\s+leaked-secret/i.test(message), false, 'OAuth redaction left an Authorization header value in the message.');
    });
  } finally {
    await server.close();
  }
  const report = {
    ok: scenarios.every((item) => item.status === 'passed'),
    generatedFrom: 'src/core/diagnostics-release/oauthProviderCertification.js',
    providerNetworkUsed: false,
    scenarios
  };
  const serialized = JSON.stringify(report);
  if (SECRET_PATTERN.test(serialized)) {
    throw new Error('Mock OAuth certification report contains a secret-shaped value.');
  }
  return report;
}

function liveOAuthCertificationStatus(options = {}) {
  const env = options.env || process.env;
  const requestedProvider = String(options.provider || 'all');
  const enabled = env.POSTMETER_LIVE_OAUTH_CERTIFICATION === '1';
  const providers = buildOAuthProviderCertificationMatrix().providers
    .filter((item) => requestedProvider === 'all' || item.id === requestedProvider);
  if (!providers.length) {
    return {
      ok: false,
      skipped: false,
      errors: [`Unknown OAuth provider "${requestedProvider}". Expected all, ${REQUIRED_PROVIDER_IDS.join(', ')}.`],
      providers: []
    };
  }
  if (!enabled) {
    return {
      ok: true,
      skipped: true,
      reason: 'Set POSTMETER_LIVE_OAUTH_CERTIFICATION=1 and maintainer-owned provider env vars to run live certification.',
      providers: providers.map((item) => ({ id: item.id, name: item.name, configured: false }))
    };
  }
  const providerStatuses = providers.map((item) => {
    const missing = item.envVars.filter((name) => !String(env[name] || '').trim());
    return {
      id: item.id,
      name: item.name,
      configured: missing.length === 0,
      missingEnv: missing,
      requiredEvidence: item.evidenceRequired,
      requiredGrantTypes: requiredLiveGrantTypes(item),
      capabilities: item.capabilities,
      env: item.envVars.reduce((values, name) => {
        values[name] = String(env[name] || '').trim();
        return values;
      }, {})
    };
  });
  const errors = providerStatuses
    .filter((item) => !item.configured)
    .map((item) => `${item.id} is missing required env vars: ${item.missingEnv.join(', ')}`);
  errors.push(...validateLiveProviderEnv(providerStatuses));
  if (options.evidence) {
    errors.push(...validateLiveOAuthEvidence(options.evidence, providerStatuses, {
      artifactRoot: options.artifactRoot,
      maxArtifactBytes: options.maxArtifactBytes
    }));
  }
  return {
    ok: errors.length === 0,
    skipped: false,
    errors,
    providers: providerStatuses.map(safeLiveProviderStatus),
    evidence: options.evidence ? 'validated-optional-artifact' : 'not-provided',
    evidenceArtifactRequired: false,
    artifactDirectory: LIVE_EVIDENCE_ARTIFACT_DIRECTORY,
    redaction: 'Never print token, refresh token, authorization code, code verifier, device code, client secret, auth header, cookie, or workspace JSON values.'
  };
}

function safeLiveProviderStatus(providerStatus) {
  return {
    id: providerStatus.id,
    name: providerStatus.name,
    configured: providerStatus.configured,
    missingEnv: providerStatus.missingEnv,
    requiredEvidence: providerStatus.requiredEvidence,
    requiredGrantTypes: providerStatus.requiredGrantTypes,
    capabilities: providerStatus.capabilities,
    configuredEnv: Object.keys(providerStatus.env || {}).filter((name) => String(providerStatus.env[name] || '').trim())
  };
}

function validateLiveOAuthEvidence(evidence, providerStatuses, options = {}) {
  if (!evidence) {
    return ['Optional live OAuth evidence validation requires a sanitized evidence JSON artifact. Set POSTMETER_LIVE_OAUTH_EVIDENCE_FILE or pass --evidence after manually executing the provider flows.'];
  }
  const errors = [];
  if (typeof evidence !== 'object' || Array.isArray(evidence)) {
    return ['Live OAuth certification evidence must be a JSON object.'];
  }
  if (evidence.schemaVersion !== 1) {
    errors.push('Live OAuth certification evidence schemaVersion must be 1.');
  }
  if (containsLiveSecretLeak(evidence)) {
    errors.push('Live OAuth certification evidence appears to contain an unredacted OAuth secret, code, token, or Authorization value.');
  }
  const runs = Array.isArray(evidence.providerRuns) ? evidence.providerRuns : [];
  if (!runs.length) {
    errors.push('Live OAuth certification evidence must include providerRuns.');
  }
  const duplicateRunIds = duplicateValues(runs.map((run) => run?.providerId).filter(Boolean));
  for (const id of duplicateRunIds) {
    errors.push(`Live OAuth certification evidence has duplicate provider run ${id}.`);
  }
  const providerIds = new Set(providerStatuses.map((item) => item.id));
  for (const run of runs) {
    const providerId = String(run?.providerId || '');
    if (!providerId) {
      errors.push('Live OAuth certification evidence providerRuns must include providerId.');
    } else if (!providerIds.has(providerId)) {
      errors.push(`Live OAuth certification evidence has unknown provider run ${providerId}.`);
    }
  }
  const runsByProvider = new Map(runs.map((run) => [run?.providerId, run]));
  for (const providerStatus of providerStatuses) {
    if (!providerStatus.configured) {
      continue;
    }
    const run = runsByProvider.get(providerStatus.id);
    if (!run) {
      errors.push(`Live OAuth certification evidence is missing provider run ${providerStatus.id}.`);
      continue;
    }
    if (run.result !== 'passed') {
      errors.push(`Live OAuth certification evidence for ${providerStatus.id} must have result "passed".`);
    }
    if (!Number.isFinite(Date.parse(run.testedAt))) {
      errors.push(`Live OAuth certification evidence for ${providerStatus.id} must include a valid testedAt timestamp.`);
    }
    if (!String(run.appType || '').trim()) {
      errors.push(`Live OAuth certification evidence for ${providerStatus.id} must include appType.`);
    }
    if (!Array.isArray(run.redirectUris) || !run.redirectUris.length) {
      errors.push(`Live OAuth certification evidence for ${providerStatus.id} must include redirectUris.`);
    } else {
      if (!run.redirectUris.includes('postmeter://oauth/callback')) {
        errors.push(`Live OAuth certification evidence for ${providerStatus.id} must include the postmeter://oauth/callback redirect URI.`);
      }
      if (!run.redirectUris.some(isPostMeterLoopbackRedirectEvidence)) {
        errors.push(`Live OAuth certification evidence for ${providerStatus.id} must include a loopback http://127.0.0.1:{dynamic-port}/oauth/callback redirect URI or actual dynamic-port loopback URI.`);
      }
    }
    if (!Array.isArray(run.grantTypes) || !run.grantTypes.length) {
      errors.push(`Live OAuth certification evidence for ${providerStatus.id} must include grantTypes.`);
    } else {
      const grantTypes = new Set(run.grantTypes);
      for (const grantType of grantTypes) {
        if (!LIVE_EVIDENCE_GRANT_TYPES.has(grantType)) {
          errors.push(`Live OAuth certification evidence for ${providerStatus.id} has unsupported grant type ${grantType}.`);
        }
      }
      for (const grantType of providerStatus.requiredGrantTypes || []) {
        if (!grantTypes.has(grantType)) {
          errors.push(`Live OAuth certification evidence for ${providerStatus.id} must include grant type ${grantType}.`);
        }
      }
    }
    if (run.redactionConfirmed !== true) {
      errors.push(`Live OAuth certification evidence for ${providerStatus.id} must confirm redaction.`);
    }
    if (run.providerConsoleReviewed !== true) {
      errors.push(`Live OAuth certification evidence for ${providerStatus.id} must confirm provider console settings were reviewed.`);
    }
    const artifacts = Array.isArray(run.executionArtifacts) ? run.executionArtifacts : [];
    if (!artifacts.length) {
      errors.push(`Live OAuth certification evidence for ${providerStatus.id} must include executionArtifacts.`);
    }
    for (const artifact of artifacts) {
      const type = String(artifact?.type || '');
      const artifactPath = String(artifact?.path || '');
      if (!LIVE_EVIDENCE_ARTIFACT_TYPES.has(type)) {
        errors.push(`Live OAuth certification evidence for ${providerStatus.id} has unsupported execution artifact type ${type || '<empty>'}.`);
      }
      if (!isSafeEvidenceArtifactPath(artifactPath)) {
        errors.push(`Live OAuth certification evidence for ${providerStatus.id} must use repository-relative execution artifact paths without traversal.`);
      }
      if (!isEvidenceArtifactDirectoryPath(artifactPath)) {
        errors.push(`Live OAuth certification evidence for ${providerStatus.id} execution artifact ${artifactPath || '<empty>'} must live under ${LIVE_EVIDENCE_ARTIFACT_DIRECTORY}/.`);
      }
      if (!/^[a-f0-9]{64}$/i.test(String(artifact?.sha256 || ''))) {
        errors.push(`Live OAuth certification evidence for ${providerStatus.id} execution artifacts must include sha256 checksums.`);
      } else {
        errors.push(...validateLiveEvidenceArtifactFile(providerStatus.id, artifactPath, String(artifact.sha256), {
          ...options,
          artifactType: type
        }));
      }
      if (artifact?.redacted !== true) {
        errors.push(`Live OAuth certification evidence for ${providerStatus.id} execution artifacts must confirm redaction.`);
      }
    }
    const evidenceItems = new Set(Array.isArray(run.evidence) ? run.evidence : []);
    for (const required of providerStatus.requiredEvidence || []) {
      if (!evidenceItems.has(required)) {
        errors.push(`Live OAuth certification evidence for ${providerStatus.id} is missing required evidence item ${required}.`);
      }
    }
  }
  return errors;
}

function validateLiveEvidenceArtifactFile(providerId, artifactPath, expectedSha256, options = {}) {
  const artifactRoot = String(options.artifactRoot || '').trim();
  if (!artifactRoot) {
    return [];
  }
  const errors = [];
  const maxArtifactBytes = Number.isFinite(Number(options.maxArtifactBytes))
    ? Number(options.maxArtifactBytes)
    : 10 * 1024 * 1024;
  const resolvedRoot = path.resolve(artifactRoot);
  const resolvedArtifact = path.resolve(resolvedRoot, artifactPath);
  const relative = path.relative(resolvedRoot, resolvedArtifact);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return [`Live OAuth certification evidence for ${providerId} execution artifact ${artifactPath} must stay inside the evidence artifact root.`];
  }
  let stat;
  try {
    stat = fs.statSync(resolvedArtifact);
  } catch {
    return [`Live OAuth certification evidence for ${providerId} execution artifact ${artifactPath} does not exist.`];
  }
  if (!stat.isFile()) {
    errors.push(`Live OAuth certification evidence for ${providerId} execution artifact ${artifactPath} must be a regular file.`);
  }
  if (stat.size > maxArtifactBytes) {
    errors.push(`Live OAuth certification evidence for ${providerId} execution artifact ${artifactPath} exceeds the ${maxArtifactBytes} byte validation cap.`);
  }
  if (errors.length) {
    return errors;
  }
  const artifactBuffer = fs.readFileSync(resolvedArtifact);
  const digest = crypto.createHash('sha256').update(artifactBuffer).digest('hex');
  if (digest.toLowerCase() !== expectedSha256.toLowerCase()) {
    errors.push(`Live OAuth certification evidence for ${providerId} execution artifact ${artifactPath} sha256 checksum does not match.`);
  }
  if (LIVE_TEXT_ARTIFACT_TYPES.has(String(options.artifactType || ''))) {
    const artifactText = artifactBuffer.toString('utf8');
    if (containsLiveSecretLeak(artifactText)) {
      errors.push(`Live OAuth certification evidence for ${providerId} execution artifact ${artifactPath} appears to contain an unredacted OAuth secret, code, token, cookie, or Authorization value.`);
    }
  }
  return errors;
}

function isSafeEvidenceArtifactPath(artifactPath) {
  const text = String(artifactPath || '');
  if (!text || text.startsWith('/') || /^[A-Za-z]:[\\/]/.test(text) || text.includes('\0') || text.includes('\\')) {
    return false;
  }
  return !text.split(/[\\/]+/).includes('..');
}

function isEvidenceArtifactDirectoryPath(artifactPath) {
  const normalized = String(artifactPath || '').replace(/\\/g, '/');
  return normalized === LIVE_EVIDENCE_ARTIFACT_DIRECTORY
    || normalized.startsWith(`${LIVE_EVIDENCE_ARTIFACT_DIRECTORY}/`);
}

function containsLiveSecretLeak(value) {
  const visited = new Set();
  return containsLiveSecretLeakAt(value, '', visited);
}

function containsLiveSecretLeakAt(value, key, visited) {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value);
    if (isLiveSecretFieldKey(key) && !isAllowedRedactedLiveSecretValue(text)) {
      return true;
    }
    return liveSecretTextPatternMatches(text);
  }
  if (typeof value !== 'object') {
    return false;
  }
  if (visited.has(value)) {
    return false;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsLiveSecretLeakAt(item, key, visited));
  }
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (isLiveSecretFieldKey(entryKey) && !isAllowedRedactedLiveSecretStructuredValue(entryValue)) {
      return true;
    }
    if (containsLiveSecretLeakAt(entryValue, entryKey, visited)) {
      return true;
    }
  }
  return false;
}

function liveSecretTextPatternMatches(text) {
  const normalizedText = String(text || '').replace(
    /\bAuthorization\s*[:=]\s*(?:(?:Bearer|Basic|OAuth)\s+)?(?:\[redacted\]|redacted)(?=\s|[;,.)\]]|$)/gi,
    'Authorization: [redacted]'
  );
  return LIVE_SECRET_FIELD_PATTERN.test(normalizedText)
    || LIVE_AUTHORIZATION_HEADER_PATTERN.test(normalizedText)
    || LIVE_BEARER_SECRET_PATTERN.test(normalizedText)
    || LIVE_JWT_SECRET_PATTERN.test(normalizedText);
}

function isLiveSecretFieldKey(key) {
  const normalized = String(key || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return LIVE_SECRET_FIELD_KEYS.has(normalized);
}

function isAllowedRedactedLiveSecretStructuredValue(value) {
  if (value == null) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isAllowedRedactedLiveSecretStructuredValue);
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return isAllowedRedactedLiveSecretValue(String(value));
}

function isAllowedRedactedLiveSecretValue(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text || text === '[redacted]' || text === 'redacted' || text === 'not-applicable' || text === 'none';
}

function validateLiveProviderEnv(providerStatuses) {
  const errors = [];
  for (const providerStatus of providerStatuses) {
    if (!providerStatus.configured) {
      continue;
    }
    const tenantId = String(providerStatus.env?.POSTMETER_ENTRA_OAUTH_TENANT_ID || '').trim();
    if (providerStatus.id === 'microsoft-entra' && !/^[A-Za-z0-9.-]+$/.test(tenantId)) {
      errors.push(`${providerStatus.id} tenant id must be a tenant name, GUID, common, organizations, or consumers value without path separators.`);
    }
    for (const [name, value] of Object.entries(providerStatus.env || {})) {
      if (!name.endsWith('_URL')) {
        continue;
      }
      let parsed;
      try {
        parsed = new URL(value);
        if (parsed.protocol !== 'https:') {
          errors.push(`${providerStatus.id} env var ${name} must use https.`);
        }
        if (parsed.username || parsed.password) {
          errors.push(`${providerStatus.id} env var ${name} must not include URL credentials.`);
        }
      } catch {
        errors.push(`${providerStatus.id} env var ${name} must be a valid URL.`);
        continue;
      }
      const providerUrlError = validateProviderEndpointUrl(providerStatus, name, parsed);
      if (providerUrlError) {
        errors.push(providerUrlError);
      }
    }
  }
  return errors;
}

function validateProviderEndpointUrl(providerStatus, name, parsed) {
  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  if (providerStatus.id === 'google') {
    if (name.endsWith('_AUTHORIZATION_URL')) {
      if (host !== 'accounts.google.com' || !pathname.startsWith('/o/oauth2')) {
        return `${providerStatus.id} env var ${name} must point to the Google OAuth authorization endpoint on accounts.google.com.`;
      }
      return '';
    }
    if (name.endsWith('_TOKEN_URL')) {
      const googleApiHost = host === 'googleapis.com' || host.endsWith('.googleapis.com');
      const googleAccountsTokenHost = host === 'accounts.google.com';
      if ((!googleApiHost && !googleAccountsTokenHost) || !/token$/i.test(pathname)) {
        return `${providerStatus.id} env var ${name} must point to a Google OAuth token endpoint on googleapis.com or accounts.google.com.`;
      }
    }
    return '';
  }
  if (providerStatus.id === 'microsoft-entra') {
    if (!ENTRA_AUTHORITY_HOSTS.has(host)) {
      return `${providerStatus.id} env var ${name} must point to a Microsoft Entra authority host.`;
    }
    const tenantId = String(providerStatus.env?.POSTMETER_ENTRA_OAUTH_TENANT_ID || '').trim();
    if (tenantId && !pathname.toLowerCase().startsWith(`/${tenantId.toLowerCase()}/oauth2/`)) {
      return `${providerStatus.id} env var ${name} must include the configured tenant id in the OAuth authority path.`;
    }
    if (name.endsWith('_DEVICE_AUTHORIZATION_URL')) {
      if (!/\/oauth2\/(?:v2\.0\/)?devicecode$/i.test(pathname)) {
        return `${providerStatus.id} env var ${name} must point to a Microsoft Entra device-code endpoint.`;
      }
      return '';
    }
    if (name.endsWith('_AUTHORIZATION_URL') && !/\/oauth2\/(?:v2\.0\/)?authorize$/i.test(pathname)) {
      return `${providerStatus.id} env var ${name} must point to a Microsoft Entra authorization endpoint.`;
    }
    if (name.endsWith('_TOKEN_URL') && !/\/oauth2\/(?:v2\.0\/)?token$/i.test(pathname)) {
      return `${providerStatus.id} env var ${name} must point to a Microsoft Entra token endpoint.`;
    }
    return '';
  }
  if (providerStatus.id === 'github') {
    if (host !== 'github.com') {
      return `${providerStatus.id} env var ${name} must point to github.com OAuth endpoints.`;
    }
    if (name.endsWith('_DEVICE_AUTHORIZATION_URL')) {
      if (pathname !== '/login/device/code') {
        return `${providerStatus.id} env var ${name} must point to GitHub's OAuth device-code endpoint.`;
      }
      return '';
    }
    if (name.endsWith('_AUTHORIZATION_URL') && pathname !== '/login/oauth/authorize') {
      return `${providerStatus.id} env var ${name} must point to GitHub's OAuth authorization endpoint.`;
    }
    if (name.endsWith('_TOKEN_URL') && pathname !== '/login/oauth/access_token') {
      return `${providerStatus.id} env var ${name} must point to GitHub's OAuth token endpoint.`;
    }
  }
  return '';
}

function requiredLiveGrantTypes(provider) {
  const required = ['authorization-code-pkce'];
  if (provider.id === 'google' || provider.id === 'microsoft-entra') {
    required.push('refresh-token');
  }
  if (provider.id === 'microsoft-entra') {
    required.push('client-credentials', 'device-code');
  }
  if (provider.id === 'github') {
    required.push('device-code');
  }
  return required;
}

function isPostMeterLoopbackRedirectEvidence(value) {
  const text = String(value || '');
  if (text === 'http://127.0.0.1:{dynamic-port}/oauth/callback') {
    return true;
  }
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'http:'
      && parsed.hostname === '127.0.0.1'
      && parsed.pathname === '/oauth/callback'
      && Number(parsed.port) > 0;
  } catch {
    return false;
  }
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

async function createMockOAuthServer() {
  const leakedBodies = [];
  const deviceAttempts = new Map();
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/authorize') {
        const redirectUri = url.searchParams.get('redirect_uri');
        const state = url.searchParams.get('state');
        response.statusCode = 302;
        response.setHeader('Location', `${redirectUri}?code=auth-code&state=${state}`);
        response.end();
        return;
      }
      if (url.pathname === '/device') {
        const deviceMode = url.searchParams.get('mode') || 'success';
        json(response, {
          device_code: deviceMode,
          user_code: 'POST-METER',
          verification_uri: 'https://auth.example.test/device',
          verification_uri_complete: 'https://auth.example.test/device?user_code=POST-METER',
          expires_in: 30,
          interval: 0.001
        });
        return;
      }
      if (url.pathname === '/redirect-token') {
        response.statusCode = 307;
        response.setHeader('Location', '/leak');
        response.end();
        return;
      }
      if (url.pathname === '/leak') {
        leakedBodies.push(await readBody(request));
        json(response, { access_token: 'leaked-access-token' });
        return;
      }
      if (url.pathname === '/malformed-token') {
        response.setHeader('Content-Type', 'application/json');
        response.end('{not-json');
        return;
      }
      if (url.pathname === '/missing-token') {
        json(response, { token_type: 'Bearer' });
        return;
      }
      if (url.pathname === '/token') {
        const body = new URLSearchParams(await readBody(request));
        const grantType = body.get('grant_type');
        if (grantType === 'authorization_code') {
          if (body.get('code') === 'bad-verifier') {
            response.statusCode = 400;
            json(response, {
              error: 'invalid_grant',
              error_description: 'invalid code_verifier=super-secret'
            });
            return;
          }
          json(response, {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            token_type: 'Bearer',
            expires_in: 600
          });
          return;
        }
        if (grantType === 'refresh_token') {
          if (body.get('refresh_token') === 'revoked') {
            response.statusCode = 400;
            json(response, {
              error: 'invalid_grant',
              error_description: 'revoked refresh_token=refresh-leak'
            });
            return;
          }
          json(response, {
            access_token: 'mock-refreshed-token',
            refresh_token: 'mock-rotated-token',
            token_type: 'Bearer',
            expires_in: 600
          });
          return;
        }
        if (grantType === 'client_credentials') {
          json(response, {
            access_token: 'mock-client-token',
            token_type: 'Bearer',
            expires_in: 600
          });
          return;
        }
        if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
          const deviceCode = body.get('device_code');
          if (deviceCode === 'deny-device') {
            response.statusCode = 400;
            json(response, { error: 'access_denied' });
            return;
          }
          if (deviceCode === 'expire-device') {
            response.statusCode = 400;
            json(response, { error: 'expired_token' });
            return;
          }
          if (deviceCode === 'pending-device') {
            response.statusCode = 400;
            json(response, { error: 'authorization_pending' });
            return;
          }
          const attempts = (deviceAttempts.get(deviceCode) || 0) + 1;
          deviceAttempts.set(deviceCode, attempts);
          if (attempts === 1) {
            response.statusCode = 400;
            json(response, { error: 'authorization_pending' });
            return;
          }
          json(response, {
            access_token: 'mock-device-token',
            refresh_token: 'mock-device-refresh',
            token_type: 'Bearer',
            expires_in: 600
          });
          return;
        }
      }
      response.statusCode = 404;
      response.end('not found');
    } catch (error) {
      response.statusCode = 500;
      response.end(error.stack || String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    leakedBodies,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function scenario(results, id, fn) {
  try {
    await fn();
    results.push({ id, status: 'passed' });
  } catch (error) {
    results.push({
      id,
      status: 'failed',
      error: redactOAuthErrorMessage(error.message || String(error))
    });
  }
}

async function expectReject(fn, pattern) {
  try {
    await fn();
  } catch (error) {
    const message = error.message || String(error);
    if (!pattern.test(message)) {
      throw new Error(`Expected rejection to match ${pattern}, got: ${message}`);
    }
    if (SECRET_PATTERN.test(message)) {
      throw new Error(`OAuth error was not redacted: ${message}`);
    }
    return;
  }
  throw new Error('Expected OAuth operation to reject.');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message);
  }
}

function pkceAuth(baseUrl) {
  return {
    type: 'oauth2',
    grantType: 'authorizationCode',
    authorizationUrl: `${baseUrl}/authorize`,
    tokenUrl: `${baseUrl}/token`,
    clientId: 'mock-client',
    clientSecret: 'mock-client-secret',
    scopes: 'openid profile'
  };
}

function pkceSession(baseUrl) {
  return {
    tokenUrl: `${baseUrl}/token`,
    redirectUri: 'http://127.0.0.1:49152/oauth/callback',
    clientId: 'mock-client',
    clientSecret: 'mock-client-secret',
    state: 'cert-state',
    codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
  };
}

function clientAuth(baseUrl, path = '/token') {
  return {
    type: 'oauth2',
    grantType: 'clientCredentials',
    tokenUrl: `${baseUrl}${path}`,
    clientId: 'mock-client',
    clientSecret: 'mock-client-secret',
    scopes: 'read'
  };
}

function deviceAuth(baseUrl, mode = 'success-device') {
  return {
    type: 'oauth2',
    grantType: 'deviceCode',
    deviceAuthorizationUrl: `${baseUrl}/device?mode=${mode}`,
    tokenUrl: `${baseUrl}/token`,
    clientId: 'mock-client'
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function json(response, payload) {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

module.exports = {
  REQUIRED_PROVIDER_IDS,
  REQUIRED_SCENARIOS,
  buildOAuthProviderCertificationMatrix,
  liveOAuthCertificationStatus,
  validateLiveProviderEnv,
  validateLiveOAuthEvidence,
  runMockOAuthCertification,
  validateOAuthProviderCertificationMatrix
};
