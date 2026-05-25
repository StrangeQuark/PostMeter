(function attachUiSnapshotSmoke(global) {
  const {
    assertContextMenuSmoke,
    assertUiSmoke,
    captureUiSnapshotState,
    dispatchChange,
    dispatchInput
  } = resolveUiSmokeCommon(global);

  async function runUiSnapshotSmoke() {
    const { UI_SNAPSHOT_LABELS } = resolveUiSnapshotManifest(global);
    const captured = new Set();
    const capture = async (label, setup) => {
      await captureUiSnapshotState(label, setup, global);
      captured.add(label);
    };

    workspace.collections = [];
    workspace.environments = [];
    workspace.history = [];
    workspace.cookies = [];
    activeEnvironmentId = 'none';
    clearActiveWorkspaceItem();
    renderAll();
    await capture('empty-state', () => {
      selectSidebarPanel('collections');
      renderAll();
    });

    newCollection();
    newRequest();
    const collection = activeCollection();
    const request = activeRequest();
    assertUiSmoke(request, 'Snapshot request was not created.');
    collection.name = 'Snapshot Collection';
    collection.variables.push({ enabled: true, key: 'baseUrl', value: 'https://api.snapshot.test' });
    request.name = 'List Widgets';
    request.method = 'POST';
    request.url = 'https://api.snapshot.test/widgets?expand=owner';
    request.queryParams.push({ enabled: true, key: 'limit', value: '25' });
    request.headers.push({ enabled: true, key: 'Accept', value: 'application/json' });
    request.bodyType = 'RAW_JSON';
    request.body = '{\n  "name": "hammer"\n}';
    const environment = newEnvironment();
    environment.name = 'Snapshot Environment';
    environment.variables = [
      { enabled: true, key: 'baseUrl', value: 'https://api.snapshot.test' },
      { enabled: false, key: 'disabledToken', value: 'hidden' }
    ];
    activeEnvironmentId = environment.id;
    workspace.history.push({
      timestamp: new Date(0).toISOString(),
      method: 'POST',
      url: request.url,
      statusCode: 200,
      durationMillis: 42
    });
    renderAll();
    await capture('request', () => {
      activateTab('request', 'body');
    });

    await capture('environment-editor', () => {
      selectSidebarPanel('environments');
      activeEnvironmentEditorId = environment.id;
      ensureOpenEnvironmentTabForActive();
      renderAll();
    });

    await capture('workspace-panel', () => {
      selectSidebarPanel('workspaces');
      selectWorkspaceItem(activeWorkspaceId || workspaceListItems()[0]?.id);
      renderWorkspacePanel();
    });

    selectSidebarPanel('collections');
    activeCollectionId = collection.id;
    activeRequestId = request.id;
    renderAll();

    await capture('context-menu', () => {
      assertContextMenuSmoke({ keepOpen: true }, global);
    });
    closeContextMenu();

    await capture('cookies', () => {
      activateTab('request', 'requestSettings');
      $('openRequestCookiesButton').click();
      $('cookiesDomainInput').value = 'api.snapshot.test';
      dispatchInput($('cookiesDomainInput'));
      $('cookiesAddDomainButton').click();
      const addCookieButton = $('cookiesDomainList').querySelector('.cookie-add-inline-button');
      assertUiSmoke(addCookieButton, 'Snapshot cookie domain was not rendered.');
      addCookieButton.click();
      const editor = $('cookiesDomainList').querySelector('.cookie-text-editor textarea');
      assertUiSmoke(editor, 'Snapshot cookie text editor was not rendered.');
      editor.value = 'snapshotSession=secret; Path=/; Secure; HttpOnly; SameSite=Lax;';
      dispatchInput(editor);
    });

    await capture('auth-oauth', () => {
      activateTab('request', 'auth');
      $('authTypeSelect').value = 'oauth2';
      dispatchChange($('authTypeSelect'));
      $('authOauthGrantTypeSelect').value = 'authorizationCode';
      dispatchChange($('authOauthGrantTypeSelect'));
      $('authOauthAuthorizationUrlInput').value = 'https://auth.snapshot.test/authorize';
      dispatchInput($('authOauthAuthorizationUrlInput'));
      renderOauthProgress({
        type: 'pkce',
        status: 'waitingForAuthorization',
        message: 'Waiting for authorization callback.',
        redirectUri: 'http://127.0.0.1:42123/oauth/callback'
      });
    });

    await capture('auth-basic-bearer', () => {
      activateTab('request', 'auth');
      $('authTypeSelect').value = 'basic';
      dispatchChange($('authTypeSelect'));
      $('authBasicUsernameInput').value = 'snapshot-user';
      dispatchInput($('authBasicUsernameInput'));
      $('authBasicPasswordInput').value = 'snapshot-password';
      dispatchInput($('authBasicPasswordInput'));
    });

    await capture('body-formdata', () => {
      activateTab('request', 'body');
      $('bodyTypeSelect').value = 'FORM_DATA';
      dispatchChange($('bodyTypeSelect'));
      $('addFormDataBodyRowButton').click();
      const rows = $('formDataBodyTable').querySelectorAll('[data-body-form-data-row]');
      if (rows.length) {
        const controls = rows[0].querySelectorAll('select, input');
        controls[1].value = 'file';
        dispatchChange(controls[1]);
        controls[2].value = 'avatar';
        dispatchInput(controls[2]);
        controls[3].value = 'snapshot.png';
        dispatchInput(controls[3]);
      }
    });

    await capture('body-graphql', () => {
      activateTab('request', 'body');
      $('bodyTypeSelect').value = 'GRAPHQL';
      dispatchChange($('bodyTypeSelect'));
      $('graphqlQueryInput').value = 'query SnapshotWidget($id: ID!) { widget(id: $id) { id name owner { id } } }';
      dispatchInput($('graphqlQueryInput'));
      $('graphqlVariablesInput').value = '{\n  "id": "{{widgetId}}"\n}';
      dispatchInput($('graphqlVariablesInput'));
      $('graphqlOperationNameInput').value = 'SnapshotWidget';
      dispatchInput($('graphqlOperationNameInput'));
    });

    await capture('response', () => {
      activateTab('results', 'response');
      displayResponse({
        statusCode: 200,
        durationMillis: 42,
        responseBytes: 37,
        finalUrl: 'https://api.snapshot.test/widgets?expand=owner',
        headers: { 'content-type': ['application/json'], 'x-trace': ['snapshot'] },
        body: '{"data":{"id":"w1","name":"hammer"}}'
      });
    });

    await capture('response-headers-cookies', () => {
      activateTab('results', 'responseHeaders');
      displayResponse({
        statusCode: 201,
        durationMillis: 51,
        responseBytes: 54,
        finalUrl: 'https://api.snapshot.test/widgets',
        headers: {
          'content-type': ['application/json'],
          'set-cookie': ['snapshotSession=secret; Path=/; Secure; HttpOnly; SameSite=Lax'],
          'x-trace': ['snapshot-response']
        },
        body: '{"created":true}'
      });
    });

    await capture('test-results', () => {
      activateTab('results', 'testResults');
      displayResponse({
        statusCode: 200,
        durationMillis: 39,
        responseBytes: 2,
        finalUrl: 'https://api.snapshot.test/widgets?expand=owner',
        headers: { 'content-type': ['application/json'] },
        body: '{}',
        preRequestScriptResult: {
          passed: false,
          tests: [{
            name: 'pre-request token is available',
            passed: false,
            error: 'Expected pm.sendRequest is disabled for this workspace. to equal null.'
          }],
          error: '',
          logs: []
        },
        testScriptResult: {
          passed: true,
          tests: [{ name: 'response status is 200', passed: true, error: '' }],
          error: '',
          logs: ['post-request console output']
        }
      });
    });

    await capture('runner-editor', () => {
      selectSidebarPanel('runners');
      const runner = newRunner();
      runner.name = 'Snapshot Runner';
      runner.requests = [
        { ...newRequestObject('Snapshot Health'), method: 'GET', url: 'https://api.snapshot.test/health' },
        { ...newRequestObject('Snapshot Create'), method: 'POST', url: 'https://api.snapshot.test/widgets' }
      ];
      renderAll();
    });

    await capture('runner', () => {
      selectSidebarPanel('runners');
      const runner = activeRunner();
      lastRunnerResult = {
        collectionName: 'Snapshot Runner',
        totalRequests: 2,
        passedRequests: 1,
        failedRequests: 1,
        passed: false,
        cancelled: false,
        collectionVariables: [{ enabled: true, key: 'baseUrl', value: 'https://api.snapshot.test' }],
        environment: { id: 'snapshot-env', name: 'Snapshot Env', variables: [] },
        results: [
          {
            requestId: runner.requests[0].id,
            requestName: 'Snapshot Health',
            statusCode: 200,
            durationMillis: 42,
            passed: true,
            preRequestScriptResult: { passed: true, tests: [] },
            testScriptResult: { passed: true, tests: [{ name: 'health response is OK', passed: true }] },
            localVariables: []
          },
          {
            requestId: runner.requests[1].id,
            requestName: 'Snapshot Create',
            statusCode: 500,
            durationMillis: 57,
            passed: false,
            preRequestScriptResult: { passed: true, tests: [] },
            testScriptResult: { passed: false, tests: [{ name: 'create response is accepted', passed: false, error: 'Expected 202.' }] },
            localVariables: []
          }
        ]
      };
      renderRunnerExecutionResult(lastRunnerResult);
      $('exportRunnerResultsButton').disabled = false;
      $('exportRunnerHtmlButton').disabled = false;
      $('exportRunnerJsonButton').disabled = false;
      $('exportRunnerCsvButton').disabled = false;
    });

    await capture('performance-editor', () => {
      selectSidebarPanel('performance');
      const performance = newPerformanceTest();
      performance.name = 'Snapshot Endpoint Diagnosis';
      performance.type = 'diagnosis';
      performance.request = {
        ...newRequestObject('Snapshot Diagnosis'),
        method: 'GET',
        url: 'https://api.snapshot.test/diagnostic'
      };
      renderAll();
    });

    await capture('performance-calibration', () => {
      selectSidebarPanel('performance');
      renderAll();
      $('modalBackdrop').hidden = false;
      for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
        modal.hidden = modal.id !== 'performanceCalibrationModal';
      }
    });
    $('modalBackdrop').hidden = true;
    $('performanceCalibrationModal').hidden = true;

    await capture('settings-general', () => {
      $('modalBackdrop').hidden = false;
      for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
        modal.hidden = modal.id !== 'settingsModal';
      }
      selectSettingsSection('appearance');
      renderSettingsControls();
    });

    await capture('settings-certificates', () => {
      selectSettingsSection('certificates');
      renderSettingsControls();
    });

    await capture('diagnostics-settings', () => {
      selectSettingsSection('diagnostics');
      renderSettingsControls();
    });

    await capture('package-cache', () => {
      selectSettingsSection('packages');
      refreshSandboxPackageStatus();
    });

    await capture('file-bindings', () => {
      selectSettingsSection('files');
      refreshSandboxFileBindings();
    });

    $('modalBackdrop').hidden = true;
    $('settingsModal').hidden = true;

    await capture('vault-prompt', () => {
      $('vaultPromptRequestName').textContent = 'Snapshot Request';
      $('vaultPromptCollectionName').textContent = 'Snapshot Collection';
      $('vaultPromptWorkspaceName').textContent = workspace.name || 'Workspace';
      $('vaultPromptSecretKey').textContent = 'snapshotSecret';
      $('vaultPromptOperation').textContent = 'get';
      $('vaultPromptMessage').textContent = 'A script is asking to get a local vault secret.';
      $('modalBackdrop').hidden = false;
      for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
        modal.hidden = modal.id !== 'vaultPromptModal';
      }
    });
    $('modalBackdrop').hidden = true;
    $('vaultPromptModal').hidden = true;

    await capture('tutorial-overlay', () => {
      openTutorialsModal();
      const firstTutorial = $('tutorialList')?.querySelector?.('button');
      if (firstTutorial) {
        firstTutorial.click();
      }
      $('startTutorialButton')?.click();
    });
    if (typeof endTutorial === 'function') {
      endTutorial();
    }
    $('modalBackdrop').hidden = true;
    $('tutorialsModal').hidden = true;
    $('tutorialOverlay').hidden = true;

    await capture('workspace-sandbox', () => {
      selectWorkspaceItem(activeWorkspaceId || workspaceListItems()[0]?.id);
      refreshSandboxPackageStatus();
      refreshSandboxFileBindings();
      renderWorkspacePanel();
      renderSettingsControls();
      selectSettingsSection('scripts');
      $('modalBackdrop').hidden = false;
      for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
        modal.hidden = modal.id !== 'settingsModal';
      }
    });
    $('modalBackdrop').hidden = true;
    $('settingsModal').hidden = true;

    await capture('long-labels', () => {
      selectSidebarPanel('collections');
      activeCollectionId = collection.id;
      activeRequestId = request.id;
      request.name = 'Request with a very long production label that should truncate cleanly without breaking the constrained desktop layout';
      collection.name = 'Collection with a very long production label that should remain scannable in the tree';
      ensureOpenRequestTabForActive();
      renderAll();
    });

    await capture('export-menu', () => {
      closeContextMenu();
      activateTab('request', 'headers');
      $('exportMenuButton').click();
    });
    closeToolbarMenus();

    const missing = UI_SNAPSHOT_LABELS.filter((label) => !captured.has(label));
    assertUiSmoke(missing.length === 0, `Snapshot smoke did not capture expected labels: ${missing.join(', ')}.`);
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiSnapshotSmoke.js.');
  }

  function resolveUiSnapshotManifest(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSnapshotManifest) {
      return runtimeGlobal.PostMeterUiSnapshotManifest;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSnapshotManifest');
    }
    throw new Error('PostMeter UI snapshot manifest must load before uiSnapshotSmoke.js.');
  }

  const exported = {
    runUiSnapshotSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiSnapshotSmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
