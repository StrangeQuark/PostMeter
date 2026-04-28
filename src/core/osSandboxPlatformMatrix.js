const PLATFORM_OS_SANDBOX_CLAIM = 'platform-os-sandbox';
const POSTMAN_API_PARITY_CLAIM = 'postman-api-parity';
const LOAD_TEST_SCRIPTING_CLAIM = 'load-test-scripting';
const RELEASE_GATE_CLAIM = 'release-gate';

const STATUS_DESCRIPTIONS = Object.freeze({
  implemented: 'Implemented and covered by automated validation or source-owned contract checks.',
  'blocked-native-backend': 'Blocked until a native OS sandbox backend and packaged validation exist for this platform.',
  'out-of-scope': 'Explicitly outside the current claim surface.',
  'validation-hook': 'Validation plumbing exists and must stay release-gated.'
});

const SOURCES = Object.freeze({
  sandboxContract: {
    title: 'PostMeter Script Sandbox Contract',
    path: 'docs/SANDBOX_CONTRACT.md'
  },
  nextSteps: {
    title: 'PostMeter Next Steps',
    path: 'NEXT_STEPS.MD'
  },
  osSandbox: {
    title: 'OS sandbox launch backend',
    path: 'src/core/osSandbox.js'
  },
  seccompPolicy: {
    title: 'Linux seccomp syscall policy',
    path: 'src/core/seccompPolicy.js'
  },
  runtimeValidation: {
    title: 'Sandbox runtime validation',
    path: 'src/core/sandboxRuntimeValidation.js'
  },
  releaseGate: {
    title: 'Sandbox release gate manifest validation',
    path: 'scripts/validateSandboxReleaseGate.js'
  },
  ciWorkflow: {
    title: 'CI workflow',
    path: '.github/workflows/ci.yml'
  },
  releaseWorkflow: {
    title: 'Release workflow',
    path: '.github/workflows/release.yml'
  }
});

const REQUIRED_ROW_IDS = Object.freeze([
  'linux.namespace-bubblewrap',
  'linux.seccomp-dangerous-syscall-policy',
  'linux.seccomp-deny-default-allowlist-decision',
  'linux.packaged-os-sandbox-validation',
  'windows.appcontainer-backend',
  'windows.packaged-os-sandbox-validation',
  'macos.seatbelt-backend',
  'macos.packaged-os-sandbox-validation',
  'postman-parity.separate-claim',
  'load-tests.scripted-sandbox-contract',
  'release-gate.platform-matrix-validation'
]);

const VALID_CLAIM_SURFACES = Object.freeze([
  PLATFORM_OS_SANDBOX_CLAIM,
  POSTMAN_API_PARITY_CLAIM,
  LOAD_TEST_SCRIPTING_CLAIM,
  RELEASE_GATE_CLAIM
]);

const VALID_PLATFORMS = Object.freeze(['all', 'linux', 'windows', 'macos']);

