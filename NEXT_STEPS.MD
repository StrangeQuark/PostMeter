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

## Completed This Iteration

- Made native workspace import non-destructive for managed multi-workspace mode, so imported workspaces are added to the discovered workspace set without replacing or backing up the current workspace.
- Added a desktop collection-export picker modal, including an explicit empty-state warning when no collections exist and a native collection export filename default of `<collection-name>.json`.
- Updated the project docs to describe managed workspace discovery, non-destructive workspace import, exporting a selected managed workspace from the Workspaces list, and the collection export modal/empty-state/filename behavior consistently across the repo.
- Completed the remaining local `Next Highest Priority Steps` burn-down.
- Expanded JMeter compatibility with a representative timer/assertion matrix fixture covering Precise Throughput Timer, Poisson Random Timer, disabled mapped assertions with attribute-order variance, and preserve-only unsupported HTML/XML schema/compare/SMIME assertion metadata.
- Made mapped JMeter assertion import more robust by reading assertion attributes independently of attribute ordering.
- Preserved unsupported JMeter element enabled-state metadata while still re-exporting unsupported elements as disabled JMX nodes to avoid implying execution parity.
- Extended schema-backed IPC validation to OAuth progress payloads, load-test progress payloads, runner config/progress payloads, and collection-run results returned from the main process.
- Added load-test policy-decision reporting so cap-derived effective target rates are visible in progress/results and JSON/CSV export.
- Hardened request scripting by explicitly rejecting unsupported network/Node-like globals and adding safe Postman-style helpers for `pm.info`, object/array include checks, object keys, array members, and length aliases.
- Updated `README.md`, `TECH_SPECS.MD`, and `docs/COMPATIBILITY.md` to match the implemented IPC, JMeter, load-test governance, and scripting behavior.
- Completed a behavior-preserving refactor pass over the highest-risk modules without changing IPC channels, preload APIs, CLI commands, import/export formats, workspace JSON shape, or UI DOM IDs.
- Extracted renderer smoke-test workflows to `src/renderer/uiSmoke.js`, response body formatting to `src/renderer/responseFormatting.js`, runner/load-test/OAuth result formatting to `src/renderer/runResultFormatting.js`, collection tree helpers to `src/renderer/collectionModel.js`, assertion templates/defaults to `src/renderer/assertionModel.js`, cookie defaults/validation/Postman import helpers to `src/renderer/cookieModel.js`, request example helpers to `src/renderer/exampleModel.js`, load-test policy defaults/normalization to `src/renderer/loadPolicy.js`, context-menu helpers to `src/renderer/contextMenu.js`, and resizable layout persistence to `src/renderer/layoutControls.js`.
- Extracted single-request script execution orchestration to `src/core/requestScriptRunner.js`, keeping `collectionRunner.js` focused on collection sequencing, assertions, progress, cookies, stop-on-failure, and reporting.
- Extracted workspace mutation persistence after sends/runs to `electron/workspaceMutations.js`, workspace schema migrations to `src/core/workspaceMigrations.js`, app/update/external-link IPC to `electron/appIpc.js`, application menu construction to `electron/appMenu.js`, file-dialog helpers to `electron/fileDialogs.js`, OAuth IPC to `electron/oauthIpc.js`, OAuth flow orchestration to `electron/oauthFlows.js`, BrowserWindow/UI-smoke wiring to `electron/mainWindow.js`, load/runner IPC handling to `electron/runtimeIpc.js`, request send/validate IPC handling to `electron/requestIpc.js`, and workspace/collection/example import-export IPC handling to `electron/workspaceIpc.js`.
- Split CSS element defaults/control states into `src/renderer/base.css`, design/theme tokens into `src/renderer/theme.css`, app chrome/layout into `src/renderer/chrome.css`, request/response/editor panels into `src/renderer/editorPanels.css`, and modals/context menus into `src/renderer/overlays.css`, with `src/renderer/styles.css` kept as the stable stylesheet entry point.
- Removed stale secret-metadata cleanup/assertions and stale documentation references to the removed secrets module.
- Added `docs/ARCHITECTURE.md` to document renderer, Electron main-process, and core ownership boundaries for future refactors.
- Completed the first `Highest Priority Steps` phase by extracting shared runtime-neutral `authModel.js`, `cookieModel.js`, and `loadPolicyModel.js`, rewiring renderer helpers into thin adapters, and keeping persisted workspace auth normalization shape-stable.
- Continued the `renderer.js` ownership split by extracting request-editor panel helpers to `src/renderer/requestEditorPanels.js` and descriptor-driven tab-bar rendering to `src/renderer/requestTabs.js`, reducing `src/renderer/renderer.js` to a smaller shell/orchestrator without changing DOM IDs or preload contracts.
- Continued the `renderer.js` ownership split again by extracting startup/theme/bootstrap logic and DOM event registration to `src/renderer/rendererBootstrap.js`, including toolbar-menu helpers and cleanup registration for renderer subscriptions.
- Completed the remaining `renderer.js` split by extracting renderer state defaults/helpers to `src/renderer/rendererState.js`, tab lifecycle and dirty/close flows to `src/renderer/requestTabState.js`, request/load/runner/OAuth/workspace actions to `src/renderer/rendererWorkflows.js`, and the remaining request pair/assertion rendering into `src/renderer/requestEditorPanels.js`, with focused tests around the new boundaries.
- Completed the collection-format breakup by extracting `src/core/openApiFormats.js`, `src/core/harFormats.js`, `src/core/curlFormats.js`, `src/core/jmeterFormats.js`, and `src/core/collectionFormatUtils.js`, while keeping `src/core/collectionFormats.js` as the stable public API used by `workspaceStore` and the existing import/export tests.
- Completed the `workspaceStore.js` refactor by extracting workspace normalization/persistence helpers to `src/core/workspacePersistence.js`, collection import/export detection to `src/core/collectionImportRegistry.js`, imported ID regeneration to `src/core/importedCollectionIds.js`, and keeping `WorkspaceStore` as the high-level file-facing service with focused helper tests.
- Completed the shared scripted-request lifecycle refactor by extracting `src/core/scriptedRequestLifecycle.js`, rewiring `requestScriptRunner.js` and `collectionRunner.js` to use the same pre-request/send/test pipeline, and adding focused lifecycle coverage without changing the supported `pm` scripting surface.
- Completed the schema/validator deduplication pass by moving shared enum and limit metadata behind `src/core/payloadSchemas.js`, rewiring `ipcValidation.js` to use the shared schema source instead of shadow copies, and aligning shared core normalizers with the same enum helpers without changing IPC payload contracts.
- Completed the UI smoke harness split by extracting shared smoke helpers to `src/renderer/uiSmokeCommon.js`, moving workflow/regression/snapshot/OAuth flows into suite-specific renderer files, and keeping `src/renderer/uiSmoke.js` as the stable queue-only entry point used by the Electron smoke launchers.
- Locked the production script sandbox contract in `docs/SANDBOX_CONTRACT.md`, covering the target `pm.*` matrix, threat model, trust/consent model, load-test scripting boundary, transaction rules, broker protocol requirements, and verification requirements.
- Implemented sandbox v1's safe brokered async subset with a worker/parent broker protocol, validated broker operations, bounded timers, async `pm.test`, true workspace `pm.globals`, `pm.iterationData`, `pm.execution.setNextRequest`/`skipRequest`, and brokered `pm.sendRequest`/cookie helpers.
- Hardened script worker isolation with minimal inherited environment, bounded heap settings, bounded console/result sizes, narrowed runtime file-read permission flags when supported by the pinned runtime, and tests proving environment overrides cannot disable required permission flags.
- Wired sandbox side effects through single sends, desktop/CLI collection runs, globals, cookies, request-local variables, collection variables, active environments, request mutation rules, history updates, and explicit load-test script-skip reporting.
- Added workspace sandbox trust toggles in the renderer for brokered `pm.sendRequest` and cookie helper access.
- Hardened sandbox persistence by queueing workspace mutations, binding script side-effect commits to the workspace identity that started the run, and merging variable/cookie side effects as deltas so unrelated newer workspace edits are preserved.
- Hardened the script runtime bridge against host constructor/prototype, caught-error, returned-array, and promise/thenable escape paths, with adversarial tests covering the previously risky `constructor.constructor(...)` class.
- Made production script-worker permission enforcement fail closed for packaged Electron and Node 22+ CLI runs, added final-result execution ID validation, and added `npm run sandbox:validate` to verify the pinned Electron runtime's permission model and adversarial script boundary.
- Added a packaged-app sandbox validation entrypoint and `npm run sandbox:validate:packaged`, then wired it into CI/release after desktop artifacts are built so ASAR/path-specific worker permission behavior is checked.
- Wired sandbox runtime validation into `npm run check`, CI, and the release build matrix so permission support and bridge hardening are checked before packaging and against built executables.
- Added a golden Postman/Newman-style sandbox corpus under `test/fixtures/postman`, covering async ordering, nested `pm.sendRequest`, iteration data, cookie scope, variable precedence, execution control, cancellation, skipped requests, and mixed `pm.test` pass/fail behavior through the normal Postman importer and collection runner.
- Fixed collection-run brokered `pm.sendRequest` to use the owning runner's injected sender, keeping corpus runs deterministic and aligned with mocked desktop/CLI runner behavior.
- Added the first OS-level script sandbox backend in `src/core/osSandbox.js`: Linux script workers can launch through `bubblewrap` with cleared environment, unshared namespaces including network, dropped capabilities, private writable `/tmp` and `/run`, disabled nested user namespaces, and read-only runtime/app/library bind mounts while retaining the existing Node permission flags and broker boundary.
- Added a Linux seccomp cBPF syscall policy layer to the `bubblewrap` backend, denying high-risk kernel APIs such as `bpf`, `ptrace`, keyring calls, module loading, mount APIs, `process_vm_*`, `perf_event_open`, `io_uring`, and nested namespace/mount syscalls; sandbox validation now asserts packaged and source launches carry the policy.
- Added required-mode OS sandbox validation to `npm run sandbox:validate`, including Linux host filesystem and network denial probes, plus CI/release installation of the `bubblewrap` backend on Linux runners.
- Resolved the Newman corpus target to the current npm `latest` dist-tag, `newman@6.2.2`.
- Reoriented `docs/SANDBOX_CONTRACT.md` around Postman import parity as the scripting target: prefer brokered, bounded implementations of Postman APIs over intentionally narrow subsets.
- Made brokered `pm.sendRequest`, current-URL `pm.cookies`, and `pm.cookies.jar()` default-enabled for Postman compatibility while preserving workspace-level disable switches and the OS/Node/broker sandbox boundary; extended the golden corpus to cover jar-style cookie helpers, including hostname and cookie-object set forms.
- Implemented bounded brokered `pm.execution.runRequest` for collection runs, including request lookup, variable overrides, referenced test reporting on the caller, skip-to-null behavior, call/depth limits, script-network disable enforcement, transaction-safe side effects, and golden corpus coverage.
- Implemented the first safe `pm.visualizer` pass with bounded template/data/result sizes, JSON-cloned visualizer data, a Handlebars-style interpolation and `{{#each}}` subset, sanitized output, sandboxed iframe rendering, and golden corpus coverage.
- Expanded the safe `pm.visualizer` subset with bounded `{{#if}}`, `{{#unless}}`, `{{#with}}`, `{{else}}`, parent lookup, and root lookup support, plus focused tests and golden corpus coverage.
- Implemented explicitly granted brokered `pm.vault` access with async `get`/`set`/`unset`, per-script operation/value limits, encrypted per-workspace desktop vault storage outside workspace JSON, mutation audit metadata, workspace setting/UI grant wiring, and golden corpus coverage.
- Implemented the initial conservative package-loading compatibility pass: `pm.require()` and sandbox `require()` first supported bundled allowlisted `crypto-js`, `lodash`, and `uuid` APIs while denying Node modules, external packages, paths, URLs, and non-allowlisted packages; the golden corpus covers these imports.
- Expanded package loading to a manifest-driven bundled Postman built-in facade set for `ajv`, `chai`, `cheerio`, `crypto-js`, `csv-parse/lib/sync`, `lodash`, `moment`, `postman-collection`, `uuid`, and `xml2js`, while keeping Node resolution, package installation, external registry fetching, and team Package Library imports blocked.
- Implemented the next package-loading parity tranche with a reviewed in-workspace package cache for team Package Library-style `@team/package` specifiers, exact external `npm:package@version` / `npm:@scope/package@version` / `jsr:@scope/package@version` specifiers, and Postman latest-version external `npm:package` / `npm:@scope/package` / `jsr:@scope/package` specifiers resolved parent-side before execution. Cached packages require SHA-256 integrity metadata, cannot override built-in facades, are bounded by package/source/dependency/export limits, and can only load declared reviewed dependencies or bundled facades.
- Expanded `pm.visualizer` parity with bounded custom helpers, partials, `Handlebars.SafeString`, inline visualizer scripts, sandboxed iframe `allow-scripts` rendering, and `pm.getData(callback)` data access while preserving iframe CSP/network isolation and renderer/Electron/Node separation.
- Implemented scoped `pm.vault` grants for workspace, collection, and request access with explicit collection/request denial overrides, while keeping all secret operations brokered, bounded, encrypted outside workspace JSON, and audited without secret values.
- Extended the golden Postman/Newman-style corpus to cover reviewed team/external package imports, visualizer helpers/partials/inline scripts, and the expanded sandbox parity behavior.
- Hardened the reviewed package-cache policy to fail closed on duplicate packages, missing reviewed dependencies, package-count overflow, dependency-count overflow, and legacy workspace-wide vault grants that conflict with explicit request/collection denials.
- Completed Step 1 of the Postman import parity plan with a generated official-docs parity matrix source in `src/core/postmanParityMatrix.js` and committed machine-readable output in `docs/postman-sandbox-parity-matrix.json`; the current matrix tracks 406 API, method, property, global, module, protocol, fixture, claim-gate, and security-decision rows against `newman@6.2.2`.
- Completed a final official Postman/Newman docs sweep across sandbox reference, script examples, external packages, protocol docs, auth docs, collection-runner docs, and Newman CLI docs. The sweep closed the discovered `pm.environment.name`, exact protocol helper, response-time-chain, scoped npm, and latest-version external package import gaps while preserving parent-side review and no script-time registry access.
- Added `src/core/postmanParityHarness.js` plus `scripts/postmanParityHarness.js` for matrix validation, matrix regeneration, local PostMeter differential runs, and optional live Newman comparison.
- Completed Step 4 of the Postman import parity plan by implementing deterministic `pm.test` result ordering, `pm.test.skip`, `pm.test.index`, chained test registration, mixed callback/promise tests, broader Chai-compatible `pm.expect`/`chai.assert` helpers, response JSON-schema/error helpers, variable `clear`/`toJSON`/metadata handling, iteration-data unset/JSON behavior, the documented Postman dynamic variable catalog, request interpolation for dynamic variables, `pm.execution.location`, and a 10-call per-script `pm.execution.runRequest` limit while preserving the script-worker permission boundary.
- Added the HTTP-core differential collection fixture and desktop-observation template under `test/fixtures/postman`, then covered the new matrix/harness with focused Node tests and `npm run postman:parity:validate` in `npm run check`.
- Completed Step 2 of the Postman import parity plan by adding the documented Postman global object surface, sandboxed `Function` support with escape regressions, bounded interval/microtask/timer behavior, richer console capture, Postman-listed NodeJS module facades, and safe array-buffer results for Blob/Web Crypto without exposing host constructors.
- Expanded the golden Postman/Newman-style corpus and generated parity matrix so runtime globals, built-in package facades, legacy package globals, and Postman-listed NodeJS modules are fixture-covered instead of tracked as unstarted gaps.
- Completed Step 5 of the Postman import parity plan by expanding brokered `pm.sendRequest` input normalization, callback/promise cookie helper behavior, staged `pm.sendRequest` cookie-jar side effects, reviewed package-cache import/UI workflow, safer Handlebars-compatible visualizer behavior with integrity-checked reviewed assets, and desktop vault binding/reset/audit UX without exposing host filesystem, process, Node, Electron, renderer, or raw network primitives to scripts.
- Completed Step 6 of the Postman import parity plan by preserving and executing imported GraphQL Before query/After response hooks, preserving and executing imported gRPC Before invoke/On message/After response hooks with protocol metadata/messages/`pm.message`, and recording the current official-docs WebSocket/Socket.IO no-script-hook audit in the generated parity matrix.
- Completed Step 7 of the Postman import parity plan by adding a core local mock server runner with imported mock script preservation, method/path-only route matching, path variables, saved-example fallback, `pm.mock.matchRequest`, `pm.mock.sendExample`, Express-style `req`/`res` helpers, top-level mock-script `await`/`return`, and bounded transaction-safe `pm.state` storage.
- Completed Step 8 of the Postman import parity plan by adding bounded Postman metadata preservation on collections/folders/requests/examples/certificates, Postman-compatible collection export, original/deterministic request-ID aliases for `runRequest`/`setNextRequest`/`pm.info`, import-order preservation for mixed request/folder hierarchies, and round-trip coverage for script events, variables, package/cookie/vault/mock/visualizer bindings, protocol profiles, examples, certificates, auth metadata, and file/binary body references.
- Completed Step 9 of the Postman import parity plan by adding the production claim gate (`npm run postman:parity:claim`), release-gate manifest validation (`npm run release:gate`), a broad real-world-style Postman import corpus, expanded adversarial sandbox tests, and regenerated parity-matrix rows for claim blockers. A follow-up deep dive expanded the claim gate to 12 default-import blockers; the evidence-hardening pass cleared the two harness/evidence blockers before later parity steps reduced the list further.
- Completed Step 10 of the Postman import parity plan by adding a separate OS-sandbox platform completion matrix at `docs/os-sandbox-platform-matrix.json`, generated from `src/core/osSandboxPlatformMatrix.js`, plus `npm run sandbox:platform:validate` and `npm run sandbox:platform:claim`. Normal validation, CI, release workflows, and `npm run release:gate` now require the platform matrix to stay current, while the stronger platform-equivalent full OS sandbox claim intentionally fails closed until native Windows/macOS backends are complete. The maintainer has accepted the current Linux `bubblewrap` plus dangerous-syscall seccomp policy as sufficient for the current Linux platform claim.
- Completed the current Step 1 evidence-hardening pass by adding the broader Newman-compatible differential fixture `differential-sandbox-broad.collection.json`, extending `npm run postman:parity:diff` to run multiple suites, capturing the installed Postman Desktop 11.71.7 runtime/source audit, and tightening the matrix validator so implemented desktop-required rows cannot rely only on `desktop-observation-template`. Live `newman@6.2.2` comparison passes for both differential suites with zero differences.
- Completed the current Step 2 dynamic-code/host-global audit by adding `differential-dynamic-host-globals.collection.json`, capturing the installed Postman Desktop 11.71.7/postman-sandbox@6.2.2 dynamic-host audit, matching Postman/Newman behavior for direct eval, indirect eval, `Function`, lexical `Buffer`, raw network/browser globals, `process`, `globalThis`, WebAssembly, and constructor escapes, and clearing `global.dynamic-code-and-host-like-globals-audit`.
- Completed the current Step 3 runtime-limit audit by adding `differential-runtime-limits.collection.json`, capturing the installed Postman Desktop 11.71.7/postman-runtime@7.50.0 and `newman@6.2.2` runtime-limit audit, increasing default script/request budgets to the audited 180-second Postman Runtime global timeout, and classifying the remaining explicit size/count caps as intentional strict sandbox security ceilings.
- Completed the current Step 4 `HttpOnly` cookie parity pass by adding `differential-httponly-cookies.collection.json`, capturing the installed Postman Desktop 11.71.7/Newman `HttpOnly` cookie audit, matching Postman/Newman script readability and jar mutation behavior for `HttpOnly` cookies, enabling cookie-jar sends/storage on imported Postman requests, and clearing `cookies.httponly-parity`.
- Completed the current Step 5 `pm.sendRequest` advanced auth/proxy/TLS/client-certificate pass by adding brokered Digest challenge retry, Hawk, AWS Signature v4, OAuth 1.0 signing, HTTP(S) proxy routing, strict TLS policy enforcement, configured client-certificate binding IDs for scripts, explicit NTLM/Akamai fail-closed classification, import/export preservation for advanced auth helpers, `differential-sendrequest-advanced.collection.json`, and `postman-desktop-11.71.7-sendrequest-advanced-audit.json`; live `newman@6.2.2` comparison now passes six differential suites with zero differences. A later coverage review split NTLM, Akamai EdgeGrid, JWT Bearer, and ASAP into explicit reopened claim blockers.
- Completed the current Step 6 file/binary attachment binding pass by adding workspace-reviewed imported file bindings, parent-side approved regular-file body materialization, brokered `pm.sendRequest` file/binary/form-data binding support, a Workspace binding review panel, denial tests for unbound paths, `differential-sendrequest-files.collection.json`, and `postman-desktop-11.71.7-sendrequest-files-audit.json`; live `newman@6.2.2` comparison now passes seven differential suites with zero differences.
- Completed the current Step 7 package-library fetch/review pass by adding parent-side npm and JSR exact/latest package fetchers, reviewed HTTPS source-URL fetch for team Package Library-style packages, Electron IPC/preload wiring, Workspace fetch-and-review UI, protocol-script package-reference discovery, and fetcher/IPC tests while keeping all runtime script package loading local, synchronous, integrity-checked, and unable to reach registries.
- Completed the current Step 8 built-in package parity pass by replacing the hand-rolled built-in package facades with a generated, version-pinned `postman-sandbox@6.2.2` browser bootcode bundle loaded inside the script VM, adding a completed Postman Desktop 11.71.7 built-in package audit, preserving brokered `stream`/`timers` subset boundaries, and clearing `require.builtin.full-library-parity`.
- Updated the script-worker Node permission read allowlist and sandbox runtime validator so the generated Postman package bundle is available to packaged workers without broadening filesystem access beyond exact runtime files.
- Completed Step 9 of the Postman import parity plan by implementing reviewed multi-file CommonJS package semantics, including package metadata entrypoints, local directory/extension/JSON resolution, reviewed dependency aliases and subpaths, module caching, circular dependencies, default export patterns, bundle integrity, cache persistence, focused corpus coverage, and adversarial loader denials.
- Completed Step 10 of the Postman import parity plan by replacing the visualizer subset renderer with an integrity-checked `handlebars@4.7.9` browser runtime loaded inside a separate visualizer VM context, adding precompile/template/create/helper/partial/decorator/runtime-option coverage, preserving iframe CSP and reviewed-asset policy, and clearing `visualizer.handlebars-full-parity`.
- Completed Step 11 of the Postman import parity plan by adding a live parent-owned desktop gRPC transport for unary, client-streaming, server-streaming, and bidirectional streaming calls, preserving imported gRPC script hook behavior and hardening proto/TLS/client-certificate transport inputs against script-time path mutation.
- Completed Step 12 of the Postman import parity plan by clearing the final `runtime.resource-limit-parity` claim blocker, documenting audited production resource ceilings as safety policy rather than unsupported Postman APIs, regenerating the parity matrix, and temporarily making `npm run postman:parity:claim` pass with zero default-import blockers. Later coverage reviews reopened and expanded the claim blockers so the project does not overstate 1:1 Postman script parity.
- Added a repeatable official-docs coverage audit so the Postman/Newman sweep is no longer a one-off manual review. The committed `docs/postman-docs-coverage-audit.json` maps 431 extracted tokens from 140 official Postman/Newman sources to parity rows or explicit exclusions, while `npm run postman:docs:live` refetches current upstream docs and the Newman latest dist-tag before preserving the 1:1 claim.
- Completed the production-readiness HPS 1-9 local implementation pass: added the production readiness dashboard/gates, native packaged smoke validation, Windows/macOS CI runner packaging hooks, Electron security/workspace durability/non-Postman compatibility matrices, checked-in raw and normalized `newman@6.2.2` evidence reports, gRPC PFX/P12 mTLS extraction with live mTLS coverage, metadata-only renderer vault prompts with scoped grant persistence, and updated release/security docs.
- Added platform OS sandbox launcher scaffolding without overclaiming: Linux remains the accepted `bubblewrap` plus seccomp backend; Windows has a fail-closed native helper contract; macOS has a seatbelt-style `sandbox-exec` launch path where available; `npm run sandbox:platform:claim` remains blocked until native-runner packaged probes prove Windows/macOS behavior.

