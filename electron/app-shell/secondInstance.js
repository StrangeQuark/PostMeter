function handleSecondInstance(argv, options = {}) {
  const { mainWindow, oauthFlows } = options;
  const callbackUrl = oauthFlows?.findCallbackArg?.(argv) || '';
  if (callbackUrl) {
    oauthFlows.handleCallbackUrl(callbackUrl);
  }
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized?.()) {
      mainWindow.restore?.();
    }
    mainWindow.focus?.();
  }
  return {
    callbackUrl,
    focused: Boolean(mainWindow && !mainWindow.isDestroyed?.())
  };
}

module.exports = {
  handleSecondInstance
};
