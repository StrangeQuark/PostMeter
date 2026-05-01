# PostMeter Technical Specifications

This document is the detailed implementation reference. For quick setup, common commands, and the top-level product overview, use [README.md](README.md).

## Current Migration Status

PostMeter is now implemented as an Electron desktop MVP. The JavaFX/Maven implementation has been removed from the tracked repository; Electron is the only supported runtime.

The migration deliberately does not bridge Electron to the Java services. Core behavior was ported into Node modules so the desktop UI, IPC boundary, persistence, request execution, import/export, and load-test logic can evolve together without carrying JavaFX UI coupling forward.

## Product Scope Implemented

- Create, rename, duplicate, delete, and save requests.
- Organize requests into collections and nested folders.
- Edit HTTP method, URL, query parameters, headers, raw body type, and body content.
- Create/edit/delete collection variables, request-local variables, and environments, then resolve `{{variableName}}` placeholders in supported workflows.
- Persist app settings, currently including theme preference and prerelease update-check opt-in.
- Import/export native PostMeter workspaces, including filesystem-discovered managed workspaces and non-destructive workspace import.
- Import/export native PostMeter collections, including a desktop collection-picker export modal, an empty-state warning when no collections exist, and `<collection-name>.json` native export defaults.
- Import/export Postman Collection v2.1 JSON while preserving folder/request hierarchy order, variables and raw variable metadata, auth inheritance, HTTP/GraphQL/gRPC/local mock scripts, editable examples, cookies and richer cookie metadata including newer priority/partitioning hints where present, supported GraphQL/gRPC protocol metadata, local mock/vault/visualizer/package binding metadata, file/binary body references, request/example/certificate IDs, and supported collection certificate metadata.
- Import/export OpenAPI, JMeter, curl, and HAR collection formats for compatibility workflows, including OpenAPI JSON/YAML input, local `$ref` resolution for common objects, server variables, path/query/header/cookie parameters, Swagger 2.0 body/form-data import, binary body hints, OpenAPI security scheme import/export, OpenAPI response examples and disabled generated response assertions, JMeter variables/assertions/headers/listeners/CSV/thread/timer/controller/extractor metadata where mappable, JMeter XPath and Size Assertion mapping, mapped JMeter assertion enabled-state preservation, representative timer metadata preservation, preserve-only metadata for known unsupported JMeter assertion/processor/sampler/script classes, HAR cookies/response examples/timing/redirect/compression metadata with sensitive header/cookie redaction on export, common curl auth/data/redirect/compression/cookie/file flags, and preserved curl proxy/retry/client-TLS import metadata.
- Define request assertions for status, headers, JSON paths, XML XPath, HTML CSS selectors, response time, response size, body text, JSON/XML/HTML variable extraction, and regex variable extraction.
- Run active collections locally through the desktop Runner tab, including stop-on-failure, extracted-variable/script-mutation propagation, runtime variable display, progress events, and JSON/CSV result export.
- Run collections headlessly through `npm run cli -- run ...` for CI usage with non-zero exits on failed assertions.
- Configure request auth helpers for Bearer token, Basic Auth, API key, Cookie, static OAuth 2.0 access-token injection, refresh-token renewal, client-credentials token retrieval, authorization-code PKCE, device-code flow, and HTTPS client certificates using PEM certificate/key pairs or PFX/P12 bundles with optional CA certificate paths.
- Persist workspace cookies in a local cookie jar, allow per-request cookie jar opt-in/out, capture response cookies when enabled, and validate common browser-parity edge cases.
- Store workspace data as plain JSON without local encryption, redaction, or credential-specific export modes.
- Send HTTP requests and display status, timing, size, final URL, headers, and formatted JSON bodies.
- Record recent request history.
- Check GitHub Releases for newer PostMeter versions and prompt before opening release pages. Stable releases are checked by default; prereleases are checked only when the user enables the opt-in setting.
- Run bounded local concurrent load tests with request-count or duration modes, ramp-up scheduling, target arrival-rate scheduling, Load Test panel run configuration, global rate caps, policy-decision reporting, optional multi-process execution, high-concurrency confirmation, progress, cancellation, streamed worker summary aggregation, latency percentiles, latency histograms, optional capped per-sample capture, error summaries, and JSON/CSV export.

## Product Account Policy

PostMeter is a standalone local desktop application. It must never require a PostMeter account, application login, cloud sign-in, user registration, or user account creation to use the core product.

OAuth support in PostMeter is only for outbound API request authentication, matching normal Postman-style request auth workflows. OAuth tokens belong to the target API request or workspace data; they are not PostMeter user accounts and must not become an app-level login gate.

## Technology Stack

- Desktop shell: Electron `41.3.0`
- Main process: CommonJS Node modules under `electron/`
- Renderer UI: static HTML/CSS/JavaScript under `src/renderer/`
- Core services: CommonJS Node modules under `src/core/`
- HTTP client: Node global `fetch` for normal requests; Node `http`/`https` transport for HTTPS client-certificate requests.
- Persistence: JSON file via `node:fs/promises`
- OpenAPI YAML parsing: `yaml`
- XML parsing and XPath evaluation: `@xmldom/xmldom` and `xpath`
- HTML parsing and selector evaluation: `node-html-parser`
- Packaging: electron-builder with Linux unpacked/AppImage/deb, Windows NSIS, and macOS dmg/zip targets
- Tests: Node built-in test runner plus Electron startup, UI workflow, UI regression, UI OAuth, and UI screenshot smoke scripts

## Runtime Requirements

- Node.js 22 or newer.
- npm 10 or newer.
- Network access for request execution and load tests.
- Writable user-home directory, or a writable directory for the path specified by `POSTMETER_DATA_PATH`.

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
```

### UI And Smoke

```bash
npm run test:smoke
npm run test:ui
npm run test:ui:regression
npm run test:ui:oauth
npm run test:ui:snapshot
```

### CLI

```bash
npm run cli -- run --file ./workspace.json --collection "Smoke" --report ./runner-report.json
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
  appIpc.js
  appMenu.js
  fileDialogs.js
  main.js
  mainWindow.js
  oauthIpc.js
  oauthFlows.js
  preload.js
  requestIpc.js
  runtimeIpc.js
  workspaceIpc.js
  workspaceMutations.js

src/core/
  assertions.js
  auth.js
  cookieJar.js
  collectionFormats.js
  collectionRunner.js
  environmentResolver.js
  httpClient.js
  ipcValidation.js
  localMockServer.js
  loadTestRunner.js
  loadTestWorker.js
  models.js
  payloadSchemas.js
  postmanBuiltinPackages.js
  postmanSandboxBootcodeBundle.js
  postmanImporter.js
  postmanParityHarness.js
  postmanParityMatrix.js
  requestScriptRunner.js
  scriptSandbox.js
  scriptRuntime.js
  scriptWorker.js
  updateChecker.js
  visualizerHandlebarsBundle.js
  workspaceMigrations.js
  workspaceStore.js

src/renderer/
  assertionModel.js
  base.css
  chrome.css
  collectionModel.js
  contextMenu.js
  cookieModel.js
  editorPanels.css
  exampleModel.js
  index.html
  layoutControls.js
  loadPolicy.js
  overlays.css
  responseFormatting.js
  renderer.js
  runResultFormatting.js
  styles.css
  theme.css
  uiSmoke.js

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

`electron/main.js` owns the desktop lifecycle, window hardening, dialogs, workspace store instance, and IPC handlers.

`electron/preload.js` exposes a small `window.postmeter` API only to the main renderer frame. The renderer is served from the secure standard `postmeter-app://bundle` custom protocol through an allowlisted main-process handler instead of `file://`, the protocol response applies CSP/`nosniff`/`no-referrer` headers, and the renderer has no direct Node access.

`src/core/` contains framework-independent business logic. JavaFX source, Maven wrapper files, and Maven tests are no longer part of the tracked repository.

## Electron Architecture

Main process responsibilities:

- Create a single `BrowserWindow`.
- Own the native application menu. Current top-level menus are File, Edit, View, and Help; the default Window menu is intentionally omitted.
- Disable hardware acceleration for reliable Linux/headless startup.
- Deny renderer-controlled top-level navigation away from the exact initial packaged `postmeter-app://bundle/src/renderer/index.html` URL, including unexpected app-protocol query changes, deny `window.open`, deny `<webview>` attachment, and deny all permission requests.
- Load and recover workspace data before creating the UI.
- Own native open/save dialogs, including selected-path shape validation before import/export reads or writes.
- Execute HTTP requests, collection runs, and load tests through core services.
- Start and cancel OAuth 2.0 authorization-code PKCE using loopback or custom URI-scheme redirects.
- Start and cancel OAuth 2.0 device-code polling.
- Validate renderer-originated IPC sender identity and payloads before handing them to persistence, request execution, or load testing.
- Persist and export normalized workspace data as plain JSON.
- Export load-test and collection-run results to JSON or CSV.
- Persist request history after sends.
- Check GitHub Releases for update metadata and open approved release URLs in the external browser. The Help menu owns update checks and the prerelease opt-in checkbox.

Renderer responsibilities:

- Render the workspace, collections, folders, requests, collection variables, environments, response viewer, history, assertions, collection runner, update checks, and load-test controls.
- Handle native File/Help menu actions received through the preload allowlist.
- Avoid a persistent topbar status message area. Routine progress messages stay out of the main chrome; important failures use popup notification behavior or contextual detail panels.
- Render pre-request and test script editors for each request.
- Maintain the active selection state.
- Collect editor state before save/send/load.
- Route explicit request/environment saves through targeted preload APIs so normal Save persists only the selected request or environment tab item while still carrying current workspace settings, and route workspace-level settings saves through a dedicated settings-only preload API so the workspace tab and update/theme toggles do not flush dirty request or environment tabs.
- Call only preload-exposed APIs.

Preload API:

