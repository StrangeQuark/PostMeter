# PostMeter Script Sandbox Contract

This document is the target contract for production-grade request scripting. It is the source of truth for sandbox implementation work; `docs/COMPATIBILITY.md` remains the user-facing current-support matrix.

Status: Postman-import compatibility contract. The current runtime implements the brokered async subset described here in `src/core/scriptRuntime.js`, `src/core/scriptSandbox.js`, and `src/core/scriptWorker.js`, with a Linux `bubblewrap` OS isolation backend plus seccomp cBPF syscall policy layered around script workers when available or required. The product target is for imported Postman pre-request and test scripts to run on the first try wherever PostMeter can provide equivalent behavior without giving scripts direct host filesystem, process, shell, Node, Electron, or renderer access.

## Goals

- Execute untrusted pre-request and test scripts without exposing Electron, renderer, Node, filesystem, process, shell, native module, or app-internal privileges.
- Provide a Postman-compatible sandbox for single-request sends, collection runs, and CLI collection runs, prioritizing direct execution of imported Postman scripts.
- Keep load-test scripting out of the production sandbox v1 contract. Load tests must continue to use the direct HTTP sender unless a later explicit "scripted load test" contract is written.
- Make every privileged script capability available only through a brokered, validated message protocol.
- Preserve deterministic completion, cancellation, side-effect, and error-reporting behavior across desktop and CLI execution.
- Prefer Postman parity implemented through explicit brokers, validators, stores, and isolated renderers over compatibility gaps. When parity is not yet implemented, the unsupported behavior must be documented as a compatibility gap and tracked toward implementation.

## Non-Goals

- Do not loosen the worker's direct OS, Node, Electron, renderer, shell, or filesystem privileges to achieve compatibility.
- Do not add a PostMeter account, cloud login, or account gate.
- Do not let scripts read arbitrary local files, process environment variables, workspace files, Electron APIs, renderer DOM APIs, or Node modules.
- Do not let scripts spawn processes, open native dialogs, register protocol handlers, load native modules, or modify app settings directly.
- Do not run pre-request or test scripts during load tests in sandbox v1.

## Threat Model

Untrusted inputs:

- Imported Postman collections and native workspaces that contain scripts.
- User-edited scripts copied from external sources.
- Collection, environment, global, request-local, and iteration variables used by scripts.
- Response bodies, headers, cookies, and `pm.sendRequest` responses consumed by scripts.
- Malformed or hostile worker-process messages.

Protected assets:

- Workspace JSON, managed workspace paths, session state, app settings, and history.
- Environment variables, collection variables, globals, request-local variables, and iteration data.
- OAuth access tokens, refresh tokens, client credentials, authorization URLs, token URLs, and device-code values.
- Cookie jar entries, especially `HttpOnly`, `Secure`, and domain/path-scoped cookies.
- Client certificate paths, private-key paths, PFX paths, CA paths, and passphrases.
- Host process environment variables, local filesystem contents, Electron main process, renderer process, and preload APIs.

Primary risks:

- Code execution escape from the JavaScript sandbox.
- Data exfiltration through `pm.sendRequest`.
- Secret leakage through logs, visualizer output, result exports, or error messages.
- Denial of service through infinite loops, unbounded async scheduling, log flooding, large payloads, nested requests, or worker crashes.
- Workspace corruption through ambiguous variable, cookie, or request mutation commits.
- Races from overlapping request sends, collection runs, or future scripted load tests.

Security rule: a script is never trusted because it came from a local file. Imported and local scripts use the same sandbox boundary. Postman-compatible APIs may be enabled by default, but they must remain brokered and bounded; no setting may widen the worker's process privileges.

## Execution Surfaces

