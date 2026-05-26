# Security

PostMeter is a standalone local desktop app. It does not require a PostMeter account, cloud login, or telemetry service for core use.

## Trust Boundaries

- Renderer: loaded through the secure standard `postmeter-app://bundle` protocol instead of `file://`, no Node integration, context isolation enabled, renderer sandbox enabled, explicit main-frame-only preload API, restrictive CSP in both the HTML and protocol response, and `nosniff`/`no-referrer` protocol headers. Renderer-controlled top-level navigation away from the exact initial packaged renderer URL, `window.open`, `<webview>` attachment, and Electron permission checks/requests are denied in the main window.
- Electron main process: owns desktop lifecycle, the allowlisted app-content protocol handler, fail-closed trusted main-frame renderer IPC sender validation with app-protocol path and query-key checks, IPC payload validation, dialogs, workspace persistence, vault storage, OAuth flows, constrained credential-free external browser launches, package review/fetch, and native OS integration.
- Core script runtime: runs request scripts outside the main process with hardened VM values, bounded resources, Node permission flags where supported, and brokered privileged APIs.

## Script Sandbox

Scripts must not receive direct access to the host filesystem, process environment, child processes, shell, Electron APIs, renderer DOM, native modules, or raw sockets. Postman-compatible APIs such as `pm.sendRequest`, cookie helpers, package loading, visualizers, vault access, GraphQL hooks, and gRPC hooks are implemented through parent-owned brokers and validators.

Linux script workers require `bubblewrap` plus a dangerous-syscall seccomp policy. Windows script workers require the release-owned AppContainer helper, and macOS script workers require a seatbelt `sandbox-exec` profile. Script execution fails closed when the platform backend is unavailable or fails its functional probe. Platform-equivalent OS sandbox coverage is tracked separately in `docs/os-sandbox-platform-matrix.json` and must stay backed by native runner source and packaged validation evidence.

## Vault And Secrets

Vault values are stored outside workspace JSON in per-workspace encrypted files when Electron `safeStorage` has OS-backed encryption. The renderer and scripts never receive vault file paths, encryption keys, ciphertext, storage handles, or secret enumeration through the prompt flow. The renderer vault prompt only receives bounded metadata: request name/id, collection name/id, workspace name/id, operation, and secret key name. Concurrent prompt requests are queued so each decision is applied to the matching prompt and workspace, and prompt responses are accepted only from the renderer `webContents` that received the prompt.

Global TLS trust settings are workspace-local. Settings > Certificates SSL verification preferences, custom CA paths, and managed client-certificate paths live in managed workspace `localsettings` and are stripped from portable native workspace exports. Request-local TLS overrides are saved on the request so exported requests can preserve that behavior; review request exports before sharing if they disable verification or reference local CA files. Client-certificate passphrases entered in Settings > Certificates are stored as vault references when the workspace vault can bind the secret; if vault binding is unavailable, PostMeter keeps the passphrase only in workspace-local settings so the local certificate remains usable. Scripts never receive direct CA, certificate, key, PFX/P12, or passphrase file reads; they may only select configured certificate bindings by id through parent-owned brokers.

OAuth provider error text is redacted before display when it contains token-shaped fields, generic token/secret/cookie fields, authorization codes, device/user codes, PKCE verifiers, client secrets, Authorization/Proxy-Authorization header-shaped values, common auth-header aliases, URL credentials, file URLs, local paths, or private keys, and token endpoint redirects are refused before response-body parsing so token POST bodies are not forwarded to redirect targets. OAuth access tokens, refresh tokens, and client secrets are still ordinary visible auth fields persisted in workspace JSON and collection exports; do not include live workspace files in bug reports or certification evidence unless those fields are scrubbed.

Diagnostics are local-only and user controlled. Logs and exported diagnostic bundles default-deny request/response URLs, path/query values, methods, status codes/categories, sizes, headers, HTTP/gRPC metadata, cookies, auth material, bodies and aliases, protocol messages, script-console traffic echoes, and payload-derived identifiers. Narrow current-workspace-scoped request/response logging categories are off by default, stored in managed workspace `localsettings` instead of portable workspace exports, preserve prior privacy choices on partial settings saves, and warn about PII/customer data; auth schemes including header-shaped standalone Bearer/Basic/Digest/Hawk/Token/OAuth/NTLM/Negotiate tokens, comma/semicolon-delimited compound Digest-style parameters with optional whitespace around equals, JSON-escaped/double-escaped/nested-JSON camelCase auth-header aliases, AWS SigV4 and Akamai-style signature parameters, assigned exact token/code/state fields, assigned and bare whitespace-only snake_case/kebab-case/camelCase OAuth/token fields, unquoted multi-word and repeated-whitespace secret fields, certificate passphrases, generic credential fields, sensitive object keys, unescaped JSON/annotated/class-style and parenthesized util-inspect URL/header/metadata array/object aliases with whitespace/colon/equals separators, structured header/metadata key/name pairs with sensitive value/raw/currentValue/schema fields, object/array request/response assignments, bare, assigned, escaped, double-escaped, and nested-JSON including escaped newline/quote/backslash camelCase/snake_case/kebab-case body/bodyPreview/data/responseText/text/variables/rendered-response aliases, cookies, JWTs including JWT-shaped URL path/query/fragment values, private keys, UNC/extended UNC/Windows device/Windows/macOS/POSIX local paths including file:// URLs, JSON-escaped slash URLs, JSON-escaped POSIX paths, file URLs, mixed path/URL chains, URL credentials across supported and custom URL schemes, OAuth provider/progress error URL and path references, OAuth callback code/state params and token fragments, URL-encoded free-text OAuth/token parameter strings, bare DNS/IP/localhost endpoints, secret query/fragment/path params including path label/value and inline same-segment forms with encoded slashes, routed fragment path forms, single- and multi-encoded delimiter forms including recursively nested encoded wrapper params and structured key/value/raw/currentValue/example/schema-default arrays, source/UI/packaged smoke failure output, source/packaged sandbox validation child output, and IPC/export failure messages and diagnostic event type/outcome/failure-code metadata including compact/delimiter-free token/code/state labels and one-letter token aliases plus secret-shaped IPC/export error names and codes are still redacted. Native workspace imports and exports omit these local diagnostics settings, and diagnostic export waits for queued privacy-setting saves before opening the local save dialog.

## Release Gates

Run these before making security or production-readiness claims:

```bash
npm run check
npm run release:gate
npm run production:readiness:validate
npm run postman:parity:claim
npm run sandbox:platform:validate
```

`npm run production:readiness:claim` is the stable-release gate and remains expected to fail until every release-blocking row is validated, including native release evidence, UX/accessibility evidence, and any rows still marked implemented rather than validated. Beta and release-candidate thresholds are exposed separately by `npm run production:readiness:claim:beta` and `npm run production:readiness:claim:rc`. `npm run sandbox:platform:claim` is the separate platform OS-sandbox gate and should pass when the Linux, Windows, and macOS backend matrix is current.

Repository-level branch, tag, environment, secret-scanning, push-protection, Dependabot, and release controls are tracked in `docs/RELEASE_SECURITY.md`. `npm run release:governance:validate` verifies the checklist exists, but maintainers must still confirm the corresponding GitHub organization and repository settings.

## Reporting

Report vulnerabilities privately to `support@qrksw.com`. Avoid including live tokens, vault values, private keys, or proprietary request bodies in reports.
