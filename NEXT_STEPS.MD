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
- Completed Step 1 of the Postman import parity plan with a generated official-docs parity matrix source in `src/core/postmanParityMatrix.js` and committed machine-readable output in `docs/postman-sandbox-parity-matrix.json`; the current matrix tracks 293 API, method, property, global, module, protocol, fixture, claim-gate, and security-decision rows against `newman@6.2.2`.
- Added `src/core/postmanParityHarness.js` plus `scripts/postmanParityHarness.js` for matrix validation, matrix regeneration, local PostMeter differential runs, and optional live Newman comparison.
- Completed Step 4 of the Postman import parity plan by implementing deterministic `pm.test` result ordering, `pm.test.skip`, `pm.test.index`, chained test registration, mixed callback/promise tests, broader Chai-compatible `pm.expect`/`chai.assert` helpers, response JSON-schema/error helpers, variable `clear`/`toJSON`/metadata handling, iteration-data unset/JSON behavior, the documented Postman dynamic variable catalog, request interpolation for dynamic variables, `pm.execution.location`, and a 10-call per-script `pm.execution.runRequest` limit while preserving the script-worker permission boundary.
- Added the HTTP-core differential collection fixture and desktop-observation template under `test/fixtures/postman`, then covered the new matrix/harness with focused Node tests and `npm run postman:parity:validate` in `npm run check`.
- Completed Step 2 of the Postman import parity plan by adding the documented Postman global object surface, sandboxed `Function` support with escape regressions, bounded interval/microtask/timer behavior, richer console capture, Postman-listed NodeJS module facades, and safe array-buffer results for Blob/Web Crypto without exposing host constructors.
- Expanded the golden Postman/Newman-style corpus and generated parity matrix so runtime globals, built-in package facades, legacy package globals, and Postman-listed NodeJS modules are fixture-covered instead of tracked as unstarted gaps.
- Completed Step 5 of the Postman import parity plan by expanding brokered `pm.sendRequest` input normalization, callback/promise cookie helper behavior, staged `pm.sendRequest` cookie-jar side effects, reviewed package-cache import/UI workflow, safer Handlebars-compatible visualizer behavior with integrity-checked reviewed assets, and desktop vault binding/reset/audit UX without exposing host filesystem, process, Node, Electron, renderer, or raw network primitives to scripts.
- Completed Step 6 of the Postman import parity plan by preserving and executing imported GraphQL Before query/After response hooks, preserving and executing imported gRPC Before invoke/On message/After response hooks with protocol metadata/messages/`pm.message`, and recording the current official-docs WebSocket/Socket.IO no-script-hook audit in the generated parity matrix.
- Completed Step 7 of the Postman import parity plan by adding a core local mock server runner with imported mock script preservation, method/path-only route matching, path variables, saved-example fallback, `pm.mock.matchRequest`, `pm.mock.sendExample`, Express-style `req`/`res` helpers, top-level mock-script `await`/`return`, and bounded transaction-safe `pm.state` storage.
- Completed Step 8 of the Postman import parity plan by adding bounded Postman metadata preservation on collections/folders/requests/examples/certificates, Postman-compatible collection export, original/deterministic request-ID aliases for `runRequest`/`setNextRequest`/`pm.info`, import-order preservation for mixed request/folder hierarchies, and round-trip coverage for script events, variables, package/cookie/vault/mock/visualizer bindings, protocol profiles, examples, certificates, auth metadata, and file/binary body references.
- Completed Step 9 of the Postman import parity plan by adding the production claim gate (`npm run postman:parity:claim`), release-gate manifest validation (`npm run release:gate`), a broad real-world-style Postman import corpus, expanded adversarial sandbox tests, and regenerated parity-matrix rows for claim blockers. The claim gate currently fails closed on five remaining default-import blockers: `cookies.httponly-parity`, `sendRequest.advanced-auth-proxy`, `sendRequest.file-binary-bindings`, `require.pm.online-fetch-review`, and `grpc.live-desktop-transport`.
- Completed Step 10 of the Postman import parity plan by adding a separate OS-sandbox platform completion matrix at `docs/os-sandbox-platform-matrix.json`, generated from `src/core/osSandboxPlatformMatrix.js`, plus `npm run sandbox:platform:validate` and `npm run sandbox:platform:claim`. Normal validation, CI, release workflows, and `npm run release:gate` now require the platform matrix to stay current, while the stronger platform-equivalent full OS sandbox claim intentionally fails closed until native Windows/macOS backends and the Linux deny-by-default seccomp decision are resolved.

