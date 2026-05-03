const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  buildProductionReadinessMatrix,
  productionReadinessBlockers,
  productionReadinessSummary,
  rowWaivedForReleaseLevel,
  validateProductionReadinessMatrix
} = require('../../src/core/productionReadinessMatrix');
const {
  buildMatrix,
  validateMatrix
} = require('../../src/core/productionSupportMatrices');
const {
  validateEvidenceRefs: validateSupportEvidenceRefs,
  validateTestRefs: validateSupportTestRefs
} = require('../../scripts/productionSupportMatrix');
const {
  validateMatrixReferences,
  validateCommittedMatrix
} = require('../../scripts/productionReadiness');

test('production readiness matrix tracks release areas and stable-release blockers', async () => {
  const matrix = buildProductionReadinessMatrix();
  const ids = new Set(matrix.rows.map((row) => row.id));
  const byId = new Map(matrix.rows.map((row) => [row.id, row]));
  for (const requiredId of [
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
  ]) {
    assert.ok(ids.has(requiredId), `Missing readiness row ${requiredId}`);
  }
  assert.deepEqual(validateProductionReadinessMatrix(matrix), []);
  assert.equal(byId.get('release.dashboard').status, 'validated');
  assert.ok(byId.get('release.dashboard').commands.includes('npm run release:gate'));
  assert.ok(byId.get('release.dashboard').commands.includes('npm run production:readiness:write'));
  assert.ok(byId.get('release.dashboard').commands.includes('npm run production:readiness:claim'));
  assert.ok(byId.get('release.dashboard').commands.includes('npm run production:readiness:claim:beta'));
  assert.ok(byId.get('release.dashboard').commands.includes('npm run production:readiness:claim:rc'));
  assert.ok(byId.get('release.dashboard').commands.includes('npm run production:readiness:claim:stable'));
  assert.ok(byId.get('dependencies.audit').commands.includes('npm audit --audit-level=high'));
  assert.ok(byId.get('electron.runtime-version').commands.includes('npm run electron:version'));
  assert.equal(byId.get('grpc.pfx-p12-mtls').area, 'transport');
  assert.equal(byId.get('diagnostics.privacy').status, 'validated');
  assert.ok(byId.get('diagnostics.privacy').commands.includes('npm run diagnostics:privacy:validate'));
  assert.deepEqual(matrix.releaseLevels, ['beta', 'rc', 'stable']);
  assert.deepEqual(matrix.releasePolicies.beta.allowedReleaseBlockingStatuses, ['implemented', 'validated', 'external-validation-required']);
  assert.equal(matrix.releasePolicies.beta.allowDocumentedWaivers, false);
  assert.deepEqual(matrix.releasePolicies.rc.allowedReleaseBlockingStatuses, ['validated']);
  assert.equal(matrix.releasePolicies.rc.allowDocumentedWaivers, true);
  assert.deepEqual(matrix.releasePolicies.stable.allowedReleaseBlockingStatuses, ['validated']);
  assert.equal(matrix.releasePolicies.stable.allowDocumentedWaivers, false);
  for (const row of matrix.rows) {
    for (const field of ['id', 'area', 'target', 'status', 'releaseBlocking', 'commands', 'evidenceRefs', 'owner', 'lastVerified', 'notes']) {
      assert.ok(Object.hasOwn(row, field), `Readiness row ${row.id} missing ${field}`);
    }
  }
  const summary = productionReadinessSummary(matrix);
  assert.equal(summary.releaseLevel, 'stable');
  assert.ok(summary.releaseBlockerCount >= 1);
  assert.equal(summary.releaseBlockers.includes('diagnostics.privacy'), false);
  const betaBlockers = productionReadinessBlockers(matrix, 'beta');
  const rcBlockers = productionReadinessBlockers(matrix, 'rc');
  const stableBlockers = productionReadinessBlockers(matrix, 'stable');
  assert.deepEqual(betaBlockers, []);
  assert.ok(betaBlockers.length < rcBlockers.length);
  assert.equal(rcBlockers.length, stableBlockers.length);
  for (const validatedGateRow of ['release.dashboard', 'dependencies.audit', 'electron.runtime-version', 'diagnostics.privacy']) {
    assert.equal(stableBlockers.some((row) => row.id === validatedGateRow), false);
  }

  const waivedMatrix = {
    ...matrix,
    rows: matrix.rows.map((row) => row.id === 'oauth.live-certification'
      ? {
          ...row,
          waiver: {
            releaseLevels: ['rc'],
            reason: 'Temporary release-candidate waiver documented for maintainer review.',
            docs: ['docs/RELEASE_READINESS.md']
          }
        }
      : row)
  };
  const waivedOauth = waivedMatrix.rows.find((row) => row.id === 'oauth.live-certification');
  assert.equal(rowWaivedForReleaseLevel(waivedOauth, 'rc'), true);
  assert.equal(rowWaivedForReleaseLevel(waivedOauth, 'stable'), false);
  assert.equal(rowWaivedForReleaseLevel({ ...waivedOauth, waiver: { ...waivedOauth.waiver, reason: '' } }, 'rc'), false);
  assert.equal(rowWaivedForReleaseLevel({ ...waivedOauth, waiver: { ...waivedOauth.waiver, docs: [null] } }, 'rc'), false);
  assert.ok(productionReadinessBlockers(waivedMatrix, 'rc').length < productionReadinessBlockers(waivedMatrix, 'stable').length);
});

