# PostMeter Script Sandbox Contract

This document is the target contract for production-grade request scripting. It is the source of truth for sandbox implementation work; `docs/COMPATIBILITY.md` remains the user-facing current-support matrix.

Status: Postman-import compatibility contract and parity burn-down plan. The current runtime implements the brokered async subset described here in `src/core/scriptRuntime.js`, `src/core/scriptSandbox.js`, and `src/core/scriptWorker.js`, including the Step 2 Postman global surface, Step 3 SDK facades, Step 4 test/variable/run-order behavior, Step 5 brokered network/cookie/package/visualizer/vault work, Step 6 GraphQL/gRPC protocol hook lifecycle work, Step 7 local mock script work, Step 8 Postman import/export preservation work, Step 9 production-claim gating/adversarial/real-world corpus work, separate OS-sandbox platform tracking, full isolated Handlebars visualizer parity, and live parent-owned desktop gRPC transport execution, with a Linux `bubblewrap` OS isolation backend plus seccomp cBPF syscall policy layered around script workers when available or required. The product target is for imported Postman scripts to run on the first try wherever PostMeter can provide equivalent behavior without giving scripts direct host filesystem, process, shell, Node, Electron, or renderer access.

## Goals

- Execute untrusted pre-request and test scripts without exposing Electron, renderer, Node, filesystem, process, shell, native module, or app-internal privileges.
- Provide a Postman-compatible sandbox for single-request sends, collection runs, CLI collection runs, and every Postman script surface that can be represented in imported data, prioritizing direct execution of imported Postman scripts.
- Treat the official Postman Sandbox API reference, Postman script run-order documentation, and the latest Newman release targeted by the compatibility corpus as the minimum compatibility surface. Full import parity means the same observable request mutations, HTTP traffic, response parsing, variable/cookie/vault side effects, visualizer output, test names/order/results, console output shape, and script errors for the supported imported artifact.
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
- Do not claim complete Postman script import parity from the currently implemented HTTP subset alone.

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
- Strict security mode may disable dynamic string code generation. Full Postman import parity mode matches Postman's current JavaScript global behavior for direct eval, indirect eval, and safe `Function` execution inside the hardened worker context. WebAssembly remains disabled unless Postman exposes it and this contract is updated with equivalent limits.
- Host Node module loading, `process`, filesystem, child process, native module, arbitrary `fetch`, `XMLHttpRequest`, `WebSocket`, and raw networking are unavailable in the script context. Postman-listed NodeJS modules are exposed only through bounded compatibility facades, not through host Node handles.
- Host-created bridge objects, functions, arrays, errors, and async results exposed to scripts are hardened so scripts cannot reach the worker's host constructors through `constructor`, prototype, caught-error, or promise paths.
- Any worker file-read allowlist is the minimum runtime bundle needed for script execution, not the whole repository or all of `src/core`.
- Packaged Electron script workers require Node permission flags and fail closed when the pinned runtime cannot enforce them. CLI runs require the same on the supported Node 22+ baseline. The read allowlist is limited to the script worker, script runtime, dynamic-variable helper, variable-scope helper, reviewed-package cache/integrity helper, VM-only Postman built-in package loader, and generated pinned Postman sandbox bootcode bundle.
- On Linux, script workers run through a `bubblewrap` backend when available. Required mode fails closed if `bubblewrap` is missing. The backend clears the environment, unshares user, PID, IPC, network, UTS, cgroup, and mount namespaces, disables nested user namespaces, drops capabilities, exposes only private `/tmp` and `/run` writable filesystems, bind-mounts required runtime/app/library paths read-only, and installs a seccomp cBPF policy that denies high-risk kernel surfaces such as `bpf`, `ptrace`, keyring calls, module loading, mount APIs, `process_vm_*`, `perf_event_open`, `io_uring`, and nested namespace/mount syscalls.
- Linux script workers do not receive host network namespace access. All HTTP(S) script traffic must continue to go through the parent-owned broker.
- Native Windows and macOS syscall-policy backends require separate platform implementations before PostMeter can claim equivalent OS-level coverage on those platforms.
- Platform-equivalent OS sandbox completion is tracked separately from Postman API parity in `docs/os-sandbox-platform-matrix.json`, generated by `src/core/osSandboxPlatformMatrix.js`. `npm run sandbox:platform:validate` proves the matrix is current; `npm run sandbox:platform:claim` must pass before claiming full OS sandbox coverage across tier-one desktop platforms.
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
- Bundled allowlisted package loading plus reviewed cached exact team/external package bundles for safe Postman import compatibility.
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
- Imported Postman HTTP requests enable cookie-jar sends and response-cookie storage by default for Postman runner parity.
- `pm.cookies` exposes only cookies in scope for the current request URL, and `pm.cookies.jar()` supports brokered jar-style operations for explicit HTTP(S) URLs or hostnames.
- Cookie domain, path, expiry, `Secure`, prefix, and SameSite validation must reuse the shared cookie model.
- In the default Postman import profile, `HttpOnly` cookie values are readable through `pm.cookies` and `pm.cookies.jar()` because current Postman/Newman expose them to scripts. Stricter deployments can disable script cookie access at the workspace capability gate.
- Cookie writes from scripts are staged and committed only when the phase transaction commits.
- Brokered `pm.sendRequest` does not mutate the shared cookie jar unless the broker operation explicitly permits jar usage.

## `pm.sendRequest` Contract

`pm.sendRequest` is a brokered compatibility API. It never exposes raw networking primitives to the worker and is enabled by default for Postman import parity unless the workspace disables script network requests.

Required behavior:

- Supports callback and promise-style completion.
- Accepts Postman-style URL strings, plain request objects, and Postman Collection SDK `Request` objects that can map to PostMeter's request model.
- Allows only HTTP and HTTPS URLs.
- Applies header validation, body limits, redirect limits, timeout limits, response body limits, and cancellation propagation.
- Captures response status, headers, body, timing, final URL, and size in a script-safe response object.
- Limits nested and concurrent `pm.sendRequest` calls per script execution.
- Reports broker errors as failed async operations without crashing the parent process.

Security restrictions:

