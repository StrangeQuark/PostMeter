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

Runners let you save and replay a sequence of requests from the desktop app. They are useful for API workflows where one request sets up data for the next, such as authentication, setup, validation, and cleanup steps. Each runner row can repeat for a configured number of iterations without duplicating the same request in the queue.

Runner results keep the same split execution/details view, but completed runs are now backed by one reusable local temp result database instead of a large in-memory result object. The Capture Settings panel lets you choose whether to retain response body previews, pre-request output, post-request output, script logs, and local variables. High-volume runs can plan up to 1,000,000 expanded requests; PostMeter estimates the temp SQLite file size before execution, warns when it would leave less than 1 GB of effective free space, blocks runs that exceed available space, keeps core metrics for every request, and automatically limits expensive captures such as all response bodies, logs, script outputs, and per-request variables when the run size would produce impractical artifacts. Those guardrails are reflected directly in the Capture Settings panel: forced-off checkboxes are shown unchecked, disabled, and explain the planned-request threshold on hover.

## Performance

Performance tests are saved workspace items for checking how an endpoint behaves under local load. You can create a test from scratch or import a copy of a request from Collections, choose an environment, pick the performance mode that matches the question you are asking, run a local-machine calibration to estimate maximum sustained local RPS and a conservative planning cap, run the test, and review status-code, error, latency, request-rate, and endpoint-diagnosis summaries.

The first mode, Full Endpoint Diagnosis, is a one-click local report for an endpoint. It offers Quick, Medium, and Extended scopes that automatically choose the request budget and raise the duration cap for deeper UAT evidence, then runs bounded preflight, HEAD/OPTIONS probe, warmup, baseline, throughput, spike, mini-soak, and recovery stages, captures transport timing and passive endpoint signals, scores local-client confidence, and exports a formatted CSV that Product Owners can use for UAT review.

Performance runs use the same reusable temp result database and expose Capture Settings for response bodies, script output, local variables, response headers, and transport timings. High-volume Performance execution keeps exact aggregate latency/status/error metrics with streaming counters instead of retaining every per-request result object in memory, uses an explicit keep-alive Node HTTP transport with bounded per-request timeouts, and coalesces rapid progress updates so million-request local runs do not flood Electron IPC. CSV export is generated only when requested by streaming from the temp result store, so normal runs do not leave historical result files behind. PostMeter deletes the current temp result database and SQLite sidecars on app shutdown, which means unexported Runner/Performance results are intentionally session-local.

The legacy Load Test panel has been removed. Distributed/cloud load execution, JMeter import/export/execution, and hosted load agents are not part of the current production claim.

## Tutorials

Use `Help > Tutorials` in the desktop app to open guided walkthroughs. The current tutorials cover sending a basic request, using environment variables, and running a request series. Each tutorial highlights the relevant controls in the app and advances at your pace.

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

Diagnostics are local and user-initiated. See [Troubleshooting](docs/TROUBLESHOOTING.md) and [Release Readiness](docs/RELEASE_READINESS.md) for the detailed privacy and validation model.

## Documentation

| Start Here | What It Covers |
| --- | --- |
| [docs/TECH_SPECS.md](docs/TECH_SPECS.md) | Full product and implementation reference. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Renderer, Electron, and core ownership boundaries. |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | Import/export, scripting, auth, and compatibility boundaries. |
| [TUTORIALS.md](TUTORIALS.md) | Internal implementation notes for the in-app Tutorials system. |
| [docs/SANDBOX_CONTRACT.md](docs/SANDBOX_CONTRACT.md) | Request-script sandbox behavior and security contract. |
| [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md) | Release gates, validation policy, and readiness status. |
| [docs/SECURITY.md](docs/SECURITY.md) | Security boundaries and vulnerability reporting. |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | OAuth setup, diagnostics, vault prompts, and recovery notes. |
| [docs/OAUTH_PROVIDER_CERTIFICATION.md](docs/OAUTH_PROVIDER_CERTIFICATION.md) | OAuth provider certification workflow. |
| [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) | Third-party notices. |

Generated validation matrices live in `docs/*.json`, including Postman parity, diagnostics privacy, production readiness, Electron security, workspace durability, OAuth provider certification, and UX accessibility coverage.

## Notes

Release builds are currently unsigned. See [Release Readiness](docs/RELEASE_READINESS.md) for the current release validation state.
