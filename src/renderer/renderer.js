const BODY_TYPES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const TAB_PANEL_IDS = {
  request: ['paramsTab', 'headersTab', 'authTab', 'cookiesTab', 'bodyTab', 'testsTab', 'scriptsTab', 'examplesTab', 'collectionVariablesTab', 'environmentTab'],
  results: ['responseTab', 'loadTab', 'runnerTab']
};
const ASSERTION_TEMPLATES = {
  status200: { type: 'statusCode', operator: 'equals', expected: '200', name: '', path: '', variableName: '' },
  jsonPathExists: { type: 'jsonPath', operator: 'exists', expected: '', name: '', path: '$', variableName: '' },
  xmlPathExists: { type: 'xmlPath', operator: 'exists', expected: '', name: '', path: '/*', variableName: '' },
  htmlSelectorExists: { type: 'htmlSelector', operator: 'exists', expected: '', name: '', path: 'body', variableName: '' },
  headerContains: { type: 'header', operator: 'contains', expected: 'application/json', name: 'Content-Type', path: '', variableName: '' },
  responseUnderOneSecond: { type: 'responseTime', operator: 'lessThan', expected: '1000', name: '', path: '', variableName: '' },
  responseUnder10Kb: { type: 'responseSize', operator: 'lessThan', expected: '10240', name: '', path: '', variableName: '' },
  bodyContains: { type: 'bodyContains', operator: 'contains', expected: '', name: '', path: '', variableName: '' },
  extractVariable: { type: 'extractVariable', operator: 'exists', expected: '', name: 'token', path: '$.token', variableName: 'token' },
  extractXml: { type: 'extractXml', operator: 'exists', expected: '', name: 'token', path: 'string(//token)', variableName: 'token' },
  extractHtml: { type: 'extractHtml', operator: 'exists', expected: '', name: 'title', path: 'title', variableName: 'title' },
  extractRegex: { type: 'extractRegex', operator: 'exists', expected: '"token"\\s*:\\s*"([^"]+)"', name: 'token', path: '', variableName: 'token' }
};

let workspace;
let workspacePath;
let activeCollectionId;
let activeFolderId = null;
let activeRequestId;
let activeEnvironmentId = 'none';
let activeLoadId = null;
let activeOauthFlowId = null;
let activeRunnerId = null;
let lastLoadResult = null;
let lastRunnerResult = null;
let lastResponse = null;
let lastStatusMessage = 'Ready';
let lastUserNotification = null;
let unsubscribeLoadProgress = null;
let unsubscribeOauthProgress = null;
let unsubscribeRunnerProgress = null;
let unsubscribeMenuActions = null;

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  bindUi();
  unsubscribeMenuActions = window.postmeter.app.onMenuAction(handleAppMenuAction);
  unsubscribeLoadProgress = window.postmeter.loadTest.onProgress(({ id, progress }) => {
    if (id === activeLoadId) {
      $('loadResults').textContent = formatLoadProgress(progress);
    }
  });
  unsubscribeOauthProgress = window.postmeter.oauth.onProgress((progress) => {
    if (progress.id === activeOauthFlowId) {
      renderOauthProgress(progress);
    }
  });
  unsubscribeRunnerProgress = window.postmeter.runner.onProgress(({ id, progress }) => {
    if (id === activeRunnerId) {
      $('runnerResults').textContent = `Running collection...\nCompleted ${progress.completedRequests} of ${progress.totalRequests} requests.\nLast: ${progress.requestName} ${progress.passed ? 'passed' : 'failed'}`;
    }
  });
  const loaded = await window.postmeter.workspace.load();
  workspace = loaded.workspace;
  workspacePath = loaded.path;
  selectInitialWorkspaceItem();
  renderAll();
  setStatus(`Workspace loaded: ${workspacePath}`);
  queueUiWorkflowSmoke();
  queueUiRegressionSmoke();
  queueUiSnapshotSmoke();
  queueUiOauthSmoke();
});

window.addEventListener('beforeunload', () => {
  if (unsubscribeLoadProgress) {
    unsubscribeLoadProgress();
  }
  if (unsubscribeOauthProgress) {
    unsubscribeOauthProgress();
  }
  if (unsubscribeRunnerProgress) {
    unsubscribeRunnerProgress();
  }
  if (unsubscribeMenuActions) {
    unsubscribeMenuActions();
  }
});

function bindUi() {
  bindToolbarMenus();
  $('newCollectionButton').addEventListener('click', newCollection);
  $('newFolderButton').addEventListener('click', () => newFolder());
  $('newRequestButton').addEventListener('click', newRequest);
  $('saveButton').addEventListener('click', saveWorkspace);
  $('importWorkspaceButton').addEventListener('click', importWorkspace);
  $('exportWorkspaceButton').addEventListener('click', exportWorkspace);
  $('importCollectionButton').addEventListener('click', importCollection);
  $('exportCollectionButton').addEventListener('click', exportCollection);
  $('exportOpenApiButton').addEventListener('click', () => exportCollection(activeCollection(), 'openapi'));
  $('exportJMeterButton').addEventListener('click', () => exportCollection(activeCollection(), 'jmeter'));
  $('exportCurlButton').addEventListener('click', () => exportCollection(activeCollection(), 'curl'));
  $('exportHarButton').addEventListener('click', () => exportCollection(activeCollection(), 'har'));
  $('sendButton').addEventListener('click', sendActiveRequest);
  $('addParamButton').addEventListener('click', () => addPair('queryParams'));
  $('addHeaderButton').addEventListener('click', () => addPair('headers'));
  $('addAssertionButton').addEventListener('click', () => addAssertion());
  $('addAssertionTemplateButton').addEventListener('click', addAssertionTemplate);
  $('addExampleButton').addEventListener('click', addExample);
  $('captureResponseExampleButton').addEventListener('click', captureResponseExample);
  $('exportExamplesButton').addEventListener('click', exportRequestExamples);
  $('newEnvironmentButton').addEventListener('click', newEnvironment);
  $('deleteEnvironmentButton').addEventListener('click', deleteEnvironment);
  $('addVariableButton').addEventListener('click', addVariable);
  $('addCollectionVariableButton').addEventListener('click', addCollectionVariable);
  $('addRequestVariableButton').addEventListener('click', addRequestVariable);
  $('addCookieButton').addEventListener('click', addCookie);
  $('clearExpiredCookiesButton').addEventListener('click', clearExpiredCookies);
  $('runLoadButton').addEventListener('click', runLoadTest);
  $('cancelLoadButton').addEventListener('click', cancelLoadTest);
  $('exportLoadJsonButton').addEventListener('click', () => exportLoadResult('json'));
  $('exportLoadCsvButton').addEventListener('click', () => exportLoadResult('csv'));
  $('runCollectionButton').addEventListener('click', runActiveCollection);
  $('cancelRunnerButton').addEventListener('click', cancelCollectionRun);
  $('exportRunnerJsonButton').addEventListener('click', () => exportRunnerResult('json'));
  $('exportRunnerCsvButton').addEventListener('click', () => exportRunnerResult('csv'));
  $('startPkceFlowButton').addEventListener('click', startPkceFlow);
  $('startDeviceFlowButton').addEventListener('click', startDeviceFlow);
  $('cancelOauthFlowButton').addEventListener('click', cancelOauthFlow);
  $('environmentSelect').addEventListener('change', () => {
    activeEnvironmentId = $('environmentSelect').value;
    renderEnvironmentEditor();
  });
  $('requestNameInput').addEventListener('input', collectRequestFromEditor);
  $('methodSelect').addEventListener('change', collectRequestFromEditor);
  $('urlInput').addEventListener('input', () => {
    collectRequestFromEditor();
    renderCookieJarEditor();
  });
  $('bodyTypeSelect').addEventListener('change', collectRequestFromEditor);
  $('bodyInput').addEventListener('input', collectRequestFromEditor);
  $('preRequestScriptInput').addEventListener('input', collectRequestFromEditor);
  $('testScriptInput').addEventListener('input', collectRequestFromEditor);
  $('requestCookieJarEnabledInput').addEventListener('change', collectRequestFromEditor);
  $('requestCookieJarStoreInput').addEventListener('change', collectRequestFromEditor);
  $('filterCookiesToRequestHostInput').addEventListener('change', renderCookieJarEditor);
  $('environmentNameInput').addEventListener('input', collectEnvironmentFromEditor);
  for (const id of [
    'authTypeSelect',
    'authBearerTokenInput',
    'authBasicUsernameInput',
    'authBasicPasswordInput',
    'authApiKeyLocationSelect',
    'authApiKeyNameInput',
    'authApiKeyValueInput',
    'authCookieValueInput',
    'authOauthGrantTypeSelect',
    'authOauthTokenTypeSelect',
    'authOauthAccessTokenInput',
    'authOauthRefreshTokenInput',
    'authOauthAuthorizationUrlInput',
    'authOauthRedirectStrategySelect',
    'authOauthDeviceAuthorizationUrlInput',
    'authOauthTokenUrlInput',
    'authOauthClientIdInput',
    'authOauthClientSecretInput',
    'authOauthScopesInput',
    'authOauthUserCodeInput',
    'authOauthVerificationUriInput',
    'authClientPfxPathInput',
    'authClientCertPathInput',
    'authClientKeyPathInput',
    'authClientCaPathInput',
    'authClientPassphraseInput'
  ]) {
    const input = $(id);
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (id === 'authTypeSelect') {
        showAuthSection(input.value);
      }
      collectRequestFromEditor();
    });
  }

  for (const button of document.querySelectorAll('.tab')) {
    button.addEventListener('click', () => activateTab(button.dataset.tabGroup, button.dataset.tab));
  }

  $('contextMenu').addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => {
    closeContextMenu();
    closeToolbarMenus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeContextMenu();
      closeToolbarMenus();
    }
  });
  window.addEventListener('blur', () => {
    closeContextMenu();
    closeToolbarMenus();
  });
  window.addEventListener('resize', () => {
    closeContextMenu();
    closeToolbarMenus();
  });
  initResizablePanes();
}