- No arbitrary filesystem reads for request bodies or TLS material; file/binary body references and certificate files must come from explicit imported/user-configured bindings handled by the parent request broker.
- Client-certificate auth is brokered through configured certificate paths; scripts never receive file handles or file contents.
- No persisted OAuth refresh side effects from brokered requests in sandbox v1.
- No implicit inheritance of the active request's auth helper unless a future contract explicitly allows it.
- No access to Node `fetch`; all network access goes through the broker.
- Current implementation status: `pm.sendRequest` normalizes URL strings, plain objects, SDK `Request` JSON, header object/array/list-like inputs, raw/urlencoded/form-data-text/GraphQL/inline file body forms, user-granted file/binary/form-data attachment bindings, common bearer/basic/API-key/OAuth2 auth helpers, brokered Digest challenge retry, Hawk, AWS Signature v4, OAuth 1.0 signing, configured client-certificate bindings, brokered HTTP(S) proxy options, manual redirect mode, timeout/cancellation signals, callback/promise completion, response final URL, and shared cookie-jar side effects. NTLM and Akamai EdgeGrid auth helper metadata is imported/exported and classified as advanced stateful transport follow-up outside the cleared sandbox API rows. Script-provided certificate/key/PFX paths, TLS validation disable switches, and arbitrary unbound local file/binary bodies fail closed with explicit errors.

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

- Supports `pm.visualizer.set(template, data, options)` and `pm.visualizer.clear()`.
- Clones visualizer data through JSON serialization so script objects and accessors do not cross the host boundary.
- Enforces caps for template length, serialized data size, rendered HTML length, loop expansion, helper/partial/decorator count, reviewed asset count, and reviewed asset size.
- Supports real Handlebars 4.7-compatible visualizer compilation in an isolated runtime: escaped `{{value}}`, raw `{{{value}}}`, blocks, block params, data variables, parent/root lookup, whitespace behavior, helpers, block helpers, dynamic partials, inline partials, partial blocks, decorators, `SafeString`, compile options, runtime helper/partial/decorator options, `Handlebars.compile`, `Handlebars.precompile`, `Handlebars.template`, `Handlebars.create`, and `Handlebars.escapeExpression`.
- Uses `handlebars@4.7.9` as the patched 4.7-compatible line for the visualizer runtime. Postman Desktop 11.71.7 was audited with `handlebars@4.7.8`; PostMeter does not vendor the exact 4.7.8 package because current npm advisories cover `<=4.7.8`.
- Allows inline visualizer scripts only inside the isolated visualizer document so imported Postman visualizers can call `pm.getData(callback)` and render client-side charts from the JSON-cloned visualizer data.
- Captures the latest visualizer output in the script result for the request that produced it.
- Renders output in a sandboxed iframe with `allow-scripts`, no `allow-same-origin`, and a restrictive document CSP.

Security restrictions:

- Does not preserve inline event handlers.
- Does not allow external script, worker, frame, object, media, connection, form, or network loads from visualizer output. Image loads are limited to `data:` URLs by the visualizer document CSP.
- Does not provide the visualizer document access to Electron, Node, PostMeter renderer state, cookies, storage, or the parent DOM.
- Does not allow remote visualizer libraries/assets unless they are provided through the reviewed asset/cache model; no visualizer output can perform unreviewed runtime network loads.

## `pm.vault` Contract

`pm.vault` is a brokered secret-access compatibility API. It is disabled by default and only becomes available when the workspace, collection, or request explicitly grants script vault access.

Required behavior:

- Supports promise-style `pm.vault.get(key)`, `pm.vault.set(key, value)`, and `pm.vault.unset(key)`.
- Executes all vault operations in the parent broker; the worker receives no vault file path, encryption key, or storage handle.
- Stores vault data outside the workspace JSON export path in a per-workspace vault file.
- Encrypts vault values with Electron `safeStorage` in desktop builds and fails closed if OS-backed encryption is unavailable or Electron selected the Linux `basic_text` backend.
- Enforces secret key, secret value, secret count, and per-script vault operation limits.
- Supports workspace, collection, and request grants with explicit collection/request denial overrides. Denials win over workspace-wide grants.
- Records bounded audit metadata for vault mutations without recording secret values.
- Provides desktop workspace UX for local secret binding, metadata refresh, reset, and audit review. These operations are parent-side IPC operations and never expose vault paths, encryption keys, or secret enumeration APIs to scripts.

Security restrictions:

- Workspace import/export does not include vault ciphertext or plaintext.
- Scripts cannot enumerate vault secret values, access vault storage paths, or bypass the broker with Node filesystem/process APIs.
- Newman/Postman CLI compatibility is not expected for `pm.vault`; this is treated as Postman desktop sandbox parity. Local binding is PostMeter's desktop import-time substitute for external vault provider integrations unless a future provider-specific contract is added.

## Package Loading Contract

`pm.require()` and sandbox `require()` are compatibility package loaders, not Node module loaders.

Required behavior:

- Supports a manifest-driven bundled allowlist for common Postman imports from the generated, version-pinned `postman-sandbox@6.2.2` browser bundle: `ajv`, `backbone`, `chai`, `cheerio`, `crypto-js`, `csv-parse/lib/sync`, `json`, `lodash`, `moment`, `postman-collection`, `tv4`, `uuid`, and `xml2js`.
- Supports Postman-listed NodeJS module facades for `path`, `assert`, `buffer`, `util`, `url`, `punycode`, `querystring`, `string-decoder`, `stream`, `timers`, and `events`. These facades must be implemented or wrapped as script-safe compatibility objects; they must not expose host filesystem, process, environment, native stream handles, or host constructors.
- Supports reviewed package-cache entries for exact team-style package specifiers (`@team/package`) and exact external registry specifiers (`npm:package@version` and `jsr:package@version`).
- Requires every reviewed package-cache entry to include source and matching `sha256-...` integrity metadata before scripts can load it.
- Imports and scans Postman script package references across HTTP, GraphQL, gRPC, and mock script surfaces into a workspace-visible review flow so missing or unpinned team/external package references are visible before execution.
- Provides a parent-side fetch-and-review workflow for exact public npm packages, exact public JSR packages, and team Package Library-style packages whose source is provided through a reviewed HTTPS source URL. The fetch workflow runs through Electron IPC in the parent process, enforces HTTPS, registry/source host policy, redirect limits, size limits, npm tarball entrypoint selection, JSR checksum verification, and SHA-256 cache integrity before any package can be saved.
- Enforces package count, source byte size, dependency count, dependency depth, and export key limits. Duplicate package entries, missing reviewed dependencies, circular dependencies, and attempts to override bundled packages fail closed.
- Allows cached packages to synchronously require only bundled packages/facades or dependencies declared in their reviewed package manifest.
- Provides global `CryptoJS` and `_` aliases for legacy Postman scripts.
- Caches packages per script execution. Reviewed package-cache exports are hardened before exposure; Postman's bundled package exports preserve their VM-realm prototypes so real library internals continue to behave like Postman, with host `process`, filesystem, Electron, raw network, and host Node resolution still absent.
- Keeps package loading synchronous and local; it never reaches the filesystem, shell, network, npm registry, or host Node resolver from script code.

