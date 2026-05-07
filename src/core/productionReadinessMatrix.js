const STATUS_DESCRIPTIONS = Object.freeze({
  implemented: 'Implementation and local validation exist.',
  validated: 'Implementation has required local and native-runner evidence.',
  'external-validation-required': 'Implementation exists, but final evidence requires native runners, provider credentials plus sanitized evidence, or signing assets.',
  blocked: 'Release-blocking implementation is not complete.',
  deferred: 'Deliberately outside the current production claim.',
  'not-applicable': 'Not part of this product or release track.'
});

const RELEASE_LEVELS = Object.freeze(['beta', 'rc', 'stable']);
const RELEASE_LEVEL_POLICIES = Object.freeze({
  beta: {
    allowedReleaseBlockingStatuses: ['implemented', 'validated', 'external-validation-required'],
    allowDocumentedWaivers: false,
    description: 'Beta readiness allows implemented rows and explicitly tracked external evidence gaps, but fails on blocked release work.'
  },
  rc: {
    allowedReleaseBlockingStatuses: ['validated'],
    allowDocumentedWaivers: true,
    description: 'Release-candidate readiness requires validation for every release-blocking row unless the row carries an explicit documented waiver.'
  },
  stable: {
    allowedReleaseBlockingStatuses: ['validated'],
    allowDocumentedWaivers: false,
    description: 'Stable readiness requires every release-blocking row to be validated with required local/native/provider/signing evidence.'
  }
});
const REQUIRED_ROW_IDS = Object.freeze([
  'release.dashboard',
  'packaging.linux',
  'packaging.windows',
  'packaging.macos',
  'sandbox.script-runtime',
  'sandbox.platform-os',
  'postman.script-parity',
  'compatibility.non-postman',
  'dependencies.audit',
  'electron.security',
  'electron.runtime-version',
  'grpc.pfx-p12-mtls',
  'workspace.durability',
  'oauth.live-certification',
  'ux.accessibility',
  'diagnostics.privacy',
  'docs.public-release',
  'postman.newman-json-reports',
  'updates.metadata',
  'vault.per-request-prompts',
  'release.signing',
  'performance.local-v1',
  'load.distributed'
]);
const REQUIRED_AREAS = Object.freeze([
  'packaging',
  'security',
  'compatibility',
  'data-durability',
  'oauth',
  'ux',
  'privacy',
  'docs',
  'release',
  'transport',
  'deferred-features',
  'release-readiness'
]);

