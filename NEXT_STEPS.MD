# PostMeter Next Steps

Use this document as the active backlog and production-readiness tracker after the product/reference docs have answered the implementation questions.

## Open Questions Before Further Generation

No blocking engineering questions are required for the next local production-hardening pass. Continue assuming:

- PostMeter remains a standalone local desktop app with no PostMeter user account creation, app login, required cloud sign-in, or account gate.
- OAuth is only outbound request authentication for target APIs.
- When choosing between partial and production-ready implementations, build the production-ready path.
- Tier-one release validation targets Linux, Windows, and macOS together.
- Compatibility import/export includes OpenAPI, curl, HAR, and Postman collections.
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

## Recently Completed

- Moved runners into a dedicated workspace-owned section.
  - The left sidebar now includes `Runners` between `Workspaces` and `History`; the request result-panel Runner tab has been removed.
  - Workspaces persist first-class `workspace.runners` data under schema 12, with runner-owned request copies, selected environment IDs, stop-on-failure, and environment-mutation policy.
  - Runner tabs participate in the same open-tab, dirty-close, force-close, 128-tab-limit, and session restore model as requests, environments, and workspaces.
  - Runners can be created from `New` > `Runner` or the empty Runners pane, runner requests can be added as local copies or imported from expandable collection/request selections, and Shift+click/Ctrl+click can import multiple selections.
  - Runner-owned requests open in normal request editor tabs through row `Edit`, save only that runner request copy, and can be reordered/deleted without mutating source collection requests.
  - Runner execution results now use a split status/detail pane while keeping the request list scrollable independently.
  - Runner execution now accepts runner payloads directly, preserves runner-local request order/IDs, supports the existing script/assertion/cookie/vault/package lifecycle, and only writes environment mutations back when `allowEnvironmentMutation` is enabled.
  - Tests cover runner model normalization, migration, IPC validation/runtime mutation policy, session persistence, tab cap enforcement, dirty runner tab save/discard failure paths, and first-class renderer wiring.
- Refined desktop tab and sidebar interactions.
  - Request, environment, and workspace names are inline-editable; request/environment title edits save on Enter and stay dirty on blur, while workspace title edits save automatically.
  - Pane-local save actions replaced the old top-toolbar Save button for requests and environments, and workspace settings continue through targeted settings saves.
  - Open tabs shrink before scrolling, expose hover/active close buttons, support tab right-click close/force-close actions, and enforce the 128-tab cap across requests, environments, workspaces, and runners.
  - Sidebar collections, folders, requests, environments, workspaces, and runners are draggable; structural drag/drop saves only the membership/order change and leaves dirty editor drafts dirty.
  - Drag placement feedback is a single highlighted insertion bar per gap.
  - The History sidebar tab has a `Clear History` context action with an irreversible-action confirmation.

## Highest Priority Steps

