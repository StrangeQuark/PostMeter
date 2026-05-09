# PostMeter Compatibility Matrix

Use this document when you need the exact supported surface for imports, exports, scripting, and compatibility boundaries.

PostMeter aims for practical compatibility with common API-client formats, with the Postman script import profile now tracked by a generated claim gate.

The source-owned non-Postman production matrix is committed at `docs/non-postman-compatibility-matrix.json` and generated from `src/core/productionSupportMatrices.js`; validate it with `npm run compatibility:non-postman:validate`.

Unless a section says otherwise, non-Postman formats are compatibility bridges for practical import/export workflows, not source-format-perfect round trips or full external engine clones.

## Native PostMeter

Supported:

- Workspace import/export, including filesystem-discovered managed workspaces, exporting the current workspace or another managed workspace from the Workspaces list, and non-destructive native workspace import in the desktop UI.
- Collection import/export, including desktop collection-picker export that still opens with an explicit empty-state warning when no collections exist, and native collection export defaults of `<collection-name>.json`.
- Collections, folders, requests, assertions, scripts, auth metadata, environments, globals, history, cookies, request examples, variables, certificates, package-cache metadata, vault grant metadata, mock scripts, visualizer binding metadata, GraphQL/gRPC/protocol metadata, file-binding metadata, and light/dark/system theme preference.

Planned:

- Local first-class saved performance tests under `workspace.performanceTests`, independent from Collections and Runners.
- Native Performance-test import/export preserving each saved test's request copy, source metadata, selected environment ID, environment mutation policy, execution policy, safety limits, result-retention metadata, and export metadata.

Known gaps:

- Native files are JSON only.
- Performance-test import/export validates native PostMeter performance-test payloads, rejects malformed or unsafe payloads, and keeps imported request copies out of Collections unless the user later creates a collection request explicitly.

## Postman Collections

Supported on import:

- Collection name.
- Collection variables, including raw Postman variable metadata for round-trip export.
- Nested folders and requests, including mixed request/folder item order from the Postman export.
- Request method, URL, query params, headers, disabled params/headers, raw JSON/text body.
- Bearer, Basic, API key, and OAuth 2.0 auth import where Postman fields map cleanly to PostMeter auth helpers.
- Outbound OAuth 2.0 runtime support includes authorization-code PKCE, device code, refresh-token renewal, client credentials where applicable, loopback/custom-scheme callbacks, token-endpoint redirect refusal, provider-error redaction, and a local certification corpus for Google/Microsoft/GitHub provider behavior.
- Common `prerequest` and `test` event scripts from collection, folder, and request scopes, while preserving original event location, script type, and script text for Postman export.
- Original Postman request IDs where present, deterministic fallback IDs where they are absent, and alias resolution for `pm.execution.runRequest`, `pm.execution.setNextRequest`, `pm.info.requestId`, and `pm.execution.location.requestId`.
- Local mock `mock` event scripts where exported, including saved example IDs used by `pm.mock.sendExample`.
- Request examples from `item.response`, editable in the request Examples tab.
- Request cookies from `request.cookie`; enabled named cookies are promoted to a Cookie header, and desktop import promotes Cookie headers into the local cookie jar when the request URL has a concrete host.
- Imported Postman HTTP requests enable cookie-jar sends and response-cookie storage by default to match Postman runner behavior.
- Cookie metadata from enabled Postman cookie objects is preserved in request metadata and used during desktop import promotion for domain/path/expires/expiresAt/expirationDate/maxAge/httpOnly/secure/SameSite/host-only/priority/partitioned/source fields, prefix-constrained cookie names, and extension hints when provided. Browser-style numeric `expirationDate` values and string boolean flags are normalized where practical.
- Raw Postman `request.cookie` objects are preserved for source-format export, including duplicate names across paths/domains, disabled cookies, unknown/vendor fields, original expiry field variants, host-only flags, SameSite/Priority/Partitioned attributes, extensions, and prefix cookie names.
- The runtime cookie jar applies IDNA hostname normalization, public-suffix rejection for response `Domain` attributes, host/path/secure matching, case-sensitive cookie names, default path derivation, expiry and deletion handling, browser-style path-length then creation-order header sorting, Secure requirements for `SameSite=None` and `Partitioned`, and response-cookie storage across followed redirect hops.
- Request/item variables as request-local variables.
- Collection-level certificates where host/path matching can be represented safely and does not overwrite explicit request auth.
- Protocol profiles, GraphQL/gRPC definitions, auth inheritance metadata, package references, cookie allowlists, vault metadata, visualizer assets, mock state metadata, file/binary body references, examples, and certificates are preserved in bounded Postman compatibility metadata for round-trip export and binding workflows.