function buildProductionReadinessMatrix() {
  const rows = [
    row('release.dashboard', 'release-readiness', 'Production readiness dashboard and gates exist as generated source-owned artifacts.', 'validated', {
      releaseBlocking: true,
      commands: [
        'npm run production:readiness',
        'npm run production:readiness:write',
        'npm run production:readiness:validate',
        'npm run production:readiness:claim',
        'npm run production:readiness:claim:beta',
        'npm run production:readiness:claim:rc',
        'npm run production:readiness:claim:stable',
        'npm run release:gate'
      ],
      evidenceRefs: ['src/core/productionReadinessMatrix.js', 'docs/production-readiness-matrix.json', 'docs/RELEASE_READINESS.md', '.github/workflows/release.yml'],
      notes: 'The tag-driven release workflow runs the stable readiness claim before artifact publication.'
    }),
    row('packaging.linux', 'packaging', 'Linux deb/AppImage metadata, protocol registration, artifact checksums, and packaged sandbox validation are covered.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run dist:linux', 'npm run release:validate:packaged-smoke', 'npm run release:validate', 'npm run sandbox:validate:packaged'],
      evidenceRefs: ['scripts/validatePackagedAppSmoke.js', 'scripts/validateReleaseArtifacts.js', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/workflows/release-validation.yml']
    }),
    row('packaging.windows', 'packaging', 'Windows packaged launch, protocol registration, workspace path, and script-worker validation must run on windows-latest.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['npm run dist:win', 'npm run release:validate:packaged-smoke', 'npm run release:validate:win-protocol', 'npm run sandbox:validate:packaged'],
      evidenceRefs: ['scripts/validatePackagedAppSmoke.js', 'scripts/validateWindowsProtocolRegistration.ps1', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/workflows/release-validation.yml']
    }),
    row('packaging.macos', 'packaging', 'macOS packaged launch, protocol registration, workspace path, and script-worker validation must run on macos-latest.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['npm run dist:mac', 'npm run release:validate:packaged-smoke', 'npm run release:validate:mac-protocol', 'npm run sandbox:validate:packaged'],
      evidenceRefs: ['scripts/validatePackagedAppSmoke.js', 'scripts/validateMacProtocolRegistration.sh', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/workflows/release-validation.yml']
    }),
    row('sandbox.script-runtime', 'security', 'Script runtime validation, Postman parity gates, and adversarial sandbox probes remain green.', 'validated', {
      releaseBlocking: true,
      commands: ['npm run sandbox:validate', 'npm run postman:parity:claim', 'npm run postman:docs:validate'],
      evidenceRefs: ['docs/SANDBOX_CONTRACT.md', 'docs/postman-sandbox-parity-matrix.json']
    }),
    row('postman.script-parity', 'compatibility', 'Tracked Postman script import parity remains claim-gated against current target versions.', 'validated', {
      releaseBlocking: true,
      commands: ['npm run postman:parity:claim', 'npm run postman:docs:validate', 'npm run postman:newman-reports:validate'],
      evidenceRefs: ['docs/postman-sandbox-parity-matrix.json', 'docs/postman-docs-coverage-audit.json', 'test/fixtures/postman/newman-reports']
    }),
    row('sandbox.platform-os', 'security', 'Platform-equivalent OS sandbox claim is implemented and tracked separately from Postman API parity.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run sandbox:platform:validate', 'npm run sandbox:platform:claim'],
      evidenceRefs: ['docs/os-sandbox-platform-matrix.json', 'src/core/osSandboxPlatformMatrix.js', 'native/windows-sandbox-helper/PostMeterWindowsSandboxHelper.cpp'],
      notes: 'Linux uses bubblewrap plus seccomp, Windows uses the release-owned AppContainer helper, and macOS uses the seatbelt sandbox-exec backend. Native runner packaging rows still track platform release evidence separately.'
    }),
    row('grpc.pfx-p12-mtls', 'transport', 'HTTP and gRPC mTLS share parent-owned in-memory PFX/P12 extraction aligned with client-certificate handling.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm test'],
      evidenceRefs: ['src/core/pfxCertificate.js', 'src/core/grpcClient.js', 'src/core/httpClient.js', 'src/core/scriptedRequestLifecycle.js', 'src/core/scriptSandbox.js', 'src/core/postmanImporter.js', 'test/electron/grpcClient.test.js', 'test/electron/httpClient.test.js', 'test/electron/scriptSandbox.test.js', 'test/electron/scriptedRequestLifecycle.test.js', 'test/electron/postmanImporter.test.js'],
      notes: 'PFX/P12 parsing and encrypted PEM key normalization use node-forge in the parent process, read certificate files through regular-file, byte-capped descriptor reads, emit in-memory PEM buffers only, preserve imported Postman PFX/P12 gRPC certificate references, deny script-provided certificate/PFX/CA/passphrase path changes for pm.sendRequest and primary request mutations, fail closed on missing certificate bindings, ignore direct path fallbacks when a binding is configured, and have live HTTP/gRPC mTLS coverage for PEM/PFX plus gRPC unary, client-streaming, server-streaming, and bidirectional calls and negative extraction failures.'
    }),
    row('vault.per-request-prompts', 'security', 'Per-request vault prompt decisions are brokered without exposing vault secrets to scripts or renderer APIs.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm test'],
      evidenceRefs: ['src/core/scriptSandbox.js', 'src/core/scriptedRequestLifecycle.js', 'src/core/collectionRunner.js', 'src/core/models.js', 'src/core/workspaceMigrations.js', 'electron/vaultPrompt.js', 'electron/requestIpc.js', 'electron/runtimeIpc.js', 'src/renderer/index.html', 'src/renderer/rendererBootstrap.js', 'src/renderer/vaultPromptQueue.js', 'docs/TROUBLESHOOTING.md', 'test/electron/scriptSandbox.test.js', 'test/electron/collectionRunner.test.js', 'test/electron/runnerModel.test.js', 'test/electron/runtimeIpc.test.js', 'test/electron/vaultPrompt.test.js', 'test/electron/vaultPromptQueue.test.js', 'test/electron/rendererBootstrap.test.js', 'test/electron/workspaceStore.test.js'],
      notes: 'Desktop single-request sends, collection runs, and nested request lifecycle executions forward metadata-only vault prompt callbacks into the isolated script lifecycle. Prompt payloads include bounded request, collection, workspace, operation, and key metadata only; prompt controls cover deny, request, collection, workspace, and reset decisions; concurrent renderer prompts are queued so each broker prompt resolves against its own prompt id; prompt responses are accepted only from the prompting renderer; grants persist as scoped metadata for the prompted workspace, explicit denials override broader grants, denials stop code after the vault call, audit entries cover prompt grant/deny/reset, get/set/unset, denied-after-call, and unavailable-encryption outcomes, workspace save/export strips vault-shaped plaintext/ciphertext fields, and troubleshooting docs explain prompt, binding, denial/reset, and encryption-unavailable behavior.'
    }),
    row('postman.newman-json-reports', 'compatibility', 'Deterministic Newman JSON evidence reports for approved differential fixtures are checked in and validated.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run postman:newman-reports:validate'],
      evidenceRefs: ['scripts/newmanReports.js', 'test/fixtures/postman/newman-reports', 'test/electron/newmanReports.test.js'],
      notes: 'Checked-in raw Newman reporter output, raw PostMeter harness output, plus normalized Newman and PostMeter reports cover the seven approved Newman-compatible differential fixtures targeting newman@6.2.2 and Postman Runtime 7.39.1. The refresh script runs the approved live Newman differential and rewrites evidence in one explicit network-using step. The write path accepts only clean source summaries targeting newman@6.2.2, Postman Runtime 7.39.1, and the exact approved suite list. Validation is offline, requires exact suite coverage, rejects unexpected checked-in JSON files, clean comparison metadata, required generation metadata on every normalized report, fresh normalized Newman and PostMeter output, passing PostMeter evidence, no Newman assertion failures, preserved response-shape/body-digest evidence and console output when present, and no concrete localhost ports, local filesystem paths, generated request IDs, generated Postman request tokens, generated multipart boundaries, time-derived request signatures, machine names, or machine-specific metadata in normalized evidence.'
    }),
    row('electron.security', 'security', 'Electron BrowserWindow, main-frame-only preload, channel-level IPC, IPC sender validation, navigation, webview, permissions, file dialogs, external URL, protocol, CSP, fuse-review, and packaged-preload controls are matrixed and validated.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run electron:security:validate', 'npm test'],
      evidenceRefs: ['docs/electron-security-matrix.json', 'src/core/productionSupportMatrices.js', 'electron/appProtocol.js', 'electron/mainWindow.js', 'electron/ipcSecurity.js', 'electron/preload.js', 'electron/workspaceIpc.js', 'electron/appIpc.js', 'electron/oauthFlows.js', 'test/electron/appChrome.test.js'],
      notes: 'The source-owned Electron security matrix now enumerates the primary BrowserWindow, production webPreferences, secure custom app-content protocol with CSP/nosniff/referrer-policy headers and no renderer fetch privilege, packaged startup-smoke assertions for the trusted app-protocol renderer URL and renderer CSP, exact-initial-URL top-level navigation denial including unexpected app-protocol query changes, window-open denial, webview denial, permission denial, renderer CSP, visualizer CSP, explicit main-frame-only preload API, every IPC channel, fail-closed trusted main-frame renderer IPC sender validation including unexpected app-protocol query keys, native file-dialog groups, credential-free external URL allowlists, OAuth browser launch path, custom protocol registration path, packaged preload integrity, packaged protocol validation wiring, and documented Electron fuse review. Native runner execution evidence is still tracked by the separate packaging rows.'
    }),
    row('workspace.durability', 'data-durability', 'Workspace persistence, migrations, recovery, vault metadata, package cache, and large-workspace budgets are matrixed and validated.', 'validated', {
      releaseBlocking: true,
      commands: ['npm run workspace:durability:validate', 'npm test', 'npm run test:ui:regression'],
      evidenceRefs: [
        'docs/workspace-durability-matrix.json',
        'src/core/productionSupportMatrices.js',
        'src/core/workspacePersistence.js',
        'src/core/workspaceStore.js',
        'src/core/workspaceManager.js',
        'src/core/vaultStore.js',
        'test/electron/workspaceStore.test.js',
        'test/electron/workspaceManager.test.js',
        'test/electron/workspaceDurabilityPerformance.test.js'
      ],
      notes: 'The lower-level workspace-durability matrix has 9 implemented rows covering atomic workspace/session/backup/export writes, corrupt quarantine and no-overwrite recovery, filesystem-discovered managed workspaces, schema migrations, side-effect merge semantics, encrypted vault storage outside workspace JSON, large-workspace budgets, and import/export cancellation or parse-failure behavior. Diagnostics/privacy redaction remains tracked separately by the diagnostics.privacy readiness row.'
    }),
    row('compatibility.non-postman', 'compatibility', 'OpenAPI, HAR, curl, and native PostMeter import/export compatibility are matrixed and validated.', 'validated', {
      releaseBlocking: true,
      commands: ['npm run compatibility:non-postman:validate', 'npm test'],
      evidenceRefs: [
        'docs/non-postman-compatibility-matrix.json',
        'docs/COMPATIBILITY.md',
        'src/core/openApiFormats.js',
        'src/core/harFormats.js',
        'src/core/curlFormats.js',
        'test/electron/collectionFormats.test.js',
        'test/electron/workspaceStore.test.js',
        'test/electron/postmanImporter.test.js'
      ],
      notes: 'The source-owned non-Postman matrix has 8 implemented rows covering OpenAPI, HAR, curl, native PostMeter round trips, invalid input behavior, cross-shell quoting, privacy boundaries, and explicit preserve-only claim boundaries. Focused format tests exercise OpenAPI local references, server variables, path/query/header/cookie params, cookie API-key security, Swagger 2.0 body/form-data import, binary body hints, response examples and disabled assertions; HAR cookies, redirect, body-encoding/compression metadata, timing, and sensitive header/cookie export redaction; curl auth, redirects, compression, repeated/query data, binary/file intent, generated names, and Windows-style line-continuation quoting; plus native workspace/Postman durability coverage for complex workspace features.'
    }),
    row('dependencies.audit', 'security', 'Release dependency audit must pass with no high-severity vulnerabilities.', 'validated', {
      releaseBlocking: true,
      commands: ['npm audit --audit-level=high'],
      evidenceRefs: ['package.json', 'package-lock.json']
    }),
    row('electron.runtime-version', 'release', 'Electron runtime version is checked before production or security claims.', 'validated', {
      releaseBlocking: true,
      commands: ['npm run electron:version'],
      evidenceRefs: ['package.json', 'scripts/electronVersion.js']
    }),
    row('ux.accessibility', 'ux', 'Production user workflows, accessibility-sensitive modals, and failure states are source-matrixed, smoke-tested, artifacted, and documented before release.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['npm run ux:accessibility:validate', 'npm run test:smoke', 'npm run test:ui', 'npm run test:ui:regression', 'npm run test:ui:oauth', 'npm run test:ui:snapshot'],
      evidenceRefs: ['docs/ux-accessibility-matrix.json', 'docs/RELEASE_READINESS.md', 'src/renderer/index.html', 'src/renderer/uiRegressionSmoke.js', 'src/renderer/uiSnapshotSmoke.js', 'test/electron/startupSmoke.js', 'scripts/smokeProcess.js', 'electron/mainWindow.js'],
      notes: 'The lower-level UX/accessibility matrix enumerates first launch, workspaces, request sends, collection runs, imports/exports, OAuth flows, package review/fetch, vault prompts, file bindings, local mocks, settings/theme, update checks, accessibility semantics, in-app prompt/confirmation/notification focus management, live regions, long labels, constrained sizes, active forced-colors behavior, startup smoke, timeout-bounded child-process failure behavior, and CI failure artifacts. Source-owned implementation and local validators are complete; this row stays external-validation-required until native runner smoke evidence and final manual QA evidence are attached. Full local diagnostic bundle export remains owned by the separate diagnostics/privacy row.'
    }),
    row('diagnostics.privacy', 'privacy', 'Local diagnostics and logging remain user-controlled, cloud-free, and default-deny request/response data.', 'validated', {
      releaseBlocking: true,
      commands: ['npm run diagnostics:privacy:validate', 'npm test', 'npm run test:ui:regression'],
      evidenceRefs: ['docs/diagnostics-privacy-matrix.json', 'src/core/diagnostics.js', 'src/core/diagnosticsSettings.js', 'electron/diagnosticsIpc.js', 'electron/main.js', 'src/renderer/index.html', 'README.md', 'docs/TECH_SPECS.md', 'docs/RELEASE_READINESS.md', 'docs/TROUBLESHOOTING.md'],
      notes: 'Structured local diagnostics use bounded JSONL logs and a user-selected local bundle export. Logs and diagnostic bundles omit URLs, path/query values, methods, status codes/categories, sizes, headers, HTTP/gRPC metadata, cookies, auth material, bodies and aliases, protocol messages, response text, examples/history payloads, script-echoed traffic values, and payload-derived identifiers unless a narrow explicit current-workspace setting enables that category. Even when categories are enabled, auth schemes including header-shaped standalone Bearer/Basic/Digest/Hawk/Token/OAuth/NTLM/Negotiate tokens, comma/semicolon-delimited compound Digest-style parameters with optional whitespace around equals, JSON-escaped/double-escaped/nested-JSON camelCase auth-header aliases, AWS SigV4 and Akamai-style signature parameters, chained AWS query credentials adjacent to kebab-case OAuth secret assignments, assigned exact token/code/state fields, assigned and bare whitespace-only snake_case/kebab-case/camelCase OAuth/token fields, broad camelCase/snake_case/kebab-case token/secret/password/passwd/passphrase/credential suffix aliases, X-API-key, X-access/auth/authorization-token, CSRF/XSRF-token, JWT-token, secret-key, API-secret, subscription-key, access-key, shared-access-key, account/storage/signing/webhook/license/public key, consumer-key/secret, and OAuth-consumer-key/secret aliases, unquoted multi-word and repeated-whitespace secret fields, certificate passphrases, generic credential fields, sensitive object keys, bare, assigned, object/array, escaped, double-escaped, and nested-JSON including escaped newline/quote/backslash camelCase/snake_case/kebab-case body/bodyPreview/data/responseText/text/variables/rendered-response aliases, quoted/escaped JSON request/response context containers, plus unescaped JSON/annotated/class-style and parenthesized util-inspect URL/header/metadata array/object aliases with whitespace/colon/equals separators, structured header/metadata key/name pairs with sensitive value/raw/currentValue/schema fields, cookies, JWTs including JWT-shaped URL path/query/fragment values, private keys, UNC/extended UNC/Windows device/Windows/macOS/POSIX local paths including file:// URLs, JSON-escaped slash URLs, JSON-escaped POSIX paths, file URLs, mixed path/URL chains, URL credentials across supported and custom URL schemes, OAuth provider/progress error URL and path references, OAuth callback code/state params and token fragments, URL-encoded free-text OAuth/token parameter strings, bare DNS/IP/localhost transport endpoints, secret query/fragment/path params including path label/value and inline same-segment forms with encoded slashes, routed fragment path forms, single- and multi-encoded delimiter forms including recursively nested encoded wrapper params and structured key/value/raw/currentValue/example/schema-default arrays, source/UI/packaged smoke failure output, source/packaged sandbox validation child output, diagnostic event type/outcome/failure-code metadata including compact/delimiter-free token/code/state labels and one-letter token aliases, IPC handler/export failure messages, and secret-shaped IPC/export error names and codes are redacted. JSONL records truncate at the configured record cap before writing. Auth-scheme words embedded inside hyphenated values are not treated as standalone auth schemes, and URL opt-ins preserve non-sensitive query, fragment, and path context while redacting sensitive query, fragment, path label/value, inline path, routed fragment path, encoded delimiter, auth, and token values. The main-process export path waits for queued workspace privacy-setting saves before opening the save dialog. There is no automatic telemetry, cloud upload, account flow, screenshot inclusion, CI artifact crawling, DNS lookup, HTTP(S) request, or socket connection.'
    }),
    row('docs.public-release', 'docs', 'Public release docs explain readiness gates, compatibility claims, unsigned artifacts, support channel, and platform limitations.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run production:readiness:validate'],
      evidenceRefs: ['README.md', 'docs/TECH_SPECS.md', 'docs/RELEASE_READINESS.md', 'docs/SECURITY.md']
    }),
    row('updates.metadata', 'release', 'Release/update metadata points to GitHub Releases without introducing a cloud account gate.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run release:manifest', 'npm run release:validate'],
      evidenceRefs: ['src/core/updateChecker.js', 'scripts/writeReleaseManifest.js', 'package.json']
    }),
    row('performance.local-v1', 'deferred-features', 'Local first-class saved Performance tests are implemented as workspace-owned performanceTests with local execution, IPC, diagnostics boundaries, safety caps, import/export validation, and seven-type coverage; distributed/cloud load execution remains deferred.', 'implemented', {
      releaseBlocking: false,
      commands: ['npm run ux:accessibility:validate', 'npm run workspace:durability:validate', 'npm run compatibility:non-postman:validate', 'npm run diagnostics:privacy:validate'],
      evidenceRefs: ['README.md', 'docs/TECH_SPECS.md', 'docs/ARCHITECTURE.md', 'docs/COMPATIBILITY.md', 'docs/RELEASE_READINESS.md', 'NEXT_STEPS.MD', 'src/core/performanceRunner.js', 'electron/runtimeIpc.js', 'src/renderer/renderer.js'],
      notes: 'This row tracks the local desktop Performance implementation separately from distributed/cloud load execution, hosted agents, and JMeter compatibility.'
    }),
    row('oauth.live-certification', 'oauth', 'Live provider certification requires maintainer-owned Google, Microsoft Entra ID, and GitHub OAuth apps.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['npm run oauth:certify:validate', 'npm run oauth:certify:mock', 'npm run oauth:certify:live'],
      evidenceRefs: ['src/core/oauthProviderCertification.js', 'docs/oauth-provider-certification-matrix.json', 'docs/OAUTH_PROVIDER_CERTIFICATION.md', '.github/workflows/oauth-provider-certification.yml'],
      notes: 'Mocked certification is fully automated and runs without provider credentials. Live certification is skipped by default and requires POSTMETER_LIVE_OAUTH_CERTIFICATION=1, maintainer-owned provider clients/secrets, official-provider OAuth endpoint URLs, sanitized evidence JSON, and checksum-verified forward-slash repository-relative evidence artifacts under validation-artifacts/oauth-provider-certification/ before the row can move from external-validation-required to validated. Credentials alone are not accepted as live certification evidence.'
    }),
    row('release.signing', 'release', 'Signed/notarized stable artifacts require maintainer-controlled certificates.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['future signing/notarization workflow'],
      evidenceRefs: ['NEXT_STEPS.MD']
    }),
    row('load.distributed', 'deferred-features', 'Distributed/cloud load execution is deferred and not part of the local production claim.', 'deferred', {
      releaseBlocking: false,
      commands: [],
      evidenceRefs: ['NEXT_STEPS.MD', 'docs/COMPATIBILITY.md']
    })
  ];

  return {
    schemaVersion: 1,
    generatedFrom: 'src/core/productionReadinessMatrix.js',
    deterministic: true,
    releaseLevels: RELEASE_LEVELS,
    releasePolicies: RELEASE_LEVEL_POLICIES,
    statuses: STATUS_DESCRIPTIONS,
    rows: rows.sort((left, right) => left.id.localeCompare(right.id))
  };
}