## Highest Priority Steps

The secure brokered sandbox base is in place. The next highest priority is full 1:1 Postman scripting import parity as defined by `docs/SANDBOX_CONTRACT.md`. Do not claim complete Postman script compatibility until every item below is implemented, verified, and reflected in `docs/COMPATIBILITY.md`.

1. Build the Postman parity inventory and differential harness first. Status: complete for the initial Step 1 implementation; keep extending the matrix and fixtures as later steps move rows from gap to implemented.
   - Generate a machine-readable parity matrix from the official Postman Sandbox API reference, script run-order docs, dynamic-variable docs, package docs, mock docs, vault docs, GraphQL docs, and gRPC docs.
   - Add a status row for every API/method/property/global/module/protocol hook: unsupported, implemented, intentionally stricter, desktop-only, Newman-compatible, fixture-covered, and security-reviewed.
   - Extend the existing `test/fixtures/postman` corpus so each row has at least one fixture before it can be marked complete.
   - Add a differential runner that captures PostMeter output and latest targeted Newman output (`newman@6.2.2`) for supported surfaces, then compares test names/order/results, variables, cookies, request mutations, console output, response objects, and errors.
   - Add a desktop-observation path for APIs Newman does not support, especially `pm.vault`, `pm.mock`, `pm.state`, GraphQL hooks, gRPC hooks, visualizer behavior, and desktop-specific permission prompts.
   - Implemented artifacts: `docs/postman-sandbox-parity-matrix.json`, `src/core/postmanParityMatrix.js`, `src/core/postmanParityHarness.js`, `scripts/postmanParityHarness.js`, `test/fixtures/postman/differential-http-core.collection.json`, and `test/fixtures/postman/desktop-observations/`.
   - Verification commands: `npm run postman:parity:validate`, `npm run postman:parity:diff`, and optional live Newman comparison with `npm run postman:parity:diff -- --newman --download-newman`.

2. Replace partial script globals and module facades with Postman-compatible runtime surfaces. Status: complete for the Step 2 implementation; keep adding narrower row-level fixtures if future Postman Desktop/Newman observations find package or global edge-case differences.
   - Implement Postman's documented global objects: URL, URLSearchParams, Web Crypto, encoding globals, Blob/File, Web Streams where exposed, structuredClone, queueMicrotask, AbortController/AbortSignal, DOM-style events/errors, typed arrays, and safe dynamic-code behavior where Postman exposes it.
   - Implement bounded `setInterval`/`clearInterval`, richer timer behavior, queueMicrotask ordering, promise/microtask drain parity, and console method/formatting parity.
   - Add script-safe Postman-listed NodeJS module facades for `path`, `assert`, `buffer`, `util`, `url`, `punycode`, `querystring`, `string-decoder`, `stream`, `timers`, and `events`.
   - Replace the current lightweight bundled library facades with version-pinned behavior for `ajv`, `chai`, `cheerio`, `csv-parse/lib/sync`, `lodash`, `moment`, `postman-collection`, `uuid`, and `xml2js`.
   - Preserve the security boundary: no host Node resolver, host filesystem, host process, native modules, shell, raw networking, Electron, or renderer DOM access.
   - Implemented artifacts: `src/core/scriptRuntime.js`, `test/electron/scriptRuntime.test.js`, `test/fixtures/postman/newman-sandbox-v1.collection.json`, `test/fixtures/postman/newman-sandbox-v1.expected.json`, and regenerated `docs/postman-sandbox-parity-matrix.json`.
   - Verification commands: `node --test test/electron/scriptRuntime.test.js`, `node --test test/electron/postmanSandboxCorpus.test.js`, and `npm run postman:parity:validate`.

