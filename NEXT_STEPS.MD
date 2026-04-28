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
- Implemented the next package-loading parity tranche with a reviewed in-workspace package cache for exact team Package Library-style `@team/package` specifiers and exact external `npm:package@version` / `jsr:package@version` specifiers. Cached packages require SHA-256 integrity metadata, cannot override built-in facades, are bounded by package/source/dependency/export limits, and can only load declared reviewed dependencies or bundled facades.
- Expanded `pm.visualizer` parity with bounded custom helpers, partials, `Handlebars.SafeString`, inline visualizer scripts, sandboxed iframe `allow-scripts` rendering, and `pm.getData(callback)` data access while preserving iframe CSP/network isolation and renderer/Electron/Node separation.
- Implemented scoped `pm.vault` grants for workspace, collection, and request access with explicit collection/request denial overrides, while keeping all secret operations brokered, bounded, encrypted outside workspace JSON, and audited without secret values.
- Extended the golden Postman/Newman-style corpus to cover reviewed team/external package imports, visualizer helpers/partials/inline scripts, and the expanded sandbox parity behavior.
- Hardened the reviewed package-cache policy to fail closed on duplicate packages, missing reviewed dependencies, package-count overflow, dependency-count overflow, and legacy workspace-wide vault grants that conflict with explicit request/collection denials.
- Completed Step 1 of the Postman import parity plan with a generated official-docs parity matrix source in `src/core/postmanParityMatrix.js` and committed machine-readable output in `docs/postman-sandbox-parity-matrix.json`; the current matrix tracks 304 API, method, property, global, module, protocol, fixture, claim-gate, and security-decision rows against `newman@6.2.2`.
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
- Completed Step 10 of the Postman import parity plan by adding a separate OS-sandbox platform completion matrix at `docs/os-sandbox-platform-matrix.json`, generated from `src/core/osSandboxPlatformMatrix.js`, plus `npm run sandbox:platform:validate` and `npm run sandbox:platform:claim`. Normal validation, CI, release workflows, and `npm run release:gate` now require the platform matrix to stay current, while the stronger platform-equivalent full OS sandbox claim intentionally fails closed until native Windows/macOS backends and the Linux deny-by-default seccomp decision are resolved.
- Completed the current Step 1 evidence-hardening pass by adding the broader Newman-compatible differential fixture `differential-sandbox-broad.collection.json`, extending `npm run postman:parity:diff` to run multiple suites, capturing the installed Postman Desktop 11.71.7 runtime/source audit, and tightening the matrix validator so implemented desktop-required rows cannot rely only on `desktop-observation-template`. Live `newman@6.2.2` comparison passes for both differential suites with zero differences.
- Completed the current Step 2 dynamic-code/host-global audit by adding `differential-dynamic-host-globals.collection.json`, capturing the installed Postman Desktop 11.71.7/postman-sandbox@6.2.2 dynamic-host audit, matching Postman/Newman behavior for direct eval, indirect eval, `Function`, lexical `Buffer`, raw network/browser globals, `process`, `globalThis`, WebAssembly, and constructor escapes, and clearing `global.dynamic-code-and-host-like-globals-audit`.
- Completed the current Step 3 runtime-limit audit by adding `differential-runtime-limits.collection.json`, capturing the installed Postman Desktop 11.71.7/postman-runtime@7.50.0 and `newman@6.2.2` runtime-limit audit, increasing default script/request budgets to the audited 180-second Postman Runtime global timeout, and classifying the remaining explicit size/count caps as intentional strict sandbox security ceilings.
- Completed the current Step 4 `HttpOnly` cookie parity pass by adding `differential-httponly-cookies.collection.json`, capturing the installed Postman Desktop 11.71.7/Newman `HttpOnly` cookie audit, matching Postman/Newman script readability and jar mutation behavior for `HttpOnly` cookies, enabling cookie-jar sends/storage on imported Postman requests, and clearing `cookies.httponly-parity`.
- Completed the current Step 5 `pm.sendRequest` advanced auth/proxy/TLS/client-certificate pass by adding brokered Digest challenge retry, Hawk, AWS Signature v4, OAuth 1.0 signing, HTTP(S) proxy routing, strict TLS policy enforcement, configured client-certificate binding IDs for scripts, explicit NTLM/Akamai fail-closed classification, import/export preservation for advanced auth helpers, `differential-sendrequest-advanced.collection.json`, and `postman-desktop-11.71.7-sendrequest-advanced-audit.json`; live `newman@6.2.2` comparison now passes six differential suites with zero differences.
- Completed the current Step 6 file/binary attachment binding pass by adding workspace-reviewed imported file bindings, parent-side approved regular-file body materialization, brokered `pm.sendRequest` file/binary/form-data binding support, a Workspace binding review panel, denial tests for unbound paths, `differential-sendrequest-files.collection.json`, and `postman-desktop-11.71.7-sendrequest-files-audit.json`; live `newman@6.2.2` comparison now passes seven differential suites with zero differences.
- Completed the current Step 7 package-library fetch/review pass by adding parent-side exact npm and JSR package fetchers, reviewed HTTPS source-URL fetch for team Package Library-style packages, Electron IPC/preload wiring, Workspace fetch-and-review UI, protocol-script package-reference discovery, and fetcher/IPC tests while keeping all runtime script package loading local, synchronous, integrity-checked, and unable to reach registries.
- Completed the current Step 8 built-in package parity pass by replacing the hand-rolled built-in package facades with a generated, version-pinned `postman-sandbox@6.2.2` browser bootcode bundle loaded inside the script VM, adding a completed Postman Desktop 11.71.7 built-in package audit, preserving brokered `stream`/`timers` subset boundaries, and clearing `require.builtin.full-library-parity`.
- Updated the script-worker Node permission read allowlist and sandbox runtime validator so the generated Postman package bundle is available to packaged workers without broadening filesystem access beyond exact runtime files.
- Completed Step 9 of the Postman import parity plan by implementing reviewed multi-file CommonJS package semantics, including package metadata entrypoints, local directory/extension/JSON resolution, reviewed dependency aliases and subpaths, module caching, circular dependencies, default export patterns, bundle integrity, cache persistence, focused corpus coverage, and adversarial loader denials.
- Completed Step 10 of the Postman import parity plan by replacing the visualizer subset renderer with an integrity-checked `handlebars@4.7.9` browser runtime loaded inside a separate visualizer VM context, adding precompile/template/create/helper/partial/decorator/runtime-option coverage, preserving iframe CSP and reviewed-asset policy, and clearing `visualizer.handlebars-full-parity`.
- Completed Step 11 of the Postman import parity plan by adding a live parent-owned desktop gRPC transport for unary, client-streaming, server-streaming, and bidirectional streaming calls, preserving imported gRPC script hook behavior and hardening proto/TLS/client-certificate transport inputs against script-time path mutation.
- Completed Step 12 of the Postman import parity plan by clearing the final `runtime.resource-limit-parity` claim blocker, documenting audited production resource ceilings as safety policy rather than unsupported Postman APIs, regenerating the parity matrix, and making `npm run postman:parity:claim` pass with zero default-import blockers.

