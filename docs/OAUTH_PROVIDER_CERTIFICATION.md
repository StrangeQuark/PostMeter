# OAuth Provider Certification

PostMeter is a standalone local desktop app. This document covers outbound OAuth 2.0 request authentication for target APIs only. Do not add PostMeter user accounts, PostMeter login, required cloud sign-in, or an account gate for core app usage.

## First Provider Targets

Use these maintainer-approved providers as the first manual certification targets because they cover the most common developer OAuth patterns PostMeter needs to support:

- Google OAuth 2.0
- Microsoft Entra ID / Azure AD
- GitHub OAuth Apps

## Certification Matrix

For each provider, certify the flows that the provider supports and document any provider-specific constraints in this file.

| Provider | Authorization Code + PKCE | Refresh Token | Client Credentials | Device Code | Custom Scheme Redirect | Loopback Redirect |
| --- | --- | --- | --- | --- | --- | --- |
| Google OAuth 2.0 | Required | Required where offline access is granted | Not generally applicable for user OAuth | Optional | Verify | Verify |
| Microsoft Entra ID / Azure AD | Required | Required | Required for app-only APIs | Required | Verify | Verify |
| GitHub OAuth Apps | Required | Provider-dependent | Not applicable | Device flow supported separately by GitHub | Verify | Verify |

## Manual Certification Steps

1. Create a temporary provider app registration owned by the maintainer.
2. Configure redirect URIs for both supported PostMeter redirect strategies:
   - `postmeter://oauth/callback`
   - A loopback redirect URI accepted by the provider, such as `http://127.0.0.1:{port}/callback`.
3. In PostMeter, create a request to a harmless provider API endpoint that returns the authenticated principal or token scope.
4. Configure the request Auth tab with OAuth 2.0 provider values.
5. Run Authorization Code + PKCE and confirm:
   - The browser opens to the provider consent screen.
   - State mismatch protection rejects altered callbacks.
   - Token exchange succeeds.
   - The access token is injected only into the outbound target API request.
   - Refresh token renewal works when the provider returns a refresh token.
6. Run Device Code where supported and confirm:
   - The device-code prompt shows the verification URI and user code.
   - Polling handles pending authorization without treating it as a fatal error.
   - Access denial, timeout, and cancellation show clear user-facing errors.
7. Run Client Credentials where supported and confirm:
   - Client secret inputs remain editable as normal visible text fields.
   - Token retrieval succeeds.
   - Token retrieval failures show clear provider errors.
8. Save and reload the workspace and confirm:
   - OAuth auth fields persist in the workspace JSON.
   - Workspace and collection exports include the normalized auth fields directly.
9. Remove the temporary provider app registration or rotate credentials after testing.

## Provider Notes

### Google OAuth 2.0

- Offline access may require explicit provider parameters and user consent before a refresh token is returned.
- Client Credentials is not a general replacement for Google user OAuth flows.
- Verify both loopback and custom-scheme redirects because provider console configuration can be strict.

### Microsoft Entra ID / Azure AD

- Test both single-tenant and common/multi-tenant authority URLs if the target users need both.
- Client Credentials is important for app-only Microsoft Graph and Azure management APIs.
- Device Code is a high-value fallback for restricted browser environments.

### GitHub OAuth Apps

- GitHub OAuth Apps cover authorization-code flows; GitHub device flow may require separate app settings.
- Refresh-token behavior depends on the OAuth app configuration and GitHub's expiring user token settings.
- Validate scope display and token injection with a low-risk endpoint such as the authenticated user endpoint.

## Required Evidence

For each certified provider, record:

- Provider app type and date tested.
- Redirect strategy tested.
- Grant type tested.
- Token refresh behavior.
- Error states tested.
- Any provider-specific setup required.
- Screenshots or logs needed to reproduce provider behavior.