async function handleAppMenuAction(action) {
  const type = typeof action === 'string' ? action : action?.type;
  try {
    switch (type) {
      case 'new-request':
        newRequest();
        break;
      case 'new-collection':
        newCollection();
        break;
      case 'new-folder':
        newFolder();
        break;
      case 'save-workspace':
        await saveWorkspace();
        break;
      case 'import-workspace':
        await importWorkspace();
        break;
      case 'import-collection':
        await importCollection();
        break;
      case 'export-workspace':
        await exportWorkspace();
        break;
      case 'export-collection':
        await exportCollection();
        break;
      case 'set-prereleases':
        await setIncludePrereleases(action.includePrereleases === true, { save: true });
        break;
      case 'check-updates':
        await checkForUpdates();
        break;
      default:
        break;
    }
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Menu action failed: ${message}`);
    notifyUser('Menu Action Failed', message);
  }
}

function queueUiWorkflowSmoke() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('uiWorkflowSmoke') !== '1') {
    return;
  }
  setTimeout(() => {
    runUiWorkflowSmoke(params)
      .then(() => {
        document.title = 'PostMeter UI Workflow:PASS';
      })
      .catch((error) => {
        document.title = `PostMeter UI Workflow:FAIL:${String(error?.message || error).slice(0, 160)}`;
      });
  }, 50);
}

function queueUiRegressionSmoke() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('uiRegressionSmoke') !== '1') {
    return;
  }
  setTimeout(() => {
    runUiRegressionSmoke()
      .then(() => {
        document.title = 'PostMeter UI Regression:PASS';
      })
      .catch((error) => {
        document.title = `PostMeter UI Regression:FAIL:${String(error?.message || error).slice(0, 160)}`;
      });
  }, 50);
}

function queueUiSnapshotSmoke() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('uiSnapshotSmoke') !== '1') {
    return;
  }
  setTimeout(() => {
    runUiSnapshotSmoke()
      .then(() => {
        document.title = 'PostMeter UI Snapshot:PASS';
      })
      .catch((error) => {
        document.title = `PostMeter UI Snapshot:FAIL:${String(error?.message || error).slice(0, 160)}`;
      });
  }, 50);
}

function queueUiOauthSmoke() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('uiOauthSmoke') !== '1') {
    return;
  }
  setTimeout(() => {
    runUiOauthSmoke(params)
      .then(() => {
        document.title = 'PostMeter UI OAuth:PASS';
      })
      .catch((error) => {
        document.title = `PostMeter UI OAuth:FAIL:${String(error?.message || error).slice(0, 160)}`;
      });
  }, 50);
}

async function runUiWorkflowSmoke(params) {
  const baseUrl = params.get('uiWorkflowBaseUrl');
  assertUiSmoke(baseUrl, 'UI workflow smoke requires a fixture base URL.');
  assertUiSmoke(workspace.collections.length === 0, 'New workspace should start without default collections.');

  newCollection();
  const collection = activeCollection();
  assertUiSmoke(collection, 'New collection was not created.');
  collection.name = 'Smoke Collection';
  const request = activeRequest();
  assertUiSmoke(request, 'New request was not selected.');
  request.name = 'Smoke Request';
  renderAll();

  activateTab('request', 'collectionVariables');
  $('addRequestVariableButton').click();
  setPairRow('requestVariablesTable', 'requestToken', 'from-request');
  $('addCollectionVariableButton').click();
  setPairRow('collectionVariablesTable', 'collectionToken', 'from-collection');
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
  setPairRow('paramsTable', 'trace', 'ui');
  $('addHeaderButton').click();
  setPairRow('headersTable', 'X-PostMeter-UI', 'smoke');
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
  setAssertionRow('statusCode', '', '', 'equals', '200');
  $('assertionTemplateSelect').value = 'jsonPathExists';
  dispatchChange($('assertionTemplateSelect'));
  $('addAssertionTemplateButton').click();
  activateTab('request', 'scripts');
  $('preRequestScriptInput').value = "pm.environment.set('scriptToken', 'ui-script');";
  dispatchInput($('preRequestScriptInput'));
  $('testScriptInput').value = "pm.test('script token exists', function () { pm.expect(pm.environment.get('scriptToken')).to.equal('ui-script'); pm.expect(pm.collectionVariables.get('collectionToken')).to.equal('from-collection'); pm.response.to.have.status(200); });";
  dispatchInput($('testScriptInput'));

  newEnvironment();
  const environment = activeEnvironment();
  assertUiSmoke(environment, 'New environment was not created.');
  environment.name = 'Smoke Environment';
  environment.variables = [{ enabled: true, key: 'secretToken', value: 'local-secret', secret: true }];
  renderAll();

  assertContextMenuSmoke();
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
  $('loadExecutionMode').value = 'singleProcess';
  $('loadWorkerProcesses').value = '1';
  $('loadAllowedHosts').value = new URL(baseUrl).hostname;
  $('loadRecordSamples').checked = true;
  await runLoadTest();
  assertUiSmoke($('loadResults').textContent.includes('Completed requests: 2'), 'Load test did not complete two requests.');
  assertUiSmoke($('loadResults').textContent.includes('Samples recorded: 2'), 'Load test samples were not recorded.');

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

async function runUiRegressionSmoke() {
  assertUiSmoke(workspace.collections.length === 0, 'Regression smoke should start with an empty workspace.');
  assertUiSmoke(!/(sign in|log in|create account|register)/i.test(document.body.textContent), 'Standalone UI should not render app account/login language.');
  assertToolbarMenuSmoke('newMenuButton', 'newMenu', ['Request', 'Collection', 'Folder']);
  assertToolbarMenuSmoke('importMenuButton', 'importMenu', ['Workspace', 'Collection']);
  assertToolbarMenuSmoke('exportMenuButton', 'exportMenu', ['Workspace', 'Collection', 'OpenAPI', 'JMeter', 'curl', 'HAR']);
  assertUiSmoke(!$('statusLabel'), 'Topbar status message should not render.');
  assertUiSmoke(!$('checkUpdatesButton'), 'Updates toolbar button should be handled by the Help menu.');
  assertUiSmoke(!$('includePrereleasesInput'), 'Prereleases setting should be handled by the Help menu.');
  await assertUpdateCheckSmoke();
  assertOauthProgressSmoke();

  newCollection();
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

async function runUiSnapshotSmoke() {
  workspace.collections = [];
  workspace.environments = [];
  workspace.history = [];
  workspace.cookies = [];
  activeEnvironmentId = 'none';
  clearActiveWorkspaceItem();
  renderAll();

  newCollection();
  const collection = activeCollection();
  const request = activeRequest();
  collection.name = 'Snapshot Collection';
  collection.variables.push({ enabled: true, key: 'baseUrl', value: 'https://api.snapshot.test', secret: false });
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
  });

  await captureUiSnapshotState('context-menu', () => {
    assertContextMenuSmoke({ keepOpen: true });
  });
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
  });

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
      status: 'waitingForCallback',
      message: 'Waiting for authorization callback.',
      redirectUri: 'http://127.0.0.1:42123/oauth/callback'
    });
  });

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
  });

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
  });

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
  });

  await captureUiSnapshotState('export-menu', () => {
    closeContextMenu();
    activateTab('request', 'headers');
    $('exportMenuButton').click();
  });
  closeToolbarMenus();
}

async function runUiOauthSmoke(params) {
  const baseUrl = params.get('uiOauthBaseUrl');
  assertUiSmoke(baseUrl, 'UI OAuth smoke requires a mock auth server base URL.');
  workspace.collections = [];
  workspace.environments = [];
  workspace.history = [];
  workspace.cookies = [];
  clearActiveWorkspaceItem();
  renderAll();
  newCollection();
  activeRequest().name = 'OAuth Smoke Request';
  activeRequest().url = 'https://api.oauth-smoke.test/me';
  renderAll();

  activateTab('request', 'auth');
  $('authTypeSelect').value = 'oauth2';
  dispatchChange($('authTypeSelect'));
  $('authOauthGrantTypeSelect').value = 'authorizationCode';
  dispatchChange($('authOauthGrantTypeSelect'));
  $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize`;
  dispatchInput($('authOauthAuthorizationUrlInput'));
  $('authOauthTokenUrlInput').value = `${baseUrl}/token`;
  dispatchInput($('authOauthTokenUrlInput'));
  $('authOauthClientIdInput').value = 'postmeter-client';
  dispatchInput($('authOauthClientIdInput'));
  await startPkceFlow();
  assertUiSmoke($('authOauthAccessTokenInput').value === 'pkce-e2e-token', 'PKCE OAuth smoke did not persist the returned access token.');
  assertUiSmoke(lastStatusMessage.includes('OAuth authorization completed'), 'PKCE OAuth smoke did not complete.');

  $('authOauthAccessTokenInput').value = '';
  dispatchInput($('authOauthAccessTokenInput'));
  $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize?mode=bad-state`;
  dispatchInput($('authOauthAuthorizationUrlInput'));
  await startPkceFlow();
  assertUiSmoke(lastStatusMessage.includes('OAuth authorization failed'), 'PKCE state mismatch did not fail cleanly.');
  assertUiSmoke($('validationLabel').textContent.includes('state did not match'), 'PKCE state mismatch did not render useful validation details.');

  $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize?mode=token-error`;
  dispatchInput($('authOauthAuthorizationUrlInput'));
  await startPkceFlow();
  assertUiSmoke(lastStatusMessage.includes('OAuth authorization failed'), 'PKCE token exchange failure did not fail cleanly.');
  assertUiSmoke($('validationLabel').textContent.includes('invalid_grant'), 'PKCE token exchange failure did not render token endpoint details.');

  $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize`;
  dispatchInput($('authOauthAuthorizationUrlInput'));
  $('authOauthRedirectStrategySelect').value = 'customScheme';
  dispatchChange($('authOauthRedirectStrategySelect'));
  await startPkceFlow();
  assertUiSmoke($('authOauthAccessTokenInput').value === 'pkce-e2e-token', 'Custom-scheme PKCE OAuth smoke did not persist the returned access token.');
  assertUiSmoke(lastStatusMessage.includes('OAuth authorization completed'), 'Custom-scheme PKCE smoke did not complete.');

  $('authOauthAccessTokenInput').value = '';
  dispatchInput($('authOauthAccessTokenInput'));
  $('authOauthRedirectStrategySelect').value = 'loopback';
  dispatchChange($('authOauthRedirectStrategySelect'));
  $('authOauthAuthorizationUrlInput').value = `${baseUrl}/authorize?mode=wait-cancel`;
  dispatchInput($('authOauthAuthorizationUrlInput'));
  const pkceCancel = startPkceFlow();
  await waitForUiSmoke(() => !$('cancelOauthFlowButton').disabled, 'PKCE cancel button did not become available.');
  await cancelOauthFlow();
  await pkceCancel;
  assertUiSmoke(lastStatusMessage.includes('OAuth authorization cancelled'), 'PKCE cancellation did not complete cleanly.');

  $('authOauthGrantTypeSelect').value = 'deviceCode';
  dispatchChange($('authOauthGrantTypeSelect'));
  $('authOauthAccessTokenInput').value = '';
  dispatchInput($('authOauthAccessTokenInput'));
  $('authOauthDeviceAuthorizationUrlInput').value = `${baseUrl}/device`;
  dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
  $('authOauthTokenUrlInput').value = `${baseUrl}/token`;
  dispatchInput($('authOauthTokenUrlInput'));
  $('authOauthClientIdInput').value = 'postmeter-client';
  dispatchInput($('authOauthClientIdInput'));
  await startDeviceFlow();
  assertUiSmoke($('authOauthAccessTokenInput').value === 'device-e2e-token', 'Device OAuth smoke did not persist the returned access token.');
  assertUiSmoke(lastStatusMessage.includes('OAuth device authorization completed'), 'Device OAuth smoke did not complete.');

  $('authOauthAccessTokenInput').value = '';
  dispatchInput($('authOauthAccessTokenInput'));
  $('authOauthDeviceAuthorizationUrlInput').value = `${baseUrl}/device?mode=denied`;
  dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
  await startDeviceFlow();
  assertUiSmoke(lastStatusMessage.includes('OAuth device authorization failed'), 'Device OAuth access-denied state did not fail cleanly.');
  assertUiSmoke($('validationLabel').textContent.includes('denied'), 'Device OAuth access-denied state did not render useful validation details.');

  $('authOauthDeviceAuthorizationUrlInput').value = `${baseUrl}/device?mode=timeout`;
  dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
  await startDeviceFlow();
  assertUiSmoke(lastStatusMessage.includes('OAuth device authorization failed'), 'Device OAuth timeout did not fail cleanly.');
  assertUiSmoke($('validationLabel').textContent.includes('timed out'), 'Device OAuth timeout did not render useful validation details.');

  $('authOauthDeviceAuthorizationUrlInput').value = `${baseUrl}/device?mode=pending`;
  dispatchInput($('authOauthDeviceAuthorizationUrlInput'));
  const deviceCancel = startDeviceFlow();
  await waitForUiSmoke(() => !$('cancelOauthFlowButton').disabled, 'Device cancel button did not become available.');
  await cancelOauthFlow();
  await deviceCancel;
  assertUiSmoke(lastStatusMessage.includes('OAuth device authorization cancelled'), 'Device cancellation did not complete cleanly.');
}

function waitForUiSmoke(predicate, message, timeoutMillis = 3000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        if (predicate()) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - start > timeoutMillis) {
        reject(new Error(message));
        return;
      }
      setTimeout(check, 25);
    };
    check();
  });
}

async function captureUiSnapshotState(label, setup) {
  setup();
  await nextPaint();
  await new Promise((resolve) => {
    window.__postmeterSnapshotContinue = () => {
      window.__postmeterSnapshotContinue = null;
      resolve();
    };
    document.title = `PostMeter UI Snapshot:CAPTURE:${label}`;
  });
}

function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
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

function setPairRow(tableId, key, value) {
  const row = $(tableId).querySelector('.kv-row:last-child');
  assertUiSmoke(row, `Missing row in ${tableId}.`);
  const inputs = row.querySelectorAll('input');
  inputs[1].value = key;
  dispatchInput(inputs[1]);
  inputs[2].value = value;
  dispatchInput(inputs[2]);
}

function setAssertionRow(type, name, path, operator, expected) {
  const row = $('assertionsTable').querySelector('.assertion-row:last-child');
  assertUiSmoke(row, 'Missing assertion row.');
  const selects = row.querySelectorAll('select');
  const inputs = row.querySelectorAll('input');
  selects[0].value = type;
  dispatchChange(selects[0]);
  inputs[1].value = name;
  dispatchInput(inputs[1]);
  inputs[2].value = path;
  dispatchInput(inputs[2]);
  selects[1].value = operator;
  dispatchChange(selects[1]);
  inputs[3].value = expected;
  dispatchInput(inputs[3]);
}

function assertContextMenuSmoke(options = {}) {
  const collectionButton = document.querySelector('.collection-node > .tree-item');
  assertUiSmoke(collectionButton, 'Collection tree item was not rendered.');
  collectionButton.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 40,
    clientY: 80
  }));
  const labels = Array.from($('contextMenu').querySelectorAll('button')).map((button) => button.textContent);
  assertUiSmoke(!$('contextMenu').hidden, 'Context menu did not open.');
  for (const label of ['Add Request', 'Add Folder', 'Rename', 'Export', 'Delete']) {
    assertUiSmoke(labels.includes(label), `Context menu missing ${label}.`);
  }
  if (!options.keepOpen) {
    closeContextMenu();
  }
}

function assertResizeSmoke() {
  const handle = $('mainPaneResize');
  handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 300 }));
  assertUiSmoke(document.body.classList.contains('is-resizing'), 'Main pane resize did not enter resizing state.');
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 360 }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  assertUiSmoke(!document.body.classList.contains('is-resizing'), 'Main pane resize did not exit resizing state.');
}

function dispatchInput(element) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function dispatchChange(element) {
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function assertUiSmoke(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function bindToolbarMenus() {
  for (const [buttonId, menuId] of [
    ['newMenuButton', 'newMenu'],
    ['importMenuButton', 'importMenu'],
    ['exportMenuButton', 'exportMenu']
  ]) {
    const button = $(buttonId);
    const menu = $(menuId);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleToolbarMenu(button, menu);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openToolbarMenu(button, menu);
        menu.querySelector('button')?.focus();
      }
    });
    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      closeToolbarMenus();
    });
  }
}

function toggleToolbarMenu(button, menu) {
  if (menu.hidden) {
    openToolbarMenu(button, menu);
  } else {
    closeToolbarMenus();
  }
}

function openToolbarMenu(button, menu) {
  closeToolbarMenus();
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
}

function closeToolbarMenus() {
  for (const menu of document.querySelectorAll('.toolbar-menu')) {
    menu.hidden = true;
  }
  for (const button of document.querySelectorAll('.menu-trigger')) {
    button.setAttribute('aria-expanded', 'false');
  }
}

function renderAll() {
  renderSettings();
  renderEnvironmentSelect();
  renderCollections();
  renderHistory();
  renderRequestEditor();
  renderCollectionVariablesEditor();
  renderEnvironmentEditor();
}

function renderSettings() {
  ensureSettings();
}

function ensureSettings() {
  workspace.settings ||= { updates: { includePrereleases: false } };
  workspace.settings.updates ||= { includePrereleases: false };
}

async function setIncludePrereleases(includePrereleases, options = {}) {
  ensureSettings();
  workspace.settings.updates.includePrereleases = includePrereleases === true;
  if (options.save === true) {
    await saveWorkspace(false);
  }
  if (options.showStatus !== false) {
    setStatus(`Prerelease update checks ${workspace.settings.updates.includePrereleases ? 'enabled' : 'disabled'}.`);
  }
}

function selectInitialWorkspaceItem() {
  const collection = workspace.collections[0];
  activeCollectionId = collection?.id;
  if (collection) {
    selectFirstRequest(collection);
  } else {
    clearActiveWorkspaceItem();
  }
}

function selectFirstRequest(collection) {
  const request = firstRequestInCollection(collection);
  activeFolderId = request?.folderId || null;
  activeRequestId = request?.request?.id || null;
}

function renderCollections() {
  const root = $('collectionsTree');
  root.textContent = '';
  if (!workspace.collections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No collections';
    root.append(empty);
    return;
  }
  for (const collection of workspace.collections) {
    root.append(collectionNode(collection));
  }
}

function collectionNode(collection) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node collection-node';
  const button = treeButton(collection.name, collection.id === activeCollectionId && !activeRequestId, 'COL');
  button.addEventListener('click', () => {
    collectRequestFromEditor();
    activeCollectionId = collection.id;
    selectFirstRequest(collection);
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Add Request', () => newRequest(collection.id, null)],
    ['Add Folder', () => newFolder(collection.id, null)],
    ['Rename', () => renameCollection(collection)],
    ['Export', () => exportCollection(collection)],
    ['Delete', () => deleteCollection(collection), 'danger']
  ]);
  wrapper.append(button);
  for (const request of collection.requests || []) {
    wrapper.append(requestNode(collection, null, request));
  }
  for (const folder of collection.folders || []) {
    wrapper.append(folderNode(collection, folder));
  }
  return wrapper;
}

function folderNode(collection, folder) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node tree-folder folder-node';
  const button = treeButton(folder.name, folder.id === activeFolderId && !activeRequestId, 'DIR');
  button.addEventListener('click', () => {
    activeCollectionId = collection.id;
    activeFolderId = folder.id;
    activeRequestId = firstRequestInFolder(folder)?.request?.id;
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Add Request', () => newRequest(collection.id, folder.id)],
    ['Add Folder', () => newFolder(collection.id, folder.id)],
    ['Rename', () => renameFolder(folder)],
    ['Delete', () => deleteFolder(collection, folder), 'danger']
  ]);
  wrapper.append(button);
  for (const request of folder.requests || []) {
    wrapper.append(requestNode(collection, folder, request));
  }
  for (const child of folder.folders || []) {
    wrapper.append(folderNode(collection, child));
  }
  return wrapper;
}

function requestNode(collection, folder, request) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node tree-folder request-node';
  const button = treeButton(request.name, request.id === activeRequestId, request.method);
  button.addEventListener('click', () => {
    collectRequestFromEditor();
    activeCollectionId = collection.id;
    activeFolderId = folder?.id || null;
    activeRequestId = request.id;
    renderAll();
  });
  attachTreeContextMenu(button, [
    ['Rename', () => renameRequest(request)],
    ['Duplicate', () => duplicateRequest(collection, folder, request)],
    ['Delete', () => deleteRequest(collection, folder, request), 'danger']
  ]);
  wrapper.append(button);
  return wrapper;
}

function treeButton(text, active, kind) {
  const button = document.createElement('button');
  button.className = `tree-item${active ? ' active' : ''}`;
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'menu');
  const badge = document.createElement('span');
  badge.className = 'tree-badge';
  badge.textContent = kind;
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = text;
  button.append(badge, label);
  return button;
}

function attachTreeContextMenu(button, items) {
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(event.clientX, event.clientY, items);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      showContextMenu(rect.left + 16, rect.bottom + 4, items);
    }
  });
}

function showContextMenu(x, y, items) {
  const menu = $('contextMenu');
  menu.textContent = '';
  for (const [label, handler, variant] of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.className = variant === 'danger' ? 'danger' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      closeContextMenu();
      handler();
    });
    menu.append(button);
  }
  menu.hidden = false;
  menu.style.left = '0';
  menu.style.top = '0';
  const maxX = window.innerWidth - menu.offsetWidth - 8;
  const maxY = window.innerHeight - menu.offsetHeight - 8;
  menu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
}

function closeContextMenu() {
  const menu = $('contextMenu');
  if (!menu || menu.hidden) {
    return;
  }
  menu.hidden = true;
  menu.textContent = '';
}

function initResizablePanes() {
  restoreLayout();
  setupDragResize('mainPaneResize', (event) => {
    const maxWidth = Math.max(260, Math.min(560, window.innerWidth - 520));
    setLayoutVar('--sidebar-width', `${clamp(event.clientX, 220, maxWidth)}px`);
  }, '--sidebar-width');
  setupDragResize('sidebarPaneResize', (event) => {
    const sidebar = document.querySelector('.sidebar');
    const rect = sidebar.getBoundingClientRect();
    const maxHeight = Math.max(140, rect.height - 190);
    setLayoutVar('--history-height', `${clamp(rect.bottom - event.clientY - 10, 120, maxHeight)}px`);
  }, '--history-height');
  setupDragResize('workspacePaneResize', (event) => {
    const workspaceElement = document.querySelector('.workspace');
    const rect = workspaceElement.getBoundingClientRect();
    const maxHeight = Math.max(260, rect.height - 220);
    setLayoutVar('--request-height', `${clamp(event.clientY - rect.top - 10, 240, maxHeight)}px`);
  }, '--request-height');
  setupDragResize('responsePaneResize', (event) => {
    const grid = document.querySelector('.response-grid');
    const rect = grid.getBoundingClientRect();
    setLayoutVar('--response-body-width', `${clamp(event.clientX - rect.left, 220, Math.max(220, rect.width - 220))}px`);
  }, '--response-body-width');
}

function setupDragResize(id, update, cssVariable) {
  const handle = $(id);
  if (!handle) {
    return;
  }
  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const resizeClass = handle.classList.contains('horizontal') ? 'is-resizing-row' : 'is-resizing-col';
    document.body.classList.add('is-resizing', resizeClass);
    const onMouseMove = (moveEvent) => update(moveEvent);
    const onMouseUp = () => {
      document.body.classList.remove('is-resizing', resizeClass);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  handle.addEventListener('dblclick', () => resetLayoutVar(cssVariable));
}

function restoreLayout() {
  for (const [name, fallback] of Object.entries(defaultLayoutVars())) {
    const value = readLayoutVar(name) || fallback;
    document.documentElement.style.setProperty(name, value);
  }
}

function setLayoutVar(name, value) {
  document.documentElement.style.setProperty(name, value);
  try {
    localStorage.setItem(layoutStorageKey(name), value);
  } catch {
    // Ignore storage failures; resizing still works for the current session.
  }
}

function resetLayoutVar(name) {
  const fallback = defaultLayoutVars()[name];
  if (!fallback) {
    return;
  }
  document.documentElement.style.setProperty(name, fallback);
  try {
    localStorage.removeItem(layoutStorageKey(name));
  } catch {
    // Ignore storage failures.
  }
}

function readLayoutVar(name) {
  try {
    return localStorage.getItem(layoutStorageKey(name));
  } catch {
    return null;
  }
}

function defaultLayoutVars() {
  return {
    '--sidebar-width': '300px',
    '--history-height': '210px',
    '--request-height': '52%',
    '--response-body-width': '1.25fr'
  };
}

function layoutStorageKey(name) {
  return `postmeter.layout.${name}`;
}

function renderRequestEditor() {
  const request = activeRequest();
  if (!request) {
    $('requestNameInput').value = '';
    $('methodSelect').value = 'GET';
    $('urlInput').value = '';
    $('bodyTypeSelect').value = 'NONE';
    $('bodyInput').value = '';
    $('preRequestScriptInput').value = '';
    $('testScriptInput').value = '';
    $('paramsTable').textContent = '';
    $('headersTable').textContent = '';
    $('assertionsTable').textContent = '';
    $('examplesList').textContent = '';
    $('requestVariablesTable').textContent = '';
    $('cookiesTable').textContent = '';
    $('requestCookieJarEnabledInput').checked = false;
    $('requestCookieJarStoreInput').checked = true;
    $('addRequestVariableButton').disabled = true;
    $('addExampleButton').disabled = true;
    $('captureResponseExampleButton').disabled = true;
    $('exportExamplesButton').disabled = true;
    renderAuthEditor({ type: 'none' });
    return;
  }
  $('addRequestVariableButton').disabled = false;
  $('addExampleButton').disabled = false;
  $('captureResponseExampleButton').disabled = !lastResponse;
  $('exportExamplesButton').disabled = !(request.examples || []).length;
  $('requestNameInput').value = request.name;
  $('methodSelect').value = request.method;
  $('urlInput').value = request.url;
  $('bodyTypeSelect').value = request.bodyType || 'NONE';
  $('bodyInput').value = request.body || '';
  request.scripts ||= { preRequest: '', tests: '' };
  $('preRequestScriptInput').value = request.scripts.preRequest || '';
  $('testScriptInput').value = request.scripts.tests || '';
  request.cookieJar ||= { enabled: false, storeResponses: true };
  $('requestCookieJarEnabledInput').checked = request.cookieJar.enabled === true;
  $('requestCookieJarStoreInput').checked = request.cookieJar.storeResponses !== false;
  renderPairs('paramsTable', request.queryParams || [], 'queryParams');
  renderPairs('headersTable', request.headers || [], 'headers');
  renderAssertions(request.assertions || []);
  renderRequestVariablePairs(request.variables || []);
  renderExamples(request.examples || []);
  renderCookieJarEditor();
  renderAuthEditor(request.auth || { type: 'none' });
}

function renderExamples(examples) {
  const container = $('examplesList');
  $('exportExamplesButton').disabled = !examples.length;
  container.textContent = '';
  if (!examples.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No examples';
    container.append(empty);
    return;
  }
  examples.forEach((example, index) => {
    const item = document.createElement('section');
    item.className = 'example-item';
    const header = document.createElement('div');
    header.className = 'example-heading';
    const name = document.createElement('input');
    name.value = example.name || 'Example Response';
    name.placeholder = 'Example name';
    name.addEventListener('input', () => {
      example.name = name.value;
    });
    const status = document.createElement('input');
    status.type = 'number';
    status.min = '0';
    status.max = '999';
    status.value = example.statusCode || '';
    status.placeholder = 'Status';
    status.addEventListener('input', () => {
      example.statusCode = Number(status.value) || 0;
    });
    const bodyType = document.createElement('select');
    for (const type of BODY_TYPES) {
      bodyType.append(new Option(type, type));
    }
    bodyType.value = BODY_TYPES.includes(example.bodyType) ? example.bodyType : 'RAW_TEXT';
    bodyType.addEventListener('change', () => {
      example.bodyType = bodyType.value;
      body.value = formatExampleBody(example);
    });
    const duplicate = document.createElement('button');
    duplicate.textContent = 'Duplicate';
    duplicate.addEventListener('click', () => duplicateExample(index));
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteExample(index));
    header.append(name, status, bodyType, duplicate, remove);
    const headers = document.createElement('textarea');
    headers.spellcheck = false;
    headers.value = exampleHeadersToText(example.headers || []);
    headers.placeholder = 'Header-Name: value';
    headers.addEventListener('input', () => {
      example.headers = parseHeadersText(headers.value);
    });
    const body = document.createElement('textarea');
    body.spellcheck = false;
    body.value = formatExampleBody(example);
    body.addEventListener('input', () => {
      example.body = body.value;
    });
    item.append(header, headers, body);
    container.append(item);
  });
}

function formatExampleBody(example) {
  const body = example.body || '';
  if (example.bodyType !== 'RAW_JSON') {
    return body;
  }
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function exampleHeadersToText(headers) {
  return (headers || [])
    .filter((header) => header.enabled !== false && header.key)
    .map((header) => `${header.key}: ${header.value ?? ''}`)
    .join('\n');
}

function parseHeadersText(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator < 1) {
        return { enabled: true, key: line, value: '' };
      }
      return {
        enabled: true,
        key: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim()
      };
    });
}

function renderAuthEditor(auth) {
  const type = auth?.type || 'none';
  $('authTypeSelect').value = type;
  showAuthSection(type);
  $('authBearerTokenInput').value = auth?.token || '';
  $('authBasicUsernameInput').value = auth?.username || '';
  $('authBasicPasswordInput').value = auth?.password || '';
  $('authApiKeyLocationSelect').value = auth?.location || 'header';
  $('authApiKeyNameInput').value = auth?.key || '';
  $('authApiKeyValueInput').value = auth?.value || '';
  $('authCookieValueInput').value = auth?.value || '';
  $('authOauthGrantTypeSelect').value = auth?.grantType || 'authorizationCode';
  $('authOauthTokenTypeSelect').value = auth?.tokenType || 'Bearer';
  $('authOauthAccessTokenInput').value = auth?.accessToken || '';
  $('authOauthRefreshTokenInput').value = auth?.refreshToken || '';
  $('authOauthAuthorizationUrlInput').value = auth?.authorizationUrl || '';
  $('authOauthRedirectStrategySelect').value = auth?.redirectStrategy || 'loopback';
  $('authOauthDeviceAuthorizationUrlInput').value = auth?.deviceAuthorizationUrl || '';
  $('authOauthTokenUrlInput').value = auth?.tokenUrl || '';
  $('authOauthClientIdInput').value = auth?.clientId || '';
  $('authOauthClientSecretInput').value = auth?.clientSecret || '';
  $('authOauthScopesInput').value = auth?.scopes || '';
  $('authOauthUserCodeInput').value = auth?.userCode || '';
  $('authOauthVerificationUriInput').value = auth?.verificationUriComplete || auth?.verificationUri || '';
  $('authClientPfxPathInput').value = auth?.pfxPath || '';
  $('authClientCertPathInput').value = auth?.certPath || '';
  $('authClientKeyPathInput').value = auth?.keyPath || '';
  $('authClientCaPathInput').value = auth?.caPath || '';
  $('authClientPassphraseInput').value = auth?.passphrase || '';
}

function showAuthSection(type) {
  for (const section of document.querySelectorAll('.auth-section')) {
    section.classList.toggle('active', section.dataset.authSection === type);
  }
}

function renderPairs(containerId, pairs, fieldName) {
  const container = $(containerId);
  container.textContent = '';
  pairs.forEach((pair, index) => {
    const row = document.createElement('div');
    row.className = 'kv-row';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = pair.enabled !== false;
    enabled.addEventListener('change', () => {
      pair.enabled = enabled.checked;
      collectRequestFromEditor();
    });
    const key = document.createElement('input');
    key.placeholder = 'Key';
    key.value = pair.key || '';
    key.addEventListener('input', () => { pair.key = key.value; });
    const value = document.createElement('input');
    value.placeholder = 'Value';
    value.value = pair.value || '';
    value.addEventListener('input', () => { pair.value = value.value; });
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      pairs.splice(index, 1);
      renderRequestEditor();
    });
    row.append(enabled, key, value, remove);
    container.append(row);
  });
}

function renderAssertions(assertions) {
  const container = $('assertionsTable');
  container.textContent = '';
  assertions.forEach((assertion, index) => {
    const row = document.createElement('div');
    row.className = 'assertion-row';
    row.dataset.assertionType = assertion.type || 'statusCode';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = assertion.enabled !== false;
    enabled.addEventListener('change', () => { assertion.enabled = enabled.checked; });

    const type = document.createElement('select');
    for (const [value, label] of [
      ['statusCode', 'Status'],
      ['header', 'Header'],
      ['jsonPath', 'JSON Path'],
      ['xmlPath', 'XML XPath'],
      ['htmlSelector', 'HTML Selector'],
      ['responseTime', 'Time'],
      ['responseSize', 'Size'],
      ['bodyContains', 'Body Contains'],
      ['extractVariable', 'Extract JSON'],
      ['extractXml', 'Extract XML'],
      ['extractHtml', 'Extract HTML'],
      ['extractRegex', 'Extract Regex']
    ]) {
      type.append(new Option(label, value));
    }
    type.value = assertion.type || 'statusCode';
    type.addEventListener('change', () => {
      assertion.type = type.value;
      applyAssertionTypeDefaults(assertion);
      renderAssertions(assertions);
    });

    const name = assertionInput(assertionNamePlaceholder(assertion), assertion.name || assertion.variableName || '', (value) => {
      assertion.name = value;
      if (assertion.type === 'extractVariable' || assertion.type === 'extractXml' || assertion.type === 'extractHtml' || assertion.type === 'extractRegex') {
        assertion.variableName = value;
      }
    });
    const path = assertionInput(assertionPathPlaceholder(assertion), assertion.path || '', (value) => { assertion.path = value; });

    const operator = document.createElement('select');
    for (const [value, label] of [
      ['equals', '='],
      ['notEquals', '!='],
      ['contains', 'contains'],
      ['exists', 'exists'],
      ['lessThan', '<'],
      ['greaterThan', '>']
    ]) {
      operator.append(new Option(label, value));
    }
    operator.value = assertion.operator || 'equals';
    operator.addEventListener('change', () => { assertion.operator = operator.value; });

    const expected = assertionInput(assertionExpectedPlaceholder(assertion), assertion.expected ?? '', (value) => { assertion.expected = value; });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      assertions.splice(index, 1);
      renderAssertions(assertions);
    });
    row.append(enabled, type, name, path, operator, expected, remove);
    container.append(row);
  });
}

function assertionInput(placeholder, value, onInput) {
  const input = document.createElement('input');
  input.placeholder = placeholder;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function assertionNamePlaceholder(assertion) {
  if (assertion.type === 'header') {
    return 'Header name';
  }
  if (assertion.type === 'extractVariable' || assertion.type === 'extractXml' || assertion.type === 'extractHtml' || assertion.type === 'extractRegex') {
    return 'Variable name';
  }
  return 'Name';
}

function assertionPathPlaceholder(assertion) {
  if (assertion.type === 'jsonPath' || assertion.type === 'extractVariable') {
    return 'JSON path';
  }
  if (assertion.type === 'xmlPath' || assertion.type === 'extractXml') {
    return 'XPath';
  }
  if (assertion.type === 'htmlSelector' || assertion.type === 'extractHtml') {
    return 'CSS selector';
  }
  if (assertion.type === 'extractRegex') {
    return 'Unused';
  }
  return 'Path';
}

function assertionExpectedPlaceholder(assertion) {
  if (assertion.type === 'statusCode') {
    return 'Expected status';
  }
  if (assertion.type === 'responseTime') {
    return 'Milliseconds';
  }
  if (assertion.type === 'responseSize') {
    return 'Bytes';
  }
  if (assertion.type === 'header') {
    return 'Expected header value';
  }
  if (assertion.type === 'bodyContains') {
    return 'Text to find';
  }
  if (assertion.type === 'extractRegex') {
    return 'Regex pattern';
  }
  if (assertion.type === 'xmlPath') {
    return 'Expected XML value';
  }
  if (assertion.type === 'htmlSelector') {
    return 'Expected text';
  }
  return 'Expected';
}

function applyAssertionTypeDefaults(assertion) {
  const template = Object.values(ASSERTION_TEMPLATES).find((candidate) => candidate.type === assertion.type);
  if (!template) {
    return;
  }
  assertion.operator = template.operator;
  assertion.expected = template.expected;
  assertion.name = template.name;
  assertion.path = template.path;
  assertion.variableName = template.variableName;
}

function renderEnvironmentSelect() {
  const select = $('environmentSelect');
  select.textContent = '';
  select.append(new Option('No Environment', 'none'));
  for (const environment of workspace.environments || []) {
    select.append(new Option(environment.name, environment.id));
  }
  select.value = activeEnvironmentId;
}

function renderEnvironmentEditor() {
  const environment = activeEnvironment();
  $('environmentNameInput').value = environment?.name || '';
  $('environmentNameInput').disabled = !environment;
  $('deleteEnvironmentButton').disabled = !environment;
  $('addVariableButton').disabled = !environment;
  renderEnvironmentPairs(environment?.variables || []);
  renderVariablePreview();
}

function renderCollectionVariablesEditor() {
  const collection = activeCollection();
  $('addCollectionVariableButton').disabled = !collection;
  renderCollectionVariablePairs(collection?.variables || []);
  renderVariablePreview();
}

function renderRequestVariablePairs(pairs) {
  renderVariablePairs('requestVariablesTable', pairs, () => {
    renderVariablePreview();
  });
}

function renderCollectionVariablePairs(pairs) {
  renderVariablePairs('collectionVariablesTable', pairs, () => {
    renderVariablePreview();
  });
}

function renderVariablePairs(containerId, pairs, onChange) {
  const container = $(containerId);
  container.textContent = '';
  pairs.forEach((pair, index) => {
    const row = document.createElement('div');
    row.className = 'kv-row env-row';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = pair.enabled !== false;
    enabled.addEventListener('change', () => {
      pair.enabled = enabled.checked;
      onChange();
    });
    const key = document.createElement('input');
    key.placeholder = 'Variable';
    key.value = pair.key || '';
    key.addEventListener('input', () => {
      pair.key = key.value;
      onChange();
    });
    const value = document.createElement('input');
    value.placeholder = 'Value';
    value.type = pair.secret ? 'password' : 'text';
    value.value = pair.value || '';
    value.addEventListener('input', () => {
      pair.value = value.value;
      onChange();
    });
    const secretLabel = document.createElement('label');
    secretLabel.className = 'secret-toggle';
    const secret = document.createElement('input');
    secret.type = 'checkbox';
    secret.checked = pair.secret === true;
    secret.addEventListener('change', () => {
      pair.secret = secret.checked;
      value.type = pair.secret ? 'password' : 'text';
      onChange();
    });
    const secretText = document.createElement('span');
    secretText.textContent = 'Secret';
    secretLabel.append(secret, secretText);
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      pairs.splice(index, 1);
      renderRequestEditor();
      renderCollectionVariablesEditor();
    });
    row.append(enabled, key, value, secretLabel, remove);
    container.append(row);
  });
}

function renderVariablePreview() {
  const collection = activeCollection();
  const environment = activeEnvironment();
  const request = activeRequest();
  const rows = [];
  const effective = new Map();
  for (const pair of collection?.variables || []) {
    if (pair.enabled === false || !pair.key) {
      continue;
    }
    effective.set(pair.key, {
      key: pair.key,
      value: pair.secret ? '••••••' : pair.value ?? '',
      source: 'Collection',
      secret: pair.secret === true
    });
  }
  for (const pair of environment?.variables || []) {
    if (pair.enabled === false || !pair.key) {
      continue;
    }
    effective.set(pair.key, {
      key: pair.key,
      value: pair.secret ? '••••••' : pair.value ?? '',
      source: 'Environment',
      secret: pair.secret === true
    });
  }
  for (const pair of request?.variables || []) {
    if (pair.enabled === false || !pair.key) {
      continue;
    }
    effective.set(pair.key, {
      key: pair.key,
      value: pair.secret ? '••••••' : pair.value ?? '',
      source: 'Request',
      secret: pair.secret === true
    });
  }
  for (const item of [...effective.values()].sort((left, right) => left.key.localeCompare(right.key))) {
    rows.push(`${item.key} = ${item.value} (${item.source}${item.secret ? ', Secret' : ''})`);
  }
  $('variablePreview').textContent = rows.length ? rows.join('\n') : 'No variables';
}

function renderCookieJarEditor() {
  workspace.cookies ||= [];
  const container = $('cookiesTable');
  container.textContent = '';
  const activeHost = domainFromRequestUrl(activeRequest()?.url);
  const filterInput = $('filterCookiesToRequestHostInput');
  const filterLabel = $('cookieHostFilterLabel');
  const filterActive = filterInput?.checked === true && Boolean(activeHost);
  if (filterInput) {
    filterInput.disabled = !activeHost;
    if (!activeHost) {
      filterInput.checked = false;
    }
  }
  if (filterLabel) {
    filterLabel.textContent = activeHost ? `Host: ${activeHost}` : 'No active host';
  }
  const visibleCookies = workspace.cookies
    .map((cookie, index) => ({ cookie, index }))
    .filter(({ cookie }) => !filterActive || rendererCookieMatchesHost(cookie, activeHost));
  if (!visibleCookies.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = workspace.cookies.length && filterActive ? 'No cookies for active host' : 'No cookies';
    container.append(empty);
    return;
  }
  visibleCookies.forEach(({ cookie, index }) => {
    const row = document.createElement('div');
    row.className = 'cookie-row';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = cookie.enabled !== false;
    enabled.addEventListener('change', () => {
      cookie.enabled = enabled.checked;
    });
    const name = cookieInput(cookie.name || '', 'Name', (value) => { cookie.name = value; });
    const value = cookieInput(cookie.value || '', 'Value', (next) => { cookie.value = next; }, 'password');
    const domain = cookieInput(cookie.domain || '', 'Domain', (next) => { cookie.domain = next; });
    const path = cookieInput(cookie.path || '/', 'Path', (next) => { cookie.path = next || '/'; });
    const expires = cookieInput(cookie.expiresAt || '', 'Expires ISO', (next) => { cookie.expiresAt = next; });
    const secureLabel = checkboxLabel('Secure', cookie.secure === true, (checked) => {
      cookie.secure = checked;
      if (!checked && cookie.sameSite === 'None') {
        cookie.sameSite = '';
        setStatus('SameSite=None requires Secure.');
        renderCookieJarEditor();
      }
    });
    const httpOnlyLabel = checkboxLabel('HttpOnly', cookie.httpOnly === true, (checked) => { cookie.httpOnly = checked; });
    const hostOnlyLabel = checkboxLabel('Host only', cookie.hostOnly !== false, (checked) => {
      cookie.hostOnly = checked;
      renderCookieJarEditor();
    });
    const sameSite = document.createElement('select');
    for (const option of ['', 'Lax', 'Strict', 'None']) {
      sameSite.append(new Option(option || 'SameSite', option));
    }
    sameSite.value = cookie.sameSite || '';
    sameSite.addEventListener('change', () => {
      if (sameSite.value === 'None' && cookie.secure !== true) {
        cookie.sameSite = '';
        sameSite.value = '';
        setStatus('SameSite=None requires Secure.');
        return;
      }
      cookie.sameSite = sameSite.value;
    });
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      workspace.cookies.splice(index, 1);
      renderCookieJarEditor();
    });
    bindCookieFieldValidation(cookie, { domain, path, expires }, activeHost);
    row.append(enabled, name, value, domain, path, expires, secureLabel, httpOnlyLabel, hostOnlyLabel, sameSite, remove);
    container.append(row);
  });
}

function cookieInput(initialValue, placeholder, onInput, type = 'text') {
  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  input.value = initialValue;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function bindCookieFieldValidation(cookie, inputs, activeHost) {
  const refresh = () => {
    const issues = cookieFieldIssues(cookie, activeHost);
    applyCookieInputIssue(inputs.domain, issues.domain);
    applyCookieInputIssue(inputs.path, issues.path);
    applyCookieInputIssue(inputs.expires, issues.expires);
  };
  for (const input of Object.values(inputs)) {
    input.addEventListener('input', refresh);
  }
  refresh();
}

function applyCookieInputIssue(input, issue) {
  input.classList.toggle('invalid-input', Boolean(issue));
  input.setAttribute('aria-invalid', issue ? 'true' : 'false');
  input.title = issue || '';
}

function cookieFieldIssues(cookie, activeHost) {
  const domain = normalizeCookieDomain(cookie.domain);
  const path = String(cookie.path || '').trim();
  const expiresAt = String(cookie.expiresAt || '').trim();
  const issues = {};
  if (!domain) {
    issues.domain = 'Cookie domain is required.';
  } else if (/[\s/:]/.test(domain)) {
    issues.domain = 'Cookie domain must be a hostname without spaces, protocol, or path.';
  } else if (cookie.hostOnly === false && rendererIsIpAddressLike(domain)) {
    issues.domain = 'IP-address cookies must be host-only.';
  } else if (activeHost && !rendererCookieMatchesHost({ ...cookie, domain }, activeHost)) {
    issues.domain = 'Cookie domain does not match the active request host.';
  }
  if (!path.startsWith('/')) {
    issues.path = 'Cookie path must start with /.';
  }
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    issues.expires = 'Cookie expiry must be a valid date or ISO timestamp.';
  }
  return issues;
}

function rendererIsIpAddressLike(hostname) {
  const host = String(hostname || '').replace(/^\[/, '').replace(/\]$/, '');
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

function checkboxLabel(label, checked, onChange) {
  const wrapper = document.createElement('label');
  wrapper.className = 'secret-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(input, text);
  return wrapper;
}

function redactedVariableValue(pair) {
  return pair?.secret ? '••••••' : pair?.value ?? '';
}

function renderEnvironmentPairs(pairs) {
  const container = $('environmentTable');
  container.textContent = '';
  pairs.forEach((pair, index) => {
    const row = document.createElement('div');
    row.className = 'kv-row env-row';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = pair.enabled !== false;
    enabled.addEventListener('change', () => {
      pair.enabled = enabled.checked;
      renderVariablePreview();
    });
    const key = document.createElement('input');
    key.placeholder = 'Variable';
    key.value = pair.key || '';
    key.addEventListener('input', () => {
      pair.key = key.value;
      renderVariablePreview();
    });
    const value = document.createElement('input');
    value.placeholder = 'Value';
    value.type = pair.secret ? 'password' : 'text';
    value.value = pair.value || '';
    value.addEventListener('input', () => {
      pair.value = value.value;
      renderVariablePreview();
    });
    const secretLabel = document.createElement('label');
    secretLabel.className = 'secret-toggle';
    const secret = document.createElement('input');
    secret.type = 'checkbox';
    secret.checked = pair.secret === true;
    secret.addEventListener('change', () => {
      pair.secret = secret.checked;
      value.type = pair.secret ? 'password' : 'text';
      renderVariablePreview();
    });
    const secretText = document.createElement('span');
    secretText.textContent = 'Secret';
    secretLabel.append(secret, secretText);
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      pairs.splice(index, 1);
      renderEnvironmentEditor();
    });
    row.append(enabled, key, value, secretLabel, remove);
    container.append(row);
  });
}

function renderHistory() {
  const container = $('historyList');
  container.textContent = '';
  for (const item of workspace.history || []) {
    const button = document.createElement('button');
    button.className = 'history-item';
    button.textContent = `${item.method} ${item.statusCode || 'ERR'} ${item.url}`;
    button.addEventListener('click', () => {
      const request = activeRequest();
      if (request) {
        request.method = item.method;
        request.url = item.url;
        request.name = `${item.method} ${item.url}`;
        renderRequestEditor();
      }
    });
    container.append(button);
  }
}

async function sendActiveRequest() {
  const request = activeRequest();
  if (!request) {
    return setStatus('Select a request before sending.');
  }
  collectRequestFromEditor();
  await saveWorkspace(false);
  const environment = activeEnvironment();
  const errors = await window.postmeter.request.validate(request, environment);
  if (errors.length) {
    $('validationLabel').textContent = errors.join(' ');
    return setStatus('Fix validation errors.');
  }
  $('validationLabel').textContent = '';
  setStatus('Sending request...');
  try {
    const response = await window.postmeter.request.send(request, environment);
    if (response.updatedAuth) {
      request.auth = response.updatedAuth;
      renderAuthEditor(request.auth);
    }
    if (Array.isArray(response.updatedCookies)) {
      workspace.cookies = response.updatedCookies;
      renderCookieJarEditor();
    }
    lastResponse = response;
    $('captureResponseExampleButton').disabled = false;
    displayResponse(response);
    workspace.history = [
      {
        timestamp: new Date().toISOString(),
        method: request.method,
        url: response.finalUrl,
        statusCode: response.statusCode,
        durationMillis: response.durationMillis
      },
      ...(workspace.history || [])
    ].slice(0, 100);
    renderHistory();
    setStatus('Request completed.');
  } catch (error) {
    $('responseStatus').textContent = 'ERR';
    const message = error.message || String(error);
    $('responseBody').value = message;
    setStatus('Request failed.');
    notifyUser('Request Failed', message);
  }
}

function displayResponse(response) {
  $('responseStatus').textContent = response.statusCode;
  $('responseTime').textContent = `${response.durationMillis} ms`;
  $('responseSize').textContent = formatBytes(response.responseBytes);
  $('finalUrl').textContent = response.finalUrl;
  $('responseHeaders').value = Object.entries(response.headers || {})
    .map(([key, values]) => `${key}: ${values.join(', ')}`)
    .join('\n');
  $('responseBody').value = formatBody(response);
}

function formatBody(response) {
  const body = response.body || '';
  const contentType = Object.entries(response.headers || {})
    .find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.join(',').toLowerCase() || '';
  const trimmed = body.trim();
  if (!trimmed) {
    return body;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || contentType.includes('json')) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  if (contentType.includes('xml') || trimmed.startsWith('<?xml') || looksLikeXml(trimmed)) {
    return formatMarkupBody(body, 'application/xml');
  }
  if (contentType.includes('html') || looksLikeHtml(trimmed)) {
    return formatMarkupBody(body, 'text/html');
  }
  return body;
}

function looksLikeXml(value) {
  return /^<([A-Za-z_][\w:.-]*)(\s|>|\/>)/.test(value) && !looksLikeHtml(value);
}

function looksLikeHtml(value) {
  return /<!doctype\s+html/i.test(value) || /^<html[\s>]/i.test(value) || /<(body|head|main|section|article|div|span|h1|p|table|form|script|style)(\s|>)/i.test(value);
}

function formatMarkupBody(body, mimeType) {
  try {
    const document = new DOMParser().parseFromString(body, mimeType);
    if (document.getElementsByTagName?.('parsererror')?.length) {
      return body;
    }
    const serialized = document.documentElement?.outerHTML
      || new XMLSerializer().serializeToString(document);
    return prettyMarkup(serialized);
  } catch {
    return prettyMarkup(body) || body;
  }
}

function prettyMarkup(markup) {
  const lines = String(markup || '')
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let depth = 0;
  return lines.map((line) => {
    if (/^<\//.test(line)) {
      depth = Math.max(0, depth - 1);
    }
    const output = `${'  '.repeat(depth)}${line}`;
    if (/^<[^!?/][^>]*[^/]>\s*$/.test(line) && !/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(line)) {
      depth++;
    }
    if (/<\/[^>]+>\s*$/.test(line) && !/^<\//.test(line) && !/^<[^>]+>[^<]*<\/[^>]+>$/.test(line)) {
      depth = Math.max(0, depth - 1);
    }
    return output;
  }).join('\n');
}

async function runLoadTest() {
  const request = activeRequest();
  if (!request) {
    return setStatus('Select a request before running a load test.');
  }
  collectRequestFromEditor();
  await saveWorkspace(false);
  const environment = activeEnvironment();
  const errors = await window.postmeter.request.validate(request, environment);
  if (errors.length) {
    $('validationLabel').textContent = errors.join(' ');
    return setStatus('Fix validation errors.');
  }
  const concurrency = Number($('loadConcurrency').value);
  const allowedHosts = loadAllowedHostsForRequest(request);
  if (!allowedHosts.length) {
    return setStatus('Add at least one allowed host before running a load test.');
  }
  let confirmedHighConcurrency = false;
  if (concurrency >= 50) {
    confirmedHighConcurrency = confirm(`Run load test with concurrency ${concurrency}?`);
    if (!confirmedHighConcurrency) {
      return setStatus('Load test cancelled.');
    }
  }
  activeLoadId = crypto.randomUUID();
  $('runLoadButton').disabled = true;
  $('cancelLoadButton').disabled = false;
  $('exportLoadJsonButton').disabled = true;
  $('exportLoadCsvButton').disabled = true;
  $('loadResults').textContent = 'Starting load test...';
  try {
    lastLoadResult = await window.postmeter.loadTest.start(activeLoadId, request, environment, {
      concurrency,
      totalRequests: Number($('loadRequests').value),
      durationSeconds: Number($('loadDurationSeconds').value),
      rampUpSeconds: Number($('loadRampUpSeconds').value),
      targetRatePerSecond: Number($('loadTargetRate').value),
      executionMode: $('loadExecutionMode').value,
      workerProcesses: Number($('loadWorkerProcesses').value),
      recordSamples: $('loadRecordSamples').checked,
      allowedHosts,
      confirmedHighConcurrency
    });
    $('loadResults').textContent = formatLoadResult(lastLoadResult);
    $('exportLoadJsonButton').disabled = false;
    $('exportLoadCsvButton').disabled = false;
    setStatus(lastLoadResult.cancelled ? 'Load test cancelled.' : 'Load test completed.');
  } catch (error) {
    const message = error.message || String(error);
    $('loadResults').textContent = message;
    setStatus('Load test failed.');
    notifyUser('Load Test Failed', message);
  } finally {
    $('runLoadButton').disabled = false;
    $('cancelLoadButton').disabled = true;
    activeLoadId = null;
  }
}

function formatLoadProgress(progress) {
  const lines = [
    'Running load test...',
    `Mode: ${progress.mode === 'duration' ? `duration (${progress.durationSeconds}s)` : 'request count'}`,
    `Completed ${progress.completedRequests} of ${progress.requestedRequests} max requests.`,
    `Elapsed: ${progress.elapsedMillis || 0} ms`,
    `Target RPS: ${progress.targetRatePerSecond || 0}`,
    `Execution: ${progress.executionMode || 'singleProcess'} (${progress.workerProcesses || 1} process${(progress.workerProcesses || 1) === 1 ? '' : 'es'})`,
    `Active workers: ${progress.activeWorkers || 0}`
  ];
  return lines.join('\n');
}

async function cancelLoadTest() {
  if (activeLoadId) {
    await window.postmeter.loadTest.cancel(activeLoadId);
    setStatus('Cancelling load test...');
  }
}

async function runActiveCollection() {
  const collection = activeCollection();
  if (!collection) {
    return setStatus('Select a collection before running it.');
  }
  collectRequestFromEditor();
  await saveWorkspace(false);
  activeRunnerId = crypto.randomUUID();
  lastRunnerResult = null;
  $('runCollectionButton').disabled = true;
  $('cancelRunnerButton').disabled = false;
  $('exportRunnerJsonButton').disabled = true;
  $('exportRunnerCsvButton').disabled = true;
  $('runnerResults').textContent = 'Starting collection run...';
  try {
    const result = await window.postmeter.runner.start(activeRunnerId, collection, activeEnvironment(), {
      stopOnFailure: $('runnerStopOnFailure').checked
    });
    if (Array.isArray(result.cookies)) {
      workspace.cookies = result.cookies;
      renderCookieJarEditor();
    }
    lastRunnerResult = result;
    $('runnerResults').textContent = formatRunnerResult(result);
    $('exportRunnerJsonButton').disabled = false;
    $('exportRunnerCsvButton').disabled = false;
    setStatus(result.cancelled ? 'Collection run cancelled.' : 'Collection run completed.');
  } catch (error) {
    const message = error.message || String(error);
    $('runnerResults').textContent = message;
    setStatus('Collection run failed.');
    notifyUser('Collection Run Failed', message);
  } finally {
    $('runCollectionButton').disabled = false;
    $('cancelRunnerButton').disabled = true;
    activeRunnerId = null;
  }
}

async function cancelCollectionRun() {
  if (activeRunnerId) {
    await window.postmeter.runner.cancel(activeRunnerId);
    setStatus('Cancelling collection run...');
  }
}

async function exportRunnerResult(format) {
  if (!lastRunnerResult) {
    return;
  }
  const result = await window.postmeter.runner.export(lastRunnerResult, format);
  if (!result.cancelled) {
    setStatus(`Collection run exported to ${result.path}.`);
  }
}

function formatRunnerResult(result) {
  const lines = [
    `Collection: ${result.collectionName || '-'}`,
    `Passed: ${result.passed}`,
    `Completed requests: ${result.totalRequests}`,
    `Passed requests: ${result.passedRequests}`,
    `Failed requests: ${result.failedRequests}`,
    `Cancelled: ${result.cancelled}`
  ];
  for (const item of result.results || []) {
    lines.push('');
    lines.push(`${item.passed ? 'PASS' : 'FAIL'} ${item.requestName} ${item.statusCode ? `(${item.statusCode}, ${item.durationMillis} ms)` : ''}`);
    if (item.error) {
      lines.push(`Error: ${item.error}`);
    }
    for (const assertion of item.assertionResults || []) {
      lines.push(`- ${assertion.passed ? 'PASS' : 'FAIL'} ${assertion.message}`);
    }
    appendScriptResultLines(lines, 'Pre-request', item.preRequestScriptResult);
    appendScriptResultLines(lines, 'Tests', item.testScriptResult);
    for (const variable of item.extractedVariables || []) {
      lines.push(`- Extracted ${variable.key}`);
    }
    const localVariables = visibleVariables(item.localVariables || []);
    for (const variable of localVariables) {
      lines.push(`- Request variable ${variable.key} = ${redactedVariableValue(variable)}`);
    }
  }
  appendRuntimeVariableLines(lines, result);
  return lines.join('\n');
}

function appendRuntimeVariableLines(lines, result) {
  const collectionVariables = visibleVariables(result.collectionVariables || []);
  const environmentVariables = visibleVariables(result.environment?.variables || []);
  if (!collectionVariables.length && !environmentVariables.length) {
    return;
  }
  lines.push('');
  lines.push('Runtime Variables');
  for (const variable of collectionVariables) {
    lines.push(`- Collection ${variable.key} = ${redactedVariableValue(variable)}`);
  }
  for (const variable of environmentVariables) {
    lines.push(`- Environment ${variable.key} = ${redactedVariableValue(variable)}`);
  }
}

function visibleVariables(variables) {
  return (variables || [])
    .filter((variable) => variable.enabled !== false && variable.key)
    .sort((left, right) => left.key.localeCompare(right.key));
}

function appendScriptResultLines(lines, label, scriptResult) {
  if (!scriptResult) {
    return;
  }
  if (scriptResult.error) {
    lines.push(`- ${label} script error: ${scriptResult.error}`);
  }
  for (const test of scriptResult.tests || []) {
    lines.push(`- ${test.passed ? 'PASS' : 'FAIL'} ${label}: ${test.name}${test.error ? ` (${test.error})` : ''}`);
  }
}

async function exportLoadResult(format) {
  if (!lastLoadResult) {
    return;
  }
  const result = await window.postmeter.loadTest.export(lastLoadResult, format);
  if (!result.cancelled) {
    setStatus(`Load test exported to ${result.path}.`);
  }
}

async function startDeviceFlow() {
  const request = activeRequest();
  if (!request) {
    return setStatus('Select a request before starting device authorization.');
  }
  collectRequestFromEditor();
  if (request.auth?.type !== 'oauth2' || request.auth?.grantType !== 'deviceCode') {
    return setStatus('Select OAuth 2.0 Device Code before starting device authorization.');
  }
  activeOauthFlowId = crypto.randomUUID();
  setOauthButtonsBusy(true);
  setStatus('Starting OAuth device authorization...');
  renderOauthProgress({
    type: 'device',
    status: 'starting',
    message: 'Starting OAuth device authorization.'
  });
  try {
    const startDevice = window.__postmeterStartDeviceFlow || window.postmeter.oauth.startDeviceFlow;
    const result = await startDevice(activeOauthFlowId, request.auth, activeEnvironment());
    if (result.auth) {
      request.auth = result.auth;
      renderAuthEditor(request.auth);
      renderCollections();
      await saveWorkspace(false);
    }
    setStatus(result.cancelled ? 'OAuth device authorization cancelled.' : 'OAuth device authorization completed.');
  } catch (error) {
    const message = error.message || String(error);
    setStatus('OAuth device authorization failed.');
    $('validationLabel').textContent = message;
    notifyUser('OAuth Device Authorization Failed', message);
  } finally {
    setOauthButtonsBusy(false);
    activeOauthFlowId = null;
  }
}

async function startPkceFlow() {
  const request = activeRequest();
  if (!request) {
    return setStatus('Select a request before starting authorization.');
  }
  collectRequestFromEditor();
  if (request.auth?.type !== 'oauth2' || request.auth?.grantType !== 'authorizationCode') {
    return setStatus('Select OAuth 2.0 Authorization Code before starting authorization.');
  }
  activeOauthFlowId = crypto.randomUUID();
  setOauthButtonsBusy(true);
  setStatus('Starting OAuth authorization...');
  renderOauthProgress({
    type: 'pkce',
    status: 'starting',
    message: 'Starting OAuth authorization-code flow.'
  });
  try {
    const startPkce = window.__postmeterStartPkceFlow || window.postmeter.oauth.startPkceFlow;
    const result = await startPkce(
      activeOauthFlowId,
      request.auth,
      activeEnvironment(),
      $('authOauthRedirectStrategySelect').value
    );
    if (result.auth) {
      request.auth = result.auth;
      renderAuthEditor(request.auth);
      renderCollections();
      await saveWorkspace(false);
    }
    setStatus(result.cancelled ? 'OAuth authorization cancelled.' : 'OAuth authorization completed.');
  } catch (error) {
    const message = error.message || String(error);
    setStatus('OAuth authorization failed.');
    $('validationLabel').textContent = message;
    notifyUser('OAuth Authorization Failed', message);
  } finally {
    setOauthButtonsBusy(false);
    activeOauthFlowId = null;
  }
}

async function cancelOauthFlow() {
  if (activeOauthFlowId) {
    await window.postmeter.oauth.cancelFlow(activeOauthFlowId);
    setStatus('Cancelling OAuth flow...');
  }
}

function setOauthButtonsBusy(isBusy) {
  $('startPkceFlowButton').disabled = isBusy;
  $('startDeviceFlowButton').disabled = isBusy;
  $('cancelOauthFlowButton').disabled = !isBusy;
}

function renderOauthProgress(progress) {
  $('oauthProgressPanel').hidden = false;
  $('oauthProgressStatus').textContent = oauthStatusText(progress);
  $('oauthProgressDetail').textContent = oauthProgressDetail(progress);
}

function oauthStatusText(progress) {
  const type = progress.type === 'device' ? 'Device code' : 'Authorization code';
  return `${type}: ${progress.status || 'working'}`;
}

function oauthProgressDetail(progress) {
  return [
    progress.message || '',
    progress.userCode ? `User code: ${progress.userCode}` : '',
    progress.verificationUriComplete ? `Verification URL: ${progress.verificationUriComplete}` : '',
    !progress.verificationUriComplete && progress.verificationUri ? `Verification URL: ${progress.verificationUri}` : '',
    progress.redirectUri ? `Redirect URI: ${progress.redirectUri}` : '',
    progress.nextAttemptAt ? `Next poll: ${new Date(progress.nextAttemptAt).toLocaleTimeString()}` : '',
    progress.expiresAt ? `Expires: ${new Date(progress.expiresAt).toLocaleTimeString()}` : ''
  ].filter(Boolean).join('\n');
}

function formatLoadResult(result) {
  return [
    `Mode: ${result.mode === 'duration' ? `duration (${result.durationSeconds}s)` : 'request count'}`,
    `Requested requests: ${result.requestedRequests}`,
    `Completed requests: ${result.totalRequests}`,
    `Cancelled: ${result.cancelled}`,
    `Elapsed: ${result.elapsedMillis || 0} ms`,
    `Ramp-up: ${result.rampUpSeconds || 0} s`,
    `Target RPS: ${result.targetRatePerSecond || 0}`,
    `Execution: ${result.executionMode || 'singleProcess'} (${result.workerProcesses || 1} process${(result.workerProcesses || 1) === 1 ? '' : 'es'})`,
    `Successful: ${result.successfulRequests}`,
    `Failed: ${result.failedRequests}`,
    `Error rate: ${(result.errorRate * 100).toFixed(2)}%`,
    `Requests/sec: ${result.requestsPerSecond.toFixed(2)}`,
    `Latency min/avg/p50/p90/p95/p99/max: ${result.minMillis} / ${result.averageMillis.toFixed(2)} / ${result.p50Millis} / ${result.p90Millis} / ${result.p95Millis} / ${result.p99Millis} / ${result.maxMillis} ms`,
    `Latency histogram: ${formatLatencyHistogram(result.latencyHistogram)}`,
    `Status counts: ${JSON.stringify(result.statusCounts)}`,
    Array.isArray(result.samples) ? `Samples recorded: ${result.samples.length}${result.sampleLimitReached ? ` (capped at ${result.sampleLimit})` : ''}` : '',
    result.errors?.length ? `Errors:\n- ${result.errors.join('\n- ')}` : ''
  ].filter(Boolean).join('\n');
}

function formatLatencyHistogram(histogram) {
  if (!Array.isArray(histogram) || !histogram.length) {
    return 'none';
  }
  return histogram
    .map((bucket) => `${bucket.upperBoundMillis == null ? 'overflow' : `<=${bucket.upperBoundMillis}ms`}:${bucket.count}`)
    .join(' ');
}

async function saveWorkspace(showStatus = true) {
  collectRequestFromEditor();
  collectEnvironmentFromEditor();
  collectSettingsFromEditor();
  const save = window.__postmeterSaveWorkspace || window.postmeter.workspace.save;
  workspace = await save(workspace);
  if (showStatus) {
    setStatus('Workspace saved.');
  }
}

async function importWorkspace() {
  if (!confirm('Importing a workspace replaces the current workspace. A backup will be created first. Continue?')) {
    return;
  }
  const result = await window.postmeter.workspace.importWorkspace();
  if (result.cancelled) {
    return;
  }
  workspace = result.workspace;
  selectInitialWorkspaceItem();
  renderAll();
  setStatus(`Workspace imported. Backup: ${result.backupPath || 'none'}`);
}

async function exportWorkspace() {
  await saveWorkspace(false);
  const exportWorkspaceBoundary = window.__postmeterExportWorkspace || window.postmeter.workspace.exportWorkspace;
  const result = await exportWorkspaceBoundary(workspace);
  if (!result.cancelled) {
    setStatus(`Workspace exported to ${result.path}.`);
  }
}

async function checkForUpdates() {
  setStatus('Checking for updates...');
  try {
    collectSettingsFromEditor();
    const updateCheck = window.__postmeterUpdateCheck || window.postmeter.app.checkForUpdates;
    const result = await updateCheck({
      includePrereleases: workspace.settings?.updates?.includePrereleases === true
    });
    if (!result.updateAvailable) {
      const message = `PostMeter is up to date (${result.currentVersion}${result.includePrereleases ? ', prereleases included' : ''}).`;
      setStatus(message);
      notifyUser('No Updates Available', message);
      return;
    }
    setStatus(`PostMeter ${result.latestVersion} is available.`);
    if (result.releaseUrl && confirm(`PostMeter ${result.latestVersion} is available. Open GitHub Releases?`)) {
      const openExternal = window.__postmeterOpenExternal || window.postmeter.app.openExternal;
      await openExternal(result.releaseUrl);
    }
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Update check failed: ${message}`);
    notifyUser('Update Check Failed', message);
  }
}