## Highest Priority Steps

The secure brokered sandbox base and the default Postman script import profile are now claim-gated as complete. `npm run postman:parity:claim` reports zero default-import blockers in `docs/postman-sandbox-parity-matrix.json`. Keep that command, `npm run postman:parity:validate`, and `npm run postman:parity:diff` passing as the scripting surface changes.

1. Harden the parity evidence and claim harness. Status: complete.
   - Added `test/fixtures/postman/differential-sandbox-broad.collection.json` and extended `npm run postman:parity:diff` to run both `differential-http-core` and `differential-sandbox-broad`.
   - The broad differential suite now compares PostMeter and `newman@6.2.2` outputs for packages, cookies, assertions, timers, dynamic globals, request mutation, `pm.sendRequest` object bodies, and caught failure paths.
   - Added `test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-runtime-source-audit.json` and matrix fixture `desktop-runtime-source-audit-v1` so desktop-required rows are no longer template-only.
   - Tightened `src/core/postmanParityHarness.js` so implemented desktop-required rows cannot reference only `desktop-observation-template`.
   - Former claim blockers cleared: `harness.broad-differential-corpus`, `harness.completed-desktop-observations`.

2. Audit dynamic code and host-like globals against current Postman Desktop and Newman. Status: complete.
   - Added `test/fixtures/postman/differential-dynamic-host-globals.collection.json` and `test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-dynamic-host-globals-audit.json`.
   - PostMeter now matches the observed Postman/Newman profile: direct eval, indirect eval, and `Function` execute only inside the isolated VM; top-level `Buffer` is a hardened lexical facade; raw `fetch`, `XMLHttpRequest`, `WebSocket`, WebAssembly, `process`, `globalThis`, browser DOM/storage globals, and constructor escapes remain absent.
   - Former claim blocker cleared: `global.dynamic-code-and-host-like-globals-audit`.