3. Implement full Postman Collection SDK object parity for script-facing data. Status: complete for the Step 3 implementation; keep protocol-specific behavior in Step 6 and broader assertion/body/file edge cases in later steps.
   - Use a safely bundled/hardened `postman-collection` SDK where possible, or implement faithful facades for Request, Url, Header/HeaderList, QueryParam/QueryParamList, RequestBody, FormParam, Variable/VariableList, Cookie/CookieList, Response, and PropertyList.
   - Expand `pm.request` mutation and read behavior to match Postman for HTTP, GraphQL, and gRPC, including URL/query/header/body/auth mutation, list methods, clone/toJSON/toString behavior, disabled items, and case-insensitive headers.
   - Expand `pm.response` to full Postman behavior: text/json parsing, code/status/reason, response time/size, headers, cookies where exposed, binary/streaming bodies, metadata, trailers, messages, and response assertion chains.
   - Add adversarial tests for every SDK object crossing the host boundary so constructors, prototypes, accessors, errors, promises, and returned arrays cannot escape the worker sandbox.
   - Implemented artifacts: hardened Collection SDK facades in `src/core/scriptRuntime.js`, request mutation commit support in `src/core/scriptedRequestLifecycle.js`, expanded runtime/isolation tests in `test/electron/scriptRuntime.test.js` and `test/electron/scriptSandbox.test.js`, SDK object coverage in `test/fixtures/postman/newman-sandbox-v1.collection.json`, and regenerated `docs/postman-sandbox-parity-matrix.json`.
   - Verification commands: `node --test test/electron/scriptRuntime.test.js`, `node --test test/electron/scriptSandbox.test.js`, `node --test test/electron/postmanSandboxCorpus.test.js`, and `npm run postman:parity:validate`.

4. Finish tests, assertions, variables, dynamic variables, and run-order semantics. Status: complete for the Step 4 implementation; keep using Desktop/Newman differential observations to refine exact error-message and obscure Chai edge-case parity if future fixtures expose differences.
   - Implement full `pm.test` parity, including `pm.test.skip`, `pm.test.index`, returned chaining, callback/promise mixing, duplicate names, skipped result shape, nested async tests, and deterministic order.
   - Replace the practical `pm.expect` subset with full Chai-compatible behavior and Postman's response assertion helpers, including JSON schema validation behavior and error-message parity where practical.
   - Complete variable API parity for `pm.variables`, `pm.environment`, `pm.collectionVariables`, `pm.globals`, and `pm.iterationData`, including `clear`, `toJSON`, metadata, current/initial values, disabled variables, sensitive masking, folder/request variables, and exact precedence.
   - Implement the full Postman dynamic variable catalog and per-request generation semantics for `$guid`, `$timestamp`, `$isoTimestamp`, `$randomUUID`, and every documented `$random*` category.
   - Match collection/folder/request pre-request and post-response execution order, `pm.info`, `pm.execution.location`, `setNextRequest`, `skipRequest`, and `runRequest` edge cases.
   - Implemented artifacts: `src/core/scriptRuntime.js`, `src/core/dynamicVariables.js`, `src/core/environmentResolver.js`, `src/core/scriptedRequestLifecycle.js`, `src/core/collectionRunner.js`, `src/core/scriptSandbox.js`, `src/core/sandboxRuntimeValidation.js`, expanded Step 4 coverage in `test/electron/scriptRuntime.test.js`, `test/electron/scriptSandbox.test.js`, `test/electron/postmanSandboxCorpus.test.js`, `test/fixtures/postman/newman-sandbox-v1.collection.json`, regenerated `docs/postman-sandbox-parity-matrix.json`, and updated compatibility docs.
   - Verification commands: `node --test test/electron/scriptRuntime.test.js`, `node --test test/electron/scriptSandbox.test.js`, `node --test test/electron/postmanSandboxCorpus.test.js`, `node --test test/electron/scriptedRequestLifecycle.test.js`, `node --test test/electron/postmanParityHarness.test.js`, `npm run sandbox:validate`, and `npm run postman:parity:validate`.

