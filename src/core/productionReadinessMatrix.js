const STATUS_DESCRIPTIONS = Object.freeze({
  implemented: 'Implementation and local validation exist.',
  validated: 'Implementation has required local and native-runner evidence.',
  'external-validation-required': 'Implementation exists, but final evidence requires native runners, provider credentials, or signing assets.',
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
