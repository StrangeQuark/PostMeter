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
- Completed Step 10 of the Postman import parity plan by adding a separate OS-sandbox platform completion matrix at `docs/os-sandbox-platform-matrix.json`, generated from `src/core/osSandboxPlatformMatrix.js`, plus `npm run sandbox:platform:validate` and `npm run sandbox:platform:claim`. Normal validation, CI, release workflows, and `npm run release:gate` now require the platform matrix to stay current, while the stronger platform-equivalent full OS sandbox claim intentionally fails closed until native Windows/macOS backends and the Linux deny-by-default seccomp decision are resolved.
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

## Highest Priority Steps

The secure brokered sandbox base remains strong, and the Postman script import parity burn-down is complete for the tracked default import profile. The current audited parity target is Postman Desktop 11.71.7 with `postman-sandbox@6.2.2` and Postman Runtime 7.50.0, plus Newman 6.2.2 with Postman Runtime 7.39.1 for Newman-compatible surfaces. `npm run postman:parity:validate`, `npm run postman:docs:validate`, and `npm run postman:parity:claim` must stay green; `npm run postman:docs:live` must also pass before repeating the claim against current upstream docs. Platform-equivalent OS sandbox completion remains separate under `docs/os-sandbox-platform-matrix.json`.

1. Tighten desktop evidence from broad row-id coverage to row-specific behavior proof. Status: completed.
   - Cleared blocker: `harness.row-specific-desktop-behavior-evidence`.
   - Added row-specific Desktop evidence metadata for implemented behavior-sensitive Desktop rows, including a grouped row-specific audit for Desktop-only runRequest, GraphQL HTTP-body, mock/state, vault, and reviewed package workflow rows.
   - Extended `src/core/postmanParityHarness.js` so Desktop-required rows can declare `desktopEvidence: "row-specific-behavior"` and fail validation unless a completed artifact supplies explicit `rowEvidence` metadata for that exact row.
   - Updated `test/fixtures/postman/desktop-observations/README.md` with the evidence standard and added regression coverage that rejects broad source-audit-only coverage for behavior-sensitive rows.

2. Complete Postman response assertion shortcut parity. Status: completed.
   - Cleared blockers: `assertion.pm.response.to.have.status-name`, `assertion.pm.response.to.have.responseTime`.
   - Matched Postman's status-code/status-text behavior for `pm.response.to.have.status(...)`, including strings such as `"Created"`.
   - Implemented `pm.response.to.have.responseTime` and its chain behavior with `not`, comparison helpers, and Postman-compatible failure output where practical.
   - Added focused runtime coverage for pass/fail cases.

3. Complete protocol metadata, trailer, message, and message-list assertion parity. Status: completed.
   - Cleared blockers: `assertion.pm.response.to.have.metadata`, `assertion.pm.response.to.have.trailer`, `assertion.pm.response.to.have.message`, `assertion.pm.response.messages.to.include`, `assertion.pm.response.messages.to.have.property`, `assertion.pm.response.messages.to.have.jsonSchema`, `assertion.pm.response.messages.idx`, `assertion.pm.response.messages.filter-object-predicate`, `assertion.pm.request.to.have.metadata`, `assertion.pm.request.messages.each`, `assertion.pm.request.messages.to.include`, `assertion.pm.request.messages.to.have.property`, `assertion.pm.request.messages.to.have.jsonSchema`.
   - Implemented the gRPC/GraphQL protocol assertion chains documented in Postman's test examples, including default deep/nested semantics and object-predicate message filtering.
   - Added row-specific Postman Desktop evidence for message-list `idx`, `each`, metadata/trailer behavior, and assertion error shapes.
   - Covered streaming and unary/client-streaming cases with focused fixtures.

4. Complete full `pm.expect` Chai BDD parity. Status: completed.
   - Cleared blockers: `assertion.pm.expect.full-chai-bdd-surface`, `assertion.pm.expect.to.have.jsonSchema`.
   - Extended the custom `pm.expect` facade to match the Postman-bundled Chai BDD assertion surface required by the tracked import profile, including arbitrary-value `jsonSchema` and observed plugin-style helpers.
   - Kept the bundled `chai` package available through `require('chai')` while closing the tracked facade gaps.

