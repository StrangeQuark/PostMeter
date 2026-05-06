# PostMeter

PostMeter is a local-first desktop API client for building, sending, testing, and load-checking API workflows.

## Features

- Send HTTP requests with params, headers, auth, cookies, and body editors.
- Organize collections, folders, examples, environments, variables, and workspaces.
- Import and export PostMeter, Postman Collection v2.1, OpenAPI, JMeter, curl, and HAR files.
- Run pre-request scripts, test scripts, assertions, and workspace-owned runners.
- Use first-class desktop runners or the CI-friendly CLI runner.
- Run bounded local load tests with rate caps, percentiles, and JSON/CSV export.
- Work with OAuth 2.0, HTTPS client certificates, cookies, and GitHub Releases update checks.

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

## CLI Runner

```bash
npm run cli -- run --file ./workspace.json --collection "Smoke" --environment "Local" --report ./runner-report.json
```

The CLI uses the same import and runner logic as the desktop app. It exits with code `0` only when every executed request passes.

## Desktop Runners

The desktop Runner section stores runners directly in the workspace. A runner owns independent request copies, so importing a request or collection into a runner does not mutate the source collection when the runner request is edited or executed.

Create runners from the top toolbar with `New` > `Runner`, or from the `New Runner` button in the empty Runner pane. The left sidebar Runner section is for selecting existing runners and showing the empty runner state.

Each runner stores its own environment selection. When `Allow runner to modify environment` is off, scripts can still mutate a temporary environment for later requests in that run, but the saved environment is left unchanged. When it is on, runner script and extractor mutations are written back to the selected saved environment.

Runner `Add Request` offers a local `New Request` action or an `Import` modal for selecting a whole collection or a single collection request.

## Data And Privacy

PostMeter stores managed workspaces as local JSON files under:

```text
~/.postmeter/
```

You can override the startup workspace path:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

Workspace JSON can include auth fields, variables, cookies, and certificate passphrases. Review workspace and collection exports before sharing them.

Diagnostics are local and user-initiated. See [Troubleshooting](docs/TROUBLESHOOTING.md) and [Release Readiness](docs/RELEASE_READINESS.md) for the detailed privacy and validation model.

## Documentation

| Start Here | What It Covers |
| --- | --- |
| [docs/TECH_SPECS.md](docs/TECH_SPECS.md) | Full product and implementation reference. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Renderer, Electron, and core ownership boundaries. |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | Import/export, scripting, auth, and load-testing compatibility. |
| [docs/SANDBOX_CONTRACT.md](docs/SANDBOX_CONTRACT.md) | Request-script sandbox behavior and security contract. |
| [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md) | Release gates, validation policy, and readiness status. |
| [docs/SECURITY.md](docs/SECURITY.md) | Security boundaries and vulnerability reporting. |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | OAuth setup, diagnostics, vault prompts, and recovery notes. |
| [docs/OAUTH_PROVIDER_CERTIFICATION.md](docs/OAUTH_PROVIDER_CERTIFICATION.md) | OAuth provider certification workflow. |
| [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) | Third-party notices. |

Generated validation matrices live in `docs/*.json`, including Postman parity, diagnostics privacy, production readiness, Electron security, workspace durability, OAuth provider certification, and UX accessibility coverage.

## Notes

Load tests intentionally skip pre-request and test scripts; collection runs and single requests execute scripts. See [Sandbox Contract](docs/SANDBOX_CONTRACT.md) for the detailed policy.

Release builds are currently unsigned. See [Release Readiness](docs/RELEASE_READINESS.md) for the current release validation state.
