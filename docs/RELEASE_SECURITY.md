# Release Security Checklist

PostMeter release security depends on repository controls that cannot be fully enforced from source code. Maintainers must verify these controls before publishing a production release.

## Required GitHub Controls

- Keep protected `main` enabled with required reviews, required status checks, and no direct pushes.
- Keep protected `v*` tags enabled so release tags cannot be force-pushed or created without maintainer approval.
- Require the full CI, release validation, sandbox validation, workflow validation, renderer security lint, secret scan, and high-severity dependency audit status checks before merging.
- Require signed tags and signed commits when feasible for release maintainers.
- Use the protected `release` environment for publishing and require release environment approval before the publish job can run.
- Enable GitHub secret scanning and push protection for the repository and owning organization.
- Enable Dependabot security updates. The CI workflow runs GitHub dependency review on pull requests and fails high-severity dependency changes.
- Restrict release secrets to the protected `release` environment.
- Keep GitHub artifact attestations enabled for the repository so the release workflow can publish build provenance.

## Required Release Secrets

- Windows signing: `WINDOWS_CODESIGN_CERTIFICATE` and `WINDOWS_CODESIGN_PASSWORD`.
- macOS signing and notarization: `MACOS_CODESIGN_CERTIFICATE`, `MACOS_CODESIGN_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`.
- GitHub release publishing uses the job-scoped `GITHUB_TOKEN` only in the protected publish job.

## Manual Verification

Run these checks before approving the `release` environment:

```bash
npm run github:workflows:validate
npm run renderer:security:validate
npm run secrets:validate
npm run release:governance:validate
npm run release:signing:validate -- --mode production --platform linux
npm run release:validate
```

Platform signing verification commands:

```powershell
Get-AuthenticodeSignature release\*.exe
```

```bash
codesign --verify --deep --strict "release/mac/PostMeter.app"
spctl --assess --type execute "release/mac/PostMeter.app"
xcrun stapler validate release/*.dmg
```

Linux artifacts are verified with `SHA256SUMS`, `release-manifest.json`, and GitHub artifact provenance from the release workflow attestation job.