Supported on export:

- Postman Collection v2.1 JSON through `Export > Postman`.
- Round-trips preserved script text, script type, event location, request/example/certificate IDs where exported by Postman, variables and raw variable metadata, examples, certificates, protocol metadata, auth metadata, body modes including file/binary references, imported raw `request.cookie` source objects, and imported package/cookie/vault/mock/visualizer binding metadata.

Known gaps:

- OAuth 2.0 auth import maps common token/client fields, but not every Postman grant/client-auth option.
- Imported examples can be edited, duplicated, deleted, captured from live responses, and exported as request example JSON.
- Cookie jar import is best-effort when cookie metadata is only available as a request header. Disabled imported Postman cookies are preserved for Postman export but are not promoted to active Cookie headers or the local cookie jar, and unknown raw cookie fields are preserved for export rather than interpreted by PostMeter's jar model.
- Collection certificates are imported into PostMeter's single request-auth model only where safe.
- The default script import profile is claim-gated for Postman sandbox parity by `npm run postman:parity:claim`; stricter workspace settings can still disable brokered capabilities for locked-down environments.

## OpenAPI

Supported:

- OpenAPI/Swagger JSON and YAML import.
- Server URL, server variables, paths, methods, tags-as-folders, path/query/header/cookie parameters, and request body examples.
- Local `$ref` entries are resolved for common parameters, request bodies, responses, response headers/examples, and security schemes.
- Path parameter conversion between OpenAPI `{id}` and PostMeter `{{id}}`.
- Binary request-body media hints are preserved as request-local metadata while keeping the request body editable.
- Common HTTP bearer, HTTP basic, header/query/cookie API key, and OAuth 2.0 security-scheme import.
- Swagger 2.0 `body` and `formData` request parameters are imported into editable request bodies where representable.
- Response examples are imported as editable request examples when inline examples are present.
- Response status/header metadata is imported as disabled assertions so users can opt in without making every documented response code fail a run.
- OpenAPI 3.1 JSON export for collections, including query/header/cookie parameters and mappable PostMeter auth helpers as security schemes.

Known gaps:

- Schema examples are best-effort.
- Device-code OAuth export uses PostMeter vendor extensions because OpenAPI does not define a device-code flow.

## curl

Supported:

- Common curl command import for URL, method, headers, data flags, cookies, multipart-ish form flags, and proxy/retry/TLS metadata.
- Basic-auth flags, user-agent/referer headers, repeated headers, redirect/compressed/insecure flags, `--url-query`, `-G` query-data mode, repeated data flags, and binary/file upload intent are imported where representable.
- Collection export to readable curl commands, including PostMeter basic auth and preserved redirect/compressed/insecure/binary metadata when present.

Known gaps:

- Shell expansion and complex quoting edge cases are not fully modeled.
- Multipart, proxy, retry, redirect, compression, file-upload, and TLS flags are preserved as request data/metadata, not executed with full curl-equivalent transport semantics.

## HAR

Supported:

- HAR 1.2 request entry import.
- HAR request headers, query params, request cookies, post data, and request body encoding metadata import where present.
- HAR response status/headers/body/cookies import as request examples. Response cookies become `Set-Cookie` example headers with common path/domain/expires/max-age/httpOnly/secure/SameSite/Priority/Partitioned attributes when present.
- HAR timing, redirect URL, response body encoding, and compression metadata import as request-local variables.
- Collection export as a HAR 1.2 log containing request entries, with request cookies derived from `Cookie` headers.
- HAR export redacts privacy-sensitive `Authorization`, `Proxy-Authorization`, `Cookie`, and `Set-Cookie` header/cookie values by default; bodies are exported as authored because PostMeter cannot reliably identify arbitrary secret fields in payloads.

Known gaps:

- Full browser cache entries, browser page metadata, security details, and nonstandard HAR cookie fields are not fully modeled. HAR cookie import/export remains a practical bridge: request cookies are represented as `Cookie` headers, response cookies become example `Set-Cookie` headers for common attributes, and sensitive cookie values are redacted on export.

## XML And HTML

Supported:

- XML response bodies are formatted in the response viewer when the content type or body shape indicates XML.
- HTML response bodies are formatted in the response viewer when the content type or body shape indicates HTML.
- XML XPath assertions and XML value extraction run in collection and CLI workflows.
- HTML CSS selector assertions and HTML text extraction run in collection and CLI workflows.

