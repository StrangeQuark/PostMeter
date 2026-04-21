# PostMeter Technical Specifications

## Product Scope

PostMeter is a JavaFX desktop application intended to become an open-source alternative to Postman with an initial JMeter-like volume-testing workflow.

The current MVP supports:

- Creating and organizing request collections.
- Creating, editing, deleting, and saving requests.
- Editing HTTP method, URL, query parameters, headers, and raw body.
- Creating and editing environments with variable substitution.
- Importing and exporting native PostMeter JSON workspaces and collections.
- Importing common Postman collection JSON for collection sharing.
- Sending HTTP requests and viewing response status, headers, body, timing, final URL, and response size.
- Recording request history.
- Running a fixed-size concurrent load test against the active request.

## Technology Stack

- Language: Java 21
- UI framework: JavaFX
- Build tool: Maven through the included Maven wrapper
- HTTP client: Java `java.net.http.HttpClient`
- JSON serialization: Jackson Databind
- Tests: JUnit 5 with Maven Surefire

## Runtime Requirements

- Java 21 runtime and compiler.
- Network access for sending requests from the desktop app.
- Writable user-home directory, unless a custom workspace path is configured.

## Build, Run, And Test Commands

Run the desktop app:

```bash
./mvnw javafx:run
```

Run tests:

```bash
./mvnw test
```

Build package:

```bash
./mvnw package
```

The Maven wrapper is expected to be executable. If a checkout strips executable bits, use:

```bash
bash ./mvnw javafx:run
```

## Configuration

PostMeter stores workspace data in JSON. The default path is:

```text
~/.postmeter/workspace.json
```

The workspace path can be overridden with:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json ./mvnw javafx:run
```

The same behavior can be configured through the Java system property:

```text
postmeter.data.path
```

Configuration precedence:

1. Java system property `postmeter.data.path`
2. Environment variable `POSTMETER_DATA_PATH`
3. Default path `~/.postmeter/workspace.json`

## Repository Structure

```text
src/main/java/com/strangequark/postmeter/
  MainApplication.java
  MainController.java
  model/
  service/

src/main/resources/com/strangequark/postmeter/
  main-view.fxml
  styles.css

