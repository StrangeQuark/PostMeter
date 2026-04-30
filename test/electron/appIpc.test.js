const assert = require('node:assert/strict');
const test = require('node:test');
const { registerAppIpc, releaseChannelForVersion, safeExternalUrl } = require('../../electron/appIpc');

test('app IPC registers stable app channels', () => {
  const handlers = new Map();
  registerAppIpc({
    app: { getVersion: () => '0.0.0-test' },
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    shell: { openExternal: async () => true }
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    'app:check-updates',
    'app:open-external',
    'app:versions'
  ]);
  const versions = handlers.get('app:versions')();
  assert.equal(versions.app, '0.0.0-test');
  assert.equal(versions.releaseChannel, 'stable');
  assert.equal(versions.platform, process.platform);
});

test('app version metadata derives release channels', () => {
  assert.equal(releaseChannelForVersion('1.2.3'), 'stable');
  assert.equal(releaseChannelForVersion('1.2.3-alpha.1'), 'alpha');
  assert.equal(releaseChannelForVersion('1.2.3-beta.1'), 'beta');
  assert.equal(releaseChannelForVersion('1.2.3-rc.1'), 'rc');
});

test('app external URL helper only allows GitHub HTTPS URLs', () => {
  assert.equal(safeExternalUrl('https://github.com/StrangeQuark/PostMeter').hostname, 'github.com');
  assert.throws(() => safeExternalUrl('http://github.com/StrangeQuark/PostMeter'), /must use HTTPS/);
  assert.throws(() => safeExternalUrl('https://example.test/PostMeter'), /host is not allowed/);
});