## Highest Priority Steps

Postman scripting is now in maintenance mode for the tracked target. Keep `npm run postman:parity:validate`, `npm run postman:docs:validate`, `npm run postman:parity:claim`, and the imported-script coverage tests green, but do not spend the next production pass on new scripting surface unless a regression appears. Maintainer decisions now recorded for the next production queue: the current Linux `bubblewrap` plus dangerous-syscall seccomp policy is sufficient for the current Linux OS-sandbox claim; native Windows/macOS helper binaries or native Node addons are acceptable; checked-in Newman JSON reports, per-request vault prompts, and gRPC PFX/P12 mTLS support are now implemented locally; direct Postman account/provider package fetching and maintainer-provided real-world Postman collection corpora stay deferred.

Platform validation policy for this phase: Windows and macOS release/sandbox validations should be implemented with GitHub Actions native runners (`windows-latest` and `macos-latest`) and treated as required pre-production evidence. Docker is not acceptable for AppContainer, seatbelt, protocol-handler, installer, or packaged Electron desktop claims because it does not exercise the target desktop OS boundary. The maintainer has a Windows machine for optional manual verification. Full manual Mac QA is deferred until the maintainer obtains a Mac for the final production-release signoff.

Current implementation status:

- Steps 1, 2, and 4 through 9 are implemented locally, documented, matrixed, and covered by `npm run check`.
- Step 3 has the Linux production backend complete and accepted for the current Linux claim, plus fail-closed Windows helper selection and a macOS seatbelt-style launcher path. The stronger platform-equivalent Windows/macOS OS-sandbox claim remains blocked until release-owned native helper/addon source, packaged artifacts, and `windows-latest`/`macos-latest` probes prove the boundary. This is intentionally tracked by `npm run sandbox:platform:claim`, not hidden inside the Postman scripting claim.
- Step 10 is ready for mocked tooling, docs, local harnesses, and CI wiring. Live OAuth certification evidence still requires maintainer-owned Google, Microsoft Entra ID / Azure AD, and GitHub OAuth clients/tenants after the tooling exists.
- Step 13 is ready as a design/documentation step only. Actual unsafe local automation implementation remains blocked until the maintainer chooses the settings-panel model, plugin model, or a combined model.
- Release signing/notarization is not required for local implementation work, but signed stable release artifacts remain blocked until maintainer-controlled signing certificates exist.
- Manual Mac QA is not required for local implementation work. Use `macos-latest` GitHub Actions evidence for pre-production validation, and run the full manual Mac pass later when the maintainer has a Mac.