test('production readiness matrix references real local evidence and required lower-level checks', () => {
  const root = path.join(__dirname, '..', '..');
  const matrix = buildProductionReadinessMatrix();
  const commands = new Set(matrix.rows.flatMap((row) => row.commands));

  for (const command of [
    'npm run release:gate',
    'npm run sandbox:validate',
    'npm run sandbox:platform:validate',
    'npm run sandbox:platform:claim',
    'npm run postman:parity:claim',
    'npm run postman:docs:validate',
    'npm audit --audit-level=high',
    'npm run electron:version',
    'npm run dist:linux',
    'npm run dist:win',
    'npm run dist:mac',
    'npm run oauth:certify:validate',
    'npm run oauth:certify:mock',
    'npm run oauth:certify:live',
    'npm run diagnostics:privacy:validate'
  ]) {
    assert.ok(commands.has(command), `Readiness matrix does not reference ${command}`);
  }

  for (const row of matrix.rows) {
    for (const ref of row.evidenceRefs) {
      if (/^(future|https?:|npm )/.test(ref)) {
        continue;
      }
      assert.ok(fs.existsSync(path.join(root, ref)), `Readiness row ${row.id} references missing evidence ${ref}`);
    }
  }
});

test('production readiness validator rejects missing required rows and malformed waivers', () => {
  const matrix = buildProductionReadinessMatrix();

  assert.match(
    validateProductionReadinessMatrix({
      ...matrix,
      rows: matrix.rows.filter((row) => row.id !== 'release.dashboard')
    }).join('\n'),
    /missing required row release\.dashboard/
  );

  assert.match(
    validateProductionReadinessMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => row.id === 'diagnostics.privacy'
        ? { ...row, waiver: { releaseLevels: ['stable'], reason: '', docs: [] } }
        : row)
    }).join('\n'),
    /waiver must declare a reason/
  );

  assert.match(
    validateProductionReadinessMatrix({
      ...matrix,
      deterministic: false
    }).join('\n'),
    /deterministic must be true/
  );

  assert.match(
    validateProductionReadinessMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => row.id === 'release.dashboard'
        ? { ...row, commands: ['npm run release:gate', ''] }
        : row)
    }).join('\n'),
    /commands must contain only non-empty strings/
  );

  assert.match(
    validateProductionReadinessMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => row.id === 'release.dashboard'
        ? { ...row, evidenceRefs: ['docs/RELEASE_READINESS.md', null] }
        : row)
    }).join('\n'),
    /evidenceRefs must contain only non-empty strings/
  );

  assert.match(
    validateProductionReadinessMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => row.id === 'release.dashboard'
        ? { ...row, area: 'surprise' }
        : row)
    }).join('\n'),
    /uses untracked release area surprise/
  );

  assert.match(
    validateProductionReadinessMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => row.id === 'release.dashboard'
        ? { ...row, commands: [] }
        : row)
    }).join('\n'),
    /at least one command/
  );
});

test('production readiness reference validation rejects missing and escaped local references', async () => {
  const matrix = buildProductionReadinessMatrix();

  assert.deepEqual(await validateMatrixReferences(matrix), []);
  assert.match(
    (await validateMatrixReferences({
      ...matrix,
      rows: matrix.rows.map((row) => row.id === 'release.dashboard'
        ? { ...row, evidenceRefs: ['docs/missing-release-readiness.md'] }
        : row)
    })).join('\n'),
    /evidenceRef does not exist/
  );
  assert.match(
    (await validateMatrixReferences({
      ...matrix,
      rows: matrix.rows.map((row) => row.id === 'diagnostics.privacy'
        ? {
            ...row,
            waiver: {
              releaseLevels: ['rc'],
              reason: 'Temporary release-candidate waiver documented for maintainer review.',
              docs: ['../outside.md']
            }
          }
        : row)
    })).join('\n'),
    /waiver doc must stay inside the project/
  );
});

