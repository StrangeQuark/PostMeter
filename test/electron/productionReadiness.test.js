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
  assert.ok(summary.releaseBlockers.includes('diagnostics.privacy'));
  const betaBlockers = productionReadinessBlockers(matrix, 'beta');
  const rcBlockers = productionReadinessBlockers(matrix, 'rc');
  const stableBlockers = productionReadinessBlockers(matrix, 'stable');
  assert.deepEqual([...new Set(betaBlockers.map((row) => row.status))], ['blocked']);
  assert.ok(betaBlockers.length < rcBlockers.length);
  assert.equal(rcBlockers.length, stableBlockers.length);
  for (const validatedGateRow of ['release.dashboard', 'dependencies.audit', 'electron.runtime-version']) {
    assert.equal(stableBlockers.some((row) => row.id === validatedGateRow), false);
  }

  const waivedMatrix = {
    ...matrix,
    rows: matrix.rows.map((row) => row.id === 'diagnostics.privacy'
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
  const waivedDiagnostics = waivedMatrix.rows.find((row) => row.id === 'diagnostics.privacy');
  assert.equal(rowWaivedForReleaseLevel(waivedDiagnostics, 'rc'), true);
  assert.equal(rowWaivedForReleaseLevel(waivedDiagnostics, 'stable'), false);
  assert.equal(rowWaivedForReleaseLevel({ ...waivedDiagnostics, waiver: { ...waivedDiagnostics.waiver, reason: '' } }, 'rc'), false);
  assert.equal(rowWaivedForReleaseLevel({ ...waivedDiagnostics, waiver: { ...waivedDiagnostics.waiver, docs: [null] } }, 'rc'), false);
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
    'future npm run oauth:certify:live'
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

test('production support matrices cover Electron security, workspace durability, and non-Postman compatibility', () => {
  for (const name of ['electron-security', 'workspace-durability', 'non-postman-compatibility']) {
    const matrix = buildMatrix(name);
    assert.deepEqual(validateMatrix(matrix, name), []);
    assert.ok(matrix.rows.length >= 6, `${name} should cover multiple release concerns`);
  }
});
