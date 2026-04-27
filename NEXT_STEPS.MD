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

## Highest Priority Steps

The secure brokered sandbox base is in place. The next highest priority is full 1:1 Postman scripting import parity as defined by `docs/SANDBOX_CONTRACT.md`. Do not claim complete Postman script compatibility until every item below is implemented, verified, and reflected in `docs/COMPATIBILITY.md`.

1. Build the Postman parity inventory and differential harness first.
   - Generate a machine-readable parity matrix from the official Postman Sandbox API reference, script run-order docs, dynamic-variable docs, package docs, mock docs, vault docs, GraphQL docs, and gRPC docs.
   - Add a status row for every API/method/property/global/module/protocol hook: unsupported, implemented, intentionally stricter, desktop-only, Newman-compatible, fixture-covered, and security-reviewed.
   - Extend the existing `test/fixtures/postman` corpus so each row has at least one fixture before it can be marked complete.
   - Add a differential runner that captures PostMeter output and latest targeted Newman output (`newman@6.2.2`) for supported surfaces, then compares test names/order/results, variables, cookies, request mutations, console output, response objects, and errors.
   - Add a desktop-observation path for APIs Newman does not support, especially `pm.vault`, `pm.mock`, `pm.state`, GraphQL hooks, gRPC hooks, visualizer behavior, and desktop-specific permission prompts.

2. Replace partial script globals and module facades with Postman-compatible runtime surfaces.
   - Implement Postman's documented global objects: URL, URLSearchParams, Web Crypto, encoding globals, Blob/File, Web Streams where exposed, structuredClone, queueMicrotask, AbortController/AbortSignal, DOM-style events/errors, typed arrays, and safe dynamic-code behavior where Postman exposes it.
   - Implement bounded `setInterval`/`clearInterval`, richer timer behavior, queueMicrotask ordering, promise/microtask drain parity, and console method/formatting parity.
   - Add script-safe Postman-listed NodeJS module facades for `path`, `assert`, `buffer`, `util`, `url`, `punycode`, `querystring`, `string-decoder`, `stream`, and `timers`.
   - Replace the current lightweight bundled library facades with version-pinned behavior for `ajv`, `chai`, `cheerio`, `csv-parse/lib/sync`, `lodash`, `moment`, `postman-collection`, `uuid`, and `xml2js`.
   - Preserve the security boundary: no host Node resolver, host filesystem, host process, native modules, shell, raw networking, Electron, or renderer DOM access.

3. Implement full Postman Collection SDK object parity for script-facing data.
   - Use a safely bundled/hardened `postman-collection` SDK where possible, or implement faithful facades for Request, Url, Header/HeaderList, QueryParam/QueryParamList, RequestBody, FormParam, Variable/VariableList, Cookie/CookieList, Response, and PropertyList.
   - Expand `pm.request` mutation and read behavior to match Postman for HTTP, GraphQL, and gRPC, including URL/query/header/body/auth mutation, list methods, clone/toJSON/toString behavior, disabled items, and case-insensitive headers.
   - Expand `pm.response` to full Postman behavior: text/json parsing, code/status/reason, response time/size, headers, cookies where exposed, binary/streaming bodies, metadata, trailers, messages, and response assertion chains.
   - Add adversarial tests for every SDK object crossing the host boundary so constructors, prototypes, accessors, errors, promises, and returned arrays cannot escape the worker sandbox.

4. Finish tests, assertions, variables, dynamic variables, and run-order semantics.
   - Implement full `pm.test` parity, including `pm.test.skip`, `pm.test.index`, returned chaining, callback/promise mixing, duplicate names, skipped result shape, nested async tests, and deterministic order.
   - Replace the practical `pm.expect` subset with full Chai-compatible behavior and Postman's response assertion helpers, including JSON schema validation behavior and error-message parity where practical.
   - Complete variable API parity for `pm.variables`, `pm.environment`, `pm.collectionVariables`, `pm.globals`, and `pm.iterationData`, including `clear`, `toJSON`, metadata, current/initial values, disabled variables, sensitive masking, folder/request variables, and exact precedence.
   - Implement the full Postman dynamic variable catalog and per-request generation semantics for `$guid`, `$timestamp`, `$isoTimestamp`, `$randomUUID`, and every documented `$random*` category.
   - Match collection/folder/request pre-request and post-response execution order, `pm.info`, `pm.execution.location`, `setNextRequest`, `skipRequest`, and `runRequest` edge cases.