Known gaps:

- HTML selector assertions check parsed text content; they do not perform full browser layout, JavaScript execution, or accessibility-tree validation.

## Scripting

Sandbox contract: see `docs/SANDBOX_CONTRACT.md`. The list below describes the current implementation.

Supported:

- Synchronous pre-request and test scripts in single request sends and collection runs.
- Postman-style `pm.test` behavior in the isolated worker runtime, including sync callbacks, callback-style async, promise-returning callbacks, mixed callback/promise completion, skipped tests, duplicate names, `pm.test.index`, nested async test registration, deterministic result ordering, and skipped-result metadata.
- A broad Chai-compatible `pm.expect` and bundled `chai` facade covering common BDD chains, negation, deep/nested/ordered membership, type/property/length/throw assertions, `chai.assert` helpers, `chai.should()` basics, response assertion helpers, response JSON-schema validation, and arbitrary-value `pm.expect(...).to.have.jsonSchema(...)`. Exact upstream Chai failure text is not treated as a sandbox-boundary requirement.
- `pm.environment`, `pm.collectionVariables`, true workspace `pm.globals`, `pm.variables`, and `pm.iterationData` with Postman-style precedence, `clear` where supported, `toJSON` metadata preservation, disabled-variable behavior, request/folder/local variables, iteration-data unset, and documented dynamic variables through `pm.variables`/`replaceIn`.
- Request URL/header/body/auth interpolation resolves normal variables and documented Postman dynamic variables, including `$guid`, `$timestamp`, `$isoTimestamp`, `$randomUUID`, and the documented `$random*` catalog.
- Brokered `pm.sendRequest`, current-URL `pm.cookies`, and `pm.cookies.jar()` helpers are enabled by default for Postman import parity; workspace settings can disable script network requests or script cookie access for stricter environments. `pm.sendRequest` supports URL strings, plain objects, SDK `Request` objects, header object/array/list inputs, common body modes, user-granted file/binary/form-data attachment bindings, common auth helpers, brokered Digest/Hawk/AWS Signature v4/OAuth 1.0 auth, NTLM challenge/response, Akamai EdgeGrid signing, JWT Bearer token generation, ASAP signing, configured client-certificate bindings, brokered HTTP(S) proxy routing, strict TLS validation, manual redirect mode, timeout/cancellation, callback/promise forms, final URL reporting, followed-redirect response-cookie capture, and staged cookie-jar side effects. Primary request auth mutations may select configured client-certificate bindings by `certificateId`; script-provided direct certificate, key, PFX/P12, CA, or passphrase fields are ignored or rejected before local certificate files can be read.
- `pm.execution.setNextRequest`, pre-request-only `pm.execution.skipRequest` with remaining pre-request code halted, array-shaped `pm.execution.location` with string `.current`, and bounded brokered `pm.execution.runRequest` for collection-local request IDs/names/Postman request links, variable overrides, referenced scripts, referenced test reporting, skip-to-null behavior, and a 10-call per-script limit. Post-response scripts intentionally do not expose `pm.execution.skipRequest`, so calling it fails the post-response script without canceling an already-sent response.
- `pm.visualizer.set()` and `pm.visualizer.clear()` with bounded JSON data and a patched Handlebars 4.7-compatible runtime covering escaped/raw interpolation, blocks, block params, data variables, parent/root lookup, whitespace behavior, helpers/block helpers, dynamic partials, inline partials, decorators, partial blocks, compile/runtime options, `Handlebars.compile`, `Handlebars.precompile`, `Handlebars.template`, `Handlebars.create`, `Handlebars.SafeString`, inline scripts in an isolated iframe, `pm.getData(callback)`, sanitized output, integrity-checked reviewed JS/CSS assets, and renderer/Electron/Node isolation.
- `pm.vault.get()`, `pm.vault.set()`, and `pm.vault.unset()` through explicit workspace, collection, or request grants, denial overrides, parent broker, encrypted per-workspace local vault file, bounded values/operations, mutation audit metadata, workspace UI for local secret binding, metadata refresh, reset, and audit review, plus metadata-only desktop prompts for request, collection, workspace, deny, and reset decisions during single-request sends, collection runs, and nested request lifecycle execution. Concurrent prompts are serialized in the renderer so each broker prompt resolves against its own prompt ID and prompted workspace, and the main process accepts prompt responses only from the prompting renderer. Denied/cancelled prompts fail the vault call so code after that call does not run. Secret values, vault paths, encryption keys, ciphertext, storage handles, and secret enumeration are never exposed to scripts or the renderer prompt.
- Postman documented script globals including URL/URLSearchParams, Web Crypto digest/random helpers, `TextEncoder`/`TextDecoder`, `atob`/`btoa`, Blob/File, structuredClone, queueMicrotask, DOM-style abort/event/error objects, Web Stream constructor facades, ECMAScript built-ins, typed arrays, audited direct/indirect `eval`, sandboxed `Function` string execution, and a hardened top-level lexical `Buffer` facade inside the isolated VM. WebAssembly, raw fetch/XHR/WebSocket, process access, `globalThis`, browser DOM/storage globals, and constructor-escape access to host handles remain unavailable.
- Bounded `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`, queueMicrotask ordering, async promise drain, and console capture for `log`, `info`, `warn`, `error`, `debug`, `trace`, `time`, `timeEnd`, `group`, and `groupEnd`.
- `pm.require()` and sandbox `require()` for Postman's version-pinned `postman-sandbox@6.2.2` bundled libraries: `ajv`, `backbone`, `chai`, `cheerio`, `crypto-js`, `csv-parse/lib/sync`, `json`, `lodash`, `moment`, `postman-collection`, `tv4`, `uuid`, and `xml2js`; Postman-listed NodeJS module shims/facades for `path`, `assert`, `buffer`, `util`, `url`, `punycode`, `querystring`, `string-decoder`, `stream`, `timers`, and `events`; plus reviewed cached `@team/package`, exact/scoped npm, exact/scoped JSR, and Postman latest-version npm/JSR package bundles with SHA-256 integrity, dependency policy, import-time reference scanning, workspace review UI, and parent-side fetch/review for exact/latest npm/JSR packages plus reviewed HTTPS team-package source URLs. Direct Postman account/provider fetching for team packages is deferred. Host Node modules, `node:` specifiers, filesystem paths, URLs, runtime registry fetches, package installation, and unreviewed packages remain blocked.
- `require('postman-collection')` uses Postman's bundled Collection SDK inside the script VM. `pm.request` and `pm.response` remain hardened PostMeter SDK-style facades for live request/response objects, including URL/query/header/body/auth mutation, metadata/trailers/messages, response cookies, SDK-style list helpers, object-predicate list filtering, and constructor/prototype escape hardening.
- Imported GraphQL requests preserve query, variables, operation name, auth, headers, package imports, and Before query/After response hooks. GraphQL execution is adapted into the normal brokered HTTP sender with JSON body preparation, variable interpolation, response parsing, `pm.info.eventName` values of `beforeQuery` and `afterResponse`, and subscription-style multiple-response normalization into `pm.response.messages` for explicit response message arrays, SSE, multipart GraphQL, JSON arrays, or messages/responses payloads.
- Imported gRPC requests preserve proto/service/method metadata, method path, request metadata, outgoing messages, streaming method type, response metadata, trailers, status, incoming messages, package imports, and Before invoke/On message/After response hooks. The script lifecycle uses a parent-owned `@grpc/grpc-js` transport for unary, client-streaming, server-streaming, and bidirectional-streaming calls; exposes `pm.request.metadata/messages`, `pm.response.metadata/trailers/messages`, `pm.message`, `pm.message.timestamp` as a hardened VM Date object, protocol assertion helpers, message-list assertion helpers, and protocol `pm.info.eventName` values; supports parent-side PEM, encrypted PEM with passphrase, and in-memory PFX/P12 gRPC mTLS material for unary and streaming calls; snapshots proto/TLS/client-certificate transport fields before script execution; and keeps raw sockets, channels, call handles, certificate file reads, private keys, and passphrases outside the script worker.
- Local mock scripts run through a core loopback mock runner with method/path-only matching, `:path` and `{{path}}` variables, saved-example fallback, `pm.mock.matchRequest`, `pm.mock.sendExample`, Express-style `req`/`res` helpers including `req.json()`, `res.status`, `res.set/header`, `res.json`, `res.send`, `res.end`, top-level mock-script `await`/`return`, and `pm.state.get/set/delete/has/keys/size/clear/toObject/increment/push/addToSet`. Mock state is JSON-serializable, bounded, per-session, resettable, brokered through the parent, and committed only when the mock script phase commits. `pm.mock`, `pm.state`, `req`, and `res` remain unavailable outside the local mock surface.
- Queued latest-workspace side-effect commits with workspace identity guards and per-key/per-cookie delta merging.
- A checked-in Postman/Newman-style fixture corpus covers async ordering, nested `pm.sendRequest`, broader `pm.sendRequest` object/SDK/cookie behavior, user-granted file/binary/form-data attachment bindings, SDK request/response/list objects, Step 4 `pm.test`/Chai/variable/dynamic-variable behavior, `pm.execution.location`, `pm.execution.runRequest`, interactive Handlebars `pm.visualizer`, brokered `pm.vault`, bundled packages, reviewed cached packages, multi-file CommonJS package loading, local mock scripts with `pm.mock`/`pm.state`, Postman globals, NodeJS module facades, timers/microtasks, iteration data, cookie scope, variable precedence, execution control, cancellation, skipped requests, and mixed `pm.test` pass/fail behavior.
- A generated Postman sandbox parity matrix is committed at `docs/postman-sandbox-parity-matrix.json`, with source in `src/core/postmanParityMatrix.js`, currently tracking 406 Postman API, method, property, global, module, protocol, fixture, claim-gate, and security-decision rows against the targeted `newman@6.2.2` release.
- A generated official-docs coverage audit is committed at `docs/postman-docs-coverage-audit.json`, with source in `src/core/postmanDocsCoverageAudit.js`, currently mapping 431 extracted Postman script, Postman Collection SDK, package-import, and Newman latest-version tokens from 140 official sources to explicit matrix rows or documented exclusions. `npm run postman:docs:validate` gates the committed artifact, and `npm run postman:docs:live` refetches the current official docs/Newman latest dist-tag to catch upstream drift.
- The current claim-gated parity target is Postman Desktop 11.71.7 with `postman-sandbox@6.2.2` and Postman Runtime 7.50.0, plus Newman 6.2.2 with Postman Runtime 7.39.1 for Newman-compatible surfaces. Future Postman Desktop/Newman releases must pass the docs live sweep, matrix validation, claim gate, and differential/desktop evidence checks before the target version claim is advanced.
- `npm run postman:parity:validate` verifies the committed parity matrix is current, and `npm run postman:parity:diff` runs the HTTP-core, broad, dynamic-host-globals, runtime-limits, HttpOnly-cookies, sendRequest-advanced, and file-binding Newman-compatible PostMeter differential fixtures. Optional live Newman comparison is available with `npm run postman:parity:diff -- --newman --download-newman`; `npm run postman:newman-reports:refresh -- --download-newman` runs the approved live Newman differential and rewrites the checked-in evidence in one explicit network-using step. Checked-in raw Newman, raw PostMeter, and normalized `newman@6.2.2` JSON evidence lives under `test/fixtures/postman/newman-reports/` and is validated by `npm run postman:newman-reports:validate`. The write path accepts only clean source summaries targeting `newman@6.2.2`, Postman Runtime 7.39.1, and the exact approved suite list. The offline validator requires exact suite coverage, no unexpected checked-in JSON files, clean comparison metadata, per-report generation metadata, fresh normalized Newman and PostMeter output, passing PostMeter evidence, no Newman assertion failures, preserved response-shape/body-digest evidence and console output when present, and normalized evidence free of concrete localhost ports, local filesystem paths, generated request IDs, generated Postman request tokens, generated multipart boundaries, time-derived request signatures, machine names, and machine-specific metadata. `npm run postman:parity:claim` is the production claim gate for the default Postman import profile and currently passes with zero default-import blockers. Implemented behavior-sensitive Desktop rows require row-specific `rowEvidence` metadata during parity validation.
- Implemented desktop-required parity rows now reference a completed installed Postman Desktop 11.71.7 runtime/source audit fixture, and the matrix validator rejects implemented desktop-required rows that rely only on the observation template.
- `HttpOnly` cookie behavior now matches the observed Postman/Newman default-import profile: script-visible `pm.cookies` and `pm.cookies.jar()` helpers expose in-scope `HttpOnly` values, jar replacement/unset/clear operations can affect `HttpOnly` cookies, and brokered `pm.sendRequest` response-cookie jar updates preserve readable `HttpOnly` values. Workspace settings can still disable script cookie access entirely.
- Runtime timeouts now use the audited Postman Runtime 180-second default global budget as PostMeter's per-script/request safety budget. Script length, worker heap, broker payloads, `pm.sendRequest` response bodies, final results, console capture, visualizer output, package-cache entries, mock state, and workspace payloads remain explicitly bounded production resource ceilings where Postman/Newman expose no stable equivalent caps and rely on host process limits. These ceilings are documented local safety policy for host-exhaustion-sized payloads rather than unsupported Postman script APIs.
- Node permission flags are enabled for script workers when supported by the pinned Node runtime, with filesystem read access restricted to the exact worker/runtime modules, dynamic-variable and variable-scope helpers, reviewed package-cache helper, and the pinned Postman package bundle needed by script execution.
- Packaged Electron scripting fails closed if required Node permission flags are unavailable; CLI scripting requires the same permission support on Node 22+.
- Linux script workers use a `bubblewrap` OS isolation backend when available, and required validation mode fails closed if that backend is missing. The backend clears the environment, unshares the network and other process namespaces, drops capabilities, provides private writable tmpfs mounts, exposes required runtime/app/library paths read-only, and installs a seccomp cBPF policy that denies high-risk kernel APIs including `bpf`, `ptrace`, keyring, module-loading, mount, process-memory, performance-event, `io_uring`, and nested namespace syscalls such as `unshare`, `setns`, and `clone3`.
- Host-created script API objects, arrays, caught errors, and async results are hardened against constructor/prototype escape paths.
- Worker child processes start with a minimal environment and bounded V8 old-space limit. `POSTMETER_SCRIPT_WORKER_MAX_OLD_SPACE_MB` can tune the limit between the supported min/max bounds.
- Worker process termination when a script exceeds the parent safety timeout.
- `npm run sandbox:validate` verifies the pinned Electron runtime's permission model, Linux OS-sandbox filesystem/network denial and seccomp-policy launch state where applicable, and adversarial sandbox-boundary checks.
- `npm run sandbox:validate:packaged` runs the same checks through a built desktop executable to catch packaging-specific permission/path issues and platform OS-backend behavior on Linux, Windows, and macOS runners.
- Platform OS sandbox completion is tracked separately from Postman API parity in `docs/os-sandbox-platform-matrix.json`, generated from `src/core/osSandboxPlatformMatrix.js`. `npm run sandbox:platform:validate` keeps the matrix current; `npm run sandbox:platform:claim` must pass before PostMeter claims equivalent full OS sandbox coverage across Linux, Windows, and macOS. Linux uses `bubblewrap` plus seccomp, Windows uses the release-owned AppContainer helper, and macOS uses a deny-default seatbelt launcher path with explicit process-exec/process-fork denial; native runner packaging rows still provide the required release evidence.
- Host-only APIs that Postman does not expose to scripts, unreviewed package loading, native modules, filesystem paths, `node:` specifiers, runtime registry fetches, raw sockets, raw browser network globals, process access, WebAssembly, and renderer/Electron access fail with explicit errors. Current Postman WebSocket and Socket.IO request docs do not document saved/importable script hooks, so PostMeter records that as an audited no-script surface instead of inventing incompatible WebSocket hook behavior.

