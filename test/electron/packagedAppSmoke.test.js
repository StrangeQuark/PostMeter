const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  expectedDefaultUserDataPath,
  expectedDefaultUserDataRoot,
  isolatedDefaultPathEnv,
  loadPersistedSmokeWorkspace,
  validateDefaultPersistenceArtifacts,
  validatePersistenceArtifacts,
  writeSmokeLog
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

test('packaged smoke validates default platform persistence paths in an isolated home', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-default-path-test-'));
  try {
    const env = await isolatedDefaultPathEnv(directory);
    const userDataPath = expectedDefaultUserDataPath(env);
    const workspacePath = path.join(env.USERPROFILE || env.HOME, '.postmeter', 'workspace.json');
    await fs.mkdir(userDataPath, { recursive: true });
    await fs.mkdir(path.dirname(workspacePath), { recursive: true });
    await fs.writeFile(workspacePath, JSON.stringify({
      schemaVersion: 11,
      collections: [],
      environments: [],
      globals: [{ enabled: true, key: '__postmeter_packaged_smoke', value: 'default-marker' }],
      cookies: [],
      history: []
    }));

    await validateDefaultPersistenceArtifacts(env, 'default-marker');
    assert.equal(expectedDefaultUserDataRoot(env, 'linux'), env.XDG_CONFIG_HOME);
    assert.equal(expectedDefaultUserDataRoot(env, 'win32'), env.APPDATA);
    assert.equal(expectedDefaultUserDataRoot(env, 'darwin'), path.join(env.HOME, 'Library', 'Application Support'));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('packaged smoke writes validation logs when an artifact directory is configured', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-smoke-log-'));
  const previous = process.env.POSTMETER_VALIDATION_ARTIFACT_DIR;
  process.env.POSTMETER_VALIDATION_ARTIFACT_DIR = directory;
  try {
    await writeSmokeLog('reload pass', '/tmp/PostMeter', {
      code: 0,
      stdout: 'ready',
      stderr: ''
    });
    const files = await fs.readdir(directory);
    assert.ok(files.some((file) => file.startsWith(`packaged-app-smoke-${process.platform}-reload-pass`)));
    const log = await fs.readFile(path.join(directory, files[0]), 'utf8');
    assert.match(log, /executable=\/tmp\/PostMeter/);
    assert.match(log, /exitCode=0/);
    assert.match(log, /ready/);
  } finally {
    if (previous === undefined) {
      delete process.env.POSTMETER_VALIDATION_ARTIFACT_DIR;
    } else {
      process.env.POSTMETER_VALIDATION_ARTIFACT_DIR = previous;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