| Surface | Sandbox v1 behavior |
| --- | --- |
| Single request send | Runs pre-request script, sends the request if pre-request succeeds, then runs test script. Commits allowed completed-phase side effects back to the workspace. |
| Desktop collection runner | Runs the same pre-request/send/test lifecycle for each request. Supports runner control APIs such as `pm.execution.setNextRequest`, `pm.execution.skipRequest`, and brokered `pm.execution.runRequest`. |
| CLI collection runner | Runs the same collection-run sandbox contract as desktop. Reports side effects in results but does not persist input files. |
| Load testing | Does not execute scripts in sandbox v1. If the active request has scripts, UI/results/docs must make the skip explicit. |
| Desktop session recovery | Restores editors and run results only. It must not resume partially completed scripts or broker operations. |

## Script Compatibility And Consent

Baseline execution:

- User action to send a request or run a collection is consent to execute the script in the sandbox with Postman-compatible APIs that PostMeter implements safely: `pm.test`, `pm.expect`, variable APIs, request/response inspection and supported mutation, bounded console output, async primitives, brokered `pm.sendRequest`, brokered `pm.execution.runRequest`, and brokered cookie helpers.
- The default experience should favor imported Postman scripts running without manual settings changes.

Compatibility controls:

- Workspace settings may disable specific Postman-compatible brokered APIs such as script network requests or script cookie access for stricter environments.
- Disabling a compatibility API must fail closed with a clear script error.
- The settings UI must describe the concrete risk: scripts may read workspace variables/tokens/cookies visible to the sandbox and send data to arbitrary HTTP(S) endpoints allowed by the broker.
- Future per-collection/request/script-digest trust can be added for stricter environments, but the default import path should remain Postman-compatible.

No trust setting may grant direct filesystem, Node, Electron, renderer, shell, or process access.

## Runtime Isolation Contract

The production runtime must provide these properties:

- User script code runs outside the Electron main process.
- Worker processes start with a minimal environment and no inherited secrets such as `NODE_OPTIONS`, app-specific credentials, or arbitrary user environment variables.
- Worker V8 heap, execution wall time, console output, broker payload size, and final result size are bounded.
- Dynamic string code generation and WebAssembly code generation are disabled unless a future contract explicitly changes this.
- Node module loading, `process`, filesystem, child process, native module, arbitrary `fetch`, `XMLHttpRequest`, `WebSocket`, and raw networking are unavailable in the script context.
- Host-created bridge objects, functions, arrays, errors, and async results exposed to scripts are hardened so scripts cannot reach the worker's host constructors through `constructor`, prototype, caught-error, or promise paths.
- Any worker file-read allowlist is the minimum runtime bundle needed for script execution, not the whole repository or all of `src/core`.
- Packaged Electron script workers require Node permission flags and fail closed when the pinned runtime cannot enforce them. CLI runs require the same on the supported Node 22+ baseline.
- On Linux, script workers run through a `bubblewrap` backend when available. Required mode fails closed if `bubblewrap` is missing. The backend clears the environment, unshares user, PID, IPC, network, UTS, cgroup, and mount namespaces, disables nested user namespaces, drops capabilities, exposes only private `/tmp` and `/run` writable filesystems, bind-mounts required runtime/app/library paths read-only, and installs a seccomp cBPF policy that denies high-risk kernel surfaces such as `bpf`, `ptrace`, keyring calls, module loading, mount APIs, `process_vm_*`, `perf_event_open`, `io_uring`, and nested namespace/mount syscalls.
- Linux script workers do not receive host network namespace access. All HTTP(S) script traffic must continue to go through the parent-owned broker.
- Native Windows and macOS syscall-policy backends require separate platform implementations before PostMeter can claim equivalent OS-level coverage on those platforms.
- If required isolation primitives are unavailable on a platform or packaged runtime, the app must disable production sandbox scripting or downgrade the compatibility claim. It must not silently run with weaker privileges.

`node:vm` alone is not considered a complete production security boundary. The current production boundary is layered: OS sandbox where implemented, child process, Node permission flags, hardened `vm` values, and parent-owned brokered capabilities.

## Broker Protocol Contract

All privileged operations go through a parent-owned broker. The worker receives no direct implementation handles.

Protocol requirements:

- Every message has a protocol version, execution ID, operation type, and correlation ID.
- The parent validates every worker request before acting on it.
- The worker validates every parent response before using it.
- Unknown, malformed, oversized, late, duplicate, or out-of-order messages fail the current execution.
- Each script execution has exactly one final result. Duplicate final results are ignored and recorded as protocol violations.
- Cancellation aborts pending broker operations and prevents late worker messages from committing side effects.
- Brokered HTTP responses, cookie snapshots, variables, logs, test results, visualizer outputs, and errors have explicit size caps.

Required broker capabilities for sandbox v1 implementation:

- Timer scheduling and cancellation.
- Async completion tracking.
- Bounded `pm.sendRequest`.
- Cookie read/mutation operations for the current URL scope.
- Runner execution control and bounded collection-local `pm.execution.runRequest`.
- Bounded `pm.visualizer` result capture for isolated UI rendering.
- Explicitly granted, brokered `pm.vault` access backed by an encrypted local vault store.
- Bundled allowlisted package loading for safe Postman import compatibility.
- Iteration data reads.
- Final result and side-effect commit reporting.

## Completion And Cancellation

Completion rules:

- Scripts complete only after synchronous execution, queued microtasks, pending supported timers, async `pm.test` callbacks, and brokered operations have settled or reached a configured drain deadline.
- The runtime must maintain a bounded count of pending timers, pending microtasks, pending tests, and pending brokered requests.
- A script that schedules work forever fails with a deterministic timeout error.
- Console output after completion or cancellation is ignored.

Cancellation rules:

- Cancelling a request send, collection run, CLI run, or owning process aborts the active script worker.
- Pending `pm.sendRequest` operations receive the same cancellation signal where possible.
- No side effects from an incomplete or cancelled phase are committed.
- Cancellation is reported distinctly from script assertion failure and runtime timeout.

## Side-Effect Transactions

Side effects are committed per phase, not as each script line executes.

| Phase result | Commit behavior |
| --- | --- |
| Phase completes with all tests passing | Commit allowed variable, cookie, and pre-request mutation side effects. |
| Phase completes with one or more failed `pm.test` assertions | Commit allowed side effects, mark the phase failed. A failed pre-request phase prevents the HTTP request from being sent. |
| Uncaught top-level error outside `pm.test` | Do not commit side effects from that phase. |
| Async callback throws outside `pm.test` | Do not commit side effects from that phase. |
| Timeout, cancellation, worker crash, protocol violation, or oversized result | Do not commit side effects from that phase. |

Pre-request request mutations are only applied if the pre-request phase completes. Test-script request mutations are ignored for the already completed HTTP request.

Collection-run and desktop persistence commits use queued latest-workspace mutations with workspace identity guards. Variable and cookie side effects are merged as per-key/per-cookie deltas so unrelated newer user edits are preserved; when the same key or cookie identity is changed concurrently, the later committed sandbox transaction wins.

## Variable Model

Target resolution order for `pm.variables.get` and `pm.variables.replaceIn`:

1. Request-local/runtime local variables.
2. Iteration data for the current collection-run row.
3. Active environment variables.
4. Active collection variables.
5. Workspace globals.

Scope behavior:

- `pm.variables.set` writes to the request-local/runtime local scope.
- `pm.environment` reads and writes the active environment only.
- `pm.collectionVariables` reads and writes the active collection only.
- `pm.globals` is a real workspace-level persisted scope. It must not alias collection variables.
- Disabled variables are invisible to reads and replacements.
- Missing variables return `undefined`; unresolved `{{name}}` placeholders remain unchanged.
- CLI runs may report mutated environment, collection, local, and global scopes in the run result, but must not rewrite input files unless a future explicit CLI persistence flag is added.

Workspace schema implication: production `pm.globals` requires a new explicit workspace field such as `globals`, plus migrations, validation, IPC payload support, import/export behavior, and UI affordances.

## Request Mutation Contract

Target pre-request mutations:

- Method, URL, query parameters, headers, and body may be mutated only through supported request APIs or explicit brokered request-delta messages.
- The parent validates the final outbound request with the same URL scheme, header, body, auth, and size rules as normal sends.
- Only HTTP and HTTPS URLs are valid.
- Request mutations that would require unsupported transports, arbitrary file reads, or shell behavior fail the pre-request phase.

