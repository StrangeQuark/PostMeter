# PostMeter

PostMeter is an open-source Electron desktop API client and local load-testing tool.

The MVP supports saved request collections, folder organization, collection/request/environment variables, editable request examples, a local cookie jar, PostMeter collection import/export, Postman collection import, OpenAPI/JMeter/curl/HAR collection import and export, workspace import/export, request editing, JSON/XML/HTML-aware assertions, permission-constrained child-process request scripts, collection runs, response inspection, history, HTTPS client certificates, light/dark/system theme modes, a CI-friendly CLI runner, GitHub Releases update checks, and bounded local load tests with Load Test panel run configuration, global rate caps, policy-decision reporting, and optional multi-process execution against the active request.

PostMeter is standalone local software. It does not require a PostMeter account, app login, cloud sign-in, or user registration to use the core product. OAuth support is only for authenticating outbound API requests.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Install

```bash
npm install
```

## Run The App

```bash
npm start
```

The Electron app uses:

- `electron/main.js` for the desktop main process.
- `electron/preload.js` for explicit IPC bindings.
- `src/renderer/` for the browser UI.
- `src/core/` for request execution, persistence, environment resolution, import, and load-test logic.

## Test

Run the Electron/Node core tests:

```bash
npm test
```

Run the startup smoke test:

```bash
npm run test:smoke
```

Run the Electron UI workflow smoke test:

```bash
npm run test:ui
```

Run the Electron UI regression smoke test:

```bash
npm run test:ui:regression
```

Run the mocked OAuth UI smoke test:

```bash
npm run test:ui:oauth
```

Run the screenshot-level UI smoke test:

```bash
npm run test:ui:snapshot
```

Check the installed Electron version:

```bash
npm run electron:version
```

Run the full local verification bundle:

```bash
npm run check
```

## Linux Packaging

Create an unpacked Linux build:

```bash
npm run pack:linux
```

Create Linux AppImage and deb artifacts:

```bash
npm run dist:linux
```

Create unsigned Windows or macOS artifacts on their native CI runners:

```bash
npm run dist:win
npm run dist:mac
```

Write SHA-256 checksums for release artifacts:

```bash
npm run release:checksums
```

Write release checksums and a machine-readable release manifest:

```bash
npm run release:prepare
```

Validate generated release artifacts against the release manifest:

```bash
npm run release:validate
```

Linux builds produce both AppImage and deb artifacts. The deb metadata uses `StrangeQuark <support@qrksw.com>` as the maintainer address. Release validation checks manifest metadata, artifact hashes, required artifact types, Linux deb/AppImage desktop protocol registration, and macOS zip app-bundle URL-scheme registration when an app bundle is present. The release workflow also runs native CI-only Windows installer and macOS app/DMG protocol registration checks on their platform runners. Package metadata, update defaults, and release links target the canonical `StrangeQuark/PostMeter` GitHub repository. Tag pushes matching `v*` run the GitHub Releases workflow and publish unsigned platform artifacts plus `SHA256SUMS` and `release-manifest.json`.

## Updates

The desktop app can check GitHub Releases for a newer PostMeter version from Help > Check for Updates and prompt before opening the release page. Stable releases are checked by default; prereleases are included only when the user enables the Help > Prereleases checkbox. Update checks do not require a PostMeter account and do not create any account/login flow. For development or forks, override the endpoint with:

```bash
POSTMETER_UPDATE_URL=https://api.github.com/repos/OWNER/REPO/releases/latest npm start
```

## CLI Runner

Run a workspace or collection file headlessly:

```bash
npm run cli -- run --file ./workspace.json --collection "Smoke" --environment "Local" --var token="$API_TOKEN" --report ./runner-report.json
```

The CLI accepts native PostMeter workspace/collection files and the same import pipeline used by the desktop app for Postman, OpenAPI, JMeter, curl, and HAR inputs. It returns exit code `0` only when all executed requests pass their assertions and scripts. JSON and CSV reports are supported through `--report` and `--format json|csv`. Use `--var key=value` and `--collection-var key=value` to inject CI values at runtime.

## Workspace Data

PostMeter stores user data as JSON outside application resources:

```text
~/.postmeter/workspace.json
```

For tests or isolated local runs, override the location:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

No API keys are required to run the app. PostMeter stores workspace data as plain JSON, including auth fields, variables, cookies, and certificate passphrases. Text inputs are shown as normal visible text fields, and workspace/collection exports write the normalized data directly without redaction or export confirmation.

