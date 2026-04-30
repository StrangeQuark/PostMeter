const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  expectedDefaultUserDataRoot,
  isPathInside,
  requiredPreloadApiSurface,
  runStartupSmokeProbe,
  validateSmokeUserDataPath,
  writeStartupSmokeFailureArtifacts
} = require('../../electron/mainWindow');
const {
  APP_PROTOCOL_HOST,
  APP_PROTOCOL_SCHEME,
  APP_RENDERER_CSP,
  APP_RENDERER_PATHNAME
} = require('../../electron/appProtocol');

test('startup smoke probe prevents renderer shutdown from overwriting marker save', async () => {
  let executedScript = '';
  const mainWindow = {
    webContents: {
      executeJavaScript: async (script) => {
        executedScript = script;
        return true;
      }
    }
  };

  await runStartupSmokeProbe({ quit() {} }, mainWindow, {
    POSTMETER_PACKAGED_SMOKE_MARKER: 'marker',
    POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD: ''
  });

  assert.match(executedScript, /window\.__postmeterSkipWorkspaceShutdownSave = true/);
  assert.match(executedScript, /window\.postmeter\.workspace\.save\(loaded\.workspace\)/);
  assert.match(executedScript, /releaseChannel/);
  assert.match(executedScript, /missingApi/);
  assert.match(executedScript, /window\.location\.protocol/);
  assert.match(executedScript, /window\.location\.hostname/);
  assert.match(executedScript, /window\.location\.pathname/);
  assert.match(executedScript, /Content-Security-Policy/);
  assert.match(executedScript, new RegExp(APP_PROTOCOL_SCHEME));
  assert.match(executedScript, new RegExp(APP_PROTOCOL_HOST));
  assert.match(executedScript, new RegExp(APP_RENDERER_PATHNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(executedScript, new RegExp(APP_RENDERER_CSP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('packaged startup smoke writes failure logs and screenshots when configured', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-startup-failure-artifacts-'));
  try {
    await writeStartupSmokeFailureArtifacts({
      webContents: {
        capturePage: async () => ({
          toPNG: () => Buffer.from('png')
        })
      }
    }, {
      POSTMETER_VALIDATION_ARTIFACT_DIR: directory
    }, new Error('startup failed'));
    const files = await fs.readdir(directory);
    assert.ok(files.some((file) => file.endsWith('.log')));
    assert.ok(files.some((file) => file.endsWith('.png')));
    const logName = files.find((file) => file.endsWith('.log'));
    assert.match(await fs.readFile(path.join(directory, logName), 'utf8'), /startup failed/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('packaged startup smoke validates the full preload API contract list', () => {
  const api = requiredPreloadApiSurface().map((pathParts) => pathParts.join('.'));
  assert.ok(api.includes('app.versions'));
  assert.ok(api.includes('workspace.load'));
  assert.ok(api.includes('request.send'));
  assert.ok(api.includes('runner.start'));
  assert.ok(api.includes('sandboxPackages.fetch'));
});

test('packaged startup smoke validates overridden userData path', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-user-data-smoke-'));
  try {
    const dataPath = path.join(directory, 'workspace.json');
    const userDataPath = path.join(directory, 'userData');
    await fs.mkdir(userDataPath);
    await assert.doesNotReject(() => validateSmokeUserDataPath({
      getPath: () => userDataPath
    }, {
      POSTMETER_PACKAGED_SMOKE: '1',
      POSTMETER_DATA_PATH: dataPath
    }));
    await assert.rejects(() => validateSmokeUserDataPath({
      getPath: () => directory
    }, {
      POSTMETER_PACKAGED_SMOKE: '1',
      POSTMETER_DATA_PATH: dataPath
    }), /userData path mismatch/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('packaged startup smoke validates platform default userData roots', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-default-user-data-smoke-'));
  try {
    const env = {
      APPDATA: path.join(directory, 'AppData', 'Roaming'),
      HOME: path.join(directory, 'home'),
      USERPROFILE: path.join(directory, 'home'),
      XDG_CONFIG_HOME: path.join(directory, 'xdg-config'),
      POSTMETER_PACKAGED_SMOKE: '1',
      POSTMETER_PACKAGED_SMOKE_DEFAULT_PATH: '1'
    };
    const root = expectedDefaultUserDataRoot(env);
    const userDataPath = path.join(root, 'PostMeter');
    await fs.mkdir(userDataPath, { recursive: true });
    await assert.doesNotReject(() => validateSmokeUserDataPath({
      getPath: () => userDataPath
    }, env));
    const wrongUserDataPath = path.join(directory, 'wrong', 'PostMeter');
    await fs.mkdir(wrongUserDataPath, { recursive: true });
    await assert.rejects(() => validateSmokeUserDataPath({
      getPath: () => wrongUserDataPath
    }, env), /default userData path mismatch/);
    assert.equal(isPathInside(root, userDataPath), true);
    assert.equal(isPathInside(root, wrongUserDataPath), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