Known gaps:

- Keep `npm run postman:parity:claim`, `npm run postman:docs:validate`, and a current `npm run postman:docs:live` sweep green before preserving the tracked Postman script import claim; future Postman/Newman changes should be added as explicit matrix rows. Native OS sandbox coverage is separate platform-security work tracked by `npm run sandbox:platform:claim` and is not part of the Postman API parity claim.
- Linux's current `bubblewrap` plus dangerous-syscall seccomp policy is accepted for the current Linux claim; a maintained deny-by-default seccomp-BPF allowlist is optional future hardening.
## Performance

Status:

- The legacy local Load Test panel, runtime, result formatting, and JMeter import/export path have been removed.
- PostMeter supports local first-class saved Performance tests for seven explicit types: Latency, RPS / throughput, Concurrency, Stress, Spike, Soak, and Ramp.
- Performance request import is a deep-copy operation from Collections. Performance edits do not mutate collection requests.
- Manual request entry creates the same local request-copy shape without source collection metadata.
- Environment behavior is copy-vs-mutate: saved environments remain unchanged unless the Performance test explicitly allows environment mutation.
- Request, runner-owned request, and Performance request editors support Postman-style body modes for none, raw text/JavaScript/JSON/HTML/XML, form-data text/file references with automatic file part content-type detection, x-www-form-urlencoded rows, and binary file references. GraphQL body editing remains tracked as follow-up work.

Known gaps:

- Distributed/cloud load execution remains deferred.
- JMeter import, export, conversion, or execution is not supported.