1. Build a production release readiness dashboard and gate. **Completed locally.**
   - Create a source-owned readiness matrix, preferably `src/core/productionReadinessMatrix.js`, plus generated JSON in `docs/production-readiness-matrix.json`.
   - Track release areas explicitly: packaging, native Windows/macOS validation, Linux validation, script sandbox, OS sandbox platform claim, Postman parity, non-Postman import/export, Electron security, workspace durability, OAuth certification, UX/accessibility, diagnostics/privacy, docs, update metadata, signing/notarization, and known deferred features.
   - Use explicit row fields: `id`, `area`, `target`, `status`, `releaseBlocking`, `evidenceRefs`, `commands`, `owner`, `lastVerified`, and `notes`.
   - Add scripts: `npm run production:readiness` for human output, `npm run production:readiness:write` for regenerating docs, and `npm run production:readiness:claim` for a fail-closed stable-release gate.
   - Do not duplicate lower-level checks; call or reference existing gates such as `npm run release:gate`, `npm run sandbox:validate`, `npm run sandbox:platform:validate`, `npm run sandbox:platform:claim`, `npm run postman:parity:claim`, `npm run postman:docs:validate`, `npm audit`, Electron version checks, native packaging jobs, and OAuth certification evidence.
   - Add status semantics so beta/RC/stable claims are distinct: `implemented`, `validated`, `external-validation-required`, `blocked`, `deferred`, and `not-applicable`.
   - Wire readiness validation into CI and release workflows. Normal PR validation may require freshness/structure; release-candidate and stable gates must fail if any release-blocking row is not validated or intentionally waived in docs.
   - Document how to read the dashboard in `README.md`, `TECH_SPECS.MD`, and release docs, including what can pass locally and what requires native GitHub Actions runners or maintainer credentials.

