# PostMeter Technical Specifications

## Current Migration Status

PostMeter is now implemented as an Electron desktop MVP. The JavaFX/Maven implementation has been removed from the tracked repository; Electron is the only supported runtime.

The migration deliberately does not bridge Electron to the Java services. Core behavior was ported into Node modules so the desktop UI, IPC boundary, persistence, request execution, import/export, and load-test logic can evolve together without carrying JavaFX UI coupling forward.

## Product Scope Implemented

- Create, rename, duplicate, delete, and save requests.
- Organize requests into collections and nested folders.
- Edit HTTP method, URL, query parameters, headers, raw body type, and body content.
- Create/edit/delete environments and resolve `{{variableName}}` placeholders.
- Import/export native PostMeter workspaces.
- Import/export native PostMeter collections.
- Import common Postman collection JSON while preserving folder hierarchy.
- Configure request auth helpers for Bearer token, Basic Auth, API key, Cookie, static OAuth 2.0 access-token injection, and refresh-token renewal when token metadata is present.
- Mark environment variables as secret and persist known auth secrets plus marked environment values through Electron `safeStorage` when available.
- Export workspaces and collections with secrets redacted by default, with explicit confirmation required for exact values.
- Send HTTP requests and display status, timing, size, final URL, headers, and formatted JSON bodies.
- Record recent request history.
- Run fixed-size local concurrent load tests with per-host allowlists, high-concurrency confirmation, progress, cancellation, latency percentiles, error summaries, and JSON/CSV export.

## Technology Stack

- Desktop shell: Electron `41.2.1`
- Main process: CommonJS Node modules under `electron/`
- Renderer UI: static HTML/CSS/JavaScript under `src/renderer/`
- Core services: CommonJS Node modules under `src/core/`
- HTTP client: Node global `fetch`
- Persistence: JSON file via `node:fs/promises`
- Secret storage: Electron `safeStorage` through a main-process codec injected into core persistence
- Packaging: electron-builder with Linux unpacked, AppImage, and deb targets
- Tests: Node built-in test runner plus an Electron startup smoke script

## Runtime Requirements

- Node.js 22 or newer.
- npm 10 or newer.
- Network access for request execution and load tests.
- Writable user-home directory unless `POSTMETER_DATA_PATH` is set.

## Build, Run, And Test Commands

Install Electron dependencies:

```bash
npm install
```

Run Electron:

```bash
npm start
```

Run Node tests:

```bash
npm test
```

Run Electron startup smoke:

```bash
npm run test:smoke
```

Check the installed Electron runtime:

```bash
npm run electron:version
```

Run the combined local check:

```bash
npm run check
```

Build an unpacked Linux package:

```bash
npm run pack:linux
```

Build Linux AppImage and deb artifacts:

```bash
npm run dist:linux
```

## Repository Structure

```text
electron/
  main.js
  preload.js

src/core/
  auth.js
  environmentResolver.js
  httpClient.js
  ipcValidation.js
  loadTestRunner.js
  models.js
  postmanImporter.js
  secrets.js
  workspaceStore.js

src/renderer/
  index.html
  renderer.js
  styles.css

test/electron/
  *.test.js
.github/workflows/
  ci.yml
```

`electron/main.js` owns the desktop lifecycle, window hardening, dialogs, workspace store instance, and IPC handlers.

`electron/preload.js` exposes a small `window.postmeter` API to the renderer. The renderer has no direct Node access.

`src/core/` contains framework-independent business logic. JavaFX source, Maven wrapper files, and Maven tests are no longer part of the tracked repository.

## Electron Architecture

Main process responsibilities:

- Create a single `BrowserWindow`.
- Disable hardware acceleration for reliable Linux/headless startup.
- Deny `window.open` and all permission requests.
- Load and recover workspace data before creating the UI.
- Own native open/save dialogs.
- Execute HTTP requests and load tests through core services.
- Validate renderer-originated IPC payloads before handing them to persistence, request execution, or load testing.
- Own Electron `safeStorage` encryption/decryption for local workspace secrets.
- Require export confirmation before exact secret values are written to workspace or collection exports.
- Export load-test results to JSON or CSV.
- Persist request history after sends.

Renderer responsibilities:

- Render the workspace, collections, folders, requests, environments, response viewer, history, and load-test controls.
- Maintain the active selection state.
- Collect editor state before save/send/load.
- Call only preload-exposed APIs.

Preload API:

```text
window.postmeter.app.versions()
window.postmeter.workspace.load()
window.postmeter.workspace.save(workspace)
window.postmeter.workspace.importWorkspace()
window.postmeter.workspace.exportWorkspace(workspace)
window.postmeter.collection.importCollection()
window.postmeter.collection.exportCollection(collection)
window.postmeter.request.validate(request, environment)
window.postmeter.request.send(request, environment)
window.postmeter.loadTest.start(id, request, environment, config)
window.postmeter.loadTest.cancel(id)
window.postmeter.loadTest.export(result, format)
window.postmeter.loadTest.onProgress(callback)
```

