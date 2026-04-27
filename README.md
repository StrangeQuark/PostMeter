# PostMeter

PostMeter is a standalone Electron desktop API client and local load-testing tool.

It is local-first software. It does not require a PostMeter account, app login, cloud sign-in, or registration.

## Highlights

- Managed multi-workspace desktop app with non-destructive workspace import
- Saved collections, folders, variables, environments, request examples, and a local cookie jar
- Native PostMeter plus Postman, OpenAPI, JMeter, curl, and HAR import/export
- Assertions, pre-request/test scripts, collection runs, and a CI-friendly CLI runner
- Local load tests with rate caps, percentiles, JSON/CSV export, and optional multi-process execution
- OAuth 2.0 helpers, HTTPS client certificates, theme modes, and GitHub Releases update checks

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Quick Start

```bash
npm install
npm start
```

## Commands

### Development

```bash
npm install
npm start
npm test
npm run check
npm run electron:version
```

### UI And Smoke

```bash
npm run test:smoke
npm run test:ui
npm run test:ui:regression
npm run test:ui:oauth
npm run test:ui:snapshot
```

### Packaging And Release

```bash
npm run pack:linux
npm run dist:linux
npm run dist:win
npm run dist:mac
npm run release:checksums
npm run release:prepare
npm run release:validate
```

Linux builds produce AppImage and deb artifacts. Release validation checks artifact hashes, manifest metadata, Linux protocol registration, and macOS zip app-bundle URL-scheme registration when an app bundle is present. Tag pushes matching `v*` publish unsigned GitHub Release artifacts plus `SHA256SUMS` and `release-manifest.json`.

## Project Layout

- `electron/main.js` owns desktop lifecycle, window hardening, and IPC registration.
- `electron/preload.js` exposes the explicit renderer API.
- `src/renderer/` contains the browser UI.
- `src/core/` contains request execution, persistence, import/export, and load-test logic.
- `scripts/postmeter-cli.js` is the headless CLI runner.

## CLI Runner

```bash
npm run cli -- run --file ./workspace.json --collection "Smoke" --environment "Local" --var token="$API_TOKEN" --report ./runner-report.json
```

The CLI accepts native PostMeter workspace/collection files and the same import pipeline used by the desktop app for Postman, OpenAPI, JMeter, curl, and HAR inputs. It exits with code `0` only when all executed requests pass their assertions and scripts. Reports support `json` and `csv`, and runtime overrides can be passed with `--var` and `--collection-var`.

## Workspace Data

Default managed workspace directory:

```text
~/.postmeter/
```

Override the preferred startup workspace path:

```bash
POSTMETER_DATA_PATH=/tmp/postmeter-workspace.json npm start
```

- PostMeter scans the directory containing the preferred workspace path for native managed workspace JSON files.
- Empty directories get a default workspace such as `Local Workspace.json`.
- Workspace data is stored as plain JSON, including auth fields, variables, cookies, and certificate passphrases.
- Schema migrations create sibling `pre-migration.backup` files. Unreadable workspace JSON is quarantined to a timestamped `corrupt` file and replaced with a fresh default workspace.
- Workspace import adds another managed workspace without replacing the current workspace, switching the current workspace, or creating an import backup.
- Desktop workspace export can write the current workspace or another managed workspace from the Workspaces list.
- `Export > Collection` opens an in-app picker modal, still opens with a warning when no collections exist, keeps Export disabled in that state, and defaults native collection exports to `<collection-name>.json`.

## Typical Workflow

1. Create or select a collection, folder, and request.
2. Configure method, URL, query params, headers, body, and auth.
3. Use collection variables, request-local variables, and environments with `{{variableName}}`.
4. Send requests and inspect status, timing, size, headers, formatted bodies, and assertions.
5. Add examples, cookies, pre-request scripts, and test scripts as needed.
6. Run the active collection from the Runner tab or from the CLI.
7. Use the Load Test tab for bounded local load tests with JSON/CSV export.
8. Import or export PostMeter, Postman, OpenAPI, JMeter, curl, and HAR formats.

## Documentation

| File | Purpose |
| --- | --- |
| [README.md](README.md) | Quick start, command reference, and product overview. |
| [TECH_SPECS.MD](TECH_SPECS.MD) | Detailed product scope, persistence, IPC, schema, and implementation reference. |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | Format, scripting, and load-testing compatibility matrix. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Renderer, Electron, and core ownership boundaries. |
| [docs/SANDBOX_CONTRACT.md](docs/SANDBOX_CONTRACT.md) | Sandbox contract for script security and compatibility. |
| [docs/OAUTH_PROVIDER_CERTIFICATION.md](docs/OAUTH_PROVIDER_CERTIFICATION.md) | Manual outbound OAuth provider certification plan. |
| [NEXT_STEPS.MD](NEXT_STEPS.MD) | Backlog, readiness gaps, and next-iteration priorities. |

## Updates

The desktop app can check GitHub Releases from `Help > Check for Updates`. Stable releases are checked by default. Prereleases are included only when the `Help > Prereleases` option is enabled. For forks or development builds:

```bash
POSTMETER_UPDATE_URL=https://api.github.com/repos/OWNER/REPO/releases/latest npm start
```

## Security And Status

- Renderer `nodeIntegration` is disabled, `contextIsolation` is enabled, and the renderer is sandboxed.
- The renderer talks to core logic only through explicit preload IPC bindings.
- Request scripts run in constrained child processes with brokered privileged APIs, hardened script bridges, fail-closed Node permission flags in production runtimes, Linux `bubblewrap` OS isolation plus seccomp syscall policy when available/required, timeouts, and bounded resources. Native Windows/macOS OS sandbox backends remain future platform work.
- Workspace data is stored as plain JSON without local encryption or redacted export modes. Script vault secrets are stored separately in encrypted per-workspace vault files when OS-backed desktop encryption is available.
- Release builds are currently unsigned. Full security and production-readiness detail lives in [TECH_SPECS.MD](TECH_SPECS.MD) and [NEXT_STEPS.MD](NEXT_STEPS.MD).