function validateProductionReadinessMatrix(matrix) {
  const errors = [];
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return ['Production readiness matrix must be an object.'];
  }
  if (matrix.schemaVersion !== 1) {
    errors.push('Production readiness matrix schemaVersion must be 1.');
  }
  if (matrix.generatedFrom !== 'src/core/productionReadinessMatrix.js') {
    errors.push('Production readiness matrix generatedFrom must be src/core/productionReadinessMatrix.js.');
  }
  if (matrix.deterministic !== true) {
    errors.push('Production readiness matrix deterministic must be true.');
  }
  const statuses = new Set(Object.keys(matrix.statuses || {}));
  const releaseLevels = Array.isArray(matrix.releaseLevels) ? matrix.releaseLevels : [];
  if (JSON.stringify(releaseLevels) !== JSON.stringify(RELEASE_LEVELS)) {
    errors.push(`Production readiness matrix releaseLevels must be ${RELEASE_LEVELS.join(', ')}.`);
  }
  for (const releaseLevel of RELEASE_LEVELS) {
    const policy = matrix.releasePolicies?.[releaseLevel];
    if (!policy || typeof policy !== 'object') {
      errors.push(`Production readiness matrix must declare release policy ${releaseLevel}.`);
      continue;
    }
    if (!Array.isArray(policy.allowedReleaseBlockingStatuses) || !policy.allowedReleaseBlockingStatuses.length) {
      errors.push(`Production readiness release policy ${releaseLevel} must declare allowedReleaseBlockingStatuses.`);
    } else {
      for (const status of policy.allowedReleaseBlockingStatuses) {
        if (!statuses.has(status)) {
          errors.push(`Production readiness release policy ${releaseLevel} references unknown status ${status}.`);
        }
      }
    }
    if (typeof policy.allowDocumentedWaivers !== 'boolean') {
      errors.push(`Production readiness release policy ${releaseLevel} must declare allowDocumentedWaivers.`);
    }
    if (typeof policy.description !== 'string' || !policy.description.trim()) {
      errors.push(`Production readiness release policy ${releaseLevel} must declare a description.`);
    }
  }
  for (const status of Object.keys(STATUS_DESCRIPTIONS)) {
    if (!statuses.has(status)) {
      errors.push(`Production readiness matrix must declare status ${status}.`);
    } else if (typeof matrix.statuses[status] !== 'string' || !matrix.statuses[status].trim()) {
      errors.push(`Production readiness status ${status} must have a non-empty description.`);
    }
  }
  const ids = new Set();
  const areas = new Set();
  const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
  if (!rows.length) {
    errors.push('Production readiness matrix must contain rows.');
  }
  for (const item of rows) {
    if (!item || typeof item !== 'object') {
      errors.push('Production readiness matrix row must be an object.');
      continue;
    }
    if (typeof item.id !== 'string' || !item.id.trim()) {
      errors.push('Production readiness matrix row has missing or non-string id.');
      continue;
    }
    if (ids.has(item.id)) {
      errors.push(`Production readiness matrix row has duplicate id: ${item.id}.`);
    }
    ids.add(item.id);
    for (const field of ['area', 'target', 'status', 'owner', 'lastVerified', 'notes']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        if (field === 'lastVerified' || field === 'notes') {
          if (typeof item[field] !== 'string') {
            errors.push(`Production readiness row ${item.id || '<unknown>'} must declare string ${field}.`);
          }
        } else {
          errors.push(`Production readiness row ${item.id || '<unknown>'} missing ${field}.`);
        }
      }
    }
    if (typeof item.area === 'string') {
      areas.add(item.area);
      if (!REQUIRED_AREAS.includes(item.area)) {
        errors.push(`Production readiness row ${item.id} uses untracked release area ${item.area}.`);
      }
    }
    if (!statuses.has(item.status)) {
      errors.push(`Production readiness row ${item.id} has unknown status ${item.status}.`);
    }
    if (typeof item.releaseBlocking !== 'boolean') {
      errors.push(`Production readiness row ${item.id} must declare releaseBlocking.`);
    }
    if (!Array.isArray(item.commands) || !Array.isArray(item.evidenceRefs)) {
      errors.push(`Production readiness row ${item.id} must declare commands and evidenceRefs arrays.`);
    } else {
      if (item.releaseBlocking && !item.commands.length) {
        errors.push(`Production readiness row ${item.id} must declare at least one command when releaseBlocking is true.`);
      }
      if (item.releaseBlocking && !item.evidenceRefs.length) {
        errors.push(`Production readiness row ${item.id} must declare at least one evidenceRef when releaseBlocking is true.`);
      }
      for (const command of item.commands) {
        if (typeof command !== 'string' || !command.trim()) {
          errors.push(`Production readiness row ${item.id} commands must contain only non-empty strings.`);
        }
      }
      for (const ref of item.evidenceRefs) {
        if (typeof ref !== 'string' || !ref.trim()) {
          errors.push(`Production readiness row ${item.id} evidenceRefs must contain only non-empty strings.`);
        }
      }
    }
    if (item.waiver != null) {
      if (!item.waiver || typeof item.waiver !== 'object' || Array.isArray(item.waiver)) {
        errors.push(`Production readiness row ${item.id} waiver must be an object when present.`);
      } else {
        if (!Array.isArray(item.waiver.releaseLevels) || !item.waiver.releaseLevels.length) {
          errors.push(`Production readiness row ${item.id} waiver must declare releaseLevels.`);
        } else {
          for (const releaseLevel of item.waiver.releaseLevels) {
            if (!RELEASE_LEVELS.includes(releaseLevel)) {
              errors.push(`Production readiness row ${item.id} waiver references unknown release level ${releaseLevel}.`);
            }
          }
        }
        if (typeof item.waiver.reason !== 'string' || !item.waiver.reason.trim()) {
          errors.push(`Production readiness row ${item.id} waiver must declare a reason.`);
        }
        if (!Array.isArray(item.waiver.docs) || !item.waiver.docs.length) {
          errors.push(`Production readiness row ${item.id} waiver must cite docs.`);
        } else {
          for (const doc of item.waiver.docs) {
            if (typeof doc !== 'string' || !doc.trim()) {
              errors.push(`Production readiness row ${item.id} waiver docs must contain only non-empty strings.`);
            }
          }
        }
      }
    }
  }
  for (const requiredId of REQUIRED_ROW_IDS) {
    if (!ids.has(requiredId)) {
      errors.push(`Production readiness matrix is missing required row ${requiredId}.`);
    }
  }
  for (const requiredArea of REQUIRED_AREAS) {
    if (!areas.has(requiredArea)) {
      errors.push(`Production readiness matrix must track release area ${requiredArea}.`);
    }
  }
  return errors;
}

