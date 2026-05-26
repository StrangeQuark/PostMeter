const { checkForUpdates } = require('../../src/core/diagnostics-release/updateChecker');
const {
  assertAutoUpdateStatusPayload,
  assertExternalUrlPayload,
  assertUpdateCheckOptionsPayload
} = require('../../src/core/contracts/ipcValidation');

function registerAppIpc(options = {}) {
  const {
    app,
    checkForUpdates: checkForUpdatesImpl = checkForUpdates,
    clipboard,
    dialog = null,
    getAutoUpdateService = () => null,
    getMainWindow = () => undefined,
    ipcMain,
    now = () => Date.now(),
    recordDiagnosticEvent = async () => {},
    shell
  } = options;
  const clipboardGuard = createClipboardGuard({ dialog, getMainWindow, now, recordDiagnosticEvent });

  ipcMain.handle('app:versions', () => {
    const appVersion = app.getVersion();
    return {
      app: appVersion,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      packaged: app.isPackaged === true,
      releaseChannel: releaseChannelForVersion(appVersion)
    };
  });

  ipcMain.handle('app:check-updates', async (_event, updateOptions = {}) => {
    assertUpdateCheckOptionsPayload(updateOptions);
    try {
      const result = await checkForUpdatesImpl({
        currentVersion: app.getVersion(),
        includePrereleases: updateOptions?.includePrereleases === true,
        isPackaged: app.isPackaged === true
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

  ipcMain.handle('app:auto-update-status', () => {
    const status = getAutoUpdateService()?.status?.() || {
      status: 'unsupported',
      automaticUpdatesEnabled: false,
      includePrereleases: false,
      reason: 'Automatic update service is unavailable.'
    };
    assertAutoUpdateStatusPayload(status);
    return status;
  });

  ipcMain.handle('app:install-update', async () => {
    const service = getAutoUpdateService();
    if (!service || typeof service.installUpdate !== 'function') {
      throw new Error('Automatic update installation is unavailable.');
    }
    const status = await service.installUpdate();
    assertAutoUpdateStatusPayload(status);
    return status;
  });

  ipcMain.handle('app:open-external', async (_event, url) => {
    assertExternalUrlPayload(url);
    const parsed = safeExternalUrl(url);
    await shell.openExternal(parsed.toString());
    return true;
  });

  ipcMain.handle('app:set-menu-shortcuts-ignored', async (event, ignored) => {
    assertMenuShortcutsIgnoredPayload(ignored);
    const webContents = event?.sender;
    if (!webContents) {
      return false;
    }
    webContents.__postmeterMenuShortcutsIgnored = ignored;
    if (typeof webContents.setIgnoreMenuShortcuts === 'function') {
      webContents.setIgnoreMenuShortcuts(ignored);
    }
    return true;
  });

  ipcMain.handle('clipboard:writeText', async (_event, payload) => {
    const { text, reason, contentKind } = assertClipboardTextPayload(payload);
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      throw new Error('Clipboard API is unavailable.');
    }
    await clipboardGuard.confirmIfNeeded({ contentKind, reason, text });
    clipboard.writeText(text);
    clipboardGuard.recordWrite();
    return true;
  });
}

function assertClipboardTextPayload(value) {
  const payload = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { text: value };
  if (typeof payload.text !== 'string') {
    throw new Error('Invalid IPC payload: clipboard text must be a string.');
  }
  if (payload.text.length > 64 * 1024) {
    throw new Error('Invalid IPC payload: clipboard text cannot exceed 64 KB.');
  }
  return {
    text: payload.text,
    reason: typeof payload.reason === 'string' ? payload.reason.slice(0, 128) : '',
    contentKind: typeof payload.contentKind === 'string' ? payload.contentKind.slice(0, 64) : ''
  };
}

function createClipboardGuard(options = {}) {
  const {
    dialog,
    getMainWindow = () => undefined,
    now = () => Date.now(),
    recordDiagnosticEvent = async () => {}
  } = options;
  let lastWriteAt = 0;
  return {
    async confirmIfNeeded(payload = {}) {
      const reasons = suspiciousClipboardReasons(payload.text, {
        contentKind: payload.contentKind,
        lastWriteAt,
        now: now()
      });
      if (!reasons.length) {
        return;
      }
      await recordDiagnosticEvent({
        type: 'clipboard.write.suspicious',
        level: 'warn',
        outcome: 'prompted',
        fields: {
          contentKind: payload.contentKind || '',
          reason: payload.reason || '',
          reasons
        }
      });
      if (!dialog || typeof dialog.showMessageBox !== 'function') {
        throw new Error('Clipboard write requires confirmation.');
      }
      const result = await dialog.showMessageBox(getMainWindow(), {
        type: 'warning',
        buttons: ['Cancel', 'Copy'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: 'Confirm clipboard write',
        message: 'Copy potentially sensitive or executable content to the clipboard?',
        detail: `Reason: ${payload.reason || payload.contentKind || reasons.join(', ')}`
      });
      if (result.response !== 1) {
        await recordDiagnosticEvent({
          type: 'clipboard.write.denied',
          level: 'warn',
          outcome: 'denied',
          failureCode: 'clipboard_write_denied',
          fields: { reasons }
        });
        throw new Error('Clipboard write was cancelled.');
      }
      await recordDiagnosticEvent({
        type: 'clipboard.write.accepted',
        level: 'info',
        outcome: 'completed',
        fields: { reasons }
      });
    },
    recordWrite() {
      lastWriteAt = now();
    }
  };
}

function suspiciousClipboardReasons(text, options = {}) {
  const value = String(text || '');
  const reasons = [];
  if (value.length > 4096) {
    reasons.push('long-content');
  }
  if (/\r|\n/u.test(value)) {
    reasons.push('multiline');
  }
  if (/(?:^|\n)\s*(?:sudo|rm\s+-rf|curl\s+[^|]+\|\s*(?:sh|bash)|wget\s+[^|]+\|\s*(?:sh|bash)|powershell|Invoke-WebRequest|Set-ExecutionPolicy)\b/iu.test(value)) {
    reasons.push('shell-command');
  }
  if (/\bhttps?:\/\/[^/\s:@]+:[^/\s@]+@/iu.test(value)) {
    reasons.push('url-credentials');
  }
  if (/(?:bearer\s+[a-z0-9._~+/=-]{20,}|(?:api|access|refresh|id|client)[-_ ]?(?:key|token|secret)\s*[:=]\s*\S{12,}|gh[pousr]_[a-z0-9_]{20,}|AKIA[0-9A-Z]{16})/iu.test(value)) {
    reasons.push('secret-looking-content');
  }
  if (String(options.contentKind || '').toLowerCase().match(/token|secret|credential|authorization|cookie/u)) {
    reasons.push('sensitive-content-kind');
  }
  if (options.lastWriteAt && options.now - options.lastWriteAt < 1000) {
    reasons.push('rate-limit');
  }
  return [...new Set(reasons)];
}

function assertMenuShortcutsIgnoredPayload(value) {
  if (typeof value !== 'boolean') {
    throw new Error('Invalid IPC payload: menu shortcut ignored flag must be a boolean.');
  }
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
  assertClipboardTextPayload,
  assertMenuShortcutsIgnoredPayload,
  createClipboardGuard,
  registerAppIpc,
  releaseChannelForVersion,
  safeExternalUrl,
  suspiciousClipboardReasons
};
