# PostMeter Next Steps

Use this document as the active backlog and production-readiness tracker after the product/reference docs have answered the implementation questions.

## Open Questions Before Further Generation

No blocking engineering questions are required for the next local production-hardening pass. Continue assuming:

- PostMeter remains a standalone local desktop app with no PostMeter user account creation, app login, required cloud sign-in, or account gate.
- OAuth is only outbound request authentication for target APIs.
- When choosing between partial and production-ready implementations, build the production-ready path.
- Tier-one release validation targets Linux, Windows, and macOS together.
- Compatibility import/export includes OpenAPI, curl, and Postman collections.
- Production release artifacts stay unsigned until maintainer certificates are available.
- Production release hosting uses GitHub Releases.
- The canonical public release/update repository is `StrangeQuark/PostMeter`.
- The project remains GPL-3.0-only.
- Publisher/developer name is `StrangeQuark`.
- Public support email is `support@qrksw.com`.
- The current production app icon source is `build/icon.png`.
- Manual OAuth provider certification targets are Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth Apps.
- Windows/macOS packaged protocol validation should be CI-only native-runner validation, not a maintainer manual checklist.
- The legacy Load Test panel and JMeter bridge have been removed so the new Performance implementation can start from a clean PostMeter-owned model.

Helpful, non-blocking input:

1. Provide live OAuth provider tenant/client details only when you are ready for manual certification runs.
2. Provide signing/notarization credentials only when you want release artifacts to become signed instead of unsigned GitHub Release builds.

## Standing Product Constraint

PostMeter must remain a standalone local desktop application. Do not add PostMeter user account creation, app login, required cloud sign-in, or any account gate for core usage. OAuth work is strictly for authenticating outbound API requests, not for authenticating users into PostMeter.

## Highest Priority Steps

1. Expand automated test coverage and UI snapshot coverage.
   - Treat this as a dedicated test-upgrade pass before the next release-hardening tranche.
   - Expand `npm run test:ui:snapshot` beyond the current smoke snapshots to cover more first-class panes and modal states, including Docs, Variables, Environments, runner request editing, Performance request/results, import/export modals, settings categories, and constrained-size/theme variants.
   - Decide whether snapshot coverage should remain smoke-only or graduate selected states to golden-image visual regression with reviewed baseline images and intentional-update workflow.
   - Broaden renderer/UI workflow and regression tests around recently changed surfaces: tab context actions, Docs persistence, Scripts assertions behavior, runner/performance request exports, environment variable precedence, and failure-reporting panels.
   - Audit the wider Electron/unit suite for stale feature assumptions, missing negative cases, and missing cross-surface coverage before adding new product features.
2. Prepare public beta/release candidate documentation.
   - Add or update `docs/SECURITY.md`, privacy notes, threat model summary, install/uninstall docs, unsigned artifact warnings, known limitations, compatibility matrix links, OAuth certification docs, diagnostics docs, and support channels.
   - Create a release checklist with separate beta, release-candidate, and stable sections. Each section must name required commands, native GitHub Actions runner jobs, artifact validations, OAuth certification status, signing/notarization status, docs checks, and known waivers.
   - Add a Mac manual QA checklist for the later maintainer-owned Mac pass. Until then, `macos-latest` GitHub Actions validation is the required pre-production evidence, not a substitute for final manual production signoff.
   - Add an optional Windows manual QA checklist for the maintainer's Windows machine, while keeping `windows-latest` GitHub Actions validation as the required pre-production evidence.
   - Make release notes templates call out security-sensitive changes, sandbox changes, compatibility changes, migration notes, signing/notarization status, native-runner validation results, and known issues.
   - Document the unsigned-release path and the signed/notarized-release path separately. Signing and notarization stay blocked until maintainer-controlled certificates are available.
   - Ensure public docs do not overclaim: Postman script parity is claim-gated for the tracked target, platform OS sandbox coverage is tracked separately, local Performance remains desktop-bounded, and JMeter import/export/execution is not supported.
3. Add native Windows curl export support.
   - Keep the current shell-oriented curl export for Linux/macOS, but add Windows-native curl serialization for collection exports.
   - Generate `.bat` output on Windows with `cmd.exe`-safe quoting, escaped special characters, line continuations, and explicit `curl.exe` usage where needed to avoid PowerShell aliases.
   - Consider a PowerShell-friendly copy/export mode so Windows users can paste generated commands directly into `cmd.exe` or PowerShell without Git Bash/WSL.
   - Add cross-platform tests covering Linux/macOS shell output and Windows batch output for URLs, headers, auth, bodies, environment placeholders, file paths, and special characters.
   - Update export docs/tooltips to describe platform-specific curl output and avoid implying Bash-style scripts are native Windows scripts.

