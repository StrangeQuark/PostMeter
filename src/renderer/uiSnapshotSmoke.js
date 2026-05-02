(function attachUiSnapshotSmoke(global) {
  const {
    assertContextMenuSmoke,
    assertUiSmoke,
    captureUiSnapshotState,
    dispatchChange,
    dispatchInput
  } = resolveUiSmokeCommon(global);

  async function runUiSnapshotSmoke() {
    workspace.collections = [];
    workspace.environments = [];
    workspace.history = [];
    workspace.cookies = [];
    activeEnvironmentId = 'none';
    clearActiveWorkspaceItem();
    renderAll();
    await captureUiSnapshotState('empty-state', () => {
      selectSidebarPanel('collections');
      renderAll();
    }, global);

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
    request.assertions.push(newAssertion(ASSERTION_TEMPLATES.status200));
    workspace.history.push({
      timestamp: new Date(0).toISOString(),
      method: 'POST',
      url: request.url,
      statusCode: 200,
      durationMillis: 42
    });
    renderAll();
    await captureUiSnapshotState('request', () => {
      activateTab('request', 'body');
    }, global);

    await captureUiSnapshotState('context-menu', () => {
      assertContextMenuSmoke({ keepOpen: true }, global);
    }, global);
    closeContextMenu();

    await captureUiSnapshotState('cookies', () => {
      activateTab('request', 'cookies');
      $('addCookieButton').click();
      const row = $('cookiesTable').querySelector('.cookie-row');
      assertUiSmoke(row, 'Snapshot cookie row was not rendered.');
      const inputs = row.querySelectorAll('input');
      inputs[1].value = 'snapshotSession';
      dispatchInput(inputs[1]);
      inputs[2].value = 'secret';
      dispatchInput(inputs[2]);
      $('filterCookiesToRequestHostInput').checked = true;
      dispatchChange($('filterCookiesToRequestHostInput'));
    }, global);

    await captureUiSnapshotState('auth-oauth', () => {
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
    }, global);

    await captureUiSnapshotState('response', () => {
      activateTab('results', 'response');
      displayResponse({
        statusCode: 200,
        durationMillis: 42,
        responseBytes: 37,
        finalUrl: 'https://api.snapshot.test/widgets?expand=owner',
        headers: { 'content-type': ['application/json'], 'x-trace': ['snapshot'] },
        body: '{"data":{"id":"w1","name":"hammer"}}'
      });
    }, global);

    await captureUiSnapshotState('runner', () => {
      activateTab('results', 'runner');
      $('runnerResults').textContent = [
        'Collection: Snapshot Collection',
        'Passed: true',
        'Total: 2',
        'Passed requests: 2',
        '',
        'Runtime Variables',
        'Collection baseUrl = https://api.snapshot.test'
      ].join('\n');
      $('exportRunnerJsonButton').disabled = false;
      $('exportRunnerCsvButton').disabled = false;
    }, global);

    await captureUiSnapshotState('load', () => {
      activateTab('results', 'load');
      $('loadResults').textContent = [
        'Completed requests: 12',
        'Successful: 12',
        'Failed: 0',
        'Throughput: 24.00 req/s',
        'Latency histogram: <=50ms:8 <=100ms:4'
      ].join('\n');
      $('exportLoadJsonButton').disabled = false;
      $('exportLoadCsvButton').disabled = false;
    }, global);

    await captureUiSnapshotState('workspace-sandbox', () => {
      selectSidebarPanel('workspaces');
      refreshSandboxPackageStatus();
      refreshSandboxFileBindings();
      renderWorkspacePanel();
    }, global);

    await captureUiSnapshotState('long-labels', () => {
      selectSidebarPanel('collections');
      activeCollectionId = collection.id;
      activeRequestId = request.id;
      request.name = 'Request with a very long production label that should truncate cleanly without breaking the constrained desktop layout';
      collection.name = 'Collection with a very long production label that should remain scannable in the tree';
      ensureOpenRequestTabForActive();
      renderAll();
    }, global);

    await captureUiSnapshotState('export-menu', () => {
      closeContextMenu();
      activateTab('request', 'headers');
      $('exportMenuButton').click();
    }, global);
    closeToolbarMenus();
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

  const exported = {
    runUiSnapshotSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiSnapshotSmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