function productionReadinessSummary(matrix, releaseLevel = 'stable') {
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const byStatus = {};
  for (const item of rows) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  }
  const releaseBlockers = productionReadinessBlockers(matrix, releaseLevel);
  return {
    releaseLevel,
    rowCount: rows.length,
    byStatus,
    releaseBlockerCount: releaseBlockers.length,
    releaseBlockers: releaseBlockers.map((item) => item.id)
  };
}

function productionReadinessBlockers(matrix, releaseLevel = 'stable') {
  const policy = releasePolicy(matrix, releaseLevel);
  const allowedStatuses = new Set(policy.allowedReleaseBlockingStatuses);
  return (Array.isArray(matrix?.rows) ? matrix.rows : [])
    .filter((item) => item.releaseBlocking && !allowedStatuses.has(item.status))
    .filter((item) => !(policy.allowDocumentedWaivers && rowWaivedForReleaseLevel(item, releaseLevel)));
}

function releasePolicy(matrix, releaseLevel = 'stable') {
  if (!RELEASE_LEVELS.includes(releaseLevel)) {
    throw new Error(`Unknown production readiness release level: ${releaseLevel}`);
  }
  return matrix?.releasePolicies?.[releaseLevel] || RELEASE_LEVEL_POLICIES[releaseLevel];
}