Non-goals for sandbox v1:

- Test-script request mutations affecting a completed send.
- Mutating app settings, runner config, workspace paths, request examples, or UI state from scripts.

## Cookie Contract

- Normal request execution may send cookie jar cookies when the request's cookie jar setting is enabled.
- `pm.cookies` exposes only cookies in scope for the current request URL, and `pm.cookies.jar()` supports brokered jar-style operations for explicit HTTP(S) URLs or hostnames.
- Cookie domain, path, expiry, `Secure`, prefix, and SameSite validation must reuse the shared cookie model.
- `HttpOnly` cookie values are not readable through `pm.cookies` in sandbox v1. The sender may still use them for HTTP requests when the jar is enabled.
- Cookie writes from scripts are staged and committed only when the phase transaction commits.
- Brokered `pm.sendRequest` does not mutate the shared cookie jar unless the broker operation explicitly permits jar usage.

## `pm.sendRequest` Contract

`pm.sendRequest` is a brokered compatibility API. It never exposes raw networking primitives to the worker and is enabled by default for Postman import parity unless the workspace disables script network requests.

Required behavior:

- Supports callback and promise-style completion.
- Accepts Postman-style URL strings and bounded request objects that can map to PostMeter's request model.
- Allows only HTTP and HTTPS URLs.
- Applies header validation, body limits, redirect limits, timeout limits, response body limits, and cancellation propagation.
- Captures response status, headers, body, timing, final URL, and size in a script-safe response object.
- Limits nested and concurrent `pm.sendRequest` calls per script execution.
- Reports broker errors as failed async operations without crashing the parent process.

Security restrictions:

- No arbitrary filesystem reads for request bodies or TLS material.
- No client-certificate auth in sandbox v1 brokered requests.
- No persisted OAuth refresh side effects from brokered requests in sandbox v1.
- No implicit inheritance of the active request's auth helper unless a future contract explicitly allows it.
- No access to Node `fetch`; all network access goes through the broker.

## `pm.execution.runRequest` Contract

`pm.execution.runRequest` is a brokered collection-run compatibility API. It is enabled by default for Postman import parity unless the workspace disables script network requests.

Required behavior:

- Supports promise-style completion in collection and CLI collection runs.
- Resolves request targets by collection-local request ID or request name.
- Supports bounded variable overrides for the referenced request.
- Runs the referenced request through the same pre-request/send/test lifecycle and returns a script-safe response object, or `null` when the referenced request skips itself.
- Carries environment, collection, global, and cookie side effects back into the calling script only through the broker response.
- Reports referenced request test results on the caller result.
- Enforces a per-script `runRequest` call limit, collection-run total call limit, nesting-depth limit, normal request validation, response body cap, cancellation propagation, and side-effect transaction rules.

Security restrictions:

- No cross-workspace, arbitrary file, Node, or shell target resolution.
- Referenced `pm.execution.setNextRequest` calls do not alter the caller's collection-run order.
- Side effects from referenced requests commit only if the caller phase itself commits.

## `pm.visualizer` Contract

`pm.visualizer` is a safe-rendering compatibility API. Scripts can capture a bounded visualization result, but the rendered document never runs with PostMeter renderer privileges.

Required behavior:

- Supports `pm.visualizer.set(template, data)` and `pm.visualizer.clear()`.
- Clones visualizer data through JSON serialization so script objects and accessors do not cross the host boundary.
- Enforces caps for template length, serialized data size, rendered HTML length, loop expansion, and template block nesting.
- Supports escaped `{{value}}`, raw `{{{value}}}`, and a bounded Handlebars-style block subset: `{{#each}}`, `{{#if}}`, `{{#unless}}`, `{{#with}}`, `{{else}}`, `{{this}}`, `{{@index}}`, `{{@key}}`, `{{@root}}`, parent lookup with `../`, and object-field lookups.
- Captures the latest visualizer output in the script result for the request that produced it.
- Renders output in a sandboxed iframe with a restrictive document CSP.