5. Complete HTTP network, cookie, package-cache, visualizer, and vault parity without weakening sandboxing. Status: complete for the Step 5 implementation; keep adding differential fixtures for obscure Postman Desktop/Newman edge cases, especially unsupported auth schemes, file/binary attachment bindings, and visualizer third-party asset behavior.
   - Expand `pm.sendRequest` to all Postman input shapes: string, plain object, Collection SDK Request, headers in object/array/list form, all body modes, auth helpers, redirects, TLS/cert behavior, timeout/cancellation, callback/promise forms, and response/error object compatibility.
   - Match Postman's cookie model for current-request helpers and jar helpers, including callback ordering, domain allowlists, Cookie objects, expiry/max-age, Secure, HttpOnly, SameSite, Priority, Partitioned, host-only, prefixes, replacement, and `pm.sendRequest` jar side effects.
   - Add package-cache management UI/import flow for missing team/external packages so package references are resolved, reviewed, pinned, integrity-checked, and visible before scripts run.
   - Replace the current Handlebars-style visualizer subset with real Postman visualizer behavior, including compile options, helpers, partials, SafeString, block params, inline scripts, `pm.getData`, common chart-library support through reviewed assets, and isolated rendering.
   - Finish vault desktop parity: prompts, denial behavior, reset/audit UX, denied code-after-call behavior, unavailable-encryption behavior, import-time local secret binding, and clear desktop/Newman support boundaries.
   - Implemented artifacts: `src/core/scriptSandbox.js`, `src/core/scriptRuntime.js`, `src/core/httpClient.js`, `src/core/sandboxPackageCache.js`, `src/core/postmanImporter.js`, `src/core/vaultStore.js`, `electron/main.js`, `electron/preload.js`, workspace package/vault UI in `src/renderer/index.html` and `src/renderer/renderer.js`, focused coverage in `test/electron/scriptSandbox.test.js`, `test/electron/scriptRuntime.test.js`, `test/electron/postmanImporter.test.js`, `test/electron/vaultStore.test.js`, regenerated `docs/postman-sandbox-parity-matrix.json`, and updated compatibility docs.
   - Verification commands: `node --test test/electron/scriptRuntime.test.js test/electron/scriptSandbox.test.js test/electron/postmanImporter.test.js test/electron/vaultStore.test.js`, `npm run postman:parity:validate`, `npm run sandbox:validate`, and `npm run check`.

6. Add protocol-specific Postman script parity. Status: complete for the Step 6 implementation; keep broader protocol-profile import/export round-tripping and live desktop gRPC transport wiring in later steps.
   - Preserve and execute GraphQL imports with Before query and After response hooks, query variables, operation name, auth, headers, response parsing, package imports, and variable interpolation.
   - Preserve and execute gRPC imports with Before invoke, On message, and After response hooks, proto/service/method metadata, method path, request metadata, outgoing messages, streaming method type, incoming messages, response metadata, trailers, status, cancellation, and `pm.message`.
   - Audit Postman's current WebSocket or other streaming protocol script support. If scripts are exportable or documented, implement them; if not, record that fact in the generated parity matrix with a source and fixture.
   - Implemented artifacts: protocol lifecycle dispatch in `src/core/scriptedRequestLifecycle.js`, protocol import preservation in `src/core/postmanImporter.js`, `pm.message` and protocol message/list facades in `src/core/scriptRuntime.js`, gRPC invoker wiring in `src/core/collectionRunner.js`, protocol package-reference scanning in `src/core/sandboxPackageCache.js`, `test/fixtures/postman/protocol-script-hooks.collection.json`, `test/fixtures/postman/desktop-observations/websocket-script-support-audit.json`, `test/electron/postmanProtocolParity.test.js`, expanded importer/runtime coverage, and regenerated `docs/postman-sandbox-parity-matrix.json`.
   - Verification commands: `node --test test/electron/postmanProtocolParity.test.js test/electron/postmanImporter.test.js test/electron/scriptRuntime.test.js test/electron/scriptedRequestLifecycle.test.js test/electron/collectionRunner.test.js`, `npm run postman:parity:validate`, `npm run sandbox:validate`, and `npm run check`.

7. Add local mock server script parity. Status: complete for the Step 7 implementation; keep any broader desktop UI/binding workflow and export round-tripping in Step 8.
   - Implement the mock-only script surface for imported/local Postman mock scripts: `pm.mock.matchRequest`, `pm.mock.sendExample`, saved example response lookup, path variables, route fallback behavior, method/path-only matching, and compatible request/response objects.
   - Implement `pm.state` with `get`, `set`, `delete`, `has`, `keys`, `size`, `clear`, `toObject`, `increment`, `push`, and `addToSet`, using bounded JSON-serializable per-mock-session storage and transaction-safe reset controls.
   - Keep `pm.mock` and `pm.state` unavailable outside the local mock surface, matching Postman's desktop-only boundary.
   - Implemented artifacts: `src/core/localMockServer.js`, `src/core/scriptRuntime.js`, `src/core/scriptSandbox.js`, `src/core/postmanImporter.js`, `src/core/models.js`, `src/core/payloadSchemas.js`, `src/core/sandboxPackageCache.js`, `test/fixtures/postman/local-mock-scripts.collection.json`, `test/electron/localMockServer.test.js`, expanded importer/runtime tests, and regenerated `docs/postman-sandbox-parity-matrix.json`.
   - Verification commands: `node --test test/electron/localMockServer.test.js test/electron/scriptRuntime.test.js test/electron/scriptSandbox.test.js test/electron/postmanImporter.test.js`, `npm run postman:parity:validate`, `npm run sandbox:validate`, and `npm run check`.

