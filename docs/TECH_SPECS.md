# PostMeter Technical Specifications

This document is the detailed implementation reference. For quick setup, common commands, and the top-level product overview, use [README.md](../README.md).

## Current Migration Status

PostMeter is now implemented as an Electron desktop MVP. The JavaFX/Maven implementation has been removed from the tracked repository; Electron is the only supported runtime.

The migration deliberately does not bridge Electron to the Java services. Core behavior was ported into Node modules so the desktop UI, IPC boundary, persistence, request execution, import/export, and runner logic can evolve together without carrying JavaFX UI coupling forward.

## Product Scope Implemented

- Create, rename, duplicate, delete, and save requests.
- Organize requests into collections and nested folders.
- Edit HTTP method, URL, query parameters, headers, raw body type, and body content.
- Create/edit/delete collection variables, request-local variables, and environments, then resolve `{{variableName}}` placeholders in supported workflows.
- Persist local app settings, currently including theme preference, modal behavior, force-close behavior, and prerelease update-check opt-in, separately from portable workspace JSON.
- Import/export native PostMeter workspaces, including filesystem-discovered managed workspaces, non-destructive workspace import, and managed workspace duplication from the Workspaces sidebar.
- Import/export native PostMeter collections, including a desktop collection-picker export modal, an empty-state warning when no collections exist, and `<collection-name>.json` native export defaults.
- Import/export standalone requests as native PostMeter request JSON or curl, with direct-paste request import, drag/drop or file-picker import, and a copyable export-preview modal before optional file export.
- Import/export native PostMeter environments, export Postman-compatible environment JSON, and import Postman environment JSON.
- Import/export native PostMeter runner definitions.
- Import/export Postman Collection v2.1 JSON while preserving folder/request hierarchy order, variables and raw variable metadata, auth inheritance, HTTP/GraphQL/gRPC/local mock scripts, request docs, cookies and richer cookie metadata including newer priority/partitioning hints where present, supported GraphQL/gRPC protocol metadata, local mock/vault/visualizer/package binding metadata, file/binary body references, request/certificate IDs, and supported collection certificate metadata.
- Import/export OpenAPI and curl collection formats for compatibility workflows, including OpenAPI JSON/YAML input, local `$ref` resolution for common objects, server variables, path/query/header/cookie parameters, Swagger 2.0 body/form-data import, binary body hints, OpenAPI security scheme import/export, request body examples, common curl auth/data/redirect/compression/cookie/file flags, request-name comments and unsupported-feature warnings in generated curl scripts, and preserved curl proxy/retry/client-TLS import metadata.
- Run workspace-owned desktop runners locally, including per-row iterations up to 1,000,000 expanded requests, stop-on-failure, script-mutation propagation, runtime variable display, progress events, capture controls, temp-store-backed result paging, and JSON/CSV/HTML result export.
- Manage runners from the dedicated left-sidebar Runners section, with runner-local request copies, runner request editing, runner request import from collections, row reorder/delete controls, runner import/export, duplication, and a split execution-results view.
- Manage open request, environment, workspace, and runner tabs with dirty prompts, force-close actions, optional save-on-force-close behavior, hover/active close buttons, shrink-before-scroll tab sizing, and a 128-tab cap.
- Edit request, environment, and workspace names inline; request/environment title edits save on Enter and remain dirty on blur, while workspace title edits save automatically.
- Rename, duplicate, export, delete, and reorder supported sidebar items from context menus. Collections and folders support structural duplication without flushing dirty request-editor drafts; requests, environments, runners, and performance tests duplicate into dirty editable copies; managed workspaces duplicate as separate local workspace files.
- Reorder collections, folders, requests, environments, workspaces, and runners from the sidebar by drag and drop, with single insertion-bar placement feedback and structural-only persistence for drag moves.
- Clear request history from the History sidebar context menu after an irreversible-action confirmation.
- Run collections headlessly through `npm run cli -- run ...` for CI usage with non-zero exits on failed requests or script tests.
- Configure request auth helpers for Bearer token, Basic Auth, API key, Cookie, static OAuth 2.0 access-token injection, refresh-token renewal, client-credentials token retrieval, authorization-code PKCE, device-code flow, and HTTPS client certificates using PEM certificate/key pairs or PFX/P12 bundles with optional CA certificate paths.
- Configure Postman-style TLS trust from Settings > Certificates and per-request Settings, including global SSL certificate verification, request-local verification overrides, custom PEM CA bundles from workspace-local certificate settings, managed HTTPS/gRPC client certificates matched by host and optional port, wildcard subdomain matching, and response Network diagnostics.
- Persist workspace cookies in a local cookie jar, allow per-request cookie jar opt-in/out, capture response cookies when enabled, and validate common browser-parity edge cases.
- Store workspace data as plain JSON without local encryption, redaction, or credential-specific export modes.
- Send HTTP requests and display status, timing, size, final URL, headers, and formatted JSON bodies.
- Record recent request history.
- Check GitHub Releases for newer PostMeter versions. Manual checks and startup reminders prompt before opening release pages, while an app-wide Settings opt-in enables automatic update download and install-on-quit through packaged release metadata.
- Save and run local workspace-owned Performance tests.
- Open Help > Tutorials to launch guided in-app walkthroughs. The current V1 set covers basic request sending, environment variables, and runner request series. Tutorials are renderer-owned UI guidance only; they are not saved to workspace JSON and do not add runtime/core behavior.

## Local Performance Scope

Performance is implemented as local first-class saved performance tests, not a request result-panel tab. Saved tests live under `workspace.performanceTests`; each test owns its ID, name, type, request copy, optional source metadata, selected environment ID, environment mutation policy, execution config, safety limits, result metadata, and native export payload. Performance tests persist independently from Collections and Runners.

Two request-entry paths are supported: importing a request from Collections as a deep copy, and manual request entry directly in the Performance pane. Imported request copies remain isolated from source collection requests across headers, auth, body, scripts, variables, docs, cookies, URL, and method. Saving a Performance test saves the performance-test configuration and its request copy without saving or clearing dirty collection request tabs.

Environment handling is explicit. A Performance test selects an environment independently from the active global environment. When `Allow performance test to modify environment` is disabled, scripts may mutate only a temporary environment copy for the run; when enabled, validated mutation deltas are applied back to the selected saved environment.

Required V1 type coverage:

| Type | Positive scenario | Negative scenario |
| --- | --- | --- |
| Full Endpoint Diagnosis | positive: runs the one-click preflight, HEAD/OPTIONS probes, warmup, baseline, throughput, spike, mini-soak, and recovery stages at Quick, Medium, or Extended scope; reports transport timing, endpoint behavior, security/configuration signals, local-client confidence, and UAT-ready diagnostic CSV rows. | negative: rejects missing request URL or hard safety caps above local limits, and marks unavailable probes or locally limited results without claiming server-wide capacity. |
| Latency | positive: completes light-load measurement and records p50/p90/p95/p99, min/max, error rate, and baseline response size. | negative: rejects missing request URL, unsafe timeout, or impossible percentile/result-retention settings. |
| RPS / throughput | positive: reports achieved requests per second for a fixed request count and concurrency with latency and failure summaries. | negative: rejects request count, concurrency, or safety settings that exceed local caps. |
| Concurrency | positive: runs fixed virtual users and reports latency/error rate by user count with per-user progress. | negative: rejects virtual-user counts above the configured concurrency cap or zero/negative users. |
| Stress | positive: steps pressure from start users to peak users and captures latency, status, and error summaries at each stage. | negative: rejects unbounded pressure growth, descending start/peak settings, or missing stop conditions. |
| Spike | positive: applies a sudden concurrency jump and records status, error, and latency behavior under the spike. | negative: rejects spike profiles with unsafe effective concurrency, request count, or duration caps. |
| Soak | positive: runs steady load for a bounded duration with latency, status, and error summaries. | negative: rejects zero-duration runs, long-duration runs above the local duration cap, or result retention that would exceed storage limits. |
| Ramp | positive: gradually increases load and marks thresholds where latency or errors rise. | negative: rejects malformed ramp steps, descending/overlapping phases where unsupported, or schedules beyond safety limits. |

The Performance editor exposes only fields that map to the active type. Full Endpoint Diagnosis is the first one-click pane and exposes a scope dropdown, max concurrency, max duration, environment selection, and environment mutation policy; it derives all diagnostic checks from bounded local stages. Quick Test runs 44 requests, Medium Test runs 300 requests, and Extended Test runs 1,000 requests. Increasing the diagnosis scope automatically raises the duration safety cap to the profile floor: 60 seconds, 300 seconds, or 900 seconds. Latency uses samples only and runs single-user. Throughput uses request count plus concurrency. Concurrency treats iterations as requests per virtual user. Stress and Ramp use start users, peak users, step count, and requests per step, then execute stepped stages from the start user count to the peak user count. Spike uses baseline users, spike multiplier, and spike request count. Soak uses duration, users, and safety caps instead of a hidden iteration count. The local V1 safety envelope currently caps saved executions at 1,000,000 planned requests, 25 effective concurrent users, and 3,600 seconds; the engine validates each type against the effective planned request count, effective concurrency, and duration before execution.

Full Endpoint Diagnosis captures DNS lookup, TCP connect, TLS handshake/protocol/cipher/certificate signals, redirects, request preparation, upload, time-to-first-byte, download/body read, total duration, response size, content length, compression, transfer encoding, status/error distributions, cold and warm latency, connection reuse, p50/p90/p95/p99, jitter, outliers, success/failure rate, best observed RPS, stable RPS, saturation point, recovery latency, status/size/content-type/header/body/fingerprint consistency, cache/rate-limit/server-timing/trace/set-cookie signals, redirect target stability, HTTPS/TLS/security-header/CORS/auth-challenge/sensitive-URL checks, event-loop delay, scheduler lag, local queue depth, timeout count, memory growth, safety-cap limits, client-saturation detection, confidence scoring, HEAD and OPTIONS probes, HTTP protocol visibility, DNS repeatability, payload-variation awareness, authenticated request awareness, retry-signal detection, and mini-soak stability. These are local desktop observations from the user's machine.

Runner and Performance Capture Settings expose response body preview mode, preview size, pre-request output, post-request output, script logs, and local variables. Performance also exposes response headers and transport timings. Small runs preserve the current result-detail experience by default. At 100,000 planned requests and above, PostMeter forces all-body capture down to failed-only previews, caps preview size, disables per-request logs and local variables, and records guardrail notes in the result. At 500,000 planned requests and above, the guardrails also force pre-request output and post-request output off, tighten body previews, and disable response headers outside Performance diagnosis while keeping compact transport/TLS timings available for Performance runs. The renderer uses the same planned-request guardrails before execution, so forced-off capture checkboxes render unchecked and disabled with hover text explaining the high-volume threshold; lowering the planned request count restores the user's saved capture preferences.

Store-backed run results are written to one reusable SQLite temp file at `userData/runtime/postmeter-current-results.sqlite`. Starting another Runner or Performance run replaces the previous temp store, and closing PostMeter deletes the current SQLite file plus SQLite sidecars so unexported run results do not persist between app sessions. Before execution, `runner:estimateResultStore` and `performance:estimateResultStore` calculate a rough file-size estimate from planned request count, normalized capture settings, request metadata length, and SQLite row/index overhead. The renderer warns when the estimate is within 1 GB of effective available space and disables Continue when the estimate exceeds effective available space. The renderer receives only a bounded summary plus the first result page, then requests additional pages or detail rows through `runner:resultPage`, `runner:resultDetail`, `performance:resultPage`, and `performance:resultDetail`. Performance result panes include a focused Graphs tab with three to five SVG graphs per test type, shown one graph at a time through selector buttons. Every Performance type includes codes-over-time, and type-specific graphs cover latency over time, success/failure throughput over time, error rate, latency-vs-throughput, concurrency/ramp/saturation behavior, transport timing, and response-size trends only where the run type captures useful data. CSV/JSON/HTML exports are streamed from the current temp store only when requested; PostMeter does not keep background run history. HTML reports are self-contained, can be exported in light or dark mode from the HTML report options modal, omit raw JSON appendix and capture-policy metadata cards, include a Charts and Trends section with an Overview button for the pass/fail, status-distribution, latency-profile, and diagnostic-phase summary plus selector buttons for the focused Performance graph set, include an optional paginated Request Results table with 10/25/50/100 row-size choices plus response-status filtering, and can include captured response details from per-row `View Details` buttons in an in-report modal instead of rendering a separate response-details section. Performance HTML reports include supported run-type data bundles, including Endpoint Diagnosis and Diagnostic Checks sections for Full Endpoint Diagnosis runs.

Import/export validation keeps native Performance-test export separate from collection/request export. Native Performance-test export preserves the full saved configuration and request copy. Import validates schema and safety limits, rejects malformed or unsafe payloads, and never merges imported request copies into Collections.