2. Finish cross-platform packaging and launch validation. **Completed locally; native runner execution evidence remains external.**
   - Inventory configured artifacts for Linux deb/AppImage, Windows NSIS/portable artifacts if configured, and macOS zip/dmg artifacts if configured. Record expected artifact names, app IDs, publisher, icons, update URL, protocol handlers, file associations, install paths, uninstall behavior, and unsigned-artifact warnings.
   - Add native smoke validators under `scripts/` that can launch a packaged app, wait for readiness, exercise the preload API surface, create and reload a temporary workspace, verify app version/channel metadata, and exit cleanly.
   - Add protocol-handler validation. Linux should validate desktop-entry registration where possible; Windows should validate registry registration and `Start-Process` protocol launch on `windows-latest`; macOS should validate app-bundle URL scheme registration with `open`/Launch Services on `macos-latest`.
   - Add packaged persistence-path validation for each OS: Linux XDG/AppImage/deb paths, Windows `%APPDATA%`/portable paths, and macOS `~/Library/Application Support` app-bundle paths.
   - Update `.github/workflows/ci.yml` and `.github/workflows/release.yml` with native matrix jobs for `ubuntu-latest`, `windows-latest`, and `macos-latest`. These jobs should build the platform artifact, upload it, run the packaged smoke validator, and upload logs/screenshots on failure.
   - Add a manual no-publish native release validation workflow so maintainers can run the same native build, packaged smoke, packaged sandbox, protocol, artifact upload, checksum, and manifest validation path without creating a GitHub Release.
   - Ensure Windows/macOS jobs fail closed when artifacts are missing, launch fails, protocol registration is absent, preload APIs are unavailable, or workspace persistence does not survive restart.
   - Keep Docker only for non-desktop checks such as lint/unit tests or Linux service-style validation; do not use Docker as evidence for native Windows/macOS desktop behavior.
   - Document the exact unsigned artifact user experience, including Windows SmartScreen/macOS Gatekeeper expectations until signing/notarization credentials exist.
   - Add optional manual Windows QA notes for the maintainer's Windows machine, but make GitHub Actions native runner logs the required pre-production evidence for this phase.

