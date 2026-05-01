# Security

PostMeter is a standalone local desktop app. It does not require a PostMeter account, cloud login, or telemetry service for core use.

## Trust Boundaries

- Renderer: loaded through the secure standard `postmeter-app://bundle` protocol instead of `file://`, no Node integration, context isolation enabled, renderer sandbox enabled, explicit main-frame-only preload API, restrictive CSP in both the HTML and protocol response, and `nosniff`/`no-referrer` protocol headers. Renderer-controlled top-level navigation away from the exact initial packaged renderer URL, `window.open`, `<webview>` attachment, and Electron permission checks/requests are denied in the main window.
- Electron main process: owns desktop lifecycle, the allowlisted app-content protocol handler, fail-closed trusted main-frame renderer IPC sender validation with app-protocol path and query-key checks, IPC payload validation, dialogs, workspace persistence, vault storage, OAuth flows, constrained credential-free external browser launches, package review/fetch, and native OS integration.
- Core script runtime: runs request scripts outside the main process with hardened VM values, bounded resources, Node permission flags where supported, and brokered privileged APIs.

## Script Sandbox

Scripts must not receive direct access to the host filesystem, process environment, child processes, shell, Electron APIs, renderer DOM, native modules, or raw sockets. Postman-compatible APIs such as `pm.sendRequest`, cookie helpers, package loading, visualizers, vault access, GraphQL hooks, and gRPC hooks are implemented through parent-owned brokers and validators.

Linux script workers use `bubblewrap` plus a dangerous-syscall seccomp policy when available or required. Windows script workers use the release-owned AppContainer helper, and macOS script workers use a seatbelt `sandbox-exec` profile. Platform-equivalent OS sandbox coverage is tracked separately in `docs/os-sandbox-platform-matrix.json` and must stay backed by native runner source and packaged validation evidence.

## Vault And Secrets

Vault values are stored outside workspace JSON in per-workspace encrypted files when Electron `safeStorage` has OS-backed encryption. The renderer and scripts never receive vault file paths, encryption keys, ciphertext, storage handles, or secret enumeration through the prompt flow. The renderer vault prompt only receives bounded metadata: request name/id, collection name/id, workspace name/id, operation, and secret key name. Concurrent prompt requests are queued so each decision is applied to the matching prompt and workspace, and prompt responses are accepted only from the renderer `webContents` that received the prompt.

OAuth provider error text is redacted before display when it contains token-shaped fields, generic token/secret/cookie fields, authorization codes, device/user codes, PKCE verifiers, client secrets, Authorization/Proxy-Authorization header-shaped values, or common auth-header aliases, and token endpoint redirects are refused before response-body parsing so token POST bodies are not forwarded to redirect targets. OAuth access tokens, refresh tokens, and client secrets are still ordinary visible auth fields persisted in workspace JSON and collection exports; do not include live workspace files in bug reports or certification evidence unless those fields are scrubbed.

Diagnostics and logs must not include secrets, tokens, vault values, auth headers, cookies, request/response bodies, or sensitive local paths by default.

## Release Gates

Run these before making security or production-readiness claims:

```bash
npm run check
npm run release:gate
npm run production:readiness:validate
npm run postman:parity:claim
npm run sandbox:platform:validate
```

`npm run production:readiness:claim` is the stable-release gate and remains expected to fail until every release-blocking row is validated, including live OAuth certification, diagnostics/privacy, native release evidence, and signing/notarization. Beta and release-candidate thresholds are exposed separately by `npm run production:readiness:claim:beta` and `npm run production:readiness:claim:rc`. `npm run sandbox:platform:claim` is the separate platform OS-sandbox gate and should pass when the Linux, Windows, and macOS backend matrix is current.

## Reporting

Report vulnerabilities privately to `support@qrksw.com`. Avoid including live tokens, vault values, private keys, or proprietary request bodies in reports.
