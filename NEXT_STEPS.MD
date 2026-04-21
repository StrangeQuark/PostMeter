# PostMeter Next Steps

## Open Questions Before Further Generation

Please answer these before the next implementation pass:

1. When Electron `safeStorage` is unavailable on a host, should PostMeter fail closed, prompt for a user passphrase, or keep the current plaintext compatibility fallback?
2. Which OAuth 2.0 flow should be implemented next: authorization code with PKCE, device code, or client credentials?
3. Should load-test host allowlists remain per-run inputs, or should they become saved workspace/project-level safety policy?
4. Should exact secret export require a stronger confirmation step, such as typing the workspace name, before public-release hardening?

## Completed This Iteration

- Bumped the workspace data model to schema `4` and added a `secret` flag to key/value rows.
- Added Electron `safeStorage`-backed local secret persistence for known auth secret fields and environment variables marked `Secret`.
- Added workspace and collection export redaction by default, with an Electron confirmation dialog required before exact saved values are exported.
- Implemented OAuth 2.0 refresh-token renewal during request execution when refresh metadata is present and the access token is missing or near expiry.
- Added load-test per-host allowlist enforcement and high-concurrency confirmation at concurrency `50` or higher.
- Added UI controls for environment secret flags and load-test allowed hosts.
- Updated Linux package maintainer metadata to `PostMeter contributors <zacharyzirkle@hotmail.com>` while keeping both AppImage and deb targets.
- Added focused tests for secret encryption/redaction, OAuth refresh, load-test safety, and IPC payload validation updates.
- Updated README and TECH_SPECS.MD to match the current implementation.

## Next Highest Priority Steps

1. Harden secret storage failure behavior.
   - Decide the `safeStorage` unavailable policy from the open question.
   - Add migration/recovery tests for encrypted values when the host keyring changes or decryption fails.
   - Consider a passphrase fallback or OS keychain dependency if Electron `safeStorage` is not enough.

2. Complete the next OAuth 2.0 flow.
   - Implement the selected flow from the open question.
   - Add UI states for pending authorization, success, cancellation, and failure.
   - Add local OAuth fixture tests for success, denial, invalid JSON, token endpoint failure, and refresh expiry.

3. Add Electron UI workflow coverage.
   - Add Playwright or Electron-compatible tests for create/edit/save/reload/send.
   - Cover environment secret marking, redacted export path, OAuth refresh state update, and load-test allowlist validation.

4. Implement client-certificate transport.
   - Move certificate/key path validation into the main process.
   - Replace or extend the current `fetch` transport so TLS client cert/key/passphrase can be applied safely.
   - Avoid exposing certificate contents to the renderer.

5. Improve load testing beyond the MVP safety gates.
   - Add ramp-up, duration mode, per-sample export, latency histograms, and clearer resource-budget limits.
   - Decide whether host allowlists should be saved as workspace policy.

6. Release hardening.
   - Add release checksums and artifact upload automation.
   - Add signing/notarization plans for Linux first, then Windows and macOS.
   - Add a packaging CI job once artifact size and runtime are acceptable.

## Deferred / Larger Follow-Ups

- OpenAPI import/export.
- curl import/export.
- HAR import/export.
- JMeter plan import/export.
- Collection variables and deeper Postman compatibility.
- Request assertions and collection runner.
- Request scripting, pre-request hooks, and post-request scripts.
- CLI mode for CI API testing.
- Distributed/cloud load execution remains deferred until there is explicit product demand.
- Team collaboration and shared remote workspaces.
- Plugin system for custom auth, assertions, importers, and reporters.
- Windows and macOS package targets.

## Risks / Gaps Blocking Production Readiness

- `safeStorage` can be unavailable in some Linux sessions; the current fallback preserves data but is not strong secret storage.
- Full OAuth 2.0 browser/device-code/PKCE/client-credentials flows are not implemented.
- Client-certificate auth is modeled in the UI but not supported by the current request transport.
- IPC validation is handwritten and does not yet use shared versioned schemas.
- Main-process response payloads are not schema-validated.
- No automated Electron UI workflow tests beyond startup smoke.
- Linux signing, checksums, auto-update, and release automation are incomplete.
- Load testing is local-process only and lacks ramp-up, duration mode, per-sample export, histograms, and robust resource-budget controls.
- No request assertions, collection runner, scripts, or CLI runner.

## Next Iteration Starting Point

Run the current verification baseline first:

```bash
npm run check
npm run pack:linux
```

Then inspect the worktree:

```bash
git status --short
```

Use the open-question answers to choose between secret-storage hardening, the next OAuth flow, UI automation, client certificates, load-test policy persistence, and release hardening.
