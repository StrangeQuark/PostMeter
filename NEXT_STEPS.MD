# PostMeter Next Steps

## Open Questions Before Further Generation

Please answer these before the next implementation pass:

1. For local-only secret storage, should secrets be plain JSON with masking, encrypted with a user-provided passphrase, or integrated with OS keychains where available?
   - Answer: Plain JSON for now
2. Which authentication helper should be implemented first in the UI: bearer token, Basic Auth, API key, OAuth 2.0, cookies, or client certificates?
   - Answer: Implement them all
3. Should Postman import preserve folder hierarchy in the UI, or is the current flattened request list acceptable for the next milestone?
   - Answer: Preserve folder hierarchy now
4. Should shared collection export include environments, or should collections and environments remain separate exports?
   - Answer: Separate exports
5. For UI automation, should the next pass add full TestFX/headless JavaFX support, or continue with lighter FXML/controller contract tests until CI is configured?
   - Answer: I want to switch to Electron now
6. Should destructive workspace import require an automatic backup of the current workspace before replacement?
   - Answer: Sure
7. Should load-test result export be CSV, JSON, or both?
   - Answer: Both

## Completed This Iteration

- Added reusable request validation before normal send and load-test execution.
- Added user-facing validation messages for invalid URLs, unsupported schemes, and invalid header names.
- Added cancellable load-test execution with a cancellation token.
- Added load-test progress updates in the UI.
- Added richer load-test metrics: requested requests, completed requests, cancelled status, error rate, p50, p90, p95, and p99.
- Added a Cancel button for running load tests.
- Added right-click rename actions for collections and requests.
- Added tests for request validation, load-test cancellation-before-start, richer load-test metrics, and FXML handler coverage.
- Updated README and TECH_SPECS.MD to match the implementation.

## Previously Completed

- Workspace schema versioning with current schema version `2`.
- Schema `1` to `2` migration.
- Timestamped pre-migration backup creation.
- Corrupt workspace quarantine and default workspace recovery.
- Native PostMeter workspace import/export service methods.
- Native PostMeter collection import/export service methods.
- Collection import ID regeneration to support sharing without collisions.
- Common Postman collection import for request name, method, URL, query params, headers, disabled header/param state, and raw body.
- UI controls for workspace import/export and collection import/export.
- Right-click collection/request context menus for add request, duplicate request, export collection, and delete.
- Confirmation dialogs for destructive collection/request deletion and workspace replacement.

## Next Highest Priority Steps

1. Secret and auth foundation
   - Add a secret flag to environment variables and future auth fields.
   - Mask secret values in environment tables by default.
   - Redact secrets from status messages, history, import/export warnings, and future logs.
   - Implement the first authentication helper chosen from the open questions.
   - Add tests for secret masking, redaction, and request-time resolution.

2. Safer workspace and collection sharing
   - Decide whether workspace import should auto-backup the current workspace.
   - Add automatic current-workspace backup before destructive import if approved.
   - Decide whether collection exports include related environments.
   - Add native environment import/export if collections and environments stay separate.
   - Add export metadata such as exported app version and timestamp.
   - Add import preview/summary before merging shared collections.

3. Postman import/export completion
   - Preserve or model Postman folder hierarchy based on the open question.
   - Import Postman collection variables.
   - Import common Postman auth metadata after the auth model exists.
   - Report unsupported Postman scripts/tests/events clearly.
   - Add fixture-based tests for nested folders, collection variables, auth, disabled requests, and unsupported fields.

4. Load testing improvements
   - Add ramp-up duration.
   - Add duration-based tests in addition to fixed request count.
   - Add CSV and/or JSON result export based on the open question.
   - Add a chart or table for live progress instead of replacing text output.
   - Add high-concurrency warnings and per-host safety guidance.
   - Keep load execution local-only for now.

5. UI validation and usability
   - Validate table edits sooner, not only before send/load test.
   - Add clear import/export success and failure detail dialogs.
   - Improve keyboard navigation and accessibility labels.
   - Add inline indicators to the specific invalid field when practical.

6. Automated UI testing
   - Add full TestFX/headless JavaFX support if approved.
   - Add startup smoke test.
   - Add workflow test for creating, editing, saving, and reloading a request.
   - Keep FXML contract tests for cheap handler coverage.

7. Request assertions and collection runner
   - Add assertion model for status code, header, JSON path, body contains, and response time.
   - Add assertion editor UI.
   - Execute assertions after request send.
   - Add sequential collection runner and result summary.

8. CI and packaging
   - Add GitHub Actions for `./mvnw test` and `./mvnw package`.
   - Evaluate `jlink` and `jpackage`.
   - Document supported operating systems.
   - Add release artifact checksums.

## Deferred / Larger Follow-Ups

- OpenAPI import/export.
- curl import/export.
- HAR import/export.
- JMeter plan import/export.
- OAuth 2.0 full browser/device-code flows.
- Cookie jar and cookie editing UI.
- Client certificate management.
- Request scripting, pre-request hooks, and post-request scripts.
- CI runner/CLI mode for automated API tests.
- SQLite migration remains deferred because the current product decision is to keep JSON.

## Future Expansions

- Distributed/cloud load execution.
- Team collaboration and shared remote workspaces.
- Plugin system for custom auth, assertions, importers, and reporters.
- Advanced load-test reporting with charts, histograms, and compare runs.

## Risks / Gaps Blocking Production Readiness

- Secrets are still plain values in JSON; no masking, encryption, or keychain integration exists yet.
- Auth workflows are not implemented.
- Postman import supports common fields only and does not preserve every Postman feature.
- Workspace replacement import does not yet back up the current workspace automatically.
- No file locking or multi-window conflict handling.
- No full JavaFX UI interaction tests.
- No CI pipeline.
- No native installer or signed release process.
- Load testing has no ramp-up, duration mode, result export, charted progress, or distributed execution.
- No request assertions or collection runner.

## Next Iteration Starting Point

Run the full verification baseline first:

```bash
./mvnw test
```

Then inspect the worktree:

```bash
git status --short
```

Use the answers to the open questions to choose between the secret/auth foundation, safer workspace import, deeper Postman compatibility, and load-test result export.