5. Complete live SDK object parity for list/filter/prototype behavior. Status: completed.
   - Cleared blockers: `sdk.list.filter-object-predicate`, `sdk.live-object.constructor-prototype-parity`.
   - Added SDK-style object-predicate filtering for live `PropertyList`/message-list facades without permitting prototype pollution or unsafe path traversal.
   - Kept hardened facade prototypes instead of exposing raw SDK constructors, with observed constructor/prototype parity and adversarial escape coverage.

6. Complete GraphQL client and subscription message parity. Status: completed.
   - Cleared blockers: `graphql.client-interface-hooks`, `graphql.subscription.response-messages`.
   - Captured row-specific Postman Desktop evidence for GraphQL client script hook behavior separate from HTTP GraphQL body mode.
   - Implemented GraphQL subscription/multiple-response `pm.response.messages` normalization for imported GraphQL requests, including message assertions and response timing.

7. Capture local mock helper Desktop evidence. Status: completed.
   - Cleared blockers: `mock.req-surface`, `mock.res-surface`.
   - Compared Postman Desktop local mock `req`/`res` helper behavior against PostMeter's loopback mock runner, including `req.params`, `req.json()`, `res.status`, `res.json`, `res.send`, headers, return/await behavior, and error paths.
   - Promoted the rows to implemented after row-specific evidence and focused local mock coverage were added.

8. Implement NTLM auth parity for imported requests and brokered `pm.sendRequest`. Status: completed.
   - Cleared blocker: `sendRequest.auth.ntlm`.
   - Implemented a parent-owned NTLM challenge/response handshake without exposing sockets or credentials to the script worker.
   - Covered imported request execution and script-created `pm.sendRequest` objects with local challenge-server tests and fail-closed paths.

9. Implement Akamai EdgeGrid auth parity. Status: completed.
   - Cleared blocker: `sendRequest.auth.akamai-edgegrid`.
   - Implemented Postman-compatible signing for access token, client token, client secret, nonce/timestamp, headers-to-sign, canonicalization, query/body behavior, and imported/exported metadata.
   - Added deterministic signer coverage, brokered sender coverage, importer/exporter round-trip tests, and parity evidence tied to current Postman Desktop behavior.

10. Implement JWT Bearer and ASAP auth parity. Status: completed.
   - Cleared blockers: `sendRequest.auth.jwt-bearer`, `sendRequest.auth.asap`.
   - Captured current Postman Desktop export/runtime shape for both helpers, including ASAP.
   - Implemented parent-owned token signing/generation with supported algorithms, key material binding, header/query placement, variable interpolation, clock/nonce behavior, and explicit denial for script-supplied arbitrary key files.
   - Added deterministic crypto tests, imported metadata round-trip tests, and brokered request tests for both helper types.

11. Implement native ESM execution for reviewed JSR packages. Status: completed.
   - Cleared blocker: `require.pm.jsr-esm-module-semantics`.
   - Kept the parent-side JSR fetch/review/checksum workflow and added a VM-safe ESM loader for reviewed cache entries with constrained `import`/`export` syntax, default/named exports, dependency resolution, caching, and deterministic errors.
   - Preserved package security boundaries: no runtime registry fetch, no filesystem/path/URL loading from scripts, no `node:` specifiers, no native modules, no unreviewed dependencies, and size/dependency caps.
   - Added focused tests for reviewed JSR-style ESM package syntax without runtime registry access.

12. Fix `pm.message.timestamp` Date-object parity. Status: completed.
   - Cleared blocker: `grpc.pm.message.timestamp-date`.
   - Changed the gRPC On message script facade so `pm.message.timestamp` behaves like Postman's documented `Date` object while remaining hardened against constructor/prototype escape.
   - Added focused tests for `instanceof Date`, `Object.prototype.toString`, Date methods, `toJSON`, and adversarial constructor escape attempts.
   - Updated gRPC transport/audit evidence for the matched Postman Desktop behavior.

