const MATRIX_BUILDERS = Object.freeze({
  'electron-security': buildElectronSecurityMatrix,
  'workspace-durability': buildWorkspaceDurabilityMatrix,
  'non-postman-compatibility': buildNonPostmanCompatibilityMatrix
});

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
  return errors;
}

function buildElectronSecurityMatrix() {
  return matrix('electron-security', 'src/core/productionSupportMatrices.js', [
    row('browser-window.webpreferences', 'BrowserWindow', 'Renderer runs with nodeIntegration disabled, contextIsolation enabled, sandbox enabled, webSecurity enabled, and insecure content disabled.', 'implemented', {
      evidenceRefs: ['electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js', 'test/electron/uiWorkflowSmoke.js']
    }),
    row('browser-window.navigation', 'Navigation', 'Window-open and navigation paths deny unexpected renderer-controlled top-level launches.', 'implemented', {
      evidenceRefs: ['electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js']
    }),
    row('permissions.denied', 'Permissions', 'Electron permission requests are denied by default.', 'implemented', {
      evidenceRefs: ['electron/mainWindow.js'],
      tests: ['test/electron/appChrome.test.js']
    }),
    row('external-url.allowlist', 'External URLs', 'External URL IPC only opens HTTPS GitHub URLs after payload validation.', 'implemented', {
      evidenceRefs: ['electron/appIpc.js', 'src/core/ipcValidation.js'],
      tests: ['test/electron/appIpc.test.js']
    }),
    row('preload.explicit-api', 'Preload', 'Renderer access is restricted to explicit contextBridge APIs; IPC channel names remain compatibility contracts.', 'implemented', {
      evidenceRefs: ['electron/preload.js', 'docs/ARCHITECTURE.md'],
      tests: ['test/electron/ipcValidation.test.js']
    }),
    row('packaged.preload-integrity', 'Packaging', 'Packaged app validation must prove preload/API surface remains available after ASAR/app-bundle packaging.', 'implemented', {
      evidenceRefs: ['scripts/validatePackagedAppSmoke.js', '.github/workflows/release.yml'],
      tests: ['npm run release:validate:packaged-smoke']
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
    row('workspace.atomic-json-writes', 'Atomic writes', 'Workspace JSON writes use same-directory temporary files followed by atomic rename.', 'implemented', {
      evidenceRefs: ['src/core/workspacePersistence.js'],
      tests: ['test/electron/workspaceStore.test.js']
    }),
    row('workspace.corrupt-quarantine', 'Recovery', 'Unreadable workspace JSON is quarantined and a default workspace is recovered instead of overwriting newer user data.', 'implemented', {
      evidenceRefs: ['src/core/workspaceStore.js', 'src/core/workspaceManager.js'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/workspaceManager.test.js']
    }),
    row('workspace.schema-migrations', 'Migrations', 'Workspace schema migrations preserve imported Postman metadata, globals, cookies, vault grants, package cache metadata, and protocol profiles.', 'implemented', {
      evidenceRefs: ['src/core/workspaceMigrations.js'],
      tests: ['test/electron/workspaceStore.test.js']
    }),
    row('workspace.side-effect-merge', 'Concurrent script effects', 'Sandbox variable/cookie side effects are merged by delta with workspace identity guards.', 'implemented', {
      evidenceRefs: ['electron/workspaceMutations.js'],
      tests: ['test/electron/workspaceMutations.test.js']
    }),
    row('vault.encrypted-outside-workspace', 'Vault durability', 'Vault values are encrypted outside workspace JSON and fail closed when OS encryption is unavailable.', 'implemented', {
      evidenceRefs: ['src/core/vaultStore.js'],
      tests: ['test/electron/vaultStore.test.js']
    }),
    row('workspace.large-workspace-budget', 'Performance budget', 'Large workspace load/save/render budgets must stay covered by focused tests before stable release.', 'implemented', {
      evidenceRefs: ['test/electron/workspaceStore.test.js', 'test/electron/uiRegressionSmoke.js'],
      tests: ['npm test', 'npm run test:ui:regression']
    }),
    row('workspace.import-export-cancel', 'Import/export recovery', 'Import/export picker cancellation and failed parse paths return explicit results without clobbering the active workspace.', 'implemented', {
      evidenceRefs: ['electron/workspaceIpc.js', 'src/core/workspaceStore.js'],
      tests: ['test/electron/workspaceStore.test.js', 'test/electron/workspaceManager.test.js']
    }),
    row('diagnostics.redaction-boundary', 'Diagnostics', 'Diagnostics must redact secrets, vault values, tokens, auth headers, cookies, request bodies, and sensitive local paths by default.', 'blocked', {
      evidenceRefs: ['NEXT_STEPS.MD', 'docs/RELEASE_READINESS.md'],
      tests: ['future diagnostics tests']
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
  validateMatrix
};
