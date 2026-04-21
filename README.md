# PostMeter

PostMeter is an open-source Electron desktop API client and local load-testing tool.

The MVP supports saved request collections, folder organization, PostMeter/Postman collection import, workspace import/export, environments, request editing, response inspection, history, and fixed-size concurrent load tests against the active request.

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

The deb target currently uses a placeholder maintainer email in `package.json`; replace it before public releases.

## Workspace Data

PostMeter stores user data as JSON outside application resources:

```text
~/.postmeter/workspace.json
```

For tests or isolated local runs, override the location:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

No API keys or secrets are required to run the app. Saved headers, auth fields, and environment values are stored in plain JSON in this MVP. Password/token inputs are masked in the UI, but workspace and collection exports still contain their saved values.

Workspace schema migrations create a timestamped `pre-migration.backup` sibling file before saving migrated data. If the workspace JSON cannot be parsed, PostMeter moves the unreadable file to a timestamped `corrupt` sibling file, creates a fresh default workspace, and reports the recovery path. Destructive workspace import creates a current-workspace backup before replacement.

## MVP Usage

1. Create or select a collection, folder, and request.
2. Choose the HTTP method and enter a full `http` or `https` URL.
3. Add query params and headers in the request tabs.
4. Select a body type for `POST`, `PUT`, `PATCH`, or `DELETE` requests and enter raw JSON or text.
5. Add request auth in the Auth tab when needed.
6. Optionally create an environment and reference variables with `{{variableName}}`.
7. Send the request and inspect status, response time, response size, final URL, headers, and formatted JSON response bodies.
8. Use the Load Test tab to run a fixed number of requests with configurable concurrency, progress updates, cancellation, percentile summaries, and JSON/CSV export.
9. Use import/export controls to share PostMeter JSON workspaces/collections and import common Postman collection JSON.

## Electron Security Posture

Implemented now:

- Renderer `nodeIntegration` is disabled.
- `contextIsolation` is enabled.
- Renderer sandboxing is enabled.
- Renderer talks to core logic only through explicit preload IPC bindings.
- `window.open` and Electron permission requests are denied.
- Renderer has a restrictive Content Security Policy.
- Renderer-originated IPC payloads are structurally validated before reaching core services.
- Hardware acceleration is disabled to avoid GPU startup failures in common Linux/headless environments.
- Electron is pinned by `package-lock.json`; `npm audit --audit-level=high` currently reports zero high-severity findings.

Known hardening gaps:

- IPC validation is structural and should evolve into versioned schemas before broad plugin/import surfaces are added.
- Saved secrets are plain JSON and are not encrypted or backed by OS keychains.

## Production-Readiness Notes

Implemented:

- Electron desktop shell with secure preload IPC.
- Request collections with nested folders and environments persisted to a user workspace file.
- Auth helpers for Bearer token, Basic Auth, API key, Cookie, and static OAuth 2.0 access-token injection.
- Workspace schema versioning through schema `3`, schema migration, migration backups, and corrupt-file quarantine.
- Native PostMeter workspace/collection import and export.
- Common Postman collection import with folder hierarchy, methods, URLs, headers, query params, and raw bodies.
- HTTP request execution through Node `fetch`.
- URL, method, header-name, and load-test limit validation with user-facing validation messages.
- Response status, headers, body, timing, final URL, and response size display.
- Basic fixed-request load testing with cancellation, progress updates, concurrency, status counts, percentile latency summary, throughput, error rate, sample errors, and JSON/CSV export.
- Focused Node tests for core services, auth injection, and IPC validation.
- Linux packaging scripts and CI workflow.

Known gaps before true production readiness:

- No encrypted secret storage or OS keychain integration.
- Full OAuth 2.0 browser/device-code flows are not implemented yet.
- Client-certificate auth is modeled in the UI but not supported by the current `fetch` transport.
- No OpenAPI, curl, HAR, or JMeter import/export.
- Postman import supports common collection request fields, but not every Postman feature.
- No request scripting, assertions, pre-request hooks, chained workflows, or CI runner.
- Load testing is local-process only; it does not support distributed execution, ramp-up schedules, duration mode, histograms, or advanced resource safety controls.
- No automated Electron UI workflow tests beyond startup smoke.
- Linux package scripts exist, but signing, notarization, update flow, and release automation are not configured.