async function importCollection() {
  const importCollectionBoundary = window.__postmeterImportCollection || window.postmeter.collection.importCollection;
  const result = await importCollectionBoundary();
  if (result.cancelled) {
    return;
  }
  result.collection.name = uniqueName(result.collection.name, workspace.collections.map((collection) => collection.name));
  promoteCookieHeadersToJar(result.collection);
  workspace.collections.push(result.collection);
  activeCollectionId = result.collection.id;
  selectFirstRequest(result.collection);
  renderAll();
  await saveWorkspace();
}

function promoteCookieHeadersToJar(collection) {
  workspace.cookies ||= [];
  walkCollectionRequests(collection, (request) => {
    const host = domainFromRequestUrl(request.url);
    if (!host) {
      return;
    }
    const metadataByName = postmanCookieMetadataByName(request.variables);
    const headers = request.headers || [];
    const retainedHeaders = [];
    for (const header of headers) {
      if (header.enabled !== false && String(header.key || '').toLowerCase() === 'cookie') {
        for (const cookie of parseCookieHeaderForJar(header.value || '', host)) {
          upsertWorkspaceCookie(applyPostmanCookieMetadata(cookie, metadataByName.get(cookie.name.toLowerCase())));
        }
        request.cookieJar = { enabled: true, storeResponses: true };
      } else {
        retainedHeaders.push(header);
      }
    }
    request.headers = retainedHeaders;
  });
}