5. Complete HTTP network, cookie, package-cache, visualizer, and vault parity without weakening sandboxing.
   - Expand `pm.sendRequest` to all Postman input shapes: string, plain object, Collection SDK Request, headers in object/array/list form, all body modes, auth helpers, redirects, TLS/cert behavior, timeout/cancellation, callback/promise forms, and response/error object compatibility.
   - Match Postman's cookie model for current-request helpers and jar helpers, including callback ordering, domain allowlists, Cookie objects, expiry/max-age, Secure, HttpOnly, SameSite, Priority, Partitioned, host-only, prefixes, replacement, and `pm.sendRequest` jar side effects.
   - Add package-cache management UI/import flow for missing team/external packages so package references are resolved, reviewed, pinned, integrity-checked, and visible before scripts run.
   - Replace the current Handlebars-style visualizer subset with real Postman visualizer behavior, including compile options, helpers, partials, SafeString, block params, inline scripts, `pm.getData`, common chart-library support through reviewed assets, and isolated rendering.
   - Finish vault desktop parity: prompts, denial behavior, reset/audit UX, denied code-after-call behavior, unavailable-encryption behavior, import-time local secret binding, and clear desktop/Newman support boundaries.

6. Add protocol-specific Postman script parity.
   - Preserve and execute GraphQL imports with Before query and After response hooks, query variables, operation name, auth, headers, response parsing, package imports, and variable interpolation.
   - Preserve and execute gRPC imports with Before invoke, On message, and After response hooks, proto/service/method metadata, method path, request metadata, outgoing messages, streaming method type, incoming messages, response metadata, trailers, status, cancellation, and `pm.message`.
   - Audit Postman's current WebSocket or other streaming protocol script support. If scripts are exportable or documented, implement them; if not, record that fact in the generated parity matrix with a source and fixture.

7. Add local mock server script parity.
   - Implement the mock-only script surface for imported/local Postman mock scripts: `pm.mock.matchRequest`, `pm.mock.sendExample`, saved example response lookup, path variables, route fallback behavior, method/path-only matching, and compatible request/response objects.
   - Implement `pm.state` with `get`, `set`, `delete`, `has`, `keys`, `size`, `clear`, `toObject`, `increment`, `push`, and `addToSet`, using bounded JSON-serializable per-mock-session storage and transaction-safe reset controls.
   - Keep `pm.mock` and `pm.state` unavailable outside the local mock surface, matching Postman's desktop-only boundary.

8. Upgrade Postman import/export data preservation for full scripting parity.
   - Preserve collection, nested folder, and request script events without flattening away run-order information needed for exact script execution.
   - Preserve request IDs or provide deterministic mapping/repair for scripts using `pm.execution.runRequest`.
   - Import and bind protocol profiles, GraphQL/gRPC definitions, package references, visualizer assets, cookie allowlists, vault metadata, mock scripts, mock state configuration, examples, certificates, auth inheritance, variables, and file/binary body references.
   - Round-trip Postman-compatible exports without losing script text, script type, event location, request IDs where possible, examples, package references, certificates, variables, and protocol metadata.