Security settings:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- Renderer CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none';`

Known security tradeoffs:

- IPC validation is structural and bounded, but it is not yet a versioned schema contract with generated validators.
- Electron `safeStorage` can be unavailable on some Linux sessions; the current fallback preserves data in a plaintext compatibility wrapper and is not production-grade secret storage.

## Workspace Data Model

Current schema version:

```text
4
```

Root workspace fields:

- `schemaVersion`
- `collections`
- `environments`
- `history`

Collection fields:

- `id`
- `name`
- `description`
- `requests`
- `folders`

Folder fields:

- `id`
- `name`
- `requests`
- `folders`

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

Auth fields vary by `auth.type`:

- `none`
- `bearer`: `token`
- `basic`: `username`, `password`
- `apiKey`: `location`, `key`, `value`
- `cookie`: `value`
- `oauth2`: `tokenType`, `accessToken`, `refreshToken`, `authorizationUrl`, `tokenUrl`, `clientId`, `clientSecret`, `scopes`, `grantType`, `expiresAt`
- `clientCertificate`: `certPath`, `keyPath`, `passphrase`

Environment fields:

- `id`
- `name`
- `variables`

Key/value pair fields:

- `enabled`
- `key`
- `value`
- `secret`

History entry fields:

- `timestamp`
- `method`
- `url`
- `statusCode`
- `durationMillis`

Schema `3` adds collection/folder hierarchy support through `folders`.

Schema `4` adds the `secret` flag to key/value pairs. Existing pairs migrate with `secret: false`.

## Persistence Specifications

Persistence is handled by `WorkspaceStore`.

Default path:

```text
~/.postmeter/workspace.json
```

Override:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

Behavior:

- Creates a default workspace when no file exists.
- Supports schema versions `1` through `4`.
- Migrates older schemas to schema `4`.
- Creates timestamped `pre-migration.backup` sibling files before saving migrated workspaces.
- Rejects future schema versions.
- Quarantines unreadable workspace JSON by moving it to a timestamped `corrupt` sibling file, then creates a fresh default workspace and raises a recovery error for the UI.
- Writes JSON through a temporary file and renames into place.
- Encrypts known auth secret fields and marked environment variable values before local workspace writes when a secret codec is configured.
- Decrypts local workspace secrets before returning workspaces to the renderer or core import callers.
- Normalizes IDs, names, body types, methods, arrays, folders, environments, and history.
- Destructive workspace import creates a current-workspace backup before replacement.

Limitations:

- No file locking.
- No multi-window conflict resolution.
- No atomic move fallback tuning beyond same-directory rename.
- Electron `safeStorage` ciphertext is host-specific and not a portable export format.
- If Electron reports `safeStorage` unavailable, the current main-process codec stores a plaintext fallback wrapper to avoid data loss; this needs stronger keyring failure handling before production release.

## Import And Export

Native workspace export writes the normalized workspace with secrets redacted by default. Exact auth secrets and marked environment secret values are exported only after explicit confirmation in the main-process dialog.

Native workspace import reads a PostMeter workspace, migrates it, normalizes it, backs up the current workspace, and replaces the active workspace from the UI.

Native collection export writes one collection inside a valid PostMeter workspace wrapper. Environments are intentionally separate and are not included in collection export. Collection exports follow the same default redaction and exact-value confirmation rule.

Native collection import imports the first collection from a PostMeter workspace file, regenerates IDs, and appends it to the active workspace.

Postman collection import supports:

- Collection name from `info.name`.
- Nested `item` folders and requests.
- Request name and HTTP method.
- URL from `url.raw` or structured `protocol`, `host`, and `path`.
- Query parameters from `url.query`.
- Headers from `request.header`, including disabled state.
- Raw request body from `request.body.raw`.
- Raw JSON body type when Postman marks raw language as JSON.

Postman import limitations:

- No auth import.
- No collection variables.
- No scripts, tests, events, examples, cookies, or protocol profile behavior.
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

- Resolves enabled variables from the active environment.
- Trims whitespace inside variable braces.
- Leaves unknown variables unchanged.
- Applies to URLs, query parameter keys/values, header names/values, and body content before request execution.

Password/token inputs are masked in the UI. Marked environment variables are rendered as password inputs and are encrypted in the local workspace when Electron `safeStorage` is available.

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

Auth values support environment substitution before use.

Auth validation:

- Requires non-empty configured token/value fields for enabled auth types. OAuth 2.0 accepts either an access token or a refresh token plus token URL.
- Validates header names for API-key header auth.
- Reports client certificate auth as unsupported by the current request transport.

Auth limitations:

- Full OAuth 2.0 authorization-code/browser/device-code/PKCE flows are not implemented yet.
- Refresh-token renewal currently sends `client_id` and `client_secret` in the form body when present; it does not yet support alternate OAuth client-auth methods.
- Client certificate transport is not implemented because Node global `fetch` does not directly expose the TLS client-certificate configuration needed by this UI model.
- Auth secrets rely on Electron `safeStorage` availability and do not yet have a robust keyring-unavailable recovery policy.

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

- Uses Node global `fetch`.
- Timeout: 60 seconds via `AbortSignal.timeout`.
- Redirects: follow.
- Response body decoding: UTF-8 text.
- Ignores user-provided `Content-Length`; the runtime manages it.
- Applies request auth after user headers and query parameters are collected.
- Captures response status, headers, body, final URL, response size, and rounded duration.

Body behavior:

- `NONE` sends no body.
- `RAW_JSON` sends body for `POST`, `PUT`, `PATCH`, and `DELETE`; default content type is `application/json`.
- `RAW_TEXT` sends body for `POST`, `PUT`, `PATCH`, and `DELETE`; default content type is `text/plain; charset=utf-8`.
- Body content supports environment substitution.

## Load Testing

Load testing is handled by `loadTestRunner.js`.

Inputs:

- Active request.
- Active environment.
- `concurrency`
- `totalRequests`
- `allowedHosts`
- `confirmedHighConcurrency`

Limits:

- Max concurrency: `512`
- Max total requests: `100000`
- Max allowed hosts: `100`
- High-concurrency confirmation threshold: `50`

Behavior:

- Runs a fixed number of requests across a local worker pool.
- Uses the same HTTP validation and execution path as normal request send.
- Requires the resolved request host to match the configured allowlist.
- Rejects concurrency `50` or higher unless confirmation is present.
- Supports cancellation with `AbortController`.
- Emits progress events with completed and requested request counts.
- Records successful status codes and failed request error samples.
- Summarizes min, average, p50, p90, p95, p99, max latency, throughput, error rate, status counts, and first 10 errors.
- Exports summary results as JSON or CSV.

Limitations:

- No ramp-up schedule.
- No duration mode.
- No per-sample export.
- No histogram output.
- No distributed execution.
- No resource budget, ramp-up safety model, distributed worker limits, or per-target rate governance beyond host allowlists, confirmation, and request/concurrency caps.

## IPC Validation

Renderer-originated IPC inputs are validated in `ipcValidation.js` before reaching main-process handlers.

Covered payloads:

- Workspace save/export payloads.
- Collection export payloads.
- Request send/validate payloads.
- Optional active environment payloads.
- Load-test ID, config, and export result payloads.
- Load export format.

Validation behavior:

- Requires expected object/array/string/number/boolean shapes.
- Bounds collection, folder, request, pair, history, string, body, allowed-host, folder-depth, and load-result sizes.
- Rejects unsupported request methods and body types before core execution.

Limitations:

- Validation is handwritten and should be replaced or backed by shared versioned schemas before plugin APIs or remote collaboration are added.
- Main-process response payloads are not schema-validated yet.

## Packaging And CI

Packaging is configured through `electron-builder` in `package.json`.

Targets:

- `npm run pack:linux`: unpacked Linux directory build.
- `npm run dist:linux`: Linux AppImage and deb artifacts.
- The deb package uses `PostMeter contributors <zacharyzirkle@hotmail.com>` as maintainer metadata.

CI is configured in `.github/workflows/ci.yml` for:

- `npm ci`
- `npm test`
- `npm audit --audit-level=high`
- `npm run electron:version`
- `xvfb-run -a npm run test:smoke`

Packaging limitations:

- Release signing is not configured.
- Checksums and update metadata are not generated as a release pipeline yet.
- Windows and macOS targets are not configured yet.

## Testing

Node tests cover:

- Environment variable resolution.
- Auth normalization, redaction, validation, OAuth refresh-token renewal, and request-time injection.
- HTTP validation and request execution against a local server.
- IPC payload validation.
- Load-test validation, host allowlists, high-concurrency confirmation, metrics, cancellation, and CSV export.
- Workspace default creation, schema `2` to `4` migration, corrupt-file recovery, secret encryption/redaction, native import, Postman folder import, and native/Postman format detection.

Missing tests:

- Electron UI automation.
- Full OAuth 2.0 browser/device-code/PKCE flow tests.
- Client certificate transport tests.
- Packaged installer tests.
- Cross-platform file-dialog and workspace-path tests.

## Remaining Production Gaps

- Add full OAuth 2.0 browser/device-code/PKCE flows.
- Add client-certificate request transport.
- Harden Electron `safeStorage` unavailable handling and consider OS keychain/passphrase fallback options.
- Replace handwritten IPC validation with versioned schemas and validate response payloads.
- Add automated Electron UI workflow tests.
- Add signing, checksums, and update/release automation.
- Expand importer/exporter coverage for OpenAPI, curl, HAR, and JMeter.
- Add request assertions, collection runner, scripts/hooks, and CLI/CI execution mode.