## Blocked External Validation

These are production-readiness items that cannot be fully proven by local Linux iteration alone. Implement GitHub Actions native runner validation wherever possible now; keep only credential-dependent or final manual signoff items outside the local burn-down list.

1. Execute and monitor native release validation in CI.
   - Use GitHub Actions `windows-latest` and `macos-latest` runners for required pre-production validation of packaged launch, protocol handlers, workspace paths, native OS sandbox launchers, and packaged script-worker behavior.
   - Fix any runner-specific installer, permissions, quarantine, mount, AppContainer, seatbelt, registry, or Launch Services issues discovered by CI.
   - Native validation package scripts must continue to pass `--publish never`; release publication belongs only to the tag release workflow after combined metadata validation.
   - Linux GitHub-hosted Electron app-launch smoke may keep `POSTMETER_CI_ELECTRON_NO_SANDBOX=1` because the runner cannot configure Chromium's setuid helper. Do not treat that app-shell waiver as proof of production Chromium sandbox coverage; it is separate from script sandbox validation.
   - Linux deb/AppImage validation can continue locally and in CI through `release:validate`. Treat GitHub-hosted Linux `bubblewrap` as best-effort OS-sandbox evidence only: the workflow now probes the backend and uses an explicit CI waiver when hosted runners deny the network namespace setup needed by the full Linux OS sandbox. Before production signoff, run `npm run sandbox:validate` without that waiver on a Linux host where `bubblewrap` can launch the full namespace/seccomp sandbox.
   - Manual Windows QA is optional because the maintainer has a Windows machine. Manual Mac QA remains a final production-release signoff item once the maintainer obtains a Mac; CI macOS runner evidence is the interim pre-production validation path.

2. Execute outbound OAuth provider certification.
   - Requires live Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth App test clients/tenants.
   - Tooling is ready: run `npm run oauth:certify:validate`, `npm run oauth:certify:mock`, and then `POSTMETER_LIVE_OAUTH_CERTIFICATION=1 POSTMETER_LIVE_OAUTH_EVIDENCE_FILE=validation-artifacts/oauth-provider-certification/live-evidence.json npm run oauth:certify:live -- --provider all` with maintainer-owned env vars, official-provider OAuth endpoint URLs, sanitized evidence, and checksum-verified repository-relative evidence artifacts under `validation-artifacts/oauth-provider-certification/`.
   - Capture provider-specific redirect URI, PKCE, device-code, refresh-token, and client-credentials behavior without adding any PostMeter account login system.
   - Add provider notes or test fixtures for any provider-specific token response differences discovered.

3. Add release signing/notarization when maintainer-controlled certificates exist.
   - Linux signing, Windows Authenticode signing, and macOS Developer ID signing/notarization remain intentionally disabled until credentials are available.
   - Unsigned GitHub Release artifacts remain the supported release path until then.

## Deferred / Larger Follow-Ups

