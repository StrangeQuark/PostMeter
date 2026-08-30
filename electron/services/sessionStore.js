const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultSessionState, normalizeSessionState } = require('../../src/core/workspace/sessionState');
const {
  pathExists,
  postMeterProfileDirectory,
  writeJsonFileAtomic,
  writeJsonFileAtomicSync
} = require('../../src/core/workspace/workspacePersistence');

class SessionStore {
  constructor(sessionPath) {
    this.sessionPath = path.resolve(sessionPath);
  }

  getSessionPath() {
    return this.sessionPath;
  }

  async load(options = {}) {
    if (!(await pathExists(this.sessionPath))) {
      return defaultSessionState();
    }
    try {
      return sessionForStorage(JSON.parse(await fs.readFile(this.sessionPath, 'utf8')), options);
    } catch {
      return defaultSessionState();
    }
  }

  async save(session, options = {}) {
    const normalized = sessionForStorage(session, options);
    await writeJsonFileAtomic(this.sessionPath, normalized, { prefix: 'postmeter-session' });
    return normalized;
  }

  saveSync(session, options = {}) {
    const normalized = sessionForStorage(session, options);
    writeJsonFileAtomicSync(this.sessionPath, normalized, { prefix: 'postmeter-session' });
    return normalized;
  }

  async patch(partial, options = {}) {
    const current = await this.load(options);
    return this.save({ ...current, ...partial }, options);
  }
}

function sessionForStorage(session, options = {}) {
  const normalized = normalizeSessionState(session);
  return options.redactSensitive === true ? redactSensitiveSessionState(normalized) : normalized;
}

function redactSensitiveSessionState(session) {
  const clearTabState = (tabs = []) => tabs.map((tab) => ({
    ...tab,
    dirty: false,
    createdUnsaved: false,
    snapshot: '',
    currentState: null
  }));
  return {
    ...session,
    openCollectionTabs: clearTabState(session.openCollectionTabs),
    openFolderTabs: clearTabState(session.openFolderTabs),
    openRequestTabs: clearTabState(session.openRequestTabs),
    openEnvironmentTabs: clearTabState(session.openEnvironmentTabs),
    openRunnerTabs: clearTabState(session.openRunnerTabs),
    openPerformanceTabs: clearTabState(session.openPerformanceTabs),
    draftRequests: [],
    dirtyCollectionStates: [],
    dirtyCookieJarState: null
  };
}

function defaultSessionPath(userDataPath) {
  return path.join(postMeterProfileDirectory(userDataPath), 'session.json');
}

module.exports = {
  SessionStore,
  defaultSessionPath,
  redactSensitiveSessionState
};
