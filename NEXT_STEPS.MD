# PostMeter Next Steps

Use this document as the active backlog and production-readiness tracker after the product/reference docs have answered the implementation questions.

## Open Questions Before Further Generation

No blocking engineering questions are required for the next local production-hardening pass. Continue assuming:

- PostMeter remains a standalone local desktop app with no PostMeter user account creation, app login, required cloud sign-in, or account gate.
- OAuth is only outbound request authentication for target APIs.
- When choosing between partial and production-ready implementations, build the production-ready path.
- Tier-one release validation targets Linux, Windows, and macOS together.
- Compatibility import/export includes OpenAPI, JMeter, curl, HAR, and Postman collections.
- Production release artifacts stay unsigned until maintainer certificates are available.
- Production release hosting uses GitHub Releases.
- The canonical public release/update repository is `StrangeQuark/PostMeter`.
- The project remains GPL-3.0-only.
- Publisher/developer name is `StrangeQuark`.
- Public support email is `support@qrksw.com`.
- The current production app icon source is `build/icon.png`.
- Manual OAuth provider certification targets are Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth Apps.
- Windows/macOS packaged protocol validation should be CI-only native-runner validation, not a maintainer manual checklist.
- JMeter compatibility work should prioritize timers and assertion types.
- Load-test governance should stay in the Load Test panel with global rate caps; workspace-level, request-level, allowed-host, and per-host policies are intentionally removed.

Helpful, non-blocking input:

1. Provide any real-world JMeter timer/assertion-heavy `.jmx` files you want PostMeter to prioritize for import/export parity.
2. Provide live OAuth provider tenant/client details only when you are ready for manual certification runs.
3. Provide signing/notarization credentials only when you want release artifacts to become signed instead of unsigned GitHub Release builds.

## Standing Product Constraint

PostMeter must remain a standalone local desktop application. Do not add PostMeter user account creation, app login, required cloud sign-in, or any account gate for core usage. OAuth work is strictly for authenticating outbound API requests, not for authenticating users into PostMeter.

## Highest Priority Steps

1. Prepare public beta/release candidate documentation.
   - Add or update `docs/SECURITY.md`, privacy notes, threat model summary, install/uninstall docs, unsigned artifact warnings, known limitations, compatibility matrix links, OAuth certification docs, diagnostics docs, and support channels.
   - Create a release checklist with separate beta, release-candidate, and stable sections. Each section must name required commands, native GitHub Actions runner jobs, artifact validations, OAuth certification status, signing/notarization status, docs checks, and known waivers.
   - Add a Mac manual QA checklist for the later maintainer-owned Mac pass. Until then, `macos-latest` GitHub Actions validation is the required pre-production evidence, not a substitute for final manual production signoff.
   - Add an optional Windows manual QA checklist for the maintainer's Windows machine, while keeping `windows-latest` GitHub Actions validation as the required pre-production evidence.
   - Make release notes templates call out security-sensitive changes, sandbox changes, compatibility changes, migration notes, signing/notarization status, native-runner validation results, and known issues.
   - Document the unsigned-release path and the signed/notarized-release path separately. Signing and notarization stay blocked until maintainer-controlled certificates are available.
   - Ensure public docs do not overclaim: Postman script parity is claim-gated for the tracked target, platform OS sandbox coverage is tracked separately, distributed/cloud load testing is deferred, and full JMeter execution semantics are not claimed.

