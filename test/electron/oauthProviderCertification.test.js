const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  REQUIRED_PROVIDER_IDS,
  REQUIRED_SCENARIOS,
  buildOAuthProviderCertificationMatrix,
  liveOAuthCertificationStatus,
  runMockOAuthCertification,
  validateLiveOAuthEvidence,
  validateOAuthProviderCertificationMatrix
} = require('../../src/core/diagnostics-release/oauthProviderCertification');
const {
  liveCertificationStatusFromInputs,
  resolveEvidencePath
} = require('../../scripts/oauthProviderCertification');

const REQUIRED_EVIDENCE_BASE = [
  'provider-date-and-app-type',
  'redirect-uri-registration',
  'authorization-code-pkce',
  'device-code-where-supported',
  'client-credentials-where-supported',
  'custom-scheme-callback',
  'loopback-callback',
  'cancellation-or-abandoned-browser',
  'token-storage-and-redaction'
];

test('OAuth provider certification matrix covers required providers and scenarios', () => {
  const matrix = buildOAuthProviderCertificationMatrix();
  assert.deepEqual(validateOAuthProviderCertificationMatrix(matrix), []);
  assert.deepEqual(matrix.providers.map((provider) => provider.id), REQUIRED_PROVIDER_IDS);
  for (const scenario of REQUIRED_SCENARIOS) {
    assert.ok(matrix.mockedScenarios.some((entry) => entry.id === scenario), `Missing scenario ${scenario}`);
  }
});

test('mock OAuth provider certification exercises the local provider corpus without leaking secrets', async () => {
  const result = await runMockOAuthCertification();
  assert.equal(result.ok, true);
  assert.equal(result.scenarios.length, REQUIRED_SCENARIOS.length);
  assert.equal(result.providerNetworkUsed, false);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /mock-access-token|mock-refresh-token|mock-client-token|mock-device-token|leaked-secret|super-secret|refresh-leak/);
});

