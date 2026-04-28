# Postman Desktop Observation Fixtures

This directory is the recording path for Postman scripting surfaces that Newman cannot execute, such as `pm.vault`, `pm.mock`, `pm.state`, gRPC hooks and live desktop transport, GraphQL-specific hooks, visualizer rendering details, and desktop permission prompts.

Each observation file should copy `observation-template.json`, fill in the Postman Desktop version, platform, source doc refs, fixture steps, observed output, and any screenshots or exported artifacts stored elsewhere in the repo. A row in `docs/postman-sandbox-parity-matrix.json` can only move from `needs-desktop-observation` to an implementation status after it references a completed observation fixture, automated desktop runner fixture, or runtime/source audit artifact.

`websocket-script-support-audit.json` is a source-audit fixture rather than an execution observation: it records that the current official WebSocket and Socket.IO request docs do not document saved/importable script hooks.
`postman-desktop-11.71.7-dynamic-host-globals-audit.json` records the installed Desktop runtime/source and `postman-sandbox@6.2.2` probe used to classify dynamic-code and host-like global behavior.
`postman-desktop-11.71.7-runtime-limits-audit.json` records the installed Desktop runtime/source, matching Newman runtime source, and bounded Newman probes used to classify timeout, timer-drain, output, visualizer, package, request, and payload resource limits.
`postman-desktop-11.71.7-httponly-cookies-audit.json` records the installed Desktop runtime/source and `newman@6.2.2` probes used to classify `HttpOnly` cookie script readability, jar mutation, and `pm.sendRequest` response-cookie behavior.
`postman-desktop-11.71.7-sendrequest-advanced-audit.json` records the installed Desktop runtime/source classification for brokered `pm.sendRequest` advanced auth, proxy, TLS, and configured client-certificate behavior.
`postman-desktop-11.71.7-sendrequest-files-audit.json` records the file/binary/form-data attachment binding policy, Newman file-body transport evidence, and PostMeter focused broker denial tests.
`postman-desktop-11.71.7-builtin-package-audit.json` records the pinned `postman-sandbox@6.2.2` bundled package versions, vendored bootcode integrity, and PostMeter's VM-only package-loader boundary.
`postman-desktop-11.71.7-commonjs-package-audit.json` records the reviewed multi-file CommonJS package-loader semantics, dependency policy, bundle integrity model, and focused PostMeter evidence that clear the package bundle-semantics blocker.
`postman-desktop-11.71.7-visualizer-handlebars-audit.json` records the audited Postman Desktop Handlebars 4.7 line, PostMeter's patched `handlebars@4.7.9` visualizer runtime decision, and focused coverage for precompiled templates, helpers, partials, decorators, `pm.getData`, reviewed assets, and visualizer isolation.
