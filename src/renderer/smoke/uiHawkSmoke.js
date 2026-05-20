(function attachUiHawkSmoke(global) {
  const {
    assertUiSmoke,
    dispatchChange,
    dispatchInput
  } = resolveUiSmokeCommon(global);

  async function runUiHawkSmoke(params) {
    const baseUrl = params.get('uiHawkBaseUrl');
    assertUiSmoke(baseUrl, 'UI Hawk smoke requires a mock auth server base URL.');
    workspace.collections = [];
    workspace.environments = [];
    workspace.history = [];
    workspace.cookies = [];
    clearActiveWorkspaceItem();
    renderAll();
    newCollection();
    newRequest();
    assertUiSmoke(activeRequest(), 'Hawk smoke request was not created.');
    activeRequest().name = 'Hawk Smoke Request';
    activeRequest().url = `${baseUrl}/hawk?mode=ui`;
    renderAll();

    activateTab('request', 'auth');
    setSelect('authTypeSelect', 'hawk');
    assertPostmanHawkControls();
    setField('authHawkAuthIdInput', 'ui-hawk-id');
    setField('authHawkAuthKeyInput', 'ui-hawk-secret');
    setSelect('authHawkAlgorithmSelect', 'sha256');
    openAdvanced();
    setField('authHawkUserInput', 'ui-user');
    setField('authHawkNonceInput', 'ui-nonce');
    setField('authHawkExtraDataInput', 'ui-ext');
    setField('authHawkAppInput', 'ui-app');
    setField('authHawkDelegationInput', 'ui-dlg');
    setField('authHawkTimestampInput', '1777291200');
    setCheckbox('authHawkIncludePayloadHashInput', true);
    assertUiSmoke(activeRequest().auth.user === 'ui-user', 'Hawk UI did not collect the advanced User field.');
    assertUiSmoke(activeRequest().auth.includePayloadHash === true, 'Hawk UI did not collect Include payload hash.');

    activateTab('request', 'body');
    setSelect('methodSelect', 'POST');
    setField('urlInput', `${baseUrl}/hawk?mode=ui`);
    setSelect('bodyTypeSelect', 'RAW');
    setSelect('bodyRawFormatSelect', 'json');
    setField('bodyInput', '{"ui":"hawk"}');
    await sendActiveRequest();
    let response = responseJson();
    assertUiSmoke(response.verified === true, 'Hawk SHA-256 request did not verify against the mock server.');
    assertUiSmoke(response.fields.id === 'ui-hawk-id', 'Hawk SHA-256 request sent the wrong ID.');
    assertUiSmoke(response.fields.ts === '1777291200', 'Hawk SHA-256 request sent the wrong timestamp.');
    assertUiSmoke(response.fields.nonce === 'ui-nonce', 'Hawk SHA-256 request sent the wrong nonce.');
    assertUiSmoke(response.fields.ext === 'ui-ext', 'Hawk SHA-256 request sent the wrong ext field.');
    assertUiSmoke(response.fields.app === 'ui-app', 'Hawk SHA-256 request sent the wrong app field.');
    assertUiSmoke(response.fields.dlg === 'ui-dlg', 'Hawk SHA-256 request sent the wrong dlg field.');
    assertUiSmoke(Boolean(response.fields.hash), 'Hawk SHA-256 request did not include a payload hash.');
    assertUiSmoke(!Object.prototype.hasOwnProperty.call(response.fields, 'user'), 'Hawk request should not emit User as a header attribute.');

    activateTab('request', 'auth');
    setField('authHawkAuthIdInput', 'ui-hawk-sha1-id');
    setField('authHawkAuthKeyInput', 'ui-hawk-sha1-secret');
    setSelect('authHawkAlgorithmSelect', 'sha1');
    setField('authHawkNonceInput', 'ui-sha1-nonce');
    setField('authHawkTimestampInput', '1777291300');
    setField('authHawkExtraDataInput', '');
    setField('authHawkAppInput', '');
    setField('authHawkDelegationInput', '');
    setCheckbox('authHawkIncludePayloadHashInput', false);
    setSelect('methodSelect', 'GET');
    setField('urlInput', `${baseUrl}/hawk-sha1`);
    setSelect('bodyTypeSelect', 'NONE');
    await sendActiveRequest();
    response = responseJson();
    assertUiSmoke(response.verified === true, 'Hawk SHA-1 request did not verify against the mock server.');
    assertUiSmoke(response.fields.id === 'ui-hawk-sha1-id', 'Hawk SHA-1 request sent the wrong ID.');
    assertUiSmoke(!Object.prototype.hasOwnProperty.call(response.fields, 'hash'), 'Hawk SHA-1 request unexpectedly included a payload hash.');
  }

  function assertPostmanHawkControls() {
    assertOptions('authHawkAlgorithmSelect', ['sha256', 'sha1']);
    const section = $('authHawkAuthIdInput')?.closest?.('[data-auth-section="hawk"]');
    const advanced = section?.querySelector('details.auth-advanced');
    assertUiSmoke(Boolean(section), 'Hawk auth section was not rendered.');
    assertUiSmoke(Boolean(advanced), 'Hawk Advanced disclosure was not rendered.');
    assertUiSmoke(advanced.open === false, 'Hawk Advanced disclosure should start closed.');
    for (const id of ['authHawkUserInput', 'authHawkNonceInput', 'authHawkExtraDataInput', 'authHawkAppInput', 'authHawkDelegationInput', 'authHawkTimestampInput', 'authHawkIncludePayloadHashInput']) {
      assertUiSmoke(advanced.contains($(id)), `${id} should be inside the Hawk Advanced disclosure.`);
    }
    for (const id of ['authHawkAuthIdInput', 'authHawkAuthKeyInput', 'authHawkAlgorithmSelect']) {
      assertUiSmoke(!advanced.contains($(id)), `${id} should remain outside the Hawk Advanced disclosure.`);
    }
  }

  function openAdvanced() {
    const advanced = $('authHawkAuthIdInput')?.closest?.('[data-auth-section="hawk"]')?.querySelector?.('details.auth-advanced');
    assertUiSmoke(Boolean(advanced), 'Hawk Advanced disclosure was not rendered.');
    advanced.open = true;
  }

  function assertOptions(id, expectedValues) {
    const actual = Array.from($(id).querySelectorAll('option')).map((option) => option.value);
    assertUiSmoke(
      JSON.stringify(actual) === JSON.stringify(expectedValues),
      `${id} options differed. Expected ${expectedValues.join(', ')}, saw ${actual.join(', ')}.`
    );
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
    assertUiSmoke($('responseStatus').textContent === '200', `Expected Hawk request status 200, saw ${$('responseStatus').textContent}.`);
    try {
      return JSON.parse($('responseBody').value);
    } catch {
      throw new Error(`Hawk smoke response was not JSON: ${$('responseBody').value}`);
    }
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiHawkSmoke.js.');
  }

  const exported = {
    runUiHawkSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiHawkSmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