function postmanCookieMetadataByName(variables = []) {
  const map = new Map();
  const source = (variables || []).find((variable) => variable.enabled !== false && variable.key === 'postman.cookies');
  if (!source?.value) {
    return map;
  }
  try {
    const cookies = JSON.parse(source.value);
    if (!Array.isArray(cookies)) {
      return map;
    }
    for (const cookie of cookies) {
      if (cookie?.name) {
        map.set(String(cookie.name).toLowerCase(), cookie);
      }
    }
  } catch {
    return map;
  }
  return map;
}

function applyPostmanCookieMetadata(cookie, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return cookie;
  }
  const domain = normalizeCookieDomain(metadata.domain);
  const sameSite = normalizeCookieSameSite(metadata.sameSite);
  return {
    ...cookie,
    value: metadata.value == null ? cookie.value : String(metadata.value),
    domain: domain || cookie.domain,
    path: metadata.path ? String(metadata.path) : cookie.path,
    expiresAt: normalizeCookieExpiresAt(metadata.expiresAt) || cookie.expiresAt,
    secure: metadata.secure === true,
    httpOnly: metadata.httpOnly === true,
    sameSite,
    hostOnly: domain ? metadata.hostOnly === true : cookie.hostOnly,
    priority: normalizeCookiePriority(metadata.priority),
    partitioned: metadata.partitioned === true,
    source: metadata.source ? String(metadata.source).slice(0, 64) : cookie.source || '',
    extensions: Array.isArray(metadata.extensions) ? metadata.extensions.map(String).filter(Boolean).slice(0, 25) : cookie.extensions || []
  };
}

