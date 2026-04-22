# PostMeter Compatibility Matrix

PostMeter aims for practical compatibility with common API-client and load-test formats without pretending every vendor-specific feature is implemented.

## Native PostMeter

Supported:

- Workspace import/export.
- Collection import/export.
- Collections, folders, requests, assertions, scripts, auth metadata, environments, history, cookies, request examples, and variables.
- Secret redaction by default on export.

Known gaps:

- Native files are JSON only.
- Portable exact-secret exports are intentionally gated by explicit warning and typed confirmation.

## Postman Collections

Supported on import:

- Collection name.
- Collection variables.
- Nested folders and requests.
- Request method, URL, query params, headers, disabled params/headers, raw JSON/text body.
- Bearer, Basic, API key, and OAuth 2.0 auth import where Postman fields map cleanly to PostMeter auth helpers.
- Common `prerequest` and `test` event scripts from collection, folder, and request scopes.
- Request examples from `item.response`, editable in the request Examples tab.
- Request cookies from `request.cookie`; desktop import promotes Cookie headers into the local cookie jar when the request URL has a concrete host.
- Cookie metadata from Postman cookie objects is preserved in request metadata and used during desktop import promotion for domain/path/expiry/httpOnly/secure/SameSite/host-only/priority/partitioned/source fields and extension hints when provided.
- Request/item variables as request-local variables.
- Collection-level certificates where host/path matching can be represented safely and does not overwrite explicit request auth.

Known gaps:

- Protocol profile behavior and the full Postman variable-scope model are not imported.
- OAuth 2.0 auth import maps common token/client fields, but not every Postman grant/client-auth option.
- Imported examples can be edited, duplicated, deleted, captured from live responses, and exported as request example JSON.
- Cookie jar import is best-effort when cookie metadata is only available as a request header.
- Collection certificates are imported into PostMeter's single request-auth model only where safe.
- The script runtime implements a practical `pm` API subset, not full Postman sandbox compatibility.

## OpenAPI

Supported:

- OpenAPI/Swagger JSON and YAML import.
- Server URL, paths, methods, tags-as-folders, query/header parameters, and request body examples.
- Path parameter conversion between OpenAPI `{id}` and PostMeter `{{id}}`.
- Common HTTP bearer, HTTP basic, API key, and OAuth 2.0 security-scheme import.
- Response examples are imported as editable request examples when inline examples are present.
- Response status/header metadata is imported as disabled assertions so users can opt in without making every documented response code fail a run.
- OpenAPI 3.1 JSON export for collections, including mappable PostMeter auth helpers as security schemes.

Known gaps:

- Schema examples are best-effort.
- Device-code OAuth export uses PostMeter vendor extensions because OpenAPI does not define a device-code flow.

## JMeter

Supported:

- Basic `.jmx` `HTTPSamplerProxy` import.
- Basic `.jmx` HTTP sampler export.
- Method, protocol, host, path, query/body data, and headers where represented in common sampler fields.
- Header Manager import/export for request headers.
- User Defined Variables import/export as collection variables.
- CSV Data Set Config metadata import as collection variables.
- Thread group, timer, listener, and simple controller metadata import as collection variables where practical.
- Constant Timer, Constant Throughput Timer, Loop Controller, Transaction Controller, Throughput Controller, and Runtime Controller metadata export back to JMX elements when preserved in collection variables.
- Simple response-code, response-body, duration, size, JSON-path, and XPath assertions mapped to PostMeter assertions where practical.
- Regex Extractor import/export as PostMeter regex variable extraction.
- JSON Extractor import/export as PostMeter JSON variable extraction.
- Unsupported assertions, pre/post processors, and sampler/script elements such as JSR223 processors are preserved as explicit `jmeter.unsupported.*` collection variables instead of being silently dropped, and are re-exported as disabled JMX elements where the original class can be represented safely.

Known gaps:

- JMeter HTML Assertion validity semantics, listeners, complex assertions, advanced controller execution semantics, full thread-group behavior, and distributed test plans are not fully modeled.
- Import/export is intended as a bridge for simple HTTP sampler plans, not a full JMeter clone.

## curl

Supported:

- Common curl command import for URL, method, headers, data flags, cookies, multipart-ish form flags, and proxy/retry/TLS metadata.
- Collection export to readable curl commands.

Known gaps:

- Shell expansion and complex quoting edge cases are not fully modeled.
- Multipart, proxy, retry, and TLS flags are preserved as request data/metadata, not executed with full curl-equivalent transport semantics.

## HAR

Supported:

- HAR 1.2 request entry import.
- HAR response status/headers/body import as request examples.
- HAR timing metadata import as request-local variables.
- Collection export as a HAR 1.2 log containing request entries.

Known gaps:

- Cookies, cache entries, browser page metadata, and security details are not fully modeled.

## XML And HTML

Supported:

- XML response bodies are formatted in the response viewer when the content type or body shape indicates XML.
- HTML response bodies are formatted in the response viewer when the content type or body shape indicates HTML.
- XML XPath assertions and XML value extraction run in collection and CLI workflows.
- HTML CSS selector assertions and HTML text extraction run in collection and CLI workflows.
- JMeter XPath Assertion imports to PostMeter XML XPath assertions and `xmlPath` existence assertions export back to JMeter XPath Assertion.

Known gaps:

- HTML selector assertions check parsed text content; they do not perform full browser layout, JavaScript execution, or accessibility-tree validation.
- JMeter HTML Assertion document-validity behavior remains preserve-only because it is not equivalent to CSS selector checks.

## Scripting

Supported:

- Synchronous pre-request and test scripts in collection runs.
- `pm.test`, a practical `pm.expect` subset, `pm.environment`, `pm.collectionVariables`, `pm.variables`, request URL/header/body inspection, response JSON/text/header/body helpers, status-category response helpers, and JSON-body response helpers.
- Runtime timeouts, script length limits, bounded console capture, and blocked dynamic code generation.
- Node permission flags are enabled for script workers when supported by the pinned Node runtime, with filesystem read access restricted to the core script worker modules.
- Worker child processes start with a minimal environment and bounded V8 old-space limit. `POSTMETER_SCRIPT_WORKER_MAX_OLD_SPACE_MB` can tune the limit between the supported min/max bounds.
- Worker process termination when a script exceeds the parent safety timeout.
- Unsupported Postman sandbox APIs such as `pm.sendRequest`, `pm.vault`, `pm.cookies`, `pm.execution`, `pm.iterationData`, and `pm.visualizer` fail with explicit unsupported-API errors.

Known gaps:

- Async tests are rejected.
- Full Postman sandbox APIs are not implemented.
- Scripts run inside constrained Node `vm` contexts in a child process. This protects the Electron main process from direct script execution and adds Node permission constraints when available, but it is not a full OS sandbox.

## Load Testing

Supported:

- Local request-count and duration modes.
- Concurrency, ramp-up, target arrival-rate scheduling, single-process or bounded multi-process execution, allowed hosts, high-concurrency confirmation, cancellation, progress, latency summaries, histograms, optional capped samples, JSON/CSV export.
- Multi-process execution merges worker summaries without retaining every raw sample in the parent process, and worker child processes inherit only a minimal environment.

Known gaps:

- No distributed execution.
- No advanced per-target rate governance beyond allowlists, target arrival-rate scheduling, and bounded request/concurrency/duration/process controls.
