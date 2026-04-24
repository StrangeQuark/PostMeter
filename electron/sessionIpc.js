function registerSessionIpc(options = {}) {
  const {
    getSession,
    getSessionStore,
    ipcMain,
    setSession
  } = options;

  ipcMain.handle('session:load', async () => getSession() || getSessionStore().load());

  ipcMain.handle('session:save', async (_event, nextSession) => {
    const saved = await getSessionStore().save(nextSession);
    setSession(saved);
    return saved;
  });

  ipcMain.on('session:saveSync', (event, nextSession) => {
    const saved = getSessionStore().saveSync(nextSession);
    setSession(saved);
    event.returnValue = saved;
  });
}

module.exports = {
  registerSessionIpc
};