13. Re-close the Postman script compatibility claim after the blockers are implemented. Status: completed.
   - Regenerated `docs/postman-sandbox-parity-matrix.json` and updated `docs/COMPATIBILITY.md`, `docs/SANDBOX_CONTRACT.md`, `TECH_SPECS.MD`, `README.md`, and this file so they record zero default-import blockers.
   - Verification completed: `npm run check`, `npm run sandbox:validate`, `npm run sandbox:platform:validate`, `npm run postman:parity:validate`, `npm run postman:parity:claim`, `npm run postman:parity:diff -- --newman --download-newman`, and relevant new desktop evidence/differential checks.
   - Keep platform OS-sandbox completion separate under `docs/os-sandbox-platform-matrix.json`; `npm run sandbox:platform:claim` is not part of the Postman API parity claim.

14. Make the official Postman/Newman docs sweep repeatable and release-gated. Status: completed.
   - Added `src/core/postmanDocsCoverageAudit.js`, `scripts/postmanDocsCoverageAudit.js`, and committed `docs/postman-docs-coverage-audit.json`.
   - The live audit discovers relevant official docs from `learning.postman.com/sitemap.xml`, includes official Postman Collection SDK references from `postmanlabs.com/postman-collection`, checks the npm `newman` latest dist-tag, extracts script/SDK/package tokens, and requires every token to map to explicit parity rows or documented exclusions.
   - Added `npm run postman:docs:validate`, `npm run postman:docs:write`, and `npm run postman:docs:live`; wired committed docs validation into `npm run check`, CI, release workflow, and `npm run release:gate`.
   - Current live result: 431 extracted tokens from 140 official sources, zero unmatched tokens, targeting Postman Desktop 11.71.7 / `postman-sandbox@6.2.2` and `newman@6.2.2`.

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
- Postman import parity is now the scripting contract direction. The current runtime supports Postman globals, Postman-listed NodeJS module facades, version-pinned Postman bundled library behavior, reviewed CommonJS and constrained ESM package semantics for team/npm/JSR packages including scoped and latest-version external import forms, audited dynamic-code and host-like global behavior, audited runtime-limit behavior with explicit production resource ceilings, audited `HttpOnly` cookie behavior, supported brokered `pm.sendRequest` auth/proxy/TLS/client-certificate behavior including NTLM, Akamai EdgeGrid, JWT Bearer, and ASAP, user-granted file/binary/form-data attachment bindings, reviewed team/external package bundles with workspace review UI and parent-side fetch/review resolution, scoped vault grants with local binding/reset/audit UX, full isolated Handlebars visualizers with reviewed assets, imported GraphQL/gRPC script hooks backed by a live parent-owned desktop gRPC transport and GraphQL message normalization, local mock scripts with `pm.mock`/`pm.state` and `req`/`res`, row-specific Desktop evidence gating for implemented behavior-sensitive Desktop rows, Postman-compatible import/export preservation, a generated parity matrix, a broad real-world-style import corpus, adversarial sandbox tests, installed Postman Desktop 11.71.7 runtime/source audits, and Newman differential suites that compare cleanly against `newman@6.2.2`. The Postman parity production claim gate now has zero default-import blockers. Native Windows/macOS OS sandbox backends remain separate platform work.
- Load tests intentionally skip request scripts under sandbox v1; they use the normal HTTP sender directly and report the skip when scripts are present.
- Native Windows/macOS packaged OS-sandbox assertions and broader externally captured Postman Desktop/Newman reports for `newman@6.2.2` remain external/future validation work.
- Live OAuth provider behavior is not certified yet against Google, Microsoft Entra ID / Azure AD, and GitHub provider tenants.
- Postman import/export now preserves common and advanced auth helpers, variables plus raw Postman variable metadata, HTTP/GraphQL/gRPC scripts, editable examples, cookie metadata, request variables, collection certificates, protocol profiles, mock/vault/visualizer binding metadata, and file/binary body references. Remaining compatibility risk is ongoing broader real-world fixture coverage for obscure Postman export variants rather than an active claim blocker.
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
