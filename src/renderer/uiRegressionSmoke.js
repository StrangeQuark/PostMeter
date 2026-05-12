(function attachUiRegressionSmoke(global) {
  const {
    assertContextMenuSmoke,
    assertUiSmoke,
    dispatchChange,
    dispatchInput,
    nextPaint,
    waitForUiSmoke
  } = resolveUiSmokeCommon(global);

  async function runUiRegressionSmoke() {
    assertUiSmoke(workspace.collections.length === 0, 'Regression smoke should start with an empty workspace.');
    assertUiSmoke(!/(sign in|log in|create account|register)/i.test(document.body.textContent), 'Standalone UI should not render app account/login language.');
    assertUiSmoke(!$('fileMenuButton'), 'Renderer toolbar should not duplicate the native File menu.');
    await assertSettingsMenuClickSmoke();
    assertToolbarMenuSmoke('newMenuButton', 'newMenu', ['Workspace', 'Request', 'Collection', 'Folder', 'Environment', 'Runner', 'Performance Test']);
    assertToolbarMenuSmoke('importMenuButton', 'importMenu', ['Workspace', 'Collection', 'Environment', 'Runner', 'Performance Test']);
    assertToolbarMenuSmoke('exportMenuButton', 'exportMenu', ['Workspace', 'Collection', 'Environment', 'Runner', 'Performance Test'], {
      submenuLabels: ['PostMeter', 'Postman', 'OpenAPI', 'curl']
    });
    assertToolbarMenuKeyboardActivationSmoke();
    await setThemePreference('dark', { save: false, showStatus: false });
    assertUiSmoke(document.documentElement.dataset.theme === 'dark', 'Dark theme was not applied.');
    assertUiSmoke($('themeDarkButton').getAttribute('aria-pressed') === 'true', 'Dark theme control did not show active state.');
    await setThemePreference('light', { save: false, showStatus: false });
    assertUiSmoke(document.documentElement.dataset.theme === 'light', 'Light theme was not applied.');
    assertUiSmoke($('themeLightButton').getAttribute('aria-pressed') === 'true', 'Light theme control did not show active state.');
    await setThemePreference('system', { save: false, showStatus: false });
    assertUiSmoke(document.documentElement.dataset.theme === 'system', 'System theme was not restored.');
    await assertSettingsRollbackSmoke();
    assertConstrainedViewportSmoke();
    await assertForcedColorsStylesheetSmoke();
    assertAccessibilitySemanticsSmoke();
    assertCodeEditorSmoke();
    await assertSidebarPanelSmoke();
    await assertModalFocusSmoke();
    assertUiSmoke(!$('statusLabel'), 'Top-bar status text should not render.');
    setStatus('Regression status tracked.');
    assertStatusIncludes('Regression status tracked', 'setStatus should update the internal app status.');
    assertUiSmoke(!$('checkUpdatesButton'), 'Updates toolbar button should be handled by the Help menu.');
    assertUiSmoke($('includePrereleasesInput'), 'Prereleases setting should be available in Settings.');
    assertUiSmoke($('closeModalsOnBackdropClickInput'), 'Modal backdrop-close setting should be available in Settings.');
    await assertUpdateCheckSmoke();
    assertOauthProgressSmoke();
    await assertWorkspaceManagementSmoke();
    await assertWorkspaceSandboxAccessibilitySmoke();
    await assertLargeWorkspaceBudgetSmoke();
    await assertEditorCollectionSmoke();
    await assertSidebarTreeDragSmoke();
    assertCreationSemanticsSmoke();
    await assertRequestTabCloseSmoke();

    newCollection();
    assertContextMenuSmoke({ keyboard: true }, global);
    assertContextMenuKeyboardActivationSmoke();
    await assertTreeContextMenuModalFocusSmoke();
    newRequest();
    assertMethodColorSmoke();
    $('urlInput').value = '{{baseUrl}}/v1/users';
    dispatchInput($('urlInput'));
    await nextPaint();
    assertVariableHighlight($('urlInput'), 'baseUrl', 'Request URL input should highlight environment variable tokens.');
    $('urlInput').value = 'https://api.example.test/v1/users';
    dispatchInput($('urlInput'));
    activateTab('request', 'headers');
    $('sendPostMeterTokenInput').checked = true;
    dispatchChange($('sendPostMeterTokenInput'));
    assertUiSmoke(activeRequest().autoHeaders.sendPostMeterToken === true, 'PostMeter token checkbox should persist on the active request.');
    $('showGeneratedHeadersInput').checked = true;
    dispatchChange($('showGeneratedHeadersInput'));
    await nextPaint();
    const generatedHeaderNames = Array.from($('headersTable').querySelectorAll('[data-generated-header="true"] input[aria-label^="Auto-generated"]'))
      .map((input) => input.value);
    assertUiSmoke(generatedHeaderNames.includes('Accept'), 'Generated request headers should show Accept when unhidden.');
    assertUiSmoke(generatedHeaderNames.includes('User-Agent'), 'Generated request headers should show User-Agent when unhidden.');
    assertUiSmoke(generatedHeaderNames.includes('Host'), 'Generated request headers should show Host when unhidden.');
    assertUiSmoke(generatedHeaderNames.includes('PostMeter-Token'), 'Generated request headers should show opt-in PostMeter-Token when unhidden.');
    assertUiSmoke(!activeRequest().headers.some((header) => header.key === 'PostMeter-Token'), 'Generated request headers should not be saved as authored headers.');
    activateTab('request', 'auth');
    $('authTypeSelect').value = 'bearer';
    dispatchChange($('authTypeSelect'));
    $('authBearerTokenInput').value = '{{baseUrl}}';
    dispatchInput($('authBearerTokenInput'));
    await nextPaint();
    assertVariableHighlight($('authBearerTokenInput'), 'baseUrl', 'Bearer token fields should highlight environment variable tokens.');
    assertVariableHighlightUsesInputMetrics($('authBearerTokenInput'), 'baseUrl', 'Bearer token variable highlighting should not alter input text metrics.');
    const generatedHeadersAfterBearerAuth = Array.from($('headersTable').querySelectorAll('[data-generated-header="true"] input[aria-label^="Auto-generated"]'))
      .map((input) => input.value);
    assertUiSmoke(generatedHeadersAfterBearerAuth.includes('Authorization'), 'Generated request headers should update when Auth tab enables Authorization.');
    $('authTypeSelect').value = 'none';
    dispatchChange($('authTypeSelect'));
    await nextPaint();
    const generatedHeadersAfterNoAuth = Array.from($('headersTable').querySelectorAll('[data-generated-header="true"] input[aria-label^="Auto-generated"]'))
      .map((input) => input.value);
    assertUiSmoke(!generatedHeadersAfterNoAuth.includes('Authorization'), 'Generated request headers should update when Auth tab disables Authorization.');
    $('showGeneratedHeadersInput').checked = false;
    dispatchChange($('showGeneratedHeadersInput'));
    assertUiSmoke(!$('headersTable').querySelector('[data-generated-header="true"]'), 'Generated request headers should hide when the toggle is cleared.');
    activateTab('request', 'params');
    $('addParamButton').click();
    let requestParamInputs = $('paramsTable').querySelectorAll('input');
    requestParamInputs[1].value = 'taco';
    dispatchInput(requestParamInputs[1]);
    requestParamInputs[2].value = '{{baseUrl}}';
    dispatchInput(requestParamInputs[2]);
    await nextPaint();
    assertVariableHighlight(requestParamInputs[2], 'baseUrl', 'Request Params values should highlight environment variable tokens.');
    requestParamInputs[2].value = 'car';
    dispatchInput(requestParamInputs[2]);
    assertUiSmoke($('urlInput').value.endsWith('/v1/users?taco=car'), 'Editing request params should update the request URL.');
    assertUiSmoke(highlightedTextboxText($('urlInput')).endsWith('/v1/users?taco=car'), 'Editing request params should refresh the visible request URL text.');
    requestParamInputs[0].checked = false;
    dispatchChange(requestParamInputs[0]);
    assertUiSmoke(!$('urlInput').value.includes('taco=car'), 'Disabling a request param should remove it from the URL.');
    $('paramsTable').querySelector('.kv-row button').click();
    assertUiSmoke($('paramsTable').querySelectorAll('.kv-row').length === 0, 'Removing a request param should delete the Params row.');
    assertUiSmoke(!activeRequest().queryParams.length, 'Removing a request param should delete it from the request model.');
    $('urlInput').value = 'https://api.example.test/v1/users?from=url&multi=one&multi=two';
    dispatchInput($('urlInput'));
    requestParamInputs = $('paramsTable').querySelectorAll('input');
    assertUiSmoke(requestParamInputs[1].value === 'from' && requestParamInputs[2].value === 'url', 'Editing the request URL should update the Params table.');
    assertUiSmoke(requestParamInputs[4].value === 'multi' && requestParamInputs[5].value === 'one', 'URL query parsing should keep repeated request params.');
    activateTab('request', 'cookies');
    assertUiSmoke($('requestCookieJarEnabledInput'), 'Cookie jar request toggle is missing.');
    $('addCookieButton').click();
    const cookieRow = $('cookiesTable').querySelector('.cookie-row');
    assertUiSmoke(cookieRow, 'Cookie editor did not create a row.');
    assertUiSmoke(cookieRow.querySelector('[aria-label^="Cookie"][aria-label$="name"]'), 'Cookie row name input should expose a contextual accessible label.');
    assertUiSmoke(cookieRow.querySelector('[aria-label^="Cookie"][aria-label*="SameSite"]'), 'Cookie SameSite control should expose a contextual accessible label.');
    $('filterCookiesToRequestHostInput').checked = true;
    dispatchChange($('filterCookiesToRequestHostInput'));
    assertUiSmoke($('cookiesTable').querySelector('.cookie-row'), 'Cookie active-host filter hid the matching row.');
    assertUiSmoke($('cookieHostFilterLabel').textContent.includes('api.example.test'), 'Cookie active-host filter did not show the active host.');
    $('urlInput').value = 'https://other.example.test/v1/users';
    dispatchInput($('urlInput'));
    assertUiSmoke(!$('cookiesTable').querySelector('.cookie-row'), 'Cookie active-host filter did not hide non-matching rows.');
    $('filterCookiesToRequestHostInput').checked = false;
    dispatchChange($('filterCookiesToRequestHostInput'));
    activateTab('request', 'examples');
    $('addExampleButton').click();
    const exampleItem = $('examplesList').querySelector('.example-item');
    assertUiSmoke(exampleItem, 'Example editor did not create a row.');
    assertUiSmoke(exampleItem.querySelector('[aria-label="Example 1 name"]'), 'Example name input should expose a contextual accessible label.');
    assertUiSmoke(exampleItem.querySelector('[aria-label="Example 1 headers"]'), 'Example headers textarea should expose a contextual accessible label.');
    activateTab('request', 'collectionVariables');
    $('addRequestVariableButton').click();
    const variableRow = $('requestVariablesTable').querySelector('.kv-row');
    assertUiSmoke(variableRow, 'Request variable editor did not create a row.');
    assertUiSmoke(variableRow.querySelector('[aria-label="Variable 1 enabled"]'), 'Request variable enabled control should expose a contextual accessible label.');
    assertUiSmoke(variableRow.querySelector('[aria-label="Variable 1"]'), 'Request variable key input should expose a contextual accessible label.');
    activateTab('request', 'tests');
    $('assertionTemplateSelect').value = 'headerContains';
    dispatchChange($('assertionTemplateSelect'));
    $('addAssertionTemplateButton').click();
    const assertionRow = $('assertionsTable').querySelector('.assertion-row');
    assertUiSmoke(assertionRow, 'Assertion template did not create a row.');
    assertUiSmoke(assertionRow.querySelector('[aria-label="Assertion 1 type"]'), 'Assertion type control should expose a contextual accessible label.');
    assertUiSmoke(assertionRow.querySelector('[aria-label="Assertion 1 expected value"]'), 'Assertion expected-value input should expose a contextual accessible label.');
    assertUiSmoke(assertionRow.dataset.assertionType === 'header', 'Header assertion template did not mark row type.');
    const assertionInputs = assertionRow.querySelectorAll('input');
    assertUiSmoke(assertionInputs[1].placeholder === 'Header name', 'Header assertion did not use header-name placeholder.');
    assertUiSmoke(assertionInputs[3].placeholder === 'Expected header value', 'Header assertion did not use expected-value placeholder.');
    $('assertionTemplateSelect').value = 'xmlPathExists';
    dispatchChange($('assertionTemplateSelect'));
    $('addAssertionTemplateButton').click();
    const xmlAssertionRow = Array.from($('assertionsTable').querySelectorAll('.assertion-row')).at(-1);
    assertUiSmoke(xmlAssertionRow.dataset.assertionType === 'xmlPath', 'XML assertion template did not mark row type.');
    assertUiSmoke(xmlAssertionRow.querySelectorAll('input')[2].placeholder === 'XPath', 'XML assertion did not use XPath placeholder.');
    $('assertionTemplateSelect').value = 'htmlSelectorExists';
    dispatchChange($('assertionTemplateSelect'));
    $('addAssertionTemplateButton').click();
    const htmlAssertionRow = Array.from($('assertionsTable').querySelectorAll('.assertion-row')).at(-1);
    assertUiSmoke(htmlAssertionRow.dataset.assertionType === 'htmlSelector', 'HTML assertion template did not mark row type.');
    assertUiSmoke(htmlAssertionRow.querySelectorAll('input')[2].placeholder === 'CSS selector', 'HTML assertion did not use selector placeholder.');
    displayResponse({
      statusCode: 200,
      durationMillis: 1,
      responseBytes: 42,
      finalUrl: 'https://api.example.test/xml',
      headers: {
        'content-type': ['application/xml'],
        'set-cookie': ['xmlSession=ready; Path=/; HttpOnly']
      },
      body: '<response><title>Smoke</title></response>'
    });
    assertUiSmoke($('responseBody').value.includes('\n  <title>Smoke</title>'), `XML response body was not formatted: ${$('responseBody').value}`);
    assertUiSmoke($('responseHeaders').value.includes('set-cookie: xmlSession=ready; Path=/; HttpOnly'), 'Response headers tab did not receive Set-Cookie values.');
    assertUiSmoke($('responseCookies').value === 'xmlSession=ready; Path=/; HttpOnly', 'Response cookies tab did not isolate Set-Cookie values.');
    displayResponse({
      statusCode: 200,
      durationMillis: 1,
      responseBytes: 64,
      finalUrl: 'https://api.example.test/html',
      headers: { 'content-type': ['text/html'] },
      body: '<!doctype html><html><body><h1>Smoke</h1></body></html>'
    });
    assertUiSmoke($('responseBody').value.includes('\n    <h1>Smoke</h1>'), `HTML response body was not formatted: ${$('responseBody').value}`);
    displayResponse({
      statusCode: 200,
      durationMillis: 1,
      responseBytes: 33,
      finalUrl: 'https://api.example.test/form',
      headers: { 'content-type': ['application/x-www-form-urlencoded'] },
      body: 'token=abc123&scope=read+write'
    });
    assertUiSmoke(
      $('responseBody').value.includes('token: abc123\nscope: read write'),
      `URL-encoded response body was not formatted: ${$('responseBody').value}`
    );
    displayResponse({
      statusCode: 200,
      durationMillis: 2,
      responseBytes: 2,
      finalUrl: 'https://api.example.test/tests',
      headers: { 'content-type': ['application/json'] },
      body: '{}',
      preRequestScriptResult: {
        passed: false,
        tests: [{
          name: 'pre-request script network request is blocked',
          passed: false,
          error: 'Expected pm.sendRequest is disabled for this workspace. to equal null.'
        }],
        error: '',
        logs: []
      },
      testScriptResult: {
        passed: true,
        tests: [{ name: 'post-request status is 200', passed: true, error: '' }],
        error: '',
        logs: ['post-request console output']
      }
    });
    activateTab('results', 'testResults');
    assertUiSmoke($('testResultsSummary').textContent.includes('1/2 passed'), 'Test results summary did not show aggregate pass count.');
    assertUiSmoke($('preRequestTestResults').textContent.includes('FAILED'), 'Pre-request test failure was not rendered.');
    assertUiSmoke($('postRequestTestResults').textContent.includes('PASSED'), 'Post-request test pass was not rendered.');
    assertUiSmoke($('postRequestTestResults').textContent.includes('post-request console output'), 'Post-request script log was not rendered.');
    await assertValidationErrorSmoke();
    await assertRequestSendFailureSmoke();
    await assertExportCancellationSmoke();
    await assertOauthFlowSmoke();

    assertUiSmoke(!$('resultsRunnerTabButton'), 'Runner should not appear in the request-local results tabs.');
    selectSidebarPanel('runners');
    const regressionRunner = newRunner();
    assertUiSmoke(regressionRunner, 'Regression runner was not created.');
    assertUiSmoke($('exportRunnerJsonButton').disabled, 'Runner JSON export should be disabled before a run.');
    assertUiSmoke($('exportRunnerCsvButton').disabled, 'Runner CSV export should be disabled before a run.');
    assertUiSmoke($('runnerStopOnFailure'), 'Runner stop-on-failure control is missing.');
  }

  function assertConstrainedViewportSmoke() {
    assertUiSmoke(window.innerWidth <= 1100, `Regression smoke should run at the constrained desktop width, got ${window.innerWidth}.`);
    assertUiSmoke(window.innerHeight <= 760, `Regression smoke should run at the constrained desktop height, got ${window.innerHeight}.`);
    assertUiSmoke(document.documentElement.scrollWidth <= window.innerWidth + 2, 'Constrained viewport should not produce page-level horizontal overflow.');
  }

  async function assertSettingsMenuClickSmoke() {
    const modalPromise = openSettingsModal();
    await nextPaint();
    assertUiSmoke(!$('modalBackdrop').hidden, 'Opening Settings should show the modal backdrop.');
    assertUiSmoke(!$('settingsModal').hidden, 'Opening Settings should show the Settings modal.');
    assertSettingsSandboxHelpText();
    await assertEditorLineNumbersSettingSmoke();
    $('closeSettingsModalFooterButton').click();
    await modalPromise;
    await nextPaint();
    assertUiSmoke($('modalBackdrop').hidden, 'Closing Settings should hide the modal backdrop.');
  }

  function assertSettingsSandboxHelpText() {
    assertUiSmoke(
      $('settingsVaultDescription')?.textContent.includes('local secret values'),
      'Vault settings should explain that vault values are local script secrets.'
    );
    assertUiSmoke(
      $('settingsPackagesDescription')?.textContent.includes('reviewed JavaScript bundles'),
      'Packages settings should explain reviewed script package bundles.'
    );
    assertUiSmoke(
      $('settingsFilesDescription')?.textContent.includes('imported file references'),
      'Files settings should explain imported file bindings.'
    );
  }

  async function assertEditorLineNumbersSettingSmoke() {
    const checkbox = $('showEditorLineNumbersInput');
    const editor = $('bodyInput')?.closest?.('.code-editor');
    assertUiSmoke(checkbox, 'Editor line number setting checkbox should exist.');
    assertUiSmoke(editor, 'Request body editor should exist before toggling editor line numbers.');
    assertUiSmoke(checkbox.checked === true, 'Editor line number setting should default to checked.');
    assertUiSmoke(editor.classList.contains('has-line-numbers'), 'Code editors should start with line numbers enabled.');

    clickElementAtCenter(checkbox, 'Editor line number setting checkbox');
    await waitForUiSmoke(
      () => checkbox.checked === false && workspace.settings.editor.lineNumbers === false,
      'Editor line number setting checkbox did not turn off.',
      1000,
      global
    );
    await waitForUiSmoke(
      () => lastStatusMessage.includes('Editor line numbers disabled.'),
      'Editor line number setting save did not complete after disabling.',
      1000,
      global
    );
    assertUiSmoke(checkbox.checked === false, 'Editor line number setting checkbox should stay unchecked after settings are saved.');
    assertUiSmoke(!editor.classList.contains('has-line-numbers'), 'Code editors should remove line numbers when the setting is unchecked.');

    clickElementAtCenter(checkbox, 'Editor line number setting checkbox');
    await waitForUiSmoke(
      () => checkbox.checked === true && workspace.settings.editor.lineNumbers === true,
      'Editor line number setting checkbox did not turn back on.',
      1000,
      global
    );
    await waitForUiSmoke(
      () => lastStatusMessage.includes('Editor line numbers enabled.'),
      'Editor line number setting save did not complete after enabling.',
      1000,
      global
    );
    assertUiSmoke(checkbox.checked === true, 'Editor line number setting checkbox should stay checked after settings are saved.');
    assertUiSmoke(editor.classList.contains('has-line-numbers'), 'Code editors should restore line numbers when the setting is checked again.');
  }

  function clickElementAtCenter(element, label) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + (rect.width / 2);
    const y = rect.top + (rect.height / 2);
    const hitTarget = document.elementFromPoint(x, y);
    assertUiSmoke(
      hitTarget === element || element.contains(hitTarget),
      `${label} should be the top hit target.`
    );
    hitTarget.click();
  }

  async function assertForcedColorsStylesheetSmoke() {
    const hasForcedColorsRule = Array.from(document.styleSheets).some((sheet) => {
      try {
        return Array.from(sheet.cssRules || []).some((rule) => String(rule.conditionText || '').includes('forced-colors'));
      } catch {
        return false;
      }
    });
    assertUiSmoke(hasForcedColorsRule, 'Theme styles should include a forced-colors high-contrast rule.');
    assertUiSmoke(window.matchMedia?.('(forced-colors: active)')?.matches === true, 'Regression smoke should execute with forced-colors active.');
    const settingsPromise = $('settingsModal').hidden ? openSettingsModal('appearance') : null;
    await nextPaint();
    try {
      const focusTarget = $('themeLightButton');
      focusTarget.focus({ preventScroll: true });
      await nextPaint();
      assertUiSmoke(document.activeElement === focusTarget, 'Forced-colors focus probe should move focus to the Settings theme control.');
      const focusStyle = getComputedStyle(focusTarget);
      const computedOutlineVisible = focusStyle.outlineStyle !== 'none' && Number.parseFloat(focusStyle.outlineWidth) > 0;
      const hasDatasetFallbackRule = document.documentElement.dataset.forcedColors === 'active'
        && Array.from(document.styleSheets).some((sheet) => {
          try {
            return Array.from(sheet.cssRules || []).some((rule) => (
              String(rule.selectorText || '').includes('data-forced-colors="active"')
                && String(rule.cssText || '').includes('outline')
            ));
          } catch {
            return false;
          }
        });
      assertUiSmoke(
        computedOutlineVisible || hasDatasetFallbackRule,
        `Forced-colors focus state should expose a visible outline. Computed ${focusStyle.outlineStyle}/${focusStyle.outlineWidth}.`
      );
    } finally {
      if (settingsPromise) {
        $('closeSettingsModalFooterButton').click();
        await settingsPromise;
      }
    }
  }

  function assertAccessibilitySemanticsSmoke() {
    assertUiSmoke(document.querySelector('.tabs[data-tab-group="request"][role="tablist"]'), 'Request tabs should expose tablist semantics.');
    assertUiSmoke($('requestParamsTabButton').getAttribute('role') === 'tab', 'Request tab button should expose role=tab.');
    assertUiSmoke($('paramsTab').getAttribute('role') === 'tabpanel', 'Request params panel should expose role=tabpanel.');
    activateTab('request', 'headers');
    assertUiSmoke($('requestHeadersTabButton').getAttribute('aria-selected') === 'true', 'Active request tab should update aria-selected.');
    assertUiSmoke($('headersTab').getAttribute('aria-hidden') === 'false', 'Active request panel should update aria-hidden.');
    assertUiSmoke($('paramsTab').getAttribute('aria-hidden') === 'true', 'Inactive request panel should update aria-hidden.');
    assertUiSmoke($('resultsHeadersTabButton').textContent.trim() === 'Headers', 'Results tabs should include a dedicated Headers section.');
    assertUiSmoke($('resultsCookiesTabButton').textContent.trim() === 'Cookies', 'Results tabs should include a dedicated Cookies section.');
    activateTab('results', 'responseHeaders');
    assertUiSmoke($('resultsHeadersTabButton').getAttribute('aria-selected') === 'true', 'Headers result tab should update aria-selected.');
    assertUiSmoke($('responseHeadersTab').getAttribute('aria-hidden') === 'false', 'Headers result panel should update aria-hidden.');
    activateTab('results', 'responseCookies');
    assertUiSmoke($('resultsCookiesTabButton').getAttribute('aria-selected') === 'true', 'Cookies result tab should update aria-selected.');
    assertUiSmoke($('responseCookiesTab').getAttribute('aria-hidden') === 'false', 'Cookies result panel should update aria-hidden.');
    assertUiSmoke($('runnerResults').getAttribute('aria-live') === 'polite', 'Runner results should be announced as a live region.');
    assertUiSmoke($('validationLabel').getAttribute('role') === 'status', 'Validation output should expose role=status.');
    assertUiSmoke($('oauthProgressPanel').getAttribute('aria-live') === 'polite', 'OAuth progress should be a live region.');
    assertUiSmoke($('responseBody').getAttribute('aria-label') === 'Response body', 'Response body textarea should have an accessible label.');
    assertUiSmoke($('responseHeaders').getAttribute('aria-label') === 'Response headers', 'Response headers textarea should have an accessible label.');
    assertUiSmoke($('responseCookies').getAttribute('aria-label') === 'Response cookies', 'Response cookies textarea should have an accessible label.');
    activateTab('request', 'params');
    activateTab('results', 'response');
  }

  function assertCodeEditorSmoke() {
    const bodyInput = $('bodyInput');
    bodyInput.value = '';
    bodyInput.setSelectionRange(0, 0);
    bodyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assertUiSmoke(bodyInput.value === '\t', 'Request body editor should insert a tab character instead of moving focus.');
    assertUiSmoke(bodyInput.closest('.code-editor'), 'Request body editor should be wrapped by the syntax highlight editor.');

    const scriptInput = $('preRequestScriptInput');
    scriptInput.value = '';
    scriptInput.setSelectionRange(0, 0);
    scriptInput.dispatchEvent(new KeyboardEvent('keydown', { key: '{', bubbles: true, cancelable: true }));
    assertUiSmoke(scriptInput.value === '{}', 'Script editor should create closing braces for JavaScript input.');
    scriptInput.value = 'const response = pm.response.json();\n// keep metrics aligned';
    dispatchInput(scriptInput);
    const scriptEditor = scriptInput.closest('.code-editor');
    const keywordToken = scriptEditor?.querySelector?.('.code-editor-token.tok-keyword');
    const commentToken = scriptEditor?.querySelector?.('.code-editor-token.tok-comment');
    assertUiSmoke(keywordToken, 'Script editor should render keyword syntax tokens.');
    assertUiSmoke(commentToken, 'Script editor should render comment syntax tokens.');
    assertHighlightedTextUsesInputMetrics(scriptInput, keywordToken, 'Script keyword highlighting should not alter caret text metrics.');
    assertHighlightedTextUsesInputMetrics(scriptInput, commentToken, 'Script comment highlighting should not alter caret text metrics.');
    const originalActiveEnvironmentId = activeEnvironmentId;
    const highlightEnvironment = {
      id: 'ui-regression-variable-highlight-env',
      name: 'UI Regression Variable Highlight Env',
      variables: [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }]
    };
    workspace.environments.push(highlightEnvironment);
    activeEnvironmentId = highlightEnvironment.id;
    renderEnvironmentSelect();
    refreshVariableHighlights();
    try {
      bodyInput.value = '{"valid":"{{baseUrl}}","invalid":"{{missingToken}}"}';
      dispatchInput(bodyInput);
      assertVariableHighlight(bodyInput, 'baseUrl', 'Code editor textareas should mark known environment variables as valid.', 'valid');
      assertVariableHighlight(bodyInput, 'missingToken', 'Code editor textareas should mark unknown environment variables as invalid.', 'invalid');
    } finally {
      workspace.environments = workspace.environments.filter((environment) => environment.id !== highlightEnvironment.id);
      activeEnvironmentId = originalActiveEnvironmentId;
      renderEnvironmentSelect();
      refreshVariableHighlights();
      bodyInput.value = '';
      scriptInput.value = '';
      dispatchInput(bodyInput);
      dispatchInput(scriptInput);
    }

    activateTab('results', 'response');
    const responsePanel = document.querySelector('.response-editor-panel');
    const responseBody = $('responseBody');
    const responseEditor = responseBody.closest('.code-editor');
    const responseHighlight = responseEditor?.querySelector('.code-editor-highlight');
    const panelRect = responsePanel.getBoundingClientRect();
    const editorRect = responseEditor.getBoundingClientRect();
    const bodyRect = responseBody.getBoundingClientRect();
    const highlightRect = responseHighlight.getBoundingClientRect();
    assertUiSmoke(Math.abs(editorRect.height - panelRect.height) <= 2, 'Response body editor should fill the response panel height.');
    assertUiSmoke(Math.abs(bodyRect.height - editorRect.height) <= 2, 'Response body textarea should match the visible response editor height.');
    assertUiSmoke(Math.abs(bodyRect.width - editorRect.width) <= 2, 'Response body textarea should match the visible response editor width.');
    assertUiSmoke(Math.abs(highlightRect.height - bodyRect.height) <= 2, 'Response body syntax layer should match the textarea height.');
    assertUiSmoke(Math.abs(highlightRect.width - bodyRect.width) <= 2, 'Response body syntax layer should match the textarea width.');
    activateTab('results', 'responseHeaders');
    const responseHeaders = $('responseHeaders');
    const headersEditor = responseHeaders.closest('.code-editor');
    const headersPanelRect = $('responseHeadersTab').getBoundingClientRect();
    const headersRect = responseHeaders.getBoundingClientRect();
    assertUiSmoke(Math.abs(headersEditor.getBoundingClientRect().height - headersPanelRect.height) <= 2, 'Response headers editor should fill its result tab height.');
    assertUiSmoke(Math.abs(headersRect.height - headersEditor.getBoundingClientRect().height) <= 2, 'Response headers textarea should match the visible editor height.');
    activateTab('results', 'responseCookies');
    const responseCookies = $('responseCookies');
    const cookiesEditor = responseCookies.closest('.code-editor');
    const cookiesPanelRect = $('responseCookiesTab').getBoundingClientRect();
    const cookiesRect = responseCookies.getBoundingClientRect();
    assertUiSmoke(Math.abs(cookiesEditor.getBoundingClientRect().height - cookiesPanelRect.height) <= 2, 'Response cookies editor should fill its result tab height.');
    assertUiSmoke(Math.abs(cookiesRect.height - cookiesEditor.getBoundingClientRect().height) <= 2, 'Response cookies textarea should match the visible editor height.');
    activateTab('results', 'response');
  }

  function assertVariableHighlight(control, variableName, message, expectedStatus = '') {
    const wrapper = control.closest?.('.variable-highlight-editor') || control.closest?.('.code-editor');
    const token = wrapper?.querySelector?.(`[data-variable-name="${cssAttributeValue(variableName)}"]`);
    assertUiSmoke(token, message);
    if (expectedStatus) {
      assertUiSmoke(token.getAttribute('data-variable-status') === expectedStatus, `${message} Expected ${expectedStatus} token status.`);
    }
  }

  function assertVariableHighlightUsesInputMetrics(control, variableName, message) {
    const wrapper = control.closest?.('.variable-highlight-editor') || control.closest?.('.code-editor');
    const token = wrapper?.querySelector?.(`[data-variable-name="${cssAttributeValue(variableName)}"]`);
    assertUiSmoke(token, message);
    assertHighlightedTextUsesInputMetrics(control, token, message);
  }

  function assertHighlightedTextUsesInputMetrics(control, highlightedNode, message) {
    const controlStyle = getComputedStyle(control);
    const highlightedStyle = getComputedStyle(highlightedNode);
    for (const property of ['fontSize', 'fontStyle', 'fontWeight', 'letterSpacing', 'lineHeight', 'wordSpacing']) {
      assertUiSmoke(
        highlightedStyle[property] === controlStyle[property],
        `${message} ${property} should match the editable text. Expected ${controlStyle[property]}, got ${highlightedStyle[property]}.`
      );
    }
  }

  function highlightedTextboxText(control) {
    const wrapper = control.closest?.('.variable-highlight-editor');
    return wrapper?.querySelector?.('.variable-highlight-code')?.textContent || control.value || '';
  }

  async function assertModalFocusSmoke() {
    const trigger = $('exportMenuButton');
    trigger.focus();
    renderExportCollectionList([]);
    const modalResult = showModal('exportCollectionModal', null);
    assertUiSmoke(document.activeElement === $('cancelExportCollectionButton'), 'Export modal should focus the cancel action on open.');
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    document.dispatchEvent(tabEvent);
    assertUiSmoke(document.activeElement === $('cancelExportCollectionButton'), 'Export modal should trap focus when only one enabled action is focusable.');
    $('cancelExportCollectionButton').click();
    await modalResult;
    assertUiSmoke(document.activeElement === trigger, 'Closing a modal should restore focus to the opener.');
    const textTrigger = $('exportMenuButton');
    textTrigger.focus();
    const textResult = promptTextInput({
      title: 'Smoke text input',
      message: 'Provide a reviewed value.',
      label: 'Reviewed value',
      defaultValue: 'npm:example@1.0.0'
    });
    assertUiSmoke(document.activeElement === $('textInputModalInput'), 'Text input modal should focus the editable field.');
    $('textInputModalInput').value = 'npm:changed@1.0.0';
    $('confirmTextInputModalButton').click();
    assertUiSmoke(await textResult === 'npm:changed@1.0.0', 'Text input modal should resolve the reviewed value.');
    assertUiSmoke(document.activeElement === textTrigger, 'Text input modal should restore focus to the opener.');
    const secretResult = promptTextInput({
      title: 'Smoke secret input',
      message: 'Provide a local secret value.',
      label: 'Secret value',
      defaultValue: '',
      secret: true
    });
    assertUiSmoke(document.activeElement === $('textInputModalSingleLineInput'), 'Secret text input modal should focus the single-line field.');
    assertUiSmoke($('textInputModalSingleLineInput').type === 'password', 'Secret text input modal should mask the editable field.');
    $('textInputModalSingleLineInput').value = 'secret-value';
    $('confirmTextInputModalButton').click();
    assertUiSmoke(await secretResult === 'secret-value', 'Secret text input modal should resolve the secret value.');
    const confirmResult = confirmActionModal({
      title: 'Smoke confirm action',
      message: 'Confirm the action.',
      confirmLabel: 'Confirm'
    });
    assertUiSmoke(document.activeElement === $('cancelConfirmActionButton'), 'Confirm modal should focus the cancel action on open.');
    $('confirmActionButton').click();
    assertUiSmoke(await confirmResult === true, 'Confirm modal should resolve true when confirmed.');

    const notificationTrigger = $('exportMenuButton');
    notificationTrigger.focus();
    $('notificationModalTitle').textContent = 'Smoke notification';
    $('notificationModalMessage').textContent = 'Smoke notification message.';
    const notificationResult = showModal('notificationModal', true);
    assertUiSmoke(document.activeElement === $('closeNotificationModalButton'), 'Notification modal should focus the close action.');
    $('closeNotificationModalButton').click();
    assertUiSmoke(await notificationResult === true, 'Notification modal should resolve when closed.');
    assertUiSmoke(document.activeElement === notificationTrigger, 'Notification modal should restore focus to the opener.');

    const draftTrigger = $('exportMenuButton');
    draftTrigger.focus();
    renderSaveDraftCollectionList();
    const draftResult = showModal('saveDraftRequestModal', null);
    assertUiSmoke(document.activeElement === $('cancelSaveDraftButton'), 'Save-draft modal should focus the cancel action.');
    $('cancelSaveDraftButton').click();
    assertUiSmoke(await draftResult === null, 'Save-draft modal should resolve null when cancelled.');
    assertUiSmoke(document.activeElement === draftTrigger, 'Save-draft modal should restore focus to the opener.');

    const vaultTrigger = $('exportMenuButton');
    vaultTrigger.focus();
    activeVaultPromptPayload = {
      collectionName: 'Smoke Collection',
      key: 'api-token',
      operation: 'get',
      requestName: 'Smoke Request',
      workspaceName: 'Smoke Workspace'
    };
    renderVaultPrompt(activeVaultPromptPayload);
    const vaultResult = showModal('vaultPromptModal', { granted: false, scope: 'request' });
    assertUiSmoke(document.activeElement === $('denyVaultPromptButton'), 'Vault prompt modal should focus the deny action.');
    $('resetVaultPromptGrantsButton').click();
    assertUiSmoke((await vaultResult)?.reset === true, 'Vault prompt reset action should resolve a reset decision.');
    activeVaultPromptPayload = null;
    assertUiSmoke(document.activeElement === vaultTrigger, 'Vault prompt modal should restore focus to the opener.');

    const unsavedResult = showModal('unsavedRequestModal', 'cancel');
    const replacementResult = confirmActionModal({
      title: 'Smoke replacement modal',
      message: 'Confirm replacement.',
      confirmLabel: 'Confirm'
    });
    assertUiSmoke(await unsavedResult === 'cancel', 'Replacing an unsaved-changes modal should resolve it with its own cancel value.');
    $('confirmActionButton').click();
    assertUiSmoke(await replacementResult === true, 'Replacement modal should remain interactive after closing the previous modal.');
  }

  async function assertSettingsRollbackSmoke() {
    const originalSaveSettings = window.__postmeterSaveWorkspaceSettings;
    const originalSettings = structuredClone(workspace.settings || {});
    try {
      ensureSettings();
      workspace.settings.appearance.theme = 'system';
      workspace.settings.updates.includePrereleases = false;
      applyThemePreference('system');
      renderSettingsControls();
      window.__postmeterSaveWorkspaceSettings = async () => {
        throw new Error('mock settings save failure');
      };

      await setThemePreference('dark', { save: true });
      assertUiSmoke(workspace.settings.appearance.theme === 'system', 'Failed theme save should roll back the workspace setting.');
      assertUiSmoke(document.documentElement.dataset.theme === 'system', 'Failed theme save should roll back the applied theme.');
      assertUiSmoke($('themeSystemButton').getAttribute('aria-pressed') === 'true', 'Failed theme save should restore theme button state.');
      assertStatusIncludes('Theme save failed', 'Failed theme save should surface a user-visible status.');

      await setIncludePrereleases(true, { save: true });
      assertUiSmoke(workspace.settings.updates.includePrereleases === false, 'Failed prerelease setting save should roll back the in-memory setting.');
      assertStatusIncludes('Prerelease setting save failed', 'Failed prerelease setting save should surface a user-visible status.');

      workspace.settings.tabs.saveOnForceClose = false;
      await setSaveOnForceClose(true, { save: true });
      assertUiSmoke(workspace.settings.tabs.saveOnForceClose === false, 'Failed force-close setting save should roll back the in-memory setting.');
      assertStatusIncludes('Force close setting save failed', 'Failed force-close setting save should surface a user-visible status.');

      workspace.settings.modals.closeOnBackdropClick = false;
      await setCloseModalsOnBackdropClick(true, { save: true });
      assertUiSmoke(workspace.settings.modals.closeOnBackdropClick === false, 'Failed modal setting save should roll back the in-memory setting.');
      assertStatusIncludes('Modal setting save failed', 'Failed modal setting save should surface a user-visible status.');

      workspace.settings.diagnostics = normalizeDiagnosticsSettings({
        logging: { enabled: true, level: 'info' },
        requestResponseLogging: { urls: false }
      });
      renderDiagnosticsPrivacyPanel();
      $('diagnosticLogUrlsInput').checked = true;
      await setDiagnosticsSettingsFromInputs();
      assertUiSmoke(workspace.settings.diagnostics.requestResponseLogging.urls === false, 'Failed diagnostics setting save should roll back request/response logging opt-ins.');
      assertStatusIncludes('Diagnostics privacy setting save failed', 'Failed diagnostics setting save should surface a user-visible status.');
    } finally {
      window.__postmeterSaveWorkspaceSettings = originalSaveSettings;
      workspace.settings = originalSettings;
      applyThemePreference(workspace.settings?.appearance?.theme || 'system');
      renderSettingsControls();
    }
  }

  async function assertUpdateCheckSmoke() {
    const originalCheck = window.__postmeterUpdateCheck;
    const originalOpen = window.__postmeterOpenExternal;
    let checkOptions = null;
    try {
      window.__postmeterUpdateCheck = async (options) => {
        checkOptions = options;
        return {
          currentVersion: '0.2.0',
          latestVersion: '0.3.0',
          updateAvailable: true,
          releaseUrl: 'https://github.com/StrangeQuark/PostMeter/releases/tag/v0.3.0',
          includePrereleases: options?.includePrereleases === true
        };
      };
      window.__postmeterOpenExternal = async () => true;
      await handleAppMenuAction({ type: 'set-prereleases', includePrereleases: true });
      const updatePromise = checkForUpdates();
      await nextPaint();
      assertUiSmoke(!$('confirmActionModal').hidden, 'Available update should use the in-app confirmation modal.');
      $('cancelConfirmActionButton').click();
      await updatePromise;
      assertUiSmoke(checkOptions?.includePrereleases === true, 'Update check did not pass prerelease opt-in.');
      assertStatusIncludes('0.3.0', 'Update check did not track latest version.');
      window.__postmeterUpdateCheck = async (options) => ({
        currentVersion: '0.3.0',
        latestVersion: '0.3.0',
        updateAvailable: false,
        releaseUrl: '',
        includePrereleases: options?.includePrereleases === true
      });
      lastUserNotification = null;
      await checkForUpdates();
      assertUiSmoke(lastUserNotification?.title === 'No Updates Available', 'No-update check did not show a popup notification.');
      assertUiSmoke(lastUserNotification?.message.includes('0.3.0'), 'No-update popup did not include the current version.');
      assertStatusIncludes('up to date', 'No-update check did not update the visible status.');
      window.__postmeterUpdateCheck = async () => {
        throw new Error('network down');
      };
      lastUserNotification = null;
      await checkForUpdates();
      assertUiSmoke(lastUserNotification?.title === 'Update Check Failed', 'Failed update check did not show a popup notification.');
      assertUiSmoke(lastUserNotification?.message.includes('network down'), 'Failed update check popup did not include the error message.');
    } finally {
      window.__postmeterUpdateCheck = originalCheck;
      window.__postmeterOpenExternal = originalOpen;
    }
  }

  async function assertWorkspaceManagementSmoke() {
    const originalSaveWorkspace = window.__postmeterSaveWorkspace;
    const originalDiagnostics = window.__postmeterDiagnostics;
    try {
      window.__postmeterSaveWorkspace = async (nextWorkspace) => nextWorkspace;
      workspace.collections = [];
      workspace.environments = [];
      activeEnvironmentId = 'none';
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();

      selectSidebarPanel('workspaces');
      assertUiSmoke($('deleteWorkspacePanelButton').disabled, 'Workspace delete should be disabled when only one workspace exists.');
      const originalWorkspaceId = activeWorkspaceId;
      await newWorkspace();
      assertUiSmoke(activeSidebarPanel === 'workspaces', 'Creating a workspace should switch the sidebar to Workspaces.');
      assertUiSmoke(activeMainPanel === 'workspace', 'Creating a workspace should switch the main pane to workspace mode.');
      assertUiSmoke(workspaceListItems().length === 2, 'Creating a workspace should add a second managed workspace.');
      assertUiSmoke(activeWorkspaceId === originalWorkspaceId, 'Creating a workspace should not switch the loaded workspace.');
      assertUiSmoke(!$('deleteWorkspacePanelButton').disabled, 'Workspace delete should enable when multiple workspaces exist.');
      const createdWorkspaceId = selectedWorkspaceId;
      assertUiSmoke(Boolean(createdWorkspaceId && createdWorkspaceId !== originalWorkspaceId), 'Creating a workspace should select the new workspace in the UI.');
      const workspaceTitle = $('workspaceMainTitle');
      assertUiSmoke(!document.getElementById('renameWorkspacePanelButton'), 'Workspace details should not render a separate rename button.');
      assertUiSmoke(!$('workspaceMainPanel').querySelector('.workspace-main-header h2'), 'Workspace details should not render a redundant Workspace label above the title.');
      assertUiSmoke(workspaceTitle.getAttribute('aria-label') === 'Workspace name', 'Workspace title should expose an accessible name.');
      assertUiSmoke(getComputedStyle(workspaceTitle).whiteSpace === 'nowrap', 'Workspace title should stay on a single line.');
      workspaceTitle.click();
      assertUiSmoke(workspaceTitle.getAttribute('contenteditable') === 'plaintext-only', 'Clicking the workspace title should make it editable inline.');
      workspaceTitle.textContent = '';
      workspaceTitle.dispatchEvent(new Event('blur'));
      assertUiSmoke(selectedWorkspaceId === createdWorkspaceId, 'Submitting an empty workspace title should keep the current workspace id.');
      assertUiSmoke(workspaceDisplayName() !== '', 'Submitting an empty workspace title should restore the previous visible name.');
      await editWorkspaceTitle('Renamed Workspace', {
        waitFor: () => selectedWorkspaceId === 'Renamed Workspace.json',
        message: 'Workspace inline rename did not update the selected workspace id.'
      });
      assertUiSmoke($('textInputModal').hidden, 'Workspace inline rename should not open the text input modal.');
      assertUiSmoke(activeWorkspaceId === originalWorkspaceId, 'Renaming a non-current workspace should not switch the loaded workspace.');
      assertUiSmoke(selectedWorkspaceId === 'Renamed Workspace.json', 'Renaming the selected workspace should update the selected workspace id.');
      assertUiSmoke(workspaceDisplayName() === 'Renamed Workspace', 'Renaming the selected workspace should update the viewed workspace name.');
      const renamedTitle = $('workspaceMainTitle');
      renamedTitle.click();
      renamedTitle.textContent = 'Discarded Workspace Rename';
      dispatchInput(renamedTitle);
      renamedTitle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
      await nextPaint();
      assertUiSmoke(selectedWorkspaceId === 'Renamed Workspace.json', 'Escaping a workspace title edit should keep the selected workspace id.');
      assertUiSmoke(workspaceDisplayName() === 'Renamed Workspace', 'Escaping a workspace title edit should restore the original name.');
      const renamedWorkspaceId = selectedWorkspaceId;
      newCollection();
      assertUiSmoke(workspace.collections.length === 1, 'Current workspace should accept collection edits before switching away.');
      const originalWorkspaceButton = Array.from($('workspacesList').querySelectorAll('button'))
        .find((button) => button.textContent.includes('Local Workspace'));
      assertUiSmoke(originalWorkspaceButton, 'Workspace list did not render the original workspace button.');
      originalWorkspaceButton.click();
      assertUiSmoke(selectedWorkspaceId === originalWorkspaceId, 'Selecting a workspace in the list should update the viewed workspace id.');
      assertUiSmoke(activeWorkspaceId === originalWorkspaceId, 'Selecting a workspace in the list should not switch the loaded workspace.');
      const renamedWorkspaceButton = Array.from($('workspacesList').querySelectorAll('button'))
        .find((button) => button.textContent.includes('Renamed Workspace'));
      assertUiSmoke(renamedWorkspaceButton, 'Workspace list did not render the renamed workspace button.');
      renamedWorkspaceButton.click();
      assertUiSmoke(!$('switchWorkspacePanelButton').disabled, 'Viewing a non-current workspace should enable the switch button.');
      assertUiSmoke(!$('exportWorkspacePanelButton').disabled, 'Viewing a non-current workspace should keep workspace export enabled.');
      assertUiSmoke($('exportDiagnosticsButton').disabled, 'Viewing a non-current workspace should disable local diagnostics export controls.');
      assertUiSmoke($('diagnosticLogUrlsInput').disabled, 'Viewing a non-current workspace should disable diagnostics privacy settings.');
      assertUiSmoke($('diagnosticsPrivacySummary').textContent.includes('Switch to this workspace'), 'Non-current workspace diagnostics controls should explain the switch requirement.');
      assertUiSmoke(!$('switchWorkspacePanelButton').hidden, 'Workspace details should render the switch action.');
      assertUiSmoke(!document.getElementById('renameWorkspacePanelButton'), 'Workspace details should rely on inline title rename instead of a rename button.');
      let diagnosticsExported = false;
      window.__postmeterDiagnostics = {
        export: async () => {
          diagnosticsExported = true;
          return { cancelled: true };
        }
      };
      setStatus('Ready.');
      await exportDiagnostics();
      assertUiSmoke(!diagnosticsExported, 'Workspace-panel diagnostics export should block while viewing a non-current workspace.');
      assertStatusIncludes('Switch to this workspace before exporting local diagnostics', 'Non-current workspace diagnostics export should explain the switch requirement.');
      setStatus('Ready.');
      await handleAppMenuAction('export-diagnostics');
      assertUiSmoke(diagnosticsExported, 'Help-menu diagnostics export should target the current workspace while viewing a non-current workspace.');
      assertUiSmoke(lastStatusMessage === 'Ready.', 'Cancelled Help-menu diagnostics export should leave status unchanged while viewing a non-current workspace.');
      selectSidebarPanel('collections');
      setStatus('Ready.');
      diagnosticsExported = false;
      await exportDiagnostics();
      assertUiSmoke(diagnosticsExported, 'Help-menu diagnostics export should use the current workspace after leaving a non-current workspace view.');
      assertUiSmoke(lastStatusMessage === 'Ready.', 'Cancelled Help-menu diagnostics export should leave status unchanged after leaving a non-current workspace view.');
      selectSidebarPanel('workspaces');
      const renamedWorkspaceButtonAgain = Array.from($('workspacesList').querySelectorAll('button'))
        .find((button) => button.textContent.includes('Renamed Workspace'));
      assertUiSmoke(renamedWorkspaceButtonAgain, 'Workspace list did not rerender the renamed workspace button.');
      renamedWorkspaceButtonAgain.click();
      await switchWorkspace(renamedWorkspaceId, { focus: 'workspace' });
      assertUiSmoke(activeWorkspaceId === renamedWorkspaceId, 'Switching workspaces should update the active workspace id.');
      assertUiSmoke(selectedWorkspaceId === renamedWorkspaceId, 'Switching workspaces should keep the selected workspace in view.');
      assertUiSmoke(workspace.collections.length === 0, 'Switching workspaces should load the selected workspace contents.');
      const deletePromise = deleteWorkspace(renamedWorkspaceId);
      await resolveConfirmActionModal('Workspace delete should use the in-app confirmation modal.');
      await deletePromise;
      assertUiSmoke(workspaceListItems().length === 1, 'Deleting a workspace should remove it from the managed workspace list.');
      assertUiSmoke($('deleteWorkspacePanelButton').disabled, 'Workspace delete should disable again when one workspace remains.');
    } finally {
      window.__postmeterSaveWorkspace = originalSaveWorkspace;
      window.__postmeterDiagnostics = originalDiagnostics;
      workspace.collections = [];
      workspace.environments = [];
      activeEnvironmentId = 'none';
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();
    }
  }

  async function resolveTextInputModal(value, message) {
    await nextPaint();
    assertUiSmoke(!$('textInputModal').hidden, message);
    const controlId = $('textInputModal').dataset.valueControl || 'textInputModalInput';
    const control = $(controlId);
    assertUiSmoke(control && !control.hidden, 'Text input modal did not expose the active input control.');
    control.value = value;
    $('confirmTextInputModalButton').click();
  }

  async function resolveConfirmActionModal(message) {
    await nextPaint();
    assertUiSmoke(!$('confirmActionModal').hidden, message);
    $('confirmActionButton').click();
  }

  async function cancelConfirmActionModal(message) {
    await nextPaint();
    assertUiSmoke(!$('confirmActionModal').hidden, message);
    $('cancelConfirmActionButton').click();
  }

  function sandboxPanelButton(containerId, label) {
    return Array.from($(containerId).querySelectorAll('button'))
      .find((button) => button.getAttribute('aria-label') === label);
  }

  async function assertWorkspaceSandboxAccessibilitySmoke() {
    const originalWorkspace = structuredClone(workspace);
    const originalSidebarPanel = activeSidebarPanel;
    const originalMainPanel = activeMainPanel;
    const originalActiveCollectionId = activeCollectionId;
    const originalActiveRequestId = activeRequestId;
    const originalSelectedWorkspaceId = selectedWorkspaceId;
    const originalSaveSettings = window.__postmeterSaveWorkspaceSettings;
    const originalFetchSandboxPackage = window.__postmeterFetchSandboxPackage;
    const originalVault = window.__postmeterVault;
    try {
      workspace.collections = [{
        id: 'sandbox-a11y-collection',
        name: 'Sandbox A11y',
        requests: [{
          id: 'sandbox-a11y-request',
          name: 'Sandbox A11y Request',
          method: 'GET',
          url: 'https://example.test',
          scripts: { preRequest: "pm.require('npm:sample-package@1.0.0');", tests: '' },
          postman: {
            fileReferences: [{ source: 'fixture-data.csv', mode: 'file', key: 'upload' }]
          }
        }],
        folders: [],
        variables: []
      }];
      workspace.settings ||= {};
      workspace.settings.sandbox ||= {};
      workspace.settings.sandbox.packageCache = [{
        specifier: 'npm:cached-package@1.0.0',
        integrity: 'sha256-smoke',
        reviewedAt: '2026-01-01T00:00:00.000Z',
        source: 'module.exports = {};'
      }];
      workspace.settings.sandbox.fileBindings = [{
        source: 'bound-data.csv',
        localPath: '/tmp/bound-data.csv',
        mode: 'file',
        reviewedAt: '2026-01-01T00:00:00.000Z'
      }];
      activeSidebarPanel = 'workspaces';
      activeMainPanel = 'workspace';
      selectedWorkspaceId = activeWorkspaceId;
      renderWorkspacePanel();
      assertUiSmoke($('sandboxPackageMissingList').querySelector('[aria-label="Review sandbox package npm:sample-package@1.0.0"]'), 'Missing package review action should expose a package-specific accessible label.');
      assertUiSmoke($('sandboxPackageMissingList').querySelector('[aria-label="Fetch sandbox package npm:sample-package@1.0.0 for review"]'), 'Missing package fetch action should expose a package-specific accessible label.');
      assertUiSmoke($('sandboxPackageCacheList').querySelector('[aria-label="Remove reviewed sandbox package npm:cached-package@1.0.0"]'), 'Cached package remove action should expose a package-specific accessible label.');
      assertUiSmoke($('sandboxFileBindingMissingList').querySelector('[aria-label="Bind imported file fixture-data.csv"]'), 'Missing file binding action should expose a file-specific accessible label.');
      assertUiSmoke($('sandboxFileBindingList').querySelector('[aria-label="Remove imported file binding bound-data.csv"]'), 'Bound file remove action should expose a file-specific accessible label.');

      window.__postmeterSaveWorkspaceSettings = async (settings) => ({ settings: structuredClone(settings) });

      const addPromise = addSandboxPackageFromPrompt('npm:sample-package@1.0.0');
      await resolveTextInputModal('npm:sample-package@1.0.0', 'Package review should prompt for the package specifier.');
      await resolveTextInputModal('module.exports = { smoke: true };', 'Package review should prompt for reviewed source.');
      await resolveTextInputModal('npm:dependency@1.0.0', 'Package review should prompt for reviewed dependencies.');
      await addPromise;
      assertUiSmoke(workspace.settings.sandbox.packageCache.some((item) => item.specifier === 'npm:sample-package@1.0.0'), 'Reviewed package should be added after settings save succeeds.');

      window.__postmeterFetchSandboxPackage = async () => ({
        dependencies: ['npm:dependency@1.0.0'],
        entrypoint: 'index.js',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        files: [],
        integrity: 'sha256-fetched',
        packageDependencies: [],
        packageIntegrity: 'sha256-package',
        packageJson: { name: 'fetched-package', version: '1.0.0' },
        packageName: 'fetched-package',
        packageVersion: '1.0.0',
        registry: 'npm',
        source: 'module.exports = { fetched: true };',
        sourceUrl: 'https://registry.npmjs.org/fetched-package'
      });
      const fetchPromise = fetchSandboxPackageFromPrompt('npm:fetched-package@1.0.0');
      await resolveTextInputModal('npm:fetched-package@1.0.0', 'Package fetch should prompt for the package specifier.');
      await resolveTextInputModal('module.exports = { fetched: true };', 'Package fetch should prompt for reviewed source.');
      await resolveTextInputModal('npm:dependency@1.0.0', 'Package fetch should prompt for reviewed dependencies.');
      await fetchPromise;
      assertUiSmoke(workspace.settings.sandbox.packageCache.some((item) => item.specifier === 'npm:fetched-package@1.0.0'), 'Fetched package should be cached after review and settings save.');

      const cancelPackageRemove = sandboxPanelButton('sandboxPackageCacheList', 'Remove reviewed sandbox package npm:cached-package@1.0.0');
      assertUiSmoke(cancelPackageRemove, 'Cached package remove button should be present for cancellation smoke.');
      cancelPackageRemove.click();
      await cancelConfirmActionModal('Package removal cancellation should use the in-app confirmation modal.');
      await waitForStatusIncludes('Reviewed package removal cancelled.', 'Cancelled package removal should surface a visible status.');
      assertUiSmoke(workspace.settings.sandbox.packageCache.some((item) => item.specifier === 'npm:cached-package@1.0.0'), 'Cancelled package removal should leave the reviewed package cached.');

      const confirmPackageRemove = sandboxPanelButton('sandboxPackageCacheList', 'Remove reviewed sandbox package npm:cached-package@1.0.0');
      assertUiSmoke(confirmPackageRemove, 'Cached package remove button should be present for success smoke.');
      confirmPackageRemove.click();
      await resolveConfirmActionModal('Package removal should use the in-app confirmation modal.');
      await waitForStatusIncludes('Reviewed package npm:cached-package@1.0.0 removed from the sandbox cache.', 'Successful package removal should surface a visible status.');
      assertUiSmoke(!workspace.settings.sandbox.packageCache.some((item) => item.specifier === 'npm:cached-package@1.0.0'), 'Successful package removal should remove the reviewed package from settings.');

      window.__postmeterSaveWorkspaceSettings = async () => {
        throw new Error('settings persistence failed');
      };
      const failedPackageRemove = sandboxPanelButton('sandboxPackageCacheList', 'Remove reviewed sandbox package npm:sample-package@1.0.0');
      assertUiSmoke(failedPackageRemove, 'Cached package remove button should be present for failure rollback smoke.');
      failedPackageRemove.click();
      await resolveConfirmActionModal('Failed package removal should still use the in-app confirmation modal.');
      await waitForStatusIncludes('Reviewed package removal failed: settings persistence failed', 'Failed package removal should surface a visible recovery status.');
      assertUiSmoke(workspace.settings.sandbox.packageCache.some((item) => item.specifier === 'npm:sample-package@1.0.0'), 'Failed package removal should roll back the reviewed package cache.');
      window.__postmeterSaveWorkspaceSettings = async (settings) => ({ settings: structuredClone(settings) });

      const bindPromise = bindSandboxFileFromPrompt('fixture-data.csv');
      await resolveTextInputModal('fixture-data.csv', 'File binding should prompt for the imported file reference.');
      await resolveTextInputModal('/tmp/fixture-data.csv', 'File binding should prompt for the reviewed local file path.');
      await bindPromise;
      assertUiSmoke(workspace.settings.sandbox.fileBindings.some((item) => item.source === 'fixture-data.csv'), 'Reviewed file binding should be added after settings save succeeds.');
      $('refreshSandboxFilesButton').click();
      assertStatusIncludes('1 imported file attachment bound. 0 attachment references need local binding.', 'File-binding refresh should report bound and missing counts through the app status.');

      const cancelFileRemove = sandboxPanelButton('sandboxFileBindingList', 'Remove imported file binding bound-data.csv');
      assertUiSmoke(cancelFileRemove, 'Bound file remove button should be present for cancellation smoke.');
      cancelFileRemove.click();
      await cancelConfirmActionModal('File-binding removal cancellation should use the in-app confirmation modal.');
      await waitForStatusIncludes('Imported file binding removal cancelled.', 'Cancelled file-binding removal should surface a visible status.');
      assertUiSmoke(workspace.settings.sandbox.fileBindings.some((item) => item.source === 'bound-data.csv'), 'Cancelled file-binding removal should leave the binding in settings.');

      const confirmFileRemove = sandboxPanelButton('sandboxFileBindingList', 'Remove imported file binding bound-data.csv');
      assertUiSmoke(confirmFileRemove, 'Bound file remove button should be present for success smoke.');
      confirmFileRemove.click();
      await resolveConfirmActionModal('File-binding removal should use the in-app confirmation modal.');
      await waitForStatusIncludes('Imported file binding removed for bound-data.csv.', 'Successful file-binding removal should surface a visible status.');
      assertUiSmoke(!workspace.settings.sandbox.fileBindings.some((item) => item.source === 'bound-data.csv'), 'Successful file-binding removal should remove the binding from settings.');

      window.__postmeterSaveWorkspaceSettings = async () => {
        throw new Error('settings persistence failed');
      };
      const failedFileRemove = sandboxPanelButton('sandboxFileBindingList', 'Remove imported file binding fixture-data.csv');
      assertUiSmoke(failedFileRemove, 'Bound file remove button should be present for failure rollback smoke.');
      failedFileRemove.click();
      await resolveConfirmActionModal('Failed file-binding removal should still use the in-app confirmation modal.');
      await waitForStatusIncludes('Imported file binding removal failed: settings persistence failed', 'Failed file-binding removal should surface a visible recovery status.');
      assertUiSmoke(workspace.settings.sandbox.fileBindings.some((item) => item.source === 'fixture-data.csv'), 'Failed file-binding removal should roll back the binding settings.');
      window.__postmeterSaveWorkspaceSettings = async (settings) => ({ settings: structuredClone(settings) });

      lastVaultMetadata = { available: true, secrets: [{ key: 'api-token', updatedAt: '2026-01-01T00:00:00.000Z' }], audit: [] };
      lastVaultMetadataWorkspaceId = activeWorkspaceId || '';
      renderWorkspacePanel();
      assertUiSmoke($('sandboxVaultList').querySelector('[aria-label="Remove vault secret api-token"]'), 'Vault secret remove action should expose a secret-specific accessible label.');

      let vaultBoundKey = '';
      let vaultUnsetKey = '';
      let vaultReset = false;
      window.__postmeterVault = {
        bindSecret: async (key) => { vaultBoundKey = key; },
        metadata: async () => lastVaultMetadata,
        reset: async () => { vaultReset = true; },
        unsetSecret: async (key) => { vaultUnsetKey = key; }
      };
      const bindVaultPromise = bindVaultSecretFromPrompt();
      await resolveTextInputModal('api-token', 'Vault binding should prompt for a secret key.');
      await resolveTextInputModal('local-secret-value', 'Vault binding should prompt for a secret value.');
      await bindVaultPromise;
      assertUiSmoke(vaultBoundKey === 'api-token', 'Vault binding should call the parent-side vault API.');

      const unsetPromise = unsetVaultSecret('api-token');
      await resolveConfirmActionModal('Vault secret removal should use the in-app confirmation modal.');
      await unsetPromise;
      assertUiSmoke(vaultUnsetKey === 'api-token', 'Vault removal should call the parent-side vault API.');

      const resetPromise = resetVaultFromWorkspacePanel();
      await resolveConfirmActionModal('Vault reset should use the in-app confirmation modal.');
      await resetPromise;
      assertUiSmoke(vaultReset, 'Vault reset should call the parent-side vault API.');

      const previousCapabilities = structuredClone(workspace.settings.sandbox.trustedCapabilities);
      window.__postmeterSaveWorkspaceSettings = async () => {
        throw new Error('settings persistence failed');
      };
      $('trustedScriptVaultInput').checked = !previousCapabilities.vault;
      await setTrustedScriptCapabilitiesFromInputs();
      assertUiSmoke(
        JSON.stringify(workspace.settings.sandbox.trustedCapabilities) === JSON.stringify(previousCapabilities),
        'Failed sandbox capability save should roll back the in-memory trusted capability state.'
      );
      assertStatusIncludes('Script sandbox capability update failed', 'Failed sandbox capability save should surface a user-visible status.');
    } finally {
      window.__postmeterSaveWorkspaceSettings = originalSaveSettings;
      window.__postmeterFetchSandboxPackage = originalFetchSandboxPackage;
      window.__postmeterVault = originalVault;
      lastVaultMetadata = null;
      lastVaultMetadataWorkspaceId = null;
      workspace = originalWorkspace;
      activeSidebarPanel = originalSidebarPanel;
      activeMainPanel = originalMainPanel;
      activeCollectionId = originalActiveCollectionId;
      activeRequestId = originalActiveRequestId;
      selectedWorkspaceId = originalSelectedWorkspaceId;
      renderAll();
    }
  }

  async function assertLargeWorkspaceBudgetSmoke() {
    const originalWorkspace = structuredClone(workspace);
    const originalWorkspaces = structuredClone(workspaces);
    const originalActiveCollectionId = activeCollectionId;
    const originalActiveFolderId = activeFolderId;
    const originalActiveRequestId = activeRequestId;
    const originalActiveWorkspaceId = activeWorkspaceId;
    const originalSelectedWorkspaceId = selectedWorkspaceId;
    const originalSidebarPanel = activeSidebarPanel;
    const originalMainPanel = activeMainPanel;
    const originalOpenRequestTabs = structuredClone(openRequestTabs);
    try {
      workspace = largeUiWorkspace();
      workspaces = [{
        id: 'Large Workspace.json',
        name: 'Large Workspace',
        path: '/tmp/Large Workspace.json',
        current: true,
        deletable: false,
        schemaVersion: 11,
        theme: 'system',
        collectionCount: workspace.collections.length,
        folderCount: 30,
        requestCount: 390,
        environmentCount: 0,
        cookieCount: 0,
        historyCount: 0
      }];
      activeWorkspaceId = 'Large Workspace.json';
      selectedWorkspaceId = 'Large Workspace.json';
      activeSidebarPanel = 'collections';
      activeMainPanel = 'request';
      activeCollectionId = workspace.collections[0].id;
      activeFolderId = null;
      activeRequestId = workspace.collections[0].requests[0].id;
      openRequestTabs = [];

      const renderStarted = performance.now();
      renderAll();
      await nextPaint();
      const renderMillis = performance.now() - renderStarted;
      assertUiSmoke(renderMillis <= 6000, `Large collection tree render exceeded budget: ${renderMillis.toFixed(1)}ms.`);
      assertUiSmoke(
        $('collectionsTree').querySelectorAll('.request-node').length === 390,
        'Large collection tree did not render every request node.'
      );

      const targetRequestId = 'large-request-29-1-3';
      const targetButton = Array.from($('collectionsTree').querySelectorAll('.request-node .tree-item'))
        .find((button) => button.textContent.includes('Large Request 29.1.3'));
      assertUiSmoke(targetButton, 'Large workspace target request was not rendered.');
      const openStarted = performance.now();
      targetButton.click();
      await nextPaint();
      const openMillis = performance.now() - openStarted;
      assertUiSmoke(openMillis <= 3000, `Large request open exceeded budget: ${openMillis.toFixed(1)}ms.`);
      assertUiSmoke(activeRequestId === targetRequestId, 'Large request open did not select the target request.');
      assertUiSmoke($('requestNameTitle').textContent === 'Large Request 29.1.3', 'Large request open did not populate the editor title.');
    } finally {
      workspace = originalWorkspace;
      workspaces = originalWorkspaces;
      activeCollectionId = originalActiveCollectionId;
      activeFolderId = originalActiveFolderId;
      activeRequestId = originalActiveRequestId;
      activeWorkspaceId = originalActiveWorkspaceId;
      selectedWorkspaceId = originalSelectedWorkspaceId;
      activeSidebarPanel = originalSidebarPanel;
      activeMainPanel = originalMainPanel;
      openRequestTabs = originalOpenRequestTabs;
      renderAll();
    }
  }

  function largeUiWorkspace() {
    return {
      schemaVersion: 11,
      collections: Array.from({ length: 30 }, (_unused, collectionIndex) => ({
        id: `large-collection-${collectionIndex}`,
        name: `Large Collection ${collectionIndex}`,
        description: '',
        variables: [],
        certificates: [],
        requests: Array.from({ length: 5 }, (_requestUnused, requestIndex) => largeUiRequest(collectionIndex, 'root', requestIndex)),
        folders: Array.from({ length: 2 }, (_folderUnused, folderIndex) => ({
          id: `large-folder-${collectionIndex}-${folderIndex}`,
          name: `Large Folder ${collectionIndex}.${folderIndex}`,
          requests: Array.from({ length: 4 }, (_requestUnused, requestIndex) => largeUiRequest(collectionIndex, folderIndex, requestIndex)),
          folders: []
        }))
      })),
      environments: [],
      globals: [],
      cookies: [],
      history: [],
      settings: {
        appearance: { theme: 'system' },
        sandbox: {
          fileBindings: [],
          packageCache: [],
          trustedCapabilities: {
            sendRequest: true,
            cookies: true,
            vault: false,
            vaultGrants: {
              workspace: false,
              collections: [],
              requests: [],
              deniedCollections: [],
              deniedRequests: []
            }
          }
        },
        updates: { includePrereleases: false }
      }
    };
  }

  function largeUiRequest(collectionIndex, folderIndex, requestIndex) {
    return {
      id: `large-request-${collectionIndex}-${folderIndex}-${requestIndex}`,
      name: `Large Request ${collectionIndex}.${folderIndex}.${requestIndex}`,
      method: requestIndex % 2 === 0 ? 'GET' : 'POST',
      url: `https://large.example.test/${collectionIndex}/${folderIndex}/${requestIndex}`,
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: { type: 'none' },
      assertions: [],
      scripts: { preRequest: '', tests: '' },
      variables: [],
      examples: [],
      cookieJar: { enabled: false, storeResponses: true }
    };
  }

  async function assertEditorCollectionSmoke() {
    workspace.collections = [];
    workspace.environments = [];
    activeEnvironmentId = 'none';
    clearActiveWorkspaceItem();
    resetRequestTabs();
    renderAll();

    const collection = newCollection();
    const request = newRequest(collection.id, null);
    editRequestTitle('Pending Navigation Request', { commit: false });
    selectSidebarPanel('workspaces');
    assertUiSmoke(request.name === 'Pending Navigation Request', 'Switching sidebar panels should collect the active request editor before rerendering.');

    selectSidebarPanel('collections');
    const firstEnvironment = newEnvironment();
    const secondEnvironment = newEnvironment();
    activeEnvironmentId = firstEnvironment.id;
    ensureOpenEnvironmentTabForActive();
    renderAll();
    editEnvironmentTitle('Pending Environment Rename', { commit: false });
    const secondEnvironmentButton = Array.from($('environmentsList').querySelectorAll('button'))
      .find((button) => button.textContent.includes(secondEnvironment.name));
    assertUiSmoke(secondEnvironmentButton, 'Environment list did not render the second environment for navigation smoke.');
    secondEnvironmentButton.click();
    assertUiSmoke(
      workspace.environments.find((item) => item.id === firstEnvironment.id)?.name === 'Pending Environment Rename',
      'Selecting a different environment should collect the current environment editor before rerendering.'
    );
  }

  async function assertSidebarTreeDragSmoke() {
    const originalWorkspace = structuredClone(workspace);
    const originalWorkspaces = structuredClone(workspaces);
    const originalActiveCollectionId = activeCollectionId;
    const originalActiveFolderId = activeFolderId;
    const originalActiveRequestId = activeRequestId;
    const originalActiveEnvironmentId = activeEnvironmentId;
    const originalActiveRunnerConfigId = activeRunnerConfigId;
    const originalActiveRunnerRequestRunnerId = activeRunnerRequestRunnerId;
    const originalActiveWorkspaceId = activeWorkspaceId;
    const originalSelectedWorkspaceId = selectedWorkspaceId;
    const originalSidebarPanel = activeSidebarPanel;
    const originalMainPanel = activeMainPanel;
    const originalOpenRequestTabs = structuredClone(openRequestTabs);
    const originalEnvironmentTabs = structuredClone(openEnvironmentTabs);
    const originalRunnerTabs = structuredClone(openRunnerTabs);
    const originalWorkspaceTabs = structuredClone(openWorkspaceTabs);
    const originalSessionPersistenceEnabled = sessionPersistenceEnabled;
    const originalSaveWorkspace = window.__postmeterSaveWorkspace;
    const originalSaveSession = window.__postmeterSaveSession;
    const savedPayloads = [];
    let savedSession = null;
    try {
      const dragRequest = newRequestObject('Drag Saved Request');
      dragRequest.id = 'drag-request-saved';
      dragRequest.url = 'https://saved-drag.example.test';
      const siblingRequest = newRequestObject('Drag Sibling Request');
      siblingRequest.id = 'drag-request-sibling';
      siblingRequest.url = 'https://sibling-drag.example.test';
      const targetRequest = newRequestObject('Drag Target Request');
      targetRequest.id = 'drag-request-target';
      targetRequest.url = 'https://target-drag.example.test';
      const folderRequest = newRequestObject('Drag Folder Request');
      folderRequest.id = 'drag-folder-request';
      folderRequest.url = 'https://folder-drag.example.test';
      const folder = {
        id: 'drag-folder-a',
        name: 'Drag Folder A',
        requests: [folderRequest],
        folders: []
      };
      const siblingFolder = {
        id: 'drag-folder-b',
        name: 'Drag Folder B',
        requests: [],
        folders: []
      };
      workspace = {
        schemaVersion: 11,
        collections: [
          {
            id: 'drag-collection-a',
            name: 'Drag Collection A',
            description: '',
            variables: [],
            certificates: [],
            requests: [dragRequest, siblingRequest],
            folders: [folder]
          },
          {
            id: 'drag-collection-b',
            name: 'Drag Collection B',
            description: '',
            variables: [],
            certificates: [],
            requests: [targetRequest],
            folders: [siblingFolder]
          }
        ],
        environments: [
          { id: 'drag-environment-a', name: 'Drag Environment A', variables: [] },
          { id: 'drag-environment-b', name: 'Drag Environment B', variables: [] }
        ],
        runners: [
          { id: 'drag-runner-a', name: 'Drag Runner A', environmentId: 'none', requests: [] },
          { id: 'drag-runner-b', name: 'Drag Runner B', environmentId: 'none', requests: [] }
        ],
        globals: [],
        cookies: [],
        history: [],
        settings: {
          appearance: { theme: 'system' },
          updates: { includePrereleases: false },
          tabs: { saveOnForceClose: false }
        }
      };
      workspaces = [
        { id: 'drag-workspace-a.json', name: 'Drag Workspace A', current: true, deletable: false },
        { id: 'drag-workspace-b.json', name: 'Drag Workspace B', current: false, deletable: true }
      ];
      activeWorkspaceId = 'drag-workspace-a.json';
      selectedWorkspaceId = 'drag-workspace-a.json';
      activeSidebarPanel = 'collections';
      activeMainPanel = 'request';
      activeCollectionId = 'drag-collection-a';
      activeFolderId = null;
      activeRequestId = dragRequest.id;
      activeEnvironmentId = 'none';
      activeRunnerConfigId = null;
      activeRunnerRequestRunnerId = null;
      resetRequestTabs();
      ensureOpenRequestTabForActive();
      window.__postmeterSaveWorkspace = async (nextWorkspace) => {
        savedPayloads.push(structuredClone(nextWorkspace));
        return nextWorkspace;
      };
      sessionPersistenceEnabled = true;
      window.__postmeterSaveSession = async (session) => {
        savedSession = structuredClone(session);
        return session;
      };
      renderAll();

      for (const [kind, id] of [
        ['collection', 'drag-collection-a'],
        ['request', dragRequest.id],
        ['folder', folder.id],
        ['environment', 'drag-environment-a'],
        ['runner', 'drag-runner-a'],
        ['workspace', 'drag-workspace-a.json']
      ]) {
        const button = treeButtonByTarget(kind, id);
        assertUiSmoke(button?.draggable === true, `${kind} tree item should be draggable.`);
        assertUiSmoke(treeDropBarByTarget(kind, id, 'before'), `${kind} tree item should render a hidden before-drop bar.`);
      }
      assertUiSmoke($('environmentsList').querySelectorAll('.tree-drop-bar').length === workspace.environments.length + 1, 'Environment list should render one drop bar per insertion point.');
      assertUiSmoke(treeDropBarByTarget('environment', 'drag-environment-b', 'after'), 'Environment list should render one trailing after-drop bar.');
      sidebarTreeDragPayload = { kind: 'environment', id: 'drag-environment-b' };
      const environmentTargetButton = treeButtonByTarget('environment', 'drag-environment-a');
      const environmentBeforeBar = treeDropBarByTarget('environment', 'drag-environment-a', 'before');
      const environmentAfterBar = treeDropBarByTarget('environment', 'drag-environment-b', 'before');
      environmentBeforeBar.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true }));
      assertUiSmoke(environmentBeforeBar.classList.contains('is-drop-target'), 'Dragging over a hidden drop bar should highlight that bar.');
      assertUiSmoke(!environmentTargetButton.classList.contains('is-drop-target'), 'Dragging over a drop target should not highlight the tree item itself.');
      environmentAfterBar.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true }));
      assertUiSmoke(environmentAfterBar.classList.contains('is-drop-target'), 'Dragging over a different hidden drop bar should move the highlighted placement bar.');
      assertUiSmoke(!environmentBeforeBar.classList.contains('is-drop-target'), 'Only one sidebar drop bar should be highlighted at a time.');
      const environmentTargetRect = environmentTargetButton.getBoundingClientRect();
      if (environmentTargetRect.height > 4) {
        environmentTargetButton.dispatchEvent(new MouseEvent('dragover', {
          bubbles: true,
          cancelable: true,
          clientY: environmentTargetRect.top + 1
        }));
        assertUiSmoke(environmentBeforeBar.classList.contains('is-drop-target'), 'Dragging over the upper half of a tree item should highlight its before bar.');
        environmentTargetButton.dispatchEvent(new MouseEvent('dragover', {
          bubbles: true,
          cancelable: true,
          clientY: environmentTargetRect.bottom - 1
        }));
        assertUiSmoke(environmentAfterBar.classList.contains('is-drop-target'), 'Dragging over the lower half of a tree item should highlight its after bar.');
      }
      clearSidebarTreeDropTargets();
      sidebarTreeDragPayload = null;
      assertUiSmoke(
        !canDropSidebarTreeItem(
          { kind: 'collection', id: 'drag-collection-a' },
          { kind: 'folder', id: folder.id }
        ),
        'Collections should not be droppable into folders.'
      );

      await moveTopLevelTreeItem(
        { kind: 'environment', id: 'drag-environment-b' },
        { kind: 'environment', id: 'drag-environment-a' },
        'before'
      );
      assertUiSmoke(workspace.environments.map((item) => item.id).join('|') === 'drag-environment-b|drag-environment-a', 'Environment drag reorder did not update the in-memory order.');
      assertUiSmoke(savedPayloads.at(-1)?.environments?.map((item) => item.id).join('|') === 'drag-environment-b|drag-environment-a', 'Environment drag reorder did not save the new order.');

      await moveTopLevelTreeItem(
        { kind: 'runner', id: 'drag-runner-b' },
        { kind: 'runner', id: 'drag-runner-a' },
        'before'
      );
      assertUiSmoke(workspace.runners.map((item) => item.id).join('|') === 'drag-runner-b|drag-runner-a', 'Runner drag reorder did not update the in-memory order.');
      assertUiSmoke(savedPayloads.at(-1)?.runners?.map((item) => item.id).join('|') === 'drag-runner-b|drag-runner-a', 'Runner drag reorder did not save the new order.');

      await moveTopLevelTreeItem(
        { kind: 'collection', id: 'drag-collection-b' },
        { kind: 'collection', id: 'drag-collection-a' },
        'before'
      );
      assertUiSmoke(workspace.collections.map((item) => item.id).join('|') === 'drag-collection-b|drag-collection-a', 'Collection drag reorder did not update the in-memory order.');
      assertUiSmoke(savedPayloads.at(-1)?.collections?.map((item) => item.id).join('|') === 'drag-collection-b|drag-collection-a', 'Collection drag reorder did not save the new order.');

      await moveTopLevelTreeItem(
        { kind: 'workspace', id: 'drag-workspace-b.json' },
        { kind: 'workspace', id: 'drag-workspace-a.json' },
        'before'
      );
      assertUiSmoke(workspaces.map((item) => item.id).join('|') === 'drag-workspace-b.json|drag-workspace-a.json', 'Workspace drag reorder did not update the managed workspace order.');
      assertUiSmoke(savedSession?.workspaceOrder?.join('|') === 'drag-workspace-b.json|drag-workspace-a.json', 'Workspace drag reorder did not save the session workspace order.');

      selectRequestTab(openRequestTabs.find((tab) => tab.requestId === dragRequest.id));
      $('urlInput').value = 'https://dirty-drag.example.test';
      dispatchInput($('urlInput'));
      const dirtyTab = openRequestTabs.find((tab) => tab.requestId === dragRequest.id);
      assertUiSmoke(dirtyTab?.dirty === true, 'Editing the drag request should mark its tab dirty before moving it.');
      const saveCallsBeforeRequestMove = savedPayloads.length;
      await moveCollectionTreeItem(
        { kind: 'request', id: dragRequest.id },
        { kind: 'collection', id: 'drag-collection-b' },
        'after'
      );
      assertUiSmoke(savedPayloads.length === saveCallsBeforeRequestMove + 1, 'Moving a request should save the structural collection change.');
      const liveTargetCollection = workspace.collections.find((item) => item.id === 'drag-collection-b');
      const liveSourceCollection = workspace.collections.find((item) => item.id === 'drag-collection-a');
      assertUiSmoke(!liveSourceCollection.requests.some((request) => request.id === dragRequest.id), 'Moving a request should remove it from the source collection.');
      assertUiSmoke(liveTargetCollection.requests.some((request) => request.id === dragRequest.id), 'Moving a request should add it to the target collection.');
      assertUiSmoke(liveTargetCollection.requests.find((request) => request.id === dragRequest.id)?.url === 'https://dirty-drag.example.test', 'Moving a dirty request should keep the dirty editor state in memory.');
      const savedAfterRequestMove = savedPayloads.at(-1);
      const savedTargetCollection = savedAfterRequestMove.collections.find((item) => item.id === 'drag-collection-b');
      const savedSourceCollection = savedAfterRequestMove.collections.find((item) => item.id === 'drag-collection-a');
      const savedMovedRequest = savedTargetCollection.requests.find((request) => request.id === dragRequest.id);
      assertUiSmoke(!savedSourceCollection.requests.some((request) => request.id === dragRequest.id), 'Structural request move should save removal from the source collection.');
      assertUiSmoke(savedMovedRequest?.url === 'https://saved-drag.example.test', 'Structural request move should not save dirty request editor fields.');
      assertUiSmoke(dirtyTab.collectionId === 'drag-collection-b', 'Moving an open request should retarget its open tab collection.');
      assertUiSmoke(dirtyTab.key === `request:drag-collection-b:${dragRequest.id}`, 'Moving an open request should retarget its open tab key.');
      assertUiSmoke(dirtyTab.dirty === true, 'Moving an open dirty request should keep the tab dirty.');

      await moveCollectionTreeItem(
        { kind: 'request', id: targetRequest.id },
        { kind: 'request', id: dragRequest.id },
        'after'
      );
      assertUiSmoke(
        liveTargetCollection.requests.map((request) => request.id).slice(-2).join('|') === `${dragRequest.id}|${targetRequest.id}`,
        'Dragging a request within a collection should reorder it relative to another request.'
      );
      assertUiSmoke(
        savedPayloads.at(-1).collections.find((item) => item.id === 'drag-collection-b').requests.map((request) => request.id).slice(-2).join('|') === `${dragRequest.id}|${targetRequest.id}`,
        'Request reorder should save the new request order.'
      );

      const saveCallsBeforeFolderMove = savedPayloads.length;
      await moveCollectionTreeItem(
        { kind: 'folder', id: folder.id },
        { kind: 'collection', id: 'drag-collection-b' },
        'after'
      );
      assertUiSmoke(savedPayloads.length === saveCallsBeforeFolderMove + 1, 'Moving a folder should save the structural collection change.');
      assertUiSmoke(!liveSourceCollection.folders.some((item) => item.id === folder.id), 'Moving a folder should remove it from the source collection.');
      assertUiSmoke(liveTargetCollection.folders.some((item) => item.id === folder.id), 'Moving a folder should add it to the target collection.');
      assertUiSmoke(
        savedPayloads.at(-1).collections.find((item) => item.id === 'drag-collection-b').folders.some((item) => item.id === folder.id),
        'Folder move should save the target collection folder membership.'
      );
      await moveCollectionTreeItem(
        { kind: 'folder', id: siblingFolder.id },
        { kind: 'folder', id: folder.id },
        'before'
      );
      assertUiSmoke(
        liveTargetCollection.folders.map((item) => item.id).slice(-2).join('|') === `${siblingFolder.id}|${folder.id}`,
        'Dragging a folder within a collection should reorder it relative to another folder.'
      );
      await moveCollectionTreeItem(
        { kind: 'folder', id: folder.id },
        { kind: 'request', id: targetRequest.id },
        'before'
      );
      assertUiSmoke(
        sidebarTreeChildEntries(liveTargetCollection).map((entry) => `${entry.kind}:${entry.value.id}`).slice(0, 3).join('|') === `request:${dragRequest.id}|folder:${folder.id}|request:${targetRequest.id}`,
        'Dragging a folder relative to a request should preserve mixed request/folder order.'
      );
      assertUiSmoke(
        savedPayloads.at(-1).collections.find((item) => item.id === 'drag-collection-b').postman.itemOrder.map((entry) => `${entry.kind}:${entry.id}`).slice(0, 3).join('|') === `request:${dragRequest.id}|folder:${folder.id}|request:${targetRequest.id}`,
        'Mixed request/folder order should be saved in the collection item order.'
      );

      renderCollections();
      sidebarTreeDragPayload = { kind: 'request', id: targetRequest.id };
      const folderButton = treeButtonByTarget('folder', folder.id);
      const folderWrapper = folderButton.closest('.folder-node');
      folderButton.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true }));
      assertUiSmoke(folderWrapper.classList.contains('is-folder-drop-target'), 'Dragging a request into a folder should highlight the whole folder subtree.');
      assertUiSmoke(!document.querySelector('.tree-drop-bar.is-drop-target'), 'Dragging a request into a folder should not highlight an insertion bar.');
      folderButton.dispatchEvent(new MouseEvent('dragleave', { bubbles: true, cancelable: true }));
      assertUiSmoke(folderWrapper.classList.contains('is-folder-drop-target'), 'Folder drop highlight should remain stable across child dragleave events.');
      clearSidebarTreeDropTargets();
      Object.defineProperty(folderButton, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 100, bottom: 130, height: 30, left: 0, right: 160, width: 160 })
      });
      const folderBeforeBar = treeDropBarByTarget('folder', folder.id, 'before');
      folderButton.dispatchEvent(new MouseEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientY: 101
      }));
      assertUiSmoke(folderBeforeBar.classList.contains('is-drop-target'), 'Dragging over the top edge of a folder should still allow before-folder placement.');
      assertUiSmoke(!folderWrapper.classList.contains('is-folder-drop-target'), 'Dragging over the top edge of a folder should not select the folder as the drop container.');
      folderButton.dispatchEvent(new MouseEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientY: 129
      }));
      assertUiSmoke(folderWrapper.classList.contains('is-folder-drop-target'), 'Dragging over the lower edge of a folder should keep the item inside the folder.');
      assertUiSmoke(!document.querySelector('.tree-drop-bar.is-drop-target'), 'Dragging over the lower edge of a folder should not activate the after-folder insertion bar.');
      clearSidebarTreeDropTargets();
      sidebarTreeDragPayload = null;

      await moveCollectionTreeItem(
        { kind: 'request', id: targetRequest.id },
        { kind: 'folder', id: folder.id },
        'inside'
      );
      assertUiSmoke(!liveTargetCollection.requests.some((request) => request.id === targetRequest.id), 'Dropping a request inside a folder should remove it from the parent request list.');
      assertUiSmoke(folder.requests.some((request) => request.id === targetRequest.id), 'Dropping a request inside a folder should add it to the folder request list.');

      renderCollections();
      sidebarTreeDragPayload = { kind: 'request', id: dragRequest.id };
      const nestedFolderWrapper = treeButtonByTarget('folder', folder.id)?.closest('.folder-node');
      const nestedFolderDropBar = treeDropBarByTarget('request', targetRequest.id, 'before');
      assertUiSmoke(nestedFolderWrapper && nestedFolderDropBar, 'Folder request drop smoke setup did not render nested request insertion targets.');
      nestedFolderDropBar.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true }));
      assertUiSmoke(nestedFolderDropBar.classList.contains('is-drop-target'), 'Dragging between requests inside a folder should highlight the insertion bar.');
      assertUiSmoke(nestedFolderWrapper.classList.contains('is-folder-drop-target'), 'Dragging between requests inside a folder should highlight the containing folder subtree.');
      nestedFolderDropBar.dispatchEvent(new MouseEvent('dragleave', { bubbles: true, cancelable: true }));
      assertUiSmoke(nestedFolderDropBar.classList.contains('is-drop-target'), 'Nested insertion bar highlight should remain stable across child dragleave events.');
      assertUiSmoke(nestedFolderWrapper.classList.contains('is-folder-drop-target'), 'Nested folder highlight should remain stable across child dragleave events.');
      clearSidebarTreeDropTargets();
      sidebarTreeDragPayload = null;

      assertUiSmoke(
        !canDropSidebarTreeItem(
          { kind: 'folder', id: folder.id },
          { kind: 'request', id: targetRequest.id }
        ),
        'Folders should not be droppable relative to requests contained inside themselves.'
      );
    } finally {
      workspace = originalWorkspace;
      workspaces = originalWorkspaces;
      activeCollectionId = originalActiveCollectionId;
      activeFolderId = originalActiveFolderId;
      activeRequestId = originalActiveRequestId;
      activeEnvironmentId = originalActiveEnvironmentId;
      activeRunnerConfigId = originalActiveRunnerConfigId;
      activeRunnerRequestRunnerId = originalActiveRunnerRequestRunnerId;
      activeWorkspaceId = originalActiveWorkspaceId;
      selectedWorkspaceId = originalSelectedWorkspaceId;
      activeSidebarPanel = originalSidebarPanel;
      activeMainPanel = originalMainPanel;
      openRequestTabs = originalOpenRequestTabs;
      openEnvironmentTabs = originalEnvironmentTabs;
      openRunnerTabs = originalRunnerTabs;
      openWorkspaceTabs = originalWorkspaceTabs;
      sessionPersistenceEnabled = originalSessionPersistenceEnabled;
      window.__postmeterSaveWorkspace = originalSaveWorkspace;
      window.__postmeterSaveSession = originalSaveSession;
      renderAll();
    }
  }

  function assertOauthProgressSmoke() {
    activateTab('request', 'auth');
    $('authTypeSelect').value = 'oauth2';
    dispatchChange($('authTypeSelect'));
    renderOauthProgress({
      type: 'pkce',
      status: 'waitingForAuthorization',
      message: 'Waiting for authorization callback.',
      redirectUri: 'http://127.0.0.1:12345/oauth/callback'
    });
    assertUiSmoke(!$('oauthProgressPanel').hidden, 'OAuth progress panel did not render.');
    assertUiSmoke($('oauthProgressStatus').textContent.includes('Authorization code'), 'PKCE OAuth status was not rendered.');
    assertUiSmoke($('oauthProgressDetail').textContent.includes('Redirect URI'), 'PKCE redirect detail was not rendered.');
    renderOauthProgress({
      type: 'device',
      status: 'polling',
      message: 'Waiting for device authorization.',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://example.test/device'
    });
    assertUiSmoke($('oauthProgressStatus').textContent.includes('Device code'), 'Device OAuth status was not rendered.');
    assertUiSmoke($('oauthProgressDetail').textContent.includes('ABCD-EFGH'), 'Device OAuth user code was not rendered.');
  }

  async function assertValidationErrorSmoke() {
    $('urlInput').value = 'not a url';
    dispatchInput($('urlInput'));
    await sendActiveRequest();
    assertStatusIncludes('Fix validation errors', 'Invalid request did not track validation status.');
    assertUiSmoke($('validationLabel').textContent.length > 0, 'Invalid request did not render validation details.');
  }

  async function assertRequestSendFailureSmoke() {
    const originalValidate = window.__postmeterValidateRequest;
    const originalSend = window.__postmeterSendRequest;
    try {
      $('urlInput').value = 'https://api.example.test/failure';
      dispatchInput($('urlInput'));
      window.__postmeterValidateRequest = async () => [];
      window.__postmeterSendRequest = async () => {
        throw new Error('mocked send failure');
      };
      await sendActiveRequest();
      assertStatusIncludes('Request failed: mocked send failure', 'Failed send did not update status with an actionable error.');
      assertUiSmoke($('responseStatus').textContent === 'ERR', 'Failed send did not mark the response status as ERR.');
      assertUiSmoke($('responseBody').value.includes('mocked send failure'), 'Failed send did not show the error in the response body.');
    } finally {
      window.__postmeterValidateRequest = originalValidate;
      window.__postmeterSendRequest = originalSend;
    }
  }

  async function assertExportCancellationSmoke() {
    const originalExportExamples = window.__postmeterExportExamples;
    const originalImportWorkspace = window.__postmeterImportWorkspace;
    const originalExportCollection = window.__postmeterExportCollection;
    const originalImportCollection = window.__postmeterImportCollection;
    const originalExportWorkspace = window.__postmeterExportWorkspace;
    const originalSaveWorkspace = window.__postmeterSaveWorkspace;
    const originalDiagnostics = window.__postmeterDiagnostics;
    try {
      let exportedExampleCount = 0;
      window.__postmeterExportExamples = async (request) => {
        exportedExampleCount = request.examples?.length || 0;
        return { cancelled: true };
      };
      setStatus('Ready.');
      await exportRequestExamples();
      assertUiSmoke(exportedExampleCount > 0, 'Example export did not pass examples to the export boundary.');
      assertUiSmoke(lastStatusMessage === 'Ready.', 'Cancelled example export should leave the current status unchanged.');

      window.__postmeterExportExamples = async () => {
        throw new Error('mocked example export failure');
      };
      lastUserNotification = null;
      await exportRequestExamples();
      assertUiSmoke(lastStatusMessage === 'Example export failed.', 'Failed example export should update visible status.');
      assertUiSmoke(lastUserNotification?.title === 'Example Export Failed', 'Failed example export should show a popup notification.');
      assertUiSmoke(lastUserNotification?.message.includes('mocked example export failure'), 'Failed example export popup should include the error message.');

      let exportedFormat = '';
      window.__postmeterExportCollection = async (_collection, format) => {
        exportedFormat = format;
        return { cancelled: true };
      };
      setStatus('Ready.');
      await exportCollection(activeCollection(), 'openapi');
      assertUiSmoke(exportedFormat === 'openapi', 'Collection export did not pass the selected format.');
      assertUiSmoke(lastStatusMessage === 'Ready.', 'Cancelled collection export should leave the current status unchanged.');

      const collectionCount = workspace.collections.length;
      window.__postmeterImportWorkspace = async () => {
        throw new Error('mocked workspace import failure');
      };
      await importWorkspace();
      assertStatusIncludes('Workspace import failed: mocked workspace import failure', 'Failed workspace import did not update status with an actionable error.');
      assertUiSmoke(workspace.collections.length === collectionCount, 'Failed workspace import should not clobber the active workspace.');

      window.__postmeterSaveWorkspace = async (nextWorkspace) => nextWorkspace;
      window.__postmeterExportWorkspace = async () => {
        throw new Error('mocked workspace export failure');
      };
      await exportWorkspace();
      assertStatusIncludes('Workspace export failed: mocked workspace export failure', 'Failed workspace export did not update status with an actionable error.');

      window.__postmeterImportCollection = async () => {
        throw new Error('mocked collection import failure');
      };
      await importCollection();
      assertStatusIncludes('Collection import failed: mocked collection import failure', 'Failed collection import did not update status with an actionable error.');
      assertUiSmoke(workspace.collections.length === collectionCount, 'Failed collection import should not mutate collections.');

      window.__postmeterExportCollection = async () => {
        throw new Error('mocked collection export failure');
      };
      await exportCollection(activeCollection(), 'postmeter');
      assertStatusIncludes('Collection export failed: mocked collection export failure', 'Failed collection export did not update status with an actionable error.');

      window.__postmeterDiagnostics = { export: async () => ({ cancelled: true }) };
      setStatus('Ready.');
      await exportDiagnostics();
      assertUiSmoke(lastStatusMessage === 'Ready.', 'Cancelled diagnostics export should leave the current status unchanged.');

      let releaseDiagnosticsSave;
      let exportCalledAfterSave = false;
      pendingDiagnosticsSettingsSave = new Promise((resolve) => {
        releaseDiagnosticsSave = resolve;
      });
      window.__postmeterDiagnostics = {
        export: async () => {
          exportCalledAfterSave = true;
          return { cancelled: true };
        }
      };
      const pendingExport = exportDiagnostics();
      await nextPaint();
      assertUiSmoke(!exportCalledAfterSave, 'Diagnostics export should wait for pending privacy-setting saves.');
      assertStatusIncludes('Saving diagnostics privacy settings before export', 'Diagnostics export should surface pending privacy-setting saves.');
      releaseDiagnosticsSave(true);
      await pendingExport;
      assertUiSmoke(exportCalledAfterSave, 'Diagnostics export should continue after pending privacy-setting saves succeed.');
      pendingDiagnosticsSettingsSave = null;

      window.__postmeterDiagnostics = { export: async () => ({ path: '/tmp/postmeter-diagnostics.json' }) };
      lastUserNotification = null;
      await exportDiagnostics();
      assertStatusIncludes('Local diagnostics exported to /tmp/postmeter-diagnostics.json. Review before sharing.', 'Successful diagnostics export should show a review-before-sharing status.');
      assertUiSmoke(lastUserNotification?.title === 'Local Diagnostics Exported', 'Successful diagnostics export should show a popup notification.');

      window.__postmeterDiagnostics = {
        export: async () => {
          throw new Error('mocked diagnostics export failure');
        }
      };
      lastUserNotification = null;
      await exportDiagnostics();
      assertStatusIncludes('Diagnostics export failed: mocked diagnostics export failure', 'Failed diagnostics export did not update visible status.');
      assertUiSmoke(lastUserNotification?.title === 'Diagnostics Export Failed', 'Failed diagnostics export should show a popup notification.');
    } finally {
      window.__postmeterExportExamples = originalExportExamples;
      window.__postmeterImportWorkspace = originalImportWorkspace;
      window.__postmeterExportCollection = originalExportCollection;
      window.__postmeterImportCollection = originalImportCollection;
      window.__postmeterExportWorkspace = originalExportWorkspace;
      window.__postmeterSaveWorkspace = originalSaveWorkspace;
      window.__postmeterDiagnostics = originalDiagnostics;
      pendingDiagnosticsSettingsSave = null;
    }
  }

  async function assertOauthFlowSmoke() {
    const originalStartPkce = window.__postmeterStartPkceFlow;
    const originalStartDevice = window.__postmeterStartDeviceFlow;
    const originalSaveWorkspace = window.__postmeterSaveWorkspace;
    try {
      window.__postmeterSaveWorkspace = async (nextWorkspace) => nextWorkspace;
      activateTab('request', 'auth');
      $('authTypeSelect').value = 'oauth2';
      dispatchChange($('authTypeSelect'));
      $('authOauthGrantTypeSelect').value = 'authorizationCode';
      dispatchChange($('authOauthGrantTypeSelect'));
      $('authOauthAuthorizationUrlInput').value = 'https://auth.example.test/authorize';
      dispatchInput($('authOauthAuthorizationUrlInput'));
      $('authOauthTokenUrlInput').value = 'https://auth.example.test/token';
      dispatchInput($('authOauthTokenUrlInput'));
      $('authOauthClientIdInput').value = 'client-id';
      dispatchInput($('authOauthClientIdInput'));
      window.__postmeterStartPkceFlow = async (id, auth, _environment, strategy) => {
        assertUiSmoke(Boolean(id), 'PKCE flow did not create an active flow ID.');
        assertUiSmoke(auth.grantType === 'authorizationCode', 'PKCE flow did not pass authorization-code auth.');
        assertUiSmoke(strategy === $('authOauthRedirectStrategySelect').value, 'PKCE flow did not pass redirect strategy.');
        return { auth: { ...auth, accessToken: 'pkce-token', expiresAt: new Date(Date.now() + 60_000).toISOString() } };
      };
      await startPkceFlow();
      assertUiSmoke($('authOauthAccessTokenInput').value === 'pkce-token', 'PKCE completion did not render the returned access token.');
      assertStatusIncludes('OAuth authorization completed', 'PKCE completion did not complete cleanly.');

      $('authOauthGrantTypeSelect').value = 'deviceCode';
      dispatchChange($('authOauthGrantTypeSelect'));
      $('authOauthDeviceAuthorizationUrlInput').value = 'https://auth.example.test/device';
      dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
      window.__postmeterStartDeviceFlow = async () => {
        throw new Error('mocked device failure');
      };
      await startDeviceFlow();
      assertStatusIncludes('OAuth device authorization failed', 'Device-code failure did not fail cleanly.');
      assertUiSmoke($('validationLabel').textContent.includes('mocked device failure'), 'Device-code failure did not render error details.');
    } finally {
      window.__postmeterStartPkceFlow = originalStartPkce;
      window.__postmeterStartDeviceFlow = originalStartDevice;
      window.__postmeterSaveWorkspace = originalSaveWorkspace;
    }
  }

  function assertToolbarMenuSmoke(buttonId, menuId, expectedLabels, options = {}) {
    const button = $(buttonId);
    const menu = $(menuId);
    button.click();
    assertUiSmoke(menu.hidden === false, `${menuId} did not open.`);
    assertUiSmoke(button.getAttribute('aria-expanded') === 'true', `${buttonId} did not update aria-expanded.`);
    const topLevelItems = getToolbarMenuTopLevelItems(menu);
    const labels = topLevelItems.map((item) => item.textContent.trim());
    for (const label of expectedLabels) {
      assertUiSmoke(labels.includes(label), `${menuId} missing ${label}.`);
    }
    if (options.submenuLabels) {
      const submenuLabels = Array.from(menu.querySelectorAll('.toolbar-submenu button')).map((item) => item.textContent.trim());
      for (const label of options.submenuLabels) {
        assertUiSmoke(submenuLabels.includes(label), `${menuId} submenu missing ${label}.`);
      }
    }
    closeToolbarMenus();
    assertUiSmoke(menu.hidden === true, `${menuId} did not close.`);
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }));
    assertUiSmoke(menu.hidden === false, `${menuId} did not open from keyboard.`);
    const enabledItems = getToolbarMenuTopLevelItems(menu).filter((item) => !item.disabled);
    assertUiSmoke(document.activeElement === enabledItems[0], `${menuId} should focus the first item when opened from keyboard.`);
    enabledItems[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }));
    if (enabledItems.length > 1) {
      assertUiSmoke(document.activeElement === enabledItems[1], `${menuId} should support arrow-key item navigation.`);
      enabledItems[1].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'End' }));
      assertUiSmoke(document.activeElement === enabledItems.at(-1), `${menuId} should support End key item navigation.`);
    } else {
      assertUiSmoke(document.activeElement === enabledItems[0], `${menuId} should keep focus on its only enabled item.`);
      enabledItems[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'End' }));
      assertUiSmoke(document.activeElement === enabledItems[0], `${menuId} should keep End navigation bounded to its only item.`);
    }
    if (options.submenuLabels) {
      const submenuTrigger = enabledItems.find((item) => item.getAttribute('aria-haspopup') === 'menu');
      assertUiSmoke(submenuTrigger, `${menuId} should expose submenu categories.`);
      submenuTrigger.focus();
      submenuTrigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }));
      const submenu = submenuTrigger.parentElement?.querySelector?.('.toolbar-submenu');
      const submenuItems = Array.from(submenu?.querySelectorAll('button:not([disabled])') || []);
      assertUiSmoke(document.activeElement === submenuItems[0], `${menuId} should move into submenu items with ArrowRight.`);
      submenuItems[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowLeft' }));
      assertUiSmoke(document.activeElement === submenuTrigger, `${menuId} should return from submenu items with ArrowLeft.`);
      enabledItems.at(-1).focus();
    }
    enabledItems.at(-1).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }));
    if (enabledItems.length > 1) {
      assertUiSmoke(
        document.activeElement === enabledItems.at(-2),
        `${menuId} should navigate relative to the focused enabled menu item.`
      );
      enabledItems.at(-2).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    } else {
      assertUiSmoke(document.activeElement === enabledItems[0], `${menuId} should keep reverse navigation bounded to its only item.`);
      enabledItems[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    }
    assertUiSmoke(menu.hidden === true, `${menuId} should close on Escape.`);
    assertUiSmoke(document.activeElement === button, `${menuId} should restore focus to its trigger on Escape.`);
  }

  function getToolbarMenuTopLevelItems(menu) {
    return Array.from(menu.children).flatMap((child) => {
      if (child.matches?.('button')) {
        return [child];
      }
      if (child.matches?.('.toolbar-submenu-row')) {
        const parentButton = child.querySelector(':scope > button');
        return parentButton ? [parentButton] : [];
      }
      return [];
    });
  }

  function assertToolbarMenuKeyboardActivationSmoke() {
    const originalWorkspace = structuredClone(workspace);
    const originalStatus = lastStatusMessage;
    try {
      workspace.collections = [];
      activeEnvironmentId = 'none';
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();
      const trigger = $('newMenuButton');
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }));
      assertUiSmoke(!$('newMenu').hidden, 'Toolbar activation smoke should open the New menu from the keyboard.');
      assertUiSmoke(document.activeElement === $('newWorkspaceMenuButton'), 'Toolbar activation smoke should focus the first New menu action.');
      $('newWorkspaceMenuButton').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }));
      const item = $('newRequestButton');
      assertUiSmoke(document.activeElement === item, 'Toolbar activation smoke should navigate to the Request action.');
      item.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
      assertUiSmoke($('newMenu').hidden, 'Keyboard toolbar menu activation should close the menu.');
      assertUiSmoke(Boolean(activeRequest()), 'Keyboard toolbar menu activation should run the focused action.');
      assertUiSmoke(document.activeElement === trigger, 'Keyboard toolbar menu activation should restore focus to the trigger when the action does not move focus.');
    } finally {
      workspace = originalWorkspace;
      activeEnvironmentId = 'none';
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();
      setStatus(originalStatus);
    }
  }

  function assertContextMenuKeyboardActivationSmoke() {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = 'Context activation trigger';
    let activated = false;
    document.body.append(trigger);
    try {
      trigger.focus();
      showContextMenu(16, 16, [
        ['Run action', () => {
          activated = true;
        }]
      ], { focusFirst: true, trigger });
      const item = $('contextMenu').querySelector('button');
      assertUiSmoke(document.activeElement === item, 'Context activation smoke should focus the first item.');
      item.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
      assertUiSmoke(activated, 'Keyboard context menu activation should run the focused action.');
      assertUiSmoke($('contextMenu').hidden, 'Keyboard context menu activation should close the menu.');
      assertUiSmoke(document.activeElement === trigger, 'Keyboard context menu activation should restore focus to the trigger.');
    } finally {
      closeContextMenu();
      trigger.remove();
    }
  }

  async function assertTreeContextMenuModalFocusSmoke() {
    const originalWorkspace = structuredClone(workspace);
    const originalActiveCollectionId = activeCollectionId;
    const originalActiveFolderId = activeFolderId;
    const originalActiveRequestId = activeRequestId;
    const originalActiveEnvironmentId = activeEnvironmentId;
    const originalActiveMainPanel = activeMainPanel;
    const originalActiveSidebarPanel = activeSidebarPanel;
    const originalOpenRequestTabs = structuredClone(openRequestTabs);
    const originalOpenEnvironmentTabs = structuredClone(openEnvironmentTabs);
    const originalOpenWorkspaceTabs = structuredClone(openWorkspaceTabs);
    try {
      workspace.collections = [];
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();

      const renameCollectionTarget = newCollection();
      renameCollectionTarget.name = 'Focus Collection';
      renderAll();
      const renameButton = treeButtonByTarget('collection', renameCollectionTarget.id);
      assertUiSmoke(renameButton, 'Tree focus smoke did not render the rename target collection.');
      renameButton.focus();
      openKeyboardContextMenu(renameButton);
      activateContextMenuItem('Rename');
      await resolveTextInputModal('Focus Collection Renamed', 'Collection rename should use the in-app text input modal.');
      await nextPaint();
      const renamedButton = treeButtonByTarget('collection', renameCollectionTarget.id);
      assertUiSmoke(renamedButton?.textContent.includes('Focus Collection Renamed'), 'Collection rename did not rerender the replacement tree button.');
      assertUiSmoke(document.activeElement === renamedButton, 'Collection rename should restore focus to the replacement tree button.');

      const fallbackCollection = newCollection();
      fallbackCollection.name = 'Focus Fallback Collection';
      const deleteCollectionTarget = newCollection();
      deleteCollectionTarget.name = 'Focus Delete Collection';
      renderAll();
      const deleteButton = treeButtonByTarget('collection', deleteCollectionTarget.id);
      assertUiSmoke(deleteButton, 'Tree focus smoke did not render the delete target collection.');
      deleteButton.focus();
      openKeyboardContextMenu(deleteButton);
      activateContextMenuItem('Delete');
      await resolveConfirmActionModal('Collection delete should use the in-app confirmation modal.');
      await nextPaint();
      assertUiSmoke(!treeButtonByTarget('collection', deleteCollectionTarget.id), 'Collection delete should remove the target tree button.');
      assertUiSmoke(
        document.activeElement?.matches?.('.tree-item[data-tree-kind], .sidebar-tab'),
        'Collection delete should restore focus to a live tree item or stable sidebar tab.'
      );
      assertUiSmoke(document.activeElement?.isConnected, 'Collection delete focus target should still be connected.');

      const requestCollection = newCollection();
      requestCollection.name = 'Request Focus Collection';
      const renameRequestTarget = newRequest(requestCollection.id, null);
      renameRequestTarget.name = 'Focus Request';
      renderAll();
      const requestRenameButton = treeButtonByTarget('request', renameRequestTarget.id);
      assertUiSmoke(requestRenameButton, 'Tree focus smoke did not render the rename target request.');
      requestRenameButton.focus();
      openKeyboardContextMenu(requestRenameButton);
      activateContextMenuItem('Rename');
      await nextPaint();
      const requestTitle = $('requestNameTitle');
      assertUiSmoke(document.activeElement === requestTitle, 'Request rename should focus the inline request title.');
      assertUiSmoke(requestTitle.getAttribute('contenteditable') === 'plaintext-only', 'Request rename should make the request title editable inline.');
      assertUiSmoke($('textInputModal').hidden, 'Request rename should not use the text input modal.');
      requestTitle.textContent = 'Focus Request Renamed';
      dispatchInput(requestTitle);
      requestTitle.dispatchEvent(new Event('blur'));
      await nextPaint();
      const renamedRequestButton = treeButtonByTarget('request', renameRequestTarget.id);
      assertUiSmoke(renamedRequestButton?.textContent.includes('Focus Request Renamed'), 'Request rename did not rerender the replacement tree button.');
      assertUiSmoke(renameRequestTarget.name === 'Focus Request Renamed', 'Request inline rename did not update the request model.');

      const deleteRequestTarget = newRequest(requestCollection.id, null);
      deleteRequestTarget.name = 'Focus Delete Request';
      renderAll();
      const requestDeleteButton = treeButtonByTarget('request', deleteRequestTarget.id);
      assertUiSmoke(requestDeleteButton, 'Tree focus smoke did not render the delete target request.');
      requestDeleteButton.focus();
      openKeyboardContextMenu(requestDeleteButton);
      activateContextMenuItem('Delete');
      await resolveConfirmActionModal('Request delete should use the in-app confirmation modal.');
      await nextPaint();
      assertUiSmoke(!treeButtonByTarget('request', deleteRequestTarget.id), 'Request delete should remove the target tree button.');
      assertUiSmoke(
        document.activeElement?.matches?.('.tree-item[data-tree-kind], .sidebar-tab'),
        'Request delete should restore focus to a live tree item or stable sidebar tab.'
      );
      assertUiSmoke(document.activeElement?.isConnected, 'Request delete focus target should still be connected.');
    } finally {
      workspace = originalWorkspace;
      activeCollectionId = originalActiveCollectionId;
      activeFolderId = originalActiveFolderId;
      activeRequestId = originalActiveRequestId;
      activeEnvironmentId = originalActiveEnvironmentId;
      activeMainPanel = originalActiveMainPanel;
      activeSidebarPanel = originalActiveSidebarPanel;
      openRequestTabs = originalOpenRequestTabs;
      openEnvironmentTabs = originalOpenEnvironmentTabs;
      openWorkspaceTabs = originalOpenWorkspaceTabs;
      renderAll();
    }
  }

  function treeButtonByTarget(kind, id) {
    return document.querySelector(`.tree-item[data-tree-kind="${cssAttributeValue(kind)}"][data-tree-id="${cssAttributeValue(id)}"]`);
  }

  function treeDropBarByTarget(kind, id, position) {
    return Array.from(document.querySelectorAll('.tree-drop-bar')).find((bar) => (
      Array.isArray(bar.__postmeterDropCandidates)
      && bar.__postmeterDropCandidates.some((candidate) => (
        candidate?.target?.kind === kind
        && candidate.target.id === id
        && candidate.position === position
      ))
    )) || null;
  }

  function cssAttributeValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function openKeyboardContextMenu(button) {
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ContextMenu' }));
    assertUiSmoke(!$('contextMenu').hidden, 'Keyboard context menu should open for tree items.');
  }

  function openOpenTabContextMenu(tab) {
    assertUiSmoke(tab?.key, 'Open-tab context menu smoke needs a tab key.');
    renderRequestTabs();
    const button = document.querySelector(`[data-open-tab-key="${cssAttributeValue(tab.key)}"]`);
    assertUiSmoke(button, `Open-tab context menu trigger missing for ${tab.key}.`);
    button.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 240,
      clientY: 120
    }));
    assertUiSmoke(!$('contextMenu').hidden, 'Right-clicking an open tab should show the tab context menu.');
    return button;
  }

  function activateContextMenuItem(label) {
    const item = Array.from($('contextMenu').querySelectorAll('button'))
      .find((button) => button.textContent.trim() === label);
    assertUiSmoke(item, `Context menu item ${label} should be present.`);
    item.focus();
    item.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
  }

  function assertStatusIncludes(text, message) {
    assertUiSmoke(lastStatusMessage.includes(text), message);
  }

  function editEnvironmentTitle(value, options = {}) {
    const title = $('environmentMainTitle');
    title.click();
    title.textContent = value;
    dispatchInput(title);
    if (options.commit !== false) {
      title.dispatchEvent(new Event('blur'));
    }
  }

  function editRequestTitle(value, options = {}) {
    const title = $('requestNameTitle');
    title.click();
    title.textContent = value;
    dispatchInput(title);
    if (options.commit !== false) {
      title.dispatchEvent(new Event('blur'));
    }
  }

  function pressEditableTitleEnter(title) {
    title.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }));
  }

  async function editWorkspaceTitle(value, options = {}) {
    const title = $('workspaceMainTitle');
    title.click();
    title.textContent = value;
    dispatchInput(title);
    if (options.commit !== false) {
      title.dispatchEvent(new Event('blur'));
    }
    if (typeof options.waitFor === 'function') {
      await waitForUiSmoke(options.waitFor, options.message || 'Workspace title edit did not settle.', 3000, global);
    }
  }

  async function waitForStatusIncludes(text, message) {
    await waitForUiSmoke(
      () => lastStatusMessage.includes(text),
      `${message} Internal app status did not update.`,
      3000,
      global
    );
  }

  function assertMethodColorSmoke() {
    const rootStyle = getComputedStyle(document.documentElement);
    const methodColors = METHODS.map((method) => rootStyle.getPropertyValue(`--method-${method.toLowerCase()}`).trim());
    assertUiSmoke(new Set(methodColors).size === METHODS.length, 'HTTP method colors should be unique.');
    assertUiSmoke(rootStyle.getPropertyValue('--method-delete').trim(), 'DELETE method color is missing.');
    for (const method of METHODS) {
      $('methodSelect').value = method;
      dispatchChange($('methodSelect'));
      assertUiSmoke(
        $('methodSelect').classList.contains(methodClassName(method)),
        `${method} did not apply a method color class.`
      );
    }
    $('methodSelect').value = 'GET';
    dispatchChange($('methodSelect'));
  }

  async function assertSidebarPanelSmoke() {
    const originalEnvironments = structuredClone(workspace.environments || []);
    const originalCollections = structuredClone(workspace.collections || []);
    const originalHistory = structuredClone(workspace.history || []);
    const originalRunners = structuredClone(workspace.runners || []);
    const originalPerformanceTests = structuredClone(workspace.performanceTests || []);
    const originalActiveCollectionId = activeCollectionId;
    const originalActiveFolderId = activeFolderId;
    const originalActiveRequestId = activeRequestId;
    const originalActiveRunnerRequestRunnerId = activeRunnerRequestRunnerId;
    const originalActiveEnvironmentId = activeEnvironmentId;
    const originalActiveRunnerConfigId = activeRunnerConfigId;
    const originalActivePerformanceTestId = activePerformanceTestId;
    const originalActiveWorkspaceId = activeWorkspaceId;
    const originalSelectedWorkspaceId = selectedWorkspaceId;
    const originalSidebarPanel = activeSidebarPanel;
    const originalMainPanel = activeMainPanel;
    const originalRequestTabs = structuredClone(openRequestTabs);
    const originalEnvironmentTabs = structuredClone(openEnvironmentTabs);
    const originalWorkspaceTabs = structuredClone(openWorkspaceTabs);
    const originalRunnerTabs = structuredClone(openRunnerTabs);
    const originalPerformanceTabs = structuredClone(openPerformanceTabs);
    const originalPerformanceCalibrate = window.postmeter?.performance?.calibrate;
    const originalPerformanceCancelCalibration = window.postmeter?.performance?.cancelCalibration;
    try {
      assertUiSmoke(!$('environmentTab'), 'Environment request tab panel should be removed from the request editor.');
      assertUiSmoke(!document.querySelector('.tab[data-tab-group="request"][data-tab="environment"]'), 'Environment should not appear in the request tab row.');
      assertUiSmoke(!$('newEnvironmentButton'), 'Environments sidebar should not render its own New button.');
      assertUiSmoke($('newRunnerMenuButton'), 'Toolbar New menu should include Runner creation.');
      assertUiSmoke($('newPerformanceTestMenuButton'), 'Toolbar New menu should include Performance Test creation.');
      assertUiSmoke(!$('newRunnerButton'), 'Runner sidebar should not render its own New button.');
      assertUiSmoke($('emptyCreateRunnerButton')?.textContent === 'New Runner', 'Runner empty state should render a New Runner button.');
      assertUiSmoke($('emptyCreatePerformanceTestButton')?.textContent === 'New Performance Test', 'Performance empty state should render a New Performance Test button.');
      const sidebarOrder = Array.from(document.querySelectorAll('.sidebar-tab')).map((button) => button.dataset.sidebarPanel);
      assertUiSmoke(sidebarOrder.join('|') === 'collections|environments|workspaces|runners|performance|history', `Sidebar order was ${sidebarOrder.join('|')}.`);
      for (const panel of ['collections', 'environments', 'workspaces', 'runners', 'performance', 'history']) {
        assertUiSmoke(document.querySelector(`.sidebar-tab[data-sidebar-panel="${panel}"]`), `Sidebar tab missing ${panel}.`);
        selectSidebarPanel(panel);
        assertUiSmoke(!document.querySelector(`[data-sidebar-panel-content="${panel}"]`).hidden, `Sidebar panel ${panel} did not open.`);
      }
      workspace.environments = [];
      activeEnvironmentId = 'none';
      openEnvironmentTabs = [];
      openWorkspaceTabs = [];
      selectedWorkspaceId = '';
      workspace.runners = [];
      openRunnerTabs = [];
      activeRunnerConfigId = null;
      workspace.performanceTests = [];
      openPerformanceTabs = [];
      activePerformanceTestId = null;
      for (const expectation of [
        ['environmentsPanelTab', 'environment', 'environmentEmptyPanel', 'Create a new environment'],
        ['workspacesPanelTab', 'workspace', 'workspaceEmptyPanel', 'Select a workspace'],
        ['runnersPanelTab', 'runner', 'runnerEmptyPanel', 'Create a runner'],
        ['performancePanelTab', 'performance', 'performanceEmptyPanel', 'CREATE A PERFORMANCE TEST']
      ]) {
        const [tabId, expectedMainPanel, expectedEmptyPanel, expectedText] = expectation;
        $(tabId).click();
        assertUiSmoke(activeMainPanel === expectedMainPanel, `Clicking ${tabId} should switch the main pane to ${expectedMainPanel}.`);
        assertUiSmoke($('requestEditorPanel').hidden, `Clicking ${tabId} should hide the request editor.`);
        assertUiSmoke(document.querySelector('.results').hidden, `Clicking ${tabId} should hide the response panel.`);
        assertUiSmoke(!$(`${expectedEmptyPanel}`).hidden, `Clicking ${tabId} should show ${expectedEmptyPanel}.`);
        assertUiSmoke($(`${expectedEmptyPanel}`).textContent.includes(expectedText), `${expectedEmptyPanel} should render the expected empty-state text.`);
        assertUiSmoke(getComputedStyle($(`${expectedEmptyPanel}`)).display !== 'none', `${expectedEmptyPanel} should be visible in layout.`);
        for (const panelId of ['requestEmptyPanel', 'environmentEmptyPanel', 'workspaceEmptyPanel', 'runnerEmptyPanel', 'performanceEmptyPanel']) {
          if (panelId === expectedEmptyPanel) {
            continue;
          }
          assertUiSmoke($(panelId).hidden, `Clicking ${tabId} should keep ${panelId} hidden.`);
          assertUiSmoke(getComputedStyle($(panelId)).display === 'none', `Clicking ${tabId} should keep ${panelId} out of layout.`);
        }
      }
      if (window.postmeter?.performance) {
        let pendingCalibrationResolve = null;
        let startedCalibrationId = '';
        let cancelledCalibrationId = '';
        window.postmeter.performance.calibrate = async (calibrationId) => {
          startedCalibrationId = calibrationId;
          return await new Promise((resolve) => {
            pendingCalibrationResolve = resolve;
          });
        };
        window.postmeter.performance.cancelCalibration = async (calibrationId) => {
          cancelledCalibrationId = calibrationId;
          pendingCalibrationResolve?.({
            id: 'smoke-cancelled-calibration',
            startedAt: '2026-05-06T00:00:00.000Z',
            completedAt: '2026-05-06T00:00:01.000Z',
            durationMillis: 10,
            cancelled: true,
            endpoint: '127.0.0.1',
            summary: { peakRequestsPerSecond: 0, peakConcurrency: 0, reliableTargetRequestsPerSecond: 0, sustainedRequestsPerSecond: 0, recommendedMaxRequestsPerSecond: 0, repeatabilityPercent: 0, averageLatencyMillis: 0, p95LatencyMillis: 0, p95StartLagMillis: 0, p95EventLoopDelayMillis: 0, completedRequests: 0, failedRequests: 0, notes: ['cancelled'] },
            stages: []
          });
          return true;
        };
        $('calibratePerformanceButton').click();
        await waitForUiSmoke(() => !$('performanceCalibrationModal').hidden, 'Performance Calibrate should open the calibration modal.', 3000, global);
        assertUiSmoke($('performanceCalibrationBody').textContent.includes('Running extended local calibration'), 'Performance calibration modal should show a running state.');
        assertUiSmoke($('performanceCalibrationProgressBar'), 'Performance calibration modal should include a progress bar.');
        $('closePerformanceCalibrationModalButton').click();
        await waitForUiSmoke(() => cancelledCalibrationId === startedCalibrationId && $('performanceCalibrationModal').hidden, 'Closing calibration should cancel the active calibration.', 3000, global);

        window.postmeter.performance.calibrate = async () => ({
          id: 'smoke-complete-calibration',
          startedAt: '2026-05-06T00:00:00.000Z',
          completedAt: '2026-05-06T00:00:01.000Z',
          durationMillis: 1000,
          cancelled: false,
          endpoint: '127.0.0.1',
          summary: {
            peakRequestsPerSecond: 1234.5,
            peakConcurrency: 16,
            sustainedRequestsPerSecond: 1100,
            reliableTargetRequestsPerSecond: 1000,
            edgeUpperBoundRequestsPerSecond: 1200,
            measurementVariationPercent: 1,
            confirmationTargetsTested: 2,
            recommendedMaxRequestsPerSecond: 880,
            saturationConcurrency: 16,
            stabilityPercent: 92,
            repeatabilityPercent: 96,
            confidence: 'high',
            averageLatencyMillis: 2.5,
            p95LatencyMillis: 5,
            p95StartLagMillis: 3,
            p95EventLoopDelayMillis: 11,
            completedRequests: 100,
            failedRequests: 0,
            notes: ['Loopback calibration estimates this machine and PostMeter runtime overhead only.']
          },
          stages: [{
            name: 'Smoke stage',
            mode: 'confirmation',
            concurrency: 16,
            requestedRequests: 100,
            targetRequests: 100,
            targetRequestsPerSecond: 1000,
            startedRequests: 100,
            completedRequests: 100,
            onTimeCompletedRequests: 100,
            failedRequests: 0,
            durationMillis: 1000,
            targetDurationMillis: 1000,
            requestsPerSecond: 1234.5,
            completionRatio: 1,
            achievedTargetRatio: 1,
            errorRate: 0,
            averageLatencyMillis: 2.5,
            p95LatencyMillis: 5,
            p99LatencyMillis: 7,
            averageStartLagMillis: 1,
            p95StartLagMillis: 3,
            intervalCount: 2,
            medianIntervalRequestsPerSecond: 1200,
            minIntervalRequestsPerSecond: 1100,
            maxIntervalRequestsPerSecond: 1250,
            stabilityPercent: 92,
            eventLoopUtilizationPercent: 50,
            p95EventLoopDelayMillis: 11,
            maxInFlightRequests: 16,
            maxInFlightLimit: 16,
            maxStartBacklog: 1,
            confirmationTargetRequestsPerSecond: 1000,
            confirmationPass: 1,
            confirmationPasses: 1,
            confirmationCandidateRank: 1,
            confirmationVariationPercent: 1,
            accepted: true,
            confirmed: true,
            failureReasons: []
          }]
        });
        window.postmeter.performance.cancelCalibration = async () => false;
        $('calibratePerformanceButton').click();
        await waitForUiSmoke(() => $('performanceCalibrationBody').textContent.includes('Peak RPS'), 'Completed calibration should render summary results.', 3000, global);
        assertUiSmoke($('performanceCalibrationBody').textContent.includes('Peak RPS'), 'Calibration results should include peak RPS.');
        assertUiSmoke($('performanceCalibrationBody').textContent.includes('Max sustained local RPS'), 'Calibration results should include max sustained local RPS.');
        assertUiSmoke($('performanceCalibrationBody').textContent.includes('Planning cap'), 'Calibration results should include the planning cap.');
        assertUiSmoke(
          $('performanceCalibrationBody').querySelectorAll('.performance-calibration-stage').length >= 1,
          'Calibration results should include per-stage rows.'
        );
        $('closePerformanceCalibrationModalButton').click();
        await nextPaint();
      }
      $('emptyCreatePerformanceTestButton').click();
      const performanceTest = activePerformanceTest();
      assertUiSmoke(performanceTest, 'Performance empty state should create a performance test.');
      assertUiSmoke(activeMainPanel === 'performance', 'Creating a performance test should switch the main pane to performance mode.');
      assertUiSmoke(!$('performanceMainPanel').hidden, 'Creating a performance test should show the performance editor.');
      assertUiSmoke($('requestEditorPanel').hidden, 'Performance editor should not render inside the request editor pane.');
      assertUiSmoke(!$('performanceTypeSelect'), 'Performance editor should use type tabs instead of a type dropdown.');
      assertUiSmoke($('performanceMethodSelect').closest('.performance-request-line'), 'Performance request method should live in the request-style line.');
      assertUiSmoke($('performanceUrlInput').closest('.performance-request-line'), 'Performance request URL should live in the request-style line.');
      assertUiSmoke($('runPerformanceTestButton').closest('.performance-request-line'), 'Performance Run action should live next to the request URL.');
      assertUiSmoke($('performanceMethodSelect').classList.contains('method-get'), 'Performance request method dropdown should use the same method color class as requests.');
      assertUiSmoke($('importPerformanceRequestButton').closest('.performance-actions'), 'Performance import request action should live with the performance pane actions.');
      assertUiSmoke($('cancelPerformanceTestButton').previousElementSibling === $('runPerformanceTestButton'), 'Performance Cancel action should sit immediately after Run.');
      assertUiSmoke($('cancelPerformanceTestButton').classList.contains('danger-button'), 'Performance Cancel action should use danger styling.');
      assertUiSmoke(
        $('performanceSettingsResize').getAttribute('aria-orientation') === 'horizontal',
        'Performance request/settings splitter should expose horizontal separator semantics.'
      );
      $('performanceUrlInput').value = '{{perfHost}}/run';
      dispatchInput($('performanceUrlInput'));
      await nextPaint();
      assertVariableHighlight($('performanceUrlInput'), 'perfHost', 'Performance URL input should highlight environment variable tokens.');
      for (const [tabId, label] of [
        ['performanceRequestParamsTabButton', 'Params'],
        ['performanceRequestHeadersTabButton', 'Headers'],
        ['performanceRequestAuthTabButton', 'Auth'],
        ['performanceRequestCookiesTabButton', 'Cookies'],
        ['performanceRequestBodyTabButton', 'Body'],
        ['performanceRequestTestsTabButton', 'Tests'],
        ['performanceRequestScriptsTabButton', 'Scripts'],
        ['performanceRequestExamplesTabButton', 'Examples'],
        ['performanceRequestVariablesTabButton', 'Variables']
      ]) {
        assertUiSmoke($(tabId).getAttribute('role') === 'tab', `Performance request ${label} tab should expose role=tab.`);
      }
      $('addPerformanceParamButton').click();
      let performanceRowInputs = $('performanceParamsTable').querySelectorAll('input');
      assertUiSmoke(performanceRowInputs.length >= 3, 'Performance Params Add should create editable inputs.');
      performanceRowInputs[1].value = 'probe';
      dispatchInput(performanceRowInputs[1]);
      performanceRowInputs[2].value = '{{perfToken}}';
      dispatchInput(performanceRowInputs[2]);
      await nextPaint();
      assertVariableHighlight(performanceRowInputs[2], 'perfToken', 'Performance Params values should highlight environment variable tokens.');
      performanceRowInputs[2].value = 'enabled';
      dispatchInput(performanceRowInputs[2]);
      assertUiSmoke($('performanceUrlInput').value.includes('?probe=enabled'), 'Editing performance request params should update the performance request URL.');
      assertUiSmoke(highlightedTextboxText($('performanceUrlInput')).includes('?probe=enabled'), 'Editing performance request params should refresh the visible performance request URL text.');
      $('performanceParamsTable').querySelector('.kv-row button').click();
      assertUiSmoke($('performanceParamsTable').querySelectorAll('.kv-row').length === 0, 'Removing a performance request param should delete the Params row.');
      assertUiSmoke(!activePerformanceTest().request.queryParams.length, 'Removing a performance request param should delete it from the performance request model.');
      $('performanceUrlInput').value = 'https://performance.example.test/run?from=url';
      dispatchInput($('performanceUrlInput'));
      performanceRowInputs = $('performanceParamsTable').querySelectorAll('input');
      assertUiSmoke(performanceRowInputs[1].value === 'from' && performanceRowInputs[2].value === 'url', 'Editing the performance request URL should update the performance Params table.');
      performanceRowInputs[1].value = 'probe';
      dispatchInput(performanceRowInputs[1]);
      performanceRowInputs[2].value = 'enabled';
      dispatchInput(performanceRowInputs[2]);
      $('performanceRequestHeadersTabButton').click();
      $('addPerformanceHeaderButton').click();
      performanceRowInputs = $('performanceHeadersTable').querySelectorAll('input');
      assertUiSmoke(performanceRowInputs.length >= 3, `Performance Headers Add should create editable inputs, got ${performanceRowInputs.length}.`);
      performanceRowInputs[1].value = 'X-Perf';
      dispatchInput(performanceRowInputs[1]);
      performanceRowInputs[2].value = 'true';
      dispatchInput(performanceRowInputs[2]);
      $('performanceSendPostMeterTokenInput').checked = true;
      dispatchChange($('performanceSendPostMeterTokenInput'));
      $('performanceShowGeneratedHeadersInput').checked = true;
      dispatchChange($('performanceShowGeneratedHeadersInput'));
      await nextPaint();
      const performanceGeneratedHeaderNames = Array.from($('performanceHeadersTable').querySelectorAll('[data-generated-header="true"] input[aria-label^="Auto-generated"]'))
        .map((input) => input.value);
      assertUiSmoke(activePerformanceTest().request.autoHeaders.showGeneratedHeaders === true, 'Performance generated request header toggle should persist on the performance request copy.');
      assertUiSmoke(performanceGeneratedHeaderNames.includes('Accept'), `Performance generated request headers should show Accept when unhidden. Found: ${performanceGeneratedHeaderNames.join(', ')}`);
      assertUiSmoke(performanceGeneratedHeaderNames.includes('PostMeter-Token'), `Performance generated request headers should show opt-in PostMeter-Token when unhidden. Found: ${performanceGeneratedHeaderNames.join(', ')}`);
      $('performanceRequestAuthTabButton').click();
      $('performanceAuthTypeSelect').value = 'apiKey';
      dispatchChange($('performanceAuthTypeSelect'));
      $('performanceAuthApiKeyLocationSelect').value = 'header';
      dispatchChange($('performanceAuthApiKeyLocationSelect'));
      $('performanceAuthApiKeyNameInput').value = 'api_key';
      dispatchInput($('performanceAuthApiKeyNameInput'));
      $('performanceAuthApiKeyValueInput').value = 'secret';
      dispatchInput($('performanceAuthApiKeyValueInput'));
      await nextPaint();
      const performanceGeneratedHeadersAfterHeaderAuth = Array.from($('performanceHeadersTable').querySelectorAll('[data-generated-header="true"] input[aria-label^="Auto-generated"]'))
        .map((input) => input.value);
      assertUiSmoke(performanceGeneratedHeadersAfterHeaderAuth.includes('api_key'), `Performance generated request headers should update when Auth tab enables an API key header. Found: ${performanceGeneratedHeadersAfterHeaderAuth.join(', ')}`);
      $('performanceAuthApiKeyLocationSelect').value = 'query';
      dispatchChange($('performanceAuthApiKeyLocationSelect'));
      await nextPaint();
      const performanceGeneratedHeadersAfterQueryAuth = Array.from($('performanceHeadersTable').querySelectorAll('[data-generated-header="true"] input[aria-label^="Auto-generated"]'))
        .map((input) => input.value);
      assertUiSmoke(!performanceGeneratedHeadersAfterQueryAuth.includes('api_key'), `Performance generated request headers should update when Auth tab moves API key auth to query params. Found: ${performanceGeneratedHeadersAfterQueryAuth.join(', ')}`);
      assertUiSmoke(
        $('performanceAuthTab').querySelector('[data-auth-section="apiKey"]').classList.contains('active'),
        'Performance request Auth tab should show the selected auth section.'
      );
      $('performanceRequestBodyTabButton').click();
      $('performanceBodyTypeSelect').value = 'FORM_DATA';
      dispatchChange($('performanceBodyTypeSelect'));
      $('addPerformanceFormDataBodyRowButton').click();
      let performanceBodyRow = $('performanceFormDataBodyTable').querySelector('[data-body-form-data-row]');
      let performanceBodyControls = performanceBodyRow.querySelectorAll('select, input');
      performanceBodyControls[1].value = 'file';
      dispatchChange(performanceBodyControls[1]);
      performanceBodyControls[2].value = 'artifact';
      dispatchInput(performanceBodyControls[2]);
      performanceBodyControls[3].value = 'fixtures/performance.bin';
      dispatchInput(performanceBodyControls[3]);
      collectPerformanceTestFromEditor();
      assertUiSmoke(
        performanceTest.request.bodyType === 'FORM_DATA'
          && performanceTest.request.postmanBody?.formdata?.some((part) => part.key === 'artifact' && part.src === 'fixtures/performance.bin')
          && performanceTest.request.postman?.fileReferences?.some((reference) => reference.source === 'fixtures/performance.bin'),
        'Performance request Body tab should collect form-data file rows into the performance request copy.'
      );
      $('performanceBodyTypeSelect').value = 'URLENCODED';
      dispatchChange($('performanceBodyTypeSelect'));
      $('addPerformanceUrlencodedBodyRowButton').click();
      const performanceUrlencodedControls = $('performanceUrlencodedBodyTable').querySelector('[data-body-urlencoded-row]').querySelectorAll('input');
      performanceUrlencodedControls[1].value = 'perf';
      dispatchInput(performanceUrlencodedControls[1]);
      performanceUrlencodedControls[2].value = 'encoded';
      dispatchInput(performanceUrlencodedControls[2]);
      collectPerformanceTestFromEditor();
      assertUiSmoke(
        performanceTest.request.bodyType === 'URLENCODED'
          && performanceTest.request.postmanBody?.urlencoded?.some((part) => part.key === 'perf' && part.value === 'encoded'),
        'Performance request Body tab should collect x-www-form-urlencoded rows into the performance request copy.'
      );
      $('performanceBodyTypeSelect').value = 'BINARY';
      dispatchChange($('performanceBodyTypeSelect'));
      $('performanceBinaryBodySourceInput').value = '{{perfHost}}';
      dispatchInput($('performanceBinaryBodySourceInput'));
      await nextPaint();
      assertVariableHighlight($('performanceBinaryBodySourceInput'), 'perfHost', 'Performance binary file source fields should highlight environment variable tokens.');
      assertVariableHighlightUsesInputMetrics($('performanceBinaryBodySourceInput'), 'perfHost', 'Performance binary file source highlighting should not alter input text metrics.');
      $('performanceBinaryBodySourceInput').value = 'fixtures/performance-upload.dat';
      dispatchInput($('performanceBinaryBodySourceInput'));
      collectPerformanceTestFromEditor();
      assertUiSmoke(
        performanceTest.request.bodyType === 'BINARY'
          && performanceTest.request.postmanBody?.binary?.src === 'fixtures/performance-upload.dat'
          && performanceTest.request.postman?.fileReferences?.some((reference) => reference.source === 'fixtures/performance-upload.dat'),
        'Performance request Body tab should collect binary body source references into the performance request copy.'
      );
      $('performanceBodyTypeSelect').value = 'GRAPHQL';
      dispatchChange($('performanceBodyTypeSelect'));
      $('performanceGraphqlQueryInput').value = 'query Perf($id: ID!) { user(id: $id) { name } }';
      dispatchInput($('performanceGraphqlQueryInput'));
      $('performanceGraphqlVariablesInput').value = '{"id":"{{perfHost}}"}';
      dispatchInput($('performanceGraphqlVariablesInput'));
      $('performanceGraphqlOperationNameInput').value = 'Perf';
      dispatchInput($('performanceGraphqlOperationNameInput'));
      await nextPaint();
      assertVariableHighlight($('performanceGraphqlVariablesInput'), 'perfHost', 'Performance GraphQL variables should highlight environment variable tokens.');
      collectPerformanceTestFromEditor();
      assertUiSmoke(
        performanceTest.request.protocol === 'graphql'
          && performanceTest.request.bodyType === 'RAW_JSON'
          && performanceTest.request.postmanBody?.mode === 'graphql'
          && performanceTest.request.graphql?.operationName === 'Perf',
        'Performance request Body tab should collect GraphQL query, variables, and operation name into the performance request copy.'
      );
      $('performanceBodyTypeSelect').value = 'RAW';
      dispatchChange($('performanceBodyTypeSelect'));
      $('performanceBodyRawFormatSelect').value = 'json';
      dispatchChange($('performanceBodyRawFormatSelect'));
      $('performanceBodyInput').value = '{"hello":"performance"}';
      dispatchInput($('performanceBodyInput'));
      $('performanceRequestScriptsTabButton').click();
      $('performancePreRequestScriptInput').value = "pm.environment.set('perfToken', '1');";
      dispatchInput($('performancePreRequestScriptInput'));
      $('performanceTestScriptInput').value = "pm.test('perf status', function () { pm.response.to.have.status(200); });";
      dispatchInput($('performanceTestScriptInput'));
      $('performanceRequestVariablesTabButton').click();
      $('addPerformanceRequestVariableButton').click();
      performanceRowInputs = $('performanceRequestVariablesTable').querySelectorAll('input');
      assertUiSmoke(performanceRowInputs.length >= 3, `Performance Variables Add should create editable inputs, got ${performanceRowInputs.length}.`);
      performanceRowInputs[1].value = 'perfLocal';
      dispatchInput(performanceRowInputs[1]);
      performanceRowInputs[2].value = 'value';
      dispatchInput(performanceRowInputs[2]);
      collectPerformanceTestFromEditor();
      assertUiSmoke(
        performanceTest.request.queryParams.some((pair) => pair.key === 'probe' && pair.value === 'enabled'),
        'Performance request Params tab should update the performance request copy.'
      );
      assertUiSmoke(performanceTest.request.headers.some((pair) => pair.key === 'X-Perf' && pair.value === 'true'), 'Performance request Headers tab should update the performance request copy.');
      assertUiSmoke(!performanceTest.request.headers.some((pair) => pair.key === 'PostMeter-Token'), 'Performance generated request headers should not be saved as authored headers.');
      assertUiSmoke(performanceTest.request.auth?.type === 'apiKey' && performanceTest.request.auth?.key === 'api_key', 'Performance request Auth tab should update the performance request copy.');
      assertUiSmoke(performanceTest.request.bodyType === 'RAW_JSON' && performanceTest.request.body.includes('performance'), 'Performance request Body tab should update the performance request copy.');
      assertUiSmoke(performanceTest.request.scripts.preRequest.includes('perfToken') && performanceTest.request.scripts.tests.includes('perf status'), 'Performance request Scripts tab should update the performance request copy.');
      assertUiSmoke(performanceTest.request.variables.some((pair) => pair.key === 'perfLocal'), 'Performance request Variables tab should update the performance request copy.');
      $('performanceRequestParamsTabButton').click();
      for (const [tabId, type, label] of [
        ['performanceLatencyTabButton', 'latency', 'Latency'],
        ['performanceThroughputTabButton', 'throughput', 'RPS / Throughput'],
        ['performanceConcurrencyTabButton', 'concurrency', 'Concurrency'],
        ['performanceStressTabButton', 'stress', 'Stress'],
        ['performanceSpikeTabButton', 'spike', 'Spike'],
        ['performanceSoakTabButton', 'soak', 'Soak'],
        ['performanceRampTabButton', 'ramp', 'Ramp']
      ]) {
        assertUiSmoke($(tabId).getAttribute('role') === 'tab', `${label} performance tab should expose role=tab.`);
        assertUiSmoke($(tabId).dataset.tab === type, `${label} performance tab should target ${type}.`);
      }
      activateTab('performance', 'spike');
      assertUiSmoke(performanceTest.type === 'spike', 'Selecting a Performance type tab should update the active performance test type.');
      assertUiSmoke($('performanceSpikeTabButton').getAttribute('aria-selected') === 'true', 'Active Performance type tab should update aria-selected.');
      assertUiSmoke($('spikeTab').getAttribute('aria-hidden') === 'false', 'Active Performance type pane should update aria-hidden.');
      assertUiSmoke($('spikeTab').querySelector('[data-performance-config="spikeMultiplier"]'), 'Spike pane should expose spike-specific controls.');
      activateTab('performance', 'latency');
      const latencyIterationsInput = $('latencyTab').querySelector('[data-performance-config="iterations"]');
      latencyIterationsInput.value = '7';
      dispatchInput(latencyIterationsInput);
      activateTab('performance', 'throughput');
      assertUiSmoke(
        $('throughputTab').querySelector('[data-performance-config="iterations"]').value !== '7',
        'Performance type panes should keep independent config values.'
      );
      activateTab('performance', 'latency');
      assertUiSmoke(
        $('latencyTab').querySelector('[data-performance-config="iterations"]').value === '7',
        'Returning to a Performance type pane should preserve that pane-specific config value.'
      );
      const latencyEnvironmentRect = $('latencyTab').querySelector('.performance-environment-field').getBoundingClientRect();
      const latencyIterationsRect = latencyIterationsInput.closest('.field').getBoundingClientRect();
      const latencyMutationRect = $('latencyTab').querySelector('.performance-mutation-option').getBoundingClientRect();
      assertUiSmoke(
        latencyEnvironmentRect.left > latencyIterationsRect.left,
        'Performance Environment control should move to the right side of the settings row.'
      );
      assertUiSmoke(
        latencyMutationRect.left >= latencyEnvironmentRect.left,
        'Performance environment mutation control should sit next to the Environment control.'
      );
      assertUiSmoke(
        $('performanceResultsResize').getAttribute('aria-orientation') === 'horizontal',
        'Performance results splitter should expose horizontal separator semantics.'
      );
      assertUiSmoke($('performanceOutputResultsTabButton')?.textContent === 'Results', 'Performance output should expose a Results tab.');
      assertUiSmoke($('performanceOutputRequestsTabButton')?.textContent === 'Requests', 'Performance output should expose a Requests tab.');
      assertUiSmoke($('performanceOutputGraphsTabButton')?.textContent === 'Graphs', 'Performance output should expose a Graphs tab placeholder.');
      lastPerformanceResult = {
        completedRequests: 1000,
        totalRequests: 1000,
        successfulRequests: 799,
        failedRequests: 201,
        summary: {
          requestsPerSecond: 25,
          averageDurationMillis: 40,
          p50DurationMillis: 38,
          p90DurationMillis: 48,
          p95DurationMillis: 52,
          p99DurationMillis: 60,
          minDurationMillis: 30,
          maxDurationMillis: 68,
          statusCodes: { 200: 799, 404: 100, 500: 100 }
        },
        samples: Array.from({ length: 1000 }, (_value, index) => {
          const isTransportError = index === 3;
          const statusCode = isTransportError ? 0 : index % 10 === 9 ? 500 : index % 5 === 4 ? 404 : 200;
          return {
            iteration: index + 1,
            passed: !isTransportError && statusCode < 400,
            statusCode,
            requestName: 'Performance Request',
            durationMillis: isTransportError ? 0 : 35 + (index % 30),
            responseBody: isTransportError
              ? ''
              : index === 1
              ? '{"sample":2,"ok":true}'
              : index === 2
                ? '<response><title>Performance</title></response>'
                : `response body ${index + 1}`,
            error: isTransportError ? 'fetch failed' : '',
            assertionResults: [{ passed: true, message: `assertion ${index + 1}` }],
            preRequestScriptResult: { passed: true, tests: [{ name: `pre ${index + 1}`, passed: true }] },
            testScriptResult: { passed: true, tests: [{ name: `post ${index + 1}`, passed: true }] },
            extractedVariables: [],
            localVariables: [{ enabled: true, key: `sampleToken${index + 1}`, value: 'value' }]
          };
        })
      };
      renderPerformanceResult(lastPerformanceResult);
      await nextPaint();
      assertUiSmoke($('performanceRunDetails').textContent.includes('Run summary'), 'Performance Results tab should show aggregate run summary details.');
      assertUiSmoke($('performanceRunDetails').textContent.includes('P95'), 'Performance Results tab should show percentile summary details.');
      $('performanceOutputRequestsTabButton').click();
      assertUiSmoke($('performanceOutputRequestsTab').classList.contains('active'), 'Performance Requests tab should switch to the request execution panel.');
      const performanceRows = Array.from($('performanceExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(performanceRows.length === 100, 'Performance results should render one bounded page of request samples.');
      assertUiSmoke($('performanceExecutionPagination')?.textContent.includes('1-100 of 1000'), 'Performance results should show the first paged result range.');
      assertUiSmoke(performanceRows[0].querySelector('.runner-status-badge')?.textContent === '200', 'Performance result rows should show response status badges.');
      performanceRows[1].click();
      assertUiSmoke($('performanceExecutionDetailsStatus').textContent === '200', 'Performance detail pane should update when selecting a sample row.');
      assertUiSmoke($('performanceExecutionDetails').textContent.includes('Iteration 2'), 'Performance detail pane should show selected sample iteration details.');
      assertUiSmoke(!$('performanceExecutionDetails').textContent.includes('Run summary'), 'Performance request detail pane should not duplicate aggregate run summary details.');
      assertUiSmoke($('performanceExecutionDetails').textContent.includes('assertion 2'), 'Performance request detail pane should show selected sample assertions.');
      assertUiSmoke($('performanceExecutionDetails').textContent.includes('pre 2'), 'Performance request detail pane should show selected sample pre-request script results.');
      assertUiSmoke($('performanceExecutionDetails').textContent.includes('post 2'), 'Performance request detail pane should show selected sample post-request script results.');
      assertUiSmoke($('performanceExecutionDetails').textContent.includes('"sample": 2'), 'Performance request detail pane should format selected sample JSON response body.');
      performanceRows[2].click();
      assertUiSmoke(
        $('performanceExecutionDetails').textContent.includes('\n  <title>Performance</title>'),
        'Performance request detail pane should format selected sample XML response body.'
      );
      const performanceStatusFilter = $('performanceExecutionStatusFilter');
      const performanceStatusOptions = Array.from(performanceStatusFilter.options).map((option) => option.value);
      assertUiSmoke(
        performanceStatusOptions[0] === 'all'
          && performanceStatusOptions[1] === 'ERR'
          && performanceStatusOptions.includes('200')
          && performanceStatusOptions.includes('404')
          && performanceStatusOptions.includes('500'),
        'Performance request status filter should populate from returned status codes.'
      );
      performanceStatusFilter.value = 'ERR';
      performanceStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
      await nextPaint();
      const errorPerformanceRows = Array.from($('performanceExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(errorPerformanceRows.length === 1, 'Performance status filter should render matching request errors.');
      assertUiSmoke(errorPerformanceRows[0].querySelector('.runner-status-badge')?.textContent === 'ERR', 'Performance ERR filter should show error rows with ERR badges.');
      assertUiSmoke(
        $('performanceExecutionSummary').textContent.includes('1-1 of 1 sample matching ERR'),
        'Performance ERR filter should summarize matching request errors.'
      );
      performanceStatusFilter.value = '404';
      performanceStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
      await nextPaint();
      const filteredPerformanceRows = Array.from($('performanceExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(filteredPerformanceRows.length === 100, 'Performance status filter should render matching 404 samples.');
      assertUiSmoke(
        filteredPerformanceRows.every((row) => row.querySelector('.runner-status-badge')?.textContent === '404'),
        'Performance status filter should only show rows with the selected status code.'
      );
      assertUiSmoke(
        $('performanceExecutionSummary').textContent.includes('1-100 of 100 samples matching 404'),
        'Performance status filter should summarize the filtered request range.'
      );
      assertUiSmoke($('performanceExecutionPagination').hidden === true, 'Performance status filter should hide pagination when filtered results fit on one page.');
      performanceStatusFilter.value = 'all';
      performanceStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
      await nextPaint();
      $('performanceExecutionPagination').querySelector('[data-execution-page-action="next"]').click();
      const performanceSecondPageRows = Array.from($('performanceExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(performanceSecondPageRows.length === 100, 'Performance pagination should render a full second page.');
      assertUiSmoke(performanceSecondPageRows[0].textContent.includes('#101'), 'Performance second page should start at sample 101.');
      $('performanceExecutionPagination').querySelector('[data-execution-page-action="last"]').click();
      const performanceLastPageRows = Array.from($('performanceExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(performanceLastPageRows.length === 100, 'Performance pagination should render the final full page for 1000 samples.');
      assertUiSmoke(performanceLastPageRows[0].textContent.includes('#901'), 'Performance last page should start at sample 901.');
      $('performanceExecutionPagination').querySelector('[data-execution-page-action="first"]').click();
      $('performanceOutputGraphsTabButton').click();
      assertUiSmoke($('performanceOutputGraphsTab').classList.contains('active'), 'Performance Graphs tab should switch to its placeholder panel.');
      assertUiSmoke($('performanceOutputGraphsTab').textContent.includes('No graphs yet.'), 'Performance Graphs placeholder should render.');
      $('performanceOutputResultsTabButton').click();
      const performancePanelRect = $('performanceMainPanel').getBoundingClientRect();
      const performanceRequestRect = $('performanceRequestSection').getBoundingClientRect();
      const performanceEditorRect = $('performanceEditorSection').getBoundingClientRect();
      const performanceResultsRect = $('performanceResults').getBoundingClientRect();
      const performanceTabsRect = document.querySelector('.performance-type-tabs').getBoundingClientRect();
      const performanceSettingsSplitterRect = $('performanceSettingsResize').getBoundingClientRect();
      const performanceSplitterRect = $('performanceResultsResize').getBoundingClientRect();
      const performanceRequestStyle = getComputedStyle($('performanceRequestSection'));
      const performanceEditorStyle = getComputedStyle($('performanceEditorSection'));
      const performanceResultsStyle = getComputedStyle($('performanceResults'));
      assertUiSmoke(
        performanceRequestStyle.backgroundColor === performanceEditorStyle.backgroundColor
          && performanceEditorStyle.backgroundColor === performanceResultsStyle.backgroundColor
          && performanceRequestStyle.borderTopStyle !== 'none'
          && performanceEditorStyle.borderTopStyle !== 'none'
          && performanceResultsStyle.borderTopStyle !== 'none',
        'Performance request builder, settings, and results should render as separate boxed sections.'
      );
      assertUiSmoke(
        $('performanceEditorSection').scrollWidth <= $('performanceEditorSection').clientWidth + 2,
        'Performance settings section should not need a horizontal scrollbar at the default size.'
      );
      assertUiSmoke(
        $('performanceEditorSection').scrollHeight <= $('performanceEditorSection').clientHeight + 2,
        'Performance settings section should be compact enough to avoid a default vertical scrollbar.'
      );
      assertUiSmoke(
        performancePanelRect.bottom - performanceResultsRect.bottom <= 12,
        'Performance results should fill the available pane space below the settings.'
      );
      $('performanceOutputRequestsTabButton').click();
      await nextPaint();
      assertUiSmoke(
        $('performanceExecutionList').scrollHeight > $('performanceExecutionList').clientHeight,
        'Long Performance output should scroll inside the execution list.'
      );
      assertUiSmoke(
        performanceRequestRect.bottom <= performanceSettingsSplitterRect.top + 8
          && performanceSettingsSplitterRect.bottom <= performanceEditorRect.top + 8,
        'Performance request/settings splitter should sit between the boxed request builder and settings panes.'
      );
      assertUiSmoke(
        performanceEditorRect.bottom <= performanceSplitterRect.top + 8
          && performanceSplitterRect.bottom <= performanceResultsRect.top + 8,
        'Performance results splitter should sit between the boxed editor and results panes.'
      );
      assertUiSmoke(
        performanceTabsRect.bottom <= performanceSplitterRect.top + 8,
        'Performance type tabs should remain visible above long Performance output.'
      );
      const performanceSettingsStartY = Math.round(performanceSettingsSplitterRect.top + (performanceSettingsSplitterRect.height / 2));
      const performanceRequestStartValue = Math.round($('performanceRequestSection').getBoundingClientRect().height);
      $('performanceSettingsResize').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: performanceSettingsStartY }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: performanceSettingsStartY }));
      const performanceSettingsSamePositionValue = Number($('performanceSettingsResize').getAttribute('aria-valuenow'));
      assertUiSmoke(
        Math.abs(performanceSettingsSamePositionValue - performanceRequestStartValue) <= 1,
        `Performance request/settings resize should not jump on first mouse move. start=${performanceRequestStartValue} same=${performanceSettingsSamePositionValue}.`
      );
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: performanceSettingsStartY + 24 }));
      const performanceSettingsMovedValue = Number($('performanceSettingsResize').getAttribute('aria-valuenow'));
      assertUiSmoke(
        Math.abs(performanceSettingsMovedValue - (performanceRequestStartValue + 24)) <= 2,
        `Performance request/settings resize should track pointer delta. start=${performanceRequestStartValue} moved=${performanceSettingsMovedValue}.`
      );
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      assertUiSmoke(!document.body.classList.contains('is-resizing'), 'Performance request/settings resize did not exit resizing state.');
      $('performanceSettingsResize').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      const performanceResultsSplitterRectAfterRequestResize = $('performanceResultsResize').getBoundingClientRect();
      const performanceStartY = Math.round(performanceResultsSplitterRectAfterRequestResize.top + (performanceResultsSplitterRectAfterRequestResize.height / 2));
      const performanceStartValue = Math.round($('performanceEditorSection').getBoundingClientRect().height);
      $('performanceResultsResize').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: performanceStartY }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: performanceStartY }));
      const performanceSamePositionValue = Number($('performanceResultsResize').getAttribute('aria-valuenow'));
      assertUiSmoke(
        Math.abs(performanceSamePositionValue - performanceStartValue) <= 1,
        `Performance results resize should not jump on first mouse move. start=${performanceStartValue} same=${performanceSamePositionValue}.`
      );
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: performanceStartY + 24 }));
      const performanceMovedValue = Number($('performanceResultsResize').getAttribute('aria-valuenow'));
      assertUiSmoke(
        Math.abs(performanceMovedValue - (performanceStartValue + 24)) <= 2,
        `Performance results resize should track pointer delta. start=${performanceStartValue} moved=${performanceMovedValue}.`
      );
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      assertUiSmoke(!document.body.classList.contains('is-resizing'), 'Performance results resize did not exit resizing state.');
      $('performanceResultsResize').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      workspace.performanceTests = [];
      openPerformanceTabs = [];
      activePerformanceTestId = null;
      workspace.history = [{
        timestamp: new Date(0).toISOString(),
        method: 'GET',
        url: 'https://history-clear.example.test/widgets',
        statusCode: 200,
        durationMillis: 25
      }];
      renderHistory();
      const historyTab = $('historyPanelTab');
      assertUiSmoke(historyTab.getAttribute('aria-haspopup') === 'menu', 'History tab should expose a context menu.');
      historyTab.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 32,
        clientY: 240
      }));
      const clearHistoryMenuItem = Array.from($('contextMenu').querySelectorAll('button'))
        .find((button) => button.textContent.trim() === 'Clear History');
      assertUiSmoke(!$('contextMenu').hidden, 'Right-clicking History should open its context menu.');
      assertUiSmoke(clearHistoryMenuItem, 'History context menu should include Clear History.');
      assertUiSmoke(clearHistoryMenuItem.classList.contains('danger'), 'Clear History should use the danger context menu style.');
      clearHistoryMenuItem.click();
      assertUiSmoke(!$('confirmActionModal').hidden, 'Clear History should ask for confirmation.');
      assertUiSmoke($('confirmActionModalTitle').textContent === 'Clear history?', 'Clear History confirmation should use a specific title.');
      assertUiSmoke($('confirmActionModalMessage').textContent.includes('cannot be undone'), 'Clear History confirmation should warn that clearing cannot be undone.');
      assertUiSmoke($('confirmActionButton').textContent === 'Clear History', 'Clear History confirmation should label the destructive action.');
      $('cancelConfirmActionButton').click();
      await Promise.resolve();
      assertUiSmoke(workspace.history.length === 1, 'Cancelling Clear History should keep history entries.');
      historyTab.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 32,
        clientY: 240
      }));
      activateContextMenuItem('Clear History');
      assertUiSmoke(!$('confirmActionModal').hidden, 'Activating Clear History should reopen the confirmation modal.');
      $('confirmActionButton').click();
      await waitForUiSmoke(() => workspace.history.length === 0, 'Confirming Clear History should remove history entries.', 3000, global);
      assertUiSmoke(!$('historyList').querySelector('.history-item'), 'Confirming Clear History should clear the rendered history list.');
      assertStatusIncludes('History cleared', 'Confirming Clear History should update the visible status.');
      workspace.environments = [];
      activeEnvironmentId = 'none';
      openEnvironmentTabs = [];
      selectSidebarPanel('environments');
      assertUiSmoke(activeSidebarPanel === 'environments', 'Selecting Environments should switch the sidebar panel.');
      assertUiSmoke(activeMainPanel === 'environment', 'Selecting Environments should switch the main pane to environment mode.');
      assertUiSmoke(openEnvironmentTabs.length === 0, 'Selecting Environments should not automatically open an environment tab.');
      assertUiSmoke(!$('environmentEmptyPanel').hidden, 'Environments without a selection should show the create environment screen.');
      assertUiSmoke($('environmentMainPanel').hidden, 'Environment editor should be hidden when no environment is selected.');
      assertUiSmoke($('requestEditorPanel').hidden, 'Request editor should be hidden when no environment is selected.');
      assertUiSmoke(document.querySelector('.results').hidden, 'Response panel should be hidden when no environment is selected.');
      const environment = newEnvironment();
      assertUiSmoke(activeSidebarPanel === 'environments', 'Creating an environment should open the Environments panel.');
      assertUiSmoke($('environmentEmptyPanel').hidden, 'Create environment screen should hide once an environment exists.');
      assertUiSmoke(!$('environmentMainPanel').hidden, 'Creating an environment should show the main environment editor.');
      assertUiSmoke($('requestEditorPanel').hidden, 'Request editor should be hidden while editing an environment.');
      assertUiSmoke(getComputedStyle($('requestEditorPanel')).display === 'none', 'Request editor should not occupy layout space while editing an environment.');
      assertUiSmoke($('workspacePaneResize').hidden, 'Workspace response splitter should be hidden while editing an environment.');
      assertUiSmoke(document.querySelector('.results').hidden, 'Response panel should be hidden while editing an environment.');
      assertUiSmoke(getComputedStyle(document.querySelector('.results')).display === 'none', 'Response panel should not occupy layout space while editing an environment.');
      const environmentPanelRect = $('environmentMainPanel').getBoundingClientRect();
      const workspaceRect = document.querySelector('.workspace').getBoundingClientRect();
      assertUiSmoke(
        environmentPanelRect.bottom > workspaceRect.bottom - 24,
        `Environment editor should fill the main workspace area. panelBottom=${environmentPanelRect.bottom} workspaceBottom=${workspaceRect.bottom} class=${document.querySelector('.workspace').className} rows=${getComputedStyle(document.querySelector('.workspace')).gridTemplateRows}.`
      );
      assertUiSmoke($('requestTabBar').textContent.includes(environment.name), 'Creating an environment should open an environment tab.');
      assertUiSmoke($('requestTabBar').getAttribute('aria-label') === 'Open requests, environments, workspaces, runners, and performance tests', 'Opened tablist label should cover request, environment, workspace, runner, and performance tabs.');
      const environmentTitle = $('environmentMainTitle');
      assertUiSmoke(!document.getElementById('environmentNameInput'), 'Environment editor should not render a separate name text box.');
      assertUiSmoke(!$('environmentMainPanel').querySelector('.environment-main-header h2'), 'Environment editor should not render a redundant Environment label above the title.');
      assertUiSmoke($('saveEnvironmentButton')?.textContent === 'Save Environment', 'Environment editor should render a Save Environment button.');
      assertUiSmoke(!$('saveEnvironmentButton').disabled, 'Environment editor should enable the environment save button.');
      assertUiSmoke($('deleteEnvironmentButton')?.textContent === 'Delete Environment', 'Environment delete button should use the full Delete Environment label.');
      assertUiSmoke(environmentTitle.getAttribute('aria-label') === 'Environment name', 'Environment title should expose an accessible name.');
      assertUiSmoke(getComputedStyle(environmentTitle).whiteSpace === 'nowrap', 'Environment title should stay on a single line.');
      const environmentHeader = $('environmentMainPanel').querySelector('.environment-main-header');
      const environmentActions = environmentHeader.querySelector('.environment-actions');
      const titleWidth = environmentTitle.getBoundingClientRect().width;
      const expectedTitleWidth = environmentHeader.getBoundingClientRect().width - environmentActions.getBoundingClientRect().width - 36;
      assertUiSmoke(titleWidth >= expectedTitleWidth, 'Environment title editor should use nearly all available header width.');
      environmentTitle.click();
      assertUiSmoke(environmentTitle.getAttribute('contenteditable') === 'plaintext-only', 'Clicking the environment title should make it editable inline.');
      editEnvironmentTitle('Inline Environment Rename');
      assertUiSmoke(environment.name === 'Inline Environment Rename', 'Editing the environment title should update the environment name.');
      const environmentVariableRow = $('environmentTable').querySelector('.env-row');
      assertUiSmoke(environmentVariableRow, 'Environment variable editor did not render the default row.');
      assertUiSmoke(environmentVariableRow.querySelector('[aria-label="Environment variable 1 enabled"]'), 'Environment variable enabled control should expose a contextual accessible label.');
      assertUiSmoke(environmentVariableRow.querySelector('[aria-label="Environment variable 1 name"]'), 'Environment variable name input should expose a contextual accessible label.');
      assertUiSmoke(environmentVariableRow.querySelector('[aria-label="Environment variable 1 value"]'), 'Environment variable value input should expose a contextual accessible label.');
      assertUiSmoke(environmentVariableRow.querySelector('[aria-label^="Remove environment variable"]'), 'Environment variable remove button should expose a contextual accessible label.');
      assertUiSmoke(!$('environmentsSidebarPanel').querySelector('#environmentMainTitle'), 'Environment editor controls should not render in the sidebar.');
      assertUiSmoke($('environmentsList').textContent.includes(environment.name), 'Environments panel did not render the new environment.');
      const environmentOpenTabCount = openEnvironmentTabs.length;
      selectSidebarPanel('collections');
      selectSidebarPanel('environments');
      assertUiSmoke(activeEnvironmentId === environment.id, 'Selecting Environments with an open environment tab should restore that tab.');
      assertUiSmoke(!$('environmentMainPanel').hidden, 'Selecting Environments with an open environment tab should show the environment editor.');
      assertUiSmoke(openEnvironmentTabs.length === environmentOpenTabCount, 'Selecting Environments should not open a duplicate environment tab.');
      openRequestTabs = [];
      openWorkspaceTabs = [];
      const closeEnvironment = closeEnvironmentTab(openEnvironmentTabs.find((tab) => tab.environmentId === environment.id));
      assertUiSmoke(!$('unsavedRequestModal').hidden, 'Closing a new dirty environment should show the unsaved changes modal.');
      $('closeWithoutSavingButton').click();
      await closeEnvironment;
      assertUiSmoke(activeSidebarPanel === 'environments', 'Closing the last environment tab should keep the Environments sidebar selected.');
      assertUiSmoke(activeMainPanel === 'environment', 'Closing the last environment tab should keep the main pane in environment mode.');
      assertUiSmoke(!$('environmentEmptyPanel').hidden, 'Closing the last environment tab should show the create environment screen.');
      assertUiSmoke($('requestEmptyPanel').hidden, 'Closing the last environment tab should not show the create request screen.');
      selectEnvironmentTab({ key: `environment:${environment.id}`, environmentId: environment.id });
      selectSidebarPanel('collections');
      if (activeRequest()) {
        assertUiSmoke(!$('requestEditorPanel').hidden, 'Selecting Collections should return the main pane to the request editor.');
      } else {
        assertUiSmoke(!$('requestEmptyPanel').hidden, 'Selecting Collections without an active request should show the create request screen.');
        assertUiSmoke($('requestEditorPanel').hidden, 'Selecting Collections without an active request should keep the request editor hidden.');
      }
      openWorkspaceTabs = [];
      selectedWorkspaceId = '';
      selectSidebarPanel('workspaces');
      assertUiSmoke($('workspacesList').textContent.includes(workspaceDisplayName()), 'Workspaces panel did not render the current workspace list item.');
      assertUiSmoke(activeMainPanel === 'workspace', 'Selecting Workspaces should switch the main pane to workspace mode.');
      assertUiSmoke(!$('workspaceEmptyPanel').hidden, 'Selecting Workspaces should show the select workspace screen.');
      assertUiSmoke(openWorkspaceTabs.length === 0, 'Selecting Workspaces should not automatically open a workspace tab.');
      const currentWorkspaceButton = $('workspacesList').querySelector('button');
      assertUiSmoke(currentWorkspaceButton, 'Workspaces panel did not render a selectable workspace row.');
      currentWorkspaceButton.click();
      assertUiSmoke(!$('workspaceMainPanel').hidden, 'Selecting Workspaces should show the main workspace editor.');
      assertUiSmoke(!$('saveWorkspacePanelButton'), 'Workspace details should not render a Save Workspace button.');
      assertUiSmoke(!$('importWorkspacePanelButton'), 'Workspace details should not render an import button.');
      assertUiSmoke($('requestEditorPanel').hidden, 'Request editor should be hidden while viewing workspace details.');
      assertUiSmoke(document.querySelector('.results').hidden, 'Response panel should be hidden while viewing workspace details.');
      assertUiSmoke($('workspaceSummary').textContent.includes('Workspace File'), 'Workspace main panel did not render workspace details.');
      const settingsPromise = openSettingsModal('diagnostics');
      await nextPaint();
      assertUiSmoke(!$('settingsModal').hidden, 'Settings menu should open the settings modal.');
      assertUiSmoke($('settingsDiagnosticsButton').getAttribute('aria-selected') === 'true', 'Settings modal should activate the requested category.');
      assertUiSmoke(!$('settingsDiagnosticsSection').hidden, 'Diagnostics settings should live inside the Settings modal.');
      assertUiSmoke($('workspaceMainPanel').textContent.includes('Workspace File'), 'Workspace details should keep workspace summary content after settings move.');
      $('closeSettingsModalFooterButton').click();
      await settingsPromise;
      assertUiSmoke($('switchWorkspacePanelButton').disabled, 'Current workspace details should disable the switch button.');
      assertUiSmoke($('requestTabBar').textContent.includes(workspaceDisplayName()), 'Selecting Workspaces should open a workspace tab.');
      const workspaceOpenTabCount = openWorkspaceTabs.length;
      const selectedWorkspaceTabId = selectedWorkspaceId;
      selectSidebarPanel('collections');
      selectSidebarPanel('workspaces');
      assertUiSmoke(selectedWorkspaceId === selectedWorkspaceTabId, 'Selecting Workspaces with an open workspace tab should restore that tab.');
      assertUiSmoke(!$('workspaceMainPanel').hidden, 'Selecting Workspaces with an open workspace tab should show workspace details.');
      assertUiSmoke(openWorkspaceTabs.length === workspaceOpenTabCount, 'Selecting Workspaces should not open a duplicate workspace tab.');
      openRequestTabs = [];
      openEnvironmentTabs = [];
      closeWorkspaceTab(openWorkspaceTabs.find((tab) => tab.workspaceId === selectedWorkspaceId));
      assertUiSmoke(activeSidebarPanel === 'workspaces', 'Closing the last workspace tab should keep the Workspaces sidebar selected.');
      assertUiSmoke(activeMainPanel === 'workspace', 'Closing the last workspace tab should keep the main pane in workspace mode.');
      assertUiSmoke(!$('workspaceEmptyPanel').hidden, 'Closing the last workspace tab should show the select workspace screen.');
      assertUiSmoke($('workspaceEmptyPanel').textContent.includes('Select a workspace'), 'Workspace empty state should ask the user to select a workspace.');
      assertUiSmoke($('requestEmptyPanel').hidden, 'Closing the last workspace tab should not show the create request screen.');
      workspace.runners = [];
      openRunnerTabs = [];
      activeRunnerConfigId = null;
      selectSidebarPanel('runners');
      assertUiSmoke(activeMainPanel === 'runner', 'Selecting Runner should switch the main pane to runner mode.');
      assertUiSmoke(!$('runnerEmptyPanel').hidden, 'Runner panel without a selection should show an empty state.');
      assertUiSmoke($('runnersList').textContent.includes('No runners'), 'Runner sidebar should show an empty state.');
      assertUiSmoke(!$('runnersList').querySelector('button'), 'Runner sidebar empty state should not render a create button.');
      $('emptyCreateRunnerButton').click();
      const runner = activeRunner();
      assertUiSmoke(runner && activeRunnerConfigId === runner.id, 'Creating a runner should select it.');
      assertUiSmoke($('requestTabBar').textContent.includes(runner.name), 'Creating a runner should open a runner tab.');
      assertUiSmoke(!$('runnerMainPanel').hidden, 'Creating a runner should show the runner editor.');
      assertUiSmoke($('runnerEnvironmentSelect'), 'Runner environment selector is missing.');
      assertUiSmoke($('runnerAllowEnvironmentMutation'), 'Runner environment mutation checkbox is missing.');
      const runnerTreeButton = treeButtonByTarget('runner', runner.id);
      assertUiSmoke(runnerTreeButton, 'Runner sidebar should render the created runner row.');
      runnerTreeButton.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 160,
        clientY: 260
      }));
      const runnerContextLabels = Array.from($('contextMenu').querySelectorAll('button')).map((button) => button.textContent.trim());
      assertUiSmoke(!runnerContextLabels.includes('Open'), 'Runner row context menu should not include Open.');
      assertUiSmoke(runnerContextLabels.includes('Rename'), 'Runner row context menu should include Rename.');
      assertUiSmoke(runnerContextLabels.includes('Delete'), 'Runner row context menu should include Delete.');
      closeContextMenu();
      const runnerTabCount = openRunnerTabs.length;
      selectSidebarPanel('collections');
      selectSidebarPanel('runners');
      assertUiSmoke(activeRunnerConfigId === runner.id, 'Selecting Runner with an open runner tab should restore the runner tab.');
      assertUiSmoke(openRunnerTabs.length === runnerTabCount, 'Selecting Runner should not open a duplicate runner tab.');
      $('addRunnerRequestButton').click();
      let runnerAddLabels = Array.from($('contextMenu').querySelectorAll('button')).map((button) => button.textContent.trim());
      assertUiSmoke(runnerAddLabels.join('|') === 'New Request|Import', `Runner Add Request menu should only show New Request and Import. labels=${runnerAddLabels.join('|')}`);
      activateContextMenuItem('New Request');
      assertUiSmoke(runner.requests.length === 1, 'Runner local request was not added.');
      const runnerLocalRequest = runner.requests[0];
      let runnerLocalRow = $('runnerRequestList').querySelector('.runner-request-row');
      let runnerIterationInput = runnerLocalRow?.querySelector('.runner-row-iterations input');
      assertUiSmoke(runnerIterationInput, 'Runner request rows should expose an Iterations input.');
      assertUiSmoke(runnerIterationInput.value === '1', 'Runner request iterations should default to 1.');
      runnerIterationInput.value = '5';
      dispatchInput(runnerIterationInput);
      dispatchChange(runnerIterationInput);
      assertUiSmoke(runner.requests[0].iterations === 5, 'Runner request iterations should update the runner-owned request.');
      $('addRunnerRequestButton').click();
      activateContextMenuItem('New Request');
      assertUiSmoke(runner.requests.length === 2, 'Runner should support adding another local request after changing iterations.');
      let runnerRows = Array.from($('runnerRequestList').querySelectorAll('.runner-request-row'));
      runnerLocalRow = runnerRows[0];
      runnerIterationInput = runnerLocalRow?.querySelector('.runner-row-iterations input');
      assertUiSmoke(runnerIterationInput, 'Runner first row should keep an Iterations input after adding a second request.');
      runnerIterationInput.value = '2';
      dispatchInput(runnerIterationInput);
      dispatchChange(runnerIterationInput);
      collectRunnerFromEditor();
      assertUiSmoke(runner.requests[0].iterations === 2, 'Runner should collect changed iterations from the visible row after adding another request.');
      assertUiSmoke(runner.requests[1].iterations === 1, 'New runner requests should keep their own default iteration count.');
      renderRunnerEditor();
      runnerRows = Array.from($('runnerRequestList').querySelectorAll('.runner-request-row'));
      runnerLocalRow = runnerRows[0];
      assertUiSmoke(runnerLocalRow?.querySelector('.runner-row-iterations input')?.value === '2', 'Runner iteration edits should survive runner pane re-renders.');
      assertUiSmoke(runnerRows[1]?.querySelector('.runner-row-iterations input')?.value === '1', 'Runner iteration re-render should not copy the first row value to new rows.');
      const runnerLocalEditButton = Array.from(runnerLocalRow?.querySelectorAll('button') || [])
        .find((button) => button.textContent.trim() === 'Edit');
      assertUiSmoke(runnerLocalEditButton, 'Runner request rows should expose an Edit button.');
      runnerLocalEditButton.click();
      assertUiSmoke(activeSidebarPanel === 'runners', 'Editing a runner request should keep the Runner sidebar selected.');
      assertUiSmoke(activeMainPanel === 'request', 'Editing a runner request should open the request editor pane.');
      assertUiSmoke(activeRunnerRequestRunnerId === runner.id, 'Editing a runner request should bind the request editor to the runner.');
      assertUiSmoke(activeRequest()?.id === runnerLocalRequest.id, 'Editing a runner request should activate the runner-owned request.');
      assertUiSmoke(!$('requestEditorPanel').hidden, 'Runner request edit should show the standard request editor.');
      $('urlInput').value = 'https://runner-local.example.test';
      dispatchInput($('urlInput'));
      activateTab('request', 'params');
      $('addParamButton').click();
      const runnerParamInputs = $('paramsTable').querySelectorAll('input');
      runnerParamInputs[1].value = 'runner';
      dispatchInput(runnerParamInputs[1]);
      runnerParamInputs[2].value = '{{runnerToken}}';
      dispatchInput(runnerParamInputs[2]);
      await nextPaint();
      assertVariableHighlight(runnerParamInputs[2], 'runnerToken', 'Runner-owned request Params values should highlight environment variable tokens.');
      runnerParamInputs[2].value = 'local';
      dispatchInput(runnerParamInputs[2]);
      assertUiSmoke($('urlInput').value === 'https://runner-local.example.test?runner=local', 'Runner request params should update the runner request URL.');
      $('urlInput').value = 'https://runner-local.example.test?from=url';
      dispatchInput($('urlInput'));
      const runnerUrlParamInputs = $('paramsTable').querySelectorAll('input');
      assertUiSmoke(runnerUrlParamInputs[1].value === 'from' && runnerUrlParamInputs[2].value === 'url', 'Runner request URL changes should update the Params table.');
      activateTab('request', 'body');
      $('bodyTypeSelect').value = 'FORM_DATA';
      dispatchChange($('bodyTypeSelect'));
      $('addFormDataBodyRowButton').click();
      const runnerBodyRow = $('formDataBodyTable').querySelector('[data-body-form-data-row]');
      const runnerBodyControls = runnerBodyRow.querySelectorAll('select, input');
      runnerBodyControls[1].value = 'text';
      dispatchChange(runnerBodyControls[1]);
      runnerBodyControls[2].value = 'runnerBody';
      dispatchInput(runnerBodyControls[2]);
      runnerBodyControls[3].value = 'value';
      dispatchInput(runnerBodyControls[3]);
      collectRequestFromEditor();
      assertUiSmoke(
        runner.requests.find((request) => request.id === runnerLocalRequest.id)?.url === 'https://runner-local.example.test?from=url',
        'Runner request editor changes should update the runner-local request.'
      );
      assertUiSmoke(
        runner.requests.find((request) => request.id === runnerLocalRequest.id)?.postmanBody?.formdata?.some((part) => part.key === 'runnerBody' && part.value === 'value'),
        'Runner-owned request editor should collect Postman-style form-data body rows.'
      );
      const runnerTab = openRunnerTabs.find((tab) => tab.runnerId === runner.id);
      assertUiSmoke(runnerTab, 'Runner tab should remain open while editing a runner request.');
      selectRunnerTab(runnerTab);
      const dirtyRunnerRow = $('runnerRequestList').querySelector('.runner-request-row');
      assertUiSmoke(
        dirtyRunnerRow?.querySelector('.runner-row-dirty-indicator:not([hidden])'),
        'Runner request rows should show an unsaved indicator when the runner-owned request tab is dirty.'
      );
      const originalRunnerStart = window.__postmeterStartRunner;
      const originalSaveWorkspaceForRunnerRun = window.__postmeterSaveWorkspace;
      let runnerRunPayload = null;
      let runnerRunSaveCalls = 0;
      try {
        window.__postmeterSaveWorkspace = async (nextWorkspace) => {
          runnerRunSaveCalls += 1;
          return nextWorkspace;
        };
        window.__postmeterStartRunner = async (_runnerId, runnerPayload) => {
          runnerRunPayload = structuredClone(runnerPayload);
          return {
            collectionName: runnerPayload.name,
            totalRequests: 1,
            passedRequests: 1,
            failedRequests: 0,
            passed: true,
            cancelled: false,
            cookies: [],
            results: [
              {
                requestId: runnerPayload.requests?.[0]?.id,
                requestName: runnerPayload.requests?.[0]?.name,
                statusCode: 200,
                durationMillis: 1,
                responseBody: '',
                passed: true,
                assertionResults: [],
                preRequestScriptResult: { passed: true, tests: [] },
                testScriptResult: { passed: true, tests: [] },
                extractedVariables: [],
                localVariables: []
              }
            ]
          };
        };
        $('runCollectionButton').click();
        await waitForUiSmoke(() => runnerRunPayload, 'Running a runner should execute the current runner payload.', 3000, global);
        assertUiSmoke(runnerRunSaveCalls === 0, 'Running a runner should not force-save dirty runner-owned requests.');
        assertUiSmoke(
          runnerRunPayload.requests?.[0]?.url === 'https://runner-local.example.test?from=url',
          'Running a runner should execute the dirty unsaved runner-owned request URL.'
        );
        assertUiSmoke(
          runnerRunPayload.requests?.[0]?.postmanBody?.formdata?.some((part) => part.key === 'runnerBody' && part.value === 'value'),
          'Running a runner should execute dirty unsaved runner-owned request body edits.'
        );
        $('saveRunnerButton').click();
        await waitForUiSmoke(() => runnerRunSaveCalls === 1
          && !openRequestTabs.find((tab) => tab.runnerId === runner.id && tab.requestId === runnerLocalRequest.id)?.dirty,
        'Saving a runner should persist through the workspace save boundary and clear runner-owned request dirty state.',
        3000,
        global);
        const cleanRunnerRow = $('runnerRequestList').querySelector('.runner-request-row');
        assertUiSmoke(
          !cleanRunnerRow?.querySelector('.runner-row-dirty-indicator:not([hidden])'),
          'Saving a runner should re-render runner request rows without stale unsaved indicators.'
        );
        assertUiSmoke(
          !openRequestTabs.find((tab) => tab.runnerId === runner.id && tab.requestId === runnerLocalRequest.id)?.dirty,
          'Saving a runner should clear the dirty state for runner-owned request tabs.'
        );
      } finally {
        window.__postmeterStartRunner = originalRunnerStart;
        window.__postmeterSaveWorkspace = originalSaveWorkspaceForRunnerRun;
      }
      const sourceCollection = {
        id: crypto.randomUUID(),
        name: 'Runner Source Collection',
        requests: [
          newRequestObject('Runner Source Request'),
          newRequestObject('Runner Source Request 2'),
          newRequestObject('Runner Source Request 3')
        ],
        folders: []
      };
      const secondSourceCollection = {
        id: crypto.randomUUID(),
        name: 'Runner Second Source Collection',
        requests: [
          newRequestObject('Runner Second Source Request'),
          newRequestObject('Runner Second Source Request 2')
        ],
        folders: []
      };
      workspace.collections.push(sourceCollection, secondSourceCollection);
      const source = sourceCollection.requests[0];
      const clickRunnerImportControl = (control, options = {}) => {
        control.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          ctrlKey: options.ctrlKey === true,
          metaKey: options.metaKey === true,
          shiftKey: options.shiftKey === true
        }));
      };
      const runnerImportCollection = (collectionId) => Array.from($('runnerImportList').querySelectorAll('[data-runner-import-type="collection"]'))
        .find((control) => control.dataset.collectionId === collectionId);
      const runnerImportInput = (type, collectionId, requestId = '') => Array.from($('runnerImportList').querySelectorAll('input'))
        .find((input) => input.dataset.runnerImportType === type
          && input.dataset.collectionId === collectionId
          && input.dataset.requestId === requestId);
      $('addRunnerRequestButton').click();
      runnerAddLabels = Array.from($('contextMenu').querySelectorAll('button')).map((button) => button.textContent.trim());
      assertUiSmoke(runnerAddLabels.join('|') === 'New Request|Import', `Runner Add Request menu should stay simplified after collections exist. labels=${runnerAddLabels.join('|')}`);
      activateContextMenuItem('Import');
      assertUiSmoke(!$('runnerImportModal').hidden, 'Runner Import should open the import selection modal.');
      assertUiSmoke($('confirmRunnerImportButton').disabled, 'Runner Import Add button should be disabled until a target is selected.');
      assertUiSmoke($('runnerImportList').textContent.includes(sourceCollection.name), 'Runner Import modal should list collections.');
      assertUiSmoke(!$('runnerImportList').textContent.includes(source.name), 'Runner Import modal should hide collection requests until the collection is expanded.');
      const collectionImportControl = runnerImportCollection(sourceCollection.id);
      assertUiSmoke(collectionImportControl, 'Runner Import modal should expose an expandable collection row.');
      assertUiSmoke(!runnerImportInput('collection', sourceCollection.id), 'Runner Import modal should not make collection rows selectable import targets.');
      clickRunnerImportControl(collectionImportControl);
      const expandedRequestImportInput = runnerImportInput('request', sourceCollection.id, source.id);
      assertUiSmoke(expandedRequestImportInput, 'Runner Import modal should expose request options after expanding a collection.');
      assertUiSmoke($('confirmRunnerImportButton').disabled, 'Expanding a runner import collection should not enable Add.');
      assertUiSmoke(Array.isArray(selectedRunnerImportTarget) && selectedRunnerImportTarget.length === 0, 'Expanding a runner import collection should not select the collection.');
      const secondCollectionImportControl = runnerImportCollection(secondSourceCollection.id);
      assertUiSmoke(secondCollectionImportControl, 'Runner Import modal should expose every collection row.');
      clickRunnerImportControl(secondCollectionImportControl, { ctrlKey: true });
      assertUiSmoke(
        Array.isArray(selectedRunnerImportTarget) && selectedRunnerImportTarget.length === 0,
        'Ctrl-clicking runner import collections should still only expand collections.'
      );
      const requestCountBeforeCancel = runner.requests.length;
      $('cancelRunnerImportButton').click();
      await nextPaint();
      assertUiSmoke(runner.requests.length === requestCountBeforeCancel, 'Cancelling Runner Import should not add requests.');

      $('addRunnerRequestButton').click();
      activateContextMenuItem('Import');
      clickRunnerImportControl(runnerImportCollection(sourceCollection.id));
      const requestImportInputAfterCancel = runnerImportInput('request', sourceCollection.id, source.id);
      const thirdRequestImportInputAfterCancel = runnerImportInput('request', sourceCollection.id, sourceCollection.requests[2].id);
      assertUiSmoke(requestImportInputAfterCancel && thirdRequestImportInputAfterCancel, 'Runner Import request options should be available after expanding the collection.');
      clickRunnerImportControl(requestImportInputAfterCancel, { ctrlKey: true });
      clickRunnerImportControl(thirdRequestImportInputAfterCancel, { shiftKey: true });
      assertUiSmoke(
        Array.isArray(selectedRunnerImportTarget)
          && selectedRunnerImportTarget.length === 3
          && selectedRunnerImportTarget.every((target) => target.type === 'request'),
        'Shift-clicking runner import requests should select the visible request range.'
      );
      $('confirmRunnerImportButton').click();
      await waitForUiSmoke(() => runner.requests.length === requestCountBeforeCancel + 3, 'Adding selected requests from Runner Import should clone every selected request.', 3000, global);

      $('addRunnerRequestButton').click();
      activateContextMenuItem('Import');
      clickRunnerImportControl(runnerImportCollection(sourceCollection.id));
      clickRunnerImportControl(runnerImportCollection(secondSourceCollection.id));
      const sourceRequestInputAfterRequest = runnerImportInput('request', sourceCollection.id, source.id);
      const secondSourceRequestInputAfterRequest = runnerImportInput('request', secondSourceCollection.id, secondSourceCollection.requests[0].id);
      assertUiSmoke(sourceRequestInputAfterRequest && secondSourceRequestInputAfterRequest, 'Expanded runner import collections should expose request rows for Ctrl-click selection.');
      clickRunnerImportControl(sourceRequestInputAfterRequest, { ctrlKey: true });
      clickRunnerImportControl(secondSourceRequestInputAfterRequest, { ctrlKey: true });
      assertUiSmoke(
        Array.isArray(selectedRunnerImportTarget)
          && selectedRunnerImportTarget.length === 2
          && selectedRunnerImportTarget.every((target) => target.type === 'request'),
        'Ctrl-clicking runner import requests should preserve multiple request selections before Add.'
      );
      const requestCountBeforeCollectionImport = runner.requests.length;
      $('confirmRunnerImportButton').click();
      await waitForUiSmoke(
        () => runner.requests.length === requestCountBeforeCollectionImport + 2,
        'Adding Ctrl-selected requests from Runner Import should clone only the selected requests.',
        3000,
        global
      );
      const imported = runner.requests.find((request) => request.source?.collectionId === sourceCollection.id
        && request.source?.requestId === source.id);
      if (source) {
        assertUiSmoke(imported.id !== source.id, 'Imported runner request should get a runner-local request id.');
        assertUiSmoke(imported.source?.requestId === source.id, 'Imported runner request should keep source request metadata.');
        assertUiSmoke(imported.source?.collectionId === sourceCollection.id, 'Imported runner request should keep source collection metadata.');
        imported.name = 'Mutated Runner Clone';
        assertUiSmoke(source.name !== 'Mutated Runner Clone', 'Imported runner request should not mutate the source collection request.');
      }
      lastRunnerResult = {
        collectionName: runner.name,
        totalRequests: 125,
        passedRequests: 106,
        failedRequests: 19,
        passed: false,
        cancelled: false,
        collectionVariables: [],
        environment: { id: 'runtime', name: 'Runtime', variables: [{ enabled: true, key: 'runnerEnvToken', value: 'env-value' }] },
        results: [
          {
            requestId: runner.requests[0].id,
            requestName: runner.requests[0].name,
            statusCode: 200,
            durationMillis: 21,
            responseBody: '{"runner":true}',
            passed: true,
            assertionResults: [],
            preRequestScriptResult: { passed: true, tests: [] },
            testScriptResult: { passed: true, tests: [{ name: 'runner request passed', passed: true }] },
            extractedVariables: [],
            localVariables: [{ enabled: true, key: 'runnerLocalToken', value: 'local-value' }]
          },
          {
            requestId: runner.requests[1].id,
            requestName: runner.requests[1].name,
            statusCode: 500,
            durationMillis: 33,
            responseBody: '<error><message>Bad status</message></error>',
            passed: false,
            assertionResults: [],
            preRequestScriptResult: { passed: true, tests: [] },
            testScriptResult: { passed: false, tests: [{ name: 'runner request failed', passed: false, error: 'Expected HTTP 200.' }] },
            extractedVariables: [],
            localVariables: [],
            error: 'Expected HTTP 200.'
          },
          {
            requestId: 'runner-invalid-url',
            requestName: 'Runner Error Result',
            statusCode: 0,
            durationMillis: 0,
            responseBody: '',
            passed: false,
            assertionResults: [],
            preRequestScriptResult: { passed: true, tests: [] },
            testScriptResult: { passed: true, tests: [] },
            extractedVariables: [],
            localVariables: [],
            error: 'fetch failed'
          }
        ]
      };
      lastRunnerResult.results.push(...Array.from({ length: 122 }, (_value, index) => {
        const number = index + 4;
        const statusCode = number % 7 === 0 ? 404 : 200;
        return {
          requestId: `runner-generated-${number}`,
          requestName: `Runner Result ${number}`,
          statusCode,
          durationMillis: 20 + (number % 15),
          responseBody: '',
          passed: statusCode < 400,
          assertionResults: [],
          preRequestScriptResult: { passed: true, tests: [] },
          testScriptResult: { passed: true, tests: [] },
          extractedVariables: [],
          localVariables: []
        };
      }));
      renderRunnerExecutionResult(lastRunnerResult);
      let executionRows = Array.from($('runnerExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(executionRows.length === 100, 'Runner execution pane should render one bounded page of request results.');
      assertUiSmoke($('runnerExecutionPagination')?.textContent.includes('1-100 of 125'), 'Runner execution pane should show the first paged result range.');
      assertUiSmoke(executionRows[0].querySelector('.runner-status-badge')?.textContent === '200', 'Runner execution row should show the HTTP status code.');
      assertUiSmoke(executionRows[1].querySelector('.runner-status-badge')?.textContent === '500', 'Runner execution row should show failing HTTP status codes.');
      const runnerStatusFilter = $('runnerExecutionStatusFilter');
      const runnerStatusOptions = Array.from(runnerStatusFilter.options).map((option) => option.value);
      assertUiSmoke(
        runnerStatusOptions[0] === 'all'
          && runnerStatusOptions[1] === 'ERR'
          && runnerStatusOptions.includes('200')
          && runnerStatusOptions.includes('404')
          && runnerStatusOptions.includes('500'),
        'Runner status filter should populate from returned status codes.'
      );
      runnerStatusFilter.value = 'ERR';
      runnerStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
      await nextPaint();
      const errorRunnerRows = Array.from($('runnerExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(errorRunnerRows.length === 1, 'Runner status filter should render only matching request errors.');
      assertUiSmoke(errorRunnerRows[0].querySelector('.runner-status-badge')?.textContent === 'ERR', 'Runner ERR filter should keep request errors visible.');
      assertUiSmoke(
        $('runnerExecutionSummary').textContent.includes('1-1 of 1 result matching ERR'),
        'Runner ERR filter should summarize matching request errors.'
      );
      runnerStatusFilter.value = '500';
      runnerStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
      await nextPaint();
      const filteredRunnerRows = Array.from($('runnerExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(filteredRunnerRows.length === 1, 'Runner status filter should render only matching 500 responses.');
      assertUiSmoke(filteredRunnerRows[0].querySelector('.runner-status-badge')?.textContent === '500', 'Runner status filter should keep the selected status visible.');
      assertUiSmoke(
        $('runnerExecutionSummary').textContent.includes('1-1 of 1 result matching 500'),
        'Runner status filter should summarize the filtered execution range.'
      );
      assertUiSmoke($('runnerExecutionPagination').hidden === true, 'Runner status filter should hide pagination when filtered results fit on one page.');
      runnerStatusFilter.value = 'all';
      runnerStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
      await nextPaint();
      executionRows = Array.from($('runnerExecutionList').querySelectorAll('.runner-execution-row'));
      executionRows[1].click();
      assertUiSmoke($('runnerExecutionDetailsStatus').textContent === '500', 'Runner details should update when selecting an execution row.');
      assertUiSmoke($('runnerExecutionDetails').textContent.includes('runner request failed'), 'Runner details should show selected request script results.');
      assertUiSmoke($('runnerExecutionDetails').textContent.includes('Expected HTTP 200.'), 'Runner details should show selected request errors.');
      assertUiSmoke($('runnerExecutionDetails').textContent.includes('\n  <message>Bad status</message>'), 'Runner details should format selected request XML response body.');
      executionRows[0].click();
      assertUiSmoke($('runnerExecutionDetails').textContent.includes('runnerLocalToken'), 'Runner details should show selected request variables.');
      assertUiSmoke($('runnerExecutionDetails').textContent.includes('runnerEnvToken'), 'Runner details should show runner environment variables.');
      assertUiSmoke($('runnerExecutionDetails').textContent.includes('"runner": true'), 'Runner details should format selected request JSON response body.');
      $('runnerExecutionPagination').querySelector('[data-execution-page-action="next"]').click();
      const runnerSecondPageRows = Array.from($('runnerExecutionList').querySelectorAll('.runner-execution-row'));
      assertUiSmoke(runnerSecondPageRows.length === 25, 'Runner pagination should render only the remaining second-page results.');
      assertUiSmoke(runnerSecondPageRows[0].textContent.includes('Runner Result 101'), 'Runner second page should start at result 101.');
      $('runnerExecutionPagination').querySelector('[data-execution-page-action="first"]').click();
      const existingRunnerRequestCount = runner.requests.length;
      for (let index = existingRunnerRequestCount; index < existingRunnerRequestCount + 36; index += 1) {
        const overflowRequest = newRequestObject(`Overflow Runner Request ${index + 1}`);
        overflowRequest.url = `https://runner-overflow.example.test/${index + 1}`;
        runner.requests.push(overflowRequest);
      }
      renderRunnerRequestList(runner);
      await nextPaint();
      const runnerMainPanel = $('runnerMainPanel');
      const runnerEditorSection = $('runnerEditorSection');
      const runnerRequestList = $('runnerRequestList');
      const runnerPanelStyle = getComputedStyle(runnerMainPanel);
      const runnerEditorStyle = getComputedStyle(runnerEditorSection);
      const runnerRequestListStyle = getComputedStyle(runnerRequestList);
      const runnerResultsStyle = getComputedStyle($('runnerResults'));
      const runnerResize = $('runnerResultsResize');
      const runnerEditorRect = runnerEditorSection.getBoundingClientRect();
      const runnerResultsRect = $('runnerResults').getBoundingClientRect();
      const runnerResizeRect = runnerResize.getBoundingClientRect();
      assertUiSmoke(runnerPanelStyle.overflowY === 'hidden', 'Runner editor panel should not become the scroll container for many requests.');
      assertUiSmoke(runnerEditorStyle.borderTopStyle !== 'none' && runnerResultsStyle.borderTopStyle !== 'none', 'Runner config/request list and results should render as separate boxed sections.');
      assertUiSmoke(runnerRequestListStyle.overflowY === 'auto', 'Runner request list should own vertical scrolling for many requests.');
      assertUiSmoke(runnerResize.getAttribute('aria-orientation') === 'horizontal', 'Runner results splitter should expose horizontal separator semantics.');
      if (runnerMainPanel.clientHeight > 0) {
        assertUiSmoke(runnerRequestList.scrollHeight > runnerRequestList.clientHeight, 'Runner request list should scroll when many requests are present.');
        assertUiSmoke(
          $('runnerResults').getBoundingClientRect().bottom <= runnerMainPanel.getBoundingClientRect().bottom + 1,
          'Runner results pane should stay inside the visible runner editor when the request list overflows.'
        );
        assertUiSmoke(
          runnerEditorRect.bottom <= runnerResizeRect.top + 8 && runnerResizeRect.bottom <= runnerResultsRect.top + 8,
          'Runner results splitter should sit between the boxed request list and results panes.'
        );
        const runnerStartY = Math.round(runnerResizeRect.top + (runnerResizeRect.height / 2));
        const runnerStartValue = Math.round(runnerEditorSection.getBoundingClientRect().height);
        runnerResize.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: runnerStartY }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: runnerStartY }));
        const runnerSamePositionValue = Number(runnerResize.getAttribute('aria-valuenow'));
        assertUiSmoke(
          Math.abs(runnerSamePositionValue - runnerStartValue) <= 1,
          `Runner results resize should not jump on first mouse move. start=${runnerStartValue} same=${runnerSamePositionValue}.`
        );
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: runnerStartY + 24 }));
        const runnerMovedValue = Number(runnerResize.getAttribute('aria-valuenow'));
        assertUiSmoke(
          Math.abs(runnerMovedValue - (runnerStartValue + 24)) <= 2,
          `Runner results resize should track pointer delta. start=${runnerStartValue} moved=${runnerMovedValue}.`
        );
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        assertUiSmoke(!document.body.classList.contains('is-resizing'), 'Runner results resize did not exit resizing state.');
        runnerResize.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      }
      const firstRequestId = runner.requests[0].id;
      moveRunnerRequest(runner, 0, 1);
      assertUiSmoke(runner.requests[1].id === firstRequestId, 'Runner request move down did not reorder rows.');
      moveRunnerRequest(runner, 1, 0);
      assertUiSmoke(runner.requests[0].id === firstRequestId, 'Runner request move up did not reorder rows.');
      deleteRunnerRequest(runner, 0);
      assertUiSmoke(!runner.requests.some((request) => request.id === firstRequestId), 'Runner request delete did not remove the row.');
      $('runnerStopOnFailure').checked = true;
      dispatchChange($('runnerStopOnFailure'));
      $('runnerAllowEnvironmentMutation').checked = true;
      dispatchChange($('runnerAllowEnvironmentMutation'));
      assertUiSmoke(runner.stopOnFailure === true, 'Runner stop-on-failure setting did not persist to state.');
      assertUiSmoke(runner.allowEnvironmentMutation === true, 'Runner environment mutation setting did not persist to state.');
    } finally {
      workspace.environments = originalEnvironments;
      workspace.collections = originalCollections;
      workspace.history = originalHistory;
      workspace.runners = originalRunners;
      workspace.performanceTests = originalPerformanceTests;
      activeCollectionId = originalActiveCollectionId;
      activeFolderId = originalActiveFolderId;
      activeRequestId = originalActiveRequestId;
      activeRunnerRequestRunnerId = originalActiveRunnerRequestRunnerId;
      activeEnvironmentId = originalActiveEnvironmentId;
      activeRunnerConfigId = originalActiveRunnerConfigId;
      activePerformanceTestId = originalActivePerformanceTestId;
      activeWorkspaceId = originalActiveWorkspaceId;
      selectedWorkspaceId = originalSelectedWorkspaceId;
      activeSidebarPanel = originalSidebarPanel;
      activeMainPanel = originalMainPanel;
      openRequestTabs = originalRequestTabs;
      openEnvironmentTabs = originalEnvironmentTabs;
      openWorkspaceTabs = originalWorkspaceTabs;
      openRunnerTabs = originalRunnerTabs;
      openPerformanceTabs = originalPerformanceTabs;
      if (window.postmeter?.performance) {
        window.postmeter.performance.calibrate = originalPerformanceCalibrate;
        window.postmeter.performance.cancelCalibration = originalPerformanceCancelCalibration;
      }
      renderAll();
    }
  }

  function assertCreationSemanticsSmoke() {
    workspace.collections = [];
    activeEnvironmentId = 'none';
    clearActiveWorkspaceItem();
    resetRequestTabs();
    renderAll();

    assertUiSmoke($('newFolderButton').disabled, 'New Folder should be disabled without an active collection.');
    newFolder();
    assertUiSmoke(workspace.collections.length === 0, 'New Folder without a collection should not create a collection.');
    assertUiSmoke(!activeRequest(), 'New Folder without a collection should not create a request.');

    const draft = newRequest();
    assertUiSmoke(draft, 'New Request without collections should create an editable draft request.');
    assertUiSmoke(workspace.collections.length === 0, 'Draft request should not create or save a collection.');
    assertUiSmoke(activeRequest() === draft, 'Draft request should be active in the editor.');
    assertUiSmoke($('requestTabBar').querySelectorAll('.request-tab-button').length === 1, 'Draft request should open a request tab.');
    assertUiSmoke(!$('requestTabBar').querySelector('.request-tab-dirty').hidden, 'Draft request tab should show an unsaved marker.');
    selectSidebarPanel('workspaces');
    const draftTab = openRequestTabs.find((tab) => tab.draft && tab.requestId === draft.id);
    assertUiSmoke(draftTab, 'Draft request tab should remain available after switching sections.');
    selectRequestTab(draftTab);
    assertUiSmoke(activeSidebarPanel === 'collections', 'Selecting a request tab should switch the sidebar to Collections.');
    assertUiSmoke(activeMainPanel === 'request', 'Selecting a request tab should switch the main pane to request mode.');
    assertUiSmoke(activeRequest() === draft, 'Selecting a request tab should restore the active request.');
    assertUiSmoke(!document.getElementById('requestNameInput'), 'Request editor should not render a separate request name text box.');
    assertUiSmoke($('saveRequestButton')?.textContent === 'Save Request', 'Request editor should render a Save Request button.');
    assertUiSmoke(!$('saveRequestButton').disabled, 'Request editor should enable the request save button.');
    assertUiSmoke($('requestNameTitle').getAttribute('aria-label') === 'Request name', 'Request title should expose an accessible name.');
    assertUiSmoke(getComputedStyle($('requestNameTitle')).whiteSpace === 'nowrap', 'Request title should stay on a single line.');
    $('requestNameTitle').click();
    assertUiSmoke($('requestNameTitle').getAttribute('contenteditable') === 'plaintext-only', 'Clicking the request title should make it editable inline.');
    editRequestTitle('Draft Request');
    activateTab('request', 'body');
    $('bodyTypeSelect').value = 'FORM_DATA';
    dispatchChange($('bodyTypeSelect'));
    $('addFormDataBodyRowButton').click();
    let formDataRow = $('formDataBodyTable').querySelector('[data-body-form-data-row]');
    let formDataControls = formDataRow.querySelectorAll('select, input');
    formDataControls[1].value = 'text';
    dispatchChange(formDataControls[1]);
    formDataControls[2].value = 'message';
    dispatchInput(formDataControls[2]);
    formDataControls[3].value = '{{localToken}}';
    dispatchInput(formDataControls[3]);
    $('addFormDataBodyRowButton').click();
    formDataRow = $('formDataBodyTable').querySelectorAll('[data-body-form-data-row]')[1];
    formDataControls = formDataRow.querySelectorAll('select, input');
	    formDataControls[1].value = 'file';
	    dispatchChange(formDataControls[1]);
	    formDataControls[2].value = 'upload';
	    dispatchInput(formDataControls[2]);
	    formDataControls[3].click();
	    assertUiSmoke(!$('fileSourceMenu').hidden, 'Clicking a form-data file source field should open the local file source menu.');
	    assertUiSmoke($('fileSourceChooseButton')?.textContent.includes('Choose File'), 'The file source menu should offer the shared local file picker.');
	    document.body.click();
	    formDataControls[3].value = 'fixtures/upload.txt';
	    dispatchInput(formDataControls[3]);
    collectRequestFromEditor();
    assertUiSmoke(draft.bodyType === 'FORM_DATA', 'Request Body dropdown should collect form-data mode.');
    assertUiSmoke(
      draft.postmanBody?.formdata?.some((part) => part.key === 'message' && part.value === '{{localToken}}')
        && draft.postmanBody?.formdata?.some((part) => part.key === 'upload' && part.src === 'fixtures/upload.txt'),
      'Request form-data body should preserve text fields and file source references.'
    );
    assertUiSmoke(
      draft.postman?.fileReferences?.some((reference) => reference.source === 'fixtures/upload.txt' && reference.mode === 'formdata'),
      'Request form-data file rows should register sandbox file references.'
    );
    $('bodyTypeSelect').value = 'URLENCODED';
    dispatchChange($('bodyTypeSelect'));
    $('addUrlencodedBodyRowButton').click();
    const urlencodedControls = $('urlencodedBodyTable').querySelector('[data-body-urlencoded-row]').querySelectorAll('input');
    urlencodedControls[1].value = 'search';
    dispatchInput(urlencodedControls[1]);
    urlencodedControls[2].value = 'postmeter';
    dispatchInput(urlencodedControls[2]);
    collectRequestFromEditor();
    assertUiSmoke(
      draft.bodyType === 'URLENCODED' && draft.postmanBody?.urlencoded?.some((part) => part.key === 'search' && part.value === 'postmeter'),
      'Request Body dropdown should collect x-www-form-urlencoded rows.'
    );
	    $('bodyTypeSelect').value = 'BINARY';
	    dispatchChange($('bodyTypeSelect'));
	    $('binaryBodySourceInput').click();
	    assertUiSmoke(!$('fileSourceMenu').hidden, 'Clicking a binary file source field should open the local file source menu.');
	    document.body.click();
	    $('binaryBodySourceInput').value = '{{baseUrl}}';
	    dispatchInput($('binaryBodySourceInput'));
	    assertVariableHighlight($('binaryBodySourceInput'), 'baseUrl', 'Binary file source fields should highlight environment variable tokens.');
	    assertVariableHighlightUsesInputMetrics($('binaryBodySourceInput'), 'baseUrl', 'Binary file source highlighting should not alter input text metrics.');
	    $('binaryBodySourceInput').value = 'fixtures/binary.dat';
	    dispatchInput($('binaryBodySourceInput'));
    collectRequestFromEditor();
    assertUiSmoke(
      draft.bodyType === 'BINARY'
        && draft.postmanBody?.binary?.src === 'fixtures/binary.dat'
        && draft.postman?.fileReferences?.some((reference) => reference.source === 'fixtures/binary.dat' && reference.mode === 'binary'),
      'Request Body dropdown should collect binary file source references.'
    );
    $('bodyTypeSelect').value = 'GRAPHQL';
    dispatchChange($('bodyTypeSelect'));
    $('graphqlQueryInput').value = 'query User($id: ID!) { user(id: $id) { name } }';
    dispatchInput($('graphqlQueryInput'));
    $('graphqlVariablesInput').value = '{"id":"{{localToken}}"}';
    dispatchInput($('graphqlVariablesInput'));
    $('graphqlOperationNameInput').value = 'User';
    dispatchInput($('graphqlOperationNameInput'));
    collectRequestFromEditor();
    assertUiSmoke(
      draft.protocol === 'graphql'
        && draft.bodyType === 'RAW_JSON'
        && draft.postmanBody?.mode === 'graphql'
        && draft.graphql?.query?.includes('query User')
        && draft.graphql?.operationName === 'User',
      'Request Body dropdown should collect GraphQL query, variables, and operation name.'
    );
    const postmanGraphqlBody = JSON.parse(draft.body);
    assertUiSmoke(postmanGraphqlBody.variables === '{"id":"{{localToken}}"}', 'Request GraphQL body JSON should preserve variables text for Postman round-tripping.');
    assertUiSmoke(draft.name === 'Draft Request', 'Draft request should be editable before being saved anywhere.');

    const collection = newCollection();
    assertUiSmoke(collection, 'New collection should be created.');
    assertUiSmoke(collection.requests.length === 0, 'New collection should not auto-create a request.');
    assertUiSmoke(!activeRequest(), 'New collection should not auto-select a request.');
    assertUiSmoke(!$('newFolderButton').disabled, 'New Folder should be enabled when a collection is active.');
    const folder = newFolder();
    assertUiSmoke(folder, 'New Folder should create a folder when a collection is active.');
    assertUiSmoke(collection.folders.length === 1, 'New Folder should be added to the active collection.');
    const firstRequest = newRequest(collection.id, null);
    firstRequest.name = 'First Tab Request';
    renderAll();
    const secondRequest = newRequest(collection.id, null);
    secondRequest.name = 'Second Tab Request';
    renderAll();
    const firstTab = Array.from($('requestTabBar').querySelectorAll('.request-tab-button'))
      .find((button) => button.textContent.includes('First Tab Request'));
    assertUiSmoke(firstTab, 'Opened request tabs should include the first saved request.');
    firstTab.click();
    assertUiSmoke(activeRequest()?.id === firstRequest.id, 'Clicking an opened request tab should switch the active request.');
    const activeOpenTab = $('requestTabBar').querySelector('.request-tab-button.active');
    assertUiSmoke(activeOpenTab?.tabIndex === 0, 'Active opened request tab should be in the roving tab order.');
    const inactiveOpenTabs = Array.from($('requestTabBar').querySelectorAll('.request-tab-button:not(.active)'));
    assertUiSmoke(inactiveOpenTabs.every((tab) => tab.tabIndex === -1), 'Inactive opened request tabs should be removed from the roving tab order.');
    const tabCloseButtons = Array.from($('requestTabBar').querySelectorAll('.request-tab-close'));
    assertUiSmoke(tabCloseButtons.every((button) => button.tabIndex === -1), 'Opened tab close buttons should not enter the sequential tab order.');
    activeOpenTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assertUiSmoke(activeRequest()?.id === secondRequest.id, 'ArrowRight on an opened request tab should activate the next tab.');
    const tabBarWidth = $('requestTabBar').clientWidth || 800;
    const targetTabCount = Math.max(6, Math.floor(tabBarWidth / 100));
    for (let index = openRequestTabs.length; index < targetTabCount; index += 1) {
      const extraRequest = newRequest(collection.id, null);
      extraRequest.name = `Shrink Fit Request ${index + 1}`;
      renderAll();
    }
    assertUiSmoke(
      $('requestTabBar').scrollWidth <= $('requestTabBar').clientWidth + 4,
      `Opened tabs should shrink before the tab bar scrolls. scrollWidth=${$('requestTabBar').scrollWidth} clientWidth=${$('requestTabBar').clientWidth} tabs=${openRequestTabs.length} widths=${Array.from($('requestTabBar').querySelectorAll('.request-tab-item')).map((item) => Math.round(item.getBoundingClientRect().width)).join(',')}.`
    );
    const overflowTargetTabCount = Math.max(16, Math.ceil(tabBarWidth / 84) + 3);
    for (let index = openRequestTabs.length; index < overflowTargetTabCount; index += 1) {
      const extraRequest = newRequest(collection.id, null);
      extraRequest.name = `Overflow Tab Request ${index + 1}`;
      renderAll();
    }
    const renderedOpenTabItems = Array.from($('requestTabBar').querySelectorAll('.request-tab-item'));
    const totalOpenTabs = openRequestTabs.length + openEnvironmentTabs.length + openWorkspaceTabs.length;
    assertUiSmoke(openRequestTabs.length >= overflowTargetTabCount, 'Opening tabs past the old twelve-tab threshold should keep all opened tabs in state.');
    assertUiSmoke(renderedOpenTabItems.length === totalOpenTabs, 'Rendered opened tabs should match the open tab state after overflow.');
    assertUiSmoke($('requestTabBar').textContent.includes('First Tab Request'), 'Older opened tabs should remain available after the tab bar overflows.');
    assertUiSmoke(
      $('requestTabBar').scrollWidth > $('requestTabBar').clientWidth + 4,
      `Opened tabs should expand the scrollable tab strip after reaching minimum width. scrollWidth=${$('requestTabBar').scrollWidth} clientWidth=${$('requestTabBar').clientWidth} tabs=${openRequestTabs.length}.`
    );
    const activeCloseButton = $('requestTabBar').querySelector('.request-tab-item.active .request-tab-close');
    const inactiveCloseButton = $('requestTabBar').querySelector('.request-tab-item:not(.active) .request-tab-close');
    assertUiSmoke(getComputedStyle(activeCloseButton).opacity === '1', 'Active opened tab should show its close button.');
    assertUiSmoke(getComputedStyle(inactiveCloseButton).opacity === '0', 'Inactive opened tabs should hide close buttons until hover.');
    const openTabLimit = PostMeterRendererState.MAX_OPEN_TABS || 128;
    const cappedRequests = Array.from({ length: openTabLimit }, (_value, index) => ({
      id: `cap-request-${index + 1}`,
      name: `Cap Request ${index + 1}`,
      method: 'GET',
      url: '',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: { type: 'none' },
      assertions: [],
      variables: [],
      examples: []
    }));
    collection.requests = cappedRequests;
    collection.folders = [];
    activeCollectionId = collection.id;
    activeFolderId = null;
    activeRequestId = cappedRequests[0].id;
    openRequestTabs = cappedRequests.map((request) => ({
      key: `request:${collection.id}:${request.id}`,
      collectionId: collection.id,
      requestId: request.id,
      folderId: null,
      draft: false,
      dirty: false,
      createdUnsaved: false,
      snapshot: JSON.stringify(request)
    }));
    renderAll();
    const cappedRequestCount = collection.requests.length;
    const cappedFirstTabKey = openRequestTabs[0]?.key;
    const blockedRequest = newRequest(collection.id, null);
    assertUiSmoke(blockedRequest === null, 'New Request should be refused when the request tab limit is reached.');
    assertUiSmoke(collection.requests.length === cappedRequestCount, 'Refusing a new request tab should not create a request.');
    assertUiSmoke(openRequestTabs.length === openTabLimit, 'Refusing a new request tab should not change the open tab count.');
    assertUiSmoke(openRequestTabs[0]?.key === cappedFirstTabKey, 'Refusing a new request tab should not evict older tabs.');
    assertUiSmoke(lastStatusMessage.includes(`Cannot open more than ${openTabLimit} tabs`), 'Tab limit refusal should set a visible status message.');
    assertUiSmoke(lastUserNotification?.title === 'Open Tab Limit Reached', 'Tab limit refusal should notify the user.');

    workspace.collections = [];
    clearActiveWorkspaceItem();
    resetRequestTabs();
    renderAll();
  }

  async function assertRequestTabCloseSmoke() {
    const originalSaveWorkspace = window.__postmeterSaveWorkspace;
    const originalPostmeterWorkspaceSave = window.postmeter?.workspace?.save;
    const originalSaveRequest = window.__postmeterSaveRequest;
    const originalSaveEnvironment = window.__postmeterSaveEnvironment;
    let requestSaveCalls = 0;
    let environmentSaveCalls = 0;
    try {
      window.__postmeterSaveWorkspace = async (nextWorkspace) => nextWorkspace;
      window.__postmeterSaveRequest = async (payload) => {
        requestSaveCalls += 1;
        return {
          request: payload.request,
          collectionVariables: payload.collectionVariables,
          cookies: payload.cookies
        };
      };
      window.__postmeterSaveEnvironment = async (payload) => {
        environmentSaveCalls += 1;
        return {
          environment: payload.environment
        };
      };
      workspace.collections = [];
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();

      const draft = newRequest();
      editRequestTitle('Draft Close Smoke');
      const collection = newCollection();
      const draftTab = openRequestTabs.find((tab) => tab.draft && tab.requestId === draft.id);
      assertUiSmoke(draftTab, 'Draft request tab should remain open after creating a collection.');
      const closeDraft = closeRequestTab(draftTab);
      assertUiSmoke(!$('unsavedRequestModal').hidden, 'Closing an unsaved draft should show the unsaved request modal.');
      $('saveAndCloseRequestButton').click();
      await Promise.resolve();
      assertUiSmoke(!$('saveDraftRequestModal').hidden, 'Saving an unsaved draft should prompt for a collection.');
      assertUiSmoke($('confirmSaveDraftButton').disabled, 'Draft save button should be disabled until a collection is selected.');
      $('saveDraftCollectionList').querySelector('input[type="radio"]').click();
      assertUiSmoke(!$('confirmSaveDraftButton').disabled, 'Draft save button should enable after selecting a collection.');
      $('confirmSaveDraftButton').click();
      await closeDraft;
      assertUiSmoke(!draftRequests.has(draft.id), 'Saved draft should be removed from draft storage.');
      assertUiSmoke(collection.requests.length === 1, 'Saved draft should be inserted into the selected collection.');
      assertUiSmoke(collection.requests[0].name === 'Draft Close Smoke', 'Saved draft should preserve edited request fields.');
      assertUiSmoke(openRequestTabs.length === 0, 'Saved-and-closed draft tab should close.');

      activeCollectionId = null;
      activeFolderId = null;
      const failedDraft = newRequestObject('Draft Save Failure Smoke');
      draftRequests.set(failedDraft.id, failedDraft);
      activeRequestId = failedDraft.id;
      activeMainPanel = 'request';
      ensureOpenRequestTabForActive({ dirty: true });
      renderAll();
      const failedDraftTab = openRequestTabs.find((tab) => tab.draft && tab.requestId === failedDraft.id);
      const requestCountBeforeFailedSave = collection.requests.length;
      const failingWorkspaceSave = async () => {
        throw new Error('mock draft save failure');
      };
      window.__postmeterSaveWorkspace = failingWorkspaceSave;
      if (window.postmeter?.workspace) {
        window.postmeter.workspace.save = failingWorkspaceSave;
      }
      window.__postmeterSaveRequest = async () => {
        throw new Error('mock draft save failure');
      };
      lastUserNotification = null;
      const failedClose = closeRequestTab(failedDraftTab);
      $('saveAndCloseRequestButton').click();
      await Promise.resolve();
      $('saveDraftCollectionList').querySelector('input[type="radio"]').click();
      $('confirmSaveDraftButton').click();
      await failedClose;
      assertUiSmoke(draftRequests.has(failedDraft.id), 'Failed draft save should keep the draft in draft storage.');
      assertUiSmoke(collection.requests.length === requestCountBeforeFailedSave, 'Failed draft save should not insert the draft into the collection.');
      assertUiSmoke(openRequestTabs.some((tab) => tab.key === `draft:${failedDraft.id}` && tab.dirty), 'Failed draft save should keep the dirty draft tab open.');
      assertUiSmoke(lastUserNotification?.title === 'Request Save Failed', 'Failed draft save should show a popup notification.');
      assertStatusIncludes('Request Save Failed', 'Failed draft save should update the visible status.');
      window.__postmeterSaveWorkspace = async (nextWorkspace) => nextWorkspace;
      if (window.postmeter?.workspace && originalPostmeterWorkspaceSave) {
        window.postmeter.workspace.save = async (nextWorkspace) => nextWorkspace;
      }
      window.__postmeterSaveRequest = async (payload) => {
        requestSaveCalls += 1;
        return {
          request: payload.request,
          collectionVariables: payload.collectionVariables,
          cookies: payload.cookies
        };
      };
      draftRequests.delete(failedDraft.id);
      for (let index = openRequestTabs.length - 1; index >= 0; index -= 1) {
        if (openRequestTabs[index].requestId === failedDraft.id) {
          openRequestTabs.splice(index, 1);
        }
      }
      activeCollectionId = collection.id;
      activeFolderId = null;
      activeRequestId = null;
      renderAll();

      const request = newRequest(collection.id, null);
      await saveWorkspace(false);
      const savedRequestName = request.name;
      const requestSaveCallsBeforeBlurEdit = requestSaveCalls;
      editRequestTitle('Changed Saved Request');
      const savedTab = openRequestTabs.find((tab) => tab.requestId === request.id);
      assertUiSmoke(requestSaveCalls === requestSaveCallsBeforeBlurEdit, 'Blurring a changed request title should not save the request.');
      const closeSaved = closeRequestTab(savedTab);
      assertUiSmoke(!$('unsavedRequestModal').hidden, 'Closing a dirty saved request should show the unsaved request modal.');
      $('closeWithoutSavingButton').click();
      await closeSaved;
      assertUiSmoke(collection.requests.some((item) => item.id === request.id && item.name === savedRequestName), 'Closing without saving should restore the saved request snapshot.');

      activeCollectionId = collection.id;
      activeFolderId = null;
      activeRequestId = request.id;
      ensureOpenRequestTabForActive();
      renderAll();
      const requestSaveCallsBeforeEnterEdit = requestSaveCalls;
      const enterSavedRequestName = 'Enter Saved Request';
      editRequestTitle(enterSavedRequestName, { commit: false });
      pressEditableTitleEnter($('requestNameTitle'));
      await waitForUiSmoke(() => requestSaveCalls === requestSaveCallsBeforeEnterEdit + 1, 'Pressing Enter after changing the request title should save the request.', 3000, global);
      const enterSavedRequestTab = openRequestTabs.find((tab) => tab.requestId === request.id);
      assertUiSmoke(enterSavedRequestTab?.dirty === false, 'Saving a request title with Enter should clear the request dirty state.');
      assertUiSmoke(collection.requests.some((item) => item.id === request.id && item.name === enterSavedRequestName), 'Saving a request title with Enter should persist the request name.');

      activeCollectionId = collection.id;
      activeFolderId = null;
      activeRequestId = request.id;
      ensureOpenRequestTabForActive();
      renderAll();
      $('urlInput').value = 'https://saved-request.example.test/widgets';
      dispatchInput($('urlInput'));
      await saveWorkspace(false);
      const savedRequestId = request.id;
      const savedRequestMethod = request.method;
      const savedRequestUrl = request.url;
      const savedRequestCount = collection.requests.length;
      workspace.history = [{
        timestamp: new Date(0).toISOString(),
        method: savedRequestMethod,
        url: savedRequestUrl,
        statusCode: 200,
        durationMillis: 36
      }];
      openRequestTabs = [];
      activeCollectionId = null;
      activeFolderId = null;
      activeRequestId = null;
      activeMainPanel = 'environment';
      activeSidebarPanel = 'history';
      renderAll();
      assertUiSmoke($('requestEditorPanel').hidden, 'Request editor should be hidden before applying history from another main pane.');
      $('historyList').querySelector('.history-item').click();
      assertUiSmoke(activeMainPanel === 'request', 'Clicking a history entry should switch back to the request main pane.');
      assertUiSmoke(!$('requestEditorPanel').hidden, 'Clicking a history entry should show the request editor.');
      assertUiSmoke(!document.querySelector('.results').hidden, 'Clicking a history entry should show the response panel.');
      const noOpenHistoryDraft = activeRequest();
      assertUiSmoke(noOpenHistoryDraft, 'Clicking a history entry with no open requests should create an active draft request.');
      assertUiSmoke(activeCollectionId === null, 'Clicking a history entry with no open requests should open a draft request.');
      assertUiSmoke(noOpenHistoryDraft?.method === savedRequestMethod, 'History draft should use the history method when no request is open.');
      assertUiSmoke(noOpenHistoryDraft?.url === savedRequestUrl, 'History draft should use the history URL when no request is open.');
      assertUiSmoke(noOpenHistoryDraft?.name !== enterSavedRequestName, 'Opening history should not reuse the saved request name as the active draft name.');
      const noOpenHistoryTab = openRequestTabs.find((tab) => tab.requestId === noOpenHistoryDraft?.id);
      assertUiSmoke(noOpenHistoryTab?.draft === true && noOpenHistoryTab?.dirty === true, 'History entries should open as dirty draft request tabs.');
      const unchangedRequestAfterNoOpenHistory = collection.requests.find((item) => item.id === savedRequestId);
      assertUiSmoke(collection.requests.length === savedRequestCount, 'Opening history with no open request should not add a saved collection request.');
      assertUiSmoke(unchangedRequestAfterNoOpenHistory?.name === enterSavedRequestName, 'Opening history with no open request should not overwrite the saved request name.');
      assertUiSmoke(unchangedRequestAfterNoOpenHistory?.url === savedRequestUrl, 'Opening history with no open request should not change the saved request URL.');
      const closeNoOpenHistory = closeRequestTab(noOpenHistoryTab);
      assertUiSmoke(!$('unsavedRequestModal').hidden, 'Closing a history draft should show the unsaved request modal.');
      $('closeWithoutSavingButton').click();
      await closeNoOpenHistory;
      assertUiSmoke(!draftRequests.has(noOpenHistoryDraft.id), 'Closing a history draft without saving should discard the draft.');

      activeCollectionId = collection.id;
      activeFolderId = null;
      activeRequestId = savedRequestId;
      ensureOpenRequestTabForActive();
      renderAll();
      const savedRequestTabBeforeHistory = openRequestTabs.find((tab) => tab.requestId === savedRequestId);
      workspace.history = [{
        timestamp: new Date(0).toISOString(),
        method: 'POST',
        url: 'https://history.example.test/widgets',
        statusCode: 201,
        durationMillis: 42
      }];
      renderHistory();
      const historyItem = $('historyList').querySelector('.history-item');
      assertUiSmoke(historyItem, 'History list did not render a request entry for the close smoke.');
      historyItem.click();
      assertUiSmoke(activeRequest().method === 'POST', 'Clicking a history entry did not update the active request method.');
      assertUiSmoke(activeRequest().url === 'https://history.example.test/widgets', 'Clicking a history entry did not update the active request URL.');
      assertUiSmoke(activeCollectionId === null && activeRequestId !== savedRequestId, 'Clicking history with an open request should switch to a separate draft request.');
      const unchangedRequestAfterOpenHistory = collection.requests.find((item) => item.id === savedRequestId);
      assertUiSmoke(collection.requests.length === savedRequestCount, 'Opening history with an open request should not add a saved collection request.');
      assertUiSmoke(unchangedRequestAfterOpenHistory?.method === savedRequestMethod, 'Opening history with an open request should not change the saved request method.');
      assertUiSmoke(unchangedRequestAfterOpenHistory?.url === savedRequestUrl, 'Opening history with an open request should not change the saved request URL.');
      assertUiSmoke(unchangedRequestAfterOpenHistory?.name === enterSavedRequestName, 'Opening history with an open request should preserve the saved request name.');
      assertUiSmoke(savedRequestTabBeforeHistory?.dirty === false, 'Opening history with an open request should not mark the saved request tab dirty.');
      const historyTab = openRequestTabs.find((tab) => tab.requestId === activeRequestId);
      assertUiSmoke(historyTab?.draft === true && historyTab?.dirty === true, 'Selecting a history entry should open a dirty draft request tab.');
      const closeHistory = closeRequestTab(historyTab);
      assertUiSmoke(!$('unsavedRequestModal').hidden, 'Closing a history-opened draft should show the unsaved request modal.');
      $('closeWithoutSavingButton').click();
      await closeHistory;
      const restoredHistoryRequest = collection.requests.find((item) => item.id === request.id);
      assertUiSmoke(restoredHistoryRequest?.name === enterSavedRequestName, 'Closing a history draft without saving should keep the saved request name.');
      assertUiSmoke(restoredHistoryRequest?.url === savedRequestUrl, 'Closing a history draft without saving should keep the saved request URL.');

      workspace.collections = [];
      workspace.environments = [];
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();
      const tabCollection = newCollection();
      tabCollection.name = 'Tab Context Collection';
      const closeTarget = newRequest(tabCollection.id, null);
      editRequestTitle('Tab Context Close Target');
      const closeTargetTab = openRequestTabs.find((tab) => tab.requestId === closeTarget.id);
      openOpenTabContextMenu(closeTargetTab);
      const tabContextLabels = Array.from($('contextMenu').querySelectorAll('button')).map((button) => button.textContent.trim());
      for (const label of ['New Request', 'Close Tab', 'Close Other Tabs', 'Close All Tabs', 'Force Close Tab', 'Force Close Other Tabs', 'Force Close All Tabs']) {
        assertUiSmoke(tabContextLabels.includes(label), `Open-tab context menu should include ${label}.`);
      }
      activateContextMenuItem('Close Tab');
      await waitForUiSmoke(() => !$('unsavedRequestModal').hidden, 'Close Tab should prompt for a dirty request tab.', 3000, global);
      $('cancelCloseRequestButton').click();
      await Promise.resolve();
      assertUiSmoke(openRequestTabs.some((tab) => tab.key === closeTargetTab.key), 'Cancelling Close Tab should keep the dirty request tab open.');
      openOpenTabContextMenu(closeTargetTab);
      activateContextMenuItem('Force Close Tab');
      await waitForUiSmoke(() => !openRequestTabs.some((tab) => tab.key === closeTargetTab.key), 'Force Close Tab should close without prompting.', 3000, global);
      assertUiSmoke($('unsavedRequestModal').hidden, 'Force Close Tab should not leave an unsaved changes modal open.');
      assertUiSmoke(!tabCollection.requests.some((item) => item.id === closeTarget.id), 'Force Close Tab should discard an unsaved request by default.');

      const cleanOther = newRequest(tabCollection.id, null);
      editRequestTitle('Tab Context Clean Other', { commit: false });
      pressEditableTitleEnter($('requestNameTitle'));
      await waitForUiSmoke(() => !openRequestTabs.find((tab) => tab.requestId === cleanOther.id)?.dirty, 'Clean tab setup should save the request.', 3000, global);
      const cleanOtherTab = openRequestTabs.find((tab) => tab.requestId === cleanOther.id);
      const dirtyOther = newRequest(tabCollection.id, null);
      editRequestTitle('Tab Context Dirty Other');
      const dirtyOtherTab = openRequestTabs.find((tab) => tab.requestId === dirtyOther.id);
      const dirtyTarget = newRequest(tabCollection.id, null);
      editRequestTitle('Tab Context Dirty Target');
      const dirtyTargetTab = openRequestTabs.find((tab) => tab.requestId === dirtyTarget.id);
      openOpenTabContextMenu(dirtyTargetTab);
      activateContextMenuItem('Close Other Tabs');
      await waitForUiSmoke(() => !openRequestTabs.some((tab) => tab.key === cleanOtherTab.key), 'Close Other Tabs should close clean tabs before prompting for dirty tabs.', 3000, global);
      await waitForUiSmoke(() => !$('unsavedRequestModal').hidden, 'Close Other Tabs should prompt when it reaches a dirty tab.', 3000, global);
      $('cancelCloseRequestButton').click();
      await waitForUiSmoke(() => $('unsavedRequestModal').hidden, 'Cancelling Close Other Tabs should close the prompt.', 3000, global);
      assertUiSmoke(openRequestTabs.some((tab) => tab.key === dirtyOtherTab.key), 'Cancelling Close Other Tabs should keep the dirty tab that prompted.');
      assertUiSmoke(openRequestTabs.some((tab) => tab.key === dirtyTargetTab.key), 'Cancelling Close Other Tabs should keep the clicked tab.');
      openOpenTabContextMenu(dirtyTargetTab);
      activateContextMenuItem('Close All Tabs');
      await waitForUiSmoke(() => !$('unsavedRequestModal').hidden, 'Close All Tabs should prompt for dirty tabs.', 3000, global);
      $('cancelCloseRequestButton').click();
      await waitForUiSmoke(() => $('unsavedRequestModal').hidden, 'Cancelling Close All Tabs should close the prompt.', 3000, global);
      assertUiSmoke(openRequestTabs.some((tab) => tab.key === dirtyOtherTab.key), 'Cancelling Close All Tabs should keep dirty tabs open.');
      assertUiSmoke(openRequestTabs.some((tab) => tab.key === dirtyTargetTab.key), 'Cancelling Close All Tabs should keep the clicked dirty tab open.');
      openOpenTabContextMenu(dirtyTargetTab);
      activateContextMenuItem('Force Close All Tabs');
      await waitForUiSmoke(() => openRequestTabs.length === 0, 'Force Close All Tabs should close every request tab without prompting.', 3000, global);
      assertUiSmoke($('unsavedRequestModal').hidden, 'Force Close All Tabs should not prompt by default.');

      await setSaveOnForceClose(true, { save: false, showStatus: false });
      const saveOnForceRequest = newRequest(tabCollection.id, null);
      editRequestTitle('Tab Context Save On Force', { commit: false });
      pressEditableTitleEnter($('requestNameTitle'));
      await waitForUiSmoke(() => !openRequestTabs.find((tab) => tab.requestId === saveOnForceRequest.id)?.dirty, 'Save-on-force setup should persist the request.', 3000, global);
      const requestSaveCallsBeforeForceSave = requestSaveCalls;
      $('urlInput').value = 'https://force-close-save.example.test/widgets';
      dispatchInput($('urlInput'));
      const saveOnForceTab = openRequestTabs.find((tab) => tab.requestId === saveOnForceRequest.id);
      openOpenTabContextMenu(saveOnForceTab);
      activateContextMenuItem('Force Close Tab');
      await waitForUiSmoke(() => !openRequestTabs.some((tab) => tab.key === saveOnForceTab.key), 'Force Close Tab with saving enabled should close after saving.', 3000, global);
      assertUiSmoke(requestSaveCalls === requestSaveCallsBeforeForceSave + 1, 'Save on force close should save dirty saved request tabs.');
      assertUiSmoke(tabCollection.requests.find((item) => item.id === saveOnForceRequest.id)?.url === 'https://force-close-save.example.test/widgets', 'Save on force close should persist dirty request changes.');
      await setSaveOnForceClose(false, { save: false, showStatus: false });

      const activeDiscardRequest = newRequest(tabCollection.id, null);
      editRequestTitle('Tab Context Active Discard', { commit: false });
      pressEditableTitleEnter($('requestNameTitle'));
      await waitForUiSmoke(() => !openRequestTabs.find((tab) => tab.requestId === activeDiscardRequest.id)?.dirty, 'Active discard setup should save the first request.', 3000, global);
      const activeDiscardSavedUrl = tabCollection.requests.find((item) => item.id === activeDiscardRequest.id)?.url || '';
      const activeDiscardTab = openRequestTabs.find((tab) => tab.requestId === activeDiscardRequest.id);
      const rightClickOtherRequest = newRequest(tabCollection.id, null);
      editRequestTitle('Tab Context Right Click Other', { commit: false });
      pressEditableTitleEnter($('requestNameTitle'));
      await waitForUiSmoke(() => !openRequestTabs.find((tab) => tab.requestId === rightClickOtherRequest.id)?.dirty, 'Active discard setup should save the second request.', 3000, global);
      const rightClickOtherTab = openRequestTabs.find((tab) => tab.requestId === rightClickOtherRequest.id);
      selectRequestTab(activeDiscardTab);
      $('urlInput').value = 'https://active-discard.example.test/should-not-save';
      dispatchInput($('urlInput'));
      const requestSaveCallsBeforeActiveDiscard = requestSaveCalls;
      openOpenTabContextMenu(rightClickOtherTab);
      activateContextMenuItem('Close Other Tabs');
      await waitForUiSmoke(() => !$('unsavedRequestModal').hidden, 'Close Other Tabs from an inactive tab should prompt for the active dirty tab.', 3000, global);
      $('closeWithoutSavingButton').click();
      await waitForUiSmoke(() => !openRequestTabs.some((tab) => tab.key === activeDiscardTab.key), 'Close without saving should close the active dirty tab.', 3000, global);
      assertUiSmoke(requestSaveCalls === requestSaveCallsBeforeActiveDiscard, 'Close without saving from Close Other Tabs should not save the active dirty tab.');
      assertUiSmoke(tabCollection.requests.find((item) => item.id === activeDiscardRequest.id)?.url === activeDiscardSavedUrl, 'Close without saving from Close Other Tabs should restore the active dirty tab snapshot.');

      workspace.environments = [];
      activeEnvironmentId = 'none';
      const environment = newEnvironment();
      await saveWorkspace(false);
      const savedEnvironmentName = environment.name;
      const environmentSaveCallsBeforeBlurEdit = environmentSaveCalls;
      editEnvironmentTitle('Changed Saved Environment');
      const environmentTab = openEnvironmentTabs.find((tab) => tab.environmentId === environment.id);
      assertUiSmoke(environmentSaveCalls === environmentSaveCallsBeforeBlurEdit, 'Blurring a changed environment title should not save the environment.');
      assertUiSmoke(environmentTab?.dirty === true, 'Editing an environment should mark its tab as dirty.');
      assertUiSmoke(!$('requestTabBar').querySelector('.environment-tab-button .request-tab-dirty').hidden, 'Dirty environment tab should show an unsaved marker.');
      const closeEnvironment = closeEnvironmentTab(environmentTab);
      assertUiSmoke(!$('unsavedRequestModal').hidden, 'Closing a dirty environment should show the unsaved changes modal.');
      $('closeWithoutSavingButton').click();
      await closeEnvironment;
      assertUiSmoke(workspace.environments.some((item) => item.id === environment.id && item.name === savedEnvironmentName), 'Closing an environment without saving should restore the saved snapshot.');

      activeEnvironmentId = environment.id;
      activeSidebarPanel = 'environments';
      activeMainPanel = 'environment';
      ensureOpenEnvironmentTabForActive();
      renderAll();
      const environmentSaveCallsBeforeEnterEdit = environmentSaveCalls;
      editEnvironmentTitle('Enter Saved Environment', { commit: false });
      pressEditableTitleEnter($('environmentMainTitle'));
      await waitForUiSmoke(() => environmentSaveCalls === environmentSaveCallsBeforeEnterEdit + 1, 'Pressing Enter after changing the environment title should save the environment.', 3000, global);
      const enterSavedEnvironmentTab = openEnvironmentTabs.find((tab) => tab.environmentId === environment.id);
      assertUiSmoke(enterSavedEnvironmentTab?.dirty === false, 'Saving an environment title with Enter should clear the environment dirty state.');
      assertUiSmoke(workspace.environments.some((item) => item.id === environment.id && item.name === 'Enter Saved Environment'), 'Saving an environment title with Enter should persist the environment name.');
    } finally {
      window.__postmeterSaveWorkspace = originalSaveWorkspace;
      if (window.postmeter?.workspace && originalPostmeterWorkspaceSave) {
        window.postmeter.workspace.save = originalPostmeterWorkspaceSave;
      }
      window.__postmeterSaveRequest = originalSaveRequest;
      window.__postmeterSaveEnvironment = originalSaveEnvironment;
      workspace.collections = [];
      workspace.environments = [];
      activeEnvironmentId = 'none';
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();
    }
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiRegressionSmoke.js.');
  }

  const exported = {
    runUiRegressionSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiRegressionSmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