2. Move Runner into a dedicated workspace-owned section.
   - Product shape:
     - Remove the request-result-panel `Runner` tab from request editing and add a `Runner` section in the left sidebar between `Workspaces` and `History`.
     - The Runner sidebar panel should list saved runners, support selecting a runner, and provide a clear empty state plus a create-new-runner action.
     - Selecting a runner should open a main-pane runner tab, using the same open-tab model and close/dirty behavior as request, environment, and workspace tabs. The main pane should show runner controls, environment selection, request rows, run progress, results, cancellation, and JSON/CSV export controls.
   - Workspace data model:
     - Add a first-class `workspace.runners` array and bump the workspace schema version with a migration that defaults older workspaces to `runners: []`.
     - Model each runner as `{ id, name, environmentId, allowEnvironmentMutation, stopOnFailure, requests }`.
     - Model runner requests as independent request objects with their own IDs, order, request body/auth/assertions/scripts/examples/variables, and optional provenance metadata such as `{ source: "collection", collectionId, folderId, requestId, importedAt }`.
     - Imported collection requests must be deep cloned into the runner. Editing a runner request must never mutate the source collection request, folder, or collection variables unless a future explicit "sync back" feature is added.
     - Native workspace save/export/import, managed workspace summaries, IPC payload validation, diagnostics redaction, and durability tests must preserve runner data without leaking request bodies beyond existing opt-in diagnostics categories.
   - Navigation and tabs:
     - Extend sidebar/session state from `collections/environments/workspaces/history` to include `runners`, and extend main-panel/open-tab state to include runner tabs.
     - Clicking the Runner sidebar button should show the runner list/empty state. If a runner tab is already open, it should restore the active or most-recently-opened runner tab, matching the current request/environment/workspace sidebar behavior.
     - Enforce the existing 128 total open-tab cap across request, environment, workspace, and runner tabs, including new-runner creation, runner row selection, and session restore.
     - Persist and restore selected runner IDs, open runner tabs, dirty runner tabs, and closed-runner empty states through `session:save` and `session:load`.
   - Runner editor UI:
     - Add a clickable/editable runner name title, Save Runner button, Delete Runner button, Run, Cancel, Export JSON, Export CSV, Stop on failure, Environment selector, and `Allow runner to modify environment` checkbox.
     - Display runner requests as reorderable rows with method, name, URL summary, run status/result summary, an edit/open affordance, and a Delete button for removing the request from that runner only.
     - Support drag and drop plus keyboard-accessible move controls for reordering runner requests. Reordering marks only the runner tab dirty and must survive save/reload.
     - Editing a runner request should use the existing request editor components where possible, but route all changes into the runner-owned request object rather than the collection tree.
   - Add-request menu:
     - `Add request` should open an in-app popup menu, not a native prompt.
     - The menu should allow selecting an individual request from the Collections tree, importing all requests from an entire collection in collection order, or creating a brand-new unsaved runner-owned request.
     - Imported collection requests should retain source metadata for display/debugging, but all mutable request fields should be cloned.
     - The menu must handle empty collections, deleted source requests, duplicate names, unsupported request shapes, and the open-tab cap without partial mutation.
   - Execution semantics:
     - Keep reusing the existing scripted request lifecycle and collection-run IPC where possible, but introduce a runner execution adapter that accepts a runner object rather than a collection-only model.
     - Runner execution order must follow the runner request row order and support pre-request scripts, post-response/test scripts, assertions, cookies, OAuth refresh propagation, vault prompts, package review bindings, `pm.execution.setNextRequest`, `pm.execution.skipRequest`, and bounded `pm.execution.runRequest` against runner-local request IDs.
     - The selected runner environment is independent from the top-right active request environment. It may be `none`, and it should be stored on the runner.
     - If `allowEnvironmentMutation` is enabled, script/extractor changes should be applied back to the selected saved environment using the existing targeted environment-save path.
     - If `allowEnvironmentMutation` is disabled, execute against a temporary cloned environment. Scripts can mutate that temporary environment for later requests in the same run, but the saved environment must remain unchanged after success, failure, or cancellation.
     - Define and test cancellation, failed pre-run save, failed environment persistence, stale completion after workspace switch/reset, and concurrent duplicate-runner-ID behavior.
   - Migration from the old request panel:
     - Remove request editor result-tab runner controls and update snapshots, accessibility labels, and docs so "Runner" is no longer presented as request-local UI.
     - Keep existing collection-run capability by offering "import collection into runner" and by allowing a new runner to be created from a collection from the Add-request menu or a collection context action.
     - Preserve current runner report formatting/export behavior, but attach it to the selected runner tab and runner ID.
   - Test coverage:
     - Add model/schema tests for runner normalization, schema migration, workspace save/export/import, managed workspace summaries, and native workspace detection.
     - Add unit tests for cloning collection requests into runners, preserving source requests unchanged, adding entire collections in order, creating runner-local requests, deleting rows, and drag/drop or keyboard reorder behavior.
     - Add execution tests for environment mutation enabled/disabled, temporary environment chaining across requests, pre-request/test scripts, extractor updates, cookies, OAuth refreshed auth, vault prompts, `setNextRequest`, `skipRequest`, `runRequest`, stop-on-failure, cancellation, and stale workspace-context completions.
     - Add IPC/session tests for runner tab state, 128-tab cap enforcement, progress/result validation, export validation, and invalid payload rejection.
     - Add UI regression/snapshot/accessibility tests for the new sidebar item order, empty state, runner list, runner tab open/close/dirty behavior, Add-request menu, request-row deletion, reorder affordances, environment selector, mutation checkbox, run/cancel/export states, and long-label/constrained-width behavior.
   - Documentation:
     - Update `README.md`, `docs/ARCHITECTURE.md`, `docs/SANDBOX_CONTRACT.md`, release-readiness docs, and UX/accessibility matrix references to describe first-class workspace runners, runner-owned requests, environment mutation behavior, and the removal of the request-local Runner result tab.
     - Document that runner-owned requests are independent copies, that source collection requests are not modified, and that disabled environment mutation uses a temporary environment copy for the duration of the run.

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
- Full JMeter execution semantics beyond the focused HTTP sampler compatibility target.
- Advanced local automation / unsafe script mode is deferred and should not be part of the v1.0.0 release scope. If revisited later, consider a plugin system or settings panel that can grant selected local capabilities or disable sandboxing entirely for users who intentionally want scripts to modify local files. The maintainer has not chosen between those two models yet; any future design must treat this as dangerous, off by default, and visibly separate from the default safe sandbox.
- Direct first-party Postman account/provider integration for fetching team Package Library `@team/package` sources remains deferred. The current reviewed HTTPS source-URL workflow stays the supported path until a future provider-specific auth/import contract is approved.
- Maintainer-provided real-world Postman collection corpora remain deferred until a sanitized folder of collections is available. When provided, add them as compatibility fixtures or external report inputs without copying third-party copyrighted content blindly.
- A stricter Linux deny-by-default seccomp-BPF allowlist is optional future hardening. The maintainer has accepted the current Linux `bubblewrap` namespace isolation plus dangerous-syscall seccomp policy for the current public Linux OS-sandbox claim.