function parseCookieHeaderForJar(value, domain) {
  return String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) {
        return null;
      }
      return {
        id: crypto.randomUUID(),
        enabled: true,
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
        domain,
        path: '/',
        expiresAt: '',
        secure: false,
        httpOnly: false,
        sameSite: 'Lax',
        hostOnly: true,
        priority: '',
        partitioned: false,
        source: '',
        extensions: []
      };
    })
    .filter((cookie) => cookie?.name);
}

function normalizeCookiePriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'high') {
    return 'High';
  }
  if (normalized === 'medium') {
    return 'Medium';
  }
  if (normalized === 'low') {
    return 'Low';
  }
  return '';
}

function upsertWorkspaceCookie(cookie) {
  const index = (workspace.cookies || []).findIndex((existing) =>
    existing.name.toLowerCase() === cookie.name.toLowerCase()
    && existing.domain.toLowerCase() === cookie.domain.toLowerCase()
    && (existing.path || '/') === (cookie.path || '/')
  );
  if (index >= 0) {
    workspace.cookies[index] = { ...workspace.cookies[index], ...cookie, id: workspace.cookies[index].id };
  } else {
    workspace.cookies.push(cookie);
  }
}

function walkCollectionRequests(collection, visitor) {
  for (const request of collection.requests || []) {
    visitor(request);
  }
  for (const folder of collection.folders || []) {
    walkFolderRequests(folder, visitor);
  }
}

