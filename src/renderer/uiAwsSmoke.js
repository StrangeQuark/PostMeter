(function attachUiAwsSmoke(global) {
  const {
    assertUiSmoke,
    dispatchChange,
    dispatchInput
  } = resolveUiSmokeCommon(global);

  async function runUiAwsSmoke(params) {
    const baseUrl = params.get('uiAwsBaseUrl');
    assertUiSmoke(baseUrl, 'UI AWS smoke requires a mock auth server base URL.');
    workspace.collections = [];
    workspace.environments = [];
    workspace.history = [];
    workspace.cookies = [];
    clearActiveWorkspaceItem();
    renderAll();
    newCollection();
    newRequest();
    assertUiSmoke(activeRequest(), 'AWS smoke request was not created.');
    activeRequest().name = 'AWS Smoke Request';
    activeRequest().url = `${baseUrl}/aws-header?mode=ui`;
    renderAll();

    activateTab('request', 'auth');
    setSelect('authTypeSelect', 'aws');
    assertPostmanAwsControls();
    setField('authAwsAccessKeyInput', 'UIAKIDEXAMPLE');
    setField('authAwsSecretKeyInput', 'ui-aws-secret');
    setSelect('authAwsAddAuthDataToSelect', 'header');
    openAdvanced();
    setField('authAwsRegionInput', 'us-east-1');
    setField('authAwsServiceInput', 'execute-api');
    setField('authAwsSessionTokenInput', 'ui-session-token');
    assertUiSmoke(activeRequest().auth.region === 'us-east-1', 'AWS UI did not collect the advanced Region field.');
    assertUiSmoke(activeRequest().auth.sessionToken === 'ui-session-token', 'AWS UI did not collect the advanced Session Token field.');

    activateTab('request', 'body');
    setSelect('methodSelect', 'POST');
    setField('urlInput', `${baseUrl}/aws-header?mode=ui`);
    setSelect('bodyTypeSelect', 'RAW');
    setSelect('bodyRawFormatSelect', 'json');
    setField('bodyInput', '{"ui":"aws"}');
    await sendActiveRequest();
    let response = responseJson();
    assertUiSmoke(response.verified === true, 'AWS header request did not verify against the mock server.');
    assertUiSmoke(response.fields.authorization.startsWith('AWS4-HMAC-SHA256 '), 'AWS header request did not send the Authorization header.');
    assertUiSmoke(response.fields.credentialScope.endsWith('/us-east-1/execute-api/aws4_request'), 'AWS header request sent the wrong credential scope.');
    assertUiSmoke(response.fields.sessionToken === 'ui-session-token', 'AWS header request did not send the session token header.');

    activateTab('request', 'auth');
    setSelect('authAwsAddAuthDataToSelect', 'query');
    activateTab('request', 'body');
    setSelect('methodSelect', 'GET');
    setField('urlInput', `${baseUrl}/aws-query?mode=ui`);
    setSelect('bodyTypeSelect', 'NONE');
    await sendActiveRequest();
    response = responseJson();
    assertUiSmoke(response.verified === true, 'AWS query request did not verify against the mock server.');
    assertUiSmoke(response.fields.authorization === '', 'AWS query request should not send the Authorization header.');
    assertUiSmoke(response.fields.sessionToken === 'ui-session-token', 'AWS query request did not send the session token query parameter.');
    assertUiSmoke(response.fields.signature.length === 64, 'AWS query request did not include a SigV4 query signature.');
  }

  function assertPostmanAwsControls() {
    assertOptions('authAwsAddAuthDataToSelect', ['header', 'query']);
    const section = $('authAwsAccessKeyInput')?.closest?.('[data-auth-section="aws"]');
    const advanced = section?.querySelector('details.auth-advanced');
    assertUiSmoke(Boolean(section), 'AWS auth section was not rendered.');
    assertUiSmoke(Boolean(advanced), 'AWS Advanced disclosure was not rendered.');
    assertUiSmoke(advanced.open === false, 'AWS Advanced disclosure should start closed.');
    for (const id of ['authAwsRegionInput', 'authAwsServiceInput', 'authAwsSessionTokenInput']) {
      assertUiSmoke(advanced.contains($(id)), `${id} should be inside the AWS Advanced disclosure.`);
    }
    for (const id of ['authAwsAccessKeyInput', 'authAwsSecretKeyInput', 'authAwsAddAuthDataToSelect']) {
      assertUiSmoke(!advanced.contains($(id)), `${id} should remain outside the AWS Advanced disclosure.`);
    }
    for (const id of ['authAwsAccessKeyInput', 'authAwsSecretKeyInput', 'authAwsRegionInput', 'authAwsServiceInput', 'authAwsSessionTokenInput']) {
      assertUiSmoke(!$(id).hasAttribute('placeholder'), `${id} should not render placeholder text.`);
    }
  }

  function openAdvanced() {
    const advanced = $('authAwsAccessKeyInput')?.closest?.('[data-auth-section="aws"]')?.querySelector?.('details.auth-advanced');
    assertUiSmoke(Boolean(advanced), 'AWS Advanced disclosure was not rendered.');
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

  function responseJson() {
    assertUiSmoke($('responseStatus').textContent === '200', `Expected AWS request status 200, saw ${$('responseStatus').textContent}.`);
    try {
      return JSON.parse($('responseBody').value);
    } catch {
      throw new Error(`AWS smoke response was not JSON: ${$('responseBody').value}`);
    }
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiAwsSmoke.js.');
  }

  const exported = {
    runUiAwsSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiAwsSmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
