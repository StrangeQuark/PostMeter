# Release Security Checklist

PostMeter release security depends on repository controls that cannot be fully enforced from source code. Maintainers must verify these controls before publishing a production release. Users should verify checksums, release metadata, and GitHub provenance attestations.

## Required GitHub Controls

- Keep protected `main` enabled with required reviews, required status checks, and no direct pushes.
- Keep protected `v*` tags enabled so release tags cannot be force-pushed or created without maintainer approval.
- Require the full CI, release validation, sandbox validation, workflow validation, renderer security lint, secret scan, and high-severity dependency audit status checks before merging.
- Use the protected `release` environment for publishing and require release environment approval before the publish job can run.
- Enable GitHub secret scanning and push protection for the repository and owning organization.
- Enable Dependabot security updates. The CI workflow runs GitHub dependency review on pull requests and fails high-severity dependency changes.
- Keep GitHub artifact attestations enabled for the repository so the release workflow can publish build provenance.

## Release Credentials

- GitHub release publishing uses the job-scoped `GITHUB_TOKEN` only in the protected publish job.

## Manual Verification

Run these checks before approving the `release` environment:

```bash
npm run github:workflows:validate
npm run renderer:security:validate
npm run secrets:validate
npm run release:governance:validate
npm run release:validate
```

Artifacts are verified with `SHA256SUMS`, `release-manifest.json`, and GitHub artifact provenance from the release workflow attestation job.