3. Match or explicitly classify Postman/Newman runtime limits. Status: complete.
   - Added `test/fixtures/postman/differential-runtime-limits.collection.json` and `test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-runtime-limits-audit.json`.
   - Postman Runtime 7.50.0 and Newman Runtime 7.39.1 both default to `timeout.global = 180000`, `timeout.request = Infinity`, and `timeout.script = Infinity`; the sandbox enforces a finite script timeout only when runtime passes one. PostMeter now uses `180000` ms as the default per-script/request safety budget.
   - PostMeter keeps explicit worker heap, broker payload, `pm.sendRequest` response body, final result, console, visualizer, package-cache, mock-state, and workspace payload caps because Postman/Newman either expose no stable equivalent cap or rely on process limits. These are documented production resource ceilings and are covered by adversarial tests rather than unsupported Postman API rows.
   - Former claim blocker cleared: `runtime.resource-limit-parity`.

4. Complete `HttpOnly` cookie behavior parity. Status: complete.
   - Added `test/fixtures/postman/differential-httponly-cookies.collection.json` and `test/fixtures/postman/desktop-observations/postman-desktop-11.71.7-httponly-cookies-audit.json`.
   - PostMeter now matches observed `newman@6.2.2` behavior for script-readable `HttpOnly` cookies: `pm.cookies.get`/`has`/`toObject` expose in-scope `HttpOnly` values, `pm.cookies.jar().getAll` returns a CookieList facade, jar replacement/unset/clear can affect `HttpOnly` cookies, and `pm.sendRequest` response-cookie jar updates preserve readable `HttpOnly` values.
   - Imported Postman HTTP requests now enable cookie-jar sends/storage by default so script-created/imported cookies participate in later imported request sends.
   - Former claim blocker cleared: `cookies.httponly-parity`.

5. Complete `pm.sendRequest` advanced auth, proxy, TLS, and client-certificate parity. Status: complete.
   - Added parent-brokered Digest challenge retry, Hawk, AWS Signature v4, and OAuth 1.0 signing for script-created requests, with `differential-sendrequest-advanced.collection.json` covering the Newman-compatible Digest/Hawk/AWS subset and focused sender tests covering OAuth 1.0.
   - Added brokered HTTP(S) proxy routing without exposing raw sockets/agents/tunnel handles to scripts, kept script-level TLS validation disable switches fail-closed, and required configured client-certificate binding IDs instead of script-supplied certificate/key/PFX paths.
   - Imported/exported advanced auth helper shapes now preserve Digest, Hawk, AWS Signature v4, OAuth 1.0, NTLM, and Akamai EdgeGrid metadata. NTLM and Akamai EdgeGrid remain advanced stateful transport follow-ups outside the cleared sandbox API rows.
   - Former claim blocker cleared: `sendRequest.advanced-auth-proxy`.

6. Implement user-granted file and binary attachment bindings for brokered script requests. Status: complete.
   - Added normalized workspace file bindings, a Workspace review/bind panel, parent-side regular-file reads under the request body cap, and brokered `pm.sendRequest` support for approved file, binary, and multipart form-data body references without exposing filesystem APIs, local paths, or file contents to the worker.
   - Added `differential-sendrequest-files.collection.json`, attachment fixtures, and `postman-desktop-11.71.7-sendrequest-files-audit.json`. Live `newman@6.2.2` comparison now covers imported binary/file-style bodies and multipart form-data attachments; focused PostMeter sender/sandbox tests cover brokered `pm.sendRequest` bindings and unbound-path denial because Newman reports script-originated file uploads as disallowed.
   - Former claim blocker cleared: `sendRequest.file-binary-bindings`.