test('live OAuth provider certification is skipped by default and fails closed when explicitly enabled without secrets', () => {
  const skipped = liveOAuthCertificationStatus({ env: {}, provider: 'all' });
  assert.equal(skipped.ok, true);
  assert.equal(skipped.skipped, true);

  const missing = liveOAuthCertificationStatus({
    env: { POSTMETER_LIVE_OAUTH_CERTIFICATION: '1' },
    provider: 'github'
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.skipped, false);
  assert.match(missing.errors.join('\n'), /POSTMETER_GITHUB_OAUTH_CLIENT_ID/);
  assert.doesNotMatch(JSON.stringify(missing), /client-secret-value|access-token/);
});

test('live OAuth CLI status skips without reading stale evidence paths until live mode is enabled', async () => {
  const skipped = await liveCertificationStatusFromInputs({
    argv: ['node', 'scripts/oauthProviderCertification.js', 'live'],
    env: {
      POSTMETER_LIVE_OAUTH_EVIDENCE_FILE: 'validation-artifacts/oauth-provider-certification/missing-live-evidence.json'
    }
  });
  assert.equal(skipped.ok, true);
  assert.equal(skipped.skipped, true);

  await assert.rejects(
    () => liveCertificationStatusFromInputs({
      argv: ['node', 'scripts/oauthProviderCertification.js', 'live'],
      env: {
        POSTMETER_LIVE_OAUTH_CERTIFICATION: '1',
        POSTMETER_LIVE_OAUTH_EVIDENCE_FILE: 'validation-artifacts/oauth-provider-certification/missing-live-evidence.json'
      }
    }),
    /ENOENT/
  );
});

test('live OAuth provider certification requires sanitized execution evidence when enabled', () => {
  const env = githubEnv();
  const configuredWithoutEvidence = liveOAuthCertificationStatus({ env, provider: 'github' });
  assert.equal(configuredWithoutEvidence.ok, false);
  assert.match(configuredWithoutEvidence.errors.join('\n'), /sanitized evidence JSON artifact/);

  const evidence = githubEvidence();
  const certified = liveOAuthCertificationStatus({ env, provider: 'github', evidence });
  assert.equal(certified.ok, true);
  assert.deepEqual(certified.errors, []);
  assert.doesNotMatch(JSON.stringify(certified), /client-secret|client-id|read:user|github\.com\/login\/oauth/);

  assert.match(
    validateLiveOAuthEvidence({
      ...evidence,
      providerRuns: [{
        ...evidence.providerRuns[0],
        notes: 'authorization_code=live-code user_code=ABCD token: live-token cookie=session proxy_authorization=Basic live-proxy auth_header=Basic live-auth-header Bearer live-token eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0In0.signature'
      }]
    }, certified.providers).join('\n'),
    /unredacted OAuth secret/
  );
  assert.deepEqual(validateLiveOAuthEvidence({
    ...evidence,
    providerRuns: [{
      ...evidence.providerRuns[0],
      notes: 'Authorization: Bearer [redacted]. auth_header=Bearer [redacted]; proxy_authorization=[redacted]; token: [redacted]; cookie: [redacted]'
    }]
  }, certified.providers), []);

  assert.match(
    validateLiveOAuthEvidence({
      ...evidence,
      providerRuns: [{
        ...evidence.providerRuns[0],
        structuredEvidence: {
          token: 'live-token',
          headers: {
            Authorization: 'Basic dXNlcjpwYXNz'
          }
        }
      }]
    }, certified.providers).join('\n'),
    /unredacted OAuth secret/
  );
  assert.match(
    validateLiveOAuthEvidence({
      ...evidence,
      providerRuns: [{
        ...evidence.providerRuns[0],
        structuredEvidence: {
          headers: {
            'Proxy-Authorization': 'Basic cHJveHk6c2VjcmV0',
            authHeader: 'Bearer live-token'
          }
        }
      }]
    }, certified.providers).join('\n'),
    /unredacted OAuth secret/
  );

  assert.match(
    liveOAuthCertificationStatus({
      env,
      provider: 'github',
      evidence: {
        ...evidence,
        providerRuns: [{
          ...evidence.providerRuns[0],
          redirectUris: ['https://example.test/callback'],
          grantTypes: ['authorization-code-pkce', 'bogus-grant'],
          executionArtifacts: [{
            type: 'sanitized-run-log',
            path: 'docs/live-oauth.log',
            sha256: 'not-a-checksum',
            redacted: false
          }]
        }]
      }
    }).errors.join('\n'),
    /postmeter:\/\/oauth\/callback|loopback|unsupported grant type bogus-grant|must live under|sha256|confirm redaction/
  );

  assert.match(
    liveOAuthCertificationStatus({
      env,
      provider: 'github',
      evidence: {
        ...evidence,
        providerRuns: [{
          ...evidence.providerRuns[0],
          executionArtifacts: [{
            type: 'sanitized-run-log',
            path: '/tmp/live-oauth.log',
            sha256: 'not-a-checksum',
            redacted: false
          }]
        }]
      }
    }).errors.join('\n'),
    /repository-relative/
  );

  assert.match(
    liveOAuthCertificationStatus({
      env,
      provider: 'github',
      evidence: {
        ...evidence,
        providerRuns: [{
          ...evidence.providerRuns[0],
          executionArtifacts: [{
            type: 'sanitized-run-log',
            path: 'validation-artifacts\\oauth-provider-certification\\github-live-oauth.log',
            sha256: 'a'.repeat(64),
            redacted: true
          }]
        }]
      }
    }).errors.join('\n'),
    /repository-relative/
  );

  assert.match(
    validateLiveOAuthEvidence({
      schemaVersion: 1,
      providerRuns: [{ providerId: 'typo-provider', result: 'passed' }]
    }, certified.providers).join('\n'),
    /unknown provider run typo-provider/
  );
});

test('live OAuth evidence paths are constrained to repository-relative files', () => {
  assert.equal(
    resolveEvidencePath('validation-artifacts/oauth-provider-certification/live-evidence.json'),
    path.join(__dirname, '..', '..', 'validation-artifacts', 'oauth-provider-certification', 'live-evidence.json')
  );
  assert.throws(() => resolveEvidencePath('docs/live-evidence.json'), /must live under validation-artifacts\/oauth-provider-certification/);
  assert.throws(() => resolveEvidencePath('validation-artifacts\\oauth-provider-certification\\live-evidence.json'), /forward-slash/);
  assert.throws(() => resolveEvidencePath('/tmp/live-evidence.json'), /repository-relative/);
  assert.throws(() => resolveEvidencePath('../live-evidence.json'), /inside the repository/);
  assert.throws(
    () => resolveEvidencePath('validation-artifacts/oauth-provider-certification/../live-evidence.json'),
    /must live under validation-artifacts\/oauth-provider-certification/
  );
});

test('live OAuth provider env validation is pinned to official provider endpoints', () => {
  const googleEnv = {
    POSTMETER_LIVE_OAUTH_CERTIFICATION: '1',
    POSTMETER_GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    POSTMETER_GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    POSTMETER_GOOGLE_OAUTH_AUTHORIZATION_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
    POSTMETER_GOOGLE_OAUTH_TOKEN_URL: 'https://oauth2.googleapis.com/token',
    POSTMETER_GOOGLE_OAUTH_SCOPES: 'openid profile'
  };
  const googleEvidence = providerEvidence('google', {
    artifactPath: 'validation-artifacts/oauth-provider-certification/google-manual-checklist.md',
    grantTypes: ['authorization-code-pkce', 'refresh-token'],
    sha256: 'c'.repeat(64)
  });
  assert.deepEqual(liveOAuthCertificationStatus({ env: googleEnv, provider: 'google', evidence: googleEvidence }).errors, []);
  assert.match(
    liveOAuthCertificationStatus({
      env: {
        ...googleEnv,
        POSTMETER_GOOGLE_OAUTH_AUTHORIZATION_URL: 'https://accounts.example.test/o/oauth2/v2/auth'
      },
      provider: 'google',
      evidence: googleEvidence
    }).errors.join('\n'),
    /accounts\.google\.com/
  );
  assert.match(
    liveOAuthCertificationStatus({
      env: {
        ...googleEnv,
        POSTMETER_GOOGLE_OAUTH_TOKEN_URL: 'https://tokens.example.test/token'
      },
      provider: 'google',
      evidence: googleEvidence
    }).errors.join('\n'),
    /Google OAuth token endpoint/
  );

  const githubEvidenceValue = githubEvidence();
  assert.deepEqual(liveOAuthCertificationStatus({ env: githubEnv(), provider: 'github', evidence: githubEvidenceValue }).errors, []);
  assert.match(
    liveOAuthCertificationStatus({
      env: {
        ...githubEnv(),
        POSTMETER_GITHUB_OAUTH_AUTHORIZATION_URL: 'https://github.example.test/login/oauth/authorize'
      },
      provider: 'github',
      evidence: githubEvidenceValue
    }).errors.join('\n'),
    /github\.com OAuth endpoints/
  );

  const entraEnv = {
    POSTMETER_LIVE_OAUTH_CERTIFICATION: '1',
    POSTMETER_ENTRA_OAUTH_CLIENT_ID: 'client-id',
    POSTMETER_ENTRA_OAUTH_CLIENT_SECRET: 'client-secret',
    POSTMETER_ENTRA_OAUTH_TENANT_ID: 'common',
    POSTMETER_ENTRA_OAUTH_AUTHORIZATION_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    POSTMETER_ENTRA_OAUTH_TOKEN_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    POSTMETER_ENTRA_OAUTH_DEVICE_AUTHORIZATION_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode',
    POSTMETER_ENTRA_OAUTH_SCOPES: 'User.Read'
  };
  const entraEvidence = providerEvidence('microsoft-entra', {
    artifactPath: 'validation-artifacts/oauth-provider-certification/entra-manual-checklist.md',
    grantTypes: ['authorization-code-pkce', 'refresh-token', 'client-credentials', 'device-code'],
    sha256: 'b'.repeat(64)
  });
  assert.deepEqual(liveOAuthCertificationStatus({ env: entraEnv, provider: 'microsoft-entra', evidence: entraEvidence }).errors, []);
  assert.match(
    liveOAuthCertificationStatus({
      env: {
        ...entraEnv,
        POSTMETER_ENTRA_OAUTH_TENANT_ID: 'common/../tenant',
        POSTMETER_ENTRA_OAUTH_TOKEN_URL: 'https://example.test/common/oauth2/v2.0/token'
      },
      provider: 'microsoft-entra',
      evidence: entraEvidence
    }).errors.join('\n'),
    /tenant id|Microsoft Entra authority host/
  );
});

test('live OAuth evidence artifact checksums are verified when an artifact root is supplied', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postmeter-oauth-evidence-'));
  try {
    const artifactPath = 'validation-artifacts/oauth-provider-certification/github-manual-checklist.md';
    const absoluteArtifactPath = path.join(tempDir, artifactPath);
    const artifactBody = 'GitHub live OAuth manual checklist with all sensitive values redacted.\n';
    fs.mkdirSync(path.dirname(absoluteArtifactPath), { recursive: true });
    fs.writeFileSync(absoluteArtifactPath, artifactBody);
    const artifactSha256 = crypto.createHash('sha256').update(artifactBody).digest('hex');
    const evidence = githubEvidence({ artifactPath, sha256: artifactSha256 });

    assert.deepEqual(liveOAuthCertificationStatus({ env: githubEnv(), provider: 'github', evidence, artifactRoot: tempDir }).errors, []);
    const leakedArtifactBody = 'Authorization: Basic dXNlcjpwYXNz\n';
    fs.writeFileSync(absoluteArtifactPath, leakedArtifactBody);
    const leakedArtifactSha256 = crypto.createHash('sha256').update(leakedArtifactBody).digest('hex');
    assert.match(
      liveOAuthCertificationStatus({
        env: githubEnv(),
        provider: 'github',
        evidence: {
          ...evidence,
          providerRuns: [{
            ...evidence.providerRuns[0],
            executionArtifacts: [{ ...evidence.providerRuns[0].executionArtifacts[0], sha256: leakedArtifactSha256 }]
          }]
        },
        artifactRoot: tempDir
      }).errors.join('\n'),
      /execution artifact .*unredacted OAuth secret/
    );
    assert.match(
      liveOAuthCertificationStatus({
        env: githubEnv(),
        provider: 'github',
        evidence: {
          ...evidence,
          providerRuns: [{
            ...evidence.providerRuns[0],
            executionArtifacts: [{ ...evidence.providerRuns[0].executionArtifacts[0], sha256: 'b'.repeat(64) }]
          }]
        },
        artifactRoot: tempDir
      }).errors.join('\n'),
      /sha256 checksum does not match/
    );
    fs.unlinkSync(absoluteArtifactPath);
    assert.match(
      liveOAuthCertificationStatus({ env: githubEnv(), provider: 'github', evidence, artifactRoot: tempDir }).errors.join('\n'),
      /does not exist/
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function githubEnv() {
  return {
    POSTMETER_LIVE_OAUTH_CERTIFICATION: '1',
    POSTMETER_GITHUB_OAUTH_CLIENT_ID: 'client-id',
    POSTMETER_GITHUB_OAUTH_CLIENT_SECRET: 'client-secret',
    POSTMETER_GITHUB_OAUTH_AUTHORIZATION_URL: 'https://github.com/login/oauth/authorize',
    POSTMETER_GITHUB_OAUTH_TOKEN_URL: 'https://github.com/login/oauth/access_token',
    POSTMETER_GITHUB_OAUTH_DEVICE_AUTHORIZATION_URL: 'https://github.com/login/device/code',
    POSTMETER_GITHUB_OAUTH_SCOPES: 'read:user'
  };
}

function githubEvidence(options = {}) {
  return providerEvidence('github', {
    artifactPath: options.artifactPath || 'validation-artifacts/oauth-provider-certification/github-manual-checklist.md',
    evidenceItems: [...REQUIRED_EVIDENCE_BASE, 'refresh-token-where-enabled'],
    grantTypes: ['authorization-code-pkce', 'device-code'],
    sha256: options.sha256 || 'a'.repeat(64)
  });
}

function providerEvidence(providerId, options = {}) {
  return {
    schemaVersion: 1,
    providerRuns: [{
      providerId,
      result: 'passed',
      testedAt: '2026-05-01T00:00:00.000Z',
      appType: 'temporary maintainer OAuth app',
      redirectUris: ['postmeter://oauth/callback', 'http://127.0.0.1:{dynamic-port}/oauth/callback'],
      grantTypes: options.grantTypes || ['authorization-code-pkce'],
      redactionConfirmed: true,
      providerConsoleReviewed: true,
      executionArtifacts: [{
        type: 'manual-checklist',
        path: options.artifactPath,
        sha256: options.sha256,
        redacted: true
      }],
      evidence: options.evidenceItems || [...REQUIRED_EVIDENCE_BASE, 'refresh-token']
    }]
  };
}
