# Release Readiness

This document explains the production-readiness gates used before PostMeter can be called beta, release-candidate, or stable.

## Readiness Matrix

The source-owned dashboard is `src/core/productionReadinessMatrix.js`; the committed generated output is `docs/production-readiness-matrix.json`.

Commands:

```bash
npm run production:readiness
npm run production:readiness:validate
npm run production:readiness:claim
npm run production:readiness:claim:beta
npm run production:readiness:claim:rc
npm run production:readiness:claim:stable
```

`production:readiness:validate` is the normal CI freshness/structure check. `production:readiness:claim` is the stable-release gate and is equivalent to `production:readiness:claim:stable`. The tag-driven GitHub Release workflow runs `npm run production:readiness:claim:stable` before building artifacts, so stable publication stays blocked while release-blocking rows remain unresolved.

Release-level gates are intentionally distinct:

- Beta fails on release-blocking rows marked `blocked`.
- Release-candidate fails unless every release-blocking row is `validated` or carries an explicit documented RC waiver in the matrix.
- Stable fails unless every release-blocking row is `validated`; stable does not accept documented waivers.

Status meanings:

- `validated`: implementation plus required local/native evidence exist.
- `implemented`: implementation and local validation exist, but the row is not claiming final external evidence.
- `external-validation-required`: implementation exists or is scaffolded, but final evidence requires native runners, maintainer credentials plus sanitized evidence, or signing assets.
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

- Linux: AppImage (`release/*.AppImage`) and deb (`release/*.deb`) under `release/`; packaged smoke also uses the unpacked `release/linux-unpacked/PostMeter` or `release/linux-unpacked/postmeter` executable produced by `pack:linux`/`dist:linux`.
- Windows: unsigned NSIS installer (`release/*.exe`) and unpacked app (`release/win-unpacked/PostMeter.exe`) under `release/`.
- macOS: dmg (`release/*.dmg`), zip (`release/*.zip`), and app bundle (`release/mac/PostMeter.app` or `release/mac-arm64/PostMeter.app`) under `release/`.
- MSI and RPM artifacts are not configured release targets. Release validation rejects them until package metadata, docs, upload paths, and native validators explicitly support those artifact types.

Only top-level distributable files are included in `SHA256SUMS` and `release-manifest.json`; unpacked app internals such as `win-unpacked/PostMeter.exe` are used only by packaged smoke validators and are rejected if they appear in release metadata. Release validation also fails if any top-level distributable is missing from the manifest or if `SHA256SUMS` does not exactly match the manifest artifact set and hashes.

Canonical metadata:

- App ID: `com.strangequark.postmeter`
- Product name: `PostMeter`
- Publisher/developer: `StrangeQuark`
- Support email: `support@qrksw.com`
- Update source: GitHub Releases for `StrangeQuark/PostMeter`
- Custom URL scheme: `postmeter://`
- App icon: `build/icon.png`
- Linux desktop integration: `x-scheme-handler/postmeter` in the packaged desktop entry.
- Linux install behavior: AppImage is self-contained and not installed by the validator; deb installs through the user's package manager and removes through the same package manager. Release validation inspects deb/AppImage desktop metadata without mutating the runner's system install state.
- Windows install behavior: NSIS silent install is validated into a temporary directory; the validator checks the registry root/open command, launches a `postmeter://oauth/callback?...` URL through ShellExecute, then runs the generated uninstaller silently and removes the temporary install directory.
- macOS install behavior: dmg/zip artifacts contain `PostMeter.app`; users install by dragging/copying the app bundle. The validator registers each unsigned app bundle from the app output, zip, or dmg with Launch Services, launches a `postmeter://oauth/callback?...` URL through `open -b com.strangequark.postmeter` for each bundle, verifies the launched process belongs to that bundle, then quits PostMeter before checking the next bundle. There is no macOS package uninstaller in the current artifact set.
- File associations: none are currently declared. Adding file associations must update this inventory, package metadata validation, and native runner checks.
- Persistence paths: packaged smoke first runs against an isolated native home/profile to verify Electron's default platform `userData` root and default `~/.postmeter/workspace.json` persistence, then runs a separate isolated `POSTMETER_DATA_PATH` override smoke to verify workspace create/save/reload and companion `userData` directory creation. Workspace, session, vault, export, and backup writes use collision-resistant same-directory temp files, fsync contents where supported, atomic rename, and best-effort directory fsync; backup writes, corrupt-workspace quarantine/recovery, and vault rename use no-overwrite destination semantics. Managed-workspace rename/delete, legacy-manifest cleanup, and vault rename/delete also fsync the owning directory where supported. Default workspace creation and managed workspace create/import/rename allocate around every existing filesystem entry, including unreadable or non-native JSON files, then use no-overwrite publication or no-overwrite moves so destination races preserve the external file and retry with a suffixed workspace filename where possible.

Release builds are unsigned until maintainer-controlled certificates exist. Windows users should expect SmartScreen warnings, and macOS users should expect Gatekeeper warnings for unsigned artifacts.

## Implemented Gates In This Pass

- Production readiness matrix and `production:*` scripts.
- Dependency audit and Electron runtime-version checks tracked as release-blocking readiness rows.
- Packaged startup smoke that verifies the trusted `postmeter-app://bundle/src/renderer/index.html` renderer URL, renderer CSP meta policy, full preload API function surface, app/electron/node/chrome/platform/release-channel metadata, workspace create/save/reload, default platform user-data path shape, and isolated user-data path override behavior.
- Linux/Windows/macOS GitHub Actions source-tree sandbox, packaged build/smoke/protocol jobs with artifact upload and failure log/screenshot upload.
- Manual no-publish native release validation workflow for pre-production evidence gathering.
- Windows protocol registration plus ShellExecute launch script and macOS URL scheme metadata plus Launch Services launch validator, including checks that the launched app belongs to the installed Windows artifact or each discovered macOS app bundle under validation and uploaded protocol-validator logs when `POSTMETER_VALIDATION_ARTIFACT_DIR` is set.
- Electron security, workspace durability, and non-Postman compatibility matrices, including channel-level Electron IPC enumeration, secure custom-protocol app-content loading with CSP/`nosniff`/`no-referrer` headers, main-frame-only preload exposure, trusted main-frame renderer IPC sender validation, collision-resistant atomic workspace/session/vault/export writes, filesystem-discovered managed workspaces, recovery behavior, and large-workspace performance budgets.
- Checked-in raw and normalized `newman@6.2.2` differential evidence under `test/fixtures/postman/newman-reports/`.
- Shared parent-side PFX/P12 extraction and live HTTP/gRPC mTLS tests.
- Metadata-only renderer vault prompt flow with request, collection, workspace, deny, and reset decisions, serialized concurrent prompts, prompt-response sender binding, and prompted-workspace grant persistence.

## Known Release Blockers

The stable production readiness claim remains intentionally fail-closed until every release-blocking row is promoted to `validated`. Current high-level blockers include:

- Live OAuth provider certification against maintainer-owned Google, Microsoft Entra ID / Azure AD, and GitHub OAuth apps. The local matrix and mocked provider corpus are automated through `npm run oauth:certify:validate` and `npm run oauth:certify:mock`; `npm run oauth:certify:live` remains skipped until maintainer credentials are explicitly supplied, and fails closed without official-provider endpoint URLs, sanitized live evidence JSON, plus checksum-verified forward-slash repository-relative evidence artifacts under `validation-artifacts/oauth-provider-certification/`.
- Signing/notarization credentials for stable signed artifacts.
- Local diagnostics/privacy implementation with redaction tests.
- Final native packaged runner evidence and manual production QA where required.
