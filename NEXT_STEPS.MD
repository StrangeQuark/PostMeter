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

## Recently Completed

- Moved runners into a dedicated workspace-owned section.
  - The left sidebar now includes `Runners` between `Workspaces` and `History`; the request result-panel Runner tab has been removed.
  - Workspaces persist first-class `workspace.runners` data under the current workspace schema, with runner-owned request copies, selected environment IDs, stop-on-failure, and environment-mutation policy.
  - Runner tabs participate in the same open-tab, dirty-close, force-close, 128-tab-limit, and session restore model as requests, environments, and workspaces.
  - Runners can be created from `New` > `Runner` or the empty Runners pane, runner requests can be added as local copies or imported from expandable collection/request selections, and Shift+click/Ctrl+click can import multiple selections.
  - Runner-owned requests open in normal request editor tabs through row `Edit`, save only that runner request copy, and can be reordered/deleted without mutating source collection requests.
  - Runner execution results now use a split status/detail pane while keeping the request list scrollable independently.
  - Runner execution now accepts runner payloads directly, preserves runner-local request order/IDs, supports the existing script/assertion/cookie/vault/package lifecycle, and only writes environment mutations back when `allowEnvironmentMutation` is enabled.
  - Tests cover runner model normalization, migration, IPC validation/runtime mutation policy, session persistence, tab cap enforcement, dirty runner tab save/discard failure paths, and first-class renderer wiring.
- Refined desktop tab and sidebar interactions.
  - Request, environment, and workspace names are inline-editable; request/environment title edits save on Enter and stay dirty on blur, while workspace title edits save automatically.
  - Pane-local save actions replaced the old top-toolbar Save button for requests and environments, and workspace settings continue through targeted settings saves.
  - Open tabs shrink before scrolling, expose hover/active close buttons, support tab right-click close/force-close actions, and enforce the 128-tab cap across requests, environments, workspaces, runners, and performance tests.
  - Sidebar collections, folders, requests, environments, workspaces, runners, and performance tests are draggable; structural drag/drop saves only the membership/order change and leaves dirty editor drafts dirty.
  - Drag placement feedback is a single highlighted insertion bar per gap.
  - The History sidebar tab has a `Clear History` context action with an irreversible-action confirmation.
- Implemented the local Performance section.
  - `Performance` now lives between `Runners` and `History`, persists workspace-owned `workspace.performanceTests` under schema 13, and uses dirty-aware tabs, session restore, close/force-close behavior, and the 128-tab cap.
  - Users can create Performance tests from `New` or the empty Performance pane, import/export native Performance test files, import deep-copied collection requests, manually enter request details, choose an environment, configure safety limits, run/cancel tests, and review bounded result summaries.
  - The seven V1 local types are `Latency`, `RPS / throughput`, `Concurrency`, `Stress`, `Spike`, `Soak`, and `Ramp`.
  - Tests cover model normalization, import/export validation, request-copy isolation, environment copy-vs-mutate behavior, safety-cap rejection, cancellation, IPC progress/mutation behavior, renderer wiring, sidebar ordering, and tab-limit behavior.
- Implemented GraphQL body editing and execution.
  - Request, runner-owned request, and Performance request editors now expose a GraphQL body mode with query, variables, and operation-name fields.
  - GraphQL bodies persist/export as Postman-compatible `postmanBody.mode = "graphql"` metadata, execute as `application/json`, and support environment substitution in query, variables, and operation name.
  - Focused HTTP, import/export, Performance, bootstrap, and UI smoke coverage now exercises GraphQL editing, execution materialization, and round-tripping.
- Added the first Settings surface.
  - The main toolbar now exposes `File` > `Settings`, and the native app File menu includes `Settings...`.
  - The old top-toolbar theme segmented control moved into Settings > Appearance.
  - Tab force-close behavior, prerelease update checks, script sandbox capabilities, vault/package/file binding controls, and diagnostics/privacy controls now live in categorized Settings panes instead of crowding workspace details.
  - Settings > Modals now controls whether clicking outside a modal closes it. The default remains disabled, so users must use explicit modal actions such as `Close`, `Cancel`, or confirmation buttons unless they opt in.

## Highest Priority Steps

1. Expand Settings into the full Preferences system.
   - Decide which values should remain workspace-scoped and which should move into a durable app-wide preferences model.
   - Continue centralizing desktop behavior, editor, import/export, Performance, and privacy/diagnostics preferences here instead of adding one-off controls throughout the app.
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
- The legacy Load Test implementation is removed; the seven-type local V1 Performance model is implemented and should continue receiving result-presentation and real-world workload hardening.

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