Execution is local and bounded. The V1 engine runs the saved request copy through the existing request/script lifecycle, streams progress, supports cancellation, enforces request/concurrency/duration safety caps, aggregates latency/status/error summaries, writes rows to a reusable temp result store, and exports results only when requested. Performance runs aggregate core metrics with streaming counters rather than retaining a second per-request summary array, use a keep-alive Node HTTP(S) agent capped to effective concurrency, apply a bounded per-request timeout so stalled transport slots become failed samples instead of hanging indefinitely, and coalesce high-rate progress events before IPC delivery.

## Product Account Policy

PostMeter is a standalone local desktop application. It must never require a PostMeter account, application login, user registration, or user account creation to use the core product.

OAuth support in PostMeter is only for outbound API request authentication, matching normal Postman-style request auth workflows. OAuth tokens belong to the target API request or workspace data; they are not PostMeter user accounts and must not become an app-level login gate.

## Technology Stack

- Desktop shell: Electron `41.3.0`
- Main process: CommonJS Node modules under `electron/`
- Renderer UI: static HTML/CSS/JavaScript under `src/renderer/`
- Core services: CommonJS Node modules under `src/core/`
- HTTP client: Node global `fetch` for normal requests; Node `http`/`https` transport for timing diagnostics, proxies, custom CA bundles, disabled SSL verification, and HTTPS client-certificate requests.
- Persistence: JSON file via `node:fs/promises`
- OpenAPI YAML parsing: `yaml`
- XML parsing and XPath evaluation: `@xmldom/xmldom` and `xpath`
- HTML parsing and selector evaluation: `node-html-parser`
- Packaging: electron-builder with Linux unpacked/deb, Windows NSIS, and macOS dmg/zip targets
- Tests: Node built-in test runner plus Electron startup, UI workflow, UI regression, UI typography, UI OAuth, and UI screenshot smoke scripts

## Guided Tutorials

The desktop Help menu includes a Tutorials action that opens a renderer modal backed by static tutorial definitions in `src/renderer/features/tutorialCatalog.js`. The modal is rendered in `src/renderer/index.html`, styled by `src/renderer/styles/overlays.css`, wired through `src/renderer/app/rendererBootstrap.js`, and controlled by `src/renderer/features/tutorialController.js`. Tutorial start/end/step navigation is renderer-only state. The overlay highlights live DOM targets by selector and positions a coach panel beside the target. Step setup callbacks may create unsaved draft requests, environments, or runners so the user can inspect real controls without requiring saved fixture data.

The current tutorial catalog uses full guided walkthroughs such as `request`, `environment-variables`, `runner`, and `performance`. Tutorial definitions live in `src/renderer/features/tutorialCatalog.js`, while tutorial modal state and overlay behavior live in `src/renderer/features/tutorialController.js`.

## Runtime Requirements

- Node.js 22 or newer.
- npm 10 or newer.
- Network access for request execution.
- Writable OS app-data directory for Electron `userData`, or writable directories for explicit `POSTMETER_DATA_PATH` / `POSTMETER_SETTINGS_PATH` overrides.

## Build, Run, And Test Commands

### Development

```bash
npm install
npm start
npm test
npm run check
npm run electron:version
npm run sandbox:validate
npm run sandbox:platform:validate
npm run sandbox:platform:claim
npm run postman:parity:validate
npm run postman:parity:claim
npm run postman:docs:validate
npm run postman:docs:live
npm run release:gate
npm run postman:parity:diff
npm run diagnostics:privacy:validate
```

### UI And Smoke

```bash
npm run test:smoke
npm run test:ui
npm run test:ui:regression
npm run test:ui:typography
npm run test:ui:oauth
npm run test:ui:snapshot
```

### CLI

```bash
npm run cli -- run --file ./workspace.json --collection "Smoke" --report ./runner-report.json
npm run cli -- run --file ./workspace.json --collection "mTLS Smoke" --ssl-extra-ca-certs ./ca.pem --client-cert-host api.example.test --ssl-client-cert ./client.crt --ssl-client-key ./client.key
```

### Packaging And Release

```bash
npm run pack:linux
npm run dist:linux
npm run dist:win
npm run dist:mac
npm run release:checksums
npm run release:prepare
npm run release:validate
npm run sandbox:validate:packaged
```

## Repository Structure

```text
electron/
  app-shell/
    appMenu.js
    appProtocol.js
    fileDialogs.js
    mainDiagnostics.js
    mainWindow.js
    preload.js
    rendererAssetManifest.js
  domains/
    app-shell/
    ipc/
    packaging/
    security/
    services/
  ipc/
    appIpc.js
    diagnosticsIpc.js
    exportIpc.js
    oauthIpc.js
    requestIpc.js
    runtimeIpc.js
    sandboxPackageIpc.js
    sessionIpc.js
    vaultPrompt.js
    workspaceIpc.js
  main.js
  packaging/
    packagedResourceManifest.js
    packagedSandboxRuntimeCli.js
    packagedStartupSmokeNode.js
  security/
    ipcSecurity.js
  services/
    autoUpdateService.js
    oauthFlows.js
    sessionStore.js
    workspaceMutations.js
  workers/
    exportPreparationWorker.js

src/core/
  contracts/
    ipcValidation.js
    keyboardShortcuts.js
    payloadSchemas.js
  diagnostics-release/
    diagnostics.js
    diagnosticsSettings.js
    oauthProviderCertification.js
    postmanDocsCoverageAudit.js
    postmanParityHarness.js
    postmanParityMatrix.js
    productionReadinessMatrix.js
    productionSupportMatrices.js
    updateChecker.js
  domains/
    diagnostics-release/
    http/
    import-export/
    ipc/
    runtime/
    security-sandbox/
    workspace/
  http/
    auth.js
    authModel.js
    authRefresh.js
    cookieJar.js
    cookieModel.js
    fileAttachmentBindings.js
    grpcClient.js
    httpClient.js
    pfxCertificate.js
    requestSettings.js
    tlsSettings.js
  import-export/
    collectionFormats.js
    collectionImportRegistry.js
    curlFormats.js
    environmentFormats.js
    openApiFormats.js
    postmanImporter.js
    requestFormats.js
    runnerFormats.js
  runtime/
    collectionRunner.js
    localMockServer.js
    performanceRunner.js
    requestScriptRunner.js
    scriptedRequestLifecycle.js
  sandbox/
    osSandbox.js
    postmanBuiltinPackages.js
    postmanSandboxBootcodeBundle.js
    scriptRuntime.js
    scriptSandbox.js
    scriptWorker.js
    visualizerHandlebarsBundle.js
  workspace/
    appSettingsStore.js
    csvVariables.js
    dynamicVariables.js
    environmentResolver.js
    models.js
    workspaceMigrations.js
    workspaceStore.js

src/renderer/
  app/
    appMenuAndTabs.js
    editorCollectors.js
    rendererBootstrap.js
    rendererStartup.js
    rendererState.js
    rendererWorkflows.js
    requestTabState.js
    sessionPersistence.js
    workspaceLifecycle.js
  features/
    authRefreshController.js
    diagnosticsWorkspaceController.js
    entityDisplay.js
    importExportWorkspaceController.js
    performanceController.js
    runnerController.js
    runtimeResultsController.js
    settingsController.js
    tutorialCatalog.js
    tutorialController.js
    vaultPromptController.js
    workspaceSidebarController.js
  formatting/
    markdownRenderer.js
    responseFormatting.js
    runResultFormatting.js
  html/
    manifest.json
    panels/
    shell/
    modals/
    overlays/
    scripts.html
  index.html
  models/
    authRefreshAutoDetectModel.js
    collectionModel.js
    cookieModel.js
    performanceTestModel.js
  renderer.js
  smoke/
    uiAwsSmoke.js
    uiHawkSmoke.js
    uiOauthSmoke.js
    uiRegressionSmoke.js
    uiSmoke.js
    uiSmokeCommon.js
    uiSnapshotSmoke.js
    uiTypographySmoke.js
    uiWorkflowSmoke.js
  styles/
    base.css
    chrome.css
    editorPanels.css
    overlays.css
    styles.css
    theme.css
  ui/
    codeEditor.js
    contextMenu.js
    layoutControls.js
    localFilePickerController.js
    modalController.js
    requestEditorController.js
    requestEditorPanels.js
    requestTabs.js
    rendererUiUtilities.js
    titleEditors.js
    variableAutocomplete.js
    variableHighlighter.js
    vaultPromptQueue.js

test/electron/
  *.test.js
scripts/
  postmeter-cli.js
  validateReleaseArtifacts.js
  writeReleaseChecksums.js
  writeReleaseManifest.js
.github/workflows/
  ci.yml
  release.yml
docs/
  COMPATIBILITY.md
```

`electron/main.js` is the packaged app entry point and lifecycle wiring layer. Window hardening, dialogs, IPC handlers, services, and packaging helpers live under the Electron ownership folders above.

`electron/app-shell/preload.js` exposes a small `window.postmeter` API only to the main renderer frame. The renderer is served from the secure standard `postmeter-app://bundle` custom protocol through an allowlisted main-process handler instead of `file://`, the protocol response applies CSP/`nosniff`/`no-referrer` headers, and the renderer has no direct Node access.

`src/core/` contains framework-independent business logic. JavaFX source, Maven wrapper files, and Maven tests are no longer part of the tracked repository.

## Electron Architecture

Main process responsibilities:

- Create a single `BrowserWindow`.
- Own the native application menu. Current top-level menus are File, Edit, View, and Help; the default Window menu is intentionally omitted.
- Disable hardware acceleration for reliable Linux/headless startup.
- Deny renderer-controlled top-level navigation away from the exact initial packaged `postmeter-app://bundle/src/renderer/index.html` URL, including unexpected app-protocol query changes, deny `window.open`, deny `<webview>` attachment, and deny all permission requests.
- Load and recover workspace data before creating the UI.
- Own native open/save dialogs, including selected-path shape validation before import/export reads or writes.
- Execute HTTP requests and collection runs through core services.
- Start and cancel OAuth 2.0 authorization-code PKCE using loopback or custom URI-scheme redirects.
- Start and cancel OAuth 2.0 device-code polling.
- Validate renderer-originated IPC sender identity and payloads before handing them to persistence, request execution, or collection-run behavior.
- Persist normalized workspace data as plain JSON under Electron `userData/profile/workspace/`, keep app-wide preferences in `profile/settings.json`, and keep workspace-local non-portable trust/privacy settings in managed workspace `localsettings`.
- Export Runner and Performance results to JSON, CSV, or a self-contained HTML report.
- Persist request history after sends.
- Check GitHub Releases for update metadata, open approved release URLs in the external browser, and run opt-in automatic update downloads in packaged builds. The Help menu owns manual update checks; Settings > Updates owns automatic updates, startup reminders, and prerelease opt-ins.
- Own structured local diagnostics, bounded rotated diagnostic logs, and user-selected local diagnostic bundle export. The main process never uploads diagnostics and does not accept renderer-provided upload destinations.

Renderer responsibilities:

- Render the workspace, collections, folders, requests, collection variables, environments, response viewer, history, collection runner, and update checks.
- Render dedicated Collections, Environments, Workspaces, Runners, and History sidebar sections. Empty environment/workspace/runner sidebar selections show the matching empty/create/select pane when no matching tab is open, and reselect the most recently opened matching tab when one exists.
- Handle native File/Help menu actions received through the preload allowlist.
- Maintain a visible app status live region for routine action feedback, while important failures also use popup notification behavior or contextual detail panels.
- Render pre-request and test script editors for each request.
- Maintain the active selection state.
- Collect editor state before save/send.
- Route explicit request/environment/runner-request saves through targeted preload APIs so normal pane saves persist only the selected item while still carrying current runtime settings and request-owned shared state. Settings save through a dedicated settings-only preload API so local preferences, theme/update toggles, and drag/drop structural saves do not flush unrelated dirty request, environment, or runner drafts.
- Render toolbar and tree context menus, tab context menus, history clear confirmation, runner import selection, and dirty-save/discard prompts without raw native `prompt`, `confirm`, or `alert` dialogs.
- Reuse one local file picker modal for renderer-selected imports and request body file sources. The modal supports drag/drop and a choose-file button; import IPC falls back to native main-process dialogs when renderer local-path resolution is unavailable.
- Call only preload-exposed APIs.

Preload API:

```text
window.postmeter.app.versions()
window.postmeter.app.checkForUpdates(options)
window.postmeter.app.autoUpdateStatus()
window.postmeter.app.installUpdate()
window.postmeter.app.openExternal(url)
window.postmeter.app.onAutoUpdateStatus(callback)
window.postmeter.app.onMenuAction(callback)
window.postmeter.workspace.load()
window.postmeter.workspace.save(workspace)
window.postmeter.workspace.saveRequest(payload)
window.postmeter.workspace.saveEnvironment(payload)
window.postmeter.workspace.saveSettings(settings)
window.postmeter.workspace.importWorkspace(filePath?)
window.postmeter.workspace.exportWorkspace(workspace, workspaceId)
window.postmeter.collection.importCollection(filePath?)
window.postmeter.collection.exportCollection(collection, format)
window.postmeter.diagnostics.export()
window.postmeter.request.validate(request, environment)
window.postmeter.request.send(request, environment)
window.postmeter.oauth.startPkceFlow(id, auth, environment, strategy)
window.postmeter.oauth.startDeviceFlow(id, auth, environment)
window.postmeter.oauth.cancelFlow(id)
window.postmeter.oauth.cancelDeviceFlow(id)
window.postmeter.oauth.onProgress(callback)
window.postmeter.runner.start(id, collection, environment, config)
window.postmeter.runner.cancel(id)
window.postmeter.runner.export(result, format, htmlReportOptions) // format: json, csv, html
window.postmeter.runner.onProgress(callback)
window.postmeter.performance.importTest(source?)
window.postmeter.performance.exportResult(result, format, htmlReportOptions) // format: json, csv, html
window.postmeter.fileBindings.choose(metadata)
window.postmeter.fileBindings.storeContent(metadata)
window.postmeter.localFiles.storeContent(metadata)
```

Security settings:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- Renderer content protocol: secure standard `postmeter-app://bundle`, with handler allowlist limited to `src/renderer/`, reviewed browser-safe shared core model files, and `build/icon.png`; the handler does not request renderer fetch privilege and applies `cache-control: no-store`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, and HTML CSP response headers.
- Renderer CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self' about: data:; child-src 'self' about: data:; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; worker-src 'none'; media-src 'none';`

Known security tradeoffs:

- IPC validation is structural and bounded, with shared versioned enum contracts in `payloadSchemas.js`. Request/workspace array, nested-field validation, common key/value/cookie/example/history/certificate/auth checks, OAuth progress payloads, runner config/progress payloads, load progress/result histogram/sample/policy-decision checks, file-operation results, and collection-run script result checks are driven by shared schema metadata or schema-backed validators, but some payload-specific nested checks are still maintained manually.
- Custom URI-scheme OAuth redirects depend on OS protocol registration. Loopback redirect is the more reliable default during development and on platforms where protocol registration is restricted.

## Workspace Data Model

Current schema version:

```text
15
```

Root workspace fields:

- `schemaVersion`
- `collections`
- `environments`
- `globals`
- `cookies`
- `history`
- `runners`
- `performanceTests`
- `localsettings`

Runtime-hydrated settings fields:

- `appearance.theme`
- `request.sslCertificateVerification`
- `request.caCertificatePath`
- `request.clientCertificates`
- `sandbox.trustedCapabilities.sendRequest`
- `sandbox.trustedCapabilities.cookies`
- `sandbox.trustedCapabilities.vault`
- `sandbox.trustedCapabilities.vaultGrants`
- `sandbox.packageCache`
- `sandbox.fileBindings`
- `diagnostics.logging`
- `diagnostics.requestResponseLogging`
- `tabs.saveOnForceClose`
- `modals.closeOnBackdropClick`
- `updates.includePrereleases`

`workspace.settings` is still supplied to the renderer as a normalized runtime object. The main process hydrates it by merging app-wide preferences from `profile/settings.json` with the managed workspace's `localsettings`. Runtime `settings` is stripped from workspace persistence/export. Managed workspace JSON keeps `localsettings`; native workspace imports and exports strip it.

Collection fields:

- `id`
- `name`
- `description`
- `variables`
- `certificates`
- `requests`
- `folders`
- Optional `postman` compatibility metadata for imported/exported Postman Collection v2.1 artifacts

Folder fields:

- `id`
- `name`
- `requests`
- `folders`
- Optional `postman` compatibility metadata for imported/exported Postman Collection v2.1 artifacts

Request fields:

- `id`
- `name`
- `method`
- `url`
- `queryParams`
- `headers`
- `bodyType`
- `body`
- `auth`
- `scripts`
- `variables`
- `docs`
- `cookieJar`
- `autoHeaders`
- `settings`
- Optional protocol and import/export fields for Postman parity: `protocol`, `methodPath`, `metadata`, `messages`, `postmanBody`, `protocolProfile`, `graphql`, `grpc`, `websocket`, and bounded `postman` compatibility metadata

Request cookie jar fields:

- `enabled`
- `storeResponses`

Request auto-header fields:

- `sendPostMeterToken`
- `showGeneratedHeaders`

Request TLS setting fields:

- `sslCertificateVerification`: `inherit`, `enabled`, or `disabled`

Auth fields vary by `auth.type`:

- `none`
- `bearer`: `token`
- `basic`: `username`, `password`
- `apiKey`: `location`, `key`, `value`
- `cookie`: `value`
- `oauth2`: `tokenType`, `accessToken`, `refreshToken`, `authorizationUrl`, `deviceAuthorizationUrl`, `tokenUrl`, `clientId`, `clientSecret`, `scopes`, `grantType`, `redirectStrategy`, `redirectUri`, `expiresAt`, `deviceCode`, `userCode`, `verificationUri`, `verificationUriComplete`, `deviceCodeExpiresAt`, `devicePollIntervalSeconds`
- `clientCertificate`: `certPath`, `keyPath`, `pfxPath`, `caPath`, `passphrase`

Environment fields:

- `id`
- `name`
- `variables`

Runner fields:

- `id`
- `name`
- `environmentId`
- `allowEnvironmentMutation`
- `stopOnFailure`
- `requests`

Runner request fields use the same shape as request fields plus `iterations`, but they are runner-owned copies rather than references to collection requests.

Workspace cookie fields:

- `id`
- `enabled`
- `name`
- `value`
- `domain`
- `path`
- `expiresAt`
- `secure`
- `httpOnly`
- `sameSite`
- `hostOnly`

Key/value pair fields:

- `enabled`
- `key`
- `value`

History entry fields:

- `timestamp`
- `method`
- `url`
- `statusCode`
- `durationMillis`

Collection certificate fields:

- `id`
- `name`
- `enabled`
- `host`
- `port`
- `matches`
- `certPath`
- `keyPath`
- `pfxPath`
- `caPath`
- `passphrase`
- `passphraseSecretKey`

Request example fields:

- `id`
- `name`
- `statusCode`
- `headers`
- `body`
- `bodyType`

Schema `3` adds collection/folder hierarchy support through `folders`.

Schema `4` is retained for historical workspace compatibility.

Schema `5` adds collection-level variables. Existing collections migrate with an empty `variables` array.

Schema `6` adds request script containers with `preRequest` and `tests` strings.

Schema `7` added the original workspace-embedded settings object, request-local variables, and collection certificate metadata. Current-schema persistence strips runtime `settings` from workspace files.

Schema `8` adds workspace cookies and per-request cookie jar options.

Schema `9` added request execution-policy compatibility fields, which are now removed during migration.

Schema `10` removes workspace-level execution-policy defaults from the retired model. Those settings are no longer persisted.

Schema `11` adds workspace-level globals for true `pm.globals` support and settings that can disable brokered script network requests, cookie-helper access, or vault access. These APIs are enabled by default for Postman import parity. The local settings model also carries the optional `sandbox.trustedCapabilities.vault` grant, scoped `sandbox.trustedCapabilities.vaultGrants`, and reviewed `sandbox.packageCache` entries for exact package-library/external package compatibility.

Schema `12` adds first-class `workspace.runners` data and the `tabs.saveOnForceClose` setting. Existing workspaces migrate with an empty runner list and disabled save-on-force-close behavior; current-schema persistence keeps the tab setting in app-wide `profile/settings.json`.

Schema `13` adds first-class `workspace.performanceTests` data.

Schema `14` introduced the external app settings store and moved runtime `settings` out of persisted workspace files.

Schema `15` adds managed-workspace `localsettings` for non-portable workspace-local trust/privacy settings. Native workspace import/export strips `localsettings`, and the main process hydrates runtime `workspace.settings` from app-wide `profile/settings.json` plus the managed workspace's `localsettings`.

## Persistence Specifications

Persistence is handled by `WorkspaceStore` and `WorkspaceManager`.

Managed app-data directory:

```text
Linux:   ~/.config/postmeter/
macOS:   ~/Library/Application Support/PostMeter/
Windows: %APPDATA%\PostMeter\
```

Default app-data layout:

```text
profile/settings.json
profile/session.json
profile/workspace/*.json
vaults/
diagnostics/
runtime/
```

Override the preferred startup workspace path:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

Override the local settings path:

```bash
POSTMETER_SETTINGS_PATH=/tmp/postmeter-settings.json npm start
```

Behavior:

- Uses `profile/workspace/workspace.json` in Electron `userData` as the preferred startup path and scans the containing `profile/workspace/` directory for native managed workspace JSON files. There is no persistent managed-workspace index or active-workspace pointer to go stale; the legacy manifest file is removed when found.
- Creates a default managed workspace such as `Local Workspace.json` when no workspace files exist, allocating a suffixed name if that filename already exists as an unreadable or non-native file.
- Allocates default, new, imported, and renamed managed workspace filenames around any existing filesystem entry, including unreadable or non-native JSON files, then publishes with no-overwrite semantics and retries suffixed names if a destination appears before publication.
- Loads current schema `15` workspaces and migrates supported historical schema versions `1` through `14` to schema `15`.
- Creates timestamped, collision-resistant `pre-migration.backup` sibling files through the atomic, no-overwrite write path before saving migrated workspaces.
- Rejects newer schema versions.
- Quarantines unreadable workspace JSON by moving it through a no-overwrite file move to a timestamped, collision-resistant `corrupt` sibling file and best-effort fsyncing the directory, then creates a fresh default workspace through no-overwrite publication and raises a recovery error for the UI. If a replacement workspace file appears before recovery publication, PostMeter preserves that replacement instead of overwriting it.
- Writes workspace, settings, session, vault, runtime, and export files through collision-resistant same-directory temporary files, fsyncs file contents where supported, renames into place, and best-effort fsyncs the containing directory. Interrupted temporary files are ignored by workspace discovery.
- Writes normalized workspace values directly to local JSON, excluding runtime `settings` and retaining non-portable `localsettings` only for managed workspace files.
- Writes app-wide settings to `profile/settings.json` using the same atomic JSON write path. The file uses `format: "postmeter.settings"` and `version: 1` rather than `schemaVersion`, so managed-workspace discovery does not treat it as a workspace.
- Writes workspace-local diagnostics opt-ins, TLS trust settings, managed client-certificate settings, reviewed package metadata, imported file bindings, and vault grants to the managed workspace `localsettings` object, not to `profile/settings.json`.
- Normalizes IDs, names, body types, methods, arrays, settings, collection variables, collection certificates, request variables, request docs, request cookie jar settings, workspace cookies, folders, environments, and history, while removing retired request execution-policy compatibility fields.
- Native workspace import adds another managed workspace without replacing, switching away from, or backing up the current one.
- Targeted renderer saves for request, runner-owned request, and environment tabs send only the selected item payload, the current runtime settings, and any owned shared request-side state such as collection variables or cookie-jar values; targeted settings saves send only `workspace.settings`, which the main process validates, splits into app-wide settings plus workspace `localsettings`, and applies to the cached workspace.
- Full workspace saves are still used for shutdown persistence, managed-workspace switching or active-workspace rename, whole-workspace export, and collection import, but native workspace export strips `localsettings` before writing. The shutdown synchronous save validates the workspace payload but skips the full-workspace write when queued workspace mutations are pending, returning the current main-process workspace instead of letting a stale renderer snapshot overwrite pending send/run/vault side effects.
- Renderer session persistence also carries request-owned shared dirty state for collection variables and the cookie jar so crash recovery can restore those unsaved edits without requiring a full workspace save.

Limitations:

- No file locking.
- No multi-window conflict resolution.
- No atomic move fallback tuning beyond same-directory rename.

## Import And Export

Native workspace export writes the normalized workspace through the atomic export path after stripping runtime `settings` and managed-workspace `localsettings`. The desktop UI can export the current in-memory workspace or another managed workspace by id from the Workspaces list.

Native workspace import reads a PostMeter workspace, migrates it, normalizes it without imported runtime `settings` or `localsettings`, writes it as another managed workspace, refreshes the managed workspace list, and keeps the current workspace active until the user switches.

Native collection export writes one collection inside a valid PostMeter workspace wrapper through the atomic export path. Environments are intentionally separate and are not included in collection export. In the desktop UI, `Export > Collection` opens an in-app collection-picker modal, the modal still opens when no collections exist, the Export button stays disabled while that empty-state warning is shown, and native collection export filenames default to `<collection-name>.json`.

Native collection import imports the first collection from a PostMeter workspace file, regenerates IDs, and appends it to the active workspace.

OpenAPI import/export:

- Imports OpenAPI/Swagger JSON and YAML documents into collections grouped by tags when present.
- Converts OpenAPI path parameters like `{id}` into PostMeter variables like `{{id}}`.
- Resolves local `$ref` entries for common parameters, request bodies, responses, response headers, and security schemes.
- Imports server variables, path/query/header/cookie parameters, Swagger 2.0 body/form-data parameters, request body examples, and binary body hints where practical.
- Imports common HTTP bearer, HTTP basic, header/query/cookie API key, and OAuth 2.0 security schemes into PostMeter auth helpers where they map cleanly.
- Exports PostMeter collections as OpenAPI 3.1 JSON with paths, methods, query/header/cookie parameters, raw body content, and mappable auth helpers as security schemes.

curl import/export:

- Imports common `curl` command forms including URL, generated request name, method, headers, auth flags, repeated data flags, `-G` query-data mode, cookies, multipart-ish form flags, binary/file upload intent, redirects, compression, proxy/retry metadata, and TLS flag metadata.
- Exports collection requests as readable curl commands, including PostMeter basic auth and preserved redirect/compressed/insecure/binary metadata when present.

- Non-Postman import/export support is a practical compatibility bridge and does not claim source-format-perfect round trips or full external engine parity unless explicitly stated.

See `docs/COMPATIBILITY.md` for the current import/export, scripting, and Performance compatibility matrix.

Postman collection import supports:

- Collection name from `info.name`.
- Collection variables from `variable`.
- Nested `item` folders and requests.
- Request name and HTTP method.
- URL from `url.raw` or structured `protocol`, `host`, and `path`.
- Query parameters from `url.query`.
- Headers from `request.header`, including disabled state.
- Raw request body from `request.body.raw`.
- Raw JSON body type when Postman marks raw language as JSON.
- GraphQL body mode, query, variables, operation name, auth, headers, and Before query/After response scripts.
- gRPC protocol metadata including service/method/proto hints, method path, request metadata, outgoing messages, streaming method type, and Before invoke/On message/After response scripts.
- Local mock event scripts with `listen: "mock"` and common mock-listen variants, plus request IDs used by `pm.mock.matchRequest` when present in the Postman export.
- Common Bearer, Basic, API key, and OAuth 2.0 auth helpers from collection, folder, and request scopes when they map cleanly to PostMeter auth fields.
- Common `event` scripts with `listen: "prerequest"` and `listen: "test"` from collection, folder, and request scopes, plus protocol events for GraphQL and gRPC. Collection/folder scripts are prepended to child request scripts for execution while original event locations, script types, and script text are preserved for Postman export.
- Original Postman request IDs where present, deterministic fallback IDs where absent, Postman request-link target extraction for `pm.execution.runRequest`, and alias resolution for `pm.execution.runRequest`, `pm.execution.setNextRequest`, `pm.info.requestId`, and `pm.execution.location.requestId` even after workspace import regenerates internal model IDs.
- Postman item/request descriptions are imported into the request Docs tab.
- Postman cookies from `request.cookie`, including duplicate names across paths/domains, disabled-cookie preservation for export, empty values, raw cookie object preservation, common expiry variants, newer priority/partitioning hints, prefix names, extension arrays, and unknown/vendor fields; desktop import promotes Cookie headers into workspace cookies when the request URL has a concrete host.
- Imported Postman HTTP requests enable cookie-jar sends and response-cookie storage by default so script-created and response-set cookies participate in later imported request sends.
- Postman cookie metadata is preserved as explicit request metadata and used during desktop import promotion for domain, path, expiry, secure, httpOnly, SameSite, host-only, priority, partitioning, extension, and source values when present.
- Postman request/item variables, represented as request-local variables, with raw variable metadata retained for Postman export.
- Collection-level certificates from `certificate`, preserved for runtime host/path matching; matching requests without explicit auth also receive a client-certificate auth binding for UI clarity.
- Bounded Postman compatibility metadata for protocol profiles, GraphQL/gRPC definitions, package references, visualizer assets, cookie allowlists, vault metadata, mock state configuration, certificates, auth inheritance, and file/binary body references.

Postman collection export supports:

- Postman Collection v2.1 JSON through the desktop `Export > Postman` action and the collection export registry.
- Round-tripping preserved script text, script type, event location, request/certificate IDs where exported by Postman, variables and raw variable metadata, request docs, certificates, auth metadata, protocol profiles, GraphQL/gRPC metadata, body modes including file/binary references, and imported package/cookie/vault/mock/visualizer binding metadata.

Postman import limitations:

- OAuth 2.0 import covers common token/client fields but not every Postman grant type or client-auth method.
- Collection-level certificates are preserved for runtime matching. They are also mapped into PostMeter's request-auth model only when a matching request does not already have explicit auth.
- Cookie import is best-effort when a source format only provides a raw `Cookie` header without expiry/domain metadata.
- Raw URL query strings are split from the request URL; query params are imported from `url.query`.

## Environment Resolution

Environment resolution is handled by `environmentResolver.js`.

Syntax:

```text
{{variableName}}
```

Supported variable name characters:

```text
A-Z a-z 0-9 _ . -
```

Behavior:

- Resolves enabled variables from collection variables, the active environment, and request-local variables.
- Runtime precedence is request-local variables over active environment variables over collection variables.
- Trims whitespace inside variable braces.
- Leaves unknown variables unchanged.
- Applies to URLs, query parameter keys/values, header names/values, and body content before request execution.

Password, token, cookie, and OAuth inputs are normal visible text fields. Settings > Certificates passphrases are stored as vault references when the workspace vault can bind them; if vault binding is unavailable, the fallback plaintext passphrase stays in workspace-local settings rather than portable workspace exports.

## Auth Specifications

Auth normalization and request-time injection are handled by `auth.js` and `httpClient.js`.

Implemented request-time auth:

- Bearer token: sets `Authorization: Bearer <token>`.
- Basic Auth: sets `Authorization: Basic <base64(username:password)>`.
- API key in header: sets the configured header name and value.
- API key in query: appends the configured query parameter name and value.
- Cookie: sets the `Cookie` header.
- OAuth 2.0 static access token: sets `<tokenType> <accessToken>` in `Authorization`.
- OAuth 2.0 refresh-token renewal: when `refreshToken`, `tokenUrl`, and expired/missing token metadata are present, posts `grant_type=refresh_token` to the token URL before request execution, refuses token-endpoint redirects, redacts provider error strings before display, and returns updated token metadata.
- OAuth 2.0 client credentials: when `grantType` is `clientCredentials` and token metadata is missing or near expiry, posts `grant_type=client_credentials` with `client_id`, `client_secret`, and optional `scope` before request execution, refuses token-endpoint redirects, redacts provider error strings before display, and returns updated token metadata.
- OAuth 2.0 authorization-code PKCE: creates a S256 PKCE challenge, opens the authorization URL in the external browser, supports loopback redirects and `postmeter://oauth/callback` custom URI-scheme redirects, verifies callback state, exchanges the authorization code at the token endpoint, and persists returned token metadata.
- OAuth 2.0 device code: posts `client_id` and optional `scope` to the device authorization URL, opens the verification URL in the external browser, displays the user code, polls the token endpoint with `urn:ietf:params:oauth:grant-type:device_code`, handles pending, denial, expiration, timeout, and cancellation states, refuses token-endpoint redirects, and persists returned token metadata.
- HTTPS client certificate: loads certificate material in the main/core layer from local paths using regular-file, byte-capped descriptor reads, supports PEM certificate/key pairs and PFX/P12 bundles, normalizes PFX/P12 bundles into in-memory PEM certificate/key buffers with the reviewed `node-forge` PKCS#12 parser before transport, applies optional CA certificates and passphrases, and does not expose certificate contents to the renderer or scripts. Pre-request scripts may select configured certificate bindings by `certificateId`; script-injected direct certificate/key/PFX/CA paths or passphrases are ignored before the parent transport can read certificate files.
- Disabled managed client-certificate bindings are ignored by automatic host matching, explicit request `certificateId` lookup, brokered `pm.sendRequest`, and gRPC invocation setup so toggling a certificate off fails closed across runtime surfaces.

Auth values support environment substitution before use.

Outbound OAuth certification is documented in `docs/OAUTH_PROVIDER_CERTIFICATION.md`, with Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth Apps as the first target providers. `npm run oauth:certify:validate` checks the source-owned provider matrix, `npm run oauth:certify:mock` runs the local mocked certification corpus, and `npm run oauth:certify:live` is skipped by default unless maintainer-owned provider credentials are explicitly enabled. When enabled, live certification fails closed unless provider URLs point to official Google, Microsoft Entra, or GitHub OAuth endpoints. Maintainer live signoff for the V1 target providers is complete; repeat the manual provider flows before release signoff. A forward-slash repository-relative sanitized evidence JSON file may be supplied through `POSTMETER_LIVE_OAUTH_EVIDENCE_FILE` or `--evidence`; when supplied, it must prove the required redirect strategies, provider-specific grant types, provider-console review, and redacted execution artifacts without printing OAuth values. The optional evidence validator requires the evidence JSON and referenced artifact files under `validation-artifacts/oauth-provider-certification/`, verifies artifact SHA-256 checksums, rejects paths outside that directory, rejects backslash/traversal paths, and scans structured evidence plus text artifacts for token-shaped values. This certification is for target API request auth only and must not introduce PostMeter account login or account creation.

Collection-run OAuth refreshes are applied to workspace request auth through main-process mutation paths, but refreshed auth objects are internal-only on run result objects and are omitted from JSON serialization, renderer IPC result payloads, and exported run artifacts.

Auth validation:

- Requires non-empty configured token/value fields for enabled auth types. OAuth 2.0 accepts an access token, a refresh token plus token URL, client-credentials metadata, or device-code metadata depending on the selected grant.
- Validates header names for API-key header auth.
- Validates that client-certificate auth has either a PFX/P12 bundle path or both PEM certificate and key paths.
- Rejects client-certificate auth for non-HTTPS request URLs.

Auth limitations:

- Refresh-token renewal, authorization-code exchange, client-credentials retrieval, and device-code polling send `client_id` and `client_secret` in the form body when present. HTTP Basic client authentication and private-key JWT are not supported.
- OAuth access tokens, refresh tokens, and client secrets are ordinary visible auth fields persisted in workspace JSON and exported collections. Certification evidence must scrub those fields.
- OAuth progress is represented in a persistent in-app panel and validated by schema-backed main-to-renderer IPC checks. Renderer regression smoke validates key progress states, and mocked Electron OAuth smoke covers loopback PKCE success, custom-scheme PKCE success, rejected wrong-state callbacks that keep the flow cancellable, PKCE token failure, cancellation, provider denial, timeout, and device-code success. Loading or switching workspace context cancels active OAuth flows so the renderer does not lose its cancellation handle.
- Custom URI-scheme PKCE is implemented. Release validation checks Linux deb desktop-entry metadata, Windows NSIS registry registration plus `postmeter://` ShellExecute launch, and macOS app-bundle/zip/dmg URL-scheme metadata plus Launch Services `postmeter://` launch on native runners.
- Client-certificate requests use the Node `https` transport path instead of global `fetch`; that path intentionally follows redirects only when they stay on the original HTTPS origin to avoid leaking client certificate material to redirected hosts.
## Cookie Jar

Cookie jar handling is implemented in `cookieJar.js` and integrated into `httpClient.js`, the Electron request send path, collection runs, and the renderer Cookies tab.

Implemented behavior:

- Workspace cookies are stored under `workspace.cookies`.
- Cookie values are stored directly in the workspace JSON.
- Each request has `cookieJar.enabled` and `cookieJar.storeResponses` settings.
- When enabled, matching unexpired cookies are sent by domain, path, and secure flag.
- Cookie domains are normalized, invalid cross-domain `Set-Cookie` values are rejected, and `SameSite=None` without `Secure` is rejected.
- Public-suffix-like single-label Domain attributes such as `.com` and exact listed public suffix Domain attributes such as `github.io` are rejected.
- Domain attributes on IP-address hosts are rejected, host-only IP cookies are allowed, and localhost domain matching is intentionally conservative.
- Duplicate `Set-Cookie` attributes use the last parsed value for supported attributes such as `Path` and `SameSite`.
- `__Host-` and `__Secure-` cookie prefix rules are enforced for parsed response cookies.
- Newer non-sending attributes `Priority` and `Partitioned`, source-format hints, and unmodeled cookie extension attributes are preserved in workspace cookies where present.
- `Max-Age` takes precedence over `Expires` when both are valid. Malformed expiry metadata is ignored instead of crashing import/execution.
- Cookie names are treated as case-sensitive for request header merging and response-cookie replacement/deletion identity.
- Explicit request/auth `Cookie` values are preserved and merged with jar cookies without overriding explicitly named cookies.
- Response `Set-Cookie` headers update the workspace jar when `storeResponses` is enabled.
- Expired response cookies remove matching cookies from the jar.
- The renderer lets users inspect, add, edit, remove, filter by the active request host, and clear expired cookies.
- The renderer marks invalid cookie domain, path, and expiry fields inline.
- Collection runs propagate updated cookies between sequential requests and persist the final jar through the Electron main process.
- Performance runs can send cookies from the jar; runtime cookie mutations are shared between samples only when the Performance test explicitly allows mutation.