3. Implement native Windows/macOS OS-sandbox launchers. **Partially implemented and claim-gated.**
   - Keep Linux unchanged except for regression coverage: the current `bubblewrap` namespace/filesystem/network backend plus dangerous-syscall seccomp policy is sufficient for the current Linux public claim; a stricter deny-by-default allowlist remains optional future hardening.
   - Add a platform abstraction in `src/core/osSandbox.js` that selects Linux `bubblewrap`, Windows native helper/addon, macOS native helper/addon, or fail-closed unsupported behavior based on platform and required mode.
   - Windows implementation target: launch script workers through AppContainer or an equivalent restricted-token/job-object helper. The worker must receive a minimal environment, no inherited handles beyond required IPC, no broad filesystem read/write access, no host network access, private temp space, process lifetime limits, and explicit read-only access only to required runtime/app/library files.
   - macOS implementation target: launch script workers through a seatbelt-style helper or native addon that applies a restrictive sandbox profile before worker execution. The profile must deny host network, deny arbitrary filesystem access, provide private writable temp space, and allow read-only access only to required runtime/app/library files.
   - Prefer release-owned helpers/addons with deterministic builds, documented source, and packaged validation. Any native binary must be built in CI, included in artifacts deliberately, and covered by checksum or package-integrity checks.
   - Extend sandbox runtime validation with OS-specific probes: arbitrary home-directory read denial, arbitrary write denial, network denial, child-process denial, environment stripping, required runtime-file reads, brokered `pm.sendRequest` still working, and packaged path/ASAR behavior.
   - Add GitHub Actions validation on `windows-latest` and `macos-latest` for source-tree runs and packaged artifacts. These jobs are the required native evidence until manual Mac QA is available.
   - Update `src/core/osSandboxPlatformMatrix.js`, regenerate `docs/os-sandbox-platform-matrix.json`, and keep `npm run sandbox:platform:claim` failing until Windows and macOS backend plus packaged-validation rows are implemented.
   - Update `docs/SANDBOX_CONTRACT.md`, `TECH_SPECS.MD`, `README.md`, and `docs/COMPATIBILITY.md` with exact per-platform guarantees and any intentionally narrower behavior.