function buildOsSandboxPlatformMatrix() {
  const rows = [
    row('linux.namespace-bubblewrap', 'linux', 'namespace/filesystem/network', 'Linux script workers launch through bubblewrap with unshared namespaces, no host network namespace, dropped capabilities, cleared environment, and private writable tmpfs mounts.', 'implemented', {
      claimBlocking: true,
      securityDecision: 'Use bubblewrap as the first OS-level backend and require it for Linux production validation.',
      sourceRefs: ['sandboxContract', 'osSandbox', 'runtimeValidation'],
      verificationRefs: [
        'npm run sandbox:validate',
        'npm run sandbox:validate:packaged',
        'test/electron/scriptSandbox.test.js'
      ]
    }),
    row('linux.seccomp-dangerous-syscall-policy', 'linux', 'syscall-policy', 'Linux bubblewrap launches install a seccomp cBPF deny policy for high-risk kernel APIs such as bpf, ptrace, keyring, mount, process_vm_*, perf_event_open, io_uring, and nested namespace syscalls.', 'implemented', {
      claimBlocking: true,
      securityDecision: 'Keep the dangerous-syscall deny policy in the Linux release gate as the accepted current Linux syscall-policy standard.',
      sourceRefs: ['sandboxContract', 'seccompPolicy', 'runtimeValidation'],
      verificationRefs: [
        'npm run sandbox:validate',
        'test/electron/scriptSandbox.test.js'
      ]
    }),
    row('linux.seccomp-deny-default-allowlist-decision', 'linux', 'syscall-policy', 'Maintainer decision: platform-equivalent current Linux coverage does not require a maintained deny-by-default seccomp-BPF allowlist beyond the current bubblewrap namespace isolation plus dangerous-syscall deny policy.', 'implemented', {
      claimBlocking: false,
      securityDecision: 'Accept the current Linux bubblewrap plus dangerous-syscall seccomp policy for the current Linux public claim; track a deny-by-default allowlist only as optional future hardening.',
      sourceRefs: ['sandboxContract', 'nextSteps', 'seccompPolicy'],
      verificationRefs: [
        'NEXT_STEPS.MD Questions For Maintainer After Implementation',
        'npm run sandbox:validate',
        'test/electron/scriptSandbox.test.js'
      ]
    }),
    row('linux.packaged-os-sandbox-validation', 'linux', 'packaged-validation', 'Packaged Linux artifacts must prove the OS sandbox backend, Node permission flags, ASAR/path behavior, and sandbox worker launch still work after packaging.', 'implemented', {
      claimBlocking: true,
      securityDecision: 'Keep packaged Linux OS-sandbox validation in CI and release workflows before shipping artifacts.',
      sourceRefs: ['sandboxContract', 'runtimeValidation', 'ciWorkflow', 'releaseWorkflow'],
      verificationRefs: [
        'npm run sandbox:validate:packaged',
        '.github/workflows/ci.yml',
        '.github/workflows/release.yml'
      ]
    }),
    row('windows.appcontainer-backend', 'windows', 'native-backend', 'Windows script workers have a fail-closed native helper contract, but the release-owned AppContainer/restricted-token helper binary is still required before claiming platform-equivalent coverage.', 'blocked-native-backend', {
      claimBlocking: true,
      securityDecision: 'Fail closed or downgrade the public claim on Windows until the configured helper is packaged and validates AppContainer or equivalent restricted-token/job-object behavior; do not silently rely on node:vm alone.',
      sourceRefs: ['sandboxContract', 'nextSteps', 'osSandbox'],
      verificationRefs: [
        'POSTMETER_WINDOWS_OS_SANDBOX_HELPER launcher contract in src/core/osSandbox.js',
        'future Windows native backend tests',
        'future npm run sandbox:validate on windows-latest with helper artifact'
      ]
    }),
    row('windows.packaged-os-sandbox-validation', 'windows', 'packaged-validation', 'Packaged Windows artifacts must validate the native OS sandbox backend, Node permission flags, packaged path behavior, and script-worker launch behavior on a Windows runner.', 'blocked-native-backend', {
      claimBlocking: true,
      securityDecision: 'Windows release validation cannot satisfy the platform-equivalent OS sandbox claim until it proves the native backend in packaged artifacts.',
      sourceRefs: ['sandboxContract', 'nextSteps', 'releaseWorkflow'],
      verificationRefs: [
        'future npm run sandbox:validate:packaged on windows-latest with native OS backend assertions',
        '.github/workflows/release.yml'
      ]
    }),
    row('macos.seatbelt-backend', 'macos', 'native-backend', 'macOS script workers select a seatbelt-style sandbox-exec launcher when present, but native-runner source and packaged probes must prove the profile before claiming platform-equivalent coverage.', 'blocked-native-backend', {
      claimBlocking: true,
      securityDecision: 'Fail closed or downgrade the public claim on macOS until seatbelt behavior is validated on macos-latest packaged artifacts; do not silently rely on node:vm alone.',
      sourceRefs: ['sandboxContract', 'nextSteps', 'osSandbox'],
      verificationRefs: [
        'macos-seatbelt launcher path in src/core/osSandbox.js',
        'future macOS native backend tests',
        'future npm run sandbox:validate on macos-latest with packaged probes'
      ]
    }),
    row('macos.packaged-os-sandbox-validation', 'macos', 'packaged-validation', 'Packaged macOS artifacts must validate the native OS sandbox backend, Node permission flags, app bundle/ASAR path behavior, and script-worker launch behavior on a macOS runner.', 'blocked-native-backend', {
      claimBlocking: true,
      securityDecision: 'macOS release validation cannot satisfy the platform-equivalent OS sandbox claim until it proves the native backend in packaged artifacts.',
      sourceRefs: ['sandboxContract', 'nextSteps', 'releaseWorkflow'],
      verificationRefs: [
        'future npm run sandbox:validate:packaged on macos-latest with native OS backend assertions',
        '.github/workflows/release.yml'
      ]
    }),
    row('postman-parity.separate-claim', 'all', 'claim-boundary', 'Postman script API parity is tracked by the Postman parity matrix, official-docs coverage audit, and claim gate; platform OS sandbox completion is intentionally not part of npm run postman:parity:claim.', 'implemented', {
      claimBlocking: false,
      claimSurface: POSTMAN_API_PARITY_CLAIM,
      securityDecision: 'Keep compatibility gaps and platform OS sandbox gaps on separate claim gates so one cannot mask the other.',
      sourceRefs: ['sandboxContract', 'nextSteps'],
      verificationRefs: [
        'npm run postman:parity:validate',
        'npm run postman:docs:validate',
        'npm run postman:parity:claim',
        'docs/postman-sandbox-parity-matrix.json',
        'docs/postman-docs-coverage-audit.json'
      ]
    }),
    row('load-tests.scripted-sandbox-contract', 'all', 'claim-boundary', 'Scripted load tests remain outside the Postman scripting parity claim unless a separate scripted-load-test contract is written and implemented.', 'out-of-scope', {
      claimBlocking: false,
      claimSurface: LOAD_TEST_SCRIPTING_CLAIM,
      securityDecision: 'Do not execute request scripts during load tests in sandbox v1; avoid implying partial scripted-load compatibility.',
      sourceRefs: ['sandboxContract', 'nextSteps'],
      verificationRefs: [
        'docs/SANDBOX_CONTRACT.md Load-Test Decision',
        'docs/COMPATIBILITY.md load-test limitation'
      ]
    }),
    row('release-gate.platform-matrix-validation', 'all', 'release-gating', 'The OS-sandbox platform matrix is generated, committed, validated, and wired into check, CI, release workflow, and release-gate manifest validation.', 'validation-hook', {
      claimBlocking: false,
      claimSurface: RELEASE_GATE_CLAIM,
      securityDecision: 'Require matrix freshness and structure in normal validation, while keeping the stronger platform-equivalent claim as a separate intentionally failing gate until blockers are resolved.',
      sourceRefs: ['releaseGate', 'ciWorkflow', 'releaseWorkflow', 'nextSteps'],
      verificationRefs: [
        'npm run sandbox:platform:validate',
        'npm run postman:docs:validate',
        'npm run release:gate',
        'npm run check'
      ]
    })
  ];

  return {
    schemaVersion: 1,
    generatedFrom: 'src/core/osSandboxPlatformMatrix.js',
    deterministic: true,
    target: {
      claim: 'Platform-equivalent full OS sandbox coverage for script workers',
      separation: 'This matrix is separate from Postman API parity and from scripted load-test support.',
      postmanParityCommand: 'npm run postman:parity:claim',
      postmanDocsCommand: 'npm run postman:docs:validate',
      platformClaimCommand: 'npm run sandbox:platform:claim'
    },
    claimSurfaces: {
      [PLATFORM_OS_SANDBOX_CLAIM]: 'Native OS sandbox coverage and packaged validation across tier-one desktop platforms.',
      [POSTMAN_API_PARITY_CLAIM]: 'Postman script API behavior and imported-script observable output.',
      [LOAD_TEST_SCRIPTING_CLAIM]: 'Future scripted load-test contract; currently out of scope.',
      [RELEASE_GATE_CLAIM]: 'Validation plumbing required to keep the matrix current.'
    },
    statuses: STATUS_DESCRIPTIONS,
    sources: SOURCES,
    rows: rows.sort((left, right) => left.id.localeCompare(right.id))
  };
}

