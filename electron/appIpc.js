const { checkForUpdates } = require('../src/core/updateChecker');
const {
  assertExternalUrlPayload,
  assertUpdateCheckOptionsPayload
} = require('../src/core/ipcValidation');

function registerAppIpc(options = {}) {
  const {
    app,
    ipcMain,
    shell
  } = options;

  ipcMain.handle('app:versions', () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }));

  ipcMain.handle('app:check-updates', async (_event, updateOptions = {}) => {
    assertUpdateCheckOptionsPayload(updateOptions);
    return checkForUpdates({
      currentVersion: app.getVersion(),
      includePrereleases: updateOptions?.includePrereleases === true
    });
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
  if (!['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('External URL host is not allowed.');
  }
  return parsed;
}

module.exports = {
  registerAppIpc,
  safeExternalUrl
};
