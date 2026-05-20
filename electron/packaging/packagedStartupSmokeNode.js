#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WorkspaceManager } = require('../../src/core/workspace/workspaceManager');
const { redactText } = require('../../src/core/diagnostics-release/diagnostics');
const { SessionStore, defaultSessionPath } = require('../services/sessionStore');

async function main() {
  await runPackagedStartupSmokeNode();
  console.log('PostMeter packaged startup smoke node-mode validation passed.');
}

async function runPackagedStartupSmokeNode(options = {}) {
  const {
    env = process.env,
    log = () => {},
    sessionStoreFactory = (userDataPath) => new SessionStore(defaultSessionPath(userDataPath)),
    workspaceManagerFactory = () => new WorkspaceManager()
  } = options;
  if (env.POSTMETER_PACKAGED_SMOKE !== '1') {
    throw new Error('Packaged startup smoke node-mode validation requires POSTMETER_PACKAGED_SMOKE=1.');
  }
  const userDataPath = expectedPackagedUserDataPath(env, process.platform);
  await fs.mkdir(userDataPath, { recursive: true });
  process.env.POSTMETER_USER_DATA_PATH = userDataPath;
  log(`userData=${userDataPath}`);

  const sessionStore = sessionStoreFactory(userDataPath);
  let sessionState = await sessionStore.load();
  log('session loaded');

  const workspaceStore = workspaceManagerFactory();
  const loaded = await workspaceStore.load({ preferredWorkspaceId: sessionState.activeWorkspaceId });
  sessionState = await sessionStore.patch({ activeWorkspaceId: loaded.activeWorkspaceId });
  log(`workspace loaded: ${loaded.activeWorkspaceId}`);

  const markerKey = '__postmeter_packaged_smoke';
  const markerValue = env.POSTMETER_PACKAGED_SMOKE_MARKER || 'startup-smoke';
  const expectReload = env.POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD === '1';
  const globals = Array.isArray(loaded.workspace.globals) ? loaded.workspace.globals : [];
  const existing = globals.find((item) => item.key === markerKey);
  if (expectReload && (!existing || existing.value !== markerValue)) {
    throw new Error('Packaged smoke workspace persistence did not survive restart.');
  }
  if (!expectReload) {
    loaded.workspace.globals = [
      ...globals.filter((item) => item.key !== markerKey),
      { enabled: true, key: markerKey, value: markerValue }
    ];
    await workspaceStore.save(loaded.workspace);
    log('workspace marker saved');
  }
  log('workspace persistence validated');
  return {
    activeWorkspaceId: loaded.activeWorkspaceId,
    sessionState,
    userDataPath,
    workspace: loaded.workspace
  };
}

function expectedPackagedUserDataPath(env = process.env, platform = process.platform) {
  if (env.POSTMETER_DATA_PATH) {
    return path.join(path.dirname(path.resolve(env.POSTMETER_DATA_PATH)), 'userData');
  }
  return path.join(expectedDefaultUserDataRoot(env, platform), defaultUserDataDirectoryName(platform));
}

function expectedDefaultUserDataRoot(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    return path.resolve(env.APPDATA || path.join(env.USERPROFILE || env.HOME || os.homedir(), 'AppData', 'Roaming'));
  }
  if (platform === 'darwin') {
    return path.resolve(env.CFFIXED_USER_HOME || env.HOME || os.homedir(), 'Library', 'Application Support');
  }
  return path.resolve(env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), '.config'));
}

function defaultUserDataDirectoryName(platform = process.platform) {
  return platform === 'linux' ? 'postmeter' : 'PostMeter';
}

if (require.main === module) {
  main().catch((error) => {
    console.error(redactText(error?.stack || error?.message || String(error)));
    process.exit(1);
  });
}

module.exports = {
  defaultUserDataDirectoryName,
  expectedDefaultUserDataRoot,
  expectedPackagedUserDataPath,
  runPackagedStartupSmokeNode
};
