const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  loadPersistedSmokeWorkspace,
  validatePersistenceArtifacts
} = require('../../scripts/validatePackagedAppSmoke');

test('packaged smoke validation accepts managed workspace filenames', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-smoke-test-'));
  try {
    const dataPath = path.join(directory, 'workspace.json');
    const managedWorkspacePath = path.join(directory, 'Local Workspace.json');
    await fs.mkdir(path.join(directory, 'userData'), { recursive: true });
    await fs.writeFile(managedWorkspacePath, JSON.stringify({
      schemaVersion: 11,
      collections: [],
      environments: [],
      globals: [{ enabled: true, key: '__postmeter_packaged_smoke', value: 'marker' }],
      cookies: [],
      history: []
    }));

    const workspace = await loadPersistedSmokeWorkspace(dataPath, 'marker');
    assert.equal(workspace.globals[0].value, 'marker');
    await validatePersistenceArtifacts(directory, dataPath, 'marker');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