function validateOsSandboxPlatformMatrix(matrix) {
  const errors = [];
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return ['OS sandbox platform matrix must be an object.'];
  }
  if (matrix.schemaVersion !== 1) {
    errors.push('OS sandbox platform matrix schemaVersion must be 1.');
  }
  if (matrix.generatedFrom !== 'src/core/osSandboxPlatformMatrix.js') {
    errors.push('OS sandbox platform matrix generatedFrom must be src/core/osSandboxPlatformMatrix.js.');
  }
  const sourceIds = new Set(Object.keys(matrix.sources || {}));
  const statuses = new Set(Object.keys(matrix.statuses || {}));
  const claimSurfaces = new Set(Object.keys(matrix.claimSurfaces || {}));
  for (const status of Object.keys(STATUS_DESCRIPTIONS)) {
    if (!statuses.has(status)) {
      errors.push(`OS sandbox platform matrix must declare status ${status}.`);
    }
  }
  for (const claimSurface of VALID_CLAIM_SURFACES) {
    if (!claimSurfaces.has(claimSurface)) {
      errors.push(`OS sandbox platform matrix must declare claim surface ${claimSurface}.`);
    }
  }
  if (!sourceIds.size) {
    errors.push('OS sandbox platform matrix must declare sources.');
  }

  const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
  if (!Array.isArray(matrix.rows)) {
    errors.push('OS sandbox platform matrix rows must be an array.');
  }
  if (rows.length < REQUIRED_ROW_IDS.length) {
    errors.push(`OS sandbox platform matrix must track at least ${REQUIRED_ROW_IDS.length} rows.`);
  }

  const rowIds = new Set();
  const platforms = new Set();
  for (const rowItem of rows) {
    validateRow(rowItem, { claimSurfaces, errors, platforms, rowIds, sourceIds, statuses });
  }
  for (const requiredId of REQUIRED_ROW_IDS) {
    if (!rowIds.has(requiredId)) {
      errors.push(`OS sandbox platform matrix is missing required row ${requiredId}.`);
    }
  }
  for (const platform of ['linux', 'windows', 'macos']) {
    if (!platforms.has(platform)) {
      errors.push(`OS sandbox platform matrix must include ${platform} rows.`);
    }
  }
  return errors;
}