Limitations:

- Cookie parsing covers common `Set-Cookie` attributes but is not a complete browser cookie implementation.
- Cookie jar behavior is local to the workspace and does not synchronize across devices.

## HTTP Request Execution

Request execution is handled by `httpClient.js`.

Supported methods:

- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `HEAD`
- `OPTIONS`

Supported URL schemes:

- `http`
- `https`

Validation:

- Request object is required.
- URL is required.
- URL must parse as a URL.
- URL must include a host.
- Scheme must be `http` or `https`.
- Method must be in the supported method set.
- Header names must match HTTP token syntax.
- Auth helper configuration must be complete for selected auth type.

HTTP behavior:

- Uses Node global `fetch` for normal requests.
- Uses Node `https` request transport for HTTPS client-certificate requests so PEM certificate options can be applied. PFX/P12 bundles are parsed parent-side into in-memory PEM buffers first to avoid platform-specific Node/OpenSSL PFX parsing behavior and to avoid decrypted PEM temp files.
- Timeout: 180 seconds via `AbortSignal.timeout`, matching the audited Postman Runtime default global timeout budget used for default script/request execution.
- Redirects: normal fetch requests follow runtime redirect behavior; client-certificate requests follow up to 10 redirects only when the redirect target remains on the original HTTPS origin.
- Response body decoding: UTF-8 text after transport decompression for supported compressed responses.
- Ignores user-provided `Content-Length`; the runtime manages it.
- Adds runtime-generated request headers after user headers and query parameters are collected, then applies auth and cookies. Generated headers include default `Accept`, `Accept-Encoding`, and `User-Agent`, managed `Content-Length` when a body is sent, transport-managed values such as `Host`, and auth/cookie helper headers where applicable. Explicit user headers override default generated headers except for managed `Content-Length`.
- `PostMeter-Token` is opt-in per request. When enabled, PostMeter sends a per-send random token unless the user explicitly supplies a `PostMeter-Token` header.
- The Headers editor can show or hide read-only auto-generated header rows. Those rows are display-only and are not saved into the request header list.
- Captures response status, headers, body, final URL, response size, and rounded duration.

Body behavior:

- `NONE` sends no body.
- The request editor uses one Body Type dropdown for `None`, `Form data`, `x-www-form-urlencoded`, `Raw`, `Binary`, and `GraphQL`.
- Raw bodies support `Text`, `JavaScript`, `JSON`, `HTML`, and `XML` format selection. Defaults are `text/plain; charset=utf-8`, `application/javascript`, `application/json`, `text/html; charset=utf-8`, and `application/xml`.
- Form-data bodies support text fields and user-bound file source references. File part content types are inferred from the file name or source extension and fall back to `application/octet-stream`; runtime file reads stay limited to approved workspace file bindings.
- File source fields open a small source menu that launches the shared drag/drop local file picker. Selecting a local file writes the source reference and saves only the reviewed file binding metadata, leaving the request, runner-owned request, or Performance request dirty until the user saves that item.
- `x-www-form-urlencoded` bodies are encoded with enabled key/value rows only.
- Binary bodies use a user-bound file source reference plus optional content type.
- GraphQL bodies expose query, variables, and operation-name fields. They persist as Postman-compatible `postmanBody.mode = "graphql"` metadata, execute as `application/json`, support environment substitution in query/variables/operation name, and are available in collection requests, runner-owned requests, and Performance request copies.
- Request, runner-owned request, and Performance request body editors share the same body modes and preserve Postman compatibility metadata through save/import/export paths.
- Body content supports environment substitution for raw text, form-data text fields, urlencoded fields, and GraphQL payload fields.

## Scripts And Runner

Request checks are authored in Scripts with Postman-compatible `pm.test`, `pm.expect`, and `pm.response` helpers. Collection and workspace-owned runner execution are handled by `collectionRunner.js`.

Response viewer formatting:

- JSON bodies are pretty-printed when the content type or body shape indicates JSON.
- XML bodies are parsed and formatted when the content type or body shape indicates XML.
- HTML bodies are parsed and formatted when the content type or body shape indicates HTML.
- Invalid or unsupported bodies fall back to their original text.

Runner behavior:

- Stores first-class desktop runners under `workspace.runners`.
- Models each runner as `{ id, name, environmentId, allowEnvironmentMutation, stopOnFailure, capturePolicy, requests }`.
- Stores runner-owned requests as independent request objects. Importing collection requests deep-clones them into the runner with new runner-local IDs, so runner edits and executions do not mutate source collection requests.
- Creates runners from `New` > `Runner` in the top toolbar or from the `New Runner` action in the empty Runners pane.
- Enables stop-on-failure by default for new runners. Users can turn it off from the runner Advanced menu when a workflow should continue after failures.
- Adds runner requests through either local `New Request` creation or an `Import` modal. The modal shows collections first, expands a collection only when selected, and supports Shift+click/Ctrl+click multi-select across collections and requests before adding.
- Opens runner-owned request copies in normal request editor tabs through each row's `Edit` action. Saving that tab persists only the runner request copy, and discard/close reverts the runner row back to the saved runner request state.
- Lets users set per-row iterations, delete, and reorder runner request rows. Drag/drop and row-order controls update runner-local order without touching source collections.
- Walks runner requests in runner row order and expands each row's `iterations` value into sequential executions before advancing to the next row. Legacy collection execution still walks collection requests in collection/folder order.
- Runs pre-request scripts before sending each request; failed pre-request scripts fail the request without sending it.
- Executes requests sequentially through the same HTTP path as normal sends.
- Uses the runner's selected environment, which can differ from the top-right request environment selector.
- Clones the selected runner environment before the run when `allowEnvironmentMutation` is disabled. Scripts can mutate that temporary environment for later runner requests, but the saved environment is unchanged after the run.
- Applies script environment mutations back to the selected saved environment when `allowEnvironmentMutation` is enabled.
- Resolves collection variables, active environment variables, and request-local variables for request sends, with request-local values overriding environment values and environment values overriding collection values.
- Runs test scripts after responses are received.
- Applies script variable mutations to later requests.
- Propagates cookie jar updates between sequential requests when request cookie jar storage is enabled.
- Emits progress events to the renderer and renders execution results as a split view: request/status rows on the left and selected request details on the right. The result list and details are paged from the reusable temp result store for store-backed runs, with pre-run disk-space warnings before the temp SQLite file is generated.
- Supports cancellation and stop-on-failure, including stopping inside a repeated runner row when one iteration fails.
- Caps a single runner run at 1,000,000 expanded request iterations. Core metrics are retained for every request, while high-volume guardrails automatically limit heavy optional captures.
- Supports bounded `pm.execution.setNextRequest`, `pm.execution.skipRequest`, and `pm.execution.runRequest` against runner-local request IDs.
- Reports per-request status, timing, pass/fail state, script results, and request errors.
- Reports final runtime collection/environment variables plus per-request local variables in the desktop runner output and result exports when those captures are enabled.
- Returns the final cookie jar to the Electron main process so it can be saved with the workspace.
- Exports Runner and Performance results as JSON, CSV, or self-contained HTML reports through desktop IPC. Store-backed exports stream from the temp result database only when the user requests an export.

Limitations:

- JSON path support is intentionally simple and does not implement full JSONPath filters or expressions.

## Script Runtime

Postman-style script execution is implemented in `scriptRuntime.js`, isolated through `scriptSandbox.js`/`scriptWorker.js`, and wired into single-request sends plus collection runner pre-request and test phases.

The sandbox contract is `docs/SANDBOX_CONTRACT.md`. The behavior below describes the current implementation.

Implemented runtime behavior:

- Runs scripts in a forked child process so user scripts do not execute in the Electron main process.
- Runs pre-request scripts before a single request is sent and test scripts after the response is received.
- Persists `pm.environment`, `pm.collectionVariables`, workspace `pm.globals`, and request-local `pm.variables` mutations back to the active workspace scopes for single sends and collection runs.
- Starts script workers with a minimal environment instead of inheriting the full PostMeter/Electron process environment.
- Starts script workers through `src/core/sandbox/osSandbox.js` with OS sandboxing required. Backend selection probes the launcher before use, and script execution fails closed when the platform backend is missing or fails its functional probe. Legacy `auto` or `off` requests are normalized to required. The Linux backend uses `bubblewrap` with cleared environment, unshared namespaces including network, dropped capabilities, private writable `/tmp` and `/run`, disabled nested user namespaces, read-only runtime/app/library bind mounts, and a seccomp cBPF policy that denies high-risk kernel APIs including `bpf`, `ptrace`, keyring, module-loading, mount, process-memory, performance-event, `io_uring`, and nested namespace syscalls such as `unshare`, `setns`, and `clone3`. The Windows backend builds and packages the release-owned `PostMeterWindowsSandboxHelper.exe`, launches workers in a stable AppContainer profile with no declared network capabilities, grants only required runtime/app paths plus a private temp directory, passes a minimal child environment, and keeps the child in a kill-on-close single-process job object. The macOS backend launches workers through `sandbox-exec` with a deny-default seatbelt profile, denied network access, explicit process-exec/process-fork denial, no broad process allowance, read-only runtime/app/library access, and a per-launch private writable temp directory.
- Starts script workers with Node permission flags when the pinned runtime supports them, allowing filesystem read access only to the exact worker/runtime modules, dynamic-variable and variable-scope helpers, reviewed package-cache helper, and the pinned Postman package bundle needed by script execution.
- Fails closed for packaged Electron script execution when Node permission flags are unavailable, and requires the same permission support for CLI script workers on the supported Node 22+ baseline.
- Starts script workers with a bounded V8 old-space limit. The default is `64` MB, tunable with `POSTMETER_SCRIPT_WORKER_MAX_OLD_SPACE_MB` or internal test options between `16` and `512` MB.
- Hardens host-created script API objects, functions, arrays, caught errors, and promise-like async results so scripts cannot use constructor/prototype paths to reach worker host objects.
- Runs scripts inside a Node `vm` context with renderer APIs unavailable. Sandbox `require` is a Postman compatibility loader, not host Node resolution; host `process`, raw `fetch`, `XMLHttpRequest`, `WebSocket`, `globalThis`, WebAssembly, filesystem, shell, Electron, renderer DOM, and raw networking are unavailable.
- Allows audited direct eval, indirect eval, `Function` dynamic string execution, and a hardened top-level lexical `Buffer` facade inside the isolated VM context for Postman import parity while keeping `Function`-created code and constructor escapes unable to see host process, raw network, or lexical `Buffer` handles.
- Enforces a default per-script timeout of `180000` ms and a max script length of `256 KiB`.
- Terminates the child process if the parent safety timeout is exceeded.
- Keeps explicit worker heap, broker payload, `pm.sendRequest` response body, final result, console, visualizer, package-cache, mock-state, and workspace payload caps. The runtime-limit audit records these as intentional strict sandbox ceilings where Postman/Newman expose no stable equivalent bound.
- Captures bounded console output in the script result instead of writing directly to the app console. Script results keep at most 100 captured log entries, each captured line is capped at 4096 characters, and the runtime supports `log`, `info`, `warn`, `error`, `debug`, `trace`, `time`, `timeEnd`, `group`, and `groupEnd` with basic format-token handling.
- Supports Postman-style `pm.test` behavior in the isolated worker runtime: sync callbacks, callback-style async, promise-returning callbacks, mixed callback/promise completion, `pm.test.skip`, `pm.test.index`, duplicate names, skipped-result metadata, nested async tests, and deterministic result ordering.
- Supports a broad Chai-compatible `pm.expect` and bundled `chai` facade: equality/deep equality, negation, deep/nested/ordered membership, include/contain, keys, type checks, length, one-of, above/below/within, close-to, match, property/own property, satisfy, throw assertions, `respondTo`, `instanceOf`, arbitrary-value `jsonSchema`, common `chai.assert` helpers, and basic `chai.should()` helpers.
- Supports `pm.environment`, `pm.collectionVariables`, workspace `pm.globals`, request-local `pm.variables`, `pm.iterationData`, `pm.info` request/protocol metadata, array-shaped `pm.execution.location` with string `.current`, `pm.message` data/name/type/timestamp/toJSON for streaming protocol hooks, Postman Collection SDK-style request/response/list objects, request URL/query/header/body/auth/metadata/message inspection and validated pre-request mutation helpers, response status/reason/header/cookie/body/metadata/trailer/message helpers, status-category response helpers, JSON-body/JSON-schema response helpers, response status-name strings, response-time assertions, protocol metadata/trailer/message assertion helpers, and message-list assertion helpers.
- Supports variable `clear`/`toJSON` where Postman exposes them, preserves script-visible variable metadata including current/initial/type/sensitive flags, honors disabled variables, handles iteration-data `unset`, and resolves the documented Postman dynamic variable catalog through `pm.variables`/`replaceIn` and request interpolation.
- Supports brokered timers, including bounded `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, and queueMicrotask/promise drain behavior, plus brokered `pm.sendRequest`, user-granted file/binary/form-data attachment bindings, bounded brokered `pm.execution.runRequest` with request ID/name/link targets and a 10-call per-script limit, current-URL `pm.cookies`, and `pm.cookies.jar()` helpers in the isolated worker runtime. Script network requests, script cookie access, and script vault access are enabled by default for Postman import parity and can be disabled in local Settings.
- The default Postman import profile exposes in-scope `HttpOnly` values through `pm.cookies` and `pm.cookies.jar()` to match current Postman/Newman behavior; disabling script cookie access blocks those helpers entirely.
- Supports bounded `pm.visualizer` capture with JSON-cloned data and an integrity-checked `handlebars@4.7.9` browser runtime loaded inside a separate visualizer VM context. The facade supports compile/precompile/template/create, helpers, block helpers, runtime helpers, dynamic partials, inline partials, custom decorators, `Handlebars.SafeString`, block params, data variables, parent/root lookup, whitespace/noEscape behavior, inline scripts in an isolated iframe, `pm.getData(callback)`, sanitized output, integrity-checked reviewed JS/CSS assets, and sandboxed iframe rendering in the desktop UI.
- Supports brokered `pm.vault` access through the parent process, including optional workspace, collection, and request grants with explicit denial overrides. If vault access is disabled and no scoped grant exists, desktop single-request sends, collection runs, and nested lifecycle executions can display a metadata-only renderer prompt with request, collection, workspace, operation, secret-key, deny, reset, request-grant, collection-grant, and workspace-grant choices; concurrent renderer prompts are queued by prompt ID; prompt responses are accepted only from the renderer `webContents` that received the prompt; prompt decisions are persisted as scoped vault-grant metadata on the prompted workspace without exposing secret values, vault paths, encryption keys, ciphertext, storage handles, or secret lists to the renderer. Denied or cancelled prompts fail the vault call so code after the denied call does not run. Audit metadata covers prompt grants, prompt denials, prompt resets, `get`, `set`, `unset`, denied-after-call, and unavailable-encryption outcomes without logging secret values. Desktop vault values are stored outside workspace JSON in per-workspace encrypted vault files, using Electron `safeStorage` only when OS-backed encryption is available and not the Linux `basic_text` backend.
- Supports Postman documented script globals including URL/URLSearchParams, Web Crypto digest/random helpers, `TextEncoder`/`TextDecoder`, `atob`/`btoa`, Blob/File, structuredClone, queueMicrotask, DOM-style abort/event/error objects, Web Stream constructor facades, ECMAScript built-ins, and typed arrays. Host-created Blob/Web Crypto byte results are exposed as script-safe array-buffer facades so `byteLength` and typed-array construction work without exposing host constructors.
- Supports `pm.require()` and sandbox `require()` for Postman's generated, version-pinned `postman-sandbox@6.2.2` browser bundle: `ajv`, `backbone`, `chai`, `cheerio`, `crypto-js`, `csv-parse/lib/sync`, `json`, `lodash`, `moment`, `postman-collection`, `tv4`, `uuid`, and `xml2js`; and for Postman-listed NodeJS module shims/facades: `path`, `assert`, `buffer`, `util`, `url`, `punycode`, `querystring`, `string-decoder`, `stream`, `timers`, and `events`. The loader also supports reviewed cached `@team/package`, exact/scoped npm, and exact/scoped JSR bundles with SHA-256 integrity metadata, multi-file CommonJS/ESM file maps, package metadata entrypoints, package.json directory entrypoints, relative/extension/JSON resolution, reviewed dependency aliases and subpaths, module cache/circular behavior, default and named exports, package/source/dependency/export caps, declared-dependency policy, and parent-side fetch/review for exact npm/JSR packages plus reviewed HTTPS team-package source URLs. It rejects host Node built-ins outside the facade list, `node:` specifiers, unreviewed external registry/team packages, unversioned npm/JSR latest resolution, runtime registry fetches, package installation, paths, URLs, duplicate package-cache entries, missing reviewed dependencies, undeclared dependency subpaths, and any package outside the allowlist, Node facade list, or reviewed cache.
- `require('postman-collection')` uses Postman's bundled Collection SDK inside the script VM. Live `pm.request` and `pm.response` objects use hardened PostMeter SDK-style facades with common SDK list methods, object-predicate list filtering, `clone`/`toJSON`/`toString`, disabled item handling, case-insensitive headers, multi-value header object conversion, URL query mutation, request body mode facades, response cookies, metadata, trailers, messages, and constructor/prototype escape hardening.
- Supports `pm.execution.setNextRequest` and pre-request-only `pm.execution.skipRequest` for collection-run control. `skipRequest()` halts remaining pre-request code, skips the main send and post-response scripts, and is absent from post-response scripts so post-response failures do not cancel an already-returned response.
- Supports imported GraphQL Before query/After response execution by adapting GraphQL body mode into a brokered HTTP JSON request while preserving query variables, operation name, auth, headers, response parsing, package imports, variable interpolation, `pm.info.eventName`, and subscription-style response message normalization into `pm.response.messages`.
- Supports imported gRPC Before invoke/On message/After response execution through a parent-owned `@grpc/grpc-js` transport for unary, client-streaming, server-streaming, and bidirectional streaming methods. The lifecycle preserves method path, proto/service/method metadata, request metadata, outgoing messages, streaming method type, incoming messages, response metadata, trailers, status, cancellation flags, package imports, `pm.message` with hardened Date timestamps, protocol assertion helpers, message-list assertions, and protocol `pm.info.eventName` without exposing raw sockets or host networking to scripts. Proto source/path, include dirs, TLS material, client options, and client-certificate auth are snapshotted before Before invoke so scripts cannot redirect parent filesystem/TLS reads. gRPC mTLS supports PEM cert/key material including encrypted PEM keys with passphrases, plus the same parent-side in-memory PFX/P12 extraction path used by HTTP client-certificate requests; certificate files are read as regular files through byte-capped descriptors, configured `certificateId` bindings fail closed when missing and do not fall back to direct request paths, and script-injected direct certificate/PFX/CA/passphrase mutations are denied at the lifecycle boundary. Scripts never receive certificate paths, passphrases, contents, private keys, or filesystem handles. The renderer can display editable workspace certificate path/passphrase metadata like the rest of the plain-JSON request configuration, but extracted PEM buffers, private-key material, parser handles, and transport credentials stay parent-side.
- Supports local mock scripts through `localMockServer.js`, with loopback HTTP serving, method/path-only matching, path variables, saved-example fallback, `pm.mock.matchRequest`, `pm.mock.sendExample`, Express-style `req`/`res` including request JSON parsing and response status/header/body helpers, top-level mock-script `await`/`return`, and `pm.state.get/set/delete/has/keys/size/clear/toObject/increment/push/addToSet`. Mock state is per-session JSON data with key/value/session caps, operation caps, reset/clear controls, parent-brokered mutations, and commit/rollback tied to script phase success. `pm.mock`, `pm.state`, `req`, and `res` are only injected in mock contexts.
- Persists script side effects through queued latest-workspace commits with workspace identity guards and per-key/per-cookie delta merges, so overlapping sends/runs do not overwrite unrelated newer workspace edits.
- Provides explicit errors for host-only APIs and package-loading paths that Postman does not expose in scripts: raw `fetch`, `XMLHttpRequest`, `WebSocket`, process access, host Node resolution, `node:` specifiers, WebAssembly, browser globals, unreviewed package loading, native modules, paths, runtime registry fetches, Electron, renderer, and raw socket access. Current Postman WebSocket/Socket.IO docs do not expose saved script hooks, so PostMeter records that audit result instead of inventing WebSocket hook execution.
- The Postman/Newman-style fixture corpus in `test/fixtures/postman` runs through the normal Postman importer and collection runner or the local mock runner, covering async ordering, nested `pm.sendRequest`, user-granted file/binary/form-data attachment bindings, SDK request/response/list objects, Step 4 `pm.test`/Chai/variable/dynamic-variable behavior, `pm.execution.location`, `pm.execution.runRequest`, GraphQL and gRPC protocol hooks, local mock `pm.mock`/`pm.state`, interactive Handlebars `pm.visualizer` including reviewed assets, brokered `pm.vault`, bundled packages, reviewed cached packages, multi-file CommonJS package loading, Postman globals, NodeJS module facades, timers/microtasks, iteration data, cookie scope, variable precedence, execution control, cancellation, skipped requests, and mixed `pm.test` pass/fail behavior.
- The current audited parity target is Postman Desktop 11.71.7 with `postman-sandbox@6.2.2` and Postman Runtime 7.50.0, plus Newman 6.2.2 with Postman Runtime 7.39.1 for Newman-compatible surfaces.
- The generated Postman sandbox parity matrix lives at `docs/postman-sandbox-parity-matrix.json` with source in `src/core/diagnostics-release/postmanParityMatrix.js`; `npm run postman:parity:validate` fails if it is stale or structurally invalid.
- The official Postman/Newman docs coverage audit lives at `docs/postman-docs-coverage-audit.json` with source in `src/core/diagnostics-release/postmanDocsCoverageAudit.js`; `npm run postman:docs:validate` fails if any committed official-docs token is unmapped, and `npm run postman:docs:live` refetches the current official docs plus the Newman npm latest dist-tag to catch upstream drift before preserving a 1:1 script-import claim.
- `npm run postman:parity:claim` is the full Postman script compatibility gate for the supported default import profile. It currently passes with zero default-import blockers. Implemented behavior-sensitive Desktop rows are validated against explicit row-specific Desktop evidence metadata.
- `npm run postman:parity:diff` runs the HTTP-core, broad, dynamic-host-globals, runtime-limits, HttpOnly-cookies, sendRequest-advanced, and file-binding Newman-compatible differential collections through PostMeter, and `npm run postman:parity:diff -- --newman --download-newman` optionally compares the same fixtures against the targeted `newman@6.2.2` reporter output. `npm run postman:newman-reports:refresh -- --download-newman` runs the approved live Newman differential and rewrites the checked-in evidence in one explicit network-using step; `npm run postman:newman-reports:write -- --from <dir>` keeps the two-step refresh path available and accepts only clean source summaries targeting `newman@6.2.2`, Postman Runtime 7.39.1, and the exact approved suite list. Checked-in raw Newman, raw PostMeter, and normalized `newman@6.2.2` JSON evidence lives under `test/fixtures/postman/newman-reports/`; `npm run postman:newman-reports:validate` keeps it structurally current without network access, verifies all required suites, rejects unexpected checked-in JSON files and stale normalized Newman/PostMeter output, requires generation metadata on each normalized report, preserves response-shape/body-digest evidence and console output when present, and fails if normalized evidence still contains concrete localhost ports, local filesystem paths, generated request IDs, generated Postman request tokens, generated multipart boundaries, time-derived request signatures, machine names, or machine-specific metadata.
- The OS-sandbox platform completion matrix lives at `docs/os-sandbox-platform-matrix.json` with source in `src/core/sandbox/osSandboxPlatformMatrix.js`; `npm run sandbox:platform:validate` fails if it is stale or structurally invalid.
- `npm run sandbox:platform:claim` is the implemented tier-one OS sandbox backend gate. It is intentionally separate from Postman API parity and passes when the committed platform matrix records implemented Linux `bubblewrap`/seccomp, Windows AppContainer helper, macOS seatbelt, and packaged-validation rows; stable production readiness still requires native-runner/manual evidence in the production readiness matrix.
- `npm run release:gate` validates that the package scripts and CI/release workflows keep the sandbox runtime validation, OS-sandbox platform-matrix validation, packaged validation, parity validation, official-docs coverage validation, aggregate `npm run check`, packaged Linux validation, and Windows/macOS native validation hooks in the production release gate.
- `npm run production:readiness`, `npm run production:readiness:validate`, and `npm run production:readiness:claim` read the source-owned production readiness dashboard from `src/core/diagnostics-release/productionReadinessMatrix.js` and generated `docs/production-readiness-matrix.json`. The default claim command is the fail-closed stable-release gate; `npm run production:readiness:claim:beta` and `npm run production:readiness:claim:rc` expose lower release-level thresholds, with RC accepting only validated rows or explicit documented RC waivers. Normal validation is wired into CI/release as a freshness check, and the tag-driven release workflow runs the stable claim before building publishable artifacts. The dashboard also tracks dependency audit and Electron runtime-version checks as release-blocking rows instead of leaving them implicit inside aggregate scripts.
- Production observability is privacy-first and local-only. `src/core/diagnostics-release/diagnostics.js` writes bounded JSONL diagnostic events with log levels, record caps, file-size caps, one-file/multi-file rotation, and the final Electron user-data diagnostics directory. Request/response URLs, path/query values, methods, status codes/categories, sizes, headers, HTTP/gRPC metadata, cookies, auth material, bodies, aliases, protocol messages, script-console traffic echoes, and payload-derived identifiers are omitted by default unless a current-workspace opt-in in managed workspace `localsettings` explicitly enables that category. `electron/ipc/diagnosticsIpc.js` waits for queued local privacy-setting saves, then exports a user-selected local JSON bundle containing app/runtime metadata, sanitized settings, workspace counts, readiness status counts, privacy flags, and recent sanitized diagnostic events. There is no automatic telemetry, remote upload, PostMeter account flow, screenshot inclusion, artifact-directory crawl, GitHub Actions log ingestion, DNS lookup, HTTP(S) request, or raw socket connection.
- Diagnostics default-deny inbound/outbound request and response data, including URLs, path/query values, methods, status codes/categories, sizes, headers, HTTP/gRPC metadata, cookies, auth material, request/response bodies and aliases, form-data parts, GraphQL variables, gRPC messages, rendered response text, examples/history payloads, script-echoed traffic values, console-output aliases, and payload-derived identifiers. Workspace-local opt-ins stored in managed workspace `localsettings` can enable narrow categories (`urls`, `headers`, `cookies`, `bodies`, `protocolMessages`, `scriptConsole`, and `payloadIdentifiers`), but auth schemes including header-shaped standalone Bearer/Basic/Digest/Hawk/Token/OAuth/NTLM/Negotiate tokens, comma/semicolon-delimited compound Digest-style parameters with optional whitespace around equals, JSON-escaped/double-escaped/nested-JSON camelCase auth-header aliases, AWS SigV4 and Akamai-style signature parameters, chained AWS query credentials next to kebab-case OAuth secret assignments, assigned exact token/code/state fields, assigned and bare whitespace-only snake_case/kebab-case/camelCase OAuth/token fields, unquoted multi-word and repeated-whitespace secret fields, certificate passphrases, generic credential fields, sensitive object keys, unescaped JSON/annotated/class-style and parenthesized util-inspect URL/header/metadata array/object aliases with whitespace/colon/equals separators, structured header/metadata key/name pairs with sensitive value/raw/currentValue/schema fields, object/array request/response assignments, bare, assigned, escaped, double-escaped, and nested-JSON including escaped newline/quote/backslash camelCase/snake_case/kebab-case body/bodyPreview/data/responseText/text/variables/rendered-response aliases, script-console aliases, payload-identifier aliases, protocol-message aliases, cookies, JWTs including JWT-shaped URL path/query/fragment values, private keys, UNC/extended UNC/Windows device/Windows/macOS/POSIX local paths including file:// URLs, JSON-escaped slash URLs, JSON-escaped POSIX paths, file URLs, mixed path/URL chains, URL credentials across supported and custom URL schemes, OAuth provider/progress error URL and path references, OAuth callback code/state params and token fragments, URL-encoded free-text OAuth/token parameter strings, bare DNS/IP/localhost transport endpoints, secret query/fragment/path params including path label/value and inline same-segment forms with encoded slashes, routed fragment path forms, single- and multi-encoded delimiter forms including recursively nested encoded wrapper params and structured key/value/raw/currentValue/example/schema-default arrays, source/UI/packaged smoke failure output, source/packaged sandbox validation child output, and IPC handler/export failure messages and diagnostic event type/outcome/failure-code metadata including compact/delimiter-free token/code/state labels and one-letter token aliases plus secret-shaped IPC/export error names and codes are still redacted. Auth-scheme words embedded inside hyphenated values are not treated as standalone auth schemes, and URL category opt-ins preserve non-sensitive query, fragment, and path context while redacting sensitive query, fragment, path label/value, inline path, routed fragment path, encoded delimiter, auth, and token values. Imported and exported native workspaces omit local diagnostics settings so a shared file cannot silently enable traffic logging, and partial settings saves preserve the current diagnostics privacy state unless a diagnostics field is explicitly changed.
- Workspace diagnostics controls are current-workspace scoped: editing and export are disabled for selected non-current workspaces, PII warnings are programmatically tied to risky controls, failed local settings saves roll back in-memory state, and diagnostics export waits for any pending diagnostics settings save before producing a bundle.
- `npm run diagnostics:privacy:validate` validates the source-owned diagnostics/privacy matrix at `docs/diagnostics-privacy-matrix.json`; `npm run diagnostics:privacy:write` regenerates it. The production readiness row `diagnostics.privacy` is validated locally by diagnostics unit tests, IPC tests, renderer binding/UI regression tests, import-reset tests, event-emitter tests, matrix freshness, and `npm run check`.
- `npm run ux:accessibility:validate` validates the source-owned production UX/accessibility/failure-recovery matrix at `docs/ux-accessibility-matrix.json` and rejects stale rows, escaped evidence paths, empty evidence/test arrays, invalid statuses, placeholder or URL values in executable test references, non-test files used as test references, missing evidence/test files, and unknown `npm run` script references. The matrix enumerates first launch, workspace management, request editing/sends, collection runs, imports/exports, OAuth flows, package review/fetch, vault prompts, file bindings, local mocks, settings/theme, update checks, keyboard/focus behavior, accessible tab/live-region semantics, keyboard-operable splitters, variable-autocomplete relationships, constrained desktop sizing, active forced-colors focus behavior, long labels, and startup/UI smoke failure artifacts. Production renderer workflows use in-app text-input, secret-input, confirmation, notification, export, save-draft, and vault-access modals instead of raw native prompt/confirm/alert dialogs. Toolbar and tree context menus expose menu semantics with keyboard-open focus, arrow/Home/End item navigation, keyboard activation, Escape/Tab close, and focus restoration after modal-triggered rerenders, opened tabs retain focus after selection rerenders, variable autocomplete refreshes the active descendant during keyboard navigation, and app-level status messages update a visible live status region. Package review/fetch, imported-file binding, vault operations, sandbox capability toggles, theme/prerelease settings, collection-import saves, pre-send/pre-run saves, stale runner completions after workspace context reset, and pending-mutation shutdown sync saves fail visibly, roll back in-memory changes, ignore stale completions, or skip stale writes. Regression tests keep these boundaries in place. Startup and source UI smokes can write screenshot, redacted structural DOM-state including active-element ARIA metadata, and log artifacts through `POSTMETER_VALIDATION_ARTIFACT_DIR` or `POSTMETER_UI_SMOKE_ARTIFACT_DIR`; startup load/preload/early renderer failures fail fast with artifacts, and source UI output, source/packaged sandbox validation child output, and packaged smoke launcher output plus thrown failures use the shared diagnostics redactor for local paths, private keys, request/response alias values, JSON-escaped slash URLs/file URLs, Bearer/Basic/Digest/Hawk/Token/OAuth/NTLM/Negotiate auth-shaped values, JSON-escaped/double-escaped/nested-JSON camelCase auth-header aliases, and OAuth authorization-code/device-code/user-code/code-verifier/client-assertion fields. Smoke child stdout/stderr and script-worker stdio lines are byte-bounded, and release artifact inspection commands plus smoke and sandbox-validation child processes are timeout-bounded and fail closed with timeout code 124 where applicable. CI, release, and manual native release validation all run startup, workflow, regression, typography, OAuth, and snapshot smoke suites in the production gate; release/manual native validation run them before production-readiness validation, while CI runs the same individual validators and smokes in the pull-request gate and `npm run check` keeps the equivalent local aggregate gate.
- `npm run sandbox:validate` runs the pinned Electron runtime, verifies Node permission enforcement for arbitrary filesystem reads and child-process spawning, checks the worker launch allowlist, verifies Linux OS-sandbox filesystem/network denial and seccomp-policy launch state where applicable, and runs an adversarial script-boundary probe.
- `npm run sandbox:validate:packaged` runs the same validation entrypoint through a built desktop executable, covering packaged path, ASAR behavior, and the platform OS backend on Linux, Windows, and macOS runners.

Limitations:

- The platform OS-sandbox implementation is source-owned and matrixed separately from Postman API parity. Linux uses `bubblewrap` plus dangerous-syscall seccomp, Windows uses the release-owned AppContainer helper built by `npm run native:windows-sandbox:build` and packaged as an extra resource, and macOS uses a deny-default seatbelt `sandbox-exec` profile. `npm run sandbox:platform:claim` should pass when `docs/os-sandbox-platform-matrix.json` is current. Native runner packaging rows in the production readiness matrix still track release evidence separately from this implementation claim.
- Keep `npm run postman:parity:claim`, `npm run postman:docs:validate`, and a current `npm run postman:docs:live` sweep green before preserving the tracked Postman script compatibility claim. Local production resource ceilings remain documented safety policy for host-exhaustion-sized payloads, and the platform-equivalent OS sandbox claim remains tracked separately by `docs/os-sandbox-platform-matrix.json`.

## CLI Runner

The CLI entry point is `scripts/postmeter-cli.js`.

Command:

```bash
npm run cli -- run --file <workspace-or-collection> [--collection <id-or-name>] [--environment <id-or-name>] [--report <path>] [--format json|csv|html] [--stop-on-failure]
```

Behavior:

- Accepts native PostMeter workspace/collection files.
- Uses the collection import pipeline for Postman, OpenAPI, and curl inputs.
- Selects the first collection by default, or a collection by ID/name.
- Selects no environment by default, or an environment by ID/name for native workspace inputs.
- Accepts repeated `--var key=value` environment overrides and `--collection-var key=value` collection overrides for CI injection.
- Runs request scripts, then exits with status `0` only when all executed requests pass.
- Writes JSON, CSV, or self-contained HTML reports when `--report` is provided.

Limitations:

- CI usage can provide variables with `--var` and `--collection-var`, or run against local test workspaces directly.

## Performance

The local V1 Performance section uses workspace-owned `performanceTests`. V1 test types:

- Full Endpoint Diagnosis
- Latency
- RPS / throughput
- Concurrency
- Stress
- Spike
- Soak
- Ramp

Performance tests can be created from the sidebar empty state or the top-level `New` menu, imported/exported as native PostMeter performance-test files, reordered in the sidebar, opened in dirty-aware tabs, and executed through dedicated `performance:*` IPC/preload channels.

## IPC Validation

Renderer-originated IPC sender identity is checked by `electron/security/ipcSecurity.js` before production handlers run, including fail-closed rejection for missing sender-frame metadata, subframe senders, non-`postmeter-app` origins, unexpected app-protocol paths, and unexpected app-protocol query keys. IPC inputs are validated in `ipcValidation.js` before reaching main-process behavior. Shared enum and high-level payload contract metadata lives in `payloadSchemas.js` with `PAYLOAD_SCHEMA_VERSION = 1`. The source-owned Electron security matrix enumerates the BrowserWindow, navigation, window-open, webview, permission, secure app-content protocol response headers, main-frame-only preload, every IPC channel, IPC sender validation, file-dialog, external URL, custom protocol, packaged-preload, packaged-protocol, fuse, renderer CSP, and visualizer CSP surfaces and is validated by `npm run electron:security:validate`.

Covered payloads:

- Workspace save/export payloads.
- Local settings payloads, including theme preference, modal behavior, force-close behavior, diagnostics opt-ins, sandbox grants, and prerelease update-check opt-in.
- Workspace cookie payloads.
- Collection export payloads.
- Collection certificate payloads.
- Request send/validate payloads.
- Request auth payloads, including OAuth grant, token type, redirect strategy, and API-key location enums.
- Request-local variable and example payloads.
- Request cookie jar option payloads.
- Optional active environment payloads.
- File-operation result payloads returned by import/export handlers, including optional workspace and collection results.
- Collection-run result export payloads.
- Collection-run pre-request/test script result shapes, local variable rows, environment output, collection variable output, and cookie output.
- App update-check option payloads.
- External URL open payloads before credential-free `shell.openExternal` launches.
- Main-process response payloads for request results and workspace load/save results.

Validation behavior:

- Requires expected object/array/string/number/boolean shapes.
- Bounds collection, folder, request, pair, history, string, body, allowed-host, and folder-depth sizes.
- Rejects unsupported request methods and body types before core execution.
- Validates key response shapes before returning them to the renderer.

Limitations:

- Request/workspace declared arrays, nested payload checks, and common primitive field groups, including auth fields, are routed through shared entity/field metadata in `payloadSchemas.js`.
- Some payload-specific nested checks are still handwritten.

## Packaging And CI

Packaging is configured through `electron-builder` in `package.json`.

Distribution scripts pass `--publish never`; GitHub Release publication is handled only by the release workflow's explicit `gh release create` step after artifact metadata is generated and validated.

Targets:

- `npm run pack:linux`: unpacked Linux directory build.
- `npm run dist:linux`: Linux deb artifact.
- `npm run dist:win`: Windows NSIS artifact.
- `npm run dist:mac`: macOS DMG and zip artifacts.
- `npm run release:checksums`: writes `release/SHA256SUMS` for generated top-level deb, dmg, zip, and exe distributable artifacts.
- `npm run release:manifest`: writes `release/release-manifest.json` with artifact size, SHA-256, platform, type, app ID, product name, and version metadata.
- `npm run release:prepare`: runs checksums and manifest generation.
- `npm run release:validate`: validates package metadata, canonical GitHub release/update source metadata, expected deb/NSIS/dmg/zip targets, icon metadata, release output directory, the `postmeter://` protocol declaration, top-level-only release manifest entries, exact agreement between top-level distributable artifacts, `SHA256SUMS`, and `release-manifest.json`, artifact sizes, SHA-256 hashes, expected platform/type/name patterns, Linux deb `x-scheme-handler/postmeter` desktop registration, Linux deb hicolor app icons, and macOS zip `.app` `Info.plist` URL-scheme registration when those artifacts are present. Unconfigured MSI/RPM artifacts are rejected until package metadata, docs, upload paths, and native validators explicitly support them. `POSTMETER_RELEASE_REQUIRED_TYPES` can require specific artifact types in release CI.
- `npm run release:validate:win-protocol`: on a native Windows release runner, silently installs the generated NSIS artifact, validates the `postmeter://` registry root/open command belongs to that temporary install, launches a `postmeter://oauth/callback?...` URL through ShellExecute, verifies the launched process path when Windows exposes it, writes a transcript when `POSTMETER_VALIDATION_ARTIFACT_DIR` is set, then runs the generated uninstaller silently.
- `npm run release:validate:mac-protocol`: on a native macOS release runner, validates `PostMeter.app` URL-scheme metadata in the app bundle, zip, and DMG artifacts, registers each discovered bundle with Launch Services, launches a `postmeter://oauth/callback?...` URL through `open -b com.strangequark.postmeter` for each bundle, verifies the launched process belongs to that bundle, writes a protocol log when `POSTMETER_VALIDATION_ARTIFACT_DIR` is set, and quits the app between launches.
- The package author and deb maintainer metadata use `StrangeQuark <support@qrksw.com>`.
- Package repository, homepage, issue tracker, update defaults, and release workflow target `StrangeQuark/PostMeter`.
- Package metadata points Electron Builder at `build/icon.png` for the shared renderer icon, `build/icons` for Linux hicolor app icons, and `build/icon.ico` for Windows shell, installer, and uninstaller icons.
- Debian packages remove the `/opt/PostMeter/postmeter` update-alternatives entry in `prerm` before package files are deleted, while `postrm` is reserved for AppArmor profile cleanup.
- Packaged builds declare the `postmeter://` protocol for OAuth callback handling.
- No desktop file associations are declared in the current package metadata.
- Linux deb artifacts are installed/removed by the user's package manager. Windows NSIS validation installs into a temporary directory and runs the generated uninstaller. macOS dmg/zip artifacts carry `PostMeter.app`; users install by copying the app bundle, and no macOS package uninstaller is produced.
- The app can check `https://api.github.com/repos/StrangeQuark/PostMeter/releases/latest` for stable versions and `https://api.github.com/repos/StrangeQuark/PostMeter/releases` when prerelease checks are enabled. `POSTMETER_UPDATE_URL` is accepted only for explicit development/test override paths and is ignored in packaged production; production update checks remain pinned to the canonical GitHub API host and path.

