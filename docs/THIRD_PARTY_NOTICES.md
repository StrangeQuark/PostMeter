# Third-Party Notices

## Runtime And Packaging Dependency Inventory

This inventory is intentionally limited to direct runtime dependencies plus the packaging dependencies that ship with, or materially help produce, desktop release artifacts. It must stay aligned with `package-lock.json`.

| Package | License | V1 usage boundary |
| --- | --- | --- |
| `@grpc/grpc-js@1.14.4` | Apache-2.0 | Parent-owned gRPC transport only. |
| `@grpc/proto-loader@0.8.1` | Apache-2.0 | Parent-owned `.proto` loading for gRPC requests only. |
| `@xmldom/xmldom@0.9.10` | MIT | Import/export XML parsing and formatting helpers. |
| `electron@42.2.0` | MIT | Desktop shell runtime and packaged application host. |
| `electron-builder@26.8.1` | MIT | Release packaging, installer, and artifact generation tooling. |
| `electron-updater@6.8.3` | MIT | GitHub update metadata checks and packaged update flow. |
| `handlebars@4.7.9` | MIT | Isolated visualizer runtime bundle. |
| `markdown-it@14.1.1` | MIT | Renderer-side markdown preview and documentation rendering. |
| `node-forge@1.4.0` | `(BSD-3-Clause OR GPL-2.0)` | Parent-owned PFX/P12 certificate parsing; PostMeter relies on the BSD-3-Clause option. |
| `node-html-parser@7.1.0` | MIT | Test/build-time renderer HTML contract parsing. |
| `psl@1.15.0` | MIT | Cookie/public suffix normalization. |
| `xpath@0.0.34` | MIT | XML selector support for import/export and request workflows. |
| `yaml@2.9.0` | ISC | OpenAPI, workflow, and release matrix YAML parsing. |

## Postman Sandbox Bootcode

`src/core/sandbox/postmanSandboxBootcodeBundle.js` contains a gzip-compressed generated artifact derived from `postman-sandbox@6.2.2` `.cache/bootcode.browser.js`.

- Source package: `postman-sandbox@6.2.2`
- Source license: Apache-2.0
- Postman parity target: Postman Desktop 11.71.7 with `postman-sandbox@6.2.2` and Postman Runtime 7.50.0; Newman-compatible surfaces target `newman@6.2.2` with Postman Runtime 7.39.1.
- PostMeter modification: the Browserify entry module list is disabled before compression so the artifact installs only Postman's bundled package/module resolver inside PostMeter's script VM.
- Integrity check: the inflated artifact is verified against a checked-in SHA-256 digest before it can install the VM package resolver.
- Runtime boundary: scripts can only access this bundle through PostMeter's allowlisted `pm.require()` / `require()` policy; it does not grant host Node, filesystem, process, Electron, renderer, shell, native module, path, or registry access.

Apache License 2.0 text: https://www.apache.org/licenses/LICENSE-2.0

## Handlebars Visualizer Runtime

`src/core/sandbox/visualizerHandlebarsBundle.js` contains a gzip-compressed generated artifact derived from `handlebars@4.7.9` `dist/handlebars.js`.

- Source package: `handlebars@4.7.9`
- Source license: MIT
- Postman compatibility note: Postman Desktop 11.71.7 was audited with `handlebars@4.7.8`; PostMeter uses the patched 4.7-compatible runtime line because current npm advisories cover `<=4.7.8`.
- Integrity check: the inflated artifact is verified against a checked-in SHA-256 digest before it can initialize the visualizer compiler.
- Runtime boundary: the bundle is loaded only inside PostMeter's isolated visualizer Handlebars VM context. Visualizer output still renders in the sandboxed iframe with CSP, reviewed assets only, and no Node, Electron, renderer, parent DOM, filesystem, process, shell, or unreviewed network access.

MIT License text: https://opensource.org/license/mit

## gRPC Desktop Transport

PostMeter uses `@grpc/grpc-js` and `@grpc/proto-loader` for parent-owned live gRPC request execution.

- Source packages: `@grpc/grpc-js`, `@grpc/proto-loader`
- Source license: Apache-2.0
- Runtime boundary: these packages are loaded only by the parent/core transport. Scripts can mutate gRPC metadata, messages, method path, and target URL through hardened Postman-compatible facades, but they never receive raw gRPC clients, channels, calls, sockets, proto-loader handles, filesystem handles, TLS material, certificate file contents, private keys, PFX passphrases, or decrypted PEM temp files.

Apache License 2.0 text: https://www.apache.org/licenses/LICENSE-2.0

## PFX/P12 Certificate Parser

PostMeter uses `node-forge` for parent-owned PFX/P12 client-certificate parsing.

- Source package: `node-forge`
- Source license: `(BSD-3-Clause OR GPL-2.0)`; PostMeter relies on the BSD-3-Clause option.
- Runtime boundary: the package is loaded only in the parent/core certificate loader. It extracts PFX/P12 certificate chains and private keys into in-memory PEM buffers, normalizes encrypted PEM private keys where gRPC needs unencrypted PEM input, and does not expose certificate contents, private keys, PFX passphrases, decrypted PEM temp files, or parser handles to scripts or the renderer.

BSD 3-Clause text: https://opensource.org/license/bsd-3-clause
