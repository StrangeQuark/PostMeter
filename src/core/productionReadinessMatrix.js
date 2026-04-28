const STATUS_DESCRIPTIONS = Object.freeze({
  implemented: 'Implementation and local validation exist.',
  validated: 'Implementation has required local and native-runner evidence.',
  'external-validation-required': 'Implementation exists, but final evidence requires native runners, provider credentials, or signing assets.',
  blocked: 'Release-blocking implementation is not complete.',
  deferred: 'Deliberately outside the current production claim.',
  'not-applicable': 'Not part of this product or release track.'
});

const RELEASE_LEVELS = Object.freeze(['beta', 'rc', 'stable']);

function buildProductionReadinessMatrix() {
  const rows = [
    row('release.dashboard', 'release-readiness', 'Production readiness dashboard and gates exist as generated source-owned artifacts.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run production:readiness', 'npm run production:readiness:validate'],
      evidenceRefs: ['src/core/productionReadinessMatrix.js', 'docs/production-readiness-matrix.json', 'docs/RELEASE_READINESS.md']
    }),
    row('packaging.linux', 'packaging', 'Linux deb/AppImage metadata, protocol registration, artifact checksums, and packaged sandbox validation are covered.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run dist:linux', 'npm run release:validate', 'npm run sandbox:validate:packaged'],
      evidenceRefs: ['scripts/validateReleaseArtifacts.js', '.github/workflows/ci.yml', '.github/workflows/release.yml']
    }),
    row('packaging.windows', 'packaging', 'Windows packaged launch, protocol registration, workspace path, and script-worker validation must run on windows-latest.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['npm run dist:win', 'npm run release:validate:packaged-smoke', 'npm run release:validate:win-protocol'],
      evidenceRefs: ['.github/workflows/release.yml']
    }),
    row('packaging.macos', 'packaging', 'macOS packaged launch, protocol registration, workspace path, and script-worker validation must run on macos-latest.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['npm run dist:mac', 'npm run release:validate:packaged-smoke', 'npm run release:validate:mac-protocol'],
      evidenceRefs: ['.github/workflows/release.yml']
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
    row('sandbox.platform-os', 'security', 'Platform-equivalent OS sandbox claim is tracked separately from Postman API parity.', 'blocked', {
      releaseBlocking: true,
      commands: ['npm run sandbox:platform:validate', 'npm run sandbox:platform:claim'],
      evidenceRefs: ['docs/os-sandbox-platform-matrix.json', 'src/core/osSandboxPlatformMatrix.js'],
      notes: 'Linux is accepted for the current Linux claim; Windows/macOS still require native backend source plus packaged runner proof before the cross-platform claim can pass.'
    }),
    row('grpc.pfx-p12-mtls', 'transport', 'HTTP and gRPC mTLS share parent-owned PFX/P12 extraction aligned with client-certificate handling.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm test'],
      evidenceRefs: ['src/core/grpcClient.js', 'test/electron/grpcClient.test.js']
    }),
    row('vault.per-request-prompts', 'security', 'Per-request vault prompt decisions are brokered without exposing vault secrets to scripts or renderer APIs.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm test'],
      evidenceRefs: ['src/core/scriptSandbox.js', 'electron/vaultPrompt.js']
    }),
    row('postman.newman-json-reports', 'compatibility', 'Deterministic Newman JSON evidence reports for approved differential fixtures are checked in and validated.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run postman:newman-reports:validate'],
      evidenceRefs: ['test/fixtures/postman/newman-reports']
    }),
    row('electron.security', 'security', 'Electron BrowserWindow, preload, IPC, navigation, external URL, protocol, and packaged-preload controls are matrixed and validated.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run electron:security:validate', 'npm test'],
      evidenceRefs: ['docs/electron-security-matrix.json', 'electron/mainWindow.js', 'electron/appIpc.js']
    }),
    row('workspace.durability', 'data-durability', 'Workspace persistence, migrations, recovery, vault metadata, package cache, and large-workspace budgets are matrixed and validated.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run workspace:durability:validate', 'npm test'],
      evidenceRefs: ['docs/workspace-durability-matrix.json']
    }),
    row('compatibility.non-postman', 'compatibility', 'OpenAPI, HAR, curl, JMeter, and native PostMeter import/export compatibility are matrixed and validated.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run compatibility:non-postman:validate', 'npm test'],
      evidenceRefs: ['docs/non-postman-compatibility-matrix.json', 'docs/COMPATIBILITY.md']
    }),
    row('ux.accessibility', 'ux', 'Production user workflows, accessibility-sensitive modals, and failure states are smoke-tested and documented before release.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['npm run test:ui', 'npm run test:ui:regression', 'npm run test:ui:snapshot'],
      evidenceRefs: ['docs/RELEASE_READINESS.md', 'src/renderer/index.html', 'test/electron/uiRegressionSmoke.js'],
      notes: 'Linux headless smoke coverage exists; final production signoff still requires native packaged runner evidence and manual QA.'
    }),
    row('diagnostics.privacy', 'privacy', 'Local diagnostics and logging must remain user-controlled, redacted, and cloud-free.', 'blocked', {
      releaseBlocking: true,
      commands: ['future diagnostics validation'],
      evidenceRefs: ['NEXT_STEPS.MD', 'docs/RELEASE_READINESS.md'],
      notes: 'Structured local diagnostics/export is tracked after the current HPS 1-9 implementation.'
    }),
    row('docs.public-release', 'docs', 'Public release docs explain readiness gates, compatibility claims, unsigned artifacts, support channel, and platform limitations.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run production:readiness:validate'],
      evidenceRefs: ['README.md', 'TECH_SPECS.MD', 'docs/RELEASE_READINESS.md', 'SECURITY.md']
    }),
    row('updates.metadata', 'release', 'Release/update metadata points to GitHub Releases without introducing a cloud account gate.', 'implemented', {
      releaseBlocking: true,
      commands: ['npm run release:manifest', 'npm run release:validate'],
      evidenceRefs: ['src/core/updateChecker.js', 'scripts/writeReleaseManifest.js', 'package.json']
    }),
    row('oauth.live-certification', 'oauth', 'Live provider certification requires maintainer-owned Google, Microsoft Entra ID, and GitHub OAuth apps.', 'external-validation-required', {
      releaseBlocking: true,
      commands: ['future npm run oauth:certify:live'],
      evidenceRefs: ['docs/OAUTH_PROVIDER_CERTIFICATION.md']
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
  const statuses = new Set(Object.keys(matrix.statuses || {}));
  for (const status of Object.keys(STATUS_DESCRIPTIONS)) {
    if (!statuses.has(status)) {
      errors.push(`Production readiness matrix must declare status ${status}.`);
    }
  }
  const ids = new Set();
  const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
  if (!rows.length) {
    errors.push('Production readiness matrix must contain rows.');
  }
  for (const item of rows) {
    if (!item || typeof item !== 'object') {
      errors.push('Production readiness matrix row must be an object.');
      continue;
    }
    if (!item.id || ids.has(item.id)) {
      errors.push(`Production readiness matrix row has missing or duplicate id: ${item.id || '<empty>'}.`);
    }
    ids.add(item.id);
    for (const field of ['area', 'target', 'status']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        errors.push(`Production readiness row ${item.id || '<unknown>'} missing ${field}.`);
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
    }
  }
  for (const requiredId of ['release.dashboard', 'sandbox.script-runtime', 'sandbox.platform-os', 'packaging.windows', 'packaging.macos', 'compatibility.non-postman']) {
    if (!ids.has(requiredId)) {
      errors.push(`Production readiness matrix is missing required row ${requiredId}.`);
    }
  }
  return errors;
}

function productionReadinessSummary(matrix) {
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const byStatus = {};
  for (const item of rows) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  }
  const releaseBlockers = rows.filter((item) => item.releaseBlocking && !['implemented', 'validated'].includes(item.status));
  return {
    rowCount: rows.length,
    byStatus,
    releaseBlockerCount: releaseBlockers.length,
    releaseBlockers: releaseBlockers.map((item) => item.id)
  };
}

function row(id, area, target, status, options = {}) {
  return {
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
}

module.exports = {
  buildProductionReadinessMatrix,
  productionReadinessSummary,
  validateProductionReadinessMatrix
};
