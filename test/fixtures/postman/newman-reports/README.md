# Newman Report Evidence

This folder contains checked-in Newman JSON evidence for the Newman-compatible differential suites.

Target: `newman@6.2.2` with Postman Runtime 7.39.1.

The `raw-newman/` folder stores the captured Newman JSON reporter output. The `normalized-newman/` and `normalized-postmeter/` folders store deterministic evidence used by CI. Normalization removes timestamps, durations, localhost ports, host paths, and machine-specific metadata while preserving request order, request names, response codes, assertion names, pass/fail state, and failure messages.

Regenerate from a fresh live comparison:

```bash
npm run postman:parity:diff -- --newman --download-newman --output /tmp/postmeter-newman-evidence
npm run postman:newman-reports:write -- --from /tmp/postmeter-newman-evidence
```

Validate without network access:

```bash
npm run postman:newman-reports:validate
```

This evidence covers Newman-compatible request-script behavior. Desktop-only flows such as local vault prompts are covered by focused PostMeter tests and docs instead of Newman reports.