```text
window.postmeter.app.versions()
window.postmeter.app.checkForUpdates(options)
window.postmeter.app.openExternal(url)
window.postmeter.app.onMenuAction(callback)
window.postmeter.workspace.load()
window.postmeter.workspace.save(workspace)
window.postmeter.workspace.saveRequest(payload)
window.postmeter.workspace.saveEnvironment(payload)
window.postmeter.workspace.saveSettings(settings)
window.postmeter.workspace.importWorkspace()
window.postmeter.workspace.exportWorkspace(workspace, workspaceId)
window.postmeter.collection.importCollection()
window.postmeter.collection.exportCollection(collection, format)
window.postmeter.request.validate(request, environment)
window.postmeter.request.send(request, environment)
window.postmeter.request.exportExamples(request)
window.postmeter.oauth.startPkceFlow(id, auth, environment, strategy)
window.postmeter.oauth.startDeviceFlow(id, auth, environment)
window.postmeter.oauth.cancelFlow(id)
window.postmeter.oauth.cancelDeviceFlow(id)
window.postmeter.oauth.onProgress(callback)
window.postmeter.loadTest.start(id, request, environment, config)
window.postmeter.loadTest.cancel(id)
window.postmeter.loadTest.export(result, format)
window.postmeter.loadTest.onProgress(callback)
window.postmeter.runner.start(id, collection, environment, config)
window.postmeter.runner.cancel(id)
window.postmeter.runner.export(result, format)
window.postmeter.runner.onProgress(callback)
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

- IPC validation is structural and bounded, with shared versioned enum contracts in `payloadSchemas.js`. Request/workspace array, nested-field validation, common key/value/assertion/cookie/example/history/certificate/auth checks, OAuth progress payloads, runner config/progress payloads, load progress/result histogram/sample/policy-decision checks, file-operation results, and collection-run script result checks are driven by shared schema metadata or schema-backed validators, but some payload-specific nested checks are still maintained manually.
- Custom URI-scheme OAuth redirects depend on OS protocol registration. Loopback redirect is the more reliable default during development and on platforms where protocol registration is restricted.

## Workspace Data Model

Current schema version:

```text
11
```

Root workspace fields:

- `schemaVersion`
- `collections`
- `environments`
- `globals`
- `cookies`
- `history`
- `settings`

Settings fields:

- `appearance.theme`
- `sandbox.trustedCapabilities.sendRequest`
- `sandbox.trustedCapabilities.cookies`
- `sandbox.trustedCapabilities.vault`
- `updates.includePrereleases`

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
- `assertions`
- `scripts`
- `variables`
- `examples`
- `cookieJar`
- `loadTestPolicy`
- Optional protocol and import/export fields for Postman parity: `protocol`, `methodPath`, `metadata`, `messages`, `postmanBody`, `protocolProfile`, `graphql`, `grpc`, `websocket`, and bounded `postman` compatibility metadata

Request load-test compatibility policy fields:

- `enabled` on request policies only
- `concurrency`
- `totalRequests`
- `durationSeconds`
- `rampUpSeconds`
- `targetRatePerSecond`
- `maxRatePerSecond`
- `executionMode`
- `workerProcesses`
- `recordSamples`

Request cookie jar fields:

- `enabled`
- `storeResponses`

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

Assertion fields:

- `enabled`
- `type`
- `name`
- `path`
- `operator`
- `expected`
- `variableName`

History entry fields:

- `timestamp`
- `method`
- `url`
- `statusCode`
- `durationMillis`

Collection certificate fields:

- `id`
- `name`
- `matches`
- `certPath`
- `keyPath`
- `pfxPath`
- `caPath`
- `passphrase`

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

Schema `7` adds workspace settings, request-local variables, request examples, and collection certificate metadata. Workspace settings currently include `appearance.theme` (`system`, `light`, or `dark`) and `updates.includePrereleases`.

Schema `8` adds workspace cookies and per-request cookie jar options.

Schema `9` adds request load-test policy compatibility fields.

Schema `10` removes workspace-level load-test defaults. Load-test run settings are configured from the Load Test panel instead of being stored on the workspace.

Schema `11` adds workspace-level globals for true `pm.globals` support and workspace settings that can disable brokered script network requests or cookie-helper access. These APIs are enabled by default for Postman import parity. It also carries the optional `sandbox.trustedCapabilities.vault` grant, scoped `sandbox.trustedCapabilities.vaultGrants`, and reviewed `sandbox.packageCache` entries for exact package-library/external package compatibility. Vault access defaults to disabled because it exposes user-managed secrets.

## Persistence Specifications

Persistence is handled by `WorkspaceStore` and `WorkspaceManager`.

Managed workspace directory:

```text
~/.postmeter/
```

Override the preferred startup workspace path:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

Behavior:

- Uses `workspace.json` as the preferred startup path and scans the containing directory for native managed workspace JSON files. There is no persistent managed-workspace index or active-workspace pointer to go stale; the legacy manifest file is removed when found.
- Creates a default managed workspace such as `Local Workspace.json` when no workspace files exist, allocating a suffixed name if that filename already exists as an unreadable or non-native file.
- Allocates default, new, imported, and renamed managed workspace filenames around any existing filesystem entry, including unreadable or non-native JSON files, then publishes with no-overwrite semantics and retries suffixed names if a destination appears before publication.
- Loads current schema `11` workspaces and migrates supported historical schema versions `1` through `10` to schema `11`.
- Creates timestamped, collision-resistant `pre-migration.backup` sibling files through the atomic, no-overwrite write path before saving migrated workspaces.
- Rejects future schema versions.
- Quarantines unreadable workspace JSON by moving it through a no-overwrite file move to a timestamped, collision-resistant `corrupt` sibling file and best-effort fsyncing the directory, then creates a fresh default workspace through no-overwrite publication and raises a recovery error for the UI. If a replacement workspace file appears before recovery publication, PostMeter preserves that replacement instead of overwriting it.
- Writes workspace, session, vault, and export files through collision-resistant same-directory temporary files, fsyncs file contents where supported, renames into place, and best-effort fsyncs the containing directory. Interrupted temporary files are ignored by workspace discovery.
- Writes normalized workspace values directly to local JSON.
- Normalizes IDs, names, body types, methods, arrays, settings, request load-test compatibility policies, collection variables, collection certificates, request variables, request examples, request cookie jar settings, workspace cookies, folders, environments, and history.
- Native workspace import adds another managed workspace without replacing, switching away from, or backing up the current one.
- Targeted renderer saves for request and environment tabs send only the selected tab payload, the current workspace settings, and any owned shared request-side state such as collection variables or cookie-jar values; targeted settings saves send only `workspace.settings`; the main process applies that payload into the cached workspace before the normal full-file write.
- Full workspace saves are still used for shutdown persistence, managed-workspace switching or active-workspace rename, whole-workspace export, and collection import.
- Renderer session persistence also carries request-owned shared dirty state for collection variables and the cookie jar so crash recovery can restore those unsaved edits without requiring a full workspace save.

Limitations:

- No file locking.
- No multi-window conflict resolution.
- No atomic move fallback tuning beyond same-directory rename.

## Import And Export

Native workspace export writes the normalized workspace through the atomic export path. The desktop UI can export the current in-memory workspace or another managed workspace by id from the Workspaces list.

Native workspace import reads a PostMeter workspace, migrates it, normalizes it, writes it as another managed workspace, refreshes the managed workspace list, and keeps the current workspace active until the user switches.

Native collection export writes one collection inside a valid PostMeter workspace wrapper through the atomic export path. Environments are intentionally separate and are not included in collection export. In the desktop UI, `Export > Collection` opens an in-app collection-picker modal, the modal still opens when no collections exist, the Export button stays disabled while that empty-state warning is shown, and native collection export filenames default to `<collection-name>.json`.

Native collection import imports the first collection from a PostMeter workspace file, regenerates IDs, and appends it to the active workspace.

Request example export writes the active request examples to JSON with request metadata from a main-process save dialog.

OpenAPI import/export:

- Imports OpenAPI/Swagger JSON and YAML documents into collections grouped by tags when present.
- Converts OpenAPI path parameters like `{id}` into PostMeter variables like `{{id}}`.
- Resolves local `$ref` entries for common parameters, request bodies, responses, response headers/examples, and security schemes.
- Imports server variables, path/query/header/cookie parameters, Swagger 2.0 body/form-data parameters, request body examples, and binary body hints where practical.
- Imports common HTTP bearer, HTTP basic, header/query/cookie API key, and OAuth 2.0 security schemes into PostMeter auth helpers where they map cleanly.
- Imports inline response examples as editable request examples.
- Imports response status/header metadata as disabled assertions so users can opt into generated checks without creating contradictory default assertions.
- Exports PostMeter collections as OpenAPI 3.1 JSON with paths, methods, query/header/cookie parameters, raw body content, and mappable auth helpers as security schemes.

JMeter import/export:

- Imports basic JMeter `HTTPSamplerProxy` test plans into PostMeter requests.
- Exports collections to a simple JMeter `.jmx` test plan with HTTP samplers.
- Imports and exports Header Manager values as request headers.
- Imports and exports User Defined Variables where they map to collection variables.
- Imports CSV Data Set Config, thread group, timer, listener, and simple controller metadata as collection variables.
- Imports simple response-code, response-body, duration, size, JSON-path, and XPath assertions into PostMeter assertions, preserving disabled state for mapped assertion types, and exports enabled mappable assertion types back to JMeter XML.
- Imports Regex Extractor as PostMeter regex variable extraction and exports mappable regex extraction assertions back to JMeter `RegexExtractor`.
- Imports JSON Extractor as PostMeter JSON variable extraction and exports mappable JSON extraction assertions back to JMeter `JSONPostProcessor`.
- Exports preserved Constant Timer, Constant Throughput Timer, generic timers such as Uniform/Gaussian/Poisson random timers and Precise Throughput Timer, Loop Controller, Transaction Controller, Throughput Controller, and Runtime Controller metadata back into JMX elements.
- Preserves known unsupported JMeter assertions, including HTML Assertion validity checks, MD5/XML schema/compare/SMIME assertions, pre/post processors, and sampler/script elements as `jmeter.unsupported.*` collection variables and re-exports preserved JMeter element metadata as disabled JMX elements where the original class can be represented safely. This is not a full arbitrary JMX object graph preservation model.
- Current support targets common HTTP sampler and metadata fields and is not a full JMeter feature clone.

curl import/export:

- Imports common `curl` command forms including URL, generated request name, method, headers, auth flags, repeated data flags, `-G` query-data mode, cookies, multipart-ish form flags, binary/file upload intent, redirects, compression, proxy/retry metadata, and TLS flag metadata.
- Exports collection requests as readable curl commands, including PostMeter basic auth and preserved redirect/compressed/insecure/binary metadata when present.

HAR import/export:

- Imports HAR 1.2 request entries into a PostMeter collection.
- Preserves HAR request cookies, request body encoding metadata, response status/headers/body/cookies as request examples, and timing/redirect/body-encoding/compression metadata as request-local variables when present.
- Exports collection requests as a HAR 1.2 log with request entries, derives request cookies from `Cookie` headers, and redacts privacy-sensitive authorization/cookie headers and cookie values.
- Non-Postman import/export support is a practical compatibility bridge and does not claim source-format-perfect round trips or full external engine parity unless explicitly stated.

See `docs/COMPATIBILITY.md` for the current import/export, scripting, and load-testing compatibility matrix.

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
- Local mock event scripts with `listen: "mock"` and common mock-listen variants, plus request IDs and saved example IDs used by `pm.mock.matchRequest` and `pm.mock.sendExample` when those IDs are present in the Postman export.
- Common Bearer, Basic, API key, and OAuth 2.0 auth helpers from collection, folder, and request scopes when they map cleanly to PostMeter auth fields.
- Common `event` scripts with `listen: "prerequest"` and `listen: "test"` from collection, folder, and request scopes, plus protocol events for GraphQL and gRPC. Collection/folder scripts are prepended to child request scripts for execution while original event locations, script types, and script text are preserved for Postman export.
- Original Postman request IDs where present, deterministic fallback IDs where absent, and alias resolution for `pm.execution.runRequest`, `pm.execution.setNextRequest`, `pm.info.requestId`, and `pm.execution.location.requestId` even after workspace import regenerates internal model IDs.
- Postman request examples from `item.response`, editable in the request Examples tab.
- Postman cookies from `request.cookie`; desktop import promotes Cookie headers into workspace cookies when the request URL has a concrete host.
- Imported Postman HTTP requests enable cookie-jar sends and response-cookie storage by default so script-created and response-set cookies participate in later imported request sends.
- Postman cookie metadata is preserved as explicit request metadata and used during desktop import promotion for domain, path, expiry, secure, httpOnly, SameSite, host-only, priority, partitioning, extension, and source values when present.
- Postman request/item variables, represented as request-local variables, with raw variable metadata retained for Postman export.
- Collection-level certificates from `certificate`, applied to matching requests only when doing so does not overwrite an explicit request auth helper.
- Bounded Postman compatibility metadata for protocol profiles, GraphQL/gRPC definitions, package references, visualizer assets, cookie allowlists, vault metadata, mock state configuration, examples, certificates, auth inheritance, and file/binary body references.

Postman collection export supports:

- Postman Collection v2.1 JSON through the desktop `Export > Postman` action and the collection export registry.
- Round-tripping preserved script text, script type, event location, request/example/certificate IDs where exported by Postman, variables and raw variable metadata, examples, certificates, auth metadata, protocol profiles, GraphQL/gRPC metadata, body modes including file/binary references, and imported package/cookie/vault/mock/visualizer binding metadata.

Postman import limitations:

- OAuth 2.0 import covers common token/client fields but not every Postman grant type or client-auth method.
- Collection-level certificates are mapped into PostMeter's single request-auth model only when a matching request does not already have explicit auth.
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

Password, token, cookie, OAuth, and certificate passphrase inputs are normal visible text fields. Workspace values are rendered, saved, and exported directly.

## Auth Specifications

Auth normalization and request-time injection are handled by `auth.js` and `httpClient.js`.

Implemented request-time auth:

- Bearer token: sets `Authorization: Bearer <token>`.
- Basic Auth: sets `Authorization: Basic <base64(username:password)>`.
- API key in header: sets the configured header name and value.
- API key in query: appends the configured query parameter name and value.
- Cookie: sets the `Cookie` header.
- OAuth 2.0 static access token: sets `<tokenType> <accessToken>` in `Authorization`.
- OAuth 2.0 refresh-token renewal: when `refreshToken`, `tokenUrl`, and expired/missing token metadata are present, posts `grant_type=refresh_token` to the token URL before request execution and returns updated token metadata.
- OAuth 2.0 client credentials: when `grantType` is `clientCredentials` and token metadata is missing or near expiry, posts `grant_type=client_credentials` with `client_id`, `client_secret`, and optional `scope` before request execution and returns updated token metadata.
- OAuth 2.0 authorization-code PKCE: creates a S256 PKCE challenge, opens the authorization URL in the external browser, supports loopback redirects and `postmeter://oauth/callback` custom URI-scheme redirects, verifies callback state, exchanges the authorization code at the token endpoint, and persists returned token metadata.
- OAuth 2.0 device code: posts `client_id` and optional `scope` to the device authorization URL, opens the verification URL in the external browser, displays the user code, polls the token endpoint with `urn:ietf:params:oauth:grant-type:device_code`, supports cancellation, and persists returned token metadata.
- HTTPS client certificate: loads certificate material in the main/core layer from local paths using regular-file, byte-capped descriptor reads, supports PEM certificate/key pairs and PFX/P12 bundles, normalizes PFX/P12 bundles into in-memory PEM certificate/key buffers with the reviewed `node-forge` PKCS#12 parser before transport, applies optional CA certificates and passphrases, and does not expose certificate contents to the renderer or scripts. Pre-request scripts may select configured certificate bindings by `certificateId`; script-injected direct certificate/key/PFX/CA paths or passphrases are ignored before the parent transport can read certificate files.

