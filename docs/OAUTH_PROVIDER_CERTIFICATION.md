# OAuth Provider Certification

Use this document for maintainer-run outbound OAuth certification. It is not end-user login documentation.

PostMeter is a standalone local desktop app. OAuth is only for authenticating outbound API requests to target APIs. Do not add PostMeter accounts, PostMeter login, required application sign-in, or any account gate for core usage.

## Current Status

- Mocked OAuth certification is implemented and automated: `npm run oauth:certify:validate && npm run oauth:certify:mock`.
- Live provider certification tooling is implemented but skipped by default: `npm run oauth:certify:live`. When explicitly enabled, it fails closed unless provider env vars and official provider OAuth endpoint URLs are supplied. A sanitized forward-slash live evidence JSON artifact under `validation-artifacts/oauth-provider-certification/` is optional; when supplied, it is validated strictly.
- Stable release OAuth signoff is complete for maintainer-owned Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth App registrations. No provider credentials or validation artifacts are committed; temporary provider credentials should be deleted or rotated after certification.
- The source-owned matrix is `docs/oauth-provider-certification-matrix.json`, generated from `src/core/diagnostics-release/oauthProviderCertification.js`.

## Provider Targets

| Provider | Authorization Code + PKCE | Refresh Token | Client Credentials | Device Code | Custom Scheme Redirect | Loopback Redirect |
| --- | --- | --- | --- | --- | --- | --- |
| Google OAuth 2.0 | Required | Required where offline access is granted | Not generally applicable for user OAuth | Optional where enabled | Verify | Verify |
| Microsoft Entra ID / Azure AD | Required | Required | Required for app-only APIs | Required | Verify | Verify |
| GitHub OAuth Apps | Required | Provider-dependent | Not applicable | Required for certification | Verify | Verify |

## Commands

```bash
npm run oauth:certify:validate
npm run oauth:certify:mock
npm run oauth:certify:live
POSTMETER_LIVE_OAUTH_CERTIFICATION=1 npm run oauth:certify:live -- --provider all
POSTMETER_LIVE_OAUTH_CERTIFICATION=1 POSTMETER_LIVE_OAUTH_EVIDENCE_FILE=validation-artifacts/oauth-provider-certification/live-evidence.json npm run oauth:certify:live -- --provider all
```

`oauth:certify:live` exits successfully as skipped unless `POSTMETER_LIVE_OAUTH_CERTIFICATION=1` is set. When enabled, it validates that required provider env vars are present and that provider endpoint URLs point to official Google, Microsoft Entra, or GitHub OAuth endpoints. If `POSTMETER_LIVE_OAUTH_EVIDENCE_FILE` or `--evidence` is supplied, the referenced sanitized forward-slash repository-relative JSON evidence artifact under `validation-artifacts/oauth-provider-certification/` is also validated. The command does not perform browser-based provider sign-in by itself; maintainers still perform the live provider flows manually and use the env-based live gate as the release signoff. The manual GitHub Actions workflow `OAuth Provider Certification` runs the same validation and mock suite, then checks live provider configuration when the `run_live` workflow input is enabled, with optional evidence validation when `evidence_path` is supplied.

## Redirect URIs

Register both redirect strategies when the provider allows them:

- `postmeter://oauth/callback`
- `http://127.0.0.1:{dynamic-port}/oauth/callback`

The loopback port is chosen at runtime. Manual live verification should cover both loopback and custom-scheme redirects when the provider allows them. Providers that require an exact static loopback URI must support wildcard or loopback-port registration for PostMeter loopback verification; otherwise users may still use the custom scheme path at runtime, but maintainers should record the loopback limitation in release notes or provider setup notes.

## Live Env Vars

Configure these only as maintainer-owned GitHub Actions secrets or local shell variables for live certification. Do not commit values.

- Google: `POSTMETER_GOOGLE_OAUTH_CLIENT_ID`, `POSTMETER_GOOGLE_OAUTH_CLIENT_SECRET`, `POSTMETER_GOOGLE_OAUTH_AUTHORIZATION_URL`, `POSTMETER_GOOGLE_OAUTH_TOKEN_URL`, `POSTMETER_GOOGLE_OAUTH_SCOPES`
- Microsoft Entra: `POSTMETER_ENTRA_OAUTH_CLIENT_ID`, `POSTMETER_ENTRA_OAUTH_CLIENT_SECRET`, `POSTMETER_ENTRA_OAUTH_TENANT_ID`, `POSTMETER_ENTRA_OAUTH_AUTHORIZATION_URL`, `POSTMETER_ENTRA_OAUTH_TOKEN_URL`, `POSTMETER_ENTRA_OAUTH_DEVICE_AUTHORIZATION_URL`, `POSTMETER_ENTRA_OAUTH_SCOPES`
- GitHub: `POSTMETER_GITHUB_OAUTH_CLIENT_ID`, `POSTMETER_GITHUB_OAUTH_CLIENT_SECRET`, `POSTMETER_GITHUB_OAUTH_AUTHORIZATION_URL`, `POSTMETER_GITHUB_OAUTH_TOKEN_URL`, `POSTMETER_GITHUB_OAUTH_DEVICE_AUTHORIZATION_URL`, `POSTMETER_GITHUB_OAUTH_SCOPES`
- Optional evidence file: `POSTMETER_LIVE_OAUTH_EVIDENCE_FILE`

