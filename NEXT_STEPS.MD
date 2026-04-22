# PostMeter Next Steps

## Open Questions Before Further Generation

No blocking engineering questions are required for the next production-hardening pass. Continue assuming:

- PostMeter remains a standalone local desktop app with no PostMeter user account creation, app login, required cloud sign-in, or account gate.
- OAuth is only outbound request authentication for target APIs.
- When choosing between partial and production-ready implementations, build the production-ready path.
- Tier-one release validation targets Linux, Windows, and macOS together.
- Compatibility import/export includes OpenAPI, JMeter, curl, HAR, and Postman collections.
- Production release artifacts stay unsigned until maintainer certificates are available.
- Production release hosting uses GitHub Releases.
- The canonical public release/update repository is `StrangeQuark/PostMeter`.
- The project remains GPL-3.0-only.
- Publisher/developer name is `StrangeQuark`.
- Public support email is `support@qrksw.com`.
- The current production app icon source is `build/icon.png`.
- Manual OAuth provider certification targets are Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth Apps.
- Windows/macOS packaged protocol validation should be CI-only native-runner validation, not a maintainer manual checklist.

## Standing Product Constraint

PostMeter must remain a standalone local desktop application. Do not add PostMeter user account creation, app login, required cloud sign-in, or any account gate for core usage. OAuth work is strictly for authenticating outbound API requests, not for authenticating users into PostMeter.

## Completed This Iteration

- Added CI-only native Windows protocol validation wiring for release builds. The Windows script silently installs the generated NSIS artifact on a Windows runner and validates the `postmeter://` registry root/open command.
- Added CI-only native macOS protocol validation wiring for release builds. The macOS script validates `PostMeter.app` URL-scheme metadata from app, zip, and DMG artifacts and registers discovered bundles with Launch Services.
- Added package scripts for native protocol validation: `release:validate:win-protocol` and `release:validate:mac-protocol`.
- Added first-class XML XPath assertions and XML extraction in the shared core assertion path.
- Added first-class HTML CSS selector assertions and HTML text extraction in the shared core assertion path.
- Added XML/HTML response viewer formatting in the renderer.
- Added XML/HTML assertion templates and UI smoke coverage for XML XPath and HTML selector assertion rows.
- Added maintained parser dependencies for XML/XPath and HTML selector evaluation.
- Mapped JMeter XPath Assertion import/export to PostMeter `xmlPath` assertions where semantics are clear.
- Kept JMeter HTML Assertion validity behavior preserve-only because it is not equivalent to CSS selector checks.
- Added sustained multi-process target-rate and longer cancellation tests for the load-test runner.
- Added shared IPC schema validation for update-check options and external-open URL payloads.
- Updated focused tests for release workflow wiring, XML/HTML assertions, JMeter XPath mapping, IPC schema enum coverage, renderer smoke coverage, and load-test sustained behavior.
- Updated `README.md`, `TECH_SPECS.MD`, and `docs/COMPATIBILITY.md` to reflect the current implementation.

## Next Highest Priority Steps

1. Execute and monitor native release validation in CI.
   - Push/tag on GitHub runners so Windows NSIS registry validation and macOS app/DMG protocol validation actually execute on native platforms.
   - Fix any runner-specific installer, permissions, quarantine, mount, or Launch Services issues discovered by CI.
   - Keep Linux deb/AppImage and macOS zip metadata validation in `release:validate`.

2. Execute outbound OAuth provider certification.
   - Run the documented certification plan for Google OAuth 2.0, Microsoft Entra ID / Azure AD, and GitHub OAuth Apps.
   - Capture provider-specific redirect URI, PKCE, device-code, refresh-token, and client-credentials behavior without adding any PostMeter account login system.
   - Add provider notes or test fixtures for any provider-specific token response differences discovered.

3. Continue JMeter compatibility depth.
   - Add more realistic `.jmx` fixtures from current JMeter exports, especially XPath Assertion variants and nested controller plans.
   - Implement JMeter HTML Assertion validity support only if backed by a real HTML validity engine and clear PostMeter assertion semantics.
   - Keep unsupported metadata explicit and disabled on export rather than implying execution parity.