- Implement a real local Load Engine for PostMeter's flagship Performance feature.
  - Goal: replace the current single-main-process hot loop for high-volume safe Performance runs so 100k-1m request tests do not freeze the UI/main process, do not build unbounded JS heap pressure, and can produce trustworthy UAT evidence.
  - Scope first: Performance Tests. Keep Runners sequential by default because request order, `setNextRequest`, CSV row sequencing, cookie propagation, stop-on-failure, and environment mutation are part of the runner contract. Add any runner parallelism only as an explicit opt-in mode with clear compatibility constraints and a visible fallback to sequential execution.
  - HTTP-family support must include both `http://` and `https://` URL schemes. Treat `request.protocol = "http"` as the PostMeter request family, not as a cleartext-only scheme. Do not accidentally exclude HTTPS endpoints from worker execution.
  - Architecture: main process validates the run, plans stages, coordinates worker processes, owns cancellation, coalesces progress, aggregates exact summary metrics, and remains the only SQLite writer. Child worker processes execute the hot request loops and send batched samples/progress back over IPC.
  - Worker model: shard each Performance stage across worker processes, give each worker a bounded local concurrency share, create per-worker keep-alive `http.Agent`/`https.Agent` instances, cap sockets to the worker concurrency, and abort in-flight requests on cancellation before escalating to process termination.
  - Result storage: keep one reusable temp SQLite result store per app session. Do not store run history. Each new run can overwrite the temp store, and PostMeter should delete the store and SQLite sidecar files on shutdown. CSV/JSON exports should stream from SQLite only when requested.
  - IPC and memory: send result batches, not one IPC message per request. Avoid retaining per-request samples in memory when a store-backed run is active. Keep response capture policy enforcement before samples leave workers so large response bodies, script output, headers, and local variables do not cross IPC when disabled.
  - Compatibility fallback: use the load engine only for safe local HTTP-family Performance requests. Fall back to the existing compatibility path for request scripts, CSV variables, environment mutation, response-cookie mutation, non-HTTP-family protocols, custom transports, gRPC/WebSocket/Socket.IO, and any request feature whose ordered semantics are not proven in workers.
  - Metrics to capture: exact completed/success/failed counts, status-code distribution, error distribution, latency min/avg/p50/p90/p95/p99/max, achieved RPS, active request high-water mark, request timeout counts, worker event-loop delay, worker scheduler lag, worker RSS/heap, main-process summary timing, and a `clientSaturated` signal when local execution is likely under-reporting endpoint capacity.
  - Safety and caps: raise the Performance concurrency cap to a reasonable local maximum after the load engine is in place. A target around 250 effective concurrent users is reasonable for local desktop execution, but the UI should still explain that endpoint accuracy depends on local CPU/network capacity and calibration. Keep the 1,000,000 planned-request cap unless a later calibration and storage pass proves a higher cap is safe.
  - Pre-run safeguards: estimate result-store size from planned requests, capture settings, and request metadata. Warn when the estimate is within 1 GB of free disk space, and block continuation when the estimate exceeds available space. Keep high-volume capture guardrails, including forced opt-out of large detail fields at the configured threshold.
  - Cancellation and failure behavior: cancellation must stop scheduling new work, abort active worker requests, flush already completed samples, commit/fail the result store deterministically, and return a clear cancelled result. Worker crashes should not hang the run; they should mark the run failed with diagnostic detail.
  - Testing required before shipping: unit tests for planning, sharding, worker-count selection, fallback eligibility, cancellation, timeout behavior, result indexes, capture policy enforcement, and summary aggregation; runtime IPC tests proving SQLite-backed paging/detail/export; renderer/E2E tests proving high-concurrency Performance execution stays responsive and reports progress; live endpoint tests should be opt-in or carefully bounded, with any CI live test using a stable public endpoint only for small diagnostic coverage.
  - Manual stress validation: run owned endpoint tests at 100k, 200k, 500k, and 1m requests with concurrency near the new cap; watch CPU, RSS, disk growth, result-store size, progress cadence, cancellation responsiveness, and export correctness. Preserve logs/evidence for regressions.
  - Documentation updates needed: README feature summary, architecture docs, tech specs, compatibility notes, release-readiness matrix, and user-facing Performance docs/tooltips explaining local load limits, HTTPS support, worker fallback behavior, capture settings, result storage, and CSV export.
- Format large integer inputs with comma separators in Runner and Performance panes. Native `type="number"` inputs do not display `1,000,000`, so this likely needs comma-aware text inputs plus shared parse/clamp helpers that preserve the existing 1m request caps and cross-field max-request validation.
- Direct first-party Postman account/provider integration for fetching team Package Library `@team/package` sources remains deferred. The current reviewed HTTPS source-URL workflow stays the supported path until a future provider-specific auth/import contract is approved.
- User-imported custom fonts for Settings > Appearance remain deferred. If revisited later, support importing and deleting local `.ttf`, `.otf`, `.woff`, and `.woff2` fonts from an app-controlled local font store, expose them in both Interface Text and Editor Text selectors, reset affected selections when a custom font is deleted, avoid storing raw local paths in exported workspace files, and add E2E coverage for import, selection, deletion, persistence, invalid files, and privacy behavior.

## Risks / Gaps Blocking Production Readiness

- IPC validation uses shared schema metadata for common fields, update/external payloads, file-operation results, OAuth progress, runner config/progress, and result payloads, but some complex validators are still partly handwritten rather than fully generated.
- Signing/notarization remains incomplete; unsigned GitHub Release artifact publishing is configured.

## Next Iteration Starting Point

Run the current verification baseline first:

```bash
npm run check
npm run sandbox:validate
npm run sandbox:platform:validate
npm run postman:parity:validate
npm run postman:docs:validate
npm run release:gate
npm run postman:parity:diff
npm run pack:linux
npm run dist:linux
npm run release:prepare
POSTMETER_RELEASE_REQUIRED_TYPES=appimage,deb npm run release:validate
```

For the full Postman script compatibility claim report, run:

```bash
npm run postman:parity:claim
npm run postman:docs:live
npm run sandbox:platform:claim
```

`npm run postman:parity:claim`, `npm run postman:docs:live`, and `npm run sandbox:platform:claim` are expected to pass for the tracked default Postman import profile and current platform OS-sandbox matrix.

Then inspect the worktree:

```bash
git status --short
```
