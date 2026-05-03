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
    assertToolbarMenuSmoke('newMenuButton', 'newMenu', ['Workspace', 'Request', 'Collection', 'Folder', 'Environment']);
    assertToolbarMenuSmoke('importMenuButton', 'importMenu', ['Workspace', 'Collection']);
    assertToolbarMenuSmoke('exportMenuButton', 'exportMenu', ['Workspace', 'Collection', 'Postman', 'OpenAPI', 'JMeter', 'curl', 'HAR']);
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
    await assertSidebarPanelSmoke();
    await assertModalFocusSmoke();
    assertUiSmoke($('statusLabel')?.getAttribute('role') === 'status', 'App status should render as a live status region.');
    setStatus('Regression status visible.');
    assertStatusIncludes('Regression status visible', 'setStatus should update visible app status.');
    assertUiSmoke(!$('checkUpdatesButton'), 'Updates toolbar button should be handled by the Help menu.');
    assertUiSmoke(!$('includePrereleasesInput'), 'Prereleases setting should be handled by the Help menu.');
    await assertUpdateCheckSmoke();
    assertOauthProgressSmoke();
    await assertWorkspaceManagementSmoke();
    await assertWorkspaceSandboxAccessibilitySmoke();
    await assertLargeWorkspaceBudgetSmoke();
    await assertEditorCollectionSmoke();
    assertCreationSemanticsSmoke();
    await assertRequestTabCloseSmoke();

    newCollection();
    assertContextMenuSmoke({ keyboard: true }, global);
    assertContextMenuKeyboardActivationSmoke();
    await assertTreeContextMenuModalFocusSmoke();
    newRequest();
    assertMethodColorSmoke();
    $('urlInput').value = 'https://api.example.test/v1/users';
    dispatchInput($('urlInput'));
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
      headers: { 'content-type': ['application/xml'] },
      body: '<response><title>Smoke</title></response>'
    });
    assertUiSmoke($('responseBody').value.includes('\n  <title>Smoke</title>'), `XML response body was not formatted: ${$('responseBody').value}`);
    displayResponse({
      statusCode: 200,
      durationMillis: 1,
      responseBytes: 64,
      finalUrl: 'https://api.example.test/html',
      headers: { 'content-type': ['text/html'] },
      body: '<!doctype html><html><body><h1>Smoke</h1></body></html>'
    });
    assertUiSmoke($('responseBody').value.includes('\n    <h1>Smoke</h1>'), `HTML response body was not formatted: ${$('responseBody').value}`);
    await assertValidationErrorSmoke();
    await assertRequestSendFailureSmoke();
    await assertExportCancellationSmoke();
    await assertOauthFlowSmoke();

    activateTab('results', 'runner');
    assertUiSmoke($('exportRunnerJsonButton').disabled, 'Runner JSON export should be disabled before a run.');
    assertUiSmoke($('exportRunnerCsvButton').disabled, 'Runner CSV export should be disabled before a run.');
    assertUiSmoke($('runnerStopOnFailure'), 'Runner stop-on-failure control is missing.');
  }

  function assertConstrainedViewportSmoke() {
    assertUiSmoke(window.innerWidth <= 1100, `Regression smoke should run at the constrained desktop width, got ${window.innerWidth}.`);
    assertUiSmoke(window.innerHeight <= 760, `Regression smoke should run at the constrained desktop height, got ${window.innerHeight}.`);
    assertUiSmoke(document.documentElement.scrollWidth <= window.innerWidth + 2, 'Constrained viewport should not produce page-level horizontal overflow.');
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
    const focusTarget = $('themeLightButton');
    focusTarget.focus({ preventScroll: true });
    await nextPaint();
    assertUiSmoke(document.activeElement === focusTarget, 'Forced-colors focus probe should move focus to the theme control.');
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
  }

  function assertAccessibilitySemanticsSmoke() {
    assertUiSmoke(document.querySelector('.tabs[data-tab-group="request"][role="tablist"]'), 'Request tabs should expose tablist semantics.');
    assertUiSmoke($('requestParamsTabButton').getAttribute('role') === 'tab', 'Request tab button should expose role=tab.');
    assertUiSmoke($('paramsTab').getAttribute('role') === 'tabpanel', 'Request params panel should expose role=tabpanel.');
    activateTab('request', 'headers');
    assertUiSmoke($('requestHeadersTabButton').getAttribute('aria-selected') === 'true', 'Active request tab should update aria-selected.');
    assertUiSmoke($('headersTab').getAttribute('aria-hidden') === 'false', 'Active request panel should update aria-hidden.');
    assertUiSmoke($('paramsTab').getAttribute('aria-hidden') === 'true', 'Inactive request panel should update aria-hidden.');
    activateTab('results', 'load');
    assertUiSmoke($('resultsLoadTabButton').getAttribute('aria-selected') === 'true', 'Active results tab should update aria-selected.');
    assertUiSmoke($('loadResults').getAttribute('aria-live') === 'polite', 'Load results should be announced as a live region.');
    assertUiSmoke($('runnerResults').getAttribute('aria-live') === 'polite', 'Runner results should be announced as a live region.');
    assertUiSmoke($('statusLabel').getAttribute('aria-live') === 'polite', 'App status should be announced as a live region.');
    assertUiSmoke($('validationLabel').getAttribute('role') === 'status', 'Validation output should expose role=status.');
    assertUiSmoke($('oauthProgressPanel').getAttribute('aria-live') === 'polite', 'OAuth progress should be a live region.');
    assertUiSmoke($('responseBody').getAttribute('aria-label') === 'Response body', 'Response body textarea should have an accessible label.');
    activateTab('request', 'params');
    activateTab('results', 'response');
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

    const draftTrigger = $('saveButton');
    draftTrigger.focus();
    renderSaveDraftCollectionList();
    const draftResult = showModal('saveDraftRequestModal', null);
    assertUiSmoke(document.activeElement === $('cancelSaveDraftButton'), 'Save-draft modal should focus the cancel action.');
    $('cancelSaveDraftButton').click();
    assertUiSmoke(await draftResult === null, 'Save-draft modal should resolve null when cancelled.');
    assertUiSmoke(document.activeElement === draftTrigger, 'Save-draft modal should restore focus to the opener.');

    const vaultTrigger = $('saveButton');
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
      renderThemeControl();
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
      renderThemeControl();
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
      const renamePromise = renameWorkspace(createdWorkspaceId);
      await resolveTextInputModal('Renamed Workspace', 'Workspace rename should use the in-app text input modal.');
      await renamePromise;
      assertUiSmoke(activeWorkspaceId === originalWorkspaceId, 'Renaming a non-current workspace should not switch the loaded workspace.');
      assertUiSmoke(selectedWorkspaceId === 'Renamed Workspace.json', 'Renaming the selected workspace should update the selected workspace id.');
      assertUiSmoke(workspaceDisplayName() === 'Renamed Workspace', 'Renaming the selected workspace should update the viewed workspace name.');
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
      assertUiSmoke(!$('renameWorkspacePanelButton').hidden, 'Workspace details should still render rename.');
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
      assertUiSmoke($('requestNameInput').value === 'Large Request 29.1.3', 'Large request open did not populate the editor.');
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
      cookieJar: { enabled: false, storeResponses: true },
      loadTestPolicy: { enabled: false }
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
    $('requestNameInput').value = 'Pending Navigation Request';
    selectSidebarPanel('workspaces');
    assertUiSmoke(request.name === 'Pending Navigation Request', 'Switching sidebar panels should collect the active request editor before rerendering.');

    selectSidebarPanel('collections');
    const firstEnvironment = newEnvironment();
    const secondEnvironment = newEnvironment();
    activeEnvironmentId = firstEnvironment.id;
    ensureOpenEnvironmentTabForActive();
    renderAll();
    $('environmentNameInput').value = 'Pending Environment Rename';
    const secondEnvironmentButton = Array.from($('environmentsList').querySelectorAll('button'))
      .find((button) => button.textContent.includes(secondEnvironment.name));
    assertUiSmoke(secondEnvironmentButton, 'Environment list did not render the second environment for navigation smoke.');
    secondEnvironmentButton.click();
    assertUiSmoke(
      workspace.environments.find((item) => item.id === firstEnvironment.id)?.name === 'Pending Environment Rename',
      'Selecting a different environment should collect the current environment editor before rerendering.'
    );
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

  function assertToolbarMenuSmoke(buttonId, menuId, expectedLabels) {
    const button = $(buttonId);
    const menu = $(menuId);
    button.click();
    assertUiSmoke(menu.hidden === false, `${menuId} did not open.`);
    assertUiSmoke(button.getAttribute('aria-expanded') === 'true', `${buttonId} did not update aria-expanded.`);
    const labels = Array.from(menu.querySelectorAll('button')).map((item) => item.textContent.trim());
    for (const label of expectedLabels) {
      assertUiSmoke(labels.includes(label), `${menuId} missing ${label}.`);
    }
    closeToolbarMenus();
    assertUiSmoke(menu.hidden === true, `${menuId} did not close.`);
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }));
    assertUiSmoke(menu.hidden === false, `${menuId} did not open from keyboard.`);
    const items = Array.from(menu.querySelectorAll('button'));
    const enabledItems = items.filter((item) => !item.disabled);
    assertUiSmoke(document.activeElement === enabledItems[0], `${menuId} should focus the first item when opened from keyboard.`);
    enabledItems[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }));
    assertUiSmoke(document.activeElement === enabledItems[1], `${menuId} should support arrow-key item navigation.`);
    enabledItems[1].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'End' }));
    assertUiSmoke(document.activeElement === enabledItems.at(-1), `${menuId} should support End key item navigation.`);
    enabledItems.at(-1).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }));
    assertUiSmoke(
      document.activeElement === enabledItems.at(-2),
      `${menuId} should navigate relative to the focused enabled menu item.`
    );
    enabledItems.at(-2).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    assertUiSmoke(menu.hidden === true, `${menuId} should close on Escape.`);
    assertUiSmoke(document.activeElement === button, `${menuId} should restore focus to its trigger on Escape.`);
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
      await resolveTextInputModal('Focus Request Renamed', 'Request rename should use the in-app text input modal.');
      await nextPaint();
      const renamedRequestButton = treeButtonByTarget('request', renameRequestTarget.id);
      assertUiSmoke(renamedRequestButton?.textContent.includes('Focus Request Renamed'), 'Request rename did not rerender the replacement tree button.');
      assertUiSmoke(document.activeElement === renamedRequestButton, 'Request rename should restore focus to the replacement tree button.');

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

  function cssAttributeValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function openKeyboardContextMenu(button) {
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ContextMenu' }));
    assertUiSmoke(!$('contextMenu').hidden, 'Keyboard context menu should open for tree items.');
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
    assertUiSmoke($('statusLabel').textContent.includes(text), `${message} Visible app status did not update.`);
  }

  async function waitForStatusIncludes(text, message) {
    await waitForUiSmoke(
      () => lastStatusMessage.includes(text) && $('statusLabel').textContent.includes(text),
      `${message} Visible app status did not update.`,
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
    const originalActiveEnvironmentId = activeEnvironmentId;
    const originalActiveWorkspaceId = activeWorkspaceId;
    const originalSelectedWorkspaceId = selectedWorkspaceId;
    const originalSidebarPanel = activeSidebarPanel;
    const originalMainPanel = activeMainPanel;
    const originalEnvironmentTabs = structuredClone(openEnvironmentTabs);
    const originalWorkspaceTabs = structuredClone(openWorkspaceTabs);
    try {
      assertUiSmoke(!$('environmentTab'), 'Environment request tab panel should be removed from the request editor.');
      assertUiSmoke(!document.querySelector('.tab[data-tab-group="request"][data-tab="environment"]'), 'Environment should not appear in the request tab row.');
      assertUiSmoke(!$('newEnvironmentButton'), 'Environments sidebar should not render its own New button.');
      for (const panel of ['collections', 'environments', 'workspaces', 'history']) {
        assertUiSmoke(document.querySelector(`.sidebar-tab[data-sidebar-panel="${panel}"]`), `Sidebar tab missing ${panel}.`);
        selectSidebarPanel(panel);
        assertUiSmoke(!document.querySelector(`[data-sidebar-panel-content="${panel}"]`).hidden, `Sidebar panel ${panel} did not open.`);
      }
      workspace.environments = [];
      activeEnvironmentId = 'none';
      selectSidebarPanel('environments');
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
      assertUiSmoke($('environmentMainPanel').getBoundingClientRect().bottom > document.querySelector('.workspace').getBoundingClientRect().bottom - 24, 'Environment editor should fill the main workspace area.');
      assertUiSmoke($('requestTabBar').textContent.includes(environment.name), 'Creating an environment should open an environment tab.');
      assertUiSmoke($('requestTabBar').getAttribute('aria-label') === 'Open requests, environments, and workspaces', 'Opened tablist label should cover request, environment, and workspace tabs.');
      assertUiSmoke($('environmentNameInput').getAttribute('aria-label') === 'Environment name', 'Environment name input should expose an accessible label.');
      const environmentVariableRow = $('environmentTable').querySelector('.env-row');
      assertUiSmoke(environmentVariableRow, 'Environment variable editor did not render the default row.');
      assertUiSmoke(environmentVariableRow.querySelector('[aria-label="Environment variable 1 enabled"]'), 'Environment variable enabled control should expose a contextual accessible label.');
      assertUiSmoke(environmentVariableRow.querySelector('[aria-label="Environment variable 1 name"]'), 'Environment variable name input should expose a contextual accessible label.');
      assertUiSmoke(environmentVariableRow.querySelector('[aria-label="Environment variable 1 value"]'), 'Environment variable value input should expose a contextual accessible label.');
      assertUiSmoke(environmentVariableRow.querySelector('[aria-label^="Remove environment variable"]'), 'Environment variable remove button should expose a contextual accessible label.');
      assertUiSmoke(!$('environmentsSidebarPanel').querySelector('#environmentNameInput'), 'Environment editor controls should not render in the sidebar.');
      assertUiSmoke($('environmentsList').textContent.includes(environment.name), 'Environments panel did not render the new environment.');
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
      selectSidebarPanel('workspaces');
      assertUiSmoke($('workspacesList').textContent.includes(workspaceDisplayName()), 'Workspaces panel did not render the current workspace list item.');
      assertUiSmoke(!$('workspaceMainPanel').hidden, 'Selecting Workspaces should show the main workspace editor.');
      assertUiSmoke(!$('saveWorkspacePanelButton'), 'Workspace details should not render a save button.');
      assertUiSmoke(!$('importWorkspacePanelButton'), 'Workspace details should not render an import button.');
      assertUiSmoke($('requestEditorPanel').hidden, 'Request editor should be hidden while viewing workspace details.');
      assertUiSmoke(document.querySelector('.results').hidden, 'Response panel should be hidden while viewing workspace details.');
      assertUiSmoke($('workspaceSummary').textContent.includes('Workspace File'), 'Workspace main panel did not render workspace details.');
      assertUiSmoke($('switchWorkspacePanelButton').disabled, 'Current workspace details should disable the switch button.');
      assertUiSmoke($('requestTabBar').textContent.includes(workspaceDisplayName()), 'Selecting Workspaces should open a workspace tab.');
      openRequestTabs = [];
      openEnvironmentTabs = [];
      closeWorkspaceTab(openWorkspaceTabs.find((tab) => tab.workspaceId === selectedWorkspaceId));
      assertUiSmoke(activeSidebarPanel === 'workspaces', 'Closing the last workspace tab should keep the Workspaces sidebar selected.');
      assertUiSmoke(activeMainPanel === 'workspace', 'Closing the last workspace tab should keep the main pane in workspace mode.');
      assertUiSmoke(!$('workspaceEmptyPanel').hidden, 'Closing the last workspace tab should show the select workspace screen.');
      assertUiSmoke($('workspaceEmptyPanel').textContent.includes('Select a workspace'), 'Workspace empty state should ask the user to select a workspace.');
      assertUiSmoke($('requestEmptyPanel').hidden, 'Closing the last workspace tab should not show the create request screen.');
    } finally {
      workspace.environments = originalEnvironments;
      activeEnvironmentId = originalActiveEnvironmentId;
      activeWorkspaceId = originalActiveWorkspaceId;
      selectedWorkspaceId = originalSelectedWorkspaceId;
      activeSidebarPanel = originalSidebarPanel;
      activeMainPanel = originalMainPanel;
      openEnvironmentTabs = originalEnvironmentTabs;
      openWorkspaceTabs = originalWorkspaceTabs;
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
    $('requestNameInput').value = 'Draft Request';
    dispatchInput($('requestNameInput'));
    collectRequestFromEditor();
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
    try {
      window.__postmeterSaveWorkspace = async (nextWorkspace) => nextWorkspace;
      window.__postmeterSaveRequest = async (payload) => ({
        request: payload.request,
        collectionVariables: payload.collectionVariables,
        cookies: payload.cookies
      });
      window.__postmeterSaveEnvironment = async (payload) => ({
        environment: payload.environment
      });
      workspace.collections = [];
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();

      const draft = newRequest();
      $('requestNameInput').value = 'Draft Close Smoke';
      dispatchInput($('requestNameInput'));
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
      window.__postmeterSaveRequest = async (payload) => ({
        request: payload.request,
        collectionVariables: payload.collectionVariables,
        cookies: payload.cookies
      });
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
      $('requestNameInput').value = 'Changed Saved Request';
      dispatchInput($('requestNameInput'));
      const savedTab = openRequestTabs.find((tab) => tab.requestId === request.id);
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
      const savedRequestUrl = request.url;
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
      const historyTab = openRequestTabs.find((tab) => tab.requestId === request.id);
      assertUiSmoke(historyTab?.dirty === true, 'Selecting a history entry should mark the active request tab as dirty.');
      const closeHistory = closeRequestTab(historyTab);
      assertUiSmoke(!$('unsavedRequestModal').hidden, 'Closing a request updated from history should show the unsaved request modal.');
      $('closeWithoutSavingButton').click();
      await closeHistory;
      const restoredHistoryRequest = collection.requests.find((item) => item.id === request.id);
      assertUiSmoke(restoredHistoryRequest?.name === savedRequestName, 'Closing a history-updated request without saving should restore the saved request name.');
      assertUiSmoke(restoredHistoryRequest?.url === savedRequestUrl, 'Closing a history-updated request without saving should restore the saved request URL.');

      workspace.environments = [];
      activeEnvironmentId = 'none';
      const environment = newEnvironment();
      await saveWorkspace(false);
      const savedEnvironmentName = environment.name;
      $('environmentNameInput').value = 'Changed Saved Environment';
      dispatchInput($('environmentNameInput'));
      const environmentTab = openEnvironmentTabs.find((tab) => tab.environmentId === environment.id);
      assertUiSmoke(environmentTab?.dirty === true, 'Editing an environment should mark its tab as dirty.');
      assertUiSmoke(!$('requestTabBar').querySelector('.environment-tab-button .request-tab-dirty').hidden, 'Dirty environment tab should show an unsaved marker.');
      const closeEnvironment = closeEnvironmentTab(environmentTab);
      assertUiSmoke(!$('unsavedRequestModal').hidden, 'Closing a dirty environment should show the unsaved changes modal.');
      $('closeWithoutSavingButton').click();
      await closeEnvironment;
      assertUiSmoke(workspace.environments.some((item) => item.id === environment.id && item.name === savedEnvironmentName), 'Closing an environment without saving should restore the saved snapshot.');
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
