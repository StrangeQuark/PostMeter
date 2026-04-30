# Troubleshooting

This page covers user-facing recovery and diagnosis notes for behavior that is expected by design but can look like a broken request.

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