function validateOsSandboxPlatformClaim(matrix, options = {}) {
  const errors = [];
  if (options.skipStructuralValidation !== true) {
    errors.push(...validateOsSandboxPlatformMatrix(matrix));
  }
  const blockers = platformClaimBlockers(matrix);
  if (blockers.length) {
    errors.push(`Platform-equivalent full OS sandbox claim is blocked by ${blockers.length} row(s).`);
  }
  return {
    blockers,
    errors,
    ok: errors.length === 0,
    summary: osSandboxPlatformSummary(matrix, blockers)
  };
}

function platformClaimBlockers(matrix) {
  return (matrix?.rows || [])
    .filter((rowItem) => rowItem.claimSurface === PLATFORM_OS_SANDBOX_CLAIM)
    .filter((rowItem) => rowItem.claimBlocking === true)
    .filter((rowItem) => rowItem.status !== 'implemented')
    .map((rowItem) => ({
      area: rowItem.area,
      id: rowItem.id,
      platform: rowItem.platform,
      status: rowItem.status,
      target: rowItem.target
    }));
}

function osSandboxPlatformSummary(matrix, blockers = platformClaimBlockers(matrix)) {
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const byStatus = {};
  const byPlatform = {};
  const byClaimSurface = {};
  for (const rowItem of rows) {
    byStatus[rowItem.status] = (byStatus[rowItem.status] || 0) + 1;
    byPlatform[rowItem.platform] = (byPlatform[rowItem.platform] || 0) + 1;
    byClaimSurface[rowItem.claimSurface] = (byClaimSurface[rowItem.claimSurface] || 0) + 1;
  }
  return {
    blockersByPlatform: blockers.reduce((accumulator, blocker) => {
      accumulator[blocker.platform] = (accumulator[blocker.platform] || 0) + 1;
      return accumulator;
    }, {}),
    blockersByStatus: blockers.reduce((accumulator, blocker) => {
      accumulator[blocker.status] = (accumulator[blocker.status] || 0) + 1;
      return accumulator;
    }, {}),
    claimReady: blockers.length === 0,
    platformClaimBlockers: blockers.length,
    rowCount: rows.length,
    byClaimSurface,
    byPlatform,
    byStatus
  };
}

