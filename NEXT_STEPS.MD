# PostMeter Next Steps

## Open Questions Before Further Generation

Please answer these before the next implementation pass:

1. For secret storage, should the next implementation use Electron `safeStorage`, OS keychain integration through an added dependency, or a user-provided passphrase file encryption model?
2. For OAuth 2.0, which flow should be completed first: authorization code with PKCE, device code, client credentials, or refresh-token renewal?
3. Should collection/workspace export redact secrets by default, require a user confirmation, or export exact saved values for portability?
4. Should Linux release artifacts be AppImage-only for the MVP, or should deb remain a required first-class target?
5. Should the load-test safety model add a per-host allowlist, a high-concurrency confirmation, or both?
6. What maintainer email should replace the placeholder `postmeter@example.invalid` in Linux package metadata?

## Completed This Iteration

- Removed the tracked JavaFX/Maven application, Maven wrapper, Maven build file, Java resources, and Java tests.
- Made Electron the only supported runtime in docs and scripts.
- Enabled Electron renderer sandboxing while preserving context isolation and disabled renderer Node integration.
- Added runtime IPC input validation for workspace, collection, request, environment, load-test, and export payloads.
- Added negative tests for malformed IPC payloads.
- Added request auth support for Bearer token, Basic Auth, API key in header/query, Cookie, and static OAuth 2.0 access-token injection.
- Added Auth tab controls in the Electron renderer.
- Masked token/password auth inputs in the renderer.
- Added auth validation, redaction helpers, and request-time auth tests.
- Added an Electron startup smoke script.
- Added Linux packaging scripts using electron-builder.
- Added a GitHub Actions CI workflow for install, tests, audit, Electron version, and startup smoke under Xvfb.
- Updated README and TECH_SPECS.MD to match the current Electron-only architecture.

## Next Highest Priority Steps

1. Secret storage and export safety
   - Implement the secret-storage approach chosen from the open questions.
   - Add a `secret` flag to environment variables and auth fields where practical.
   - Redact secrets from workspace/collection exports unless explicitly allowed.
   - Add migration and rollback notes for any workspace schema change.
   - Add tests for encrypted/keychain storage, redaction, and import/export behavior.

2. Full OAuth 2.0 flows
   - Implement the selected OAuth flow first.
   - Store token metadata safely.
   - Add refresh/expiry handling where the selected flow requires it.
   - Add UI states for pending authorization, success, cancellation, and failure.
   - Add tests with a local OAuth fixture server.

3. Client certificate transport
   - Replace or extend the request transport so client cert/key/passphrase can be applied safely.
   - Validate certificate/key file paths in the main process only.
   - Avoid exposing certificate contents to the renderer.
   - Add local TLS integration tests if practical.

4. Electron UI workflow coverage
   - Add Playwright or Electron-compatible UI tests for create/edit/save/reload/send.
   - Add tests for collection/folder operations and Postman import.
   - Add a load-test UI workflow test with a local HTTP server.

5. Linux packaging and release pipeline
   - Decide AppImage-only versus AppImage plus deb.
   - Add release checksums.
   - Add signing/notarization plan where applicable.
   - Add a packaging CI job once artifact size and runtime are acceptable.

6. Load-test safety
   - Keep execution local-only for now.
   - Add the selected per-host allowlist and/or high-concurrency confirmation.
   - Add clearer resource-safety guidance in the UI and docs.

## Deferred / Larger Follow-Ups

- OpenAPI import/export.
- curl import/export.
- HAR import/export.
- JMeter plan import/export.
- Collection variables and deeper Postman compatibility.
- Request assertions and collection runner.
- Request scripting, pre-request hooks, and post-request scripts.
- CLI mode for CI API testing.
- Duration-based load tests, ramp-up schedules, histograms, per-sample export, and charts.
- Distributed/cloud load execution remains deferred until there is explicit product demand.
- Team collaboration and shared remote workspaces.
- Plugin system for custom auth, assertions, importers, and reporters.
- Windows and macOS package targets.

## Risks / Gaps Blocking Production Readiness

- Secrets are still persisted and exported as plain JSON values.
- Full OAuth 2.0 browser/device-code/PKCE flows are not implemented.
- Client-certificate auth is modeled in the UI but not supported by the current request transport.
- IPC validation is handwritten and does not yet use shared versioned schemas.
- Main-process response payloads are not schema-validated.
- No automated Electron UI workflow tests beyond startup smoke.
- Linux packaging is configured, but signing, checksums, auto-update, and release automation are incomplete.
- Linux deb metadata still uses a placeholder maintainer email.
- Load testing is local-process only and lacks ramp-up, duration mode, per-sample export, and robust resource safety controls.
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

Use the open-question answers to choose between secret storage, full OAuth flow implementation, client certificates, UI automation, Linux release hardening, and load-test safety.