Auth values support environment substitution before use.

Manual outbound OAuth certification is documented in `docs/OAUTH_PROVIDER_CERTIFICATION.md`, with Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth Apps as the first target providers. This certification is for target API request auth only and must not introduce PostMeter account login or account creation.

Auth validation:

- Requires non-empty configured token/value fields for enabled auth types. OAuth 2.0 accepts an access token, a refresh token plus token URL, client-credentials metadata, or device-code metadata depending on the selected grant.
- Validates header names for API-key header auth.
- Validates that client-certificate auth has either a PFX/P12 bundle path or both PEM certificate and key paths.
- Rejects client-certificate auth for non-HTTPS request URLs.

Auth limitations:

- Refresh-token renewal, authorization-code exchange, client-credentials retrieval, and device-code polling currently send `client_id` and `client_secret` in the form body when present; they do not yet support alternate OAuth client-auth methods such as HTTP Basic client authentication or private-key JWT.
- OAuth progress is represented in a persistent in-app panel and validated by schema-backed main-to-renderer IPC checks. Renderer regression smoke validates key progress states, and mocked Electron OAuth smoke covers loopback PKCE success, PKCE state-mismatch failure, and device-code success.
- Custom URI-scheme PKCE is implemented. Release validation checks Linux deb/AppImage desktop-entry metadata, Windows NSIS registry registration plus `postmeter://` ShellExecute launch, and macOS app-bundle/zip/dmg URL-scheme metadata plus Launch Services `postmeter://` launch on native runners.
- Client-certificate requests use the Node `https` transport path instead of global `fetch`; that path intentionally follows redirects only when they stay on the original HTTPS origin to avoid leaking client certificate material to redirected hosts.
## Cookie Jar

Cookie jar handling is implemented in `cookieJar.js` and integrated into `httpClient.js`, the Electron request send path, collection runs, load tests, and the renderer Cookies tab.

Implemented behavior:

- Workspace cookies are stored under `workspace.cookies`.
- Cookie values are stored directly in the workspace JSON.
- Each request has `cookieJar.enabled` and `cookieJar.storeResponses` settings.
- When enabled, matching unexpired cookies are sent by domain, path, and secure flag.
- Cookie domains are normalized, invalid cross-domain `Set-Cookie` values are rejected, and `SameSite=None` without `Secure` is not retained as `None`.
- Public-suffix-like single-label Domain attributes such as `.com` are rejected when they do not exactly match the request host.
- Domain attributes on IP-address hosts are rejected, host-only IP cookies are allowed, and localhost domain matching is intentionally conservative.
- Duplicate `Set-Cookie` attributes use the last parsed value for supported attributes such as `Path` and `SameSite`.
- `__Host-` and `__Secure-` cookie prefix rules are enforced for parsed response cookies.
- Newer non-sending attributes `Priority` and `Partitioned`, source-format hints, and unmodeled cookie extension attributes are preserved in workspace cookies where present.
- `Max-Age` takes precedence over `Expires` when both are valid. Malformed expiry metadata is ignored instead of crashing import/execution.
- Explicit request/auth `Cookie` values are preserved and merged with jar cookies without overriding explicitly named cookies.
- Response `Set-Cookie` headers update the workspace jar when `storeResponses` is enabled.
- Expired response cookies remove matching cookies from the jar.
- The renderer lets users inspect, add, edit, remove, filter by the active request host, and clear expired cookies.
- The renderer marks invalid cookie domain, path, and expiry fields inline.
- Collection runs propagate updated cookies between sequential requests and persist the final jar through the Electron main process.
- Load tests can send cookies from the jar but do not mutate the shared jar from concurrent responses.

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
- Response body decoding: UTF-8 text.
- Ignores user-provided `Content-Length`; the runtime manages it.
- Applies request auth after user headers and query parameters are collected.
- Captures response status, headers, body, final URL, response size, and rounded duration.

Body behavior:

- `NONE` sends no body.
- `RAW_JSON` sends body for `POST`, `PUT`, `PATCH`, and `DELETE`; default content type is `application/json`.
- `RAW_TEXT` sends body for `POST`, `PUT`, `PATCH`, and `DELETE`; default content type is `text/plain; charset=utf-8`.
- Body content supports environment substitution.

## Assertions And Collection Runner

Assertions are evaluated by `assertions.js`. Collection execution is handled by `collectionRunner.js`.

Implemented assertion types:

- `statusCode`: compares the numeric response status.
- `header`: reads a case-insensitive response header.
- `jsonPath`: reads simple JSON paths such as `$.data.id` and `$.items[0].name`.
- `xmlPath`: evaluates XPath against XML response bodies.
- `htmlSelector`: evaluates CSS selectors against HTML response bodies and compares normalized text content.
- `responseTime`: compares response duration in milliseconds.
- `responseSize`: compares response body size in bytes.
- `bodyContains`: checks response body text.
- `extractVariable`: reads a JSON path and writes the value into the runner environment for later requests.
- `extractXml`: evaluates XPath and writes the value into the runner environment for later requests.
- `extractHtml`: evaluates a CSS selector and writes normalized text content into the runner environment for later requests.
- `extractRegex`: applies a regular expression to the response body and writes the first capture group, or the full match when no group exists, into the runner environment.

Response viewer formatting:

- JSON bodies are pretty-printed when the content type or body shape indicates JSON.
- XML bodies are parsed and formatted when the content type or body shape indicates XML.
- HTML bodies are parsed and formatted when the content type or body shape indicates HTML.
- Invalid or unsupported bodies fall back to their original text.

Supported operators:

- `equals`
- `notEquals`
- `contains`
- `exists`
- `lessThan`
- `greaterThan`

Runner behavior:

- Walks collection requests in collection/folder order.
- Runs pre-request scripts before sending each request; failed pre-request scripts fail the request without sending it.
- Executes requests sequentially through the same HTTP path as normal sends.
- Clones the active environment before the run.
- Resolves collection variables, active environment variables, and request-local variables for request sends, with request-local values overriding environment values and environment values overriding collection values.
- Runs test scripts after responses are received.
- Applies extracted variables and script variable mutations to later requests.
- Propagates cookie jar updates between sequential requests when request cookie jar storage is enabled.
- Emits progress events to the renderer.
- Supports cancellation and stop-on-failure.
- Reports per-request status, timing, pass/fail state, assertion results, script results, extracted variable names, and request errors.
- Reports final runtime collection/environment variables plus per-request local variables in the desktop runner output and CSV export.
- Returns the final cookie jar to the Electron main process so it can be saved with the workspace.
- Exports runner results as JSON or CSV through desktop IPC.

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
- Starts script workers through `src/core/osSandbox.js` when a functional OS backend is available or required. Backend selection probes the launcher before auto-enabling it, so CI or desktop environments with an installed but unusable backend fall back in auto mode instead of breaking Postman-compatible script execution; required mode still fails closed unless an explicit Linux CI validation waiver is set. The Linux backend uses `bubblewrap` with cleared environment, unshared namespaces including network, dropped capabilities, private writable `/tmp` and `/run`, disabled nested user namespaces, read-only runtime/app/library bind mounts, and a seccomp cBPF policy that denies high-risk kernel APIs including `bpf`, `ptrace`, keyring, module-loading, mount, process-memory, performance-event, `io_uring`, and nested namespace syscalls such as `unshare`, `setns`, and `clone3`. The Windows backend builds and packages the release-owned `PostMeterWindowsSandboxHelper.exe`, launches workers in a stable AppContainer profile with no declared network capabilities, grants only required runtime/app paths plus a private temp directory, passes a minimal child environment, and keeps the child in a kill-on-close single-process job object. The macOS backend launches workers through `sandbox-exec` with a deny-default seatbelt profile, denied network access, explicit process-exec/process-fork denial, no broad process allowance, read-only runtime/app/library access, and a per-launch private writable temp directory.
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
- Supports `pm.environment`, `pm.collectionVariables`, workspace `pm.globals`, request-local `pm.variables`, `pm.iterationData`, `pm.info` request/protocol metadata, `pm.execution.location`, `pm.message` data/name/type/timestamp/toJSON for streaming protocol hooks, Postman Collection SDK-style request/response/list objects, request URL/query/header/body/auth/metadata/message inspection and validated pre-request mutation helpers, response status/reason/header/cookie/body/metadata/trailer/message helpers, status-category response helpers, JSON-body/JSON-schema response helpers, response status-name strings, response-time assertions, protocol metadata/trailer/message assertion helpers, and message-list assertion helpers.
- Supports variable `clear`/`toJSON` where Postman exposes them, preserves script-visible variable metadata including current/initial/type/sensitive flags, honors disabled variables, handles iteration-data `unset`, and resolves the documented Postman dynamic variable catalog through `pm.variables`/`replaceIn` and request interpolation.
- Supports brokered timers, including bounded `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, and queueMicrotask/promise drain behavior, plus brokered `pm.sendRequest`, user-granted file/binary/form-data attachment bindings, bounded brokered `pm.execution.runRequest` with a 10-call per-script limit, current-URL `pm.cookies`, and `pm.cookies.jar()` helpers in the isolated worker runtime. Script network requests and script cookie access are enabled by default for Postman import parity and can be disabled in workspace settings.
- The default Postman import profile exposes in-scope `HttpOnly` values through `pm.cookies` and `pm.cookies.jar()` to match current Postman/Newman behavior; disabling script cookie access blocks those helpers entirely.
- Supports bounded `pm.visualizer` capture with JSON-cloned data and an integrity-checked `handlebars@4.7.9` browser runtime loaded inside a separate visualizer VM context. The facade supports compile/precompile/template/create, helpers, block helpers, runtime helpers, dynamic partials, inline partials, custom decorators, `Handlebars.SafeString`, block params, data variables, parent/root lookup, whitespace/noEscape behavior, inline scripts in an isolated iframe, `pm.getData(callback)`, sanitized output, integrity-checked reviewed JS/CSS assets, and sandboxed iframe rendering in the desktop UI.
- Supports explicitly granted `pm.vault` access through the parent broker, including workspace, collection, and request grants with explicit denial overrides. If no grant exists, desktop single-request sends, collection runs, and nested lifecycle executions can display a metadata-only renderer prompt with request, collection, workspace, operation, secret-key, deny, reset, request-grant, collection-grant, and workspace-grant choices; concurrent renderer prompts are queued by prompt ID; prompt responses are accepted only from the renderer `webContents` that received the prompt; prompt decisions are persisted as scoped vault-grant metadata on the prompted workspace without exposing secret values, vault paths, encryption keys, ciphertext, storage handles, or secret lists to the renderer. Denied or cancelled prompts fail the vault call so code after the denied call does not run. Audit metadata covers prompt grants, prompt denials, prompt resets, `get`, `set`, `unset`, denied-after-call, and unavailable-encryption outcomes without logging secret values. Desktop vault values are stored outside workspace JSON in per-workspace encrypted vault files, using Electron `safeStorage` only when OS-backed encryption is available and not the Linux `basic_text` backend.
- Supports Postman documented script globals including URL/URLSearchParams, Web Crypto digest/random helpers, `TextEncoder`/`TextDecoder`, `atob`/`btoa`, Blob/File, structuredClone, queueMicrotask, DOM-style abort/event/error objects, Web Stream constructor facades, ECMAScript built-ins, and typed arrays. Host-created Blob/Web Crypto byte results are exposed as script-safe array-buffer facades so `byteLength` and typed-array construction work without exposing host constructors.
- Supports `pm.require()` and sandbox `require()` for Postman's generated, version-pinned `postman-sandbox@6.2.2` browser bundle: `ajv`, `backbone`, `chai`, `cheerio`, `crypto-js`, `csv-parse/lib/sync`, `json`, `lodash`, `moment`, `postman-collection`, `tv4`, `uuid`, and `xml2js`; and for Postman-listed NodeJS module shims/facades: `path`, `assert`, `buffer`, `util`, `url`, `punycode`, `querystring`, `string-decoder`, `stream`, `timers`, and `events`. The loader also supports reviewed cached `@team/package`, exact/scoped npm, exact/scoped JSR, and Postman latest-version npm/JSR bundles with SHA-256 integrity metadata, multi-file CommonJS/ESM file maps, package metadata entrypoints, package.json directory entrypoints, relative/extension/JSON resolution, reviewed dependency aliases and subpaths, module cache/circular behavior, default and named exports, package/source/dependency/export caps, declared-dependency policy, and parent-side fetch/review for exact/latest npm/JSR packages plus reviewed HTTPS team-package source URLs. Direct Postman account/provider fetching for team packages is deferred. It rejects host Node built-ins outside the facade list, `node:` specifiers, unreviewed external registry/team packages, runtime registry fetches, package installation, paths, URLs, duplicate package-cache entries, missing reviewed dependencies, undeclared dependency subpaths, and any package outside the allowlist, Node facade list, or reviewed cache.
- `require('postman-collection')` uses Postman's bundled Collection SDK inside the script VM. Live `pm.request` and `pm.response` objects use hardened PostMeter SDK-style facades with common SDK list methods, object-predicate list filtering, `clone`/`toJSON`/`toString`, disabled item handling, case-insensitive headers, multi-value header object conversion, URL query mutation, request body mode facades, response cookies, metadata, trailers, messages, and constructor/prototype escape hardening.
- Supports `pm.execution.setNextRequest` and `pm.execution.skipRequest` for collection-run control.
- Supports imported GraphQL Before query/After response execution by adapting GraphQL body mode into a brokered HTTP JSON request while preserving query variables, operation name, auth, headers, response parsing, package imports, variable interpolation, `pm.info.eventName`, and subscription-style response message normalization into `pm.response.messages`.
- Supports imported gRPC Before invoke/On message/After response execution through a parent-owned `@grpc/grpc-js` transport for unary, client-streaming, server-streaming, and bidirectional streaming methods. The lifecycle preserves method path, proto/service/method metadata, request metadata, outgoing messages, streaming method type, incoming messages, response metadata, trailers, status, cancellation flags, package imports, `pm.message` with hardened Date timestamps, protocol assertion helpers, message-list assertions, and protocol `pm.info.eventName` without exposing raw sockets or host networking to scripts. Proto source/path, include dirs, TLS material, client options, and client-certificate auth are snapshotted before Before invoke so scripts cannot redirect parent filesystem/TLS reads. gRPC mTLS supports PEM cert/key material including encrypted PEM keys with passphrases, plus the same parent-side in-memory PFX/P12 extraction path used by HTTP client-certificate requests; certificate files are read as regular files through byte-capped descriptors, configured `certificateId` bindings fail closed when missing and do not fall back to direct request paths, and script-injected direct certificate/PFX/CA/passphrase mutations are denied at the lifecycle boundary. Scripts never receive certificate paths, passphrases, contents, private keys, or filesystem handles. The renderer can display editable workspace certificate path/passphrase metadata like the rest of the plain-JSON request configuration, but extracted PEM buffers, private-key material, parser handles, and transport credentials stay parent-side.
- Supports local mock scripts through `localMockServer.js`, with loopback HTTP serving, method/path-only matching, path variables, saved-example fallback, `pm.mock.matchRequest`, `pm.mock.sendExample`, Express-style `req`/`res` including request JSON parsing and response status/header/body helpers, top-level mock-script `await`/`return`, and `pm.state.get/set/delete/has/keys/size/clear/toObject/increment/push/addToSet`. Mock state is per-session JSON data with key/value/session caps, operation caps, reset/clear controls, parent-brokered mutations, and commit/rollback tied to script phase success. `pm.mock`, `pm.state`, `req`, and `res` are only injected in mock contexts.
- Persists script side effects through queued latest-workspace commits with workspace identity guards and per-key/per-cookie delta merges, so overlapping sends/runs do not overwrite unrelated newer workspace edits.
- Provides explicit errors for host-only APIs and package-loading paths that Postman does not expose in scripts: raw `fetch`, `XMLHttpRequest`, `WebSocket`, process access, host Node resolution, `node:` specifiers, WebAssembly, browser globals, unreviewed package loading, native modules, paths, runtime registry fetches, Electron, renderer, and raw socket access. Current Postman WebSocket/Socket.IO docs do not expose saved script hooks, so PostMeter records that audit result instead of inventing WebSocket hook execution.
- The Postman/Newman-style fixture corpus in `test/fixtures/postman` runs through the normal Postman importer and collection runner or the local mock runner, covering async ordering, nested `pm.sendRequest`, user-granted file/binary/form-data attachment bindings, SDK request/response/list objects, Step 4 `pm.test`/Chai/variable/dynamic-variable behavior, `pm.execution.location`, `pm.execution.runRequest`, GraphQL and gRPC protocol hooks, local mock `pm.mock`/`pm.state`, interactive Handlebars `pm.visualizer` including reviewed assets, brokered `pm.vault`, bundled packages, reviewed cached packages, multi-file CommonJS package loading, Postman globals, NodeJS module facades, timers/microtasks, iteration data, cookie scope, variable precedence, execution control, cancellation, skipped requests, and mixed `pm.test` pass/fail behavior.
- The current audited parity target is Postman Desktop 11.71.7 with `postman-sandbox@6.2.2` and Postman Runtime 7.50.0, plus Newman 6.2.2 with Postman Runtime 7.39.1 for Newman-compatible surfaces.
- The generated Postman sandbox parity matrix lives at `docs/postman-sandbox-parity-matrix.json` with source in `src/core/postmanParityMatrix.js`; `npm run postman:parity:validate` fails if it is stale or structurally invalid.
- The official Postman/Newman docs coverage audit lives at `docs/postman-docs-coverage-audit.json` with source in `src/core/postmanDocsCoverageAudit.js`; `npm run postman:docs:validate` fails if any committed official-docs token is unmapped, and `npm run postman:docs:live` refetches the current official docs plus the Newman npm latest dist-tag to catch upstream drift before preserving a 1:1 script-import claim.
- `npm run postman:parity:claim` is the full Postman script compatibility gate for the supported default import profile. It currently passes with zero default-import blockers. Implemented behavior-sensitive Desktop rows are validated against explicit row-specific Desktop evidence metadata.
- `npm run postman:parity:diff` runs the HTTP-core, broad, dynamic-host-globals, runtime-limits, HttpOnly-cookies, sendRequest-advanced, and file-binding Newman-compatible differential collections through PostMeter, and `npm run postman:parity:diff -- --newman --download-newman` optionally compares the same fixtures against the targeted `newman@6.2.2` reporter output. `npm run postman:newman-reports:refresh -- --download-newman` runs the approved live Newman differential and rewrites the checked-in evidence in one explicit network-using step; `npm run postman:newman-reports:write -- --from <dir>` keeps the two-step refresh path available and accepts only clean source summaries targeting `newman@6.2.2`, Postman Runtime 7.39.1, and the exact approved suite list. Checked-in raw Newman, raw PostMeter, and normalized `newman@6.2.2` JSON evidence lives under `test/fixtures/postman/newman-reports/`; `npm run postman:newman-reports:validate` keeps it structurally current without network access, verifies all required suites, rejects unexpected checked-in JSON files and stale normalized Newman/PostMeter output, requires generation metadata on each normalized report, preserves response-shape/body-digest evidence and console output when present, and fails if normalized evidence still contains concrete localhost ports, local filesystem paths, generated request IDs, generated Postman request tokens, generated multipart boundaries, time-derived request signatures, machine names, or machine-specific metadata.
- The OS-sandbox platform completion matrix lives at `docs/os-sandbox-platform-matrix.json` with source in `src/core/osSandboxPlatformMatrix.js`; `npm run sandbox:platform:validate` fails if it is stale or structurally invalid.
- `npm run sandbox:platform:claim` is the platform-equivalent full OS sandbox gate. It is intentionally separate from Postman API parity and passes when the committed platform matrix records implemented Linux `bubblewrap`/seccomp, Windows AppContainer helper, macOS seatbelt, and packaged-validation rows.
- `npm run release:gate` validates that the package scripts and CI/release workflows keep the sandbox runtime validation, OS-sandbox platform-matrix validation, packaged validation, parity validation, official-docs coverage validation, aggregate `npm run check`, packaged Linux validation, and Windows/macOS native validation hooks in the production release gate.
- `npm run production:readiness`, `npm run production:readiness:validate`, and `npm run production:readiness:claim` read the source-owned production readiness dashboard from `src/core/productionReadinessMatrix.js` and generated `docs/production-readiness-matrix.json`. The default claim command is the fail-closed stable-release gate; `npm run production:readiness:claim:beta` and `npm run production:readiness:claim:rc` expose lower release-level thresholds, with RC accepting only validated rows or explicit documented RC waivers. Normal validation is wired into CI/release as a freshness check, and the tag-driven release workflow runs the stable claim before building publishable artifacts. The dashboard also tracks dependency audit and Electron runtime-version checks as release-blocking rows instead of leaving them implicit inside aggregate scripts.
- `npm run sandbox:validate` runs the pinned Electron runtime, verifies Node permission enforcement for arbitrary filesystem reads and child-process spawning, checks the worker launch allowlist, verifies Linux OS-sandbox filesystem/network denial and seccomp-policy launch state where applicable, and runs an adversarial script-boundary probe.
- `npm run sandbox:validate:packaged` runs the same validation entrypoint through a built desktop executable, covering packaged path, ASAR behavior, and the platform OS backend on Linux, Windows, and macOS runners.

Limitations:

- The platform OS-sandbox implementation is source-owned and matrixed separately from Postman API parity. Linux uses `bubblewrap` plus dangerous-syscall seccomp, Windows uses the release-owned AppContainer helper built by `npm run native:windows-sandbox:build` and packaged as an extra resource, and macOS uses a deny-default seatbelt `sandbox-exec` profile. `npm run sandbox:platform:claim` should pass when `docs/os-sandbox-platform-matrix.json` is current. Native runner packaging rows in the production readiness matrix still track release evidence separately from this implementation claim.
- Load tests do not execute pre-request or test scripts; sandbox v1 keeps scripted load testing out of scope.
- Keep `npm run postman:parity:claim`, `npm run postman:docs:validate`, and a current `npm run postman:docs:live` sweep green before preserving the tracked Postman script compatibility claim. Local production resource ceilings remain documented safety policy for host-exhaustion-sized payloads, and the platform-equivalent OS sandbox claim remains tracked separately by `docs/os-sandbox-platform-matrix.json`.
- Desktop mock-server management UI remains future work; the secure core local mock runner, script surface, and Postman export preservation for mock scripts/state metadata are implemented.

## CLI Runner

The CLI entry point is `scripts/postmeter-cli.js`.

Command:

```bash
npm run cli -- run --file <workspace-or-collection> [--collection <id-or-name>] [--environment <id-or-name>] [--report <path>] [--format json|csv] [--stop-on-failure]
```

Behavior:

- Accepts native PostMeter workspace/collection files.
- Uses the collection import pipeline for Postman, OpenAPI, JMeter, curl, and HAR inputs.
- Selects the first collection by default, or a collection by ID/name.
- Selects no environment by default, or an environment by ID/name for native workspace inputs.
- Accepts repeated `--var key=value` environment overrides and `--collection-var key=value` collection overrides for CI injection.
- Runs assertions and scripts, then exits with status `0` only when all executed requests pass.
- Writes JSON or CSV reports when `--report` is provided.

Limitations:

- CI usage can provide variables with `--var` and `--collection-var`, or run against local test workspaces directly.

## Load Testing

Load testing is handled by `loadTestRunner.js`.

Inputs:

- Active request.
- Active environment.
- `concurrency`
- `totalRequests`
- `durationSeconds`
- `rampUpSeconds`
- `targetRatePerSecond`
- `maxRatePerSecond`
- `executionMode`: `singleProcess` or `multiProcess`
- `workerProcesses`
- `recordSamples`
- `confirmedHighConcurrency`

Limits:

- Max concurrency: `512`
- Max total requests: `100000`
- Max duration: `3600` seconds
- Max ramp-up: `3600` seconds
- Max target rate: `10000` requests per second
- Max rate cap: `10000` requests per second
- Max worker processes: `8`
- Max recorded samples in result payload: `50000`
- High-concurrency confirmation threshold: `50`

Behavior:

- Runs a fixed number of requests across a local worker pool when `durationSeconds` is `0`.
- Runs until the duration expires or `totalRequests` is reached when `durationSeconds` is greater than `0`.
- Starts workers gradually across the configured ramp-up window.
- When `targetRatePerSecond` is greater than `0`, schedules request starts against that target arrival rate instead of letting workers start as fast as possible.
- When `maxRatePerSecond` is greater than `0`, rejects target rates above that cap and uses the cap as the effective local arrival rate when no target rate is set.
- Load-test settings are read from the active Load Test panel controls for each run. Workspace-level defaults are intentionally not persisted.
- Policy decisions explain cap-derived effective target rates in progress/result payloads and CSV export.
- Defaults to single-process execution and can use bounded multi-process execution for heavier local tests when `executionMode` is `multiProcess`.
- Starts load-test worker child processes with a minimal inherited environment instead of passing the full Electron process environment.
- Merges multi-process worker summaries, status counts, latency histograms, first errors, and integer-millisecond latency distributions without requiring every raw sample in the parent process.
- Uses the same HTTP validation and execution path as normal request send.
- Rejects concurrency `50` or higher unless confirmation is present.
- Supports cancellation with `AbortController` in single-process and multi-process execution.
- Emits progress events with completed count, max request count, mode, duration, target rate, rate cap, policy decisions, elapsed time, and active worker count.
- Records successful status codes and failed request error samples.
- Summarizes min, average, p50, p90, p95, p99, max latency, throughput, error rate, status counts, latency histogram buckets, elapsed time, and first 10 errors.
- Optionally records per-sample index, worker, start offset, duration, success, status, and error details up to the recorded-sample cap.
- Exports summary, rate-cap metadata, policy decisions, histogram, and recorded samples as JSON or CSV.

Limitations:

- No distributed execution.
- No distributed or cross-machine policy governance beyond target arrival-rate scheduling, local rate caps, confirmation, and request/concurrency/duration/process caps.
- Optional sample capture is capped at `50000` samples per exported result; summaries and percentiles do not depend on retaining every raw sample.

## IPC Validation

Renderer-originated IPC sender identity is checked by `electron/ipcSecurity.js` before production handlers run, including fail-closed rejection for missing sender-frame metadata, subframe senders, non-`postmeter-app` origins, unexpected app-protocol paths, and unexpected app-protocol query keys. IPC inputs are validated in `ipcValidation.js` before reaching main-process behavior. Shared enum and high-level payload contract metadata lives in `payloadSchemas.js` with `PAYLOAD_SCHEMA_VERSION = 1`. The source-owned Electron security matrix enumerates the BrowserWindow, navigation, window-open, webview, permission, secure app-content protocol response headers, main-frame-only preload, every IPC channel, IPC sender validation, file-dialog, external URL, custom protocol, packaged-preload, packaged-protocol, fuse, renderer CSP, and visualizer CSP surfaces and is validated by `npm run electron:security:validate`.

Covered payloads:

- Workspace save/export payloads.
- Workspace settings payloads, including theme preference and prerelease update-check opt-in.
- Workspace cookie payloads.
- Collection export payloads.
- Collection certificate payloads.
- Request send/validate payloads.
- Request auth payloads, including OAuth grant, token type, redirect strategy, and API-key location enums.
- Request assertion payloads.
- Request-local variable and example payloads.
- Request cookie jar option payloads.
- Request load-test policy compatibility payloads and Load Test panel config payloads, including host-policy rows.
- Optional active environment payloads.
- Load-test ID, config, and export result payloads.
- Load-result status counts, error lists, latency histogram buckets, and recorded sample arrays.
- File-operation result payloads returned by import/export handlers, including optional workspace and collection results.
- Collection-run result export payloads.
- Collection-run nested assertion results, pre-request/test script result shapes, extracted variable rows, local variable rows, environment output, collection variable output, and cookie output.
- Load export format.
- App update-check option payloads.
- External URL open payloads before credential-free `shell.openExternal` launches.
- Main-process response payloads for request results, load-test results, and workspace load/save results.

Validation behavior:

- Requires expected object/array/string/number/boolean shapes.
- Bounds collection, folder, request, pair, history, string, body, allowed-host, folder-depth, and load-result sizes.
- Rejects unsupported request methods and body types before core execution.
- Validates key response shapes before returning them to the renderer.

Limitations:

- Request/workspace declared arrays, nested payload checks, and common primitive field groups, including auth fields, are routed through shared entity/field metadata in `payloadSchemas.js`.
- Some payload-specific nested checks are still handwritten. A future plugin or remote-collaboration surface should use generated validators from the shared schema source.

## Packaging And CI

Packaging is configured through `electron-builder` in `package.json`.

Distribution scripts pass `--publish never`; GitHub Release publication is handled only by the release workflow's explicit `gh release create` step after artifact metadata is generated and validated.

Targets:

- `npm run pack:linux`: unpacked Linux directory build.
- `npm run dist:linux`: Linux AppImage and deb artifacts.
- `npm run dist:win`: unsigned Windows NSIS artifact.
- `npm run dist:mac`: unsigned macOS DMG and zip artifacts.
- `npm run release:checksums`: writes `release/SHA256SUMS` for generated top-level AppImage, deb, dmg, zip, and exe distributable artifacts.
- `npm run release:manifest`: writes `release/release-manifest.json` with artifact size, SHA-256, platform, type, app ID, product name, and version metadata.
- `npm run release:prepare`: runs checksums and manifest generation.
- `npm run release:validate`: validates package metadata, canonical GitHub release/update source metadata, expected AppImage/deb/NSIS/dmg/zip targets, icon metadata, unsigned release output directory, the `postmeter://` protocol declaration, top-level-only release manifest entries, exact agreement between top-level distributable artifacts, `SHA256SUMS`, and `release-manifest.json`, artifact sizes, SHA-256 hashes, expected platform/type/name patterns, Linux deb/AppImage `x-scheme-handler/postmeter` desktop registration, and macOS zip `.app` `Info.plist` URL-scheme registration when those artifacts are present. Unconfigured MSI/RPM artifacts are rejected until package metadata, docs, upload paths, and native validators explicitly support them. `POSTMETER_RELEASE_REQUIRED_TYPES` can require specific artifact types in release CI.
- `npm run release:validate:win-protocol`: on a native Windows release runner, silently installs the generated NSIS artifact, validates the `postmeter://` registry root/open command belongs to that temporary install, launches a `postmeter://oauth/callback?...` URL through ShellExecute, verifies the launched process path when Windows exposes it, writes a transcript when `POSTMETER_VALIDATION_ARTIFACT_DIR` is set, then runs the generated uninstaller silently.
- `npm run release:validate:mac-protocol`: on a native macOS release runner, validates `PostMeter.app` URL-scheme metadata in the app bundle, zip, and DMG artifacts, registers each discovered bundle with Launch Services, launches a `postmeter://oauth/callback?...` URL through `open -b com.strangequark.postmeter` for each bundle, verifies the launched process belongs to that bundle, writes a protocol log when `POSTMETER_VALIDATION_ARTIFACT_DIR` is set, and quits the app between launches.
- The package author and deb maintainer metadata use `StrangeQuark <support@qrksw.com>`.
- Package repository, homepage, issue tracker, update defaults, and release workflow target `StrangeQuark/PostMeter`.
- Package metadata points Electron Builder at `build/icon.png` for app icon generation.
- Packaged builds declare the `postmeter://` protocol for OAuth callback handling.
- No desktop file associations are declared in the current package metadata.
- Linux AppImage artifacts are self-contained; deb artifacts are installed/removed by the user's package manager. Windows NSIS validation installs into a temporary directory and runs the generated uninstaller. macOS dmg/zip artifacts carry `PostMeter.app`; users install by copying the app bundle, and no macOS package uninstaller is produced.
- The app can check `https://api.github.com/repos/StrangeQuark/PostMeter/releases/latest` for stable versions and `https://api.github.com/repos/StrangeQuark/PostMeter/releases` when prerelease checks are enabled. `POSTMETER_UPDATE_URL` can override this endpoint for forks or test builds.