src/test/java/com/strangequark/postmeter/service/
```

`model/` contains serializable workspace and request data structures.

`service/` contains non-UI logic for persistence, environment resolution, HTTP execution, and load testing.

The old `src/main/resources/jsonFiles/` files have been removed because packaged applications should not mutate resources.

## UI Architecture

The UI is defined by:

- `MainApplication.java`
- `MainController.java`
- `main-view.fxml`
- `styles.css`

The app shell uses:

- A top toolbar for environment selection, collection/request creation, saving, and status.
- A top toolbar for native workspace import/export.
- A left sidebar with tabs for collections, history, and environment editing.
- Collection controls for native/Postman collection import, native collection export, and delete.
- Right-click collection/request menus for adding requests, renaming items, duplicating requests, exporting collections, and deleting items.
- A request editor with method, URL, request name, query params, headers, and body tabs.
- A request validation label for user-facing URL/header/method errors before send or load-test execution.
- A lower results area with response and load-test tabs.
- Load-test controls for run, cancel, progress, and summary output.

## Workspace Data Model

The persisted root object is `WorkspaceData`.

Current schema version:

```text
2
```

Workspace fields:

- `schemaVersion`
- `collections`
- `environments`
- `history`

Collection fields:

- `id`
- `name`
- `description`
- `requests`

Request fields:

- `id`
- `name`
- `method`
- `url`
- `queryParams`
- `headers`
- `bodyType`
- `body`

Environment fields:

- `id`
- `name`
- `variables`

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

## Persistence Specifications

Persistence is handled by `WorkspaceStore`.

Behavior:

- Creates a default workspace when no workspace file exists.
- Supports schema versioning with current schema version `2`.
- Migrates schema version `1` workspaces to schema version `2`.
- Creates a timestamped `pre-migration.backup` sibling file before saving migrated workspace data.
- Rejects future workspace schema versions that are newer than the app supports.
- Quarantines unreadable workspace JSON by moving it to a timestamped `corrupt` sibling file, then creates a fresh default workspace and raises a recovery exception for the UI to report.
- Writes JSON with Jackson indentation enabled.
- Creates parent directories before saving.
- Writes through a temporary file and then moves into place.
- Attempts atomic move first and falls back to normal replace when atomic moves are unsupported.
- Normalizes loaded data by ensuring required IDs, default names, body types, methods, and list fields exist.
- Imports and exports native PostMeter workspace JSON.
- Imports and exports native PostMeter collection JSON through a single-collection workspace wrapper.

Persistence limitations:

- Migration logic is intentionally small and only supports schema 1 to 2 at this point.
- No encryption.
- No file locking.
- No multi-window conflict resolution.

## Import And Export Specifications

Native PostMeter import/export is handled by `WorkspaceStore`.

Native workspace export:

- Writes the full `WorkspaceData` object.
- Normalizes and stamps the current schema version before export.

Native workspace import:

- Reads `WorkspaceData`.
- Applies supported migrations.
- Normalizes imported data.
- Replaces the active workspace when used from the UI.

Native collection export:

- Writes a single collection inside a valid PostMeter workspace JSON wrapper.

Native collection import:

- Imports the first collection found in a PostMeter workspace JSON file.
- Regenerates collection and request IDs to avoid collisions when sharing collections.
- Appends the imported collection to the active workspace when used from the UI.

Postman collection import is handled by `PostmanCollectionImporter` and is used as a fallback by `WorkspaceStore.importCollection`.

Supported Postman fields:

- Collection name from `info.name`.
- Nested `item` traversal.
- Request name.
- HTTP method.
- URL from `url.raw` or structured `protocol`, `host`, and `path`.
- Query parameters from `url.query`.
- Headers from `request.header`, including disabled state.
- Raw request body from `request.body.raw`.
- Raw JSON body type when Postman marks raw language as JSON.

Postman import limitations:

- No Postman auth import yet.
- No scripts, tests, events, variables, folders-as-groups, examples, cookies, or protocol profile behavior.
- Raw URL query strings are split from the request URL and query params are imported from `url.query`.

## Environment Resolution Specifications

Environment resolution is handled by `EnvironmentResolver`.

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

## HTTP Request Execution Specifications

Request execution is handled by `HttpRequestExecutor`.

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
- URL must parse as a URI.
- URL must include a host.
- Scheme must be `http` or `https`.
- Method must be in the supported method set.
- Header names must match HTTP token syntax.
- Validation is available without sending the request and is used by the UI before normal request execution and load-test execution.

HTTP client behavior:

- Uses Java `HttpClient`.
- Connect timeout: 15 seconds.
- Request timeout: 60 seconds.
- Redirects: normal redirect following.
- Response body decoding: UTF-8 string.
- Ignores user-provided `Content-Length`; Java manages it.

Body behavior:

- Body is sent only when body type is not `NONE` and method is one of `POST`, `PUT`, `PATCH`, or `DELETE`.
- `RAW_JSON` adds `Content-Type: application/json` when no explicit content type is present.
- `RAW_TEXT` adds `Content-Type: text/plain; charset=utf-8` when no explicit content type is present.

Response data captured:

- Status code.
- Headers.
- Body.
- Duration in milliseconds.
- Response byte count.
- Final URL.

## Response Viewer Specifications

The response UI displays:

- Status code.
- Duration.
- Response size.
- Final URL.
- Response headers.
- Response body.

Body formatting:

- JSON-like bodies or bodies with a JSON content type are pretty-printed.
- Invalid JSON falls back to raw body display.
- Non-JSON bodies display as raw text.

## History Specifications

History behavior:

- Request history is stored in the workspace.
- New entries are added to the top.
- History is capped at 100 entries.
- Failed requests are recorded with status `0` and displayed as `ERR`.

History limitations:

- History selection currently loads method, URL, and generated name into the editor but does not restore headers, params, or body.
- No search, filter, pinning, or cleanup controls.

## Load Testing Specifications

Load testing is handled by `LoadTestRunner`.

Inputs:

- Active request.
- Active environment.
- Concurrency.
- Total request count.
- Cancellation token.
- Optional progress listener.

Limits:

- Minimum concurrency: 1
- Maximum concurrency: 512
- Minimum request count: 1
- Maximum request count: 100,000

Execution behavior:

- Uses a fixed thread pool sized to configured concurrency.
- Submits up to the configured number of requests unless cancellation is requested first.
- Uses the same request execution path as a normal send.
- Polls completions so cancellation can be observed while requests are running.
- Cancels outstanding queued work when cancellation is requested.
- Aggregates completed samples after execution or cancellation.
- Reports progress as completed request count out of requested request count.

Metrics reported:

- Requested requests.
- Completed requests.
- Cancellation status.
- Successful requests.
- Failed requests.
- Error rate.
- Requests per second.
- Minimum latency.
- Average latency.
- p50 latency.
- p90 latency.
- p95 latency.
- p99 latency.
- Maximum latency.
- Status counts.
- Up to 10 sample errors.

Load-test limitations:

- No ramp-up or duration mode.
- No distributed execution.
- No charted progress view.
- No histogram or export.
- No adaptive resource safety beyond fixed request/concurrency caps.

## Testing Specifications

Current tests are service-level tests under:

```text
src/test/java/com/strangequark/postmeter/service/
```

A lightweight FXML contract test also exists under:

```text
src/test/java/com/strangequark/postmeter/
```

Covered behavior:

- Environment variable resolution.
- Workspace creation, save/load, path override, schema 1 to 2 migration, migration backup, corrupt workspace quarantine, future schema rejection, and native import/export.
- Postman collection import for common request fields.
- HTTP request execution and validation against a local in-process HTTP server.
- Load-test result aggregation, cancellation-before-start, and percentile metrics against a local in-process HTTP server.
- FXML handler contract coverage for core workflow buttons.

Current verification status:

- `./mvnw test` passes with the current test suite.
- `./mvnw package` passes and builds the jar.

Testing limitations:

- No full JavaFX/TestFX UI interaction tests yet.
- No end-to-end desktop workflow tests.
- No property-based tests or fuzzing for URL/header parsing.
- No performance regression tests.

## Security Specifications

Current safeguards:

- Validates URL scheme and host.
- Shows request validation errors before send and load-test execution.
- Restricts request execution to `http` and `https`.
- Validates header names.
- Ignores `Content-Length` as a user-editable header.
- Caps load-test concurrency and request count.
- Stores app data outside application resources.
- Backs up workspace data before schema migration.
- Quarantines corrupt workspace files instead of overwriting unreadable data in place.
- Regenerates IDs on collection import to reduce collision risk.

Known security gaps:

- Workspace JSON is plain text.
- Saved headers and environment variables may contain secrets and are not encrypted or masked.
- No secret redaction in UI.
- No auth-specific handling for OAuth, cookies, client certs, or token refresh.
- No SSRF protections beyond scheme/host validation. As a desktop API client, users can intentionally request private network targets.
- No trust-store or certificate pinning controls.

## Dependency Specifications

Primary dependencies:

- `org.openjfx:javafx-controls:21.0.5`
- `org.openjfx:javafx-fxml:21.0.5`
- `com.fasterxml.jackson.core:jackson-databind:2.17.2`
- `org.junit.jupiter:junit-jupiter:5.10.2`

Maven plugins:

- `maven-compiler-plugin`
- `maven-surefire-plugin`
- `javafx-maven-plugin`

## Packaging Status

Current packaging:

- Maven jar build works with `./mvnw package`.

Not implemented:

- Native installers.
- Signed releases.
- Auto-update.
- GitHub Actions release pipeline.
- Runtime image generation verification.

## Production Readiness Status

The current repository is a usable desktop MVP, not a production-complete Postman/JMeter replacement.

Production-ready areas:

- Core request editing and execution.
- Workspace persistence with schema versioning, migration backup, and corrupt-file quarantine.
- Native workspace and collection sharing.
- Common Postman collection import.
- Basic environment substitution.
- Basic response viewing.
- Basic cancellable local load testing with richer percentile metrics.
- Focused service test coverage.

Not production-ready:

- Secret handling.
- Auth workflows.
- OpenAPI, curl, HAR, JMeter, and complete Postman import/export coverage.
- Test scripting/assertions.
- Collection runner.
- Distributed or advanced load testing.
- Full automated UI interaction coverage.
- Installer/release automation.