7. Complete package-library fetch, review, and first-run resolution. Status: complete.
   - Added parent-side exact `npm:package@version` fetching through the npm registry metadata/tarball path, exact `jsr:@scope/package@version` fetching through JSR version metadata/module paths with checksum verification, and reviewed HTTPS source-URL fetching for team Package Library-style `@team/package` imports.
   - Added Electron IPC/preload wiring and Workspace fetch-and-review actions for missing imported package references; fetched packages are only saved after review and enter the same SHA-256 reviewed cache/integrity model as manually pasted packages.
   - Scripts remain unable to fetch, install, update, or resolve packages at runtime. The VM package loader still only consumes local reviewed cache entries and bundled facades.
   - Former claim blocker cleared: `require.pm.online-fetch-review`.

8. Replace package and module facades with version-pinned full behavior or prove exact subset boundaries. Status: complete.
   - Added generated `src/core/postmanSandboxBootcodeBundle.js` from `postman-sandbox@6.2.2` `.cache/bootcode.browser.js` with Browserify entry modules disabled, loaded only inside the script VM.
   - Built-in packages now use Postman's pinned bundle for `ajv`, `backbone`, `chai`, `cheerio`, `crypto-js`, `csv-parse/lib/sync`, `json`, `lodash`, `moment`, `postman-collection`, `tv4`, `uuid`, and `xml2js`; `path`, `assert`, `buffer`, `util`, `url`, `punycode`, `querystring`, `string-decoder`, and `events` use the same VM bundle.
   - Preserved explicit subset boundaries for `stream` and `timers`: they remain PostMeter script-safe facades, with timers brokered through the async tracker, because the raw Browserify shims assume ambient window/timer behavior.
   - Updated the Node permission read allowlist and runtime validation to include only the exact generated Postman bundle files and reviewed package-cache helper needed by the VM package loader, preserving fail-closed worker launch behavior.
   - Host Node, native modules, arbitrary paths, registry access, filesystem access, process access, Electron, and renderer access remain blocked.
   - Added `postman-desktop-11.71.7-builtin-package-audit.json` and regenerated the parity matrix. Former claim blocker cleared: `require.builtin.full-library-parity`.

9. Implement full reviewed-package CommonJS semantics. Status: complete.
   - Reviewed exact `@team/package`, `npm:package@version`, and `jsr:package@version` cache entries now support multi-file bundles, package metadata entrypoints, package.json directory entrypoints, `.js`/`.cjs`/`.mjs`/`.json` extension resolution, local relative modules, reviewed dependency aliases, reviewed dependency subpaths, module caching, circular dependencies, `module.exports`/`exports`, `module.require`, `require.resolve`, `__filename`, `__dirname`, default export object patterns, and deterministic cannot-resolve errors.
   - Bundle integrity now covers normalized reviewed file maps, package metadata, and entrypoint metadata while legacy single-source cache entries keep the original source digest. Dependency declarations, alias caps, source/file/package caps, duplicate-package denial, missing-dependency denial, host Node denial, path/URL denial, and adversarial package-loader tests remain enforced.
   - Added golden corpus coverage for a reviewed multi-file CommonJS package and `postman-desktop-11.71.7-commonjs-package-audit.json`; regenerated the parity matrix. Former claim blocker cleared: `require.pm.commonjs-bundle-semantics`.