CI is configured in `.github/workflows/ci.yml` for:

- `npm ci`
- `npm test`
- `npm audit --audit-level=high`
- `npm run electron:version`
- `xvfb-run -a npm run test:smoke`
- `xvfb-run -a npm run test:ui`
- `xvfb-run -a npm run test:ui:regression`
- `xvfb-run -a npm run test:ui:oauth`
- `xvfb-run -a npm run test:ui:snapshot`
- `npm run pack:linux`
- A native packaged-smoke matrix on `ubuntu-latest`, `windows-latest`, and `macos-latest` that runs source-tree sandbox validation, builds unsigned platform artifacts, runs packaged startup smoke, runs packaged sandbox validation, validates Windows/macOS protocol launch behavior, uploads artifacts, and uploads validation logs/screenshots on failure.

Release automation is configured in `.github/workflows/release.yml` for tag pushes matching `v*`:

- Builds unsigned Linux, Windows, and macOS artifacts on native GitHub-hosted runners.
- Runs Node tests and checks the Electron runtime version before platform packaging. The version probe runs Electron in Node mode so GitHub-hosted Linux runners do not need Chromium's setuid sandbox helper configured just to print the runtime version.
- Uses `POSTMETER_CI_ELECTRON_NO_SANDBOX=1` only for Linux GitHub-hosted Electron smoke launches where Chromium's setuid sandbox helper cannot be configured by the runner. This app-shell launch waiver is separate from PostMeter's script sandbox validation and is not a production runtime default.
- Sets `CSC_IDENTITY_AUTO_DISCOVERY=false` so missing certificates do not block unsigned builds.
- Runs packaged startup smoke on every release platform. The smoke validates the packaged executable, trusted `postmeter-app://bundle/src/renderer/index.html` renderer URL, renderer CSP meta policy, full preload API function surface, app/electron/node/chrome/platform/release-channel metadata, default platform user-data path shape, isolated user-data path override behavior, and workspace save/reload persistence.
- Uploads validation logs and packaged startup-smoke failure screenshots on native runner failure so launch/protocol failures can be inspected after the job exits.
- Downloads platform artifacts into one release directory.
- Generates `SHA256SUMS` and `release-manifest.json`.
- Validates release artifacts and requires AppImage, deb, DMG, zip, and exe artifact types before publishing.
- Publishes artifacts to GitHub Releases using the built-in `GITHUB_TOKEN`.