CI is configured in `.github/workflows/ci.yml` for:

- `npm ci`
- `npm test`
- `npm audit --audit-level=high`
- `npm run electron:version`
- `xvfb-run -a npm run test:smoke`
- `xvfb-run -a npm run test:ui`
- `xvfb-run -a npm run test:ui:regression`
- `xvfb-run -a npm run test:ui:typography`
- `xvfb-run -a npm run test:ui:oauth`
- `xvfb-run -a npm run test:ui:snapshot`
- `npm run pack:linux`
- A native packaged-smoke matrix on `ubuntu-latest`, `windows-latest`, and `macos-latest` that runs source-tree sandbox validation, builds platform artifacts, runs packaged startup smoke, runs packaged sandbox validation, validates Windows/macOS protocol launch behavior, uploads artifacts, and uploads validation logs/screenshots on failure.

Release automation is configured in `.github/workflows/release.yml` for tag pushes matching `v*`:

- Builds Linux, Windows, and macOS artifacts on native GitHub-hosted runners.
- Runs Node tests and checks the Electron runtime version before platform packaging. The version probe runs Electron in Node mode so GitHub-hosted Linux runners do not need Chromium's setuid sandbox helper configured just to print the runtime version.
- Uses `POSTMETER_CI_ELECTRON_NO_SANDBOX=1` only for Linux GitHub-hosted Electron smoke launches where Chromium's setuid sandbox helper cannot be configured by the runner. This app-shell launch waiver is separate from PostMeter's script sandbox validation and is not a production runtime default.
- Retains checksum, manifest, packaged-smoke, protocol, and provenance gates.
- Runs packaged startup smoke on every release platform. The smoke validates the packaged executable, trusted `postmeter-app://bundle/src/renderer/index.html` renderer URL, renderer CSP meta policy, full preload API function surface, app/electron/node/chrome/platform/release-channel metadata, default platform user-data path shape, isolated user-data path override behavior, and workspace save/reload persistence.
- Uploads validation logs and packaged startup-smoke failure screenshots on native runner failure so launch/protocol failures can be inspected after the job exits.
- Downloads platform artifacts into one release directory.
- Generates `SHA256SUMS` and `release-manifest.json`.
- Validates release artifacts and requires deb, DMG, zip, and exe artifact types before publishing.
- Publishes artifacts to GitHub Releases using the built-in `GITHUB_TOKEN`.

