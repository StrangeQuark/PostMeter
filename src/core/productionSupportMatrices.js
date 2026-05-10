const MATRIX_BUILDERS = Object.freeze({
  'diagnostics-privacy': buildDiagnosticsPrivacyMatrix,
  'electron-security': buildElectronSecurityMatrix,
  'workspace-durability': buildWorkspaceDurabilityMatrix,
  'non-postman-compatibility': buildNonPostmanCompatibilityMatrix,
  'ux-accessibility': buildUxAccessibilityMatrix
});

const SUPPORT_MATRIX_STATUSES = new Set([
  'implemented',
  'documented-gap',
  'deferred',
  'not-applicable'
]);

const ELECTRON_IPC_CHANNELS = Object.freeze([
  ipcChannel('app:versions', 'renderer-to-main', 'Version metadata query with no renderer payload.', ['electron/appIpc.js', 'electron/preload.js'], ['test/electron/appIpc.test.js']),
  ipcChannel('app:check-updates', 'renderer-to-main', 'Update-check request with validated prerelease options.', ['electron/appIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/appIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('app:open-external', 'renderer-to-main', 'External URL request limited to validated credential-free HTTPS GitHub URLs.', ['electron/appIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/appIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('menu:action', 'main-to-renderer', 'Native menu event delivered to the explicit preload subscription.', ['electron/main.js', 'electron/appMenu.js', 'electron/preload.js'], ['test/electron/appChrome.test.js']),
  ipcChannel('session:load', 'renderer-to-main', 'UI session load through the trusted renderer IPC wrapper.', ['electron/sessionIpc.js', 'electron/preload.js'], ['test/electron/sessionIpc.test.js', 'test/electron/sessionStore.test.js']),
  ipcChannel('session:save', 'renderer-to-main', 'Asynchronous UI session save through the trusted renderer IPC wrapper.', ['electron/sessionIpc.js', 'electron/preload.js'], ['test/electron/sessionIpc.test.js', 'test/electron/sessionStore.test.js']),
  ipcChannel('session:saveSync', 'renderer-to-main-sync', 'Synchronous shutdown UI session save through the trusted renderer IPC wrapper.', ['electron/sessionIpc.js', 'electron/preload.js'], ['test/electron/sessionIpc.test.js', 'test/electron/sessionStore.test.js']),
  ipcChannel('workspace:load', 'renderer-to-main', 'Workspace load returns schema-validated workspace metadata.', ['electron/workspaceIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('workspace:save', 'renderer-to-main', 'Whole-workspace save validates the workspace payload before persistence.', ['electron/workspaceIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('workspace:saveRequest', 'renderer-to-main', 'Targeted request save validates request, variables, and cookie payload shape.', ['electron/workspaceIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('workspace:saveEnvironment', 'renderer-to-main', 'Targeted environment save validates environment payload shape.', ['electron/workspaceIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('workspace:saveSettings', 'renderer-to-main', 'Workspace settings save validates settings-only payloads.', ['electron/workspaceIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('workspace:saveSync', 'renderer-to-main-sync', 'Synchronous shutdown workspace save validates the workspace payload and skips stale full-workspace writes while queued workspace mutations are pending.', ['electron/workspaceIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('workspace:create', 'renderer-to-main', 'Workspace creation remains main-process owned.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:rename', 'renderer-to-main', 'Workspace rename validates workspace ID and bounded name input.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:switch', 'renderer-to-main', 'Workspace switch validates non-empty workspace IDs before loading.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:delete', 'renderer-to-main', 'Workspace delete validates non-empty workspace IDs before destructive store operations.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:duplicate', 'renderer-to-main', 'Workspace duplication validates non-empty workspace IDs before creating a separate workspace file.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:import', 'renderer-to-main', 'Workspace import accepts a renderer-selected local path from the shared drag/drop picker or falls back to a main-process JSON picker, then returns a validated file-operation result.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:export', 'renderer-to-main', 'Workspace export validates optional workspace payload/ID before a main-process JSON save picker.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('collection:import', 'renderer-to-main', 'Collection import accepts a renderer-selected local path from the shared drag/drop picker or falls back to a main-process picker constrained to supported collection formats.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/collectionFormats.test.js']),
  ipcChannel('collection:export', 'renderer-to-main', 'Collection export validates collection payload and export format before a main-process save picker.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('environment:import', 'renderer-to-main', 'Environment import accepts a renderer-selected local path from the shared drag/drop picker or falls back to a JSON picker, then validates native or Postman environment payloads.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/environmentFormats.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/environmentFormats.test.js']),
  ipcChannel('environment:export', 'renderer-to-main', 'Environment export validates environment payloads and writes native PostMeter or Postman environment JSON through a main-process save picker.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/environmentFormats.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/environmentFormats.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('request:examples:export', 'renderer-to-main', 'Request example export validates the request payload before writing a selected JSON file.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('request:validate', 'renderer-to-main', 'Single request validation validates request and environment payloads.', ['electron/requestIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/requestIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('request:send', 'renderer-to-main', 'Single request send validates request/environment payloads and validates response payloads before returning.', ['electron/requestIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/requestIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('diagnostics:export', 'renderer-to-main', 'Diagnostic export opens a main-process save dialog and writes a sanitized local bundle only to the selected path.', ['electron/diagnosticsIpc.js', 'electron/preload.js', 'src/core/diagnostics.js'], ['test/electron/diagnosticsIpc.test.js', 'test/electron/diagnostics.test.js']),
  ipcChannel('file-export:choosePath', 'renderer-to-main', 'Picker-first export opens a save dialog from lightweight metadata before expensive export preparation.', ['electron/exportIpc.js', 'electron/preload.js', 'electron/fileDialogs.js'], ['test/electron/exportIpc.test.js']),
  ipcChannel('file-export:prepare', 'renderer-to-main', 'Picker-first export preparation validates and serializes export payloads in a worker while the save dialog is open.', ['electron/exportIpc.js', 'electron/exportPreparationWorker.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/exportIpc.test.js']),
  ipcChannel('file-export:writePrepared', 'renderer-to-main', 'Picker-first export writes a prepared export only to the user-selected validated save path.', ['electron/exportIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/workspacePersistence.js'], ['test/electron/exportIpc.test.js']),
  ipcChannel('file-export:cancelPrepared', 'renderer-to-main', 'Picker-first export cancellation terminates active export preparation and clears prepared content if the user cancels the picker.', ['electron/exportIpc.js', 'electron/preload.js'], ['test/electron/exportIpc.test.js']),
  ipcChannel('oauth:pkce:start', 'renderer-to-main', 'OAuth PKCE start validates ID, auth, environment, and strategy before flow orchestration.', ['electron/oauthIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/oauthIpc.test.js', 'test/electron/auth.test.js']),
  ipcChannel('oauth:device:start', 'renderer-to-main', 'OAuth device start validates ID, auth, and environment before flow orchestration.', ['electron/oauthIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/oauthIpc.test.js', 'test/electron/auth.test.js']),
  ipcChannel('oauth:device:cancel', 'renderer-to-main', 'OAuth device cancellation validates the flow ID before aborting.', ['electron/oauthIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/oauthIpc.test.js']),
  ipcChannel('oauth:cancel', 'renderer-to-main', 'OAuth cancellation validates the flow ID before aborting.', ['electron/oauthIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/oauthIpc.test.js']),
  ipcChannel('oauth:progress', 'main-to-renderer', 'OAuth progress events are asserted before delivery to the renderer subscription.', ['electron/main.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/oauthIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('vault:metadata', 'renderer-to-main', 'Vault metadata query returns audit/secret metadata only through the trusted renderer IPC wrapper.', ['electron/main.js', 'electron/preload.js'], ['test/electron/vaultStore.test.js']),
  ipcChannel('vault:reset', 'renderer-to-main', 'Vault reset is scoped to the active workspace vault path.', ['electron/main.js', 'electron/preload.js'], ['test/electron/vaultStore.test.js']),
  ipcChannel('vault:bind-secret', 'renderer-to-main', 'Vault secret binding stores values parent-side without exposing vault storage paths.', ['electron/main.js', 'electron/preload.js'], ['test/electron/vaultStore.test.js']),
  ipcChannel('vault:unset-secret', 'renderer-to-main', 'Vault secret unset removes the active workspace secret parent-side.', ['electron/main.js', 'electron/preload.js'], ['test/electron/vaultStore.test.js']),
  ipcChannel('vault:prompt', 'main-to-renderer', 'Vault prompt events carry metadata only and never include secret values.', ['electron/vaultPrompt.js', 'electron/preload.js'], ['test/electron/vaultPrompt.test.js', 'test/electron/vaultPromptQueue.test.js']),
  ipcChannel('vault:prompt-response', 'renderer-to-main', 'Vault prompt responses must come from the original trusted renderer sender and normalize grant decisions.', ['electron/vaultPrompt.js', 'electron/preload.js'], ['test/electron/vaultPrompt.test.js', 'test/electron/vaultPromptQueue.test.js']),
  ipcChannel('sandbox-package:fetch', 'renderer-to-main', 'Sandbox package review fetch normalizes source URL inputs and returns bounded reviewed package metadata.', ['electron/sandboxPackageIpc.js', 'electron/preload.js'], ['test/electron/sandboxPackageIpc.test.js', 'test/electron/sandboxPackageFetcher.test.js']),
  ipcChannel('runner:start', 'renderer-to-main', 'Collection-run start validates ID, collection, environment, and config payloads.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('runner:cancel', 'renderer-to-main', 'Collection-run cancellation validates the active run ID before aborting.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('runner:export', 'renderer-to-main', 'Collection-run export validates result/format payloads before a main-process save picker.', ['electron/runtimeIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('runner:importDefinition', 'renderer-to-main', 'Runner definition import accepts a renderer-selected local path from the shared drag/drop picker or falls back to a JSON picker, then validates native runner payloads.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/runnerFormats.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/runnerFormats.test.js']),
  ipcChannel('runner:exportDefinition', 'renderer-to-main', 'Runner definition export validates a saved runner payload before writing native runner JSON through a main-process save picker.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/runnerFormats.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/runnerFormats.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('runner:progress', 'main-to-renderer', 'Collection-run progress events are asserted before delivery to the renderer subscription.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('performance:start', 'renderer-to-main', 'Performance-test start validates ID, saved test payload, environment, safety limits, and progress payloads before local execution.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js', 'src/core/performanceRunner.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js', 'test/electron/performanceRunner.test.js']),
  ipcChannel('performance:cancel', 'renderer-to-main', 'Performance-test cancellation validates the active run ID before aborting the local run.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('performance:calibrate', 'renderer-to-main', 'Performance calibration validates a runtime ID, starts a temporary 127.0.0.1 loopback server, streams progress, and returns bounded target-rate probe plus short edge-verification results with local latency-knee rejection for local client capacity.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js', 'src/core/performanceCalibration.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/performanceCalibration.test.js']),
  ipcChannel('performance:calibrate:cancel', 'renderer-to-main', 'Performance calibration cancellation validates the active calibration ID before aborting loopback requests and closing the temporary server.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js', 'src/core/performanceCalibration.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/performanceCalibration.test.js']),
  ipcChannel('performance:import', 'renderer-to-main', 'Performance-test import accepts a renderer-selected local path from the shared drag/drop picker or falls back to a main-process picker constrained to native performance-test JSON files.', ['electron/runtimeIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/performanceFormats.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/performanceRunner.test.js']),
  ipcChannel('performance:export', 'renderer-to-main', 'Performance-test export validates a saved test definition before writing native performance-test JSON through a main-process save picker.', ['electron/runtimeIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js', 'src/core/performanceFormats.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js', 'test/electron/performanceRunner.test.js']),
  ipcChannel('performance:exportResult', 'renderer-to-main', 'Performance-result export validates bounded run output before writing JSON or CSV through a main-process save picker.', ['electron/runtimeIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js', 'src/core/performanceFormats.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js', 'test/electron/performanceRunner.test.js']),
  ipcChannel('performance:progress', 'main-to-renderer', 'Performance-test and calibration progress events are asserted before delivery to the renderer subscription.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js'])
]);

const REQUIRED_ELECTRON_SECURITY_ROWS = Object.freeze([
  'browser-window.single-window',
  'browser-window.webpreferences',
  'browser-window.navigation',
  'browser-window.window-open',
  'browser-window.webview-denied',
  'permissions.denied',
  'renderer.csp',
  'protocol.app-content',
  'visualizer.csp',
  'preload.explicit-api',
  'preload.main-frame-only',
  'ipc.app',
  'ipc.session',
  'ipc.workspace',
  'ipc.request',
  'ipc.diagnostics',
  'ipc.runtime',
  'ipc.oauth',
  'ipc.vault',
  'ipc.sandbox-package',
  'ipc.sender-validation',
  'file-dialogs.workspace',
  'file-dialogs.collection-and-examples',
  'external-url.app-help-allowlist',
  'external-url.oauth-browser-launch',
  'protocol.oauth-custom-scheme',
  'packaged.preload-integrity',
  'packaged.protocol-registration',
  'electron.fuses-reviewed',
  ...ELECTRON_IPC_CHANNELS.map((channel) => channel.id)
]);

const REQUIRED_NON_POSTMAN_COMPATIBILITY_ROWS = Object.freeze([
  'curl.cross-shell-quoting',
  'curl.import-export',
  'har.import-export',
  'har.privacy-export-boundary',
  'native-postmeter.performance-tests',
  'native-postmeter.roundtrip',
  'openapi.import-export',
  'openapi.invalid-common-specs',
  'unsupported.claim-boundaries'
]);

const REQUIRED_UX_ACCESSIBILITY_ROWS = Object.freeze([
  'workflow.first-launch-empty-state',
  'workflow.workspace-management',
  'workflow.request-edit-send',
  'workflow.collection-runner',
  'workflow.import-export',
  'workflow.oauth',
  'workflow.sandbox-package-review',
  'workflow.vault-prompts',
  'workflow.file-bindings',
  'workflow.local-mocks',
  'workflow.performance',
  'workflow.settings-theme',
  'workflow.update-check',
  'workflow.diagnostics-export',
  'a11y.tabs-and-panels',
  'a11y.modal-focus-management',
  'a11y.live-regions',
  'a11y.dynamic-controls',
  'coverage.constrained-themes-long-labels',
  'coverage.failure-artifacts'
]);

const REQUIRED_DIAGNOSTICS_PRIVACY_ROWS = Object.freeze([
  'privacy.default-deny-request-response',
  'privacy.redaction-engine',
  'privacy.settings-validation',
  'privacy.performance-results',
  'privacy.import-reset',
  'logging.local-structured-rotation',
  'logging.event-coverage',
  'bundle.sanitized-export',
  'bundle.no-telemetry',
  'ui.workspace-controls',
  'ipc.diagnostics-export',
  'release.matrix-validation'
]);

function buildMatrix(name) {
  const builder = MATRIX_BUILDERS[name];
  if (!builder) {
    throw new Error(`Unknown production support matrix: ${name}.`);
  }
  return builder();
}

function validateMatrix(matrix, expectedName) {
  const errors = [];
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return ['Production support matrix must be an object.'];
  }
  if (matrix.schemaVersion !== 1) {
    errors.push(`${expectedName} matrix schemaVersion must be 1.`);
  }
  if (matrix.name !== expectedName) {
    errors.push(`${expectedName} matrix name mismatch.`);
  }
  const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
  if (!rows.length) {
    errors.push(`${expectedName} matrix must contain rows.`);
  }
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      errors.push(`${expectedName} matrix row must be an object.`);
      continue;
    }
    if (!row.id || ids.has(row.id)) {
      errors.push(`${expectedName} matrix row has missing or duplicate id: ${row.id || '<empty>'}.`);
    }
    ids.add(row.id);
    for (const field of ['area', 'target', 'status']) {
      if (typeof row[field] !== 'string' || !row[field].trim()) {
        errors.push(`${expectedName} matrix row ${row.id || '<unknown>'} missing ${field}.`);
      }
    }
    if (typeof row.status === 'string' && row.status.trim() && !SUPPORT_MATRIX_STATUSES.has(row.status)) {
      errors.push(`${expectedName} matrix row ${row.id || '<unknown>'} has invalid status: ${row.status}.`);
    }
    if (!Array.isArray(row.evidenceRefs) || !Array.isArray(row.tests)) {
      errors.push(`${expectedName} matrix row ${row.id || '<unknown>'} must declare evidenceRefs and tests.`);
    } else {
      if (!row.evidenceRefs.length) {
        errors.push(`${expectedName} matrix row ${row.id || '<unknown>'} must declare at least one evidence ref.`);
      }
      if (!row.tests.length) {
        errors.push(`${expectedName} matrix row ${row.id || '<unknown>'} must declare at least one test ref.`);
      }
    }
  }
  if (expectedName === 'electron-security') {
    for (const requiredRowId of REQUIRED_ELECTRON_SECURITY_ROWS) {
      if (!ids.has(requiredRowId)) {
        errors.push(`electron-security matrix must enumerate ${requiredRowId}.`);
      }
    }
  }
  if (expectedName === 'non-postman-compatibility') {
    for (const requiredRowId of REQUIRED_NON_POSTMAN_COMPATIBILITY_ROWS) {
      if (!ids.has(requiredRowId)) {
        errors.push(`non-postman-compatibility matrix must enumerate ${requiredRowId}.`);
      }
    }
  }
  if (expectedName === 'ux-accessibility') {
    for (const requiredRowId of REQUIRED_UX_ACCESSIBILITY_ROWS) {
      if (!ids.has(requiredRowId)) {
        errors.push(`ux-accessibility matrix must enumerate ${requiredRowId}.`);
      }
    }
  }
  if (expectedName === 'diagnostics-privacy') {
    for (const requiredRowId of REQUIRED_DIAGNOSTICS_PRIVACY_ROWS) {
      if (!ids.has(requiredRowId)) {
        errors.push(`diagnostics-privacy matrix must enumerate ${requiredRowId}.`);
      }
    }
  }
  return errors;
}

function buildDiagnosticsPrivacyMatrix() {
  return matrix('diagnostics-privacy', 'src/core/productionSupportMatrices.js', [
    row('privacy.default-deny-request-response', 'Privacy boundary', 'Request and response URLs, query/path values, methods, status codes/categories, sizes, headers, gRPC/HTTP metadata, cookies, body aliases, GraphQL variables, form-data parts, protocol messages, script console output, and payload-derived identifiers are omitted from diagnostics by default.', 'implemented', {
      evidenceRefs: ['src/core/diagnostics.js', 'src/core/diagnosticsSettings.js', 'src/core/models.js', 'docs/TECH_SPECS.md'],
      tests: ['test/electron/diagnostics.test.js', 'test/electron/ipcValidation.test.js']
    }),
    row('privacy.redaction-engine', 'Redaction', 'Auth schemes including header-shaped and standalone Bearer/Basic/Digest/Hawk/Token/OAuth/NTLM/Negotiate tokens, comma/semicolon-delimited compound Digest-style auth parameters with optional whitespace around equals, JSON-escaped/double-escaped/nested-JSON camelCase auth-header aliases, AWS SigV4 and Akamai-style signature parameters, chained AWS query credentials adjacent to kebab-case OAuth secret assignments, assigned exact token/code/state fields, assigned and bare whitespace-only snake_case, kebab-case, camelCase, unquoted multi-word, and repeated-whitespace OAuth/token/secret fields, broad camelCase/snake_case/kebab-case token/secret/password/passwd/passphrase/credential suffix aliases, X-API-key, X-access/auth/authorization-token, CSRF/XSRF-token, JWT-token, secret-key, API-secret, subscription-key, access-key, shared-access-key, account/storage/signing/webhook/license/public key, consumer-key/secret, and OAuth-consumer-key/secret aliases, certificate passphrases, generic credential fields, sensitive object keys, bare/quoted/structured/object-array/escaped/double-escaped/nested-JSON with escaped newline/quote/backslash sequences/multi-word/multiline camelCase/snake_case/kebab-case body/bodyPreview/data/responseText/text/variables/rendered-response aliases, quoted/escaped JSON request/response context containers, plus unescaped JSON/annotated/class-style and parenthesized util-inspect URL/header/metadata array/object aliases with whitespace/colon/equals separators in diagnostic text, structured header/metadata key/name pairs with sensitive value/raw/currentValue/schema fields, cookies, JWTs including JWT-shaped URL path/query/fragment values, private keys, Windows/UNC/extended UNC and Windows device/macOS/broad POSIX local paths including file:// URLs, JSON-escaped slash URLs, JSON-escaped POSIX paths, file URLs, and mixed Windows/POSIX/URL path chains, URL credentials across supported and custom URL schemes, OAuth provider/progress error URL and path references, OAuth callback code/state params and token fragments, URL-encoded free-text OAuth/token parameter strings, bare DNS/IP/localhost transport endpoints, secret query/fragment/path params including path label/value and inline same-segment forms with encoded slashes, routed fragment path forms, single- and multi-encoded delimiter forms including recursively nested encoded wrapper params and structured key/value/raw/currentValue/example/schema-default arrays, source/UI/packaged smoke failure output, source/packaged sandbox validation child output, diagnostic event type/outcome/failure-code metadata including compact/delimiter-free token/code/state labels and one-letter token aliases, IPC handler/export failure messages, and secret-shaped IPC/export error names and codes are redacted even when a narrow request/response logging category is enabled; auth-scheme words embedded inside hyphenated values are not treated as standalone auth schemes, and URL opt-ins preserve non-sensitive query, fragment, and path context while redacting sensitive query, fragment, path label/value, inline path, routed fragment path, encoded delimiter, auth, and token values.', 'implemented', {
      evidenceRefs: ['src/core/diagnostics.js', 'electron/ipcSecurity.js', 'electron/diagnosticsIpc.js', 'electron/mainWindow.js', 'scripts/smokeProcess.js', 'scripts/validateSandboxRuntime.js', 'scripts/validatePackagedAppSmoke.js'],
      tests: ['test/electron/diagnostics.test.js', 'test/electron/diagnosticsEscapedRedaction.test.js', 'test/electron/diagnosticsIpc.test.js', 'test/electron/auth.test.js', 'test/electron/appChrome.test.js', 'test/electron/mainWindowSmoke.test.js', 'test/electron/smokeProcess.test.js', 'test/electron/packagedAppSmoke.test.js']
    }),
    row('privacy.settings-validation', 'Settings', 'Diagnostics settings are normalized and IPC-validated as a workspace-scoped allowlist; request/response categories remain false unless the user explicitly enables each category.', 'implemented', {
      evidenceRefs: ['src/core/diagnosticsSettings.js', 'src/core/ipcValidation.js', 'src/core/payloadSchemas.js', 'src/renderer/renderer.js'],
      tests: ['test/electron/diagnostics.test.js', 'test/electron/ipcValidation.test.js', 'test/electron/workspaceIpc.test.js']
    }),
    row('privacy.performance-results', 'Performance results', 'Local Performance tests keep configurations, progress, result samples, exports, diagnostics, and failure artifacts bounded and default-deny for request/response data; no Performance diagnostic path introduces telemetry, cloud upload, account-gated execution, or distributed result collection.', 'implemented', {
      evidenceRefs: ['docs/TECH_SPECS.md', 'docs/RELEASE_READINESS.md', 'src/core/performanceRunner.js', 'electron/runtimeIpc.js'],
      tests: ['test/electron/performanceFeatureCoverage.test.js', 'test/electron/performanceRunner.test.js', 'test/electron/runtimeIpc.test.js', 'test/electron/diagnostics.test.js', 'test/electron/diagnosticsIpc.test.js']
    }),
    row('privacy.import-reset', 'Workspace import', 'Imported native workspaces cannot silently enable request/response diagnostic logging; import resets diagnostics settings to the product defaults.', 'implemented', {
      evidenceRefs: ['src/core/workspaceStore.js', 'src/core/diagnosticsSettings.js'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/diagnostics.test.js']
    }),
    row('logging.local-structured-rotation', 'Local logging', 'Structured JSONL diagnostics are local-only, level-gated, record-size capped with truncation at the configured record cap, file-size capped, and rotated with a bounded file count under the app user-data diagnostics directory.', 'implemented', {
      evidenceRefs: ['src/core/diagnostics.js', 'electron/main.js'],
      tests: ['test/electron/diagnostics.test.js']
    }),
    row('logging.event-coverage', 'Event coverage', 'Failed imports, sends, collection runs, OAuth flows, package fetches, vault prompts, sandbox denials, OS sandbox backend selection and required-launch failures, workspace recovery, update checks, and packaged/startup validation failures emit non-secret structured diagnostic events while preserving documented internal denial failure codes.', 'implemented', {
      evidenceRefs: ['electron/requestIpc.js', 'electron/runtimeIpc.js', 'electron/workspaceIpc.js', 'electron/oauthIpc.js', 'electron/sandboxPackageIpc.js', 'electron/vaultPrompt.js', 'electron/appIpc.js', 'electron/main.js', 'electron/mainDiagnostics.js', 'src/core/scriptSandbox.js', 'src/core/osSandbox.js'],
      tests: ['test/electron/requestIpc.test.js', 'test/electron/runtimeIpc.test.js', 'test/electron/workspaceIpc.test.js', 'test/electron/oauthIpc.test.js', 'test/electron/sandboxPackageIpc.test.js', 'test/electron/vaultPrompt.test.js', 'test/electron/appIpc.test.js', 'test/electron/diagnostics.test.js', 'test/electron/scriptedRequestLifecycle.test.js', 'test/electron/collectionRunner.test.js', 'test/electron/scriptSandbox.test.js']
    }),
    row('bundle.sanitized-export', 'Diagnostic bundle', 'The diagnostic bundle contains app/runtime metadata, sanitized settings, workspace counts, readiness summary, and recent sanitized diagnostic events without full workspace JSON, history details, cookies, secrets, request bodies, or response bodies.', 'implemented', {
      evidenceRefs: ['src/core/diagnostics.js', 'electron/diagnosticsIpc.js', 'docs/TROUBLESHOOTING.md'],
      tests: ['test/electron/diagnostics.test.js', 'test/electron/diagnosticsIpc.test.js']
    }),
    row('bundle.no-telemetry', 'No telemetry', 'Diagnostics export performs no automatic telemetry, cloud upload, PostMeter account flow, network/DNS/socket call, artifact directory crawl, screenshot inclusion, or GitHub Actions log ingestion.', 'implemented', {
      evidenceRefs: ['src/core/diagnostics.js', 'electron/diagnosticsIpc.js', 'README.md', 'docs/RELEASE_READINESS.md'],
      tests: ['test/electron/diagnostics.test.js', 'test/electron/diagnosticsIpc.test.js']
    }),
    row('ui.workspace-controls', 'Renderer UI', 'Workspace diagnostics controls surface the off-by-default request/response logging categories, warn about PII/customer data, save with rollback on persistence failure, and expose local export from the Workspace panel and Help menu.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/rendererBootstrap.js', 'src/renderer/uiRegressionSmoke.js', 'electron/appMenu.js'],
      tests: ['test/electron/rendererBootstrap.test.js', 'test/electron/mainWindowSmoke.test.js', 'npm run test:ui:regression']
    }),
    row('ipc.diagnostics-export', 'IPC', 'Diagnostic export is main-process owned, waits for queued workspace privacy-setting saves before export, uses a JSON save dialog, redacts export failure messages before they reach the renderer, returns the same bounded file-operation shape as other exports, and never exposes arbitrary file reads or upload behavior to the renderer.', 'implemented', {
      evidenceRefs: ['electron/diagnosticsIpc.js', 'electron/preload.js', 'electron/mainWindow.js', 'electron/ipcSecurity.js', 'src/core/diagnostics.js'],
      tests: ['test/electron/diagnosticsIpc.test.js', 'test/electron/appChrome.test.js', 'test/electron/mainWindowSmoke.test.js']
    }),
    row('release.matrix-validation', 'Release validation', 'The diagnostics/privacy support matrix is generated from source, checked into docs, validated by npm scripts, and referenced by the production-readiness release gate.', 'implemented', {
      evidenceRefs: ['src/core/productionSupportMatrices.js', 'scripts/productionSupportMatrix.js', 'docs/diagnostics-privacy-matrix.json', 'src/core/productionReadinessMatrix.js', 'package.json'],
      tests: ['test/electron/productionReadiness.test.js', 'npm run diagnostics:privacy:validate', 'npm run production:readiness:validate']
    })
  ]);
}

function buildElectronSecurityMatrix() {
  return matrix('electron-security', 'src/core/productionSupportMatrices.js', [
    row('browser-window.single-window', 'BrowserWindow', 'The app shell creates one primary BrowserWindow and recreates only that window on macOS activate.', 'implemented', {
      evidenceRefs: ['electron/main.js', 'electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js']
    }),
    row('browser-window.webpreferences', 'BrowserWindow', 'Renderer runs with nodeIntegration disabled, contextIsolation enabled, sandbox enabled, webSecurity enabled, and insecure content disabled.', 'implemented', {
      evidenceRefs: ['electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js', 'test/electron/uiWorkflowSmoke.js']
    }),
    row('browser-window.navigation', 'Navigation', 'Renderer-controlled top-level navigation is limited to the exact initial packaged custom-protocol renderer URL; external, arbitrary file, unexpected app-protocol path, and unexpected app-protocol query navigations are denied.', 'implemented', {
      evidenceRefs: ['electron/mainWindow.js', 'electron/appProtocol.js'],
      tests: ['test/electron/appChrome.test.js']
    }),
    row('browser-window.window-open', 'Navigation', 'Renderer-created windows are denied through setWindowOpenHandler.', 'implemented', {
      evidenceRefs: ['electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js']
    }),
    row('browser-window.webview-denied', 'Navigation', 'Renderer webview attachment is denied so untrusted embedded content cannot gain a new Electron surface.', 'implemented', {
      evidenceRefs: ['electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js']
    }),
    row('permissions.denied', 'Permissions', 'Electron permission checks and permission requests are denied by default.', 'implemented', {
      evidenceRefs: ['electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js']
    }),
    row('renderer.csp', 'Renderer', 'Renderer HTML and the custom app-content protocol both enforce a restrictive local CSP that blocks remote scripts, remote connects, object/embed content, form submission, workers, and media loading.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'electron/appProtocol.js', 'docs/TECH_SPECS.md'],
      tests: ['test/electron/appChrome.test.js', 'npm run test:ui']
    }),
    row('protocol.app-content', 'Protocol', 'The renderer is served through the secure standard postmeter-app:// custom protocol with a narrow allowlist for renderer assets, reviewed shared browser-safe core files, the app icon, and known renderer smoke query keys instead of loading the UI with file://; the handler uses no renderer fetch privilege and adds no-store, nosniff, no-referrer, and CSP response headers.', 'implemented', {
      evidenceRefs: ['electron/appProtocol.js', 'electron/main.js', 'electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js', 'test/electron/mainWindowSmoke.test.js', 'npm run release:validate:packaged-smoke', 'npm run test:smoke', 'npm run test:ui']
    }),
    row('external-url.app-help-allowlist', 'External URLs', 'General app/help external URL IPC only opens credential-free HTTPS GitHub URLs after payload validation.', 'implemented', {
      evidenceRefs: ['electron/appIpc.js', 'src/core/ipcValidation.js'],
      tests: ['test/electron/appIpc.test.js']
    }),
    row('external-url.oauth-browser-launch', 'External URLs', 'OAuth authorization and device verification browser launches are sourced from validated OAuth URLs and rechecked for credential-free http/https at the shell boundary rather than arbitrary renderer open-external calls.', 'implemented', {
      evidenceRefs: ['electron/oauthFlows.js', 'src/core/auth.js', 'electron/oauthIpc.js'],
      tests: ['test/electron/auth.test.js', 'test/electron/oauthFlows.test.js', 'test/electron/oauthIpc.test.js']
    }),
    row('protocol.oauth-custom-scheme', 'Protocol', 'The postmeter:// OAuth callback scheme is registered through the main process and callback URLs are accepted only for the expected oauth/callback route with an active matching OAuth state.', 'implemented', {
      evidenceRefs: ['electron/oauthFlows.js', 'package.json', 'scripts/validateWindowsProtocolRegistration.ps1', 'scripts/validateMacProtocolRegistration.sh'],
      tests: ['test/electron/oauthFlows.test.js', 'test/electron/packageMetadata.test.js', 'npm run release:validate:win-protocol', 'npm run release:validate:mac-protocol']
    }),
    row('preload.explicit-api', 'Preload', 'Renderer access is restricted to explicit contextBridge APIs; IPC channel names remain compatibility contracts.', 'implemented', {
      evidenceRefs: ['electron/preload.js', 'docs/ARCHITECTURE.md'],
      tests: ['test/electron/ipcValidation.test.js']
    }),
    row('preload.main-frame-only', 'Preload', 'The preload exposes window.postmeter only in the main app frame so sandboxed iframes and future subframe preload behavior cannot receive privileged APIs.', 'implemented', {
      evidenceRefs: ['electron/preload.js', 'electron/ipcSecurity.js'],
      tests: ['test/electron/appChrome.test.js', 'test/electron/mainWindowSmoke.test.js']
    }),
    row('ipc.app', 'IPC', 'App/version/update/external-link IPC channels validate renderer payloads before main-process actions.', 'implemented', {
      evidenceRefs: ['electron/appIpc.js', 'src/core/ipcValidation.js'],
      tests: ['test/electron/appIpc.test.js', 'test/electron/ipcValidation.test.js']
    }),
    row('ipc.session', 'IPC', 'Renderer session load/save channels validate persisted UI-session payloads, including the synchronous shutdown flush path.', 'implemented', {
      evidenceRefs: ['electron/sessionIpc.js', 'electron/sessionStore.js', 'src/core/ipcValidation.js'],
      tests: ['test/electron/sessionIpc.test.js', 'test/electron/sessionStore.test.js', 'test/electron/ipcValidation.test.js']
    }),
    row('ipc.workspace', 'IPC', 'Workspace, collection, and request-example IPC channels validate payloads and route native file dialogs through main-process handlers.', 'implemented', {
      evidenceRefs: ['electron/workspaceIpc.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'],
      tests: ['test/electron/workspaceIpc.test.js', 'test/electron/workspaceStore.test.js', 'test/electron/ipcValidation.test.js']
    }),
    row('ipc.request', 'IPC', 'Single-request validation/send IPC validates request, environment, and response payloads before mutating workspace state.', 'implemented', {
      evidenceRefs: ['electron/requestIpc.js', 'src/core/ipcValidation.js'],
      tests: ['test/electron/requestIpc.test.js', 'test/electron/ipcValidation.test.js']
    }),
    row('ipc.diagnostics', 'IPC', 'Diagnostics export IPC is save-dialog-only and writes sanitized local diagnostic bundles without accepting renderer-provided paths or upload destinations.', 'implemented', {
      evidenceRefs: ['electron/diagnosticsIpc.js', 'src/core/diagnostics.js', 'electron/preload.js'],
      tests: ['test/electron/diagnosticsIpc.test.js', 'test/electron/diagnostics.test.js']
    }),
    row('ipc.runtime', 'IPC', 'Collection-run IPC validates start/cancel/export payloads and progress events while keeping cancellation state parent-owned.', 'implemented', {
      evidenceRefs: ['electron/runtimeIpc.js', 'src/core/ipcValidation.js'],
      tests: ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']
    }),
    row('ipc.oauth', 'IPC', 'OAuth IPC validates IDs, auth payloads, environments, and cancellation requests before entering OAuth flow orchestration.', 'implemented', {
      evidenceRefs: ['electron/oauthIpc.js', 'src/core/ipcValidation.js'],
      tests: ['test/electron/oauthIpc.test.js', 'test/electron/ipcValidation.test.js']
    }),
    row('ipc.vault', 'IPC', 'Vault metadata, binding, reset, unset, and prompt-response IPC expose only bounded metadata and validated decisions to the renderer.', 'implemented', {
      evidenceRefs: ['electron/main.js', 'electron/vaultPrompt.js', 'electron/preload.js'],
      tests: ['test/electron/vaultPrompt.test.js', 'test/electron/vaultPromptQueue.test.js', 'test/electron/rendererBootstrap.test.js']
    }),
    row('ipc.sandbox-package', 'IPC', 'Sandbox package fetch IPC keeps package review/fetching parent-owned and validates reviewed source inputs before caching packages.', 'implemented', {
      evidenceRefs: ['electron/sandboxPackageIpc.js', 'src/core/sandboxPackageCache.js'],
      tests: ['test/electron/sandboxPackageIpc.test.js', 'test/electron/sandboxPackageFetcher.test.js', 'test/electron/scriptRuntime.test.js']
    }),
    row('ipc.sender-validation', 'IPC', 'All renderer-to-main IPC registrations are wrapped with trusted main-frame renderer sender validation; missing senderFrame metadata, subframes, external origins, unexpected app-protocol paths, and unexpected app-protocol query keys fail closed before handler logic runs.', 'implemented', {
      evidenceRefs: ['electron/main.js', 'electron/ipcSecurity.js'],
      tests: ['test/electron/appChrome.test.js']
    }),
    ...ELECTRON_IPC_CHANNELS.map(electronIpcChannelRow),
    row('file-dialogs.workspace', 'File dialogs', 'Workspace import/export dialogs are main-process owned, use JSON filters/defaults, validate selected path shape, and validate cancellation/result payloads.', 'implemented', {
      evidenceRefs: ['electron/workspaceIpc.js', 'electron/fileDialogs.js'],
      tests: ['test/electron/workspaceIpc.test.js', 'test/electron/workspaceStore.test.js']
    }),
    row('file-dialogs.collection-and-examples', 'File dialogs', 'Collection import/export, request-example export, and collection-run export dialogs are main-process owned, use constrained filters/default filenames, validate selected path shape, and validate cancellation/result payloads.', 'implemented', {
      evidenceRefs: ['electron/workspaceIpc.js', 'electron/runtimeIpc.js', 'electron/fileDialogs.js'],
      tests: ['test/electron/workspaceIpc.test.js', 'test/electron/runtimeIpc.test.js', 'test/electron/collectionFormats.test.js']
    }),
    row('packaged.preload-integrity', 'Packaging', 'Packaged app validation must prove preload/API surface remains available and the renderer is loaded from the trusted postmeter-app:// app-content protocol after ASAR/app-bundle packaging.', 'implemented', {
      evidenceRefs: ['scripts/validatePackagedAppSmoke.js', '.github/workflows/release.yml'],
      tests: ['test/electron/mainWindowSmoke.test.js', 'npm run release:validate:packaged-smoke']
    }),
    row('packaged.protocol-registration', 'Packaging', 'Native packaged validation covers postmeter:// protocol registration and launch behavior on Windows and macOS runners.', 'implemented', {
      evidenceRefs: ['scripts/validateWindowsProtocolRegistration.ps1', 'scripts/validateMacProtocolRegistration.sh', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/workflows/release-validation.yml'],
      tests: ['npm run release:validate:win-protocol', 'npm run release:validate:mac-protocol'],
      notes: 'Source and workflow wiring are implemented here; native runner execution evidence remains tracked by the production readiness packaging rows.'
    }),
    row('electron.fuses-reviewed', 'Packaging', 'Electron fuse hardening is reviewed; fuses that cannot be flipped without breaking Electron-run-as-Node script workers remain documented instead of silently assumed.', 'documented-gap', {
      evidenceRefs: ['docs/SECURITY.md', 'docs/RELEASE_READINESS.md'],
      tests: ['npm run release:gate']
    }),
    row('visualizer.csp', 'Visualizer', 'Visualizer iframe output remains sandboxed with CSP/reviewed asset controls and no unreviewed remote script loading.', 'implemented', {
      evidenceRefs: ['src/core/scriptRuntime.js', 'docs/SANDBOX_CONTRACT.md'],
      tests: ['test/electron/scriptSandbox.test.js']
    })
  ]);
}

function buildWorkspaceDurabilityMatrix() {
  return matrix('workspace-durability', 'src/core/productionSupportMatrices.js', [
    row('workspace.atomic-json-writes', 'Atomic writes', 'Workspace JSON, session, and backup writes use collision-resistant same-directory temporary files, fsync file contents where supported, and directory-fsync after rename.', 'implemented', {
      evidenceRefs: ['src/core/workspacePersistence.js', 'src/core/workspaceStore.js', 'electron/sessionStore.js'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/sessionStore.test.js']
    }),
    row('workspace.atomic-export-writes', 'Atomic writes', 'Workspace, collection, example, and collection-run exports write through same-directory temporary files before replacing the selected output path.', 'implemented', {
      evidenceRefs: ['src/core/workspacePersistence.js', 'src/core/workspaceStore.js', 'electron/workspaceIpc.js', 'electron/runtimeIpc.js'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/workspaceDurabilityPerformance.test.js', 'test/electron/workspaceIpc.test.js', 'test/electron/runtimeIpc.test.js']
    }),
    row('workspace.corrupt-quarantine', 'Recovery', 'Unreadable workspace JSON is quarantined with a collision-resistant sibling path, the containing directory is fsynced where supported, and recovered default publication is no-overwrite so newer replacement data is preserved.', 'implemented', {
      evidenceRefs: ['src/core/workspaceStore.js', 'src/core/workspaceManager.js', 'docs/TROUBLESHOOTING.md'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/workspaceManager.test.js']
    }),
    row('workspace.managed-catalog-discovery', 'Recovery', 'Managed workspace discovery is source-of-truth filesystem discovery; stale legacy manifests, stale temp files, missing workspace files, and unrecognized existing JSON files cannot silently replace or be overwritten by default creation, create/import/rename, publication races, or active-workspace recovery.', 'implemented', {
      evidenceRefs: ['src/core/workspaceManager.js', 'docs/TECH_SPECS.md', 'docs/TROUBLESHOOTING.md'],
      tests: ['test/electron/workspaceManager.test.js', 'test/electron/workspaceStore.test.js']
    }),
    row('workspace.schema-migrations', 'Migrations', 'Workspace schema migrations preserve imported Postman metadata, globals, cookies, vault grants, package cache metadata, and protocol profiles.', 'implemented', {
      evidenceRefs: ['src/core/workspaceMigrations.js', 'docs/TECH_SPECS.md'],
      tests: ['test/electron/workspaceStore.test.js']
    }),
    row('workspace.performance-tests', 'Performance tests', 'The local V1 Performance model persists as workspace.performanceTests with schema migration, normalization, native workspace import/export round trips, request-copy isolation, safety-limit defaults, and no vault/plaintext secret leakage into Performance exports.', 'implemented', {
      evidenceRefs: ['docs/TECH_SPECS.md', 'docs/ARCHITECTURE.md', 'src/core/models.js', 'src/core/workspaceMigrations.js', 'src/core/performanceFormats.js'],
      tests: ['test/electron/performanceFeatureCoverage.test.js', 'test/electron/performanceModel.test.js', 'test/electron/performanceFormats.test.js', 'test/electron/workspaceStore.test.js', 'test/electron/workspaceDurabilityPerformance.test.js']
    }),
    row('workspace.side-effect-merge', 'Concurrent script effects', 'Sandbox variable/cookie side effects are merged by delta with workspace identity guards.', 'implemented', {
      evidenceRefs: ['electron/workspaceMutations.js'],
      tests: ['test/electron/workspaceMutations.test.js']
    }),
    row('vault.encrypted-outside-workspace', 'Vault durability', 'Vault values are encrypted outside workspace JSON, vault file rename/delete is parent-owned and no-overwrite, and vault access fails closed when OS encryption is unavailable.', 'implemented', {
      evidenceRefs: ['src/core/vaultStore.js', 'electron/main.js'],
      tests: ['test/electron/vaultStore.test.js']
    }),
    row('workspace.large-workspace-budget', 'Performance budget', 'Large workspace load, save, search, collection tree render, request open, collection run setup, and import/export budgets must stay covered by focused tests before stable release.', 'implemented', {
      evidenceRefs: ['test/electron/workspaceDurabilityPerformance.test.js', 'src/renderer/uiRegressionSmoke.js', 'test/electron/uiRegressionSmoke.js'],
      tests: ['test/electron/workspaceDurabilityPerformance.test.js', 'npm run test:ui:regression']
    }),
    row('workspace.import-export-cancel', 'Import/export recovery', 'Import/export picker cancellation and failed parse paths return explicit results without clobbering the active workspace.', 'implemented', {
      evidenceRefs: ['electron/workspaceIpc.js', 'src/core/workspaceStore.js', 'docs/TROUBLESHOOTING.md'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/workspaceManager.test.js']
    })
  ]);
}

function buildNonPostmanCompatibilityMatrix() {
  return matrix('non-postman-compatibility', 'src/core/productionSupportMatrices.js', [
    row('openapi.import-export', 'OpenAPI', 'OpenAPI/Swagger JSON/YAML import and OpenAPI 3.1 export cover common local references, server variables, path/query/header/cookie parameters, Swagger 2.0 body/form-data, auth, binary body hints, request bodies, and examples where representable.', 'implemented', {
      evidenceRefs: ['src/core/openApiFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('har.import-export', 'HAR', 'HAR 1.2 import/export covers request entries, response examples, headers, cookies, redirects, timings, compression, body encoding metadata, and sensitive header/cookie redaction on export.', 'implemented', {
      evidenceRefs: ['src/core/harFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('curl.import-export', 'curl', 'curl import/export covers common method, URL, generated names, header, auth, repeated data, query-data, cookie, redirect, compression, file/binary, and quoting variants; proxy, retry, and client TLS flags are preserved as import metadata instead of being claimed as curl-equivalent transport execution.', 'implemented', {
      evidenceRefs: ['src/core/curlFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('native-postmeter.roundtrip', 'Native PostMeter', 'Native workspace round trips preserve auth, variables, examples, cookies, certificates, package/vault/mock/visualizer metadata, protocols, and file bindings.', 'implemented', {
      evidenceRefs: ['src/core/workspaceStore.js', 'src/core/workspacePersistence.js'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/postmanImporter.test.js']
    }),
    row('native-postmeter.performance-tests', 'Native PostMeter', 'Native workspace and Performance-test import/export preserve local workspace-owned performanceTests, including request copies, source metadata, environment mutation policy, execution config, safety limits, result metadata, and schema validation without merging request copies back into Collections or claiming JMeter/distributed load compatibility.', 'implemented', {
      evidenceRefs: ['docs/COMPATIBILITY.md', 'docs/TECH_SPECS.md', 'src/core/performanceFormats.js', 'electron/runtimeIpc.js'],
      tests: ['test/electron/performanceFeatureCoverage.test.js', 'test/electron/performanceFormats.test.js', 'test/electron/workspaceStore.test.js']
    }),
    row('unsupported.claim-boundaries', 'Claim boundaries', 'Unsupported or preserve-only behavior is documented without claiming source-format-perfect parity.', 'implemented', {
      evidenceRefs: ['docs/COMPATIBILITY.md', 'NEXT_STEPS.MD'],
      tests: ['npm run compatibility:non-postman:validate']
    }),
    row('openapi.invalid-common-specs', 'OpenAPI', 'Invalid-but-common OpenAPI and structured collection variants fail with clear parser or fallback errors instead of crashing or producing misleading collections.', 'implemented', {
      evidenceRefs: ['src/core/openApiFormats.js', 'test/electron/collectionFormats.test.js'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('har.privacy-export-boundary', 'HAR', 'HAR export redacts privacy-sensitive authorization/cookie headers and cookie values while documenting that arbitrary payload bodies cannot be reliably secret-scanned.', 'implemented', {
      evidenceRefs: ['src/core/harFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('curl.cross-shell-quoting', 'curl', 'curl import/export covers common Linux/macOS/Windows quoting forms, including cmd.exe caret line continuations, and repeated headers without claiming every shell dialect.', 'implemented', {
      evidenceRefs: ['src/core/curlFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    })
  ]);
}

function buildUxAccessibilityMatrix() {
  return matrix('ux-accessibility', 'src/core/productionSupportMatrices.js', [
    row('workflow.first-launch-empty-state', 'First launch', 'First launch and empty workspace states give visible next actions without requiring existing collections, requests, environments, runners, or history, and sidebar environment/workspace/runner selections restore the correct empty or most-recent-tab pane.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/uiRegressionSmoke.js', 'src/renderer/uiSnapshotSmoke.js'],
      tests: ['npm run test:ui:regression', 'npm run test:ui:snapshot']
    }),
    row('workflow.workspace-management', 'Workspaces', 'Workspace create, open, switch, inline rename, export, delete, and sidebar reorder flows expose success/failure states and in-app destructive confirmation through main-process validated operations without saving unrelated dirty drafts.', 'implemented', {
      evidenceRefs: ['src/renderer/rendererWorkflows.js', 'electron/workspaceIpc.js', 'docs/TROUBLESHOOTING.md'],
      tests: ['npm run test:ui:regression', 'test/electron/workspaceIpc.test.js', 'test/electron/workspaceManager.test.js']
    }),
    row('workflow.request-edit-send', 'Requests', 'Request editing, inline request/environment title editing, validation, pre-send save failure, send success, send failure, response display, updated OAuth persistence markers, tab context/close/cap behavior, failed request/environment/draft close-save persistence, and unsaved-close recovery remain visible and recoverable.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/rendererWorkflows.js', 'electron/requestIpc.js'],
      tests: ['npm run test:ui', 'npm run test:ui:regression', 'test/electron/requestIpc.test.js']
    }),
    row('workflow.collection-runner', 'Collection runner', 'Workspace-owned desktop runners expose empty-pane creation, toolbar creation, collection/request import with multi-select, runner-owned request editing, idle, running, cancellation, export, pass/fail, pre-run save failure, dirty tab, environment mutation, row reorder/delete, split result details, and failed-operation states without writing partial result exports or mutating source collection requests.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/requestTabState.js', 'src/renderer/sessionPersistence.js', 'src/renderer/rendererWorkflows.js', 'electron/runtimeIpc.js'],
      tests: ['npm run test:ui:regression', 'npm run test:ui:snapshot', 'test/electron/requestTabState.test.js', 'test/electron/rendererSessionPersistence.test.js', 'test/electron/runtimeIpc.test.js', 'test/electron/collectionRunner.test.js', 'test/electron/rendererWorkflows.test.js']
    }),
    row('workflow.performance', 'Performance', 'The Performance section exposes local workspace-owned saved tests in the sidebar between Runners and History, empty-pane creation, New > Performance Test creation, import-request and manual request-entry paths, seven local modes with type-scoped input fields, dirty performance tabs, save/discard semantics, type-specific safety-cap rejection, cancellation, target-rate cancellable local calibration with phase progress, bounded probe-and-verification stages, local latency-knee rejection, and local result panes without claiming distributed/cloud execution.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/performanceTestModel.js', 'src/core/performanceCalibration.js', 'docs/ARCHITECTURE.md', 'docs/TECH_SPECS.md'],
      tests: ['test/electron/performanceCalibration.test.js', 'test/electron/performanceFeatureCoverage.test.js', 'test/electron/performanceRendererModel.test.js', 'test/electron/rendererBootstrap.test.js', 'test/electron/requestTabState.test.js', 'npm run test:ui:regression', 'npm run test:ui:snapshot']
    }),
    row('workflow.import-export', 'Imports/exports', 'Workspace, collection, example, and runner import/export cancellation and failure paths stay parent-owned and report actionable errors without clobbering active state.', 'implemented', {
      evidenceRefs: ['electron/workspaceIpc.js', 'electron/runtimeIpc.js', 'electron/fileDialogs.js', 'docs/TROUBLESHOOTING.md'],
      tests: ['npm run test:ui:regression', 'test/electron/workspaceIpc.test.js', 'test/electron/runtimeIpc.test.js', 'test/electron/collectionFormats.test.js']
    }),
    row('workflow.oauth', 'OAuth', 'OAuth PKCE and device-code UX exposes waiting, completion, cancellation, state-mismatch, provider-denial, timeout, token-failure, and redacted provider-error states.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/rendererWorkflows.js', 'src/renderer/uiOauthSmoke.js', 'docs/OAUTH_PROVIDER_CERTIFICATION.md'],
      tests: ['npm run test:ui:oauth', 'npm run test:ui:regression', 'test/electron/oauthIpc.test.js', 'test/electron/oauthFlows.test.js']
    }),
    row('workflow.sandbox-package-review', 'Sandbox package review', 'Package review/fetch/cache controls surface reviewed package status, missing references, fetch failure, refresh behavior, and destructive removal cancellation/success/failure rollback without installing unreviewed runtime packages.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/rendererWorkflows.js', 'electron/sandboxPackageIpc.js', 'src/core/sandboxPackageCache.js'],
      tests: ['npm run test:ui:regression', 'test/electron/sandboxPackageIpc.test.js', 'test/electron/sandboxPackageFetcher.test.js']
    }),
    row('workflow.vault-prompts', 'Vault prompts', 'Vault metadata, prompt, grant, deny, reset, unavailable-encryption, and local secret-binding states keep script-requested secret values in the main process, use masked in-app user input for local binding, and expose metadata-only script access decisions.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/rendererBootstrap.js', 'electron/vaultPrompt.js', 'docs/TROUBLESHOOTING.md'],
      tests: ['npm run test:ui:regression', 'test/electron/vaultPrompt.test.js', 'test/electron/vaultPromptQueue.test.js', 'test/electron/rendererBootstrap.test.js']
    }),
    row('workflow.file-bindings', 'File bindings', 'Imported file/binary attachment binding review exposes missing-binding, bound-file, destructive removal cancellation/success/failure rollback states while keeping arbitrary file paths denied until the user binds them.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/rendererWorkflows.js', 'src/core/fileAttachmentBindings.js', 'docs/SANDBOX_CONTRACT.md'],
      tests: ['npm run test:ui:regression', 'test/electron/postmanImporter.test.js', 'test/electron/scriptSandbox.test.js']
    }),
    row('workflow.local-mocks', 'Local mocks', 'Imported local mock scripts are preserved and run through the bounded loopback mock runner; mock failure and state behavior remain documented as sandbox-owned rather than cloud-owned.', 'implemented', {
      evidenceRefs: ['src/core/localMockServer.js', 'docs/COMPATIBILITY.md', 'docs/SANDBOX_CONTRACT.md'],
      tests: ['test/electron/postmanScriptImportCoverage.test.js', 'test/electron/postmanSandboxCorpus.test.js', 'test/electron/localMockServer.test.js']
    }),
    row('workflow.settings-theme', 'Settings/theme', 'Workspace-scoped sandbox capability toggles, update settings, and system/light/dark theme preference save and reload without leaking into request payloads.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/theme.css', 'src/renderer/renderer.js', 'src/renderer/uiWorkflowSmoke.js'],
      tests: ['npm run test:ui', 'npm run test:ui:regression']
    }),
    row('workflow.update-check', 'Update check', 'Update-check success, no-update, and failure states use validated main-process update metadata and user-visible non-secret notifications.', 'implemented', {
      evidenceRefs: ['src/core/updateChecker.js', 'electron/appIpc.js', 'src/renderer/rendererWorkflows.js'],
      tests: ['npm run test:ui:regression', 'test/electron/appIpc.test.js']
    }),
    row('workflow.diagnostics-export', 'Diagnostics export', 'Workspace diagnostics controls and Help menu export produce a user-selected local diagnostic bundle with visible review-before-sharing messaging and off-by-default request/response logging categories.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/rendererBootstrap.js', 'electron/appMenu.js', 'electron/diagnosticsIpc.js', 'docs/TROUBLESHOOTING.md'],
      tests: ['npm run diagnostics:privacy:validate', 'test/electron/diagnosticsIpc.test.js', 'test/electron/rendererBootstrap.test.js', 'npm run test:ui:regression'],
      notes: 'The diagnostics/privacy matrix owns the strict redaction and no-telemetry proof; this UX row owns the visible controls and export path.'
    }),
    row('a11y.tabs-and-panels', 'Accessibility', 'Request/result tabs, sidebar tabs, opened request/environment/workspace/runner tabs, and tab panels expose roles, selected state, labels, relationships, hover/active close controls, and capped/scrollable tab behavior without nesting controls inside tab roles.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/requestTabs.js', 'src/renderer/requestTabState.js'],
      tests: ['npm run test:ui:regression', 'test/electron/requestTabs.test.js']
    }),
    row('a11y.modal-focus-management', 'Accessibility', 'High-frequency text-input, secret-input, confirmation, notification, export, save-draft, and vault-access modals move focus on open, trap keyboard focus while open, restore focus to a visible opener on close, and support Escape/backdrop cancellation where safe.', 'implemented', {
      evidenceRefs: ['src/renderer/renderer.js', 'src/renderer/rendererBootstrap.js', 'src/renderer/index.html'],
      tests: ['npm run test:ui:regression', 'test/electron/rendererBootstrap.test.js']
    }),
    row('a11y.live-regions', 'Accessibility', 'App status, validation, OAuth progress, response metrics, runner results, package status, vault status, and file-binding status are announced through appropriate live regions.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/renderer.js'],
      tests: ['npm run test:ui:regression']
    }),
    row('a11y.dynamic-controls', 'Accessibility', 'Dynamic workspace, package, file-binding, splitter, autocomplete combobox/listbox, toolbar/tree/tab/history context-menu, sidebar drag/drop insertion-bar, cookie, request-variable, response, runner import, history-clear, and modal controls expose accessible names, keyboard focus behavior, and stable labels; production renderer workflows avoid raw native prompt, confirm, and alert dialogs.', 'implemented', {
      evidenceRefs: ['src/renderer/index.html', 'src/renderer/layoutControls.js', 'src/renderer/variableAutocomplete.js', 'src/renderer/contextMenu.js', 'src/renderer/requestEditorPanels.js', 'src/renderer/renderer.js'],
      tests: ['npm run test:ui:regression', 'test/electron/rendererBootstrap.test.js']
    }),
    row('coverage.constrained-themes-long-labels', 'UI coverage', 'Linux headless UI smoke covers constrained desktop size, system/light/dark theme switching, active forced-colors focus visibility, long labels, empty workspaces, and large workspaces.', 'implemented', {
      evidenceRefs: ['src/renderer/uiRegressionSmoke.js', 'src/renderer/uiSnapshotSmoke.js', 'test/electron/uiRegressionSmoke.js', 'test/electron/uiSnapshotSmoke.js'],
      tests: ['npm run test:ui:regression', 'npm run test:ui:snapshot']
    }),
    row('coverage.failure-artifacts', 'UI coverage', 'Startup and UI smoke failures can write timeout-bounded screenshot, redacted structural DOM-state including active-element ARIA metadata, and redacted failure-log artifacts for CI upload through POSTMETER_VALIDATION_ARTIFACT_DIR or POSTMETER_UI_SMOKE_ARTIFACT_DIR; source UI, packaged smoke launcher, and packaged sandbox-validation stdout/stderr/stacks use the shared diagnostics redactor for local paths, private keys, request/response alias values, JSON-escaped slash URLs/file URLs, Bearer/Basic/Digest/Hawk/Token/OAuth/NTLM/Negotiate auth-shaped values, JSON-escaped/double-escaped/nested-JSON camelCase auth-header aliases, and OAuth code/verifier/assertion fields; smoke child processes fail closed with exit code 124 on timeout.', 'implemented', {
      evidenceRefs: ['electron/main.js', 'electron/mainWindow.js', 'scripts/smokeProcess.js', 'test/electron/startupSmoke.js', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/workflows/release-validation.yml'],
      tests: ['npm run test:smoke', 'npm run test:ui', 'npm run test:ui:regression', 'npm run test:ui:oauth', 'npm run test:ui:snapshot', 'test/electron/mainWindowSmoke.test.js', 'test/electron/smokeProcess.test.js']
    })
  ]);
}

function matrix(name, generatedFrom, rows) {
  return {
    schemaVersion: 1,
    name,
    generatedFrom,
    deterministic: true,
    rows: rows.sort((left, right) => left.id.localeCompare(right.id))
  };
}

function ipcChannel(channel, direction, target, evidenceRefs, tests) {
  return Object.freeze({
    id: ipcChannelId(channel),
    channel,
    direction,
    target,
    evidenceRefs,
    tests
  });
}

function ipcChannelId(channel) {
  return `ipc.channel.${String(channel || '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()}`;
}

function electronIpcChannelRow(channel) {
  return row(channel.id, 'IPC channel', `${channel.direction} channel \`${channel.channel}\`: ${channel.target}`, 'implemented', {
    evidenceRefs: channel.evidenceRefs,
    tests: channel.tests
  });
}

function row(id, area, target, status, options = {}) {
  return {
    id,
    area,
    target,
    status,
    evidenceRefs: options.evidenceRefs || [],
    tests: options.tests || [],
    notes: options.notes || ''
  };
}

module.exports = {
  buildMatrix,
  buildDiagnosticsPrivacyMatrix,
  buildElectronSecurityMatrix,
  buildNonPostmanCompatibilityMatrix,
  buildUxAccessibilityMatrix,
  buildWorkspaceDurabilityMatrix,
  ELECTRON_IPC_CHANNELS,
  validateMatrix
};
