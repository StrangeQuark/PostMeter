const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  createAutoUpdateService
} = require('../../electron/services/autoUpdateService');

test('auto update service stays inert when automatic updates are disabled', async () => {
  const updater = new FakeAutoUpdater();
  const timers = [];
  const statuses = [];
  const service = createAutoUpdateService({
    app: { isPackaged: true },
    autoUpdater: updater,
    emitStatus: (status) => statuses.push(status),
    getSettings: () => ({ automaticUpdatesEnabled: false, includePrereleases: true }),
    setTimeoutImpl: (fn, delay) => {
      timers.push({ fn, delay });
      return { unref() {} };
    }
  });

  assert.equal(service.start().status, 'skipped');
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.allowPrerelease, true);
  assert.equal(timers.length, 0);
  assert.equal(await service.checkNow(), statuses.at(-1));
  assert.equal(updater.checkCount, 0);
  assert.equal(statuses.at(-1).status, 'skipped');
});

test('auto update service reports unsupported outside packaged builds', async () => {
  const previousDev = process.env.POSTMETER_AUTO_UPDATE_DEV;
  delete process.env.POSTMETER_AUTO_UPDATE_DEV;
  try {
    const updater = new FakeAutoUpdater();
    const statuses = [];
    const service = createAutoUpdateService({
      app: { isPackaged: false },
      autoUpdater: updater,
      emitStatus: (status) => statuses.push(status),
      getSettings: () => ({ automaticUpdatesEnabled: true }),
      setTimeoutImpl: () => {
        throw new Error('unsupported builds must not schedule update checks');
      }
    });

    const status = service.start();
    assert.equal(status.status, 'unsupported');
    assert.equal(status.reason, 'Automatic updates run only in packaged builds.');
    assert.equal(updater.checkCount, 0);
    assert.deepEqual(statuses.map((item) => item.status), ['idle', 'unsupported']);
  } finally {
    restoreEnv('POSTMETER_AUTO_UPDATE_DEV', previousDev);
  }
});

test('auto update service schedules packaged checks and emits updater lifecycle statuses', async () => {
  const updater = new FakeAutoUpdater();
  const timers = [];
  const cleared = [];
  const diagnostics = [];
  const statuses = [];
  const service = createAutoUpdateService({
    app: { isPackaged: true },
    autoUpdater: updater,
    emitStatus: (status) => statuses.push(status),
    getSettings: () => ({ automaticUpdatesEnabled: true, includePrereleases: true }),
    intervalMillis: 5000,
    recordDiagnosticEvent: async (event) => diagnostics.push(event),
    setTimeoutImpl: (fn, delay) => {
      const timer = { fn, delay, unrefCalled: false, unref() { this.unrefCalled = true; } };
      timers.push(timer);
      return timer;
    },
    clearTimeoutImpl: (timer) => cleared.push(timer)
  });

  service.start();
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.disableWebInstaller, true);
  assert.equal(timers[0].delay, 30000);
  assert.equal(timers[0].unrefCalled, true);

  updater.onCheck = async () => {
    updater.emit('update-available', {
      version: '9.9.9',
      releaseName: 'PostMeter 9.9.9',
      releaseDate: '2026-05-20T00:00:00.000Z'
    });
    updater.emit('download-progress', {
      percent: 52.5,
      transferred: 1024,
      total: 2048,
      bytesPerSecond: 512
    });
    updater.emit('update-downloaded', { version: '9.9.9' });
    return { updateInfo: { version: '9.9.9' } };
  };
  const checkStatus = await service.checkNow({ source: 'manual' });

  assert.equal(updater.checkCount, 1);
  assert.equal(checkStatus.status, 'downloaded');
  assert.deepEqual(statuses.map((status) => status.status), [
    'idle',
    'checking',
    'checking',
    'available',
    'downloading',
    'downloaded'
  ]);
  assert.equal(statuses.find((status) => status.status === 'checking').source, 'manual');
  assert.equal(statuses.find((status) => status.status === 'available').version, '9.9.9');
  assert.equal(statuses.find((status) => status.status === 'downloading').percent, 52.5);
  assert.equal(timers.at(-1).delay, 5000);
  assert.ok(cleared.length >= 1);
  assert.ok(diagnostics.some((event) => event.type === 'updates.auto.downloaded'));

  const installStatus = service.installUpdate();
  assert.equal(installStatus.status, 'installing');
  assert.equal(updater.quitAndInstallCount, 1);
});

