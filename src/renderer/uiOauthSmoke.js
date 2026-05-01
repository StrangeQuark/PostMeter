(function attachUiOauthSmoke(global) {
  const {
    assertUiSmoke,
    dispatchChange,
    dispatchInput,
    waitForUiSmoke
  } = resolveUiSmokeCommon(global);

  async function runUiOauthSmoke(params) {
    const baseUrl = params.get('uiOauthBaseUrl');
    assertUiSmoke(baseUrl, 'UI OAuth smoke requires a mock auth server base URL.');
    workspace.collections = [];
    workspace.environments = [];
    workspace.history = [];
    workspace.cookies = [];
    clearActiveWorkspaceItem();
    renderAll();
    newCollection();
    newRequest();
    assertUiSmoke(activeRequest(), 'OAuth smoke request was not created.');
    activeRequest().name = 'OAuth Smoke Request';
    activeRequest().url = 'https://api.oauth-smoke.test/me';
    renderAll();

    activateTab('request', 'auth');
    $('authTypeSelect').value = 'oauth2';
    dispatchChange($('authTypeSelect'));
    $('authOauthGrantTypeSelect').value = 'authorizationCode';
    dispatchChange($('authOauthGrantTypeSelect'));
    $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize`;
    dispatchInput($('authOauthAuthorizationUrlInput'));
    $('authOauthTokenUrlInput').value = `${baseUrl}/token`;
    dispatchInput($('authOauthTokenUrlInput'));
    $('authOauthClientIdInput').value = 'postmeter-client';
    dispatchInput($('authOauthClientIdInput'));
    await startPkceFlow();
    assertUiSmoke($('authOauthAccessTokenInput').value === 'pkce-e2e-token', 'PKCE OAuth smoke did not persist the returned access token.');
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization completed'), 'PKCE OAuth smoke did not complete.');

    $('authOauthAccessTokenInput').value = '';
    dispatchInput($('authOauthAccessTokenInput'));
    $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize?mode=bad-state`;
    dispatchInput($('authOauthAuthorizationUrlInput'));
    const badStateFlow = startPkceFlow();
    await waitForUiSmoke(
      () => $('oauthProgressStatus').textContent.includes('callbackRejected'),
      'PKCE state mismatch did not reject the unexpected callback.',
      3000,
      global
    );
    await cancelOauthFlow();
    await badStateFlow;
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization cancelled'), 'PKCE state mismatch did not remain cancellable.');
    assertUiSmoke($('authOauthAccessTokenInput').value === '', 'PKCE state mismatch unexpectedly persisted a token.');

    $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize?mode=token-error`;
    dispatchInput($('authOauthAuthorizationUrlInput'));
    await startPkceFlow();
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization failed'), 'PKCE token exchange failure did not fail cleanly.');
    assertUiSmoke($('validationLabel').textContent.includes('invalid_grant'), 'PKCE token exchange failure did not render token endpoint details.');

    $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize`;
    dispatchInput($('authOauthAuthorizationUrlInput'));
    $('authOauthRedirectStrategySelect').value = 'customScheme';
    dispatchChange($('authOauthRedirectStrategySelect'));
    await startPkceFlow();
    assertUiSmoke($('authOauthAccessTokenInput').value === 'pkce-e2e-token', 'Custom-scheme PKCE OAuth smoke did not persist the returned access token.');
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization completed'), 'Custom-scheme PKCE smoke did not complete.');

    $('authOauthAccessTokenInput').value = '';
    dispatchInput($('authOauthAccessTokenInput'));
    $('authOauthRedirectStrategySelect').value = 'loopback';
    dispatchChange($('authOauthRedirectStrategySelect'));
    $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize?mode=wait-cancel`;
    dispatchInput($('authOauthAuthorizationUrlInput'));
    const pkceCancel = startPkceFlow();
    await waitForUiSmoke(() => !$('cancelOauthFlowButton').disabled, 'PKCE cancel button did not become available.', 3000, global);
    await cancelOauthFlow();
    await pkceCancel;
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization cancelled'), 'PKCE cancellation did not complete cleanly.');

    $('authOauthGrantTypeSelect').value = 'deviceCode';
    dispatchChange($('authOauthGrantTypeSelect'));
    $('authOauthAccessTokenInput').value = '';
    dispatchInput($('authOauthAccessTokenInput'));
    $('authOauthDeviceAuthorizationUrlInput').value = `${baseUrl}/device`;
    dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
    $('authOauthTokenUrlInput').value = `${baseUrl}/token`;
    dispatchInput($('authOauthTokenUrlInput'));
    $('authOauthClientIdInput').value = 'postmeter-client';
    dispatchInput($('authOauthClientIdInput'));
    await startDeviceFlow();
    assertUiSmoke($('authOauthAccessTokenInput').value === 'device-e2e-token', 'Device OAuth smoke did not persist the returned access token.');
    assertUiSmoke(lastStatusMessage.includes('OAuth device authorization completed'), 'Device OAuth smoke did not complete.');

    $('authOauthAccessTokenInput').value = '';
    dispatchInput($('authOauthAccessTokenInput'));
    $('authOauthDeviceAuthorizationUrlInput').value = `${baseUrl}/device?mode=denied`;
    dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
    await startDeviceFlow();
    assertUiSmoke(lastStatusMessage.includes('OAuth device authorization failed'), 'Device OAuth access-denied state did not fail cleanly.');
    assertUiSmoke($('validationLabel').textContent.includes('denied'), 'Device OAuth access-denied state did not render useful validation details.');

    $('authOauthDeviceAuthorizationUrlInput').value = `${baseUrl}/device?mode=timeout`;
    dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
    await startDeviceFlow();
    assertUiSmoke(lastStatusMessage.includes('OAuth device authorization failed'), 'Device OAuth timeout did not fail cleanly.');
    assertUiSmoke($('validationLabel').textContent.includes('timed out'), 'Device OAuth timeout did not render useful validation details.');

    $('authOauthDeviceAuthorizationUrlInput').value = `${baseUrl}/device?mode=pending`;
    dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
    const deviceCancel = startDeviceFlow();
    await waitForUiSmoke(() => !$('cancelOauthFlowButton').disabled, 'Device cancel button did not become available.', 3000, global);
    await cancelOauthFlow();
    await deviceCancel;
    assertUiSmoke(lastStatusMessage.includes('OAuth device authorization cancelled'), 'Device cancellation did not complete cleanly.');
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiOauthSmoke.js.');
  }

  const exported = {
    runUiOauthSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiOauthSmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
