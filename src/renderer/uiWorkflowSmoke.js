(function attachUiWorkflowSmoke(global) {
  const {
    assertContextMenuSmoke,
    assertUiSmoke,
    dispatchChange,
    dispatchInput,
    setPairRow,
    waitForUiSmoke
  } = resolveUiSmokeCommon(global);

  async function runUiWorkflowSmoke(params) {
    const baseUrl = params.get('uiWorkflowBaseUrl');
    assertUiSmoke(baseUrl, 'UI workflow smoke requires a fixture base URL.');
    assertUiSmoke(workspace.collections.length === 0, 'New workspace should start without default collections.');

    await assertTutorialsSmoke(global);

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
    assertUiSmoke(!$('collectionDescriptionPreview').hidden, 'Collection overview should render Markdown preview by default.');
    assertUiSmoke($('collectionDescriptionSaveButton').hidden && $('collectionDescriptionCancelButton').hidden, 'Collection overview should hide Save/Cancel before editing.');
    assertUiSmoke($('collectionDescriptionPreview').getBoundingClientRect().height > 220, 'Collection overview Markdown preview should fill the collection pane.');
    assertUiSmoke(!document.querySelector('#collectionOverviewTab .field > span'), 'Collection overview should not reserve space for a description label.');
    editMarkdownPane('collectionDescription', '## Smoke overview\n\n- Fast setup\n- **Markdown** docs\n\n```json\n{"collection": true}\n```');
    assertUiSmoke(collection.description === '', 'Collection overview draft should not save before the pane Save button.');
    $('collectionDescriptionCancelButton').click();
    assertUiSmoke(collection.description === '', 'Collection overview Cancel should discard the Markdown draft.');
    editMarkdownPane('collectionDescription', '## Smoke overview\n\n- Fast setup\n- **Markdown** docs\n\n```json\n{"collection": true}\n```');
    $('collectionDescriptionSaveButton').click();
    assertUiSmoke(collection.description.includes('## Smoke overview'), 'Collection overview Save should store Markdown source.');
    assertMarkdownPreview('collectionDescriptionPreview', {
      heading: 'Smoke overview',
      strong: 'Markdown',
      code: '{"collection": true}'
    });
    assertUiSmoke(!$('collectionDescriptionPreview').hidden && $('collectionDescriptionSaveButton').hidden, 'Collection overview should return to preview controls after Save.');
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
    const folder = newFolder(collection.id, null);
    assertUiSmoke(folder, 'New folder was not created.');
    assertUiSmoke(!$('folderMainPanel').hidden, 'New folder did not show the folder editor.');
    assertUiSmoke(openFolderTabs.some((tab) => tab.folderId === folder.id), 'New folder did not open a folder tab.');
    assertUiSmoke($('requestTabBar').textContent.includes('FOLD'), 'Folder tab should use the FOLD badge.');
    const folderBadge = document.querySelector('.folder-node .tree-badge');
    const folderTabBadge = document.querySelector('.folder-tab-button .request-tab-method');
    assertUiSmoke(folderBadge?.textContent === 'FOLD', 'Folder tree badge should use FOLD.');
    assertUiSmoke(folderBadge?.classList.contains('entity-folder'), 'Folder tree badge should use the folder entity color class.');
    assertUiSmoke(folderTabBadge?.textContent === 'FOLD', 'Folder open tab badge should use FOLD.');
    assertUiSmoke(folderTabBadge?.classList.contains('entity-folder'), 'Folder open tab badge should use the folder entity color class.');
    const folderColorProbe = document.createElement('span');
    folderColorProbe.className = 'variable-highlight-folder variable-highlight-valid';
    document.body.append(folderColorProbe);
    const folderHighlightColor = getComputedStyle(folderColorProbe).color;
    folderColorProbe.remove();
    assertUiSmoke(getComputedStyle(folderBadge).color === folderHighlightColor, 'Folder tree badge color should match folder variable highlighting.');
    assertUiSmoke(getComputedStyle(folderTabBadge).color === folderHighlightColor, 'Folder tab badge color should match folder variable highlighting.');
    editMarkdownPane('folderDescription', '### Folder overview\n\n> Shared auth setup\n\nUse `folderToken`.');
    $('folderDescriptionSaveButton').click();
    assertUiSmoke(folder.description.includes('### Folder overview'), 'Folder overview Save should store Markdown source.');
    assertMarkdownPreview('folderDescriptionPreview', {
      heading: 'Folder overview',
      code: 'folderToken'
    });

    newRequest(collection.id, null);
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
    activateTab('request', 'requestSettings');
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
    assertUiSmoke(!$('docsPreview').hidden && $('docsSaveButton').hidden && $('docsCancelButton').hidden, 'Request docs should render Markdown preview before editing.');
    editMarkdownPane('docs', '## Smoke request docs\n\n1. Send request\n2. Review **Markdown** output\n\n```http\nGET /echo\n```\n\n[Fixture](https://example.test)');
    assertUiSmoke(activeRequest().docs === '', 'Request docs draft should not update the active request before pane Save.');
    $('docsSaveButton').click();
    assertUiSmoke(activeRequest().docs.includes('## Smoke request docs'), 'Docs Save should store Markdown source.');
    assertMarkdownPreview('docsPreview', {
      heading: 'Smoke request docs',
      strong: 'Markdown',
      code: 'GET /echo',
      link: 'Fixture'
    });
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
    $('runnerCaptureSettingsButton').click();
    assertUiSmoke(!$('runnerCaptureSettingsPanel').hidden, 'Runner capture settings dropdown did not open.');
    assertUiSmoke($('runnerCaptureSettingsButton').getAttribute('aria-expanded') === 'true', 'Runner capture settings button did not expose open state.');
    assertUiSmoke($('runnerCaptureSettingsPanel').closest('.capture-settings-menu-group'), 'Runner capture settings should render inside a dropdown group.');
    const runnerIterationsInput = $('runnerRequestList').querySelector('.runner-row-iterations input');
    assertUiSmoke(runnerIterationsInput, 'Runner request iterations input did not render.');
    runnerIterationsInput.value = '1000000';
    dispatchInput(runnerIterationsInput);
    assertUiSmoke($('runnerCapturePreRequestInput').disabled && !$('runnerCapturePreRequestInput').checked, 'Runner very high-volume guardrail should force pre-request output off in the capture panel.');
    assertUiSmoke($('runnerCapturePostRequestInput').disabled && !$('runnerCapturePostRequestInput').checked, 'Runner very high-volume guardrail should force post-request output off in the capture panel.');
    assertUiSmoke($('runnerCaptureScriptLogsInput').disabled && !$('runnerCaptureScriptLogsInput').checked, 'Runner high-volume guardrail should force script logs off in the capture panel.');
    assertUiSmoke($('runnerCaptureLocalVariablesInput').disabled && !$('runnerCaptureLocalVariablesInput').checked, 'Runner high-volume guardrail should force local variables off in the capture panel.');
    assertUiSmoke($('runnerCaptureResponseBodySelect').value === 'failed', 'Runner high-volume guardrail should display failed-only response body capture.');
    assertUiSmoke($('runnerCaptureResponseBodySelect').querySelector('option[value="all"]').disabled, 'Runner high-volume guardrail should disable all-body capture.');
    assertUiSmoke($('runnerCaptureBodyPreviewBytesInput').value === '2048' && $('runnerCaptureBodyPreviewBytesInput').max === '2048', 'Runner high-volume guardrail should display the million-request preview-byte cap.');
    assertUiSmoke($('runnerCaptureScriptLogsInput').closest('label').title.includes('1,000,000 planned requests'), 'Runner forced capture controls should explain why they are disabled.');
    runnerIterationsInput.value = '1';
    dispatchInput(runnerIterationsInput);
    dispatchChange(runnerIterationsInput);
    assertUiSmoke(!$('runnerCapturePreRequestInput').disabled && $('runnerCapturePreRequestInput').checked, 'Runner capture panel should restore pre-request output preference after lowering planned requests.');
    assertUiSmoke(!$('runnerCapturePostRequestInput').disabled && $('runnerCapturePostRequestInput').checked, 'Runner capture panel should restore post-request output preference after lowering planned requests.');
    assertUiSmoke(!$('runnerCaptureScriptLogsInput').disabled && $('runnerCaptureScriptLogsInput').checked, 'Runner capture panel should restore script log preference after lowering planned requests.');
    assertUiSmoke(!$('runnerCaptureLocalVariablesInput').disabled && $('runnerCaptureLocalVariablesInput').checked, 'Runner capture panel should restore local variable preference after lowering planned requests.');
    await runActiveCollection();
    await waitForUiSmoke(
      () => $('runnerExecutionList').querySelectorAll('.runner-execution-row').length > 0,
      'Runner execution list did not render completed requests.',
      3000,
      global
    );
    const runnerExecutionRows = Array.from($('runnerExecutionList').querySelectorAll('.runner-execution-row'));
    assertUiSmoke(runnerExecutionRows.length > 0, 'Runner execution list did not render completed requests.');
    assertUiSmoke(
      runnerExecutionRows.some((row) => row.querySelector('.runner-status-badge')?.textContent === '200'),
      `Runner execution list did not render response status badges. ${$('runnerResults').textContent.slice(0, 800)}`
    );
    runnerExecutionRows[0].click();
    await waitForUiSmoke(
      () => $('runnerExecutionDetails').textContent.includes('script token exists'),
      'Runner execution details did not render script test results.',
      3000,
      global
    );
    assertUiSmoke($('runnerExecutionDetails').textContent.includes('script token exists'), 'Runner execution details did not render script test results.');
    assertUiSmoke($('runnerExecutionDetails').textContent.includes('scriptToken'), 'Runner execution details did not render environment variables.');
    assertUiSmoke($('runnerExecutionDetails').textContent.includes('requestToken'), 'Runner execution details did not render request variables.');
    assertUiSmoke(!$('exportRunnerResultsButton').disabled, 'Runner Export Results button was not enabled after a run.');
    $('exportRunnerResultsButton').click();
    assertUiSmoke(!$('exportRunnerResultsMenu').hidden, 'Runner Export Results button should open the result format menu.');
    assertUiSmoke(
      Array.from($('exportRunnerResultsMenu').querySelectorAll('button')).map((button) => button.textContent.trim()).join('|') === 'HTML Report|JSON|CSV',
      'Runner Export Results menu should offer HTML Report, JSON, and CSV.'
    );
    assertUiSmoke(!$('exportRunnerHtmlButton').disabled, 'Runner HTML report export menu item was not enabled after a run.');
    assertUiSmoke(!$('exportRunnerJsonButton').disabled, 'Runner JSON export menu item was not enabled after a run.');
    assertUiSmoke(!$('exportRunnerCsvButton').disabled, 'Runner CSV export menu item was not enabled after a run.');
    const originalRunnerExport = window.__postmeterExportRunnerResult;
    const runnerExportCalls = [];
    try {
      window.__postmeterExportRunnerResult = async (result, format, htmlReportOptions) => {
        runnerExportCalls.push({ result, format, htmlReportOptions });
        return { cancelled: false, path: `/tmp/postmeter-runner-result.${format}` };
      };
      $('exportRunnerHtmlButton').click();
      assertUiSmoke(!$('htmlReportOptionsModal').hidden, 'Runner HTML report export should open the report options modal.');
      const runnerExpectedTheme = currentResolvedThemeMode();
      assertUiSmoke(
        (runnerExpectedTheme === 'dark' && $('htmlReportThemeDarkInput').checked)
          || (runnerExpectedTheme === 'light' && $('htmlReportThemeLightInput').checked),
        'Runner HTML report theme should default to the current PostMeter theme.'
      );
      $('htmlReportIncludeResultsInput').checked = false;
      dispatchChange($('htmlReportIncludeResultsInput'));
      assertUiSmoke($('htmlReportIncludeDetailsInput').disabled, 'Runner HTML report details should be disabled when results are excluded.');
      assertUiSmoke(!$('htmlReportIncludeDetailsInput').checked, 'Runner HTML report details should be unchecked when results are excluded.');
      $('confirmHtmlReportOptionsButton').click();
      await waitForUiSmoke(
        () => runnerExportCalls.length === 1,
        'Runner HTML report export did not invoke the export boundary with modal options.',
        3000,
        global
      );
      assertUiSmoke(runnerExportCalls[0].format === 'html', 'Runner HTML report export should use the HTML format.');
      assertUiSmoke(
        runnerExportCalls[0].htmlReportOptions?.includeRequestResults === false
          && runnerExportCalls[0].htmlReportOptions?.includeRequestDetails === false
          && runnerExportCalls[0].htmlReportOptions?.theme === runnerExpectedTheme,
        'Runner HTML report export should force Request Details off when Request Results is excluded.'
      );
    } finally {
      window.__postmeterExportRunnerResult = originalRunnerExport;
    }

    selectSidebarPanel('performance');
    const performanceTest = newPerformanceTest();
    assertUiSmoke(performanceTest, 'New performance test was not created.');
    assertUiSmoke(activeMainPanel === 'performance', 'Creating a performance test should switch the main pane to performance mode.');
    $('performanceCaptureSettingsButton').click();
    assertUiSmoke($('runnerCaptureSettingsPanel').hidden, 'Opening performance capture settings should close the runner capture dropdown.');
    assertUiSmoke(!$('performanceCaptureSettingsPanel').hidden, 'Performance capture settings dropdown did not open.');
    assertUiSmoke($('performanceCaptureSettingsButton').getAttribute('aria-expanded') === 'true', 'Performance capture settings button did not expose open state.');
    assertUiSmoke($('performanceCaptureSettingsPanel').closest('.capture-settings-menu-group'), 'Performance capture settings should render inside a dropdown group.');
    assertPerformanceNumericGuards();
    activateTab('performance', 'latency');
    const latencyIterationsInput = $('latencyTab').querySelector('[data-performance-config="iterations"]');
    latencyIterationsInput.value = '1000000';
    dispatchInput(latencyIterationsInput);
    assertUiSmoke($('performanceCapturePreRequestInput').disabled && !$('performanceCapturePreRequestInput').checked, 'Performance very high-volume guardrail should force pre-request output off in the capture panel.');
    assertUiSmoke($('performanceCapturePostRequestInput').disabled && !$('performanceCapturePostRequestInput').checked, 'Performance very high-volume guardrail should force post-request output off in the capture panel.');
    assertUiSmoke($('performanceCaptureScriptLogsInput').disabled && !$('performanceCaptureScriptLogsInput').checked, 'Performance high-volume guardrail should force script logs off in the capture panel.');
    assertUiSmoke($('performanceCaptureLocalVariablesInput').disabled && !$('performanceCaptureLocalVariablesInput').checked, 'Performance high-volume guardrail should force local variables off in the capture panel.');
    assertUiSmoke($('performanceCaptureHeadersInput').disabled && !$('performanceCaptureHeadersInput').checked, 'Performance high-volume guardrail should force response headers off outside diagnosis.');
    assertUiSmoke($('performanceCaptureTimingsInput').checked && !$('performanceCaptureTimingsInput').disabled, 'Performance high-volume guardrail should keep transport timings available.');
    assertUiSmoke($('performanceCaptureBodyPreviewBytesInput').value === '2048' && $('performanceCaptureBodyPreviewBytesInput').max === '2048', 'Performance high-volume guardrail should display the million-request preview-byte cap.');
    assertUiSmoke($('performanceCaptureScriptLogsInput').closest('label').title.includes('1,000,000 planned requests'), 'Performance forced capture controls should explain why they are disabled.');
    activateTab('performance', 'diagnosis');
    assertUiSmoke(!$('performanceCapturePreRequestInput').disabled && $('performanceCapturePreRequestInput').checked, 'Performance capture panel should restore pre-request output preference after switching back to diagnosis.');
    assertUiSmoke(!$('performanceCapturePostRequestInput').disabled && $('performanceCapturePostRequestInput').checked, 'Performance capture panel should restore post-request output preference after switching back to diagnosis.');
    assertUiSmoke(!$('performanceCaptureScriptLogsInput').disabled && $('performanceCaptureScriptLogsInput').checked, 'Performance capture panel should restore script log preference after switching back to diagnosis.');
    assertUiSmoke(!$('performanceCaptureHeadersInput').disabled && $('performanceCaptureHeadersInput').checked, 'Performance diagnosis should keep response header capture available.');
    $('performanceUrlInput').value = `${baseUrl}/diagnostic?api_key=ui-smoke`;
    dispatchInput($('performanceUrlInput'));
    const diagnosisScopeSelect = $('diagnosisTab').querySelector('[data-performance-config="diagnosisScope"]');
    diagnosisScopeSelect.value = 'quick';
    dispatchChange(diagnosisScopeSelect);
    const diagnosisResult = await runActivePerformanceTest();
    assertUiSmoke(diagnosisResult, `Full Endpoint Diagnosis did not return a result. ${$('performanceResults').textContent.slice(0, 800)}`);
    assertUiSmoke(diagnosisResult.storeBacked === true, 'Full Endpoint Diagnosis should use store-backed results.');
    assertUiSmoke(diagnosisResult.completedRequests === 44, `Full Endpoint Diagnosis should complete 44 quick samples, saw ${diagnosisResult.completedRequests}.`);
    assertUiSmoke(diagnosisResult.summary?.diagnosis?.completedChecks === diagnosisResult.summary?.diagnosis?.requestedChecks, 'Full Endpoint Diagnosis did not complete every diagnostic check.');
    await waitForUiSmoke(
      () => $('performanceResultsSummary').textContent.includes('44/44 requests completed'),
      'Full Endpoint Diagnosis summary did not render completed request count.',
      5000,
      global
    );
    assertUiSmoke($('performanceRunDetails').textContent.includes('Endpoint diagnosis'), 'Full Endpoint Diagnosis summary block did not render.');
    assertUiSmoke($('performanceRunDetails').textContent.includes('Diagnostic checks'), 'Full Endpoint Diagnosis checks did not render.');
    assertUiSmoke($('performanceRunDetails').textContent.includes('Time to first byte'), 'Full Endpoint Diagnosis timing checks did not render.');
    activateTab('performanceOutput', 'performanceOutputGraphs');
    await waitForUiSmoke(
      () => $('performanceOutputGraphsTab').textContent.includes('Endpoint Diagnosis'),
      'Full Endpoint Diagnosis graphs did not render the diagnosis section.',
      5000,
      global
    );
    assertUiSmoke($('performanceOutputGraphsTab').textContent.includes('Latency by diagnostic phase'), 'Full Endpoint Diagnosis graphs did not render the diagnostic phase latency graph.');
    assertUiSmoke($('performanceOutputGraphsTab').textContent.includes('Codes over time'), 'Full Endpoint Diagnosis graphs did not render the response-code timeline graph.');
    assertUiSmoke($('performanceOutputGraphsTab').querySelector('[data-performance-chart="saturation-curve"] svg'), 'Full Endpoint Diagnosis graphs did not render the saturation curve.');
    activateTab('performanceOutput', 'performanceOutputRequests');
    await waitForUiSmoke(
      () => $('performanceExecutionList').querySelectorAll('.runner-execution-row').length > 0,
      'Full Endpoint Diagnosis request rows did not render.',
      5000,
      global
    );
    const performanceRows = Array.from($('performanceExecutionList').querySelectorAll('.runner-execution-row'));
    assertUiSmoke(performanceRows.length > 0, 'Full Endpoint Diagnosis request list is empty.');
    assertUiSmoke(
      performanceRows.some((row) => row.querySelector('.runner-status-badge')?.textContent === '200'),
      `Full Endpoint Diagnosis request list did not show HTTP 200 rows. ${$('performanceExecutionList').textContent.slice(0, 800)}`
    );
    performanceRows[0].click();
    await waitForUiSmoke(
      () => $('performanceExecutionDetails').textContent.includes('Status 200'),
      'Full Endpoint Diagnosis request detail did not render selected sample details.',
      5000,
      global
    );
    assertUiSmoke($('performanceExecutionDetails').textContent.includes('/diagnostic?api_key=ui-smoke'), 'Full Endpoint Diagnosis detail did not render the target URL.');
    assertUiSmoke(!$('exportPerformanceResultsButton').disabled, 'Performance Export Results button was not enabled after Full Endpoint Diagnosis.');

    activateTab('performance', 'diagnosis');
    $('exportPerformanceResultsButton').click();
    assertUiSmoke(!$('exportPerformanceResultsMenu').hidden, 'Performance Export Results button should open the result format menu.');
    assertUiSmoke(
      Array.from($('exportPerformanceResultsMenu').querySelectorAll('button')).map((button) => button.textContent.trim()).join('|') === 'HTML Report|JSON|CSV',
      'Performance Export Results menu should offer HTML Report, JSON, and CSV.'
    );
    assertUiSmoke(!$('exportPerformanceResultHtmlButton').disabled, 'Performance HTML report export menu item was not enabled after Full Endpoint Diagnosis.');
    assertUiSmoke(!$('exportPerformanceResultJsonButton').disabled, 'Performance JSON export menu item was not enabled after Full Endpoint Diagnosis.');
    assertUiSmoke(!$('exportPerformanceResultCsvButton').disabled, 'Performance CSV export menu item was not enabled after Full Endpoint Diagnosis.');
    $('exportPerformanceResultsButton').click();
    const originalPerformanceExportResult = window.__postmeterExportPerformanceResult;
    const performanceExportCalls = [];
    try {
      window.__postmeterExportPerformanceResult = async (result, format, htmlReportOptions) => {
        performanceExportCalls.push({ result, format, htmlReportOptions });
        return { cancelled: false, path: `/tmp/postmeter-performance-result.${format}` };
      };
      $('exportPerformanceResultsButton').click();
      $('exportPerformanceResultHtmlButton').click();
      assertUiSmoke(!$('modalBackdrop').hidden, 'HTML report export options should open the modal backdrop.');
      assertUiSmoke(!$('htmlReportOptionsModal').hidden, 'HTML report export options modal should open before exporting.');
      assertUiSmoke($('htmlReportIncludeResultsInput').checked, 'HTML report should include Request Results by default.');
      assertUiSmoke($('htmlReportIncludeDetailsInput').checked, 'HTML report should include Request Details by default.');
      const performanceExpectedTheme = currentResolvedThemeMode();
      assertUiSmoke(
        (performanceExpectedTheme === 'dark' && $('htmlReportThemeDarkInput').checked)
          || (performanceExpectedTheme === 'light' && $('htmlReportThemeLightInput').checked),
        'Performance HTML report theme should default to the current PostMeter theme.'
      );
      const selectedPerformanceExportTheme = performanceExpectedTheme === 'dark' ? 'light' : 'dark';
      $(selectedPerformanceExportTheme === 'dark' ? 'htmlReportThemeDarkInput' : 'htmlReportThemeLightInput').click();
      $('htmlReportIncludeResultsInput').checked = false;
      dispatchChange($('htmlReportIncludeResultsInput'));
      assertUiSmoke($('htmlReportIncludeDetailsInput').disabled, 'Request Details option should be disabled when Request Results is excluded.');
      assertUiSmoke(!$('htmlReportIncludeDetailsInput').checked, 'Request Details option should be forced off when Request Results is excluded.');
      $('htmlReportIncludeResultsInput').checked = true;
      dispatchChange($('htmlReportIncludeResultsInput'));
      assertUiSmoke(!$('htmlReportIncludeDetailsInput').disabled, 'Request Details option should re-enable when Request Results is included.');
      $('htmlReportIncludeDetailsInput').checked = false;
      dispatchChange($('htmlReportIncludeDetailsInput'));
      $('confirmHtmlReportOptionsButton').click();
      await waitForUiSmoke(
        () => performanceExportCalls.length === 1 && performanceExportCalls[0].format === 'html',
        'Performance HTML report export did not invoke the export boundary after confirming modal options.',
        3000,
        global
      );
      $('exportPerformanceResultsButton').click();
      $('exportPerformanceResultJsonButton').click();
      $('exportPerformanceResultsButton').click();
      $('exportPerformanceResultCsvButton').click();
      await waitForUiSmoke(
        () => performanceExportCalls.length === 3,
        'Performance result export buttons did not invoke HTML, JSON, and CSV exports.',
        3000,
        global
      );
      assertUiSmoke(
        performanceExportCalls.map((call) => call.format).join('|') === 'html|json|csv',
        `Performance result exports should run HTML then JSON then CSV. formats=${performanceExportCalls.map((call) => call.format).join('|')}`
      );
      assertUiSmoke(
        performanceExportCalls[0].htmlReportOptions?.includeRequestResults === true
          && performanceExportCalls[0].htmlReportOptions?.includeRequestDetails === false
          && performanceExportCalls[0].htmlReportOptions?.theme === selectedPerformanceExportTheme,
        'HTML report export should pass the selected theme, Request Results, and Request Details options.'
      );
      assertUiSmoke(
        performanceExportCalls.every((call) => call.result?.resultStoreId === diagnosisResult.resultStoreId),
        'Performance result exports should send the last performance result payload.'
      );
    } finally {
      window.__postmeterExportPerformanceResult = originalPerformanceExportResult;
    }

    activateTab('performance', 'latency');
    $('performanceUrlInput').value = `${baseUrl}/latency`;
    dispatchInput($('performanceUrlInput'));
    const latencySamplesInput = $('latencyTab').querySelector('[data-performance-config="iterations"]');
    latencySamplesInput.value = '4';
    dispatchInput(latencySamplesInput);
    const latencyResult = await runActivePerformanceTest();
    assertUiSmoke(latencyResult?.type === 'latency', 'Latency test did not complete with a latency result.');
    assertUiSmoke(latencyResult.completedRequests === 4, `Latency test should complete 4 samples, saw ${latencyResult?.completedRequests}.`);
    assertUiSmoke($('performanceResultsSummary').textContent.includes('4/4 requests completed'), 'Latency result summary did not render completed request count.');
    activateTab('performanceOutput', 'performanceOutputGraphs');
    await waitForUiSmoke(
      () => $('performanceOutputGraphsTab').textContent.includes('Latency Test'),
      'Latency graphs did not render the latency chart section.',
      5000,
      global
    );
    assertUiSmoke($('performanceOutputGraphsTab').textContent.includes('Codes over time'), 'Latency graphs did not render the response-code timeline graph.');

    activateTab('performance', 'throughput');
    $('performanceUrlInput').value = `${baseUrl}/throughput`;
    dispatchInput($('performanceUrlInput'));
    const throughputRequestsInput = $('throughputTab').querySelector('[data-performance-config="iterations"]');
    const throughputConcurrencyInput = $('throughputTab').querySelector('[data-performance-config="concurrency"]');
    throughputRequestsInput.value = '6';
    throughputConcurrencyInput.value = '2';
    dispatchInput(throughputRequestsInput);
    dispatchInput(throughputConcurrencyInput);
    const throughputResult = await runActivePerformanceTest();
    assertUiSmoke(throughputResult?.type === 'throughput', 'RPS / Throughput test did not complete with a throughput result.');
    assertUiSmoke(throughputResult.completedRequests === 6, `RPS / Throughput test should complete 6 requests, saw ${throughputResult?.completedRequests}.`);
    assertUiSmoke($('performanceResultsSummary').textContent.includes('6/6 requests completed'), 'RPS / Throughput result summary did not render completed request count.');
    activateTab('performanceOutput', 'performanceOutputGraphs');
    await waitForUiSmoke(
      () => $('performanceOutputGraphsTab').textContent.includes('Throughput Test'),
      'RPS / Throughput graphs did not render the throughput chart section.',
      5000,
      global
    );
    assertUiSmoke($('performanceOutputGraphsTab').textContent.includes('Codes over time'), 'RPS / Throughput graphs did not render the response-code timeline graph.');
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

  function assertPerformanceNumericGuards() {
    activateTab('performance', 'diagnosis');
    assertPerformanceClamp('diagnosis', 'safety', 'maxConcurrency', '999', '25', 'Diagnosis max concurrency should clamp to the global cap.');
    assertPerformanceClamp('diagnosis', 'safety', 'maxDurationSeconds', '9999', '3600', 'Diagnosis max duration should clamp to the global cap.');

    activateTab('performance', 'latency');
    assertPerformanceClamp('latency', 'config', 'iterations', '1000001', '1000000', 'Latency samples should clamp to one million.');

    activateTab('performance', 'throughput');
    assertPerformanceClamp('throughput', 'safety', 'maxTotalRequests', '1000001', '1000000', 'Throughput max requests should clamp to one million.');
    setPerformanceNumber('throughput', 'safety', 'maxTotalRequests', '99999');
    assertPerformanceClamp('throughput', 'config', 'iterations', '100998', '99999', 'Throughput requests should not exceed max requests.');
    setPerformanceNumber('throughput', 'safety', 'maxConcurrency', '3');
    assertPerformanceClamp('throughput', 'config', 'concurrency', '99', '3', 'Throughput concurrency should not exceed max concurrency.');

    activateTab('performance', 'concurrency');
    setPerformanceNumber('concurrency', 'safety', 'maxTotalRequests', '100');
    setPerformanceNumber('concurrency', 'config', 'concurrency', '10');
    assertPerformanceClamp('concurrency', 'config', 'iterations', '999', '10', 'Concurrency requests per user should keep total requests within max requests.');
    setPerformanceNumber('concurrency', 'safety', 'maxConcurrency', '4');
    assertPerformanceClamp('concurrency', 'config', 'concurrency', '99', '4', 'Concurrency virtual users should not exceed max concurrency.');

    activateTab('performance', 'stress');
    setPerformanceNumber('stress', 'safety', 'maxTotalRequests', '120');
    setPerformanceNumber('stress', 'config', 'rampSteps', '12');
    assertPerformanceClamp('stress', 'config', 'iterations', '999', '10', 'Stress requests per step should keep total requests within max requests.');
    setPerformanceNumber('stress', 'safety', 'maxConcurrency', '6');
    assertPerformanceClamp('stress', 'config', 'startConcurrency', '99', '6', 'Stress start users should not exceed max concurrency.');
    assertPerformanceClamp('stress', 'config', 'concurrency', '99', '6', 'Stress peak users should not exceed max concurrency.');

    activateTab('performance', 'spike');
    setPerformanceNumber('spike', 'safety', 'maxTotalRequests', '77');
    assertPerformanceClamp('spike', 'config', 'iterations', '999', '77', 'Spike requests should not exceed max requests.');
    setPerformanceNumber('spike', 'safety', 'maxConcurrency', '12');
    setPerformanceNumber('spike', 'config', 'concurrency', '4');
    assertPerformanceClamp('spike', 'config', 'spikeMultiplier', '99', '3', 'Spike multiplier should keep effective concurrency within max concurrency.');

    activateTab('performance', 'soak');
    assertPerformanceClamp('soak', 'safety', 'maxTotalRequests', '1000001', '1000000', 'Soak max requests should clamp to one million.');
    setPerformanceNumber('soak', 'safety', 'maxConcurrency', '5');
    assertPerformanceClamp('soak', 'config', 'concurrency', '99', '5', 'Soak users should not exceed max concurrency.');
    assertPerformanceClamp('soak', 'safety', 'maxDurationSeconds', '9999', '3600', 'Soak max duration should clamp to the global cap.');
    assertPerformanceClamp('soak', 'config', 'durationSeconds', '9999', '3600', 'Soak duration should clamp to the global cap.');
    setPerformanceNumber('soak', 'safety', 'maxDurationSeconds', '45');
    assertPerformanceClamp('soak', 'config', 'durationSeconds', '999', '45', 'Soak duration should not exceed max duration.');

    activateTab('performance', 'ramp');
    setPerformanceNumber('ramp', 'safety', 'maxTotalRequests', '50');
    setPerformanceNumber('ramp', 'config', 'iterations', '5');
    assertPerformanceClamp('ramp', 'config', 'rampSteps', '999', '10', 'Ramp steps should keep total requests within max requests.');
    setPerformanceNumber('ramp', 'safety', 'maxConcurrency', '8');
    assertPerformanceClamp('ramp', 'config', 'startConcurrency', '99', '8', 'Ramp start users should not exceed max concurrency.');
    assertPerformanceClamp('ramp', 'config', 'concurrency', '99', '8', 'Ramp peak users should not exceed max concurrency.');
  }

  function assertPerformanceClamp(type, kind, name, value, expected, message) {
    const input = setPerformanceNumber(type, kind, name, value);
    assertUiSmoke(input.value === expected, `${message} Expected ${expected}, saw ${input.value}.`);
  }

  async function assertTutorialsSmoke(runtimeGlobal) {
    assertUiSmoke(runtimeGlobal.PostMeterTutorials, 'Tutorials API should be exposed for UI smoke coverage.');
    const modalPromise = runtimeGlobal.PostMeterTutorials.openTutorialsModal();
    await waitForUiSmoke(() => !$('modalBackdrop').hidden && !$('tutorialsModal').hidden, 'Tutorials modal should open from the renderer API.');
    const tutorialItems = Array.from($('tutorialList').querySelectorAll('.tutorial-list-item'));
    assertUiSmoke(tutorialItems.length >= 3, 'Tutorials modal should offer at least three basic tutorials.');
    for (const tutorialTitle of ['Send a Basic Request', 'Use Environment Variables', 'Run a Request Series']) {
      const item = tutorialItems.find((button) => button.textContent.includes(tutorialTitle));
      assertUiSmoke(item, `Tutorials modal should include ${tutorialTitle}.`);
      item.click();
      assertUiSmoke($('tutorialDetailTitle').textContent === tutorialTitle, `${tutorialTitle} should render in the tutorial detail pane.`);
      assertUiSmoke($('tutorialDetailSteps').querySelectorAll('li').length >= 4, `${tutorialTitle} should render a useful step list.`);
    }
    tutorialItems.find((button) => button.textContent.includes('Send a Basic Request')).click();
    $('startTutorialButton').click();
    await waitForUiSmoke(() => $('modalBackdrop').hidden && !$('tutorialOverlay').hidden, 'Starting a tutorial should close the modal and show the overlay.');
    await waitForUiSmoke(() => !$('tutorialTargetFrame').hidden && $('tutorialCoachTitle').textContent === 'Start from New', 'Tutorial overlay should highlight the first target.');
    const state = runtimeGlobal.PostMeterTutorials.activeState();
    assertUiSmoke(state.activeTutorialId === 'request-basics', 'Starting the default tutorial should activate request basics.');
    assertUiSmoke(state.activeTutorialStepIndex === 0, 'Tutorial should start on the first step.');
    assertUiSmoke($('tutorialCoachProgress').textContent === 'Step 1 of 5', 'Tutorial overlay should display step progress.');
    $('endTutorialButton').click();
    await waitForUiSmoke(() => $('tutorialOverlay').hidden, 'Ending a tutorial should hide the overlay.');
    await modalPromise;
  }

  function setPerformanceNumber(type, kind, name, value) {
    const input = performanceNumberInput(type, kind, name);
    assertUiSmoke(input, `${type} ${name} input should exist.`);
    input.value = value;
    dispatchInput(input);
    return input;
  }

  function performanceNumberInput(type, kind, name) {
    const attribute = kind === 'safety' ? 'data-performance-safety' : 'data-performance-config';
    return $(`${type}Tab`)?.querySelector(`[${attribute}="${name}"]`);
  }

  function cssAttributeValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function editMarkdownPane(prefix, value) {
    $(`${prefix}Preview`).click();
    assertUiSmoke(!$(`${prefix}SaveButton`).hidden && !$(`${prefix}CancelButton`).hidden, `${prefix} Save and Cancel buttons should appear while editing.`);
    assertUiSmoke(!$(`${prefix}EditorShell`).hidden && $(`${prefix}Preview`).hidden, `${prefix} Markdown editor should replace the preview while editing.`);
    const input = $(`${prefix}Input`);
    const editor = input.closest('.code-editor');
    assertUiSmoke(editor?.classList.contains('has-line-numbers'), `${prefix} Markdown source should use the normal line-numbered text editor.`);
    input.value = value;
    dispatchInput(input);
  }

  function assertMarkdownPreview(previewId, expected = {}) {
    const preview = $(previewId);
    assertUiSmoke(preview && !preview.hidden, `${previewId} Markdown preview should be visible.`);
    if (expected.heading) {
      assertUiSmoke(
        Array.from(preview.querySelectorAll('h1,h2,h3,h4,h5,h6')).some((heading) => heading.textContent === expected.heading),
        `${previewId} should render Markdown headings.`
      );
    }
    if (expected.strong) {
      assertUiSmoke(preview.querySelector('strong')?.textContent === expected.strong, `${previewId} should render Markdown strong text.`);
    }
    if (expected.code) {
      assertUiSmoke(preview.querySelector('code')?.textContent.includes(expected.code), `${previewId} should render Markdown code.`);
    }
    if (expected.link) {
      const link = preview.querySelector('a');
      assertUiSmoke(link?.textContent === expected.link && link.getAttribute('rel') === 'noreferrer', `${previewId} should render safe Markdown links.`);
    }
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
