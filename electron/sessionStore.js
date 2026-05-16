const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultSessionState, normalizeSessionState } = require('../src/core/sessionState');
const {
  pathExists,
  postMeterProfileDirectory,
  writeJsonFileAtomic,
  writeJsonFileAtomicSync
} = require('../src/core/workspacePersistence');

class SessionStore {
  constructor(sessionPath) {
    this.sessionPath = path.resolve(sessionPath);
  }

  getSessionPath() {
    return this.sessionPath;
  }

  async load() {
    if (!(await pathExists(this.sessionPath))) {
      return defaultSessionState();
    }
    try {
      return normalizeSessionState(JSON.parse(await fs.readFile(this.sessionPath, 'utf8')));
    } catch {
      return defaultSessionState();
    }
  }

  async save(session) {
    const normalized = normalizeSessionState(session);
    await writeJsonFileAtomic(this.sessionPath, normalized, { prefix: 'postmeter-session' });
    return normalized;
  }

  saveSync(session) {
    const normalized = normalizeSessionState(session);
    writeJsonFileAtomicSync(this.sessionPath, normalized, { prefix: 'postmeter-session' });
    return normalized;
  }

  async patch(partial) {
    const current = await this.load();
    return this.save({ ...current, ...partial });
  }
}

function defaultSessionPath(userDataPath) {
  return path.join(postMeterProfileDirectory(userDataPath), 'session.json');
}

module.exports = {
  SessionStore,
  defaultSessionPath
};
