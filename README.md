# PostMeter

PostMeter is a local-first desktop API client for building, sending, and testing API workflows.

## Features

- Send HTTP requests with params, headers, auth, cookies, and body editors.
- Organize collections, folders, request docs, environments, variables, and workspaces.
- Import and export requests, workspaces, collections, environments, runners, and performance tests.
- Run pre-request scripts, test scripts, and workspace-owned runners.
- Use first-class desktop runners or the CI-friendly CLI runner.
- Work with OAuth 2.0, HTTPS client certificates, cookies, and GitHub Releases update checks.
- Save and run local Performance tests for latency, throughput, concurrency, stress, spike, soak, and ramp checks.

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

## Performance

Performance tests are saved workspace items for checking how an endpoint behaves under local load. You can create a test from scratch or import a copy of a request from Collections, choose an environment, pick the performance mode that matches the question you are asking, run a local-machine calibration to estimate maximum sustained local RPS and a conservative planning cap, run the test, and review status-code, error, latency, and request-rate summaries.

The legacy Load Test panel has been removed. Distributed/cloud load execution, JMeter import/export/execution, and hosted load agents are not part of the current production claim.

## Data And Privacy

PostMeter stores managed workspaces as local JSON files under:

```text
~/.postmeter/
```

App-wide preferences are stored separately in:

```text
~/.postmeter/settings.json
```

Workspace-local privacy and sandbox choices are stored in each managed workspace's non-portable `localsettings` section.

You can override the startup workspace path:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

Workspace exports do not include `settings.json` or workspace `localsettings`, so sharing a workspace does not overwrite another user's theme, modal behavior, diagnostics opt-ins, file bindings, package reviews, or local vault grants.

Request, workspace, collection, environment, runner, and performance exports can include auth fields, variables, cookies, file references, scripts, and certificate passphrases. Review exports before sharing them.

Diagnostics are local and user-initiated. See [Troubleshooting](docs/TROUBLESHOOTING.md) and [Release Readiness](docs/RELEASE_READINESS.md) for the detailed privacy and validation model.

## Documentation

| Start Here | What It Covers |
| --- | --- |
| [docs/TECH_SPECS.md](docs/TECH_SPECS.md) | Full product and implementation reference. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Renderer, Electron, and core ownership boundaries. |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | Import/export, scripting, auth, and compatibility boundaries. |
| [docs/SANDBOX_CONTRACT.md](docs/SANDBOX_CONTRACT.md) | Request-script sandbox behavior and security contract. |
| [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md) | Release gates, validation policy, and readiness status. |
| [docs/SECURITY.md](docs/SECURITY.md) | Security boundaries and vulnerability reporting. |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | OAuth setup, diagnostics, vault prompts, and recovery notes. |
| [docs/OAUTH_PROVIDER_CERTIFICATION.md](docs/OAUTH_PROVIDER_CERTIFICATION.md) | OAuth provider certification workflow. |
| [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) | Third-party notices. |

Generated validation matrices live in `docs/*.json`, including Postman parity, diagnostics privacy, production readiness, Electron security, workspace durability, OAuth provider certification, and UX accessibility coverage.

## Notes

Release builds are currently unsigned. See [Release Readiness](docs/RELEASE_READINESS.md) for the current release validation state.
