# PostMeter Architecture

Use this document when deciding where new behavior belongs or when refactoring ownership across renderer, Electron, and core layers.

PostMeter is split into three runtime layers:

- Electron main process in `electron/`
- Browser renderer in `src/renderer/`
- Runtime-neutral core modules in `src/core/`

The main rule is that product behavior belongs in the lowest layer that can own it without depending on UI or Electron APIs. Renderer code should manage DOM state and user interactions. Main-process code should own desktop lifecycle, IPC, dialogs, OS integration, and persistence orchestration. Core modules should be usable from Electron, tests, and the CLI.

## Renderer

Renderer files are loaded directly from `src/renderer/index.html`.

- `renderer.js` is the renderer shell/orchestrator. It should compose focused helpers rather than owning tab state, workflows, or editor subpanels inline, while still hosting shared modal rendering helpers used by flows such as draft-save and collection export selection, including the empty-state warning path when no collections exist.
- `assertionModel.js` owns assertion templates, default values, and placeholder text.
- `cookieModel.js` owns renderer-side cookie validation, Postman cookie metadata import, and thin adapters over the shared core cookie model.
- `contextMenu.js` owns renderer context-menu display and positioning.
- `layoutControls.js` owns resizable pane wiring and persisted layout CSS variables.
- `collectionModel.js` owns pure collection/folder/request tree traversal and mutation helpers used by the renderer.
- `exampleModel.js` owns request example formatting, header parsing, and example factory helpers.
- `loadPolicy.js` owns renderer control reads and thin adapters over the shared core load-policy model.
- `requestEditorPanels.js` owns request editor subpanel rendering: auth editor wiring, request pair/assertion tables, request example rendering, cookie panel rendering, and variable preview/editor helpers.
- `rendererState.js` owns renderer state defaults plus shared active-tab, modal, and dirty-state helpers.
- `requestTabs.js` owns generic request/environment/workspace tab-bar rendering from tab descriptors.
- `requestTabState.js` owns request/environment/workspace tab lifecycle, selection, dirty handling, and close/discard flows.
- `rendererBootstrap.js` owns renderer startup/theme bootstrap, toolbar-menu helpers, and DOM event registration driven by injected callbacks.
- `sessionPersistence.js` owns renderer-side session serialization/restoration for open tabs, active panels, active selection, drafts, and dirty editor state.
- `rendererWorkflows.js` owns request send/load/runner/OAuth/workspace import-export-save workflows, collection-export selection flows, non-destructive workspace import handling, and script-mutation application.
- `responseFormatting.js` owns renderer-side response body formatting for JSON, XML, and HTML display.
- `runResultFormatting.js` owns renderer-side text formatting for runner, load-test, and OAuth progress/result displays.
- `uiSmokeCommon.js` owns shared test-only UI smoke helpers such as queueing, waits, DOM dispatch helpers, assertions, and snapshot capture.
- `uiWorkflowSmoke.js`, `uiRegressionSmoke.js`, `uiSnapshotSmoke.js`, and `uiOauthSmoke.js` each own one Electron UI smoke suite instead of sharing a single renderer test harness file.
- `uiSmoke.js` is the stable test-only queue/entry-point layer. Production code should only call the `queueUi*Smoke` entry points.
- `theme.css` owns design tokens, method colors, and light/dark/system theme variables.
- `base.css` owns element defaults and common control states.
- `chrome.css` owns application chrome, sidebar, tree, workspace framing, and request-tab layout rules.
- `editorPanels.css` owns request, response, auth, cookie, example, and load-test/editor component rules.
- `overlays.css` owns modal and context-menu presentation.
- `styles.css` is the renderer stylesheet entry point and imports the modular CSS slices.

Keep DOM IDs stable unless tests and IPC-facing workflows are migrated at the same time. The planned behavior-preserving renderer split is complete enough that new work should usually extend the existing helper modules instead of growing `renderer.js` again.

## Electron Main Process

`electron/main.js` is the app shell and IPC registration entry point. Main-process business helpers should move out of this file when they can be tested without launching Electron.

- `appMenu.js` owns the application menu template and installation.
- `appIpc.js` owns app version, update check, and allowed external-link IPC channels.
- `fileDialogs.js` owns shared dialog filters, default extensions, and filename normalization.
- `mainWindow.js` owns BrowserWindow creation, renderer loading, startup/package smoke probes, and UI-smoke/snapshot window hooks.
- `oauthIpc.js` owns OAuth IPC channel registration and payload validation.
- `oauthFlows.js` owns OAuth authorization-code/device-code orchestration, callback routing, and protocol registration.
- `requestIpc.js` owns single-request validation/send IPC and persistence of response-side workspace mutations.
- `runtimeIpc.js` owns load-test and collection-run IPC channels, cancellation maps, progress events, and result exports.
- `sessionIpc.js` owns renderer session load/save IPC, including the synchronous shutdown flush path.
- `sessionStore.js` owns persisted UI session state in Electron `userData/session.json`.
- `workspaceIpc.js` owns workspace import/export, collection import/export, workspace save/load, request-example export IPC channels, and the refreshed managed-workspace payloads returned after workspace import.
- `workspaceMutations.js` owns workspace updates after request sends and collection runs.
- `vaultPrompt.js` owns metadata-only vault prompt IPC, renderer/dialog fallback decisions, prompt-response sender binding, and scoped vault-grant persistence helpers. `vaultPromptQueue.js` serializes renderer prompt UI so concurrent script vault calls cannot overwrite active prompt state. `requestIpc.js` and `runtimeIpc.js` pass the prompt broker into the shared scripted lifecycle so single-request sends, collection runs, and nested request executions all use the same request/collection/workspace-scoped prompt path.