10. Complete visualizer Handlebars and isolated render parity. Status: complete.
    - Replaced the safe Handlebars-style subset with a vendored, gzip-compressed, SHA-256-checked `handlebars@4.7.9` browser runtime loaded inside a separate visualizer VM context. Postman Desktop 11.71.7 packages `handlebars@4.7.8`; PostMeter uses the patched 4.7-compatible line because current npm advisories cover `<=4.7.8`.
    - Added coverage for `Handlebars.compile`, `precompile`, `template`, `create`, helpers, block helpers, helper hash/data/runtime options, dynamic partials, inline partials, custom decorators, whitespace/noEscape behavior, `SafeString`, data/root lookup, `pm.getData`, reviewed assets, and hostile visualizer documents.
    - Kept iframe CSP, no Electron/Node/parent DOM access, no unreviewed network loads, exact script-worker runtime-file allowlisting, and adversarial helper-option constructor/prototype denials.
    - Former claim blocker cleared: `visualizer.handlebars-full-parity`.

11. Implement live/native desktop gRPC transport. Status: complete.
    - Added parent-owned desktop gRPC execution for unary, client-streaming, server-streaming, and bidirectional streaming methods through `@grpc/grpc-js` and `@grpc/proto-loader`.
    - Preserved Before invoke, On message, and After response script behavior, metadata, messages, status, trailers, cancellation, and error shape without giving scripts raw socket access.
    - Snapshotted proto source/path, include dirs, TLS material, client options, and client-certificate auth before Before invoke so script-mutated environment variables cannot redirect parent filesystem/TLS reads.
    - Former claim blocker cleared: `grpc.live-desktop-transport`.

12. Close the final 1:1 Postman script compatibility claim. Status: complete.
    - `npm run postman:parity:claim` reports zero default-import blockers.
    - `docs/COMPATIBILITY.md` no longer lists unsupported Postman script APIs for the supported import profile.
    - `npm run check`, `npm run sandbox:validate`, `npm run postman:parity:validate`, `npm run postman:parity:diff -- --newman --download-newman`, and relevant desktop observation/differential checks pass.
    - Keep platform OS-sandbox completion separate under `docs/os-sandbox-platform-matrix.json`; `npm run sandbox:platform:claim` is not part of the Postman API parity claim.

## Questions For Maintainer After Implementation

No answers are blocking the local implementation pass. Please answer these before expanding the sandbox surface or changing product positioning:

1. Should an unsafe local automation mode, if implemented later, live behind a plugin model, a settings panel with per-capability permissions, a CLI-only flag, or some combination of those?
2. For Linux, is the current `bubblewrap` namespace/filesystem/network sandbox plus dangerous-syscall seccomp policy sufficient for the public claim, or should "full syscall-policy sandbox" require a maintained deny-by-default seccomp-BPF allowlist even if that means adding a native helper and more platform maintenance?
3. For Windows/macOS, are native helper binaries or native Node addons acceptable for AppContainer/seatbelt-style sandbox launchers, or should PostMeter avoid native helpers and keep the public claim scoped below equivalent OS-level coverage on those platforms?
4. For the Newman corpus, `newman@6.2.2` is the current npm `latest` target. Do you want checked-in Newman JSON run reports generated by that exact version once a maintainer-approved Newman fixture export workflow exists?
5. The first team Package Library fetch flow uses a maintainer/user-provided HTTPS source URL because Postman's docs expose team packages through authenticated app/team workflows, not a public anonymous package registry. Should a later version add a first-party Postman account/provider integration for fetching `@team/package` sources directly?
6. The first vault UX supports workspace-level local binding, metadata, reset, and audit review. Should a later version add per-request prompts similar to Postman's desktop vault flow?
7. Do you have maintainer-approved public or user-provided Postman collections that can be checked into the compatibility corpus? The first Step 9 corpus is representative and intentionally avoids copying third-party copyrighted collection content.
8. For gRPC client certificates, is PEM cert/key support enough for the first live transport claim, or should PostMeter add PFX/P12 extraction support for gRPC mTLS even though `@grpc/grpc-js` accepts PEM material directly and would require an additional parsing path?

## Blocked External Validation

These are production-readiness items, but they cannot be completed by local iteration alone. Keep them out of the local burn-down list until the needed external runner/credential inputs exist.

