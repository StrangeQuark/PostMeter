# PostMeter Next Steps

## Open Questions Before Further Generation

Please answer these before the next implementation pass:

1. Should PostMeter remain a JavaFX desktop application for the next milestone, or should the project move toward an Electron/web or client-server architecture?
   - Answer: Remain JavaFX
2. What is the priority order for compatibility: Postman collections, OpenAPI specs, curl import/export, HAR files, or JMeter plans?
   - Answer: Postman collections should be first, but implement everything
3. Should secrets be stored locally only, integrated with OS keychains, or avoided entirely until authentication features are designed?
   - Answer: Local storage for now
4. Which authentication workflows are required first: bearer tokens, Basic Auth, API key helpers, OAuth 2.0, cookies, or client certificates?
   - Answer: Implement them all
5. Should load testing target local developer use only, or should the roadmap include distributed/cloud execution?
   - Answer: For now it should be local only, but make a note in NEXT_STEPS.MD for FUTURE EXPANSIONS which can include distributed/cloud exec
6. Is Java 21 an acceptable minimum requirement for contributors and users?
   - Answer: Yes
7. Should the MVP optimize first for individual API debugging, team/shared collections, or automated CI test execution?
   - Answer: Collection sharing
8. Should workspace files remain simple JSON, or should the app move to SQLite for better indexing, migrations, and future concurrent access?
   - Answer: JSON
9. Do you want the next generated work to include UI automated testing infrastructure, even if that adds TestFX/headless runtime complexity?
   - Answer: Yes
10. What license and contribution workflow should be documented for open-source contributors beyond the existing `LICENSE` file?
   - Answer: Just leave it at the LICENSE file for now

## Recommended Execution Order

The next implementation pass should proceed in this order:

1. Stabilize workspace schema and persistence.
2. Add authentication and secret-handling foundations.
3. Add import/export compatibility.
4. Add request assertions and collection runner.
5. Improve load testing controls and safety.
6. Add automated UI smoke tests.
7. Add packaging and release automation.

## Phase 1: Persistence Hardening

Goal: make saved workspace data reliable across versions.

Tasks:

- Add explicit workspace schema migration support.
- Add migration tests from schema version 1 to future versions.
- Add backup-on-write before destructive migrations.
- Add workspace corruption recovery flow with user-facing error text.
- Add export/import of native PostMeter workspace JSON.
- Add file-locking or single-instance safeguards if multiple app windows are supported later.

Acceptance criteria:

- Existing workspaces continue loading after schema changes.
- Invalid workspace JSON produces a clear recovery path.
- Tests cover default workspace creation, migration, save/load, and corrupt file handling.

## Phase 2: Secret And Auth Foundation

Goal: prevent the app from treating credentials as ordinary plain text.

Tasks:

- Decide secret storage strategy from the open questions.
- Add secret-value model support for environment variables and auth fields.
- Mask secret values in UI by default.
- Redact secrets from history, errors, and future logs.
- Add bearer token support.
- Add Basic Auth support.
- Add API key helper support for header and query placement.

Acceptance criteria:

- Users can mark environment variables as secret.
- Secret values are not displayed casually in the UI.
- Request execution still receives resolved secret values.
- Tests verify redaction and resolution behavior.

## Phase 3: Import And Export

Goal: make PostMeter useful to users migrating from existing tools.

Tasks:

- Implement Postman collection import.
- Implement Postman environment import.
- Implement curl import for single requests.
- Implement curl export for active request.
- Add native PostMeter workspace export.
- Add validation and clear error reporting for unsupported fields.

Acceptance criteria:

- A common Postman collection imports into collections and requests.
- Imported headers, params, URLs, methods, and raw bodies are preserved.
- Unsupported auth/scripts are reported, not silently lost.
- Tests cover representative fixtures.

## Phase 4: Request Assertions And Collection Runner

Goal: support API testing, not only manual API calls.

Tasks:

- Add assertion model for status code, header presence/value, JSON path, response time, and body contains.
- Add assertion editor UI.
- Add assertion execution after request send.
- Add collection runner for sequential execution.
- Add environment variable updates from responses if the product direction requires chained requests.
- Add runner result summary UI.

Acceptance criteria:

- Users can add assertions to saved requests.
- Sending a request displays pass/fail assertion results.
- Running a collection executes saved requests and reports aggregate results.
- Tests cover assertion success and failure cases.

## Phase 5: Load Testing Improvements

Goal: move from basic fixed-count load testing to a safer, more useful volume-testing MVP.

Tasks:

- Add cancellation support.
- Add ramp-up duration.
- Add duration-based tests in addition to fixed request count.
- Add p50, p90, p95, p99, min, max, and error-rate metrics.
- Add live progress updates.
- Add CSV/JSON result export.
- Add warnings for high concurrency and large request counts.
- Add per-host concurrency safeguards if needed.

Acceptance criteria:

- Users can stop a running load test.
- UI remains responsive during load testing.
- Results include richer percentile metrics.
- Tests cover cancellation and aggregation behavior.

## Phase 6: UI Quality And Automated Testing

Goal: make the desktop workflow safer for contributors to change.

Tasks:

- Add JavaFX/TestFX test infrastructure or another agreed UI test approach.
- Add smoke tests for app startup.
- Add workflow tests for creating request, editing params/headers/body, saving, and reloading.
- Add UI validation feedback for invalid URL/header/body choices.
- Improve keyboard navigation and accessibility labels.
- Add confirmation dialogs for destructive actions.

Acceptance criteria:

- At least one automated UI startup test runs in CI.
- Core request editing workflow has automated coverage.
- Invalid input is shown inline where practical.

## Phase 7: Packaging And Release Automation

Goal: make PostMeter installable by real users.

Tasks:

- Add GitHub Actions CI for tests and package build.
- Add release workflow for tagged versions.
- Evaluate `jlink`/`jpackage` runtime image generation.
- Add platform-specific installer builds if feasible.
- Add checksums and release notes generation.
- Document supported operating systems.

Acceptance criteria:

- Pull requests run tests automatically.
- Tagged releases produce downloadable artifacts.
- Installation and launch instructions are documented.

## Phase 8: Contributor Readiness

Goal: make the project approachable for open-source contributors.

Tasks:

- Add `CONTRIBUTING.md`.
- Add architecture overview linked from README.
- Add issue templates.
- Add pull request template.
- Add code style guidance.
- Add security reporting policy.
- Add roadmap with milestone labels.

Acceptance criteria:

- New contributors can build, test, and understand the app structure from docs.
- Maintainers have a clear checklist for reviewing contributions.

## Immediate Next Commands

After answering the open questions, the next agent should start with:

```bash
./mvnw test
```

Then inspect the current worktree:

```bash
git status --short
```

Then choose the next implementation phase based on the answered priorities.

## Current Verification Baseline

The latest verified baseline before these next steps:

- `./mvnw test` passed with 6 tests, 0 failures, 0 errors.
- `./mvnw package` passed and built the jar.

These commands should be rerun after any code changes.
