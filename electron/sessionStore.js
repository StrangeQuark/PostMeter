const syncFs = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultSessionState, normalizeSessionState } = require('../src/core/sessionState');
const { pathExists, writeJsonFileAtomic } = require('../src/core/workspacePersistence');

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
    await writeJsonFileAtomic(this.sessionPath, normalized);
    return normalized;
  }

  saveSync(session) {
    const normalized = normalizeSessionState(session);
    syncWriteJsonFileAtomic(this.sessionPath, normalized);
    return normalized;
  }

  async patch(partial) {
    const current = await this.load();
    return this.save({ ...current, ...partial });
  }
}

function defaultSessionPath(userDataPath) {
  return path.join(path.resolve(userDataPath), 'session.json');
}

function syncWriteJsonFileAtomic(targetPath, value) {
  syncFs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(path.dirname(targetPath), `postmeter-session-${process.pid}-${Date.now()}.json.tmp`);
  syncFs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  syncFs.renameSync(tempPath, targetPath);
  return targetPath;
}

module.exports = {
  SessionStore,
  defaultSessionPath
};
