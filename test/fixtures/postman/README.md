# Postman/Newman Sandbox Corpus

These fixtures are exported Postman Collection v2.1 JSON documents used as the sandbox v1 compatibility corpus. The upstream Newman reference target is the current npm `latest` dist-tag resolved on April 25, 2026: `newman@6.2.2`.

- `newman-sandbox-v1.collection.json` covers async ordering, nested `pm.sendRequest`, iteration data, current-URL and jar-style cookie helpers including hostname and object-set forms, variable precedence, bundled `pm.require`/`require` packages, `pm.execution.runRequest`, `pm.visualizer`, brokered `pm.vault`, execution control, skipped requests, and mixed `pm.test` pass/fail behavior.
- `newman-sandbox-v1.iteration-data.json` is the data row used by the main corpus run.
- `newman-sandbox-v1.expected.json` records the stable PostMeter/Newman-style run outcomes asserted by automated tests.
- `newman-cancellation.collection.json` covers cancellation of pending async sandbox work.

When maintainers provide canonical Newman JSON exports for these same fixtures, generate them with `newman@6.2.2`, add them beside the current expected file, and keep the automated assertions aligned with the implemented safe sandbox subset. `pm.vault` is treated as a Postman sandbox parity fixture because current Newman/Postman CLI runs do not expose vault access.