8. Upgrade Postman import/export data preservation for full scripting parity. Status: complete for the Step 8 implementation; keep adding real-world round-trip fixtures as new Postman export shapes are observed.
   - Preserve collection, nested folder, and request script events without flattening away run-order information needed for exact script execution.
   - Preserve request IDs or provide deterministic mapping/repair for scripts using `pm.execution.runRequest`.
   - Import and bind protocol profiles, GraphQL/gRPC definitions, package references, visualizer assets, cookie allowlists, vault metadata, mock scripts, mock state configuration, examples, certificates, auth inheritance, variables, and file/binary body references.
   - Round-trip Postman-compatible exports without losing script text, script type, event location, request IDs where possible, examples, package references, certificates, variables, and protocol metadata.
   - Implemented artifacts: bounded optional Postman metadata in `src/core/models.js` and `src/core/ipcValidation.js`, Postman import/export preservation in `src/core/postmanImporter.js`, Postman export wiring in `src/core/collectionImportRegistry.js`, `src/core/collectionFormats.js`, `src/core/payloadSchemas.js`, `electron/fileDialogs.js`, desktop Export > Postman UI wiring in `src/renderer/index.html`, `src/renderer/rendererBootstrap.js`, and `src/renderer/renderer.js`, original-ID alias handling in `src/core/collectionRunner.js` and `src/core/scriptRuntime.js`, and focused coverage in `test/electron/postmanImporter.test.js`, `test/electron/collectionImportRegistry.test.js`, `test/electron/ipcValidation.test.js`, and `test/electron/payloadSchemas.test.js`.
   - Verification commands: `node --test test/electron/postmanImporter.test.js test/electron/collectionImportRegistry.test.js`, `node --test test/electron/payloadSchemas.test.js test/electron/ipcValidation.test.js`, `node --test test/electron/rendererWorkflows.test.js`, `npm run postman:parity:validate`, `npm run sandbox:validate`, and `npm run check`.

9. Finish production claim verification and docs. Status: complete for the Step 9 implementation; full 1:1 Postman script compatibility is still blocked until `npm run postman:parity:claim` reports zero default-import blockers.
   - Require the generated parity matrix to have zero unsupported rows for default Postman import mode before claiming 1:1 script compatibility.
   - Expand adversarial tests for prototype/constructor escape, dynamic code generation, package-loader abuse, broker mutation, raw networking, filesystem/process access, hostile visualizer documents, mock-state abuse, protocol-stream floods, oversized output, and infinite async work.
   - Add real-world public/user collection fixtures covering auth-heavy scripts, package-heavy scripts, dynamic variables, cookies, visualizers, vault prompts, GraphQL, gRPC, mocks, and runRequest workflows.
   - Keep `npm run sandbox:validate`, `npm run sandbox:validate:packaged`, `npm run check`, packaged Linux validation, and native Windows/macOS packaged validation in the release gate.
   - Update `docs/COMPATIBILITY.md`, `README.md`, `TECH_SPECS.MD`, and `docs/SANDBOX_CONTRACT.md` as each row moves from gap to implemented behavior.
   - Implemented artifacts: `npm run postman:parity:claim`, `npm run release:gate`, `scripts/validateSandboxReleaseGate.js`, expanded `.github/workflows/ci.yml` and `.github/workflows/release.yml` gates, `test/fixtures/postman/real-world-import-corpus.collection.json`, `test/electron/postmanSandboxAdversarial.test.js`, expanded parity-matrix claim-scope rows, and regenerated `docs/postman-sandbox-parity-matrix.json`.
   - Verification commands: `node --test test/electron/postmanParityHarness.test.js test/electron/postmanImporter.test.js test/electron/postmanSandboxAdversarial.test.js`, `npm run postman:parity:validate`, `npm run release:gate`, `npm run sandbox:validate`, and `npm run check`. `npm run postman:parity:claim` is expected to fail until the five remaining default-import blockers above are implemented.

