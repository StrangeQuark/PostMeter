# Postman Desktop Observation Fixtures

This directory is the recording path for Postman scripting surfaces that Newman cannot execute, such as `pm.vault`, `pm.mock`, `pm.state`, gRPC hooks, GraphQL-specific hooks, visualizer rendering details, and desktop permission prompts.

Each observation file should copy `observation-template.json`, fill in the Postman Desktop version, platform, source doc refs, fixture steps, observed output, and any screenshots or exported artifacts stored elsewhere in the repo. A row in `docs/postman-sandbox-parity-matrix.json` can only move from `needs-desktop-observation` to an implementation status after it references a completed observation fixture or an automated desktop runner fixture.

`websocket-script-support-audit.json` is a source-audit fixture rather than an execution observation: it records that the current official WebSocket and Socket.IO request docs do not document saved/importable script hooks.