function walkFolderRequests(folder, visitor) {
  for (const request of folder.requests || []) {
    visitor(request);
  }
  for (const child of folder.folders || []) {
    walkFolderRequests(child, visitor);
  }
}

function collectSettingsFromEditor() {
  ensureSettings();
}

async function exportCollection(collection = activeCollection(), format = 'postmeter') {
  if (!collection) {
    return setStatus('Select a collection to export.');
  }
  const exportCollectionBoundary = window.__postmeterExportCollection || window.postmeter.collection.exportCollection;
  const result = await exportCollectionBoundary(collection, format);
  if (!result.cancelled) {
    setStatus(`Collection exported to ${result.path}.`);
  }
}

function newCollection() {
  const collection = {
    id: crypto.randomUUID(),
    name: uniqueName('New Collection', workspace.collections.map((existing) => existing.name)),
    description: '',
    variables: [],
    certificates: [],
    requests: [],
    folders: []
  };
  const request = newRequestObject('New Request');
  collection.requests.push(request);
  workspace.collections.push(collection);
  activeCollectionId = collection.id;
  activeFolderId = null;
  activeRequestId = request.id;
  renderAll();
}

function newRequest(collectionId = activeCollectionId, folderId = activeFolderId) {
  const collection = workspace.collections.find((item) => item.id === collectionId);
  if (!collection) {
    return newCollection();
  }
  const request = newRequestObject(uniqueName('New Request', allRequestNames(collection)));
  const folder = folderId ? findFolder(collection, folderId) : null;
  if (folder) {
    folder.requests.push(request);
    activeFolderId = folder.id;
  } else {
    collection.requests.push(request);
    activeFolderId = null;
  }
  activeCollectionId = collection.id;
  activeRequestId = request.id;
  renderAll();
}

