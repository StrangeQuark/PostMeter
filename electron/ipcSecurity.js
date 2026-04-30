const { isTrustedAppRendererUrl } = require('./appProtocol');

function createTrustedIpcMain(ipcMain, options = {}) {
  return {
    handle(channel, listener) {
      ipcMain.handle(channel, (event, ...args) => {
        assertTrustedIpcSender(event, rendererPathForOptions(options));
        return listener(event, ...args);
      });
    },
    on(channel, listener) {
      ipcMain.on(channel, (event, ...args) => {
        assertTrustedIpcSender(event, rendererPathForOptions(options));
        return listener(event, ...args);
      });
    }
  };
}

function assertTrustedIpcSender(event, rendererPath) {
  if (!isTrustedIpcSender(event, rendererPath)) {
    throw new Error('IPC sender is not the trusted PostMeter renderer.');
  }
}

function isTrustedIpcSender(event, rendererPath) {
  if (!isMainFrameSender(event)) {
    return false;
  }
  const senderUrl = event.senderFrame.url;
  return isTrustedRendererUrl(senderUrl, rendererPath);
}

function isMainFrameSender(event) {
  const senderFrame = event?.senderFrame;
  if (!senderFrame) {
    return false;
  }
  if (senderFrame.parent) {
    return false;
  }
  if (senderFrame.top && senderFrame.top !== senderFrame) {
    return false;
  }
  if (event?.sender?.mainFrame && event.sender.mainFrame !== senderFrame) {
    return false;
  }
  return true;
}

function isTrustedRendererUrl(senderUrl, rendererPath) {
  return isTrustedAppRendererUrl(senderUrl, rendererPath);
}

function rendererPathForOptions(options = {}) {
  if (typeof options.getRendererPath === 'function') {
    return options.getRendererPath();
  }
  return options.rendererPath;
}

module.exports = {
  assertTrustedIpcSender,
  createTrustedIpcMain,
  isMainFrameSender,
  isTrustedIpcSender,
  isTrustedRendererUrl
};