Manual native release validation is configured in `.github/workflows/release-validation.yml`:

- Exposes `workflow_dispatch` so maintainers can run the native Linux, Windows, and macOS build/validation path without pushing a tag or publishing a GitHub Release.
- Runs the same release-gate, packaged startup smoke, packaged sandbox validation, Windows protocol validation, macOS protocol validation, artifact upload, checksum generation, manifest generation, and release artifact validation steps used for release evidence.
- Uploads per-platform artifacts and combined validation artifacts with short retention so failed native-runner runs can still be inspected.

Packaging limitations:

- Production validation relies on native package validation, checksums, release manifests, update metadata, protocol checks, and GitHub artifact attestations.
- Artifact upload to GitHub Releases is configured for tag builds. Electron updater metadata (`latest*.yml`) and blockmaps are preserved for packaged automatic updates; users must opt in before PostMeter downloads updates or installs them on quit.

## Testing

Node tests cover:

- Environment variable resolution.
- Auth normalization, validation, OAuth refresh-token renewal, OAuth client-credentials retrieval, OAuth authorization-code PKCE, OAuth device-code authorization/polling, client-certificate field validation, and request-time injection.
- HTTP validation, request execution against a local server, client-certificate path material loading for PEM/PFX/P12/CA inputs, end-to-end local HTTP mTLS handshakes with PEM and PFX/P12 client certificates, and end-to-end local gRPC mTLS handshakes with plain PEM, encrypted PEM, and PFX/P12 client certificates across unary, client-streaming, server-streaming, and bidirectional calls.
- IPC request, response, auth, cookie, workspace, file-operation result, update-check option, external URL open, and collection-run result payload validation.
- Retired execution-policy payload rejection and migration cleanup for removed request/workspace compatibility fields.
- Collection format import/export for Postman, OpenAPI, and curl, including Postman Collection v2.1 script/ID/order/metadata round-tripping, OpenAPI YAML/security import-export, OpenAPI local `$ref` resolution, OpenAPI server/path/cookie/binary metadata, Swagger 2.0 body/form-data import, request body examples, common curl auth/data/redirect/compression/file compatibility flags, and preserved curl proxy/retry/client-TLS import metadata.
- Postman import for common inherited and request-level auth helpers, HTTP/GraphQL/gRPC scripts, protocol hook metadata, request docs, cookies, prefix-constrained cookie metadata, real-world `request.cookie` source-format fixture coverage, variables and raw variable metadata, request/certificate IDs, file/binary body references, binding metadata, and collection certificates.
- Postman sandbox parity matrix validation, the HTTP-core, broad, dynamic-host-globals, runtime-limits, HttpOnly-cookies, sendRequest-advanced, and file-binding Newman-compatible differential fixtures, and the protocol hook fixture, including request mutation, environment mutation, collection-variable behavior asserted inside the script, package/assertion/timer/dynamic-variable/cookie coverage, `pm.info`, `pm.message`, `pm.sendRequest` callback/object-body/advanced-auth/file-binding behavior, GraphQL hooks, and gRPC streaming message hooks.
- Collection-run sequencing, request-local variables, cookie jar propagation, script-mutation propagation, stop-on-failure, isolated request script execution, Node permission worker flags, minimal worker environments, bounded worker heap settings, bounded script console capture, explicit unsupported script API errors, and collection-run CSV/JSON/HTML export.
- CLI collection execution with passing/failing exit codes and JSON/CSV/HTML report output.
- Release manifest generation, release artifact validation, release workflow metadata, CI workflow validation, and GitHub release update checks.
- Workspace default creation, schema `2` through `14` migration, corrupt-file recovery, settings normalization, retired execution-policy field removal, native import, Postman folder/script import, and native/Postman/OpenAPI YAML format detection.
- Electron UI workflow smoke coverage for create/edit/save/reload/send, context menus, pane resizing, collection variables, request variables, request docs, cookie jar capture, environment variables, Help-menu prerelease setting persistence, Help-menu tutorials modal and guided overlay startup, scripts, collection runner, runtime variable output, first-class runner tabs, runner import/edit/reorder/delete controls, runner export-control state and result export dropdown formats, and the Performance sidebar/pane/tab placement.
- Electron UI regression smoke coverage for toolbar dropdowns, Help-menu update state, import/export menu options/cancellation, invalid-request error rendering, XML/HTML response formatting, mocked OAuth flow completion/failure, cookie/request-docs/request-variable editor coverage, active-host cookie filtering, runner pre-run export state and result export formats, runner empty-pane/sidebar behavior, tab context and tab-cap behavior, history clearing, sidebar drag/drop structural saves, insertion-bar feedback, and no app-account/login language.
- Electron UI typography smoke coverage for every built-in interface font and supported interface font-size option, every built-in editor font and supported editor font-size option, combined large-font stress pairs, request/editor/result tabs, collection/folder tabs, environment/workspace/runner/performance/history screens, every Settings section, sidebar fit, horizontal overflow, modal viewport fit, and visible sibling overlap.
- Electron UI OAuth smoke coverage for mocked loopback PKCE success, custom-scheme callback success, wrong-state callback rejection without token persistence, token exchange failure, PKCE cancellation, device-code success, access denial, timeout, and cancellation.
- Electron UI screenshot smoke coverage for request builder, context menu, cookies, auth/OAuth, response viewer, runner, and export menu states.

Missing tests:

- Native-runner packaged custom-scheme OAuth redirect registration scripts are implemented in CI, release, and manual release validation. The remaining requirement is collecting successful `windows-latest` and `macos-latest` run logs before promoting the corresponding readiness rows to `validated`.
- Packaged installer tests beyond the current Windows NSIS silent install/protocol/uninstall validation.
- Cross-platform file-dialog and workspace-path tests.

## Remaining Production Gaps

- Execute and archive successful packaged custom-scheme OAuth redirect validation on native Windows and macOS release runners before promoting packaging rows to `validated`.
- Replace remaining complex payload-specific IPC shape validation with generated validators from shared schemas.
- Collect final native-runner packaged app, protocol, and smoke evidence for Windows and macOS release candidates before promoting the remaining external-validation release rows.
- Continue monitoring native Windows/macOS packaged OS-sandbox validation in CI and release workflows. Linux's current `bubblewrap` namespace plus dangerous-syscall seccomp policy is accepted for the current Linux claim; a stricter deny-by-default seccomp-BPF allowlist is optional hardening, not a v1 release requirement.
- Keep `npm run postman:parity:claim`, `npm run postman:docs:validate`, and a current `npm run postman:docs:live` sweep green before making or preserving the full Postman script compatibility claim.
- Continue monitoring obscure browser/export cookie variants against the expanded real-world fixture corpus; remaining cookie work is compatibility hardening, not a known v1 release blocker.
- Continue hardening local V1 Performance result presentation, pacing fidelity, and real-world workload fixtures around the latency, RPS/throughput, concurrency, stress, spike, soak, and ramp test types.
