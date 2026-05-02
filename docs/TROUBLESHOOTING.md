# Troubleshooting

This page covers user-facing recovery and diagnosis notes for behavior that is expected by design but can look like a broken request.

## OAuth Provider Setup

PostMeter OAuth is outbound request authentication only. It does not sign you into PostMeter.

Authorization Code + PKCE opens the system browser and waits for either `postmeter://oauth/callback` or `http://127.0.0.1:{dynamic-port}/oauth/callback`. If a provider reports a redirect URI mismatch, verify the exact `/oauth/callback` path and whether the provider allows dynamic loopback ports. If the browser is closed or consent is abandoned, return to PostMeter and click Cancel or wait for the OAuth callback timeout.

Device Code flows keep polling until the provider approves, denies, expires, times out, or the user cancels. Denial and expiration are expected provider states, not local workspace corruption.

Client Credentials only works for providers and APIs that support app-only access. Google user OAuth generally does not use client credentials; Microsoft Entra commonly does for app-only APIs; GitHub OAuth Apps do not use it as a normal OAuth App flow.

Provider error messages are redacted before display when they contain token-shaped fields such as access tokens, refresh tokens, device codes, code verifiers, or client secrets. When filing a bug, include provider name, grant type, redirect strategy, sanitized error text, and whether the failure happened before browser launch, at callback, during token exchange, during refresh, or while sending the target request. Do not include live tokens, authorization codes, client secrets, auth headers, cookies, or workspace JSON containing OAuth auth fields.

## Workspace Recovery Files

PostMeter stores managed workspaces as local JSON files. When an older supported workspace schema is loaded, PostMeter first creates a collision-resistant sibling `pre-migration.backup` file through the same atomic no-overwrite write path used by normal workspace saves, then saves the migrated schema 11 workspace.

If the active workspace JSON cannot be parsed, PostMeter moves the unreadable file through a no-overwrite file move to a collision-resistant timestamped `corrupt` sibling file, best-effort fsyncs the containing directory, creates a fresh default workspace through no-overwrite publication, and shows a recovery error. If another valid workspace appears at the active path before the recovered default can be published, PostMeter preserves that replacement instead of overwriting it. The corrupt file is kept for manual inspection or support, but PostMeter does not load it automatically.

If a workspace uses a future schema version that this app does not support, PostMeter refuses to load it. It does not quarantine or overwrite that file, because a newer PostMeter build may still be able to read it.

Stale `postmeter-*.json.tmp` files can be left behind by an interrupted write before rename. They are not managed workspaces and are ignored by workspace discovery; keep them only if you are investigating a crash. Managed workspaces are discovered from native workspace JSON files in the workspace directory, so the removed legacy workspace manifest is not a source of truth. When PostMeter creates a default workspace, creates another workspace, imports, or renames a managed workspace, it also avoids filenames that already exist on disk even if those files are unreadable or not native workspaces. If a destination appears between allocation and publication, PostMeter preserves that file and retries with a suffixed workspace filename.

## Package Cache Repair

Reviewed script packages are stored as workspace metadata in `settings.sandbox.packageCache`. If an imported script reports that a package is missing, unreviewed, duplicated, or has an integrity mismatch, open the workspace panel and review the package cache status.

Repair options:

- Re-fetch the package from the reviewed source URL or registry specifier.
- Remove stale duplicate cache entries from the workspace JSON only if the app UI cannot repair them.
- Re-import the collection after package review if the original import lacked package reference metadata.

Do not hand-edit reviewed package source or integrity values unless you are intentionally invalidating and re-reviewing that package. Runtime scripts cannot fetch packages from registries directly.

## Vault Prompts

Postman-style `pm.vault` access is desktop-only. PostMeter prompts when a request, collection run, or nested `pm.execution.runRequest` script calls `pm.vault.get()`, `pm.vault.set()`, or `pm.vault.unset()` and the workspace does not already have a matching vault grant or denial.

Prompt choices:

- `Deny`: fails the vault call for this execution. Script code after the denied vault call does not run.
- `Allow request`: grants vault access only to the current request.
- `Allow collection`: grants vault access to requests in the current collection.
- `Allow workspace`: grants vault access across the current workspace.
- `Reset grants`: clears stored vault grants and fails the current vault call.

The prompt shows request, collection, workspace, operation, and secret-key metadata only. It does not show secret values, vault file paths, encryption keys, ciphertext, storage handles, or a list of all stored vault secrets.

If a script keeps prompting, either choose a broader grant for the intended trust boundary or open the workspace settings panel and review the `Script vault access` and vault grant state. Imported collections cannot silently grant vault access by themselves.

## Binding Vault Secrets

Imported Postman collections may reference vault keys that do not exist locally. Use the workspace panel to bind local values:

- `Bind Vault Secret`: stores or replaces a local secret value for the key you enter.
- `Refresh Vault Metadata`: refreshes non-secret vault status, available keys, and audit entries.
- `Reset Vault`: deletes the local encrypted vault file for the current workspace.

Vault values are stored outside workspace JSON in a per-workspace encrypted vault file when Electron reports OS-backed `safeStorage` encryption. Workspace save, workspace export, and collection export do not include local vault plaintext or PostMeter vault ciphertext.

## Vault Encryption Unavailable

PostMeter fails closed when OS-backed vault encryption is unavailable. On Linux, Electron's `basic_text` backend is treated as unavailable because it is not OS-backed encryption.

Expected symptoms:

- `pm.vault` calls fail with an encryption-unavailable error.
- The workspace vault panel reports unavailable metadata.
- Secret values are not written to workspace JSON as a fallback.

Use an OS session with a supported keyring or credential store, then restart PostMeter and refresh vault metadata. Do not work around this by storing vault values in ordinary variables unless you intentionally want those values saved in plain workspace JSON.

## Denials And Resets

Explicit request denials override collection and workspace grants. Explicit collection denials override workspace grants. A reset clears vault grants and causes the current vault call to fail.

When a denial or reset happens during a pre-request script, the HTTP request is not sent. When it happens during a test script, the request has already completed, but script execution stops after the denied vault call.

## Auditing

Vault audit entries record bounded metadata such as operation, request, collection, workspace, prompt grant, prompt denial, prompt reset, denied-after-call, and unavailable-encryption outcomes. Audit entries must not contain secret values.

If you need to share a bug report, include the operation and error text, but do not include live vault values, tokens, private keys, auth headers, cookies, or proprietary request/response bodies.
