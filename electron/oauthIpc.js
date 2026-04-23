const {
  assertAuthPayload,
  assertLoadId,
  assertOptionalEnvironmentPayload
} = require('../src/core/ipcValidation');

function registerOAuthIpc(options = {}) {
  const {
    ipcMain,
    oauthFlows
  } = options;

  ipcMain.handle('oauth:pkce:start', async (_event, id, auth, environment, strategy) => {
    assertLoadId(id, 'id');
    assertAuthPayload(auth);
    assertOptionalEnvironmentPayload(environment);
    return oauthFlows.startPkce(id, auth, environment, strategy);
  });

  ipcMain.handle('oauth:device:start', async (_event, id, auth, environment) => {
    assertLoadId(id, 'id');
    assertAuthPayload(auth);
    assertOptionalEnvironmentPayload(environment);
    return oauthFlows.startDevice(id, auth, environment);
  });

  ipcMain.handle('oauth:device:cancel', (_event, id) => {
    assertLoadId(id, 'id');
    return oauthFlows.cancelFlow(id);
  });

  ipcMain.handle('oauth:cancel', (_event, id) => {
    assertLoadId(id, 'id');
    return oauthFlows.cancelFlow(id);
  });
}

module.exports = {
  registerOAuthIpc
};
