const { assertSessionPayload } = require('../../src/core/contracts/ipcValidation');

function registerSessionIpc(options = {}) {
  const {
    getSession,
    getSessionStore,
    getWorkspaceEncryptionState = () => false,
    ipcMain,
    setSession
  } = options;

  const storageOptions = () => ({ redactSensitive: getWorkspaceEncryptionState() === true });

  ipcMain.handle('session:load', async () => {
    const session = getSession() || await getSessionStore().load(storageOptions());
    return getWorkspaceEncryptionState() === true
      ? require('../services/sessionStore').redactSensitiveSessionState(session)
      : session;
  });

  ipcMain.handle('session:save', async (_event, nextSession) => {
    assertSessionPayload(nextSession);
    const saved = await getSessionStore().save(nextSession, storageOptions());
    assertSessionPayload(saved);
    setSession(saved);
    return saved;
  });

  ipcMain.on('session:saveSync', (event, nextSession) => {
    assertSessionPayload(nextSession);
    const saved = getSessionStore().saveSync(nextSession, storageOptions());
    assertSessionPayload(saved);
    setSession(saved);
    event.returnValue = saved;
  });
}

module.exports = {
  registerSessionIpc
};