Security restrictions:

- Rejects direct `node:`, relative/absolute paths, URLs, backslash paths, unreviewed `npm:`/`jsr:`/team specifiers, and any package not on the bundled facade allowlist, Postman-compatible Node facade list, or reviewed package cache.
- Does not expose Node `require`, Node built-ins, package installation, package update, transitive dependency loading, or user-controlled package paths.
- Scripts cannot fetch, install, update, or resolve packages from registries at runtime. Online package workflows run outside script execution and populate the same reviewed cache/integrity model.

## Full Postman Import Parity Completion Plan

Full Postman script import compatibility for the supported default import profile is complete when every item in this section is implemented, documented, covered by golden/differential fixtures, and `npm run postman:parity:claim` reports zero default-import blockers. This section records the completed profile and the evidence that must stay current as the sandbox evolves.

Claim gate:

- The default import profile must prefer Postman-compatible behavior over intentionally narrow behavior. Stricter workspace settings may disable brokered APIs, but the default path for an imported Postman collection should run without manual policy changes.
- Full parity is measured by observable output: executed script order, request mutation, network calls, response objects, variable/cookie/vault state, visualizer render data, mock output, test result names/order/pass/fail/skip state, console entries, and thrown errors.
- Desktop-only Postman APIs such as `pm.vault`, `pm.mock`, and `pm.state` are validated against current Postman Desktop behavior. Newman-incompatible APIs must remain documented as desktop-only while still working in PostMeter's desktop import profile.
- Newman-compatible behavior targets the latest published Newman release used by the corpus, currently `newman@6.2.2`, for APIs that Newman supports.
- Extra compatibility support for older common Postman scripts is allowed, such as legacy `CryptoJS`, but extra support must not widen worker privileges or break current Postman behavior.

Source-of-truth and audit work:

- Maintain a generated parity inventory from the official Postman Sandbox API reference pages: overview, variables, vault, cookies, request, response, sendRequest, visualizer, test/expect, require/globals/modules, execution, message, info, mock, and state.
- The generated inventory source lives in `src/core/postmanParityMatrix.js`; the committed machine-readable output is `docs/postman-sandbox-parity-matrix.json`. Regenerate it with `npm run postman:parity:write`, validate structure/staleness with `npm run postman:parity:validate`, and validate the full 1:1 compatibility claim with `npm run postman:parity:claim`.
- Maintain a second inventory from observed Postman Desktop and Newman runs for behavior not fully specified in docs: error text, callback ordering, async drain timing, duplicate test names, skipped-test result shape, console formatting, JSON parse errors, request mutation edge cases, and package module quirks.
- Each inventory row must have an implementation status, a golden fixture, a differential fixture, and a security decision. No row may be "assumed compatible".
- Rows that require Postman Desktop observation must have a completed observation artifact, automated desktop-runner result, or installed Desktop runtime/source audit artifact before they can be marked complete. The checked-in desktop observation template is not evidence by itself, and the parity validator rejects implemented desktop-required rows that rely only on the template.
- The broad compatibility claim must be backed by real Postman/Newman differential runs across representative and obscure fixtures, not only by synthetic PostMeter-only golden outputs.

JavaScript runtime and global parity:

- Implement the full Postman global object set exposed in scripts: ECMAScript standard objects, typed arrays, `ArrayBuffer`, `SharedArrayBuffer` if Postman exposes it on the target runtime, `Intl`, `Promise`, `Proxy`, `Reflect`, DOM-style `AbortController`, `AbortSignal`, `DOMException`, `Event`, `EventTarget`, encoding globals `atob`, `btoa`, `TextEncoder`, `TextDecoder`, encoder/decoder streams, `Blob`, `File`, `structuredClone`, `queueMicrotask`, Web Streams constructors, `URL`, `URLSearchParams`, and Web Crypto `crypto`, `Crypto`, `CryptoKey`, and `SubtleCrypto`.
- Match Postman's dynamic code behavior for direct eval, indirect eval, and `Function` only inside the isolated worker context. The default parity profile allows sandboxed dynamic string execution while keeping `Function`-created code and constructor escapes unable to see host process, raw network, or lexical `Buffer` bindings; escape regressions must stay in the release gate.
- Match timer behavior for `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, and the `timers` module facade with script-safe limits, cancellation, async drain semantics, and deterministic timeout failures.
- Match console method surface and formatting closely enough for imported script debugging and differential output: `log`, `info`, `warn`, `error`, `debug`, `trace`, `time`, `timeEnd`, `group`, `groupEnd`, and object formatting caps.
- Keep raw browser/network globals unavailable unless Postman exposes them for the target script surface. Network compatibility is provided through `pm.sendRequest`, protocol-specific request execution, and brokered APIs.
- Measure Postman Desktop and Newman behavior for script timeout, async drain limits, console size, package-source size, visualizer size, and other resource ceilings. Stricter PostMeter limits that affect normal imported script behavior are default-import claim blockers. Limits that protect host IPC, renderer, storage, or worker memory from exhaustion can be part of the supported import profile only when they are audited, documented as local production resource policy, and covered by adversarial tests.
- Current implementation status: Postman Desktop 11.71.7 / postman-runtime 7.50.0 and `newman@6.2.2` / postman-runtime 7.39.1 both default to a 180000 ms global timeout with request and script timeouts set to Infinity; postman-sandbox enforces a finite script timeout only when the runtime passes one. PostMeter uses 180000 ms as the default per-script/request safety budget and fixture-covers async timer drain below that budget. PostMeter retains explicit worker heap, broker payload, `pm.sendRequest` response body, final result, console, visualizer, package-cache, mock-state, and workspace payload caps as documented production resource policy because Postman/Newman expose no stable equivalent caps and rely on host process limits for those channels. Those ceilings no longer represent unsupported Postman script APIs for the supported default import profile; host-exhaustion-sized payloads remain security/adversarial cases.

Module and package parity:

- Replace partial facades with version-pinned behavior for every supported sandbox library: `ajv` with Postman's JSON Schema behavior, `chai`, `cheerio`, `csv-parse/lib/sync`, `lodash`, `moment`, `postman-collection`, `uuid`, and `xml2js`.
- Add script-safe facades for Postman-listed NodeJS modules: `path`, `assert`, `buffer`, `util`, `url`, `punycode`, `querystring`, `string-decoder`, `stream`, `timers`, and `events`.
- Implement `Buffer` compatibility through the `buffer` facade and the audited Postman-style top-level lexical `Buffer` binding. `Buffer` must remain absent from `Function('return this')()` and `Function`-created code, matching the current Postman/Newman sandbox profile.
- Implement CommonJS semantics expected by Postman packages: module caching, `module.exports`, `exports`, dependency resolution within reviewed package bundles, default export interop patterns used by npm and JSR packages, circular dependency behavior, and error behavior.
- Build package-cache management outside script execution: import package references, resolve package source, review/pin exact versions, store integrity metadata, show cache status in UI, and block script execution with a clear error when a referenced package is missing.
- Continue blocking runtime package installation, registry fetches, path loading, native modules, and host Node resolution from scripts.
- Current implementation status: PostMeter vendors a generated `postman-sandbox@6.2.2` browser bootcode bundle at `src/core/postmanSandboxBootcodeBundle.js`, verifies the inflated artifact against a checked-in SHA-256 digest, executes it inside the script VM with Browserify entry modules disabled, captures its internal package resolver, restores PostMeter's allowlisted `require`, and exposes only normalized bundled package names through the existing package policy. Ajv, Chai, Cheerio, CryptoJS, csv-parse/lib/sync, Lodash, Moment, Postman Collection SDK, UUID, XML2JS, and legacy JSON/TV4/Backbone package surfaces now come from Postman's pinned bundle. `stream` and `timers` remain PostMeter script-safe facades with brokered timer behavior because the raw Browserify shims assume ambient window/timer behavior. Reviewed exact `@team/package`, `npm:package@version`, and `jsr:package@version` cache entries support SHA-256 integrity, normalized multi-file bundles, package metadata entrypoints, package.json directory entrypoints, local relative modules, `.js`/`.cjs`/`.mjs`/`.json` resolution, reviewed dependency aliases and subpaths, module caching, circular dependencies, `module.exports`/`exports`, `module.require`, `require.resolve`, `__filename`, `__dirname`, default export object patterns, dependency caps, source/file/package caps, duplicate/missing dependency denial, and deterministic cannot-resolve errors. Missing imported package references are detected, shown for review, and can be resolved through parent-side exact npm/JSR fetch or reviewed HTTPS team-package source URLs before first run. The former `require.pm.commonjs-bundle-semantics` claim blocker is cleared.

Collection SDK object parity:

- Use the official Postman Collection SDK directly inside the sandbox if it can be safely bundled, or implement faithful facades for the SDK classes Postman scripts receive: `Request`, `Url`, `Header`, `HeaderList`, `QueryParam`, `QueryParamList`, `RequestBody`, `FormParam`, `Variable`, `VariableList`, `Cookie`, `CookieList`, `Response`, and `PropertyList`.
- Support common SDK methods and semantics used by imported scripts: `get`, `has`, `all`, `idx`, `each`, `map`, `filter`, `add`, `append`, `prepend`, `upsert`, `remove`, `clear`, `toObject`, `toJSON`, `toString`, `clone`, disabled-item filtering, case-insensitive headers, multi-value headers, URL path/query mutation, and safe object identity behavior.
- Match Postman's immutability rules. For example, request body mutation must follow the behavior Postman exposes for that script surface; if Postman treats a body object as immutable in a protocol, PostMeter must do the same rather than accepting extra mutations.
- Preserve generated SDK object prototypes enough for scripts that check constructors or call SDK helper methods, while preventing prototype/constructor escape to host objects.
- Current implementation status: `require('postman-collection')` now resolves to Postman's bundled Collection SDK from the pinned VM bundle. Live `pm.request` and `pm.response` still use hardened PostMeter SDK-style facades because they are transaction-aware views over PostMeter request/response state. Those facades cover SDK-style list operations, URL/query/header/body/auth mutation, `clone`/`toJSON`/`toString`, disabled-item filtering, case-insensitive and multi-value headers, response cookies from `Set-Cookie`, metadata/trailers/messages, protocol request metadata/messages, `pm.message`, and adversarial constructor/prototype escape tests. File/binary body resolution remains governed by the network parity section; scripts still must not gain arbitrary filesystem reads.

Tests, assertions, and result parity:

- Implement full `pm.test` behavior: chaining return value, `pm.test.skip`, `pm.test.index`, sync callbacks, `done` callbacks, promise-returning callbacks, mixed callback/promise behavior, skipped-result reporting, duplicate names, nested tests from async callbacks, and ordering across timers, microtasks, and brokered callbacks.
- Replace the current practical `pm.expect` subset with a full Chai-compatible assertion surface matching Postman's bundled Chai behavior, including negation, deep/nested/ordered membership chains, type assertions, property assertions, length assertions, throw assertions, `assert` and `should` where exposed by `chai`, and exact failure message compatibility where practical.
- Implement Postman response assertion helpers: `pm.response.to.have.status`, `header`, `body`, `jsonBody`, `jsonSchema`, status-family helpers, `pm.response.to.not.be.error`, `pm.response.to.be.error` if supported, and the chain behavior around `to`, `be`, `have`, and `not`.
- Match JSON schema validation with Postman's documented Ajv version and options behavior, including error propagation and option handling.
- Current implementation status: PostMeter supports deterministic `pm.test` registration order, `pm.test.skip`, `pm.test.index`, duplicate names, skipped-result metadata, sync/callback/promise/mixed callback behavior, nested async tests, a broad Chai-compatible `pm.expect`/`chai.assert` facade, response status/header/body/jsonBody/jsonSchema helpers, and response error/non-error helpers. Exact Chai failure text is matched only where practical and remains a differential-observation refinement item, not a sandbox-boundary exception.

Variable and dynamic variable parity:

- Implement all documented variable methods: `has`, `get`, `set`, `unset`, `replaceIn`, `toObject`, and `clear` for globals, collection variables, and environments; `has`, `get`, `toObject`, `toJSON`, and `unset` for iteration data; and `has`, `get`, `set`, `unset`, `replaceIn`, and `toObject` for local/narrowest-scope variables.
- Match Postman's precedence exactly: global, collection, environment, data, and local from broadest to narrowest, with `pm.variables` returning the narrowest available value and `pm.variables.set` creating local variables for the current request or collection run.
- Preserve Postman variable metadata needed for parity: current value, initial value, type, disabled state, sensitive/secret masking behavior, request variables, folder variables, collection variables, environment variables, globals, and run data variables.
- Implement the full dynamic variable catalog and Faker-based value generation used by Postman, including `$guid`, `$timestamp`, `$isoTimestamp`, `$randomUUID`, and all documented `$random*` categories: text, numbers, colors, internet, IP addresses, names, profession, phone, address, location, images, finance, business, catchphrases, databases, dates, domains, emails, usernames, files, directories, stores, grammar, and lorem ipsum. Dynamic values must resolve through `replaceIn` and through request URL/header/body/auth interpolation with Postman-compatible per-request generation semantics.
- Ensure vault secrets are not accessible through `pm.variables`, matching Postman's separation between variables and `pm.vault`.
- Current implementation status: PostMeter supports scope `clear`/`toJSON` where Postman exposes them, preserves variable metadata in script-visible JSON, ignores disabled variables for script lookup, resolves local/data/environment/collection/global precedence with the narrowest value winning, supports iteration-data unset/JSON behavior, and resolves the documented dynamic variable catalog through `pm.variables`, `replaceIn`, and request interpolation. Dynamic values are generated inside the worker without adding filesystem, process, shell, or raw network privileges.

Execution order and collection-run parity:

- Match script hierarchy and run order for collection, nested folder, and request scripts in both pre-request and post-response phases: collection first, then each parent folder in order, then request; the same hierarchy applies after the response.
- Support GraphQL script phases as Postman names them: Before query and After response.
- Support gRPC script phases as Postman names them: Before invoke, On message, and After response. Before invoke failures must stop the request; On message scripts must run for every incoming streaming message according to the gRPC method type; After response must run when the stream closes, succeeds, fails, or is canceled.
- Match `pm.info` for each surface, including `eventName` values such as `prerequest`, `test`, `beforeInvoke`, `onIncomingMessage`, and `afterResponse`, plus iteration, iteration count, request name, and request ID.
- Match `pm.execution.setNextRequest` by name, ID, and `null`; `pm.execution.skipRequest`; and collection-run branching/loop semantics, including how failures, stops, and skipped requests affect later phases.
- Match `pm.execution.runRequest` behavior: 10 calls per script, request ID/link/name target handling where possible after import, variable override precedence, referenced collection/folder/request script execution, returned `null` when the referenced request skips itself, referenced tests displayed on the caller, and documented restrictions such as referenced `setNextRequest` and visualizer calls not affecting the root request.
- Current implementation status: HTTP pre-request and post-response scripts run in imported collection/folder/request hierarchy order, GraphQL Before query/After response and gRPC Before invoke/On message/After response hooks run through the same isolated worker lifecycle, `pm.info` reports `prerequest`/`test`/`beforeQuery`/`beforeInvoke`/`onIncomingMessage`/`afterResponse` plus iteration and request metadata, `pm.execution.location` reports collection/folder/request location for collection runs, `setNextRequest` and `skipRequest` control collection order, and `runRequest` is brokered with referenced scripts, variable overrides, skip-to-null behavior, caller-visible referenced tests, collection/depth limits, and the Postman 10-call per-script limit.

Request, response, and network parity:

- Expand `pm.request` to full Postman Collection SDK-compatible request access for HTTP, GraphQL, and gRPC: URL, method, method path, headers, query, auth, body, metadata, messages, and protocol-specific fields.
- Support every Postman request body mode that can appear in imports and script-created requests: raw, JSON, text, GraphQL, urlencoded, form-data, file, binary, and no body. File/binary bodies must use an explicit user-granted file reference or imported safe attachment model; scripts must not gain arbitrary filesystem reads.
- Expand pre-request mutation support to every mutation Postman permits, including URL, query, header, method, auth, and body mutations where supported, with parent validation before send.
- Expand `pm.response` to full Postman response access: `text`, `json`, code, status, reason/status text behavior, headers, cookies where exposed, response time, response size, raw/body size behavior, final URL, metadata, trailers, messages, and binary/streaming body behavior.
- Implement `pm.sendRequest` for all Postman request input forms: string URL, plain request object, Postman Collection SDK `Request`, header object/array/list inputs, body mode objects, auth helpers, cookie behavior, redirects, proxy behavior where supported by PostMeter, TLS validation, client certificate matching through brokered configured certificates, timeout behavior, cancellation, callback and promise forms, and response/error object compatibility.
- Decide and document exact cookie-jar side effects for `pm.sendRequest` by matching Postman behavior. If Postman mutates the shared jar for a case, PostMeter must do so through staged broker transactions.
- Current implementation status: the broker now normalizes string/object/SDK request inputs, common headers/body/auth forms, Digest/Hawk/AWS/OAuth1 auth forms, proxy options, redirect and timeout options, configured client-certificate bindings, user-granted imported file/binary/form-data body bindings, response final URLs, and cookie-jar side effects without exposing raw network primitives. Imported file references are bound in workspace settings and read only by the parent sender as approved regular files under the request body cap; Newman live differential coverage exercises imported file/body transport, while focused sandbox tests cover `pm.sendRequest` binding and unbound-path denial because Newman disallows script-originated file uploads. Unsupported transport surfaces fail closed rather than granting scripts raw sockets, arbitrary local files, or TLS policy bypass.

Cookie parity:

- Implement current-request `pm.cookies.has`, `get`, and `toObject` exactly for the current request URL.
- Implement `pm.cookies.jar().set`, `get`, `getAll`, `unset`, and `clear` exactly, including callback ordering, promise/thenable behavior if Postman exposes it, hostname and URL normalization, Cookie object inputs from `postman-collection`, domain/path/default-path rules, expiry/max-age, `Secure`, `HttpOnly`, SameSite, Priority, Partitioned, host-only, prefixes, duplicate replacement, and error handling.
- Match Postman's cookie domain allowlist model. Imported scripts should either import/store Postman's allowlist metadata when available or trigger a PostMeter permission flow that defaults to the least manual friction compatible with imported scripts.
- Verify `HttpOnly` script readability and mutation behavior against current Postman Desktop and Newman before changing cookie policy.
- Current implementation status: current-request helpers and jar helpers match the observed `newman@6.2.2` default-import profile for `HttpOnly` script readability. `pm.cookies.get`/`has`/`toObject` expose in-scope `HttpOnly` values synchronously, `pm.cookies.jar().getAll` returns a CookieList facade, jar set/replacement/unset/clear operations affect `HttpOnly` cookies, and `pm.sendRequest` response-cookie jar updates preserve readable `HttpOnly` values. The installed Postman Desktop 11.71.7 runtime/source audit records matching packaged cookie storage behavior through `postman-runtime` 7.50.0, `postman-collection` 5.2.0, and `@postman/tough-cookie` 4.1.3-postman.1. Script cookie access remains gated by workspace trust settings.

Visualizer parity:

- Match `pm.visualizer.set(layout, data, options)` and `pm.visualizer.clear` with real Handlebars compile semantics, not just a subset, including helpers, partials, decorators if supported, `SafeString`, block params, data variables, parent/root lookup, whitespace behavior, escaping, and compile options.
- Match `pm.getData(callback)` inside the visualizer document, including callback timing and data cloning behavior.
- Support imported visualizers that depend on inline scripts and common charting libraries without granting renderer, Electron, Node, cookie, storage, or parent DOM access. External visualizer assets require a reviewed asset/cache model, deterministic CSP, size limits, and no unreviewed runtime network loads.
- Differential-test rendered HTML and interactive behavior in the isolated visualizer iframe.
- Current implementation status: the visualizer facade uses an integrity-checked `handlebars@4.7.9` browser runtime in a separate visualizer VM context and supports bounded compile/runtime options, helpers, block helpers, partials, dynamic partials, inline partials, custom decorators, `SafeString`, precompiled `Handlebars.template` specifications, block params, data variables, parent/root lookup, escaping/noEscape, inline scripts, `pm.getData`, sanitized iframe rendering, and integrity-checked reviewed JS/CSS assets injected into the isolated visualizer document. Unsafe `constructor`, `prototype`, and `__proto__` data/helper-option paths are stripped before render/callback handoff. Unreviewed external loads remain blocked by sanitizer and iframe CSP.

Vault parity:

- Match Postman's `pm.vault.get`, `set`, and `unset` async Promise behavior, prompt behavior, denial behavior, and "code after vault call does not run" error behavior when access is disabled or denied.
- Implement rich grant management UX for reset, grant, deny, and audit review at workspace, collection, and request levels. Denials must override broader grants.
- Keep vault storage encrypted outside workspace exports. Imported/exported Postman collections must never include vault plaintext or PostMeter vault ciphertext.
- Document desktop-only scope: Postman scheduled runs, monitors, Postman CLI, Newman, GraphQL, and gRPC do not support `pm.vault`; PostMeter must mirror that compatibility boundary unless deliberately adding extra support outside the Postman claim.
- Decide whether external vault integrations are required for parity. If PostMeter does not implement external vault providers, the contract must define an import-time local-secret binding flow that produces the same script outputs without claiming provider integration parity.
- Current implementation status: vault operations are promise-based broker calls with scoped grants and denial overrides, encrypted per-workspace storage, unavailable-encryption fail-closed behavior, bounded audit metadata, and workspace UI for local secret binding, metadata refresh, reset, and audit review. External vault provider integrations are not implemented.

Protocol-specific parity:

- GraphQL imports must preserve query, variables, operation name, auth, headers, scripts, response parsing, and Before query/After response semantics. Package imports through `pm.require` must work in GraphQL scripts.
- gRPC imports must preserve proto/service/method metadata, method path, request metadata, outgoing messages, streaming method type, incoming messages, response metadata, trailers, status, cancellation, and Before invoke/On message/After response script semantics. `pm.request.metadata`, `pm.request.messages`, `pm.response.metadata`, `pm.response.trailers`, `pm.response.messages`, and `pm.message` must expose Postman-compatible `PropertyList` behavior.
- WebSocket or other streaming protocol scripts must be included if Postman exports or documents script hooks for them. If current Postman does not expose script hooks for a protocol, the generated inventory should record that fact with a source link and fixture.
- Current implementation status: GraphQL imports preserve body mode/query/variables/operation name and execute Before query/After response around the brokered HTTP sender. gRPC imports preserve method path, proto/service/method metadata, metadata, outgoing messages, method type, response metadata/trailers/status/messages, and execute Before invoke/On message/After response through a parent-owned `@grpc/grpc-js` transport for unary, client-streaming, server-streaming, and bidirectional-streaming methods. Proto source/path, include dirs, TLS material, client options, and client-certificate auth are snapshotted before Before invoke and remain parent-owned; scripts can mutate metadata, outgoing messages, method path, and target URL through the Postman-compatible request facade, but never receive raw sockets, channels, call handles, filesystem, or TLS/certificate handles. `pm.message` is available only for streaming protocol hook contexts. The generated parity matrix records the current official-docs WebSocket/Socket.IO audit as an implemented no-script surface because Postman does not document saved/importable WebSocket script hooks.

Local mock server parity:

- If PostMeter imports or offers Postman local mock server scripts, implement the mock script surface: request/response objects compatible with Postman's local mock editor, `pm.mock.matchRequest`, `pm.mock.sendExample`, saved-example response lookup, path variable matching, route fallback behavior, and method/path-only matching behavior.
- Implement persistent mock state through `pm.state.get`, `set`, `delete`, `has`, `keys`, `size`, `clear`, `toObject`, `increment`, `push`, and `addToSet`, with JSON-serializable value limits, per-mock-session storage, reset controls, and transaction safety.
- Keep `pm.mock` and `pm.state` unavailable outside the local mock script surface, matching Postman's desktop-only boundary.
- Current implementation status: PostMeter has a core loopback local mock runner in `src/core/localMockServer.js`. Imported `mock` event scripts are preserved, package references in mock scripts are detected, request and saved-example IDs are retained when exported by Postman, and the runner supports method/path-only matching, `:path` and `{{path}}` variables, saved-example fallback, top-level mock-script `await`/`return`, `pm.mock.matchRequest`, `pm.mock.sendExample`, Express-style `req`/`res` helpers, and `pm.state` through parent-brokered operations with per-script operation limits, per-value/session size caps, per-session storage, reset/clear controls, and commit/rollback behavior tied to script phase success. `pm.mock`, `pm.state`, `req`, and `res` are only injected when `context.mock.enabled` is present.

Import/export and data model parity:

- Preserve Postman Collection v2.1 script events at collection, folder, and request levels without flattening away information needed for exact run order, nested folders, request IDs, examples, package references, certificates, auth inheritance, variables, protocol profiles, GraphQL/gRPC definitions, WebSocket definitions if supported, and file/binary body references.
- Preserve and resolve request IDs used by `pm.execution.runRequest`. Because Postman exports may not preserve all IDs, import must provide a deterministic mapping, a repair UI, or name/link fallback that makes imported scripts runnable.
- Import Postman package references and team/external package metadata into the reviewed package-cache workflow. A collection that references packages must show missing packages before execution and allow parent-side fetch/review resolution for supported exact references rather than failing obscurely inside a script.
- Import cookie domain allowlists, vault access metadata, mock scripts, local mock state configuration, and visualizer assets when Postman exports them. If Postman does not export a needed permission or asset, provide a PostMeter binding UI and record the binding in workspace metadata.
- Round-trip exported Postman-compatible collections without losing script text, script type, event location, package references, request IDs where possible, examples, variables, certificates, and protocol metadata.
- Current implementation status: PostMeter stores bounded Postman compatibility metadata on imported collections, folders, requests, examples, and certificates. Import preserves collection/folder/request event locations, original and deterministic Postman IDs, mixed folder/request item order, raw variable metadata, package-reference scan results, cookie/vault/mock/visualizer binding metadata, protocol profiles, GraphQL/gRPC definitions, examples, certificates, auth metadata, and file/binary body references without exposing those local file paths to scripts. Collection runs resolve `pm.execution.runRequest` and `pm.execution.setNextRequest` against regenerated model IDs, original Postman IDs, deterministic fallback IDs, and request names; `pm.info.requestId` and `pm.execution.location.requestId` report the preserved Postman ID when one exists. The desktop app can export Postman-compatible Collection v2.1 JSON through `Export > Postman`, and focused tests cover round-tripping script text/type/location, request/example/certificate IDs, variables, protocol metadata, and imported bindings.

Security requirements for parity work:

- Compatibility work must add facades, brokers, isolated renderers, reviewed caches, and explicit stores. It must not grant direct worker access to host Node, filesystem, environment variables, shell, Electron, renderer DOM, native modules, or raw networking.
- New API surfaces require threat-model entries, broker validation rules, payload/operation limits, cancellation behavior, transaction behavior, and adversarial tests before being marked complete.
- Any intentional security exception from Postman behavior must be explicit, user-facing, and reflected in `docs/COMPATIBILITY.md`. Full parity cannot be claimed while such exceptions affect normal default-import script behavior; documented local resource ceilings for host-exhaustion-sized payloads are treated as production safety policy after audit and adversarial coverage.

Verification required for the full claim:

- Generated docs parity matrix with zero unsupported rows for the supported import surface. `npm run postman:parity:claim` enforces this for default Postman import mode and must pass before a 1:1 Postman script compatibility claim is made.
- The current machine-readable parity inventory is committed at `docs/postman-sandbox-parity-matrix.json` and generated by `src/core/postmanParityMatrix.js`; stale or malformed output fails `npm run postman:parity:validate`.
- Golden corpus for every API category above, including obscure methods and failure paths, not only happy-path examples.
- Differential harness that runs the same fixtures in Postman Desktop where automatable, latest Newman where supported, and PostMeter, then compares observable output. The checked-in HTTP-core, broad, dynamic-host-globals, runtime-limits, HttpOnly-cookies, sendRequest-advanced, and file-binding Newman-compatible differential fixtures run through `npm run postman:parity:diff`, with optional live Newman comparison through `npm run postman:parity:diff -- --newman --download-newman`.
- Protocol fixtures now include `test/fixtures/postman/protocol-script-hooks.collection.json` for GraphQL and gRPC hooks, plus `test/fixtures/postman/desktop-observations/websocket-script-support-audit.json` for the current WebSocket no-script source audit. Local mock coverage lives in `test/fixtures/postman/local-mock-scripts.collection.json`.
- Real-world import corpus from public and user-provided collections covering auth, package imports, dynamic variables, runRequest workflows, cookies, visualizers, vault prompts, GraphQL, gRPC streaming, and local mocks. The first broad representative corpus is checked in at `test/fixtures/postman/real-world-import-corpus.collection.json`.
- Fuzz/adversarial corpus for prototype escape, constructor escape, dynamic code generation, package loader abuse, broker payload mutation, oversized output, infinite async work, hostile visualizer HTML/scripts, mock state abuse, and protocol-stream floods. The first checked-in adversarial tranche is `test/electron/postmanSandboxAdversarial.test.js`.
- Platform matrix for Linux, Windows, and macOS packaged apps, including OS sandbox validation, Node permission validation, and packaged asset/path behavior. The current matrix is committed at `docs/os-sandbox-platform-matrix.json` and is intentionally separate from `docs/postman-sandbox-parity-matrix.json`.

## API Target Matrix

This matrix is the full Postman import parity target. Rows marked as desktop-only or protocol-specific still belong in the contract because Postman users can encounter them when moving complex workspaces, even when Newman does not support them.

| API or behavior | Full parity target |
| --- | --- |
| `pm.test` | Support sync, callback-style async, promise-returning callbacks, chaining return value, `pm.test.skip`, `pm.test.index`, skipped results, duplicate names, nested async tests, and deterministic ordering. |
| `pm.expect` and Chai | Match Postman's Chai-compatible BDD behavior, bundled `chai` package behavior, response assertion chains, JSON schema validation, and practical error messages. |
| `pm.info` | Provide Postman-compatible metadata for HTTP, GraphQL, gRPC, and collection runs, including correct `eventName`, iteration, iteration count, request name, and request ID. |
| `pm.variables` | Support local/narrowest-scope behavior, full precedence, `has`, `get`, `set`, `unset`, `replaceIn`, `toObject`, dynamic variables, and vault separation. |
| `pm.environment` | Support Postman's full environment variable API, including `clear`, metadata preservation, disabled variables, current/initial values, and sensitive-value masking outside script-observable values. |
| `pm.collectionVariables` | Support Postman's full collection variable API, including `clear`, collection/folder/request inheritance interactions, and metadata preservation. |
| `pm.globals` | Support true workspace globals with Postman-compatible methods, metadata, import/export, and no aliasing to collection variables. |
| `pm.iterationData` | Support current iteration data in collection/CLI runs with `has`, `get`, `toObject`, `toJSON`, and `unset` behavior matching Postman. |
| Dynamic variables | Support the full documented Faker-backed catalog and generation semantics wherever Postman resolves variables. |
| `pm.request` | Expose full Postman Collection SDK-compatible request objects for HTTP, GraphQL, and gRPC, including URL, headers, query, body, auth, metadata, messages, method path, mutation rules, and `toJSON`/`toString`/list APIs. |
| `pm.response` | Expose full Postman response objects, including `text`, `json`, code, status text, headers, cookies where exposed, response time, response size, metadata, trailers, messages, binary/streaming handling, and response assertion helpers. |
| `pm.message` | Expose incoming streaming message data and timestamp for gRPC On message scripts with Postman-compatible `PropertyList` behavior. |
| `pm.sendRequest` | Broker all Postman-supported request input forms and callback/promise behavior, including body modes, auth, headers, cookies, redirects, TLS/certificates, cancellation, errors, and response objects. |
| `pm.cookies` | Broker current-request cookie helpers and jar helpers with Postman's domain allowlist, callback ordering, Cookie object handling, cookie metadata, `HttpOnly` parity, and transaction rules. |
| `pm.execution` | Support `setNextRequest`, `skipRequest`, `runRequest`, `location`, run metadata, variable override precedence, referenced-request behavior, and documented desktop/Newman limitations. |
| `pm.visualizer` and `pm.getData` | Match Postman's Handlebars visualizer behavior, options, helpers, partials, `SafeString`, inline scripts, data cloning, timing, isolated rendering, and reviewed external asset strategy. |
| `pm.vault` | Match desktop Postman `get`, `set`, and `unset` Promise behavior, prompt/grant/deny/reset behavior, denied-execution errors, audit metadata, encrypted local storage, and documented unsupported surfaces. |
| `pm.require` | Support team Package Library specifiers, exact external `npm:` and `jsr:` specifiers, package cache/review/fetch workflow, CommonJS behavior, and full bundled library behavior without runtime registry access. |
| Sandbox `require` | Support Postman built-in library names and Postman-listed NodeJS module facades only; reject host Node, paths, URLs, native modules, and unreviewed packages. |
| Postman global objects | Support the full documented global object set, including Web Crypto, URL, streams, encoding, DOM-style abort/event objects, `Blob`, `File`, `structuredClone`, `queueMicrotask`, and safe dynamic code behavior where Postman exposes it. |
| Timers and microtasks | Support `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `queueMicrotask`, promises, async tests, and brokered callbacks with bounded drain/cancellation semantics. |
| `console` | Match Postman's script debugging surface closely enough for differential output while keeping bounded capture and no direct process logging. |
| GraphQL scripts | Support Before query and After response hooks, package imports, variable interpolation, auth/headers, request/response access, and run-order semantics. |
| gRPC scripts | Support Before invoke, On message, and After response hooks, streaming lifecycles, metadata, trailers, messages, cancellation, package imports, and `pm.message`. |
| Local mock scripts | Support mock-editor-only `pm.mock`, `pm.state`, saved examples, path variables, request/response helpers, persistent state, and desktop-only availability. |
| Raw host access | Keep direct filesystem, process, shell, Electron, renderer DOM, native modules, and raw networking unavailable. All privileged behavior remains brokered, validated, and bounded. |

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