Manual native release validation is configured in `.github/workflows/release-validation.yml`:

- Exposes `workflow_dispatch` so maintainers can run the native Linux, Windows, and macOS build/validation path without pushing a tag or publishing a GitHub Release.
- Runs the same release-gate, packaged startup smoke, packaged sandbox validation, Windows protocol validation, macOS protocol validation, artifact upload, checksum generation, manifest generation, and release artifact validation steps used for release evidence.
- Uploads per-platform artifacts and combined validation artifacts with short retention so failed native-runner runs can still be inspected.

Packaging limitations:

- Release signing and notarization are intentionally deferred until maintainer certificates exist.
- Artifact upload to GitHub Releases is configured for tag builds, but PostMeter currently prompts users to open GitHub Releases instead of downloading/installing updates itself.

## Testing

Node tests cover:

- Environment variable resolution.
- Auth normalization, validation, OAuth refresh-token renewal, OAuth client-credentials retrieval, OAuth authorization-code PKCE, OAuth device-code authorization/polling, client-certificate field validation, and request-time injection.
- HTTP validation, request execution against a local server, client-certificate path material loading for PEM/PFX/P12/CA inputs, end-to-end local HTTP mTLS handshakes with PEM and PFX/P12 client certificates, and end-to-end local gRPC mTLS handshakes with plain PEM, encrypted PEM, and PFX/P12 client certificates across unary, client-streaming, server-streaming, and bidirectional calls.
- IPC request, response, auth, cookie, request example, workspace, file-operation result, update-check option, external URL open, load-result, and collection-run result payload validation.
- Load-test validation, high-concurrency confirmation, request-count mode, duration mode, ramp-up, target arrival-rate scheduling, Load Test panel configuration, global rate caps, bounded multi-process execution, child-worker environment filtering, streamed worker summary aggregation, metrics, histograms, sample capture caps, cancellation, cookie jar send support, and CSV export.
- Collection format import/export for Postman, OpenAPI, JMeter, curl, and HAR, including Postman Collection v2.1 script/ID/order/metadata round-tripping, OpenAPI YAML/security import-export, OpenAPI local `$ref` resolution, OpenAPI server/path/cookie/binary metadata, Swagger 2.0 body/form-data import, OpenAPI response examples/generated disabled assertions, JMeter variables/assertions/headers/listeners/CSV/timer/controller/extractor metadata, JMeter XPath and Size Assertion mapping, realistic and nested JMeter fixture import, mapped JMeter assertion enabled-state preservation, broader unsupported JMeter assertion preservation, preserve-only metadata for known unsupported JMeter classes with disabled-element re-export, HAR cookie/example/timing/redirect/compression preservation with sensitive export redaction, common curl auth/data/redirect/compression/file compatibility flags, and preserved curl proxy/retry/client-TLS import metadata.
- Postman import for common inherited and request-level auth helpers, HTTP/GraphQL/gRPC scripts, protocol hook metadata, examples, cookies, prefix-constrained cookie metadata, variables and raw variable metadata, request/example/certificate IDs, file/binary body references, binding metadata, and collection certificates.
- Postman sandbox parity matrix validation, the HTTP-core, broad, dynamic-host-globals, runtime-limits, HttpOnly-cookies, sendRequest-advanced, and file-binding Newman-compatible differential fixtures, and the protocol hook fixture, including request mutation, environment mutation, collection-variable behavior asserted inside the script, package/assertion/timer/dynamic-variable/cookie coverage, `pm.info`, `pm.message`, `pm.sendRequest` callback/object-body/advanced-auth/file-binding behavior, GraphQL hooks, and gRPC streaming message hooks.
- Assertion evaluation, collection-run sequencing, request-local variables, cookie jar propagation, JSON/XML/HTML/regex extracted-variable propagation, script-mutation propagation, stop-on-failure, isolated request script execution, Node permission worker flags, minimal worker environments, bounded worker heap settings, bounded script console capture, explicit unsupported script API errors, and collection-run CSV export.
- CLI collection execution with passing/failing exit codes and JSON/CSV report output.
- Release manifest generation, release artifact validation, release workflow metadata, CI workflow validation, and GitHub release update checks.
- Workspace default creation, schema `2` through `11` migration, corrupt-file recovery, settings normalization, workspace-level load-test policy removal, native import, Postman folder/script import, and native/Postman/OpenAPI YAML format detection.
- Electron UI workflow smoke coverage for create/edit/save/reload/send, context menus, pane resizing, collection variables, request variables, editable examples, cookie jar capture, environment variables, Help-menu prerelease setting persistence, Load Test panel controls, assertions, collection runner, runtime variable output, and runner export-control state.
- Electron UI regression smoke coverage for toolbar dropdowns, Help-menu update state, import/export menu options/cancellation, invalid-request error rendering, XML/HTML response formatting, mocked OAuth flow completion/failure, cookie/example/request-variable editor creation, active-host cookie filtering, assertion-template rendering, runner pre-run export state, and no app-account/login language.
- Electron UI OAuth smoke coverage for mocked loopback PKCE success, custom-scheme callback success, state-mismatch failure, token exchange failure, PKCE cancellation, device-code success, access denial, timeout, and cancellation.
- Electron UI screenshot smoke coverage for request builder, context menu, cookies, auth/OAuth, response viewer, runner, load testing, and export menu states.