4. Continue schema-driven IPC validation.
   - Move remaining complex hand-written validators toward generated or schema-driven validation from `payloadSchemas.js`.
   - Prioritize import/export option payloads, workspace import/export result shapes, file-dialog payloads, and any remaining response/header map paths not yet covered by shared schemas.

5. Extend sustained load-test governance.
   - Add per-target rate-governance options where they materially improve local safety beyond the current host allowlist, high-concurrency confirmation, request caps, duration caps, and target-rate scheduling.
   - Keep optional raw sample capture capped while summaries continue to aggregate from worker metrics.

6. Continue cookie parity and source-format metadata.
   - Add source-format import/export tests for `Priority`, `Partitioned`, prefix-constrained cookies, source hints, and extension attributes.
   - Add any missing explicit metadata fields only when extension hints are insufficient for round-tripping common source formats.

7. Harden request scripting beyond current process controls.
   - Investigate practical OS-level sandboxing options per platform.
   - Consider a strict script worker pool to reduce startup overhead without weakening isolation.
   - Continue expanding safe Postman sandbox compatibility, especially APIs that do not require network side effects or privileged host access.

8. Improve secret UX follow-through.
   - Link `docs/SECRETS.md` from more UI-facing error states where practical.
   - Add tests around exact-export prompt copy and passphrase recovery copy if those surfaces change.

## Deferred / Larger Follow-Ups

- Distributed/cloud load execution remains deferred until there is explicit product demand.
- Team collaboration and shared remote workspaces.
- Plugin system for custom auth, assertions, importers, reporters, and scripting extensions.
- True auto-download/auto-install updates beyond opening GitHub Releases.
- Signed/notarized releases once maintainer-controlled certificates are available.
- Full JMeter execution semantics beyond the focused HTTP sampler compatibility target.

## Risks / Gaps Blocking Production Readiness

- Request scripts run in child processes with minimal environments, Node permission flags when available, bounded worker heap settings, bounded console capture, explicit unsupported-API errors, and VM timeouts, but this is still not a full OS sandbox with syscall policy.
- The `pm` API remains a practical subset rather than full Postman sandbox compatibility.
- Live OAuth provider behavior is not certified yet against Google, Microsoft Entra ID / Azure AD, and GitHub provider tenants.
- Postman import covers common auth helpers, variables, scripts, editable examples, cookie metadata, request variables, and collection certificates, but protocol profile behavior and the full Postman variable model remain incomplete.
- Cookie jar handling covers more common behavior and selected newer attributes, but still needs deeper browser-parity and source-format round-trip coverage.
- JMeter import/export covers common HTTP sampler metadata, assertion mappings including XPath, extractors, selected timer/controller metadata round-tripping, Size Assertion mapping, and unsupported metadata preservation, but it is still not a full JMeter test-plan model.
- Automated Electron UI coverage is broader and includes screenshot, mocked OAuth, and XML/HTML formatting smokes, but it is still Linux/headless focused and not broad cross-platform UI automation.
- Custom URI-scheme OAuth redirects are implemented and mocked; Linux deb/AppImage desktop-entry registration, macOS zip app-bundle metadata, and native-runner validation scripts are in place, but Windows/macOS native release validation has not executed in this environment.
- Forgotten fallback passphrases and lost OS keyring secrets cannot be recovered by PostMeter.
- IPC validation uses shared schema metadata for more common fields, update/external payloads, and result payloads, but remaining complex validators are still partly handwritten rather than fully generated.
- Signing/notarization remains incomplete; unsigned GitHub Release artifact publishing is configured.
- In-app update checks can open GitHub Releases, but PostMeter does not yet auto-download or auto-install updates.
- Load testing is local-only. It supports target arrival-rate scheduling, bounded multi-process execution, streamed worker summary aggregation, and capped optional sample capture, but not distributed execution or advanced per-target policy governance.

## Next Iteration Starting Point

Run the current verification baseline first:

```bash
npm run check
npm run pack:linux
npm run dist:linux
npm run release:prepare
POSTMETER_RELEASE_REQUIRED_TYPES=appimage,deb npm run release:validate
```

Then inspect the worktree:

```bash
git status --short
```