## Risks / Gaps Blocking Production Readiness

- Load tests intentionally skip request scripts under sandbox v1; they use the normal HTTP sender directly and report the skip when scripts are present.
- Native Windows/macOS packaged OS-sandbox assertions are wired into CI/release evidence paths. gRPC PFX/P12 client-certificate extraction, Postman-style per-request vault prompts, and checked-in `newman@6.2.2` JSON evidence reports are implemented locally and covered by focused validation.
- Live OAuth provider tooling is implemented and mocked certification passes locally, but live Google, Microsoft Entra ID / Azure AD, and GitHub tenant evidence is not captured yet.
- JMeter import/export covers common HTTP sampler metadata, assertion mappings including XPath, extractors, selected timer/controller metadata round-tripping, Size Assertion mapping, nested-controller metadata preservation, representative timer metadata, mapped disabled-state preservation, and unsupported metadata preservation, but it is still not a full JMeter test-plan model.
- Automated Electron UI coverage is broader and includes screenshot, mocked OAuth, and XML/HTML formatting smokes, but it is still Linux/headless focused and not broad cross-platform UI automation.
- Custom URI-scheme OAuth redirects are implemented and mocked; Linux deb/AppImage desktop-entry registration, macOS zip app-bundle metadata, Windows/macOS protocol validators, and native-runner validation jobs are wired. The remaining requirement is executing and monitoring those GitHub Actions jobs for release evidence.
- IPC validation uses shared schema metadata for common fields, update/external payloads, file-operation results, OAuth progress, runner config/progress, load-test progress/results/policies, and result payloads, but some complex validators are still partly handwritten rather than fully generated.
- Signing/notarization remains incomplete; unsigned GitHub Release artifact publishing is configured.
- In-app update checks can open GitHub Releases, but PostMeter does not yet auto-download or auto-install updates.
- Load testing is local-only. It supports target arrival-rate scheduling, global rate caps, policy-decision reporting, bounded multi-process execution, streamed worker summary aggregation, and capped optional sample capture, but not distributed execution or cross-machine policy governance.

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