Workspace schema migrations create a timestamped `pre-migration.backup` sibling file before saving migrated data. Schema `5` adds collection variables, schema `6` adds request script containers, schema `7` adds app settings including theme preference, request-local variables, request examples, and collection certificate metadata, schema `8` adds workspace cookies plus per-request cookie jar settings, schema `9` adds request load-test policy compatibility fields, and schema `10` removes workspace-level load-test defaults so load tests are configured from the Load Test panel. If the workspace JSON cannot be parsed, PostMeter moves the unreadable file to a timestamped `corrupt` sibling file, creates a fresh default workspace, and reports the recovery path. Destructive workspace import creates a current-workspace backup before replacement.

## MVP Usage

1. Create or select a collection, folder, and request.
2. Choose the HTTP method and enter a full `http` or `https` URL.
3. Add query params and headers in the request tabs.
4. Select a body type for `POST`, `PUT`, `PATCH`, or `DELETE` requests and enter raw JSON or text.
5. Add request auth in the Auth tab when needed.
6. Optionally add collection variables, request-local variables, create an environment, and reference variables with `{{variableName}}`.
7. Send the request and inspect status, response time, response size, final URL, headers, and formatted JSON response bodies.
8. Add Tests assertions for status, headers, JSON paths, XML XPath, HTML CSS selectors, response time, response size, body text, JSON/XML/HTML extraction, or regex extraction.
9. Add optional pre-request and test scripts in the Scripts tab for single sends and collection-run workflows.
10. Use the Runner tab to execute the active collection locally, optionally stop on failure, and export JSON/CSV run results.
11. Use the Load Test tab to run request-count or duration-based local load tests with configurable concurrency, ramp-up, target requests per second, global rate caps, single-process or multi-process execution, high-concurrency confirmation, progress updates, cancellation, percentile summaries, histograms, optional sample capture, and JSON/CSV export.
12. Use the Cookies tab to opt requests into the local cookie jar, inspect stored cookies, and clear expired cookies.
13. Use the Examples tab to create, edit, duplicate, capture, delete, and export request examples.
14. Use import/export controls to share PostMeter JSON workspaces/collections and import or export common Postman, OpenAPI, JMeter, curl, and HAR formats. Imported Postman examples are editable in the request Examples tab.

## Compatibility

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the current native PostMeter, Postman, OpenAPI, JMeter, curl, HAR, scripting, and load-testing compatibility matrix.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current renderer, Electron main-process, and core module boundaries.

See [docs/OAUTH_PROVIDER_CERTIFICATION.md](docs/OAUTH_PROVIDER_CERTIFICATION.md) for the manual outbound OAuth provider certification plan. OAuth support is for authenticating requests to target APIs only; PostMeter must not add a user account, app login, or cloud sign-in requirement.

## Electron Security Posture

Implemented now:

- Renderer `nodeIntegration` is disabled.
- `contextIsolation` is enabled.
- Renderer sandboxing is enabled.
- Renderer talks to core logic only through explicit preload IPC bindings.
- `window.open` and Electron permission requests are denied.
- Renderer has a restrictive Content Security Policy.
- Renderer-originated IPC payloads are structurally validated before reaching core services, with shared versioned enum contracts and shared field schemas for common request/workspace/auth primitives plus bounded validation for load-test config/progress/result payloads, OAuth progress payloads, runner config/progress/result payloads, file-operation results, and collection-run script result payloads.
- Request scripts run in forked child processes and constrained Node `vm` contexts, with Node permission flags when supported by the runtime, a minimal worker environment, bounded worker heap size, execution timeouts, script length limits, bounded console capture, dynamic-code-generation blocking, and explicit unsupported errors for unsupported network/Node-like globals.
- Workspace data is stored as plain JSON without local encryption or redacted export modes.
- High-concurrency load tests require confirmation.
- Hardware acceleration is disabled to avoid GPU startup failures in common Linux/headless environments.
- Update checks fetch GitHub Releases metadata from the main process and require user confirmation before opening a GitHub release page.
- Electron is pinned by `package-lock.json`; `npm audit --audit-level=high` currently reports zero high-severity findings.

Known hardening gaps:

- IPC validation is structural and uses shared versioned enum contracts; request/workspace array, nested-field validation, common primitive groups, OAuth progress, runner config/progress, load progress/result, and file-operation result validation are schema-driven or schema-backed, while some complex nested payload checks are still manually maintained.
- Script child-process isolation uses Node permission flags and bounded worker heap settings where available, but it is still not a full OS sandbox with syscall policy.

## Production-Readiness Notes

Implemented:

- Electron desktop shell with secure preload IPC.
- Request collections with nested folders and environments persisted to a user workspace file.
- Auth helpers for Bearer token, Basic Auth, API key, Cookie, static OAuth 2.0 access-token injection, OAuth 2.0 refresh-token renewal, OAuth 2.0 client-credentials token retrieval, OAuth 2.0 authorization-code PKCE, OAuth 2.0 device-code flow, and HTTPS client certificates using PEM certificate/key pairs or PFX/P12 bundles with optional CA certificate paths.
- Workspace schema versioning through schema `10`, schema migration, migration backups, and corrupt-file quarantine.
- Native PostMeter workspace/collection import and export.
- Common Postman collection import with folder hierarchy, methods, URLs, headers, query params, raw bodies, collection variables, request-local variables, editable examples, cookies promoted into the local cookie jar during desktop import, richer cookie metadata, collection certificates where they map safely, common auth helpers, and pre-request/test event scripts.
- OpenAPI, JMeter, curl, and HAR import/export for collection compatibility workflows, including OpenAPI JSON/YAML import, OpenAPI security-scheme import/export, OpenAPI response example and disabled response-assertion import, JMeter assertions/variables/headers/listeners/CSV/thread/timer/controller/extractor metadata where mappable, XPath Assertion mapping, Size Assertion mapping, disabled assertion-state preservation for mapped JMeter assertions, broader representative timer metadata preservation, unsupported JMeter metadata preservation and disabled-element re-export, HAR response examples/timing metadata, and common curl cookie/proxy/retry/TLS flag preservation.
- Request assertions for status code, headers, JSON paths, XML XPath, HTML CSS selectors, response time, response size, body text, JSON/XML/HTML variable extraction, and regex variable extraction.
- Local collection runner with stop-on-failure, extracted-variable/script-mutation propagation, cookie jar propagation, runtime variable visibility, JSON/CSV run export, and a headless CLI runner for CI.
- HTTP request execution through Node `fetch`, with a Node `https` path for client-certificate requests.
- URL, method, header-name, auth, export, and load-test safety validation with user-facing validation messages.
- Response status, headers, body, timing, final URL, and response size display.
- Local load testing with request-count mode, duration mode, ramp-up scheduling, target arrival-rate scheduling, global rate-cap governance, policy-decision reporting, optional bounded multi-process execution, streamed worker summary aggregation, cancellation, progress updates, concurrency, high-concurrency confirmation, status counts, percentile latency summary, latency histograms, throughput, error rate, optional capped sample capture, sample errors, and JSON/CSV export.
- Focused Node tests for core services, auth injection, mTLS, and IPC validation.
- Electron startup smoke, Electron UI workflow smoke, Electron UI regression smoke, mocked OAuth UI smoke, screenshot-level UI smoke, Linux package smoke in CI, release checksum generation, release manifest generation, and release workflow metadata checks.
- In-app GitHub Releases update checks with explicit user prompt before opening the release page, light/dark/system theme settings, and a settings opt-in for prerelease checks.

Known gaps before true production readiness:

- OAuth 2.0 flows still need broader provider compatibility testing, but loopback PKCE success, state-mismatch failure, and device-code success are covered by mocked Electron UI smoke tests. Linux deb/AppImage protocol registration and macOS zip app-bundle URL-scheme registration are validated from packaged artifacts where present; native CI-only Windows installer and macOS app/DMG protocol checks are wired into the release workflow but still need to run on GitHub-hosted native release runners.
- Postman import supports common collection request fields, auth helpers, scripts, editable examples, cookies, request variables, and collection certificate metadata, but not every Postman feature.
- Request scripting is available for collection runs through the Scripts tab and runs in a bounded child process. Unsupported Postman sandbox APIs and unsupported Node/network-like globals now fail with explicit PostMeter unsupported-API messages, but the compatibility surface is still intentionally limited.
- Load testing supports bounded local single-process or multi-process execution with global rate caps and result/CSV policy-decision reporting. It does not support distributed execution or deeper policy governance beyond target arrival-rate scheduling, local rate caps, and request/concurrency/duration/process caps. Multi-process summaries merge worker metrics without retaining all raw samples, while optional sample capture remains capped.
- Automated Electron UI coverage is still smoke-level and Linux-focused in CI; screenshot-level coverage exists for key desktop states but still needs cross-platform regression coverage.
- Linux, Windows, and macOS unsigned release artifact builds are configured for tag-based GitHub Releases, but signing, notarization, true auto-install updates, and installer validation still need production work.