Further extraction should be demand-driven. `electron/main.js` is already reduced to app lifecycle, workspace/session-store wiring, and module registration, so more splitting should only happen when those responsibilities materially grow again.

IPC channel names and preload APIs are compatibility contracts. Refactors must preserve them unless a migration is explicitly planned.

## Core

Core modules must not depend on Electron or renderer globals.

- `scriptedRequestLifecycle.js` owns the shared pre-request/send/test pipeline used by both single-request and collection-run execution. It also sanitizes primary-request client-certificate auth mutations so scripts can select reviewed certificate bindings by `certificateId` but cannot inject direct local certificate, key, PFX/P12, CA, or passphrase fields before parent transport execution.
- `requestScriptRunner.js` adapts the shared scripted-request lifecycle for single-request execution and returns the response plus runtime variable mutations.
- `collectionRunner.js` sequences collection requests and layers assertions, runner progress, cookies, stop-on-failure, and runner reports on top of the shared scripted-request lifecycle.
- `httpClient.js` prepares and sends HTTP requests.
- `pfxCertificate.js` owns parent-side PFX/P12 bundle extraction and encrypted PEM private-key normalization into in-memory PEM buffers for HTTP and gRPC client-certificate transports. It uses regular-file, byte-capped descriptor reads plus the reviewed `node-forge` PKCS#12/PEM parser in the parent process, and does not shell out or write decrypted PEM material to temp files.
- `grpcClient.js` owns the parent-side live gRPC transport for imported gRPC requests. It loads trusted proto definitions, builds parent-owned gRPC clients, normalizes metadata/messages/status/trailers/errors, and keeps proto/TLS/client-certificate filesystem access outside the script worker. gRPC mTLS supports PEM cert/key material and the shared parent-side PFX/P12 extraction path used by HTTP client-certificate requests, with configured certificate bindings failing closed instead of falling back to script-mutated direct paths.
- `productionReadinessMatrix.js` and `productionSupportMatrices.js` own release-readiness, Electron-security, workspace-durability, and non-Postman compatibility dashboards. Generated JSON lives in `docs/`.
- `docs/SANDBOX_CONTRACT.md` is the source of truth for script sandbox compatibility, security boundaries, broker behavior, side-effect transactions, and load-test scripting scope. The current claim-gated Postman script parity target is Postman Desktop 11.71.7 with `postman-sandbox@6.2.2` and Postman Runtime 7.50.0, plus Newman 6.2.2 with Postman Runtime 7.39.1 for Newman-compatible surfaces.
- `authModel.js`, `cookieModel.js`, and `loadPolicyModel.js` own shared runtime-neutral model defaults and normalization used by both core and renderer modules.
- `payloadSchemas.js` owns shared field schemas, enum sets, and basic string-length limits consumed by IPC validation and shared normalization helpers.
- `collectionFormats.js` is the stable public import/export boundary for collection format handling.
- `openApiFormats.js`, `harFormats.js`, `curlFormats.js`, and `jmeterFormats.js` each own one import/export family instead of sharing a single god module.
- `collectionFormatUtils.js` owns the small set of cross-format helpers such as URL parsing, JSON/XML escaping, shell splitting/quoting, and request flattening.
- `collectionImportRegistry.js` owns collection import detection/dispatch and format-specific export dispatch without changing the `WorkspaceStore` API.
- `scriptRuntime.js`, `sandboxPackageCache.js`, `postmanBuiltinPackages.js`, `postmanSandboxBootcodeBundle.js`, `visualizerHandlebarsBundle.js`, `scriptSandbox.js`, `scriptWorker.js`, and `osSandbox.js` implement the constrained Postman-style script environment, reviewed package-cache policy, version-pinned Postman package bundle, isolated Handlebars visualizer runtime, worker transport, broker boundary, and OS sandbox launcher layer.
- `models.js`, `payloadSchemas.js`, and `ipcValidation.js` define normalized payload shape and validation contracts.
- `workspacePersistence.js` owns workspace-path defaults, workspace normalization, structured-content parsing, and JSON persistence helpers.
- `importedCollectionIds.js` owns imported collection/folder/request/example/certificate ID regeneration.
- `workspaceStore.js` owns high-level workspace orchestration and file-facing service methods.
- `workspaceMigrations.js` owns workspace schema migration.

Managed workspace discovery is now filesystem-based. `WorkspaceManager` scans the workspace directory for native workspace JSON files and no longer depends on a separate manifest file for the workspace catalog or startup selection.

Core modules should expose small APIs and have focused unit tests. Shared schema metadata in `payloadSchemas.js` should stay the source of truth for enum membership and basic field limits where practical; handwritten validation should be reserved for nested, size-based, or cross-field checks that need custom logic.

## Refactor Rules

- Start from green tests and keep the app runnable after each extraction.
- Preserve workspace JSON compatibility, IPC payload shapes, CLI commands, import/export formats, and UI DOM IDs.
- Separate behavior fixes from structural refactors.
- Prefer moving pure helpers before moving stateful UI or Electron code.
- Add or update focused tests around every extracted boundary.