1. Design and implement the new Performance section from a clean PostMeter-owned model.
   - Rename the planned load-testing work to `Performance` throughout the product surface. The left sidebar should add `Performance` between `Runners` and `History`, and the main tab strip should support saved performance-test tabs using the same dirty-state, close, force-close, session-restore, and 128-tab-limit behavior as requests, environments, workspaces, and runners.
   - Replace the old request result-panel Load Test concept with a first-class Performance pane. Clicking the sidebar `Performance` section with no active performance test selected should show an empty-state pane with the PostMeter mark, `CREATE A PERFORMANCE TEST`, and a `New Performance Test` button. The top toolbar `New` dropdown should also include `Performance Test`.
   - Define and migrate the saved data model before building UI controls. A performance test should be workspace-owned, have a stable ID, name, type, request configuration, optional source metadata, selected environment ID, environment mutation policy, execution policy, safety limits, result history, and export metadata. It must persist independently from collections and runners.
   - Support two request-entry paths. Users can import a request from Collections, or they can manually enter request details directly in the Performance pane without importing anything. Imported requests must be deep-copied into the performance test; editing headers, auth, body, scripts, variables, examples, cookies, or URL/method inside Performance must never mutate the source collection request.
   - Add a Performance request editor surface that reuses the mature request editor controls where practical, but stores changes only in the performance-test request copy. Saving a performance test should save the test configuration and its request copy only; it should not save or clear dirty collection request tabs.
   - Add an `Import Request` flow for Performance that opens an expandable collection/request picker. It should show collections first, expand requests on collection click, support selecting a single request for V1, and be designed so multi-select can be added later without changing the data model. Include clear copy that imported requests become independent performance-test copies.
   - Implement first-class saved performance tests in the sidebar list. Users should be able to create, rename, duplicate, delete, reorder, open, close, and save performance tests. Reordering should save only the performance-test ordering, not dirty edits inside an open performance-test tab.
   - Define the seven V1 performance test types as explicit modes, not as one overloaded advanced form:
     - `Latency`: light-load measurement of p50/p90/p95/p99, min/max, error rate, and baseline response size.
     - `RPS / throughput`: target or discover sustainable requests per second, achieved RPS, latency at target, and failures.
     - `Concurrency`: fixed virtual-user count, latency/error rate by virtual users, and per-user progress.
     - `Stress`: stepped or adaptive pressure until saturation/breaking point, with the first failing threshold captured.
     - `Spike`: sudden jump and recovery profile, including peak errors, recovery time, and post-spike stability.
     - `Soak`: long-duration steady load, latency drift, error drift, memory-like degradation signals, and rolling windows.
     - `Ramp`: gradual load increase with threshold markers where latency or errors rise.
   - For each test type, design a compact mode-specific configuration panel with strong defaults, validation, and tooltips. Shared controls should include duration, warm-up, request timeout, max requests, concurrency caps, target RPS where applicable, stop conditions, retry policy, cookie behavior, redirect behavior, TLS/proxy behavior, and result-retention policy.
   - Define environment handling explicitly. Performance tests should select an environment independently from the active global environment. Add an `Allow performance test to modify environment` setting. When disabled, scripts can mutate a temporary environment copy for the duration of the run, but the saved environment must remain unchanged.
   - Decide script behavior deliberately. Pre-request and post-request scripts should run through the existing sandbox lifecycle, with clear policy for per-iteration execution, shared variables between iterations, temporary environment mutation, vault prompts, package review/fetch, diagnostics, cancellation, and script failures. Do not silently inherit runner behavior without tests documenting the contract.
   - Build a new execution engine rather than reviving the removed Load Test runner. The engine should own scheduling, pacing, virtual-user state, cancellation, backpressure, result aggregation, streaming progress events, memory limits, and bounded result samples. It should use the existing brokered HTTP sender and script lifecycle where appropriate.
   - Keep local safety limits mandatory. Cap concurrent workers, in-flight requests, result sample storage, response-body capture, console output, visualizer output, diagnostics payloads, export size, and run duration. Oversized or unsafe configurations should fail validation before execution.
   - Design result panes before implementation. Results should expose a run summary, timeline, distribution chart/table, status-code/error breakdown, per-phase details, sampled requests/responses, script assertion output, and raw export preview. Each test type should highlight its core output without hiding shared diagnostics.
   - Add import/export for performance tests. Native PostMeter performance-test export should preserve the full saved configuration and request copy. Collection/request exports should remain separate from performance-test exports. Import should validate schema/version, reject malformed or unsafe payloads, and never merge imported performance-test request copies into Collections unless the user explicitly creates a collection request later.
   - Update workspace schemas and migrations. Add performance tests to default workspaces, normalize old/malformed performance-test payloads, preserve unknown future schema failure behavior, and make native workspace import/export round-trip performance tests without leaking local secrets or vault state.
   - Update IPC and preload surfaces with dedicated performance channels. Validate payloads with shared schemas, sanitize errors, keep renderer APIs least-privilege, and include source-owned matrix rows for new channels where required.
   - Update documentation and release matrices. `README.md`, `docs/TECH_SPECS.md`, `docs/ARCHITECTURE.md`, `docs/COMPATIBILITY.md`, `docs/RELEASE_READINESS.md`, diagnostics/privacy docs, UX/accessibility matrix, workspace durability matrix, Electron security matrix, and production readiness matrix should describe Performance accurately without overclaiming distributed/cloud load execution.
   - Add rigorous test coverage before considering the feature complete. Cover model normalization, workspace migration, import/export round trips, request-copy isolation from Collections, manual request entry, environment copy-vs-mutate behavior, script lifecycle, cancellation, validation failures, result aggregation, safety caps, IPC schema rejection, diagnostics redaction, UI empty state, toolbar creation, sidebar ordering, dirty-tab save/discard, and one positive/negative scenario for each of the seven performance test types.

