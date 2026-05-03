const { checkForUpdates } = require('../src/core/updateChecker');
const {
  assertExternalUrlPayload,
  assertUpdateCheckOptionsPayload
} = require('../src/core/ipcValidation');

function registerAppIpc(options = {}) {
  const {
    app,
    checkForUpdates: checkForUpdatesImpl = checkForUpdates,
    ipcMain,
    recordDiagnosticEvent = async () => {},
    shell
  } = options;

  ipcMain.handle('app:versions', () => {
    const appVersion = app.getVersion();
    return {
      app: appVersion,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      releaseChannel: releaseChannelForVersion(appVersion)
    };
  });

  ipcMain.handle('app:check-updates', async (_event, updateOptions = {}) => {
    assertUpdateCheckOptionsPayload(updateOptions);
    try {
      const result = await checkForUpdatesImpl({
        currentVersion: app.getVersion(),
        includePrereleases: updateOptions?.includePrereleases === true
      });
      await recordDiagnosticEvent({
        type: 'updates.check.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          includePrereleases: updateOptions?.includePrereleases === true,
          updateAvailable: result.updateAvailable === true,
          releaseChannel: releaseChannelForVersion(app.getVersion())
        }
      });
      return result;
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'updates.check.failed',
        level: 'warn',
        outcome: 'failed',
        failureCode: 'updates_check_failed',
        fields: {
          includePrereleases: updateOptions?.includePrereleases === true,
          error: error?.message || String(error)
        }
      });
      throw error;
    }
  });

  ipcMain.handle('app:open-external', async (_event, url) => {
    assertExternalUrlPayload(url);
    const parsed = safeExternalUrl(url);
    await shell.openExternal(parsed.toString());
    return true;
  });
}

function safeExternalUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error('External URL is invalid.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('External URL must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('External URL must not include credentials.');
  }
  if (!['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('External URL host is not allowed.');
  }
  return parsed;
}

function releaseChannelForVersion(version) {
  const value = String(version || '').toLowerCase();
  if (/(^|[.-])alpha(\.|-|$)/.test(value)) {
    return 'alpha';
  }
  if (/(^|[.-])beta(\.|-|$)/.test(value)) {
    return 'beta';
  }
  if (/(^|[.-])rc(\.|-|$)/.test(value)) {
    return 'rc';
  }
  return 'stable';
}

module.exports = {
  registerAppIpc,
  releaseChannelForVersion,
  safeExternalUrl
};
