(function attachUiWorkflowSmoke(global) {
  const {
    assertContextMenuSmoke,
    assertUiSmoke,
    dispatchChange,
    dispatchInput,
    setPairRow
  } = resolveUiSmokeCommon(global);

  async function runUiWorkflowSmoke(params) {
    const baseUrl = params.get('uiWorkflowBaseUrl');
    assertUiSmoke(baseUrl, 'UI workflow smoke requires a fixture base URL.');
    assertUiSmoke(workspace.collections.length === 0, 'New workspace should start without default collections.');

    selectSidebarPanel('workspaces');
    newCollection();
    const collection = activeCollection();
    assertUiSmoke(collection, 'New collection was not created.');
    assertUiSmoke(activeSidebarPanel === 'collections', 'Creating a collection should switch the sidebar to Collections.');
    assertUiSmoke(activeMainPanel === 'request', 'Creating a collection should switch the main pane to request mode.');
    assertUiSmoke(collection.requests.length === 0, 'New collection should start without requests.');
    assertUiSmoke(!activeRequest(), 'New collection should not auto-select or create a request.');
    assertUiSmoke(!$('collectionMainPanel').hidden, 'Selecting a collection should show the collection editor.');
    assertUiSmoke($('requestEmptyPanel').hidden, 'Collection editor should replace the no-request empty state.');
    assertUiSmoke($('requestEditorPanel').hidden, 'Request editor should be hidden when no request is selected.');
    assertUiSmoke(document.querySelector('.results').hidden, 'Response panel should be hidden when no request is selected.');
    assertUiSmoke($('requestTabBar').textContent.includes(collection.name), 'New collection did not open a collection tab.');
    const collectionOpenTab = openCollectionTabs.find((tab) => tab.collectionId === collection.id);
    assertUiSmoke(collectionOpenTab?.dirty === true, 'New collection tab should show unsaved changes.');
    const descriptionEditor = $('collectionDescriptionInput').closest('.code-editor');
    assertUiSmoke(descriptionEditor?.classList.contains('has-line-numbers'), 'Collection overview description should render as a line-numbered editor.');
    assertUiSmoke(descriptionEditor.getBoundingClientRect().height > 220, 'Collection overview description editor should fill the collection pane.');
    assertUiSmoke(!document.querySelector('#collectionOverviewTab .field > span'), 'Collection overview should not reserve space for a description label.');
    assertUiSmoke(descriptionEditor.getBoundingClientRect().top - $('collectionOverviewTab').getBoundingClientRect().top < 4, 'Collection overview editor should start at the top of the overview pane.');
    const descriptionCode = descriptionEditor.querySelector('.code-editor-highlight code');
    assertUiSmoke(
      getComputedStyle(descriptionCode).fontFamily === getComputedStyle($('collectionDescriptionInput')).fontFamily,
      'Collection overview highlighted text should use the same font metrics as the editable textarea.'
    );
    collection.name = 'Smoke Collection';
    renderAll();
    activateTab('collection', 'collectionScripts');
    const scriptFields = Array.from($('collectionScriptsTab').querySelectorAll('.collection-script-field'));
    assertUiSmoke(scriptFields.length === 2, 'Collection scripts tab should render both script editors.');
    const preRequestRect = scriptFields[0].getBoundingClientRect();
    const postRequestRect = scriptFields[1].getBoundingClientRect();
    assertUiSmoke(postRequestRect.left > preRequestRect.left && Math.abs(postRequestRect.top - preRequestRect.top) < 8, 'Collection script editors should sit side by side.');
    activateTab('collection', 'collectionLevelVariables');
    $('addCollectionVariableButton').click();
    setPairRow('collectionVariablesTable', 'collectionToken', 'from-collection', global);
    assertUiSmoke($('collectionVariablePreview').textContent.includes('collectionToken = from-collection'), 'Collection variable preview did not render.');
    newRequest();
    const request = activeRequest();
    assertUiSmoke(request, 'New request was not selected.');
    assertUiSmoke($('requestEmptyPanel').hidden, 'Create request screen should hide once a request is selected.');
    assertUiSmoke($('requestTabBar').textContent.includes('New Request'), 'New request tab did not render.');
    const requestOpenTab = openRequestTabs.find((tab) => tab.requestId === request.id);
    assertUiSmoke(requestOpenTab?.dirty === true, 'New request tab should show unsaved changes.');
    request.name = 'Smoke Request';
    renderAll();

    activateTab('request', 'collectionVariables');
    $('addRequestVariableButton').click();
    setPairRow('requestVariablesTable', 'requestToken', 'from-request', global);
    assertUiSmoke($('variablePreview').textContent.includes('requestToken = from-request'), 'Request variable preview did not render.');
    assertUiSmoke($('variablePreview').textContent.includes('collectionToken = from-collection'), 'Request variable preview did not include collection variables.');
    $('urlInput').value = '{{requestToken}}{{collectionToken}}/tail';
    dispatchInput($('urlInput'));
    assertVariableHighlight($('urlInput'), 'requestToken', 'Request variables should render as request-scope tokens.', 'valid', 'request');
    assertVariableHighlight($('urlInput'), 'collectionToken', 'Collection variables should render as collection-scope tokens.', 'valid', 'collection');
    const requestVariableInputs = $('requestVariablesTable').querySelector('.kv-row').querySelectorAll('input');
    assertHighClickPlacesCaret($('urlInput'), 'URL input');
    assertHighClickPlacesCaret(requestVariableInputs[2], 'Request variable value input');
    requestVariableInputs[0].checked = false;
    dispatchChange(requestVariableInputs[0]);
    assertVariableHighlight($('urlInput'), 'requestToken', 'Disabling a request variable should refresh URL highlighting immediately.', 'invalid');
    requestVariableInputs[0].checked = true;
    dispatchChange(requestVariableInputs[0]);
    assertVariableHighlight($('urlInput'), 'requestToken', 'Re-enabling a request variable should refresh URL highlighting immediately.', 'valid', 'request');
    requestVariableInputs[1].value = 'renamedRequestToken';
    dispatchInput(requestVariableInputs[1]);
    assertVariableHighlight($('urlInput'), 'requestToken', 'Renaming a request variable should refresh URL highlighting immediately.', 'invalid');
    requestVariableInputs[1].value = 'requestToken';
    dispatchInput(requestVariableInputs[1]);
    assertVariableHighlight($('urlInput'), 'requestToken', 'Restoring a request variable key should refresh URL highlighting immediately.', 'valid', 'request');
    await setIncludePrereleases(true, { showStatus: false });

    editRequestTitle('Smoke Request');
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
    $('bodyTypeSelect').value = 'RAW';
    dispatchChange($('bodyTypeSelect'));
    $('bodyRawFormatSelect').value = 'json';
    dispatchChange($('bodyRawFormatSelect'));
    $('bodyInput').value = '{"workflow":"smoke"}';
    dispatchInput($('bodyInput'));
    activateTab('request', 'docs');
    $('docsInput').value = 'Smoke request docs';
    dispatchInput($('docsInput'));
    assertUiSmoke(activeRequest().docs === 'Smoke request docs', 'Docs field did not update the active request.');
    activateTab('request', 'scripts');
    $('preRequestScriptInput').value = "pm.environment.set('scriptToken', 'ui-script');";
    dispatchInput($('preRequestScriptInput'));
    $('testScriptInput').value = "pm.environment.set('responseMethod', pm.response.json().method); pm.test('script token exists', function () { pm.expect(pm.environment.get('scriptToken')).to.equal('ui-script'); pm.expect(pm.variables.get('requestToken')).to.equal('from-request'); pm.expect(pm.variables.get('collectionToken')).to.equal('from-collection'); pm.response.to.have.status(200); });";
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
    bodyInput.value = 'prefix {{loc';
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
    assertUiSmoke($('responseCookies').value.includes('uiSession=smoke'), 'Smoke response cookies were not rendered in the Cookies result tab.');
    assertUiSmoke(activeEnvironment().variables.some((variable) => variable.key === 'responseMethod' && variable.value === 'POST'), 'Single request test script did not update the active environment.');
    assertUiSmoke(workspace.history.length > 0, 'Smoke request did not add history.');
    assertUiSmoke(workspace.cookies.some((cookie) => cookie.name === 'uiSession'), 'Smoke response cookie was not stored.');

    selectSidebarPanel('runners');
    const runner = newRunner();
    runner.environmentId = activeEnvironmentId;
    importCollectionIntoRunner(workspace.collections[0]);
    assertUiSmoke(runner.requests.length > 0, 'Workflow runner did not import collection requests.');
    runner.requests[0].scripts.tests = "pm.environment.set('responseMethod', pm.response.json().method); pm.test('script token exists', function () { pm.expect(pm.environment.get('scriptToken')).to.equal('ui-script'); pm.response.to.have.status(200); });";
    await runActiveCollection();
    const runnerExecutionRows = Array.from($('runnerExecutionList').querySelectorAll('.runner-execution-row'));
    assertUiSmoke(runnerExecutionRows.length > 0, 'Runner execution list did not render completed requests.');
    assertUiSmoke(
      runnerExecutionRows.some((row) => row.querySelector('.runner-status-badge')?.textContent === '200'),
      `Runner execution list did not render response status badges. ${$('runnerResults').textContent.slice(0, 800)}`
    );
    runnerExecutionRows[0].click();
    assertUiSmoke($('runnerExecutionDetails').textContent.includes('script token exists'), 'Runner execution details did not render script test results.');
    assertUiSmoke($('runnerExecutionDetails').textContent.includes('scriptToken'), 'Runner execution details did not render environment variables.');
    assertUiSmoke($('runnerExecutionDetails').textContent.includes('requestToken'), 'Runner execution details did not render request variables.');
    assertUiSmoke(!$('exportRunnerJsonButton').disabled, 'Runner JSON export button was not enabled after a run.');
    assertUiSmoke(!$('exportRunnerCsvButton').disabled, 'Runner CSV export button was not enabled after a run.');
  }

  function assertVariableHighlight(control, variableName, message, expectedStatus = '', expectedSource = '') {
    const wrapper = control.closest?.('.variable-highlight-editor') || control.closest?.('.code-editor');
    const token = wrapper?.querySelector?.(`[data-variable-name="${cssAttributeValue(variableName)}"]`);
    assertUiSmoke(token, message);
    if (expectedStatus) {
      assertUiSmoke(token.getAttribute('data-variable-status') === expectedStatus, `${message} Expected ${expectedStatus} token status.`);
    }
    if (expectedSource) {
      assertUiSmoke(token.getAttribute('data-variable-source') === expectedSource, `${message} Expected ${expectedSource} token source.`);
    }
  }

  function cssAttributeValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function assertHighClickPlacesCaret(control, label) {
    const value = String(control.value || 'https://example.test/widgets');
    control.value = value;
    dispatchInput(control);
    control.setSelectionRange?.(0, 0);
    const rect = control.getBoundingClientRect();
    const style = getComputedStyle(control);
    const paddingRight = Number.parseFloat(style.paddingRight) || 8;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 1;
    control.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: rect.right - paddingRight - 2,
      clientY: rect.top + borderTop + 1,
      detail: 1
    }));
    assertUiSmoke(control.selectionStart > 0, `${label} high click should not move the caret to the beginning.`);
    assertUiSmoke(control.selectionStart === control.selectionEnd, `${label} high click should keep a collapsed selection.`);
  }

  function editRequestTitle(value) {
    const title = $('requestNameTitle');
    title.click();
    title.textContent = value;
    dispatchInput(title);
    title.dispatchEvent(new Event('blur'));
  }

  function assertResizeSmoke() {
    const handle = $('mainPaneResize');
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 300 }));
    assertUiSmoke(document.body.classList.contains('is-resizing'), 'Main pane resize did not enter resizing state.');
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 360 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    assertUiSmoke(!document.body.classList.contains('is-resizing'), 'Main pane resize did not exit resizing state.');

    const workspaceHandle = $('workspacePaneResize');
    const workspaceHandleRect = workspaceHandle.getBoundingClientRect();
    const startY = Math.round(workspaceHandleRect.top + (workspaceHandleRect.height / 2));
    const startValue = Math.round($('requestEditorPanel').getBoundingClientRect().height);
    workspaceHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: startY }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: startY }));
    const samePositionValue = Number(workspaceHandle.getAttribute('aria-valuenow'));
    assertUiSmoke(Math.abs(samePositionValue - startValue) <= 1, `Workspace pane resize should not jump on the first mouse move. start=${startValue} same=${samePositionValue}.`);
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: startY + 24 }));
    const movedValue = Number(workspaceHandle.getAttribute('aria-valuenow'));
    assertUiSmoke(Math.abs(movedValue - (startValue + 24)) <= 2, `Workspace pane resize should track pointer delta. start=${startValue} moved=${movedValue}.`);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    assertUiSmoke(!document.body.classList.contains('is-resizing'), 'Workspace pane resize did not exit resizing state.');
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