test('committed production readiness matrix is fresh', async () => {
  const result = await validateCommittedMatrix();
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('production support matrices cover Electron security, workspace durability, non-Postman compatibility, UX accessibility, and diagnostics privacy', () => {
  for (const name of ['electron-security', 'workspace-durability', 'non-postman-compatibility', 'ux-accessibility', 'diagnostics-privacy']) {
    const matrix = buildMatrix(name);
    assert.deepEqual(validateMatrix(matrix, name), []);
    assert.ok(matrix.rows.length >= 6, `${name} should cover multiple release concerns`);
  }
});

test('non-Postman compatibility matrix keeps every Step 9 required row enumerated', () => {
  const matrix = buildMatrix('non-postman-compatibility');
  const ids = new Set(matrix.rows.map((row) => row.id));
  assert.deepEqual(validateMatrix(matrix, 'non-postman-compatibility'), []);
  assert.deepEqual([...ids].sort(), [
    'curl.cross-shell-quoting',
    'curl.import-export',
    'har.import-export',
    'har.privacy-export-boundary',
    'jmeter.bridge',
    'native-postmeter.roundtrip',
    'openapi.import-export',
    'openapi.invalid-common-specs',
    'unsupported.claim-boundaries'
  ]);
});

test('UX accessibility matrix keeps every Step 11 required row enumerated', () => {
  const matrix = buildMatrix('ux-accessibility');
  const ids = new Set(matrix.rows.map((row) => row.id));
  assert.deepEqual(validateMatrix(matrix, 'ux-accessibility'), []);
  assert.deepEqual([...ids].sort(), [
    'a11y.dynamic-controls',
    'a11y.live-regions',
    'a11y.modal-focus-management',
    'a11y.tabs-and-panels',
    'coverage.constrained-themes-long-labels',
    'coverage.failure-artifacts',
    'workflow.collection-runner',
    'workflow.diagnostics-export',
    'workflow.file-bindings',
    'workflow.first-launch-empty-state',
    'workflow.import-export',
    'workflow.load-test',
    'workflow.local-mocks',
    'workflow.oauth',
    'workflow.request-edit-send',
    'workflow.sandbox-package-review',
    'workflow.settings-theme',
    'workflow.update-check',
    'workflow.vault-prompts',
    'workflow.workspace-management'
  ]);
});

test('diagnostics privacy matrix keeps every Step 12 required row enumerated', () => {
  const matrix = buildMatrix('diagnostics-privacy');
  const ids = new Set(matrix.rows.map((row) => row.id));
  assert.deepEqual(validateMatrix(matrix, 'diagnostics-privacy'), []);
  assert.deepEqual([...ids].sort(), [
    'bundle.no-telemetry',
    'bundle.sanitized-export',
    'ipc.diagnostics-export',
    'logging.event-coverage',
    'logging.local-structured-rotation',
    'privacy.default-deny-request-response',
    'privacy.import-reset',
    'privacy.redaction-engine',
    'privacy.settings-validation',
    'release.matrix-validation',
    'ui.workspace-controls'
  ]);
});

test('production support matrix validator rejects escaped evidence and missing test refs', async () => {
  const matrix = {
    name: 'ux-accessibility',
    rows: [{
      id: 'workflow.test',
      area: 'Workflow',
      target: 'Test',
      status: 'implemented',
      evidenceRefs: ['../outside.md'],
      tests: [
        'npm run missing-script',
        '../outside.test.js',
        'test/electron/missing-test.js',
        'src/renderer/renderer.js',
        'future manual validation',
        'https://example.test/validation'
      ]
    }]
  };

  assert.match((await validateSupportEvidenceRefs(matrix)).join('\n'), /invalid evidence ref/);
  const testErrors = (await validateSupportTestRefs(matrix)).join('\n');
  assert.match(testErrors, /unknown npm script/);
  assert.match(testErrors, /invalid test ref/);
  assert.match(testErrors, /test ref does not exist/);
  assert.match(testErrors, /not an executable test file/);
  assert.match(testErrors, /future manual validation/);
  assert.match(testErrors, /https:\/\/example\.test\/validation/);
});

test('production support matrix structure rejects weak coverage rows', () => {
  const invalid = {
    name: 'ux-accessibility',
    schemaVersion: 1,
    rows: [{
      id: 'workflow.weak',
      area: 'Workflow',
      target: 'Weak coverage row',
      status: 'maybe',
      evidenceRefs: [],
      tests: []
    }]
  };

  const errors = validateMatrix(invalid, 'ux-accessibility').join('\n');
  assert.match(errors, /invalid status/);
  assert.match(errors, /at least one evidence ref/);
  assert.match(errors, /at least one test ref/);
});
