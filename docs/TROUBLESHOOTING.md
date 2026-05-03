# Troubleshooting

This page covers user-facing recovery and diagnosis notes for behavior that is expected by design but can look like a broken request.

## Operation Failures And UI Recovery

Most desktop operations are recoverable without restarting PostMeter. Failed sends show `ERR` in the response status and place the actionable error text in the response body. Validation failures stay in the request validation area and do not send the request. Collection runs and load tests keep their result panels in an idle/export-disabled state after failures, and duplicate active run IDs are rejected instead of replacing an existing cancellable run.

Workspace and collection import failures show a notification and keep the currently loaded workspace intact. If a collection import succeeds but the follow-up workspace save fails, PostMeter rolls back the imported collection and restores the prior selection before reporting the save error. Export failures show a notification and do not mark the export as complete. Picker cancellation is treated as a no-op and leaves the previous status in place where practical.

The package review/fetch and imported-file binding controls use in-app review prompts. Cancelling any prompt leaves the workspace unchanged, and failed settings persistence rolls back additive package/file/capability changes before reporting an error. Removing reviewed package-cache entries or imported file bindings requires confirmation because imported scripts or requests may fail until the package or file is reviewed again.

UI smoke failures in CI and release-validation workflows write debugging artifacts when `POSTMETER_VALIDATION_ARTIFACT_DIR` is set, or when `POSTMETER_UI_SMOKE_ARTIFACT_DIR` is set for UI-smoke-specific output: a screenshot, a bounded structural DOM-state JSON file, and a redacted log containing the smoke failure title or stack. Startup load, preload, and early renderer failures fail fast with the same redacted startup artifacts when a renderer is available instead of waiting for the full startup timeout; pre-window failures still write a redacted log. DOM and screenshot capture are time-bounded, and the smoke launcher escalates hung Electron children so a stalled renderer cannot prevent the failing smoke process from exiting. The DOM-state capture keeps structural fields such as active element IDs, dialog IDs/titles, visible panel IDs, and text lengths, but does not persist broad page, panel, modal, request, response, cookie, validation, or OAuth-progress text. It redacts known secret-like active fields and active-element ARIA metadata, including auth, cookie value, client-certificate, and OAuth fields, plus common token-shaped title and URL values before writing JSON. Source UI smoke wrapper stdout/stderr, launcher stacks, source/packaged sandbox validation child output, packaged-smoke process logs, packaged-smoke thrown failure messages, and multi-process load-worker stderr previews use the shared diagnostics redactor for local paths, private keys, request/response alias values, JSON-escaped slash URLs/file URLs, Bearer/Basic/Digest/Hawk/Token/OAuth/NTLM/Negotiate auth-shaped values, JSON-escaped/double-escaped/nested-JSON camelCase auth-header aliases, and OAuth authorization-code/device-code/user-code/code-verifier/client-assertion fields before writing validation artifacts or reaching CI stderr; smoke child output is byte-bounded before timeout reporting. Screenshots still reflect whatever was visible in the renderer at failure time, so review artifacts before sharing, especially after local/manual runs where request names, URLs, response text, or other sensitive workspace data may be visible.

PostMeter's production renderer uses in-app dialogs for workspace renames/deletes, package review/fetch, imported file binding, vault binding/reset, update-opening confirmation, high-concurrency load confirmation, and tree rename/delete actions. These dialogs are keyboard focus-trapped, restore focus when closed, and report cancellation through the normal status surfaces instead of relying on raw browser prompt, confirm, or alert dialogs.

Toolbar menus and tree context menus can be opened from the keyboard, move focus into the menu, support arrow/Home/End item navigation, close with Escape, and restore focus to the opener.

Use `Help > Export Local Diagnostics...` or the current Workspace panel's `Export Local Diagnostics` control when you need a support bundle. PostMeter waits for pending diagnostics privacy settings to save, then writes a JSON file to the path you choose; it does not upload diagnostics, require a PostMeter account, or send telemetry. Review the file before sharing.

Production logging and diagnostic export do not include inbound or outbound request/response details by default. That privacy boundary covers URLs, path segments, query params, headers, HTTP/gRPC metadata, cookies, auth material, request bodies and aliases, form-data parts, GraphQL variables, gRPC messages, response bodies, rendered response text, examples/history payloads, and script console values that echo API traffic. Workspace diagnostics settings can enable narrow request/response categories, but every category is off by default, local/current-workspace scoped, preserves prior privacy choices on partial settings saves, and warns that it may expose PII or customer data. Auth schemes including header-shaped standalone Bearer/Basic/Digest/Hawk/Token/OAuth/NTLM/Negotiate tokens, comma/semicolon-delimited compound Digest-style parameters with optional whitespace around equals, JSON-escaped/double-escaped/nested-JSON camelCase auth-header aliases, AWS SigV4 and Akamai-style signature parameters, chained AWS query credentials next to kebab-case OAuth secret assignments, assigned exact token/code/state fields plus assigned and bare whitespace-only snake_case/kebab-case/camelCase OAuth/token fields, broad camelCase/snake_case/kebab-case token/secret/password/passwd/passphrase/credential suffix aliases, X-API-key, X-access/auth/authorization-token, CSRF/XSRF-token, JWT-token, secret-key, API-secret, subscription-key, access-key, shared-access-key, account/storage/signing/webhook/license/public key, consumer-key/secret, and OAuth-consumer-key/secret aliases, unquoted multi-word and repeated-whitespace secret fields, certificate passphrases, generic credential fields, sensitive object keys, cookies, JWTs including JWT-shaped URL path/query/fragment values, private keys, UNC/extended UNC/Windows device/Windows/macOS/POSIX local paths including file:// URLs, JSON-escaped slash URLs, JSON-escaped POSIX paths, file URLs, mixed path/URL chains, supported and custom URL-scheme credentials, OAuth provider/progress error URL and path references, OAuth callback code/state params and token fragments, URL-encoded free-text OAuth/token parameter strings, unescaped JSON/annotated/class-style and parenthesized util-inspect URL/header/metadata array/object aliases with whitespace/colon/equals separators, structured header/metadata key/name pairs with sensitive value/raw/currentValue/schema fields, object/array request/response assignments, bare, assigned, escaped, double-escaped, and nested-JSON including escaped newline/quote/backslash camelCase/snake_case/kebab-case body/bodyPreview/data/responseText/text/variables/rendered-response aliases, script-console aliases, payload-identifier aliases, protocol-message aliases, secret query/fragment/path params including path label/value and inline same-segment forms with encoded slashes, routed fragment path forms, single- and multi-encoded delimiter forms including recursively nested encoded wrapper params and structured key/value/raw/currentValue/example/schema-default arrays, source/UI/packaged smoke failure output, source/packaged sandbox validation child output, and IPC/export failure messages and diagnostic event type/outcome/failure-code metadata including compact/delimiter-free token/code/state labels and one-letter token aliases plus secret-shaped IPC/export error names and codes are still redacted. Auth-scheme words embedded inside hyphenated values are not treated as standalone auth schemes, and URL category opt-ins preserve non-sensitive query, fragment, and path context while still redacting sensitive query, fragment, path label/value, inline path, routed fragment path, encoded delimiter, auth, and token values.

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
