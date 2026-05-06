const {
  assertAuthPayload,
  assertRuntimeId,
  assertOptionalEnvironmentPayload
} = require('../src/core/ipcValidation');

function registerOAuthIpc(options = {}) {
  const {
    ipcMain,
    oauthFlows,
    recordDiagnosticEvent = async () => {}
  } = options;

  ipcMain.handle('oauth:pkce:start', async (_event, id, auth, environment, strategy) => {
    assertRuntimeId(id, 'id');
    assertAuthPayload(auth);
    assertOptionalEnvironmentPayload(environment);
    try {
      const result = await oauthFlows.startPkce(id, auth, environment, strategy);
      await recordDiagnosticEvent({
        type: 'oauth.pkce.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          grantType: auth.grantType || 'authorizationCode',
          redirectStrategy: strategy || auth.redirectStrategy || 'loopback'
        }
      });
      return result;
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'oauth.pkce.failed',
        level: 'warn',
        outcome: 'failed',
        failureCode: 'oauth_pkce_failed',
        fields: {
          grantType: auth.grantType || 'authorizationCode',
          redirectStrategy: strategy || auth.redirectStrategy || 'loopback',
          error: error?.message || String(error)
        }
      });
      throw error;
    }
  });

  ipcMain.handle('oauth:device:start', async (_event, id, auth, environment) => {
    assertRuntimeId(id, 'id');
    assertAuthPayload(auth);
    assertOptionalEnvironmentPayload(environment);
    try {
      const result = await oauthFlows.startDevice(id, auth, environment);
      await recordDiagnosticEvent({
        type: 'oauth.device.completed',
        level: 'info',
        outcome: 'completed',
        fields: { grantType: auth.grantType || 'deviceCode' }
      });
      return result;
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'oauth.device.failed',
        level: 'warn',
        outcome: 'failed',
        failureCode: 'oauth_device_failed',
        fields: {
          grantType: auth.grantType || 'deviceCode',
          error: error?.message || String(error)
        }
      });
      throw error;
    }
  });

  ipcMain.handle('oauth:device:cancel', (_event, id) => {
    assertRuntimeId(id, 'id');
    return oauthFlows.cancelFlow(id);
  });

  ipcMain.handle('oauth:cancel', (_event, id) => {
    assertRuntimeId(id, 'id');
    return oauthFlows.cancelFlow(id);
  });
}

module.exports = {
  registerOAuthIpc
};