function newFolder(collectionId = activeCollectionId, parentFolderId = activeFolderId) {
  const collection = workspace.collections.find((item) => item.id === collectionId);
  if (!collection) {
    return newCollection();
  }
  const folder = {
    id: crypto.randomUUID(),
    name: uniqueName('New Folder', allFolderNames(collection)),
    requests: [],
    folders: []
  };
  const parent = parentFolderId ? findFolder(collection, parentFolderId) : null;
  if (parent) {
    parent.folders.push(folder);
  } else {
    collection.folders.push(folder);
  }
  activeCollectionId = collection.id;
  activeFolderId = folder.id;
  activeRequestId = null;
  renderAll();
}

function newRequestObject(name) {
  return {
    id: crypto.randomUUID(),
    name,
    method: 'GET',
    url: '',
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

function newEnvironment() {
  const environment = {
    id: crypto.randomUUID(),
    name: uniqueName('New Environment', workspace.environments.map((item) => item.name)),
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.com', secret: false }]
  };
  workspace.environments.push(environment);
  activeEnvironmentId = environment.id;
  renderEnvironmentSelect();
  renderEnvironmentEditor();
}

function deleteEnvironment() {
  const environment = activeEnvironment();
  if (!environment || !confirm(`Delete ${environment.name}?`)) {
    return;
  }
  workspace.environments = workspace.environments.filter((item) => item.id !== environment.id);
  activeEnvironmentId = 'none';
  renderEnvironmentSelect();
  renderEnvironmentEditor();
}

function addVariable() {
  const environment = activeEnvironment();
  if (environment) {
    environment.variables.push({ enabled: true, key: '', value: '', secret: false });
    renderEnvironmentEditor();
  }
}

function addCollectionVariable() {
  const collection = activeCollection();
  if (collection) {
    collection.variables ||= [];
    collection.variables.push({ enabled: true, key: '', value: '', secret: false });
    renderCollectionVariablesEditor();
  }
}

function addRequestVariable() {
  const request = activeRequest();
  if (request) {
    request.variables ||= [];
    request.variables.push({ enabled: true, key: '', value: '', secret: false });
    renderRequestEditor();
  }
}

function addCookie() {
  workspace.cookies ||= [];
  const request = activeRequest();
  const domain = domainFromRequestUrl(request?.url) || 'example.com';
  workspace.cookies.push({
    id: crypto.randomUUID(),
    enabled: true,
    name: '',
    value: '',
    domain,
    path: '/',
    expiresAt: '',
    secure: false,
    httpOnly: false,
    sameSite: 'Lax',
    hostOnly: true
  });
  renderCookieJarEditor();
}

function clearExpiredCookies() {
  workspace.cookies ||= [];
  const before = workspace.cookies.length;
  workspace.cookies = workspace.cookies.filter((cookie) => !isExpiredCookie(cookie));
  renderCookieJarEditor();
  setStatus(`Removed ${before - workspace.cookies.length} expired cookies.`);
}

function domainFromRequestUrl(url) {
  try {
    return new URL(String(url || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function rendererCookieMatchesHost(cookie, hostname) {
  const host = normalizeCookieDomain(hostname);
  const domain = normalizeCookieDomain(cookie?.domain);
  if (!host || !domain) {
    return false;
  }
  if (cookie?.hostOnly !== false) {
    return host === domain;
  }
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizeCookieDomain(domain) {
  return String(domain || '').trim().replace(/^\./, '').replace(/\.$/, '').toLowerCase();
}

function normalizeCookieExpiresAt(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeCookieSameSite(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'strict') {
    return 'Strict';
  }
  if (normalized === 'lax') {
    return 'Lax';
  }
  if (normalized === 'none') {
    return 'None';
  }
  return '';
}

function isExpiredCookie(cookie) {
  if (!cookie.expiresAt) {
    return false;
  }
  const expires = new Date(cookie.expiresAt).getTime();
  return Number.isFinite(expires) && expires <= Date.now();
}

function addExample() {
  const request = activeRequest();
  if (!request) {
    return;
  }
  request.examples ||= [];
  request.examples.push(newExampleObject());
  renderExamples(request.examples);
}

function captureResponseExample() {
  const request = activeRequest();
  if (!request || !lastResponse) {
    return setStatus('Send a request before capturing a response example.');
  }
  request.examples ||= [];
  request.examples.push(exampleFromResponse(lastResponse));
  renderExamples(request.examples);
  setStatus('Captured response example.');
}

async function exportRequestExamples() {
  const request = activeRequest();
  if (!request) {
    return setStatus('Select a request before exporting examples.');
  }
  if (!request.examples?.length) {
    return setStatus('This request does not have examples to export.');
  }
  collectRequestFromEditor();
  const exportExamplesBoundary = window.__postmeterExportExamples || window.postmeter.request.exportExamples;
  const result = await exportExamplesBoundary(request);
  if (!result.cancelled) {
    setStatus(`Examples exported to ${result.path}.`);
  }
}

function duplicateExample(index) {
  const request = activeRequest();
  if (!request?.examples?.[index]) {
    return;
  }
  const duplicate = structuredClone(request.examples[index]);
  duplicate.id = crypto.randomUUID();
  duplicate.name = uniqueName(`${duplicate.name || 'Example Response'} Copy`, request.examples.map((example) => example.name));
  request.examples.splice(index + 1, 0, duplicate);
  renderExamples(request.examples);
}

function deleteExample(index) {
  const request = activeRequest();
  if (!request?.examples?.[index] || !confirm(`Delete ${request.examples[index].name || 'example'}?`)) {
    return;
  }
  request.examples.splice(index, 1);
  renderExamples(request.examples);
}

function newExampleObject() {
  return {
    id: crypto.randomUUID(),
    name: uniqueName('Example Response', activeRequest()?.examples?.map((example) => example.name) || []),
    statusCode: 200,
    headers: [],
    bodyType: 'RAW_JSON',
    body: '{}'
  };
}

function exampleFromResponse(response) {
  return {
    id: crypto.randomUUID(),
    name: uniqueName(`Response ${response.statusCode || ''}`.trim() || 'Example Response', activeRequest()?.examples?.map((example) => example.name) || []),
    statusCode: response.statusCode || 0,
    headers: Object.entries(response.headers || {}).flatMap(([key, values]) => (values || []).map((value) => ({ enabled: true, key, value }))),
    bodyType: looksLikeJson(response.body) ? 'RAW_JSON' : 'RAW_TEXT',
    body: response.body || ''
  };
}

function looksLikeJson(value) {
  if (!String(value || '').trim()) {
    return false;
  }
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function addPair(fieldName) {
  const request = activeRequest();
  if (request) {
    request[fieldName].push({ enabled: true, key: '', value: '' });
    renderRequestEditor();
  }
}

function addAssertion(template = ASSERTION_TEMPLATES.status200) {
  const request = activeRequest();
  if (request) {
    request.assertions ||= [];
    request.assertions.push(newAssertion(template));
    renderAssertions(request.assertions);
  }
}

function addAssertionTemplate() {
  const template = ASSERTION_TEMPLATES[$('assertionTemplateSelect').value] || ASSERTION_TEMPLATES.status200;
  addAssertion(template);
}

function newAssertion(template) {
  return {
      enabled: true,
      type: template.type || 'statusCode',
      operator: template.operator || 'equals',
      expected: template.expected ?? '',
      name: template.name || '',
      path: template.path || '',
      variableName: template.variableName || ''
  };
}

function renameCollection(collection) {
  const value = prompt('Collection name', collection.name);
  if (value?.trim()) {
    collection.name = uniqueName(value.trim(), workspace.collections.filter((item) => item !== collection).map((item) => item.name));
    renderCollections();
  }
}

function renameFolder(folder) {
  const value = prompt('Folder name', folder.name);
  if (value?.trim()) {
    folder.name = value.trim();
    renderCollections();
  }
}

function deleteFolder(collection, folder) {
  if (!confirm(`Delete ${folder.name} and everything inside it?`)) {
    return;
  }
  removeFolder(collection, folder.id);
  activeCollectionId = collection.id;
  selectFirstRequest(collection);
  renderAll();
}

function renameRequest(request) {
  const value = prompt('Request name', request.name);
  if (value?.trim()) {
    request.name = value.trim();
    renderCollections();
    renderRequestEditor();
  }
}

function duplicateRequest(collection, folder, request) {
  const duplicate = structuredClone(request);
  duplicate.id = crypto.randomUUID();
  duplicate.name = uniqueName(`${request.name} Copy`, allRequestNames(collection));
  (folder ? folder.requests : collection.requests).push(duplicate);
  activeCollectionId = collection.id;
  activeFolderId = folder?.id || null;
  activeRequestId = duplicate.id;
  renderAll();
}

function deleteCollection(collection) {
  if (!confirm(`Delete ${collection.name}?`)) {
    return;
  }
  workspace.collections = workspace.collections.filter((item) => item.id !== collection.id);
  if (!workspace.collections.length) {
    clearActiveWorkspaceItem();
    renderAll();
  } else {
    selectInitialWorkspaceItem();
    renderAll();
  }
}

function clearActiveWorkspaceItem() {
  activeCollectionId = null;
  activeFolderId = null;
  activeRequestId = null;
}

function deleteRequest(collection, folder, request) {
  if (!confirm(`Delete ${request.name}?`)) {
    return;
  }
  const list = folder ? folder.requests : collection.requests;
  const index = list.findIndex((item) => item.id === request.id);
  if (index >= 0) {
    list.splice(index, 1);
  }
  selectFirstRequest(collection);
  renderAll();
}

function collectRequestFromEditor() {
  const request = activeRequest();
  if (!request) {
    return;
  }
  request.name = $('requestNameInput').value.trim() || 'Untitled Request';
  request.method = METHODS.includes($('methodSelect').value) ? $('methodSelect').value : 'GET';
  request.url = $('urlInput').value.trim();
  request.bodyType = BODY_TYPES.includes($('bodyTypeSelect').value) ? $('bodyTypeSelect').value : 'NONE';
  request.body = $('bodyInput').value;
  request.auth = collectAuthFromEditor();
  request.assertions ||= [];
  request.scripts = {
    preRequest: $('preRequestScriptInput').value,
    tests: $('testScriptInput').value
  };
  request.cookieJar = {
    enabled: $('requestCookieJarEnabledInput').checked,
    storeResponses: $('requestCookieJarStoreInput').checked
  };
}

function collectAuthFromEditor() {
  const type = $('authTypeSelect').value;
  const existingAuth = activeRequest()?.auth || {};
  if (type === 'bearer') {
    return { type, token: $('authBearerTokenInput').value };
  }
  if (type === 'basic') {
    return {
      type,
      username: $('authBasicUsernameInput').value,
      password: $('authBasicPasswordInput').value
    };
  }
  if (type === 'apiKey') {
    return {
      type,
      location: $('authApiKeyLocationSelect').value,
      key: $('authApiKeyNameInput').value,
      value: $('authApiKeyValueInput').value
    };
  }
  if (type === 'cookie') {
    return { type, value: $('authCookieValueInput').value };
  }
  if (type === 'oauth2') {
    const grantType = $('authOauthGrantTypeSelect').value;
    const keepDeviceState = grantType === 'deviceCode' && existingAuth.type === 'oauth2';
    return {
      type,
      tokenType: $('authOauthTokenTypeSelect').value,
      accessToken: $('authOauthAccessTokenInput').value,
      refreshToken: $('authOauthRefreshTokenInput').value,
      authorizationUrl: $('authOauthAuthorizationUrlInput').value,
      deviceAuthorizationUrl: $('authOauthDeviceAuthorizationUrlInput').value,
      tokenUrl: $('authOauthTokenUrlInput').value,
      clientId: $('authOauthClientIdInput').value,
      clientSecret: $('authOauthClientSecretInput').value,
      scopes: $('authOauthScopesInput').value,
      grantType,
      redirectStrategy: $('authOauthRedirectStrategySelect').value,
      redirectUri: existingAuth.type === 'oauth2' ? existingAuth.redirectUri || '' : '',
      expiresAt: existingAuth.type === 'oauth2' ? existingAuth.expiresAt || '' : '',
      deviceCode: keepDeviceState ? existingAuth.deviceCode || '' : '',
      userCode: keepDeviceState ? $('authOauthUserCodeInput').value : '',
      verificationUri: keepDeviceState ? existingAuth.verificationUri || '' : '',
      verificationUriComplete: keepDeviceState ? existingAuth.verificationUriComplete || '' : '',
      deviceCodeExpiresAt: keepDeviceState ? existingAuth.deviceCodeExpiresAt || '' : '',
      devicePollIntervalSeconds: keepDeviceState ? existingAuth.devicePollIntervalSeconds || '' : ''
    };
  }
  if (type === 'clientCertificate') {
    return {
      type,
      pfxPath: $('authClientPfxPathInput').value,
      certPath: $('authClientCertPathInput').value,
      keyPath: $('authClientKeyPathInput').value,
      caPath: $('authClientCaPathInput').value,
      passphrase: $('authClientPassphraseInput').value
    };
  }
  return { type: 'none' };
}

function collectEnvironmentFromEditor() {
  const environment = activeEnvironment();
  if (environment) {
    environment.name = $('environmentNameInput').value.trim() || 'Untitled Environment';
    renderEnvironmentSelect();
  }
}

function activeCollection() {
  return workspace.collections.find((collection) => collection.id === activeCollectionId);
}

function activeEnvironment() {
  return workspace.environments.find((environment) => environment.id === activeEnvironmentId) || null;
}

function activeRequest() {
  const collection = activeCollection();
  if (!collection || !activeRequestId) {
    return null;
  }
  return findRequest(collection, activeRequestId)?.request || null;
}

function firstRequestInCollection(collection) {
  if (collection.requests?.length) {
    return { request: collection.requests[0], folderId: null };
  }
  for (const folder of collection.folders || []) {
    const found = firstRequestInFolder(folder);
    if (found) {
      return found;
    }
  }
  return null;
}

function firstRequestInFolder(folder) {
  if (folder.requests?.length) {
    return { request: folder.requests[0], folderId: folder.id };
  }
  for (const child of folder.folders || []) {
    const found = firstRequestInFolder(child);
    if (found) {
      return found;
    }
  }
  return null;
}

function findRequest(collection, requestId) {
  for (const request of collection.requests || []) {
    if (request.id === requestId) {
      return { request, folder: null };
    }
  }
  for (const folder of collection.folders || []) {
    const found = findRequestInFolder(folder, requestId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findRequestInFolder(folder, requestId) {
  for (const request of folder.requests || []) {
    if (request.id === requestId) {
      return { request, folder };
    }
  }
  for (const child of folder.folders || []) {
    const found = findRequestInFolder(child, requestId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findFolder(collection, folderId) {
  for (const folder of collection.folders || []) {
    const found = findFolderRecursive(folder, folderId);
    if (found) {
      return found;
    }
  }
  return null;
}

function removeFolder(collection, folderId) {
  const index = (collection.folders || []).findIndex((folder) => folder.id === folderId);
  if (index >= 0) {
    collection.folders.splice(index, 1);
    return true;
  }
  for (const folder of collection.folders || []) {
    if (removeFolderFromParent(folder, folderId)) {
      return true;
    }
  }
  return false;
}

function removeFolderFromParent(parent, folderId) {
  const index = (parent.folders || []).findIndex((folder) => folder.id === folderId);
  if (index >= 0) {
    parent.folders.splice(index, 1);
    return true;
  }
  for (const child of parent.folders || []) {
    if (removeFolderFromParent(child, folderId)) {
      return true;
    }
  }
  return false;
}

function findFolderRecursive(folder, folderId) {
  if (folder.id === folderId) {
    return folder;
  }
  for (const child of folder.folders || []) {
    const found = findFolderRecursive(child, folderId);
    if (found) {
      return found;
    }
  }
  return null;
}

function allRequestNames(collection) {
  const names = [...(collection.requests || []).map((request) => request.name)];
  for (const folder of collection.folders || []) {
    collectFolderRequestNames(folder, names);
  }
  return names;
}

function allFolderNames(collection) {
  const names = [];
  for (const folder of collection.folders || []) {
    collectFolderNames(folder, names);
  }
  return names;
}

function collectFolderNames(folder, names) {
  names.push(folder.name);
  for (const child of folder.folders || []) {
    collectFolderNames(child, names);
  }
}

function collectFolderRequestNames(folder, names) {
  names.push(...(folder.requests || []).map((request) => request.name));
  for (const child of folder.folders || []) {
    collectFolderRequestNames(child, names);
  }
}

function uniqueName(baseName, existingNames) {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (existingNames.includes(`${baseName} ${suffix}`)) {
    suffix++;
  }
  return `${baseName} ${suffix}`;
}

function activateTab(groupName, tabName) {
  const panelIds = TAB_PANEL_IDS[groupName] || [];
  for (const button of document.querySelectorAll(`.tab[data-tab-group="${groupName}"]`)) {
    if (button.dataset.tab) {
      button.classList.toggle('active', button.dataset.tab === tabName);
    }
  }
  for (const panelId of panelIds) {
    const panel = $(panelId);
    panel.classList.toggle('active', panel.id === `${tabName}Tab`);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(message) {
  lastStatusMessage = String(message || '');
}

function notifyUser(title, message) {
  const notification = {
    title: String(title || 'PostMeter'),
    message: String(message || '')
  };
  lastUserNotification = notification;
  if (typeof window.__postmeterNotifyUser === 'function') {
    window.__postmeterNotifyUser(notification);
    return;
  }
  if (isAutomatedUiSmoke()) {
    return;
  }
  window.alert(`${notification.title}\n\n${notification.message}`);
}

function isAutomatedUiSmoke() {
  const params = new URLSearchParams(window.location.search);
  return params.get('uiWorkflowSmoke') === '1'
    || params.get('uiRegressionSmoke') === '1'
    || params.get('uiSnapshotSmoke') === '1'
    || params.get('uiOauthSmoke') === '1';
}

function loadAllowedHostsForRequest(request) {
  const hosts = $('loadAllowedHosts').value
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (hosts.length) {
    return hosts;
  }
  const host = hostFromRawUrl(request.url);
  if (host) {
    $('loadAllowedHosts').value = host;
    return [host];
  }
  return [];
}

function hostFromRawUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return '';
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
