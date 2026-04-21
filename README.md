# PostMeter

PostMeter is a JavaFX desktop API client and lightweight volume-testing tool. The MVP supports saved request collections, PostMeter/Postman collection import, workspace export, environment variables, request editing, response inspection, and a fixed-size concurrent load test against the active request.

## Requirements

- Java 21
- Maven wrapper included in this repository

## Run

```bash
./mvnw javafx:run
```

If the wrapper is not executable in your checkout, run:

```bash
bash ./mvnw javafx:run
```

## Test

```bash
./mvnw test
```

The current test suite covers workspace persistence and migration, corrupt workspace recovery, native import/export, Postman collection import, environment variable resolution, HTTP request execution against a local test server, load-test result aggregation, and a basic FXML contract check.

## Workspace Data

PostMeter stores user data as JSON outside the application resources:

```text
~/.postmeter/workspace.json
```

For tests or isolated local runs, override the location:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json ./mvnw javafx:run
```

The same location can also be configured with the Java system property `postmeter.data.path` when launching a packaged JVM directly.

No API keys or secrets are required to run the app. If you save secrets in environment variables or headers, they are stored in plain JSON in the workspace file, so do not use this MVP as a secrets vault.

Workspace schema migrations create a timestamped `pre-migration.backup` sibling file before saving migrated data. If the workspace JSON cannot be parsed, PostMeter moves the unreadable file to a timestamped `corrupt` sibling file, creates a fresh default workspace, and reports the recovery path.

## MVP Usage

1. Create or select a collection and request.
2. Choose the HTTP method and enter a full `http` or `https` URL.
3. Add query params and headers in the request tabs.
4. Select a body type for `POST`, `PUT`, `PATCH`, or `DELETE` requests and enter raw JSON or text.
5. Optionally create an environment and reference variables with `{{variableName}}`.
6. Send the request and inspect status, response time, response size, final URL, headers, and formatted JSON response bodies.
7. Use the Load Test tab to run a fixed number of requests with configurable concurrency, progress updates, cancellation, and percentile summaries.
8. Use import/export controls or collection right-click menus to share PostMeter JSON collections and import common Postman collection JSON.

## Production-Readiness Notes

Implemented:

- Request collections and environments persisted to a user workspace file.
- Workspace schema versioning, schema 1 to 2 migration, migration backups, and corrupt-file quarantine.
- Native PostMeter workspace/collection import and export.
- Common Postman collection import for methods, URLs, headers, query params, and raw bodies.
- HTTP request execution through Java `HttpClient`.
- URL, method, header-name, and load-test limit validation with user-facing validation messages.
- Response status, headers, body, timing, final URL, and response size display.
- Basic fixed-request load testing with cancellation, progress updates, concurrency, status counts, percentile latency summary, throughput, error rate, and sample errors.
- Focused unit/integration tests for core services.

Known gaps before true production readiness:

- No encrypted secret storage or masking for sensitive headers and environment values.
- No OpenAPI, curl, HAR, or JMeter import/export yet.
- Postman import supports common collection request fields, but not every Postman feature.
- No authentication helpers such as OAuth, Basic Auth, bearer-token management, cookies, or client certificates.
- No request scripting, assertions, pre-request hooks, chained workflows, or CI runner.
- Load testing is local-process only; it does not support distributed execution, ramp-up schedules, duration mode, histograms, or resource safety controls beyond request/concurrency caps.
- UI coverage is not automated because JavaFX headless testing is not configured yet.
- Packaged installers and release automation are not configured.
