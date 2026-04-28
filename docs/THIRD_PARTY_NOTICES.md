# Third-Party Notices

## Postman Sandbox Bootcode

`src/core/postmanSandboxBootcodeBundle.js` contains a gzip-compressed generated artifact derived from `postman-sandbox@6.2.2` `.cache/bootcode.browser.js`.

- Source package: `postman-sandbox@6.2.2`
- Source license: Apache-2.0
- Postman parity target: Postman Desktop 11.71.7 with `postman-sandbox@6.2.2` and Postman Runtime 7.50.0; Newman-compatible surfaces target `newman@6.2.2` with Postman Runtime 7.39.1.
- PostMeter modification: the Browserify entry module list is disabled before compression so the artifact installs only Postman's bundled package/module resolver inside PostMeter's script VM.
- Integrity check: the inflated artifact is verified against a checked-in SHA-256 digest before it can install the VM package resolver.
- Runtime boundary: scripts can only access this bundle through PostMeter's allowlisted `pm.require()` / `require()` policy; it does not grant host Node, filesystem, process, Electron, renderer, shell, native module, path, or registry access.

Apache License 2.0 text: https://www.apache.org/licenses/LICENSE-2.0

## Handlebars Visualizer Runtime

`src/core/visualizerHandlebarsBundle.js` contains a gzip-compressed generated artifact derived from `handlebars@4.7.9` `dist/handlebars.js`.

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
- Runtime boundary: these packages are loaded only by the parent/core transport. Scripts can mutate gRPC metadata, messages, method path, and target URL through hardened Postman-compatible facades, but they never receive raw gRPC clients, channels, calls, sockets, proto-loader handles, filesystem handles, TLS material, or certificate file contents.

Apache License 2.0 text: https://www.apache.org/licenses/LICENSE-2.0
