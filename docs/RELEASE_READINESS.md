# Release Readiness

This document explains the production-readiness gates used before PostMeter can be called beta, release-candidate, or stable.

## Readiness Matrix

The source-owned dashboard is `src/core/productionReadinessMatrix.js`; the committed generated output is `docs/production-readiness-matrix.json`.

Commands:

```bash
npm run production:readiness
npm run production:readiness:validate
npm run production:readiness:claim
```

`production:readiness:validate` is the normal CI freshness/structure check. `production:readiness:claim` is the stable-release gate and fails while release-blocking rows remain `external-validation-required` or `blocked`.

Status meanings:

- `validated`: implementation plus required local/native evidence exist.
- `implemented`: implementation and local validation exist, but the row is not claiming final external evidence.
- `external-validation-required`: implementation exists or is scaffolded, but final evidence requires native runners, maintainer credentials, or signing assets.
- `blocked`: release-blocking work remains incomplete.
- `deferred`: deliberately outside the current production claim.
- `not-applicable`: not part of this product or release track.

## Native Runner Policy

Windows and macOS packaged validation must run on GitHub Actions native runners. Docker is acceptable for Linux service-style checks and unit tests, but not for Windows AppContainer behavior, macOS seatbelt behavior, protocol-handler registration, installer behavior, packaged Electron launch, or platform-specific persistence paths.

Current required native evidence:

- `windows-latest`: unsigned Windows build, packaged startup smoke, protocol registration check, packaged sandbox validation.
- `macos-latest`: unsigned macOS build, packaged startup smoke, URL scheme metadata check, packaged sandbox validation.
- `ubuntu-latest`: Linux build, AppImage/deb metadata checks, packaged startup smoke, packaged sandbox validation.

Run the `Native Release Validation` workflow manually from GitHub Actions for no-publish evidence. It builds Linux, Windows, and macOS artifacts on native runners, runs the packaged startup/sandbox/protocol checks, uploads the artifacts, then validates combined checksums and `release-manifest.json` without creating a GitHub Release.

All `electron-builder` package scripts used by CI pass `--publish never`; release publication is reserved for the tag-driven release workflow's explicit `gh release create` step after combined artifact validation. The Electron runtime-version check runs Electron in Node mode, which avoids GitHub-hosted Linux failures caused by an unconfigured Chromium setuid sandbox helper during a version-only probe. Linux GitHub-hosted app-launch smoke steps set `POSTMETER_CI_ELECTRON_NO_SANDBOX=1` so Electron starts under the runner's constraints; this is a CI-only Chromium app-shell waiver and does not disable PostMeter's script sandbox validation or change production launch defaults.

GitHub-hosted Linux runners may expose `bubblewrap` while denying the network-namespace setup required by PostMeter's full Linux OS-sandbox policy. Source and packaged sandbox validation therefore use an explicit CI-only waiver when the functional backend probe fails in that environment; local/manual Linux release signoff must still run `npm run sandbox:validate` without that waiver on a host where `bubblewrap` can launch the full namespace/seccomp sandbox.

Manual Windows QA is optional before final release because the maintainer has a Windows machine. Manual Mac QA remains a final production signoff item once a Mac is available; until then, `macos-latest` runner evidence is the pre-production gate.

## Artifact Inventory

Configured artifacts:

- Linux: AppImage and deb under `release/`.
- Windows: NSIS installer under `release/`.
- macOS: dmg and zip under `release/`.

Canonical metadata:

- App ID: `com.strangequark.postmeter`
- Product name: `PostMeter`
- Publisher/developer: `StrangeQuark`
- Support email: `support@qrksw.com`
- Update source: GitHub Releases for `StrangeQuark/PostMeter`
- Custom URL scheme: `postmeter://`
- App icon: `build/icon.png`

Release builds are unsigned until maintainer-controlled certificates exist. Windows users should expect SmartScreen warnings, and macOS users should expect Gatekeeper warnings for unsigned artifacts.

## Implemented Gates In This Pass

- Production readiness matrix and `production:*` scripts.
- Packaged startup smoke that verifies preload API availability, version metadata, workspace create/save/reload, and platform user-data path setup.
- Windows/macOS GitHub Actions packaged build/smoke jobs.
- Manual no-publish native release validation workflow for pre-production evidence gathering.
- Windows protocol registration script and macOS URL scheme metadata validator.
- Electron security, workspace durability, and non-Postman compatibility matrices.
- Checked-in raw and normalized `newman@6.2.2` differential evidence under `test/fixtures/postman/newman-reports/`.
- Shared parent-side PFX/P12 extraction and live HTTP/gRPC mTLS tests.
- Metadata-only renderer vault prompt flow with request, collection, workspace, deny, and reset decisions.

## Known Release Blockers

The production readiness claim remains intentionally fail-closed until these are resolved or explicitly waived:

- Native Windows/macOS OS-sandbox helper/addon source plus packaged native-runner evidence for platform-equivalent coverage.
- Live OAuth provider certification against maintainer-owned Google, Microsoft Entra ID / Azure AD, and GitHub OAuth apps.
- Signing/notarization credentials for stable signed artifacts.
- Local diagnostics/privacy implementation with redaction tests.
- Final native packaged runner evidence and manual production QA where required.
