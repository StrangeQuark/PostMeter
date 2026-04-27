(function attachUiRegressionSmoke(global) {
  const {
    assertUiSmoke,
    dispatchChange,
    dispatchInput
  } = resolveUiSmokeCommon(global);

  async function runUiRegressionSmoke() {
    assertUiSmoke(workspace.collections.length === 0, 'Regression smoke should start with an empty workspace.');
    assertUiSmoke(!/(sign in|log in|create account|register)/i.test(document.body.textContent), 'Standalone UI should not render app account/login language.');
    assertToolbarMenuSmoke('newMenuButton', 'newMenu', ['Workspace', 'Request', 'Collection', 'Folder', 'Environment']);
    assertToolbarMenuSmoke('importMenuButton', 'importMenu', ['Workspace', 'Collection']);
    assertToolbarMenuSmoke('exportMenuButton', 'exportMenu', ['Workspace', 'Collection', 'Postman', 'OpenAPI', 'JMeter', 'curl', 'HAR']);
    await setThemePreference('dark', { save: false, showStatus: false });
    assertUiSmoke(document.documentElement.dataset.theme === 'dark', 'Dark theme was not applied.');
    assertUiSmoke($('themeDarkButton').getAttribute('aria-pressed') === 'true', 'Dark theme control did not show active state.');
    await setThemePreference('system', { save: false, showStatus: false });
    assertUiSmoke(document.documentElement.dataset.theme === 'system', 'System theme was not restored.');
    await assertSidebarPanelSmoke();
    assertUiSmoke(!$('statusLabel'), 'Topbar status message should not render.');
    assertUiSmoke(!$('checkUpdatesButton'), 'Updates toolbar button should be handled by the Help menu.');
    assertUiSmoke(!$('includePrereleasesInput'), 'Prereleases setting should be handled by the Help menu.');
    await assertUpdateCheckSmoke();
    assertOauthProgressSmoke();
    await assertWorkspaceManagementSmoke();
    await assertEditorCollectionSmoke();
    assertCreationSemanticsSmoke();
    await assertRequestTabCloseSmoke();

    newCollection();
    newRequest();
    assertMethodColorSmoke();
    $('urlInput').value = 'https://api.example.test/v1/users';
    dispatchInput($('urlInput'));
    activateTab('request', 'cookies');
    assertUiSmoke($('requestCookieJarEnabledInput'), 'Cookie jar request toggle is missing.');
    $('addCookieButton').click();
    assertUiSmoke($('cookiesTable').querySelector('.cookie-row'), 'Cookie editor did not create a row.');
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
    assertUiSmoke($('examplesList').querySelector('.example-item'), 'Example editor did not create a row.');
    activateTab('request', 'collectionVariables');
    $('addRequestVariableButton').click();
    assertUiSmoke($('requestVariablesTable').querySelector('.kv-row'), 'Request variable editor did not create a row.');
    activateTab('request', 'tests');
    $('assertionTemplateSelect').value = 'headerContains';
    dispatchChange($('assertionTemplateSelect'));
    $('addAssertionTemplateButton').click();
    const assertionRow = $('assertionsTable').querySelector('.assertion-row');
    assertUiSmoke(assertionRow, 'Assertion template did not create a row.');
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
    await assertExportCancellationSmoke();
    await assertOauthFlowSmoke();

    activateTab('results', 'runner');
    assertUiSmoke($('exportRunnerJsonButton').disabled, 'Runner JSON export should be disabled before a run.');
    assertUiSmoke($('exportRunnerCsvButton').disabled, 'Runner CSV export should be disabled before a run.');
    assertUiSmoke($('runnerStopOnFailure'), 'Runner stop-on-failure control is missing.');
  }

  async function assertUpdateCheckSmoke() {
    const originalCheck = window.__postmeterUpdateCheck;
    const originalOpen = window.__postmeterOpenExternal;
    const originalConfirm = window.confirm;
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
      window.confirm = () => false;
      await handleAppMenuAction({ type: 'set-prereleases', includePrereleases: true });
      await checkForUpdates();
      assertUiSmoke(checkOptions?.includePrereleases === true, 'Update check did not pass prerelease opt-in.');
      assertUiSmoke(lastStatusMessage.includes('0.3.0'), 'Update check did not track latest version.');
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
      window.confirm = originalConfirm;
    }
  }

  async function assertWorkspaceManagementSmoke() {
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;
    const originalSaveWorkspace = window.__postmeterSaveWorkspace;
    try {
      window.confirm = () => true;
      window.prompt = () => 'Renamed Workspace';
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
      await renameWorkspace(createdWorkspaceId);
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
      assertUiSmoke(!$('switchWorkspacePanelButton').hidden, 'Workspace details should render the switch action.');
      assertUiSmoke(!$('renameWorkspacePanelButton').hidden, 'Workspace details should still render rename.');
      await switchWorkspace(renamedWorkspaceId, { focus: 'workspace' });
      assertUiSmoke(activeWorkspaceId === renamedWorkspaceId, 'Switching workspaces should update the active workspace id.');
      assertUiSmoke(selectedWorkspaceId === renamedWorkspaceId, 'Switching workspaces should keep the selected workspace in view.');
      assertUiSmoke(workspace.collections.length === 0, 'Switching workspaces should load the selected workspace contents.');
      await deleteWorkspace(renamedWorkspaceId);
      assertUiSmoke(workspaceListItems().length === 1, 'Deleting a workspace should remove it from the managed workspace list.');
      assertUiSmoke($('deleteWorkspacePanelButton').disabled, 'Workspace delete should disable again when one workspace remains.');
    } finally {
      window.confirm = originalConfirm;
      window.prompt = originalPrompt;
      window.__postmeterSaveWorkspace = originalSaveWorkspace;
      workspace.collections = [];
      workspace.environments = [];
      activeEnvironmentId = 'none';
      clearActiveWorkspaceItem();
      resetRequestTabs();
      renderAll();
    }
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
      status: 'waitingForCallback',
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
    assertUiSmoke(lastStatusMessage.includes('Fix validation errors'), 'Invalid request did not track validation status.');
    assertUiSmoke($('validationLabel').textContent.length > 0, 'Invalid request did not render validation details.');
  }

  async function assertExportCancellationSmoke() {
    const originalExportExamples = window.__postmeterExportExamples;
    const originalExportCollection = window.__postmeterExportCollection;
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

      let exportedFormat = '';
      window.__postmeterExportCollection = async (_collection, format) => {
        exportedFormat = format;
        return { cancelled: true };
      };
      setStatus('Ready.');
      await exportCollection(activeCollection(), 'openapi');
      assertUiSmoke(exportedFormat === 'openapi', 'Collection export did not pass the selected format.');
      assertUiSmoke(lastStatusMessage === 'Ready.', 'Cancelled collection export should leave the current status unchanged.');
    } finally {
      window.__postmeterExportExamples = originalExportExamples;
      window.__postmeterExportCollection = originalExportCollection;
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
      assertUiSmoke(lastStatusMessage.includes('OAuth authorization completed'), 'PKCE completion did not complete cleanly.');

      $('authOauthGrantTypeSelect').value = 'deviceCode';
      dispatchChange($('authOauthGrantTypeSelect'));
      $('authOauthDeviceAuthorizationUrlInput').value = 'https://auth.example.test/device';
      dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
      window.__postmeterStartDeviceFlow = async () => {
        throw new Error('mocked device failure');
      };
      await startDeviceFlow();
      assertUiSmoke(lastStatusMessage.includes('OAuth device authorization failed'), 'Device-code failure did not fail cleanly.');
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

    workspace.collections = [];
    clearActiveWorkspaceItem();
    resetRequestTabs();
    renderAll();
  }

  async function assertRequestTabCloseSmoke() {
    const originalSaveWorkspace = window.__postmeterSaveWorkspace;
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