4. Add gRPC PFX/P12 mTLS extraction support. **Completed locally.**
   - Audit the existing HTTP client-certificate loader and gRPC transport input normalization, then share certificate-field validation wherever possible so HTTP and gRPC accept the same workspace auth shape: PEM cert/key, PFX/P12 bundle, optional CA path, and optional passphrase.
   - Add a parent-side PFX/P12 extraction path for gRPC because `@grpc/grpc-js` accepts PEM material directly. Use a reviewed parser/library or a carefully isolated platform API path that extracts cert chain and private key into in-memory PEM buffers without exposing them to scripts or the renderer.
   - Preserve strict path handling: only reviewed/imported certificate bindings may be read; scripts cannot provide arbitrary new certificate paths, mutate paths after snapshot, or disable TLS validation.
   - Build gRPC channel credentials from extracted PFX/P12 material and optional CA material, with clear errors for wrong passphrases, missing private keys, unsupported algorithms, malformed bundles, and encrypted-key failures.
   - Add local gRPC mTLS fixtures for PEM success, PFX/P12 success, wrong passphrase failure, missing file denial, malformed bundle failure, CA mismatch failure, and script mutation denial.
   - Cover unary, client-streaming, server-streaming, and bidirectional gRPC calls where certificate material is used.
   - Preserve Postman import/export certificate metadata and add round-trip tests for PFX/P12 gRPC certificate references.
   - Update `docs/SANDBOX_CONTRACT.md`, `TECH_SPECS.MD`, `docs/COMPATIBILITY.md`, and architecture docs after implementation.

5. Add Postman-style per-request vault prompts. **Completed locally.**
   - Extend the vault broker so a request-level `pm.vault.get/set/unset` operation can return a `prompt-required` decision to the desktop shell instead of immediately failing when no explicit grant/deny exists.
   - Add a renderer modal for the prompt with request/collection/workspace context, operation type, secret key name, grant choices, denial choice, reset link, and clear warning that scripts will access local secrets.
   - Preserve security boundaries: the renderer sees metadata only, never secret values, vault file paths, encryption keys, or secret enumeration. All secret reads/writes stay parent-side.
   - Preserve scoped policy semantics: explicit request denial overrides collection/workspace grants; collection denial overrides workspace grants; prompt grants are stored as request-scoped metadata unless the UI explicitly offers a broader grant.
   - Handle cancellation and denial by producing Postman-compatible denied-execution behavior, including the documented "code after vault call does not run" path where applicable.
   - Add audit metadata for prompt grant, prompt denial, reset, get/set/unset, unavailable encryption, and denied-after-call behavior without logging secret values.
   - Add tests for broker decisions, IPC prompt payload validation, renderer prompt state, request-level persistence, import/export exclusion of vault plaintext/ciphertext, and corpus fixtures for positive and negative script behavior.
   - Update `docs/SANDBOX_CONTRACT.md`, `docs/COMPATIBILITY.md`, `TECH_SPECS.MD`, and troubleshooting docs with the prompt model.

6. Check in Newman JSON differential reports. **Completed locally.**
   - Add a report generation script that runs the approved Newman-compatible differential fixtures with the targeted `newman@6.2.2` and writes raw plus normalized JSON evidence under `test/fixtures/postman/newman-reports/` or an equivalent documented folder.
   - Normalize timestamps, run durations, host paths, randomized ports, request IDs where generated locally, machine names, and other nondeterministic fields while preserving request order, test names, assertions, response-shape evidence, console output, and failure data.
   - Store target metadata in each normalized report: Newman version, Postman Runtime version where available, fixture ID, generation command, normalization schema version, and date generated.
   - Add scripts such as `npm run postman:newman-reports:write` and `npm run postman:newman-reports:validate`.
   - Wire validation into `npm run postman:parity:validate` or `npm run check` without requiring network access. The write command may download or use installed Newman only when explicitly requested.
   - Update `docs/SANDBOX_CONTRACT.md`, `docs/COMPATIBILITY.md`, and fixture README files with refresh instructions and the rule that Newman evidence is for Newman-compatible surfaces, not Desktop-only APIs such as vault prompts and local mock internals.

7. Complete a full Electron security hardening pass outside scripting. **Completed as a source-owned matrix and validation pass; fuse hardening remains documented.**
   - Create a source-owned Electron security checklist or matrix that enumerates every `BrowserWindow`, preload script, IPC channel, permission handler, custom protocol handler, navigation path, window-open path, shell/open-external path, file dialog, and packaged preload asset.
   - Verify production `webPreferences`: `nodeIntegration: false`, `contextIsolation: true`, renderer sandboxing enabled where supported, no remote module, deliberate preload path, restricted permissions, and no accidental dev-only flags in packaged builds.
   - Add automated tests for navigation denial, window-open denial, external URL allowlist handling, unsafe URL rejection, file dialog path validation, IPC sender validation, IPC schema validation, and preload API shape.
   - Add packaged validation for preload integrity and app protocol behavior, including Windows/macOS GitHub Actions runner coverage where applicable.
   - Review and harden Electron fuses if supported by the current Electron packaging flow. Document any fuse that cannot be enabled yet and why.
   - Confirm CSP for renderer and visualizer surfaces, including sandboxed iframe behavior, reviewed asset policy, and denial of remote script injection.
   - Update `docs/ARCHITECTURE.md`, `TECH_SPECS.MD`, and `SECURITY.md` with the renderer/main/core trust boundary and the security checklist ownership.

8. Harden workspace data durability, migrations, and recovery. **Completed as a source-owned matrix and focused validation pass; diagnostics redaction work remains a separate production blocker.**
   - Audit every persisted data path: workspace JSON, managed workspace index, active workspace pointer, vault metadata, vault encrypted files, package cache metadata, cookie jar, globals/environments, import/export files, diagnostics, and backups/quarantine files.
   - Add fault-injection tests around atomic writes: interrupted write before rename, interrupted write after temp write, corrupt JSON, partial vault metadata, stale managed-workspace index, concurrent sends/runs committing side effects, and import/export cancellation.
   - Expand migration fixtures for every supported schema version, malformed fields, unknown fields, large collections, nested imported folders, Postman metadata, package/vault/mock/visualizer bindings, file bindings, and protocol profiles.
   - Define recovery behavior precisely: when to restore from backup, when to quarantine, when to refuse loading, how to name recovery files, and how to avoid overwriting newer user data.
   - Add performance budgets and tests for large workspace load, save, search, collection tree render, request open, collection run setup, and import/export.
   - Add user-facing troubleshooting docs for recovery files, corrupt workspace handling, vault encryption failure, and package cache repair.
   - Ensure diagnostics redact secrets, vault values, auth tokens, request bodies by default, and local filesystem paths where appropriate.