Missing tests:

- Native-runner packaged custom-scheme OAuth redirect registration scripts are implemented in CI, release, and manual release validation. The remaining requirement is collecting successful `windows-latest` and `macos-latest` run logs before promoting the corresponding readiness rows to `validated`.
- Packaged installer tests beyond the current Windows NSIS silent install/protocol/uninstall validation.
- Cross-platform file-dialog and workspace-path tests.

## Remaining Production Gaps

- Execute and archive successful packaged custom-scheme OAuth redirect validation on native Windows and macOS release runners before promoting packaging rows to `validated`.
- Replace remaining complex payload-specific IPC shape validation with generated validators from shared schemas.
- Add signing, notarization, installer execution validation, and update metadata on top of the current unsigned GitHub Releases workflow.
- Continue monitoring native Windows/macOS packaged OS-sandbox validation in CI and release workflows. Linux's current `bubblewrap` namespace plus dangerous-syscall seccomp policy is accepted for the current Linux claim; a stricter deny-by-default seccomp-BPF allowlist is optional future hardening.
- Keep `npm run postman:parity:claim`, `npm run postman:docs:validate`, and a current `npm run postman:docs:live` sweep green before making or preserving the full Postman script compatibility claim.
- Deepen cookie-jar behavior toward browser parity for remaining edge cases and any source-format cookie metadata not yet represented by explicit fields or extension hints.
- Extend local load-test governance only where it adds clear safety beyond current Load Test panel controls and global rate caps, such as run-budget presets or richer reporting around policy decisions.
- Continue expanding JMeter import/export beyond common sampler, header, variable, CSV metadata, listener, timer/controller/extractor, thread, XPath, and simple response/duration/size/JSON-path assertion mappings.
