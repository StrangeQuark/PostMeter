const { assertSessionPayload } = require('../src/core/ipcValidation');

function registerSessionIpc(options = {}) {
  const {
    getSession,
    getSessionStore,
    ipcMain,
    setSession
  } = options;

  ipcMain.handle('session:load', async () => getSession() || getSessionStore().load());

  ipcMain.handle('session:save', async (_event, nextSession) => {
    assertSessionPayload(nextSession);
    const saved = await getSessionStore().save(nextSession);
    assertSessionPayload(saved);
    setSession(saved);
    return saved;
  });

  ipcMain.on('session:saveSync', (event, nextSession) => {
    assertSessionPayload(nextSession);
    const saved = getSessionStore().saveSync(nextSession);
    assertSessionPayload(saved);
    setSession(saved);
    event.returnValue = saved;
  });
}

module.exports = {
  registerSessionIpc
};