9. Expand non-Postman import/export production compatibility. **Completed as a source-owned matrix and docs pass.**
   - Create or expand a non-Postman compatibility matrix covering JMeter, OpenAPI, HAR, curl, and native PostMeter round trips with explicit statuses: supported, preserve-only, unsupported, and intentionally out of scope.
   - JMeter: continue timers/assertions/controllers coverage, preserve unsupported metadata, add malformed but common `.jmx` variants, and avoid claiming full JMeter execution semantics.
   - OpenAPI: cover OpenAPI 3.0/3.1, servers, path/query/header/cookie parameters, request bodies, examples, auth schemes, variables, binary payload hints, and invalid-but-common specs.
   - HAR: cover headers, cookies, redirects, query params, post data, binary/base64 bodies, timings, compression metadata, and privacy-sensitive field redaction on export where applicable.
   - curl: cover shell quoting on Linux/macOS/Windows styles, repeated headers, auth flags, data flags, compressed requests, insecure TLS flags, files/binary bodies, redirects, and generated request names.
   - Native PostMeter: add round-trip tests for every workspace feature that should be durable, including auth, examples, variables, cookies, certificates, package cache metadata, vault metadata, mocks, visualizers, GraphQL/gRPC profiles, and file bindings.
   - Add fuzz/property-style tests for source-format detection, parser failure messages, unsupported metadata preservation, and no-crash behavior.
   - Update `docs/COMPATIBILITY.md` and import/export UI copy so users can see exactly what is executed, preserved, or unsupported.

10. Certify outbound OAuth provider behavior.
   - Keep the product boundary explicit: OAuth is only outbound request authentication for target APIs; do not add PostMeter accounts, app login, or a cloud sign-in gate.
   - Build a provider certification harness/checklist for Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth Apps.
   - Cover authorization-code PKCE, device code where provider-supported, refresh token, client credentials where provider-supported, redirect URI registration, custom URI scheme behavior, cancellation, browser-close behavior, token refresh, token storage, token redaction, and error UX.
   - Add mocked automated tests using a local OAuth server for success, denial, timeout, bad state, bad code verifier, refresh failure, malformed token response, revoked token, and cancellation.
   - Add optional live-provider test scripts that run only when maintainer-owned env vars/secrets are provided. These must be skipped by default in CI and must never print tokens or client secrets.
   - Add GitHub Actions manual workflow support for live-provider certification once secrets are configured, but keep normal CI on mocked tests.
   - Record live certification results in `docs/OAUTH_PROVIDER_CERTIFICATION.md` with provider version/date, app settings used, redirect URIs, observed quirks, and remaining limitations.
   - Update troubleshooting docs for provider-specific setup errors without exposing maintainer credentials.

11. Improve production UX, accessibility, and failure recovery.
   - Define the production workflow list: first launch, workspace create/open/switch, request editing, sends, collection runs, load tests, imports/exports, OAuth flows, package review/fetch, vault grants/prompts, file bindings, local mocks, settings, diagnostics export, update check, and recovery from failed operations.
   - For each workflow, add or verify empty states, loading states, success states, failure states, cancellation where practical, destructive-action confirmation, and actionable error messages.
   - Add keyboard navigation and focus management for high-frequency modals and panels, including package review, vault prompts, file binding review, import/export pickers, settings, and diagnostics export.
   - Add accessible names/roles for controls that are currently icon-only or dynamically rendered.
   - Add automated UI smoke/regression coverage for constrained desktop sizes, high-contrast/dark/light themes where supported, long labels, empty workspaces, large workspaces, failed imports, failed sends, and failed OAuth.
   - Add screenshot or DOM-state artifacts in CI for failures. Use Linux headless coverage by default and native Windows/macOS runner coverage for packaged app launch paths from Step 2.
   - Update docs for user-visible recovery behavior and known limitations.

12. Add production observability without adding cloud dependency.
   - Add structured local logging with log levels, rotation, size caps, and redaction defaults. Cover failed imports, failed sends, OAuth failures, package review/fetch failures, vault denials, sandbox denials, OS sandbox backend selection, workspace recovery, release/update checks, and packaged validation failures.
   - Add a local diagnostic bundle export that includes app version, release channel, OS, architecture, Electron/Node versions, package version, validation results, sanitized settings, recent non-secret errors, workspace metadata summary, and relevant matrix statuses.
   - Exclude or redact secrets, tokens, vault values, auth headers, cookies, request/response bodies by default, private file contents, and local paths unless explicitly safe.
   - Add UI for diagnostics export and a troubleshooting path for attaching diagnostics to GitHub issues.
   - Add tests for redaction, bundle schema, log rotation, disabled telemetry, and no network upload.
   - Document the privacy boundary clearly: no automatic telemetry, no cloud upload, no PostMeter account, and user-controlled local export only.

13. Design the unsafe local automation capability model before implementation.
   - Deliver a design document only; do not expose unsafe filesystem/process/shell capabilities during this step.
   - Compare the two maintainer-approved directions: settings-panel capability grants and plugin-model capability grants. Include a recommendation, migration path, and reasons to reject a raw global "disable sandbox" toggle as the default UX.
   - Define candidate capabilities: read files, write files, spawn process, access environment variables, raw network sockets, native modules, external package install/fetch at runtime, shell commands, and arbitrary local automation.
   - Define permission scope: global, workspace, collection, request, script phase, CLI-only, plugin-only, time-limited, and per-run grants.
   - Define UX requirements: prominent warnings, explicit opt-in, revocation, audit logs, import warnings, export behavior, safe defaults, and clear separation from normal Postman-compatible sandbox mode.
   - Define security requirements: no unsafe capabilities by default, no capability grant through imported collections alone, no silent downgrade from sandboxed execution, and diagnostics that show unsafe mode was enabled without exposing secrets.
   - Add the accepted design to `docs/SANDBOX_CONTRACT.md`, `TECH_SPECS.MD`, and future settings/plugin docs. Implementation remains blocked until the maintainer chooses the final settings-panel/plugin model.

14. Prepare public beta/release candidate documentation.
   - Add or update `SECURITY.md`, privacy notes, threat model summary, install/uninstall docs, unsigned artifact warnings, known limitations, compatibility matrix links, OAuth certification docs, diagnostics docs, and support channels.
   - Create a release checklist with separate beta, release-candidate, and stable sections. Each section must name required commands, native GitHub Actions runner jobs, artifact validations, OAuth certification status, signing/notarization status, docs checks, and known waivers.
   - Add a Mac manual QA checklist for the later maintainer-owned Mac pass. Until then, `macos-latest` GitHub Actions validation is the required pre-production evidence, not a substitute for final manual production signoff.
   - Add an optional Windows manual QA checklist for the maintainer's Windows machine, while keeping `windows-latest` GitHub Actions validation as the required pre-production evidence.
   - Make release notes templates call out security-sensitive changes, sandbox changes, compatibility changes, migration notes, signing/notarization status, native-runner validation results, and known issues.
   - Document the unsigned-release path and the signed/notarized-release path separately. Signing and notarization stay blocked until maintainer-controlled certificates are available.
   - Ensure public docs do not overclaim: Postman script parity is claim-gated for the tracked target, platform OS sandbox coverage is claim-gated separately, distributed/cloud load testing is deferred, and full JMeter execution semantics are not claimed.