10. Keep platform OS-sandbox completion tracked separately from Postman API parity. Status: complete for Step 10 tracking and validation; platform-equivalent "full OS sandbox" coverage is intentionally not claim-ready yet.
   - Implement native Windows and macOS OS sandbox backends before claiming platform-equivalent "full OS sandbox" coverage.
   - Scripted load tests remain out of the Postman scripting parity claim unless a separate scripted-load-test contract is written.
   - Implemented artifacts: generated matrix source `src/core/osSandboxPlatformMatrix.js`, harness `src/core/osSandboxPlatformHarness.js`, CLI `scripts/osSandboxPlatformMatrix.js`, committed matrix `docs/os-sandbox-platform-matrix.json`, `npm run sandbox:platform:validate`, `npm run sandbox:platform:write`, `npm run sandbox:platform:claim`, CI/release workflow validation, release-gate manifest coverage, and focused coverage in `test/electron/osSandboxPlatformMatrix.test.js`.
   - Verification commands: `node --test test/electron/osSandboxPlatformMatrix.test.js test/electron/releaseWorkflow.test.js`, `npm run sandbox:platform:validate`, `npm run release:gate`, and `npm run check`. `npm run sandbox:platform:claim` is expected to fail until `linux.seccomp-deny-default-allowlist-decision`, `windows.appcontainer-backend`, `windows.packaged-os-sandbox-validation`, `macos.seatbelt-backend`, and `macos.packaged-os-sandbox-validation` are complete.

## Questions For Maintainer After Implementation

No answers are blocking the local implementation pass. Please answer these before expanding the sandbox surface or changing product positioning:

1. Should an unsafe local automation mode, if implemented later, live behind a plugin model, a settings panel with per-capability permissions, a CLI-only flag, or some combination of those?
2. For Linux, is the current `bubblewrap` namespace/filesystem/network sandbox plus dangerous-syscall seccomp policy sufficient for the public claim, or should "full syscall-policy sandbox" require a maintained deny-by-default seccomp-BPF allowlist even if that means adding a native helper and more platform maintenance?
3. For Windows/macOS, are native helper binaries or native Node addons acceptable for AppContainer/seatbelt-style sandbox launchers, or should PostMeter avoid native helpers and keep the public claim scoped below equivalent OS-level coverage on those platforms?
4. For the Newman corpus, `newman@6.2.2` is the current npm `latest` target. Do you want checked-in Newman JSON run reports generated by that exact version once a maintainer-approved Newman fixture export workflow exists?
5. The first reviewed package cache UX is manual and offline. Should a later version add a brokered online fetch-and-review flow for npm/jsr packages while still preventing scripts from fetching or installing packages at runtime?
6. The first vault UX supports workspace-level local binding, metadata, reset, and audit review. Should a later version add per-request prompts similar to Postman's desktop vault flow?
7. Do you have maintainer-approved public or user-provided Postman collections that can be checked into the compatibility corpus? The first Step 9 corpus is representative and intentionally avoids copying third-party copyrighted collection content.

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
- Postman import parity is now the scripting contract direction. The current runtime supports Postman globals, Postman-listed NodeJS module facades, reviewed exact team/external package bundles with workspace review UI, scoped vault grants with local binding/reset/audit UX, interactive visualizers, imported GraphQL/gRPC script hooks, local mock scripts with `pm.mock`/`pm.state`, Postman-compatible import/export preservation, a generated parity matrix, a broad real-world-style import corpus, adversarial sandbox tests, and an HTTP-core Newman differential harness. The production claim gate currently blocks on five default-import rows: `cookies.httponly-parity`, `sendRequest.advanced-auth-proxy`, `sendRequest.file-binary-bindings`, `require.pm.online-fetch-review`, and `grpc.live-desktop-transport`. Native Windows/macOS OS sandbox backends remain separate platform work.
- Load tests intentionally skip request scripts under sandbox v1; they use the normal HTTP sender directly and report the skip when scripts are present.
- Native Windows/macOS packaged OS-sandbox assertions and broader externally captured Postman Desktop/Newman reports for `newman@6.2.2` remain external/future validation work.
- Live OAuth provider behavior is not certified yet against Google, Microsoft Entra ID / Azure AD, and GitHub provider tenants.
- Postman import/export now preserves common auth helpers, variables plus raw Postman variable metadata, HTTP/GraphQL/gRPC scripts, editable examples, cookie metadata, request variables, collection certificates, protocol profiles, mock/vault/visualizer binding metadata, and file/binary body references. The remaining compatibility risk is not the core preservation path but broader real-world fixture coverage for obscure Postman export variants and advanced auth/transport behaviors.
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

Those claim commands are expected to fail until their tracked blockers are resolved.

Then inspect the worktree:

```bash
git status --short
```
