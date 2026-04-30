# Newman Report Evidence

This folder contains checked-in Newman JSON evidence for the Newman-compatible differential suites.

Target: `newman@6.2.2` with Postman Runtime 7.39.1.

The `raw-newman/` folder stores the captured Newman JSON reporter output. The `raw-postmeter/` folder stores the corresponding PostMeter differential harness output. The `normalized-newman/` and `normalized-postmeter/` folders store deterministic evidence used by CI. Normalization removes volatile timestamps, durations, concrete localhost ports, host paths, generated request IDs, generated Postman request tokens, generated multipart boundaries, time-derived request signatures, machine names, and machine-specific metadata while preserving request order, request names, response codes, response-shape/body-digest evidence, assertion names, pass/fail state, failure messages, and console output when present. Each normalized report records the fixture ID, Newman target, Postman Runtime target, generation command, normalization schema version, and generated timestamp. The write path accepts only clean source differential summaries that target `newman@6.2.2`, Postman Runtime 7.39.1, and the exact approved suite list.

Regenerate from a fresh live comparison:

```bash
npm run postman:newman-reports:refresh -- --download-newman
```

Equivalent explicit two-step flow:

```bash
npm run postman:parity:diff -- --newman --download-newman --output /tmp/postmeter-newman-evidence
npm run postman:newman-reports:write -- --from /tmp/postmeter-newman-evidence
```

Validate without network access:

```bash
npm run postman:newman-reports:validate
```

Validation rejects stale normalized output, mismatched targets, incomplete or reordered suites, unexpected checked-in JSON files, failing PostMeter evidence, Newman assertion failures, and leaked nondeterministic values.

This evidence covers Newman-compatible request-script behavior. Desktop-only flows such as local vault prompts are covered by focused PostMeter tests and docs instead of Newman reports.
