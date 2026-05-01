const MATRIX_BUILDERS = Object.freeze({
  'electron-security': buildElectronSecurityMatrix,
  'workspace-durability': buildWorkspaceDurabilityMatrix,
  'non-postman-compatibility': buildNonPostmanCompatibilityMatrix
});

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
  ipcChannel('workspace:saveSync', 'renderer-to-main-sync', 'Synchronous shutdown workspace save validates the workspace payload before persistence.', ['electron/workspaceIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('workspace:create', 'renderer-to-main', 'Workspace creation remains main-process owned.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:rename', 'renderer-to-main', 'Workspace rename validates workspace ID and bounded name input.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:switch', 'renderer-to-main', 'Workspace switch validates non-empty workspace IDs before loading.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:delete', 'renderer-to-main', 'Workspace delete validates non-empty workspace IDs before destructive store operations.', ['electron/workspaceIpc.js', 'electron/preload.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:import', 'renderer-to-main', 'Workspace import opens a main-process JSON file picker and returns a validated file-operation result.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js'], ['test/electron/workspaceIpc.test.js']),
  ipcChannel('workspace:export', 'renderer-to-main', 'Workspace export validates optional workspace payload/ID before a main-process JSON save picker.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('collection:import', 'renderer-to-main', 'Collection import opens a main-process picker constrained to supported collection formats.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/collectionFormats.test.js']),
  ipcChannel('collection:export', 'renderer-to-main', 'Collection export validates collection payload and export format before a main-process save picker.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('request:examples:export', 'renderer-to-main', 'Request example export validates the request payload before writing a selected JSON file.', ['electron/workspaceIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/workspaceIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('request:validate', 'renderer-to-main', 'Single request validation validates request and environment payloads.', ['electron/requestIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/requestIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('request:send', 'renderer-to-main', 'Single request send validates request/environment payloads and validates response payloads before returning.', ['electron/requestIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/requestIpc.test.js', 'test/electron/ipcValidation.test.js']),
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
  ipcChannel('load:start', 'renderer-to-main', 'Load-test start validates ID, request, environment, and config payloads.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('load:cancel', 'renderer-to-main', 'Load-test cancellation validates the active run ID before aborting.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('load:export', 'renderer-to-main', 'Load-test export validates result/format payloads before a main-process save picker.', ['electron/runtimeIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('load:progress', 'main-to-renderer', 'Load-test progress events are asserted before delivery to the renderer subscription.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('runner:start', 'renderer-to-main', 'Collection-run start validates ID, collection, environment, and config payloads.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('runner:cancel', 'renderer-to-main', 'Collection-run cancellation validates the active run ID before aborting.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('runner:export', 'renderer-to-main', 'Collection-run export validates result/format payloads before a main-process save picker.', ['electron/runtimeIpc.js', 'electron/preload.js', 'electron/fileDialogs.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js']),
  ipcChannel('runner:progress', 'main-to-renderer', 'Collection-run progress events are asserted before delivery to the renderer subscription.', ['electron/runtimeIpc.js', 'electron/preload.js', 'src/core/ipcValidation.js'], ['test/electron/runtimeIpc.test.js', 'test/electron/ipcValidation.test.js'])
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
    if (!Array.isArray(row.evidenceRefs) || !Array.isArray(row.tests)) {
      errors.push(`${expectedName} matrix row ${row.id || '<unknown>'} must declare evidenceRefs and tests.`);
    }
  }
  if (expectedName === 'electron-security') {
    for (const requiredRowId of REQUIRED_ELECTRON_SECURITY_ROWS) {
      if (!ids.has(requiredRowId)) {
        errors.push(`electron-security matrix must enumerate ${requiredRowId}.`);
      }
    }
  }
  return errors;
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
      evidenceRefs: ['src/renderer/index.html', 'electron/appProtocol.js', 'TECH_SPECS.MD'],
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
    row('ipc.runtime', 'IPC', 'Load-test and collection-run IPC validates start/cancel/export payloads and progress events while keeping cancellation state parent-owned.', 'implemented', {
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
    row('file-dialogs.collection-and-examples', 'File dialogs', 'Collection import/export, request-example export, load-result export, and collection-run export dialogs are main-process owned, use constrained filters/default filenames, validate selected path shape, and validate cancellation/result payloads.', 'implemented', {
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
      evidenceRefs: ['SECURITY.md', 'docs/RELEASE_READINESS.md'],
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
    row('workspace.atomic-export-writes', 'Atomic writes', 'Workspace, collection, example, load-test, and collection-run exports write through same-directory temporary files before replacing the selected output path.', 'implemented', {
      evidenceRefs: ['src/core/workspacePersistence.js', 'src/core/workspaceStore.js', 'electron/workspaceIpc.js', 'electron/runtimeIpc.js'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/workspaceDurabilityPerformance.test.js', 'test/electron/workspaceIpc.test.js', 'test/electron/runtimeIpc.test.js']
    }),
    row('workspace.corrupt-quarantine', 'Recovery', 'Unreadable workspace JSON is quarantined with a collision-resistant sibling path, the containing directory is fsynced where supported, and recovered default publication is no-overwrite so newer replacement data is preserved.', 'implemented', {
      evidenceRefs: ['src/core/workspaceStore.js', 'src/core/workspaceManager.js', 'docs/TROUBLESHOOTING.md'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/workspaceManager.test.js']
    }),
    row('workspace.managed-catalog-discovery', 'Recovery', 'Managed workspace discovery is source-of-truth filesystem discovery; stale legacy manifests, stale temp files, missing workspace files, and unrecognized existing JSON files cannot silently replace or be overwritten by default creation, create/import/rename, publication races, or active-workspace recovery.', 'implemented', {
      evidenceRefs: ['src/core/workspaceManager.js', 'TECH_SPECS.MD', 'docs/TROUBLESHOOTING.md'],
      tests: ['test/electron/workspaceManager.test.js', 'test/electron/workspaceStore.test.js']
    }),
    row('workspace.schema-migrations', 'Migrations', 'Workspace schema migrations preserve imported Postman metadata, globals, cookies, vault grants, package cache metadata, and protocol profiles.', 'implemented', {
      evidenceRefs: ['src/core/workspaceMigrations.js', 'TECH_SPECS.MD'],
      tests: ['test/electron/workspaceStore.test.js']
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
    row('openapi.import-export', 'OpenAPI', 'OpenAPI/Swagger JSON/YAML import and OpenAPI 3.1 export cover paths, auth, variables, request bodies, and examples where representable.', 'implemented', {
      evidenceRefs: ['src/core/openApiFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('har.import-export', 'HAR', 'HAR 1.2 import/export covers request entries, response examples, headers, cookies, timings, and body metadata.', 'implemented', {
      evidenceRefs: ['src/core/harFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('curl.import-export', 'curl', 'curl import/export covers common method, URL, header, data, cookie, proxy, retry, TLS, and quoting variants.', 'implemented', {
      evidenceRefs: ['src/core/curlFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('jmeter.bridge', 'JMeter', 'JMeter import/export remains a bridge for HTTP sampler plans with mapped assertions/timers/controllers and preserve-only unsupported metadata.', 'implemented', {
      evidenceRefs: ['src/core/jmeterFormats.js', 'test/fixtures/jmeter', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('native-postmeter.roundtrip', 'Native PostMeter', 'Native workspace round trips preserve auth, variables, examples, cookies, certificates, package/vault/mock/visualizer metadata, protocols, and file bindings.', 'implemented', {
      evidenceRefs: ['src/core/workspaceStore.js', 'src/core/workspacePersistence.js'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/postmanImporter.test.js']
    }),
    row('unsupported.claim-boundaries', 'Claim boundaries', 'Unsupported or preserve-only behavior is documented without claiming full JMeter execution or source-format-perfect parity.', 'implemented', {
      evidenceRefs: ['docs/COMPATIBILITY.md', 'NEXT_STEPS.MD'],
      tests: ['npm run compatibility:non-postman:validate']
    }),
    row('openapi.invalid-common-specs', 'OpenAPI', 'Invalid-but-common OpenAPI variants fail with clear parser errors instead of crashing or producing misleading collections.', 'implemented', {
      evidenceRefs: ['src/core/openApiFormats.js', 'test/electron/collectionFormats.test.js'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('har.privacy-export-boundary', 'HAR', 'HAR import/export tracks privacy-sensitive headers/cookies/body metadata boundaries in user-facing compatibility docs.', 'implemented', {
      evidenceRefs: ['src/core/harFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
    }),
    row('curl.cross-shell-quoting', 'curl', 'curl import/export covers common Linux/macOS/Windows quoting forms and repeated headers without claiming every shell dialect.', 'implemented', {
      evidenceRefs: ['src/core/curlFormats.js', 'docs/COMPATIBILITY.md'],
      tests: ['test/electron/collectionFormats.test.js']
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
  buildElectronSecurityMatrix,
  buildNonPostmanCompatibilityMatrix,
  buildWorkspaceDurabilityMatrix,
  ELECTRON_IPC_CHANNELS,
  validateMatrix
};