test('auto update service surfaces failures and blocks install before a download exists', async () => {
  const updater = new FakeAutoUpdater();
  const diagnostics = [];
  const statuses = [];
  const service = createAutoUpdateService({
    app: { isPackaged: true },
    autoUpdater: updater,
    emitStatus: (status) => statuses.push(status),
    getSettings: () => ({ automaticUpdatesEnabled: true }),
    intervalMillis: 10,
    recordDiagnosticEvent: async (event) => diagnostics.push(event),
    setTimeoutImpl: () => ({ unref() {} })
  });
  updater.onCheck = async () => {
    throw new Error('network down');
  };

  const failedCheck = await service.checkNow();
  assert.equal(failedCheck.status, 'failed');
  assert.match(failedCheck.error, /network down/);

  const failedInstall = service.installUpdate();
  assert.equal(failedInstall.status, 'failed');
  assert.match(failedInstall.error, /No downloaded update/);
  assert.equal(updater.quitAndInstallCount, 0);
  assert.ok(statuses.filter((status) => status.status === 'failed').length >= 2);
  assert.ok(diagnostics.some((event) => event.failureCode === 'updates_auto_failed'));
});

test('auto update service ignores diagnostic logging failures', async () => {
  const updater = new FakeAutoUpdater();
  const statuses = [];
  const service = createAutoUpdateService({
    app: { isPackaged: true },
    autoUpdater: updater,
    emitStatus: (status) => statuses.push(status),
    getSettings: () => ({ automaticUpdatesEnabled: true }),
    recordDiagnosticEvent: async () => {
      throw new Error('diagnostics unavailable');
    },
    setTimeoutImpl: () => ({ unref() {} })
  });
  updater.onCheck = async () => {
    updater.emit('update-downloaded', { version: '9.9.9' });
    return { updateInfo: { version: '9.9.9' } };
  };

  const status = await service.checkNow();

  assert.equal(status.status, 'downloaded');
  assert.equal(status.version, '9.9.9');
  assert.equal(statuses.at(-1).status, 'downloaded');
});

test('auto update service can be enabled in development with an explicit env override', async () => {
  const previousDev = process.env.POSTMETER_AUTO_UPDATE_DEV;
  process.env.POSTMETER_AUTO_UPDATE_DEV = '1';
  try {
    const updater = new FakeAutoUpdater();
    const service = createAutoUpdateService({
      app: { isPackaged: false },
      autoUpdater: updater,
      getSettings: () => ({ automaticUpdatesEnabled: true }),
      setTimeoutImpl: () => ({ unref() {} })
    });
    updater.onCheck = async () => ({ updateInfo: { version: '1.0.0' } });

    const status = await service.checkNow();
    assert.equal(status.status, 'not-available');
    assert.equal(updater.checkCount, 1);
  } finally {
    restoreEnv('POSTMETER_AUTO_UPDATE_DEV', previousDev);
  }
});

class FakeAutoUpdater extends EventEmitter {
  constructor() {
    super();
    this.checkCount = 0;
    this.quitAndInstallCount = 0;
    this.onCheck = async () => ({ updateInfo: {} });
  }

  async checkForUpdates() {
    this.checkCount += 1;
    this.emit('checking-for-update');
    return await this.onCheck();
  }

  quitAndInstall() {
    this.quitAndInstallCount += 1;
  }
}

function restoreEnv(name, value) {
  if (value == null) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