1. Execute and monitor native release validation in CI.
   - Requires a GitHub tag/release workflow run on native Windows and macOS runners.
   - Fix any runner-specific installer, permissions, quarantine, mount, or Launch Services issues discovered by CI.
   - Linux deb/AppImage validation can continue locally and in CI through `release:validate`.

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
- Advanced local automation / unsafe script mode: consider a plugin system, settings panel, or explicit CLI opt-in that can grant selected local capabilities or disable sandboxing entirely for users who intentionally want scripts to modify local files. This must be treated as dangerous and visibly separate from the default safe sandbox.

## Risks / Gaps Blocking Production Readiness

- Request scripts run in child processes with minimal environments, Linux `bubblewrap` OS isolation plus dangerous-syscall seccomp policy when available/required, fail-closed Node permission flags in production runtimes, hardened host bridge values, bounded worker heap settings, bounded console/result capture, brokered privileged APIs, explicit unsupported-API errors, and VM timeouts. Native Windows/macOS OS sandbox backends and optional stricter Linux deny-by-default seccomp-BPF allowlisting remain incomplete and are tracked by `docs/os-sandbox-platform-matrix.json`.
- Postman import parity is now the scripting contract direction. The current runtime supports Postman globals, Postman-listed NodeJS module facades, version-pinned Postman bundled library behavior, reviewed multi-file CommonJS package semantics, audited dynamic-code and host-like global behavior, audited runtime-limit behavior with explicit production resource ceilings, audited `HttpOnly` cookie behavior, advanced brokered `pm.sendRequest` auth/proxy/TLS/client-certificate behavior, user-granted file/binary/form-data attachment bindings, reviewed exact team/external package bundles with workspace review UI and parent-side fetch/review resolution, scoped vault grants with local binding/reset/audit UX, full isolated Handlebars visualizers with reviewed assets, imported GraphQL/gRPC script hooks backed by a live parent-owned desktop gRPC transport, local mock scripts with `pm.mock`/`pm.state`, Postman-compatible import/export preservation, a generated parity matrix, a broad real-world-style import corpus, adversarial sandbox tests, installed Postman Desktop 11.71.7 runtime/source audits, and seven Newman differential suites that compare cleanly against `newman@6.2.2`. The production claim gate currently passes with zero default-import blockers. Native Windows/macOS OS sandbox backends remain separate platform work.
- Load tests intentionally skip request scripts under sandbox v1; they use the normal HTTP sender directly and report the skip when scripts are present.
- Native Windows/macOS packaged OS-sandbox assertions and broader externally captured Postman Desktop/Newman reports for `newman@6.2.2` remain external/future validation work.
- Live OAuth provider behavior is not certified yet against Google, Microsoft Entra ID / Azure AD, and GitHub provider tenants.
- Postman import/export now preserves common and advanced auth helpers, variables plus raw Postman variable metadata, HTTP/GraphQL/gRPC scripts, editable examples, cookie metadata, request variables, collection certificates, protocol profiles, mock/vault/visualizer binding metadata, and file/binary body references. The remaining compatibility risk is not the core preservation path but broader real-world fixture coverage for obscure Postman export variants and stateful auth helpers such as NTLM.
- Cookie jar handling covers more common behavior and selected newer attributes, but still needs deeper browser-parity and source-format round-trip coverage.
- JMeter import/export covers common HTTP sampler metadata, assertion mappings including XPath, extractors, selected timer/controller metadata round-tripping, Size Assertion mapping, nested-controller metadata preservation, representative timer metadata, mapped disabled-state preservation, and unsupported metadata preservation, but it is still not a full JMeter test-plan model.
- Automated Electron UI coverage is broader and includes screenshot, mocked OAuth, and XML/HTML formatting smokes, but it is still Linux/headless focused and not broad cross-platform UI automation.
- Custom URI-scheme OAuth redirects are implemented and mocked; Linux deb/AppImage desktop-entry registration, macOS zip app-bundle metadata, and native-runner validation scripts are in place, but Windows/macOS native release validation has not executed in this environment.
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
npm run sandbox:platform:claim
```

`npm run postman:parity:claim` is expected to pass. `npm run sandbox:platform:claim` is still expected to fail until its separate platform OS-sandbox blockers are resolved.

Then inspect the worktree:

```bash
git status --short
```