2. Prepare public beta/release candidate documentation.
   - Add or update `docs/SECURITY.md`, privacy notes, threat model summary, install/uninstall docs, unsigned artifact warnings, known limitations, compatibility matrix links, OAuth certification docs, diagnostics docs, and support channels.
   - Create a release checklist with separate beta, release-candidate, and stable sections. Each section must name required commands, native GitHub Actions runner jobs, artifact validations, OAuth certification status, signing/notarization status, docs checks, and known waivers.
   - Add a Mac manual QA checklist for the later maintainer-owned Mac pass. Until then, `macos-latest` GitHub Actions validation is the required pre-production evidence, not a substitute for final manual production signoff.
   - Add an optional Windows manual QA checklist for the maintainer's Windows machine, while keeping `windows-latest` GitHub Actions validation as the required pre-production evidence.
   - Make release notes templates call out security-sensitive changes, sandbox changes, compatibility changes, migration notes, signing/notarization status, native-runner validation results, and known issues.
   - Document the unsigned-release path and the signed/notarized-release path separately. Signing and notarization stay blocked until maintainer-controlled certificates are available.
   - Ensure public docs do not overclaim: Postman script parity is claim-gated for the tracked target, platform OS sandbox coverage is tracked separately, the legacy Load Test implementation has been removed pending the V1 Performance redesign, and JMeter import/export/execution is not supported.

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

- Distributed/cloud load execution remains deferred until there is explicit product demand.
- Team collaboration and shared remote workspaces.
- Plugin system for custom auth, assertions, importers, reporters, and scripting extensions.
- True auto-download/auto-install updates beyond opening GitHub Releases.
- Advanced local automation / unsafe script mode is deferred and should not be part of the v1.0.0 release scope. If revisited later, consider a plugin system or settings panel that can grant selected local capabilities or disable sandboxing entirely for users who intentionally want scripts to modify local files. The maintainer has not chosen between those two models yet; any future design must treat this as dangerous, off by default, and visibly separate from the default safe sandbox.
- Direct first-party Postman account/provider integration for fetching team Package Library `@team/package` sources remains deferred. The current reviewed HTTPS source-URL workflow stays the supported path until a future provider-specific auth/import contract is approved.
- Maintainer-provided real-world Postman collection corpora remain deferred until a sanitized folder of collections is available. When provided, add them as compatibility fixtures or external report inputs without copying third-party copyrighted content blindly.
- A stricter Linux deny-by-default seccomp-BPF allowlist is optional future hardening. The maintainer has accepted the current Linux `bubblewrap` namespace isolation plus dangerous-syscall seccomp policy for the current public Linux OS-sandbox claim.

## Risks / Gaps Blocking Production Readiness

- Native Windows/macOS packaged OS-sandbox assertions are wired into CI/release evidence paths. gRPC PFX/P12 client-certificate extraction, Postman-style per-request vault prompts, and checked-in `newman@6.2.2` JSON evidence reports are implemented locally and covered by focused validation.
- Live OAuth provider tooling is implemented and mocked certification passes locally, but live Google, Microsoft Entra ID / Azure AD, and GitHub tenant evidence is not captured yet.
- Automated Electron UI coverage is broader and includes screenshot, mocked OAuth, and XML/HTML formatting smokes, but it is still Linux/headless focused and not broad cross-platform UI automation.
- Custom URI-scheme OAuth redirects are implemented and mocked; Linux deb/AppImage desktop-entry registration, macOS zip app-bundle metadata, Windows/macOS protocol validators, and native-runner validation jobs are wired. The remaining requirement is executing and monitoring those GitHub Actions jobs for release evidence.
- IPC validation uses shared schema metadata for common fields, update/external payloads, file-operation results, OAuth progress, runner config/progress, and result payloads, but some complex validators are still partly handwritten rather than fully generated.
- Signing/notarization remains incomplete; unsigned GitHub Release artifact publishing is configured.
- In-app update checks can open GitHub Releases, but PostMeter does not yet auto-download or auto-install updates.
- The legacy Load Test implementation is removed; the new seven-type V1 Performance model still needs implementation.

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
