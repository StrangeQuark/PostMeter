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
    assertPostmanOAuth2Controls();
    setCheckbox('authOauthAutoRefreshTokenInput', false);
    assertUiSmoke(activeRequest().auth.autoRefreshToken === false, 'OAuth smoke did not collect disabled auto-refresh token state.');
    setCheckbox('authOauthAutoRefreshTokenInput', true);
    setCheckbox('authOauthShareTokenInput', true);
    assertUiSmoke(activeRequest().auth.autoRefreshToken === true, 'OAuth smoke did not collect enabled auto-refresh token state.');
    assertUiSmoke(activeRequest().auth.shareToken === true, 'OAuth smoke did not collect Share Token state.');

    selectGrant('authorizationCodePkce');
    setSelect('authOauthCodeChallengeMethodSelect', 'plain');
    setField('authOauthCodeVerifierInput', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ');
    setField('authOauthAuthorizationUrlInput', `${baseUrl}/authorize`);
    setField('authOauthTokenUrlInput', `${baseUrl}/token`);
    setField('authOauthClientIdInput', 'postmeter-client');
    await startPkceFlow();
    assertUiSmoke($('authOauthAccessTokenInput').value === 'pkce-e2e-token', 'PKCE OAuth smoke did not persist the returned access token.');
    assertUiSmoke($('authOauthRefreshTokenInput').value === 'pkce-refresh-token', 'PKCE OAuth smoke did not preserve the hidden refresh token.');
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization completed'), 'PKCE OAuth smoke did not complete.');

    setField('authOauthAccessTokenInput', '');
    selectGrant('authorizationCode');
    setField('authOauthAuthorizationUrlInput', `${baseUrl}/authorize?mode=auth-code`);
    await startPkceFlow();
    assertUiSmoke($('authOauthAccessTokenInput').value === 'auth-code-e2e-token', 'Authorization Code OAuth smoke did not persist the returned access token.');
    assertUiSmoke($('authOauthRefreshTokenInput').value === 'auth-code-refresh-token', 'Authorization Code OAuth smoke did not preserve the hidden refresh token.');

    selectGrant('clientCredentials');
    setField('urlInput', `${baseUrl}/resource?case=client-credentials`);
    setField('authOauthAccessTokenInput', '');
    setField('authOauthRefreshTokenInput', '');
    setField('authOauthTokenUrlInput', `${baseUrl}/token`);
    setField('authOauthClientIdInput', 'postmeter-client');
    setField('authOauthClientSecretInput', 'client-secret');
    setField('authOauthScopesInput', 'read write');
    setField('authOauthHeaderPrefixInput', 'Token');
    setSelect('authOauthClientAuthenticationSelect', 'body');
    setSelect('authOauthAddAuthDataToSelect', 'header');
    await sendActiveRequest();
    let response = responseJson();
    assertUiSmoke(response.authorization === 'Token client-credentials-e2e-token', 'Client Credentials OAuth smoke did not apply the fetched token as a header.');
    assertUiSmoke(activeRequest().auth.accessToken === 'client-credentials-e2e-token', 'Client Credentials OAuth smoke did not persist the fetched access token.');

    selectGrant('passwordCredentials');
    setField('urlInput', `${baseUrl}/resource?case=password-credentials`);
    setField('authOauthAccessTokenInput', '');
    setField('authOauthRefreshTokenInput', '');
    setField('authOauthUsernameInput', 'resource-owner');
    setField('authOauthPasswordInput', 'owner-password');
    setField('authOauthHeaderPrefixInput', 'Bearer');
    setSelect('authOauthClientAuthenticationSelect', 'basic');
    setSelect('authOauthAddAuthDataToSelect', 'query');
    await sendActiveRequest();
    response = responseJson();
    assertUiSmoke(response.authorization === '', 'Password Credentials OAuth smoke unexpectedly sent an authorization header when configured for query auth.');
    assertUiSmoke(response.accessToken === 'password-e2e-token', 'Password Credentials OAuth smoke did not apply the fetched token to the request URL.');
    assertUiSmoke(activeRequest().auth.refreshToken === 'password-e2e-refresh-token', 'Password Credentials OAuth smoke did not persist the fetched refresh token.');

    selectGrant('authorizationCodePkce');
    setField('authOauthAccessTokenInput', '');
    setField('authOauthAuthorizationUrlInput', `${baseUrl}/authorize?mode=bad-state`);
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

    setField('authOauthAuthorizationUrlInput', `${baseUrl}/authorize?mode=token-error`);
    await startPkceFlow();
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization failed'), 'PKCE token exchange failure did not fail cleanly.');
    assertUiSmoke($('validationLabel').textContent.includes('invalid_grant'), 'PKCE token exchange failure did not render token endpoint details.');

    setField('authOauthAuthorizationUrlInput', `${baseUrl}/authorize`);
    setField('authOauthCallbackUrlInput', 'postmeter://oauth/callback');
    await startPkceFlow();
    assertUiSmoke($('authOauthAccessTokenInput').value === 'pkce-e2e-token', 'Custom-scheme PKCE OAuth smoke did not persist the returned access token.');
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization completed'), 'Custom-scheme PKCE smoke did not complete.');

    setField('authOauthAccessTokenInput', '');
    setField('authOauthCallbackUrlInput', '');
    setField('authOauthAuthorizationUrlInput', `${baseUrl}/authorize?mode=wait-cancel`);
    const pkceCancel = startPkceFlow();
    await waitForUiSmoke(() => $('oauthProgressStatus').textContent.length > 0, 'PKCE progress did not start.', 3000, global);
    await cancelOauthFlow();
    await pkceCancel;
    assertUiSmoke(lastStatusMessage.includes('OAuth authorization cancelled'), 'PKCE cancellation did not complete cleanly.');
  }

  function assertPostmanOAuth2Controls() {
    assertOptions('authOauthGrantTypeSelect', [
      'authorizationCode',
      'authorizationCodePkce',
      'implicit',
      'passwordCredentials',
      'clientCredentials'
    ]);
    assertOptions('authOauthClientAuthenticationSelect', ['basic', 'body']);
    assertOptions('authOauthAddAuthDataToSelect', ['header', 'query']);
    assertUiSmoke($('authOauthRefreshTokenInput')?.type === 'hidden', 'OAuth 2.0 refresh token input should be internal-only.');
    assertUiSmoke(Boolean($('authOauthAutoRefreshTokenInput')), 'OAuth 2.0 Auto-refresh Token checkbox was not rendered.');
    assertUiSmoke(Boolean($('authOauthShareTokenInput')), 'OAuth 2.0 Share Token checkbox was not rendered.');
    assertUiSmoke($('authOauthAutoRefreshTokenInput').checked === true, 'OAuth 2.0 Auto-refresh Token should default on.');
    assertUiSmoke($('authOauthShareTokenInput').checked === false, 'OAuth 2.0 Share Token should default off.');
    assertUiSmoke(
      !Array.from(document.querySelectorAll('[data-auth-section="oauth2"] label')).some((label) => label.textContent.trim() === 'Refresh Token'),
      'OAuth 2.0 should not render a visible Refresh Token field.'
    );
  }

  function assertOptions(id, expectedValues) {
    const actual = Array.from($(id).querySelectorAll('option')).map((option) => option.value);
    assertUiSmoke(
      JSON.stringify(actual) === JSON.stringify(expectedValues),
      `${id} options differed. Expected ${expectedValues.join(', ')}, saw ${actual.join(', ')}.`
    );
  }

  function selectGrant(value) {
    setSelect('authOauthGrantTypeSelect', value);
  }

  function setField(id, value) {
    const input = $(id);
    input.value = value;
    dispatchInput(input);
  }

  function setSelect(id, value) {
    const input = $(id);
    input.value = value;
    dispatchChange(input);
  }

  function setCheckbox(id, checked) {
    const input = $(id);
    input.checked = checked === true;
    dispatchChange(input);
  }

  function responseJson() {
    assertUiSmoke($('responseStatus').textContent === '200', `Expected OAuth request status 200, saw ${$('responseStatus').textContent}.`);
    try {
      return JSON.parse($('responseBody').value);
    } catch (error) {
      throw new Error(`OAuth smoke response was not JSON: ${$('responseBody').value}`);
    }
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
