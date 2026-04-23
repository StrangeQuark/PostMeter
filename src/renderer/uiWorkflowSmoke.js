(function attachUiWorkflowSmoke(global) {
  const {
    assertContextMenuSmoke,
    assertUiSmoke,
    dispatchChange,
    dispatchInput,
    setAssertionRow,
    setPairRow
  } = resolveUiSmokeCommon(global);

  async function runUiWorkflowSmoke(params) {
    const baseUrl = params.get('uiWorkflowBaseUrl');
    assertUiSmoke(baseUrl, 'UI workflow smoke requires a fixture base URL.');
    assertUiSmoke(workspace.collections.length === 0, 'New workspace should start without default collections.');

    newCollection();
    const collection = activeCollection();
    assertUiSmoke(collection, 'New collection was not created.');
    assertUiSmoke(collection.requests.length === 0, 'New collection should start without requests.');
    assertUiSmoke(!activeRequest(), 'New collection should not auto-select or create a request.');
    assertUiSmoke(!$('requestEmptyPanel').hidden, 'No-request state should show the create request screen.');
    assertUiSmoke($('requestEditorPanel').hidden, 'Request editor should be hidden when no request is selected.');
    assertUiSmoke(document.querySelector('.results').hidden, 'Response panel should be hidden when no request is selected.');
    collection.name = 'Smoke Collection';
    newRequest();
    const request = activeRequest();
    assertUiSmoke(request, 'New request was not selected.');
    assertUiSmoke($('requestEmptyPanel').hidden, 'Create request screen should hide once a request is selected.');
    assertUiSmoke($('requestTabBar').textContent.includes('New Request'), 'New request tab did not render.');
    assertUiSmoke(!$('requestTabBar').querySelector('.request-tab-dirty').hidden, 'New request tab should show unsaved changes.');
    request.name = 'Smoke Request';
    renderAll();

    activateTab('request', 'collectionVariables');
    $('addRequestVariableButton').click();
    setPairRow('requestVariablesTable', 'requestToken', 'from-request', global);
    $('addCollectionVariableButton').click();
    setPairRow('collectionVariablesTable', 'collectionToken', 'from-collection', global);
    assertUiSmoke($('variablePreview').textContent.includes('requestToken = from-request'), 'Request variable preview did not render.');
    assertUiSmoke($('variablePreview').textContent.includes('collectionToken = from-collection'), 'Collection variable preview did not render.');
    await setIncludePrereleases(true, { showStatus: false });

    $('requestNameInput').value = 'Smoke Request';
    dispatchInput($('requestNameInput'));
    $('methodSelect').value = 'POST';
    dispatchChange($('methodSelect'));
    $('urlInput').value = `${baseUrl}/echo`;
    dispatchInput($('urlInput'));
    activateTab('request', 'cookies');
    $('requestCookieJarEnabledInput').checked = true;
    dispatchChange($('requestCookieJarEnabledInput'));

    $('addParamButton').click();
    setPairRow('paramsTable', 'trace', 'ui', global);
    $('addHeaderButton').click();
    setPairRow('headersTable', 'X-PostMeter-UI', 'smoke', global);
    $('bodyTypeSelect').value = 'RAW_JSON';
    dispatchChange($('bodyTypeSelect'));
    $('bodyInput').value = '{"workflow":"smoke"}';
    dispatchInput($('bodyInput'));
    activateTab('request', 'examples');
    $('addExampleButton').click();
    const exampleItem = $('examplesList').querySelector('.example-item');
    assertUiSmoke(exampleItem, 'Example editor did not render.');
    const exampleInputs = exampleItem.querySelectorAll('input');
    exampleInputs[0].value = 'Manual Example';
    dispatchInput(exampleInputs[0]);
    exampleInputs[1].value = '202';
    dispatchInput(exampleInputs[1]);
    activateTab('request', 'tests');
    $('addAssertionButton').click();
    setAssertionRow('statusCode', '', '', 'equals', '200', global);
    $('assertionTemplateSelect').value = 'jsonPathExists';
    dispatchChange($('assertionTemplateSelect'));
    $('addAssertionTemplateButton').click();
    activateTab('request', 'scripts');
    $('preRequestScriptInput').value = "pm.environment.set('scriptToken', 'ui-script');";
    dispatchInput($('preRequestScriptInput'));
    $('testScriptInput').value = "pm.environment.set('responseMethod', pm.response.json().method); pm.test('script token exists', function () { pm.expect(pm.environment.get('scriptToken')).to.equal('ui-script'); pm.expect(pm.collectionVariables.get('collectionToken')).to.equal('from-collection'); pm.response.to.have.status(200); });";
    dispatchInput($('testScriptInput'));

    newEnvironment();
    const environment = activeEnvironment();
    assertUiSmoke(environment, 'New environment was not created.');
    environment.name = 'Smoke Environment';
    environment.variables = [{ enabled: true, key: 'localToken', value: 'local-value' }];
    renderAll();
    selectRequestTab(openRequestTabs.find((tab) => tab.requestId === request.id));
    activateTab('request', 'body');
    const variableAutocomplete = document.getElementById('variableAutocompleteMenu');
    const bodyInput = $('bodyInput');
    const originalBody = bodyInput.value;
    bodyInput.focus();
    bodyInput.value = 'prefix {{';
    bodyInput.setSelectionRange(bodyInput.value.length, bodyInput.value.length);
    dispatchInput(bodyInput);
    assertUiSmoke(variableAutocomplete && !variableAutocomplete.hidden, 'Environment variable autocomplete did not open for a request field.');
    assertUiSmoke(variableAutocomplete.textContent.includes('localToken'), 'Environment variable autocomplete did not list the active environment variable.');
    const bodyRect = bodyInput.getBoundingClientRect();
    const autocompleteRect = variableAutocomplete.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(bodyInput).lineHeight) || 20;
    assertUiSmoke(autocompleteRect.left > bodyRect.left + 24, 'Environment variable autocomplete should align under the token instead of the field edge.');
    assertUiSmoke(autocompleteRect.top < bodyRect.top + Math.max(64, lineHeight * 4), 'Environment variable autocomplete should align under the active text line instead of the bottom of the textarea.');
    bodyInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    assertUiSmoke(bodyInput.value === 'prefix {{localToken}}', 'Environment variable autocomplete did not insert the selected variable token.');
    assertUiSmoke(activeRequest().body === 'prefix {{localToken}}', 'Environment variable autocomplete did not update the request editor state.');
    bodyInput.value = originalBody;
    bodyInput.setSelectionRange(originalBody.length, originalBody.length);
    dispatchInput(bodyInput);
    activateTab('request', 'scripts');
    const preRequestScriptInput = $('preRequestScriptInput');
    const originalPreRequestScript = preRequestScriptInput.value;
    preRequestScriptInput.focus();
    preRequestScriptInput.value = `${originalPreRequestScript}\n{{`;
    preRequestScriptInput.setSelectionRange(preRequestScriptInput.value.length, preRequestScriptInput.value.length);
    dispatchInput(preRequestScriptInput);
    assertUiSmoke(document.getElementById('variableAutocompleteMenu').hidden, 'Environment variable autocomplete should stay disabled in script editors.');
    preRequestScriptInput.value = originalPreRequestScript;
    dispatchInput(preRequestScriptInput);

    assertContextMenuSmoke({}, global);
    assertResizeSmoke();

    await saveWorkspace(false);
    const loaded = await window.postmeter.workspace.load();
    assertUiSmoke(
      loaded.workspace.collections.some((item) => item.name === 'Smoke Collection'),
      'Saved workspace did not contain the smoke collection.'
    );
    assertUiSmoke(loaded.workspace.settings?.updates?.includePrereleases === true, 'Update prerelease setting was not saved.');

    await sendActiveRequest();
    assertUiSmoke($('responseStatus').textContent === '200', 'Smoke request did not receive HTTP 200.');
    assertUiSmoke($('responseBody').value.includes('"method": "POST"'), 'Smoke response body was not rendered.');
    assertUiSmoke(activeEnvironment().variables.some((variable) => variable.key === 'responseMethod' && variable.value === 'POST'), 'Single request test script did not update the active environment.');
    assertUiSmoke(workspace.history.length > 0, 'Smoke request did not add history.');
    assertUiSmoke(workspace.cookies.some((cookie) => cookie.name === 'uiSession'), 'Smoke response cookie was not stored.');
    captureResponseExample();
    assertUiSmoke(activeRequest().examples.length >= 2, 'Captured response example was not stored.');

    activateTab('results', 'load');
    $('loadConcurrency').value = '1';
    $('loadRequests').value = '2';
    $('loadDurationSeconds').value = '0';
    $('loadRampUpSeconds').value = '0';
    $('loadTargetRate').value = '0';
    $('loadMaxRate').value = '0';
    $('loadExecutionMode').value = 'singleProcess';
    $('loadWorkerProcesses').value = '1';
    $('loadRecordSamples').checked = true;
    await runLoadTest();
    assertUiSmoke($('loadResults').textContent.includes('Completed requests: 2'), 'Load test did not complete two requests.');
    assertUiSmoke($('loadResults').textContent.includes('Samples recorded: 2'), 'Load test samples were not recorded.');
    const policyLoaded = await window.postmeter.workspace.load();
    assertUiSmoke(policyLoaded.workspace.settings?.loadTestPolicy == null, 'Load-test policy should not be stored on the workspace.');

    activateTab('results', 'runner');
    await runActiveCollection();
    assertUiSmoke($('runnerResults').textContent.includes('Passed: true'), 'Collection runner did not pass.');
    assertUiSmoke($('runnerResults').textContent.includes('script token exists'), 'Collection runner did not render script test results.');
    assertUiSmoke($('runnerResults').textContent.includes('Runtime Variables'), 'Collection runner did not render runtime variables.');
    assertUiSmoke($('runnerResults').textContent.includes('Collection collectionToken = from-collection'), 'Collection runner did not render collection variables.');
    assertUiSmoke($('runnerResults').textContent.includes('Request variable requestToken = from-request'), 'Collection runner did not render request variables.');
    assertUiSmoke(!$('exportRunnerJsonButton').disabled, 'Runner JSON export button was not enabled after a run.');
    assertUiSmoke(!$('exportRunnerCsvButton').disabled, 'Runner CSV export button was not enabled after a run.');
  }

  function assertResizeSmoke() {
    const handle = $('mainPaneResize');
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 300 }));
    assertUiSmoke(document.body.classList.contains('is-resizing'), 'Main pane resize did not enter resizing state.');
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 360 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    assertUiSmoke(!document.body.classList.contains('is-resizing'), 'Main pane resize did not exit resizing state.');
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiWorkflowSmoke.js.');
  }

  const exported = {
    runUiWorkflowSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiWorkflowSmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