## Questions For Maintainer After Implementation

Maintainer answers are recorded below and have been reflected in the active steps or deferred follow-ups.

1. Should an unsafe local automation mode, if implemented later, live behind a plugin model, a settings panel with per-capability permissions, a CLI-only flag, or some combination of those?
   - Answer: Either a settings panel or a plugin model, unsure yet
2. For Linux, is the current `bubblewrap` namespace/filesystem/network sandbox plus dangerous-syscall seccomp policy sufficient for the public claim, or should "full syscall-policy sandbox" require a maintained deny-by-default seccomp-BPF allowlist even if that means adding a native helper and more platform maintenance?
   - Answer: The current implementation is sufficient
3. For Windows/macOS, are native helper binaries or native Node addons acceptable for AppContainer/seatbelt-style sandbox launchers, or should PostMeter avoid native helpers and keep the public claim scoped below equivalent OS-level coverage on those platforms?
   - Answer: Native helpers and addons are acceptable
4. For the Newman corpus, `newman@6.2.2` is the current npm `latest` target. Do you want checked-in Newman JSON run reports generated by that exact version once a maintainer-approved Newman fixture export workflow exists?
   - Answer: Yes
5. The first team Package Library fetch flow uses a maintainer/user-provided HTTPS source URL because Postman's docs expose team packages through authenticated app/team workflows, not a public anonymous package registry. Should a later version add a first-party Postman account/provider integration for fetching `@team/package` sources directly?
   - Answer: Do not add this now, but make a note of this in the deferred section in case we want to take it up later
6. The first vault UX supports workspace-level local binding, metadata, reset, and audit review. Should a later version add per-request prompts similar to Postman's desktop vault flow?
   - Answer: Yes
7. Do you have maintainer-approved public or user-provided Postman collections that can be checked into the compatibility corpus? The first Step 9 corpus is representative and intentionally avoids copying third-party copyrighted collection content.
   - Answer: I have some, but not enough to be confident. Add this to the deferred section and I will build a folder of Postman collections later
8. For gRPC client certificates, is PEM cert/key support enough for the first live transport claim, or should PostMeter add PFX/P12 extraction support for gRPC mTLS even though `@grpc/grpc-js` accepts PEM material directly and would require an additional parsing path?
   - Answer: Add PFX/P12 extraction support

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
- Advanced local automation / unsafe script mode: consider a plugin system or settings panel that can grant selected local capabilities or disable sandboxing entirely for users who intentionally want scripts to modify local files. The maintainer has not chosen between those two models yet; this must be treated as dangerous and visibly separate from the default safe sandbox.
- Direct first-party Postman account/provider integration for fetching team Package Library `@team/package` sources remains deferred. The current reviewed HTTPS source-URL workflow stays the supported path until a future provider-specific auth/import contract is approved.
- Maintainer-provided real-world Postman collection corpora remain deferred until a sanitized folder of collections is available. When provided, add them as compatibility fixtures or external report inputs without copying third-party copyrighted content blindly.
- A stricter Linux deny-by-default seccomp-BPF allowlist is optional future hardening. The maintainer has accepted the current Linux `bubblewrap` namespace isolation plus dangerous-syscall seccomp policy for the current public Linux OS-sandbox claim.

## Risks / Gaps Blocking Production Readiness

- Request scripts run in child processes with minimal environments, Linux `bubblewrap` OS isolation plus dangerous-syscall seccomp policy when available/required, fail-closed Node permission flags in production runtimes, hardened host bridge values, bounded worker heap settings, bounded console/result capture, brokered privileged APIs, explicit unsupported-API errors, and VM timeouts. Native Windows/macOS OS sandbox claim readiness remains blocked until the Windows helper contract and macOS seatbelt launcher path are proven by native-runner packaged probes; this is tracked by `docs/os-sandbox-platform-matrix.json`. The current Linux policy is accepted as sufficient for the current Linux OS-sandbox claim.
- Postman import parity is now the scripting contract direction. The current runtime supports Postman globals, Postman-listed NodeJS module facades, version-pinned Postman bundled library behavior, reviewed CommonJS and constrained ESM package semantics for team/npm/JSR packages including scoped and latest-version external import forms, audited dynamic-code and host-like global behavior, audited runtime-limit behavior with explicit production resource ceilings, audited `HttpOnly` cookie behavior, supported brokered `pm.sendRequest` auth/proxy/TLS/client-certificate behavior including NTLM, Akamai EdgeGrid, JWT Bearer, and ASAP, user-granted file/binary/form-data attachment bindings, reviewed team/external package bundles with workspace review UI and parent-side fetch/review resolution, scoped vault grants with local binding/reset/audit UX, full isolated Handlebars visualizers with reviewed assets, imported GraphQL/gRPC script hooks backed by a live parent-owned desktop gRPC transport and GraphQL message normalization, local mock scripts with `pm.mock`/`pm.state` and `req`/`res`, row-specific Desktop evidence gating for implemented behavior-sensitive Desktop rows, Postman-compatible import/export preservation, a generated parity matrix, a broad real-world-style import corpus, adversarial sandbox tests, installed Postman Desktop 11.71.7 runtime/source audits, and Newman differential suites that compare cleanly against `newman@6.2.2`. The Postman parity production claim gate now has zero default-import blockers. Native Windows/macOS OS sandbox backends remain separate platform work.
- Load tests intentionally skip request scripts under sandbox v1; they use the normal HTTP sender directly and report the skip when scripts are present.
- Native Windows/macOS packaged OS-sandbox assertions remain active platform-claim work. gRPC PFX/P12 client-certificate extraction, Postman-style per-request vault prompts, and checked-in `newman@6.2.2` JSON evidence reports are implemented locally and covered by focused validation.
- Live OAuth provider behavior is not certified yet against Google, Microsoft Entra ID / Azure AD, and GitHub provider tenants.
- Postman import/export now preserves common and advanced auth helpers, variables plus raw Postman variable metadata, HTTP/GraphQL/gRPC scripts, editable examples, cookie metadata, request variables, collection certificates, protocol profiles, mock/vault/visualizer binding metadata, and file/binary body references. Remaining compatibility risk is ongoing broader real-world fixture coverage for obscure Postman export variants rather than an active claim blocker.
- Cookie jar handling covers more common behavior and selected newer attributes, but still needs deeper browser-parity and source-format round-trip coverage.
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

`npm run postman:parity:claim` and `npm run postman:docs:live` are expected to pass for the tracked default Postman import profile. `npm run sandbox:platform:claim` is still expected to fail until its separate platform OS-sandbox blockers are resolved.

Then inspect the worktree:

```bash
git status --short
```
