const { isTrustedAppRendererUrl } = require('../app-shell/appProtocol');
const { redactText, sanitizeDiagnosticErrorCode } = require('../../src/core/diagnostics-release/diagnostics');

function createTrustedIpcMain(ipcMain, options = {}) {
  return {
    handle(channel, listener) {
      ipcMain.handle(channel, async (event, ...args) => {
        assertTrustedIpcSender(event, rendererPathForOptions(options));
        try {
          return await listener(event, ...args);
        } catch (error) {
          throw sanitizeIpcError(error);
        }
      });
    },
    on(channel, listener) {
      ipcMain.on(channel, (event, ...args) => {
        assertTrustedIpcSender(event, rendererPathForOptions(options));
        try {
          return listener(event, ...args);
        } catch (error) {
          throw sanitizeIpcError(error);
        }
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

function sanitizeIpcError(error) {
  const rawMessage = error?.message || String(error || 'IPC handler failed.');
  const message = redactText(rawMessage) || 'IPC handler failed.';
  const sanitized = new Error(message);
  const name = sanitizeIpcErrorName(error?.name);
  if (name && name !== 'Error') {
    sanitized.name = name;
  }
  const code = sanitizeDiagnosticErrorCode(error?.code);
  if (code) {
    sanitized.code = code;
  }
  return sanitized;
}

function sanitizeIpcErrorName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  const cleaned = name.replace(/[^\w:.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128);
  if (!cleaned || cleaned === 'Error') {
    return '';
  }
  if (sanitizeDiagnosticErrorCode(cleaned) === '[redacted]' || redactText(cleaned) !== cleaned) {
    return '';
  }
  return cleaned;
}

module.exports = {
  assertTrustedIpcSender,
  createTrustedIpcMain,
  isMainFrameSender,
  isTrustedIpcSender,
  isTrustedRendererUrl,
  sanitizeIpcError,
  sanitizeIpcErrorName
};