Security restrictions:

- Does not execute script tags or inline event handlers.
- Does not allow external image, link, script, worker, frame, or network loads from visualizer output.
- Does not provide the visualizer document access to Electron, Node, PostMeter renderer state, cookies, storage, or the parent DOM.
- Does not implement arbitrary Handlebars helpers, partials, custom JavaScript helpers, or remote assets unless a future contract adds a reviewed extension model.

## `pm.vault` Contract

`pm.vault` is a brokered secret-access compatibility API. It is disabled by default and only becomes available when the workspace explicitly grants script vault access.

Required behavior:

- Supports promise-style `pm.vault.get(key)`, `pm.vault.set(key, value)`, and `pm.vault.unset(key)`.
- Executes all vault operations in the parent broker; the worker receives no vault file path, encryption key, or storage handle.
- Stores vault data outside the workspace JSON export path in a per-workspace vault file.
- Encrypts vault values with Electron `safeStorage` in desktop builds and fails closed if OS-backed encryption is unavailable or Electron selected the Linux `basic_text` backend.
- Enforces secret key, secret value, secret count, and per-script vault operation limits.
- Records bounded audit metadata for vault mutations without recording secret values.

Security restrictions:

- Workspace import/export does not include vault ciphertext or plaintext.
- Scripts cannot enumerate vault secret values, access vault storage paths, or bypass the broker with Node filesystem/process APIs.
- Current grant scope is workspace-wide. Collection/request-level vault grants and a reset/audit UI are still future UX work before claiming full Postman grant parity.
- Newman/Postman CLI compatibility is not expected for `pm.vault`; this is treated as Postman desktop sandbox parity.

## Package Loading Contract

`pm.require()` and sandbox `require()` are compatibility package loaders, not Node module loaders.

Required behavior:

- Supports a manifest-driven bundled allowlist for common Postman imports: `ajv`, `chai`, `cheerio`, `crypto-js`, `csv-parse/lib/sync`, `lodash`, `moment`, `postman-collection`, `uuid`, and `xml2js`.
- Provides global `CryptoJS` and `_` aliases for legacy Postman scripts.
- Caches packages per script execution and hardens returned package objects/functions before exposing them to user code.
- Keeps package loading synchronous and local; it never reaches the filesystem, shell, network, npm registry, or host Node resolver from script code.

Security restrictions:

- Rejects `node:`, `npm:`, `jsr:`, relative/absolute paths, URLs, backslash paths, team Package Library specifiers, and any package not on the allowlist.
- Does not expose Node `require`, Node built-ins, package installation, package update, transitive dependency loading, or user-controlled package paths.
- Full Postman Package Library and external registry parity remains deferred until there is a reviewed signed/cacheable package model for user/team packages and exact external package versions.

## API Target Matrix