- A generated official-docs parity matrix for every Postman sandbox page and every imported protocol surface, with an implementation status, security decision, and fixture link for each row.
- `npm run postman:parity:validate` must pass, proving `docs/postman-sandbox-parity-matrix.json` is current with `src/core/postmanParityMatrix.js` and structurally complete enough to track every API/method/property/global/module/protocol row.
- `npm run postman:parity:claim` must pass before any full 1:1 Postman script compatibility claim. It is intentionally separate from normal validation so future claim blockers remain visible if a regression or new uncovered row is introduced.
- `npm run postman:parity:diff` must pass for the local HTTP-core, broad, dynamic-host-globals, runtime-limits, HttpOnly-cookies, sendRequest-advanced, and file-binding Newman-compatible differential fixtures; `npm run postman:parity:diff -- --newman --download-newman` is the optional live comparison against the targeted `newman@6.2.2` release when network access is available.
- `npm run sandbox:platform:validate` must pass, proving `docs/os-sandbox-platform-matrix.json` is current with `src/core/osSandboxPlatformMatrix.js` and structurally tracks Linux, Windows, macOS, Postman-parity separation, and load-test scripting separation.
- `npm run sandbox:platform:claim` must pass before any platform-equivalent full OS sandbox claim. It is intentionally separate from `npm run postman:parity:claim` and currently fails closed until the Linux deny-by-default seccomp decision and native Windows/macOS backend validation rows are complete.
- Differential fixtures run against current Postman Desktop where automatable, latest targeted Newman where supported, and PostMeter. Differences must be classified as fixed, accepted extra support, or documented intentional security exception.
- Compatibility fixtures for async ordering, promises, timers, intervals, microtasks, callback completion, failed async callbacks, skipped tests, `pm.test.index`, nested `pm.sendRequest`, `pm.execution.runRequest`, variable precedence, dynamic variables, globals, iteration data, cookie scope, request mutation, cancellation, and mixed assertion failures.
- Protocol fixtures for HTTP, GraphQL, gRPC unary/client streaming/server streaming/bidirectional streaming, and any Postman-documented WebSocket script hooks.
- Local mock fixtures for `pm.mock`, `pm.state`, saved-example matching, path variables, and persistent state.
- Package fixtures for every built-in library facade, every Postman-listed NodeJS module facade, reviewed team packages, exact external npm packages, exact external JSR packages, missing packages, circular dependencies, and dependency policy failures.
- Visualizer fixtures for Handlebars compile options, helpers, partials, `SafeString`, inline scripts, `pm.getData`, external asset policy, CSP failures, and interactive rendering.
- Vault fixtures for grant, denial, reset, unavailable encryption, get/set/unset, denied code-after-call behavior, audit metadata, desktop-only scope, and import-time secret binding.
- Golden fixtures from Postman/Newman-style runs where practical.
- The checked-in Postman/Newman-style sandbox corpus lives under `test/fixtures/postman` and must continue to run through the normal Postman importer and collection runner.
- Adversarial tests for constructor/prototype escape attempts, dynamic code generation, Node/global access, package-loader abuse, filesystem/process access, raw networking, log flooding, large payloads, recursive scheduling, malformed broker messages, duplicate final results, late messages, worker crashes, oversized results, hostile visualizer documents, mock-state abuse, and protocol-stream floods.
- Desktop single-send, desktop collection-run, CLI, and packaged-runtime coverage.
- Real-world import corpus coverage from public and user-provided Postman collections, including auth-heavy workflows, package-heavy workflows, runRequest workflows, dynamic variables, cookies, visualizers, vault prompts, GraphQL, gRPC, and local mocks.
- `npm run sandbox:validate` must pass against the pinned Electron runtime, including permission-model probes, Linux OS-sandbox filesystem/network-denial and seccomp-policy launch probes where applicable, and adversarial bridge-escape checks.
- `npm run sandbox:validate:packaged` must pass against built desktop executables before release, including packaged path and ASAR behavior.
- `npm run release:gate` must pass, proving the package scripts and CI/release workflows still include sandbox runtime validation, OS-sandbox platform-matrix validation, packaged validation, parity validation, aggregate `npm run check`, packaged Linux validation, and native Windows/macOS validation hooks.
- Packaged Linux assertions must prove the OS sandbox backend still works after packaging. Windows and macOS assertions must cover their native OS sandbox backends once those backends exist.

The sandbox may be called production-ready only when the implementation, docs, compatibility matrix, and verification suite all match this contract. Full Postman script compatibility may be claimed only when `docs/COMPATIBILITY.md` no longer lists unsupported Postman script APIs for the supported import surface, and `npm run postman:parity:claim` proves the generated parity matrix has zero unsupported rows for default Postman import mode.