Live certification endpoint URLs are intentionally not arbitrary OAuth URLs. Google authorization must use `accounts.google.com` and token exchange must use an official `googleapis.com` or `accounts.google.com` token endpoint. Microsoft Entra endpoints must use a recognized Entra authority host and include the configured tenant segment before `/oauth2/...`. GitHub endpoints must use `github.com/login/oauth/authorize`, `github.com/login/oauth/access_token`, and `github.com/login/device/code`.

## Optional Evidence Rules

Evidence artifacts are not required for the live gate. If maintainers choose to keep a sanitized evidence artifact for a release, record live certification results in this file or a linked release artifact with:

- Provider name, app type, tenant/account type, and date tested.
- Redirect URIs registered and redirect strategy used.
- Grant type tested: authorization-code PKCE, refresh token where required or enabled, GitHub/Microsoft device code, and Microsoft client credentials.
- Cancellation or abandoned-browser behavior observed.
- Token storage and redaction behavior observed.
- Provider-specific setup notes and limitations.
- Redacted execution artifact references with forward-slash repository-relative paths under `validation-artifacts/oauth-provider-certification/` and SHA-256 checksums.

Never include live access tokens, refresh tokens, ID tokens, authorization codes, device codes, code verifiers, client secrets, Authorization or Proxy-Authorization headers or auth-header aliases, cookies, full workspace JSON, or provider screenshots that expose credentials. Redact values as `[redacted]`. Rotate or delete temporary provider credentials after certification.

When supplied, the evidence validator requires both `postmeter://oauth/callback` and `http://127.0.0.1:{dynamic-port}/oauth/callback` coverage, rejects unknown grant labels, rejects the live evidence JSON path and artifact paths outside `validation-artifacts/oauth-provider-certification/`, rejects absolute, traversal, or backslash paths, verifies repository-relative execution artifact files and SHA-256 checksums when run through the CLI or GitHub Actions workflow, and scans structured evidence, notes, artifact metadata, and text artifact contents for unredacted token, code, cookie, Authorization or Proxy-Authorization, auth-header alias, JWT-like, and client-secret shapes. Provider-specific required grant labels are:

- Google: `authorization-code-pkce`, `refresh-token`
- Microsoft Entra ID / Azure AD: `authorization-code-pkce`, `refresh-token`, `client-credentials`, `device-code`
- GitHub: `authorization-code-pkce`, `device-code`

GitHub refresh-token evidence is provider-dependent. Use the required evidence item `refresh-token-where-enabled` to record whether expiring user tokens were enabled and, if so, whether refresh behavior was observed.

Optional live evidence JSON shape:

```json
{
  "schemaVersion": 1,
  "providerRuns": [
    {
      "providerId": "github",
      "result": "passed",
      "testedAt": "2026-05-01T00:00:00.000Z",
      "appType": "temporary maintainer OAuth app",
      "redirectUris": [
        "postmeter://oauth/callback",
        "http://127.0.0.1:{dynamic-port}/oauth/callback"
      ],
      "grantTypes": ["authorization-code-pkce", "device-code"],
      "redactionConfirmed": true,
      "providerConsoleReviewed": true,
      "executionArtifacts": [
        {
          "type": "manual-checklist",
          "path": "validation-artifacts/oauth-provider-certification/github-manual-checklist.md",
          "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "redacted": true
        }
      ],
      "evidence": [
        "provider-date-and-app-type",
        "redirect-uri-registration",
        "authorization-code-pkce",
        "refresh-token-where-enabled",
        "device-code-where-supported",
        "client-credentials-where-supported",
        "custom-scheme-callback",
        "loopback-callback",
        "cancellation-or-abandoned-browser",
        "token-storage-and-redaction"
      ],
      "notes": "No tokens, auth headers, cookies, authorization codes, device codes, code verifiers, client secrets, or workspace JSON captured."
    }
  ]
}
```

## Manual Checklist

1. Create a temporary maintainer-owned provider app registration.
2. Configure redirect URIs for `postmeter://oauth/callback` and the provider-supported loopback URI shape.
3. Configure a harmless target API endpoint that returns authenticated principal or scope metadata.
4. Run Authorization Code + PKCE and confirm browser launch, state validation, token exchange, token injection only into the outbound request, and refresh behavior.
5. Run Device Code where supported and confirm user code display, pending polling, denial, expiration, cancellation, and timeout behavior.
6. Run Client Credentials where supported and confirm token retrieval and clear failure UX.
7. Confirm token endpoint redirects are refused and provider error descriptions are redacted.
8. Save and reload the workspace and confirm the current explicit policy: OAuth access token, refresh token, and client secret fields are ordinary auth fields persisted in workspace JSON and exported collections. Do not share those files as certification evidence unless values are scrubbed.
9. Remove the temporary provider app registration or rotate credentials after testing.

## Provider Notes

### Google OAuth 2.0

- Offline access may require explicit provider parameters and a fresh consent prompt before a refresh token is returned.
- Client Credentials is not a general replacement for Google user OAuth flows.
- Provider console redirect URI matching can be strict; document any loopback-port limitation.

### Microsoft Entra ID / Azure AD

- Test the tenant mode your users need: single-tenant, multi-tenant, or common authority.
- Client Credentials is important for app-only Microsoft Graph and Azure management APIs.
- Device Code is a high-value fallback for restricted browser environments.

### GitHub OAuth Apps

- OAuth Apps cover authorization-code flows.
- Device flow may require separate provider settings; enable it for certification because the live evidence gate requires GitHub device-code coverage.
- Refresh-token behavior depends on the app's expiring user token settings.
