# PostMeter Compatibility Matrix

Use this document when you need the exact supported surface for imports, exports, scripting, and load testing.

PostMeter aims for practical compatibility with common API-client and load-test formats without pretending every vendor-specific feature is implemented.

## Native PostMeter

Supported:

- Workspace import/export, including filesystem-discovered managed workspaces, exporting the current workspace or another managed workspace from the Workspaces list, and non-destructive native workspace import in the desktop UI.
- Collection import/export, including desktop collection-picker export that still opens with an explicit empty-state warning when no collections exist, and native collection export defaults of `<collection-name>.json`.
- Collections, folders, requests, assertions, scripts, auth metadata, environments, history, cookies, request examples, variables, and light/dark/system theme preference.

Known gaps:

- Native files are JSON only.

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
- Cookie metadata from Postman cookie objects is preserved in request metadata and used during desktop import promotion for domain/path/expiry/httpOnly/secure/SameSite/host-only/priority/partitioned/source fields, prefix-constrained cookie names, and extension hints when provided.
- Request/item variables as request-local variables.
- Collection-level certificates where host/path matching can be represented safely and does not overwrite explicit request auth.

Known gaps:

- Protocol profile behavior and the full Postman variable-scope model are not imported.
- OAuth 2.0 auth import maps common token/client fields, but not every Postman grant/client-auth option.
- Imported examples can be edited, duplicated, deleted, captured from live responses, and exported as request example JSON.
- Cookie jar import is best-effort when cookie metadata is only available as a request header.
- Collection certificates are imported into PostMeter's single request-auth model only where safe.
- The script runtime is moving toward Postman sandbox parity for imported pre-request and test scripts. Any remaining unsupported Postman script APIs are tracked as compatibility gaps, not intentional long-term divergence.

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
- Thread group, timer, listener, and simple or nested controller metadata import as collection variables where practical.
- Constant Timer, Constant Throughput Timer, and representative generic timer metadata such as Uniform/Gaussian/Poisson random timers and Precise Throughput Timer export back to JMX elements when preserved in collection variables.
- Simple response-code, response-body, duration, size, JSON-path, and XPath assertions mapped to PostMeter assertions where practical, including disabled-state preservation for mapped assertions and XPath assertion variants in nested-controller fixtures.
- Regex Extractor import/export as PostMeter regex variable extraction.
- JSON Extractor import/export as PostMeter JSON variable extraction.
- Unsupported assertions, pre/post processors, and sampler/script elements such as JSR223 processors, HTML validity assertions, MD5 assertions, XML schema assertions, compare assertions, and SMIME assertions are preserved as explicit `jmeter.unsupported.*` collection variables instead of being silently dropped, and are re-exported as disabled JMX elements where the original class can be represented safely.

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

Sandbox contract: see `docs/SANDBOX_CONTRACT.md`. The list below describes the current implementation.

Supported:

- Synchronous pre-request and test scripts in single request sends and collection runs.
- Async `pm.test` callbacks and promise-returning tests in the isolated worker runtime.
- `pm.test`, a practical `pm.expect` subset, `pm.environment`, `pm.collectionVariables`, true workspace `pm.globals`, `pm.variables`, `pm.iterationData`, request URL/header/body inspection and pre-request header/body/url mutation helpers, response JSON/text/header/body helpers, status-category response helpers, and JSON-body response helpers.
- Brokered `pm.sendRequest`, current-URL `pm.cookies`, and `pm.cookies.jar()` helpers are enabled by default for Postman import parity; workspace settings can disable script network requests or script cookie access for stricter environments.
- `pm.execution.setNextRequest`, `pm.execution.skipRequest`, and bounded brokered `pm.execution.runRequest` for collection-local request IDs/names and variable overrides.
- `pm.visualizer.set()` and `pm.visualizer.clear()` with bounded JSON data, escaped/raw interpolation, common `{{#each}}` blocks, sanitized output, and sandboxed iframe rendering.
- `pm.vault.get()`, `pm.vault.set()`, and `pm.vault.unset()` through an explicit workspace grant, parent broker, encrypted per-workspace local vault file, bounded values/operations, and mutation audit metadata.
- `pm.require()` and sandbox `require()` for bundled allowlisted `crypto-js`, `lodash`, and `uuid` compatibility packages. Node modules, external packages, paths, and URLs remain blocked.
- Queued latest-workspace side-effect commits with workspace identity guards and per-key/per-cookie delta merging.
- A checked-in Postman/Newman-style fixture corpus covers async ordering, nested `pm.sendRequest`, `pm.execution.runRequest`, `pm.visualizer`, brokered `pm.vault`, bundled package loading, iteration data, cookie scope, variable precedence, execution control, cancellation, skipped requests, and mixed `pm.test` pass/fail behavior.
- Runtime timeouts, script length limits, bounded console capture, and blocked dynamic code generation.
- Node permission flags are enabled for script workers when supported by the pinned Node runtime, with filesystem read access restricted to the minimum core script worker modules.
- Packaged Electron scripting fails closed if required Node permission flags are unavailable; CLI scripting requires the same permission support on Node 22+.
- Linux script workers use a `bubblewrap` OS isolation backend when available, and required validation mode fails closed if that backend is missing. The backend clears the environment, unshares the network and other process namespaces, drops capabilities, provides private writable tmpfs mounts, and exposes required runtime/app/library paths read-only.
- Host-created script API objects, arrays, caught errors, and async results are hardened against constructor/prototype escape paths.
- Worker child processes start with a minimal environment and bounded V8 old-space limit. `POSTMETER_SCRIPT_WORKER_MAX_OLD_SPACE_MB` can tune the limit between the supported min/max bounds.
- Worker process termination when a script exceeds the parent safety timeout.
- `npm run sandbox:validate` verifies the pinned Electron runtime's permission model, Linux OS-sandbox filesystem/network denial where applicable, and adversarial sandbox-boundary checks.
- `npm run sandbox:validate:packaged` runs the same checks through a built desktop executable to catch packaging-specific permission/path and Linux OS-backend issues.
- Unsupported Postman sandbox APIs and package-library entries outside the bundled allowlist fail with explicit errors until their broker/storage/package models are implemented.

Known gaps:

- Full Postman sandbox APIs are not implemented yet. Highest-impact remaining parity gaps include full Postman package-library parity, collection/request-level vault grant UX, full visualizer Handlebars helper/partial parity, and more exhaustive Postman protocol-profile behavior.
- Native Windows and macOS syscall-policy backends are not implemented yet; those platforms currently rely on the child process, Node permission flags, hardened `vm` runtime, and broker boundary until platform backends are added and validated.
- Load tests do not execute request pre-request scripts or test scripts.

## Load Testing

Supported:

- Local request-count and duration modes.
- Concurrency, ramp-up, target arrival-rate scheduling, global rate caps, policy-decision reporting, single-process or bounded multi-process execution, high-concurrency confirmation, cancellation, progress, latency summaries, histograms, optional capped samples, JSON/CSV export.
- Multi-process execution merges worker summaries without retaining every raw sample in the parent process, and worker child processes inherit only a minimal environment.

Known gaps:

- No distributed execution.
- Pre-request and test scripts are skipped during load tests; sandbox v1 keeps scripted load testing out of scope.
- No advanced cross-machine policy governance beyond target arrival-rate scheduling, local rate caps, local policy-decision reporting, and bounded request/concurrency/duration/process controls.