| API or behavior | Sandbox v1 target |
| --- | --- |
| `pm.test` | Support sync, callback-style async, and promise-returning callbacks with deterministic completion. |
| `pm.expect` | Continue practical Chai-style subset; expand only with compatibility fixtures. |
| `pm.info` | Provide event name, request ID/name, iteration index/count, collection/run IDs where available. |
| `pm.variables` | Support target resolution order and local writes. |
| `pm.environment` | Read/write active environment. |
| `pm.collectionVariables` | Read/write active collection variables. |
| `pm.globals` | Supported through true workspace globals. No aliasing. |
| `pm.request` | Read in both phases; support validated pre-request mutation deltas. |
| `pm.response` | Available only in test scripts and `pm.sendRequest` callbacks/results. |
| `pm.sendRequest` | Brokered, bounded HTTP(S) requests enabled by default for Postman import parity; workspace settings may disable. |
| `pm.cookies` | Brokered current-URL and jar-style cookie helpers enabled by default for Postman import parity; `HttpOnly` values hidden; workspace settings may disable. |
| `pm.execution` | Support collection-run control such as next-request/skip semantics where applicable, plus bounded brokered `runRequest` in collection runs. No-op or unsupported in single-send/test surfaces where not meaningful. |
| `pm.iterationData` | Read-only current iteration data in collection/CLI runs; empty in single request sends. |
| `pm.visualizer` | Supported through bounded template/data capture, a safe Handlebars-style subset, sanitization, and sandboxed iframe rendering. Custom helper/partial/interactive visualizer parity is deferred. |
| `pm.vault` | Supported through explicit workspace grant, brokered async operations, encrypted per-workspace local storage, bounded values/operations, and mutation audit metadata. Collection/request grants and UI management are deferred. |
| `pm.require` or package loading | Supports bundled facades for common Postman built-ins: `ajv`, `chai`, `cheerio`, `crypto-js`, `csv-parse/lib/sync`, `lodash`, `moment`, `postman-collection`, `uuid`, and `xml2js`; direct Node/external package loading remains forbidden. Full team Package Library and external registry parity is deferred. |
| Timers | Support bounded `setTimeout`/`clearTimeout`; `setInterval` is unsupported unless a future bounded interval contract is written. |
| Promises and microtasks | Support with bounded drain rules. |
| `console` | Bounded capture only; never direct process logging. |
| `eval`, `Function`, WebAssembly | Unsupported. |
| Node globals and browser network globals | Unsupported except for safe ECMAScript built-ins and brokered APIs. |

## Load-Test Decision

Sandbox v1 does not execute request scripts during load tests.

Rationale:

- Per-sample script execution changes load-test resource, timing, and result semantics.
- Scripted load tests need separate budgets for worker processes, script workers, broker requests, cookie merging, variable mutation aggregation, and result sampling.
- Silent partial support would make load results misleading.

Required product behavior before claiming Postman-compatible production sandbox readiness:

- Documentation must state that load tests skip pre-request and test scripts.
- UI and exported load results should surface that scripts were skipped when the active request contains scripts.
- A future scripted load-test feature must get its own contract before implementation.

## Error Reporting

Script results must report:

- Phase: `preRequest` or `test`.
- Pass/fail/cancelled/timeout/protocol-error state.
- Bounded top-level error message.
- Ordered test results with names, pass/fail state, and bounded error messages.
- Bounded console entries.
- Bounded broker operation errors.
- Whether side effects were committed or discarded.

Errors must not include secrets from protected assets unless the script explicitly logged them and the user consent/trust model allowed the relevant read. Even then, result payload size limits still apply.

## Verification Requirements

Contract compliance requires:

- Compatibility fixtures for async ordering, promise and timer completion, failed async callbacks, nested `pm.sendRequest`, `pm.execution.runRequest`, variable precedence, globals, iteration data, cookie scope, request mutation, cancellation, and mixed assertion failures.
- Golden fixtures from Postman/Newman-style runs where practical.
- The checked-in Postman/Newman-style sandbox corpus lives under `test/fixtures/postman` and must continue to run through the normal Postman importer and collection runner.
- Adversarial tests for constructor/prototype escape attempts, dynamic code generation, Node/global access, filesystem/process access, log flooding, large payloads, recursive scheduling, malformed broker messages, duplicate final results, late messages, worker crashes, and oversized results.
- Desktop single-send, desktop collection-run, CLI, and packaged-runtime coverage.
- `npm run sandbox:validate` must pass against the pinned Electron runtime, including permission-model probes, Linux OS-sandbox filesystem/network-denial and seccomp-policy launch probes where applicable, and adversarial bridge-escape checks.
- `npm run sandbox:validate:packaged` must pass against built desktop executables before release, including packaged path and ASAR behavior.
- Packaged Linux assertions must prove the OS sandbox backend still works after packaging. Windows and macOS assertions must cover their native OS sandbox backends once those backends exist.

The sandbox may be called production-ready only when the implementation, docs, compatibility matrix, and verification suite all match this contract. Full Postman script compatibility may be claimed only when `docs/COMPATIBILITY.md` no longer lists unsupported Postman script APIs for the supported import surface.