function validateRow(rowItem, context) {
  const { claimSurfaces, errors, platforms, rowIds, sourceIds, statuses } = context;
  if (!rowItem || typeof rowItem !== 'object' || Array.isArray(rowItem)) {
    errors.push('OS sandbox platform matrix rows must be objects.');
    return;
  }
  if (!rowItem.id || typeof rowItem.id !== 'string') {
    errors.push('OS sandbox platform matrix row is missing a string id.');
    return;
  }
  if (rowIds.has(rowItem.id)) {
    errors.push(`OS sandbox platform matrix row id is duplicated: ${rowItem.id}.`);
  }
  rowIds.add(rowItem.id);

  for (const field of ['platform', 'area', 'target', 'status', 'claimSurface', 'securityDecision']) {
    if (!rowItem[field] || typeof rowItem[field] !== 'string') {
      errors.push(`OS sandbox platform matrix row ${rowItem.id} is missing ${field}.`);
    }
  }
  if (!VALID_PLATFORMS.includes(rowItem.platform)) {
    errors.push(`OS sandbox platform matrix row ${rowItem.id} has invalid platform ${rowItem.platform}.`);
  } else {
    platforms.add(rowItem.platform);
  }
  if (!statuses.has(rowItem.status)) {
    errors.push(`OS sandbox platform matrix row ${rowItem.id} has unknown status ${rowItem.status}.`);
  }
  if (!claimSurfaces.has(rowItem.claimSurface)) {
    errors.push(`OS sandbox platform matrix row ${rowItem.id} has unknown claim surface ${rowItem.claimSurface}.`);
  }
  if (typeof rowItem.claimBlocking !== 'boolean') {
    errors.push(`OS sandbox platform matrix row ${rowItem.id} must declare boolean claimBlocking.`);
  }
  if (rowItem.securityDecision === 'pending') {
    errors.push(`OS sandbox platform matrix row ${rowItem.id} must have a concrete security decision.`);
  }
  if (!Array.isArray(rowItem.sourceRefs) || !rowItem.sourceRefs.length) {
    errors.push(`OS sandbox platform matrix row ${rowItem.id} must cite at least one source.`);
  } else {
    for (const sourceRef of rowItem.sourceRefs) {
      if (!sourceIds.has(sourceRef)) {
        errors.push(`OS sandbox platform matrix row ${rowItem.id} references unknown source ${sourceRef}.`);
      }
    }
  }
  if (!Array.isArray(rowItem.verificationRefs) || !rowItem.verificationRefs.length) {
    errors.push(`OS sandbox platform matrix row ${rowItem.id} must cite at least one verification reference.`);
  }
  if (rowItem.claimSurface !== PLATFORM_OS_SANDBOX_CLAIM && rowItem.claimBlocking) {
    errors.push(`OS sandbox platform matrix row ${rowItem.id} cannot block the OS sandbox platform claim from claim surface ${rowItem.claimSurface}.`);
  }
}

function row(id, platform, area, target, status, options = {}) {
  return {
    id,
    platform,
    area,
    target,
    status,
    claimSurface: options.claimSurface || PLATFORM_OS_SANDBOX_CLAIM,
    claimBlocking: options.claimBlocking === true,
    securityDecision: options.securityDecision || 'pending',
    sourceRefs: options.sourceRefs || [],
    verificationRefs: options.verificationRefs || [],
    notes: options.notes || ''
  };
}

module.exports = {
  LOAD_TEST_SCRIPTING_CLAIM,
  PLATFORM_OS_SANDBOX_CLAIM,
  POSTMAN_API_PARITY_CLAIM,
  RELEASE_GATE_CLAIM,
  buildOsSandboxPlatformMatrix,
  osSandboxPlatformSummary,
  platformClaimBlockers,
  validateOsSandboxPlatformClaim,
  validateOsSandboxPlatformMatrix
};
