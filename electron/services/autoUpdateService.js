const DEFAULT_AUTO_UPDATE_INTERVAL_MILLIS = 12 * 60 * 60 * 1000;
const DEFAULT_AUTO_UPDATE_STARTUP_DELAY_MILLIS = 30 * 1000;

function createAutoUpdateService(options = {}) {
  const {
    app,
    autoUpdater,
    clearTimeoutImpl = clearTimeout,
    emitStatus = () => {},
    getSettings = () => ({}),
    intervalMillis = DEFAULT_AUTO_UPDATE_INTERVAL_MILLIS,
    recordDiagnosticEvent = async () => {},
    setTimeoutImpl = setTimeout,
    startupDelayMillis = DEFAULT_AUTO_UPDATE_STARTUP_DELAY_MILLIS
  } = options;
  if (!autoUpdater || typeof autoUpdater.checkForUpdates !== 'function') {
    throw new Error('Automatic updates require an autoUpdater implementation.');
  }

  let configured = false;
  let checkTimer = null;
  let checkInFlight = null;
  let downloaded = false;
  let latestStatus = updateStatus('idle', currentSettings());

  function currentSettings() {
    const updates = getSettings() || {};
    return {
      automaticUpdatesEnabled: updates.automaticUpdatesEnabled === true,
      includePrereleases: updates.includePrereleases === true
    };
  }

  function supported() {
    return app?.isPackaged === true || process.env.POSTMETER_AUTO_UPDATE_DEV === '1';
  }

  function configureUpdater() {
    const settings = currentSettings();
    autoUpdater.autoDownload = settings.automaticUpdatesEnabled;
    autoUpdater.autoInstallOnAppQuit = settings.automaticUpdatesEnabled;
    autoUpdater.allowPrerelease = settings.includePrereleases;
    autoUpdater.disableWebInstaller = true;
    if (!configured) {
      configured = true;
      autoUpdater.on?.('checking-for-update', () => publish('checking'));
      autoUpdater.on?.('update-available', (info = {}) => publish('available', updateInfoFields(info)));
      autoUpdater.on?.('update-not-available', (info = {}) => publish('not-available', updateInfoFields(info)));
      autoUpdater.on?.('download-progress', (progress = {}) => publish('downloading', {
        percent: safeNumber(progress.percent),
        transferred: safeNumber(progress.transferred),
        total: safeNumber(progress.total),
        bytesPerSecond: safeNumber(progress.bytesPerSecond)
      }));
      autoUpdater.on?.('update-downloaded', (info = {}) => {
        downloaded = true;
        publish('downloaded', updateInfoFields(info));
      });
      autoUpdater.on?.('error', (error) => publish('failed', {
        error: error?.message || String(error || 'Automatic update failed.')
      }));
    }
  }

  function publish(status, fields = {}) {
    latestStatus = updateStatus(status, currentSettings(), fields);
    emitStatus(latestStatus);
    try {
      void Promise.resolve(recordDiagnosticEvent(diagnosticEventForStatus(latestStatus))).catch(() => {});
    } catch {
      // Diagnostics must never break update checks or installs.
    }
    return latestStatus;
  }

  function start() {
    applySettings({ startup: true });
    return status();
  }

  function stop() {
    if (checkTimer) {
      clearTimeoutImpl(checkTimer);
      checkTimer = null;
    }
  }

  function applySettings(optionsForApply = {}) {
    const settings = currentSettings();
    configureUpdater();
    publish(settings.automaticUpdatesEnabled ? 'idle' : 'skipped');
    if (!settings.automaticUpdatesEnabled) {
      stop();
      return status();
    }
    if (!supported()) {
      stop();
      return publish('unsupported', {
        reason: 'Automatic updates run only in packaged builds.'
      });
    }
    scheduleCheck(optionsForApply.startup === true ? startupDelayMillis : intervalMillis);
    return status();
  }

  function scheduleCheck(delayMillis) {
    stop();
    checkTimer = setTimeoutImpl(() => {
      checkTimer = null;
      void checkNow({ source: 'scheduled' });
    }, Math.max(0, Number(delayMillis || 0)));
    if (typeof checkTimer?.unref === 'function') {
      checkTimer.unref();
    }
  }

  async function checkNow(optionsForCheck = {}) {
    const settings = currentSettings();
    configureUpdater();
    if (!settings.automaticUpdatesEnabled) {
      return publish('skipped');
    }
    if (!supported()) {
      return publish('unsupported', {
        reason: 'Automatic updates run only in packaged builds.'
      });
    }
    if (checkInFlight) {
      return checkInFlight;
    }
    publish('checking', { source: String(optionsForCheck.source || 'manual') });
    checkInFlight = Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .then((result) => {
        const info = result?.updateInfo || result?.info || result || {};
        if (!info?.version && latestStatus.status === 'checking') {
          return publish('not-available');
        }
        if (latestStatus.status === 'checking') {
          return publish('not-available', updateInfoFields(info));
        }
        return latestStatus;
      })
      .catch((error) => publish('failed', {
        error: error?.message || String(error || 'Automatic update check failed.')
      }))
      .finally(() => {
        checkInFlight = null;
        if (currentSettings().automaticUpdatesEnabled && supported()) {
          scheduleCheck(intervalMillis);
        }
      });
    return checkInFlight;
  }

  function installUpdate() {
    if (!downloaded) {
      return publish('failed', { error: 'No downloaded update is ready to install.' });
    }
    publish('installing');
    autoUpdater.quitAndInstall?.();
    return status();
  }

  function status() {
    return latestStatus;
  }

  return {
    applySettings,
    checkNow,
    installUpdate,
    start,
    status,
    stop
  };
}

function updateStatus(status, settings, fields = {}) {
  return {
    status: String(status || 'idle'),
    automaticUpdatesEnabled: settings.automaticUpdatesEnabled === true,
    includePrereleases: settings.includePrereleases === true,
    ...compactFields(fields)
  };
}

function updateInfoFields(info = {}) {
  return compactFields({
    version: info.version,
    releaseName: info.releaseName,
    releaseDate: info.releaseDate
  });
}

function compactFields(fields = {}) {
  const output = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === '') {
      continue;
    }
    output[key] = value;
  }
  return output;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function diagnosticEventForStatus(status = {}) {
  const failed = status.status === 'failed';
  const event = {
    type: `updates.auto.${status.status || 'status'}`,
    level: failed ? 'warn' : 'info',
    outcome: failed ? 'failed' : 'completed',
    fields: {
      automaticUpdatesEnabled: status.automaticUpdatesEnabled === true,
      includePrereleases: status.includePrereleases === true,
      version: status.version || '',
      error: status.error || ''
    }
  };
  if (failed) {
    event.failureCode = 'updates_auto_failed';
  }
  return event;
}

module.exports = {
  DEFAULT_AUTO_UPDATE_INTERVAL_MILLIS,
  DEFAULT_AUTO_UPDATE_STARTUP_DELAY_MILLIS,
  createAutoUpdateService
};