function rowWaivedForReleaseLevel(rowItem, releaseLevel) {
  return Boolean(Array.isArray(rowItem?.waiver?.releaseLevels)
    && rowItem.waiver.releaseLevels.includes(releaseLevel)
    && typeof rowItem.waiver.reason === 'string'
    && rowItem.waiver.reason.trim()
    && Array.isArray(rowItem.waiver.docs)
    && rowItem.waiver.docs.length > 0
    && rowItem.waiver.docs.every((doc) => typeof doc === 'string' && doc.trim()));
}

function row(id, area, target, status, options = {}) {
  const item = {
    id,
    area,
    target,
    status,
    releaseBlocking: options.releaseBlocking === true,
    commands: Array.isArray(options.commands) ? options.commands : [],
    evidenceRefs: Array.isArray(options.evidenceRefs) ? options.evidenceRefs : [],
    owner: options.owner || 'PostMeter',
    lastVerified: options.lastVerified || '',
    notes: options.notes || ''
  };
  if (options.waiver != null) {
    item.waiver = options.waiver;
  }
  return item;
}

module.exports = {
  buildProductionReadinessMatrix,
  productionReadinessBlockers,
  productionReadinessSummary,
  rowWaivedForReleaseLevel,
  validateProductionReadinessMatrix
};
