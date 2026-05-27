# PostMeter

PostMeter is a local-first desktop API client for building, sending, and testing API workflows.

## Features

- Send HTTP requests with params, headers, auth, cookies, and body editors.
- Organize collections, folders, request docs, environments, variables, and workspaces.
- Import and export requests, workspaces, collections, environments, runners, and performance tests.
- Run pre-request scripts, test scripts, and workspace-owned runners.
- Use first-class desktop runners or the CI-friendly CLI runner.
- Work with OAuth 2.0, HTTPS client certificates, cookies, and GitHub Releases update checks.
- Save and run local Performance tests for full endpoint diagnosis, latency, throughput, concurrency, stress, spike, soak, and ramp checks.
- Follow in-app Tutorials from the Help menu for guided request, environment, and runner workflows.

## Quick Start

Requirements:

- Node.js 22 or newer
- npm 10 or newer

```bash
npm install
npm start
```

## Common Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the desktop app. |
| `npm test` | Run the Electron test suite. |
| `npm run check` | Run the main local validation suite. |
| `npm run test:ui` | Run the primary UI smoke workflow. |
| `npm run cli -- run --file ./workspace.json` | Run collections from the CLI. |
| `npm run dist:linux` | Build Linux release artifacts. |
| `npm run dist:win` | Build the Windows installer. |
| `npm run dist:mac` | Build macOS release artifacts. |

## CLI

```bash
npm run cli -- run --file ./workspace.json --collection "Smoke" --environment "Local" --report ./runner-report.json
```

The CLI uses the same import and runner logic as the desktop app. It exits with code `0` only when every executed request passes.

## Runners

Runners save and replay request sequences from the desktop app.

- Build multi-step workflows for auth, setup, validation, and cleanup.
- Repeat runner rows without duplicating requests in the queue.
- Review completed runs in the split execution/details view.
- Tune Capture Settings for response previews, script output, logs, and local variables.
- Plan high-volume runs up to 1,000,000 expanded requests.
- Keep core metrics for every request while limiting expensive captures when runs get large.
- Store results in a reusable local temp database that is cleared when the app shuts down.

## Performance

Performance tests are saved workspace items for checking endpoint behavior under local load.

- Create tests from scratch or import requests from Collections.
- Choose an environment and mode for the test goal.
- Calibrate local-machine capacity before planning larger runs.
- Review status-code, error, latency, request-rate, and endpoint-diagnosis summaries.
- Export CSV reports on demand from the temp result store.

Performance test types:

- Full endpoint diagnosis
- Latency
- Throughput
- Concurrency
- Stress
- Spike
- Soak
- Ramp

Full Endpoint Diagnosis is a one-click local report with Quick, Medium, and Extended scopes. It runs bounded probe, warmup, baseline, throughput, spike, mini-soak, and recovery stages, then exports a UAT-ready CSV report.

Performance runs use Capture Settings for response bodies, script output, local variables, response headers, and transport timings. High-volume runs keep aggregate latency, status, and error metrics with streaming counters, and unexported Runner/Performance results are session-local.

## Tutorials

Use `Help > Tutorials` in the desktop app to open guided walkthroughs. The tutorial catalog covers requests, environments, runners, performance tests, workspaces, cookies, vault/packages/secrets, and SSL certificates. Runner and performance walkthroughs include their CSV variable and refreshing auth controls. Each tutorial highlights the relevant controls in the app and advances at your pace.

## Data And Privacy

PostMeter stores local app data under the OS app-data directory used by Electron:

```text
Linux:   ~/.config/postmeter/
macOS:   ~/Library/Application Support/PostMeter/
Windows: %APPDATA%\PostMeter\
```

User profile files live under `profile/` inside that directory. App-wide preferences are `profile/settings.json`, dirty tabs/session state is `profile/session.json`, and managed workspace files live under `profile/workspace/`.

Workspace-local privacy and sandbox choices are stored in each managed workspace's non-portable `localsettings` section.

You can override the startup workspace path:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

When `POSTMETER_DATA_PATH` is set, PostMeter uses that file as the startup workspace and creates companion app-data files beside it for development and test isolation. Workspace exports do not include `profile/settings.json`, `profile/session.json`, vaults, diagnostics, runtime files, or workspace `localsettings`, so sharing a workspace does not overwrite another user's theme, modal behavior, diagnostics opt-ins, file bindings, package reviews, local vault grants, or dirty tabs.

Request, workspace, collection, environment, runner, and performance exports can include auth fields, variables, cookies, file references, scripts, and certificate passphrases. Review exports before sharing them.

Diagnostics are local and user-initiated. See [Troubleshooting](docs/TROUBLESHOOTING.md) and [Security](docs/SECURITY.md) for the detailed privacy and validation model.

## Documentation

| Start Here | What It Covers |
| --- | --- |
| [docs/TECH_SPECS.md](docs/TECH_SPECS.md) | Full product and implementation reference. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Renderer, Electron, and core ownership boundaries. |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | Import/export, scripting, auth, and compatibility boundaries. |
| [docs/SANDBOX_CONTRACT.md](docs/SANDBOX_CONTRACT.md) | Request-script sandbox behavior and security contract. |
| [docs/SECURITY.md](docs/SECURITY.md) | Security boundaries and vulnerability reporting. |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | OAuth setup, diagnostics, vault prompts, and recovery notes. |
| [docs/OAUTH_PROVIDER_CERTIFICATION.md](docs/OAUTH_PROVIDER_CERTIFICATION.md) | OAuth provider certification workflow. |
| [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) | Third-party notices. |

Generated validation matrices live in `docs/*.json`, including Postman parity, diagnostics privacy, production readiness, Electron security, workspace durability, OAuth provider certification, and UX accessibility coverage.

## Notes

Production release builds require the checksum, manifest, and provenance gates documented in [docs/RELEASE_SECURITY.md](docs/RELEASE_SECURITY.md). Run `npm run check` before publishing release artifacts.