9. Finish production claim verification and docs.
   - Require the generated parity matrix to have zero unsupported rows for default Postman import mode before claiming 1:1 script compatibility.
   - Expand adversarial tests for prototype/constructor escape, dynamic code generation, package-loader abuse, broker mutation, raw networking, filesystem/process access, hostile visualizer documents, mock-state abuse, protocol-stream floods, oversized output, and infinite async work.
   - Add real-world public/user collection fixtures covering auth-heavy scripts, package-heavy scripts, dynamic variables, cookies, visualizers, vault prompts, GraphQL, gRPC, mocks, and runRequest workflows.
   - Keep `npm run sandbox:validate`, `npm run sandbox:validate:packaged`, `npm run check`, packaged Linux validation, and native Windows/macOS packaged validation in the release gate.
   - Update `docs/COMPATIBILITY.md`, `README.md`, `TECH_SPECS.MD`, and `docs/SANDBOX_CONTRACT.md` as each row moves from gap to implemented behavior.

10. Keep platform OS-sandbox completion tracked separately from Postman API parity.
   - Implement native Windows and macOS OS sandbox backends before claiming platform-equivalent "full OS sandbox" coverage.
   - Decide later whether Linux needs a maintained deny-by-default seccomp-BPF allowlist beyond the current `bubblewrap` namespace plus dangerous-syscall policy.
   - Scripted load tests remain out of the Postman scripting parity claim unless a separate scripted-load-test contract is written.

## Questions For Maintainer After Implementation

No answers are blocking the local implementation pass. Please answer these before expanding the sandbox surface or changing product positioning:

1. Should an unsafe local automation mode, if implemented later, live behind a plugin model, a settings panel with per-capability permissions, a CLI-only flag, or some combination of those?
2. For Linux, is the current `bubblewrap` namespace/filesystem/network sandbox plus dangerous-syscall seccomp policy sufficient for the public claim, or should "full syscall-policy sandbox" require a maintained deny-by-default seccomp-BPF allowlist even if that means adding a native helper and more platform maintenance?
3. For Windows/macOS, are native helper binaries or native Node addons acceptable for AppContainer/seatbelt-style sandbox launchers, or should PostMeter avoid native helpers and keep the public claim scoped below equivalent OS-level coverage on those platforms?
4. For the Newman corpus, `newman@6.2.2` is the current npm `latest` target. Do you want checked-in Newman JSON run reports generated by that exact version once a maintainer-approved Newman fixture export workflow exists?
5. For reviewed package cache management, should PostMeter later support a manual package-cache import file, a settings UI for approving package source/integrity, or a brokered online fetch-and-review flow that still never lets scripts fetch/install packages at runtime?
6. For vault grants, should the first UX expose only workspace/collection/request grant reset and audit review, or should it also support per-request prompts similar to Postman's desktop vault flow?

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

- Request scripts run in child processes with minimal environments, Linux `bubblewrap` OS isolation plus dangerous-syscall seccomp policy when available/required, fail-closed Node permission flags in production runtimes, hardened host bridge values, bounded worker heap settings, bounded console/result capture, brokered privileged APIs, explicit unsupported-API errors, and VM timeouts. Native Windows/macOS OS sandbox backends and optional stricter Linux deny-by-default seccomp-BPF allowlisting remain incomplete.
- Postman import parity is now the scripting contract direction. The current runtime supports reviewed exact team/external package bundles, scoped vault grants, and interactive visualizers, but package-cache management UI/online review flow, richer vault reset/audit UX, external Newman JSON run reports, and full Postman protocol-profile semantics remain future work.
- Load tests intentionally skip request scripts under sandbox v1; they use the normal HTTP sender directly and report the skip when scripts are present.
- Native Windows/macOS packaged OS-sandbox assertions and externally captured Newman JSON run reports for `newman@6.2.2` remain external/future validation work.
- Live OAuth provider behavior is not certified yet against Google, Microsoft Entra ID / Azure AD, and GitHub provider tenants.
- Postman import covers common auth helpers, variables, scripts, editable examples, cookie metadata, request variables, and collection certificates, but protocol profile behavior and the full Postman variable model remain incomplete.
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
npm run pack:linux
npm run dist:linux
npm run release:prepare
POSTMETER_RELEASE_REQUIRED_TYPES=appimage,deb npm run release:validate
```

Then inspect the worktree:

```bash
git status --short
```
